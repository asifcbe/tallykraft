import React, { useState, useMemo, useEffect } from 'react';
import {
  Box, Card, CardContent, Typography, Button, TextField, MenuItem, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, Chip, Stack, Tooltip,
  useTheme, useMediaQuery, alpha, InputAdornment,
} from '@mui/material';
import {
  Wallet, Plus, Minus, Trash2, ArrowDownLeft, ArrowUpRight, X, Coins,
  Landmark, ArrowLeftRight,
} from 'lucide-react';
import { useBusiness } from './BusinessContext';
import { useData } from './DataContext';
import { useDialog } from './DialogContext';
import { useI18n } from './i18n/I18nContext';
import { useSubscription } from './SubscriptionContext';
import { computeCashInHand, computeBankBalance } from './cashUtils';

const money = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => {
  try { return new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return d; }
};

const CASH_IN_REASONS  = ['Capital Added', 'Cash Received', 'Bank Withdrawal', 'Other Income', 'Other'];
const CASH_OUT_REASONS = ['Owner Drawings', 'Bank Deposit', 'Petty Cash', 'Other Expense', 'Other'];
const BANK_IN_REASONS  = ['Cash Deposit', 'Bank Transfer In', 'Interest Credited', 'Loan Received', 'Other'];
const BANK_OUT_REASONS = ['Cash Withdrawal', 'Bank Transfer Out', 'Bank Charges', 'Loan Repayment', 'Cheque Issued', 'Other'];

/* ─── shared helpers ─── */
const isCash    = (m) => String(m || '').trim().toLowerCase() === 'cash';
const isDigital = (m) => { const v = String(m || '').trim().toLowerCase(); return ['bank','cheque','neft','rtgs','upi','card'].includes(v); };
const isSettled = (r) => {
  const s = String(r.status || '').trim().toLowerCase();
  if (s === 'unpaid' || s === 'partial' || s === 'pending') return false;
  if (s === 'paid') return true;
  return (Number(r.balanceAmount) || 0) <= 0;
};

/* ─── Movement row ─── */
const MovementRow = ({ m, onDelete, accentIn, accentOut, t }) => (
  <Box sx={{
    display: 'flex', alignItems: 'center', gap: 1.5,
    px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'rgba(0,0,0,0.05)',
    '&:last-child': { borderBottom: 'none' },
  }}>
    <Box sx={{
      p: 0.75, borderRadius: '50%', display: 'flex', flexShrink: 0,
      bgcolor: m.dir === 'in' ? alpha(accentIn,  0.12) : alpha(accentOut, 0.12),
      color:   m.dir === 'in' ? accentIn : accentOut,
    }}>
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
    <Typography sx={{
      fontWeight: 800,
      color: m.dir === 'in' ? accentIn : accentOut,
      flexShrink: 0, minWidth: 90, textAlign: 'right',
    }}>
      {m.dir === 'in' ? '+' : '−'}{money(m.amount)}
    </Typography>
    {m.source === 'manual' && (
      <Tooltip title={t('common.delete')}>
        <IconButton size="small" onClick={() => onDelete(m.id)}
          sx={{ color: 'text.disabled', '&:hover': { color: '#dc2626' } }}>
          <Trash2 size={15} />
        </IconButton>
      </Tooltip>
    )}
  </Box>
);

/* ─── Add entry dialog ─── */
const AddDialog = ({ open, dir, reasons, onClose, onSave, accentIn, accentOut, isMobile, t }) => {
  const [form, setForm] = useState({ amount: '', reason: '', note: '', date: new Date().toISOString().slice(0, 10) });
  const reset = () => setForm({ amount: '', reason: '', note: '', date: new Date().toISOString().slice(0, 10) });

  const handleClose = () => { reset(); onClose(); };
  const handleSave  = () => { onSave(form); reset(); };

  const isIn = dir === 'in' || dir === 'bank_in';
  const accent = isIn ? accentIn : accentOut;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth fullScreen={isMobile}>
      <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ p: 0.5, borderRadius: 1.5, bgcolor: alpha(accent, 0.12), color: accent, display: 'flex' }}>
            {isIn ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
          </Box>
          {isIn ? 'Money In' : 'Money Out'}
        </Box>
        <IconButton size="small" onClick={handleClose}><X size={18} /></IconButton>
      </DialogTitle>
      <DialogContent>
        <TextField
          fullWidth autoFocus type="number" label={t('common.amount')} value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter' && Number(form.amount) > 0) handleSave(); }}
          slotProps={{
            input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> },
            htmlInput: { min: 0, step: 0.01, style: { fontSize: '1.3rem', fontWeight: 700 } },
          }}
          sx={{ mt: 1, mb: 2 }}
        />
        <TextField select fullWidth size="small" label="Reason" value={form.reason}
          onChange={(e) => setForm({ ...form, reason: e.target.value })} sx={{ mb: 2 }}>
          {reasons.map(r => <MenuItem key={r} value={r}>{r}</MenuItem>)}
        </TextField>
        <TextField fullWidth size="small" type="date" label={t('common.date')} value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
          slotProps={{ inputLabel: { shrink: true } }} sx={{ mb: 2 }} />
        <TextField fullWidth size="small" label="Reference / Note (optional)" value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })} multiline rows={2} />
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={handleClose} sx={{ textTransform: 'none' }}>{t('common.cancel')}</Button>
        <Button variant="contained" disabled={!Number(form.amount) || Number(form.amount) <= 0}
          onClick={handleSave}
          sx={{
            textTransform: 'none', fontWeight: 700,
            bgcolor: accent, '&:hover': { bgcolor: accent, opacity: 0.88 },
          }}>
          {t('common.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

/* ═══════════════════════════════════════════════════════════════════ */
const Cash = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { currentBusiness } = useBusiness();
  const { getItems, addItem, deleteItem } = useData();
  const { confirm } = useDialog();
  const { t } = useI18n();
  const { isBusinessActive } = useSubscription();
  const bizId = currentBusiness?.id;
  const canWrite = isBusinessActive(bizId);

  /* ── raw data ── */
  const sales      = useMemo(() => getItems('sales').filter(s => s.businessId === bizId),      [getItems, bizId]);
  const purchases  = useMemo(() => getItems('purchases').filter(p => p.businessId === bizId),  [getItems, bizId]);
  const payments   = useMemo(() => getItems('payments').filter(p => p.businessId === bizId),   [getItems, bizId]);
  const expenses   = useMemo(() => getItems('expenses').filter(e => e.businessId === bizId),   [getItems, bizId]);
  const cashEntries = useMemo(() => getItems('cashEntries').filter(c => c.businessId === bizId), [getItems, bizId]);

  /* ── balances ── */
  const cash = useMemo(() => computeCashInHand({
    openingCash: currentBusiness?.openingCash, sales, purchases, payments, expenses, cashEntries,
  }), [currentBusiness?.openingCash, sales, purchases, payments, expenses, cashEntries]);

  const bank = useMemo(() => computeBankBalance({
    openingBank: currentBusiness?.openingBank, sales, purchases, payments, expenses, cashEntries,
  }), [currentBusiness?.openingBank, sales, purchases, payments, expenses, cashEntries]);

  /* ── cash movements ── */
  const cashMovements = useMemo(() => {
    const rows = [];
    sales.filter(s => isCash(s.paymentMode) && isSettled(s))
      .forEach(s => rows.push({ id: 'S'+s.id, date: s.date, dir: 'in',  label: `Cash sale ${s.invoiceNumber||''}`.trim(), amount: Number(s.totalAmount)||0, source:'auto' }));
    payments.filter(p => p.type==='PaymentIn' && isCash(p.paymentMode))
      .forEach(p => rows.push({ id:'PI'+p.id, date: p.date, dir:'in',  label:`Payment from ${p.partyName||''}`.trim(), amount:Number(p.totalAmount)||0, source:'auto' }));
    purchases.filter(p => isCash(p.paymentMode) && isSettled(p))
      .forEach(p => rows.push({ id:'PU'+p.id, date:p.date, dir:'out', label:`Cash purchase ${p.invoiceNumber||''}`.trim(), amount:Number(p.totalAmount)||0, source:'auto' }));
    payments.filter(p => p.type==='PaymentOut' && isCash(p.paymentMode))
      .forEach(p => rows.push({ id:'PO'+p.id, date:p.date, dir:'out', label:`Payment to ${p.partyName||''}`.trim(), amount:Number(p.totalAmount)||0, source:'auto' }));
    expenses.filter(e => e.paymentMode==null || isCash(e.paymentMode))
      .forEach(e => rows.push({ id:'E'+e.id, date:e.date, dir:'out', label:`${e.category||'Expense'}${e.description?' — '+e.description:''}`, amount:Number(e.amount)||0, source:'auto' }));
    cashEntries.filter(c => c.type==='in' || c.type==='out')
      .forEach(c => rows.push({ id:c.id, date:c.date, dir:c.type, label:c.reason||(c.type==='in'?'Cash In':'Cash Out'), note:c.note, amount:Number(c.amount)||0, source:'manual' }));
    return rows.sort((a,b) => (b.date||'').localeCompare(a.date||''));
  }, [sales, purchases, payments, expenses, cashEntries]);

  /* ── bank movements ── */
  const bankMovements = useMemo(() => {
    const rows = [];
    sales.filter(s => isDigital(s.paymentMode) && isSettled(s))
      .forEach(s => rows.push({ id:'BS'+s.id,  date:s.date, dir:'in',  label:`${s.paymentMode||'Bank'} sale ${s.invoiceNumber||''}`.trim(), amount:Number(s.totalAmount)||0, source:'auto' }));
    payments.filter(p => p.type==='PaymentIn' && isDigital(p.paymentMode))
      .forEach(p => rows.push({ id:'BPI'+p.id, date:p.date, dir:'in',  label:`${p.paymentMode||'Bank'} payment from ${p.partyName||''}`.trim(), amount:Number(p.totalAmount)||0, source:'auto' }));
    purchases.filter(p => isDigital(p.paymentMode) && isSettled(p))
      .forEach(p => rows.push({ id:'BPU'+p.id, date:p.date, dir:'out', label:`${p.paymentMode||'Bank'} purchase ${p.invoiceNumber||''}`.trim(), amount:Number(p.totalAmount)||0, source:'auto' }));
    payments.filter(p => p.type==='PaymentOut' && isDigital(p.paymentMode))
      .forEach(p => rows.push({ id:'BPO'+p.id, date:p.date, dir:'out', label:`${p.paymentMode||'Bank'} payment to ${p.partyName||''}`.trim(), amount:Number(p.totalAmount)||0, source:'auto' }));
    expenses.filter(e => e.paymentMode!=null && isDigital(e.paymentMode))
      .forEach(e => rows.push({ id:'BE'+e.id, date:e.date, dir:'out', label:`${e.category||'Expense'}${e.description?' — '+e.description:''}`, amount:Number(e.amount)||0, source:'auto' }));
    cashEntries.filter(c => c.type==='bank_in' || c.type==='bank_out')
      .forEach(c => rows.push({ id:c.id, date:c.date, dir: c.type==='bank_in'?'in':'out', label:c.reason||(c.type==='bank_in'?'Bank Credit':'Bank Debit'), note:c.note, amount:Number(c.amount)||0, source:'manual' }));
    return rows.sort((a,b) => (b.date||'').localeCompare(a.date||''));
  }, [sales, purchases, payments, expenses, cashEntries]);

  /* ── active tab ── */
  useEffect(() => {
    const handler = (e) => {
      const intent = e.detail?.intent;
      if (intent === 'cash_in')  { setActiveTab('cash'); setCashDlg('in'); }
      if (intent === 'cash_out') { setActiveTab('cash'); setCashDlg('out'); }
      if (intent === 'bank_in')  { setActiveTab('bank'); setBankDlg('bank_in'); }
      if (intent === 'bank_out') { setActiveTab('bank'); setBankDlg('bank_out'); }
    };
    window.addEventListener('dashboard-quick-new', handler);
    return () => window.removeEventListener('dashboard-quick-new', handler);
  }, []);

  const [activeTab, setActiveTab] = useState('cash'); // 'cash' | 'bank'

  /* ── dialogs ── */
  const [cashDlg, setCashDlg] = useState(null); // 'in' | 'out' | null
  const [bankDlg, setBankDlg] = useState(null); // 'bank_in' | 'bank_out' | null

  const saveCashEntry = (form) => {
    const amt = Number(form.amount);
    if (!amt || amt <= 0) return;
    addItem('cashEntries', {
      businessId: bizId, type: cashDlg, amount: amt,
      reason: form.reason || (cashDlg === 'in' ? 'Cash In' : 'Cash Out'),
      note: form.note || '', date: form.date,
    });
    setCashDlg(null);
  };

  const saveBankEntry = (form) => {
    const amt = Number(form.amount);
    if (!amt || amt <= 0) return;
    addItem('cashEntries', {
      businessId: bizId, type: bankDlg, amount: amt,
      reason: form.reason || (bankDlg === 'bank_in' ? 'Bank Credit' : 'Bank Debit'),
      note: form.note || '', date: form.date,
    });
    setBankDlg(null);
  };

  const removeEntry = async (id) => {
    const ok = await confirm({ title: 'Delete entry', message: 'Remove this entry? This cannot be undone.', confirmLabel: 'Delete', variant: 'danger' });
    if (ok) deleteItem('cashEntries', id);
  };

  /* ── colour tokens ── */
  const cashColor  = '#0891b2';
  const bankColor  = '#7c3aed';
  const green      = '#16a34a';
  const red        = '#dc2626';

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>

      {/* ── Dual-tab header ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5, flexWrap: 'wrap', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{
            p: 1, borderRadius: 2, display: 'flex',
            background: activeTab === 'cash'
              ? `linear-gradient(135deg, ${cashColor}, #22d3ee)`
              : `linear-gradient(135deg, ${bankColor}, #a78bfa)`,
            boxShadow: `0 4px 12px ${alpha(activeTab === 'cash' ? cashColor : bankColor, 0.35)}`,
            transition: 'all 0.25s ease',
          }}>
            {activeTab === 'cash' ? <Wallet size={20} color="#fff" /> : <Landmark size={20} color="#fff" />}
          </Box>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 900, letterSpacing: '-0.02em' }}>
              {activeTab === 'cash' ? t('cash.inHand') : 'Bank Book'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {activeTab === 'cash'
                ? 'Record cash in and out of your drawer'
                : 'Track bank account debits and credits'}
            </Typography>
          </Box>
        </Box>

        {/* Tab switcher pill */}
        <Box sx={{
          display: 'flex', gap: 0.5, p: 0.5,
          bgcolor: 'action.hover', borderRadius: 2.5,
          border: '1px solid', borderColor: 'divider',
        }}>
          {[
            { id: 'cash', label: 'Cash Book', icon: Wallet, color: cashColor },
            { id: 'bank', label: 'Bank Book', icon: Landmark, color: bankColor },
          ].map(({ id, label, icon: Icon, color }) => (
            <Box key={id} onClick={() => setActiveTab(id)} sx={{
              display: 'flex', alignItems: 'center', gap: 0.75,
              px: 1.5, py: 0.75, borderRadius: 2, cursor: 'pointer', userSelect: 'none',
              transition: 'all 0.15s',
              ...(activeTab === id ? {
                bgcolor: 'background.paper',
                boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                color,
              } : {
                color: 'text.secondary',
                '&:hover': { bgcolor: alpha(color, 0.06) },
              }),
            }}>
              <Icon size={14} />
              <Typography sx={{ fontSize: '0.8rem', fontWeight: activeTab === id ? 700 : 500 }}>{label}</Typography>
            </Box>
          ))}
        </Box>
      </Box>

      {/* ══════════════ CASH BOOK ══════════════ */}
      {activeTab === 'cash' && (
        <>
          <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: alpha(cashColor, 0.2), bgcolor: alpha(cashColor, 0.04), mb: 2.5 }}>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                <Box>
                  <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#0e7490', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('cash.inHand')}</Typography>
                  <Typography sx={{ fontSize: '2.2rem', fontWeight: 900, color: cash.balance >= 0 ? '#0e7490' : red, letterSpacing: '-0.03em', lineHeight: 1.05 }}>
                    {money(cash.balance)}
                  </Typography>
                  <Stack direction="row" spacing={2} sx={{ mt: 1, flexWrap: 'wrap' }}>
                    <Typography variant="caption" color="text.secondary">{t('cash.opening')}: {money(cash.opening)}</Typography>
                    <Typography variant="caption" sx={{ color: green, fontWeight: 600 }}>↑ {t('cash.in')}: {money(cash.cashIn)}</Typography>
                    <Typography variant="caption" sx={{ color: red, fontWeight: 600 }}>↓ {t('cash.out')}: {money(cash.cashOut)}</Typography>
                  </Stack>
                </Box>
                <Stack direction="row" spacing={1}>
                  <Button variant="contained" color="success" disabled={!canWrite} startIcon={<Plus size={16} />} onClick={() => setCashDlg('in')} sx={{ fontWeight: 700, textTransform: 'none' }}>
                    {t('cash.in')}
                  </Button>
                  <Button variant="contained" color="error" disabled={!canWrite} startIcon={<Minus size={16} />} onClick={() => setCashDlg('out')} sx={{ fontWeight: 700, textTransform: 'none' }}>
                    {t('cash.out')}
                  </Button>
                </Stack>
              </Box>
            </CardContent>
          </Card>

          <Card elevation={0} sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider' }}>
            <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Cash Movements</Typography>
            </Box>
            {cashMovements.length === 0 ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 6, color: 'text.secondary' }}>
                <Coins size={32} style={{ opacity: 0.4 }} />
                <Typography variant="body2">No cash movements yet</Typography>
              </Box>
            ) : cashMovements.map(m => (
              <MovementRow key={m.id} m={m} onDelete={removeEntry} accentIn={green} accentOut={red} t={t} />
            ))}
          </Card>
        </>
      )}

      {/* ══════════════ BANK BOOK ══════════════ */}
      {activeTab === 'bank' && (
        <>
          <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: alpha(bankColor, 0.2), bgcolor: alpha(bankColor, 0.04), mb: 2.5 }}>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                <Box>
                  <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: bankColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Bank Balance</Typography>
                  <Typography sx={{ fontSize: '2.2rem', fontWeight: 900, color: bank.balance >= 0 ? bankColor : red, letterSpacing: '-0.03em', lineHeight: 1.05 }}>
                    {money(bank.balance)}
                  </Typography>
                  <Stack direction="row" spacing={2} sx={{ mt: 1, flexWrap: 'wrap' }}>
                    <Typography variant="caption" color="text.secondary">Opening: {money(bank.opening)}</Typography>
                    <Typography variant="caption" sx={{ color: green, fontWeight: 600 }}>↑ Credits: {money(bank.bankIn)}</Typography>
                    <Typography variant="caption" sx={{ color: red, fontWeight: 600 }}>↓ Debits: {money(bank.bankOut)}</Typography>
                  </Stack>
                </Box>
                <Stack direction="row" spacing={1}>
                  <Button
                    variant="contained" startIcon={<ArrowDownLeft size={16} />}
                    disabled={!canWrite}
                    onClick={() => setBankDlg('bank_in')}
                    sx={{ fontWeight: 700, textTransform: 'none', bgcolor: green, '&:hover': { bgcolor: '#15803d' } }}>
                    Credit
                  </Button>
                  <Button
                    variant="contained" color="error" startIcon={<ArrowUpRight size={16} />}
                    disabled={!canWrite}
                    onClick={() => setBankDlg('bank_out')}
                    sx={{ fontWeight: 700, textTransform: 'none' }}>
                    Debit / Withdraw
                  </Button>
                </Stack>
              </Box>
            </CardContent>
          </Card>

          {/* Quick-action chips */}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            {[
              { label: 'Cash Withdrawal', dir: 'bank_out', sub: 'ATM / counter withdrawal' },
              { label: 'Cash Deposit',    dir: 'bank_in',  sub: 'Deposit cash into bank' },
              { label: 'Bank Charges',    dir: 'bank_out', sub: 'Service / maintenance fee' },
              { label: 'Interest',        dir: 'bank_in',  sub: 'Interest credited' },
            ].map(({ label, dir, sub }) => {
              const isIn = dir === 'bank_in';
              return (
                <Box key={label} onClick={() => canWrite && setBankDlg(dir)} sx={{
                  opacity: canWrite ? 1 : 0.45, pointerEvents: canWrite ? 'auto' : 'none',
                  display: 'flex', flexDirection: 'column', px: 1.75, py: 1,
                  borderRadius: 2, cursor: 'pointer', border: '1px solid',
                  borderColor: isIn ? alpha(green, 0.25) : alpha(red, 0.22),
                  bgcolor: isIn ? alpha(green, 0.04) : alpha(red, 0.04),
                  transition: 'all 0.15s',
                  '&:hover': { borderColor: isIn ? alpha(green, 0.45) : alpha(red, 0.4), bgcolor: isIn ? alpha(green, 0.08) : alpha(red, 0.08) },
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {isIn ? <ArrowDownLeft size={12} color={green} /> : <ArrowUpRight size={12} color={red} />}
                    <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: isIn ? green : red }}>{label}</Typography>
                  </Box>
                  <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem', mt: 0.1 }}>{sub}</Typography>
                </Box>
              );
            })}
          </Box>

          <Card elevation={0} sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider' }}>
            <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Bank Transactions</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Chip size="small" variant="outlined" label="Auto" sx={{ height: 18, fontSize: '0.6rem' }} />
                <Typography variant="caption" color="text.disabled">= from sales/payments</Typography>
                <Chip size="small" label="Manual" sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700, ml: 0.5 }} />
                <Typography variant="caption" color="text.disabled">= recorded here</Typography>
              </Box>
            </Box>
            {bankMovements.length === 0 ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 6, color: 'text.secondary' }}>
                <Landmark size={32} style={{ opacity: 0.3 }} />
                <Typography variant="body2">No bank transactions yet</Typography>
                <Typography variant="caption" color="text.disabled">Record a withdrawal or deposit using the buttons above</Typography>
              </Box>
            ) : bankMovements.map(m => (
              <MovementRow key={m.id} m={m} onDelete={removeEntry} accentIn={green} accentOut={red} t={t} />
            ))}
          </Card>
        </>
      )}

      {/* ── Cash add dialog ── */}
      <AddDialog
        open={!!cashDlg} dir={cashDlg}
        reasons={cashDlg === 'in' ? CASH_IN_REASONS : CASH_OUT_REASONS}
        onClose={() => setCashDlg(null)} onSave={saveCashEntry}
        accentIn={green} accentOut={red} isMobile={isMobile} t={t}
      />

      {/* ── Bank add dialog ── */}
      <AddDialog
        open={!!bankDlg} dir={bankDlg}
        reasons={bankDlg === 'bank_in' ? BANK_IN_REASONS : BANK_OUT_REASONS}
        onClose={() => setBankDlg(null)} onSave={saveBankEntry}
        accentIn={green} accentOut={red} isMobile={isMobile} t={t}
      />

    </Box>
  );
};

export default Cash;
