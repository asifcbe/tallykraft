import React, { useState, useMemo, useRef, useEffect, useCallback, memo } from 'react';
import {
  Box, Paper, Typography, TextField, InputAdornment, IconButton, Button,
  Divider, Chip, Stack, Tooltip, useTheme,
  alpha, Dialog, DialogTitle, DialogContent, DialogActions, Autocomplete,
  Snackbar, Alert, useMediaQuery, ToggleButton, ToggleButtonGroup, MenuItem,
  Pagination, Switch,
} from '@mui/material';
import {
  Search, ScanLine, Plus, Minus, Trash2, X, ShoppingCart,
  Banknote, Landmark, CheckCircle2, Percent, RotateCcw,
  Package, Printer, Coins, AlertTriangle, GripVertical, Lock, LockOpen,
  Tag, ArrowLeftRight, ChevronRight, ChevronLeft, ListOrdered, UserCircle2,
  Layers, Ban, Edit, QrCode,
} from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import { useData } from './DataContext';
import { usePersistedState } from './usePersistedState';
import { useI18n } from './i18n/I18nContext';
import { useBusiness } from './BusinessContext';
import { useConfig } from './ConfigContext';
import { useSubscription } from './SubscriptionContext';
import { useAuth } from './AuthContext';
import { useDialog } from './DialogContext';
import BarcodeScanner from './BarcodeScanner';
import ItemFormDialog from './ItemFormDialog';
import InvoiceTemplate from './InvoiceTemplate';
import { BRAND } from './theme';
import SplitPaymentInput from './SplitPaymentInput';
import PartyFormDialog from './PartyFormDialog';
import PartySelect from './PartySelect';
import CustomerPreviewPanel from './CustomerPreviewPanel';
import ItemSelect from './ItemSelect';
import { buildUpiUri } from './upiUtils';
import UpiQrImage from './UpiQrImage';
import { waitForQrReady } from './qrReady';

// Round-off sequences — identical to Sales.jsx new-invoice behaviour.
const getRoundUpSeq = (val) => {
  const seq = [];
  let cur = val;
  for (const s of [1, 10, 100, 1000, 10000]) {
    const r = Math.ceil(cur / s) * s;
    if (r > cur) { seq.push(r); cur = r; if (seq.length >= 3) break; }
  }
  return seq;
};
const getRoundDownSeq = (val) => {
  const seq = [];
  let cur = val;
  for (const s of [1, 10, 100, 1000, 10000]) {
    const r = Math.floor(cur / s) * s;
    if (r < cur) { seq.push(r); cur = r; if (seq.length >= 3) break; }
  }
  return seq;
};

// ── Theme tokens ─────────────────────────────────────────────────────────────
const getTokens = (theme) => {
  const primary = theme.palette.primary.main;
  return {
    primary,
    primarySoft: alpha(primary, 0.08),
    primaryBorder: alpha(primary, 0.18),
    success: theme.palette.success.main,
    successSoft: alpha(theme.palette.success.main, 0.1),
    error: theme.palette.error.main,
    warning: theme.palette.warning.main,
  };
};

const money = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Build the next sequential invoice number using config-based prefix.
const nextInvoiceNumber = (sales, businessId, prefix, startNum) => {
  const p = (prefix || 'INV') + '-';
  let maxSerial = (startNum || 1) - 1;
  (sales || []).forEach((tx) => {
    if (tx.businessId === businessId && tx.invoiceNumber?.startsWith(p)) {
      const parts = tx.invoiceNumber.split('-');
      const serial = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(serial) && serial > maxSerial) maxSerial = serial;
    }
  });
  return `${p}${String(maxSerial + 1).padStart(4, '0')}`;
};

const playAddSound = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1100, ctx.currentTime + 0.07);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.12);
    osc.onended = () => ctx.close();
  } catch (_) {}
};

// Stable palette of category accent colors
const CAT_COLORS = [
  '#6366f1', '#6366f1', '#0284c7', '#7c3aed',
  '#db2777', '#ea580c', '#ca8a04', '#16a34a',
];
const getCatColor = (cat, categories) => {
  const idx = categories.indexOf(cat);
  return CAT_COLORS[(idx - 1 + CAT_COLORS.length) % CAT_COLORS.length];
};

const PAY_MODES = [
  { value: 'Cash', icon: Banknote, label: 'Cash' },
  { value: 'Bank', icon: Landmark, label: 'Bank' },
  { value: 'Split', icon: ArrowLeftRight, label: 'Split' },
];

// Memoized so unrelated re-renders (search keystrokes, qty edits on other
// tiles, dialogs opening) don't re-render every visible product tile — only
// tiles whose own props actually changed re-render.
const ProductTile = memo(function ProductTile({
  item, inCart, kbFocused, catColor, canDrag, teal, tealLight, tealDark,
  errorColor, tileRef, onTileClick, onDragStart, onDrop,
}) {
  const price = Number(item.salePrice ?? item.price) || 0;
  const stock = Number(item.stock) || 0;
  const out = stock <= 0;

  return (
    <Paper
      ref={tileRef}
      onClick={() => onTileClick(item)}
      elevation={0}
      draggable={canDrag}
      onDragStart={canDrag ? (e) => onDragStart(item.id, e) : undefined}
      onDragOver={canDrag ? (e) => e.preventDefault() : undefined}
      onDrop={canDrag ? (e) => { e.preventDefault(); onDrop(item.id); } : undefined}
      sx={{
        p: 0,
        cursor: canDrag ? 'grab' : 'pointer',
        border: '1.5px solid',
        borderColor: kbFocused ? teal : inCart ? teal : 'divider',
        bgcolor: 'background.paper',
        borderRadius: '14px',
        display: 'flex',
        flexDirection: 'column',
        minHeight: { xs: 120, sm: 150, md: 160 },
        position: 'relative',
        overflow: 'hidden',
        transition: 'transform 0.14s ease, box-shadow 0.14s ease, border-color 0.14s ease',
        boxShadow: kbFocused
          ? `0 0 0 2px ${teal}, 0 4px 16px ${alpha(teal, 0.25)}`
          : inCart
            ? `0 4px 16px ${alpha(teal, 0.2)}`
            : `0 1px 3px ${alpha('#000', 0.06)}`,
        ...(canDrag && { borderStyle: 'dashed', borderColor: alpha(teal, 0.35) }),
        '&:hover': {
          borderColor: inCart ? teal : alpha(teal, 0.5),
          boxShadow: `0 8px 24px ${alpha(inCart ? teal : '#000', inCart ? 0.22 : 0.1)}`,
          transform: 'translateY(-3px)',
        },
        '&:active': { transform: 'translateY(-1px)' },
        opacity: out ? 0.55 : 1,
      }}
    >
      {/* Colour accent top bar */}
      <Box sx={{
        height: 4,
        background: inCart
          ? `linear-gradient(90deg, ${teal}, ${tealLight})`
          : `linear-gradient(90deg, ${alpha(catColor, 0.45)}, ${alpha(catColor, 0.2)})`,
        transition: 'background 0.14s ease',
      }} />

      <Box sx={{ p: { xs: 1.25, sm: 1.75, md: 2 }, flex: 1, display: 'flex', flexDirection: 'column' }}>
        {canDrag && (
          <Box sx={{ position: 'absolute', top: 10, left: 6, color: 'text.disabled', display: 'flex' }}>
            <GripVertical size={13} />
          </Box>
        )}

        {/* In-cart badge */}
        {inCart > 0 && (
          <Box sx={{
            position: 'absolute', top: 10, right: 8,
            minWidth: 22, height: 22,
            borderRadius: '100px',
            background: `linear-gradient(135deg, ${teal}, ${tealDark})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 2px 6px ${alpha(teal, 0.4)}`,
          }}>
            <Typography sx={{ color: '#fff', fontSize: '0.68rem', fontWeight: 800, px: 0.5, lineHeight: 1 }}>
              {inCart}
            </Typography>
          </Box>
        )}

        <Typography sx={{
          fontWeight: 700,
          fontSize: { xs: '0.875rem', sm: '0.925rem', md: '0.975rem' },
          lineHeight: 1.3,
          mb: 'auto',
          pb: 1,
          pr: inCart ? 3 : 0,
          pl: canDrag ? 2 : 0,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          color: 'text.primary',
        }}>
          {item.name}
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.5, mt: 'auto' }}>
          <Box sx={{
            px: 1.25, py: 0.5,
            borderRadius: '8px',
            bgcolor: inCart ? alpha(teal, 0.1) : alpha(catColor, 0.08),
            color: inCart ? teal : catColor,
            fontWeight: 800,
            fontSize: { xs: '0.9rem', sm: '1rem', md: '1.05rem' },
            lineHeight: 1,
            letterSpacing: '-0.01em',
          }}>
            {money(price)}
          </Box>
          <Typography variant="caption" sx={{
            color: out ? errorColor : 'text.disabled',
            fontWeight: out ? 700 : 400,
            fontSize: { xs: '0.7rem', sm: '0.72rem' },
            whiteSpace: 'nowrap',
          }}>
            {out ? 'Out of stock' : `${stock} ${item.unit || ''}`.trim()}
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
});

const POS = () => {
  const theme = useTheme();
  const tokens = useMemo(() => getTokens(theme), [theme]);
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  // The root layout stacks the cart below the product grid starting at `md`
  // (960px, see the flexDirection switch below), but the floating
  // always-reachable checkout bar / in-panel checkout button only used to
  // switch at `isMobile`'s `sm` (600px) — so on a 600-960px tablet in
  // portrait, checkout is stacked at the bottom of a long product grid with
  // no floating affordance to reach it without scrolling. Checkout
  // visibility now matches the same `md` cutoff the stacking itself uses.
  const isStackedLayout = useMediaQuery(theme.breakpoints.down('md'));

  const { getItems, data, addItem, updateItem, updateItems } = useData();
  const { currentBusiness } = useBusiness();
  const { config, saveConfig } = useConfig();
  const { staffSession } = useAuth();
  const { showAlert, confirm } = useDialog();
  const { t } = useI18n();
  // TallyKraft billing: block completing a sale when the subscription is
  // inactive (the data layer would reject the write regardless).
  const { isBusinessActive } = useSubscription();
  const canWrite = isBusinessActive(currentBusiness?.id);
  const businessId = currentBusiness?.id;
  const bizKey = String(businessId);
  const barcodeEnabled = !!config.features?.barcode;

  const allItems = useMemo(
    () => getItems('items').filter((i) => i.businessId === businessId && i.showInSalesAndPOS !== false),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.items, businessId],
  );
  const customers = useMemo(
    () => getItems('parties').filter((p) => p.businessId === businessId && p.type === 'Customer'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.parties, businessId],
  );

  const categories = useMemo(() => {
    const set = new Set();
    allItems.forEach((i) => { if (i.category?.trim()) set.add(i.category.trim()); });
    return ['All', ...Array.from(set).sort()];
  }, [allItems]);

  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState('All');
  // Product grid is paginated so a large catalog doesn't render thousands of
  // DOM tiles at once — each tile is a fairly deep MUI subtree.
  const POS_PAGE_SIZE = 60;
  const [productPage, setProductPage] = useState(0);
  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState(null);
  // ── One by One mode ────────────────────────────────────────────────────
  // A guided, keyboard-first checkout flow for cashiers who want to move
  // through a sale in fixed stages (Products → Customer → Checkout) instead
  // of the normal all-at-once layout — minimizes mouse/touch use since each
  // stage only shows what's needed for that step, with Enter/a big
  // "Continue" button as the only input required to advance. Persisted
  // since it's a standing preference for how a cashier wants to work, not a
  // per-sale setting.
  const [oneByOneMode, setOneByOneMode] = usePersistedState('pos_oneByOneMode', false);
  const [obStep, setObStep] = useState('products'); // 'products' | 'customer' | 'checkout'
  const [quickAddCustomer, setQuickAddCustomer] = useState({ open: false, name: '', phone: '' });
  // Edit dialog for the currently-selected customer — opened from the
  // preview panel's Edit button. Separate from quickAddCustomer (create-new).
  const [editCustomerOpen, setEditCustomerOpen] = useState(false);
  const [showCustomerPanel, setShowCustomerPanel] = useState(false);
  const [loyaltyRedeemPoints, setLoyaltyRedeemPoints] = useState(0);
  const [loyaltyRedeemValue, setLoyaltyRedeemValue] = useState(0);
  const [discountValue, setDiscountValue] = useState('');
  // Persisted (not plain useState) — the %/₹ mode is a preference the
  // cashier picks once and expects to stick around, not a per-sale value
  // like discountValue itself; previously reset to 'amount' on every reload.
  const [discountType, setDiscountType] = usePersistedState('pos_discountType', 'amount');
  const [roundOff, setRoundOff] = useState(() => config.billPrintOptions?.autoRoundOff ? 1 : 0);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [newItemDialog, setNewItemDialog] = useState({ open: false, name: '' });
  // Picker for adding an existing catalog item to the cart WITHOUT billing
  // the customer (e.g. a cover/bag used up during this sale) — distinct from
  // newItemDialog, which creates a brand-new catalog item.
  const [addInventoryDialog, setAddInventoryDialog] = useState(false);
  const [paymentQrOpen, setPaymentQrOpen] = useState(false);
  const [payMode, setPayMode] = useState('Cash');
  const [cashReceived, setCashReceived] = useState('');
  const [splitCash, setSplitCash] = useState('');
  const [splitBank, setSplitBank] = useState('');
  const [advance, setAdvance] = useState('');
  const [advanceMode, setAdvanceMode] = useState('Cash');
  const [advanceSplitCash, setAdvanceSplitCash] = useState('');
  const [advanceSplitBank, setAdvanceSplitBank] = useState('');
  // 'paid' = cash/bank sale (default for POS), 'credit' = credit sale
  const [saleType, setSaleType] = useState(() => config.defaultSaleTypePOS ?? 'paid');
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);
  const [selectedBilledBy, setSelectedBilledBy] = useState('');

  // "Billed By" should read "Admin" for the business owner/admin regardless of
  // how they logged in — Google sign-in (!staffSession) or business code +
  // admin password (staffSession.role === 'admin', whose session.name is the
  // business name, not a person). Only a real non-admin staff member's own
  // name should show here.
  const isAdminUser = !staffSession || staffSession.role === 'admin';
  const ownerName = isAdminUser ? 'Admin' : staffSession.name;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const salesStaff = useMemo(() => getItems('staffMembers').filter(s => s.businessId === businessId && s.showInSalesSelector === true && s.status === 'active'), [data.staffMembers, businessId]);

  const [order, setOrder] = useState(() => config.posItemOrder?.[bizKey] || []);
  const [locked, setLocked] = useState(() => config.posOrderLocked?.[bizKey] ?? true);
  const dragId = useRef(null);

  useEffect(() => {
    setOrder(config.posItemOrder?.[bizKey] || []);
    setLocked(config.posOrderLocked?.[bizKey] ?? true);
  }, [bizKey, config.posItemOrder, config.posOrderLocked]);

  const persistOrder = useCallback((nextOrder, nextLocked) => {
    saveConfig?.({
      posItemOrder: { ...(config.posItemOrder || {}), [bizKey]: nextOrder },
      posOrderLocked: { ...(config.posOrderLocked || {}), [bizKey]: nextLocked },
    });
  }, [bizKey, config.posItemOrder, config.posOrderLocked, saveConfig]);

  const toggleLock = () => {
    const next = !locked;
    setLocked(next);
    persistOrder(order, next);
  };

  const [printPrompt, setPrintPrompt] = useState(null);
  const [printingTx, setPrintingTx] = useState(null);
  const [printTrigger, setPrintTrigger] = useState(0);
  const printRef = useRef(null);
  const paperSize = config.billPrintOptions?._paperSize || config.defaultPaperSize || 'A4';
  const getPaperPageStyle = (ps) => {
    if (ps === 'Thermal 80mm') return '@page { size: 80mm auto; margin: 0; } body { margin: 0; }';
    if (ps === 'Thermal 58mm') return '@page { size: 58mm auto; margin: 0; } body { margin: 0; }';
    if (ps === 'Dot Matrix')   return '@page { size: 240mm auto; margin: 6mm; } body { margin: 0; }';
    if (ps === 'A3')           return '@page { size: A3 portrait; margin: 14mm; } body { margin: 0; }';
    if (ps === 'A5')           return '@page { size: A5 portrait; margin: 10mm; } body { margin: 0; }';
    if (ps === 'A6')           return '@page { size: A6 portrait; margin: 6mm; } body { margin: 0; }';
    if (ps === 'Letter')       return '@page { size: Letter portrait; margin: 12mm; } body { margin: 0; }';
    if (ps === 'Legal')        return '@page { size: Legal portrait; margin: 12mm; } body { margin: 0; }';
    if (ps === 'Executive')    return '@page { size: 184mm 267mm portrait; margin: 12mm; } body { margin: 0; }';
    if (ps === 'Statement')    return '@page { size: 140mm 216mm portrait; margin: 10mm; } body { margin: 0; }';
    if (ps === 'Half Page')    return '@page { size: 148mm 210mm portrait; margin: 8mm; } body { margin: 0; }';
    return '@page { size: A4 portrait; margin: 10mm; } body { margin: 0; }';
  };
  // onBeforePrint is awaited by react-to-print before it snapshots the DOM —
  // waiting on the payment QR canvas here closes the async draw-vs-print
  // race documented in qrReady.js (previously the QR could print blank on a
  // cold first print in a fresh session).
  const handlePrint = useReactToPrint({ contentRef: printRef, pageStyle: getPaperPageStyle(paperSize), onBeforePrint: waitForQrReady });
  const searchRef = useRef(null);

  // ── Keyboard navigation state ─────────────────────────────────────────────
  const [kbFocusedIdx, setKbFocusedIdx] = useState(-1);
  const [showKbHints, setShowKbHints] = useState(false);
  const kbTileRefs = useRef([]);
  const cartQtyRefs = useRef([]);
  const completeSaleRef = useRef(null);
  const kbBufferRef = useRef([]);
  const totalsRef = useRef({ grandTotal: 0 });
  const customerInputRef = useRef(null);
  const cashInputRef = useRef(null);
  const discountInputRef = useRef(null);
  const printPromptYesRef = useRef(null);
  const localDialogOpenRef = useRef(false);
  // Holds a timestamp until which shortcuts should still treat a dialog as
  // "open" even though it just closed — the quick-add-customer/item dialogs
  // save via an async addItem() call, so there's a real gap between the
  // user's Enter keypress finishing (dialog visually closing) and this
  // component re-rendering with quickAddCustomer.open === false. A key
  // repeat or an impatient second Enter landing in that gap used to fall
  // through the (by-then-false) anyDialog check straight into the "Enter
  // completes sale" shortcut — since a customer had JUST been set and the
  // cart already had items, it silently completed and reset the sale.
  const dialogCooldownUntilRef = useRef(0);
  // Live-value refs so the stable keydown listener reads these instead of closure vars
  const cartRef = useRef([]);
  const savingRef = useRef(false);
  const kbFocusedIdxRef = useRef(-1);
  const filteredRef = useRef([]);
  const searchRef2 = useRef('');
  const payModeRef = useRef('Cash');
  const addToCartRef = useRef(null);
  const handleScanRef = useRef(null);
  const resetSaleRef = useRef(null);
  const saleTypeRef = useRef('paid');
  const changeQtyRef = useRef(null);
  const customerRef = useRef(null);
  // Tracks the most recently scanned/added/adjusted cart line — used by the
  // +/- keyboard shortcut to know which line to bump without an explicit target.
  const lastTouchedIdRef = useRef(null);
  const oneByOneModeRef = useRef(false);
  const obStepRef = useRef('products');
  const obGoToCustomerRef = useRef(null);
  // Focused automatically once a customer is picked in One by One mode's
  // Customer step, so a single further Enter (native button activation)
  // continues to Checkout with no mouse/touch needed.
  const obContinueBtnRef = useRef(null);
  const obGoToCheckoutRef = useRef(null);

  useEffect(() => {
    if (!printTrigger) return;
    handlePrint();
  }, [printTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  // Start the shortcut-suppression cooldown the instant either quick-add
  // dialog closes (transitions true → false) — see dialogCooldownUntilRef
  // above for why this gap exists. 600ms comfortably covers MUI's ~225ms
  // exit transition plus room for a stray/repeated keystroke to land.
  const prevQuickAddOpenRef = useRef(false);
  const prevNewItemOpenRef = useRef(false);
  useEffect(() => {
    if (prevQuickAddOpenRef.current && !quickAddCustomer.open) {
      dialogCooldownUntilRef.current = Date.now() + 600;
    }
    prevQuickAddOpenRef.current = quickAddCustomer.open;
  }, [quickAddCustomer.open]);
  useEffect(() => {
    if (prevNewItemOpenRef.current && !newItemDialog.open) {
      dialogCooldownUntilRef.current = Date.now() + 600;
    }
    prevNewItemOpenRef.current = newItemDialog.open;
  }, [newItemDialog.open]);

  useEffect(() => {
    const timer = setTimeout(() => searchRef.current?.focus(), 150);
    return () => clearTimeout(timer);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = allItems.filter((i) => {
      if (activeCat !== 'All' && (i.category?.trim() || '') !== activeCat) return false;
      if (!q) return true;
      return (
        i.name?.toLowerCase().includes(q) ||
        i.barcode?.toLowerCase().includes(q) ||
        i.itemCode?.toLowerCase().includes(q)
      );
    });
    if (order.length) {
      const pos = new Map(order.map((id, idx) => [String(id), idx]));
      matched.sort((a, b) => {
        const ai = pos.has(String(a.id)) ? pos.get(String(a.id)) : Infinity;
        const bi = pos.has(String(b.id)) ? pos.get(String(b.id)) : Infinity;
        return ai - bi;
      });
    }
    return matched;
  }, [allItems, search, activeCat, order]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / POS_PAGE_SIZE));

  // Reset to page 1 whenever the result set changes underneath the current page
  useEffect(() => {
    setProductPage(0);
  }, [search, activeCat, order]);

  const pagedItems = useMemo(
    () => filtered.slice(productPage * POS_PAGE_SIZE, (productPage + 1) * POS_PAGE_SIZE),
    [filtered, productPage]
  );

  // O(1) per-tile cart lookup — built once per cart change instead of every
  // tile re-scanning the whole cart array on every render.
  const cartQtyMap = useMemo(() => {
    const m = new Map();
    for (const c of cart) m.set(c.itemId, c.qty);
    return m;
  }, [cart]);

  const canDrag = !locked && !search.trim();

  const handleDrop = useCallback((targetId) => {
    const from = dragId.current;
    dragId.current = null;
    if (from == null || String(from) === String(targetId)) return;
    const ids = filtered.map((i) => String(i.id));
    const fromIdx = ids.indexOf(String(from));
    const toIdx = ids.indexOf(String(targetId));
    if (fromIdx < 0 || toIdx < 0) return;
    ids.splice(toIdx, 0, ids.splice(fromIdx, 1)[0]);
    setOrder(ids);
    persistOrder(ids, locked);
  }, [filtered, locked, persistOrder]);

  const handleTileDragStart = useCallback((id, e) => {
    dragId.current = id;
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const resetOrder = () => {
    setOrder([]);
    persistOrder([], locked);
    setToast({ msg: 'Product order reset', severity: 'info' });
  };

  const addToCart = useCallback((item) => {
    playAddSound();
    lastTouchedIdRef.current = item.id;
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.itemId === item.id);
      const avail = Number(item.stock) || 0;
      if (idx >= 0) {
        const newQty = prev[idx].qty + 1;
        if (config.features?.stockAlert && newQty > avail) {
          setTimeout(() => setToast({
            msg: avail <= 0
              ? `${item.name} is out of stock.`
              : `Only ${avail} ${item.unit || 'unit(s)'} of ${item.name} available.`,
            severity: 'warning',
          }), 0);
          return prev;
        }
        // Move the touched line to the top of the cart
        const line = { ...prev[idx], qty: newQty };
        const rest = prev.filter((_, i) => i !== idx);
        return [line, ...rest];
      }
      if (config.features?.stockAlert && avail <= 0) {
        setTimeout(() => setToast({ msg: `${item.name} is out of stock.`, severity: 'warning' }), 0);
      }
      const price = Number(item.salePrice ?? item.price) || 0;
      return [
        {
          itemId: item.id,
          name: item.name,
          price,
          taxRate: Number(item.taxRate) || 0,
          discount: Number(item.discount) || 0,
          qty: 1,
          stock: avail,
          unit: item.unit || '',
          hsnCode: item.hsnCode || '',
          recipe: Array.isArray(item.recipe) ? item.recipe : [],
          recipeOverrides: {},
          notBilled: false,
        },
        ...prev,
      ];
    });
  }, [config.features?.stockAlert]);

  // Adds a consumable/inventory item to the cart WITHOUT charging the
  // customer for it — e.g. a cover, bag, or packing material used up during
  // this sale. Stock still deducts on checkout; it's excluded from the
  // printed/shared bill (see completeSale's stock loop and the notBilled
  // filter InvoiceTemplate/SendDialog apply).
  const addNotBilledToCart = useCallback((item) => {
    playAddSound();
    lastTouchedIdRef.current = item.id;
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.itemId === item.id && c.notBilled);
      const avail = Number(item.stock) || 0;
      if (idx >= 0) {
        const line = { ...prev[idx], qty: prev[idx].qty + 1 };
        const rest = prev.filter((_, i) => i !== idx);
        return [line, ...rest];
      }
      return [
        {
          itemId: item.id,
          name: item.name,
          price: 0,
          taxRate: 0,
          discount: 0,
          qty: 1,
          stock: avail,
          unit: item.unit || '',
          hsnCode: '',
          recipe: [],
          recipeOverrides: {},
          notBilled: true,
        },
        ...prev,
      ];
    });
  }, []);

  const changeQty = (itemId, delta) => {
    lastTouchedIdRef.current = itemId;
    setCart((prev) => {
      const idx = prev.findIndex(c => c.itemId === itemId);
      const line = prev[idx];
      if (line && delta > 0 && config.features?.stockAlert) {
        const newQty = line.qty + delta;
        if (newQty > line.stock) {
          setToast({
            msg: line.stock <= 0
              ? `${line.name} is out of stock.`
              : `Only ${line.stock} ${line.unit || 'unit(s)'} of ${line.name} available.`,
            severity: 'warning',
          });
          return prev;
        }
      }
      if (!line) return prev;
      const updated = { ...line, qty: Math.max(0, line.qty + delta) };
      if (updated.qty <= 0) {
        return prev.filter((c) => c.itemId !== itemId);
      }
      // Move the touched line to the top, same as a fresh scan/add
      const rest = prev.filter((_, i) => i !== idx);
      return [updated, ...rest];
    });
  };

  const setQty = (itemId, value) => {
    // Empty field — keep item in cart while user is mid-edit
    if (value === '' || value === null || value === undefined) {
      setCart((prev) => prev.map((c) => (c.itemId === itemId ? { ...c, qty: '' } : c)));
      return;
    }
    // Trailing dot (e.g. "1.") — store as string so user can finish typing decimal
    if (typeof value === 'string' && value.endsWith('.')) {
      setCart((prev) => prev.map((c) => (c.itemId === itemId ? { ...c, qty: value } : c)));
      return;
    }
    const raw = parseFloat(value);
    const q = Math.max(0, isNaN(raw) ? 0 : Math.round(raw * 1000) / 1000);
    setCart((prev) => {
      const line = prev.find(c => c.itemId === itemId);
      if (line && q > 0 && config.features?.stockAlert && q > line.stock) {
        setToast({
          msg: line.stock <= 0
            ? `${line.name} is out of stock.`
            : `Only ${line.stock} ${line.unit || 'unit(s)'} of ${line.name} available.`,
          severity: 'warning',
        });
      }
      return prev.map((c) => (c.itemId === itemId ? { ...c, qty: q } : c)).filter((c) => c.qty === '' || String(c.qty).endsWith('.') || Number(c.qty) > 0);
    });
  };

  const removeLine = (itemId) => setCart((prev) => prev.filter((c) => c.itemId !== itemId));

  // A component (e.g. "Cover") can come from more than one cart line's
  // recipe at once — the consolidated strip below the cart shows one summed
  // total per component, so editing it means touching every contributing
  // line's recipeOverrides together, not just one. zeroOutComponent removes
  // it for this sale only (does not touch the item's saved recipe);
  // resetComponent restores every contributing line back to its recipe default.
  const zeroOutComponent = (componentItemId) => {
    setCart((prev) => prev.map((c) => {
      if (!c.recipe?.some((r) => r.itemId === componentItemId)) return c;
      return { ...c, recipeOverrides: { ...(c.recipeOverrides || {}), [componentItemId]: 0 } };
    }));
  };
  const resetComponent = (componentItemId) => {
    setCart((prev) => prev.map((c) => {
      if (!c.recipe?.some((r) => r.itemId === componentItemId)) return c;
      const overrides = { ...(c.recipeOverrides || {}) };
      delete overrides[componentItemId];
      return { ...c, recipeOverrides: overrides };
    }));
  };
  // +/- adjusts the combined total directly. The whole delta is absorbed by
  // the FIRST cart line that contributes this component — every other
  // contributing line keeps its current effective deduction unchanged — so
  // the sum always lands exactly on the new total.
  const stepComponentTotal = (componentItemId, currentTotal, dir) => {
    const unit = currentTotal > 0 && currentTotal < 1 ? 0.1 : 1;
    const newTotal = Math.max(0, Math.round((currentTotal + dir * unit) * 1000) / 1000);
    setCart((prev) => {
      let applied = false;
      return prev.map((c) => {
        if (applied) return c;
        const recipeRow = c.recipe?.find((r) => r.itemId === componentItemId);
        if (!recipeRow) return c;
        const qty = Number(c.qty) || 0;
        const baseQty = Math.round((Number(recipeRow.qtyPerUnit) || 0) * qty * 1000) / 1000;
        const otherLinesTotal = currentTotal - (c.recipeOverrides?.[componentItemId] != null ? Number(c.recipeOverrides[componentItemId]) : baseQty);
        applied = true;
        return { ...c, recipeOverrides: { ...(c.recipeOverrides || {}), [componentItemId]: Math.max(0, Math.round((newTotal - otherLinesTotal) * 1000) / 1000) } };
      });
    });
  };

  const resetSale = () => {
    setCart([]);
    setCustomer(null);
    setShowCustomerPanel(false);
    setLoyaltyRedeemPoints(0);
    setLoyaltyRedeemValue(0);
    setDiscountValue('');
    setDiscountType('amount');
    setRoundOff(config.billPrintOptions?.autoRoundOff ? 1 : 0);
    setSearch('');
    setActiveCat('All');
    setPayMode('Cash');
    setCashReceived('');
    setSplitCash('');
    setSplitBank('');
    setAdvance('');
    setAdvanceMode('Cash');
    setAdvanceSplitCash('');
    setAdvanceSplitBank('');
    setSaleType(config.defaultSaleTypePOS ?? 'paid');
    setObStep('products');
    setTimeout(() => searchRef.current?.focus(), 50);
  };

  // ── One by One mode step navigation ────────────────────────────────────
  const obGoToCustomer = () => {
    if (!cart.length) return;
    setObStep('customer');
    setTimeout(() => customerInputRef.current?.querySelector('input')?.focus(), 50);
  };
  const obGoToCheckout = () => {
    setObStep('checkout');
  };
  const obGoBack = () => {
    setObStep((s) => (s === 'checkout' ? 'customer' : 'products'));
  };

  const handleScan = useCallback((code) => {
    const found = allItems.find((i) => i.barcode === code || String(i.id) === code || i.itemCode === code);
    if (found) {
      addToCart(found);
      setToast({ msg: `Added ${found.name}`, severity: 'success' });
    } else {
      setToast({ msg: `No item for code "${code}"`, severity: 'warning' });
    }
  }, [allItems, addToCart]);

  // ── Global POS keyboard shortcuts — stable registration, reads live refs ──
  useEffect(() => {
    const isInput = () => {
      const el = document.activeElement;
      if (!el) return false;
      return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
    };

    // ── Barcode scanner buffer (keydown capture) ────────────────────────────
    // Uses keydown (not keypress) because keypress does not fire at all when
    // focus is on a non-text element (e.g. a sidebar nav button focused right
    // before switching back to this tab) — that silently broke every scan
    // until the user manually refocused a text input.
    const buf = kbBufferRef.current;
    const onKeyDownScan = (e) => {
      const key = e.key;
      if (key !== 'Enter') {
        if (key.length === 1) {
          const now = Date.now();
          buf.push({ char: key, time: now });
          while (buf.length && now - buf[0].time > 300) buf.shift();
        }
        return;
      }
      // The product search box already has its own Enter handler
      // (handleSearchEnter) that adds the matched item — skip here to
      // avoid adding the same scanned item twice.
      if (document.activeElement === searchRef.current) {
        buf.length = 0;
        return;
      }
      if (buf.length >= 4) {
        let allFast = true;
        for (let i = 1; i < buf.length; i++) {
          if (buf[i].time - buf[i - 1].time >= 50) { allFast = false; break; }
        }
        if (allFast && !localDialogOpenRef.current) {
          const code = buf.map(b => b.char).join('');
          buf.length = 0;
          e.preventDefault();
          e.stopPropagation();
          handleScanRef.current?.(code);
          return;
        }
      }
      buf.length = 0;
    };

    // ── Shortcut handler (keydown capture) ────────────────────────────────
    const onKeyDown = (e) => {
      // Barcode scan buffering/detection runs first so a scanner's Enter is
      // consumed here before any shortcut logic below can react to it.
      onKeyDownScan(e);
      if (e.defaultPrevented) return;

      const key = e.key;
      const cmd = e.metaKey || e.ctrlKey;
      const inInput = isInput();
      // Only count dialogs that are actually visible (not CSS-hidden mobile
      // panels) — OR still within the post-close cooldown window (see
      // dialogCooldownUntilRef), since a quick-add dialog closes ASYNCHRONOUSLY
      // (its save is an awaited addItem() call) and a stray/repeated Enter
      // landing in that gap must not fall through to shortcuts like "Enter
      // completes sale" below.
      const anyDialog = Date.now() < dialogCooldownUntilRef.current || Array.from(document.querySelectorAll('[role="dialog"]')).some(
        (el) => el.offsetParent !== null || el.getBoundingClientRect().width > 0
      );

      // Any open dialog: Enter activates the focused button if there is one,
      // otherwise falls back to the print-confirm dialog's primary action.
      if (anyDialog) {
        if (key === 'Enter') {
          const active = document.activeElement;
          if (active && (active.tagName === 'BUTTON' || active.getAttribute('role') === 'button')) {
            return;
          }
          e.preventDefault();
          printPromptYesRef.current?.click();
        }
        return;
      }

      // ── ⌘+Enter → Complete sale ──────────────────────────────────────────
      if (key === 'Enter' && cmd) {
        e.preventDefault();
        e.stopPropagation();
        const c = cartRef.current;
        if (c.length > 0 && !savingRef.current) completeSaleRef.current?.();
        return;
      }

      // ── One by One mode: Enter advances to the next step ──────────────────
      // Products → Customer → Checkout → (complete sale), one Enter press
      // (or the matching "Continue"/"Complete Sale" button) at a time so the
      // whole flow needs almost no mouse/touch. Checked before the normal
      // "Enter completes sale" branch below since that branch's own
      // behavior (Enter = complete sale once a customer is picked) IS this
      // mode's final step, just reached deliberately rather than as soon as
      // both a customer and cart items exist.
      if (oneByOneModeRef.current && key === 'Enter' && !cmd) {
        const step = obStepRef.current;
        if (step === 'products') {
          // The product search box's own Enter (add matched item) already
          // consumed this keystroke via handleSearchEnter if focused there —
          // only advance when Enter reaches here un-consumed (e.g. pressed
          // after arrow-navigating the grid with no match, or with focus
          // elsewhere on the page).
          if (!inInput && cartRef.current.length > 0) {
            e.preventDefault();
            e.stopPropagation();
            obGoToCustomerRef.current?.();
          }
          return;
        }
        if (step === 'customer') {
          // Deliberately requires !inInput, same as the checkout-step Enter
          // shortcut below — this listener runs in the CAPTURE phase on
          // window, i.e. strictly before the customer Autocomplete's own
          // Enter-to-select handling, so advancing on every Enter regardless
          // of focus would steal the keystroke Autocomplete needs to
          // actually select the highlighted customer. First Enter (while
          // focused in the field) selects the customer as normal; a second
          // Enter — after Autocomplete closes its dropdown and focus
          // settles, or after Tab/click away — advances to checkout. Also
          // reachable for a deliberate walk-in sale (no customer picked).
          if (!inInput) {
            e.preventDefault();
            e.stopPropagation();
            obGoToCheckoutRef.current?.();
          }
          return;
        }
        // step === 'checkout' falls through to the normal complete-sale
        // branch below.
      }

      // ── Enter (no modifier) → Complete sale, once a customer is picked ────
      // Only when NOT focused in a text field — the product search box and
      // qty inputs already have their own Enter behavior (add matched item /
      // confirm qty), and this must never compete with those. Once a
      // customer is selected, Enter elsewhere on the page finishes the sale
      // the same way ⌘+Enter already does, without needing the modifier.
      // In One by One mode this is reachable only from the checkout step
      // (handled above), since products/customer steps consume Enter to
      // advance instead.
      if (key === 'Enter' && !cmd && !inInput && (!oneByOneModeRef.current || obStepRef.current === 'checkout')) {
        const c = cartRef.current;
        if (customerRef.current && c.length > 0 && !savingRef.current) {
          e.preventDefault();
          e.stopPropagation();
          completeSaleRef.current?.();
          return;
        }
      }

      // ── ⌘+M → cycle payment Mode ─────────────────────────────────────────
      if (key === 'm' && cmd) {
        e.preventDefault();
        e.stopPropagation();
        const modes = PAY_MODES.map(p => p.value);
        setPayMode(prev => modes[(modes.indexOf(prev) + 1) % modes.length]);
        return;
      }

      // ── ⌘+K → focus Customer search ──────────────────────────────────────
      if (key === 'k' && cmd) {
        e.preventDefault();
        e.stopPropagation();
        const custInput = customerInputRef.current?.querySelector('input');
        if (custInput) { custInput.focus(); custInput.select(); }
        return;
      }

      // ── ⌘+E → set Exact cash ──────────────────────────────────────────────
      if (key === 'e' && cmd) {
        e.preventDefault();
        e.stopPropagation();
        setCashReceived(String(totalsRef.current.grandTotal));
        setPayMode('Cash');
        return;
      }

      // ── ⌘+R → Reset / clear sale ──────────────────────────────────────────
      if (key === 'r' && cmd) {
        e.preventDefault();
        e.stopPropagation();
        if (cartRef.current.length > 0) resetSaleRef.current?.();
        return;
      }

      // ── ⌘+Y → toggle sale tYpe (Cash/Bank ↔ Credit) ─────────────────────
      if (key === 'y' && cmd) {
        e.preventDefault();
        e.stopPropagation();
        setSaleType(saleTypeRef.current === 'paid' ? 'credit' : 'paid');
        return;
      }

      // ── +/- → bump qty of the last scanned/added/adjusted cart line ───────
      // Checked before the inInput gate below is applied further down, but
      // still skipped while typing in a text field (e.g. search, qty box)
      // so normal typing of "+"/"-" isn't hijacked.
      if (!inInput && (key === '+' || key === '-' || key === 'Add' || key === 'Subtract')) {
        const c = cartRef.current;
        if (c.length > 0) {
          e.preventDefault();
          const targetId = lastTouchedIdRef.current ?? c[0].itemId;
          const targetExists = c.some(l => l.itemId === targetId);
          changeQtyRef.current?.(targetExists ? targetId : c[0].itemId, (key === '+' || key === 'Add') ? 1 : -1);
        }
        return;
      }

      // Everything below only fires when NOT in an input
      if (inInput) return;

      // ── ? → toggle hints panel ────────────────────────────────────────────
      if (key === '?') {
        setShowKbHints(v => !v);
        return;
      }

      // ── Escape → blur back to grid / clear search ─────────────────────────
      if (key === 'Escape') {
        if (searchRef2.current) { setSearch(''); }
        else { setKbFocusedIdx(-1); searchRef.current?.focus(); }
        return;
      }

      // ── Arrow keys → navigate product grid ───────────────────────────────
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) {
        e.preventDefault();
        // Read the ACTUAL resolved column count from the grid's computed
        // style instead of re-deriving it from a hardcoded pixel divisor —
        // the grid's minmax() basis differs per breakpoint (170/180/200/220px,
        // plus a fixed 2-column layout at xs), so a flat `/200` under- or
        // over-counted columns at every breakpoint except lg, making
        // ArrowUp/ArrowDown jump to the wrong tile. gridTemplateColumns
        // resolves to a space-separated track list (e.g. "180px 180px..."),
        // so splitting it directly gives the true column count for free.
        const gridEl = document.querySelector('[data-pos-grid]');
        const cols = gridEl
          ? Math.max(1, getComputedStyle(gridEl).gridTemplateColumns.split(' ').filter(Boolean).length)
          : 2;
        const fl = filteredRef.current;
        setKbFocusedIdx(prev => {
          const next = prev < 0 ? 0
            : key === 'ArrowRight' ? Math.min(fl.length - 1, prev + 1)
            : key === 'ArrowLeft'  ? Math.max(0, prev - 1)
            : key === 'ArrowDown'  ? Math.min(fl.length - 1, prev + cols)
            :                        Math.max(0, prev - cols);
          setTimeout(() => kbTileRefs.current[next]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 0);
          return next;
        });
        return;
      }

      // ── Enter → add keyboard-focused tile to cart ────────────────────────
      if (key === 'Enter' && kbFocusedIdxRef.current >= 0) {
        const item = filteredRef.current[kbFocusedIdxRef.current];
        if (item) addToCartRef.current?.(item);
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, []); // stable — reads everything via refs

  // Listen for scans routed from other tabs (via Layout global scanner)
  useEffect(() => {
    const onGlobalScan = (e) => {
      if (searchRef.current) searchRef.current.value = '';
      handleScanRef.current?.(e.detail);
    };
    window.addEventListener('barcode-scan', onGlobalScan);
    return () => window.removeEventListener('barcode-scan', onGlobalScan);
  }, []);

  const handleSearchEnter = (e) => {
    if (e.key !== 'Enter') return;
    const q = search.trim();
    if (!q) return;
    const exact = allItems.find((i) => i.barcode === q || i.itemCode === q);
    if (exact) {
      addToCart(exact);
      setSearch('');
      setToast({ msg: `Added ${exact.name}`, severity: 'success' });
    } else if (filtered.length > 0) {
      // Previously only fired when the search matched EXACTLY one item —
      // any broader match (e.g. "sh" matching Shirt/Shoes/Shampoo) required
      // clicking the tile manually instead of just pressing Enter. Now adds
      // the top/nearest match (first in the filtered+sorted list) same as
      // the item/party Autocomplete fields (autoHighlight+autoSelect).
      addToCart(filtered[0]);
      setSearch('');
      setToast({ msg: `Added ${filtered[0].name}`, severity: 'success' });
    }
  };

  const totals = useMemo(() => {
    let subtotal = 0;
    let taxAmount = 0;
    cart.forEach((c) => {
      if (c.notBilled) return;
      const lineDisc = Math.min(100, Math.max(0, Number(c.discount) || 0));
      const lineBase = c.price * (Number(c.qty) || 0) * (1 - lineDisc / 100);
      subtotal += lineBase;
      taxAmount += lineBase * (c.taxRate / 100);
    });
    const dVal = Number(discountValue) || 0;
    const discountAmount = discountType === 'amount'
      ? Math.min(dVal, subtotal)
      : subtotal * (Math.min(100, Math.max(0, dVal)) / 100);
    const discPct = subtotal > 0 ? (discountAmount / subtotal) * 100 : 0;
    const netTotal = subtotal - discountAmount + taxAmount;
    let roundOffAmount = 0;
    if (roundOff > 0) {
      const target = getRoundUpSeq(netTotal)[roundOff - 1];
      if (target != null) roundOffAmount = target - netTotal;
    } else if (roundOff < 0) {
      const target = getRoundDownSeq(netTotal)[Math.abs(roundOff) - 1];
      if (target != null) roundOffAmount = target - netTotal;
    }
    const grandTotal = Math.max(0, netTotal + roundOffAmount - loyaltyRedeemValue);
    return { subtotal, taxAmount, discPct, discountAmount, netTotal, roundOffAmount, grandTotal };
  }, [cart, discountValue, discountType, roundOff, loyaltyRedeemValue]);
  // The amount the "Show Payment QR" button/dialog should ask for — for a
  // Split payment only the bank/UPI portion is being paid via QR (e.g. ₹500
  // total, ₹200 cash + ₹300 QR), so the QR must not ask for the full total.
  const paymentQrAmount = payMode === 'Split' ? (Number(splitBank) || 0) : totals.grandTotal;

  // Sync all live refs on every render — stable keydown listener reads these instead of closure vars
  totalsRef.current = totals;
  cartRef.current = cart;
  savingRef.current = saving;
  kbFocusedIdxRef.current = kbFocusedIdx;
  filteredRef.current = pagedItems;
  searchRef2.current = search;
  payModeRef.current = payMode;
  saleTypeRef.current = saleType;
  addToCartRef.current = addToCart;
  handleScanRef.current = handleScan;
  resetSaleRef.current = resetSale;
  changeQtyRef.current = changeQty;
  customerRef.current = customer;
  oneByOneModeRef.current = oneByOneMode;
  obStepRef.current = obStep;
  obGoToCustomerRef.current = obGoToCustomer;
  obGoToCheckoutRef.current = obGoToCheckout;
  localDialogOpenRef.current = !!printPrompt || quickAddCustomer.open || newItemDialog.open || scannerOpen || addInventoryDialog || editCustomerOpen || paymentQrOpen;

  const itemCount = cart.reduce((s, c) => s + (parseFloat(c.qty) || 0), 0);

  // Empty cashReceived = exact (grand total) by default
  const cashNum = cashReceived === '' ? totals.grandTotal : (Number(cashReceived) || 0);
  const change = payMode === 'Cash' ? Math.max(0, cashNum - totals.grandTotal) : 0;
  const shortAmount = payMode === 'Cash' ? Math.max(0, totals.grandTotal - cashNum) : 0;
  const short = payMode === 'Cash' && cashNum < totals.grandTotal;
  const cashEntered = payMode === 'Cash' && cashReceived !== '';
  const quickCash = useMemo(() => {
    const tot = totals.grandTotal;
    const notes = [tot, Math.ceil(tot / 50) * 50, Math.ceil(tot / 100) * 100, Math.ceil(tot / 500) * 500, Math.ceil(tot / 500) * 500 + 500];
    return notes.filter((v, i, arr) => v > 0 && arr.indexOf(v) === i).slice(0, 4);
  }, [totals.grandTotal]);

  const completeSale = async () => {
    const paymentMode = payMode;
    const splitCashAmt = Number(splitCash) || 0;
    const splitBankAmt = Number(splitBank) || 0;
    if (!cart.length || saving) return;
    if (!businessId) {
      await showAlert({ title: 'No business', message: 'No active business selected.', variant: 'warning' });
      return;
    }
    if (!canWrite) {
      await showAlert({ title: 'Subscription inactive', message: 'Please renew your subscription to record sales.', variant: 'warning' });
      return;
    }
    setSaving(true);
    try {
      const now = new Date();
      const date = now.toISOString().slice(0, 10);
      const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const invoiceNumber = nextInvoiceNumber(getItems('sales'), businessId, config.invoiceNumberConfig?.salesPrefix, config.invoiceNumberConfig?.salesStartingNumber);

      const items = cart.filter(c => Number(c.qty) > 0).map((c) => {
        const qty = Number(c.qty);
        const lineDisc = Math.min(100, Math.max(0, Number(c.discount) || 0));
        return {
          itemId: c.itemId,
          name: c.name,
          qty,
          price: c.price,
          taxRate: c.taxRate,
          cgstRate: c.taxRate / 2,
          sgstRate: c.taxRate / 2,
          igstRate: c.taxRate,
          discountPercent: lineDisc,
          hsnCode: c.hsnCode || '',
          unit: c.unit || '',
          total: c.notBilled ? 0 : c.price * qty * (1 - lineDisc / 100) * (1 + c.taxRate / 100),
          recipe: Array.isArray(c.recipe) ? c.recipe : [],
          recipeOverrides: c.recipeOverrides || {},
          notBilled: !!c.notBilled,
        };
      });

      const transactionData = {
        businessId,
        partyId: customer?.id || '',
        partyName: customer?.name || 'Cash & Carry',
        type: 'Sales',
        date,
        time,
        invoiceNumber,
        items,
        description: '',
        noGST: false,
        discountPercent: totals.discPct,
        discountAmount: totals.discountAmount,
        discountType,
        discountValue: Number(discountValue) || 0,
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        roundOffAmount: totals.roundOffAmount || 0,
        totalAmount: totals.grandTotal,
        advance: saleType === 'credit' ? (Number(advance) || 0) : 0,
        advanceMode: saleType === 'credit' && Number(advance) > 0 ? advanceMode : null,
        advanceSplit: saleType === 'credit' && Number(advance) > 0 && advanceMode === 'Split'
          ? { cash: Number(advanceSplitCash) || 0, bank: Number(advanceSplitBank) || 0 }
          : null,
        dueDate: '',
        taxMode: 'exclusive',
        paymentMode,
        ...(paymentMode === 'Split' && {
          paymentSplit: { cash: splitCashAmt, bank: splitBankAmt, bankMode: 'Bank' },
        }),
        saleType,
        status: saleType === 'paid' ? 'paid' : 'unpaid',
        source: 'POS',
        billedBy: selectedBilledBy || ownerName,
        ...(loyaltyRedeemPoints > 0 && {
          loyaltyPointsRedeemed: loyaltyRedeemPoints,
          loyaltyRedeemValue,
        }),
      };

      // Compute loyalty snapshot before saving so it's persisted on the transaction
      if (customer?.id && config.features?.loyalty) {
        const loyalty = config.loyalty || {};
        const pointsPerRupee = Number(loyalty.pointsPerRupee) || 0;
        const earnEveryRupees = Number(loyalty.earnEveryRupees) || 1;
        const earned = Math.floor((totals.grandTotal / earnEveryRupees) * pointsPerRupee);
        const currentPartyData = getItems('parties').find(p => p.id === customer.id);
        const prevPoints = Number(currentPartyData?.loyaltyPoints) || 0;
        const afterRedeem = prevPoints - loyaltyRedeemPoints;
        const newPoints = Math.max(0, afterRedeem) + earned;
        transactionData._loyaltySnapshot = {
          earned,
          balance: newPoints,
          programName: loyalty.programName || 'Reward Points',
        };
        transactionData.loyaltyPointsEarned = earned;
        transactionData.loyaltyBalanceAfter = newPoints;
      }

      // Stock quantity check gated by feature flag — a recipe line (e.g.
      // Tomato Rice) has no stock of its own, so it's expanded into its
      // components' required quantities (respecting any per-sale
      // recipeOverrides) instead of checking the line itself.
      if (config.features?.stockAlert) {
        const stockSnapshot = getItems('items');
        const requiredByItemId = {};
        cart.forEach((c) => {
          const q = Number(c.qty) || 0;
          if (c.recipe?.length > 0) {
            c.recipe.forEach((r) => {
              const override = c.recipeOverrides?.[r.itemId];
              const compQty = override != null ? Number(override) : (Number(r.qtyPerUnit) || 0) * q;
              if (compQty > 0) {
                const comp = stockSnapshot.find(i => String(i.id) === String(r.itemId));
                const key = r.itemId;
                if (!requiredByItemId[key]) requiredByItemId[key] = { name: comp?.name || 'Unknown item', qty: 0, avail: comp ? (Number(comp.stock) || 0) : 0 };
                requiredByItemId[key].qty += compQty;
              }
            });
          } else if (c.itemId) {
            const si = stockSnapshot.find(i => i.id === c.itemId);
            const avail = si ? (Number(si.stock) || 0) : 0;
            requiredByItemId[c.itemId] = { name: c.name, qty: q, avail };
          }
        });
        const overStockLines = Object.values(requiredByItemId).filter(l => l.qty > l.avail);
        if (overStockLines.length > 0) {
          const lines = overStockLines.map(l =>
            l.avail <= 0
              ? `${l.name} (out of stock)`
              : `${l.name} (need ${l.qty}, only ${l.avail} left)`
          );
          const proceed = await confirm({
            title: 'Insufficient stock',
            message: `${lines.join('\n')} — proceed anyway?`,
            confirmLabel: 'Proceed',
            cancelLabel: 'Cancel',
          });
          if (!proceed) {
            setSaving(false);
            return;
          }
        }
      }

      const saved = addItem('sales', transactionData);
      if (!saved) {
        const exists = getItems('sales').find(
          (tx) => tx.invoiceNumber === invoiceNumber && tx.partyId === transactionData.partyId,
        );
        if (!exists) {
          await showAlert({ title: 'Save failed', message: 'Could not save the sale. Please try again.', variant: 'danger' });
          setSaving(false);
          return;
        }
      }

      {
        // A recipe cart line (e.g. Tomato Rice) has no stock of its own —
        // deduct its components instead, respecting any per-sale
        // recipeOverrides nudged in ConsolidatedPosRecipeStrip. Batched into
        // one updateItems call instead of N sequential updateItem calls.
        const stockSnapshot = getItems('items');
        const deltas = {};
        cart.forEach((c) => {
          const q = Number(c.qty) || 0;
          if (c.recipe?.length > 0) {
            c.recipe.forEach((r) => {
              const override = c.recipeOverrides?.[r.itemId];
              const compQty = override != null ? Number(override) : (Number(r.qtyPerUnit) || 0) * q;
              if (compQty > 0) deltas[r.itemId] = (deltas[r.itemId] || 0) - compQty;
            });
          } else if (c.itemId) {
            deltas[c.itemId] = (deltas[c.itemId] || 0) - q;
          }
        });
        const stockUpdates = [];
        for (const [itemId, delta] of Object.entries(deltas)) {
          if (delta === 0) continue;
          const stockItem = stockSnapshot.find((i) => String(i.id) === itemId);
          if (stockItem) stockUpdates.push({ id: stockItem.id, stock: (Number(stockItem.stock) || 0) + delta });
        }
        if (stockUpdates.length) updateItems('items', stockUpdates);
      }

      // Record advance as a PaymentIn entry
      const advanceAmt = saleType === 'credit' ? (Number(advance) || 0) : 0;
      if (advanceAmt > 0 && customer?.id) {
        addItem('payments', {
          businessId,
          partyId: customer.id,
          partyName: customer.name || 'Unknown',
          type: 'PaymentIn',
          totalAmount: advanceAmt,
          date,
          paymentMode: advanceMode,
          ...(advanceMode === 'Split' && {
            paymentSplit: { cash: Number(advanceSplitCash) || 0, bank: Number(advanceSplitBank) || 0 },
          }),
          referenceNo: `ADV-${invoiceNumber}`,
          notes: `Advance received for invoice ${invoiceNumber}`,
        });
      }

      // Carry the remaining balance (total - advance) to the customer's party
      // balance — only for a credit sale. A Cash/Bank ('paid') sale is fully
      // settled via Payment Mode at the moment of sale, so it must not also
      // add its total onto the party's running balance (that permanently
      // inflates Dashboard's "To Collect" by the full amount of every
      // immediately-paid sale to a named customer even though nothing is
      // actually outstanding). Loyalty points, however, still apply
      // regardless of sale type, so that update always runs.
      if (customer?.id) {
        const currentPartyData = getItems('parties').find(p => p.id === customer.id);
        if (currentPartyData) {
          const partyUpdates = {};
          if (saleType === 'credit') {
            partyUpdates.balance = (Number(currentPartyData.balance) || 0) + totals.grandTotal - advanceAmt;
          }
          if (transactionData.loyaltyBalanceAfter !== undefined) {
            partyUpdates.loyaltyPoints = transactionData.loyaltyBalanceAfter;
          }
          if (Object.keys(partyUpdates).length > 0) updateItem('parties', customer.id, partyUpdates);
        }
      }

      setToast({ msg: `Sale completed — ${money(totals.grandTotal)} (${paymentMode})`, severity: 'success' });
      setPrintPrompt({ tx: transactionData });
      resetSale();
    } finally {
      setSaving(false);
    }
  };

  // Wire completeSaleRef after completeSale is defined (read by stable keyboard handler)
  completeSaleRef.current = completeSale;

  const confirmPrint = () => {
    if (!printPrompt) return;
    setPrintingTx(printPrompt.tx);
    setPrintPrompt(null);
    setPrintTrigger((n) => n + 1);
  };

  // ── Shared style tokens ────────────────────────────────────────────────────
  const teal = BRAND.teal;
  const tealDark = BRAND.tealDark;
  const tealLight = BRAND.tealLight;
  const emerald = BRAND.emerald;
  const tealSoft = alpha(teal, 0.08);
  const tealBorder = alpha(teal, 0.2);
  const errorColor = theme.palette.error.main;
  const successColor = theme.palette.success.main;

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        height: { xs: 'auto', md: 'calc(100vh - 64px)' },
        minHeight: { xs: 'calc(100vh - 120px)', md: 0 },
        gap: { xs: 1.5, md: 2 },
        // Break out of Layout's padding to use full width
        mx: { xs: -1.5, sm: -2, md: -2.5 },
        px: { xs: 1, sm: 1.5, md: 2 },
        pt: { xs: 1, sm: 1.5, md: 2 },
        pb: { xs: 11, sm: 2 },
        overflow: { md: 'hidden' },
      }}
    >
      {/* ── LEFT: product search + grid ─────────────────────────────────────── */}
      {/* One by One mode: stays visible and mounted on every step (cart
          position never moves) — only disabled (dimmed + non-interactive)
          once past the Products step, instead of being hidden away. On a
          stacked (phone/tablet) layout, though, dimming alone still leaves a
          full screen-height of dead, greyed-out product grid sitting in the
          document flow above the cart — the user had to scroll past it on
          every Customer/Checkout step just to reach the next control. On
          desktop this costs nothing since it sits side-by-side with the
          cart, so it's only collapsed here on the stacked layout. */}
      <Box sx={{
        flex: 1, minWidth: 0, flexDirection: 'column', minHeight: 0,
        display: 'flex',
        position: 'relative',
        ...(oneByOneMode && obStep !== 'products' ? (
          isStackedLayout
            ? { display: 'none' }
            : { opacity: 0.45, pointerEvents: 'none', filter: 'grayscale(0.3)' }
        ) : {}),
      }}>

        {/* Search row */}
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
          <Box sx={{ position: 'relative', flex: 1 }}>
            <TextField
              inputRef={searchRef}
              fullWidth
              size="small"
              placeholder={t('pos.searchProducts')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchEnter}
              autoComplete="off"
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: '10px',
                  bgcolor: 'background.paper',
                  boxShadow: `0 1px 4px ${alpha('#000', 0.06)}`,
                  '&.Mui-focused': {
                    boxShadow: `0 0 0 3px ${alpha(teal, 0.15)}, 0 1px 4px ${alpha('#000', 0.06)}`,
                  },
                },
              }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search size={16} style={{ color: alpha('#000', 0.35) }} />
                    </InputAdornment>
                  ),
                  endAdornment: search ? (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => { setSearch(''); searchRef.current?.focus(); }}
                        sx={{ color: 'text.disabled', '&:hover': { color: 'text.primary' } }}>
                        <X size={14} />
                      </IconButton>
                    </InputAdornment>
                  ) : null,
                },
              }}
            />
          </Box>
          {barcodeEnabled && (
            <Tooltip title="Camera Scanner">
              <Button
                variant="outlined"
                onClick={() => setScannerOpen(true)}
                startIcon={<ScanLine size={16} />}
                sx={{
                  px: 1.5, borderRadius: '10px',
                  borderColor: tealBorder,
                  color: teal,
                  bgcolor: tealSoft,
                  textTransform: 'none',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  minWidth: 0,
                  boxShadow: `0 1px 4px ${alpha('#000', 0.05)}`,
                  '&:hover': { bgcolor: alpha(teal, 0.14), borderColor: teal },
                  '& .MuiButton-startIcon': { mr: { xs: 0, sm: 1 } },
                }}
              >
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Camera Scanner</Box>
              </Button>
            </Tooltip>
          )}
          <Tooltip title={showKbHints ? 'Hide keyboard shortcuts' : 'Keyboard shortcuts (?)'}>
            <IconButton
              size="small"
              onClick={() => setShowKbHints(v => !v)}
              sx={{
                flexShrink: 0,
                width: 36, height: 36,
                borderRadius: '10px',
                border: `1.5px solid`,
                borderColor: showKbHints ? teal : 'divider',
                bgcolor: showKbHints ? alpha(teal, 0.1) : 'background.paper',
                color: showKbHints ? teal : 'text.secondary',
                fontWeight: 900, fontSize: '0.85rem', fontFamily: 'monospace',
                '&:hover': { borderColor: teal, color: teal, bgcolor: alpha(teal, 0.06) },
              }}
            >
              ?
            </IconButton>
          </Tooltip>
        </Stack>

        {/* Keyboard shortcut hints bar */}
        {showKbHints && (
          <Box sx={{
            mb: 1.5, px: 1.5, py: 1.25, borderRadius: '10px',
            bgcolor: alpha(teal, 0.05), border: `1px solid ${alpha(teal, 0.18)}`,
          }}>
            <Typography sx={{ fontSize: '0.68rem', fontWeight: 800, color: teal, mb: 0.75, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Keyboard Shortcuts
            </Typography>
            {[
              { group: 'Items', items: [['↑↓←→', 'Navigate product grid'], ['Enter', 'Add focused item to cart'], ['+ / -', 'Adjust qty of last scanned item'], ['Esc', 'Clear search']] },
              { group: 'Customer & Payment', items: [['⌘K', 'Focus Customer search'], ['⌘M', 'Cycle payment Mode'], ['⌘E', 'Set Exact cash amount'], ['⌘Y', 'Toggle Cash/Credit sale']] },
              { group: 'Sale', items: [['⌘Enter', 'Complete sale'], ['⌘R', 'Reset / clear sale'], ['?', 'Toggle this help']] },
            ].map(({ group, items }) => (
              <Box key={group} sx={{ mb: 0.75 }}>
                <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.4 }}>{group}</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                  {items.map(([key, label]) => (
                    <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                      <Box component="span" sx={{
                        px: 0.65, py: 0.2, borderRadius: '4px', fontSize: '0.67rem', fontWeight: 800,
                        bgcolor: 'background.paper', border: `1px solid ${alpha(teal, 0.28)}`, color: teal,
                        boxShadow: `0 1px 2px ${alpha('#000', 0.07)}`, fontFamily: 'monospace', whiteSpace: 'nowrap',
                      }}>{key}</Box>
                      <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', fontWeight: 500, whiteSpace: 'nowrap' }}>{label}</Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            ))}
          </Box>
        )}

        {/* Category filter row */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <Box sx={{
            display: 'flex', gap: 0.6, overflowX: 'auto', pb: 0.5, flexGrow: 1, minWidth: 0,
            '&::-webkit-scrollbar': { display: 'none' }, scrollbarWidth: 'none',
          }}>
            {categories.length > 1 && categories.map((cat) => {
              const active = activeCat === cat;
              const color = cat === 'All' ? teal : getCatColor(cat, categories);
              return (
                <Box
                  key={cat}
                  onClick={() => setActiveCat(cat)}
                  sx={{
                    flexShrink: 0,
                    px: 1.5, py: 0.5,
                    borderRadius: '100px',
                    fontSize: '0.76rem',
                    fontWeight: active ? 700 : 500,
                    cursor: 'pointer',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                    border: '1.5px solid',
                    transition: 'all 0.15s ease',
                    ...(active ? {
                      background: `linear-gradient(135deg, ${color} 0%, ${alpha(color, 0.75)} 100%)`,
                      color: '#fff',
                      borderColor: 'transparent',
                      boxShadow: `0 2px 8px ${alpha(color, 0.35)}`,
                    } : {
                      bgcolor: 'background.paper',
                      color: 'text.secondary',
                      borderColor: 'divider',
                      '&:hover': { borderColor: color, color: color, bgcolor: alpha(color, 0.06) },
                    }),
                  }}
                >
                  {cat}
                </Box>
              );
            })}
          </Box>
          {!locked && order.length > 0 && (
            <Tooltip title="Reset to default order">
              <IconButton size="small" onClick={resetOrder}
                sx={{ color: 'text.secondary', borderRadius: '8px', border: '1px solid', borderColor: 'divider' }}>
                <RotateCcw size={14} />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title={locked ? 'Unlock to drag & reorder products' : 'Lock product order'}>
            <Button
              size="small"
              onClick={toggleLock}
              startIcon={locked ? <Lock size={13} /> : <LockOpen size={13} />}
              variant={locked ? 'text' : 'contained'}
              color={locked ? 'inherit' : 'primary'}
              sx={{
                flexShrink: 0, textTransform: 'none', fontWeight: 600,
                minWidth: 0, px: 1.25, borderRadius: '8px',
                color: locked ? 'text.disabled' : undefined,
                fontSize: '0.75rem',
              }}
            >
              {locked ? t('pos.locked') : t('pos.arrange')}
            </Button>
          </Tooltip>
        </Box>

        {!locked && (
          <Typography variant="caption" sx={{
            color: teal, mb: 1, display: 'block', fontWeight: 600,
            bgcolor: alpha(teal, 0.06), px: 1.5, py: 0.75, borderRadius: '8px',
            border: `1px dashed ${alpha(teal, 0.3)}`,
          }}>
            Drag products to reorder · put best-sellers first
            {search.trim() ? ' (clear search to drag)' : ''}
          </Typography>
        )}

        {/* Product tiles */}
        <Box
          data-pos-grid
          sx={{
            flex: 1,
            minHeight: { xs: 240, md: 0 },
            overflowY: { xs: 'visible', md: 'auto' },
            display: 'grid',
            gridTemplateColumns: {
              xs: 'repeat(2, 1fr)',
              sm: 'repeat(auto-fill, minmax(170px, 1fr))',
              md: 'repeat(auto-fill, minmax(180px, 1fr))',
              lg: 'repeat(auto-fill, minmax(200px, 1fr))',
              xl: 'repeat(auto-fill, minmax(220px, 1fr))',
            },
            gap: { xs: 1, sm: 1.5, md: 2 },
            alignContent: 'start',
            pr: { md: 0.5 },
          }}
        >
          {filtered.length === 0 ? (
            <Box sx={{ gridColumn: '1 / -1', textAlign: 'center', py: 8, color: 'text.secondary' }}>
              <Box sx={{
                width: 64, height: 64, borderRadius: '50%',
                bgcolor: alpha(teal, 0.08),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                mx: 'auto', mb: 2,
              }}>
                <Package size={28} style={{ color: alpha(teal, 0.45) }} />
              </Box>
              <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                {allItems.length === 0 ? t('pos.noProductsYet') : t('pos.noMatch')}
              </Typography>
              <Button
                variant="outlined"
                size="small"
                startIcon={<Plus size={14} />}
                onClick={() => setNewItemDialog({ open: true, name: search.trim() })}
                sx={{
                  mt: 2, fontWeight: 700, textTransform: 'none', borderRadius: '8px',
                  borderColor: tealBorder, color: teal,
                  '&:hover': { bgcolor: tealSoft, borderColor: teal },
                }}
              >
                {search.trim() ? `Create "${search.trim()}"` : 'New Item'}
              </Button>
            </Box>
          ) : (
            pagedItems.map((item, tileIdx) => (
              <ProductTile
                key={item.id}
                item={item}
                inCart={cartQtyMap.get(item.id) || 0}
                kbFocused={kbFocusedIdx === tileIdx}
                catColor={item.category ? getCatColor(item.category, categories) : teal}
                canDrag={canDrag}
                teal={teal}
                tealLight={tealLight}
                tealDark={tealDark}
                errorColor={errorColor}
                tileRef={el => { kbTileRefs.current[tileIdx] = el; }}
                onTileClick={addToCart}
                onDragStart={handleTileDragStart}
                onDrop={handleDrop}
              />
            ))
          )}
        </Box>

        {totalPages > 1 && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, pt: 1.5, flexShrink: 0 }}>
            <Pagination
              count={totalPages}
              page={productPage + 1}
              onChange={(_, p) => {
                setProductPage(p - 1);
                setKbFocusedIdx(-1);
                document.querySelector('[data-pos-grid]')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
              }}
              color="standard"
              size={isMobile ? 'small' : 'medium'}
              siblingCount={isMobile ? 0 : 1}
              sx={{
                '& .MuiPaginationItem-root.Mui-selected': {
                  bgcolor: teal, color: '#fff', '&:hover': { bgcolor: tealDark },
                },
              }}
            />
          </Box>
        )}

        {/* One by One mode — step 1 of 3: advance to Customer once the cart
            has at least one item. Enter (outside any input) does the same.
            Only shown on the Products step itself — once past it, the whole
            product panel (including this button) is dimmed/disabled above,
            not hidden. */}
        {oneByOneMode && obStep === 'products' && (
          <Box sx={{ pt: 1.25, flexShrink: 0 }}>
            <Button
              fullWidth
              variant="contained"
              size="large"
              disabled={cart.length === 0}
              onClick={obGoToCustomer}
              endIcon={<ChevronRight size={18} />}
              sx={{
                py: 1.5, fontWeight: 800, textTransform: 'none', fontSize: '1rem',
                borderRadius: '14px',
                background: cart.length > 0 ? `linear-gradient(135deg, ${teal} 0%, ${emerald} 100%)` : undefined,
                boxShadow: cart.length > 0 ? `0 6px 20px ${alpha(teal, 0.35)}` : 'none',
                '&.Mui-disabled': { opacity: 0.45 },
              }}
            >
              {cart.length === 0 ? 'Add a product to continue' : `Continue · ${itemCount} item${itemCount === 1 ? '' : 's'} (Enter)`}
            </Button>
          </Box>
        )}

        {/* One by One mode — Products panel is disabled (not hidden) once
            past step 1; small banner clarifies why it's greyed out and how
            to get back, since pointerEvents:none on the parent already
            blocks the "Back" affordance that would otherwise live here. */}
        {oneByOneMode && obStep !== 'products' && (
          <Box sx={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            pt: 2, pointerEvents: 'none',
          }}>
            <Chip
              size="small"
              icon={<Lock size={12} />}
              label="Products locked — go Back to add more"
              sx={{
                fontWeight: 700, fontSize: '0.72rem', height: 26,
                bgcolor: alpha('#000', 0.55), color: '#fff',
                backdropFilter: 'blur(2px)',
                '& .MuiChip-icon': { color: '#fff' },
              }}
            />
          </Box>
        )}
      </Box>

      {/* ── Customer preview panel (desktop side-by-side, mobile dialog) ─────── */}
      {showCustomerPanel && config.features?.customerPreview !== false && (
        <>
          {/* Desktop: sidebar next to cart — scales in step with the cart
              panel's own md/lg/xl widths below instead of a single fixed
              260px, so the two side panels stay proportionate as the
              viewport widens rather than the cart growing while this stays
              flat. Narrower than the cart at every step since it's read-only
              summary content, not an input-heavy panel. */}
          <Box sx={{ display: { xs: 'none', md: 'block' }, width: { md: 240, lg: 260, xl: 280 }, flexShrink: 0, border: '1px solid', borderColor: tealBorder, borderRadius: '16px', overflow: 'hidden', boxShadow: `0 4px 24px ${alpha(teal, 0.08)}` }}>
            <CustomerPreviewPanel
              party={customer}
              onClose={() => setShowCustomerPanel(false)}
              redeemedPoints={loyaltyRedeemPoints}
              onRedeem={(pts, val) => { setLoyaltyRedeemPoints(pts); setLoyaltyRedeemValue(val); }}
              actions={customer ? (
                <Button size="small" variant="outlined" startIcon={<Edit size={13} />}
                  onClick={() => setEditCustomerOpen(true)}
                  sx={{ width: '100%', fontWeight: 600, textTransform: 'none', borderRadius: 1.5, fontSize: '0.78rem' }}>
                  Edit Customer
                </Button>
              ) : undefined}
            />
          </Box>
          {/* Mobile: dialog */}
          {customer && (
            <Dialog open={showCustomerPanel} onClose={() => setShowCustomerPanel(false)} maxWidth="xs" fullWidth sx={{ display: { xs: 'flex', md: 'none' } }}>
              <CustomerPreviewPanel
                party={customer}
                onClose={() => setShowCustomerPanel(false)}
                redeemedPoints={loyaltyRedeemPoints}
                onRedeem={(pts, val) => { setLoyaltyRedeemPoints(pts); setLoyaltyRedeemValue(val); setShowCustomerPanel(false); }}
                actions={(
                  <Button size="small" variant="outlined" startIcon={<Edit size={13} />}
                    onClick={() => setEditCustomerOpen(true)}
                    sx={{ width: '100%', fontWeight: 600, textTransform: 'none', borderRadius: 1.5, fontSize: '0.78rem' }}>
                    Edit Customer
                  </Button>
                )}
              />
            </Dialog>
          )}
        </>
      )}

      {/* ── RIGHT: cart panel ────────────────────────────────────────────────── */}
      <Paper
        elevation={0}
        sx={{
          width: { xs: '100%', md: 380, lg: 440, xl: 480 },
          flexShrink: 0,
          border: '1px solid',
          borderColor: tealBorder,
          borderRadius: '16px',
          display: 'flex',
          flexDirection: 'column',
          minHeight: { xs: 'auto', md: 0 },
          overflow: 'hidden',
          boxShadow: `0 4px 24px ${alpha(teal, 0.08)}, 0 1px 4px ${alpha('#000', 0.06)}`,
        }}
      >
        {/* Cart header — brand gradient */}
        <Box sx={{
          background: BRAND.gradient,
          px: 2, py: 1.5,
          display: 'flex', alignItems: 'center', gap: 1,
          flexShrink: 0,
        }}>
          <Box sx={{
            width: 32, height: 32, borderRadius: '9px',
            bgcolor: 'rgba(255,255,255,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ShoppingCart size={17} color="#fff" />
          </Box>
          <Typography sx={{ fontWeight: 700, color: '#fff', flexGrow: 1, fontSize: '0.95rem' }}>
            Cart {itemCount > 0 && (
              <Box component="span" sx={{
                ml: 0.75, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                minWidth: 20, height: 20, borderRadius: '100px',
                bgcolor: 'rgba(255,255,255,0.25)',
                fontSize: '0.7rem', fontWeight: 800, px: 0.6,
              }}>
                {itemCount}
              </Box>
            )}
          </Typography>
          <Tooltip title={oneByOneMode ? 'One by One mode: guided step-by-step checkout (Products → Customer → Checkout), turn off for the normal all-in-one screen' : 'Turn on One by One mode: a guided, keyboard-first checkout that walks through Products → Customer → Checkout one step at a time'}>
            <Box
              onClick={() => { setOneByOneMode((v) => !v); setObStep('products'); }}
              sx={{
                display: 'flex', alignItems: 'center', gap: 0.3, cursor: 'pointer', userSelect: 'none',
                px: 0.75, py: 0.25, borderRadius: '100px',
                bgcolor: oneByOneMode ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.1)',
              }}
            >
              <ListOrdered size={13} color="#fff" style={{ flexShrink: 0 }} />
              <Typography sx={{ color: '#fff', fontSize: '0.68rem', fontWeight: 700, display: { xs: 'none', sm: 'inline' }, whiteSpace: 'nowrap' }}>
                1-by-1
              </Typography>
              <Switch
                size="small"
                checked={oneByOneMode}
                onChange={() => {}}
                sx={{
                  '& .MuiSwitch-switchBase.Mui-checked': { color: '#fff' },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: 'rgba(255,255,255,0.55)' },
                  '& .MuiSwitch-track': { bgcolor: 'rgba(255,255,255,0.35)' },
                  '& .MuiSwitch-thumb': { bgcolor: '#fff' },
                }}
              />
            </Box>
          </Tooltip>
          <Tooltip title="Add inventory item — used in this sale but not charged (e.g. a cover/bag)">
            <IconButton size="small" onClick={() => setAddInventoryDialog(true)}
              sx={{ color: 'rgba(255,255,255,0.7)', '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.12)' } }}>
              <Ban size={15} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Clear all">
            <IconButton size="small" onClick={resetSale}
              sx={{ color: 'rgba(255,255,255,0.7)', '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.12)' } }}>
              <RotateCcw size={15} />
            </IconButton>
          </Tooltip>
        </Box>

        {/* One by One mode — step indicator, always visible across all 3
            steps so the cashier always knows where they are in the flow. */}
        {oneByOneMode && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1.5, pt: 1, flexWrap: 'wrap', rowGap: 0.5 }}>
            {[
              { key: 'products', label: 'Products' },
              { key: 'customer', label: 'Customer' },
              { key: 'checkout', label: 'Checkout' },
            ].map((s, i, arr) => {
              const isDone = arr.findIndex((x) => x.key === obStep) > i;
              const isActive = s.key === obStep;
              return (
                <React.Fragment key={s.key}>
                  <Chip
                    size="small"
                    label={`${i + 1}. ${s.label}`}
                    sx={{
                      fontWeight: 700, fontSize: '0.68rem', height: 22,
                      bgcolor: isActive ? teal : isDone ? alpha(teal, 0.14) : alpha('#000', 0.05),
                      color: isActive ? '#fff' : isDone ? teal : 'text.disabled',
                    }}
                  />
                  {i < arr.length - 1 && <ChevronRight size={13} style={{ color: isDone ? teal : alpha('#000', 0.2), flexShrink: 0 }} />}
                </React.Fragment>
              );
            })}
          </Box>
        )}

        {/* Customer selector — always mounted (customer selection is always
            valid regardless of mode/step) but only VISIBLE outside One by
            One mode or during its Customer step, so the flow doesn't show
            it while still adding products or already at checkout. */}
        <Box ref={customerInputRef} sx={{
          px: 1.5, pt: 1.25, pb: 0.5,
          display: oneByOneMode ? (obStep === 'customer' ? 'block' : 'none') : 'block',
        }}>
          <PartySelect
            options={customers}
            value={customer}
            onChange={(v) => {
              setCustomer(v);
              if (v && config.features?.customerPreview !== false) setShowCustomerPanel(true);
              setLoyaltyRedeemPoints(0);
              setLoyaltyRedeemValue(0);
              // One by One mode: move focus straight to the Continue button
              // once a customer is picked, so the next Enter (a native
              // button activation, not this listener) advances to Checkout
              // with zero mouse/touch — deferred a tick so it runs after
              // Autocomplete's own focus handling for this selection settles.
              if (oneByOneModeRef.current && obStepRef.current === 'customer') {
                setTimeout(() => obContinueBtnRef.current?.focus(), 0);
              }
            }}
            onAddNew={(name, isPhone) => setQuickAddCustomer({ open: true, name: isPhone ? '' : name, phone: isPhone ? name : '' })}
            label="Customer"
            placeholder="Walk-in / Search customer…"
            size="small"
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: '0.82rem' } }}
          />
          <Box sx={{ display: 'flex', gap: 0.75, mt: 0.5, flexWrap: 'wrap' }}>
              {config.features?.customerPreview !== false && (
                <Chip
                  size="small"
                  label={showCustomerPanel ? 'Hide' : 'View details'}
                  onClick={() => setShowCustomerPanel(v => !v)}
                  sx={{ fontWeight: 700, fontSize: '0.68rem', height: 18, cursor: 'pointer', bgcolor: alpha(teal, 0.1), color: teal }}
                />
              )}
              {loyaltyRedeemPoints > 0 && (
                <Chip
                  size="small"
                  label={`${loyaltyRedeemPoints} pts redeemed`}
                  color="warning"
                  onDelete={() => { setLoyaltyRedeemPoints(0); setLoyaltyRedeemValue(0); }}
                  sx={{ fontWeight: 700, fontSize: '0.68rem', height: 18 }}
                />
              )}
            </Box>
        </Box>

        {/* One by One mode — step 2 of 3: Back / Continue. Enter (outside
            the customer field, so Autocomplete's own Enter-to-select isn't
            hijacked) does the same as Continue; a walk-in (no customer
            selected) can still continue. */}
        {oneByOneMode && obStep === 'customer' && (
          <Box sx={{ display: 'flex', gap: 1, px: 1.5, pt: 1 }}>
            <Button
              variant="outlined"
              onClick={obGoBack}
              startIcon={<ChevronLeft size={16} />}
              sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '12px', px: 1.5 }}
            >
              Back
            </Button>
            <Button
              ref={obContinueBtnRef}
              fullWidth
              variant="contained"
              size="large"
              onClick={obGoToCheckout}
              endIcon={<ChevronRight size={18} />}
              sx={{
                py: 1.25, fontWeight: 800, textTransform: 'none', fontSize: '0.95rem',
                borderRadius: '12px',
                background: `linear-gradient(135deg, ${teal} 0%, ${emerald} 100%)`,
                boxShadow: `0 6px 20px ${alpha(teal, 0.35)}`,
              }}
            >
              {customer ? `Continue with ${customer.name} (Enter)` : 'Continue as Walk-in (Enter)'}
            </Button>
          </Box>
        )}

        {/* Cart line items */}
        <Box sx={{ flex: 1, overflowY: 'auto', px: 1.5, py: 0.5, minHeight: 80 }}>
          {cart.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 5, color: 'text.disabled' }}>
              <Box sx={{
                width: 52, height: 52, borderRadius: '50%',
                bgcolor: alpha(teal, 0.07),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                mx: 'auto', mb: 1.5,
              }}>
                <ShoppingCart size={24} style={{ color: alpha(teal, 0.35) }} />
              </Box>
              <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{t('pos.tapToAdd')}</Typography>
            </Box>
          ) : (
            cart.map((c, idx) => {
              const stockExceeded = config.features?.stockAlert && c.qty > c.stock;
              return (
              <Box
                key={c.itemId}
                sx={{
                  py: 1.25,
                  borderBottom: idx < cart.length - 1 ? '1px solid' : 'none',
                  borderColor: 'divider',
                }}
              >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.25, fontSize: '0.9rem', flexGrow: 1, minWidth: 0 }} noWrap>
                    {c.name}
                  </Typography>
                  {c.notBilled && (
                    <Tooltip title="Not charged to customer — stock still deducts">
                      <Chip icon={<Ban size={11} />} label="Not billed" size="small" sx={{ height: 18, fontSize: '0.62rem', fontWeight: 700, bgcolor: alpha(errorColor, 0.08), color: errorColor, '& .MuiChip-icon': { color: errorColor, ml: '4px' } }} />
                    </Tooltip>
                  )}
                  {c.recipe?.length > 0 && (
                    <Tooltip title="Made from other stock items — see 'Inventory items used' below the cart">
                      <Chip icon={<Layers size={11} />} label="Recipe" size="small" sx={{ height: 18, fontSize: '0.62rem', fontWeight: 700, bgcolor: alpha(teal, 0.08), color: teal, '& .MuiChip-icon': { color: teal, ml: '4px' } }} />
                    </Tooltip>
                  )}
                  {stockExceeded && (
                    <Tooltip title={c.stock <= 0 ? 'Out of stock' : `Only ${c.stock} available`}>
                      <AlertTriangle size={14} color="#f59e0b" style={{ flexShrink: 0 }} />
                    </Tooltip>
                  )}
                  </Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                    {c.notBilled ? '₹0.00 (not billed)' : (
                      <>
                        {money(c.price)}{c.taxRate ? ` · ${c.taxRate}% GST` : ''}{Number(c.discount) ? ` · ${c.discount}% off` : ''}
                        {' · '}
                        <Box component="span" sx={{ fontWeight: 700, color: teal }}>
                          {money(c.price * c.qty * (1 - (Math.min(100, Math.max(0, Number(c.discount) || 0))) / 100) * (1 + c.taxRate / 100))}
                        </Box>
                      </>
                    )}
                  </Typography>
                </Box>
                {/* Qty stepper */}
                <Box sx={{
                  display: 'flex', alignItems: 'center', gap: 0.5,
                  bgcolor: alpha(teal, 0.06),
                  borderRadius: '10px',
                  border: `1px solid ${alpha(teal, 0.16)}`,
                  px: 0.5, py: 0.5,
                }}>
                  <IconButton size="small" onClick={() => changeQty(c.itemId, -1)}
                    sx={{ p: 0.75, color: 'text.secondary', '&:hover': { color: teal, bgcolor: alpha(teal, 0.1) }, borderRadius: '7px' }}>
                    <Minus size={15} />
                  </IconButton>
                  <TextField
                    value={c.qty}
                    onChange={(e) => setQty(c.itemId, e.target.value)}
                    size="small"
                    variant="standard"
                    slotProps={{
                      input: { disableUnderline: true },
                      htmlInput: { style: { textAlign: 'center', width: 32, padding: 0, fontWeight: 800, fontSize: '0.95rem', color: teal }, inputMode: 'decimal' },
                    }}
                  />
                  <IconButton size="small" onClick={() => changeQty(c.itemId, 1)}
                    sx={{ p: 0.75, color: 'text.secondary', '&:hover': { color: teal, bgcolor: alpha(teal, 0.1) }, borderRadius: '7px' }}>
                    <Plus size={15} />
                  </IconButton>
                </Box>
                <IconButton size="small" onClick={() => removeLine(c.itemId)}
                  sx={{ p: 0.75, color: 'text.disabled', '&:hover': { color: errorColor, bgcolor: alpha(errorColor, 0.08) }, borderRadius: '7px' }}>
                  <Trash2 size={15} />
                </IconButton>
              </Box>
              </Box>
              );
            })
          )}
        </Box>

        <ConsolidatedPosRecipeStrip cart={cart} allItems={allItems} teal={teal} errorColor={errorColor} zeroOutComponent={zeroOutComponent} resetComponent={resetComponent} stepComponentTotal={stepComponentTotal} />

        {/* Totals + payment + checkout — One by One mode: only shown on the
            Checkout step (final step). */}
        <Box sx={{
          px: 1.75, py: 1.5,
          borderTop: '1px solid', borderColor: 'divider',
          bgcolor: alpha(teal, 0.018),
          flexShrink: 0,
          display: oneByOneMode ? (obStep === 'checkout' ? 'block' : 'none') : 'block',
        }}>
          {/* One by One mode: Back + a compact "who/what" summary line above
              the totals, since the customer selector itself is hidden here. */}
          {oneByOneMode && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.25 }}>
              <Tooltip title="Back to customer selection">
                <IconButton size="small" onClick={obGoBack}
                  sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '10px', color: 'text.secondary' }}>
                  <ChevronLeft size={16} />
                </IconButton>
              </Tooltip>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, flexGrow: 1, minWidth: 0 }}>
                <UserCircle2 size={15} style={{ color: teal, flexShrink: 0 }} />
                <Typography noWrap sx={{ fontWeight: 700, fontSize: '0.82rem' }}>
                  {customer?.name || 'Walk-in / Cash & Carry'}
                </Typography>
              </Box>
              <Chip size="small" icon={<ListOrdered size={12} />} label={`Step 3 of 3`}
                sx={{ fontWeight: 700, fontSize: '0.65rem', height: 20, bgcolor: alpha(teal, 0.1), color: teal }} />
            </Box>
          )}
          {/* Subtotals */}
          <Stack spacing={0.6} sx={{ mb: 1.25 }}>
            <TotalsRow label="Subtotal" value={money(totals.subtotal)} />
            {totals.taxAmount > 0 && <TotalsRow label="Tax" value={money(totals.taxAmount)} />}

            {/* Discount row */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', minWidth: 56 }}>Discount</Typography>
              <ToggleButtonGroup
                value={discountType}
                exclusive
                size="small"
                onChange={(_, v) => {
                  if (!v || v === discountType) return;
                  const sub = totals.subtotal;
                  const cur = Number(discountValue) || 0;
                  if (v === 'amount') {
                    setDiscountValue(sub > 0 && cur ? parseFloat(((cur / 100) * sub).toFixed(2)) : '');
                  } else {
                    setDiscountValue(sub > 0 && cur ? parseFloat(((cur / sub) * 100).toFixed(2)) : '');
                  }
                  setDiscountType(v);
                }}
                sx={{
                  '& .MuiToggleButton-root': {
                    py: 0.1, px: 0.75, fontSize: '0.68rem', fontWeight: 700,
                    minWidth: 24, lineHeight: 1, borderRadius: '5px !important', border: 'none !important',
                    color: 'text.disabled',
                    '&.Mui-selected': { bgcolor: alpha(teal, 0.12), color: teal },
                  },
                  bgcolor: alpha('#000', 0.04), borderRadius: '6px', border: '1px solid', borderColor: 'divider',
                }}
              >
                <ToggleButton value="percent">%</ToggleButton>
                <ToggleButton value="amount">₹</ToggleButton>
              </ToggleButtonGroup>
              <TextField
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                onFocus={(e) => e.target.select()}
                size="small"
                placeholder="0"
                sx={{ flexGrow: 1, '& .MuiInput-root': { fontSize: '0.8rem' } }}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        {discountType === 'percent'
                          ? <Percent size={11} style={{ color: 'text.secondary' }} />
                          : <Box component="span" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>₹</Box>}
                      </InputAdornment>
                    ),
                  },
                  htmlInput: { style: { textAlign: 'right', padding: '2px 0', fontWeight: 600 }, inputMode: 'decimal' },
                }}
                variant="standard"
              />
              <Typography variant="caption" sx={{ minWidth: 52, textAlign: 'right', fontWeight: 700, color: errorColor, fontSize: '0.75rem' }}>
                {totals.discountAmount > 0 ? `-${money(totals.discountAmount)}` : '—'}
              </Typography>
            </Box>

            {/* Loyalty redemption row */}
            {loyaltyRedeemValue > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexGrow: 1 }}>
                  <Coins size={11} style={{ color: teal }} />
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {config.loyalty?.programName || 'Points'} ({loyaltyRedeemPoints} pts)
                  </Typography>
                </Box>
                <Typography variant="caption" sx={{ minWidth: 52, textAlign: 'right', fontWeight: 700, color: errorColor, fontSize: '0.75rem' }}>
                  -{money(loyaltyRedeemValue)}
                </Typography>
              </Box>
            )}

            {/* Round off row */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, flexGrow: 1 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('pos.roundOff')}</Typography>
                {(() => {
                  const target = roundOff > 0
                    ? getRoundUpSeq(totals.netTotal)[roundOff - 1]
                    : roundOff < 0
                      ? getRoundDownSeq(totals.netTotal)[Math.abs(roundOff) - 1]
                      : null;
                  return target != null ? (
                    <Typography variant="caption" sx={{
                      bgcolor: alpha(roundOff > 0 ? successColor : errorColor, 0.1),
                      color: roundOff > 0 ? successColor : errorColor,
                      fontWeight: 800, fontSize: '0.62rem', px: 0.6, py: 0.1, borderRadius: '4px',
                    }}>
                      → ₹{target.toFixed(0)}
                    </Typography>
                  ) : null;
                })()}
              </Box>
              <Typography variant="caption" sx={{
                minWidth: 52, textAlign: 'right', fontWeight: 700, fontSize: '0.75rem',
                color: totals.roundOffAmount > 0 ? successColor : totals.roundOffAmount < 0 ? errorColor : 'text.disabled',
              }}>
                {roundOff !== 0 ? `${totals.roundOffAmount >= 0 ? '+' : ''}₹${totals.roundOffAmount.toFixed(2)}` : '—'}
              </Typography>
              <IconButton size="small" onClick={() => setRoundOff((l) => Math.max(-3, l - 1))}
                disabled={roundOff <= -getRoundDownSeq(totals.netTotal).length}
                sx={{ p: 0.35, border: `1px solid ${alpha(errorColor, 0.3)}`, color: errorColor, bgcolor: alpha(errorColor, 0.05), borderRadius: '6px', '&:hover': { bgcolor: alpha(errorColor, 0.1) }, '&.Mui-disabled': { opacity: 0.3 } }}>
                <Minus size={11} />
              </IconButton>
              <IconButton size="small" onClick={() => setRoundOff((l) => Math.min(3, l + 1))}
                disabled={roundOff >= getRoundUpSeq(totals.netTotal).length}
                sx={{ p: 0.35, border: `1px solid ${alpha(successColor, 0.35)}`, color: successColor, bgcolor: alpha(successColor, 0.05), borderRadius: '6px', '&:hover': { bgcolor: alpha(successColor, 0.1) }, '&.Mui-disabled': { opacity: 0.3 } }}>
                <Plus size={11} />
              </IconButton>
            </Box>
          </Stack>

          {/* Grand total */}
          <Box sx={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            mb: 1.5, px: 1.25, py: 1,
            borderRadius: '12px',
            background: `linear-gradient(135deg, ${alpha(teal, 0.08)}, ${alpha(tealLight, 0.06)})`,
            border: `1px solid ${alpha(teal, 0.14)}`,
          }}>
            <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: 'text.primary' }}>Total</Typography>
            <Typography sx={{ fontWeight: 900, fontSize: '1.35rem', color: teal, letterSpacing: '-0.02em', lineHeight: 1 }}>
              {money(totals.grandTotal)}
            </Typography>
          </Box>

          {/* Sale Type — Cash/Bank (paid now) vs Credit */}
          <Box sx={{ display: 'flex', gap: 0.6, mb: 1.25 }}>
            {[
              { value: 'paid', label: 'Cash / Bank' },
              { value: 'credit', label: 'Credit Sale' },
            ].map(({ value, label }) => {
              const active = saleType === value;
              return (
                <Box key={value} onClick={() => setSaleType(value)} sx={{
                  flex: 1, textAlign: 'center', py: 0.7, borderRadius: '10px', cursor: 'pointer',
                  fontWeight: 700, fontSize: '0.78rem', border: '1.5px solid', transition: 'all 0.15s',
                  ...(active && value === 'paid' ? {
                    background: `linear-gradient(135deg, ${teal}, ${tealDark})`, color: '#fff', borderColor: 'transparent', boxShadow: `0 3px 10px ${alpha(teal, 0.3)}`,
                  } : active && value === 'credit' ? {
                    background: 'linear-gradient(135deg, #1a1a1a, #333)', color: '#fff', borderColor: 'transparent', boxShadow: '0 3px 10px rgba(0,0,0,0.25)',
                  } : {
                    color: 'text.secondary', borderColor: alpha('#000', 0.12), bgcolor: 'transparent',
                  }),
                }}>
                  {label}
                </Box>
              );
            })}
          </Box>

          {/* Advance received — only for credit sales with a named customer */}
          {saleType === 'credit' && !!customer?.id && (
            <Box sx={{
              mb: 1.25, p: 1.25, borderRadius: '10px',
              bgcolor: alpha(successColor, 0.08),
              border: `1px solid ${alpha(successColor, 0.2)}`,
            }}>
              <Typography sx={{ fontSize: '0.67rem', fontWeight: 800, color: successColor, textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.75 }}>
                Advance Received
              </Typography>
              <TextField
                fullWidth size="small" type="number" placeholder="0.00"
                value={advance}
                onChange={(e) => setAdvance(e.target.value)}
                onFocus={(e) => e.target.select()}
                slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment>, min: 0, step: 0.01 } }}
                sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: '8px' } }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Auto-recorded as payment in
              </Typography>
              {Number(advance) > 0 && (
                <Box sx={{ mt: 1 }}>
                  <Typography sx={{ fontSize: '0.67rem', fontWeight: 800, color: successColor, textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.6 }}>
                    Payment Mode
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.75 }}>
                    {PAY_MODES.map(({ value, icon: Icon, label }) => {
                      const active = advanceMode === value;
                      return (
                        <Box
                          key={value}
                          onClick={() => setAdvanceMode(value)}
                          sx={{
                            flex: 1,
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.4,
                            py: 0.75, borderRadius: '10px', cursor: 'pointer', userSelect: 'none',
                            border: '1.5px solid',
                            transition: 'all 0.15s ease',
                            ...(active ? {
                              background: `linear-gradient(135deg, ${successColor}, ${successColor})`,
                              borderColor: 'transparent',
                              boxShadow: `0 4px 12px ${alpha(successColor, 0.3)}`,
                              color: '#fff',
                            } : {
                              bgcolor: 'white',
                              borderColor: alpha(successColor, 0.25),
                              color: 'text.secondary',
                              '&:hover': { borderColor: successColor, color: successColor, bgcolor: alpha(successColor, 0.05) },
                            }),
                          }}
                        >
                          <Icon size={16} />
                          <Typography sx={{ fontSize: '0.66rem', fontWeight: 700, lineHeight: 1 }}>{label}</Typography>
                        </Box>
                      );
                    })}
                  </Box>
                  {advanceMode === 'Split' && (
                    <Box sx={{ mt: 1 }}>
                      <SplitPaymentInput
                        cash={advanceSplitCash} onCashChange={setAdvanceSplitCash}
                        bank={advanceSplitBank} onBankChange={setAdvanceSplitBank}
                        total={Number(advance) || 0}
                        accentColor={successColor}
                      />
                    </Box>
                  )}
                </Box>
              )}
              {Number(advance) > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1, pt: 1, borderTop: `1px dashed ${alpha(successColor, 0.3)}` }}>
                  <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: errorColor }}>Balance Due</Typography>
                  <Typography sx={{ fontSize: '0.8rem', fontWeight: 800, color: errorColor }}>
                    {money(Math.max(0, totals.grandTotal - (Number(advance) || 0)))}
                  </Typography>
                </Box>
              )}
            </Box>
          )}

          {/* Payment mode + cash received — only for cash/bank sales */}
          {saleType === 'paid' && <>
          <Box sx={{ display: 'flex', gap: 0.75, mb: 1.25 }}>
            {PAY_MODES.map(({ value, icon: Icon, label }) => {
              const active = payMode === value;
              return (
                <Box
                  key={value}
                  onClick={() => setPayMode(value)}
                  sx={{
                    flex: 1,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.4,
                    py: 0.875, borderRadius: '10px', cursor: 'pointer', userSelect: 'none',
                    border: '1.5px solid',
                    transition: 'all 0.15s ease',
                    ...(active ? {
                      background: `linear-gradient(135deg, ${teal}, ${tealDark})`,
                      borderColor: 'transparent',
                      boxShadow: `0 4px 12px ${alpha(teal, 0.3)}`,
                      color: '#fff',
                    } : {
                      bgcolor: alpha('#000', 0.02),
                      borderColor: 'divider',
                      color: 'text.secondary',
                      '&:hover': { borderColor: alpha(teal, 0.4), color: teal, bgcolor: alpha(teal, 0.05) },
                    }),
                  }}
                >
                  <Icon size={17} />
                  <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, lineHeight: 1 }}>{label}</Typography>
                </Box>
              );
            })}
          </Box>

          {/* Split payment fields */}
          {payMode === 'Split' && (
            <Box sx={{ mb: 1.25 }}>
              <SplitPaymentInput
                cash={splitCash} onCashChange={setSplitCash}
                bank={splitBank} onBankChange={setSplitBank}
                total={totals.grandTotal}
                accentColor={teal}
              />
            </Box>
          )}

          {/* Only Bank/Split actually involve a UPI/bank transfer — for
              Split, the QR should only ask for the bank portion the customer
              is paying that way, not the full sale total. */}
          {currentBusiness?.upiId && (payMode === 'Bank' || (payMode === 'Split' && Number(splitBank) > 0)) && (
            <Button
              fullWidth
              size="small"
              startIcon={<QrCode size={14} />}
              onClick={() => setPaymentQrOpen(true)}
              sx={{ mb: 1.25, fontWeight: 700, textTransform: 'none', borderRadius: '10px', color: teal, bgcolor: 'white', border: `1px solid ${alpha(teal, 0.25)}`, '&:hover': { bgcolor: alpha(teal, 0.06) } }}
            >
              Show Payment QR ({money(paymentQrAmount)})
            </Button>
          )}

          {/* Cash received */}
          {payMode === 'Cash' && (
            <Box sx={{ mb: 1.25 }}>
              <TextField
                fullWidth
                label={t('pos.cashReceived')}
                placeholder={totals.grandTotal > 0 ? String(totals.grandTotal) : '0.00'}
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                inputRef={cashInputRef}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: '10px',
                    '&.Mui-focused fieldset': { borderColor: teal },
                  },
                  '& .MuiInputLabel-root.Mui-focused': { color: teal },
                }}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <Banknote size={17} style={{ color: successColor }} />
                        <Box component="span" sx={{ ml: 0.5, fontWeight: 800, color: 'text.primary', fontSize: '1rem' }}>₹</Box>
                      </InputAdornment>
                    ),
                    endAdornment: cashReceived ? (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setCashReceived('')}
                          sx={{ color: 'text.disabled', '&:hover': { color: 'text.primary' } }}>
                          <X size={14} />
                        </IconButton>
                      </InputAdornment>
                    ) : null,
                  },
                  htmlInput: { inputMode: 'decimal', style: { fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.01em' } },
                }}
              />

              {/* Quick tender chips */}
              <Stack direction="row" spacing={0.6} sx={{ mt: 1, flexWrap: 'wrap', rowGap: 0.6 }}>
                {quickCash.map((v, idx) => {
                  const isExact = idx === 0;
                  const sel = isExact ? cashReceived === '' : cashNum === v;
                  return (
                    <Box
                      key={v}
                      onClick={() => setCashReceived(isExact ? '' : String(v))}
                      sx={{
                        px: 1.1, py: 0.45,
                        borderRadius: '100px',
                        fontSize: '0.72rem', fontWeight: 700,
                        cursor: 'pointer', userSelect: 'none',
                        border: '1.5px solid',
                        transition: 'all 0.12s ease',
                        ...(sel ? {
                          background: `linear-gradient(135deg, ${teal}, ${tealDark})`,
                          color: '#fff', borderColor: 'transparent',
                          boxShadow: `0 2px 8px ${alpha(teal, 0.3)}`,
                        } : {
                          bgcolor: 'background.paper',
                          color: isExact ? teal : 'text.secondary',
                          borderColor: isExact ? alpha(teal, 0.35) : 'divider',
                          '&:hover': { borderColor: teal, color: teal, bgcolor: alpha(teal, 0.05) },
                        }),
                      }}
                    >
                      {isExact ? 'Exact' : `₹${v.toLocaleString('en-IN')}`}
                    </Box>
                  );
                })}
              </Stack>

              {/* Change / balance banner — only show when custom amount entered */}
              {cashReceived !== '' && (
                <Box sx={{
                  mt: 1.25, p: 1.25,
                  borderRadius: '12px',
                  display: 'flex', alignItems: 'center', gap: 1.25,
                  border: '1px solid',
                  borderColor: short ? alpha(errorColor, 0.28) : alpha(successColor, 0.28),
                  background: short
                    ? `linear-gradient(135deg, ${alpha(errorColor, 0.06)}, ${alpha(errorColor, 0.03)})`
                    : `linear-gradient(135deg, ${alpha(successColor, 0.08)}, ${alpha(successColor, 0.04)})`,
                }}>
                  <Box sx={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    bgcolor: short ? alpha(errorColor, 0.12) : alpha(successColor, 0.14),
                    color: short ? errorColor : successColor,
                  }}>
                    {short ? <AlertTriangle size={18} /> : <Coins size={18} />}
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{
                      display: 'block', fontWeight: 700,
                      color: short ? errorColor : successColor,
                      textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.62rem',
                    }}>
                      {short ? 'Balance to receive' : 'Change to return'}
                    </Typography>
                    <Typography sx={{ fontWeight: 900, lineHeight: 1.1, color: short ? errorColor : successColor, fontSize: '1.2rem', letterSpacing: '-0.02em' }}>
                      {money(short ? shortAmount : change)}
                    </Typography>
                  </Box>
                </Box>
              )}
            </Box>
          )}
          </>}

          {salesStaff.length > 0 && (
            <TextField
              select size="small" fullWidth label="Billed by"
              value={selectedBilledBy || ownerName}
              onChange={e => setSelectedBilledBy(e.target.value)}
              sx={{ mb: 1 }}
            >
              <MenuItem value={ownerName}>{ownerName} (You)</MenuItem>
              {salesStaff.map(s => <MenuItem key={s.id} value={s.name}>{s.name}</MenuItem>)}
            </TextField>
          )}
          {/* Checkout button — hidden whenever the floating bar below covers it */}
          {!isStackedLayout && (
            <Button
              fullWidth
              variant="contained"
              size="large"
              disabled={cart.length === 0 || saving}
              onClick={completeSale}
              startIcon={<CheckCircle2 size={22} />}
              sx={{
                py: 1.75,
                fontWeight: 800,
                textTransform: 'none',
                fontSize: '1.05rem',
                letterSpacing: '-0.01em',
                borderRadius: '14px',
                background: cart.length > 0
                  ? `linear-gradient(135deg, ${teal} 0%, ${emerald} 100%)`
                  : undefined,
                boxShadow: cart.length > 0 ? `0 6px 20px ${alpha(teal, 0.4)}` : 'none',
                '&:hover': {
                  background: cart.length > 0
                    ? `linear-gradient(135deg, ${tealDark} 0%, ${alpha(emerald, 0.9)} 100%)`
                    : undefined,
                  boxShadow: cart.length > 0 ? `0 8px 24px ${alpha(teal, 0.48)}` : 'none',
                },
                '&.Mui-disabled': { opacity: 0.45 },
              }}
            >
              {saving ? t('common.loading') : `${t('pos.complete')} · ${money(totals.grandTotal)}`}
            </Button>
          )}
        </Box>
      </Paper>


      {/* ── Quick add customer dialog ────────────────────────────────────────── */}
      <PartyFormDialog
        open={quickAddCustomer.open}
        onClose={() => setQuickAddCustomer({ open: false, name: '', phone: '' })}
        partyType="Customer"
        editingParty={null}
        initialName={quickAddCustomer.name || ''}
        initialPhone={quickAddCustomer.phone || ''}
        compact
        onSaved={(newParty) => {
          setCustomer(newParty);
          setQuickAddCustomer({ open: false, name: '', phone: '' });
          // Same One by One mode auto-focus as picking an existing customer
          // via PartySelect's onChange — the dialog is still closing/
          // unmounting this same tick, so defer until that settles.
          if (oneByOneModeRef.current && obStepRef.current === 'customer') {
            setTimeout(() => obContinueBtnRef.current?.focus(), 50);
          }
        }}
      />

      <PartyFormDialog
        open={editCustomerOpen}
        onClose={() => setEditCustomerOpen(false)}
        partyType="Customer"
        editingParty={customer}
        compact
        onSaved={(updatedParty) => {
          setCustomer(updatedParty);
          setEditCustomerOpen(false);
        }}
      />

      {/* ── Print-bill prompt ────────────────────────────────────────────────── */}
      <Dialog open={!!printPrompt} onClose={() => setPrintPrompt(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
          <CheckCircle2 size={20} color={successColor} /> Sale completed
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {printPrompt ? `Invoice ${printPrompt.tx.invoiceNumber} · ${money(printPrompt.tx.totalAmount)}` : ''}
          </Typography>
          <Typography variant="body1" sx={{ mt: 1, fontWeight: 600 }}>Print the bill?</Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={() => setPrintPrompt(null)} color="inherit">No, skip</Button>
          <Button ref={printPromptYesRef} onClick={confirmPrint} variant="contained" startIcon={<Printer size={18} />}>Print bill</Button>
        </DialogActions>
      </Dialog>

      {/* Hidden print template */}
      <div style={{ display: 'none' }}>
        <InvoiceTemplate
          ref={printRef}
          transaction={printingTx}
          business={currentBusiness}
          paperSize={paperSize}
          printOptions={{ ...config.billPrintOptions, loyalty: config.loyalty }}
          partyBalance={
            printingTx
              ? (getItems('parties').find((p) => p.id === printingTx.partyId)?.balance ?? 0)
              : undefined
          }
        />
      </div>

      {barcodeEnabled && (
        <BarcodeScanner open={scannerOpen} onScan={handleScan} onClose={() => setScannerOpen(false)} />
      )}

      <ItemFormDialog
        open={newItemDialog.open}
        initialName={newItemDialog.name}
        onClose={() => setNewItemDialog({ open: false, name: '' })}
        onSaved={(newItem) => {
          if (newItem) {
            addToCart(newItem);
            setSearch('');
            setNewItemDialog({ open: false, name: '' });
          }
        }}
      />

      <Dialog open={addInventoryDialog} onClose={() => setAddInventoryDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, fontSize: '1rem' }}>Add Inventory Item</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
            Pick an item that's used up in this sale but shouldn't be charged to the customer — e.g. a cover, bag, or packing material. Stock still deducts; it won't show on the printed bill.
          </Typography>
          <ItemSelect
            options={allItems}
            value={null}
            onChange={(v) => {
              if (v && v.id) {
                addNotBilledToCart(v);
                setAddInventoryDialog(false);
              }
            }}
            placeholder="Search item…"
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddInventoryDialog(false)} sx={{ textTransform: 'none' }}>Cancel</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={paymentQrOpen} onClose={() => setPaymentQrOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, fontSize: '1rem' }}>Scan & Pay</DialogTitle>
        <DialogContent sx={{ textAlign: 'center', pb: 3 }}>
          <Box sx={{ display: 'inline-flex', p: 1.5, bgcolor: '#fff', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <UpiQrImage
              value={buildUpiUri({
                upiId: currentBusiness?.upiId,
                payeeName: currentBusiness?.name,
                amount: paymentQrAmount,
              })}
              size={220}
            />
          </Box>
          <Typography sx={{ fontWeight: 800, fontSize: '1.4rem', color: teal, mt: 1.5 }}>
            {money(paymentQrAmount)}
          </Typography>
          {payMode === 'Split' ? (
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
              Bank/UPI portion of the split payment ({money(Number(splitCash) || 0)} cash separately)
            </Typography>
          ) : (
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
              Scan with any UPI app to pay this exact amount
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPaymentQrOpen(false)} sx={{ textTransform: 'none' }}>Close</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!toast}
        autoHideDuration={2200}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast ? <Alert severity={toast.severity} variant="filled" onClose={() => setToast(null)} sx={{ fontWeight: 600 }}>{toast.msg}</Alert> : undefined}
      </Snackbar>

      {/* One by One mode's step-1 "Continue" button (the in-flow one further
          up, rendered after the product grid) sits at the bottom of however
          many products are on screen — on a stacked layout the grid can run
          several screens tall, burying the primary CTA below the fold on
          every visit to this step. Mirrored here as its own floating bar
          (same position/z-index convention as the checkout bar below) so
          it's always reachable without scrolling, matching what the
          Customer and Checkout steps already get via their own in-flow
          buttons sitting near the top of a short form. */}
      {isStackedLayout && oneByOneMode && obStep === 'products' && (
        <Box sx={{
          position: 'fixed', left: 0, right: 0, bottom: isMobile ? 60 : 0,
          zIndex: (t) => t.zIndex.appBar + 2,
          px: 1.5, py: 1,
          bgcolor: 'background.paper',
          borderTop: '1px solid', borderColor: 'divider',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.12)',
        }}>
          <Button
            fullWidth
            variant="contained"
            size="large"
            disabled={cart.length === 0}
            onClick={obGoToCustomer}
            endIcon={<ChevronRight size={18} />}
            sx={{
              py: 1.2, fontWeight: 800, textTransform: 'none', fontSize: '0.95rem',
              borderRadius: '12px',
              background: cart.length > 0 ? `linear-gradient(135deg, ${teal} 0%, ${emerald} 100%)` : undefined,
              boxShadow: cart.length > 0 ? `0 4px 14px ${alpha(teal, 0.38)}` : 'none',
              '&.Mui-disabled': { opacity: 0.45 },
            }}
          >
            {cart.length === 0 ? 'Add a product to continue' : `Continue · ${itemCount} item${itemCount === 1 ? '' : 's'}`}
          </Button>
        </Box>
      )}

      {/* Floating checkout bar — covers the whole stacked layout range (below
          `md`), not just phones, so checkout stays reachable without
          scrolling back up through the product grid on tablets too. In One
          by One mode, only shown on the Checkout step — otherwise it would
          let a tap on this bar skip straight to completing the sale from
          the Products/Customer steps, bypassing the guided flow entirely. */}
      {isStackedLayout && (!oneByOneMode || obStep === 'checkout') && (
        <Box sx={{
          // bottom:60 clears Layout's own fixed bottom nav bar, which only
          // renders below 600px (isXs) — on the newly-covered 600-960px
          // tablet range there's no bottom nav to clear, so the bar should
          // sit flush with the viewport edge instead of leaving a gap.
          position: 'fixed', left: 0, right: 0, bottom: isMobile ? 60 : 0,
          zIndex: (t) => t.zIndex.appBar + 2,
          px: 1.5, py: 1,
          bgcolor: 'background.paper',
          borderTop: '1px solid', borderColor: 'divider',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.12)',
          display: 'flex', alignItems: 'center', gap: 1.25,
        }}>
          <Box sx={{ flexShrink: 0 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, lineHeight: 1 }}>Total</Typography>
            <Typography sx={{ fontWeight: 900, color: teal, lineHeight: 1.1, fontSize: '1.15rem', letterSpacing: '-0.02em' }}>
              {money(totals.grandTotal)}
            </Typography>
          </Box>
          <Button
            fullWidth
            variant="contained"
            size="large"
            disabled={cart.length === 0 || saving}
            onClick={completeSale}
            startIcon={<CheckCircle2 size={20} />}
            sx={{
              py: 1.2, fontWeight: 800, textTransform: 'none', fontSize: '0.95rem',
              borderRadius: '12px',
              background: cart.length > 0
                ? `linear-gradient(135deg, ${teal} 0%, ${emerald} 100%)`
                : undefined,
              boxShadow: cart.length > 0 ? `0 4px 14px ${alpha(teal, 0.38)}` : 'none',
            }}
          >
            {saving ? t('common.loading') : t('pos.complete')}
          </Button>
        </Box>
      )}
    </Box>
  );
};

const TotalsRow = ({ label, value }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>{label}</Typography>
    <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>{value}</Typography>
  </Box>
);

// Consolidates the stock components every recipe cart line will consume
// (e.g. two different products both include "Cover" → shown once as
// "Cover: 2") into one strip below the cart — live current stock per
// component, Remove (zero it for this sale, across every contributing line)
// and Reset (back to every contributing line's recipe default) actions.
const ConsolidatedPosRecipeStrip = ({ cart, allItems, teal, errorColor, zeroOutComponent, resetComponent, stepComponentTotal }) => {
  const grouped = React.useMemo(() => {
    const map = new Map();
    cart.forEach((c) => {
      if (!c.recipe?.length) return;
      const qty = Number(c.qty) || 0;
      c.recipe.forEach((r) => {
        const baseQty = Math.round((Number(r.qtyPerUnit) || 0) * qty * 1000) / 1000;
        const override = c.recipeOverrides?.[r.itemId];
        const deduct = override != null ? Number(override) : baseQty;
        if (!map.has(r.itemId)) map.set(r.itemId, { itemId: r.itemId, total: 0, sourceNames: [] });
        const g = map.get(r.itemId);
        g.total += deduct;
        if (!g.sourceNames.includes(c.name)) g.sourceNames.push(c.name);
      });
    });
    return Array.from(map.values());
  }, [cart]);

  if (!grouped.length) return null;

  return (
    <Box sx={{ px: 1.5, py: 1, borderTop: '1px solid', borderColor: 'divider', bgcolor: alpha(teal, 0.03), flexShrink: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.6 }}>
        <Layers size={12} color={teal} />
        <Typography sx={{ fontWeight: 800, color: teal, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Inventory items used
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4 }}>
        {grouped.map(({ itemId, total, sourceNames }) => {
          const comp = allItems.find((i) => String(i.id) === String(itemId));
          const stock = Number(comp?.stock) || 0;
          const short = stock < total;
          const isZeroed = total === 0;
          return (
            <Box key={itemId} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
              <Box sx={{ flex: '1 1 100px' }}>
                <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.78rem', display: 'block', textDecoration: isZeroed ? 'line-through' : 'none', color: isZeroed ? 'text.disabled' : 'text.primary' }}>
                  {comp?.name || 'Unknown item'}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.62rem' }}>
                  from {sourceNames.join(', ')}
                </Typography>
              </Box>
              <Typography variant="caption" sx={{ color: short && !isZeroed ? errorColor : 'text.secondary', fontWeight: short && !isZeroed ? 700 : 500, fontSize: '0.68rem' }}>
                Stock: {stock}{short && !isZeroed ? ' · low' : ''}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.2, bgcolor: alpha(teal, 0.06), border: `1px solid ${alpha(teal, 0.2)}`, borderRadius: '7px', px: 0.25, py: 0.15 }}>
                <IconButton size="small" onClick={() => stepComponentTotal(itemId, total, -1)} sx={{ p: 0.3 }}>
                  <Minus size={11} />
                </IconButton>
                <Typography variant="caption" sx={{ minWidth: 40, textAlign: 'center', fontWeight: 800, fontSize: '0.72rem', color: isZeroed ? 'text.disabled' : teal }}>
                  {isZeroed ? '0' : `−${total}`}
                </Typography>
                <IconButton size="small" onClick={() => stepComponentTotal(itemId, total, 1)} sx={{ p: 0.3 }}>
                  <Plus size={11} />
                </IconButton>
              </Box>
              {isZeroed ? (
                <Tooltip title="Restore to recipe default">
                  <IconButton size="small" onClick={() => resetComponent(itemId)} sx={{ p: 0.4, color: teal }}>
                    <RotateCcw size={12} />
                  </IconButton>
                </Tooltip>
              ) : (
                <Tooltip title="Remove — don't deduct this for this sale">
                  <IconButton size="small" onClick={() => zeroOutComponent(itemId)} sx={{ p: 0.4, color: 'text.disabled', '&:hover': { color: errorColor, bgcolor: alpha(errorColor, 0.08) } }}>
                    <Trash2 size={12} />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

export default POS;
