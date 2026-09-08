import React, { useState, useCallback, useRef } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Button, Typography, IconButton, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField,
  MenuItem, Select, Chip, Tooltip, Alert,
  alpha, useTheme,
} from '@mui/material';
import { X, Plus, Trash2, ClipboardPaste, CheckCircle2, AlertCircle, Download } from 'lucide-react';
import { useData } from './DataContext';
import { useBusiness } from './BusinessContext';
import { useConfig } from './ConfigContext';

const DEFAULT_UNITS = ['NOS', 'BAGS', 'BOX', 'KGS', 'Ltr', 'Mtr', 'Pcs'];
const TAX_SLABS = [0, 5, 12, 18, 28];
const INITIAL_ROWS = 10;

/* ─── Party columns ─── */
const PARTY_COLS = [
  { key: 'name',       label: 'Name *',          width: 200, required: true },
  { key: 'phone',      label: 'Phone',            width: 130 },
  { key: 'balance',    label: 'Opening Balance',  width: 140, numeric: true },
  { key: 'gstNumber',  label: 'GST Number',       width: 150 },
  { key: 'address',    label: 'Address',          width: 200 },
];

/* ─── Item columns ─── */
const ITEM_COLS = [
  { key: 'name',          label: 'Name *',         width: 180, required: true },
  { key: 'itemCode',      label: 'Item Code',      width: 110 },
  { key: 'unit',          label: 'Unit',           width: 90,  type: 'unit' },
  { key: 'salePrice',     label: 'Sale Price',     width: 110, numeric: true },
  { key: 'purchasePrice', label: 'Purchase Price', width: 120, numeric: true },
  { key: 'stock',         label: 'Opening Stock',  width: 120, numeric: true },
  { key: 'taxRate',       label: 'GST %',          width: 80,  type: 'tax' },
  { key: 'hsnCode',       label: 'HSN Code',       width: 110 },
];

const emptyPartyRow = () => ({
  name: '', phone: '', balance: '', gstNumber: '', address: '', _id: Math.random(),
});
const emptyItemRow = (defaultUnit) => ({
  name: '', itemCode: '', unit: defaultUnit || 'NOS', salePrice: '', purchasePrice: '',
  stock: '', taxRate: 0, hsnCode: '', _id: Math.random(),
});

const makeRows = (n, factory) => Array.from({ length: n }, factory);

/* Parse a pasted TSV/CSV blob into a 2-D array */
const parsePaste = (text) =>
  text.trim().split('\n').map(line =>
    line.split(/\t|,/).map(c => c.trim().replace(/^"|"$/g, ''))
  );

const BulkAddDialog = ({ open, onClose, type = 'customer' }) => {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const { addItems } = useData();
  const { currentBusiness } = useBusiness();
  const { config } = useConfig();

  const isParty = type === 'customer' || type === 'vendor';
  const partyType = type === 'customer' ? 'Customer' : 'Vendor';
  const allUnits = [...DEFAULT_UNITS, ...(config.itemUnits || []).filter(u => !DEFAULT_UNITS.includes(u))];
  const defaultUnit = config.defaultItemUnit && allUnits.includes(config.defaultItemUnit)
    ? config.defaultItemUnit : (allUnits[0] || 'NOS');

  const COLS = isParty ? PARTY_COLS : ITEM_COLS;
  const makeEmpty = isParty ? emptyPartyRow : () => emptyItemRow(defaultUnit);

  const [rows, setRows] = useState(() => makeRows(INITIAL_ROWS, makeEmpty));
  const [result, setResult] = useState(null); // { saved, skipped }
  const [pasteError, setPasteError] = useState('');
  const tableRef = useRef(null);

  const title = type === 'customer' ? 'Bulk Add Customers'
    : type === 'vendor' ? 'Bulk Add Vendors'
    : 'Bulk Add Items';

  const handleClose = () => {
    setRows(makeRows(INITIAL_ROWS, makeEmpty));
    setResult(null);
    setPasteError('');
    onClose();
  };

  const updateCell = useCallback((rowIdx, key, value) => {
    setRows(prev => {
      const next = [...prev];
      next[rowIdx] = { ...next[rowIdx], [key]: value };
      return next;
    });
  }, []);

  const deleteRow = useCallback((rowIdx) => {
    setRows(prev => prev.filter((_, i) => i !== rowIdx));
  }, []);

  const addMoreRows = () =>
    setRows(prev => [...prev, ...makeRows(10, makeEmpty)]);

  /* Paste handler — reads clipboard and fills rows from top */
  const handlePaste = async () => {
    setPasteError('');
    try {
      const text = await navigator.clipboard.readText();
      const grid = parsePaste(text);
      if (!grid.length) return;

      /* Detect if first row looks like a header (no numbers in numeric cols) */
      const firstIsHeader = COLS.some(c =>
        c.numeric && grid[0]?.[COLS.indexOf(c)] && isNaN(Number(grid[0][COLS.indexOf(c)]))
      );
      const dataRows = firstIsHeader ? grid.slice(1) : grid;

      setRows(prev => {
        const next = [...prev];
        dataRows.forEach((cells, ri) => {
          if (ri >= next.length) next.push(makeEmpty());
          COLS.forEach((col, ci) => {
            const val = cells[ci] ?? '';
            next[ri] = { ...next[ri], [col.key]: val };
          });
        });
        return next;
      });
    } catch {
      setPasteError('Clipboard access denied. Paste directly into a cell instead.');
    }
  };

  /* Handle paste directly into a cell (Ctrl+V on a focused input) */
  const handleCellPaste = (e, rowIdx, colIdx) => {
    const text = e.clipboardData?.getData('text');
    if (!text || !text.includes('\t')) return; // single-cell paste — let default handle
    e.preventDefault();
    const grid = parsePaste(text);
    setRows(prev => {
      const next = [...prev];
      grid.forEach((cells, ri) => {
        const targetRow = rowIdx + ri;
        if (targetRow >= next.length) next.push(makeEmpty());
        cells.forEach((val, ci) => {
          const targetCol = colIdx + ci;
          if (targetCol < COLS.length) {
            next[targetRow] = { ...next[targetRow], [COLS[targetCol].key]: val };
          }
        });
      });
      return next;
    });
  };

  const filledRows = rows.filter(r => r.name?.trim());

  const handleSave = () => {
    const toSave = filledRows;
    if (!toSave.length) return;
    const mapped = isParty
      ? toSave.map(row => ({
          businessId: currentBusiness.id,
          type: partyType,
          name: row.name.trim(),
          phone: row.phone?.trim() || '',
          balance: Number(row.balance) || 0,
          gstNumber: row.gstNumber?.trim() || '',
          address: row.address?.trim() || '',
        }))
      : toSave.map(row => ({
          businessId: currentBusiness.id,
          name: row.name.trim(),
          itemCode: row.itemCode?.trim() || '',
          unit: row.unit || defaultUnit,
          salePrice: Number(row.salePrice) || 0,
          purchasePrice: Number(row.purchasePrice) || 0,
          stock: Number(row.stock) || 0,
          taxRate: Number(row.taxRate) || 0,
          hsnCode: row.hsnCode?.trim() || '',
        }));
    const result = addItems(isParty ? 'parties' : 'items', mapped);
    setResult(result);
  };

  /* Download a template CSV */
  const downloadTemplate = () => {
    const header = COLS.map(c => c.label.replace(' *', '')).join(',');
    const sample = isParty
      ? 'Rahul Sharma,9876543210,5000,,Mumbai'
      : 'Widget A,WID001,NOS,150,100,50,18,';
    const blob = new Blob([header + '\n' + sample], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `bulk_${type}_template.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="xl"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3, maxHeight: '92vh' } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1, pt: 2.5, px: 3 }}>
        <Box>
          <Typography sx={{ fontWeight: 800, fontSize: '1.05rem' }}>{title}</Typography>
          <Typography variant="caption" color="text.secondary">
            Fill in the rows below — only rows with a name are saved. Paste from Excel with Tab-separated columns.
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
          <IconButton size="small" onClick={handleClose}>
            <X size={18} />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ px: 3, py: 0 }}>
        {result && (
          <Alert
            severity={result.skipped ? 'warning' : 'success'}
            icon={result.skipped ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
            sx={{ mb: 2, borderRadius: 2 }}
            action={
              <Button size="small" onClick={handleClose}>Close</Button>
            }
          >
            {result.saved} {isParty ? (type === 'customer' ? 'customers' : 'vendors') : 'items'} saved
            {result.skipped > 0 && ` · ${result.skipped} failed`}.
          </Alert>
        )}

        {pasteError && (
          <Alert severity="warning" sx={{ mb: 1.5, borderRadius: 2 }} onClose={() => setPasteError('')}>
            {pasteError}
          </Alert>
        )}

        {/* Tips row */}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5, mt: 1 }}>
          {[
            'Paste Tab-separated data from Excel directly into any cell',
            'Only rows with a Name are saved',
            isParty ? 'Opening Balance: positive = customer owes you, negative = you owe them' : 'Leave price/stock blank to start at 0',
          ].map((tip, i) => (
            <Chip key={i} label={tip} size="small"
              sx={{ height: 20, fontSize: '0.65rem', bgcolor: alpha(primary, 0.05), color: 'text.secondary', border: `1px solid ${alpha(primary, 0.12)}` }} />
          ))}
        </Box>

        <TableContainer ref={tableRef} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, maxHeight: 420, overflow: 'auto' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', bgcolor: alpha(primary, 0.06), color: 'text.secondary', py: 1.25, borderBottom: `2px solid ${alpha(primary, 0.15)}` } }}>
                <TableCell sx={{ width: 44, pl: 1.5 }}>#</TableCell>
                {COLS.map(col => (
                  <TableCell key={col.key} sx={{ minWidth: col.width }}>
                    {col.label}
                    {col.required && <Box component="span" sx={{ color: 'error.main', ml: 0.25 }}>*</Box>}
                  </TableCell>
                ))}
                <TableCell sx={{ width: 40 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, rowIdx) => {
                const isFilled = !!row.name?.trim();
                return (
                  <TableRow
                    key={row._id}
                    sx={{
                      bgcolor: isFilled ? alpha(primary, 0.02) : 'transparent',
                      '& td': { py: 0.4, borderColor: alpha(primary, 0.07) },
                      '&:hover': { bgcolor: alpha(primary, 0.04) },
                    }}
                  >
                    <TableCell sx={{ pl: 1.5, color: 'text.disabled', fontSize: '0.72rem', fontWeight: 600 }}>
                      {rowIdx + 1}
                    </TableCell>
                    {COLS.map((col, colIdx) => (
                      <TableCell key={col.key} sx={{ p: 0.4 }}>
                        {col.type === 'unit' ? (
                          <Select
                            size="small"
                            value={row[col.key] || defaultUnit}
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
                            onChange={e => updateCell(rowIdx, col.key, e.target.value)}
                            onPaste={e => handleCellPaste(e, rowIdx, colIdx)}
                            type={col.numeric ? 'number' : 'text'}
                            inputProps={col.numeric ? { step: 'any', style: { textAlign: 'right' } } : {}}
                            placeholder={col.required ? (rowIdx === 0 ? 'e.g. ' + (isParty ? 'Rahul Sharma' : 'Widget A') : '') : ''}
                            sx={{
                              '& .MuiOutlinedInput-root': {
                                fontSize: '0.8rem',
                                '& fieldset': { borderColor: alpha(primary, col.required && !row[col.key]?.trim() && isFilled === false ? 0.12 : 0.15) },
                              },
                              ...(col.required && isFilled && !row[col.key]?.trim() && {
                                '& .MuiOutlinedInput-root fieldset': { borderColor: 'error.main' },
                              }),
                            }}
                          />
                        )}
                      </TableCell>
                    ))}
                    <TableCell sx={{ p: 0.4, textAlign: 'center' }}>
                      <IconButton size="small" onClick={() => deleteRow(rowIdx)}
                        sx={{ color: 'text.disabled', '&:hover': { color: 'error.main', bgcolor: alpha('#dc2626', 0.06) } }}>
                        <Trash2 size={13} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1.5 }}>
          <Button size="small" startIcon={<Plus size={13} />} onClick={addMoreRows}
            sx={{ fontWeight: 600, textTransform: 'none', color: primary }}>
            Add 10 more rows
          </Button>
          <Typography variant="caption" color="text.secondary">
            {filledRows.length} of {rows.length} rows filled
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, pt: 1.5, gap: 1 }}>
        <Button onClick={handleClose} sx={{ fontWeight: 600 }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={filledRows.length === 0}
          sx={{
            fontWeight: 700, textTransform: 'none', borderRadius: 2,
            background: `linear-gradient(135deg, ${primary} 0%, ${theme.palette.primary.dark || primary} 100%)`,
            boxShadow: `0 4px 12px ${alpha(primary, 0.3)}`,
          }}
        >
          {`Save ${filledRows.length || ''} ${isParty ? (type === 'customer' ? 'Customers' : 'Vendors') : 'Items'}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BulkAddDialog;
