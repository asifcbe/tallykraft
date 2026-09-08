import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Box, Button, Card, CardContent, Typography, TextField, Dialog,
  DialogTitle, DialogContent, DialogActions, MenuItem,
  InputAdornment, Chip, IconButton, Snackbar, Alert, Stack, Divider,
  Tooltip, alpha, useTheme, useMediaQuery, Pagination, Menu, Avatar,
  Grid, Checkbox,
} from '@mui/material';
import { X as CloseIcon } from 'lucide-react';
import {
  Plus, Edit2, Trash2, Box as BoxIcon, Barcode, Printer,
  Package, TrendingUp, AlertTriangle, Upload, Download, Search,
  Palette, Ruler, Users as UsersIcon, LayoutList, MoreHorizontal,
  FolderOpen, Tag, Filter, X, CheckSquare, QrCode, MousePointerClick, Eye, EyeOff,
} from 'lucide-react';
import ItemFormDialog from './ItemFormDialog';
import BulkAddDialog from './BulkAddDialog';
import ItemBulkEditDialog from './ItemBulkEditDialog';
import { useBusiness } from './BusinessContext';
import { useData } from './DataContext';
import { useI18n } from './i18n/I18nContext';
import ImportDialog from './ImportDialog';
import { exportToExcel, ITEM_COLUMNS } from './exportUtils';
import { useConfig } from './ConfigContext';
import { useSubscription } from './SubscriptionContext';
import { useDialog } from './DialogContext';
import { useAuth } from './AuthContext';
import { useReactToPrint } from 'react-to-print';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { BUILTIN_PRODUCT_CATEGORIES, loadCustomItemCategories, saveCustomItemCategories } from './partyUtils';
import { useFillHeight } from './TxListView';

const DEFAULT_UNITS = ['NOS', 'BAGS', 'BOX', 'KGS', 'Ltr', 'Mtr', 'Pcs'];
const TAX_SLABS = [0, 5, 12, 18, 28];
const ROWS_PER_PAGE = 12;
const ITEM_CATEGORIES = [
  'Clothing', 'Footwear', 'Accessories', 'Electronics', 'Mobile & Tablets',
  'Food & Beverages', 'Grocery', 'Pharmacy', 'Cosmetics & Beauty',
  'Furniture', 'Hardware', 'Stationery', 'Books', 'Toys & Games',
  'Automotive', 'Agriculture', 'Jewellery', 'Sports & Fitness', 'Other',
];

const generateBarcode = () => String(Math.floor(Math.random() * 9e8 + 1e8));

// Printing N copies of the same label previously re-ran JsBarcode/QRCode.toCanvas
// (each a real encode + DOM/canvas draw) once per copy — 100 copies meant 100
// redundant encodes of identical data. Since a given (value, size) combo always
// produces the same image, encode once into a data URL and cache it; every
// subsequent copy just reuses the cached <img src>, so N copies cost 1 encode.
const barcodeCache = new Map();
const qrCache = new Map();

const BarcodeImage = ({ value, height = 70, fontSize = 13, barWidth = 1.5 }) => {
  const key = `${value}|${height}|${fontSize}|${barWidth}`;
  let src = barcodeCache.get(key);
  if (!src && value) {
    try {
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, value, {
        format: 'CODE128', width: barWidth, height, displayValue: true,
        fontSize, margin: 2, background: '#ffffff', lineColor: '#000000',
      });
      src = canvas.toDataURL('image/png');
      barcodeCache.set(key, src);
    } catch (e) { src = null; }
  }
  if (!src) return <svg style={{ maxWidth: '100%', display: 'block' }} />;
  return <img src={src} alt={value} style={{ maxWidth: '100%', display: 'block' }} />;
};

const QRImage = ({ value, size = 80 }) => {
  const key = `${value}|${size}`;
  const [src, setSrc] = useState(() => qrCache.get(key) || null);
  useEffect(() => {
    const cached = qrCache.get(key);
    if (cached) { setSrc(cached); return; }
    if (!value) return;
    let cancelled = false;
    QRCode.toDataURL(value, {
      width: size, margin: 1, color: { dark: '#000000', light: '#ffffff' },
    }).then((url) => {
      qrCache.set(key, url);
      if (!cancelled) setSrc(url);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [key, value, size]);
  if (!src) return <canvas style={{ display: 'block' }} width={size} height={size} />;
  return <img src={src} alt={value} width={size} height={size} style={{ display: 'block' }} />;
};

/* ── All supported text fields for a label, in canonical order ── */
export const ALL_LABEL_FIELDS = [
  { key: 'showBusinessName', defaultLabel: 'Business Name' },
  { key: 'showItemName',     defaultLabel: 'Item Name' },
  { key: 'showItemCode',     defaultLabel: 'Item Code' },
  { key: 'showCategory',     defaultLabel: 'Category' },
  { key: 'showSize',         defaultLabel: 'Size' },
  { key: 'showVariant',      defaultLabel: 'Variant' },
  { key: 'showHsn',          defaultLabel: 'HSN Code' },
  { key: 'showMrp',          defaultLabel: 'MRP' },
  { key: 'showSalePrice',    defaultLabel: 'Sale Price' },
  { key: 'showBarcode',      defaultLabel: 'Barcode Strip' },
  { key: 'showBarcodeNumber',defaultLabel: 'Code Number' },
  { key: 'showExtraFields',  defaultLabel: 'Extra Fields' },
];

// size variant → font-size multiplier relative to the label's base fontSize
const FIELD_SIZE_SCALE = { xs: 0.6, sm: 0.75, md: 1.0, lg: 1.4, xl: 1.9, '2xl': 2.6 };
// legacy keys still work
FIELD_SIZE_SCALE.small = FIELD_SIZE_SCALE.sm;
FIELD_SIZE_SCALE.medium = FIELD_SIZE_SCALE.md;
FIELD_SIZE_SCALE.large = FIELD_SIZE_SCALE.lg;

// Returns the ordered list of field keys, falling back to ALL_LABEL_FIELDS order
export const resolveFieldOrder = (lbl) => {
  const saved = lbl?.fieldOrder;
  if (Array.isArray(saved) && saved.length > 0) {
    // Merge: keep saved order, append any new fields not yet in saved list
    const extras = ALL_LABEL_FIELDS.map(f => f.key).filter(k => !saved.includes(k));
    return [...saved, ...extras];
  }
  return ALL_LABEL_FIELDS.map(f => f.key);
};

/* ── Shared label content block (text info, no code image) ── */
const LabelContent = ({ item, lbl, fontSize, smallFontSize, align = 'center' }) => {
  const show = (key) => lbl?.[key] !== false;
  const globalTextColor = lbl?.textColor || '#000000';
  const ta = align;
  const order = resolveFieldOrder(lbl);
  const fieldStyles = lbl?.fieldStyles || {};
  const fieldLabels = lbl?.fieldLabels || {};

  // Resolve per-field font size and color
  const fStyle = (key, baseFs) => {
    const s = fieldStyles[key] || {};
    const scale = FIELD_SIZE_SCALE[s.size] ?? 1.0;
    return {
      fontSize: baseFs * scale,
      color: s.color || globalTextColor,
    };
  };

  // Resolve prefix label for a field: custom label, or empty string (no prefix by default for values)
  const fLabel = (key) => {
    const labels = lbl?.fieldLabels || {};
    return labels[key] !== undefined ? labels[key] : null; // null = use default logic
  };

  const renderField = (key) => {
    switch (key) {
      case 'showBusinessName': {
        if (!show('showBusinessName') || !item?._businessName) return null;
        const st = fStyle(key, smallFontSize);
        const prefix = fLabel(key);
        return (
          <p key={key} style={{ margin: '0 0 1px', fontWeight: 600, ...st }}>
            {prefix != null ? (prefix ? `${prefix}: ` : '') : ''}{item._businessName}
          </p>
        );
      }
      case 'showItemName': {
        if (!show('showItemName')) return null;
        const st = fStyle(key, fontSize);
        const prefix = fLabel(key);
        return (
          <p key={key} style={{ margin: '0 0 2px', fontWeight: 700, lineHeight: 1.2, ...st }}>
            {prefix != null ? (prefix ? `${prefix}: ` : '') : ''}{item?.name}
          </p>
        );
      }
      case 'showItemCode': {
        if (!show('showItemCode') || !item?.itemCode) return null;
        const st = fStyle(key, smallFontSize);
        const prefix = fLabel(key);
        return (
          <p key={key} style={{ margin: '0 0 2px', opacity: 0.7, ...st }}>
            {prefix != null ? (prefix ? `${prefix}: ` : '') : ''}{item.itemCode}
          </p>
        );
      }
      case 'showCategory': {
        if (!show('showCategory') || !item?.category) return null;
        const st = fStyle(key, smallFontSize);
        const prefix = fLabel(key);
        return (
          <p key={key} style={{ margin: '0 0 2px', opacity: 0.75, ...st }}>
            {prefix != null ? (prefix ? `${prefix}: ` : '') : ''}{item.category}
          </p>
        );
      }
      case 'showSize': {
        if (!show('showSize') || !item?.size) return null;
        const st = fStyle(key, smallFontSize);
        const prefix = fLabel(key);
        return (
          <p key={key} style={{ margin: '0 0 2px', opacity: 0.75, ...st }}>
            {prefix != null ? (prefix ? `${prefix}: ` : '') : 'Size: '}{item.size}
          </p>
        );
      }
      case 'showVariant': {
        if (!show('showVariant') || !item?.variant) return null;
        const st = fStyle(key, smallFontSize);
        const prefix = fLabel(key);
        return (
          <p key={key} style={{ margin: '0 0 2px', opacity: 0.75, ...st }}>
            {prefix != null ? (prefix ? `${prefix}: ` : '') : ''}{item.variant}
          </p>
        );
      }
      case 'showHsn': {
        if (!show('showHsn') || !item?.hsnCode) return null;
        const st = fStyle(key, smallFontSize);
        const prefix = fLabel(key);
        const label = prefix != null ? prefix : 'HSN';
        return (
          <p key={key} style={{ margin: '0 0 2px', opacity: 0.6, ...st }}>
            {label ? `${label}: ` : ''}{item.hsnCode}
          </p>
        );
      }
      case 'showMrp':
      case 'showSalePrice': {
        const mIdx = order.indexOf('showMrp');
        const sIdx = order.indexOf('showSalePrice');
        const firstPriceKey = mIdx <= sIdx ? 'showMrp' : 'showSalePrice';
        if (key !== firstPriceKey) return null;
        const hasMrp = show('showMrp') && item?.mrp && Number(item.mrp) > 0;
        const hasSalePrice = show('showSalePrice') && item?.salePrice != null && Number(item.salePrice) > 0;
        if (!hasMrp && !hasSalePrice) return null;
        const mrpSt = fStyle('showMrp', smallFontSize);
        const spSt = fStyle('showSalePrice', fontSize);
        const mrpPrefix = fLabel('showMrp');
        const spPrefix = fLabel('showSalePrice');
        return (
          <div key="prices" style={{ display: 'flex', alignItems: 'baseline', justifyContent: ta === 'center' ? 'center' : ta === 'right' ? 'flex-end' : 'flex-start', flexWrap: 'wrap', gap: 3, margin: '3px 0 1px' }}>
            {hasMrp && (
              <span style={{ textDecoration: 'line-through', opacity: 0.5, ...mrpSt }}>
                {mrpPrefix != null ? (mrpPrefix ? `${mrpPrefix} ` : '') : 'MRP '}₹{Number(item.mrp).toLocaleString('en-IN')}
              </span>
            )}
            {hasSalePrice && (
              <span style={{ fontWeight: 800, letterSpacing: '0.02em', fontSize: hasMrp ? spSt.fontSize * 1.05 : spSt.fontSize, color: spSt.color }}>
                {spPrefix != null ? (spPrefix ? `${spPrefix} ` : '') : ''}₹{Number(item.salePrice).toLocaleString('en-IN')}
              </span>
            )}
          </div>
        );
      }
      case 'showBarcode':
      case 'showBarcodeNumber':
        return null;
      case 'showExtraFields':
        return show('showExtraFields') ? (
          (item?.barcodeExtraFields || []).filter(f => f.label || f.value).map((f, i) => {
            const st = fStyle(key, smallFontSize);
            return (
              <p key={`extra-${i}`} style={{ margin: '1px 0', ...st }}>
                {f.label ? <strong>{f.label}: </strong> : ''}{f.value}
              </p>
            );
          })
        ) : null;
      default:
        return null;
    }
  };

  return (
    <div style={{ flex: 1, textAlign: ta, fontFamily: 'Arial, sans-serif', minWidth: 0 }}>
      {order.map(k => renderField(k))}
    </div>
  );
};

/* ── Generic label that supports all layout positions ── */
export const UnifiedLabel = ({ item, sizeConfig, lbl, mode = 'barcode', fitContent = false }) => {
  const { width, height, barcodeHeight, qrSize, barWidth, fontSize, smallFontSize } = sizeConfig;
  const show = (key) => lbl?.[key] !== false;
  const pos = lbl?.codePosition || 'top';
  const align = lbl?.contentAlign || 'center';
  const bgColor = lbl?.backgroundColor || '#ffffff';
  const borderStyle = lbl?.borderStyle || 'solid';
  const isA4 = sizeConfig.key === 'a4';

  // QR value: barcode > itemCode > name (always has something to encode)
  const qrValue = item?.barcode || item?.itemCode || item?.name || 'item';

  const codeEl = mode === 'qr' ? (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
      <QRImage value={qrValue} size={Math.round(qrSize)} />
      {show('showBarcodeNumber') && item?.barcode && (
        <p style={{ margin: '2px 0 0', fontSize: smallFontSize, color: lbl?.textColor || '#555', textAlign: 'center' }}>{item.barcode}</p>
      )}
    </div>
  ) : (
    (show('showBarcode') && item?.barcode) ? (
      <div style={{ flexShrink: 0, width: '100%' }}>
        <BarcodeImage value={item.barcode} height={barcodeHeight} fontSize={smallFontSize} barWidth={barWidth} />
        {show('showBarcodeNumber') && (
          <p style={{ margin: '0', fontSize: smallFontSize, color: lbl?.textColor || '#555', textAlign: 'center' }}>{item.barcode}</p>
        )}
      </div>
    ) : null
  );

  const isHorizontal = pos === 'left' || pos === 'right';
  const isMiddle = pos === 'middle';

  // "middle" = code centered vertically between top/bottom text blocks (column layout, code in center)
  const flexDir = isHorizontal ? 'row' : 'column';

  const outerStyle = {
    width, height: height || 'auto',
    padding: isA4 ? '20px 24px' : '3px 4px',
    fontFamily: 'Arial, sans-serif',
    overflow: fitContent ? 'visible' : 'hidden',
    display: 'inline-flex',
    flexDirection: flexDir,
    alignItems: 'center',
    justifyContent: isMiddle ? 'center' : 'center',
    gap: isHorizontal ? 4 : 1,
    boxSizing: 'border-box',
    backgroundColor: bgColor,
    border: isA4 ? 'none' : (borderStyle === 'none' ? 'none' : `0.5px ${borderStyle} #ccc`),
  };

  return (
    <div style={outerStyle}>
      {(pos === 'top' || pos === 'left') && codeEl}
      {isMiddle && <LabelContent item={item} lbl={lbl} fontSize={fontSize} smallFontSize={smallFontSize} align={align} />}
      {isMiddle && codeEl}
      {!isMiddle && <LabelContent item={item} lbl={lbl} fontSize={fontSize} smallFontSize={smallFontSize} align={align} />}
      {(pos === 'bottom' || pos === 'right') && codeEl}
    </div>
  );
};

const QRLabel = ({ item, sizeConfig, lbl }) => <UnifiedLabel item={item} sizeConfig={sizeConfig} lbl={lbl} mode="qr" />;
const BarcodeLabel = ({ item, sizeConfig, lbl }) => <UnifiedLabel item={item} sizeConfig={sizeConfig} lbl={lbl} mode="barcode" />;

const QRPrintSheet = React.forwardRef(({ item, copies, sizeConfig, lbl, columns = 1 }, ref) => {
  const isA4 = sizeConfig.key === 'a4';
  return (
    <div ref={ref} style={{
      padding: isA4 ? 16 : 4, backgroundColor: '#fff', fontFamily: 'Arial, sans-serif',
      display: 'grid',
      gridTemplateColumns: `repeat(${isA4 ? Math.max(1, columns) : columns}, ${sizeConfig.width})`,
      gap: isA4 ? 8 : 2,
      width: isA4 ? '210mm' : undefined,
    }}>
      {Array.from({ length: copies }).map((_, i) => (
        <QRLabel key={i} item={item} sizeConfig={sizeConfig} lbl={lbl} />
      ))}
    </div>
  );
});
QRPrintSheet.displayName = 'QRPrintSheet';

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
];

const PX_PER_MM = 3.7795;

// Derive all sizing from real mm dimensions.
// contentScale → text/font size only
// codeScale    → barcode strip height, QR square size, bar thickness only
export const buildSizeConfig = (entry, contentScale = 1.0, codeScale = 1.0) => {
  const wPx  = entry.widthMm  * PX_PER_MM;
  const hPx  = entry.heightMm ? entry.heightMm * PX_PER_MM : null;
  const isA4 = entry.key === 'a4';
  const pad  = isA4 ? 40 : 6;
  const innerW = wPx - pad * 2;
  const innerH = hPx ? hPx - pad * 2 : null;

  // Base font: ~4.5% of label width, minimum 7px — scaled by contentScale only
  const baseFontPx   = Math.max(7, innerW * 0.045) * contentScale;
  const smallFontPx  = baseFontPx * 0.82;
  // Barcode height — scaled by codeScale only
  const barcodeH     = isA4 ? 70 * codeScale
    : Math.max(12, (innerH ?? innerW * 0.45) * 0.45) * codeScale;
  // QR size — scaled by codeScale only
  const shortPx      = hPx ? Math.min(wPx, hPx) : wPx;
  const qrPx         = isA4 ? 110 * codeScale
    : Math.max(20, shortPx * 0.55) * codeScale;

  return {
    key:           entry.key,
    width:         `${entry.widthMm}mm`,
    height:        entry.heightMm ? `${entry.heightMm}mm` : null,
    widthPx:       wPx,
    heightPx:      hPx,
    barcodeHeight: barcodeH,
    qrSize:        qrPx,
    fontSize:      baseFontPx,
    smallFontSize: smallFontPx,
    barWidth:      Math.max(1, (innerW / 100) * codeScale), // bar thickness
  };
};


const BarcodePrintSheet = React.forwardRef(({ item, copies, sizeConfig, lbl, columns = 1 }, ref) => {
  const isA4 = sizeConfig.key === 'a4';
  return (
    <div ref={ref} style={{
      padding: isA4 ? 16 : 4, backgroundColor: '#fff', fontFamily: 'Arial, sans-serif',
      display: 'grid',
      gridTemplateColumns: `repeat(${isA4 ? Math.max(1, columns) : columns}, ${sizeConfig.width})`,
      gap: isA4 ? 8 : 2,
      width: isA4 ? '210mm' : undefined,
    }}>
      {Array.from({ length: copies }).map((_, i) => (
        <BarcodeLabel key={i} item={item} sizeConfig={sizeConfig} lbl={lbl} />
      ))}
    </div>
  );
});
BarcodePrintSheet.displayName = 'BarcodePrintSheet';

// Renders all selected items (each with individual copies) in one printable sheet
const BulkBarcodePrintSheet = React.forwardRef(({ entries, sizeConfig, lbl, columns = 1, mode = 'barcode' }, ref) => {
  const isA4 = sizeConfig.key === 'a4';
  const LabelComp = mode === 'qr' ? QRLabel : BarcodeLabel;
  return (
    <div ref={ref} style={{
      padding: isA4 ? 16 : 4, backgroundColor: '#fff', fontFamily: 'Arial, sans-serif',
      display: 'grid',
      gridTemplateColumns: `repeat(${isA4 ? Math.max(1, columns) : columns}, ${sizeConfig.width})`,
      gap: isA4 ? 8 : 2,
      width: isA4 ? '210mm' : undefined,
    }}>
      {entries.map(({ item, copies }) =>
        Array.from({ length: copies }).map((_, i) => (
          <LabelComp key={`${item.id}-${i}`} item={item} sizeConfig={sizeConfig} lbl={lbl} />
        ))
      )}
    </div>
  );
});
BulkBarcodePrintSheet.displayName = 'BulkBarcodePrintSheet';

export const CODE_POSITIONS = [
  { value: 'top',    label: 'Code on Top' },
  { value: 'middle', label: 'Code in Middle' },
  { value: 'bottom', label: 'Code on Bottom' },
  { value: 'left',   label: 'Code on Left' },
  { value: 'right',  label: 'Code on Right' },
];
export const CONTENT_ALIGNS = [
  { value: 'left',   label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right',  label: 'Right' },
];
export const BORDER_STYLES = [
  { value: 'solid',  label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'none',   label: 'None' },
];

// Bulk barcode/QR printing for several selected items at once. Layout
// (label size, colors, field order/style, and whether labels print as a
// Barcode or a QR code) is Settings-only (Settings → Barcode Label) — this
// dialog only offers Columns (shared) and per-item Copies, since those
// genuinely vary print-run to print-run.
const BulkBarcodeDialog = ({ items, onClose }) => {
  const { config, saveConfig } = useConfig();
  const { currentBusiness } = useBusiness();
  const baseLbl = config.barcodeLabel || {};
  const [columns, setColumns] = useState(baseLbl.columns || 1);
  const printMode = baseLbl.codeType === 'qr' ? 'qr' : 'barcode';
  // per-item copies: { [itemId]: number }
  const [copiesMap, setCopiesMap] = useState({});
  const fieldOrder = resolveFieldOrder(baseLbl);
  const printRef = useRef(null);

  const getCopies = (id) => copiesMap[id] ?? 1;
  // Store the raw typed value (allows clearing the field); clamp only when actually consumed.
  const setCopies = (id, val) => setCopiesMap(prev => ({ ...prev, [id]: val === '' ? '' : Math.max(1, Math.min(500, Number(val) || 1)) }));
  const commitCopies = (id) => setCopiesMap(prev => ({ ...prev, [id]: Math.max(1, Math.min(500, Number(prev[id]) || 1)) }));

  // Columns is the one shared field kept adjustable per print run (matches
  // how many labels the printer feeds side-by-side) — auto-saved as the new
  // default the same way it always was, everything else now lives in Settings.
  const bulkAutoSaveTimerRef = useRef(null);
  const bulkIsFirstRenderRef = useRef(true);
  useEffect(() => {
    if (bulkIsFirstRenderRef.current) { bulkIsFirstRenderRef.current = false; return; }
    clearTimeout(bulkAutoSaveTimerRef.current);
    bulkAutoSaveTimerRef.current = setTimeout(() => {
      saveConfig({ ...config, barcodeLabel: { ...config.barcodeLabel, columns: Math.max(1, Number(columns) || 1) } });
    }, 500);
    return () => clearTimeout(bulkAutoSaveTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns]);

  const labelSizeKey = baseLbl.defaultLabelSize || 'standard';
  const sizeEntry = LABEL_SIZES.find(s => s.key === labelSizeKey) || LABEL_SIZES[0];
  const sizeConfig = buildSizeConfig(sizeEntry, baseLbl.contentScale || 1.0, baseLbl.codeScale || 1.0);
  const lblWithOrder = { ...baseLbl, fieldOrder };
  const columnsNum = Math.max(1, Number(columns) || 1);

  const entries = items.map(item => ({
    item: { ...item, _businessName: currentBusiness?.name || '' },
    copies: Math.max(1, Number(getCopies(item.id)) || 1),
  }));

  const totalLabels = entries.reduce((s, e) => s + e.copies, 0);

  const getPageStyle = () => {
    const isA4 = sizeConfig.key === 'a4';
    if (isA4) return '@page { size: A4 portrait; margin: 8mm; }';
    const wMm = parseFloat(sizeConfig.width) || 80;
    const hMm = parseFloat(sizeConfig.height) || 40;
    return `@page { size: ${wMm * columnsNum}mm ${hMm}mm; margin: 0; } body { margin: 0; padding: 0; }`;
  };

  const handlePrint = useReactToPrint({ contentRef: printRef, pageStyle: getPageStyle() });

  if (!items?.length) return null;

  return (
    <Dialog open={!!items?.length} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
        {printMode === 'qr' ? <QrCode size={18} /> : <Barcode size={18} />}
        Print {printMode === 'qr' ? 'QR Codes' : 'Barcodes'} — {items.length} item{items.length > 1 ? 's' : ''} · {totalLabels} labels
      </DialogTitle>

      <DialogContent sx={{ pb: 1 }}>
        {/* Shared settings row */}
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 2, alignItems: 'center' }}>
          <TextField label="Columns" type="number" size="small" value={columns}
            onChange={e => { const v = e.target.value; setColumns(v === '' ? '' : Math.max(1, Math.min(8, Number(v) || 1))); }}
            onBlur={() => setColumns(c => Math.max(1, Math.min(8, Number(c) || 1)))}
            inputProps={{ min: 1, max: 8 }} sx={{ width: 80 }} helperText="Side-by-side" />
          <Typography variant="caption" sx={{ color: 'text.disabled' }}>
            Barcode/QR mode, label size &amp; layout are set in Settings → Barcode Label.
          </Typography>
        </Box>

        {/* Per-item rows */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {entries.map(({ item }) => {
            const copies = copiesMap[item.id] ?? 1;
            const previewCfg = { ...sizeConfig, width: 'auto', height: 'auto' };
            return (
              <Box key={item.id} sx={{
                display: 'flex', alignItems: 'center', gap: 2,
                p: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 2,
                bgcolor: 'background.paper',
              }}>
                {/* Mini label preview */}
                <Box sx={{ flexShrink: 0, border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 0.5, bgcolor: '#fafafa', display: { xs: 'none', sm: 'block' } }}>
                  {printMode === 'qr'
                    ? <QRLabel item={item} sizeConfig={{ ...previewCfg, fontSize: 8, smallFontSize: 6.5, qrSize: 36, barcodeHeight: 28, barWidth: 0.8 }} lbl={lblWithOrder} />
                    : <BarcodeLabel item={item} sizeConfig={{ ...previewCfg, fontSize: 8, smallFontSize: 6.5, qrSize: 36, barcodeHeight: 28, barWidth: 0.8 }} lbl={lblWithOrder} />
                  }
                </Box>
                {/* Item info */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.2 }} noWrap>{item.name}</Typography>
                  <Typography variant="caption" sx={{ color: 'text.disabled', fontFamily: 'monospace' }}>
                    {[item.itemCode, item.barcode && `Barcode: ${item.barcode}`].filter(Boolean).join(' · ')}
                  </Typography>
                </Box>
                {/* Copies field */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>Copies</Typography>
                  <TextField type="number" size="small" value={copies}
                    onChange={e => setCopies(item.id, e.target.value)}
                    onBlur={() => commitCopies(item.id)}
                    inputProps={{ min: 1, max: 500 }}
                    sx={{ width: 72, '& .MuiInputBase-input': { textAlign: 'center', fontWeight: 700 } }} />
                </Box>
              </Box>
            );
          })}
        </Box>

        <div style={{ display: 'none' }}>
          <BulkBarcodePrintSheet ref={printRef} entries={entries} sizeConfig={sizeConfig} lbl={lblWithOrder} columns={columnsNum} mode={printMode} />
        </div>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ fontWeight: 600 }}>Close</Button>
        <Button variant="contained" startIcon={<Printer size={16} />} onClick={handlePrint}
          sx={{ fontWeight: 700, textTransform: 'none', borderRadius: 2, background: '#5c1f22' }}>
          Print {totalLabels} Label{totalLabels !== 1 ? 's' : ''}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// Barcode/QR label printing for a single item. Layout — including whether
// labels print as a Barcode or a QR code — is now Settings-only (Settings →
// Barcode Label) so every print — from Items, bulk print, anywhere — always
// uses one consistent saved mode/layout instead of drifting per print run.
// Only Copies/Columns stay adjustable here since those genuinely vary
// print-to-print (50 labels today, 5 tomorrow).
const BarcodeDialog = ({ item, onClose }) => {
  const { config } = useConfig();
  const { currentBusiness } = useBusiness();
  const baseLbl = config.barcodeLabel || {};
  const [copies, setCopies] = useState(baseLbl.copies || 1);
  const [columns, setColumns] = useState(baseLbl.columns || 1);
  const printMode = baseLbl.codeType === 'qr' ? 'qr' : 'barcode';
  const barcodePrintRef = useRef(null);
  const qrPrintRef = useRef(null);

  const labelSizeKey = baseLbl.defaultLabelSize || 'standard';
  const sizeEntry = LABEL_SIZES.find(s => s.key === labelSizeKey) || LABEL_SIZES[0];
  const sizeConfig = buildSizeConfig(sizeEntry, baseLbl.contentScale || 1.0, baseLbl.codeScale || 1.0);
  const fieldOrder = resolveFieldOrder(baseLbl);
  const lblWithOrder = { ...baseLbl, fieldOrder };

  // Build @page CSS so printer uses exact label dimensions.
  // Always specify explicit W×H in mm — this tells the driver the page is already
  // sized correctly and suppresses any auto-rotation the print spooler might apply.
  // We intentionally do NOT add "landscape"/"portrait" keywords because those can
  // trigger the browser to swap the dimensions; passing raw mm is more reliable.
  const getPageStyle = () => {
    const isA4 = sizeConfig.key === 'a4';
    if (isA4) return '@page { size: A4 portrait; margin: 8mm; }';
    const wMm = parseFloat(sizeConfig.width) || 80;
    const hMm = parseFloat(sizeConfig.height) || 40;
    const totalW = wMm * (Math.max(1, Number(columns) || 1));
    // Feed direction on label printers (e.g. TVS LP46) is always along the longer
    // edge. Passing W×H as-is keeps content upright without driver rotation.
    return `@page { size: ${totalW}mm ${hMm}mm; margin: 0; } body { margin: 0; padding: 0; }`;
  };

  const handleBarcodePrint = useReactToPrint({ contentRef: barcodePrintRef, pageStyle: getPageStyle() });
  const handleQrPrint = useReactToPrint({ contentRef: qrPrintRef, pageStyle: getPageStyle() });

  if (!item) return null;

  const itemWithBiz = { ...item, _businessName: currentBusiness?.name || '' };
  const previewSizeConfig = { ...sizeConfig, width: 'auto', height: 'auto' };

  return (
    <Dialog open={!!item} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
        {printMode === 'qr' ? <QrCode size={18} /> : <Barcode size={18} />}
        {printMode === 'qr' ? 'QR Code Label' : 'Barcode Label'}
      </DialogTitle>

      <DialogContent sx={{ pb: 1 }}>
        {/* Live preview — uses the saved Settings layout (incl. Barcode/QR
            mode), not editable here */}
        <Box sx={{ textAlign: 'center', mb: 2 }}>
          <Typography variant="caption" sx={{ color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.07em', fontSize: '0.6rem', display: 'block', mb: 1 }}>Preview</Typography>
          {(item.barcode || printMode === 'qr') ? (
            <Box sx={{ display: 'inline-block', border: '1px solid', borderColor: 'divider', borderRadius: 1.5, p: 1.5, bgcolor: '#f8f8f8' }}>
              {printMode === 'qr'
                ? <QRLabel item={itemWithBiz} sizeConfig={previewSizeConfig} lbl={lblWithOrder} />
                : <BarcodeLabel item={itemWithBiz} sizeConfig={previewSizeConfig} lbl={lblWithOrder} />
              }
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">No barcode value assigned to this item. Set Settings → Barcode Label to QR mode to print without a barcode.</Typography>
          )}
        </Box>

        {(item.barcode || printMode === 'qr') && (
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <TextField label="Columns" type="number" size="small" value={columns}
              onChange={e => { const v = e.target.value; setColumns(v === '' ? '' : Math.max(1, Math.min(8, Number(v) || 1))); }}
              onBlur={() => setColumns(c => Math.max(1, Math.min(8, Number(c) || 1)))}
              inputProps={{ min: 1, max: 8 }} sx={{ flex: 1 }}
              helperText="Side-by-side" />
            <TextField label="Copies" type="number" size="small" value={copies}
              onChange={e => { const v = e.target.value; setCopies(v === '' ? '' : Math.max(1, Math.min(500, Number(v) || 1))); }}
              onBlur={() => setCopies(c => Math.max(1, Math.min(500, Number(c) || 1)))}
              inputProps={{ min: 1, max: 500 }} sx={{ flex: 1 }} />
          </Box>
        )}
        <Typography variant="caption" sx={{ mt: 1.5, display: 'block', textAlign: 'center', color: 'text.disabled' }}>
          Barcode/QR mode, label size, colors and field layout are set in Settings → Barcode Label.
        </Typography>

        <div style={{ display: 'none' }}>
          <BarcodePrintSheet ref={barcodePrintRef} item={itemWithBiz} copies={Math.max(1, Number(copies) || 1)} sizeConfig={sizeConfig} lbl={lblWithOrder} columns={Math.max(1, Number(columns) || 1)} />
          <QRPrintSheet ref={qrPrintRef} item={itemWithBiz} copies={Math.max(1, Number(copies) || 1)} sizeConfig={sizeConfig} lbl={lblWithOrder} columns={Math.max(1, Number(columns) || 1)} />
        </div>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ fontWeight: 600 }}>Close</Button>
        {(item.barcode || printMode === 'qr') && (
          <Button variant="contained" startIcon={<Printer size={16} />}
            onClick={() => printMode === 'qr' ? handleQrPrint() : handleBarcodePrint()}
            sx={{ fontWeight: 700, textTransform: 'none', borderRadius: 2, background: '#5c1f22' }}>
            Print{(Number(copies) || 1) > 1 || (Number(columns) || 1) > 1 ? ` (${Number(copies) || 1} × ${Number(columns) || 1} col)` : ''}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

// Shown in the item detail panel (desktop + mobile) — top 5 customers who
// bought this item, by quantity. `customers` is the already-computed,
// already-sorted list (see getTopCustomersForItem in ItemsPage) so this
// component does no aggregation of its own, just renders it.
const TopCustomersForItem = ({ customers, primary }) => {
  if (!customers.length) {
    return (
      <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5 }}>
        No sales yet for this item.
      </Typography>
    );
  }
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      {customers.map((c) => (
        <Box key={c.partyId} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
            <Avatar sx={{ width: 22, height: 22, fontSize: '0.65rem', fontWeight: 700, bgcolor: alpha(primary, 0.12), color: primary }}>
              {c.partyName.charAt(0).toUpperCase()}
            </Avatar>
            <Typography variant="body2" noWrap sx={{ fontWeight: 600, fontSize: '0.8rem' }}>{c.partyName}</Typography>
          </Box>
          <Chip label={`${c.qty} ${c.qty === 1 ? 'unit' : 'units'}`} size="small"
            sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700, flexShrink: 0, bgcolor: alpha(primary, 0.08), color: 'primary.main' }} />
        </Box>
      ))}
    </Box>
  );
};

const ItemsPage = () => {
  const { currentBusiness } = useBusiness();
  const { addItem, addItems, updateItem, deleteItem, getItems, data } = useData();
  const { config } = useConfig();
  const { confirm } = useDialog();
  const { t } = useI18n();
  const { staffSession } = useAuth();
  // TallyKraft billing: writes are also blocked at the data layer when the
  // business subscription is inactive; this just greys the primary CTA.
  const { isBusinessActive } = useSubscription();
  const canWrite = isBusinessActive(currentBusiness?.id);
  const canViewPurchasePrice = !staffSession || staffSession.role === 'admin' || !!staffSession.features?.viewPurchasePrice;
  const barcodeEnabled = !!config.features?.barcode;
  const UNITES = [...new Set([...DEFAULT_UNITS, ...(config.itemUnits || [])])];
  const defaultUnit = config.defaultItemUnit && UNITES.includes(config.defaultItemUnit)
    ? config.defaultItemUnit
    : (config.defaultItemUnit || UNITES[0] || 'NOS');

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const primary = theme.palette.primary.main;
  const primaryDark = theme.palette.primary.dark || primary;
  const baseRadius = Number(theme.shape?.borderRadius) || 8;
  const fieldSx = { '& .MuiOutlinedInput-root': { borderRadius: `${baseRadius + 2}px` } };
  // Bounds the item grid to the remaining viewport so pagination stays
  // visible with no extra outer-page scroll — same fix applied to Sales/etc.
  const gridContainerRef = useRef(null);
  const gridFillHeight = useFillHeight(gridContainerRef, { bottomGap: 16, fallbackPx: 500 });

  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [moreMenuAnchor, setMoreMenuAnchor] = useState(null);
  const [barcodeItem, setBarcodeItem] = useState(null);
  const [barcodePrintMode, setBarcodePrintMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [bulkBarcodeOpen, setBulkBarcodeOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [itemFilters, setItemFilters] = useState({ category: '', stockStatus: 'all', taxRate: 'all', minPrice: '', maxPrice: '', sortBy: 'name', sortOrder: 'asc' });
  const [page, setPage] = useState(1);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'error' });
  const [catManagerOpen, setCatManagerOpen] = useState(false);
  const [catManagerInput, setCatManagerInput] = useState('');
  const [customItemCats, setCustomItemCats] = useState([]);

  useEffect(() => {
    if (!currentBusiness?.id) return;
    setCustomItemCats(loadCustomItemCategories(currentBusiness.id, 'product'));
  }, [currentBusiness?.id]);

  const allItemCategories = [...BUILTIN_PRODUCT_CATEGORIES, ...customItemCats.filter(c => !BUILTIN_PRODUCT_CATEGORIES.includes(c))];

  const handleCatManagerAdd = () => {
    const name = catManagerInput.trim();
    if (!name || !currentBusiness?.id) return;
    if (allItemCategories.some(c => c.toLowerCase() === name.toLowerCase())) { setCatManagerInput(''); return; }
    const updated = [...customItemCats, name];
    setCustomItemCats(updated);
    saveCustomItemCategories(currentBusiness.id, 'product', updated);
    setCatManagerInput('');
  };

  const handleCatManagerDelete = (cat) => {
    if (!currentBusiness?.id) return;
    const updated = customItemCats.filter(c => c !== cat);
    setCustomItemCats(updated);
    saveCustomItemCategories(currentBusiness.id, 'product', updated);
  };

  // Memoized: with thousands of items, re-running filter/sort on every render
  // (tab switches, unrelated state changes) caused visible navigation lag.
  const items = useMemo(
    () => getItems('items').filter(item => item.businessId === currentBusiness?.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.items, currentBusiness?.id]
  );
  const vendors = useMemo(
    () => getItems('parties').filter(p => p.businessId === currentBusiness?.id && (p.type === 'Vendor' || p.type === 'Both')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.parties, currentBusiness?.id]
  );
  const totalStockValue = useMemo(
    () => items.reduce((s, i) => s + (i.stock || 0) * (i.salePrice || 0), 0),
    [items]
  );
  const lowStockItems = useMemo(
    () => items.filter(i => (i.stock || 0) <= (i.minStock ?? 5)).length,
    [items]
  );

  // Top-customers-per-item lookup — built once as a Map keyed by itemId,
  // scanning the full sales table a single time rather than re-scanning on
  // every item click. Depends on the raw `data.sales` array reference (not
  // `getItems`, whose identity churns on every unrelated table mutation —
  // see the 2026-07-23 changelog entry for the same fix applied to
  // Sales.jsx/Reports.jsx/Dashboard.jsx) so this only recomputes when the
  // sales table itself actually changes.
  const topCustomersByItemId = useMemo(() => {
    const map = new Map();
    const salesTable = getItems('sales').filter(s => s.businessId === currentBusiness?.id);
    for (const sale of salesTable) {
      if (!sale.partyId) continue; // Cash & Carry — no customer to attribute
      const seenItemsInThisSale = new Set();
      for (const line of sale.items || []) {
        const key = line.itemId;
        if (!key) continue;
        if (!map.has(key)) map.set(key, new Map());
        const perCustomer = map.get(key);
        if (!perCustomer.has(sale.partyId)) {
          perCustomer.set(sale.partyId, { partyId: sale.partyId, partyName: sale.partyName || 'Unknown', qty: 0, orders: 0, amount: 0 });
        }
        const entry = perCustomer.get(sale.partyId);
        entry.qty += Number(line.qty) || 0;
        entry.amount += Number(line.total) || (Number(line.qty) || 0) * (Number(line.price) || 0);
        if (!seenItemsInThisSale.has(key)) { seenItemsInThisSale.add(key); entry.orders += 1; }
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.sales, currentBusiness?.id]);

  // Returns the top N customers for a given item, sorted by qty bought —
  // O(1) map lookup + a small sort over just that item's own customers,
  // never a re-scan of the sales table.
  const getTopCustomersForItem = (itemId, limit = 5) => {
    const perCustomer = topCustomersByItemId.get(itemId);
    if (!perCustomer) return [];
    return Array.from(perCustomer.values()).sort((a, b) => b.qty - a.qty).slice(0, limit);
  };

  const filteredItems = useMemo(() => items.filter(item => {
    if (typeFilter !== 'all') {
      const t = (item.itemType || 'product').toLowerCase();
      if (t !== typeFilter) return false;
    }
    if (itemFilters.category && item.category !== itemFilters.category) return false;
    if (itemFilters.taxRate !== 'all' && String(item.taxRate || 0) !== itemFilters.taxRate) return false;
    if (itemFilters.stockStatus !== 'all') {
      const stock = item.stock || 0;
      const threshold = item.minStock != null && item.minStock !== '' ? Number(item.minStock) : 5;
      if (itemFilters.stockStatus === 'instock' && stock <= threshold) return false;
      if (itemFilters.stockStatus === 'low' && (stock === 0 || stock > threshold)) return false;
      if (itemFilters.stockStatus === 'out' && stock > 0) return false;
    }
    if (itemFilters.minPrice !== '' && (item.salePrice || 0) < Number(itemFilters.minPrice)) return false;
    if (itemFilters.maxPrice !== '' && (item.salePrice || 0) > Number(itemFilters.maxPrice)) return false;
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return item.name?.toLowerCase().includes(s) ||
      item.itemCode?.toLowerCase().includes(s) ||
      item.hsnCode?.toLowerCase().includes(s) ||
      item.barcode?.toLowerCase().includes(s) ||
      item.category?.toLowerCase().includes(s) ||
      item.color?.toLowerCase().includes(s) ||
      item.size?.toLowerCase().includes(s) ||
      item.description?.toLowerCase().includes(s);
  }).sort((a, b) => {
    let av, bv;
    if (itemFilters.sortBy === 'price') { av = a.salePrice || 0; bv = b.salePrice || 0; }
    else if (itemFilters.sortBy === 'stock') { av = a.stock || 0; bv = b.stock || 0; }
    else { av = (a.name || '').toLowerCase(); bv = (b.name || '').toLowerCase(); }
    return itemFilters.sortOrder === 'desc' ? (av < bv ? 1 : -1) : (av > bv ? 1 : -1);
  }), [items, typeFilter, itemFilters, search]);

  const hasActiveFilters = itemFilters.category || itemFilters.stockStatus !== 'all' || itemFilters.taxRate !== 'all' || itemFilters.minPrice !== '' || itemFilters.maxPrice !== '' || itemFilters.sortBy !== 'name' || itemFilters.sortOrder !== 'asc';
  const totalPages = Math.ceil(filteredItems.length / ROWS_PER_PAGE);
  const paginatedItems = filteredItems.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);

  const handleOpen = (item = null) => {
    setEditingItem(item || null);
    setOpen(true);
  };

  const handleClose = () => { setOpen(false); setEditingItem(null); };
  const showSnackbar = (message, severity = 'error') => setSnackbar({ open: true, message, severity });

  const handleDelete = async (id) => {
    const ok = await confirm({ title: 'Delete Item', message: 'This item will be permanently deleted. This cannot be undone.', confirmLabel: 'Delete', variant: 'danger' });
    if (ok) deleteItem('items', id);
  };

  const getStockMeta = (item) => {
    const n = item.stock || 0;
    const threshold = item.minStock != null && item.minStock !== '' ? Number(item.minStock) : 5;
    if (n > threshold) return { color: '#16a34a', bg: alpha('#16a34a', 0.08), border: alpha('#16a34a', 0.2), label: t('items.inStock') };
    if (n > 0)         return { color: '#d97706', bg: alpha('#d97706', 0.08), border: alpha('#d97706', 0.2), label: t('items.lowStock') };
    return               { color: '#dc2626', bg: alpha('#dc2626', 0.08), border: alpha('#dc2626', 0.2), label: t('items.outOfStock') };
  };

  return (
    <Box sx={{ mx: 0 }}>

      {/* ── Hero Header ── */}
      <Box sx={{
        borderRadius: 3,
        background: '#ffffff', border: '1px solid #ece2db',
        p: { xs: 2.5, md: 3.5 }, mb: 3,
        position: 'relative', overflow: 'hidden',
      }}>
        <Box sx={{ position: 'absolute', top: -50, right: -50, width: 220, height: 220, borderRadius: '50%', bgcolor: 'transparent', pointerEvents: 'none' }} />
        <Box sx={{ position: 'absolute', bottom: -40, right: 120, width: 160, height: 160, borderRadius: '50%', bgcolor: 'transparent', pointerEvents: 'none' }} />

        {/* Title row */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2.5, position: 'relative' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: 'rgba(92,31,34,0.08)', display: 'flex' }}>
              <Package size={20} color="#5c1f22" />
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 800, color: '#5c1f22', letterSpacing: '-0.01em' }}>
                Items & Inventory
              </Typography>
              <Typography variant="body2" sx={{ color: '#6b5550', pl: 0.5 }}>Manage your products and services</Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, flexShrink: 0, alignItems: 'center' }}>
            <Tooltip title="More options">
              <IconButton size="small" onClick={(e) => setMoreMenuAnchor(e.currentTarget)}
                sx={{ color: '#5c1f22', bgcolor: 'rgba(92,31,34,0.08)', border: '1px solid #ece2db', borderRadius: 1.5, '&:hover': { bgcolor: '#9c8a84' } }}>
                <MoreHorizontal size={18} />
              </IconButton>
            </Tooltip>
            <Menu anchorEl={moreMenuAnchor} open={Boolean(moreMenuAnchor)} onClose={() => setMoreMenuAnchor(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
              <MenuItem onClick={() => { setImportOpen(true); setMoreMenuAnchor(null); }} sx={{ gap: 1.5 }}>
                <Upload size={16} /> Import
              </MenuItem>
              <MenuItem onClick={() => { exportToExcel(items, ITEM_COLUMNS, 'items_export.xlsx'); setMoreMenuAnchor(null); }} sx={{ gap: 1.5 }}>
                <Download size={16} /> Export
              </MenuItem>
              <MenuItem onClick={() => { setBulkAddOpen(true); setMoreMenuAnchor(null); }} sx={{ gap: 1.5 }}>
                <LayoutList size={16} /> Bulk Add
              </MenuItem>
              <MenuItem onClick={() => { setBulkEditOpen(true); setMoreMenuAnchor(null); }} sx={{ gap: 1.5 }}>
                <CheckSquare size={16} /> Bulk Edit
              </MenuItem>
              <Divider sx={{ my: 0.5 }} />
              <MenuItem onClick={() => { setCatManagerOpen(true); setMoreMenuAnchor(null); }} sx={{ gap: 1.5 }}>
                <FolderOpen size={16} /> Categories
              </MenuItem>
            </Menu>
            {barcodeEnabled && (
              <Button variant={barcodePrintMode ? 'contained' : 'outlined'} size="small" startIcon={<Printer size={15} />}
                onClick={() => { setBarcodePrintMode(v => !v); setCheckedIds(new Set()); }}
                sx={barcodePrintMode
                  ? { bgcolor: '#5c1f22', color: '#ffffff', fontWeight: 700, borderRadius: 2, textTransform: 'none', whiteSpace: 'nowrap', '&:hover': { bgcolor: '#3f1417' } }
                  : { color: '#5c1f22', borderColor: '#ece2db', fontWeight: 700, borderRadius: 2, textTransform: 'none', whiteSpace: 'nowrap', '&:hover': { bgcolor: 'rgba(92,31,34,0.08)' } }
                }>
                {barcodePrintMode ? 'Cancel' : 'Print Labels'}
              </Button>
            )}
            <Button variant="contained" size="small" disabled={!canWrite} startIcon={<Plus size={16} />} onClick={() => handleOpen()}
              sx={{ bgcolor: '#5c1f22', color: '#ffffff', fontWeight: 700, borderRadius: 2, textTransform: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.25)', '&:hover': { bgcolor: '#3f1417' }, whiteSpace: 'nowrap' }}>
              {isMobile ? t('common.add') : t('items.addItem')}
            </Button>
          </Box>
        </Box>

        {/* Stats row */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5, position: 'relative' }}>
          {[
            { label: t('items.totalItems'), value: items.length, icon: Package, color: '#6b5550' },
            { label: t('items.stockValue'), value: `₹${totalStockValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, icon: TrendingUp, color: '#16a34a' },
            { label: t('items.lowNoStock'), value: lowStockItems, icon: AlertTriangle, color: lowStockItems > 0 ? '#fca5a5' : '#86efac' },
          ].map(({ label, value, icon: Icon, color }) => (
            <Box key={label} sx={{
              bgcolor: 'rgba(92,31,34,0.05)', borderRadius: 2, p: 1.5,
              border: '1px solid #ece2db',
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                <Icon size={14} color={color} />
                <Typography variant="caption" sx={{ color: '#6b5550', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {label}
                </Typography>
              </Box>
              <Typography sx={{ color: '#5c1f22', fontWeight: 800, lineHeight: 1.1, fontSize: { xs: '0.95rem', sm: '1.1rem' } }}>
                {value}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>

      {/* ── Search + Filters row ── */}
      <Box sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
        <TextField
          size="small"
          placeholder="Search by name, code, HSN…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          InputProps={{
            startAdornment: <InputAdornment position="start"><Search size={16} color={theme.palette.text.disabled} /></InputAdornment>,
            endAdornment: search ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => { setSearch(''); setPage(1); }}>
                  <CloseIcon size={15} />
                </IconButton>
              </InputAdornment>
            ) : null,
          }}
          sx={{ flex: 1, minWidth: 0, '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: 'background.paper' } }}
        />
        <Button
          onClick={() => setShowFilters(v => !v)}
          variant={showFilters ? 'contained' : 'outlined'}
          size="small"
          startIcon={<Filter size={14} />}
          sx={{ fontWeight: 600, textTransform: 'none', borderRadius: 1.5, flexShrink: 0 }}
        >
          {showFilters ? 'Hide' : 'Filters'}
        </Button>
        {hasActiveFilters && (
          <Button
            onClick={() => { setItemFilters({ category: '', stockStatus: 'all', taxRate: 'all', minPrice: '', maxPrice: '', sortBy: 'name', sortOrder: 'asc' }); setPage(1); }}
            variant="text" size="small" color="error"
            sx={{ fontWeight: 600, textTransform: 'none', flexShrink: 0 }}
          >
            Clear
          </Button>
        )}
      </Box>

      {/* ── Barcode print selection bar ── */}
      {barcodePrintMode && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5, p: 1.25, bgcolor: alpha('#5c1f22', 0.07), border: '1.5px solid', borderColor: alpha('#5c1f22', 0.3), borderRadius: 2 }}>
          <Printer size={16} color="#5c1f22" />
          <Typography variant="body2" sx={{ fontWeight: 700, color: '#5c1f22', flex: 1 }}>
            {checkedIds.size === 0 ? 'Click items to select for printing' : `${checkedIds.size} item${checkedIds.size > 1 ? 's' : ''} selected`}
          </Typography>
          {checkedIds.size > 0 && (
            <>
              <Button size="small" variant="text" onClick={() => setCheckedIds(new Set())}
                sx={{ fontWeight: 600, textTransform: 'none', color: 'text.secondary', flexShrink: 0 }}>
                Clear
              </Button>
              <Button size="small" variant="text"
                onClick={() => setCheckedIds(new Set(filteredItems.map(i => i.id)))}
                sx={{ fontWeight: 600, textTransform: 'none', color: '#5c1f22', flexShrink: 0 }}>
                Select All ({filteredItems.length})
              </Button>
              <Button size="small" variant="contained" startIcon={<Printer size={14} />}
                onClick={() => setBulkBarcodeOpen(true)}
                sx={{ fontWeight: 700, textTransform: 'none', borderRadius: 1.5, flexShrink: 0, bgcolor: '#5c1f22', '&:hover': { bgcolor: '#3f1417' } }}>
                Print Labels ({checkedIds.size})
              </Button>
            </>
          )}
          {checkedIds.size === 0 && (
            <Button size="small" variant="text"
              onClick={() => setCheckedIds(new Set(filteredItems.map(i => i.id)))}
              sx={{ fontWeight: 600, textTransform: 'none', color: '#5c1f22', flexShrink: 0 }}>
              Select All ({filteredItems.length})
            </Button>
          )}
        </Box>
      )}

      {/* ── Type filter pills row ── */}
      <Box sx={{ display: 'flex', gap: 0.4, mb: hasActiveFilters || showFilters ? 1.5 : 2, p: 0.35, bgcolor: 'action.hover', borderRadius: 2, border: '1px solid', borderColor: 'divider', width: 'fit-content' }}>
        {[
          { value: 'all', label: 'All' },
          { value: 'product', label: isMobile ? 'Products' : 'Products' },
          { value: 'service', label: 'Services' },
          { value: 'membership', label: isMobile ? 'Members' : 'Memberships' },
        ].map(opt => {
          const active = typeFilter === opt.value;
          return (
            <Box
              key={opt.value}
              onClick={() => { setTypeFilter(opt.value); setPage(1); }}
              sx={{
                px: { xs: 1, sm: 1.25 }, py: 0.5, borderRadius: 1.5, cursor: 'pointer', userSelect: 'none',
                fontSize: { xs: '0.68rem', sm: '0.72rem' }, fontWeight: 700, whiteSpace: 'nowrap', transition: 'all 0.12s',
                bgcolor: active ? 'background.paper' : 'transparent',
                color: active ? primary : 'text.secondary',
                boxShadow: active ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                border: '1px solid',
                borderColor: active ? alpha(primary, 0.25) : 'transparent',
              }}
            >
              {opt.label}
            </Box>
          );
        })}
      </Box>

      {/* ── Filter panel ── */}
      {showFilters && (
        <Box sx={{ mb: 2.5, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField select fullWidth label="Category" size="small" value={itemFilters.category}
                onChange={e => { setItemFilters(f => ({ ...f, category: e.target.value })); setPage(1); }}>
                <MenuItem value="">All Categories</MenuItem>
                {allItemCategories.map(cat => <MenuItem key={cat} value={cat}>{cat}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField select fullWidth label="Stock Status" size="small" value={itemFilters.stockStatus}
                onChange={e => { setItemFilters(f => ({ ...f, stockStatus: e.target.value })); setPage(1); }}>
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="instock">In Stock</MenuItem>
                <MenuItem value="low">Low Stock</MenuItem>
                <MenuItem value="out">Out of Stock</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField select fullWidth label="GST Rate" size="small" value={itemFilters.taxRate}
                onChange={e => { setItemFilters(f => ({ ...f, taxRate: e.target.value })); setPage(1); }}>
                <MenuItem value="all">All Rates</MenuItem>
                {[0, 5, 12, 18, 28].map(r => <MenuItem key={r} value={String(r)}>{r}% GST</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField select fullWidth label="Sort By" size="small" value={itemFilters.sortBy}
                onChange={e => { setItemFilters(f => ({ ...f, sortBy: e.target.value })); setPage(1); }}>
                <MenuItem value="name">Name</MenuItem>
                <MenuItem value="price">Sale Price</MenuItem>
                <MenuItem value="stock">Stock</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField select fullWidth label="Sort Order" size="small" value={itemFilters.sortOrder}
                onChange={e => { setItemFilters(f => ({ ...f, sortOrder: e.target.value })); setPage(1); }}>
                <MenuItem value="asc">Ascending</MenuItem>
                <MenuItem value="desc">Descending</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 6, sm: 3, md: 2 }}>
              <TextField fullWidth label="Min Price" type="number" size="small" value={itemFilters.minPrice}
                onChange={e => { setItemFilters(f => ({ ...f, minPrice: e.target.value })); setPage(1); }}
                InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3, md: 2 }}>
              <TextField fullWidth label="Max Price" type="number" size="small" value={itemFilters.maxPrice}
                onChange={e => { setItemFilters(f => ({ ...f, maxPrice: e.target.value })); setPage(1); }}
                InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} />
            </Grid>
          </Grid>
        </Box>
      )}

      {/* ── Results summary (only when searching) ── */}
      {search && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
            {filteredItems.length} result{filteredItems.length !== 1 ? 's' : ''} for &ldquo;{search}&rdquo;
          </Typography>
          {totalPages > 1 && (
            <Typography variant="caption" color="text.disabled">Page {page} of {totalPages}</Typography>
          )}
        </Box>
      )}

      {/* ── Item Grid + Detail Panel ── */}
      <Box ref={gridContainerRef} sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
      {filteredItems.length === 0 ? (
        <Box sx={{ py: 12, textAlign: 'center', flex: 1 }}>
          <Box sx={{ display: 'inline-flex', p: 2.5, borderRadius: '50%', bgcolor: alpha(primary, 0.06), mb: 2 }}>
            <Package size={40} strokeWidth={1.5} color={alpha(primary, 0.4)} />
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.secondary', mb: 0.5 }}>
            {search ? t('items.noMatch') : t('items.noItemsYet')}
          </Typography>
          <Typography variant="body2" color="text.disabled" sx={{ mb: 3 }}>
            {search ? 'Try a different search term' : 'Add your first product to start tracking inventory'}
          </Typography>
          {!search && (
            <Button variant="contained" disabled={!canWrite} startIcon={<Plus size={16} />} onClick={() => handleOpen()}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700, background: `linear-gradient(135deg, ${primary} 0%, ${primaryDark} 100%)` }}>
              Add First Item
            </Button>
          )}
        </Box>
      ) : (
        <>
          <Box sx={{ flex: 1, minWidth: 0, height: `${gridFillHeight}px`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fill, minmax(260px, 1fr))' }, gap: { xs: 1.25, sm: 2 }, mb: 3 }}>
            {paginatedItems.map((item) => {
              const stock = item.stock || 0;
              const sm = getStockMeta(item);
              const isSelected = selectedItem?.id === item.id;
              const isChecked = checkedIds.has(item.id);
              const margin = item.salePrice && item.purchasePrice && canViewPurchasePrice
                ? Math.round(((item.salePrice - item.purchasePrice) / item.salePrice) * 100)
                : null;

              const handleCardClick = () => {
                if (barcodePrintMode) {
                  setCheckedIds(prev => {
                    const next = new Set(prev);
                    if (next.has(item.id)) next.delete(item.id);
                    else next.add(item.id);
                    return next;
                  });
                } else {
                  setSelectedItem(prev => prev?.id === item.id ? null : item);
                }
              };

              return (
                <Card key={item.id} elevation={0} onClick={handleCardClick} sx={{
                  border: '1.5px solid',
                  borderColor: barcodePrintMode ? (isChecked ? '#5c1f22' : 'divider') : (isSelected ? primary : 'divider'),
                  borderRadius: 2.5, overflow: 'hidden', position: 'relative', cursor: 'pointer',
                  transition: 'box-shadow 0.2s ease, transform 0.2s ease, border-color 0.15s',
                  bgcolor: barcodePrintMode ? (isChecked ? alpha('#5c1f22', 0.05) : 'background.paper') : (isSelected ? alpha(primary, 0.03) : 'background.paper'),
                  '&:hover': { boxShadow: '0 6px 24px rgba(0,0,0,0.09)', transform: 'translateY(-2px)' },
                }}>
                  {/* Checkbox overlay in print-select mode */}
                  {barcodePrintMode && (
                    <Box sx={{ position: 'absolute', top: 6, right: 6, zIndex: 2 }} onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={isChecked}
                        onChange={handleCardClick}
                        size="small"
                        sx={{ p: 0.25, color: '#5c1f22', '&.Mui-checked': { color: '#5c1f22' } }}
                      />
                    </Box>
                  )}
                  {/* Stock status stripe */}
                  <Box sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, bgcolor: sm.color }} />

                  <CardContent sx={{ pl: { xs: 2, sm: 2.5 }, pr: { xs: 1.5, sm: 2 }, pt: { xs: 1.5, sm: 2 }, pb: '16px !important' }}>
                    {/* Name + actions */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.3, mb: 0.2 }} noWrap>
                          {item.name}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.disabled', fontFamily: 'monospace', fontSize: '0.7rem' }}>
                          {[item.itemCode, item.unit, item.hsnCode && `HSN: ${item.hsnCode}`].filter(Boolean).join(' · ') || item.unit || ''}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.25, flexShrink: 0, ml: 0.5 }} onClick={e => e.stopPropagation()}>
                        {barcodeEnabled && (
                          <Tooltip title="View barcode">
                            <IconButton size="small" onClick={() => setBarcodeItem(item)}
                              sx={{ color: 'text.disabled', '&:hover': { color: 'primary.main', bgcolor: alpha(primary, 0.08) } }}>
                              <Barcode size={14} />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="Edit item">
                          <IconButton size="small" onClick={() => handleOpen(item)}
                            sx={{ color: 'text.disabled', '&:hover': { color: 'primary.main', bgcolor: alpha(primary, 0.08) } }}>
                            <Edit2 size={14} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete item">
                          <IconButton size="small" onClick={() => handleDelete(item.id)}
                            sx={{ color: 'text.disabled', '&:hover': { color: 'error.main', bgcolor: alpha('#dc2626', 0.08) } }}>
                            <Trash2 size={14} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </Box>

                    {/* Attribute chips: category / color / size */}
                    {(item.category || item.color || item.size) && (
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 0.75 }}>
                        {item.category && (
                          <Chip label={item.category} size="small" sx={{ height: 18, fontSize: '0.62rem', fontWeight: 600, bgcolor: alpha('#111111', 0.08), color: '#5c1f22' }} />
                        )}
                        {item.color && (
                          <Chip
                            icon={<Palette size={10} />}
                            label={item.color} size="small"
                            sx={{ height: 18, fontSize: '0.62rem', fontWeight: 600, bgcolor: alpha('#71717a', 0.08), color: '#5c1f22', '& .MuiChip-icon': { color: '#5c1f22', ml: '4px' } }}
                          />
                        )}
                        {item.size && (
                          <Chip
                            icon={<Ruler size={10} />}
                            label={item.size} size="small"
                            sx={{ height: 18, fontSize: '0.62rem', fontWeight: 600, bgcolor: alpha('#5c1f22', 0.08), color: '#5c1f22', '& .MuiChip-icon': { color: '#5c1f22', ml: '4px' } }}
                          />
                        )}
                      </Box>
                    )}

                    {/* Description */}
                    {item.description && (
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem', lineHeight: 1.4, mb: 0.75, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {item.description}
                      </Typography>
                    )}

                    {/* Divider */}
                    <Divider sx={{ my: 1 }} />

                    {/* Pricing row — stacks on mobile so prices and chips
                        don't squeeze into one cramped horizontal line */}
                    <Box sx={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'flex-end', gap: isMobile ? 0.75 : 2, mb: 1.25 }}>
                      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 2 }}>
                        <Box>
                          <Typography sx={{ fontSize: '0.62rem', color: 'text.disabled', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1, mb: 0.25 }}>
                            Sale Price
                          </Typography>
                          <Typography sx={{ fontSize: '1.05rem', fontWeight: 800, color: primary, lineHeight: 1 }}>
                            ₹{(item.salePrice || 0).toLocaleString('en-IN')}
                          </Typography>
                        </Box>
                        {canViewPurchasePrice && (
                          <>
                            <Box sx={{ width: '1px', height: 28, bgcolor: 'divider', flexShrink: 0 }} />
                            <Box>
                              <Typography sx={{ fontSize: '0.62rem', color: 'text.disabled', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1, mb: 0.25 }}>
                                Purchase
                              </Typography>
                              <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: 'text.secondary', lineHeight: 1 }}>
                                ₹{(item.purchasePrice || 0).toLocaleString('en-IN')}
                              </Typography>
                            </Box>
                          </>
                        )}
                      </Box>
                      {((item.taxRate || 0) > 0 || (margin !== null && margin > 0)) && (
                        <Box sx={{ ml: isMobile ? 0 : 'auto', display: 'flex', gap: 0.75, flexWrap: 'wrap', justifyContent: isMobile ? 'flex-start' : 'flex-end' }}>
                          {(item.taxRate || 0) > 0 && (
                            <Chip label={`${item.taxRate}% GST`} size="small" sx={{
                              height: 20, fontSize: '0.65rem', fontWeight: 700,
                              bgcolor: alpha('#111111', 0.08), color: '#5c1f22', border: 'none',
                            }} />
                          )}
                          {margin !== null && margin > 0 && (
                            <Chip label={`${margin}% margin`} size="small" sx={{
                              height: 20, fontSize: '0.65rem', fontWeight: 700,
                              bgcolor: alpha('#5c1f22', 0.08), color: '#5c1f22', border: 'none',
                            }} />
                          )}
                        </Box>
                      )}
                    </Box>

                    {/* Stock row */}
                    <Box sx={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      pt: 1.25, borderTop: '1px solid', borderColor: 'divider',
                    }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: sm.color, flexShrink: 0 }} />
                        <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', fontWeight: 600 }}>
                          {sm.label}
                        </Typography>
                      </Box>
                      <Chip
                        label={`${stock.toLocaleString('en-IN')} ${item.unit || 'NOS'}`}
                        size="small"
                        sx={{
                          height: 22, fontSize: '0.72rem', fontWeight: 700,
                          bgcolor: sm.bg, color: sm.color, border: `1px solid ${sm.border}`,
                        }}
                      />
                    </Box>


                    {/* Show in Sales & POS toggle */}
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1, pt: 1, borderTop: '1px dashed', borderColor: 'divider' }} onClick={e => e.stopPropagation()}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {item.showInSalesAndPOS === false
                          ? <EyeOff size={12} color="#9c8a84" />
                          : <Eye size={12} color="#5c1f22" />}
                        <Typography sx={{ fontSize: '0.67rem', color: item.showInSalesAndPOS === false ? 'text.disabled' : '#5c1f22', fontWeight: 600 }}>
                          {item.showInSalesAndPOS === false ? 'Hidden in Sales/POS' : 'Visible in Sales/POS'}
                        </Typography>
                      </Box>
                      <Tooltip title={item.showInSalesAndPOS === false ? 'Show in Sales & POS' : 'Hide from Sales & POS'}>
                        <Box
                          onClick={() => updateItem('items', item.id, { showInSalesAndPOS: item.showInSalesAndPOS === false ? true : false })}
                          sx={{
                            width: 32, height: 18, borderRadius: '9px', cursor: 'pointer', flexShrink: 0,
                            bgcolor: item.showInSalesAndPOS === false ? alpha('#9c8a84', 0.25) : alpha('#5c1f22', 0.15),
                            border: '1.5px solid',
                            borderColor: item.showInSalesAndPOS === false ? '#ddd0c9' : '#5c1f22',
                            display: 'flex', alignItems: 'center',
                            justifyContent: item.showInSalesAndPOS === false ? 'flex-start' : 'flex-end',
                            px: '2px', transition: 'all 0.15s',
                          }}>
                          <Box sx={{
                            width: 12, height: 12, borderRadius: '50%',
                            bgcolor: item.showInSalesAndPOS === false ? '#9c8a84' : '#5c1f22',
                            transition: 'all 0.15s',
                          }} />
                        </Box>
                      </Tooltip>
                    </Box>

                    {/* Expiry warning */}
                    {item.expiryDate && (() => {
                      const days = Math.ceil((new Date(item.expiryDate) - new Date()) / 86400000);
                      if (days > 90) return null;
                      const expColor = days < 0 ? '#dc2626' : '#d97706';
                      return (
                        <Box sx={{ mt: 1, px: 1, py: 0.5, borderRadius: 1, bgcolor: alpha(expColor, 0.08), display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <AlertTriangle size={11} color={expColor} />
                          <Typography sx={{ fontSize: '0.68rem', fontWeight: 600, color: expColor }}>
                            {days < 0 ? `Expired ${Math.abs(days)}d ago` : `Expires in ${days}d`}
                          </Typography>
                        </Box>
                      );
                    })()}
                  </CardContent>
                </Card>
              );
            })}
          </Box>
          </Box>{/* end inner scroll region */}

          {/* Pagination — pinned outside the scroll region so it's always visible without an extra scroll */}
          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 1.5, flexShrink: 0 }}>
              <Pagination
                count={totalPages} page={page}
                onChange={(_, p) => setPage(p)}
                color="primary" shape="rounded"
                sx={{ '& .MuiPaginationItem-root': { borderRadius: 1.5, fontWeight: 600 } }}
              />
            </Box>
          )}
          </Box>{/* end flex: 1 */}
        </>
      )}

      {/* ── Item Detail Panel ── */}
      {!selectedItem && (
        <Box sx={{ width: 300, flexShrink: 0, display: { xs: 'none', md: 'flex' }, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1.5, border: '1px dashed', borderColor: 'divider', borderRadius: 2, position: 'sticky', top: 16, height: 260, bgcolor: 'background.paper' }}>
          <Box sx={{ width: 56, height: 56, borderRadius: '50%', bgcolor: 'rgba(92,31,34,0.07)', border: '2px dashed rgba(92,31,34,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MousePointerClick size={24} color="rgba(92,31,34,0.4)" />
          </Box>
          <Box sx={{ textAlign: 'center', px: 2 }}>
            <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: 'text.secondary', mb: 0.4 }}>Select an item to preview</Typography>
            <Typography sx={{ fontSize: '0.72rem', color: 'text.disabled', lineHeight: 1.5 }}>Click any item card to view its details, pricing, and stock info here.</Typography>
          </Box>
        </Box>
      )}
      {selectedItem && (() => {
        const it = selectedItem;
        const sm = getStockMeta(it);
        const margin = it.salePrice && it.purchasePrice && canViewPurchasePrice
          ? Math.round(((it.salePrice - it.purchasePrice) / it.salePrice) * 100) : null;
        return (
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, width: 300, flexShrink: 0, display: { xs: 'none', md: 'flex' }, flexDirection: 'column', position: 'sticky', top: 16, maxHeight: 'calc(100vh - 120px)', overflow: 'hidden' }}>
            {/* Header */}
            <Box sx={{ background: '#ffffff', border: '1px solid #ece2db', p: 2.5, position: 'relative', overflow: 'hidden' }}>
              <Box sx={{ position: 'absolute', top: -30, right: -30, width: 100, height: 100, borderRadius: '50%', bgcolor: 'transparent', pointerEvents: 'none' }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                <Avatar sx={{ width: 44, height: 44, bgcolor: 'rgba(92,31,34,0.1)', color: '#5c1f22', fontWeight: 800, fontSize: '1.1rem' }}>
                  {it.name.charAt(0).toUpperCase()}
                </Avatar>
                <IconButton size="small" onClick={() => setSelectedItem(null)} sx={{ color: '#6b5550', '&:hover': { color: '#5c1f22', bgcolor: 'rgba(92,31,34,0.08)' } }}>
                  <X size={15} />
                </IconButton>
              </Box>
              <Typography sx={{ color: '#5c1f22', fontWeight: 700, fontSize: '1rem', lineHeight: 1.3, mb: 0.25 }}>{it.name}</Typography>
              {it.itemCode && (
                <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#6b5550', fontWeight: 600, fontSize: '0.7rem', display: 'block', mb: 1.25 }}>{it.itemCode}</Typography>
              )}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: 'rgba(0,0,0,0.18)', borderRadius: 1.5, px: 1.5, py: 1 }}>
                <Typography variant="caption" sx={{ color: '#6b5550', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>Sale Price</Typography>
                <Typography sx={{ color: '#5c1f22', fontWeight: 800, fontSize: '0.95rem', fontFamily: 'monospace' }}>₹{(it.salePrice || 0).toLocaleString('en-IN')}</Typography>
              </Box>
            </Box>
            {/* Body */}
            <Box sx={{ flex: 1, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                <Button size="small" variant="outlined" startIcon={<Edit2 size={13} />}
                  onClick={() => handleOpen(it)}
                  sx={{ flex: 1, fontWeight: 600, textTransform: 'none', borderRadius: 1.5, fontSize: '0.78rem' }}>
                  Edit
                </Button>
                <Button size="small" variant="outlined" color="error" startIcon={<Trash2 size={13} />}
                  onClick={() => handleDelete(it.id)}
                  sx={{ flex: 1, fontWeight: 600, textTransform: 'none', borderRadius: 1.5, fontSize: '0.78rem' }}>
                  Delete
                </Button>
              </Box>
              <Divider sx={{ my: 0.5 }} />

              {/* Stock status */}
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mt: 0.5, mb: 1 }}>Stock</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: sm.color }} />
                  <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.82rem' }}>{sm.label}</Typography>
                </Box>
                <Chip label={`${(it.stock || 0).toLocaleString('en-IN')} ${it.unit || 'NOS'}`} size="small"
                  sx={{ height: 22, fontSize: '0.72rem', fontWeight: 700, bgcolor: sm.bg, color: sm.color, border: `1px solid ${sm.border}` }} />
              </Box>

              {/* Pricing */}
              <Divider sx={{ my: 0.5 }} />
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mt: 0.5, mb: 1 }}>Pricing</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {it.mrp > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="caption" color="text.secondary">MRP</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, textDecoration: 'line-through', color: 'text.disabled', fontSize: '0.82rem' }}>₹{Number(it.mrp).toLocaleString('en-IN')}</Typography>
                  </Box>
                )}
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="caption" color="text.secondary">Sale Price</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: primary, fontSize: '0.82rem' }}>₹{(it.salePrice || 0).toLocaleString('en-IN')}</Typography>
                </Box>
                {canViewPurchasePrice && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="caption" color="text.secondary">Purchase Price</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.82rem' }}>₹{(it.purchasePrice || 0).toLocaleString('en-IN')}</Typography>
                  </Box>
                )}
                {margin !== null && margin > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="caption" color="text.secondary">Margin</Typography>
                    <Chip label={`${margin}%`} size="small" sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700, bgcolor: alpha('#5c1f22', 0.1), color: '#5c1f22' }} />
                  </Box>
                )}
                {(it.taxRate || 0) > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="caption" color="text.secondary">GST</Typography>
                    <Chip label={`${it.taxRate}%`} size="small" sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700, bgcolor: alpha('#111', 0.07), color: '#5c1f22' }} />
                  </Box>
                )}
              </Box>

              {/* Details */}
              {(it.category || it.hsnCode || it.barcode || it.color || it.size || it.description) && (
                <>
                  <Divider sx={{ my: 0.75 }} />
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 1 }}>Details</Typography>
                  {it.category && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 0.75 }}>
                      <Box sx={{ p: 0.75, borderRadius: 1.25, bgcolor: alpha(primary, 0.08), display: 'flex', flexShrink: 0 }}>
                        <Tag size={13} color={primary} />
                      </Box>
                      <Chip label={it.category} size="small" sx={{ fontSize: '0.72rem', height: 20, bgcolor: alpha(primary, 0.08), color: 'primary.main', border: `1px solid ${alpha(primary, 0.2)}` }} />
                    </Box>
                  )}
                  {it.hsnCode && (
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">HSN / SAC</Typography>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 600 }}>{it.hsnCode}</Typography>
                    </Box>
                  )}
                  {it.barcode && (
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">Barcode</Typography>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 600 }}>{it.barcode}</Typography>
                    </Box>
                  )}
                  {(it.color || it.size) && (
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                      {it.color && <Chip icon={<Palette size={10} />} label={it.color} size="small" sx={{ height: 20, fontSize: '0.68rem' }} />}
                      {it.size && <Chip icon={<Ruler size={10} />} label={it.size} size="small" sx={{ height: 20, fontSize: '0.68rem' }} />}
                    </Box>
                  )}
                  {it.description && (
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.78rem', lineHeight: 1.5, display: 'block', mt: 0.75 }}>
                      {it.description}
                    </Typography>
                  )}
                </>
              )}

              {/* Top Customers — who buys this item most */}
              <Divider sx={{ my: 0.75 }} />
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 1 }}>Top Customers</Typography>
              <TopCustomersForItem customers={getTopCustomersForItem(it.id)} primary={primary} />

              {/* Expiry */}
              {it.expiryDate && (() => {
                const days = Math.ceil((new Date(it.expiryDate) - new Date()) / 86400000);
                const expColor = days < 0 ? '#dc2626' : days <= 90 ? '#d97706' : '#16a34a';
                return (
                  <Box sx={{ mt: 1, px: 1.25, py: 0.75, borderRadius: 1.5, bgcolor: alpha(expColor, 0.08), display: 'flex', alignItems: 'center', gap: 0.75, border: `1px solid ${alpha(expColor, 0.2)}` }}>
                    <AlertTriangle size={13} color={expColor} />
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: expColor }}>
                      {days < 0 ? `Expired ${Math.abs(days)}d ago` : `Expires in ${days}d`}
                    </Typography>
                  </Box>
                );
              })()}
            </Box>
          </Card>
        );
      })()}

      </Box>{/* end outer flex */}

      {/* ── Mobile item detail bottom sheet ── */}
      {isMobile && selectedItem && (() => {
        const it = selectedItem;
        const sm = getStockMeta(it);
        const margin = it.salePrice && it.purchasePrice && canViewPurchasePrice
          ? Math.round(((it.salePrice - it.purchasePrice) / it.salePrice) * 100) : null;
        return (
          <Dialog open={!!selectedItem} onClose={() => setSelectedItem(null)} maxWidth="xs" fullWidth
            PaperProps={{ sx: { borderRadius: '16px 16px 0 0', m: 0, mt: 'auto', maxHeight: '85vh', position: 'fixed', bottom: 0, left: 0, right: 0, width: '100%' } }}>
            <Box sx={{ background: '#ffffff', border: '1px solid #ece2db', p: 2.5, position: 'relative', overflow: 'hidden' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                <Avatar sx={{ width: 44, height: 44, bgcolor: 'rgba(92,31,34,0.1)', color: '#5c1f22', fontWeight: 800, fontSize: '1.1rem' }}>
                  {it.name.charAt(0).toUpperCase()}
                </Avatar>
                <IconButton size="small" onClick={() => setSelectedItem(null)} sx={{ color: '#6b5550' }}><CloseIcon size={18} /></IconButton>
              </Box>
              <Typography sx={{ color: '#5c1f22', fontWeight: 700, fontSize: '1rem', lineHeight: 1.3, mb: 0.25 }}>{it.name}</Typography>
              {it.itemCode && <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#6b5550', fontWeight: 600, display: 'block', mb: 1 }}>{it.itemCode}</Typography>}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: 'rgba(0,0,0,0.18)', borderRadius: 1.5, px: 1.5, py: 1 }}>
                <Typography variant="caption" sx={{ color: '#6b5550', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Sale Price</Typography>
                <Typography sx={{ color: '#5c1f22', fontWeight: 800, fontSize: '0.95rem', fontFamily: 'monospace' }}>₹{(it.salePrice || 0).toLocaleString('en-IN')}</Typography>
              </Box>
            </Box>
            <DialogContent sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <Button size="small" variant="outlined" startIcon={<Edit2 size={13} />} onClick={() => { setSelectedItem(null); handleOpen(it); }}
                  sx={{ flex: 1, fontWeight: 600, textTransform: 'none', borderRadius: 1.5 }}>Edit</Button>
                <Button size="small" variant="outlined" color="error" startIcon={<Trash2 size={13} />} onClick={() => { setSelectedItem(null); handleDelete(it.id); }}
                  sx={{ flex: 1, fontWeight: 600, textTransform: 'none', borderRadius: 1.5 }}>Delete</Button>
              </Box>
              {/* Stock */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: sm.color }} />
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{sm.label}</Typography>
                </Box>
                <Chip label={`${(it.stock || 0).toLocaleString('en-IN')} ${it.unit || 'NOS'}`} size="small"
                  sx={{ height: 22, fontSize: '0.72rem', fontWeight: 700, bgcolor: sm.bg, color: sm.color, border: `1px solid ${sm.border}` }} />
              </Box>
              <Divider sx={{ mb: 1.5 }} />
              {/* Pricing */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mb: 1.5 }}>
                {it.mrp > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="caption" color="text.secondary">MRP</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, textDecoration: 'line-through', color: 'text.disabled' }}>₹{Number(it.mrp).toLocaleString('en-IN')}</Typography>
                  </Box>
                )}
                {canViewPurchasePrice && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="caption" color="text.secondary">Purchase Price</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>₹{(it.purchasePrice || 0).toLocaleString('en-IN')}</Typography>
                  </Box>
                )}
                {margin !== null && margin > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="caption" color="text.secondary">Margin</Typography>
                    <Chip label={`${margin}%`} size="small" sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700, bgcolor: alpha('#5c1f22', 0.1), color: '#5c1f22' }} />
                  </Box>
                )}
                {(it.taxRate || 0) > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="caption" color="text.secondary">GST</Typography>
                    <Chip label={`${it.taxRate}%`} size="small" sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700, bgcolor: alpha('#111', 0.07), color: '#5c1f22' }} />
                  </Box>
                )}
              </Box>
              {(it.category || it.hsnCode || it.barcode || it.description) && (
                <>
                  <Divider sx={{ mb: 1.5 }} />
                  {it.category && <Chip label={it.category} size="small" sx={{ mb: 1, fontSize: '0.72rem', height: 20, bgcolor: alpha(primary, 0.08), color: 'primary.main' }} />}
                  {it.hsnCode && <Typography variant="body2" sx={{ mb: 0.5 }}><b>HSN:</b> {it.hsnCode}</Typography>}
                  {it.barcode && <Typography variant="body2" sx={{ fontFamily: 'monospace', mb: 0.5 }}><b>Barcode:</b> {it.barcode}</Typography>}
                  {it.description && <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5, display: 'block' }}>{it.description}</Typography>}
                </>
              )}

              {/* Top Customers — who buys this item most */}
              <Divider sx={{ my: 1.5 }} />
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 1 }}>Top Customers</Typography>
              <TopCustomersForItem customers={getTopCustomersForItem(it.id)} primary={primary} />
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* ── Add / Edit Dialog (shared form) ── */}
      <ItemFormDialog
        open={open}
        onClose={handleClose}
        editingItem={editingItem}
      />

      <BarcodeDialog item={barcodeItem} onClose={() => setBarcodeItem(null)} />

      {bulkBarcodeOpen && (
        <BulkBarcodeDialog
          items={filteredItems.filter(i => checkedIds.has(i.id))}
          onClose={() => setBulkBarcodeOpen(false)}
        />
      )}

      {/* ── Category Manager Dialog ── */}
      <Dialog open={catManagerOpen} onClose={() => { setCatManagerOpen(false); setCatManagerInput(''); }} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <FolderOpen size={18} color={primary} />
              <Typography sx={{ fontWeight: 700 }}>Manage Item Categories</Typography>
            </Box>
            <IconButton size="small" onClick={() => { setCatManagerOpen(false); setCatManagerInput(''); }}>
              <X size={16} />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <Box sx={{ p: 2 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 1 }}>Built-in</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2 }}>
              {BUILTIN_PRODUCT_CATEGORIES.map(cat => (
                <Chip key={cat} label={cat} size="small"
                  sx={{ fontSize: '0.75rem', bgcolor: alpha(primary, 0.07), color: 'text.secondary', border: `1px solid ${alpha(primary, 0.15)}` }} />
              ))}
            </Box>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 1 }}>Custom</Typography>
            {customItemCats.length === 0 ? (
              <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 2 }}>No custom categories yet.</Typography>
            ) : (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2 }}>
                {customItemCats.map(cat => (
                  <Chip key={cat} label={cat} size="small" onDelete={() => handleCatManagerDelete(cat)}
                    sx={{ fontSize: '0.75rem', bgcolor: alpha(primary, 0.1), color: 'primary.main', border: `1px solid ${alpha(primary, 0.25)}` }} />
                ))}
              </Box>
            )}
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField size="small" fullWidth placeholder="New category name" value={catManagerInput}
                onChange={e => setCatManagerInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCatManagerAdd(); } }}
                autoComplete="off" />
              <Button variant="contained" size="small" onClick={handleCatManagerAdd} disabled={!catManagerInput.trim()}
                sx={{ fontWeight: 700, textTransform: 'none', borderRadius: 1.5, flexShrink: 0 }}>
                Add
              </Button>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2 }}>
          <Button onClick={() => { setCatManagerOpen(false); setCatManagerInput(''); }} sx={{ fontWeight: 600 }}>Done</Button>
        </DialogActions>
      </Dialog>

      <BulkAddDialog
        open={bulkAddOpen}
        onClose={() => setBulkAddOpen(false)}
        type="item"
        onSuccess={(count) => showSnackbar(`${count} items added`, 'success')}
      />
      <ItemBulkEditDialog
        open={bulkEditOpen}
        onClose={() => setBulkEditOpen(false)}
        items={items}
        onSuccess={(count) => showSnackbar(`${count} items updated`, 'success')}
      />

      <ImportDialog
        open={importOpen} onClose={() => setImportOpen(false)}
        type="items" existingItems={items}
        onBatchImport={(validRows, existing) => {
          let added = 0, updated = 0;
          const toAdd = [];
          for (const row of validRows) {
            const match = existing.find(ex =>
              (ex.itemCode && ex.itemCode === row.itemCode) ||
              ex.name.toLowerCase() === row.name.toLowerCase()
            );
            if (match) {
              updateItem('items', match.id, { ...row, businessId: currentBusiness.id });
              updated++;
            } else {
              toAdd.push({ ...row, businessId: currentBusiness.id });
              added++;
            }
          }
          if (toAdd.length) addItems('items', toAdd);
          return { added, updated, failed: 0 };
        }}
      />

      <Snackbar open={snackbar.open} autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity}
          variant="filled" sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ItemsPage;
