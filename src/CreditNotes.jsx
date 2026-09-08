import React, { useState, useEffect } from 'react';
import {
  Box, Button, Card, CardContent, Typography, TextField, Grid,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, IconButton, MenuItem, Chip, Stack, Divider, alpha, useTheme,
  Backdrop, CircularProgress,
} from '@mui/material';
import { Plus, Trash2, RotateCcw, FileText, AlertCircle } from 'lucide-react';
import { useBusiness } from './BusinessContext';
import { useConfig } from './ConfigContext';
import { useData } from './DataContext';
import { useI18n } from './i18n/I18nContext';
import { useDialog } from './DialogContext';
import { useReactToPrint } from 'react-to-print';
import InvoiceTemplate from './InvoiceTemplate';
import PartySelect from './PartySelect';
import ItemSelect from './ItemSelect';
import TxListView from './TxListView';

// Credit Note: issued BY business TO customer
// Use cases: customer returns goods, price correction, discount given after sale
const CreditNotes = () => {
  const theme = useTheme();
  const { currentBusiness } = useBusiness();
  const { t } = useI18n();
  const { config } = useConfig();
  const { addItem, deleteItem, getItems } = useData();
  const { confirm, showAlert } = useDialog();

  const [view, setView] = useState('list');
  const [editId, setEditId] = useState(null);
  const [selectedParty, setSelectedParty] = useState(null);
  const [linkedInvoice, setLinkedInvoice] = useState(null);
  const [noteDate, setNoteDate] = useState(new Date().toISOString().split('T')[0]);
  const [noteNumber, setNoteNumber] = useState('');
  const [reason, setReason] = useState('');
  const [noteItems, setNoteItems] = useState([{ itemId: '', name: '', qty: 1, price: 0, taxRate: 0, total: 0 }]);
  const [noGST, setNoGST] = useState(false);
  const [printingTx, setPrintingTx] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [paperSize, setPaperSize] = useState(() => {
    const d = config.defaultPaperSize;
    return ['A4', 'A5', 'Letter', 'Legal'].includes(d) ? d : 'A4';
  });
  useEffect(() => {
    if (config.defaultPaperSize && ['A4', 'A5', 'Letter', 'Legal'].includes(config.defaultPaperSize)) {
      setPaperSize(config.defaultPaperSize);
    }
  }, [config.defaultPaperSize]);
  const [isPrinting, setIsPrinting] = useState(false);
  const printRef = React.useRef();
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    onBeforePrint: () => setIsPrinting(true),
    onAfterPrint: () => setIsPrinting(false),
  });

  const customers = getItems('parties').filter(p => p.businessId === currentBusiness?.id && p.type === 'Customer');
  const stockItems = getItems('items').filter(i => i.businessId === currentBusiness?.id);
  const allSales = getItems('sales').filter(s => s.businessId === currentBusiness?.id);
  const creditNotes = getItems('creditNotes').filter(c => c.businessId === currentBusiness?.id).reverse();

  const partySales = selectedParty
    ? allSales.filter(s => s.partyId === selectedParty.id)
    : [];

  const resetForm = () => {
    setNoteNumber(`CN-${Date.now().toString().slice(-6)}`);
    setNoteItems([{ itemId: '', name: '', qty: 1, price: 0, taxRate: 0, total: 0 }]);
    setSelectedParty(null);
    setLinkedInvoice(null);
    setNoteDate(new Date().toISOString().split('T')[0]);
    setReason('');
    setEditId(null);
    setNoGST(false);
  };

  useEffect(() => {
    if (view === 'create' && !isSaving) resetForm();
  }, [view]); // eslint-disable-line

  const loadFromInvoice = (inv) => {
    setLinkedInvoice(inv);
    if (inv?.items?.length) {
      setNoteItems(inv.items.map(i => ({ ...i, total: i.qty * i.price * (1 + (i.taxRate || 0) / 100) })));
    }
    setNoGST(!!inv?.noGST);
  };

  const addItemRow = () => setNoteItems([...noteItems, { itemId: '', name: '', qty: 1, price: 0, taxRate: 0, total: 0 }]);
  const removeItemRow = (index) => {
    const next = noteItems.filter((_, i) => i !== index);
    setNoteItems(next.length ? next : [{ itemId: '', name: '', qty: 1, price: 0, taxRate: 0, total: 0 }]);
  };
  const updateItemRow = (index, field, value) => {
    const newItems = [...noteItems];
    const item = { ...newItems[index], [field]: value };
    if (field === 'itemId') {
      const sel = stockItems.find(i => i.id === value);
      if (sel) { item.name = sel.name; item.price = sel.salePrice || 0; item.taxRate = sel.taxRate || 0; }
    }
    item.total = item.qty * item.price * (1 + (item.taxRate || 0) / 100);
    newItems[index] = item;
    setNoteItems(newItems);
  };

  const subtotal = noteItems.reduce((s, i) => s + i.qty * i.price, 0);
  const tax = noGST ? 0 : noteItems.reduce((s, i) => s + i.qty * i.price * ((i.taxRate || 0) / 100), 0);
  const total = subtotal + tax;

  const handleSave = async () => {
    if (!currentBusiness?.id || !selectedParty?.id || !noteNumber?.trim() || !noteDate) {
      await showAlert({ title: 'Missing fields', message: 'Please fill in the customer, credit note number and date.', variant: 'warning' });
      return;
    }
    const cleaned = noteItems.filter(i => i.name && i.qty > 0 && i.price >= 0).map(i => ({ ...i, taxRate: noGST ? 0 : i.taxRate }));
    if (!cleaned.length) { await showAlert({ title: 'No items', message: 'Add at least one item.', variant: 'warning' }); return; }
    if (total <= 0) { await showAlert({ title: 'Invalid total', message: 'Total must be greater than zero.', variant: 'warning' }); return; }
    setIsSaving(true);
    try {
      const bizState = currentBusiness?.state || '';
      const partyState = selectedParty.state || '';
      const payload = {
        businessId: currentBusiness.id,
        partyId: selectedParty.id,
        partyName: selectedParty.name || '',
        partyGstNumber: selectedParty.gstNumber || '',
        partyAddress: selectedParty.address || '',
        partyCity: selectedParty.city || '',
        partyState,
        partyPhone: selectedParty.phone || '',
        placeOfSupply: partyState || bizState,
        isInterState: !!(bizState && partyState && bizState !== partyState),
        date: noteDate,
        noteNumber: noteNumber.trim(),
        linkedInvoiceId: linkedInvoice?.id || null,
        linkedInvoiceNumber: linkedInvoice?.invoiceNumber || null,
        items: cleaned,
        reason: reason || '',
        noGST,
        subtotal,
        taxAmount: tax,
        totalAmount: total,
      };
      await addItem('creditNotes', editId ? { ...payload, id: editId } : payload);
      setView('list');
    } catch (e) {
      await showAlert({ title: 'Save failed', message: 'Save failed: ' + (e?.message || e), variant: 'danger' });
    }
    setIsSaving(false);
  };

  const handleEdit = (cn) => {
    setEditId(cn.id);
    setSelectedParty(customers.find(p => p.id === cn.partyId) || null);
    setNoteDate(cn.date || '');
    setNoteNumber(cn.noteNumber || '');
    setNoteItems(cn.items?.length ? cn.items.map(i => ({ ...i, total: i.qty * i.price * (1 + (i.taxRate || 0) / 100) })) : [{ itemId: '', name: '', qty: 1, price: 0, taxRate: 0, total: 0 }]);
    setReason(cn.reason || '');
    setNoGST(!!cn.noGST);
    setLinkedInvoice(cn.linkedInvoiceNumber ? { id: cn.linkedInvoiceId, invoiceNumber: cn.linkedInvoiceNumber } : null);
    setView('create');
  };

  const handleDelete = async (id) => {
    const ok = await confirm({ title: 'Delete Credit Note', message: 'This credit note will be permanently deleted. This cannot be undone.', confirmLabel: 'Delete', variant: 'danger' });
    if (ok) await deleteItem('creditNotes', id);
  };

  const doPrint = (cn) => {
    setPrintingTx({ ...cn, invoiceNumber: cn.noteNumber });
    setTimeout(() => handlePrint(), 100);
  };

  return (
    <Box>
      <Backdrop open={isPrinting} sx={{ zIndex: 9999, flexDirection: 'column', gap: 2, bgcolor: 'rgba(0,0,0,0.55)' }}>
        <CircularProgress size={48} sx={{ color: 'white' }} />
        <Typography sx={{ color: 'white', fontWeight: 700 }}>Preparing to print…</Typography>
      </Backdrop>
      <Box sx={{ position: 'absolute', left: -9999 }}>
        <InvoiceTemplate ref={printRef} transaction={printingTx} business={currentBusiness} paperSize={paperSize} title="Credit Note" />
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>Credit Notes</Typography>
          <Typography variant="caption" color="text.secondary">Issued to customers for returns, refunds, or price corrections</Typography>
        </Box>
        <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setView(view === 'list' ? 'create' : 'list')}>
          {view === 'list' ? 'New Credit Note' : 'Back to List'}
        </Button>
      </Box>

      {view === 'list' && (
        <TxListView
          records={creditNotes}
          labelSingular="credit note"
          labelPlural="credit notes"
          accessors={{ number: (r) => r.noteNumber }}
          emptyIcon={<RotateCcw size={28} />}
          emptyAction={<Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setView('create')}>New Credit Note</Button>}
          onEdit={handleEdit}
          onDelete={(r) => handleDelete(r.id)}
          onPrint={(r) => doPrint(r)}
          renderPreview={(r) => (
            <InvoiceTemplate
              transaction={{ ...r, invoiceNumber: r.noteNumber }}
              business={currentBusiness}
              paperSize={paperSize}
              title="Credit Note"
            />
          )}
        />
      )}

      {view === 'create' && (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mt: 2 }}>
          <CardContent sx={{ p: 3 }}>
            {/* Header info banner */}
            <Box sx={{ mb: 3, p: 1.5, bgcolor: alpha(theme.palette.info.main, 0.06), border: `1px solid ${alpha(theme.palette.info.main, 0.2)}`, borderRadius: 2, display: 'flex', alignItems: 'flex-start', gap: 1 }}>
              <AlertCircle size={16} color={theme.palette.info.main} style={{ marginTop: 2, flexShrink: 0 }} />
              <Typography variant="caption" color="info.main">
                A <strong>Credit Note</strong> is issued when a customer returns goods, you offer a refund, or you correct an over-charged invoice. Link it to the original sales invoice for GST compliance.
              </Typography>
            </Box>

            <Grid container spacing={2}>
              {/* Customer */}
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <PartySelect
                  options={customers}
                  value={selectedParty}
                  onChange={(v) => { setSelectedParty(v); setLinkedInvoice(null); }}
                  label="Customer *"
                  placeholder="Search customer…"
                />
              </Grid>

              {/* Link to original sales invoice */}
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <TextField
                  select fullWidth size="small"
                  label="Original Sales Invoice (optional)"
                  value={linkedInvoice?.id || ''}
                  onChange={(e) => {
                    const inv = partySales.find(s => s.id === e.target.value);
                    if (inv) loadFromInvoice(inv);
                    else { setLinkedInvoice(null); }
                  }}
                  disabled={!selectedParty}
                  helperText={selectedParty && partySales.length === 0 ? 'No invoices found for this customer' : ''}
                >
                  <MenuItem value=""><em>None — manual entry</em></MenuItem>
                  {partySales.map(s => (
                    <MenuItem key={s.id} value={s.id}>
                      {s.invoiceNumber} — {s.date} — ₹{(s.totalAmount || 0).toFixed(2)}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              <Grid size={{ xs: 6, sm: 3, md: 2 }}>
                <TextField fullWidth size="small" label="Credit Note #" value={noteNumber} onChange={(e) => setNoteNumber(e.target.value)} />
              </Grid>
              <Grid size={{ xs: 6, sm: 3, md: 2 }}>
                <TextField fullWidth size="small" type="date" label="Date" value={noteDate} onChange={(e) => setNoteDate(e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid size={12}>
                <TextField fullWidth size="small" label="Reason for Credit Note" placeholder="e.g. Customer returned defective goods, Price correction…" value={reason} onChange={(e) => setReason(e.target.value)} />
              </Grid>

              {linkedInvoice && (
                <Grid size={12}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <FileText size={14} color={theme.palette.success.main} />
                    <Typography variant="caption" color="success.main" sx={{ fontWeight: 600 }}>
                      Linked to invoice {linkedInvoice.invoiceNumber} — items auto-filled below. Adjust quantities as needed.
                    </Typography>
                  </Box>
                </Grid>
              )}

              {/* Items table */}
              <Grid size={12}>
                <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
                  <Table size="small">
                    <TableHead sx={{ bgcolor: 'rgba(0,0,0,0.02)' }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>Item</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', width: 80 }}>Qty</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', width: 100 }}>Price</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', width: 70 }}>Tax %</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', width: 100 }}>Total</TableCell>
                        <TableCell sx={{ width: 40 }} />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {noteItems.map((row, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <ItemSelect
                              options={stockItems}
                              value={stockItems.find(i => i.id === row.itemId) || (row.name ? { id: '', name: row.name } : null)}
                              onChange={(v) => updateItemRow(idx, 'itemId', typeof v === 'string' ? '' : v?.id || '')}
                              placeholder="Item…"
                              sx={{ minWidth: 180 }}
                              freeSolo
                              onInputChange={(_, val) => { if (val && !stockItems.find(i => i.id === row.itemId)) updateItemRow(idx, 'name', val); }}
                            />
                          </TableCell>
                          <TableCell>
                            <TextField type="number" size="small" value={row.qty}
                              onChange={(e) => { const n = parseFloat(e.target.value); updateItemRow(idx, 'qty', isNaN(n) ? 0 : Math.round(n * 1000) / 1000); }}
                              inputProps={{ min: 0 }} sx={{ width: 72 }} />
                          </TableCell>
                          <TableCell>
                            <TextField type="number" size="small" value={row.price}
                              onChange={(e) => updateItemRow(idx, 'price', parseFloat(e.target.value) || 0)}
                              sx={{ width: 92 }} />
                          </TableCell>
                          <TableCell>
                            <TextField type="number" size="small" value={row.taxRate}
                              onChange={(e) => updateItemRow(idx, 'taxRate', parseFloat(e.target.value) || 0)}
                              disabled={noGST} sx={{ width: 62 }} />
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>₹{(row.total || 0).toFixed(2)}</TableCell>
                          <TableCell>
                            <IconButton size="small" onClick={() => removeItemRow(idx)} sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}>
                              <Trash2 size={14} />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                <Button size="small" startIcon={<Plus size={14} />} onClick={addItemRow} sx={{ mt: 1, textTransform: 'none' }}>Add line</Button>
              </Grid>

              {/* Totals */}
              <Grid size={12}>
                <Divider sx={{ mb: 2 }} />
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 3, flexWrap: 'wrap', mb: 2 }}>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="caption" color="text.secondary">Subtotal</Typography>
                    <Typography sx={{ fontWeight: 600 }}>₹{subtotal.toFixed(2)}</Typography>
                  </Box>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="caption" color="text.secondary">Tax</Typography>
                    <Typography sx={{ fontWeight: 600 }}>₹{tax.toFixed(2)}</Typography>
                  </Box>
                  <Box sx={{ textAlign: 'right', minWidth: 120 }}>
                    <Typography variant="caption" color="text.secondary">Total Credit</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800, color: 'success.main' }}>₹{total.toFixed(2)}</Typography>
                  </Box>
                </Box>
                <Stack direction="row" justifyContent="flex-end" spacing={1.5}>
                  <Button variant="outlined" onClick={() => setView('list')}>Cancel</Button>
                  <Button variant="contained" onClick={handleSave} disabled={isSaving}>
                    {editId ? 'Update Credit Note' : 'Save Credit Note'}
                  </Button>
                </Stack>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default CreditNotes;
