import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Button, Typography, IconButton, TextField,
  MenuItem, Select, Chip, Tooltip, Backdrop, CircularProgress,
  alpha, useTheme,
} from '@mui/material';
import { FixedSizeList } from 'react-window';
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
const IDX_COL_W = 48;
const ID_COL_W = 90;
const ROW_H = 44;
const GRID_TEMPLATE = `${IDX_COL_W}px ${ID_COL_W}px ` + EDIT_COLS.map(c => `${c.width}px`).join(' ');
const TOTAL_W = IDX_COL_W + ID_COL_W + EDIT_COLS.reduce((s, c) => s + c.width, 0);

const parsePaste = (text) =>
  text.trim().split('\n').map(line =>
    line.split(/\t|,/).map(c => c.trim().replace(/^"|"$/g, ''))
  );

const Row = React.memo(function Row({ index, style, data }) {
  const { rows, partyIds, primary, allCategories, updateCell, handleCellPaste } = data;
  const row = rows[index];
  if (!row) return null;
  const hasError = !row.name?.trim();
  const cellBorder = alpha(primary, 0.15);

  return (
    <Box
      style={style}
      sx={{
        display: 'grid',
        gridTemplateColumns: GRID_TEMPLATE,
        alignItems: 'center',
        borderBottom: `1px solid ${alpha(primary, 0.07)}`,
        bgcolor: hasError ? alpha('#ef4444', 0.03) : 'transparent',
        '&:hover': { bgcolor: alpha(primary, 0.04) },
      }}
    >
      <Box sx={{ pl: 1.5, color: 'text.disabled', fontSize: '0.72rem', fontWeight: 600 }}>{index + 1}</Box>
      <Box sx={{ px: 0.4 }}>
        <Typography variant="caption" sx={{ fontFamily: 'monospace', bgcolor: alpha(primary, 0.07), color: 'primary.main', px: 0.75, py: 0.25, borderRadius: 0.75, fontWeight: 700, fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
          {partyIds[index] || '—'}
        </Typography>
      </Box>
      {EDIT_COLS.map((col, colIdx) => (
        <Box key={col.key} sx={{ px: 0.4 }}>
          {col.type === 'countryCode' ? (
            <Select
              size="small"
              value={row[col.key] || '+91'}
              onChange={e => updateCell(index, col.key, e.target.value)}
              fullWidth
              sx={{ fontSize: '0.8rem', '& .MuiOutlinedInput-notchedOutline': { borderColor: cellBorder } }}
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
              onChange={e => updateCell(index, col.key, e.target.value)}
              displayEmpty
              fullWidth
              sx={{ fontSize: '0.8rem', '& .MuiOutlinedInput-notchedOutline': { borderColor: cellBorder } }}
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
                if (col.phoneOnly || col.numeric) val = val.replace(/\D/g, '');
                updateCell(index, col.key, val);
              }}
              onPaste={e => handleCellPaste(e, index, colIdx + 2)}
              type="text"
              inputProps={{
                ...(col.phoneOnly ? { inputMode: 'numeric', maxLength: 15 } : {}),
                ...(col.numeric ? { inputMode: 'numeric', maxLength: 20 } : {}),
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  fontSize: '0.8rem',
                  '& fieldset': { borderColor: hasError && col.required ? 'error.main' : cellBorder },
                },
              }}
            />
          )}
        </Box>
      ))}
    </Box>
  );
});

const BulkEditDialog = ({ open, onClose, parties = [], partyType = 'Customer', onSuccess }) => {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const { updateItems } = useData();
  const { currentBusiness } = useBusiness();
  const bizId = currentBusiness?.id;

  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [hasBlankName, setHasBlankName] = useState(false);
  const listOuterRef = useRef(null);
  const headerRef = useRef(null);

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
      setHasBlankName(parties.some(p => !p.name?.trim()));
    }
  }, [open, parties]);

  const partyIds = useMemo(() => parties.map(p => p.partyId || ''), [parties]);

  const updateCell = useCallback((rowIdx, key, value) => {
    setRows(prev => {
      const next = prev.slice();
      next[rowIdx] = { ...next[rowIdx], [key]: value };
      if (key === 'name') setHasBlankName(next.some(r => !r.name?.trim()));
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
        const next = prev.slice();
        dataRows.forEach((cells, ri) => {
          if (ri >= next.length) return;
          const patched = { ...next[ri] };
          EDIT_COLS.forEach((col, ci) => {
            const val = cells[ci] ?? '';
            if (val !== '') patched[col.key] = val;
          });
          next[ri] = patched;
        });
        setHasBlankName(next.some(r => !r.name?.trim()));
        return next;
      });
    } catch { /* clipboard denied — ignore */ }
  };

  const handleCellPaste = useCallback((e, rowIdx, colIdx) => {
    const text = e.clipboardData?.getData('text');
    if (!text || !text.includes('\t')) return;
    e.preventDefault();
    const grid = parsePaste(text);
    setRows(prev => {
      const next = prev.slice();
      grid.forEach((cells, ri) => {
        const targetRow = rowIdx + ri;
        if (targetRow >= next.length) return;
        const patched = { ...next[targetRow] };
        cells.forEach((val, ci) => {
          const targetCol = colIdx + ci;
          if (targetCol >= 2 && targetCol - 2 < EDIT_COLS.length) {
            patched[EDIT_COLS[targetCol - 2].key] = val;
          }
        });
        next[targetRow] = patched;
      });
      setHasBlankName(next.some(r => !r.name?.trim()));
      return next;
    });
  }, []);

  const handleSave = () => {
    if (hasBlankName) return;
    setSaving(true);
    setTimeout(() => requestAnimationFrame(() => {
      const origById = Object.fromEntries(parties.map(p => [p.id, p]));
      const updates = [];
      for (const row of rows) {
        const orig = origById[row._id];
        if (!orig) continue;
        updates.push({
          ...orig,
          id: row._id,
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
      }
      updateItems('parties', updates);
      setSaving(false);
      if (onSuccess) onSuccess(rows.length);
      onClose();
    }), 0);
  };

  const onListScroll = () => {
    if (headerRef.current && listOuterRef.current) {
      headerRef.current.scrollLeft = listOuterRef.current.scrollLeft;
    }
  };

  const itemData = useMemo(() => {
    const builtinCats = partyType === 'Customer' ? CUSTOMER_CATEGORIES : VENDOR_CATEGORIES;
    const custom = bizId ? loadCustomCategories(bizId, partyType) : [];
    const allCategories = [...builtinCats, ...custom.filter(c => !builtinCats.includes(c))];
    return { rows, partyIds, primary, allCategories, updateCell, handleCellPaste };
  }, [rows, partyIds, primary, partyType, bizId, updateCell, handleCellPaste]);

  const listHeight = Math.min(rows.length * ROW_H, 460) || ROW_H;

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      maxWidth="xl"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3, maxHeight: '92vh', position: 'relative' } }}
    >
      <Backdrop open={saving} sx={{ position: 'absolute', zIndex: 10, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.8)', flexDirection: 'column', gap: 1.5 }}>
        <CircularProgress size={40} sx={{ color: primary }} />
        <Typography variant="body2" sx={{ fontWeight: 700, color: primary }}>Saving {rows.length} {partyType.toLowerCase()}s…</Typography>
      </Backdrop>
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

        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
          <Box ref={headerRef} sx={{ overflow: 'hidden', bgcolor: alpha(primary, 0.06), borderBottom: `2px solid ${alpha(primary, 0.15)}` }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: GRID_TEMPLATE, minWidth: TOTAL_W }}>
              <Box sx={{ pl: 1.5, py: 1.25, fontWeight: 700, fontSize: '0.7rem', color: 'text.secondary' }}>#</Box>
              <Box sx={{ px: 0.4, py: 1.25, fontWeight: 700, fontSize: '0.7rem', color: 'text.secondary' }}>ID</Box>
              {EDIT_COLS.map(col => (
                <Box key={col.key} sx={{ px: 0.4, py: 1.25, fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary' }}>
                  {col.label}
                </Box>
              ))}
            </Box>
          </Box>

          {rows.length === 0 ? (
            <Box sx={{ py: 4, textAlign: 'center', color: 'text.disabled', fontSize: '0.85rem' }}>No {partyType.toLowerCase()}s to edit.</Box>
          ) : (
            <FixedSizeList
              height={listHeight}
              itemCount={rows.length}
              itemSize={ROW_H}
              width="100%"
              outerRef={listOuterRef}
              onScroll={onListScroll}
              itemData={itemData}
              overscanCount={6}
              style={{ overflowX: 'auto' }}
              innerElementType={React.forwardRef(({ style, ...rest }, ref) => (
                <div ref={ref} style={{ ...style, minWidth: TOTAL_W }} {...rest} />
              ))}
            >
              {Row}
            </FixedSizeList>
          )}
        </Box>

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
          disabled={saving || hasBlankName}
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
