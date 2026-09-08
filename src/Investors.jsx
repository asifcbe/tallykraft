import React, { useState, useMemo, useRef } from 'react';
import {
  Box, Typography, Button, Paper, Stack, Chip, IconButton, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField, MenuItem,
  alpha, useTheme, Alert, Snackbar, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, FormControl,
  InputLabel, Select, InputAdornment, Menu, ListItemIcon, Divider,
  Tabs, Tab, Autocomplete,
} from '@mui/material';
import {
  Plus, Edit2, Trash2, Handshake, Search, X, MoreVertical,
  TrendingUp, TrendingDown, Printer, Share2, ArrowDownCircle, ArrowUpCircle,
  Wallet, PieChart,
} from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import { useData } from './DataContext';
import { useBusiness } from './BusinessContext';
import { useDialog } from './DialogContext';
import ReportTemplate from './ReportTemplate';
import SendDialog from './SendDialog';
import SplitPaymentInput from './SplitPaymentInput';

// ── Helpers ───────────────────────────────────────────────────────────────────
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const fmtDate = (d) => {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
};

const fmtAmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };

const PRESETS = [
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'this_fy', label: 'This FY' },
  { key: 'custom', label: 'Custom' },
];

const getPresetRange = (key) => {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (yy, mm, dd) => `${yy}-${pad(mm + 1)}-${pad(dd)}`;
  if (key === 'this_month') {
    return { from: iso(y, m, 1), to: todayStr() };
  }
  if (key === 'last_month') {
    const lm = m === 0 ? 11 : m - 1;
    const ly = m === 0 ? y - 1 : y;
    const lastDay = new Date(ly, lm + 1, 0).getDate();
    return { from: iso(ly, lm, 1), to: iso(ly, lm, lastDay) };
  }
  if (key === 'this_fy') {
    const fyStartYear = m >= 3 ? y : y - 1; // Indian FY: Apr–Mar
    return { from: iso(fyStartYear, 3, 1), to: todayStr() };
  }
  return { from: monthStart(), to: todayStr() };
};

const emptyForm = () => ({
  name: '', phone: '', email: '', address: '',
  ownershipPercent: '', status: 'active', joinDate: todayStr(), notes: '',
});

const emptyTxnForm = () => ({
  type: 'given', amount: '', date: todayStr(), paymentMode: 'Cash',
  cashAmt: '', bankAmt: '', notes: '',
});

// ═════════════════════════════════════════════════════════════════════════════
const InvestorsPage = () => {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const { getItems, data, addItem, updateItem, deleteItem } = useData();
  const { currentBusiness } = useBusiness();
  const { confirm } = useDialog();
  const bId = currentBusiness?.id;

  const [tab, setTab] = useState(0);
  const [snackbar, setSnackbar] = useState({ open: false, msg: '', severity: 'success' });
  const showSnack = (msg, severity = 'success') => setSnackbar({ open: true, msg, severity });

  // ── Data ────────────────────────────────────────────────────────────────────
  /* eslint-disable react-hooks/exhaustive-deps */
  const investors = useMemo(() =>
    getItems('investors').filter(i => i.businessId === bId),
    [data.investors, bId]
  );
  const activeInvestors = useMemo(() => investors.filter(i => i.status === 'active'), [investors]);
  const investorPayments = useMemo(() =>
    getItems('payments').filter(p => p.businessId === bId && p.subtype === 'investorCapital'),
    [data.payments, bId]
  );
  const sales = useMemo(() => getItems('sales').filter(s => s.businessId === bId), [data.sales, bId]);
  const purchases = useMemo(() => getItems('purchases').filter(p => p.businessId === bId), [data.purchases, bId]);
  const expenses = useMemo(() => getItems('expenses').filter(e => e.businessId === bId), [data.expenses, bId]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const capitalFor = (investorId) => investorPayments.filter(p => p.investorId === investorId);
  const netCapitalFor = (investorId) => {
    const txns = capitalFor(investorId);
    const given = txns.filter(t => t.type === 'PaymentIn').reduce((s, t) => s + (t.totalAmount || 0), 0);
    const received = txns.filter(t => t.type === 'PaymentOut').reduce((s, t) => s + (t.totalAmount || 0), 0);
    return given - received;
  };

  const totalGiven = investorPayments.filter(p => p.type === 'PaymentIn').reduce((s, p) => s + (p.totalAmount || 0), 0);
  const totalReceived = investorPayments.filter(p => p.type === 'PaymentOut').reduce((s, p) => s + (p.totalAmount || 0), 0);

  const percentSum = activeInvestors.reduce((s, i) => s + (Number(i.ownershipPercent) || 0), 0);

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, mx: 0 }}>
      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <Box sx={{
        borderRadius: 3,
        background: 'linear-gradient(135deg, #134e4a 0%, #0f766e 50%, #0d9488 100%)',
        p: { xs: 2.5, md: 3 }, mb: 3, position: 'relative', overflow: 'hidden',
      }}>
        <Box sx={{ position: 'absolute', top: -50, right: -50, width: 200, height: 200, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5, gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.15)', display: 'flex' }}>
              <Handshake size={20} color="white" />
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 800, color: 'white', lineHeight: 1.1 }}>Investors</Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.65)', mt: 0.25 }}>Ownership, capital & profit/loss split</Typography>
            </Box>
          </Box>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 1.25 }}>
          {[
            { label: 'Investors', value: activeInvestors.length, color: '#bfdbfe' },
            { label: 'Capital In', value: fmtAmt(totalGiven), color: '#bbf7d0' },
            { label: 'Capital Out', value: fmtAmt(totalReceived), color: '#fde68a' },
            { label: 'Net Capital', value: fmtAmt(totalGiven - totalReceived), color: '#bbf7d0' },
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

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2.5, minHeight: 40, '& .MuiTab-root': { minHeight: 40, textTransform: 'none', fontWeight: 700, fontSize: '0.85rem' } }}>
        <Tab label="Investors" />
        <Tab label="Capital Ledger" />
        <Tab label="Profit & Loss Split" />
      </Tabs>

      {activeInvestors.length > 0 && percentSum !== 100 && (
        <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }}>
          Active investors' ownership adds up to {percentSum}%, not 100%. That's fine if the business retains the remainder — just make sure this is intentional.
        </Alert>
      )}

      {tab === 0 && (
        <InvestorsTab
          investors={investors} primary={primary}
          netCapitalFor={netCapitalFor}
          addItem={addItem} updateItem={updateItem} deleteItem={deleteItem}
          confirm={confirm} bId={bId} showSnack={showSnack}
        />
      )}
      {tab === 1 && (
        <CapitalLedgerTab
          investors={activeInvestors} primary={primary}
          capitalFor={capitalFor}
          addItem={addItem} updateItem={updateItem} deleteItem={deleteItem}
          confirm={confirm} bId={bId} showSnack={showSnack}
        />
      )}
      {tab === 2 && (
        <ProfitLossSplitTab
          investors={activeInvestors} primary={primary}
          sales={sales} purchases={purchases} expenses={expenses}
          capitalFor={capitalFor}
          currentBusiness={currentBusiness}
        />
      )}

      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snackbar.severity} sx={{ borderRadius: 2 }} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
          {snackbar.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// ── Investors tab ────────────────────────────────────────────────────────────
const InvestorsTab = ({ investors, primary, netCapitalFor, addItem, updateItem, deleteItem, confirm, bId, showSnack }) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuInvestor, setMenuInvestor] = useState(null);

  const filtered = useMemo(() => investors.filter(i => {
    if (statusFilter !== 'all' && i.status !== statusFilter) return false;
    if (search.trim() && !i.name?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }).sort((a, b) => (a.name || '').localeCompare(b.name || '')), [investors, statusFilter, search]);

  const openAdd = () => { setEditId(null); setForm(emptyForm()); setDialogOpen(true); };
  const openEdit = (i) => {
    setEditId(i.id);
    setForm({
      name: i.name, phone: i.phone || '', email: i.email || '', address: i.address || '',
      ownershipPercent: i.ownershipPercent, status: i.status, joinDate: i.joinDate || todayStr(), notes: i.notes || '',
    });
    setDialogOpen(true);
    setMenuAnchor(null);
  };

  const handleSave = () => {
    if (!form.name.trim()) { showSnack('Enter the investor\'s name.', 'error'); return; }
    if (form.ownershipPercent === '' || Number(form.ownershipPercent) < 0 || Number(form.ownershipPercent) > 100) {
      showSnack('Enter a valid ownership % between 0 and 100.', 'error'); return;
    }
    const payload = { ...form, businessId: bId, ownershipPercent: Number(form.ownershipPercent) };
    if (editId) {
      updateItem('investors', editId, payload);
      showSnack('Investor updated.');
    } else {
      addItem('investors', payload);
      showSnack('Investor added.');
    }
    setDialogOpen(false);
  };

  const handleDelete = async (i) => {
    setMenuAnchor(null);
    const ok = await confirm({
      title: 'Delete Investor?',
      message: `Delete "${i.name}"? Their recorded capital transactions will remain in the Cash/Bank ledger but will no longer be attributed to a visible investor.`,
      variant: 'danger',
    });
    if (ok) { deleteItem('investors', i.id); showSnack('Investor deleted.'); }
  };

  const toggleStatus = (i) => {
    updateItem('investors', i.id, { status: i.status === 'active' ? 'inactive' : 'active' });
    setMenuAnchor(null);
  };

  return (
    <>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField size="small" placeholder="Search investor…" value={search} onChange={e => setSearch(e.target.value)}
          sx={{ flex: 1 }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search size={14} /></InputAdornment>, endAdornment: search ? <IconButton size="small" onClick={() => setSearch('')}><X size={12} /></IconButton> : null } }} />
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Status</InputLabel>
          <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} label="Status">
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="inactive">Inactive</MenuItem>
          </Select>
        </FormControl>
        <Button variant="contained" disableElevation startIcon={<Plus size={15} />} onClick={openAdd}
          sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700, flexShrink: 0 }}>
          Add Investor
        </Button>
      </Stack>

      {filtered.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 10, color: 'text.disabled' }}>
          <Handshake size={44} style={{ margin: '0 auto 14px', display: 'block', opacity: 0.2 }} />
          <Typography variant="h6" sx={{ fontWeight: 600, color: 'text.secondary' }}>No investors yet</Typography>
          <Typography variant="body2" sx={{ mt: 0.5, mb: 2.5 }}>Add an investor to start tracking ownership and capital.</Typography>
          <Button variant="contained" startIcon={<Plus size={15} />} onClick={openAdd} sx={{ textTransform: 'none', borderRadius: 2 }}>
            Add Investor
          </Button>
        </Box>
      ) : (
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: alpha(primary, 0.04) }}>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.73rem', color: 'text.secondary' }}>NAME</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.73rem', color: 'text.secondary' }}>CONTACT</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.73rem', color: 'text.secondary' }} align="center">OWNERSHIP</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.73rem', color: 'text.secondary' }} align="right">NET CAPITAL</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.73rem', color: 'text.secondary' }} align="center">STATUS</TableCell>
                  <TableCell sx={{ width: 40 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map(i => {
                  const net = netCapitalFor(i.id);
                  return (
                    <TableRow key={i.id} hover>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem' }}>{i.name}</TableCell>
                      <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>{i.phone || i.email || '—'}</TableCell>
                      <TableCell align="center">
                        <Chip label={`${i.ownershipPercent}%`} size="small" sx={{ fontWeight: 800, bgcolor: alpha(primary, 0.1), color: primary }} />
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.85rem', color: net >= 0 ? '#059669' : '#dc2626' }}>
                        {fmtAmt(net)}
                      </TableCell>
                      <TableCell align="center">
                        <Chip label={i.status === 'active' ? 'Active' : 'Inactive'} size="small"
                          sx={{ fontWeight: 700, fontSize: '0.68rem', bgcolor: i.status === 'active' ? alpha('#059669', 0.1) : alpha('#94a3b8', 0.15), color: i.status === 'active' ? '#059669' : '#64748b' }} />
                      </TableCell>
                      <TableCell>
                        <IconButton size="small" onClick={(e) => { setMenuAnchor(e.currentTarget); setMenuInvestor(i); }}>
                          <MoreVertical size={16} />
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

      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
        <MenuItem onClick={() => openEdit(menuInvestor)}><ListItemIcon><Edit2 size={15} /></ListItemIcon>Edit</MenuItem>
        <MenuItem onClick={() => toggleStatus(menuInvestor)}>
          <ListItemIcon>{menuInvestor?.status === 'active' ? <X size={15} /> : <Handshake size={15} />}</ListItemIcon>
          {menuInvestor?.status === 'active' ? 'Deactivate' : 'Reactivate'}
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => handleDelete(menuInvestor)} sx={{ color: 'error.main' }}>
          <ListItemIcon><Trash2 size={15} color="#dc2626" /></ListItemIcon>Delete
        </MenuItem>
      </Menu>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>{editId ? 'Edit Investor' : 'Add Investor'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.75, pt: 1.5 }}>
          <TextField size="small" label="Name" fullWidth value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
          <TextField size="small" label="Phone" fullWidth value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 15) }))} />
          <TextField size="small" label="Email" fullWidth value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          <TextField size="small" label="Address" fullWidth multiline rows={2} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
          <TextField size="small" label="Ownership %" type="number" fullWidth value={form.ownershipPercent}
            onChange={e => setForm(f => ({ ...f, ownershipPercent: e.target.value }))}
            slotProps={{ htmlInput: { min: 0, max: 100, step: 0.01 }, input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }} />
          <TextField size="small" label="Join Date" type="date" fullWidth value={form.joinDate}
            onChange={e => setForm(f => ({ ...f, joinDate: e.target.value }))} slotProps={{ inputLabel: { shrink: true } }} />
          <FormControl size="small" fullWidth>
            <InputLabel>Status</InputLabel>
            <Select value={form.status} label="Status" onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="inactive">Inactive</MenuItem>
            </Select>
          </FormControl>
          <TextField size="small" label="Notes (optional)" fullWidth value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => setDialogOpen(false)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" disableElevation onClick={handleSave} sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}>
            {editId ? 'Save Changes' : 'Add Investor'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// ── Capital Ledger tab ───────────────────────────────────────────────────────
const CapitalLedgerTab = ({ investors, primary, capitalFor, addItem, updateItem, deleteItem, confirm, bId, showSnack }) => {
  const [selectedId, setSelectedId] = useState(investors[0]?.id || '');
  const selected = investors.find(i => i.id === selectedId) || null;

  const [txnDialog, setTxnDialog] = useState(false);
  const [editTxnId, setEditTxnId] = useState(null);
  const [form, setForm] = useState(emptyTxnForm());

  const txns = useMemo(() => selected ? capitalFor(selected.id).sort((a, b) => (a.date || '').localeCompare(b.date || '')) : [], [selected, capitalFor]);

  const ledgerRows = useMemo(() => {
    let running = 0;
    return txns.map(t => {
      running += t.type === 'PaymentIn' ? (t.totalAmount || 0) : -(t.totalAmount || 0);
      return { ...t, runningBalance: running };
    });
  }, [txns]);

  const openAddTxn = () => { setEditTxnId(null); setForm(emptyTxnForm()); setTxnDialog(true); };
  const openEditTxn = (t) => {
    setEditTxnId(t.id);
    setForm({
      type: t.type === 'PaymentIn' ? 'given' : 'received',
      amount: t.paymentMode === 'Split' ? '' : String(t.totalAmount),
      date: t.date, paymentMode: t.paymentMode,
      cashAmt: t.paymentMode === 'Split' ? String(t.paymentSplit?.cash || '') : '',
      bankAmt: t.paymentMode === 'Split' ? String(t.paymentSplit?.bank || '') : '',
      notes: t.notes || '',
    });
    setTxnDialog(true);
  };

  const handleSaveTxn = () => {
    if (!selected) return;
    const isSplit = form.paymentMode === 'Split';
    const amount = isSplit ? (Number(form.cashAmt) || 0) + (Number(form.bankAmt) || 0) : Number(form.amount) || 0;
    if (amount <= 0) { showSnack('Enter a valid amount.', 'error'); return; }
    const payload = {
      businessId: bId,
      partyId: selected.id, // satisfies addItem's payments guard — investors aren't real parties
      partyName: selected.name,
      type: form.type === 'given' ? 'PaymentIn' : 'PaymentOut',
      totalAmount: amount,
      date: form.date || todayStr(),
      paymentMode: form.paymentMode,
      ...(isSplit ? { paymentSplit: { cash: Number(form.cashAmt) || 0, bank: Number(form.bankAmt) || 0, bankMode: 'Bank' } } : {}),
      referenceNo: `INV-${String(selected.id).slice(-6).toUpperCase()}`,
      notes: form.notes || '',
      subtype: 'investorCapital',
      investorId: selected.id,
    };
    if (editTxnId) {
      updateItem('payments', editTxnId, payload);
      showSnack('Transaction updated.');
    } else {
      addItem('payments', payload);
      showSnack(form.type === 'given' ? 'Capital recorded.' : 'Payout recorded.');
    }
    setTxnDialog(false);
  };

  const handleDeleteTxn = async (t) => {
    const ok = await confirm({ title: 'Delete Transaction?', message: 'This will remove the transaction from Cash/Bank balance too.', variant: 'danger' });
    if (ok) { deleteItem('payments', t.id); showSnack('Transaction deleted.'); }
  };

  if (investors.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 10, color: 'text.disabled' }}>
        <Wallet size={44} style={{ margin: '0 auto 14px', display: 'block', opacity: 0.2 }} />
        <Typography variant="h6" sx={{ fontWeight: 600, color: 'text.secondary' }}>No active investors</Typography>
        <Typography variant="body2">Add an investor first in the Investors tab.</Typography>
      </Box>
    );
  }

  return (
    <>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2, alignItems: { sm: 'center' } }}>
        <FormControl size="small" sx={{ minWidth: 240 }}>
          <InputLabel>Investor</InputLabel>
          <Select value={selectedId} label="Investor" onChange={e => setSelectedId(e.target.value)}>
            {investors.map(i => <MenuItem key={i.id} value={i.id}>{i.name} ({i.ownershipPercent}%)</MenuItem>)}
          </Select>
        </FormControl>
        <Button variant="contained" disableElevation startIcon={<Plus size={15} />} onClick={openAddTxn} disabled={!selected}
          sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700 }}>
          Record Transaction
        </Button>
      </Stack>

      {selected && (
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: alpha(primary, 0.04) }}>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.73rem', color: 'text.secondary' }}>DATE</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.73rem', color: 'text.secondary' }}>TYPE</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.73rem', color: 'text.secondary' }}>MODE</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.73rem', color: 'text.secondary' }}>NOTES</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.73rem', color: 'text.secondary' }} align="right">AMOUNT</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.73rem', color: 'text.secondary' }} align="right">BALANCE</TableCell>
                  <TableCell sx={{ width: 80 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {ledgerRows.length === 0 ? (
                  <TableRow><TableCell colSpan={7} sx={{ textAlign: 'center', py: 4, color: 'text.disabled' }}>No transactions yet.</TableCell></TableRow>
                ) : ledgerRows.map(t => (
                  <TableRow key={t.id} hover>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{fmtDate(t.date)}</TableCell>
                    <TableCell>
                      <Chip
                        icon={t.type === 'PaymentIn' ? <ArrowDownCircle size={13} /> : <ArrowUpCircle size={13} />}
                        label={t.type === 'PaymentIn' ? 'Given' : 'Received'} size="small"
                        sx={{ fontWeight: 700, fontSize: '0.68rem', bgcolor: t.type === 'PaymentIn' ? alpha('#059669', 0.1) : alpha('#dc2626', 0.1), color: t.type === 'PaymentIn' ? '#059669' : '#dc2626' }} />
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>{t.paymentMode}</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>{t.notes || '—'}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.85rem', color: t.type === 'PaymentIn' ? '#059669' : '#dc2626' }}>
                      {t.type === 'PaymentIn' ? '+' : '−'}{fmtAmt(t.totalAmount)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>{fmtAmt(t.runningBalance)}</TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5}>
                        <IconButton size="small" onClick={() => openEditTxn(t)}><Edit2 size={14} /></IconButton>
                        <IconButton size="small" onClick={() => handleDeleteTxn(t)}><Trash2 size={14} color="#dc2626" /></IconButton>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      <Dialog open={txnDialog} onClose={() => setTxnDialog(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>{editTxnId ? 'Edit Transaction' : 'Record Transaction'} — {selected?.name}</DialogTitle>
        <DialogContent sx={{ pt: 1.5 }}>
          <Box sx={{ display: 'flex', gap: 0.75, mb: 2 }}>
            {[{ v: 'given', label: 'Amount Given' }, { v: 'received', label: 'Amount Received' }].map(({ v, label }) => (
              <Box key={v} onClick={() => setForm(f => ({ ...f, type: v }))}
                sx={{
                  flex: 1, py: 0.9, textAlign: 'center', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem',
                  border: '1.5px solid', transition: 'all 0.12s',
                  borderColor: form.type === v ? primary : '#e5e7eb',
                  bgcolor: form.type === v ? alpha(primary, 0.08) : '#fafafa',
                  color: form.type === v ? primary : '#64748b',
                }}>
                {label}
              </Box>
            ))}
          </Box>

          <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151', mb: 0.75 }}>Payment Mode</Typography>
          <Box sx={{ display: 'flex', gap: 0.75, mb: 2 }}>
            {['Cash', 'Bank', 'Split'].map(mode => (
              <Box key={mode} onClick={() => setForm(f => ({ ...f, paymentMode: mode }))}
                sx={{
                  flex: 1, py: 0.75, textAlign: 'center', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem',
                  border: '1.5px solid', transition: 'all 0.12s',
                  borderColor: form.paymentMode === mode ? primary : '#e5e7eb',
                  bgcolor: form.paymentMode === mode ? alpha(primary, 0.08) : '#fafafa',
                  color: form.paymentMode === mode ? primary : '#64748b',
                }}>
                {mode}
              </Box>
            ))}
          </Box>

          {form.paymentMode === 'Split' ? (
            <Box sx={{ mb: 2 }}>
              <SplitPaymentInput
                cash={form.cashAmt} onCashChange={v => setForm(f => ({ ...f, cashAmt: v }))}
                bank={form.bankAmt} onBankChange={v => setForm(f => ({ ...f, bankAmt: v }))}
                accentColor={primary}
              />
            </Box>
          ) : (
            <TextField size="small" label="Amount" type="number" fullWidth sx={{ mb: 2 }}
              value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> } }} />
          )}

          <TextField size="small" label="Date" type="date" fullWidth sx={{ mb: 1.5 }}
            value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" label="Notes (optional)" fullWidth
            value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => setTxnDialog(false)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" disableElevation onClick={handleSaveTxn} sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}>
            {editTxnId ? 'Save Changes' : 'Record'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// ── Profit & Loss Split tab ──────────────────────────────────────────────────
const ProfitLossSplitTab = ({ investors, primary, sales, purchases, expenses, capitalFor, currentBusiness }) => {
  const [preset, setPreset] = useState('this_month');
  const [range, setRange] = useState(() => getPresetRange('this_month'));
  const [sendOpen, setSendOpen] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const printRef = useRef(null);
  const _shareInFlight = useRef(false);

  const applyPreset = (key) => {
    setPreset(key);
    if (key !== 'custom') setRange(getPresetRange(key));
  };

  const periodLabel = useMemo(() => {
    const p = PRESETS.find(p => p.key === preset);
    return preset === 'custom' ? `${range.from} to ${range.to}` : (p?.label || '');
  }, [preset, range]);

  // Net profit for the selected range — same formula as Reports.jsx's Profit & Loss report
  // (Σsales.totalAmount − Σpurchases.totalAmount − Σexpenses.amount). Duplicated locally
  // since Reports.jsx exports no reusable helper (single `export default ReportsPage`).
  const { revenue, cogs, totalExpenses, netProfit } = useMemo(() => {
    const inRange = (d) => d >= range.from && d <= range.to;
    const revenue = sales.filter(s => inRange(s.date)).reduce((a, s) => a + (s.totalAmount || 0), 0);
    const cogs = purchases.filter(p => inRange(p.date)).reduce((a, p) => a + (p.totalAmount || 0), 0);
    const totalExpenses = expenses.filter(e => inRange(e.date)).reduce((a, e) => a + (Number(e.amount) || 0), 0);
    return { revenue, cogs, totalExpenses, netProfit: revenue - cogs - totalExpenses };
  }, [sales, purchases, expenses, range]);

  const isLoss = netProfit < 0;
  const percentSum = investors.reduce((s, i) => s + (Number(i.ownershipPercent) || 0), 0);
  const unallocatedPercent = Math.max(0, 100 - percentSum);

  const splitRows = useMemo(() => investors.map(inv => ({
    investor: inv,
    percent: Number(inv.ownershipPercent) || 0,
    share: netProfit * (Number(inv.ownershipPercent) || 0) / 100,
  })).sort((a, b) => b.percent - a.percent), [investors, netProfit]);

  const reportData = useMemo(() => {
    const columns = [
      { key: 'label', header: 'Investor', align: 'left' },
      { key: 'percent', header: 'Ownership %', align: 'center' },
      { key: 'share', header: `Share Amount (₹)`, align: 'right', isTotal: true },
    ];
    const summaryRows = [
      { label: 'Revenue', percent: '', share: fmtAmt(revenue), _bold: true, _section: true },
      { label: 'Purchases', percent: '', share: fmtAmt(cogs), _section: true },
      { label: 'Expenses', percent: '', share: fmtAmt(totalExpenses), _section: true },
      { label: isLoss ? 'Net Loss' : 'Net Profit', percent: '', share: fmtAmt(Math.abs(netProfit)), _bold: true, _color: isLoss ? '#dc2626' : '#059669', _section: true },
    ];
    const investorRows = splitRows.map(r => ({
      label: r.investor.name,
      percent: `${r.percent}%`,
      share: r.share < 0 ? `(${fmtAmt(Math.abs(r.share))})` : fmtAmt(r.share),
      _color: r.share < 0 ? '#dc2626' : undefined,
    }));
    const unallocatedRow = unallocatedPercent > 0 ? [{
      label: 'Unallocated (retained by business)',
      percent: `${unallocatedPercent}%`,
      share: fmtAmt(netProfit * unallocatedPercent / 100),
      _color: '#94a3b8',
    }] : [];
    return {
      columns,
      rows: [...summaryRows, ...investorRows, ...unallocatedRow],
      totals: {},
      title: `Investor Profit & Loss Split — ${periodLabel}`,
    };
  }, [revenue, cogs, totalExpenses, netProfit, isLoss, splitRows, unallocatedPercent, periodLabel]);

  const handlePrint = useReactToPrint({ contentRef: printRef });

  const buildMessage = () => {
    const lines = [
      `*Investor Profit & Loss Split — ${currentBusiness?.name || 'Business'}*`,
      `Period: ${periodLabel}`,
      '',
      isLoss ? `*Net Loss: ${fmtAmt(Math.abs(netProfit))}*` : `*Net Profit: ${fmtAmt(netProfit)}*`,
      '',
    ];
    splitRows.forEach(r => {
      lines.push(`${r.investor.name} (${r.percent}%): ${r.share < 0 ? `(${fmtAmt(Math.abs(r.share))})` : fmtAmt(r.share)}`);
    });
    lines.push('', '_Sent via TallyKraft_');
    return lines.join('\n');
  };

  const handleSharePDF = async () => {
    if (!printRef.current || _shareInFlight.current) return;
    _shareInFlight.current = true;
    setShareLoading(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf').then(m => ({ jsPDF: m.jsPDF })),
      ]);
      const canvas = await html2canvas(printRef.current, { scale: 1.5, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      const pdfWidthMm = 210;
      const pdfHeightMm = (canvas.height * pdfWidthMm) / canvas.width;
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidthMm, pdfHeightMm);
      const fileName = `investor-pl-split-${range.from}-to-${range.to}.pdf`;
      const pdfBlob = pdf.output('blob');
      const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: fileName });
      } else {
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url; a.download = fileName; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setShareLoading(false);
      _shareInFlight.current = false;
    }
  };

  if (investors.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 10, color: 'text.disabled' }}>
        <PieChart size={44} style={{ margin: '0 auto 14px', display: 'block', opacity: 0.2 }} />
        <Typography variant="h6" sx={{ fontWeight: 600, color: 'text.secondary' }}>No active investors</Typography>
        <Typography variant="body2">Add an investor first to see a profit/loss split.</Typography>
      </Box>
    );
  }

  return (
    <>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2.5, alignItems: { sm: 'center' }, flexWrap: 'wrap' }}>
        <Stack direction="row" spacing={0.75}>
          {PRESETS.map(p => (
            <Chip key={p.key} label={p.label} clickable onClick={() => applyPreset(p.key)}
              sx={{ fontWeight: 700, fontSize: '0.75rem', bgcolor: preset === p.key ? primary : alpha(primary, 0.08), color: preset === p.key ? '#fff' : primary }} />
          ))}
        </Stack>
        {preset === 'custom' && (
          <Stack direction="row" spacing={1}>
            <TextField size="small" type="date" label="From" value={range.from} onChange={e => setRange(r => ({ ...r, from: e.target.value }))} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField size="small" type="date" label="To" value={range.to} onChange={e => setRange(r => ({ ...r, to: e.target.value }))} slotProps={{ inputLabel: { shrink: true } }} />
          </Stack>
        )}
        <Box sx={{ flex: 1 }} />
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" startIcon={<Printer size={14} />} onClick={handlePrint} sx={{ textTransform: 'none', borderRadius: 2 }}>Print</Button>
          <Button size="small" variant="outlined" startIcon={<Share2 size={14} />} onClick={() => setSendOpen(true)} sx={{ textTransform: 'none', borderRadius: 2 }}>Share</Button>
        </Stack>
      </Stack>

      {/* Profit/Loss banner */}
      <Box sx={{
        p: 2, borderRadius: 2, mb: 2.5, display: 'flex', alignItems: 'center', gap: 1.5,
        bgcolor: isLoss ? alpha('#dc2626', 0.06) : alpha('#059669', 0.06),
        border: '1px solid', borderColor: isLoss ? alpha('#dc2626', 0.2) : alpha('#059669', 0.2),
      }}>
        {isLoss ? <TrendingDown size={24} color="#dc2626" /> : <TrendingUp size={24} color="#059669" />}
        <Box>
          <Typography sx={{ fontWeight: 800, fontSize: '1.1rem', color: isLoss ? '#dc2626' : '#059669' }}>
            {isLoss ? 'Net Loss' : 'Net Profit'}: {fmtAmt(Math.abs(netProfit))}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {isLoss
              ? 'This period resulted in a loss — shares below represent each investor\'s loss allocation, not a payout.'
              : `Revenue ${fmtAmt(revenue)} − Purchases ${fmtAmt(cogs)} − Expenses ${fmtAmt(totalExpenses)}`}
          </Typography>
        </Box>
      </Box>

      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: alpha(primary, 0.04) }}>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.73rem', color: 'text.secondary' }}>INVESTOR</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.73rem', color: 'text.secondary' }} align="center">OWNERSHIP %</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.73rem', color: 'text.secondary' }} align="right">{isLoss ? 'LOSS SHARE' : 'PROFIT SHARE'}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {splitRows.map(r => (
                <TableRow key={r.investor.id} hover>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem' }}>{r.investor.name}</TableCell>
                  <TableCell align="center">
                    <Chip label={`${r.percent}%`} size="small" sx={{ fontWeight: 800, bgcolor: alpha(primary, 0.1), color: primary }} />
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800, fontSize: '0.9rem', color: r.share < 0 ? '#dc2626' : '#059669' }}>
                    {r.share < 0 ? `(${fmtAmt(Math.abs(r.share))})` : fmtAmt(r.share)}
                  </TableCell>
                </TableRow>
              ))}
              {unallocatedPercent > 0 && (
                <TableRow>
                  <TableCell sx={{ fontStyle: 'italic', color: 'text.disabled', fontSize: '0.8rem' }}>Unallocated (retained by business)</TableCell>
                  <TableCell align="center"><Chip label={`${unallocatedPercent}%`} size="small" sx={{ fontWeight: 700, bgcolor: alpha('#94a3b8', 0.12), color: '#64748b' }} /></TableCell>
                  <TableCell align="right" sx={{ color: 'text.disabled', fontSize: '0.85rem' }}>{fmtAmt(netProfit * unallocatedPercent / 100)}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Hidden printable template */}
      <Box sx={{ display: 'none' }}>
        <ReportTemplate
          ref={printRef}
          reportData={reportData}
          business={currentBusiness}
          filters={{ periodLabel }}
          title={reportData.title}
        />
      </Box>

      <SendDialog
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        party={null}
        businessName={currentBusiness?.name || 'Business'}
        initialMessage={buildMessage()}
        onSharePDF={handleSharePDF}
        shareLoading={shareLoading}
        dialogTitle="Share Profit & Loss Split"
      />
    </>
  );
};

export default InvestorsPage;
