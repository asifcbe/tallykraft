import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Box, Typography, Grid, TextField, MenuItem, Button, Dialog,
  Card, CardContent, Stack, Avatar, alpha, useTheme,
  InputAdornment, IconButton, InputBase, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TablePagination, Chip, Tooltip,
  Autocomplete, ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import {
  CheckCircle2, ArrowLeft, Landmark, Banknote,
  CreditCard, User, Search,
  FileClock, ArrowDownRight, ArrowUpRight, Printer, Share2, Edit2, Trash2, Eye, X
} from 'lucide-react';
import { useBusiness } from './BusinessContext';
import { useFinancialYear } from './FinancialYearContext';
import PartySelect from './PartySelect';
import { useConfig } from './ConfigContext';
import { useData } from './DataContext';
import { useI18n } from './i18n/I18nContext';
import { FitPreview } from './TxListView';
import { useDialog } from './DialogContext';
import { useNavigate } from 'react-router-dom';
import { useReactToPrint } from 'react-to-print';
import PaymentTemplate from './PaymentTemplate';

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
};

const MODE_COLORS = {
  Cash: { bg: alpha('#16a34a', 0.1), color: '#16a34a' },
  Bank: { bg: alpha('#1d4ed8', 0.1), color: '#1d4ed8' },
  UPI:  { bg: alpha('#7c3aed', 0.1), color: '#7c3aed' },
  Cheque: { bg: alpha('#b45309', 0.1), color: '#b45309' },
};

const PaymentEntry = ({ mode = 'payment-in' }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { currentBusiness } = useBusiness();
  const { confirm, showAlert } = useDialog();
  const { t } = useI18n();
  const { activeFY } = useFinancialYear();
  const { addItem, updateItem, deleteItem, getItems } = useData();

  const [tabValue, setTabValue] = useState(mode === 'payment-out' ? 1 : 0);
  const [formData, setFormData] = useState({
    partyId: '', amount: '', date: new Date().toISOString().split('T')[0],
    paymentMode: 'Cash', referenceNo: '', notes: ''
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [printingData, setPrintingData] = useState(null);
  const [printTrigger, setPrintTrigger] = useState(0);
  const { config } = useConfig();
  const [paperSize, setPaperSize] = useState(() => {
    const d = config.defaultPaperSize;
    return ['A4', 'A5', 'Letter', 'Legal'].includes(d) ? d : 'A4';
  });
  const _psInit = useRef(!!config.defaultPaperSize);
  useEffect(() => {
    if (!_psInit.current && config.defaultPaperSize) {
      const d = config.defaultPaperSize;
      if (['A4', 'A5', 'Letter', 'Legal'].includes(d)) setPaperSize(d);
      _psInit.current = true;
    }
  }, [config.defaultPaperSize]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRecord, setPreviewRecord] = useState(null);
  const printRef = useRef();
  const [editingId, setEditingId] = useState(null);
  const [filters, setFilters] = useState({ paymentMode: 'all', minAmount: '', maxAmount: '', sortBy: 'date', sortOrder: 'desc' });
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const handlePrint = useReactToPrint({ contentRef: printRef });

  useEffect(() => {
    if (!printTrigger) return;
    handlePrint();
  }, [printTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  const isPaymentIn = tabValue === 0;
  const accentColor = isPaymentIn ? theme.palette.success.main : theme.palette.warning.main;
  const accentGradient = isPaymentIn
    ? 'linear-gradient(135deg, #16a34a 0%, #4ade80 100%)'
    : 'linear-gradient(135deg, #d97706 0%, #fbbf24 100%)';

  const parties = getItems('parties').filter(p => {
    if (p.businessId !== currentBusiness?.id) return false;
    return isPaymentIn ? p.type === 'Customer' : p.type === 'Vendor';
  });

  const allPayments = getItems('payments').filter(t => t.businessId === currentBusiness?.id).filter(r => !activeFY || !r.date || (r.date >= activeFY.start && r.date <= activeFY.end));
  const totalIn  = allPayments.filter(t => t.type === 'PaymentIn').reduce((s, t) => s + (t.totalAmount || 0), 0);
  const totalOut = allPayments.filter(t => t.type === 'PaymentOut').reduce((s, t) => s + (t.totalAmount || 0), 0);

  const transactions = allPayments.filter(t => t.type === (isPaymentIn ? 'PaymentIn' : 'PaymentOut'));

  const selectedParty = useMemo(() => parties.find(p => p.id === formData.partyId), [formData.partyId, parties]);

  const filteredHistory = useMemo(() => {
    return transactions.filter(t => {
      const matchesSearch = t.partyName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesDate = t.date >= dateRange.start && t.date <= dateRange.end;
      const matchesMode = filters.paymentMode === 'all' || t.paymentMode === filters.paymentMode;
      const matchesMin = !filters.minAmount || t.totalAmount >= parseFloat(filters.minAmount);
      const matchesMax = !filters.maxAmount || t.totalAmount <= parseFloat(filters.maxAmount);
      return matchesSearch && matchesDate && matchesMode && matchesMin && matchesMax;
    }).sort((a, b) => {
      let aValue, bValue;
      switch (filters.sortBy) {
        case 'amount': aValue = a.totalAmount; bValue = b.totalAmount; break;
        case 'party': aValue = a.partyName.toLowerCase(); bValue = b.partyName.toLowerCase(); break;
        default: aValue = new Date(a.date); bValue = new Date(b.date);
      }
      return filters.sortOrder === 'desc' ? (aValue < bValue ? 1 : -1) : (aValue > bValue ? 1 : -1);
    });
  }, [transactions, searchQuery, dateRange, filters]);

  const filteredTotal = filteredHistory.reduce((s, t) => s + (t.totalAmount || 0), 0);

  useEffect(() => { setPage(0); }, [searchQuery, dateRange, filters]);

  const handleSave = async () => {
    if (!currentBusiness?.id) { await showAlert({ title: 'Business not selected', message: 'Please select a business before saving.', variant: 'warning' }); return; }
    if (!formData.partyId || !formData.amount) { await showAlert({ title: 'Missing fields', message: 'Please select a party and enter an amount.', variant: 'warning' }); return; }
    if (!selectedParty) { await showAlert({ title: 'Invalid party', message: 'Please select a valid party.', variant: 'warning' }); return; }
    const amountNum = parseFloat(formData.amount);
    if (isNaN(amountNum) || amountNum <= 0) { await showAlert({ title: 'Invalid amount', message: 'Please enter a valid amount greater than zero.', variant: 'warning' }); return; }

    try {
      const paymentData = {
        businessId: currentBusiness.id,
        partyId: formData.partyId,
        partyName: selectedParty.name || 'Unknown',
        type: isPaymentIn ? 'PaymentIn' : 'PaymentOut',
        totalAmount: amountNum,
        date: formData.date || new Date().toISOString().split('T')[0],
        paymentMode: formData.paymentMode || 'Cash',
        referenceNo: formData.referenceNo || `REF-${Date.now().toString().slice(-6)}`,
        notes: formData.notes || ''
      };

      if (editingId) {
        const oldPayment = getItems('payments').find(p => p.id === editingId);
        if (!oldPayment) { await showAlert({ title: 'Not found', message: 'Payment not found.', variant: 'warning' }); return; }
        const oldParty = parties.find(p => p.id === oldPayment.partyId);
        const oldAmount = oldPayment.totalAmount || 0;
        const rollbackOld = isPaymentIn ? oldAmount : -oldAmount;
        const applyNew = isPaymentIn ? -amountNum : amountNum;
        if (oldParty) await updateItem('parties', oldPayment.partyId, { balance: (oldParty.balance || 0) + rollbackOld });
        if (selectedParty.id !== oldPayment.partyId) {
          await updateItem('parties', formData.partyId, { balance: (selectedParty.balance || 0) + applyNew });
        } else {
          await updateItem('parties', formData.partyId, { balance: (selectedParty.balance || 0) + rollbackOld + applyNew });
        }
        await updateItem('payments', editingId, paymentData);
        setEditingId(null);
        setFormData({ ...formData, amount: '', referenceNo: '', notes: '' });
        return;
      }

      const saved = await addItem('payments', paymentData);
      if (!saved) {
        const check = getItems('payments').find(p =>
          p.partyId === paymentData.partyId && p.totalAmount === paymentData.totalAmount &&
          p.date === paymentData.date && p.businessId === paymentData.businessId
        );
        if (!check) { await showAlert({ title: 'Save failed', message: 'Failed to save payment. Please try again.', variant: 'danger' }); return; }
      }
      await updateItem('parties', formData.partyId, { balance: (selectedParty.balance || 0) + (isPaymentIn ? -amountNum : amountNum) });
      setFormData({ ...formData, amount: '', referenceNo: '', notes: '' });
    } catch (error) {
      console.error('Error saving payment:', error);
      await showAlert({ title: 'Save error', message: 'An error occurred while saving. Please try again.', variant: 'danger' });
    }
  };

  const startEdit = (row) => {
    setEditingId(row.id);
    setFormData({
      partyId: row.partyId,
      amount: String(row.totalAmount ?? ''),
      date: row.date || new Date().toISOString().split('T')[0],
      paymentMode: row.paymentMode || 'Cash',
      referenceNo: row.referenceNo || '',
      notes: row.notes || ''
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormData({ partyId: formData.partyId, amount: '', date: new Date().toISOString().split('T')[0], paymentMode: 'Cash', referenceNo: '', notes: '' });
  };

  const handleDelete = async (row) => {
    const ok = await confirm({ title: 'Delete Payment', message: `Delete payment of ₹${row.totalAmount?.toLocaleString()} for ${row.partyName}? The balance will be reversed.`, confirmLabel: 'Delete', variant: 'danger' });
    if (!ok) return;
    try {
      const party = parties.find(p => p.id === row.partyId);
      if (party) {
        const rollback = isPaymentIn ? (row.totalAmount || 0) : -(row.totalAmount || 0);
        await updateItem('parties', row.partyId, { balance: (party.balance || 0) + rollback });
      }
      deleteItem('payments', row.id);
      if (editingId === row.id) {
        setEditingId(null);
        setFormData({ partyId: '', amount: '', date: new Date().toISOString().split('T')[0], paymentMode: 'Cash', referenceNo: '', notes: '' });
      }
    } catch (error) {
      console.error('Error deleting payment:', error);
      await showAlert({ title: 'Delete failed', message: 'Failed to delete payment.', variant: 'danger' });
    }
  };

  const handleShare = (row) => {
    const text = `*Payment Receipt from ${currentBusiness?.name || 'TallyKraft'}*\n\n` +
      `Amount: ₹${row.totalAmount.toLocaleString()}\n` +
      `Date: ${row.date}\n` +
      `Party: ${row.partyName}\n` +
      `Mode: ${row.paymentMode}\n` +
      `Ref: ${row.referenceNo}\n\n` +
      `Shared via TallyKraft`;
    if (navigator.share) {
      navigator.share({ title: `Payment Receipt ${row.referenceNo}`, text }).catch(e => console.error(e));
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    }
  };

  const paginatedHistory = filteredHistory.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  return (
    <Box sx={{ pb: 4 }}>
      {/* Hidden print target */}
      <div style={{ display: 'none' }}>
        <PaymentTemplate ref={printRef} data={printingData} business={currentBusiness} paperSize={paperSize} />
      </div>

      {/* Page header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3, flexWrap: 'wrap' }}>
        <Tooltip title="Go back">
          <IconButton onClick={() => navigate(-1)} size="small" sx={{ border: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
            <ArrowLeft size={18} />
          </IconButton>
        </Tooltip>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: '-0.02em' }}>{t('pay.title')}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            Record and manage payment receipts and disbursements
          </Typography>
        </Box>
        {/* Summary chips */}
        <Stack direction="row" spacing={1.5}>
          <Box sx={{ px: 2, py: 1, borderRadius: 2, bgcolor: alpha(theme.palette.success.main, 0.07), border: '1px solid', borderColor: alpha(theme.palette.success.main, 0.18) }}>
            <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600, display: 'block', lineHeight: 1.3, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Received</Typography>
            <Typography variant="subtitle2" sx={{ color: 'success.main', fontWeight: 800, letterSpacing: '-0.02em' }}>
              ₹{totalIn.toLocaleString('en-IN')}
            </Typography>
          </Box>
          <Box sx={{ px: 2, py: 1, borderRadius: 2, bgcolor: alpha(theme.palette.warning.main, 0.07), border: '1px solid', borderColor: alpha(theme.palette.warning.main, 0.18) }}>
            <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 600, display: 'block', lineHeight: 1.3, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Paid Out</Typography>
            <Typography variant="subtitle2" sx={{ color: 'warning.main', fontWeight: 800, letterSpacing: '-0.02em' }}>
              ₹{totalOut.toLocaleString('en-IN')}
            </Typography>
          </Box>
        </Stack>
      </Box>

      {/* Custom pill tabs */}
      <Box sx={{ display: 'flex', gap: 0, mb: 3, bgcolor: alpha(theme.palette.text.primary, 0.04), borderRadius: 2.5, p: 0.5, width: 'fit-content', border: '1px solid', borderColor: 'divider' }}>
        {[
          { label: t('pay.paymentIn'), sub: 'Money Received', icon: <ArrowDownRight size={15} />, color: theme.palette.success.main },
          { label: t('pay.paymentOut'), sub: 'Money Paid', icon: <ArrowUpRight size={15} />, color: theme.palette.warning.main },
        ].map((tab, i) => (
          <Box
            key={i}
            onClick={() => { setTabValue(i); setFormData(f => ({ ...f, partyId: '' })); }}
            sx={{
              px: 2.5, py: 1.25, borderRadius: 2, cursor: 'pointer',
              transition: 'all 0.15s ease',
              bgcolor: tabValue === i ? 'background.paper' : 'transparent',
              boxShadow: tabValue === i ? '0 1px 6px rgba(0,0,0,0.1)' : 'none',
              display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 160,
            }}
          >
            <Box sx={{
              p: 0.625, borderRadius: 1, display: 'flex',
              bgcolor: tabValue === i ? alpha(tab.color, 0.12) : 'transparent',
              color: tabValue === i ? tab.color : 'text.disabled',
              transition: 'all 0.15s',
            }}>
              {tab.icon}
            </Box>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.25, color: tabValue === i ? 'text.primary' : 'text.secondary' }}>
                {tab.label}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.disabled', lineHeight: 1 }}>{tab.sub}</Typography>
            </Box>
          </Box>
        ))}
      </Box>

      {/* Entry form card */}
      <Card elevation={0} sx={{ mb: 3, borderRadius: 2.5, border: '1px solid', borderColor: alpha(accentColor, 0.25), overflow: 'visible' }}>
        <Box sx={{ height: 4, background: accentGradient, borderRadius: '10px 10px 0 0' }} />

        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          {/* Header row */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <Box sx={{ p: 0.875, borderRadius: 1.5, bgcolor: alpha(accentColor, 0.1), color: accentColor, display: 'flex' }}>
                {isPaymentIn ? <ArrowDownRight size={17} /> : <ArrowUpRight size={17} />}
              </Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                {editingId ? 'Edit Payment' : isPaymentIn ? 'Record Payment Received' : 'Record Payment Made'}
              </Typography>
            </Box>
            {editingId && (
              <Chip label="Editing" size="small" color={isPaymentIn ? 'success' : 'warning'} variant="outlined" sx={{ fontWeight: 700 }} />
            )}
          </Box>

          <Grid container spacing={2}>
            {/* ── Row 1: Party + Amount (hero) ── */}
            <Grid size={{ xs: 12, sm: 6 }}>
              <PartySelect
                options={parties}
                value={parties.find(p => p.id === formData.partyId) || null}
                onChange={(v) => setFormData({ ...formData, partyId: v?.id || '' })}
                label={isPaymentIn ? 'Customer' : 'Vendor'}
                placeholder={`Search ${isPaymentIn ? 'customer' : 'vendor'}…`}
              />
            </Grid>

            {/* BIG amount field */}
            <Grid size={{ xs: 12, sm: 6 }}>
              <Box sx={{
                border: '2px solid',
                borderColor: formData.amount ? accentColor : alpha(accentColor, 0.3),
                borderRadius: 2,
                px: 2, py: 1.25,
                bgcolor: formData.amount ? alpha(accentColor, 0.04) : 'transparent',
                transition: 'all 0.2s',
                '&:focus-within': { borderColor: accentColor, bgcolor: alpha(accentColor, 0.05) },
              }}>
                <Typography variant="caption" sx={{ color: accentColor, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: '0.68rem' }}>
                  Amount
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography sx={{ fontSize: '1.6rem', fontWeight: 700, color: accentColor, lineHeight: 1.2, mt: 0.25 }}>₹</Typography>
                  <InputBase
                    fullWidth
                    type="number"
                    placeholder="0"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    onFocus={(e) => e.target.select()}
                    inputProps={{ min: 0, step: 0.01, style: { padding: 0 } }}
                    sx={{
                      '& input': {
                        fontSize: '1.75rem',
                        fontWeight: 800,
                        color: accentColor,
                        lineHeight: 1.2,
                        letterSpacing: '-0.02em',
                        '&::placeholder': { color: alpha(accentColor, 0.35), fontWeight: 700 },
                      },
                    }}
                  />
                </Box>
              </Box>
            </Grid>

            {/* ── Row 2: Payment method tiles ── */}
            <Grid size={{ xs: 12 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 1, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.68rem' }}>
                Payment Via
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {[
                  { value: 'Cash', icon: <Banknote size={16} />, color: '#16a34a' },
                  { value: 'Bank', icon: <Landmark size={16} />, color: '#1d4ed8' },
                  { value: 'UPI',  icon: <CreditCard size={16} />, color: '#7c3aed' },
                  { value: 'Cheque', icon: <FileClock size={16} />, color: '#b45309' },
                ].map(opt => {
                  const selected = formData.paymentMode === opt.value;
                  return (
                    <Box
                      key={opt.value}
                      onClick={() => setFormData({ ...formData, paymentMode: opt.value })}
                      sx={{
                        display: 'flex', alignItems: 'center', gap: 0.875,
                        px: 1.75, py: 0.875,
                        borderRadius: 2,
                        border: '1.5px solid',
                        borderColor: selected ? opt.color : 'divider',
                        bgcolor: selected ? alpha(opt.color, 0.08) : 'transparent',
                        color: selected ? opt.color : 'text.secondary',
                        cursor: 'pointer',
                        fontWeight: 700,
                        fontSize: '0.8rem',
                        transition: 'all 0.15s',
                        userSelect: 'none',
                        '&:hover': { borderColor: opt.color, color: opt.color, bgcolor: alpha(opt.color, 0.05) },
                      }}
                    >
                      {opt.icon}
                      {opt.value}
                    </Box>
                  );
                })}
              </Box>
            </Grid>

            {/* ── Row 3: Date + Reference + Notes ── */}
            <Grid size={{ xs: 6, sm: 3 }}>
              <TextField
                fullWidth size="small" label="Date" type="date"
                value={formData.date || ''}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <TextField fullWidth size="small" label="Reference No." placeholder="TXN12345"
                value={formData.referenceNo}
                onChange={(e) => setFormData({ ...formData, referenceNo: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label="Notes (optional)"
                placeholder="Add a note about this payment"
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </Grid>

            {/* ── Row 4: Action button ── */}
            <Grid size={{ xs: 12 }}>
              {editingId ? (
                <Stack direction="row" spacing={1.5}>
                  <Button
                    variant="contained" size="large" onClick={handleSave}
                    disabled={!formData.partyId || !formData.amount}
                    startIcon={<CheckCircle2 size={18} />}
                    sx={{ fontWeight: 700, flex: 1, borderRadius: 2, py: 1.25, bgcolor: accentColor, '&:hover': { bgcolor: accentColor, filter: 'brightness(0.9)' } }}
                  >
                    Update Payment
                  </Button>
                  <Button variant="outlined" size="large" onClick={cancelEdit}
                    sx={{ fontWeight: 600, borderRadius: 2, px: 2.5 }}>
                    Cancel
                  </Button>
                </Stack>
              ) : (
                <Button
                  fullWidth variant="contained" size="large" onClick={handleSave}
                  disabled={!formData.partyId || !formData.amount}
                  startIcon={<CheckCircle2 size={18} />}
                  sx={{
                    fontWeight: 700, borderRadius: 2, py: 1.375, fontSize: '0.95rem',
                    bgcolor: accentColor, '&:hover': { bgcolor: accentColor, filter: 'brightness(0.9)' },
                    '&.Mui-disabled': { bgcolor: alpha(accentColor, 0.25), color: alpha(accentColor, 0.5) },
                  }}
                >
                  {isPaymentIn ? 'Record Payment Received' : 'Record Payment Made'}
                </Button>
              )}
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* History + Ledger */}
      <Grid container spacing={2.5}>
        {/* Payment history table */}
        <Grid size={{ xs: 12, lg: 8 }}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5, overflow: 'hidden' }}>
            {/* History header */}
            <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {isPaymentIn ? t('pay.paymentIn') : t('pay.paymentOut')} History
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {filteredHistory.length} record{filteredHistory.length !== 1 ? 's' : ''} · Total&nbsp;
                  <Box component="span" sx={{ fontWeight: 700, color: accentColor }}>₹{filteredTotal.toLocaleString('en-IN')}</Box>
                </Typography>
              </Box>
            </Box>

            {/* Toolbar */}
            <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
              <Paper variant="outlined" sx={{ px: 1.5, py: 0.5, display: 'flex', alignItems: 'center', flex: 1, minWidth: 140, borderRadius: 2 }}>
                <Search size={14} color={theme.palette.text.disabled} />
                <InputBase sx={{ ml: 1, flex: 1, fontSize: '0.8125rem' }} placeholder="Search vouchers…"
                  value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </Paper>
              <TextField type="date" size="small" value={dateRange.start}
                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                sx={{ width: 142 }} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField type="date" size="small" value={dateRange.end}
                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                sx={{ width: 142 }} slotProps={{ inputLabel: { shrink: true } }} />
              <Button onClick={() => setShowFilters(!showFilters)} variant="outlined" size="small" sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                {showFilters ? 'Hide' : 'Filters'}
              </Button>
            </Box>

            {/* Extra filters */}
            {showFilters && (
              <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.default' }}>
                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <TextField select fullWidth label="Mode" size="small" value={filters.paymentMode}
                      onChange={(e) => setFilters({ ...filters, paymentMode: e.target.value })}>
                      <MenuItem value="all">All</MenuItem>
                      <MenuItem value="Cash">Cash</MenuItem>
                      <MenuItem value="Bank">Bank</MenuItem>
                      <MenuItem value="Cheque">Cheque</MenuItem>
                      <MenuItem value="UPI">UPI</MenuItem>
                    </TextField>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <TextField fullWidth label="Min ₹" type="number" size="small" value={filters.minAmount}
                      onChange={(e) => setFilters({ ...filters, minAmount: e.target.value })}
                      slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> } }} />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <TextField fullWidth label="Max ₹" type="number" size="small" value={filters.maxAmount}
                      onChange={(e) => setFilters({ ...filters, maxAmount: e.target.value })}
                      slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> } }} />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <TextField select fullWidth label="Sort By" size="small" value={filters.sortBy}
                      onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })}>
                      <MenuItem value="date">Date</MenuItem>
                      <MenuItem value="amount">Amount</MenuItem>
                      <MenuItem value="party">Party</MenuItem>
                    </TextField>
                  </Grid>
                </Grid>
              </Box>
            )}

            {/* Table */}
            <TableContainer sx={{ overflowX: 'auto' }}>
              <Table stickyHeader size="small" sx={{ minWidth: 560 }}>
                <TableHead>
                  <TableRow sx={{ '& th': { bgcolor: alpha(theme.palette.text.primary, 0.03), fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary', py: 1.5 } }}>
                    <TableCell>Date</TableCell>
                    <TableCell>Party</TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Reference</TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Mode</TableCell>
                    <TableCell align="right">Amount</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedHistory.map((row) => (
                    <TableRow key={row.id} hover sx={{ '&:hover': { bgcolor: alpha(accentColor, 0.025) } }}>
                      <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary', fontSize: '0.8rem' }}>{formatDate(row.date)}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{row.partyName}</TableCell>
                      <TableCell sx={{ color: 'text.secondary', fontSize: '0.8rem', display: { xs: 'none', md: 'table-cell' } }}>
                        {row.referenceNo || '—'}
                      </TableCell>
                      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                        <Chip
                          label={row.paymentMode}
                          size="small"
                          sx={{
                            fontWeight: 700, fontSize: '0.7rem', border: 'none',
                            bgcolor: MODE_COLORS[row.paymentMode]?.bg || alpha('#666', 0.1),
                            color: MODE_COLORS[row.paymentMode]?.color || 'text.secondary',
                          }}
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800, color: accentColor, whiteSpace: 'nowrap', fontSize: '0.9rem' }}>
                        ₹{row.totalAmount?.toLocaleString('en-IN')}
                      </TableCell>
                      <TableCell align="right">
                        <Box sx={{ display: 'flex', gap: 0.25, justifyContent: 'flex-end' }}>
                          <Tooltip title="Edit">
                            <IconButton size="small" onClick={() => startEdit(row)}><Edit2 size={15} /></IconButton>
                          </Tooltip>
                          <Tooltip title="Preview receipt">
                            <IconButton size="small" onClick={() => { setPreviewRecord(row); setPreviewOpen(true); }}><Eye size={15} /></IconButton>
                          </Tooltip>
                          <Tooltip title="Share">
                            <IconButton size="small" sx={{ color: '#25D366' }} onClick={() => handleShare(row)}><Share2 size={15} /></IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton size="small" color="error" onClick={() => handleDelete(row)}><Trash2 size={15} /></IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredHistory.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} sx={{ py: 7, textAlign: 'center' }}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, opacity: 0.45 }}>
                          <FileClock size={34} strokeWidth={1.5} />
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>No payment records found</Typography>
                          <Typography variant="caption">Try adjusting the date range or search term</Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination component="div" count={filteredHistory.length} page={page}
              onPageChange={(_, newPage) => setPage(newPage)} rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
              rowsPerPageOptions={[5, 10, 25, 50]}
              sx={{ borderTop: '1px solid', borderColor: 'divider' }} />
          </Card>
        </Grid>

        {/* Party ledger balance */}
        <Grid size={{ xs: 12, lg: 4 }}>
          <Card elevation={0} sx={{
            border: '1px solid',
            borderColor: selectedParty ? alpha(accentColor, 0.3) : 'divider',
            borderRadius: 2.5, overflow: 'hidden', transition: 'border-color 0.2s ease',
          }}>
            <Box sx={{ px: 2.5, py: 1.75, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.default' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {isPaymentIn ? 'Customer' : 'Vendor'} Balance
              </Typography>
            </Box>
            <CardContent sx={{ p: 3, textAlign: 'center' }}>
              {selectedParty ? (
                <>
                  <Avatar sx={{
                    background: accentGradient,
                    color: 'white', width: 56, height: 56, mx: 'auto', mb: 1.5,
                    fontSize: '1.375rem', fontWeight: 800,
                  }}>
                    {selectedParty.name?.[0]?.toUpperCase() || 'P'}
                  </Avatar>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{selectedParty.name}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                    Current ledger balance
                  </Typography>
                  <Typography variant="h3" sx={{
                    fontWeight: 800, letterSpacing: '-0.03em',
                    color: (selectedParty.balance || 0) >= 0 ? 'success.main' : 'error.main', mb: 1,
                  }}>
                    ₹{Math.abs(selectedParty.balance || 0).toLocaleString('en-IN')}
                  </Typography>
                  <Box sx={{
                    display: 'inline-flex', alignItems: 'center', gap: 0.5,
                    px: 1.5, py: 0.625, borderRadius: 100,
                    bgcolor: (selectedParty.balance || 0) >= 0 ? alpha(theme.palette.success.main, 0.1) : alpha(theme.palette.error.main, 0.1),
                    color: (selectedParty.balance || 0) >= 0 ? 'success.main' : 'error.main',
                  }}>
                    {(selectedParty.balance || 0) >= 0 ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>
                      {(selectedParty.balance || 0) >= 0 ? 'Amount to receive' : 'Amount to pay'}
                    </Typography>
                  </Box>

                  {formData.amount && Number(formData.amount) > 0 && (
                    <Box sx={{ mt: 2.5, pt: 2, borderTop: '1px dashed', borderColor: 'divider' }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                        Balance after this payment
                      </Typography>
                      <Typography variant="h5" sx={{ fontWeight: 700 }}>
                        ₹{Math.abs(
                          (selectedParty.balance || 0) + (isPaymentIn ? -Number(formData.amount) : Number(formData.amount))
                        ).toLocaleString('en-IN')}
                      </Typography>
                    </Box>
                  )}
                </>
              ) : (
                <Box sx={{ py: 4 }}>
                  <Avatar sx={{ bgcolor: 'action.hover', width: 60, height: 60, mx: 'auto', mb: 2 }}>
                    <User size={28} color={theme.palette.text.disabled} />
                  </Avatar>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                    Select a {isPaymentIn ? 'customer' : 'vendor'} to view balance
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Preview dialog */}
      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} maxWidth="md" fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.22)' } }}>
        <Box sx={{ background: isPaymentIn ? 'linear-gradient(135deg, #15803d 0%, #22c55e 100%)' : 'linear-gradient(135deg, #b45309 0%, #f59e0b 100%)', px: 3, py: 2.5, display: 'flex', alignItems: 'flex-start', gap: 2, flexShrink: 0 }}>
          <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', mt: 0.5, flexShrink: 0 }}>
            <Eye size={18} color="white" />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.72)', fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.1em', lineHeight: 1 }}>
              {isPaymentIn ? 'Payment In Preview' : 'Payment Out Preview'}
            </Typography>
            <Typography variant="h6" sx={{ color: 'white', fontWeight: 800, mt: 0.5, fontSize: '1.05rem', fontFamily: 'monospace' }}>
              {previewRecord?.referenceNo || '—'}
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, mt: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
              {previewRecord?.partyName && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>{previewRecord.partyName}</Typography>}
              {previewRecord?.date && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>{formatDate(previewRecord.date)}</Typography>}
              {previewRecord?.paymentMode && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>{previewRecord.paymentMode}</Typography>}
              {previewRecord?.totalAmount != null && (
                <Box sx={{ px: 1.25, py: 0.25, bgcolor: 'rgba(255,255,255,0.18)', borderRadius: '100px', border: '1px solid rgba(255,255,255,0.25)' }}>
                  <Typography variant="caption" sx={{ color: 'white', fontWeight: 800, fontSize: '0.8rem' }}>₹{previewRecord.totalAmount.toLocaleString('en-IN')}</Typography>
                </Box>
              )}
            </Box>
          </Box>
          <IconButton onClick={() => setPreviewOpen(false)} size="small" sx={{ color: 'rgba(255,255,255,0.75)', mt: -0.5, '&:hover': { color: 'white', bgcolor: 'rgba(255,255,255,0.12)' } }}>
            <X size={18} />
          </IconButton>
        </Box>
        <Box sx={{ px: 2.5, py: 1.25, display: 'flex', alignItems: 'center', gap: 2, borderBottom: '1px solid rgba(0,0,0,0.08)', bgcolor: 'rgba(0,0,0,0.015)', flexShrink: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.secondary', fontSize: '0.8rem' }}>Page Size</Typography>
            <TextField select size="small" value={paperSize} onChange={(e) => setPaperSize(e.target.value)} sx={{ minWidth: 84, '& .MuiOutlinedInput-root': { borderRadius: 1 } }}>
              {['A4', 'A5', 'Letter', 'Legal'].map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </TextField>
          </Box>
          <Box sx={{ flex: 1 }} />
          <Button startIcon={<Printer size={15} />} variant="contained" size="small" disableElevation
            onClick={() => { setPrintingData(previewRecord); setPreviewOpen(false); setPrintTrigger(t => t + 1); }}
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 1.5, bgcolor: isPaymentIn ? '#15803d' : '#b45309', '&:hover': { filter: 'brightness(0.9)' } }}>
            Print
          </Button>
        </Box>
        <Box sx={{ flex: 1, overflow: 'auto', bgcolor: '#e8eaed', p: { xs: 1.5, sm: 3 } }}>
          <FitPreview>
            <PaymentTemplate data={previewRecord} business={currentBusiness} paperSize={paperSize} />
          </FitPreview>
        </Box>
      </Dialog>
    </Box>
  );
};

export default PaymentEntry;
