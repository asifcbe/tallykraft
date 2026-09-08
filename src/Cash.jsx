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
import { useSubscription } from './SubscriptionContext';
import { useData } from './DataContext';
import { useDialog } from './DialogContext';
import { useI18n } from './i18n/I18nContext';
import { computeCashInHand, computeBankBalance } from './cashUtils';
import { acknowledgeQuickNew } from './quickNewBridge';
import { byTxTimeDesc, formatCreatedTime } from './txTimeUtils';

const money = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => {
  try { return new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return d; }
};

const CASH_IN_REASONS  = ['Capital Added', 'Cash Received', 'Bank Withdrawal', 'Other Income', 'Other'];
const CASH_OUT_REASONS = ['Owner Drawings', 'Bank Deposit', 'Petty Cash', 'Other Expense', 'Other'];
const BANK_IN_REASONS  = ['Cash Deposit', 'Bank Transfer In', 'Interest Credited', 'Loan Received', 'Other'];
const BANK_OUT_REASONS = ['Cash Withdrawal', 'Bank Transfer Out', 'Bank Charges', 'Loan Repayment', 'Cheque Issued', 'Other'];

const isCash    = (m) => String(m || '').trim().toLowerCase() === 'cash';
const isDigital = (m) => { const v = String(m || '').trim().toLowerCase(); return ['bank','cheque','neft','rtgs','upi','card'].includes(v); };
const isSettled = (r) => {
  const s = String(r.status || '').trim().toLowerCase();
  if (s === 'unpaid' || s === 'partial' || s === 'pending') return false;
  if (s === 'paid') return true;
  return (Number(r.balanceAmount) || 0) <= 0;
};

const MovementRow = ({ m, onDelete, accentIn, accentOut, t }) => (
  <Box sx={{
    display: 'flex', alignItems: 'center', gap: 1.5,
    px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'rgba(0,0,0,0.05)',
    '&:last-child': { borderBottom: 'none' },
  }}>
    <Box sx={{
      p: 0.75, borderRadius: '50%', display: 'flex', flexShrink: 0,
      bgcolor: m.dir === 'in' ? alpha(accentIn, 0.12) : alpha(accentOut, 0.12),
      color:   m.dir === 'in' ? accentIn : accentOut,
    }}>
      {m.dir === 'in' ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}
    </Box>
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }} noWrap>{m.label}</Typography>
      <Typography variant="caption" color="text.secondary">
        {fmtDate(m.date)}{formatCreatedTime(m) ? ` · ${formatCreatedTime(m)}` : ''}{m.note ? ` · ${m.note}` : ''}
      </Typography>
    </Box>
    {m.transferId
      ? <Chip size="small" icon={<ArrowLeftRight size={11} />} label="Transfer" sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700, bgcolor: alpha('#7c3aed', 0.12), color: '#7c3aed', '& .MuiChip-icon': { color: '#7c3aed' } }} />
      : m.source === 'manual'
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
        <IconButton size="small" onClick={() => onDelete(m.id, m.transferId)}
          sx={{ color: 'text.disabled', '&:hover': { color: '#dc2626' } }}>
          <Trash2 size={15} />
        </IconButton>
      </Tooltip>
    )}
  </Box>
);

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

// Move money between the Cash drawer and the Bank account in one action —
// previously required recording a Cash Out + a Bank In (or Bank Out + Cash
// In) manually as two unrelated entries. Saves both legs as a single linked
// pair (shared `transferId`) so they always stay in sync — deleting either
// side removes both, so the books can't go out of balance with an orphaned
// leg left behind.
const TransferDialog = ({ open, onClose, onSave, cashBalance, bankBalance, isMobile, t }) => {
  const [dir, setDir] = useState('cash_to_bank'); // or 'bank_to_cash'
  const [form, setForm] = useState({ amount: '', note: '', date: new Date().toISOString().slice(0, 10) });
  const reset = () => { setDir('cash_to_bank'); setForm({ amount: '', note: '', date: new Date().toISOString().slice(0, 10) }); };
  const handleClose = () => { reset(); onClose(); };
  const handleSave = () => { onSave({ ...form, dir }); reset(); };

  const fromLabel = dir === 'cash_to_bank' ? 'Cash Drawer' : 'Bank Account';
  const toLabel = dir === 'cash_to_bank' ? 'Bank Account' : 'Cash Drawer';
  const fromBalance = dir === 'cash_to_bank' ? cashBalance : bankBalance;
  const accent = '#7c3aed';

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth fullScreen={isMobile}>
      <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ p: 0.5, borderRadius: 1.5, bgcolor: alpha(accent, 0.12), color: accent, display: 'flex' }}>
            <ArrowLeftRight size={16} />
          </Box>
          Transfer Cash ↔ Bank
        </Box>
        <IconButton size="small" onClick={handleClose}><X size={18} /></IconButton>
      </DialogTitle>
      <DialogContent>
        <Box sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5,
          mt: 1, mb: 2.5, p: 1.5, borderRadius: 2, bgcolor: alpha(accent, 0.05), border: '1px solid', borderColor: alpha(accent, 0.15),
        }}>
          <Box sx={{ textAlign: 'center', flex: 1 }}>
            <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}>From</Typography>
            <Typography sx={{ fontWeight: 800, fontSize: '0.9rem' }}>{fromLabel}</Typography>
          </Box>
          <IconButton size="small"
            onClick={() => setDir(d => d === 'cash_to_bank' ? 'bank_to_cash' : 'cash_to_bank')}
            sx={{ bgcolor: accent, color: '#fff', '&:hover': { bgcolor: accent, opacity: 0.85 } }}>
            <ArrowLeftRight size={15} />
          </IconButton>
          <Box sx={{ textAlign: 'center', flex: 1 }}>
            <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}>To</Typography>
            <Typography sx={{ fontWeight: 800, fontSize: '0.9rem' }}>{toLabel}</Typography>
          </Box>
        </Box>
        <TextField
          fullWidth autoFocus type="number" label={t('common.amount')} value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter' && Number(form.amount) > 0) handleSave(); }}
          helperText={`Available in ${fromLabel}: ${money(fromBalance)}`}
          slotProps={{
            input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> },
            htmlInput: { min: 0, step: 0.01, style: { fontSize: '1.3rem', fontWeight: 700 } },
          }}
          sx={{ mb: 2 }}
        />
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
          sx={{ textTransform: 'none', fontWeight: 700, bgcolor: accent, '&:hover': { bgcolor: accent, opacity: 0.88 } }}>
          Transfer
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const Cash = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { currentBusiness } = useBusiness();
  const { data, getItems, addItem, addItems, deleteItem } = useData();
  const { confirm } = useDialog();
  const { t } = useI18n();
  // TallyKraft billing: data layer blocks the write anyway; this greys the CTAs.
  const { isBusinessActive } = useSubscription();
  const canWrite = isBusinessActive(currentBusiness?.id);
  const bizId = currentBusiness?.id;

  // Deps keyed on data[table] (not getItems, which changes identity on every
  // mutation to ANY table) — see Dashboard.jsx/Reports.jsx for the same fix.
  const sales      = useMemo(() => getItems('sales').filter(s => s.businessId === bizId),      [data.sales, bizId]);
  const purchases  = useMemo(() => getItems('purchases').filter(p => p.businessId === bizId),  [data.purchases, bizId]);
  const payments   = useMemo(() => getItems('payments').filter(p => p.businessId === bizId),   [data.payments, bizId]);
  const expenses   = useMemo(() => getItems('expenses').filter(e => e.businessId === bizId),   [data.expenses, bizId]);
  const cashEntries = useMemo(() => getItems('cashEntries').filter(c => c.businessId === bizId), [data.cashEntries, bizId]);

  const cash = useMemo(() => computeCashInHand({
    openingCash: currentBusiness?.openingCash, sales, purchases, payments, expenses, cashEntries,
  }), [currentBusiness?.openingCash, sales, purchases, payments, expenses, cashEntries]);

  const bank = useMemo(() => computeBankBalance({
    openingBank: currentBusiness?.openingBank, sales, purchases, payments, expenses, cashEntries,
  }), [currentBusiness?.openingBank, sales, purchases, payments, expenses, cashEntries]);

  const cashMovements = useMemo(() => {
    const rows = [];
    sales.filter(s => isCash(s.paymentMode) && isSettled(s))
      .forEach(s => rows.push({ id: 'S'+s.id, date: s.date, createdAt: s.createdAt, dir: 'in', label: `Cash sale ${s.invoiceNumber||''}`.trim(), amount: Number(s.totalAmount)||0, source: 'auto' }));
    payments.filter(p => p.type==='PaymentIn' && isCash(p.paymentMode))
      .forEach(p => rows.push({ id: 'PI'+p.id, date: p.date, createdAt: p.createdAt, dir: 'in', label: `Payment from ${p.partyName||''}`.trim(), amount: Number(p.totalAmount)||0, source: 'auto' }));
    purchases.filter(p => isCash(p.paymentMode) && isSettled(p))
      .forEach(p => rows.push({ id: 'PU'+p.id, date: p.date, createdAt: p.createdAt, dir: 'out', label: `Cash purchase ${p.invoiceNumber||''}`.trim(), amount: Number(p.totalAmount)||0, source: 'auto' }));
    payments.filter(p => p.type==='PaymentOut' && isCash(p.paymentMode))
      .forEach(p => rows.push({ id: 'PO'+p.id, date: p.date, createdAt: p.createdAt, dir: 'out', label: `Payment to ${p.partyName||''}`.trim(), amount: Number(p.totalAmount)||0, source: 'auto' }));
    expenses.filter(e => e.paymentMode==null || isCash(e.paymentMode))
      .forEach(e => rows.push({ id: 'E'+e.id, date: e.date, createdAt: e.createdAt, dir: 'out', label: `${e.category||'Expense'}${e.description?' — '+e.description:''}`, amount: Number(e.amount)||0, source: 'auto' }));
    cashEntries.filter(c => c.type==='in' || c.type==='out')
      .forEach(c => rows.push({ id: c.id, date: c.date, createdAt: c.createdAt, dir: c.type, label: c.reason||(c.type==='in'?'Cash In':'Cash Out'), note: c.note, amount: Number(c.amount)||0, source: 'manual', transferId: c.transferId }));
    return rows.sort(byTxTimeDesc);
  }, [sales, purchases, payments, expenses, cashEntries]);

  const bankMovements = useMemo(() => {
    const rows = [];
    sales.filter(s => isDigital(s.paymentMode) && isSettled(s))
      .forEach(s => rows.push({ id: 'BS'+s.id, date: s.date, createdAt: s.createdAt, dir: 'in', label: `${s.paymentMode||'Bank'} sale ${s.invoiceNumber||''}`.trim(), amount: Number(s.totalAmount)||0, source: 'auto' }));
    payments.filter(p => p.type==='PaymentIn' && isDigital(p.paymentMode))
      .forEach(p => rows.push({ id: 'BPI'+p.id, date: p.date, createdAt: p.createdAt, dir: 'in', label: `${p.paymentMode||'Bank'} payment from ${p.partyName||''}`.trim(), amount: Number(p.totalAmount)||0, source: 'auto' }));
    purchases.filter(p => isDigital(p.paymentMode) && isSettled(p))
      .forEach(p => rows.push({ id: 'BPU'+p.id, date: p.date, createdAt: p.createdAt, dir: 'out', label: `${p.paymentMode||'Bank'} purchase ${p.invoiceNumber||''}`.trim(), amount: Number(p.totalAmount)||0, source: 'auto' }));
    payments.filter(p => p.type==='PaymentOut' && isDigital(p.paymentMode))
      .forEach(p => rows.push({ id: 'BPO'+p.id, date: p.date, createdAt: p.createdAt, dir: 'out', label: `${p.paymentMode||'Bank'} payment to ${p.partyName||''}`.trim(), amount: Number(p.totalAmount)||0, source: 'auto' }));
    expenses.filter(e => e.paymentMode!=null && isDigital(e.paymentMode))
      .forEach(e => rows.push({ id: 'BE'+e.id, date: e.date, createdAt: e.createdAt, dir: 'out', label: `${e.category||'Expense'}${e.description?' — '+e.description:''}`, amount: Number(e.amount)||0, source: 'auto' }));
    cashEntries.filter(c => c.type==='bank_in' || c.type==='bank_out')
      .forEach(c => rows.push({ id: c.id, date: c.date, createdAt: c.createdAt, dir: c.type==='bank_in'?'in':'out', label: c.reason||(c.type==='bank_in'?'Bank Credit':'Bank Debit'), note: c.note, amount: Number(c.amount)||0, source: 'manual', transferId: c.transferId }));
    return rows.sort(byTxTimeDesc);
  }, [sales, purchases, payments, expenses, cashEntries]);

  const [activeTab, setActiveTab] = useState('cash');
  const [cashDlg, setCashDlg] = useState(null);
  const [bankDlg, setBankDlg] = useState(null);
  const [transferDlg, setTransferDlg] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      const intent = e.detail?.intent;
      if (intent === 'cash_in')  { setActiveTab('cash'); setCashDlg('in'); acknowledgeQuickNew(e.detail); }
      if (intent === 'cash_out') { setActiveTab('cash'); setCashDlg('out'); acknowledgeQuickNew(e.detail); }
      if (intent === 'bank_in')  { setActiveTab('bank'); setBankDlg('bank_in'); acknowledgeQuickNew(e.detail); }
      if (intent === 'bank_out') { setActiveTab('bank'); setBankDlg('bank_out'); acknowledgeQuickNew(e.detail); }
    };
    window.addEventListener('dashboard-quick-new', handler);
    return () => window.removeEventListener('dashboard-quick-new', handler);
  }, []);

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

  // Cash ↔ Bank transfer — one action instead of a manual Cash Out + Bank In
  // (or Bank Out + Cash In) pair. Both legs are saved together via addItems
  // (one batch write) and share a `transferId` so they're always recognized
  // and removed as a linked pair, never leaving one side orphaned.
  const saveTransfer = ({ amount, dir, date, note }) => {
    const amt = Number(amount);
    if (!amt || amt <= 0) return;
    const transferId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `xfer_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const label = dir === 'cash_to_bank' ? 'Transfer to Bank' : 'Transfer from Bank';
    const outType = dir === 'cash_to_bank' ? 'out' : 'bank_out';
    const inType  = dir === 'cash_to_bank' ? 'bank_in' : 'in';
    addItems('cashEntries', [
      { businessId: bizId, type: outType, amount: amt, reason: label, note: note || '', date, transferId },
      { businessId: bizId, type: inType,  amount: amt, reason: label, note: note || '', date, transferId },
    ]);
    setTransferDlg(false);
  };

  const removeEntry = async (id, transferId) => {
    const ok = await confirm({
      title: transferId ? 'Delete transfer' : 'Delete entry',
      message: transferId
        ? 'This removes both sides of the transfer (the cash leg and the bank leg). This cannot be undone.'
        : 'Remove this entry? This cannot be undone.',
      confirmLabel: 'Delete', variant: 'danger',
    });
    if (!ok) return;
    if (transferId) {
      cashEntries.filter(c => c.transferId === transferId).forEach(c => deleteItem('cashEntries', c.id));
    } else {
      deleteItem('cashEntries', id);
    }
  };

  const cashColor = '#0891b2';
  const bankColor = '#5c1f22';
  const green     = '#16a34a';
  const red       = '#dc2626';

  return (
    <Box sx={{ mx: 0 }}>

      {/* Dual-tab header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5, flexWrap: 'wrap', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{
            p: 1, borderRadius: 2, display: 'flex',
            background: activeTab === 'cash'
              ? `linear-gradient(135deg, ${cashColor}, #22d3ee)`
              : `linear-gradient(135deg, ${bankColor}, #6b5550)`,
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

        <Box sx={{
          display: 'flex', gap: 0.5, p: 0.5,
          bgcolor: 'action.hover', borderRadius: 2.5,
          border: '1px solid', borderColor: 'divider',
        }}>
          {[
            { id: 'cash', label: 'Cash Book', icon: Wallet,   color: cashColor },
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

        <Button
          variant="outlined" startIcon={<ArrowLeftRight size={15} />}
          onClick={() => setTransferDlg(true)}
          sx={{
            textTransform: 'none', fontWeight: 700, borderRadius: 2.5,
            color: '#7c3aed', borderColor: alpha('#7c3aed', 0.35),
            '&:hover': { borderColor: '#7c3aed', bgcolor: alpha('#7c3aed', 0.06) },
          }}>
          Transfer Cash ↔ Bank
        </Button>
      </Box>

      {/* CASH BOOK */}
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

      {/* BANK BOOK */}
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
                    onClick={() => setBankDlg('bank_in')}
                    sx={{ fontWeight: 700, textTransform: 'none', bgcolor: green, '&:hover': { bgcolor: '#15803d' } }}>
                    Credit
                  </Button>
                  <Button
                    variant="contained" color="error" startIcon={<ArrowUpRight size={16} />}
                    onClick={() => setBankDlg('bank_out')}
                    sx={{ fontWeight: 700, textTransform: 'none' }}>
                    Debit / Withdraw
                  </Button>
                </Stack>
              </Box>
            </CardContent>
          </Card>

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            {[
              { label: 'Cash Withdrawal', dir: 'bank_out', sub: 'ATM / counter withdrawal' },
              { label: 'Cash Deposit',    dir: 'bank_in',  sub: 'Deposit cash into bank' },
              { label: 'Bank Charges',    dir: 'bank_out', sub: 'Service / maintenance fee' },
              { label: 'Interest',        dir: 'bank_in',  sub: 'Interest credited' },
            ].map(({ label, dir, sub }) => {
              const isIn = dir === 'bank_in';
              return (
                <Box key={label} onClick={() => setBankDlg(dir)} sx={{
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

      {/* Cash add dialog */}
      <AddDialog
        open={!!cashDlg} dir={cashDlg}
        reasons={cashDlg === 'in' ? CASH_IN_REASONS : CASH_OUT_REASONS}
        onClose={() => setCashDlg(null)} onSave={saveCashEntry}
        accentIn={green} accentOut={red} isMobile={isMobile} t={t}
      />

      {/* Bank add dialog */}
      <AddDialog
        open={!!bankDlg} dir={bankDlg}
        reasons={bankDlg === 'bank_in' ? BANK_IN_REASONS : BANK_OUT_REASONS}
        onClose={() => setBankDlg(null)} onSave={saveBankEntry}
        accentIn={green} accentOut={red} isMobile={isMobile} t={t}
      />

      {/* Cash ↔ Bank transfer dialog */}
      <TransferDialog
        open={transferDlg}
        onClose={() => setTransferDlg(false)} onSave={saveTransfer}
        cashBalance={cash.balance} bankBalance={bank.balance}
        isMobile={isMobile} t={t}
      />

    </Box>
  );
};

export default Cash;
