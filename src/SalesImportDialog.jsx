import React, { useState, useRef } from 'react';
import {
  Dialog, DialogContent, DialogActions,
  Box, Button, Typography, IconButton, Chip, Alert,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  Backdrop, CircularProgress,
} from '@mui/material';
import { X, Upload, Download, CheckCircle, AlertTriangle } from 'lucide-react';
import { useData } from './DataContext';
import { useBusiness } from './BusinessContext';

const buildSalesRecords = (rows, parties, businessId, isSale) => {
  const groups = {};
  for (const row of rows) {
    if (!row.invoiceNum) continue;
    if (!groups[row.invoiceNum]) groups[row.invoiceNum] = [];
    groups[row.invoiceNum].push(row);
  }
  const records = [];
  for (const [invoiceNum, rowGroup] of Object.entries(groups)) {
    const first = rowGroup[0];
    const party = parties.find((p) => p.name?.toLowerCase() === first.customerName?.toLowerCase());
    const items = rowGroup.map((r) => {
      const base = r.qty * r.rate * (1 - r.disc / 100);
      const tax = base * (r.gst / 100);
      return { name: r.itemName, qty: r.qty, price: r.rate, discountPercent: r.disc, taxRate: r.gst, taxInclusive: false, total: base + tax };
    });
    const subtotal = items.reduce((s, it) => s + it.qty * it.price * (1 - it.discountPercent / 100), 0);
    const taxAmount = items.reduce((s, it) => s + it.qty * it.price * (1 - it.discountPercent / 100) * (it.taxRate / 100), 0);
    const totalAmount = subtotal + taxAmount;
    records.push({
      id: crypto.randomUUID(),
      businessId,
      partyId: party?.id || '',
      partyName: first.customerName || '',
      date: first.date,
      invoiceNumber: invoiceNum,
      items,
      subtotal,
      taxAmount,
      totalAmount,
      discountAmount: 0,
      discountPercent: 0,
      paymentMode: first.paymentMode || 'Cash',
      type: 'Sales',
      status: 'paid',
    });
  }
  return records;
};

const today = () => new Date().toISOString().split('T')[0];

const COLUMNS = ['Customer Name', 'Date', 'Invoice#', 'Item Name', 'Qty', 'Rate', 'Disc%', 'GST%', 'Payment Mode'];

const SAMPLE_ROWS = [
  { 'Customer Name': 'Ravi Kumar', 'Date': today(), 'Invoice#': 'INV-0001', 'Item Name': 'Blue Shirt', 'Qty': 2, 'Rate': 500, 'Disc%': 0, 'GST%': 5, 'Payment Mode': 'Cash' },
  { 'Customer Name': 'Ravi Kumar', 'Date': today(), 'Invoice#': 'INV-0001', 'Item Name': 'Black Jeans', 'Qty': 1, 'Rate': 800, 'Disc%': 10, 'GST%': 12, 'Payment Mode': 'Cash' },
  { 'Customer Name': 'Priya Store', 'Date': today(), 'Invoice#': 'INV-0002', 'Item Name': 'T-Shirt', 'Qty': 5, 'Rate': 250, 'Disc%': 0, 'GST%': 5, 'Payment Mode': 'Bank/UPI' },
];

async function downloadTemplate() {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(SAMPLE_ROWS, { header: COLUMNS });
  XLSX.utils.book_append_sheet(wb, ws, 'Sales Import');
  XLSX.writeFile(wb, 'sales_import_template.xlsx');
}

export default function SalesImportDialog({ open, onClose, isSale, onSuccess }) {
  const { addItems, getItems } = useData();
  const { currentBusiness } = useBusiness();
  const fileRef = useRef();
  const [step, setStep] = useState(0); // 0=upload, 1=preview, 2=done
  const [rows, setRows] = useState([]);
  const [errors, setErrors] = useState([]);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  const handleReset = () => { setStep(0); setRows([]); setErrors([]); setSavedCount(0); };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(ev.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
      const errs = [];
      const parsed = data.map((row, i) => {
        const customerName = String(row['Customer Name'] || '').trim();
        const invoiceNum = String(row['Invoice#'] || '').trim();
        const itemName = String(row['Item Name'] || '').trim();
        const qty = Number(row['Qty']) || 1;
        const rate = Number(row['Rate']) || 0;
        const disc = Number(row['Disc%']) || 0;
        const gst = Number(row['GST%']) || 0;
        const date = String(row['Date'] || today()).trim();
        const paymentMode = String(row['Payment Mode'] || 'Cash').trim();
        if (!invoiceNum) errs.push(`Row ${i + 2}: Missing Invoice#`);
        return { customerName, invoiceNum, itemName, qty, rate, disc, gst, date, paymentMode };
      });
      setErrors(errs);
      setRows(parsed);
      setStep(1);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => requestAnimationFrame(() => {
      const parties = getItems('parties').filter((p) => p.businessId === currentBusiness?.id && p.type === 'Customer');
      const records = buildSalesRecords(rows, parties, currentBusiness.id, isSale);
      addItems('sales', records);
      const count = records.length;
      setSaving(false);
      setSavedCount(count);
      setStep(2);
      onSuccess(count);
    }), 0);
  };

  const handleClose = () => { handleReset(); onClose(); };

  return (
    <Dialog open={open} onClose={saving ? undefined : handleClose} maxWidth="lg" fullWidth PaperProps={{ sx: { borderRadius: 3, maxHeight: '90vh', position: 'relative' } }}>
      <Backdrop open={saving} sx={{ position: 'absolute', zIndex: 10, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.8)', flexDirection: 'column', gap: 1.5 }}>
        <CircularProgress size={40} sx={{ color: '#0d9488' }} />
        <Typography variant="body2" sx={{ fontWeight: 700, color: '#0d9488' }}>Importing {rows.length} rows…</Typography>
      </Backdrop>
      <Box sx={{ background: 'linear-gradient(135deg, #134e4a 0%, #0f766e 45%, #0d9488 100%)', px: 3, py: 2, display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.15)', display: 'flex' }}>
          <Upload size={18} color="white" />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.72)', fontWeight: 700, fontSize: '0.62rem', letterSpacing: '0.1em', lineHeight: 1 }}>IMPORT</Typography>
          <Typography variant="h6" sx={{ color: 'white', fontWeight: 800, lineHeight: 1.2 }}>Import {isSale ? 'Sales' : 'Purchases'}</Typography>
        </Box>
        <IconButton onClick={handleClose} disabled={saving} sx={{ color: 'white' }}><X size={20} /></IconButton>
      </Box>

      <DialogContent sx={{ p: 3 }}>
        {step === 0 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Box sx={{ mb: 3 }}>
              <Typography variant="body1" sx={{ fontWeight: 600, mb: 1 }}>Upload CSV or Excel file</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Required columns: Customer Name, Date, Invoice#, Item Name, Qty, Rate, Disc%, GST%, Payment Mode
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Rows with the same Invoice# are grouped into one transaction.
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button variant="outlined" startIcon={<Download size={16} />} onClick={downloadTemplate} sx={{ fontWeight: 700, textTransform: 'none', borderRadius: '8px' }}>
                Download Template
              </Button>
              <Button
                variant="contained"
                startIcon={<Upload size={16} />}
                onClick={() => fileRef.current?.click()}
                sx={{ fontWeight: 700, textTransform: 'none', borderRadius: '8px', background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)' }}
              >
                Upload File
              </Button>
            </Box>
            <input ref={fileRef} type="file" accept=".xlsx,.csv,.xls" style={{ display: 'none' }} onChange={handleFile} />
          </Box>
        )}

        {step === 1 && (
          <Box>
            <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <Chip label={`${rows.length} row${rows.length !== 1 ? 's' : ''} found`} size="small" sx={{ fontWeight: 700, bgcolor: 'rgba(13,148,136,0.08)', color: '#0d9488' }} />
              {errors.length > 0 && <Chip icon={<AlertTriangle size={12} />} label={`${errors.length} issue${errors.length !== 1 ? 's' : ''}`} size="small" color="warning" sx={{ fontWeight: 700 }} />}
              <Button size="small" onClick={handleReset} sx={{ ml: 'auto', textTransform: 'none', fontWeight: 700 }}>Upload different file</Button>
            </Box>
            {errors.length > 0 && (
              <Alert severity="warning" sx={{ mb: 2, borderRadius: '8px' }}>
                {errors.map((e, i) => <div key={i}>{e}</div>)}
              </Alert>
            )}
            <TableContainer sx={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: '8px', maxHeight: 360, overflow: 'auto' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    {COLUMNS.map((c) => (
                      <TableCell key={c} sx={{ fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary', bgcolor: 'rgba(0,0,0,0.03)', whiteSpace: 'nowrap' }}>{c}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.slice(0, 50).map((row, i) => (
                    <TableRow key={i} sx={{ '&:hover': { bgcolor: 'rgba(13,148,136,0.03)' } }}>
                      <TableCell>{row.customerName}</TableCell>
                      <TableCell>{row.date}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{row.invoiceNum}</TableCell>
                      <TableCell>{row.itemName}</TableCell>
                      <TableCell align="center">{row.qty}</TableCell>
                      <TableCell align="right">₹{row.rate}</TableCell>
                      <TableCell align="center">{row.disc}%</TableCell>
                      <TableCell align="center">{row.gst}%</TableCell>
                      <TableCell>{row.paymentMode}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {rows.length > 50 && <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>Showing first 50 of {rows.length} rows</Typography>}
          </Box>
        )}

        {step === 2 && (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <CheckCircle size={56} color="#0d9488" />
            <Typography variant="h5" sx={{ fontWeight: 800, mt: 2, color: '#0d9488' }}>Import Complete!</Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
              {savedCount} invoice{savedCount !== 1 ? 's' : ''} imported successfully.
            </Typography>
          </Box>
        )}

      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid rgba(0,0,0,0.08)', gap: 1 }}>
        {step === 2 ? (
          <Button variant="contained" onClick={handleClose} sx={{ fontWeight: 700, textTransform: 'none', borderRadius: '8px', background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)' }}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={handleClose} disabled={saving} sx={{ fontWeight: 700, textTransform: 'none' }}>Cancel</Button>
            {step === 1 && (
              <Button
                variant="contained"
                onClick={handleSave}
                disabled={saving || rows.length === 0}
                sx={{ fontWeight: 700, textTransform: 'none', borderRadius: '8px', background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)' }}
              >
                {saving ? 'Importing…' : `Import ${Object.keys(rows.reduce((g, r) => { if (r.invoiceNum) g[r.invoiceNum] = true; return g; }, {})).length} Invoice${rows.length !== 1 ? 's' : ''}`}
              </Button>
            )}
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
