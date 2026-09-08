import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Box, Button, Card, CardContent, Typography, TextField, Grid,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  IconButton, MenuItem, InputAdornment, Snackbar, Alert, useTheme, alpha,
  Backdrop, CircularProgress, Chip, Tooltip, Dialog, DialogTitle, DialogContent,
  DialogActions, useMediaQuery,
} from '@mui/material';
import {
  Plus, Trash2, ClipboardList, ScanLine, Share2, Printer, Edit, Eye, X,
  CircleDot, CheckCircle2, PackageCheck, Truck, XCircle, Clock, MapPin, Search,
  ArrowRightLeft, ReceiptText,
} from 'lucide-react';
import { useBusiness } from './BusinessContext';
import { useConfig } from './ConfigContext';
import { useData } from './DataContext';
import { useDialog } from './DialogContext';
import { useTabs } from './TabsContext';
import { dispatchQuickNew, acknowledgeQuickNew } from './quickNewBridge';
import { useReactToPrint } from 'react-to-print';
import { PAPER_SIZES, getPaperWidthMm, getJsPdfFormat } from './InvoiceTemplate';
import OrderSlipTemplate from './OrderSlipTemplate';
import PartySelect from './PartySelect';
import PartyFormDialog from './PartyFormDialog';
import ItemSelect from './ItemSelect';
import ItemFormDialog from './ItemFormDialog';
import BarcodeScanner from './BarcodeScanner';
import SendDialog from './SendDialog';

const PAPER_SIZE_VALUES = PAPER_SIZES.map(p => p.value);

// Status workflow — order shown here is the natural progression; Cancelled is
// a terminal side-branch reachable from any state instead of a strict step.
const ORDER_STATUSES = [
  { value: 'Pending',    label: 'Pending',    icon: Clock,        color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  { value: 'Confirmed',  label: 'Confirmed',  icon: CircleDot,    color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  { value: 'Processing', label: 'Processing', icon: PackageCheck, color: '#7c3aed', bg: '#f5f3ff', border: '#e8ddd6' },
  { value: 'Ready',      label: 'Ready',      icon: CheckCircle2, color: '#5c1f22', bg: '#f6efe9', border: '#e8ddd6' },
  { value: 'Delivered',  label: 'Delivered',  icon: Truck,        color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
  { value: 'Cancelled',  label: 'Cancelled',  icon: XCircle,      color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
];
const STATUS_MAP = Object.fromEntries(ORDER_STATUSES.map(s => [s.value, s]));
// Straight-line "next status" suggestion for the one-click bump action —
// Cancelled has no next step (terminal), Delivered has no next step (terminal).
const NEXT_STATUS = { Pending: 'Confirmed', Confirmed: 'Processing', Processing: 'Ready', Ready: 'Delivered' };

const StatusChip = ({ status, size = 'small' }) => {
  const s = STATUS_MAP[status] || STATUS_MAP.Pending;
  const Icon = s.icon;
  return (
    <Chip
      size={size}
      icon={<Icon size={13} style={{ marginLeft: 4 }} />}
      label={s.label}
      sx={{
        fontWeight: 700, fontSize: '0.7rem', bgcolor: s.bg, color: s.color,
        border: `1px solid ${s.border}`, '& .MuiChip-icon': { color: s.color },
      }}
    />
  );
};

const getThemeTokens = (theme) => {
  const primary = theme.palette.primary.main;
  return { primary, primarySoft: alpha(primary, 0.08), primaryBorder: alpha(primary, 0.18) };
};

/* ─── Barcode input row (same pattern as Estimates.jsx/Sales.jsx) ─── */
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

// ── Share/deliver helpers — same convention as Estimates.jsx/Sales.jsx ─────
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

// Order-status-focused WhatsApp message — distinct from the invoice-shaped
// default in SendDialog since the point of sharing an order is usually "here's
// what you ordered and where it stands," not a tax/payment breakdown.
const buildOrderMessage = ({ tx, businessName }) => {
  if (!tx) return '';
  const s = STATUS_MAP[tx.status] || STATUS_MAP.Pending;
  const lines = [
    `*Order Update from ${businessName}*`, '',
    `📦 Order No: ${tx.orderNumber || '—'}`,
    `📅 Order Date: ${tx.orderDate || '—'}`,
    tx.partyName ? `👤 Customer: ${tx.partyName}` : '', '',
    `Status: *${s.label}*`,
  ];
  if (tx.deliveryDate) lines.push(`⏰ Delivery Date: ${tx.deliveryDate}`);
  if (tx.deliveryAddress?.trim()) lines.push(`📍 Deliver To: ${tx.deliveryAddress.trim()}`);
  if (tx.deliveryPhone?.trim()) lines.push(`📞 Delivery Contact: ${tx.deliveryPhone.trim()}`);
  lines.push('');
  if (tx.items?.length) {
    lines.push('*Items:*');
    tx.items.forEach(i => {
      const qty = Number(i.qty) || 1;
      const rate = Number(i.price) || 0;
      const unit = i.unit ? ` ${i.unit}` : '';
      lines.push(`  • ${i.name} × ${qty}${unit} @ ₹${rate.toFixed(2)} = ₹${(Number(i.total) || qty * rate).toFixed(2)}`);
    });
    lines.push('');
  }
  lines.push(`*Total: ₹${(Number(tx.totalAmount) || 0).toFixed(2)}*`);
  if (tx.notes?.trim()) lines.push(`\n📝 Notes: ${tx.notes.trim()}`);
  lines.push('\n_Sent via TallyKraft_');
  return lines.filter(l => l !== null).join('\n');
};

const BLANK_ROW = { itemId: '', name: '', qty: '', price: '', unit: '', total: 0 };

const Orders = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const tokens = useMemo(() => getThemeTokens(theme), [theme]);
  const { currentBusiness } = useBusiness();

  const { data, addItem, updateItem, deleteItem, getItems } = useData();
  const { confirm, showAlert } = useDialog();
  const { config } = useConfig();
  const { openTab } = useTabs();

  const [view, setView] = useState('list');
  const [editId, setEditId] = useState(null);
  const [snack, setSnack] = useState({ open: false, msg: '' });
  const [selectedParty, setSelectedParty] = useState(null);
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryPhone, setDeliveryPhone] = useState('');
  const [deliveryInstructions, setDeliveryInstructions] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [status, setStatus] = useState('Pending');
  const [items, setItems] = useState([{ ...BLANK_ROW, qty: 1 }]);
  const [notes, setNotes] = useState('');
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
  const [previewOpen, setPreviewOpen] = useState(false);
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
  const handlePrint = useReactToPrint({ contentRef: printRef, pageStyle: getPaperPageStyle(paperSize) });

  const parties = getItems('parties').filter(p => p.businessId === currentBusiness?.id && p.type === 'Customer');
  const stockItems = getItems('items').filter(i => i.businessId === currentBusiness?.id);
  // Sorted by order number (descending, newest first) rather than order
  // date — orderNumber is a zero-padded PREFIX-0001 serial, so a plain
  // string comparison would break past 4 digits (ORD-10000 sorting before
  // ORD-9999); localeCompare's numeric mode parses the embedded digit run
  // as an actual number, same fix already applied to Sales.jsx/TxListView.jsx.
  const orders = getItems('orders').filter(o => o.businessId === currentBusiness?.id)
    .sort((a, b) => String(b.orderNumber || '').localeCompare(String(a.orderNumber || ''), undefined, { numeric: true, sensitivity: 'base' }));

  // Maps orderId → the sale it was converted to (if any), so the list/preview
  // can show "Converted to Sale" instead of the action, and link straight to
  // it — memoized on data.sales specifically (not getItems, whose identity
  // changes on every unrelated table mutation) so this doesn't recompute on
  // every render.
  const salesByOrderId = useMemo(() => {
    const map = new Map();
    (data.sales || []).forEach((s) => { if (s.businessId === currentBusiness?.id && s.sourceOrderId) map.set(s.sourceOrderId, s); });
    return map;
  }, [data.sales, currentBusiness?.id]);

  const generateOrderNumber = () => {
    const numCfg = config.invoiceNumberConfig || {};
    const prefix = numCfg.orderPrefix || 'ORD';
    const startNum = numCfg.orderStartingNumber || 1;
    const existing = getItems('orders').filter(
      r => r.businessId === currentBusiness?.id && r.orderNumber?.startsWith(prefix + '-')
    );
    let maxSerial = startNum - 1;
    existing.forEach(r => {
      const parts = r.orderNumber.split('-');
      const serial = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(serial) && serial > maxSerial) maxSerial = serial;
    });
    return `${prefix}-${String(maxSerial + 1).padStart(4, '0')}`;
  };

  const openingForEditRef = useRef(false);
  useEffect(() => {
    if (view === 'create' && !isSaving) {
      if (openingForEditRef.current) { openingForEditRef.current = false; return; }
      setOrderNumber(generateOrderNumber());
      setItems([{ ...BLANK_ROW, qty: 1 }]);
      setSelectedParty(null);
      setOrderDate(new Date().toISOString().split('T')[0]);
      setDeliveryDate('');
      setDeliveryAddress('');
      setDeliveryPhone('');
      setDeliveryInstructions('');
      setStatus('Pending');
      setNotes('');
      setEditId(null);
    }
  }, [view, isSaving]); // eslint-disable-line

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
        item.unit = sel.unit || item.unit || '';
      }
    }
    const qty = Number(item.qty) || 0;
    const price = Number(item.price) || 0;
    item.total = qty * price;
    newItems[index] = item;
    setItems(newItems);
  };

  // ── Item quick-add-new dialog ────────────────────────────────────────────
  const openQuickAddItem = (inputValue, callback) => {
    itemDialogCallbackRef.current = callback;
    setItemDialog({ open: true, name: inputValue || '' });
  };
  const applyItemToRow = (index, selected) => {
    setItems(prev => {
      const newItems = [...prev];
      const targetIndex = index === -1 ? newItems.length : index;
      let item = { ...(newItems[targetIndex] || BLANK_ROW) };
      item.itemId = selected.id;
      item.name = selected.name || '';
      item.price = Number(selected.salePrice ?? selected.price) || '';
      item.unit = selected.unit || item.unit || '';
      if (item.qty === '' || item.qty == null) item.qty = 1;
      const qty = Number(item.qty) || 0;
      const price = Number(item.price) || 0;
      item.total = qty * price;
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
        updated[existingIdx] = { ...existing, qty: newQty, total: newQty * p };
        return updated;
      });
      setSnack({ open: true, msg: `${foundItem.name} qty updated` });
      return;
    }
    const emptyIdx = items.findIndex((i) => !i.itemId);
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

  const total = items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.price) || 0), 0);

  const handleSave = async () => {
    if (!currentBusiness?.id || !selectedParty?.id || !orderNumber?.trim() || !orderDate) {
      await showAlert({ title: 'Missing fields', message: 'Please fill in the customer, order number and date.', variant: 'warning' });
      return;
    }
    const cleaned = items.filter(i => i.itemId && Number(i.qty) > 0 && Number(i.price) >= 0).map(i => ({
      ...i, price: Number(i.price) || 0,
    }));
    if (!cleaned.length) {
      await showAlert({ title: 'No items', message: 'Add at least one item with a valid quantity and price.', variant: 'warning' });
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        businessId: currentBusiness.id,
        partyId: selectedParty.id,
        partyName: selectedParty.name || '',
        partyPhone: selectedParty.phone || '',
        orderDate,
        deliveryDate,
        deliveryAddress: deliveryAddress || '',
        deliveryPhone: deliveryPhone || '',
        deliveryInstructions: deliveryInstructions || '',
        orderNumber: orderNumber.trim(),
        items: cleaned,
        notes: notes || '',
        status,
        totalAmount: total,
      };
      const saved = editId
        ? await updateItem('orders', editId, payload)
        : await addItem('orders', payload);
      if (!saved) {
        await showAlert({ title: 'Save failed', message: 'Failed to save order. Please check you are signed in and try again.', variant: 'danger' });
        setIsSaving(false);
        return;
      }
      setSnack({ open: true, msg: editId ? 'Order updated' : 'Order saved' });
      setView('list');
    } catch (e) {
      await showAlert({ title: 'Save failed', message: 'Save failed: ' + (e?.message || e), variant: 'danger' });
    }
    setIsSaving(false);
  };

  const handleEdit = (ord) => {
    openingForEditRef.current = true;
    setEditId(ord.id);
    setSelectedParty(parties.find(p => p.id === ord.partyId) || null);
    setOrderDate(ord.orderDate || '');
    setDeliveryDate(ord.deliveryDate || ord.expectedDate || '');
    setDeliveryAddress(ord.deliveryAddress || '');
    setDeliveryPhone(ord.deliveryPhone || '');
    setDeliveryInstructions(ord.deliveryInstructions || '');
    setOrderNumber(ord.orderNumber || '');
    setStatus(ord.status || 'Pending');
    setItems(ord.items?.length ? ord.items.map(i => ({ ...i, total: (Number(i.qty) || 0) * (Number(i.price) || 0) })) : [{ ...BLANK_ROW, qty: 1 }]);
    setNotes(ord.notes || '');
    setView('create');
  };

  const handleDelete = async (id) => {
    const ok = await confirm({ title: 'Delete Order', message: 'This order will be permanently deleted. This cannot be undone.', confirmLabel: 'Delete', variant: 'danger' });
    if (ok) await deleteItem('orders', id);
  };

  // Hands the order off to Sales.jsx as a prefilled new invoice — same
  // cross-page event Estimates.jsx's "Convert to Sale" already uses. Order
  // items have no tax fields of their own (not a tax document), so each
  // line's GST rate/HSN/tax-inclusive flag is looked up from the item
  // master here, same as ItemSelect's own "populate from item" logic, so
  // the resulting invoice comes out GST-ready instead of all-zero-tax.
  const handleConvertToSale = (ord) => {
    const saleItems = (ord.items || []).map((i) => {
      const master = stockItems.find((si) => si.id === i.itemId);
      return {
        itemId: i.itemId, name: i.name, qty: i.qty, price: i.price, unit: i.unit || master?.unit || '',
        taxRate: Number(master?.taxRate) || 0,
        taxInclusive: !!master?.taxInclusive,
        discountPercent: '',
        hsnCode: master?.hsnCode || '',
        total: i.total,
      };
    });
    openTab('/sales', 'Sales', { duplicate: true });
    dispatchQuickNew({ path: '/sales', intent: 'convertOrder', orderId: ord.id, items: saleItems, partyId: ord.partyId, partyName: ord.partyName });
  };

  // One-click status update from the list — the most common action once an
  // order exists (no need to open the full edit form just to move a status
  // forward or cancel it).
  const updateStatus = async (ord, newStatus) => {
    await updateItem('orders', ord.id, { status: newStatus });
    setSnack({ open: true, msg: `${ord.orderNumber} marked ${newStatus}` });
  };

  const doPrint = (ord) => {
    setPrintingTx(ord);
    setTimeout(() => handlePrint(), 100);
  };

  const openPreview = (ord) => { setPreviewTx(ord); setPreviewOpen(true); };

  // Receiving end of the same "From Order" chip Sales.jsx now shows on a
  // converted invoice — mirrors Sales.jsx's own onQuickNew handler for
  // editTx, just opening this order's preview dialog instead of an edit
  // form (Orders is a single-instance tab, so no active-tab guard is
  // needed here unlike Sales.jsx's multi-instance case).
  useEffect(() => {
    const onQuickNew = (e) => {
      if (e.detail?.path !== '/orders' || e.detail?.intent !== 'viewOrder' || !e.detail?.orderId) return;
      const ord = (data.orders || []).find((o) => o.id === e.detail.orderId);
      if (ord) { openPreview(ord); acknowledgeQuickNew(e.detail); }
    };
    window.addEventListener('dashboard-quick-new', onQuickNew);
    return () => window.removeEventListener('dashboard-quick-new', onQuickNew);
  }, [data.orders]);

  // ── Share / PDF / Image ──────────────────────────────────────────────────
  const ensurePreviewTarget = async (tx) => {
    if (!tx) return;
    if (previewTx?.id === tx.id) { setPreviewTx(tx); return; }
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
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  };
  const captureOrderCanvas = async () => {
    const { default: html2canvas } = await import('html2canvas');
    await waitForCaptureReady(pdfRef.current);
    return html2canvas(pdfRef.current, { scale: 1.5, useCORS: true, backgroundColor: '#ffffff' });
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
      const [canvas, { jsPDF }] = await Promise.all([captureOrderCanvas(), import('jspdf').then(m => ({ jsPDF: m.jsPDF }))]);
      if (_shareCancelledRef.current) return;
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      const pdfWidthMm = getPaperWidthMm(paperSize);
      const pdfHeightMm = (canvas.height * pdfWidthMm) / canvas.width;
      const namedFormat = getJsPdfFormat(paperSize);
      const pdf = new jsPDF({ unit: 'mm', format: namedFormat || [pdfWidthMm, pdfHeightMm] });
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidthMm, pdfHeightMm);
      if (_shareCancelledRef.current) return;
      const fileName = `${target.orderNumber || 'order'}.pdf`;
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
      const canvas = await captureOrderCanvas();
      if (_shareCancelledRef.current) return;
      await new Promise((resolve, reject) => {
        canvas.toBlob(async (blob) => {
          if (!blob) { reject(new Error('No blob')); return; }
          if (_shareCancelledRef.current) { resolve(); return; }
          const fileName = `${target.orderNumber || 'order'}.png`;
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

  const openSendDialog = (ord) => {
    const tx = { ...ord, invoiceNumber: ord.orderNumber, date: ord.orderDate };
    const party = parties.find(p => p.id === ord.partyId) || null;
    setSendTx(tx);
    setSendParty(party);
    setSendOpen(true);
    import('html2canvas');
    import('jspdf');
  };

  return (
    <Box sx={{ mx: 0 }}>
      <Backdrop open={shareLoading} sx={{ zIndex: 9999, flexDirection: 'column', gap: 2, bgcolor: 'rgba(0,0,0,0.55)' }}>
        <CircularProgress size={48} sx={{ color: 'white' }} />
        <Typography sx={{ color: 'white', fontWeight: 700 }}>Preparing to share…</Typography>
      </Backdrop>

      {/* Hidden print ref */}
      <Box sx={{ position: 'absolute', left: -9999 }}>
        <OrderSlipTemplate ref={printRef} order={printingTx} business={currentBusiness} paperSize={paperSize} />
      </Box>
      {/* PDF/image capture ref — off-screen but NOT display:none (html2canvas needs layout) */}
      <Box sx={{ position: 'fixed', left: -9999, top: 0, opacity: 0, pointerEvents: 'none', zIndex: -1 }}>
        <OrderSlipTemplate ref={pdfRef} order={previewTx} business={currentBusiness} paperSize={paperSize} />
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1.5 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1rem' }}>Orders</Typography>
        <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setView(view === 'list' ? 'create' : 'list')}>
          {view === 'list' ? 'New Order' : 'Back to List'}
        </Button>
      </Box>

      {view === 'list' && (
        <OrdersList
          orders={orders}
          tokens={tokens}
          isMobile={isMobile}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onPrint={doPrint}
          onShare={openSendDialog}
          onPreview={openPreview}
          onStatusChange={updateStatus}
          onNew={() => setView('create')}
          onConvert={handleConvertToSale}
          salesByOrderId={salesByOrderId}
          onViewSale={(sale) => { openTab('/sales', 'Sales', { duplicate: true }); dispatchQuickNew({ path: '/sales', intent: 'editTx', txId: sale.id }); }}
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
                <TextField fullWidth size="small" label="Order #" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
              </Grid>
              <Grid size={{ xs: 6, sm: 3, md: 2 }}>
                <TextField fullWidth size="small" type="date" label="Order Date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid size={{ xs: 6, sm: 3, md: 2 }}>
                <TextField fullWidth size="small" type="date" label="Delivery Date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid size={{ xs: 6, sm: 3, md: 2 }}>
                <TextField
                  select fullWidth size="small" label="Paper Size" value={paperSize}
                  onChange={(e) => setPaperSize(e.target.value)}
                >
                  {PAPER_SIZES.map((ps) => <MenuItem key={ps.value} value={ps.value}>{ps.value}</MenuItem>)}
                </TextField>
              </Grid>

              <Grid size={12}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.7rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.75 }}>
                  Order Status
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                  {ORDER_STATUSES.map((s) => {
                    const Icon = s.icon;
                    const active = status === s.value;
                    return (
                      <Box
                        key={s.value}
                        onClick={() => setStatus(s.value)}
                        sx={{
                          display: 'flex', alignItems: 'center', gap: 0.6, px: 1.25, py: 0.6,
                          borderRadius: '100px', cursor: 'pointer', userSelect: 'none',
                          border: `1.5px solid ${active ? s.color : s.border}`,
                          bgcolor: active ? s.color : s.bg,
                          color: active ? '#fff' : s.color,
                          fontWeight: 700, fontSize: '0.78rem', transition: 'all 0.12s',
                        }}
                      >
                        <Icon size={14} />
                        {s.label}
                      </Box>
                    );
                  })}
                </Box>
              </Grid>

              <Grid size={12}>
                <Box sx={{ p: 1.75, borderRadius: 2, bgcolor: tokens.primarySoft, border: `1px solid ${tokens.primaryBorder}` }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.25 }}>
                    <MapPin size={15} color={tokens.primary} />
                    <Typography sx={{ fontWeight: 700, fontSize: '0.78rem', color: tokens.primary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Delivery Details
                    </Typography>
                    {selectedParty?.address && !deliveryAddress && (
                      <Button
                        size="small"
                        onClick={() => setDeliveryAddress(selectedParty.address)}
                        sx={{ ml: 'auto', textTransform: 'none', fontSize: '0.7rem', py: 0.2, minWidth: 0 }}
                      >
                        Use customer address
                      </Button>
                    )}
                  </Box>
                  <Grid container spacing={1.5}>
                    <Grid size={{ xs: 12, sm: 7 }}>
                      <TextField
                        fullWidth size="small" label="Delivery Address" value={deliveryAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                        placeholder="Where should this order be delivered?"
                        multiline rows={2}
                        sx={{ bgcolor: 'white' }}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 5 }}>
                      <TextField
                        fullWidth size="small" label="Delivery Contact Phone" value={deliveryPhone}
                        onChange={(e) => setDeliveryPhone(e.target.value.replace(/[^\d+ ]/g, ''))}
                        placeholder="If different from customer"
                        sx={{ bgcolor: 'white', mb: 1.5 }}
                      />
                      <TextField
                        fullWidth size="small" label="Delivery Instructions" value={deliveryInstructions}
                        onChange={(e) => setDeliveryInstructions(e.target.value)}
                        placeholder="e.g. Leave at reception, call before arriving"
                        sx={{ bgcolor: 'white' }}
                      />
                    </Grid>
                  </Grid>
                </Box>
              </Grid>

              <Grid size={12}>
                <TextField fullWidth size="small" label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} multiline rows={1} />
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
                  <Table size="small" sx={{ minWidth: 560 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Item</TableCell>
                        <TableCell align="center" sx={{ width: 70 }}>Qty</TableCell>
                        {showUnitColumn && <TableCell align="center" sx={{ width: 90 }}>Unit</TableCell>}
                        <TableCell align="center" sx={{ width: 90 }}>Price</TableCell>
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
                <Typography sx={{ fontWeight: 700 }}>Total: ₹{total.toFixed(2)}</Typography>
                <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end', gap: 1, flexWrap: 'wrap' }}>
                  <Button variant="outlined" onClick={() => setView('list')}>Cancel</Button>
                  <Button variant="contained" onClick={handleSave} disabled={isSaving}>Save Order</Button>
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

      {/* Preview dialog — maxWidth="lg" + explicit width/height (not "sm",
          previously too narrow for the order slip to render at readable
          size: FitPreview/the template's own scaling only ever shrinks to
          fit, never zooms in past 1:1, so a 600px-capped dialog rendered the
          slip shrunk and cramped — same fix as Sales.jsx's own invoice
          preview popup had needed). */}
      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} maxWidth="lg" fullWidth
        slotProps={{ paper: { sx: { width: '90vw', height: '92vh', maxHeight: '92vh' } } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ClipboardList size={20} />
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem' }}>{previewTx?.orderNumber}</Typography>
            {previewTx?.status && <StatusChip status={previewTx.status} />}
            {previewTx && salesByOrderId.get(previewTx.id) && (
              <Chip size="small" icon={<ReceiptText size={13} />} label={`Converted: ${salesByOrderId.get(previewTx.id).invoiceNumber}`}
                sx={{ fontWeight: 700, fontSize: '0.68rem', bgcolor: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', '& .MuiChip-icon': { color: '#15803d' } }} />
            )}
          </Box>
          <IconButton size="small" onClick={() => setPreviewOpen(false)}><X size={18} /></IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ bgcolor: '#e8eaed', p: 2, display: 'flex', justifyContent: 'center' }}>
          {previewTx && (
            <OrderSlipTemplate
              order={previewTx}
              business={currentBusiness}
              paperSize={paperSize}
            />
          )}
        </DialogContent>
        <DialogActions sx={{ px: 2.5, py: 1.5, gap: 1, flexWrap: 'wrap' }}>
          <Button startIcon={<Edit size={15} />} onClick={() => { setPreviewOpen(false); handleEdit(previewTx); }}>Edit</Button>
          <Button startIcon={<Printer size={15} />} onClick={() => doPrint(previewTx)}>Print</Button>
          <Button variant="contained" startIcon={<Share2 size={15} />} onClick={() => { setPreviewOpen(false); openSendDialog(previewTx); }}>Share</Button>
          {previewTx && (salesByOrderId.get(previewTx.id) ? (
            <Button
              startIcon={<ReceiptText size={15} />}
              onClick={() => { const sale = salesByOrderId.get(previewTx.id); setPreviewOpen(false); openTab('/sales', 'Sales', { duplicate: true }); dispatchQuickNew({ path: '/sales', intent: 'editTx', txId: sale.id }); }}
            >
              View Sale
            </Button>
          ) : (
            <Button startIcon={<ArrowRightLeft size={15} />} onClick={() => { setPreviewOpen(false); handleConvertToSale(previewTx); }}>Convert to Sale</Button>
          ))}
        </DialogActions>
      </Dialog>

      <SendDialog
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        tx={sendTx}
        party={sendParty}
        businessName={currentBusiness?.name || 'TallyKraft'}
        initialMessage={buildOrderMessage({ tx: sendTx, businessName: currentBusiness?.name || 'TallyKraft' })}
        dialogTitle="Share Order Status"
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

// Same date-range preset convention as TxListView.jsx (Sales/Estimates/etc.)
// — applied against orderDate so "Today"/"Week"/etc. mean when the order was
// placed, not its (optional) delivery date.
const DATE_PRESETS = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

// ── Status-first list view — separate from TxListView since Orders is driven
// by status (filter/update), not payment amount like invoices/estimates. ────
const OrdersList = ({ orders, tokens, isMobile, onEdit, onDelete, onPrint, onShare, onPreview, onStatusChange, onNew, onConvert, salesByOrderId, onViewSale }) => {
  const [statusFilter, setStatusFilter] = useState('All');
  const [datePreset, setDatePreset] = useState('all');
  const [search, setSearch] = useState('');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const filtered = useMemo(() => {
    let list = statusFilter === 'All' ? orders : orders.filter(o => o.status === statusFilter);

    if (datePreset !== 'all') {
      const now = new Date();
      const toISO = (d) => d.toISOString().split('T')[0];
      let from, to;
      if (datePreset === 'today') { from = toISO(now); to = toISO(now); }
      else if (datePreset === 'week') { const day = now.getDay() || 7; const monday = new Date(now); monday.setDate(now.getDate() - day + 1); from = toISO(monday); to = toISO(now); }
      else if (datePreset === 'month') { from = toISO(new Date(now.getFullYear(), now.getMonth(), 1)); to = toISO(now); }
      else if (datePreset === 'year') { from = toISO(new Date(now.getFullYear(), 0, 1)); to = toISO(now); }
      else if (datePreset === 'custom') { from = customFrom; to = customTo; }
      if (from) list = list.filter((o) => o.orderDate && o.orderDate >= from && (!to || o.orderDate <= to));
    }

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((o) =>
        o.orderNumber?.toLowerCase().includes(q) ||
        o.partyName?.toLowerCase().includes(q) ||
        o.partyPhone?.includes(q) ||
        o.deliveryAddress?.toLowerCase().includes(q) ||
        o.deliveryPhone?.includes(q)
      );
    }
    return list;
  }, [orders, statusFilter, datePreset, customFrom, customTo, search]);

  const counts = useMemo(() => {
    const c = { All: orders.length };
    ORDER_STATUSES.forEach(s => { c[s.value] = orders.filter(o => o.status === s.value).length; });
    return c;
  }, [orders]);

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 1.25 }}>
        <TextField
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search order #, customer, phone, address…"
          sx={{ flex: 1, minWidth: 220, '& .MuiOutlinedInput-root': { borderRadius: '8px', bgcolor: 'white' } }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search size={15} color="#9c8a84" /></InputAdornment> } }}
        />
        <TextField
          select size="small" value={datePreset}
          onChange={(e) => setDatePreset(e.target.value)}
          sx={{ minWidth: 130, '& .MuiOutlinedInput-root': { borderRadius: '8px', bgcolor: 'white' } }}
        >
          {DATE_PRESETS.map((p) => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
          <MenuItem value="custom">Custom range</MenuItem>
        </TextField>
        {datePreset === 'custom' && (
          <>
            <TextField
              size="small" type="date" label="From" value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px', bgcolor: 'white' } }}
            />
            <TextField
              size="small" type="date" label="To" value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px', bgcolor: 'white' } }}
            />
          </>
        )}
      </Box>

      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 2 }}>
        <Chip
          label={`All (${counts.All})`}
          size="small"
          onClick={() => setStatusFilter('All')}
          variant={statusFilter === 'All' ? 'filled' : 'outlined'}
          sx={{ fontWeight: 700, borderRadius: '8px', ...(statusFilter === 'All' ? { bgcolor: tokens.primary, color: '#fff' } : {}) }}
        />
        {ORDER_STATUSES.map((s) => (
          <Chip
            key={s.value}
            label={`${s.label} (${counts[s.value] || 0})`}
            size="small"
            icon={<s.icon size={13} />}
            onClick={() => setStatusFilter(s.value)}
            sx={{
              fontWeight: 700, borderRadius: '8px',
              border: `1px solid ${s.border}`,
              bgcolor: statusFilter === s.value ? s.color : s.bg,
              color: statusFilter === s.value ? '#fff' : s.color,
              '& .MuiChip-icon': { color: statusFilter === s.value ? '#fff' : s.color },
            }}
          />
        ))}
      </Box>

      {filtered.length === 0 ? (
        <Card elevation={0} sx={{ borderRadius: tokens?.radius?.lg || 2, border: '1px solid rgba(0,0,0,0.07)' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, py: 8, px: 2 }}>
            <Box sx={{ p: 2, borderRadius: '50%', bgcolor: tokens.primarySoft }}><ClipboardList size={28} color={tokens.primary} /></Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'text.secondary' }}>
              {orders.length === 0
                ? 'No orders yet'
                : (search.trim() || datePreset !== 'all' || statusFilter !== 'All')
                  ? 'No orders match your filters'
                  : `No ${statusFilter.toLowerCase()} orders`}
            </Typography>
            {orders.length === 0 && (
              <Button variant="contained" startIcon={<Plus size={16} />} onClick={onNew}>New Order</Button>
            )}
          </Box>
        </Card>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {filtered.map((ord) => {
            const nextStatus = NEXT_STATUS[ord.status];
            const convertedSale = salesByOrderId?.get(ord.id);
            return (
              <Card key={ord.id} elevation={0} sx={{ borderRadius: 2, border: '1px solid rgba(0,0,0,0.08)', p: 1.75 }}>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 1.25 }}>
                  <Box sx={{ flex: 1, minWidth: 180 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Typography sx={{ fontWeight: 800, fontFamily: 'monospace', fontSize: '0.85rem' }}>{ord.orderNumber}</Typography>
                      <StatusChip status={ord.status} />
                      {convertedSale && (
                        <Tooltip title={`Converted to sale ${convertedSale.invoiceNumber}`}>
                          <Chip
                            size="small" icon={<ReceiptText size={13} />} label={`Converted: ${convertedSale.invoiceNumber}`}
                            onClick={() => onViewSale?.(convertedSale)}
                            sx={{ fontWeight: 700, fontSize: '0.68rem', bgcolor: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', cursor: 'pointer', '& .MuiChip-icon': { color: '#15803d' } }}
                          />
                        </Tooltip>
                      )}
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.25 }}>{ord.partyName || 'Unknown customer'}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {ord.orderDate}{ord.deliveryDate ? ` · Delivery ${ord.deliveryDate}` : ''} · {ord.items?.length || 0} item{ord.items?.length === 1 ? '' : 's'}
                    </Typography>
                    {ord.deliveryAddress && (
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.4, mt: 0.4 }}>
                        <MapPin size={12} style={{ marginTop: 2, flexShrink: 0, opacity: 0.6 }} />
                        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>{ord.deliveryAddress}</Typography>
                      </Box>
                    )}
                  </Box>
                  <Typography sx={{ fontWeight: 800, color: tokens.primary, fontSize: '1rem' }}>
                    ₹{(Number(ord.totalAmount) || 0).toFixed(2)}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1.25, flexWrap: 'wrap' }}>
                  {nextStatus && (
                    <Tooltip title={`Mark as ${nextStatus}`}>
                      <Button
                        size="small" variant="outlined"
                        onClick={() => onStatusChange(ord, nextStatus)}
                        sx={{ textTransform: 'none', fontWeight: 700, fontSize: '0.72rem', borderRadius: '8px', py: 0.3 }}
                      >
                        Mark {nextStatus}
                      </Button>
                    </Tooltip>
                  )}
                  {ord.status !== 'Cancelled' && ord.status !== 'Delivered' && (
                    <Tooltip title="Cancel order">
                      <Button
                        size="small" color="error"
                        onClick={() => onStatusChange(ord, 'Cancelled')}
                        sx={{ textTransform: 'none', fontWeight: 700, fontSize: '0.72rem', borderRadius: '8px', py: 0.3 }}
                      >
                        Cancel
                      </Button>
                    </Tooltip>
                  )}
                  {ord.status !== 'Cancelled' && !convertedSale && onConvert && (
                    <Tooltip title="Convert this order to a sale invoice">
                      <Button
                        size="small" variant="outlined" startIcon={<ArrowRightLeft size={13} />}
                        onClick={() => onConvert(ord)}
                        sx={{ textTransform: 'none', fontWeight: 700, fontSize: '0.72rem', borderRadius: '8px', py: 0.3 }}
                      >
                        Convert to Sale
                      </Button>
                    </Tooltip>
                  )}
                  <Box sx={{ flex: 1 }} />
                  <Tooltip title="Preview">
                    <IconButton size="small" onClick={() => onPreview(ord)} sx={{ color: tokens.primary, bgcolor: `${tokens.primary}10`, '&:hover': { bgcolor: `${tokens.primary}20` } }}><Eye size={16} /></IconButton>
                  </Tooltip>
                  <Tooltip title="Edit">
                    <IconButton size="small" onClick={() => onEdit(ord)} sx={{ color: tokens.primary, bgcolor: `${tokens.primary}10`, '&:hover': { bgcolor: `${tokens.primary}20` } }}><Edit size={16} /></IconButton>
                  </Tooltip>
                  {!isMobile && (
                    <Tooltip title="Print">
                      <IconButton size="small" onClick={() => onPrint(ord)} sx={{ color: tokens.primary, bgcolor: `${tokens.primary}10`, '&:hover': { bgcolor: `${tokens.primary}20` } }}><Printer size={16} /></IconButton>
                    </Tooltip>
                  )}
                  <Tooltip title="Share status on WhatsApp">
                    <IconButton size="small" onClick={() => onShare(ord)} sx={{ color: '#25D366', bgcolor: 'rgba(37,211,102,0.1)', '&:hover': { bgcolor: 'rgba(37,211,102,0.2)' } }}><Share2 size={16} /></IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton size="small" onClick={() => onDelete(ord.id)} sx={{ color: 'error.main', bgcolor: 'rgba(239,68,68,0.08)', '&:hover': { bgcolor: 'rgba(239,68,68,0.18)' } }}><Trash2 size={16} /></IconButton>
                  </Tooltip>
                </Box>
              </Card>
            );
          })}
        </Box>
      )}
    </Box>
  );
};

export default Orders;
