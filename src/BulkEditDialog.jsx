import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Button, Typography, IconButton, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField,
  MenuItem, Select, Chip, Tooltip,
  alpha, useTheme,
} from '@mui/material';
import { X, ClipboardPaste, Save } from 'lucide-react';
import { useData } from './DataContext';
import { useBusiness } from './BusinessContext';
import { COUNTRY_CODES, CUSTOMER_CATEGORIES, VENDOR_CATEGORIES, loadCustomCategories } from './partyUtils';

const EDIT_COLS = [
  { key: 'name',        label: 'Name *',     width: 200, required: true },
  { key: 'countryCode', label: 'Code',        width: 100, type: 'countryCode' },
  { key: 'phone',       label: 'Phone',       width: 140, phoneOnly: true },
  { key: 'category',    label: 'Category',    width: 150, type: 'category' },
  { key: 'gstNumber',   label: 'GST Number',  width: 160 },
  { key: 'address',     label: 'Address',     width: 220 },
  { key: 'bankName',    label: 'Bank Name',   width: 160 },
  { key: 'ifscCode',    label: 'IFSC Code',   width: 130 },
  { key: 'accountNumber',     label: 'Account No.', width: 150, numeric: true },
  { key: 'accountHolderName', label: 'Account Holder', width: 180 },
];

const parsePaste = (text) =>
  text.trim().split('\n').map(line =>
    line.split(/\t|,/).map(c => c.trim().replace(/^"|"$/g, ''))
  );

const BulkEditDialog = ({ open, onClose, parties = [], partyType = 'Customer', onSuccess }) => {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const { updateItem } = useData();
  const { currentBusiness } = useBusiness();

  const builtinCats = partyType === 'Customer' ? CUSTOMER_CATEGORIES : VENDOR_CATEGORIES;
  const customCats = currentBusiness?.id ? loadCustomCategories(currentBusiness.id, partyType) : [];
  const allCategories = [...builtinCats, ...customCats.filter(c => !builtinCats.includes(c))];

  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const tableRef = useRef(null);

  useEffect(() => {
    if (open) {
      setRows(parties.map(p => ({
        _id: p.id,
        name: p.name || '',
        countryCode: p.countryCode || '+91',
        phone: p.phone || '',
        category: p.category || '',
        gstNumber: p.gstNumber || '',
        address: p.address || '',
        bankName: p.bankName || '',
        ifscCode: p.ifscCode || '',
        accountNumber: p.accountNumber || '',
        accountHolderName: p.accountHolderName || '',
      })));
    }
  }, [open, parties]);

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
    } catch { /* clipboard denied — ignore */ }
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

  const handleSave = async () => {
    const invalid = rows.filter(r => !r.name?.trim());
    if (invalid.length) return;
    setSaving(true);
    try {
      const origById = Object.fromEntries(parties.map(p => [p.id, p]));
      await Promise.all(rows.map(row => {
        const orig = origById[row._id];
        if (!orig) return null;
        return updateItem('parties', row._id, {
          ...orig,
          name: row.name.trim(),
          countryCode: row.countryCode || '+91',
          phone: row.phone?.trim() || '',
          category: row.category?.trim() || '',
          gstNumber: row.gstNumber?.trim() || '',
          address: row.address?.trim() || '',
          bankName: row.bankName?.trim() || '',
          ifscCode: row.ifscCode?.trim() || '',
          accountNumber: row.accountNumber?.toString().replace(/\D/g, '') || '',
          accountHolderName: row.accountHolderName?.trim() || '',
        });
      }));
      if (onSuccess) onSuccess(rows.length);
      onClose();
    } catch {
      /* parent snackbar handles error */
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xl"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3, maxHeight: '92vh' } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1, pt: 2.5, px: 3 }}>
        <Box>
          <Typography sx={{ fontWeight: 800, fontSize: '1.05rem' }}>
            Bulk Edit {partyType}s
          </Typography>
          <Typography variant="caption" color="text.secondary">
            All {partyType.toLowerCase()}s are loaded below. Edit inline and click Save — only Name is required.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
          <Tooltip title="Paste Tab-separated data from clipboard">
            <IconButton size="small" onClick={handlePaste}
              sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main', bgcolor: alpha(primary, 0.08) } }}>
              <ClipboardPaste size={16} />
            </IconButton>
          </Tooltip>
          <IconButton size="small" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ px: 3, py: 0 }}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5, mt: 1 }}>
          {[
            `${rows.length} ${partyType.toLowerCase()}s loaded`,
            'Edit any field inline — balance is not editable here',
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
                <TableCell sx={{ width: 90 }}>ID</TableCell>
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
                const orig = parties[rowIdx];
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
                    <TableCell>
                      <Typography variant="caption" sx={{ fontFamily: 'monospace', bgcolor: alpha(primary, 0.07), color: 'primary.main', px: 0.75, py: 0.25, borderRadius: 0.75, fontWeight: 700, fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                        {orig?.partyId || '—'}
                      </Typography>
                    </TableCell>
                    {EDIT_COLS.map((col, colIdx) => (
                      <TableCell key={col.key} sx={{ p: 0.4 }}>
                        {col.type === 'countryCode' ? (
                          <Select
                            size="small"
                            value={row[col.key] || '+91'}
                            onChange={e => updateCell(rowIdx, col.key, e.target.value)}
                            sx={{ fontSize: '0.8rem', minWidth: 90, '& .MuiOutlinedInput-notchedOutline': { borderColor: alpha(primary, 0.15) } }}
                            MenuProps={{ PaperProps: { sx: { maxHeight: 260 } } }}
                          >
                            {COUNTRY_CODES.map(c => (
                              <MenuItem key={c.code + c.country} value={c.code} sx={{ fontSize: '0.78rem' }}>
                                <Box sx={{ display: 'flex', gap: 0.75 }}>
                                  <span style={{ fontWeight: 700, minWidth: 36 }}>{c.code}</span>
                                  <span style={{ color: '#666' }}>{c.name}</span>
                                </Box>
                              </MenuItem>
                            ))}
                          </Select>
                        ) : col.type === 'category' ? (
                          <Select
                            size="small"
                            value={row[col.key] || ''}
                            onChange={e => updateCell(rowIdx, col.key, e.target.value)}
                            displayEmpty
                            sx={{ fontSize: '0.8rem', minWidth: 130, '& .MuiOutlinedInput-notchedOutline': { borderColor: alpha(primary, 0.15) } }}
                            MenuProps={{ PaperProps: { sx: { maxHeight: 260 } } }}
                          >
                            <MenuItem value="" sx={{ fontSize: '0.78rem', color: 'text.disabled' }}>None</MenuItem>
                            {allCategories.map(cat => (
                              <MenuItem key={cat} value={cat} sx={{ fontSize: '0.78rem' }}>{cat}</MenuItem>
                            ))}
                          </Select>
                        ) : (
                          <TextField
                            size="small"
                            fullWidth
                            value={row[col.key] ?? ''}
                            onChange={e => {
                              let val = e.target.value;
                              if (col.phoneOnly) val = val.replace(/\D/g, '');
                              if (col.numeric) val = val.replace(/\D/g, '');
                              updateCell(rowIdx, col.key, val);
                            }}
                            onPaste={e => handleCellPaste(e, rowIdx, colIdx + 2)}
                            type="text"
                            inputProps={{
                              ...(col.phoneOnly ? { inputMode: 'numeric', maxLength: 15 } : {}),
                              ...(col.numeric ? { inputMode: 'numeric', maxLength: 20 } : {}),
                            }}
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
            {rows.length} {partyType.toLowerCase()}s • scroll right for bank details
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, pt: 1.5, gap: 1 }}>
        <Button onClick={onClose} sx={{ fontWeight: 600 }} disabled={saving}>
          Cancel
        </Button>
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
          {saving ? 'Saving…' : `Save ${rows.length} ${partyType}s`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BulkEditDialog;
