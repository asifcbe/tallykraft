import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogActions,
  Box, Button, Typography, IconButton, Chip, Tooltip,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  TextField, MenuItem, Select, InputAdornment, Backdrop, CircularProgress,
} from '@mui/material';
import { Plus, Trash2, X, Save, TrendingDown } from 'lucide-react';
import { useData } from './DataContext';
import { useBusiness } from './BusinessContext';
import { useConfig } from './ConfigContext';

const DEFAULT_CATEGORIES = ['Office Supplies', 'Travel', 'Utilities', 'Rent', 'Marketing', 'Equipment', 'Miscellaneous'];
const PAYMENT_MODES = ['Cash', 'Bank', 'Split'];
const today = () => new Date().toISOString().split('T')[0];

const BLANK_ROW = () => ({
  _key: Math.random(),
  date: today(),
  category: '',
  amount: '',
  paymentMode: 'Cash',
  description: '',
});

export default function ExpenseBulkAddDialog({ open, onClose, onSuccess }) {
  const { addItems } = useData();
  const { currentBusiness } = useBusiness();
  const { config } = useConfig();
  const categories = config.expenseCategories?.length ? config.expenseCategories : DEFAULT_CATEGORIES;

  const [rows, setRows] = useState([BLANK_ROW(), BLANK_ROW(), BLANK_ROW()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setRows([BLANK_ROW(), BLANK_ROW(), BLANK_ROW()]);
  }, [open]);

  const addRow = () => setRows(r => [...r, BLANK_ROW()]);
  const removeRow = key => setRows(r => r.filter(row => row._key !== key));
  const updateRow = (key, field, value) =>
    setRows(r => r.map(row => row._key === key ? { ...row, [field]: value } : row));

  const filledRows = rows.filter(r => r.amount && Number(r.amount) > 0);
  const total = filledRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const handleSave = () => {
    if (filledRows.length === 0) return;
    setSaving(true);
    setTimeout(() => requestAnimationFrame(() => {
      const records = filledRows.map(row => ({
        businessId: currentBusiness.id,
        date: row.date || today(),
        category: row.category || 'Miscellaneous',
        amount: Number(row.amount) || 0,
        paymentMode: row.paymentMode || 'Cash',
        description: row.description?.trim() || '',
      }));
      addItems('expenses', records);
      setSaving(false);
      onSuccess(records.length);
      onClose();
    }), 0);
  };

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3, maxHeight: '90vh', position: 'relative' } }}
    >
      <Backdrop open={saving} sx={{ position: 'absolute', zIndex: 10, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.8)', flexDirection: 'column', gap: 1.5 }}>
        <CircularProgress size={40} sx={{ color: '#4f46e5' }} />
        <Typography variant="body2" sx={{ fontWeight: 700, color: '#4f46e5' }}>Saving {filledRows.length} expenses…</Typography>
      </Backdrop>

      <Box sx={{ background: 'linear-gradient(135deg, #18181b 0%, #3f3f46 100%)', px: 3, py: 2, display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.15)', display: 'flex' }}>
          <TrendingDown size={18} color="white" />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.72)', fontWeight: 700, fontSize: '0.62rem', letterSpacing: '0.1em', lineHeight: 1 }}>EXPENSES</Typography>
          <Typography variant="h6" sx={{ color: 'white', fontWeight: 800, lineHeight: 1.2 }}>Bulk Add Expenses</Typography>
        </Box>
        <IconButton onClick={onClose} disabled={saving} sx={{ color: 'white' }}><X size={20} /></IconButton>
      </Box>

      <DialogContent sx={{ p: 0, overflow: 'auto' }}>
        <TableContainer>
          <Table size="small" stickyHeader sx={{ minWidth: 750 }}>
            <TableHead>
              <TableRow>
                {['#', 'Date', 'Category', 'Payment Mode', 'Amount ₹', 'Description', ''].map((h, i) => (
                  <TableCell key={i} sx={{
                    fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase',
                    letterSpacing: '0.06em', color: 'text.secondary', whiteSpace: 'nowrap',
                    ...(i === 0 && { width: 40, pl: 2 }),
                    ...(i === 1 && { width: 140 }),
                    ...(i === 2 && { minWidth: 160 }),
                    ...(i === 3 && { width: 130 }),
                    ...(i === 4 && { width: 120, textAlign: 'right' }),
                    ...(i === 5 && { minWidth: 180 }),
                    ...(i === 6 && { width: 40 }),
                  }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, idx) => (
                <TableRow key={row._key} sx={{ '&:hover': { bgcolor: 'rgba(79,70,229,0.03)' } }}>
                  <TableCell sx={{ pl: 2, color: 'text.secondary', fontSize: '0.75rem' }}>{idx + 1}</TableCell>
                  <TableCell>
                    <TextField
                      type="date"
                      size="small"
                      value={row.date}
                      onChange={e => updateRow(row._key, 'date', e.target.value)}
                      slotProps={{ inputLabel: { shrink: true } }}
                      sx={{ width: 135 }}
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      size="small"
                      value={row.category}
                      onChange={e => updateRow(row._key, 'category', e.target.value)}
                      displayEmpty
                      sx={{ width: 155, fontSize: '0.82rem' }}
                    >
                      <MenuItem value="" disabled><em style={{ color: '#aaa' }}>Category…</em></MenuItem>
                      {categories.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select
                      size="small"
                      value={row.paymentMode}
                      onChange={e => updateRow(row._key, 'paymentMode', e.target.value)}
                      sx={{ width: 120, fontSize: '0.82rem' }}
                    >
                      {PAYMENT_MODES.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                    </Select>
                  </TableCell>
                  <TableCell align="right">
                    <TextField
                      type="number"
                      size="small"
                      value={row.amount}
                      placeholder="0.00"
                      onChange={e => updateRow(row._key, 'amount', e.target.value)}
                      onFocus={e => e.target.select()}
                      slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment>, style: { textAlign: 'right' }, min: 0, step: 0.01 } }}
                      sx={{ width: 115 }}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      value={row.description}
                      placeholder="Notes…"
                      onChange={e => updateRow(row._key, 'description', e.target.value)}
                      sx={{ width: '100%', minWidth: 160 }}
                    />
                  </TableCell>
                  <TableCell>
                    <Tooltip title="Remove row">
                      <IconButton size="small" onClick={() => removeRow(row._key)} sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}>
                        <Trash2 size={14} />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid rgba(0,0,0,0.08)', gap: 1, flexWrap: 'wrap' }}>
        <Button
          startIcon={<Plus size={15} />}
          onClick={addRow}
          variant="outlined"
          size="small"
          sx={{ fontWeight: 700, textTransform: 'none', borderRadius: '8px', borderColor: 'rgba(79,70,229,0.3)', color: '#4f46e5', mr: 'auto' }}
        >
          Add Row
        </Button>
        <Chip label={`${filledRows.length} row${filledRows.length !== 1 ? 's' : ''}`} size="small" sx={{ fontWeight: 700, bgcolor: 'rgba(79,70,229,0.08)', color: '#4f46e5' }} />
        <Box sx={{ px: 2, py: 0.5, bgcolor: 'rgba(79,70,229,0.08)', borderRadius: '8px', border: '1px solid rgba(79,70,229,0.2)' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#4f46e5' }}>
            Total ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Typography>
        </Box>
        <Button onClick={onClose} disabled={saving} sx={{ fontWeight: 700, textTransform: 'none' }}>Cancel</Button>
        <Button
          variant="contained"
          startIcon={saving ? null : <Save size={16} />}
          onClick={handleSave}
          disabled={saving || filledRows.length === 0}
          sx={{ fontWeight: 700, textTransform: 'none', borderRadius: '8px', background: 'linear-gradient(135deg, #18181b 0%, #3f3f46 100%)', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}
        >
          {saving ? 'Saving…' : `Save ${filledRows.length} Expense${filledRows.length !== 1 ? 's' : ''}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
