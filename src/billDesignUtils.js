// Bill (invoice) designer — data model and defaults.
//
// A designed bill is `billPrintOptions.billDesign`:
//   { header: { heightMm, elements }, footer: { heightMm, elements },
//     marginMm, showHsnSummary, tableHeaderColor }
// The header and footer are free-form areas (elements placed by %, like the
// label designer). The items table always flows between them, so bills with
// many lines still paginate correctly.

// kind: 'text'  single-line value (prefix, font, auto-fit)
//       'block' multi-line text (font size, alignment)
//       'image' / 'code'  fixed-style blocks you place and size
//       'shape' line / box
export const BILL_ELEMENT_TYPES = [
  { type: 'logo',            label: 'Logo',              group: 'Business', kind: 'image', hint: 'Shows the logo from Settings → Profile, fitted inside the box.' },
  { type: 'businessName',    label: 'Business Name',     group: 'Business', kind: 'text' },
  { type: 'businessAddress', label: 'Business Address',  group: 'Business', kind: 'block' },
  { type: 'businessPhone',   label: 'Business Phone',    group: 'Business', kind: 'text' },
  { type: 'businessEmail',   label: 'Business Email',    group: 'Business', kind: 'text' },
  { type: 'businessGstin',   label: 'Business GSTIN',    group: 'Business', kind: 'text' },
  { type: 'docTitle',        label: 'Title (Tax Invoice)', group: 'Invoice', kind: 'text' },
  { type: 'invoiceNumber',   label: 'Invoice No.',       group: 'Invoice', kind: 'text' },
  { type: 'invoiceDate',     label: 'Date',              group: 'Invoice', kind: 'text' },
  { type: 'invoiceTime',     label: 'Time',              group: 'Invoice', kind: 'text' },
  { type: 'dueDate',         label: 'Due Date',          group: 'Invoice', kind: 'text' },
  { type: 'placeOfSupply',   label: 'Place of Supply',   group: 'Invoice', kind: 'text' },
  { type: 'supplyType',      label: 'Supply Type (GST)', group: 'Invoice', kind: 'text' },
  { type: 'paymentMode',     label: 'Payment Mode',      group: 'Invoice', kind: 'text' },
  { type: 'billedBy',        label: 'Billed By',         group: 'Invoice', kind: 'text' },
  { type: 'partyBlock',      label: 'Bill To (full)',    group: 'Customer / Vendor', kind: 'block' },
  { type: 'partyName',       label: 'Party Name',        group: 'Customer / Vendor', kind: 'text' },
  { type: 'partyAddress',    label: 'Party Address',     group: 'Customer / Vendor', kind: 'block' },
  { type: 'partyPhone',      label: 'Party Phone',       group: 'Customer / Vendor', kind: 'text' },
  { type: 'partyGstin',      label: 'Party GSTIN',       group: 'Customer / Vendor', kind: 'text' },
  { type: 'totals',          label: 'Totals Table',      group: 'Amounts', kind: 'block', hint: 'Subtotal, discount, GST, charges, round off, total and balance due. Use Font size to scale it; it gets taller when there is an advance.' },
  { type: 'grandTotal',      label: 'Grand Total',       group: 'Amounts', kind: 'text' },
  { type: 'balanceDue',      label: 'Balance Due',       group: 'Amounts', kind: 'text' },
  { type: 'amountInWords',   label: 'Amount in Words',   group: 'Amounts', kind: 'block' },
  { type: 'bankDetails',     label: 'Bank Details',      group: 'Payment', kind: 'block', hint: 'Bank and UPI details from Settings → Profile. Use Font size to scale it.' },
  { type: 'upiQr',           label: 'UPI Payment QR',    group: 'Payment', kind: 'code', square: true, hint: 'Scan-to-pay QR built from your UPI ID. Stays square.' },
  { type: 'terms',           label: 'Terms & Conditions', group: 'Other', kind: 'block' },
  { type: 'signature',       label: 'Signature',         group: 'Other', kind: 'block' },
  { type: 'notes',           label: 'Bill Notes',        group: 'Other', kind: 'block' },
  { type: 'loyalty',         label: 'Loyalty Points',    group: 'Other', kind: 'block' },
  { type: 'customText',      label: 'Custom Text',       group: 'Other', kind: 'text' },
  { type: 'line',            label: 'Line',              group: 'Shape', kind: 'shape' },
  { type: 'box',             label: 'Box / Border',      group: 'Shape', kind: 'shape' },
];

export const billKind = (type) => BILL_ELEMENT_TYPES.find((t) => t.type === type)?.kind || 'text';

const PREFIX = {
  businessPhone: 'Ph: ', businessEmail: '', businessGstin: 'GSTIN: ', invoiceNumber: 'Invoice #: ',
  invoiceDate: 'Date: ', invoiceTime: 'Time: ', dueDate: 'Due: ', placeOfSupply: 'Place of Supply: ',
  supplyType: 'Supply: ', paymentMode: 'Mode: ', billedBy: 'Billed by: ', partyPhone: 'Ph: ',
  partyGstin: 'GSTIN: ', grandTotal: 'Total: ', balanceDue: 'Balance Due: ',
};
// bankDetails / loyalty: 11pt = their standard size (scaled via CSS zoom).
const FONT = { businessName: 18, docTitle: 15, grandTotal: 13, partyName: 12, balanceDue: 11, bankDetails: 11, loyalty: 11 };
const BOLD = new Set(['businessName', 'docTitle', 'grandTotal', 'partyName', 'balanceDue']);

export const newBillElement = (type) => {
  const kind = billKind(type);
  const base = {
    id: `be_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    type, x: 10, y: 10, w: 40, h: 18,
    autoFit: false, fontSize: FONT[type] || (kind === 'block' ? 9 : 10),
    bold: BOLD.has(type), italic: false, align: 'left', vAlign: kind === 'block' ? 'top' : 'center',
    color: '', prefix: PREFIX[type] ?? '',
  };
  if (type === 'customText') return { ...base, text: 'Your text' };
  if (type === 'line') return { ...base, x: 0, y: 50, w: 100, h: 4, thickness: 0.3 };
  if (type === 'box') return { ...base, x: 0, y: 0, w: 100, h: 100, thickness: 0.3 };
  if (type === 'totals') return { ...base, w: 38, h: 60 };
  if (type === 'bankDetails') return { ...base, w: 40, h: 45 };
  if (type === 'signature') return { ...base, w: 35, h: 35, align: 'right', vAlign: 'bottom' };
  if (type === 'logo') return { ...base, w: 15, h: 40 };
  return base;
};

// Starting design — close to the Classic theme, so switching to the
// designer begins from a normal-looking bill.
const pageTemplate = () => {
  const el = (type, box) => ({ ...newBillElement(type), ...box });
  return {
    marginMm: 8,
    showHsnSummary: true,
    header: {
      heightMm: 62,
      elements: [
        el('logo', { x: 0, y: 0, w: 14, h: 30 }),
        el('businessName', { x: 16, y: 0, w: 50, h: 14 }),
        el('businessAddress', { x: 16, y: 15, w: 50, h: 14 }),
        el('businessPhone', { x: 16, y: 30, w: 24, h: 8, fontSize: 9 }),
        el('businessGstin', { x: 41, y: 30, w: 27, h: 8, fontSize: 9 }),
        el('docTitle', { x: 62, y: 0, w: 38, h: 13, align: 'right' }),
        el('invoiceNumber', { x: 62, y: 15, w: 38, h: 8, align: 'right' }),
        el('invoiceDate', { x: 62, y: 24, w: 38, h: 8, align: 'right' }),
        el('dueDate', { x: 62, y: 33, w: 38, h: 8, align: 'right' }),
        el('line', { x: 0, y: 42, w: 100, h: 3 }),
        el('partyBlock', { x: 0, y: 47, w: 58, h: 52, fontSize: 9.5 }),
        el('placeOfSupply', { x: 60, y: 49, w: 40, h: 8, align: 'right', fontSize: 9 }),
        el('supplyType', { x: 60, y: 58, w: 40, h: 8, align: 'right', fontSize: 9 }),
      ],
    },
    footer: {
      heightMm: 92,
      elements: [
        el('bankDetails', { x: 0, y: 0, w: 42, h: 46 }),
        el('upiQr', { x: 43, y: 2, w: 12, h: 25 }),
        el('totals', { x: 58, y: 0, w: 42, h: 62 }),
        el('amountInWords', { x: 0, y: 50, w: 56, h: 11, fontSize: 8.5 }),
        el('line', { x: 0, y: 65, w: 100, h: 3 }),
        el('terms', { x: 0, y: 70, w: 56, h: 29, fontSize: 8 }),
        el('signature', { x: 60, y: 70, w: 40, h: 29 }),
      ],
    },
  };
};

// Receipt-shaped starting design for thermal paper: everything stacked and
// centred, compact item list, totals full width. Font sizes shrink for 58mm.
const receiptTemplate = (paperSize) => {
  const f = paperSize === 'Thermal 58mm' ? 0.8 : 1;
  const el = (type, box) => ({ ...newBillElement(type), ...box, fontSize: +((box.fontSize ?? newBillElement(type).fontSize) * f).toFixed(1) });
  return {
    marginMm: 2,
    showHsnSummary: false,
    table: { style: 'receipt', fontSize: +(8.5 * f).toFixed(1), stripes: false },
    header: {
      heightMm: 42,
      elements: [
        el('businessName', { x: 0, y: 0, w: 100, h: 16, align: 'center', fontSize: 12, autoFit: true }),
        el('businessAddress', { x: 0, y: 17, w: 100, h: 14, align: 'center', fontSize: 7.5 }),
        el('businessPhone', { x: 0, y: 32, w: 100, h: 10, align: 'center', fontSize: 8 }),
        el('businessGstin', { x: 0, y: 43, w: 100, h: 10, align: 'center', fontSize: 8 }),
        el('line', { x: 0, y: 55, w: 100, h: 3, color: '#000' }),
        el('docTitle', { x: 0, y: 59, w: 100, h: 12, align: 'center', fontSize: 10, color: '#000' }),
        el('invoiceNumber', { x: 0, y: 73, w: 55, h: 10, fontSize: 8, prefix: '#' }),
        el('invoiceDate', { x: 55, y: 73, w: 45, h: 10, align: 'right', fontSize: 8, prefix: '' }),
        el('partyName', { x: 0, y: 85, w: 100, h: 12, fontSize: 8.5, prefix: 'To: ', bold: true }),
      ],
    },
    footer: {
      heightMm: 78,
      elements: [
        el('line', { x: 0, y: 0, w: 100, h: 2, color: '#000' }),
        el('totals', { x: 0, y: 3, w: 100, h: 60, fontSize: 8 }),
        el('terms', { x: 0, y: 65, w: 100, h: 24, fontSize: 7 }),
        el('customText', { x: 0, y: 90, w: 100, h: 9, align: 'center', fontSize: 8, text: 'Thank you! Visit again.' }),
      ],
    },
  };
};

// Thermal and dot-matrix sizes normally use the built-in receipt layout; a
// design only takes over there once its "Use this design" switch is on.
export const RECEIPT_SIZES = new Set(['Thermal 80mm', 'Thermal 58mm', 'Dot Matrix']);
export const isReceiptSize = (paperSize) => RECEIPT_SIZES.has(paperSize);
const isThermal = (paperSize) => paperSize === 'Thermal 80mm' || paperSize === 'Thermal 58mm';

export const templateBillDesign = (paperSize = 'A4') => (isThermal(paperSize) ? receiptTemplate(paperSize) : pageTemplate());

export const resolveBillDesign = (saved, paperSize = 'A4') => {
  const base = templateBillDesign(paperSize);
  if (!saved || !saved.header || !saved.footer) return base;
  return {
    ...base,
    ...saved,
    header: { heightMm: Number(saved.header.heightMm) || base.header.heightMm, elements: saved.header.elements || [] },
    footer: { heightMm: Number(saved.footer.heightMm) || base.footer.heightMm, elements: saved.footer.elements || [] },
    table: { ...(base.table || {}), ...(saved.table || {}) },
  };
};

// Saved design for a paper size: its own entry in billDesigns, else (page
// sizes only) the older single billDesign.
export const savedDesignFor = (opts, paperSize) =>
  opts?.billDesigns?.[paperSize] || (isReceiptSize(paperSize) ? null : opts?.billDesign) || null;

// Whether printing on this paper size should use the designed layout.
export const usesDesigner = (opts, paperSize) =>
  isReceiptSize(paperSize) ? !!savedDesignFor(opts, paperSize)?.enabled : opts?.invoiceTheme === 'designer';

// Printable page width (mm) per paper size (Dot Matrix = 240mm feed minus
// its 6mm print margins).
export const PAPER_WIDTH_MM = { A3: 297, A4: 210, A5: 148, A6: 105, Letter: 216, Legal: 216, Executive: 184, Statement: 140, 'Half Page': 210, 'Thermal 80mm': 80, 'Thermal 58mm': 58, 'Dot Matrix': 228 };

// Width (mm) of the free-form areas for a paper size and side margin.
export const billBandWidthMm = (paperSize, marginMm) =>
  (PAPER_WIDTH_MM[paperSize] || 210) - 2 * (Number(marginMm) || 0);

// Everything BillBand needs to render real values for one bill.
export const buildBillCtx = ({ transaction, business, opts, isSale, headerTitle, showBalanceSection, currentBillTotal, balanceNum, openingBalance }) => ({
  transaction, business, opts, isSale, headerTitle, showBalanceSection, currentBillTotal, balanceNum, openingBalance,
  acc: opts.themeColor || '#5c1f22',
});
