import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Grid, Card, CardContent,
  useTheme, useMediaQuery, Stack, Button, alpha, Divider, Menu, MenuItem,
  Chip, Avatar, Dialog, DialogContent, IconButton, Tooltip, Popover, TextField,
} from '@mui/material';
import {
  ArrowUpRight, ArrowDownRight,
  Plus, FileText, ReceiptText, ShoppingBag, Download, Upload, DollarSign, TrendingUp,
  Bell, Clock, QrCode, X, Wallet, Activity, ChevronRight,
  PieChart as PieChartIcon, Layers, CalendarDays, Copy, Check,
  StickyNote, Pin, Trash2, CornerDownLeft,
} from 'lucide-react';
import { useBusiness } from './BusinessContext';
import { useAuth } from './AuthContext';
import { useBusinessAuthDoc } from './businessCode';
import { useData } from './DataContext';
import { useConfig } from './ConfigContext';
import { useI18n } from './i18n/I18nContext';
import { computeCashInHand, computeBankBalance } from './cashUtils';
import InvoicePreviewDialog from './InvoicePreviewDialog';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { useTabs } from './TabsContext';
import { dispatchQuickNew } from './quickNewBridge';
import { resolveDashboard, DASHBOARD_KPIS, SHORTCUT_ICONS, presetFor, shortcutAvailable } from './dashboardConfig';
import { BRAND } from './theme';
import BillDhekoLogo, { TM } from './BillDhekoLogo';

// ─── Design tokens (BillDheko "quiet luxury" dashboard) ─────────────────────
const D = {
  ink: '#241612', soft: '#4a3631', muted: '#8a7870', line: '#ece3da', lineSoft: '#f3ece5',
  ox: '#5c1f22', oxDeep: '#3f1417', gold: '#b08d57', paper: '#ffffff', green: '#2f7d4f', red: '#b4373a',
  serif: "'Fraunces', Georgia, 'Times New Roman', serif",
};
const cardSx = {
  borderRadius: '16px', border: `1px solid ${D.line}`, bgcolor: D.paper, height: '100%', overflow: 'hidden',
  boxShadow: '0 1px 2px rgba(36,22,18,0.03), 0 8px 24px rgba(36,22,18,0.035)',
};
// Card header: hairline-ringed icon, serif title, muted subtitle, optional right slot.
const CardHead = ({ icon, title, subtitle, right }) => (
  <Box sx={{ px: 2.5, pt: 2.25, pb: 1.75, display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 1.5, rowGap: 1 }}>
    <Box sx={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', border: `1px solid ${alpha(D.gold, 0.45)}`, color: D.ox }}>
      {React.createElement(icon, { size: 15, strokeWidth: 1.8 })}
    </Box>
    <Box sx={{ flex: '1 1 160px', minWidth: 0 }}>
      <Typography sx={{ fontFamily: D.serif, fontWeight: 500, fontSize: '1.08rem', letterSpacing: '-0.01em', color: D.ink, lineHeight: 1.2 }} noWrap>{title}</Typography>
      {subtitle && <Typography sx={{ fontSize: '0.72rem', color: D.muted, mt: 0.2 }} noWrap>{subtitle}</Typography>}
    </Box>
    {right}
  </Box>
);
const CountPill = ({ children, color = D.ox }) => (
  <Box component="span" sx={{ px: 1, py: 0.25, borderRadius: 999, fontSize: '0.7rem', fontWeight: 700, color, bgcolor: alpha(color, 0.08), whiteSpace: 'nowrap' }}>{children}</Box>
);

// ─── KPI Value: renders at a shared font size determined by the parent grid ──
const KpiValue = ({ value, color, fontSize }) => {
  const v = value ?? 0;
  const formatted = `${v < 0 ? '−' : ''}₹${Math.abs(v).toLocaleString('en-IN')}`;
  return (
    <Box sx={{ width: '100%', overflow: 'hidden', display: 'flex', justifyContent: 'flex-start' }}>
      <Box
        component="span"
        sx={{
          fontSize: (fontSize ?? 32) + 'px',
          fontFamily: D.serif,
          fontWeight: 500,
          color: color ?? 'text.primary',
          letterSpacing: '-0.025em',
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
          display: 'inline-block',
        }}
      >
        {formatted}
      </Box>
    </Box>
  );
};

// ─── Measures the largest number in statRows and returns the font size that
//     fits it in a container of the given width. All KPI cards share this size.
const useUniformKpiFontSize = (statRows, containerWidth) => {
  const [fontSize, setFontSize] = React.useState(30);
  const probeRef = React.useRef(null);

  React.useLayoutEffect(() => {
    if (!containerWidth || !probeRef.current) return;
    const el = probeRef.current;
    const longestText = statRows
      .map(r => `${(r.value ?? 0) < 0 ? '−' : ''}₹${Math.abs(r.value ?? 0).toLocaleString('en-IN')}`)
      .reduce((a, b) => (a.length >= b.length ? a : b), '');
    el.textContent = longestText;
    let size = 30;
    el.style.fontSize = size + 'px';
    while (el.scrollWidth > containerWidth && size > 11) {
      size -= 1;
      el.style.fontSize = size + 'px';
    }
    setFontSize(size);
  }, [statRows, containerWidth]);

  // Hidden off-screen probe element
  const ProbeEl = (
    <Box
      ref={probeRef}
      component="span"
      sx={{
        position: 'fixed', top: -9999, left: -9999,
        fontFamily: D.serif, fontWeight: 500, letterSpacing: '-0.025em',
        fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
        visibility: 'hidden', pointerEvents: 'none',
      }}
    />
  );

  return { fontSize, ProbeEl };
};

// ─── Clock + Calendar + Stats Hero Widget ────────────────────────────────────
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// Row of user-defined shortcut buttons (Settings → Dashboard → Shortcuts).
const DashboardShortcuts = ({ shortcuts, onRun }) => (
  <Box sx={{
    display: { xs: 'flex', sm: 'grid' }, gap: 1.25,
    overflowX: { xs: 'auto', sm: 'visible' }, mx: { xs: -0.5, sm: 0 }, px: { xs: 0.5, sm: 0 }, pb: { xs: 0.5, sm: 0 },
    scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' },
    gridTemplateColumns: { sm: 'repeat(auto-fill, minmax(170px, 1fr))' },
  }}>
    {shortcuts.map(sc => {
      const color = sc.color || '#5c1f22';
      const icon = SHORTCUT_ICONS[sc.icon] || SHORTCUT_ICONS.zap;
      return (
        <Box key={sc.id} component="button" type="button" onClick={() => onRun(sc)} title={sc.label}
          sx={{
            all: 'unset', boxSizing: 'border-box', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 1.25, px: 1.5, py: 1.2,
            borderRadius: '14px', border: `1px solid ${D.line}`, bgcolor: D.paper, minWidth: { xs: 150, sm: 0 }, flexShrink: 0,
            boxShadow: '0 1px 2px rgba(36,22,18,0.03)',
            transition: 'all .2s ease',
            '&:hover': { borderColor: alpha(color, 0.45), boxShadow: '0 6px 18px rgba(36,22,18,0.07)', transform: 'translateY(-1px)' },
            '&:focus-visible': { outline: `2px solid ${alpha(color, 0.5)}`, outlineOffset: 2 },
          }}>
          <Box sx={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: alpha(color, 0.08), color }}>
            {React.createElement(icon, { size: 15, strokeWidth: 1.8 })}
          </Box>
          <Typography noWrap sx={{ fontSize: '0.82rem', fontWeight: 600, color: D.ink, minWidth: 0 }}>
            {sc.label}
          </Typography>
        </Box>
      );
    })}
  </Box>
);

// ─── Notes / whiteboard ──────────────────────────────────────────────────────
// Quick reminders saved per business in the `notes` table (local-first, synced
// and backed up like any other data). Enter adds; click a note to edit it
// (Enter saves, Esc cancels); tick to mark done; pin keeps it on top.
const NotesBoard = () => {
  const { data, addItem, updateItem, deleteItem, deleteItems } = useData();
  const { currentBusiness } = useBusiness();
  const bizId = currentBusiness?.id;
  const [draft, setDraft] = useState('');
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState('');
  const [error, setError] = useState('');

  const notes = useMemo(() => (data.notes || [])
    .filter(n => n.businessId === bizId)
    .sort((a, b) => (Number(!!b.pinned) - Number(!!a.pinned)) || (Number(!!a.done) - Number(!!b.done)) || ((b.createdAt || 0) - (a.createdAt || 0))),
  [data.notes, bizId]);
  const doneCount = notes.filter(n => n.done).length;

  const fail = () => { setError('Could not save the note.'); setTimeout(() => setError(''), 3000); };
  const add = () => {
    const text = draft.trim();
    if (!text || !bizId) return;
    const ok = addItem('notes', { businessId: bizId, text, done: false, pinned: false });
    if (ok === false) { fail(); return; }
    setDraft('');
  };
  const patch = (n, changes) => {
    const ok = updateItem('notes', n.id, changes);
    if (ok === false) fail();
  };
  const saveEdit = (n) => {
    const text = editText.trim();
    if (!text) deleteItem('notes', n.id);
    else if (text !== n.text) patch(n, { text });
    setEditId(null);
  };

  return (
    <Card elevation={0} sx={{ ...cardSx, display: 'flex', flexDirection: 'column', minHeight: { md: 380 } }}>
      <CardHead icon={StickyNote} title="Notes" subtitle={notes.length ? `${notes.length - doneCount} to remember${doneCount ? ` · ${doneCount} done` : ''}` : 'Jot down anything to remember'}
        right={doneCount > 0 ? (
          <Button size="small" onClick={() => deleteItems('notes', notes.filter(n => n.done).map(n => n.id))}
            sx={{ fontSize: '0.72rem', textTransform: 'none', color: D.muted, p: 0, minWidth: 0, fontWeight: 600, '&:hover': { bgcolor: 'transparent', color: D.ox } }}>
            Clear done
          </Button>
        ) : null} />

      {/* Input */}
      <Box sx={{ px: 2.5, pb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, border: `1px solid ${D.line}`, borderRadius: '12px', px: 1.25, py: 0.4, bgcolor: '#fdfbf8',
          '&:focus-within': { borderColor: alpha(D.ox, 0.45), boxShadow: `0 0 0 3px ${alpha(D.ox, 0.08)}` } }}>
          <Box component="input" value={draft} placeholder="Write a note and press Enter…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            aria-label="New note"
            sx={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', bgcolor: 'transparent', font: 'inherit', fontSize: '0.84rem', color: D.ink, py: 0.75,
              '&::placeholder': { color: D.muted, opacity: 1 } }} />
          <IconButton size="small" onClick={add} disabled={!draft.trim()} aria-label="Add note"
            sx={{ color: D.ox, '&.Mui-disabled': { color: D.line } }}>
            <CornerDownLeft size={15} />
          </IconButton>
        </Box>
        {error && <Typography sx={{ fontSize: '0.7rem', color: D.red, mt: 0.5 }}>{error}</Typography>}
      </Box>

      {/* List */}
      <Box sx={{ flex: 1, minHeight: 0, maxHeight: 340, overflowY: 'auto', pb: 1 }}>
        {notes.length === 0 ? (
          <Typography sx={{ px: 2.5, pb: 1.5, fontSize: '0.78rem', color: D.muted, fontStyle: 'italic' }}>
            Nothing yet — e.g. "Call Ravi about pending payment".
          </Typography>
        ) : notes.map(n => (
          <Box key={n.id} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, px: 2.5, py: 0.75,
            bgcolor: n.pinned ? alpha(D.gold, 0.07) : 'transparent',
            '&:hover': { bgcolor: n.pinned ? alpha(D.gold, 0.11) : '#faf6f2' }, '&:hover .note-act': { opacity: 1 } }}>
            <Box component="button" type="button" onClick={() => patch(n, { done: !n.done })} aria-label={n.done ? 'Mark not done' : 'Mark done'}
              sx={{ all: 'unset', cursor: 'pointer', mt: '2px', width: 16, height: 16, borderRadius: '5px', flexShrink: 0, display: 'grid', placeItems: 'center',
                border: `1.5px solid ${n.done ? D.green : D.line}`, bgcolor: n.done ? D.green : 'transparent', color: '#fff',
                '&:focus-visible': { outline: `2px solid ${alpha(D.ox, 0.4)}`, outlineOffset: 1 } }}>
              {n.done && <Check size={11} strokeWidth={3} />}
            </Box>
            {editId === n.id ? (
              <Box component="input" autoFocus value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onBlur={() => saveEdit(n)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(n); } if (e.key === 'Escape') setEditId(null); }}
                sx={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', borderBottom: `1px solid ${alpha(D.ox, 0.4)}`, bgcolor: 'transparent', font: 'inherit', fontSize: '0.84rem', color: D.ink, py: 0.1 }} />
            ) : (
              <Typography onClick={() => { setEditId(n.id); setEditText(n.text || ''); }} title="Click to edit"
                sx={{ flex: 1, minWidth: 0, fontSize: '0.84rem', lineHeight: 1.45, cursor: 'text', wordBreak: 'break-word', whiteSpace: 'pre-wrap',
                  color: n.done ? D.muted : D.ink, textDecoration: n.done ? 'line-through' : 'none' }}>
                {n.text}
              </Typography>
            )}
            <Box className="note-act" sx={{ display: 'flex', gap: 0.25, opacity: { xs: 1, md: n.pinned ? 1 : 0 }, transition: 'opacity .15s', flexShrink: 0 }}>
              <IconButton size="small" onClick={() => patch(n, { pinned: !n.pinned })} aria-label={n.pinned ? 'Unpin' : 'Pin to top'}
                sx={{ p: 0.4, color: n.pinned ? D.gold : D.muted }}>
                <Pin size={13} fill={n.pinned ? 'currentColor' : 'none'} />
              </IconButton>
              <IconButton size="small" onClick={() => deleteItem('notes', n.id)} aria-label="Delete note" sx={{ p: 0.4, color: D.muted, '&:hover': { color: D.red } }}>
                <Trash2 size={13} />
              </IconButton>
            </Box>
          </Box>
        ))}
      </Box>
    </Card>
  );
};

const NO_KPIS = Object.fromEntries(DASHBOARD_KPIS.map(k => [k.id, false]));
const fmtINR = (v) => `${(v ?? 0) < 0 ? '−' : ''}₹${Math.abs(v ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

// Small outline "+ action" chip used on KPI cards.
const ActionChip = ({ label, onClick, color }) => (
  <Box component="button" type="button" onClick={onClick} sx={{
    all: 'unset', boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', gap: 0.4,
    px: 1, py: 0.45, borderRadius: 999, border: `1px solid ${D.line}`, cursor: 'pointer',
    fontSize: '0.68rem', fontWeight: 600, color: D.soft, lineHeight: 1, whiteSpace: 'nowrap',
    transition: 'all 0.18s ease',
    '&:hover': { borderColor: alpha(color, 0.55), color, bgcolor: alpha(color, 0.05) },
    '&:focus-visible': { outline: `2px solid ${alpha(color, 0.5)}`, outlineOffset: 1 },
  }}>
    <Plus size={10} strokeWidth={2.4} />{label}
  </Box>
);

// Lightweight inline sparkline (no chart lib) — hidden with < 2 points.
const Sparkline = ({ data, color }) => {
  const vals = (data || []).map(d => Number(d.v) || 0);
  if (vals.length < 2) return null;
  const W = 120, H = 34, max = Math.max(...vals), min = Math.min(...vals), span = max - min || 1;
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * W, H - 3 - ((v - min) / span) * (H - 6)]);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" style={{ display: 'block' }}>
      <polygon points={`0,${H} ${line} ${W},${H}`} fill={alpha(color, 0.08)} />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

const TrendChip = ({ value, label, invert = false }) => {
  if (value == null || !Number.isFinite(value)) return null;
  const up = value >= 0;
  const good = invert ? !up : up;
  const c = Math.abs(value) < 0.5 ? D.muted : (good ? D.green : D.red);
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, px: 0.75, py: 0.2, borderRadius: 999, bgcolor: alpha(c, 0.09), color: c, fontSize: '0.7rem', fontWeight: 700 }}>
        {up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}{Math.abs(value).toFixed(0)}%
      </Box>
      <Typography sx={{ fontSize: '0.7rem', color: D.muted }}>{label}</Typography>
    </Box>
  );
};

const SectionLabel = ({ children, right }) => (
  <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, mb: 1.25 }}>
    <Typography sx={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: D.gold }}>{children}</Typography>
    {right}
  </Box>
);

// ─── KPI sections: period performance (big cards) + current balances ────────
const KpiSections = ({ stats, cash, bank, kpis, onQuickNew, periodLabel }) => {
  const on = (id) => !kpis || kpis[id] !== false;
  const q = onQuickNew || (() => {});
  const perf = [
    { id: 'sales', label: 'Sales', value: stats.totalSales, color: D.ox, trend: stats.salesTrend, spark: stats.sparkSales,
      action: { label: 'Invoice', fn: () => q('/sales', 'New Invoice', 'createNew') } },
    { id: 'purchases', label: 'Purchases', value: stats.totalPurchases, color: D.gold, trend: stats.purchaseTrend, spark: stats.sparkPurch, invert: true,
      action: { label: 'Purchase', fn: () => q('/purchases', 'New Purchase', 'createNew') } },
    { id: 'expenses', label: 'Expenses', value: stats.totalExpenses, color: '#a8485c',
      action: { label: 'Expense', fn: () => q('/expenses', 'Expenses', 'openAdd') } },
  ].filter(r => on(r.id));
  const cashBal = cash?.balance ?? 0, bankBal = bank?.balance ?? 0;
  const bal = [
    { id: 'receivable', label: 'To receive', value: stats.toGet, color: D.green,
      actions: [{ label: 'Receive', fn: () => q('/payment-in', 'Payment In', 'openAdd') }, { label: 'View', fn: () => q('/payment-in', 'Payment In', 'viewOutstanding') }] },
    { id: 'payable', label: 'To pay', value: stats.toGive, color: '#b7791f',
      actions: [{ label: 'Pay', fn: () => q('/payment-out', 'Payment Out', 'openAdd') }, { label: 'View', fn: () => q('/payment-out', 'Payment Out', 'viewOutstanding') }] },
    { id: 'cash', label: 'Cash in hand', value: cashBal, color: '#4f7a78',
      actions: [{ label: 'In', fn: () => q('/cash', 'Cash Book', 'cash_in') }, { label: 'Out', fn: () => q('/cash', 'Cash Book', 'cash_out') }] },
    { id: 'bank', label: 'Bank balance', value: bankBal, color: '#6b5a52',
      actions: [{ label: 'Credit', fn: () => q('/cash', 'Cash Book', 'bank_in') }, { label: 'Debit', fn: () => q('/cash', 'Cash Book', 'bank_out') }] },
    { id: 'capital', label: 'Total capital', value: cashBal + bankBal, color: D.oxDeep, actions: [] },
  ].filter(r => on(r.id));

  return (
    <Stack spacing={2.5}>
      {perf.length > 0 && (
        <Box>
          <SectionLabel>Performance · {periodLabel}</SectionLabel>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: `repeat(${Math.min(perf.length, 3)}, minmax(0, 1fr))` } }}>
            {perf.map(r => (
              <Box key={r.id} sx={{ ...cardSx, height: 'auto', p: 2.25, display: 'flex', flexDirection: 'column', gap: 1.1, position: 'relative' }}>
                <Box sx={{ position: 'absolute', inset: '0 auto 0 0', width: 3, bgcolor: r.color, opacity: 0.85 }} />
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                  <Typography sx={{ fontSize: '0.68rem', fontWeight: 600, color: D.muted, textTransform: 'uppercase', letterSpacing: '0.14em' }}>{r.label}</Typography>
                  <ActionChip label={r.action.label} onClick={r.action.fn} color={r.color} />
                </Box>
                <Typography noWrap sx={{ fontFamily: D.serif, fontWeight: 500, fontSize: { xs: '1.9rem', md: '2.15rem' }, letterSpacing: '-0.025em', lineHeight: 1.05, color: (r.value ?? 0) < 0 ? D.red : D.ink, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtINR(r.value)}
                </Typography>
                <Box sx={{ minHeight: 20 }}>
                  {r.trend != null ? <TrendChip value={r.trend} label={stats.trendLabel} invert={r.invert} />
                    : <Typography sx={{ fontSize: '0.7rem', color: D.muted }}>Recorded {periodLabel?.toLowerCase()}</Typography>}
                </Box>
                <Box sx={{ mt: 'auto', mx: -0.5 }}><Sparkline data={r.spark} color={r.color} /></Box>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {bal.length > 0 && (
        <Box>
          <SectionLabel>Balances · as of now</SectionLabel>
          <Box sx={{ ...cardSx, height: 'auto', display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: `repeat(${Math.min(bal.length, 5)}, minmax(0, 1fr))` } }}>
            {bal.map((r, i) => (
              <Box key={r.id} sx={{
                p: 2, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.9,
                borderLeft: { xs: i % 2 === 1 ? `1px solid ${D.lineSoft}` : 'none', md: i > 0 ? `1px solid ${D.lineSoft}` : 'none' },
                borderTop: { xs: i > 1 ? `1px solid ${D.lineSoft}` : 'none', md: 'none' },
                ...(r.id === 'capital' ? { bgcolor: '#faf6f2' } : {}),
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.85 }}>
                  <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: r.color, flexShrink: 0 }} />
                  <Typography noWrap sx={{ fontSize: '0.66rem', fontWeight: 600, color: D.muted, textTransform: 'uppercase', letterSpacing: '0.12em' }}>{r.label}</Typography>
                </Box>
                <Typography noWrap sx={{ fontFamily: D.serif, fontWeight: 500, fontSize: { xs: '1.3rem', md: '1.4rem' }, letterSpacing: '-0.02em', lineHeight: 1.1, color: (r.value ?? 0) < 0 ? D.red : D.ink, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtINR(r.value)}
                </Typography>
                {r.actions.length > 0 && (
                  <Box sx={{ display: 'flex', gap: 0.6, flexWrap: 'wrap', mt: 'auto' }}>
                    {r.actions.map(a => <ActionChip key={a.label} label={a.label} onClick={a.fn} color={r.color} />)}
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Stack>
  );
};

const ClockCalendarWidget = ({ now, accentColor, bgColor, textOnBg = '#fff', stats: heroStats, cash, bank, lastCashAmounts, lastBankAmounts, onQuickNew, kpis = null, showClock = true, rail = false }) => {
  const [calBase, setCalBase] = React.useState(() => ({ y: now.getFullYear(), m: now.getMonth() }));
  const gridRef = React.useRef(null);
  const [cardWidth, setCardWidth] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const cols = getComputedStyle(el).gridTemplateColumns.split(' ').length || 2;
    setCardWidth(el.clientWidth / cols - 28); // subtract px padding
    const ro = new ResizeObserver(() => {
      const c = getComputedStyle(el).gridTemplateColumns.split(' ').length || 2;
      setCardWidth(el.clientWidth / c - 28);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [blink, setBlink] = React.useState(true);
  React.useEffect(() => { const id = setInterval(() => setBlink(b => !b), 500); return () => clearInterval(id); }, []);

  const h = now.getHours();
  const m = now.getMinutes();
  const s = now.getSeconds();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = String(h % 12 || 12).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  const secPct = (s / 59) * 100;

  const today = { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
  const { y: cy, m: cm } = calBase;
  const firstDay = new Date(cy, cm, 1).getDay();
  const daysInMonth = new Date(cy, cm + 1, 0).getDate();
  const cells = Array.from({ length: firstDay }, () => null).concat(Array.from({ length: daysInMonth }, (_, i) => i + 1));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const isToday = (d) => d !== null && cy === today.y && cm === today.m && d === today.d;
  const isCurrentMonth = cy === today.y && cm === today.m;
  const prevMonth = () => setCalBase(b => b.m === 0 ? { y: b.y - 1, m: 11 } : { y: b.y, m: b.m - 1 });
  const nextMonth = () => setCalBase(b => b.m === 11 ? { y: b.y + 1, m: 0 } : { y: b.y, m: b.m + 1 });
  const goToday = () => setCalBase({ y: today.y, m: today.m });

  const radius = 22;
  const circ = 2 * Math.PI * radius;
  const dash = (secPct / 100) * circ;

  const statRows = heroStats ? [
    { id: 'sales', label: 'Sales',        value: heroStats.totalSales,     color: D.ox, trend: heroStats.salesTrend,    actions: onQuickNew ? [{ label: 'Invoice',  fn: () => onQuickNew('/sales', 'New Invoice', 'createNew') }] : [] },
    { id: 'purchases', label: 'Purchases',    value: heroStats.totalPurchases, color: D.gold,         trend: heroStats.purchaseTrend, actions: onQuickNew ? [{ label: 'Purchase', fn: () => onQuickNew('/purchases', 'New Purchase', 'createNew') }] : [] },
    { id: 'receivable', label: 'Receivable',   value: heroStats.toGet,          color: D.green,        trend: null,                   actions: onQuickNew ? [{ label: 'Receive',  fn: () => onQuickNew('/payment-in', 'Payment In', 'openAdd') }, { label: 'View', fn: () => onQuickNew('/payment-in', 'Payment In', 'viewOutstanding') }] : [] },
    { id: 'payable', label: 'Payable',      value: heroStats.toGive,         color: '#b7791f',      trend: null,                   actions: onQuickNew ? [{ label: 'Pay',      fn: () => onQuickNew('/payment-out', 'Payment Out', 'openAdd') }, { label: 'View', fn: () => onQuickNew('/payment-out', 'Payment Out', 'viewOutstanding') }] : [] },
    { id: 'expenses', label: 'Expenses',     value: heroStats.totalExpenses,  color: '#a8485c',      trend: null,                   actions: onQuickNew ? [{ label: 'Expense',  fn: () => onQuickNew('/expenses', 'Expenses', 'openAdd') }] : [] },
    { id: 'cash', label: 'Cash in Hand', value: cash?.balance ?? 0,       color: '#4f7a78',      cashIn: lastCashAmounts?.lastIn ?? 0, cashOut: lastCashAmounts?.lastOut ?? 0,
      actions: onQuickNew ? [{ label: 'Cash In', fn: () => onQuickNew('/cash', 'Cash Book', 'cash_in') }, { label: 'Cash Out', fn: () => onQuickNew('/cash', 'Cash Book', 'cash_out') }] : [] },
    { id: 'bank', label: 'Bank Balance', value: bank?.balance ?? 0,       color: '#6b5a52',      cashIn: lastBankAmounts?.lastIn ?? 0, cashOut: lastBankAmounts?.lastOut ?? 0,
      actions: onQuickNew ? [{ label: 'Credit',   fn: () => onQuickNew('/cash', 'Cash Book', 'bank_in') }, { label: 'Debit',    fn: () => onQuickNew('/cash', 'Cash Book', 'bank_out') }] : [] },
    { id: 'capital', label: 'Total Capital', value: (cash?.balance ?? 0) + (bank?.balance ?? 0), color: D.oxDeep, actions: [] },
  ].filter(r => !kpis || kpis[r.id] !== false) : [];

  const { fontSize: kpiFontSize, ProbeEl } = useUniformKpiFontSize(statRows, cardWidth);
  // Columns per breakpoint for however many KPI cards are switched on — fills
  // each row evenly (e.g. 6 cards → 3 + 3 on desktop instead of 4 + 2).
  const nK = statRows.length;
  const kCols = { xs: Math.min(2, nK), sm: Math.min(3, nK), lg: nK <= 4 ? nK : Math.min(4, Math.ceil(nK / 2)) };

  return (
    <Box sx={{
      ...cardSx, height: 'auto',
      width: '100%',
      display: 'flex', flexDirection: { xs: 'column', lg: 'row' },
    }}>
      {/* ── Left: KPI cards grid ── */}
      {ProbeEl}
      {statRows.length > 0 && (
        <Box ref={gridRef} sx={{
          flex: 1, display: 'grid', order: { xs: 2, lg: 1 },
          gridTemplateColumns: { xs: `repeat(${kCols.xs}, 1fr)`, sm: `repeat(${kCols.sm}, 1fr)`, lg: `repeat(${kCols.lg}, 1fr)` },
          gridAutoRows: '1fr',
          borderRight: { lg: `1px solid ${D.line}` },
          borderBottom: { xs: `1px solid ${D.line}`, lg: 'none' },
        }}>
          {statRows.map((r, i) => {
            const hasCashFlow = r.cashIn !== undefined;
            return (
              <Box key={r.label} sx={{
                px: 2, py: 1.9,
                borderRight: Object.fromEntries(Object.entries(kCols).map(([bp, c]) => [bp, (i % c !== c - 1) ? `1px solid ${D.lineSoft}` : 'none'])),
                borderBottom: `1px solid ${D.lineSoft}`,
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center',
                overflow: 'hidden',
                transition: 'background-color 0.2s',
                '&:hover': { bgcolor: alpha(r.color, 0.025) },
              }}>
                {/* Label */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.85, mb: 1.1 }}>
                  <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: r.color, flexShrink: 0 }} />
                  <Typography sx={{ fontSize: '0.66rem', fontWeight: 600, color: D.muted, textTransform: 'uppercase', letterSpacing: '0.14em', lineHeight: 1 }}>
                    {r.label}
                  </Typography>
                </Box>

                {/* Value */}
                <Box sx={{ width: '100%', mb: r.actions?.length > 0 ? 0.6 : 0, display: 'flex', justifyContent: 'flex-start' }}>
                  <KpiValue value={r.value} color={(r.value ?? 0) < 0 ? D.red : D.ink} fontSize={kpiFontSize} />
                </Box>

                {/* Action buttons — pinned to bottom */}
                {r.actions?.length > 0 && (
                  <Box sx={{ display: 'flex', gap: 0.75, mt: 1, width: '100%', flexWrap: 'wrap' }}>
                    {r.actions.map((a) => (
                      <Box key={a.label} component="button" type="button" onClick={a.fn} sx={{
                        all: 'unset', boxSizing: 'border-box',
                        display: 'inline-flex', alignItems: 'center', gap: 0.4,
                        px: 1, py: 0.45, borderRadius: 999,
                        border: `1px solid ${D.line}`,
                        cursor: 'pointer', userSelect: 'none',
                        fontSize: '0.68rem', fontWeight: 600, color: D.soft, lineHeight: 1, whiteSpace: 'nowrap',
                        transition: 'all 0.18s ease',
                        '&:hover': { borderColor: alpha(r.color, 0.55), color: r.color, bgcolor: alpha(r.color, 0.05) },
                        '&:focus-visible': { outline: `2px solid ${alpha(r.color, 0.5)}`, outlineOffset: 1 },
                      }}>
                        <Plus size={10} strokeWidth={2.4} />{a.label}
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      )}

      {/* ── Right: Clock + Calendar stacked ── */}
      {showClock && <Box sx={{ flex: '0 0 auto', width: rail ? '100%' : { xs: '100%', lg: 310 }, display: 'flex', flexDirection: { xs: 'row', sm: 'row', lg: 'column' }, overflow: 'hidden', order: { xs: 1, lg: 2 } }}>
        {/* Digital Clock */}
        <Box sx={{
          flex: { xs: '0 0 160px', sm: '0 0 180px', lg: 'none' },
          background: `radial-gradient(260px 160px at 85% 0%, ${alpha(D.gold, 0.22)}, transparent 70%), ${bgColor}`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          pt: 2.25, pb: 4.5, px: 2, gap: 1, position: 'relative',
        }}>
          <Box sx={{ position: 'relative', width: 52, height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width={52} height={52} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%) rotate(-90deg)' }}>
              <circle cx={26} cy={26} r={radius} fill="none" stroke={alpha(textOnBg, 0.15)} strokeWidth={3} />
              <circle cx={26} cy={26} r={radius} fill="none" stroke={alpha(textOnBg, 0.85)} strokeWidth={3}
                strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
                style={{ transition: 'stroke-dasharray 0.35s ease' }}
              />
            </svg>
            <Typography sx={{ fontSize: '0.76rem', fontWeight: 800, color: textOnBg, fontVariantNumeric: 'tabular-nums', zIndex: 1, lineHeight: 1 }}>{ss}</Typography>
          </Box>
          <Box sx={{ textAlign: 'center' }}>
            <Typography sx={{ fontFamily: D.serif, fontSize: '2.6rem', fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 1, color: textOnBg, fontVariantNumeric: 'tabular-nums', userSelect: 'none' }}>
              {hh}<Box component="span" sx={{ opacity: blink ? 1 : 0.2, transition: 'opacity 0.1s', mx: '1px' }}>:</Box>{mm}
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 0.6 }}>
              <Box sx={{ px: 1.1, py: 0.15, borderRadius: 100, bgcolor: alpha(textOnBg, 0.15), border: `1px solid ${alpha(textOnBg, 0.25)}` }}>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, color: textOnBg, letterSpacing: '0.06em' }}>{ampm}</Typography>
              </Box>
            </Box>
          </Box>
          <Typography sx={{ fontSize: '0.68rem', color: alpha(textOnBg, 0.7), textAlign: 'center', fontWeight: 500 }}>
            {now.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
          </Typography>
          {/* Logo + app name — bottom right. The mark sits on a small white
              tile so it stays visible on the dark clock panel. */}
          <Box sx={{ position: 'absolute', bottom: 10, right: 12, display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box sx={{ bgcolor: '#fff', borderRadius: '6px', p: '2px', display: 'flex', lineHeight: 0, boxShadow: '0 1px 4px rgba(0,0,0,0.18)' }}>
              <BillDhekoLogo size={16} variant="icon" />
            </Box>
            <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: alpha(textOnBg, 0.85), letterSpacing: '0.02em', lineHeight: 1 }}>BillDheko<TM /></Typography>
          </Box>
        </Box>

        {/* Mini Calendar */}
        <Box sx={{ flex: 1, p: { xs: 1.25, lg: 1.5 }, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box onClick={prevMonth} sx={{ cursor: 'pointer', width: 24, height: 24, borderRadius: 1.25, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.secondary', '&:hover': { bgcolor: alpha(accentColor, 0.1), color: accentColor } }}>
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="15 18 9 12 15 6" /></svg>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: 'text.primary' }}>{MONTHS[cm]} {cy}</Typography>
              {!isCurrentMonth && (
                <Box onClick={goToday} sx={{ cursor: 'pointer', px: 0.75, py: 0.1, borderRadius: 100, bgcolor: alpha(accentColor, 0.1), border: `1px solid ${alpha(accentColor, 0.2)}` }}>
                  <Typography sx={{ fontSize: '0.58rem', fontWeight: 700, color: accentColor }}>Today</Typography>
                </Box>
              )}
            </Box>
            <Box onClick={nextMonth} sx={{ cursor: 'pointer', width: 24, height: 24, borderRadius: 1.25, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.secondary', '&:hover': { bgcolor: alpha(accentColor, 0.1), color: accentColor } }}>
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="9 18 15 12 9 6" /></svg>
            </Box>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {DAYS.map(d => <Typography key={d} sx={{ textAlign: 'center', fontSize: '0.58rem', fontWeight: 700, color: 'text.disabled', pb: 0.35, userSelect: 'none' }}>{d}</Typography>)}
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.2 }}>
            {weeks.map((week, wi) => (
              <Box key={wi} sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                {week.map((d, di) => (
                  <Box key={di} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 22, borderRadius: 1.25, bgcolor: isToday(d) ? accentColor : 'transparent', boxShadow: isToday(d) ? `0 2px 6px ${alpha(accentColor, 0.4)}` : 'none' }}>
                    {d && <Typography sx={{ fontSize: '0.7rem', fontWeight: isToday(d) ? 800 : 400, color: isToday(d) ? '#fff' : (d < today.d && isCurrentMonth ? 'text.disabled' : 'text.primary'), userSelect: 'none', lineHeight: 1 }}>{d}</Typography>}
                  </Box>
                ))}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>}
    </Box>
  );
};

// ─── Animated counter hook ───────────────────────────────────────────────────
const useCountUp = (target, duration = 900, deps = []) => {
  const [value, setValue] = useState(0);
  const rafRef = useRef(null);
  const startRef = useRef(null);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const to = target ?? 0;
    if (from === to) return;
    cancelAnimationFrame(rafRef.current);
    startRef.current = null;

    const step = (ts) => {
      if (!startRef.current) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutExpo
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const cur = Math.round(from + (to - from) * ease);
      setValue(cur);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, ...deps]);

  return value;
};


// ─── Donut chart tooltip ──────────────────────────────────────────────────────
const DonutTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <Box sx={{ bgcolor: 'white', border: '1px solid', borderColor: alpha('#000', 0.08), borderRadius: 2, p: 1.5, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
      <Typography sx={{ fontSize: '0.78rem', fontWeight: 700 }}>{payload[0].name}</Typography>
      <Typography sx={{ fontSize: '0.8rem', color: payload[0].payload.color, fontWeight: 800 }}>₹{payload[0].value?.toLocaleString('en-IN')}</Typography>
    </Box>
  );
};

// ─── Area chart tooltip ───────────────────────────────────────────────────────
const AreaTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <Box sx={{ bgcolor: 'white', border: '1px solid', borderColor: alpha('#000', 0.08), borderRadius: 2, p: 1.75, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', minWidth: 160 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', mb: 1 }}>{label}</Typography>
      {payload.map((entry, i) => (
        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: i < payload.length - 1 ? 0.5 : 0 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: entry.color, flexShrink: 0 }} />
          <Typography sx={{ fontSize: '0.79rem', fontWeight: 700 }}>₹{Number(entry.value).toLocaleString('en-IN')}</Typography>
          <Typography variant="caption" color="text.secondary">{entry.name}</Typography>
        </Box>
      ))}
    </Box>
  );
};

// Mounts a Recharts <ResponsiveContainer> chart only while its wrapper is
// actually visible with a real nonzero size — avoids Recharts' "width(0) and
// height(0)" console warning. That warning has two distinct triggers here,
// both from Layout.jsx's keep-alive tab system (`mountedIds`/`activeTabId`,
// `display: activeTabId === tab.id ? 'block' : 'none'`), which never unmounts
// Dashboard once it's been opened:
//   1. First mount, before the wrapper's `display:block` layout has settled.
//   2. ANY LATER RE-RENDER while the tab is backgrounded (`display:none`) —
//      Dashboard keeps a 1s clock `setInterval` running even when hidden, so
//      it keeps re-rendering while the user is on a completely different
//      page (e.g. Parties/Items); once mounted, a plain "did it ever reach a
//      nonzero size" flag (this component's earlier version) stays true
//      forever and no longer protects against those later 0×0 measurements.
// Fixes both by re-checking BOTH size and `display` on every observed resize
// (a `display:none` ancestor is exactly when ResizeObserver reports 0 size,
// so checking size alone already covers the visibility case) and unmounting
// the chart again the instant it goes back to 0×0, not just gating the first
// mount.
const ChartMountGuard = ({ children }) => {
  const ref = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      const visible = el.clientWidth > 0 && el.clientHeight > 0;
      setReady((prev) => (prev === visible ? prev : visible));
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <Box ref={ref} sx={{ width: '100%', height: '100%' }}>
      {ready ? children : null}
    </Box>
  );
};

// ─── Dashboard ────────────────────────────────────────────────────────────────
const Dashboard = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isMd = useMediaQuery(theme.breakpoints.down('md'));
  const { currentBusiness } = useBusiness();
  const { currentUser, currentBusiness: authBusiness } = useAuth();
  // Scoped per the currently-selected LOCAL business (not authBusiness, which
  // is a single account-wide doc) — used for the business code chip below.
  const scopedBiz = useBusinessAuthDoc(currentBusiness, currentUser?.uid || authBusiness?.ownerId);
  const { data, getItems } = useData();
  const { openTab } = useTabs();
  const { config } = useConfig();
  const { t } = useI18n();

  const [codeCopied, setCodeCopied] = useState(false);
  const dash = useMemo(() => resolveDashboard(config?.dashboard), [config?.dashboard]);
  const [period, setPeriod] = useState(() => dash.defaultPeriod);
  const [customRange, setCustomRange] = useState({ from: '', to: '' });
  const [customOpen, setCustomOpen] = useState(false);
  const [customAnchor, setCustomAnchor] = useState(null);
  const [customDraft, setCustomDraft] = useState({ from: '', to: '' });
  const [qrOpen, setQrOpen] = useState(false);
  const [previewTx, setPreviewTx] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activeDonut, setActiveDonut] = useState(null);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  // Day-granular value for `stats` below — stats only ever reads
  // getFullYear/getMonth/getDate off `now` (period boundaries), never
  // hours/minutes/seconds, but was keyed on the live-ticking `now` anyway.
  // That meant the whole stats block — full period filtering + per-bucket
  // .filter()/.reduce() passes over the entire sales/purchases arrays for
  // the chart — recomputed every single second the Dashboard stayed open,
  // even completely idle. `today` only changes identity when the calendar
  // day actually rolls over.
  const today = useMemo(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(), [now]);


  const quickNew = (path, label, intent) => {
    openTab(path, label, { duplicate: path === '/sales' });
    dispatchQuickNew({ path, intent });
  };

  // Shortcuts (Settings → Dashboard). Hidden when their module is switched off.
  const visibleShortcuts = useMemo(
    () => dash.shortcuts.filter(sc => shortcutAvailable(sc, config?.features || {})),
    [dash.shortcuts, config?.features],
  );
  const runShortcut = (sc) => {
    if (sc.type === 'link') {
      const url = /^https?:\/\//i.test(sc.target) ? sc.target : `https://${sc.target}`;
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    const p = presetFor(sc);
    if (!p) return;
    if (sc.type === 'action') quickNew(p.path, p.tab, p.intent);
    else openTab(p.target, p.label);
  };

  // Memoized on the underlying data[table] array (not getItems itself) —
  // getItems's identity changes on every mutation to ANY table (it's a
  // useCallback closing over the whole `data` object), so keying these off
  // getItems meant e.g. adding an expense invalidated the sales/purchases/
  // parties memos too, and transitively every useMemo below that depends on
  // them (cash/bank/lastCashAmounts/stats/etc.) — full re-scans of the whole
  // dataset on every unrelated edit. data[table]'s reference only changes
  // when that specific table is actually mutated.
  const salesRaw = useMemo(
    () => getItems('sales').filter(s => s.businessId === currentBusiness?.id),
    [data.sales, currentBusiness?.id]
  );
  const purchasesRaw = useMemo(
    () => getItems('purchases').filter(p => p.businessId === currentBusiness?.id),
    [data.purchases, currentBusiness?.id]
  );
  const transactions = useMemo(() => [
    ...salesRaw.map(s => ({ ...s, type: 'Sales' })),
    ...purchasesRaw.map(p => ({ ...p, type: 'Purchases' })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date)), [salesRaw, purchasesRaw]);

  // Keep the open preview in sync with live data — InvoicePreviewDialog can
  // now record a payment / mark paid / delete directly from here, and
  // without this, previewTx stays a frozen snapshot from the moment it was
  // opened: the Received Payment button would keep showing (risking a
  // double payment) even after the invoice was just marked paid through it.
  useEffect(() => {
    if (!previewTx) return;
    const live = transactions.find((t) => t.id === previewTx.id);
    if (!live) setPreviewOpen(false);
    else if (live !== previewTx) setPreviewTx(live);
  }, [transactions, previewTx]);
  const expenses = useMemo(
    () => getItems('expenses').filter(e => e.businessId === currentBusiness?.id),
    [data.expenses, currentBusiness?.id]
  );
  const parties = useMemo(
    () => getItems('parties').filter(p => p.businessId === currentBusiness?.id),
    [data.parties, currentBusiness?.id]
  );
  const paymentsRaw = useMemo(
    () => getItems('payments').filter(p => p.businessId === currentBusiness?.id),
    [data.payments, currentBusiness?.id]
  );
  const cashEntriesRaw = useMemo(
    () => getItems('cashEntries').filter(c => c.businessId === currentBusiness?.id),
    [data.cashEntries, currentBusiness?.id]
  );

  const cash = useMemo(() => computeCashInHand({
    openingCash: currentBusiness?.openingCash,
    sales: salesRaw, purchases: purchasesRaw, payments: paymentsRaw, expenses, cashEntries: cashEntriesRaw,
  }), [currentBusiness?.openingCash, salesRaw, purchasesRaw, paymentsRaw, expenses, cashEntriesRaw]);

  const bank = useMemo(() => computeBankBalance({
    openingBank: currentBusiness?.openingBank,
    sales: salesRaw, purchases: purchasesRaw, payments: paymentsRaw, expenses, cashEntries: cashEntriesRaw,
  }), [currentBusiness?.openingBank, salesRaw, purchasesRaw, paymentsRaw, expenses, cashEntriesRaw]);

  // Last cash-in / cash-out amounts (most recent single transaction per direction)
  const _lastCashAmounts = useMemo(() => {
    const isCashMode = (m) => String(m || '').trim().toLowerCase() === 'cash';
    const isSplitMode = (m) => String(m || '').trim().toLowerCase() === 'split';
    const CARRY = ['cash & carry', 'cash purchase', 'cash sale'];
    const isCashCarry = (r) => !r.partyId && (!r.partyName || CARRY.includes(String(r.partyName).trim().toLowerCase()));
    const cashAmt = (r, key = 'totalAmount') => isCashMode(r.paymentMode) ? (Number(r[key]) || 0) : (Number(r.paymentSplit?.cash) || 0);

    const allIn = [
      ...salesRaw.filter(s => (isCashMode(s.paymentMode) || isSplitMode(s.paymentMode)) && (s.status === 'paid' || isCashCarry(s))).map(s => ({ date: s.date, amt: cashAmt(s) })),
      ...paymentsRaw.filter(p => p.type === 'PaymentIn' && (isCashMode(p.paymentMode) || isSplitMode(p.paymentMode))).map(p => ({ date: p.date, amt: cashAmt(p) })),
      ...cashEntriesRaw.filter(c => c.type === 'in').map(c => ({ date: c.date, amt: Number(c.amount) || 0 })),
    ].filter(x => x.amt > 0).sort((a, b) => b.date?.localeCompare(a.date));

    const allOut = [
      ...purchasesRaw.filter(p => (isCashMode(p.paymentMode) || isSplitMode(p.paymentMode)) && (p.status === 'paid' || isCashCarry(p))).map(p => ({ date: p.date, amt: cashAmt(p) })),
      ...paymentsRaw.filter(p => p.type === 'PaymentOut' && (isCashMode(p.paymentMode) || isSplitMode(p.paymentMode))).map(p => ({ date: p.date, amt: cashAmt(p) })),
      ...expenses.filter(e => e.paymentMode == null || isCashMode(e.paymentMode) || isSplitMode(e.paymentMode)).map(e => ({ date: e.date, amt: isSplitMode(e.paymentMode) ? (Number(e.paymentSplit?.cash) || 0) : (Number(e.amount) || 0) })),
      ...cashEntriesRaw.filter(c => c.type === 'out').map(c => ({ date: c.date, amt: Number(c.amount) || 0 })),
    ].filter(x => x.amt > 0).sort((a, b) => b.date?.localeCompare(a.date));

    return { lastIn: allIn[0]?.amt ?? 0, lastOut: allOut[0]?.amt ?? 0 };
  }, [salesRaw, purchasesRaw, paymentsRaw, expenses, cashEntriesRaw]);

  const _lastBankAmounts = useMemo(() => {
    const isDigitalMode = (m) => { const s = String(m || '').trim().toLowerCase(); return s === 'bank' || s === 'cheque' || s === 'neft' || s === 'rtgs' || s === 'upi' || s === 'card'; };
    const isSplitMode = (m) => String(m || '').trim().toLowerCase() === 'split';
    const CARRY = ['cash & carry', 'cash purchase', 'cash sale'];
    const isCashCarry = (r) => !r.partyId && (!r.partyName || CARRY.includes(String(r.partyName).trim().toLowerCase()));
    const bankAmt = (r, key = 'totalAmount') => isDigitalMode(r.paymentMode) ? (Number(r[key]) || 0) : (Number(r.paymentSplit?.bank) || 0);

    const allIn = [
      ...salesRaw.filter(s => (isDigitalMode(s.paymentMode) || isSplitMode(s.paymentMode)) && (s.status === 'paid' || isCashCarry(s))).map(s => ({ date: s.date, amt: bankAmt(s) })),
      ...paymentsRaw.filter(p => p.type === 'PaymentIn' && (isDigitalMode(p.paymentMode) || isSplitMode(p.paymentMode))).map(p => ({ date: p.date, amt: bankAmt(p) })),
      ...cashEntriesRaw.filter(c => c.type === 'bank_in').map(c => ({ date: c.date, amt: Number(c.amount) || 0 })),
    ].filter(x => x.amt > 0).sort((a, b) => b.date?.localeCompare(a.date));

    const allOut = [
      ...purchasesRaw.filter(p => (isDigitalMode(p.paymentMode) || isSplitMode(p.paymentMode)) && (p.status === 'paid' || isCashCarry(p))).map(p => ({ date: p.date, amt: bankAmt(p) })),
      ...paymentsRaw.filter(p => p.type === 'PaymentOut' && (isDigitalMode(p.paymentMode) || isSplitMode(p.paymentMode))).map(p => ({ date: p.date, amt: bankAmt(p) })),
      ...expenses.filter(e => isDigitalMode(e.paymentMode) || isSplitMode(e.paymentMode)).map(e => ({ date: e.date, amt: isSplitMode(e.paymentMode) ? (Number(e.paymentSplit?.bank) || 0) : (Number(e.amount) || 0) })),
      ...cashEntriesRaw.filter(c => c.type === 'bank_out').map(c => ({ date: c.date, amt: Number(c.amount) || 0 })),
    ].filter(x => x.amt > 0).sort((a, b) => b.date?.localeCompare(a.date));

    return { lastIn: allIn[0]?.amt ?? 0, lastOut: allOut[0]?.amt ?? 0 };
  }, [salesRaw, purchasesRaw, paymentsRaw, expenses, cashEntriesRaw]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const dayMs = 86400000;
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    let periodStart, periodEnd, prevStart, prevEnd;
    if (period === 'day') {
      // Today only
      periodStart = todayStart; periodEnd = todayEnd;
      prevStart = new Date(todayStart - dayMs); prevEnd = new Date(todayEnd - dayMs);
    } else if (period === 'week') {
      // Sun–Sat of the current calendar week
      const dow = todayStart.getDay(); // 0=Sun
      periodStart = new Date(+todayStart - dow * dayMs); // back to Sunday
      periodEnd = todayEnd;
      prevStart = new Date(+periodStart - 7 * dayMs);
      prevEnd = new Date(+periodStart - 1);
    } else if (period === 'month') {
      // 1st–today of the current calendar month
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      periodEnd = todayEnd;
      prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    } else if (period === 'year') {
      // Jan 1–today of the current calendar year
      periodStart = new Date(now.getFullYear(), 0, 1);
      periodEnd = todayEnd;
      prevStart = new Date(now.getFullYear() - 1, 0, 1);
      prevEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
    } else {
      // Custom range
      const from = customRange.from ? new Date(customRange.from + 'T00:00:00') : todayStart;
      const to   = customRange.to   ? new Date(customRange.to   + 'T23:59:59') : todayEnd;
      periodStart = from; periodEnd = to;
      const span = to - from;
      prevEnd = new Date(+from - 1);
      prevStart = new Date(+prevEnd - span);
    }

    const inRange = (d, s, e) => { const t = new Date(d + 'T12:00:00'); return t >= s && t <= e; };
    const sum = (arr) => arr.reduce((a, t) => a + (t.totalAmount || 0), 0);

    const sales = transactions.filter(t => t.type === 'Sales');
    const purchases = transactions.filter(t => t.type === 'Purchases');
    const curSales  = sales.filter(t => inRange(t.date, periodStart, periodEnd));
    const prevSales = sales.filter(t => inRange(t.date, prevStart, prevEnd));
    const curPurch  = purchases.filter(t => inRange(t.date, periodStart, periodEnd));
    const prevPurch = purchases.filter(t => inRange(t.date, prevStart, prevEnd));
    const trend = (cur, prev) => { const c = sum(cur), p = sum(prev); return p === 0 ? (c > 0 ? 100 : 0) : ((c - p) / p) * 100; };

    const customers = parties.filter(p => p.type === 'Customer');
    const vendors   = parties.filter(p => p.type === 'Vendor');
    const toGet  = customers.reduce((a, p) => a + Math.max(0, p.balance || 0), 0);
    const toGive = vendors.reduce((a, p) => a + (p.balance < 0 ? -p.balance : 0), 0);
    const vendorsWithBalance = vendors.filter(v => (v.balance || 0) < 0).sort((a, b) => (a.balance || 0) - (b.balance || 0));

    const totalExpenses = expenses
      .filter(e => inRange(e.date, periodStart, periodEnd))
      .reduce((a, e) => a + e.amount, 0);

    // Expense breakdown by category for donut
    const expenseByCat = {};
    expenses.filter(e => inRange(e.date, periodStart, periodEnd)).forEach(e => {
      const cat = e.category || e.type || 'Other';
      expenseByCat[cat] = (expenseByCat[cat] || 0) + e.amount;
    });
    const DONUT_COLORS = ['#5c1f22', '#b08d57', '#8a3a3d', '#d4b88f', '#3f1417', '#9c8174', '#e2cfb6', '#6b4c43'];
    const expenseDonut = Object.entries(expenseByCat)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([name, value], i) => ({ name, value, color: DONUT_COLORS[i % DONUT_COLORS.length] }));

    // Chart data
    const daysBetween = (a, b) => Math.round((b - a) / dayMs);
    let chartData = [];
    if (period === 'day') {
      chartData = [{ label: 'Today', sales: sum(curSales), purchases: sum(curPurch) }];
    } else if (period === 'week') {
      // Always show all 7 days Sun–Sat; future days show 0
      chartData = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(+periodStart + i * dayMs);
        const ds = d.toISOString().split('T')[0];
        const isFuture = d > todayEnd;
        return { label: d.toLocaleDateString(undefined, { weekday: 'short' }), sales: isFuture ? 0 : sales.filter(t => t.date === ds).reduce((a, t) => a + t.totalAmount, 0), purchases: isFuture ? 0 : purchases.filter(t => t.date === ds).reduce((a, t) => a + t.totalAmount, 0) };
      });
    } else if (period === 'month') {
      // 1st through today of current month
      const numDays = now.getDate();
      chartData = Array.from({ length: numDays }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth(), i + 1);
        const ds = d.toISOString().split('T')[0];
        return { label: String(i + 1), sales: sales.filter(t => t.date === ds).reduce((a, t) => a + t.totalAmount, 0), purchases: purchases.filter(t => t.date === ds).reduce((a, t) => a + t.totalAmount, 0) };
      });
    } else if (period === 'year') {
      // Jan through current month of this year
      const numMonths = now.getMonth() + 1;
      chartData = Array.from({ length: numMonths }, (_, i) => {
        const ms = new Date(now.getFullYear(), i, 1);
        const me = i === now.getMonth()
          ? todayEnd
          : new Date(now.getFullYear(), i + 1, 0, 23, 59, 59, 999);
        return {
          label: ms.toLocaleDateString(undefined, { month: 'short' }),
          sales:     sales.filter(t => { const x = new Date(t.date + 'T12:00:00'); return x >= ms && x <= me; }).reduce((a, t) => a + t.totalAmount, 0),
          purchases: purchases.filter(t => { const x = new Date(t.date + 'T12:00:00'); return x >= ms && x <= me; }).reduce((a, t) => a + t.totalAmount, 0),
        };
      });
    } else {
      // Custom: if span <= 31 days → daily, else → monthly buckets
      const spanDays = daysBetween(periodStart, periodEnd) + 1;
      if (spanDays <= 31) {
        chartData = Array.from({ length: spanDays }, (_, i) => {
          const d = new Date(+periodStart + i * dayMs);
          const ds = d.toISOString().split('T')[0];
          return { label: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), sales: sales.filter(t => t.date === ds).reduce((a, t) => a + t.totalAmount, 0), purchases: purchases.filter(t => t.date === ds).reduce((a, t) => a + t.totalAmount, 0) };
        });
      } else {
        // Monthly buckets covering the range
        const startMon = new Date(periodStart.getFullYear(), periodStart.getMonth(), 1);
        const endMon   = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1);
        const months = [];
        for (let d = new Date(startMon); d <= endMon; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.push(new Date(d));
        chartData = months.map(ms => {
          const me = new Date(ms.getFullYear(), ms.getMonth() + 1, 0, 23, 59, 59, 999);
          const s = ms < periodStart ? periodStart : ms;
          const e = me > periodEnd   ? periodEnd   : me;
          return {
            label: ms.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
            sales:     sales.filter(t => { const x = new Date(t.date + 'T12:00:00'); return x >= s && x <= e; }).reduce((a, t) => a + t.totalAmount, 0),
            purchases: purchases.filter(t => { const x = new Date(t.date + 'T12:00:00'); return x >= s && x <= e; }).reduce((a, t) => a + t.totalAmount, 0),
          };
        });
      }
    }

    // Sparkline data per KPI (last 7 data points)
    const sparkSales = chartData.slice(-7).map(d => ({ v: d.sales }));
    const sparkPurch = chartData.slice(-7).map(d => ({ v: d.purchases }));

    return {
      totalSales: sum(curSales), totalPurchases: sum(curPurch),
      salesTrend: trend(curSales, prevSales), purchaseTrend: trend(curPurch, prevPurch),
      toGet, toGive, vendorsWithBalance, totalExpenses, chartData,
      expenseDonut, sparkSales, sparkPurch,
      trendLabel: period === 'day' ? 'vs yesterday' : period === 'week' ? 'vs prev week' : period === 'month' ? 'vs prev month' : period === 'year' ? 'vs prev year' : 'vs prior period',
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `today` (day-granular) intentionally replaces `now` (ticks every second) here; see comment above `today`'s definition.
  }, [transactions, parties, expenses, period, customRange, today]);

  const recentTx = useMemo(() => transactions.slice(0, 10), [transactions]);

  const examReminders = useMemo(() => {
    const DAYS = { '1month': 30, '2months': 60, '6months': 182, '1year': 365 };
    const today = new Date();
    return getItems('opticals')
      .filter(o => o.businessId === currentBusiness?.id && o.examReminder && o.examReminder !== 'off')
      .filter(o => { const d = DAYS[o.examReminder]; return d && today >= new Date(new Date(o.date + 'T12:00:00').getTime() + d * 86400000); })
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [data.opticals, currentBusiness]);

  // Overdue bills/invoices only — a bill counts as overdue when it has a due
  // date, isn't marked paid, AND that due date is in the past. Matches the
  // same `dueDate && status !== 'paid' && dueDate < today` convention used
  // everywhere in Sales.jsx (list rows, preview header, status chip). A paid
  // bill must never appear here even if its `dueDate` field was left set.
  const dueDates = useMemo(() => {
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const isOverdue = (tx) =>
      tx.dueDate &&
      tx.status !== 'paid' &&
      new Date(tx.dueDate + 'T00:00:00') < startOfToday;
    return [
      ...salesRaw.filter(isOverdue).map(s => ({ ...s, txType: 'Sale', type: 'Sales' })),
      ...purchasesRaw.filter(isOverdue).map(p => ({ ...p, txType: 'Purchase', type: 'Purchases' })),
    ]
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)) // oldest overdue first
      .slice(0, 6);
  }, [salesRaw, purchasesRaw]);

  const PERIOD_LABELS = { day: 'Today', week: 'This Week', month: 'This Month', year: 'This Year', custom: customRange.from && customRange.to ? `${customRange.from} – ${customRange.to}` : 'Custom' };

  return (
    <Box sx={{ bgcolor: 'background.default', minHeight: '100vh', pb: 6 }}>

      {/* ── Command bar: business name + date + period picker + actions ── */}
      <Box sx={{
        mb: 3, px: 0, pt: 0.5,
        display: 'flex', flexDirection: 'column', gap: 1.5,
      }}>
        {/* Top bar: business name + period + actions */}
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'stretch', sm: 'center' }, justifyContent: 'space-between', gap: 1.5 }}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            {currentBusiness?.logo && (
              <Box sx={{ width: 38, height: 38, borderRadius: 2, overflow: 'hidden', flexShrink: 0, bgcolor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid', borderColor: 'divider' }}>
                <img src={currentBusiness.logo} alt={currentBusiness.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </Box>
            )}
            <Box>
              <Typography sx={{ fontSize: '0.66rem', fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: D.gold, mb: 0.5 }}>
                {now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
              </Typography>
              <Typography sx={{ fontFamily: D.serif, fontWeight: 500, fontSize: { xs: '1.5rem', sm: '1.9rem' }, letterSpacing: '-0.02em', color: D.ink, lineHeight: 1.1 }}>
                {currentBusiness?.name || 'Your Business'}
              </Typography>
              {scopedBiz?.businessCode && (
                <Tooltip title={codeCopied ? 'Copied!' : 'Click to copy business code'} placement="bottom-start">
                  <Chip
                    size="small"
                    icon={codeCopied ? <Check size={11} /> : <Copy size={11} />}
                    label={`Code: ${scopedBiz.businessCode}`}
                    onClick={() => {
                      navigator.clipboard.writeText(scopedBiz.businessCode).catch(() => {});
                      setCodeCopied(true);
                      setTimeout(() => setCodeCopied(false), 2000);
                    }}
                    sx={{
                      mt: 0.75,
                      height: 22,
                      fontFamily: 'monospace',
                      fontWeight: 600,
                      fontSize: '0.66rem',
                      letterSpacing: '0.08em',
                      cursor: 'pointer',
                      bgcolor: codeCopied ? alpha(D.green, 0.08) : 'transparent',
                      color: codeCopied ? D.green : D.soft,
                      border: '1px solid',
                      borderColor: codeCopied ? alpha(D.green, 0.35) : D.line,
                      '& .MuiChip-icon': { color: 'inherit' },
                      transition: 'all 0.2s ease',
                    }}
                  />
                </Tooltip>
              )}
            </Box>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" gap={1} sx={{ alignSelf: { xs: 'flex-end', sm: 'auto' } }}>
            <Box sx={{ display: 'flex', bgcolor: '#f3ece5', borderRadius: 999, p: 0.4, gap: 0.25, border: `1px solid ${D.line}` }}>
              {(['day', 'week', 'month', 'year']).map(p => (
                <Box key={p} onClick={() => setPeriod(p)} sx={{
                  px: { xs: 1, sm: 1.6 }, py: 0.6, borderRadius: 999, cursor: 'pointer', userSelect: 'none',
                  bgcolor: period === p ? theme.palette.primary.main : 'transparent',
                  color: period === p ? theme.palette.primary.contrastText : D.muted,
                  boxShadow: period === p ? `0 2px 8px ${alpha(theme.palette.primary.main, 0.3)}` : 'none',
                  fontWeight: period === p ? 600 : 500, fontSize: { xs: '0.72rem', sm: '0.78rem' },
                  transition: 'all 0.18s ease',
                  '&:hover': { color: period === p ? theme.palette.primary.contrastText : theme.palette.primary.main },
                }}>
                  {isMobile ? p.charAt(0).toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1)}
                </Box>
              ))}
              {/* Custom range button */}
              <Box onClick={(e) => { setCustomDraft(customRange.from ? customRange : { from: '', to: '' }); setCustomAnchor(e.currentTarget); setCustomOpen(true); }} sx={{
                display: 'flex', alignItems: 'center', gap: 0.5,
                px: { xs: 1, sm: 1.6 }, py: 0.6, borderRadius: 999, cursor: 'pointer', userSelect: 'none',
                bgcolor: period === 'custom' ? theme.palette.primary.main : 'transparent',
                color: period === 'custom' ? theme.palette.primary.contrastText : D.muted,
                boxShadow: period === 'custom' ? `0 2px 8px ${alpha(theme.palette.primary.main, 0.3)}` : 'none',
                fontWeight: period === 'custom' ? 600 : 500, fontSize: { xs: '0.72rem', sm: '0.78rem' },
                transition: 'all 0.18s ease',
                '&:hover': { color: period === 'custom' ? theme.palette.primary.contrastText : theme.palette.primary.main },
              }}>
                <CalendarDays size={12} />
                {!isMobile && <span>Custom</span>}
              </Box>
            </Box>
            {currentBusiness?.qrCode && (
              <Tooltip title="Show payment QR">
                <IconButton size="small" onClick={() => setQrOpen(true)} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                  <QrCode size={16} />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        </Box>
        {/* Custom date range popover */}
        <Popover
          open={customOpen}
          anchorEl={customAnchor}
          onClose={() => setCustomOpen(false)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          PaperProps={{ sx: { borderRadius: 2.5, p: 2, width: 260, boxShadow: '0 8px 32px rgba(0,0,0,0.12)' } }}
        >
          <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', mb: 1.5, color: 'text.primary' }}>Custom Range</Typography>
          <Stack spacing={1.25}>
            <TextField size="small" type="date" label="From" fullWidth
              value={customDraft.from}
              onChange={e => setCustomDraft(d => ({ ...d, from: e.target.value }))}
              slotProps={{ inputLabel: { shrink: true } }} />
            <TextField size="small" type="date" label="To" fullWidth
              value={customDraft.to}
              onChange={e => setCustomDraft(d => ({ ...d, to: e.target.value }))}
              slotProps={{ inputLabel: { shrink: true } }} />
            <Button fullWidth variant="contained" size="small" disableElevation
              disabled={!customDraft.from || !customDraft.to || customDraft.from > customDraft.to}
              onClick={() => { setCustomRange(customDraft); setPeriod('custom'); setCustomOpen(false); }}
              sx={{ fontWeight: 700, borderRadius: 1.5, textTransform: 'none', bgcolor: BRAND.teal, '&:hover': { bgcolor: BRAND.tealDark } }}>
              Apply
            </Button>
          </Stack>
        </Popover>


      </Box>


      {/* ── Widgets: order + visibility from Settings → Dashboard ── */}
      {(() => {
        const renderWidget = (key) => {
          switch (key) {
            case 'shortcuts':
              return visibleShortcuts.length > 0 ? (
                <Box key="shortcuts" sx={{ minWidth: 0, height: "100%" }}>
                  <DashboardShortcuts shortcuts={visibleShortcuts} onRun={runShortcut} />
                </Box>
              ) : null;
            case 'summary':
              return DASHBOARD_KPIS.some(k => dash.kpis[k.id] !== false) ? (
                <Box key="summary" sx={{ minWidth: 0 }}>
                  <KpiSections stats={stats} cash={cash} bank={bank} kpis={dash.kpis} onQuickNew={quickNew} periodLabel={PERIOD_LABELS[period]} />
                </Box>
              ) : null;
            case 'chart':
              return (
              <Box key="chart" sx={{ minWidth: 0, height: "100%" }}>
                <Card elevation={0} sx={cardSx}>
                  <CardHead icon={Activity} title={`${PERIOD_LABELS[period]} · Sales & Purchase`} subtitle="Sales vs purchases over time"
                    right={(
                      <Stack direction="row" spacing={2}>
                        {[{ color: D.ox, label: 'Sales' }, { color: D.gold, label: 'Purchase' }].map(({ color, label }) => (
                          <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color }} />
                            <Typography sx={{ fontWeight: 500, fontSize: '0.74rem', color: D.muted }}>{label}</Typography>
                          </Box>
                        ))}
                      </Stack>
                    )} />
                  <Box sx={{ p: { xs: 1, sm: 2 }, height: { xs: 230, sm: 290 } }}>
                    <ChartMountGuard>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={stats.chartData} margin={{ top: 8, right: 4, left: isMobile ? -28 : -16, bottom: 0 }}>
                          <defs>
                            <linearGradient id="gSales" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={D.ox} stopOpacity={0.18} />
                              <stop offset="100%" stopColor={D.ox} stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="gPurch" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={D.gold} stopOpacity={0.18} />
                              <stop offset="100%" stopColor={D.gold} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid vertical={false} stroke={D.lineSoft} />
                          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: D.muted, fontSize: 11, fontWeight: 500 }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: D.muted, fontSize: 11 }} tickFormatter={v => v >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : `₹${v}`} />
                          <ReTooltip content={<AreaTooltip />} />
                          <Area type="monotone" dataKey="sales" stroke={D.ox} strokeWidth={2} fill="url(#gSales)" name="Sales" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                          <Area type="monotone" dataKey="purchases" stroke={D.gold} strokeWidth={2} fill="url(#gPurch)" name="Purchase" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </ChartMountGuard>
                  </Box>
                </Card>
              </Box>
              );
            case 'expenses':
              return (
              <Box key="expenses" sx={{ minWidth: 0, height: "100%" }}>
                <Card elevation={0} sx={cardSx}>
                  <CardHead icon={PieChartIcon} title="Expense Breakdown" subtitle={`By category · ${PERIOD_LABELS[period].toLowerCase()}`} />
                  {stats.expenseDonut.length === 0 ? (
                    <Box sx={{ py: 6, textAlign: 'center', opacity: 0.4 }}>
                      <PieChartIcon size={32} strokeWidth={1.2} />
                      <Typography variant="body2" sx={{ mt: 1, fontWeight: 500 }}>No expense data</Typography>
                    </Box>
                  ) : (
                    <Box sx={{ px: 2, pt: 1, pb: 2 }}>
                      <Box sx={{ height: 180, position: 'relative' }}>
                        <ChartMountGuard>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={stats.expenseDonut}
                                cx="50%" cy="50%"
                                innerRadius="54%" outerRadius="80%"
                                paddingAngle={2}
                                dataKey="value"
                                onMouseEnter={(_, idx) => setActiveDonut(idx)}
                                onMouseLeave={() => setActiveDonut(null)}
                                isAnimationActive
                                animationDuration={200}
                                animationEasing="ease-out"
                              >
                                {stats.expenseDonut.map((entry, i) => (
                                  <Cell
                                    key={i}
                                    fill={entry.color}
                                    opacity={activeDonut === null || activeDonut === i ? 1 : 0.45}
                                    stroke="none"
                                  />
                                ))}
                              </Pie>
                              <ReTooltip content={<DonutTooltip />} />
                            </PieChart>
                          </ResponsiveContainer>
                        </ChartMountGuard>
                        {/* Center label */}
                        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                          <Typography sx={{ fontFamily: D.serif, fontSize: '1.35rem', fontWeight: 500, color: D.ink, letterSpacing: '-0.02em', lineHeight: 1 }}>
                            ₹{stats.totalExpenses >= 1000 ? `${(stats.totalExpenses / 1000).toFixed(1)}k` : stats.totalExpenses.toLocaleString('en-IN')}
                          </Typography>
                          <Typography sx={{ fontSize: '0.62rem', color: 'text.disabled', fontWeight: 600, mt: 0.25 }}>total</Typography>
                        </Box>
                      </Box>
                      {/* Legend */}
                      <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                        {stats.expenseDonut.slice(0, 4).map((entry, i) => (
                          <Stack key={i} direction="row" alignItems="center" justifyContent="space-between">
                            <Stack direction="row" alignItems="center" spacing={0.75}>
                              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: entry.color, flexShrink: 0 }} />
                              <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', fontWeight: 500 }} noWrap>{entry.name}</Typography>
                            </Stack>
                            <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: 'text.primary', ml: 1, flexShrink: 0 }}>
                              ₹{entry.value.toLocaleString('en-IN')}
                            </Typography>
                          </Stack>
                        ))}
                      </Stack>
                    </Box>
                  )}
                </Card>
              </Box>
              );
            case 'activity':
              return (
              <Box key="activity" sx={{ minWidth: 0, height: "100%" }}>
                <Card elevation={0} sx={{ ...cardSx, display: 'flex', flexDirection: 'column', maxHeight: 470 }}>
                  <CardHead icon={Layers} title="Activity" subtitle={`${recentTx.length} recent entries`}
                    right={(
                      <Button size="small" endIcon={<ChevronRight size={13} />} onClick={() => openTab('/sales', 'Sales')}
                        sx={{ fontSize: '0.74rem', textTransform: 'none', color: D.ox, p: 0, minWidth: 0, fontWeight: 600, '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' } }}>
                        View all
                      </Button>
                    )} />
                  <Box sx={{ flex: 1, overflow: 'auto', py: 0.5 }}>
                    {recentTx.length === 0 ? (
                      <Box sx={{ py: 6, textAlign: 'center', opacity: 0.38 }}>
                        <Activity size={32} strokeWidth={1.2} />
                        <Typography variant="body2" sx={{ mt: 1, fontWeight: 500 }}>No transactions yet</Typography>
                      </Box>
                    ) : (
                      recentTx.map((tx, idx) => {
                        const isSale = tx.type === 'Sales';
                        const clr = isSale ? D.ox : D.gold;
                        const IcoComp = isSale ? ReceiptText : ShoppingBag;
                        return (
                          <Box key={tx.id}
                            onClick={() => { setPreviewTx(tx); setPreviewOpen(true); }}
                            sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, px: 2.5, py: 1, cursor: 'pointer', '&:hover': { bgcolor: '#faf6f2' }, position: 'relative' }}>
                            {/* Timeline dot + line */}
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, flexShrink: 0, pt: 0.25 }}>
                              <Box sx={{ width: 28, height: 28, borderRadius: '50%', border: `1px solid ${alpha(clr, 0.35)}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <IcoComp size={13} color={clr} />
                              </Box>
                              {idx < recentTx.length - 1 && (
                                <Box sx={{ width: '1px', flex: 1, minHeight: 12, bgcolor: D.line, mt: 0.4 }} />
                              )}
                            </Box>
                            <Box sx={{ flex: 1, minWidth: 0, pb: idx < recentTx.length - 1 ? 1 : 0 }}>
                              <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                                <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.79rem', lineHeight: 1.3 }} noWrap>
                                  {tx.partyName || (isSale ? 'Cash & Carry' : 'Cash Purchase')}
                                </Typography>
                                <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: isSale ? D.green : D.ink, ml: 1, flexShrink: 0, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                                  {isSale ? '+' : '−'}₹{tx.totalAmount?.toLocaleString('en-IN') ?? '0'}
                                </Typography>
                              </Stack>
                              <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mt: 0.25 }}>
                                <Typography variant="caption" sx={{ fontSize: '0.68rem', color: D.muted }}>{tx.date}</Typography>
                                <Box sx={{ width: 3, height: 3, borderRadius: '50%', bgcolor: D.line }} />
                                <Typography variant="caption" sx={{ fontSize: '0.68rem', color: D.muted }}>{tx.type}</Typography>
                              </Stack>
                            </Box>
                          </Box>
                        );
                      })
                    )}
                  </Box>
                </Card>
              </Box>
              );
            case 'overdue':
              return (
              <Box key="overdue" sx={{ minWidth: 0, height: "100%" }}>
                <Card elevation={0} sx={cardSx}>
                  <CardHead icon={Clock} title="Overdue" subtitle="Unpaid, past due date"
                    right={dueDates.length > 0 ? <CountPill color={D.red}>{dueDates.length}</CountPill> : null} />
                  {dueDates.length === 0 ? (
                    <Box sx={{ py: 5, textAlign: 'center', opacity: 0.4 }}>
                      <Clock size={28} strokeWidth={1.3} />
                      <Typography variant="body2" sx={{ mt: 1, fontWeight: 500 }}>No overdue bills</Typography>
                    </Box>
                  ) : (
                    dueDates.map((tx, idx) => {
                      const clr = D.red;
                      const daysLate = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(tx.dueDate + 'T00:00:00')) / 86400000);
                      return (
                        <Box key={tx.id}>
                          <Stack direction="row" alignItems="center" spacing={1.25}
                            onClick={() => { setPreviewTx(tx); setPreviewOpen(true); }}
                            sx={{ px: 2.5, py: 1.2, cursor: 'pointer', '&:hover': { bgcolor: '#faf6f2' } }}>
                            <Box sx={{ width: 30, height: 30, borderRadius: '50%', border: `1px solid ${D.line}`, flexShrink: 0, display: 'grid', placeItems: 'center' }}>
                              <FileText size={13} color={D.soft} />
                            </Box>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.79rem' }} noWrap>{tx.partyName}</Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>{tx.txType} · due {tx.dueDate}</Typography>
                            </Box>
                            <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                              <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: D.ink, fontVariantNumeric: 'tabular-nums' }}>₹{tx.totalAmount?.toLocaleString('en-IN')}</Typography>
                              <Typography sx={{ fontSize: '0.66rem', fontWeight: 600, color: clr, mt: 0.2 }}>{daysLate > 0 ? `${daysLate} days late` : 'Overdue'}</Typography>
                            </Box>
                          </Stack>
                          {idx < dueDates.length - 1 && <Divider sx={{ mx: 2.5, borderColor: D.lineSoft }} />}
                        </Box>
                      );
                    })
                  )}
                </Card>
              </Box>
              );
            case 'payables':
              return stats.vendorsWithBalance.length > 0 ? (
              <Box key="payables" sx={{ minWidth: 0, height: "100%" }}>
                <Card elevation={0} sx={cardSx}>
                  <CardHead icon={Upload} title={t('dash.vendorPayables')} subtitle="Amounts owed to vendors"
                    right={<CountPill color="#9a6517">₹{stats.toGive.toLocaleString('en-IN')}</CountPill>} />
                  <Stack spacing={0}>
                    {stats.vendorsWithBalance.slice(0, 10).map((v, idx, arr) => {
                      const owed = (v.balance || 0) < 0 ? -v.balance : 0;
                      return (
                        <Box key={v.id}>
                          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ px: 2.5, py: 1.2 }}>
                            <Avatar sx={{ width: 30, height: 30, fontSize: '0.74rem', fontWeight: 600, bgcolor: '#f3ece5', color: D.soft, flexShrink: 0 }}>
                              {v.name?.[0]?.toUpperCase() || 'V'}
                            </Avatar>
                            <Typography variant="body2" sx={{ flex: 1, fontWeight: 600, fontSize: '0.79rem' }} noWrap>{v.name}</Typography>
                            <Typography sx={{ fontWeight: 600, color: D.ink, whiteSpace: 'nowrap', fontSize: '0.82rem', fontVariantNumeric: 'tabular-nums' }}>
                              ₹{owed.toLocaleString('en-IN')}
                            </Typography>
                          </Stack>
                          {idx < arr.length - 1 && <Divider sx={{ mx: 2.5, borderColor: D.lineSoft }} />}
                        </Box>
                      );
                    })}
                    {stats.vendorsWithBalance.length > 10 && (
                      <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 1, display: 'block', textAlign: 'center' }}>
                        +{stats.vendorsWithBalance.length - 10} more vendors
                      </Typography>
                    )}
                  </Stack>
                </Card>
              </Box>
              ) : null;
            case 'notes':
              return <Box key="notes" sx={{ minWidth: 0 }}><NotesBoard /></Box>;
            case 'examReminders':
              return examReminders.length > 0 ? (
                <Box key="examReminders" sx={{ minWidth: 0, height: "100%" }}>
                  <Card elevation={0} sx={{ ...cardSx, height: 'auto' }}>
                    <CardHead icon={Bell} title={t('dash.examReminders')} right={<CountPill color="#9a6517">{examReminders.length}</CountPill>} />
                    <Stack spacing={0}>
                      {examReminders.slice(0, 5).map((o, idx) => (
                        <Box key={o.id}>
                          <Stack direction="row" alignItems="center" spacing={1.25} sx={{ px: 2.5, py: 1.2 }}>
                            <Avatar sx={{ width: 32, height: 32, fontSize: '0.75rem', fontWeight: 800, bgcolor: alpha('#d97706', 0.12), color: '#d97706', flexShrink: 0 }}>
                              {(o.patientName || '?')[0].toUpperCase()}
                            </Avatar>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.79rem' }} noWrap>{o.patientName}</Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>Exam {o.date} · {o.examReminder}</Typography>
                            </Box>
                            <Chip label="Due" size="small" color="warning" variant="outlined" sx={{ fontWeight: 700, fontSize: '0.66rem', height: 20 }} />
                          </Stack>
                          {idx < Math.min(examReminders.length, 5) - 1 && <Divider sx={{ mx: 2.5 }} />}
                        </Box>
                      ))}
                    </Stack>
                  </Card>
                </Box>
              ) : null;
            default:
              return null;
          }
        };
        // Desktop: main column + a right rail for "needs attention" lists.
        // Settings → Dashboard still controls visibility and order (within
        // each column). Narrow screens show everything in one column.
        const RAIL = new Set(['overdue', 'payables', 'examReminders']);
        const HALF = new Set(['expenses', 'activity']);
        const keys = dash.widgets.filter(w => w.visible).map(w => w.key);
        const mainKeys = keys.filter(k => !RAIL.has(k));
        const railKeys = keys.filter(k => RAIL.has(k));
        // Chart + Notes always share a row (half width each) when both are on;
        // other adjacent half-width widgets (expense donut + activity) too.
        const pairNotes = mainKeys.includes('chart') && mainKeys.includes('notes');
        const mainBlocks = [];
        mainKeys.forEach((k) => {
          if (pairNotes && k === 'notes') return;
          if (pairNotes && k === 'chart') { mainBlocks.push(['chart', 'notes']); return; }
          const last = mainBlocks[mainBlocks.length - 1];
          if (HALF.has(k) && Array.isArray(last) && last.length === 1) last.push(k);
          else mainBlocks.push(HALF.has(k) ? [k] : k);
        });
        const showClockCard = dash.showClock && keys.includes('summary');
        const railItems = railKeys.map(k => ({ k, node: renderWidget(k) })).filter(x => x.node);
        return (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) 340px' }, gap: 2.5, alignItems: 'start' }}>
            <Stack spacing={2.5} sx={{ minWidth: 0 }}>
              {mainBlocks.map((b) => (Array.isArray(b) ? (
                <Box key={b.join('+')} sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: b.length > 1 ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)' }, gap: 2.5 }}>
                  {b.map(renderWidget)}
                </Box>
              ) : renderWidget(b)))}
            </Stack>
            {(showClockCard || railItems.length > 0) && (
              <Stack spacing={2.5} sx={{ minWidth: 0, position: { lg: 'sticky' }, top: { lg: 16 } }}>
                {showClockCard && (
                  <ClockCalendarWidget
                    now={now}
                    accentColor={BRAND.teal}
                    bgColor={`linear-gradient(150deg, ${D.ox} 0%, ${D.oxDeep} 100%)`}
                    textOnBg="#f6ecdf"
                    stats={stats}
                    kpis={NO_KPIS}
                    showClock
                    rail
                  />
                )}
                {railItems.map(x => x.node)}
              </Stack>
            )}
          </Box>
        );
      })()}

      {/* ── QR Code Dialog ── */}
      <Dialog open={qrOpen} onClose={() => setQrOpen(false)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: 4, overflow: 'hidden', background: '#ffffff', border: '1px solid #ece2db' } }}>
        <DialogContent sx={{ p: 0 }}>
          <Box sx={{ px: 3, pt: 3, pb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: 'rgba(92,31,34,0.08)', display: 'flex' }}>
                <QrCode size={17} color="#5c1f22" />
              </Box>
              <Box>
                <Typography sx={{ fontWeight: 800, color: '#5c1f22', fontSize: '0.95rem', lineHeight: 1.2 }}>Scan to Pay</Typography>
                {currentBusiness?.name && <Typography sx={{ color: '#57433e', fontSize: '0.7rem', mt: 0.25 }}>{currentBusiness.name}</Typography>}
              </Box>
            </Box>
            <IconButton onClick={() => setQrOpen(false)} size="small" sx={{ color: '#57433e', '&:hover': { color: '#5c1f22', bgcolor: 'rgba(92,31,34,0.08)' } }}>
              <X size={18} />
            </IconButton>
          </Box>
          <Box sx={{ px: 3, pb: 1.5, display: 'flex', justifyContent: 'center' }}>
            <Box sx={{ bgcolor: 'white', borderRadius: 3, p: 2.5, display: 'inline-flex', boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}>
              <img src={currentBusiness?.qrCode} alt="Payment QR" style={{ width: 240, height: 240, objectFit: 'contain', display: 'block' }} />
            </Box>
          </Box>
          <Box sx={{ px: 3, pt: 1, pb: 3, textAlign: 'center' }}>
            <Typography sx={{ color: '#5f4f47', fontSize: '0.7rem', letterSpacing: '0.03em' }}>Point your camera at the QR code to pay</Typography>
          </Box>
        </DialogContent>
      </Dialog>

      <InvoicePreviewDialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        transaction={previewTx}
        business={currentBusiness}
        parties={parties}
        config={config}
        isSale={previewTx?.type === 'Sales'}
      />
    </Box>
  );
};

export default Dashboard;
