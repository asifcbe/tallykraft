import React, { useState, useRef, useEffect } from 'react';
import {
  Box, Button, Typography, TextField, Dialog,
  DialogContent, DialogActions, Grid, MenuItem,
  InputAdornment, IconButton, Snackbar, Alert, Stack, Divider,
  alpha, useTheme, useMediaQuery, FormControlLabel, Switch,
  Collapse, Chip, ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import { X as CloseIcon } from 'lucide-react';
import {
  Plus, Edit2, Trash2, Box as BoxIcon, Barcode, RefreshCw,
  Package, TrendingUp, Percent, Tag, Palette, Ruler, FileText,
  ScanLine, FolderOpen, X, Layers,
} from 'lucide-react';
import { useBusiness } from './BusinessContext';
import { useData } from './DataContext';
import { useConfig } from './ConfigContext';
import { useAuth } from './AuthContext';
import BarcodeScanner from './BarcodeScanner';
import { GST_RATES } from './gstUtils';
import ItemSelect from './ItemSelect';
import { useItemCategories } from './useItemCategories';

const DEFAULT_UNITS = ['NOS', 'BAGS', 'BOX', 'KGS', 'Ltr', 'Mtr', 'Pcs'];

// Full unit labels for dropdown display
const UNIT_FULL = {
  BAG: 'BAG — Bags', BAL: 'BAL — Bales', BDL: 'BDL — Bundles',
  BKL: 'BKL — Buckles', BOX: 'BOX — Box', BTL: 'BTL — Bottles',
  BUN: 'BUN — Bunches', CAN: 'CAN — Cans', CCM: 'CCM — Cubic cm',
  CMS: 'CMS — Centimetres', CTN: 'CTN — Cartons', DOZ: 'DOZ — Dozens',
  DRM: 'DRM — Drums', GGK: 'GGK — Great Gross', GMS: 'GMS — Grams',
  GRS: 'GRS — Gross', GYD: 'GYD — Gross Yards', KGS: 'KGS — Kilograms',
  KLR: 'KLR — Kilolitres', KME: 'KME — Kilometres', LTR: 'LTR — Litres',
  MLT: 'MLT — Millilitres', MTR: 'MTR — Metres', NOS: 'NOS — Numbers',
  PAC: 'PAC — Packs', PCS: 'PCS — Pieces', PRS: 'PRS — Pairs',
  QTL: 'QTL — Quintals', ROL: 'ROL — Rolls', SET: 'SET — Sets',
  SQF: 'SQF — Sq. Feet', SQM: 'SQM — Sq. Metres', SQY: 'SQY — Sq. Yards',
  TBS: 'TBS — Tablets', TGM: 'TGM — Ten Gross', THD: 'THD — Thousands',
  TON: 'TON — Tonnes', TUB: 'TUB — Tubes', UGS: 'UGS — US Gallons',
  UNT: 'UNT — Units', YDS: 'YDS — Yards',
  BAGS: 'BAGS — Bags', Ltr: 'Ltr — Litres', Mtr: 'Mtr — Metres', Pcs: 'Pcs — Pieces',
};


const BUILTIN_PRODUCT_CATEGORIES = [
  'Clothing', 'Footwear', 'Accessories', 'Electronics', 'Mobile & Tablets',
  'Food & Beverages', 'Grocery', 'Pharmacy', 'Cosmetics & Beauty',
  'Furniture', 'Hardware', 'Stationery', 'Books', 'Toys & Games',
  'Automotive', 'Agriculture', 'Jewellery', 'Sports & Fitness', 'Other',
];
const BUILTIN_SERVICE_CATEGORIES = [
  'Consulting', 'Design & Creative', 'Software & IT', 'Maintenance & Repair',
  'Education & Training', 'Health & Wellness', 'Legal & Compliance',
  'Logistics & Delivery', 'Marketing & Advertising', 'Photography & Video',
  'Cleaning & Housekeeping', 'Security', 'Catering & Events', 'Other',
];
const BUILTIN_MEMBERSHIP_CATEGORIES = [
  'Monthly', 'Quarterly', 'Half-yearly', 'Annual',
  'Lifetime', 'Trial', 'Premium', 'Basic', 'Other',
];


export const generateBarcode = () => String(Math.floor(Math.random() * 9e8 + 1e8));

// Every barcode currently in use across a business's items AND their
// variants/batches (each variant/batch can carry its own scannable code —
// see VariantEditor/BatchEditor below) — the single source of truth for
// uniqueness checks, so "no two items/variants/batches share a barcode"
// actually holds across the whole business, not just at the item level.
const collectAllBarcodes = (allItems, businessId) => {
  const set = new Set();
  for (const it of allItems) {
    if (it.businessId !== businessId) continue;
    if (it.barcode) set.add(it.barcode);
    for (const v of it.variants || []) if (v.barcode) set.add(v.barcode);
    for (const b of it.batches || []) if (b.barcode) set.add(b.barcode);
  }
  return set;
};

// jsbarcode/qrcode are only needed by these two render-on-demand components —
// dynamically imported on first use instead of bundled into every page that
// imports ItemFormDialog (Items, Sales, POS, etc.), even when barcodes are never rendered.
export const BarcodeImage = ({ value, height = 70, fontSize = 13 }) => {
  const svgRef = useRef(null);
  useEffect(() => {
    let cancelled = false;
    if (svgRef.current && value) {
      import('jsbarcode').then(({ default: JsBarcode }) => {
        if (cancelled || !svgRef.current) return;
        try {
          JsBarcode(svgRef.current, value, {
            format: 'CODE128', width: 1.5, height, displayValue: true,
            fontSize, margin: 4, background: '#ffffff', lineColor: '#000000',
          });
        } catch { svgRef.current.innerHTML = ''; }
      });
    }
    return () => { cancelled = true; };
  }, [value, height, fontSize]);
  return <svg ref={svgRef} style={{ maxWidth: '100%', display: 'block' }} />;
};

export const QRImage = ({ value, size = 80 }) => {
  const canvasRef = useRef(null);
  useEffect(() => {
    let cancelled = false;
    if (canvasRef.current && value) {
      import('qrcode').then(({ default: QRCode }) => {
        if (cancelled || !canvasRef.current) return;
        QRCode.toCanvas(canvasRef.current, value, {
          width: size, margin: 1, color: { dark: '#000000', light: '#ffffff' },
        }).catch(() => {});
      });
    }
    return () => { cancelled = true; };
  }, [value, size]);
  return <canvas ref={canvasRef} style={{ display: 'block' }} />;
};

const ITEM_TYPES = [
  { key: 'product',    label: 'Product',    icon: Package },
  { key: 'service',    label: 'Service',    icon: FileText },
  { key: 'membership', label: 'Membership', icon: Tag },
];

// Per-type context strings
const TYPE_CTX = {
  product: {
    namePlaceholder: 'e.g. Cotton T-Shirt, Wireless Mouse…',
    codeLabel: 'Item / Article Code',
    codePlaceholder: 'ITM-001',
    hsnLabel: 'HSN Code',
    hsnPlaceholder: 'e.g. 6109',
    hsnHelper: 'Tax code for goods',
    salePriceLabel: 'Sale Price',
    salePriceHelper: 'Price charged to customer',
    discountHelper: 'Auto-applied in sales',
    gstHelper: 'GST applicable on product sale',
  },
  service: {
    namePlaceholder: 'e.g. Website Design, AC Repair…',
    codeLabel: 'Service Code',
    codePlaceholder: 'SVC-001',
    hsnLabel: 'SAC Code',
    hsnPlaceholder: 'e.g. 9983',
    hsnHelper: 'Tax code for services',
    salePriceLabel: 'Service Charge',
    salePriceHelper: 'Amount charged for this service',
    discountHelper: 'Auto-applied on invoice',
    gstHelper: 'GST applicable on service (usually 18%)',
  },
  membership: {
    namePlaceholder: 'e.g. Monthly Gym Plan, Annual Club…',
    codeLabel: 'Plan Code',
    codePlaceholder: 'MEM-001',
    hsnLabel: 'SAC Code',
    hsnPlaceholder: 'e.g. 9992',
    hsnHelper: 'Tax code for this plan',
    salePriceLabel: 'Membership Fee',
    salePriceHelper: 'Fee charged per membership period',
    discountHelper: 'Auto-applied discount',
    gstHelper: 'GST applicable on membership fee',
  },
};

const SectionHead = ({ icon: Icon, label, action, primary }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <Icon size={13} color={primary} />
      <Typography sx={{ fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: primary }}>
        {label}
      </Typography>
    </Box>
    {action}
  </Box>
);

// Variant stock editor — one row per Size/Color/etc combination, each with
// its own stock and an optional price override (blank = use the item's own
// Sale Price). Shown when stockMode === 'variant'.
const VariantEditor = ({ form, set, fsx, primary, nextUniqueBarcode, barcodeEnabled, barcodeError }) => {
  const rows = form.variants || [];
  const update = (idx, patch) => {
    const next = [...rows];
    next[idx] = { ...next[idx], ...patch };
    set({ variants: next });
  };
  const total = rows.reduce((s, r) => s + (Number(r.stock) || 0), 0);
  return (
    <Box>
      {rows.map((r, idx) => (
        <Box key={r.id || idx} sx={{ mb: 1.25, p: 1, borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}>
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <TextField size="small" label="Variant" placeholder="Red — M"
              value={r.label || ''}
              onChange={e => update(idx, { label: e.target.value })}
              sx={{ flex: 1.3, ...fsx }} />
            <TextField size="small" label="SKU" placeholder="optional"
              value={r.sku || ''}
              onChange={e => update(idx, { sku: e.target.value })}
              sx={{ flex: 1, ...fsx }} />
            <TextField size="small" type="number" label="Stock"
              value={r.stock ?? ''}
              placeholder="0"
              onChange={e => update(idx, { stock: e.target.value })}
              sx={{ width: 90, flexShrink: 0, ...fsx }} />
            <TextField size="small" type="number" label="Price"
              value={r.priceOverride ?? ''}
              placeholder={form.salePrice || '0'}
              helperText="blank = default"
              onChange={e => update(idx, { priceOverride: e.target.value })}
              InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
              sx={{ width: 110, flexShrink: 0, ...fsx, '& .MuiFormHelperText-root': { fontSize: '0.6rem', mx: 0 } }} />
            <IconButton size="small" color="error" sx={{ mt: 0.5 }}
              onClick={() => set({ variants: rows.filter((_, i) => i !== idx) })}>
              <Trash2 size={15} />
            </IconButton>
          </Stack>
          {barcodeEnabled && (
            <TextField size="small" fullWidth label="Barcode (this variant)" placeholder="Leave blank to auto-generate on save"
              value={r.barcode || ''}
              onChange={e => update(idx, { barcode: e.target.value })}
              error={!!barcodeError(r.barcode, r.id)}
              helperText={barcodeError(r.barcode, r.id) || 'Scanning this code in Sales/POS picks this variant directly'}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" title="Generate unique barcode" onClick={() => update(idx, { barcode: nextUniqueBarcode(rows, idx) })}><RefreshCw size={14} /></IconButton>
                  </InputAdornment>
                ),
              }}
              sx={{ mt: 1, ...fsx, '& .MuiFormHelperText-root': { fontSize: '0.62rem', mx: 0 } }} />
          )}
        </Box>
      ))}
      <Button size="small" startIcon={<Plus size={13} />} sx={{ mt: 0.5, fontSize: '0.78rem' }}
        onClick={() => set({ variants: [...rows, { id: `vr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, label: '', sku: '', stock: '', priceOverride: '', barcode: '' }] })}>
        Add variant
      </Button>
      {rows.length > 0 && (
        <Typography variant="caption" sx={{ display: 'block', mt: 1, color: primary, fontWeight: 700 }}>
          Total stock across all variants: {total}
        </Typography>
      )}
    </Box>
  );
};

// Batch/expiry-lot stock editor — one row per purchase lot, each with its
// own stock and expiry date. Selling a batch-tracked item lets the seller
// pick which lot to sell from (Sales.jsx/POS.jsx), rather than an automatic
// oldest-first rollover, so batch identity here just needs to be clear —
// name, expiry, and how much is left.
const BatchEditor = ({ form, set, fsx, primary, nextUniqueBarcode, barcodeEnabled, barcodeError }) => {
  const rows = form.batches || [];
  const update = (idx, patch) => {
    const next = [...rows];
    next[idx] = { ...next[idx], ...patch };
    set({ batches: next });
  };
  const total = rows.reduce((s, r) => s + (Number(r.stock) || 0), 0);
  return (
    <Box>
      {rows.map((r, idx) => {
        const days = r.expiryDate ? Math.ceil((new Date(r.expiryDate) - new Date()) / 86400000) : null;
        return (
          <Box key={r.id || idx} sx={{ mb: 1.25, p: 1, borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}>
            <Stack direction="row" spacing={1} alignItems="flex-start">
              <TextField size="small" label="Batch / Lot" placeholder="BT-001"
                value={r.label || ''}
                onChange={e => update(idx, { label: e.target.value })}
                sx={{ flex: 1.2, ...fsx }} />
              <TextField size="small" type="date" label="Expiry Date"
                value={r.expiryDate || ''}
                onChange={e => update(idx, { expiryDate: e.target.value })}
                InputLabelProps={{ shrink: true }}
                helperText={days != null ? (days < 0 ? `Expired ${Math.abs(days)}d ago` : `${days}d left`) : ''}
                sx={{ flex: 1.1, ...fsx, '& .MuiFormHelperText-root': { fontSize: '0.6rem', mx: 0, color: days < 0 ? 'error.main' : days <= 30 ? 'warning.dark' : 'text.secondary', fontWeight: days != null && days <= 30 ? 700 : 400 } }} />
              <TextField size="small" type="number" label="Stock"
                value={r.stock ?? ''}
                placeholder="0"
                onChange={e => update(idx, { stock: e.target.value })}
                sx={{ width: 90, flexShrink: 0, ...fsx }} />
              <IconButton size="small" color="error" sx={{ mt: 0.5 }}
                onClick={() => set({ batches: rows.filter((_, i) => i !== idx) })}>
                <Trash2 size={15} />
              </IconButton>
            </Stack>
            {barcodeEnabled && (
              <TextField size="small" fullWidth label="Barcode (this batch)" placeholder="Leave blank to auto-generate on save"
                value={r.barcode || ''}
                onChange={e => update(idx, { barcode: e.target.value })}
                error={!!barcodeError(r.barcode, r.id)}
                helperText={barcodeError(r.barcode, r.id) || 'Scanning this code in Sales/POS picks this batch directly'}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton size="small" title="Generate unique barcode" onClick={() => update(idx, { barcode: nextUniqueBarcode(rows, idx) })}><RefreshCw size={14} /></IconButton>
                    </InputAdornment>
                  ),
                }}
                sx={{ mt: 1, ...fsx, '& .MuiFormHelperText-root': { fontSize: '0.62rem', mx: 0 } }} />
            )}
          </Box>
        );
      })}
      <Button size="small" startIcon={<Plus size={13} />} sx={{ mt: 0.5, fontSize: '0.78rem' }}
        onClick={() => set({ batches: [...rows, { id: `bt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, label: '', expiryDate: '', stock: '', barcode: '' }] })}>
        Add batch
      </Button>
      {rows.length > 0 && (
        <Typography variant="caption" sx={{ display: 'block', mt: 1, color: primary, fontWeight: 700 }}>
          Total stock across all batches: {total}
        </Typography>
      )}
    </Box>
  );
};

const ItemFormDialog = ({ open, onClose, editingItem = null, initialName = '', onSaved }) => {
  const { currentBusiness } = useBusiness();
  const { addItem, updateItem, getItems, data } = useData();
  const { config } = useConfig();
  const { staffSession } = useAuth();
  const canViewPurchase = !staffSession || staffSession.role === 'admin' || !!staffSession.features?.viewPurchasePrice;
  const barcodeEnabled = !!config.features?.barcode;
  const UNITS = [...new Set(config.itemUnits?.length ? config.itemUnits : DEFAULT_UNITS)];
  const defaultUnit = (config.defaultItemUnit && UNITS.includes(config.defaultItemUnit)) ? config.defaultItemUnit : (UNITS[0] || 'NOS');

  // Every barcode in use across the business EXCEPT the item currently being
  // edited (its own item/variant/batch codes are excluded so editing it
  // doesn't conflict with itself), then also excluding whatever's already
  // typed into the in-progress form's own other rows — so generating one
  // row's barcode can never collide with another row just typed in this
  // same session before saving.
  const barcodesInUseExcludingSelf = () => {
    const set = collectAllBarcodes(getItems('items'), currentBusiness?.id);
    if (editingItem) {
      if (editingItem.barcode) set.delete(editingItem.barcode);
      for (const v of editingItem.variants || []) if (v.barcode) set.delete(v.barcode);
      for (const b of editingItem.batches || []) if (b.barcode) set.delete(b.barcode);
    }
    return set;
  };
  const nextUniqueBarcode = (alsoExclude = new Set()) => {
    const existing = barcodesInUseExcludingSelf();
    let bc;
    do { bc = generateBarcode(); } while (existing.has(bc) || alsoExclude.has(bc));
    return bc;
  };
  // Kept for the item's own barcode field (unchanged call sites below).
  const generateUniqueBarcode = () => nextUniqueBarcode();

  // Per-row generator/validator for VariantEditor/BatchEditor — also
  // excludes every OTHER row's own typed barcode in the same list (two
  // variants of the same item must never share a code either), on top of
  // every other item/variant/batch in the business.
  const nextRowBarcode = (rows, excludeIdx) => {
    const siblings = new Set(
      rows.filter((_, i) => i !== excludeIdx).map(r => r.barcode).filter(Boolean),
    );
    return nextUniqueBarcode(siblings);
  };
  const rowBarcodeError = (rows) => (barcode, rowId) => {
    if (!barcode?.trim()) return '';
    const trimmed = barcode.trim();
    const businessWide = barcodesInUseExcludingSelf();
    if (businessWide.has(trimmed)) return 'Already used by another item/variant/batch';
    const dupeSibling = rows.some(r => r.id !== rowId && r.barcode?.trim() === trimmed);
    if (dupeSibling) return 'Already used by another row here';
    return '';
  };

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const primary = theme.palette.primary.main;
  const radius = Number(theme.shape?.borderRadius) || 8;
  const fsx = { '& .MuiOutlinedInput-root': { borderRadius: `${radius + 2}px`, bgcolor: 'background.paper' } };

  const deriveType = (item) => {
    if (!item) return 'product';
    if (item.isMembership || item.itemType === 'membership') return 'membership';
    if (item.itemType === 'service') return 'service';
    return 'product';
  };

  const [itemType, setItemType] = useState('product');
  const [gstOn, setGstOn] = useState(false);
  const [composite, setComposite] = useState(false);
  // Buy-in-bulk / sell-in-pieces toggle — e.g. purchase by the Box/Carton,
  // sell by the Pc. Kept as its own switch (rather than deriving it purely
  // from "packSizes is non-empty") so unchecking it doesn't need to also
  // clear the list to have an effect — handleSubmit already omits packSizes
  // from the saved record whenever this is off.
  const [buyInBulk, setBuyInBulk] = useState(false);
  // Stock tracking mode — mutually exclusive, same reasoning as a recipe
  // item having no stock of its own: 'simple' = one Opening Stock number
  // (today's behaviour); 'variant' = separate stock per Size/Color/etc
  // combination (e.g. Red-M, Red-L); 'batch' = separate stock per purchase
  // lot, each with its own expiry date. A migration prompt (see
  // migratePromptOpen below) offers to carry the item's current single
  // stock number into a first variant/batch when switching a simple item
  // into one of these modes, instead of silently zeroing it.
  const [stockMode, setStockMode] = useState('simple');
  const [migratePrompt, setMigratePrompt] = useState(null); // { toMode } | null
  const [gstType, setGstType] = useState('cgst_sgst'); // cgst_sgst | igst | utgst
  const [newCatVal, setNewCatVal] = useState('');
  const [showNewCat, setShowNewCat] = useState(false);
  const [mgrOpen, setMgrOpen] = useState(false);
  const [mgrInput, setMgrInput] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [snack, setSnack] = useState({ open: false, msg: '', sev: 'error' });
  const snap = (msg, sev = 'error') => setSnack({ open: true, msg, sev });

  const blank = () => ({
    name: '', unit: defaultUnit,
    salePrice: '', purchasePrice: '', mrp: '', discount: '',
    taxRate: 0, cgstRate: 0, sgstRate: 0, igstRate: 0, utgstRate: 0, taxInclusive: false,
    hsnCode: '', stock: '', barcode: '', itemCode: '',
    barcodeExtraFields: [], batchNo: '', expiryDate: '',
    category: '', color: '', size: '', variant: '', description: '', minStock: '',
    recipe: [],
    // Variant / batch stock tracking — mutually exclusive with each other
    // and with recipe. `stockMode` also lives on the saved item record so
    // Sales.jsx/POS.jsx/Items.jsx know which picker (if any) to show without
    // re-deriving it from array contents. Each variant/batch id is stable
    // (kept across edits) since Sales.jsx line items reference it directly.
    stockMode: 'simple',
    variants: [], // [{ id, label, sku, stock, priceOverride }]
    batches: [], // [{ id, label, expiryDate, stock }]
    // Buy-in-bulk, sell-in-pieces: each entry is a named pack the item is
    // purchased in (e.g. "Box" = 10 Pcs at ₹450/Box) — stock always stays
    // tracked in the sale `unit` everywhere else in the app. A Purchase row
    // picks one of these packs directly; its price and stock-added both come
    // straight from the pack, no conversion math anywhere else in the app.
    // See Sales.jsx's Purchases item row.
    packSizes: [],
  });

  const [form, setForm] = useState(blank());
  const set = (patch) => setForm(f => ({ ...f, ...patch }));

  const builtins =
    itemType === 'service' ? BUILTIN_SERVICE_CATEGORIES :
    itemType === 'membership' ? BUILTIN_MEMBERSHIP_CATEGORIES :
    BUILTIN_PRODUCT_CATEGORIES;

  const ctx = TYPE_CTX[itemType] || TYPE_CTX.product;

  useEffect(() => {
    if (!open) return;
    const type = deriveType(editingItem);
    setItemType(type);
    if (editingItem) {
      // Color/Shade, Size, and Variant used to be plain text fields on the
      // item itself; the Variants list below is now the only place that
      // information lives (row 1 = the default variant — see
      // stockRows()/resolveStockRef() in Sales.jsx/POS.jsx, which treat a
      // single-row variant list exactly like a plain item with no picker).
      // An item saved before this change has no variants[] yet but may have
      // real color/size/variant text — migrate it into variant row 1 here,
      // on open, so the data isn't silently dropped the next time this item
      // is saved. Runs every time the form opens for this item (not just
      // once) since it's cheap and idempotent — a real variants[] already
      // present is left untouched.
      const existingVariants = Array.isArray(editingItem.variants) ? editingItem.variants : [];
      const migratedVariants = existingVariants.length > 0
        ? existingVariants
        : [{
            id: `vr_${Date.now()}`,
            label: [editingItem.color, editingItem.size, editingItem.variant].filter(Boolean).join(' / ') || 'Default',
            sku: '',
            stock: Number(editingItem.stock) || 0,
            priceOverride: null,
            barcode: '',
          }];
      setForm({
        ...blank(), ...editingItem,
        mrp: editingItem.mrp ? editingItem.mrp : '',
        utgstRate: editingItem.utgstRate ?? (editingItem.cgstRate ?? 0),
        recipe: Array.isArray(editingItem.recipe) ? editingItem.recipe : [],
        packSizes: (Array.isArray(editingItem.packSizes) && editingItem.packSizes.length)
          ? editingItem.packSizes
          // Item saved before packs existed: carry its single purchase unit
          // over as a pack (same fixed id Sales.jsx uses for its old bills).
          : (editingItem.purchaseUnit && editingItem.purchaseUnit !== editingItem.unit && Number(editingItem.purchaseUnitConversion) > 0)
            ? [{ id: 'legacy_pu', label: editingItem.purchaseUnit, qty: Number(editingItem.purchaseUnitConversion), price: Number(editingItem.purchasePrice) || '' }]
            : [],
        variants: migratedVariants,
        batches: Array.isArray(editingItem.batches) ? editingItem.batches : [],
      });
      setGstOn((editingItem.taxRate || 0) > 0);
      setComposite(!!editingItem.isComposite);
      setGstType(editingItem.gstType || 'cgst_sgst');
      setBuyInBulk((Array.isArray(editingItem.packSizes) && editingItem.packSizes.length > 0)
        || (!!editingItem.purchaseUnit && editingItem.purchaseUnit !== editingItem.unit && Number(editingItem.purchaseUnitConversion) > 0));
      // A batch-tracked item stays on Batches; everything else (including a
      // legacy 'simple' item, now migrated above) lands on Variants — the
      // Simple mode itself no longer exists as a separate choice.
      setStockMode(editingItem.stockMode === 'batch' ? 'batch' : 'variant');
    } else {
      const d = config.itemDefaults || {};
      const defGstOn = !!d.gstOn;
      const defGstType = d.gstType === 'composite' ? 'cgst_sgst' : (d.gstType || 'cgst_sgst');
      const defComposite = d.gstType === 'composite';
      const defRate = defGstOn ? (Number(d.taxRate) || 0) : 0;
      const halfRate = defRate / 2;
      setGstOn(defGstOn);
      setComposite(defComposite);
      setGstType(defGstType);
      setBuyInBulk(false);
      setStockMode('variant');
      setForm({
        ...blank(),
        name: initialName || '',
        taxRate: defRate,
        cgstRate: halfRate,
        sgstRate: halfRate,
        igstRate: defRate,
        utgstRate: halfRate,
        taxInclusive: !!d.taxInclusive,
        // A brand-new product starts with one default variant row — this is
        // what makes it behave exactly like a plain item (no picker forced
        // in Sales/POS) until a second variant is actually added.
        variants: [{ id: `vr_${Date.now()}`, label: 'Default', sku: '', stock: '', priceOverride: null, barcode: '' }],
      });
    }
  }, [open, editingItem, initialName]); // eslint-disable-line

  // Shared, synced category list (see useItemCategories.js) — a category
  // added anywhere (Items → Categories, another device, a staff login) shows
  // here immediately, and categories already used on items are always offered.
  const itemCats = useItemCategories(itemType);
  const customCats = itemCats.custom;

  const addCat = async (name) => {
    name = name.trim();
    if (!name || !currentBusiness?.id) return;
    set({ category: name });
    setShowNewCat(false); setNewCatVal('');
    const stored = await itemCats.add(name).catch(() => name);
    if (stored && stored !== name) set({ category: stored });
  };

  const delCat = (cat) => {
    if (!currentBusiness?.id) return;
    itemCats.remove(cat);
    if (form.category === cat) set({ category: '' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentBusiness?.id) { snap('Business not selected.'); return; }
    if (!form.name?.trim()) { snap('Item name is required', 'warning'); return; }
    // Recipe rows missing either a component or a qty were previously
    // silently dropped at save time — the item saved fine but with an empty
    // recipe, with no indication anything was wrong. Block the save instead
    // and tell the user exactly which row needs fixing.
    if (isProduct && hasRecipe) {
      const rows = form.recipe || [];
      const incompleteIdx = rows.findIndex(r => !r.itemId || !(Number(r.qtyPerUnit) > 0));
      if (incompleteIdx !== -1) {
        snap(`Recipe row ${incompleteIdx + 1} needs both a component item and a quantity greater than 0 — remove it or fill it in.`, 'warning');
        return;
      }
    }
    if (isProduct && buyInBulk) {
      const packs = form.packSizes || [];
      if (packs.length === 0) {
        snap('Add at least one pack size, or turn off "Buy in bulk, sell in pieces".', 'warning');
        return;
      }
      const badIdx = packs.findIndex(p => !p.label?.trim() || !(Number(p.qty) > 0));
      if (badIdx !== -1) {
        snap(`Pack size ${badIdx + 1} needs a name and a quantity greater than 0 (how many ${form.unit || 'units'} it contains).`, 'warning');
        return;
      }
    }
    if (isProduct && stockMode === 'variant') {
      const rows = form.variants?.length ? form.variants : [{ id: `vr_${Date.now()}`, label: 'Default', sku: '', stock: 0, priceOverride: null, barcode: '' }];
      const badIdx = rows.findIndex(r => !r.label?.trim());
      if (badIdx !== -1) { snap(`Variant ${badIdx + 1} needs a name (e.g. "Red — M").`, 'warning'); return; }
      const labels = rows.map(r => r.label.trim().toLowerCase());
      const dupe = labels.find((l, i) => labels.indexOf(l) !== i);
      if (dupe) { snap(`Two variants are both named "${rows.find(r => r.label.trim().toLowerCase() === dupe).label}" — variant names must be unique.`, 'warning'); return; }
    }
    if (isProduct && stockMode === 'batch') {
      const rows = form.batches || [];
      if (rows.length === 0) { snap('Add at least one batch, or switch to Variants.', 'warning'); return; }
      const badIdx = rows.findIndex(r => !r.label?.trim());
      if (badIdx !== -1) { snap(`Batch ${badIdx + 1} needs a name (e.g. "BT-001").`, 'warning'); return; }
    }
    // Barcode uniqueness — hard block. No two items/variants/batches in the
    // business may share a manually-typed barcode; blank fields are
    // auto-generated below and are always unique by construction.
    if (barcodeEnabled) {
      const rows = isProduct && stockMode === 'variant' ? (form.variants || [])
        : isProduct && stockMode === 'batch' ? (form.batches || [])
        : [];
      const err = rowBarcodeError(rows);
      const rowLabel = stockMode === 'variant' ? 'Variant' : 'Batch';
      const rowIdx = rows.findIndex(r => err(r.barcode, r.id));
      if (rowIdx !== -1) {
        snap(`${rowLabel} "${rows[rowIdx].label}" has a barcode already in use elsewhere — change it or leave it blank to auto-generate.`, 'warning');
        return;
      }
      if (form.barcode?.trim() && barcodesInUseExcludingSelf().has(form.barcode.trim())) {
        snap('This item\'s barcode is already in use elsewhere — change it or leave it blank to auto-generate.', 'warning');
        return;
      }
    }
    try {
      const taxRate = gstOn ? (Number(form.taxRate) || 0) : 0;
      const cleanRecipe = isProduct
        ? (form.recipe || [])
            .filter(r => r.itemId && Number(r.qtyPerUnit) > 0)
            .map(r => ({ itemId: r.itemId, qtyPerUnit: Number(r.qtyPerUnit) }))
        : [];
      const activeStockMode = isProduct ? stockMode : 'simple';
      // Barcodes are assigned here (not just validated above) so a row left
      // blank gets a real, business-wide-unique code on save — mirrors the
      // item's own barcode field's "blank = auto-generate" behavior.
      // usedBarcodes accumulates as each row is assigned so two blank rows
      // in the same save can never generate the same code.
      const usedBarcodes = barcodeEnabled ? barcodesInUseExcludingSelf() : new Set();
      const assignBarcode = (typed) => {
        if (!barcodeEnabled) return '';
        const trimmed = typed?.trim();
        if (trimmed) { usedBarcodes.add(trimmed); return trimmed; }
        const bc = nextUniqueBarcode(usedBarcodes);
        usedBarcodes.add(bc);
        return bc;
      };
      // A single variant row has no picker of its own — the item's own
      // Opening Stock field (form.stock) is what's actually edited for it
      // (see that field's comment), and what every Sales/POS/Purchase
      // transaction updates directly for an item with nothing to pick
      // between. The row's own `stock` is kept as a mirror of form.stock
      // purely so it stays a consistent number if the item is later
      // promoted to 2+ variants. A real multi-variant list (2+ rows) is the
      // opposite direction — VariantEditor edits each row's stock directly,
      // and the item's own total is the SUM of all rows, same as before.
      const rawVariants = form.variants?.length ? form.variants : [{ label: 'Default', sku: '', stock: 0, priceOverride: null, barcode: '' }];
      const cleanVariants = activeStockMode === 'variant'
        ? rawVariants.map((v, idx) => ({
            id: v.id || `vr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            label: v.label.trim(), sku: v.sku?.trim() || '',
            stock: rawVariants.length <= 1 && idx === 0 ? (Number(form.stock) || 0) : (Number(v.stock) || 0),
            priceOverride: v.priceOverride === '' || v.priceOverride == null ? null : Number(v.priceOverride),
            barcode: assignBarcode(v.barcode),
          }))
        : [];
      const cleanBatches = activeStockMode === 'batch'
        ? (form.batches || []).map(b => ({
            id: b.id || `bt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            label: b.label.trim(), expiryDate: b.expiryDate || '',
            stock: Number(b.stock) || 0,
            barcode: assignBarcode(b.barcode),
          }))
        : [];
      // The item's own `stock` always stays the true total — every existing
      // stock-alert/low-stock/report check that reads item.stock directly
      // (without knowing about variants/batches) keeps working unchanged.
      const derivedStock = activeStockMode === 'variant'
        ? (cleanVariants.length <= 1 ? (Number(form.stock) || 0) : cleanVariants.reduce((s, v) => s + v.stock, 0))
        : activeStockMode === 'batch'
        ? cleanBatches.reduce((s, b) => s + b.stock, 0)
        : (Number(form.stock) || 0);
      const data = {
        id: editingItem?.id || Date.now(),
        ...form,
        businessId: currentBusiness.id,
        name: form.name.trim(),
        itemType,
        isMembership: itemType === 'membership',
        isComposite: composite,
        gstType: gstOn ? (composite ? 'composite' : gstType) : null,
        category: itemType === 'membership' ? (form.category || 'Membership') : form.category,
        salePrice: Number(form.salePrice) || 0,
        purchasePrice: Number(form.purchasePrice) || 0,
        mrp: Number(form.mrp) || 0,
        discount: form.discount === '' ? 0 : Number(form.discount) || 0,
        taxRate,
        cgstRate: gstOn ? (Number(form.cgstRate) || taxRate / 2) : 0,
        sgstRate: gstOn ? (Number(form.sgstRate) || taxRate / 2) : 0,
        igstRate: gstOn ? (Number(form.igstRate) || taxRate) : 0,
        utgstRate: gstOn ? (Number(form.utgstRate) || taxRate / 2) : 0,
        taxInclusive: gstOn ? !!form.taxInclusive : false,
        // A recipe item has no stock of its own — selling it deducts its
        // components' stock instead (see Sales.jsx/POS.jsx checkout). A
        // variant/batch item's stock is the sum of its rows (derivedStock).
        stock: (itemType === 'service' || cleanRecipe.length > 0) ? 0 : derivedStock,
        itemCode: form.itemCode?.trim() || '',
        barcodeExtraFields: form.barcodeExtraFields || [],
        recipe: cleanRecipe,
        // Variant / batch stock tracking — mutually exclusive with each
        // other, recipe, and only meaningful on a product. Sales.jsx/POS.jsx
        // key off stockMode to decide whether to show the variant/batch
        // picker; variants[]/batches[] are only ever non-empty when they're
        // the active mode, so a stale list from a previous mode never lingers.
        stockMode: activeStockMode,
        variants: cleanVariants,
        batches: cleanBatches,
        // Buy-in-bulk / sell-in-pieces: only meaningful for products, only
        // when the toggle is on. Each pack carries its own name, how many
        // sale-units it contains, and its own purchase cost — a Purchase row
        // picks one directly, no separate conversion math anywhere.
        packSizes: (isProduct && buyInBulk)
          ? (form.packSizes || [])
              .filter(p => p.label?.trim() && Number(p.qty) > 0)
              .map(p => ({ id: p.id || `pk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, label: p.label.trim(), qty: Number(p.qty), price: Number(p.price) || 0 }))
          : [],
        barcode: barcodeEnabled
          ? (form.barcode?.trim() || generateUniqueBarcode())
          : (form.barcode?.trim() || ''),
      };
      if (editingItem) await updateItem('items', editingItem.id, data);
      else await addItem('items', data);
      snap(editingItem ? 'Item updated!' : 'Item added!', 'success');
      onSaved?.(data);
      onClose();
    } catch { snap('Error saving. Please try again.'); }
  };

  const isService = itemType === 'service';
  const isMembership = itemType === 'membership';
  const isProduct = itemType === 'product';

  const hasRecipe = isProduct && (form.recipe || []).length > 0;

  // Switches between the two stock-tracking modes (Variants is always at
  // least 1 row; Batches is a separate expiry-lot list). Coming FROM
  // Variants with a real single-variant stock number already entered,
  // offer to carry it into a first batch instead of silently discarding it
  // — the actual carry-over happens once the user confirms via the
  // migratePrompt dialog. A multi-variant item (2+ rows) has no single
  // number to carry, so it just clears straight to an empty batch list.
  const switchStockMode = (newMode) => {
    if (newMode === stockMode) return;
    const singleVariantStock = Number(form.stock) || 0;
    if (newMode === 'batch' && stockMode === 'variant' && (form.variants || []).length <= 1 && singleVariantStock > 0) {
      setMigratePrompt({ toMode: newMode });
      return;
    }
    if (newMode === 'variant') {
      setStockMode('variant');
      set({ batches: [], variants: [{ id: `vr_${Date.now()}`, label: 'Default', sku: '', stock: 0, priceOverride: null, barcode: '' }] });
      return;
    }
    setStockMode(newMode);
    set({ variants: [], batches: [] });
  };
  // Candidate components: other products in this business, excluding the item
  // being edited itself (no self-reference) and excluding any item that
  // already has its own recipe (keeps this to one level, no circular BOMs).
  const recipeCandidates = React.useMemo(() => (
    getItems('items').filter(it =>
      it.businessId === currentBusiness?.id &&
      (it.itemType || 'product') === 'product' &&
      String(it.id) !== String(editingItem?.id) &&
      !(Array.isArray(it.recipe) && it.recipe.length > 0)
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [currentBusiness?.id, editingItem?.id, data.items]);

  // Inline category menu items — NOT a sub-component (avoids re-mount on every render)
  const catMenuItems = [
    <MenuItem key="__none__" value="">None</MenuItem>,
    ...builtins.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>),
    ...(customCats.length > 0 ? [<Divider key="__div1__" sx={{ my: 0.5 }} />] : []),
    ...customCats.map(c => (
      <MenuItem key={`custom_${c}`} value={c}
        sx={{ display: 'flex', justifyContent: 'space-between', pr: 0.5 }}>
        <span>{c}</span>
        <IconButton size="small"
          onMouseDown={e => { e.stopPropagation(); e.preventDefault(); delCat(c); }}
          sx={{ p: 0.25, color: 'text.disabled', '&:hover': { color: 'error.main' } }}>
          <X size={12} />
        </IconButton>
      </MenuItem>
    )),
    ...(itemCats.inUse.length > 0 ? [
      <Divider key="__div_inuse__" sx={{ my: 0.5 }} />,
      ...itemCats.inUse.map(c => <MenuItem key={`inuse_${c}`} value={c}>{c}</MenuItem>),
    ] : []),
    ...(form.category && !itemCats.all.some(c => c.toLowerCase() === String(form.category).toLowerCase())
      ? [<MenuItem key="__current__" value={form.category}>{form.category}</MenuItem>] : []),
    <Divider key="__div2__" sx={{ my: 0.5 }} />,
    showNewCat ? (
      <Box key="__new_input__" sx={{ px: 1.5, py: 0.75, display: 'flex', gap: 0.75 }}
        onKeyDown={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}>
        <TextField autoFocus size="small" placeholder="Category name" value={newCatVal}
          onChange={e => setNewCatVal(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); addCat(newCatVal); }
            if (e.key === 'Escape') { setShowNewCat(false); setNewCatVal(''); }
          }}
          sx={{ flex: 1, '& .MuiInputBase-input': { fontSize: '0.8rem', py: 0.6 } }} />
        <Button size="small" variant="contained" onClick={() => addCat(newCatVal)}
          sx={{ minWidth: 0, px: 1.5, py: 0.4, fontSize: '0.75rem', flexShrink: 0 }}>Add</Button>
      </Box>
    ) : (
      <MenuItem key="__add_new__"
        onMouseDown={() => { setShowNewCat(true); setNewCatVal(''); }}
        sx={{ color: 'primary.main', fontWeight: 600, fontSize: '0.82rem', gap: 0.75 }}>
        <Plus size={13} /> New category
      </MenuItem>
    ),
  ];

  return (
    <>
      <Dialog
        open={open} onClose={onClose} maxWidth="sm" fullWidth
        fullScreen={isMobile}
        PaperProps={{ sx: { borderRadius: isMobile ? 0 : 3, boxShadow: '0 20px 60px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', overflow: 'hidden', maxHeight: '92vh' } }}
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>

          {/* ── Header ── */}
          <Box sx={{ background: '#ffffff', borderBottom: '1px solid #ece2db', px: 2.5, py: 1.75, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <Box sx={{ bgcolor: '#5f4f47', borderRadius: 1.5, p: 0.6, display: 'flex' }}>
                {editingItem ? <Edit2 size={16} color="#5c1f22" /> : <Plus size={16} color="#5c1f22" />}
              </Box>
              <Box>
                <Typography sx={{ color: '#5c1f22', fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.2 }}>
                  {editingItem ? 'Edit Item' : 'Add New Item'}
                </Typography>
                {editingItem && (
                  <Typography sx={{ color: '#57433e', fontSize: '0.7rem', lineHeight: 1.3 }}>
                    {editingItem.name}
                  </Typography>
                )}
              </Box>
            </Box>
            <IconButton size="small" onClick={onClose}
              sx={{ color: '#57433e', '&:hover': { bgcolor: 'rgba(92,31,34,0.08)' } }}>
              <CloseIcon size={17} />
            </IconButton>
          </Box>

          {/* ── Type Toggle ── */}
          <Box sx={{ px: 2, pt: 1.5, pb: 1.25, flexShrink: 0, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', bgcolor: alpha(primary, 0.06), borderRadius: 2, p: 0.35, gap: 0.35, border: '1px solid', borderColor: alpha(primary, 0.12) }}>
              {ITEM_TYPES.map(({ key, label, icon: Icon }) => (
                <Box key={key}
                  onClick={() => { setItemType(key); set({ category: '' }); setShowNewCat(false); setNewCatVal(''); }}
                  sx={{
                    flex: 1, py: 0.65, borderRadius: 1.5, cursor: 'pointer', userSelect: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.6,
                    bgcolor: itemType === key ? 'background.paper' : 'transparent',
                    boxShadow: itemType === key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    color: itemType === key ? 'primary.main' : 'text.secondary',
                    fontWeight: itemType === key ? 700 : 500,
                    fontSize: '0.78rem', transition: 'all 0.12s',
                  }}>
                  <Icon size={13} />
                  {label}
                </Box>
              ))}
            </Box>
          </Box>

          {/* ── Scrollable body ── */}
          <DialogContent sx={{ p: 0, overflowY: 'auto', flex: 1 }}>

            {/* ═══ BASIC INFO ═══ */}
            <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
              <SectionHead icon={Package}
                label={isService ? 'Service Info' : isMembership ? 'Plan Info' : 'Basic Info'}
                primary={primary}
                action={!isProduct ? null : (
                  <IconButton size="small" onClick={() => setMgrOpen(true)}
                    sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main', bgcolor: alpha(primary, 0.08) } }}>
                    <FolderOpen size={14} />
                  </IconButton>
                )}
              />
              <Grid container spacing={1.25}>
                <Grid size={{ xs: 12 }}>
                  <TextField size="small" fullWidth required
                    label={isService ? 'Service Name' : isMembership ? 'Plan Name' : 'Item Name'}
                    value={form.name} autoFocus
                    placeholder={ctx.namePlaceholder}
                    onChange={e => set({ name: e.target.value })}
                    sx={fsx} />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <TextField size="small" fullWidth label={ctx.codeLabel}
                    value={form.itemCode || ''} placeholder={ctx.codePlaceholder}
                    onChange={e => set({ itemCode: e.target.value })}
                    // Reserves the same helper-text line height as HSN Code's
                    // real one below, so the two fields' input boxes line up
                    // and this row doesn't leave a ragged gap before the next.
                    helperText={<Box component="span" sx={{ visibility: 'hidden' }}>·</Box>}
                    sx={fsx} />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <TextField size="small" fullWidth label={ctx.hsnLabel}
                    value={form.hsnCode || ''}
                    onChange={e => set({ hsnCode: e.target.value })}
                    placeholder={ctx.hsnPlaceholder}
                    helperText={ctx.hsnHelper}
                    sx={fsx} />
                </Grid>
                {isProduct && (
                  <Grid size={{ xs: 6 }}>
                    <TextField size="small" fullWidth select label="Unit of Measure"
                      value={form.unit}
                      onChange={e => set({ unit: e.target.value })}
                      helperText={`Selected: ${UNIT_FULL[form.unit] || form.unit}`}
                      sx={fsx}>
                      {UNITS.map(u => <MenuItem key={u} value={u}>{UNIT_FULL[u] || u}</MenuItem>)}
                    </TextField>
                  </Grid>
                )}
                <Grid size={{ xs: isProduct ? 6 : 12 }}>
                  <TextField size="small" fullWidth select
                    label={isMembership ? 'Plan Type' : 'Category'}
                    value={form.category || ''}
                    onChange={e => {
                      const v = e.target.value;
                      if (v !== '__add__') set({ category: v });
                    }}
                    // Same reserved-height spacer as Item/Article Code above —
                    // Unit of Measure (this field's row sibling when isProduct)
                    // always shows a real "Selected: …" helper line, so this
                    // field needs a matching invisible one to avoid a ragged
                    // row and a dead-space gap before Description.
                    helperText={isProduct ? <Box component="span" sx={{ visibility: 'hidden' }}>·</Box> : ''}
                    InputLabelProps={{ shrink: true }}
                    SelectProps={{
                      displayEmpty: true,
                      notched: true,
                      renderValue: v => v || <span style={{ color: '#aaa' }}>None</span>,
                      MenuProps: { PaperProps: { sx: { maxHeight: 300 } } },
                    }}
                    sx={fsx}>
                    {catMenuItems}
                  </TextField>
                </Grid>
                {isMembership && (
                  <Grid size={{ xs: 6 }}>
                    <TextField size="small" fullWidth label="Duration"
                      value={form.size || ''}
                      onChange={e => set({ size: e.target.value })}
                      placeholder="e.g. 30 Days, 1 Year"
                      InputProps={{ startAdornment: <InputAdornment position="start"><Ruler size={13} color="#9ca3af" /></InputAdornment> }}
                      helperText="Membership period length"
                      sx={fsx} />
                  </Grid>
                )}
                <Grid size={{ xs: 12 }}>
                  <TextField size="small" fullWidth multiline rows={2}
                    label={isService ? 'Service Description' : isMembership ? 'Plan Details' : 'Description / Notes'}
                    value={form.description || ''}
                    onChange={e => set({ description: e.target.value })}
                    placeholder={ctx.namePlaceholder.replace('e.g. ', 'e.g. describe ')}
                    sx={fsx} />
                </Grid>
              </Grid>
            </Box>

            {/* ═══ PRICING ═══ */}
            <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid', borderColor: 'divider', bgcolor: alpha(primary, 0.015) }}>
              <SectionHead icon={TrendingUp} label="Pricing" primary={primary} />
              <Grid container spacing={1.25}>
                <Grid size={{ xs: 6 }}>
                  <TextField size="small" fullWidth type="number" label={ctx.salePriceLabel}
                    value={form.salePrice}
                    onChange={e => set({ salePrice: e.target.value })}
                    helperText={config.itemDefaults?.autoUpdateSalePrice
                      ? <Box component="span" sx={{ color: primary, fontWeight: 700 }}>{ctx.salePriceHelper} · From Last Price</Box>
                      : ctx.salePriceHelper}
                    InputProps={{ startAdornment: <InputAdornment position="start"><Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>₹</Typography></InputAdornment> }}
                    sx={fsx} />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <TextField size="small" fullWidth type="number"
                    label={isMembership ? 'Listed Price (MRP)' : 'MRP'}
                    value={form.mrp ?? ''}
                    onChange={e => set({ mrp: e.target.value })}
                    placeholder="Max retail price"
                    InputProps={{ startAdornment: <InputAdornment position="start"><Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>₹</Typography></InputAdornment> }}
                    helperText={form.mrp && Number(form.mrp) > 0 && Number(form.salePrice) > 0
                      ? <Box component="span" sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                          <Typography component="span" sx={{ fontSize: '0.68rem', textDecoration: 'line-through', color: 'text.disabled' }}>₹{Number(form.mrp).toLocaleString('en-IN')}</Typography>
                          <Typography component="span" sx={{ fontSize: '0.68rem', color: 'success.main', fontWeight: 700 }}>₹{Number(form.salePrice).toLocaleString('en-IN')}</Typography>
                        </Box>
                      : 'For barcode label'}
                    sx={fsx} />
                </Grid>
                {isProduct && (
                  <Grid size={{ xs: 6 }}>
                    <TextField size="small" fullWidth type="number" label="Purchase / Cost Price"
                      value={form.purchasePrice}
                      onChange={e => canViewPurchase && set({ purchasePrice: e.target.value })}
                      helperText={config.itemDefaults?.autoUpdatePurchasePrice
                        ? <Box component="span" sx={{ color: primary, fontWeight: 700 }}>Your cost from supplier · From Last Price</Box>
                        : "Your cost from supplier"}
                      InputProps={{
                        startAdornment: <InputAdornment position="start"><Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>₹</Typography></InputAdornment>,
                        readOnly: !canViewPurchase,
                      }}
                      inputProps={!canViewPurchase ? { style: { filter: 'blur(5px)', userSelect: 'none' } } : undefined}
                      sx={fsx} />
                  </Grid>
                )}
                <Grid size={{ xs: 6 }}>
                  <TextField size="small" fullWidth type="number" label="Default Discount"
                    value={form.discount ?? ''}
                    onChange={e => set({ discount: e.target.value === '' ? '' : e.target.value })}
                    placeholder="0"
                    helperText={ctx.discountHelper}
                    InputProps={{ endAdornment: <InputAdornment position="end"><Typography sx={{ fontSize: '0.82rem', color: 'text.secondary' }}>%</Typography></InputAdornment> }}
                    sx={fsx} />
                </Grid>
                {isProduct && (
                  // xs:12 — this is the last field in the row and has no
                  // natural pair, so a half-width xs:6 here would leave the
                  // other half of the row empty (a real gap, not spacing).
                  <Grid size={{ xs: 12 }}>
                    <TextField size="small" fullWidth type="number" label="Min Stock Alert"
                      value={form.minStock || ''}
                      placeholder="5"
                      helperText="Alert when stock falls below this"
                      onChange={e => set({ minStock: e.target.value === '' ? '' : Number(e.target.value) })}
                      sx={{ ...fsx, maxWidth: { sm: 'calc(50% - 8px)' } }} />
                  </Grid>
                )}

                {/* Buy in bulk (Box/Carton/Sack), sell in pieces (Pcs/Kg/Nos) —
                    the item's own Unit of Measure above is always the SALE
                    unit and what stock is tracked in everywhere else in the
                    app. Each pack size below is a named way this item is
                    actually purchased (e.g. "Box" = 10 Pcs at ₹450), with its
                    own cost — a Purchase row picks one directly, no
                    conversion math for the user to do or get wrong. An item
                    can have several packs at once (Carton, Box, Loose). */}
                {isProduct && (
                  <Grid size={{ xs: 12 }}>
                    <Box
                      onClick={() => {
                        const next = !buyInBulk;
                        setBuyInBulk(next);
                        if (next && !(form.packSizes || []).length) {
                          set({ packSizes: [{ id: `pk_${Date.now()}`, label: '', qty: '', price: '' }] });
                        }
                      }}
                      sx={{
                        display: 'flex', alignItems: 'center', gap: 1.25, px: 1.25, py: 1,
                        borderRadius: `${radius}px`, cursor: 'pointer',
                        border: '1px solid', borderColor: buyInBulk ? alpha(primary, 0.3) : 'divider',
                        bgcolor: buyInBulk ? alpha(primary, 0.06) : 'background.paper',
                      }}
                    >
                      <Package size={16} color={buyInBulk ? primary : '#5f4f47'} />
                      <Box sx={{ flex: 1 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', color: buyInBulk ? primary : 'text.primary' }}>
                          Buy in bulk, sell in pieces
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          e.g. purchase by the Box or Carton — stock stays tracked in {UNIT_FULL[form.unit] || form.unit || 'the sale unit'}
                        </Typography>
                      </Box>
                      <Switch size="small" checked={buyInBulk} onClick={e => e.stopPropagation()}
                        onChange={e => {
                          const next = e.target.checked;
                          setBuyInBulk(next);
                          if (next && !(form.packSizes || []).length) {
                            set({ packSizes: [{ id: `pk_${Date.now()}`, label: '', qty: '', price: '' }] });
                          }
                        }} />
                    </Box>

                    <Collapse in={buyInBulk} timeout={180}>
                      <Box sx={{ mt: 1.25, p: 1.25, borderRadius: `${radius}px`, border: '1px solid', borderColor: alpha(primary, 0.15), bgcolor: alpha(primary, 0.02) }}>
                        <Stack spacing={1}>
                          {(form.packSizes || []).map((pack, idx) => {
                            const qtyNum = Number(pack.qty) || 0;
                            const priceNum = Number(pack.price) || 0;
                            const perUnit = qtyNum > 0 && priceNum > 0 ? priceNum / qtyNum : null;
                            const update = (patch) => {
                              const next = [...form.packSizes];
                              next[idx] = { ...next[idx], ...patch };
                              set({ packSizes: next });
                            };
                            return (
                              <Box key={pack.id || idx} sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-start' }}>
                                <TextField size="small" label="Pack name" placeholder="Box, Carton…"
                                  value={pack.label || ''}
                                  onChange={e => update({ label: e.target.value })}
                                  sx={{ ...fsx, flex: '1 1 90px', minWidth: 0 }} />
                                <TextField size="small" type="number" label={`= how many ${form.unit || 'units'}`}
                                  placeholder="e.g. 10"
                                  value={pack.qty ?? ''}
                                  onChange={e => update({ qty: e.target.value })}
                                  sx={{ ...fsx, flex: '1 1 90px', minWidth: 0 }} />
                                <TextField size="small" type="number" label="Cost / pack"
                                  placeholder="e.g. 450"
                                  value={pack.price ?? ''}
                                  onChange={e => update({ price: e.target.value })}
                                  InputProps={{ startAdornment: <InputAdornment position="start"><Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>₹</Typography></InputAdornment> }}
                                  sx={{ ...fsx, flex: '1 1 100px', minWidth: 0 }} />
                                <Box sx={{ display: 'flex', alignItems: 'center', height: 40, minWidth: 74, justifyContent: 'flex-end' }}>
                                  {perUnit != null ? (
                                    <Typography variant="caption" sx={{ color: primary, fontWeight: 700, whiteSpace: 'nowrap' }}>
                                      ₹{perUnit.toFixed(2)}/{form.unit}
                                    </Typography>
                                  ) : null}
                                  <IconButton size="small" onClick={() => set({ packSizes: form.packSizes.filter((_, i) => i !== idx) })} sx={{ color: 'text.disabled', ml: 0.25 }}>
                                    <Trash2 size={15} />
                                  </IconButton>
                                </Box>
                              </Box>
                            );
                          })}
                        </Stack>
                        <Button
                          size="small"
                          startIcon={<Plus size={14} />}
                          onClick={() => set({ packSizes: [...(form.packSizes || []), { id: `pk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, label: '', qty: '', price: '' }] })}
                          sx={{ mt: 1, textTransform: 'none', fontSize: '0.78rem' }}
                        >
                          Add another pack size
                        </Button>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
                          On a Purchase Bill, pick one of these packs as the row's unit — price and stock added both come from it automatically.
                        </Typography>
                      </Box>
                    </Collapse>
                  </Grid>
                )}

                {/* Buy in bulk (Sack/Carton/Box), sell in pieces (Kg/Pcs/Nos) —
                    the item's own Unit of Measure above is always the SALE
                    unit and what stock is tracked in everywhere else in the
                    app; this just lets a purchase bill be entered in a
                    bigger unit and have it convert automatically. */}
                {isProduct && (
                  <Grid size={{ xs: 12 }}>
                    <Box
                      onClick={() => {
                        const next = !buyInBulk;
                        setBuyInBulk(next);
                        if (next && !form.purchaseUnit) set({ purchaseUnit: UNITS.find(u => u !== form.unit) || UNITS[0] });
                      }}
                      sx={{
                        display: 'flex', alignItems: 'center', gap: 1.25, px: 1.25, py: 1,
                        borderRadius: `${radius}px`, cursor: 'pointer',
                        border: '1px solid', borderColor: buyInBulk ? alpha(primary, 0.3) : 'divider',
                        bgcolor: buyInBulk ? alpha(primary, 0.06) : 'background.paper',
                      }}
                    >
                      <Package size={16} color={buyInBulk ? primary : '#5f4f47'} />
                      <Box sx={{ flex: 1 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', color: buyInBulk ? primary : 'text.primary' }}>
                          Buy in bulk, sell in pieces
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          e.g. purchase by the Sack, sell by the Kg — stock stays tracked in {UNIT_FULL[form.unit] || form.unit || 'the sale unit'}
                        </Typography>
                      </Box>
                      <Switch size="small" checked={buyInBulk} onClick={e => e.stopPropagation()}
                        onChange={e => {
                          const next = e.target.checked;
                          setBuyInBulk(next);
                          if (next && !form.purchaseUnit) set({ purchaseUnit: UNITS.find(u => u !== form.unit) || UNITS[0] });
                        }} />
                    </Box>

                    <Collapse in={buyInBulk} timeout={180}>
                      <Box sx={{ mt: 1.25, p: 1.25, borderRadius: `${radius}px`, border: '1px solid', borderColor: alpha(primary, 0.15), bgcolor: alpha(primary, 0.02) }}>
                        <Grid container spacing={1.25} alignItems="center">
                          <Grid size={{ xs: 6, sm: 4 }}>
                            <TextField size="small" fullWidth select label="Purchase Unit"
                              value={form.purchaseUnit || ''}
                              onChange={e => set({ purchaseUnit: e.target.value })}
                              sx={fsx}>
                              {UNITS.map(u => <MenuItem key={u} value={u}>{UNIT_FULL[u] || u}</MenuItem>)}
                            </TextField>
                          </Grid>
                          <Grid size={{ xs: 6, sm: 4 }}>
                            <TextField size="small" fullWidth type="number" label={`= how many ${form.unit || 'units'}?`}
                              value={form.purchaseUnitConversion ?? ''}
                              placeholder="e.g. 50"
                              onChange={e => set({ purchaseUnitConversion: e.target.value })}
                              InputProps={{ endAdornment: <InputAdornment position="end"><Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{form.unit}</Typography></InputAdornment> }}
                              sx={fsx} />
                          </Grid>
                          <Grid size={{ xs: 12, sm: 4 }}>
                            {form.purchaseUnit === form.unit ? (
                              <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 600, display: 'block', lineHeight: 1.4 }}>
                                Pick a different Purchase Unit than the sale Unit of Measure above.
                              </Typography>
                            ) : Number(form.purchaseUnitConversion) > 0 && Number(form.purchasePrice) > 0 ? (
                              <Box>
                                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>Effective cost</Typography>
                                <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: primary }}>
                                  ₹{(Number(form.purchasePrice) / Number(form.purchaseUnitConversion)).toFixed(2)} / {form.unit}
                                </Typography>
                              </Box>
                            ) : (
                              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.4 }}>
                                1 {form.purchaseUnit || 'unit'} = {form.purchaseUnitConversion || '?'} {form.unit}
                              </Typography>
                            )}
                          </Grid>
                        </Grid>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
                          On a Purchase Bill, pick "{form.purchaseUnit || 'this'}" as the row's unit and stock adds up automatically in {form.unit || 'the sale unit'} — no manual maths.
                        </Typography>
                      </Box>
                    </Collapse>
                  </Grid>
                )}
              </Grid>
            </Box>

            {/* ═══ GST / TAX ═══ */}
            <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
              <SectionHead icon={Percent}
                label={isService ? 'GST on Service' : isMembership ? 'GST on Membership' : 'GST / Tax'}
                primary={primary}
                action={
                  <FormControlLabel
                    control={
                      <Switch size="small" checked={gstOn}
                        onChange={e => { setGstOn(e.target.checked); if (!e.target.checked) setComposite(false); }}
                        color="primary" />
                    }
                    label={
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: gstOn ? 'primary.main' : 'text.disabled' }}>
                        {gstOn ? 'GST On' : 'GST Off'}
                      </Typography>
                    }
                    labelPlacement="start"
                    sx={{ m: 0, gap: 0.5 }}
                  />
                }
              />
              {!gstOn && (
                <Typography variant="caption" color="text.secondary">
                  {ctx.gstHelper} — toggle on to configure.
                </Typography>
              )}
              <Collapse in={gstOn} timeout={180}>
                <Grid container spacing={1.25}>
                  <Grid size={{ xs: 12 }}>
                    <TextField size="small" fullWidth select label="Tax Rate"
                      value={form.taxRate}
                      onChange={e => {
                        const tx = Number(e.target.value);
                        set({ taxRate: tx, cgstRate: tx / 2, sgstRate: tx / 2, igstRate: tx });
                      }}
                      helperText={isService ? 'Most services fall under 18%' : isMembership ? 'Memberships typically 18%' : 'Choose applicable GST slab'}
                      SelectProps={{ MenuProps: { PaperProps: { sx: { maxHeight: 300 } } } }}
                      sx={fsx}>
                      {GST_RATES.map(r => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
                    </TextField>
                  </Grid>

                  {/* Tax inclusive / exclusive default */}
                  <Grid size={{ xs: 12 }}>
                    <Box sx={{ borderRadius: 1.5, border: '1px solid', borderColor: alpha(primary, 0.2), overflow: 'hidden' }}>
                      {/* Toggle row */}
                      <Box sx={{ display: 'flex', bgcolor: alpha(primary, 0.04) }}>
                        {[
                          { value: false, label: 'Excl. GST', short: 'Exclusive' },
                          { value: true,  label: 'Incl. GST', short: 'Inclusive' },
                        ].map(opt => {
                          const active = !!form.taxInclusive === opt.value;
                          return (
                            <Box key={String(opt.value)}
                              onClick={() => set({ taxInclusive: opt.value })}
                              sx={{
                                flex: 1, py: 0.75, textAlign: 'center', cursor: 'pointer', userSelect: 'none',
                                bgcolor: active ? primary : 'transparent',
                                color: active ? '#fff' : 'text.secondary',
                                fontWeight: 700, fontSize: '0.78rem',
                                transition: 'all 0.15s',
                                borderRight: opt.value === false ? `1px solid ${alpha(primary, 0.2)}` : 'none',
                                '&:hover': { bgcolor: active ? primary : alpha(primary, 0.1) },
                              }}>
                              {opt.label}
                            </Box>
                          );
                        })}
                      </Box>
                      {/* Explanation */}
                      <Box sx={{ px: 1.5, py: 1 }}>
                        {!form.taxInclusive ? (
                          <Box>
                            <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'text.primary', mb: 0.3 }}>
                              GST is added on top of the sale price
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                              The sale price you enter is the base price before tax. GST is calculated and added on top when billing.
                            </Typography>
                          </Box>
                        ) : (
                          <Box>
                            <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'text.primary', mb: 0.3 }}>
                              Sale price already includes GST
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                              The sale price you enter is the final amount the customer pays. GST will be extracted from it for tax reporting.
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    </Box>
                  </Grid>

                  {/* Composite — only relevant for products */}
                  {isProduct && (
                    <Grid size={{ xs: 12 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, py: 0.75, borderRadius: 1.5, border: '1px solid', borderColor: alpha(primary, 0.18), bgcolor: alpha(primary, 0.04) }}>
                        <Box>
                          <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, lineHeight: 1.3 }}>Composite Scheme</Typography>
                          <Typography variant="caption" color="text.secondary">Flat rate · no input tax credit · turnover &lt; ₹1.5Cr</Typography>
                        </Box>
                        <Switch size="small" checked={composite} onChange={e => setComposite(e.target.checked)} color="primary" />
                      </Box>
                    </Grid>
                  )}

                  {!composite && (
                    <Grid size={{ xs: 12 }}>
                      {/* GST Type selector */}
                      <Box sx={{ display: 'flex', borderRadius: 1.5, overflow: 'hidden', border: '1px solid', borderColor: alpha(primary, 0.25), mb: 1.25 }}>
                        {[
                          { value: 'cgst_sgst', label: 'Intra-state', sub: 'CGST + SGST' },
                          { value: 'igst',      label: 'Inter-state', sub: 'IGST' },
                          { value: 'utgst',     label: 'Union Territory', sub: 'CGST + UTGST' },
                        ].map((opt, i) => {
                          const active = gstType === opt.value;
                          return (
                            <Box key={opt.value} onClick={() => setGstType(opt.value)} sx={{
                              flex: 1, py: 0.75, px: 0.5, textAlign: 'center', cursor: 'pointer', userSelect: 'none',
                              bgcolor: active ? primary : 'transparent',
                              borderRight: i < 2 ? `1px solid ${alpha(primary, 0.25)}` : 'none',
                              transition: 'all 0.15s',
                              '&:hover': { bgcolor: active ? primary : alpha(primary, 0.07) },
                            }}>
                              <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: active ? '#fff' : 'text.secondary', lineHeight: 1.2 }}>{opt.label}</Typography>
                              <Typography sx={{ fontSize: '0.6rem', color: active ? 'rgba(255,255,255,0.75)' : 'text.disabled', lineHeight: 1.2 }}>{opt.sub}</Typography>
                            </Box>
                          );
                        })}
                      </Box>

                      {/* Breakdown for selected type */}
                      <Box sx={{ borderRadius: 1.5, border: '1px solid', borderColor: alpha(primary, 0.15), bgcolor: alpha(primary, 0.03), px: 1.5, py: 1.25 }}>
                        {gstType === 'cgst_sgst' && (
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <TextField size="small" label="CGST %" type="number" fullWidth
                              value={form.cgstRate}
                              onChange={e => { const raw = e.target.value; if (raw === '') { set({ cgstRate: '', sgstRate: '', taxRate: '', igstRate: '', utgstRate: '' }); return; } const v = Number(raw) || 0; set({ cgstRate: v, sgstRate: v, taxRate: v * 2, igstRate: v * 2, utgstRate: v }); }}
                              InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }} />
                            <TextField size="small" label="SGST %" type="number" fullWidth
                              value={form.sgstRate}
                              onChange={e => { const raw = e.target.value; if (raw === '') { set({ cgstRate: '', sgstRate: '', taxRate: '', igstRate: '', utgstRate: '' }); return; } const v = Number(raw) || 0; set({ sgstRate: v, cgstRate: v, taxRate: v * 2, igstRate: v * 2, utgstRate: v }); }}
                              InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }} />
                          </Box>
                        )}
                        {gstType === 'igst' && (
                          <TextField size="small" label="IGST %" type="number" fullWidth
                            value={form.igstRate}
                            onChange={e => { const raw = e.target.value; if (raw === '') { set({ igstRate: '', cgstRate: '', sgstRate: '', taxRate: '', utgstRate: '' }); return; } const v = Number(raw) || 0; set({ igstRate: v, cgstRate: v / 2, sgstRate: v / 2, taxRate: v, utgstRate: v / 2 }); }}
                            InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }} />
                        )}
                        {gstType === 'utgst' && (
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <TextField size="small" label="CGST %" type="number" fullWidth
                              value={form.cgstRate}
                              InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                              slotProps={{ input: { readOnly: true } }}
                              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }} />
                            <TextField size="small" label="UTGST %" type="number" fullWidth
                              value={form.utgstRate}
                              onChange={e => { const raw = e.target.value; if (raw === '') { set({ utgstRate: '', cgstRate: '', taxRate: '', igstRate: '', sgstRate: '' }); return; } const v = Number(raw) || 0; set({ utgstRate: v, cgstRate: v, taxRate: v * 2, igstRate: v * 2, sgstRate: v }); }}
                              InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }} />
                          </Box>
                        )}
                      </Box>
                    </Grid>
                  )}
                </Grid>
              </Collapse>
            </Box>

            {/* ═══ INVENTORY (product only) ═══ */}
            {isProduct && (
              <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid', borderColor: 'divider', bgcolor: alpha(primary, 0.015) }}>
                <SectionHead icon={BoxIcon} label="Inventory" primary={primary} />
                <Box
                  onClick={() => {
                    const turningOn = !hasRecipe;
                    if (turningOn) setStockMode('simple');
                    set({ recipe: turningOn ? [{ itemId: '', qtyPerUnit: 1 }] : [] });
                  }}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 1.25, px: 1.25, py: 1, mb: 1.5,
                    borderRadius: `${radius}px`, cursor: 'pointer',
                    border: '1px solid', borderColor: hasRecipe ? alpha(primary, 0.3) : 'divider',
                    bgcolor: hasRecipe ? alpha(primary, 0.06) : 'background.paper',
                  }}
                >
                  <Layers size={16} color={hasRecipe ? primary : '#5f4f47'} />
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', color: hasRecipe ? primary : 'text.primary' }}>
                      Made from other items (recipe)
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      e.g. "Tomato Rice" made of Tomato + Rice — selling this deducts the components instead
                    </Typography>
                  </Box>
                  <Switch size="small" checked={hasRecipe} onClick={e => e.stopPropagation()}
                    onChange={() => {
                      const turningOn = !hasRecipe;
                      if (turningOn) setStockMode('simple');
                      set({ recipe: turningOn ? [{ itemId: '', qtyPerUnit: 1 }] : [] });
                    }} />
                </Box>

                {hasRecipe ? (
                  <Box sx={{ mb: 1.5 }}>
                    {(form.recipe || []).map((r, idx) => {
                      const compItem = recipeCandidates.find(i => String(i.id) === String(r.itemId));
                      return (
                        <Stack direction="row" spacing={1} key={idx} alignItems="center" sx={{ mb: 0.75 }}>
                          <Box sx={{ flex: 1.4 }}>
                            <ItemSelect
                              options={recipeCandidates}
                              value={compItem || null}
                              onChange={(v) => {
                                // ItemSelect is freeSolo+autoSelect — onChange can fire with a
                                // plain typed string (typed then blurred/tabbed instead of
                                // clicking the highlighted match) instead of the item object.
                                // Resolve it against recipeCandidates by name first so a real
                                // selection isn't silently discarded.
                                const rows = [...(form.recipe || [])];
                                if (typeof v === 'string') {
                                  const match = recipeCandidates.find(i => i.name?.toLowerCase() === v.trim().toLowerCase());
                                  rows[idx] = { ...rows[idx], itemId: match ? match.id : '' };
                                } else {
                                  rows[idx] = { ...rows[idx], itemId: v?.id || '' };
                                }
                                set({ recipe: rows });
                              }}
                              placeholder="Component item…"
                              sx={fsx}
                            />
                          </Box>
                          <TextField size="small" type="number" label="Qty / unit sold"
                            value={r.qtyPerUnit}
                            placeholder="0"
                            onChange={e => { const rows = [...(form.recipe || [])]; rows[idx] = { ...rows[idx], qtyPerUnit: e.target.value }; set({ recipe: rows }); }}
                            InputProps={{ endAdornment: compItem?.unit ? <InputAdornment position="end">{compItem.unit}</InputAdornment> : null }}
                            sx={{ width: 150, flexShrink: 0, ...fsx }} />
                          <IconButton size="small" color="error"
                            onClick={() => set({ recipe: (form.recipe || []).filter((_, i) => i !== idx) })}>
                            <Trash2 size={15} />
                          </IconButton>
                        </Stack>
                      );
                    })}
                    <Button size="small" startIcon={<Plus size={13} />} sx={{ mt: 0.5, fontSize: '0.78rem' }}
                      onClick={() => set({ recipe: [...(form.recipe || []), { itemId: '', qtyPerUnit: 1 }] })}>
                      Add component
                    </Button>
                  </Box>
                ) : (
                  <Box>
                    {/* Stock tracking mode — mutually exclusive. Variants is
                        always on: a single row behaves exactly like the old
                        "Simple" one-number mode (no variant picker forced in
                        Sales/POS — see stockRows() there), a Color/Size/
                        Variant description lives in that row's own label,
                        and adding a 2nd row promotes it to full per-variant
                        stock tracking. Batches is a separate, unrelated mode
                        for expiry-lot tracking. */}
                    <ToggleButtonGroup
                      exclusive size="small" value={stockMode}
                      onChange={(_, v) => v && switchStockMode(v)}
                      sx={{ mb: 1.5, width: '100%', '& .MuiToggleButtonGroup-grouped': { flex: 1, textTransform: 'none', fontSize: '0.76rem', fontWeight: 700, py: 0.6 } }}
                    >
                      <ToggleButton value="variant"><Palette size={13} style={{ marginRight: 5 }} />Variants</ToggleButton>
                      <ToggleButton value="batch"><Package size={13} style={{ marginRight: 5 }} />Batches / Expiry</ToggleButton>
                    </ToggleButtonGroup>

                    {stockMode === 'variant' && (form.variants || []).length <= 1 ? (
                      <Box>
                        <Grid container spacing={1.25}>
                          <Grid size={{ xs: 6 }}>
                            {/* Reads/writes form.stock directly (not the variant
                                row's own stock) — this is what keeps a
                                single-variant item's number in sync with every
                                Sales/POS/Purchase transaction, which always
                                writes straight to item.stock for an item with
                                no real picker to choose between (see
                                stockRows() in Sales.jsx/POS.jsx). The single
                                variant row mirrors this value at save time,
                                purely so Sales/POS/Reports' variant-aware
                                code paths still see a consistent number if the
                                item is later promoted to 2+ variants. */}
                            <TextField size="small" fullWidth type="number" label="Opening Stock"
                              value={form.stock ?? ''}
                              helperText="Current stock on hand"
                              onChange={e => set({ stock: e.target.value })}
                              sx={fsx} />
                          </Grid>
                          <Grid size={{ xs: 6 }}>
                            <TextField size="small" fullWidth label="Batch / Lot No."
                              value={form.batchNo || ''} placeholder="BT-001"
                              helperText="Manufacturer batch number"
                              onChange={e => set({ batchNo: e.target.value })}
                              sx={fsx} />
                          </Grid>
                          <Grid size={{ xs: 12 }}>
                            <TextField size="small" fullWidth type="date" label="Expiry Date"
                              value={form.expiryDate || ''}
                              helperText="Leave blank if not applicable"
                              onChange={e => set({ expiryDate: e.target.value })}
                              InputLabelProps={{ shrink: true }}
                              sx={fsx} />
                          </Grid>
                        </Grid>
                        <Button size="small" startIcon={<Plus size={13} />} sx={{ mt: 1.25, fontSize: '0.78rem' }}
                          onClick={() => {
                            // The existing single row's own stock may be stale
                            // (see the Opening Stock field's comment above) —
                            // carry form.stock over as the true current number
                            // for this first row instead.
                            const existing = form.variants?.[0] || { id: `vr_${Date.now()}`, label: 'Default', sku: '', priceOverride: null, barcode: '' };
                            const row = { ...existing, stock: form.stock };
                            set({ variants: [row, { id: `vr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, label: '', sku: '', stock: '', priceOverride: '', barcode: '' }] });
                          }}>
                          Sell as multiple variants (Color, Size…)
                        </Button>
                      </Box>
                    ) : stockMode === 'variant' ? (
                      <VariantEditor form={form} set={set} fsx={fsx} primary={primary}
                        barcodeEnabled={barcodeEnabled}
                        nextUniqueBarcode={nextRowBarcode}
                        barcodeError={rowBarcodeError(form.variants || [])} />
                    ) : null}

                    {stockMode === 'batch' && (
                      <BatchEditor form={form} set={set} fsx={fsx} primary={primary}
                        barcodeEnabled={barcodeEnabled}
                        nextUniqueBarcode={nextRowBarcode}
                        barcodeError={rowBarcodeError(form.batches || [])} />
                    )}
                  </Box>
                )}
              </Box>
            )}

            {/* Prompt shown when switching a Simple item (with real stock
                already entered) into Variant/Batch mode — offers to carry
                that number into a first row instead of silently zeroing it. */}
            <Dialog open={!!migratePrompt} onClose={() => setMigratePrompt(null)} maxWidth="xs" fullWidth
              PaperProps={{ sx: { borderRadius: 2.5 } }}>
              <Box sx={{ p: 2.5 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', mb: 1 }}>
                  Carry over current stock?
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                  This item currently has <strong>{form.stock || 0} {form.unit}</strong> in stock.
                  Switching to Batches tracks stock separately per batch — carry the current number into a first
                  batch ("Existing stock") so nothing is lost?
                </Typography>
                <Stack direction="row" spacing={1} justifyContent="flex-end">
                  <Button
                    onClick={() => {
                      setStockMode('batch');
                      set({ variants: [], batches: [] });
                      setMigratePrompt(null);
                    }}
                  >
                    Start empty
                  </Button>
                  <Button
                    variant="contained"
                    onClick={() => {
                      const carried = Number(form.stock) || 0;
                      setStockMode('batch');
                      set({ variants: [], batches: [{ id: `bt_${Date.now()}`, label: 'Existing stock', expiryDate: form.expiryDate || '', stock: carried }] });
                      setMigratePrompt(null);
                    }}
                  >
                    Carry over {form.stock || 0} {form.unit}
                  </Button>
                </Stack>
              </Box>
            </Dialog>

            {/* ═══ BARCODE (product + enabled) ═══ */}
            {barcodeEnabled && isProduct && (
              <Box sx={{ px: 2.5, py: 2 }}>
                <SectionHead icon={Barcode} label="Barcode" primary={primary} />
                <TextField size="small" fullWidth label="Barcode Number"
                  value={form.barcode}
                  onChange={e => set({ barcode: e.target.value })}
                  placeholder="Leave blank to auto-generate on save"
                  helperText="Scan or type the barcode; used for POS scanning"
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton size="small" title="Scan barcode" onClick={() => setScanOpen(true)}><ScanLine size={15} /></IconButton>
                        <IconButton size="small" title="Generate unique barcode" onClick={() => set({ barcode: generateUniqueBarcode() })}><RefreshCw size={15} /></IconButton>
                      </InputAdornment>
                    ),
                  }}
                  sx={{ ...fsx, mb: 1.5 }} />

                {(form.barcodeExtraFields || []).map((f, idx) => (
                  <Stack direction="row" spacing={1} key={idx} sx={{ mb: 0.75 }}>
                    <TextField size="small" label="Label" value={f.label}
                      onChange={e => { const fields = [...(form.barcodeExtraFields || [])]; fields[idx] = { ...fields[idx], label: e.target.value }; set({ barcodeExtraFields: fields }); }}
                      sx={{ flex: 1, ...fsx }} />
                    <TextField size="small" label="Value" value={f.value}
                      onChange={e => { const fields = [...(form.barcodeExtraFields || [])]; fields[idx] = { ...fields[idx], value: e.target.value }; set({ barcodeExtraFields: fields }); }}
                      sx={{ flex: 1, ...fsx }} />
                    <IconButton size="small" color="error"
                      onClick={() => set({ barcodeExtraFields: (form.barcodeExtraFields || []).filter((_, i) => i !== idx) })}>
                      <Trash2 size={15} />
                    </IconButton>
                  </Stack>
                ))}
                <Button size="small" startIcon={<Plus size={13} />} sx={{ mt: 0.5, fontSize: '0.78rem' }}
                  onClick={() => set({ barcodeExtraFields: [...(form.barcodeExtraFields || []), { label: '', value: '' }] })}>
                  Add extra field
                </Button>
              </Box>
            )}
          </DialogContent>

          {/* ── Actions ── */}
          <DialogActions sx={{ px: 2.5, py: 1.75, gap: 1, borderTop: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
            <Button onClick={onClose} sx={{ borderRadius: 1.5, color: 'text.secondary' }}>Cancel</Button>
            <Button type="submit" variant="contained"
              sx={{
                borderRadius: 1.5,
                background: '#ffffff', borderBottom: '1px solid #ece2db',
                boxShadow: `0 3px 10px ${alpha(primary, 0.3)}`,
                fontWeight: 700, px: 3,
                '&:hover': { opacity: 0.9, boxShadow: `0 4px 14px ${alpha(primary, 0.4)}` },
              }}>
              {editingItem
                ? 'Save Changes'
                : isService ? 'Add Service' : isMembership ? 'Add Plan' : 'Add Item'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* ── Category Manager ── */}
      <Dialog open={mgrOpen} onClose={() => { setMgrOpen(false); setMgrInput(''); }} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: 2.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2.5, pt: 2, pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FolderOpen size={15} color={primary} />
            <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }}>Manage Categories</Typography>
          </Box>
          <IconButton size="small" onClick={() => { setMgrOpen(false); setMgrInput(''); }}><X size={15} /></IconButton>
        </Box>
        <DialogContent dividers sx={{ p: 2 }}>
          <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.07em', mb: 0.75 }}>Built-in</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6, mb: 2 }}>
            {builtins.map(c => (
              <Chip key={c} label={c} size="small"
                sx={{ fontSize: '0.72rem', height: 22, bgcolor: alpha(primary, 0.06), color: 'text.secondary', border: `1px solid ${alpha(primary, 0.14)}` }} />
            ))}
          </Box>
          <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.07em', mb: 0.75 }}>Custom</Typography>
          {customCats.length === 0 ? (
            <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 2 }}>No custom categories yet.</Typography>
          ) : (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6, mb: 2 }}>
              {customCats.map(c => (
                <Chip key={c} label={c} size="small" onDelete={() => delCat(c)}
                  sx={{ fontSize: '0.72rem', height: 22, bgcolor: alpha(primary, 0.09), color: 'primary.main', border: `1px solid ${alpha(primary, 0.22)}` }} />
              ))}
            </Box>
          )}
          <Box sx={{ display: 'flex', gap: 0.75 }}>
            <TextField size="small" fullWidth placeholder="New category name" value={mgrInput}
              onChange={e => setMgrInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const name = mgrInput.trim();
                  if (!name || !currentBusiness?.id) return;
                  itemCats.add(name);
                  setMgrInput('');
                }
              }}
              autoComplete="off" sx={fsx} />
            <Button variant="contained" size="small"
              onClick={() => {
                const name = mgrInput.trim();
                if (!name || !currentBusiness?.id) return;
                itemCats.add(name);
                setMgrInput('');
              }}
              disabled={!mgrInput.trim()}
              sx={{ fontWeight: 700, textTransform: 'none', borderRadius: 1.5, flexShrink: 0 }}>
              Add
            </Button>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2 }}>
          <Button onClick={() => { setMgrOpen(false); setMgrInput(''); }} sx={{ fontWeight: 600 }}>Done</Button>
        </DialogActions>
      </Dialog>

      {barcodeEnabled && (
        <BarcodeScanner open={scanOpen} continuous={false}
          onScan={code => set({ barcode: String(code).trim() })}
          onClose={() => setScanOpen(false)} />
      )}

      <Snackbar open={snack.open} autoHideDuration={4000}
        onClose={() => setSnack(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.sev} onClose={() => setSnack(s => ({ ...s, open: false }))}>
          {snack.msg}
        </Alert>
      </Snackbar>
    </>
  );
};

export default ItemFormDialog;
