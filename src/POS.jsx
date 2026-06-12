import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, TextField, InputAdornment, IconButton, Button,
  ToggleButton, ToggleButtonGroup, Divider, Chip, Stack, Tooltip, useTheme,
  alpha, Dialog, DialogTitle, DialogContent, DialogActions, Autocomplete,
  Snackbar, Alert, useMediaQuery,
} from '@mui/material';
import {
  Search, ScanLine, Plus, Minus, Trash2, X, ShoppingCart, User,
  CreditCard, Banknote, Smartphone, CheckCircle2, Percent, RotateCcw,
  Package, Printer, Coins, AlertTriangle, GripVertical, Lock, LockOpen,
} from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import { useData } from './DataContext';
import { useI18n } from './i18n/I18nContext';
import { useBusiness } from './BusinessContext';
import { useConfig } from './ConfigContext';
import { useDialog } from './DialogContext';
import BarcodeScanner from './BarcodeScanner';
import ItemFormDialog from './ItemFormDialog';
import InvoiceTemplate from './InvoiceTemplate';

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

// ── Theme tokens (mirrors the helper used across the app) ────────────────────
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

// Build the next sequential invoice number, mirroring Sales.jsx's scheme.
const nextInvoiceNumber = (sales, businessId) => {
  const d = new Date();
  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const prefix = `INVSB${monthNames[d.getMonth()]}${String(d.getFullYear()).slice(-2)}-`;
  let maxSerial = 0;
  (sales || []).forEach((tx) => {
    if (tx.businessId === businessId && tx.invoiceNumber?.startsWith(prefix)) {
      const parts = tx.invoiceNumber.split('-');
      const serial = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(serial) && serial > maxSerial) maxSerial = serial;
    }
  });
  return `${prefix}${String(maxSerial + 1).padStart(4, '0')}`;
};

const POS = () => {
  const theme = useTheme();
  const tokens = useMemo(() => getTokens(theme), [theme]);
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const { getItems, addItem, updateItem } = useData();
  const { currentBusiness } = useBusiness();
  const { config, saveConfig } = useConfig();
  const { showAlert } = useDialog();
  const { t } = useI18n();

  const businessId = currentBusiness?.id;
  const bizKey = String(businessId);
  const barcodeEnabled = !!config.features?.barcode;

  // ── Source data scoped to current business ──────────────────────────────────
  const allItems = useMemo(
    () => getItems('items').filter((i) => i.businessId === businessId),
    [getItems, businessId],
  );
  const customers = useMemo(
    () => getItems('parties').filter((p) => p.businessId === businessId && p.type === 'Customer'),
    [getItems, businessId],
  );

  const categories = useMemo(() => {
    const set = new Set();
    allItems.forEach((i) => { if (i.category?.trim()) set.add(i.category.trim()); });
    return ['All', ...Array.from(set).sort()];
  }, [allItems]);

  // ── State ───────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState('All');
  const [cart, setCart] = useState([]); // { itemId, name, price, taxRate, qty, stock, unit }
  const [customer, setCustomer] = useState(null);
  const [customerDialog, setCustomerDialog] = useState(false);
  const [discountValue, setDiscountValue] = useState('');
  const [discountType, setDiscountType] = useState('amount'); // 'percent' | 'amount'
  // Round off level — mirrors Sales.jsx: 0=off, +1/+2/+3=round up to 1/10/100, -1/-2/-3=round down.
  const [roundOff, setRoundOff] = useState(0);
  const [scannerOpen, setScannerOpen] = useState(false);
  // "+ New item" opens the shared full item-creation dialog (same as the Items page).
  const [newItemDialog, setNewItemDialog] = useState({ open: false, name: '' });
  const [payMode, setPayMode] = useState('Cash'); // Cash | Card | UPI
  const [cashReceived, setCashReceived] = useState('');
  const [toast, setToast] = useState(null); // { msg, severity }
  const [saving, setSaving] = useState(false);

  // ── Custom product-tile order + lock (persisted per business in config) ──────
  // Order is a list of item ids; lock prevents accidental dragging.
  const [order, setOrder] = useState(() => config.posItemOrder?.[bizKey] || []);
  const [locked, setLocked] = useState(() => config.posOrderLocked?.[bizKey] ?? true);
  const dragId = useRef(null);

  // Re-sync from config when the business changes or config loads in.
  useEffect(() => {
    setOrder(config.posItemOrder?.[bizKey] || []);
    setLocked(config.posOrderLocked?.[bizKey] ?? true);
  }, [bizKey, config.posItemOrder, config.posOrderLocked]);

  const persistOrder = (nextOrder, nextLocked) => {
    saveConfig?.({
      posItemOrder: { ...(config.posItemOrder || {}), [bizKey]: nextOrder },
      posOrderLocked: { ...(config.posOrderLocked || {}), [bizKey]: nextLocked },
    });
  };

  const toggleLock = () => {
    const next = !locked;
    setLocked(next);
    persistOrder(order, next);
  };

  // Print-after-sale popup state.
  const [printPrompt, setPrintPrompt] = useState(null); // last completed transaction, or null
  const [printingTx, setPrintingTx] = useState(null);
  const [printTrigger, setPrintTrigger] = useState(0);
  const printRef = useRef(null);
  const handlePrint = useReactToPrint({ contentRef: printRef });
  const paperSize = config.defaultPaperSize || 'A4';

  const searchRef = useRef(null);

  // Fire the actual print once the hidden template has the new transaction.
  useEffect(() => {
    if (!printTrigger) return;
    handlePrint();
  }, [printTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard-first: focus search on mount and after each completed sale.
  useEffect(() => {
    const timer = setTimeout(() => searchRef.current?.focus(), 150);
    return () => clearTimeout(timer);
  }, []);

  // ── Product grid filtering ──────────────────────────────────────────────────
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
    // Apply the saved custom order: ordered ids first (in their saved order),
    // then any remaining items that aren't in the order list yet.
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

  // Dragging is only allowed when unlocked and viewing the full, unsearched list.
  const canDrag = !locked && !search.trim();

  // ── Drag-and-drop reordering ────────────────────────────────────────────────
  const handleDrop = (targetId) => {
    const from = dragId.current;
    dragId.current = null;
    if (from == null || String(from) === String(targetId)) return;
    // Build a full ordering from the currently displayed sequence, then move.
    const ids = filtered.map((i) => String(i.id));
    const fromIdx = ids.indexOf(String(from));
    const toIdx = ids.indexOf(String(targetId));
    if (fromIdx < 0 || toIdx < 0) return;
    ids.splice(toIdx, 0, ids.splice(fromIdx, 1)[0]);
    setOrder(ids);
    persistOrder(ids, locked);
  };

  const resetOrder = () => {
    setOrder([]);
    persistOrder([], locked);
    setToast({ msg: 'Product order reset', severity: 'info' });
  };

  // ── Cart operations ─────────────────────────────────────────────────────────
  const addToCart = useCallback((item) => {
    playAddSound();
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.itemId === item.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      }
      const price = Number(item.salePrice ?? item.price) || 0;
      return [
        ...prev,
        {
          itemId: item.id,
          name: item.name,
          price,
          taxRate: Number(item.taxRate) || 0,
          // Per-line discount carried from the item's default discount.
          discount: Number(item.discount) || 0,
          qty: 1,
          stock: Number(item.stock) || 0,
          unit: item.unit || '',
        },
      ];
    });
  }, []);

  const changeQty = (itemId, delta) => {
    setCart((prev) =>
      prev
        .map((c) => (c.itemId === itemId ? { ...c, qty: Math.max(0, c.qty + delta) } : c))
        .filter((c) => c.qty > 0),
    );
  };

  const setQty = (itemId, value) => {
    const q = Math.max(0, Number(value) || 0);
    setCart((prev) =>
      prev.map((c) => (c.itemId === itemId ? { ...c, qty: q } : c)).filter((c) => c.qty > 0),
    );
  };

  const removeLine = (itemId) => setCart((prev) => prev.filter((c) => c.itemId !== itemId));

  const resetSale = () => {
    setCart([]);
    setCustomer(null);
    setDiscountValue('');
    setDiscountType('amount');
    setRoundOff(0);
    setSearch('');
    setActiveCat('All');
    setPayMode('Cash');
    setCashReceived('');
    setTimeout(() => searchRef.current?.focus(), 50);
  };

  // ── Barcode handling ────────────────────────────────────────────────────────
  const handleScan = useCallback((code) => {
    // Keep the scanner open for continuous scanning — close only via its Done button.
    const found = allItems.find((i) => i.barcode === code || String(i.id) === code || i.itemCode === code);
    if (found) {
      addToCart(found);
      setToast({ msg: `Added ${found.name}`, severity: 'success' });
    } else {
      setToast({ msg: `No item for code "${code}"`, severity: 'warning' });
    }
  }, [allItems, addToCart]);

  // If the search box exactly matches a barcode/code, Enter adds it instantly.
  const handleSearchEnter = (e) => {
    if (e.key !== 'Enter') return;
    const q = search.trim();
    if (!q) return;
    const exact = allItems.find((i) => i.barcode === q || i.itemCode === q);
    if (exact) {
      addToCart(exact);
      setSearch('');
      setToast({ msg: `Added ${exact.name}`, severity: 'success' });
    } else if (filtered.length === 1) {
      addToCart(filtered[0]);
      setSearch('');
    }
  };

  // ── Totals ──────────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    let subtotal = 0;
    let taxAmount = 0;
    cart.forEach((c) => {
      // Apply the item's per-line default discount to its pre-tax base.
      const lineDisc = Math.min(100, Math.max(0, Number(c.discount) || 0));
      const lineBase = c.price * c.qty * (1 - lineDisc / 100);
      subtotal += lineBase;
      taxAmount += lineBase * (c.taxRate / 100);
    });
    // Discount applies to the pre-tax subtotal — same rule as Sales.jsx.
    const dVal = Number(discountValue) || 0;
    const discountAmount = discountType === 'amount'
      ? Math.min(dVal, subtotal)
      : subtotal * (Math.min(100, Math.max(0, dVal)) / 100);
    const discPct = subtotal > 0 ? (discountAmount / subtotal) * 100 : 0;
    const netTotal = subtotal - discountAmount + taxAmount;
    // Round off using the same up/down sequence stepper as Sales.jsx.
    let roundOffAmount = 0;
    if (roundOff > 0) {
      const target = getRoundUpSeq(netTotal)[roundOff - 1];
      if (target != null) roundOffAmount = target - netTotal;
    } else if (roundOff < 0) {
      const target = getRoundDownSeq(netTotal)[Math.abs(roundOff) - 1];
      if (target != null) roundOffAmount = target - netTotal;
    }
    const grandTotal = netTotal + roundOffAmount;
    return { subtotal, taxAmount, discPct, discountAmount, netTotal, roundOffAmount, grandTotal };
  }, [cart, discountValue, discountType, roundOff]);

  const itemCount = cart.reduce((s, c) => s + c.qty, 0);

  // Inline payment helpers (Cash only shows change/short).
  const cashEntered = payMode === 'Cash' && cashReceived !== '';
  const cashNum = Number(cashReceived) || 0;
  const change = cashEntered ? Math.max(0, cashNum - totals.grandTotal) : 0;
  const shortAmount = cashEntered ? Math.max(0, totals.grandTotal - cashNum) : 0;
  const short = cashEntered && cashNum < totals.grandTotal;
  // Quick-tender denominations above the bill amount, plus the exact total.
  const quickCash = useMemo(() => {
    const t = totals.grandTotal;
    const notes = [t, Math.ceil(t / 50) * 50, Math.ceil(t / 100) * 100, Math.ceil(t / 500) * 500, Math.ceil(t / 500) * 500 + 500];
    return notes.filter((v, i, arr) => v > 0 && arr.indexOf(v) === i).slice(0, 4);
  }, [totals.grandTotal]);

  // ── Checkout — produces a record identical to Sales.jsx ─────────────────────
  const completeSale = async () => {
    const paymentMode = payMode;
    if (!cart.length || saving) return;
    if (!businessId) {
      await showAlert({ title: 'No business', message: 'No active business selected.', variant: 'warning' });
      return;
    }
    setSaving(true);
    try {
      const now = new Date();
      const date = now.toISOString().slice(0, 10);
      const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const invoiceNumber = nextInvoiceNumber(getItems('sales'), businessId);

      const items = cart.map((c) => {
        const lineDisc = Math.min(100, Math.max(0, Number(c.discount) || 0));
        return {
          itemId: c.itemId,
          name: c.name,
          qty: c.qty,
          price: c.price,
          taxRate: c.taxRate,
          cgstRate: c.taxRate / 2,
          sgstRate: c.taxRate / 2,
          igstRate: c.taxRate,
          discountPercent: lineDisc,
          total: c.price * c.qty * (1 - lineDisc / 100) * (1 + c.taxRate / 100),
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
        advance: 0,
        dueDate: '',
        taxMode: 'exclusive',
        paymentMode,
        source: 'POS',
      };

      const saved = addItem('sales', transactionData);
      if (!saved) {
        const exists = getItems('sales').find(
          (t) => t.invoiceNumber === invoiceNumber && t.partyId === transactionData.partyId,
        );
        if (!exists) {
          await showAlert({ title: 'Save failed', message: 'Could not save the sale. Please try again.', variant: 'danger' });
          setSaving(false);
          return;
        }
      }

      // Reduce stock for each line item.
      const stockSnapshot = getItems('items');
      cart.forEach((c) => {
        const stockItem = stockSnapshot.find((i) => i.id === c.itemId);
        if (stockItem) updateItem('items', c.itemId, { stock: (Number(stockItem.stock) || 0) - c.qty });
      });

      // A POS sale is paid in full at the counter: the sale record itself carries
      // the payment mode and represents the money received (cash sales feed
      // cash-in-hand directly). We deliberately do NOT create a separate
      // payment-in here — doing so would double-count the cash and leave the
      // customer looking over-paid in the ledger. The party balance is therefore
      // unchanged (sale receivable + immediate settlement net to zero).

      setToast({ msg: `Sale completed — ${money(totals.grandTotal)} (${paymentMode})`, severity: 'success' });
      setPrintPrompt({ tx: transactionData });
      resetSale();
    } finally {
      setSaving(false);
    }
  };

  // Triggered from the print-prompt popup.
  const confirmPrint = () => {
    if (!printPrompt) return;
    setPrintingTx(printPrompt.tx);
    setPrintPrompt(null);
    setPrintTrigger((t) => t + 1);
  };

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        // Fill the available content area; fall back to a viewport-based height
        // so the product grid scrolls correctly even when the parent is auto-height.
        height: { xs: 'auto', md: '100%' },
        minHeight: { xs: 'calc(100vh - 140px)', md: 0 },
        gap: 1.5,
        p: { xs: 1, sm: 1.5 },
        // Leave room for the floating mobile checkout bar so it never covers content.
        pb: { xs: 11, sm: 1.5 },
      }}
    >
      {/* ── LEFT: product search + grid ─────────────────────────────────────── */}
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <Stack direction="row" spacing={1} sx={{ mb: 1.25 }}>
          <TextField
            inputRef={searchRef}
            fullWidth
            size="small"
            placeholder={t("pos.searchProducts")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchEnter}
            autoComplete="off"
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start"><Search size={18} /></InputAdornment>
                ),
                endAdornment: search ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => { setSearch(''); searchRef.current?.focus(); }}>
                      <X size={16} />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              },
            }}
          />
          {barcodeEnabled && (
            <Tooltip title="Scan barcode">
              <Button
                variant="outlined"
                onClick={() => setScannerOpen(true)}
                sx={{ minWidth: 44, px: 1.5 }}
              >
                <ScanLine size={18} />
              </Button>
            </Tooltip>
          )}
        </Stack>

        {/* Category chips + arrange/lock controls */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.25 }}>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', overflowX: 'auto', pb: 0.25, flexGrow: 1, minWidth: 0 }}>
            {categories.length > 1 && categories.map((cat) => (
              <Chip
                key={cat}
                label={cat}
                size="small"
                clickable
                onClick={() => setActiveCat(cat)}
                color={activeCat === cat ? 'primary' : 'default'}
                variant={activeCat === cat ? 'filled' : 'outlined'}
                sx={{ fontWeight: activeCat === cat ? 600 : 400 }}
              />
            ))}
          </Box>
          {!locked && order.length > 0 && (
            <Tooltip title="Reset to default order">
              <IconButton size="small" onClick={resetOrder} sx={{ color: 'text.secondary' }}>
                <RotateCcw size={16} />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title={locked ? 'Unlock to drag & reorder products' : 'Lock product order'}>
            <Button
              size="small"
              onClick={toggleLock}
              startIcon={locked ? <Lock size={15} /> : <LockOpen size={15} />}
              variant={locked ? 'text' : 'contained'}
              color={locked ? 'inherit' : 'primary'}
              sx={{ flexShrink: 0, textTransform: 'none', fontWeight: 600, minWidth: 0, px: 1.25, color: locked ? 'text.secondary' : undefined }}
            >
              {locked ? t("pos.locked") : t("pos.arrange")}
            </Button>
          </Tooltip>
        </Box>

        {!locked && (
          <Typography variant="caption" sx={{ color: tokens.primary, mb: 0.75, display: 'block', fontWeight: 600 }}>
            Drag products to reorder · put best-sellers first
            {search.trim() ? ' (clear search to drag)' : ''}
          </Typography>
        )}

        {/* Product tiles */}
        <Box
          sx={{
            flex: 1,
            // On mobile let the grid grow with the page (whole screen scrolls);
            // on desktop it scrolls internally within the fixed-height column.
            minHeight: { xs: 240, md: 0 },
            overflowY: { xs: 'visible', md: 'auto' },
            display: 'grid',
            // Auto-fill responsive tiles: they grow to fill the full width and add
            // more columns on bigger screens instead of leaving empty side space.
            gridTemplateColumns: {
              xs: 'repeat(2, 1fr)',
              sm: 'repeat(auto-fill, minmax(150px, 1fr))',
              lg: 'repeat(auto-fill, minmax(168px, 1fr))',
            },
            gap: { xs: 1, sm: 1.25 },
            alignContent: 'start',
            pr: 0.5,
          }}
        >
          {filtered.length === 0 ? (
            <Box sx={{ gridColumn: '1 / -1', textAlign: 'center', py: 6, color: 'text.secondary' }}>
              <Package size={40} style={{ opacity: 0.4 }} />
              <Typography variant="body2" sx={{ mt: 1 }}>
                {allItems.length === 0 ? t("pos.noProductsYet") : t("pos.noMatch")}
              </Typography>
              <Button
                variant="outlined"
                size="small"
                startIcon={<Plus size={15} />}
                onClick={() => setNewItemDialog({ open: true, name: search.trim() })}
                sx={{ mt: 2, fontWeight: 700, textTransform: 'none', borderRadius: tokens.radius?.sm }}
              >
                {search.trim() ? `Create "${search.trim()}"` : 'New Item'}
              </Button>
            </Box>
          ) : (
            filtered.map((item) => {
              const price = Number(item.salePrice ?? item.price) || 0;
              const stock = Number(item.stock) || 0;
              const out = stock <= 0;
              const inCart = cart.find((c) => c.itemId === item.id)?.qty || 0;
              return (
                <Paper
                  key={item.id}
                  onClick={() => addToCart(item)}
                  elevation={0}
                  draggable={canDrag}
                  onDragStart={canDrag ? (e) => { dragId.current = item.id; e.dataTransfer.effectAllowed = 'move'; } : undefined}
                  onDragOver={canDrag ? (e) => e.preventDefault() : undefined}
                  onDrop={canDrag ? (e) => { e.preventDefault(); handleDrop(item.id); } : undefined}
                  sx={{
                    p: 1.5,
                    cursor: canDrag ? 'grab' : 'pointer',
                    border: '1.5px solid',
                    borderColor: inCart ? tokens.primary : 'divider',
                    bgcolor: inCart ? tokens.primarySoft : 'background.paper',
                    borderRadius: 2.5,
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: { xs: 104, sm: 124 },
                    position: 'relative',
                    overflow: 'hidden',
                    transition: 'transform 0.12s, box-shadow 0.12s, border-color 0.12s',
                    ...(canDrag && { borderStyle: 'dashed', borderColor: alpha(tokens.primary, 0.4) }),
                    '&:hover': { borderColor: tokens.primary, boxShadow: `0 8px 22px ${alpha(tokens.primary, 0.18)}`, transform: 'translateY(-2px)' },
                    '&:active': canDrag ? { cursor: 'grabbing' } : { transform: 'translateY(0)' },
                    opacity: out ? 0.6 : 1,
                  }}
                >
                  {/* in-cart accent strip */}
                  {inCart > 0 && (
                    <Box aria-hidden sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, bgcolor: tokens.primary }} />
                  )}
                  {canDrag && (
                    <Box sx={{ position: 'absolute', top: 5, left: 5, color: 'text.disabled', display: 'flex' }}>
                      <GripVertical size={14} />
                    </Box>
                  )}
                  {inCart > 0 && (
                    <Chip
                      label={inCart}
                      size="small"
                      color="primary"
                      sx={{ position: 'absolute', top: 8, right: 8, height: 22, minWidth: 22, fontWeight: 800, '& .MuiChip-label': { px: 0.75 } }}
                    />
                  )}
                  <Typography sx={{ fontWeight: 700, fontSize: { xs: '0.82rem', sm: '0.9rem' }, lineHeight: 1.3, mb: 0.75, pr: inCart ? 3.5 : 0, pl: canDrag ? 2.25 : 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {item.name}
                  </Typography>
                  <Box sx={{ mt: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.5 }}>
                    <Box sx={{ px: 1, py: 0.4, borderRadius: 1.5, bgcolor: tokens.primarySoft, color: tokens.primary, fontWeight: 800, fontSize: { xs: '0.85rem', sm: '0.95rem' }, lineHeight: 1 }}>
                      {money(price)}
                    </Box>
                    <Typography variant="caption" sx={{ color: out ? tokens.error : 'text.secondary', fontWeight: out ? 700 : 500, fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                      {out ? 'Out of stock' : `${stock} ${item.unit || ''}`.trim()}
                    </Typography>
                  </Box>
                </Paper>
              );
            })
          )}
        </Box>
      </Box>

      {/* ── RIGHT: cart ─────────────────────────────────────────────────────── */}
      <Paper
        elevation={0}
        sx={{
          width: { xs: '100%', md: 380, xl: 440 },
          flexShrink: 0,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          display: 'flex',
          flexDirection: 'column',
          // On mobile the cart flows in the page (no internal scroll cap); on
          // desktop it fills the column height.
          minHeight: { xs: 'auto', md: 0 },
          maxHeight: { xs: 'none', md: 'none' },
        }}
      >
        {/* Customer / header */}
        <Box sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
          <ShoppingCart size={18} color={tokens.primary} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700, flexGrow: 1 }}>
            Cart {itemCount > 0 && <Chip label={itemCount} size="small" sx={{ ml: 0.5, height: 18 }} />}
          </Typography>
          {cart.length > 0 && (
            <Tooltip title="Clear cart">
              <IconButton size="small" onClick={resetSale}><RotateCcw size={16} /></IconButton>
            </Tooltip>
          )}
        </Box>

        <Button
          startIcon={<User size={16} />}
          onClick={() => setCustomerDialog(true)}
          sx={{ justifyContent: 'flex-start', m: 1, mb: 0.5, textTransform: 'none', color: customer ? 'text.primary' : 'text.secondary', borderRadius: 1.5 }}
          variant={customer ? 'outlined' : 'text'}
          size="small"
        >
          {customer ? customer.name : t("pos.walkIn")}
        </Button>

        {/* Lines */}
        <Box sx={{ flex: 1, overflowY: 'auto', px: 1, minHeight: 80 }}>
          {cart.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 5, color: 'text.disabled' }}>
              <ShoppingCart size={36} style={{ opacity: 0.3 }} />
              <Typography variant="body2" sx={{ mt: 1 }}>{t("pos.tapToAdd")}</Typography>
            </Box>
          ) : (
            cart.map((c) => (
              <Box key={c.itemId} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, py: 0.75, borderBottom: '1px dashed', borderColor: 'divider' }}>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }} noWrap>{c.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {money(c.price)}{c.taxRate ? ` · ${c.taxRate}% GST` : ''}{Number(c.discount) ? ` · ${c.discount}% off` : ''} · {money(c.price * c.qty * (1 - (Math.min(100, Math.max(0, Number(c.discount) || 0))) / 100) * (1 + c.taxRate / 100))}
                  </Typography>
                </Box>
                <Stack direction="row" alignItems="center" spacing={0.25}>
                  <IconButton size="small" onClick={() => changeQty(c.itemId, -1)} sx={{ p: 0.5 }}><Minus size={14} /></IconButton>
                  <TextField
                    value={c.qty}
                    onChange={(e) => setQty(c.itemId, e.target.value)}
                    size="small"
                    variant="standard"
                    slotProps={{ input: { disableUnderline: true }, htmlInput: { style: { textAlign: 'center', width: 28, padding: 0, fontWeight: 600 }, inputMode: 'numeric' } }}
                  />
                  <IconButton size="small" onClick={() => changeQty(c.itemId, 1)} sx={{ p: 0.5 }}><Plus size={14} /></IconButton>
                  <IconButton size="small" onClick={() => removeLine(c.itemId)} sx={{ p: 0.5, color: tokens.error }}><Trash2 size={14} /></IconButton>
                </Stack>
              </Box>
            ))
          )}
        </Box>

        {/* Totals + inline payment + checkout */}
        <Box sx={{ p: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
          <Stack spacing={0.5} sx={{ mb: 1 }}>
            <Row label="Subtotal" value={money(totals.subtotal)} />
            {totals.taxAmount > 0 && <Row label="Tax" value={money(totals.taxAmount)} />}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" color="text.secondary">Discount</Typography>
              {/* %/₹ toggle — same conversion behaviour as Sales.jsx new invoice */}
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
                sx={{ '& .MuiToggleButton-root': { py: 0.1, px: 0.75, fontSize: '0.7rem', fontWeight: 700, minWidth: 26, lineHeight: 1 } }}
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
                sx={{ flexGrow: 1 }}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        {discountType === 'percent' ? <Percent size={12} /> : <Box component="span" sx={{ fontSize: '0.8rem' }}>₹</Box>}
                      </InputAdornment>
                    ),
                  },
                  htmlInput: { style: { textAlign: 'right', padding: '2px 0' }, inputMode: 'decimal' },
                }}
                variant="standard"
              />
              <Typography variant="caption" sx={{ minWidth: 56, textAlign: 'right', color: tokens.error }}>
                {totals.discountAmount > 0 ? `-${money(totals.discountAmount)}` : '—'}
              </Typography>
            </Box>
            {/* Round Off — same +/- stepper as Sales.jsx new invoice */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexGrow: 1 }}>
                <Typography variant="caption" color="text.secondary">{t("pos.roundOff")}</Typography>
                {(() => {
                  const target = roundOff > 0
                    ? getRoundUpSeq(totals.netTotal)[roundOff - 1]
                    : roundOff < 0
                      ? getRoundDownSeq(totals.netTotal)[Math.abs(roundOff) - 1]
                      : null;
                  return target != null ? (
                    <Typography
                      variant="caption"
                      sx={{
                        bgcolor: alpha(roundOff > 0 ? tokens.success : tokens.error, 0.1),
                        color: roundOff > 0 ? tokens.success : tokens.error,
                        fontWeight: 800, fontSize: '0.62rem', px: 0.6, py: 0.1, borderRadius: '4px',
                      }}
                    >
                      → ₹{target.toFixed(0)}
                    </Typography>
                  ) : null;
                })()}
              </Box>
              <Typography
                variant="caption"
                sx={{
                  minWidth: 56, textAlign: 'right', fontWeight: 700,
                  color: totals.roundOffAmount > 0 ? tokens.success : totals.roundOffAmount < 0 ? tokens.error : 'text.disabled',
                }}
              >
                {roundOff !== 0 ? `${totals.roundOffAmount >= 0 ? '+' : ''}₹${totals.roundOffAmount.toFixed(2)}` : '—'}
              </Typography>
              <IconButton
                size="small"
                onClick={() => setRoundOff((l) => Math.max(-3, l - 1))}
                disabled={roundOff <= -getRoundDownSeq(totals.netTotal).length}
                sx={{ p: 0.4, border: `1px solid ${alpha(tokens.error, 0.35)}`, color: tokens.error, bgcolor: alpha(tokens.error, 0.06), borderRadius: '6px', '&:hover': { bgcolor: alpha(tokens.error, 0.12) }, '&.Mui-disabled': { opacity: 0.35 } }}
              >
                <Minus size={12} />
              </IconButton>
              <IconButton
                size="small"
                onClick={() => setRoundOff((l) => Math.min(3, l + 1))}
                disabled={roundOff >= getRoundUpSeq(totals.netTotal).length}
                sx={{ p: 0.4, border: `1px solid ${alpha(tokens.success, 0.45)}`, color: tokens.success, bgcolor: alpha(tokens.success, 0.06), borderRadius: '6px', '&:hover': { bgcolor: alpha(tokens.success, 0.12) }, '&.Mui-disabled': { opacity: 0.35 } }}
              >
                <Plus size={12} />
              </IconButton>
            </Box>
          </Stack>
          <Divider sx={{ mb: 1 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1.25 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Total</Typography>
            <Typography variant="h6" sx={{ fontWeight: 800, color: tokens.primary }}>{money(totals.grandTotal)}</Typography>
          </Box>

          {/* Payment mode */}
          <ToggleButtonGroup
            value={payMode}
            exclusive
            fullWidth
            size="small"
            onChange={(_, v) => v && setPayMode(v)}
            sx={{ mb: 1, '& .MuiToggleButton-root': { py: 0.75, textTransform: 'none', fontWeight: 600, gap: 0.5 } }}
          >
            <ToggleButton value="Cash"><Banknote size={16} /> Cash</ToggleButton>
            <ToggleButton value="Card"><CreditCard size={16} /> Card</ToggleButton>
            <ToggleButton value="UPI"><Smartphone size={16} /> UPI</ToggleButton>
          </ToggleButtonGroup>

          {/* Cash received + change — only for Cash */}
          {payMode === 'Cash' && (
            <Box sx={{ mb: 1.25 }}>
              <TextField
                fullWidth
                label={t("pos.cashReceived")}
                placeholder="Enter amount tendered"
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <Banknote size={18} style={{ color: tokens.success }} />
                        <Box component="span" sx={{ ml: 0.5, fontWeight: 700, color: 'text.primary' }}>₹</Box>
                      </InputAdornment>
                    ),
                    endAdornment: cashReceived ? (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setCashReceived('')}><X size={15} /></IconButton>
                      </InputAdornment>
                    ) : null,
                  },
                  htmlInput: { inputMode: 'decimal', style: { fontSize: '1.15rem', fontWeight: 700 } },
                }}
              />

              {/* Quick tender denominations */}
              <Stack direction="row" spacing={0.75} sx={{ mt: 1, flexWrap: 'wrap', rowGap: 0.75 }}>
                {quickCash.map((v, idx) => {
                  const isExact = idx === 0;
                  return (
                    <Chip
                      key={v}
                      label={isExact ? 'Exact' : `₹${v.toLocaleString('en-IN')}`}
                      onClick={() => setCashReceived(String(v))}
                      clickable
                      size="small"
                      color={cashNum === v ? 'primary' : 'default'}
                      variant={cashNum === v ? 'filled' : 'outlined'}
                      sx={{ fontWeight: 600 }}
                    />
                  );
                })}
              </Stack>

              {/* Prominent change / balance banner */}
              {cashEntered && (
                <Box
                  sx={{
                    mt: 1.25,
                    p: 1.25,
                    borderRadius: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    border: '1px solid',
                    borderColor: short ? alpha(tokens.error, 0.3) : alpha(tokens.success, 0.3),
                    bgcolor: short ? alpha(tokens.error, 0.08) : alpha(tokens.success, 0.1),
                  }}
                >
                  <Box
                    sx={{
                      width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      bgcolor: short ? alpha(tokens.error, 0.15) : alpha(tokens.success, 0.18),
                      color: short ? tokens.error : tokens.success,
                    }}
                  >
                    {short ? <AlertTriangle size={18} /> : <Coins size={18} />}
                  </Box>
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, color: short ? tokens.error : tokens.success, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.65rem' }}>
                      {short ? 'Balance to receive' : 'Change to return'}
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.1, color: short ? tokens.error : tokens.success }}>
                      {money(short ? shortAmount : change)}
                    </Typography>
                  </Box>
                </Box>
              )}
            </Box>
          )}

          {/* Inline Complete button — desktop only; mobile uses the floating bar */}
          {!isMobile && (
            <Button
              fullWidth
              variant="contained"
              size="large"
              disabled={cart.length === 0 || saving}
              onClick={completeSale}
              startIcon={<CheckCircle2 size={20} />}
              sx={{ py: 1.25, fontWeight: 700, textTransform: 'none', fontSize: '1rem' }}
            >
              {saving ? t('common.loading') : `${t('pos.complete')} ${money(totals.grandTotal)}`}
            </Button>
          )}
        </Box>
      </Paper>

      {/* ── Customer picker dialog ──────────────────────────────────────────── */}
      <Dialog open={customerDialog} onClose={() => setCustomerDialog(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 700 }}>Attach customer</DialogTitle>
        <DialogContent>
          <Autocomplete
            options={customers}
            getOptionLabel={(o) => o?.name || ''}
            value={customer}
            onChange={(_, v) => { setCustomer(v); setCustomerDialog(false); }}
            isOptionEqualToValue={(o, v) => o.id === v?.id}
            renderInput={(params) => <TextField {...params} autoFocus label="Search customers" size="small" sx={{ mt: 1 }} />}
            renderOption={(props, o) => (
              <li {...props} key={o.id}>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{o.name}</Typography>
                  {o.phone && <Typography variant="caption" color="text.secondary">{o.phone}</Typography>}
                </Box>
              </li>
            )}
          />
        </DialogContent>
        <DialogActions>
          {customer && <Button onClick={() => { setCustomer(null); setCustomerDialog(false); }} color="inherit">Walk-in</Button>}
          <Button onClick={() => setCustomerDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* ── Print-bill prompt (after each completed sale) ───────────────────── */}
      <Dialog open={!!printPrompt} onClose={() => setPrintPrompt(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
          <CheckCircle2 size={20} color={tokens.success} /> Sale completed
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {printPrompt ? `Invoice ${printPrompt.tx.invoiceNumber} · ${money(printPrompt.tx.totalAmount)}` : ''}
          </Typography>
          <Typography variant="body1" sx={{ mt: 1, fontWeight: 600 }}>Print the bill?</Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={() => setPrintPrompt(null)} color="inherit">No, skip</Button>
          <Button onClick={confirmPrint} variant="contained" startIcon={<Printer size={18} />}>Print bill</Button>
        </DialogActions>
      </Dialog>

      {/* Hidden print template — rendered off-DOM until print is triggered */}
      <div style={{ display: 'none' }}>
        <InvoiceTemplate
          ref={printRef}
          transaction={printingTx}
          business={currentBusiness}
          paperSize={paperSize}
          printOptions={config.billPrintOptions}
          partyBalance={
            printingTx
              ? (getItems('parties').find((p) => p.id === printingTx.partyId)?.balance ?? 0)
              : undefined
          }
        />
      </div>

      {/* ── Barcode scanner ─────────────────────────────────────────────────── */}
      {barcodeEnabled && (
        <BarcodeScanner open={scannerOpen} onScan={handleScan} onClose={() => setScannerOpen(false)} />
      )}

      {/* ── + New item → shared item-creation dialog, then add to cart ──────── */}
      <ItemFormDialog
        open={newItemDialog.open}
        initialName={newItemDialog.name}
        onClose={() => setNewItemDialog({ open: false, name: '' })}
        onSaved={(newItem) => {
          if (newItem) {
            addToCart(newItem);
            setSearch('');
          }
        }}
      />

      <Snackbar
        open={!!toast}
        autoHideDuration={2200}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast ? <Alert severity={toast.severity} variant="filled" onClose={() => setToast(null)} sx={{ fontWeight: 600 }}>{toast.msg}</Alert> : undefined}
      </Snackbar>

      {/* ── Floating mobile checkout bar — always reachable ── */}
      {isMobile && (
        <Box
          sx={{
            position: 'fixed',
            left: 0,
            right: 0,
            // Sit above the global mobile bottom-nav (60px tall on phones).
            bottom: 60,
            zIndex: (t) => t.zIndex.appBar + 2,
            px: 1.5,
            py: 1,
            bgcolor: 'background.paper',
            borderTop: '1px solid',
            borderColor: 'divider',
            boxShadow: '0 -4px 16px rgba(0,0,0,0.12)',
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
          }}
        >
          <Box sx={{ flexShrink: 0 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, lineHeight: 1 }}>
              Total
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 800, color: tokens.primary, lineHeight: 1.1 }}>
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
            sx={{ py: 1.2, fontWeight: 700, textTransform: 'none', fontSize: '0.95rem' }}
          >
            {saving ? t('common.loading') : t('pos.complete')}
          </Button>
        </Box>
      )}
    </Box>
  );
};

const Row = ({ label, value }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
    <Typography variant="caption" color="text.secondary">{label}</Typography>
    <Typography variant="caption" sx={{ fontWeight: 600 }}>{value}</Typography>
  </Box>
);

export default POS;
