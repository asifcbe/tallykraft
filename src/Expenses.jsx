import React, { useState, useEffect } from 'react';
import {
  Box, Button, Card, CardContent, Typography, TextField, Dialog,
  DialogTitle, DialogContent, DialogActions, Grid, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, IconButton,
  InputAdornment, Chip, MenuItem, TablePagination, Snackbar, Alert, alpha,
  useTheme, useMediaQuery, Stack, Tooltip, ToggleButton, ToggleButtonGroup,
  Menu,
} from '@mui/material';
import { Plus, Search, Edit2, Trash2, DollarSign, Printer, Share2, Filter, Calendar, FileText, Eye, X, Download, TrendingDown, Receipt, CalendarDays, MoreHorizontal, ListPlus } from 'lucide-react';
import ExpenseBulkAddDialog from './ExpenseBulkAddDialog';
import { useBusiness } from './BusinessContext';

import { useConfig } from './ConfigContext';
import { useSubscription } from './SubscriptionContext';
import { useDialog } from './DialogContext';
import { useData } from './DataContext';
import { useI18n } from './i18n/I18nContext';
import { FitPreview } from './TxListView';
import { acknowledgeQuickNew } from './quickNewBridge';
import { exportToExcel, EXPENSE_COLUMNS } from './exportUtils';
import { useReactToPrint } from 'react-to-print';
import { useLocation } from 'react-router-dom';
import ExpenseTemplate from './ExpenseTemplate';
import { useRef } from 'react';
import SplitPaymentInput from './SplitPaymentInput';

const DEFAULT_EXPENSE_CATEGORIES = ['Office Supplies', 'Travel', 'Utilities', 'Rent', 'Marketing', 'Equipment', 'Others'];

const ExpensesPage = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { currentBusiness } = useBusiness();
  const { t } = useI18n();

  const { data, addItem, updateItem, deleteItem, getItems } = useData();
  const { confirm } = useDialog();
  // TallyKraft billing: data layer blocks the write; this greys the CTA.
  const { isBusinessActive } = useSubscription();
  const canWrite = isBusinessActive(currentBusiness?.id);
  const location = useLocation();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [formData, setFormData] = useState({
    category: 'Others', amount: '', date: new Date().toISOString().split('T')[0], description: '', paymentMode: 'Cash'
  });
  const [splitCash, setSplitCash] = useState('');
  const [splitBank, setSplitBank] = useState('');

  // Filter states
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    category: 'all',
    minAmount: '',
    maxAmount: '',
    sortBy: 'date', // date, amount, category
    sortOrder: 'desc' // asc, desc
  });
  const [showFilters, setShowFilters] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'error' });
  const [moreAnchor, setMoreAnchor] = useState(null);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
   


  // Pagination states
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const { config } = useConfig();
  const EXPENSE_CATEGORIES = config.expenseCategories?.length ? config.expenseCategories : DEFAULT_EXPENSE_CATEGORIES;
  const [printingData, setPrintingData] = useState(null);
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

  const handlePrint = useReactToPrint({
    contentRef: printRef,
  });

  const handleShare = (row) => {
    const text = `*Expense Voucher from ${currentBusiness?.name || 'TallyKraft'}*\n\n` +
      `Amount: ₹${row.amount.toLocaleString()}\n` +
      `Date: ${row.date}\n` +
      `Category: ${row.category}\n` +
      `Description: ${row.description}\n\n` +
      `Shared via TallyKraft`;
    
    if (navigator.share) {
      navigator.share({ title: `Expense Voucher`, text }).catch(e => console.error(e));
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    }
  };

  const expenses = getItems('expenses')
    .filter(e => e.businessId === currentBusiness?.id)
    .reverse();

  const filteredExpenses = expenses
    .filter(e => {
      const matchesSearch = (e.description || '').toLowerCase().includes(search.toLowerCase()) ||
                            (e.category || '').toLowerCase().includes(search.toLowerCase());
      
      // Additional filters
      const matchesDateFrom = !filters.dateFrom || new Date(e.date) >= new Date(filters.dateFrom);
      const matchesDateTo = !filters.dateTo || new Date(e.date) <= new Date(filters.dateTo);
      const matchesCategory = filters.category === 'all' || e.category === filters.category;
      const matchesMinAmount = !filters.minAmount || e.amount >= parseFloat(filters.minAmount);
      const matchesMaxAmount = !filters.maxAmount || e.amount <= parseFloat(filters.maxAmount);
      
      return matchesSearch && matchesDateFrom && matchesDateTo && matchesCategory && matchesMinAmount && matchesMaxAmount;
    })
    .sort((a, b) => {
      let aValue, bValue;
      switch (filters.sortBy) {
        case 'amount':
          aValue = a.amount;
          bValue = b.amount;
          break;
        case 'category':
          aValue = a.category.toLowerCase();
          bValue = b.category.toLowerCase();
          break;
        default:
          aValue = new Date(a.date);
          bValue = new Date(b.date);
      }
      
      if (filters.sortOrder === 'desc') {
        return aValue < bValue ? 1 : -1;
      }
      return aValue > bValue ? 1 : -1;
    });

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [search, filters]);

  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  // Extra summary stats for the header strip.
  const nowMonth = new Date().toISOString().slice(0, 7); // yyyy-mm
  const thisMonthTotal = expenses
    .filter((e) => (e.date || '').slice(0, 7) === nowMonth)
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const expenseCount = filteredExpenses.length;
  const avgExpense = expenseCount ? totalExpenses / expenseCount : 0;
  const fmt = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  const handleOpen = (expense = null) => {
    if (expense) {
      setEditingExpense(expense);
      setFormData(expense);
      if (expense.paymentMode === 'Split' && expense.paymentSplit) {
        setSplitCash(String(expense.paymentSplit.cash ?? ''));
        setSplitBank(String(expense.paymentSplit.bank ?? ''));
      } else {
        setSplitCash(''); setSplitBank('');
      }
    } else {
      setEditingExpense(null);
      setFormData({ category: 'Others', amount: '', date: new Date().toISOString().split('T')[0], description: '', paymentMode: 'Cash' });
      setSplitCash(''); setSplitBank('');
    }
    setOpen(true);
  };

  const handleClose = () => setOpen(false);

  // Auto-open add dialog when navigated from Dashboard with openAdd flag, or
  // when the Dashboard "+ New Entry" menu fires its quick-new event.
  useEffect(() => {
    if (location.state?.openAdd) {
      handleOpen();
      window.history.replaceState({}, document.title);
    }
    const onQuickNew = (e) => {
      if (e.detail?.path === '/expenses' && e.detail?.intent === 'openAdd') {
        handleOpen();
        acknowledgeQuickNew(e.detail);
      }
    };
    window.addEventListener('dashboard-quick-new', onQuickNew);
    return () => window.removeEventListener('dashboard-quick-new', onQuickNew);
  }, []); // eslint-disable-line

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
    if (!formData.category) {
      showSnackbar('Please select a category', 'warning');
      return;
    }

    let amountNum;
    if (formData.paymentMode === 'Split') {
      const sc = Number(splitCash) || 0;
      const sb = Number(splitBank) || 0;
      if (sc <= 0 || sb <= 0) {
        showSnackbar('Enter both Cash and Bank portions for Split payment', 'warning');
        return;
      }
      amountNum = sc + sb;
    } else {
      amountNum = Number(formData.amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        showSnackbar('Please enter a valid amount greater than zero', 'warning');
        return;
      }
    }

    if (!formData.date) {
      showSnackbar('Please select a date', 'warning');
      return;
    }

    try {
      const expenseData = {
        ...formData,
        businessId: currentBusiness.id,
        amount: amountNum,
        description: formData.description.trim(),
        date: formData.date,
        ...(formData.paymentMode === 'Split' && {
          paymentSplit: { cash: Number(splitCash), bank: Number(splitBank), bankMode: 'Bank' },
        }),
      };
      
      let saved;
      if (editingExpense) {
        saved = await updateItem('expenses', editingExpense.id, expenseData);
      } else {
        saved = await addItem('expenses', expenseData);
      }
      
      if (!saved) {
        // Check if expense was actually saved despite return value
        const savedExpense = getItems('expenses').find(e => 
          e.description === expenseData.description && 
          e.amount === expenseData.amount &&
          e.date === expenseData.date &&
          e.businessId === expenseData.businessId &&
          (!editingExpense || e.id === editingExpense.id)
        );
        
        if (!savedExpense) {
          showSnackbar('Failed to save expense. Please check your connection and try again.', 'error');
          return;
        }
      }
      
      showSnackbar(editingExpense ? 'Expense updated successfully!' : 'Expense added successfully!', 'success');
      handleClose();
    } catch (error) {
      console.error('Error saving expense:', error);
      showSnackbar('An error occurred while saving. Please try again.', 'error');
    }
  };

  const handleDelete = async (id) => {
    const expense = expenses.find(e => e.id === id);
    if (!expense) return;
    const ok = await confirm({ title: 'Delete Expense', message: 'This expense record will be permanently deleted. This cannot be undone.', confirmLabel: 'Delete', variant: 'danger' });
    if (ok) { await deleteItem('expenses', id); showSnackbar('Expense deleted successfully!', 'success'); }
  };

  return (
    <Box sx={{ mx: 0 }}>
      <div style={{ display: 'none' }}>
        <ExpenseTemplate ref={printRef} data={printingData} business={currentBusiness} paperSize={paperSize} />
      </div>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 1.5, flexWrap: 'wrap', mb: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ p: 1, borderRadius: 2, background: 'linear-gradient(135deg, #18181b, #3f3f46)', display: 'flex', boxShadow: '0 4px 12px rgba(190,24,93,0.3)' }}>
            <TrendingDown size={20} color="#fff" />
          </Box>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 900, letterSpacing: '-0.02em' }}>{t('exp.title')}</Typography>
            <Typography variant="caption" color="text.secondary">{t('exp.subtitle')}</Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: { xs: 0.75, sm: 1 }, alignItems: 'center', width: { xs: '100%', sm: 'auto' } }}>
          <Tooltip title="More options">
            <IconButton onClick={e => setMoreAnchor(e.currentTarget)} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '8px' }}>
              <MoreHorizontal size={18} />
            </IconButton>
          </Tooltip>
          <Menu anchorEl={moreAnchor} open={Boolean(moreAnchor)} onClose={() => setMoreAnchor(null)}
            PaperProps={{ sx: { borderRadius: 2, minWidth: 180, boxShadow: '0 4px 20px rgba(0,0,0,0.12)' } }}>
            <MenuItem onClick={() => { setBulkAddOpen(true); setMoreAnchor(null); }} sx={{ gap: 1.5, py: 1 }}>
              <ListPlus size={16} /> Bulk Add Expenses
            </MenuItem>
            <MenuItem onClick={() => { exportToExcel(expenses, EXPENSE_COLUMNS, 'expenses_export.xlsx'); setMoreAnchor(null); }} sx={{ gap: 1.5, py: 1 }}>
              <Download size={16} /> Export Excel
            </MenuItem>
          </Menu>
          <Button variant="contained" disabled={!canWrite} startIcon={<Plus size={16} />} onClick={() => handleOpen()}
            sx={{ flex: { xs: 1, sm: 'none' }, fontWeight: 700, textTransform: 'none' }}>
            Add Expense
          </Button>
        </Box>
      </Box>

      {/* Stat strip */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: { xs: 1.25, md: 2 }, mb: 2.5 }}>
        {[
          { label: t('exp.totalFiltered'), value: fmt(totalExpenses), icon: <DollarSign size={18} />, color: '#dc2626' },
          { label: t('dash.thisMonth'), value: fmt(thisMonthTotal), icon: <CalendarDays size={18} />, color: '#d97706' },
          { label: t('exp.entries'), value: String(expenseCount), icon: <Receipt size={18} />, color: '#111111' },
          { label: t('exp.avgEntry'), value: fmt(avgExpense), icon: <TrendingDown size={18} />, color: '#0891b2' },
        ].map((s) => (
          <Card key={s.label} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5, bgcolor: alpha(s.color, 0.04) }}>
            <CardContent sx={{ p: { xs: 1.5, md: 2 }, '&:last-child': { pb: { xs: 1.5, md: 2 } } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Box sx={{ color: s.color, display: 'flex' }}>{s.icon}</Box>
                <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</Typography>
              </Box>
              <Typography sx={{ fontSize: { xs: '1.05rem', md: '1.35rem' }, fontWeight: 800, color: s.color, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{s.value}</Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      <Card elevation={0} sx={{ mb: 2, border: '1px solid', borderColor: 'divider' }}>
        <CardContent>
          <TextField
            fullWidth
            size="small"
            placeholder="Search expenses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={18} />
                </InputAdornment>
              ),
            }}
            sx={{ mb: 3 }}
          />

          {/* Filter Controls */}
          <Box sx={{ mb: 3 }}>
            <Button 
              onClick={() => setShowFilters(!showFilters)}
              variant="outlined"
              size="small"
              sx={{ mr: 2 }}
            >
              {showFilters ? 'Hide Filters' : 'Show Filters'}
            </Button>
            {(filters.dateFrom || filters.dateTo || filters.category !== 'all' || filters.minAmount || filters.maxAmount || filters.sortBy !== 'date' || filters.sortOrder !== 'desc') && (
              <Button 
                onClick={() => setFilters({ dateFrom: '', dateTo: '', category: 'all', minAmount: '', maxAmount: '', sortBy: 'date', sortOrder: 'desc' })}
                variant="text"
                size="small"
                color="error"
              >
                Clear Filters
              </Button>
            )}
          </Box>
          
          {showFilters && (
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  fullWidth
                  label="From Date"
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters({...filters, dateFrom: e.target.value})}
                  InputLabelProps={{ shrink: true }}
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  fullWidth
                  label="To Date"
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters({...filters, dateTo: e.target.value})}
                  InputLabelProps={{ shrink: true }}
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  select
                  fullWidth
                  label="Category"
                  value={filters.category}
                  onChange={(e) => setFilters({...filters, category: e.target.value})}
                  size="small"
                >
                  <MenuItem value="all">All Categories</MenuItem>
                  {EXPENSE_CATEGORIES.map(cat => (
                    <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  fullWidth
                  label="Min Amount"
                  type="number"
                  value={filters.minAmount}
                  onChange={(e) => setFilters({...filters, minAmount: e.target.value})}
                  InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  fullWidth
                  label="Max Amount"
                  type="number"
                  value={filters.maxAmount}
                  onChange={(e) => setFilters({...filters, maxAmount: e.target.value})}
                  InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                  size="small"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  select
                  fullWidth
                  label="Sort By"
                  value={filters.sortBy}
                  onChange={(e) => setFilters({...filters, sortBy: e.target.value})}
                  size="small"
                >
                  <MenuItem value="date">Date</MenuItem>
                  <MenuItem value="amount">Amount</MenuItem>
                  <MenuItem value="category">Category</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
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

          {/* Mobile: card list */}
          <Box sx={{ display: { xs: 'flex', sm: 'none' }, flexDirection: 'column', gap: 1.25 }}>
            {filteredExpenses.length === 0 ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 6, opacity: 0.5 }}>
                <DollarSign size={32} strokeWidth={1.5} />
                <Typography variant="body2" sx={{ fontWeight: 500 }}>{t('exp.noExpenses')}</Typography>
              </Box>
            ) : (
              filteredExpenses.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((expense) => (
                <Card key={expense.id} variant="outlined" sx={{ borderRadius: 2 }}>
                  <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Chip label={expense.category} size="small" variant="outlined" sx={{ fontWeight: 700, fontSize: '0.68rem', height: 20, mb: 0.5 }} />
                        <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>{expense.description}</Typography>
                        <Typography variant="caption" color="text.secondary">{expense.date}</Typography>
                      </Box>
                      <Typography sx={{ fontWeight: 800, color: 'error.main', fontSize: '1.05rem', flexShrink: 0 }}>₹{Number(expense.amount).toFixed(2)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 0.5, mt: 1 }}>
                      {[
                        { icon: <Eye size={17} />, onClick: () => { setPreviewRecord(expense); setPreviewOpen(true); }, color: '#111111' },
                        { icon: <Share2 size={17} />, onClick: () => handleShare(expense), color: '#25D366' },
                        { icon: <Edit2 size={17} />, onClick: () => handleOpen(expense), color: '#111111' },
                        { icon: <Trash2 size={17} />, onClick: () => handleDelete(expense.id), color: '#dc2626' },
                      ].map((a, i) => (
                        <IconButton key={i} size="small" onClick={a.onClick} sx={{ flex: 1, borderRadius: 1.5, color: a.color, bgcolor: alpha(a.color, 0.08), '&:hover': { bgcolor: alpha(a.color, 0.16) } }}>
                          {a.icon}
                        </IconButton>
                      ))}
                    </Box>
                  </CardContent>
                </Card>
              ))
            )}
          </Box>

          {/* Desktop / tablet: table */}
          <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, display: { xs: 'none', sm: 'block' } }}>
            <Table sx={{ minWidth: 650 }}>
              <TableHead sx={{ bgcolor: 'rgba(0,0,0,0.02)' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 800, py: 2 }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 800, py: 2 }}>Category</TableCell>
                  <TableCell sx={{ fontWeight: 800, py: 2 }}>Description</TableCell>
                  <TableCell sx={{ fontWeight: 800, py: 2 }} align="right">Amount</TableCell>
                  <TableCell sx={{ fontWeight: 800, py: 2 }} align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredExpenses
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((expense) => (
                  <TableRow key={expense.id} hover>
                    <TableCell>{expense.date}</TableCell>
                    <TableCell>
                      <Chip label={expense.category} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>{expense.description}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, color: 'error.main' }}>
                      ₹{expense.amount.toFixed(2)}
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => { setPreviewRecord(expense); setPreviewOpen(true); }} color="primary" title="Preview Voucher">
                        <Eye size={16} />
                      </IconButton>
                      <IconButton 
                        size="small" 
                        sx={{ color: '#25D366' }}
                        onClick={() => handleShare(expense)} 
                        title="Share on WhatsApp"
                      >
                        <Share2 size={16} />
                      </IconButton>
                      <IconButton size="small" onClick={() => handleOpen(expense)} color="primary">
                        <Edit2 size={16} />
                      </IconButton>
                      <IconButton size="small" onClick={() => handleDelete(expense.id)} color="error">
                        <Trash2 size={16} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredExpenses.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 8 }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, opacity: 0.5 }}>
                        <DollarSign size={32} strokeWidth={1.5} />
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>{t('exp.noExpenses')}</Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            component="div"
            count={filteredExpenses.length}
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

      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth fullScreen={isMobile}
        slotProps={{ paper: { sx: { borderRadius: isMobile ? 0 : 3 } } }}>
        <form onSubmit={handleSubmit}>
          <Box sx={{ background: 'linear-gradient(135deg, #18181b, #3f3f46)', px: 3, py: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{ p: 0.75, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.18)', display: 'flex' }}><TrendingDown size={18} color="#fff" /></Box>
            <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: '1.05rem', flex: 1 }}>{editingExpense ? t('exp.editExpense') : t('exp.addNew')}</Typography>
            <IconButton size="small" onClick={handleClose} sx={{ color: 'rgba(255,255,255,0.85)' }}><X size={18} /></IconButton>
          </Box>
          <DialogContent dividers sx={{ p: 2.5 }}>
            {/* Amount — prominent */}
            <TextField
              fullWidth
              type="number"
              label="Amount"
              value={formData.amount || ''}
              onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
              onFocus={(e) => e.target.select()}
              required={formData.paymentMode !== 'Split'}
              disabled={formData.paymentMode === 'Split'}
              slotProps={{
                input: { startAdornment: <InputAdornment position="start"><Typography sx={{ fontWeight: 800, fontSize: '1.2rem', color: 'error.main' }}>₹</Typography></InputAdornment> },
                htmlInput: { min: 0, step: 0.01, style: { fontSize: '1.4rem', fontWeight: 800 } },
              }}
              sx={{ mb: 2.5 }}
            />

            {/* Category chips */}
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', mb: 1 }}>Category</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2.5 }}>
              {EXPENSE_CATEGORIES.map((cat) => (
                <Chip
                  key={cat}
                  label={cat}
                  clickable
                  onClick={() => setFormData({ ...formData, category: cat })}
                  color={formData.category === cat ? 'primary' : 'default'}
                  variant={formData.category === cat ? 'filled' : 'outlined'}
                  sx={{ fontWeight: formData.category === cat ? 700 : 500 }}
                />
              ))}
            </Box>

            {/* Payment mode */}
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', mb: 1 }}>{t('pay.paymentMode')}</Typography>
            <ToggleButtonGroup
              exclusive size="small" value={formData.paymentMode || 'Cash'}
              onChange={(_e, v) => { if (v) setFormData({ ...formData, paymentMode: v }); }}
              sx={{ mb: formData.paymentMode === 'Split' ? 1.5 : 2.5, '& .MuiToggleButton-root': { textTransform: 'none', fontWeight: 600, px: 2 } }}
            >
              <ToggleButton value="Cash">Cash</ToggleButton>
              <ToggleButton value="Bank">Bank</ToggleButton>
              <ToggleButton value="Split">Split</ToggleButton>
            </ToggleButtonGroup>
            {formData.paymentMode === 'Split' && (
              <Box sx={{ mb: 2.5 }}>
                <SplitPaymentInput
                  cash={splitCash} onCashChange={setSplitCash}
                  bank={splitBank} onBankChange={setSplitBank}
                  total={undefined}
                />
              </Box>
            )}

            <TextField
              fullWidth
              type="date"
              label="Date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              required
              slotProps={{
                inputLabel: { shrink: true },
                input: { startAdornment: <InputAdornment position="start"><Calendar size={18} color={alpha('#111111', 0.6)} /></InputAdornment> },
              }}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              label="Description"
              placeholder="What was this expense for? (optional)"
              multiline
              rows={2}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              slotProps={{ input: { startAdornment: <InputAdornment position="start" sx={{ alignSelf: 'flex-start', mt: 1.5 }}><FileText size={18} color={alpha('#111111', 0.6)} /></InputAdornment> } }}
            />
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={handleClose} sx={{ textTransform: 'none' }}>Cancel</Button>
            <Button type="submit" variant="contained" sx={{ textTransform: 'none', fontWeight: 700, px: 3 }}>Save Expense</Button>
          </DialogActions>
        </form>
      </Dialog>

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

      <ExpenseBulkAddDialog
        open={bulkAddOpen}
        onClose={() => setBulkAddOpen(false)}
        onSuccess={count => { setBulkAddOpen(false); showSnackbar(`${count} expense${count !== 1 ? 's' : ''} added successfully!`, 'success'); }}
      />

      {/* Preview dialog */}
      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} maxWidth="md" fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.22)' } }}>
        {/* Gradient header */}
        <Box sx={{ background: 'linear-gradient(135deg, #6366f1 0%, #a5b4fc 100%)', px: 3, py: 2.5, display: 'flex', alignItems: 'flex-start', gap: 2, flexShrink: 0 }}>
          <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', mt: 0.5, flexShrink: 0 }}>
            <Eye size={18} color="white" />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.72)', fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.1em', lineHeight: 1 }}>
              Expense Preview
            </Typography>
            <Typography variant="h6" sx={{ color: 'white', fontWeight: 800, mt: 0.5, fontSize: '1.05rem' }}>
              {previewRecord?.category || '—'}
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, mt: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
              {previewRecord?.date && (
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>{previewRecord.date}</Typography>
              )}
              {previewRecord?.description && (
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>{previewRecord.description}</Typography>
              )}
              {previewRecord?.amount != null && (
                <Box sx={{ px: 1.25, py: 0.25, bgcolor: 'rgba(255,255,255,0.18)', borderRadius: '100px', border: '1px solid rgba(255,255,255,0.25)' }}>
                  <Typography variant="caption" sx={{ color: 'white', fontWeight: 800, fontSize: '0.8rem' }}>₹{previewRecord.amount.toFixed(2)}</Typography>
                </Box>
              )}
            </Box>
          </Box>
          <IconButton onClick={() => setPreviewOpen(false)} size="small" sx={{ color: 'rgba(255,255,255,0.75)', mt: -0.5, '&:hover': { color: 'white', bgcolor: 'rgba(255,255,255,0.12)' } }}>
            <X size={18} />
          </IconButton>
        </Box>
        {/* Toolbar */}
        <Box sx={{ px: 2.5, py: 1.25, display: 'flex', alignItems: 'center', gap: 2, borderBottom: '1px solid rgba(0,0,0,0.08)', bgcolor: 'rgba(0,0,0,0.015)', flexShrink: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.secondary', fontSize: '0.8rem' }}>Page Size</Typography>
            <TextField select size="small" value={paperSize} onChange={(e) => setPaperSize(e.target.value)} sx={{ minWidth: 84, '& .MuiOutlinedInput-root': { borderRadius: 1 } }}>
              {['A3', 'A4', 'A5', 'A6', 'Letter', 'Legal', 'Executive', 'Statement'].map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </TextField>
          </Box>
          <Box sx={{ flex: 1 }} />
          <Button startIcon={<Printer size={15} />} variant="contained" size="small" disableElevation
            onClick={() => { setPrintingData(previewRecord); setPreviewOpen(false); setTimeout(() => handlePrint(), 100); }}
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 1.5, bgcolor: '#3f3f46', '&:hover': { bgcolor: '#9d174d' } }}>
            Print
          </Button>
        </Box>
        {/* Scrollable preview — auto-scaled to fit */}
        <Box sx={{ flex: 1, overflow: 'auto', bgcolor: '#e8eaed', p: { xs: 1.5, sm: 3 } }}>
          <FitPreview>
            <ExpenseTemplate data={previewRecord} business={currentBusiness} paperSize={paperSize} />
          </FitPreview>
        </Box>
      </Dialog>
    </Box>
  );
};

export default ExpensesPage;