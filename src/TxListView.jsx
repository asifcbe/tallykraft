import React, { useEffect, useState, useMemo, useRef, useLayoutEffect } from 'react';
import {
  Box, Card, Typography, Checkbox, IconButton, Chip, Tooltip,
  TablePagination, useTheme, useMediaQuery, alpha, Dialog,
  ToggleButtonGroup, ToggleButton, Menu, MenuItem,
} from '@mui/material';
import { Edit, Eye, Share2, Printer, X, List as ListIcon, LayoutGrid, ArrowUpDown, ArrowRightLeft, ReceiptText } from 'lucide-react';
import TxDataTable from './TxDataTable';
import { txSortKey, formatCreatedTime } from './txTimeUtils';

// Remembers the last-picked view mode per section (e.g. "estimates", "sales")
// so switching tabs/reloading doesn't reset it back to the default.
const VIEW_MODE_KEY = 'tallykraft_tx_view_mode';
export const loadViewMode = (sectionKey, fallback = 'list') => {
  try {
    const all = JSON.parse(localStorage.getItem(VIEW_MODE_KEY) || '{}');
    return all[sectionKey] || fallback;
  } catch { return fallback; }
};
export const saveViewMode = (sectionKey, mode) => {
  try {
    const all = JSON.parse(localStorage.getItem(VIEW_MODE_KEY) || '{}');
    all[sectionKey] = mode;
    localStorage.setItem(VIEW_MODE_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
};

// Measures how much viewport height is left below a container's top edge and
// returns a CSS height string that fills exactly that — so a master-detail
// list can occupy all remaining space with ONE scroll region (the list
// itself), instead of guessing a hardcoded "calc(100vh - Npx)" offset that
// silently breaks (causing a second, outer page scroll) whenever anything
// above the list changes height. Falls back to `fallbackPx` (a large usable
// default) before the first measurement or when the ref isn't mounted yet.
export const useFillHeight = (ref, { bottomGap = 16, fallbackPx = 500 } = {}) => {
  const [height, setHeight] = useState(fallbackPx);

  useLayoutEffect(() => {
    const measure = () => {
      const el = ref.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const available = Math.max(280, window.innerHeight - top - bottomGap);
      setHeight((prev) => (Math.abs(prev - available) > 1 ? available : prev));
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro && ref.current) ro.observe(document.body);
    window.addEventListener('resize', measure);
    // Re-measure shortly after mount too — layout (fonts, images, tab
    // transitions) can settle a frame or two after the first paint.
    const t = setTimeout(measure, 150);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', measure);
      clearTimeout(t);
    };
  }, [ref, bottomGap]);

  return height;
};

// Small reusable List/Grid switcher — icon pills matching the app's toggle style.
export const ViewModeToggle = ({ value, onChange, tokens }) => (
  <ToggleButtonGroup
    value={value}
    exclusive
    size="small"
    onChange={(_e, v) => v && onChange(v)}
    sx={{
      '& .MuiToggleButton-root': {
        px: 1, py: 0.4, border: '1px solid rgba(0,0,0,0.1)',
        color: 'text.secondary',
        '&.Mui-selected': { bgcolor: tokens?.primarySoft || 'action.selected', color: tokens?.primary, '&:hover': { bgcolor: tokens?.primarySoft } },
      },
    }}
  >
    <ToggleButton value="list" aria-label="List view"><Tooltip title="List view"><ListIcon size={15} /></Tooltip></ToggleButton>
    <ToggleButton value="grid" aria-label="Grid view"><Tooltip title="Grid view"><LayoutGrid size={15} /></Tooltip></ToggleButton>
  </ToggleButtonGroup>
);

// Scales a fixed-width document (e.g. an A4 invoice) down so it always fits the
// available width — zoomed out on small screens, never overflowing/clipping.
export const FitPreview = ({ children }) => {
  const outerRef = useRef(null);
  const innerRef = useRef(null);
  const [{ scale, naturalH }, setFit] = useState({ scale: 1, naturalH: 0 });

  useLayoutEffect(() => {
    const measure = () => {
      const avail = outerRef.current?.clientWidth || 0;
      const child = innerRef.current?.firstElementChild;
      const natural = child?.offsetWidth || 0;
      const h = child?.offsetHeight || 0;
      if (avail && natural) {
        const nextScale = Math.min(1, avail / natural);
        // Only update when something actually changed — otherwise the resulting
        // re-render/layout retriggers the ResizeObserver and we loop forever.
        setFit(prev =>
          prev.scale === nextScale && prev.naturalH === h
            ? prev
            : { scale: nextScale, naturalH: h }
        );
      }
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro && outerRef.current) ro.observe(outerRef.current);
    window.addEventListener('resize', measure);
    return () => { if (ro) ro.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  return (
    <Box ref={outerRef} sx={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
      <Box
        ref={innerRef}
        sx={{
          filter: 'drop-shadow(0 8px 32px rgba(0,0,0,0.16))',
          transform: `scale(${scale})`,
          transformOrigin: 'top center',
          // collapse the empty space left by the shrunk (scaled) element
          mb: `${(scale - 1) * naturalH}px`,
        }}
      >
        {children}
      </Box>
    </Box>
  );
};

// Shared theme tokens — identical shape to the Sales/Purchase helper so every
// section gets the same look.
export const getThemeTokens = (theme) => {
  const primary = theme.palette.primary.main;
  const primaryLight = theme.palette.primary.light || primary;
  const primaryDark = theme.palette.primary.dark || primary;
  const success = theme.palette.success.main;
  const baseRadius = Number(theme.shape?.borderRadius) || 8;
  return {
    primary, primaryLight, primaryDark,
    primarySoft: alpha(primary, 0.08),
    primaryBorder: alpha(primary, 0.18),
    success,
    successSoft: alpha(success, 0.08),
    error: theme.palette.error.main,
    warning: theme.palette.warning.main,
    radius: {
      sm: `${baseRadius}px`, md: `${baseRadius + 4}px`,
      lg: `${baseRadius + 8}px`, xl: `${baseRadius + 12}px`,
    },
    shadow: {
      card: theme.shadows[1], cardHover: theme.shadows[4],
      btn: `0 4px 12px ${alpha(primary, 0.28)}`,
      btnHover: `0 6px 20px ${alpha(primary, 0.38)}`,
    },
  };
};

const fmtDate = (d) => {
  if (!d) return '';
  // Accept ISO yyyy-mm-dd or anything Date can parse.
  const dt = new Date((d.length === 10 ? d + 'T00:00:00' : d));
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

// Small green "Converted" status chip shown in place of the Convert action
// once a record has already been converted to a sale — clickable to jump
// straight to that sale (same visual language as Orders.jsx's equivalent).
const ConvertedChip = ({ label, onClick, size = 'small' }) => (
  <Tooltip title={label}>
    <Chip
      size={size}
      icon={<ReceiptText size={size === 'small' ? 13 : 12} />}
      label={label}
      onClick={onClick}
      sx={{
        fontWeight: 700, fontSize: size === 'small' ? '0.68rem' : '0.62rem',
        bgcolor: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0',
        cursor: onClick ? 'pointer' : 'default',
        '& .MuiChip-icon': { color: '#15803d' },
      }}
    />
  </Tooltip>
);

/**
 * A reusable master-detail list (mobile cards + desktop side preview + sticky
 * internal scroll) matching the Sales/Purchase section.
 *
 * Props:
 *  - records: array (already filtered + sorted, newest first)
 *  - accessors: { id, number, party, amount, date, dueDate, isCash } functions
 *  - labelSingular / labelPlural: e.g. "estimate" / "estimates"
 *  - emptyIcon: node, emptyAction: node (e.g. a "New" button)
 *  - onEdit(record), onDelete(record), onShare(record?) — handlers (optional)
 *  - onPrint(record) — optional; shows a Print action in the preview header
 *  - onConvert(record) / convertLabel / convertIcon — optional; adds a
 *    "Convert to Sale"-style action to the preview header and the row "more"
 *    menu (e.g. Estimates → Sale)
 *  - isConverted(record) / convertedLabel(record) / onViewConverted(record)
 *    — optional; when isConverted(record) is true, the Convert action is
 *    replaced everywhere (preview header, row menu, cards) with a
 *    "Converted" chip instead — clicking it calls onViewConverted(record)
 *  - openRecordId / onOpenRecordHandled() — optional; when openRecordId
 *    matches a record's id, that record's preview opens automatically (used
 *    for cross-tab deep-links, e.g. Sales.jsx's "From Estimate" chip jumping
 *    straight to that estimate here). Call onOpenRecordHandled() once
 *    consumed so the parent can clear it back to null.
 *  - renderPreview(record): node — the document preview (e.g. <InvoiceTemplate/>)
 *  - selectable: bool — show bulk-select checkboxes (default false)
 *  - selectedIds / setSelectedIds — Set + setter when selectable
 */
const TxListView = ({
  records,
  accessors = {},
  labelSingular = 'record',
  labelPlural = 'records',
  emptyIcon = null,
  emptyAction = null,
  onEdit,
  onDelete,
  onShare,
  onPrint,
  onConvert,
  convertLabel = 'Convert to Sale',
  convertIcon,
  isConverted,
  convertedLabel,
  onViewConverted,
  openRecordId,
  onOpenRecordHandled,
  renderPreview,
  selectable = false,
  selectedIds,
  setSelectedIds,
}) => {
  const theme = useTheme();
  const tokens = useMemo(() => getThemeTokens(theme), [theme]);
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const containerRef = useRef(null);
  const fillHeight = useFillHeight(containerRef, { bottomGap: 16, fallbackPx: 500 });

  const a = {
    id: (r) => r.id,
    number: (r) => r.invoiceNumber || r.number || '',
    party: (r) => r.partyName || '',
    amount: (r) => Number(r.totalAmount ?? r.total ?? 0),
    date: (r) => r.date,
    dueDate: (r) => r.dueDate,
    isCash: (r) => !r.partyId,
    ...accessors,
  };

  const [page, setPage] = useState(0);
  const [viewMode, setViewMode] = useState(() => loadViewMode(labelPlural));
  // Grid tiles are much smaller than list rows, so a wide screen can fit many
  // more of them per page — default higher in grid mode so the extra space
  // grid view exists to use is actually filled instead of leaving a couple
  // of rows of tiles floating above empty whitespace.
  const [rowsPerPage, setRowsPerPage] = useState(() => viewMode === 'grid' ? 30 : 10);
  const changeViewMode = (mode) => {
    setViewMode(mode);
    saveViewMode(labelPlural, mode);
    setRowsPerPage(mode === 'grid' ? 30 : 10);
    setPage(0);
  };
  const [selectedRec, setSelectedRec] = useState(null);
  const closePreview = () => setSelectedRec(null);
  const selectRec = (r) => setSelectedRec(r);

  // External deep-link — opens a specific record's preview when the parent
  // sets openRecordId (e.g. from a cross-tab hand-off event). Only fires
  // once the matching record is actually present in `records` (so a retry-
  // based dispatch, per quickNewBridge.js's convention, can still succeed
  // once data loads) and reports back via onOpenRecordHandled so the parent
  // clears openRecordId instead of re-opening it on every render.
  useEffect(() => {
    if (!openRecordId) return;
    const rec = records.find((r) => a.id(r) === openRecordId);
    if (rec) { setSelectedRec(rec); onOpenRecordHandled?.(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRecordId, records]);

  // Quick date-range preset + sort — same header controls as Sales/Purchases,
  // applied here so every section built on TxListView gets them for free.
  const [datePreset, setDatePreset] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [sortMenuAnchor, setSortMenuAnchor] = useState(null);

  const filteredRecords = useMemo(() => {
    let list = records;
    if (datePreset !== 'all') {
      const now = new Date();
      const toISO = (d) => d.toISOString().split('T')[0];
      let from;
      if (datePreset === 'today') from = toISO(now);
      else if (datePreset === 'week') { const day = now.getDay() || 7; const monday = new Date(now); monday.setDate(now.getDate() - day + 1); from = toISO(monday); }
      else if (datePreset === 'month') from = toISO(new Date(now.getFullYear(), now.getMonth(), 1));
      else if (datePreset === 'year') from = toISO(new Date(now.getFullYear(), 0, 1));
      const to = toISO(now);
      list = list.filter((r) => { const d = a.date(r); return d && d >= from && d <= to; });
    }
    return [...list].sort((x, y) => {
      let cmp = 0;
      if (sortBy === 'amount') cmp = a.amount(x) - a.amount(y);
      else if (sortBy === 'party') cmp = (a.party(x) || '').localeCompare(a.party(y) || '', undefined, { numeric: true, sensitivity: 'base' });
      else if (sortBy === 'number') cmp = String(a.number(x) || '').localeCompare(String(a.number(y) || ''), undefined, { numeric: true, sensitivity: 'base' });
      else {
        // Plain string comparison on doc numbers like "INV-0001" breaks once
        // the serial exceeds the zero-padding width (e.g. "INV-10000" sorts
        // before "INV-9999" char-by-char) — { numeric: true } parses embedded
        // digit runs as actual numbers instead. Same-date records also fall
        // back to this so they come out in creation-sequence order instead
        // of whatever order the underlying array happened to have.
        cmp = new Date(a.date(x)) - new Date(a.date(y));
        if (cmp === 0) cmp = txSortKey(x) - txSortKey(y);
        if (cmp === 0) cmp = String(a.number(x) || '').localeCompare(String(a.number(y) || ''), undefined, { numeric: true, sensitivity: 'base' });
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [records, datePreset, sortBy, sortDir]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasPreview = typeof renderPreview === 'function';

  // Keep selection in sync with live data; drop if removed.
  useEffect(() => {
    if (!selectedRec) return;
    const live = records.find((r) => a.id(r) === a.id(selectedRec));
    if (!live) setSelectedRec(null);
    else if (live !== selectedRec) setSelectedRec(live);
  }, [records]); // eslint-disable-line react-hooks/exhaustive-deps

  // No auto-selected/default preview — the preview only opens when the user
  // explicitly clicks the eye icon (TxDataTable in list mode, or the eye
  // button on a grid tile / mobile card).

  // Reset to page 1 whenever the filtered/sorted result set changes shape.
  useEffect(() => { setPage(0); }, [datePreset, sortBy, sortDir, records.length]);

  // Preview always opens as a popup dialog on desktop (both list and grid
  // mode) — the eye icon is the only way to open it, so a side-by-side
  // master-detail layout no longer applies.
  const showPreviewDialog = hasPreview && !isMobile && selectedRec;
  const pageRecords = filteredRecords.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  // Preview header + body — reused by the desktop side-pane and the mobile dialog.
  const previewInner = selectedRec ? (
    <>
      <Box
        sx={{
          background: `linear-gradient(135deg, ${tokens.primaryDark} 0%, ${tokens.primaryLight} 100%)`,
          px: 2.5, py: 1.75,
          display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.72)', fontWeight: 700, fontSize: '0.62rem', letterSpacing: '0.1em', lineHeight: 1 }}>
            {labelSingular.charAt(0).toUpperCase() + labelSingular.slice(1)} Preview
          </Typography>
          <Typography variant="h6" sx={{ color: 'white', fontWeight: 800, fontSize: '1rem', fontFamily: 'monospace', lineHeight: 1.2 }} noWrap>
            {a.number(selectedRec)}
          </Typography>
        </Box>
        {onEdit && (
          <Tooltip title="Edit">
            <IconButton size="small" onClick={() => onEdit(selectedRec)} sx={{ color: 'white', bgcolor: 'rgba(255,255,255,0.14)', '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' } }}>
              <Edit size={16} />
            </IconButton>
          </Tooltip>
        )}
        {onConvert && (
          isConverted?.(selectedRec) ? (
            <ConvertedChip
              label={convertedLabel?.(selectedRec) || 'Converted'}
              onClick={onViewConverted ? () => { const rec = selectedRec; closePreview(); onViewConverted(rec); } : undefined}
            />
          ) : (
            <Tooltip title={convertLabel}>
              <IconButton size="small" onClick={() => { const rec = selectedRec; closePreview(); onConvert(rec); }} sx={{ color: 'white', bgcolor: 'rgba(255,255,255,0.14)', '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' } }}>
                {convertIcon || <ArrowRightLeft size={16} />}
              </IconButton>
            </Tooltip>
          )
        )}
        {onShare && (
          <Tooltip title="Share on WhatsApp">
            <IconButton size="small" onClick={() => onShare(selectedRec)} sx={{ color: 'white', bgcolor: 'rgba(255,255,255,0.14)', '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' } }}>
              <Share2 size={16} />
            </IconButton>
          </Tooltip>
        )}
        {onPrint && (
          <Tooltip title="Print">
            <IconButton size="small" onClick={() => onPrint(selectedRec)} sx={{ color: 'white', bgcolor: 'rgba(255,255,255,0.14)', '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' } }}>
              <Printer size={16} />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="Close preview">
          <IconButton size="small" onClick={() => closePreview()} sx={{ color: 'rgba(255,255,255,0.8)', '&:hover': { color: 'white', bgcolor: 'rgba(255,255,255,0.12)' } }}>
            <X size={16} />
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', bgcolor: '#e8eaed', p: 2 }}>
        <FitPreview>{renderPreview(selectedRec)}</FitPreview>
      </Box>
    </>
  ) : null;

  return (
    <Box
      ref={containerRef}
      sx={{
        display: 'flex',
        gap: 2,
        alignItems: 'stretch',
        // Measured to exactly fill the remaining viewport (see useFillHeight)
        // so the list scrolls internally with no second, outer page scroll.
        height: { md: `${fillHeight}px` },
        minHeight: { md: 360 },
      }}
    >
      {/* LEFT: card list — preview opens as a popup dialog, so this never
          narrows to make room for a side panel. */}
      <Card
        elevation={0}
        sx={{
          borderRadius: tokens.radius.lg,
          border: '1px solid rgba(0,0,0,0.07)',
          overflow: 'hidden',
          boxShadow: tokens.shadow.card,
          width: '100%',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        {records.length === 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, py: 8, px: 2 }}>
            {emptyIcon && <Box sx={{ p: 2, borderRadius: '50%', bgcolor: tokens.primarySoft }}>{emptyIcon}</Box>}
            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'text.secondary' }}>
              No {labelPlural} yet
            </Typography>
            {emptyAction}
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
            {/* Quick filters: date preset + sort — grid mode only; list mode
                uses TxDataTable's own per-column filters/sort instead. */}
            {viewMode === 'grid' && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1.75, pt: 1, pb: 0.75, flexWrap: 'wrap', borderBottom: '1px solid rgba(0,0,0,0.06)', bgcolor: 'rgba(0,0,0,0.015)', flexShrink: 0 }}>
                {[
                  { value: 'all', label: 'All time' },
                  { value: 'today', label: 'Today' },
                  { value: 'week', label: 'Week' },
                  { value: 'month', label: 'Month' },
                  { value: 'year', label: 'Year' },
                ].map((opt) => (
                  <Chip
                    key={opt.value}
                    label={opt.label}
                    size="small"
                    onClick={() => setDatePreset(opt.value)}
                    variant={datePreset === opt.value ? 'filled' : 'outlined'}
                    sx={{
                      fontWeight: 700, borderRadius: '8px', height: 22, fontSize: '0.68rem',
                      ...(datePreset === opt.value
                        ? { bgcolor: tokens.primary, color: '#fff' }
                        : { borderColor: 'divider', color: 'text.secondary' }),
                    }}
                  />
                ))}
                <Box sx={{ flex: 1 }} />
                <Tooltip title="Change sort field">
                  <Chip
                    size="small"
                    icon={<ArrowUpDown size={12} />}
                    label={sortBy === 'amount' ? 'Amount' : sortBy === 'party' ? 'Party' : sortBy === 'number' ? 'Number' : 'Date'}
                    onClick={(e) => setSortMenuAnchor(e.currentTarget)}
                    variant="outlined"
                    sx={{ fontWeight: 700, borderRadius: '8px', height: 22, fontSize: '0.68rem', borderColor: 'divider', color: 'text.secondary' }}
                  />
                </Tooltip>
                <Menu anchorEl={sortMenuAnchor} open={Boolean(sortMenuAnchor)} onClose={() => setSortMenuAnchor(null)}>
                  {[
                    { value: 'date', label: 'Date' },
                    { value: 'number', label: 'Number' },
                    { value: 'amount', label: 'Amount' },
                    { value: 'party', label: 'Party' },
                  ].map((opt) => (
                    <MenuItem key={opt.value} selected={sortBy === opt.value}
                      onClick={() => { setSortBy(opt.value); setSortMenuAnchor(null); }}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </Menu>
                <Tooltip title={sortDir === 'asc' ? 'Ascending — click for descending' : 'Descending — click for ascending'}>
                  <IconButton size="small" onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                    sx={{ p: 0.4, color: 'text.secondary' }}>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 800 }}>{sortDir === 'asc' ? '↑' : '↓'}</Typography>
                  </IconButton>
                </Tooltip>
              </Box>
            )}

            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.75, py: 1, borderBottom: '1px solid rgba(0,0,0,0.06)', bgcolor: 'rgba(0,0,0,0.015)', flexShrink: 0 }}>
              {selectable && (
                <Checkbox
                  size="small"
                  sx={{ p: 0.25 }}
                  indeterminate={selectedIds?.size > 0 && selectedIds?.size < filteredRecords.length}
                  checked={filteredRecords.length > 0 && selectedIds?.size === filteredRecords.length}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedIds?.(new Set(filteredRecords.map((r) => a.id(r))));
                    else setSelectedIds?.(new Set());
                  }}
                />
              )}
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1, minWidth: 0 }}>
                {selectable && selectedIds?.size > 0
                  ? `${selectedIds.size} selected`
                  : `${filteredRecords.length} ${filteredRecords.length !== 1 ? labelPlural : labelSingular}`}
              </Typography>
              <ViewModeToggle value={viewMode} onChange={changeViewMode} tokens={tokens} />
            </Box>

            {viewMode === 'grid' ? (
              <>
                <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0, p: 1.5, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 1.25, alignContent: 'start' }}>
                  {pageRecords.map((r) => {
                    const id = a.id(r);
                    const isActive = hasPreview && selectedRec && a.id(selectedRec) === id;
                    return (
                      <Box
                        key={id}
                        onClick={() => hasPreview && selectRec(r)}
                        sx={{
                          p: 1.5,
                          borderRadius: tokens.radius.md,
                          border: '1.5px solid',
                          borderColor: isActive ? tokens.primary : 'rgba(0,0,0,0.08)',
                          bgcolor: isActive ? tokens.primarySoft : 'background.paper',
                          cursor: hasPreview ? 'pointer' : 'default',
                          display: 'flex', flexDirection: 'column', gap: 0.5,
                          transition: 'border-color 0.12s, box-shadow 0.12s, transform 0.12s',
                          boxShadow: isActive ? tokens.shadow.cardHover : 'none',
                          '&:hover': hasPreview ? { borderColor: tokens.primary, transform: 'translateY(-2px)', boxShadow: tokens.shadow.card } : {},
                        }}
                      >
                        <Typography sx={{ fontWeight: 800, fontFamily: 'monospace', fontSize: '0.8rem' }} noWrap>
                          {a.number(r)}
                        </Typography>
                        {isConverted?.(r) && (
                          <ConvertedChip
                            label={convertedLabel?.(r) || 'Converted'}
                            onClick={onViewConverted ? (e) => { e.stopPropagation(); onViewConverted(r); } : undefined}
                          />
                        )}
                        <Typography sx={{ fontWeight: 800, color: tokens.primary, fontSize: '1.05rem' }}>
                          ₹{a.amount(r).toFixed(2)}
                        </Typography>
                        {!a.isCash(r) ? (
                          <Typography variant="caption" sx={{ fontWeight: 600 }} noWrap>{a.party(r)}</Typography>
                        ) : (
                          <Chip size="small" label={a.party(r) || 'Cash'}
                            sx={{ fontWeight: 700, fontSize: '0.62rem', height: 18, alignSelf: 'flex-start', bgcolor: 'rgba(129,140,248,0.08)', color: 'success.dark', border: '1px solid rgba(129,140,248,0.22)' }} />
                        )}
                        <Typography variant="caption" color="text.secondary">
                          {fmtDate(a.date(r))}{formatCreatedTime(r) ? ` · ${formatCreatedTime(r)}` : ''}
                        </Typography>
                        {(hasPreview && isMobile) && (
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); selectRec(r); }}
                            sx={{ alignSelf: 'flex-end', mt: -0.5, color: tokens.primary, bgcolor: `${tokens.primary}10`, '&:hover': { bgcolor: `${tokens.primary}20` } }}>
                            <Eye size={14} />
                          </IconButton>
                        )}
                      </Box>
                    );
                  })}
                </Box>
                <TablePagination
                  component="div"
                  count={filteredRecords.length}
                  page={page}
                  onPageChange={(_e, p) => setPage(p)}
                  rowsPerPage={rowsPerPage}
                  onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
                  rowsPerPageOptions={[30, 60, 100]}
                  sx={{
                    borderTop: '1px solid rgba(0,0,0,0.06)',
                    flexShrink: 0,
                    '& .MuiTablePagination-select': { borderRadius: tokens.radius.sm },
                    '& .MuiTablePagination-toolbar': { flexWrap: 'wrap' },
                  }}
                />
              </>
            ) : isMobile ? (
              <>
                <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0, p: 1.5, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 1.25, alignContent: 'start' }}>
                  {pageRecords.map((r) => {
                    const id = a.id(r);
                    return (
                      <Box
                        key={id}
                        onClick={() => hasPreview && selectRec(r)}
                        sx={{
                          p: 1.5,
                          borderRadius: tokens.radius.md,
                          border: '1.5px solid rgba(0,0,0,0.08)',
                          bgcolor: 'background.paper',
                          cursor: hasPreview ? 'pointer' : 'default',
                          display: 'flex', flexDirection: 'column', gap: 0.5,
                        }}
                      >
                        <Typography sx={{ fontWeight: 800, fontFamily: 'monospace', fontSize: '0.8rem' }} noWrap>
                          {a.number(r)}
                        </Typography>
                        {isConverted?.(r) && (
                          <ConvertedChip
                            label={convertedLabel?.(r) || 'Converted'}
                            onClick={onViewConverted ? (e) => { e.stopPropagation(); onViewConverted(r); } : undefined}
                          />
                        )}
                        <Typography sx={{ fontWeight: 800, color: tokens.primary, fontSize: '1.05rem' }}>
                          ₹{a.amount(r).toFixed(2)}
                        </Typography>
                        {!a.isCash(r) ? (
                          <Typography variant="caption" sx={{ fontWeight: 600 }} noWrap>{a.party(r)}</Typography>
                        ) : (
                          <Chip size="small" label={a.party(r) || 'Cash'}
                            sx={{ fontWeight: 700, fontSize: '0.62rem', height: 18, alignSelf: 'flex-start', bgcolor: 'rgba(129,140,248,0.08)', color: 'success.dark', border: '1px solid rgba(129,140,248,0.22)' }} />
                        )}
                        <Typography variant="caption" color="text.secondary">
                          {fmtDate(a.date(r))}{formatCreatedTime(r) ? ` · ${formatCreatedTime(r)}` : ''}
                        </Typography>
                        {hasPreview && (
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); selectRec(r); }}
                            sx={{ alignSelf: 'flex-end', mt: -0.5, color: tokens.primary, bgcolor: `${tokens.primary}10`, '&:hover': { bgcolor: `${tokens.primary}20` } }}>
                            <Eye size={14} />
                          </IconButton>
                        )}
                      </Box>
                    );
                  })}
                </Box>
                <TablePagination
                  component="div"
                  count={filteredRecords.length}
                  page={page}
                  onPageChange={(_e, p) => setPage(p)}
                  rowsPerPage={rowsPerPage}
                  onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
                  rowsPerPageOptions={[10, 25, 50]}
                  sx={{
                    borderTop: '1px solid rgba(0,0,0,0.06)',
                    flexShrink: 0,
                    '& .MuiTablePagination-select': { borderRadius: tokens.radius.sm },
                    '& .MuiTablePagination-toolbar': { flexWrap: 'wrap' },
                  }}
                />
              </>
            ) : (
              <TxDataTable
                records={filteredRecords}
                accessors={{ id: a.id, number: a.number, party: a.party, amount: a.amount, date: a.date, dueDate: a.dueDate, isCash: a.isCash }}
                onRowClick={hasPreview ? selectRec : undefined}
                onEdit={onEdit}
                onDelete={onDelete}
                onShare={onShare}
                onPrint={onPrint}
                extraMenuItems={onConvert ? (record, closeMenu) => (
                  isConverted?.(record) ? (
                    <MenuItem disabled>
                      {convertedLabel?.(record) || 'Converted'}
                    </MenuItem>
                  ) : (
                    <MenuItem onClick={() => { onConvert(record); closeMenu(); }}>
                      {convertLabel}
                    </MenuItem>
                  )
                ) : undefined}
                isConverted={isConverted}
                convertedLabel={convertedLabel}
                onViewConverted={onViewConverted}
                selectable={selectable}
                selectedIds={selectedIds}
                setSelectedIds={setSelectedIds}
                tokens={tokens}
                defaultRowsPerPage={50}
              />
            )}
          </Box>
        )}
      </Card>

      {/* Mobile: preview in a full-screen dialog */}
      <Dialog
        open={hasPreview && isMobile && !!selectedRec}
        onClose={() => closePreview()}
        fullScreen
        slotProps={{ paper: { sx: { display: 'flex', flexDirection: 'column' } } }}
      >
        {previewInner}
      </Dialog>

      {/* Desktop: preview always opens as a popup dialog (list and grid mode
          alike) — the eye icon is the only way to open it. */}
      <Dialog
        open={showPreviewDialog}
        onClose={() => closePreview()}
        maxWidth="lg"
        fullWidth
        slotProps={{ paper: { sx: { display: 'flex', flexDirection: 'column', width: '90vw', height: '92vh', maxHeight: '92vh', borderRadius: tokens.radius.lg } } }}
      >
        {previewInner}
      </Dialog>
    </Box>
  );
};

export default TxListView;
