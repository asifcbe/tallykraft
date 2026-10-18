import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Box, Typography, IconButton, Tooltip, TextField, Switch, Button, Divider, alpha,
} from '@mui/material';
import {
  Trash2, Copy, Undo2, Redo2, ZoomIn, ZoomOut, Maximize, Magnet, Grid3x3, Eye, EyeOff,
  AlignLeft, AlignCenter, AlignRight, AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal, Bold, Italic, Strikethrough,
  ArrowUp, ArrowDown, RotateCcw, Type,
} from 'lucide-react';
import { PX_PER_MM, clamp, round1 } from './labelDesignerUtils';

/* ───────────────────────────── Editor ───────────────────────────── */

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const HANDLE_POS = {
  nw: { left: 0, top: 0, cursor: 'nwse-resize' }, n: { left: '50%', top: 0, cursor: 'ns-resize' },
  ne: { left: '100%', top: 0, cursor: 'nesw-resize' }, e: { left: '100%', top: '50%', cursor: 'ew-resize' },
  se: { left: '100%', top: '100%', cursor: 'nwse-resize' }, s: { left: '50%', top: '100%', cursor: 'ns-resize' },
  sw: { left: 0, top: '100%', cursor: 'nesw-resize' }, w: { left: 0, top: '50%', cursor: 'ew-resize' },
};
const SNAP = 1.2; // % distance at which edges/centres snap together
const MIN = 2;    // % minimum element size


const Section = ({ title, children }) => (
  <Box sx={{ mb: 1.75 }}>
    <Typography sx={{ fontSize: '0.64rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.75 }}>{title}</Typography>
    {children}
  </Box>
);

const ToolBtn = ({ title, onClick, disabled, active, children, color }) => (
  <Tooltip title={title}>
    <span>
      <IconButton size="small" onClick={onClick} disabled={disabled}
        sx={{ borderRadius: '6px', color: active ? color : 'text.secondary', bgcolor: active ? alpha(color, 0.12) : 'transparent', '&:hover': { bgcolor: alpha(color, 0.08) } }}>
        {children}
      </IconButton>
    </span>
  </Tooltip>
);

const NumField = ({ label, value, onChange, step = 0.5, min, max, suffix }) => (
  <TextField
    size="small" type="number" label={label} value={value}
    onChange={(e) => { const v = e.target.value; if (v === '') return; const n = Number(v); if (!Number.isNaN(n)) onChange(n); }}
    slotProps={{ htmlInput: { step, min, max }, input: suffix ? { endAdornment: <Typography sx={{ fontSize: '0.7rem', color: 'text.disabled', ml: 0.5 }}>{suffix}</Typography> } : undefined }}
    sx={{ '& .MuiInputBase-input': { fontSize: '0.8rem', py: 0.75 } }}
  />
);

// Generic free-form canvas editor shared by the label designer and the bill
// designer. Everything type-specific comes in through `spec`:
//   catalog     [{ type, label, group, icon, kind: 'text'|'block'|'code'|'shape'|'image', square, hint }]
//   newElement  (type) => element with defaults
//   renderCanvas({ elements, scale }) => the real, scaled render of the area
//   defaultColor  colour shown in the picker when an element has none
export const FreeformDesigner = ({ widthMm, heightMm, layout, onChange, spec, primary = '#5c1f22', onResetTemplate, resetLabel = 'Start from template', maxCanvasHeight = 360 }) => {
  const meta = (type) => spec.catalog.find((t) => t.type === type) || { type, label: type, kind: 'text' };
  const typeLabel = (type) => meta(type).label;
  const kindOf = (type) => meta(type).kind;
  const newElement = spec.newElement;
  const elements = useMemo(() => layout?.elements || [], [layout]);
  const wPx = widthMm * PX_PER_MM;
  const hPx = heightMm * PX_PER_MM;

  const [selectedId, setSelectedId] = useState(null);
  const [zoomMul, setZoomMul] = useState(1);
  const [snapOn, setSnapOn] = useState(true);
  const [gridOn, setGridOn] = useState(true);
  const [guides, setGuides] = useState({ v: [], h: [] });
  const [fitWidth, setFitWidth] = useState(520);
  const stageWrapRef = useRef(null);
  const stageRef = useRef(null);
  const dragRef = useRef(null);
  const undoRef = useRef([]);
  const redoRef = useRef([]);
  const [, forceHistory] = useState(0);

  // Fit the label to the available canvas width (and a sane height).
  useEffect(() => {
    const el = stageWrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setFitWidth(el.clientWidth));
    ro.observe(el);
    setFitWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const fitZoom = Math.max(0.2, Math.min((fitWidth - 48) / wPx, maxCanvasHeight / hPx));
  const zoom = fitZoom * zoomMul;

  const selected = elements.find((e) => e.id === selectedId) || null;

  /* history */
  const pushHistory = useCallback((snapshot) => {
    undoRef.current = [...undoRef.current.slice(-59), snapshot];
    redoRef.current = [];
    forceHistory((n) => n + 1);
  }, []);
  const commit = (next, { history = true } = {}) => {
    if (history) pushHistory(elements);
    onChange({ ...(layout || {}), elements: next });
  };
  const undo = () => {
    const prev = undoRef.current.pop();
    if (!prev) return;
    redoRef.current.push(elements);
    onChange({ ...(layout || {}), elements: prev });
    forceHistory((n) => n + 1);
  };
  const redo = () => {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(elements);
    onChange({ ...(layout || {}), elements: next });
    forceHistory((n) => n + 1);
  };

  const updateEl = (id, patch, opts) => commit(elements.map((e) => (e.id === id ? { ...e, ...patch } : e)), opts);
  const removeEl = (id) => { commit(elements.filter((e) => e.id !== id)); setSelectedId(null); };
  const duplicateEl = (id) => {
    const src = elements.find((e) => e.id === id);
    if (!src) return;
    const copy = { ...newElement(src.type), ...src, id: newElement(src.type).id, x: clamp(src.x + 3, 0, 100 - src.w), y: clamp(src.y + 3, 0, 100 - src.h) };
    commit([...elements, copy]);
    setSelectedId(copy.id);
  };
  const addEl = (type) => {
    let el = newElement(type);
    // Square elements (QR codes) start square in real millimetres.
    if (meta(type).square) {
      const side = Math.min(widthMm, heightMm) * 0.6;
      el = { ...el, w: round1((side / widthMm) * 100), h: round1((side / heightMm) * 100) };
    }
    // New elements drop into the middle of the label, not a fixed corner.
    if (type !== 'box') el = { ...el, x: round1((100 - el.w) / 2), y: round1((100 - el.h) / 2) };
    commit([...elements, el]);
    setSelectedId(el.id);
    stageWrapRef.current?.focus();
  };
  const reorder = (id, dir) => {
    const i = elements.findIndex((e) => e.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= elements.length) return;
    const next = [...elements];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };
  const alignTo = (edge) => {
    if (!selected) return;
    const p = {};
    if (edge === 'left') p.x = 0;
    if (edge === 'hcenter') p.x = round1((100 - selected.w) / 2);
    if (edge === 'right') p.x = round1(100 - selected.w);
    if (edge === 'top') p.y = 0;
    if (edge === 'vcenter') p.y = round1((100 - selected.h) / 2);
    if (edge === 'bottom') p.y = round1(100 - selected.h);
    updateEl(selected.id, p);
  };

  /* drag / resize with snapping */
  const snapAxis = (edges, targets) => {
    // edges: [{ val, kind }] candidate positions of the moving box; returns { delta, line }
    let best = null;
    for (const e of edges) {
      for (const t of targets) {
        const d = t - e;
        if (Math.abs(d) <= SNAP && (!best || Math.abs(d) < Math.abs(best.delta))) best = { delta: d, line: t };
      }
    }
    return best;
  };

  const onPointerDown = (e, el, handle) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(el.id);
    stageWrapRef.current?.focus();
    dragRef.current = { id: el.id, handle, sx: e.clientX, sy: e.clientY, start: { ...el }, snapshot: elements, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = ((e.clientX - d.sx) / (wPx * zoom)) * 100;
    const dy = ((e.clientY - d.sy) / (hPx * zoom)) * 100;
    if (!d.moved && Math.abs(dx) < 0.2 && Math.abs(dy) < 0.2) return;
    d.moved = true;
    let { x, y, w, h } = d.start;
    const hd = d.handle;
    if (hd === 'move') { x += dx; y += dy; } else {
      if (hd.includes('e')) w += dx;
      if (hd.includes('s')) h += dy;
      if (hd.includes('w')) { x += dx; w -= dx; }
      if (hd.includes('n')) { y += dy; h -= dy; }
      // keep square elements square in real millimetres when resizing from a corner
      if (meta(d.start.type).square && hd.length === 2) {
        const side = Math.max((w / 100) * widthMm, (h / 100) * heightMm);
        const nw = (side / widthMm) * 100;
        const nh = (side / heightMm) * 100;
        if (hd.includes('w')) x = d.start.x + d.start.w - nw;
        if (hd.includes('n')) y = d.start.y + d.start.h - nh;
        w = nw; h = nh;
      }
      w = Math.max(MIN, w); h = Math.max(MIN, h);
    }

    const vLines = []; const hLines = [];
    if (snapOn) {
      const others = elements.filter((o) => o.id !== d.id && !o.hidden);
      const tx = [0, 50, 100, ...others.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])];
      const ty = [0, 50, 100, ...others.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h])];
      if (hd === 'move') {
        const sx = snapAxis([x, x + w / 2, x + w], tx);
        if (sx) { x += sx.delta; vLines.push(sx.line); } else x = Math.round(x * 2) / 2;
        const sy = snapAxis([y, y + h / 2, y + h], ty);
        if (sy) { y += sy.delta; hLines.push(sy.line); } else y = Math.round(y * 2) / 2;
      } else {
        if (hd.includes('e')) { const s = snapAxis([x + w], tx); if (s) { w += s.delta; vLines.push(s.line); } }
        if (hd.includes('w')) { const s = snapAxis([x], tx); if (s) { x += s.delta; w -= s.delta; vLines.push(s.line); } }
        if (hd.includes('s')) { const s = snapAxis([y + h], ty); if (s) { h += s.delta; hLines.push(s.line); } }
        if (hd.includes('n')) { const s = snapAxis([y], ty); if (s) { y += s.delta; h -= s.delta; hLines.push(s.line); } }
      }
    }
    x = clamp(x, 0, 100 - Math.min(w, 100)); y = clamp(y, 0, 100 - Math.min(h, 100));
    w = clamp(w, MIN, 100 - x); h = clamp(h, MIN, 100 - y);
    setGuides({ v: vLines, h: hLines });
    onChange({ ...(layout || {}), elements: elements.map((o) => (o.id === d.id ? { ...o, x: round1(x), y: round1(y), w: round1(w), h: round1(h) } : o)) });
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    if (d?.moved) pushHistory(d.snapshot);
    dragRef.current = null;
    setGuides({ v: [], h: [] });
  };

  const onKeyDown = (e) => {
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (!selected) return;
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateEl(selected.id); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeEl(selected.id); return; }
    if (e.key === 'Escape') { setSelectedId(null); return; }
    const step = e.shiftKey ? 2.5 : 0.5;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      const [mx, my] = moves[e.key];
      updateEl(selected.id, { x: round1(clamp(selected.x + mx, 0, 100 - selected.w)), y: round1(clamp(selected.y + my, 0, 100 - selected.h)) });
    }
  };

  /* mm <-> % helpers for the properties panel */
  const toMm = (pct, axis) => round1((pct / 100) * (axis === 'x' ? widthMm : heightMm));
  const fromMm = (mm, axis) => (mm / (axis === 'x' ? widthMm : heightMm)) * 100;

  const groups = spec.catalog.reduce((acc, t) => { (acc[t.group] ||= []).push(t); return acc; }, {});

  /* ── render ── */
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '240px minmax(0,1fr) 250px' }, gap: 1.5, alignItems: 'start' }}>
      {/* Layers */}
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.25, order: { xs: 2, lg: 1 } }}>
        <Typography sx={{ fontSize: '0.64rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.75 }}>
          Add element
        </Typography>
        {Object.entries(groups).map(([g, list]) => (
          <Box key={g} sx={{ mb: 1 }}>
            <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.4 }}>{g}</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
              {list.map((t) => {
                const Icon = t.icon || Type;
                const used = elements.some((e) => e.type === t.type);
                return (
                  <Tooltip key={t.type} title={`Add ${t.label}`}>
                    <Box role="button" tabIndex={0} onClick={() => addEl(t.type)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addEl(t.type); } }}
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 0.75, py: 0.5, borderRadius: '6px', cursor: 'pointer', minWidth: 0,
                        border: '1px solid', borderColor: used ? alpha(primary, 0.3) : 'divider', bgcolor: used ? alpha(primary, 0.05) : 'transparent',
                        color: used ? primary : 'text.secondary', transition: 'all 0.12s',
                        '&:hover': { borderColor: primary, color: primary, bgcolor: alpha(primary, 0.08) } }}>
                      <Icon size={12} style={{ flexShrink: 0 }} />
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, lineHeight: 1.15 }}>{t.label}</Typography>
                    </Box>
                  </Tooltip>
                );
              })}
            </Box>
          </Box>
        ))}
        <Divider sx={{ my: 1.25 }} />
        <Typography sx={{ fontSize: '0.64rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.5 }}>
          Layers ({elements.length})
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, maxHeight: 360, overflowY: 'auto' }}>
          {[...elements].reverse().map((el) => {
            const sel = el.id === selectedId;
            const Icon = meta(el.type).icon || Type;
            return (
              <Box key={el.id} onClick={() => { setSelectedId(el.id); stageWrapRef.current?.focus(); }}
                sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 0.75, py: 0.4, borderRadius: '6px', cursor: 'pointer',
                  bgcolor: sel ? alpha(primary, 0.1) : 'transparent', color: sel ? primary : 'text.primary', opacity: el.hidden ? 0.45 : 1,
                  '&:hover': { bgcolor: sel ? alpha(primary, 0.14) : 'action.hover' } }}>
                <Icon size={13} style={{ flexShrink: 0 }} />
                <Typography noWrap sx={{ flex: 1, fontSize: '0.76rem', fontWeight: sel ? 700 : 500 }}>
                  {el.type === 'customText' ? (el.text || 'Custom Text') : typeLabel(el.type)}
                </Typography>
                <IconButton size="small" sx={{ p: 0.25 }} onClick={(e) => { e.stopPropagation(); updateEl(el.id, { hidden: !el.hidden }); }}>
                  {el.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                </IconButton>
              </Box>
            );
          })}
          {elements.length === 0 && <Typography sx={{ fontSize: '0.72rem', color: 'text.disabled', py: 1 }}>No elements yet — add one above.</Typography>}
        </Box>
        {onResetTemplate && (
          <Button fullWidth size="small" startIcon={<RotateCcw size={13} />} onClick={() => { pushHistory(elements); onResetTemplate(); setSelectedId(null); }}
            sx={{ mt: 1, textTransform: 'none', color: 'text.secondary', fontSize: '0.74rem' }}>
            {resetLabel}
          </Button>
        )}
      </Box>

      {/* Canvas */}
      <Box sx={{ order: { xs: 1, lg: 2 }, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexWrap: 'wrap', mb: 0.75, px: 0.5, py: 0.25, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <ToolBtn title="Undo (Ctrl+Z)" onClick={undo} disabled={!undoRef.current.length} color={primary}><Undo2 size={15} /></ToolBtn>
          <ToolBtn title="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!redoRef.current.length} color={primary}><Redo2 size={15} /></ToolBtn>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          <ToolBtn title="Zoom out" onClick={() => setZoomMul((z) => Math.max(0.4, round1(z - 0.2)))} color={primary}><ZoomOut size={15} /></ToolBtn>
          <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, minWidth: 38, textAlign: 'center', color: 'text.secondary' }}>{Math.round(zoomMul * 100)}%</Typography>
          <ToolBtn title="Zoom in" onClick={() => setZoomMul((z) => Math.min(4, round1(z + 0.2)))} color={primary}><ZoomIn size={15} /></ToolBtn>
          <ToolBtn title="Fit to screen" onClick={() => setZoomMul(1)} color={primary}><Maximize size={15} /></ToolBtn>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          <ToolBtn title="Snap to edges & other elements" onClick={() => setSnapOn((v) => !v)} active={snapOn} color={primary}><Magnet size={15} /></ToolBtn>
          <ToolBtn title="Show grid" onClick={() => setGridOn((v) => !v)} active={gridOn} color={primary}><Grid3x3 size={15} /></ToolBtn>
          <Box sx={{ flex: 1 }} />
          <Typography sx={{ fontSize: '0.7rem', color: 'text.disabled', pr: 0.5 }}>{widthMm} × {heightMm} mm</Typography>
        </Box>

        <Box
          ref={stageWrapRef}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerDown={() => setSelectedId(null)}
          sx={{ outline: 'none', bgcolor: '#eef0f2', borderRadius: 2, p: 3, overflow: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', minHeight: 200,
            backgroundImage: 'radial-gradient(#d5d9de 1px, transparent 1px)', backgroundSize: '14px 14px' }}
        >
          <Box ref={stageRef} data-designer-stage="" onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
            sx={{ position: 'relative', width: wPx * zoom, height: hPx * zoom, flexShrink: 0, boxShadow: '0 2px 10px rgba(0,0,0,0.15)', touchAction: 'none' }}>
            {/* the real label, scaled */}
            {spec.renderCanvas({ elements, scale: zoom })}

            {gridOn && (
              <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none',
                backgroundImage: `linear-gradient(${alpha(primary, 0.08)} 1px, transparent 1px), linear-gradient(90deg, ${alpha(primary, 0.08)} 1px, transparent 1px)`,
                backgroundSize: `${PX_PER_MM * zoom * 5}px ${PX_PER_MM * zoom * 5}px` }} />
            )}

            {/* snap guides */}
            {guides.v.map((g, i) => <Box key={`v${i}`} sx={{ position: 'absolute', top: -8, bottom: -8, left: `${g}%`, width: '1px', bgcolor: '#ec4899', pointerEvents: 'none' }} />)}
            {guides.h.map((g, i) => <Box key={`h${i}`} sx={{ position: 'absolute', left: -8, right: -8, top: `${g}%`, height: '1px', bgcolor: '#ec4899', pointerEvents: 'none' }} />)}

            {/* interaction layer */}
            {elements.map((el) => {
              if (el.hidden) return null;
              const sel = el.id === selectedId;
              return (
                <Box key={el.id}
                  onPointerDown={(e) => onPointerDown(e, el, 'move')}
                  onDoubleClick={() => { if (el.type === 'customText') document.getElementById('ld-custom-text')?.focus(); }}
                  sx={{ position: 'absolute', left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%`, height: `${el.h}%`, cursor: 'move',
                    outline: sel ? `1.5px solid ${primary}` : '1px dashed transparent',
                    '&:hover': { outline: sel ? `1.5px solid ${primary}` : `1px dashed ${alpha(primary, 0.6)}` } }}>
                  {sel && HANDLES.map((hd) => (
                    <Box key={hd} onPointerDown={(e) => onPointerDown(e, el, hd)}
                      sx={{ position: 'absolute', width: 9, height: 9, transform: 'translate(-50%,-50%)', bgcolor: '#fff', border: `1.5px solid ${primary}`, borderRadius: '2px', zIndex: 2, ...HANDLE_POS[hd] }} />
                  ))}
                  {sel && (
                    <Box sx={{ position: 'absolute', left: 0, top: -20, px: 0.6, py: 0.1, bgcolor: primary, color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: '3px', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
                      {toMm(el.w, 'x')} × {toMm(el.h, 'y')} mm
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
        </Box>
        <Typography sx={{ fontSize: '0.68rem', color: 'text.disabled', mt: 0.75, textAlign: 'center' }}>
          Drag to move · drag the handles to resize · arrow keys nudge (Shift = faster) · Delete removes · Ctrl+D duplicates
        </Typography>
      </Box>

      {/* Properties */}
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5, order: 3 }}>
        {!selected ? (
          <Box sx={{ textAlign: 'center', py: 3, color: 'text.disabled' }}>
            <Type size={22} style={{ opacity: 0.5 }} />
            <Typography sx={{ fontSize: '0.78rem', mt: 1 }}>Select an element on the canvas to edit it.</Typography>
          </Box>
        ) : (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1.5 }}>
              <Typography sx={{ flex: 1, fontWeight: 800, fontSize: '0.86rem' }} noWrap>{typeLabel(selected.type)}</Typography>
              <ToolBtn title="Bring forward" onClick={() => reorder(selected.id, 1)} color={primary}><ArrowUp size={14} /></ToolBtn>
              <ToolBtn title="Send backward" onClick={() => reorder(selected.id, -1)} color={primary}><ArrowDown size={14} /></ToolBtn>
              <ToolBtn title="Duplicate (Ctrl+D)" onClick={() => duplicateEl(selected.id)} color={primary}><Copy size={14} /></ToolBtn>
              <ToolBtn title="Delete" onClick={() => removeEl(selected.id)} color="#dc2626"><Trash2 size={14} /></ToolBtn>
            </Box>

            <Section title="Position & size (mm)">
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <NumField label="X" value={toMm(selected.x, 'x')} onChange={(v) => updateEl(selected.id, { x: round1(clamp(fromMm(v, 'x'), 0, 100 - selected.w)) })} />
                <NumField label="Y" value={toMm(selected.y, 'y')} onChange={(v) => updateEl(selected.id, { y: round1(clamp(fromMm(v, 'y'), 0, 100 - selected.h)) })} />
                <NumField label="Width" value={toMm(selected.w, 'x')} min={0.5} onChange={(v) => updateEl(selected.id, { w: round1(clamp(fromMm(v, 'x'), MIN, 100 - selected.x)) })} />
                <NumField label="Height" value={toMm(selected.h, 'y')} min={0.5} onChange={(v) => updateEl(selected.id, { h: round1(clamp(fromMm(v, 'y'), MIN, 100 - selected.y)) })} />
              </Box>
              <Box sx={{ display: 'flex', mt: 0.75, justifyContent: 'space-between' }}>
                <ToolBtn title="Align to left edge" onClick={() => alignTo('left')} color={primary}><AlignStartVertical size={15} /></ToolBtn>
                <ToolBtn title="Centre horizontally" onClick={() => alignTo('hcenter')} color={primary}><AlignCenterVertical size={15} /></ToolBtn>
                <ToolBtn title="Align to right edge" onClick={() => alignTo('right')} color={primary}><AlignEndVertical size={15} /></ToolBtn>
                <ToolBtn title="Align to top edge" onClick={() => alignTo('top')} color={primary}><AlignStartHorizontal size={15} /></ToolBtn>
                <ToolBtn title="Centre vertically" onClick={() => alignTo('vcenter')} color={primary}><AlignCenterHorizontal size={15} /></ToolBtn>
                <ToolBtn title="Align to bottom edge" onClick={() => alignTo('bottom')} color={primary}><AlignEndHorizontal size={15} /></ToolBtn>
              </Box>
            </Section>

            {(kindOf(selected.type) === 'text' || kindOf(selected.type) === 'block') && (
              <>
                {selected.type === 'customText' ? (
                  <Section title="Text">
                    <TextField id="ld-custom-text" size="small" fullWidth value={selected.text || ''} onChange={(e) => updateEl(selected.id, { text: e.target.value })}
                      sx={{ '& .MuiInputBase-input': { fontSize: '0.8rem' } }} />
                  </Section>
                ) : (
                  kindOf(selected.type) === 'text' && <Section title="Prefix (shown before the value)">
                    <TextField size="small" fullWidth placeholder="e.g. MRP " value={selected.prefix || ''} onChange={(e) => updateEl(selected.id, { prefix: e.target.value })}
                      sx={{ '& .MuiInputBase-input': { fontSize: '0.8rem' } }} />
                  </Section>
                )}
                <Section title="Font">
                  {kindOf(selected.type) === 'text' && (
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
                      <Typography sx={{ fontSize: '0.78rem' }}>Auto-fit to box</Typography>
                      <Switch size="small" checked={selected.autoFit !== false} onChange={(e) => updateEl(selected.id, { autoFit: e.target.checked })} />
                    </Box>
                  )}
                  {(() => {
                    // Font size is always editable; typing a size (or using −/+)
                    // switches Auto-fit off so the exact size is used.
                    const auto = kindOf(selected.type) === 'text' && selected.autoFit !== false;
                    const cur = Number(selected.fontSize) || 8;
                    const setSize = (v) => updateEl(selected.id, { fontSize: clamp(round1(v), 3, 96), autoFit: false });
                    return (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.75 }}>
                        <IconButton size="small" onClick={() => setSize(cur - 0.5)} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '6px', width: 30, height: 30 }}>−</IconButton>
                        <TextField size="small" type="number" label="Font size" value={auto ? '' : cur} placeholder={auto ? 'Auto' : undefined}
                          onChange={(e) => { const v = Number(e.target.value); if (e.target.value !== '' && !Number.isNaN(v)) setSize(v); }}
                          slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 0.5, min: 3, max: 96 }, input: { endAdornment: <Typography sx={{ fontSize: '0.7rem', color: 'text.disabled', ml: 0.5 }}>pt</Typography> } }}
                          sx={{ flex: 1, '& .MuiInputBase-input': { fontSize: '0.8rem', py: 0.75 } }} />
                        <IconButton size="small" onClick={() => setSize(cur + 0.5)} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '6px', width: 30, height: 30 }}>+</IconButton>
                      </Box>
                    );
                  })()}
                  <Box sx={{ display: 'flex', gap: 0.25, flexWrap: 'wrap' }}>
                    <ToolBtn title="Bold" onClick={() => updateEl(selected.id, { bold: !selected.bold })} active={!!selected.bold} color={primary}><Bold size={15} /></ToolBtn>
                    <ToolBtn title="Italic" onClick={() => updateEl(selected.id, { italic: !selected.italic })} active={!!selected.italic} color={primary}><Italic size={15} /></ToolBtn>
                    <ToolBtn title="Strike-through" onClick={() => updateEl(selected.id, { strike: !selected.strike })} active={!!selected.strike} color={primary}><Strikethrough size={15} /></ToolBtn>
                    <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
                    <ToolBtn title="Align left" onClick={() => updateEl(selected.id, { align: 'left' })} active={selected.align === 'left'} color={primary}><AlignLeft size={15} /></ToolBtn>
                    <ToolBtn title="Align centre" onClick={() => updateEl(selected.id, { align: 'center' })} active={!selected.align || selected.align === 'center'} color={primary}><AlignCenter size={15} /></ToolBtn>
                    <ToolBtn title="Align right" onClick={() => updateEl(selected.id, { align: 'right' })} active={selected.align === 'right'} color={primary}><AlignRight size={15} /></ToolBtn>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 0.5, mt: 0.75 }}>
                    {[['top', 'Top'], ['center', 'Middle'], ['bottom', 'Bottom']].map(([v, l]) => {
                      const on = (selected.vAlign || 'center') === v;
                      return (
                        <Box key={v} onClick={() => updateEl(selected.id, { vAlign: v })}
                          sx={{ flex: 1, textAlign: 'center', py: 0.4, borderRadius: '6px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700, border: '1px solid',
                            borderColor: on ? primary : 'divider', color: on ? primary : 'text.secondary', bgcolor: on ? alpha(primary, 0.08) : 'transparent' }}>
                          {l}
                        </Box>
                      );
                    })}
                  </Box>
                </Section>
              </>
            )}

            {kindOf(selected.type) === 'shape' && (
              <Section title="Stroke">
                <NumField label="Thickness" suffix="mm" step={0.1} min={0.1} value={selected.thickness ?? 0.3} onChange={(v) => updateEl(selected.id, { thickness: clamp(v, 0.1, 5) })} />
              </Section>
            )}

            {kindOf(selected.type) !== 'code' && kindOf(selected.type) !== 'image' && (
              <Section title="Colour">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <input type="color" value={selected.color || spec.defaultColor || '#000000'} onChange={(e) => updateEl(selected.id, { color: e.target.value })}
                    style={{ width: 44, height: 30, border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
                  {selected.color && (
                    <Button size="small" onClick={() => updateEl(selected.id, { color: '' })} sx={{ textTransform: 'none', fontSize: '0.72rem', color: 'text.secondary' }}>Use default colour</Button>
                  )}
                </Box>
              </Section>
            )}

            {meta(selected.type).hint && (
              <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', lineHeight: 1.5 }}>{meta(selected.type).hint}</Typography>
            )}
          </>
        )}
      </Box>
    </Box>
  );
};

export default FreeformDesigner;
