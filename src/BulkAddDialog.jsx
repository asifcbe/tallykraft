import React, { useState, useCallback, useRef, memo, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Button, Typography, IconButton, TextField,
  MenuItem, Select, Chip, Tooltip, Alert, Autocomplete,
  Backdrop, CircularProgress,
  alpha, useTheme,
} from '@mui/material';
import { FixedSizeList } from 'react-window';
import { X, Plus, Trash2, ClipboardPaste, Download } from 'lucide-react';
import { useData } from './DataContext';
import { useBusiness } from './BusinessContext';
import { useConfig } from './ConfigContext';
import { COUNTRY_CODES, CUSTOMER_CATEGORIES, VENDOR_CATEGORIES, generatePartyId, loadCustomCategories, BUILTIN_PRODUCT_CATEGORIES, loadCustomItemCategories } from './partyUtils';
import { generateBarcode } from './ItemFormDialog';

const DEFAULT_UNITS = ['NOS', 'BAGS', 'BOX', 'KGS', 'Ltr', 'Mtr', 'Pcs'];
const TAX_SLABS = [0, 0.25, 1, 3, 5, 6, 12, 18, 28, 28.5, 43];
const INITIAL_ROWS = 20;
const ROW_HEIGHT = 42;   // px per row in virtual list
const VISIBLE_ROWS = 14; // rows shown in the scrollable viewport

/* ─── Party columns ─── */
const PARTY_COLS = [
  { key: 'name',        label: 'Name *',          width: 170, required: true },
  { key: 'countryCode', label: 'CC',               width: 90,  type: 'countryCode' },
  { key: 'phone',       label: 'Phone',            width: 130, phoneOnly: true },
  { key: 'category',    label: 'Category',         width: 140, type: 'category' },
  { key: 'balanceDir',  label: 'Balance',          width: 160, type: 'balanceDir' },
  { key: 'balanceAmt',  label: 'Amt',              width: 100, numeric: true, positiveOnly: true },
  { key: 'gstNumber',   label: 'GSTIN',            width: 140 },
  { key: 'address',     label: 'Address',          width: 180 },
];

/* ─── Item columns ─── */
const ITEM_COLS = [
  { key: 'name',          label: 'Name *',         width: 180, required: true },
  { key: 'itemCode',      label: 'Item Code',      width: 100 },
  { key: 'category',      label: 'Category',       width: 130, type: 'itemCategory' },
  { key: 'unit',          label: 'Unit',           width: 80,  type: 'unit' },
  { key: 'salePrice',     label: 'Sale ₹',         width: 90,  numeric: true },
  { key: 'mrp',           label: 'MRP ₹',          width: 90,  numeric: true },
  { key: 'purchasePrice', label: 'Purchase ₹',     width: 100, numeric: true },
  { key: 'stock',         label: 'Stock',          width: 80,  numeric: true },
  { key: 'taxRate',       label: 'GST %',          width: 80,  type: 'tax' },
  { key: 'compositeScheme', label: 'Comp.',        width: 70,  type: 'toggle' },
  { key: 'hsnCode',       label: 'HSN/SAC',        width: 100 },
  { key: 'minStock',      label: 'Min Stock',      width: 90,  numeric: true },
  { key: 'barcode',       label: 'Barcode',        width: 120 },
  { key: 'color',         label: 'Color',          width: 90 },
  { key: 'size',          label: 'Size',           width: 90 },
  { key: 'description',   label: 'Description',    width: 160 },
];

/* Parse a pasted TSV/CSV blob into a 2-D array */
const parsePaste = (text) =>
  text.trim().split('\n').map(line =>
    line.split(/\t|,/).map(c => c.trim().replace(/^"|"$/g, ''))
  );

const normalisePartyType = (raw) => {
  const s = (raw || '').toString().trim().toLowerCase();
  if (s === 'customer') return 'Customer';
  if (s === 'vendor' || s === 'supplier') return 'Vendor';
  return null;
};

/* ─── Cell — renders a single editable cell, fully memoized ─── */
const Cell = memo(function Cell({
  col, colIdx, rowIdx, value, primary, allCategories, allItemCategories, allUnits,
  defaultUnit, isParty, updateCell, handleCellPaste, isFirst,
}) {
  if (col.type === 'balanceDir') {
    return (
      <Box sx={{ display: 'flex', gap: 0.3, p: 0.25, bgcolor: 'action.hover', borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}>
        {[
          { value: 'collect', label: 'Collect', activeColor: '#6366f1', activeBg: 'rgba(129,140,248,0.1)', activeBorder: 'rgba(129,140,248,0.35)' },
          { value: 'pay',     label: 'Pay',     activeColor: '#dc2626', activeBg: 'rgba(239,68,68,0.1)',   activeBorder: 'rgba(239,68,68,0.35)' },
        ].map(opt => {
          const active = (value || 'collect') === opt.value;
          return (
            <Box key={opt.value} onClick={() => updateCell(rowIdx, col.key, opt.value)} sx={{
              px: 0.75, py: 0.3, borderRadius: 1.25, cursor: 'pointer', userSelect: 'none',
              fontSize: '0.68rem', fontWeight: 700, whiteSpace: 'nowrap',
              bgcolor: active ? opt.activeBg : 'transparent',
              color: active ? opt.activeColor : 'text.disabled',
              border: '1px solid', borderColor: active ? opt.activeBorder : 'transparent',
            }}>{opt.label}</Box>
          );
        })}
      </Box>
    );
  }
  if (col.type === 'countryCode') {
    return (
      <Autocomplete
        size="small"
        options={COUNTRY_CODES}
        value={COUNTRY_CODES.find(c => c.code === (value || '+91')) || COUNTRY_CODES.find(c => c.code === '+91')}
        onChange={(_, v) => updateCell(rowIdx, col.key, v?.code || '+91')}
        getOptionLabel={(o) => o.code}
        renderOption={(props, o) => (
          <Box component="li" {...props} sx={{ fontSize: '0.75rem', gap: 0.75 }}>
            <span style={{ fontWeight: 700, minWidth: 32 }}>{o.code}</span>
            <span style={{ color: '#666', fontSize: '0.7rem' }}>{o.name}</span>
          </Box>
        )}
        renderInput={(params) => <TextField {...params} sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.78rem', py: '1px' } }} />}
        disableClearable
        sx={{ minWidth: 80 }}
        ListboxProps={{ style: { maxHeight: 200 } }}
      />
    );
  }
  if (col.type === 'category' || col.type === 'itemCategory') {
    const options = col.type === 'category' ? allCategories : allItemCategories;
    return (
      <Select size="small" value={value || ''} onChange={e => updateCell(rowIdx, col.key, e.target.value)} displayEmpty
        sx={{ fontSize: '0.78rem', minWidth: col.width - 8, '& .MuiOutlinedInput-notchedOutline': { borderColor: alpha(primary, 0.15) }, '& .MuiSelect-select': { py: '5px' } }}
        MenuProps={{ PaperProps: { sx: { maxHeight: 240 } } }}>
        <MenuItem value="" sx={{ fontSize: '0.75rem', color: 'text.disabled' }}>—</MenuItem>
        {options.map(cat => <MenuItem key={cat} value={cat} sx={{ fontSize: '0.75rem' }}>{cat}</MenuItem>)}
      </Select>
    );
  }
  if (col.type === 'unit') {
    return (
      <Select size="small" value={value || defaultUnit} onChange={e => updateCell(rowIdx, col.key, e.target.value)}
        sx={{ fontSize: '0.78rem', minWidth: 72, '& .MuiOutlinedInput-notchedOutline': { borderColor: alpha(primary, 0.15) }, '& .MuiSelect-select': { py: '5px' } }}>
        {allUnits.map(u => <MenuItem key={u} value={u} sx={{ fontSize: '0.78rem' }}>{u}</MenuItem>)}
      </Select>
    );
  }
  if (col.type === 'tax') {
    return (
      <Select size="small" value={Number(value) || 0} onChange={e => updateCell(rowIdx, col.key, e.target.value)}
        sx={{ fontSize: '0.78rem', minWidth: 72, '& .MuiOutlinedInput-notchedOutline': { borderColor: alpha(primary, 0.15) }, '& .MuiSelect-select': { py: '5px' } }}>
        {TAX_SLABS.map(t => <MenuItem key={t} value={t} sx={{ fontSize: '0.78rem' }}>{t}%</MenuItem>)}
      </Select>
    );
  }
  if (col.type === 'toggle') {
    const on = !!value;
    return (
      <Box onClick={() => updateCell(rowIdx, col.key, !on)} sx={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        px: 1, py: 0.35, borderRadius: 1.5, cursor: 'pointer', userSelect: 'none',
        fontSize: '0.68rem', fontWeight: 700,
        bgcolor: on ? alpha(primary, 0.12) : 'action.hover',
        color: on ? primary : 'text.disabled',
        border: '1px solid', borderColor: on ? alpha(primary, 0.35) : 'divider',
      }}>{on ? 'Yes' : 'No'}</Box>
    );
  }
  /* Uncontrolled text — zero re-renders while typing */
  return (
    <TextField size="small" fullWidth
      key={`${rowIdx}-${col.key}-${value}`}
      defaultValue={value ?? ''}
      onBlur={e => {
        let v = e.target.value;
        if (col.phoneOnly) v = v.replace(/\D/g, '');
        if (col.positiveOnly) v = v.replace(/-/g, '');
        updateCell(rowIdx, col.key, v);
      }}
      onPaste={e => handleCellPaste(e, rowIdx, colIdx)}
      type={col.numeric ? 'number' : 'text'}
      inputProps={{
        ...(col.numeric ? { step: 'any', min: col.positiveOnly ? 0 : undefined, style: { textAlign: 'right', padding: '4px 6px' } } : { style: { padding: '4px 6px' } }),
        ...(col.phoneOnly ? { inputMode: 'numeric', maxLength: 15 } : {}),
      }}
      placeholder={col.required && isFirst ? (isParty ? 'Rahul Sharma' : 'Widget A') : ''}
      sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.78rem', '& fieldset': { borderColor: alpha(primary, 0.15) } } }}
    />
  );
}, (prev, next) => {
  /* Only re-render if the displayed value or reactive props changed */
  return prev.value === next.value &&
    prev.rowIdx === next.rowIdx &&
    prev.primary === next.primary &&
    prev.defaultUnit === next.defaultUnit;
});

/* ─── Virtual row renderer ─── */
const VirtualRow = memo(function VirtualRow({ index, style, data }) {
  const {
    rowsRef, COLS, isParty, defaultUnit, allCategories, allItemCategories, allUnits,
    primary, updateCell, deleteRow, handleCellPaste, cellValues,
  } = data;
  const row = rowsRef.current[index];
  if (!row) return null;

  return (
    <div style={{ ...style, display: 'flex', alignItems: 'center', borderBottom: '1px solid rgba(0,0,0,0.06)', boxSizing: 'border-box' }}>
      {/* Row number */}
      <div style={{ width: 36, minWidth: 36, textAlign: 'center', fontSize: '0.68rem', color: '#999', fontWeight: 600, flexShrink: 0 }}>
        {index + 1}
      </div>
      {COLS.map((col, colIdx) => (
        <div key={col.key} style={{ width: col.width, minWidth: col.width, padding: '2px 3px', flexShrink: 0 }}>
          <Cell
            col={col}
            colIdx={colIdx}
            rowIdx={index}
            value={cellValues[index]?.[col.key] ?? row[col.key]}
            primary={primary}
            allCategories={allCategories}
            allItemCategories={allItemCategories}
            allUnits={allUnits}
            defaultUnit={defaultUnit}
            isParty={isParty}
            isFirst={index === 0}
            updateCell={updateCell}
            handleCellPaste={handleCellPaste}
          />
        </div>
      ))}
      {/* Delete */}
      <div style={{ width: 36, minWidth: 36, textAlign: 'center', flexShrink: 0 }}>
        <IconButton size="small" onClick={() => deleteRow(index)}
          sx={{ color: 'text.disabled', p: '3px', '&:hover': { color: 'error.main', bgcolor: 'rgba(220,38,38,0.06)' } }}>
          <Trash2 size={12} />
        </IconButton>
      </div>
    </div>
  );
});

/* ─── Header row ─── */
const HeaderRow = ({ COLS, primary }) => (
  <div style={{ display: 'flex', alignItems: 'center', borderBottom: `2px solid ${alpha(primary, 0.15)}`, background: alpha(primary, 0.05), fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#666', height: 36 }}>
    <div style={{ width: 36, minWidth: 36, textAlign: 'center', flexShrink: 0 }}>#</div>
    {COLS.map(col => (
      <div key={col.key} style={{ width: col.width, minWidth: col.width, padding: '0 3px', flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {col.label}{col.required && <span style={{ color: '#e53935' }}> *</span>}
      </div>
    ))}
    <div style={{ width: 36, minWidth: 36, flexShrink: 0 }} />
  </div>
);

/* ─── Main Dialog ─── */
const BulkAddDialog = ({ open, onClose, type = 'customer', onSuccess }) => {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const { addItems, getItems } = useData();
  const { currentBusiness } = useBusiness();
  const { config } = useConfig();
  const [saving, setSaving] = useState(false);
  const [pasteError, setPasteError] = useState('');
  const [filledCount, setFilledCount] = useState(0);
  const [rowCount, setRowCount] = useState(INITIAL_ROWS);
  /* cellValues mirrors reactive fields (selects/toggles/balanceDir) for Cell re-renders */
  const [cellValues, setCellValues] = useState({});
  const listRef = useRef(null);

  const isParty = type === 'customer' || type === 'vendor';
  const partyType = type === 'customer' ? 'Customer' : 'Vendor';
  const allUnits = [...DEFAULT_UNITS, ...(config.itemUnits || []).filter(u => !DEFAULT_UNITS.includes(u))];
  const defaultUnit = config.defaultItemUnit && allUnits.includes(config.defaultItemUnit)
    ? config.defaultItemUnit : (allUnits[0] || 'NOS');
  const COLS = isParty ? PARTY_COLS : ITEM_COLS;

  const builtinCats = partyType === 'Customer' ? CUSTOMER_CATEGORIES : VENDOR_CATEGORIES;
  const customCats = currentBusiness?.id ? loadCustomCategories(currentBusiness.id, partyType) : [];
  const allCategories = [...builtinCats, ...customCats.filter(c => !builtinCats.includes(c))];
  const customItemCats = currentBusiness?.id ? loadCustomItemCategories(currentBusiness.id, 'product') : [];
  const allItemCategories = [...BUILTIN_PRODUCT_CATEGORIES, ...customItemCats.filter(c => !BUILTIN_PRODUCT_CATEGORIES.includes(c))];

  const makeEmptyData = useCallback(() => ({
    name: '', countryCode: '+91', phone: '', category: '', balanceDir: 'collect', balanceAmt: '',
    gstNumber: '', address: '', partyType: '',
    itemCode: '', unit: defaultUnit, salePrice: '', mrp: '', purchasePrice: '', stock: '',
    taxRate: 0, compositeScheme: false, hsnCode: '', minStock: '', barcode: '',
    color: '', size: '', description: '',
  }), [defaultUnit]);

  /* rowsRef is the data store — plain array, no React involvement */
  const rowsRef = useRef(null);
  if (!rowsRef.current) {
    rowsRef.current = Array.from({ length: INITIAL_ROWS }, makeEmptyData);
  }

  const title = type === 'customer' ? 'Bulk Add Customers'
    : type === 'vendor' ? 'Bulk Add Vendors'
    : 'Bulk Add Items';

  const syncFilledCount = useCallback(() => {
    setFilledCount(rowsRef.current.filter(r => r.name?.trim()).length);
  }, []);

  /* Ensure rowsRef stays in sync when dialog opens fresh */
  useEffect(() => {
    if (open) {
      rowsRef.current = Array.from({ length: INITIAL_ROWS }, makeEmptyData);
      setRowCount(INITIAL_ROWS);
      setCellValues({});
      setFilledCount(0);
      setPasteError('');
    }
  }, [open, makeEmptyData]);

  const handleClose = () => {
    rowsRef.current = Array.from({ length: INITIAL_ROWS }, makeEmptyData);
    setRowCount(INITIAL_ROWS);
    setCellValues({});
    setFilledCount(0);
    setPasteError('');
    onClose();
  };

  /*
   * updateCell: writes to ref always.
   * For reactive fields (selects/toggles/clicks), also updates cellValues state
   * so the Cell re-renders with the new value.
   * For text fields (called from onBlur), only writes to ref — no re-render.
   */
  const updateCell = useCallback((rowIdx, key, value) => {
    if (!rowsRef.current[rowIdx]) return;
    rowsRef.current[rowIdx] = { ...rowsRef.current[rowIdx], [key]: value };

    const isReactiveField = ['balanceDir', 'compositeScheme', 'taxRate', 'unit',
      'category', 'itemCategory', 'countryCode'].includes(key);

    if (key === 'name') {
      syncFilledCount();
    } else if (isReactiveField) {
      setCellValues(prev => ({
        ...prev,
        [rowIdx]: { ...(prev[rowIdx] || {}), [key]: value },
      }));
    }
  }, [syncFilledCount]);

  const deleteRow = useCallback((rowIdx) => {
    rowsRef.current.splice(rowIdx, 1);
    setRowCount(rowsRef.current.length);
    setCellValues(prev => {
      /* Shift cellValues indices down */
      const next = {};
      Object.entries(prev).forEach(([idx, vals]) => {
        const i = Number(idx);
        if (i < rowIdx) next[i] = vals;
        else if (i > rowIdx) next[i - 1] = vals;
      });
      return next;
    });
    syncFilledCount();
  }, [syncFilledCount]);

  const addMoreRows = useCallback((n = 10) => {
    const newRows = Array.from({ length: n }, makeEmptyData);
    rowsRef.current = [...rowsRef.current, ...newRows];
    setRowCount(rowsRef.current.length);
    listRef.current?.scrollToItem(rowsRef.current.length - 1, 'end');
  }, [makeEmptyData]);

  /* Clipboard paste — writes directly to ref, bumps rowCount if needed */
  const handlePaste = useCallback(async () => {
    setPasteError('');
    try {
      const text = await navigator.clipboard.readText();
      const grid = parsePaste(text);
      if (!grid.length) return;
      const firstIsHeader = COLS.some(c =>
        c.numeric && grid[0]?.[COLS.indexOf(c)] && isNaN(Number(grid[0][COLS.indexOf(c)]))
      );
      const dataRows = firstIsHeader ? grid.slice(1) : grid;

      dataRows.forEach((cells, ri) => {
        if (ri >= rowsRef.current.length) rowsRef.current.push(makeEmptyData());
        const updated = { ...rowsRef.current[ri] };
        COLS.forEach((col, ci) => { updated[col.key] = cells[ci] ?? ''; });
        rowsRef.current[ri] = updated;
      });

      /* Re-sync reactive cellValues from pasted data */
      const newCellValues = {};
      dataRows.forEach((_, ri) => {
        const row = rowsRef.current[ri];
        newCellValues[ri] = {};
        COLS.forEach(col => {
          if (['balanceDir','compositeScheme','taxRate','unit','category','countryCode'].includes(col.type || col.key)) {
            newCellValues[ri][col.key] = row[col.key];
          }
        });
      });
      setCellValues(prev => ({ ...prev, ...newCellValues }));
      setRowCount(rowsRef.current.length);
      syncFilledCount();
    } catch {
      setPasteError('Clipboard access denied. Paste directly into a cell instead.');
    }
  }, [COLS, makeEmptyData, syncFilledCount]);

  const handleCellPaste = useCallback((e, rowIdx, colIdx) => {
    const text = e.clipboardData?.getData('text');
    if (!text || !text.includes('\t')) return;
    e.preventDefault();
    const grid = parsePaste(text);

    grid.forEach((cells, ri) => {
      const targetRow = rowIdx + ri;
      if (targetRow >= rowsRef.current.length) rowsRef.current.push(makeEmptyData());
      const updated = { ...rowsRef.current[targetRow] };
      cells.forEach((val, ci) => {
        const targetCol = colIdx + ci;
        if (targetCol < COLS.length) updated[COLS[targetCol].key] = val;
      });
      rowsRef.current[targetRow] = updated;
    });

    setRowCount(rowsRef.current.length);
    syncFilledCount();
  }, [COLS, makeEmptyData, syncFilledCount]);

  const handleSave = () => {
    const toSave = rowsRef.current.filter(r => r.name?.trim());
    if (!toSave.length) return;
    setSaving(true);
    setTimeout(() => {
      const existingParties = currentBusiness?.id
        ? getItems('parties').filter(p => p.businessId === currentBusiness.id) : [];

      let mapped;
      if (isParty) {
        mapped = [];
        const batchParties = [...existingParties];
        toSave.forEach(row => {
          const resolvedType = (row.partyType ? normalisePartyType(row.partyType) : null) || partyType;
          const partyId = generatePartyId(resolvedType, batchParties);
          const record = {
            businessId: currentBusiness.id, type: resolvedType, partyId,
            name: row.name.trim(), countryCode: row.countryCode || '+91',
            phone: row.phone?.trim() || '', category: row.category?.trim() || '',
            balance: (row.balanceDir === 'pay' ? -1 : 1) * (Math.abs(Number(row.balanceAmt)) || 0),
            gstNumber: row.gstNumber?.trim() || '', address: row.address?.trim() || '',
          };
          mapped.push(record);
          batchParties.push({ partyId, type: resolvedType });
        });
      } else {
        const existingItems = currentBusiness?.id
          ? getItems('items').filter(it => it.businessId === currentBusiness.id) : [];
        const usedBarcodes = new Set(existingItems.map(it => it.barcode).filter(Boolean));
        const uniqueBarcode = (raw) => {
          const trimmed = raw?.trim() || '';
          if (trimmed) { usedBarcodes.add(trimmed); return trimmed; }
          let bc;
          do { bc = generateBarcode(); } while (usedBarcodes.has(bc));
          usedBarcodes.add(bc);
          return bc;
        };
        mapped = toSave.map(row => ({
          businessId: currentBusiness.id, name: row.name.trim(),
          itemCode: row.itemCode?.trim() || '', category: row.category?.trim() || '',
          unit: row.unit || defaultUnit, salePrice: Number(row.salePrice) || 0,
          mrp: Number(row.mrp) || 0, purchasePrice: Number(row.purchasePrice) || 0,
          stock: Number(row.stock) || 0, taxRate: Number(row.taxRate) || 0,
          compositeScheme: !!row.compositeScheme, hsnCode: row.hsnCode?.trim() || '',
          minStock: row.minStock !== '' && row.minStock != null ? Number(row.minStock) : null,
          barcode: uniqueBarcode(row.barcode), color: row.color?.trim() || '',
          size: row.size?.trim() || '', description: row.description?.trim() || '',
        }));
      }

      addItems(isParty ? 'parties' : 'items', mapped);
      setSaving(false);
      if (onSuccess) onSuccess(mapped.length);
      handleClose();
    }, 0);
  };

  const downloadTemplate = () => {
    const header = COLS.map(c => c.label.replace(' *', '')).join(',');
    const sample = isParty
      ? 'Rahul Sharma,+91,9876543210,Retail,To Collect,5000,,Mumbai'
      : 'Widget A,WID001,Electronics,NOS,150,175,100,50,18,,Product description';
    const blob = new Blob([header + '\n' + sample], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `bulk_${type}_template.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  /* Total width of the virtual list = row# + all col widths + delete */
  const totalWidth = 36 + COLS.reduce((s, c) => s + c.width, 0) + 6 + 36;
  const listHeight = ROW_HEIGHT * VISIBLE_ROWS;

  const itemData = {
    rowsRef, COLS, isParty, defaultUnit, allCategories, allItemCategories, allUnits,
    primary, updateCell, deleteRow, handleCellPaste, cellValues,
  };

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : handleClose}
      maxWidth={false}
      PaperProps={{ sx: { borderRadius: 3, maxHeight: '92vh', position: 'relative', width: Math.min(totalWidth + 48, window.innerWidth - 32) } }}
    >
      <Backdrop open={saving} sx={{ position: 'absolute', zIndex: 10, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.75)', flexDirection: 'column', gap: 1.5 }}>
        <CircularProgress size={40} sx={{ color: '#6366f1' }} />
        <Typography variant="body2" sx={{ fontWeight: 700, color: '#6366f1' }}>
          Saving {filledCount} {isParty ? (type === 'customer' ? 'customers' : 'vendors') : 'items'}…
        </Typography>
      </Backdrop>

      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1, pt: 2.5, px: 3 }}>
        <Box>
          <Typography sx={{ fontWeight: 800, fontSize: '1.05rem' }}>{title}</Typography>
          <Typography variant="caption" color="text.secondary">
            Only rows with a name are saved. Paste Tab-separated data from Excel.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
          <Tooltip title="Download CSV template">
            <IconButton size="small" onClick={downloadTemplate}
              sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main', bgcolor: alpha(primary, 0.08) } }}>
              <Download size={16} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Paste from clipboard (Tab-separated)">
            <IconButton size="small" onClick={handlePaste}
              sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main', bgcolor: alpha(primary, 0.08) } }}>
              <ClipboardPaste size={16} />
            </IconButton>
          </Tooltip>
          <IconButton size="small" onClick={handleClose} disabled={saving}><X size={18} /></IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ px: 3, py: 0 }}>
        {pasteError && (
          <Alert severity="warning" sx={{ mb: 1.5, borderRadius: 2 }} onClose={() => setPasteError('')}>
            {pasteError}
          </Alert>
        )}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5, mt: 1 }}>
          {[
            'Paste Tab-separated data from Excel directly into any cell',
            'Only rows with a Name are saved',
            isParty ? 'Collect = they owe you · Pay = you owe them' : 'Leave blank to start at 0',
          ].map((tip, i) => (
            <Chip key={i} label={tip} size="small" sx={{ height: 20, fontSize: '0.65rem', bgcolor: alpha(primary, 0.05), color: 'text.secondary', border: `1px solid ${alpha(primary, 0.12)}` }} />
          ))}
        </Box>

        {/* Virtual scrolling grid */}
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
          <Box sx={{ overflowX: 'auto' }}>
            <Box sx={{ minWidth: totalWidth }}>
              <HeaderRow COLS={COLS} primary={primary} />
              <FixedSizeList
                ref={listRef}
                height={listHeight}
                itemCount={rowCount}
                itemSize={ROW_HEIGHT}
                width="100%"
                itemData={itemData}
                overscanCount={5}
              >
                {VirtualRow}
              </FixedSizeList>
            </Box>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1.5 }}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button size="small" startIcon={<Plus size={13} />} onClick={() => addMoreRows(10)}
              sx={{ fontWeight: 600, textTransform: 'none', color: primary }}>
              +10 rows
            </Button>
            <Button size="small" startIcon={<Plus size={13} />} onClick={() => addMoreRows(100)}
              sx={{ fontWeight: 600, textTransform: 'none', color: primary }}>
              +100 rows
            </Button>
          </Box>
          <Typography variant="caption" color="text.secondary">
            {filledCount} filled · {rowCount} total rows
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, pt: 1.5, gap: 1 }}>
        <Button onClick={handleClose} disabled={saving} sx={{ fontWeight: 600 }}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving || filledCount === 0}
          sx={{
            fontWeight: 700, textTransform: 'none', borderRadius: 2,
            background: `linear-gradient(135deg, ${primary} 0%, ${theme.palette.primary.dark || primary} 100%)`,
            boxShadow: `0 4px 12px ${alpha(primary, 0.3)}`,
          }}>
          {`Save ${filledCount || ''} ${isParty ? (type === 'customer' ? 'Customers' : 'Vendors') : 'Items'}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BulkAddDialog;
