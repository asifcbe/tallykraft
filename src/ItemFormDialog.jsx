import React, { useState, useRef, useEffect } from 'react';
import {
  Box, Button, Typography, TextField, Dialog,
  DialogContent, DialogActions, Grid, MenuItem,
  InputAdornment, IconButton, Snackbar, Alert, Stack, Divider,
  alpha, useTheme, useMediaQuery, Autocomplete, Checkbox, FormControlLabel,
} from '@mui/material';
import { X as CloseIcon } from 'lucide-react';
import {
  Plus, Edit2, Trash2, Box as BoxIcon, Barcode, RefreshCw,
  Package, TrendingUp, Percent, Tag, Palette, Ruler, FileText,
  Users as UsersIcon, ScanLine,
} from 'lucide-react';
import JsBarcode from 'jsbarcode';
import { useBusiness } from './BusinessContext';
import { useData } from './DataContext';
import { useI18n } from './i18n/I18nContext';
import { useConfig } from './ConfigContext';
import { useAuth } from './AuthContext';
import BarcodeScanner from './BarcodeScanner';

const DEFAULT_UNITS = ['NOS', 'BAGS', 'BOX', 'KGS', 'Ltr', 'Mtr', 'Pcs'];
const GST_UNIT_LABELS = {
  BAG:'BAG – Bags', BAL:'BAL – Bales', BDL:'BDL – Bundles', BKL:'BKL – Buckles',
  BOU:'BOU – Billions of Units', BOX:'BOX – Box', BTL:'BTL – Bottles',
  BUN:'BUN – Bunches', CAN:'CAN – Cans', CCM:'CCM – Cubic Centimetres',
  CMS:'CMS – Centimetres', CTN:'CTN – Cartons', DOZ:'DOZ – Dozens',
  DRM:'DRM – Drums', GGK:'GGK – Great Gross (144 doz)', GMS:'GMS – Grams',
  GRS:'GRS – Gross', GYD:'GYD – Gross Yards', KGS:'KGS – Kilograms',
  KLR:'KLR – Kilolitres', KME:'KME – Kilometres', LTR:'LTR – Litres',
  MLT:'MLT – Millilitres', MTR:'MTR – Metres', NOS:'NOS – Numbers',
  PAC:'PAC – Packs', PCS:'PCS – Pieces', PRS:'PRS – Pairs',
  QTL:'QTL – Quintals', ROL:'ROL – Rolls', SET:'SET – Sets',
  SQF:'SQF – Square Feet', SQM:'SQM – Square Metres', SQY:'SQY – Square Yards',
  TBS:'TBS – Tablets', TGM:'TGM – Ten Gross', THD:'THD – Thousands',
  TON:'TON – Tonnes', TUB:'TUB – Tubes', UGS:'UGS – US Gallons',
  UNT:'UNT – Units', YDS:'YDS – Yards',
  BAGS:'BAGS – Bags', Ltr:'Ltr – Litres', Mtr:'Mtr – Metres', Pcs:'Pcs – Pieces',
};
const TAX_SLABS = [0, 5, 12, 18, 28];
const ITEM_CATEGORIES = [
  'Clothing', 'Footwear', 'Accessories', 'Electronics', 'Mobile & Tablets',
  'Food & Beverages', 'Grocery', 'Pharmacy', 'Cosmetics & Beauty',
  'Furniture', 'Hardware', 'Stationery', 'Books', 'Toys & Games',
  'Automotive', 'Agriculture', 'Jewellery', 'Sports & Fitness', 'Other',
];

export const generateBarcode = () => String(Math.floor(Math.random() * 9e8 + 1e8));

export const BarcodeImage = ({ value, height = 70, fontSize = 13 }) => {
  const svgRef = useRef(null);
  useEffect(() => {
    if (svgRef.current && value) {
      try {
        JsBarcode(svgRef.current, value, {
          format: 'CODE128', width: 1.5, height, displayValue: true,
          fontSize, margin: 4, background: '#ffffff', lineColor: '#000000',
        });
      } catch (e) { svgRef.current.innerHTML = ''; }
    }
  }, [value, height, fontSize]);
  return <svg ref={svgRef} style={{ maxWidth: '100%' }} />;
};

// Shared item create/edit dialog. Used by the Items page and by the "+ New item"
// shortcut in Sales/POS when a typed product has no match.
//   open         — controls visibility
//   onClose      — called to close
//   editingItem  — when set, edits that item; otherwise creates a new one
//   initialName  — prefill the name (e.g. the text the user typed in Sales/POS)
//   onSaved      — called with the saved item after a successful create/update
const ItemFormDialog = ({ open, onClose, editingItem = null, initialName = '', onSaved }) => {
  const { currentBusiness } = useBusiness();
  const { addItem, updateItem } = useData();
  const { config } = useConfig();
  const { t } = useI18n();
  const { staffSession } = useAuth();
  const canViewPurchasePrice = !staffSession || !!staffSession.features?.viewPurchasePrice;
  const barcodeEnabled = !!config.features?.barcode;
  const UNITES = [...new Set([...DEFAULT_UNITS, ...(config.itemUnits || [])])];
  const defaultUnit = config.defaultItemUnit && UNITES.includes(config.defaultItemUnit)
    ? config.defaultItemUnit
    : (config.defaultItemUnit || UNITES[0] || 'NOS');

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const primary = theme.palette.primary.main;
  const baseRadius = Number(theme.shape?.borderRadius) || 8;
  const fieldSx = { '& .MuiOutlinedInput-root': { borderRadius: `${baseRadius + 2}px` } };

  const emptyForm = () => ({
    name: '', unit: defaultUnit, salePrice: 0, purchasePrice: 0, discount: '',
    taxRate: 0, cgstRate: 0, sgstRate: 0, igstRate: 0,
    hsnCode: '', stock: 0, barcode: '', itemCode: '', barcodeExtraFields: [],
    batchNo: '', expiryDate: '',
    category: '', color: '', size: '', description: '',
    minStock: '', defaultPartyId: '', defaultPartyName: '',
    isMembership: false,
  });

  const [formData, setFormData] = useState(emptyForm());
  const [scanOpen, setScanOpen] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'error' });
  const showSnackbar = (message, severity = 'error') => setSnackbar({ open: true, message, severity });

  const { getItems } = useData();
  const vendors = getItems('parties').filter(p => p.businessId === currentBusiness?.id && (p.type === 'Vendor' || p.type === 'Both'));

  // Reset the form whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    if (editingItem) {
      setFormData({
        ...emptyForm(),
        ...editingItem,
        isMembership: editingItem.isMembership ?? (editingItem.category?.toLowerCase() === 'membership'),
      });
    } else {
      setFormData({ ...emptyForm(), name: initialName || '' });
    }
  }, [open, editingItem, initialName]); // eslint-disable-line

  const handleClose = () => onClose();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentBusiness?.id) { showSnackbar('Business not selected.', 'error'); return; }
    if (!formData.name?.trim()) { showSnackbar('Please enter an item name', 'warning'); return; }
    try {
      const itemData = {
        // Assign the id up front so we can hand the exact saved record back to the
        // caller (Sales/POS "+ New item") without re-querying the data store.
        id: editingItem?.id || Date.now(),
        ...formData,
        businessId: currentBusiness.id,
        name: formData.name.trim(),
        category: formData.isMembership ? 'Membership' : formData.category,
        salePrice: Number(formData.salePrice) || 0,
        purchasePrice: Number(formData.purchasePrice) || 0,
        discount: formData.discount === '' || formData.discount == null ? 0 : Number(formData.discount) || 0,
        taxRate: Number(formData.taxRate) || 0,
        cgstRate: Number(formData.cgstRate) ?? (Number(formData.taxRate) / 2),
        sgstRate: Number(formData.sgstRate) ?? (Number(formData.taxRate) / 2),
        igstRate: Number(formData.igstRate) ?? Number(formData.taxRate),
        stock: Number(formData.stock) || 0,
        itemCode: formData.itemCode?.trim() || '',
        barcodeExtraFields: formData.barcodeExtraFields || [],
        barcode: barcodeEnabled
          ? (formData.barcode?.trim() || generateBarcode())
          : (formData.barcode?.trim() || ''),
      };
      if (editingItem) {
        await updateItem('items', editingItem.id, itemData);
      } else {
        await addItem('items', itemData);
      }
      showSnackbar(editingItem ? 'Item updated successfully!' : 'Item added successfully!', 'success');
      onSaved?.(itemData);
      handleClose();
    } catch {
      showSnackbar('An error occurred while saving. Please try again.', 'error');
    }
  };

  return (
    <>
      <Dialog
        open={open} onClose={handleClose} maxWidth="sm" fullWidth
        fullScreen={isMobile}
        PaperProps={{
          sx: {
            borderRadius: isMobile ? 0 : `${baseRadius + 12}px`,
            boxShadow: '0 24px 64px rgba(0,0,0,0.15)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }
        }}
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
          {/* Gradient Header */}
          <Box sx={{
            background: `linear-gradient(135deg, #1e1b4b 0%, ${primary} 100%)`,
            px: 2.5, py: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ bgcolor: 'rgba(255,255,255,0.18)', borderRadius: '10px', p: 0.75, display: 'flex' }}>
                {editingItem ? <Edit2 size={18} color="white" /> : <Plus size={18} color="white" />}
              </Box>
              <Box>
                <Typography sx={{ color: 'white', fontWeight: 700, fontSize: '1rem', lineHeight: 1.25 }}>
                  {editingItem ? t('items.editItem') : t('items.addNew')}
                </Typography>
                {editingItem && (
                  <Typography sx={{ color: 'rgba(255,255,255,0.72)', fontSize: '0.72rem' }}>
                    {editingItem.name}
                  </Typography>
                )}
              </Box>
            </Box>
            <IconButton size="small" onClick={handleClose}
              sx={{ color: 'rgba(255,255,255,0.8)', '&:hover': { bgcolor: 'rgba(255,255,255,0.15)', color: 'white' } }}>
              <CloseIcon size={18} />
            </IconButton>
          </Box>

          <DialogContent sx={{ p: 0, overflowY: 'auto', flex: 1 }}>
            {/* Basic Info */}
            <Box sx={{ px: 3, py: 2.5, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 2 }}>
                <Package size={13} color={primary} />
                <Typography variant="overline" sx={{ fontWeight: 800, color: primary, letterSpacing: '0.08em', fontSize: '0.65rem', lineHeight: 1 }}>
                  Basic Info
                </Typography>
              </Box>
              <Grid container spacing={1.5}>
                <Grid size={{ xs: 12, sm: 8 }}>
                  <TextField size="small" fullWidth required label={t('items.itemName')}
                    value={formData.name} autoFocus
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    sx={fieldSx} />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField size="small" fullWidth label="Item Code"
                    value={formData.itemCode || ''} placeholder="ITM-001"
                    onChange={(e) => setFormData({ ...formData, itemCode: e.target.value })}
                    sx={fieldSx} />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <TextField size="small" fullWidth select label={t('items.unit')}
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    sx={fieldSx}>
                    {UNITES.map(u => <MenuItem key={u} value={u}>{GST_UNIT_LABELS[u] || u}</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <TextField size="small" fullWidth label="HSN Code"
                    value={formData.hsnCode}
                    onChange={(e) => setFormData({ ...formData, hsnCode: e.target.value })}
                    sx={fieldSx} />
                </Grid>
              </Grid>
            </Box>

            {/* Attributes */}
            <Box sx={{ px: 3, py: 2.5, borderBottom: '1px solid', borderColor: 'divider', bgcolor: alpha(primary, 0.02) }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 2 }}>
                <Tag size={13} color={primary} />
                <Typography variant="overline" sx={{ fontWeight: 800, color: primary, letterSpacing: '0.08em', fontSize: '0.65rem', lineHeight: 1 }}>
                  Attributes & Details
                </Typography>
              </Box>
              <Grid container spacing={1.5}>
                {config.features?.membership && (
                  <Grid size={{ xs: 12 }}>
                    <Box sx={{
                      px: 1.5, py: 0.5, borderRadius: `${baseRadius + 2}px`,
                      border: '1px solid',
                      borderColor: formData.isMembership ? alpha(primary, 0.5) : 'divider',
                      bgcolor: formData.isMembership ? alpha(primary, 0.05) : 'transparent',
                      transition: 'all 0.15s',
                    }}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            size="small"
                            checked={!!formData.isMembership}
                            onChange={(e) => setFormData(f => ({
                              ...f,
                              isMembership: e.target.checked,
                              category: e.target.checked ? 'Membership' : (f.category === 'Membership' ? '' : f.category),
                            }))}
                          />
                        }
                        label={
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>Membership Plan</Typography>
                            <Typography variant="caption" color="text.secondary">
                              List this item as a plan in the Membership section
                            </Typography>
                          </Box>
                        }
                        sx={{ m: 0 }}
                      />
                    </Box>
                  </Grid>
                )}
                <Grid size={{ xs: 12, sm: 5 }}>
                  <Autocomplete
                    freeSolo size="small" fullWidth
                    options={ITEM_CATEGORIES}
                    value={formData.category || ''}
                    disabled={!!formData.isMembership}
                    onInputChange={(_, v) => setFormData(f => ({ ...f, category: v }))}
                    renderInput={(params) => (
                      <TextField {...params} label={t('items.category')}
                        placeholder="e.g. Clothing"
                        helperText={formData.isMembership ? 'Set to "Membership" automatically' : ''}
                        sx={fieldSx} />
                    )}
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 3.5 }}>
                  <TextField size="small" fullWidth label="Color"
                    value={formData.color || ''}
                    onChange={(e) => setFormData(f => ({ ...f, color: e.target.value }))}
                    placeholder="Red, Blue…"
                    InputProps={{ startAdornment: <InputAdornment position="start"><Palette size={14} color="#888" /></InputAdornment> }}
                    sx={fieldSx} />
                </Grid>
                <Grid size={{ xs: 6, sm: 3.5 }}>
                  <TextField size="small" fullWidth label="Size / Variant"
                    value={formData.size || ''}
                    onChange={(e) => setFormData(f => ({ ...f, size: e.target.value }))}
                    placeholder="S, M, L, 32…"
                    InputProps={{ startAdornment: <InputAdornment position="start"><Ruler size={14} color="#888" /></InputAdornment> }}
                    sx={fieldSx} />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <TextField size="small" fullWidth multiline rows={2} label="Description"
                    value={formData.description || ''}
                    onChange={(e) => setFormData(f => ({ ...f, description: e.target.value }))}
                    placeholder="Short product description or notes…"
                    InputProps={{ startAdornment: <InputAdornment position="start" sx={{ alignSelf: 'flex-start', mt: 1 }}><FileText size={14} color="#888" /></InputAdornment> }}
                    sx={fieldSx} />
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <TextField size="small" fullWidth type="number" label="Min Stock Alert"
                    value={formData.minStock || ''}
                    placeholder="5"
                    onChange={(e) => setFormData(f => ({ ...f, minStock: e.target.value === '' ? '' : Number(e.target.value) }))}
                    helperText="Alert threshold"
                    sx={fieldSx} />
                </Grid>
                <Grid size={{ xs: 12, sm: 8 }}>
                  <Autocomplete
                    size="small" fullWidth
                    options={vendors}
                    getOptionLabel={(o) => o.name || ''}
                    value={vendors.find(v => v.id === formData.defaultPartyId) || null}
                    onChange={(_, v) => setFormData(f => ({ ...f, defaultPartyId: v?.id || '', defaultPartyName: v?.name || '' }))}
                    renderOption={(props, option) => {
                      const { key, ...rest } = props;
                      return (
                        <li key={option.id} {...rest}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <UsersIcon size={13} color="#888" />
                            <Typography variant="body2">{option.name}</Typography>
                          </Box>
                        </li>
                      );
                    }}
                    renderInput={(params) => (
                      <TextField {...params} label="Default Supplier" placeholder="Select vendor…"
                        InputProps={{ ...params.InputProps, startAdornment: <><InputAdornment position="start"><UsersIcon size={14} color="#888" /></InputAdornment>{params.InputProps.startAdornment}</> }}
                        sx={fieldSx} />
                    )}
                  />
                </Grid>
              </Grid>
            </Box>

            {/* Pricing */}
            <Box sx={{ px: 3, py: 2.5, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 2 }}>
                <TrendingUp size={13} color={primary} />
                <Typography variant="overline" sx={{ fontWeight: 800, color: primary, letterSpacing: '0.08em', fontSize: '0.65rem', lineHeight: 1 }}>
                  Pricing
                </Typography>
              </Box>
              <Grid container spacing={1.5}>
                <Grid size={{ xs: 6 }}>
                  <TextField size="small" fullWidth type="number" label="Sale Price"
                    value={formData.salePrice}
                    onChange={(e) => setFormData({ ...formData, salePrice: Number(e.target.value) })}
                    InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                    sx={fieldSx} />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <TextField size="small" fullWidth type="number" label="Purchase Price"
                    value={formData.purchasePrice}
                    onChange={(e) => canViewPurchasePrice && setFormData({ ...formData, purchasePrice: Number(e.target.value) })}
                    InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment>, readOnly: !canViewPurchasePrice }}
                    inputProps={!canViewPurchasePrice ? { style: { filter: 'blur(6px)', userSelect: 'none' } } : undefined}
                    sx={fieldSx} />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <TextField size="small" fullWidth type="number" label="Default Discount %"
                    value={formData.discount ?? ''}
                    onChange={(e) => setFormData({ ...formData, discount: e.target.value === '' ? '' : Number(e.target.value) })}
                    placeholder="0"
                    helperText="Auto-applied when added to a sale"
                    InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                    sx={fieldSx} />
                </Grid>
              </Grid>
            </Box>

            {/* Tax Rates */}
            <Box sx={{ px: 3, py: 2.5, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 2 }}>
                <Percent size={13} color={primary} />
                <Typography variant="overline" sx={{ fontWeight: 800, color: primary, letterSpacing: '0.08em', fontSize: '0.65rem', lineHeight: 1 }}>
                  Tax Rates
                </Typography>
              </Box>
              <Grid container spacing={1.5} alignItems="flex-start">
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField size="small" fullWidth select label="Total GST %"
                    value={formData.taxRate}
                    onChange={(e) => {
                      const tx = Number(e.target.value);
                      setFormData({ ...formData, taxRate: tx, cgstRate: tx / 2, sgstRate: tx / 2, igstRate: tx });
                    }}
                    sx={fieldSx}>
                    {TAX_SLABS.map(s => <MenuItem key={s} value={s}>{s}%</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, sm: 8 }}>
                  <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: `${baseRadius + 4}px`, overflow: 'hidden' }}>
                    <Box sx={{ px: 1.5, pt: 1.25, pb: 1.25, bgcolor: alpha(primary, 0.04) }}>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', mb: 1 }}>
                        Intra-state (CGST + SGST)
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <TextField size="small" label="CGST %" type="number" fullWidth
                          value={formData.cgstRate ?? formData.taxRate / 2}
                          onChange={(e) => { const c = Number(e.target.value) || 0; setFormData({ ...formData, cgstRate: c, sgstRate: c, taxRate: c * 2, igstRate: c * 2 }); }}
                          InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                          sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px', bgcolor: 'background.paper' } }} />
                        <TextField size="small" label="SGST %" type="number" fullWidth
                          value={formData.sgstRate ?? formData.taxRate / 2}
                          onChange={(e) => { const s = Number(e.target.value) || 0; setFormData({ ...formData, sgstRate: s, cgstRate: s, taxRate: s * 2, igstRate: s * 2 }); }}
                          InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                          sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px', bgcolor: 'background.paper' } }} />
                      </Box>
                    </Box>
                    <Divider />
                    <Box sx={{ px: 1.5, pt: 1.25, pb: 1.25 }}>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', mb: 1 }}>
                        Inter-state (IGST)
                      </Typography>
                      <TextField size="small" label="IGST %" type="number"
                        value={formData.igstRate ?? formData.taxRate}
                        onChange={(e) => { const i = Number(e.target.value) || 0; setFormData({ ...formData, igstRate: i, cgstRate: i / 2, sgstRate: i / 2, taxRate: i }); }}
                        InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                        sx={{ width: '50%', '& .MuiOutlinedInput-root': { borderRadius: '8px', bgcolor: 'background.paper' } }} />
                    </Box>
                  </Box>
                </Grid>
              </Grid>
            </Box>

            {/* Inventory */}
            <Box sx={{ px: 3, py: 2.5, bgcolor: alpha(primary, 0.02), borderBottom: barcodeEnabled ? '1px solid' : 'none', borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 2 }}>
                <BoxIcon size={13} color={primary} />
                <Typography variant="overline" sx={{ fontWeight: 800, color: primary, letterSpacing: '0.08em', fontSize: '0.65rem', lineHeight: 1 }}>
                  Inventory
                </Typography>
              </Box>
              <Grid container spacing={1.5}>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <TextField size="small" fullWidth type="number" label="Opening Stock"
                    value={formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: Number(e.target.value) })}
                    sx={fieldSx} />
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <TextField size="small" fullWidth label="Batch / Lot No."
                    value={formData.batchNo || ''} placeholder="BT2024-001"
                    onChange={(e) => setFormData({ ...formData, batchNo: e.target.value })}
                    sx={fieldSx} />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField size="small" fullWidth type="date" label="Expiry Date"
                    value={formData.expiryDate || ''}
                    onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                    InputLabelProps={{ shrink: true }}
                    sx={fieldSx} />
                </Grid>
              </Grid>
            </Box>

            {/* Barcode */}
            {barcodeEnabled && (
              <Box sx={{ px: 3, py: 2.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 2 }}>
                  <Barcode size={13} color={primary} />
                  <Typography variant="overline" sx={{ fontWeight: 800, color: primary, letterSpacing: '0.08em', fontSize: '0.65rem', lineHeight: 1 }}>
                    Barcode
                  </Typography>
                </Box>
                <TextField size="small" fullWidth label="Barcode" value={formData.barcode}
                  onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                  placeholder="Leave blank to auto-generate"
                  helperText="Unique barcode for scanning in sales"
                  InputProps={{
                    startAdornment: <InputAdornment position="start"><Barcode size={16} /></InputAdornment>,
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton size="small" title="Scan existing barcode"
                          onClick={() => setScanOpen(true)}>
                          <ScanLine size={15} />
                        </IconButton>
                        <IconButton size="small" title="Generate barcode"
                          onClick={() => setFormData(f => ({ ...f, barcode: generateBarcode() }))}>
                          <RefreshCw size={15} />
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                  sx={{ ...fieldSx, mb: 2 }} />
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>Extra Barcode Info</Typography>
                <Typography variant="caption" color="text.secondary">These will print on the barcode label.</Typography>
                {(formData.barcodeExtraFields || []).map((f, idx) => (
                  <Stack direction="row" spacing={1} key={idx} sx={{ mt: 1 }}>
                    <TextField size="small" label="Label" value={f.label}
                      onChange={e => setFormData(prev => { const fields = [...(prev.barcodeExtraFields || [])]; fields[idx] = { ...fields[idx], label: e.target.value }; return { ...prev, barcodeExtraFields: fields }; })}
                      sx={{ flex: 1, ...fieldSx }} />
                    <TextField size="small" label="Value" value={f.value}
                      onChange={e => setFormData(prev => { const fields = [...(prev.barcodeExtraFields || [])]; fields[idx] = { ...fields[idx], value: e.target.value }; return { ...prev, barcodeExtraFields: fields }; })}
                      sx={{ flex: 1, ...fieldSx }} />
                    <IconButton size="small" color="error"
                      onClick={() => setFormData(prev => ({ ...prev, barcodeExtraFields: (prev.barcodeExtraFields || []).filter((_, i) => i !== idx) }))}>
                      <Trash2 size={16} />
                    </IconButton>
                  </Stack>
                ))}
                <Button size="small" startIcon={<Plus size={14} />} sx={{ mt: 1.5 }}
                  onClick={() => setFormData(prev => ({ ...prev, barcodeExtraFields: [...(prev.barcodeExtraFields || []), { label: '', value: '' }] }))}>
                  Add Field
                </Button>
              </Box>
            )}
          </DialogContent>

          <DialogActions sx={{ px: 3, py: 2, gap: 1, borderTop: '1px solid', borderColor: 'divider' }}>
            <Button onClick={handleClose} sx={{ borderRadius: `${baseRadius + 2}px` }}>Cancel</Button>
            <Button type="submit" variant="contained"
              sx={{
                borderRadius: `${baseRadius + 2}px`,
                background: `linear-gradient(135deg, #1e1b4b 0%, ${primary} 100%)`,
                boxShadow: `0 4px 12px ${alpha(primary, 0.35)}`,
                fontWeight: 700, px: 3,
                '&:hover': { opacity: 0.92 },
              }}>
              {editingItem ? t('common.save') : t('items.addItem')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {barcodeEnabled && (
        <BarcodeScanner
          open={scanOpen}
          continuous={false}
          onScan={(code) => setFormData(f => ({ ...f, barcode: String(code).trim() }))}
          onClose={() => setScanOpen(false)}
        />
      )}

      <Snackbar open={snackbar.open} autoHideDuration={4000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
};

export default ItemFormDialog;
