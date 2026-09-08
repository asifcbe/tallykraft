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
import { BRAND } from './theme';
import TallyKraftLogo from './TallyKraftLogo';

// ─── KPI Value: renders at a shared font size determined by the parent grid ──
const KpiValue = ({ value, color, fontSize }) => {
  const v = value ?? 0;
  const formatted = `${v < 0 ? '−' : ''}₹${Math.abs(v).toLocaleString('en-IN')}`;
  return (
    <Box sx={{ width: '100%', overflow: 'hidden', display: 'flex', justifyContent: 'center' }}>
      <Box
        component="span"
        sx={{
          fontSize: (fontSize ?? 32) + 'px',
          fontWeight: 900,
          color: color ?? 'text.primary',
          letterSpacing: '-0.04em',
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
  const [fontSize, setFontSize] = React.useState(32);
  const probeRef = React.useRef(null);

  React.useLayoutEffect(() => {
    if (!containerWidth || !probeRef.current) return;
    const el = probeRef.current;
    const longestText = statRows
      .map(r => `${(r.value ?? 0) < 0 ? '−' : ''}₹${Math.abs(r.value ?? 0).toLocaleString('en-IN')}`)
      .reduce((a, b) => (a.length >= b.length ? a : b), '');
    el.textContent = longestText;
    let size = 32;
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
        fontWeight: 900, letterSpacing: '-0.04em',
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

const ClockCalendarWidget = ({ now, accentColor, bgColor, textOnBg = '#fff', stats: heroStats, cash, bank, lastCashAmounts, lastBankAmounts, trendLabel, accentColorHex, onQuickNew }) => {
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
    { label: 'Sales',        value: heroStats.totalSales,     color: '#5c1f22',      trend: heroStats.salesTrend,    actions: onQuickNew ? [{ label: 'Invoice',  fn: () => onQuickNew('/sales', 'New Invoice', 'createNew') }] : [] },
    { label: 'Purchases',    value: heroStats.totalPurchases, color: '#a78bfa',      trend: heroStats.purchaseTrend, actions: onQuickNew ? [{ label: 'Purchase', fn: () => onQuickNew('/purchases', 'New Purchase', 'createNew') }] : [] },
    { label: 'Receivable',   value: heroStats.toGet,          color: '#a9803f',      trend: null,                   actions: onQuickNew ? [{ label: 'Receive',  fn: () => onQuickNew('/payment-in', 'Payment In', 'openAdd') }, { label: 'View', fn: () => onQuickNew('/payment-in', 'Payment In', 'viewOutstanding') }] : [] },
    { label: 'Payable',      value: heroStats.toGive,         color: '#fbbf24',      trend: null,                   actions: onQuickNew ? [{ label: 'Pay',      fn: () => onQuickNew('/payment-out', 'Payment Out', 'openAdd') }, { label: 'View', fn: () => onQuickNew('/payment-out', 'Payment Out', 'viewOutstanding') }] : [] },
    { label: 'Expenses',     value: heroStats.totalExpenses,  color: '#fb7185',      trend: null,                   actions: onQuickNew ? [{ label: 'Expense',  fn: () => onQuickNew('/expenses', 'Expenses', 'openAdd') }] : [] },
    { label: 'Cash in Hand', value: cash?.balance ?? 0,       color: '#22d3ee',      cashIn: lastCashAmounts?.lastIn ?? 0, cashOut: lastCashAmounts?.lastOut ?? 0,
      actions: onQuickNew ? [{ label: 'Cash In', fn: () => onQuickNew('/cash', 'Cash Book', 'cash_in') }, { label: 'Cash Out', fn: () => onQuickNew('/cash', 'Cash Book', 'cash_out') }] : [] },
    { label: 'Bank Balance', value: bank?.balance ?? 0,       color: '#1a1a1a',      cashIn: lastBankAmounts?.lastIn ?? 0, cashOut: lastBankAmounts?.lastOut ?? 0,
      actions: onQuickNew ? [{ label: 'Credit',   fn: () => onQuickNew('/cash', 'Cash Book', 'bank_in') }, { label: 'Debit',    fn: () => onQuickNew('/cash', 'Cash Book', 'bank_out') }] : [] },
    { label: 'Total Capital', value: (cash?.balance ?? 0) + (bank?.balance ?? 0), color: '#7c3aed', actions: [] },
  ] : [];

  const { fontSize: kpiFontSize, ProbeEl } = useUniformKpiFontSize(statRows, cardWidth);

  return (
    <Box sx={{
      borderRadius: 3, overflow: 'hidden',
      border: `1.5px solid ${alpha(accentColor, 0.2)}`,
      boxShadow: `0 4px 24px ${alpha(accentColor, 0.12)}`,
      bgcolor: 'background.paper',
      width: '100%',
      display: 'flex', flexDirection: { xs: 'column', lg: 'row' },
    }}>
      {/* ── Left: KPI cards grid ── */}
      {ProbeEl}
      {statRows.length > 0 && (
        <Box ref={gridRef} sx={{
          flex: 1, display: 'grid', order: { xs: 2, lg: 1 },
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)' },
          gridAutoRows: '1fr',
          borderRight: { lg: `1px solid ${alpha(accentColor, 0.1)}` },
          borderBottom: { xs: `1px solid ${alpha(accentColor, 0.1)}`, lg: 'none' },
        }}>
          {statRows.map((r, i) => {
            const hasCashFlow = r.cashIn !== undefined;
            return (
              <Box key={r.label} sx={{
                px: 1.25, py: 1.1,
                borderRight: { xs: (i % 2 === 0) ? `1px solid ${alpha(accentColor, 0.07)}` : 'none', sm: (i % 3 !== 2) ? `1px solid ${alpha(accentColor, 0.07)}` : 'none', lg: (i % 4 !== 3) ? `1px solid ${alpha(accentColor, 0.07)}` : 'none' },
                borderBottom: `1px solid ${alpha(accentColor, 0.07)}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden',
                bgcolor: alpha(r.color, 0.03),
                transition: 'background-color 0.18s',
                '&:hover': { bgcolor: alpha(r.color, 0.07) },
              }}>
                {/* Label */}
                <Typography sx={{ fontSize: '0.66rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.09em', lineHeight: 1, textAlign: 'center', mb: 0.75 }}>
                  {r.label}
                </Typography>

                {/* Value */}
                <Box sx={{ width: '100%', mb: r.actions?.length > 0 ? 0.9 : 0, display: 'flex', justifyContent: 'center' }}>
                  <KpiValue value={r.value} color={(r.value ?? 0) < 0 ? '#dc2626' : '#241f1c'} fontSize={kpiFontSize} />
                </Box>

                {/* Action buttons — pinned to bottom */}
                {r.actions?.length > 0 && (
                  <Box sx={{ display: 'flex', gap: 0.5, mt: 0.9, width: '100%' }}>
                    {r.actions.map((a) => (
                      <Box key={a.label} onClick={a.fn} sx={{
                        flex: '1 1 0', minWidth: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.4,
                        px: 0.5, py: 0.6, borderRadius: 1.5,
                        border: `1.5px solid ${alpha(r.color, 0.35)}`,
                        bgcolor: alpha(r.color, 0.08),
                        cursor: 'pointer', userSelect: 'none',
                        transition: 'all 0.15s ease',
                        '&:hover': { bgcolor: r.color, borderColor: r.color, '& .al': { color: '#fff' }, '& .ai': { stroke: '#fff' } },
                      }}>
                        <svg className="ai" width={9} height={9} viewBox="0 0 24 24" fill="none" stroke={r.color} strokeWidth={3} strokeLinecap="round" style={{ flexShrink: 0 }}>
                          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                        <Typography className="al" sx={{ fontSize: '0.625rem', fontWeight: 700, color: r.color, lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {a.label}
                        </Typography>
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
      <Box sx={{ flex: '0 0 auto', width: { xs: '100%', lg: 310 }, display: 'flex', flexDirection: { xs: 'row', sm: 'row', lg: 'column' }, overflow: 'hidden', order: { xs: 1, lg: 2 } }}>
        {/* Digital Clock */}
        <Box sx={{
          flex: { xs: '0 0 160px', sm: '0 0 180px', lg: 'none' },
          background: bgColor,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          py: 1.75, px: 2, gap: 1, position: 'relative',
          borderBottom: { lg: `1px solid ${alpha(textOnBg, 0.12)}` },
          borderRight: { xs: `1px solid ${alpha(accentColor, 0.1)}`, sm: `1px solid ${alpha(accentColor, 0.1)}`, lg: 'none' },
        }}>
          <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
            <Typography sx={{ fontSize: '2.4rem', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1, color: textOnBg, fontVariantNumeric: 'tabular-nums', userSelect: 'none' }}>
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
          {/* Logo + app name — bottom right */}
          <Box sx={{ position: 'absolute', bottom: 10, right: 12, display: 'flex', alignItems: 'center', gap: 0.6 }}>
            <TallyKraftLogo size={16} variant="icon" />
            <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, color: alpha(textOnBg, 0.5), letterSpacing: '0.04em', lineHeight: 1 }}>TallyKraft</Typography>
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
      </Box>
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
  const [anchorEl, setAnchorEl] = useState(null);
  const [period, setPeriod] = useState('day');
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

  const handleMenuOpen = (e) => setAnchorEl(e.currentTarget);
  const handleMenuClose = () => setAnchorEl(null);

  const quickNew = (path, label, intent) => {
    openTab(path, label, { duplicate: path === '/sales' });
    dispatchQuickNew({ path, intent });
    handleMenuClose();
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
  const lastCashAmounts = useMemo(() => {
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

  const lastBankAmounts = useMemo(() => {
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
    const DONUT_COLORS = ['#5c1f22', '#5c1f22', '#5c1f22', '#d97706', '#e11d48', '#0891b2', '#7c3aed', '#be123c'];
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
        mb: 2.5, px: 0, pt: 0.5,
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
              <Typography sx={{ fontWeight: 900, fontSize: { xs: '1.1rem', sm: '1.3rem' }, letterSpacing: '-0.025em', color: 'text.primary', lineHeight: 1.15 }}>
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
                      mt: 0.5,
                      height: 22,
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      fontSize: '0.68rem',
                      letterSpacing: '0.06em',
                      cursor: 'pointer',
                      bgcolor: codeCopied ? 'success.light' : alpha(BRAND.teal, 0.1),
                      color: codeCopied ? 'success.dark' : BRAND.tealDark,
                      border: '1px solid',
                      borderColor: codeCopied ? 'success.light' : alpha(BRAND.teal, 0.25),
                      '& .MuiChip-icon': { color: 'inherit' },
                      transition: 'all 0.2s ease',
                    }}
                  />
                </Tooltip>
              )}
            </Box>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" gap={1} sx={{ alignSelf: { xs: 'flex-end', sm: 'auto' } }}>
            <Box sx={{ display: 'flex', bgcolor: alpha(BRAND.teal, 0.07), borderRadius: 2, p: 0.35, gap: 0.25, border: '1px solid', borderColor: alpha(BRAND.teal, 0.14) }}>
              {(['day', 'week', 'month', 'year']).map(p => (
                <Box key={p} onClick={() => setPeriod(p)} sx={{
                  px: { xs: 0.875, sm: 1.25 }, py: 0.5, borderRadius: 1.5, cursor: 'pointer', userSelect: 'none',
                  bgcolor: period === p ? BRAND.teal : 'transparent',
                  color: period === p ? '#fff' : 'text.secondary',
                  fontWeight: period === p ? 700 : 500, fontSize: { xs: '0.7rem', sm: '0.75rem' },
                  transition: 'all 0.15s ease',
                  '&:hover': { bgcolor: period === p ? BRAND.teal : alpha(BRAND.teal, 0.12), color: period === p ? '#fff' : BRAND.teal },
                }}>
                  {isMobile ? p.charAt(0).toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1)}
                </Box>
              ))}
              {/* Custom range button */}
              <Box onClick={(e) => { setCustomDraft(customRange.from ? customRange : { from: '', to: '' }); setCustomAnchor(e.currentTarget); setCustomOpen(true); }} sx={{
                display: 'flex', alignItems: 'center', gap: 0.5,
                px: { xs: 0.875, sm: 1.25 }, py: 0.5, borderRadius: 1.5, cursor: 'pointer', userSelect: 'none',
                bgcolor: period === 'custom' ? BRAND.teal : 'transparent',
                color: period === 'custom' ? '#fff' : 'text.secondary',
                fontWeight: period === 'custom' ? 700 : 500, fontSize: { xs: '0.7rem', sm: '0.75rem' },
                transition: 'all 0.15s ease',
                '&:hover': { bgcolor: period === 'custom' ? BRAND.teal : alpha(BRAND.teal, 0.12), color: period === 'custom' ? '#fff' : BRAND.teal },
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
            <Button variant="contained" startIcon={<Plus size={15} />} onClick={handleMenuOpen}
              sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none', boxShadow: `0 2px 10px ${alpha(BRAND.teal, 0.35)}`, px: 2, whiteSpace: 'nowrap', flexShrink: 0 }}>
              {isMobile ? 'New' : 'New Entry'}
            </Button>
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

        {/* Hero widget: clock + calendar + stats */}
        <ClockCalendarWidget
          now={now}
          accentColor={BRAND.teal}
          accentColorHex="#57433e"
          bgColor="#ffffff"
          textOnBg="#5c1f22"
          stats={stats}
          cash={cash}
          bank={bank}
          lastCashAmounts={lastCashAmounts}
          lastBankAmounts={lastBankAmounts}
          trendLabel={stats.trendLabel}
          onQuickNew={quickNew}
        />
      </Box>

      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ sx: { borderRadius: 2, mt: 1, minWidth: 220 } }}>
        <MenuItem dense onClick={() => quickNew('/sales', 'New Invoice', 'createNew')}><ReceiptText size={15} style={{ marginRight: 10, color: BRAND.teal }} />New Sales Invoice</MenuItem>
        <MenuItem dense onClick={() => quickNew('/purchases', 'New Purchase', 'createNew')}><ShoppingBag size={15} style={{ marginRight: 10, color: '#5c1f22' }} />New Purchase Bill</MenuItem>
        <MenuItem dense onClick={() => quickNew('/expenses', 'Expenses', 'openAdd')}><DollarSign size={15} style={{ marginRight: 10, color: '#e11d48' }} />Add Expense</MenuItem>
        <MenuItem dense onClick={() => quickNew('/payment-in', 'Payment In', 'openAdd')}><Download size={15} style={{ marginRight: 10, color: '#5c1f22' }} />Payment Received</MenuItem>
        <MenuItem dense onClick={() => quickNew('/payment-out', 'Payment Out', 'openAdd')}><Upload size={15} style={{ marginRight: 10, color: '#d97706' }} />Payment Made</MenuItem>
      </Menu>

      {/* ── Row 2: area chart + expense donut ── */}
      <Grid container spacing={2} sx={{ mb: 2 }}>

        {/* ─ Area chart: revenue flow ─ */}
        <Grid size={{ xs: 12, lg: 8 }}>
          <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden', height: '100%' }}>
            <Box sx={{ px: 2.5, py: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Stack direction="row" alignItems="center" spacing={1.25}>
                <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: alpha(BRAND.teal, 0.1), display: 'flex' }}>
                  <Activity size={15} color={BRAND.teal} />
                </Box>
                <Box>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.875rem', lineHeight: 1.2 }}>{PERIOD_LABELS[period]} Sales & Purchase</Typography>
                  <Typography variant="caption" color="text.secondary">Sales vs purchases over time</Typography>
                </Box>
              </Stack>
              <Stack direction="row" spacing={2}>
                {[{ color: BRAND.teal, label: 'Sales' }, { color: '#5c1f22', label: 'Purchase' }].map(({ color, label }) => (
                  <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Box sx={{ width: 10, height: 3, borderRadius: 1.5, bgcolor: color }} />
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, fontSize: '0.7rem' }}>{label}</Typography>
                  </Box>
                ))}
              </Stack>
            </Box>
            <Box sx={{ p: { xs: 1, sm: 2 }, height: { xs: 230, sm: 290 } }}>
              <ChartMountGuard>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.chartData} margin={{ top: 8, right: 4, left: isMobile ? -28 : -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gSales" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={BRAND.teal} stopOpacity={0.32} />
                        <stop offset="100%" stopColor={BRAND.teal} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gPurch" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#5c1f22" stopOpacity={0.22} />
                        <stop offset="100%" stopColor="#5c1f22" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={alpha(theme.palette.text.primary, 0.06)} />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: theme.palette.text.disabled, fontSize: 11, fontWeight: 500 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: theme.palette.text.disabled, fontSize: 11 }} tickFormatter={v => v >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : `₹${v}`} />
                    <ReTooltip content={<AreaTooltip />} />
                    <Area type="monotone" dataKey="sales" stroke={BRAND.teal} strokeWidth={2.5} fill="url(#gSales)" name="Sales" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                    <Area type="monotone" dataKey="purchases" stroke="#5c1f22" strokeWidth={2} fill="url(#gPurch)" name="Purchase" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartMountGuard>
            </Box>
          </Card>
        </Grid>

        {/* Expense breakdown donut */}
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', height: '100%', overflow: 'hidden' }}>
            <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: alpha('#e11d48', 0.1), display: 'flex' }}>
                <PieChartIcon size={15} color="#e11d48" />
              </Box>
              <Box>
                <Typography sx={{ fontWeight: 700, fontSize: '0.875rem', lineHeight: 1.2 }}>Expense Breakdown</Typography>
                <Typography variant="caption" color="text.secondary">By category · {PERIOD_LABELS[period].toLowerCase()}</Typography>
              </Box>
            </Box>
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
                    <Typography sx={{ fontSize: '1.1rem', fontWeight: 900, color: '#e11d48', letterSpacing: '-0.03em', lineHeight: 1 }}>
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
                        <Box sx={{ width: 8, height: 8, borderRadius: 1, bgcolor: entry.color, flexShrink: 0 }} />
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
        </Grid>

      </Grid>

      {/* ── Row 3: Activity stream + Due Soon + Vendor payables ── */}
      <Grid container spacing={2} sx={{ mb: 2 }}>

        {/* Activity stream */}
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: alpha(BRAND.teal, 0.1), display: 'flex' }}>
                <Layers size={15} color={BRAND.teal} />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.875rem', lineHeight: 1.2 }}>Activity Stream</Typography>
                <Typography variant="caption" color="text.secondary">{recentTx.length} recent entries</Typography>
              </Box>
              <Button size="small" endIcon={<ChevronRight size={13} />} onClick={() => openTab('/sales', 'Sales')}
                sx={{ fontSize: '0.7rem', textTransform: 'none', color: BRAND.teal, p: 0, minWidth: 0, fontWeight: 700, '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' } }}>
                View all
              </Button>
            </Box>
            <Box sx={{ flex: 1, overflow: 'auto', py: 0.5 }}>
              {recentTx.length === 0 ? (
                <Box sx={{ py: 6, textAlign: 'center', opacity: 0.38 }}>
                  <Activity size={32} strokeWidth={1.2} />
                  <Typography variant="body2" sx={{ mt: 1, fontWeight: 500 }}>No transactions yet</Typography>
                </Box>
              ) : (
                recentTx.map((tx, idx) => {
                  const isSale = tx.type === 'Sales';
                  const clr = isSale ? BRAND.teal : '#5c1f22';
                  const IcoComp = isSale ? ReceiptText : ShoppingBag;
                  return (
                    <Box key={tx.id}
                      onClick={() => { setPreviewTx(tx); setPreviewOpen(true); }}
                      sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25, px: 2, py: 1.1, cursor: 'pointer', '&:hover': { bgcolor: alpha(clr, 0.04) }, position: 'relative' }}>
                      {/* Timeline dot + line */}
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, flexShrink: 0, pt: 0.25 }}>
                        <Box sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: alpha(clr, 0.12), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <IcoComp size={13} color={clr} />
                        </Box>
                        {idx < recentTx.length - 1 && (
                          <Box sx={{ width: 1, flex: 1, minHeight: 12, bgcolor: alpha(clr, 0.1), mt: 0.4 }} />
                        )}
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0, pb: idx < recentTx.length - 1 ? 1 : 0 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.79rem', lineHeight: 1.3 }} noWrap>
                            {tx.partyName || (isSale ? 'Cash & Carry' : 'Cash Purchase')}
                          </Typography>
                          <Typography sx={{ fontSize: '0.8rem', fontWeight: 800, color: isSale ? BRAND.teal : '#5c1f22', ml: 1, flexShrink: 0, whiteSpace: 'nowrap' }}>
                            {isSale ? '+' : '−'}₹{tx.totalAmount?.toLocaleString('en-IN') ?? '0'}
                          </Typography>
                        </Stack>
                        <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mt: 0.25 }}>
                          <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.66rem' }}>{tx.date}</Typography>
                          <Box sx={{ width: 3, height: 3, borderRadius: '50%', bgcolor: 'text.disabled' }} />
                          <Typography variant="caption" sx={{ fontSize: '0.66rem', color: clr, fontWeight: 600 }}>{tx.type}</Typography>
                        </Stack>
                      </Box>
                    </Box>
                  );
                })
              )}
            </Box>
          </Card>
        </Grid>

        {/* Overdue bills / invoices */}
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', height: '100%', overflow: 'hidden' }}>
            <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: alpha('#dc2626', 0.1), display: 'flex' }}>
                <Clock size={15} color="#dc2626" />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.875rem', lineHeight: 1.2 }}>Overdue</Typography>
                <Typography variant="caption" color="text.secondary">Unpaid, past due date</Typography>
              </Box>
              {dueDates.length > 0 && (
                <Chip label={dueDates.length} size="small" sx={{ fontWeight: 800, height: 20, fontSize: '0.66rem', bgcolor: alpha('#dc2626', 0.1), color: '#dc2626', border: 'none' }} />
              )}
            </Box>
            {dueDates.length === 0 ? (
              <Box sx={{ py: 5, textAlign: 'center', opacity: 0.4 }}>
                <Clock size={28} strokeWidth={1.3} />
                <Typography variant="body2" sx={{ mt: 1, fontWeight: 500 }}>No overdue bills</Typography>
              </Box>
            ) : (
              dueDates.map((tx, idx) => {
                const clr = '#dc2626';
                const daysLate = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(tx.dueDate + 'T00:00:00')) / 86400000);
                return (
                  <Box key={tx.id}>
                    <Stack direction="row" alignItems="center" spacing={1.25}
                      onClick={() => { setPreviewTx(tx); setPreviewOpen(true); }}
                      sx={{ px: 2, py: 1.2, cursor: 'pointer', '&:hover': { bgcolor: alpha(clr, 0.06) } }}>
                      <Box sx={{ p: 0.875, borderRadius: 1.5, bgcolor: alpha(clr, 0.1), flexShrink: 0, display: 'flex' }}>
                        <FileText size={14} color={clr} />
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.79rem' }} noWrap>{tx.partyName}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>{tx.txType} · due {tx.dueDate}</Typography>
                      </Box>
                      <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                        <Typography sx={{ fontSize: '0.79rem', fontWeight: 700 }}>₹{tx.totalAmount?.toLocaleString('en-IN')}</Typography>
                        <Chip label={daysLate > 0 ? `${daysLate}d late` : 'Overdue'} size="small" color="error" sx={{ fontWeight: 700, fontSize: '0.6rem', height: 16, mt: 0.25 }} />
                      </Box>
                    </Stack>
                    {idx < dueDates.length - 1 && <Divider sx={{ mx: 2 }} />}
                  </Box>
                );
              })
            )}
          </Card>
        </Grid>
        {/* Vendor payables */}
        {stats.vendorsWithBalance.length > 0 && (
          <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
            <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden', height: '100%' }}>
              <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: alpha('#d97706', 0.1), display: 'flex' }}>
                  <Upload size={15} color="#d97706" />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.875rem', lineHeight: 1.2 }}>{t('dash.vendorPayables')}</Typography>
                  <Typography variant="caption" color="text.secondary">Amounts owed to vendors</Typography>
                </Box>
                <Chip label={`₹${stats.toGive.toLocaleString('en-IN')}`} size="small"
                  sx={{ fontWeight: 800, bgcolor: alpha('#d97706', 0.1), color: '#d97706', border: 'none', fontSize: '0.72rem', height: 22 }} />
              </Box>
              <Stack spacing={0}>
                {stats.vendorsWithBalance.slice(0, 10).map((v, idx, arr) => {
                  const owed = (v.balance || 0) < 0 ? -v.balance : 0;
                  return (
                    <Box key={v.id}>
                      <Stack direction="row" alignItems="center" spacing={1.25} sx={{ px: 2, py: 1.2 }}>
                        <Avatar sx={{ width: 32, height: 32, fontSize: '0.75rem', fontWeight: 800, bgcolor: alpha('#d97706', 0.1), color: '#d97706', flexShrink: 0 }}>
                          {v.name?.[0]?.toUpperCase() || 'V'}
                        </Avatar>
                        <Typography variant="body2" sx={{ flex: 1, fontWeight: 600, fontSize: '0.79rem' }} noWrap>{v.name}</Typography>
                        <Typography sx={{ fontWeight: 800, color: '#d97706', whiteSpace: 'nowrap', fontSize: '0.79rem' }}>
                          ₹{owed.toLocaleString('en-IN')}
                        </Typography>
                      </Stack>
                      {idx < arr.length - 1 && <Divider sx={{ mx: 2 }} />}
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
          </Grid>
        )}

      </Grid>

      {/* ── Exam reminders ── */}
      {examReminders.length > 0 && (
        <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: alpha('#d97706', 0.22), bgcolor: alpha('#d97706', 0.03), overflow: 'hidden' }}>
          <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid', borderColor: alpha('#d97706', 0.15), display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: alpha('#d97706', 0.15), display: 'flex' }}>
              <Bell size={15} color="#d97706" />
            </Box>
            <Typography sx={{ fontWeight: 700, fontSize: '0.875rem', color: '#b45309' }}>{t('dash.examReminders')}</Typography>
            <Chip label={examReminders.length} size="small" color="warning" sx={{ fontWeight: 800, height: 20 }} />
          </Box>
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
      )}

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
