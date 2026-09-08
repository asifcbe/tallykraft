import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogActions,
  Box, Button, Typography, IconButton, Chip, Tooltip,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  TextField, InputAdornment, Backdrop, CircularProgress,
} from '@mui/material';
import { Plus, Trash2, X, Save, ShoppingBasket } from 'lucide-react';
import { useData } from './DataContext';
import { useBusiness } from './BusinessContext';
import PartySelect from './PartySelect';
import ItemSelect from './ItemSelect';

const today = () => new Date().toISOString().split('T')[0];

const BLANK_ROW = () => ({
  _key: Math.random(),
  party: null,
  date: today(),
  billNumber: '',
  item: null,
  qty: 1,
  rate: '',
  disc: '',
  gst: '',
});

export default function PurchaseBulkAddDialog({ open, onClose, onSuccess, generateBillNumber }) {
  const { addItems, getItems } = useData();
  const { currentBusiness } = useBusiness();
  const [rows, setRows] = useState([BLANK_ROW(), BLANK_ROW(), BLANK_ROW()]);
  const [saving, setSaving] = useState(false);

  const vendors = getItems('parties').filter(
    (p) => p.businessId === currentBusiness?.id && p.type === 'Vendor'
  );
  const stockItems = getItems('items').filter(
    (i) => i.businessId === currentBusiness?.id
  );

  useEffect(() => {
    if (open) setRows([BLANK_ROW(), BLANK_ROW(), BLANK_ROW()]);
  }, [open]);

  const addRow = () => setRows((r) => [...r, BLANK_ROW()]);
  const removeRow = (key) => setRows((r) => r.filter((row) => row._key !== key));
  const updateRow = (key, field, value) =>
    setRows((r) => r.map((row) => (row._key === key ? { ...row, [field]: value } : row)));

  const calcAmount = (row) => {
    const qty = Number(row.qty) || 0;
    const rate = Number(row.rate) || 0;
    const disc = Number(row.disc) || 0;
    const gst = Number(row.gst) || 0;
    const base = qty * rate * (1 - disc / 100);
    return base * (1 + gst / 100);
  };

  const totalAmount = rows.reduce((s, r) => s + calcAmount(r), 0);
  const filledRows = rows.filter((r) => r.party || r.item);

  const handleSave = () => {
    if (filledRows.length === 0) return;
    setSaving(true);
    setTimeout(() => requestAnimationFrame(() => {
    const records = filledRows.map((row, i) => {
      const qty = Number(row.qty) || 1;
      const rate = Number(row.rate) || 0;
      const disc = Number(row.disc) || 0;
      const gst = Number(row.gst) || 0;
      const base = qty * rate * (1 - disc / 100);
      const taxAmount = base * (gst / 100);
      const total = base + taxAmount;
      const billNum = row.billNumber || (generateBillNumber ? generateBillNumber() : `BILL-${Date.now()}-${i}`);
      return {
        id: crypto.randomUUID(),
        businessId: currentBusiness.id,
        partyId: row.party?.id || '',
        partyName: row.party?.name || '',
        date: row.date || today(),
        billNumber: billNum,
        invoiceNumber: billNum,
        items: row.item
          ? [{ itemId: row.item.id, name: row.item.name, qty, price: rate, discountPercent: disc, taxRate: gst, taxInclusive: false, total, unit: row.item.unit || '', hsnCode: row.item.hsnCode || '' }]
          : [],
        subtotal: base,
        taxAmount,
        totalAmount: total,
        discountAmount: qty * rate * (disc / 100),
        discountPercent: disc,
        paymentMode: 'Cash',
        type: 'Purchases',
        status: 'paid',
      };
    });
    addItems('purchases', records);
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
        <CircularProgress size={40} sx={{ color: '#334155' }} />
        <Typography variant="body2" sx={{ fontWeight: 700, color: '#334155' }}>Saving {filledRows.length} bills…</Typography>
      </Backdrop>
      <Box
        sx={{
          background: '#ffffff', border: '1px solid #e4e8ee',
          px: 3, py: 2,
          display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0,
        }}
      >
        <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'rgba(51,65,85,0.08)', display: 'flex' }}>
          <ShoppingBasket size={18} color="#334155" />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="overline" sx={{ color: '#64748b', fontWeight: 700, fontSize: '0.62rem', letterSpacing: '0.1em', lineHeight: 1 }}>
            PURCHASES
          </Typography>
          <Typography variant="h6" sx={{ color: '#1e293b', fontWeight: 800, lineHeight: 1.2 }}>
            Bulk Add Purchases
          </Typography>
        </Box>
        <IconButton onClick={onClose} disabled={saving} sx={{ color: '#1e293b' }}>
          <X size={20} />
        </IconButton>
      </Box>

      <DialogContent sx={{ p: 0, overflow: 'auto' }}>
        <TableContainer>
          <Table size="small" stickyHeader sx={{ minWidth: 900 }}>
            <TableHead>
              <TableRow sx={{ bgcolor: 'rgba(0,0,0,0.03)' }}>
                {['#', 'Vendor', 'Date', 'Bill #', 'Item / Service', 'Qty', 'Rate ₹', 'Disc %', 'GST %', 'Amount', ''].map((h, i) => (
                  <TableCell key={i} sx={{ fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary', whiteSpace: 'nowrap',
                    ...(i === 0 && { width: 40, pl: 2 }),
                    ...(i === 1 && { minWidth: 180 }),
                    ...(i === 2 && { width: 130 }),
                    ...(i === 3 && { width: 120 }),
                    ...(i === 4 && { minWidth: 180 }),
                    ...(i === 5 && { width: 70, textAlign: 'center' }),
                    ...(i === 6 && { width: 100, textAlign: 'right' }),
                    ...(i === 7 && { width: 80, textAlign: 'center' }),
                    ...(i === 8 && { width: 80, textAlign: 'center' }),
                    ...(i === 9 && { width: 100, textAlign: 'right' }),
                    ...(i === 10 && { width: 40 }),
                  }}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, idx) => (
                <TableRow key={row._key} sx={{ '&:hover': { bgcolor: 'rgba(51,65,85,0.03)' } }}>
                  <TableCell sx={{ pl: 2, color: 'text.secondary', fontSize: '0.75rem' }}>{idx + 1}</TableCell>
                  <TableCell>
                    <PartySelect
                      options={vendors}
                      value={row.party}
                      onChange={(v) => updateRow(row._key, 'party', v)}
                      label=""
                      placeholder="Vendor…"
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      type="date"
                      size="small"
                      value={row.date}
                      onChange={(e) => updateRow(row._key, 'date', e.target.value)}
                      slotProps={{ inputLabel: { shrink: true } }}
                      sx={{ width: 130 }}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      value={row.billNumber}
                      placeholder="Auto"
                      onChange={(e) => updateRow(row._key, 'billNumber', e.target.value)}
                      sx={{ width: 110 }}
                    />
                  </TableCell>
                  <TableCell>
                    <ItemSelect
                      options={stockItems}
                      value={row.item}
                      onChange={(v) => {
                        if (v && typeof v !== 'string') {
                          const price = Number(v.purchasePrice ?? v.salePrice ?? v.price) || 0;
                          const gst = Number(v.taxRate) || 0;
                          const disc = Number(v.discount) || '';
                          setRows((r) => r.map((rr) => rr._key === row._key ? { ...rr, item: v, rate: price || '', gst: gst || '', disc } : rr));
                        } else {
                          updateRow(row._key, 'item', v);
                        }
                      }}
                      isSale={false}
                      canViewPurchasePrice={true}
                      placeholder="Item…"
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <TextField
                      type="number"
                      size="small"
                      value={row.qty}
                      onChange={(e) => updateRow(row._key, 'qty', e.target.value)}
                      onFocus={(e) => e.target.select()}
                      slotProps={{ input: { style: { textAlign: 'center' }, min: 0, step: 1 } }}
                      sx={{ width: 64 }}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <TextField
                      type="number"
                      size="small"
                      value={row.rate}
                      placeholder="0.00"
                      onChange={(e) => updateRow(row._key, 'rate', e.target.value)}
                      onFocus={(e) => e.target.select()}
                      slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment>, style: { textAlign: 'right' }, min: 0, step: 0.01 } }}
                      sx={{ width: 100 }}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <TextField
                      type="number"
                      size="small"
                      value={row.disc}
                      placeholder="0"
                      onChange={(e) => updateRow(row._key, 'disc', e.target.value)}
                      onFocus={(e) => e.target.select()}
                      slotProps={{ input: { style: { textAlign: 'center' }, min: 0, max: 100 } }}
                      sx={{ width: 72 }}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <TextField
                      type="number"
                      size="small"
                      value={row.gst}
                      placeholder="0"
                      onChange={(e) => updateRow(row._key, 'gst', e.target.value)}
                      onFocus={(e) => e.target.select()}
                      slotProps={{ input: { style: { textAlign: 'center' }, min: 0, max: 100 } }}
                      sx={{ width: 72 }}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" sx={{ fontWeight: 800, color: '#334155', whiteSpace: 'nowrap' }}>
                      ₹{calcAmount(row).toFixed(2)}
                    </Typography>
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
          sx={{ fontWeight: 700, textTransform: 'none', borderRadius: '8px', borderColor: 'rgba(51,65,85,0.3)', color: '#334155', mr: 'auto' }}
        >
          Add Row
        </Button>
        <Chip
          label={`${filledRows.length} row${filledRows.length !== 1 ? 's' : ''}`}
          size="small"
          sx={{ fontWeight: 700, bgcolor: 'rgba(51,65,85,0.08)', color: '#334155' }}
        />
        <Box sx={{ px: 2, py: 0.5, bgcolor: 'rgba(51,65,85,0.08)', borderRadius: '8px', border: '1px solid rgba(51,65,85,0.2)' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#334155' }}>
            Total ₹{totalAmount.toFixed(2)}
          </Typography>
        </Box>
        <Button onClick={onClose} disabled={saving} sx={{ fontWeight: 700, textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          startIcon={saving ? null : <Save size={16} />}
          onClick={handleSave}
          disabled={saving || filledRows.length === 0}
          sx={{
            fontWeight: 700, textTransform: 'none', borderRadius: '8px',
            background: '#334155',
            boxShadow: '0 4px 12px rgba(51,65,85,0.28)',
          }}
        >
          {saving ? 'Saving…' : `Save ${filledRows.length} Bill${filledRows.length !== 1 ? 's' : ''}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
