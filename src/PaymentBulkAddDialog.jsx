import React, { useState, useRef, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, Typography, Table, TableHead, TableBody,
  TableRow, TableCell, TextField, MenuItem, IconButton,
  Backdrop, CircularProgress, alpha,
} from '@mui/material';
import { Plus, Trash2, Download } from 'lucide-react';
import { useData } from './DataContext';
import { useBusiness } from './BusinessContext';

const PAYMENT_MODES = ['Cash', 'Bank', 'Split'];

const blankRow = () => ({
  key: Math.random(),
  type: 'PaymentIn',
  partyName: '',
  date: new Date().toISOString().split('T')[0],
  amount: '',
  paymentMode: 'Cash',
  referenceNo: '',
  notes: '',
});

const cellSx = {
  px: 0.75, py: 0.5, borderRight: '1px solid', borderColor: 'divider',
  '&:last-child': { borderRight: 'none' },
};
const inputSx = {
  '& .MuiOutlinedInput-root': { borderRadius: 1, fontSize: '0.8125rem' },
  '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
  '&:hover .MuiOutlinedInput-notchedOutline': { border: '1px solid', borderColor: 'divider' },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { border: '1px solid #6366f1' },
};

export default function PaymentBulkAddDialog({ open, onClose, onSuccess, defaultType = 'PaymentIn' }) {
  const { addItems } = useData();
  const { currentBusiness } = useBusiness();
  const [rows, setRows] = useState(() => [blankRow()].map(r => ({ ...r, type: defaultType })));
  const [saving, setSaving] = useState(false);
  const tableRef = useRef(null);

  const addRow = () => setRows(r => [...r, { ...blankRow(), type: defaultType }]);
  const removeRow = (key) => setRows(r => r.filter(x => x.key !== key));
  const updateRow = (key, field, value) =>
    setRows(r => r.map(x => x.key === key ? { ...x, [field]: value } : x));

  // Paste handler — tab/newline delimited clipboard
  const onPaste = useCallback((e, startKey, startField) => {
    const fields = ['type', 'partyName', 'date', 'amount', 'paymentMode', 'referenceNo', 'notes'];
    const startCol = fields.indexOf(startField);
    if (startCol < 0) return;
    const text = e.clipboardData.getData('text');
    const pastedRows = text.trim().split('\n').map(line => line.split('\t'));
    if (pastedRows.length <= 1 && pastedRows[0].length <= 1) return;
    e.preventDefault();
    setRows(prev => {
      const startIdx = prev.findIndex(r => r.key === startKey);
      const updated = [...prev];
      pastedRows.forEach((cells, ri) => {
        const idx = startIdx + ri;
        if (idx >= updated.length) updated.push(blankRow());
        cells.forEach((val, ci) => {
          const f = fields[startCol + ci];
          if (f) updated[idx] = { ...updated[idx], [f]: val.trim() };
        });
      });
      return updated;
    });
  }, []);

  const handleSave = async () => {
    const filled = rows.filter(r => r.partyName.trim() && parseFloat(r.amount) > 0);
    if (!filled.length) return;
    setSaving(true);
    setTimeout(async () => {
      try {
        const now = Date.now();
        const records = filled.map((r, i) => ({
          id: String(now + i),
          businessId: currentBusiness.id,
          type: r.type || 'PaymentIn',
          partyName: r.partyName.trim(),
          partyId: '',
          date: r.date || new Date().toISOString().split('T')[0],
          totalAmount: parseFloat(r.amount) || 0,
          paymentMode: PAYMENT_MODES.includes(r.paymentMode) ? r.paymentMode : 'Cash',
          referenceNo: r.referenceNo.trim(),
          notes: r.notes.trim(),
          createdAt: new Date().toISOString(),
        }));
        await addItems('payments', records);
        onSuccess?.(records.length);
        onClose();
        setRows([{ ...blankRow(), type: defaultType }]);
      } finally {
        setSaving(false);
      }
    }, 0);
  };

  const downloadTemplate = () => {
    const header = 'Type\tParty Name\tDate\tAmount\tPayment Mode\tReference No\tNotes';
    const sample = `PaymentIn\tABC Traders\t${new Date().toISOString().split('T')[0]}\t5000\tCash\t\t`;
    const blob = new Blob([header + '\n' + sample], { type: 'text/tab-separated-values' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'payments_template.tsv'; a.click();
  };

  const COLS = [
    { key: 'type',        label: 'Type',         width: 110 },
    { key: 'partyName',   label: 'Party Name *',  width: 160 },
    { key: 'date',        label: 'Date',          width: 130 },
    { key: 'amount',      label: 'Amount *',      width: 110 },
    { key: 'paymentMode', label: 'Mode',          width: 100 },
    { key: 'referenceNo', label: 'Ref No',        width: 110 },
    { key: 'notes',       label: 'Notes',         width: 160 },
  ];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth
      PaperProps={{ sx: { borderRadius: 3, position: 'relative' } }}>
      <Backdrop open={saving} sx={{ position: 'absolute', zIndex: 10, bgcolor: 'rgba(255,255,255,0.75)', borderRadius: 3 }}>
        <CircularProgress size={36} sx={{ color: '#6366f1' }} />
      </Backdrop>

      <DialogTitle sx={{ pb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h6" fontWeight={700}>Bulk Add Payments</Typography>
          <Typography variant="caption" color="text.secondary">
            Fill rows or paste from Excel/Sheets. Rows without Party Name or Amount are skipped.
          </Typography>
        </Box>
        <Button size="small" startIcon={<Download size={14} />} onClick={downloadTemplate}
          sx={{ textTransform: 'none', fontSize: '0.78rem', color: 'text.secondary' }}>
          Template
        </Button>
      </DialogTitle>

      <DialogContent sx={{ p: 0, overflow: 'auto' }}>
        <Box ref={tableRef} sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 880, borderCollapse: 'collapse' }}>
            <TableHead>
              <TableRow sx={{ bgcolor: alpha('#6366f1', 0.06) }}>
                <TableCell sx={{ ...cellSx, width: 36 }} />
                {COLS.map(c => (
                  <TableCell key={c.key} sx={{ ...cellSx, width: c.width, fontWeight: 700, fontSize: '0.78rem', py: 1, color: 'text.secondary', whiteSpace: 'nowrap' }}>
                    {c.label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, idx) => (
                <TableRow key={row.key} hover sx={{ '&:hover': { bgcolor: alpha('#6366f1', 0.02) } }}>
                  <TableCell sx={{ ...cellSx, width: 36, color: 'text.disabled', fontSize: '0.75rem', textAlign: 'center' }}>
                    {idx + 1}
                  </TableCell>

                  {/* Type */}
                  <TableCell sx={cellSx}>
                    <TextField select size="small" fullWidth value={row.type} sx={inputSx}
                      onChange={e => updateRow(row.key, 'type', e.target.value)}
                      onPaste={e => onPaste(e, row.key, 'type')}>
                      <MenuItem value="PaymentIn">Payment In</MenuItem>
                      <MenuItem value="PaymentOut">Payment Out</MenuItem>
                    </TextField>
                  </TableCell>

                  {/* Party Name */}
                  <TableCell sx={cellSx}>
                    <TextField size="small" fullWidth value={row.partyName} placeholder="Party name"
                      sx={inputSx} onChange={e => updateRow(row.key, 'partyName', e.target.value)}
                      onPaste={e => onPaste(e, row.key, 'partyName')} />
                  </TableCell>

                  {/* Date */}
                  <TableCell sx={cellSx}>
                    <TextField size="small" type="date" fullWidth value={row.date} sx={inputSx}
                      onChange={e => updateRow(row.key, 'date', e.target.value)}
                      onPaste={e => onPaste(e, row.key, 'date')}
                      slotProps={{ inputLabel: { shrink: true } }} />
                  </TableCell>

                  {/* Amount */}
                  <TableCell sx={cellSx}>
                    <TextField size="small" fullWidth value={row.amount} placeholder="0"
                      sx={inputSx} inputProps={{ inputMode: 'numeric' }}
                      onChange={e => updateRow(row.key, 'amount', e.target.value.replace(/[^0-9.]/g, ''))}
                      onPaste={e => onPaste(e, row.key, 'amount')} />
                  </TableCell>

                  {/* Payment Mode */}
                  <TableCell sx={cellSx}>
                    <TextField select size="small" fullWidth value={row.paymentMode} sx={inputSx}
                      onChange={e => updateRow(row.key, 'paymentMode', e.target.value)}
                      onPaste={e => onPaste(e, row.key, 'paymentMode')}>
                      {PAYMENT_MODES.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                    </TextField>
                  </TableCell>

                  {/* Ref No */}
                  <TableCell sx={cellSx}>
                    <TextField size="small" fullWidth value={row.referenceNo} placeholder="Ref"
                      sx={inputSx} onChange={e => updateRow(row.key, 'referenceNo', e.target.value)}
                      onPaste={e => onPaste(e, row.key, 'referenceNo')} />
                  </TableCell>

                  {/* Notes */}
                  <TableCell sx={cellSx}>
                    <TextField size="small" fullWidth value={row.notes} placeholder="Notes"
                      sx={inputSx} onChange={e => updateRow(row.key, 'notes', e.target.value)}
                      onPaste={e => onPaste(e, row.key, 'notes')} />
                  </TableCell>

                  {/* Delete */}
                  <TableCell sx={{ ...cellSx, width: 36 }}>
                    <IconButton size="small" onClick={() => removeRow(row.key)}
                      sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}>
                      <Trash2 size={14} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>

        <Box sx={{ px: 2, py: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
          <Button size="small" startIcon={<Plus size={14} />} onClick={addRow}
            sx={{ textTransform: 'none', color: '#6366f1', fontWeight: 600, fontSize: '0.8125rem' }}>
            Add Row
          </Button>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 2.5, py: 2, gap: 1, borderTop: '1px solid', borderColor: 'divider' }}>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
          {rows.filter(r => r.partyName.trim() && parseFloat(r.amount) > 0).length} valid row(s) will be saved
        </Typography>
        <Button onClick={onClose} disabled={saving} sx={{ textTransform: 'none', fontWeight: 600 }}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving || !rows.some(r => r.partyName.trim() && parseFloat(r.amount) > 0)}
          variant="contained" disableElevation
          sx={{ textTransform: 'none', fontWeight: 700, bgcolor: '#6366f1', '&:hover': { bgcolor: '#4338ca' }, borderRadius: 2, px: 3 }}>
          Save Payments
        </Button>
      </DialogActions>
    </Dialog>
  );
}
