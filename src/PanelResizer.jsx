import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { GripVertical } from 'lucide-react';

// Shared drag-to-resize for side panels (Reports report list, Settings
// sidebar, Parties/Items detail panels, Sales preview + summary, POS cart,
// Admin lists…). One hook + one handle so every panel behaves the same:
//   • drag the handle to resize   • double-click to reset to default
//   • ←/→ when the handle has focus (Shift = bigger steps)
//   • width remembered per panel on this device (localStorage)
//
// `side` is which side of the PANEL the handle sits on:
//   'right' → panel is left of the handle (dragging right grows it)
//   'left'  → panel is right of the handle (dragging left grows it)

const STORAGE_PREFIX = 'panelWidth:';

const readStored = (key) => {
  try {
    const v = Number(localStorage.getItem(STORAGE_PREFIX + key));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
};

const viewportMax = (max) => (typeof window === 'undefined' ? max : Math.min(max, Math.round(window.innerWidth * 0.6)));

export const useResizableWidth = (key, defaultWidth, { min = 160, max = 640 } = {}) => {
  const clamp = useCallback((w) => Math.round(Math.min(viewportMax(max), Math.max(min, w))), [min, max]);
  const [width, setWidthState] = useState(() => {
    const stored = readStored(key);
    return stored ? Math.round(Math.min(max, Math.max(min, stored))) : defaultWidth;
  });
  // false until the user drags/keys a size (or one was saved earlier) — lets a
  // panel keep its own responsive default width until then.
  const [customized, setCustomized] = useState(() => readStored(key) != null);
  // Optional: attach to the panel so a drag starts from its real rendered
  // width (matters when the panel was still on a responsive default).
  const panelRef = useRef(null);
  const setWidth = useCallback((w, persist = true) => {
    const next = clamp(w);
    setWidthState(next);
    setCustomized(true);
    if (persist) {
      try { localStorage.setItem(STORAGE_PREFIX + key, String(next)); } catch { /* storage unavailable */ }
    }
  }, [clamp, key]);
  const reset = useCallback(() => {
    setWidthState(defaultWidth);
    setCustomized(false);
    try { localStorage.removeItem(STORAGE_PREFIX + key); } catch { /* storage unavailable */ }
  }, [defaultWidth, key]);
  return { width, setWidth, reset, customized, panelRef, min, max: viewportMax(max), defaultWidth };
};

export const ResizeHandle = ({ panel, side = 'left', label = 'Resize panel', sx }) => {
  const { width, setWidth, reset, min, max, panelRef } = panel;
  const currentWidth = () => panelRef?.current?.offsetWidth || width;
  const dragRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const dir = side === 'right' ? 1 : -1;

  useEffect(() => () => {
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const startW = currentWidth();
    dragRef.current = { startX: e.clientX, startW, last: startW };
    setDragging(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    d.last = d.startW + (e.clientX - d.startX) * dir;
    setWidth(d.last, false);
  };
  const endDrag = () => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    setDragging(false);
    setWidth(d.last, true);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };
  const onKeyDown = (e) => {
    const step = e.shiftKey ? 48 : 16;
    if (e.key === 'ArrowLeft') { e.preventDefault(); setWidth(currentWidth() - step * dir); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); setWidth(currentWidth() + step * dir); }
    else if (e.key === 'Home') { e.preventDefault(); setWidth(min); }
    else if (e.key === 'End') { e.preventDefault(); setWidth(max); }
  };

  return (
    <Box
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={reset}
      onKeyDown={onKeyDown}
      sx={{
        display: { xs: 'none', md: 'flex' },
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        alignSelf: 'stretch',
        flexShrink: 0,
        width: 14,
        mx: '-7px',
        cursor: 'col-resize',
        position: 'relative',
        zIndex: 2,
        touchAction: 'none',
        outline: 'none',
        // Thin guide line down the full edge — shows on hover / focus / drag.
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: dragging ? 3 : 2,
          borderRadius: 2,
          bgcolor: dragging ? 'primary.main' : 'transparent',
          transition: 'background-color 0.15s',
        },
        '&:hover::before, &:focus-visible::before': { bgcolor: 'primary.main', opacity: dragging ? 1 : 0.45 },
        '&:hover .rz-grip, &:focus-visible .rz-grip': { borderColor: 'primary.main', color: 'primary.main', boxShadow: '0 2px 6px rgba(0,0,0,0.12)' },
        ...sx,
      }}
    >
      {/* Always-visible grip so it's obvious the edge can be dragged. Sticky
          (top AND bottom) keeps it on screen while a tall panel scrolls. */}
      <Box
        className="rz-grip"
        aria-hidden
        sx={{
          position: 'sticky',
          top: 120,
          bottom: 120,
          zIndex: 1,
          width: 12,
          height: 30,
          borderRadius: '6px',
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: dragging ? 'primary.main' : 'divider',
          color: dragging ? 'primary.main' : 'text.secondary',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'border-color 0.15s, color 0.15s, box-shadow 0.15s',
          pointerEvents: 'none',
        }}
      >
        <GripVertical size={12} strokeWidth={2.5} />
      </Box>
    </Box>
  );
};
