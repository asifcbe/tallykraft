import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Box, Button, Card, CardContent, Typography, TextField, Grid,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  IconButton, MenuItem, InputAdornment, Snackbar, Alert, useTheme, alpha,
  Backdrop, CircularProgress,
} from '@mui/material';
import { Plus, Trash2, FileText, ScanLine, ArrowLeft } from 'lucide-react';
import { useBusiness } from './BusinessContext';
import { useTabs } from './TabsContext';
import { reservedSerials, getDraft, reserve as reserveDraft, release as releaseDraft, subscribe as subscribeDrafts, formatInvoiceNumber, parseSerial } from './draftInvoiceNumbers';
import { dispatchQuickNew, acknowledgeQuickNew } from './quickNewBridge';

import { useConfig } from './ConfigContext';
import { useData } from './DataContext';
import { useI18n } from './i18n/I18nContext';
import { useDialog } from './DialogContext';
import { useReactToPrint } from 'react-to-print';
import InvoiceTemplate, { PAPER_SIZES } from './InvoiceTemplate';
import PartySelect from './PartySelect';
import ItemSelect from './ItemSelect';
import ItemFormDialog from './ItemFormDialog';
import PartyFormDialog from './PartyFormDialog';
import BarcodeScanner from './BarcodeScanner';
import SendDialog from './SendDialog';
import TxListView from './TxListView';
import { waitForQrReady } from './qrReady';
import { captureElement, canvasToPdf } from './pdfCapture';

const PAPER_SIZE_VALUES = PAPER_SIZES.map(p => p.value);

const getThemeTokens = (theme) => {
  const primary = theme.palette.primary.main;
  return {
    primary,
    primarySoft: alpha(primary, 0.08),
    primaryBorder: alpha(primary, 0.18),
  };
};

/* ─── Barcode input row (same pattern as Sales.jsx) ─── */
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
          if (e.key === 'Enter' && value.trim()) {
            onScan(value.trim());
            setValue('');
          }
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

// ── Share/deliver helpers — same convention as Sales.jsx ──────────────────
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

const buildEstimateMessage = ({ tx, businessName }) => {
  if (!tx) return '';
  const lines = [
    `*Estimate from ${businessName}*`, '',
    `📄 Estimate No: ${tx.estimateNumber || '—'}`,
    `📅 Date: ${tx.date || '—'}`,
    tx.partyName ? `👤 Customer: ${tx.partyName}` : '', '',
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
  lines.push(`*Total: ₹${(Number(tx.totalAmount) || 0).toFixed(2)}*`);
  if (tx.description?.trim()) lines.push(`\n📝 Notes: ${tx.description.trim()}`);
  lines.push('\n_Sent via BillDheko_');
  return lines.filter(l => l !== null).join('\n');
};

const BLANK_ROW = { itemId: '', name: '', qty: '', price: '', unit: '', taxRate: 0, discountPercent: '', taxInclusive: false, total: 0 };

const Estimates = ({ tabId }) => {
  const theme = useTheme();
  const tokens = useMemo(() => getThemeTokens(theme), [theme]);
  const { currentBusiness } = useBusiness();
  const { t } = useI18n();
  const { openTab, activeTabId, updateTab } = useTabs();
  // Estimates can be open in several tabs at once (like Sales). Each instance
  // is kept alive in the background, so global listeners below only act for
  // the tab that's actually on screen.
  const isActiveTabRef = useRef(true);
  isActiveTabRef.current = !tabId || activeTabId === tabId;
  // Owner id for this tab's reserved draft estimate number.
  const draftOwnerIdRef = useRef(null);
  if (!draftOwnerIdRef.current) draftOwnerIdRef.current = `${tabId || 'estimates'}_${Math.random().toString(36).slice(2, 9)}`;
  const draftOwnerId = draftOwnerIdRef.current;

  const { data, addItem, updateItem, deleteItem, getItems } = useData();
  const { confirm, showAlert } = useDialog();
  const { config, saveConfig } = useConfig();
  const [view, setView] = useState('list');
  const [editId, setEditId] = useState(null);
  const [snack, setSnack] = useState({ open: false, msg: '' });
  const [selectedParty, setSelectedParty] = useState(null);
  const [estimateDate, setEstimateDate] = useState(new Date().toISOString().split('T')[0]);
  const [estimateNumber, setEstimateNumber] = useState('');
  const [items, setItems] = useState([{ ...BLANK_ROW, qty: 1 }]);
  const [description, setDescription] = useState('');
  const [noGST, setNoGST] = useState(false);
  // Terms & Conditions for the printed/previewed estimate. Set once in
  // Settings → Invoice (`estimateTermsText`); falls back to the Sales terms
  // (`termsText`) when the estimate-specific one is left blank. NOT per-estimate.
  const estimateTerms = config.billPrintOptions?.estimateTermsText || config.billPrintOptions?.termsText || '';
  const [printingTx, setPrintingTx] = useState(null);
  const [paperSize, setPaperSize] = useState(() => {
    const d = config.billPrintOptions?._paperSize || config.defaultPaperSize;
    return PAPER_SIZE_VALUES.includes(d) ? d : 'A4';
  });
  useEffect(() => {
    const d = config.billPrintOptions?._paperSize || config.defaultPaperSize;
    if (PAPER_SIZE_VALUES.includes(d)) setPaperSize(d);
  }, [config.billPrintOptions?._paperSize, config.defaultPaperSize]);
  const [isSaving, setIsSaving] = useState(false);
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
  const [quickAddParty, setQuickAddParty] = useState({ open: false, name: '', phone: '' });

  // ── Share/print/download state ───────────────────────────────────────────
  const [sendOpen, setSendOpen] = useState(false);
  const [sendTx, setSendTx] = useState(null);
  const [sendParty, setSendParty] = useState(null);
  const [previewTx, setPreviewTx] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const _shareInFlight = useRef(false);
  const _shareCancelledRef = useRef(false);

  useEffect(() => () => { _shareCancelledRef.current = true; setPdfLoading(false); setShareLoading(false); }, []);

  // Receiving end of the same "From Estimate" chip Sales.jsx now shows on a
  // converted invoice — jumps straight to that estimate's preview in
  // TxListView via its openRecordId prop, mirroring Sales.jsx's own
  // onQuickNew handling for editTx.
  const [openEstimateId, setOpenEstimateId] = useState(null);
  useEffect(() => {
    const onQuickNew = (e) => {
      if (e.detail?.path !== '/estimates' || e.detail?.intent !== 'viewEstimate' || !e.detail?.estimateId) return;
      if (!isActiveTabRef.current) return;
      setOpenEstimateId(e.detail.estimateId);
      acknowledgeQuickNew(e.detail);
    };
    window.addEventListener('dashboard-quick-new', onQuickNew);
    return () => window.removeEventListener('dashboard-quick-new', onQuickNew);
  }, []);

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
  // onBeforePrint is awaited by react-to-print before it snapshots the DOM —
  // waiting on the payment QR canvas here closes an async draw-vs-print race
  // (see qrReady.js) that could otherwise print the QR blank on a cold first print.
  const handlePrint = useReactToPrint({ contentRef: printRef, pageStyle: getPaperPageStyle(paperSize), onBeforePrint: waitForQrReady });

  const parties = getItems('parties').filter(p => p.businessId === currentBusiness?.id && p.type === 'Customer');
  const stockItems = getItems('items').filter(i => i.businessId === currentBusiness?.id);
  const estimates = getItems('estimates').filter(e => e.businessId === currentBusiness?.id).reverse();

  const generateEstimateNumber = () => {
    const numCfg = config.invoiceNumberConfig || {};
    const prefix = numCfg.estimatePrefix || 'EST';
    const startNum = numCfg.estimateStartingNumber || 1;
    const counterOverride = numCfg.estimateCounterOverride;
    if (counterOverride != null) {
      saveConfig({ ...config, invoiceNumberConfig: { ...numCfg, estimateCounterOverride: null } });
      return `${prefix}-${String(counterOverride).padStart(4, '0')}`;
    }
    const existing = getItems('estimates').filter(
      r => r.businessId === currentBusiness?.id && r.estimateNumber?.startsWith(prefix + '-')
    );
    let maxSerial = startNum - 1;
    existing.forEach(r => {
      const parts = r.estimateNumber.split('-');
      const serial = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(serial) && serial > maxSerial) maxSerial = serial;
    });
    // Skip numbers another open Estimates tab is showing as its draft, and
    // reserve this tab's own so the next tab picks a different one.
    const scope = draftScope();
    reservedSerials(scope, prefix, draftOwnerId).forEach((sv) => { if (sv > maxSerial) maxSerial = sv; });
    reserveDraft(draftOwnerId, scope, prefix, maxSerial + 1);
    return formatInvoiceNumber(prefix, maxSerial + 1);
  };

  // ── Draft estimate-number reservation (multi-tab uniqueness) ──────────────
  const draftScope = () => `${currentBusiness?.id || ''}|estimates`;
  const savedSerialSet = (prefix) => {
    const set = new Set();
    getItems('estimates').forEach((r) => {
      if (r.businessId !== currentBusiness?.id) return;
      const sv = parseSerial(r.estimateNumber, prefix);
      if (sv != null) set.add(sv);
    });
    return set;
  };
  // repack = draft abandoned (cancel / close tab): free its number and let the
  // other open drafts move down into the gap. Not repacked after a save.
  const releaseMyDraft = (repack) => {
    const d = getDraft(draftOwnerId);
    if (!d) return;
    const saved = repack ? savedSerialSet(d.prefix) : null;
    releaseDraft(draftOwnerId, { repack, isSavedSerial: (sv) => !!saved?.has(sv) });
  };
  const releaseMyDraftRef = useRef(releaseMyDraft);
  releaseMyDraftRef.current = releaseMyDraft;
  // Another tab's draft was abandoned and ours was re-numbered → show it.
  useEffect(() => subscribeDrafts((changed) => {
    if (!changed.has(draftOwnerId)) return;
    const d = getDraft(draftOwnerId);
    if (d) setEstimateNumber(formatInvoiceNumber(d.prefix, d.serial));
  }), [draftOwnerId]);
  // Closing the tab abandons any unsaved draft.
  useEffect(() => () => releaseMyDraftRef.current(true), []);
  const backToList = () => { if (!editId) releaseMyDraft(true); setView('list'); };

  const openingForEditRef = useRef(false);
  const resetForm = () => {
    setEstimateNumber(generateEstimateNumber());
    setItems([{ ...BLANK_ROW, qty: 1 }]);
    setSelectedParty(null);
    setEstimateDate(new Date().toISOString().split('T')[0]);
    setDescription('');
    setNoGST(false);
    setEditId(null);
  };
  const openNewEstimate = () => {
    openingForEditRef.current = false;
    resetForm();
    setView('create');
  };
  useEffect(() => {
    if (view === 'create' && !isSaving) {
      // handleEdit() also switches view to 'create' (same form is reused for
      // add/edit) — skip the blank-slate reset in that case, otherwise this
      // effect fires right after handleEdit populates the form and wipes the
      // party/items it just set.
      if (openingForEditRef.current) { openingForEditRef.current = false; return; }
      resetForm();
    }
  }, [view, isSaving]); // eslint-disable-line

  // Tab label follows the open estimate (customer, else number), like Sales.
  useEffect(() => {
    if (!tabId) return;
    let label = 'Estimates';
    if (view === 'create') {
      label = selectedParty?.name
        || (estimateNumber ? (editId ? `Edit ${estimateNumber}` : estimateNumber) : (editId ? 'Edit Estimate' : 'New Estimate'));
    }
    updateTab(tabId, { label });
  }, [tabId, view, selectedParty, estimateNumber, editId, updateTab]);

  const addItemRow = () => setItems([...items, { ...BLANK_ROW, qty: 1 }]);
  const removeItemRow = (index) => {
    const next = items.filter((_, i) => i !== index);
    setItems(next.length ? next : [{ ...BLANK_ROW, qty: 1 }]);
  };
  const updateItemRow = (index, field, value) => {
    const newItems = [...items];
    const item = { ...newItems[index], [field]: value };
    if (field === 'itemId') {
      const sel = stockItems.find(i => i.id === value);
      if (sel) {
        item.name = sel.name;
        item.price = Number(sel.salePrice ?? sel.price) || '';
        item.taxRate = Number(sel.taxRate) || 0;
        item.taxInclusive = !!sel.taxInclusive;
        item.unit = sel.unit || item.unit || '';
        item.hsnCode = sel.hsnCode || '';
        item.discountPercent = Number(sel.discount) ? Number(sel.discount) : '';
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
    setItems(newItems);
  };

  // ── Item quick-add-new dialog ────────────────────────────────────────────
  const openQuickAddItem = (inputValue, callback) => {
    itemDialogCallbackRef.current = callback;
    setItemDialog({ open: true, name: inputValue || '' });
  };
  // index === -1 appends a new row instead of overwriting an existing one
  // (used by the barcode scanner when every current row is already filled).
  const applyItemToRow = (index, selected) => {
    setItems(prev => {
      const newItems = [...prev];
      const targetIndex = index === -1 ? newItems.length : index;
      let item = { ...(newItems[targetIndex] || BLANK_ROW) };
      item.itemId = selected.id;
      item.name = selected.name || '';
      item.price = Number(selected.salePrice ?? selected.price) || '';
      item.taxRate = Number(selected.taxRate) || 0;
      item.taxInclusive = !!selected.taxInclusive;
      item.unit = selected.unit || item.unit || '';
      item.hsnCode = selected.hsnCode || '';
      item.discountPercent = Number(selected.discount) ? Number(selected.discount) : '';
      if (item.qty === '' || item.qty == null) item.qty = 1;
      const qty = Number(item.qty) || 0;
      const price = Number(item.price) || 0;
      const disc = Number(item.discountPercent) || 0;
      const tax = Number(item.taxRate) || 0;
      item.total = item.taxInclusive
        ? qty * price * (1 - disc / 100)
        : qty * price * (1 - disc / 100) * (1 + tax / 100);
      newItems[targetIndex] = item;
      // Auto-append a fresh blank row when the row just filled was the last
      // one, so the user can keep entering items without clicking "Add
      // line" every time. Only applies to the manual ItemSelect path
      // (index !== -1) — the barcode scanner already manages its own row
      // targeting and appending explicitly, see handleBarcodeScan.
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
    if (!foundItem) {
      setSnack({ open: true, msg: `No item found for barcode: ${barcode}` });
      return;
    }
    const existingIdx = items.findIndex((i) => String(i.itemId) === String(foundItem.id));
    if (existingIdx >= 0) {
      setItems((prev) => {
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
    const emptyIdx = items.findIndex((i) => !i.itemId);
    if (emptyIdx >= 0) {
      applyItemToRow(emptyIdx, foundItem);
    } else {
      // -1 tells applyItemToRow to append rather than target a (possibly
      // stale) index — avoids a race against items.length captured in this
      // closure before the row-append setItems call above resolves.
      applyItemToRow(-1, foundItem);
    }
    setSnack({ open: true, msg: `Added: ${foundItem.name}` });
  };
  const handleBarcodeScanRef = useRef(handleBarcodeScan);
  useEffect(() => { handleBarcodeScanRef.current = handleBarcodeScan; }, [handleBarcodeScan]);
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);

  // Global hardware barcode/QR scanner listener — same buffering strategy as
  // Sales.jsx/POS.jsx: buffer chars with timestamps, confirm on Enter if
  // every inter-key gap was <50ms (fast enough to only be a hardware
  // scanner's keystroke burst, not a human typing).
  useEffect(() => {
    let buf = [];
    const onKey = (e) => {
      if (!isActiveTabRef.current) return;
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
  const subtotal = items.reduce((s, i) => {
    const qty = Number(i.qty) || 0;
    const disc = Number(i.discountPercent) || 0;
    return s + qty * getBasePrice(i) * (1 - disc / 100);
  }, 0);
  const tax = noGST ? 0 : items.reduce((s, i) => {
    const qty = Number(i.qty) || 0;
    const disc = Number(i.discountPercent) || 0;
    const taxRate = Number(i.taxRate) || 0;
    return s + qty * getBasePrice(i) * (1 - disc / 100) * (taxRate / 100);
  }, 0);
  const total = subtotal + tax;

  const handleSave = async () => {
    if (!currentBusiness?.id || !selectedParty?.id || !estimateNumber?.trim() || !estimateDate) {
      await showAlert({ title: 'Missing fields', message: 'Please fill in the party, estimate number and date.', variant: 'warning' });
      return;
    }
    const cleaned = items.filter(i => i.itemId && Number(i.qty) > 0 && Number(i.price) >= 0).map(i => ({
      ...i,
      price: Number(i.price) || 0,
      discountPercent: Number(i.discountPercent) || 0,
      taxRate: noGST ? 0 : (Number(i.taxRate) || 0),
    }));
    if (!cleaned.length) {
      await showAlert({ title: 'No items', message: 'Add at least one item with a valid quantity and price.', variant: 'warning' });
      return;
    }
    if (total <= 0) {
      await showAlert({ title: 'Invalid total', message: 'Total must be greater than zero.', variant: 'warning' });
      return;
    }
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
        date: estimateDate,
        estimateNumber: estimateNumber.trim(),
        items: cleaned,
        description: description || '',
        noGST,
        subtotal,
        taxAmount: tax,
        totalAmount: total,
      };
      const saved = editId
        ? await updateItem('estimates', editId, payload)
        : await addItem('estimates', payload);
      if (!saved) {
        await showAlert({ title: 'Save failed', message: 'Failed to save estimate. Please check you are signed in and try again.', variant: 'danger' });
        setIsSaving(false);
        return;
      }
      setSnack({ open: true, msg: editId ? 'Estimate updated' : 'Estimate saved' });
      if (!editId) releaseMyDraft(false);
      setView('list');
    } catch (e) {
      await showAlert({ title: 'Save failed', message: 'Save failed: ' + (e?.message || e), variant: 'danger' });
    }
    setIsSaving(false);
  };

  const handleEdit = (est) => {
    releaseMyDraft(true); // editing an existing number — give up any draft
    openingForEditRef.current = true;
    setEditId(est.id);
    setSelectedParty(parties.find(p => p.id === est.partyId) || null);
    setEstimateDate(est.date || '');
    setEstimateNumber(est.estimateNumber || '');
    setItems(est.items?.length ? est.items.map(i => {
      const taxInclusive = !!i.taxInclusive;
      const disc = Number(i.discountPercent) || 0;
      const total = taxInclusive
        ? i.qty * i.price * (1 - disc / 100)
        : i.qty * i.price * (1 - disc / 100) * (1 + (i.taxRate || 0) / 100);
      return { ...i, discountPercent: i.discountPercent ?? '', total };
    }) : [{ ...BLANK_ROW, qty: 1 }]);
    setDescription(est.description || '');
    setNoGST(!!est.noGST);
    setView('create');
  };

  // Hands the estimate off to Sales.jsx as a prefilled new invoice (party +
  // items + GST fields carried over) via the same cross-page event Dashboard's
  // "+ New Entry" and InvoicePreviewDialog's Edit button already use — Sales.jsx
  // owns the actual invoice form, so this doesn't duplicate that UI here.
  const handleConvertToSale = (est) => {
    openTab('/sales', 'Sales', { duplicate: true });
    dispatchQuickNew({ path: '/sales', intent: 'convertEstimate', estimateId: est.id });
  };

  // Maps estimateId → the sale it was converted to (if any) — same pattern
  // as Orders.jsx's salesByOrderId. Once an estimate has been converted,
  // TxListView shows a "Converted" chip instead of the Convert action (both
  // disabled in the row menu and swapped out in the preview header), so a
  // single estimate can't be converted into two separate invoices by
  // accident. Read-only/derived from Sales.jsx's own `sourceEstimateId`
  // stamp — nothing is written back onto the estimate record itself, so
  // this stays correct even if the converted sale is later deleted (the
  // estimate simply becomes convertible again).
  const salesByEstimateId = useMemo(() => {
    const map = new Map();
    (data.sales || []).forEach((s) => { if (s.businessId === currentBusiness?.id && s.sourceEstimateId) map.set(s.sourceEstimateId, s); });
    return map;
  }, [data.sales, currentBusiness?.id]);

  const handleViewConvertedSale = (est) => {
    const sale = salesByEstimateId.get(est.id);
    if (!sale) return;
    openTab('/sales', 'Sales', { duplicate: true });
    dispatchQuickNew({ path: '/sales', intent: 'editTx', txId: sale.id });
  };

  const handleDelete = async (id) => {
    const ok = await confirm({ title: 'Delete Estimate', message: 'This estimate will be permanently deleted. This cannot be undone.', confirmLabel: 'Delete', variant: 'danger' });
    if (ok) await deleteItem('estimates', id);
  };

  const doPrint = (est) => {
    setPrintingTx({ ...est, invoiceNumber: est.estimateNumber, date: est.date });
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

  // Standalone "Download PDF" (bypassing the Share dialog) isn't reachable
  // from TxListView's fixed action set (Edit/Preview/Share/Delete — shared
  // across Estimates/CreditNotes/DebitNotes/DeliveryNotes, not extended here
  // since that wasn't asked for) — Download is instead available via the
  // Share dialog's "Share as PDF"/"Share as Image" buttons below, which fall
  // back to a direct download on desktop automatically (see deliverFile).
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
      const fileName = `${target.estimateNumber || 'estimate'}.pdf`;
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
          const fileName = `${target.estimateNumber || 'estimate'}.png`;
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

  const openSendDialog = (est) => {
    const tx = { ...est, invoiceNumber: est.estimateNumber, date: est.date };
    const party = parties.find(p => p.id === est.partyId) || null;
    setSendTx(tx);
    setSendParty(party);
    setSendOpen(true);
    import('html2canvas');
    import('jspdf');
  };

  return (
    <Box sx={{ mx: 0 }}>
      <Backdrop open={pdfLoading || shareLoading} sx={{ zIndex: 9999, flexDirection: 'column', gap: 2, bgcolor: 'rgba(0,0,0,0.55)' }}>
        <CircularProgress size={48} sx={{ color: 'white' }} />
        <Typography sx={{ color: 'white', fontWeight: 700 }}>{shareLoading ? 'Preparing to share…' : 'Generating PDF…'}</Typography>
      </Backdrop>

      {/* Hidden print ref */}
      <Box sx={{ position: 'absolute', left: -9999 }}>
        <InvoiceTemplate
          ref={printRef}
          transaction={printingTx}
          business={currentBusiness}
          paperSize={paperSize}
          title="Estimate"
          printOptions={{ ...config.billPrintOptions, loyalty: config.loyalty, termsText: estimateTerms }}
        />
      </Box>
      {/* PDF/image capture ref — off-screen but NOT display:none (html2canvas needs layout) */}
      <Box sx={{ position: 'fixed', left: -9999, top: 0, opacity: 0, pointerEvents: 'none', zIndex: -1 }}>
        <InvoiceTemplate
          ref={pdfRef}
          transaction={previewTx}
          business={currentBusiness}
          paperSize={paperSize}
          title="Estimate"
          printOptions={{ ...config.billPrintOptions, loyalty: config.loyalty, termsText: estimateTerms }}
        />
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1.5 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1rem' }}>{t('doc.estimatesQuotes')}</Typography>
        <Button
          variant="contained"
          startIcon={view === 'list' ? <Plus size={18} /> : <ArrowLeft size={18} />}
          onClick={() => (view === 'list' ? openNewEstimate() : backToList())}
        >
          {view === 'list' ? t('doc.newEstimate') : t('doc.backToList')}
        </Button>
      </Box>

      {view === 'list' && (
        <TxListView
          records={estimates}
          labelSingular="estimate"
          labelPlural="estimates"
          accessors={{ number: (r) => r.estimateNumber, party: (r) => r.partyName }}
          emptyIcon={<FileText size={28} />}
          emptyAction={<Button variant="contained" startIcon={<Plus size={16} />} onClick={openNewEstimate}>{t('doc.newEstimate')}</Button>}
          onEdit={handleEdit}
          onDelete={(r) => handleDelete(r.id)}
          onPrint={(r) => doPrint(r)}
          onShare={(r) => openSendDialog(r)}
          onConvert={handleConvertToSale}
          convertLabel="Convert to Sale"
          isConverted={(r) => salesByEstimateId.has(r.id)}
          convertedLabel={(r) => `Converted: ${salesByEstimateId.get(r.id)?.invoiceNumber || ''}`}
          onViewConverted={handleViewConvertedSale}
          openRecordId={openEstimateId}
          onOpenRecordHandled={() => setOpenEstimateId(null)}
          renderPreview={(r) => (
            <InvoiceTemplate
              transaction={{ ...r, invoiceNumber: r.estimateNumber, date: r.date }}
              business={currentBusiness}
              paperSize={paperSize}
              title="Estimate"
              printOptions={{ ...config.billPrintOptions, loyalty: config.loyalty, termsText: estimateTerms }}
            />
          )}
        />
      )}

      {view === 'create' && (
        <Card sx={{ mt: 2 }}>
          <CardContent>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <PartySelect
                  options={parties}
                  value={selectedParty}
                  onChange={(v) => setSelectedParty(v)}
                  onAddNew={(inputValue, isPhone) => setQuickAddParty({ open: true, name: isPhone ? '' : (inputValue || ''), phone: isPhone ? (inputValue || '') : '' })}
                  label="Customer"
                  placeholder="Search customer…"
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 3, md: 2 }}>
                <TextField fullWidth size="small" label="Estimate #" value={estimateNumber} onChange={(e) => setEstimateNumber(e.target.value)} />
              </Grid>
              <Grid size={{ xs: 6, sm: 3, md: 2 }}>
                <TextField fullWidth size="small" type="date" label="Date" value={estimateDate} onChange={(e) => setEstimateDate(e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid size={{ xs: 12, sm: 3, md: 2 }}>
                <TextField
                  select fullWidth size="small" label="Paper Size" value={paperSize}
                  onChange={(e) => setPaperSize(e.target.value)}
                >
                  {PAPER_SIZES.map((ps) => <MenuItem key={ps.value} value={ps.value}>{ps.value}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={12}>
                <TextField fullWidth size="small" label="Description" value={description} onChange={(e) => setDescription(e.target.value)} multiline rows={1} />
              </Grid>
              <Grid size={12}>
                {barcodeScanEnabled && (
                  <BarcodeInputRow
                    tokens={tokens}
                    onScan={handleBarcodeScan}
                    onOpenScanner={() => setScannerOpen(true)}
                    inputRef={barcodeInputRef}
                  />
                )}
                <TableContainer sx={{ overflowX: 'auto' }}>
                  <Table size="small" sx={{ minWidth: 760 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Item</TableCell>
                        <TableCell align="center" sx={{ width: 70 }}>Qty</TableCell>
                        {showUnitColumn && <TableCell align="center" sx={{ width: 90 }}>Unit</TableCell>}
                        <TableCell align="center" sx={{ width: 90 }}>Price</TableCell>
                        <TableCell align="center" sx={{ width: 84 }}>Disc %</TableCell>
                        <TableCell align="center" sx={{ width: 110 }}>Tax %</TableCell>
                        <TableCell align="right">Total</TableCell>
                        <TableCell sx={{ width: 40 }} />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {items.map((row, idx) => (
                        <TableRow key={idx}>
                          <TableCell sx={{ minWidth: 200 }}>
                            <ItemSelect
                              options={stockItems}
                              value={row.itemId ? (stockItems.find(i => i.id === row.itemId) || { id: row.itemId, name: row.name || '' }) : (row.name || null)}
                              onChange={(v) => {
                                // ItemSelect is freeSolo+autoSelect — onChange can fire with a
                                // plain typed string instead of the item object. Resolve it
                                // against stockItems by name before giving up, so a real
                                // selection is never silently discarded (this was the root
                                // cause of the earlier "No items" save-blocker bug).
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
                                  const newItems = [...items];
                                  newItems[idx] = { ...newItems[idx], name: val };
                                  setItems(newItems);
                                }
                              }}
                              onAddNew={(inputValue) => openQuickAddItem(inputValue, (newItem) => applyItemToRow(idx, newItem))}
                              placeholder="Search or select item…"
                              sx={{ minWidth: 200 }}
                            />
                          </TableCell>
                          <TableCell>
                            <TextField
                              type="number" size="small" value={row.qty}
                              onChange={(e) => { const v = e.target.value; if (v === '') { updateItemRow(idx, 'qty', ''); return; } const n = parseFloat(v); updateItemRow(idx, 'qty', isNaN(n) ? '' : Math.round(n * 1000) / 1000); }}
                              onFocus={(e) => e.target.select()}
                              inputProps={{ min: 0, style: { textAlign: 'center' } }} sx={{ width: 70 }}
                            />
                          </TableCell>
                          {showUnitColumn && (
                            <TableCell align="center">
                              <TextField
                                select size="small" value={row.unit || ''}
                                onChange={(e) => updateItemRow(idx, 'unit', e.target.value)}
                                SelectProps={{ displayEmpty: true }} sx={{ width: 82 }}
                              >
                                <MenuItem value=""><em style={{ opacity: 0.5 }}>—</em></MenuItem>
                                {itemUnitOptions.map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>)}
                              </TextField>
                            </TableCell>
                          )}
                          <TableCell>
                            <TextField
                              type="number" size="small" value={row.price}
                              onChange={(e) => updateItemRow(idx, 'price', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                              onFocus={(e) => e.target.select()}
                              inputProps={{ style: { textAlign: 'center' } }} sx={{ width: 90 }}
                            />
                          </TableCell>
                          <TableCell>
                            <TextField
                              type="number" size="small" value={row.discountPercent ?? ''}
                              placeholder="0"
                              onChange={(e) => updateItemRow(idx, 'discountPercent', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                              onFocus={(e) => e.target.select()}
                              inputProps={{ min: 0, max: 100, step: 0.5, style: { textAlign: 'center' } }} sx={{ width: 76 }}
                            />
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                              <TextField
                                type="number" size="small" value={row.taxRate}
                                onChange={(e) => updateItemRow(idx, 'taxRate', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                                onFocus={(e) => e.target.select()}
                                inputProps={{ min: 0, max: 100, step: 0.5, style: { textAlign: 'center' } }} sx={{ width: 64 }}
                              />
                              {Number(row.taxRate) > 0 && (
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
                          <TableCell align="right">₹{row.total?.toFixed(2)}</TableCell>
                          <TableCell><IconButton size="small" onClick={() => removeItemRow(idx)}><Trash2 size={14} /></IconButton></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                <Button size="small" startIcon={<Plus size={14} />} onClick={addItemRow} sx={{ mt: 1 }}>Add line</Button>
              </Grid>
              <Grid size={12} sx={{ textAlign: 'right' }}>
                <Typography>Subtotal: ₹{subtotal.toFixed(2)} | Tax: ₹{tax.toFixed(2)} | Total: ₹{total.toFixed(2)}</Typography>
                <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end', gap: 1, flexWrap: 'wrap' }}>
                  <Button variant="outlined" onClick={backToList}>Cancel</Button>
                  <Button variant="contained" onClick={handleSave} disabled={isSaving}>Save Estimate</Button>
                </Box>
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

      <PartyFormDialog
        open={quickAddParty.open}
        onClose={() => setQuickAddParty({ open: false, name: '', phone: '' })}
        partyType="Customer"
        editingParty={null}
        initialName={quickAddParty.name || ''}
        initialPhone={quickAddParty.phone || ''}
        compact
        onSaved={(newParty) => {
          setSelectedParty(newParty);
          setQuickAddParty({ open: false, name: '', phone: '' });
        }}
      />

      <SendDialog
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        tx={sendTx}
        party={sendParty}
        businessName={currentBusiness?.name || 'BillDheko'}
        initialMessage={buildEstimateMessage({ tx: sendTx, businessName: currentBusiness?.name || 'BillDheko' })}
        dialogTitle="Share Estimate"
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

export default Estimates;
