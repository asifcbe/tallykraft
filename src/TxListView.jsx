import React, { useEffect, useState, useMemo, useRef, useLayoutEffect } from 'react';
import {
  Box, Card, Typography, Checkbox, IconButton, Chip, Tooltip,
  TablePagination, useTheme, useMediaQuery, alpha, Dialog,
} from '@mui/material';
import { Edit, Eye, Share2, Trash2, Printer, X } from 'lucide-react';

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
  renderPreview,
  selectable = false,
  selectedIds,
  setSelectedIds,
}) => {
  const theme = useTheme();
  const tokens = useMemo(() => getThemeTokens(theme), [theme]);
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

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
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selectedRec, setSelectedRec] = useState(null);

  const hasPreview = typeof renderPreview === 'function';

  // Keep selection in sync with live data; drop if removed.
  useEffect(() => {
    if (!selectedRec) return;
    const live = records.find((r) => a.id(r) === a.id(selectedRec));
    if (!live) setSelectedRec(null);
    else if (live !== selectedRec) setSelectedRec(live);
  }, [records]); // eslint-disable-line react-hooks/exhaustive-deps

  // Desktop: auto-select first record so the preview shows by default.
  useEffect(() => {
    if (isMobile || !hasPreview) return;
    if (!selectedRec && records.length > 0) setSelectedRec(records[0]);
  }, [isMobile, hasPreview, selectedRec, records]);

  const showDetail = hasPreview && !isMobile && selectedRec;
  const pageRecords = records.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

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
          <IconButton size="small" onClick={() => setSelectedRec(null)} sx={{ color: 'rgba(255,255,255,0.8)', '&:hover': { color: 'white', bgcolor: 'rgba(255,255,255,0.12)' } }}>
            <X size={16} />
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', bgcolor: '#e8eaed', p: 2 }}>
        <FitPreview>{renderPreview(selectedRec)}</FitPreview>
      </Box>
    </>
  ) : null;

  const toggleId = (id, checked) => {
    setSelectedIds?.((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const actions = (r) => [
    onEdit && { icon: <Edit size={17} />, title: 'Edit', onClick: () => onEdit(r), color: tokens.primary },
    (hasPreview && isMobile) && { icon: <Eye size={17} />, title: 'Preview', onClick: () => setSelectedRec(r), color: tokens.primary },
    onShare && { icon: <Share2 size={17} />, title: 'Share', onClick: () => onShare(r), color: '#25D366' },
    onDelete && { icon: <Trash2 size={17} />, title: 'Delete', onClick: () => onDelete(r), color: tokens.error },
  ].filter(Boolean);

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 2,
        alignItems: 'stretch',
        height: { md: showDetail ? 'calc(100vh - 300px)' : 'auto' },
        minHeight: { md: showDetail ? 360 : 0 },
      }}
    >
      {/* LEFT: card list */}
      <Card
        elevation={0}
        sx={{
          borderRadius: tokens.radius.lg,
          border: '1px solid rgba(0,0,0,0.07)',
          overflow: 'hidden',
          boxShadow: tokens.shadow.card,
          width: { xs: '100%', md: showDetail ? 440 : '100%' },
          flexShrink: 0,
          transition: 'width 0.25s ease',
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
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.75, py: 1, borderBottom: '1px solid rgba(0,0,0,0.06)', bgcolor: 'rgba(0,0,0,0.015)', flexShrink: 0 }}>
              {selectable && (
                <Checkbox
                  size="small"
                  sx={{ p: 0.25 }}
                  indeterminate={selectedIds?.size > 0 && selectedIds?.size < records.length}
                  checked={records.length > 0 && selectedIds?.size === records.length}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedIds?.(new Set(records.map((r) => a.id(r))));
                    else setSelectedIds?.(new Set());
                  }}
                />
              )}
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {selectable && selectedIds?.size > 0
                  ? `${selectedIds.size} selected`
                  : `${records.length} ${records.length !== 1 ? labelPlural : labelSingular}`}
              </Typography>
            </Box>

            {/* Scrollable list */}
            <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              {pageRecords.map((r) => {
                const id = a.id(r);
                const due = a.dueDate(r);
                const overdue = due && new Date(due + 'T00:00:00') < new Date();
                const isActive = hasPreview && selectedRec && a.id(selectedRec) === id;
                return (
                  <Box
                    key={id}
                    onClick={() => hasPreview && (isMobile ? null : setSelectedRec(r))}
                    sx={{
                      p: 1.75,
                      borderBottom: '1px solid rgba(0,0,0,0.06)',
                      borderLeft: '3px solid',
                      borderLeftColor: isActive ? tokens.primary : 'transparent',
                      display: 'flex', flexDirection: 'column', gap: 1,
                      cursor: hasPreview && !isMobile ? 'pointer' : 'default',
                      transition: 'background 0.12s, border-color 0.12s',
                      bgcolor: isActive ? tokens.primarySoft : (selectable && selectedIds?.has(id)) ? 'primary.50' : 'transparent',
                      '&:hover': hasPreview && !isMobile ? { bgcolor: isActive ? tokens.primarySoft : 'rgba(79,70,229,0.04)' } : {},
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                      {selectable && (
                        <Checkbox
                          size="small"
                          sx={{ p: 0.25, mt: -0.25 }}
                          checked={selectedIds?.has(id) || false}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => toggleId(id, e.target.checked)}
                        />
                      )}
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 800, fontFamily: 'monospace', fontSize: '0.85rem' }} noWrap>
                          {a.number(r)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {fmtDate(a.date(r))}{r.time ? ` · ${r.time}` : ''}
                        </Typography>
                      </Box>
                      <Typography sx={{ fontWeight: 800, color: tokens.primary, fontSize: '1rem', flexShrink: 0 }}>
                        ₹{a.amount(r).toFixed(2)}
                      </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', pl: selectable ? 4 : 0 }}>
                      {!a.isCash(r) ? (
                        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{a.party(r)}</Typography>
                      ) : (
                        <Chip size="small" label={a.party(r) || 'Cash'}
                          sx={{ fontWeight: 700, fontSize: '0.68rem', height: 20, bgcolor: 'rgba(16,185,129,0.08)', color: 'success.dark', border: '1px solid rgba(16,185,129,0.22)' }} />
                      )}
                      {due && (
                        <Typography variant="caption" sx={{ fontWeight: 700, color: overdue ? tokens.error : 'text.disabled' }}>
                          Due {fmtDate(due)}
                        </Typography>
                      )}
                    </Box>

                    {actions(r).length > 0 && (
                      <Box sx={{ display: 'flex', gap: 0.5, pl: selectable ? 4 : 0 }}>
                        {actions(r).map(({ icon, title, onClick, color }) => (
                          <IconButton key={title} size="small"
                            onClick={(e) => { e.stopPropagation(); onClick(); }}
                            sx={{ flex: 1, borderRadius: tokens.radius.sm, color, bgcolor: `${color}10`, '&:hover': { bgcolor: `${color}20` } }}>
                            {icon}
                          </IconButton>
                        ))}
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Box>

            <TablePagination
              component="div"
              count={records.length}
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
          </Box>
        )}
      </Card>

      {/* RIGHT: preview pane (desktop) */}
      {showDetail && (
        <Card
          elevation={0}
          sx={{
            flex: 1, minWidth: 0,
            borderRadius: tokens.radius.lg,
            border: '1px solid rgba(0,0,0,0.07)',
            boxShadow: tokens.shadow.card,
            overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
            height: '100%', minHeight: 0,
          }}
        >
          {previewInner}
        </Card>
      )}

      {/* Mobile: preview in a full-screen dialog */}
      <Dialog
        open={hasPreview && isMobile && !!selectedRec}
        onClose={() => setSelectedRec(null)}
        fullScreen
        slotProps={{ paper: { sx: { display: 'flex', flexDirection: 'column' } } }}
      >
        {previewInner}
      </Dialog>
    </Box>
  );
};

export default TxListView;
