import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Box, Typography, Grid, Card, CardContent, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper,
  TextField, MenuItem, Button, Stack, IconButton, Tooltip,
  alpha, useTheme, Chip, Select, FormControl, InputLabel, Divider,
  useMediaQuery, InputAdornment, Dialog, DialogContent, Avatar,
  Autocomplete, TablePagination,
} from '@mui/material';
import {
  FileText, Filter, Printer, Download, Search, Share2,
  ArrowUpRight, ArrowDownRight, TrendingUp, Receipt, Wallet,
  BarChart2, Package, FileDown, CalendarDays,
  IndianRupee, ShoppingCart, Users, Tag, CreditCard, BookOpen,
  TrendingDown, AlertCircle, X, List, UserCheck,
  ClipboardList, LayoutList, PieChart, MessageCircle, Eye,
} from 'lucide-react';
import { useBusiness } from './BusinessContext';
import { useData } from './DataContext';
import { useI18n } from './i18n/I18nContext';
import { useConfig } from './ConfigContext';
import { useTabs } from './TabsContext';
import { useReactToPrint } from 'react-to-print';
import ReportTemplate from './ReportTemplate';
import InvoiceTemplate from './InvoiceTemplate';
import { useTableScrollReset } from './useTableScrollReset';
import InvoicePreviewDialog from './InvoicePreviewDialog';
import PaymentTemplate from './PaymentTemplate';
import ExpenseTemplate from './ExpenseTemplate';
import { waitForQrReady } from './qrReady';
import { isSettled } from './cashUtils';
import { byTxTimeAsc, formatCreatedTime } from './txTimeUtils';
import PartySelect from './PartySelect';
import ItemSelect from './ItemSelect';
import { useResizableWidth, ResizeHandle } from './PanelResizer';

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

async function downloadExcel(filename, sheetName, data) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet(data);
  // Auto-width columns
  if (data.length > 0) {
    const colWidths = data[0].map((_, colIdx) =>
      Math.min(40, Math.max(8, ...data.map(row => String(row[colIdx] ?? '').length)))
    );
    ws['!cols'] = colWidths.map(w => ({ wch: w }));
  }
  // Bold first row (header)
  if (data.length > 0) {
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let C = range.s.c; C <= range.e.c; C++) {
      const cellAddr = XLSX.utils.encode_cell({ r: 0, c: C });
      if (ws[cellAddr]) {
        ws[cellAddr].s = { font: { bold: true } };
      }
    }
  }
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

const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtRaw = (n) => Number(n || 0).toFixed(2);

// Compute taxable base for a line item (handles tax-inclusive pricing)
function itemTaxableBase(item) {
  const qty = Number(item.qty) || 0;
  const price = Number(item.price) || 0;
  const disc = Number(item.discount || item.disc || 0);
  const rate = Number(item.taxRate || 0);
  if (item.taxInclusive && rate > 0) {
    return (qty * price * (1 - disc / 100)) / (1 + rate / 100);
  }
  return qty * price * (1 - disc / 100);
}

function itemTaxAmt(item) {
  const taxable = itemTaxableBase(item);
  return taxable * (Number(item.taxRate || 0) / 100);
}

// ── Date range presets ──────────────────────────────────────────────────────
function getPresetRange(preset) {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  switch (preset) {
    case 'today': return { from: today, to: today };
    case 'yesterday': {
      const yd = new Date(y, m, d - 1).toISOString().split('T')[0];
      return { from: yd, to: yd };
    }
    case 'this_week': {
      const dow = now.getDay();
      const mon = new Date(y, m, d - (dow === 0 ? 6 : dow - 1));
      return { from: mon.toISOString().split('T')[0], to: today };
    }
    case 'this_month': return { from: `${y}-${String(m + 1).padStart(2, '0')}-01`, to: today };
    case 'last_month': {
      const lm = new Date(y, m, 0);
      const lmStart = new Date(y, m - 1, 1);
      return { from: lmStart.toISOString().split('T')[0], to: lm.toISOString().split('T')[0] };
    }
    case 'this_quarter': {
      const qStart = new Date(y, Math.floor(m / 3) * 3, 1);
      return { from: qStart.toISOString().split('T')[0], to: today };
    }
    case 'this_year': return { from: `${y}-01-01`, to: today };
    case 'fy': {
      const fyStart = m >= 3 ? y : y - 1;
      return { from: `${fyStart}-04-01`, to: today };
    }
    default: return null;
  }
}

// ── GST builders ─────────────────────────────────────────────────────────────
function buildGSTR1(sales, parties, month, year) {
  const headers = [
    'GSTIN of Recipient','Receiver Name','Invoice Number','Invoice Date',
    'Invoice Value','Place of Supply','Reverse Charge','Invoice Type',
    'Rate(%)','Taxable Value','IGST Amt','CGST Amt','SGST Amt','Cess Amount',
  ];
  const rows = [csvRow(headers)];
  sales.forEach(tx => {
    const my = getMonthYear(tx.date);
    if (!my || my.month !== month || my.year !== year) return;
    const party = parties.find(p => p.id === tx.partyId);
    const gstIn = party?.gstNumber || '';
    const pos = tx.placeOfSupply || party?.state || '';
    const rchrg = tx.reverseCharge ? 'Y' : 'N';
    const invoiceValue = (tx.totalAmount || 0).toFixed(2);
    const invoiceType = gstIn ? 'B2B' : 'B2C';
    const isIG = tx.gstType === 'igst' || (tx.isInterState && tx.gstType !== 'cgst_sgst');
    (tx.items || []).forEach(item => {
      const taxable = itemTaxableBase(item);
      const tax = taxable * (Number(item.taxRate || 0) / 100);
      const igst = isIG ? tax : 0;
      const cgst = isIG ? 0 : tax / 2;
      const sgst = isIG ? 0 : tax / 2;
      rows.push(csvRow([
        gstIn, party?.name || tx.partyName || 'Walk-in',
        tx.invoiceNumber, tx.date,
        invoiceValue, pos, rchrg, invoiceType,
        item.taxRate || 0, taxable.toFixed(2),
        igst.toFixed(2), cgst.toFixed(2), sgst.toFixed(2), '0.00',
      ]));
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
      const isIG = tx.gstType === 'igst' || tx.isInterState;
      const totalTax = (tx.items || []).reduce((s, item) => s + itemTaxAmt(item), 0);
      const taxable = (tx.items || []).reduce((s, item) => s + itemTaxableBase(item), 0);
      rows.push(csvRow([
        tx.originalInvoiceNumber, tx.originalInvoiceDate || '',
        tx.invoiceNumber, tx.date,
        party?.gstNumber || '', party?.name || '',
        (tx.totalAmount || 0).toFixed(2),
        taxable.toFixed(2),
        '',
        (isIG ? totalTax : 0).toFixed(2),
        (isIG ? 0 : totalTax / 2).toFixed(2),
        (isIG ? 0 : totalTax / 2).toFixed(2),
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
    const isIG = tx.gstType === 'igst' || tx.isInterState;
    (tx.items || []).forEach(item => {
      const taxable = itemTaxableBase(item);
      const tax = taxable * (Number(item.taxRate || 0) / 100);
      const itcEligible = item.reverseCharge ? 'No' : 'Yes';
      rows.push(csvRow([
        party?.gstNumber || '', party?.name || '',
        tx.invoiceNumber, tx.date,
        tx.reverseCharge ? 'RCM' : 'Regular',
        (tx.totalAmount || 0).toFixed(2),
        tx.placeOfSupply || party?.state || '',
        item.taxRate || 0, taxable.toFixed(2),
        (isIG ? tax : 0).toFixed(2),
        (isIG ? 0 : tax / 2).toFixed(2),
        (isIG ? 0 : tax / 2).toFixed(2),
        '0.00', itcEligible,
      ]));
    });
  });
  return rows;
}

function buildGSTR3B(sales, purchases, expenses, month, year) {
  let outwardTaxableIG = 0, outwardTaxableCS = 0;
  let outwardIGST = 0, outwardCGST = 0, outwardSGST = 0;
  let inwardIGST = 0, inwardCGST = 0, inwardSGST = 0;
  let exemptSupplies = 0;

  sales.forEach(tx => {
    const my = getMonthYear(tx.date);
    if (!my || my.month !== month || my.year !== year) return;
    const isIG = tx.gstType === 'igst' || tx.isInterState;
    (tx.items || []).forEach(item => {
      const taxable = itemTaxableBase(item);
      const tax = itemTaxAmt(item);
      if (!item.taxRate || item.taxRate === 0) {
        exemptSupplies += taxable;
      } else if (isIG) {
        outwardTaxableIG += taxable;
        outwardIGST += tax;
      } else {
        outwardTaxableCS += taxable;
        outwardCGST += tax / 2;
        outwardSGST += tax / 2;
      }
    });
  });

  purchases.forEach(tx => {
    const my = getMonthYear(tx.date);
    if (!my || my.month !== month || my.year !== year) return;
    const isIG = tx.gstType === 'igst' || tx.isInterState;
    (tx.items || []).forEach(item => {
      const tax = itemTaxAmt(item);
      if (isIG) inwardIGST += tax;
      else { inwardCGST += tax / 2; inwardSGST += tax / 2; }
    });
  });

  const totalOutwardTaxable = outwardTaxableIG + outwardTaxableCS;
  const totalOutwardTax = outwardIGST + outwardCGST + outwardSGST;
  const totalITC = inwardIGST + inwardCGST + inwardSGST;
  const netLiabilityIGST = Math.max(0, outwardIGST - inwardIGST);
  const netLiabilityCGST = Math.max(0, outwardCGST - inwardCGST);
  const netLiabilitySGST = Math.max(0, outwardSGST - inwardSGST);
  const netTotalLiability = netLiabilityIGST + netLiabilityCGST + netLiabilitySGST;

  return [
    csvRow(['Description', 'IGST (₹)', 'CGST (₹)', 'SGST (₹)', 'Total (₹)']),
    csvRow(['=== GSTR-3B SUMMARY ===']),
    csvRow([`Period: ${MONTHS[month]} ${year}`]),
    csvRow(['']),
    csvRow(['3.1(a) Outward Taxable Supplies']),
    csvRow(['Taxable Value', outwardTaxableIG.toFixed(2), outwardTaxableCS.toFixed(2), '', totalOutwardTaxable.toFixed(2)]),
    csvRow(['Tax on Outward Supplies', outwardIGST.toFixed(2), outwardCGST.toFixed(2), outwardSGST.toFixed(2), totalOutwardTax.toFixed(2)]),
    csvRow(['']),
    csvRow(['3.2 Nil/Exempt Supplies', '', '', '', exemptSupplies.toFixed(2)]),
    csvRow(['']),
    csvRow(['4(A) Eligible ITC from Purchases']),
    csvRow(['ITC Available', inwardIGST.toFixed(2), inwardCGST.toFixed(2), inwardSGST.toFixed(2), totalITC.toFixed(2)]),
    csvRow(['']),
    csvRow(['5. Net Tax Payable (after ITC)']),
    csvRow(['Net Liability', netLiabilityIGST.toFixed(2), netLiabilityCGST.toFixed(2), netLiabilitySGST.toFixed(2), netTotalLiability.toFixed(2)]),
  ];
}

function buildCMP08(sales, quarter, year) {
  const qMap = { Q1:[3,4,5], Q2:[6,7,8], Q3:[9,10,11], Q4:[0,1,2] };
  const months = qMap[quarter];
  let turnover = 0, tax = 0;
  sales.forEach(tx => {
    const my = getMonthYear(tx.date);
    if (!my) return;
    const inQ = months.includes(my.month) && my.year === year;
    const inQNext = quarter === 'Q4' && [0,1,2].includes(my.month) && my.year === year + 1;
    if (!inQ && !inQNext) return;
    turnover += tx.totalAmount || 0;
    tax += tx.taxAmount || 0;
  });
  const period = quarter === 'Q1' ? `Apr-Jun ${year}` : quarter === 'Q2' ? `Jul-Sep ${year}` : quarter === 'Q3' ? `Oct-Dec ${year}` : `Jan-Mar ${year + 1}`;
  return [
    csvRow(['CMP-08 — Quarterly Statement (Composition Dealer)']),
    csvRow([`Period: ${period}`]),
    csvRow(['']),
    csvRow(['Column', 'Amount (₹)']),
    csvRow(['(A) Turnover of outward supplies on which tax is payable', turnover.toFixed(2)]),
    csvRow(['(B) Turnover exempt/nil', '']),
    csvRow(['(C) Total Turnover', turnover.toFixed(2)]),
    csvRow(['(D) Tax payable', tax.toFixed(2)]),
    csvRow(['(E) Interest payable', '0.00']),
    csvRow(['(F) Late fee', '0.00']),
    csvRow(['(G) Total payable (D+E+F)', tax.toFixed(2)]),
  ];
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
const KpiCard = ({ icon: Icon, label, value, subValue, color, trend }) => {
  return (
    <Card elevation={0} sx={{
      border: '1px solid', borderColor: 'divider', borderRadius: 2, height: '100%',
      position: 'relative', overflow: 'hidden', bgcolor: alpha(color, 0.025),
      transition: 'box-shadow 0.15s, border-color 0.15s',
      '&:hover': { borderColor: alpha(color, 0.35), boxShadow: `0 2px 10px ${alpha(color, 0.14)}` },
    }}>
      <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, bgcolor: color }} />
      <CardContent sx={{ p: 1.25, pt: 1.5, '&:last-child': { pb: 1.25 } }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 0.625 }}>
          <Box sx={{ p: 0.5, borderRadius: 1.25, bgcolor: alpha(color, 0.1), display: 'flex' }}>
            <Icon size={14} color={color} />
          </Box>
          {trend !== undefined && (
            <Chip size="small"
              label={trend >= 0 ? `+${fmtRaw(trend)}%` : `${fmtRaw(trend)}%`}
              sx={{ fontSize: '0.62rem', fontWeight: 700, height: 18,
                bgcolor: trend >= 0 ? alpha('#5c1f22', 0.1) : alpha('#dc2626', 0.1),
                color: trend >= 0 ? '#5c1f22' : '#dc2626' }} />
          )}
        </Box>
        <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 0.2, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</Typography>
        <Typography sx={{ fontWeight: 800, fontSize: '1.02rem', color: 'text.primary', lineHeight: 1.2 }}>{value}</Typography>
        {subValue && <Typography variant="caption" color="text.disabled" sx={{ mt: 0.2, display: 'block', fontSize: '0.68rem' }}>{subValue}</Typography>}
      </CardContent>
    </Card>
  );
};

// ── Report groups config ─────────────────────────────────────────────────────
const REPORT_GROUPS = [
  {
    label: 'Sales & Purchase',
    color: '#5c1f22',
    items: [
      { value: 'sales', label: 'Sales', icon: TrendingUp },
      { value: 'purchases', label: 'Purchases', icon: ShoppingCart },
      { value: 'items-sales', label: 'Item Sales', icon: Package },
      { value: 'items-purchase', label: 'Item Purchases', icon: Package },
      { value: 'stock-summary', label: 'Stock Summary', icon: LayoutList },
      { value: 'party-statement', label: 'Party Statement', icon: ClipboardList },
      { value: 'credit-debit-notes', label: 'Credit / Debit Notes', icon: FileText },
    ],
  },
  {
    label: 'Financial',
    color: '#7c3aed',
    items: [
      { value: 'profit-loss', label: 'Profit & Loss', icon: TrendingUp },
      { value: 'bill-profit', label: 'Bill-wise Profit & Loss', icon: Receipt },
      { value: 'party-profit', label: 'Party-wise Profit & Loss', icon: UserCheck },
      { value: 'party-group', label: 'Customer/Vendor Group', icon: Users },
      { value: 'item-profit', label: 'Item-wise Profit & Loss', icon: Package },
      { value: 'cash-flow', label: 'Cash Flow', icon: Wallet },
      { value: 'gst', label: 'GST Summary', icon: FileText },
      { value: 'expenses', label: 'Expenses', icon: CreditCard },
      { value: 'expense-category', label: 'Expense by Category', icon: PieChart },
      { value: 'payment-mode', label: 'Payment Mode Summary', icon: CreditCard },
      { value: 'payments', label: 'Payments', icon: Wallet },
      { value: 'day-book', label: 'Day Book', icon: BookOpen },
      { value: 'investor-pl', label: 'Investors P&L', icon: UserCheck, requiresFeature: 'investors' },
    ],
  },
  {
    label: 'Analytics',
    color: '#ea580c',
    items: [
      { value: 'top-customers', label: 'Top Customers', icon: Users },
      { value: 'top-items', label: 'Top Items', icon: Tag },
      { value: 'staff-salary', label: 'Staff Salary', icon: UserCheck },
    ],
  },
  {
    label: 'Outstanding',
    color: '#dc2626',
    items: [
      { value: 'aged-receivables', label: 'Aged Receivables', icon: ArrowUpRight },
      { value: 'aged-payables', label: 'Aged Payables', icon: ArrowDownRight },
      { value: 'net-balance', label: 'Customer Balance', icon: Users },
      { value: 'vendor-balance', label: 'Vendor Balance', icon: Wallet },
    ],
  },
  {
    label: 'GST Returns',
    color: '#b45309',
    items: [
      { value: 'gstr1', label: 'GSTR-1', icon: FileText },
      { value: 'gstr1a', label: 'GSTR-1A', icon: FileText },
      { value: 'gstr2b', label: 'GSTR-2B', icon: FileText },
      { value: 'gstr3b', label: 'GSTR-3B', icon: FileText },
      { value: 'cmp08', label: 'CMP-08 (Qtrly)', icon: CalendarDays },
    ],
  },
];

const PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'fy', label: 'This FY' },
  { value: 'this_year', label: 'Calendar Year' },
];

// GST return descriptions
const GST_DESCRIPTIONS = {
  gstr1: {
    title: 'GSTR-1 — Outward Supplies',
    description: 'Monthly/quarterly return of outward (sales) supplies. Covers B2B invoices to registered parties and B2C sales.',
    dueDate: '11th of following month',
    whoFiles: 'All regular registered taxpayers',
  },
  gstr1a: {
    title: 'GSTR-1A — Amendments',
    description: 'Amendment return for corrections to previously filed GSTR-1 invoices. Used to rectify errors.',
    dueDate: 'Before filing GSTR-3B',
    whoFiles: 'Taxpayers who need to amend filed GSTR-1',
  },
  gstr2b: {
    title: 'GSTR-2B — Input Tax Credit',
    description: 'Auto-populated ITC statement based on supplier-filed returns. Shows eligible Input Tax Credit from purchases.',
    dueDate: '14th of following month (auto-generated)',
    whoFiles: 'All regular registered taxpayers (for ITC reconciliation)',
  },
  gstr3b: {
    title: 'GSTR-3B — Monthly Summary',
    description: 'Monthly summary return showing outward tax liability, ITC claimed, and net tax payable. Must match GSTR-1.',
    dueDate: '20th (large), 22nd (medium), 24th (small) of following month',
    whoFiles: 'All regular registered taxpayers',
  },
  cmp08: {
    title: 'CMP-08 — Composition Scheme',
    description: 'Quarterly statement-cum-challan for composition scheme dealers. Reports turnover and tax payable.',
    dueDate: '18th of month following quarter end',
    whoFiles: 'Composition scheme dealers (turnover up to ₹1.5 Cr)',
  },
};

// ── Main component ──────────────────────────────────────────────────────────
const ReportsPage = () => {
  const reportRail = useResizableWidth('reports-rail', 168, { min: 140, max: 360 });
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { currentBusiness } = useBusiness();
  const { data, getItems } = useData();
  const { t } = useI18n();
  const { config } = useConfig();
  const reportRef = useRef();
  const billPrintRef = useRef();
  const [printingBill, setPrintingBill] = useState(null);
  // Payment/Expense print — Day Book's Print/Share column also covers
  // Payment-In/Payment-Out/Expense rows, not just Sale/Purchase, so it needs
  // its own hidden print targets mirroring the PaymentTemplate/ExpenseTemplate
  // flows already built in PaymentEntry.jsx/Expenses.jsx.
  const paymentPrintRef = useRef();
  const [printingPayment, setPrintingPayment] = useState(null);
  const expensePrintRef = useRef();
  const [printingExpense, setPrintingExpense] = useState(null);
  const [previewTx, setPreviewTx] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIsSale, setPreviewIsSale] = useState(true);
  // Item-wise / Party-wise P&L drill-down popup — { kind: 'item'|'party', id }
  const [detailDialog, setDetailDialog] = useState(null);
  // Recent Sales/Recent Purchases in that popup can be unbounded for a
  // group (buildGroupDetail deliberately lists every bill, not a capped
  // "recent 8" like the single item/party detail) — paginate each list
  // independently once it's long enough to need it. Reset together
  // whenever a different item/party/group is opened.
  const [detailSalesPage, setDetailSalesPage] = useState(0);
  const [detailPurchasesPage, setDetailPurchasesPage] = useState(0);
  const DETAIL_ROWS_PER_PAGE = 50;
  // Group detail only (a single item/party detail is already scoped to one
  // entity — a customer search inside it wouldn't add anything): Sales vs
  // Purchases as its own tab strip, plus a customer-name search and a date
  // range, both applied client-side over buildGroupDetail's all-time lists.
  const [detailTab, setDetailTab] = useState('sales');
  const [detailPartySearch, setDetailPartySearch] = useState('');
  const [detailDateFrom, setDetailDateFrom] = useState('');
  const [detailDateTo, setDetailDateTo] = useState('');
  // Stock Summary view toggle — 'item' (flat per-item rows, existing
  // behavior) or 'category' (rolled up per item category: total stock value,
  // qty, low-stock count per category).
  const [stockView, setStockView] = useState('item');
  // Customer Balance / Vendor Balance — default OFF (shows every
  // customer/vendor, including a settled (0) or overpaid/credit (negative
  // outstanding) balance, which the old hardcoded behavior always
  // filtered out with no way to see them); turning it on narrows the list
  // down to only outstanding/non-zero balances.
  const [balanceOnly, setBalanceOnly] = useState(false);
  const [paperSize, setPaperSize] = useState(() => {
    const d = config.defaultPaperSize;
    return ['A3', 'A4', 'A5', 'A6', 'Letter', 'Legal', 'Executive', 'Statement'].includes(d) ? d : 'A4';
  });
  const [searchText, setSearchText] = useState('');
  // Report picker — always-visible top tab strip (one pill per
  // REPORT_GROUPS category) + a chip row underneath showing that
  // category's own reports. No popover/menu, nothing to open or discover:
  // both rows sit in the page's normal flow the whole time. navCategory is
  // the active tab ('all' shows every report's chips in one row); navSearch
  // filters the chip row by label and, once non-empty, searches across
  // every category at once regardless of which tab is selected.
  const [navCategory, setNavCategory] = useState('all');
  const [navSearch, setNavSearch] = useState('');

  useEffect(() => {
    if (config.defaultPaperSize) {
      const d = config.defaultPaperSize;
      if (['A3', 'A4', 'A5', 'A6', 'Letter', 'Legal', 'Executive', 'Statement'].includes(d)) setPaperSize(d);
    }
  }, [config.defaultPaperSize]);

  const { tabs, activeTabId, updateTab } = useTabs();
  const [reportType, setReportType] = useState('sales');

  // Some report entries (e.g. Investors P&L) declare requiresFeature — filtered
  // out here rather than baked into the static REPORT_GROUPS array, since this
  // is the first report type in Reports.jsx that needs feature gating at all.
  const visibleReportGroups = useMemo(() =>
    REPORT_GROUPS
      .map(g => ({ ...g, items: g.items.filter(i => !i.requiresFeature || config.features?.[i.requiresFeature]) }))
      .filter(g => g.items.length > 0),
    [config.features]
  );

  const ALL_REPORT_TABS = useMemo(() => visibleReportGroups.flatMap(g => g.items), [visibleReportGroups]);

  // Flat list, each report tagged with its own group's color/label — only
  // needed for the search-across-all-categories result list in the picker
  // menu; the non-search (grouped) view renders straight off
  // visibleReportGroups instead.
  const allReportCards = useMemo(() =>
    visibleReportGroups.flatMap(g => g.items.map(i => ({ ...i, groupLabel: g.label, groupColor: g.color }))),
    [visibleReportGroups]
  );

  // What the chip row shows: a live search spans every category at once
  // (so a match is never hidden behind whichever tab happens to be
  // active); with no search, it's just the active tab's own reports (or
  // everything, for the "All" tab).
  const gridReports = useMemo(() => {
    const q = navSearch.trim().toLowerCase();
    if (q) return allReportCards.filter(r => r.label.toLowerCase().includes(q));
    if (navCategory === 'all') return allReportCards;
    return allReportCards.filter(r => r.groupLabel === navCategory);
  }, [allReportCards, navSearch, navCategory]);

  const selectReport = useCallback((value) => {
    setReportType(value);
  }, []);

  useEffect(() => {
    const thisTab = tabs?.find(t => t.path === '/reports' && t.id === activeTabId);
    if (!thisTab) return;
    const label = ALL_REPORT_TABS.find(r => r.value === reportType)?.label || 'Reports';
    updateTab(thisTab.id, { label });
  }, [reportType, activeTabId]); // eslint-disable-line

  // Clear search when report type changes
  useEffect(() => {
    setSearchText('');
  }, [reportType]);

  const now = new Date();
  const [filters, setFilters] = useState({
    dateFrom: new Date().toISOString().split('T')[0],
    dateTo: new Date().toISOString().split('T')[0],
    partyId: '',
    itemId: '',
    // Multiselect variants — used by every report where filtering by SEVERAL
    // parties/items at once makes sense (Sales, Purchases, Item Sales/
    // Purchases, Bill-wise/Party-wise/Item-wise P&L, Expenses, Payments).
    // Party Statement stays on the single partyId above — it's inherently a
    // single-party running ledger, multiselect wouldn't make sense there.
    partyIds: [],
    itemIds: [],
    preset: 'today',
  });

  const applyPreset = useCallback((preset) => {
    const range = getPresetRange(preset);
    if (range) setFilters(f => ({ ...f, dateFrom: range.from, dateTo: range.to, preset }));
  }, []);

  const [gstMonth, setGstMonth] = useState(now.getMonth());
  const [gstYear, setGstYear] = useState(now.getFullYear());
  const [gstQuarter, setGstQuarter] = useState('Q1');

  // Memoized on the underlying table + business id — these feed several
  // useMemo blocks below (kpis/filteredData/reportConfig), and leaving them
  // unmemoized gave every one of those a fresh array identity on every
  // render, defeating their own memoization and re-running full scans over
  // the whole dataset on every tab switch / unrelated re-render.
  // Deps keyed on the specific data[table] array (not the getItems function
  // itself) — getItems's identity changes on every mutation to ANY table, so
  // keying off it here meant editing e.g. an expense invalidated the sales/
  // purchases/parties memos too, even though they don't read expenses. Each
  // data[table] array reference only changes when that table is actually
  // mutated, so this narrows recomputation to only the table that changed.
  // getItems is deliberately excluded from every one of these dep arrays —
  // its identity changes on every unrelated table mutation elsewhere in the
  // app (see the 2026-07-23 changelog entry), so including it would defeat
  // the memo; each of these is scoped correctly via the real data.* dep
  // instead. eslint-disable-next-line react-hooks/exhaustive-deps
  const sales = useMemo(() => getItems('sales').filter(s => s.businessId === currentBusiness?.id), [data.sales, currentBusiness?.id]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const purchases = useMemo(() => getItems('purchases').filter(p => p.businessId === currentBusiness?.id), [data.purchases, currentBusiness?.id]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const parties = useMemo(() => getItems('parties').filter(p => p.businessId === currentBusiness?.id), [data.parties, currentBusiness?.id]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const items = useMemo(() => getItems('items').filter(i => i.businessId === currentBusiness?.id), [data.items, currentBusiness?.id]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const payments = useMemo(() => getItems('payments').filter(p => p.businessId === currentBusiness?.id), [data.payments, currentBusiness?.id]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const expenses = useMemo(() => getItems('expenses').filter(e => e.businessId === currentBusiness?.id), [data.expenses, currentBusiness?.id]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const creditNotes = useMemo(() => getItems('creditNotes').filter(c => c.businessId === currentBusiness?.id), [data.creditNotes, currentBusiness?.id]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debitNotes = useMemo(() => getItems('debitNotes').filter(d => d.businessId === currentBusiness?.id), [data.debitNotes, currentBusiness?.id]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const staffSalary = useMemo(() => getItems('staffSalary').filter(s => s.businessId === currentBusiness?.id), [data.staffSalary, currentBusiness?.id]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const staffMembers = useMemo(() => getItems('staffMembers').filter(s => s.businessId === currentBusiness?.id), [data.staffMembers, currentBusiness?.id]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const investors = useMemo(() => getItems('investors').filter(i => i.businessId === currentBusiness?.id && i.status === 'active'), [data.investors, currentBusiness?.id]);
  // Manual cash-book entries (Cash.jsx) — Capital Added, Owner Drawings,
  // Bank Deposit/Withdrawal, etc. — type: 'in'|'out'|'bank_in'|'bank_out'.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cashEntries = useMemo(() => getItems('cashEntries').filter(c => c.businessId === currentBusiness?.id), [data.cashEntries, currentBusiness?.id]);

  // O(1) party lookup instead of parties.find(p => p.id === x) scattered
  // through report builders — with thousands of parties, a `.find()` inside
  // a `.map()`/`.forEach()` over thousands of sales/purchases rows is an
  // O(n×m) scan repeated on every report render.
  const partiesById = useMemo(() => {
    const m = new Map();
    parties.forEach(p => m.set(p.id, p));
    return m;
  }, [parties]);
  // O(1) item-master lookup for cost/HSN/category enrichment of sale line
  // items — used by Stock Summary and the Bill-wise/Party-wise P&L reports
  // (COGS = current item master purchasePrice, since sale line items don't
  // snapshot cost-at-sale-time).
  const itemsById = useMemo(() => {
    const m = new Map();
    items.forEach(i => m.set(i.id, i));
    return m;
  }, [items]);
  // A recipe item (e.g. Tomato Rice, made from other stock items — see
  // ItemFormDialog.jsx) has no purchase cost of its own; its real cost is
  // the sum of its components' purchase prices. Used by Bill-wise/Party-wise
  // Profit & Loss so recipe-item sales don't show artificially high margin
  // just because the item's own "Purchase Price" field is empty.
  const unitCostOf = (master, li, _depth = 0) => {
    if (master && Array.isArray(master.recipe) && master.recipe.length > 0 && _depth < 3) {
      return master.recipe.reduce((sum, r) => {
        const comp = itemsById.get(r.itemId);
        return sum + unitCostOf(comp, null, _depth + 1) * (Number(r.qtyPerUnit) || 0);
      }, 0);
    }
    return Number(master?.purchasePrice ?? li?.purchasePrice ?? 0);
  };
  // O(1) "all sales/purchases for this party" instead of re-scanning the
  // full table with .filter(s => s.partyId === x) per party — used by the
  // aging report (once per customer) and Party Statement.
  const salesByPartyId = useMemo(() => {
    const m = new Map();
    sales.forEach(s => { if (!s.partyId) return; (m.get(s.partyId) || m.set(s.partyId, []).get(s.partyId)).push(s); });
    return m;
  }, [sales]);
  const purchasesByPartyId = useMemo(() => {
    const m = new Map();
    purchases.forEach(p => { if (!p.partyId) return; (m.get(p.partyId) || m.set(p.partyId, []).get(p.partyId)).push(p); });
    return m;
  }, [purchases]);
  const paymentsOutByPartyId = useMemo(() => {
    const m = new Map();
    payments.forEach(p => {
      if (!p.partyId || !(p.mode === 'payment-out' || p.type === 'PaymentOut')) return;
      (m.get(p.partyId) || m.set(p.partyId, []).get(p.partyId)).push(p);
    });
    return m;
  }, [payments]);

  const isGstReturn = ['gstr1','gstr1a','gstr2b','gstr3b','cmp08'].includes(reportType);
  const noDateFilter = ['net-balance','vendor-balance','aged-receivables','aged-payables','stock-summary'].includes(reportType) || isGstReturn;
  // Party statement requires party selection
  const requiresParty = reportType === 'party-statement';

  const kpis = useMemo(() => {
    const inRange = d => d >= filters.dateFrom && d <= filters.dateTo;
    const totalSales = sales.filter(s => inRange(s.date)).reduce((a, s) => a + (s.totalAmount || 0), 0);
    const totalPurchases = purchases.filter(p => inRange(p.date)).reduce((a, p) => a + (p.totalAmount || 0), 0);
    const totalExpenses = expenses.filter(e => inRange(e.date)).reduce((a, e) => a + (Number(e.amount) || 0), 0);
    const totalGst = sales.filter(s => inRange(s.date)).reduce((a, s) => a + (s.taxAmount || 0), 0);
    const grossProfit = totalSales - totalPurchases - totalExpenses;
    return { totalSales, totalPurchases, totalExpenses, totalGst, grossProfit };
  }, [sales, purchases, expenses, filters.dateFrom, filters.dateTo]);

  // Which filter controls are relevant for the selected report — drives the
  // context-aware filter bar so irrelevant pickers (Item filter on a report with
  // no item data, etc.) don't show for every report type.
  // partyMultiRelevant/itemMultiRelevant use the new multiselect pickers;
  // party-statement is the one report kept on the original single-select
  // filters.partyId (it's inherently a single-party running ledger).
  const filterRelevance = useMemo(() => {
    const dateRelevant = !noDateFilter;
    const partySingleRelevant = !noDateFilter && reportType === 'party-statement';
    const partyMultiRelevant = !noDateFilter && [
      'sales', 'purchases', 'expenses', 'payments', 'bill-profit', 'party-profit',
    ].includes(reportType);
    const itemMultiRelevant = !noDateFilter && ['sales', 'purchases', 'items-sales', 'items-purchase', 'item-profit'].includes(reportType);
    const partyRelevant = partySingleRelevant || partyMultiRelevant;
    const itemRelevant = itemMultiRelevant;
    return { dateRelevant, partyRelevant, itemRelevant, partySingleRelevant, partyMultiRelevant, itemMultiRelevant };
  }, [reportType, noDateFilter]);

  const filteredData = useMemo(() => {
    let data = [];
    if (reportType === 'sales' || reportType === 'items-sales' || reportType === 'top-customers' || reportType === 'top-items' || reportType === 'day-book') data = sales;
    if (reportType === 'purchases' || reportType === 'items-purchase') data = purchases;
    if (reportType === 'gst' || reportType === 'profit-loss') data = sales;
    return data.filter(tx => {
      const matchesDate = noDateFilter || (tx.date >= filters.dateFrom && tx.date <= filters.dateTo);
      const matchesParty = !filters.partyIds?.length || filters.partyIds.includes(tx.partyId);
      const matchesItem = !filters.itemIds?.length || (tx.items || []).some(i => filters.itemIds.includes(i.itemId));
      return matchesDate && matchesParty && matchesItem;
    });
  }, [reportType, sales, purchases, filters, noDateFilter]);

  // Stock Summary's data was previously computed INLINE inside the giant
  // reportConfig useMemo below, which depends on every table in the app
  // (sales, purchases, parties, payments, expenses, items, creditNotes,
  // debitNotes, staffSalary, staffMembers — see reportConfig's dep array).
  // That meant viewing Stock Summary while, say, an unrelated Expense was
  // being added elsewhere re-ran its full two-pass scan (all sales line
  // items, then all 5000 items) on every render, even though Stock Summary
  // only ever reads `sales` and `items`. Pulled out into its own memo keyed
  // ONLY on the tables it actually uses, so it's untouched by edits to
  // purchases/parties/payments/expenses/notes/staff.
  const stockSummaryData = useMemo(() => {
    if (reportType !== 'stock-summary') return null;
    // Stock units a line moved: a pack-priced line (e.g. 1 Box = 12 pcs) moves qty × pack size.
    const lineUnits = (li, item) => {
      const pack = li.packId && Array.isArray(item?.packSizes) ? item.packSizes.find(p => p.id === li.packId) : null;
      return (Number(li.qty) || 0) * (pack ? (Number(pack.qty) || 1) : 1);
    };
    const soldStats = {};
    const soldUnits = {};
    sales.forEach(tx => {
      (tx.items || []).forEach(li => {
        const k = li.itemId || li.name;
        if (!k) return;
        // not-billed lines still leave stock, they just aren't "sold amount"
        soldUnits[k] = (soldUnits[k] || 0) + lineUnits(li, itemsById.get(li.itemId));
        if (li.notBilled) return; // not charged — don't count as "sold amount"
        if (!soldStats[k]) soldStats[k] = { qty: 0, amount: 0 };
        soldStats[k].qty += Number(li.qty) || 0;
        soldStats[k].amount += (Number(li.qty) || 0) * (Number(li.price) || 0);
      });
    });
    const purchasedUnits = {};
    purchases.forEach(tx => {
      (tx.items || []).forEach(li => {
        const k = li.itemId || li.name;
        if (!k) return;
        purchasedUnits[k] = (purchasedUnits[k] || 0) + lineUnits(li, itemsById.get(li.itemId));
      });
    });
    let totalOpening = 0, totalOpeningValue = 0, totalPurchased = 0;
    let totalSoldQty = 0, totalSoldAmount = 0, totalStock = 0, totalStockValue = 0, lowStockCount = 0;
    const rows = [];
    // Per-category rollup (item 5: "how much total stock value is pending in
    // each item category") — accumulated in the same pass as the by-item
    // rows above, so this costs nothing extra beyond one more object write
    // per item.
    const catStats = {};
    for (const i of items) {
      // Recipe items (made from other items, e.g. Tomato Rice) have no stock
      // of its own — only its components do — so a stock/low-stock row for
      // it would always read 0 and be meaningless here.
      if (i.type === 'service' || i.type === 'membership' || (Array.isArray(i.recipe) && i.recipe.length > 0)) continue;
      const stock = Number(i.stock || 0);
      const purchPrice = Number(i.purchasePrice || 0);
      const stockValue = stock * purchPrice;
      const isLow = i.minStock != null && stock <= Number(i.minStock);
      const sold = soldStats[i.id] || soldStats[i.name] || { qty: 0, amount: 0 };
      const bought = purchasedUnits[i.id] ?? purchasedUnits[i.name] ?? 0;
      // Opening stock: recorded when the item was created; for items created
      // before that was captured, worked back from today's stock
      // (stock − purchased + sold).
      const recorded = i.openingStock !== undefined && i.openingStock !== null;
      const openingQty = recorded
        ? Number(i.openingStock) || 0
        : Math.max(0, stock - bought + (soldUnits[i.id] ?? soldUnits[i.name] ?? 0));
      const openingRate = recorded && i.openingStockRate != null ? Number(i.openingStockRate) || 0 : purchPrice;
      const openingValue = openingQty * openingRate;
      totalOpening += openingQty;
      totalOpeningValue += openingValue;
      totalPurchased += bought;
      totalSoldQty += sold.qty;
      totalSoldAmount += sold.amount;
      totalStock += stock;
      totalStockValue += stockValue;
      if (isLow) lowStockCount++;
      const cat = i.category || 'Uncategorized';
      if (!catStats[cat]) catStats[cat] = { category: cat, itemCount: 0, openingStock: 0, openingValue: 0, purchasedQty: 0, stock: 0, stockValue: 0, soldQty: 0, soldAmount: 0, lowStockCount: 0 };
      catStats[cat].itemCount += 1;
      catStats[cat].openingStock += openingQty;
      catStats[cat].openingValue += openingValue;
      catStats[cat].purchasedQty += bought;
      catStats[cat].stock += stock;
      catStats[cat].stockValue += stockValue;
      catStats[cat].soldQty += sold.qty;
      catStats[cat].soldAmount += sold.amount;
      if (isLow) catStats[cat].lowStockCount += 1;
      rows.push({
        id: i.id,
        name: i.name,
        category: i.category || '—',
        openingStock: openingQty,
        openingValue: fmt(openingValue),
        purchasedQty: bought,
        soldQty: sold.qty,
        soldAmount: fmt(sold.amount),
        stock,
        minStock: i.minStock != null ? Number(i.minStock) : '—',
        salePrice: fmt(i.salePrice || i.price || 0),
        purchasePrice: fmt(purchPrice),
        stockValue: fmt(stockValue),
        _color: isLow ? '#b45309' : undefined,
      });
    }
    const categoryRows = Object.values(catStats)
      .sort((a, b) => b.stockValue - a.stockValue)
      .map(c => ({
        id: c.category,
        category: c.category,
        itemCount: c.itemCount,
        openingStock: c.openingStock,
        openingValue: fmt(c.openingValue),
        purchasedQty: c.purchasedQty,
        stock: c.stock,
        stockValue: fmt(c.stockValue),
        soldQty: c.soldQty,
        soldAmount: fmt(c.soldAmount),
        lowStockCount: c.lowStockCount,
        _color: c.lowStockCount > 0 ? '#b45309' : undefined,
      }));
    return {
      rows, categoryRows,
      totals: { soldQty: totalSoldQty, soldAmount: totalSoldAmount, stock: totalStock, stockValue: totalStockValue, openingStock: totalOpening, openingValue: totalOpeningValue, purchasedQty: totalPurchased },
      lowStockCount,
    };
  }, [reportType, sales, purchases, items, itemsById]);

  // partiesById/salesByPartyId/purchasesByPartyId/paymentsOutByPartyId (used
  // by the party-statement/aged-receivables/vendor-balance branches below)
  // are intentionally omitted from the dep array — they're derived Maps that
  // already depend on the same underlying tables (parties/sales/purchases/
  // payments) already listed, so including them too would be redundant, not
  // incorrect; kept as pre-existing behavior rather than risking new bugs by
  // reworking a memo this large. eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/preserve-manual-memoization
  const reportConfig = useMemo(() => {
    const rc = { title: '', columns: [], rows: [], totals: {} };
    const inRange = d => d >= filters.dateFrom && d <= filters.dateTo;

    if (reportType === 'sales' || reportType === 'purchases') {
      rc.title = reportType === 'sales' ? 'Sales Detail Report' : 'Purchase Detail Report';
      rc.columns = [
        { key: 'date', header: 'Date' },
        { key: 'invoiceNumber', header: 'Invoice #' },
        { key: 'partyName', header: reportType === 'sales' ? 'Customer' : 'Vendor' },
        { key: 'paymentMode', header: 'Mode' },
        { key: 'subtotal', header: 'Subtotal', align: 'right', isTotal: true },
        { key: 'taxAmount', header: 'Tax', align: 'right', isTotal: true },
        { key: 'totalAmount', header: 'Total', align: 'right', isTotal: true },
      ];
      rc.rows = filteredData.map(tx => ({
        ...tx,
        partyName: partiesById.get(tx.partyId)?.name || tx.partyName || '—',
        paymentMode: tx.paymentMode || '—',
        subtotal: fmt(tx.subtotal),
        taxAmount: fmt(tx.taxAmount),
        totalAmount: fmt(tx.totalAmount),
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
      const stats = {};
      filteredData.forEach(tx => {
        (tx.items || []).forEach(item => {
          if (filters.itemIds?.length && !filters.itemIds.includes(item.itemId)) return;
          const k = item.itemId || item.name;
          if (!stats[k]) stats[k] = { itemName: item.name, qty: 0, totalAmount: 0 };
          stats[k].qty += item.qty;
          if (!item.notBilled) stats[k].totalAmount += item.qty * item.price;
        });
      });
      rc.rows = Object.values(stats).sort((a, b) => b.totalAmount - a.totalAmount).map(s => ({
        ...s,
        avgPrice: fmt(s.qty ? s.totalAmount / s.qty : 0),
        totalAmount: fmt(s.totalAmount),
      }));
      rc.totals = {
        qty: Object.values(stats).reduce((s, i) => s + i.qty, 0),
        totalAmount: Object.values(stats).reduce((s, i) => s + i.totalAmount, 0),
      };

    } else if (reportType === 'stock-summary') {
      if (stockView === 'category') {
        rc.title = 'Stock Summary — By Category';
        rc.columns = [
          { key: 'category', header: 'Category' },
          { key: 'itemCount', header: 'Items', align: 'right', isTotal: true },
          { key: 'openingStock', header: 'Opening Stock', align: 'right', isTotal: true },
          { key: 'openingValue', header: 'Opening Value', align: 'right', isTotal: true },
          { key: 'purchasedQty', header: 'Purchased Qty', align: 'right', isTotal: true },
          { key: 'soldQty', header: 'Sold Qty', align: 'right', isTotal: true },
          { key: 'soldAmount', header: 'Sold Amount', align: 'right', isTotal: true },
          { key: 'stock', header: 'In Stock', align: 'right', isTotal: true },
          { key: 'stockValue', header: 'Stock Value', align: 'right', isTotal: true },
          { key: 'lowStockCount', header: 'Low Stock Items', align: 'right' },
        ];
        rc.rows = stockSummaryData?.categoryRows || [];
        rc.totals = {
          itemCount: (stockSummaryData?.categoryRows || []).reduce((s, r) => s + r.itemCount, 0),
          openingStock: stockSummaryData?.totals?.openingStock || 0,
          openingValue: stockSummaryData?.totals?.openingValue || 0,
          purchasedQty: stockSummaryData?.totals?.purchasedQty || 0,
          soldQty: stockSummaryData?.totals?.soldQty || 0,
          soldAmount: stockSummaryData?.totals?.soldAmount || 0,
          stock: stockSummaryData?.totals?.stock || 0,
          stockValue: stockSummaryData?.totals?.stockValue || 0,
        };
      } else {
        rc.title = 'Stock Summary — Opening, Purchased, Sold & In Stock';
        rc.columns = [
          { key: 'name', header: 'Item Name' },
          { key: 'category', header: 'Category' },
          { key: 'openingStock', header: 'Opening Stock', align: 'right', isTotal: true },
          { key: 'openingValue', header: 'Opening Value', align: 'right', isTotal: true },
          { key: 'purchasedQty', header: 'Purchased Qty', align: 'right', isTotal: true },
          { key: 'soldQty', header: 'Sold Qty', align: 'right', isTotal: true },
          { key: 'soldAmount', header: 'Sold Amount', align: 'right', isTotal: true },
          { key: 'stock', header: 'In Stock', align: 'right', isTotal: true },
          { key: 'purchasePrice', header: 'Purchase Price', align: 'right' },
          { key: 'stockValue', header: 'Stock Value', align: 'right', isTotal: true },
          { key: 'minStock', header: 'Min Stock', align: 'right' },
        ];
        // Computed in the narrowly-scoped stockSummaryData memo above (keyed
        // only on sales/items) instead of inline here — see its comment.
        rc.rows = stockSummaryData?.rows || [];
        rc.totals = stockSummaryData?.totals || {};
      }

    } else if (reportType === 'party-statement') {
      rc.title = filters.partyId
        ? `Party Statement — ${partiesById.get(filters.partyId)?.name || ''}`
        : 'Party Statement';
      rc.columns = [
        { key: 'date', header: 'Date' },
        { key: 'type', header: 'Type' },
        { key: 'refNo', header: 'Ref #' },
        { key: 'debit', header: 'Debit', align: 'right', isTotal: true },
        { key: 'credit', header: 'Credit', align: 'right', isTotal: true },
        { key: 'balance', header: 'Balance', align: 'right' },
      ];
      if (!filters.partyId) {
        rc.rows = [];
        rc.totals = {};
        rc._noParty = true;
        return rc;
      }
      const pid = filters.partyId;
      const party = partiesById.get(pid);
      // Build the SAME shape of transaction (debitRaw/creditRaw) for every
      // record touching this party, regardless of date, so it can be split
      // into "before the selected range" (folded into the opening balance)
      // and "inside the selected range" (the rows actually shown) below —
      // a single source of truth instead of two separately-hand-written
      // debit/credit derivations that could drift out of sync with each
      // other.
      // Sign convention, matching how each of these already actually moves
      // `party.balance` elsewhere in the app (party.balance: positive =
      // they owe us, negative = we owe them):
      //  - Sale        → they owe us MORE → Credit (was already correct)
      //  - Purchase    → we owe them MORE → Debit  (was already correct)
      //  - PaymentIn   → they owe us LESS (money received)  → Debit
      //  - PaymentOut  → we owe them LESS (money paid out)  → Credit
      //  - Credit Note → they owe us LESS (return/discount) → Debit
      //  - Debit Note  → we owe them LESS (return to vendor) → Credit
      // PaymentEntry.jsx's own `balance: party.balance + (isPaymentIn ?
      // -totalSettled : totalSettled)` confirms PaymentIn subtracts — this
      // report had Payment Received/Made and both notes backwards (every
      // payment/note showing as an extra Credit on top of the Sale that
      // created the receivable in the first place, instead of settling it
      // back down), which is what made every entry come out "in credit."
      const buildRow = (tx) => {
        if (tx._kind === 'sale') return { date: tx.date, type: 'Sale', refNo: tx.invoiceNumber || '—', debitRaw: 0, creditRaw: tx.totalAmount || 0, id: tx.id, _txType: 'sales', createdAt: tx.createdAt };
        if (tx._kind === 'purchase') return { date: tx.date, type: 'Purchase', refNo: tx.invoiceNumber || '—', debitRaw: tx.totalAmount || 0, creditRaw: 0, id: tx.id, _txType: 'purchases', createdAt: tx.createdAt };
        if (tx._kind === 'payment') {
          const isIn = tx.type === 'PaymentIn' || tx.mode === 'payment-in';
          const amt = tx.totalAmount || tx.amount || 0;
          return { date: tx.date, type: isIn ? 'Payment Received' : 'Payment Made', refNo: tx.referenceNo || '—', debitRaw: isIn ? amt : 0, creditRaw: isIn ? 0 : amt, createdAt: tx.createdAt };
        }
        if (tx._kind === 'creditNote') return { date: tx.date, type: 'Credit Note', refNo: tx.noteNumber || '—', debitRaw: tx.amount || 0, creditRaw: 0, createdAt: tx.createdAt };
        return { date: tx.date, type: 'Debit Note', refNo: tx.noteNumber || '—', debitRaw: 0, creditRaw: tx.amount || 0, createdAt: tx.createdAt };
      };
      const allPartyTx = [
        ...(salesByPartyId.get(pid) || []).map(s => ({ ...s, _kind: 'sale' })),
        ...(purchasesByPartyId.get(pid) || []).map(p => ({ ...p, _kind: 'purchase' })),
        ...payments.filter(p => p.partyId === pid).map(p => ({ ...p, _kind: 'payment' })),
        ...creditNotes.filter(c => c.partyId === pid).map(c => ({ ...c, _kind: 'creditNote' })),
        ...debitNotes.filter(d => d.partyId === pid).map(d => ({ ...d, _kind: 'debitNote' })),
      ];
      // Opening balance FOR THIS STATEMENT = the party's actual balance at
      // account creation PLUS every transaction that happened before the
      // selected date range — not just `party.openingBalance` on its own,
      // which only reflects the balance at creation time and, used alone
      // with a date-filtered transaction list, silently drops every
      // transaction between creation and `dateFrom` from the running
      // balance. That was producing a running balance/closing balance that
      // didn't match the party's real books for any date range not
      // starting from day one — the "wrong accounts" bug.
      const beforeRangeNet = allPartyTx
        .filter(tx => tx.date < filters.dateFrom)
        .reduce((sum, tx) => { const r = buildRow(tx); return sum + r.creditRaw - r.debitRaw; }, 0);
      const openingForRange = Number(party?.openingBalance || 0) + beforeRangeNet;

      const allTx = allPartyTx
        .filter(tx => inRange(tx.date))
        .map(buildRow)
        .sort(byTxTimeAsc);

      let runningBalance = openingForRange;
      let totalDebit = 0, totalCredit = 0;
      // Explicit "Opening Balance" row so the running balance's actual
      // starting point (now correctly carrying forward everything before
      // `dateFrom`, not just the balance at account creation) is visible
      // and auditable on the statement itself, the same way a bank
      // statement always shows its own opening line.
      const openingRow = {
        date: filters.dateFrom, type: 'Opening Balance', refNo: '—',
        debit: '—', credit: '—',
        balance: fmt(Math.abs(openingForRange)) + (openingForRange >= 0 ? ' Cr' : ' Dr'),
        _bold: true,
      };
      rc.rows = [openingRow, ...allTx.map(tx => {
        runningBalance += tx.creditRaw - tx.debitRaw;
        totalDebit += tx.debitRaw;
        totalCredit += tx.creditRaw;
        return {
          date: tx.date, type: tx.type, refNo: tx.refNo,
          id: tx.id, _txType: tx._txType,
          debit: tx.debitRaw > 0 ? fmt(tx.debitRaw) : '—',
          credit: tx.creditRaw > 0 ? fmt(tx.creditRaw) : '—',
          balance: fmt(Math.abs(runningBalance)) + (runningBalance >= 0 ? ' Cr' : ' Dr'),
        };
      })];
      rc.totals = { debit: totalDebit, credit: totalCredit };

    } else if (reportType === 'credit-debit-notes') {
      rc.title = 'Credit / Debit Notes';
      rc.columns = [
        { key: 'date', header: 'Date' },
        { key: 'noteType', header: 'Type' },
        { key: 'noteNumber', header: 'Note #' },
        { key: 'partyName', header: 'Party' },
        { key: 'linkedInvoice', header: 'Linked Invoice' },
        { key: 'amount', header: 'Amount', align: 'right', isTotal: true },
      ];
      const allNotes = [
        ...creditNotes.filter(c => inRange(c.date)).map(c => ({ ...c, noteType: 'Credit Note', _noteTypeColor: '#5c1f22' })),
        ...debitNotes.filter(d => inRange(d.date)).map(d => ({ ...d, noteType: 'Debit Note', _noteTypeColor: '#dc2626' })),
      ].sort((a, b) => b.date.localeCompare(a.date));
      rc.rows = allNotes.map(n => ({
        ...n,
        partyName: parties.find(p => p.id === n.partyId)?.name || n.partyName || '—',
        linkedInvoice: n.linkedInvoice || n.invoiceNumber || '—',
        amount: fmt(n.amount || n.totalAmount || 0),
        _amtRaw: Number(n.amount || n.totalAmount || 0),
      }));
      rc.totals = { amount: rc.rows.reduce((s, r) => s + r._amtRaw, 0) };
      rc.rows = rc.rows.map(({ _amtRaw, ...rest }) => rest);

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
      sales.filter(tx => inRange(tx.date)).forEach(tx => {
        (tx.items || []).forEach(item => {
          const rate = item.taxRate || 0;
          if (!gstStats[rate]) gstStats[rate] = { taxRate: `${rate}%`, taxableValue: 0, taxAmount: 0 };
          const taxable = itemTaxableBase(item);
          gstStats[rate].taxableValue += taxable;
          gstStats[rate].taxAmount += taxable * (rate / 100);
        });
      });
      rc.rows = Object.values(gstStats).sort((a, b) => parseFloat(a.taxRate) - parseFloat(b.taxRate)).map(s => ({
        ...s,
        taxableValue: fmt(s.taxableValue),
        cgst: fmt(s.taxAmount / 2),
        sgst: fmt(s.taxAmount / 2),
        taxAmount: fmt(s.taxAmount),
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
        { key: 'amount', header: 'Amount', align: 'right' },
      ];
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
        { account: 'Revenue (Sales)', amount: fmt(revenue), _bold: true },
        { account: `(−) Cost of Purchases`, amount: fmt(cogs) },
        { account: 'Gross Profit', amount: fmt(grossProfit), _bold: true, _color: grossProfit >= 0 ? '#5c1f22' : '#dc2626' },
        { account: 'Operating Expenses', amount: '', _section: true },
        ...Object.entries(expByCat).map(([cat, amt]) => ({ account: `   ${cat}`, amount: fmt(amt) })),
        { account: `Total Expenses`, amount: fmt(totalExpenses) },
        { account: netProfit >= 0 ? 'Net Profit' : 'Net Loss', amount: fmt(Math.abs(netProfit)), _bold: true, _color: netProfit >= 0 ? '#5c1f22' : '#dc2626' },
      ];
      rc.totals = {};

    } else if (reportType === 'investor-pl') {
      // Same net-profit formula as the Profit & Loss report above, split by
      // each active investor's fixed ownership %. Duplicated here rather than
      // shared with Investors.jsx's own inline P&L Split tab, matching how
      // every report in this file computes its own scoped figures.
      rc.title = 'Investors Profit & Loss Split';
      rc.columns = [
        { key: 'account', header: 'Investor' },
        { key: 'percent', header: 'Ownership %', align: 'center' },
        { key: 'amount', header: 'Share Amount', align: 'right' },
      ];
      const ipRevenue = sales.filter(s => inRange(s.date)).reduce((a, s) => a + (s.totalAmount || 0), 0);
      const ipCogs = purchases.filter(p => inRange(p.date)).reduce((a, p) => a + (p.totalAmount || 0), 0);
      const ipExpenses = expenses.filter(e => inRange(e.date)).reduce((a, e) => a + (Number(e.amount) || 0), 0);
      const ipNetProfit = ipRevenue - ipCogs - ipExpenses;
      const ipIsLoss = ipNetProfit < 0;
      const ipPercentSum = investors.reduce((s, i) => s + (Number(i.ownershipPercent) || 0), 0);
      const ipUnallocated = Math.max(0, 100 - ipPercentSum);
      rc.rows = [
        { account: 'Revenue (Sales)', percent: '', amount: fmt(ipRevenue), _bold: true, _section: true },
        { account: '(−) Cost of Purchases', percent: '', amount: fmt(ipCogs), _section: true },
        { account: '(−) Total Expenses', percent: '', amount: fmt(ipExpenses), _section: true },
        { account: ipIsLoss ? 'Net Loss' : 'Net Profit', percent: '', amount: fmt(Math.abs(ipNetProfit)), _bold: true, _color: ipIsLoss ? '#dc2626' : '#5c1f22', _section: true },
        ...investors.map(inv => {
          const pct = Number(inv.ownershipPercent) || 0;
          const share = ipNetProfit * pct / 100;
          return { account: inv.name, percent: `${pct}%`, amount: share < 0 ? `(${fmt(Math.abs(share))})` : fmt(share), _color: share < 0 ? '#dc2626' : undefined };
        }),
        ...(ipUnallocated > 0 ? [{ account: 'Unallocated (retained by business)', percent: `${ipUnallocated}%`, amount: fmt(ipNetProfit * ipUnallocated / 100), _color: '#5f4f47' }] : []),
      ];
      rc.totals = {};

    } else if (reportType === 'bill-profit') {
      // Per-invoice profit: for each sale line item, cost = item master's
      // current purchasePrice × qty (sale line items don't snapshot cost at
      // sale time, so this uses today's item master cost, same basis Stock
      // Summary already uses to value on-hand inventory — historically
      // approximate if purchase price has since changed, by design). A
      // recipe item (made from other items, e.g. Tomato Rice) has its cost
      // rolled up from its components' purchase prices instead (unitCostOf),
      // since the recipe item's own purchasePrice field is normally unset.
      rc.title = 'Bill-wise Profit & Loss';
      rc.columns = [
        { key: 'date', header: 'Date' },
        { key: 'invoiceNumber', header: 'Invoice #' },
        { key: 'partyName', header: 'Customer' },
        { key: 'revenue', header: 'Revenue', align: 'right', isTotal: true },
        { key: 'cost', header: 'Cost (COGS)', align: 'right', isTotal: true },
        { key: 'profit', header: 'Profit', align: 'right', isTotal: true },
        { key: 'margin', header: 'Margin %', align: 'right' },
      ];
      const billFiltered = sales.filter(s => inRange(s.date) && (!filters.partyIds?.length || filters.partyIds.includes(s.partyId)));
      let totalRevenue = 0, totalCost = 0;
      rc.rows = billFiltered.map(tx => {
        const revenue = Number(tx.totalAmount || 0);
        let cost = 0;
        (tx.items || []).forEach(li => {
          const master = (li.itemId && itemsById.get(li.itemId)) || null;
          if (master && Array.isArray(master.recipe) && master.recipe.length > 0) {
            // Recipe item — cost the components actually deducted for this
            // sale (recipeOverrides, if the user nudged it), not a recomputed
            // recipe default, so this matches what stock actually lost.
            const qty = Number(li.qty) || 0;
            master.recipe.forEach(r => {
              const override = li.recipeOverrides?.[r.itemId];
              const compQty = override != null ? Number(override) : (Number(r.qtyPerUnit) || 0) * qty;
              cost += unitCostOf(itemsById.get(r.itemId)) * compQty;
            });
          } else {
            cost += unitCostOf(master, li) * (Number(li.qty) || 0);
          }
        });
        const profit = revenue - cost;
        totalRevenue += revenue;
        totalCost += cost;
        return {
          id: tx.id,
          date: tx.date,
          invoiceNumber: tx.invoiceNumber || '—',
          partyName: partiesById.get(tx.partyId)?.name || tx.partyName || 'Cash & Carry',
          revenue: fmt(revenue),
          cost: fmt(cost),
          profit: fmt(profit),
          margin: revenue ? `${((profit / revenue) * 100).toFixed(1)}%` : '—',
          _color: profit >= 0 ? undefined : '#dc2626',
        };
      }).sort((a, b) => b.date.localeCompare(a.date));
      rc.totals = { revenue: totalRevenue, cost: totalCost, profit: totalRevenue - totalCost };

    } else if (reportType === 'party-profit') {
      // Same per-line-item COGS basis as Bill-wise P&L, aggregated by customer.
      rc.title = 'Party-wise Profit & Loss';
      rc.columns = [
        { key: 'partyName', header: 'Customer' },
        { key: 'invoiceCount', header: 'Invoices', align: 'right', isTotal: true },
        { key: 'revenue', header: 'Revenue', align: 'right', isTotal: true },
        { key: 'cost', header: 'Cost (COGS)', align: 'right', isTotal: true },
        { key: 'profit', header: 'Profit', align: 'right', isTotal: true },
        { key: 'margin', header: 'Margin %', align: 'right' },
      ];
      const partyFiltered = sales.filter(s => inRange(s.date) && (!filters.partyIds?.length || filters.partyIds.includes(s.partyId)));
      const stats = {};
      partyFiltered.forEach(tx => {
        const key = tx.partyId || '__cashcarry__';
        if (!stats[key]) {
          stats[key] = {
            partyId: tx.partyId || null,
            partyName: partiesById.get(tx.partyId)?.name || tx.partyName || 'Cash & Carry',
            invoiceCount: 0, revenue: 0, cost: 0,
          };
        }
        const revenue = Number(tx.totalAmount || 0);
        let cost = 0;
        (tx.items || []).forEach(li => {
          const master = (li.itemId && itemsById.get(li.itemId)) || null;
          if (master && Array.isArray(master.recipe) && master.recipe.length > 0) {
            const qty = Number(li.qty) || 0;
            master.recipe.forEach(r => {
              const override = li.recipeOverrides?.[r.itemId];
              const compQty = override != null ? Number(override) : (Number(r.qtyPerUnit) || 0) * qty;
              cost += unitCostOf(itemsById.get(r.itemId)) * compQty;
            });
          } else {
            cost += unitCostOf(master, li) * (Number(li.qty) || 0);
          }
        });
        stats[key].invoiceCount += 1;
        stats[key].revenue += revenue;
        stats[key].cost += cost;
      });
      const statList = Object.values(stats).sort((a, b) => (b.revenue - b.cost) - (a.revenue - a.cost));
      rc.rows = statList.map(s => {
        const profit = s.revenue - s.cost;
        return {
          id: s.partyId || `cashcarry_${s.partyName}`,
          _partyId: s.partyId || null,
          partyName: s.partyName,
          invoiceCount: s.invoiceCount,
          revenue: fmt(s.revenue),
          cost: fmt(s.cost),
          profit: fmt(profit),
          margin: s.revenue ? `${((profit / s.revenue) * 100).toFixed(1)}%` : '—',
          _color: profit >= 0 ? undefined : '#dc2626',
        };
      });
      rc.totals = {
        invoiceCount: statList.reduce((s, r) => s + r.invoiceCount, 0),
        revenue: statList.reduce((s, r) => s + r.revenue, 0),
        cost: statList.reduce((s, r) => s + r.cost, 0),
        profit: statList.reduce((s, r) => s + (r.revenue - r.cost), 0),
      };

    } else if (reportType === 'party-group') {
      // One row per Group (Parties → the party's own free-form Group field —
      // see partyUtils.js/PartyFormDialog.jsx), covering BOTH customers and
      // vendors in the same list since a group can hold either. Sales and
      // Purchases within the date range are summed per group; a party with
      // no group set falls into a single "Ungrouped" bucket rather than
      // being silently dropped from the report.
      rc.title = 'Customer/Vendor Group';
      rc.columns = [
        { key: 'groupName', header: 'Group' },
        { key: 'partyCount', header: 'Parties', align: 'right' },
        { key: 'salesCount', header: 'Sale Bills', align: 'right' },
        { key: 'salesAmount', header: 'Sales', align: 'right', isTotal: true },
        { key: 'purchaseCount', header: 'Purchase Bills', align: 'right' },
        { key: 'purchaseAmount', header: 'Purchases', align: 'right', isTotal: true },
      ];
      const salesInRange = sales.filter(s => inRange(s.date));
      const purchasesInRange = purchases.filter(p => inRange(p.date));
      const groupOf = (partyId) => {
        const p = partiesById.get(partyId);
        return (p?.group || '').trim() || null; // null = Ungrouped bucket
      };
      const gstats = {};
      const ensure = (key) => {
        if (!gstats[key]) {
          gstats[key] = {
            groupKey: key,
            groupName: key === '__ungrouped__' ? 'Ungrouped' : key,
            partyIds: new Set(),
            salesCount: 0, salesAmount: 0,
            purchaseCount: 0, purchaseAmount: 0,
          };
        }
        return gstats[key];
      };
      salesInRange.forEach(tx => {
        if (!tx.partyId) return; // Cash & Carry has no party, so no group
        const g = groupOf(tx.partyId) || '__ungrouped__';
        // A party with no group at all (never assigned one) is excluded
        // from the Ungrouped bucket too — only a party whose group was
        // explicitly cleared/never set counts there; this matches "group"
        // being an opt-in field, not everyone's an implicit member of
        // "Ungrouped" unless they actually have sales/purchases to show.
        const entry = ensure(g);
        entry.partyIds.add(tx.partyId);
        entry.salesCount += 1;
        entry.salesAmount += Number(tx.totalAmount || 0);
      });
      purchasesInRange.forEach(tx => {
        if (!tx.partyId) return;
        const g = groupOf(tx.partyId) || '__ungrouped__';
        const entry = ensure(g);
        entry.partyIds.add(tx.partyId);
        entry.purchaseCount += 1;
        entry.purchaseAmount += Number(tx.totalAmount || 0);
      });
      const groupList = Object.values(gstats).sort((a, b) => (b.salesAmount + b.purchaseAmount) - (a.salesAmount + a.purchaseAmount));
      rc.rows = groupList.map(g => ({
        id: g.groupKey,
        _groupKey: g.groupKey,
        groupName: g.groupName,
        partyCount: g.partyIds.size,
        salesCount: g.salesCount,
        salesAmount: fmt(g.salesAmount),
        purchaseCount: g.purchaseCount,
        purchaseAmount: fmt(g.purchaseAmount),
      }));
      rc.totals = {
        partyCount: new Set(groupList.flatMap(g => Array.from(g.partyIds))).size,
        salesCount: groupList.reduce((s, g) => s + g.salesCount, 0),
        salesAmount: groupList.reduce((s, g) => s + g.salesAmount, 0),
        purchaseCount: groupList.reduce((s, g) => s + g.purchaseCount, 0),
        purchaseAmount: groupList.reduce((s, g) => s + g.purchaseAmount, 0),
      };

    } else if (reportType === 'item-profit') {
      // Same per-line-item COGS basis as Bill-wise/Party-wise P&L, aggregated
      // by item instead of by invoice/customer — revenue/cost/qty summed
      // across every sale line for that item within the date range (and
      // Party/Item multiselect filters, if set). Recipe items (made from
      // other stock items) cost their components' purchase prices, same as
      // the other two P&L reports and Stock Summary.
      rc.title = 'Item-wise Profit & Loss';
      rc.columns = [
        { key: 'itemName', header: 'Item' },
        { key: 'category', header: 'Category' },
        { key: 'qtySold', header: 'Qty Sold', align: 'right', isTotal: true },
        { key: 'revenue', header: 'Revenue', align: 'right', isTotal: true },
        { key: 'cost', header: 'Cost (COGS)', align: 'right', isTotal: true },
        { key: 'profit', header: 'Profit', align: 'right', isTotal: true },
        { key: 'margin', header: 'Margin %', align: 'right' },
      ];
      const itemPFiltered = sales.filter(s => inRange(s.date) && (!filters.partyIds?.length || filters.partyIds.includes(s.partyId)));
      const istats = {};
      itemPFiltered.forEach(tx => {
        (tx.items || []).forEach(li => {
          if (li.notBilled) return;
          const key = li.itemId || li.name;
          if (!key) return;
          if (filters.itemIds?.length && !filters.itemIds.includes(li.itemId)) return;
          const master = (li.itemId && itemsById.get(li.itemId)) || null;
          const qty = Number(li.qty) || 0;
          const revenue = qty * (Number(li.price) || 0) * (1 - (Number(li.discountPercent) || 0) / 100);
          let cost = 0;
          if (master && Array.isArray(master.recipe) && master.recipe.length > 0) {
            master.recipe.forEach(r => {
              const override = li.recipeOverrides?.[r.itemId];
              const compQty = override != null ? Number(override) : (Number(r.qtyPerUnit) || 0) * qty;
              cost += unitCostOf(itemsById.get(r.itemId)) * compQty;
            });
          } else {
            cost += unitCostOf(master, li) * qty;
          }
          if (!istats[key]) {
            istats[key] = {
              itemId: li.itemId || null,
              itemName: master?.name || li.name || 'Unknown Item',
              category: master?.category || '—',
              qtySold: 0, revenue: 0, cost: 0,
            };
          }
          istats[key].qtySold += qty;
          istats[key].revenue += revenue;
          istats[key].cost += cost;
        });
      });
      const itemStatList = Object.values(istats).sort((a, b) => (b.revenue - b.cost) - (a.revenue - a.cost));
      rc.rows = itemStatList.map(s => {
        const profit = s.revenue - s.cost;
        return {
          id: s.itemId || `unlinked_${s.itemName}`,
          _itemId: s.itemId || null,
          itemName: s.itemName,
          category: s.category,
          qtySold: s.qtySold,
          revenue: fmt(s.revenue),
          cost: fmt(s.cost),
          profit: fmt(profit),
          margin: s.revenue ? `${((profit / s.revenue) * 100).toFixed(1)}%` : '—',
          _color: profit >= 0 ? undefined : '#dc2626',
        };
      });
      rc.totals = {
        qtySold: itemStatList.reduce((s, r) => s + r.qtySold, 0),
        revenue: itemStatList.reduce((s, r) => s + r.revenue, 0),
        cost: itemStatList.reduce((s, r) => s + r.cost, 0),
        profit: itemStatList.reduce((s, r) => s + (r.revenue - r.cost), 0),
      };

    } else if (reportType === 'cash-flow') {
      rc.title = 'Cash Flow Statement';
      rc.columns = [
        { key: 'date', header: 'Date' },
        { key: 'type', header: 'Type' },
        { key: 'refNo', header: 'Ref #' },
        { key: 'mode', header: 'Mode' },
        { key: 'inflow', header: 'Inflow', align: 'right', isTotal: true },
        { key: 'outflow', header: 'Outflow', align: 'right', isTotal: true },
      ];
      // Cash + Bank/UPI combined movement — same "cash" vs "digital" mode
      // classification cashUtils.js's computeCashInHand/computeBankBalance
      // use, but presented as a flat dated ledger (transaction detail, like
      // Cash.jsx's cashMovements/bankMovements lists) rather than just a
      // running balance, since this is a report over a date range.
      const isCashMode = (m) => String(m || '').trim().toLowerCase() === 'cash';
      const modeOf = (r) => r.paymentMode || r.mode || '—';
      const entries = [];
      sales.filter(s => inRange(s.date)).forEach(s => {
        const amt = Number(s.totalAmount || 0);
        if (!amt) return;
        if (s.paymentMode === 'Split' && s.paymentSplit) {
          if (s.paymentSplit.cash) entries.push({ date: s.date, type: 'Sale', refNo: s.invoiceNumber || '—', mode: 'Cash', inflow: Number(s.paymentSplit.cash), createdAt: s.createdAt });
          if (s.paymentSplit.bank) entries.push({ date: s.date, type: 'Sale', refNo: s.invoiceNumber || '—', mode: 'Bank/UPI', inflow: Number(s.paymentSplit.bank), createdAt: s.createdAt });
        } else if (s.status === 'paid' || !s.partyId) {
          entries.push({ date: s.date, type: 'Sale', refNo: s.invoiceNumber || '—', mode: modeOf(s), inflow: amt, createdAt: s.createdAt });
        }
      });
      purchases.filter(p => inRange(p.date)).forEach(p => {
        const amt = Number(p.totalAmount || 0);
        if (!amt) return;
        if (p.paymentMode === 'Split' && p.paymentSplit) {
          if (p.paymentSplit.cash) entries.push({ date: p.date, type: 'Purchase', refNo: p.invoiceNumber || '—', mode: 'Cash', outflow: Number(p.paymentSplit.cash), createdAt: p.createdAt });
          if (p.paymentSplit.bank) entries.push({ date: p.date, type: 'Purchase', refNo: p.invoiceNumber || '—', mode: 'Bank/UPI', outflow: Number(p.paymentSplit.bank), createdAt: p.createdAt });
        } else if (p.status === 'paid' || !p.partyId) {
          entries.push({ date: p.date, type: 'Purchase', refNo: p.invoiceNumber || '—', mode: modeOf(p), outflow: amt, createdAt: p.createdAt });
        }
      });
      payments.filter(pm => inRange(pm.date)).forEach(pm => {
        const isIn = pm.type === 'PaymentIn' || pm.mode === 'payment-in';
        const amt = Number(pm.totalAmount || pm.amount || 0);
        if (!amt) return;
        entries.push({
          date: pm.date, type: isIn ? 'Payment Received' : 'Payment Made', refNo: pm.referenceNo || '—',
          mode: modeOf(pm), inflow: isIn ? amt : 0, outflow: isIn ? 0 : amt, createdAt: pm.createdAt,
        });
      });
      expenses.filter(e => inRange(e.date)).forEach(e => {
        const amt = Number(e.amount || 0);
        if (!amt) return;
        entries.push({ date: e.date, type: 'Expense', refNo: e.category || '—', mode: modeOf(e), outflow: amt, createdAt: e.createdAt });
      });
      entries.sort(byTxTimeAsc);
      let totalIn = 0, totalOut = 0;
      rc.rows = entries.map(e => {
        const inflow = Number(e.inflow || 0);
        const outflow = Number(e.outflow || 0);
        totalIn += inflow;
        totalOut += outflow;
        return {
          date: e.date, type: e.type, refNo: e.refNo, mode: e.mode,
          inflow: inflow ? fmt(inflow) : '—',
          outflow: outflow ? fmt(outflow) : '—',
        };
      });
      rc.totals = { inflow: totalIn, outflow: totalOut };

    } else if (reportType === 'expenses') {
      rc.title = 'Expense Report';
      rc.columns = [
        { key: 'date', header: 'Date' },
        { key: 'category', header: 'Category' },
        { key: 'description', header: 'Description' },
        { key: 'paymentMode', header: 'Mode' },
        { key: 'amount', header: 'Amount', align: 'right', isTotal: true },
      ];
      const expFiltered = expenses.filter(e => inRange(e.date) && (!filters.partyIds?.length || filters.partyIds.includes(e.partyId)));
      rc.rows = expFiltered.sort((a, b) => b.date.localeCompare(a.date)).map(e => ({
        ...e,
        category: e.category || 'Other',
        description: e.description || '—',
        paymentMode: e.paymentMode || '—',
        amount: fmt(e.amount),
      }));
      rc.totals = { amount: expFiltered.reduce((s, e) => s + (Number(e.amount) || 0), 0) };

    } else if (reportType === 'expense-category') {
      rc.title = 'Expense by Category';
      rc.columns = [
        { key: 'category', header: 'Category' },
        { key: 'count', header: 'Count', align: 'right', isTotal: true },
        { key: 'totalAmount', header: 'Total Amount', align: 'right', isTotal: true },
      ];
      const expFiltered = expenses.filter(e => inRange(e.date));
      const catMap = {};
      expFiltered.forEach(e => {
        const cat = e.category || 'Others';
        if (!catMap[cat]) catMap[cat] = { count: 0, totalAmount: 0 };
        catMap[cat].count += 1;
        catMap[cat].totalAmount += Number(e.amount) || 0;
      });
      rc.rows = Object.entries(catMap)
        .sort((a, b) => b[1].totalAmount - a[1].totalAmount)
        .map(([cat, s]) => ({
          category: cat,
          count: s.count,
          totalAmount: fmt(s.totalAmount),
          _totalAmtRaw: s.totalAmount,
        }));
      rc.totals = {
        count: expFiltered.length,
        totalAmount: expFiltered.reduce((s, e) => s + (Number(e.amount) || 0), 0),
      };
      rc.rows = rc.rows.map(({ _totalAmtRaw, ...rest }) => rest);

    } else if (reportType === 'payment-mode') {
      rc.title = 'Payment Mode Summary';
      rc.columns = [
        { key: 'mode', header: 'Payment Mode' },
        { key: 'salesCount', header: 'Sales Count', align: 'right', isTotal: true },
        { key: 'salesAmount', header: 'Sales Amount', align: 'right', isTotal: true },
        { key: 'expenseCount', header: 'Expense Count', align: 'right', isTotal: true },
        { key: 'expenseAmount', header: 'Expense Amount', align: 'right', isTotal: true },
      ];
      const modeMap = {};
      const ensureMode = m => {
        const key = m || 'Unknown';
        if (!modeMap[key]) modeMap[key] = { salesCount: 0, salesAmountRaw: 0, expenseCount: 0, expenseAmountRaw: 0 };
        return key;
      };
      sales.filter(s => inRange(s.date)).forEach(s => {
        const k = ensureMode(s.paymentMode);
        modeMap[k].salesCount += 1;
        modeMap[k].salesAmountRaw += s.totalAmount || 0;
      });
      expenses.filter(e => inRange(e.date)).forEach(e => {
        const k = ensureMode(e.paymentMode);
        modeMap[k].expenseCount += 1;
        modeMap[k].expenseAmountRaw += Number(e.amount) || 0;
      });
      rc.rows = Object.entries(modeMap)
        .sort((a, b) => b[1].salesAmountRaw - a[1].salesAmountRaw)
        .map(([mode, s]) => ({
          mode,
          salesCount: s.salesCount,
          salesAmount: fmt(s.salesAmountRaw),
          expenseCount: s.expenseCount,
          expenseAmount: fmt(s.expenseAmountRaw),
          _salesAmtRaw: s.salesAmountRaw,
          _expAmtRaw: s.expenseAmountRaw,
        }));
      rc.totals = {
        salesCount: rc.rows.reduce((s, r) => s + r.salesCount, 0),
        salesAmount: rc.rows.reduce((s, r) => s + r._salesAmtRaw, 0),
        expenseCount: rc.rows.reduce((s, r) => s + r.expenseCount, 0),
        expenseAmount: rc.rows.reduce((s, r) => s + r._expAmtRaw, 0),
      };
      rc.rows = rc.rows.map(({ _salesAmtRaw, _expAmtRaw, ...rest }) => rest);

    } else if (reportType === 'payments') {
      rc.title = 'Payment Report';
      rc.columns = [
        { key: 'date', header: 'Date' },
        { key: 'partyName', header: 'Party' },
        { key: 'type', header: 'Type' },
        { key: 'mode', header: 'Mode' },
        { key: 'referenceNo', header: 'Reference' },
        { key: 'totalAmount', header: 'Amount', align: 'right', isTotal: true },
      ];
      const payFiltered = payments.filter(p => inRange(p.date) && (!filters.partyIds?.length || filters.partyIds.includes(p.partyId)));
      rc.rows = payFiltered.sort((a, b) => b.date.localeCompare(a.date)).map(p => ({
        ...p,
        partyName: parties.find(par => par.id === p.partyId)?.name || p.partyName || '—',
        type: p.type === 'PaymentIn' || p.mode === 'payment-in' ? 'Payment In' : 'Payment Out',
        mode: p.paymentMode || p.mode || '—',
        referenceNo: p.referenceNo || '—',
        totalAmount: fmt(p.totalAmount || p.amount),
      }));
      rc.totals = { totalAmount: payFiltered.reduce((s, p) => s + (p.totalAmount || p.amount || 0), 0) };

    } else if (reportType === 'day-book') {
      // "Money In / Money Out" cash-book — only counts rupees that actually
      // changed hands, reusing cashUtils.js's isSettled() (same rule the
      // Cash in Hand / Bank Balance KPIs already use): a Cash/Bank/Split sale
      // or purchase counts its FULL total once it's status:'paid' (or Cash &
      // Carry with no party); a credit sale/purchase with no advance counts
      // ₹0 (it's still listed, Payment Type shows "Credit", so the invoice
      // itself isn't hidden — it just correctly shows no cash moved yet).
      // The advance itself is deliberately NOT read from sale.advance here —
      // Sales.jsx/POS.jsx already write it as its own PaymentIn/PaymentOut
      // row (ADV-<invoiceNumber>), which this list already includes, so
      // reading sale.advance too would double-count that money.
      rc.title = 'Day Book — Money In / Money Out';
      rc.columns = [
        { key: 'partyName', header: 'Name', width: 170 },
        { key: 'invoiceNumber', header: 'Ref #', width: 90 },
        { key: 'type', header: 'Type', width: 90 },
        { key: 'timeStr', header: 'Time', width: 80 },
        { key: 'mode', header: 'Payment Type', width: 110 },
        { key: 'total', header: 'Invoice Total', align: 'right', width: 120 },
        { key: 'moneyIn', header: 'Money In', align: 'right', isTotal: true, width: 120 },
        { key: 'moneyOut', header: 'Money Out', align: 'right', isTotal: true, width: 120 },
      ];
      const dbTypeLabels = { Sale: 'Sale', Purchase: 'Purchase', Expense: 'Expense', Received: 'Payment-In', Paid: 'Payment-Out', CashIn: 'Cash In', CashOut: 'Cash Out' };
      // Manual cash-book entries (Capital Added, Owner Drawings, Bank
      // Deposit/Withdrawal, etc.) — always fully settled the moment they're
      // recorded (there's no "credit" concept for a manual cash-book entry),
      // so they always move cash for their full amount, same as Expense.
      // A Cash ↔ Bank transfer (Cash.jsx's Transfer dialog) saves as two
      // linked cashEntries rows sharing a `transferId` — one 'out'/'bank_out'
      // leg and one 'in'/'bank_in' leg. Each leg is still listed here (money
      // genuinely moved in both books), just labeled distinctly so it reads
      // as a transfer pair rather than two unrelated entries.
      const cashEntryTx = cashEntries.filter(c => inRange(c.date)).map(c => ({
        ...c,
        _type: (c.type === 'in' || c.type === 'bank_in') ? 'CashIn' : 'CashOut',
        totalAmount: c.amount,
        partyName: c.transferId
          ? (c.type === 'bank_in' || c.type === 'bank_out' ? 'Transfer (Bank)' : 'Transfer (Cash)')
          : (c.reason || (c.type === 'in' || c.type === 'bank_in' ? 'Cash In' : 'Cash Out')),
        invoiceNumber: c.note || '—',
        paymentMode: (c.type === 'bank_in' || c.type === 'bank_out') ? 'Bank' : 'Cash',
      }));
      const allTx = [
        ...sales.filter(s => inRange(s.date)).map(s => ({ ...s, _type: 'Sale' })),
        ...purchases.filter(p => inRange(p.date)).map(p => ({ ...p, _type: 'Purchase' })),
        ...expenses.filter(e => inRange(e.date)).map(e => ({ ...e, _type: 'Expense', totalAmount: e.amount })),
        ...payments.filter(p => inRange(p.date)).map(p => ({ ...p, _type: p.type === 'PaymentIn' || p.mode === 'payment-in' ? 'Received' : 'Paid', totalAmount: p.totalAmount || p.amount })),
        ...cashEntryTx,
      ].sort(byTxTimeAsc);
      // Cash actually moved by this row: for Sale/Purchase, only the invoice
      // total once settled — a credit invoice moves ₹0 until a payment
      // record shows up separately; Expense/Payment/CashIn/CashOut rows
      // always move cash.
      const cashMoved = (tx) => {
        if (tx._type === 'Sale' || tx._type === 'Purchase') {
          return isSettled(tx) ? (Number(tx.totalAmount) || 0) : 0;
        }
        return Number(tx.totalAmount) || 0;
      };
      rc.rows = allTx.map(tx => {
        const isMoneyIn = ['Sale', 'Received', 'CashIn'].includes(tx._type);
        const invoiceTotal = Number(tx.totalAmount) || 0;
        const moved = cashMoved(tx);
        const isCreditInvoice = (tx._type === 'Sale' || tx._type === 'Purchase') && !isSettled(tx);
        return {
          ...tx,
          type: dbTypeLabels[tx._type] || tx._type,
          partyName: tx.partyName || parties.find(p => p.id === tx.partyId)?.name || (tx._type === 'Expense' ? (tx.category || 'Expense') : '—'),
          invoiceNumber: tx.invoiceNumber || tx.referenceNo || '—',
          // A credit sale/purchase's stored paymentMode is stale leftover
          // form state, not how it was actually settled (see Sales.jsx's
          // own TxDataTable/grid-view treatment of status:'unpaid') — show
          // "Credit" instead of trusting it.
          mode: isCreditInvoice ? 'Credit' : (tx.paymentMode || tx.mode || '—'),
          timeStr: formatCreatedTime(tx) || '—',
          total: fmt(invoiceTotal),
          moneyIn: moved > 0 && isMoneyIn ? fmt(moved) : '—',
          moneyOut: moved > 0 && !isMoneyIn ? fmt(moved) : '—',
          _dbKind: tx._type,
          _dbCredit: isCreditInvoice,
        };
      });
      const totalMoneyIn = allTx.filter(t => ['Sale', 'Received', 'CashIn'].includes(t._type)).reduce((s, t) => s + cashMoved(t), 0);
      const totalMoneyOut = allTx.filter(t => ['Purchase', 'Paid', 'Expense', 'CashOut'].includes(t._type)).reduce((s, t) => s + cashMoved(t), 0);
      rc.totals = { moneyIn: totalMoneyIn, moneyOut: totalMoneyOut };
      rc.dayBookSummary = { totalMoneyIn, totalMoneyOut, net: totalMoneyIn - totalMoneyOut };

    } else if (reportType === 'top-customers') {
      rc.title = 'Top Customers by Revenue';
      rc.columns = [
        { key: 'rank', header: '#', align: 'center' },
        { key: 'partyName', header: 'Customer' },
        { key: 'phone', header: 'Phone' },
        { key: 'orders', header: 'Orders', align: 'right', isTotal: true },
        { key: 'totalAmount', header: 'Revenue', align: 'right', isTotal: true },
        { key: 'avgOrder', header: 'Avg Order', align: 'right' },
      ];
      const custStats = {};
      sales.filter(s => inRange(s.date)).forEach(s => {
        const p = parties.find(x => x.id === s.partyId);
        const name = p?.name || s.partyName || 'Walk-in';
        const k = s.partyId || name;
        if (!custStats[k]) custStats[k] = { partyName: name, phone: p?.phone || '—', orders: 0, totalAmount: 0 };
        custStats[k].orders += 1;
        custStats[k].totalAmount += s.totalAmount || 0;
      });
      rc.rows = Object.values(custStats).sort((a, b) => b.totalAmount - a.totalAmount).slice(0, 50).map((s, i) => ({
        ...s,
        rank: i + 1,
        avgOrder: fmt(s.orders ? s.totalAmount / s.orders : 0),
        totalAmount: fmt(s.totalAmount),
      }));
      rc.totals = {
        orders: Object.values(custStats).reduce((s, c) => s + c.orders, 0),
        totalAmount: Object.values(custStats).reduce((s, c) => s + c.totalAmount, 0),
      };

    } else if (reportType === 'top-items') {
      rc.title = 'Top Items — Times Bought';
      rc.columns = [
        { key: 'rank', header: '#', align: 'center' },
        { key: 'itemName', header: 'Item' },
        { key: 'orders', header: 'Times Bought', align: 'right', isTotal: true },
        { key: 'qty', header: 'Qty Sold', align: 'right', isTotal: true },
        { key: 'avgPrice', header: 'Avg Price', align: 'right' },
        { key: 'totalAmount', header: 'Revenue', align: 'right', isTotal: true },
      ];
      const itemStats = {};
      sales.filter(s => inRange(s.date)).forEach(s => {
        // Count each item at most once per invoice for "times bought" —
        // a customer buying qty 3 of an item in one bill is one purchase
        // occasion, not three.
        const seenInThisSale = new Set();
        (s.items || []).forEach(item => {
          const k = item.itemId || item.name;
          if (!itemStats[k]) itemStats[k] = { itemName: item.name, orders: 0, qty: 0, totalAmount: 0 };
          itemStats[k].qty += item.qty;
          if (!item.notBilled) itemStats[k].totalAmount += item.qty * item.price;
          if (!seenInThisSale.has(k)) {
            seenInThisSale.add(k);
            itemStats[k].orders += 1;
          }
        });
      });
      rc.rows = Object.values(itemStats).sort((a, b) => b.orders - a.orders || b.totalAmount - a.totalAmount).slice(0, 50).map((s, i) => ({
        ...s,
        rank: i + 1,
        avgPrice: fmt(s.qty ? s.totalAmount / s.qty : 0),
        totalAmount: fmt(s.totalAmount),
      }));
      rc.totals = {
        orders: Object.values(itemStats).reduce((s, i) => s + i.orders, 0),
        qty: Object.values(itemStats).reduce((s, i) => s + i.qty, 0),
        totalAmount: Object.values(itemStats).reduce((s, i) => s + i.totalAmount, 0),
      };

    } else if (reportType === 'staff-salary') {
      rc.title = 'Staff Salary Report';
      rc.columns = [
        { key: 'staffName', header: 'Staff Name' },
        { key: 'monthYear', header: 'Month/Year' },
        { key: 'baseSalary', header: 'Base Salary', align: 'right', isTotal: true },
        { key: 'netSalary', header: 'Net Salary', align: 'right', isTotal: true },
        { key: 'status', header: 'Status' },
        { key: 'paymentMode', header: 'Payment Mode' },
        { key: 'paidDate', header: 'Paid Date' },
      ];
      const salaryFiltered = staffSalary.filter(s => {
        const d = s.date || s.paidDate || '';
        return !d || inRange(d);
      });
      rc.rows = salaryFiltered.map(s => {
        const member = staffMembers.find(m => m.id === s.staffId || String(m.id) === String(s.staffId));
        return {
          ...s,
          staffName: member?.name || s.staffName || s.name || '—',
          monthYear: s.monthYear || s.month || '—',
          baseSalary: fmt(s.baseSalary || s.salary || 0),
          netSalary: fmt(s.netSalary || s.amount || s.baseSalary || s.salary || 0),
          status: s.status === 'paid' ? 'Paid' : 'Pending',
          paymentMode: s.paymentMode || '—',
          paidDate: s.paidDate || s.date || '—',
          _baseSalRaw: Number(s.baseSalary || s.salary || 0),
          _netSalRaw: Number(s.netSalary || s.amount || s.baseSalary || s.salary || 0),
          _color: s.status !== 'paid' ? '#b45309' : undefined,
        };
      });
      rc.totals = {
        baseSalary: rc.rows.reduce((s, r) => s + r._baseSalRaw, 0),
        netSalary: rc.rows.reduce((s, r) => s + r._netSalRaw, 0),
      };
      rc.rows = rc.rows.map(({ _baseSalRaw, _netSalRaw, ...rest }) => rest);

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
      const asOf = new Date();
      const totals = { current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0 };
      const aged = parties.filter(p => p.type === 'Customer' && (p.balance || 0) > 0).map(c => {
        const partySales = salesByPartyId.get(c.id);
        const lastSale = partySales ? partySales.reduce((a, b) => (!a || b.date > a.date) ? b : a, null) : null;
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
        return { id: c.id, partyId: c.id, partyName: c.name, current: fmt(current), days30: fmt(d30), days60: fmt(d60), days90: fmt(d90), over90: fmt(over90), total: fmt(outstanding), _outstandingRaw: outstanding };
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
      const asOf = new Date();
      const totals = { current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0 };
      const aged = parties.filter(p => p.type === 'Vendor').map(c => {
        const vendorPurchases = purchasesByPartyId.get(c.id) || [];
        const vPurchases = vendorPurchases.reduce((s, p) => s + (p.totalAmount || 0), 0);
        const vPaid = (paymentsOutByPartyId.get(c.id) || []).reduce((s, p) => s + (p.totalAmount || 0), 0);
        const outstanding = vPurchases - vPaid;
        if (outstanding <= 0) return null;
        const lastPurch = vendorPurchases.reduce((a, b) => (!a || b.date > a.date) ? b : a, null);
        const days = lastPurch ? Math.floor((asOf - new Date(lastPurch.date)) / 86400000) : 0;
        let current = 0, d30 = 0, d60 = 0, d90 = 0, over90 = 0;
        if (days <= 0) current = outstanding;
        else if (days <= 30) d30 = outstanding;
        else if (days <= 60) d60 = outstanding;
        else if (days <= 90) d90 = outstanding;
        else over90 = outstanding;
        totals.current += current; totals.days30 += d30; totals.days60 += d60;
        totals.days90 += d90; totals.over90 += over90; totals.total += outstanding;
        return { id: c.id, partyId: c.id, partyName: c.name, current: fmt(current), days30: fmt(d30), days60: fmt(d60), days90: fmt(d90), over90: fmt(over90), total: fmt(outstanding), _outstandingRaw: outstanding };
      }).filter(Boolean);
      rc.rows = aged;
      rc.totals = totals;

    } else if (reportType === 'net-balance') {
      rc.title = 'Net Balance — Customers';
      rc.columns = [
        { key: 'partyName', header: 'Customer' },
        { key: 'phone', header: 'Phone' },
        { key: 'lastBill', header: 'Last Bill' },
        { key: 'totalBalance', header: 'Outstanding', align: 'right', isTotal: true },
      ];
      // balanceOnly (default true) keeps the original "only outstanding
      // balances" behavior; off reveals every customer, including a
      // settled (0) or overpaid/credit (negative) balance, which were
      // previously always excluded with no way to see them here.
      const withBalance = parties.filter(p => p.type === 'Customer' && (balanceOnly ? (p.balance || 0) > 0 : true)).map(c => {
        const partySales = salesByPartyId.get(c.id);
        const lastSale = partySales ? partySales.reduce((a, b) => (!a || b.date > a.date) ? b : a, null) : null;
        return { partyName: c.name, phone: c.phone || '—', lastBill: lastSale?.date || '—', totalBalance: fmt(c.balance), _n: c.balance || 0 };
      }).sort((a, b) => b._n - a._n);
      rc.rows = withBalance.map(({ _n, ...r }) => r);
      rc.totals = { totalBalance: withBalance.reduce((s, r) => s + r._n, 0) };

    } else if (reportType === 'vendor-balance') {
      rc.title = 'Net Balance — Vendors';
      rc.columns = [
        { key: 'partyName', header: 'Vendor' },
        { key: 'phone', header: 'Phone' },
        { key: 'lastBill', header: 'Last Purchase' },
        { key: 'totalPurchases', header: 'Total Purchases', align: 'right', isTotal: true },
        { key: 'totalPaid', header: 'Total Paid', align: 'right', isTotal: true },
        { key: 'outstanding', header: 'Outstanding', align: 'right', isTotal: true },
      ];
      const vendorRows = parties.filter(p => p.type === 'Vendor').map(v => {
        const vPurchases = purchasesByPartyId.get(v.id) || [];
        const tp = vPurchases.reduce((s, p) => s + (p.totalAmount || 0), 0);
        const tPaid = (paymentsOutByPartyId.get(v.id) || []).reduce((s, p) => s + (p.totalAmount || 0), 0);
        const outstanding = tp - tPaid;
        if (balanceOnly && outstanding <= 0) return null;
        const lastPurch = vPurchases.reduce((a, b) => (!a || b.date > a.date) ? b : a, null);
        return { partyName: v.name, phone: v.phone || '—', lastBill: lastPurch?.date || '—', totalPurchases: fmt(tp), totalPaid: fmt(tPaid), outstanding: fmt(outstanding), _n: outstanding };
      }).filter(Boolean).sort((a, b) => b._n - a._n);
      rc.rows = vendorRows.map(({ _n, ...r }) => r);
      rc.totals = { outstanding: vendorRows.reduce((s, r) => s + r._n, 0) };
    }

    return rc;
  }, [reportType, filteredData, filters, sales, purchases, parties, payments, expenses, items, creditNotes, debitNotes, staffSalary, staffMembers, investors, cashEntries, stockSummaryData, itemsById, t, stockView, balanceOnly]); // eslint-disable-line

  // Report-specific KPI cards — each report shows metrics relevant to what it
  // actually displays, instead of one generic Sales/Purchase/Profit/GST row
  // repeated on every screen (Staff Salary, Top Items, Day Book, etc. previously
  // all showed the same irrelevant Sales KPIs).
  const reportKpis = useMemo(() => {
    const inRange = d => d >= filters.dateFrom && d <= filters.dateTo;
    const totals = reportConfig.totals || {};
    const rows = reportConfig.rows || [];

    switch (reportType) {
      case 'sales':
      case 'purchases': {
        const isSale = reportType === 'sales';
        const count = filteredData.length;
        const avg = count ? (totals.totalAmount || 0) / count : 0;
        return [
          { icon: isSale ? TrendingUp : ShoppingCart, label: isSale ? 'Total Sales' : 'Total Purchases', value: fmt(totals.totalAmount), subValue: `${count} invoice${count !== 1 ? 's' : ''}`, color: isSale ? '#5c1f22' : '#7c3aed' },
          { icon: IndianRupee, label: 'Tax Amount', value: fmt(totals.taxAmount), color: '#ea580c' },
          { icon: BarChart2, label: 'Avg Invoice Value', value: fmt(avg), color: '#2563eb' },
        ];
      }
      case 'items-sales':
      case 'items-purchase': {
        const totalQty = totals.qty || 0;
        // Rows are already sorted by value descending (see reportConfig builder above)
        const topItem = rows[0];
        return [
          { icon: Package, label: 'Total Value', value: fmt(totals.totalAmount), subValue: `${rows.length} item${rows.length !== 1 ? 's' : ''}`, color: '#5c1f22' },
          { icon: BarChart2, label: 'Units Moved', value: totalQty.toLocaleString('en-IN'), color: '#7c3aed' },
          { icon: Tag, label: 'Top Item', value: topItem?.itemName || '—', color: '#ea580c' },
        ];
      }
      case 'stock-summary': {
        const lowStockCount = stockSummaryData?.lowStockCount || 0;
        return [
          { icon: TrendingUp, label: 'Total Sold', value: totals.soldQty || 0, subValue: fmt(totals.soldAmount), color: '#7c3aed' },
          { icon: LayoutList, label: 'Opening Stock', value: stockSummaryData?.totals?.openingStock || 0, subValue: fmt(stockSummaryData?.totals?.openingValue), color: '#0891b2' },
          { icon: Package, label: 'In Stock', value: totals.stock || 0, subValue: stockView === 'category' ? `${rows.length} categories` : `${rows.length} products`, color: '#5c1f22' },
          { icon: IndianRupee, label: 'Stock Value', value: fmt(totals.stockValue), color: '#5c1f22' },
          { icon: AlertCircle, label: 'Low Stock Items', value: lowStockCount, color: lowStockCount > 0 ? '#dc2626' : '#5c1f22' },
        ];
      }
      case 'party-statement': {
        if (!filters.partyId) return [];
        const party = parties.find(p => p.id === filters.partyId);
        const closing = rows.length ? rows[rows.length - 1].balance : fmt(Math.abs(Number(party?.openingBalance || 0))) + (Number(party?.openingBalance || 0) >= 0 ? ' Cr' : ' Dr');
        return [
          { icon: ArrowUpRight, label: 'Total Debit', value: fmt(totals.debit), color: '#dc2626' },
          { icon: ArrowDownRight, label: 'Total Credit', value: fmt(totals.credit), color: '#5c1f22' },
          { icon: Wallet, label: 'Closing Balance', value: closing, color: '#5c1f22' },
        ];
      }
      case 'credit-debit-notes': {
        const creditCount = rows.filter(r => r.noteType === 'Credit Note').length;
        const debitCount = rows.filter(r => r.noteType === 'Debit Note').length;
        return [
          { icon: FileText, label: 'Total Value', value: fmt(totals.amount), subValue: `${rows.length} note${rows.length !== 1 ? 's' : ''}`, color: '#5c1f22' },
          { icon: TrendingDown, label: 'Credit Notes', value: creditCount, color: '#5c1f22' },
          { icon: TrendingUp, label: 'Debit Notes', value: debitCount, color: '#dc2626' },
        ];
      }
      case 'gst': {
        return [
          { icon: IndianRupee, label: 'Taxable Value', value: fmt(totals.taxableValue), color: '#5c1f22' },
          { icon: FileText, label: 'Total GST', value: fmt(totals.taxAmount), color: '#ea580c' },
          { icon: BarChart2, label: 'CGST + SGST', value: fmt((totals.cgst || 0) + (totals.sgst || 0)), color: '#7c3aed' },
        ];
      }
      case 'profit-loss': {
        return [
          { icon: TrendingUp, label: 'Revenue', value: fmt(kpis.totalSales), color: '#5c1f22' },
          { icon: ShoppingCart, label: 'Cost of Purchases', value: fmt(kpis.totalPurchases), color: '#7c3aed' },
          { icon: kpis.grossProfit >= 0 ? TrendingUp : TrendingDown, label: kpis.grossProfit >= 0 ? 'Net Profit' : 'Net Loss', value: fmt(Math.abs(kpis.grossProfit)), color: kpis.grossProfit >= 0 ? '#5c1f22' : '#dc2626' },
        ];
      }
      case 'investor-pl': {
        return [
          { icon: kpis.grossProfit >= 0 ? TrendingUp : TrendingDown, label: kpis.grossProfit >= 0 ? 'Net Profit' : 'Net Loss', value: fmt(Math.abs(kpis.grossProfit)), color: kpis.grossProfit >= 0 ? '#5c1f22' : '#dc2626' },
          { icon: UserCheck, label: 'Active Investors', value: investors.length, color: '#7c3aed' },
        ];
      }
      case 'bill-profit': {
        const profit = totals.profit || 0;
        const margin = totals.revenue ? (profit / totals.revenue) * 100 : 0;
        return [
          { icon: TrendingUp, label: 'Total Revenue', value: fmt(totals.revenue), subValue: `${rows.length} invoice${rows.length !== 1 ? 's' : ''}`, color: '#5c1f22' },
          { icon: ShoppingCart, label: 'Total Cost (COGS)', value: fmt(totals.cost), color: '#7c3aed' },
          { icon: profit >= 0 ? TrendingUp : TrendingDown, label: profit >= 0 ? 'Net Profit' : 'Net Loss', value: fmt(Math.abs(profit)), subValue: `${margin.toFixed(1)}% margin`, color: profit >= 0 ? '#5c1f22' : '#dc2626' },
        ];
      }
      case 'party-profit': {
        const profit = totals.profit || 0;
        const top = rows[0];
        return [
          { icon: Users, label: 'Total Revenue', value: fmt(totals.revenue), subValue: `${rows.length} customer${rows.length !== 1 ? 's' : ''}`, color: '#5c1f22' },
          { icon: profit >= 0 ? TrendingUp : TrendingDown, label: profit >= 0 ? 'Net Profit' : 'Net Loss', value: fmt(Math.abs(profit)), color: profit >= 0 ? '#5c1f22' : '#dc2626' },
          { icon: UserCheck, label: 'Most Profitable', value: top?.partyName || '—', color: '#ea580c' },
        ];
      }
      case 'item-profit': {
        const profit = totals.profit || 0;
        const top = rows[0];
        return [
          { icon: Package, label: 'Total Revenue', value: fmt(totals.revenue), subValue: `${rows.length} item${rows.length !== 1 ? 's' : ''}`, color: '#5c1f22' },
          { icon: profit >= 0 ? TrendingUp : TrendingDown, label: profit >= 0 ? 'Net Profit' : 'Net Loss', value: fmt(Math.abs(profit)), color: profit >= 0 ? '#5c1f22' : '#dc2626' },
          { icon: Tag, label: 'Most Profitable', value: top?.itemName || '—', color: '#ea580c' },
        ];
      }
      case 'party-group': {
        const top = rows[0];
        return [
          { icon: Users, label: 'Groups', value: rows.length, subValue: `${totals.partyCount || 0} parties`, color: '#5c1f22' },
          { icon: TrendingUp, label: 'Total Sales', value: fmt(totals.salesAmount), subValue: `${totals.salesCount || 0} bills`, color: '#5c1f22' },
          { icon: ShoppingCart, label: 'Total Purchases', value: fmt(totals.purchaseAmount), subValue: `${totals.purchaseCount || 0} bills`, color: '#7c3aed' },
          { icon: UserCheck, label: 'Top Group', value: top?.groupName || '—', color: '#ea580c' },
        ];
      }
      case 'cash-flow': {
        const net = (totals.inflow || 0) - (totals.outflow || 0);
        return [
          { icon: ArrowDownRight, label: 'Total Inflow', value: fmt(totals.inflow), color: '#5c1f22' },
          { icon: ArrowUpRight, label: 'Total Outflow', value: fmt(totals.outflow), color: '#dc2626' },
          { icon: Wallet, label: 'Net Cash Flow', value: fmt(Math.abs(net)), subValue: net >= 0 ? 'Positive' : 'Negative', color: net >= 0 ? '#5c1f22' : '#dc2626' },
        ];
      }
      case 'expenses': {
        const count = expenses.filter(e => inRange(e.date) && (!filters.partyId || e.partyId === filters.partyId)).length;
        const avg = count ? (totals.amount || 0) / count : 0;
        return [
          { icon: CreditCard, label: 'Total Expenses', value: fmt(totals.amount), subValue: `${count} entr${count !== 1 ? 'ies' : 'y'}`, color: '#dc2626' },
          { icon: BarChart2, label: 'Avg per Entry', value: fmt(avg), color: '#ea580c' },
        ];
      }
      case 'expense-category': {
        const topCat = rows[0];
        return [
          { icon: CreditCard, label: 'Total Expenses', value: fmt(totals.totalAmount), subValue: `${totals.count || 0} entries`, color: '#dc2626' },
          { icon: PieChart, label: 'Top Category', value: topCat?.category || '—', subValue: topCat?.totalAmount, color: '#ea580c' },
        ];
      }
      case 'payment-mode': {
        return [
          { icon: TrendingUp, label: 'Sales Received', value: fmt(totals.salesAmount), subValue: `${totals.salesCount || 0} txns`, color: '#5c1f22' },
          { icon: CreditCard, label: 'Expenses Paid', value: fmt(totals.expenseAmount), subValue: `${totals.expenseCount || 0} txns`, color: '#dc2626' },
        ];
      }
      case 'payments': {
        const inCount = payments.filter(p => inRange(p.date) && (!filters.partyId || p.partyId === filters.partyId) && (p.type === 'PaymentIn' || p.mode === 'payment-in')).length;
        const outCount = payments.filter(p => inRange(p.date) && (!filters.partyId || p.partyId === filters.partyId) && !(p.type === 'PaymentIn' || p.mode === 'payment-in')).length;
        return [
          { icon: ArrowDownRight, label: 'Total Payments', value: fmt(totals.totalAmount), subValue: `${rows.length} record${rows.length !== 1 ? 's' : ''}`, color: '#5c1f22' },
          { icon: TrendingUp, label: 'Payment In', value: inCount, color: '#5c1f22' },
          { icon: TrendingDown, label: 'Payment Out', value: outCount, color: '#dc2626' },
        ];
      }
      case 'day-book': {
        const net = (totals.moneyIn || 0) - (totals.moneyOut || 0);
        return [
          { icon: ArrowDownRight, label: 'Total Money-In', value: fmt(totals.moneyIn), color: '#5c1f22' },
          { icon: ArrowUpRight, label: 'Total Money-Out', value: fmt(totals.moneyOut), color: '#dc2626' },
          { icon: BarChart2, label: 'Money In − Money Out', value: `${net < 0 ? '-' : ''}${fmt(Math.abs(net))}`, color: net < 0 ? '#dc2626' : '#5c1f22' },
        ];
      }
      case 'top-customers': {
        const top = rows[0];
        return [
          { icon: Users, label: 'Total Revenue', value: fmt(totals.totalAmount), subValue: `${rows.length} customers`, color: '#5c1f22' },
          { icon: TrendingUp, label: 'Top Customer', value: top?.partyName || '—', subValue: top?.totalAmount, color: '#ea580c' },
        ];
      }
      case 'top-items': {
        const top = rows[0];
        return [
          { icon: Tag, label: 'Total Revenue', value: fmt(totals.totalAmount), subValue: `${rows.length} items`, color: '#5c1f22' },
          { icon: Package, label: 'Units Sold', value: (totals.qty || 0).toLocaleString('en-IN'), color: '#7c3aed' },
          { icon: TrendingUp, label: 'Most Bought', value: top?.itemName || '—', subValue: top ? `${top.orders} time${top.orders !== 1 ? 's' : ''}` : undefined, color: '#ea580c' },
        ];
      }
      case 'staff-salary': {
        const paidCount = rows.filter(r => r.status === 'Paid').length;
        const pendingCount = rows.length - paidCount;
        return [
          { icon: UserCheck, label: 'Total Payroll', value: fmt(totals.netSalary), subValue: `${rows.length} record${rows.length !== 1 ? 's' : ''}`, color: '#5c1f22' },
          { icon: TrendingUp, label: 'Paid', value: paidCount, color: '#5c1f22' },
          { icon: AlertCircle, label: 'Pending', value: pendingCount, color: pendingCount > 0 ? '#dc2626' : '#5c1f22' },
        ];
      }
      case 'aged-receivables':
      case 'aged-payables': {
        const isRec = reportType === 'aged-receivables';
        return [
          { icon: isRec ? ArrowUpRight : ArrowDownRight, label: 'Total Outstanding', value: fmt(totals.total), subValue: `${rows.length} ${isRec ? 'customers' : 'vendors'}`, color: isRec ? '#dc2626' : '#ea580c' },
          { icon: AlertCircle, label: 'Over 90 Days', value: fmt(totals.over90), color: '#dc2626' },
        ];
      }
      case 'net-balance': {
        return [
          { icon: Users, label: 'Total To Collect', value: fmt(totals.totalBalance), subValue: `${rows.length} customers`, color: '#dc2626' },
        ];
      }
      case 'vendor-balance': {
        return [
          { icon: Wallet, label: 'Total To Pay', value: fmt(totals.outstanding), subValue: `${rows.length} vendors`, color: '#ea580c' },
        ];
      }
      default:
        return [];
    }
  }, [reportType, reportConfig, filteredData, filters, expenses, payments, parties, items, kpis, stockSummaryData, investors, stockView]);

  // Search-filtered rows for display
  const displayRows = useMemo(() => {
    if (!searchText.trim()) return reportConfig.rows;
    const q = searchText.toLowerCase();
    return reportConfig.rows.filter(row =>
      reportConfig.columns.some(col => String(row[col.key] ?? '').toLowerCase().includes(q))
    );
  }, [reportConfig.rows, reportConfig.columns, searchText]);

  // Large reports (e.g. Stock Summary with thousands of items) are paginated
  // so only one page of rows is rendered at a time. Small reports render in
  // full as before. Totals, print and Excel export still use every row.
  const PAGINATE_ABOVE = 100;
  const [reportPage, setReportPage] = useState(0);
  const [reportRowsPerPage, setReportRowsPerPage] = useState(50);
  const paginated = displayRows.length > PAGINATE_ABOVE;
  useEffect(() => { setReportPage(0); }, [reportType, searchText, stockView, reportConfig.rows]);
  const pageRows = useMemo(() => {
    if (!paginated) return displayRows;
    const start = reportPage * reportRowsPerPage;
    return displayRows.slice(start, start + reportRowsPerPage);
  }, [displayRows, paginated, reportPage, reportRowsPerPage]);
  const reportTableRef = useTableScrollReset(reportPage, reportRowsPerPage);
  const reportPager = paginated ? (
    <TablePagination
      component="div"
      count={displayRows.length}
      page={Math.min(reportPage, Math.max(0, Math.ceil(displayRows.length / reportRowsPerPage) - 1))}
      onPageChange={(_, p) => setReportPage(p)}
      rowsPerPage={reportRowsPerPage}
      onRowsPerPageChange={(e) => { setReportRowsPerPage(parseInt(e.target.value, 10)); setReportPage(0); }}
      rowsPerPageOptions={[25, 50, 100, 200]}
      labelRowsPerPage="Rows per page"
      sx={{ borderTop: '1px solid', borderColor: 'divider', '& .MuiTablePagination-toolbar': { minHeight: 44 } }}
    />
  ) : null;

  // GST preview data (first 20 rows)
  const gstPreviewData = useMemo(() => {
    if (!isGstReturn) return null;
    const builders = {
      gstr1: () => buildGSTR1(sales, parties, gstMonth, gstYear),
      gstr1a: () => buildGSTR1A(sales, parties, gstMonth, gstYear),
      gstr2b: () => buildGSTR2B(purchases, parties, gstMonth, gstYear),
      gstr3b: () => buildGSTR3B(sales, purchases, expenses, gstMonth, gstYear),
      cmp08: () => buildCMP08(sales, gstQuarter, gstYear),
    };
    const rows = builders[reportType]?.() || [];
    if (rows.length < 2) return null;
    // Parse CSV rows into aoa
    const aoa = csvRowsToAoa(rows.slice(0, 21));
    return aoa;
  }, [isGstReturn, reportType, sales, purchases, expenses, parties, gstMonth, gstYear, gstQuarter]);

  const REPORT_PAGE_SIZE_CSS = {
    Executive: '184mm 267mm',
    Statement: '140mm 216mm',
  };
  const handlePrint = useReactToPrint({
    contentRef: reportRef,
    pageStyle: `@page { size: ${REPORT_PAGE_SIZE_CSS[paperSize] || paperSize} portrait; margin: 10mm; } @media print { body { -webkit-print-color-adjust: exact; } }`,
  });
  // onBeforePrint is awaited by react-to-print before it snapshots the DOM —
  // waiting on the payment QR canvas here closes an async draw-vs-print race
  // (see qrReady.js) that could otherwise print the QR blank on a cold first print.
  const handleBillPrint = useReactToPrint({ contentRef: billPrintRef, onBeforePrint: waitForQrReady });
  const [billPrintTrigger, setBillPrintTrigger] = useState(0);
  useEffect(() => {
    if (!billPrintTrigger) return;
    handleBillPrint();
  }, [billPrintTrigger]); // eslint-disable-line

  const triggerBillPrint = (tx) => {
    setPrintingBill(tx);
    setTimeout(() => setBillPrintTrigger(n => n + 1), 80);
  };

  const handlePaymentPrint = useReactToPrint({ contentRef: paymentPrintRef });
  const [paymentPrintTrigger, setPaymentPrintTrigger] = useState(0);
  useEffect(() => {
    if (!paymentPrintTrigger) return;
    handlePaymentPrint();
  }, [paymentPrintTrigger]); // eslint-disable-line
  const triggerPaymentPrint = (row) => {
    setPrintingPayment(row);
    setTimeout(() => setPaymentPrintTrigger(n => n + 1), 80);
  };

  const handleExpensePrint = useReactToPrint({ contentRef: expensePrintRef });
  const [expensePrintTrigger, setExpensePrintTrigger] = useState(0);
  useEffect(() => {
    if (!expensePrintTrigger) return;
    handleExpensePrint();
  }, [expensePrintTrigger]); // eslint-disable-line
  const triggerExpensePrint = (row) => {
    setPrintingExpense(row);
    setTimeout(() => setExpensePrintTrigger(n => n + 1), 80);
  };

  // Same navigator.share → wa.me fallback pattern already used by
  // PaymentEntry.jsx/Expenses.jsx's own row-level share buttons and by this
  // file's own handleSendAgedReminder — Day Book just needed its own copies
  // since neither of those are exported/reusable.
  const handleSharePaymentRow = (row) => {
    const isSplit = row.paymentMode === 'Split' && row.paymentSplit;
    const modeText = isSplit
      ? `Mode: Split Payment\n  Cash: ₹${(Number(row.paymentSplit.cash) || 0).toLocaleString()}\n  Bank: ₹${(Number(row.paymentSplit.bank) || 0).toLocaleString()}`
      : `Mode: ${row.mode}`;
    const text = `*Payment Receipt from ${currentBusiness?.name || 'BillDheko'}*\n\n` +
      `Amount: ₹${(Number(row.totalAmount) || 0).toLocaleString()}\n` +
      `Date: ${row.date}\n` +
      `Party: ${row.partyName}\n` +
      `${modeText}\n` +
      `Ref: ${row.referenceNo || row.invoiceNumber || ''}\n\n` +
      `Shared via BillDheko`;
    if (navigator.share) {
      navigator.share({ title: `Payment Receipt`, text }).catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    }
  };

  const handleShareExpenseRow = (row) => {
    const text = `*Expense Voucher from ${currentBusiness?.name || 'BillDheko'}*\n\n` +
      `Amount: ₹${(Number(row.totalAmount) || 0).toLocaleString()}\n` +
      `Date: ${row.date}\n` +
      `Category: ${row.category || row.partyName}\n` +
      `Description: ${row.description || ''}\n\n` +
      `Shared via BillDheko`;
    if (navigator.share) {
      navigator.share({ title: `Expense Voucher`, text }).catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    }
  };

  // Keep the open preview in sync with live data, same reasoning as
  // Dashboard.jsx's equivalent effect — InvoicePreviewDialog can record a
  // payment / mark paid / delete directly, so a frozen snapshot would let
  // the Received Payment button linger after the invoice was just settled.
  // Triggers the same react-hooks/set-state-in-effect warning already
  // present ~25x elsewhere in this codebase for this "sync with external
  // data" pattern; not fought further here for consistency.
  useEffect(() => {
    if (!previewTx) return;
    const src = previewIsSale ? sales : purchases;
    const live = src.find(t => t.id === previewTx.id);
    if (!live) setPreviewOpen(false);
    else if (live !== previewTx) setPreviewTx(live);
  }, [sales, purchases, previewTx, previewIsSale]);

  // Item-wise / Party-wise P&L drill-down popup content — computed on demand
  // (not memoized on every render since it only runs while a dialog is
  // actually open) from the same tables/helpers the P&L reports themselves
  // already use (unitCostOf, itemsById/partiesById), all-time (not scoped to
  // the report's own date filter — the popup is meant as a full history/
  // stock snapshot for that item/party, independent of whatever range is
  // currently selected in the report itself).
  const buildItemDetail = (itemId) => {
    const master = itemsById.get(itemId);
    let qtySold = 0, saleRevenue = 0, saleCost = 0;
    let qtyPurchased = 0, purchaseValue = 0;
    const recentSales = [];
    const recentPurchases = [];
    sales.forEach(tx => {
      (tx.items || []).forEach(li => {
        if (li.itemId !== itemId || li.notBilled) return;
        const qty = Number(li.qty) || 0;
        const revenue = qty * (Number(li.price) || 0) * (1 - (Number(li.discountPercent) || 0) / 100);
        qtySold += qty;
        saleRevenue += revenue;
        if (master && Array.isArray(master.recipe) && master.recipe.length > 0) {
          master.recipe.forEach(r => {
            const override = li.recipeOverrides?.[r.itemId];
            const compQty = override != null ? Number(override) : (Number(r.qtyPerUnit) || 0) * qty;
            saleCost += unitCostOf(itemsById.get(r.itemId)) * compQty;
          });
        } else {
          saleCost += unitCostOf(master, li) * qty;
        }
        recentSales.push({ id: tx.id, date: tx.date, invoiceNumber: tx.invoiceNumber, partyName: partiesById.get(tx.partyId)?.name || tx.partyName || 'Cash & Carry', qty, amount: revenue });
      });
    });
    purchases.forEach(tx => {
      (tx.items || []).forEach(li => {
        if (li.itemId !== itemId) return;
        const qty = Number(li.qty) || 0;
        const amount = qty * (Number(li.price) || 0) * (1 - (Number(li.discountPercent) || 0) / 100);
        qtyPurchased += qty;
        purchaseValue += amount;
        recentPurchases.push({ id: tx.id, date: tx.date, invoiceNumber: tx.invoiceNumber, partyName: partiesById.get(tx.partyId)?.name || tx.partyName || 'Cash & Carry', qty, amount });
      });
    });
    recentSales.sort((a, b) => b.date.localeCompare(a.date));
    recentPurchases.sort((a, b) => b.date.localeCompare(a.date));
    const profit = saleRevenue - saleCost;
    const stock = Number(master?.stock || 0);
    const purchPrice = Number(master?.purchasePrice || 0);
    return {
      kind: 'item',
      title: master?.name || 'Unknown Item',
      subtitle: master?.category || '—',
      stats: [
        { label: 'Qty Sold', value: qtySold.toLocaleString('en-IN') },
        { label: 'Sale Revenue', value: fmt(saleRevenue) },
        { label: 'Qty Purchased', value: qtyPurchased.toLocaleString('en-IN') },
        { label: 'Purchase Value', value: fmt(purchaseValue) },
        { label: 'Current Stock', value: stock.toLocaleString('en-IN') + (master?.unit ? ` ${master.unit}` : '') },
        { label: 'Stock Value', value: fmt(stock * purchPrice) },
        { label: 'Profit (COGS basis)', value: fmt(profit), color: profit >= 0 ? '#5c1f22' : '#dc2626' },
        { label: 'Margin', value: saleRevenue ? `${((profit / saleRevenue) * 100).toFixed(1)}%` : '—' },
      ],
      recentSales: recentSales.slice(0, 8),
      recentPurchases: recentPurchases.slice(0, 8),
    };
  };

  const buildPartyDetail = (partyId) => {
    const party = partiesById.get(partyId);
    const pSales = (salesByPartyId.get(partyId) || []).slice().sort((a, b) => b.date.localeCompare(a.date));
    const pPurchases = (purchasesByPartyId.get(partyId) || []).slice().sort((a, b) => b.date.localeCompare(a.date));
    let totalRevenue = 0, totalCost = 0;
    pSales.forEach(tx => {
      totalRevenue += Number(tx.totalAmount || 0);
      (tx.items || []).forEach(li => {
        const master = (li.itemId && itemsById.get(li.itemId)) || null;
        const qty = Number(li.qty) || 0;
        if (master && Array.isArray(master.recipe) && master.recipe.length > 0) {
          master.recipe.forEach(r => {
            const override = li.recipeOverrides?.[r.itemId];
            const compQty = override != null ? Number(override) : (Number(r.qtyPerUnit) || 0) * qty;
            totalCost += unitCostOf(itemsById.get(r.itemId)) * compQty;
          });
        } else {
          totalCost += unitCostOf(master, li) * qty;
        }
      });
    });
    const totalPurchaseValue = pPurchases.reduce((s, tx) => s + Number(tx.totalAmount || 0), 0);
    const profit = totalRevenue - totalCost;
    const balance = Number(party?.balance || 0);
    return {
      kind: 'party',
      title: party?.name || 'Cash & Carry',
      subtitle: party?.type || '',
      stats: [
        { label: 'Total Sales', value: fmt(totalRevenue), sub: `${pSales.length} invoice${pSales.length !== 1 ? 's' : ''}` },
        { label: 'Total Purchases', value: fmt(totalPurchaseValue), sub: `${pPurchases.length} bill${pPurchases.length !== 1 ? 's' : ''}` },
        { label: 'Profit (from sales)', value: fmt(profit), color: profit >= 0 ? '#5c1f22' : '#dc2626' },
        { label: 'Current Balance', value: `₹${Math.abs(balance).toLocaleString('en-IN')}`, sub: balance === 0 ? 'Settled' : (balance > 0 ? 'To Collect' : 'To Pay'), color: balance > 0 ? '#dc2626' : (balance < 0 ? '#b45309' : undefined) },
      ],
      recentSales: pSales.slice(0, 8).map(tx => ({ id: tx.id, date: tx.date, invoiceNumber: tx.invoiceNumber, amount: Number(tx.totalAmount || 0) })),
      recentPurchases: pPurchases.slice(0, 8).map(tx => ({ id: tx.id, date: tx.date, invoiceNumber: tx.invoiceNumber, amount: Number(tx.totalAmount || 0) })),
    };
  };

  // Group drill-down — every party whose own `group` field matches (or, for
  // the special "__ungrouped__" key, every party with no group set at all)
  // pooled together: combined stats plus a merged, most-recent-first list of
  // every sale/purchase bill across all of them. All-time (not scoped to the
  // report's own date-range filter), matching buildPartyDetail's convention
  // of a detail popup being a full account snapshot, not a filtered slice.
  const buildGroupDetail = (groupKey) => {
    const groupParties = parties.filter(p => {
      const g = (p.group || '').trim();
      return groupKey === '__ungrouped__' ? !g : g === groupKey;
    });
    const partyIdSet = new Set(groupParties.map(p => p.id));
    let gSales = [], gPurchases = [];
    groupParties.forEach(p => {
      gSales = gSales.concat(salesByPartyId.get(p.id) || []);
      gPurchases = gPurchases.concat(purchasesByPartyId.get(p.id) || []);
    });
    gSales.sort((a, b) => b.date.localeCompare(a.date));
    gPurchases.sort((a, b) => b.date.localeCompare(a.date));
    const totalRevenue = gSales.reduce((s, tx) => s + Number(tx.totalAmount || 0), 0);
    const totalPurchaseValue = gPurchases.reduce((s, tx) => s + Number(tx.totalAmount || 0), 0);
    const totalBalance = groupParties.reduce((s, p) => s + (Number(p.balance) || 0), 0);
    return {
      kind: 'group',
      title: groupKey === '__ungrouped__' ? 'Ungrouped' : groupKey,
      subtitle: `${groupParties.length} part${groupParties.length !== 1 ? 'ies' : 'y'} in this group`,
      stats: [
        { label: 'Total Sales', value: fmt(totalRevenue), sub: `${gSales.length} invoice${gSales.length !== 1 ? 's' : ''}` },
        { label: 'Total Purchases', value: fmt(totalPurchaseValue), sub: `${gPurchases.length} bill${gPurchases.length !== 1 ? 's' : ''}` },
        { label: 'Parties in Group', value: String(groupParties.length), sub: `${partyIdSet.size} unique` },
        { label: 'Net Balance', value: `₹${Math.abs(totalBalance).toLocaleString('en-IN')}`, sub: totalBalance === 0 ? 'Settled' : (totalBalance > 0 ? 'To Collect' : 'To Pay'), color: totalBalance > 0 ? '#dc2626' : (totalBalance < 0 ? '#b45309' : undefined) },
      ],
      // Every bill, not capped to 8 like the single-party detail — a group
      // spans several parties, so "what are all the sale/purchase bills
      // from this group" (the actual ask) needs the full list, not a
      // recent-few sample. Each still carries partyName so it's clear
      // which member of the group the bill belongs to.
      recentSales: gSales.map(tx => ({ id: tx.id, date: tx.date, invoiceNumber: tx.invoiceNumber, partyId: tx.partyId || null, partyName: partiesById.get(tx.partyId)?.name || tx.partyName || '—', amount: Number(tx.totalAmount || 0) })),
      recentPurchases: gPurchases.map(tx => ({ id: tx.id, date: tx.date, invoiceNumber: tx.invoiceNumber, partyId: tx.partyId || null, partyName: partiesById.get(tx.partyId)?.name || tx.partyName || '—', amount: Number(tx.totalAmount || 0) })),
    };
  };

  const detailContent = detailDialog
    ? (detailDialog.kind === 'item' ? buildItemDetail(detailDialog.id)
      : detailDialog.kind === 'group' ? buildGroupDetail(detailDialog.id)
      : buildPartyDetail(detailDialog.id))
    : null;

  // Resolves which table (sales/purchases) a report row's underlying
  // transaction lives in — differs per report shape (Day Book/Party
  // Statement mix both types in one table; Bill/Party P&L are sales-only).
  const resolveRowTxTable = (row) => {
    if (row._txType) return row._txType;
    if (reportType === 'purchases') return 'purchases';
    if (reportType === 'day-book') {
      if (row.type === 'Purchase') return 'purchases';
      if (row.type === 'Sale') return 'sales';
      return null;
    }
    if (['sales', 'bill-profit'].includes(reportType)) return 'sales';
    return null;
  };

  const canOpenBill = (row) => !!resolveRowTxTable(row) && !!row.id;

  // Item-wise/Party-wise P&L rows open the drill-down popup (sale/purchase/
  // stock detail) instead of a single invoice preview — a P&L row IS an
  // aggregate across many invoices, there's no single bill to show.
  const canOpenDetail = (row) =>
    (reportType === 'item-profit' && !!row._itemId) ||
    (reportType === 'party-profit' && !!row._partyId) ||
    (reportType === 'party-group' && !!row._groupKey);
  const openDetailDialog = (row) => {
    setDetailSalesPage(0);
    setDetailPurchasesPage(0);
    setDetailTab('sales');
    setDetailPartySearch('');
    setDetailDateFrom('');
    setDetailDateTo('');
    if (reportType === 'item-profit' && row._itemId) setDetailDialog({ kind: 'item', id: row._itemId });
    else if (reportType === 'party-profit' && row._partyId) setDetailDialog({ kind: 'party', id: row._partyId });
    else if (reportType === 'party-group' && row._groupKey) setDetailDialog({ kind: 'group', id: row._groupKey });
  };

  // Day Book's Print/Share column also covers Payment-In/Payment-Out/Expense
  // rows — these don't have a bill preview (InvoicePreviewDialog is
  // sales/purchases-only), just a direct Print/Share action.
  const resolveDayBookNonBillTable = (row) => {
    if (reportType !== 'day-book' || !row.id) return null;
    if (row.type === 'Payment-In' || row.type === 'Payment-Out') return 'payments';
    if (row.type === 'Expense') return 'expenses';
    return null;
  };
  const triggerDayBookRowPrint = (row) => {
    const table = resolveDayBookNonBillTable(row);
    if (table === 'payments') {
      const tx = payments.find(p => p.id === row.id);
      if (tx) triggerPaymentPrint({ ...tx, mode: row.mode, totalAmount: row.totalAmount });
    } else if (table === 'expenses') {
      const tx = expenses.find(e => e.id === row.id);
      if (tx) triggerExpensePrint(tx);
    }
  };
  const shareDayBookRow = (row) => {
    const table = resolveDayBookNonBillTable(row);
    if (table === 'payments') handleSharePaymentRow(row);
    else if (table === 'expenses') handleShareExpenseRow(row);
  };

  const openInvoicePreview = (row) => {
    const table = resolveRowTxTable(row);
    if (!table || !row.id) return;
    const src = table === 'sales' ? sales : purchases;
    const tx = src.find(t => t.id === row.id);
    if (!tx) return;
    setPreviewIsSale(table === 'sales');
    setPreviewTx(tx);
    setPreviewOpen(true);
  };

  // Same as openInvoicePreview, but for a spot (the detail popup's Recent
  // Sales/Purchases lists) that already knows the exact table — no need to
  // re-derive it from row shape via resolveRowTxTable.
  const openBillFromDetail = (id, table) => {
    if (!id) return;
    const src = table === 'sales' ? sales : purchases;
    const tx = src.find(t => t.id === id);
    if (!tx) return;
    setPreviewIsSale(table === 'sales');
    setPreviewTx(tx);
    setPreviewOpen(true);
  };

  const handleShare = () => {
    const text = `*${currentBusiness?.name || 'Business'} — ${reportConfig.title}*\n\nPeriod: ${filters.dateFrom} to ${filters.dateTo}\n\nShared via BillDheko`;
    if (navigator.share) {
      navigator.share({ title: reportConfig.title, text }).catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    }
  };

  // Per-customer payment reminder from the Aged Receivables report — targets
  // that specific party's phone number, distinct from handleShare above
  // (which shares the whole report, not a single customer's balance).
  const handleSendAgedReminder = (row) => {
    const party = partiesById.get(row.partyId);
    const phone = String(party?.phone || '').replace(/\D/g, '');
    const num = phone ? (phone.length === 10 ? `91${phone}` : phone) : '';
    const text = [
      `Hi ${row.partyName},`,
      '',
      `This is a reminder that you have an outstanding balance of *₹${Number(row._outstandingRaw || 0).toFixed(2)}* with ${currentBusiness?.name || 'us'}.`,
      '',
      `Kindly arrange payment at your earliest convenience. Please ignore this message if it has already been paid.`,
      '',
      `Thank you,`,
      currentBusiness?.name || 'BillDheko',
    ].join('\n');
    const url = num ? `https://wa.me/${num}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const handleExcelExport = () => {
    if (isGstReturn) return;
    const biz = (currentBusiness?.name || 'Business').replace(/[^a-z0-9]/gi, '_');
    const filename = `${reportConfig.title.replace(/[^a-z0-9]/gi,'_')}_${biz}_${filters.dateFrom}_${filters.dateTo}.xlsx`;
    const headers = reportConfig.columns.map(c => c.header);
    const dataRows = reportConfig.rows.map(row => reportConfig.columns.map(c => row[c.key] ?? ''));
    const totalRow = reportConfig.columns.map(c =>
      c.isTotal && reportConfig.totals[c.key] != null ? fmt(reportConfig.totals[c.key]) : (reportConfig.columns.indexOf(c) === 0 ? 'TOTAL' : '')
    );
    const aoa = [headers, ...dataRows];
    if (Object.keys(reportConfig.totals).length > 0) aoa.push(totalRow);
    downloadExcel(filename, reportConfig.title.slice(0, 31), aoa);
  };

  const handleGSTExport = (type, fmt2 = 'csv') => {
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
    if (fmt2 === 'xlsx') {
      downloadExcel(`${label}_${biz}_${suffix}.xlsx`, label, csvRowsToAoa(rows));
    } else {
      downloadCSV(`${label}_${biz}_${suffix}.csv`, rows);
    }
  };

  const activeGroup = REPORT_GROUPS.find(g => g.items.some(i => i.value === reportType));
  const activeColor = activeGroup?.color || '#5c1f22';
  // Any report whose rows can trace back to a single sale/purchase invoice
  // gets a "Bill" action column — sales/purchases show it always (every
  // row is one), the rest only for rows that actually resolve (e.g. Day
  // Book mixes invoices with expenses/payments, Party Statement mixes
  // invoices with payments/notes).
  const showBillCol = ['sales', 'purchases', 'bill-profit', 'day-book', 'party-statement', 'item-profit', 'party-profit', 'party-group'].includes(reportType);
  const activeReport = ALL_REPORT_TABS.find(r => r.value === reportType);
  const yearOptions = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 5; y--) yearOptions.push(y);

  // GST period summary counts
  const gstPeriodCounts = useMemo(() => {
    if (!isGstReturn) return null;
    const salesInPeriod = sales.filter(s => {
      const my = getMonthYear(s.date);
      if (reportType === 'cmp08') {
        const qMap = { Q1:[3,4,5], Q2:[6,7,8], Q3:[9,10,11], Q4:[0,1,2] };
        return my && qMap[gstQuarter]?.includes(my.month) && my.year === gstYear;
      }
      return my && my.month === gstMonth && my.year === gstYear;
    });
    const purchasesInPeriod = purchases.filter(p => {
      const my = getMonthYear(p.date);
      return my && my.month === gstMonth && my.year === gstYear;
    });
    return {
      salesCount: salesInPeriod.length,
      salesTotal: salesInPeriod.reduce((s, tx) => s + (tx.totalAmount || 0), 0),
      purchasesCount: purchasesInPeriod.length,
      purchasesTotal: purchasesInPeriod.reduce((s, tx) => s + (tx.totalAmount || 0), 0),
    };
  }, [isGstReturn, reportType, sales, purchases, gstMonth, gstYear, gstQuarter]);

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
            ...(['net-balance','vendor-balance','aged-receivables','aged-payables','stock-summary'].includes(reportType) && { periodLabel: 'All time' }),
          }}
          reportData={reportConfig}
          paperSize={paperSize}
        />
        <InvoiceTemplate
          ref={billPrintRef}
          transaction={printingBill}
          business={currentBusiness}
          paperSize={paperSize}
          printOptions={{ ...config.billPrintOptions, loyalty: config.loyalty }}
          partyBalance={printingBill ? (parties.find(p => p.id === printingBill.partyId)?.balance ?? 0) : undefined}
        />
        <PaymentTemplate ref={paymentPrintRef} data={printingPayment} business={currentBusiness} paperSize={paperSize} />
        <ExpenseTemplate ref={expensePrintRef} data={printingExpense} business={currentBusiness} paperSize={paperSize} />
      </Box>

      {/* ── Compact gradient header — plain static page title, matches every
          other page. ── */}
      <Box sx={{
        borderRadius: 2.5,
        background: '#ffffff', border: '1px solid #ece2db',
        px: { xs: 1.75, md: 2.25 }, py: { xs: 1.1, md: 1.35 }, mb: 1.75,
        display: 'flex', alignItems: 'center', gap: 1.25,
      }}>
        <Box sx={{ p: 0.75, borderRadius: 1.5, bgcolor: 'rgba(92,31,34,0.08)', display: 'flex', flexShrink: 0 }}>
          <BarChart2 size={16} color="#5c1f22" />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, color: '#5c1f22', fontSize: '0.95rem', lineHeight: 1.2 }} noWrap>
            Reports
          </Typography>
          <Typography sx={{ color: '#57433e', fontSize: '0.74rem' }} noWrap>
            {activeGroup?.label ? `${activeGroup.label} · ${activeReport?.label}` : 'Choose a report'}
          </Typography>
        </Box>
      </Box>

      {/* ── Main layout: persistent icon rail + content ──
          Chosen from a 3-mockup comparison (Option 1: persistent icon
          rail). On desktop, both live inside ONE bounded, internally-
          scrolling container instead of sharing the page's own document
          scroll — otherwise switching report type (e.g. a 500-row table →
          a 3-row one) shrinks the whole document's height and the browser
          clamps scrollY to the new, much shorter max, visually snapping
          the page to the top every time, with the rail (itself just
          position:sticky on the document) along for the ride. Mobile
          skips this (no rail to keep in view there — see below) and keeps
          the natural whole-page scroll it already had. */}
      <Box sx={{
        display: 'flex', gap: 1.5, alignItems: 'flex-start',
        ...(!isMobile && { height: 'calc(100vh - 190px)', minHeight: 420, overflowY: 'auto' }),
      }}>

        {/* ── LEFT RAIL — desktop only; mobile gets the category chip row
            inline above the content instead (a fixed icon rail doesn't fit
            a phone width, and a horizontal report picker reads better on
            a narrow screen than a vertical one squeezed into ~70px). ── */}
        {!isMobile && (
          <Box sx={{ width: reportRail.width, flexShrink: 0, position: 'sticky', top: 0, alignSelf: 'flex-start' }}>
            <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5, overflowX: 'hidden', overflowY: 'auto', maxHeight: 'calc(100vh - 190px)', p: 1 }}>
              <TextField
                fullWidth size="small" placeholder="Find a report…"
                value={navSearch} onChange={e => setNavSearch(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start"><Search size={13} color="#5f4f47" /></InputAdornment>
                  ),
                }}
                sx={{ mb: 1, '& .MuiOutlinedInput-root': { borderRadius: 1.5, fontSize: '0.75rem' } }}
              />
              {gridReports.length === 0 && (
                <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', textAlign: 'center', py: 1.5 }}>No matches</Typography>
              )}
              {navSearch ? (
                gridReports.map(r => {
                  const active = reportType === r.value;
                  const Icon = r.icon;
                  return (
                    <Tooltip key={r.value} title={r.label} placement="right" disableHoverListener={r.label.length <= 18}>
                      <Box onClick={() => selectReport(r.value)} sx={{
                        display: 'flex', alignItems: 'center', gap: 0.75,
                        px: 0.875, py: 0.625, borderRadius: 1.5, cursor: 'pointer', mb: 0.25,
                        bgcolor: active ? alpha(r.groupColor, 0.12) : 'transparent',
                        '&:hover': { bgcolor: active ? alpha(r.groupColor, 0.16) : alpha(r.groupColor, 0.06) },
                      }}>
                        {Icon && <Icon size={15} color={active ? r.groupColor : '#57433e'} style={{ flexShrink: 0 }} />}
                        <Typography sx={{ fontSize: '0.72rem', fontWeight: active ? 700 : 500, color: active ? r.groupColor : 'text.secondary', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.label}
                        </Typography>
                      </Box>
                    </Tooltip>
                  );
                })
              ) : (
                visibleReportGroups.map((group, gi) => (
                  <Box key={group.label}>
                    {gi > 0 && <Divider sx={{ my: 0.75 }} />}
                    <Typography sx={{ fontSize: '0.62rem', fontWeight: 800, color: group.color, textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.375, px: 0.875 }}>
                      {group.label}
                    </Typography>
                    {group.items.map(({ value, label, icon: Icon }) => {
                      const active = reportType === value;
                      return (
                        <Tooltip key={value} title={label} placement="right" disableHoverListener={label.length <= 18}>
                          <Box onClick={() => selectReport(value)} sx={{
                            display: 'flex', alignItems: 'center', gap: 0.75,
                            px: 0.875, py: 0.625, borderRadius: 1.5, cursor: 'pointer', mb: 0.25,
                            bgcolor: active ? alpha(group.color, 0.12) : 'transparent',
                            '&:hover': { bgcolor: active ? alpha(group.color, 0.16) : alpha(group.color, 0.06) },
                          }}>
                            {Icon && <Icon size={15} color={active ? group.color : '#57433e'} style={{ flexShrink: 0 }} />}
                            <Typography sx={{ fontSize: '0.72rem', fontWeight: active ? 700 : 500, color: active ? group.color : 'text.secondary', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {label}
                            </Typography>
                          </Box>
                        </Tooltip>
                      );
                    })}
                  </Box>
                ))
              )}
            </Card>
          </Box>
        )}
        {!isMobile && <ResizeHandle panel={reportRail} side="right" label="Resize report list" />}

        {/* ── RIGHT CONTENT ──
            `key={reportType}` + the fade-in keyframe below gives switching
            reports a soft transition instead of the content snapping in
            instantly — purely cosmetic, remounts nothing that holds state
            since none of this page's own state is scoped to reportType. */}
        <Box key={reportType} sx={{
          flex: 1, minWidth: 0,
          animation: 'reportFadeIn 0.18s ease-out',
          '@keyframes reportFadeIn': {
            from: { opacity: 0, transform: 'translateY(3px)' },
            to: { opacity: 1, transform: 'translateY(0)' },
          },
        }}>
          {/* Mobile: horizontal category chip row + report chip row
              (the rail's own layout doesn't fit a phone; a horizontal
              picker above the content is the natural mobile equivalent). */}
          {isMobile && (
            <Card elevation={0} sx={{ mb: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1 }}>
              <Box sx={{ display: 'flex', gap: 0.5, overflowX: 'auto', pb: 0.5, mb: 0.75 }}>
                <Chip
                  label="All" size="small" clickable onClick={() => setNavCategory('all')}
                  sx={{
                    fontWeight: 700, fontSize: '0.7rem', height: 26, flexShrink: 0,
                    bgcolor: navCategory === 'all' ? '#111' : 'transparent',
                    color: navCategory === 'all' ? '#fff' : 'text.secondary',
                    border: '1px solid', borderColor: navCategory === 'all' ? '#111' : 'divider',
                  }} />
                {visibleReportGroups.map(group => (
                  <Chip key={group.label}
                    label={group.label} size="small" clickable onClick={() => setNavCategory(group.label)}
                    sx={{
                      fontWeight: 700, fontSize: '0.7rem', height: 26, flexShrink: 0,
                      bgcolor: navCategory === group.label ? group.color : 'transparent',
                      color: navCategory === group.label ? '#fff' : 'text.secondary',
                      border: '1px solid', borderColor: navCategory === group.label ? group.color : 'divider',
                    }} />
                ))}
              </Box>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {gridReports.map(r => {
                  const active = reportType === r.value;
                  return (
                    <Chip
                      key={r.value} label={r.label} size="small" clickable
                      icon={r.icon ? <r.icon size={12} /> : undefined}
                      onClick={() => selectReport(r.value)}
                      sx={{
                        fontSize: '0.7rem', fontWeight: active ? 700 : 600, height: 25,
                        bgcolor: active ? alpha(r.groupColor, 0.14) : 'transparent',
                        color: active ? r.groupColor : 'text.secondary',
                        border: '1px solid', borderColor: active ? alpha(r.groupColor, 0.5) : 'divider',
                        '& .MuiChip-icon': { color: active ? r.groupColor : '#5f4f47' },
                      }} />
                  );
                })}
              </Box>
            </Card>
          )}

          {/* ── KPI cards — specific to the selected report ── */}
          {!isGstReturn && reportKpis.length > 0 && (
            <Grid container spacing={1} sx={{ mb: 1.5 }}>
              {reportKpis.map((k, idx) => (
                <Grid key={idx} size={{ xs: 6, sm: 12 / Math.max(reportKpis.length, 2) }}>
                  <KpiCard icon={k.icon} label={k.label} value={k.value} subValue={k.subValue} color={k.color} />
                </Grid>
              ))}
            </Grid>
          )}

          {/* ── Filter bar ── */}
          <Card elevation={0} sx={{ mb: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}>
            <Box sx={{ p: 1.25 }}>
              {isGstReturn ? (
                <Box>
                  {/* GST description card */}
                  {GST_DESCRIPTIONS[reportType] && (
                    <Box sx={{ mb: 2, p: 1.5, bgcolor: alpha('#b45309', 0.04), borderRadius: 2, border: `1px solid ${alpha('#b45309', 0.15)}` }}>
                      <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', mb: 0.5, color: '#92400e' }}>
                        {GST_DESCRIPTIONS[reportType].title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                        {GST_DESCRIPTIONS[reportType].description}
                      </Typography>
                      <Stack direction="row" spacing={2} flexWrap="wrap">
                        <Box>
                          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', fontSize: '0.65rem', textTransform: 'uppercase' }}>Due Date</Typography>
                          <Typography variant="caption" sx={{ display: 'block', color: '#dc2626', fontWeight: 600 }}>{GST_DESCRIPTIONS[reportType].dueDate}</Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', fontSize: '0.65rem', textTransform: 'uppercase' }}>Who Files</Typography>
                          <Typography variant="caption" sx={{ display: 'block' }}>{GST_DESCRIPTIONS[reportType].whoFiles}</Typography>
                        </Box>
                        {gstPeriodCounts && (
                          <Box>
                            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', fontSize: '0.65rem', textTransform: 'uppercase' }}>Period Summary</Typography>
                            <Typography variant="caption" sx={{ display: 'block' }}>
                              {gstPeriodCounts.salesCount} sales ({fmt(gstPeriodCounts.salesTotal)}) · {gstPeriodCounts.purchasesCount} purchases ({fmt(gstPeriodCounts.purchasesTotal)})
                            </Typography>
                          </Box>
                        )}
                      </Stack>
                    </Box>
                  )}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <Chip label="GST Returns Export" size="small" color="warning" sx={{ fontWeight: 700 }} />
                    <Typography variant="caption" color="text.secondary">
                      {reportType === 'cmp08' ? 'Select quarter & year' : 'Select month & year'}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                    {reportType === 'cmp08' ? (
                      <>
                        <FormControl size="small" sx={{ minWidth: 150 }}>
                          <InputLabel>Quarter</InputLabel>
                          <Select value={gstQuarter} label="Quarter" onChange={e => setGstQuarter(e.target.value)}>
                            {['Q1 (Apr-Jun)','Q2 (Jul-Sep)','Q3 (Oct-Dec)','Q4 (Jan-Mar)'].map((lbl, i) => (
                              <MenuItem key={i} value={`Q${i+1}`}>{lbl}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <FormControl size="small" sx={{ minWidth: 100 }}>
                          <InputLabel>Year</InputLabel>
                          <Select value={gstYear} label="Year" onChange={e => setGstYear(Number(e.target.value))}>
                            {yearOptions.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
                          </Select>
                        </FormControl>
                        {isMobile ? (
                          <Button variant="contained" color="warning" size="small" startIcon={<Download size={14} />}
                            onClick={() => handleGSTExport('cmp08')} sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 1.5 }}>
                            Export CSV
                          </Button>
                        ) : (
                          <IconButton size="small" onClick={() => handleGSTExport('cmp08')} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, color: '#b45309' }}>
                            <Download size={15} />
                          </IconButton>
                        )}
                      </>
                    ) : (
                      <>
                        <FormControl size="small" sx={{ minWidth: 130 }}>
                          <InputLabel>Month</InputLabel>
                          <Select value={gstMonth} label="Month" onChange={e => setGstMonth(Number(e.target.value))}>
                            {MONTHS.map((m, i) => <MenuItem key={i} value={i}>{m}</MenuItem>)}
                          </Select>
                        </FormControl>
                        <FormControl size="small" sx={{ minWidth: 100 }}>
                          <InputLabel>Year</InputLabel>
                          <Select value={gstYear} label="Year" onChange={e => setGstYear(Number(e.target.value))}>
                            {yearOptions.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
                          </Select>
                        </FormControl>
                        {isMobile ? (
                          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            <Button variant="contained" color="warning" size="small" startIcon={<Download size={14} />}
                              onClick={() => handleGSTExport(reportType, 'csv')} sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 1.5 }}>
                              CSV
                            </Button>
                            <Button variant="contained" color="success" size="small" startIcon={<FileDown size={14} />}
                              onClick={() => handleGSTExport(reportType, 'xlsx')} sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 1.5 }}>
                              Excel
                            </Button>
                          </Stack>
                        ) : (
                          <>
                            <Tooltip title="Export CSV">
                              <IconButton size="small" onClick={() => handleGSTExport(reportType, 'csv')} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, color: '#b45309' }}>
                                <Download size={15} />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Export Excel">
                              <IconButton size="small" onClick={() => handleGSTExport(reportType, 'xlsx')} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, color: '#5c1f22' }}>
                                <FileDown size={15} />
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                      </>
                    )}
                  </Stack>
                </Box>
              ) : noDateFilter ? (
                <>
                  <Typography variant="body2" color="text.secondary">
                    {reportType === 'net-balance' && (balanceOnly
                      ? 'Showing customers with an outstanding balance — all time.'
                      : 'Showing every customer, including settled (₹0) and credit balances — all time.')}
                    {reportType === 'vendor-balance' && (balanceOnly
                      ? 'Showing vendors with an outstanding payable amount — all time.'
                      : 'Showing every vendor, including settled (₹0) and overpaid balances — all time.')}
                    {reportType === 'aged-receivables' && 'Showing all customers with outstanding balances, bucketed by age.'}
                    {reportType === 'aged-payables' && 'Showing all vendors with outstanding payables, bucketed by age.'}
                    {reportType === 'stock-summary' && (stockView === 'category'
                      ? 'Opening stock, purchases, sales and current stock value rolled up by item category, all time.'
                      : 'Each product\'s opening stock (qty and value at its purchase price), all-time purchases and sales, and current stock with its value. Items with stock ≤ minimum stock are highlighted. Opening stock for items created before it was recorded is estimated as stock − purchased + sold.')}
                  </Typography>
                  {reportType === 'stock-summary' && (
                    <Box sx={{ display: 'flex', gap: 0.75, mt: 1.5 }}>
                      {[{ value: 'item', label: 'By Item' }, { value: 'category', label: 'By Category' }].map(v => (
                        <Chip key={v.value} label={v.label} size="small" clickable
                          onClick={() => setStockView(v.value)}
                          sx={{
                            fontSize: '0.72rem', fontWeight: 700, height: 28,
                            bgcolor: stockView === v.value ? alpha(activeColor, 0.12) : 'transparent',
                            color: stockView === v.value ? activeColor : 'text.secondary',
                            border: '1px solid', borderColor: stockView === v.value ? alpha(activeColor, 0.4) : 'divider',
                          }} />
                      ))}
                    </Box>
                  )}
                  {(reportType === 'net-balance' || reportType === 'vendor-balance') && (
                    <Box sx={{ display: 'flex', gap: 0.75, mt: 1.5 }}>
                      <Chip
                        label="Show only with balance" size="small" clickable
                        onClick={() => setBalanceOnly(v => !v)}
                        sx={{
                          fontSize: '0.72rem', fontWeight: 700, height: 28,
                          bgcolor: balanceOnly ? alpha(activeColor, 0.12) : 'transparent',
                          color: balanceOnly ? activeColor : 'text.secondary',
                          border: '1px solid', borderColor: balanceOnly ? alpha(activeColor, 0.4) : 'divider',
                        }} />
                    </Box>
                  )}
                </>
              ) : (
                <>
                  {/* Preset pills */}
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1.1 }}>
                    {PRESETS.map(p => (
                      <Chip key={p.value}
                        label={p.value === 'fy' ? `FY ${now.getFullYear() - (now.getMonth() < 3 ? 1 : 0)}-${(now.getFullYear() - (now.getMonth() < 3 ? 1 : 0) + 1).toString().slice(2)}` : p.label}
                        size="small" clickable
                        onClick={() => applyPreset(p.value)}
                        sx={{
                          fontSize: '0.7rem', fontWeight: 600, height: 24,
                          bgcolor: filters.preset === p.value ? alpha(activeColor, 0.12) : 'transparent',
                          color: filters.preset === p.value ? activeColor : 'text.secondary',
                          border: '1px solid', borderColor: filters.preset === p.value ? alpha(activeColor, 0.4) : 'divider',
                        }} />
                    ))}
                  </Box>
                  {/* Date + party/item row — only relevant pickers for the selected report show */}
                  <Grid container spacing={1.25} alignItems="flex-end">
                    <Grid size={{ xs: 6, sm: filterRelevance.partyRelevant || filterRelevance.itemRelevant ? 2.5 : 6 }}>
                      <TextField fullWidth label="From" type="date" size="small" value={filters.dateFrom}
                        onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value, preset: '' }))}
                        InputLabelProps={{ shrink: true }} />
                    </Grid>
                    <Grid size={{ xs: 6, sm: filterRelevance.partyRelevant || filterRelevance.itemRelevant ? 2.5 : 6 }}>
                      <TextField fullWidth label="To" type="date" size="small" value={filters.dateTo}
                        onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value, preset: '' }))}
                        InputLabelProps={{ shrink: true }} />
                    </Grid>
                    {filterRelevance.partySingleRelevant && (
                      <Grid size={{ xs: 12, sm: filterRelevance.itemRelevant ? 3.5 : 7 }}>
                        <PartySelect
                          options={parties}
                          value={parties.find(p => p.id === filters.partyId) || null}
                          onChange={v => setFilters(f => ({ ...f, partyId: v?.id || '' }))}
                          label={requiresParty ? 'Select Party (required)' : 'Filter by Party'}
                        />
                      </Grid>
                    )}
                    {filterRelevance.partyMultiRelevant && (
                      <Grid size={{ xs: 12, sm: filterRelevance.itemRelevant ? 3.5 : 7 }}>
                        <Autocomplete
                          multiple
                          size="small"
                          options={parties}
                          getOptionLabel={o => o.name || ''}
                          isOptionEqualToValue={(o, v) => o.id === v.id}
                          value={parties.filter(p => filters.partyIds.includes(p.id))}
                          onChange={(_, v) => setFilters(f => ({ ...f, partyIds: v.map(p => p.id) }))}
                          renderTags={(value, getTagProps) => value.map((option, index) => {
                            const { key: _key, ...tagProps } = getTagProps({ index });
                            return <Chip key={option.id} label={option.name} size="small" {...tagProps} />;
                          })}
                          renderInput={(params) => (
                            <TextField {...params} label="Filter by Party" placeholder={filters.partyIds.length ? '' : 'All parties'} />
                          )}
                        />
                      </Grid>
                    )}
                    {filterRelevance.itemMultiRelevant && (
                      <Grid size={{ xs: 12, sm: filterRelevance.partyRelevant ? 3.5 : 7 }}>
                        <Autocomplete
                          multiple
                          size="small"
                          options={items}
                          getOptionLabel={o => o.name || ''}
                          isOptionEqualToValue={(o, v) => o.id === v.id}
                          value={items.filter(i => filters.itemIds.includes(i.id))}
                          onChange={(_, v) => setFilters(f => ({ ...f, itemIds: v.map(i => i.id) }))}
                          renderTags={(value, getTagProps) => value.map((option, index) => {
                            const { key: _key, ...tagProps } = getTagProps({ index });
                            return <Chip key={option.id} label={option.name} size="small" {...tagProps} />;
                          })}
                          renderInput={(params) => (
                            <TextField {...params} label="Filter by Item" placeholder={filters.itemIds.length ? '' : 'All items'} />
                          )}
                        />
                      </Grid>
                    )}
                  </Grid>
                </>
              )}
            </Box>
          </Card>

          {/* ── Party statement — no party selected ── */}
          {reportType === 'party-statement' && !filters.partyId && (
            <Card elevation={0} sx={{ mb: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}>
              <Box sx={{ p: 2.5, textAlign: 'center' }}>
                <Box sx={{ p: 1.5, borderRadius: '50%', bgcolor: alpha(activeColor, 0.08), display: 'inline-flex', mb: 1.25 }}>
                  <ClipboardList size={24} color={activeColor} />
                </Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5, fontSize: '0.92rem' }}>Select a party to view their statement</Typography>
                <Typography variant="body2" color="text.secondary">Use the "Select Party" filter above to view all transactions for a customer or vendor.</Typography>
              </Box>
            </Card>
          )}

          {/* ── GST Preview Table ── */}
          {isGstReturn && gstPreviewData && gstPreviewData.length > 1 && (
            <Card elevation={0} sx={{ mb: 1.5, border: '1px solid', borderColor: alpha('#b45309', 0.3), borderRadius: 2.5 }}>
              <Box sx={{ p: 1.5, borderBottom: `1px solid ${alpha('#b45309', 0.15)}`, display: 'flex', alignItems: 'center', gap: 1 }}>
                <FileText size={15} color="#b45309" />
                <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: '#92400e' }}>Data Preview (first 20 rows)</Typography>
                <Chip label="Verify before export" size="small" sx={{ ml: 'auto', fontSize: '0.65rem', bgcolor: alpha('#b45309', 0.1), color: '#92400e' }} />
              </Box>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: alpha('#b45309', 0.04) }}>
                      {(gstPreviewData[0] || []).map((header, idx) => (
                        <TableCell key={idx} sx={{ fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#92400e', whiteSpace: 'nowrap', py: 1 }}>
                          {header}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {gstPreviewData.slice(1).map((row, ri) => (
                      <TableRow key={ri} hover>
                        {row.map((cell, ci) => (
                          <TableCell key={ci} sx={{ fontSize: '0.75rem', py: 0.75, whiteSpace: 'nowrap' }}>{cell}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </Card>
          )}

          {/* ── Title/count + search + action toolbar — one row on desktop,
              stacked on mobile. Previously the toolbar and the search box
              were two separate full-width rows; merging them into one row
              on desktop keeps the title, search, and actions scannable at a
              glance instead of stacking 3 rows before the table even starts. ── */}
          {!isGstReturn && !(reportType === 'party-statement' && !filters.partyId) && (
            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 1.25 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, flexShrink: 0, fontSize: '0.85rem' }}>{reportConfig.title}</Typography>
                {reportConfig.rows.length > 0 && (
                  <Chip label={`${reportConfig.rows.length} record${reportConfig.rows.length !== 1 ? 's' : ''}`} size="small"
                    sx={{ fontWeight: 700, fontSize: '0.68rem', height: 22, bgcolor: alpha(activeColor, 0.08), color: activeColor, border: `1px solid ${alpha(activeColor, 0.2)}`, flexShrink: 0 }} />
                )}
              </Box>

              {/* Search box — fills the middle space on desktop, full row on mobile */}
              {reportConfig.rows.length > 0 && (
                <TextField
                  size="small"
                  placeholder="Search in results..."
                  value={searchText}
                  onChange={e => setSearchText(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Search size={14} color="#5f4f47" />
                      </InputAdornment>
                    ),
                    endAdornment: searchText ? (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setSearchText('')}>
                          <X size={13} />
                        </IconButton>
                      </InputAdornment>
                    ) : null,
                  }}
                  sx={{
                    order: { xs: 3, sm: 0 },
                    flex: { xs: '1 1 100%', sm: '1 1 200px' },
                    minWidth: { xs: '100%', sm: 160 },
                    '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: '0.8rem' },
                  }}
                />
              )}

              {/* Action toolbar — labeled buttons on mobile, icon buttons on desktop */}
              {isMobile ? (
                <Stack direction="row" spacing={0.625} flexWrap="wrap" useFlexGap>
                  <FormControl size="small" sx={{ minWidth: 68 }}>
                    <Select value={paperSize} onChange={e => setPaperSize(e.target.value)}
                      sx={{ fontSize: '0.78rem' }}>
                      {['A3','A4','A5','A6','Letter','Legal','Executive','Statement'].map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <Button size="small" variant="outlined" startIcon={<Printer size={13} />} onClick={handlePrint}
                    sx={{ textTransform: 'none', borderRadius: 1.5, fontSize: '0.76rem' }}>Print</Button>
                  <Button size="small" variant="outlined" startIcon={<FileDown size={13} />} onClick={handleExcelExport}
                    sx={{ textTransform: 'none', borderRadius: 1.5, fontSize: '0.76rem', color: '#5c1f22', borderColor: '#5c1f22' }}>Excel</Button>
                  <Button size="small" variant="outlined" startIcon={<Share2 size={13} />} onClick={handleShare}
                    sx={{ textTransform: 'none', borderRadius: 1.5, fontSize: '0.76rem', color: '#25D366', borderColor: '#25D366' }}>Share</Button>
                </Stack>
              ) : (
                <Stack direction="row" spacing={0.625} alignItems="center" sx={{ flexShrink: 0, ml: 'auto' }}>
                  <TextField
                    select size="small" value={paperSize}
                    onChange={e => setPaperSize(e.target.value)}
                    sx={{ minWidth: 76, '& .MuiOutlinedInput-root': { fontSize: '0.78rem' } }}>
                    {['A3','A4','A5','A6','Letter','Legal','Executive','Statement'].map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                  </TextField>
                  <Tooltip title="Print report">
                    <IconButton size="small" onClick={handlePrint} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
                      <Printer size={15} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Export Excel">
                    <IconButton size="small" onClick={handleExcelExport} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, color: '#5c1f22' }}>
                      <FileDown size={15} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Share via WhatsApp">
                    <IconButton size="small" onClick={handleShare} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, color: '#25D366' }}>
                      <Share2 size={15} />
                    </IconButton>
                  </Tooltip>
                </Stack>
              )}
            </Box>
          )}

          {/* ── Results: card list on mobile (a wide report table doesn't fit
              a phone screen — even with horizontal scroll, most reports have
              6+ columns and become unreadable), table on desktop ── */}
          {!isGstReturn && !(reportType === 'party-statement' && !filters.partyId) && isMobile && (
            <Stack spacing={0.75} ref={reportTableRef}>
              {displayRows.length === 0 && (
                <Box sx={{ py: 5, textAlign: 'center' }}>
                  <Stack alignItems="center" spacing={1.25} sx={{ opacity: 0.5 }}>
                    <Box sx={{ p: 1.5, borderRadius: '50%', bgcolor: alpha(activeColor, 0.08), display: 'flex' }}>
                      <Search size={24} color={activeColor} />
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {searchText ? 'No matching records' : 'No records found'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {searchText ? 'Try a different search term' : 'Try changing the date range or filters'}
                    </Typography>
                  </Stack>
                </Box>
              )}
              {pageRows.map((row, rowIdx) => {
                // First column is the row's natural title (Date, Item Name,
                // Party, etc.); the rest render as label: value lines.
                const [titleCol, ...restCols] = reportConfig.columns;
                const canPrintBill = (reportType === 'sales' || reportType === 'purchases' || (reportType === 'day-book' && ['Sale', 'Purchase'].includes(row.type)));
                const dayBookNonBillTable = resolveDayBookNonBillTable(row);
                const clickable = canOpenBill(row) || canOpenDetail(row);
                const rowClick = canOpenBill(row) ? () => openInvoicePreview(row) : (canOpenDetail(row) ? () => openDetailDialog(row) : undefined);
                return (
                  <Card
                    key={rowIdx}
                    elevation={0}
                    onClick={rowClick}
                    sx={{
                      p: 1.1,
                      borderRadius: 1.75,
                      border: '1px solid',
                      borderColor: row._section ? alpha(activeColor, 0.3) : 'divider',
                      bgcolor: row._section ? alpha(activeColor, 0.04) : 'background.paper',
                      cursor: clickable ? 'pointer' : 'default',
                      transition: 'background-color 0.12s',
                      '&:hover': clickable ? { bgcolor: alpha(activeColor, 0.05) } : undefined,
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, mb: restCols.length ? 0.625 : 0 }}>
                      <Typography sx={{ fontWeight: row._bold ? 800 : 700, fontSize: '0.85rem', color: row._color || 'text.primary', wordBreak: 'break-word' }}>
                        {row[titleCol.key]}
                      </Typography>
                      {clickable && (
                        <Tooltip title={canOpenDetail(row) ? 'View details' : 'View bill'}>
                          <IconButton size="small" sx={{ color: activeColor, flexShrink: 0, mt: -0.5 }}
                            onClick={(e) => { e.stopPropagation(); rowClick?.(); }}>
                            <Eye size={14} />
                          </IconButton>
                        </Tooltip>
                      )}
                      {canPrintBill && (
                        <IconButton size="small" sx={{ color: 'text.disabled', flexShrink: 0, mt: -0.5 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            const isSaleRow = reportType === 'day-book' ? row.type === 'Sale' : reportType === 'sales';
                            const src = isSaleRow ? sales : purchases;
                            const tx = src.find(t => t.id === row.id);
                            if (tx) triggerBillPrint(tx);
                          }}>
                          <Printer size={14} />
                        </IconButton>
                      )}
                      {!!dayBookNonBillTable && (
                        <>
                          <IconButton size="small" sx={{ color: 'text.disabled', flexShrink: 0, mt: -0.5 }}
                            onClick={(e) => { e.stopPropagation(); triggerDayBookRowPrint(row); }}>
                            <Printer size={14} />
                          </IconButton>
                          <IconButton size="small" sx={{ color: '#25D366', flexShrink: 0, mt: -0.5 }}
                            onClick={(e) => { e.stopPropagation(); shareDayBookRow(row); }}>
                            <Share2 size={14} />
                          </IconButton>
                        </>
                      )}
                      {reportType === 'aged-receivables' && (
                        <Tooltip title="Send payment reminder on WhatsApp">
                          <IconButton size="small" sx={{ color: '#25D366', flexShrink: 0, mt: -0.5 }}
                            onClick={() => handleSendAgedReminder(row)}>
                            <MessageCircle size={14} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                    {restCols.length > 0 && (
                      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 0.5 }}>
                        {restCols.map((col, ci) => (
                          <Box key={ci} sx={{ display: 'flex', flexDirection: 'column' }}>
                            <Typography sx={{ fontSize: '0.62rem', fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              {col.header}
                            </Typography>
                            {col.key === 'mode' && row._dbCredit ? (
                              <Box component="span" sx={{
                                display: 'inline-block', mt: 0.25, px: 0.9, py: 0.2, borderRadius: '100px', width: 'fit-content',
                                fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.02em',
                                bgcolor: alpha('#d97706', 0.12), color: '#b45309',
                              }}>
                                {row[col.key]}
                              </Box>
                            ) : (
                              <Typography sx={{
                                fontSize: col.key === 'timeStr' ? '0.68rem' : '0.8rem',
                                fontWeight: col.key === 'timeStr' ? 500 : (col.isTotal || row._bold) ? 700 : 500,
                                color: (col.key === 'moneyIn' && row[col.key] !== '—') ? '#5c1f22'
                                  : (col.key === 'moneyOut' && row[col.key] !== '—') ? '#dc2626'
                                  : row._color || 'text.primary',
                              }}>
                                {row[col.key] ?? '—'}
                              </Typography>
                            )}
                          </Box>
                        ))}
                      </Box>
                    )}
                  </Card>
                );
              })}
              {/* Day Book has its own dedicated 3-line Money-In/Money-Out/Net
                  summary bar below (color-coded, matches the desktop view) —
                  skip the generic single-card totals here to avoid showing
                  the same numbers twice in a row on mobile. */}
              {reportType !== 'day-book' && displayRows.length > 0 && Object.keys(reportConfig.totals).length > 0 && (
                <Card elevation={0} sx={{ p: 1.1, borderRadius: 1.75, border: `1.5px solid ${alpha(activeColor, 0.3)}`, bgcolor: alpha(activeColor, 0.06) }}>
                  <Typography sx={{ fontSize: '0.68rem', fontWeight: 800, color: activeColor, textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.5 }}>
                    Total
                  </Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 0.5 }}>
                    {reportConfig.columns.filter(col => col.isTotal && reportConfig.totals[col.key] != null).map((col, idx) => (
                      <Box key={idx} sx={{ display: 'flex', flexDirection: 'column' }}>
                        <Typography sx={{ fontSize: '0.62rem', fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {col.header}
                        </Typography>
                        <Typography sx={{ fontSize: '0.85rem', fontWeight: 800, color: activeColor }}>
                          {fmt(reportConfig.totals[col.key])}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Card>
              )}
              {reportPager && <Card elevation={0} sx={{ borderRadius: 1.75, border: '1px solid', borderColor: 'divider' }}>{reportPager}</Card>}
            </Stack>
          )}

          {/* ── Results Table (desktop) ── */}
          {!isGstReturn && !(reportType === 'party-statement' && !filters.partyId) && !isMobile && (
            <Box ref={reportTableRef} sx={{ overflowX: 'auto', width: '100%' }}>
              <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider', overflow: 'hidden', width: '100%' }}>
                <Table size="small" sx={{ width: '100%', ...(reportType === 'day-book' ? { tableLayout: 'fixed' } : {}) }}>
                  <TableHead sx={{ bgcolor: alpha(activeColor, 0.04) }}>
                    <TableRow>
                      {reportConfig.columns.map((col, idx) => (
                        <TableCell key={idx} align={col.align || 'left'}
                          sx={{
                            fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase',
                            letterSpacing: '0.06em', color: 'text.secondary',
                            py: 0.9, whiteSpace: 'nowrap',
                            ...(col.width ? { width: col.width, minWidth: col.width } : {}),
                            borderBottom: `2px solid ${alpha(activeColor, 0.15)}`,
                            position: 'sticky', top: 0, bgcolor: alpha(activeColor, 0.04), zIndex: 1,
                          }}>
                          {col.header}
                        </TableCell>
                      ))}
                      {showBillCol && (
                        <TableCell align="center" sx={{
                          fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase',
                          letterSpacing: '0.06em', color: 'text.secondary', py: 0.9, width: 72,
                          borderBottom: `2px solid ${alpha(activeColor, 0.15)}`,
                          position: 'sticky', top: 0, bgcolor: alpha(activeColor, 0.04), zIndex: 1,
                        }}>
                          {['item-profit', 'party-profit', 'party-group'].includes(reportType) ? 'Detail' : 'Bill'}
                        </TableCell>
                      )}
                      {reportType === 'aged-receivables' && (
                        <TableCell align="center" sx={{
                          fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase',
                          letterSpacing: '0.06em', color: 'text.secondary', py: 0.9, width: 48,
                          borderBottom: `2px solid ${alpha(activeColor, 0.15)}`,
                          position: 'sticky', top: 0, bgcolor: alpha(activeColor, 0.04), zIndex: 1,
                        }}>
                          Remind
                        </TableCell>
                      )}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pageRows.map((row, rowIdx) => {
                      const clickable = canOpenBill(row) || canOpenDetail(row);
                      const rowClick = canOpenBill(row) ? () => openInvoicePreview(row) : (canOpenDetail(row) ? () => openDetailDialog(row) : undefined);
                      return (
                      <TableRow key={rowIdx} hover
                        onClick={rowClick}
                        sx={{
                          '&:nth-of-type(even)': { bgcolor: 'rgba(0,0,0,0.012)' },
                          cursor: clickable ? 'pointer' : 'default',
                        }}>
                        {reportConfig.columns.map((col, colIdx) => (
                          <TableCell key={colIdx} align={col.align || 'left'}
                            sx={{
                              fontWeight: row._bold ? 700 : 400,
                              color: row._color || undefined,
                              bgcolor: row._section ? alpha(activeColor, 0.04) : undefined,
                              fontSize: row._bold ? '0.82rem' : '0.8rem',
                              py: 0.875, whiteSpace: 'nowrap',
                              ...(col.width ? { width: col.width, minWidth: col.width } : {}),
                            }}>
                            {col.key === 'mode' && row._dbCredit ? (
                              <Box component="span" sx={{
                                display: 'inline-block', px: 0.9, py: 0.2, borderRadius: '100px',
                                fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.02em',
                                bgcolor: alpha('#d97706', 0.12), color: '#b45309',
                              }}>
                                {row[col.key]}
                              </Box>
                            ) : (col.key === 'moneyIn' || col.key === 'moneyOut') && row[col.key] !== '—' ? (
                              <Typography component="span" sx={{ fontWeight: 700, fontSize: 'inherit', color: col.key === 'moneyIn' ? '#5c1f22' : '#dc2626' }}>
                                {row[col.key]}
                              </Typography>
                            ) : col.key === 'timeStr' ? (
                              <Typography component="span" sx={{ fontSize: '0.68rem', color: 'text.secondary', fontWeight: 500 }}>
                                {row[col.key]}
                              </Typography>
                            ) : row[col.key]}
                          </TableCell>
                        ))}
                        {showBillCol && (
                          <TableCell align="center" sx={{ py: 0.5 }}>
                            <Stack direction="row" spacing={0.25} justifyContent="center">
                              {canOpenDetail(row) && (
                                <Tooltip title="View details">
                                  <IconButton size="small"
                                    onClick={(e) => { e.stopPropagation(); openDetailDialog(row); }}
                                    sx={{ color: activeColor, '&:hover': { bgcolor: alpha(activeColor, 0.08) } }}>
                                    <Eye size={14} />
                                  </IconButton>
                                </Tooltip>
                              )}
                              {canOpenBill(row) && (
                                <Tooltip title="View bill">
                                  <IconButton size="small"
                                    onClick={(e) => { e.stopPropagation(); openInvoicePreview(row); }}
                                    sx={{ color: activeColor, '&:hover': { bgcolor: alpha(activeColor, 0.08) } }}>
                                    <Eye size={14} />
                                  </IconButton>
                                </Tooltip>
                              )}
                              {(reportType === 'sales' || reportType === 'purchases' || (reportType === 'day-book' && ['Sale', 'Purchase'].includes(row.type))) && (
                                <Tooltip title="Print bill">
                                  <IconButton size="small"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const isSaleRow = reportType === 'day-book' ? row.type === 'Sale' : reportType === 'sales';
                                      const src = isSaleRow ? sales : purchases;
                                      const tx = src.find(t => t.id === row.id);
                                      if (tx) triggerBillPrint(tx);
                                    }}
                                    sx={{ color: 'text.disabled', '&:hover': { color: activeColor, bgcolor: alpha(activeColor, 0.08) } }}>
                                    <Printer size={14} />
                                  </IconButton>
                                </Tooltip>
                              )}
                              {reportType === 'day-book' && !!resolveDayBookNonBillTable(row) && (
                                <>
                                  <Tooltip title="Print">
                                    <IconButton size="small"
                                      onClick={(e) => { e.stopPropagation(); triggerDayBookRowPrint(row); }}
                                      sx={{ color: 'text.disabled', '&:hover': { color: activeColor, bgcolor: alpha(activeColor, 0.08) } }}>
                                      <Printer size={14} />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="Share">
                                    <IconButton size="small"
                                      onClick={(e) => { e.stopPropagation(); shareDayBookRow(row); }}
                                      sx={{ color: '#25D366', '&:hover': { bgcolor: alpha('#25D366', 0.08) } }}>
                                      <Share2 size={14} />
                                    </IconButton>
                                  </Tooltip>
                                </>
                              )}
                            </Stack>
                          </TableCell>
                        )}
                        {reportType === 'aged-receivables' && (
                          <TableCell align="center" sx={{ py: 0.5 }}>
                            <Tooltip title="Send payment reminder on WhatsApp">
                              <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleSendAgedReminder(row); }}
                                sx={{ color: '#25D366', '&:hover': { bgcolor: 'rgba(37,211,102,0.1)' } }}>
                                <MessageCircle size={14} />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        )}
                      </TableRow>
                      );
                    })}
                    {displayRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={reportConfig.columns.length + 1} align="center" sx={{ py: 5 }}>
                          <Stack alignItems="center" spacing={1.25} sx={{ opacity: 0.5 }}>
                            <Box sx={{ p: 1.5, borderRadius: '50%', bgcolor: alpha(activeColor, 0.08), display: 'flex' }}>
                              <Search size={24} color={activeColor} />
                            </Box>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {searchText ? 'No matching records' : 'No records found'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {searchText ? 'Try a different search term' : 'Try changing the date range or filters'}
                            </Typography>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                  {displayRows.length > 0 && Object.keys(reportConfig.totals).length > 0 && (
                    <TableHead>
                      <TableRow sx={{ bgcolor: alpha(activeColor, 0.06) }}>
                        {reportConfig.columns.map((col, idx) => (
                          <TableCell key={idx} align={col.align || 'left'}
                            sx={{ fontWeight: 700, fontSize: '0.8rem', borderTop: `2px solid ${alpha(activeColor, 0.25)}`, color: activeColor, py: 1 }}>
                            {col.isTotal && reportConfig.totals[col.key] != null
                              ? fmt(reportConfig.totals[col.key])
                              : idx === 0 ? 'TOTAL' : ''}
                          </TableCell>
                        ))}
                        {showBillCol && <TableCell sx={{ borderTop: `2px solid ${alpha(activeColor, 0.25)}` }} />}
                      </TableRow>
                    </TableHead>
                  )}
                </Table>
                {reportPager}
              </TableContainer>
            </Box>
          )}
        </Box>
      </Box>

      <InvoicePreviewDialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        transaction={previewTx}
        business={currentBusiness}
        parties={parties}
        config={config}
        isSale={previewIsSale}
      />

      {/* Item-wise / Party-wise P&L drill-down — summary stats + recent
          sale/purchase history, computed all-time (not the report's own date
          filter) since this is meant as a full snapshot for that item/party. */}
      <Dialog open={!!detailDialog} onClose={() => setDetailDialog(null)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden', maxHeight: 'calc(100% - 64px)' } }}>
        {detailContent && (
          <>
            <Box sx={{
              background: '#ffffff', border: '1px solid #ece2db',
              px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.25, flexShrink: 0,
            }}>
              <Avatar sx={{ bgcolor: 'rgba(92,31,34,0.1)', color: '#5c1f22', fontWeight: 800, width: 34, height: 34 }}>
                {detailContent.kind === 'item' ? <Package size={16} /> : (detailContent.title?.[0]?.toUpperCase() || '?')}
              </Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ color: '#5c1f22', fontWeight: 800, fontSize: '0.95rem', lineHeight: 1.2 }} noWrap>
                  {detailContent.title}
                </Typography>
                {detailContent.subtitle && (
                  <Typography sx={{ color: '#57433e', fontSize: '0.74rem' }} noWrap>
                    {detailContent.subtitle}
                  </Typography>
                )}
              </Box>
              <IconButton size="small" onClick={() => setDetailDialog(null)} sx={{ color: '#57433e', '&:hover': { bgcolor: 'rgba(92,31,34,0.08)' } }}>
                <X size={17} />
              </IconButton>
            </Box>

            <DialogContent sx={{ p: 0, overflowY: 'auto' }}>
              {/* Stats grid */}
              <Box sx={{ p: 1.75, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 1 }}>
                {detailContent.stats.map(s => (
                  <Box key={s.label} sx={{ p: 1.1, borderRadius: 1.75, border: '1px solid', borderColor: 'divider', bgcolor: 'background.default' }}>
                    <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {s.label}
                    </Typography>
                    <Typography sx={{ fontWeight: 800, fontSize: '0.98rem', color: s.color || 'text.primary', lineHeight: 1.3 }}>
                      {s.value}
                    </Typography>
                    {s.sub && <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>{s.sub}</Typography>}
                  </Box>
                ))}
              </Box>

              <Divider />

              {detailContent.kind === 'group' ? (() => {
                // Group detail only — a single item/party detail is already
                // scoped to one entity, so a customer search inside it adds
                // nothing (kept as the original stacked Sales+Purchases
                // layout below instead). Tab strip picks which of the
                // group's two all-time lists is being browsed; the party
                // search + date range then narrow whichever list is active.
                const activeRows = detailTab === 'sales' ? detailContent.recentSales : detailContent.recentPurchases;
                const activePage = detailTab === 'sales' ? detailSalesPage : detailPurchasesPage;
                const setActivePage = detailTab === 'sales' ? setDetailSalesPage : setDetailPurchasesPage;
                const activeColorHex = detailTab === 'sales' ? '#5c1f22' : '#7c3aed';
                const searchLc = detailPartySearch.trim().toLowerCase();
                const filteredRows = activeRows.filter(r => {
                  if (searchLc && !(r.partyName || '').toLowerCase().includes(searchLc)) return false;
                  if (detailDateFrom && r.date < detailDateFrom) return false;
                  if (detailDateTo && r.date > detailDateTo) return false;
                  return true;
                });
                const hasFilters = !!(detailPartySearch || detailDateFrom || detailDateTo);
                return (
                  <>
                    {/* Sales / Purchases tab strip */}
                    <Box sx={{ px: 1.75, pt: 1.5, display: 'flex', gap: 0.75 }}>
                      {[
                        { value: 'sales', label: 'Sales', count: detailContent.recentSales.length, color: '#5c1f22' },
                        { value: 'purchases', label: 'Purchases', count: detailContent.recentPurchases.length, color: '#7c3aed' },
                      ].map(t => (
                        <Chip key={t.value} label={`${t.label} (${t.count})`} size="small" clickable
                          onClick={() => setDetailTab(t.value)}
                          sx={{
                            fontSize: '0.74rem', fontWeight: 700, height: 28,
                            bgcolor: detailTab === t.value ? alpha(t.color, 0.12) : 'transparent',
                            color: detailTab === t.value ? t.color : 'text.secondary',
                            border: '1px solid', borderColor: detailTab === t.value ? alpha(t.color, 0.4) : 'divider',
                          }} />
                      ))}
                    </Box>

                    {/* Customer search + date range — apply to whichever tab is active */}
                    <Box sx={{ px: 1.75, pt: 1.25, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      <TextField size="small" placeholder="Search customer/vendor…" value={detailPartySearch}
                        onChange={e => { setDetailPartySearch(e.target.value); setActivePage(0); }}
                        InputProps={{ startAdornment: <InputAdornment position="start"><Search size={14} /></InputAdornment> }}
                        sx={{ flex: '1 1 180px', minWidth: 140 }} />
                      <TextField size="small" type="date" label="From" value={detailDateFrom}
                        onChange={e => { setDetailDateFrom(e.target.value); setActivePage(0); }}
                        InputLabelProps={{ shrink: true }} sx={{ flex: '1 1 130px', minWidth: 120 }} />
                      <TextField size="small" type="date" label="To" value={detailDateTo}
                        onChange={e => { setDetailDateTo(e.target.value); setActivePage(0); }}
                        InputLabelProps={{ shrink: true }} sx={{ flex: '1 1 130px', minWidth: 120 }} />
                      {hasFilters && (
                        <Button size="small" onClick={() => { setDetailPartySearch(''); setDetailDateFrom(''); setDetailDateTo(''); setActivePage(0); }}
                          sx={{ textTransform: 'none', fontWeight: 600 }}>
                          Clear
                        </Button>
                      )}
                    </Box>

                    <Box sx={{ px: 1.75, pt: 1.25, pb: 1.75 }}>
                      {hasFilters && (
                        <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', mb: 0.75 }}>
                          {filteredRows.length} of {activeRows.length} match{filteredRows.length !== 1 ? 'es' : ''}
                        </Typography>
                      )}
                      {filteredRows.length === 0 ? (
                        <Typography sx={{ fontSize: '0.8rem', color: 'text.disabled', py: 1 }}>
                          {activeRows.length === 0
                            ? `No ${detailTab === 'sales' ? 'sales' : 'purchases'} recorded`
                            : 'No bills match this filter'}
                        </Typography>
                      ) : (
                        <>
                          <Stack spacing={0.5}>
                            {filteredRows
                              .slice(activePage * DETAIL_ROWS_PER_PAGE, activePage * DETAIL_ROWS_PER_PAGE + DETAIL_ROWS_PER_PAGE)
                              .map((r, i) => (
                              <Box key={r.id || i} onClick={() => openBillFromDetail(r.id, detailTab === 'sales' ? 'sales' : 'purchases')}
                                sx={{
                                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, py: 0.625,
                                  borderBottom: '1px solid', borderColor: 'divider',
                                  cursor: r.id ? 'pointer' : 'default', borderRadius: 1, px: 0.5, mx: -0.5,
                                  '&:hover': r.id ? { bgcolor: alpha(activeColorHex, 0.06) } : undefined,
                                }}>
                                <Box sx={{ minWidth: 0 }}>
                                  <Typography sx={{ fontWeight: 600, fontSize: '0.8rem' }} noWrap>{r.invoiceNumber || '—'}</Typography>
                                  <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary' }} noWrap>
                                    {r.date}{r.partyName ? ` · ${r.partyName}` : ''}{r.qty != null ? ` · ${r.qty} units` : ''}
                                  </Typography>
                                </Box>
                                <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', color: activeColorHex, whiteSpace: 'nowrap' }}>
                                  {fmt(r.amount)}
                                </Typography>
                              </Box>
                            ))}
                          </Stack>
                          {filteredRows.length > DETAIL_ROWS_PER_PAGE && (
                            <TablePagination
                              component="div"
                              count={filteredRows.length}
                              page={activePage}
                              onPageChange={(_e, p) => setActivePage(p)}
                              rowsPerPage={DETAIL_ROWS_PER_PAGE}
                              rowsPerPageOptions={[DETAIL_ROWS_PER_PAGE]}
                              sx={{ mt: 0.5, '& .MuiTablePagination-toolbar': { minHeight: 40, pl: 0 } }}
                            />
                          )}
                        </>
                      )}
                    </Box>
                  </>
                );
              })() : (
                <>
                  {/* Recent Sales — item/party detail: unchanged stacked layout, capped to 8 rows by buildItemDetail/buildPartyDetail. */}
                  <Box sx={{ px: 1.75, pt: 1.5, pb: 0.75 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', color: 'text.secondary', mb: 0.75 }}>
                      Recent Sales {detailContent.recentSales.length > 0 && `(${detailContent.recentSales.length})`}
                    </Typography>
                    {detailContent.recentSales.length === 0 ? (
                      <Typography sx={{ fontSize: '0.8rem', color: 'text.disabled', py: 1 }}>No sales recorded</Typography>
                    ) : (
                      <Stack spacing={0.5}>
                        {detailContent.recentSales.map((r, i) => (
                          <Box key={r.id || i} onClick={() => openBillFromDetail(r.id, 'sales')}
                            sx={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, py: 0.625,
                              borderBottom: '1px solid', borderColor: 'divider',
                              cursor: r.id ? 'pointer' : 'default', borderRadius: 1, px: 0.5, mx: -0.5,
                              '&:hover': r.id ? { bgcolor: alpha('#5c1f22', 0.06) } : undefined,
                            }}>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography sx={{ fontWeight: 600, fontSize: '0.8rem' }} noWrap>{r.invoiceNumber || '—'}</Typography>
                              <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary' }} noWrap>
                                {r.date}{r.partyName ? ` · ${r.partyName}` : ''}{r.qty != null ? ` · ${r.qty} units` : ''}
                              </Typography>
                            </Box>
                            <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', color: '#5c1f22', whiteSpace: 'nowrap' }}>
                              {fmt(r.amount)}
                            </Typography>
                          </Box>
                        ))}
                      </Stack>
                    )}
                  </Box>

                  <Divider />

                  {/* Recent Purchases — same as above, unchanged. */}
                  <Box sx={{ px: 1.75, pt: 1.5, pb: 1.75 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', color: 'text.secondary', mb: 0.75 }}>
                      Recent Purchases {detailContent.recentPurchases.length > 0 && `(${detailContent.recentPurchases.length})`}
                    </Typography>
                    {detailContent.recentPurchases.length === 0 ? (
                      <Typography sx={{ fontSize: '0.8rem', color: 'text.disabled', py: 1 }}>No purchases recorded</Typography>
                    ) : (
                      <Stack spacing={0.5}>
                        {detailContent.recentPurchases.map((r, i) => (
                          <Box key={r.id || i} onClick={() => openBillFromDetail(r.id, 'purchases')}
                            sx={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, py: 0.625,
                              borderBottom: '1px solid', borderColor: 'divider',
                              cursor: r.id ? 'pointer' : 'default', borderRadius: 1, px: 0.5, mx: -0.5,
                              '&:hover': r.id ? { bgcolor: alpha('#7c3aed', 0.06) } : undefined,
                            }}>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography sx={{ fontWeight: 600, fontSize: '0.8rem' }} noWrap>{r.invoiceNumber || '—'}</Typography>
                              <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary' }} noWrap>
                                {r.date}{r.partyName ? ` · ${r.partyName}` : ''}{r.qty != null ? ` · ${r.qty} units` : ''}
                              </Typography>
                            </Box>
                            <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', color: '#7c3aed', whiteSpace: 'nowrap' }}>
                              {fmt(r.amount)}
                            </Typography>
                          </Box>
                        ))}
                      </Stack>
                    )}
                  </Box>
                </>
              )}
            </DialogContent>
          </>
        )}
      </Dialog>
    </Box>
  );
};

export default ReportsPage;
