// Pure helpers for the free-form barcode/QR label designer.
//
// A custom layout is `barcodeLabel.customLayout = { elements: [...] }`.
// Every element's x / y / w / h is a PERCENTAGE of the label's width/height,
// so one design keeps its proportions when the label size changes.
//
// Element shape:
//   { id, type, x, y, w, h,
//     autoFit,        // text: size the font to fill the box (default true)
//     fontSize,       // text: points, used when autoFit is off
//     bold, italic, align: 'left'|'center'|'right', vAlign: 'top'|'center'|'bottom',
//     color, prefix,  // text shown before the value, e.g. "MRP "
//     strike,         // line-through (MRP)
//     text,           // customText only
//     thickness,      // line/box stroke in mm
//     hidden }

export const PX_PER_MM = 3.7795;

export const ELEMENT_TYPES = [
  { type: 'barcode',      label: 'Barcode',        group: 'Code' },
  { type: 'qr',           label: 'QR Code',        group: 'Code' },
  { type: 'codeNumber',   label: 'Code Number',    group: 'Code' },
  { type: 'itemName',     label: 'Item Name',      group: 'Item' },
  { type: 'itemCode',     label: 'Item Code',      group: 'Item' },
  { type: 'category',     label: 'Category',       group: 'Item' },
  { type: 'size',         label: 'Size',           group: 'Item' },
  { type: 'variant',      label: 'Variant',        group: 'Item' },
  { type: 'hsn',          label: 'HSN / SAC',      group: 'Item' },
  { type: 'extraFields',  label: 'Extra Fields',   group: 'Item' },
  { type: 'mrp',          label: 'MRP',            group: 'Price' },
  { type: 'salePrice',    label: 'Sale Price',     group: 'Price' },
  { type: 'businessName', label: 'Business Name',  group: 'Other' },
  { type: 'customText',   label: 'Custom Text',    group: 'Other' },
  { type: 'line',         label: 'Line',           group: 'Shape' },
  { type: 'box',          label: 'Box / Border',   group: 'Shape' },
];

export const typeLabel = (type) => ELEMENT_TYPES.find((t) => t.type === type)?.label || type;
export const isCodeType = (type) => type === 'barcode' || type === 'qr';
export const isShapeType = (type) => type === 'line' || type === 'box';
export const isTextType = (type) => !isCodeType(type) && !isShapeType(type);

const DEFAULT_PREFIX = { mrp: 'MRP ', hsn: 'HSN: ', size: 'Size: ' };

// Default size/look for a newly added element.
export const newElement = (type) => {
  const base = { id: `el_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, type, x: 10, y: 10, w: 50, h: 14, autoFit: true, fontSize: 8, bold: false, italic: false, align: 'center', vAlign: 'center', color: '', prefix: DEFAULT_PREFIX[type] ?? '' };
  if (type === 'barcode') return { ...base, x: 8, y: 30, w: 84, h: 36 };
  if (type === 'qr') return { ...base, x: 35, y: 25, w: 30, h: 50 };
  if (type === 'itemName') return { ...base, bold: true, w: 80 };
  if (type === 'salePrice') return { ...base, bold: true };
  if (type === 'mrp') return { ...base, strike: true };
  if (type === 'customText') return { ...base, text: 'Your text' };
  if (type === 'line') return { ...base, x: 5, y: 50, w: 90, h: 3, thickness: 0.3 };
  if (type === 'box') return { ...base, x: 2, y: 2, w: 96, h: 96, thickness: 0.3 };
  return base;
};

// Text value (without prefix) an element shows for a given item.
export const elementValue = (el, item) => {
  const money = (v) => `₹${Number(v).toLocaleString('en-IN')}`;
  switch (el.type) {
    case 'itemName': return item?.name || '';
    case 'itemCode': return item?.itemCode || '';
    case 'category': return item?.category || '';
    case 'size': return item?.size || '';
    case 'variant': return item?.variant || '';
    case 'hsn': return item?.hsnCode || '';
    case 'mrp': return item?.mrp && Number(item.mrp) > 0 ? money(item.mrp) : '';
    case 'salePrice': return item?.salePrice != null && Number(item.salePrice) > 0 ? money(item.salePrice) : '';
    case 'businessName': return item?._businessName || '';
    case 'codeNumber': return item?.barcode || '';
    case 'customText': return el.text || '';
    case 'extraFields':
      return (item?.barcodeExtraFields || [])
        .filter((f) => f.label || f.value)
        .map((f) => (f.label ? `${f.label}: ${f.value}` : f.value))
        .join('  ·  ');
    default: return '';
  }
};

export const qrValueFor = (item) => item?.barcode || item?.itemCode || item?.name || 'item';

// Starter layout converted from the Simple settings, so switching to the
// designer starts from what the user already had: every enabled field, in
// the saved field order, with its custom label (prefix), colour and size,
// the code (barcode or QR) where "Code Position" put it, and the text
// alignment. Rows are sized from each field's size setting.
const SIMPLE_FIELD_TO_TYPE = {
  showBusinessName: 'businessName', showItemName: 'itemName', showItemCode: 'itemCode',
  showCategory: 'category', showSize: 'size', showVariant: 'variant', showHsn: 'hsn',
  showMrp: 'mrp', showSalePrice: 'salePrice', showExtraFields: 'extraFields',
};
const SIMPLE_FIELD_ORDER = [
  'showBusinessName', 'showItemName', 'showItemCode', 'showCategory', 'showSize', 'showVariant',
  'showHsn', 'showMrp', 'showSalePrice', 'showBarcode', 'showBarcodeNumber', 'showExtraFields',
];
const SIZE_WEIGHT = { xs: 0.6, sm: 0.75, small: 0.75, md: 1, medium: 1, lg: 1.4, large: 1.4, xl: 1.9, '2xl': 2.6 };

export const templateLayout = (lbl = {}, widthMm = 50, heightMm = 25) => {
  const on = (k) => lbl[k] !== false;
  const qr = lbl.codeType === 'qr';
  const pos = lbl.codePosition || 'top';
  const align = lbl.contentAlign || 'center';
  const styles = lbl.fieldStyles || {};
  const labels = lbl.fieldLabels || {};
  const saved = Array.isArray(lbl.fieldOrder) && lbl.fieldOrder.length ? lbl.fieldOrder : [];
  const order = [...saved, ...SIMPLE_FIELD_ORDER.filter((k) => !saved.includes(k))];

  // Text rows, in order. MRP + Sale Price next to each other share one row,
  // exactly like the Simple layout prints them.
  const rows = [];
  for (let i = 0; i < order.length; i++) {
    const key = order[i];
    const type = SIMPLE_FIELD_TO_TYPE[key];
    if (!type || !on(key)) continue;
    const next = order[i + 1];
    if ((key === 'showMrp' && next === 'showSalePrice' && on('showSalePrice')) ||
        (key === 'showSalePrice' && next === 'showMrp' && on('showMrp'))) {
      rows.push([key, next]); i++;
    } else rows.push([key]);
  }

  const makeText = (key, box) => {
    const type = SIMPLE_FIELD_TO_TYPE[key];
    const st = styles[key] || {};
    const el = { ...newElement(type), ...box, align };
    if (labels[key] !== undefined) el.prefix = labels[key] ? `${labels[key]}${type === 'mrp' || type === 'salePrice' ? ' ' : ': '}` : '';
    if (st.color) el.color = st.color;
    return el;
  };

  // Code block (barcode/QR + optional number underneath).
  const hasCode = qr || on('showBarcode');
  const hasNumber = on('showBarcodeNumber');
  const horizontal = pos === 'left' || pos === 'right';
  const els = [];
  const M = 3; // % margin

  // Region left for text.
  let tx = M, tw = 100 - 2 * M, ty = M, th = 100 - 2 * M;
  let codeBox = null;
  if (hasCode) {
    if (horizontal) {
      const cw = qr ? Math.min(45, ((heightMm * 0.8) / widthMm) * 100) : 50;
      codeBox = { x: pos === 'left' ? M : 100 - M - cw, y: M, w: cw, h: 100 - 2 * M };
      tx = pos === 'left' ? M + cw + 2 : M;
      tw = 100 - 2 * M - cw - 2;
    } else {
      const ch = qr ? Math.min(55, ((widthMm * 0.45) / heightMm) * 100) : 42;
      codeBox = { x: M, y: 0, w: 100 - 2 * M, h: ch };
    }
  }

  // Row heights weighted by each row's size setting.
  const weightOf = (row) => Math.max(...row.map((k) => SIZE_WEIGHT[styles[k]?.size] ?? (k === 'showItemName' || k === 'showSalePrice' ? 1.3 : 1)));
  const layoutRows = (list, x, y, w, h) => {
    if (!list.length) return;
    const total = list.reduce((s, r) => s + weightOf(r), 0);
    let cy = y;
    for (const row of list) {
      const rh = Math.min(h * (weightOf(row) / total), 22);
      if (row.length === 2) {
        els.push(makeText(row[0], { x, y: round1(cy), w: round1(w * 0.48), h: round1(rh), align: 'left' }));
        els.push(makeText(row[1], { x: round1(x + w * 0.52), y: round1(cy), w: round1(w * 0.48), h: round1(rh), align: 'right' }));
      } else {
        els.push(makeText(row[0], { x, y: round1(cy), w, h: round1(rh) }));
      }
      cy += rh;
    }
  };

  const placeCode = (box) => {
    const numH = hasNumber && !qr ? Math.min(9, box.h * 0.2) : 0;
    if (qr) {
      const side = Math.min((box.w / 100) * widthMm, (box.h / 100) * heightMm * (hasNumber ? 0.82 : 1));
      const w = (side / widthMm) * 100; const h = (side / heightMm) * 100;
      els.push({ ...newElement('qr'), x: round1(box.x + (box.w - w) / 2), y: round1(box.y), w: round1(w), h: round1(h) });
      if (hasNumber) els.push({ ...newElement('codeNumber'), x: box.x, y: round1(box.y + h), w: box.w, h: round1(Math.min(9, box.h - h)) });
    } else {
      els.push({ ...newElement('barcode'), x: round1(box.x + box.w * 0.04), y: round1(box.y), w: round1(box.w * 0.92), h: round1(box.h - numH) });
      if (hasNumber) els.push({ ...newElement('codeNumber'), x: box.x, y: round1(box.y + box.h - numH), w: box.w, h: round1(numH) });
    }
  };

  if (!codeBox) {
    layoutRows(rows, tx, ty, tw, th);
  } else if (horizontal) {
    placeCode(codeBox);
    layoutRows(rows, tx, ty, tw, th);
  } else {
    const textH = 100 - 2 * M - codeBox.h - 2;
    if (pos === 'top') {
      placeCode({ ...codeBox, y: M });
      layoutRows(rows, tx, M + codeBox.h + 2, tw, textH);
    } else if (pos === 'bottom') {
      layoutRows(rows, tx, M, tw, textH);
      placeCode({ ...codeBox, y: 100 - M - codeBox.h });
    } else { // middle: text split above and below
      const half = Math.ceil(rows.length / 2);
      const above = rows.slice(0, half); const below = rows.slice(half);
      const hAbove = textH * (above.length / Math.max(1, rows.length));
      layoutRows(above, tx, M, tw, hAbove);
      placeCode({ ...codeBox, y: round1(M + hAbove + 1) });
      layoutRows(below, tx, round1(M + hAbove + codeBox.h + 2), tw, textH - hAbove);
    }
  }
  return { elements: els };
};

// Font size (px) that makes `text` fill a w×h px box on one line.
const measureCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
const widthCache = new Map();
export const fitFontPx = (text, wPx, hPx, bold, italic) => {
  if (!text) return Math.max(4, hPx * 0.8);
  const key = `${bold ? 1 : 0}${italic ? 1 : 0}|${text}`;
  let w10 = widthCache.get(key);
  if (w10 == null) {
    const ctx = measureCanvas?.getContext('2d');
    if (ctx) {
      ctx.font = `${italic ? 'italic ' : ''}${bold ? 700 : 400} 10px Arial, sans-serif`;
      w10 = ctx.measureText(text).width || 1;
    } else {
      w10 = text.length * 5.5;
    }
    widthCache.set(key, w10);
  }
  const byWidth = (10 * Math.max(1, wPx - 1) * 0.94) / w10; // small margin for font rendering differences
  const byHeight = hPx * 0.82;
  return Math.max(3, Math.min(byWidth, byHeight));
};

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const round1 = (v) => Math.round(v * 10) / 10;

/* ── Label sizes (shared by Items print dialogs and Settings) ── */

export const LABEL_SIZES = [
  { key: 'standard',  label: '80×40mm (Standard)',        widthMm: 80,  heightMm: 40  },
  { key: '50x40',     label: '50×40mm',                   widthMm: 50,  heightMm: 40  },
  { key: '50x30',     label: '50×30mm',                   widthMm: 50,  heightMm: 30  },
  { key: '50x25',     label: '50×25mm',                   widthMm: 50,  heightMm: 25  },
  { key: '38x25',     label: '38×25mm (Jewellery)',        widthMm: 38,  heightMm: 25  },
  { key: '30x20',     label: '30×20mm (Mini)',             widthMm: 30,  heightMm: 20  },
  { key: 'small',     label: '58×30mm (Narrow Thermal)',   widthMm: 58,  heightMm: 30  },
  { key: '60x40',     label: '60×40mm',                   widthMm: 60,  heightMm: 40  },
  { key: '70x40',     label: '70×40mm',                   widthMm: 70,  heightMm: 40  },
  { key: '100x50',    label: '100×50mm (Large)',           widthMm: 100, heightMm: 50  },
  { key: '100x75',    label: '100×75mm (Shipping)',        widthMm: 100, heightMm: 75  },
  { key: '100x150',   label: '100×150mm (Large Shipping)', widthMm: 100, heightMm: 150 },
  { key: 'large',     label: '100×60mm',                  widthMm: 100, heightMm: 60  },
  { key: 'a4',        label: 'A4 Full Page',              widthMm: 210, heightMm: 297 },
  { key: 'custom',    label: 'Custom size…',              widthMm: 50,  heightMm: 25  },
];

// Label size entry for the saved settings — 'custom' reads the user's own
// width/height (mm) instead of a fixed preset.
export const resolveLabelEntry = (lbl) => {
  const key = lbl?.defaultLabelSize || 'standard';
  if (key === 'custom') {
    return {
      key: 'custom', label: 'Custom',
      widthMm: Math.min(300, Math.max(10, Number(lbl?.customWidthMm) || 50)),
      heightMm: Math.min(300, Math.max(8, Number(lbl?.customHeightMm) || 25)),
    };
  }
  return LABEL_SIZES.find(s => s.key === key) || LABEL_SIZES[0];
};

// Whether a label can be printed for this item: the classic layout needs a
// barcode unless it's in QR mode; a designed layout needs one only if it has
// a barcode element and no QR element.
export const labelPrintable = (item, lbl) => {
  if (item?.barcode) return true;
  if (lbl?.layoutMode === 'custom' && lbl?.customLayout?.elements?.length) {
    return lbl.customLayout.elements.some(e => !e.hidden && e.type !== 'barcode');
  }
  return lbl?.codeType === 'qr';
};
