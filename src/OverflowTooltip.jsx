import React, { useEffect, useRef, useState } from 'react';
import { Popper, Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';

// App-wide "show the full text" tooltip for anything cut off with an ellipsis.
//
// Mounted ONCE at the app root. Instead of wrapping hundreds of individual
// noWrap / text-overflow:ellipsis spots in a <Tooltip> (and missing every new
// one added later), it watches the pointer: when it rests on an element whose
// text is ACTUALLY truncated right now — single-line `text-overflow: ellipsis`
// or a multi-line `-webkit-line-clamp` — it shows that element's full text.
// Text that fits shows nothing, so short labels never get a pointless tooltip.
//
// Mouse: shows after a short hover. Touch: long-press (no hover on phones).
// Skips anything that already explains itself (title / aria-label), password
// fields, and the field you're currently typing in.

const SHOW_DELAY_MS = 450;
const LONG_PRESS_MS = 450;
const MAX_ANCESTORS = 4; // pointer often lands on an inner span

const isTruncated = (el) => {
  if (!(el instanceof HTMLElement)) return false;
  const cs = window.getComputedStyle(el);
  const clamp = cs.webkitLineClamp && cs.webkitLineClamp !== 'none';
  if (clamp) return el.scrollHeight > el.clientHeight + 1;
  if (cs.textOverflow !== 'ellipsis') return false;
  return el.scrollWidth > el.clientWidth + 1;
};

const fullTextOf = (el) => {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;
  return el.innerText || el.textContent || '';
};

// Nearest truncated element at/above the pointer target, or null.
const findTruncated = (start) => {
  let el = start;
  for (let i = 0; el && i < MAX_ANCESTORS; i += 1, el = el.parentElement) {
    if (!(el instanceof HTMLElement)) continue;
    if (el.closest('[data-no-overflow-tooltip]')) return null;
    if (el instanceof HTMLInputElement && (el.type === 'password' || el === document.activeElement)) return null;
    if (el instanceof HTMLTextAreaElement && el === document.activeElement) return null;
    if (isTruncated(el)) {
      // Already has its own explanation — don't stack a second tooltip.
      if (el.getAttribute('title') || el.getAttribute('aria-label')) return null;
      const text = fullTextOf(el).replace(/\s+/g, ' ').trim();
      return text ? { el, text: text.length > 600 ? `${text.slice(0, 600)}…` : text } : null;
    }
  }
  return null;
};

export default function OverflowTooltip() {
  const theme = useTheme();
  const [tip, setTip] = useState(null); // { el, text }
  const timerRef = useRef(null);
  const currentElRef = useRef(null);

  useEffect(() => {
    const clearTimer = () => { clearTimeout(timerRef.current); timerRef.current = null; };
    const hide = () => {
      clearTimer();
      currentElRef.current = null;
      setTip(null);
    };
    const scheduleShow = (found, delay) => {
      clearTimer();
      currentElRef.current = found.el;
      timerRef.current = setTimeout(() => {
        // Still there, still truncated (it may have resized or unmounted).
        if (currentElRef.current === found.el && found.el.isConnected && isTruncated(found.el)) {
          setTip(found);
        }
      }, delay);
    };

    const onPointerOver = (e) => {
      if (e.pointerType === 'touch') return; // touch uses long-press below
      const found = findTruncated(e.target);
      if (!found) { if (currentElRef.current && !currentElRef.current.contains(e.target)) hide(); return; }
      if (found.el === currentElRef.current) return;
      setTip(null);
      scheduleShow(found, SHOW_DELAY_MS);
    };
    const onPointerOut = (e) => {
      const cur = currentElRef.current;
      if (!cur) return;
      if (e.relatedTarget instanceof Node && cur.contains(e.relatedTarget)) return;
      hide();
    };
    const onPointerDown = (e) => {
      hide();
      if (e.pointerType !== 'touch') return;
      const found = findTruncated(e.target);
      if (found) scheduleShow(found, LONG_PRESS_MS);
    };
    const onPointerUpOrCancel = (e) => {
      if (e.pointerType !== 'touch') return;
      // Released before the long-press fired → it was a normal tap.
      if (timerRef.current) hide();
      else if (currentElRef.current) setTimeout(hide, 1800);
    };

    document.addEventListener('pointerover', onPointerOver, true);
    document.addEventListener('pointerout', onPointerOut, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointerup', onPointerUpOrCancel, true);
    document.addEventListener('pointercancel', onPointerUpOrCancel, true);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('wheel', hide, { passive: true });
    window.addEventListener('keydown', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      clearTimer();
      document.removeEventListener('pointerover', onPointerOver, true);
      document.removeEventListener('pointerout', onPointerOut, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointerup', onPointerUpOrCancel, true);
      document.removeEventListener('pointercancel', onPointerUpOrCancel, true);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('wheel', hide);
      window.removeEventListener('keydown', hide, true);
      window.removeEventListener('blur', hide);
    };
  }, []);

  // Match the app's own tooltip look (theme.jsx → MuiTooltip overrides).
  const tipStyle = theme.components?.MuiTooltip?.styleOverrides?.tooltip || {};
  const bg = tipStyle.backgroundColor || '#18181b';

  return (
    <Popper
      open={!!tip && !!tip.el?.isConnected}
      anchorEl={tip?.el || null}
      placement="bottom-start"
      modifiers={[
        { name: 'offset', options: { offset: [0, 6] } },
        { name: 'flip', options: { fallbackPlacements: ['top-start', 'bottom-end', 'top-end'] } },
        { name: 'preventOverflow', options: { padding: 8 } },
      ]}
      sx={{ zIndex: 2000, pointerEvents: 'none' }}
    >
      <Box
        sx={{
          bgcolor: bg,
          color: '#fff',
          fontSize: tipStyle.fontSize || '0.6875rem',
          fontWeight: tipStyle.fontWeight || 500,
          lineHeight: 1.45,
          borderRadius: `${tipStyle.borderRadius ?? 6}px`,
          px: 1.25,
          py: 0.6,
          maxWidth: 'min(360px, calc(100vw - 16px))',
          whiteSpace: 'normal',
          overflowWrap: 'anywhere',
          boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
        }}
      >
        {tip?.text}
      </Box>
    </Popper>
  );
}
