import React, { useState, useRef, useEffect } from 'react';
import {
  Box, Button, Typography, TextField, Dialog,
  DialogContent, DialogActions, Grid, MenuItem,
  InputAdornment, IconButton, Snackbar, Alert, Stack, Divider,
  alpha, useTheme, useMediaQuery, FormControlLabel, Switch,
  Collapse, Chip,
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

const CAT_KEY = (bId, type) => `dz_item_cats_${bId}_${type}`;
const loadCats = (bId, type) => { try { return JSON.parse(localStorage.getItem(CAT_KEY(bId, type)) || '[]'); } catch { return []; } };
const saveCats = (bId, type, cats) => { try { localStorage.setItem(CAT_KEY(bId, type), JSON.stringify(cats)); } catch {} };

export const generateBarcode = () => String(Math.floor(Math.random() * 9e8 + 1e8));

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
    hsnHelper: 'Harmonised System of Nomenclature code for goods',
    salePriceLabel: 'Sale Price',
    salePriceHelper: 'Price charged to customer',
    discountHelper: 'Default discount auto-applied in sales',
    gstHelper: 'GST applicable on product sale',
  },
  service: {
    namePlaceholder: 'e.g. Website Design, AC Repair…',
    codeLabel: 'Service Code',
    codePlaceholder: 'SVC-001',
    hsnLabel: 'SAC Code',
    hsnPlaceholder: 'e.g. 9983',
    hsnHelper: 'Services Accounting Code for GST classification',
    salePriceLabel: 'Service Charge',
    salePriceHelper: 'Amount charged for this service',
    discountHelper: 'Default discount on service invoice',
    gstHelper: 'GST applicable on service (usually 18%)',
  },
  membership: {
    namePlaceholder: 'e.g. Monthly Gym Plan, Annual Club…',
    codeLabel: 'Plan Code',
    codePlaceholder: 'MEM-001',
    hsnLabel: 'SAC Code',
    hsnPlaceholder: 'e.g. 9992',
    hsnHelper: 'SAC code for membership / subscription service',
    salePriceLabel: 'Membership Fee',
    salePriceHelper: 'Fee charged per membership period',
    discountHelper: 'Default discount on membership',
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

const ItemFormDialog = ({ open, onClose, editingItem = null, initialName = '', onSaved }) => {
  const { currentBusiness } = useBusiness();
  const { addItem, updateItem, getItems, data } = useData();
  const { config } = useConfig();
  const { staffSession } = useAuth();
  const canViewPurchase = !staffSession || staffSession.role === 'admin' || !!staffSession.features?.viewPurchasePrice;
  const barcodeEnabled = !!config.features?.barcode;
  const UNITS = [...new Set(config.itemUnits?.length ? config.itemUnits : DEFAULT_UNITS)];
  const defaultUnit = (config.defaultItemUnit && UNITS.includes(config.defaultItemUnit)) ? config.defaultItemUnit : (UNITS[0] || 'NOS');

  const generateUniqueBarcode = () => {
    const existing = new Set(
      getItems('items')
        .filter(it => it.businessId === currentBusiness?.id && it.barcode)
        .map(it => it.barcode)
    );
    // Exclude the current item's own barcode so editing doesn't conflict with itself
    if (editingItem?.barcode) existing.delete(editingItem.barcode);
    let bc;
    do { bc = generateBarcode(); } while (existing.has(bc));
    return bc;
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
  const [gstType, setGstType] = useState('cgst_sgst'); // cgst_sgst | igst | utgst
  const [customCats, setCustomCats] = useState([]);
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
      setForm({ ...blank(), ...editingItem, mrp: editingItem.mrp ? editingItem.mrp : '', utgstRate: editingItem.utgstRate ?? (editingItem.cgstRate ?? 0), recipe: Array.isArray(editingItem.recipe) ? editingItem.recipe : [] });
      setGstOn((editingItem.taxRate || 0) > 0);
      setComposite(!!editingItem.isComposite);
      setGstType(editingItem.gstType || 'cgst_sgst');
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
      setForm({
        ...blank(),
        name: initialName || '',
        taxRate: defRate,
        cgstRate: halfRate,
        sgstRate: halfRate,
        igstRate: defRate,
        utgstRate: halfRate,
        taxInclusive: !!d.taxInclusive,
      });
    }
  }, [open, editingItem, initialName]); // eslint-disable-line

  useEffect(() => {
    if (currentBusiness?.id) setCustomCats(loadCats(currentBusiness.id, itemType));
  }, [currentBusiness?.id, itemType]);

  const addCat = (name) => {
    name = name.trim();
    if (!name || !currentBusiness?.id) return;
    const all = [...builtins, ...customCats];
    if (!all.some(c => c.toLowerCase() === name.toLowerCase())) {
      const next = [...customCats, name];
      setCustomCats(next);
      saveCats(currentBusiness.id, itemType, next);
    }
    set({ category: name });
    setShowNewCat(false); setNewCatVal('');
  };

  const delCat = (cat) => {
    if (!currentBusiness?.id) return;
    const next = customCats.filter(c => c !== cat);
    setCustomCats(next);
    saveCats(currentBusiness.id, itemType, next);
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
    try {
      const taxRate = gstOn ? (Number(form.taxRate) || 0) : 0;
      const cleanRecipe = isProduct
        ? (form.recipe || [])
            .filter(r => r.itemId && Number(r.qtyPerUnit) > 0)
            .map(r => ({ itemId: r.itemId, qtyPerUnit: Number(r.qtyPerUnit) }))
        : [];
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
        // components' stock instead (see Sales.jsx/POS.jsx checkout).
        stock: (itemType === 'service' || cleanRecipe.length > 0) ? 0 : (Number(form.stock) || 0),
        itemCode: form.itemCode?.trim() || '',
        barcodeExtraFields: form.barcodeExtraFields || [],
        recipe: cleanRecipe,
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
          <Box sx={{ background: 'linear-gradient(135deg, #3730a3 0%, #6366f1 100%)', px: 2.5, py: 1.75, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <Box sx={{ bgcolor: 'rgba(255,255,255,0.2)', borderRadius: 1.5, p: 0.6, display: 'flex' }}>
                {editingItem ? <Edit2 size={16} color="white" /> : <Plus size={16} color="white" />}
              </Box>
              <Box>
                <Typography sx={{ color: 'white', fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.2 }}>
                  {editingItem ? 'Edit Item' : 'Add New Item'}
                </Typography>
                {editingItem && (
                  <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.7rem', lineHeight: 1.3 }}>
                    {editingItem.name}
                  </Typography>
                )}
              </Box>
            </Box>
            <IconButton size="small" onClick={onClose}
              sx={{ color: 'rgba(255,255,255,0.85)', '&:hover': { bgcolor: 'rgba(255,255,255,0.15)' } }}>
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
                {isProduct && (
                  <>
                    <Grid size={{ xs: 4 }}>
                      <TextField size="small" fullWidth label="Color / Shade"
                        value={form.color || ''}
                        onChange={e => set({ color: e.target.value })}
                        placeholder="Red, Blue…"
                        InputProps={{ startAdornment: <InputAdornment position="start"><Palette size={13} color="#9ca3af" /></InputAdornment> }}
                        sx={fsx} />
                    </Grid>
                    <Grid size={{ xs: 4 }}>
                      <TextField size="small" fullWidth label="Size"
                        value={form.size || ''}
                        onChange={e => set({ size: e.target.value })}
                        placeholder="S, M, L, XL…"
                        InputProps={{ startAdornment: <InputAdornment position="start"><Ruler size={13} color="#9ca3af" /></InputAdornment> }}
                        sx={fsx} />
                    </Grid>
                    <Grid size={{ xs: 4 }}>
                      <TextField size="small" fullWidth label="Variant"
                        value={form.variant || ''}
                        onChange={e => set({ variant: e.target.value })}
                        placeholder="Slim Fit, Regular…"
                        sx={fsx} />
                    </Grid>
                  </>
                )}
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
                    helperText={ctx.salePriceHelper}
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
                      : 'Shown crossed out on barcode label'}
                    sx={fsx} />
                </Grid>
                {isProduct && (
                  <Grid size={{ xs: 6 }}>
                    <TextField size="small" fullWidth type="number" label="Purchase / Cost Price"
                      value={form.purchasePrice}
                      onChange={e => canViewPurchase && set({ purchasePrice: e.target.value })}
                      helperText="Your cost from supplier"
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
                  <Grid size={{ xs: 6 }}>
                    <TextField size="small" fullWidth type="number" label="Min Stock Alert"
                      value={form.minStock || ''}
                      placeholder="5"
                      helperText="Alert when stock falls below this"
                      onChange={e => set({ minStock: e.target.value === '' ? '' : Number(e.target.value) })}
                      sx={fsx} />
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
                  onClick={() => set({ recipe: (form.recipe || []).length ? [] : [{ itemId: '', qtyPerUnit: 1 }] })}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 1.25, px: 1.25, py: 1, mb: 1.5,
                    borderRadius: `${radius}px`, cursor: 'pointer',
                    border: '1px solid', borderColor: hasRecipe ? alpha(primary, 0.3) : 'divider',
                    bgcolor: hasRecipe ? alpha(primary, 0.06) : 'background.paper',
                  }}
                >
                  <Layers size={16} color={hasRecipe ? primary : '#94a3b8'} />
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', color: hasRecipe ? primary : 'text.primary' }}>
                      Made from other items (recipe)
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      e.g. "Tomato Rice" made of Tomato + Rice — selling this deducts the components instead
                    </Typography>
                  </Box>
                  <Switch size="small" checked={hasRecipe} onChange={() => set({ recipe: hasRecipe ? [] : [{ itemId: '', qtyPerUnit: 1 }] })} onClick={e => e.stopPropagation()} />
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
                  <Grid container spacing={1.25}>
                    <Grid size={{ xs: 6 }}>
                      <TextField size="small" fullWidth type="number" label="Opening Stock"
                        value={form.stock}
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
                )}
              </Box>
            )}

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
                background: 'linear-gradient(135deg, #3730a3 0%, #6366f1 100%)',
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
                  if (![...builtins, ...customCats].some(c => c.toLowerCase() === name.toLowerCase())) {
                    const next = [...customCats, name];
                    setCustomCats(next);
                    saveCats(currentBusiness.id, itemType, next);
                  }
                  setMgrInput('');
                }
              }}
              autoComplete="off" sx={fsx} />
            <Button variant="contained" size="small"
              onClick={() => {
                const name = mgrInput.trim();
                if (!name || !currentBusiness?.id) return;
                if (![...builtins, ...customCats].some(c => c.toLowerCase() === name.toLowerCase())) {
                  const next = [...customCats, name];
                  setCustomCats(next);
                  saveCats(currentBusiness.id, itemType, next);
                }
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
