import React, { useState, useRef } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, Typography, Alert, Stepper, Step, StepLabel,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  Paper, Chip, LinearProgress, IconButton, Tooltip,
} from '@mui/material';
import { Upload, FileText, CheckCircle, AlertTriangle, X, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

// Schema definitions for each import type
const SCHEMAS = {
  items: {
    label: 'Items / Inventory',
    requiredCols: ['name'],
    allCols: ['name', 'itemCode', 'category', 'color', 'size', 'unit', 'salePrice', 'purchasePrice', 'taxRate', 'hsnCode', 'stock', 'minStock', 'description', 'barcode'],
    preview: [
      { name: 'Blue Shirt (M)', itemCode: 'SHT001', category: 'Clothing', color: 'Blue', size: 'M', unit: 'NOS', salePrice: 499, purchasePrice: 280, taxRate: 5, hsnCode: '6205', stock: 50, minStock: 10, description: 'Cotton casual shirt', barcode: '' },
      { name: 'Red Kurti (L)', itemCode: 'KRT002', category: 'Clothing', color: 'Red', size: 'L', unit: 'NOS', salePrice: 650, purchasePrice: 380, taxRate: 5, hsnCode: '6211', stock: 30, minStock: 5, description: '', barcode: '' },
      { name: 'Paracetamol 500mg', itemCode: 'MED003', category: 'Pharmacy', color: '', size: '', unit: 'Pcs', salePrice: 12, purchasePrice: 8, taxRate: 0, hsnCode: '3004', stock: 200, minStock: 50, description: '10 tablets strip', barcode: '' },
    ],
    notes: [
      'name is required; all other columns are optional.',
      'category: Clothing, Footwear, Electronics, Pharmacy, etc.',
      'unit: NOS, BAGS, BOX, KGS, Ltr, Mtr, Pcs (default: NOS)',
      'taxRate: 0, 5, 12, 18, or 28',
      'minStock: alert threshold for low-stock warnings',
      'Existing items with matching itemCode will be UPDATED; others are added as new.',
    ],
    transform: (row) => ({
      name: String(row.name || '').trim(),
      itemCode: String(row.itemCode || row['Item Code'] || '').trim(),
      category: String(row.category || row.Category || '').trim(),
      color: String(row.color || row.Color || '').trim(),
      size: String(row.size || row.Size || '').trim(),
      unit: String(row.unit || row.Unit || 'NOS').trim(),
      salePrice: Number(row.salePrice || row['Sale Price'] || 0),
      purchasePrice: Number(row.purchasePrice || row['Purchase Price'] || 0),
      taxRate: Number(row.taxRate || row['Tax Rate'] || 0),
      hsnCode: String(row.hsnCode || row['HSN Code'] || '').trim(),
      stock: Number(row.stock || row.Stock || 0),
      minStock: Number(row.minStock || row['Min Stock'] || 0),
      description: String(row.description || row.Description || '').trim(),
      barcode: String(row.barcode || row.Barcode || '').trim(),
    }),
    validate: (row) => row.name ? null : 'Missing name',
  },
  parties: {
    label: 'Parties (Customers & Vendors)',
    requiredCols: ['name', 'type'],
    allCols: ['name', 'type', 'phone', 'email', 'gstNumber', 'address', 'openingBalance', 'balanceType'],
    preview: [
      { name: 'Acme Corp', type: 'Customer', phone: '9876543210', email: 'acme@example.com', gstNumber: '29AABCA1234A1Z5', address: '123 Main St, Bangalore', openingBalance: 5000, balanceType: 'receivable' },
      { name: 'Global Supplies', type: 'Vendor', phone: '8765432109', email: 'gs@example.com', gstNumber: '27AAACG1234G1Z5', address: '45 Park Road, Mumbai', openingBalance: 2000, balanceType: 'payable' },
      { name: 'Retail Hub', type: 'Both', phone: '7654321098', email: '', gstNumber: '', address: 'Chennai', openingBalance: 0, balanceType: 'receivable' },
    ],
    notes: [
      'name and type are required.',
      'type: Customer, Vendor, or Both',
      'balanceType: receivable or payable',
      'Existing parties with same name will be UPDATED; others added as new.',
    ],
    transform: (row) => ({
      name: String(row.name || '').trim(),
      type: String(row.type || row.Type || 'Customer').trim(),
      phone: String(row.phone || row.Phone || '').trim(),
      email: String(row.email || row.Email || '').trim(),
      gstNumber: String(row.gstNumber || row['GST Number'] || row.gst || '').trim(),
      address: String(row.address || row.Address || '').trim(),
      openingBalance: Number(row.openingBalance || row['Opening Balance'] || 0),
      balanceType: String(row.balanceType || row['Balance Type'] || 'receivable').toLowerCase().trim(),
    }),
    validate: (row) => {
      if (!row.name) return 'Missing name';
      if (!['customer', 'vendor', 'both'].includes(row.type.toLowerCase())) return `Invalid type: "${row.type}"`;
      return null;
    },
  },
};

const FormatPreview = ({ schema }) => (
  <Box>
    <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.75, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>
      Expected Columns
    </Typography>
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1.5 }}>
      {schema.allCols.map(col => (
        <Chip
          key={col}
          label={col}
          size="small"
          color={schema.requiredCols.includes(col) ? 'primary' : 'default'}
          variant={schema.requiredCols.includes(col) ? 'filled' : 'outlined'}
          sx={{ fontSize: '0.7rem' }}
        />
      ))}
    </Box>
    <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.75, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>
      Sample Data
    </Typography>
    <TableContainer component={Paper} variant="outlined" sx={{ mb: 1.5, maxHeight: 160, overflow: 'auto' }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            {schema.allCols.map(col => (
              <TableCell key={col} sx={{ fontWeight: 700, fontSize: '0.7rem', whiteSpace: 'nowrap', bgcolor: 'action.hover' }}>
                {col}{schema.requiredCols.includes(col) ? ' *' : ''}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {schema.preview.map((row, i) => (
            <TableRow key={i}>
              {schema.allCols.map(col => (
                <TableCell key={col} sx={{ fontSize: '0.72rem', whiteSpace: 'nowrap' }}>{row[col] ?? ''}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
    <Box component="ul" sx={{ m: 0, pl: 2 }}>
      {schema.notes.map((note, i) => (
        <Typography key={i} component="li" variant="caption" color="text.secondary" sx={{ mb: 0.25 }}>{note}</Typography>
      ))}
    </Box>
  </Box>
);

const ImportDialog = ({ open, onClose, type, existingItems = [], onImport }) => {
  const schema = SCHEMAS[type];
  const fileRef = useRef(null);

  const [step, setStep] = useState(0); // 0=format, 1=preview, 2=done
  const [parsedRows, setParsedRows] = useState([]);
  const [errors, setErrors] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const reset = () => {
    setStep(0);
    setParsedRows([]);
    setErrors([]);
    setImporting(false);
    setImportResult(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleClose = () => { reset(); onClose(); };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (!raw.length) { setErrors(['File is empty or has no data rows.']); return; }

        const transformed = raw.map(schema.transform);
        const rowErrors = [];
        transformed.forEach((row, i) => {
          const err = schema.validate(row);
          if (err) rowErrors.push(`Row ${i + 2}: ${err}`);
        });

        setParsedRows(transformed);
        setErrors(rowErrors);
        setStep(1);
      } catch (err) {
        setErrors([`Failed to parse file: ${err.message}`]);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    setImporting(true);
    let added = 0, updated = 0, failed = 0;

    for (const row of parsedRows) {
      const err = schema.validate(row);
      if (err) { failed++; continue; }
      try {
        await onImport(row, existingItems);
        // onImport returns 'added' or 'updated'
        const existing = existingItems.find(ex =>
          type === 'items'
            ? (ex.itemCode && ex.itemCode === row.itemCode) || ex.name.toLowerCase() === row.name.toLowerCase()
            : ex.name.toLowerCase() === row.name.toLowerCase()
        );
        if (existing) updated++; else added++;
      } catch {
        failed++;
      }
    }

    setImportResult({ added, updated, failed });
    setImporting(false);
    setStep(2);
  };

  const downloadSampleCSV = () => {
    const ws = XLSX.utils.json_to_sheet(schema.preview);
    const wb = XLSX.utils.book_new();
    const safeSheet = schema.label.replace(/[:\\/?\*\[\]]/g, ' ').trim().slice(0, 31) || 'Sample';
    XLSX.utils.book_append_sheet(wb, ws, safeSheet);
    XLSX.writeFile(wb, `sample_${type}.xlsx`);
  };

  if (!schema) return null;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 700 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Upload size={20} />
          Import {schema.label}
        </Box>
        <IconButton size="small" onClick={handleClose}><X size={18} /></IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 2.5 }}>
        <Stepper activeStep={step} sx={{ mb: 2.5 }}>
          {['Format', 'Preview & Confirm', 'Done'].map(label => (
            <Step key={label}><StepLabel>{label}</StepLabel></Step>
          ))}
        </Stepper>

        {/* Step 0: Format info + upload */}
        {step === 0 && (
          <Box>
            <FormatPreview schema={schema} />
            <Box sx={{ mt: 2, display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                startIcon={<Download size={16} />}
                onClick={downloadSampleCSV}
                size="small"
                sx={{ textTransform: 'none' }}
              >
                Download Sample Excel
              </Button>
              <Button
                variant="contained"
                startIcon={<Upload size={16} />}
                onClick={() => fileRef.current?.click()}
                size="small"
                sx={{ textTransform: 'none' }}
              >
                Upload Excel / CSV
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={handleFile}
              />
            </Box>
            {errors.length > 0 && (
              <Alert severity="error" sx={{ mt: 1.5 }}>
                {errors[0]}
              </Alert>
            )}
          </Box>
        )}

        {/* Step 1: Preview parsed data */}
        {step === 1 && (
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <Chip label={`${parsedRows.length} rows`} color="primary" size="small" />
              {errors.length > 0 && <Chip label={`${errors.length} errors`} color="error" size="small" />}
              <Typography variant="caption" color="text.secondary">
                Rows with errors will be skipped during import.
              </Typography>
            </Box>

            {errors.length > 0 && (
              <Alert severity="warning" sx={{ mb: 1.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>Issues found (will be skipped):</Typography>
                {errors.slice(0, 5).map((e, i) => <div key={i}>{e}</div>)}
                {errors.length > 5 && <div>…and {errors.length - 5} more</div>}
              </Alert>
            )}

            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300, overflow: 'auto' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, bgcolor: 'action.hover', fontSize: '0.7rem' }}>#</TableCell>
                    {schema.allCols.map(col => (
                      <TableCell key={col} sx={{ fontWeight: 700, bgcolor: 'action.hover', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{col}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {parsedRows.map((row, i) => {
                    const rowErr = schema.validate(row);
                    return (
                      <TableRow key={i} sx={{ bgcolor: rowErr ? 'error.50' : undefined }}>
                        <TableCell sx={{ fontSize: '0.72rem' }}>
                          {rowErr ? <Tooltip title={rowErr}><AlertTriangle size={14} color="orange" /></Tooltip> : i + 1}
                        </TableCell>
                        {schema.allCols.map(col => (
                          <TableCell key={col} sx={{ fontSize: '0.72rem', whiteSpace: 'nowrap' }}>{String(row[col] ?? '')}</TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>

            {importing && <LinearProgress sx={{ mt: 1.5 }} />}
          </Box>
        )}

        {/* Step 2: Done */}
        {step === 2 && importResult && (
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <CheckCircle size={48} color="#16a34a" style={{ marginBottom: 12 }} />
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Import Complete</Typography>
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <Chip label={`${importResult.added} Added`} color="success" />
              <Chip label={`${importResult.updated} Updated`} color="info" />
              {importResult.failed > 0 && <Chip label={`${importResult.failed} Failed`} color="error" />}
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2.5, pb: 2 }}>
        {step === 0 && <Button onClick={handleClose} sx={{ textTransform: 'none' }}>Cancel</Button>}
        {step === 1 && (
          <>
            <Button onClick={() => { setStep(0); setParsedRows([]); setErrors([]); if (fileRef.current) fileRef.current.value = ''; }} sx={{ textTransform: 'none' }}>
              Back
            </Button>
            <Button
              variant="contained"
              onClick={handleImport}
              disabled={importing || parsedRows.filter(r => !schema.validate(r)).length === 0}
              startIcon={<Upload size={16} />}
              sx={{ textTransform: 'none' }}
            >
              Import {parsedRows.filter(r => !schema.validate(r)).length} rows
            </Button>
          </>
        )}
        {step === 2 && (
          <Button variant="contained" onClick={handleClose} sx={{ textTransform: 'none' }}>Done</Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default ImportDialog;
