import React, { useState, useRef, useEffect } from 'react';
import {
  Box, Button, Card, CardContent, Typography, TextField, Dialog,
  DialogTitle, DialogContent, DialogActions, MenuItem,
  InputAdornment, Chip, IconButton, Snackbar, Alert, Stack, Divider,
  Tooltip, alpha, useTheme, useMediaQuery, Pagination,
} from '@mui/material';
import { X as CloseIcon } from 'lucide-react';
import {
  Plus, Edit2, Trash2, Box as BoxIcon, Barcode, Printer,
  Package, TrendingUp, AlertTriangle, Upload, Download, Search,
  Palette, Ruler, Users as UsersIcon,
} from 'lucide-react';
import ItemFormDialog from './ItemFormDialog';
import { useBusiness } from './BusinessContext';
import { useData } from './DataContext';
import { useI18n } from './i18n/I18nContext';
import ImportDialog from './ImportDialog';
import { exportToExcel, ITEM_COLUMNS } from './exportUtils';
import { useConfig } from './ConfigContext';
import { useDialog } from './DialogContext';
import { useAuth } from './AuthContext';
import { useReactToPrint } from 'react-to-print';
import JsBarcode from 'jsbarcode';

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

const BarcodeImage = ({ value, height = 70, fontSize = 13 }) => {
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

const LABEL_SIZES = [
  { key: 'standard', label: 'Standard (80×40mm)', width: '80mm', height: '40mm', barcodeHeight: 40, fontSize: 10, smallFontSize: 8 },
  { key: 'small',    label: 'Small (58×30mm)',    width: '58mm', height: '30mm', barcodeHeight: 28, fontSize: 9,  smallFontSize: 7.5 },
  { key: 'large',    label: 'Large (100×60mm)',   width: '100mm', height: '60mm', barcodeHeight: 58, fontSize: 12, smallFontSize: 10 },
  { key: 'a4',       label: 'A4 Full Page',       width: '210mm', height: null,   barcodeHeight: 70, fontSize: 13, smallFontSize: 11 },
];

const BarcodeLabel = ({ item, sizeConfig }) => {
  const { width, height, barcodeHeight, fontSize, smallFontSize } = sizeConfig;
  return (
    <div style={{
      width, height: height || 'auto',
      padding: sizeConfig.key === 'a4' ? '20px 24px' : '4px 6px',
      textAlign: 'center', fontFamily: 'Arial, sans-serif', overflow: 'hidden',
      display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', boxSizing: 'border-box',
      border: sizeConfig.key === 'a4' ? 'none' : '0.5px solid #ccc',
    }}>
      <p style={{ margin: '0 0 2px', fontWeight: 700, fontSize, lineHeight: 1.2 }}>{item?.name}</p>
      {item?.itemCode && <p style={{ margin: '0 0 2px', fontSize: smallFontSize, color: '#333' }}>{item.itemCode}</p>}
      {item?.barcode && <BarcodeImage value={item.barcode} height={barcodeHeight} fontSize={smallFontSize} />}
      <p style={{ margin: '2px 0 0', fontSize: smallFontSize, color: '#555' }}>{item?.barcode}</p>
      {item?.salePrice != null && item.salePrice > 0 && (
        <p style={{ margin: '3px 0 1px', fontWeight: 800, fontSize, color: '#000', letterSpacing: '0.02em' }}>
          ₹{Number(item.salePrice).toLocaleString('en-IN')}
        </p>
      )}
      {(item?.barcodeExtraFields || []).filter(f => f.label || f.value).map((f, i) => (
        <p key={i} style={{ margin: '1px 0', fontSize: smallFontSize }}><strong>{f.label}:</strong> {f.value}</p>
      ))}
    </div>
  );
};

const BarcodePrintSheet = React.forwardRef(({ item, copies, sizeConfig }, ref) => {
  const isA4 = sizeConfig.key === 'a4';
  return (
    <div ref={ref} style={{
      padding: isA4 ? 16 : 8, backgroundColor: '#fff', fontFamily: 'Arial, sans-serif',
      display: 'flex', flexWrap: 'wrap', gap: isA4 ? 8 : 4,
      width: isA4 ? '210mm' : undefined,
    }}>
      {Array.from({ length: copies }).map((_, i) => (
        <BarcodeLabel key={i} item={item} sizeConfig={sizeConfig} />
      ))}
    </div>
  );
});
BarcodePrintSheet.displayName = 'BarcodePrintSheet';

const BarcodeDialog = ({ item, onClose }) => {
  const printRef = useRef(null);
  const [labelSizeKey, setLabelSizeKey] = useState('standard');
  const [copies, setCopies] = useState(1);
  const sizeConfig = LABEL_SIZES.find(s => s.key === labelSizeKey) || LABEL_SIZES[0];
  const handlePrint = useReactToPrint({ contentRef: printRef });
  if (!item) return null;
  return (
    <Dialog open={!!item} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Item Barcode</DialogTitle>
      <DialogContent sx={{ pb: 1 }}>
        <Box sx={{ textAlign: 'center', mb: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>{item.name}</Typography>
          {item.barcode ? (
            <>
              <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1, display: 'inline-block' }}>
                <BarcodeImage value={item.barcode} height={60} fontSize={11} />
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                {item.barcode}
              </Typography>
            </>
          ) : (
            <Typography variant="body2" color="text.secondary">No barcode assigned to this item.</Typography>
          )}
        </Box>
        {item.barcode && (
          <Box sx={{ display: 'flex', gap: 2, mt: 1, flexWrap: 'wrap' }}>
            <TextField select label="Label Size" size="small" value={labelSizeKey}
              onChange={e => setLabelSizeKey(e.target.value)} sx={{ flex: 2, minWidth: 160 }}>
              {LABEL_SIZES.map(s => <MenuItem key={s.key} value={s.key}>{s.label}</MenuItem>)}
            </TextField>
            <TextField label="Copies" type="number" size="small" value={copies}
              onChange={e => setCopies(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
              inputProps={{ min: 1, max: 50 }} sx={{ flex: 1, minWidth: 80 }} />
          </Box>
        )}
        <div style={{ display: 'none' }}>
          <BarcodePrintSheet ref={printRef} item={item} copies={copies} sizeConfig={sizeConfig} />
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        {item.barcode && (
          <Button variant="contained" startIcon={<Printer size={16} />} onClick={() => handlePrint()}>
            Print {copies > 1 ? `(${copies} copies)` : ''}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

const ItemsPage = () => {
  const { currentBusiness } = useBusiness();
  const { addItem, updateItem, deleteItem, getItems } = useData();
  const { config } = useConfig();
  const { confirm } = useDialog();
  const { t } = useI18n();
  const { staffSession } = useAuth();
  const canViewPurchasePrice = !staffSession || !!staffSession.features?.viewPurchasePrice;
  const barcodeEnabled = !!config.features?.barcode;
  const UNITES = config.itemUnits?.length ? config.itemUnits : DEFAULT_UNITS;
  const defaultUnit = UNITES[0] || 'NOS';

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const primary = theme.palette.primary.main;
  const primaryDark = theme.palette.primary.dark || primary;
  const baseRadius = Number(theme.shape?.borderRadius) || 8;
  const fieldSx = { '& .MuiOutlinedInput-root': { borderRadius: `${baseRadius + 2}px` } };

  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [barcodeItem, setBarcodeItem] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'error' });

  const items = getItems('items').filter(item => item.businessId === currentBusiness?.id);
  const vendors = getItems('parties').filter(p => p.businessId === currentBusiness?.id && (p.type === 'Vendor' || p.type === 'Both'));
  const totalStockValue = items.reduce((s, i) => s + (i.stock || 0) * (i.salePrice || 0), 0);
  const lowStockItems = items.filter(i => (i.stock || 0) <= (i.minStock ?? 5)).length;

  const filteredItems = items.filter(item => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return item.name?.toLowerCase().includes(s) ||
      item.itemCode?.toLowerCase().includes(s) ||
      item.hsnCode?.toLowerCase().includes(s) ||
      item.barcode?.toLowerCase().includes(s) ||
      item.category?.toLowerCase().includes(s) ||
      item.color?.toLowerCase().includes(s) ||
      item.size?.toLowerCase().includes(s) ||
      item.description?.toLowerCase().includes(s) ||
      item.defaultPartyName?.toLowerCase().includes(s);
  });
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
    <Box sx={{ maxWidth: 1440, mx: 'auto' }}>

      {/* ── Hero Header ── */}
      <Box sx={{
        borderRadius: 3,
        background: 'linear-gradient(135deg, #1e1b4b 0%, #3730a3 55%, #4f46e5 100%)',
        p: { xs: 2.5, md: 3.5 }, mb: 3,
        position: 'relative', overflow: 'hidden',
      }}>
        <Box sx={{ position: 'absolute', top: -50, right: -50, width: 220, height: 220, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />
        <Box sx={{ position: 'absolute', bottom: -40, right: 120, width: 160, height: 160, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.03)', pointerEvents: 'none' }} />

        {/* Title row */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2.5, position: 'relative' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.15)', display: 'flex', backdropFilter: 'blur(8px)' }}>
              <Package size={22} color="white" />
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 800, color: 'white', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                Items & Inventory
              </Typography>
              <Typography sx={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.8rem', mt: 0.25 }}>
                {items.length} products · ₹{totalStockValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })} stock value
              </Typography>
            </Box>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Tooltip title="Import">
              <IconButton size="small" onClick={() => setImportOpen(true)}
                sx={{ color: 'white', bgcolor: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 1.5, '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' } }}>
                <Upload size={16} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Export to Excel">
              <IconButton size="small" onClick={() => exportToExcel(items, ITEM_COLUMNS, 'items_export.xlsx')}
                sx={{ color: 'white', bgcolor: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 1.5, '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' } }}>
                <Download size={16} />
              </IconButton>
            </Tooltip>
            <Button variant="contained" size="small" startIcon={<Plus size={15} />} onClick={() => handleOpen()}
              sx={{ bgcolor: 'white', color: '#3730a3', fontWeight: 700, borderRadius: 2, textTransform: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.25)', '&:hover': { bgcolor: 'rgba(255,255,255,0.92)' }, whiteSpace: 'nowrap' }}>
              {isMobile ? t('common.add') : t('items.addItem')}
            </Button>
          </Stack>
        </Box>

        {/* Stats row */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5, position: 'relative' }}>
          {[
            { label: t('items.totalItems'), value: items.length, icon: Package, color: '#a5b4fc' },
            { label: t('items.stockValue'), value: `₹${totalStockValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, icon: TrendingUp, color: '#6ee7b7' },
            { label: t('items.lowNoStock'), value: lowStockItems, icon: AlertTriangle, color: lowStockItems > 0 ? '#fca5a5' : '#86efac' },
          ].map(({ label, value, icon: Icon, color }) => (
            <Box key={label} sx={{
              bgcolor: 'rgba(255,255,255,0.07)', borderRadius: 2, p: { xs: 1.25, sm: 1.75 },
              border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(4px)',
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
                <Icon size={13} color={color} />
                <Typography sx={{ color: 'rgba(255,255,255,0.55)', fontWeight: 600, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {label}
                </Typography>
              </Box>
              <Typography sx={{ color: 'white', fontWeight: 800, fontSize: { xs: '1rem', sm: '1.2rem' }, lineHeight: 1 }}>
                {value}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>

      {/* ── Search bar ── */}
      <Box sx={{ mb: 2.5 }}>
        <TextField
          fullWidth size="small"
          placeholder="Search by name, item code, HSN or barcode…"
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
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: 'background.paper' } }}
        />
      </Box>

      {/* ── Results summary ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
          {search
            ? `${filteredItems.length} result${filteredItems.length !== 1 ? 's' : ''} for "${search}"`
            : `${items.length} item${items.length !== 1 ? 's' : ''}`}
        </Typography>
        {totalPages > 1 && (
          <Typography variant="caption" color="text.disabled">
            Page {page} of {totalPages}
          </Typography>
        )}
      </Box>

      {/* ── Item Grid ── */}
      {filteredItems.length === 0 ? (
        <Box sx={{ py: 12, textAlign: 'center' }}>
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
            <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => handleOpen()}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700, background: `linear-gradient(135deg, ${primary} 0%, ${primaryDark} 100%)` }}>
              Add First Item
            </Button>
          )}
        </Box>
      ) : (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(3, 1fr)' }, gap: 2, mb: 3 }}>
            {paginatedItems.map((item) => {
              const stock = item.stock || 0;
              const sm = getStockMeta(item);
              const margin = item.salePrice && item.purchasePrice && canViewPurchasePrice
                ? Math.round(((item.salePrice - item.purchasePrice) / item.salePrice) * 100)
                : null;

              return (
                <Card key={item.id} elevation={0} sx={{
                  border: '1px solid', borderColor: 'divider', borderRadius: 2.5,
                  overflow: 'hidden', position: 'relative',
                  transition: 'box-shadow 0.2s ease, transform 0.2s ease',
                  '&:hover': { boxShadow: '0 6px 24px rgba(0,0,0,0.09)', transform: 'translateY(-2px)' },
                }}>
                  {/* Stock status stripe */}
                  <Box sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, bgcolor: sm.color }} />

                  <CardContent sx={{ pl: 2.5, pr: 2, pt: 2, pb: '16px !important' }}>
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
                      <Box sx={{ display: 'flex', gap: 0.25, flexShrink: 0, ml: 0.5 }}>
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
                          <Chip label={item.category} size="small" sx={{ height: 18, fontSize: '0.62rem', fontWeight: 600, bgcolor: alpha('#6366f1', 0.08), color: '#4338ca' }} />
                        )}
                        {item.color && (
                          <Chip
                            icon={<Palette size={10} />}
                            label={item.color} size="small"
                            sx={{ height: 18, fontSize: '0.62rem', fontWeight: 600, bgcolor: alpha('#ec4899', 0.08), color: '#be185d', '& .MuiChip-icon': { color: '#be185d', ml: '4px' } }}
                          />
                        )}
                        {item.size && (
                          <Chip
                            icon={<Ruler size={10} />}
                            label={item.size} size="small"
                            sx={{ height: 18, fontSize: '0.62rem', fontWeight: 600, bgcolor: alpha('#0ea5e9', 0.08), color: '#0369a1', '& .MuiChip-icon': { color: '#0369a1', ml: '4px' } }}
                          />
                        )}
                      </Box>
                    )}

                    {/* Description */}
                    {item.description && (
                      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontSize: '0.7rem', lineHeight: 1.4, mb: 0.75, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {item.description}
                      </Typography>
                    )}

                    {/* Divider */}
                    <Divider sx={{ my: 1 }} />

                    {/* Pricing row */}
                    <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 2, mb: 1.25 }}>
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
                      <Box sx={{ ml: 'auto', display: 'flex', gap: 0.75, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {(item.taxRate || 0) > 0 && (
                          <Chip label={`${item.taxRate}% GST`} size="small" sx={{
                            height: 20, fontSize: '0.65rem', fontWeight: 700,
                            bgcolor: alpha('#6366f1', 0.08), color: '#4338ca', border: 'none',
                          }} />
                        )}
                        {margin !== null && margin > 0 && (
                          <Chip label={`${margin}% margin`} size="small" sx={{
                            height: 20, fontSize: '0.65rem', fontWeight: 700,
                            bgcolor: alpha('#059669', 0.08), color: '#047857', border: 'none',
                          }} />
                        )}
                      </Box>
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

                    {/* Default supplier */}
                    {item.defaultPartyName && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.75 }}>
                        <UsersIcon size={11} color="#888" />
                        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.68rem' }} noWrap>
                          {item.defaultPartyName}
                        </Typography>
                      </Box>
                    )}

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

          {/* Pagination */}
          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', pb: 2 }}>
              <Pagination
                count={totalPages} page={page}
                onChange={(_, p) => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                color="primary" shape="rounded"
                sx={{ '& .MuiPaginationItem-root': { borderRadius: 1.5, fontWeight: 600 } }}
              />
            </Box>
          )}
        </>
      )}

      {/* ── Add / Edit Dialog (shared form) ── */}
      <ItemFormDialog
        open={open}
        onClose={handleClose}
        editingItem={editingItem}
      />

      <BarcodeDialog item={barcodeItem} onClose={() => setBarcodeItem(null)} />

      <ImportDialog
        open={importOpen} onClose={() => setImportOpen(false)}
        type="items" existingItems={items}
        onImport={async (row, existing) => {
          const match = existing.find(ex =>
            (ex.itemCode && ex.itemCode === row.itemCode) ||
            ex.name.toLowerCase() === row.name.toLowerCase()
          );
          if (match) {
            await updateItem('items', match.id, { ...row, businessId: currentBusiness.id });
          } else {
            await addItem('items', { ...row, businessId: currentBusiness.id });
          }
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
