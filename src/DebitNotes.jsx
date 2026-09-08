import React, { useState, useEffect } from 'react';
import {
  Box, Button, Card, CardContent, Typography, TextField, Grid,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, IconButton, MenuItem, Stack, Divider, alpha, useTheme,
  Backdrop, CircularProgress,
} from '@mui/material';
import { Plus, Trash2, CornerUpLeft, FileText, AlertCircle } from 'lucide-react';
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

// Debit Note: issued BY business TO vendor (supplier)
// Use cases: you return purchased goods, vendor overcharged you, quality issues with received goods
const DebitNotes = () => {
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

  const vendors = getItems('parties').filter(p => p.businessId === currentBusiness?.id && p.type === 'Vendor');
  const stockItems = getItems('items').filter(i => i.businessId === currentBusiness?.id);
  const allPurchases = getItems('purchases').filter(p => p.businessId === currentBusiness?.id);
  const debitNotes = getItems('debitNotes').filter(d => d.businessId === currentBusiness?.id).reverse();

  const vendorPurchases = selectedParty
    ? allPurchases.filter(p => p.partyId === selectedParty.id)
    : [];

  const resetForm = () => {
    setNoteNumber(`DN-${Date.now().toString().slice(-6)}`);
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
      if (sel) { item.name = sel.name; item.price = sel.purchasePrice || sel.salePrice || 0; item.taxRate = sel.taxRate || 0; }
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
      await showAlert({ title: 'Missing fields', message: 'Please fill in the vendor, debit note number and date.', variant: 'warning' });
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
      await addItem('debitNotes', editId ? { ...payload, id: editId } : payload);
      setView('list');
    } catch (e) {
      await showAlert({ title: 'Save failed', message: 'Save failed: ' + (e?.message || e), variant: 'danger' });
    }
    setIsSaving(false);
  };

  const handleEdit = (dn) => {
    setEditId(dn.id);
    setSelectedParty(vendors.find(p => p.id === dn.partyId) || null);
    setNoteDate(dn.date || '');
    setNoteNumber(dn.noteNumber || '');
    setNoteItems(dn.items?.length ? dn.items.map(i => ({ ...i, total: i.qty * i.price * (1 + (i.taxRate || 0) / 100) })) : [{ itemId: '', name: '', qty: 1, price: 0, taxRate: 0, total: 0 }]);
    setReason(dn.reason || '');
    setNoGST(!!dn.noGST);
    setLinkedInvoice(dn.linkedInvoiceNumber ? { id: dn.linkedInvoiceId, invoiceNumber: dn.linkedInvoiceNumber } : null);
    setView('create');
  };

  const handleDelete = async (id) => {
    const ok = await confirm({ title: 'Delete Debit Note', message: 'This debit note will be permanently deleted. This cannot be undone.', confirmLabel: 'Delete', variant: 'danger' });
    if (ok) await deleteItem('debitNotes', id);
  };

  const doPrint = (dn) => {
    setPrintingTx({ ...dn, invoiceNumber: dn.noteNumber });
    setTimeout(() => handlePrint(), 100);
  };

  return (
    <Box>
      <Backdrop open={isPrinting} sx={{ zIndex: 9999, flexDirection: 'column', gap: 2, bgcolor: 'rgba(0,0,0,0.55)' }}>
        <CircularProgress size={48} sx={{ color: 'white' }} />
        <Typography sx={{ color: 'white', fontWeight: 700 }}>Preparing to print…</Typography>
      </Backdrop>
      <Box sx={{ position: 'absolute', left: -9999 }}>
        <InvoiceTemplate ref={printRef} transaction={printingTx} business={currentBusiness} paperSize={paperSize} title="Debit Note" />
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>Debit Notes</Typography>
          <Typography variant="caption" color="text.secondary">Issued to vendors when returning purchased goods or claiming overcharge refunds</Typography>
        </Box>
        <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setView(view === 'list' ? 'create' : 'list')}>
          {view === 'list' ? 'New Debit Note' : 'Back to List'}
        </Button>
      </Box>

      {view === 'list' && (
        <TxListView
          records={debitNotes}
          labelSingular="debit note"
          labelPlural="debit notes"
          accessors={{ number: (r) => r.noteNumber }}
          emptyIcon={<CornerUpLeft size={28} />}
          emptyAction={<Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setView('create')}>New Debit Note</Button>}
          onEdit={handleEdit}
          onDelete={(r) => handleDelete(r.id)}
          onPrint={(r) => doPrint(r)}
          renderPreview={(r) => (
            <InvoiceTemplate
              transaction={{ ...r, invoiceNumber: r.noteNumber }}
              business={currentBusiness}
              paperSize={paperSize}
              title="Debit Note"
            />
          )}
        />
      )}

      {view === 'create' && (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mt: 2 }}>
          <CardContent sx={{ p: 3 }}>
            {/* Info banner */}
            <Box sx={{ mb: 3, p: 1.5, bgcolor: alpha(theme.palette.warning.main, 0.06), border: `1px solid ${alpha(theme.palette.warning.main, 0.25)}`, borderRadius: 2, display: 'flex', alignItems: 'flex-start', gap: 1 }}>
              <AlertCircle size={16} color={theme.palette.warning.main} style={{ marginTop: 2, flexShrink: 0 }} />
              <Typography variant="caption" sx={{ color: 'warning.dark' }}>
                A <strong>Debit Note</strong> is raised when you (the buyer) return goods to a vendor, or when a vendor has overcharged you. Link it to the original purchase invoice for GST compliance. The vendor responds with a Credit Note.
              </Typography>
            </Box>

            <Grid container spacing={2}>
              {/* Vendor */}
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <PartySelect
                  options={vendors}
                  value={selectedParty}
                  onChange={(v) => { setSelectedParty(v); setLinkedInvoice(null); }}
                  label="Vendor *"
                  placeholder="Search vendor…"
                />
              </Grid>

              {/* Link to original purchase invoice */}
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <TextField
                  select fullWidth size="small"
                  label="Original Purchase Invoice (optional)"
                  value={linkedInvoice?.id || ''}
                  onChange={(e) => {
                    const inv = vendorPurchases.find(p => p.id === e.target.value);
                    if (inv) loadFromInvoice(inv);
                    else setLinkedInvoice(null);
                  }}
                  disabled={!selectedParty}
                  helperText={selectedParty && vendorPurchases.length === 0 ? 'No purchases found for this vendor' : ''}
                >
                  <MenuItem value=""><em>None — manual entry</em></MenuItem>
                  {vendorPurchases.map(p => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.invoiceNumber} — {p.date} — ₹{(p.totalAmount || 0).toFixed(2)}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              <Grid size={{ xs: 6, sm: 3, md: 2 }}>
                <TextField fullWidth size="small" label="Debit Note #" value={noteNumber} onChange={(e) => setNoteNumber(e.target.value)} />
              </Grid>
              <Grid size={{ xs: 6, sm: 3, md: 2 }}>
                <TextField fullWidth size="small" type="date" label="Date" value={noteDate} onChange={(e) => setNoteDate(e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid size={12}>
                <TextField fullWidth size="small" label="Reason for Debit Note" placeholder="e.g. Goods returned — damaged in transit, Overcharge correction…" value={reason} onChange={(e) => setReason(e.target.value)} />
              </Grid>

              {linkedInvoice && (
                <Grid size={12}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <FileText size={14} color={theme.palette.success.main} />
                    <Typography variant="caption" color="success.main" sx={{ fontWeight: 600 }}>
                      Linked to invoice {linkedInvoice.invoiceNumber} — items auto-filled. Adjust quantities to reflect what's being returned.
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
                  <Box sx={{ textAlign: 'right', minWidth: 130 }}>
                    <Typography variant="caption" color="text.secondary">Total Debit</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800, color: 'warning.dark' }}>₹{total.toFixed(2)}</Typography>
                  </Box>
                </Box>
                <Stack direction="row" justifyContent="flex-end" spacing={1.5}>
                  <Button variant="outlined" onClick={() => setView('list')}>Cancel</Button>
                  <Button variant="contained" onClick={handleSave} disabled={isSaving}>
                    {editId ? 'Update Debit Note' : 'Save Debit Note'}
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

export default DebitNotes;
