import React, { useState, useRef, useCallback } from 'react';
import {
  Box, Typography, Card, CardContent, Button, Stack, Stepper, Step, StepLabel,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer, Paper,
  Chip, Alert, IconButton, Backdrop, CircularProgress, Divider, Tooltip,
  Grid, TextField, MenuItem, Select, FormControl, InputLabel, LinearProgress,
  Accordion, AccordionSummary, AccordionDetails, alpha,
} from '@mui/material';
import {
  Upload, CheckCircle, AlertTriangle, FileText, Package, Users,
  ShoppingCart, TrendingUp, ArrowRight, Download, X, ChevronDown,
  RefreshCw, Info, Zap, BookOpen, Receipt, CreditCard,
} from 'lucide-react';
import { useData } from './DataContext';
import { useBusiness } from './BusinessContext';
import { generatePartyId, loadCustomCategories } from './partyUtils';

// ─── Column aliases for Vyapar ──────────────────────────────────────────────
// Vyapar exports slightly different column names depending on version and report type.
// Keys below are checked in order; first non-empty match wins.

const V_ITEM_COLS = {
  name:           ['Item Name', 'Product Name', 'Name', 'Item', 'Product'],
  itemCode:       ['Item Code', 'Product Code', 'SKU', 'Code', 'Item Code/SKU'],
  category:       ['Category', 'Item Category', 'Product Category'],
  unit:           ['Unit', 'Unit of Measure', 'Unit Name', 'UOM'],
  salePrice:      ['Sale Price', 'Selling Price', 'MRP', 'Sales Price', 'Price', 'Rate'],
  purchasePrice:  ['Purchase Price', 'Cost Price', 'Buy Price'],
  mrp:            ['MRP', 'Maximum Retail Price'],
  taxRate:        ['Tax Rate', 'GST Rate (%)', 'GST%', 'GST Rate', 'Tax Rate (%)'],
  hsnCode:        ['HSN Code', 'HSN/SAC Code', 'HSN', 'SAC Code'],
  stock:          ['Current Stock', 'Stock', 'Quantity', 'Opening Stock', 'Qty'],
  minStock:       ['Min Stock', 'Minimum Stock', 'Reorder Level', 'Low Stock Alert'],
  barcode:        ['Barcode', 'Barcode Number', 'Bar Code'],
  description:    ['Description', 'Notes', 'Product Description', 'Details'],
};

const V_PARTY_COLS = {
  name:            ['Party Name', 'Customer Name', 'Vendor Name', 'Name', 'Contact Name', 'Supplier Name'],
  type:            ['Party Type', 'Type', 'Contact Type'],
  phone:           ['Phone', 'Mobile', 'Contact Number', 'Mobile Number', 'Phone Number'],
  email:           ['Email', 'Email ID', 'Email Address'],
  gstNumber:       ['GSTIN', 'GST No.', 'GST Number', 'GSTIN/UIN', 'GST'],
  address:         ['Address', 'Billing Address', 'Address Line 1'],
  openingBalance:  ['Opening Balance', 'Balance', 'Current Balance'],
  category:        ['Category', 'Party Category', 'Group'],
  bankName:        ['Bank Name'],
  accountNumber:   ['Account Number', 'Bank Account No.'],
  ifscCode:        ['IFSC Code', 'IFSC'],
};

const V_SALE_COLS = {
  partyName:       ['Party Name', 'Customer Name', 'Buyer Name', 'Client Name'],
  invoiceNumber:   ['Invoice Number', 'Invoice No.', 'Invoice No', 'Voucher Number', 'Bill No.', 'Bill Number'],
  date:            ['Date', 'Invoice Date', 'Sale Date', 'Voucher Date'],
  itemName:        ['Item Name', 'Product Name', 'Item', 'Product', 'Description'],
  qty:             ['Qty', 'Quantity', 'Item Quantity'],
  rate:            ['Rate', 'Price', 'Unit Price', 'Sale Price'],
  discPct:         ['Discount (%)', 'Discount', 'Disc%', 'Disc (%)', 'Item Discount (%)'],
  taxRate:         ['Tax Rate', 'GST Rate (%)', 'GST%', 'GST Rate', 'Tax (%)'],
  totalAmount:     ['Total Amount', 'Grand Total', 'Invoice Amount', 'Net Amount', 'Amount'],
  paymentMode:     ['Payment Type', 'Payment Mode', 'Mode of Payment'],
  status:          ['Status', 'Payment Status'],
};

const V_PURCHASE_COLS = {
  ...V_SALE_COLS,
  partyName:       ['Party Name', 'Supplier Name', 'Vendor Name', 'Seller Name'],
  invoiceNumber:   ['Bill Number', 'Bill No.', 'Invoice Number', 'Invoice No.', 'Voucher Number'],
};

const MBB_SALE_COLS = {
  // MyBillBook column names
  partyName:       ['Customer', 'Customer Name', 'Party Name', 'Client'],
  invoiceNumber:   ['Invoice No', 'Invoice Number', 'Bill No', 'Voucher No'],
  date:            ['Date', 'Invoice Date'],
  itemName:        ['Item Name', 'Product', 'Description', 'Item'],
  qty:             ['Qty', 'Quantity'],
  rate:            ['Rate', 'Price', 'Unit Price'],
  discPct:         ['Discount%', 'Discount', 'Disc'],
  taxRate:         ['Tax%', 'GST%', 'Tax'],
  totalAmount:     ['Total', 'Amount', 'Grand Total', 'Net Amount'],
  paymentMode:     ['Payment Mode', 'Mode'],
};

// ─── Universal column picker ─────────────────────────────────────────────────
function pick(row, aliases) {
  for (const alias of aliases) {
    if (row[alias] !== undefined && row[alias] !== '') return row[alias];
  }
  return '';
}

function pickNum(row, aliases) {
  return parseFloat(String(pick(row, aliases)).replace(/[^0-9.-]/g, '')) || 0;
}

function pickStr(row, aliases) {
  return String(pick(row, aliases) || '').trim();
}

function normalizeDate(raw) {
  if (!raw) return new Date().toISOString().split('T')[0];
  const s = String(raw).trim();
  // dd-mm-yyyy or dd/mm/yyyy
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // mm/dd/yyyy
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdy) {
    const [, m, d, y] = mdy;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // Excel serial date
  if (/^\d{5}$/.test(s)) {
    const d = new Date(Date.UTC(1899, 11, 30) + parseInt(s) * 86400000);
    return d.toISOString().split('T')[0];
  }
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  if (!isNaN(parsed)) return parsed.toISOString().split('T')[0];
  return new Date().toISOString().split('T')[0];
}

function normalizePaymentMode(raw) {
  const s = String(raw || '').toLowerCase();
  if (s.includes('cash')) return 'Cash';
  if (s.includes('bank') || s.includes('transfer') || s.includes('neft') || s.includes('rtgs') || s.includes('upi') || s.includes('online') || s.includes('credit') || s.includes('card')) return 'Bank';
  if (s.includes('split') || s.includes('partial')) return 'Split';
  return 'Cash';
}

function normalizePartyType(raw) {
  const s = String(raw || '').toLowerCase();
  if (s.includes('vendor') || s.includes('supplier') || s.includes('purchase')) return 'Vendor';
  return 'Customer';
}

// ─── Parsers ─────────────────────────────────────────────────────────────────

function parseVyapaarItems(rows) {
  return rows.map(row => ({
    name:          pickStr(row, V_ITEM_COLS.name),
    itemCode:      pickStr(row, V_ITEM_COLS.itemCode),
    category:      pickStr(row, V_ITEM_COLS.category),
    unit:          pickStr(row, V_ITEM_COLS.unit) || 'NOS',
    salePrice:     pickNum(row, V_ITEM_COLS.salePrice),
    purchasePrice: pickNum(row, V_ITEM_COLS.purchasePrice),
    mrp:           pickNum(row, V_ITEM_COLS.mrp),
    taxRate:       pickNum(row, V_ITEM_COLS.taxRate),
    hsnCode:       pickStr(row, V_ITEM_COLS.hsnCode),
    stock:         pickNum(row, V_ITEM_COLS.stock),
    minStock:      pickNum(row, V_ITEM_COLS.minStock) || null,
    barcode:       pickStr(row, V_ITEM_COLS.barcode),
    description:   pickStr(row, V_ITEM_COLS.description),
  })).filter(i => i.name);
}

function parseVyapaarParties(rows, defaultType = 'Customer') {
  return rows.map(row => {
    const rawBal = pickStr(row, V_PARTY_COLS.openingBalance);
    const bal = parseFloat(String(rawBal).replace(/[^0-9.-]/g, '')) || 0;
    return {
      name:           pickStr(row, V_PARTY_COLS.name),
      type:           normalizePartyType(pickStr(row, V_PARTY_COLS.type) || defaultType),
      phone:          pickStr(row, V_PARTY_COLS.phone).replace(/\D/g, '').slice(0, 15),
      email:          pickStr(row, V_PARTY_COLS.email),
      gstNumber:      pickStr(row, V_PARTY_COLS.gstNumber),
      address:        pickStr(row, V_PARTY_COLS.address),
      openingBalance: bal,
      category:       pickStr(row, V_PARTY_COLS.category),
      bankName:       pickStr(row, V_PARTY_COLS.bankName),
      accountNumber:  pickStr(row, V_PARTY_COLS.accountNumber),
      ifscCode:       pickStr(row, V_PARTY_COLS.ifscCode),
    };
  }).filter(p => p.name);
}

function parseVyapaarSales(rows, colMap = V_SALE_COLS) {
  // Group rows by invoice number (one invoice may span multiple item rows)
  const groups = {};
  for (const row of rows) {
    const inv = pickStr(row, colMap.invoiceNumber);
    if (!inv) continue;
    if (!groups[inv]) groups[inv] = [];
    groups[inv].push(row);
  }
  const records = [];
  for (const [inv, g] of Object.entries(groups)) {
    const first = g[0];
    const date = normalizeDate(pickStr(first, colMap.date));
    const partyName = pickStr(first, colMap.partyName);
    const payMode = normalizePaymentMode(pickStr(first, colMap.paymentMode));

    const itemRows = g.map(r => {
      const qty   = pickNum(r, colMap.qty) || 1;
      const rate  = pickNum(r, colMap.rate);
      const disc  = pickNum(r, colMap.discPct);
      const gst   = pickNum(r, colMap.taxRate);
      const base  = qty * rate * (1 - disc / 100);
      const tax   = base * (gst / 100);
      return {
        name: pickStr(r, colMap.itemName) || 'Item',
        qty, price: rate,
        discountPercent: disc,
        taxRate: gst,
        taxInclusive: false,
        total: base + tax,
      };
    });

    const subtotal    = itemRows.reduce((s, i) => s + i.qty * i.price * (1 - i.discountPercent / 100), 0);
    const taxAmount   = itemRows.reduce((s, i) => s + i.qty * i.price * (1 - i.discountPercent / 100) * (i.taxRate / 100), 0);

    // If Vyapar gives us a row-level total, prefer that for single-item invoices
    const rawTotal = g.length === 1 ? pickNum(first, colMap.totalAmount) : 0;
    const totalAmount = rawTotal > 0 ? rawTotal : subtotal + taxAmount;

    const statusRaw = pickStr(first, colMap.status || []).toLowerCase();
    const status = statusRaw.includes('unpaid') || statusRaw.includes('due') || statusRaw.includes('pending') ? 'unpaid' : 'paid';

    records.push({
      id: crypto.randomUUID(),
      partyName,
      date,
      invoiceNumber: inv,
      items: itemRows,
      subtotal,
      taxAmount,
      totalAmount,
      discountAmount: 0,
      paymentMode: payMode,
      type: 'Sales',
      status,
    });
  }
  return records;
}

function parseVyapaarPurchases(rows) {
  const records = parseVyapaarSales(rows, V_PURCHASE_COLS);
  return records.map(r => ({ ...r, type: 'Purchase' }));
}

function parseMBBSales(rows) {
  return parseVyapaarSales(rows, MBB_SALE_COLS);
}

function parseMBBPurchases(rows) {
  const records = parseMBBSales(rows);
  return records.map(r => ({ ...r, type: 'Purchase' }));
}

// ─── Multi-sheet file reader ─────────────────────────────────────────────────
async function readWorkbook(file) {
  const XLSX = await import('xlsx');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: false });
        const sheets = {};
        for (const name of wb.SheetNames) {
          sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' });
        }
        resolve({ sheetNames: wb.SheetNames, sheets });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// ─── Auto-detect which app exported this file ──────────────────────────────
function detectSource(sheetNames, sheets) {
  const allSheets = sheetNames.join(' ').toLowerCase();
  const allCols = Object.values(sheets).flatMap(rows => rows.length > 0 ? Object.keys(rows[0]) : []).join(' ').toLowerCase();
  if (allSheets.includes('vyapar') || allCols.includes('vyapar')) return 'vyapar';
  if (allSheets.includes('bill') && allCols.includes('customer')) return 'mybillbook';
  if (allSheets.includes('my bill book') || allSheets.includes('mybillbook')) return 'mybillbook';
  // Vyapar-style columns
  if (allCols.includes('party name') && allCols.includes('voucher number')) return 'vyapar';
  if (allCols.includes('current stock') || allCols.includes('opening stock')) return 'vyapar';
  return 'generic';
}

// ─── Match sheets to data types ──────────────────────────────────────────────
function guessSheetType(sheetName, rows) {
  const n = sheetName.toLowerCase();
  const cols = rows.length ? Object.keys(rows[0]).join(' ').toLowerCase() : '';
  if (n.includes('item') || n.includes('product') || n.includes('inventory') || cols.includes('sale price') || cols.includes('current stock')) return 'items';
  if (n.includes('customer') && !n.includes('sale') && !n.includes('invoice')) return 'customers';
  if (n.includes('vendor') || n.includes('supplier')) return 'vendors';
  if (n.includes('party') && !n.includes('sale') && !n.includes('purchase')) return 'parties';
  if ((n.includes('sale') || n.includes('invoice')) && !n.includes('purchase')) return 'sales';
  if (n.includes('purchase') || n.includes('bill')) return 'purchases';
  if (n.includes('expense')) return 'skip';
  if (n.includes('payment')) return 'skip';
  return 'unknown';
}

// ─── Source config ──────────────────────────────────────────────────────────
const SOURCES = [
  {
    id: 'vyapar',
    label: 'Vyapar',
    color: '#2563eb',
    logo: '📊',
    description: 'Import Items, Customers, Vendors, Sales (Invoices), and Purchases from Vyapar backup Excel.',
    howTo: [
      'Open Vyapar → Reports or Data → Export / Backup',
      'Export each section as Excel (.xlsx): Items, Customers, Vendors, Sales, Purchases',
      'You can upload one combined file or individual files for each section',
    ],
    sheets: ['Items (Product List)', 'Customers', 'Vendors', 'Sales (Invoice List)', 'Purchases'],
  },
  {
    id: 'mybillbook',
    label: 'My Bill Book',
    color: '#7c3aed',
    logo: '🧾',
    description: 'Import Items, Parties, and Invoices from My Bill Book Excel exports.',
    howTo: [
      'Open My Bill Book → Reports → Export to Excel',
      'Export: Products / Items, Customers, Sales Bills, Purchase Bills',
      'Upload the exported Excel files here',
    ],
    sheets: ['Products', 'Customers', 'Sales', 'Purchases'],
  },
  {
    id: 'generic',
    label: 'Generic Excel / CSV',
    color: '#5c1f22',
    logo: '📋',
    description: 'Import from any Excel or CSV. We will auto-detect columns for Items, Parties, Sales, and Purchases.',
    howTo: [
      'Upload any Excel (.xlsx) or CSV file',
      'We will try to detect data type from sheet names and column headers',
      'You can manually assign sheet types if auto-detection is wrong',
    ],
    sheets: ['Any sheet structure'],
  },
];

// ─── UI helpers ──────────────────────────────────────────────────────────────
const TYPE_COLORS = { items: '#5c1f22', customers: '#5c1f22', vendors: '#7c3aed', parties: '#7c3aed', sales: '#2563eb', purchases: '#dc2626', skip: '#5f4f47', unknown: '#5f4f47' };
const TYPE_ICONS  = { items: Package, customers: Users, vendors: Users, parties: Users, sales: TrendingUp, purchases: ShoppingCart, skip: X, unknown: Info };
const TYPE_LABELS = { items: 'Items', customers: 'Customers', vendors: 'Vendors', parties: 'Parties', sales: 'Sales', purchases: 'Purchases', skip: 'Skip', unknown: 'Unknown' };
const ALL_TYPES   = ['items', 'customers', 'vendors', 'parties', 'sales', 'purchases', 'skip'];

// ─── Main component ──────────────────────────────────────────────────────────
export default function MigrateData() {
  const { addItems, getItems } = useData();
  const { currentBusiness } = useBusiness();

  const fileInputRef = useRef();
  const [step, setStep] = useState(0); // 0=choose source, 1=upload, 2=preview, 3=import, 4=done
  const [source, setSource] = useState(null);
  const [files, setFiles] = useState([]); // { name, sheets: {...}, sheetNames: [...] }
  const [sheetAssignments, setSheetAssignments] = useState({}); // "FileName::SheetName" -> type
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');

  const bizId = currentBusiness?.id;

  const reset = () => {
    setStep(0); setSource(null); setFiles([]); setSheetAssignments({});
    setImporting(false); setProgress(0); setResults(null); setError('');
  };

  // ── File upload ────────────────────────────────────────────────────────────
  const handleFiles = useCallback(async (fileList) => {
    setError('');
    const loaded = [];
    for (const file of fileList) {
      try {
        const wb = await readWorkbook(file);
        const detectedSrc = detectSource(wb.sheetNames, wb.sheets);
        const assignments = {};
        for (const sname of wb.sheetNames) {
          assignments[`${file.name}::${sname}`] = guessSheetType(sname, wb.sheets[sname]);
        }
        loaded.push({ name: file.name, ...wb, detectedSrc });
        setSheetAssignments(prev => ({ ...prev, ...assignments }));
        if (!source) setSource(detectedSrc === 'generic' ? 'generic' : detectedSrc);
      } catch (err) {
        setError(`Failed to read "${file.name}": ${err.message}`);
      }
    }
    if (loaded.length > 0) {
      setFiles(prev => [...prev, ...loaded]);
      setStep(2);
    }
  }, [source]); // eslint-disable-line

  const onFileChange = (e) => {
    handleFiles(Array.from(e.target.files || []));
    e.target.value = '';
  };

  // ── Preview stats ─────────────────────────────────────────────────────────
  const previewCounts = React.useMemo(() => {
    const counts = { items: 0, customers: 0, vendors: 0, parties: 0, sales: 0, purchases: 0 };
    for (const f of files) {
      for (const sname of f.sheetNames) {
        const key = `${f.name}::${sname}`;
        const type = sheetAssignments[key];
        if (type && type !== 'skip' && type !== 'unknown' && counts[type] !== undefined) {
          counts[type] += (f.sheets[sname] || []).length;
        }
      }
    }
    return counts;
  }, [files, sheetAssignments]);

  // ── Import ────────────────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!bizId) return;
    setImporting(true);
    setProgress(5);

    await new Promise(r => setTimeout(r, 30));

    const results = { items: 0, parties: 0, sales: 0, purchases: 0, skipped: 0, errors: [] };

    try {
      // Collect rows by type across all files and sheets
      const byType = { items: [], customers: [], vendors: [], parties: [], sales: [], purchases: [] };
      for (const f of files) {
        for (const sname of f.sheetNames) {
          const key = `${f.name}::${sname}`;
          const type = sheetAssignments[key];
          if (!type || type === 'skip' || type === 'unknown') continue;
          const rows = f.sheets[sname] || [];
          byType[type] = [...byType[type], ...rows];
        }
      }

      // getItems returns stale React state after awaits — snapshot synchronously before any async work
      const existingItems   = Array.isArray(getItems('items'))   ? getItems('items').filter(i => i.businessId === bizId)   : [];
      const existingParties = Array.isArray(getItems('parties')) ? getItems('parties').filter(p => p.businessId === bizId) : [];

      setProgress(15);

      // ── Items ──────────────────────────────────────────────────────────────
      if (byType.items.length > 0) {
        const parsed = parseVyapaarItems(byType.items);
        const toAdd = [], toUpdate = [];
        for (const item of parsed) {
          const existing = existingItems.find(e =>
            (item.itemCode && e.itemCode === item.itemCode) ||
            e.name?.toLowerCase() === item.name?.toLowerCase()
          );
          if (existing) {
            toUpdate.push({ ...existing, ...item, id: existing.id, businessId: bizId });
          } else {
            toAdd.push({ ...item, id: crypto.randomUUID(), businessId: bizId });
          }
        }
        if (toAdd.length > 0) await addItems('items', toAdd);
        for (const upd of toUpdate) {
          try { await addItems('items', [upd]); } catch { /* ignore */ }
        }
        results.items = toAdd.length + toUpdate.length;
      }

      setProgress(35);

      // ── Parties (customers + vendors + combined) ──────────────────────────
      const allPartyRows = [
        ...parseVyapaarParties(byType.customers, 'Customer'),
        ...parseVyapaarParties(byType.vendors, 'Vendor'),
        ...parseVyapaarParties(byType.parties, 'Customer'),
      ];

      // Build name→id map from existing parties + newly imported ones (no stale getItems after await)
      const partyByName = {};
      for (const p of existingParties) {
        if (p.name) partyByName[p.name.toLowerCase()] = p.id;
      }

      if (allPartyRows.length > 0) {
        const existingCodes = new Set(existingParties.map(p => p.partyId).filter(Boolean));
        let custSerial = existingParties.filter(p => p.type === 'Customer').length + 1;
        let vendSerial = existingParties.filter(p => p.type === 'Vendor').length + 1;
        const toAdd = [], toUpdate = [];
        for (const party of allPartyRows) {
          const existing = existingParties.find(e => e.name?.toLowerCase() === party.name?.toLowerCase());
          if (existing) {
            toUpdate.push({ ...existing, ...party, id: existing.id, businessId: bizId });
            partyByName[party.name.toLowerCase()] = existing.id;
          } else {
            const partyId = generatePartyId(party.type, party.type === 'Customer' ? custSerial++ : vendSerial++, existingCodes);
            existingCodes.add(partyId);
            const newId = crypto.randomUUID();
            toAdd.push({ ...party, id: newId, partyId, businessId: bizId });
            // Add to map immediately so sales/purchases below can resolve the id
            partyByName[party.name.toLowerCase()] = newId;
          }
        }
        if (toAdd.length > 0) await addItems('parties', toAdd);
        results.parties = toAdd.length + toUpdate.length;
      }

      setProgress(55);

      // ── Sales ─────────────────────────────────────────────────────────────
      if (byType.sales.length > 0) {
        const parser = source === 'mybillbook' ? parseMBBSales : parseVyapaarSales;
        const records = parser(byType.sales).map(r => ({
          ...r,
          businessId: bizId,
          partyId: partyByName[r.partyName?.toLowerCase()] || '',
        }));
        if (records.length > 0) {
          await addItems('sales', records);
          results.sales = records.length;
        }
      }

      setProgress(75);

      // ── Purchases ─────────────────────────────────────────────────────────
      if (byType.purchases.length > 0) {
        const parser = source === 'mybillbook' ? parseMBBPurchases : parseVyapaarPurchases;
        const records = parser(byType.purchases).map(r => ({
          ...r,
          businessId: bizId,
          partyId: partyByName[r.partyName?.toLowerCase()] || '',
        }));
        if (records.length > 0) {
          await addItems('purchases', records);
          results.purchases = records.length;
        }
      }

      setProgress(100);
      setResults(results);
      setStep(4);
    } catch (err) {
      results.errors.push(err.message);
      setResults(results);
      setStep(4);
    }

    setImporting(false);
  };

  // ── Download guide ─────────────────────────────────────────────────────────
  const downloadVyapaarTemplate = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    // Items sheet
    const itemSample = [
      { 'Item Name': 'Blue Shirt (M)', 'Item Code': 'SHT001', 'Category': 'Clothing', 'Unit': 'NOS', 'Sale Price': 499, 'Purchase Price': 280, 'MRP': 599, 'GST Rate (%)': 5, 'HSN Code': '6205', 'Current Stock': 50, 'Min Stock': 10 },
      { 'Item Name': 'Red Kurti (L)',  'Item Code': 'KRT002', 'Category': 'Clothing', 'Unit': 'NOS', 'Sale Price': 650, 'Purchase Price': 380, 'MRP': 799, 'GST Rate (%)': 5, 'HSN Code': '6211', 'Current Stock': 30, 'Min Stock': 5 },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itemSample), 'Items');

    // Customers sheet
    const custSample = [
      { 'Party Name': 'Ravi Kumar',    'Party Type': 'Customer', 'Phone': '9876543210', 'GSTIN': '',               'Address': 'Chennai', 'Opening Balance': 1500 },
      { 'Party Name': 'Global Stores', 'Party Type': 'Customer', 'Phone': '8765432109', 'GSTIN': '29AABCA1234A1Z5', 'Address': 'Bangalore', 'Opening Balance': 0 },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(custSample), 'Customers');

    // Vendors sheet
    const vendSample = [
      { 'Party Name': 'ABC Traders', 'Party Type': 'Vendor', 'Phone': '7654321098', 'GSTIN': '27AAACG1234G1Z5', 'Address': 'Mumbai', 'Opening Balance': -5000 },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(vendSample), 'Vendors');

    // Sales sheet
    const salesSample = [
      { 'Party Name': 'Ravi Kumar', 'Invoice No.': 'INV-0001', 'Date': '01/07/2025', 'Item Name': 'Blue Shirt (M)', 'Qty': 2, 'Rate': 499, 'Discount (%)': 0, 'GST Rate (%)': 5, 'Payment Type': 'Cash', 'Status': 'Paid' },
      { 'Party Name': 'Ravi Kumar', 'Invoice No.': 'INV-0001', 'Date': '01/07/2025', 'Item Name': 'Red Kurti (L)',  'Qty': 1, 'Rate': 650, 'Discount (%)': 10, 'GST Rate (%)': 5, 'Payment Type': 'Cash', 'Status': 'Paid' },
      { 'Party Name': 'Global Stores', 'Invoice No.': 'INV-0002', 'Date': '02/07/2025', 'Item Name': 'Blue Shirt (M)', 'Qty': 5, 'Rate': 499, 'Discount (%)': 0, 'GST Rate (%)': 5, 'Payment Type': 'Bank Transfer', 'Status': 'Paid' },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salesSample), 'Sales');

    // Purchases sheet
    const purchSample = [
      { 'Party Name': 'ABC Traders', 'Bill No.': 'PUR-0001', 'Date': '01/06/2025', 'Item Name': 'Blue Shirt (M)', 'Qty': 100, 'Rate': 280, 'Discount (%)': 0, 'GST Rate (%)': 5, 'Payment Type': 'Bank Transfer' },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(purchSample), 'Purchases');

    XLSX.writeFile(wb, 'billdheko_migration_template.xlsx');
  };

  const totalPreviewRows = Object.values(previewCounts).reduce((a, v) => a + v, 0);
  const hasData = totalPreviewRows > 0;
  const srcConfig = SOURCES.find(s => s.id === source);

  return (
    <Box sx={{ pb: 4 }}>
      {/* Header */}
      <Box sx={{
        borderRadius: 3,
        background: '#ffffff', border: '1px solid #ece2db',
        px: { xs: 2, md: 3 }, py: { xs: 1.5, md: 2 }, mb: 3,
        display: 'flex', alignItems: 'center', gap: 1.5,
      }}>
        <Box sx={{ p: 0.875, borderRadius: 1.5, bgcolor: 'rgba(92,31,34,0.08)', display: 'flex', flexShrink: 0 }}>
          <RefreshCw size={18} color="#5c1f22" />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 800, color: '#5c1f22', fontSize: '1.05rem', lineHeight: 1.2 }}>Migrate from Another App</Typography>
          <Typography sx={{ color: '#57433e', fontSize: '0.78rem' }}>
            Import your data from Vyapar, My Bill Book, or any Excel/CSV file
          </Typography>
        </Box>
      </Box>

      {/* Stepper */}
      <Stepper activeStep={step > 0 ? step - 1 : 0} sx={{ mb: 3, display: { xs: 'none', sm: 'flex' } }}>
        {['Choose Source', 'Upload Files', 'Preview & Map', 'Import'].map(label => (
          <Step key={label}><StepLabel>{label}</StepLabel></Step>
        ))}
      </Stepper>

      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError('')}>{error}</Alert>
      )}

      {/* ── Step 0: Choose source ─────────────────────────────────────────── */}
      {step === 0 && (
        <Box>
          <Typography sx={{ fontWeight: 700, mb: 2, fontSize: '1rem' }}>Which app are you migrating from?</Typography>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {SOURCES.map(src => (
              <Grid key={src.id} size={{ xs: 12, sm: 4 }}>
                <Card
                  elevation={0}
                  onClick={() => { setSource(src.id); setStep(1); }}
                  sx={{
                    border: '2px solid',
                    borderColor: source === src.id ? src.color : 'divider',
                    borderRadius: 2.5, cursor: 'pointer', transition: 'all 0.15s',
                    '&:hover': { borderColor: src.color, boxShadow: `0 4px 16px ${alpha(src.color, 0.15)}` },
                  }}
                >
                  <CardContent sx={{ p: 2.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                      <Typography sx={{ fontSize: '2rem', lineHeight: 1 }}>{src.logo}</Typography>
                      <Box>
                        <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: src.color }}>{src.label}</Typography>
                        <Chip label="Supported" size="small" sx={{ bgcolor: alpha(src.color, 0.1), color: src.color, fontWeight: 700, fontSize: '0.65rem', height: 18 }} />
                      </Box>
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, fontSize: '0.82rem' }}>
                      {src.description}
                    </Typography>
                    <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: 'text.secondary', mb: 0.5 }}>WHAT'S IMPORTED</Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {src.sheets.map(s => (
                        <Chip key={s} label={s} size="small" variant="outlined" sx={{ fontSize: '0.68rem', height: 20 }} />
                      ))}
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1 }}>
            <Button variant="outlined" startIcon={<Download size={15} />} onClick={downloadVyapaarTemplate}
              sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}>
              Download Migration Template (Excel)
            </Button>
          </Box>
        </Box>
      )}

      {/* ── Step 1: Upload ────────────────────────────────────────────────── */}
      {step === 1 && (
        <Box>
          {/* How-to guide */}
          {srcConfig && (
            <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5, mb: 2.5 }}>
              <CardContent sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  <BookOpen size={16} color={srcConfig.color} />
                  <Typography sx={{ fontWeight: 700, fontSize: '0.875rem', color: srcConfig.color }}>
                    How to export from {srcConfig.label}
                  </Typography>
                </Box>
                <Box component="ol" sx={{ m: 0, pl: 2.5 }}>
                  {srcConfig.howTo.map((step, i) => (
                    <Typography key={i} component="li" variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>{step}</Typography>
                  ))}
                </Box>
              </CardContent>
            </Card>
          )}

          {/* Upload zone */}
          <Box
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleFiles(Array.from(e.dataTransfer.files)); }}
            sx={{
              border: '2px dashed', borderColor: 'divider', borderRadius: 3,
              py: 6, textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s',
              '&:hover': { borderColor: '#5c1f22', bgcolor: alpha('#5c1f22', 0.03) },
            }}
          >
            <Upload size={40} color="#5f4f47" style={{ marginBottom: 12 }} />
            <Typography sx={{ fontWeight: 700, fontSize: '1rem', mb: 0.5 }}>
              Drop your Excel / CSV files here
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              or click to browse — you can upload multiple files at once
            </Typography>
            <Chip label="Accepts .xlsx, .xls, .csv" size="small" sx={{ bgcolor: alpha('#5c1f22', 0.08), color: '#5c1f22', fontWeight: 700 }} />
          </Box>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" multiple style={{ display: 'none' }} onChange={onFileChange} />

          <Box sx={{ display: 'flex', gap: 1.5, mt: 2, flexWrap: 'wrap' }}>
            <Button onClick={() => setStep(0)} sx={{ textTransform: 'none' }}>← Back</Button>
            <Button variant="outlined" startIcon={<Download size={15} />} onClick={downloadVyapaarTemplate}
              sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, ml: 'auto' }}>
              Download Template
            </Button>
          </Box>
        </Box>
      )}

      {/* ── Step 2: Preview & sheet mapping ─────────────────────────────────── */}
      {step === 2 && (
        <Box>
          {/* Summary chips */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2.5 }}>
            {Object.entries(previewCounts).filter(([, v]) => v > 0).map(([type, count]) => {
              const Icon = TYPE_ICONS[type];
              return (
                <Chip key={type} icon={<Icon size={13} />} label={`${count} ${TYPE_LABELS[type]}`}
                  sx={{ fontWeight: 700, bgcolor: alpha(TYPE_COLORS[type], 0.1), color: TYPE_COLORS[type], border: `1px solid ${alpha(TYPE_COLORS[type], 0.3)}` }} />
              );
            })}
            {!hasData && (
              <Alert severity="warning" sx={{ flex: 1, borderRadius: 2 }}>
                No recognizable data found in uploaded files. Try adjusting the sheet type assignments below.
              </Alert>
            )}
          </Box>

          {/* Per-file sheet mapping */}
          {files.map(f => (
            <Card key={f.name} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5, mb: 2 }}>
              <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
                <FileText size={16} color="#5c1f22" />
                <Typography sx={{ fontWeight: 700, fontSize: '0.875rem', flex: 1 }}>{f.name}</Typography>
                <Typography variant="caption" color="text.secondary">{f.sheetNames.length} sheet{f.sheetNames.length !== 1 ? 's' : ''}</Typography>
              </Box>
              <Box sx={{ p: 1.5 }}>
                {f.sheetNames.map(sname => {
                  const key = `${f.name}::${sname}`;
                  const type = sheetAssignments[key] || 'unknown';
                  const rowCount = (f.sheets[sname] || []).length;
                  const Icon = TYPE_ICONS[type] || Info;
                  return (
                    <Box key={sname} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.875, borderBottom: '1px solid', borderColor: 'divider', '&:last-child': { borderBottom: 'none' } }}>
                      <Box sx={{ p: 0.625, borderRadius: 1, bgcolor: alpha(TYPE_COLORS[type] || '#5f4f47', 0.1), display: 'flex' }}>
                        <Icon size={14} color={TYPE_COLORS[type] || '#5f4f47'} />
                      </Box>
                      <Typography sx={{ flex: 1, fontSize: '0.82rem', fontWeight: 600 }}>{sname}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>{rowCount} rows</Typography>
                      <FormControl size="small" sx={{ minWidth: 150 }}>
                        <Select value={type} onChange={e => setSheetAssignments(prev => ({ ...prev, [key]: e.target.value }))}
                          sx={{ fontSize: '0.78rem' }}>
                          {ALL_TYPES.map(t => (
                            <MenuItem key={t} value={t} sx={{ fontSize: '0.8rem' }}>
                              {TYPE_LABELS[t]}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Box>
                  );
                })}
              </Box>
            </Card>
          ))}

          {/* Data preview */}
          {hasData && (
            <Box>
              <Typography sx={{ fontWeight: 700, mb: 1.5, fontSize: '0.9rem' }}>Data Preview (first 5 rows per sheet)</Typography>
              {files.map(f =>
                f.sheetNames.map(sname => {
                  const key = `${f.name}::${sname}`;
                  const type = sheetAssignments[key];
                  if (!type || type === 'skip' || type === 'unknown') return null;
                  const rows = (f.sheets[sname] || []).slice(0, 5);
                  if (!rows.length) return null;
                  const cols = Object.keys(rows[0]).slice(0, 10);
                  return (
                    <Accordion key={key} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '10px !important', mb: 1, '&:before': { display: 'none' } }}>
                      <AccordionSummary expandIcon={<ChevronDown size={16} />} sx={{ minHeight: 44, '&.Mui-expanded': { minHeight: 44 }, '& .MuiAccordionSummary-content': { my: 1 } }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Chip label={TYPE_LABELS[type]} size="small" sx={{ bgcolor: alpha(TYPE_COLORS[type], 0.1), color: TYPE_COLORS[type], fontWeight: 700, fontSize: '0.68rem' }} />
                          <Typography sx={{ fontSize: '0.82rem', fontWeight: 600 }}>{sname} — {f.name}</Typography>
                          <Typography variant="caption" color="text.secondary">({f.sheets[sname]?.length} rows total)</Typography>
                        </Box>
                      </AccordionSummary>
                      <AccordionDetails sx={{ p: 0, borderTop: '1px solid', borderColor: 'divider' }}>
                        <Box sx={{ overflowX: 'auto' }}>
                          <Table size="small">
                            <TableHead sx={{ bgcolor: alpha(TYPE_COLORS[type], 0.04) }}>
                              <TableRow>
                                {cols.map(c => <TableCell key={c} sx={{ fontWeight: 700, fontSize: '0.68rem', whiteSpace: 'nowrap' }}>{c}</TableCell>)}
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {rows.map((row, i) => (
                                <TableRow key={i}>
                                  {cols.map(c => <TableCell key={c} sx={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{String(row[c] ?? '')}</TableCell>)}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </Box>
                      </AccordionDetails>
                    </Accordion>
                  );
                })
              )}
            </Box>
          )}

          {/* What we'll import summary */}
          {hasData && (
            <Card elevation={0} sx={{ border: `1px solid ${alpha('#5c1f22', 0.3)}`, borderRadius: 2.5, mt: 2, bgcolor: alpha('#5c1f22', 0.03) }}>
              <CardContent sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Zap size={16} color="#5c1f22" />
                  <Typography sx={{ fontWeight: 700, fontSize: '0.875rem', color: '#5c1f22' }}>What will be imported</Typography>
                </Box>
                <Box component="ul" sx={{ m: 0, pl: 2 }}>
                  {previewCounts.items > 0 && <Typography component="li" variant="body2">{previewCounts.items} items — existing items with the same name/code will be updated, others added new</Typography>}
                  {(previewCounts.customers + previewCounts.vendors + previewCounts.parties) > 0 && <Typography component="li" variant="body2">{previewCounts.customers + previewCounts.vendors + previewCounts.parties} parties — duplicates matched by name, others added with auto-generated IDs</Typography>}
                  {previewCounts.sales > 0 && <Typography component="li" variant="body2">{previewCounts.sales} sales rows → invoices (rows with same Invoice# are grouped)</Typography>}
                  {previewCounts.purchases > 0 && <Typography component="li" variant="body2">{previewCounts.purchases} purchase rows → bills (rows with same Bill# are grouped)</Typography>}
                </Box>
              </CardContent>
            </Card>
          )}

          <Box sx={{ display: 'flex', gap: 1.5, mt: 2.5, flexWrap: 'wrap' }}>
            <Button onClick={() => setStep(1)} sx={{ textTransform: 'none' }}>← Upload More</Button>
            <Button
              variant="contained"
              disabled={!hasData || importing}
              onClick={handleImport}
              startIcon={<ArrowRight size={16} />}
              sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, background: '#5c1f22', ml: 'auto' }}
            >
              Import {totalPreviewRows} records
            </Button>
          </Box>
        </Box>
      )}

      {/* ── Step 3: Importing progress ────────────────────────────────────── */}
      {step === 2 && importing && (
        <Box sx={{ mt: 3 }}>
          <Typography sx={{ fontWeight: 700, mb: 1.5 }}>Importing data…</Typography>
          <LinearProgress variant="determinate" value={progress} sx={{ borderRadius: 1, height: 8, mb: 1 }} />
          <Typography variant="caption" color="text.secondary">{progress}% complete</Typography>
        </Box>
      )}

      {/* ── Step 4: Done ─────────────────────────────────────────────────── */}
      {step === 4 && results && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Box sx={{ display: 'inline-flex', p: 2.5, borderRadius: '50%', bgcolor: alpha('#5c1f22', 0.1), mb: 2 }}>
            <CheckCircle size={52} color="#5c1f22" />
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>Migration Complete!</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Your data has been successfully imported into BillDheko.
          </Typography>

          <Grid container spacing={2} justifyContent="center" sx={{ mb: 3, maxWidth: 600, mx: 'auto' }}>
            {[
              { label: 'Items', value: results.items,     color: '#5c1f22', icon: Package },
              { label: 'Parties', value: results.parties, color: '#7c3aed', icon: Users },
              { label: 'Sales', value: results.sales,     color: '#2563eb', icon: TrendingUp },
              { label: 'Purchases', value: results.purchases, color: '#dc2626', icon: ShoppingCart },
            ].map(({ label, value, color, icon: Icon }) => (
              <Grid key={label} size={{ xs: 6, sm: 3 }}>
                <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5, p: 1.75, textAlign: 'center' }}>
                  <Box sx={{ p: 0.75, borderRadius: 1.5, bgcolor: alpha(color, 0.1), display: 'inline-flex', mb: 0.75 }}>
                    <Icon size={18} color={color} />
                  </Box>
                  <Typography sx={{ fontWeight: 800, fontSize: '1.5rem', color, lineHeight: 1.1 }}>{value}</Typography>
                  <Typography variant="caption" color="text.secondary">{label}</Typography>
                </Card>
              </Grid>
            ))}
          </Grid>

          {results.errors?.length > 0 && (
            <Alert severity="warning" sx={{ mb: 2, borderRadius: 2, textAlign: 'left', maxWidth: 600, mx: 'auto' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>Some issues encountered:</Typography>
              {results.errors.map((e, i) => <div key={i}>{e}</div>)}
            </Alert>
          )}

          <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button onClick={reset} variant="outlined" startIcon={<RefreshCw size={15} />} sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}>
              Import Another File
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );
}
