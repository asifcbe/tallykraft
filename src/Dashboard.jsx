import React, { useMemo, useState, useEffect } from 'react';
import {
  Box, Typography, Grid, Card, CardContent,
  useTheme, useMediaQuery, Stack, Button, alpha, Divider, Menu, MenuItem,
  Chip, Avatar, Dialog, DialogContent, IconButton, Tooltip,
} from '@mui/material';
import {
  Plus, FileText, ReceiptText, ShoppingBag, Download, Upload, DollarSign, TrendingUp,
  Bell, Clock, QrCode, X, Keyboard, Crown, Cloud, Lock,
} from 'lucide-react';
import { useBusiness } from './BusinessContext';
import { useData } from './DataContext';
import { useConfig } from './ConfigContext';
import { useSubscription } from './SubscriptionContext';
import { useI18n } from './i18n/I18nContext';
import { computeCashInHand, computeBankBalance } from './cashUtils';
import InvoicePreviewDialog from './InvoicePreviewDialog';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { useTabs } from './TabsContext';
import TallyKraftLogo from './TallyKraftLogo';

// ─── Clock + Calendar + Stats Hero Widget ────────────────────────────────────
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const ClockCalendarWidget = ({ now, accentColor, bgColor, textOnBg = '#fff', stats: heroStats, cash, bank, trendLabel, accentColorHex, onQuickNew }) => {
  const [calBase, setCalBase] = React.useState(() => ({ y: now.getFullYear(), m: now.getMonth() }));
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
    { label: 'Sales',        value: heroStats.totalSales,     color: accentColorHex, trend: heroStats.salesTrend,    actions: onQuickNew ? [{ label: 'New Invoice',     fn: () => onQuickNew('/sales', 'New Invoice', 'createNew') }] : [] },
    { label: 'Purchases',    value: heroStats.totalPurchases, color: '#a78bfa',      trend: heroStats.purchaseTrend, actions: onQuickNew ? [{ label: 'Add Purchase',    fn: () => onQuickNew('/purchases', 'New Purchase', 'createNew') }] : [] },
    { label: 'Receivable',   value: heroStats.toGet,          color: '#34d399',      trend: null,                   actions: onQuickNew ? [{ label: 'Receive Payment', fn: () => onQuickNew('/payment-in', 'Payment In', 'openAdd') }] : [] },
    { label: 'Payable',      value: heroStats.toGive,         color: '#fbbf24',      trend: null,                   actions: onQuickNew ? [{ label: 'Make Payment',    fn: () => onQuickNew('/payment-out', 'Payment Out', 'openAdd') }] : [] },
    { label: 'Expenses',     value: heroStats.totalExpenses,  color: '#fb7185',      trend: null,                   actions: onQuickNew ? [{ label: 'Add Expense',     fn: () => onQuickNew('/expenses', 'Expenses', 'openAdd') }] : [] },
    { label: 'Cash in Hand', value: cash?.balance ?? 0,       color: '#22d3ee',      cashIn: cash?.cashIn ?? 0, cashOut: cash?.cashOut ?? 0,
      actions: onQuickNew ? [{ label: 'Cash In', fn: () => onQuickNew('/cash', 'Cash Book', 'cash_in') }, { label: 'Cash Out', fn: () => onQuickNew('/cash', 'Cash Book', 'cash_out') }] : [] },
    { label: 'Bank Balance', value: bank?.balance ?? 0,       color: '#60a5fa',      cashIn: bank?.bankIn ?? 0, cashOut: bank?.bankOut ?? 0,
      actions: onQuickNew ? [{ label: 'Credit', fn: () => onQuickNew('/cash', 'Cash Book', 'bank_in') }, { label: 'Debit', fn: () => onQuickNew('/cash', 'Cash Book', 'bank_out') }] : [] },
  ] : [];

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
      {statRows.length > 0 && (
        <Box sx={{
          flex: 1, display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)' },
          gridAutoRows: '1fr',
          borderRight: { lg: `1px solid ${alpha(accentColor, 0.1)}` },
          borderBottom: { xs: `1px solid ${alpha(accentColor, 0.1)}`, lg: 'none' },
        }}>
          {statRows.map((r, i) => {
            const hasCashFlow = r.cashIn !== undefined;
            return (
              <Box key={r.label} sx={{
                px: 1.75, pt: 1.5, pb: 1.5,
                borderRight: { xs: (i % 2 === 0) ? `1px solid ${alpha(accentColor, 0.07)}` : 'none', sm: (i % 3 !== 2) ? `1px solid ${alpha(accentColor, 0.07)}` : 'none', lg: (i % 4 !== 3) ? `1px solid ${alpha(accentColor, 0.07)}` : 'none' },
                borderBottom: `1px solid ${alpha(accentColor, 0.07)}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                overflow: 'hidden',
                bgcolor: alpha(r.color, 0.025),
                transition: 'background-color 0.18s',
                '&:hover': { bgcolor: alpha(r.color, 0.06) },
              }}>
                <Box sx={{ height: 1.5, mb: 1.5, flexShrink: 0 }} />

                {/* Label */}
                <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.1em', lineHeight: 1, textAlign: 'center', mb: 1 }}>
                  {r.label}
                </Typography>

                {/* Value */}
                <Typography sx={{ fontSize: '2rem', fontWeight: 900, color: (r.value ?? 0) < 0 ? '#dc2626' : 'text.primary', letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center', width: '100%', mb: 1.25 }}>
                  ₹{Math.abs(r.value ?? 0).toLocaleString('en-IN')}
                </Typography>

                {/* Trend / cash flow */}
                {hasCashFlow ? (
                  <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, px: 1, py: 0.5, borderRadius: '20px', bgcolor: alpha('#16a34a', 0.12), border: `1px solid ${alpha('#16a34a', 0.2)}` }}>
                      <Box component="span" sx={{ fontSize: '0.6rem', color: '#16a34a', lineHeight: 1, fontWeight: 800 }}>▲</Box>
                      <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#16a34a', lineHeight: 1 }}>₹{r.cashIn.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, px: 1, py: 0.5, borderRadius: '20px', bgcolor: alpha('#dc2626', 0.1), border: `1px solid ${alpha('#dc2626', 0.2)}` }}>
                      <Box component="span" sx={{ fontSize: '0.6rem', color: '#dc2626', lineHeight: 1, fontWeight: 800 }}>▼</Box>
                      <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#dc2626', lineHeight: 1 }}>₹{r.cashOut.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</Typography>
                    </Box>
                  </Box>
                ) : r.trend !== undefined && r.trend !== null ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, justifyContent: 'center' }}>
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, px: 1, py: 0.5, borderRadius: '20px', bgcolor: r.trend >= 0 ? alpha('#16a34a', 0.12) : alpha('#dc2626', 0.1), border: `1px solid ${r.trend >= 0 ? alpha('#16a34a', 0.2) : alpha('#dc2626', 0.2)}` }}>
                      <Box component="span" sx={{ fontSize: '0.6rem', color: r.trend >= 0 ? '#16a34a' : '#dc2626', lineHeight: 1, fontWeight: 800 }}>{r.trend >= 0 ? '▲' : '▼'}</Box>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 800, color: r.trend >= 0 ? '#16a34a' : '#dc2626', lineHeight: 1 }}>{Math.abs(r.trend).toFixed(1)}%</Typography>
                    </Box>
                    <Typography sx={{ fontSize: '0.65rem', color: 'text.disabled', lineHeight: 1 }}>{trendLabel}</Typography>
                  </Box>
                ) : <Box sx={{ height: 16 }} />}

                {/* Spacer pushes buttons to bottom */}
                <Box sx={{ flex: 1 }} />

                {/* Action buttons — pinned to bottom */}
                {r.actions?.length > 0 && (
                  <Box sx={{ display: 'flex', gap: 0.75, mt: 1.25, width: '100%' }}>
                    {r.actions.map((a) => (
                      <Box key={a.label} onClick={a.fn} sx={{
                        flex: 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5,
                        px: 1, py: 0.75, borderRadius: 1.5,
                        border: `1.5px solid ${alpha(r.color, 0.35)}`,
                        bgcolor: alpha(r.color, 0.08),
                        cursor: 'pointer', userSelect: 'none',
                        transition: 'all 0.15s ease',
                        '&:hover': { bgcolor: r.color, borderColor: r.color, '& .al': { color: '#fff' }, '& .ai': { stroke: '#fff' } },
                      }}>
                        <svg className="ai" width={10} height={10} viewBox="0 0 24 24" fill="none" stroke={r.color} strokeWidth={3} strokeLinecap="round" style={{ flexShrink: 0 }}>
                          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                        <Typography className="al" sx={{ fontSize: '0.65rem', fontWeight: 700, color: r.color, lineHeight: 1, whiteSpace: 'nowrap' }}>
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
      <Box sx={{ flex: '0 0 auto', width: { xs: '100%', lg: 310 }, display: 'flex', flexDirection: { xs: 'row', lg: 'column' }, overflow: 'hidden' }}>
        {/* Digital Clock */}
        <Box sx={{
          flex: { xs: '0 0 160px', sm: '0 0 180px', lg: 'none' },
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #0f2040 100%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          py: 2.5, px: 2, gap: 1.25, position: 'relative',
          borderBottom: { lg: `1px solid ${alpha(textOnBg, 0.12)}` },
          borderRight: { xs: `1px solid ${alpha(accentColor, 0.1)}`, lg: 'none' },
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
        <Box sx={{ flex: 1, p: { xs: 1.5, lg: 2 }, display: 'flex', flexDirection: 'column', gap: 1 }}>
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
                  <Box key={di} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 25, borderRadius: 1.25, bgcolor: isToday(d) ? accentColor : 'transparent', boxShadow: isToday(d) ? `0 2px 6px ${alpha(accentColor, 0.4)}` : 'none' }}>
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

// ─── Card definitions ────────────────────────────────────────────────────────

// ─── Chart tooltip ────────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <Box sx={{ bgcolor: 'white', border: '1px solid', borderColor: alpha('#000', 0.08), borderRadius: 2, p: 1.75, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', minWidth: 170 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', mb: 1 }}>{label}</Typography>
      {payload.map((entry, i) => (
        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: i < payload.length - 1 ? 0.5 : 0 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: entry.color, flexShrink: 0 }} />
          <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: 'text.primary' }}>₹{Number(entry.value).toLocaleString('en-IN')}</Typography>
          <Typography variant="caption" color="text.secondary">{entry.name}</Typography>
        </Box>
      ))}
    </Box>
  );
};

// ─── Dashboard ────────────────────────────────────────────────────────────────
const Dashboard = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { currentBusiness } = useBusiness();
  const { getItems } = useData();
  const navigate = useNavigate();
  const { openTab } = useTabs();
  const { config } = useConfig();
  const { getBusinessState, isBusinessProPlan, daysLeftForBusiness, adminGrantedAll } = useSubscription();
  const { t } = useI18n();

  // ── Current business plan summary (for the home-screen banner) ──────────────
  const bizId = currentBusiness?.id;
  const planState = getBusinessState(bizId);          // trial | subscribed | admin_granted | expired | none ...
  const planIsPro = isBusinessProPlan(bizId);
  const planDaysLeft = daysLeftForBusiness(bizId);
  const planInfo = (() => {
    if (adminGrantedAll || planState === 'admin_granted')
      return { tone: 'admin', label: 'Full Access', sub: 'Granted by admin — all features unlocked', cta: null };
    if (planState === 'trial')
      return { tone: 'trial', label: 'Free Trial', sub: `${planDaysLeft ?? 0} day${planDaysLeft === 1 ? '' : 's'} left · all features`, cta: 'Choose a plan' };
    if (planState === 'subscribed')
      return planIsPro
        ? { tone: 'pro', label: 'Pro Plan · ₹299/mo', sub: `All features + cloud backup${planDaysLeft != null ? ` · ${planDaysLeft} days left` : ''}`, cta: 'Manage plan' }
        : { tone: 'basic', label: 'Basic Plan · ₹99/mo', sub: `All features, local only${planDaysLeft != null ? ` · ${planDaysLeft} days left` : ''}`, cta: 'Upgrade to Pro for cloud backup' };
    if (planState === 'expired' || planState === 'trial_expired')
      return { tone: 'expired', label: 'Plan expired', sub: 'Renew to keep using this business', cta: 'Renew now' };
    return { tone: 'none', label: 'No active plan', sub: 'Subscribe — ₹99/mo Basic or ₹299/mo Pro', cta: 'View plans' };
  })();
  const [anchorEl, setAnchorEl] = React.useState(null);
  const [period, setPeriod] = React.useState('week');
  const [qrOpen, setQrOpen] = React.useState(false);
  const [previewTx, setPreviewTx] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Live clock — ticks every second for the running date/time in the header.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const handleMenuOpen = (e) => setAnchorEl(e.currentTarget);
  const handleMenuClose = () => setAnchorEl(null);

  // Open a page tab and signal it to jump straight into its "create" view. The
  // event fires on the next tick so a freshly-mounted page has its listener up.
  const quickNew = (path, label, intent) => {
    openTab(path, label, { duplicate: path === '/sales' || path === '/purchases' });
    setTimeout(() => window.dispatchEvent(new CustomEvent('dashboard-quick-new', { detail: { path, intent } })), 60);
    handleMenuClose();
  };

  const salesRaw     = getItems('sales').filter(s => s.businessId === currentBusiness?.id);
  const purchasesRaw = getItems('purchases').filter(p => p.businessId === currentBusiness?.id);
  const transactions = [
    ...salesRaw.map(s => ({ ...s, type: 'Sales' })),
    ...purchasesRaw.map(p => ({ ...p, type: 'Purchases' })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));
  const expenses = getItems('expenses').filter(e => e.businessId === currentBusiness?.id);
  const parties  = getItems('parties').filter(p => p.businessId === currentBusiness?.id);
  const paymentsRaw = getItems('payments').filter(p => p.businessId === currentBusiness?.id);
  const cashEntriesRaw = getItems('cashEntries').filter(c => c.businessId === currentBusiness?.id);

  // Cash in hand = opening cash + cash inflows − cash outflows.
  const cash = useMemo(() => computeCashInHand({
    openingCash: currentBusiness?.openingCash,
    sales: salesRaw, purchases: purchasesRaw, payments: paymentsRaw, expenses, cashEntries: cashEntriesRaw,
  }), [currentBusiness?.openingCash, salesRaw, purchasesRaw, paymentsRaw, expenses, cashEntriesRaw]);

  // Bank balance = openingBank + digital/bank inflows − digital/bank outflows.
  const bank = useMemo(() => computeBankBalance({
    openingBank: currentBusiness?.openingBank,
    sales: salesRaw, purchases: purchasesRaw, payments: paymentsRaw, expenses, cashEntries: cashEntriesRaw,
  }), [currentBusiness?.openingBank, salesRaw, purchasesRaw, paymentsRaw, expenses, cashEntriesRaw]);

  // ── Stats computation ──────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const now = new Date();
    const dayMs = 86400000;
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    let periodStart, periodEnd, prevStart, prevEnd;
    if (period === 'day') {
      periodStart = todayStart; periodEnd = todayEnd;
      prevStart = new Date(todayStart - dayMs); prevEnd = new Date(todayEnd - dayMs);
    } else if (period === 'week') {
      periodEnd = new Date(now); periodEnd.setHours(23, 59, 59, 999);
      periodStart = new Date(+periodEnd - 6 * dayMs); periodStart.setHours(0, 0, 0, 0);
      prevEnd = new Date(+periodStart - 1);
      prevStart = new Date(+prevEnd - 6 * dayMs); prevStart.setHours(0, 0, 0, 0);
    } else if (period === 'month') {
      periodEnd = new Date(now); periodEnd.setHours(23, 59, 59, 999);
      periodStart = new Date(+periodEnd - 29 * dayMs); periodStart.setHours(0, 0, 0, 0);
      prevEnd = new Date(+periodStart - 1);
      prevStart = new Date(+prevEnd - 29 * dayMs); prevStart.setHours(0, 0, 0, 0);
    } else {
      periodEnd = new Date(now); periodEnd.setHours(23, 59, 59, 999);
      periodStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      prevEnd = new Date(+periodStart - 1);
      prevStart = new Date(now.getFullYear(), now.getMonth() - 23, 1);
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

    // Chart data
    let chartData = [];
    if (period === 'day') {
      chartData = [{ label: 'Today', sales: sum(curSales), purchases: sum(curPurch) }];
    } else if (period === 'week') {
      chartData = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (6 - i));
        const ds = d.toISOString().split('T')[0];
        return { label: d.toLocaleDateString(undefined, { weekday: 'short' }), sales: sales.filter(t => t.date === ds).reduce((a, t) => a + t.totalAmount, 0), purchases: purchases.filter(t => t.date === ds).reduce((a, t) => a + t.totalAmount, 0) };
      });
    } else if (period === 'month') {
      chartData = Array.from({ length: 30 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (29 - i));
        const ds = d.toISOString().split('T')[0];
        return { label: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), sales: sales.filter(t => t.date === ds).reduce((a, t) => a + t.totalAmount, 0), purchases: purchases.filter(t => t.date === ds).reduce((a, t) => a + t.totalAmount, 0) };
      });
    } else {
      chartData = Array.from({ length: 12 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
        const ms = new Date(d.getFullYear(), d.getMonth(), 1);
        const me = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
        return {
          label: ms.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
          sales:     sales.filter(t => { const x = new Date(t.date + 'T12:00:00'); return x >= ms && x <= me; }).reduce((a, t) => a + t.totalAmount, 0),
          purchases: purchases.filter(t => { const x = new Date(t.date + 'T12:00:00'); return x >= ms && x <= me; }).reduce((a, t) => a + t.totalAmount, 0),
        };
      });
    }

    return {
      totalSales: sum(curSales), totalPurchases: sum(curPurch),
      salesTrend: trend(curSales, prevSales), purchaseTrend: trend(curPurch, prevPurch),
      toGet, toGive, vendorsWithBalance, totalExpenses, chartData,
      trendLabel: period === 'day' ? 'vs yesterday' : period === 'week' ? 'vs prev week' : period === 'month' ? 'vs prev 30d' : 'vs prev year',
    };
  }, [transactions, parties, expenses, period]);

  const recentTx = useMemo(() => transactions.slice(0, 8), [transactions]);

  const examReminders = useMemo(() => {
    const DAYS = { '1month': 30, '6months': 182, '1year': 365 };
    const today = new Date();
    return getItems('opticals')
      .filter(o => o.businessId === currentBusiness?.id && o.examReminder && o.examReminder !== 'off')
      .filter(o => { const d = DAYS[o.examReminder]; return d && today >= new Date(new Date(o.date + 'T12:00:00').getTime() + d * 86400000); })
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [getItems, currentBusiness]);

  const dueDates = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const cutoff = new Date(+today + 30 * 86400000);
    return [
      ...getItems('sales').filter(s => s.businessId === currentBusiness?.id && s.dueDate).map(s => ({ ...s, txType: 'Sale' })),
      ...getItems('purchases').filter(p => p.businessId === currentBusiness?.id && p.dueDate).map(p => ({ ...p, txType: 'Purchase' })),
    ].filter(tx => new Date(tx.dueDate + 'T00:00:00') <= cutoff)
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
      .slice(0, 6);
  }, [getItems, currentBusiness]);

  const PERIOD_LABELS = { day: 'Today', week: 'This Week', month: 'Last 30 Days', year: 'Last 12 Months' };

  return (
    <Box sx={{ bgcolor: 'background.default', minHeight: '100vh', pb: 6 }}>

      {/* ── Plan / pricing status banner ── */}
      {planInfo.tone !== 'admin' && (() => {
        const toneMap = {
          pro:     { bg: alpha('#4f46e5', 0.08), border: alpha('#4f46e5', 0.25), color: '#4f46e5', icon: <Cloud size={20} /> },
          basic:   { bg: alpha('#059669', 0.08), border: alpha('#059669', 0.25), color: '#059669', icon: <Lock size={20} /> },
          trial:   { bg: alpha('#f59e0b', 0.10), border: alpha('#f59e0b', 0.30), color: '#b45309', icon: <Crown size={20} /> },
          expired: { bg: alpha('#ef4444', 0.08), border: alpha('#ef4444', 0.28), color: '#dc2626', icon: <Crown size={20} /> },
          none:    { bg: alpha('#6366f1', 0.08), border: alpha('#6366f1', 0.25), color: '#4f46e5', icon: <Crown size={20} /> },
        };
        const t = toneMap[planInfo.tone] || toneMap.none;
        return (
          <Box sx={{ mb: 2.5, p: { xs: 1.5, sm: 2 }, borderRadius: 2.5, bgcolor: t.bg, border: '1px solid', borderColor: t.border, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Box sx={{ color: t.color, display: 'flex', flexShrink: 0 }}>{t.icon}</Box>
            <Box sx={{ flex: 1, minWidth: 180 }}>
              <Typography sx={{ fontWeight: 800, fontSize: '0.92rem', color: t.color, lineHeight: 1.2 }}>{planInfo.label}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>{planInfo.sub}</Typography>
            </Box>
            {planInfo.cta && (
              <Button
                size="small"
                variant="contained"
                onClick={() => navigate(`/subscribe?bId=${bizId || 1}`)}
                startIcon={<Crown size={15} />}
                sx={{ flexShrink: 0, fontWeight: 700, textTransform: 'none', bgcolor: t.color, '&:hover': { bgcolor: t.color, filter: 'brightness(0.92)' } }}
              >
                {planInfo.cta}
              </Button>
            )}
          </Box>
        );
      })()}

      {/* ── Hero header ── */}
      <Box sx={{ mb: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {/* Top bar: business name + period + actions */}
        <Box sx={{
          p: { xs: 2, sm: 2.5 }, borderRadius: 3,
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #0f2040 100%)',
          position: 'relative', overflow: 'hidden',
          display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'stretch', sm: 'center' }, justifyContent: 'space-between', gap: 1.5,
        }}>
          <Box sx={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', bgcolor: alpha('#6366f1', 0.14), pointerEvents: 'none' }} />
          <Stack direction="row" alignItems="center" gap={1.5} sx={{ position: 'relative', zIndex: 1, minWidth: 0 }}>
            {currentBusiness?.logo && (
              <Box sx={{ width: 40, height: 40, borderRadius: 1.75, bgcolor: 'white', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.25)', border: '1.5px solid rgba(255,255,255,0.18)' }}>
                <img src={currentBusiness.logo} alt={currentBusiness.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </Box>
            )}
            <Typography sx={{ fontWeight: 800, fontSize: { xs: '1rem', sm: '1.35rem' }, letterSpacing: '-0.02em', color: 'white', lineHeight: 1.2 }} noWrap>
              {currentBusiness?.name || 'Your Business'}
            </Typography>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" gap={1} sx={{ position: 'relative', zIndex: 1, flexShrink: 0 }}>
            <Box sx={{ display: 'flex', bgcolor: 'rgba(255,255,255,0.07)', borderRadius: 2, p: 0.4, gap: 0.25, border: '1px solid rgba(255,255,255,0.1)' }}>
              {['day', 'week', 'month', 'year'].map(p => (
                <Box key={p} onClick={() => setPeriod(p)} sx={{
                  px: { xs: 0.875, sm: 1.25 }, py: 0.55, borderRadius: 1.5, cursor: 'pointer', userSelect: 'none',
                  bgcolor: period === p ? 'rgba(255,255,255,0.18)' : 'transparent',
                  color: period === p ? 'white' : 'rgba(255,255,255,0.42)',
                  fontWeight: period === p ? 700 : 500, fontSize: { xs: '0.72rem', sm: '0.76rem' },
                  transition: 'all 0.15s ease', minWidth: { xs: 34, sm: 'auto' }, textAlign: 'center',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.85)' },
                }}>
                  {isMobile ? p.charAt(0).toUpperCase() : (p.charAt(0).toUpperCase() + p.slice(1))}
                </Box>
              ))}
            </Box>
            {currentBusiness?.qrCode && (
              <Button variant="outlined" startIcon={<QrCode size={15} />} onClick={() => setQrOpen(true)}
                sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.35)', fontWeight: 700, borderRadius: 2, textTransform: 'none', whiteSpace: 'nowrap', flexShrink: 0, '&:hover': { borderColor: 'white', bgcolor: 'rgba(255,255,255,0.1)' } }}>
                {isMobile ? 'QR' : 'Show QR'}
              </Button>
            )}
            <Tooltip title="Keyboard shortcuts (?)">
              <Button variant="outlined" startIcon={<Keyboard size={14} />} onClick={() => window.dispatchEvent(new CustomEvent('open-shortcuts'))}
                sx={{ color: 'rgba(255,255,255,0.8)', borderColor: 'rgba(255,255,255,0.3)', fontWeight: 600, borderRadius: 2, textTransform: 'none', '&:hover': { borderColor: 'white', bgcolor: 'rgba(255,255,255,0.08)', color: 'white' }, whiteSpace: 'nowrap', flexShrink: 0, display: { xs: 'none', sm: 'inline-flex' } }}>
                Shortcuts
              </Button>
            </Tooltip>
            <Button variant="contained" startIcon={<Plus size={15} />} onClick={handleMenuOpen}
              sx={{ bgcolor: 'white', color: '#0f172a', fontWeight: 700, borderRadius: 2, textTransform: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.3)', '&:hover': { bgcolor: 'rgba(255,255,255,0.92)' }, whiteSpace: 'nowrap', flexShrink: 0 }}>
              {isMobile ? 'New' : 'New Entry'}
            </Button>
          </Stack>
        </Box>
        {/* Hero widget: clock + calendar + stats */}
        <ClockCalendarWidget
          now={now}
          accentColor="#4f46e5"
          accentColorHex="#818cf8"
          bgColor="linear-gradient(135deg, #4f46e5 0%, #6366f1 55%, #818cf8 100%)"
          textOnBg="#fff"
          stats={stats}
          cash={cash}
          bank={bank}
          trendLabel={stats.trendLabel}
          onQuickNew={quickNew}
        />
      </Box>

      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ sx: { borderRadius: 2, mt: 1, minWidth: 220, boxShadow: '0 8px 32px rgba(0,0,0,0.14)' } }}>
        <MenuItem dense onClick={() => quickNew('/sales', 'New Invoice', 'createNew')}><ReceiptText size={16} style={{ marginRight: 10, color: '#4f46e5' }} />New Sales Invoice</MenuItem>
        <MenuItem dense onClick={() => quickNew('/purchases', 'New Purchase', 'createNew')}><ShoppingBag size={16} style={{ marginRight: 10, color: '#e11d48' }} />New Purchase Bill</MenuItem>
        <MenuItem dense onClick={() => quickNew('/expenses', 'Expenses', 'openAdd')}><DollarSign size={16} style={{ marginRight: 10, color: '#7c3aed' }} />Add Expense</MenuItem>
        <MenuItem dense onClick={() => quickNew('/payment-in', 'Payment In', 'openAdd')}><Download size={16} style={{ marginRight: 10, color: '#059669' }} />Payment Received</MenuItem>
        <MenuItem dense onClick={() => quickNew('/payment-out', 'Payment Out', 'openAdd')}><Upload size={16} style={{ marginRight: 10, color: '#d97706' }} />Payment Made</MenuItem>
      </Menu>

      {/* ── QR Code Dialog ── */}
      <Dialog
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 4,
            overflow: 'hidden',
            background: 'linear-gradient(160deg, #0f172a 0%, #1e293b 100%)',
          }
        }}
      >
        <DialogContent sx={{ p: 0 }}>
          {/* Header */}
          <Box sx={{ px: 3, pt: 3, pb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: alpha('#6366f1', 0.2), display: 'flex' }}>
                <QrCode size={18} color="#818cf8" />
              </Box>
              <Box>
                <Typography sx={{ fontWeight: 800, color: 'white', fontSize: '0.95rem', lineHeight: 1.2 }}>
                  Scan to Pay
                </Typography>
                {currentBusiness?.name && (
                  <Typography sx={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.72rem', mt: 0.25 }}>
                    {currentBusiness.name}
                  </Typography>
                )}
              </Box>
            </Box>
            <IconButton onClick={() => setQrOpen(false)} size="small" sx={{ color: 'rgba(255,255,255,0.5)', '&:hover': { color: 'white', bgcolor: 'rgba(255,255,255,0.08)' } }}>
              <X size={18} />
            </IconButton>
          </Box>

          {/* QR Image */}
          <Box sx={{ px: 3, pb: 1.5, display: 'flex', justifyContent: 'center' }}>
            <Box sx={{
              bgcolor: 'white',
              borderRadius: 3,
              p: 2.5,
              display: 'inline-flex',
              boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
            }}>
              <img
                src={currentBusiness?.qrCode}
                alt="Payment QR"
                style={{ width: 240, height: 240, objectFit: 'contain', display: 'block' }}
              />
            </Box>
          </Box>

          {/* Footer hint */}
          <Box sx={{ px: 3, pt: 1, pb: 3, textAlign: 'center' }}>
            <Typography sx={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.72rem', letterSpacing: '0.03em' }}>
              Point your camera at the QR code to pay
            </Typography>
          </Box>
        </DialogContent>
      </Dialog>


      {/* ── This Week chart ── */}
      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        <Grid size={{ xs: 12 }}>
          <Card elevation={0} sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider', overflow: 'hidden', height: '100%' }}>
            <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: alpha('#4f46e5', 0.1), display: 'flex' }}>
                  <TrendingUp size={16} color="#4f46e5" />
                </Box>
                <Box>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.875rem', lineHeight: 1.2 }}>{PERIOD_LABELS[period]}</Typography>
                  <Typography variant="caption" color="text.secondary">{t('dash.salesVsPurchases')}</Typography>
                </Box>
              </Box>
              <Stack direction="row" spacing={2.5}>
                {[{ color: '#6366f1', label: 'Sales' }, { color: '#f43f5e', label: 'Purchases' }].map(({ color, label }) => (
                  <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: 1, bgcolor: color }} />
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>{label}</Typography>
                  </Box>
                ))}
              </Stack>
            </Box>
            <Box sx={{ p: { xs: 1, sm: 2.5 }, height: { xs: 220, sm: 290 } }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.chartData} margin={{ top: 8, right: 4, left: isMobile ? -28 : -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gPurch" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={alpha(theme.palette.text.primary, 0.06)} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: theme.palette.text.disabled, fontSize: 11, fontWeight: 500 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: theme.palette.text.disabled, fontSize: 11 }} tickFormatter={v => v >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : `₹${v}`} />
                  <ReTooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="sales" stroke="#6366f1" strokeWidth={2.5} fill="url(#gSales)" name="Sales" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                  <Area type="monotone" dataKey="purchases" stroke="#f43f5e" strokeWidth={2} fill="url(#gPurch)" name="Purchases" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
          </Card>
        </Grid>
      </Grid>

      {/* ── Recent Transactions + Upcoming Due Dates ── */}
      <Grid container spacing={2} sx={{ mb: 2.5 }}>

        {/* Recent Transactions */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card elevation={0} sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0 }}>
              <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: alpha('#0891b2', 0.1), display: 'flex' }}>
                <ReceiptText size={16} color="#0891b2" />
              </Box>
              <Box>
                <Typography sx={{ fontWeight: 700, fontSize: '0.875rem', lineHeight: 1.2 }}>{t('dash.recentTransactions')}</Typography>
                <Typography variant="caption" color="text.secondary">{recentTx.length} latest entries</Typography>
              </Box>
            </Box>
            <Box sx={{ flex: 1, overflow: 'auto' }}>
              {recentTx.length === 0 ? (
                <Box sx={{ py: 7, textAlign: 'center' }}>
                  <ReceiptText size={34} strokeWidth={1.5} style={{ marginBottom: 8, opacity: 0.3 }} />
                  <Typography variant="body2" color="text.disabled" sx={{ fontWeight: 500 }}>{t('dash.noTransactions')}</Typography>
                </Box>
              ) : (
                recentTx.map((tx, idx) => {
                  const isSale = tx.type === 'Sales';
                  const clr = isSale ? '#4f46e5' : '#e11d48';
                  return (
                    <Box key={tx.id}>
                      <Stack direction="row" alignItems="center" spacing={1.5} onClick={() => { setPreviewTx(tx); setPreviewOpen(true); }} sx={{ px: 2, py: 1.25, cursor: 'pointer', '&:hover': { bgcolor: alpha(theme.palette.action.hover, 0.5) } }}>
                        <Avatar sx={{ width: 36, height: 36, fontSize: '0.78rem', fontWeight: 800, flexShrink: 0, bgcolor: alpha(clr, 0.1), color: clr }}>
                          {(tx.partyName || '?')[0].toUpperCase()}
                        </Avatar>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8125rem' }} noWrap>
                            {tx.partyName || (isSale ? 'Cash & Carry' : 'Cash Purchase')}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>{tx.date}</Typography>
                        </Box>
                        <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 800, color: clr, fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                            {isSale ? '+' : '-'}₹{tx.totalAmount?.toLocaleString('en-IN') ?? '0'}
                          </Typography>
                          <Box sx={{ px: 0.75, py: 0.1, borderRadius: 0.75, bgcolor: alpha(clr, 0.08), display: 'inline-block', mt: 0.25 }}>
                            <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: clr, lineHeight: 1.4 }}>{tx.type}</Typography>
                          </Box>
                        </Box>
                      </Stack>
                      {idx < recentTx.length - 1 && <Divider sx={{ mx: 2 }} />}
                    </Box>
                  );
                })
              )}
            </Box>
          </Card>
        </Grid>

        {/* Due Dates */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card elevation={0} sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
            <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: alpha('#0891b2', 0.1), display: 'flex' }}>
                <Clock size={16} color="#0891b2" />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.875rem', lineHeight: 1.2 }}>{t('dash.upcomingDue')}</Typography>
                <Typography variant="caption" color="text.secondary">Next 30 days</Typography>
              </Box>
              {dueDates.length > 0 && (
                <Chip label={dueDates.length} size="small" sx={{ fontWeight: 800, bgcolor: alpha('#0891b2', 0.1), color: '#0891b2', border: 'none' }} />
              )}
            </Box>
            {dueDates.length === 0 ? (
              <Box sx={{ py: 5, textAlign: 'center', opacity: 0.45 }}>
                <Clock size={28} strokeWidth={1.5} style={{ marginBottom: 8 }} />
                <Typography variant="body2" sx={{ fontWeight: 500 }}>No upcoming due dates</Typography>
              </Box>
            ) : (
              <Stack spacing={0}>
                {dueDates.map((tx, idx) => {
                  const isOverdue = new Date(tx.dueDate + 'T00:00:00') < new Date();
                  const clr = isOverdue ? '#dc2626' : '#0891b2';
                  return (
                    <Box key={tx.id}>
                      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ px: 2, py: 1.25, '&:hover': { bgcolor: alpha(theme.palette.action.hover, 0.4) } }}>
                        <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: alpha(clr, 0.1), flexShrink: 0, display: 'flex' }}>
                          <FileText size={16} color={clr} />
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8125rem' }} noWrap>{tx.partyName}</Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>{tx.txType} · Due {tx.dueDate}</Typography>
                        </Box>
                        <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                            ₹{tx.totalAmount?.toLocaleString('en-IN')}
                          </Typography>
                          {isOverdue && (
                            <Chip label="Overdue" size="small" color="error"
                              sx={{ fontWeight: 700, fontSize: '0.62rem', height: 18, mt: 0.25 }} />
                          )}
                        </Box>
                      </Stack>
                      {idx < dueDates.length - 1 && <Divider sx={{ mx: 2 }} />}
                    </Box>
                  );
                })}
              </Stack>
            )}
          </Card>
        </Grid>
      </Grid>

      {/* ── Vendor Payables ── */}
      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card elevation={0} sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
            <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: alpha('#d97706', 0.1), display: 'flex' }}>
                <Upload size={16} color="#d97706" />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.875rem', lineHeight: 1.2 }}>{t('dash.vendorPayables')}</Typography>
                <Typography variant="caption" color="text.secondary">Amounts you owe to vendors</Typography>
              </Box>
              {stats.toGive > 0 && (
                <Chip label={`₹${stats.toGive.toLocaleString('en-IN')}`} size="small"
                  sx={{ fontWeight: 800, bgcolor: alpha('#d97706', 0.1), color: '#d97706', border: 'none', fontSize: '0.75rem' }} />
              )}
            </Box>
            {stats.vendorsWithBalance.length === 0 ? (
              <Box sx={{ py: 5, textAlign: 'center', opacity: 0.45 }}>
                <Upload size={28} strokeWidth={1.5} style={{ marginBottom: 8 }} />
                <Typography variant="body2" sx={{ fontWeight: 500 }}>No vendor payables</Typography>
              </Box>
            ) : (
              <Stack spacing={0}>
                {stats.vendorsWithBalance.map((v, idx) => {
                  const owed = (v.balance || 0) < 0 ? -v.balance : 0;
                  return (
                    <Box key={v.id}>
                      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ px: 2, py: 1.25, '&:hover': { bgcolor: alpha(theme.palette.action.hover, 0.4) } }}>
                        <Avatar sx={{ width: 34, height: 34, fontSize: '0.78rem', fontWeight: 800, bgcolor: alpha('#d97706', 0.1), color: '#d97706', flexShrink: 0 }}>
                          {v.name?.[0]?.toUpperCase() || 'V'}
                        </Avatar>
                        <Typography variant="body2" sx={{ flex: 1, fontWeight: 600, fontSize: '0.8125rem' }} noWrap>{v.name}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 800, color: '#d97706', whiteSpace: 'nowrap', fontSize: '0.8125rem' }}>
                          ₹{owed.toLocaleString('en-IN')}
                        </Typography>
                      </Stack>
                      {idx < stats.vendorsWithBalance.length - 1 && <Divider sx={{ mx: 2 }} />}
                    </Box>
                  );
                })}
              </Stack>
            )}
          </Card>
        </Grid>
      </Grid>

      {/* ── Exam Reminders (conditional) ── */}
      {examReminders.length > 0 && (
        <Card elevation={0} sx={{
          borderRadius: 2.5,
          border: '1px solid', borderColor: alpha('#d97706', 0.22),
          bgcolor: alpha('#d97706', 0.03),
          overflow: 'hidden',
        }}>
          <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid', borderColor: alpha('#d97706', 0.15), display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: alpha('#d97706', 0.15), display: 'flex' }}>
              <Bell size={16} color="#d97706" />
            </Box>
            <Typography sx={{ fontWeight: 700, fontSize: '0.875rem', color: '#b45309' }}>{t('dash.examReminders')}</Typography>
            <Chip label={examReminders.length} size="small" color="warning" sx={{ fontWeight: 800, height: 20 }} />
          </Box>
          <Stack spacing={0}>
            {examReminders.slice(0, 5).map((o, idx) => (
              <Box key={o.id}>
                <Stack direction="row" alignItems="center" spacing={1.5} sx={{ px: 2.5, py: 1.25 }}>
                  <Avatar sx={{ width: 34, height: 34, fontSize: '0.78rem', fontWeight: 800, bgcolor: alpha('#d97706', 0.12), color: '#d97706', flexShrink: 0 }}>
                    {(o.patientName || '?')[0].toUpperCase()}
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8125rem' }} noWrap>{o.patientName}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>Exam on {o.date} · Reminder: {o.examReminder}</Typography>
                  </Box>
                  <Chip label="Re-exam due" size="small" color="warning" variant="outlined" sx={{ fontWeight: 700, fontSize: '0.68rem' }} />
                </Stack>
                {idx < Math.min(examReminders.length, 5) - 1 && <Divider sx={{ mx: 2.5 }} />}
              </Box>
            ))}
          </Stack>
        </Card>
      )}

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
