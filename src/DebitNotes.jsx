import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Box, Button, Card, CardContent, Typography, TextField, Grid,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, IconButton, MenuItem, Stack, Divider, alpha, useTheme,
  Backdrop, CircularProgress, Snackbar, Alert, InputAdornment,
} from '@mui/material';
import { Plus, Trash2, CornerUpLeft, FileText, AlertCircle, ScanLine } from 'lucide-react';
import { useBusiness } from './BusinessContext';
import { useConfig } from './ConfigContext';
import { useData } from './DataContext';
import { useDialog } from './DialogContext';
import { useReactToPrint } from 'react-to-print';
import InvoiceTemplate, { PAPER_SIZES } from './InvoiceTemplate';
import PartySelect from './PartySelect';
import ItemSelect from './ItemSelect';
import ItemFormDialog from './ItemFormDialog';
import BarcodeScanner from './BarcodeScanner';
import SendDialog from './SendDialog';
import TxListView from './TxListView';
import { waitForQrReady } from './qrReady';
import { captureElement, canvasToPdf } from './pdfCapture';

const PAPER_SIZE_VALUES = PAPER_SIZES.map(p => p.value);

const getThemeTokens = (theme) => {
  const primary = theme.palette.primary.main;
  return { primary, primarySoft: alpha(primary, 0.08), primaryBorder: alpha(primary, 0.18) };
};

/* ─── Barcode input row (same pattern as Sales.jsx/Estimates.jsx) ─── */
const BarcodeInputRow = ({ tokens, onScan, onOpenScanner, inputRef }) => {
  const [value, setValue] = useState('');
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
      <TextField
        inputRef={inputRef}
        size="small"
        fullWidth
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.trim()) { onScan(value.trim()); setValue(''); }
        }}
        placeholder="Scan or type barcode, press Enter…"
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <ScanLine size={14} color={tokens.primary} />
              </InputAdornment>
            ),
          },
        }}
        sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px', bgcolor: 'white' } }}
      />
      <IconButton
        onClick={onOpenScanner}
        size="small"
        title="Camera Scanner"
        sx={{ border: `1px solid ${tokens.primaryBorder}`, color: tokens.primary, borderRadius: '8px', p: '7px', '&:hover': { bgcolor: tokens.primarySoft, borderColor: tokens.primary } }}
      >
        <ScanLine size={16} />
      </IconButton>
    </Box>
  );
};

// ── Share/deliver helpers — same convention as Sales.jsx/Estimates.jsx ────
const canUseFileShare = (fileOrFiles) => {
  const files = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
  if (!navigator.canShare?.({ files })) return false;
  const isMobileUA = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  const isMobilePlatform = navigator.userAgentData?.mobile;
  return isMobilePlatform ?? isMobileUA;
};
const cleanWaPhone = (raw = '') => {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('91') && digits.length === 12) return digits;
  if (digits.length === 10) return `91${digits}`;
  return digits;
};
const canCopyFileToClipboard = (file) => {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') return false;
  if (file.type !== 'image/png') return false;
  try { return ClipboardItem.supports ? ClipboardItem.supports(file.type) : true; }
  catch { return true; }
};
const deliverFile = async (file, { toWhatsApp = false, phone = '' } = {}) => {
  if (canUseFileShare(file)) {
    await navigator.share({ files: [file], title: file.name });
    return { method: 'share' };
  }
  if (toWhatsApp && canCopyFileToClipboard(file)) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ [file.type]: file })]);
      const num = cleanWaPhone(phone);
      window.open(num ? `https://wa.me/${num}` : 'https://wa.me/', '_blank');
      return { method: 'clipboard' };
    } catch (err) {
      console.error('Clipboard copy failed, falling back to download', err);
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = file.name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  if (toWhatsApp) {
    const num = cleanWaPhone(phone);
    window.open(num ? `https://wa.me/${num}` : 'https://wa.me/', '_blank');
    return { method: 'download+chat', fileName: file.name };
  }
  return { method: 'download', fileName: file.name };
};

const buildDebitNoteMessage = ({ tx, businessName }) => {
  if (!tx) return '';
  const lines = [
    `*Debit Note from ${businessName}*`, '',
    `📄 Debit Note No: ${tx.noteNumber || '—'}`,
    `📅 Date: ${tx.date || '—'}`,
    tx.partyName ? `👤 Vendor: ${tx.partyName}` : '',
    tx.linkedInvoiceNumber ? `🔗 Against Bill: ${tx.linkedInvoiceNumber}` : '',
    '',
  ];
  if (tx.items?.length) {
    lines.push('*Items:*');
    tx.items.forEach(i => {
      const qty = Number(i.qty) || 1;
      const rate = Number(i.price) || 0;
      const unit = i.unit ? ` ${i.unit}` : '';
      const disc = Number(i.discountPercent) || 0;
      const gst = Number(i.taxRate) || 0;
      const extras = [
        disc > 0 ? `${disc}% off` : null,
        gst > 0 ? `GST ${gst}%${i.taxInclusive ? ' incl.' : ''}` : null,
      ].filter(Boolean).join(', ');
      lines.push(`  • ${i.name} × ${qty}${unit} @ ₹${rate.toFixed(2)}${extras ? ` (${extras})` : ''} = ₹${(Number(i.total) || qty * rate).toFixed(2)}`);
    });
    lines.push('');
  }
  if (tx.subtotal != null) lines.push(`Subtotal: ₹${(Number(tx.subtotal) || 0).toFixed(2)}`);
  if (Number(tx.taxAmount) > 0) lines.push(`Tax (GST): ₹${Number(tx.taxAmount).toFixed(2)}`);
  lines.push(`*Total Debit: ₹${(Number(tx.totalAmount) || 0).toFixed(2)}*`);
  if (tx.reason?.trim()) lines.push(`\n📝 Reason/Notes: ${tx.reason.trim()}`);
  lines.push('\n_Sent via BillDheko_');
  return lines.filter(l => l !== null).join('\n');
};

const BLANK_ROW = { itemId: '', name: '', qty: '', price: '', unit: '', taxRate: 0, discountPercent: '', taxInclusive: false, total: 0 };

// Debit Note: issued BY business TO vendor (supplier)
// Use cases: you return purchased goods, vendor overcharged you, quality issues with received goods
const DebitNotes = () => {
  const theme = useTheme();
  const tokens = useMemo(() => getThemeTokens(theme), [theme]);
  const { currentBusiness } = useBusiness();
  const { config, saveConfig } = useConfig();
  const { addItem, updateItem, deleteItem, getItems } = useData();
  const { confirm, showAlert } = useDialog();

  const [view, setView] = useState('list');
  const [editId, setEditId] = useState(null);
  const [snack, setSnack] = useState({ open: false, msg: '' });
  const [selectedParty, setSelectedParty] = useState(null);
  const [linkedInvoice, setLinkedInvoice] = useState(null);
  const [noteDate, setNoteDate] = useState(new Date().toISOString().split('T')[0]);
  const [noteNumber, setNoteNumber] = useState('');
  const [reason, setReason] = useState('');
  const [noteItems, setNoteItems] = useState([{ ...BLANK_ROW, qty: 1 }]);
  const [noGST, setNoGST] = useState(false);
  const [printingTx, setPrintingTx] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [paperSize, setPaperSize] = useState(() => {
    const d = config.billPrintOptions?._paperSize || config.defaultPaperSize;
    return PAPER_SIZE_VALUES.includes(d) ? d : 'A4';
  });
  useEffect(() => {
    const d = config.billPrintOptions?._paperSize || config.defaultPaperSize;
    if (PAPER_SIZE_VALUES.includes(d)) setPaperSize(d);
  }, [config.billPrintOptions?._paperSize, config.defaultPaperSize]);
  const [isPrinting, setIsPrinting] = useState(false);
  const printRef = useRef();
  const pdfRef = useRef();

  // ── Item entry UX: barcode scan, item quick-add, unit column ────────────
  const barcodeScanEnabled = !!config.features?.barcode;
  const showUnitColumn = config.features?.unitColumn !== false;
  const itemUnitOptions = config.itemUnits?.length ? config.itemUnits : ['BAG', 'BOX', 'KGS', 'LTR', 'MTR', 'NOS', 'PCS'];
  const [scannerOpen, setScannerOpen] = useState(false);
  const barcodeInputRef = useRef(null);
  const [itemDialog, setItemDialog] = useState({ open: false, name: '' });
  const itemDialogCallbackRef = useRef(null);

  // ── Share/print/download state ───────────────────────────────────────────
  const [sendOpen, setSendOpen] = useState(false);
  const [sendTx, setSendTx] = useState(null);
  const [sendParty, setSendParty] = useState(null);
  const [previewTx, setPreviewTx] = useState(null);
  const [shareLoading, setShareLoading] = useState(false);
  const _shareInFlight = useRef(false);
  const _shareCancelledRef = useRef(false);

  useEffect(() => () => { _shareCancelledRef.current = true; setShareLoading(false); }, []);

  const getPaperPageStyle = (ps) => {
    if (ps === 'Thermal 80mm') return '@page { size: 80mm auto; margin: 0; } body { margin: 0; }';
    if (ps === 'Thermal 58mm') return '@page { size: 58mm auto; margin: 0; } body { margin: 0; }';
    if (ps === 'Dot Matrix') return '@page { size: 240mm auto; margin: 6mm; } body { margin: 0; }';
    if (ps === 'A3') return '@page { size: A3 portrait; margin: 14mm; } body { margin: 0; }';
    if (ps === 'A5') return '@page { size: A5 portrait; margin: 10mm; } body { margin: 0; }';
    if (ps === 'A6') return '@page { size: A6 portrait; margin: 6mm; } body { margin: 0; }';
    if (ps === 'Letter') return '@page { size: Letter portrait; margin: 12mm; } body { margin: 0; }';
    if (ps === 'Legal') return '@page { size: Legal portrait; margin: 12mm; } body { margin: 0; }';
    if (ps === 'Executive') return '@page { size: 184mm 267mm portrait; margin: 12mm; } body { margin: 0; }';
    if (ps === 'Statement') return '@page { size: 140mm 216mm portrait; margin: 10mm; } body { margin: 0; }';
    return '@page { size: A4 portrait; margin: 10mm; } body { margin: 0; }';
  };
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    pageStyle: getPaperPageStyle(paperSize),
    // Returned promise is awaited by react-to-print before it snapshots the
    // DOM — waiting on the payment QR canvas here closes an async
    // draw-vs-print race (see qrReady.js) that could otherwise print the QR
    // blank on a cold first print.
    onBeforePrint: async () => { setIsPrinting(true); await waitForQrReady(); },
    onAfterPrint: () => setIsPrinting(false),
  });

  const vendors = getItems('parties').filter(p => p.businessId === currentBusiness?.id && p.type === 'Vendor');
  const stockItems = getItems('items').filter(i => i.businessId === currentBusiness?.id);
  const allPurchases = getItems('purchases').filter(p => p.businessId === currentBusiness?.id);
  const debitNotes = getItems('debitNotes').filter(d => d.businessId === currentBusiness?.id).reverse();

  const vendorPurchases = selectedParty ? allPurchases.filter(p => p.partyId === selectedParty.id) : [];

  const generateNoteNumber = () => {
    const numCfg = config.invoiceNumberConfig || {};
    const prefix = numCfg.debitNotePrefix || 'DBN';
    const startNum = numCfg.debitNoteStartingNumber || 1;
    const counterOverride = numCfg.debitNoteCounterOverride;
    if (counterOverride != null) {
      saveConfig({ ...config, invoiceNumberConfig: { ...numCfg, debitNoteCounterOverride: null } });
      return `${prefix}-${String(counterOverride).padStart(4, '0')}`;
    }
    const existing = getItems('debitNotes').filter(
      r => r.businessId === currentBusiness?.id && r.noteNumber?.startsWith(prefix + '-')
    );
    let maxSerial = startNum - 1;
    existing.forEach(r => {
      const parts = r.noteNumber.split('-');
      const serial = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(serial) && serial > maxSerial) maxSerial = serial;
    });
    return `${prefix}-${String(maxSerial + 1).padStart(4, '0')}`;
  };

  const resetForm = () => {
    setNoteNumber(generateNoteNumber());
    setNoteItems([{ ...BLANK_ROW, qty: 1 }]);
    setSelectedParty(null);
    setLinkedInvoice(null);
    setNoteDate(new Date().toISOString().split('T')[0]);
    setReason('');
    setEditId(null);
    setNoGST(false);
  };

  const openingForEditRef = useRef(false);
  useEffect(() => {
    if (view === 'create' && !isSaving) {
      // handleEdit() also switches view to 'create' (same form is reused for
      // add/edit) — skip resetForm() in that case, otherwise this effect
      // fires right after handleEdit populates the form and wipes it.
      if (openingForEditRef.current) { openingForEditRef.current = false; return; }
      resetForm();
    }
  }, [view]); // eslint-disable-line

  const loadFromInvoice = (inv) => {
    setLinkedInvoice(inv);
    if (inv?.items?.length) {
      setNoteItems(inv.items.map(i => {
        const taxInclusive = !!i.taxInclusive;
        const disc = Number(i.discountPercent) || 0;
        const total = taxInclusive
          ? i.qty * i.price * (1 - disc / 100)
          : i.qty * i.price * (1 - disc / 100) * (1 + (i.taxRate || 0) / 100);
        return { ...i, discountPercent: i.discountPercent ?? '', total };
      }));
    }
    setNoGST(!!inv?.noGST);
  };

  const addItemRow = () => setNoteItems([...noteItems, { ...BLANK_ROW, qty: 1 }]);
  const removeItemRow = (index) => {
    const next = noteItems.filter((_, i) => i !== index);
    setNoteItems(next.length ? next : [{ ...BLANK_ROW, qty: 1 }]);
  };
  const updateItemRow = (index, field, value) => {
    const newItems = [...noteItems];
    const item = { ...newItems[index], [field]: value };
    if (field === 'itemId') {
      const sel = stockItems.find(i => i.id === value);
      if (sel) {
        item.name = sel.name;
        item.price = Number(sel.purchasePrice ?? sel.salePrice ?? sel.price) || '';
        item.taxRate = Number(sel.taxRate) || 0;
        item.taxInclusive = !!sel.taxInclusive;
        item.unit = sel.unit || item.unit || '';
        item.hsnCode = sel.hsnCode || '';
        item.discountPercent = '';
      }
    }
    const qty = Number(item.qty) || 0;
    const price = Number(item.price) || 0;
    const discountPercent = Number(item.discountPercent) || 0;
    const taxRate = Number(item.taxRate) || 0;
    item.total = item.taxInclusive
      ? qty * price * (1 - discountPercent / 100)
      : qty * price * (1 - discountPercent / 100) * (1 + taxRate / 100);
    newItems[index] = item;
    setNoteItems(newItems);
  };

  // ── Item quick-add-new dialog ────────────────────────────────────────────
  const openQuickAddItem = (inputValue, callback) => {
    itemDialogCallbackRef.current = callback;
    setItemDialog({ open: true, name: inputValue || '' });
  };
  // index === -1 appends a new row instead of overwriting an existing one
  // (used by the barcode scanner when every current row is already filled).
  const applyItemToRow = (index, selected) => {
    setNoteItems(prev => {
      const newItems = [...prev];
      const targetIndex = index === -1 ? newItems.length : index;
      let item = { ...(newItems[targetIndex] || BLANK_ROW) };
      item.itemId = selected.id;
      item.name = selected.name || '';
      item.price = Number(selected.purchasePrice ?? selected.salePrice ?? selected.price) || '';
      item.taxRate = Number(selected.taxRate) || 0;
      item.taxInclusive = !!selected.taxInclusive;
      item.unit = selected.unit || item.unit || '';
      item.hsnCode = selected.hsnCode || '';
      item.discountPercent = '';
      if (item.qty === '' || item.qty == null) item.qty = 1;
      const qty = Number(item.qty) || 0;
      const price = Number(item.price) || 0;
      const disc = Number(item.discountPercent) || 0;
      const tax = Number(item.taxRate) || 0;
      item.total = item.taxInclusive
        ? qty * price * (1 - disc / 100)
        : qty * price * (1 - disc / 100) * (1 + tax / 100);
      newItems[targetIndex] = item;
      if (index !== -1 && targetIndex === newItems.length - 1) newItems.push({ ...BLANK_ROW });
      return newItems;
    });
  };

  // ── Barcode scan-to-add ──────────────────────────────────────────────────
  const handleBarcodeScan = (barcode) => {
    if (view !== 'create') setView('create');
    const foundItem = stockItems.find(
      (i) => i.barcode === barcode || i.itemCode === barcode || String(i.id) === barcode,
    );
    if (!foundItem) { setSnack({ open: true, msg: `No item found for barcode: ${barcode}` }); return; }
    const existingIdx = noteItems.findIndex((i) => String(i.itemId) === String(foundItem.id));
    if (existingIdx >= 0) {
      setNoteItems((prev) => {
        const updated = [...prev];
        const existing = updated[existingIdx];
        const newQty = (Number(existing.qty) || 0) + 1;
        const p = Number(existing.price) || 0;
        const disc = Number(existing.discountPercent) || 0;
        const gst = Number(existing.taxRate) || 0;
        const newTotal = existing.taxInclusive
          ? newQty * p * (1 - disc / 100)
          : newQty * p * (1 - disc / 100) * (1 + gst / 100);
        updated[existingIdx] = { ...existing, qty: newQty, total: newTotal };
        return updated;
      });
      setSnack({ open: true, msg: `${foundItem.name} qty updated` });
      return;
    }
    const emptyIdx = noteItems.findIndex((i) => !i.itemId);
    if (emptyIdx >= 0) applyItemToRow(emptyIdx, foundItem);
    else applyItemToRow(-1, foundItem);
    setSnack({ open: true, msg: `Added: ${foundItem.name}` });
  };
  const handleBarcodeScanRef = useRef(handleBarcodeScan);
  useEffect(() => { handleBarcodeScanRef.current = handleBarcodeScan; }, [handleBarcodeScan]);
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);

  useEffect(() => {
    let buf = [];
    const onKey = (e) => {
      if (viewRef.current !== 'create') return;
      if (document.querySelector('.MuiDialog-root')) return;
      if (document.activeElement === barcodeInputRef.current) return;
      if (e.key === 'Enter') {
        if (buf.length >= 3) {
          let allFast = true;
          for (let i = 1; i < buf.length; i++) {
            if (buf[i].time - buf[i - 1].time >= 50) { allFast = false; break; }
          }
          if (allFast) {
            e.preventDefault();
            const code = buf.map(b => b.char).join('').trim();
            buf = [];
            handleBarcodeScanRef.current(code);
            return;
          }
        }
        buf = [];
        return;
      }
      if (e.key.length !== 1) return;
      buf.push({ char: e.key, time: Date.now() });
      if (buf.length > 1 && buf[buf.length - 1].time - buf[buf.length - 2].time > 500) {
        buf = [buf[buf.length - 1]];
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  const getBasePrice = (item) => {
    const price = Number(item.price) || 0;
    const taxRate = Number(item.taxRate) || 0;
    return item.taxInclusive ? price / (1 + taxRate / 100) : price;
  };
  const subtotal = noteItems.reduce((s, i) => {
    const qty = Number(i.qty) || 0;
    const disc = Number(i.discountPercent) || 0;
    return s + qty * getBasePrice(i) * (1 - disc / 100);
  }, 0);
  const tax = noGST ? 0 : noteItems.reduce((s, i) => {
    const qty = Number(i.qty) || 0;
    const disc = Number(i.discountPercent) || 0;
    const taxRate = Number(i.taxRate) || 0;
    return s + qty * getBasePrice(i) * (1 - disc / 100) * (taxRate / 100);
  }, 0);
  const total = subtotal + tax;

  const handleSave = async () => {
    if (!currentBusiness?.id || !selectedParty?.id || !noteNumber?.trim() || !noteDate) {
      await showAlert({ title: 'Missing fields', message: 'Please fill in the vendor, debit note number and date.', variant: 'warning' });
      return;
    }
    const cleaned = noteItems.filter(i => i.itemId && Number(i.qty) > 0 && Number(i.price) >= 0).map(i => ({
      ...i,
      price: Number(i.price) || 0,
      discountPercent: Number(i.discountPercent) || 0,
      taxRate: noGST ? 0 : (Number(i.taxRate) || 0),
    }));
    if (!cleaned.length) { await showAlert({ title: 'No items', message: 'Add at least one item with a valid quantity and price.', variant: 'warning' }); return; }
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
      const saved = editId
        ? await updateItem('debitNotes', editId, payload)
        : await addItem('debitNotes', payload);
      if (!saved) {
        await showAlert({ title: 'Save failed', message: 'Failed to save debit note. Please check you are signed in and try again.', variant: 'danger' });
        setIsSaving(false);
        return;
      }
      setSnack({ open: true, msg: editId ? 'Debit note updated' : 'Debit note saved' });
      setView('list');
    } catch (e) {
      await showAlert({ title: 'Save failed', message: 'Save failed: ' + (e?.message || e), variant: 'danger' });
    }
    setIsSaving(false);
  };

  const handleEdit = (dn) => {
    openingForEditRef.current = true;
    setEditId(dn.id);
    setSelectedParty(vendors.find(p => p.id === dn.partyId) || null);
    setNoteDate(dn.date || '');
    setNoteNumber(dn.noteNumber || '');
    setNoteItems(dn.items?.length ? dn.items.map(i => {
      const taxInclusive = !!i.taxInclusive;
      const disc = Number(i.discountPercent) || 0;
      const total = taxInclusive
        ? i.qty * i.price * (1 - disc / 100)
        : i.qty * i.price * (1 - disc / 100) * (1 + (i.taxRate || 0) / 100);
      return { ...i, discountPercent: i.discountPercent ?? '', total };
    }) : [{ ...BLANK_ROW, qty: 1 }]);
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

  // ── Share / PDF / Image ──────────────────────────────────────────────────
  const ensurePreviewTarget = async (tx) => {
    if (!tx) return;
    if (previewTx?.id === tx.id) return;
    setPreviewTx(tx);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  };
  const waitForCaptureReady = async (el) => {
    if (document.fonts?.ready) { try { await document.fonts.ready; } catch { /* ignore */ } }
    const imgs = Array.from(el.querySelectorAll('img'));
    await Promise.all(imgs.map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      if (typeof img.decode === 'function') return img.decode().catch(() => {});
      return new Promise((resolve) => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      });
    }));
    // <img> readiness above doesn't cover the payment QR — it's drawn onto a
    // <canvas> asynchronously (see qrReady.js), which html2canvas snapshots
    // synchronously just like react-to-print does.
    await waitForQrReady();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  };
  const captureInvoiceCanvas = async () => {
    await waitForCaptureReady(pdfRef.current);
    return captureElement(pdfRef.current, { scale: 1.5 });
  };
  const showDeliverResult = (result) => {
    if (result.method === 'clipboard') setSnack({ open: true, msg: 'Copied — paste it into the WhatsApp chat' });
    else if (result.method === 'download+chat') setSnack({ open: true, msg: `Downloaded ${result.fileName} — attach it in the chat` });
    else if (result.method === 'download') setSnack({ open: true, msg: `Downloaded ${result.fileName}` });
  };

  const shareAsPDF = async (tx, opts = {}) => {
    if (_shareInFlight.current) return;
    const target = tx || previewTx;
    if (!target) return;
    _shareInFlight.current = true;
    _shareCancelledRef.current = false;
    setShareLoading(true);
    try {
      await ensurePreviewTarget(target);
      if (_shareCancelledRef.current || !pdfRef.current) return;
      const [canvas, { jsPDF }] = await Promise.all([captureInvoiceCanvas(), import('jspdf').then(m => ({ jsPDF: m.jsPDF }))]);
      if (_shareCancelledRef.current) return;
      const pdf = canvasToPdf(canvas, jsPDF, paperSize);
      if (_shareCancelledRef.current) return;
      const fileName = `${target.noteNumber || 'debit-note'}.pdf`;
      const pdfBlob = pdf.output('blob');
      const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
      const result = await deliverFile(file, opts);
      showDeliverResult(result);
    } catch (err) {
      if (err?.name !== 'AbortError') { console.error('Share as PDF failed', err); await showAlert({ title: 'Could not share PDF', message: 'Please try again.', variant: 'danger' }); }
    } finally { setShareLoading(false); _shareInFlight.current = false; }
  };

  const shareAsImage = async (tx, opts = {}) => {
    if (_shareInFlight.current) return;
    const target = tx || previewTx;
    if (!target) return;
    _shareInFlight.current = true;
    _shareCancelledRef.current = false;
    setShareLoading(true);
    try {
      await ensurePreviewTarget(target);
      if (_shareCancelledRef.current || !pdfRef.current) return;
      const canvas = await captureInvoiceCanvas();
      if (_shareCancelledRef.current) return;
      await new Promise((resolve, reject) => {
        canvas.toBlob(async (blob) => {
          if (!blob) { reject(new Error('No blob')); return; }
          if (_shareCancelledRef.current) { resolve(); return; }
          const fileName = `${target.noteNumber || 'debit-note'}.png`;
          const file = new File([blob], fileName, { type: 'image/png' });
          const result = await deliverFile(file, opts);
          showDeliverResult(result);
          resolve();
        }, 'image/png');
      });
    } catch (err) {
      if (err?.name !== 'AbortError') { console.error('Share as Image failed', err); await showAlert({ title: 'Could not share image', message: 'Please try again.', variant: 'danger' }); }
    } finally { setShareLoading(false); _shareInFlight.current = false; }
  };

  const openSendDialog = (dn) => {
    const tx = { ...dn, invoiceNumber: dn.noteNumber };
    const party = vendors.find(p => p.id === dn.partyId) || null;
    setSendTx(tx);
    setSendParty(party);
    setSendOpen(true);
    import('html2canvas');
    import('jspdf');
  };

  return (
    <Box>
      <Backdrop open={isPrinting || shareLoading} sx={{ zIndex: 9999, flexDirection: 'column', gap: 2, bgcolor: 'rgba(0,0,0,0.55)' }}>
        <CircularProgress size={48} sx={{ color: 'white' }} />
        <Typography sx={{ color: 'white', fontWeight: 700 }}>{shareLoading ? 'Preparing to share…' : 'Preparing to print…'}</Typography>
      </Backdrop>
      <Box sx={{ position: 'absolute', left: -9999 }}>
        <InvoiceTemplate ref={printRef} transaction={printingTx} business={currentBusiness} paperSize={paperSize} title="Debit Note" />
      </Box>
      <Box sx={{ position: 'fixed', left: -9999, top: 0, opacity: 0, pointerEvents: 'none', zIndex: -1 }}>
        <InvoiceTemplate ref={pdfRef} transaction={previewTx} business={currentBusiness} paperSize={paperSize} title="Debit Note" />
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1.5 }}>
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
          onShare={(r) => openSendDialog(r)}
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
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  select fullWidth size="small" label="Paper Size" value={paperSize}
                  onChange={(e) => setPaperSize(e.target.value)}
                >
                  {PAPER_SIZES.map((ps) => <MenuItem key={ps.value} value={ps.value}>{ps.value}</MenuItem>)}
                </TextField>
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
                {barcodeScanEnabled && (
                  <BarcodeInputRow
                    tokens={tokens}
                    onScan={handleBarcodeScan}
                    onOpenScanner={() => setScannerOpen(true)}
                    inputRef={barcodeInputRef}
                  />
                )}
                <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflowX: 'auto' }}>
                  <Table size="small" sx={{ minWidth: 760 }}>
                    <TableHead sx={{ bgcolor: 'rgba(0,0,0,0.02)' }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>Item</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', width: 70 }}>Qty</TableCell>
                        {showUnitColumn && <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', width: 90 }}>Unit</TableCell>}
                        <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', width: 90 }}>Price</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', width: 84 }}>Disc %</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', width: 110 }}>Tax %</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', width: 100 }}>Total</TableCell>
                        <TableCell sx={{ width: 40 }} />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {noteItems.map((row, idx) => (
                        <TableRow key={idx}>
                          <TableCell sx={{ minWidth: 180 }}>
                            <ItemSelect
                              options={stockItems}
                              value={row.itemId ? (stockItems.find(i => i.id === row.itemId) || { id: row.itemId, name: row.name || '' }) : (row.name || null)}
                              onChange={(v) => {
                                if (typeof v === 'string') {
                                  const match = stockItems.find(i => i.name?.toLowerCase() === v.trim().toLowerCase());
                                  if (match) applyItemToRow(idx, match);
                                  else updateItemRow(idx, 'itemId', '');
                                  return;
                                }
                                if (v && v.id) applyItemToRow(idx, v);
                              }}
                              onInputChange={(val) => {
                                if (!row.itemId) {
                                  const newItems = [...noteItems];
                                  newItems[idx] = { ...newItems[idx], name: val };
                                  setNoteItems(newItems);
                                }
                              }}
                              onAddNew={(inputValue) => openQuickAddItem(inputValue, (newItem) => applyItemToRow(idx, newItem))}
                              isSale={false}
                              placeholder="Item…"
                              sx={{ minWidth: 180 }}
                            />
                          </TableCell>
                          <TableCell>
                            <TextField type="number" size="small" value={row.qty}
                              onChange={(e) => { const v = e.target.value; if (v === '') { updateItemRow(idx, 'qty', ''); return; } const n = parseFloat(v); updateItemRow(idx, 'qty', isNaN(n) ? '' : Math.round(n * 1000) / 1000); }}
                              onFocus={(e) => e.target.select()}
                              inputProps={{ min: 0, style: { textAlign: 'center' } }} sx={{ width: 72 }} />
                          </TableCell>
                          {showUnitColumn && (
                            <TableCell align="center">
                              <TextField select size="small" value={row.unit || ''}
                                onChange={(e) => updateItemRow(idx, 'unit', e.target.value)}
                                SelectProps={{ displayEmpty: true }} sx={{ width: 82 }}>
                                <MenuItem value=""><em style={{ opacity: 0.5 }}>—</em></MenuItem>
                                {itemUnitOptions.map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>)}
                              </TextField>
                            </TableCell>
                          )}
                          <TableCell>
                            <TextField type="number" size="small" value={row.price}
                              onChange={(e) => updateItemRow(idx, 'price', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                              onFocus={(e) => e.target.select()}
                              inputProps={{ style: { textAlign: 'center' } }} sx={{ width: 92 }} />
                          </TableCell>
                          <TableCell>
                            <TextField type="number" size="small" value={row.discountPercent ?? ''}
                              placeholder="0"
                              onChange={(e) => updateItemRow(idx, 'discountPercent', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                              onFocus={(e) => e.target.select()}
                              inputProps={{ min: 0, max: 100, step: 0.5, style: { textAlign: 'center' } }} sx={{ width: 76 }} />
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                              <TextField type="number" size="small" value={row.taxRate}
                                onChange={(e) => updateItemRow(idx, 'taxRate', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                                onFocus={(e) => e.target.select()}
                                disabled={noGST} inputProps={{ min: 0, max: 100, step: 0.5, style: { textAlign: 'center' } }} sx={{ width: 62 }} />
                              {!noGST && Number(row.taxRate) > 0 && (
                                <Box sx={{ display: 'flex', border: '1px solid', borderColor: 'divider', borderRadius: '100px', overflow: 'hidden', fontSize: '0.6rem' }}>
                                  {['Excl', 'Incl'].map((label) => {
                                    const isIncl = label === 'Incl';
                                    const active = isIncl ? !!row.taxInclusive : !row.taxInclusive;
                                    return (
                                      <Box
                                        key={label}
                                        onClick={() => updateItemRow(idx, 'taxInclusive', isIncl)}
                                        sx={{
                                          px: 0.9, py: 0.25, cursor: 'pointer', fontWeight: 700, fontSize: '0.6rem',
                                          bgcolor: active ? tokens.primary : 'transparent',
                                          color: active ? '#fff' : 'text.secondary',
                                          transition: 'all 0.15s', userSelect: 'none',
                                        }}
                                      >
                                        {label}
                                      </Box>
                                    );
                                  })}
                                </Box>
                              )}
                            </Box>
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

      {barcodeScanEnabled && (
        <BarcodeScanner open={scannerOpen} onScan={handleBarcodeScan} onClose={() => setScannerOpen(false)} />
      )}

      <ItemFormDialog
        open={itemDialog.open}
        initialName={itemDialog.name}
        onClose={() => setItemDialog({ open: false, name: '' })}
        onSaved={(newItem) => {
          if (itemDialogCallbackRef.current) itemDialogCallbackRef.current(newItem);
          itemDialogCallbackRef.current = null;
          setItemDialog({ open: false, name: '' });
        }}
      />

      <SendDialog
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        tx={sendTx}
        party={sendParty}
        businessName={currentBusiness?.name || 'BillDheko'}
        initialMessage={buildDebitNoteMessage({ tx: sendTx, businessName: currentBusiness?.name || 'BillDheko' })}
        dialogTitle="Share Debit Note"
        onSharePDF={() => shareAsPDF(sendTx)}
        onShareImage={() => shareAsImage(sendTx)}
        onSharePDFToWhatsApp={() => shareAsPDF(sendTx, { toWhatsApp: true, phone: sendParty?.phone })}
        onShareImageToWhatsApp={() => shareAsImage(sendTx, { toWhatsApp: true, phone: sendParty?.phone })}
        shareLoading={shareLoading}
      />

      <Snackbar open={snack.open} autoHideDuration={3000} onClose={() => setSnack(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="success" onClose={() => setSnack(s => ({ ...s, open: false }))} sx={{ fontWeight: 600 }}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
};

export default DebitNotes;
