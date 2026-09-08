import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  Box, Typography, Grid, Card, CardContent, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper,
  TextField, MenuItem, Button, Stack, IconButton, Tooltip,
  alpha, useTheme, Chip, Select, FormControl, InputLabel,
} from '@mui/material';
import {
  FileText, Filter, Printer, Download, Search, Share2,
  ArrowUpRight, ArrowDownRight, TrendingUp, Receipt, Wallet,
  BarChart2, Package, FileDown,
} from 'lucide-react';
import { useBusiness } from './BusinessContext';
import { useData } from './DataContext';
import { useI18n } from './i18n/I18nContext';
import { useConfig } from './ConfigContext';
import { useSubscription } from './SubscriptionContext';
import { useReactToPrint } from 'react-to-print';
import ReportTemplate from './ReportTemplate';
import InvoiceTemplate from './InvoiceTemplate';
import PartySelect from './PartySelect';
import ItemSelect from './ItemSelect';

// ── GST export helpers ──────────────────────────────────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function getMonthYear(dateStr) {
  if (!dateStr) return null;
  const [y, m] = dateStr.split('-');
  return { month: parseInt(m, 10) - 1, year: parseInt(y, 10) };
}

function csvRow(cells) {
  return cells.map(c => {
    const s = String(c ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }).join(',');
}

function downloadCSV(filename, rows) {
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function downloadExcel(filename, sheetName, data) {
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

function csvRowsToAoa(csvRows) {
  return csvRows.map(row =>
    row.split(',').map(cell => {
      const s = cell.trim();
      if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1).replace(/""/g, '"');
      const n = Number(s);
      return isNaN(n) || s === '' ? s : n;
    })
  );
}

function buildGSTR1(sales, parties, month, year) {
  const rows = [
    csvRow(['GSTIN of Recipient','Receiver Name','Invoice Number','Invoice Date',
      'Invoice Value','Place of Supply','Reverse Charge','Applicable % of Tax Rate',
      'Invoice Type','E-Commerce GSTIN','Rate(%)','Taxable Value','Cess Amount']),
  ];
  sales.forEach(tx => {
    const my = getMonthYear(tx.date);
    if (!my || my.month !== month || my.year !== year) return;
    const party = parties.find(p => p.id === tx.partyId);
    if (!party) return;
    const gstIn = party.gstNumber || '';
    const pos = tx.placeOfSupply || party.state || '';
    const rchrg = tx.reverseCharge ? 'Y' : 'N';
    const invoiceValue = (tx.totalAmount || 0).toFixed(2);
    (tx.items || []).forEach(item => {
      const taxable = (item.qty * item.price).toFixed(2);
      rows.push(csvRow([gstIn, party.name, tx.invoiceNumber, tx.date,
        invoiceValue, pos, rchrg, '', 'Regular', '',
        item.taxRate || 0, taxable, 0]));
    });
  });
  return rows;
}

function buildGSTR1A(sales, parties, month, year) {
  const rows = [
    csvRow(['Original Invoice Number','Original Invoice Date','Revised Invoice Number',
      'Revised Invoice Date','GSTIN of Recipient','Receiver Name',
      'Invoice Value','Taxable Value','Rate(%)','IGST','CGST','SGST']),
  ];
  sales
    .filter(tx => {
      const my = getMonthYear(tx.date);
      return my && my.month === month && my.year === year && tx.originalInvoiceNumber;
    })
    .forEach(tx => {
      const party = parties.find(p => p.id === tx.partyId);
      const totalTax = (tx.taxAmount || 0);
      rows.push(csvRow([
        tx.originalInvoiceNumber, tx.originalInvoiceDate || '',
        tx.invoiceNumber, tx.date,
        party?.gstNumber || '', party?.name || '',
        (tx.totalAmount || 0).toFixed(2),
        (tx.subtotal || 0).toFixed(2),
        '',
        (tx.isInterState ? totalTax : 0).toFixed(2),
        (tx.isInterState ? 0 : totalTax / 2).toFixed(2),
        (tx.isInterState ? 0 : totalTax / 2).toFixed(2),
      ]));
    });
  return rows;
}

function buildGSTR2B(purchases, parties, month, year) {
  const rows = [
    csvRow(['GSTIN of Supplier','Trade/Legal Name','Invoice Number','Invoice Date',
      'Invoice Type','Invoice Value','Place of Supply','Rate(%)','Taxable Value',
      'IGST','CGST','SGST','CESS','ITC Availability']),
  ];
  purchases.forEach(tx => {
    const my = getMonthYear(tx.date);
    if (!my || my.month !== month || my.year !== year) return;
    const party = parties.find(p => p.id === tx.partyId);
    const interState = tx.isInterState;
    (tx.items || []).forEach(item => {
      const taxable = item.qty * item.price;
      const tax = taxable * ((item.taxRate || 0) / 100);
      rows.push(csvRow([
        party?.gstNumber || '', party?.name || '',
        tx.invoiceNumber, tx.date,
        tx.reverseCharge ? 'RCM' : 'Regular',
        (tx.totalAmount || 0).toFixed(2),
        tx.placeOfSupply || party?.state || '',
        item.taxRate || 0, taxable.toFixed(2),
        (interState ? tax : 0).toFixed(2),
        (interState ? 0 : tax / 2).toFixed(2),
        (interState ? 0 : tax / 2).toFixed(2),
        0, 'Yes',
      ]));
    });
  });
  return rows;
}

function buildGSTR3B(sales, purchases, expenses, month, year) {
  let outwardTaxable = 0, outwardTax = 0;
  let inwardItc = 0;
  let exemptSupplies = 0;

  sales.forEach(tx => {
    const my = getMonthYear(tx.date);
    if (!my || my.month !== month || my.year !== year) return;
    outwardTaxable += tx.subtotal || 0;
    outwardTax += tx.taxAmount || 0;
    if (!tx.taxAmount) exemptSupplies += tx.subtotal || 0;
  });

  purchases.forEach(tx => {
    const my = getMonthYear(tx.date);
    if (!my || my.month !== month || my.year !== year) return;
    inwardItc += tx.taxAmount || 0;
  });

  const netTaxLiability = Math.max(0, outwardTax - inwardItc);

  return [
    csvRow(['Description', 'Amount (₹)']),
    csvRow(['=== GSTR-3B SUMMARY ===']),
    csvRow([`Period: ${MONTHS[month]} ${year}`]),
    csvRow(['']),
    csvRow(['3.1 Outward Taxable Supplies']),
    csvRow(['Taxable Value', outwardTaxable.toFixed(2)]),
    csvRow(['Central Tax (CGST)', (outwardTax / 2).toFixed(2)]),
    csvRow(['State Tax (SGST)', (outwardTax / 2).toFixed(2)]),
    csvRow(['']),
    csvRow(['3.2 Nil Rated / Exempted Supplies', exemptSupplies.toFixed(2)]),
    csvRow(['']),
    csvRow(['4. Eligible ITC']),
    csvRow(['ITC from Purchases (CGST+SGST)', inwardItc.toFixed(2)]),
    csvRow(['']),
    csvRow(['5. Net Tax Payable']),
    csvRow(['Net Liability (after ITC set-off)', netTaxLiability.toFixed(2)]),
  ];
}

function buildCMP08(sales, quarter, year) {
  const quarterMonths = { Q1:[3,4,5], Q2:[6,7,8], Q3:[9,10,11], Q4:[0,1,2] };
  const months = quarterMonths[quarter];

  let turnover = 0, taxLiability = 0;
  sales.forEach(tx => {
    const my = getMonthYear(tx.date);
    if (!my) return;
    const inQ = months.includes(my.month) && my.year === year;
    const inQNext = quarter === 'Q4' && [0,1,2].includes(my.month) && my.year === year + 1;
    if (!inQ && !inQNext) return;
    turnover += tx.totalAmount || 0;
    taxLiability += tx.taxAmount || 0;
  });

  const period = quarter === 'Q1' ? `Apr-Jun ${year}` :
    quarter === 'Q2' ? `Jul-Sep ${year}` :
    quarter === 'Q3' ? `Oct-Dec ${year}` :
    `Jan-Mar ${year + 1}`;

  return [
    csvRow(['CMP-08 — Quarterly Statement (Composition Dealer)']),
    csvRow([`Period: ${period}`]),
    csvRow(['']),
    csvRow(['Column', 'Amount (₹)']),
    csvRow(['(A) Turnover of outward supplies on which tax is payable', turnover.toFixed(2)]),
    csvRow(['(B) Turnover of outward supplies on which tax is not payable', '']),
    csvRow(['(C) Total Turnover (A + B)', turnover.toFixed(2)]),
    csvRow(['(D) Tax payable @ applicable rate', taxLiability.toFixed(2)]),
    csvRow(['(E) Interest payable, if any', '0.00']),
    csvRow(['(F) Late fee payable', '0.00']),
    csvRow(['(G) Total amount payable (D+E+F)', taxLiability.toFixed(2)]),
  ];
}

// ── Main component ──────────────────────────────────────────────────────────
const ReportsPage = () => {
  const theme = useTheme();
  const { currentBusiness } = useBusiness();
  const { getItems } = useData();
  const { t } = useI18n();
  const { config } = useConfig();
  const { isBusinessActive } = useSubscription();
  const canWrite = isBusinessActive(currentBusiness?.id);
  const reportRef = useRef();
  const billPrintRef = useRef();
  const [printingBill, setPrintingBill] = useState(null);
  const [paperSize, setPaperSize] = useState(() => {
    const d = config.defaultPaperSize;
    return ['A4', 'A5', 'Letter', 'Legal'].includes(d) ? d : 'A4';
  });
  useEffect(() => {
    if (config.defaultPaperSize) {
      const d = config.defaultPaperSize;
      if (['A4', 'A5', 'Letter', 'Legal'].includes(d)) setPaperSize(d);
    }
  }, [config.defaultPaperSize]);

  const [reportType, setReportType] = useState('sales');
  const now = new Date();
  const [filters, setFilters] = useState({
    dateFrom: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0],
    dateTo: new Date().toISOString().split('T')[0],
    partyId: '',
    itemId: '',
  });

  const [gstMonth, setGstMonth] = useState(now.getMonth());
  const [gstYear, setGstYear] = useState(now.getFullYear());
  const [gstQuarter, setGstQuarter] = useState('Q1');

  const sales = getItems('sales').filter(s => s.businessId === currentBusiness?.id);
  const purchases = getItems('purchases').filter(p => p.businessId === currentBusiness?.id);
  const parties = getItems('parties').filter(p => p.businessId === currentBusiness?.id);
  const items = getItems('items').filter(i => i.businessId === currentBusiness?.id);
  const payments = getItems('payments').filter(p => p.businessId === currentBusiness?.id);
  const expenses = getItems('expenses').filter(e => e.businessId === currentBusiness?.id);

  const isGstReport = ['gstr1','gstr1a','gstr2b','gstr3b','cmp08'].includes(reportType);

  const filteredData = useMemo(() => {
    let data = [];
    if (reportType === 'sales' || reportType === 'items-sales') data = sales;
    if (reportType === 'purchases' || reportType === 'items-purchase') data = purchases;
    return data.filter(tx => {
      const matchesDate = tx.date >= filters.dateFrom && tx.date <= filters.dateTo;
      const matchesParty = !filters.partyId || tx.partyId === filters.partyId;
      const matchesItem = !filters.itemId || (tx.items || []).some(i => i.itemId === filters.itemId);
      return matchesDate && matchesParty && matchesItem;
    });
  }, [reportType, sales, purchases, filters]);

  const reportConfig = useMemo(() => {
    const rc = { title: '', columns: [], rows: [], totals: {} };

    if (reportType === 'sales' || reportType === 'purchases') {
      rc.title = reportType === 'sales' ? 'Sales Detail Report' : 'Purchase Detail Report';
      rc.columns = [
        { key: 'date', header: 'Date' },
        { key: 'invoiceNumber', header: 'Invoice #' },
        { key: 'partyName', header: reportType === 'sales' ? 'Customer' : 'Vendor' },
        { key: 'subtotal', header: 'Subtotal', align: 'right', isTotal: true },
        { key: 'taxAmount', header: 'Tax', align: 'right', isTotal: true },
        { key: 'totalAmount', header: 'Total', align: 'right', isTotal: true },
      ];
      rc.rows = filteredData.map(tx => ({
        ...tx,
        subtotal: `₹${(tx.subtotal || 0).toFixed(2)}`,
        taxAmount: `₹${(tx.taxAmount || 0).toFixed(2)}`,
        totalAmount: `₹${(tx.totalAmount || 0).toFixed(2)}`,
      }));
      rc.totals = {
        subtotal: filteredData.reduce((s, tx) => s + (tx.subtotal || 0), 0),
        taxAmount: filteredData.reduce((s, tx) => s + (tx.taxAmount || 0), 0),
        totalAmount: filteredData.reduce((s, tx) => s + (tx.totalAmount || 0), 0),
      };
    } else if (reportType === 'items-sales' || reportType === 'items-purchase') {
      rc.title = reportType === 'items-sales' ? 'Item-wise Sales Report' : 'Item-wise Purchase Report';
      rc.columns = [
        { key: 'itemName', header: 'Item Name' },
        { key: 'qty', header: 'Qty', align: 'right', isTotal: true },
        { key: 'avgPrice', header: 'Avg Price', align: 'right' },
        { key: 'totalAmount', header: 'Total Value', align: 'right', isTotal: true },
      ];
      const itemStats = {};
      filteredData.forEach(tx => {
        (tx.items || []).forEach(item => {
          if (filters.itemId && item.itemId !== filters.itemId) return;
          if (!itemStats[item.itemId]) itemStats[item.itemId] = { itemName: item.name, qty: 0, totalAmount: 0 };
          itemStats[item.itemId].qty += item.qty;
          itemStats[item.itemId].totalAmount += item.qty * item.price;
        });
      });
      rc.rows = Object.values(itemStats).map(stat => ({
        ...stat,
        avgPrice: `₹${stat.qty ? (stat.totalAmount / stat.qty).toFixed(2) : '0.00'}`,
        qty: stat.qty,
        totalAmount: `₹${stat.totalAmount.toFixed(2)}`,
      }));
      rc.totals = {
        qty: Object.values(itemStats).reduce((s, i) => s + i.qty, 0),
        totalAmount: Object.values(itemStats).reduce((s, i) => s + i.totalAmount, 0),
      };
    } else if (reportType === 'gst') {
      rc.title = 'GST Summary (Sales)';
      rc.columns = [
        { key: 'taxRate', header: 'Tax Rate (%)' },
        { key: 'taxableValue', header: 'Taxable Value', align: 'right', isTotal: true },
        { key: 'cgst', header: 'CGST', align: 'right', isTotal: true },
        { key: 'sgst', header: 'SGST', align: 'right', isTotal: true },
        { key: 'taxAmount', header: 'Total GST', align: 'right', isTotal: true },
      ];
      const gstStats = {};
      sales.filter(tx => tx.date >= filters.dateFrom && tx.date <= filters.dateTo).forEach(tx => {
        (tx.items || []).forEach(item => {
          const rate = item.taxRate || 0;
          if (!gstStats[rate]) gstStats[rate] = { taxRate: `${rate}%`, taxableValue: 0, taxAmount: 0 };
          const taxable = item.qty * item.price;
          gstStats[rate].taxableValue += taxable;
          gstStats[rate].taxAmount += taxable * (rate / 100);
        });
      });
      rc.rows = Object.values(gstStats).sort((a, b) => parseFloat(a.taxRate) - parseFloat(b.taxRate)).map(stat => ({
        ...stat,
        taxableValue: `₹${stat.taxableValue.toFixed(2)}`,
        cgst: `₹${(stat.taxAmount / 2).toFixed(2)}`,
        sgst: `₹${(stat.taxAmount / 2).toFixed(2)}`,
        taxAmount: `₹${stat.taxAmount.toFixed(2)}`,
      }));
      rc.totals = {
        taxableValue: Object.values(gstStats).reduce((s, i) => s + i.taxableValue, 0),
        cgst: Object.values(gstStats).reduce((s, i) => s + i.taxAmount / 2, 0),
        sgst: Object.values(gstStats).reduce((s, i) => s + i.taxAmount / 2, 0),
        taxAmount: Object.values(gstStats).reduce((s, i) => s + i.taxAmount, 0),
      };
    } else if (reportType === 'profit-loss') {
      rc.title = 'Profit & Loss Statement';
      rc.columns = [
        { key: 'account', header: 'Particulars' },
        { key: 'amount', header: 'Amount', align: 'right', isTotal: true },
      ];
      const inRange = d => d >= filters.dateFrom && d <= filters.dateTo;
      const revenue = sales.filter(s => inRange(s.date)).reduce((a, s) => a + (s.totalAmount || 0), 0);
      const cogs = purchases.filter(p => inRange(p.date)).reduce((a, p) => a + (p.totalAmount || 0), 0);
      const grossProfit = revenue - cogs;
      const expByCat = {};
      expenses.filter(e => inRange(e.date)).forEach(e => {
        const cat = e.category || 'Other';
        expByCat[cat] = (expByCat[cat] || 0) + (Number(e.amount) || 0);
      });
      const totalExpenses = Object.values(expByCat).reduce((a, v) => a + v, 0);
      const netProfit = grossProfit - totalExpenses;
      rc.rows = [
        { account: t('pl.revenue'), amount: `₹${revenue.toFixed(2)}`, _bold: true },
        { account: `(−) ${t('pl.cogs')}`, amount: `₹${cogs.toFixed(2)}` },
        { account: t('pl.grossProfit'), amount: `₹${grossProfit.toFixed(2)}`, _bold: true },
        { account: t('pl.expenses'), amount: '', _section: true },
        ...Object.entries(expByCat).map(([cat, amt]) => ({ account: `   ${cat}`, amount: `₹${amt.toFixed(2)}` })),
        { account: `${t('pl.expenses')} (Total)`, amount: `₹${totalExpenses.toFixed(2)}` },
        { account: netProfit >= 0 ? t('pl.netProfit') : t('pl.netLoss'), amount: `₹${Math.abs(netProfit).toFixed(2)}`, _bold: true },
      ];
      rc.totals = {};
    } else if (reportType === 'trial-balance') {
      rc.title = 'Trial Balance';
      rc.columns = [
        { key: 'account', header: 'Account' },
        { key: 'debit', header: 'Debit', align: 'right', isTotal: true },
        { key: 'credit', header: 'Credit', align: 'right', isTotal: true },
      ];
      rc.rows = [];
      rc.totals = {};
    } else if (reportType === 'aged-receivables') {
      rc.title = 'Aged Receivables (Customers)';
      rc.columns = [
        { key: 'partyName', header: 'Customer' },
        { key: 'current', header: 'Current', align: 'right', isTotal: true },
        { key: 'days30', header: '1-30 Days', align: 'right', isTotal: true },
        { key: 'days60', header: '31-60 Days', align: 'right', isTotal: true },
        { key: 'days90', header: '61-90 Days', align: 'right', isTotal: true },
        { key: 'over90', header: 'Over 90 Days', align: 'right', isTotal: true },
        { key: 'total', header: 'Total', align: 'right', isTotal: true },
      ];
      const asOf = new Date(filters.dateTo || new Date().toISOString().split('T')[0]);
      const totals = { current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0 };
      const aged = parties.filter(p => p.type === 'Customer' && (p.balance || 0) > 0).map(c => {
        const lastSale = sales.filter(s => s.partyId === c.id).sort((a, b) => b.date > a.date ? 1 : -1)[0];
        const days = lastSale ? Math.floor((asOf - new Date(lastSale.date)) / 86400000) : 0;
        const outstanding = c.balance || 0;
        let current = 0, d30 = 0, d60 = 0, d90 = 0, over90 = 0;
        if (days <= 0) current = outstanding;
        else if (days <= 30) d30 = outstanding;
        else if (days <= 60) d60 = outstanding;
        else if (days <= 90) d90 = outstanding;
        else over90 = outstanding;
        totals.current += current; totals.days30 += d30; totals.days60 += d60;
        totals.days90 += d90; totals.over90 += over90; totals.total += outstanding;
        return {
          partyName: c.name,
          current: `₹${current.toFixed(2)}`, days30: `₹${d30.toFixed(2)}`,
          days60: `₹${d60.toFixed(2)}`, days90: `₹${d90.toFixed(2)}`,
          over90: `₹${over90.toFixed(2)}`, total: `₹${outstanding.toFixed(2)}`,
        };
      });
      rc.rows = aged;
      rc.totals = totals;
    } else if (reportType === 'aged-payables') {
      rc.title = 'Aged Payables (Vendors)';
      rc.columns = [
        { key: 'partyName', header: 'Vendor' },
        { key: 'current', header: 'Current', align: 'right', isTotal: true },
        { key: 'days30', header: '1-30 Days', align: 'right', isTotal: true },
        { key: 'days60', header: '31-60 Days', align: 'right', isTotal: true },
        { key: 'days90', header: '61-90 Days', align: 'right', isTotal: true },
        { key: 'over90', header: 'Over 90 Days', align: 'right', isTotal: true },
        { key: 'total', header: 'Total', align: 'right', isTotal: true },
      ];
      const asOf = new Date(filters.dateTo || new Date().toISOString().split('T')[0]);
      const totals = { current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0 };
      const aged = parties.filter(p => p.type === 'Vendor').map(c => {
        const partyPurchases = purchases.filter(p => p.partyId === c.id).reduce((s, p) => s + (p.totalAmount || 0), 0);
        const partyPaymentsOut = payments.filter(p => p.partyId === c.id && (p.mode === 'payment-out' || p.type === 'PaymentOut')).reduce((s, p) => s + (p.totalAmount || 0), 0);
        const outstanding = partyPurchases - partyPaymentsOut;
        if (outstanding <= 0) return null;
        const lastPurch = purchases.filter(p => p.partyId === c.id).sort((a, b) => b.date > a.date ? 1 : -1)[0];
        const days = lastPurch ? Math.floor((asOf - new Date(lastPurch.date)) / 86400000) : 0;
        let current = 0, d30 = 0, d60 = 0, d90 = 0, over90 = 0;
        if (days <= 0) current = outstanding;
        else if (days <= 30) d30 = outstanding;
        else if (days <= 60) d60 = outstanding;
        else if (days <= 90) d90 = outstanding;
        else over90 = outstanding;
        totals.current += current; totals.days30 += d30; totals.days60 += d60;
        totals.days90 += d90; totals.over90 += over90; totals.total += outstanding;
        return {
          partyName: c.name,
          current: `₹${current.toFixed(2)}`, days30: `₹${d30.toFixed(2)}`,
          days60: `₹${d60.toFixed(2)}`, days90: `₹${d90.toFixed(2)}`,
          over90: `₹${over90.toFixed(2)}`, total: `₹${outstanding.toFixed(2)}`,
        };
      }).filter(Boolean);
      rc.rows = aged;
      rc.totals = totals;
    } else if (reportType === 'net-balance') {
      rc.title = 'Net Balance — Customers (Amount to Receive)';
      rc.columns = [
        { key: 'partyName', header: 'Customer' },
        { key: 'phone', header: 'Phone' },
        { key: 'lastBill', header: 'Last Bill' },
        { key: 'totalBalance', header: 'Outstanding', align: 'right', isTotal: true },
      ];
      const withBalance = parties.filter(p => p.type === 'Customer' && (p.balance || 0) > 0).map(c => {
        const customerSales = sales.filter(s => s.partyId === c.id);
        const lastSale = customerSales.sort((a, b) => b.date > a.date ? 1 : -1)[0];
        const lastDate = lastSale?.date;
        const dayTotal = lastDate ? customerSales.filter(s => s.date === lastDate).reduce((sum, s) => sum + (s.totalAmount || 0), 0) : 0;
        return {
          partyName: c.name,
          phone: c.phone || '—',
          lastBill: lastDate ? `${lastDate} · ₹${dayTotal.toFixed(2)}` : '—',
          totalBalance: `₹${(c.balance || 0).toFixed(2)}`,
          _numericBalance: c.balance || 0,
        };
      }).sort((a, b) => (a.partyName || '').localeCompare(b.partyName || ''));
      rc.rows = withBalance.map(({ _numericBalance, ...r }) => r);
      rc.totals = { totalBalance: withBalance.reduce((s, r) => s + r._numericBalance, 0) };
    } else if (reportType === 'vendor-balance') {
      rc.title = 'Net Balance — Vendors (Amount to Pay)';
      rc.columns = [
        { key: 'partyName', header: 'Vendor' },
        { key: 'phone', header: 'Phone' },
        { key: 'lastBill', header: 'Last Purchase' },
        { key: 'totalPurchases', header: 'Total Purchases', align: 'right', isTotal: true },
        { key: 'totalPaid', header: 'Total Paid', align: 'right', isTotal: true },
        { key: 'outstanding', header: 'Outstanding', align: 'right', isTotal: true },
      ];
      const vendorRows = parties.filter(p => p.type === 'Vendor').map(v => {
        const vendorPurchases = purchases.filter(p => p.partyId === v.id);
        const totalPurchases = vendorPurchases.reduce((s, p) => s + (p.totalAmount || 0), 0);
        const totalPaid = payments
          .filter(p => p.partyId === v.id && (p.mode === 'payment-out' || p.type === 'PaymentOut'))
          .reduce((s, p) => s + (p.totalAmount || 0), 0);
        const outstanding = totalPurchases - totalPaid;
        if (outstanding <= 0) return null;
        const lastPurch = vendorPurchases.sort((a, b) => b.date > a.date ? 1 : -1)[0];
        return {
          partyName: v.name,
          phone: v.phone || '—',
          lastBill: lastPurch?.date || '—',
          totalPurchases: `₹${totalPurchases.toFixed(2)}`,
          totalPaid: `₹${totalPaid.toFixed(2)}`,
          outstanding: `₹${outstanding.toFixed(2)}`,
          _numericOutstanding: outstanding,
        };
      }).filter(Boolean).sort((a, b) => b._numericOutstanding - a._numericOutstanding);
      rc.rows = vendorRows.map(({ _numericOutstanding, ...r }) => r);
      rc.totals = { outstanding: vendorRows.reduce((s, r) => s + r._numericOutstanding, 0) };
    }

    return rc;
  }, [reportType, filteredData, filters, sales, purchases, parties, payments, expenses, t]);

  const handlePrint = useReactToPrint({ contentRef: reportRef });
  const handleBillPrint = useReactToPrint({ contentRef: billPrintRef });
  const [billPrintTrigger, setBillPrintTrigger] = useState(0);
  useEffect(() => {
    if (!billPrintTrigger) return;
    handleBillPrint();
  }, [billPrintTrigger]); // eslint-disable-line

  const triggerBillPrint = (tx) => {
    setPrintingBill(tx);
    setTimeout(() => setBillPrintTrigger(n => n + 1), 80);
  };

  const handleShare = () => {
    const text = `*${currentBusiness?.name || 'Business'} — ${reportConfig.title}*\n\nPeriod: ${filters.dateFrom} to ${filters.dateTo}\n\nShared via TallyKraft`;
    if (navigator.share) {
      navigator.share({ title: reportConfig.title, text }).catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    }
  };

  const handleGSTExport = (type, fmt = 'csv') => {
    const biz = (currentBusiness?.name || 'Business').replace(/[^a-z0-9]/gi, '_');
    const monthLabel = `${MONTHS[gstMonth]}${gstYear}`;
    const builders = {
      gstr1: () => buildGSTR1(sales, parties, gstMonth, gstYear),
      gstr1a: () => buildGSTR1A(sales, parties, gstMonth, gstYear),
      gstr2b: () => buildGSTR2B(purchases, parties, gstMonth, gstYear),
      gstr3b: () => buildGSTR3B(sales, purchases, expenses, gstMonth, gstYear),
      cmp08: () => buildCMP08(sales, gstQuarter, gstYear),
    };
    const suffix = type === 'cmp08' ? `${gstQuarter}_${gstYear}` : monthLabel;
    const label = type.toUpperCase();
    const rows = builders[type]?.() || [];
    if (fmt === 'xlsx') {
      downloadExcel(`${label}_${biz}_${suffix}.xlsx`, label, csvRowsToAoa(rows));
    } else {
      downloadCSV(`${label}_${biz}_${suffix}.csv`, rows);
    }
  };

  const REPORT_TABS = [
    { value: 'sales', label: 'Sales', icon: TrendingUp },
    { value: 'purchases', label: 'Purchases', icon: Receipt },
    { value: 'items-sales', label: 'Item Sales', icon: Package },
    { value: 'items-purchase', label: 'Item Purchases', icon: Package },
    { value: 'profit-loss', label: t('pl.title'), icon: TrendingUp },
    { value: 'gst', label: 'GST Summary', icon: FileText },
    { value: 'aged-receivables', label: 'Aged Rec.', icon: ArrowUpRight },
    { value: 'aged-payables', label: 'Aged Pay.', icon: ArrowDownRight },
    { value: 'net-balance', label: 'Customer Balance', icon: Wallet },
    { value: 'vendor-balance', label: 'Vendor Balance', icon: Wallet },
  ];

  const GST_TABS = [
    { value: 'gstr1', label: 'GSTR-1' },
    { value: 'gstr1a', label: 'GSTR-1A' },
    { value: 'gstr2b', label: 'GSTR-2B' },
    { value: 'gstr3b', label: 'GSTR-3B' },
    { value: 'cmp08', label: 'CMP-08 (Quarterly)' },
  ];

  const showDateFilter = !['net-balance', 'vendor-balance', 'gstr1','gstr1a','gstr2b','gstr3b','cmp08'].includes(reportType);

  const yearOptions = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 5; y--) yearOptions.push(y);

  return (
    <Box sx={{ pb: 4 }}>
      {/* Hidden print refs */}
      <Box sx={{ display: 'none' }}>
        <ReportTemplate
          ref={reportRef}
          title={reportConfig.title}
          business={currentBusiness}
          filters={{
            ...filters,
            partyName: parties.find(p => p.id === filters.partyId)?.name,
            itemName: items.find(i => i.id === filters.itemId)?.name,
            ...(['net-balance','vendor-balance'].includes(reportType) && { periodLabel: 'All time' }),
          }}
          reportData={reportConfig}
          paperSize={paperSize}
        />
        <InvoiceTemplate
          ref={billPrintRef}
          transaction={printingBill}
          business={currentBusiness}
          paperSize={paperSize}
          printOptions={config.billPrintOptions}
          partyBalance={printingBill ? (parties.find(p => p.id === printingBill.partyId)?.balance ?? 0) : undefined}
        />
      </Box>

      {/* Header */}
      <Box sx={{
        borderRadius: 3,
        background: `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 100%)`,
        p: { xs: 2.5, md: 3.5 }, mb: 3,
        position: 'relative', overflow: 'hidden',
      }}>
        <Box sx={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
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
            {!isGstReport && (
              <TextField
                select size="small" value={paperSize}
                onChange={(e) => setPaperSize(e.target.value)}
                sx={{ minWidth: 85, '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.12)', color: 'white', borderRadius: 1.5, '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' } }, '& .MuiSelect-icon': { color: 'white' } }}
              >
                {['A4','A5','Letter','Legal'].map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
            )}
            {!isGstReport && (
              <Button variant="contained" size="small" startIcon={<Printer size={16} />} onClick={handlePrint}
                sx={{ bgcolor: 'white', color: 'primary.main', fontWeight: 700, '&:hover': { bgcolor: 'rgba(255,255,255,0.9)' }, borderRadius: 1.5, textTransform: 'none' }}>
                Print
              </Button>
            )}
            {!isGstReport && (
              <Button variant="outlined" size="small" startIcon={<Share2 size={16} />} onClick={handleShare}
                sx={{ color: '#25D366', borderColor: 'rgba(37,211,102,0.6)', '&:hover': { borderColor: '#128C7E', bgcolor: 'rgba(37,211,102,0.08)' }, borderRadius: 1.5, textTransform: 'none', fontWeight: 700 }}>
                Share
              </Button>
            )}
          </Stack>
        </Box>
      </Box>

      {/* Report Type Tabs */}
      <Card elevation={0} sx={{ mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'visible' }}>
        <CardContent sx={{ py: 2, px: 2 }}>
          <Box sx={{ mb: 2, overflowX: 'auto', pb: 0.5, '&::-webkit-scrollbar': { height: 4 }, '&::-webkit-scrollbar-thumb': { bgcolor: alpha(theme.palette.primary.main, 0.2), borderRadius: 2 } }}>
            <Box sx={{ display: 'flex', gap: 0.75, width: 'max-content', p: 0.5, bgcolor: alpha(theme.palette.primary.main, 0.05), borderRadius: 2.5, border: '1px solid', borderColor: 'divider' }}>
              {REPORT_TABS.map(({ value, label, icon: Icon }) => (
                <Box key={value} onClick={() => setReportType(value)} sx={{
                  display: 'flex', alignItems: 'center', gap: 0.75,
                  px: 1.75, py: 0.75, borderRadius: 2, cursor: 'pointer',
                  bgcolor: reportType === value ? 'background.paper' : 'transparent',
                  boxShadow: reportType === value ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                  color: reportType === value ? 'primary.main' : 'text.secondary',
                  fontWeight: reportType === value ? 700 : 500,
                  fontSize: '0.825rem', whiteSpace: 'nowrap',
                  transition: 'all 0.15s', userSelect: 'none',
                  '&:hover': { color: reportType === value ? 'primary.main' : 'text.primary' },
                }}>
                  <Icon size={14} />
                  {label}
                </Box>
              ))}
              <Box sx={{ width: 1, bgcolor: 'divider', mx: 0.5 }} />
              {GST_TABS.map(({ value, label }) => (
                <Box key={value} onClick={() => setReportType(value)} sx={{
                  display: 'flex', alignItems: 'center', gap: 0.75,
                  px: 1.75, py: 0.75, borderRadius: 2, cursor: 'pointer',
                  bgcolor: reportType === value ? alpha(theme.palette.warning.main, 0.12) : 'transparent',
                  boxShadow: reportType === value ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                  color: reportType === value ? theme.palette.warning.dark : 'text.secondary',
                  fontWeight: reportType === value ? 700 : 500,
                  fontSize: '0.825rem', whiteSpace: 'nowrap',
                  transition: 'all 0.15s', userSelect: 'none',
                  border: reportType === value ? `1px solid ${alpha(theme.palette.warning.main, 0.3)}` : '1px solid transparent',
                  '&:hover': { color: theme.palette.warning.dark, bgcolor: alpha(theme.palette.warning.main, 0.06) },
                }}>
                  <FileDown size={14} />
                  {label}
                </Box>
              ))}
            </Box>
          </Box>

          {/* Filters */}
          {isGstReport ? (
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Chip label="GST Returns Export" size="small" color="warning" sx={{ fontWeight: 700 }} />
                <Typography variant="caption" color="text.secondary">
                  {reportType === 'cmp08' ? 'Select quarter and year for CMP-08' : 'Select month and year for export'}
                </Typography>
              </Box>
              <Stack direction="row" spacing={2} flexWrap="wrap">
                {reportType === 'cmp08' ? (
                  <>
                    <FormControl size="small" sx={{ minWidth: 140 }}>
                      <InputLabel>Quarter</InputLabel>
                      <Select value={gstQuarter} label="Quarter" onChange={e => setGstQuarter(e.target.value)}>
                        {['Q1 (Apr-Jun)','Q2 (Jul-Sep)','Q3 (Oct-Dec)','Q4 (Jan-Mar)'].map((label, i) => (
                          <MenuItem key={i} value={`Q${i+1}`}>{label}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ minWidth: 110 }}>
                      <InputLabel>Year</InputLabel>
                      <Select value={gstYear} label="Year" onChange={e => setGstYear(Number(e.target.value))}>
                        {yearOptions.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
                      </Select>
                    </FormControl>
                    <Button variant="contained" color="warning" startIcon={<Download size={16} />}
                      onClick={() => handleGSTExport('cmp08', 'csv')}
                      sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}>
                      CSV
                    </Button>
                    <Button variant="contained" color="success" startIcon={<FileDown size={16} />}
                      onClick={() => handleGSTExport('cmp08', 'xlsx')}
                      sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}>
                      Excel
                    </Button>
                  </>
                ) : (
                  <>
                    <FormControl size="small" sx={{ minWidth: 130 }}>
                      <InputLabel>Month</InputLabel>
                      <Select value={gstMonth} label="Month" onChange={e => setGstMonth(Number(e.target.value))}>
                        {MONTHS.map((m, i) => <MenuItem key={i} value={i}>{m}</MenuItem>)}
                      </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ minWidth: 110 }}>
                      <InputLabel>Year</InputLabel>
                      <Select value={gstYear} label="Year" onChange={e => setGstYear(Number(e.target.value))}>
                        {yearOptions.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
                      </Select>
                    </FormControl>
                    <Button variant="contained" color="warning" startIcon={<Download size={16} />}
                      onClick={() => handleGSTExport(reportType, 'csv')}
                      sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}>
                      CSV
                    </Button>
                    <Button variant="contained" color="success" startIcon={<FileDown size={16} />}
                      onClick={() => handleGSTExport(reportType, 'xlsx')}
                      sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}>
                      Excel
                    </Button>
                  </>
                )}
              </Stack>
              <Box sx={{ mt: 2, p: 2, bgcolor: alpha(theme.palette.warning.main, 0.06), borderRadius: 2, border: `1px solid ${alpha(theme.palette.warning.main, 0.2)}` }}>
                <Typography variant="body2" sx={{ fontWeight: 700, color: 'warning.dark', mb: 0.5 }}>About {reportType.toUpperCase()}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {reportType === 'gstr1' && 'GSTR-1: Monthly return of outward supplies — B2B sales to registered parties. File by 11th of the following month.'}
                  {reportType === 'gstr1a' && 'GSTR-1A: Amendment return for modifications to previously filed GSTR-1 invoices.'}
                  {reportType === 'gstr2b' && 'GSTR-2B: Input Tax Credit (ITC) statement based on purchase invoices — auto-generated from suppliers\' GSTR-1 filings.'}
                  {reportType === 'gstr3b' && 'GSTR-3B: Monthly summary return — outward tax liability vs ITC claims. File by 20th/22nd/24th of the following month.'}
                  {reportType === 'cmp08' && 'CMP-08: Quarterly statement for composition scheme dealers. File by 18th of the month after the quarter ends.'}
                </Typography>
              </Box>
            </Box>
          ) : showDateFilter ? (
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField fullWidth label="From Date" type="date" size="small" value={filters.dateFrom}
                  onChange={e => setFilters({ ...filters, dateFrom: e.target.value })}
                  InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField fullWidth label="To Date" type="date" size="small" value={filters.dateTo}
                  onChange={e => setFilters({ ...filters, dateTo: e.target.value })}
                  InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <PartySelect options={parties} value={parties.find(p => p.id === filters.partyId) || null}
                  onChange={v => setFilters({ ...filters, partyId: v?.id || '' })} label="Filter by Party" />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <ItemSelect options={items} value={items.find(i => i.id === filters.itemId) || null}
                  onChange={v => setFilters({ ...filters, itemId: typeof v === 'string' ? '' : v?.id || '' })}
                  placeholder="Filter by Item" />
              </Grid>
            </Grid>
          ) : (
            <Typography variant="body2" color="text.secondary">
              {reportType === 'net-balance' && 'Showing all customers with outstanding balances — all time.'}
              {reportType === 'vendor-balance' && 'Showing all vendors with outstanding payable amounts — all time.'}
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {!isGstReport && (
        <>
          {reportConfig.rows.length > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{reportConfig.title}</Typography>
              <Chip label={`${reportConfig.rows.length} record${reportConfig.rows.length !== 1 ? 's' : ''}`} size="small"
                sx={{ fontWeight: 700, bgcolor: alpha(theme.palette.primary.main, 0.08), color: 'primary.main', border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}` }} />
            </Box>
          )}
          <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
            <Table size="small" sx={{ minWidth: 650 }}>
              <TableHead sx={{ bgcolor: 'rgba(0,0,0,0.02)', borderBottom: '2px solid', borderColor: 'divider' }}>
                <TableRow>
                  {reportConfig.columns.map((col, idx) => (
                    <TableCell key={idx} align={col.align || 'left'}
                      sx={{ fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary', py: 1.5 }}>
                      {col.header}
                    </TableCell>
                  ))}
                  {(reportType === 'sales' || reportType === 'purchases') && (
                    <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary', py: 1.5, width: 56 }}>
                      Bill
                    </TableCell>
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {reportConfig.rows.map((row, rowIdx) => (
                  <TableRow key={rowIdx} hover sx={{ '&:nth-of-type(even)': { bgcolor: 'rgba(0,0,0,0.01)' } }}>
                    {reportConfig.columns.map((col, colIdx) => (
                      <TableCell key={colIdx} align={col.align || 'left'}
                        sx={{ fontWeight: row._bold ? 700 : 400, bgcolor: row._section ? alpha(theme.palette.primary.main, 0.04) : undefined }}>
                        {row[col.key]}
                      </TableCell>
                    ))}
                    {(reportType === 'sales' || reportType === 'purchases') && (
                      <TableCell align="center" sx={{ py: 0.5 }}>
                        <Tooltip title="Print bill">
                          <IconButton size="small"
                            onClick={() => {
                              const source = reportType === 'sales' ? sales : purchases;
                              const tx = source.find(t => t.id === row.id);
                              if (tx) triggerBillPrint(tx);
                            }}
                            sx={{ color: 'text.disabled', '&:hover': { color: 'primary.main', bgcolor: alpha(theme.palette.primary.main, 0.08) } }}>
                            <Printer size={14} />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {reportConfig.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={reportConfig.columns.length + 1} align="center" sx={{ py: 6 }}>
                      <Stack alignItems="center" spacing={1} sx={{ opacity: 0.6 }}>
                        <Search size={32} />
                        <Typography variant="body2">{t('rep.noRecords')}</Typography>
                      </Stack>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
              {reportConfig.rows.length > 0 && Object.keys(reportConfig.totals).length > 0 && (
                <TableHead sx={{ bgcolor: alpha(theme.palette.primary.main, 0.04) }}>
                  <TableRow>
                    {reportConfig.columns.map((col, idx) => (
                      <TableCell key={idx} align={col.align || 'left'} sx={{ fontWeight: 700, fontSize: '0.8rem', borderTop: '2px solid', borderColor: 'divider' }}>
                        {col.isTotal && reportConfig.totals[col.key] != null
                          ? `₹${Number(reportConfig.totals[col.key]).toFixed(2)}`
                          : idx === 0 ? 'TOTAL' : ''}
                      </TableCell>
                    ))}
                    {(reportType === 'sales' || reportType === 'purchases') && <TableCell sx={{ borderTop: '2px solid', borderColor: 'divider' }} />}
                  </TableRow>
                </TableHead>
              )}
            </Table>
          </TableContainer>
        </>
      )}
    </Box>
  );
};

export default ReportsPage;
