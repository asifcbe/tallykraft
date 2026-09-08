import React, { useState, useEffect } from 'react';
import {
  Box, Button, Card, CardContent, Typography, TextField, Grid,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, IconButton, Autocomplete, TablePagination, Dialog, MenuItem,
  Backdrop, CircularProgress
} from '@mui/material';
import { Plus, Trash2, Printer, Edit2, Eye, X, Truck } from 'lucide-react';
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

const DeliveryNotes = () => {
  const { currentBusiness } = useBusiness();
  const { t } = useI18n();
  const { addItem, deleteItem, getItems } = useData();
  const { confirm, showAlert } = useDialog();
  const { config } = useConfig();
  const [view, setView] = useState('list');
  const [editId, setEditId] = useState(null);
  const [selectedParty, setSelectedParty] = useState(null);
  const [noteDate, setNoteDate] = useState(new Date().toISOString().split('T')[0]);
  const [noteNumber, setNoteNumber] = useState('');
  const [items, setItems] = useState([{ itemId: '', name: '', qty: 1, price: 0, taxRate: 0, total: 0 }]);
  const [address, setAddress] = useState('');
  const [printingTx, setPrintingTx] = useState(null);
  const [paperSize, setPaperSize] = useState(() => {
    const d = config.defaultPaperSize;
    return ['A4', 'A5', 'Letter', 'Legal'].includes(d) ? d : 'A4';
  });
  useEffect(() => {
    if (config.defaultPaperSize && ['A4', 'A5', 'Letter', 'Legal'].includes(config.defaultPaperSize)) {
      setPaperSize(config.defaultPaperSize);
    }
  }, [config.defaultPaperSize]);
  const [isSaving, setIsSaving] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const printRef = React.useRef();

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    onBeforePrint: () => setIsPrinting(true),
    onAfterPrint: () => setIsPrinting(false),
  });

  const parties = getItems('parties').filter(p => p.businessId === currentBusiness?.id && p.type === 'Customer');
  const stockItems = getItems('items').filter(i => i.businessId === currentBusiness?.id);
  const deliveryNotes = getItems('deliveryNotes').filter(d => d.businessId === currentBusiness?.id).reverse();

  useEffect(() => {
    if (view === 'create' && !isSaving) {
      setNoteNumber(`DN-${Date.now().toString().slice(-6)}`);
      setItems([{ itemId: '', name: '', qty: 1, price: 0, taxRate: 0, total: 0 }]);
      setSelectedParty(null);
      setNoteDate(new Date().toISOString().split('T')[0]);
      setAddress('');
      setEditId(null);
    }
  }, [view, isSaving]);

  const addItemRow = () => setItems([...items, { itemId: '', name: '', qty: 1, price: 0, taxRate: 0, total: 0 }]);
  const removeItemRow = (index) => {
    const next = items.filter((_, i) => i !== index);
    setItems(next.length ? next : [{ itemId: '', name: '', qty: 1, price: 0, taxRate: 0, total: 0 }]);
  };
  const updateItemRow = (index, field, value) => {
    const newItems = [...items];
    const item = { ...newItems[index], [field]: value };
    if (field === 'itemId') {
      const sel = stockItems.find(i => i.id === value);
      if (sel) { item.name = sel.name; item.price = sel.salePrice; item.taxRate = sel.taxRate; }
    }
    item.total = item.qty * item.price * (1 + (item.taxRate || 0) / 100);
    newItems[index] = item;
    setItems(newItems);
  };

  const handleSave = async () => {
    if (!currentBusiness?.id || !selectedParty?.id || !noteNumber?.trim() || !noteDate) {
      await showAlert({ title: 'Missing fields', message: 'Please fill in the customer, delivery note number and date.', variant: 'warning' });
      return;
    }
    const cleaned = items.filter(i => i.itemId && i.qty > 0).map(i => ({ ...i }));
    if (!cleaned.length) { await showAlert({ title: 'No items', message: 'Add at least one item with a valid quantity.', variant: 'warning' }); return; }
    setIsSaving(true);
    try {
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
        placeOfSupply: partyState || currentBusiness?.state || '',
        isInterState: !!(currentBusiness?.state && partyState && currentBusiness.state !== partyState),
        date: noteDate,
        noteNumber: noteNumber.trim(),
        items: cleaned,
        deliveryAddress: address || selectedParty.address || ''
      };
      if (editId) await addItem('deliveryNotes', { ...payload, id: editId });
      else await addItem('deliveryNotes', payload);
      setView('list');
    } catch (e) { await showAlert({ title: 'Save failed', message: 'Save failed: ' + (e?.message || e), variant: 'danger' }); }
    setIsSaving(false);
  };

  const handleEdit = (dn) => {
    setEditId(dn.id);
    setSelectedParty(parties.find(p => p.id === dn.partyId) || null);
    setNoteDate(dn.date || '');
    setNoteNumber(dn.noteNumber || '');
    setItems(dn.items?.length ? dn.items.map(i => ({ ...i, total: i.qty * i.price * (1 + (i.taxRate || 0) / 100) })) : [{ itemId: '', name: '', qty: 1, price: 0, taxRate: 0, total: 0 }]);
    setAddress(dn.deliveryAddress || '');
    setView('create');
  };

  const handleDelete = async (id) => {
    const ok = await confirm({ title: 'Delete Delivery Note', message: 'This delivery note will be permanently deleted. This cannot be undone.', confirmLabel: 'Delete', variant: 'danger' });
    if (ok) await deleteItem('deliveryNotes', id);
  };

  const doPrint = (dn) => {
    const dnTotal = dn.items?.reduce((s, i) => s + i.qty * i.price * (1 + (i.taxRate || 0) / 100), 0) || 0;
    setPrintingTx({ ...dn, invoiceNumber: dn.noteNumber, date: dn.date, subtotal: dnTotal, taxAmount: 0, totalAmount: dnTotal });
    setTimeout(() => handlePrint(), 100);
  };

  return (
    <Box sx={{ maxWidth: 1440, mx: 'auto' }}>
      <Backdrop open={isPrinting} sx={{ zIndex: 9999, flexDirection: 'column', gap: 2, bgcolor: 'rgba(0,0,0,0.55)' }}>
        <CircularProgress size={48} sx={{ color: 'white' }} />
        <Typography sx={{ color: 'white', fontWeight: 700 }}>Preparing to print…</Typography>
      </Backdrop>
      {/* Hidden print ref */}
      <Box sx={{ position: 'absolute', left: -9999 }}>
        <InvoiceTemplate ref={printRef} transaction={printingTx} business={currentBusiness} paperSize={paperSize} title="Delivery Note" />
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1rem' }}>{t('nav.deliveryNotes')}</Typography>
        <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setView(view === 'list' ? 'create' : 'list')}>{view === 'list' ? t('doc.newDeliveryNote') : t('doc.backToList')}</Button>
      </Box>

      {view === 'list' && (
        <TxListView
          records={deliveryNotes}
          labelSingular="delivery note"
          labelPlural="delivery notes"
          accessors={{
            number: (r) => r.noteNumber,
            amount: (r) => (r.items?.reduce((s, i) => s + i.qty * i.price * (1 + (i.taxRate || 0) / 100), 0) || 0),
          }}
          emptyIcon={<Truck size={28} />}
          emptyAction={<Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setView('create')}>{t('doc.newDeliveryNote')}</Button>}
          onEdit={handleEdit}
          onDelete={(r) => handleDelete(r.id)}
          onPrint={(r) => doPrint(r)}
          renderPreview={(r) => {
            const dnTotal = r.items?.reduce((s, i) => s + i.qty * i.price * (1 + (i.taxRate || 0) / 100), 0) || 0;
            return (
              <InvoiceTemplate
                transaction={{ ...r, invoiceNumber: r.noteNumber, date: r.date, subtotal: dnTotal, taxAmount: 0, totalAmount: dnTotal }}
                business={currentBusiness}
                paperSize={paperSize}
                title="Delivery Note"
              />
            );
          }}
        />
      )}

      {view === 'create' && (
        <Card sx={{ mt: 2 }}>
          <CardContent>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6, md: 4 }}><PartySelect options={parties} value={selectedParty} onChange={(v) => setSelectedParty(v)} label="Customer" placeholder="Search customer…" /></Grid>
              <Grid size={{ xs: 6, sm: 3, md: 2 }}><TextField fullWidth size="small" label="Delivery Note #" value={noteNumber} onChange={(e) => setNoteNumber(e.target.value)} /></Grid>
              <Grid size={{ xs: 6, sm: 3, md: 2 }}><TextField fullWidth size="small" type="date" label="Date" value={noteDate} onChange={(e) => setNoteDate(e.target.value)} InputLabelProps={{ shrink: true }} /></Grid>
              <Grid size={12}><TextField fullWidth size="small" label="Delivery Address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Leave blank to use party address" /></Grid>
              <Grid size={12}>
                <TableContainer><Table size="small"><TableHead><TableRow><TableCell>Item</TableCell><TableCell>Qty</TableCell><TableCell>Price</TableCell><TableCell align="right">Total</TableCell><TableCell></TableCell></TableRow></TableHead>
                  <TableBody>
                    {items.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell><ItemSelect options={stockItems} value={stockItems.find(i => i.id === row.itemId) || null} onChange={(v) => updateItemRow(idx, 'itemId', typeof v === 'string' ? '' : v?.id || '')} placeholder="Item…" sx={{ minWidth: 200 }} /></TableCell>
                        <TableCell><TextField type="number" size="small" value={row.qty} onChange={(e) => { const n = parseFloat(e.target.value); updateItemRow(idx, 'qty', isNaN(n) ? 0 : Math.round(n * 1000) / 1000); }} inputProps={{ min: 0 }} sx={{ width: 70 }} /></TableCell>
                        <TableCell><TextField type="number" size="small" value={row.price} onChange={(e) => updateItemRow(idx, 'price', parseFloat(e.target.value) || 0)} sx={{ width: 90 }} /></TableCell>
                        <TableCell align="right">₹{row.total?.toFixed(2)}</TableCell>
                        <TableCell><IconButton size="small" onClick={() => removeItemRow(idx)}><Trash2 size={14} /></IconButton></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table></TableContainer>
                <Button size="small" startIcon={<Plus size={14} />} onClick={addItemRow} sx={{ mt: 1 }}>Add line</Button>
              </Grid>
              <Grid size={12} sx={{ textAlign: 'right' }}>
                <Box sx={{ mt: 2 }}><Button variant="outlined" sx={{ mr: 1 }} onClick={() => setView('list')}>Cancel</Button><Button variant="contained" onClick={handleSave} disabled={isSaving}>Save Delivery Note</Button></Box>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default DeliveryNotes;
