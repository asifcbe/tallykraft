import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Button, Typography, IconButton, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField,
  MenuItem, Select, Chip, Tooltip, Backdrop, CircularProgress,
  alpha, useTheme,
} from '@mui/material';
import { X, ClipboardPaste, Save } from 'lucide-react';
import { useData } from './DataContext';
import { useBusiness } from './BusinessContext';
import { useConfig } from './ConfigContext';
import { BUILTIN_PRODUCT_CATEGORIES, loadCustomItemCategories } from './partyUtils';

const DEFAULT_UNITS = ['NOS', 'BAGS', 'BOX', 'KGS', 'Ltr', 'Mtr', 'Pcs'];
const TAX_SLABS = [0, 0.25, 1, 3, 5, 6, 12, 18, 28];

const EDIT_COLS = [
  { key: 'name',          label: 'Name *',          width: 200, required: true },
  { key: 'itemCode',      label: 'Item Code',        width: 120 },
  { key: 'category',      label: 'Category',         width: 150, type: 'category' },
  { key: 'unit',          label: 'Unit',             width: 90,  type: 'unit' },
  { key: 'salePrice',     label: 'Sale Price',       width: 110, numeric: true },
  { key: 'mrp',           label: 'MRP',              width: 100, numeric: true },
  { key: 'purchasePrice', label: 'Purchase Price',   width: 120, numeric: true },
  { key: 'stock',         label: 'Stock',            width: 100, numeric: true },
  { key: 'taxRate',       label: 'GST %',            width: 80,  type: 'tax' },
  { key: 'hsnCode',       label: 'HSN / SAC Code',   width: 130 },
  { key: 'barcode',       label: 'Barcode',          width: 140 },
  { key: 'description',   label: 'Description',      width: 200 },
];

const parsePaste = (text) =>
  text.trim().split('\n').map(line =>
    line.split(/\t|,/).map(c => c.trim().replace(/^"|"$/g, ''))
  );

const ItemBulkEditDialog = ({ open, onClose, items = [], onSuccess }) => {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const { updateItem: _updateItem, updateItems } = useData();
  const { currentBusiness } = useBusiness();
  const { config } = useConfig();

  const allUnits = [...new Set([...DEFAULT_UNITS, ...(config.itemUnits || [])])];

  const customItemCats = currentBusiness?.id ? loadCustomItemCategories(currentBusiness.id, 'product') : [];
  const allCategories = [...BUILTIN_PRODUCT_CATEGORIES, ...customItemCats.filter(c => !BUILTIN_PRODUCT_CATEGORIES.includes(c))];

  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const tableRef = useRef(null);

  useEffect(() => {
    if (open) {
      setRows(items.map(item => ({
        _id: item.id,
        name: item.name || '',
        itemCode: item.itemCode || '',
        category: item.category || '',
        unit: item.unit || 'NOS',
        salePrice: item.salePrice != null ? String(item.salePrice) : '',
        mrp: item.mrp != null ? String(item.mrp) : '',
        purchasePrice: item.purchasePrice != null ? String(item.purchasePrice) : '',
        stock: item.stock != null ? String(item.stock) : '',
        taxRate: item.taxRate != null ? Number(item.taxRate) : 0,
        hsnCode: item.hsnCode || '',
        barcode: item.barcode || '',
        description: item.description || '',
      })));
    }
  }, [open, items]);

  const updateCell = useCallback((rowIdx, key, value) => {
    setRows(prev => {
      const next = [...prev];
      next[rowIdx] = { ...next[rowIdx], [key]: value };
      return next;
    });
  }, []);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const grid = parsePaste(text);
      if (!grid.length) return;
      const firstIsHeader = EDIT_COLS.some(c =>
        c.numeric && grid[0]?.[EDIT_COLS.indexOf(c)] && isNaN(Number(grid[0][EDIT_COLS.indexOf(c)]))
      );
      const dataRows = firstIsHeader ? grid.slice(1) : grid;
      setRows(prev => {
        const next = [...prev];
        dataRows.forEach((cells, ri) => {
          if (ri >= next.length) return;
          EDIT_COLS.forEach((col, ci) => {
            const val = cells[ci] ?? '';
            if (val !== '') next[ri] = { ...next[ri], [col.key]: val };
          });
        });
        return next;
      });
    } catch { /* clipboard denied */ }
  };

  const handleCellPaste = (e, rowIdx, colIdx) => {
    const text = e.clipboardData?.getData('text');
    if (!text || !text.includes('\t')) return;
    e.preventDefault();
    const grid = parsePaste(text);
    setRows(prev => {
      const next = [...prev];
      grid.forEach((cells, ri) => {
        const targetRow = rowIdx + ri;
        if (targetRow >= next.length) return;
        cells.forEach((val, ci) => {
          const targetCol = colIdx + ci;
          if (targetCol < EDIT_COLS.length) {
            next[targetRow] = { ...next[targetRow], [EDIT_COLS[targetCol].key]: val };
          }
        });
      });
      return next;
    });
  };

  const handleSave = () => {
    const invalid = rows.filter(r => !r.name?.trim());
    if (invalid.length) return;
    setSaving(true);
    setTimeout(() => requestAnimationFrame(() => {
      const origById = Object.fromEntries(items.map(i => [i.id, i]));
      const updates = rows.reduce((acc, row) => {
        const orig = origById[row._id];
        if (!orig) return acc;
        acc.push({
          ...orig,
          id: row._id,
          name: row.name.trim(),
          itemCode: row.itemCode?.trim() || '',
          category: row.category?.trim() || '',
          unit: row.unit || 'NOS',
          salePrice: Number(row.salePrice) || 0,
          mrp: Number(row.mrp) || 0,
          purchasePrice: Number(row.purchasePrice) || 0,
          stock: Number(row.stock) || 0,
          taxRate: Number(row.taxRate) || 0,
          hsnCode: row.hsnCode?.trim() || '',
          barcode: row.barcode?.trim() || '',
          description: row.description?.trim() || '',
        });
        return acc;
      }, []);
      updateItems('items', updates);
      setSaving(false);
      if (onSuccess) onSuccess(rows.length);
      onClose();
    }), 0);
  };

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      maxWidth="xl"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3, maxHeight: '92vh', position: 'relative' } }}
    >
      <Backdrop open={saving} sx={{ position: 'absolute', zIndex: 10, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.8)', flexDirection: 'column', gap: 1.5 }}>
        <CircularProgress size={40} sx={{ color: '#0d9488' }} />
        <Typography variant="body2" sx={{ fontWeight: 700, color: '#0d9488' }}>Saving {rows.length} items…</Typography>
      </Backdrop>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1, pt: 2.5, px: 3 }}>
        <Box>
          <Typography sx={{ fontWeight: 800, fontSize: '1.05rem' }}>Bulk Edit Items</Typography>
          <Typography variant="caption" color="text.secondary">
            All items loaded below. Edit inline and click Save — only Name is required.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
          <Tooltip title="Paste Tab-separated data from clipboard">
            <IconButton size="small" onClick={handlePaste}
              sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main', bgcolor: alpha(primary, 0.08) } }}>
              <ClipboardPaste size={16} />
            </IconButton>
          </Tooltip>
          <IconButton size="small" onClick={onClose}><X size={18} /></IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ px: 3, py: 0 }}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5, mt: 1 }}>
          {[
            `${rows.length} items loaded`,
            'Edit any field inline',
            'Paste Tab-separated data from Excel into any cell',
          ].map((tip, i) => (
            <Chip key={i} label={tip} size="small"
              sx={{ height: 20, fontSize: '0.65rem', bgcolor: alpha(primary, 0.05), color: 'text.secondary', border: `1px solid ${alpha(primary, 0.12)}` }} />
          ))}
        </Box>

        <TableContainer ref={tableRef} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, maxHeight: 460, overflow: 'auto' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', bgcolor: alpha(primary, 0.06), color: 'text.secondary', py: 1.25, borderBottom: `2px solid ${alpha(primary, 0.15)}` } }}>
                <TableCell sx={{ width: 44, pl: 1.5 }}>#</TableCell>
                {EDIT_COLS.map(col => (
                  <TableCell key={col.key} sx={{ minWidth: col.width }}>
                    {col.label}
                    {col.required && <Box component="span" sx={{ color: 'error.main', ml: 0.25 }}>*</Box>}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, rowIdx) => {
                const hasError = !row.name?.trim();
                return (
                  <TableRow
                    key={row._id}
                    sx={{
                      bgcolor: hasError ? alpha('#ef4444', 0.03) : alpha(primary, 0.01),
                      '& td': { py: 0.4, borderColor: alpha(primary, 0.07) },
                      '&:hover': { bgcolor: alpha(primary, 0.04) },
                    }}
                  >
                    <TableCell sx={{ pl: 1.5, color: 'text.disabled', fontSize: '0.72rem', fontWeight: 600 }}>
                      {rowIdx + 1}
                    </TableCell>
                    {EDIT_COLS.map((col, colIdx) => (
                      <TableCell key={col.key} sx={{ p: 0.4 }}>
                        {col.type === 'category' ? (
                          <Select
                            size="small"
                            value={row[col.key] || ''}
                            onChange={e => updateCell(rowIdx, col.key, e.target.value)}
                            displayEmpty
                            sx={{ fontSize: '0.8rem', minWidth: 140, '& .MuiOutlinedInput-notchedOutline': { borderColor: alpha(primary, 0.15) } }}
                            MenuProps={{ PaperProps: { sx: { maxHeight: 260 } } }}
                          >
                            <MenuItem value="" sx={{ fontSize: '0.78rem', color: 'text.disabled' }}>None</MenuItem>
                            {allCategories.map(cat => (
                              <MenuItem key={cat} value={cat} sx={{ fontSize: '0.78rem' }}>{cat}</MenuItem>
                            ))}
                          </Select>
                        ) : col.type === 'unit' ? (
                          <Select
                            size="small"
                            value={row[col.key] || 'NOS'}
                            onChange={e => updateCell(rowIdx, col.key, e.target.value)}
                            sx={{ fontSize: '0.8rem', minWidth: 80, '& .MuiOutlinedInput-notchedOutline': { borderColor: alpha(primary, 0.15) } }}
                          >
                            {allUnits.map(u => <MenuItem key={u} value={u} sx={{ fontSize: '0.8rem' }}>{u}</MenuItem>)}
                          </Select>
                        ) : col.type === 'tax' ? (
                          <Select
                            size="small"
                            value={Number(row[col.key]) || 0}
                            onChange={e => updateCell(rowIdx, col.key, e.target.value)}
                            sx={{ fontSize: '0.8rem', minWidth: 70, '& .MuiOutlinedInput-notchedOutline': { borderColor: alpha(primary, 0.15) } }}
                          >
                            {TAX_SLABS.map(t => <MenuItem key={t} value={t} sx={{ fontSize: '0.8rem' }}>{t}%</MenuItem>)}
                          </Select>
                        ) : (
                          <TextField
                            size="small"
                            fullWidth
                            value={row[col.key] ?? ''}
                            onChange={e => {
                              let val = e.target.value;
                              updateCell(rowIdx, col.key, val);
                            }}
                            onPaste={e => handleCellPaste(e, rowIdx, colIdx)}
                            type={col.numeric ? 'number' : 'text'}
                            inputProps={col.numeric ? { step: 'any', min: 0, style: { textAlign: 'right' } } : {}}
                            sx={{
                              '& .MuiOutlinedInput-root': {
                                fontSize: '0.8rem',
                                '& fieldset': { borderColor: hasError && col.required ? 'error.main' : alpha(primary, 0.15) },
                              },
                            }}
                          />
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {rows.length} items • scroll right for more columns
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, pt: 1.5, gap: 1 }}>
        <Button onClick={onClose} sx={{ fontWeight: 600 }} disabled={saving}>Cancel</Button>
        <Button
          variant="contained"
          startIcon={<Save size={15} />}
          onClick={handleSave}
          disabled={saving || rows.some(r => !r.name?.trim())}
          sx={{
            fontWeight: 700, textTransform: 'none', borderRadius: 2,
            background: `linear-gradient(135deg, ${primary} 0%, ${theme.palette.primary.dark || primary} 100%)`,
            boxShadow: `0 4px 12px ${alpha(primary, 0.3)}`,
          }}
        >
          {saving ? 'Saving…' : `Save ${rows.length} Items`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ItemBulkEditDialog;
