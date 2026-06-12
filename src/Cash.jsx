import React, { useState, useMemo } from 'react';
import {
  Box, Card, CardContent, Typography, Button, TextField, MenuItem, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, Chip, Stack, Tooltip,
  ToggleButton, ToggleButtonGroup, useTheme, useMediaQuery, alpha, InputAdornment,
} from '@mui/material';
import { Wallet, Plus, Minus, Trash2, ArrowDownLeft, ArrowUpRight, X, Coins } from 'lucide-react';
import { useBusiness } from './BusinessContext';
import { useData } from './DataContext';
import { useDialog } from './DialogContext';
import { useI18n } from './i18n/I18nContext';
import { computeCashInHand } from './cashUtils';

const money = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => { try { return new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return d; } };

const IN_REASONS = ['Capital Added', 'Cash Received', 'Bank Withdrawal', 'Other Income', 'Other'];
const OUT_REASONS = ['Owner Drawings', 'Bank Deposit', 'Petty Cash', 'Other Expense', 'Other'];

const Cash = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { currentBusiness } = useBusiness();
  const { getItems, addItem, deleteItem } = useData();
  const { confirm } = useDialog();
  const { t } = useI18n();
  const bizId = currentBusiness?.id;

  const sales = useMemo(() => getItems('sales').filter(s => s.businessId === bizId), [getItems, bizId]);
  const purchases = useMemo(() => getItems('purchases').filter(p => p.businessId === bizId), [getItems, bizId]);
  const payments = useMemo(() => getItems('payments').filter(p => p.businessId === bizId), [getItems, bizId]);
  const expenses = useMemo(() => getItems('expenses').filter(e => e.businessId === bizId), [getItems, bizId]);
  const cashEntries = useMemo(() => getItems('cashEntries').filter(c => c.businessId === bizId), [getItems, bizId]);

  const cash = useMemo(() => computeCashInHand({
    openingCash: currentBusiness?.openingCash, sales, purchases, payments, expenses, cashEntries,
  }), [currentBusiness?.openingCash, sales, purchases, payments, expenses, cashEntries]);

  // ── Unified, auditable cash movement list (manual + auto) ───────────────────
  // Mirror cashUtils: a cash sale/purchase only appears once it is actually
  // settled (no status, status "paid", or no outstanding balance), so the list
  // always reconciles with the cash-in-hand balance above.
  const isCash = (m) => String(m || '').trim().toLowerCase() === 'cash';
  const isSettled = (r) => {
    const status = String(r.status || '').trim().toLowerCase();
    if (status === 'unpaid' || status === 'partial' || status === 'pending') return false;
    if (status === 'paid') return true;
    return (Number(r.balanceAmount) || 0) <= 0;
  };
  const movements = useMemo(() => {
    const rows = [];
    sales.filter(s => isCash(s.paymentMode) && isSettled(s)).forEach(s => rows.push({ id: 'S' + s.id, date: s.date, dir: 'in', label: `Cash sale ${s.invoiceNumber || ''}`.trim(), amount: Number(s.totalAmount) || 0, source: 'auto' }));
    payments.filter(p => p.type === 'PaymentIn' && isCash(p.paymentMode)).forEach(p => rows.push({ id: 'PI' + p.id, date: p.date, dir: 'in', label: `Payment from ${p.partyName || ''}`.trim(), amount: Number(p.totalAmount) || 0, source: 'auto' }));
    purchases.filter(p => isCash(p.paymentMode) && isSettled(p)).forEach(p => rows.push({ id: 'PU' + p.id, date: p.date, dir: 'out', label: `Cash purchase ${p.invoiceNumber || ''}`.trim(), amount: Number(p.totalAmount) || 0, source: 'auto' }));
    payments.filter(p => p.type === 'PaymentOut' && isCash(p.paymentMode)).forEach(p => rows.push({ id: 'PO' + p.id, date: p.date, dir: 'out', label: `Payment to ${p.partyName || ''}`.trim(), amount: Number(p.totalAmount) || 0, source: 'auto' }));
    expenses.filter(e => e.paymentMode == null || isCash(e.paymentMode)).forEach(e => rows.push({ id: 'E' + e.id, date: e.date, dir: 'out', label: `${e.category || 'Expense'}${e.description ? ' — ' + e.description : ''}`, amount: Number(e.amount) || 0, source: 'auto' }));
    cashEntries.forEach(c => rows.push({ id: c.id, date: c.date, dir: c.type, label: c.reason || (c.type === 'in' ? 'Cash In' : 'Cash Out'), note: c.note, amount: Number(c.amount) || 0, source: 'manual' }));
    return rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [sales, purchases, payments, expenses, cashEntries]);

  // ── Add dialog ──────────────────────────────────────────────────────────────
  const [dlg, setDlg] = useState(null); // 'in' | 'out' | null
  const [form, setForm] = useState({ amount: '', reason: '', note: '', date: new Date().toISOString().slice(0, 10) });

  const openDlg = (dir) => { setForm({ amount: '', reason: '', note: '', date: new Date().toISOString().slice(0, 10) }); setDlg(dir); };

  const save = () => {
    const amt = Number(form.amount);
    if (!amt || amt <= 0) return;
    addItem('cashEntries', {
      businessId: bizId,
      type: dlg,
      amount: amt,
      reason: form.reason || (dlg === 'in' ? 'Cash In' : 'Cash Out'),
      note: form.note || '',
      date: form.date,
    });
    setDlg(null);
  };

  const removeEntry = async (id) => {
    const ok = await confirm({ title: 'Delete entry', message: 'Remove this cash entry? This cannot be undone.', confirmLabel: 'Delete', variant: 'danger' });
    if (ok) deleteItem('cashEntries', id);
  };

  const reasons = dlg === 'in' ? IN_REASONS : OUT_REASONS;

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
        <Box sx={{ p: 1, borderRadius: 2, background: 'linear-gradient(135deg,#0891b2,#22d3ee)', display: 'flex', boxShadow: `0 4px 12px ${alpha('#0891b2', 0.35)}` }}>
          <Wallet size={20} color="#fff" />
        </Box>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 900, letterSpacing: '-0.02em' }}>{t('cash.inHand')}</Typography>
          <Typography variant="caption" color="text.secondary">Cash book — record money in and out of your drawer</Typography>
        </Box>
      </Box>

      {/* Balance + actions */}
      <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: alpha('#0891b2', 0.2), bgcolor: alpha('#0891b2', 0.05), mb: 2.5 }}>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
            <Box>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#0e7490', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('cash.inHand')}</Typography>
              <Typography sx={{ fontSize: '2.2rem', fontWeight: 900, color: cash.balance >= 0 ? '#0e7490' : '#dc2626', letterSpacing: '-0.03em', lineHeight: 1.05 }}>
                {money(cash.balance)}
              </Typography>
              <Stack direction="row" spacing={2} sx={{ mt: 1, flexWrap: 'wrap' }}>
                <Typography variant="caption" color="text.secondary">{t('cash.opening')}: {money(cash.opening)}</Typography>
                <Typography variant="caption" sx={{ color: '#16a34a', fontWeight: 600 }}>↑ {t('cash.in')}: {money(cash.cashIn)}</Typography>
                <Typography variant="caption" sx={{ color: '#dc2626', fontWeight: 600 }}>↓ {t('cash.out')}: {money(cash.cashOut)}</Typography>
              </Stack>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button variant="contained" color="success" startIcon={<Plus size={16} />} onClick={() => openDlg('in')} sx={{ fontWeight: 700, textTransform: 'none' }}>
                {t('cash.in')}
              </Button>
              <Button variant="contained" color="error" startIcon={<Minus size={16} />} onClick={() => openDlg('out')} sx={{ fontWeight: 700, textTransform: 'none' }}>
                {t('cash.out')}
              </Button>
            </Stack>
          </Box>
        </CardContent>
      </Card>

      {/* Movements list */}
      <Card elevation={0} sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Cash Movements</Typography>
        </Box>
        {movements.length === 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 6, color: 'text.secondary' }}>
            <Coins size={32} style={{ opacity: 0.4 }} />
            <Typography variant="body2">No cash movements yet</Typography>
          </Box>
        ) : (
          movements.map((m) => (
            <Box key={m.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'rgba(0,0,0,0.05)' }}>
              <Box sx={{ p: 0.75, borderRadius: '50%', display: 'flex', flexShrink: 0, bgcolor: m.dir === 'in' ? alpha('#16a34a', 0.12) : alpha('#dc2626', 0.12), color: m.dir === 'in' ? '#16a34a' : '#dc2626' }}>
                {m.dir === 'in' ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }} noWrap>{m.label}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {fmtDate(m.date)}{m.note ? ` · ${m.note}` : ''}
                </Typography>
              </Box>
              {m.source === 'manual'
                ? <Chip size="small" label="Manual" sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700 }} />
                : <Chip size="small" variant="outlined" label="Auto" sx={{ height: 18, fontSize: '0.6rem' }} />}
              <Typography sx={{ fontWeight: 800, color: m.dir === 'in' ? '#16a34a' : '#dc2626', flexShrink: 0, minWidth: 90, textAlign: 'right' }}>
                {m.dir === 'in' ? '+' : '−'}{money(m.amount)}
              </Typography>
              {m.source === 'manual' && (
                <Tooltip title={t('common.delete')}>
                  <IconButton size="small" onClick={() => removeEntry(m.id)} sx={{ color: 'text.disabled', '&:hover': { color: '#dc2626' } }}><Trash2 size={15} /></IconButton>
                </Tooltip>
              )}
            </Box>
          ))
        )}
      </Card>

      {/* Add Cash In/Out dialog */}
      <Dialog open={!!dlg} onClose={() => setDlg(null)} maxWidth="xs" fullWidth fullScreen={isMobile}>
        <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {dlg === 'in' ? t('cash.in') : t('cash.out')}
          <IconButton size="small" onClick={() => setDlg(null)}><X size={18} /></IconButton>
        </DialogTitle>
        <DialogContent>
          <TextField
            fullWidth autoFocus type="number" label={t('common.amount')} value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> }, htmlInput: { min: 0, step: 0.01, style: { fontSize: '1.3rem', fontWeight: 700 } } }}
            sx={{ mt: 1, mb: 2 }}
          />
          <TextField select fullWidth size="small" label="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} sx={{ mb: 2 }}>
            {reasons.map(r => <MenuItem key={r} value={r}>{r}</MenuItem>)}
          </TextField>
          <TextField fullWidth size="small" type="date" label={t('common.date')} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} sx={{ mb: 2 }} />
          <TextField fullWidth size="small" label="Note (optional)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} multiline rows={2} />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDlg(null)} sx={{ textTransform: 'none' }}>{t('common.cancel')}</Button>
          <Button variant="contained" color={dlg === 'in' ? 'success' : 'error'} disabled={!Number(form.amount)} onClick={save} sx={{ textTransform: 'none', fontWeight: 700 }}>
            {t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Cash;
