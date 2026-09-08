import React, { forwardRef } from 'react';
import { buildUpiUri } from './upiUtils';
import UpiQrImage from './UpiQrImage';

// ── Named exports ─────────────────────────────────────────────────────────────

export const INVOICE_THEMES = [
  { value: 'classic',   label: 'Classic',   desc: 'Bordered table, clean header, timeless layout' },
  { value: 'modern',    label: 'Modern',    desc: 'Colored header band, alternating rows, rounded boxes' },
  { value: 'compact',   label: 'Compact',   desc: 'Dense layout, fits more items per page' },
  { value: 'elegant',   label: 'Elegant',   desc: 'Serif font, left accent strip, premium feel' },
  { value: 'bold',      label: 'Bold',      desc: 'Dark header, high contrast, strong branding' },
  { value: 'minimal',   label: 'Minimal',   desc: 'No borders, pure typography, lots of whitespace' },
  { value: 'corporate', label: 'Corporate', desc: 'Two-column header, bordered table, professional' },
  { value: 'vivid',     label: 'Vivid',     desc: 'Accent-filled table header, colorful totals box' },
  { value: 'receipt',   label: 'Receipt',   desc: 'Clean receipt-style, center-aligned header, minimal borders' },
  { value: 'premium',   label: 'Premium',   desc: 'Gradient header, gold accent line, luxury feel' },
  { value: 'mono',      label: 'Mono',      desc: 'Black & white, heavy typographic hierarchy, no color' },
  { value: 'stripe',    label: 'Stripe',    desc: 'Left accent stripe per row, clean Stripe-invoice feel' },
  { value: 'custom',    label: 'Custom',    desc: 'Build your own layout — drag to reorder and toggle sections' },
];

// Custom-theme section building blocks — each renders as its own row, in
// whatever order + on/off state the user set via the drag-and-drop builder
// in Settings (config.billPrintOptions.customTemplate.sections). Order here
// is only the fallback default for a business that hasn't customized yet.
// hsnSummary and bankDetails are two independent, separately toggleable/
// reorderable sections — but when both land next to each other in the final
// enabled order they still render as one paired row (Bank Details left, HSN
// Summary right, via HsnBankRow) rather than one on top of the other, so a
// user who wants both still gets the compact side-by-side layout for free.
export const CUSTOM_TEMPLATE_SECTIONS = [
  { key: 'header',      label: 'Header',              desc: 'Logo, business info, invoice title/number/date' },
  { key: 'billTo',      label: 'Bill To / From',      desc: 'Party details, place of supply' },
  { key: 'items',       label: 'Items Table',         desc: 'Line items with qty, rate, tax' },
  { key: 'totals',      label: 'Totals',               desc: 'Subtotal, tax, discount, grand total' },
  { key: 'bankDetails', label: 'Bank Details',        desc: 'Bank account, UPI ID and payment QR code' },
  { key: 'hsnSummary',  label: 'HSN/SAC Tax Summary', desc: 'Tax breakdown table by HSN code and rate' },
  { key: 'loyalty',     label: 'Loyalty Points',       desc: 'Points earned/redeemed (only if used on the bill)' },
  { key: 'terms',       label: 'Terms & Conditions',  desc: 'Your printed terms text' },
  { key: 'signature',   label: 'Signature',            desc: 'Authorized signatory block' },
];
export const DEFAULT_CUSTOM_TEMPLATE = {
  sections: CUSTOM_TEMPLATE_SECTIONS.map(s => ({ key: s.key, enabled: true })),
};
// Backfills a saved customTemplate with any new section keys added since it
// was last saved (new key → appended, enabled by default) and drops any
// stale/unknown keys — same defensive pattern as resolveColumnOrder(). Also
// migrates the old combined 'hsnBank' key (pre-split) to the two separate
// 'bankDetails'/'hsnSummary' keys it was replaced by, in the same slot and
// carrying over its enabled state, so a template saved before the split
// doesn't silently lose both sections.
export const resolveCustomTemplate = (saved) => {
  const savedSections = Array.isArray(saved?.sections) ? saved.sections : [];
  const validKeys = new Set(CUSTOM_TEMPLATE_SECTIONS.map(s => s.key));
  const expanded = savedSections.flatMap(s => {
    if (s?.key === 'hsnBank') return [{ key: 'bankDetails', enabled: s.enabled }, { key: 'hsnSummary', enabled: s.enabled }];
    return [s];
  });
  const kept = expanded.filter(s => s && validKeys.has(s.key));
  const keptKeys = new Set(kept.map(s => s.key));
  const missing = CUSTOM_TEMPLATE_SECTIONS.filter(s => !keptKeys.has(s.key)).map(s => ({ key: s.key, enabled: true }));
  return { sections: [...kept, ...missing] };
};

export const PAPER_SIZES = [
  { value: 'A3',           label: 'A3  (297×420mm)',          group: 'Standard' },
  { value: 'A4',           label: 'A4  (210×297mm)',          group: 'Standard' },
  { value: 'A5',           label: 'A5  (148×210mm)',          group: 'Standard' },
  { value: 'A6',           label: 'A6  (105×148mm)',          group: 'Standard' },
  { value: 'Letter',       label: 'Letter (216×279mm)',       group: 'Standard' },
  { value: 'Legal',        label: 'Legal (216×356mm)',        group: 'Standard' },
  { value: 'Executive',    label: 'Executive (184×267mm)',    group: 'Special' },
  { value: 'Statement',    label: 'Statement (140×216mm)',    group: 'Special' },
  { value: 'Half Page',    label: 'Half Page (A5 Landscape)', group: 'Special' },
  { value: 'Dot Matrix',   label: 'Dot Matrix (132 col)',     group: 'Special' },
  { value: 'Thermal 80mm', label: 'Thermal 80mm',             group: 'Thermal' },
  { value: 'Thermal 58mm', label: 'Thermal 58mm',             group: 'Thermal' },
];

// Pixel width at 96dpi (1mm ≈ 3.7795px) — shared source of truth for every
// scaled preview / thumbnail across the app, so adding a paper size here is
// enough for previews everywhere to render it at the correct proportions.
export const PAPER_PX_WIDTHS = {
  'A3': 1123, 'A4': 794, 'A5': 559, 'A6': 397,
  'Letter': 816, 'Legal': 816,
  'Executive': 695, 'Statement': 529,
  'Half Page': 794,
  'Thermal 80mm': 302, 'Thermal 58mm': 220,
};
export const getPaperWidthPx = (paperSize) => PAPER_PX_WIDTHS[paperSize] || PAPER_PX_WIDTHS['A4'];

// mm width — shared source of truth for PDF export (jsPDF format/width) and any
// @page CSS that needs an explicit mm value rather than a named format string.
export const PAPER_MM_WIDTHS = {
  'A3': 297, 'A4': 210, 'A5': 148, 'A6': 105,
  'Letter': 216, 'Legal': 216,
  'Executive': 184, 'Statement': 140,
  'Half Page': 210,
  'Thermal 80mm': 80, 'Thermal 58mm': 58,
};
export const getPaperWidthMm = (paperSize) => PAPER_MM_WIDTHS[paperSize] || PAPER_MM_WIDTHS['A4'];

// jsPDF named format — 'a3'/'a4'/'a5'/'a6'/'letter'/'legal' are recognized by
// jsPDF directly; everything else (Executive, Statement, Half Page, Thermal)
// falls back to an explicit [width, height] array by the caller.
export const getJsPdfFormat = (paperSize) => {
  const named = { 'A3': 'a3', 'A4': 'a4', 'A5': 'a5', 'A6': 'a6', 'Letter': 'letter', 'Legal': 'legal' };
  return named[paperSize] || null;
};

export const THEME_COLORS = [
  { label: 'Teal',    value: '#334155' },
  { label: 'Indigo',  value: '#334155' },
  { label: 'Blue',    value: '#2563eb' },
  { label: 'Emerald', value: '#334155' },
  { label: 'Purple',  value: '#7c3aed' },
  { label: 'Rose',    value: '#e11d48' },
  { label: 'Orange',  value: '#ea580c' },
  { label: 'Amber',   value: '#d97706' },
  { label: 'Slate',   value: '#475569' },
  { label: 'Black',   value: '#1a1a1a' },
];

// Item maths (intra-state, no invoice-level discount):
//   Office Chair:  2 × 3,499  × (1 - 5/100) = 6,648.10 taxable → ×1.18 = 7,844.76
//   Writing Desk:  1 × 12,500                = 12,500.00 taxable → ×1.18 = 14,750.00
//   Laptop Stand:  3 × 1,299                 =  3,897.00 taxable → ×1.12 =  4,364.64
//   USB Hub:       5 × 649                   =  3,245.00 taxable → ×1.18 =  3,829.10
//   Subtotal (taxable): 6,648.10 + 12,500 + 3,897 + 3,245 = 26,290.10
//   Tax: 6,648.10×0.18 + 12,500×0.18 + 3,897×0.12 + 3,245×0.18
//      = 1,196.66 + 2,250 + 467.64 + 584.10 = 4,498.40
//   Total: 26,290.10 + 4,498.40 = 30,788.50 → round off +0.50 → 30,789
export const SAMPLE_INVOICE = {
  type: 'Sales',
  invoiceNumber: 'INV-2024-047',
  date: '2024-03-15',
  dueDate: '2024-03-22',
  partyName: 'Mehta & Associates',
  partyAddress: 'Shop No. 12, Brigade Road, Bengaluru, Karnataka - 560025',
  partyPhone: '9845012345',
  partyGstNumber: '29AABCM1234F1Z3',
  placeOfSupply: 'Karnataka',
  isInterState: false,
  billedBy: 'Ravi Kumar',
  paymentMode: 'Bank',
  subtotal: 26290.10,
  taxAmount: 4498.40,
  discountAmount: 0,
  discountPercent: 0,
  totalAmount: 30789,
  roundOffAmount: 0.50,
  advance: 5000,
  items: [
    { name: 'Ergonomic Office Chair',  qty: 2,  price: 3499,  taxRate: 18, hsnCode: '9401', unit: 'Nos', discountPercent: 5,  total: 7844.76 },
    { name: 'Executive Writing Desk',  qty: 1,  price: 12500, taxRate: 18, hsnCode: '9403', unit: 'Nos', discountPercent: 0,  total: 14750.00 },
    { name: 'Adjustable Laptop Stand', qty: 3,  price: 1299,  taxRate: 12, hsnCode: '8473', unit: 'Nos', discountPercent: 0,  total: 4364.64 },
    { name: '7-Port USB 3.0 Hub',      qty: 5,  price: 649,   taxRate: 18, hsnCode: '8473', unit: 'Nos', discountPercent: 0,  total: 3829.10 },
  ],
};

export const SAMPLE_BUSINESS = {
  name: 'Srinivas Office Furniture',
  address: '45, Industrial Estate, Peenya, Bengaluru - 560058',
  phone: '080-41234567',
  gstNumber: '29AABCS9876G1ZB',
  email: 'sales@srinivasoffice.in',
  bankName: 'HDFC Bank',
  bankAccount: '1234567890',
  ifscCode: 'HDFC0001234',
  accountHolder: 'Srinivas Office Furniture',
  upiId: 'srinivasoffice@okhdfcbank',
  upiNumber: '9876543210',
};

// ── Internal defaults ─────────────────────────────────────────────────────────

const DEFAULT_PRINT_OPTIONS = {
  showLogo: true,
  showGSTIN: true,
  showInvoiceNumber: true,
  showDate: true,
  showGSTColumn: true,
  showDiscountColumn: true,
  showTerms: true,
  showSignature: true,
  showOldBalance: false,
  showHSNColumn: true,
  showSrNo: true,
  showUnitColumn: false,
  showItemCategory: false,
  showItemSize: false,
  showItemVariant: false,
  showBusinessPhone: true,
  showBusinessEmail: false,
  showQRCode: false,
  showPartyPhone: true,
  showPartyAddress: true,
  showPartyGSTIN: true,
  showPlaceOfSupply: true,
  showDueDate: false,
  showBilledBy: false,
  showPaymentMode: false,
  showBankDetails: false,
  showAmountInWords: false,
  showLoyaltyOnBill: false,
  autoRoundOff: false,
  dateFormat: 'DD/MM/YYYY',
  invoiceTheme: 'classic',
  themeColor: '#334155',
  termsText: '',
  columnOrder: [],
  // Outer document padding — user-configurable per side (Settings → Invoice
  // → Page Padding). `null` means "use the theme's own default pad value"
  // (backward-compatible with every bill printed before this setting
  // existed); an explicit number overrides it. Top/bottom default to 0 so
  // no vertical space is wasted above the header or below the footer —
  // left/right default to null (theme's own pad) since some horizontal
  // margin is still wanted for readability.
  docPaddingTop: 0,
  docPaddingBottom: 0,
  docPaddingLeft: null,
  docPaddingRight: null,
};

// Resolves the 4 configurable padding sides against a theme's own base `pad`
// value (used as the fallback for left/right when the user hasn't set a
// custom value, and for pre-existing configs saved before this setting
// existed) into a CSS padding shorthand string. Consumed once per theme's
// outer container div in place of the old uniform `padding: ${pad}px`.
// Top/bottom always default to 0 regardless of the theme's own `pad` value
// (per explicit request — no theme gets to "waste space on top" by default,
// including Minimal, which previously added +8px/+12px of its own extra
// breathing room on top of `pad`); basePadH lets a theme pass a different
// horizontal fallback than plain `pad` (Minimal's case) while still being
// fully overridden by the user's own left/right setting either way.
const resolveDocPadding = (opts, pad, basePadH = pad) => {
  const t = opts.docPaddingTop ?? 0;
  const r = opts.docPaddingRight ?? basePadH;
  const b = opts.docPaddingBottom ?? 0;
  const l = opts.docPaddingLeft ?? basePadH;
  return `${t}px ${r}px ${b}px ${l}px`;
};

// ── Item table column ordering ───────────────────────────────────────────────
// Canonical column keys for the shared item table (10 of 12 themes — Minimal
// and Stripe hand-roll their own layout and don't consume this). "tax" is a
// single movable slot standing in for the whole GST block (Comp.% / CGST+SGST
// / CGST+UTGST / IGST / GST%, whichever applies to a given transaction) since
// that block's exact column count depends on the transaction's tax type, not
// a user toggle — it can be repositioned as one unit but never split apart.
export const ALL_COLUMN_KEYS = ['srno', 'item', 'hsn', 'qty', 'unit', 'rate', 'disc', 'tax', 'amount'];
export const COLUMN_LABELS = {
  srno: 'Sr. No.', item: 'Item Description', hsn: 'HSN/SAC', qty: 'Qty', unit: 'Unit',
  rate: 'Rate', disc: 'Disc%', tax: 'Tax (GST/IGST/etc.)', amount: 'Amount',
};
// Merges a saved order with the canonical key set so a config saved before a
// new column existed (or before this feature existed at all — `columnOrder`
// defaults to `[]`) still works: unknown/missing keys are appended in their
// canonical position, same pattern as Items.jsx's resolveFieldOrder().
export const resolveColumnOrder = (saved) => {
  const list = Array.isArray(saved) && saved.length ? saved : ALL_COLUMN_KEYS;
  const known = list.filter(k => ALL_COLUMN_KEYS.includes(k));
  ALL_COLUMN_KEYS.forEach(k => { if (!known.includes(k)) known.push(k); });
  return known;
};

// ── Paper dimension map ───────────────────────────────────────────────────────

// minHeight is intentionally a few mm short of the true paper height (rather
// than e.g. exactly 297mm for A4) — it only needs to be a visual floor so a
// short invoice still looks like a full page, not an exact match. Printing
// pushes content onto a 2nd (blank) page the instant TOTAL rendered height
// (this div's height, since @page margin in Sales.jsx/POS.jsx's
// getPaperPageStyle is OUTSIDE the content box, not deducted from it)
// exceeds physical paper height minus that @page margin — e.g. A4 is 297mm
// with a 10mm @page margin, so the true printable ceiling is 277mm, not 297mm.
// Every value below was previously set only a few mm short of the FULL
// paper height (e.g. A4 at 287mm) rather than the true printable ceiling
// after margins — meaning even a short invoice with zero extra content was
// already guaranteed to spill a spurious blank trailing page. Recomputed
// each value as (paper height − 2×@page margin − ~5mm safety buffer for
// small trailing additions like the footer's Terms/Signature block).
const PAPER_DIM = {
  'A3':        { width: '297mm', minHeight: '385mm', pad: 56 },
  'A4':        { width: '210mm', minHeight: '270mm', pad: 40 },
  'A5':        { width: '148mm', minHeight: '183mm', pad: 28 },
  'A6':        { width: '105mm', minHeight: '130mm', pad: 18 },
  'Letter':    { width: '216mm', minHeight: '248mm', pad: 40 },
  'Legal':     { width: '216mm', minHeight: '325mm', pad: 40 },
  'Executive': { width: '184mm', minHeight: '236mm', pad: 34 },
  'Statement': { width: '140mm', minHeight: '189mm', pad: 26 },
  'Half Page': { width: '210mm', minHeight: '134mm', pad: 24 },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// Shows up to 3 decimal places, strips trailing zeros: 9 → "9", 4.5 → "4.5", 0.125 → "0.125"
const fmtRate = (n) => parseFloat(Number(n).toFixed(3)).toString();

const formatDate = (dateStr, fmt = 'DD/MM/YYYY') => {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  if (!year || !month || !day) return dateStr;
  switch (fmt) {
    case 'MM/DD/YYYY': return `${month}/${day}/${year}`;
    case 'YYYY-MM-DD': return `${year}-${month}-${day}`;
    case 'DD-MM-YYYY': return `${day}-${month}-${year}`;
    case 'DD MMM YYYY': {
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return `${day} ${months[parseInt(month, 10) - 1] || month} ${year}`;
    }
    default: return `${day}/${month}/${year}`;
  }
};

const lighten = (hex, amount) => {
  if (!hex || hex.length < 7) return hex;
  const r = Math.min(255, Math.max(0, parseInt(hex.slice(1, 3), 16) + Math.round(amount * 255)));
  const g = Math.min(255, Math.max(0, parseInt(hex.slice(3, 5), 16) + Math.round(amount * 255)));
  const b = Math.min(255, Math.max(0, parseInt(hex.slice(5, 7), 16) + Math.round(amount * 255)));
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
};

const numberToWords = (num) => {
  if (num == null || isNaN(num)) return '';
  const n = Math.floor(Number(num));
  if (n === 0) return 'Zero Only';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const toWords = (x) => {
    if (x === 0) return '';
    if (x < 20) return ones[x] + ' ';
    if (x < 100) return tens[Math.floor(x / 10)] + (x % 10 ? ' ' + ones[x % 10] : '') + ' ';
    return ones[Math.floor(x / 100)] + ' Hundred ' + toWords(x % 100);
  };
  let result = '';
  if (n >= 10000000) { result += toWords(Math.floor(n / 10000000)) + 'Crore '; }
  if (n % 10000000 >= 100000) { result += toWords(Math.floor((n % 10000000) / 100000)) + 'Lakh '; }
  if (n % 100000 >= 1000) { result += toWords(Math.floor((n % 100000) / 1000)) + 'Thousand '; }
  result += toWords(n % 1000);
  return result.trim().replace(/\s+/g, ' ') + ' Only';
};

// A qty derived from a typed Amount (Sales.jsx's Amount→Qty auto-calc) can
// carry more precision than 2 decimals — kept that way so qty×price
// reproduces the exact typed amount everywhere totals are computed (see
// calcLineTotal/calcTaxableBase below, which intentionally use the raw,
// unrounded item.qty). Only what's actually PRINTED needs the clean 2dp
// figure a real-world quantity is normally billed to.
const fmtQty = (qty) => {
  const n = Number(qty) || 0;
  const rounded = Math.round(n * 100) / 100;
  // Drop a trailing ".00"/"X0" the same way a plain integer or 1dp qty
  // already prints — avoids "2.00" for what's really just "2".
  return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(2).replace(/0$/, '');
};

const calcLineTotal = (item) => {
  if (item.total != null) return Number(item.total);
  const qty = Number(item.qty) || 0;
  const price = Number(item.price) || 0;
  const discPct = Number(item.discountPercent) || 0;
  const taxRate = Number(item.taxRate) || 0;
  if (item.taxInclusive) return qty * price * (1 - discPct / 100);
  return qty * price * (1 - discPct / 100) * (1 + taxRate / 100);
};

const calcTaxableBase = (item) => {
  const qty = Number(item.qty) || 0;
  const price = Number(item.price) || 0;
  const discPct = Number(item.discountPercent) || 0;
  const taxRate = Number(item.taxRate) || 0;
  if (item.taxInclusive) return qty * (price / (1 + taxRate / 100)) * (1 - discPct / 100);
  return qty * price * (1 - discPct / 100);
};

// Counts how many columns the item table will actually render, given the
// current print options and GST mode — used to decide how aggressively to
// shrink table padding/font on narrow paper (A6, Statement, etc). Mirrors the
// exact column logic in TableHead/ItemRows below.
const countTableColumns = (opts, showHSN, showDisc, useCGSTSGST, useUTGST, useIGST, isComposite, showGST) => {
  let n = 1; // Item name is always shown
  if (opts?.showSrNo !== false) n += 1;
  if (showHSN) n += 1;
  n += 1; // Qty
  if (opts?.showUnitColumn === true) n += 1;
  n += 1; // Rate
  if (showDisc) n += 1;
  if (isComposite || useIGST || showGST) n += (useCGSTSGST || useUTGST) ? 2 : 1;
  n += 1; // Amount
  return n;
};

// Scales a theme's own th/td style objects down for narrow paper (A5/A6/
// Statement/etc, identified by a small `pad`) and/or a wide item table (many
// optional columns on) — without this, 8-10 columns at normal padding/font
// simply don't fit A6's ~105mm width and the table overflows/misaligns in
// print. Padding and font-size shrink together; every other style (colors,
// borders, weight) from the theme's own `th`/`td` passes through unchanged.
const narrowTableStyles = (th, td, pad, columnCount) => {
  const isNarrow = pad < 36 || columnCount >= 8;
  if (!isNarrow) return { th, td };
  // More columns and/or narrower paper both push the squeeze factor down.
  const squeeze = pad < 22 ? 0.55 : pad < 36 ? 0.72 : 0.82;
  const colSqueeze = columnCount >= 9 ? 0.85 : columnCount >= 8 ? 0.92 : 1;
  const factor = squeeze * colSqueeze;
  const scalePx = (val, min) => {
    const n = parseFloat(val);
    if (isNaN(n)) return val;
    return `${Math.max(min, Math.round(n * factor))}px`;
  };
  const scalePadding = (padding) => String(padding).split(' ').map(p => scalePx(p, 2)).join(' ');
  return {
    th: { ...th, padding: scalePadding(th.padding), fontSize: scalePx(th.fontSize, 8), whiteSpace: columnCount >= 8 ? 'normal' : th.whiteSpace },
    td: { ...td, padding: scalePadding(td.padding), fontSize: scalePx(td.fontSize, 8) },
  };
};

// ── Print CSS injected into every invoice ────────────────────────────────────
// Ensures multi-page bills print cleanly:
//   • thead repeats on every printed page
//   • no table row is sliced mid-print
//   • totals/HSN summary/footer stay together on a page
const PRINT_STYLE = `
  @media print {
    .inv-table thead { display: table-header-group; }
    .inv-table tfoot { display: table-footer-group; }
    .inv-table tr    { page-break-inside: avoid; break-inside: avoid; }
    .inv-no-break    { page-break-inside: avoid; break-inside: avoid; }
    .inv-before-break { page-break-before: always; break-before: always; }
  }
  .inv-table thead { display: table-header-group; }
  .inv-table tfoot { display: table-footer-group; }
  .inv-table tr    { page-break-inside: avoid; break-inside: avoid; }
  .inv-no-break    { page-break-inside: avoid; break-inside: avoid; }
`;

const PrintStyle = () => <style dangerouslySetInnerHTML={{ __html: PRINT_STYLE }} />;

// ── GST type derivation helper ────────────────────────────────────────────────

const deriveGstFlags = (transaction, showGST) => {
  const gstType = transaction.gstType;
  // Legacy: if no gstType saved, fall back to isInterState boolean
  if (!gstType || gstType === 'auto') {
    const igst = showGST && transaction.isInterState === true;
    return { useIGST: igst, useUTGST: false, isComposite: false, useCGSTSGST: showGST && !igst };
  }
  const useIGST = showGST && gstType === 'igst';
  const useUTGST = showGST && gstType === 'utgst';
  const isComposite = showGST && gstType === 'composite';
  const useCGSTSGST = showGST && !useIGST && !useUTGST && !isComposite;
  return { useIGST, useUTGST, isComposite, useCGSTSGST };
};

const gstTypeLabel = (transaction) => {
  const gstType = transaction.gstType;
  if (!gstType || gstType === 'auto') return transaction.isInterState ? 'Inter-State (IGST)' : 'Intra-State (CGST+SGST)';
  const labels = { igst: 'Inter-State (IGST)', cgst_sgst: 'Intra-State (CGST+SGST)', utgst: 'Union Territory (CGST+UTGST)', composite: 'Composite Scheme' };
  return labels[gstType] || 'Intra-State (CGST+SGST)';
};

// ── Shared sub-components ─────────────────────────────────────────────────────

const HsnTaxSummary = ({ transaction, useIGST, useUTGST, isComposite, thStyle, tdStyle, opts }) => {
  if (opts?.showTaxSummary === false) return null;
  const hasGST = transaction.items?.some(i => Number(i.taxRate) > 0);
  if (!hasGST) return null;

  const hasHSN = (opts?.showHSNColumn !== false) && transaction.items?.some(i => i.hsnCode);
  const groups = {};
  (transaction.items || []).forEach(item => {
    const hsn = item.hsnCode || '';
    const rate = Number(item.taxRate) || 0;
    if (!rate) return;
    const key = `${hsn}||${rate}`;
    const taxable = calcTaxableBase(item);
    if (!groups[key]) groups[key] = { hsn, rate, taxable: 0 };
    groups[key].taxable += taxable;
  });

  const rows = Object.values(groups).filter(g => g.taxable > 0);
  if (rows.length === 0) return null;

  const totalTaxable = rows.reduce((a, g) => a + g.taxable, 0);
  const totalTax = rows.reduce((a, g) => a + g.taxable * (g.rate / 100), 0);

  return (
    // No inv-no-break here (deliberately, unlike TotalsBlock) — this table's
    // row count is unbounded (one row per distinct HSN+rate combination), so
    // forcing the WHOLE block to stay together pushed it — and everything
    // after it, including the footer — onto a fresh page the instant it
    // didn't fully fit in whatever space remained, even when most of its
    // rows would have fit fine. Each row already has its own break-inside:
    // avoid via the .inv-table tr rule below, which is enough to stop a
    // single row from splitting mid-row while still letting the table break
    // cleanly between rows when it needs to.
    <div style={{ marginBottom: '20px' }}>
      <p style={{ margin: '0 0 6px 0', fontWeight: '700', fontSize: '12px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        HSN / SAC — Tax Summary
      </p>
      <table className="inv-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
        <thead>
          <tr>
            {hasHSN && <th style={{ ...thStyle, textAlign: 'left', fontSize: '10.5px' }}>HSN/SAC</th>}
            <th style={{ ...thStyle, textAlign: 'right', fontSize: '10.5px' }}>Taxable Value</th>
            {isComposite ? (
              <>
                <th style={{ ...thStyle, textAlign: 'right', fontSize: '10.5px' }}>Comp. Rate %</th>
                <th style={{ ...thStyle, textAlign: 'right', fontSize: '10.5px' }}>Comp. Tax</th>
              </>
            ) : useIGST ? (
              <>
                <th style={{ ...thStyle, textAlign: 'right', fontSize: '10.5px' }}>IGST %</th>
                <th style={{ ...thStyle, textAlign: 'right', fontSize: '10.5px' }}>IGST Amt</th>
              </>
            ) : (
              <>
                <th style={{ ...thStyle, textAlign: 'right', fontSize: '10.5px' }}>CGST %</th>
                <th style={{ ...thStyle, textAlign: 'right', fontSize: '10.5px' }}>CGST Amt</th>
                <th style={{ ...thStyle, textAlign: 'right', fontSize: '10.5px' }}>{useUTGST ? 'UTGST %' : 'SGST %'}</th>
                <th style={{ ...thStyle, textAlign: 'right', fontSize: '10.5px' }}>{useUTGST ? 'UTGST Amt' : 'SGST Amt'}</th>
              </>
            )}
            <th style={{ ...thStyle, textAlign: 'right', fontSize: '10.5px' }}>Total Tax</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g, i) => {
            const taxAmt = g.taxable * (g.rate / 100);
            const halfRate = g.rate / 2;
            const halfTax = taxAmt / 2;
            return (
              <tr key={i}>
                {hasHSN && <td style={{ ...tdStyle, fontSize: '11px' }}>{g.hsn || '-'}</td>}
                <td style={{ ...tdStyle, textAlign: 'right', fontSize: '11px' }}>₹{g.taxable.toFixed(2)}</td>
                {(isComposite || useIGST) ? (
                  <>
                    <td style={{ ...tdStyle, textAlign: 'right', fontSize: '11px' }}>{g.rate}%</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontSize: '11px' }}>₹{taxAmt.toFixed(2)}</td>
                  </>
                ) : (
                  <>
                    <td style={{ ...tdStyle, textAlign: 'right', fontSize: '11px' }}>{halfRate}%</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontSize: '11px' }}>₹{halfTax.toFixed(2)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontSize: '11px' }}>{halfRate}%</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontSize: '11px' }}>₹{halfTax.toFixed(2)}</td>
                  </>
                )}
                <td style={{ ...tdStyle, textAlign: 'right', fontSize: '11px', fontWeight: '700' }}>₹{taxAmt.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            {hasHSN && <td style={{ ...tdStyle, fontWeight: '700', fontSize: '11px' }}>Total</td>}
            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: '700', fontSize: '11px' }}>₹{totalTaxable.toFixed(2)}</td>
            {(isComposite || useIGST) ? (
              <>
                <td style={tdStyle} />
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: '700', fontSize: '11px' }}>₹{totalTax.toFixed(2)}</td>
              </>
            ) : (
              <>
                <td style={tdStyle} />
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: '700', fontSize: '11px' }}>₹{(totalTax / 2).toFixed(2)}</td>
                <td style={tdStyle} />
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: '700', fontSize: '11px' }}>₹{(totalTax / 2).toFixed(2)}</td>
              </>
            )}
            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: '700', fontSize: '11px' }}>₹{totalTax.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

const TotalsBlock = ({ transaction, opts, isSale, accentColor, showBalanceSection, currentBillTotal, balanceNum, openingBalance, compact }) => {
  const showGST = opts.showGSTColumn && !transaction.noGST;
  const { useIGST, useUTGST, isComposite, useCGSTSGST } = deriveGstFlags(transaction, showGST);
  const discountAmount = transaction.discountAmount ?? 0;
  const advanceAmount = transaction.advance ?? 0;
  const balanceDue = Math.max(0, (transaction.totalAmount ?? 0) - advanceAmount);
  const fs = compact ? '12px' : '13px';
  const totalFs = compact ? '14px' : '16px';

  // Recompute tax from items so inclusive items are handled correctly.
  // Groups by tax rate, sums taxable base per group, then totals tax.
  const computedTax = (() => {
    if (!showGST || !(transaction.items?.length)) return transaction.taxAmount ?? 0;
    return (transaction.items).reduce((sum, item) => {
      const rate = Number(item.taxRate) || 0;
      if (!rate) return sum;
      return sum + calcTaxableBase(item) * (rate / 100);
    }, 0);
  })();

  const row = (label, value, bold, color) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: compact ? '4px' : '5px' }}>
      <span style={{ color: bold ? '#000' : '#555', fontWeight: bold ? '700' : '400', fontSize: fs }}>{label}</span>
      <span style={{ color: color || (bold ? '#000' : '#333'), fontWeight: bold ? '700' : '400', fontSize: fs }}>{value}</span>
    </div>
  );

  return (
    <div className="inv-no-break" style={{ width: compact ? '220px' : '260px', marginLeft: 'auto' }}>
      {row('Subtotal', `₹${(transaction.subtotal ?? 0).toFixed(2)}`)}
      {discountAmount > 0 && row(`Discount${transaction.discountPercent ? ` (${transaction.discountPercent}%)` : ''}`, `-₹${discountAmount.toFixed(2)}`)}
      {isComposite && row('Composition Tax', `₹${computedTax.toFixed(2)}`)}
      {useIGST && row('IGST', `₹${computedTax.toFixed(2)}`)}
      {useCGSTSGST && row('CGST', `₹${(computedTax / 2).toFixed(2)}`)}
      {useCGSTSGST && row('SGST', `₹${(computedTax / 2).toFixed(2)}`)}
      {useUTGST && row('CGST', `₹${(computedTax / 2).toFixed(2)}`)}
      {useUTGST && row('UTGST', `₹${(computedTax / 2).toFixed(2)}`)}
      {!showGST && (transaction.taxAmount ?? 0) > 0 && row('Tax Amount', `₹${(transaction.taxAmount ?? 0).toFixed(2)}`)}
      {(transaction.packingCharge ?? 0) > 0 && row('Packing Charges', `₹${Number(transaction.packingCharge).toFixed(2)}`)}
      {(transaction.shippingCharge ?? 0) > 0 && row('Shipping Charges', `₹${Number(transaction.shippingCharge).toFixed(2)}`)}
      {transaction.roundOffAmount != null && transaction.roundOffAmount !== 0 && row('Round Off', `${transaction.roundOffAmount >= 0 ? '+' : ''}₹${Number(transaction.roundOffAmount).toFixed(2)}`)}
      {(transaction.loyaltyRedeemValue ?? 0) > 0 && row(`${opts.loyalty?.programName || 'Loyalty'} (${transaction.loyaltyPointsRedeemed ?? 0} pts)`, `-₹${Number(transaction.loyaltyRedeemValue).toFixed(2)}`, false, '#b45309')}
      <div style={{ borderTop: `2px solid ${accentColor}`, margin: '8px 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontSize: totalFs, fontWeight: '800', color: '#000' }}>Total</span>
        <span style={{ fontSize: totalFs, fontWeight: '800', color: accentColor }}>₹{(transaction.totalAmount ?? 0).toFixed(2)}</span>
      </div>
      {advanceAmount > 0 && (
        <>
          <div style={{ borderTop: '1px dashed #bbb', margin: '10px 0 6px' }} />
          {row(isSale ? 'Advance Received' : 'Advance Paid', `-₹${advanceAmount.toFixed(2)}`, false, '#334155')}
          <div style={{ borderTop: '1px solid #999', margin: '6px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '14px', fontWeight: '700', color: '#dc2626' }}>{isSale ? 'Balance Due' : 'Balance Payable'}</span>
            <span style={{ fontSize: '14px', fontWeight: '700', color: '#dc2626' }}>₹{balanceDue.toFixed(2)}</span>
          </div>
        </>
      )}
      {showBalanceSection && (
        <>
          <div style={{ borderTop: '1px solid #ccc', margin: '14px 0 8px' }} />
          {row('Opening Balance', `₹${(openingBalance ?? 0).toFixed(2)}`)}
          {row('Current Bill', `₹${currentBillTotal.toFixed(2)}`)}
          <div style={{ borderTop: '1px solid #999', margin: '6px 0', paddingTop: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: '700', color: '#000', fontSize: fs }}>Total Pending</span>
              <span style={{ fontWeight: '700', color: '#000', fontSize: fs }}>₹{(balanceNum ?? 0).toFixed(2)}</span>
            </div>
          </div>
        </>
      )}
      {opts.showAmountInWords && (
        <div style={{ marginTop: '10px', padding: '8px 10px', background: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
          <span style={{ fontSize: '11px', color: '#555', fontStyle: 'italic' }}>
            <strong style={{ color: '#333', fontStyle: 'normal' }}>Amount in Words: </strong>
            Rupees {numberToWords(transaction.totalAmount ?? 0)}
          </span>
        </div>
      )}
    </div>
  );
};

const LoyaltyBlock = ({ transaction, opts, thermal = false }) => {
  if (!opts.showLoyaltyOnBill) return null;

  const loyalty = opts.loyalty || {};
  const programName   = transaction._loyaltySnapshot?.programName || loyalty.programName || 'Loyalty Points';
  const earned        = Number(transaction._loyaltySnapshot?.earned  ?? transaction.loyaltyPointsEarned  ?? 0);
  const balance       = Number(transaction._loyaltySnapshot?.balance ?? transaction.loyaltyBalanceAfter  ?? 0);
  const redeemed      = Number(transaction.loyaltyPointsRedeemed ?? 0);
  const redeemVal     = Number(transaction.loyaltyRedeemValue    ?? 0);
  const ptsPerRupee   = Number(loyalty.pointsPerRupee  ?? 1);
  const earnEvery     = Number(loyalty.earnEveryRupees ?? 1);
  const minRedeem     = Number(loyalty.minRedeemPoints ?? 10);
  const rupeePerPoint = Number(loyalty.rupeePerPoint   ?? 0);

  const earnRuleText = ptsPerRupee > 0
    ? `Earn ${ptsPerRupee} pt${ptsPerRupee !== 1 ? 's' : ''} for every ₹${earnEvery} spent`
    : null;
  const redeemRuleText = minRedeem > 0 && rupeePerPoint > 0
    ? `Redeem when you have ${minRedeem}+ pts (${minRedeem} pts = ₹${(minRedeem * rupeePerPoint).toFixed(2)} off)`
    : null;

  /* ── Thermal: plain text, no backgrounds, no color, minimal ink ── */
  if (thermal) {
    const div = '--------------------------------';
    const ls = { display: 'flex', justifyContent: 'space-between', fontSize: '12px', margin: '2px 0' };
    return (
      <div style={{ margin: '6px 0', fontFamily: 'inherit' }}>
        <div style={{ textAlign: 'center', fontSize: '12px', margin: '4px 0' }}>{div}</div>
        <div style={{ textAlign: 'center', fontWeight: '700', fontSize: '12px', marginBottom: '4px' }}>{programName}</div>
        {earned > 0   && <div style={ls}><span>Points Earned</span><span>+{earned.toLocaleString('en-IN')} pts</span></div>}
        {redeemed > 0 && <div style={ls}><span>Points Redeemed</span><span>-{redeemed.toLocaleString('en-IN')} pts (Rs.{redeemVal.toFixed(2)} off)</span></div>}
        {balance > 0  && <div style={{ ...ls, fontWeight: '700' }}><span>Point Balance</span><span>{balance.toLocaleString('en-IN')} pts</span></div>}
        {earnRuleText   && <div style={{ fontSize: '10.5px', margin: '3px 0', textAlign: 'center' }}>{earnRuleText}</div>}
        {redeemRuleText && <div style={{ fontSize: '10.5px', margin: '2px 0', textAlign: 'center' }}>{redeemRuleText}</div>}
        <div style={{ textAlign: 'center', fontSize: '12px', margin: '4px 0' }}>{div}</div>
      </div>
    );
  }

  /* ── A4 / full-color ── */
  const row = (label, value, color) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderBottom: '1px solid #e0f2f1' }}>
      <span style={{ fontSize: '11px', color: '#4b5563' }}>{label}</span>
      <span style={{ fontSize: '11.5px', fontWeight: '700', color: color || '#334155' }}>{value}</span>
    </div>
  );

  return (
    <div style={{ marginTop: '16px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', fontSize: '12px' }}>
      <div style={{ background: 'linear-gradient(135deg, #1e293b, #334155)', padding: '7px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#fff', fontWeight: '800', fontSize: '11.5px', letterSpacing: '0.03em' }}>🎁 {programName}</span>
        {balance > 0 && <span style={{ color: '#e2e8f0', fontSize: '10.5px', fontWeight: '600' }}>{balance.toLocaleString('en-IN')} pts balance</span>}
      </div>
      <div style={{ background: '#f0fdfb', padding: '10px 14px', display: 'flex', gap: '12px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {earned > 0   && row('Points earned this bill', `+${earned.toLocaleString('en-IN')} pts`, '#334155')}
          {redeemed > 0 && row('Points redeemed', `−${redeemed.toLocaleString('en-IN')} pts (₹${redeemVal.toFixed(2)} off)`, '#b45309')}
          {balance > 0  && row('Your point balance', `${balance.toLocaleString('en-IN')} pts`, '#334155')}
          {earned === 0 && redeemed === 0 && balance === 0 && (
            <div style={{ fontSize: '11px', color: '#6b7280', fontStyle: 'italic' }}>No points on this bill</div>
          )}
        </div>
        {(earnRuleText || redeemRuleText) && (
          <div style={{ borderLeft: '1px dashed #e2e8f0', paddingLeft: '12px', flexShrink: 0, maxWidth: '160px', display: 'flex', flexDirection: 'column', gap: '6px', justifyContent: 'center' }}>
            <div style={{ fontSize: '9.5px', fontWeight: '700', color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>How it works</div>
            {earnRuleText   && <div style={{ fontSize: '10.5px', color: '#374151', lineHeight: 1.4 }}>📈 {earnRuleText}</div>}
            {redeemRuleText && <div style={{ fontSize: '10.5px', color: '#374151', lineHeight: 1.4 }}>💰 {redeemRuleText}</div>}
          </div>
        )}
      </div>
    </div>
  );
};

// Compact payment QR thumbnail shown inline inside the Bank Details box
// (rather than the header) so it doesn't cost the bill its own separate
// block of space — a small fixed-size image sitting beside the bank text.
// "Scan & Pay via UPI" caption underneath makes it unambiguous what the code
// is for (a payment QR, not e.g. a tracking/verification code). Generated
// live from the business's UPI ID (see upiUtils.js) — no uploaded image.
const BankQrThumb = ({ business, opts }) => {
  if (!opts.showQRCode || !business.upiId) return null;
  const upiUri = buildUpiUri({ upiId: business.upiId, payeeName: business.name });
  return (
    <div style={{ flexShrink: 0, textAlign: 'center', width: '52px' }}>
      <div style={{ width: '52px', height: '52px', backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '4px', padding: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', overflow: 'hidden' }}>
        <UpiQrImage value={upiUri} size={48} />
      </div>
      <div style={{ fontSize: '8.5px', fontWeight: '700', color: '#444', marginTop: '3px', lineHeight: 1.25, textAlign: 'center' }}>📱 Scan & Pay</div>
      <div style={{ fontSize: '7.5px', color: '#888', lineHeight: 1.2, textAlign: 'center' }}>via UPI</div>
    </div>
  );
};

// Whether there's anything for BankDetailsBlock to actually show — used by
// both BankDetailsBlock itself and HsnBankRow (which needs to know before
// rendering starts, to decide whether HSN gets the full row to itself or
// needs to share it with a Bank Details column).
const hasBankDetailsContent = (business, opts) => {
  if (!opts.showBankDetails) return false;
  const { bankName, bankAccount, ifscCode, upiId, upiNumber } = business;
  return !!(bankName || bankAccount || ifscCode || upiId || upiNumber);
};

// Pure content block — no outer width/margin/border of its own. Callers
// (HsnBankRow, or a standalone placement) own how it's positioned, since
// that differs depending on whether it's sharing a row with HSN Tax Summary
// or sitting alone under the Totals box.
const BankDetailsBlock = ({ business, opts }) => {
  if (!hasBankDetailsContent(business, opts)) return null;
  const { bankName, bankAccount, ifscCode, accountHolder, upiId, upiNumber } = business;
  return (
    // alignItems: center (not flex-start) — the QR+caption block is much
    // shorter than the bank text column next to it (up to 6 lines), so
    // top-aligning left it visually pinned to the top with empty space
    // below instead of centered in the row's full height.
    <div style={{ fontSize: '11px', color: '#555', lineHeight: 1.6, display: 'flex', gap: '10px', alignItems: 'center' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: '0 0 4px 0', fontSize: '11.5px', fontWeight: '700', color: '#444' }}>Bank Details:</p>
        {bankName && <div>Bank: <strong style={{ color: '#000' }}>{bankName}</strong></div>}
        {accountHolder && <div>A/C Name: <strong style={{ color: '#000' }}>{accountHolder}</strong></div>}
        {bankAccount && <div>A/C No.: <strong style={{ color: '#000' }}>{bankAccount}</strong></div>}
        {ifscCode && <div>IFSC: <strong style={{ color: '#000' }}>{ifscCode}</strong></div>}
        {upiId && <div>UPI ID: <strong style={{ color: '#000' }}>{upiId}</strong></div>}
        {upiNumber && <div>UPI No.: <strong style={{ color: '#000' }}>{upiNumber}</strong></div>}
      </div>
      <BankQrThumb business={business} opts={opts} />
    </div>
  );
};

// Puts Bank Details on the LEFT and HSN/SAC Tax Summary on the RIGHT, in the
// same row. Uses float (not flex, not display:table/table-cell) — verified
// empirically with a real headless-Chromium print render (Playwright) that
// this combination correctly lets the HSN <table> fragment row-by-row
// across a page boundary while Bank Details stays beside it:
//   - flex/grid containers can't fragment across a page boundary in
//     Chromium's print engine at all (treated as one atomic block)
//   - nesting the HSN <table> inside a display:table-cell made ITS OWN
//     content atomic too — a table-cell's content doesn't fragment even
//     though the outer table can — so the HSN rows stopped splitting
//     page-to-page the way they correctly do everywhere else in this file
// A float sits beside other content without wrapping it in any container
// layout mode that print can't fragment — the HSN table below it is a
// plain block-level `<table>` in normal flow, `overflow:hidden` is only
// there so it doesn't wrap around the float rather than sitting beside it.
const HsnBankRow = ({ business, opts, bankWidth, children }) => {
  const showBank = hasBankDetailsContent(business, opts);
  if (!showBank) return children || null;
  const width = bankWidth || '230px';
  if (!children) {
    return (
      <div style={{ width, marginBottom: '4px' }}>
        <BankDetailsBlock business={business} opts={opts} />
      </div>
    );
  }
  return (
    <div style={{ marginBottom: '4px' }}>
      <div style={{ float: 'left', width, marginRight: '20px' }}>
        <BankDetailsBlock business={business} opts={opts} />
      </div>
      <div style={{ overflow: 'hidden' }}>{children}</div>
    </div>
  );
};

// Terms/Signature side-by-side layout uses display:table/table-cell — NOT
// flex (Chromium's print engine can't paginate a flex/grid container at
// all, treating it as one atomic block) and NOT float either (floats have
// their own long-documented Chromium print-pagination bugs: content can be
// clipped, duplicated, or mis-measured across a page boundary). A CSS table
// is the one layout mode Chromium's print engine reliably fragments across
// pages — it's the same mechanism that already lets the multi-row item
// table and HSN summary paginate correctly elsewhere in this file. Each
// cell also carries `inv-no-break` so its own content (e.g. the Terms
// label + body paragraph) can't be torn apart mid-cell by a page break —
// empirically verified via a real headless-Chromium print render, see the
// changelog for the fix that added it.
const InvoiceFooter = ({ opts, business, transaction, accentColor }) => {
  const hasLoyalty = !!opts.showLoyaltyOnBill;
  const hasContent = opts.showTerms || opts.showSignature || hasLoyalty;
  return (
    <div style={{ marginTop: '6px' }}>
      {hasContent && (
        <div style={{ marginTop: hasLoyalty ? '20px' : '0', display: 'table', width: '100%', tableLayout: 'fixed', borderSpacing: '24px 0' }}>
          <LoyaltyBlock transaction={transaction} opts={opts} />
          <div style={{ display: 'table-row' }}>
            {opts.showTerms && (
              <div className="inv-no-break" style={{ display: 'table-cell', width: opts.showSignature ? '62%' : '100%', verticalAlign: 'top' }}>
                <p style={{ margin: '0 0 4px 0', fontSize: '11.5px', fontWeight: '700', color: '#444' }}>Terms & Conditions:</p>
                <p style={{ margin: 0, fontSize: '11px', color: '#555', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                  {opts.termsText || '1. Goods once sold will not be taken back.\n2. Interest @ 18% will be charged if payment is not made within 7 days.'}
                </p>
              </div>
            )}
            {opts.showSignature && (
              <div className="inv-no-break" style={{ display: 'table-cell', width: opts.showTerms ? '38%' : '100%', verticalAlign: 'top', textAlign: 'right' }}>
                <div style={{ height: '40px' }} />
                <p style={{ margin: '0 0 4px 0', fontSize: '13px', fontWeight: '700', color: '#000' }}>For {business.name}</p>
                <p style={{ margin: 0, fontSize: '11px', color: '#555' }}>Authorized Signatory</p>
                {opts.showBilledBy && transaction.billedBy && (
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#555' }}>
                    Billed by: <strong style={{ color: '#000' }}>{transaction.billedBy}</strong>
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      <PoweredByFooter />
    </div>
  );
};

// Tiny, fixed-height branding line — deliberately plain in-flow text (no
// position:fixed/absolute, both unreliable for Chromium print pagination;
// no flex/grid ancestor either, so it can never contribute to a container
// that print can't fragment) so it only ever adds its own ~14px to the
// natural document flow, same class of element as the rest of the footer.
const PoweredByFooter = ({ color }) => (
  <div style={{ marginTop: '4px', textAlign: 'center', fontSize: '8px', lineHeight: 1.2, color: color || '#9ca3af' }}>
    Powered by TallyKraft · www.tallykraft.com
  </div>
);

// ── Item table rows helper ────────────────────────────────────────────────────

// Builds the visible-columns list, in the user's configured order, for both
// TableHead and ItemRows — "tax" resolves to 0/1/2 actual <th>/<td> cells
// depending on transaction gst type, but is a single movable slot in
// `columnOrder` since a user reorders it as one conceptual "Tax" column.
const resolveVisibleColumns = (opts, showHSN, showDisc, showUnit, showSrNo) => {
  const order = resolveColumnOrder(opts?.columnOrder);
  const visible = {
    srno: showSrNo, item: true, hsn: showHSN, qty: true,
    unit: showUnit, rate: true, disc: showDisc, tax: true, amount: true,
  };
  return order.filter(k => visible[k]);
};

const TaxHeaderCells = ({ thStyle, useCGSTSGST, useUTGST, useIGST, isComposite, showGST }) => {
  if (isComposite) return <th style={{ ...thStyle, textAlign: 'right' }}>Comp.%</th>;
  if (useCGSTSGST) return <><th style={{ ...thStyle, textAlign: 'right' }}>CGST%</th><th style={{ ...thStyle, textAlign: 'right' }}>SGST%</th></>;
  if (useUTGST) return <><th style={{ ...thStyle, textAlign: 'right' }}>CGST%</th><th style={{ ...thStyle, textAlign: 'right' }}>UTGST%</th></>;
  if (useIGST) return <th style={{ ...thStyle, textAlign: 'right' }}>IGST%</th>;
  if (showGST) return <th style={{ ...thStyle, textAlign: 'right' }}>GST%</th>;
  return null;
};

const TaxDataCells = ({ tdStyle, taxRate, useCGSTSGST, useUTGST, useIGST, isComposite, showGST }) => {
  if (useCGSTSGST || useUTGST) {
    return <><td style={{ ...tdStyle, textAlign: 'right' }}>{taxRate ? `${fmtRate(taxRate / 2)}%` : '-'}</td><td style={{ ...tdStyle, textAlign: 'right' }}>{taxRate ? `${fmtRate(taxRate / 2)}%` : '-'}</td></>;
  }
  if (useIGST || isComposite || showGST) {
    return <td style={{ ...tdStyle, textAlign: 'right' }}>{taxRate ? `${taxRate}%` : '-'}</td>;
  }
  return null;
};

const ItemRows = ({ transaction, opts, tdStyle, showHSN, showDisc, useCGSTSGST, useIGST, useUTGST, isComposite, showGST, rowBg }) => {
  const showSrNo = opts.showSrNo !== false;
  const showUnit = opts.showUnitColumn === true;
  const showCat  = opts.showItemCategory === true;
  const showSz   = opts.showItemSize === true;
  const showVar  = opts.showItemVariant === true;
  const columns = resolveVisibleColumns(opts, showHSN, showDisc, showUnit, showSrNo);
  return (
    <>
      {(transaction.items || []).map((item, idx) => {
        const qty = Number(item.qty) || 0;
        const price = Number(item.price) || 0;
        const discPct = Number(item.discountPercent) || 0;
        const taxRate = Number(item.taxRate) || 0;
        const lineTotal = calcLineTotal(item);
        const bg = rowBg ? rowBg(idx) : undefined;
        const metaParts = [
          showCat && item.category,
          showSz  && item.size && `Size: ${item.size}`,
          showVar && item.variant,
        ].filter(Boolean);
        const cells = {
          srno: <td key="srno" style={{ ...tdStyle, textAlign: 'center' }}>{idx + 1}</td>,
          item: (
            <td key="item" style={{ ...tdStyle, fontWeight: '600', wordBreak: 'break-word' }}>
              <span>{item.name}</span>
              {metaParts.length > 0 && (
                <span style={{ fontWeight: '400', fontSize: '11px', color: '#666' }}>
                  {' — '}{metaParts.join(' · ')}
                </span>
              )}
              {item.description && <div style={{ fontWeight: '400', fontSize: '11.5px', color: '#777', marginTop: '2px' }}>{item.description}</div>}
            </td>
          ),
          hsn: <td key="hsn" style={{ ...tdStyle, fontSize: '12px', color: '#777' }}>{item.hsnCode || '-'}</td>,
          qty: (
            <td key="qty" style={{ ...tdStyle, textAlign: 'right' }}>
              {fmtQty(qty)}{!showUnit && item.unit ? ` ${item.unit}` : ''}
            </td>
          ),
          unit: <td key="unit" style={{ ...tdStyle, textAlign: 'right', color: '#777', fontSize: '12px' }}>{item.unit || '-'}</td>,
          rate: (
            <td key="rate" style={{ ...tdStyle, textAlign: 'right' }}>
              ₹{price.toFixed(2)}
              {item.taxInclusive && taxRate > 0 && <div style={{ fontSize: '10px', color: '#888', marginTop: '1px' }}>Incl. GST</div>}
            </td>
          ),
          disc: <td key="disc" style={{ ...tdStyle, textAlign: 'right' }}>{discPct ? `${discPct}%` : '-'}</td>,
          tax: <TaxDataCells key="tax" tdStyle={tdStyle} taxRate={taxRate} useCGSTSGST={useCGSTSGST} useUTGST={useUTGST} useIGST={useIGST} isComposite={isComposite} showGST={showGST} />,
          amount: <td key="amount" style={{ ...tdStyle, textAlign: 'right', fontWeight: '700' }}>₹{lineTotal.toFixed(2)}</td>,
        };
        return (
          <tr key={idx} style={bg ? { backgroundColor: bg } : undefined}>
            {columns.map(k => cells[k])}
          </tr>
        );
      })}
    </>
  );
};

const TableHead = ({ thStyle, showHSN, showDisc, useCGSTSGST, useIGST, useUTGST, isComposite, showGST, itemLabel, opts }) => {
  const showSrNo = opts ? opts.showSrNo !== false : true;
  const showUnit = opts ? opts.showUnitColumn === true : false;
  const columns = resolveVisibleColumns(opts, showHSN, showDisc, showUnit, showSrNo);
  const cells = {
    srno: <th key="srno" style={{ ...thStyle, textAlign: 'center' }}>#</th>,
    item: <th key="item" style={{ ...thStyle, textAlign: 'left' }}>{itemLabel || 'Item Description'}</th>,
    hsn: <th key="hsn" style={{ ...thStyle, textAlign: 'left' }}>HSN/SAC</th>,
    qty: <th key="qty" style={{ ...thStyle, textAlign: 'right' }}>Qty</th>,
    unit: <th key="unit" style={{ ...thStyle, textAlign: 'right' }}>Unit</th>,
    rate: <th key="rate" style={{ ...thStyle, textAlign: 'right' }}>Rate</th>,
    disc: <th key="disc" style={{ ...thStyle, textAlign: 'right' }}>Disc%</th>,
    tax: <TaxHeaderCells key="tax" thStyle={thStyle} useCGSTSGST={useCGSTSGST} useUTGST={useUTGST} useIGST={useIGST} isComposite={isComposite} showGST={showGST} />,
    amount: <th key="amount" style={{ ...thStyle, textAlign: 'right' }}>Amount</th>,
  };
  return (
    <thead>
      <tr>
        {columns.map(k => cells[k])}
      </tr>
    </thead>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// THEME 1 — CLASSIC
// ════════════════════════════════════════════════════════════════════════════════

const ClassicTemplate = (p) => {
  const { transaction, business, dim, opts, isSale, headerTitle, showBalanceSection, currentBillTotal, balanceNum, openingBalance } = p;
  const acc = opts.themeColor || '#334155';
  const showGST = opts.showGSTColumn && !transaction.noGST;
  const { useIGST, useUTGST, isComposite, useCGSTSGST } = deriveGstFlags(transaction, showGST);
  const showDisc = opts.showDiscountColumn && transaction.items?.some(i => Number(i.discountPercent) > 0);
  const showHSN = opts.showHSNColumn !== false && transaction.items?.some(i => i.hsnCode);
  const pad = dim.pad;
  const colCount = countTableColumns(opts, showHSN, showDisc, useCGSTSGST, useUTGST, useIGST, isComposite, showGST);
  const tableStyles = narrowTableStyles(
    { padding: '9px 11px', fontWeight: '700', border: '1px solid #ccc', color: '#000', whiteSpace: 'nowrap', fontSize: '12.5px', backgroundColor: '#f3f4f6' },
    { padding: '9px 11px', border: '1px solid #ddd', color: '#000', verticalAlign: 'top', fontSize: '13px' },
    pad, colCount,
  );
  const th = tableStyles.th;
  const td = tableStyles.td;
  return (
    <div style={{ padding: resolveDocPadding(opts, pad), backgroundColor: '#fff', color: '#000', width: dim.width, minHeight: dim.minHeight, margin: 'auto', fontFamily: 'Arial, sans-serif', fontSize: '13.5px', lineHeight: 1.45, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', flex: 1 }}>
          {opts.showLogo && business.logo && <img src={business.logo} alt="" style={{ maxHeight: '60px', maxWidth: '130px', objectFit: 'contain' }} />}
          <div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: '#000', marginBottom: '4px' }}>{business.name}</div>
            {business.address && <div style={{ color: '#444', fontSize: '12.5px' }}>{business.address}</div>}
            {opts.showBusinessPhone !== false && business.phone && <div style={{ color: '#444', fontSize: '12.5px' }}>Ph: {business.phone}</div>}
            {opts.showBusinessEmail && business.email && <div style={{ color: '#444', fontSize: '12.5px' }}>{business.email}</div>}
            {opts.showGSTIN && business.gstNumber && <div style={{ color: '#444', fontSize: '12.5px' }}>GSTIN: {business.gstNumber}</div>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '18px', fontWeight: '800', color: acc, marginBottom: '6px' }}>{headerTitle}</div>
          {opts.showInvoiceNumber && <div style={{ fontSize: '13px', color: '#333' }}>Invoice #: {transaction.invoiceNumber}</div>}
          {opts.showDate && <div style={{ fontSize: '13px', color: '#333' }}>Date: {formatDate(transaction.date, opts.dateFormat)}</div>}
          {opts.showDueDate && transaction.dueDate && <div style={{ fontSize: '13px', color: '#333' }}>Due: {formatDate(transaction.dueDate, opts.dateFormat)}</div>}
          {opts.showPaymentMode && transaction.paymentMode && <div style={{ fontSize: '13px', color: '#333' }}>Mode: {transaction.paymentMode}</div>}
          {opts.showBilledBy && transaction.billedBy && <div style={{ fontSize: '13px', color: '#333' }}>Billed by: {transaction.billedBy}</div>}
        </div>
      </div>
      <hr style={{ border: 'none', borderTop: `2px solid ${acc}`, marginBottom: '14px' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', gap: '16px' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#888', letterSpacing: '0.07em', marginBottom: '5px' }}>{isSale ? 'Bill To' : 'Bill From'}</div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: '#000', marginBottom: '3px' }}>{transaction.partyName}</div>
          {opts.showPartyAddress !== false && transaction.partyAddress && <div style={{ color: '#444', fontSize: '12.5px' }}>{transaction.partyAddress}</div>}
          {opts.showPartyPhone !== false && transaction.partyPhone && <div style={{ color: '#444', fontSize: '12.5px' }}>Ph: {transaction.partyPhone}</div>}
          {opts.showPartyGSTIN !== false && transaction.partyGstNumber && <div style={{ color: '#444', fontSize: '12.5px' }}>GSTIN: {transaction.partyGstNumber}</div>}
        </div>
        <div style={{ textAlign: 'right', fontSize: '12.5px', color: '#555' }}>
          {opts.showPlaceOfSupply !== false && transaction.placeOfSupply && <div>Place of Supply: <strong style={{ color: '#000' }}>{transaction.placeOfSupply}</strong></div>}
          {(transaction.isInterState != null || transaction.gstType) && <div>Supply: <strong style={{ color: '#000' }}>{gstTypeLabel(transaction)}</strong></div>}
          {transaction.reverseCharge && <div style={{ color: '#b91c1c', fontWeight: '700' }}>Reverse Charge: Yes</div>}
        </div>
      </div>
      <table className="inv-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
        <TableHead thStyle={th} showHSN={showHSN} showDisc={showDisc} useCGSTSGST={useCGSTSGST} useIGST={useIGST} useUTGST={useUTGST} isComposite={isComposite} showGST={showGST} opts={opts} />
        <tbody>
          <ItemRows transaction={transaction} opts={opts} tdStyle={td} showHSN={showHSN} showDisc={showDisc} useCGSTSGST={useCGSTSGST} useIGST={useIGST} useUTGST={useUTGST} isComposite={isComposite} showGST={showGST} rowBg={i => i % 2 === 1 ? '#fafafa' : '#fff'} />
        </tbody>
      </table>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
        <TotalsBlock transaction={transaction} opts={opts} isSale={isSale} accentColor={acc} showBalanceSection={showBalanceSection} currentBillTotal={currentBillTotal} balanceNum={balanceNum} openingBalance={openingBalance} compact={pad < 36} />
      </div>
      <HsnBankRow business={business} opts={opts} bankWidth={pad < 36 ? '220px' : '260px'}>
        <HsnTaxSummary transaction={transaction} useIGST={useIGST} useUTGST={useUTGST} isComposite={isComposite} thStyle={{ ...th, backgroundColor: '#f9fafb' }} tdStyle={{ ...td, backgroundColor: '#fff' }} opts={opts} />
      </HsnBankRow>
      <InvoiceFooter opts={opts} business={business} transaction={transaction} accentColor={acc} />
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// THEME 2 — MODERN
// ════════════════════════════════════════════════════════════════════════════════

const ModernTemplate = (p) => {
  const { transaction, business, dim, opts, isSale, headerTitle, showBalanceSection, currentBillTotal, balanceNum, openingBalance } = p;
  const acc = opts.themeColor || '#334155';
  const lightAcc = lighten(acc, 0.52);
  const showGST = opts.showGSTColumn && !transaction.noGST;
  const { useIGST, useUTGST, isComposite, useCGSTSGST } = deriveGstFlags(transaction, showGST);
  const showDisc = opts.showDiscountColumn && transaction.items?.some(i => Number(i.discountPercent) > 0);
  const showHSN = opts.showHSNColumn !== false && transaction.items?.some(i => i.hsnCode);
  const pad = dim.pad;
  const headerPad = Math.max(16, pad - 18);
  const colCount = countTableColumns(opts, showHSN, showDisc, useCGSTSGST, useUTGST, useIGST, isComposite, showGST);
  const tableStyles = narrowTableStyles(
    { padding: '7px 12px', fontWeight: '700', color: '#fff', backgroundColor: acc, whiteSpace: 'nowrap', fontSize: '12px', border: 'none' },
    { padding: '7px 12px', color: '#222', verticalAlign: 'top', fontSize: '13px', borderBottom: '1px solid #eee' },
    pad, colCount,
  );
  const th = tableStyles.th;
  const td = tableStyles.td;
  return (
    <div style={{ backgroundColor: '#fff', color: '#000', width: dim.width, minHeight: dim.minHeight, margin: 'auto', fontFamily: "'Helvetica Neue', Arial, sans-serif", fontSize: '13.5px', lineHeight: 1.45, boxSizing: 'border-box' }}>
      <div style={{ backgroundColor: acc, padding: `${headerPad}px ${headerPad + 4}px`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {opts.showLogo && business.logo && (
            <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '6px', display: 'flex' }}>
              <img src={business.logo} alt="" style={{ maxHeight: '48px', maxWidth: '120px', objectFit: 'contain' }} />
            </div>
          )}
          <div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: '#fff' }}>{business.name}</div>
            {business.address && <div style={{ color: 'rgba(255,255,255,0.82)', fontSize: '12px', marginTop: '2px' }}>{business.address}</div>}
            {opts.showBusinessPhone !== false && business.phone && <div style={{ color: 'rgba(255,255,255,0.82)', fontSize: '12px' }}>Ph: {business.phone}</div>}
            {opts.showBusinessEmail && business.email && <div style={{ color: 'rgba(255,255,255,0.82)', fontSize: '12px' }}>{business.email}</div>}
            {opts.showGSTIN && business.gstNumber && <div style={{ color: 'rgba(255,255,255,0.82)', fontSize: '12px' }}>GSTIN: {business.gstNumber}</div>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '26px', fontWeight: '900', color: '#fff', letterSpacing: '-0.5px', lineHeight: 1 }}>{headerTitle}</div>
          {opts.showInvoiceNumber && <div style={{ color: 'rgba(255,255,255,0.88)', fontSize: '13px', marginTop: '6px' }}>#{transaction.invoiceNumber}</div>}
          {opts.showDate && <div style={{ color: 'rgba(255,255,255,0.88)', fontSize: '13px' }}>{formatDate(transaction.date, opts.dateFormat)}</div>}
          {opts.showDueDate && transaction.dueDate && <div style={{ color: 'rgba(255,255,255,0.88)', fontSize: '13px' }}>Due: {formatDate(transaction.dueDate, opts.dateFormat)}</div>}
          {opts.showPaymentMode && transaction.paymentMode && <div style={{ color: 'rgba(255,255,255,0.88)', fontSize: '13px' }}>Mode: {transaction.paymentMode}</div>}
          {opts.showBilledBy && transaction.billedBy && <div style={{ color: 'rgba(255,255,255,0.88)', fontSize: '13px' }}>Billed by: {transaction.billedBy}</div>}
        </div>
      </div>
      <div style={{ padding: resolveDocPadding(opts, pad, pad) }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', gap: '16px' }}>
          <div style={{ backgroundColor: lightAcc, borderRadius: '10px', padding: '14px 18px', flex: 1 }}>
            <div style={{ fontSize: '10.5px', fontWeight: '700', textTransform: 'uppercase', color: acc, letterSpacing: '0.08em', marginBottom: '6px' }}>{isSale ? 'Bill To' : 'Bill From'}</div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#000', marginBottom: '3px' }}>{transaction.partyName}</div>
            {opts.showPartyAddress !== false && transaction.partyAddress && <div style={{ color: '#555', fontSize: '12.5px' }}>{transaction.partyAddress}</div>}
            {opts.showPartyPhone !== false && transaction.partyPhone && <div style={{ color: '#555', fontSize: '12.5px' }}>Ph: {transaction.partyPhone}</div>}
            {opts.showPartyGSTIN !== false && transaction.partyGstNumber && <div style={{ color: '#555', fontSize: '12.5px' }}>GSTIN: {transaction.partyGstNumber}</div>}
          </div>
          <div style={{ textAlign: 'right', fontSize: '12.5px', color: '#555', paddingTop: '4px', flexShrink: 0 }}>
            {opts.showPlaceOfSupply !== false && transaction.placeOfSupply && <div>Place of Supply: <strong style={{ color: '#000' }}>{transaction.placeOfSupply}</strong></div>}
            {(transaction.isInterState != null || transaction.gstType) && <div>{gstTypeLabel(transaction)}</div>}
            {transaction.reverseCharge && <div style={{ color: '#b91c1c', fontWeight: '700' }}>Reverse Charge: Yes</div>}
          </div>
        </div>
        <table className="inv-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
          <TableHead thStyle={th} showHSN={showHSN} showDisc={showDisc} useCGSTSGST={useCGSTSGST} useIGST={useIGST} useUTGST={useUTGST} isComposite={isComposite} showGST={showGST} opts={opts} />
          <tbody>
            <ItemRows transaction={transaction} opts={opts} tdStyle={td} showHSN={showHSN} showDisc={showDisc} useCGSTSGST={useCGSTSGST} useIGST={useIGST} useUTGST={useUTGST} isComposite={isComposite} showGST={showGST} rowBg={i => i % 2 === 0 ? '#fff' : lightAcc} />
          </tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
          <TotalsBlock transaction={transaction} opts={opts} isSale={isSale} accentColor={acc} showBalanceSection={showBalanceSection} currentBillTotal={currentBillTotal} balanceNum={balanceNum} openingBalance={openingBalance} compact={pad < 36} />
        </div>
        <HsnBankRow business={business} opts={opts} bankWidth={pad < 36 ? '220px' : '260px'}>
          <HsnTaxSummary transaction={transaction} useIGST={useIGST} useUTGST={useUTGST} isComposite={isComposite} thStyle={{ ...th, backgroundColor: lighten(acc, 0.2), fontSize: '10.5px' }} tdStyle={{ ...td, fontSize: '11px', borderBottom: '1px solid #f0f0f0' }} opts={opts} />
        </HsnBankRow>
        <InvoiceFooter opts={opts} business={business} transaction={transaction} accentColor={acc} />
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// THEME 3 — COMPACT
// ════════════════════════════════════════════════════════════════════════════════

const CompactTemplate = (p) => {
  const { transaction, business, dim, opts, isSale, headerTitle, showBalanceSection, currentBillTotal, balanceNum, openingBalance } = p;
  const acc = opts.themeColor || '#334155';
  const showGST = opts.showGSTColumn && !transaction.noGST;
  const { useIGST, useUTGST, isComposite, useCGSTSGST } = deriveGstFlags(transaction, showGST);
  const showDisc = opts.showDiscountColumn && transaction.items?.some(i => Number(i.discountPercent) > 0);
  const showHSN = opts.showHSNColumn !== false && transaction.items?.some(i => i.hsnCode);
  const pad = dim.pad;
  const colCount = countTableColumns(opts, showHSN, showDisc, useCGSTSGST, useUTGST, useIGST, isComposite, showGST);
  const tableStyles = narrowTableStyles(
    { padding: '6px 8px', fontWeight: '700', borderBottom: `2px solid ${acc}`, borderTop: '1px solid #ddd', color: '#333', whiteSpace: 'nowrap', fontSize: '11.5px' },
    { padding: '6px 8px', color: '#222', verticalAlign: 'top', fontSize: '12px', borderBottom: '1px solid #eee' },
    pad, colCount,
  );
  const th = tableStyles.th;
  const td = tableStyles.td;
  return (
    <div style={{ padding: resolveDocPadding(opts, pad), backgroundColor: '#fff', color: '#000', width: dim.width, minHeight: dim.minHeight, margin: 'auto', fontFamily: 'Arial, sans-serif', fontSize: '12.5px', lineHeight: 1.4, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `2px solid ${acc}`, paddingBottom: '12px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          {opts.showLogo && business.logo && <img src={business.logo} alt="" style={{ maxHeight: '44px', maxWidth: '100px', objectFit: 'contain' }} />}
          <div>
            <div style={{ fontSize: '17px', fontWeight: '800', color: '#000' }}>{business.name}</div>
            {business.address && <div style={{ color: '#555', fontSize: '11px' }}>{business.address}</div>}
            {opts.showBusinessPhone !== false && business.phone && <div style={{ color: '#555', fontSize: '11px' }}>Ph: {business.phone}</div>}
            {opts.showBusinessEmail && business.email && <div style={{ color: '#555', fontSize: '11px' }}>{business.email}</div>}
            {opts.showGSTIN && business.gstNumber && <div style={{ color: '#555', fontSize: '11px' }}>GSTIN: {business.gstNumber}</div>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '15px', fontWeight: '800', color: acc }}>{headerTitle}</div>
          {opts.showInvoiceNumber && <div style={{ color: '#444', fontSize: '11px' }}>#{transaction.invoiceNumber}</div>}
          {opts.showDate && <div style={{ color: '#444', fontSize: '11px' }}>{formatDate(transaction.date, opts.dateFormat)}</div>}
          {opts.showDueDate && transaction.dueDate && <div style={{ color: '#444', fontSize: '11px' }}>Due: {formatDate(transaction.dueDate, opts.dateFormat)}</div>}
          {opts.showBilledBy && transaction.billedBy && <div style={{ color: '#444', fontSize: '11px' }}>By: {transaction.billedBy}</div>}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', gap: '12px', fontSize: '12px' }}>
        <div>
          <span style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', color: '#888', letterSpacing: '0.07em' }}>{isSale ? 'Bill To: ' : 'From: '}</span>
          <strong style={{ color: '#000' }}>{transaction.partyName}</strong>
          {opts.showPartyAddress !== false && transaction.partyAddress && <span style={{ color: '#555' }}> · {transaction.partyAddress}</span>}
          {opts.showPartyGSTIN !== false && transaction.partyGstNumber && <span style={{ color: '#555' }}> · GSTIN: {transaction.partyGstNumber}</span>}
        </div>
        <div style={{ textAlign: 'right', fontSize: '11px', color: '#555', flexShrink: 0 }}>
          {opts.showPlaceOfSupply !== false && transaction.placeOfSupply && <div>Supply: <strong style={{ color: '#000' }}>{transaction.placeOfSupply}</strong></div>}
          {(transaction.isInterState != null || transaction.gstType) && <div>{gstTypeLabel(transaction)}</div>}
        </div>
      </div>
      <table className="inv-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px' }}>
        <TableHead thStyle={th} showHSN={showHSN} showDisc={showDisc} useCGSTSGST={useCGSTSGST} useIGST={useIGST} useUTGST={useUTGST} isComposite={isComposite} showGST={showGST} itemLabel="Item" opts={opts} />
        <tbody>
          <ItemRows transaction={transaction} opts={opts} tdStyle={td} showHSN={showHSN} showDisc={showDisc} useCGSTSGST={useCGSTSGST} useIGST={useIGST} useUTGST={useUTGST} isComposite={isComposite} showGST={showGST} />
        </tbody>
      </table>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
        <TotalsBlock transaction={transaction} opts={opts} isSale={isSale} accentColor={acc} showBalanceSection={showBalanceSection} currentBillTotal={currentBillTotal} balanceNum={balanceNum} openingBalance={openingBalance} compact />
      </div>
      <HsnBankRow business={business} opts={opts} bankWidth="220px">
        <HsnTaxSummary transaction={transaction} useIGST={useIGST} useUTGST={useUTGST} isComposite={isComposite} thStyle={{ ...th, fontSize: '10px' }} tdStyle={{ ...td, fontSize: '10.5px' }} opts={opts} />
      </HsnBankRow>
      <InvoiceFooter opts={opts} business={business} transaction={transaction} accentColor={acc} />
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// THEME 4 — ELEGANT
// ════════════════════════════════════════════════════════════════════════════════

const ElegantTemplate = (p) => {
  const { transaction, business, dim, opts, isSale, headerTitle, showBalanceSection, currentBillTotal, balanceNum, openingBalance } = p;
  const acc = opts.themeColor || '#334155';
  const lightAcc = lighten(acc, 0.56);
  const showGST = opts.showGSTColumn && !transaction.noGST;
  const { useIGST, useUTGST, isComposite, useCGSTSGST } = deriveGstFlags(transaction, showGST);
  const showDisc = opts.showDiscountColumn && transaction.items?.some(i => Number(i.discountPercent) > 0);
  const showHSN = opts.showHSNColumn !== false && transaction.items?.some(i => i.hsnCode);
  const pad = dim.pad;
  const colCount = countTableColumns(opts, showHSN, showDisc, useCGSTSGST, useUTGST, useIGST, isComposite, showGST);
  const tableStyles = narrowTableStyles(
    { padding: '7px 14px', fontWeight: '700', color: acc, borderBottom: `1px solid ${acc}`, whiteSpace: 'nowrap', fontSize: '12px', letterSpacing: '0.03em' },
    { padding: '7px 14px', color: '#222', verticalAlign: 'top', fontSize: '13px', borderBottom: '1px solid #f0f0f0' },
    pad, colCount,
  );
  const th = tableStyles.th;
  const td = tableStyles.td;
  return (
    <div style={{ backgroundColor: '#fff', color: '#000', width: dim.width, minHeight: dim.minHeight, margin: 'auto', fontFamily: 'Georgia, serif', fontSize: '13.5px', lineHeight: 1.5, boxSizing: 'border-box', display: 'flex' }}>
      <div style={{ width: '6px', backgroundColor: acc, flexShrink: 0 }} />
      <div style={{ flex: 1, padding: resolveDocPadding(opts, pad, pad - 4) }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
          <div>
            {opts.showLogo && business.logo && <img src={business.logo} alt="" style={{ maxHeight: '56px', maxWidth: '120px', objectFit: 'contain', marginBottom: '8px', display: 'block' }} />}
            <div style={{ fontSize: '24px', fontWeight: '400', color: '#000', letterSpacing: '-0.3px' }}>{business.name}</div>
            {business.address && <div style={{ color: '#666', fontSize: '12.5px', marginTop: '2px' }}>{business.address}</div>}
            {opts.showBusinessPhone !== false && business.phone && <div style={{ color: '#666', fontSize: '12.5px' }}>Ph: {business.phone}</div>}
            {opts.showBusinessEmail && business.email && <div style={{ color: '#666', fontSize: '12.5px' }}>{business.email}</div>}
            {opts.showGSTIN && business.gstNumber && <div style={{ color: '#666', fontSize: '12.5px' }}>GSTIN: {business.gstNumber}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '13px', fontWeight: '700', letterSpacing: '0.12em', textTransform: 'uppercase', color: acc, marginBottom: '8px' }}>{headerTitle}</div>
            {opts.showInvoiceNumber && <div style={{ color: '#888', fontSize: '12px' }}>No. {transaction.invoiceNumber}</div>}
            {opts.showDate && <div style={{ color: '#888', fontSize: '12px' }}>{formatDate(transaction.date, opts.dateFormat)}</div>}
            {opts.showDueDate && transaction.dueDate && <div style={{ color: '#888', fontSize: '12px' }}>Due: {formatDate(transaction.dueDate, opts.dateFormat)}</div>}
            {opts.showBilledBy && transaction.billedBy && <div style={{ color: '#888', fontSize: '12px' }}>Billed by: {transaction.billedBy}</div>}
          </div>
        </div>
        <div style={{ borderTop: `1px solid ${lightAcc}`, marginBottom: '14px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '10.5px', fontWeight: '700', textTransform: 'uppercase', color: acc, letterSpacing: '0.1em', marginBottom: '6px' }}>{isSale ? 'Bill To' : 'Bill From'}</div>
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#000', marginBottom: '4px', fontFamily: "'Helvetica Neue', sans-serif" }}>{transaction.partyName}</div>
            {opts.showPartyAddress !== false && transaction.partyAddress && <div style={{ color: '#555', fontSize: '12.5px' }}>{transaction.partyAddress}</div>}
            {opts.showPartyPhone !== false && transaction.partyPhone && <div style={{ color: '#555', fontSize: '12.5px' }}>Ph: {transaction.partyPhone}</div>}
            {opts.showPartyGSTIN !== false && transaction.partyGstNumber && <div style={{ color: '#555', fontSize: '12.5px' }}>GSTIN: {transaction.partyGstNumber}</div>}
          </div>
          <div style={{ textAlign: 'right', fontSize: '12px', color: '#777' }}>
            {opts.showPlaceOfSupply !== false && transaction.placeOfSupply && <div>Place of Supply: <strong style={{ color: '#333' }}>{transaction.placeOfSupply}</strong></div>}
            {(transaction.isInterState != null || transaction.gstType) && <div>{gstTypeLabel(transaction)}</div>}
            {transaction.reverseCharge && <div style={{ color: '#b91c1c', fontWeight: '700', fontFamily: 'sans-serif' }}>Reverse Charge: Yes</div>}
          </div>
        </div>
        <table className="inv-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px', fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
          <TableHead thStyle={th} showHSN={showHSN} showDisc={showDisc} useCGSTSGST={useCGSTSGST} useIGST={useIGST} useUTGST={useUTGST} isComposite={isComposite} showGST={showGST} itemLabel="Description" opts={opts} />
          <tbody>
            <ItemRows transaction={transaction} opts={opts} tdStyle={td} showHSN={showHSN} showDisc={showDisc} useCGSTSGST={useCGSTSGST} useIGST={useIGST} useUTGST={useUTGST} isComposite={isComposite} showGST={showGST} />
          </tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px', fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
          <TotalsBlock transaction={transaction} opts={opts} isSale={isSale} accentColor={acc} showBalanceSection={showBalanceSection} currentBillTotal={currentBillTotal} balanceNum={balanceNum} openingBalance={openingBalance} compact={pad < 36} />
        </div>
        <HsnBankRow business={business} opts={opts} bankWidth={pad < 36 ? '220px' : '260px'}>
          <HsnTaxSummary transaction={transaction} useIGST={useIGST} useUTGST={useUTGST} isComposite={isComposite} thStyle={{ ...th, fontSize: '10.5px' }} tdStyle={{ ...td, fontSize: '11px' }} opts={opts} />
        </HsnBankRow>
        <div style={{ borderTop: `1px solid ${lightAcc}`, marginBottom: '10px' }} />
        <InvoiceFooter opts={opts} business={business} transaction={transaction} accentColor={acc} />
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// THEME 5 — BOLD
// ════════════════════════════════════════════════════════════════════════════════

const BoldTemplate = (p) => {
  const { transaction, business, dim, opts, isSale, headerTitle, showBalanceSection, currentBillTotal, balanceNum, openingBalance } = p;
  const acc = opts.themeColor || '#334155';
  const lightAcc = lighten(acc, 0.54);
  const showGST = opts.showGSTColumn && !transaction.noGST;
  const { useIGST, useUTGST, isComposite, useCGSTSGST } = deriveGstFlags(transaction, showGST);
  const showDisc = opts.showDiscountColumn && transaction.items?.some(i => Number(i.discountPercent) > 0);
  const showHSN = opts.showHSNColumn !== false && transaction.items?.some(i => i.hsnCode);
  const pad = dim.pad;
  const colCount = countTableColumns(opts, showHSN, showDisc, useCGSTSGST, useUTGST, useIGST, isComposite, showGST);
  const tableStyles = narrowTableStyles(
    { padding: '7px 13px', fontWeight: '800', backgroundColor: '#1a1a2e', color: '#fff', whiteSpace: 'nowrap', fontSize: '12px', letterSpacing: '0.04em', textTransform: 'uppercase' },
    { padding: '7px 13px', color: '#1a1a2e', verticalAlign: 'top', fontSize: '13px', borderBottom: '1px solid #e8e8e8' },
    pad, colCount,
  );
  const th = tableStyles.th;
  const td = tableStyles.td;
  return (
    <div style={{ backgroundColor: '#fff', color: '#000', width: dim.width, minHeight: dim.minHeight, margin: 'auto', fontFamily: "'Helvetica Neue', Arial, sans-serif", fontSize: '13.5px', lineHeight: 1.45, boxSizing: 'border-box' }}>
      <div style={{ backgroundColor: '#1a1a2e' }}>
        <div style={{ backgroundColor: acc, height: '6px' }} />
        <div style={{ padding: `${Math.max(14, pad - 18)}px ${pad}px`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {opts.showLogo && business.logo && (
              <div style={{ backgroundColor: '#fff', borderRadius: '6px', padding: '5px', display: 'inline-flex' }}>
                <img src={business.logo} alt="" style={{ maxHeight: '44px', maxWidth: '110px', objectFit: 'contain' }} />
              </div>
            )}
            <div>
              <div style={{ fontSize: '22px', fontWeight: '900', color: '#fff', letterSpacing: '-0.5px' }}>{business.name}</div>
              {business.address && <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '11.5px', marginTop: '2px' }}>{business.address}</div>}
              {opts.showBusinessPhone !== false && business.phone && <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '11.5px' }}>Ph: {business.phone}</div>}
              {opts.showBusinessEmail && business.email && <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '11.5px' }}>{business.email}</div>}
              {opts.showGSTIN && business.gstNumber && <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '11.5px' }}>GSTIN: {business.gstNumber}</div>}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '22px', fontWeight: '900', color: acc, letterSpacing: '-0.5px' }}>{headerTitle}</div>
            {opts.showInvoiceNumber && <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '12px', marginTop: '4px' }}>#{transaction.invoiceNumber}</div>}
            {opts.showDate && <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '12px' }}>{formatDate(transaction.date, opts.dateFormat)}</div>}
            {opts.showDueDate && transaction.dueDate && <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '12px' }}>Due: {formatDate(transaction.dueDate, opts.dateFormat)}</div>}
            {opts.showBilledBy && transaction.billedBy && <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '12px' }}>Billed by: {transaction.billedBy}</div>}
          </div>
        </div>
      </div>
      <div style={{ padding: resolveDocPadding(opts, pad, pad) }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', gap: '16px', alignItems: 'flex-start' }}>
          <div style={{ borderLeft: `4px solid ${acc}`, paddingLeft: '14px' }}>
            <div style={{ fontSize: '10.5px', fontWeight: '800', textTransform: 'uppercase', color: acc, letterSpacing: '0.1em', marginBottom: '5px' }}>{isSale ? 'Bill To' : 'Bill From'}</div>
            <div style={{ fontSize: '16px', fontWeight: '800', color: '#1a1a2e', marginBottom: '3px' }}>{transaction.partyName}</div>
            {opts.showPartyAddress !== false && transaction.partyAddress && <div style={{ color: '#555', fontSize: '12.5px' }}>{transaction.partyAddress}</div>}
            {opts.showPartyPhone !== false && transaction.partyPhone && <div style={{ color: '#555', fontSize: '12.5px' }}>Ph: {transaction.partyPhone}</div>}
            {opts.showPartyGSTIN !== false && transaction.partyGstNumber && <div style={{ color: '#555', fontSize: '12.5px' }}>GSTIN: {transaction.partyGstNumber}</div>}
          </div>
          <div style={{ backgroundColor: lightAcc, borderRadius: '8px', padding: '12px 16px', fontSize: '12px', color: '#333', textAlign: 'right', flexShrink: 0 }}>
            {opts.showPlaceOfSupply !== false && transaction.placeOfSupply && <div>Supply: <strong style={{ color: '#1a1a2e' }}>{transaction.placeOfSupply}</strong></div>}
            {(transaction.isInterState != null || transaction.gstType) && <div>{gstTypeLabel(transaction)}</div>}
            {transaction.reverseCharge && <div style={{ color: '#b91c1c', fontWeight: '700' }}>Reverse Charge: Yes</div>}
          </div>
        </div>
        <table className="inv-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
          <TableHead thStyle={th} showHSN={showHSN} showDisc={showDisc} useCGSTSGST={useCGSTSGST} useIGST={useIGST} useUTGST={useUTGST} isComposite={isComposite} showGST={showGST} itemLabel="Item" opts={opts} />
          <tbody>
            <ItemRows transaction={transaction} opts={opts} tdStyle={td} showHSN={showHSN} showDisc={showDisc} useCGSTSGST={useCGSTSGST} useIGST={useIGST} useUTGST={useUTGST} isComposite={isComposite} showGST={showGST} rowBg={i => i % 2 === 0 ? '#fff' : lightAcc} />
          </tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
          <TotalsBlock transaction={transaction} opts={opts} isSale={isSale} accentColor={acc} showBalanceSection={showBalanceSection} currentBillTotal={currentBillTotal} balanceNum={balanceNum} openingBalance={openingBalance} compact={pad < 36} />
        </div>
        <HsnBankRow business={business} opts={opts} bankWidth={pad < 36 ? '220px' : '260px'}>
          <HsnTaxSummary transaction={transaction} useIGST={useIGST} useUTGST={useUTGST} isComposite={isComposite} thStyle={{ ...th, backgroundColor: '#2d2d4e', fontSize: '10.5px' }} tdStyle={{ ...td, fontSize: '11px' }} opts={opts} />
        </HsnBankRow>
        <InvoiceFooter opts={opts} business={business} transaction={transaction} accentColor={acc} />
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// THEME 6 — MINIMAL
// ════════════════════════════════════════════════════════════════════════════════

const MinimalTemplate = (p) => {
  const { transaction, business, dim, opts, isSale, headerTitle, showBalanceSection, currentBillTotal, balanceNum, openingBalance } = p;
  const acc = opts.themeColor || '#334155';
  const showGST = opts.showGSTColumn && !transaction.noGST;
  const { useIGST, useUTGST, isComposite, useCGSTSGST } = deriveGstFlags(transaction, showGST);
  const showDisc = opts.showDiscountColumn && transaction.items?.some(i => Number(i.discountPercent) > 0);
  const showHSN = opts.showHSNColumn !== false && transaction.items?.some(i => i.hsnCode);
  const pad = dim.pad;

  const discountAmount = transaction.discountAmount ?? 0;
  const advanceAmount = transaction.advance ?? 0;
  const balanceDue = Math.max(0, (transaction.totalAmount ?? 0) - advanceAmount);

  const divLine = { borderTop: '1px solid #e5e5e5', margin: '10px 0' };
  // This theme uses fixed-px flex column widths instead of a <table> — those
  // widths alone (70+50+70+50+60+80 ≈ 380px) already exceed A6's ~360px
  // usable width before the flexible Item column gets any space at all, so
  // narrow paper needs them scaled down, not just font/padding.
  const colCount = countTableColumns(opts, showHSN, showDisc, useCGSTSGST, useUTGST, useIGST, isComposite, showGST);
  const narrow = pad < 36 || colCount >= 8;
  const colScale = narrow ? (pad < 22 ? 0.55 : 0.75) : 1;
  const colW = (px) => `${Math.max(28, Math.round(px * colScale))}px`;
  const itemFs = narrow ? '11px' : '13px';
  return (
    <div style={{ padding: resolveDocPadding(opts, pad, pad + 4), backgroundColor: '#fff', color: '#000', width: dim.width, minHeight: dim.minHeight, margin: 'auto', fontFamily: "'Helvetica Neue', Arial, sans-serif", fontSize: '13px', lineHeight: 1.45, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div>
          {opts.showLogo && business.logo && <img src={business.logo} alt="" style={{ maxHeight: '52px', maxWidth: '120px', objectFit: 'contain', marginBottom: '10px', display: 'block' }} />}
          <div style={{ fontSize: '20px', fontWeight: '300', color: '#111', letterSpacing: '-0.3px' }}>{business.name}</div>
          {business.address && <div style={{ color: '#888', fontSize: '12px', marginTop: '4px' }}>{business.address}</div>}
          {opts.showBusinessPhone !== false && business.phone && <div style={{ color: '#888', fontSize: '12px' }}>Ph: {business.phone}</div>}
          {opts.showBusinessEmail && business.email && <div style={{ color: '#888', fontSize: '12px' }}>{business.email}</div>}
          {opts.showGSTIN && business.gstNumber && <div style={{ color: '#888', fontSize: '12px' }}>GSTIN: {business.gstNumber}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '32px', fontWeight: '800', color: acc, lineHeight: 1 }}>{headerTitle}</div>
          {opts.showInvoiceNumber && <div style={{ color: '#666', fontSize: '13px', marginTop: '8px' }}>#{transaction.invoiceNumber}</div>}
          {opts.showDate && <div style={{ color: '#666', fontSize: '13px' }}>{formatDate(transaction.date, opts.dateFormat)}</div>}
          {opts.showDueDate && transaction.dueDate && <div style={{ color: '#666', fontSize: '13px' }}>Due: {formatDate(transaction.dueDate, opts.dateFormat)}</div>}
          {opts.showBilledBy && transaction.billedBy && <div style={{ color: '#666', fontSize: '13px' }}>Billed by: {transaction.billedBy}</div>}
        </div>
      </div>
      <div style={divLine} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '18px', gap: '24px' }}>
        <div>
          <div style={{ fontSize: '10px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '8px' }}>{isSale ? 'Bill To' : 'Bill From'}</div>
          <div style={{ fontSize: '17px', fontWeight: '600', color: '#111' }}>{transaction.partyName}</div>
          {opts.showPartyAddress !== false && transaction.partyAddress && <div style={{ color: '#777', fontSize: '12.5px', marginTop: '3px' }}>{transaction.partyAddress}</div>}
          {opts.showPartyPhone !== false && transaction.partyPhone && <div style={{ color: '#777', fontSize: '12.5px' }}>Ph: {transaction.partyPhone}</div>}
          {opts.showPartyGSTIN !== false && transaction.partyGstNumber && <div style={{ color: '#777', fontSize: '12.5px' }}>GSTIN: {transaction.partyGstNumber}</div>}
        </div>
        <div style={{ textAlign: 'right', fontSize: '12px', color: '#999' }}>
          {opts.showPlaceOfSupply !== false && transaction.placeOfSupply && <div>Place of Supply: <span style={{ color: '#555' }}>{transaction.placeOfSupply}</span></div>}
          {(transaction.isInterState != null || transaction.gstType) && <div>{gstTypeLabel(transaction)}</div>}
        </div>
      </div>
      {/* Items as text lines */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px', paddingBottom: '8px', borderBottom: '1px solid #ccc' }}>
          <div style={{ fontSize: '11px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em', flex: 1 }}>Item</div>
          {showHSN && <div style={{ fontSize: '11px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em', width: colW(70), textAlign: 'right' }}>HSN</div>}
          <div style={{ fontSize: '11px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em', width: colW(50), textAlign: 'right' }}>Qty</div>
          <div style={{ fontSize: '11px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em', width: colW(70), textAlign: 'right' }}>Rate</div>
          {showDisc && <div style={{ fontSize: '11px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em', width: colW(50), textAlign: 'right' }}>Disc%</div>}
          {useCGSTSGST && <div style={{ fontSize: '11px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em', width: colW(60), textAlign: 'right' }}>GST%</div>}
          {useUTGST && <div style={{ fontSize: '11px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em', width: colW(60), textAlign: 'right' }}>GST%</div>}
          {useIGST && <div style={{ fontSize: '11px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em', width: colW(60), textAlign: 'right' }}>IGST%</div>}
          {isComposite && <div style={{ fontSize: '11px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em', width: colW(60), textAlign: 'right' }}>Comp.%</div>}
          <div style={{ fontSize: '11px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em', width: colW(80), textAlign: 'right' }}>Amount</div>
        </div>
        {(transaction.items || []).map((item, idx) => {
          const qty = Number(item.qty) || 0;
          const price = Number(item.price) || 0;
          const discPct = Number(item.discountPercent) || 0;
          const taxRate = Number(item.taxRate) || 0;
          const lineTotal = calcLineTotal(item);
          return (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '7px 0', borderBottom: '1px solid #f0f0f0' }}>
              <div style={{ flex: 1, minWidth: 0, wordBreak: 'break-word' }}>
                <span style={{ fontWeight: '500', color: '#111', fontSize: itemFs }}>{item.name}</span>
                {(() => { const mp = [opts.showItemCategory && item.category, opts.showItemSize === true && item.size && `Size: ${item.size}`, opts.showItemVariant === true && item.variant].filter(Boolean); return mp.length > 0 ? <span style={{ fontWeight: '400', fontSize: '11px', color: '#666' }}>{' — '}{mp.join(' · ')}</span> : null; })()}
                {item.description && <div style={{ color: '#999', fontSize: '11.5px', marginTop: '2px' }}>{item.description}</div>}
              </div>
              {showHSN && <div style={{ width: colW(70), textAlign: 'right', color: '#999', fontSize: itemFs }}>{item.hsnCode || '-'}</div>}
              <div style={{ width: colW(50), textAlign: 'right', color: '#555', fontSize: itemFs }}>{fmtQty(qty)}{item.unit ? ` ${item.unit}` : ''}</div>
              <div style={{ width: colW(70), textAlign: 'right', color: '#555', fontSize: itemFs }}>₹{price.toFixed(2)}</div>
              {showDisc && <div style={{ width: colW(50), textAlign: 'right', color: '#555', fontSize: itemFs }}>{discPct ? `${discPct}%` : '-'}</div>}
              {(useCGSTSGST || useUTGST || useIGST || isComposite) && <div style={{ width: colW(60), textAlign: 'right', color: '#555', fontSize: itemFs }}>{taxRate ? `${taxRate}%` : '-'}</div>}
              <div style={{ width: colW(80), textAlign: 'right', fontWeight: '600', color: '#111', fontSize: itemFs }}>₹{lineTotal.toFixed(2)}</div>
            </div>
          );
        })}
      </div>
      {/* Totals as text */}
      <div style={{ width: '280px', marginLeft: 'auto', marginBottom: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#777', fontSize: '13px', marginBottom: '3px' }}>
          <span>Subtotal</span><span>₹{(transaction.subtotal ?? 0).toFixed(2)}</span>
        </div>
        {discountAmount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#777', fontSize: '13px', marginBottom: '3px' }}><span>Discount</span><span>-₹{discountAmount.toFixed(2)}</span></div>}
        {isComposite && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#777', fontSize: '13px', marginBottom: '3px' }}><span>Composition Tax</span><span>₹{(transaction.taxAmount ?? 0).toFixed(2)}</span></div>}
        {useIGST && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#777', fontSize: '13px', marginBottom: '3px' }}><span>IGST</span><span>₹{(transaction.taxAmount ?? 0).toFixed(2)}</span></div>}
        {useCGSTSGST && <><div style={{ display: 'flex', justifyContent: 'space-between', color: '#777', fontSize: '13px', marginBottom: '3px' }}><span>CGST</span><span>₹{((transaction.taxAmount ?? 0) / 2).toFixed(2)}</span></div><div style={{ display: 'flex', justifyContent: 'space-between', color: '#777', fontSize: '13px', marginBottom: '3px' }}><span>SGST</span><span>₹{((transaction.taxAmount ?? 0) / 2).toFixed(2)}</span></div></>}
        {useUTGST && <><div style={{ display: 'flex', justifyContent: 'space-between', color: '#777', fontSize: '13px', marginBottom: '3px' }}><span>CGST</span><span>₹{((transaction.taxAmount ?? 0) / 2).toFixed(2)}</span></div><div style={{ display: 'flex', justifyContent: 'space-between', color: '#777', fontSize: '13px', marginBottom: '3px' }}><span>UTGST</span><span>₹{((transaction.taxAmount ?? 0) / 2).toFixed(2)}</span></div></>}
        {(transaction.packingCharge ?? 0) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#777', fontSize: '13px', marginBottom: '3px' }}><span>Packing Charges</span><span>₹{Number(transaction.packingCharge).toFixed(2)}</span></div>}
        {(transaction.shippingCharge ?? 0) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#777', fontSize: '13px', marginBottom: '3px' }}><span>Shipping Charges</span><span>₹{Number(transaction.shippingCharge).toFixed(2)}</span></div>}
        {transaction.roundOffAmount != null && transaction.roundOffAmount !== 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#777', fontSize: '13px', marginBottom: '3px' }}><span>Round Off</span><span>{transaction.roundOffAmount >= 0 ? '+' : ''}₹{Number(transaction.roundOffAmount).toFixed(2)}</span></div>}
        {(transaction.loyaltyRedeemValue ?? 0) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#b45309', fontSize: '13px', marginBottom: '3px' }}><span>{opts.loyalty?.programName || 'Loyalty'} ({transaction.loyaltyPointsRedeemed ?? 0} pts)</span><span>-₹{Number(transaction.loyaltyRedeemValue).toFixed(2)}</span></div>}
        <div style={divLine} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: '14px', color: '#555' }}>Grand Total</span>
          <span style={{ fontSize: '28px', fontWeight: '800', color: acc }}>₹{(transaction.totalAmount ?? 0).toFixed(2)}</span>
        </div>
        {advanceAmount > 0 && (
          <>
            <div style={divLine} />
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#334155', fontSize: '13px', marginBottom: '4px' }}><span>{isSale ? 'Advance Received' : 'Advance Paid'}</span><span>-₹{advanceAmount.toFixed(2)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#dc2626', fontWeight: '700', fontSize: '14px' }}><span>{isSale ? 'Balance Due' : 'Balance Payable'}</span><span>₹{balanceDue.toFixed(2)}</span></div>
          </>
        )}
        {showBalanceSection && (
          <>
            <div style={divLine} />
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#777', fontSize: '13px', marginBottom: '4px' }}><span>Opening Balance</span><span>₹{(openingBalance ?? 0).toFixed(2)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#777', fontSize: '13px', marginBottom: '4px' }}><span>Current Bill</span><span>₹{currentBillTotal.toFixed(2)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700', fontSize: '14px' }}><span>Total Pending</span><span>₹{(balanceNum ?? 0).toFixed(2)}</span></div>
          </>
        )}
        {opts.showAmountInWords && (
          <div style={{ marginTop: '10px', padding: '8px 10px', background: '#f9fafb', borderRadius: '6px' }}>
            <span style={{ fontSize: '11px', color: '#555', fontStyle: 'italic' }}>
              <strong style={{ color: '#333', fontStyle: 'normal' }}>Amount: </strong>
              Rupees {numberToWords(transaction.totalAmount ?? 0)}
            </span>
          </div>
        )}
      </div>
      <HsnBankRow business={business} opts={opts} bankWidth="280px">
        <HsnTaxSummary transaction={transaction} useIGST={useIGST} useUTGST={useUTGST} isComposite={isComposite} thStyle={{ padding: '6px 8px', fontWeight: '700', borderBottom: '1px solid #ccc', borderTop: '1px solid #ccc', color: '#444', whiteSpace: 'nowrap', fontSize: '10.5px' }} tdStyle={{ padding: '6px 8px', color: '#333', verticalAlign: 'top', fontSize: '11px', borderBottom: '1px solid #f0f0f0' }} opts={opts} />
      </HsnBankRow>
      <InvoiceFooter opts={opts} business={business} transaction={transaction} accentColor={acc} />
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// THEME 7 — CORPORATE
// ════════════════════════════════════════════════════════════════════════════════

const CorporateTemplate = (p) => {
  const { transaction, business, dim, opts, isSale, headerTitle, showBalanceSection, currentBillTotal, balanceNum, openingBalance } = p;
  const acc = opts.themeColor || '#334155';
  const lightAcc = lighten(acc, 0.58);
  const showGST = opts.showGSTColumn && !transaction.noGST;
  const { useIGST, useUTGST, isComposite, useCGSTSGST } = deriveGstFlags(transaction, showGST);
  const showDisc = opts.showDiscountColumn && transaction.items?.some(i => Number(i.discountPercent) > 0);
  const showHSN = opts.showHSNColumn !== false && transaction.items?.some(i => i.hsnCode);
  const pad = dim.pad;
  const colCount = countTableColumns(opts, showHSN, showDisc, useCGSTSGST, useUTGST, useIGST, isComposite, showGST);
  const tableStyles = narrowTableStyles(
    { padding: '7px 12px', fontWeight: '700', border: '1px solid #c8c8c8', color: '#111', whiteSpace: 'nowrap', fontSize: '12px', backgroundColor: '#f0f0f0' },
    { padding: '7px 12px', border: '1px solid #ddd', color: '#222', verticalAlign: 'top', fontSize: '13px' },
    pad, colCount,
  );
  const th = tableStyles.th;
  const td = tableStyles.td;
  return (
    <div style={{ padding: resolveDocPadding(opts, pad), backgroundColor: '#fff', color: '#000', width: dim.width, minHeight: dim.minHeight, margin: 'auto', fontFamily: 'Arial, sans-serif', fontSize: '13px', lineHeight: 1.45, boxSizing: 'border-box' }}>
      {/* Two-column header box */}
      <div style={{ display: 'flex', border: '1px solid #ccc', borderRadius: '6px', marginBottom: '6px', overflow: 'hidden' }}>
        <div style={{ flex: 1, padding: '10px 18px', display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
          {opts.showLogo && business.logo && <img src={business.logo} alt="" style={{ maxHeight: '60px', maxWidth: '120px', objectFit: 'contain' }} />}
          <div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: '#111', marginBottom: '4px' }}>{business.name}</div>
            {business.address && <div style={{ color: '#555', fontSize: '12.5px' }}>{business.address}</div>}
            {opts.showBusinessPhone !== false && business.phone && <div style={{ color: '#555', fontSize: '12.5px' }}>Ph: {business.phone}</div>}
            {opts.showGSTIN && business.gstNumber && <div style={{ color: '#555', fontSize: '12.5px' }}>GSTIN: {business.gstNumber}</div>}
            {opts.showBusinessEmail && business.email && <div style={{ color: '#555', fontSize: '12.5px' }}>{business.email}</div>}
          </div>
        </div>
        <div style={{ width: '200px', flexShrink: 0, backgroundColor: '#f5f5f5', borderLeft: '1px solid #ccc', padding: '10px 18px' }}>
          <div style={{ fontSize: '16px', fontWeight: '800', color: acc, marginBottom: '6px' }}>{headerTitle}</div>
          {opts.showInvoiceNumber && (
            <div style={{ marginBottom: '2px' }}>
              <div style={{ fontSize: '10px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Invoice #</div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#111' }}>{transaction.invoiceNumber}</div>
            </div>
          )}
          {opts.showDate && (
            <div style={{ marginBottom: '2px' }}>
              <div style={{ fontSize: '10px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Date</div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#111' }}>{formatDate(transaction.date, opts.dateFormat)}</div>
            </div>
          )}
          {opts.showDueDate && transaction.dueDate && (
            <div style={{ marginBottom: '2px' }}>
              <div style={{ fontSize: '10px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Due Date</div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#111' }}>{formatDate(transaction.dueDate, opts.dateFormat)}</div>
            </div>
          )}
          {opts.showBilledBy && transaction.billedBy && (
            <div style={{ marginBottom: '2px' }}>
              <div style={{ fontSize: '10px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Billed By</div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#111' }}>{transaction.billedBy}</div>
            </div>
          )}
          {opts.showPaymentMode && transaction.paymentMode && (
            <div style={{ marginBottom: '2px' }}>
              <div style={{ fontSize: '10px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Payment</div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#111' }}>{transaction.paymentMode}</div>
            </div>
          )}
        </div>
      </div>
      {/* Bill To / supply info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', gap: '16px' }}>
        <div style={{ backgroundColor: lightAcc, border: `1px solid ${lighten(acc, 0.38)}`, borderRadius: '6px', padding: '10px 18px', flex: 1 }}>
          <div style={{ fontSize: '10.5px', fontWeight: '700', textTransform: 'uppercase', color: acc, letterSpacing: '0.07em', marginBottom: '5px' }}>{isSale ? 'Bill To' : 'Bill From'}</div>
          <div style={{ fontSize: '15px', fontWeight: '700', color: '#000', marginBottom: '3px' }}>{transaction.partyName}</div>
          {opts.showPartyAddress !== false && transaction.partyAddress && <div style={{ color: '#444', fontSize: '12.5px' }}>{transaction.partyAddress}</div>}
          {opts.showPartyPhone !== false && transaction.partyPhone && <div style={{ color: '#444', fontSize: '12.5px' }}>Ph: {transaction.partyPhone}</div>}
          {opts.showPartyGSTIN !== false && transaction.partyGstNumber && <div style={{ color: '#444', fontSize: '12.5px' }}>GSTIN: {transaction.partyGstNumber}</div>}
        </div>
        <div style={{ flexShrink: 0, textAlign: 'right', fontSize: '12.5px', color: '#555' }}>
          {opts.showPlaceOfSupply !== false && transaction.placeOfSupply && <div>Place of Supply: <strong style={{ color: '#000' }}>{transaction.placeOfSupply}</strong></div>}
          {(transaction.isInterState != null || transaction.gstType) && <div>Supply: <strong style={{ color: '#000' }}>{gstTypeLabel(transaction)}</strong></div>}
          {transaction.reverseCharge && <div style={{ color: '#b91c1c', fontWeight: '700' }}>Reverse Charge: Yes</div>}
        </div>
      </div>
      <table className="inv-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '6px' }}>
        <TableHead thStyle={th} showHSN={showHSN} showDisc={showDisc} useCGSTSGST={useCGSTSGST} useIGST={useIGST} useUTGST={useUTGST} isComposite={isComposite} showGST={showGST} opts={opts} />
        <tbody>
          <ItemRows transaction={transaction} opts={opts} tdStyle={td} showHSN={showHSN} showDisc={showDisc} useCGSTSGST={useCGSTSGST} useIGST={useIGST} useUTGST={useUTGST} isComposite={isComposite} showGST={showGST} rowBg={i => i % 2 === 1 ? '#fafafa' : '#fff'} />
        </tbody>
      </table>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '6px' }}>
        <TotalsBlock transaction={transaction} opts={opts} isSale={isSale} accentColor={acc} showBalanceSection={showBalanceSection} currentBillTotal={currentBillTotal} balanceNum={balanceNum} openingBalance={openingBalance} compact={pad < 36} />
      </div>
      <HsnBankRow business={business} opts={opts} bankWidth={pad < 36 ? '220px' : '260px'}>
        <HsnTaxSummary transaction={transaction} useIGST={useIGST} useUTGST={useUTGST} isComposite={isComposite} thStyle={{ ...th, backgroundColor: '#f8f8f8' }} tdStyle={{ ...td, backgroundColor: '#fff' }} opts={opts} />
      </HsnBankRow>
      {/* Footer: Terms left, Signature right — table-based (not flex/float),
          same pagination reasoning as InvoiceFooter/HsnBankRow. Bank Details
          now renders above via HsnBankRow (paired with the HSN summary,
          consistent with every other theme) instead of duplicated here. */}
      <div style={{ marginTop: '10px', display: 'table', width: '100%', tableLayout: 'fixed', borderSpacing: '16px 0' }}>
        <div style={{ display: 'table-row' }}>
          {opts.showTerms && (
            <div className="inv-no-break" style={{ display: 'table-cell', width: opts.showSignature ? '62%' : '100%', verticalAlign: 'top' }}>
              <p style={{ margin: '0 0 4px', fontSize: '11.5px', fontWeight: '700', color: '#444' }}>Terms & Conditions:</p>
              <p style={{ margin: 0, fontSize: '11px', color: '#555', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                {opts.termsText || '1. Goods once sold will not be taken back.\n2. Interest @ 18% will be charged if payment is not made within 7 days.'}
              </p>
            </div>
          )}
          {opts.showSignature && (
            <div className="inv-no-break" style={{ display: 'table-cell', width: '150px', verticalAlign: 'top', textAlign: 'right' }}>
              <div style={{ height: '40px' }} />
              <p style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: '700', color: '#000' }}>For {business.name}</p>
              <p style={{ margin: 0, fontSize: '11px', color: '#555' }}>Authorized Signatory</p>
              {transaction.billedBy && <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#555' }}>Billed by: <strong style={{ color: '#000' }}>{transaction.billedBy}</strong></p>}
            </div>
          )}
        </div>
      </div>
      <PoweredByFooter />
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// THEME 8 — VIVID
// ════════════════════════════════════════════════════════════════════════════════

const VividTemplate = (p) => {
  const { transaction, business, dim, opts, isSale, headerTitle, showBalanceSection, currentBillTotal, balanceNum, openingBalance } = p;
  const acc = opts.themeColor || '#334155';
  const lightAcc = lighten(acc, 0.55);
  const showGST = opts.showGSTColumn && !transaction.noGST;
  const { useIGST, useUTGST, isComposite, useCGSTSGST } = deriveGstFlags(transaction, showGST);
  const showDisc = opts.showDiscountColumn && transaction.items?.some(i => Number(i.discountPercent) > 0);
  const showHSN = opts.showHSNColumn !== false && transaction.items?.some(i => i.hsnCode);
  const pad = dim.pad;
  const colCount = countTableColumns(opts, showHSN, showDisc, useCGSTSGST, useUTGST, useIGST, isComposite, showGST);
  const tableStyles = narrowTableStyles(
    { padding: '10px 12px', fontWeight: '700', backgroundColor: acc, color: '#fff', whiteSpace: 'nowrap', fontSize: '12px', border: 'none' },
    { padding: '10px 12px', color: '#222', verticalAlign: 'top', fontSize: '13px', borderBottom: '1px solid #eee' },
    pad, colCount,
  );
  const th = tableStyles.th;
  const td = tableStyles.td;
  const discountAmount = transaction.discountAmount ?? 0;
  const advanceAmount = transaction.advance ?? 0;
  const balanceDue = Math.max(0, (transaction.totalAmount ?? 0) - advanceAmount);
  return (
    <div style={{ padding: resolveDocPadding(opts, pad), backgroundColor: '#fff', color: '#000', width: dim.width, minHeight: dim.minHeight, margin: 'auto', fontFamily: "'Helvetica Neue', Arial, sans-serif", fontSize: '13.5px', lineHeight: 1.45, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', flex: 1 }}>
          {opts.showLogo && business.logo && <img src={business.logo} alt="" style={{ maxHeight: '56px', maxWidth: '130px', objectFit: 'contain' }} />}
          <div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: '#111', marginBottom: '4px' }}>{business.name}</div>
            {business.address && <div style={{ color: '#555', fontSize: '12.5px' }}>{business.address}</div>}
            {opts.showBusinessPhone !== false && business.phone && <div style={{ color: '#555', fontSize: '12.5px' }}>Ph: {business.phone}</div>}
            {opts.showBusinessEmail && business.email && <div style={{ color: '#555', fontSize: '12.5px' }}>{business.email}</div>}
            {opts.showGSTIN && business.gstNumber && <div style={{ color: '#555', fontSize: '12.5px' }}>GSTIN: {business.gstNumber}</div>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '20px', fontWeight: '900', color: acc, marginBottom: '4px' }}>{headerTitle}</div>
          {opts.showInvoiceNumber && <div style={{ fontSize: '13px', color: '#444' }}>Invoice #: {transaction.invoiceNumber}</div>}
          {opts.showDate && <div style={{ fontSize: '13px', color: '#444' }}>Date: {formatDate(transaction.date, opts.dateFormat)}</div>}
          {opts.showDueDate && transaction.dueDate && <div style={{ fontSize: '13px', color: '#444' }}>Due: {formatDate(transaction.dueDate, opts.dateFormat)}</div>}
          {opts.showBilledBy && transaction.billedBy && <div style={{ fontSize: '13px', color: '#444' }}>Billed by: {transaction.billedBy}</div>}
        </div>
      </div>
      {/* Bill-To box with 3px left border */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', gap: '16px' }}>
        <div style={{ borderLeft: `3px solid ${acc}`, paddingLeft: '14px', backgroundColor: lightAcc, padding: '12px 14px 12px 14px', borderRadius: '0 6px 6px 0', flex: 1 }}>
          <div style={{ fontSize: '10.5px', fontWeight: '700', textTransform: 'uppercase', color: acc, letterSpacing: '0.08em', marginBottom: '5px' }}>{isSale ? 'Bill To' : 'Bill From'}</div>
          <div style={{ fontSize: '15px', fontWeight: '700', color: '#000', marginBottom: '3px' }}>{transaction.partyName}</div>
          {opts.showPartyAddress !== false && transaction.partyAddress && <div style={{ color: '#555', fontSize: '12.5px' }}>{transaction.partyAddress}</div>}
          {opts.showPartyPhone !== false && transaction.partyPhone && <div style={{ color: '#555', fontSize: '12.5px' }}>Ph: {transaction.partyPhone}</div>}
          {opts.showPartyGSTIN !== false && transaction.partyGstNumber && <div style={{ color: '#555', fontSize: '12.5px' }}>GSTIN: {transaction.partyGstNumber}</div>}
        </div>
        <div style={{ textAlign: 'right', fontSize: '12.5px', color: '#555', flexShrink: 0, paddingTop: '4px' }}>
          {opts.showPlaceOfSupply !== false && transaction.placeOfSupply && <div>Place of Supply: <strong style={{ color: '#000' }}>{transaction.placeOfSupply}</strong></div>}
          {(transaction.isInterState != null || transaction.gstType) && <div>{gstTypeLabel(transaction)}</div>}
          {transaction.reverseCharge && <div style={{ color: '#b91c1c', fontWeight: '700' }}>Reverse Charge: Yes</div>}
        </div>
      </div>
      <table className="inv-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
        <TableHead thStyle={th} showHSN={showHSN} showDisc={showDisc} useCGSTSGST={useCGSTSGST} useIGST={useIGST} useUTGST={useUTGST} isComposite={isComposite} showGST={showGST} opts={opts} />
        <tbody>
          <ItemRows transaction={transaction} opts={opts} tdStyle={td} showHSN={showHSN} showDisc={showDisc} useCGSTSGST={useCGSTSGST} useIGST={useIGST} useUTGST={useUTGST} isComposite={isComposite} showGST={showGST} rowBg={i => i % 2 === 0 ? '#fff' : lightAcc} />
        </tbody>
      </table>
      {/* Vivid totals box */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
        <div style={{ width: '260px', border: `1px solid ${lighten(acc, 0.3)}`, borderRadius: '8px', overflow: 'hidden' }}>
          {discountAmount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 14px', fontSize: '13px', borderBottom: '1px solid #eee' }}>
              <span style={{ color: '#555' }}>Discount</span><span>-₹{discountAmount.toFixed(2)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 14px', fontSize: '13px', borderBottom: '1px solid #eee' }}>
            <span style={{ color: '#555' }}>Subtotal</span><span>₹{(transaction.subtotal ?? 0).toFixed(2)}</span>
          </div>
          {isComposite && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 14px', fontSize: '13px', borderBottom: '1px solid #eee' }}><span style={{ color: '#555' }}>Composition Tax</span><span>₹{(transaction.taxAmount ?? 0).toFixed(2)}</span></div>}
          {useIGST && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 14px', fontSize: '13px', borderBottom: '1px solid #eee' }}><span style={{ color: '#555' }}>IGST</span><span>₹{(transaction.taxAmount ?? 0).toFixed(2)}</span></div>}
          {useCGSTSGST && <>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 14px', fontSize: '13px', borderBottom: '1px solid #eee' }}><span style={{ color: '#555' }}>CGST</span><span>₹{((transaction.taxAmount ?? 0) / 2).toFixed(2)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 14px', fontSize: '13px', borderBottom: '1px solid #eee' }}><span style={{ color: '#555' }}>SGST</span><span>₹{((transaction.taxAmount ?? 0) / 2).toFixed(2)}</span></div>
          </>}
          {useUTGST && <>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 14px', fontSize: '13px', borderBottom: '1px solid #eee' }}><span style={{ color: '#555' }}>CGST</span><span>₹{((transaction.taxAmount ?? 0) / 2).toFixed(2)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 14px', fontSize: '13px', borderBottom: '1px solid #eee' }}><span style={{ color: '#555' }}>UTGST</span><span>₹{((transaction.taxAmount ?? 0) / 2).toFixed(2)}</span></div>
          </>}
          {(transaction.packingCharge ?? 0) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 14px', fontSize: '13px', borderBottom: '1px solid #eee' }}><span style={{ color: '#555' }}>Packing Charges</span><span>₹{Number(transaction.packingCharge).toFixed(2)}</span></div>
          )}
          {(transaction.shippingCharge ?? 0) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 14px', fontSize: '13px', borderBottom: '1px solid #eee' }}><span style={{ color: '#555' }}>Shipping Charges</span><span>₹{Number(transaction.shippingCharge).toFixed(2)}</span></div>
          )}
          {transaction.roundOffAmount != null && transaction.roundOffAmount !== 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 14px', fontSize: '13px', borderBottom: '1px solid #eee' }}><span style={{ color: '#555' }}>Round Off</span><span>{transaction.roundOffAmount >= 0 ? '+' : ''}₹{Number(transaction.roundOffAmount).toFixed(2)}</span></div>
          )}
          {(transaction.loyaltyRedeemValue ?? 0) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 14px', fontSize: '13px', borderBottom: '1px solid #eee' }}><span style={{ color: '#b45309' }}>{opts.loyalty?.programName || 'Loyalty'} ({transaction.loyaltyPointsRedeemed ?? 0} pts)</span><span style={{ color: '#b45309' }}>-₹{Number(transaction.loyaltyRedeemValue).toFixed(2)}</span></div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', backgroundColor: acc, color: '#fff' }}>
            <span style={{ fontWeight: '800', fontSize: '15px' }}>Grand Total</span>
            <span style={{ fontWeight: '900', fontSize: '16px' }}>₹{(transaction.totalAmount ?? 0).toFixed(2)}</span>
          </div>
          {advanceAmount > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 14px', fontSize: '13px', borderTop: '1px solid #eee', color: '#334155' }}><span>Advance</span><span>-₹{advanceAmount.toFixed(2)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 14px', fontSize: '13px', fontWeight: '700', color: '#dc2626' }}><span>{isSale ? 'Balance Due' : 'Balance Payable'}</span><span>₹{balanceDue.toFixed(2)}</span></div>
            </>
          )}
          {showBalanceSection && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 14px', fontSize: '12px', color: '#777', borderTop: '1px solid #eee' }}><span>Opening Balance</span><span>₹{(openingBalance ?? 0).toFixed(2)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 14px', fontSize: '12px', color: '#777' }}><span>Current Bill</span><span>₹{currentBillTotal.toFixed(2)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 14px', fontWeight: '700', borderTop: '1px solid #ddd' }}><span>Total Pending</span><span>₹{(balanceNum ?? 0).toFixed(2)}</span></div>
            </>
          )}
        </div>
      </div>
      <HsnBankRow business={business} opts={opts}>
        <HsnTaxSummary transaction={transaction} useIGST={useIGST} useUTGST={useUTGST} isComposite={isComposite} thStyle={{ ...th, fontSize: '10.5px', backgroundColor: lighten(acc, 0.18) }} tdStyle={{ ...td, fontSize: '11px' }} opts={opts} />
      </HsnBankRow>
      <InvoiceFooter opts={opts} business={business} transaction={transaction} accentColor={acc} />
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// THERMAL RECEIPT (58mm + 80mm)
// ════════════════════════════════════════════════════════════════════════════════

const ThermalTemplate = ({ transaction, business, paperSize, opts }) => {
  if (!transaction || !business) return null;
  const isSale = transaction.type === 'Sales';
  const is58mm = paperSize === 'Thermal 58mm';
  const width = is58mm ? '58mm' : '80mm';
  const padding = is58mm ? '4px 6px' : '6px 10px';
  const titleFs = is58mm ? '15px' : '18px';
  const bodyFs  = is58mm ? '13px' : '14px';
  const smallFs = is58mm ? '11px' : '12px';
  const totalFs = is58mm ? '16px' : '18px';
  const div = is58mm ? '- - - - - - - - - - - - - -' : '- - - - - - - - - - - - - - - - - - -';
  const advanceAmount = transaction.advance ?? 0;
  const balanceDue = Math.max(0, (transaction.totalAmount ?? 0) - advanceAmount);
  const showGST = opts.showGSTColumn && !transaction.noGST;
  const { useIGST, useUTGST, isComposite, useCGSTSGST } = deriveGstFlags(transaction, showGST);
  const ls = { display: 'flex', justifyContent: 'space-between', marginBottom: '2px' };
  return (
    <div style={{ width, padding, backgroundColor: '#fff', color: '#000', fontFamily: 'Arial, sans-serif', fontSize: bodyFs, lineHeight: '1.5' }}>
      <div style={{ textAlign: 'center', marginBottom: '6px' }}>
        {opts.showLogo && business.logo && <img src={business.logo} alt="" style={{ maxHeight: is58mm ? '48px' : '56px', objectFit: 'contain', marginBottom: '4px' }} />}
        <div style={{ fontSize: titleFs, fontWeight: 'bold', letterSpacing: '0.03em' }}>{business.name}</div>
        {business.address && <div style={{ fontSize: smallFs }}>{business.address}</div>}
        {business.phone && <div style={{ fontSize: smallFs }}>Ph: {business.phone}</div>}
        {opts.showGSTIN && business.gstNumber && <div style={{ fontSize: smallFs }}>GSTIN: {business.gstNumber}</div>}
      </div>
      <div style={{ textAlign: 'center', fontSize: smallFs }}>{div}</div>
      <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: bodyFs, margin: '4px 0' }}>{isSale ? 'TAX INVOICE' : 'PURCHASE BILL'}</div>
      <div style={{ ...ls, fontSize: smallFs }}>
        {opts.showInvoiceNumber && <span>#{transaction.invoiceNumber}</span>}
        {opts.showDate && <span>{formatDate(transaction.date, opts.dateFormat)}</span>}
      </div>
      {transaction.partyName && <div style={{ fontSize: smallFs, marginBottom: '2px' }}>{isSale ? 'To: ' : 'From: '}<strong>{transaction.partyName}</strong></div>}
      <div style={{ textAlign: 'center', fontSize: smallFs, margin: '4px 0' }}>{div}</div>
      {(transaction.items || []).map((item, i) => {
        const qty = Number(item.qty) || 0;
        const price = Number(item.price) || 0;
        const discPct = Number(item.discountPercent) || 0;
        const taxRate = Number(item.taxRate) || 0;
        const lineTotal = calcLineTotal(item);
        return (
          <div key={i} style={{ marginBottom: '4px' }}>
            <div style={{ fontWeight: '600', fontSize: bodyFs }}>{item.name}{(() => { const mp = [opts.showItemCategory && item.category, opts.showItemSize === true && item.size && `Size: ${item.size}`, opts.showItemVariant === true && item.variant].filter(Boolean); return mp.length > 0 ? <span style={{ fontWeight: '400', fontSize: smallFs, color: '#555' }}>{' — '}{mp.join(' · ')}</span> : null; })()}</div>
            <div style={{ ...ls, fontSize: smallFs }}>
              <span>{fmtQty(qty)} × ₹{price.toFixed(2)}{opts.showDiscountColumn && discPct ? ` (${discPct}% off)` : ''}{showGST && taxRate ? ` +${taxRate}%GST` : ''}</span>
              <span style={{ fontWeight: '700' }}>₹{lineTotal.toFixed(2)}</span>
            </div>
          </div>
        );
      })}
      <div style={{ textAlign: 'center', fontSize: smallFs, margin: '4px 0' }}>{div}</div>
      {transaction.discountAmount > 0 && <div style={ls}><span>Discount</span><span>-₹{Number(transaction.discountAmount).toFixed(2)}</span></div>}
      <div style={ls}><span>Subtotal</span><span>₹{Number(transaction.subtotal).toFixed(2)}</span></div>
      {showGST && (isComposite ? (
        <div style={ls}><span>Comp. Tax</span><span>₹{Number(transaction.taxAmount).toFixed(2)}</span></div>
      ) : useIGST ? (
        <div style={ls}><span>IGST</span><span>₹{Number(transaction.taxAmount).toFixed(2)}</span></div>
      ) : useUTGST ? (
        <>
          <div style={ls}><span>CGST</span><span>₹{(Number(transaction.taxAmount) / 2).toFixed(2)}</span></div>
          <div style={ls}><span>UTGST</span><span>₹{(Number(transaction.taxAmount) / 2).toFixed(2)}</span></div>
        </>
      ) : (
        <>
          <div style={ls}><span>CGST</span><span>₹{(Number(transaction.taxAmount) / 2).toFixed(2)}</span></div>
          <div style={ls}><span>SGST</span><span>₹{(Number(transaction.taxAmount) / 2).toFixed(2)}</span></div>
        </>
      ))}
      {(transaction.packingCharge ?? 0) > 0 && <div style={ls}><span>Packing Charges</span><span>₹{Number(transaction.packingCharge).toFixed(2)}</span></div>}
      {(transaction.shippingCharge ?? 0) > 0 && <div style={ls}><span>Shipping Charges</span><span>₹{Number(transaction.shippingCharge).toFixed(2)}</span></div>}
      {transaction.roundOffAmount != null && transaction.roundOffAmount !== 0 && <div style={ls}><span>Round Off</span><span>{transaction.roundOffAmount >= 0 ? '+' : ''}₹{Number(transaction.roundOffAmount).toFixed(2)}</span></div>}
      {(transaction.loyaltyRedeemValue ?? 0) > 0 && <div style={ls}><span>{opts.loyalty?.programName || 'Loyalty'} ({transaction.loyaltyPointsRedeemed ?? 0} pts)</span><span>-₹{Number(transaction.loyaltyRedeemValue).toFixed(2)}</span></div>}
      <div style={{ textAlign: 'center', fontSize: smallFs, margin: '3px 0' }}>{div}</div>
      <div style={{ ...ls, fontSize: totalFs, fontWeight: 'bold' }}><span>TOTAL</span><span>₹{Number(transaction.totalAmount).toFixed(2)}</span></div>
      {advanceAmount > 0 && (
        <>
          <div style={{ ...ls, marginTop: '3px' }}><span>Advance</span><span>-₹{advanceAmount.toFixed(2)}</span></div>
          <div style={{ ...ls, fontWeight: 'bold' }}><span>{isSale ? 'Balance Due' : 'Balance Payable'}</span><span>₹{balanceDue.toFixed(2)}</span></div>
        </>
      )}
      {showGST && (() => {
        const groups = {};
        (transaction.items || []).forEach(item => {
          const rate = Number(item.taxRate) || 0;
          if (!rate) return;
          const hsn = item.hsnCode || '';
          const key = `${hsn}||${rate}`;
          const taxable = (Number(item.qty) || 0) * (Number(item.price) || 0) * (1 - (Number(item.discountPercent) || 0) / 100);
          if (!groups[key]) groups[key] = { hsn, rate, taxable: 0 };
          groups[key].taxable += taxable;
        });
        const rows = Object.values(groups);
        if (!rows.length) return null;
        return (
          <>
            <div style={{ textAlign: 'center', fontSize: smallFs, margin: '3px 0' }}>{div}</div>
            <div style={{ fontSize: smallFs, fontWeight: 'bold', marginBottom: '2px' }}>GST Summary</div>
            {rows.map((g, i) => {
              const tax = g.taxable * g.rate / 100;
              return <div key={i} style={{ fontSize: smallFs }}>{g.hsn ? `HSN ${g.hsn} ` : ''}{g.rate}%: ₹{g.taxable.toFixed(2)} tax=₹{tax.toFixed(2)}</div>;
            })}
          </>
        );
      })()}
      <LoyaltyBlock transaction={transaction} opts={opts} thermal />
      <div style={{ textAlign: 'center', fontSize: smallFs, margin: '6px 0 4px' }}>Thank you! Visit again.</div>
      <div style={{ textAlign: 'center', fontSize: smallFs }}>{div}</div>
      <div style={{ textAlign: 'center', fontSize: smallFs, marginTop: '4px', color: '#888' }}>Powered by TallyKraft</div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// DOT MATRIX
// ════════════════════════════════════════════════════════════════════════════════

const DotMatrixTemplate = ({ transaction, business, opts }) => {
  if (!transaction || !business) return null;
  const isSale = transaction.type === 'Sales';
  const showGST = opts.showGSTColumn && !transaction.noGST;
  const { useIGST, useUTGST, isComposite, useCGSTSGST } = deriveGstFlags(transaction, showGST);
  const divider = '-------------------------------------------------------------';
  const eq = '=============================================================';
  const pad = (str, len, right) => {
    const s = String(str);
    if (right) return s.length >= len ? s.slice(0, len) : s + ' '.repeat(len - s.length);
    return s.length >= len ? s.slice(0, len) : ' '.repeat(len - s.length) + s;
  };
  return (
    <div style={{ width: '240mm', padding: '10px 14px', backgroundColor: '#fff', color: '#000', fontFamily: 'Courier New, Courier, monospace', fontSize: '12px', lineHeight: '1.5', boxSizing: 'border-box' }}>
      <pre style={{ margin: 0, fontFamily: 'inherit', fontSize: 'inherit', lineHeight: 'inherit', whiteSpace: 'pre-wrap' }}>{[
        eq,
        `  ${business.name}`,
        business.address ? `  ${business.address}` : null,
        business.phone ? `  Ph: ${business.phone}` : null,
        opts.showGSTIN && business.gstNumber ? `  GSTIN: ${business.gstNumber}` : null,
        eq,
        `  ${isSale ? 'TAX INVOICE' : 'PURCHASE BILL'}`,
        opts.showInvoiceNumber ? `  Invoice No: ${transaction.invoiceNumber}` : null,
        opts.showDate ? `  Date: ${formatDate(transaction.date, opts.dateFormat)}` : null,
        divider,
        `  ${isSale ? 'Bill To' : 'Bill From'}: ${transaction.partyName}`,
        transaction.partyAddress ? `  ${transaction.partyAddress}` : null,
        transaction.partyGstNumber ? `  GSTIN: ${transaction.partyGstNumber}` : null,
        divider,
        `${pad('#', 4)} ${pad('Item', 28, true)} ${pad('Qty', 6)} ${pad('Rate', 9)} ${showGST ? pad('GST%', 5) : ''} ${pad('Amount', 10)}`,
        divider,
        ...(transaction.items || []).map((item, idx) => {
          const qty = Number(item.qty) || 0;
          const price = Number(item.price) || 0;
          const taxRate = Number(item.taxRate) || 0;
          const lineTotal = calcLineTotal(item);
          return `${pad(idx + 1, 4)} ${pad(item.name, 28, true)} ${pad(fmtQty(qty) + (item.unit ? item.unit : ''), 6)} ${pad('Rs' + price.toFixed(0), 9)} ${showGST ? pad(taxRate + '%', 5) : ''} ${pad('Rs' + lineTotal.toFixed(2), 10)}`;
        }),
        divider,
        `${pad('', 4)} ${pad('Subtotal', 28, true)} ${pad('', 6)} ${pad('', 9)} ${showGST ? pad('', 5) : ''} ${pad('Rs' + (transaction.subtotal ?? 0).toFixed(2), 10)}`,
        (transaction.discountAmount ?? 0) > 0 ? `${pad('', 4)} ${pad('Discount', 28, true)} ${pad('', 6)} ${pad('', 9)} ${showGST ? pad('', 5) : ''} ${pad('-Rs' + (transaction.discountAmount ?? 0).toFixed(2), 10)}` : null,
        isComposite ? `${pad('', 4)} ${pad('Comp.Tax', 28, true)} ${pad('', 6)} ${pad('', 9)} ${showGST ? pad('', 5) : ''} ${pad('Rs' + (transaction.taxAmount ?? 0).toFixed(2), 10)}` : null,
        useIGST ? `${pad('', 4)} ${pad('IGST', 28, true)} ${pad('', 6)} ${pad('', 9)} ${showGST ? pad('', 5) : ''} ${pad('Rs' + (transaction.taxAmount ?? 0).toFixed(2), 10)}` : null,
        (useCGSTSGST || useUTGST) ? `${pad('', 4)} ${pad('CGST', 28, true)} ${pad('', 6)} ${pad('', 9)} ${showGST ? pad('', 5) : ''} ${pad('Rs' + ((transaction.taxAmount ?? 0) / 2).toFixed(2), 10)}` : null,
        useCGSTSGST ? `${pad('', 4)} ${pad('SGST', 28, true)} ${pad('', 6)} ${pad('', 9)} ${showGST ? pad('', 5) : ''} ${pad('Rs' + ((transaction.taxAmount ?? 0) / 2).toFixed(2), 10)}` : null,
        useUTGST ? `${pad('', 4)} ${pad('UTGST', 28, true)} ${pad('', 6)} ${pad('', 9)} ${showGST ? pad('', 5) : ''} ${pad('Rs' + ((transaction.taxAmount ?? 0) / 2).toFixed(2), 10)}` : null,
        eq,
        `${pad('', 4)} ${pad('TOTAL', 28, true)} ${pad('', 6)} ${pad('', 9)} ${showGST ? pad('', 5) : ''} ${pad('Rs' + (transaction.totalAmount ?? 0).toFixed(2), 10)}`,
        eq,
        '',
        opts.showTerms ? (opts.termsText || '  Terms: Goods once sold will not be taken back.') : null,
        '',
        opts.showSignature ? `  For ${business.name}` : null,
        opts.showSignature ? '  Authorized Signatory' : null,
        '',
        divider,
        '        Powered by TallyKraft - www.tallykraft.com',
      ].filter(l => l !== null).join('\n')}</pre>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// THEME 9 — RECEIPT
// ════════════════════════════════════════════════════════════════════════════════

const ReceiptTemplate = (p) => {
  const { transaction, business, dim, opts, isSale, headerTitle, showBalanceSection, currentBillTotal, balanceNum, openingBalance } = p;
  const acc = opts.themeColor || '#334155';
  const showGST = opts.showGSTColumn && !transaction.noGST;
  const { useIGST, useUTGST, isComposite, useCGSTSGST } = deriveGstFlags(transaction, showGST);
  const showDisc = opts.showDiscountColumn && transaction.items?.some(i => Number(i.discountPercent) > 0);
  const showHSN = opts.showHSNColumn !== false && transaction.items?.some(i => i.hsnCode);
  const pad = dim.pad;
  const colCount = countTableColumns(opts, showHSN, showDisc, useCGSTSGST, useUTGST, useIGST, isComposite, showGST);
  const tableStyles = narrowTableStyles(
    { padding: '6px 10px', fontWeight: '700', borderBottom: `1.5px solid ${acc}`, color: '#333', whiteSpace: 'nowrap', fontSize: '12px', textAlign: 'center', background: 'none' },
    { padding: '6px 10px', color: '#222', verticalAlign: 'top', fontSize: '13px', borderBottom: '1px solid #f0f0f0' },
    pad, colCount,
  );
  const th = tableStyles.th;
  const td = tableStyles.td;
  return (
    <div style={{ padding: resolveDocPadding(opts, pad), backgroundColor: '#fff', color: '#000', width: dim.width, minHeight: dim.minHeight, margin: 'auto', fontFamily: 'Arial, sans-serif', fontSize: '13px', lineHeight: 1.4, boxSizing: 'border-box' }}>
      {/* Centered header */}
      <div style={{ textAlign: 'center', marginBottom: '12px' }}>
        {opts.showLogo && business.logo && <img src={business.logo} alt="" style={{ maxHeight: '56px', maxWidth: '140px', objectFit: 'contain', display: 'block', margin: '0 auto 10px' }} />}
        <div style={{ fontSize: '22px', fontWeight: '800', color: '#000', letterSpacing: '-0.3px' }}>{business.name}</div>
        {business.address && <div style={{ color: '#666', fontSize: '12px', marginTop: '3px' }}>{business.address}</div>}
        {opts.showBusinessPhone !== false && business.phone && <div style={{ color: '#666', fontSize: '12px' }}>Ph: {business.phone}</div>}
        {opts.showBusinessEmail && business.email && <div style={{ color: '#666', fontSize: '12px' }}>{business.email}</div>}
        {opts.showGSTIN && business.gstNumber && <div style={{ color: '#666', fontSize: '12px' }}>GSTIN: {business.gstNumber}</div>}
        <div style={{ height: '2px', background: `linear-gradient(90deg, transparent, ${acc}, transparent)`, margin: '12px 0' }} />
        <div style={{ fontSize: '14px', fontWeight: '800', letterSpacing: '0.1em', textTransform: 'uppercase', color: acc }}>{headerTitle}</div>
      </div>
      {/* Two-col: Bill To + Invoice meta */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: '10px', fontSize: '12.5px' }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', color: '#999', letterSpacing: '0.08em', marginBottom: '4px' }}>{isSale ? 'Bill To' : 'Bill From'}</div>
          <div style={{ fontWeight: '700', color: '#000', marginBottom: '2px' }}>{transaction.partyName}</div>
          {opts.showPartyAddress !== false && transaction.partyAddress && <div style={{ color: '#555' }}>{transaction.partyAddress}</div>}
          {opts.showPartyPhone !== false && transaction.partyPhone && <div style={{ color: '#555' }}>Ph: {transaction.partyPhone}</div>}
          {opts.showPartyGSTIN !== false && transaction.partyGstNumber && <div style={{ color: '#555' }}>GSTIN: {transaction.partyGstNumber}</div>}
        </div>
        <div style={{ textAlign: 'right', color: '#555' }}>
          {opts.showInvoiceNumber && <div><strong style={{ color: '#000' }}># {transaction.invoiceNumber}</strong></div>}
          {opts.showDate && <div>{formatDate(transaction.date, opts.dateFormat)}</div>}
          {opts.showDueDate && transaction.dueDate && <div>Due: {formatDate(transaction.dueDate, opts.dateFormat)}</div>}
          {opts.showPaymentMode && transaction.paymentMode && <div>{transaction.paymentMode}</div>}
          {opts.showBilledBy && transaction.billedBy && <div>By: {transaction.billedBy}</div>}
          {opts.showPlaceOfSupply !== false && transaction.placeOfSupply && <div>Supply: {transaction.placeOfSupply}</div>}
        </div>
      </div>
      <table className="inv-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
        <TableHead thStyle={th} showHSN={showHSN} showDisc={showDisc} useCGSTSGST={useCGSTSGST} useIGST={useIGST} useUTGST={useUTGST} isComposite={isComposite} showGST={showGST} opts={opts} />
        <tbody>
          <ItemRows transaction={transaction} opts={opts} tdStyle={td} showHSN={showHSN} showDisc={showDisc} useCGSTSGST={useCGSTSGST} useIGST={useIGST} useUTGST={useUTGST} isComposite={isComposite} showGST={showGST} />
        </tbody>
      </table>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
        <TotalsBlock transaction={transaction} opts={opts} isSale={isSale} accentColor={acc} showBalanceSection={showBalanceSection} currentBillTotal={currentBillTotal} balanceNum={balanceNum} openingBalance={openingBalance} compact={pad < 36} />
      </div>
      <HsnBankRow business={business} opts={opts} bankWidth={pad < 36 ? '220px' : '260px'}>
        <HsnTaxSummary transaction={transaction} useIGST={useIGST} useUTGST={useUTGST} isComposite={isComposite} thStyle={{ ...th, fontSize: '10.5px' }} tdStyle={{ ...td, fontSize: '11px' }} opts={opts} />
      </HsnBankRow>
      {/* Centered footer */}
      <div style={{ marginTop: '10px', textAlign: 'center', borderTop: '1px dashed #ddd', paddingTop: '8px' }}>
        {opts.showTerms && (
          <div style={{ marginBottom: '6px', fontSize: '11px', color: '#666', whiteSpace: 'pre-line' }}>
            {opts.termsText || '1. Goods once sold will not be taken back.\n2. Interest @ 18% will be charged if payment is not made within 7 days.'}
          </div>
        )}
        {opts.showSignature && (
          <div style={{ marginTop: '10px', textAlign: 'right' }}>
            <div style={{ height: '32px' }} />
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#000' }}>For {business.name}</div>
            <div style={{ fontSize: '11px', color: '#666' }}>Authorized Signatory</div>
          </div>
        )}
        <div style={{ marginTop: '8px', fontSize: '11px', color: '#aaa' }}>Thank you for your business!</div>
      </div>
      <PoweredByFooter />
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// THEME 10 — PREMIUM
// ════════════════════════════════════════════════════════════════════════════════

const PremiumTemplate = (p) => {
  const { transaction, business, dim, opts, isSale, headerTitle, showBalanceSection, currentBillTotal, balanceNum, openingBalance } = p;
  const acc = opts.themeColor || '#334155';
  const darkAcc = lighten(acc, -0.12);
  const lightAcc = lighten(acc, 0.54);
  const showGST = opts.showGSTColumn && !transaction.noGST;
  const { useIGST, useUTGST, isComposite, useCGSTSGST } = deriveGstFlags(transaction, showGST);
  const showDisc = opts.showDiscountColumn && transaction.items?.some(i => Number(i.discountPercent) > 0);
  const showHSN = opts.showHSNColumn !== false && transaction.items?.some(i => i.hsnCode);
  const pad = dim.pad;
  const colCount = countTableColumns(opts, showHSN, showDisc, useCGSTSGST, useUTGST, useIGST, isComposite, showGST);
  const tableStyles = narrowTableStyles(
    { padding: '7px 13px', fontWeight: '700', background: `linear-gradient(90deg, ${darkAcc}, ${acc})`, color: '#fff', whiteSpace: 'nowrap', fontSize: '12px', border: 'none' },
    { padding: '7px 13px', color: '#222', verticalAlign: 'top', fontSize: '13px', borderBottom: '1px solid #eee' },
    pad, colCount,
  );
  const th = tableStyles.th;
  const td = tableStyles.td;
  const headerH = Math.max(14, pad - 22);
  return (
    <div style={{ backgroundColor: '#fff', color: '#000', width: dim.width, minHeight: dim.minHeight, margin: 'auto', fontFamily: "'Helvetica Neue', Arial, sans-serif", fontSize: '13.5px', lineHeight: 1.45, boxSizing: 'border-box' }}>
      {/* Gradient header */}
      <div style={{ background: `linear-gradient(135deg, ${darkAcc} 0%, ${acc} 60%, ${lighten(acc, 0.1)} 100%)`, padding: `${headerH}px ${pad + 4}px`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {opts.showLogo && business.logo && (
            <div style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: '8px', padding: '6px', backdropFilter: 'blur(4px)' }}>
              <img src={business.logo} alt="" style={{ maxHeight: '48px', maxWidth: '120px', objectFit: 'contain' }} />
            </div>
          )}
          <div>
            <div style={{ fontSize: '24px', fontWeight: '900', color: '#fff', letterSpacing: '-0.5px' }}>{business.name}</div>
            {business.address && <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '12px', marginTop: '3px' }}>{business.address}</div>}
            {opts.showBusinessPhone !== false && business.phone && <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '12px' }}>Ph: {business.phone}</div>}
            {opts.showBusinessEmail && business.email && <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '12px' }}>{business.email}</div>}
            {opts.showGSTIN && business.gstNumber && <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '12px' }}>GSTIN: {business.gstNumber}</div>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '26px', fontWeight: '900', color: '#fff', letterSpacing: '-0.5px' }}>{headerTitle}</div>
          {opts.showInvoiceNumber && <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: '13px', marginTop: '4px' }}>#{transaction.invoiceNumber}</div>}
          {opts.showDate && <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: '13px' }}>{formatDate(transaction.date, opts.dateFormat)}</div>}
          {opts.showDueDate && transaction.dueDate && <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: '13px' }}>Due: {formatDate(transaction.dueDate, opts.dateFormat)}</div>}
          {opts.showBilledBy && transaction.billedBy && <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: '12px' }}>Billed by: {transaction.billedBy}</div>}
        </div>
      </div>
      {/* Gold accent line */}
      <div style={{ height: '4px', background: `linear-gradient(90deg, #d4a017, #f0c040, #d4a017)` }} />
      <div style={{ padding: resolveDocPadding(opts, pad, pad) }}>
        {/* Customer box */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: '12px' }}>
          <div style={{ border: `1px solid ${lightAcc}`, borderRadius: '8px', backgroundColor: lighten(acc, 0.6), padding: '10px 18px', flex: 1 }}>
            <div style={{ fontSize: '10.5px', fontWeight: '700', textTransform: 'uppercase', color: acc, letterSpacing: '0.08em', marginBottom: '5px' }}>{isSale ? 'Bill To' : 'Bill From'}</div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#000', marginBottom: '3px' }}>{transaction.partyName}</div>
            {opts.showPartyAddress !== false && transaction.partyAddress && <div style={{ color: '#444', fontSize: '12.5px' }}>{transaction.partyAddress}</div>}
            {opts.showPartyPhone !== false && transaction.partyPhone && <div style={{ color: '#444', fontSize: '12.5px' }}>Ph: {transaction.partyPhone}</div>}
            {opts.showPartyGSTIN !== false && transaction.partyGstNumber && <div style={{ color: '#444', fontSize: '12.5px' }}>GSTIN: {transaction.partyGstNumber}</div>}
          </div>
          <div style={{ textAlign: 'right', fontSize: '12.5px', color: '#555', paddingTop: '4px', flexShrink: 0 }}>
            {opts.showPlaceOfSupply !== false && transaction.placeOfSupply && <div>Place of Supply: <strong style={{ color: '#000' }}>{transaction.placeOfSupply}</strong></div>}
            {(transaction.isInterState != null || transaction.gstType) && <div>{gstTypeLabel(transaction)}</div>}
            {opts.showPaymentMode && transaction.paymentMode && <div>Mode: {transaction.paymentMode}</div>}
            {transaction.reverseCharge && <div style={{ color: '#b91c1c', fontWeight: '700' }}>Reverse Charge: Yes</div>}
          </div>
        </div>
        <table className="inv-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
          <TableHead thStyle={th} showHSN={showHSN} showDisc={showDisc} useCGSTSGST={useCGSTSGST} useIGST={useIGST} useUTGST={useUTGST} isComposite={isComposite} showGST={showGST} opts={opts} />
          <tbody>
            <ItemRows transaction={transaction} opts={opts} tdStyle={td} showHSN={showHSN} showDisc={showDisc} useCGSTSGST={useCGSTSGST} useIGST={useIGST} useUTGST={useUTGST} isComposite={isComposite} showGST={showGST} rowBg={i => i % 2 === 0 ? '#fff' : lighten(acc, 0.62)} />
          </tbody>
        </table>
        {/* Totals in bordered box with accent background */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
          <div style={{ width: '260px', border: `1.5px solid ${lightAcc}`, borderRadius: '10px', overflow: 'hidden', background: lighten(acc, 0.62) }}>
            <div style={{ padding: '8px 16px' }}>
              <TotalsBlock transaction={transaction} opts={opts} isSale={isSale} accentColor={acc} showBalanceSection={showBalanceSection} currentBillTotal={currentBillTotal} balanceNum={balanceNum} openingBalance={openingBalance} compact />
            </div>
          </div>
        </div>
        <HsnBankRow business={business} opts={opts}>
          <HsnTaxSummary transaction={transaction} useIGST={useIGST} useUTGST={useUTGST} isComposite={isComposite} thStyle={{ ...th, fontSize: '10.5px', background: lighten(acc, 0.2) }} tdStyle={{ ...td, fontSize: '11px' }} opts={opts} />
        </HsnBankRow>
        <div style={{ marginTop: '10px', display: 'table', width: '100%', tableLayout: 'fixed', borderSpacing: '24px 0' }}>
          <div style={{ display: 'table-row' }}>
            {opts.showTerms && (
              <div className="inv-no-break" style={{ display: 'table-cell', width: opts.showSignature ? '62%' : '100%', verticalAlign: 'top' }}>
                <p style={{ margin: '0 0 4px', fontSize: '11.5px', fontWeight: '700', color: acc }}>Terms & Conditions</p>
                <p style={{ margin: 0, fontSize: '11px', color: '#555', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                  {opts.termsText || '1. Goods once sold will not be taken back.\n2. Interest @ 18% charged if payment is delayed.'}
                </p>
              </div>
            )}
            {opts.showSignature && (
              <div className="inv-no-break" style={{ display: 'table-cell', width: '160px', verticalAlign: 'top', textAlign: 'right' }}>
                <div style={{ height: '40px' }} />
                <p style={{ margin: '0 0 4px', fontSize: '12px', fontWeight: '700', color: '#000' }}>For {business.name}</p>
                <p style={{ margin: 0, fontSize: '11px', color: '#666' }}>Authorized Signatory</p>
                {opts.showBilledBy && transaction.billedBy && <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#666' }}>Billed by: <strong>{transaction.billedBy}</strong></p>}
              </div>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '11px', color: '#aaa', borderTop: '1px solid #eee', paddingTop: '8px' }}>
          Thank you for your business
        </div>
        <PoweredByFooter />
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// THEME 11 — MONO
// ════════════════════════════════════════════════════════════════════════════════

const MonoTemplate = (p) => {
  const { transaction, business, dim, opts, isSale, headerTitle, showBalanceSection, currentBillTotal, balanceNum, openingBalance } = p;
  const showGST = opts.showGSTColumn && !transaction.noGST;
  const { useIGST, useUTGST, isComposite, useCGSTSGST } = deriveGstFlags(transaction, showGST);
  const showDisc = opts.showDiscountColumn && transaction.items?.some(i => Number(i.discountPercent) > 0);
  const showHSN = opts.showHSNColumn !== false && transaction.items?.some(i => i.hsnCode);
  const pad = dim.pad;
  const colCount = countTableColumns(opts, showHSN, showDisc, useCGSTSGST, useUTGST, useIGST, isComposite, showGST);
  const tableStyles = narrowTableStyles(
    { padding: '7px 11px', fontWeight: '900', border: '2px solid #000', color: '#000', whiteSpace: 'nowrap', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.04em', backgroundColor: '#f0f0f0' },
    { padding: '7px 11px', border: '1px solid #ccc', color: '#000', verticalAlign: 'top', fontSize: '13px' },
    pad, colCount,
  );
  const th = tableStyles.th;
  const td = tableStyles.td;
  const monoOpts = { ...opts, themeColor: '#1a1a1a' };
  return (
    <div style={{ padding: resolveDocPadding(opts, pad), backgroundColor: '#fff', color: '#000', width: dim.width, minHeight: dim.minHeight, margin: 'auto', fontFamily: "'Helvetica Neue', Arial, sans-serif", fontSize: '13px', lineHeight: 1.45, boxSizing: 'border-box' }}>
      {/* Heavy top border */}
      <div style={{ borderTop: '5px solid #000', borderBottom: '1px solid #000', marginBottom: '14px', paddingBottom: '10px', paddingTop: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            {opts.showLogo && business.logo && <img src={business.logo} alt="" style={{ maxHeight: '52px', maxWidth: '120px', objectFit: 'contain', marginBottom: '8px', display: 'block', filter: 'grayscale(100%)' }} />}
            <div style={{ fontSize: '28px', fontWeight: '900', color: '#000', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1 }}>{business.name}</div>
            {business.address && <div style={{ color: '#333', fontSize: '12px', marginTop: '6px' }}>{business.address}</div>}
            {opts.showBusinessPhone !== false && business.phone && <div style={{ color: '#333', fontSize: '12px' }}>Ph: {business.phone}</div>}
            {opts.showBusinessEmail && business.email && <div style={{ color: '#333', fontSize: '12px' }}>{business.email}</div>}
            {opts.showGSTIN && business.gstNumber && <div style={{ color: '#333', fontSize: '12px' }}>GSTIN: {business.gstNumber}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ display: 'inline-block', border: '2px solid #000', padding: '4px 12px', marginBottom: '8px' }}>
              <div style={{ fontSize: '14px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.12em' }}>{headerTitle}</div>
            </div>
            {opts.showInvoiceNumber && <div style={{ fontSize: '13px', fontWeight: '700', color: '#000' }}>No. {transaction.invoiceNumber}</div>}
            {opts.showDate && <div style={{ fontSize: '13px', color: '#333' }}>{formatDate(transaction.date, opts.dateFormat)}</div>}
            {opts.showDueDate && transaction.dueDate && <div style={{ fontSize: '13px', color: '#333' }}>Due: {formatDate(transaction.dueDate, opts.dateFormat)}</div>}
            {opts.showBilledBy && transaction.billedBy && <div style={{ fontSize: '12px', color: '#555' }}>Billed by: {transaction.billedBy}</div>}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', gap: '16px' }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#666', marginBottom: '4px' }}>{isSale ? 'Bill To' : 'Bill From'}</div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: '#000', marginBottom: '3px' }}>{transaction.partyName}</div>
          {opts.showPartyAddress !== false && transaction.partyAddress && <div style={{ color: '#333', fontSize: '12.5px' }}>{transaction.partyAddress}</div>}
          {opts.showPartyPhone !== false && transaction.partyPhone && <div style={{ color: '#333', fontSize: '12.5px' }}>Ph: {transaction.partyPhone}</div>}
          {opts.showPartyGSTIN !== false && transaction.partyGstNumber && <div style={{ color: '#333', fontSize: '12.5px' }}>GSTIN: {transaction.partyGstNumber}</div>}
        </div>
        <div style={{ textAlign: 'right', fontSize: '12.5px', color: '#555' }}>
          {opts.showPlaceOfSupply !== false && transaction.placeOfSupply && <div>Place of Supply: <strong style={{ color: '#000' }}>{transaction.placeOfSupply}</strong></div>}
          {(transaction.isInterState != null || transaction.gstType) && <div>{gstTypeLabel(transaction)}</div>}
        </div>
      </div>
      <table className="inv-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
        <TableHead thStyle={th} showHSN={showHSN} showDisc={showDisc} useCGSTSGST={useCGSTSGST} useIGST={useIGST} useUTGST={useUTGST} isComposite={isComposite} showGST={showGST} opts={opts} />
        <tbody>
          <ItemRows transaction={transaction} opts={monoOpts} tdStyle={td} showHSN={showHSN} showDisc={showDisc} useCGSTSGST={useCGSTSGST} useIGST={useIGST} useUTGST={useUTGST} isComposite={isComposite} showGST={showGST} rowBg={i => i % 2 === 1 ? '#f8f8f8' : '#fff'} />
        </tbody>
      </table>
      <div style={{ borderTop: '2px solid #000', borderBottom: '2px solid #000', padding: '8px 0', marginBottom: '8px', display: 'flex', justifyContent: 'flex-end' }}>
        <TotalsBlock transaction={transaction} opts={monoOpts} isSale={isSale} accentColor="#000" showBalanceSection={showBalanceSection} currentBillTotal={currentBillTotal} balanceNum={balanceNum} openingBalance={openingBalance} compact={pad < 36} />
      </div>
      <HsnBankRow business={business} opts={opts} bankWidth={pad < 36 ? '220px' : '260px'}>
        <HsnTaxSummary transaction={transaction} useIGST={useIGST} useUTGST={useUTGST} isComposite={isComposite} thStyle={{ ...th, fontSize: '10.5px' }} tdStyle={{ ...td, fontSize: '11px' }} opts={opts} />
      </HsnBankRow>
      <div style={{ marginTop: '10px', display: 'table', width: '100%', tableLayout: 'fixed', borderSpacing: '24px 0' }}>
        <div style={{ display: 'table-row' }}>
          {opts.showTerms && (
            <div className="inv-no-break" style={{ display: 'table-cell', width: opts.showSignature ? '62%' : '100%', verticalAlign: 'top' }}>
              <p style={{ margin: '0 0 4px', fontSize: '11.5px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#000' }}>Terms & Conditions</p>
              <p style={{ margin: 0, fontSize: '11px', color: '#444', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                {opts.termsText || '1. Goods once sold will not be taken back.\n2. Interest @ 18% charged if payment is delayed.'}
              </p>
            </div>
          )}
          {opts.showSignature && (
            <div className="inv-no-break" style={{ display: 'table-cell', width: '150px', verticalAlign: 'top', textAlign: 'right' }}>
              <div style={{ height: '40px' }} />
              <div style={{ borderTop: '1px solid #000', paddingTop: '6px' }}>
                <p style={{ margin: '0 0 2px', fontSize: '12px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.04em' }}>For {business.name}</p>
                <p style={{ margin: 0, fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Authorized Signatory</p>
              </div>
            </div>
          )}
        </div>
      </div>
      <PoweredByFooter />
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// THEME 12 — STRIPE
// ════════════════════════════════════════════════════════════════════════════════

const StripeTemplate = (p) => {
  const { transaction, business, dim, opts, isSale, headerTitle, showBalanceSection, currentBillTotal, balanceNum, openingBalance } = p;
  const acc = opts.themeColor || '#334155';
  const lightAcc = lighten(acc, 0.56);
  const showGST = opts.showGSTColumn && !transaction.noGST;
  const { useIGST, useUTGST, isComposite, useCGSTSGST } = deriveGstFlags(transaction, showGST);
  const showDisc = opts.showDiscountColumn && transaction.items?.some(i => Number(i.discountPercent) > 0);
  const showHSN = opts.showHSNColumn !== false && transaction.items?.some(i => i.hsnCode);
  const showSrNo = opts.showSrNo !== false;
  const pad = dim.pad;
  const colCount = countTableColumns(opts, showHSN, showDisc, useCGSTSGST, useUTGST, useIGST, isComposite, showGST);
  const tableStyles = narrowTableStyles(
    { padding: '6px 10px', fontWeight: '700', color: '#888', fontSize: '11.5px', fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.05em' },
    { padding: '7px 10px', color: '#444' },
    pad, colCount,
  );
  const th = tableStyles.th;
  const td = tableStyles.td;
  return (
    <div style={{ padding: resolveDocPadding(opts, pad), backgroundColor: '#fff', color: '#000', width: dim.width, minHeight: dim.minHeight, margin: 'auto', fontFamily: "'Helvetica Neue', -apple-system, Arial, sans-serif", fontSize: '13.5px', lineHeight: 1.4, boxSizing: 'border-box' }}>
      {/* Clean header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', flex: 1 }}>
          {opts.showLogo && business.logo && <img src={business.logo} alt="" style={{ maxHeight: '48px', maxWidth: '120px', objectFit: 'contain' }} />}
          <div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: '#1a1a2e' }}>{business.name}</div>
            {business.address && <div style={{ color: '#888', fontSize: '12px', marginTop: '2px' }}>{business.address}</div>}
            {opts.showBusinessPhone !== false && business.phone && <div style={{ color: '#888', fontSize: '12px' }}>Ph: {business.phone}</div>}
            {opts.showBusinessEmail && business.email && <div style={{ color: '#888', fontSize: '12px' }}>{business.email}</div>}
            {opts.showGSTIN && business.gstNumber && <div style={{ color: '#888', fontSize: '12px' }}>GSTIN: {business.gstNumber}</div>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ display: 'inline-block', backgroundColor: '#1a1a2e', color: '#fff', borderRadius: '6px', padding: '4px 12px', fontSize: '12px', fontWeight: '700', letterSpacing: '0.04em', marginBottom: '8px' }}>
            {transaction.invoiceNumber || headerTitle}
          </div>
          <div style={{ fontSize: '20px', fontWeight: '700', color: '#1a1a2e' }}>{headerTitle}</div>
          {opts.showDate && <div style={{ color: '#888', fontSize: '13px' }}>{formatDate(transaction.date, opts.dateFormat)}</div>}
          {opts.showDueDate && transaction.dueDate && <div style={{ color: '#888', fontSize: '13px' }}>Due: {formatDate(transaction.dueDate, opts.dateFormat)}</div>}
          {opts.showBilledBy && transaction.billedBy && <div style={{ color: '#888', fontSize: '12px' }}>By: {transaction.billedBy}</div>}
          {opts.showPaymentMode && transaction.paymentMode && <div style={{ color: '#888', fontSize: '12px' }}>{transaction.paymentMode}</div>}
        </div>
      </div>
      {/* Full-width address row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', gap: '16px', padding: '10px 18px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', color: '#aaa', letterSpacing: '0.1em', marginBottom: '4px' }}>{isSale ? 'Bill To' : 'Bill From'}</div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: '#1a1a2e' }}>{transaction.partyName}</div>
          {opts.showPartyAddress !== false && transaction.partyAddress && <div style={{ color: '#666', fontSize: '12.5px', marginTop: '2px' }}>{transaction.partyAddress}</div>}
          {opts.showPartyPhone !== false && transaction.partyPhone && <div style={{ color: '#666', fontSize: '12.5px' }}>Ph: {transaction.partyPhone}</div>}
          {opts.showPartyGSTIN !== false && transaction.partyGstNumber && <div style={{ color: '#666', fontSize: '12.5px' }}>GSTIN: {transaction.partyGstNumber}</div>}
        </div>
        <div style={{ textAlign: 'right', fontSize: '12.5px', color: '#666', flexShrink: 0 }}>
          {opts.showPlaceOfSupply !== false && transaction.placeOfSupply && <div>Supply: <strong style={{ color: '#1a1a2e' }}>{transaction.placeOfSupply}</strong></div>}
          {(transaction.isInterState != null || transaction.gstType) && <div style={{ color: '#888', fontSize: '12px' }}>{gstTypeLabel(transaction)}</div>}
        </div>
      </div>
      {/* Items table — plain header, stripe rows */}
      <table className="inv-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
            {showSrNo && <th style={{ ...th, textAlign: 'center' }}>#</th>}
            <th style={{ ...th, textAlign: 'left' }}>Item</th>
            {showHSN && <th style={{ ...th, textAlign: 'left' }}>HSN</th>}
            <th style={{ ...th, textAlign: 'right' }}>Qty</th>
            <th style={{ ...th, textAlign: 'right' }}>Rate</th>
            {showDisc && <th style={{ ...th, textAlign: 'right' }}>Disc%</th>}
            {showGST && <th style={{ ...th, textAlign: 'right' }}>Tax</th>}
            <th style={{ ...th, textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {(transaction.items || []).map((item, idx) => {
            const qty = Number(item.qty) || 0;
            const price = Number(item.price) || 0;
            const discPct = Number(item.discountPercent) || 0;
            const taxRate = Number(item.taxRate) || 0;
            const lineTotal = calcLineTotal(item);
            const isEven = idx % 2 === 0;
            return (
              <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: isEven ? '#fff' : '#fafafa', position: 'relative' }}>
                {showSrNo && <td style={{ ...td, textAlign: 'center', borderLeft: `3px solid ${isEven ? acc : 'transparent'}` }}>{idx + 1}</td>}
                {!showSrNo && <td style={{ borderLeft: `3px solid ${isEven ? acc : 'transparent'}`, width: 3, padding: 0 }} />}
                <td style={{ ...td, fontWeight: '600', color: '#1a1a2e', wordBreak: 'break-word' }}>
                  {item.name}
                  {(() => { const mp = [opts.showItemCategory && item.category, opts.showItemSize === true && item.size && `Size: ${item.size}`, opts.showItemVariant === true && item.variant].filter(Boolean); return mp.length > 0 ? <span style={{ fontWeight: '400', fontSize: '11px', color: '#666' }}>{' — '}{mp.join(' · ')}</span> : null; })()}
                  {item.description && <div style={{ fontWeight: '400', fontSize: '11.5px', color: '#888', marginTop: '2px' }}>{item.description}</div>}
                </td>
                {showHSN && <td style={td}>{item.hsnCode || '-'}</td>}
                <td style={{ ...td, textAlign: 'right' }}>{fmtQty(qty)}{item.unit ? ` ${item.unit}` : ''}</td>
                <td style={{ ...td, textAlign: 'right' }}>₹{price.toFixed(2)}</td>
                {showDisc && <td style={{ ...td, textAlign: 'right' }}>{discPct ? `${discPct}%` : '-'}</td>}
                {showGST && <td style={{ ...td, textAlign: 'right' }}>{taxRate ? `${taxRate}%` : '-'}</td>}
                <td style={{ ...td, textAlign: 'right', fontWeight: '700', color: '#1a1a2e' }}>₹{lineTotal.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {/* Right-side totals in light grey box */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
        <div style={{ width: '260px', backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px solid #e5e7eb', padding: '10px 18px' }}>
          <TotalsBlock transaction={transaction} opts={opts} isSale={isSale} accentColor={acc} showBalanceSection={showBalanceSection} currentBillTotal={currentBillTotal} balanceNum={balanceNum} openingBalance={openingBalance} compact />
        </div>
      </div>
      <HsnBankRow business={business} opts={opts}>
        <HsnTaxSummary transaction={transaction} useIGST={useIGST} useUTGST={useUTGST} isComposite={isComposite} thStyle={{ padding: '6px 10px', fontWeight: '700', color: '#888', fontSize: '11px', borderBottom: '2px solid #e5e7eb', textTransform: 'uppercase', letterSpacing: '0.05em' }} tdStyle={{ padding: '6px 10px', color: '#444', fontSize: '11px', borderBottom: '1px solid #f3f4f6' }} opts={opts} />
      </HsnBankRow>
      {/* Footer */}
      <div style={{ marginTop: '10px', display: 'table', width: '100%', tableLayout: 'fixed', borderSpacing: '24px 0' }}>
        <div style={{ display: 'table-row' }}>
          {opts.showTerms && (
            <div className="inv-no-break" style={{ display: 'table-cell', width: opts.showSignature ? '62%' : '100%', verticalAlign: 'top' }}>
              <p style={{ margin: '0 0 4px', fontSize: '11.5px', fontWeight: '700', color: '#444' }}>Terms & Conditions</p>
              <p style={{ margin: 0, fontSize: '11px', color: '#666', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                {opts.termsText || '1. Goods once sold will not be taken back.\n2. Interest @ 18% charged if payment is delayed.'}
              </p>
            </div>
          )}
          {opts.showSignature && (
            <div className="inv-no-break" style={{ display: 'table-cell', width: '150px', verticalAlign: 'top', textAlign: 'right' }}>
              <div style={{ height: '40px' }} />
              <p style={{ margin: '0 0 4px', fontSize: '12px', fontWeight: '700', color: '#000' }}>For {business.name}</p>
              <p style={{ margin: 0, fontSize: '11px', color: '#666' }}>Authorized Signatory</p>
              {opts.showBilledBy && transaction.billedBy && <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#666' }}>Billed by: <strong>{transaction.billedBy}</strong></p>}
            </div>
          )}
        </div>
      </div>
      <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '12px', color: '#aaa' }}>Thank you for your business</div>
      <PoweredByFooter />
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// THEME 13 — CUSTOM (user-built via the drag-and-drop section builder in Settings)
// ════════════════════════════════════════════════════════════════════════════════

const CustomTemplate = (p) => {
  const { transaction, business, dim, opts, isSale, headerTitle, showBalanceSection, currentBillTotal, balanceNum, openingBalance } = p;
  const acc = opts.themeColor || '#334155';
  const showGST = opts.showGSTColumn && !transaction.noGST;
  const { useIGST, useUTGST, isComposite, useCGSTSGST } = deriveGstFlags(transaction, showGST);
  const showDisc = opts.showDiscountColumn && transaction.items?.some(i => Number(i.discountPercent) > 0);
  const showHSN = opts.showHSNColumn !== false && transaction.items?.some(i => i.hsnCode);
  const pad = dim.pad;
  const colCount = countTableColumns(opts, showHSN, showDisc, useCGSTSGST, useUTGST, useIGST, isComposite, showGST);
  const tableStyles = narrowTableStyles(
    { padding: '7px 11px', fontWeight: '700', border: '1px solid #ccc', color: '#000', whiteSpace: 'nowrap', fontSize: '12.5px', backgroundColor: '#f3f4f6' },
    { padding: '7px 11px', border: '1px solid #ddd', color: '#000', verticalAlign: 'top', fontSize: '13px' },
    pad, colCount,
  );
  const th = tableStyles.th;
  const td = tableStyles.td;

  const sections = resolveCustomTemplate(opts.customTemplate).sections.filter(s => s.enabled);

  const SECTION_RENDERERS = {
    header: () => (
      <div key="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', flex: 1 }}>
          {opts.showLogo && business.logo && <img src={business.logo} alt="" style={{ maxHeight: '60px', maxWidth: '130px', objectFit: 'contain' }} />}
          <div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: '#000', marginBottom: '4px' }}>{business.name}</div>
            {business.address && <div style={{ color: '#444', fontSize: '12.5px' }}>{business.address}</div>}
            {opts.showBusinessPhone !== false && business.phone && <div style={{ color: '#444', fontSize: '12.5px' }}>Ph: {business.phone}</div>}
            {opts.showBusinessEmail && business.email && <div style={{ color: '#444', fontSize: '12.5px' }}>{business.email}</div>}
            {opts.showGSTIN && business.gstNumber && <div style={{ color: '#444', fontSize: '12.5px' }}>GSTIN: {business.gstNumber}</div>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '18px', fontWeight: '800', color: acc, marginBottom: '6px' }}>{headerTitle}</div>
          {opts.showInvoiceNumber && <div style={{ fontSize: '13px', color: '#333' }}>Invoice #: {transaction.invoiceNumber}</div>}
          {opts.showDate && <div style={{ fontSize: '13px', color: '#333' }}>Date: {formatDate(transaction.date, opts.dateFormat)}</div>}
          {opts.showDueDate && transaction.dueDate && <div style={{ fontSize: '13px', color: '#333' }}>Due: {formatDate(transaction.dueDate, opts.dateFormat)}</div>}
          {opts.showPaymentMode && transaction.paymentMode && <div style={{ fontSize: '13px', color: '#333' }}>Mode: {transaction.paymentMode}</div>}
          {opts.showBilledBy && transaction.billedBy && <div style={{ fontSize: '13px', color: '#333' }}>Billed by: {transaction.billedBy}</div>}
        </div>
      </div>
    ),
    billTo: () => (
      <React.Fragment key="billTo">
        <hr style={{ border: 'none', borderTop: `2px solid ${acc}`, marginBottom: '14px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#888', letterSpacing: '0.07em', marginBottom: '5px' }}>{isSale ? 'Bill To' : 'Bill From'}</div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#000', marginBottom: '3px' }}>{transaction.partyName}</div>
            {opts.showPartyAddress !== false && transaction.partyAddress && <div style={{ color: '#444', fontSize: '12.5px' }}>{transaction.partyAddress}</div>}
            {opts.showPartyPhone !== false && transaction.partyPhone && <div style={{ color: '#444', fontSize: '12.5px' }}>Ph: {transaction.partyPhone}</div>}
            {opts.showPartyGSTIN !== false && transaction.partyGstNumber && <div style={{ color: '#444', fontSize: '12.5px' }}>GSTIN: {transaction.partyGstNumber}</div>}
          </div>
          <div style={{ textAlign: 'right', fontSize: '12.5px', color: '#555' }}>
            {opts.showPlaceOfSupply !== false && transaction.placeOfSupply && <div>Place of Supply: <strong style={{ color: '#000' }}>{transaction.placeOfSupply}</strong></div>}
            {(transaction.isInterState != null || transaction.gstType) && <div>Supply: <strong style={{ color: '#000' }}>{gstTypeLabel(transaction)}</strong></div>}
            {transaction.reverseCharge && <div style={{ color: '#b91c1c', fontWeight: '700' }}>Reverse Charge: Yes</div>}
          </div>
        </div>
      </React.Fragment>
    ),
    items: () => (
      <table key="items" className="inv-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
        <TableHead thStyle={th} showHSN={showHSN} showDisc={showDisc} useCGSTSGST={useCGSTSGST} useIGST={useIGST} useUTGST={useUTGST} isComposite={isComposite} showGST={showGST} opts={opts} />
        <tbody>
          <ItemRows transaction={transaction} opts={opts} tdStyle={td} showHSN={showHSN} showDisc={showDisc} useCGSTSGST={useCGSTSGST} useIGST={useIGST} useUTGST={useUTGST} isComposite={isComposite} showGST={showGST} rowBg={i => i % 2 === 1 ? '#fafafa' : '#fff'} />
        </tbody>
      </table>
    ),
    totals: () => (
      <div key="totals" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
        <TotalsBlock transaction={transaction} opts={opts} isSale={isSale} accentColor={acc} showBalanceSection={showBalanceSection} currentBillTotal={currentBillTotal} balanceNum={balanceNum} openingBalance={openingBalance} compact={pad < 36} />
      </div>
    ),
    // Rendered standalone when only one of the two is enabled/adjacent; when
    // both bankDetails and hsnSummary are enabled AND sit next to each other
    // in the final order, the pairing loop below renders them together via
    // HsnBankRow instead (Bank Details left, HSN Summary right) so the user
    // still gets the compact side-by-side layout without having to manage
    // that pairing themselves.
    bankDetails: () => (
      <div key="bankDetails" style={{ width: pad < 36 ? '220px' : '260px', marginBottom: '10px' }}>
        <BankDetailsBlock business={business} opts={opts} />
      </div>
    ),
    hsnSummary: () => (
      <div key="hsnSummary" style={{ marginBottom: '10px' }}>
        <HsnTaxSummary transaction={transaction} useIGST={useIGST} useUTGST={useUTGST} isComposite={isComposite} thStyle={{ ...th, backgroundColor: '#f9fafb' }} tdStyle={{ ...td, backgroundColor: '#fff' }} opts={opts} />
      </div>
    ),
    loyalty: () => <LoyaltyBlock key="loyalty" transaction={transaction} opts={opts} />,
    terms: () => (
      opts.showTerms ? (
        <div key="terms" style={{ marginBottom: '10px' }}>
          <p style={{ margin: '0 0 4px 0', fontSize: '11.5px', fontWeight: '700', color: '#444' }}>Terms & Conditions:</p>
          <p style={{ margin: 0, fontSize: '11px', color: '#555', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
            {opts.termsText || '1. Goods once sold will not be taken back.\n2. Interest @ 18% will be charged if payment is not made within 7 days.'}
          </p>
        </div>
      ) : null
    ),
    signature: () => (
      opts.showSignature ? (
        <div key="signature" style={{ textAlign: 'right', marginBottom: '10px' }}>
          <div style={{ height: '40px' }} />
          <p style={{ margin: '0 0 4px 0', fontSize: '13px', fontWeight: '700', color: '#000' }}>For {business.name}</p>
          <p style={{ margin: 0, fontSize: '11px', color: '#555' }}>Authorized Signatory</p>
          {opts.showBilledBy && transaction.billedBy && (
            <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#555' }}>
              Billed by: <strong style={{ color: '#000' }}>{transaction.billedBy}</strong>
            </p>
          )}
        </div>
      ) : null
    ),
  };

  // Renders the enabled sections in order, pairing bankDetails+hsnSummary
  // into one HsnBankRow (Bank Details left, HSN Summary right) whenever both
  // are enabled AND land next to each other after drag-reordering — anywhere
  // else in the order (separated by another section, or only one enabled)
  // they render standalone via SECTION_RENDERERS as normal.
  const renderedSections = [];
  for (let i = 0; i < sections.length; i++) {
    const cur = sections[i];
    const next = sections[i + 1];
    const isPairAdjacent = (a, b) =>
      a && b && ((a.key === 'bankDetails' && b.key === 'hsnSummary') || (a.key === 'hsnSummary' && b.key === 'bankDetails'));
    if (isPairAdjacent(cur, next)) {
      renderedSections.push(
        <HsnBankRow key="bankDetails-hsnSummary-pair" business={business} opts={opts} bankWidth={pad < 36 ? '220px' : '260px'}>
          <HsnTaxSummary transaction={transaction} useIGST={useIGST} useUTGST={useUTGST} isComposite={isComposite} thStyle={{ ...th, backgroundColor: '#f9fafb' }} tdStyle={{ ...td, backgroundColor: '#fff' }} opts={opts} />
        </HsnBankRow>
      );
      i++; // consumed both cur and next
      continue;
    }
    renderedSections.push(SECTION_RENDERERS[cur.key]?.());
  }

  return (
    <div style={{ padding: resolveDocPadding(opts, pad), backgroundColor: '#fff', color: '#000', width: dim.width, minHeight: dim.minHeight, margin: 'auto', fontFamily: 'Arial, sans-serif', fontSize: '13.5px', lineHeight: 1.45, boxSizing: 'border-box' }}>
      {renderedSections}
      <PoweredByFooter />
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// MAIN ROUTER
// ════════════════════════════════════════════════════════════════════════════════

const THEME_MAP = {
  classic:   ClassicTemplate,
  modern:    ModernTemplate,
  compact:   CompactTemplate,
  elegant:   ElegantTemplate,
  bold:      BoldTemplate,
  minimal:   MinimalTemplate,
  corporate: CorporateTemplate,
  vivid:     VividTemplate,
  receipt:   ReceiptTemplate,
  premium:   PremiumTemplate,
  mono:      MonoTemplate,
  stripe:    StripeTemplate,
  custom:    CustomTemplate,
};

const InvoiceTemplate = forwardRef(({ transaction: rawTransaction, business, paperSize = 'A4', title, partyBalance, printOptions }, ref) => {
  if (!rawTransaction || !business) return null;

  // "Not billed" lines (e.g. a free cover/bag consumed during a sale — see
  // Sales.jsx/POS.jsx) still deduct stock and stay visible in the app's own
  // invoice view, but never print on the customer-facing bill. Filtered once
  // here so every theme (both the shared ItemRows component and the few
  // themes with their own inline item map) and every totals/HSN aggregation
  // downstream only ever sees billed lines, with no per-theme changes needed.
  const transaction = rawTransaction.items?.some(i => i.notBilled)
    ? { ...rawTransaction, items: rawTransaction.items.filter(i => !i.notBilled) }
    : rawTransaction;

  const opts = { ...DEFAULT_PRINT_OPTIONS, ...printOptions };

  if (paperSize === 'Thermal 80mm' || paperSize === 'Thermal 58mm') {
    return (
      <div ref={ref}>
        <ThermalTemplate transaction={transaction} business={business} paperSize={paperSize} opts={opts} />
      </div>
    );
  }

  if (paperSize === 'Dot Matrix') {
    return (
      <div ref={ref}>
        <DotMatrixTemplate transaction={transaction} business={business} opts={opts} />
      </div>
    );
  }

  const isSale = transaction.type === 'Sales';
  const headerTitle = title || (isSale ? 'TAX INVOICE' : 'PURCHASE BILL');
  const currentBillTotal = transaction.totalAmount ?? 0;
  const balanceNum = partyBalance != null ? Number(partyBalance) : null;
  const openingBalance = balanceNum != null ? balanceNum - currentBillTotal : null;
  const showBalanceSection = isSale && balanceNum != null && opts.showOldBalance;

  const dim = PAPER_DIM[paperSize] || PAPER_DIM['A4'];
  const themeKey = opts.invoiceTheme || 'classic';
  const ThemeComponent = THEME_MAP[themeKey] || ClassicTemplate;

  return (
    <div ref={ref} className="invoice-for-print">
      <PrintStyle />
      <ThemeComponent
        transaction={transaction}
        business={business}
        dim={dim}
        opts={opts}
        isSale={isSale}
        headerTitle={headerTitle}
        showBalanceSection={showBalanceSection}
        currentBillTotal={currentBillTotal}
        balanceNum={balanceNum}
        openingBalance={openingBalance}
      />
    </div>
  );
});

InvoiceTemplate.displayName = 'InvoiceTemplate';
export default InvoiceTemplate;
