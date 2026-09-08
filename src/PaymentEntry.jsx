import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Box, Typography, Grid, TextField, MenuItem, Button, Dialog,
  Card, CardContent, Stack, Avatar, alpha, useTheme,
  InputAdornment, IconButton, InputBase, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TablePagination, Chip, Tooltip,
  Autocomplete, ToggleButton, ToggleButtonGroup, Menu, ListItemIcon, ListItemText, Snackbar, Alert,
} from '@mui/material';
import {
  CheckCircle2, ArrowLeft, Landmark, Banknote,
  User, Search,
  ArrowDownRight, ArrowUpRight, Printer, Share2, Edit2, Trash2, Eye, X, MoreHorizontal, LayoutList,
  Users, ChevronDown, Phone,
} from 'lucide-react';
import PaymentBulkAddDialog from './PaymentBulkAddDialog';
import { useBusiness } from './BusinessContext';

import PartySelect from './PartySelect';
import { useConfig } from './ConfigContext';
import { useSubscription } from './SubscriptionContext';
import { useData } from './DataContext';
import { useI18n } from './i18n/I18nContext';
import { FitPreview } from './TxListView';
import { useDialog } from './DialogContext';
import { useTabs } from './TabsContext';
import { useReactToPrint } from 'react-to-print';
import PaymentTemplate from './PaymentTemplate';
import SplitPaymentInput from './SplitPaymentInput';
import { acknowledgeQuickNew } from './quickNewBridge';
import { txSortKey, formatCreatedTime } from './txTimeUtils';

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
};

const MODE_COLORS = {
  Cash:   { bg: alpha('#16a34a', 0.1), color: '#16a34a' },
  Bank:   { bg: alpha('#27272a', 0.1), color: '#27272a' },
  Split:  { bg: alpha('#7c3aed', 0.1), color: '#7c3aed' },
};


const PaymentEntry = ({ mode = 'payment-in' }) => {
  const theme = useTheme();
  const { openTab } = useTabs();
  const { currentBusiness } = useBusiness();
  const { confirm, showAlert } = useDialog();
  const { t } = useI18n();
  // TallyKraft billing: data layer blocks the write; this greys the CTA.
  const { isBusinessActive } = useSubscription();
  const canWrite = isBusinessActive(currentBusiness?.id);

  const { addItem, updateItem, deleteItem, getItems } = useData();

  const [tabValue, setTabValue] = useState(mode === 'payment-out' ? 1 : 0);
  const [formData, setFormData] = useState({
    partyId: '', amount: '', date: new Date().toISOString().split('T')[0],
    paymentMode: 'Cash', referenceNo: '', notes: ''
  });
  const [splitCash, setSplitCash] = useState('');
  const [splitBank, setSplitBank] = useState('');
  const [lessAmount, setLessAmount] = useState('');
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
    return ['A3', 'A4', 'A5', 'A6', 'Letter', 'Legal', 'Executive', 'Statement'].includes(d) ? d : 'A4';
  });
  useEffect(() => {
    if (config.defaultPaperSize) {
      const d = config.defaultPaperSize;
      if (['A3', 'A4', 'A5', 'A6', 'Letter', 'Legal', 'Executive', 'Statement'].includes(d)) setPaperSize(d);
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
  const [moreMenuAnchor, setMoreMenuAnchor] = useState(null);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [snack, setSnack] = useState({ open: false, msg: '' });

  const handlePrint = useReactToPrint({ contentRef: printRef });

  useEffect(() => {
    if (!printTrigger) return;
    handlePrint();
  }, [printTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dashboard's "Receive Payment"/"Make Payment" and "See Receivables"/"See
  // Payables" shortcuts dispatch this event — previously PaymentEntry had no
  // listener at all, so it silently did nothing beyond opening the tab
  // itself (openTab already handles that part). 'openAdd' just lands here
  // (nothing further to do — the form is already the page); 'viewOutstanding'
  // additionally switches to the matching tab and scrolls the Receivables/
  // Payables list into view. Since Sales/Purchases/PaymentEntry etc. can be
  // lazy-mounted, the event may need to retry a few times before this
  // listener exists — dispatchQuickNew already handles that, this side only
  // needs to acknowledge once it actually acts on a matching event.
  useEffect(() => {
    const onQuickNew = (e) => {
      const d = e.detail;
      if (!d) return;
      if (d.path !== '/payment-in' && d.path !== '/payment-out') return;
      if (d.intent === 'openAdd') {
        setTabValue(d.path === '/payment-out' ? 1 : 0);
        acknowledgeQuickNew(d);
      } else if (d.intent === 'viewOutstanding') {
        setTabValue(d.path === '/payment-out' ? 1 : 0);
        setTimeout(() => outstandingListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
        acknowledgeQuickNew(d);
      }
    };
    window.addEventListener('dashboard-quick-new', onQuickNew);
    return () => window.removeEventListener('dashboard-quick-new', onQuickNew);
  }, []);

  const isPaymentIn = tabValue === 0;
  // Payment-In reads as money coming in (emerald); Payment-Out as money leaving (amber).
  const accentColor = isPaymentIn ? '#334155' : '#d97706';
  const accentGradient = accentColor; // solid accent fill (white theme: no gradients)

  const parties = getItems('parties').filter(p => p.businessId === currentBusiness?.id);

  // Receivables/Payables list — same basis as Parties.jsx/Dashboard's own
  // Receivable/Payable KPIs: party.balance, positive = they owe us, negative
  // = we owe them (sign convention is identical for both Customer and
  // Vendor party types). Sorted by amount outstanding, largest first.
  const receivables = useMemo(() =>
    parties
      .filter(p => p.type === 'Customer' && (p.balance || 0) > 0)
      .sort((a, b) => (b.balance || 0) - (a.balance || 0)),
    [parties]);
  const payables = useMemo(() =>
    parties
      .filter(p => p.type === 'Vendor' && (p.balance || 0) < 0)
      .sort((a, b) => (a.balance || 0) - (b.balance || 0)),
    [parties]);
  const [outstandingSearch, setOutstandingSearch] = useState('');
  const outstandingListRef = useRef(null);
  const entryFormRef = useRef(null);

  const allPayments = getItems('payments').filter(t => t.businessId === currentBusiness?.id);
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
        // Date sort uses the real creation timestamp (falls back to date+time
        // for older records) so same-day payments order by when they were
        // actually recorded instead of colliding at midnight.
        default: aValue = txSortKey(a); bValue = txSortKey(b);
      }
      return filters.sortOrder === 'desc' ? (aValue < bValue ? 1 : -1) : (aValue > bValue ? 1 : -1);
    });
  }, [transactions, searchQuery, dateRange, filters]);

  const filteredTotal = filteredHistory.reduce((s, t) => s + (t.totalAmount || 0), 0);

  useEffect(() => { setPage(0); }, [searchQuery, dateRange, filters]);

  const handleSave = async () => {
    if (!currentBusiness?.id) { await showAlert({ title: 'Business not selected', message: 'Please select a business before saving.', variant: 'warning' }); return; }
    if (!selectedParty) { await showAlert({ title: 'Invalid party', message: 'Please select a valid party.', variant: 'warning' }); return; }

    let amountNum;
    let paymentSplit = null;

    if (formData.paymentMode === 'Split') {
      const cashNum = parseFloat(splitCash) || 0;
      const bankNum = parseFloat(splitBank) || 0;
      if (cashNum <= 0 && bankNum <= 0) { await showAlert({ title: 'Missing amounts', message: 'Enter at least one split amount.', variant: 'warning' }); return; }
      amountNum = cashNum + bankNum;
      paymentSplit = { cash: cashNum, bank: bankNum, bankMode: 'Bank' };
    } else {
      if (!formData.amount) { await showAlert({ title: 'Missing fields', message: 'Please select a party and enter an amount.', variant: 'warning' }); return; }
      amountNum = parseFloat(formData.amount);
      if (isNaN(amountNum) || amountNum <= 0) { await showAlert({ title: 'Invalid amount', message: 'Please enter a valid amount greater than zero.', variant: 'warning' }); return; }
    }

    const lessNum = parseFloat(lessAmount) || 0;
    const totalSettled = amountNum + lessNum; // actual balance cleared = paid + written off

    try {
      const paymentData = {
        businessId: currentBusiness.id,
        partyId: formData.partyId,
        partyName: selectedParty.name || 'Unknown',
        type: isPaymentIn ? 'PaymentIn' : 'PaymentOut',
        totalAmount: amountNum,
        ...(lessNum > 0 ? { lessAmount: lessNum } : {}),
        date: formData.date || new Date().toISOString().split('T')[0],
        paymentMode: formData.paymentMode || 'Cash',
        ...(paymentSplit ? { paymentSplit } : {}),
        referenceNo: formData.referenceNo || `REF-${Date.now().toString().slice(-6)}`,
        notes: formData.notes || ''
      };

      if (editingId) {
        const oldPayment = getItems('payments').find(p => p.id === editingId);
        if (!oldPayment) { await showAlert({ title: 'Not found', message: 'Payment not found.', variant: 'warning' }); return; }
        const oldParty = parties.find(p => p.id === oldPayment.partyId);
        const oldSettled = (oldPayment.totalAmount || 0) + (oldPayment.lessAmount || 0);
        const rollbackOld = isPaymentIn ? oldSettled : -oldSettled;
        const applyNew = isPaymentIn ? -totalSettled : totalSettled;
        if (oldParty) await updateItem('parties', oldPayment.partyId, { balance: (oldParty.balance || 0) + rollbackOld });
        if (selectedParty.id !== oldPayment.partyId) {
          await updateItem('parties', formData.partyId, { balance: (selectedParty.balance || 0) + applyNew });
        } else {
          await updateItem('parties', formData.partyId, { balance: (selectedParty.balance || 0) + rollbackOld + applyNew });
        }
        await updateItem('payments', editingId, paymentData);
        setEditingId(null);
        setFormData({ ...formData, amount: '', referenceNo: '', notes: '' });
        setSplitCash(''); setSplitBank(''); setLessAmount('');
        setSnack({ open: true, msg: isPaymentIn ? 'Payment In updated' : 'Payment Out updated' });
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
      await updateItem('parties', formData.partyId, { balance: (selectedParty.balance || 0) + (isPaymentIn ? -totalSettled : totalSettled) });
      setFormData({ ...formData, amount: '', referenceNo: '', notes: '' });
      setSplitCash(''); setSplitBank(''); setLessAmount('');
      setSnack({ open: true, msg: isPaymentIn ? 'Payment received — recorded' : 'Payment made — recorded' });
    } catch (error) {
      console.error('Error saving payment:', error);
      await showAlert({ title: 'Save error', message: 'An error occurred while saving. Please try again.', variant: 'danger' });
    }
  };

  const startEdit = (row) => {
    setEditingId(row.id);
    setFormData({
      partyId: row.partyId,
      amount: row.paymentMode === 'Split' ? '' : String(row.totalAmount ?? ''),
      date: row.date || new Date().toISOString().split('T')[0],
      paymentMode: row.paymentMode || 'Cash',
      referenceNo: row.referenceNo || '',
      notes: row.notes || ''
    });
    setLessAmount(row.lessAmount ? String(row.lessAmount) : '');
    if (row.paymentMode === 'Split' && row.paymentSplit) {
      setSplitCash(String(row.paymentSplit.cash || ''));
      setSplitBank(String(row.paymentSplit.bank || ''));
    } else {
      setSplitCash(''); setSplitBank('');
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormData({ partyId: formData.partyId, amount: '', date: new Date().toISOString().split('T')[0], paymentMode: 'Cash', referenceNo: '', notes: '' });
    setSplitCash(''); setSplitBank('');   };

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
    const isSplit = row.paymentMode === 'Split' && row.paymentSplit;
    const modeText = isSplit
      ? `Mode: ⚡ Split Payment\n  💵 Cash: ₹${Number(row.paymentSplit.cash).toLocaleString()}\n  🏦 Bank: ₹${Number(row.paymentSplit.bank).toLocaleString()}`
      : `Mode: ${row.paymentMode}`;
    const text = `*Payment Receipt from ${currentBusiness?.name || 'TallyKraft'}*\n\n` +
      `Amount: ₹${row.totalAmount.toLocaleString()}\n` +
      `Date: ${row.date}\n` +
      `Party: ${row.partyName}\n` +
      `${modeText}\n` +
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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5, flexWrap: 'wrap' }}>
        <Tooltip title="Go back">
          <IconButton onClick={() => openTab('/', 'Dashboard')} size="small" sx={{ border: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
            <ArrowLeft size={18} />
          </IconButton>
        </Tooltip>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{t('pay.title')}</Typography>
          <Typography variant="caption" color="text.secondary">Record and manage receipts & disbursements</Typography>
        </Box>
        {/* Summary chips */}
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          {[
            { label: 'Received', value: totalIn, color: '#16a34a' },
            { label: 'Paid Out', value: totalOut, color: '#d97706' },
          ].map(({ label, value, color }) => (
            <Box key={label} sx={{ px: 1.5, py: 0.75, borderRadius: '10px', bgcolor: alpha(color, 0.06), border: `1px solid ${alpha(color, 0.18)}` }}>
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: 1.2 }}>{label}</Typography>
              <Typography sx={{ fontWeight: 800, fontSize: '0.9rem', color, lineHeight: 1.2 }}>₹{value.toLocaleString('en-IN')}</Typography>
            </Box>
          ))}
          <Tooltip title="More options">
            <IconButton size="small" onClick={e => setMoreMenuAnchor(e.currentTarget)}
              sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '8px' }}>
              <MoreHorizontal size={16} />
            </IconButton>
          </Tooltip>
        </Box>
        <Menu anchorEl={moreMenuAnchor} open={Boolean(moreMenuAnchor)} onClose={() => setMoreMenuAnchor(null)}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          PaperProps={{ elevation: 6, sx: { borderRadius: 2, mt: 0.5, minWidth: 180 } }}>
          <MenuItem onClick={() => { setBulkAddOpen(true); setMoreMenuAnchor(null); }} sx={{ gap: 1.5, py: 1.25 }}>
            <ListItemIcon sx={{ minWidth: 'unset' }}><LayoutList size={16} /></ListItemIcon>
            <ListItemText primary="Bulk Add Payments" primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 600 }} />
          </MenuItem>
        </Menu>
      </Box>

      {/* Row 1 — entry form (left) + live Party Balance preview (right).
          Paired together since Party Balance is directly driven by what's
          being typed into the form (selected party + amount), not related
          to History/Outstanding below — grouping it here also frees up
          History to sit alongside Outstanding as its own full-width row,
          both visible together without scrolling on desktop/laptop. */}
      <Grid container spacing={2.5} sx={{ mb: 2.5 }}>
        <Grid size={{ xs: 12, lg: 8 }}>
      {/* Pill tabs + form in one card */}
      <Card ref={entryFormRef} elevation={0} sx={{ borderRadius: '14px', border: `1px solid ${alpha(accentColor, 0.2)}`, overflow: 'hidden', scrollMarginTop: 16 }}>
        {/* Tab strip */}
        <Box sx={{ display: 'flex', borderBottom: `1px solid ${alpha(accentColor, 0.12)}`, bgcolor: alpha(accentColor, 0.02) }}>
          {[
            { label: t('pay.paymentIn'), sub: 'Money Received', icon: <ArrowDownRight size={14} />, color: '#334155' },
            { label: t('pay.paymentOut'), sub: 'Money Paid Out', icon: <ArrowUpRight size={14} />, color: '#d97706' },
          ].map((tab, i) => (
            <Box key={i} onClick={() => { setTabValue(i); setFormData(f => ({ ...f, partyId: '' })); }}
              sx={{ flex: 1, px: 2.5, py: 1.25, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 1,
                borderBottom: tabValue === i ? `2.5px solid ${tab.color}` : '2.5px solid transparent',
                bgcolor: tabValue === i ? alpha(tab.color, 0.05) : 'transparent',
                transition: 'all 0.15s',
                '&:hover': { bgcolor: alpha(tab.color, 0.04) },
              }}>
              <Box sx={{ p: 0.5, borderRadius: '6px', bgcolor: tabValue === i ? alpha(tab.color, 0.12) : 'transparent', color: tabValue === i ? tab.color : '#94a3b8', display: 'flex', transition: 'all 0.15s' }}>
                {tab.icon}
              </Box>
              <Box>
                <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', lineHeight: 1.2, color: tabValue === i ? '#0f172a' : '#64748b' }}>{tab.label}</Typography>
                <Typography sx={{ fontSize: '0.68rem', color: '#94a3b8', lineHeight: 1 }}>{tab.sub}</Typography>
              </Box>
              {editingId && tabValue === i && <Chip label="Editing" size="small" sx={{ ml: 'auto', height: 18, fontSize: '0.65rem', bgcolor: alpha(accentColor, 0.1), color: accentColor, fontWeight: 700 }} />}
            </Box>
          ))}
        </Box>

        <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
          <Grid container spacing={2}>
            {/* Row 1: Party + Amount side by side */}
            <Grid size={{ xs: 12, sm: 7 }}>
              <PartySelect
                options={parties}
                value={parties.find(p => p.id === formData.partyId) || null}
                onChange={(v) => setFormData({ ...formData, partyId: v?.id || '' })}
                label="Party (Customer / Vendor)"
                placeholder="Search customer or vendor…"
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 5 }}>
              {formData.paymentMode === 'Split' ? (
                <Box sx={{ border: `2px solid ${alpha('#7c3aed', 0.4)}`, borderRadius: '10px', px: 2, py: 1, bgcolor: alpha('#7c3aed', 0.03) }}>
                  <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.25 }}>Total (Split)</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                    <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: '#7c3aed' }}>₹</Typography>
                    <Typography sx={{ fontSize: '1.75rem', fontWeight: 800, color: '#7c3aed', letterSpacing: '-0.02em' }}>
                      {((parseFloat(splitCash) || 0) + (parseFloat(splitBank) || 0)) || 0}
                    </Typography>
                  </Box>
                </Box>
              ) : (
                <Box sx={{ border: `2px solid`, borderColor: formData.amount ? accentColor : alpha(accentColor, 0.25), borderRadius: '10px', px: 2, py: 1, bgcolor: formData.amount ? alpha(accentColor, 0.03) : 'transparent', transition: 'all 0.2s', '&:focus-within': { borderColor: accentColor } }}>
                  <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: accentColor, textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.25 }}>Amount</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                    <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: accentColor }}>₹</Typography>
                    <InputBase fullWidth type="number" placeholder="0" value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      onFocus={(e) => e.target.select()}
                      inputProps={{ min: 0, step: 0.01, style: { padding: 0 } }}
                      sx={{ '& input': { fontSize: '1.75rem', fontWeight: 800, color: accentColor, letterSpacing: '-0.02em', '&::placeholder': { color: alpha(accentColor, 0.3) } } }}
                    />
                  </Box>
                </Box>
              )}
            </Grid>

            {/* Row 2: Payment mode + Less side by side */}
            <Grid size={{ xs: 12, sm: 7 }}>
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.75 }}>Payment Via</Typography>
              <Box sx={{ display: 'flex', gap: 0.75 }}>
                {[
                  { value: 'Cash',  icon: <Banknote size={14} />,   color: '#16a34a' },
                  { value: 'Bank',  icon: <Landmark size={14} />,   color: '#27272a' },
                  { value: 'Split', icon: <ArrowLeft size={14} style={{ transform: 'rotate(135deg)' }} />, color: '#7c3aed' },
                ].map(opt => {
                  const sel = formData.paymentMode === opt.value;
                  return (
                    <Box key={opt.value} onClick={() => setFormData({ ...formData, paymentMode: opt.value })}
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1.5, py: 0.75, borderRadius: '8px', border: '1.5px solid', cursor: 'pointer', userSelect: 'none', transition: 'all 0.12s', fontWeight: 700, fontSize: '0.8rem',
                        borderColor: sel ? opt.color : '#e5e7eb', bgcolor: sel ? alpha(opt.color, 0.07) : '#fafafa', color: sel ? opt.color : '#64748b',
                        '&:hover': { borderColor: opt.color, color: opt.color, bgcolor: alpha(opt.color, 0.05) } }}>
                      {opt.icon}{opt.value}
                    </Box>
                  );
                })}
              </Box>
            </Grid>

            <Grid size={{ xs: 12, sm: 5 }}>
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.75 }}>Less — Discount / Write-off</Typography>
              <Box sx={{ border: `1.5px solid`, borderColor: lessAmount ? '#d97706' : '#e5e7eb', borderRadius: '10px', px: 1.5, py: 0.75, bgcolor: lessAmount ? alpha('#d97706', 0.03) : '#fafafa', transition: 'all 0.2s', '&:focus-within': { borderColor: '#d97706' } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: lessAmount ? '#d97706' : '#cbd5e1' }}>₹</Typography>
                  <InputBase fullWidth type="number" placeholder="0 (optional)" value={lessAmount}
                    onChange={(e) => setLessAmount(e.target.value)} onFocus={(e) => e.target.select()}
                    inputProps={{ min: 0, step: 0.01, style: { padding: 0 } }}
                    sx={{ '& input': { fontSize: '1rem', fontWeight: 700, color: '#d97706', '&::placeholder': { color: '#cbd5e1', fontWeight: 500 } } }}
                  />
                  {(parseFloat(formData.amount) > 0 || parseFloat(lessAmount) > 0) && (
                    <Box sx={{ textAlign: 'right', flexShrink: 0, pl: 1, borderLeft: '1px solid #f1f5f9' }}>
                      <Typography sx={{ fontSize: '0.6rem', color: '#94a3b8', lineHeight: 1.2 }}>Settled</Typography>
                      <Typography sx={{ fontWeight: 800, fontSize: '0.85rem', color: accentColor, lineHeight: 1.2 }}>
                        ₹{((parseFloat(formData.amount) || 0) + (parseFloat(lessAmount) || 0)).toLocaleString('en-IN')}
                      </Typography>
                    </Box>
                  )}
                </Box>
              </Box>
            </Grid>

            {/* Split amount fields */}
            {formData.paymentMode === 'Split' && (
              <Grid size={{ xs: 12 }}>
                <SplitPaymentInput
                  cash={splitCash} onCashChange={setSplitCash}
                  bank={splitBank} onBankChange={setSplitBank}
                  total={parseFloat(formData.amount) || undefined}
                  accentColor={accentColor}
                />
              </Grid>
            )}

            {/* Row 3: Date + Reference + Notes */}
            <Grid size={{ xs: 6, sm: 3 }}>
              <TextField fullWidth size="small" label="Date" type="date" value={formData.date || ''}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                slotProps={{ inputLabel: { shrink: true } }} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <TextField fullWidth size="small" label="Reference No." placeholder="TXN12345"
                value={formData.referenceNo} onChange={(e) => setFormData({ ...formData, referenceNo: e.target.value })} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label="Notes (optional)" placeholder="Add a note…"
                value={formData.notes || ''} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
            </Grid>

            {/* Action */}
            <Grid size={{ xs: 12 }}>
              {(() => {
                const isSplit = formData.paymentMode === 'Split';
                const splitTotal = (parseFloat(splitCash) || 0) + (parseFloat(splitBank) || 0);
                const isDisabled = !canWrite || !formData.partyId || (isSplit ? splitTotal <= 0 : !formData.amount);
                return editingId ? (
                  <Stack direction="row" spacing={1.5}>
                    <Button variant="contained" size="large" onClick={handleSave} disabled={isDisabled}
                      startIcon={<CheckCircle2 size={18} />}
                      sx={{ fontWeight: 700, flex: 1, borderRadius: '10px', py: 1.125, bgcolor: accentColor, '&:hover': { bgcolor: accentColor, filter: 'brightness(0.9)' } }}>
                      Update Payment
                    </Button>
                    <Button variant="outlined" size="large" onClick={cancelEdit}
                      sx={{ fontWeight: 600, borderRadius: '10px', px: 2.5 }}>Cancel</Button>
                  </Stack>
                ) : (
                  <Button fullWidth variant="contained" size="large" onClick={handleSave} disabled={isDisabled}
                    startIcon={<CheckCircle2 size={18} />}
                    sx={{ fontWeight: 700, borderRadius: '10px', py: 1.125, fontSize: '0.95rem',
                      bgcolor: accentColor, '&:hover': { bgcolor: accentColor, filter: 'brightness(0.9)' },
                      '&.Mui-disabled': { bgcolor: alpha(accentColor, 0.2), color: alpha(accentColor, 0.45) } }}>
                    {isPaymentIn ? 'Record Payment Received' : 'Record Payment Made'}
                  </Button>
                );
              })()}
            </Grid>
          </Grid>
        </CardContent>
      </Card>
        </Grid>

        {/* Party ledger balance */}
        <Grid size={{ xs: 12, lg: 4 }}>
          <Card elevation={0} sx={{
            border: `1px solid ${selectedParty ? alpha(accentColor, 0.3) : '#e5e7eb'}`,
            borderRadius: '14px', overflow: 'hidden', transition: 'border-color 0.2s ease',
          }}>
            <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid #f1f5f9', bgcolor: '#fafafa' }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.875rem' }}>Party Balance</Typography>
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

                  {(() => {
                    const effectiveAmount = formData.paymentMode === 'Split'
                      ? (parseFloat(splitCash) || 0) + (parseFloat(splitBank) || 0)
                      : Number(formData.amount);
                    return effectiveAmount > 0 ? (
                      <Box sx={{ mt: 2.5, pt: 2, borderTop: '1px dashed', borderColor: 'divider' }}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                          Balance after this payment
                        </Typography>
                        <Typography variant="h5" sx={{ fontWeight: 700 }}>
                          ₹{Math.abs(
                            (selectedParty.balance || 0) + (isPaymentIn ? -effectiveAmount : effectiveAmount)
                          ).toLocaleString('en-IN')}
                        </Typography>
                      </Box>
                    ) : null;
                  })()}
                </>
              ) : (
                <Box sx={{ py: 4 }}>
                  <Avatar sx={{ bgcolor: 'action.hover', width: 60, height: 60, mx: 'auto', mb: 2 }}>
                    <User size={28} color={theme.palette.text.disabled} />
                  </Avatar>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                    Select a party to view balance
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Row 2 — Outstanding (left) + Payment History (right), side by side
          on desktop/laptop so both are visible at a glance with no scrolling
          needed to see recent history after checking who owes what. */}
      <Grid container spacing={2.5}>
        {/* Outstanding — Receivables (Payment In tab) / Payables (Payment Out tab).
            Clicking a row pre-fills that party into the form above and scrolls
            up to it, so recording the payment is a single next step. */}
        <Grid size={{ xs: 12, lg: 5 }}>
      <Card ref={outstandingListRef} elevation={0} sx={{ borderRadius: '14px', border: `1px solid ${alpha(accentColor, 0.2)}`, overflow: 'hidden', scrollMarginTop: 16 }}>
        <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid #f1f5f9', bgcolor: alpha(accentColor, 0.03), display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ p: 0.625, borderRadius: '8px', bgcolor: alpha(accentColor, 0.1), color: accentColor, display: 'flex' }}>
              <Users size={15} />
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 700, fontSize: '0.875rem' }}>
                {isPaymentIn ? 'Customers — Amount to Collect' : 'Vendors — Amount to Pay'}
              </Typography>
              <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
                {(isPaymentIn ? receivables : payables).length} {isPaymentIn ? 'customer' : 'vendor'}{(isPaymentIn ? receivables : payables).length === 1 ? '' : 's'} with an open balance
              </Typography>
            </Box>
          </Box>
          <Box sx={{ px: 1.5, py: 0.75, borderRadius: '10px', bgcolor: alpha(accentColor, 0.08) }}>
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: accentColor, textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1.1 }}>
              Total {isPaymentIn ? 'Receivable' : 'Payable'}
            </Typography>
            <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: accentColor, lineHeight: 1.2 }}>
              ₹{(isPaymentIn ? receivables : payables).reduce((s, p) => s + Math.abs(p.balance || 0), 0).toLocaleString('en-IN')}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Paper variant="outlined" sx={{ px: 1.5, py: 0.5, display: 'flex', alignItems: 'center', borderRadius: 2 }}>
            <Search size={14} color={theme.palette.text.disabled} />
            <InputBase sx={{ ml: 1, flex: 1, fontSize: '0.8125rem' }}
              placeholder={`Search ${isPaymentIn ? 'customers' : 'vendors'}…`}
              value={outstandingSearch} onChange={(e) => setOutstandingSearch(e.target.value)} />
          </Paper>
        </Box>

        <Box sx={{ maxHeight: 340, overflowY: 'auto' }}>
          {(() => {
            const list = (isPaymentIn ? receivables : payables).filter(p =>
              !outstandingSearch || p.name?.toLowerCase().includes(outstandingSearch.toLowerCase()) || p.phone?.includes(outstandingSearch)
            );
            if (list.length === 0) {
              return (
                <Box sx={{ py: 5, textAlign: 'center', opacity: 0.5 }}>
                  <CheckCircle2 size={30} strokeWidth={1.5} />
                  <Typography variant="body2" sx={{ fontWeight: 600, mt: 1 }}>
                    {outstandingSearch ? 'No matches' : `No outstanding ${isPaymentIn ? 'receivables' : 'payables'}`}
                  </Typography>
                </Box>
              );
            }
            return list.map((p, idx) => (
              <Box key={p.id}
                onClick={() => {
                  setFormData(f => ({ ...f, partyId: p.id }));
                  entryFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1.25, px: 2, py: 1.125, cursor: 'pointer',
                  borderTop: idx > 0 ? '1px solid #f1f5f9' : 'none',
                  bgcolor: formData.partyId === p.id ? alpha(accentColor, 0.06) : 'transparent',
                  '&:hover': { bgcolor: alpha(accentColor, 0.05) },
                }}>
                <Avatar sx={{ width: 32, height: 32, fontSize: '0.8rem', fontWeight: 700, bgcolor: alpha(accentColor, 0.14), color: accentColor }}>
                  {p.name?.[0]?.toUpperCase() || 'P'}
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</Typography>
                  {p.phone && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.375, mt: 0.125 }}>
                      <Phone size={10} color={theme.palette.text.disabled} />
                      <Typography sx={{ fontSize: '0.68rem', color: 'text.disabled' }}>{p.phone}</Typography>
                    </Box>
                  )}
                </Box>
                <Typography sx={{ fontWeight: 800, fontSize: '0.9rem', color: accentColor, whiteSpace: 'nowrap' }}>
                  ₹{Math.abs(p.balance || 0).toLocaleString('en-IN')}
                </Typography>
                <ChevronDown size={14} style={{ transform: 'rotate(-90deg)', color: theme.palette.text.disabled, flexShrink: 0 }} />
              </Box>
            ));
          })()}
        </Box>
      </Card>
        </Grid>

        {/* Payment history table */}
        <Grid size={{ xs: 12, lg: 7 }}>
          <Card elevation={0} sx={{ border: `1px solid #e5e7eb`, borderRadius: '14px', overflow: 'hidden' }}>
            {/* History header */}
            <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, bgcolor: '#fafafa' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.875rem' }}>
                  {isPaymentIn ? t('pay.paymentIn') : t('pay.paymentOut')} History
                </Typography>
                <Box sx={{ px: 1, py: 0.25, borderRadius: '6px', bgcolor: alpha(accentColor, 0.08) }}>
                  <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: accentColor }}>{filteredHistory.length}</Typography>
                </Box>
              </Box>
              <Typography sx={{ fontSize: '0.75rem', color: '#64748b' }}>
                Total&nbsp;<Box component="span" sx={{ fontWeight: 800, color: accentColor }}>₹{filteredTotal.toLocaleString('en-IN')}</Box>
              </Typography>
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

                      <MenuItem value="Split">Split</MenuItem>
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
                      <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary', fontSize: '0.8rem' }}>
                        {formatDate(row.date)}
                        {formatCreatedTime(row) && (
                          <Typography component="span" sx={{ display: 'block', fontSize: '0.68rem', color: 'text.disabled', fontWeight: 500 }}>
                            {formatCreatedTime(row)}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{row.partyName}</TableCell>
                      <TableCell sx={{ color: 'text.secondary', fontSize: '0.8rem', display: { xs: 'none', md: 'table-cell' } }}>
                        {row.referenceNo || '—'}
                      </TableCell>
                      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                        <Tooltip title={
                          row.paymentMode === 'Split' && row.paymentSplit
                            ? `Cash ₹${(row.paymentSplit.cash || 0).toLocaleString('en-IN')} + Bank ₹${(row.paymentSplit.bank || 0).toLocaleString('en-IN')}`
                            : row.paymentMode
                        }>
                          <Chip
                            label={row.paymentMode}
                            size="small"
                            sx={{
                              fontWeight: 700, fontSize: '0.7rem', border: 'none',
                              bgcolor: MODE_COLORS[row.paymentMode]?.bg || alpha('#666', 0.1),
                              color: MODE_COLORS[row.paymentMode]?.color || 'text.secondary',
                            }}
                          />
                        </Tooltip>
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        <Typography sx={{ fontWeight: 800, color: accentColor, fontSize: '0.9rem' }}>
                          ₹{row.totalAmount?.toLocaleString('en-IN')}
                        </Typography>
                        {row.lessAmount > 0 && (
                          <Typography variant="caption" sx={{ color: '#d97706', display: 'block', fontWeight: 600 }}>
                            −₹{row.lessAmount.toLocaleString('en-IN')} less
                          </Typography>
                        )}
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
                          <Banknote size={34} strokeWidth={1.5} />
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
      </Grid>

      {/* Preview dialog */}
      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} maxWidth="md" fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.22)' } }}>
        <Box sx={{ background: accentGradient, px: 3, py: 2.5, display: 'flex', alignItems: 'flex-start', gap: 2, flexShrink: 0 }}>
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
              {previewRecord?.paymentMode && (
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>
                  {previewRecord.paymentMode === 'Split' && previewRecord.paymentSplit
                    ? `Cash ₹${(previewRecord.paymentSplit.cash || 0).toLocaleString('en-IN')} + Bank ₹${(previewRecord.paymentSplit.bank || 0).toLocaleString('en-IN')}`
                    : previewRecord.paymentMode}
                </Typography>
              )}
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
              {['A3', 'A4', 'A5', 'A6', 'Letter', 'Legal', 'Executive', 'Statement'].map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
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

      <PaymentBulkAddDialog
        open={bulkAddOpen}
        onClose={() => setBulkAddOpen(false)}
        defaultType={isPaymentIn ? 'PaymentIn' : 'PaymentOut'}
        onSuccess={(count) => setSnack({ open: true, msg: `${count} payment${count !== 1 ? 's' : ''} added successfully` })}
      />

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="success" onClose={() => setSnack(s => ({ ...s, open: false }))} sx={{ fontWeight: 600 }}>
          {snack.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default PaymentEntry;
