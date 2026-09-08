import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogActions,
  Box, Button, Typography, IconButton, Chip,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  TextField, Select, MenuItem, CircularProgress, Backdrop,
} from '@mui/material';
import { X, Save, Edit2 } from 'lucide-react';
import { useData } from './DataContext';
import { useBusiness } from './BusinessContext';

const PAYMENT_MODES = ['Cash', 'Bank/UPI', 'Split', 'Credit'];
const STATUSES = ['paid', 'unpaid', 'partial'];

export default function SalesBulkEditDialog({ open, onClose, isSale }) {
  const { getItems, updateItems } = useData();
  const { currentBusiness } = useBusiness();
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [changedKeys, setChangedKeys] = useState(new Set());

  const tableName = isSale ? 'sales' : 'purchases';

  useEffect(() => {
    if (!open || !currentBusiness?.id) return;
    const data = getItems(tableName)
      .filter((t) => t.businessId === currentBusiness.id)
      .reverse()
      .map((t) => ({ ...t, _origStatus: t.status, _origPaymentMode: t.paymentMode, _origNotes: t.description || '' }));
    setRows(data);
    setChangedKeys(new Set());
  }, [open, currentBusiness?.id, tableName]); // eslint-disable-line

  const updateRow = (id, field, value) => {
    setRows((r) => r.map((row) => row.id === id ? { ...row, [field]: value } : row));
    setChangedKeys((s) => new Set([...s, id]));
  };

  const handleSave = () => {
    const toUpdate = rows.filter((r) => changedKeys.has(r.id));
    if (toUpdate.length === 0) { onClose(); return; }
    setSaving(true);
    setTimeout(() => requestAnimationFrame(() => {
      updateItems(tableName, toUpdate.map((row) => ({
        id: row.id,
        invoiceNumber: row.invoiceNumber,
        partyName: row.partyName,
        date: row.date,
        totalAmount: Number(row.totalAmount) || 0,
        paymentMode: row.paymentMode,
        status: row.status,
        description: row.description || '',
      })));
      setSaving(false);
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
        <CircularProgress size={40} sx={{ color: '#5c1f22' }} />
        <Typography variant="body2" sx={{ fontWeight: 700, color: '#5c1f22' }}>Saving changes…</Typography>
      </Backdrop>
      <Box
        sx={{
          background: '#ffffff', border: '1px solid #ece2db',
          px: 3, py: 2,
          display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0,
        }}
      >
        <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'rgba(92,31,34,0.08)', display: 'flex' }}>
          <Edit2 size={18} color="#5c1f22" />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="overline" sx={{ color: '#6b5550', fontWeight: 700, fontSize: '0.62rem', letterSpacing: '0.1em', lineHeight: 1 }}>
            {isSale ? 'SALES' : 'PURCHASES'}
          </Typography>
          <Typography variant="h6" sx={{ color: '#5c1f22', fontWeight: 800, lineHeight: 1.2 }}>
            Bulk Edit {isSale ? 'Sales' : 'Purchases'}
          </Typography>
        </Box>
        <Chip
          label={`${rows.length} record${rows.length !== 1 ? 's' : ''}`}
          size="small"
          sx={{ bgcolor: '#9c8a84', color: '#5c1f22', fontWeight: 700 }}
        />
        <IconButton onClick={onClose} disabled={saving} sx={{ color: '#5c1f22' }}>
          <X size={20} />
        </IconButton>
      </Box>

      <DialogContent sx={{ p: 0, overflow: 'auto' }}>
        {rows.length === 0 ? (
          <Box sx={{ py: 8, textAlign: 'center' }}>
            <Typography color="text.secondary">No {isSale ? 'sales' : 'purchases'} found.</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small" stickyHeader sx={{ minWidth: 900 }}>
              <TableHead>
                <TableRow>
                  {['Invoice #', isSale ? 'Customer' : 'Vendor', 'Date', 'Amount ₹', 'Payment Mode', 'Status', 'Notes'].map((h) => (
                    <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary', bgcolor: 'rgba(0,0,0,0.03)', whiteSpace: 'nowrap' }}>
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.id}
                    sx={{
                      '&:hover': { bgcolor: 'rgba(92,31,34,0.03)' },
                      bgcolor: changedKeys.has(row.id) ? 'rgba(92,31,34,0.04)' : undefined,
                    }}
                  >
                    <TableCell>
                      <TextField
                        size="small"
                        value={row.invoiceNumber || ''}
                        onChange={(e) => updateRow(row.id, 'invoiceNumber', e.target.value)}
                        sx={{ width: 120 }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={row.partyName || ''}
                        onChange={(e) => updateRow(row.id, 'partyName', e.target.value)}
                        sx={{ width: 160 }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        type="date"
                        size="small"
                        value={row.date || ''}
                        onChange={(e) => updateRow(row.id, 'date', e.target.value)}
                        slotProps={{ inputLabel: { shrink: true } }}
                        sx={{ width: 130 }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        type="number"
                        size="small"
                        value={row.totalAmount ?? ''}
                        onChange={(e) => { const v = e.target.value; updateRow(row.id, 'totalAmount', v === '' ? '' : Number(v) || 0); }}
                        onFocus={(e) => e.target.select()}
                        slotProps={{ input: { style: { textAlign: 'right' } } }}
                        sx={{ width: 110 }}
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        size="small"
                        value={row.paymentMode || 'Cash'}
                        onChange={(e) => updateRow(row.id, 'paymentMode', e.target.value)}
                        sx={{ minWidth: 110 }}
                      >
                        {PAYMENT_MODES.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        size="small"
                        value={row.status || 'paid'}
                        onChange={(e) => updateRow(row.id, 'status', e.target.value)}
                        sx={{ minWidth: 90 }}
                      >
                        {STATUSES.map((s) => <MenuItem key={s} value={s} sx={{ textTransform: 'capitalize' }}>{s}</MenuItem>)}
                      </Select>
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={row.description || ''}
                        onChange={(e) => updateRow(row.id, 'description', e.target.value)}
                        placeholder="Notes…"
                        sx={{ width: 180 }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid rgba(0,0,0,0.08)', gap: 1 }}>
        {changedKeys.size > 0 && (
          <Chip
            label={`${changedKeys.size} row${changedKeys.size !== 1 ? 's' : ''} changed`}
            size="small"
            sx={{ fontWeight: 700, bgcolor: 'rgba(92,31,34,0.08)', color: '#5c1f22', mr: 'auto' }}
          />
        )}
        <Button onClick={onClose} disabled={saving} sx={{ fontWeight: 700, textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <Save size={16} />}
          onClick={handleSave}
          disabled={saving}
          sx={{
            fontWeight: 700, textTransform: 'none', borderRadius: '8px',
            background: '#5c1f22',
          }}
        >
          {saving ? 'Saving…' : `Save Changes${changedKeys.size > 0 ? ` (${changedKeys.size})` : ''}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
