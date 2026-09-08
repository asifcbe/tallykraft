import React, { useState, useEffect, useMemo } from 'react';
import {
  Box, Button, Card, CardContent, Typography, TextField, Dialog,
  DialogTitle, DialogContent, DialogActions, Grid, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, IconButton,
  Chip, InputAdornment, MenuItem, Autocomplete, TablePagination,
  Snackbar, Alert, Avatar, Tooltip, alpha, useTheme
} from '@mui/material';
import { Plus, Search, Edit2, Trash2, Users, TrendingUp, TrendingDown, UserCheck, Store, Upload, Download, LayoutList } from 'lucide-react';
import { useBusiness } from './BusinessContext';
import { useData } from './DataContext';
import { useI18n } from './i18n/I18nContext';
import { useDialog } from './DialogContext';
import { useSubscription } from './SubscriptionContext';
import ImportDialog from './ImportDialog';
import BulkAddDialog from './BulkAddDialog';
import { exportToExcel, PARTY_COLUMNS } from './exportUtils';

const PartiesPage = () => {
  const { currentBusiness } = useBusiness();
  const { data, addItem, updateItem, deleteItem, getItems } = useData();
  const { confirm } = useDialog();
  const { isBusinessActive } = useSubscription();
  const canWrite = isBusinessActive(currentBusiness?.id);
  const { t } = useI18n();
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [editingParty, setEditingParty] = useState(null);
  const [formData, setFormData] = useState({
    name: '', type: 'Customer', phone: '', gstNumber: '', address: '', balance: 0
  });

  // Filter states
  const [filters, setFilters] = useState({
    balanceMin: '',
    balanceMax: '',
    hasGST: 'all', // all, yes, no
    sortBy: 'name', // name, balance, phone
    sortOrder: 'asc' // asc, desc
  });
  const [showFilters, setShowFilters] = useState(false);

  // Pagination states
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'error' });

  const theme = useTheme();
  const parties = getItems('parties').filter(p => p.businessId === currentBusiness?.id);
  const customers = parties.filter(p => p.type === 'Customer');
  const vendors = parties.filter(p => p.type === 'Vendor');
  const totalReceivable = customers.reduce((s, p) => s + Math.max(0, p.balance || 0), 0);
  const totalPayable = vendors.reduce((s, p) => s + Math.max(0, -(p.balance || 0)), 0);

  // Similar name suggestions while typing party name
  const similarParties = useMemo(() => {
    const name = formData.name.trim();
    if (name.length < 2) return [];
    const lower = name.toLowerCase();
    return parties
      .filter(p => !editingParty || p.id !== editingParty.id)
      .filter(p => p.name.toLowerCase().includes(lower) || lower.includes(p.name.toLowerCase()))
      .slice(0, 4);
  }, [formData.name, parties, editingParty]);

  const filteredParties = parties
    .filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || 
                            p.phone.includes(search);
      const matchesTab = tab === 0 ? p.type === 'Customer' : p.type === 'Vendor';
      
      // Additional filters
      const matchesBalanceMin = !filters.balanceMin || p.balance >= parseFloat(filters.balanceMin);
      const matchesBalanceMax = !filters.balanceMax || p.balance <= parseFloat(filters.balanceMax);
      const matchesGST = filters.hasGST === 'all' || 
                        (filters.hasGST === 'yes' && p.gstNumber) || 
                        (filters.hasGST === 'no' && !p.gstNumber);
      
      return matchesSearch && matchesTab && matchesBalanceMin && matchesBalanceMax && matchesGST;
    })
    .sort((a, b) => {
      let aValue, bValue;
      switch (filters.sortBy) {
        case 'balance':
          aValue = a.balance;
          bValue = b.balance;
          break;
        case 'phone':
          aValue = a.phone;
          bValue = b.phone;
          break;
        default:
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
      }
      
      if (filters.sortOrder === 'desc') {
        return aValue < bValue ? 1 : -1;
      }
      return aValue > bValue ? 1 : -1;
    });

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [search, tab, filters]);

  const handleOpen = (party = null) => {
    if (party) {
      setEditingParty(party);
      setFormData(party);
    } else {
      setEditingParty(null);
      setFormData({ name: '', type: tab === 0 ? 'Customer' : 'Vendor', phone: '', gstNumber: '', address: '', balance: 0 });
    }
    setOpen(true);
  };

  const handleClose = () => setOpen(false);

  const showSnackbar = (message, severity = 'error') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate business
    if (!currentBusiness?.id) {
      showSnackbar('Business not selected. Please refresh and try again.', 'error');
      return;
    }

    // Validate required fields
    if (!formData.name || formData.name.trim() === '') {
      showSnackbar('Please enter a party name', 'warning');
      return;
    }

    try {
      const partyData = { 
        ...formData, 
        businessId: currentBusiness.id,
        name: formData.name.trim(),
        balance: Number(formData.balance) || 0
      };
      
      let saved;
      if (editingParty) {
        saved = await updateItem('parties', editingParty.id, partyData);
      } else {
        saved = await addItem('parties', partyData);
      }
      
      if (!saved) {
        // Check if item was actually saved despite return value
        const savedParty = getItems('parties').find(p => 
          p.name === partyData.name && 
          p.businessId === partyData.businessId &&
          (!editingParty || p.id === editingParty.id)
        );
        
        if (!savedParty) {
          showSnackbar('Failed to save party. Please check your connection and try again.', 'error');
          return;
        }
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

  return (
    <Box sx={{ maxWidth: 1440, mx: 'auto' }}>
      {/* Hero Header */}
      <Box sx={{
        borderRadius: 3,
        background: 'linear-gradient(135deg, #1e1b4b 0%, #3730a3 55%, #1e40af 100%)',
        p: { xs: 2.5, md: 3.5 }, mb: 3,
        position: 'relative', overflow: 'hidden',
      }}>
        <Box sx={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
        <Box sx={{ position: 'absolute', bottom: -30, right: 100, width: 150, height: 150, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.03)', pointerEvents: 'none' }} />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2.5, position: 'relative' }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
              <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.15)', display: 'flex' }}>
                <Users size={20} color="white" />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 800, color: 'white', letterSpacing: '-0.01em' }}>{t('nav.parties')}</Typography>
            </Box>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.65)', pl: 0.5 }}>Manage your customers and vendors</Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, flexShrink: 0, alignItems: 'center' }}>
            {/* Mobile: icon-only */}
            <Tooltip title="Import"><IconButton size="small" disabled={!canWrite} onClick={() => setImportOpen(true)} sx={{ display: { xs: 'inline-flex', sm: 'none' }, color: 'white', bgcolor: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 1.5, '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' } }}><Upload size={16} /></IconButton></Tooltip>
            <Tooltip title="Export"><IconButton size="small" disabled={!canWrite} onClick={() => exportToExcel(parties, PARTY_COLUMNS, 'parties_export.xlsx')} sx={{ display: { xs: 'inline-flex', sm: 'none' }, color: 'white', bgcolor: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 1.5, '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' } }}><Download size={16} /></IconButton></Tooltip>
            <Button variant="contained" disabled={!canWrite} onClick={() => handleOpen()} sx={{ display: { xs: 'inline-flex', sm: 'none' }, flexDirection: 'column', alignItems: 'center', gap: 0.25, bgcolor: 'white', color: '#3730a3', fontWeight: 700, minWidth: 0, px: 1.25, py: 0.5, '&:hover': { bgcolor: 'rgba(255,255,255,0.9)' }, borderRadius: 2, textTransform: 'none', lineHeight: 1 }}><Plus size={15} /><Typography sx={{ fontSize: '0.6rem', fontWeight: 700, lineHeight: 1 }}>{tab === 0 ? 'Add Customer' : 'Add Vendor'}</Typography></Button>
            {/* Desktop: full buttons */}
            <Button variant="outlined" size="small" disabled={!canWrite} startIcon={<Upload size={16} />} onClick={() => setImportOpen(true)} sx={{ display: { xs: 'none', sm: 'inline-flex' }, bgcolor: 'rgba(255,255,255,0.1)', color: 'white', borderColor: 'rgba(255,255,255,0.4)', fontWeight: 600, '&:hover': { bgcolor: 'rgba(255,255,255,0.2)', borderColor: 'white' }, borderRadius: 2, textTransform: 'none' }}>Import</Button>
            <Button variant="outlined" size="small" disabled={!canWrite} startIcon={<Download size={16} />} onClick={() => exportToExcel(parties, PARTY_COLUMNS, 'parties_export.xlsx')} sx={{ display: { xs: 'none', sm: 'inline-flex' }, bgcolor: 'rgba(255,255,255,0.1)', color: 'white', borderColor: 'rgba(255,255,255,0.4)', fontWeight: 600, '&:hover': { bgcolor: 'rgba(255,255,255,0.2)', borderColor: 'white' }, borderRadius: 2, textTransform: 'none' }}>Export</Button>
            <Button variant="outlined" size="small" disabled={!canWrite} startIcon={<LayoutList size={16} />} onClick={() => setBulkAddOpen(true)} sx={{ display: { xs: 'none', sm: 'inline-flex' }, bgcolor: 'rgba(255,255,255,0.1)', color: 'white', borderColor: 'rgba(255,255,255,0.4)', fontWeight: 600, '&:hover': { bgcolor: 'rgba(255,255,255,0.2)', borderColor: 'white' }, borderRadius: 2, textTransform: 'none' }}>Bulk Add</Button>
            <Button variant="contained" size="small" disabled={!canWrite} startIcon={<Plus size={16} />} onClick={() => handleOpen()} sx={{ display: { xs: 'none', sm: 'inline-flex' }, bgcolor: 'white', color: '#3730a3', fontWeight: 700, '&:hover': { bgcolor: 'rgba(255,255,255,0.9)' }, borderRadius: 2, textTransform: 'none' }}>{tab === 0 ? 'Add Customer' : 'Add Vendor'}</Button>
          </Box>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 1.5, position: 'relative' }}>
          {[
            { label: 'Customers', value: customers.length, icon: UserCheck, color: '#a5b4fc' },
            { label: 'Vendors', value: vendors.length, icon: Store, color: '#93c5fd' },
            { label: t('parties.receivable'), value: `₹${totalReceivable.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, icon: TrendingUp, color: '#6ee7b7' },
            { label: t('parties.payable'), value: `₹${totalPayable.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, icon: TrendingDown, color: '#fca5a5' },
          ].map(({ label, value, icon: Icon, color }) => (
            <Box key={label} sx={{ bgcolor: 'rgba(255,255,255,0.08)', borderRadius: 2, p: 1.5, border: '1px solid rgba(255,255,255,0.1)' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                <Icon size={14} color={color} />
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Typography>
              </Box>
              <Typography sx={{ color: 'white', fontWeight: 800, lineHeight: 1.1, fontSize: { xs: '0.95rem', sm: '1.1rem' } }}>{value}</Typography>
            </Box>
          ))}
        </Box>
      </Box>

      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
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
        <CardContent sx={{ pt: 0, pb: 2 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start"><Search size={16} /></InputAdornment>
              ),
            }}
            sx={{ mb: 2 }}
          />

          <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center' }}>
            <Button
              onClick={() => setShowFilters(!showFilters)}
              variant={showFilters ? 'contained' : 'outlined'}
              size="small"
              startIcon={<Search size={14} />}
              sx={{ fontWeight: 600, textTransform: 'none', borderRadius: 1.5 }}
            >
              {showFilters ? 'Hide Filters' : 'Filters'}
            </Button>
            {(filters.balanceMin || filters.balanceMax || filters.hasGST !== 'all' || filters.sortBy !== 'name' || filters.sortOrder !== 'asc') && (
              <Button
                onClick={() => setFilters({ balanceMin: '', balanceMax: '', hasGST: 'all', sortBy: 'name', sortOrder: 'asc' })}
                variant="text"
                size="small"
                color="error"
                sx={{ fontWeight: 600, textTransform: 'none' }}
              >
                Clear all
              </Button>
            )}
          </Box>
          
          {showFilters && (
            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  fullWidth
                  label="Min Balance"
                  type="number"
                  value={filters.balanceMin}
                  onChange={(e) => setFilters({...filters, balanceMin: e.target.value})}
                  InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                  size="small"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  fullWidth
                  label="Max Balance"
                  type="number"
                  value={filters.balanceMax}
                  onChange={(e) => setFilters({...filters, balanceMax: e.target.value})}
                  InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                  size="small"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  select
                  fullWidth
                  label="GST Status"
                  value={filters.hasGST}
                  onChange={(e) => setFilters({...filters, hasGST: e.target.value})}
                  size="small"
                >
                  <MenuItem value="all">All Parties</MenuItem>
                  <MenuItem value="yes">Has GST</MenuItem>
                  <MenuItem value="no">No GST</MenuItem>
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  select
                  fullWidth
                  label="Sort By"
                  value={filters.sortBy}
                  onChange={(e) => setFilters({...filters, sortBy: e.target.value})}
                  size="small"
                >
                  <MenuItem value="name">Name</MenuItem>
                  <MenuItem value="balance">Balance</MenuItem>
                  <MenuItem value="phone">Phone</MenuItem>
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  select
                  fullWidth
                  label="Sort Order"
                  value={filters.sortOrder}
                  onChange={(e) => setFilters({...filters, sortOrder: e.target.value})}
                  size="small"
                >
                  <MenuItem value="asc">Ascending</MenuItem>
                  <MenuItem value="desc">Descending</MenuItem>
                </TextField>
              </Grid>
            </Grid>
          )}

          <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
            <Table size="small" sx={{ minWidth: 650 }}>
              <TableHead sx={{ bgcolor: 'background.default' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Phone</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>GSTIN</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">Balance</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredParties
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((party) => (
                  <TableRow key={party.id} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Avatar sx={{ width: 34, height: 34, bgcolor: tab === 0 ? alpha('#4f46e5', 0.1) : alpha('#0ea5e9', 0.1), color: tab === 0 ? '#4f46e5' : '#0ea5e9', fontSize: '0.8rem', fontWeight: 800 }}>
                          {party.name.charAt(0).toUpperCase()}
                        </Avatar>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{party.name}</Typography>
                          {party.address && <Typography variant="caption" color="text.secondary">{party.address}</Typography>}
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>{party.phone}</TableCell>
                    <TableCell>{party.gstNumber || 'N/A'}</TableCell>
                    <TableCell align="right">
                      <Chip
                        label={`${party.balance >= 0 ? '▲' : '▼'} ₹${Math.abs(party.balance).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                        size="small"
                        sx={{
                          fontWeight: 700, fontSize: '0.72rem',
                          bgcolor: party.balance >= 0 ? alpha('#10b981', 0.1) : alpha('#ef4444', 0.1),
                          color: party.balance >= 0 ? '#059669' : '#dc2626',
                          border: `1px solid ${party.balance >= 0 ? alpha('#10b981', 0.25) : alpha('#ef4444', 0.25)}`,
                        }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" disabled={!canWrite} onClick={() => handleOpen(party)} color="primary">
                        <Edit2 size={16} />
                      </IconButton>
                      <IconButton size="small" disabled={!canWrite} onClick={() => handleDelete(party.id)} color="error">
                        <Trash2 size={16} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredParties.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 8 }}>
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
              onRowsPerPageChange={(event) => {
                setRowsPerPage(parseInt(event.target.value, 10));
                setPage(0);
              }}
              rowsPerPageOptions={[5, 10, 25, 50]}
              sx={{ borderTop: '1px solid', borderColor: 'divider' }}
            />
        </CardContent>
      </Card>

      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <form onSubmit={handleSubmit}>
          <DialogTitle>
            {editingParty
              ? `Edit ${formData.type === 'Vendor' ? 'Vendor' : 'Customer'}`
              : `Add New ${formData.type === 'Vendor' ? 'Vendor' : 'Customer'}`}
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
                {similarParties.length > 0 && (
                  <Alert
                    severity="warning"
                    variant="outlined"
                    sx={{ mt: 1, py: 0.5 }}
                  >
                    <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                      Similar {formData.type === 'Customer' ? 'customers' : 'vendors'} already exist — make sure you're not creating a duplicate:
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {similarParties.map(p => (
                        <Chip
                          key={p.id}
                          label={`${p.name}${p.phone ? ` · ${p.phone}` : ''}`}
                          size="small"
                          variant="outlined"
                          color="warning"
                          onClick={() => { handleClose(); handleOpen(p); }}
                          title="Click to edit this party instead"
                        />
                      ))}
                    </Box>
                  </Alert>
                )}
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  fullWidth
                  label="Phone Number"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  fullWidth
                  label="GSTIN (Optional)"
                  value={formData.gstNumber}
                  onChange={(e) => setFormData({ ...formData, gstNumber: e.target.value })}
                />
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
              <Grid size={{ xs: 12 }}>
                <TextField
                  fullWidth
                  type="number"
                  label="Opening Balance"
                  value={formData.balance}
                  onChange={(e) => setFormData({ ...formData, balance: Number(e.target.value) })}
                  InputProps={{
                    startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                  }}
                  helperText="Negative for you owe them, positive for they owe you"
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

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        type="parties"
        existingItems={parties}
        onImport={async (row, existing) => {
          const match = existing.find(ex => ex.name.toLowerCase() === row.name.toLowerCase());
          const partyData = {
            ...row,
            businessId: currentBusiness.id,
            balance: row.openingBalance || 0,
          };
          if (match) {
            await updateItem('parties', match.id, partyData);
          } else {
            await addItem('parties', partyData);
          }
        }}
      />

      <BulkAddDialog
        open={bulkAddOpen}
        onClose={() => setBulkAddOpen(false)}
        type={tab === 0 ? 'customer' : 'vendor'}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={() => setSnackbar({ ...snackbar, open: false })} 
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default PartiesPage;
