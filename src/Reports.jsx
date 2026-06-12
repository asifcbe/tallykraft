import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Box, Typography, Grid, Card, CardContent, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper,
  TextField, MenuItem, Button, Stack,
  Autocomplete, alpha, useTheme, Chip
} from '@mui/material';
import {
  FileText, Filter, Printer, Download, Search, Share2,
  ArrowUpRight, ArrowDownRight, TrendingUp, Receipt, Wallet,
  BarChart2, Package
} from 'lucide-react';
import { useBusiness } from './BusinessContext';
import { useData } from './DataContext';
import { useI18n } from './i18n/I18nContext';
import { useFinancialYear } from './FinancialYearContext';
import { useConfig } from './ConfigContext';
import { useReactToPrint } from 'react-to-print';
import ReportTemplate from './ReportTemplate';
import PartySelect from './PartySelect';
import ItemSelect from './ItemSelect';

const ReportsPage = () => {
  const theme = useTheme();
  const { currentBusiness } = useBusiness();
  const { activeFY, currentFY } = useFinancialYear();
  const { getItems } = useData();
  const { t } = useI18n();
  const { config } = useConfig();
  const reportRef = useRef();
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

  // States
  const [reportType, setReportType] = useState('sales'); // sales, purchases, ..., net-balance
  const [filters, setFilters] = useState({
    dateFrom: new Date().toISOString().split('T')[0],
    dateTo: new Date().toISOString().split('T')[0],
    partyId: '',
    itemId: ''
  });



  // Data
  const sales = getItems('sales').filter(s => s.businessId === currentBusiness?.id);
  const purchases = getItems('purchases').filter(p => p.businessId === currentBusiness?.id);
  const parties = getItems('parties').filter(p => p.businessId === currentBusiness?.id);
  const items = getItems('items').filter(i => i.businessId === currentBusiness?.id);
  const payments = getItems('payments').filter(p => p.businessId === currentBusiness?.id);
  const expenses = getItems('expenses').filter(e => e.businessId === currentBusiness?.id);
  const journalEntries = getItems('journalEntries').filter(j => j.businessId === currentBusiness?.id);

  const filteredData = useMemo(() => {
    let data = [];
    if (reportType === 'sales' || reportType === 'items-sales') data = sales;
    if (reportType === 'purchases' || reportType === 'items-purchase') data = purchases;
    
    return data.filter(tx => {
      const matchesDate = tx.date >= filters.dateFrom && tx.date <= filters.dateTo;
      const matchesParty = !filters.partyId || tx.partyId === filters.partyId;
      const matchesItem = !filters.itemId || tx.items.some(i => i.itemId === filters.itemId);
      return matchesDate && matchesParty && matchesItem;
    });
  }, [reportType, sales, purchases, filters]);

  // Specific Report Generation Logic
  const reportConfig = useMemo(() => {
    const config = {
      title: '',
      columns: [],
      rows: [],
      totals: {}
    };

    if (reportType === 'sales' || reportType === 'purchases') {
      config.title = reportType === 'sales' ? 'Sales Detail Report' : 'Purchase Detail Report';
      config.columns = [
        { key: 'date', header: 'Date' },
        { key: 'invoiceNumber', header: 'Invoice #' },
        { key: 'partyName', header: reportType === 'sales' ? 'Customer' : 'Vendor' },
        { key: 'subtotal', header: 'Subtotal', align: 'right', isTotal: true },
        { key: 'taxAmount', header: 'Tax', align: 'right', isTotal: true },
        { key: 'totalAmount', header: 'Total', align: 'right', isTotal: true }
      ];
      config.rows = filteredData.map(tx => ({
        ...tx,
        subtotal: `₹${tx.subtotal.toFixed(2)}`,
        taxAmount: `₹${tx.taxAmount.toFixed(2)}`,
        totalAmount: `₹${tx.totalAmount.toFixed(2)}`
      }));
      config.totals = {
        subtotal: filteredData.reduce((s, tx) => s + tx.subtotal, 0),
        taxAmount: filteredData.reduce((s, tx) => s + tx.taxAmount, 0),
        totalAmount: filteredData.reduce((s, tx) => s + tx.totalAmount, 0)
      };
    } else if (reportType === 'items-sales' || reportType === 'items-purchase') {
      config.title = reportType === 'items-sales' ? 'Item-wise Sales Report' : 'Item-wise Purchase Report';
      config.columns = [
        { key: 'itemName', header: 'Item Name' },
        { key: 'qty', header: 'Qty Sold', align: 'right', isTotal: true },
        { key: 'avgPrice', header: 'Avg Price', align: 'right' },
        { key: 'totalAmount', header: 'Total Value', align: 'right', isTotal: true }
      ];
      
      const itemStats = {};
      filteredData.forEach(tx => {
        tx.items.forEach(item => {
          if (filters.itemId && item.itemId !== filters.itemId) return;
          if (!itemStats[item.itemId]) {
            itemStats[item.itemId] = { itemName: item.name, qty: 0, totalAmount: 0 };
          }
          itemStats[item.itemId].qty += item.qty;
          itemStats[item.itemId].totalAmount += (item.qty * item.price);
        });
      });

      config.rows = Object.values(itemStats).map(stat => ({
        ...stat,
        avgPrice: `₹${(stat.totalAmount / stat.qty).toFixed(2)}`,
        qty: stat.qty.toString(),
        totalAmount: `₹${stat.totalAmount.toFixed(2)}`
      }));

      config.totals = {
        qty: Object.values(itemStats).reduce((s, i) => s + i.qty, 0),
        totalAmount: Object.values(itemStats).reduce((s, i) => s + i.totalAmount, 0)
      };
    } else if (reportType === 'gst') {
      config.title = 'GST Summary (Sales)';
      config.columns = [
        { key: 'taxRate', header: 'Tax Rate (%)' },
        { key: 'taxableValue', header: 'Taxable Value', align: 'right', isTotal: true },
        { key: 'cgst', header: 'CGST (2.5% / 6% / 9%)', align: 'right', isTotal: true },
        { key: 'sgst', header: 'SGST (2.5% / 6% / 9%)', align: 'right', isTotal: true },
        { key: 'taxAmount', header: 'Total GST', align: 'right', isTotal: true }
      ];

      const gstStats = {};
      sales.filter(tx => tx.date >= filters.dateFrom && tx.date <= filters.dateTo).forEach(tx => {
        tx.items.forEach(item => {
          const rate = item.taxRate || 0;
          if (!gstStats[rate]) gstStats[rate] = { taxRate: `${rate}%`, taxableValue: 0, taxAmount: 0 };
          const taxable = item.qty * item.price;
          const tax = taxable * (rate / 100);
          gstStats[rate].taxableValue += taxable;
          gstStats[rate].taxAmount += tax;
        });
      });

      config.rows = Object.values(gstStats).map(stat => ({
        ...stat,
        taxableValue: `₹${stat.taxableValue.toFixed(2)}`,
        cgst: `₹${(stat.taxAmount / 2).toFixed(2)}`,
        sgst: `₹${(stat.taxAmount / 2).toFixed(2)}`,
        taxAmount: `₹${stat.taxAmount.toFixed(2)}`
      }));

      config.totals = {
        taxableValue: Object.values(gstStats).reduce((s, i) => s + i.taxableValue, 0),
        cgst: Object.values(gstStats).reduce((s, i) => s + i.taxAmount / 2, 0),
        sgst: Object.values(gstStats).reduce((s, i) => s + i.taxAmount / 2, 0),
        taxAmount: Object.values(gstStats).reduce((s, i) => s + i.taxAmount, 0)
      };
    } else if (reportType === 'profit-loss') {
      config.title = 'Profit & Loss Statement';
      config.columns = [
        { key: 'account', header: 'Particulars' },
        { key: 'amount', header: 'Amount', align: 'right', isTotal: true },
      ];
      const inRange = (d) => d >= filters.dateFrom && d <= filters.dateTo;
      const revenue = sales.filter(s => inRange(s.date)).reduce((a, s) => a + (s.totalAmount || 0), 0);
      const cogs = purchases.filter(p => inRange(p.date)).reduce((a, p) => a + (p.totalAmount || 0), 0);
      const grossProfit = revenue - cogs;
      // Operating expenses grouped by category.
      const expByCat = {};
      expenses.filter(e => inRange(e.date)).forEach(e => {
        const cat = e.category || 'Other';
        expByCat[cat] = (expByCat[cat] || 0) + (Number(e.amount) || 0);
      });
      const totalExpenses = Object.values(expByCat).reduce((a, v) => a + v, 0);
      const netProfit = grossProfit - totalExpenses;

      const rows = [
        { account: t('pl.revenue'), amount: `₹${revenue.toFixed(2)}`, _bold: true },
        { account: `(−) ${t('pl.cogs')}`, amount: `₹${cogs.toFixed(2)}` },
        { account: t('pl.grossProfit'), amount: `₹${grossProfit.toFixed(2)}`, _bold: true },
        { account: t('pl.expenses'), amount: '', _section: true },
        ...Object.entries(expByCat).map(([cat, amt]) => ({ account: `   ${cat}`, amount: `₹${amt.toFixed(2)}` })),
        { account: `${t('pl.expenses')} (Total)`, amount: `₹${totalExpenses.toFixed(2)}` },
        { account: netProfit >= 0 ? t('pl.netProfit') : t('pl.netLoss'), amount: `₹${Math.abs(netProfit).toFixed(2)}`, _bold: true },
      ];
      config.rows = rows;
      config.totals = {};
      config.summary = { revenue, cogs, grossProfit, totalExpenses, netProfit };
    } else if (reportType === 'trial-balance') {
      config.title = 'Trial Balance';
      config.columns = [
        { key: 'account', header: 'Account' },
        { key: 'debit', header: 'Debit', align: 'right', isTotal: true },
        { key: 'credit', header: 'Credit', align: 'right', isTotal: true }
      ];
      const accountBalances = {};
      const addToAccount = (name, debit, credit) => {
        if (!accountBalances[name]) accountBalances[name] = { account: name, debit: 0, credit: 0 };
        accountBalances[name].debit += debit || 0;
        accountBalances[name].credit += credit || 0;
      };
      journalEntries.filter(j => j.date >= filters.dateFrom && j.date <= filters.dateTo).forEach(j => {
        j.lines?.forEach(l => {
          addToAccount(l.account, l.debit || 0, l.credit || 0);
        });
      });
      config.rows = Object.values(accountBalances).map(r => ({
        account: r.account,
        debit: `₹${r.debit.toFixed(2)}`,
        credit: `₹${r.credit.toFixed(2)}`
      }));
      config.totals = {
        debit: Object.values(accountBalances).reduce((s, i) => s + i.debit, 0),
        credit: Object.values(accountBalances).reduce((s, i) => s + i.credit, 0)
      };
    } else if (reportType === 'aged-receivables') {
      config.title = 'Aged Receivables';
      config.columns = [
        { key: 'partyName', header: 'Customer' },
        { key: 'current', header: 'Current', align: 'right', isTotal: true },
        { key: 'days30', header: '1-30 Days', align: 'right', isTotal: true },
        { key: 'days60', header: '31-60 Days', align: 'right', isTotal: true },
        { key: 'days90', header: '61-90 Days', align: 'right', isTotal: true },
        { key: 'over90', header: 'Over 90 Days', align: 'right', isTotal: true },
        { key: 'total', header: 'Total', align: 'right', isTotal: true }
      ];
      const asOf = new Date(filters.dateTo || new Date().toISOString().split('T')[0]);
      const customers = parties.filter(p => p.type === 'Customer');
      const totals = { current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0 };
      const aged = customers.map(c => {
        // The party's balance is the canonical outstanding receivable (Sales,
        // Payments and POS all keep it net — a paid sale leaves it unchanged).
        // Re-deriving it from sales − payments here would double-count.
        const outstanding = (c.balance || 0);
        if (outstanding <= 0) return null;
        const lastSale = sales.filter(s => s.partyId === c.id).sort((a, b) => new Date(b.date) - new Date(a.date))[0];
        const days = lastSale ? Math.floor((asOf - new Date(lastSale.date)) / (24 * 60 * 60 * 1000)) : 0;
        let current = 0, d30 = 0, d60 = 0, d90 = 0, over90 = 0;
        if (days <= 0) current = outstanding;
        else if (days <= 30) d30 = outstanding;
        else if (days <= 60) d60 = outstanding;
        else if (days <= 90) d90 = outstanding;
        else over90 = outstanding;
        totals.current += current;
        totals.days30 += d30;
        totals.days60 += d60;
        totals.days90 += d90;
        totals.over90 += over90;
        totals.total += outstanding;
        return {
          partyName: c.name,
          current: `₹${current.toFixed(2)}`,
          days30: `₹${d30.toFixed(2)}`,
          days60: `₹${d60.toFixed(2)}`,
          days90: `₹${d90.toFixed(2)}`,
          over90: `₹${over90.toFixed(2)}`,
          total: `₹${outstanding.toFixed(2)}`
        };
      }).filter(Boolean);
      config.rows = aged;
      config.totals = totals;
    } else if (reportType === 'aged-payables') {
      config.title = 'Aged Payables';
      config.columns = [
        { key: 'partyName', header: 'Vendor' },
        { key: 'current', header: 'Current', align: 'right', isTotal: true },
        { key: 'days30', header: '1-30 Days', align: 'right', isTotal: true },
        { key: 'days60', header: '31-60 Days', align: 'right', isTotal: true },
        { key: 'days90', header: '61-90 Days', align: 'right', isTotal: true },
        { key: 'over90', header: 'Over 90 Days', align: 'right', isTotal: true },
        { key: 'total', header: 'Total', align: 'right', isTotal: true }
      ];
      const asOf = new Date(filters.dateTo || new Date().toISOString().split('T')[0]);
      const vendors = parties.filter(p => p.type === 'Vendor');
      const totals = { current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0 };
      const aged = vendors.map(c => {
        const partyPurchases = purchases.filter(p => p.partyId === c.id && p.date <= asOf).reduce((sum, p) => sum + (p.totalAmount || 0), 0);
        const partyPayments = payments.filter(p => p.partyId === c.id && p.date <= asOf && (p.mode === 'payment-out' || p.type === 'PaymentOut')).reduce((sum, p) => sum + (p.totalAmount || 0), 0);
        const outstanding = (c.balance || 0) + partyPurchases - partyPayments;
        if (outstanding >= 0) return null;
        const lastPurch = purchases.filter(p => p.partyId === c.id).sort((a, b) => new Date(b.date) - new Date(a.date))[0];
        const days = lastPurch ? Math.floor((asOf - new Date(lastPurch.date)) / (24 * 60 * 60 * 1000)) : 0;
        const absOut = Math.abs(outstanding);
        let current = 0, d30 = 0, d60 = 0, d90 = 0, over90 = 0;
        if (days <= 0) current = absOut;
        else if (days <= 30) d30 = absOut;
        else if (days <= 60) d60 = absOut;
        else if (days <= 90) d90 = absOut;
        else over90 = absOut;
        totals.current += current;
        totals.days30 += d30;
        totals.days60 += d60;
        totals.days90 += d90;
        totals.over90 += over90;
        totals.total += absOut;
        return {
          partyName: c.name,
          current: `₹${current.toFixed(2)}`,
          days30: `₹${d30.toFixed(2)}`,
          days60: `₹${d60.toFixed(2)}`,
          days90: `₹${d90.toFixed(2)}`,
          over90: `₹${over90.toFixed(2)}`,
          total: `₹${absOut.toFixed(2)}`
        };
      }).filter(Boolean);
      config.rows = aged;
      config.totals = totals;
    } else if (reportType === 'net-balance') {
      config.title = 'Net Balance – Customers to Receive';
      config.columns = [
        { key: 'partyName', header: 'Customer' },
        { key: 'lastBill', header: 'Last bill' },
        { key: 'totalBalance', header: 'Total balance', align: 'right', isTotal: true }
      ];
      const customers = parties.filter(p => p.type === 'Customer');
      const withBalance = customers
        .filter(c => (c.balance || 0) > 0)
        .map(c => {
          const customerSales = sales.filter(s => s.partyId === c.id);
          const lastSale = customerSales.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
          const lastDate = lastSale?.date;
          const dayTotal = lastDate
            ? customerSales.filter(s => s.date === lastDate).reduce((sum, s) => sum + (s.totalAmount || 0), 0)
            : 0;
          return {
            partyName: c.name,
            lastBill: lastDate ? `${lastDate} · ₹${dayTotal.toFixed(2)}` : '—',
            totalBalance: `₹${(c.balance || 0).toFixed(2)}`,
            _numericBalance: c.balance || 0
          };
        })
        .sort((a, b) => (a.partyName || '').localeCompare(b.partyName || ''));
      config.rows = withBalance.map(({ _numericBalance, ...r }) => r);
      config.totals = {
        totalBalance: withBalance.reduce((s, r) => s + r._numericBalance, 0)
      };
    }

    return config;
  }, [reportType, filteredData, filters, sales, purchases, parties, payments, expenses, journalEntries, t]);

  const handlePrint = useReactToPrint({
    contentRef: reportRef,
  });

  const handleShare = () => {
    const periodText = reportType === 'net-balance' ? 'From start to till date' : `${filters.dateFrom} to ${filters.dateTo}`;
    const text = `*Report from ${currentBusiness?.name || 'TallyKraft'}*\n\n` +
      `Report: ${reportConfig.title}\n` +
      `Period: ${periodText}\n\n` +
      `Shared via TallyKraft`;
    
    if (navigator.share) {
      navigator.share({ title: reportConfig.title, text }).catch(e => console.error(e));
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    }
  };

  return (
    <Box sx={{ maxWidth: 1440, mx: 'auto', pb: 3 }}>
      <Box sx={{ display: 'none' }}>
        <ReportTemplate 
          ref={reportRef}
          title={reportConfig.title}
          business={currentBusiness}
          filters={{
            ...filters,
            partyName: parties.find(p => p.id === filters.partyId)?.name,
            itemName: items.find(i => i.id === filters.itemId)?.name,
            ...(reportType === 'net-balance' && { periodLabel: 'From start to till date' })
          }}
          reportData={reportConfig}
          paperSize={paperSize}
        />
      </Box>

      {/* Hero Header */}
      <Box sx={{
        borderRadius: 3,
        background: 'linear-gradient(135deg, #3b0764 0%, #6d28d9 55%, #7c3aed 100%)',
        p: { xs: 2.5, md: 3.5 }, mb: 3,
        position: 'relative', overflow: 'hidden',
      }}>
        <Box sx={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
        <Box sx={{ position: 'absolute', bottom: -30, right: 100, width: 150, height: 150, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.03)', pointerEvents: 'none' }} />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
              <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.15)', display: 'flex' }}>
                <BarChart2 size={20} color="white" />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 800, color: 'white', letterSpacing: '-0.01em' }}>{t('rep.title')}</Typography>
            </Box>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.65)', pl: 0.5 }}>{t('rep.subtitle')}</Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
            <TextField
              select size="small" value={paperSize}
              onChange={(e) => setPaperSize(e.target.value)}
              sx={{ minWidth: 85, '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.12)', color: 'white', borderRadius: 1.5, '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' }, '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.4)' } }, '& .MuiSelect-icon': { color: 'white' } }}
              SelectProps={{ displayEmpty: true }}
            >
              <MenuItem value="A4">A4</MenuItem>
              <MenuItem value="A5">A5</MenuItem>
              <MenuItem value="Letter">Letter</MenuItem>
              <MenuItem value="Legal">Legal</MenuItem>
            </TextField>
            <Button variant="contained" size="small" startIcon={<Printer size={16} />} onClick={handlePrint}
              sx={{ bgcolor: 'white', color: '#6d28d9', fontWeight: 700, '&:hover': { bgcolor: 'rgba(255,255,255,0.9)' }, borderRadius: 1.5, textTransform: 'none' }}>
              Print
            </Button>
            <Button variant="outlined" size="small" startIcon={<Share2 size={16} />} onClick={handleShare}
              sx={{ color: '#25D366', borderColor: 'rgba(37,211,102,0.6)', '&:hover': { borderColor: '#128C7E', bgcolor: 'rgba(37,211,102,0.08)' }, borderRadius: 1.5, textTransform: 'none', fontWeight: 700 }}>
              Share
            </Button>
          </Stack>
        </Box>
      </Box>

      <Card elevation={0} sx={{ mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <CardContent sx={{ py: 2, px: 2 }}>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
            <Box sx={{ p: 0.75, borderRadius: 1, bgcolor: alpha(theme.palette.primary.main, 0.08), display: 'flex' }}>
              <Filter size={15} color={theme.palette.primary.main} />
            </Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{t('rep.filters')}</Typography>
          </Stack>
          
          {reportType === 'net-balance' ? (
            <Typography variant="body2" color="text.secondary">Net Balance shows all customers with outstanding balance — from start to till date. No date filter applied.</Typography>
          ) : (
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField 
                fullWidth label="From Date" type="date" value={filters.dateFrom}
                onChange={(e) => setFilters({...filters, dateFrom: e.target.value})}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField 
                fullWidth label="To Date" type="date" value={filters.dateTo}
                onChange={(e) => setFilters({...filters, dateTo: e.target.value})}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <PartySelect
                options={parties}
                value={parties.find(p => p.id === filters.partyId) || null}
                onChange={(v) => setFilters({...filters, partyId: v?.id || ''})}
                label="Filter by Party"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <ItemSelect
                options={items}
                value={items.find(i => i.id === filters.itemId) || null}
                onChange={(v) => setFilters({...filters, itemId: typeof v === 'string' ? '' : v?.id || ''})}
                placeholder="Filter by Item"
              />
            </Grid>
          </Grid>
          )}
        </CardContent>
      </Card>

      {/* Custom scrollable pill tabs */}
      <Box sx={{ mb: 2, overflowX: 'auto', pb: 0.5, '&::-webkit-scrollbar': { height: 4 }, '&::-webkit-scrollbar-track': { bgcolor: 'transparent' }, '&::-webkit-scrollbar-thumb': { bgcolor: alpha(theme.palette.primary.main, 0.2), borderRadius: 2 } }}>
        <Box sx={{ display: 'flex', gap: 0.75, width: 'max-content', p: 0.5, bgcolor: alpha(theme.palette.primary.main, 0.05), borderRadius: 2.5, border: '1px solid', borderColor: 'divider' }}>
          {[
            { value: 'sales', label: 'Sales', icon: TrendingUp },
            { value: 'purchases', label: 'Purchases', icon: Receipt },
            { value: 'items-sales', label: 'Item Sales', icon: Package },
            { value: 'items-purchase', label: 'Item Purchases', icon: Package },
            { value: 'profit-loss', label: t('pl.title'), icon: TrendingUp },
            { value: 'gst', label: 'GST', icon: FileText },
            { value: 'trial-balance', label: 'Trial Balance', icon: FileText },
            { value: 'aged-receivables', label: 'Aged Rec.', icon: ArrowUpRight },
            { value: 'aged-payables', label: 'Aged Pay.', icon: ArrowDownRight },
            { value: 'net-balance', label: 'Net Balance', icon: Wallet },
          ].map(({ value, label, icon: Icon }) => (
            <Box key={value} onClick={() => setReportType(value)} sx={{
              display: 'flex', alignItems: 'center', gap: 0.75,
              px: 1.75, py: 0.75, borderRadius: 2, cursor: 'pointer',
              bgcolor: reportType === value ? 'background.paper' : 'transparent',
              boxShadow: reportType === value ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
              color: reportType === value ? 'primary.main' : 'text.secondary',
              fontWeight: reportType === value ? 700 : 500,
              fontSize: '0.825rem',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s',
              userSelect: 'none',
              '&:hover': { color: reportType === value ? 'primary.main' : 'text.primary', bgcolor: reportType === value ? 'background.paper' : alpha(theme.palette.primary.main, 0.04) },
            }}>
              <Icon size={14} />
              {label}
            </Box>
          ))}
        </Box>
      </Box>

      {/* Report Title + Record Count */}
      {reportConfig.rows.length > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{reportConfig.title}</Typography>
          <Chip label={`${reportConfig.rows.length} record${reportConfig.rows.length !== 1 ? 's' : ''}`} size="small"
            sx={{ fontWeight: 700, bgcolor: alpha(theme.palette.primary.main, 0.08), color: 'primary.main', border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}` }} />
        </Box>
      )}

      {/* Report View */}
      <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
        <Table size="small" sx={{ minWidth: 650 }}>
          <TableHead sx={{ bgcolor: 'rgba(0,0,0,0.02)', borderBottom: '2px solid', borderColor: 'divider' }}>
            <TableRow>
              {reportConfig.columns.map((col, idx) => (
                <TableCell key={idx} align={col.align || 'left'} sx={{ fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary', py: 1.5 }}>
                  {col.header}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {reportConfig.rows.map((row, rowIdx) => (
              <TableRow key={rowIdx} hover>
                {reportConfig.columns.map((col, colIdx) => (
                  <TableCell key={colIdx} align={col.align || 'left'}>
                    {row[col.key]}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {reportConfig.rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={reportConfig.columns.length} align="center" sx={{ py: 6 }}>
                  <Stack alignItems="center" spacing={1} sx={{ opacity: 0.6 }}>
                    <Search size={32} />
                    <Typography variant="body2">{t('rep.noRecords')}</Typography>
                  </Stack>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          {reportConfig.rows.length > 0 && (
            <TableHead sx={{ bgcolor: alpha(theme.palette.primary.main, 0.04) }}>
              <TableRow>
                {reportConfig.columns.map((col, idx) => (
                  <TableCell key={idx} align={col.align || 'left'} sx={{ fontWeight: 600, fontSize: '0.75rem' }}>
                    {col.isTotal && reportConfig.totals[col.key] != null ? `₹${Number(reportConfig.totals[col.key]).toFixed(2)}` : idx === 0 ? 'TOTAL' : ''}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
          )}
        </Table>
      </TableContainer>
    </Box>
  );
};

export default ReportsPage;

