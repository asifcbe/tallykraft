import React, { useMemo, useState } from 'react';
import {
  Box, Typography, Card, CardContent, Chip, Grid, Stack, TextField, InputAdornment,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer, TablePagination,
  Button, Tooltip, alpha,
} from '@mui/material';
import {
  Search, FileSpreadsheet, Gift, Clock, CheckCircle2, XCircle, TrendingUp, IndianRupee, AlertTriangle, Award, UserX,
} from 'lucide-react';
import { TRIAL_DAYS, PLANS, PRO_PLANS, planById, trialInfo } from './planTiers';

// Admin → Subscriptions: every subscription and trial fact in one place — one
// row per user × business, built from the live `subscriptions` collection
// (plus loaded users who never started a trial), with KPIs, filters and an
// Excel export that also lists every individual Razorpay payment.

const DAY = 86400000;
const LEGACY_PRICE = { monthly: 99, yearly: 999, monthly_pro: planById('monthly_pro').price, yearly_pro: planById('yearly_pro').price };
// Monthly-equivalent revenue per active plan (yearly spread over 12 months).
const monthlyValue = (plan) => (plan === 'yearly_pro' ? planById('yearly_pro').price / 12 : plan === 'monthly_pro' ? planById('monthly_pro').price : 0);

const parseBizSubs = (subDoc) => {
  if (!subDoc) return {};
  if (subDoc.businesses && typeof subDoc.businesses === 'object') return subDoc.businesses;
  if (subDoc.plan) return { '1': { plan: subDoc.plan, status: subDoc.status, startDate: subDoc.startDate || null, endDate: subDoc.endDate || null } };
  return {};
};

const STATUS = {
  trial:         { label: 'Trial active',     color: '#f59e0b' },
  trial_expired: { label: 'Trial ended',      color: '#ef4444' },
  paid:          { label: 'Paid · active',    color: '#16a34a' },
  expired:       { label: 'Paid · expired',   color: '#b91c1c' },
  admin:         { label: 'Admin granted',    color: '#8b5cf6' },
  revoked:       { label: 'Revoked',          color: '#6b7280' },
  not_started:   { label: 'Not started',      color: '#9ca3af' },
};

const fmtD = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const inr = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const payAmount = (p) => Number(p.total) || Number(p.amount) || LEGACY_PRICE[p.plan] || 0;
const daysBetween = (a, b) => Math.ceil((new Date(b) - new Date(a)) / DAY);

const buildSubscriptionRecords = (subscriptions, users) => {
  const now = new Date();
  const userByEmail = new Map(users.map((u) => [u.email || u.id, u]));
  const emails = new Set([...Object.keys(subscriptions || {}), ...userByEmail.keys()]);
  const rows = [];
  emails.forEach((email) => {
    const sub = subscriptions[email];
    const user = userByEmail.get(email);
    const base = { email, blocked: user?.allowed === false, isAdmin: !!user?.isAdmin, trialUsed: !!sub?.trialUsed };
    if (sub?.adminGrantedAll) {
      rows.push({ ...base, key: `${email}:all`, bId: 'all', bizName: 'All businesses', status: 'admin', plan: 'admin_granted', grantedBy: sub.grantedBy || '', grantedAt: sub.grantedAt || null, payments: [] });
      return;
    }
    const entries = Object.entries(parseBizSubs(sub));
    if (!entries.length) {
      rows.push({ ...base, key: `${email}:none`, bId: '', bizName: '', status: 'not_started', payments: [] });
      return;
    }
    entries.forEach(([bId, biz]) => {
      const active = biz.status === 'active' && (!biz.endDate || new Date(biz.endDate) > now);
      const t = trialInfo(biz);
      const pays = Array.isArray(biz.payments) ? biz.payments : [];
      let status;
      if (biz.plan === 'admin_granted') status = active ? 'admin' : 'revoked';
      else if (biz.revokedAt && !active) status = 'revoked';
      else if (biz.plan === 'trial') status = active ? 'trial' : 'trial_expired';
      else if (PRO_PLANS.includes(biz.plan) || LEGACY_PRICE[biz.plan]) status = active ? 'paid' : 'expired';
      else status = active ? 'paid' : 'expired';
      const lastPay = pays[pays.length - 1] || null;
      const firstPaid = biz.firstPaidAt || pays[0]?.date || null;
      const trialLen = t.start && t.end ? daysBetween(t.start, t.end) : null;
      const trialLeft = status === 'trial' && t.end ? Math.max(0, daysBetween(now, t.end)) : null;
      rows.push({
        ...base,
        key: `${email}:${bId}`,
        bId,
        bizName: biz.businessName || biz.lastBilling?.businessName || lastPay?.businessName || `Business ${bId}`,
        status,
        plan: biz.plan,
        trialStart: t.start, trialEnd: t.end, trialLen, trialLeft,
        converted: !!(t.start && pays.length),
        trialToPaidDays: t.start && firstPaid ? Math.max(0, daysBetween(t.start, firstPaid)) : null,
        firstPaid,
        periodStart: biz.startDate || null,
        periodEnd: biz.endDate || null,
        daysLeft: biz.endDate ? Math.max(0, daysBetween(now, biz.endDate)) : null,
        active,
        payments: pays,
        payCount: pays.length,
        totalPaid: pays.reduce((s, p) => s + payAmount(p), 0),
        lastPayDate: lastPay?.date || null,
        lastPayAmount: lastPay ? payAmount(lastPay) : null,
        lastPayId: lastPay?.paymentId || biz.razorpayPaymentId || null,
        source: pays.length ? 'Razorpay' : (biz.grantedBy ? 'Admin grant' : (biz.plan === 'trial' ? 'Self-started trial' : '—')),
        grantedBy: biz.grantedBy || '',
        grantedAt: biz.grantedAt || null,
        revokedAt: biz.revokedAt || null,
        customerState: lastPay?.customerState || biz.lastBilling?.customerState || '',
        customerGstin: lastPay?.customerGstin || biz.lastBilling?.customerGstin || '',
      });
    });
  });
  return rows;
};

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'trial', label: 'Trial active' },
  { key: 'trial_expired', label: 'Trial ended (unpaid)' },
  { key: 'paid', label: 'Paid · active' },
  { key: 'expired', label: 'Paid · expired' },
  { key: 'expiring', label: 'Expiring ≤ 7 days' },
  { key: 'admin', label: 'Admin granted' },
  { key: 'revoked', label: 'Revoked' },
  { key: 'not_started', label: 'Not started' },
];

const AdminSubscriptionRecords = ({ subscriptions, users, onGrant }) => {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const records = useMemo(() => buildSubscriptionRecords(subscriptions || {}, users || []), [subscriptions, users]);

  const kpis = useMemo(() => {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${now.getMonth()}`;
    const biz = records.filter((r) => r.bId && r.bId !== 'all');
    const trialsStarted = biz.filter((r) => r.trialStart).length;
    const converted = biz.filter((r) => r.converted).length;
    const paidActive = biz.filter((r) => r.status === 'paid').length;
    let revenueMonth = 0, revenueAll = 0;
    biz.forEach((r) => r.payments.forEach((p) => {
      const a = payAmount(p);
      revenueAll += a;
      const d = p.date ? new Date(p.date) : null;
      if (d && `${d.getFullYear()}-${d.getMonth()}` === monthKey) revenueMonth += a;
    }));
    return {
      trialActive: biz.filter((r) => r.status === 'trial').length,
      trialEnded: biz.filter((r) => r.status === 'trial_expired').length,
      trialsStarted,
      conversion: trialsStarted ? Math.round((converted / trialsStarted) * 100) : 0,
      converted,
      paidActive,
      paidExpired: biz.filter((r) => r.status === 'expired').length,
      expiring: biz.filter((r) => r.active && r.daysLeft !== null && r.daysLeft <= 7 && r.status !== 'admin').length,
      mrr: Math.round(biz.filter((r) => r.status === 'paid').reduce((s, r) => s + monthlyValue(r.plan), 0)),
      paidMonthly: biz.filter((r) => r.status === 'paid' && r.plan === 'monthly_pro').length,
      paidYearly: biz.filter((r) => r.status === 'paid' && r.plan === 'yearly_pro').length,
      revenueMonth, revenueAll,
      notStarted: records.filter((r) => r.status === 'not_started').length,
    };
  }, [records]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records
      .filter((r) => {
        if (filter === 'expiring') return r.active && r.daysLeft !== null && r.daysLeft <= 7 && r.status !== 'admin';
        return filter === 'all' || r.status === filter;
      })
      .filter((r) => !q || r.email.toLowerCase().includes(q) || (r.bizName || '').toLowerCase().includes(q) || (r.lastPayId || '').toLowerCase().includes(q))
      .sort((a, b) => {
        // Most urgent first: soonest period end among active, then newest activity.
        const ae = a.periodEnd ? new Date(a.periodEnd).getTime() : Infinity;
        const be = b.periodEnd ? new Date(b.periodEnd).getTime() : Infinity;
        if (a.active !== b.active) return a.active ? -1 : 1;
        return a.active ? ae - be : be - ae;
      });
  }, [records, filter, search]);

  const pageRows = filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const recRows = filtered.map((r) => ({
      'Email': r.email,
      'Business': r.bizName,
      'Business ID': r.bId,
      'Status': STATUS[r.status]?.label || r.status,
      'Plan': r.plan || '',
      'Trial Start': r.trialStart ? fmtD(r.trialStart) : '',
      'Trial End': r.trialEnd ? fmtD(r.trialEnd) : '',
      'Trial Length (days)': r.trialLen ?? '',
      'Trial Days Left': r.trialLeft ?? '',
      'Converted to Paid': r.trialStart ? (r.converted ? 'Yes' : 'No') : '',
      'Days Trial→Paid': r.trialToPaidDays ?? '',
      'First Paid': r.firstPaid ? fmtD(r.firstPaid) : '',
      'Current Period Start': r.periodStart ? fmtD(r.periodStart) : '',
      'Current Period End': r.periodEnd ? fmtD(r.periodEnd) : '',
      'Days Left': r.active ? (r.daysLeft ?? '') : 0,
      'Payments': r.payCount || 0,
      'Total Paid (₹)': r.totalPaid || 0,
      'Last Payment Date': r.lastPayDate ? fmtD(r.lastPayDate) : '',
      'Last Payment (₹)': r.lastPayAmount ?? '',
      'Last Razorpay ID': r.lastPayId || '',
      'Source': r.source || '',
      'Granted By': r.grantedBy || '',
      'Revoked At': r.revokedAt ? fmtD(r.revokedAt) : '',
      'Customer State': r.customerState || '',
      'Customer GSTIN': r.customerGstin || '',
      'Account Blocked': r.blocked ? 'Yes' : 'No',
    }));
    const payRows = [];
    filtered.forEach((r) => r.payments.forEach((p) => payRows.push({
      'Email': r.email, 'Business': r.bizName, 'Business ID': r.bId,
      'Invoice #': p.invoiceNo || '', 'Date': p.date ? fmtD(p.date) : '', 'Plan': p.plan || '',
      'Days': p.days || planById(p.plan).days, 'Period Start': p.periodStart ? fmtD(p.periodStart) : '', 'Period End': p.periodEnd ? fmtD(p.periodEnd) : '',
      'List Price (₹)': p.listPrice ?? '', 'Taxable (₹)': p.taxable ?? '', 'CGST (₹)': p.cgst ?? '', 'SGST (₹)': p.sgst ?? '', 'IGST (₹)': p.igst ?? '',
      'Total (₹)': payAmount(p), 'Razorpay Payment ID': p.paymentId || '', 'Customer State': p.customerState || '', 'Customer GSTIN': p.customerGstin || '',
    })));
    const sheet = (rows, name) => {
      const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: 'No records' }]);
      ws['!cols'] = Object.keys(rows[0] || { Note: '' }).map((k) => ({ wch: Math.min(40, Math.max(k.length, ...rows.map((r) => String(r[k] ?? '').length)) + 2) }));
      XLSX.utils.book_append_sheet(wb, ws, name);
    };
    sheet([
      { Metric: 'Trials active', Value: kpis.trialActive },
      { Metric: 'Trials ended (unpaid)', Value: kpis.trialEnded },
      { Metric: 'Trials started (all time)', Value: kpis.trialsStarted },
      { Metric: 'Trial → paid conversion', Value: `${kpis.conversion}% (${kpis.converted})` },
      { Metric: 'Paid · active', Value: kpis.paidActive },
      { Metric: 'Paid · expired', Value: kpis.paidExpired },
      { Metric: 'Expiring in ≤ 7 days', Value: kpis.expiring },
      { Metric: 'MRR (monthly-equivalent)', Value: kpis.mrr },
      { Metric: 'Paid · monthly / yearly', Value: `${kpis.paidMonthly} / ${kpis.paidYearly}` },
      { Metric: 'Revenue this month (₹)', Value: kpis.revenueMonth },
      { Metric: 'Revenue all time (₹)', Value: kpis.revenueAll },
      { Metric: 'Exported', Value: new Date().toLocaleString('en-IN') },
    ], 'Summary');
    sheet(recRows, 'Subscriptions & Trials');
    sheet(payRows, 'Payments');
    XLSX.writeFile(wb, `billdheko-subscriptions-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const tiles = [
    { label: 'Trials active', value: kpis.trialActive, color: '#f59e0b', icon: Gift, f: 'trial' },
    { label: 'Trials ended (unpaid)', value: kpis.trialEnded, color: '#ef4444', icon: XCircle, f: 'trial_expired' },
    { label: 'Trial → paid', value: `${kpis.conversion}%`, sub: `${kpis.converted} of ${kpis.trialsStarted}`, color: '#0891b2', icon: TrendingUp },
    { label: 'Paid · active', value: kpis.paidActive, color: '#16a34a', icon: CheckCircle2, f: 'paid' },
    { label: 'Expiring ≤ 7 days', value: kpis.expiring, color: '#d97706', icon: AlertTriangle, f: 'expiring' },
    { label: 'Paid · expired', value: kpis.paidExpired, color: '#b91c1c', icon: Clock, f: 'expired' },
    { label: 'MRR', value: inr(kpis.mrr), sub: `${kpis.paidMonthly} monthly · ${kpis.paidYearly} yearly`, color: '#5c1f22', icon: IndianRupee },
    { label: 'Revenue this month', value: inr(kpis.revenueMonth), sub: `All time ${inr(kpis.revenueAll)}`, color: '#5c1f22', icon: IndianRupee },
  ];

  return (
    <Box sx={{ mb: 4 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1} sx={{ mb: 1.5 }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Subscriptions &amp; Trials</Typography>
          <Typography variant="caption" color="text.secondary">
            Plans: {PLANS.map(p => `₹${p.price.toLocaleString('en-IN')} / ${p.period}`).join(' or ')} per business · free trial {TRIAL_DAYS} days. One row per user × business.
          </Typography>
        </Box>
        <Button size="small" variant="outlined" startIcon={<FileSpreadsheet size={14} />} onClick={exportExcel}
          sx={{ textTransform: 'none', borderRadius: 2, fontWeight: 700 }}>
          Export (Excel)
        </Button>
      </Stack>

      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        {tiles.map((t) => (
          <Grid key={t.label} size={{ xs: 6, sm: 4, md: 3 }}>
            <Card elevation={0} onClick={t.f ? () => { setFilter(t.f); setPage(0); } : undefined}
              sx={{ border: '1px solid', borderColor: filter === t.f ? t.color : alpha(t.color, 0.2), borderRadius: 2, bgcolor: alpha(t.color, 0.04), cursor: t.f ? 'pointer' : 'default', height: '100%' }}>
              <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography sx={{ fontWeight: 800, fontSize: '1.2rem', color: t.color }}>{t.value}</Typography>
                  <t.icon size={18} color={t.color} />
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 600 }}>{t.label}</Typography>
                {t.sub && <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.66rem' }}>{t.sub}</Typography>}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Stack direction="row" flexWrap="wrap" gap={0.75} alignItems="center" sx={{ mb: 1.5 }}>
        {FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} size="small" clickable onClick={() => { setFilter(f.key); setPage(0); }}
            sx={{ fontWeight: 700, fontSize: '0.7rem', bgcolor: filter === f.key ? '#5c1f22' : 'transparent', color: filter === f.key ? '#fff' : 'text.secondary', border: '1px solid', borderColor: filter === f.key ? '#5c1f22' : 'divider' }} />
        ))}
        <TextField size="small" placeholder="Search email, business, Razorpay ID…" value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          sx={{ ml: { md: 'auto' }, minWidth: 240 }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search size={14} /></InputAdornment> } }} />
      </Stack>

      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <TableContainer sx={{ maxHeight: 560 }}>
          <Table size="small" stickyHeader sx={{ '& td, & th': { fontSize: '0.72rem', whiteSpace: 'nowrap', py: 0.75 } }}>
            <TableHead>
              <TableRow>
                <TableCell>User / Business</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Trial</TableCell>
                <TableCell>Converted</TableCell>
                <TableCell>Current period</TableCell>
                <TableCell align="right">Days left</TableCell>
                <TableCell align="right">Payments</TableCell>
                <TableCell align="right">Total paid</TableCell>
                <TableCell>Last payment</TableCell>
                <TableCell>Source</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {pageRows.map((r) => {
                const st = STATUS[r.status] || { label: r.status, color: '#666' };
                return (
                  <TableRow key={r.key} hover>
                    <TableCell>
                      <Typography sx={{ fontWeight: 700, fontSize: '0.74rem' }}>{r.email}</Typography>
                      <Typography sx={{ fontSize: '0.66rem', color: 'text.secondary' }}>
                        {r.bizName ? `${r.bizName}${r.bId && r.bId !== 'all' ? ` · #${r.bId}` : ''}` : 'No business subscribed yet'}
                        {r.blocked ? ' · blocked' : ''}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label={st.label} sx={{ height: 20, fontSize: '0.64rem', fontWeight: 700, bgcolor: alpha(st.color, 0.12), color: st.color }} />
                      {PRO_PLANS.includes(r.plan) && <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary', mt: 0.25 }}>{planById(r.plan).name} plan</Typography>}
                    </TableCell>
                    <TableCell>
                      {r.trialStart ? (
                        <>
                          <Typography sx={{ fontSize: '0.7rem' }}>{fmtD(r.trialStart)} → {fmtD(r.trialEnd)}</Typography>
                          <Typography sx={{ fontSize: '0.64rem', color: 'text.secondary' }}>
                            {r.trialLen != null ? `${r.trialLen} days` : ''}{r.trialLeft != null ? ` · ${r.trialLeft} left` : ''}
                          </Typography>
                        </>
                      ) : '—'}
                    </TableCell>
                    <TableCell>
                      {r.trialStart ? (r.converted
                        ? <Typography sx={{ fontSize: '0.7rem', color: '#16a34a', fontWeight: 700 }}>Yes{r.trialToPaidDays != null ? ` · day ${r.trialToPaidDays}` : ''}</Typography>
                        : <Typography sx={{ fontSize: '0.7rem', color: 'text.disabled' }}>No</Typography>) : '—'}
                    </TableCell>
                    <TableCell>
                      {r.periodEnd ? `${fmtD(r.periodStart)} → ${fmtD(r.periodEnd)}` : (r.status === 'admin' ? 'Unlimited' : '—')}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: r.active && r.daysLeft !== null && r.daysLeft <= 7 ? '#d97706' : 'inherit' }}>
                      {r.active ? (r.daysLeft ?? '∞') : (r.periodEnd ? '0' : '—')}
                    </TableCell>
                    <TableCell align="right">{r.payCount || 0}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>{r.totalPaid ? inr(r.totalPaid) : '—'}</TableCell>
                    <TableCell>
                      {r.lastPayDate ? (
                        <Tooltip title={r.lastPayId ? `Razorpay: ${r.lastPayId}` : ''}>
                          <span>{fmtD(r.lastPayDate)} · {inr(r.lastPayAmount)}</span>
                        </Tooltip>
                      ) : '—'}
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: '0.7rem' }}>{r.source || '—'}</Typography>
                      {r.grantedBy && <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary' }}>by {r.grantedBy}</Typography>}
                    </TableCell>
                    <TableCell align="right">
                      {onGrant && r.bId !== 'all' && (
                        <Tooltip title="Grant / extend">
                          <Button size="small" onClick={() => onGrant(r.email, r.bId)} sx={{ minWidth: 0, p: 0.5, color: '#5c1f22' }}>
                            <Award size={14} />
                          </Button>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {pageRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} sx={{ py: 5, textAlign: 'center', color: 'text.secondary' }}>
                    <UserX size={18} style={{ opacity: 0.5, verticalAlign: 'middle', marginRight: 6 }} />
                    No records match.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination component="div" count={filtered.length} page={page} rowsPerPage={rowsPerPage}
          onPageChange={(_, p) => setPage(p)} onRowsPerPageChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(0); }}
          rowsPerPageOptions={[25, 50, 100, 250]} />
      </Card>
      <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.75 }}>
        "Not started" lists only users loaded in the Users tab. Trial dates for records created before trial history was kept are taken from the trial plan itself, so a business that converted earlier may show no trial.
      </Typography>
    </Box>
  );
};

export default AdminSubscriptionRecords;
