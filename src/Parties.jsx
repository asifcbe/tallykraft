import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Box, Button, Card, CardContent, Typography, TextField, Dialog,
  DialogTitle, DialogContent, DialogActions, Grid, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, IconButton,
  Chip, InputAdornment, MenuItem, TablePagination,
  Snackbar, Alert, Avatar, Tooltip, alpha, useTheme, useMediaQuery, Menu, Divider,
  FormControl, InputLabel, Select, Collapse
} from '@mui/material';
import { Plus, Search, Edit2, Trash2, Users, TrendingUp, TrendingDown, UserCheck, Store, Upload, Download, LayoutList, MoreHorizontal, Tag, X, FolderOpen, ChevronsUpDown, Landmark, Phone, MapPin, BadgeCheck, Building2, CreditCard, Hash, CheckSquare, Filter } from 'lucide-react';
import { useBusiness } from './BusinessContext';
import { useData } from './DataContext';
import { useI18n } from './i18n/I18nContext';
import { useDialog } from './DialogContext';
import ImportDialog from './ImportDialog';
import BulkAddDialog from './BulkAddDialog';
import BulkEditDialog from './BulkEditDialog';
import { exportToExcel, PARTY_COLUMNS } from './exportUtils';
import { COUNTRY_CODES, CUSTOMER_CATEGORIES, VENDOR_CATEGORIES, loadCustomCategories, saveCustomCategories, generatePartyId } from './partyUtils';
import PartyFormDialog from './PartyFormDialog';
import CustomerPreviewPanel from './CustomerPreviewPanel';
import { useFillHeight } from './TxListView';
import { useSubscription } from './SubscriptionContext';

const PartiesPage = () => {
  const { currentBusiness } = useBusiness();
  const { data, addItem, addItems, updateItem, deleteItem, getItems } = useData();
  const { confirm } = useDialog();
  const { t } = useI18n();
  // TallyKraft billing: data-layer already blocks writes when inactive; this
  // greys the primary add CTA.
  const { isBusinessActive } = useSubscription();
  const canWrite = isBusinessActive(currentBusiness?.id);
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [editingParty, setEditingParty] = useState(null);
  const [formData, setFormData] = useState({
    name: '', type: 'Customer', phone: '', countryCode: '+91', gstNumber: '', address: '', balance: '', category: '', partyId: '',
    bankName: '', accountNumber: '', ifscCode: '', accountHolderName: '',
  });
  const [showBankDetails, setShowBankDetails] = useState(false);
  // balanceDir: 'collect' means money owed TO us, 'pay' means we owe them
  const [balanceDir, setBalanceDir] = useState('collect');
  const [balanceAmt, setBalanceAmt] = useState('');

  const [filters, setFilters] = useState({
    balanceMin: '', balanceMax: '', hasGST: 'all', category: 'all', sortBy: 'name', sortOrder: 'asc', balanceType: 'all'
  });
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'error' });
  const [selectedParty, setSelectedParty] = useState(null);
  const [moreMenuAnchor, setMoreMenuAnchor] = useState(null);
  const [catManagerOpen, setCatManagerOpen] = useState(false);
  const [catManagerTab, setCatManagerTab] = useState('Customer');
  const [catManagerInput, setCatManagerInput] = useState('');
  const [customCatCustomer, setCustomCatCustomer] = useState([]);
  const [customCatVendor, setCustomCatVendor] = useState([]);
  const [newCatInput, setNewCatInput] = useState('');
  const [showNewCatInput, setShowNewCatInput] = useState(false);
  const newCatRef = useRef(null);
  const importBatchRef = useRef([]);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  // Bounds the party list/table to the remaining viewport so pagination
  // stays visible with no extra outer-page scroll.
  const listContainerRef = useRef(null);
  const listFillHeight = useFillHeight(listContainerRef, { bottomGap: 16, fallbackPx: 500 });
  // Memoized: with thousands of parties, re-running filter/sort on every
  // render (tab switches, unrelated state changes) caused visible lag.
  const parties = useMemo(
    () => getItems('parties').filter(p => p.businessId === currentBusiness?.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.parties, currentBusiness?.id]
  );
  const customers = useMemo(() => parties.filter(p => p.type === 'Customer'), [parties]);
  const vendors = useMemo(() => parties.filter(p => p.type === 'Vendor'), [parties]);
  const totalReceivable = useMemo(() => customers.reduce((s, p) => s + Math.max(0, p.balance || 0), 0), [customers]);
  const totalPayable = useMemo(() => vendors.reduce((s, p) => s + Math.max(0, -(p.balance || 0)), 0), [vendors]);

  // Items-bought-per-party lookup — built once as a Map keyed by partyId,
  // scanning sales/purchases a single time rather than re-scanning on every
  // party click. Depends on the raw `data.sales`/`data.purchases` array
  // reference (not `getItems`, whose identity churns on every unrelated
  // table mutation) so this only recomputes when those tables actually
  // change — same pattern as Items.jsx's topCustomersByItemId.
  const itemsByPartyId = useMemo(() => {
    const build = (table, type) => {
      const map = new Map();
      const rows = getItems(table).filter(t => t.businessId === currentBusiness?.id && t.type === type);
      for (const tx of rows) {
        if (!tx.partyId) continue;
        if (!map.has(tx.partyId)) map.set(tx.partyId, new Map());
        const perItem = map.get(tx.partyId);
        for (const line of tx.items || []) {
          const key = line.itemId || line.name;
          if (!key) continue;
          if (!perItem.has(key)) perItem.set(key, { itemId: line.itemId, name: line.name, qty: 0, orders: 0, amount: 0 });
          const entry = perItem.get(key);
          entry.qty += Number(line.qty) || 0;
          entry.amount += Number(line.total) || (Number(line.qty) || 0) * (Number(line.price) || 0);
          entry.orders += 1;
        }
      }
      return map;
    };
    return { customer: build('sales', 'Sales'), vendor: build('purchases', 'Purchase') };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.sales, data.purchases, currentBusiness?.id]);

  // Top items bought by a given party, sorted by qty — O(1) map lookup +
  // a small sort over just that party's own items, never a re-scan.
  const getItemsBoughtByParty = (partyId, isVendor, limit = 8) => {
    const perItem = (isVendor ? itemsByPartyId.vendor : itemsByPartyId.customer).get(partyId);
    if (!perItem) return [];
    return Array.from(perItem.values()).sort((a, b) => b.qty - a.qty).slice(0, limit);
  };

  // Load persisted custom categories when business is known
  useEffect(() => {
    if (!currentBusiness?.id) return;
    setCustomCatCustomer(loadCustomCategories(currentBusiness.id, 'Customer'));
    setCustomCatVendor(loadCustomCategories(currentBusiness.id, 'Vendor'));
  }, [currentBusiness?.id]);

  const customCats = formData.type === 'Customer' ? customCatCustomer : customCatVendor;
  const builtinCategories = formData.type === 'Customer' ? CUSTOMER_CATEGORIES : VENDOR_CATEGORIES;
  // Merged list for the form (used while dialog is open)
  const allFormCategories = [...builtinCategories, ...customCats.filter(c => !builtinCategories.includes(c))];

  // Merged list for the filter panel (tab-aware)
  const filterBuiltin = tab === 0 ? CUSTOMER_CATEGORIES : VENDOR_CATEGORIES;
  const filterCustom = tab === 0 ? customCatCustomer : customCatVendor;
  const allFilterCategories = [...filterBuiltin, ...filterCustom.filter(c => !filterBuiltin.includes(c))];

  const handleAddCustomCategory = () => {
    const name = newCatInput.trim();
    if (!name || !currentBusiness?.id) return;
    const type = formData.type;
    const existing = type === 'Customer' ? customCatCustomer : customCatVendor;
    if ([...builtinCategories, ...existing].some(c => c.toLowerCase() === name.toLowerCase())) {
      setFormData({ ...formData, category: name });
      setShowNewCatInput(false);
      setNewCatInput('');
      return;
    }
    const updated = [...existing, name];
    if (type === 'Customer') { setCustomCatCustomer(updated); saveCustomCategories(currentBusiness.id, 'Customer', updated); }
    else { setCustomCatVendor(updated); saveCustomCategories(currentBusiness.id, 'Vendor', updated); }
    setFormData({ ...formData, category: name });
    setShowNewCatInput(false);
    setNewCatInput('');
  };

  const handleDeleteCustomCategory = (cat, type) => {
    if (!currentBusiness?.id) return;
    if (type === 'Customer') {
      const updated = customCatCustomer.filter(c => c !== cat);
      setCustomCatCustomer(updated);
      saveCustomCategories(currentBusiness.id, 'Customer', updated);
    } else {
      const updated = customCatVendor.filter(c => c !== cat);
      setCustomCatVendor(updated);
      saveCustomCategories(currentBusiness.id, 'Vendor', updated);
    }
  };

  const currentCategories = tab === 0 ? CUSTOMER_CATEGORIES : VENDOR_CATEGORIES;
  const usedCategories = useMemo(() => {
    const tabParties = tab === 0 ? customers : vendors;
    return [...new Set(tabParties.map(p => p.category).filter(Boolean))];
  }, [customers, vendors, tab]);

  const filteredParties = useMemo(() => parties
    .filter(p => {
      const matchesSearch =
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.phone || '').includes(search) ||
        (p.altPhone || '').includes(search) ||
        (p.partyId || '').toLowerCase().includes(search.toLowerCase());
      const matchesTab = tab === 0 ? p.type === 'Customer' : p.type === 'Vendor';
      const matchesBalanceMin = !filters.balanceMin || p.balance >= parseFloat(filters.balanceMin);
      const matchesBalanceMax = !filters.balanceMax || p.balance <= parseFloat(filters.balanceMax);
      const matchesGST = filters.hasGST === 'all' ||
        (filters.hasGST === 'yes' && p.gstNumber) ||
        (filters.hasGST === 'no' && !p.gstNumber);
      const matchesCategory = filters.category === 'all' || p.category === filters.category;
      const bal = p.balance || 0;
      const isCollect = p.type === 'Customer' ? bal > 0 : bal > 0;
      const isPay = p.type === 'Customer' ? bal < 0 : bal < 0;
      const matchesBalanceType = filters.balanceType === 'all' ||
        (filters.balanceType === 'collect' && isCollect) ||
        (filters.balanceType === 'pay' && isPay);
      return matchesSearch && matchesTab && matchesBalanceMin && matchesBalanceMax && matchesGST && matchesCategory && matchesBalanceType;
    })
    .sort((a, b) => {
      let aValue, bValue;
      switch (filters.sortBy) {
        case 'balance': aValue = a.balance; bValue = b.balance; break;
        case 'phone': aValue = a.phone; bValue = b.phone; break;
        default: aValue = a.name.toLowerCase(); bValue = b.name.toLowerCase();
      }
      return filters.sortOrder === 'desc' ? (aValue < bValue ? 1 : -1) : (aValue > bValue ? 1 : -1);
    }), [parties, search, tab, filters]);

  useEffect(() => { setPage(0); setSelectedParty(null); }, [search, tab, filters]);

  const handleOpen = (party = null) => {
    if (party) {
      setEditingParty(party);
      setFormData({ countryCode: '+91', bankName: '', accountNumber: '', ifscCode: '', accountHolderName: '', ...party });
      const bal = Number(party.balance) || 0;
      const isCustomer = party.type === 'Customer';
      // For customers: positive bal = To Collect; for vendors: negative bal = To Pay (they owe us nothing, we owe them)
      const isCollect = isCustomer ? bal >= 0 : bal > 0;
      setBalanceDir(bal === 0 ? 'collect' : (isCollect ? 'collect' : 'pay'));
      setBalanceAmt(bal === 0 ? '' : String(Math.abs(bal)));
      setShowBankDetails(!!(party.bankName || party.accountNumber || party.ifscCode || party.accountHolderName));
    } else {
      setEditingParty(null);
      setFormData({ name: '', type: tab === 0 ? 'Customer' : 'Vendor', phone: '', countryCode: '+91', gstNumber: '', address: '', balance: '', category: '', partyId: '', bankName: '', accountNumber: '', ifscCode: '', accountHolderName: '' });
      setBalanceDir('collect');
      setBalanceAmt('');
      setShowBankDetails(false);
    }
    setOpen(true);
  };

  const handleClose = () => { setOpen(false); setShowNewCatInput(false); setNewCatInput(''); };

  const showSnackbar = (message, severity = 'error') => setSnackbar({ open: true, message, severity });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentBusiness?.id) { showSnackbar('Business not selected. Please refresh and try again.', 'error'); return; }
    if (!formData.name || formData.name.trim() === '') { showSnackbar('Please enter a party name', 'warning'); return; }

    try {
      const partyId = editingParty?.partyId || generatePartyId(formData.type, parties);
      const absAmt = Math.abs(Number(balanceAmt) || 0);
      // Customer: collect = positive, pay = negative
      // Vendor:   collect = positive, pay = negative (same sign logic — getBalanceChip handles display)
      const signedBalance = balanceDir === 'pay' ? -absAmt : absAmt;
      const partyData = {
        ...formData,
        businessId: currentBusiness.id,
        name: formData.name.trim(),
        balance: signedBalance,
        partyId,
      };

      let saved;
      if (editingParty) {
        saved = await updateItem('parties', editingParty.id, partyData);
      } else {
        saved = await addItem('parties', partyData);
      }

      if (!saved) {
        const savedParty = getItems('parties').find(p =>
          p.name === partyData.name &&
          p.businessId === partyData.businessId &&
          (!editingParty || p.id === editingParty.id)
        );
        if (!savedParty) { showSnackbar('Failed to save party. Please check your connection and try again.', 'error'); return; }
      }

      showSnackbar(editingParty ? 'Party updated successfully!' : 'Party added successfully!', 'success');
      handleClose();
    } catch (error) {
      console.error('Error saving party:', error);
      showSnackbar('An error occurred while saving. Please try again.', 'error');
    }
  };

  const handleDelete = async (id) => {
    const party = parties.find(p => p.id === id);
    if (!party) return;
    const ok = await confirm({ title: `Delete "${party.name}"`, message: 'This party will be permanently deleted. All associated balance data will be lost.', confirmLabel: 'Delete', variant: 'danger' });
    if (ok) { await deleteItem('parties', id); showSnackbar('Party deleted successfully!', 'success'); }
  };

  const handleCatManagerAdd = () => {
    const name = catManagerInput.trim();
    if (!name || !currentBusiness?.id) return;
    const builtins = catManagerTab === 'Customer' ? CUSTOMER_CATEGORIES : VENDOR_CATEGORIES;
    const current = catManagerTab === 'Customer' ? customCatCustomer : customCatVendor;
    if ([...builtins, ...current].some(c => c.toLowerCase() === name.toLowerCase())) {
      setCatManagerInput('');
      return;
    }
    const updated = [...current, name];
    if (catManagerTab === 'Customer') { setCustomCatCustomer(updated); saveCustomCategories(currentBusiness.id, 'Customer', updated); }
    else { setCustomCatVendor(updated); saveCustomCategories(currentBusiness.id, 'Vendor', updated); }
    setCatManagerInput('');
  };

  const handleCatManagerDelete = (cat) => {
    if (!currentBusiness?.id) return;
    if (catManagerTab === 'Customer') {
      const updated = customCatCustomer.filter(c => c !== cat);
      setCustomCatCustomer(updated);
      saveCustomCategories(currentBusiness.id, 'Customer', updated);
    } else {
      const updated = customCatVendor.filter(c => c !== cat);
      setCustomCatVendor(updated);
      saveCustomCategories(currentBusiness.id, 'Vendor', updated);
    }
  };

  const getBalanceChip = (party) => {
    const bal = party.balance || 0;
    if (bal === 0) return { label: 'Settled', bgcolor: alpha('#64748b', 0.1), color: '#475569', border: alpha('#64748b', 0.25) };
    if (party.type === 'Customer') {
      return bal > 0
        ? { label: `To Collect  ₹${Math.abs(bal).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, bgcolor: alpha('#64748b', 0.1), color: '#334155', border: alpha('#64748b', 0.25) }
        : { label: `To Pay  ₹${Math.abs(bal).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, bgcolor: alpha('#ef4444', 0.1), color: '#dc2626', border: alpha('#ef4444', 0.25) };
    } else {
      return bal < 0
        ? { label: `To Pay  ₹${Math.abs(bal).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, bgcolor: alpha('#ef4444', 0.1), color: '#dc2626', border: alpha('#ef4444', 0.25) }
        : { label: `To Collect  ₹${Math.abs(bal).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, bgcolor: alpha('#64748b', 0.1), color: '#334155', border: alpha('#64748b', 0.25) };
    }
  };

  return (
    <Box sx={{ mx: 0 }}>
      {/* Hero Header */}
      <Box sx={{
        borderRadius: 3,
        background: '#ffffff', border: '1px solid #e4e8ee',
        p: { xs: 2.5, md: 3.5 }, mb: 3,
        position: 'relative', overflow: 'hidden',
      }}>
        <Box sx={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', bgcolor: 'transparent', pointerEvents: 'none' }} />
        <Box sx={{ position: 'absolute', bottom: -30, right: 100, width: 150, height: 150, borderRadius: '50%', bgcolor: 'transparent', pointerEvents: 'none' }} />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2.5, position: 'relative' }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
              <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: 'rgba(51,65,85,0.08)', display: 'flex' }}>
                <Users size={20} color="#334155" />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 800, color: '#1e293b', letterSpacing: '-0.01em' }}>{t('nav.parties')}</Typography>
            </Box>
            <Typography variant="body2" sx={{ color: '#64748b', pl: 0.5 }}>Manage your customers and vendors</Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, flexShrink: 0, alignItems: 'center' }}>
            <Tooltip title="More options">
              <IconButton size="small" onClick={(e) => setMoreMenuAnchor(e.currentTarget)} sx={{ color: '#1e293b', bgcolor: 'rgba(51,65,85,0.08)', border: '1px solid #e4e8ee', borderRadius: 1.5, '&:hover': { bgcolor: '#94a3b8' } }}>
                <MoreHorizontal size={18} />
              </IconButton>
            </Tooltip>
            <Menu
              anchorEl={moreMenuAnchor}
              open={Boolean(moreMenuAnchor)}
              onClose={() => setMoreMenuAnchor(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
              <MenuItem onClick={() => { setImportOpen(true); setMoreMenuAnchor(null); }} sx={{ gap: 1.5 }}>
                <Upload size={16} /> Import
              </MenuItem>
              <MenuItem onClick={() => { const filtered = parties.filter(p => tab === 0 ? p.type === 'Customer' : p.type === 'Vendor'); exportToExcel(filtered, PARTY_COLUMNS, tab === 0 ? 'customers_export.xlsx' : 'vendors_export.xlsx'); setMoreMenuAnchor(null); }} sx={{ gap: 1.5 }}>
                <Download size={16} /> Export
              </MenuItem>
              <MenuItem onClick={() => { setBulkAddOpen(true); setMoreMenuAnchor(null); }} sx={{ gap: 1.5 }}>
                <LayoutList size={16} /> Bulk Add
              </MenuItem>
              <MenuItem onClick={() => { setBulkEditOpen(true); setMoreMenuAnchor(null); }} sx={{ gap: 1.5 }}>
                <CheckSquare size={16} /> Bulk Edit
              </MenuItem>
              <Divider sx={{ my: 0.5 }} />
              <MenuItem onClick={() => { setCatManagerTab(tab === 0 ? 'Customer' : 'Vendor'); setCatManagerOpen(true); setMoreMenuAnchor(null); }} sx={{ gap: 1.5 }}>
                <FolderOpen size={16} /> Categories
              </MenuItem>
            </Menu>
            <Button variant="contained" disabled={!canWrite} onClick={() => handleOpen()} sx={{ display: { xs: 'inline-flex', sm: 'none' }, flexDirection: 'column', alignItems: 'center', gap: 0.25, bgcolor: '#334155', color: '#ffffff', fontWeight: 700, minWidth: 0, px: 1.25, py: 0.5, '&:hover': { bgcolor: '#1e293b' }, borderRadius: 2, textTransform: 'none', lineHeight: 1 }}><Plus size={15} /><Typography sx={{ fontSize: '0.6rem', fontWeight: 700, lineHeight: 1 }}>{tab === 0 ? 'Add Customer' : 'Add Vendor'}</Typography></Button>
            <Button variant="contained" size="small" disabled={!canWrite} startIcon={<Plus size={16} />} onClick={() => handleOpen()} sx={{ display: { xs: 'none', sm: 'inline-flex' }, bgcolor: '#334155', color: '#ffffff', fontWeight: 700, '&:hover': { bgcolor: '#1e293b' }, borderRadius: 2, textTransform: 'none' }}>{tab === 0 ? 'Add Customer' : 'Add Vendor'}</Button>
          </Box>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 1.5, position: 'relative' }}>
          {[
            { label: 'Customers', value: customers.length, icon: UserCheck, color: '#64748b' },
            { label: 'Vendors', value: vendors.length, icon: Store, color: '#93c5fd' },
            { label: t('parties.receivable'), value: `₹${totalReceivable.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, icon: TrendingUp, color: '#16a34a' },
            { label: t('parties.payable'), value: `₹${totalPayable.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, icon: TrendingDown, color: '#fca5a5' },
          ].map(({ label, value, icon: Icon, color }) => (
            <Box key={label} sx={{ bgcolor: 'rgba(51,65,85,0.05)', borderRadius: 2, p: 1.5, border: '1px solid #e4e8ee' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                <Icon size={14} color={color} />
                <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Typography>
              </Box>
              <Typography sx={{ color: '#1e293b', fontWeight: 800, lineHeight: 1.1, fontSize: { xs: '0.95rem', sm: '1.1rem' } }}>{value}</Typography>
            </Box>
          ))}
        </Box>
      </Box>

      <Box ref={listContainerRef} sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, flex: 1, minWidth: 0, height: { xs: 'auto', sm: `${listFillHeight}px` }, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ px: 2, pt: 2, pb: 0 }}>
          <Box sx={{ display: 'inline-flex', gap: 0, bgcolor: alpha(theme.palette.primary.main, 0.06), borderRadius: 2.5, p: 0.5, border: '1px solid', borderColor: 'divider', mb: 2 }}>
            {[{ label: `Customers (${customers.length})`, value: 0 }, { label: `Vendors (${vendors.length})`, value: 1 }].map((t) => (
              <Box key={t.value} onClick={() => setTab(t.value)} sx={{
                px: 2.5, py: 0.75, borderRadius: 2, cursor: 'pointer',
                bgcolor: tab === t.value ? 'background.paper' : 'transparent',
                boxShadow: tab === t.value ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                color: tab === t.value ? 'primary.main' : 'text.secondary',
                fontWeight: tab === t.value ? 700 : 500,
                fontSize: '0.875rem',
                transition: 'all 0.15s',
                userSelect: 'none',
              }}>
                {t.label}
              </Box>
            ))}
          </Box>
        </Box>
        <CardContent sx={{ pt: 0, pb: 2, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {/* Search row */}
          <Box sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
            <TextField
              size="small"
              placeholder="Search by name, phone or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment> }}
              sx={{ flex: 1, minWidth: 0 }}
            />
            <Button
              onClick={() => setShowFilters(!showFilters)}
              variant={showFilters ? 'contained' : 'outlined'}
              size="small"
              startIcon={<Filter size={14} />}
              sx={{ fontWeight: 600, textTransform: 'none', borderRadius: 1.5, flexShrink: 0 }}
            >
              {showFilters ? 'Hide' : 'Filters'}
            </Button>
            {(filters.balanceMin || filters.balanceMax || filters.hasGST !== 'all' || filters.category !== 'all' || filters.sortBy !== 'name' || filters.sortOrder !== 'asc' || filters.balanceType !== 'all') && (
              <Button
                onClick={() => setFilters({ balanceMin: '', balanceMax: '', hasGST: 'all', category: 'all', sortBy: 'name', sortOrder: 'asc', balanceType: 'all' })}
                variant="text" size="small" color="error"
                sx={{ fontWeight: 600, textTransform: 'none', flexShrink: 0 }}
              >
                Clear
              </Button>
            )}
          </Box>

          {/* Balance pills row */}
          <Box sx={{ display: 'flex', gap: 0.4, mb: 2, p: 0.4, bgcolor: alpha(theme.palette.primary.main, 0.05), borderRadius: 2, border: '1px solid', borderColor: 'divider', width: 'fit-content' }}>
            {[
              { value: 'all', label: 'All' },
              { value: 'collect', label: 'To Collect' },
              { value: 'pay', label: 'To Pay' },
            ].map(opt => (
              <Box
                key={opt.value}
                onClick={() => setFilters(f => ({ ...f, balanceType: opt.value }))}
                sx={{
                  px: 1.5, py: 0.5, borderRadius: 1.5, cursor: 'pointer', userSelect: 'none',
                  fontSize: '0.8rem', fontWeight: 600, transition: 'all 0.15s', whiteSpace: 'nowrap',
                  bgcolor: filters.balanceType === opt.value ? (
                    opt.value === 'collect' ? alpha('#64748b', 0.12) :
                    opt.value === 'pay' ? alpha('#ef4444', 0.12) :
                    'background.paper'
                  ) : 'transparent',
                  color: filters.balanceType === opt.value ? (
                    opt.value === 'collect' ? '#334155' :
                    opt.value === 'pay' ? '#dc2626' :
                    'primary.main'
                  ) : 'text.secondary',
                  boxShadow: filters.balanceType === opt.value ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                  border: '1px solid',
                  borderColor: filters.balanceType === opt.value ? (
                    opt.value === 'collect' ? alpha('#64748b', 0.3) :
                    opt.value === 'pay' ? alpha('#ef4444', 0.3) :
                    'divider'
                  ) : 'transparent',
                }}
              >
                {opt.label}
              </Box>
            ))}
          </Box>

          {showFilters && (
            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField fullWidth label="Min Balance" type="number" value={filters.balanceMin}
                  onChange={(e) => setFilters({ ...filters, balanceMin: e.target.value })}
                  InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} size="small" />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField fullWidth label="Max Balance" type="number" value={filters.balanceMax}
                  onChange={(e) => setFilters({ ...filters, balanceMax: e.target.value })}
                  InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} size="small" />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField select fullWidth label="Category" value={filters.category}
                  onChange={(e) => setFilters({ ...filters, category: e.target.value })} size="small">
                  <MenuItem value="all">All Categories</MenuItem>
                  {allFilterCategories.map(cat => (
                    <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField select fullWidth label="GST Status" value={filters.hasGST}
                  onChange={(e) => setFilters({ ...filters, hasGST: e.target.value })} size="small">
                  <MenuItem value="all">All Parties</MenuItem>
                  <MenuItem value="yes">Has GST</MenuItem>
                  <MenuItem value="no">No GST</MenuItem>
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField select fullWidth label="Sort By" value={filters.sortBy}
                  onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })} size="small">
                  <MenuItem value="name">Name</MenuItem>
                  <MenuItem value="balance">Balance</MenuItem>
                  <MenuItem value="phone">Phone</MenuItem>
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField select fullWidth label="Sort Order" value={filters.sortOrder}
                  onChange={(e) => setFilters({ ...filters, sortOrder: e.target.value })} size="small">
                  <MenuItem value="asc">Ascending</MenuItem>
                  <MenuItem value="desc">Descending</MenuItem>
                </TextField>
              </Grid>
            </Grid>
          )}

          {/* ── Mobile card list ── */}
          {isMobile ? (
            <Box>
              {filteredParties.length === 0 ? (
                <Box sx={{ py: 8, textAlign: 'center' }}>
                  <Box sx={{ display: 'inline-flex', p: 2, borderRadius: '50%', bgcolor: alpha(theme.palette.primary.main, 0.07), mb: 1.5 }}>
                    <Users size={28} color={theme.palette.primary.main} strokeWidth={1.5} />
                  </Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>{t('parties.noParties')}</Typography>
                  <Typography variant="caption" color="text.disabled">Try adjusting your search or filters</Typography>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {filteredParties.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map(party => {
                    const chip = getBalanceChip(party);
                    const isSelected = selectedParty?.id === party.id;
                    return (
                      <Box
                        key={party.id}
                        onClick={() => setSelectedParty(prev => prev?.id === party.id ? null : party)}
                        sx={{
                          border: '1px solid', borderColor: isSelected ? 'primary.main' : 'divider',
                          borderRadius: 2, p: 1.5, cursor: 'pointer', bgcolor: isSelected ? alpha(theme.palette.primary.main, 0.03) : 'background.paper',
                          transition: 'all 0.15s',
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1 }}>
                          <Avatar sx={{ width: 36, height: 36, bgcolor: tab === 0 ? alpha('#111', 0.1) : alpha('#3f3f46', 0.1), color: tab === 0 ? '#111' : '#3f3f46', fontSize: '0.85rem', fontWeight: 800, flexShrink: 0 }}>
                            {party.name.charAt(0).toUpperCase()}
                          </Avatar>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.2 }} noWrap>{party.name}</Typography>
                            <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap', mt: 0.25 }}>
                              {party.partyId && (
                                <Typography variant="caption" sx={{ fontFamily: 'monospace', bgcolor: alpha(theme.palette.primary.main, 0.07), color: 'primary.main', px: 0.6, py: 0.1, borderRadius: 0.5, fontWeight: 700, fontSize: '0.65rem' }}>
                                  {party.partyId}
                                </Typography>
                              )}
                              {party.phone && (
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>
                                  {party.countryCode || '+91'} {party.phone}
                                </Typography>
                              )}
                            </Box>
                          </Box>
                          <Box sx={{ display: 'flex', gap: 0.25, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                            <IconButton size="small" onClick={() => handleOpen(party)} sx={{ color: 'text.disabled', '&:hover': { color: 'primary.main' } }}><Edit2 size={14} /></IconButton>
                            <IconButton size="small" onClick={() => handleDelete(party.id)} sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}><Trash2 size={14} /></IconButton>
                          </Box>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 0.5 }}>
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                            {party.category && (
                              <Chip label={party.category} size="small" sx={{ height: 18, fontSize: '0.62rem', fontWeight: 600, bgcolor: alpha(theme.palette.primary.main, 0.08), color: 'primary.main' }} />
                            )}
                            {party.gstNumber && (
                              <Chip label="GST" size="small" sx={{ height: 18, fontSize: '0.62rem', fontWeight: 600, bgcolor: alpha('#334155', 0.08), color: '#334155' }} />
                            )}
                          </Box>
                          <Chip label={chip.label} size="small" sx={{ height: 20, fontWeight: 700, fontSize: '0.68rem', bgcolor: chip.bgcolor, color: chip.color, border: `1px solid ${chip.border}` }} />
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              )}
              <TablePagination
                component="div"
                count={filteredParties.length}
                page={page}
                onPageChange={(_, newPage) => setPage(newPage)}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
                rowsPerPageOptions={[10, 25, 50]}
                sx={{ borderTop: '1px solid', borderColor: 'divider', mt: 1 }}
              />
            </Box>
          ) : (
          <>
          <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <Table size="small" sx={{ minWidth: 700 }}>
              <TableHead sx={{ bgcolor: 'background.default' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>ID</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Phone</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Category</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>GSTIN</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">Balance Status</TableCell>
                  {/* Sticky to the right edge of the horizontally-scrolling
                      table (minWidth:700) so Edit/Delete are always
                      reachable without scrolling all the way right first. */}
                  <TableCell sx={{ fontWeight: 600, position: 'sticky', right: 0, zIndex: 2, bgcolor: 'background.default', boxShadow: '-4px 0 6px -4px rgba(0,0,0,0.12)' }} align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredParties
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((party) => {
                    const chip = getBalanceChip(party);
                    return (
                      <TableRow
                        key={party.id}
                        hover
                        selected={selectedParty?.id === party.id}
                        onClick={() => setSelectedParty(prev => prev?.id === party.id ? null : party)}
                        sx={{ cursor: 'pointer', '&.Mui-selected': { bgcolor: alpha(theme.palette.primary.main, 0.06) }, '&.Mui-selected:hover': { bgcolor: alpha(theme.palette.primary.main, 0.1) } }}
                      >
                        <TableCell>
                          <Typography variant="caption" sx={{ fontFamily: 'monospace', bgcolor: alpha(theme.palette.primary.main, 0.07), color: 'primary.main', px: 0.75, py: 0.25, borderRadius: 0.75, fontWeight: 700, fontSize: '0.7rem' }}>
                            {party.partyId || '—'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Avatar sx={{ width: 34, height: 34, bgcolor: tab === 0 ? alpha('#111111', 0.1) : alpha('#3f3f46', 0.1), color: tab === 0 ? '#111111' : '#3f3f46', fontSize: '0.8rem', fontWeight: 800 }}>
                              {party.name.charAt(0).toUpperCase()}
                            </Avatar>
                            <Box>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>{party.name}</Typography>
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell>
                          {party.phone ? `${party.countryCode || '+91'} ${party.phone}` : '—'}
                        </TableCell>
                        <TableCell>
                          {party.category ? (
                            <Chip label={party.category} size="small" icon={<Tag size={11} />}
                              sx={{ fontSize: '0.7rem', height: 20, bgcolor: alpha(theme.palette.primary.main, 0.08), color: 'primary.main', border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`, '& .MuiChip-icon': { color: 'primary.main', ml: 0.5 } }} />
                          ) : '—'}
                        </TableCell>
                        <TableCell>{party.gstNumber || 'N/A'}</TableCell>
                        <TableCell align="right">
                          <Chip
                            label={chip.label}
                            size="small"
                            sx={{ fontWeight: 700, fontSize: '0.72rem', bgcolor: chip.bgcolor, color: chip.color, border: `1px solid ${chip.border}` }}
                          />
                        </TableCell>
                        <TableCell align="right" onClick={(e) => e.stopPropagation()}
                          sx={{
                            position: 'sticky', right: 0, zIndex: 1,
                            bgcolor: selectedParty?.id === party.id ? alpha(theme.palette.primary.main, 0.06) : 'background.paper',
                            boxShadow: '-4px 0 6px -4px rgba(0,0,0,0.12)',
                          }}>
                          <IconButton size="small" onClick={() => handleOpen(party)} color="primary"><Edit2 size={16} /></IconButton>
                          <IconButton size="small" onClick={() => handleDelete(party.id)} color="error"><Trash2 size={16} /></IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                {filteredParties.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 8 }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
                        <Box sx={{ p: 2, borderRadius: '50%', bgcolor: alpha(theme.palette.primary.main, 0.07) }}>
                          <Users size={28} color={theme.palette.primary.main} strokeWidth={1.5} />
                        </Box>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>{t('parties.noParties')}</Typography>
                        <Typography variant="caption" color="text.disabled">Try adjusting your search or filters</Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            component="div"
            count={filteredParties.length}
            page={page}
            onPageChange={(event, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(event) => { setRowsPerPage(parseInt(event.target.value, 10)); setPage(0); }}
            rowsPerPageOptions={[5, 10, 25, 50]}
            sx={{ borderTop: '1px solid', borderColor: 'divider', flexShrink: 0 }}
          />
          </>
          )}
        </CardContent>
      </Card>

      {/* ── Detail Panel ── */}
      {/* Desktop party preview panel */}
      <Box sx={{ display: { xs: 'none', md: 'block' }, width: 300, flexShrink: 0, position: 'sticky', top: 16, maxHeight: 'calc(100vh - 120px)', borderRadius: 2, overflow: 'hidden', border: '1px solid', borderColor: selectedParty ? 'divider' : 'transparent' }}>
        <CustomerPreviewPanel
          party={selectedParty}
          onClose={selectedParty ? () => setSelectedParty(null) : undefined}
          onRedeem={null}
          label={selectedParty?.type === 'Vendor' ? 'Vendor' : 'Customer'}
          itemsBought={selectedParty ? getItemsBoughtByParty(selectedParty.id, selectedParty.type === 'Vendor') : []}
          actions={selectedParty ? (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button size="small" variant="outlined" startIcon={<Edit2 size={13} />}
                onClick={() => handleOpen(selectedParty)}
                sx={{ flex: 1, fontWeight: 600, textTransform: 'none', borderRadius: 1.5, fontSize: '0.78rem' }}>
                Edit
              </Button>
              <Button size="small" variant="outlined" color="error" startIcon={<Trash2 size={13} />}
                onClick={() => handleDelete(selectedParty.id)}
                sx={{ flex: 1, fontWeight: 600, textTransform: 'none', borderRadius: 1.5, fontSize: '0.78rem' }}>
                Delete
              </Button>
            </Box>
          ) : undefined}
        />
      </Box>

      </Box>

      {/* ── Mobile party detail dialog ── */}
      {/* Mobile party detail dialog */}
      <Dialog open={isMobile && !!selectedParty} onClose={() => setSelectedParty(null)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: '16px 16px 0 0', m: 0, mt: 'auto', maxHeight: '85vh', position: 'fixed', bottom: 0, left: 0, right: 0, width: '100%', overflow: 'hidden' } }}>
        <CustomerPreviewPanel
          party={selectedParty}
          onClose={() => setSelectedParty(null)}
          onRedeem={null}
          label={selectedParty?.type === 'Vendor' ? 'Vendor' : 'Customer'}
          itemsBought={selectedParty ? getItemsBoughtByParty(selectedParty.id, selectedParty.type === 'Vendor') : []}
          actions={selectedParty ? (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button size="small" variant="outlined" startIcon={<Edit2 size={13} />}
                onClick={() => { setSelectedParty(null); handleOpen(selectedParty); }}
                sx={{ flex: 1, fontWeight: 600, textTransform: 'none', borderRadius: 1.5 }}>Edit</Button>
              <Button size="small" variant="outlined" color="error" startIcon={<Trash2 size={13} />}
                onClick={() => { setSelectedParty(null); handleDelete(selectedParty.id); }}
                sx={{ flex: 1, fontWeight: 600, textTransform: 'none', borderRadius: 1.5 }}>Delete</Button>
            </Box>
          ) : undefined}
        />
      </Dialog>

      <PartyFormDialog
        open={open}
        onClose={handleClose}
        partyType={formData.type || (tab === 0 ? 'Customer' : 'Vendor')}
        editingParty={editingParty}
        onSaved={() => { /* list auto-updates via DataContext reactive state */ }}
      />

      {/* dead dialog stub — never opens, just satisfies the closing tag structure below */}
      <Dialog open={false} onClose={handleClose} maxWidth="sm" fullWidth>
        <form onSubmit={handleSubmit}>
          <DialogTitle>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{editingParty ? `Edit ${formData.type === 'Vendor' ? 'Vendor' : 'Customer'}` : `Add New ${formData.type === 'Vendor' ? 'Vendor' : 'Customer'}`}</span>
              {editingParty?.partyId && (
                <Typography variant="caption" sx={{ fontFamily: 'monospace', bgcolor: alpha(theme.palette.primary.main, 0.07), color: 'primary.main', px: 1, py: 0.5, borderRadius: 1, fontWeight: 700 }}>
                  {editingParty.partyId}
                </Typography>
              )}
            </Box>
          </DialogTitle>
          <DialogContent dividers>
            <Grid container spacing={2} sx={{ mt: 0 }}>
              <Grid size={{ xs: 12 }}>
                <TextField
                  fullWidth
                  label={t('parties.partyName')}
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  autoFocus
                />
              </Grid>

              {/* Phone with country code */}
              <Grid size={{ xs: 12 }}>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField
                    select
                    label="Code"
                    value={formData.countryCode}
                    onChange={(e) => setFormData({ ...formData, countryCode: e.target.value })}
                    sx={{ minWidth: 120, flexShrink: 0 }}
                    SelectProps={{ MenuProps: { PaperProps: { sx: { maxHeight: 300 } } } }}
                  >
                    {COUNTRY_CODES.map(c => (
                      <MenuItem key={c.code + c.country} value={c.code}>
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                          <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 36 }}>{c.code}</Typography>
                          <Typography variant="caption" color="text.secondary">{c.name}</Typography>
                        </Box>
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    fullWidth
                    label="Phone Number"
                    value={formData.phone}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '');
                      setFormData({ ...formData, phone: digits });
                    }}
                    inputProps={{ inputMode: 'numeric', maxLength: 15 }}
                  />
                </Box>
              </Grid>

              <Grid size={{ xs: 6 }}>
                <TextField
                  fullWidth
                  label="GSTIN (Optional)"
                  value={formData.gstNumber}
                  onChange={(e) => setFormData({ ...formData, gstNumber: e.target.value })}
                />
              </Grid>

              <Grid size={{ xs: 6 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Category</InputLabel>
                  <Select
                    value={formData.category}
                    label="Category"
                    onChange={(e) => {
                      if (e.target.value === '__add__') return;
                      setFormData({ ...formData, category: e.target.value });
                    }}
                    MenuProps={{ PaperProps: { sx: { maxHeight: 300 } } }}
                  >
                    <MenuItem value="">None</MenuItem>
                    {builtinCategories.map(cat => <MenuItem key={cat} value={cat}>{cat}</MenuItem>)}
                    {customCats.length > 0 && <Divider sx={{ my: 0.5 }} />}
                    {customCats.map(cat => (
                      <MenuItem key={cat} value={cat} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, pr: 0.5 }}>
                        <span>{cat}</span>
                        <IconButton
                          size="small"
                          onClick={(e) => { e.stopPropagation(); handleDeleteCustomCategory(cat, formData.type); if (formData.category === cat) setFormData({ ...formData, category: '' }); }}
                          sx={{ p: 0.25, color: 'text.disabled', '&:hover': { color: 'error.main' } }}
                        >
                          <X size={13} />
                        </IconButton>
                      </MenuItem>
                    ))}
                    <Divider sx={{ my: 0.5 }} />
                    {showNewCatInput ? (
                      <Box sx={{ px: 1.5, py: 1, display: 'flex', gap: 0.75 }} onKeyDown={(e) => e.stopPropagation()}>
                        <TextField
                          autoFocus
                          size="small"
                          placeholder="Category name"
                          value={newCatInput}
                          onChange={(e) => setNewCatInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomCategory(); } if (e.key === 'Escape') { setShowNewCatInput(false); setNewCatInput(''); } }}
                          sx={{ flex: 1, '& .MuiInputBase-input': { fontSize: '0.8rem', py: 0.75 } }}
                        />
                        <Button size="small" variant="contained" onClick={handleAddCustomCategory} sx={{ minWidth: 0, px: 1.5, py: 0.5, fontSize: '0.75rem' }}>Add</Button>
                      </Box>
                    ) : (
                      <MenuItem value="__add__" onClick={() => { setShowNewCatInput(true); setNewCatInput(''); }}
                        sx={{ color: 'primary.main', fontWeight: 600, fontSize: '0.82rem', gap: 0.75 }}>
                        <Plus size={14} /> New category
                      </MenuItem>
                    )}
                  </Select>
                </FormControl>
              </Grid>

              <Grid size={{ xs: 12 }}>
                <TextField
                  fullWidth
                  label="Address"
                  multiline
                  rows={2}
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
              </Grid>

              {/* Bank Details */}
              <Grid size={{ xs: 12 }}>
                <Box
                  onClick={() => setShowBankDetails(v => !v)}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer',
                    py: 0.75, px: 1.25, borderRadius: 1.5, userSelect: 'none',
                    border: '1px solid', borderColor: 'divider',
                    bgcolor: showBankDetails ? alpha(theme.palette.primary.main, 0.04) : 'background.paper',
                    '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.06) },
                    transition: 'all 0.15s',
                  }}
                >
                  <Landmark size={15} color={theme.palette.primary.main} />
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', flex: 1, fontSize: '0.82rem' }}>
                    Bank Details
                    {(formData.bankName || formData.accountNumber) && (
                      <Typography component="span" variant="caption" sx={{ ml: 1, color: 'primary.main', fontWeight: 600 }}>
                        {formData.bankName || formData.accountNumber}
                      </Typography>
                    )}
                  </Typography>
                  <ChevronsUpDown size={14} color={theme.palette.text.secondary} style={{ transform: showBankDetails ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </Box>
                <Collapse in={showBankDetails} timeout={200}>
                  <Box sx={{ pt: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Box sx={{ display: 'flex', gap: 1.5 }}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Bank Name"
                        value={formData.bankName}
                        onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                        placeholder="e.g. HDFC Bank"
                      />
                      <TextField
                        fullWidth
                        size="small"
                        label="IFSC Code"
                        value={formData.ifscCode}
                        onChange={(e) => setFormData({ ...formData, ifscCode: e.target.value.toUpperCase() })}
                        inputProps={{ maxLength: 11 }}
                        placeholder="e.g. HDFC0001234"
                      />
                    </Box>
                    <TextField
                      fullWidth
                      size="small"
                      label="Account Number"
                      value={formData.accountNumber}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '');
                        setFormData({ ...formData, accountNumber: digits });
                      }}
                      inputProps={{ inputMode: 'numeric', maxLength: 20 }}
                      placeholder="Enter account number"
                    />
                    <TextField
                      fullWidth
                      size="small"
                      label="Account Holder Name"
                      value={formData.accountHolderName}
                      onChange={(e) => setFormData({ ...formData, accountHolderName: e.target.value })}
                      placeholder="Name as per bank records"
                    />
                  </Box>
                </Collapse>
              </Grid>

              <Grid size={{ xs: 12 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 1 }}>
                  Opening Balance
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                  {['collect', 'pay'].map((dir) => {
                    const active = balanceDir === dir;
                    const isCollect = dir === 'collect';
                    return (
                      <Box
                        key={dir}
                        onClick={() => setBalanceDir(dir)}
                        sx={{
                          flex: 1, py: 1, px: 1.5, borderRadius: 2, cursor: 'pointer',
                          border: '1.5px solid',
                          borderColor: active ? (isCollect ? '#334155' : '#dc2626') : 'divider',
                          bgcolor: active ? (isCollect ? alpha('#64748b', 0.08) : alpha('#ef4444', 0.08)) : 'background.paper',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75,
                          transition: 'all 0.15s',
                          userSelect: 'none',
                        }}
                      >
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: active ? (isCollect ? '#334155' : '#dc2626') : 'text.disabled', flexShrink: 0 }} />
                        <Typography variant="body2" sx={{ fontWeight: 700, color: active ? (isCollect ? '#334155' : '#dc2626') : 'text.secondary', fontSize: '0.8rem' }}>
                          {isCollect ? 'To Collect' : 'To Pay'}
                        </Typography>
                      </Box>
                    );
                  })}
                </Box>
                <TextField
                  fullWidth
                  type="number"
                  placeholder="0"
                  value={balanceAmt}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9.]/g, '');
                    setBalanceAmt(val);
                  }}
                  inputProps={{ min: 0 }}
                  InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                  helperText={
                    balanceDir === 'collect'
                      ? `They owe you this amount`
                      : `You owe them this amount`
                  }
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={handleClose}>Cancel</Button>
            <Button type="submit" variant="contained">
              {editingParty
                ? `Update ${formData.type === 'Vendor' ? 'Vendor' : 'Customer'}`
                : `Save ${formData.type === 'Vendor' ? 'Vendor' : 'Customer'}`}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* ── Category Manager Dialog ── */}
      <Dialog open={catManagerOpen} onClose={() => { setCatManagerOpen(false); setCatManagerInput(''); }} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <FolderOpen size={18} color={theme.palette.primary.main} />
              <Typography sx={{ fontWeight: 700 }}>Manage Categories</Typography>
            </Box>
            <IconButton size="small" onClick={() => { setCatManagerOpen(false); setCatManagerInput(''); }}>
              <X size={16} />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          {/* Tab toggle */}
          <Box sx={{ display: 'flex', bgcolor: alpha(theme.palette.primary.main, 0.05), borderBottom: '1px solid', borderColor: 'divider' }}>
            {['Customer', 'Vendor'].map(t => (
              <Box
                key={t}
                onClick={() => { setCatManagerTab(t); setCatManagerInput(''); }}
                sx={{
                  flex: 1, py: 1.25, textAlign: 'center', cursor: 'pointer', userSelect: 'none',
                  fontWeight: catManagerTab === t ? 700 : 500, fontSize: '0.85rem',
                  color: catManagerTab === t ? 'primary.main' : 'text.secondary',
                  borderBottom: catManagerTab === t ? '2px solid' : '2px solid transparent',
                  borderColor: catManagerTab === t ? 'primary.main' : 'transparent',
                  transition: 'all 0.15s',
                }}
              >
                {t} Categories
              </Box>
            ))}
          </Box>

          <Box sx={{ p: 2 }}>
            {/* Built-in categories */}
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 1 }}>
              Built-in
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2 }}>
              {(catManagerTab === 'Customer' ? CUSTOMER_CATEGORIES : VENDOR_CATEGORIES).map(cat => (
                <Chip key={cat} label={cat} size="small"
                  sx={{ fontSize: '0.75rem', bgcolor: alpha(theme.palette.primary.main, 0.07), color: 'text.secondary', border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}` }} />
              ))}
            </Box>

            {/* Custom categories */}
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 1 }}>
              Custom
            </Typography>
            {(catManagerTab === 'Customer' ? customCatCustomer : customCatVendor).length === 0 ? (
              <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 2 }}>No custom categories yet.</Typography>
            ) : (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2 }}>
                {(catManagerTab === 'Customer' ? customCatCustomer : customCatVendor).map(cat => (
                  <Chip
                    key={cat}
                    label={cat}
                    size="small"
                    onDelete={() => handleCatManagerDelete(cat)}
                    sx={{ fontSize: '0.75rem', bgcolor: alpha(theme.palette.primary.main, 0.1), color: 'primary.main', border: `1px solid ${alpha(theme.palette.primary.main, 0.25)}` }}
                  />
                ))}
              </Box>
            )}

            {/* Add new */}
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                size="small"
                fullWidth
                placeholder="New category name"
                value={catManagerInput}
                onChange={e => setCatManagerInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCatManagerAdd(); } }}
                autoComplete="off"
              />
              <Button variant="contained" size="small" onClick={handleCatManagerAdd}
                disabled={!catManagerInput.trim()}
                sx={{ fontWeight: 700, textTransform: 'none', borderRadius: 1.5, flexShrink: 0 }}>
                Add
              </Button>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2 }}>
          <Button onClick={() => { setCatManagerOpen(false); setCatManagerInput(''); }} sx={{ fontWeight: 600 }}>Done</Button>
        </DialogActions>
      </Dialog>

      <BulkAddDialog
        open={bulkAddOpen}
        onClose={() => setBulkAddOpen(false)}
        type={tab === 0 ? 'customer' : 'vendor'}
        onSuccess={(count) => showSnackbar(`${count} ${tab === 0 ? 'customer' : 'vendor'}${count !== 1 ? 's' : ''} saved successfully!`, 'success')}
      />

      <BulkEditDialog
        open={bulkEditOpen}
        onClose={() => setBulkEditOpen(false)}
        parties={tab === 0 ? customers : vendors}
        partyType={tab === 0 ? 'Customer' : 'Vendor'}
        onSuccess={(count) => showSnackbar(`${count} ${tab === 0 ? 'customer' : 'vendor'}${count !== 1 ? 's' : ''} updated successfully!`, 'success')}
      />

      <ImportDialog
        open={importOpen}
        onClose={() => { importBatchRef.current = []; setImportOpen(false); }}
        type="parties"
        existingItems={parties}
        onBatchImport={(validRows, existing) => {
          let added = 0, updated = 0;
          const batchSeen = [...existing];
          const toAdd = [];
          for (const row of validRows) {
            const match = existing.find(ex => ex.name.toLowerCase() === row.name.toLowerCase());
            const normalType = row.type.charAt(0).toUpperCase() + row.type.slice(1).toLowerCase();
            const partyId = match?.partyId || generatePartyId(normalType, batchSeen);
            const partyData = {
              ...row,
              type: normalType,
              businessId: currentBusiness.id,
              balance: row.openingBalance || 0,
              countryCode: row.countryCode || '+91',
              category: row.category || '',
              partyId,
            };
            if (match) {
              updateItem('parties', match.id, partyData);
              updated++;
            } else {
              toAdd.push(partyData);
              batchSeen.push({ partyId, type: normalType, name: row.name });
              added++;
            }
          }
          if (toAdd.length) addItems('parties', toAdd);
          return { added, updated, failed: 0 };
        }}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity} variant="filled" sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default PartiesPage;
