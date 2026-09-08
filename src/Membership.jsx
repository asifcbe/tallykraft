import React, { useState, useMemo } from 'react';
import {
  Box, Typography, Button, Paper, Stack, Chip, IconButton, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField, MenuItem,
  alpha, useTheme, Tooltip, Alert, Snackbar, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, FormControl,
  InputLabel, Select, InputAdornment, Menu, ListItemIcon, Divider,
} from '@mui/material';
import {
  Plus, Edit2, Trash2, CreditCard, CheckCircle, Clock, PauseCircle,
  XCircle, Receipt, Calendar, AlertTriangle, Search, X, MoreVertical,
  PlayCircle, BanknoteIcon, RefreshCw,
} from 'lucide-react';
import { useData } from './DataContext';
import { useBusiness } from './BusinessContext';
import { useDialog } from './DialogContext';

// ── Constants ─────────────────────────────────────────────────────────────────
const CYCLES = ['3m', '4m', '6m', '1y'];
const CYCLE_LABELS = { '3m': '3 Months', '4m': '4 Months', '6m': '6 Months', '1y': '1 Year' };
const CYCLE_MONTHS = { '3m': 3, '4m': 4, '6m': 6, '1y': 12 };

// ── Helpers ───────────────────────────────────────────────────────────────────
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const fmtDate = (d) => {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
};

const fmtAmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const addMonths = (dateStr, n) => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  d.setMonth(d.getMonth() + n);
  return d.toISOString().split('T')[0];
};

const daysDiff = (a, b) =>
  Math.round((new Date(b) - new Date(a)) / 86400000);

// ── Billing state per membership ──────────────────────────────────────────────
// Returns one of: 'overdue' | 'due_today' | 'upcoming' | 'awaiting_payment' | 'paused' | 'cancelled'
const getBillingState = (m, membershipSales) => {
  if (m.status === 'paused') return { state: 'paused' };
  if (m.status === 'cancelled') return { state: 'cancelled' };

  const unpaid = membershipSales.filter(s => s.status === 'Unpaid' || s.status === 'Partial');
  if (unpaid.length > 0) {
    const latest = unpaid[unpaid.length - 1];
    return {
      state: 'awaiting_payment',
      invoice: latest,
      amount: latest.balanceAmount ?? latest.totalAmount ?? 0,
    };
  }

  const today = todayStr();
  if (!m.nextBillingDate) return { state: 'upcoming', daysLeft: null };
  const diff = daysDiff(today, m.nextBillingDate);
  if (diff < 0) return { state: 'overdue', daysOverdue: Math.abs(diff) };
  if (diff === 0) return { state: 'due_today' };
  return { state: 'upcoming', daysLeft: diff };
};

// ── Form default ──────────────────────────────────────────────────────────────
const emptyForm = () => ({
  partyId: '', itemId: '', planName: '', billingCycle: '3m', amount: '',
  startDate: todayStr(), nextBillingDate: todayStr(), status: 'active', notes: '',
});

// ═════════════════════════════════════════════════════════════════════════════
const MembershipPage = () => {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const { getItems, data, addItem, updateItem, deleteItem } = useData();
  const { currentBusiness } = useBusiness();
  const { confirm } = useDialog();
  const bId = currentBusiness?.id;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuMembership, setMenuMembership] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, msg: '', severity: 'success' });

  const showSnack = (msg, severity = 'success') => setSnackbar({ open: true, msg, severity });

  // ── Data ────────────────────────────────────────────────────────────────────
  /* eslint-disable react-hooks/exhaustive-deps */
  const memberships = useMemo(() =>
    getItems('memberships').filter(m => m.businessId === bId),
    [data.memberships, bId]
  );
  const customers = useMemo(() =>
    getItems('parties').filter(p => p.businessId === bId && (p.type === 'Customer' || p.type === 'Both'))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [data.parties, bId]
  );
  const allSales = useMemo(() => getItems('sales').filter(s => s.businessId === bId), [data.sales, bId]);
  // Items the user has created with category "Membership" — these become available plan options
  const membershipItems = useMemo(() =>
    getItems('items').filter(i => i.businessId === bId &&
      (i.isMembership || i.category?.toLowerCase() === 'membership'))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [data.items, bId]
  );
  /* eslint-enable react-hooks/exhaustive-deps */

  const getMembershipSales = (m) => allSales.filter(s => s.membershipId === m.id);

  // ── Stats ───────────────────────────────────────────────────────────────────
  const activeMembers = memberships.filter(m => m.status === 'active');
  const today = todayStr();
  const dueCount = activeMembers.filter(m => {
    const s = getBillingState(m, getMembershipSales(m));
    return s.state === 'overdue' || s.state === 'due_today';
  }).length;
  const awaitingCount = activeMembers.filter(m =>
    getBillingState(m, getMembershipSales(m)).state === 'awaiting_payment'
  ).length;
  const monthlyMRR = activeMembers
    .filter(m => m.billingCycle === 'monthly')
    .reduce((s, m) => s + (Number(m.amount) || 0), 0);

  // ── Filtered list ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return memberships.filter(m => {
      if (statusFilter !== 'all' && m.status !== statusFilter) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        const cust = customers.find(c => c.id === m.partyId);
        if (!cust?.name?.toLowerCase().includes(s) && !m.planName?.toLowerCase().includes(s)) return false;
      }
      return true;
    }).sort((a, b) => {
      // Sort: overdue first, then due today, then upcoming by date, then others
      const order = { overdue: 0, due_today: 1, awaiting_payment: 2, upcoming: 3, paused: 4, cancelled: 5 };
      const sa = getBillingState(a, getMembershipSales(a)).state;
      const sb = getBillingState(b, getMembershipSales(b)).state;
      if (order[sa] !== order[sb]) return order[sa] - order[sb];
      return (a.nextBillingDate || '').localeCompare(b.nextBillingDate || '');
    });
  }, [memberships, statusFilter, search, customers, allSales]);

  // ── Dialog helpers ──────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (m) => {
    setEditId(m.id);
    setForm({
      partyId: m.partyId, itemId: m.itemId || '', planName: m.planName,
      billingCycle: m.billingCycle, amount: m.amount,
      startDate: m.startDate, nextBillingDate: m.nextBillingDate,
      status: m.status, notes: m.notes || '',
    });
    setDialogOpen(true);
    setMenuAnchor(null);
  };

  const handleSave = () => {
    if (!form.partyId) { showSnack('Please select a customer.', 'error'); return; }
    if (!form.itemId) { showSnack('Please select a membership plan from Items.', 'error'); return; }
    if (!form.amount || Number(form.amount) <= 0) { showSnack('Enter a valid amount.', 'error'); return; }
    const cust = customers.find(c => c.id === form.partyId);
    const nextBilling = form.nextBillingDate || form.startDate;
    const payload = {
      ...form,
      businessId: bId,
      partyName: cust?.name || '',
      amount: Number(form.amount),
      nextBillingDate: nextBilling,
      itemId: form.itemId,
    };
    if (editId) {
      updateItem('memberships', editId, payload);
      showSnack('Membership updated.');
    } else {
      addItem('memberships', { ...payload, id: Date.now() });
      showSnack('Membership added successfully.');
    }
    setDialogOpen(false);
  };

  // ── Invoice generation — with duplicate guard ────────────────────────────────
  const handleGenerateInvoice = (m) => {
    const relSales = getMembershipSales(m);
    const unpaid = relSales.filter(s => s.status === 'Unpaid' || s.status === 'Partial');

    // ── Guard: block if an unpaid invoice already exists ──
    if (unpaid.length > 0) {
      showSnack('An unpaid invoice already exists. Collect payment before generating a new one.', 'warning');
      return;
    }

    const cust = customers.find(c => c.id === m.partyId);
    const seq = relSales.length + 1;
    const invoiceNum = `MEM-${String(m.id).slice(-4)}-${String(seq).padStart(3, '0')}`;
    const nowT = new Date();
    const time = `${String(nowT.getHours()).padStart(2,'0')}:${String(nowT.getMinutes()).padStart(2,'0')}`;

    addItem('sales', {
      id: Date.now(),
      businessId: bId,
      partyId: m.partyId,
      partyName: cust?.name || m.partyName,
      type: 'Sales',
      date: today,
      time,
      invoiceNumber: invoiceNum,
      membershipId: m.id,
      items: [{
        itemId: '', name: `${m.planName} — ${CYCLE_LABELS[m.billingCycle]} Subscription`,
        qty: 1, price: String(m.amount), taxRate: 0, discountPercent: '', total: m.amount,
      }],
      description: '',
      noGST: true,
      discountPercent: 0, discountAmount: 0, discountType: 'percent', discountValue: 0,
      subtotal: m.amount, taxAmount: 0, totalAmount: m.amount,
      paidAmount: 0, balanceAmount: m.amount,
      // Unpaid credit invoice — cash is realised only when the payment-in is
      // recorded (handleRecordPayment), so we don't tag it as a cash sale here.
      // Otherwise the cash would be counted twice (sale + payment-in).
      paymentMode: '', status: 'Unpaid', notes: '',
      cgstAmount: 0, sgstAmount: 0, igstAmount: 0,
    });

    // Advance next billing date
    const next = addMonths(m.nextBillingDate || today, CYCLE_MONTHS[m.billingCycle]);
    updateItem('memberships', m.id, { ...m, lastBilledDate: today, nextBillingDate: next });
    showSnack(`Invoice ${invoiceNum} generated.`);
  };

  // ── Payment recording ────────────────────────────────────────────────────────
  const handleRecordPayment = (m, bState) => {
    const invoice = bState.invoice;
    if (!invoice) return;
    updateItem('sales', invoice.id, { status: 'Paid', paidAmount: invoice.totalAmount, balanceAmount: 0 });
    addItem('payments', {
      id: Date.now(),
      businessId: bId,
      partyId: m.partyId,
      partyName: m.partyName,
      type: 'PaymentIn',
      date: today,
      totalAmount: invoice.totalAmount,
      paymentMode: 'Cash',
      referenceNo: invoice.invoiceNumber,
      notes: `Payment for ${m.planName}`,
    });
    showSnack(`Payment of ${fmtAmt(invoice.totalAmount)} recorded.`);
  };

  // ── Status / pause / delete ──────────────────────────────────────────────────
  const handleTogglePause = (m) => {
    const next = m.status === 'active' ? 'paused' : 'active';
    updateItem('memberships', m.id, { ...m, status: next });
    showSnack(next === 'active' ? 'Membership activated.' : 'Membership paused.');
    setMenuAnchor(null);
  };

  const handleDelete = async (m) => {
    const ok = await confirm({
      title: 'Delete Membership',
      message: `Delete the "${m.planName}" membership for ${m.partyName}? Generated invoices will not be deleted.`,
      confirmLabel: 'Delete', variant: 'danger',
    });
    if (ok) { deleteItem('memberships', m.id); showSnack('Membership deleted.'); }
    setMenuAnchor(null);
  };

  // ── Billing status badge UI ──────────────────────────────────────────────────
  const BillingBadge = ({ bState }) => {
    const { state, daysLeft, daysOverdue } = bState;
    const cfg = {
      overdue:          { label: `${daysOverdue}d overdue`, color: '#dc2626', bg: '#fee2e2' },
      due_today:        { label: 'Due today',              color: '#d97706', bg: '#fef3c7' },
      awaiting_payment: { label: 'Awaiting payment',       color: '#27272a', bg: '#dbeafe' },
      upcoming:         { label: daysLeft != null ? `Due in ${daysLeft}d` : 'Upcoming', color: '#16a34a', bg: '#dcfce7' },
      paused:           { label: 'Paused',                 color: '#6b7280', bg: '#f3f4f6' },
      cancelled:        { label: 'Cancelled',              color: '#ef4444', bg: '#fee2e2' },
    }[state] || { label: state, color: '#6b7280', bg: '#f3f4f6' };

    return (
      <Box sx={{ display: 'inline-flex', alignItems: 'center', px: 1, py: 0.3, borderRadius: 1, bgcolor: cfg.bg }}>
        <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: cfg.color, whiteSpace: 'nowrap' }}>
          {cfg.label}
        </Typography>
      </Box>
    );
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, mx: 0 }}>

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <Box sx={{
        borderRadius: 3,
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
        p: { xs: 2.5, md: 3 }, mb: 3, position: 'relative', overflow: 'hidden',
      }}>
        <Box sx={{ position: 'absolute', top: -50, right: -50, width: 200, height: 200, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5, gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.15)', display: 'flex' }}>
              <CreditCard size={20} color="white" />
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 800, color: 'white', lineHeight: 1.1 }}>Memberships</Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.65)', mt: 0.25 }}>Recurring subscriptions & billing</Typography>
            </Box>
          </Box>
          <Button variant="contained" disableElevation startIcon={<Plus size={15} />} onClick={openAdd}
            sx={{ bgcolor: 'white', color: '#111111', fontWeight: 700, borderRadius: 2, textTransform: 'none', flexShrink: 0, '&:hover': { bgcolor: 'rgba(255,255,255,0.92)' } }}>
            New Membership
          </Button>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 1.25 }}>
          {[
            { label: 'Active Members', value: activeMembers.length, color: '#bfdbfe' },
            { label: 'Invoices Due', value: dueCount, color: dueCount > 0 ? '#fde68a' : '#bbf7d0' },
            { label: 'Awaiting Payment', value: awaitingCount, color: awaitingCount > 0 ? '#fca5a5' : '#bbf7d0' },
            { label: 'Monthly Revenue', value: fmtAmt(monthlyMRR), color: '#bbf7d0' },
          ].map(({ label, value, color }) => (
            <Box key={label} sx={{ bgcolor: 'rgba(255,255,255,0.08)', borderRadius: 2, p: 1.5, border: '1px solid rgba(255,255,255,0.1)' }}>
              <Typography sx={{ color: 'rgba(255,255,255,0.55)', fontWeight: 600, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 0.5 }}>
                {label}
              </Typography>
              <Typography sx={{ color, fontWeight: 800, fontSize: { xs: '0.9rem', sm: '1.05rem' } }}>{value}</Typography>
            </Box>
          ))}
        </Box>
      </Box>

      {/* ── Filters ──────────────────────────────────────────────────────────── */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField size="small" placeholder="Search member or plan…" value={search} onChange={e => setSearch(e.target.value)}
          sx={{ flex: 1 }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search size={14} /></InputAdornment>, endAdornment: search ? <IconButton size="small" onClick={() => setSearch('')}><X size={12} /></IconButton> : null } }} />
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Status</InputLabel>
          <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} label="Status">
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="paused">Paused</MenuItem>
            <MenuItem value="cancelled">Cancelled</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      {/* ── Table ────────────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 10, color: 'text.disabled' }}>
          <CreditCard size={44} style={{ margin: '0 auto 14px', display: 'block', opacity: 0.2 }} />
          <Typography variant="h6" sx={{ fontWeight: 600, color: 'text.secondary' }}>No memberships yet</Typography>
          <Typography variant="body2" sx={{ mt: 0.5, mb: 2.5 }}>Add a membership plan to start tracking recurring billing.</Typography>
          <Button variant="contained" startIcon={<Plus size={15} />} onClick={openAdd} sx={{ textTransform: 'none', borderRadius: 2 }}>
            New Membership
          </Button>
        </Box>
      ) : (
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: alpha(primary, 0.04) }}>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.73rem', color: 'text.secondary', width: '22%' }}>MEMBER</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.73rem', color: 'text.secondary', width: '16%' }}>PLAN & AMOUNT</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.73rem', color: 'text.secondary', width: '15%' }}>BILLING STATUS</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.73rem', color: 'text.secondary', width: '12%' }}>NEXT DATE</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.73rem', color: 'text.secondary', width: '10%' }} align="center">INVOICES</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.73rem', color: 'text.secondary' }}>ACTIONS</TableCell>
                  <TableCell sx={{ width: 40 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map(m => {
                  const relSales = getMembershipSales(m);
                  const bState = getBillingState(m, relSales);
                  const paidTotal = relSales.filter(s => s.status === 'Paid').reduce((s, t) => s + (t.totalAmount || 0), 0);
                  const isActive = m.status === 'active';
                  const canInvoice = isActive && bState.state !== 'awaiting_payment';
                  const rowBg = bState.state === 'overdue' ? alpha('#dc2626', 0.03)
                    : bState.state === 'awaiting_payment' ? alpha('#27272a', 0.03)
                    : bState.state === 'due_today' ? alpha('#d97706', 0.03)
                    : 'transparent';

                  return (
                    <TableRow key={m.id} hover sx={{ bgcolor: rowBg, '&:hover': { bgcolor: rowBg ? rowBg : alpha(primary, 0.02) } }}>

                      {/* Member */}
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>{m.partyName}</Typography>
                        {m.notes && (
                          <Typography variant="caption" color="text.disabled" noWrap sx={{ display: 'block', maxWidth: 160 }}>{m.notes}</Typography>
                        )}
                      </TableCell>

                      {/* Plan & Amount */}
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: primary, lineHeight: 1.2 }}>{m.planName}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {fmtAmt(m.amount)} / {CYCLE_LABELS[m.billingCycle].toLowerCase()}
                        </Typography>
                      </TableCell>

                      {/* Billing Status */}
                      <TableCell><BillingBadge bState={bState} /></TableCell>

                      {/* Next Date */}
                      <TableCell>
                        <Typography variant="body2" sx={{
                          fontSize: '0.78rem',
                          color: bState.state === 'overdue' ? '#dc2626' : bState.state === 'due_today' ? '#d97706' : 'text.secondary',
                          fontWeight: bState.state === 'overdue' || bState.state === 'due_today' ? 600 : 400,
                        }}>
                          {fmtDate(m.nextBillingDate)}
                        </Typography>
                      </TableCell>

                      {/* Invoices count */}
                      <TableCell align="center">
                        <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                          {relSales.length}
                        </Typography>
                        {paidTotal > 0 && (
                          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', fontSize: '0.65rem' }}>
                            {fmtAmt(paidTotal)} paid
                          </Typography>
                        )}
                      </TableCell>

                      {/* Actions */}
                      <TableCell>
                        <Stack direction="row" spacing={0.75} alignItems="center">
                          {/* Awaiting Payment — primary action */}
                          {bState.state === 'awaiting_payment' && (
                            <Tooltip title={`Record payment of ${fmtAmt(bState.amount)}`}>
                              <Button
                                size="small" variant="contained" disableElevation
                                onClick={() => handleRecordPayment(m, bState)}
                                startIcon={<CheckCircle size={13} />}
                                sx={{ fontSize: '0.72rem', textTransform: 'none', borderRadius: 1.5, bgcolor: '#16a34a', '&:hover': { bgcolor: '#15803d' }, whiteSpace: 'nowrap' }}
                              >
                                Collect {fmtAmt(bState.amount)}
                              </Button>
                            </Tooltip>
                          )}

                          {/* Generate Invoice */}
                          {isActive && (
                            <Tooltip
                              title={
                                !canInvoice
                                  ? 'Unpaid invoice exists — collect payment first'
                                  : bState.state === 'overdue' ? 'Generate overdue invoice'
                                  : bState.state === 'due_today' ? 'Generate invoice for today'
                                  : 'Generate invoice for upcoming period'
                              }
                            >
                              <span>
                                <Button
                                  size="small"
                                  variant={bState.state === 'overdue' || bState.state === 'due_today' ? 'contained' : 'outlined'}
                                  disableElevation
                                  disabled={!canInvoice}
                                  onClick={() => handleGenerateInvoice(m)}
                                  startIcon={<Receipt size={13} />}
                                  sx={{
                                    fontSize: '0.72rem', textTransform: 'none', borderRadius: 1.5, whiteSpace: 'nowrap',
                                    ...(bState.state === 'overdue' || bState.state === 'due_today'
                                      ? { bgcolor: '#27272a', '&:hover': { bgcolor: '#111111' } }
                                      : {}),
                                  }}
                                >
                                  {bState.state === 'upcoming' ? 'Invoice Early' : 'Invoice Now'}
                                </Button>
                              </span>
                            </Tooltip>
                          )}
                        </Stack>
                      </TableCell>

                      {/* Row menu */}
                      <TableCell padding="none">
                        <IconButton size="small" onClick={e => { setMenuAnchor(e.currentTarget); setMenuMembership(m); }}
                          sx={{ mr: 0.5 }}>
                          <MoreVertical size={15} />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* ── Row context menu ─────────────────────────────────────────────────── */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
        PaperProps={{ sx: { minWidth: 180, borderRadius: 2, boxShadow: '0 4px 20px rgba(0,0,0,0.12)' } }}
      >
        {menuMembership && [
          <MenuItem key="edit" onClick={() => openEdit(menuMembership)}>
            <ListItemIcon><Edit2 size={15} /></ListItemIcon>
            Edit Membership
          </MenuItem>,
          <MenuItem key="pause" onClick={() => handleTogglePause(menuMembership)}>
            <ListItemIcon>
              {menuMembership.status === 'active' ? <PauseCircle size={15} /> : <PlayCircle size={15} />}
            </ListItemIcon>
            {menuMembership.status === 'active' ? 'Pause' : 'Resume'}
          </MenuItem>,
          <Divider key="div" />,
          <MenuItem key="delete" onClick={() => handleDelete(menuMembership)} sx={{ color: 'error.main' }}>
            <ListItemIcon><Trash2 size={15} color="#ef4444" /></ListItemIcon>
            Delete
          </MenuItem>,
        ]}
      </Menu>

      {/* ── Add / Edit dialog ────────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 700, pb: 0.5 }}>
          {editId ? 'Edit Membership' : 'New Membership'}
        </DialogTitle>
        <DialogContent sx={{ pt: 1.5 }}>
          <Stack spacing={2}>
            <FormControl fullWidth size="small" required>
              <InputLabel>Customer *</InputLabel>
              <Select value={form.partyId} onChange={e => setForm(f => ({ ...f, partyId: e.target.value }))} label="Customer *">
                <MenuItem value="">— Select customer —</MenuItem>
                {customers.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </Select>
            </FormControl>

            {/* Plan from Items (category = Membership) */}
            {membershipItems.length === 0 ? (
              <Alert severity="warning" sx={{ fontSize: '0.78rem', py: 0.5 }}>
                No membership plans found. Go to <strong>Items</strong> and create items with category <strong>"Membership"</strong> first.
              </Alert>
            ) : (
              <FormControl fullWidth size="small" required>
                <InputLabel>Membership Plan *</InputLabel>
                <Select
                  value={form.itemId}
                  label="Membership Plan *"
                  onChange={e => {
                    const item = membershipItems.find(i => i.id === e.target.value);
                    setForm(f => ({
                      ...f,
                      itemId: e.target.value,
                      planName: item?.name || '',
                      amount: item?.salePrice != null ? String(item.salePrice) : f.amount,
                    }));
                  }}
                >
                  <MenuItem value="">— Select plan —</MenuItem>
                  {membershipItems.map(i => (
                    <MenuItem key={i.id} value={i.id}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: 2 }}>
                        <span>{i.name}</span>
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, flexShrink: 0 }}>
                          ₹{Number(i.salePrice || 0).toLocaleString('en-IN')}
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            <Stack direction="row" spacing={1.5}>
              <TextField fullWidth size="small" label="Amount *" type="number" value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> } }} />
              <FormControl fullWidth size="small">
                <InputLabel>Cycle</InputLabel>
                <Select value={form.billingCycle} label="Cycle"
                  onChange={e => setForm(f => ({ ...f, billingCycle: e.target.value }))}>
                  {CYCLES.map(c => <MenuItem key={c} value={c}>{CYCLE_LABELS[c]}</MenuItem>)}
                </Select>
              </FormControl>
            </Stack>

            <Stack direction="row" spacing={1.5}>
              <TextField fullWidth size="small" type="date" label="Start Date" value={form.startDate}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                slotProps={{ inputLabel: { shrink: true } }} />
              <TextField fullWidth size="small" type="date" label="First Invoice Date" value={form.nextBillingDate}
                onChange={e => setForm(f => ({ ...f, nextBillingDate: e.target.value }))}
                slotProps={{ inputLabel: { shrink: true } }} />
            </Stack>

            {!editId && (
              <Alert severity="info" sx={{ py: 0.5, fontSize: '0.78rem' }}>
                "First Invoice Date" is when you'll generate the first invoice. It advances automatically after each invoice.
              </Alert>
            )}

            <TextField fullWidth size="small" label="Notes (optional)" value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} multiline rows={2} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => setDialogOpen(false)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disableElevation
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, minWidth: 120 }}>
            {editId ? 'Save Changes' : 'Add Membership'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Snackbar ─────────────────────────────────────────────────────────── */}
      <Snackbar
        open={snackbar.open} autoHideDuration={3500}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} variant="filled" sx={{ width: '100%' }}
          onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
          {snackbar.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default MembershipPage;
