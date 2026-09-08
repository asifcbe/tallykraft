// xlsx (~140KB gzipped) is dynamically imported inside each export function
// below instead of statically at module load, so pages that import from this
// file (Items, Parties, Sales, Settings, etc.) don't ship it unless the user
// actually triggers an export.

// ── Excel export ──────────────────────────────────────────────────────────────

export const exportToExcel = async (rows, columns, filename) => {
  const XLSX = await import('xlsx');
  const data = rows.map(row => {
    const out = {};
    columns.forEach(col => {
      out[col.header] = col.value(row);
    });
    return out;
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, filename.split('.')[0].slice(0, 31));
  XLSX.writeFile(wb, filename);
};

// ── Column definitions per entity ────────────────────────────────────────────

export const ITEM_COLUMNS = [
  { header: 'Name', value: r => r.name },
  { header: 'Item Code', value: r => r.itemCode || '' },
  { header: 'Category', value: r => r.category || '' },
  { header: 'Color', value: r => r.color || '' },
  { header: 'Size', value: r => r.size || '' },
  { header: 'Description', value: r => r.description || '' },
  { header: 'Unit', value: r => r.unit || 'NOS' },
  { header: 'Sale Price', value: r => r.salePrice || 0 },
  { header: 'MRP', value: r => r.mrp || 0 },
  { header: 'Purchase Price', value: r => r.purchasePrice || 0 },
  { header: 'Tax Rate', value: r => r.taxRate || 0 },
  { header: 'HSN Code', value: r => r.hsnCode || '' },
  { header: 'Stock', value: r => r.stock || 0 },
  { header: 'Min Stock', value: r => r.minStock || 0 },
  { header: 'Barcode', value: r => r.barcode || '' },
];

export const PARTY_COLUMNS = [
  { header: 'Name', value: r => r.name },
  { header: 'Type', value: r => r.type },
  { header: 'Country Code', value: r => r.countryCode || '+91' },
  { header: 'Phone', value: r => r.phone || '' },
  { header: 'Category', value: r => r.category || '' },
  { header: 'Email', value: r => r.email || '' },
  { header: 'GST Number', value: r => r.gstNumber || '' },
  { header: 'Address', value: r => r.address || '' },
  { header: 'State', value: r => r.state || '' },
  { header: 'Additional Address', value: r => r.additionalAddress || '' },
  { header: 'Description', value: r => r.description || '' },
  { header: 'Opening Balance', value: r => r.openingBalance ?? r.balance ?? 0 },
  { header: 'Bank Name', value: r => r.bankName || '' },
  { header: 'Account Holder', value: r => r.accountHolderName || '' },
  { header: 'Account Number', value: r => r.accountNumber || '' },
  { header: 'IFSC Code', value: r => r.ifscCode || '' },
];

// Sales export — one row per line item, matching the import format so export→import is round-trippable
export const SALE_COLUMNS = null; // expanded per-item below — use exportSalesToExcel instead

export const PURCHASE_COLUMNS = null; // expanded per-item below — use exportPurchasesToExcel instead

// Expand a list of sale/purchase transactions into one row per line item
const expandTransactionRows = (transactions, partyLabel, invoiceLabel) =>
  transactions.flatMap((r) => {
    const invNo = r.invoiceNumber || r.billNumber || String(r.id || '').slice(0, 8);
    const partyName = r.partyName || r.vendorName || '';
    const date = r.date || '';
    const payMode = r.paymentMode || '';
    const status = r.status || '';
    const items = r.items && r.items.length > 0 ? r.items : [{ name: '', qty: 1, price: 0, discountPercent: 0, taxRate: 0 }];
    return items.map((it) => ({
      [partyLabel]: partyName,
      'Date': date,
      [invoiceLabel]: invNo,
      'Item Name': it.name || '',
      'Qty': it.qty || 1,
      'Rate': it.price || 0,
      'Disc%': it.discountPercent || it.discPct || 0,
      'GST%': it.taxRate || 0,
      'Payment Mode': payMode,
      'Status': status,
    }));
  });

export const exportSalesToExcel = async (transactions, filename = 'sales_export.xlsx') => {
  const XLSX = await import('xlsx');
  const data = expandTransactionRows(transactions, 'Customer Name', 'Invoice#');
  const ws = XLSX.utils.json_to_sheet(data, { header: ['Customer Name', 'Date', 'Invoice#', 'Item Name', 'Qty', 'Rate', 'Disc%', 'GST%', 'Payment Mode', 'Status'] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sales');
  XLSX.writeFile(wb, filename);
};

export const exportPurchasesToExcel = async (transactions, filename = 'purchases_export.xlsx') => {
  const XLSX = await import('xlsx');
  const data = expandTransactionRows(transactions, 'Vendor Name', 'Bill#');
  const ws = XLSX.utils.json_to_sheet(data, { header: ['Vendor Name', 'Date', 'Bill#', 'Item Name', 'Qty', 'Rate', 'Disc%', 'GST%', 'Payment Mode', 'Status'] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Purchases');
  XLSX.writeFile(wb, filename);
};

export const EXPENSE_COLUMNS = [
  { header: 'Date', value: r => r.date || '' },
  { header: 'Category', value: r => r.category || '' },
  { header: 'Description', value: r => r.description || r.note || '' },
  { header: 'Amount', value: r => r.amount || 0 },
  { header: 'Payment Mode', value: r => r.paymentMode || '' },
];

// ── Tally XML export ──────────────────────────────────────────────────────────

const esc = (str) => String(str || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const fmt = (n) => Number(n || 0).toFixed(2);

const tallyDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
};

const buildSalesVoucher = (sale) => {
  const date = tallyDate(sale.date);
  const partyName = esc(sale.partyName || 'Cash');
  const total = fmt(sale.totalAmount || sale.total || sale.grandTotal || 0);
  const items = sale.items || [];

  const inventoryEntries = items.map(item => `
          <ALLINVENTORYENTRIES.LIST>
            <STOCKITEMNAME>${esc(item.name)}</STOCKITEMNAME>
            <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
            <RATE>${fmt(item.price)}/NOS</RATE>
            <AMOUNT>${fmt((item.qty || 1) * (item.price || 0))}</AMOUNT>
            <ACTUALQTY>${item.qty || 1} NOS</ACTUALQTY>
            <BILLEDQTY>${item.qty || 1} NOS</BILLEDQTY>
            <BATCHALLOCATIONS.LIST>
              <GODOWNNAME>Main Location</GODOWNNAME>
              <BATCHNAME>Primary Batch</BATCHNAME>
              <AMOUNT>${fmt((item.qty || 1) * (item.price || 0))}</AMOUNT>
              <ACTUALQTY>${item.qty || 1} NOS</ACTUALQTY>
              <BILLEDQTY>${item.qty || 1} NOS</BILLEDQTY>
            </BATCHALLOCATIONS.LIST>
            <ACCOUNTINGALLOCATIONS.LIST>
              <LEDGERNAME>Sales</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${fmt((item.qty || 1) * (item.price || 0))}</AMOUNT>
            </ACCOUNTINGALLOCATIONS.LIST>
          </ALLINVENTORYENTRIES.LIST>`).join('');

  return `
      <VOUCHER REMOTEID="${esc(sale.id)}" VCHTYPE="Sales" ACTION="Create">
        <DATE>${date}</DATE>
        <NARRATION>${esc(sale.notes || '')}</NARRATION>
        <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
        <VOUCHERNUMBER>${esc(sale.invoiceNumber || String(sale.id || '').slice(0, 8))}</VOUCHERNUMBER>
        <PARTYLEDGERNAME>${partyName}</PARTYLEDGERNAME>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${partyName}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
          <AMOUNT>-${total}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>Sales</LEDGERNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <AMOUNT>${total}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>${inventoryEntries}
      </VOUCHER>`;
};

const buildPurchaseVoucher = (purchase) => {
  const date = tallyDate(purchase.date);
  const partyName = esc(purchase.partyName || purchase.vendorName || 'Cash');
  const total = fmt(purchase.totalAmount || purchase.total || purchase.grandTotal || 0);
  const items = purchase.items || [];

  const inventoryEntries = items.map(item => `
          <ALLINVENTORYENTRIES.LIST>
            <STOCKITEMNAME>${esc(item.name)}</STOCKITEMNAME>
            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
            <RATE>${fmt(item.price)}/NOS</RATE>
            <AMOUNT>-${fmt((item.qty || 1) * (item.price || 0))}</AMOUNT>
            <ACTUALQTY>${item.qty || 1} NOS</ACTUALQTY>
            <BILLEDQTY>${item.qty || 1} NOS</BILLEDQTY>
            <BATCHALLOCATIONS.LIST>
              <GODOWNNAME>Main Location</GODOWNNAME>
              <BATCHNAME>Primary Batch</BATCHNAME>
              <AMOUNT>-${fmt((item.qty || 1) * (item.price || 0))}</AMOUNT>
              <ACTUALQTY>${item.qty || 1} NOS</ACTUALQTY>
              <BILLEDQTY>${item.qty || 1} NOS</BILLEDQTY>
            </BATCHALLOCATIONS.LIST>
            <ACCOUNTINGALLOCATIONS.LIST>
              <LEDGERNAME>Purchase</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-${fmt((item.qty || 1) * (item.price || 0))}</AMOUNT>
            </ACCOUNTINGALLOCATIONS.LIST>
          </ALLINVENTORYENTRIES.LIST>`).join('');

  return `
      <VOUCHER REMOTEID="${esc(purchase.id)}" VCHTYPE="Purchase" ACTION="Create">
        <DATE>${date}</DATE>
        <NARRATION>${esc(purchase.notes || '')}</NARRATION>
        <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
        <VOUCHERNUMBER>${esc(purchase.billNumber || String(purchase.id || '').slice(0, 8))}</VOUCHERNUMBER>
        <PARTYLEDGERNAME>${partyName}</PARTYLEDGERNAME>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${partyName}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <AMOUNT>${total}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>Purchase</LEDGERNAME>
          <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
          <AMOUNT>-${total}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>${inventoryEntries}
      </VOUCHER>`;
};

export const exportToTallyXML = ({ sales = [], purchases = [], businessName = 'My Business', filename }) => {
  const voucherXML = [
    ...sales.map(buildSalesVoucher),
    ...purchases.map(buildPurchaseVoucher),
  ].join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${esc(businessName)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">${voucherXML}
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'tally_export.xml';
  a.click();
  URL.revokeObjectURL(url);
};

// ── Full business export (Settings page) ─────────────────────────────────────

const safeSheetName = (name) =>
  String(name || 'Sheet').replace(/[:\\/?*[\]]/g, '').slice(0, 31);

const rowsToSheet = (XLSX, rows, columns) => {
  const data = rows.map(row => {
    const out = {};
    columns.forEach(col => { out[col.header] = col.value(row); });
    return out;
  });
  return XLSX.utils.json_to_sheet(data);
};

// Build columns dynamically from whatever keys exist in the rows
const dynamicColumns = (rows) => {
  const keys = new Set();
  rows.forEach(row => Object.keys(row).forEach(k => {
    if (!['id', 'businessId', 'createdAt', 'updatedAt'].includes(k)) keys.add(k);
  }));
  return [...keys].map(k => ({ header: k, value: r => {
    const v = r[k];
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  }}));
};

export const exportFullBusinessToExcel = async ({ businessName, businessId, allData, customSections = [] }) => {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const used = new Set();

  const addSheet = (rows, columns, sheetName) => {
    if (!rows?.length) return;
    const name = safeSheetName(sheetName);
    const unique = used.has(name) ? `${name.slice(0, 28)}_${used.size}` : name;
    used.add(unique);
    XLSX.utils.book_append_sheet(wb, rowsToSheet(XLSX, rows, columns), unique);
  };

  const biz = (table) => (allData[table] || []).filter(r => r.businessId === businessId);

  // Known tables with curated columns
  addSheet(biz('items'),    ITEM_COLUMNS,   'Items');
  addSheet(biz('parties'),  PARTY_COLUMNS,  'Parties');
  addSheet(biz('expenses'), EXPENSE_COLUMNS, 'Expenses');

  // Sales — expanded one row per line item
  const salesRows = biz('sales');
  if (salesRows.length) {
    const data = expandTransactionRows(salesRows, 'Customer Name', 'Invoice#');
    const ws = XLSX.utils.json_to_sheet(data, { header: ['Customer Name', 'Date', 'Invoice#', 'Item Name', 'Qty', 'Rate', 'Disc%', 'GST%', 'Payment Mode', 'Status'] });
    XLSX.utils.book_append_sheet(wb, ws, 'Sales');
    used.add('Sales');
  }

  // Purchases — expanded one row per line item
  const purchaseRows = biz('purchases');
  if (purchaseRows.length) {
    const data = expandTransactionRows(purchaseRows, 'Vendor Name', 'Bill#');
    const ws = XLSX.utils.json_to_sheet(data, { header: ['Vendor Name', 'Date', 'Bill#', 'Item Name', 'Qty', 'Rate', 'Disc%', 'GST%', 'Payment Mode', 'Status'] });
    XLSX.utils.book_append_sheet(wb, ws, 'Purchases');
    used.add('Purchases');
  }

  // Custom sections — one sheet per section
  const customRecords = biz('customSectionRecords');
  if (customRecords.length) {
    customSections.forEach(section => {
      const sectionRows = customRecords.filter(r => r.sectionId === section.id);
      if (!sectionRows.length) return;

      // Flatten: move r.fields.* up to top level for readability
      const flat = sectionRows.map(r => {
        const { fields = {}, sectionId: _s, businessId: _b, id: _id, ...rest } = r;
        return { ...rest, ...fields };
      });

      // Build columns from field definitions (preserves order) + fallback to dynamic
      let cols;
      const allFields = section.tabs
        ? section.tabs.flatMap(t => t.fields || [])
        : (section.fields || []);
      if (allFields.length) {
        cols = [
          { header: 'Date', value: r => r.date || '' },
          { header: 'Party', value: r => r.partyName || '' },
          ...allFields.map(f => ({ header: f.name || f.id, value: r => {
            const v = r[f.id];
            if (v === null || v === undefined) return '';
            if (typeof v === 'object') return JSON.stringify(v);
            return v;
          }})),
          { header: 'Notes', value: r => r.notes || '' },
        ];
      } else {
        cols = dynamicColumns(flat);
      }
      addSheet(flat, cols, section.name);
    });
  }

  // Any remaining known tables with data (payments, estimates, etc.) — dynamic columns
  const remaining = [
    'payments', 'estimates', 'creditNotes', 'debitNotes',
    'deliveryNotes', 'journalEntries', 'opticals', 'opticalOrders',
  ];
  remaining.forEach(table => {
    const rows = biz(table);
    if (!rows.length) return;
    const cols = dynamicColumns(rows);
    const label = table.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
    addSheet(rows, cols, label);
  });

  XLSX.writeFile(wb, `${safeSheetName(businessName || 'business')}_export.xlsx`);
};
