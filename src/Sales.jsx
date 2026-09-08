import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  TextField,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  MenuItem,
  Divider,
  Autocomplete,
  InputAdornment,
  Chip,
  TablePagination,
  FormControlLabel,
  Switch,
  alpha,
  useMediaQuery,
  ToggleButton,
  ToggleButtonGroup,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  ListItemText,
  ListItemIcon,
  Checkbox,
  Snackbar,
  Alert,
  Tooltip,
  Menu,
  useTheme,
  Backdrop,
  CircularProgress,
  InputBase,
} from "@mui/material";
import {
  Plus,
  Trash2,
  Printer,
  Save,
  RefreshCw,
  ChevronLeft,
  Receipt,
  ShoppingBasket,
  Edit,
  Share2,
  Calendar,
  Clock,
  User,
  Package,
  Users,
  Wallet,
  Banknote,
  Landmark,
  CheckCircle2,
  ScanLine,
  Search,
  TrendingUp,
  FileText,
  Filter,
  X,
  ChevronDown,
  ArrowUpRight,
  Eye,
  FileDown,
  ImageDown,
  Minus,
  Download,
  RotateCcw,
  MoreVertical,
  MessageCircle,
  Images,
  ClipboardList,
  Ban,
  Layers,
  QrCode,
  ListOrdered,
  ChevronRight,
} from "lucide-react";
import { exportSalesToExcel, exportPurchasesToExcel, exportToTallyXML } from './exportUtils';
import { useBusiness } from "./BusinessContext";
import { useTabs } from './TabsContext';
import { acknowledgeQuickNew, dispatchQuickNew } from './quickNewBridge';

import { useData } from "./DataContext";
import { usePersistedState } from "./usePersistedState";
import { useConfig } from "./ConfigContext";
import { useSubscription } from "./SubscriptionContext";
import { useAuth } from "./AuthContext";
import { useReactToPrint } from "react-to-print";
import { useLocation } from "react-router-dom";
import InvoiceTemplate, { PAPER_SIZES, getPaperWidthMm, getJsPdfFormat } from "./InvoiceTemplate";
import { FitPreview, ViewModeToggle, loadViewMode, saveViewMode, useFillHeight } from "./TxListView";
import TxDataTable from "./TxDataTable";
import { useI18n } from "./i18n/I18nContext";
import BarcodeScanner from "./BarcodeScanner";
import ItemFormDialog from "./ItemFormDialog";
import PartyFormDialog from "./PartyFormDialog";
import { useDialog } from "./DialogContext";
import PartySelect from "./PartySelect";
import { buildUpiUri } from "./upiUtils";
import UpiQrImage from "./UpiQrImage";
import { waitForQrReady } from "./qrReady";
import SendDialog from "./SendDialog";
import BulkSendDialog from "./BulkSendDialog";
import ItemSelect from "./ItemSelect";
import SplitPaymentInput from "./SplitPaymentInput";
import SalesBulkAddDialog from './SalesBulkAddDialog';
import SalesBulkEditDialog from './SalesBulkEditDialog';
import SalesImportDialog from './SalesImportDialog';
import PurchaseBulkAddDialog from './PurchaseBulkAddDialog';
import PurchaseImportDialog from './PurchaseImportDialog';
import CustomerPreviewPanel from './CustomerPreviewPanel';
import ReferenceImagesPanel from './ReferenceImagesPanel';
import ImageViewerDialog from './ImageViewerDialog';
import { removeAllImagesForRecord } from './referenceImages';
import { txSortKey, formatCreatedTime } from './txTimeUtils';


/* ─── Design tokens (derived from global MUI theme) ─── */
const getThemeTokens = (theme) => {
  const primary = theme.palette.primary.main;
  const primaryLight = theme.palette.primary.light || primary;
  const primaryDark = theme.palette.primary.dark || primary;
  const success = theme.palette.success.main;
  const baseRadius = Number(theme.shape?.borderRadius) || 8;

  return {
    primary,
    primaryLight,
    primaryDark,
    primarySoft: alpha(primary, 0.08),
    primaryBorder: alpha(primary, 0.18),
    success,
    successSoft: alpha(success, 0.08),
    error: theme.palette.error.main,
    warning: theme.palette.warning.main,
    radius: {
      sm: `${baseRadius}px`,
      md: `${baseRadius + 4}px`,
      lg: `${baseRadius + 8}px`,
      xl: `${baseRadius + 12}px`,
    },
    shadow: {
      card: theme.shadows[1],
      cardHover: theme.shadows[4],
      btn: `0 4px 12px ${alpha(primary, 0.28)}`,
      btnHover: `0 6px 20px ${alpha(primary, 0.38)}`,
    },
  };
};

// Icon-tile options for Payment Mode / Advance Received Via selectors —
// matches POS.jsx's PAY_MODES tile style for visual consistency.
const PAY_MODE_TILES = [
  { value: "Cash", icon: Banknote, label: "Cash" },
  { value: "Bank", icon: Landmark, label: "Bank" },
  { value: "Split", icon: Wallet, label: "Split" },
];

/**
 * Keyboard-operable Payment Mode / "Received Via" tile row.
 *
 * These tiles were previously plain `<Box onClick>` elements repeated at four
 * separate call sites. A div with only an onClick is invisible to the
 * keyboard: it is not in the tab order, and Enter/Space do nothing — so
 * Payment Mode was simply unreachable without a mouse, which broke
 * keyboard-only invoice entry at the last step.
 *
 * Implemented as a real radiogroup rather than by scattering tabIndex onto
 * the existing divs, so it follows the standard radio interaction pattern
 * users (and screen readers) already expect: exactly ONE tab stop for the
 * whole group, landing on the selected tile; Left/Right/Up/Down move between
 * options (wrapping) and select as they move; Enter/Space select the focused
 * option. That's the same behavior MUI's own ToggleButtonGroup provides, kept
 * here rather than swapping in ToggleButtonGroup because these tiles carry a
 * bespoke icon-over-label layout and active gradient/shadow treatment that
 * the surrounding checkout UI depends on visually.
 */
const PayModeTiles = ({ value, onChange, tokens, accent, tiles = PAY_MODE_TILES, ariaLabel = "Payment mode" }) => {
  const accentColor = accent || tokens.primary;
  const btnRefs = React.useRef([]);
  const selectedIdx = Math.max(0, tiles.findIndex((t) => t.value === value));

  const move = (delta) => {
    const next = (selectedIdx + delta + tiles.length) % tiles.length;
    onChange(tiles[next].value);
    btnRefs.current[next]?.focus();
  };

  const onKeyDown = (e, tile) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    // A <div role="radio"> gets no activation behaviour from the browser the
    // way a real <button> does — Enter/Space must be handled explicitly or
    // the tile can be focused but never chosen.
    else if (e.key === " " || e.key === "Enter") { e.preventDefault(); onChange(tile.value); }
  };

  return (
    <Box role="radiogroup" aria-label={ariaLabel} sx={{ display: "flex", gap: 0.75 }}>
      {tiles.map((tile, i) => {
        const active = value === tile.value;
        return (
          <Box
            key={tile.value}
            ref={(el) => { btnRefs.current[i] = el; }}
            role="radio"
            aria-checked={active}
            // Roving tabindex: only the selected tile is a tab stop, so Tab
            // moves past the whole group in one press instead of three.
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tile.value)}
            onKeyDown={(e) => onKeyDown(e, tile)}
            sx={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 0.4,
              py: 0.75, borderRadius: tokens.radius.sm, cursor: "pointer", userSelect: "none",
              border: "1.5px solid", transition: "all 0.15s ease",
              "&:focus-visible": {
                outline: `2px solid ${accentColor}`,
                outlineOffset: 2,
              },
              ...(active ? {
                bgcolor: accentColor, borderColor: "transparent",
                boxShadow: `0 4px 12px ${alpha(accentColor, 0.3)}`, color: "#fff",
              } : {
                bgcolor: "white", borderColor: alpha(accentColor, 0.2), color: "text.secondary",
                "&:hover": { borderColor: accentColor, color: accentColor, bgcolor: alpha(accentColor, 0.05) },
              }),
            }}
          >
            <tile.icon size={16} />
            <Typography sx={{ fontSize: "0.66rem", fontWeight: 700, lineHeight: 1 }}>{tile.label}</Typography>
          </Box>
        );
      })}
    </Box>
  );
};

/* ─── Reusable styled helpers ─── */
// Single source of truth for the Paid/Unpaid/Overdue color code — used by
// the status chip, the quick-filter pills above the list, AND the full-row
// tint in every view (table/grid/mobile) so all four always agree on what
// "unpaid" vs "overdue" looks like, rather than four separately-hand-tuned
// colors drifting apart.
const STATUS_COLOR = { paid: '#16a34a', unpaid: '#ca8a04', overdue: '#dc2626' };
const statusKeyOf = (status, overdue) => (status === 'paid' ? 'paid' : overdue ? 'overdue' : 'unpaid');
// Mild full-row tint for an unpaid/overdue transaction — deliberately very
// low alpha so it reads as a gentle stage indicator, not an alert.
const rowStatusTint = (statusKey) => (statusKey === 'paid' ? null : alpha(STATUS_COLOR[statusKey], 0.055));

// Paid/Unpaid/Overdue chip — gated by config.features.billPaymentStatusChip
// (Settings → Features), on by default. Overdue (unpaid + dueDate passed)
// gets its own mildly-distinct red, separate from the amber "Unpaid" —
// so at a glance a user can tell "not yet due" apart from "past due".
const PaidStatusChip = ({ status, overdue = false, size = 'small' }) => {
  const key = statusKeyOf(status, overdue);
  const label = key === 'paid' ? 'Paid' : key === 'overdue' ? 'Overdue' : 'Unpaid';
  const color = STATUS_COLOR[key];
  return (
    <Chip
      size={size}
      label={label}
      sx={{
        fontWeight: 800,
        fontSize: size === 'small' ? '0.62rem' : '0.68rem',
        height: size === 'small' ? 18 : 20,
        bgcolor: alpha(color, 0.1),
        color,
        border: '1px solid',
        borderColor: alpha(color, 0.25),
      }}
    />
  );
};

// "From Estimate"/"From Order" chip — shown on a sale that carries
// sourceEstimateId/sourceOrderId (stamped when converting one of those into
// this sale). Mirrors Estimates.jsx/Orders.jsx's own green "Converted" chip
// visual language so the two sides of the relationship read as one system.
const SourceChip = ({ label, icon: Icon, onClick, size = 'small' }) => (
  <Tooltip title={onClick ? `${label} — click to open` : label}>
    <Chip
      size={size}
      icon={<Icon size={size === 'small' ? 12 : 13} />}
      label={label}
      onClick={onClick}
      sx={{
        fontWeight: 700,
        fontSize: size === 'small' ? '0.62rem' : '0.68rem',
        height: size === 'small' ? 18 : 20,
        bgcolor: '#eff6ff', color: '#1d4ed8',
        border: '1px solid #bfdbfe',
        cursor: onClick ? 'pointer' : 'default',
        '& .MuiChip-icon': { color: '#1d4ed8' },
      }}
    />
  </Tooltip>
);

const SectionLabel = ({ children, icon: Icon, tokens }) => (
  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0 }}>
    {Icon && <Icon size={13} color={tokens.primary} />}
    <Typography
      variant="overline"
      sx={{
        fontWeight: 800,
        color: tokens.primary,
        letterSpacing: "0.08em",
        fontSize: "0.65rem",
        lineHeight: 1,
      }}
    >
      {children}
    </Typography>
  </Box>
);

// Consolidates the stock components every recipe item on the invoice will
// consume (e.g. Item A and Item B both include "Cover" → shown once as
// "Cover: 2") into one list below the item table — live current stock per
// component, a Remove (zero it for this sale, across every row that
// contributes it) and Reset (back to every row's recipe default) action.
// Per-row deductions still live in item.recipeOverrides = { [componentId]: qty },
// this just aggregates + edits across all rows at once instead of one row
// at a time, since the same component can come from multiple sold items.
const ConsolidatedRecipeStrip = ({ items, stockItems, tokens, setItems }) => {
  const grouped = React.useMemo(() => {
    const map = new Map();
    items.forEach((item, index) => {
      if (!item.recipe?.length) return;
      const qty = Number(item.qty) || 0;
      item.recipe.forEach((r) => {
        const baseQty = Math.round((Number(r.qtyPerUnit) || 0) * qty * 1000) / 1000;
        const override = item.recipeOverrides?.[r.itemId];
        const deduct = override != null ? Number(override) : baseQty;
        if (!map.has(r.itemId)) map.set(r.itemId, { itemId: r.itemId, total: 0, baseTotal: 0, contributors: [] });
        const g = map.get(r.itemId);
        g.total += deduct;
        g.baseTotal += baseQty;
        g.contributors.push({ rowIndex: index, sourceName: item.name });
      });
    });
    return Array.from(map.values());
  }, [items]);

  if (!grouped.length) return null;

  const zeroOut = (itemId) => {
    setItems((prev) => prev.map((item) => {
      if (!item.recipe?.some((r) => r.itemId === itemId)) return item;
      return { ...item, recipeOverrides: { ...(item.recipeOverrides || {}), [itemId]: 0 } };
    }));
  };
  const resetToDefault = (itemId) => {
    setItems((prev) => prev.map((item) => {
      if (!item.recipe?.some((r) => r.itemId === itemId)) return item;
      const overrides = { ...(item.recipeOverrides || {}) };
      delete overrides[itemId];
      return { ...item, recipeOverrides: overrides };
    }));
  };
  // +/- adjusts the combined total directly. Internally, the whole delta is
  // absorbed by the FIRST row that contributes this component — every other
  // contributing row keeps its current effective deduction unchanged — so
  // the sum always lands exactly on the new total with one deterministic
  // place the adjustment lives, rather than trying to split it proportionally
  // across every contributing row.
  const step = (itemId, currentTotal, dir) => {
    const unit = currentTotal > 0 && currentTotal < 1 ? 0.1 : 1;
    const newTotal = Math.max(0, Math.round((currentTotal + dir * unit) * 1000) / 1000);
    setItems((prev) => {
      let applied = false;
      return prev.map((item) => {
        if (applied || !item.recipe?.some((r) => r.itemId === itemId)) return item;
        const recipeRow = item.recipe.find((r) => r.itemId === itemId);
        const qty = Number(item.qty) || 0;
        const baseQty = Math.round((Number(recipeRow.qtyPerUnit) || 0) * qty * 1000) / 1000;
        const otherRowsTotal = currentTotal - (item.recipeOverrides?.[itemId] != null ? Number(item.recipeOverrides[itemId]) : baseQty);
        applied = true;
        return { ...item, recipeOverrides: { ...(item.recipeOverrides || {}), [itemId]: Math.max(0, Math.round((newTotal - otherRowsTotal) * 1000) / 1000) } };
      });
    });
  };

  return (
    <Box sx={{ px: 2.5, py: 1.75, borderTop: "1px solid rgba(0,0,0,0.06)", bgcolor: alpha(tokens.primary, 0.02) }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.6, mb: 1 }}>
        <Layers size={13} color={tokens.primary} />
        <Typography variant="caption" sx={{ fontWeight: 800, color: tokens.primary, fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Inventory items used (auto-deducts on save)
        </Typography>
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.6 }}>
        {grouped.map(({ itemId, total, contributors }) => {
          const comp = stockItems.find((i) => String(i.id) === String(itemId));
          const stock = Number(comp?.stock) || 0;
          const short = stock < total;
          const isZeroed = total === 0;
          const fromLabel = [...new Set(contributors.map((c) => c.sourceName))].join(", ");
          return (
            <Box key={itemId} sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", py: 0.4 }}>
              <Box sx={{ flex: "1 1 160px", minWidth: 120 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, fontSize: "0.82rem", textDecoration: isZeroed ? "line-through" : "none", color: isZeroed ? "text.disabled" : "text.primary" }}>
                  {comp?.name || "Unknown item"}
                </Typography>
                <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.68rem" }}>
                  from {fromLabel}
                </Typography>
              </Box>
              <Typography variant="caption" sx={{ color: short && !isZeroed ? tokens.error : "text.secondary", fontWeight: short && !isZeroed ? 700 : 500, fontSize: "0.72rem" }}>
                Stock: {stock} {comp?.unit || ""}{short && !isZeroed ? " · low" : ""}
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.3, bgcolor: alpha(tokens.primary, 0.06), border: `1px solid ${alpha(tokens.primary, 0.16)}`, borderRadius: "8px", px: 0.4, py: 0.25 }}>
                <IconButton size="small" onClick={() => step(itemId, total, -1)} sx={{ p: 0.4, color: "text.secondary" }}>
                  <Minus size={12} />
                </IconButton>
                <Typography variant="body2" sx={{ minWidth: 56, textAlign: "center", fontWeight: 800, fontSize: "0.85rem", color: isZeroed ? "text.disabled" : tokens.primary }}>
                  {isZeroed ? "0" : `−${total}`} {comp?.unit || ""}
                </Typography>
                <IconButton size="small" onClick={() => step(itemId, total, 1)} sx={{ p: 0.4, color: "text.secondary" }}>
                  <Plus size={12} />
                </IconButton>
              </Box>
              {isZeroed ? (
                <Tooltip title="Restore to recipe default">
                  <IconButton size="small" onClick={() => resetToDefault(itemId)} sx={{ color: tokens.primary }}>
                    <RotateCcw size={14} />
                  </IconButton>
                </Tooltip>
              ) : (
                <Tooltip title="Remove — don't deduct this for this sale">
                  <IconButton size="small" onClick={() => zeroOut(itemId)} sx={{ color: "text.disabled", "&:hover": { color: tokens.error, bgcolor: `${tokens.error}12` } }}>
                    <Trash2 size={14} />
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

const StatPill = ({ label, value, color = "primary", tokens }) => (
  <Box
    sx={{
      display: "inline-flex",
      alignItems: "center",
      gap: 0.5,
      px: 1.5,
      py: 0.6,
      borderRadius: "100px",
      bgcolor: color === "primary" ? tokens.primarySoft : tokens.successSoft,
      border: "1px solid",
      borderColor:
        color === "primary" ? tokens.primaryBorder : "rgba(100,116,139,0.18)",
    }}
  >
    <Typography
      variant="caption"
      sx={{
        fontWeight: 800,
        color: color === "primary" ? tokens.primary : tokens.success,
      }}
    >
      {value}
    </Typography>
    <Typography
      variant="caption"
      sx={{ color: "text.secondary", fontWeight: 500 }}
    >
      {label}
    </Typography>
  </Box>
);

const EnhancedCard = ({ children, accent = false, sx = {}, tokens }) => (
  <Card
    elevation={0}
    sx={{
      border: "1px solid",
      borderColor: accent ? tokens.primaryBorder : "rgba(0,0,0,0.07)",
      borderRadius: tokens.radius.lg,
      overflow: "hidden",
      boxShadow: tokens.shadow.card,
      transition: "box-shadow 0.2s ease",
      ...(accent && {
        borderTopWidth: "3px",
        borderTopColor: tokens.primary,
      }),
      "&:hover": {
        boxShadow: tokens.shadow.cardHover,
      },
      ...sx,
    }}
  >
    {children}
  </Card>
);

const GradientButton = React.forwardRef(({
  children,
  fullWidth = false,
  size = "large",
  disabled = false,
  onClick,
  startIcon,
  endIcon,
  tokens,
  sx = {},
}, ref) => (
  <Button
    ref={ref}
    variant="contained"
    fullWidth={fullWidth}
    size={size}
    disabled={disabled}
    onClick={onClick}
    startIcon={startIcon}
    endIcon={endIcon}
    sx={{
      background: disabled
        ? undefined
        : `linear-gradient(135deg, ${tokens.primaryDark} 0%, ${tokens.primaryLight} 100%)`,
      boxShadow: tokens.shadow.btn,
      borderRadius: tokens.radius.md,
      fontWeight: 800,
      textTransform: "none",
      letterSpacing: "0.01em",
      transition: "all 0.2s ease",
      "&:hover": {
        background: `linear-gradient(135deg, ${tokens.primary} 0%, ${tokens.primaryDark} 100%)`,
        boxShadow: tokens.shadow.btnHover,
        transform: "translateY(-1px)",
      },
      "&:active": { transform: "translateY(0)" },
      ...sx,
    }}
  >
    {children}
  </Button>
));
GradientButton.displayName = "GradientButton";

/* ─── Barcode input row (desktop only) ─── */
const BarcodeInputRow = ({ tokens, onScan, onOpenScanner, inputRef }) => {
  const [value, setValue] = React.useState('');
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

// navigator.canShare({ files }) reports `true` on some desktop browsers
// (Chrome/Edge on Windows) even though invoking navigator.share there opens
// an OS share sheet whose default/save target writes the file to disk as
// its own side effect — on top of whatever the user does with the share
// sheet. That produced a second, indistinguishable "download" for a single
// click. The Web Share API for files is really a mobile/touch affordance,
// so only take that path on platforms that are actually mobile — every
// desktop browser instead always goes through the single deterministic
// <a download> click below, which is a one-shot action with no separate
// OS-level save step.
const canUseFileShare = (fileOrFiles) => {
  const files = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
  if (!navigator.canShare?.({ files })) return false;
  const isMobileUA = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  const isMobilePlatform = navigator.userAgentData?.mobile;
  return isMobilePlatform ?? isMobileUA;
};

// Same normalization SendDialog.jsx uses for a WhatsApp number.
const cleanWaPhone = (raw = '') => {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('91') && digits.length === 12) return digits;
  if (digits.length === 10) return `91${digits}`;
  return digits;
};

// Can this exact file go on the system clipboard? The Clipboard API only
// accepts a small sanitized set of MIME types (Chrome/Edge: text/plain,
// text/html, and image/png) — PDFs are rejected outright (NotAllowedError),
// so this only ever returns true for the PNG image path.
const canCopyFileToClipboard = (file) => {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') return false;
  if (file.type !== 'image/png') return false;
  try { return ClipboardItem.supports ? ClipboardItem.supports(file.type) : true; }
  catch { return true; }
};

// Hands a generated file (PDF or image) to the user. There is no browser API
// that can push a file straight into WhatsApp without a manual step on
// desktop — this picks the least-manual path available for the file type:
//  - Mobile: navigator.share({ files }) opens the OS share sheet with the
//    file already attached; WhatsApp is one tap away from there.
//  - Desktop, PNG image + toWhatsApp: copies the image to the system
//    clipboard (WhatsApp Web's chat box accepts Ctrl+V/Cmd+V paste of an
//    image directly — no drag-and-drop needed) instead of downloading it.
//  - Desktop, everything else (PDF, or not going to WhatsApp): downloads the
//    file; when `toWhatsApp` is set, also opens the chat so the file — now
//    in Downloads — can be dragged in (WhatsApp Web has no paste support for
//    PDFs, and browsers can't put a PDF on the clipboard at all).
// Returns a status the caller uses to show the right follow-up message.
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
      // fall through to the download path below
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

/* ─── Main Component ─── */
const SalesPage = ({ mode = "sales", tabId }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  // lg is the breakpoint at which the create/edit screen gains its
  // always-visible right rail (customer preview / summary). Below it, that
  // same content is reached through a dialog instead.
  const isLgUp = useMediaQuery(theme.breakpoints.up('lg'));
  const tokens = React.useMemo(() => getThemeTokens(theme), [theme]);
  const { t } = useI18n();
  const { confirm, showAlert } = useDialog();
  const isSale = mode === "sales";
  const { currentBusiness } = useBusiness();

  const { data, addItem, updateItem, updateItems, deleteItem, getItems, syncFromCloud } = useData();
  const { config } = useConfig();
  const { staffSession } = useAuth();
  const { activeTabId, updateTab, openTab } = useTabs();
  // TallyKraft billing: writes are blocked at the data layer when the business
  // subscription is inactive; canWrite additionally greys the Save button so the
  // user gets an explicit signal rather than a silent no-op.
  const { isBusinessActive } = useSubscription();
  const canWrite = isBusinessActive(currentBusiness?.id);
  const thisPath = mode === "purchase" ? "/purchases" : "/sales";
  // True only when THIS specific Sales tab instance is the active tab
  const isActiveTab = useMemo(() => activeTabId === tabId, [activeTabId, tabId]);
  const isActiveTabRef = useRef(isActiveTab);
  useEffect(() => { isActiveTabRef.current = isActiveTab; }, [isActiveTab]);
  const canViewPurchasePrice = !staffSession || staffSession.role === 'admin' || !!staffSession.features?.viewPurchasePrice;
  // "Billed By" should read "Admin" for the business owner/admin regardless of
  // how they logged in — Google sign-in (!staffSession) or business code +
  // admin password (staffSession.role === 'admin', whose session.name is the
  // business name, not a person). Only a real non-admin staff member's own
  // name should show here.
  const isAdminUser = !staffSession || staffSession.role === 'admin';
  const ownerName = isAdminUser ? 'Admin' : staffSession.name;
  const salesStaff = getItems('staffMembers').filter(s => s.businessId === currentBusiness?.id && s.showInSalesSelector === true && s.status === 'active');
  const location = useLocation();
  const barcodeScanEnabled = !!config.features?.barcode;

  const [view, setView] = useState("list");
  const [editId, setEditId] = useState(null);
  // Stable local id for a NOT-YET-SAVED new invoice, so reference images can
  // be attached (and stored in local IndexedDB) while the user is still
  // filling out the form, before Save has ever run. Regenerated each time
  // resetForm() sets up a fresh "new invoice" — see resetForm below. On
  // save, this exact value is used as the record's real `id` (addItem
  // respects a caller-supplied id), so images attached during the draft
  // never need to be re-keyed to a different id afterward.
  const [newRecordId, setNewRecordId] = useState(() => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `new_${Date.now()}`));
  const [referenceImageIds, setReferenceImageIds] = useState([]);
  const referenceImagesEnabled = !!config.features?.referenceImages;
  // Per-row "more actions" menu (Share / Download PDF / Download Image /
  // Delete) — Edit and Received Payment stay as always-visible direct
  // shortcuts, everything else collapses behind this one icon so the row
  // doesn't need 6-7 icon buttons crammed into it. Holds the anchor element
  // AND which transaction it's for, since the list can render many rows.
  const [rowMoreMenu, setRowMoreMenu] = useState({ anchorEl: null, tx: null });
  // Which record's attached reference images are being viewed full-screen.
  const [imageViewerRecordId, setImageViewerRecordId] = useState(null);
  const [selectedParty, setSelectedParty] = useState(null);
  const [invoiceDate, setInvoiceDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [invoiceTime, setInvoiceTime] = useState(
    () => { const d = new Date(); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
  );
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [items, setItems] = useState([
    {
      itemId: "",
      name: "",
      qty: "",
      price: "",
      taxRate: 0,
      discountPercent: "",
      taxInclusive: false,
      total: 0,
    },
  ]);
  const [description, setDescription] = useState("");
  const [noGST, setNoGST] = useState(false);
  // Which item rows have their Unit/Discount/GST fields expanded — collapsed
  // by default to keep each row to a single compact line; a row auto-shows
  // as expanded (see rowHasExtras below) once any of those fields is set,
  // so existing data is never hidden behind a closed toggle.
  const [expandedRowKeys, setExpandedRowKeys] = useState(() => new Set());
  const [discountPercent, setDiscountPercent] = useState("");
  // Persisted (not plain useState) — the %/₹ mode is a preference the user
  // picks once and expects to stick around across a reload, not a per-
  // invoice value like discountPercent itself; previously reset to
  // 'percent' every time.
  const [discountType, setDiscountType] = usePersistedState("sales_discountType", "percent"); // 'percent' | 'amount'
  const [printingTx, setPrintingTx] = useState(null);
  const [printTrigger, setPrintTrigger] = useState(0);
  const [paperSize, setPaperSize] = useState(() => config.billPrintOptions?._paperSize || config.defaultPaperSize || 'A4');
  React.useEffect(() => {
    const ps = config.billPrintOptions?._paperSize || config.defaultPaperSize;
    if (ps) setPaperSize(ps);
  }, [config.billPrintOptions?._paperSize, config.defaultPaperSize]);
  const printRef = useRef();
  const pdfRef = useRef();
  const _shareInFlight = useRef(false);
  const _shareCancelledRef = useRef(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);

  // Esc dismisses the "Preparing to share…" / "Generating PDF…" overlay —
  // the in-flight capture/share promise still resolves in the background,
  // but the cancel flag stops it before it opens navigator.share or downloads.
  useEffect(() => {
    if (!pdfLoading && !shareLoading) return;
    const onEsc = (e) => {
      if (e.key !== 'Escape') return;
      _shareCancelledRef.current = true;
      _shareInFlight.current = false;
      setPdfLoading(false);
      setShareLoading(false);
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [pdfLoading, shareLoading]);

  // ── Bulk print — stacks the selected transactions into one hidden print
  // container (page-break between each) so the browser print dialog and any
  // "save as PDF" produces a single multi-page document, one bill per page.
  const bulkPrintRef = useRef();
  const [bulkPrintTxs, setBulkPrintTxs] = useState([]);
  const [bulkPrintTrigger, setBulkPrintTrigger] = useState(0);
  const [bulkPrintLoading, setBulkPrintLoading] = useState(false);

  const [paymentMode, setPaymentMode] = useState("Cash");
  const [splitCash, setSplitCash] = useState("");
  const [splitBank, setSplitBank] = useState("");
  // 'paid' = cash/bank sale (money received now), 'credit' = credit sale (money owed)
  // Default comes from config; Sales default = credit, Purchases default = paid
  const [saleType, setSaleType] = useState(() => config.defaultSaleTypeSales ?? 'credit');

  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [salesImportOpen, setSalesImportOpen] = useState(false);
  const [purchaseBulkAddOpen, setPurchaseBulkAddOpen] = useState(false);
  const [purchaseBulkEditOpen, setPurchaseBulkEditOpen] = useState(false);
  const [purchaseImportOpen, setPurchaseImportOpen] = useState(false);
  const [advance, setAdvance] = useState("");
  const [advanceMode, setAdvanceMode] = useState("Cash");
  const [advanceSplitCash, setAdvanceSplitCash] = useState("");
  const [advanceSplitBank, setAdvanceSplitBank] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [loyaltyRedeemPoints, setLoyaltyRedeemPoints] = useState(0);
  const [loyaltyRedeemValue, setLoyaltyRedeemValue] = useState(0);
  // Controls the mobile/tablet Customer/Vendor Preview dialog (the desktop
  // side panel further down is always-on and unaffected by this) — starts
  // closed, same convention as POS's own equivalent.
  const [showCustomerPanel, setShowCustomerPanel] = useState(false);
  const taxMode = "exclusive";
  const [selectedBilledBy, setSelectedBilledBy] = useState('');
  const [gstType, setGstType] = useState('auto'); // kept for loading saved invoices; auto-derived from items at runtime

  const [pfProduct, setPfProduct] = useState(null);
  const [pfDate, setPfDate] = useState(
    () => new Date().toISOString().split("T")[0],
  );
  const [pfNoGST, setPfNoGST] = useState(false);
  const [pfCustomers, setPfCustomers] = useState([
    { _key: 1, party: null, qty: 1, price: "", discountPercent: "" },
  ]);
  const [pfIsSaving, setPfIsSaving] = useState(false);
  const [snack, setSnack] = useState({
    open: false,
    message: "",
    severity: "success",
  });

  const [quickAddParty, setQuickAddParty] = useState({
    open: false,
    name: "",
    phone: "",
    balance: "",
  });
  const quickAddPartyCallbackRef = useRef(null);
  // Edit dialog for the currently-selected customer/vendor — opened from the
  // preview panel's Edit button. Separate from quickAddParty (create-new)
  // since PartyFormDialog needs editingParty populated, not null.
  const [editPartyOpen, setEditPartyOpen] = useState(false);
  // "+ New item" opens the shared full item-creation dialog (same as the Items page).
  const [itemDialog, setItemDialog] = useState({ open: false, name: "" });
  const itemDialogCallbackRef = useRef(null);
  const savingRef = useRef(false);
  const formIsInterState = !!(currentBusiness?.state && selectedParty?.state && currentBusiness.state !== selectedParty.state);
  // Derive GST type from items: composite wins; then inter-state (IGST); then UTGST if any item has utgstRate set; else CGST+SGST
  const effectiveGstType = (() => {
    const activeItems = items.filter(i => (i.itemId || i.name?.trim()) && Number(i.qty) > 0);
    // composite wins if any item is composite scheme
    if (activeItems.some(i => i.isComposite)) return 'composite';
    // if all active items have an explicit gstType, use the dominant one
    const typedItems = activeItems.filter(i => i.gstType && i.gstType !== 'auto');
    if (typedItems.length > 0) {
      // Priority: igst > utgst > composite > cgst_sgst
      if (typedItems.some(i => i.gstType === 'igst')) return 'igst';
      if (typedItems.some(i => i.gstType === 'utgst')) return 'utgst';
      if (typedItems.some(i => i.gstType === 'composite')) return 'composite';
      return 'cgst_sgst';
    }
    // Legacy fallback: derive from party inter-state / utgstRate
    if (formIsInterState) return 'igst';
    if (activeItems.some(i => Number(i.utgstRate) > 0 && Number(i.cgstRate) === Number(i.utgstRate))) return 'utgst';
    return 'cgst_sgst';
  })();
  const isComposite = effectiveGstType === 'composite';
  const useIGST = effectiveGstType === 'igst';
  const useUTGST = effectiveGstType === 'utgst';
  const useCGSTSGST = !useIGST && !useUTGST && !isComposite;

  // Detect mixed GST types — not GST-compliant on a single invoice
  const mixedGstWarning = (() => {
    const activeItems = items.filter(i => (i.itemId || i.name?.trim()) && Number(i.qty) > 0 && Number(i.taxRate) > 0);
    if (activeItems.length < 2) return null;
    const typedItems = activeItems.filter(i => i.gstType && i.gstType !== 'auto');
    if (typedItems.length === 0) return null;
    const types = [...new Set(typedItems.map(i => i.gstType))];
    const hasIGST = types.includes('igst');
    const hasCGST = types.includes('cgst_sgst');
    const hasUTGST = types.includes('utgst');
    if ((hasIGST && hasCGST) || (hasIGST && hasUTGST)) {
      const igstItems = typedItems.filter(i => i.gstType === 'igst').map(i => i.name || 'Item').join(', ');
      const intraItems = typedItems.filter(i => i.gstType !== 'igst').map(i => i.name || 'Item').join(', ');
      return { igstItems, intraItems };
    }
    return null;
  })();
  const keepDataOnNewRef = useRef(false);
  const pendingScannedItemRef = useRef(null);
  const pendingConvertRef = useRef(null);
  // Tracks which Estimate/Order (if any) the CURRENT draft was converted
  // from, so handleSave can stamp sourceEstimateId/sourceOrderId on the new
  // sale and Estimates/Orders can detect + link back to it. Cleared by
  // resetForm() on every fresh "New Invoice", set only when a pending
  // convert payload is actually consumed.
  const convertSourceRef = useRef(null);
  const gModeRef = useRef(false);
  const gModeTimerRef = useRef(null);
  const viewRef = useRef(view);
  // Stable refs for the One by One keyboard-advance listener below (see its
  // own useEffect, registered once with an empty dep array — same pattern
  // as viewRef/isActiveTabRef above/nearby).
  const obActiveRef = useRef(false);
  const obStepRef = useRef("party");
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);
  // After picking (or creating) a party in One by One mode, focus moves
  // here so the next Enter press activates the Continue button natively —
  // same fix POS.jsx already needed for its own equivalent flow: an
  // Autocomplete's Enter-to-select doesn't reliably blur the field
  // afterward, so without this a second Enter while focus is still stuck in
  // the input never reaches the window-level advance listener at all.
  const obContinueBtnRef = useRef(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [paymentQrOpen, setPaymentQrOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTx, setPreviewTx] = useState(null);
  // Desktop master-detail: the transaction shown in the side preview pane.
  const [selectedTx, setSelectedTx] = useState(null);
  const closeTxPreview = () => setSelectedTx(null);
  const selectTx = (tx) => setSelectedTx(tx);
  const [txViewMode, setTxViewMode] = useState(() => loadViewMode(mode));
  const changeTxViewMode = (m) => {
    setTxViewMode(m);
    saveViewMode(mode, m);
    // Grid tiles are much smaller than list rows — default to a larger page
    // size in grid mode so the extra width/space it uses is actually filled.
    setRowsPerPage(m === 'grid' ? 30 : 10);
    setPage(0);
  };
  const txListContainerRef = useRef(null);
  const txFillHeight = useFillHeight(txListContainerRef, { bottomGap: 16, fallbackPx: 500 });
  const [sendOpen, setSendOpen] = useState(false);
  const [sendTx, setSendTx] = useState(null);
  const [sendParty, setSendParty] = useState(null);
  // When set, the next SendDialog open uses this as a fixed message instead
  // of SendDialog's own default invoice-summary text — used for the overdue
  // payment reminder message.
  const [sendInitialMessage, setSendInitialMessage] = useState(undefined);
  const [sendDialogTitle, setSendDialogTitle] = useState(undefined);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkSendOpen, setBulkSendOpen] = useState(false);
  const [moreMenuAnchor, setMoreMenuAnchor] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  // "Received Payment" / "Payment Made" dialog — lets the user pick Cash /
  // Bank / Split before settling an invoice's outstanding balance, instead
  // of always assuming Cash.
  const [receivePayDialog, setReceivePayDialog] = useState({ open: false, tx: null, outstanding: 0 });
  const [receivePayMode, setReceivePayMode] = useState('Cash');
  const [receivePaySplitCash, setReceivePaySplitCash] = useState('');
  const [receivePaySplitBank, setReceivePaySplitBank] = useState('');
  const [receivePayDate, setReceivePayDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [receivePayLess, setReceivePayLess] = useState('');
  const [receivePayNotes, setReceivePayNotes] = useState('');
  const [receivePaySaving, setReceivePaySaving] = useState(false);

  // Invoice previews auto-scale to fit their container via <FitPreview>.
  const [roundOff, setRoundOff] = useState(() => config.billPrintOptions?.autoRoundOff ? 1 : 0); // 0=off, +1/+2/+3=round-up to 1/10/100, -1/-2/-3=round-down
  const [packingCharge, setPackingCharge] = useState("");
  const [shippingCharge, setShippingCharge] = useState("");

  const [filters, setFilters] = useState({
    dateFrom: "",
    dateTo: "",
    partyId: "",
    minAmount: "",
    maxAmount: "",
    search: "",
  });
  // The search TextField's value stays bound to filters.search directly (so
  // typing feels instant) but the expensive part — filtering+sorting the
  // full 16k+ row transactions list in the memo below — only re-runs 200ms
  // after the user stops typing, instead of on every keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(filters.search), 200);
    return () => clearTimeout(id);
  }, [filters.search]);
  // "all" | "paid" | "unpaid" | "overdue" — real values tx.status actually
  // holds are 'paid'/'unpaid'; "overdue" is derived from dueDate below.
  const [quickStatus, setQuickStatus] = useState("all");
  const [datePreset, setDatePreset] = useState("all");
  const [sortBy, setSortBy] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [showFilters, setShowFilters] = useState(false);
  const [entryMode, setEntryMode] = useState("customer");
  // One by One mode — a guided, step-at-a-time create/edit flow, same
  // philosophy as POS.jsx's own oneByOneMode: sections stay mounted the
  // whole time (so nothing loses state switching steps), only their
  // visibility toggles via `display`. Sales.jsx's own flow is 3 steps
  // (Party → Items → Review & Checkout) rather than POS's 3 (Products →
  // Customer → Checkout) — Sales is invoice-first, not cart-first, so it
  // starts by picking who the invoice is for, and Discount/Extras/Payment
  // Mode/Advance are kept together with the totals+Save button on the final
  // step exactly as they already sit together in the Summary Sidebar, rather
  // than splitting that tightly-integrated block into two separate steps.
  const [obMode, setObMode] = usePersistedState("sales_obMode", false);
  const [obStep, setObStep] = useState("party"); // 'party' | 'items' | 'review'
  // One by One only applies to a brand-new invoice in the standard (Customer
  // First) entry mode — editing an existing invoice needs immediate access
  // to everything at once rather than re-walking a guided flow, and Product
  // First already has its own distinct one-product-to-many-customers layout
  // a linear step wizard doesn't fit. Computed at top level (not just inside
  // the Customer First render branch) so the keyboard-advance listener
  // below can keep a ref of it in sync.
  const obActive = obMode && view === "create" && entryMode === "customer";
  useEffect(() => { obActiveRef.current = obActive; }, [obActive]);
  useEffect(() => { obStepRef.current = obStep; }, [obStep]);
  // Landing on the Items step (via Continue, Back, or a step-chip click)
  // should put the caret straight into the first empty row's item field —
  // without this, arriving at the step still requires a mouse click just to
  // start typing, which defeats the point of a keyboard-first flow. Only
  // focuses an EMPTY row (never steals focus from a row the user already
  // filled in and is now reviewing before hitting Continue).
  useEffect(() => {
    if (!obActive || obStep !== "items") return;
    const emptyIdx = itemsRef.current.findIndex((i) => !i.itemId && !i.name?.trim());
    if (emptyIdx >= 0) focusItemRowField(emptyIdx, "item", { select: false });
  }, [obActive, obStep]);
  // Deferred a tick so it runs after PartySelect's/PartyFormDialog's own
  // focus handling settles (same 50ms POS.jsx already found necessary for
  // its equivalent flow) — calling it synchronously inside onChange can lose
  // the race against the Autocomplete's own internal focus management.
  const obFocusContinue = () => setTimeout(() => obContinueBtnRef.current?.focus(), 50);

  // ── Item-row keyboard navigation ────────────────────────────────────────
  // Registry of the focusable fields of every item row, keyed by row index:
  //   itemRowRefs.current[index] = { item, qty, price }
  // Populated by each row's own inputRef callbacks below. Refs (not state) so
  // registering a field never triggers a re-render mid-typing.
  const itemRowRefs = useRef([]);
  const registerItemRowField = (index, field) => (el) => {
    if (!itemRowRefs.current[index]) itemRowRefs.current[index] = {};
    itemRowRefs.current[index][field] = el;
  };
  const focusItemRowField = (index, field, { select = true } = {}) => {
    // Deferred a frame: the target row may have only just been added (or
    // re-rendered after a value change), so its input element isn't
    // necessarily mounted//registered yet at the moment the key was handled.
    setTimeout(() => {
      const el = itemRowRefs.current[index]?.[field];
      if (!el) return;
      el.focus();
      if (select && typeof el.select === "function") el.select();
    }, 0);
  };
  // Adds a row AND lands the caret in its item field, so "keep adding items"
  // is a single repeatable keystroke rather than add-then-hunt-for-the-field.
  const addItemRowAndFocus = () => {
    const nextIndex = itemsRef.current.length;
    addItemRow();
    focusItemRowField(nextIndex, "item", { select: false });
  };
  // Shared keydown for the Qty / Rate fields of a row: Enter walks forward
  // through the row and then into the next row (adding one at the end),
  // Arrow Up/Down move to the same field of the row above/below. Deliberately
  // NOT bound to the item-name field's Enter — that keystroke belongs to the
  // Autocomplete (it commits the highlighted option); the jump to Qty happens
  // in that component's own onChange instead, once a selection actually lands.
  //
  // Shift+Enter on the Rate field is the explicit "done adding items, go to
  // Review" gesture. Without this, a keyboard-only user in Guided mode had no
  // way out of the items step at all: plain Enter always either moves to the
  // next field or adds another row (never leaves a text field focused), and
  // the global step-advance handler below only fires when focus is NOT in a
  // text input — so once inside these fields there was no reachable path to
  // Continue. Kept as a distinct chord (not plain Enter) so it can never be
  // pressed by accident while genuinely trying to add one more item.
  const itemFieldKeyDown = (index, field) => (e) => {
    if (e.key === "ArrowDown" && index < itemsRef.current.length - 1) {
      e.preventDefault();
      focusItemRowField(index + 1, field);
    } else if (e.key === "ArrowUp" && index > 0) {
      e.preventDefault();
      focusItemRowField(index - 1, field);
    } else if (e.key === "Enter" && e.shiftKey && field === "price" && obActiveRef.current) {
      const hasValidItem = itemsRef.current.some(
        (i) => (i.itemId || i.name?.trim()) && Number(i.qty) > 0 && Number(i.price) >= 0
      );
      if (hasValidItem) {
        e.preventDefault();
        setObStep("review");
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (field === "qty") {
        focusItemRowField(index, "price");
      } else if (index === itemsRef.current.length - 1) {
        // Enter on the Rate of the LAST row is the "next item please"
        // gesture — the single most repeated action when keying in an
        // invoice, so it creates the row and focuses it in one press.
        addItemRowAndFocus();
      } else {
        focusItemRowField(index + 1, "item", { select: false });
      }
    }
  };
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

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
  // cold first print, e.g. going straight to Sales without visiting
  // anywhere else that happened to draw a QR first).
  const handlePrint = useReactToPrint({ contentRef: printRef, pageStyle: getPaperPageStyle(paperSize), onBeforePrint: waitForQrReady });
  const handleBulkPrint = useReactToPrint({ contentRef: bulkPrintRef, pageStyle: getPaperPageStyle(paperSize), onBeforePrint: waitForQrReady });

  // Manual refresh — the app already syncs with Firestore automatically on a
  // timer and on tab focus (via a cheap change-probe that only pulls full
  // data when something actually changed), but a user who just saved an
  // invoice on another device doesn't want to wait; { full: true } forces
  // the full read so "Refresh" is never a no-op from their point of view.
  const handleManualRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const result = await syncFromCloud?.({ full: true });
      const messages = {
        updated: { message: 'Refreshed — new data loaded.', severity: 'success' },
        unchanged: { message: 'Already up to date.', severity: 'info' },
        offline: { message: 'You are offline — showing locally saved data.', severity: 'warning' },
        saving: { message: 'A save is in progress — try again in a moment.', severity: 'info' },
        busy: { message: 'A sync is already in progress.', severity: 'info' },
        error: { message: 'Refresh failed — check your connection and try again.', severity: 'error' },
        unauthenticated: { message: 'Refresh failed — please sign in again.', severity: 'error' },
      };
      const { message, severity } = messages[result?.status] || messages.error;
      setSnack({ open: true, message, severity });
    } finally {
      setRefreshing(false);
    }
  };

  const parties = useMemo(() => getItems("parties").filter(
    (p) =>
      p.businessId === currentBusiness?.id &&
      p.type === (isSale ? "Customer" : "Vendor"),
  ), [data.parties, currentBusiness?.id, isSale]);
  const stockItems = useMemo(() => getItems("items").filter(
    (item) => item.businessId === currentBusiness?.id && item.showInSalesAndPOS !== false,
  ), [data.items, currentBusiness?.id]);

  // id → record maps for estimates/orders — used only to render the "From
  // Estimate"/"From Order" chip on a sale that carries sourceEstimateId/
  // sourceOrderId (stamped by handleSave when converting one of those into
  // this sale, see line ~1544 below); a plain Purchase never has either
  // field set, so these are harmless no-ops there.
  const estimatesById = useMemo(() => {
    const map = new Map();
    (data.estimates || []).forEach((e) => { if (e.businessId === currentBusiness?.id) map.set(e.id, e); });
    return map;
  }, [data.estimates, currentBusiness?.id]);
  const ordersById = useMemo(() => {
    const map = new Map();
    (data.orders || []).forEach((o) => { if (o.businessId === currentBusiness?.id) map.set(o.id, o); });
    return map;
  }, [data.orders, currentBusiness?.id]);

  // Deep-links to the exact source estimate/order — same cross-tab hand-off
  // pattern as editTx (Estimates.jsx/Orders.jsx both listen for
  // dashboard-quick-new and open that specific record's preview), mirroring
  // how their own "Converted" chip already jumps straight to this sale.
  const viewSourceEstimate = (estimateId) => {
    openTab('/estimates', 'Estimates', { duplicate: false });
    dispatchQuickNew({ path: '/estimates', intent: 'viewEstimate', estimateId });
  };
  const viewSourceOrder = (orderId) => {
    openTab('/orders', 'Orders', { duplicate: false });
    dispatchQuickNew({ path: '/orders', intent: 'viewOrder', orderId });
  };

  useEffect(() => {
    if (!location.state?.scannedBarcode) return;
    const { scannedBarcode, scannedItem } = location.state;
    window.history.replaceState({}, document.title);
    const found =
      scannedItem ||
      (() => {
        const allItems = getItems("items").filter(
          (i) => i.businessId === currentBusiness?.id,
        );
        return allItems.find(
          (i) => i.barcode === scannedBarcode || i.itemCode === scannedBarcode || String(i.id) === scannedBarcode,
        );
      })();
    if (found) {
      // Store the found item in the ref so the view-reset effect can pick it up
      // instead of being overwritten by that effect.
      pendingScannedItemRef.current = { found, isSaleAtTime: isSale };
      setView("create");
      setSnack({ open: true, message: `${found.name} added from scan`, severity: "success" });
    } else {
      setSnack({ open: true, message: `No item found for barcode: ${scannedBarcode}`, severity: "warning" });
    }
  }, [location.state]); // eslint-disable-line

  const handleBarcodeScan = (barcode) => {
    // Auto-open create form if currently in list view
    if (view !== "create") {
      setView("create");
    }
    const stockItems = getItems("items").filter(
      (i) => i.businessId === currentBusiness?.id,
    );
    const foundItem = stockItems.find(
      (i) => i.barcode === barcode || i.itemCode === barcode || String(i.id) === barcode,
    );
    if (!foundItem) {
      setSnack({
        open: true,
        message: `No item found for barcode: ${barcode}`,
        severity: "warning",
      });
      return;
    }
    const price =
      Number(isSale ? (foundItem.salePrice ?? foundItem.price) : (foundItem.purchasePrice ?? foundItem.price)) || 0;
    const taxRate = Number(foundItem.taxRate) || 0;
    const discountPercent = isSale && Number(foundItem.discount) ? Number(foundItem.discount) : "";
    const newRow = {
      itemId: foundItem.id,
      name: foundItem.name,
      qty: 1,
      price: price || "",
      taxRate,
      discountPercent,
      taxInclusive: !!foundItem.taxInclusive,
      hsnCode: foundItem.hsnCode || '',
      unit: foundItem.unit || '',
      total: !!foundItem.taxInclusive
        ? price * (1 - (Number(discountPercent) || 0) / 100)
        : price * (1 - (Number(discountPercent) || 0) / 100) * (1 + taxRate / 100),
    };
    // If this item is already in the invoice, just increment its quantity
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
        updated[existingIdx] = { ...existing, qty: newQty, total: newTotal, amountDraft: undefined, qtyDisplay: undefined };
        return updated;
      });
      setSnack({ open: true, message: `${foundItem.name} ×${items[existingIdx] ? (Number(items[existingIdx].qty) || 0) + 1 : 2}`, severity: 'success' });
      return;
    }
    const emptyIdx = items.findIndex((i) => !i.itemId);
    if (emptyIdx >= 0) {
      setItems((prev) => {
        const updated = [...prev];
        updated[emptyIdx] = { ...updated[emptyIdx], ...newRow };
        return updated;
      });
    } else {
      setItems((prev) => [...prev, newRow]);
    }
    setSnack({
      open: true,
      message: `Added: ${foundItem.name}`,
      severity: "success",
    });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const [year, month, day] = dateStr.split("-");
    return `${day}/${month}/${year}`;
  };

  const generateInvoiceNumber = (date, isSaleMode) => {
    const prefix = isSaleMode
      ? (config.invoiceNumberConfig?.salesPrefix || 'INV')
      : (config.invoiceNumberConfig?.purchasePrefix || 'BILL');
    const startNum = isSaleMode
      ? (config.invoiceNumberConfig?.salesStartingNumber || 1)
      : (config.invoiceNumberConfig?.purchaseStartingNumber || 1);
    const counterOverride = isSaleMode
      ? config.invoiceNumberConfig?.salesCounterOverride
      : config.invoiceNumberConfig?.purchaseCounterOverride;
    // If a reset was requested from Settings, use the override directly and clear it
    if (counterOverride != null) {
      const overrideKey = isSaleMode ? 'salesCounterOverride' : 'purchaseCounterOverride';
      const next = `${prefix}-${String(counterOverride).padStart(4, '0')}`;
      // Clear the override asynchronously so the next generation resumes normal auto-increment
      saveConfig({ ...config, invoiceNumberConfig: { ...(config.invoiceNumberConfig || {}), [overrideKey]: null } });
      return next;
    }
    const existing = getItems(isSaleMode ? 'sales' : 'purchases').filter(
      (tx) => tx.businessId === currentBusiness?.id && tx.invoiceNumber?.startsWith(prefix + '-')
    );
    let maxSerial = startNum - 1;
    existing.forEach((tx) => {
      const parts = tx.invoiceNumber.split('-');
      const serial = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(serial) && serial > maxSerial) maxSerial = serial;
    });
    return `${prefix}-${String(maxSerial + 1).padStart(4, '0')}`;
  };

  const tableName = isSale ? "sales" : "purchases";
  // Keep the side-preview selection in sync with live data (after edits/saves)
  // and drop it if the record disappears.
  useEffect(() => {
    if (!selectedTx) return;
    const live = getItems(tableName).find((t) => t.id === selectedTx.id);
    if (!live) setSelectedTx(null);
    else if (live !== selectedTx) setSelectedTx(live);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data[tableName], tableName, selectedTx]);

  // Indexes both phone and altPhone so invoice search-by-phone (below) can
  // match either — was previously keyed only on [currentBusiness?.id], so
  // this map went stale (and search-by-phone silently stopped matching)
  // after any party's phone/altPhone was added or edited without a full
  // page reload; now recomputes whenever party data actually changes.
  const phoneToPartyIds = useMemo(() => {
    const map = {};
    const addDigits = (digits, id) => {
      if (!digits) return;
      if (!map[digits]) map[digits] = new Set();
      map[digits].add(id);
    };
    getItems("parties")
      .filter(p => p.businessId === currentBusiness?.id && (p.phone || p.altPhone))
      .forEach(p => {
        addDigits(String(p.phone || '').replace(/\D/g, ''), p.id);
        addDigits(String(p.altPhone || '').replace(/\D/g, ''), p.id);
      });
    return map;
  }, [data.parties, currentBusiness?.id]); // eslint-disable-line

  // Quick date-range presets shown in the header, layered on top of the
  // From/To fields in the filter panel (a preset just fills those in).
  const datePresetRange = (preset) => {
    const now = new Date();
    const toISO = (d) => d.toISOString().split("T")[0];
    if (preset === "today") return { from: toISO(now), to: toISO(now) };
    if (preset === "week") {
      const day = now.getDay() || 7;
      const monday = new Date(now); monday.setDate(now.getDate() - day + 1);
      return { from: toISO(monday), to: toISO(now) };
    }
    if (preset === "month") {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toISO(first), to: toISO(now) };
    }
    if (preset === "year") {
      const first = new Date(now.getFullYear(), 0, 1);
      return { from: toISO(first), to: toISO(now) };
    }
    return null;
  };

  // Memoized so a full filter+sort pass over every sale/purchase only runs
  // when the underlying data or an actual filter/sort input changes — not
  // on every render (tab switches, unrelated state updates, keystrokes in
  // other fields, etc.), which is what caused visible lag on large datasets.
  const transactions = useMemo(() => getItems(tableName)
    .filter((tx) => tx.businessId === currentBusiness?.id)
    .filter((tx) => {
      if (debouncedSearch) {
        const s = debouncedSearch.toLowerCase();
        const sDigits = s.replace(/\D/g, '');
        const matchedByPhone = sDigits.length >= 4 && Object.entries(phoneToPartyIds).some(
          ([digits, ids]) => digits.includes(sDigits) && ids.has(tx.partyId)
        );
        if (
          !tx.partyName?.toLowerCase().includes(s) &&
          !tx.invoiceNumber?.toLowerCase().includes(s) &&
          !matchedByPhone
        )
          return false;
      }
      const preset = datePresetRange(datePreset);
      const effFrom = filters.dateFrom || preset?.from;
      const effTo = filters.dateTo || preset?.to;
      if (effFrom && new Date(tx.date) < new Date(effFrom)) return false;
      if (effTo && new Date(tx.date) > new Date(effTo)) return false;
      if (filters.partyId && tx.partyId !== filters.partyId) return false;
      if (filters.minAmount && tx.totalAmount < parseFloat(filters.minAmount))
        return false;
      if (filters.maxAmount && tx.totalAmount > parseFloat(filters.maxAmount))
        return false;
      if (quickStatus === "paid" && tx.status !== "paid") return false;
      if (quickStatus === "unpaid" && tx.status !== "unpaid") return false;
      if (quickStatus === "overdue") {
        const overdue = tx.dueDate && tx.status !== "paid" && new Date(tx.dueDate + "T00:00:00") < new Date();
        if (!overdue) return false;
      }
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortBy === "amount") cmp = (a.totalAmount || 0) - (b.totalAmount || 0);
      else if (sortBy === "party") cmp = (a.partyName || "").localeCompare(b.partyName || "", undefined, { numeric: true, sensitivity: 'base' });
      else if (sortBy === "invoiceNumber") cmp = (a.invoiceNumber || "").localeCompare(b.invoiceNumber || "", undefined, { numeric: true, sensitivity: 'base' });
      else {
        // Date sort: same-date invoices previously kept whatever order the
        // underlying array happened to have (no tiebreaker), which looked
        // like "not properly arranged" when several invoices share a date.
        // Falls back to the real creation timestamp (createdAt, auto-stamped
        // on every save) so same-day invoices come out in true creation
        // order; for any older record saved before createdAt existed,
        // txSortKey falls back to invoice number via date+time parsing.
        cmp = new Date(a.date) - new Date(b.date);
        if (cmp === 0) cmp = txSortKey(a) - txSortKey(b);
        if (cmp === 0) cmp = (a.invoiceNumber || "").localeCompare(b.invoiceNumber || "", undefined, { numeric: true, sensitivity: 'base' });
      }
      return sortDir === "asc" ? cmp : -cmp;
    }),
    // Depend on data[tableName] (the actual sales/purchases array), not
    // getItems — getItems's identity changes on every mutation to ANY table
    // (parties, expenses, etc.), which was forcing this full 16k+ row
    // filter+sort to rerun on completely unrelated edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data[tableName], tableName, currentBusiness?.id, phoneToPartyIds, debouncedSearch, filters.dateFrom, filters.dateTo, filters.partyId, filters.minAmount, filters.maxAmount, quickStatus, datePreset, sortBy, sortDir]);

  // No auto-selected/default preview — the preview only opens when the user
  // explicitly clicks the eye icon (TxDataTable in list mode, or the eye
  // button on a grid tile / mobile card).

  const totalRevenue = transactions.reduce(
    (s, t) => s + (t.totalAmount || 0),
    0,
  );

  const resetForm = (opts = {}) => {
    if (keepDataOnNewRef.current) {
      keepDataOnNewRef.current = false;
      return;
    }
    const today = new Date().toISOString().split("T")[0];
    const keepDate = opts.keepDate ? invoiceDate : today;
    const nextNum = opts.nextInvoiceNumber || generateInvoiceNumber(keepDate, isSale);
    setInvoiceNumber(nextNum);
    if (!opts.keepDate) setInvoiceDate(today);
    setSelectedParty(null);
    setLoyaltyRedeemPoints(0);
    setLoyaltyRedeemValue(0);
    const nowT = new Date();
    setInvoiceTime(`${String(nowT.getHours()).padStart(2,'0')}:${String(nowT.getMinutes()).padStart(2,'0')}`);
    setDescription("");
    setNoGST(false);
    setDiscountPercent("");
    setDiscountType("percent");
    setAdvance("");
    setAdvanceMode("Cash");
    setAdvanceSplitCash("");
    setAdvanceSplitBank("");
    setPaymentMode("Cash");
    setSplitCash("");
    setSplitBank("");
    setSaleType(isSale ? (config.defaultSaleTypeSales ?? 'credit') : (config.defaultSaleTypePOS ?? 'paid'));
    setDueDate("");
    setRoundOff(config.billPrintOptions?.autoRoundOff ? 1 : 0);
    setPackingCharge("");
    setShippingCharge("");
    setEditId(null);
    setNewRecordId(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `new_${Date.now()}`);
    setReferenceImageIds([]);
    setSelectedBilledBy(ownerName);
    setLoyaltyRedeemPoints(0);
    setLoyaltyRedeemValue(0);
    // showCustomerPanel now controls the mobile/tablet "View details" dialog
    // (see its declaration) — closed by default, opened explicitly via the
    // chip next to the party selector, not force-opened on every reset.
    setShowCustomerPanel(false);
    setObStep("party");
    // If converting an Estimate or Order to a sale, populate its party/
    // items/etc. — checked before the barcode-scan branch since both
    // prefill `items` and only one can apply to a given "New" transition.
    convertSourceRef.current = null;
    const pendingConvert = pendingConvertRef.current;
    pendingConvertRef.current = null;
    if (pendingConvert) {
      const { sourceType, sourceId, party, items: convertItems, description: convertDescription, noGST: convertNoGST } = pendingConvert;
      convertSourceRef.current = { sourceType, sourceId };
      setSelectedParty(party);
      setDescription(convertDescription || "");
      setNoGST(!!convertNoGST);
      setItems(convertItems?.length ? convertItems.map((i) => ({ ...i, discountPercent: i.discountPercent ?? 0 })) : [{ itemId: "", name: "", qty: "", price: "", taxRate: 0, discountPercent: "", taxInclusive: false, total: 0, _key: Date.now() }]);
      return;
    }
    // If a barcode scan triggered this, populate that item
    const pending = pendingScannedItemRef.current;
    pendingScannedItemRef.current = null;
    if (pending) {
      const { found, isSaleAtTime } = pending;
      const price = Number(isSaleAtTime ? (found.salePrice ?? found.price) : (found.purchasePrice ?? found.price)) || 0;
      const taxRate = Number(found.taxRate) || 0;
      const discountPercent = isSaleAtTime && Number(found.discount) ? Number(found.discount) : "";
      setItems([{ itemId: found.id, name: found.name, qty: 1, price: price || "", taxRate, discountPercent, taxInclusive: false, hsnCode: found.hsnCode || '', unit: found.unit || '', total: price * (1 - (Number(discountPercent) || 0) / 100) * (1 + taxRate / 100) }]);
    } else {
      setItems([{ itemId: "", name: "", qty: "", price: "", taxRate: 0, discountPercent: "", taxInclusive: false, total: 0, _key: Date.now() }]);
    }
  };

  // Fallback reset for entry points that land on view==="create" without
  // calling resetForm() themselves first (e.g. barcode-scan-into-new-
  // invoice) — every explicit "New Invoice"/"New Bill" button already calls
  // resetForm() directly before setView("create"). Must only fire on the
  // actual transition INTO create (tracked via prevViewRef), not on every
  // re-render while already parked there: a failed-save validation alert
  // (Invalid total, No items, etc.) resets `isSaving` back to false while
  // `view` stays "create", and this effect used to have `isSaving` in its
  // deps — re-arming and wiping the in-progress invoice (party/items/
  // everything) right after the user was told to go fix it.
  const prevViewRef = useRef(view);
  useEffect(() => {
    const enteredCreate = view === "create" && prevViewRef.current !== "create";
    prevViewRef.current = view;
    if (enteredCreate && !savingRef.current && !isSaving) {
      resetForm();
    }
  }, [view, isSale]); // eslint-disable-line

  useEffect(() => {
    if (view === "create" && !savingRef.current && !isSaving)
      setInvoiceNumber(generateInvoiceNumber(invoiceDate, isSale));
  }, [invoiceDate, isSale]); // eslint-disable-line

  useEffect(() => {
    setPage(0);
  }, [filters]);

  // Keep viewRef in sync so keyboard handler never has a stale closure
  useEffect(() => { viewRef.current = view; }, [view]);

  // Update tab label: in create/edit mode show party name (or invoice#); in list show section name
  useEffect(() => {
    if (!tabId) return;
    const baseLabel = isSale ? 'Sales' : 'Purchases';
    let label;
    if (view === 'create' || view === 'edit') {
      const partyName = selectedParty?.name;
      if (partyName) {
        label = partyName;
      } else if (invoiceNumber) {
        label = view === 'edit' ? `Edit ${invoiceNumber}` : invoiceNumber;
      } else {
        label = isSale ? (view === 'edit' ? 'Edit Invoice' : 'New Invoice') : (view === 'edit' ? 'Edit Purchase' : 'New Purchase');
      }
    } else {
      label = baseLabel;
    }
    updateTab(tabId, { label });
  }, [view, selectedParty, invoiceNumber]); // eslint-disable-line

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Sales/Purchases can have multiple simultaneous tab instances kept
      // alive in the background (display:none, never unmounted) — without
      // this guard, shortcuts (Ctrl+S, Escape, g n/g b) fired while looking
      // at a completely different tab were silently acting on whichever
      // background Sales instance happened to still have this listener
      // registered, e.g. Escape resetting an in-progress background invoice
      // back to list view. Same convention as the barcode-scanner listener
      // below (isActiveTabRef).
      if (!isActiveTabRef.current) return;
      const tag = document.activeElement?.tagName?.toLowerCase();
      const isTyping = tag === "input" || tag === "textarea";

      // G then N → new invoice (when in list view and not typing)
      if (e.code === "KeyG" && !isTyping && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        gModeRef.current = true;
        clearTimeout(gModeTimerRef.current);
        gModeTimerRef.current = setTimeout(() => { gModeRef.current = false; }, 800);
        return;
      }
      if (gModeRef.current && e.code === "KeyN" && isSale && viewRef.current === "list") {
        gModeRef.current = false;
        clearTimeout(gModeTimerRef.current);
        e.preventDefault();
        setView("create");
        return;
      }
      if (gModeRef.current && e.code === "KeyB" && !isSale && viewRef.current === "list") {
        gModeRef.current = false;
        clearTimeout(gModeTimerRef.current);
        e.preventDefault();
        setView("create");
        return;
      }

      // ── One by One mode: bare Enter advances to the next step ──────────
      // Only when NOT focused in a text field: the Party step's Autocomplete
      // (PartySelect, now with autoSelect — see its own file) already
      // consumes the FIRST Enter itself to commit the highlighted/typed
      // match, blurring the field afterward; this capture-phase listener
      // never sees that first keystroke reach here while focus is still
      // inside the input, so it only fires on a SECOND Enter once focus has
      // moved on — "type a name, Enter selects it, Enter again advances" is
      // therefore two real keystrokes, not one shortcut swallowing the
      // other. The Items step's own item-row Enter behavior (add/confirm a
      // row) works the same way. Review step's Enter is deliberately NOT
      // wired to Save here — a bare, modifier-free Enter triggering Save
      // would be a surprise on a page full of text fields; this file already
      // gates Save to explicit Ctrl+S/Ctrl+Enter everywhere else, and the
      // Review step's own visible Save button is the deliberate final action.
      if (obActiveRef.current && e.key === "Enter" && !e.ctrlKey && !e.metaKey && !isTyping) {
        const step = obStepRef.current;
        if (step === "party") {
          e.preventDefault();
          setObStep("items");
          return;
        }
        if (step === "items") {
          const hasValidItem = itemsRef.current.some(
            (i) => (i.itemId || i.name?.trim()) && Number(i.qty) > 0 && Number(i.price) >= 0
          );
          if (hasValidItem) {
            e.preventDefault();
            setObStep("review");
          }
          return;
        }
        // step === 'review' falls through — no special Enter handling here,
        // the visible Save/Update button is the deliberate final action.
      }

      if (
        (e.ctrlKey || e.metaKey) &&
        e.key === "s" &&
        (viewRef.current === "create" || viewRef.current === "edit")
      ) {
        e.preventDefault();
        if (!savingRef.current) handleSave();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && viewRef.current === "create") {
        e.preventDefault();
        if (!savingRef.current) handleSave({ saveAndCreateNew: true });
      }
      if (
        e.key === "Escape" &&
        !isTyping &&
        (viewRef.current === "create" || viewRef.current === "edit")
      )
        setView("list");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []); // eslint-disable-line

  // Auto-open create view when navigated from Dashboard with createNew flag,
  // or when the Dashboard "+ New Entry" menu fires its quick-new event.
  useEffect(() => {
    if (location.state?.createNew) {
      setView("create");
      window.history.replaceState({}, document.title);
    }
    const thisPath = mode === "purchase" ? "/purchases" : "/sales";
    const onQuickNew = (e) => {
      if (e.detail?.path !== thisPath) return;
      // Sales/Purchases supports multiple simultaneous tab instances kept
      // alive in the background — this listener is registered by EVERY one
      // of them, so without an active-tab check, opening a new instance
      // (e.g. via Estimates' "Convert to Sale", which uses openTab(...,
      // {duplicate:true})) had every other already-open Sales/Purchases tab
      // ALSO react to the same broadcast event and apply the same
      // edit/convert payload to itself — e.g. an older, unrelated tab
      // silently getting the converted estimate's party/items too.
      // openTab/activateTab always make the intended tab the active one
      // before this fires, so only that one tab should ever respond.
      if (!isActiveTabRef.current) return;
      // dispatchQuickNew (quickNewBridge.js) retries the same event on a
      // short interval until acknowledged, to survive the lazy-loaded Sales
      // chunk not having mounted (and this listener not yet being
      // registered) at the moment the dispatcher first fires — every branch
      // below must acknowledge once it has actually consumed the event, and
      // must NOT acknowledge if the referenced record isn't loaded yet (so
      // the next retry can pick it up once data arrives).
      if (e.detail?.intent === "createNew") {
        setView("create");
        acknowledgeQuickNew(e.detail);
      }
      // Fired by InvoicePreviewDialog's Edit button (used from Dashboard/
      // Reports) — that dialog has no editing form of its own, so Edit just
      // navigates here and hands off the transaction id to open in the real
      // edit form instead of duplicating hundreds of lines of item-row/GST/
      // party UI a second time.
      else if (e.detail?.intent === "editTx" && e.detail?.txId) {
        const tx = (data[thisPath === "/purchases" ? "purchases" : "sales"] || []).find((t) => t.id === e.detail.txId);
        if (tx) { startEdit(tx); acknowledgeQuickNew(e.detail); }
      }
      // Fired by Estimates.jsx's "Convert to Sale" action — hands off the
      // estimate's party/items into a brand-new (not edit) invoice here,
      // since Estimates has no invoice-form UI of its own to duplicate.
      else if (e.detail?.intent === "convertEstimate" && e.detail?.estimateId && thisPath === "/sales") {
        const est = (data.estimates || []).find((r) => r.id === e.detail.estimateId);
        if (est) {
          const party = parties.find((p) => p.id === est.partyId) || (est.partyId ? { id: est.partyId, name: est.partyName } : null);
          pendingConvertRef.current = { sourceType: "estimate", sourceId: est.id, party, items: est.items, description: est.description, noGST: est.noGST };
          if (viewRef.current === "create") resetForm();
          else setView("create");
          acknowledgeQuickNew(e.detail);
        }
      }
      // Fired by Orders.jsx's "Convert to Sale" action — same hand-off as
      // above; Orders.jsx already resolves its own items into Sales-shaped
      // rows (with tax fields looked up from the item master, since order
      // line items don't carry GST info themselves) before dispatching, so
      // no extra shaping is needed here.
      else if (e.detail?.intent === "convertOrder" && e.detail?.orderId && thisPath === "/sales") {
        const party = parties.find((p) => p.id === e.detail.partyId) || (e.detail.partyId ? { id: e.detail.partyId, name: e.detail.partyName } : null);
        pendingConvertRef.current = { sourceType: "order", sourceId: e.detail.orderId, party, items: e.detail.items, description: "", noGST: false };
        if (viewRef.current === "create") resetForm();
        else setView("create");
        acknowledgeQuickNew(e.detail);
      }
    };
    window.addEventListener("dashboard-quick-new", onQuickNew);
    return () => window.removeEventListener("dashboard-quick-new", onQuickNew);
    // Re-registers whenever sales/purchases/estimates changes so a stale
    // closure can't miss a transaction that was added/edited after this tab
    // first mounted (getItems'/data's identity would otherwise be frozen at
    // mount time).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.sales, data.purchases, data.estimates, parties]);

  const BLANK_ROW = { itemId: "", name: "", qty: "", price: "", unit: "", taxRate: 0, discountPercent: "", taxInclusive: false, total: 0, recipe: [], recipeOverrides: {}, notBilled: false };
  const addItemRow = () => setItems([...items, { ...BLANK_ROW }]);
  const removeItemRow = (index) => {
    const n = items.filter((_, i) => i !== index);
    setItems(n.length ? n : [{ ...BLANK_ROW }]);
  };

  const updateItemRow = (index, field, value) => {
    const newItems = [...items];
    // "clearAmountDraft" is a pseudo-field (fired on the Amount box's blur) —
    // it only ever needs to drop the draft below, not write a same-named key
    // onto the item, so it's excluded from the generic [field]: value spread.
    let item = field === "clearAmountDraft"
      ? { ...newItems[index] }
      : { ...newItems[index], [field]: value };
    // Any field other than the Amount box itself invalidates its in-progress
    // typed draft (see the "amount" branch below) — otherwise a stale draft
    // string would linger and override the freshly recomputed total.
    // "clearAmountDraft" (fired on the Amount box's blur) drops only the
    // draft string — item.qty/item.qtyDisplay (already fully settled by the
    // "amount" branch below) are left untouched by it.
    if (field !== "amount" && field !== "clearAmountDraft") delete item.amountDraft;
    // qtyDisplay (the rounded-to-2dp Qty shown in the Qty field when it was
    // derived from a typed Amount — see the "amount" branch below) only
    // applies until something changes what the quantity actually means —
    // NOT on the Amount field's own blur, which should leave it in place.
    if (field !== "amount" && field !== "clearAmountDraft") delete item.qtyDisplay;
    if (field === "taxRate") {
      const t = Number(value) || 0;
      item.cgstRate = t / 2; item.sgstRate = t / 2; item.igstRate = t;
    } else if (field === "cgstRate") {
      const c = Number(value) || 0;
      item.sgstRate = c; item.taxRate = c * 2; item.igstRate = c * 2;
    } else if (field === "sgstRate") {
      const s = Number(value) || 0;
      item.cgstRate = s; item.taxRate = s * 2; item.igstRate = s * 2;
    } else if (field === "igstRate") {
      const ig = Number(value) || 0;
      item.taxRate = ig; item.cgstRate = ig / 2; item.sgstRate = ig / 2;
    }
    if (field === "itemId") {
      const selected = stockItems.find((i) => i.id === value);
      if (selected) {
        item.name = selected.name || '';
        item.price = Number(isSale ? (selected.salePrice ?? selected.price) : (selected.purchasePrice ?? selected.price)) || "";
        item.taxRate = Number(selected.taxRate) || 0;
        item.cgstRate = selected.cgstRate != null ? Number(selected.cgstRate) : item.taxRate / 2;
        item.sgstRate = selected.sgstRate != null ? Number(selected.sgstRate) : item.taxRate / 2;
        item.igstRate = selected.igstRate != null ? Number(selected.igstRate) : item.taxRate;
        item.utgstRate = selected.utgstRate != null ? Number(selected.utgstRate) : item.taxRate / 2;
        item.isComposite = !!selected.isComposite;
        item.gstType = selected.gstType || null;
        item.hsnCode = selected.hsnCode || '';
        item.unit = selected.unit || item.unit || '';
        item.taxInclusive = !!selected.taxInclusive;
        // Apply the item's default discount on sales (kept off for purchases).
        item.discountPercent = isSale && Number(selected.discount) ? Number(selected.discount) : "";
        item.recipe = Array.isArray(selected.recipe) ? selected.recipe : [];
        item.recipeOverrides = {};
        // Auto-fill the default supplier when creating a purchase and no party is selected yet
        if (!isSale && selected.defaultPartyId && !selectedParty) {
          const supplier = getItems("parties").find(
            (p) => p.id === selected.defaultPartyId && p.businessId === currentBusiness?.id,
          );
          if (supplier) setSelectedParty(supplier);
        }
      }
    }
    const price = Number(item.price) || 0;
    const discountPercent = Number(item.discountPercent) || 0;
    const taxRate = Number(item.taxRate) || 0;
    // Typing an Amount back-solves Qty from the current Rate/Discount/GST —
    // the exact inverse of the total formula just below. The typed Amount
    // must reproduce EXACTLY everywhere it's used — the invoice's Subtotal/
    // Tax/Grand Total (sidebar, save, print) are always recalculated fresh
    // from qty×price elsewhere in this file, never read back from this row's
    // own total, so item.qty itself has to carry full precision (not
    // rounded) for those to come out exact — rounding qty to a clean 2dp
    // value here would make every one of those downstream totals drift by a
    // few paise (e.g. price=87, amount=200 → qty rounds to 2.30 →
    // 2.30×87=200.10 everywhere, not the 200 that was actually typed).
    // qtyDisplay is a separate, 2dp-rounded value used ONLY for what the Qty
    // field visually shows — a real quantity like "2.2988505..." would look
    // broken on screen even though it's mathematically exact.
    if (field === "amount") {
      // Keep the raw typed string as the field's displayed value (instead of
      // immediately reflecting the recomputed/rounded total back into it) so
      // React doesn't fight the user's own keystrokes mid-type — e.g. typing
      // "200" digit by digit would otherwise show "2", then a recomputed
      // "20", then "200", each one a full re-derivation rather than an echo
      // of what was actually typed, which reads as the field "not working".
      item.amountDraft = value;
      const amt = Number(value) || 0;
      const perUnit = item.taxInclusive
        ? price * (1 - discountPercent / 100)
        : price * (1 - discountPercent / 100) * (1 + taxRate / 100);
      item.qty = perUnit > 0 ? amt / perUnit : 0;
      item.qtyDisplay = perUnit > 0 ? Math.round(item.qty * 100) / 100 : 0;
    }
    const qty = Number(item.qty) || 0;
    if (item.notBilled) {
      item.total = 0;
    } else if (item.taxInclusive) {
      item.total = qty * price * (1 - discountPercent / 100);
    } else {
      item.total = qty * price * (1 - discountPercent / 100) * (1 + taxRate / 100);
    }
    newItems[index] = item;
    // Auto-append a blank row when the user fills in the last row's item
    if (field === "itemId" && value && index === newItems.length - 1) {
      newItems.push({ ...BLANK_ROW });
    }
    setItems(newItems);
  };

  const getBasePrice = (item) => {
    const price = Number(item.price) || 0;
    const taxRate = Number(item.taxRate) || 0;
    return item.taxInclusive ? price / (1 + taxRate / 100) : price;
  };
  const calculateSubtotal = () =>
    items.reduce((sum, item) => {
      if (item.notBilled) return sum;
      const qty = Number(item.qty) || 0;
      const discPct = Number(item.discountPercent) || 0;
      return sum + qty * getBasePrice(item) * (1 - discPct / 100);
    }, 0);
  const calculateDiscountAmount = () => {
    const sub = calculateSubtotal();
    if (discountType === "amount") return Math.min(Number(discountPercent) || 0, sub);
    return sub * ((discountPercent || 0) / 100);
  };
  const calculateTax = () => {
    if (noGST) return 0;
    return items.reduce((sum, item) => {
      if (item.notBilled) return sum;
      const qty = Number(item.qty) || 0;
      const discPct = Number(item.discountPercent) || 0;
      const taxRate = Number(item.taxRate) || 0;
      const base = getBasePrice(item);
      return sum + qty * base * (1 - discPct / 100) * (taxRate / 100);
    }, 0);
  };
  const calculatePackingCharge = () => (config.features?.packingCharges !== false ? Number(packingCharge) || 0 : 0);
  const calculateShippingCharge = () => (config.features?.shippingCharges !== false ? Number(shippingCharge) || 0 : 0);
  const calculateTotal = () =>
    calculateSubtotal() - calculateDiscountAmount() + calculateTax() + calculatePackingCharge() + calculateShippingCharge();
  // Build progressive round-up sequence from a value, skipping steps that don't change it
  const getRoundUpSeq = (val) => {
    const seq = [];
    let cur = val;
    for (const s of [1, 10, 100, 1000, 10000]) {
      const r = Math.ceil(cur / s) * s;
      if (r > cur) { seq.push(r); cur = r; if (seq.length >= 3) break; }
    }
    return seq;
  };
  // Build progressive round-down sequence from a value, skipping steps that don't change it
  const getRoundDownSeq = (val) => {
    const seq = [];
    let cur = val;
    for (const s of [1, 10, 100, 1000, 10000]) {
      const r = Math.floor(cur / s) * s;
      if (r < cur) { seq.push(r); cur = r; if (seq.length >= 3) break; }
    }
    return seq;
  };
  const calculateRoundOff = () => {
    if (roundOff === 0) return 0;
    const total = calculateTotal();
    if (roundOff > 0) {
      const target = getRoundUpSeq(total)[roundOff - 1];
      return target != null ? target - total : 0;
    }
    const target = getRoundDownSeq(total)[Math.abs(roundOff) - 1];
    return target != null ? target - total : 0;
  };
  const calculateFinalTotal = () => Math.max(0, calculateTotal() + calculateRoundOff() - loyaltyRedeemValue);
  // The amount the "Show Payment QR" button/dialog should ask for — for a
  // Split payment only the bank/UPI portion is being paid via QR (e.g. ₹500
  // total, ₹200 cash + ₹300 QR), so the QR must not ask for the full total.
  const paymentQrAmount = paymentMode === "Split" ? (Number(splitBank) || 0) : calculateFinalTotal();

  const handleSave = async (options = {}) => {
    const { saveAndCreateNew = false, saveAndPrint = false } = options;
    // TallyKraft billing: block saving entirely when the subscription is
    // inactive — the data layer would reject the write anyway, but this gives
    // the user a clear message and routes them to renew.
    if (!canWrite) {
      showAlert("Your subscription is inactive. Please renew to save invoices.");
      return;
    }
    if (savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    try {
      const currentSelectedParty = selectedParty;
      const currentInvoiceDate = invoiceDate;
      const currentInvoiceTime = invoiceTime || "";
      const currentInvoiceNumber = invoiceNumber;
      const currentItems = [...items];
      const currentDescription = description;
      const currentNoGST = noGST;
      const currentDiscountPercent = discountPercent ?? 0;
      const currentDiscountType = discountType || "percent";
      const currentEditId = editId;
      // Only applies to a brand-new invoice — an edit of an existing sale
      // never carries a conversion source, even if that sale itself
      // originated from a converted estimate/order (its sourceEstimateId/
      // sourceOrderId is already persisted on the record and untouched by
      // subsequent edits).
      const currentConvertSource = currentEditId ? null : convertSourceRef.current;
      const currentNewRecordId = newRecordId;
      const currentReferenceImageIds = referenceImageIds;
      const currentIsSale = isSale;
      const currentBusinessId = currentBusiness?.id;
      const currentPaymentMode = paymentMode || "Cash";
      const currentSaleType = saleType || (currentIsSale ? "credit" : "paid");
      // Advance (Received for sales, Paid for purchases) only applies to
      // credit transactions — a cash/bank sale/purchase is already fully
      // settled via Payment Mode, so ignore any stale advance value left
      // over from switching Sale Type after typing an amount.
      const currentAdvance = currentSaleType === 'credit' ? Number(advance) || 0 : 0;
      const currentAdvanceMode = advanceMode || "Cash";
      const currentAdvanceSplitCash = Number(advanceSplitCash) || 0;
      const currentAdvanceSplitBank = Number(advanceSplitBank) || 0;
      const currentSplitCash = Number(splitCash) || 0;
      const currentSplitBank = Number(splitBank) || 0;
      const currentSplitBankMode = "Bank";
      const currentDueDate = dueDate;
      const currentTaxMode = taxMode;
      const currentLoyaltyRedeemPoints = loyaltyRedeemPoints;
      const currentLoyaltyRedeemValue = loyaltyRedeemValue;
      const currentPackingCharge = config.features?.packingCharges !== false ? Number(packingCharge) || 0 : 0;
      const currentShippingCharge = config.features?.shippingCharges !== false ? Number(shippingCharge) || 0 : 0;
      if (!currentBusinessId) {
        await showAlert({ title: "Business not selected", message: "Please select a business before saving.", variant: "warning" });
        savingRef.current = false;
        setIsSaving(false);
        return;
      }
      if (!currentInvoiceNumber?.trim()) {
        await showAlert({ title: "Invoice number required", message: "Please enter an invoice / bill number.", variant: "warning" });
        savingRef.current = false;
        setIsSaving(false);
        return;
      }
      if (!currentInvoiceDate) {
        await showAlert({ title: "Date required", message: "Please select a date for this invoice.", variant: "warning" });
        savingRef.current = false;
        setIsSaving(false);
        return;
      }

      const getBasePriceFinal = (item) => {
        const price = Number(item.price) || 0;
        const taxRate = Number(item.taxRate) || 0;
        return item.taxInclusive ? price / (1 + taxRate / 100) : price;
      };
      const finalSubtotal = currentItems.reduce((sum, item) => {
        if (item.notBilled) return sum;
        const qty = Number(item.qty) || 0;
        const discPct = Number(item.discountPercent) || 0;
        return sum + qty * getBasePriceFinal(item) * (1 - discPct / 100);
      }, 0);
      const finalDiscountAmount = currentDiscountType === "amount"
        ? Math.min(Number(currentDiscountPercent) || 0, finalSubtotal)
        : finalSubtotal * (currentDiscountPercent / 100);
      const finalDiscountPct = finalSubtotal > 0 ? (finalDiscountAmount / finalSubtotal) * 100 : 0;
      const finalTaxAmount = currentNoGST
        ? 0
        : currentItems.reduce((sum, item) => {
            if (item.notBilled) return sum;
            const qty = Number(item.qty) || 0;
            const discPct = Number(item.discountPercent) || 0;
            const taxRate = Number(item.taxRate) || 0;
            const base = getBasePriceFinal(item);
            return sum + qty * base * (1 - discPct / 100) * (taxRate / 100);
          }, 0);
      const finalTotalAmount =
        finalSubtotal - finalDiscountAmount + finalTaxAmount + currentPackingCharge + currentShippingCharge;
      const finalRoundOffAmount = (() => {
        if (roundOff === 0) return 0;
        const buildUpSeq = (val) => { const seq = []; let c = val; for (const s of [1,10,100,1000,10000]) { const r = Math.ceil(c/s)*s; if (r>c){seq.push(r);c=r;if(seq.length>=3)break;} } return seq; };
        const buildDnSeq = (val) => { const seq = []; let c = val; for (const s of [1,10,100,1000,10000]) { const r = Math.floor(c/s)*s; if (r<c){seq.push(r);c=r;if(seq.length>=3)break;} } return seq; };
        if (roundOff > 0) { const t = buildUpSeq(finalTotalAmount)[roundOff-1]; return t != null ? t - finalTotalAmount : 0; }
        const t = buildDnSeq(finalTotalAmount)[Math.abs(roundOff)-1]; return t != null ? t - finalTotalAmount : 0;
      })();
      const finalGrandTotal = Math.max(0, finalTotalAmount + finalRoundOffAmount - currentLoyaltyRedeemValue);
      const cleanedItems = currentItems
        .filter(
          (i) =>
            (i.itemId || i.name?.trim()) &&
            Number(i.qty) > 0 &&
            Number(i.price) >= 0,
        )
        .map((item) => {
          // amountDraft/qtyDisplay are UI-only helpers for the Amount→Qty
          // auto-calc (the in-progress typed string, and the Qty field's
          // rounded-for-display value) — item.qty itself already carries the
          // real, full-precision value that reproduces the typed amount
          // exactly, so neither belongs on the saved record.
          const { amountDraft: _amountDraft, qtyDisplay: _qtyDisplay, ...rest } = item;
          return {
            ...rest,
            qty: Number(item.qty) || 0,
            price: Number(item.price) || 0,
            taxRate: currentNoGST ? 0 : (Number(item.taxRate) || 0),
            discountPercent: Number(item.discountPercent) || 0,
          };
        });
      if (!cleanedItems.length) {
        await showAlert({ title: "No items added", message: "Please add at least one item with a valid quantity and price.", variant: "warning" });
        savingRef.current = false;
        setIsSaving(false);
        return;
      }
      if (finalTotalAmount <= 0) {
        await showAlert({ title: "Invalid total", message: "The total amount must be greater than zero.", variant: "warning" });
        savingRef.current = false;
        setIsSaving(false);
        return;
      }
      if (mixedGstWarning) {
        await showAlert({
          title: "Mixed GST types — cannot save",
          message: `A single invoice cannot contain both IGST and CGST+SGST items.\n\nIGST items: ${mixedGstWarning.igstItems}\nIntra-state items: ${mixedGstWarning.intraItems}\n\nPlease update the item GST types to match, or split into two separate bills.`,
          variant: "warning",
        });
        savingRef.current = false;
        setIsSaving(false);
        return;
      }

      const partyState = currentSelectedParty?.state || '';
      const savedGstType = effectiveGstType;
      const isInterState = savedGstType === 'igst';
      const transactionData = {
        // For a brand-new record, use the id already assigned when the
        // create form opened (currentNewRecordId) — reference images
        // attached during the draft were saved to local IndexedDB keyed by
        // that exact id, so the saved record must keep the same id rather
        // than getting a fresh one from addItem's internal randomUUID().
        ...(currentEditId ? {} : { id: currentNewRecordId }),
        ...(currentReferenceImageIds.length > 0 ? { referenceImageIds: currentReferenceImageIds } : {}),
        ...(currentConvertSource?.sourceType === "estimate" ? { sourceEstimateId: currentConvertSource.sourceId } : {}),
        ...(currentConvertSource?.sourceType === "order" ? { sourceOrderId: currentConvertSource.sourceId } : {}),
        businessId: currentBusinessId,
        partyId: currentSelectedParty?.id || "",
        partyName:
          currentSelectedParty?.name ||
          (currentIsSale ? "Cash & Carry" : "Cash Purchase"),
        partyGstNumber: currentSelectedParty?.gstNumber || "",
        partyAddress: currentSelectedParty?.address || "",
        partyCity: currentSelectedParty?.city || "",
        partyState: partyState,
        partyPhone: currentSelectedParty?.phone || "",
        // Place of Supply is a fixed business-level setting (Settings →
        // Business Profile → State), not a per-invoice value — set once,
        // used on every bill.
        placeOfSupply: currentBusiness?.state || '',
        isInterState,
        gstType: savedGstType,
        reverseCharge: false,
        type: currentIsSale ? "Sales" : "Purchases",
        date: currentInvoiceDate,
        time: currentInvoiceTime,
        invoiceNumber: currentInvoiceNumber.trim(),
        items: cleanedItems,
        description: currentDescription || "",
        noGST: currentNoGST,
        discountPercent: finalDiscountPct,
        discountAmount: finalDiscountAmount,
        discountType: currentDiscountType,
        discountValue: currentDiscountPercent,
        subtotal: finalSubtotal,
        taxAmount: finalTaxAmount,
        packingCharge: currentPackingCharge || 0,
        shippingCharge: currentShippingCharge || 0,
        roundOffAmount: finalRoundOffAmount || 0,
        totalAmount: finalGrandTotal,
        advance: currentAdvance,
        advanceMode: currentAdvance > 0 ? currentAdvanceMode : null,
        advanceSplit: currentAdvance > 0 && currentAdvanceMode === "Split"
          ? { cash: currentAdvanceSplitCash, bank: currentAdvanceSplitBank }
          : null,
        dueDate: currentDueDate || "",
        taxMode: currentTaxMode,
        paymentMode: currentPaymentMode,
        ...(currentPaymentMode === "Split" && {
          paymentSplit: { cash: currentSplitCash, bank: currentSplitBank, bankMode: currentSplitBankMode },
        }),
        saleType: currentSaleType,
        // 'paid' = money received now (cash/bank sale), 'credit' = credit sale (money owed)
        status: currentSaleType === 'paid' ? 'paid' : 'unpaid',
        billedBy: selectedBilledBy || ownerName,
        ...(currentLoyaltyRedeemPoints > 0 && {
          loyaltyPointsRedeemed: currentLoyaltyRedeemPoints,
          loyaltyRedeemValue: currentLoyaltyRedeemValue,
        }),
        _loyaltySnapshot: null, // filled below after party update
      };

      const currentData = data;
      const currentParties = getItems("parties");
      const currentStockItems = getItems("items");
      let editedOldTx = null;
      let editedOldParty = null;
      let editedOldBalanceRollback = null;

      if (currentEditId) {
        const tName = currentIsSale ? "sales" : "purchases";
        const oldTx = currentData[tName]?.find((t) => t.id === currentEditId);
        if (oldTx) {
          editedOldTx = oldTx;
          // Net effect the old transaction had on the party balance: totalAmount
          // owed minus whatever advance was already collected against it. Must
          // roll back this net figure (not totalAmount alone) or the advance
          // gets double-subtracted once the new advance is applied below.
          // A Cash/Bank ('paid') transaction never touched the party balance
          // in the first place (see balanceChange below), so there is
          // nothing to roll back for it — otherwise editing an
          // already-settled invoice would incorrectly shift the party
          // balance by an amount that was never actually applied.
          const oldWasSettled = oldTx.saleType === 'paid';
          const oldNet = oldWasSettled ? 0 : (Number(oldTx.totalAmount) || 0) - (Number(oldTx.advance) || 0);
          const oldBalanceRollback = currentIsSale ? -oldNet : oldNet;
          editedOldBalanceRollback = oldBalanceRollback;
          const oldParty = currentParties.find((p) => p.id === oldTx.partyId);
          editedOldParty = oldParty;
          if (oldParty)
            await updateItem("parties", oldTx.partyId, {
              balance: oldParty.balance + oldBalanceRollback,
            });
          // Stock rollback is deferred — handled together with the new items
          // as a net delta below to avoid stale-snapshot double-counting.
        }
      }

      // Stock quantity check — sales only, gated by feature flag
      // Placed after editedOldTx is resolved so edit-mode available qty is accurate.
      if (currentIsSale && config.features?.stockAlert) {
        const overStockLines = cleanedItems
          .map(ci => {
            const si = stockItems.find(s => String(s.id) === String(ci.itemId));
            if (!si) return null;
            const avail = Number(si.stock) || 0;
            const qty = Number(ci.qty) || 0;
            let effectiveAvail = avail;
            if (currentEditId && editedOldTx) {
              const oldLine = editedOldTx.items?.find(oi => String(oi.itemId) === String(ci.itemId));
              effectiveAvail = avail + (Number(oldLine?.qty) || 0);
            }
            return qty > effectiveAvail ? { name: ci.name || si.name || 'Unknown item', qty, avail: effectiveAvail } : null;
          })
          .filter(Boolean);
        if (overStockLines.length > 0) {
          const lines = overStockLines.map(l =>
            l.avail <= 0
              ? `${l.name} (out of stock)`
              : `${l.name} (need ${l.qty}, only ${l.avail} left)`
          );
          const proceed = await confirm({
            title: 'Insufficient stock',
            message: lines.join('\n') + '\n\nProceed anyway?',
            confirmLabel: 'Proceed',
            cancelLabel: 'Cancel',
          });
          if (!proceed) {
            if (currentEditId && editedOldTx && editedOldParty) {
              await updateItem("parties", editedOldTx.partyId, {
                balance: editedOldParty.balance,
              });
            }
            savingRef.current = false;
            setIsSaving(false);
            return;
          }
        }
      }

      // Compute loyalty fields before saving so they are persisted on the transaction record
      const newParty = currentSelectedParty?.id
        ? currentParties.find((p) => p.id === currentSelectedParty.id)
        : null;
      let loyaltyEarned = 0;
      let loyaltyNewPoints = 0;
      if (currentIsSale && !currentEditId && config.features?.loyalty && currentSelectedParty?.id && newParty) {
        const loyalty = config.loyalty || {};
        const pointsPerRupee = Number(loyalty.pointsPerRupee) || 0;
        const earnEveryRupees = Number(loyalty.earnEveryRupees) || 1;
        loyaltyEarned = Math.floor((finalGrandTotal / earnEveryRupees) * pointsPerRupee);
        const prevPoints = Number(newParty.loyaltyPoints) || 0;
        const afterRedeem = prevPoints - currentLoyaltyRedeemPoints;
        loyaltyNewPoints = Math.max(0, afterRedeem) + loyaltyEarned;
        transactionData._loyaltySnapshot = {
          earned: loyaltyEarned,
          balance: loyaltyNewPoints,
          programName: loyalty.programName || 'Reward Points',
        };
        transactionData.loyaltyPointsEarned = loyaltyEarned;
        transactionData.loyaltyBalanceAfter = loyaltyNewPoints;
      }

      const tName = currentIsSale ? "sales" : "purchases";
      // addItem/updateItem return a plain boolean (never the saved record),
      // so `saved` must never be handed to selectTx/InvoiceTemplate directly
      // — `true.items.reduce(...)` inside InvoiceTemplate would throw and
      // crash the render mid-Dialog-open, leaving MUI's modal manager stuck
      // (aria-hidden/inert never cleaned up) and the whole app unclickable.
      // transactionData is the real record in both branches — for edits it
      // just needs `id` stamped on since only new records set it upfront.
      if (currentEditId) transactionData.id = currentEditId;
      let saved = currentEditId
        ? await updateItem(tName, currentEditId, transactionData)
        : await addItem(tName, transactionData);
      if (!saved) {
        const savedItem = getItems(tName).find(
          (t) =>
            t.invoiceNumber === transactionData.invoiceNumber &&
            t.partyId === transactionData.partyId,
        );
        if (!savedItem) {
          await showAlert({ title: "Save failed", message: "Failed to save transaction. Please try again.", variant: "danger" });
          savingRef.current = false;
          setIsSaving(false);
          return;
        }
        Object.assign(transactionData, savedItem);
      }

      // A Cash/Bank (saleType 'paid') transaction is fully settled via
      // Payment Mode at the moment it's created — it must NOT also add its
      // full amount onto the party's running balance, or every immediately-
      // paid sale/purchase to a named party permanently inflates "To
      // Collect"/"Payables" on the Dashboard by the full invoice amount even
      // though nothing is actually outstanding. Only a credit transaction
      // (saleType 'credit', status 'unpaid') owes money against the party
      // balance; currentAdvance (sales-only partial credit prepayment) is
      // still subtracted separately below.
      const balanceChange = currentSaleType !== 'paid'
        ? (currentIsSale ? transactionData.totalAmount : -transactionData.totalAmount)
        : 0;
      if (newParty) {
        const isEditSameParty =
          currentEditId &&
          editedOldTx &&
          editedOldParty &&
          editedOldParty.id === currentSelectedParty.id;
        // Advance must move the balance the opposite direction of
        // balanceChange, same as editedOldBalanceRollback's own oldNet
        // (totalAmount - advance) already does — for a sale, an advance
        // reduces what the customer owes us (balance -advance); for a
        // purchase, an advance reduces what we owe the vendor, and since
        // balanceChange itself is negative there, that means +advance.
        const advanceBalanceEffect = currentIsSale ? -currentAdvance : currentAdvance;
        // editedOldBalanceRollback nets out (oldTotal - oldAdvance), so combined with
        // + balanceChange + advanceBalanceEffect below, the old advance and new
        // advance each apply exactly once — old fully undone, new fully applied.
        const newBalance = isEditSameParty
          ? editedOldParty.balance + editedOldBalanceRollback + balanceChange + advanceBalanceEffect
          : newParty.balance + balanceChange + advanceBalanceEffect;
        const loyaltyUpdates = { balance: newBalance };
        if (loyaltyEarned > 0 || loyaltyNewPoints > 0) {
          loyaltyUpdates.loyaltyPoints = loyaltyNewPoints;
        }
        await updateItem("parties", currentSelectedParty.id, loyaltyUpdates);
      }

      if (currentSelectedParty?.id) {
        const advRef = `ADV-${currentInvoiceNumber.trim()}`;
        const existingAdv = getItems("payments").find(p => p.referenceNo === advRef);
        // cashUtils.js reads paymentMode/paymentSplit directly off the payments
        // record for cash/bank balance computation — must match that shape here,
        // not just the advanceMode/advanceSplit kept on the transaction record.
        const advPaymentFields = {
          paymentMode: currentAdvanceMode,
          paymentSplit: currentAdvanceMode === "Split"
            ? { cash: currentAdvanceSplitCash, bank: currentAdvanceSplitBank }
            : null,
        };
        if (currentAdvance > 0) {
          if (existingAdv) {
            // Update the existing advance payment record
            await updateItem("payments", existingAdv.id, { totalAmount: currentAdvance, ...advPaymentFields });
          } else if (!currentEditId) {
            // Create new advance record only on first save — PaymentIn for a
            // sale (money received from customer), PaymentOut for a purchase
            // (money paid to vendor), so cashUtils.js's cash/bank balance
            // computation (which filters strictly on payment `type`) moves
            // the advance the correct direction either way.
            await addItem("payments", {
              businessId: currentBusinessId,
              partyId: currentSelectedParty.id,
              partyName: currentSelectedParty.name || "Unknown",
              type: currentIsSale ? "PaymentIn" : "PaymentOut",
              totalAmount: currentAdvance,
              date: currentInvoiceDate,
              referenceNo: advRef,
              notes: currentIsSale
                ? `Advance received for invoice ${currentInvoiceNumber.trim()}`
                : `Advance paid for bill ${currentInvoiceNumber.trim()}`,
              ...advPaymentFields,
            });
          }
        } else if (existingAdv && currentEditId) {
          // Advance cleared on edit — remove the payment record
          await deleteItem("payments", existingAdv.id);
        }
      }

      // For split-payment POS / cash-and-carry sales, record each portion as a PaymentIn.
      if (currentIsSale && !currentEditId && currentPaymentMode === "Split" && !currentSelectedParty?.id) {
        if (currentSplitCash > 0) {
          await addItem("payments", {
            businessId: currentBusinessId,
            partyId: "", partyName: "Cash & Carry",
            type: "PaymentIn",
            totalAmount: currentSplitCash,
            date: currentInvoiceDate,
            paymentMode: "Cash",
            referenceNo: `SPL-${currentInvoiceNumber.trim()}`,
            notes: `Split payment (cash) for invoice ${currentInvoiceNumber.trim()}`,
          });
        }
        if (currentSplitBank > 0) {
          await addItem("payments", {
            businessId: currentBusinessId,
            partyId: "", partyName: "Cash & Carry",
            type: "PaymentIn",
            totalAmount: currentSplitBank,
            date: currentInvoiceDate,
            paymentMode: currentSplitBankMode,
            referenceNo: `SPL-${currentInvoiceNumber.trim()}`,
            notes: `Split payment (${currentSplitBankMode}) for invoice ${currentInvoiceNumber.trim()}`,
          });
        }
      }

      {
        // Build a per-item stock delta map. A line for a "recipe" item (made
        // from other items, e.g. Tomato Rice) has no stock of its own — it's
        // expanded into deltas for each of its components instead, using any
        // per-row recipeOverrides the user nudged at sale time (see
        // ConsolidatedRecipeStrip) in place of the recipe's default qtyPerUnit × qty.
        const addLineDeltas = (deltas, item, sign) => {
          const q = Number(item.qty) || 0;
          if (Array.isArray(item.recipe) && item.recipe.length > 0) {
            for (const r of item.recipe) {
              const override = item.recipeOverrides?.[r.itemId];
              const compQty = override != null ? Number(override) : (Number(r.qtyPerUnit) || 0) * q;
              if (compQty > 0) deltas[r.itemId] = (deltas[r.itemId] || 0) + sign * compQty;
            }
          } else if (item.itemId) {
            deltas[item.itemId] = (deltas[item.itemId] || 0) + sign * q;
          }
        };

        // Compute net stock delta: rollback old items (if editing) + apply new
        // items in one pass. Using a snapshot (currentStockItems) is safe
        // because each itemId is only touched once — no double-counting from
        // sequential reads of stale state.
        const stockDeltas = {};
        if (currentEditId && editedOldTx) {
          for (const item of editedOldTx.items) addLineDeltas(stockDeltas, item, currentIsSale ? 1 : -1);
        }
        for (const item of transactionData.items) addLineDeltas(stockDeltas, item, currentIsSale ? -1 : 1);

        const stockUpdates = [];
        for (const [itemId, delta] of Object.entries(stockDeltas)) {
          if (delta !== 0) {
            // Object.entries converts keys to strings; match by string comparison
            // then use stockItem.id (original type) for the update payload.
            const stockItem = currentStockItems.find((i) => String(i.id) === itemId);
            if (stockItem) stockUpdates.push({ id: stockItem.id, stock: (Number(stockItem.stock) || 0) + delta });
          }
        }
        if (stockUpdates.length) updateItems("items", stockUpdates);
      }

      const successMsg = editId
        ? (isSale ? 'Invoice updated' : 'Purchase updated')
        : (isSale ? 'Invoice saved' : 'Purchase saved');
      setSnack({ open: true, message: successMsg, severity: 'success' });

      if (saveAndCreateNew) {
        // Increment serial directly — getItems hasn't flushed the just-saved record yet
        const parts = currentInvoiceNumber.trim().split("-");
        const serial = parseInt(parts[parts.length - 1], 10) || 0;
        parts[parts.length - 1] = String(serial + 1).padStart(4, "0");
        const nextNum = parts.join("-");
        resetForm({ nextInvoiceNumber: nextNum, keepDate: true });
        setView("create");
      } else if (saveAndPrint) {
        triggerPrint(transactionData);
        setAdvance(""); setAdvanceMode("Cash"); setAdvanceSplitCash(""); setAdvanceSplitBank("");
        setPaymentMode("Cash"); setSplitCash(""); setSplitBank("");
        selectTx(transactionData);
        setView("list");
        setEditId(null);
      } else {
        setAdvance(""); setAdvanceMode("Cash"); setAdvanceSplitCash(""); setAdvanceSplitBank("");
        setPaymentMode("Cash"); setSplitCash(""); setSplitBank("");
        setView("list");
        setEditId(null);
        // Prompt to send to customer if it's a sale and party has contact info.
        // Mutually exclusive with the auto-preview below — selectTx() opens a
        // full-screen preview Dialog on desktop (open={!isMobile && !!selectedTx}),
        // and having BOTH that Dialog and SendDialog mount open in the same
        // commit was leaving the app completely unclickable afterwards (MUI's
        // Modal manager tracks a stack of open modals and restores aria-hidden/
        // inert on the rest of the page when each one closes — two modals
        // opening in the exact same render desyncs that bookkeeping). Since
        // SendDialog is the actionable one here, it wins; the row is still
        // reachable from the list without the extra unrequested preview popup.
        let openedSendPrompt = false;
        if (currentIsSale && transactionData.partyId) {
          const savedParty = getItems('parties').find(p => p.id === transactionData.partyId);
          if (savedParty?.phone || savedParty?.email) {
            setSendTx(transactionData);
            setSendParty(savedParty);
            setSendOpen(true);
            openedSendPrompt = true;
          }
        }
        if (!openedSendPrompt) selectTx(transactionData);
      }
    } catch (error) {
      console.error("Error saving transaction:", error);
      await showAlert({ title: "Save error", message: "An error occurred while saving. Please try again.", variant: "danger" });
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  // "Received Payment" (Sales) / "Payment Made" (Purchases) — settles the
  // remaining outstanding balance on this specific invoice in one click:
  // records a PaymentIn/PaymentOut (same shape PaymentEntry.jsx produces,
  // so it shows up in Payments history and reports identically), reduces
  // the party balance by that amount, and marks the invoice paid with no
  // due date so it drops out of "unpaid"/"overdue" views. Opens a small
  // dialog to pick Cash / Bank / Split first, same modes PaymentEntry.jsx
  // supports — a real payment could land in any of the three.
  const handleReceivePayment = async (tx) => {
    if (tx.status === 'paid') return;
    const outstanding = Number(tx.totalAmount || 0) - Number(tx.advance || 0);
    if (outstanding <= 0) {
      // Already fully covered by an advance — just clear the due date/status.
      await updateItem(isSale ? 'sales' : 'purchases', tx.id, { status: 'paid', dueDate: '' });
      setSnack({ open: true, message: `${tx.invoiceNumber} marked as paid.`, severity: 'success' });
      return;
    }
    setReceivePayMode('Cash');
    setReceivePaySplitCash('');
    setReceivePaySplitBank('');
    setReceivePayDate(new Date().toISOString().split('T')[0]);
    setReceivePayLess('');
    setReceivePayNotes('');
    setReceivePayDialog({ open: true, tx, outstanding });
  };

  const closeReceivePayDialog = () => {
    if (receivePaySaving) return;
    setReceivePayDialog({ open: false, tx: null, outstanding: 0 });
  };

  // "Mark Paid without Payment" — for when the bill is being settled outside
  // the app (already paid in some other record, being reconciled later,
  // etc.) and the user doesn't want a payment entry recorded right now.
  // Unlike confirmReceivePayment, this deliberately does NOT touch the
  // party balance or create a payments record — the money is still owed as
  // far as the books are concerned, this only flips the invoice's own
  // paid/due-date display flag. The user is expected to record the actual
  // payment manually via Payment Entry whenever it's actually received.
  const markPaidWithoutPayment = async () => {
    const { tx } = receivePayDialog;
    if (!tx) return;
    setReceivePaySaving(true);
    try {
      await updateItem(isSale ? 'sales' : 'purchases', tx.id, { status: 'paid', dueDate: '', paidDate: receivePayDate });
      setSnack({ open: true, message: `${tx.invoiceNumber} marked as paid on ${new Date(receivePayDate).toLocaleDateString('en-IN')} — no payment recorded, add it manually via Payment Entry when received.`, severity: 'info', duration: 6000 });
      setReceivePayDialog({ open: false, tx: null, outstanding: 0 });
    } catch (error) {
      console.error('Error marking as paid:', error);
      await showAlert({ title: 'Save error', message: 'An error occurred. Please try again.', variant: 'danger' });
    } finally {
      setReceivePaySaving(false);
    }
  };

  const confirmReceivePayment = async () => {
    const { tx, outstanding } = receivePayDialog;
    if (!tx) return;
    const lessNum = parseFloat(receivePayLess) || 0;
    const amountNum = Math.max(0, outstanding - lessNum); // actual cash/bank collected, after the write-off
    let paymentSplit = null;
    if (receivePayMode === 'Split') {
      const cashNum = parseFloat(receivePaySplitCash) || 0;
      const bankNum = parseFloat(receivePaySplitBank) || 0;
      if (Math.abs(cashNum + bankNum - amountNum) > 0.01) {
        await showAlert({ title: 'Split does not match', message: `Cash + Bank must add up to ₹${amountNum.toLocaleString('en-IN', { maximumFractionDigits: 2 })}.`, variant: 'warning' });
        return;
      }
      paymentSplit = { cash: cashNum, bank: bankNum, bankMode: 'Bank' };
    }
    setReceivePaySaving(true);
    try {
      const party = tx.partyId ? getItems('parties').find((p) => p.id === tx.partyId) : null;
      const paymentData = {
        businessId: currentBusiness?.id,
        partyId: tx.partyId || null,
        partyName: tx.partyName || (party?.name ?? ''),
        type: isSale ? 'PaymentIn' : 'PaymentOut',
        totalAmount: amountNum,
        ...(lessNum > 0 ? { lessAmount: lessNum } : {}),
        date: receivePayDate,
        paymentMode: receivePayMode,
        ...(paymentSplit ? { paymentSplit } : {}),
        referenceNo: `RCV-${tx.invoiceNumber}`,
        notes: receivePayNotes || `Payment received against invoice #${tx.invoiceNumber}`,
      };
      await addItem('payments', paymentData);
      if (party) {
        await updateItem('parties', party.id, {
          balance: (party.balance || 0) + (isSale ? -outstanding : outstanding),
        });
      }
      await updateItem(isSale ? 'sales' : 'purchases', tx.id, { status: 'paid', dueDate: '', paidDate: receivePayDate });
      setSnack({ open: true, message: isSale ? 'Payment received — invoice marked paid.' : 'Payment made — bill marked paid.', severity: 'success' });
      setReceivePayDialog({ open: false, tx: null, outstanding: 0 });
    } catch (error) {
      console.error('Error recording received payment:', error);
      await showAlert({ title: 'Save error', message: 'An error occurred while recording the payment. Please try again.', variant: 'danger' });
    } finally {
      setReceivePaySaving(false);
    }
  };

  const handleDelete = async (tx) => {
    const ok = await confirm({
      title: `Delete ${isSale ? "Invoice" : "Bill"}`,
      message: `Invoice #${tx.invoiceNumber} will be permanently deleted and stock / balance will be reversed. This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    try {
      const party = getItems("parties").find((p) => p.id === tx.partyId);
      // Mirror handleSave's balance logic: a Cash/Bank ('paid') transaction
      // never touched the party balance (fully settled via Payment Mode at
      // creation), and a credit transaction's net effect was totalAmount
      // minus whatever advance had already been collected — reversing the
      // full totalAmount unconditionally here double-counted the advance and
      // incorrectly adjusted balance for already-settled invoices.
      const txNet = tx.saleType === 'paid' ? 0 : (Number(tx.totalAmount) || 0) - (Number(tx.advance) || 0);
      if (party)
        updateItem("parties", tx.partyId, {
          balance: party.balance + (isSale ? -txNet : txNet),
        });
      {
        // Reverse stock exactly the way handleSave applied it — a recipe
        // line (e.g. Tomato Rice) never touched its own stock, only its
        // components', respecting any per-sale recipeOverrides.
        const deltas = {};
        for (const item of tx.items) {
          const q = Number(item.qty) || 0;
          if (Array.isArray(item.recipe) && item.recipe.length > 0) {
            for (const r of item.recipe) {
              const override = item.recipeOverrides?.[r.itemId];
              const compQty = override != null ? Number(override) : (Number(r.qtyPerUnit) || 0) * q;
              if (compQty > 0) deltas[r.itemId] = (deltas[r.itemId] || 0) + (isSale ? compQty : -compQty);
            }
          } else if (item.itemId) {
            deltas[item.itemId] = (deltas[item.itemId] || 0) + (isSale ? q : -q);
          }
        }
        const stockItems = getItems("items");
        const stockUpdates = [];
        for (const [itemId, delta] of Object.entries(deltas)) {
          if (delta === 0) continue;
          const stockItem = stockItems.find((i) => String(i.id) === itemId);
          if (stockItem) stockUpdates.push({ id: stockItem.id, stock: (Number(stockItem.stock) || 0) + delta });
        }
        if (stockUpdates.length) updateItems("items", stockUpdates);
      }
      // Delete any advance / split / received-payment entries linked to this
      // invoice. Advance (ADV-) now applies to both sales and purchases;
      // split (SPL-) is sales/POS-only; received-payment (RCV-) can exist on
      // either — all three are looked up unconditionally so nothing is
      // orphaned regardless of transaction type.
      {
        const advRef = `ADV-${tx.invoiceNumber}`;
        const splRef = `SPL-${tx.invoiceNumber}`;
        const rcvRef = `RCV-${tx.invoiceNumber}`;
        const linkedPayments = getItems("payments").filter(
          (p) => p.businessId === currentBusiness?.id &&
            (p.referenceNo === advRef || p.referenceNo === splRef || p.referenceNo === rcvRef)
        );
        for (const p of linkedPayments) deleteItem("payments", p.id);
      }
      deleteItem(isSale ? "sales" : "purchases", tx.id);
      // Purge any locally-stored reference images so deleting the invoice
      // doesn't leave orphaned image blobs behind in IndexedDB forever.
      removeAllImagesForRecord(tx.id).catch((e) => console.error('[handleDelete] reference image cleanup failed:', e));
      // Clear the side preview if it was showing the deleted record.
      setSelectedTx((cur) => (cur?.id === tx.id ? null : cur));
    } catch (error) {
      console.error("Delete failed:", error);
      await showAlert({ title: "Delete failed", message: "Error deleting record: " + error.message, variant: "danger" });
    }
  };

  const startEdit = (tx) => {
    setEditId(tx.id);
    setReferenceImageIds(tx.referenceImageIds || []);
    setSelectedParty(
      parties.find((p) => p.id === tx.partyId) ||
        (tx.partyId ? { id: tx.partyId, name: tx.partyName } : null),
    );
    setInvoiceDate(tx.date);
    setInvoiceTime(tx.time || "");
    setInvoiceNumber(tx.invoiceNumber);
    setItems(
      tx.items.map((i) => ({ ...i, discountPercent: i.discountPercent ?? 0 })),
    );
    setDescription(tx.description || "");
    setNoGST(tx.noGST || false);
    setGstType(tx.gstType || 'auto');
    setDiscountType(tx.discountType || "percent");
    setDiscountPercent(tx.discountType === "amount" ? (tx.discountValue ?? tx.discountAmount ?? 0) : (tx.discountPercent ?? 0));
    setAdvance(tx.advance ? String(tx.advance) : "");
    setAdvanceMode(tx.advanceMode || "Cash");
    setAdvanceSplitCash(tx.advanceSplit?.cash ? String(tx.advanceSplit.cash) : "");
    setAdvanceSplitBank(tx.advanceSplit?.bank ? String(tx.advanceSplit.bank) : "");
    setDueDate(tx.dueDate || "");
    setPaymentMode(tx.paymentMode || "Cash");
    setSplitCash(tx.paymentSplit?.cash ? String(tx.paymentSplit.cash) : "");
    setSplitBank(tx.paymentSplit?.bank ? String(tx.paymentSplit.bank) : "");
    setPackingCharge(tx.packingCharge ? String(tx.packingCharge) : "");
    setShippingCharge(tx.shippingCharge ? String(tx.shippingCharge) : "");
    setSaleType(tx.saleType || (tx.type === 'Sales' ? 'credit' : 'paid'));
    setView("edit");
  };

  // Tab-switch view reset removed — form state now persists across tab switches (CSS keep-alive).

  useEffect(() => {
    if (!printTrigger) return;
    handlePrint();
  }, [printTrigger]); // eslint-disable-line

  useEffect(() => {
    if (!bulkPrintTrigger || bulkPrintTxs.length === 0) return;
    // Defer one tick so the hidden stack (which can be large) has painted
    // before the browser print dialog captures it.
    setBulkPrintLoading(true);
    const id = setTimeout(() => {
      handleBulkPrint();
      setBulkPrintLoading(false);
    }, 50);
    return () => clearTimeout(id);
  }, [bulkPrintTrigger]); // eslint-disable-line

  // Stable ref so the keydown listener never stale-closes over handleBarcodeScan
  const handleBarcodeScanRef = useRef(handleBarcodeScan);
  useEffect(() => { handleBarcodeScanRef.current = handleBarcodeScan; }, [handleBarcodeScan]);
  const salesViewRef = useRef(view);
  useEffect(() => { salesViewRef.current = view; }, [view]);
  // The dedicated barcode input row already handles Enter itself (onScan) —
  // skip the global buffer listener below when it's focused, so a scan
  // doesn't add the item twice.
  const barcodeInputRef = useRef(null);

  // Global hardware barcode/QR scanner listener — active only in create/edit view.
  // Same strategy as POS: buffer all chars with timestamps, confirm on Enter
  // by checking that every inter-key gap was <50ms and length ≥3.
  useEffect(() => {
    let buf = [];   // [{char, time}]
    const onKey = (e) => {
      if (!isActiveTabRef.current) return;
      if (salesViewRef.current !== 'create' && salesViewRef.current !== 'edit') return;
      // Don't intercept while any dialog/modal is open (e.g. ItemFormDialog, PartyFormDialog)
      if (document.querySelector('.MuiDialog-root')) return;
      // The barcode input row already handles its own Enter — avoid double-add
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

      // Drop stale partial buffer (>500ms gap = new sequence)
      if (buf.length > 1 && buf[buf.length - 1].time - buf[buf.length - 2].time > 500) {
        buf = [buf[buf.length - 1]];
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []); // eslint-disable-line

  const triggerPrint = (tx) => {
    setPrintingTx(tx);
    setPrintTrigger((t) => t + 1);
  };

  // Prints every currently-selected transaction as one combined print job
  // (one bill per page) — resolves ids in the order they appear in the list,
  // not selection order, so bulk-printed output matches the visible list order.
  const triggerBulkPrint = () => {
    const selected = transactions.filter((tx) => selectedIds.has(tx.id));
    if (selected.length === 0) return;
    setBulkPrintTxs(selected);
    setBulkPrintTrigger((t) => t + 1);
  };

  const openSendDialog = (tx, { initialMessage, dialogTitle } = {}) => {
    const party = getItems('parties').find(p => p.id === tx.partyId) || null;
    setSendTx(tx);
    setSendParty(party);
    setSendInitialMessage(initialMessage);
    setSendDialogTitle(dialogTitle);
    setSendOpen(true);
    // Prefetch the PDF/image export libraries as soon as the dialog opens so
    // they're already loaded by the time the user taps Share as PDF/Image —
    // avoids the ~600KB html2canvas+jsPDF chunk download stalling the actual share.
    import('html2canvas');
    import('jspdf');
  };

  const handleShare = (tx) => openSendDialog(tx);

  // Builds a payment-reminder message for an overdue invoice/bill — distinct
  // from SendDialog's default invoice-summary text since the point here is a
  // polite nudge about the outstanding balance, not re-sending the full bill.
  const buildReminderMessage = (tx) => {
    const outstanding = Math.max(0, Number(tx.totalAmount || 0) - Number(tx.advance || 0));
    const due = tx.dueDate ? new Date(tx.dueDate + 'T00:00:00') : null;
    const daysLate = due ? Math.max(0, Math.round((new Date().setHours(0, 0, 0, 0) - due.setHours(0, 0, 0, 0)) / 86400000)) : 0;
    const label = isSale ? 'invoice' : 'bill';
    const lines = [
      `Hi ${tx.partyName || ''},`.trim(),
      '',
      `This is a friendly reminder that ${label} *${tx.invoiceNumber}* dated ${formatDate(tx.date)} for *₹${Number(tx.totalAmount || 0).toFixed(2)}* is now ${daysLate > 0 ? `*${daysLate} day${daysLate !== 1 ? 's' : ''} overdue*` : 'due'}${tx.dueDate ? ` (due date: ${formatDate(tx.dueDate)})` : ''}.`,
      '',
      `Outstanding amount: *₹${outstanding.toFixed(2)}*`,
      '',
      `Kindly arrange payment at your earliest convenience. Please ignore this message if it has already been paid.`,
      '',
      `Thank you,`,
      currentBusiness?.name || 'TallyKraft',
    ];
    return lines.join('\n');
  };

  const handleSendReminder = (tx) => openSendDialog(tx, {
    initialMessage: buildReminderMessage(tx),
    dialogTitle: 'Send Payment Reminder',
  });

  // Points the shared off-screen capture template (pdfRef, driven by
  // `previewTx`) at the given transaction and waits for React to actually
  // commit+paint it. Every PDF/Image action funnels through this first so a
  // dedicated per-row button always captures THAT row's transaction, not
  // whatever happened to be in `previewTx` before — the "still not working"
  // reports were partly this: two unrelated selection states (previewTx vs
  // selectedTx) with no per-row action to keep them in sync.
  const ensurePreviewTarget = async (tx) => {
    if (!tx) return;
    if (previewTx?.id === tx.id) return;
    setPreviewTx(tx);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  };

  // The off-screen invoice template re-renders whenever `previewTx` changes
  // (e.g. right before a share action fires), and any <img> inside it — logo,
  // barcode/QR data URLs — may still be mid-decode. Capturing before both have
  // settled produced blank/stale/partial renders "most of the time" rather
  // than reliably. Wait for fonts, all images to decode, and one extra paint
  // frame before handing the node to html2canvas.
  const waitForCaptureReady = async (el) => {
    if (document.fonts?.ready) {
      try { await document.fonts.ready; } catch { /* ignore */ }
    }
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

  const downloadInvoicePDF = async (tx) => {
    if (_shareInFlight.current) return;
    const target = tx || previewTx;
    if (!target) return;
    _shareInFlight.current = true;
    _shareCancelledRef.current = false;
    setPdfLoading(true);
    try {
      await ensurePreviewTarget(target);
      if (_shareCancelledRef.current || !pdfRef.current) return;
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const el = pdfRef.current;
      await waitForCaptureReady(el);
      if (_shareCancelledRef.current) return;
      const canvas = await html2canvas(el, { scale: 1.5, useCORS: true, backgroundColor: '#ffffff' });
      if (_shareCancelledRef.current) return;
      // JPEG instead of PNG — jsPDF embeds it as-is (no re-encoding), and JPEG
      // encoding/embedding is far faster than PNG for a large rasterized canvas;
      // quality 0.92 is visually lossless for an invoice's text/lines/white background.
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      const pdfWidthMm = getPaperWidthMm(paperSize);
      const pdfHeightMm = (canvas.height * pdfWidthMm) / canvas.width;
      const namedFormat = getJsPdfFormat(paperSize);
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: namedFormat || [pdfWidthMm, pdfHeightMm],
      });
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidthMm, pdfHeightMm);
      if (_shareCancelledRef.current) return;
      pdf.save(`${target.invoiceNumber || 'invoice'}.pdf`);
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.error('PDF generation failed', err);
        alert('Could not generate the PDF. Please try again.');
      }
    } finally {
      setPdfLoading(false);
      _shareInFlight.current = false;
    }
  };

  const captureInvoiceCanvas = async () => {
    const { default: html2canvas } = await import('html2canvas');
    await waitForCaptureReady(pdfRef.current);
    return html2canvas(pdfRef.current, { scale: 1.5, useCORS: true, backgroundColor: '#ffffff' });
  };

  // Tells the user exactly what happened and what to do next — silently
  // opening an empty WhatsApp chat (download path) was the actual bug report:
  // nothing on screen explained that the file still needs to be dragged in.
  const showDeliverResult = (result) => {
    if (!result) return;
    if (result.method === 'clipboard') {
      setSnack({ open: true, severity: 'success', duration: 7000, message: 'Image copied — paste it (Ctrl+V / Cmd+V) into the WhatsApp chat that just opened.' });
    } else if (result.method === 'download+chat') {
      setSnack({ open: true, severity: 'info', duration: 8000, message: `"${result.fileName}" downloaded. WhatsApp chat opened — drag the file from your Downloads folder into the chat to send it.` });
    }
    // 'share' (mobile) and plain 'download' (no WhatsApp requested) are
    // self-explanatory from the OS share sheet / browser download UI.
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
      const [canvas, { jsPDF }] = await Promise.all([
        captureInvoiceCanvas(),
        import('jspdf').then(m => ({ jsPDF: m.jsPDF })),
      ]);
      if (_shareCancelledRef.current) return;
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      const pdfWidthMm = getPaperWidthMm(paperSize);
      const pdfHeightMm = (canvas.height * pdfWidthMm) / canvas.width;
      const namedFormat = getJsPdfFormat(paperSize);
      const pdf = new jsPDF({
        unit: 'mm',
        format: namedFormat || [pdfWidthMm, pdfHeightMm],
      });
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidthMm, pdfHeightMm);
      if (_shareCancelledRef.current) return;
      const fileName = `${target.invoiceNumber || 'invoice'}.pdf`;
      const pdfBlob = pdf.output('blob');
      const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
      const result = await deliverFile(file, opts);
      showDeliverResult(result);
    } catch (err) { if (err?.name !== 'AbortError') { console.error('Share as PDF failed', err); alert('Could not share the PDF. Please try again.'); } }
    finally { setShareLoading(false); _shareInFlight.current = false; }
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
          const fileName = `${target.invoiceNumber || 'invoice'}.png`;
          const file = new File([blob], fileName, { type: 'image/png' });
          const result = await deliverFile(file, opts);
          showDeliverResult(result);
          resolve();
        }, 'image/png');
      });
    } catch (err) { if (err?.name !== 'AbortError') { console.error('Share as Image failed', err); alert('Could not share the image. Please try again.'); } }
    finally { setShareLoading(false); _shareInFlight.current = false; }
  };

  const addPfCustomer = () =>
    setPfCustomers((prev) => [
      ...prev,
      {
        _key: Date.now(),
        party: null,
        qty: 1,
        price: pfProduct ? (pfProduct.salePrice ?? "") : "",
        discountPercent: "",
      },
    ]);
  const removePfCustomer = (key) => {
    setPfCustomers((prev) => {
      const next = prev.filter((r) => r._key !== key);
      return next.length
        ? next
        : [
            {
              _key: Date.now(),
              party: null,
              qty: 1,
              price: pfProduct ? (pfProduct.salePrice ?? "") : "",
              discountPercent: "",
            },
          ];
    });
  };
  const updatePfCustomer = (key, field, value) =>
    setPfCustomers((prev) => {
      const updated = prev.map((r) => (r._key === key ? { ...r, [field]: value } : r));
      // Auto-append blank row when customer is set on the last row
      if (field === "party" && value) {
        const idx = updated.findIndex((r) => r._key === key);
        if (idx === updated.length - 1) {
          updated.push({ _key: Date.now(), party: null, qty: 1, price: pfProduct ? (pfProduct.salePrice ?? "") : "", discountPercent: "" });
        }
      }
      return updated;
    });
  const pfRowTotal = (row) => {
    if (!pfProduct) return 0;
    const qty = Number(row.qty) || 0;
    const price = Number(row.price) || 0;
    const discPct = Number(row.discountPercent) || 0;
    const taxRate = pfNoGST ? 0 : Number(pfProduct.taxRate) || 0;
    return qty * price * (1 - discPct / 100) * (1 + taxRate / 100);
  };

  const handlePfSave = async () => {
    if (!currentBusiness?.id) {
      await showAlert({ title: "Business not selected", message: "Please select a business before saving.", variant: "warning" });
      return;
    }
    if (!pfProduct) {
      await showAlert({ title: "No product selected", message: "Please select a product before saving.", variant: "warning" });
      return;
    }
    const validRows = pfCustomers.filter((r) => r.party && Number(r.qty) > 0);
    if (!validRows.length) {
      await showAlert({ title: "No customers added", message: "Please add at least one customer with a quantity.", variant: "warning" });
      return;
    }
    setPfIsSaving(true);
    try {
      // Generate sequential invoice numbers following the same INVSB pattern
      const firstInvNum = generateInvoiceNumber(pfDate, true);
      const dashIdx = firstInvNum.lastIndexOf("-");
      const invPrefix = firstInvNum.slice(0, dashIdx + 1);
      const firstSerial = parseInt(firstInvNum.slice(dashIdx + 1), 10);

      const rowData = validRows.map((row, idx) => {
        const qty = Number(row.qty);
        const price = Number(row.price) || 0;
        const discPct = Number(row.discountPercent) || 0;
        const taxRate = pfNoGST ? 0 : Number(pfProduct.taxRate) || 0;
        const subtotal = qty * price * (1 - discPct / 100);
        const taxAmount = subtotal * (taxRate / 100);
        const totalAmount = subtotal + taxAmount;
        return {
          ...row,
          qty,
          price,
          discPct,
          taxRate,
          subtotal,
          taxAmount,
          totalAmount,
          invoiceNumber: `${invPrefix}${String(firstSerial + idx).padStart(4, "0")}`,
        };
      });
      const balanceDelta = {};
      rowData.forEach((rd) => {
        const key = rd.party.id;
        if (!balanceDelta[key])
          balanceDelta[key] = { party: rd.party, delta: 0 };
        balanceDelta[key].delta += rd.totalAmount;
      });
      for (const rd of rowData) {
        await addItem("sales", {
          businessId: currentBusiness.id,
          partyId: rd.party.id,
          partyName: rd.party.name || "Unknown",
          type: "Sales",
          date: pfDate,
          invoiceNumber: rd.invoiceNumber,
          items: [
            {
              itemId: pfProduct.id,
              name: pfProduct.name,
              qty: rd.qty,
              price: rd.price,
              taxRate: rd.taxRate,
              discountPercent: rd.discPct,
              total: rd.totalAmount,
            },
          ],
          noGST: pfNoGST,
          discountPercent: 0,
          discountAmount: 0,
          subtotal: rd.subtotal,
          taxAmount: rd.taxAmount,
          totalAmount: rd.totalAmount,
          advance: 0,
        });
      }
      const currentParties = getItems("parties");
      for (const { party, delta } of Object.values(balanceDelta)) {
        const p = currentParties.find((x) => x.id === party.id);
        if (p)
          await updateItem("parties", party.id, {
            balance: (p.balance || 0) + delta,
          });
      }
      const totalQty = rowData.reduce((s, r) => s + r.qty, 0);
      const stockItem = getItems("items").find((i) => i.id === pfProduct.id);
      if (stockItem)
        await updateItem("items", pfProduct.id, {
          stock: (stockItem.stock || 0) - totalQty,
        });
      setSnack({
        open: true,
        message: `${rowData.length} invoice${rowData.length > 1 ? "s" : ""} saved successfully!`,
        severity: "success",
      });
      setPfProduct(null);
      setPfDate(new Date().toISOString().split("T")[0]);
      setPfNoGST(false);
      setPfCustomers([
        {
          _key: Date.now(),
          party: null,
          qty: 1,
          price: "",
          discountPercent: "",
        },
      ]);
      setView("list");
    } catch (err) {
      console.error("Product-first save error:", err);
      await showAlert({ title: "Save error", message: "Error saving invoices: " + err.message, variant: "danger" });
    } finally {
      setPfIsSaving(false);
    }
  };

  const openQuickAddParty = (inputValue, callback, isPhone = false) => {
    quickAddPartyCallbackRef.current = callback;
    setQuickAddParty({
      open: true,
      name: isPhone ? "" : (inputValue || ""),
      phone: isPhone ? (inputValue || "") : "",
      balance: "",
    });
  };
  const applyItemToRow = (index, selected) => {
    setItems(prev => {
      const newItems = [...prev];
      const isSaleNow = isSale;
      let item = { ...newItems[index] };
      delete item.amountDraft;
      delete item.qtyDisplay;
      item.itemId = selected.id;
      item.name = selected.name || '';
      item.price = Number(isSaleNow ? (selected.salePrice ?? selected.price) : (selected.purchasePrice ?? selected.price)) || '';
      item.taxRate = Number(selected.taxRate) || 0;
      item.cgstRate = selected.cgstRate != null ? Number(selected.cgstRate) : item.taxRate / 2;
      item.sgstRate = selected.sgstRate != null ? Number(selected.sgstRate) : item.taxRate / 2;
      item.igstRate = selected.igstRate != null ? Number(selected.igstRate) : item.taxRate;
      item.utgstRate = selected.utgstRate != null ? Number(selected.utgstRate) : item.taxRate / 2;
      item.isComposite = !!selected.isComposite;
      item.gstType = selected.gstType || null;
      item.hsnCode = selected.hsnCode || '';
      item.unit = selected.unit || item.unit || '';
      item.taxInclusive = !!selected.taxInclusive;
      item.category = selected.category || '';
      item.size = selected.size || '';
      item.variant = selected.variant || '';
      item.discountPercent = isSaleNow && Number(selected.discount) ? Number(selected.discount) : '';
      item.recipe = Array.isArray(selected.recipe) ? selected.recipe : [];
      item.recipeOverrides = {};
      if (item.qty === '' || item.qty == null) item.qty = 1;
      const qty = Number(item.qty) || 0;
      const price = Number(item.price) || 0;
      const disc = Number(item.discountPercent) || 0;
      const tax = Number(item.taxRate) || 0;
      item.total = item.notBilled ? 0 : (item.taxInclusive
        ? qty * price * (1 - disc / 100)
        : qty * price * (1 - disc / 100) * (1 + tax / 100));
      newItems[index] = item;
      if (index === newItems.length - 1) newItems.push({ ...BLANK_ROW });
      return newItems;
    });
  };

  const openQuickAddItem = (inputValue, callback) => {
    itemDialogCallbackRef.current = callback;
    setItemDialog({ open: true, name: inputValue || "" });
  };

  /* ── Quick-add dialogs ── */
  const quickAddDialogs = (
    <>
      <PartyFormDialog
        open={quickAddParty.open}
        onClose={() => setQuickAddParty((s) => ({ ...s, open: false }))}
        partyType={isSale ? "Customer" : "Vendor"}
        editingParty={null}
        initialName={quickAddParty.name || ""}
        initialPhone={quickAddParty.phone || ""}
        compact
        onSaved={(newParty) => {
          if (quickAddPartyCallbackRef.current) quickAddPartyCallbackRef.current(newParty);
          quickAddPartyCallbackRef.current = null;
          setQuickAddParty({ open: false, name: "", phone: "", balance: "" });
        }}
      />

      <ItemFormDialog
        open={itemDialog.open}
        initialName={itemDialog.name}
        onClose={() => setItemDialog({ open: false, name: "" })}
        onSaved={(newItem) => {
          if (itemDialogCallbackRef.current) itemDialogCallbackRef.current(newItem);
          itemDialogCallbackRef.current = null;
          setItemDialog({ open: false, name: "" });
        }}
      />

      <PartyFormDialog
        open={editPartyOpen}
        onClose={() => setEditPartyOpen(false)}
        partyType={isSale ? "Customer" : "Vendor"}
        editingParty={selectedParty}
        compact
        onSaved={(updatedParty) => {
          setSelectedParty(updatedParty);
          setEditPartyOpen(false);
        }}
      />
    </>
  );

  /* ── Shared input field styles ── */
  const inputSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: tokens.radius.sm,
      transition: "box-shadow 0.15s",
      "&.Mui-focused": {
        boxShadow: `0 0 0 3px ${alpha(tokens.primary, 0.12)}`,
      },
    },
  };

  /* ════════════════════════════════════════════════════════════════
     CREATE / EDIT VIEWS
  ════════════════════════════════════════════════════════════════ */
  if (view === "create" || view === "edit") {
    /* ── PRODUCT FIRST ── */
    if (isSale && entryMode === "product" && view === "create") {
      const pfTotal = pfCustomers.reduce((s, r) => s + pfRowTotal(r), 0);
      const pfValidCount = pfCustomers.filter(
        (r) => r.party && Number(r.qty) > 0,
      ).length;

      const StepCircle = ({ n, active }) => (
        <Box
          sx={{
            width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: active
              ? `linear-gradient(135deg, ${tokens.primaryDark}, ${tokens.primaryLight})`
              : "rgba(0,0,0,0.12)",
            boxShadow: active ? `0 2px 8px ${alpha(tokens.primary, 0.32)}` : "none",
          }}
        >
          <Typography sx={{ fontSize: "0.72rem", fontWeight: 900, color: active ? "white" : "text.disabled", lineHeight: 1 }}>
            {n}
          </Typography>
        </Box>
      );

      return (
        <>
          <Box sx={{ pb: 4 }}>

            {/* Header — identical to Customer First */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2, flexWrap: "wrap" }}>
              <Tooltip title="Back to list (Esc)">
                <IconButton
                  onClick={() => setView("list")}
                  sx={{ border: "1px solid", borderColor: "divider", borderRadius: tokens.radius.sm, "&:hover": { bgcolor: tokens.primarySoft, borderColor: tokens.primaryBorder } }}
                >
                  <ChevronLeft size={20} />
                </IconButton>
              </Tooltip>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: "-0.01em" }}>
                  New Sales Invoice
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Product First — one product, distribute to many customers
                </Typography>
              </Box>
              <ToggleButtonGroup
                value={entryMode} exclusive onChange={(_e, v) => v && setEntryMode(v)} size="small"
                sx={{
                  bgcolor: "rgba(0,0,0,0.04)", p: "3px", borderRadius: tokens.radius.sm, border: "none",
                  width: { xs: "100%", sm: "auto" },
                  "& .MuiToggleButtonGroup-grouped": { border: 0, borderRadius: `${tokens.radius.sm} !important`, mx: 0.25, flex: { xs: 1, sm: "none" } },
                }}
              >
                <ToggleButton value="customer" sx={{ textTransform: "none", fontWeight: 700, px: { xs: 1.5, sm: 2 }, py: 0.75, fontSize: "0.8rem", "&.Mui-selected": { bgcolor: "white", boxShadow: "0 1px 4px rgba(0,0,0,0.1)", color: tokens.primary } }}>
                  <Users size={14} style={{ marginRight: 5 }} />Customer First
                </ToggleButton>
                <ToggleButton value="product" sx={{ textTransform: "none", fontWeight: 700, px: { xs: 1.5, sm: 2 }, py: 0.75, fontSize: "0.8rem", "&.Mui-selected": { bgcolor: "white", boxShadow: "0 1px 4px rgba(0,0,0,0.1)", color: tokens.primary } }}>
                  <Package size={14} style={{ marginRight: 5 }} />Product First
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {/* ── Step 1: Product & Settings ── */}
            <EnhancedCard accent sx={{ mb: 2 }} tokens={tokens}>
              {/* Step header strip */}
              <Box sx={{ px: 2.5, py: 1.5, display: "flex", alignItems: "center", gap: 1.25, borderBottom: "1px solid", borderColor: alpha(tokens.primary, 0.12), bgcolor: tokens.primarySoft }}>
                <StepCircle n={1} active />
                <Box>
                  <Typography variant="overline" sx={{ fontWeight: 800, color: tokens.primary, letterSpacing: "0.08em", fontSize: "0.65rem", lineHeight: 1 }}>
                    Choose Product &amp; Settings
                  </Typography>
                  <Typography variant="caption" sx={{ color: alpha(tokens.primary, 0.65), display: "block", lineHeight: 1.2, mt: 0.25 }}>
                    Pick the item to sell, set invoice date and GST preference
                  </Typography>
                </Box>
              </Box>

              <CardContent sx={{ p: 2.5 }}>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 8 }}>
                    <ItemSelect
                      options={stockItems}
                      value={pfProduct}
                      onChange={(v) => {
                        if (typeof v === 'string' || !v) { setPfProduct(null); return; }
                        setPfProduct(v);
                        if (v) setPfCustomers((prev) => prev.map((r) => ({ ...r, price: r.price || (v.salePrice ?? "") })));
                      }}
                      placeholder="Search or select a product…"
                      sx={inputSx}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField fullWidth size="small" type="date" label="Invoice Date" value={pfDate} onChange={(e) => setPfDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} sx={inputSx} />
                  </Grid>
                </Grid>

                {/* Product detail panel */}
                {pfProduct ? (
                  <Box
                    sx={{
                      mt: 2, borderRadius: tokens.radius.md, overflow: "hidden",
                      border: `1.5px solid ${tokens.primaryBorder}`,
                      display: "flex", flexWrap: "wrap",
                    }}
                  >
                    {/* Product name block */}
                    <Box sx={{ flex: "1 1 160px", px: 2.5, py: 1.75, borderRight: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: "text.disabled", fontSize: "0.62rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                        Selected Product
                      </Typography>
                      <Typography variant="subtitle1" sx={{ fontWeight: 800, color: "text.primary", mt: 0.25, lineHeight: 1.25 }}>
                        {pfProduct.name}
                      </Typography>
                      {pfProduct.hsnCode && (
                        <Typography variant="caption" sx={{ color: "text.disabled", fontFamily: "monospace" }}>
                          HSN {pfProduct.hsnCode}
                        </Typography>
                      )}
                    </Box>
                    {/* Stats columns */}
                    {[
                      { label: "Sale Price", value: `₹${pfProduct.salePrice || 0}`, color: tokens.primary },
                      { label: "In Stock",   value: `${pfProduct.stock ?? "—"} ${pfProduct.unit || ""}`.trim(), color: tokens.success },
                      { label: "GST Rate",   value: `${pfNoGST ? 0 : (pfProduct.taxRate || 0)}%`, color: "text.primary" },
                      ...(pfProduct.purchasePrice && canViewPurchasePrice
                        ? [{ label: "Margin", value: `₹${((pfProduct.salePrice || 0) - pfProduct.purchasePrice).toFixed(0)}`, color: tokens.success }]
                        : []),
                    ].map((stat, i, arr) => (
                      <Box
                        key={i}
                        sx={{
                          flex: "0 0 auto", px: 2.5, py: 1.75,
                          display: "flex", flexDirection: "column", justifyContent: "center",
                          borderRight: i < arr.length - 1 ? "1px solid" : "none",
                          borderColor: "divider",
                          bgcolor: i === 0 ? alpha(tokens.primary, 0.03) : "background.paper",
                          minWidth: 90,
                        }}
                      >
                        <Typography variant="caption" sx={{ fontWeight: 700, color: "text.disabled", fontSize: "0.62rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                          {stat.label}
                        </Typography>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800, color: stat.color, mt: 0.25, fontSize: "0.95rem" }}>
                          {stat.value}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                ) : (
                  <Box
                    sx={{
                      mt: 2, py: 3, borderRadius: tokens.radius.md,
                      border: "1.5px dashed", borderColor: "divider",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
                    }}
                  >
                    <Box sx={{ width: 40, height: 40, borderRadius: "50%", bgcolor: alpha(tokens.primary, 0.07), display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Package size={20} style={{ color: alpha(tokens.primary, 0.4) }} />
                    </Box>
                    <Typography variant="body2" sx={{ color: "text.disabled", fontWeight: 500 }}>
                      Select a product above to see its details
                    </Typography>
                  </Box>
                )}
              </CardContent>
            </EnhancedCard>

            {/* ── Step 2: Customers ── */}
            <EnhancedCard sx={{ mb: 2 }} tokens={tokens}>
              {/* Step header strip */}
              <Box sx={{ px: 2.5, py: 1.5, display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid", borderColor: "divider", bgcolor: "rgba(0,0,0,0.015)" }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
                  <StepCircle n={2} active={!!pfProduct} />
                  <Box>
                    <Typography variant="overline" sx={{ fontWeight: 800, color: pfProduct ? "text.primary" : "text.disabled", letterSpacing: "0.08em", fontSize: "0.65rem", lineHeight: 1 }}>
                      Add Customers &amp; Quantities
                    </Typography>
                    <Typography variant="caption" sx={{ color: "text.disabled", display: "block", lineHeight: 1.2, mt: 0.25 }}>
                      Each row generates a separate invoice
                    </Typography>
                  </Box>
                </Box>
                <Chip
                  label={`${pfCustomers.length} row${pfCustomers.length !== 1 ? "s" : ""}`}
                  size="small"
                  sx={{ fontWeight: 700, bgcolor: tokens.primarySoft, color: tokens.primary, border: `1px solid ${tokens.primaryBorder}` }}
                />
              </Box>

              {/* Table */}
              <TableContainer sx={{ overflowX: "auto" }}>
                <Table size="small" sx={{ minWidth: 650 }}>
                  <TableHead sx={{ bgcolor: alpha(tokens.primary, 0.04) }}>
                    <TableRow>
                      {["#", "Customer *", "Qty", "Rate (₹)", "Disc %", "Amount", ""].map((h, i) => (
                        <TableCell
                          key={i}
                          align={i >= 2 && i <= 4 ? "center" : i === 5 ? "right" : "left"}
                          sx={{
                            fontWeight: 700, fontSize: "0.68rem", textTransform: "uppercase",
                            letterSpacing: "0.07em", color: alpha(tokens.primary, 0.75),
                            pl: i === 0 ? 1.5 : undefined, pr: i === 6 ? 0.5 : undefined,
                            width: [36, undefined, 100, 140, 90, 120, 36][i],
                            py: 1,
                          }}
                        >
                          {h}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pfCustomers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} sx={{ py: 5, textAlign: "center", border: 0 }}>
                          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                            <Box sx={{ width: 44, height: 44, borderRadius: "50%", bgcolor: alpha(tokens.primary, 0.06), display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <Users size={22} style={{ color: alpha(tokens.primary, 0.3) }} />
                            </Box>
                            <Typography variant="body2" sx={{ color: "text.disabled", fontWeight: 500 }}>
                              No customers added yet
                            </Typography>
                            <Typography variant="caption" sx={{ color: "text.disabled" }}>
                              Click "Add Customer Row" below to start
                            </Typography>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ) : (
                      pfCustomers.map((row, idx) => {
                        const rowAmt = pfRowTotal(row);
                        const isValid = row.party && Number(row.qty) > 0;
                        return (
                          <TableRow
                            key={row._key}
                            sx={{
                              "&:hover": { bgcolor: alpha(tokens.primary, 0.025) },
                              transition: "background 0.12s",
                              borderLeft: row.party ? `3px solid ${tokens.primary}` : "3px solid transparent",
                            }}
                          >
                            <TableCell sx={{ pl: 1.5, color: "text.disabled", fontWeight: 700, fontSize: "0.68rem" }}>
                              {idx + 1}
                            </TableCell>
                            <TableCell sx={{ py: 1.25 }}>
                              <PartySelect
                                options={parties}
                                value={row.party}
                                onChange={(v) => updatePfCustomer(row._key, "party", v)}
                                label=""
                                placeholder="Search customer…"
                                sx={inputSx}
                              />
                            </TableCell>
                            <TableCell align="center" sx={{ py: 1.25 }}>
                              <TextField
                                type="number" size="small" value={row.qty} placeholder="1"
                                onChange={(e) => { const n = parseFloat(e.target.value); updatePfCustomer(row._key, "qty", e.target.value === "" ? "" : (isNaN(n) ? 0 : Math.round(n * 1000) / 1000)); }}
                                onFocus={(e) => e.target.select()}
                                slotProps={{ input: { min: 0, step: "any", style: { textAlign: "center" } } }}
                                sx={{ width: 80, ...inputSx }}
                              />
                            </TableCell>
                            <TableCell align="right" sx={{ py: 1.25 }}>
                              <TextField
                                type="number" size="small" value={row.price} placeholder="0.00"
                                onChange={(e) => updatePfCustomer(row._key, "price", e.target.value)}
                                onFocus={(e) => e.target.select()}
                                slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment>, min: 0, step: 0.01, style: { textAlign: "right" } } }}
                                sx={{ width: 120, ...inputSx }}
                              />
                            </TableCell>
                            <TableCell align="center" sx={{ py: 1.25 }}>
                              <TextField
                                type="number" size="small" value={row.discountPercent} placeholder="0"
                                onChange={(e) => updatePfCustomer(row._key, "discountPercent", e.target.value)}
                                onFocus={(e) => e.target.select()}
                                slotProps={{ input: { min: 0, max: 100, step: 0.5, style: { textAlign: "center" } } }}
                                sx={{ width: 76, ...inputSx }}
                              />
                            </TableCell>
                            <TableCell align="right" sx={{ py: 1.25 }}>
                              <Typography variant="body2" sx={{ fontWeight: 800, fontSize: "0.9rem", color: rowAmt > 0 ? tokens.primary : "text.disabled" }}>
                                {rowAmt > 0 ? `₹${rowAmt.toFixed(2)}` : "—"}
                              </Typography>
                            </TableCell>
                            <TableCell sx={{ pr: 1 }}>
                              <IconButton
                                size="small"
                                onClick={() => removePfCustomer(row._key)}
                                sx={{ color: "text.disabled", "&:hover": { color: tokens.error, bgcolor: `${tokens.error}12` }, borderRadius: tokens.radius.sm }}
                              >
                                <Trash2 size={15} />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Table footer */}
              <Box sx={{ px: 2, py: 1.5, display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid rgba(0,0,0,0.06)", bgcolor: "rgba(0,0,0,0.012)" }}>
                <Button
                  startIcon={<Plus size={15} />}
                  variant="outlined"
                  size="small"
                  onClick={addPfCustomer}
                  sx={{ fontWeight: 700, borderRadius: tokens.radius.sm, textTransform: "none", borderColor: tokens.primaryBorder, color: tokens.primary, "&:hover": { bgcolor: tokens.primarySoft } }}
                >
                  Add Customer Row
                </Button>
                <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 500 }}>
                    {pfValidCount} valid invoice{pfValidCount !== 1 ? "s" : ""}
                  </Typography>
                  <Box sx={{ px: 2, py: 0.75, bgcolor: tokens.primarySoft, borderRadius: tokens.radius.sm, border: `1px solid ${tokens.primaryBorder}` }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: tokens.primary }}>
                      ₹{pfTotal.toFixed(2)}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </EnhancedCard>

            {/* ── Save bar ── */}
            <Box sx={{ display: "flex", gap: 2, justifyContent: "flex-end", alignItems: "center", mt: 1 }}>
              <Box sx={{ display: "flex", gap: 1 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <Box component="kbd" sx={{ px: 0.9, py: 0.3, borderRadius: "6px", bgcolor: "rgba(0,0,0,0.06)", border: "1px solid rgba(0,0,0,0.12)", fontSize: "0.65rem", fontFamily: "monospace", fontWeight: 700, color: "text.secondary" }}>Esc</Box>
                  <Typography variant="caption" color="text.secondary">Back</Typography>
                </Box>
              </Box>
              <GradientButton
                tokens={tokens}
                startIcon={pfIsSaving ? null : <Save size={17} />}
                onClick={handlePfSave}
                disabled={pfIsSaving || !pfProduct || pfValidCount === 0}
                sx={{ px: 4, py: 1.2, fontSize: "0.95rem" }}
              >
                {pfIsSaving ? "Saving…" : `Save ${pfValidCount || ""} Invoice${pfValidCount !== 1 ? "s" : ""}`}
              </GradientButton>
            </Box>

          </Box>
          {quickAddDialogs}
        </>
      );
    }

    /* ── CUSTOMER FIRST (default) ── */
    // GST column is always available so a rate can be typed on any row at any time —
    // only the "No GST" toggle removes it entirely (tax-free invoice).
    const showGstColumn = !noGST;
    const showUnitColumn = config.features?.unitColumn !== false;
    const itemUnitOptions = config.itemUnits?.length ? config.itemUnits : ['BAG','BOX','KGS','LTR','MTR','NOS','PCS'];
    return (
      <>
        <Box sx={{ pb: { xs: isMobile ? 11 : 2, sm: 2 } }}>
          {/* Page header */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2, flexWrap: "wrap" }}>
            <Tooltip title="Back to list (Esc)">
              <IconButton
                onClick={() => setView("list")}
                sx={{
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: tokens.radius.sm,
                  "&:hover": {
                    bgcolor: tokens.primarySoft,
                    borderColor: tokens.primaryBorder,
                  },
                }}
              >
                <ChevronLeft size={20} />
              </IconButton>
            </Tooltip>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="h6"
                sx={{ fontWeight: 800, letterSpacing: "-0.01em" }}
              >
                {view === "edit"
                  ? `Edit ${isSale ? "Invoice" : "Bill"}`
                  : `New ${isSale ? "Sales Invoice" : "Purchase Bill"}`}
              </Typography>
              {view === "create" && (
                <Typography variant="caption" color="text.secondary">
                  Fill in the details and save
                </Typography>
              )}
            </Box>
            {isSale && view === "create" && (
              <ToggleButtonGroup
                value={entryMode}
                exclusive
                onChange={(_e, v) => v && setEntryMode(v)}
                size="small"
                sx={{
                  bgcolor: "rgba(0,0,0,0.04)",
                  p: "3px",
                  borderRadius: tokens.radius.sm,
                  width: { xs: "100%", sm: "auto" },
                  "& .MuiToggleButtonGroup-grouped": {
                    border: 0,
                    borderRadius: `${tokens.radius.sm} !important`,
                    mx: 0.25,
                    flex: { xs: 1, sm: "none" },
                  },
                }}
              >
                <ToggleButton
                  value="customer"
                  sx={{
                    textTransform: "none",
                    fontWeight: 700,
                    px: { xs: 1.5, sm: 2 },
                    py: 0.75,
                    fontSize: "0.8rem",
                    "&.Mui-selected": {
                      bgcolor: "white",
                      boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
                      color: tokens.primary,
                    },
                  }}
                >
                  <Users size={14} style={{ marginRight: 5 }} />
                  Customer First
                </ToggleButton>
                <ToggleButton
                  value="product"
                  sx={{
                    textTransform: "none",
                    fontWeight: 700,
                    px: { xs: 1.5, sm: 2 },
                    py: 0.75,
                    fontSize: "0.8rem",
                    "&.Mui-selected": {
                      bgcolor: "white",
                      boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
                      color: tokens.primary,
                    },
                  }}
                >
                  <Package size={14} style={{ marginRight: 5 }} />
                  Product First
                </ToggleButton>
              </ToggleButtonGroup>
            )}
            {/* One by One mode toggle — a guided step-at-a-time flow through
                Party → Items → Review & Checkout, same philosophy as POS's
                own guided mode. Only offered for a brand-new invoice/bill in
                the standard Customer First layout (see obActive above). */}
            {view === "create" && entryMode === "customer" && (
              <Tooltip title={obMode ? 'One by One mode: guided step-by-step entry (Party → Items → Review), turn off for the normal all-in-one form' : 'Turn on One by One mode: a guided flow that walks through Party → Items → Review & Checkout one step at a time'}>
                <Box
                  onClick={() => { setObMode((v) => !v); setObStep("party"); }}
                  sx={{
                    display: "flex", alignItems: "center", gap: 0.4, cursor: "pointer", userSelect: "none",
                    px: 1, py: 0.5, borderRadius: "100px", border: "1px solid",
                    borderColor: obMode ? tokens.primary : "divider",
                    bgcolor: obMode ? tokens.primarySoft : "transparent",
                  }}
                >
                  <ListOrdered size={13} color={obMode ? tokens.primary : "#9c8a84"} style={{ flexShrink: 0 }} />
                  <Typography sx={{ color: obMode ? tokens.primary : "text.secondary", fontSize: "0.72rem", fontWeight: 700, display: { xs: "none", sm: "inline" }, whiteSpace: "nowrap" }}>
                    1-by-1
                  </Typography>
                  <Switch
                    size="small"
                    checked={obMode}
                    onChange={() => {}}
                  />
                </Box>
              </Tooltip>
            )}
          </Box>

          {/* One by One mode — step indicator, visible across all 3 steps so
              the user always knows where they are in the flow. */}
          {obActive && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 2, flexWrap: "wrap", rowGap: 0.5 }}>
              {[
                { key: "party", label: isSale ? "Customer" : "Vendor" },
                { key: "items", label: "Items" },
                { key: "review", label: "Review" },
              ].map((s, i, arr) => {
                const isDone = arr.findIndex((x) => x.key === obStep) > i;
                const isActive = s.key === obStep;
                return (
                  <React.Fragment key={s.key}>
                    <Chip
                      size="small"
                      label={`${i + 1}. ${s.label}`}
                      sx={{
                        fontWeight: 700, fontSize: "0.7rem", height: 24,
                        bgcolor: isActive ? tokens.primary : isDone ? tokens.primarySoft : alpha("#000", 0.05),
                        color: isActive ? "#fff" : isDone ? tokens.primary : "text.disabled",
                      }}
                    />
                    {i < arr.length - 1 && <ChevronRight size={14} style={{ color: isDone ? tokens.primary : alpha("#000", 0.2), flexShrink: 0 }} />}
                  </React.Fragment>
                );
              })}
            </Box>
          )}

          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column", lg: "row" },
              gap: 2,
              alignItems: "flex-start",
            }}
          >
            <Box
              sx={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                gap: 1.5,
              }}
            >


              {/* Card 1: Invoice Details — One by One mode's Party step.
                  Stays mounted at every step (state never resets switching
                  steps) — only its visibility toggles via display, so a
                  party already picked isn't lost by stepping forward then
                  back. */}
              <EnhancedCard accent tokens={tokens} sx={obActive && obStep !== "party" ? { display: "none" } : {}}>
                <Box sx={{ px: 2.5, pt: 2, pb: 1 }}>
                  <SectionLabel icon={FileText} tokens={tokens}>
                    {isSale ? "Sales Invoice Details" : "Purchase Bill Details"}
                  </SectionLabel>
                </Box>
                <CardContent sx={{ pt: 1.5, pb: 2, px: 2.5 }}>
                  <Grid container spacing={2}>
                    {/* Customer / Vendor select */}
                    <Grid size={{ xs: 12 }}>
                      <PartySelect
                        options={parties}
                        value={selectedParty}
                        onChange={(v) => { setSelectedParty(v); setLoyaltyRedeemPoints(0); setLoyaltyRedeemValue(0); obFocusContinue(); }}
                        onAddNew={(inputValue, isPhone) =>
                          openQuickAddParty(inputValue, (p) => { setSelectedParty(p); setShowCustomerPanel(true); obFocusContinue(); }, isPhone)
                        }
                        label={isSale ? "Customer" : "Vendor"}
                        placeholder={`Search ${isSale ? "customer" : "vendor"}…`}
                        sx={inputSx}
                      />
                      {!isSale && !selectedParty && (
                        <Chip
                          size="small"
                          label="Cash Purchase"
                          sx={{ mt: 0.75, fontWeight: 700, fontSize: '0.7rem', bgcolor: tokens.successSoft, color: 'success.dark', border: '1px solid rgba(100,116,139,0.25)', height: 20 }}
                        />
                      )}
                      {/* The Customer/Vendor Preview Panel further down is
                          always-on but only actually shown at lg+ (display:
                          none below that) — there was no way to see it at all
                          on tablet/phone. This trigger opens the same panel
                          content in a dialog instead, only below lg where the
                          side panel itself is hidden. */}
                      {selectedParty && config.features?.customerPreview !== false && (
                        <Chip
                          size="small"
                          label="View details"
                          onClick={() => setShowCustomerPanel(true)}
                          clickable
                          sx={{ mt: 0.75, ml: 0.75, fontWeight: 700, fontSize: '0.7rem', height: 20, display: { xs: 'inline-flex', lg: 'none' } }}
                        />
                      )}
                      {loyaltyRedeemPoints > 0 && (
                        <Chip
                          size="small"
                          label={`${loyaltyRedeemPoints} pts redeemed`}
                          color="warning"
                          onDelete={() => { setLoyaltyRedeemPoints(0); setLoyaltyRedeemValue(0); }}
                          sx={{ mt: 0.75, fontWeight: 700, fontSize: '0.7rem', height: 20 }}
                        />
                      )}
                    </Grid>
                    {/* Invoice #, Date, Time, Due Date, Billed By */}
                    <Grid size={{ xs: 12 }}>
                      <Grid container spacing={1.5}>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                          <TextField
                            fullWidth
                            size="small"
                            label={isSale ? "Invoice No." : "Bill No."}
                            value={invoiceNumber}
                            onChange={(e) => setInvoiceNumber(e.target.value)}
                            slotProps={{
                              input: {
                                startAdornment: (
                                  <InputAdornment position="start">
                                    <Receipt size={14} color={tokens.primary} />
                                  </InputAdornment>
                                ),
                              },
                            }}
                            sx={inputSx}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                          <TextField
                            fullWidth
                            size="small"
                            type="date"
                            label="Date"
                            value={invoiceDate}
                            onChange={(e) => setInvoiceDate(e.target.value)}
                            slotProps={{
                              inputLabel: { shrink: true },
                              input: {
                                startAdornment: (
                                  <InputAdornment position="start">
                                    <Calendar size={14} color={tokens.primary} />
                                  </InputAdornment>
                                ),
                              },
                            }}
                            sx={inputSx}
                          />
                        </Grid>
                        <Grid size={{ xs: 6, sm: 3, md: 3 }}>
                          <TextField
                            fullWidth
                            size="small"
                            type="time"
                            label="Time"
                            value={invoiceTime}
                            onChange={(e) => setInvoiceTime(e.target.value)}
                            slotProps={{
                              inputLabel: { shrink: true },
                              input: {
                                startAdornment: (
                                  <InputAdornment position="start">
                                    <Clock size={14} color={tokens.primary} />
                                  </InputAdornment>
                                ),
                              },
                            }}
                            sx={inputSx}
                          />
                        </Grid>
                        <Grid size={{ xs: 6, sm: 3, md: 3 }}>
                          <TextField
                            fullWidth
                            size="small"
                            type="date"
                            // "Due Date (optional)" clips against the ~140px
                            // width this field gets at xs:6 on a phone — the
                            // shrunk floating label doesn't auto-shrink its
                            // own font to fit. Shorter label on mobile only.
                            label={isMobile ? "Due Date" : "Due Date (optional)"}
                            value={dueDate}
                            onChange={(e) => setDueDate(e.target.value)}
                            slotProps={{ inputLabel: { shrink: true } }}
                            sx={inputSx}
                          />
                        </Grid>
                        {salesStaff.length > 0 && (
                          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                            <TextField
                              select
                              fullWidth
                              size="small"
                              label="Billed by"
                              value={selectedBilledBy || ownerName}
                              onChange={(e) => setSelectedBilledBy(e.target.value)}
                              sx={inputSx}
                            >
                              <MenuItem value={ownerName}>{ownerName} (You)</MenuItem>
                              {salesStaff.map(s => <MenuItem key={s.id} value={s.name}>{s.name}</MenuItem>)}
                            </TextField>
                          </Grid>
                        )}
                      </Grid>
                    </Grid>
                    {referenceImagesEnabled && (
                      <Grid size={{ xs: 12 }}>
                        <Divider sx={{ my: 0.5 }} />
                        <ReferenceImagesPanel
                          recordId={editId || newRecordId}
                          table={isSale ? "sales" : "purchases"}
                          businessId={currentBusiness?.id}
                          invoiceNumber={invoiceNumber}
                          referenceImageIds={referenceImageIds}
                          onIdsChange={setReferenceImageIds}
                        />
                      </Grid>
                    )}
                  </Grid>
                </CardContent>
              </EnhancedCard>

              {/* One by One mode — step 1 of 3: advance to Items. A party is
                  optional (Cash & Carry / Cash Purchase is a valid state
                  already used elsewhere in this file), so Continue is never
                  blocked on it — only rendered on the Party step itself. */}
              {obActive && obStep === "party" && (
                <Box>
                  <GradientButton ref={obContinueBtnRef} fullWidth tokens={tokens} onClick={() => setObStep("items")} endIcon={<ChevronRight size={18} />}>
                    Continue to Items
                  </GradientButton>
                </Box>
              )}

              {/* Card 2: Items — One by One mode's Items step. */}
              <EnhancedCard tokens={tokens} sx={obActive && obStep !== "items" ? { display: "none" } : {}}>
                <Box
                  sx={{
                    px: 2.5,
                    py: 1.75,
                    borderBottom: "1px solid rgba(0,0,0,0.06)",
                    bgcolor: "rgba(0,0,0,0.015)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <SectionLabel icon={Package} tokens={tokens}>
                    Items & Quantities
                  </SectionLabel>
                  <Chip
                    label={`${items.length} item${items.length !== 1 ? "s" : ""}`}
                    size="small"
                    sx={{
                      fontWeight: 700,
                      bgcolor: tokens.primarySoft,
                      color: tokens.primary,
                      border: `1px solid ${tokens.primaryBorder}`,
                      fontSize: "0.72rem",
                    }}
                  />
                </Box>
                <CardContent sx={{ p: 0 }}>
                  {barcodeScanEnabled && !isMobile && (
                    <BarcodeInputRow
                      tokens={tokens}
                      onScan={handleBarcodeScan}
                      onOpenScanner={() => setScannerOpen(true)}
                      inputRef={barcodeInputRef}
                    />
                  )}
                  {/* ── Unified compact item rows — one line per item at every
                      screen size, no horizontal scroll. Unit/Disc%/GST live in
                      a per-row expandable strip so the base row stays lean. ── */}
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 1, p: 1.5 }}>
                    {items.map((item, index) => {
                      const rowKey = item._key ?? index;
                      const rowHasExtras = !!(item.unit || Number(item.discountPercent) > 0 || Number(item.taxRate) > 0);
                      const rowExpanded = rowHasExtras || expandedRowKeys.has(rowKey);
                      const toggleExpanded = () => {
                        setExpandedRowKeys((prev) => {
                          const next = new Set(prev);
                          if (next.has(rowKey)) next.delete(rowKey); else next.add(rowKey);
                          return next;
                        });
                      };
                      return (
                        <Paper
                          key={rowKey}
                          variant="outlined"
                          sx={{
                            borderRadius: tokens.radius.md,
                            borderColor: item.name || item.itemId ? tokens.primaryBorder : "divider",
                            bgcolor: index % 2 === 1 ? alpha(tokens.primary, 0.025) : "background.paper",
                            overflow: "hidden",
                            transition: "border-color 0.15s, background-color 0.15s",
                          }}
                        >
                          <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 0.625, sm: 1 }, p: { xs: 1, sm: 1.25 }, flexWrap: "wrap" }}>
                            <Box
                              sx={{
                                width: 20,
                                height: 20,
                                flexShrink: 0,
                                borderRadius: "50%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                bgcolor: item.name || item.itemId ? alpha(tokens.primary, 0.12) : alpha("#000", 0.06),
                              }}
                            >
                              <Typography variant="caption" sx={{ fontWeight: 800, color: item.name || item.itemId ? tokens.primary : "text.disabled", fontSize: "0.65rem", lineHeight: 1 }}>
                                {index + 1}
                              </Typography>
                            </Box>
                            {item.recipe?.length > 0 && (
                              <Tooltip title="Made from other stock items — see 'Inventory items used' below">
                                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, flexShrink: 0, borderRadius: "50%", bgcolor: alpha(tokens.primary, 0.12) }}>
                                  <Layers size={11} color={tokens.primary} />
                                </Box>
                              </Tooltip>
                            )}
                            <Box sx={{ flex: { xs: "1 1 100%", sm: "1 1 220px" }, minWidth: { xs: 0, sm: 180 } }}>
                              <ItemSelect
                                options={stockItems}
                                value={
                                  item.itemId
                                    ? stockItems.find((i) => i.id === item.itemId) || { id: item.itemId, name: item.name || '' }
                                    : item.name || null
                                }
                                inputRef={registerItemRowField(index, "item")}
                                onChange={(v) => {
                                  // ItemSelect is freeSolo+autoSelect — onChange can fire with a
                                  // plain typed string (e.g. user typed a name then blurred/tabbed
                                  // instead of pressing Enter on the highlighted match) instead of
                                  // the item object. Resolve it against stockItems by name before
                                  // giving up, so a real selection — and its stock link — is never
                                  // silently discarded.
                                  if (typeof v === "string") {
                                    const match = stockItems.find((i) => i.name?.toLowerCase() === v.trim().toLowerCase());
                                    if (match) { applyItemToRow(index, match); focusItemRowField(index, "qty"); return; }
                                    const newItems = [...items];
                                    newItems[index] = { ...newItems[index], itemId: "", name: v };
                                    setItems(newItems);
                                    return;
                                  }
                                  if (v && v.id) { applyItemToRow(index, v); focusItemRowField(index, "qty"); }
                                }}
                                onInputChange={(val) => {
                                  if (!item.itemId) {
                                    const newItems = [...items];
                                    newItems[index] = { ...newItems[index], name: val };
                                    setItems(newItems);
                                  }
                                }}
                                onAddNew={(inputValue) =>
                                  openQuickAddItem(inputValue, (newItem) => {
                                    applyItemToRow(index, newItem);
                                    focusItemRowField(index, "qty");
                                  })
                                }
                                isSale={isSale}
                                canViewPurchasePrice={canViewPurchasePrice}
                                placeholder="Search or select item…"
                                sx={inputSx}
                              />
                            </Box>
                            <Tooltip title={item.qtyDisplay !== undefined ? "Rounded for display — kept precise underneath so the typed Amount stays exact" : ""} disableHoverListener={item.qtyDisplay === undefined}>
                              <TextField
                                type="number"
                                size="small"
                                label="Qty"
                                value={item.qtyDisplay !== undefined ? item.qtyDisplay : item.qty}
                                onChange={(e) => {
                                  const n = parseFloat(e.target.value);
                                  updateItemRow(index, "qty", e.target.value === "" ? "" : (isNaN(n) ? 0 : Math.round(n * 100) / 100));
                                }}
                                onFocus={(e) => e.target.select()}
                                onKeyDown={itemFieldKeyDown(index, "qty")}
                                slotProps={{ htmlInput: { ref: registerItemRowField(index, "qty"), min: 0, step: "any", style: { textAlign: "center" } } }}
                                sx={{ width: { xs: 62, sm: 78 }, flexShrink: 0, ...inputSx }}
                              />
                            </Tooltip>
                            <TextField
                              type="number"
                              size="small"
                              label="Rate (₹)"
                              value={item.price}
                              placeholder="0.00"
                              onChange={(e) => updateItemRow(index, "price", e.target.value)}
                              onFocus={(e) => e.target.select()}
                              onKeyDown={itemFieldKeyDown(index, "price")}
                              slotProps={{
                                htmlInput: { ref: registerItemRowField(index, "price"), min: 0, step: 0.01 },
                                input: {
                                  startAdornment: <InputAdornment position="start"><Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 600 }}>₹</Typography></InputAdornment>,
                                },
                              }}
                              sx={{ width: { xs: 96, sm: 122 }, flexShrink: 0, ...inputSx }}
                            />
                            <Tooltip title={item.notBilled ? "Not billed — amount doesn't apply" : "Type an amount to auto-calculate Qty from the Rate"}>
                              <TextField
                                type="number"
                                size="small"
                                label="Amount"
                                value={
                                  item.amountDraft !== undefined
                                    ? item.amountDraft
                                    : ((item.total || 0) > 0 ? Number((item.total || 0).toFixed(2)) : "")
                                }
                                placeholder="0.00"
                                disabled={!Number(item.price) || item.notBilled}
                                onChange={(e) => updateItemRow(index, "amount", e.target.value)}
                                onBlur={() => {
                                  // Drop the raw draft on blur so the field
                                  // falls back to reflecting the real,
                                  // rounded total (e.g. after a decimal
                                  // amount solved a qty that doesn't
                                  // round-trip to the exact typed figure).
                                  if (item.amountDraft !== undefined) updateItemRow(index, "clearAmountDraft", undefined);
                                }}
                                onFocus={(e) => e.target.select()}
                                slotProps={{
                                  input: {
                                    startAdornment: <InputAdornment position="start"><Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 600 }}>₹</Typography></InputAdornment>,
                                    min: 0,
                                    step: 0.01,
                                    style: { fontWeight: 700 },
                                  },
                                }}
                                sx={{ width: { xs: 88, sm: 108 }, flexShrink: 0, ...inputSx }}
                              />
                            </Tooltip>
                            <Tooltip title={rowExpanded ? "Hide Unit / Discount / GST" : "Unit, Discount, GST…"}>
                              <IconButton size="small" onClick={toggleExpanded} sx={{ color: rowExpanded ? tokens.primary : "text.disabled", flexShrink: 0 }}>
                                <ChevronDown size={16} style={{ transform: rowExpanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                              </IconButton>
                            </Tooltip>
                            <IconButton
                              size="small"
                              onClick={() => removeItemRow(index)}
                              sx={{ color: "text.disabled", flexShrink: 0, "&:hover": { color: tokens.error, bgcolor: `${tokens.error}12` }, borderRadius: tokens.radius.sm }}
                            >
                              <Trash2 size={15} />
                            </IconButton>
                          </Box>

                          {rowExpanded && (
                            <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 1.25, px: 1.25, pb: 1.25, pt: 0.5, borderTop: "1px dashed", borderColor: "divider", bgcolor: alpha(tokens.primary, 0.02) }}>
                              {showUnitColumn && (
                                <TextField
                                  select
                                  size="small"
                                  label="Unit"
                                  value={item.unit || ""}
                                  onChange={(e) => updateItemRow(index, "unit", e.target.value)}
                                  SelectProps={{ displayEmpty: true }}
                                  sx={{ width: 100, ...inputSx }}
                                >
                                  <MenuItem value=""><em style={{ opacity: 0.5 }}>None</em></MenuItem>
                                  {itemUnitOptions.map((u) => (
                                    <MenuItem key={u} value={u}>{u}</MenuItem>
                                  ))}
                                </TextField>
                              )}
                              <TextField
                                type="number"
                                size="small"
                                label="Disc %"
                                value={item.discountPercent ?? ""}
                                placeholder="0"
                                onChange={(e) => updateItemRow(index, "discountPercent", e.target.value)}
                                onFocus={(e) => e.target.select()}
                                slotProps={{ input: { min: 0, max: 100, step: 0.5 } }}
                                sx={{ width: 90, ...inputSx }}
                              />
                              {showGstColumn && (
                                (useIGST || isComposite) ? (
                                  <TextField
                                    type="number"
                                    size="small"
                                    label={isComposite ? "Comp. Rate %" : "IGST %"}
                                    value={item.taxRate ?? ""}
                                    placeholder="0"
                                    onChange={(e) => updateItemRow(index, "taxRate", e.target.value === "" ? "" : Number(e.target.value))}
                                    onFocus={(e) => e.target.select()}
                                    slotProps={{ input: { min: 0, max: 100, step: 0.5, endAdornment: <InputAdornment position="end">%</InputAdornment> } }}
                                    sx={{ width: 100, ...inputSx }}
                                  />
                                ) : (
                                  <>
                                    <TextField
                                      type="number"
                                      size="small"
                                      label="CGST %"
                                      value={item.taxRate === "" || item.taxRate == null ? "" : (Number(item.taxRate) || 0) / 2}
                                      placeholder="0"
                                      onChange={(e) => updateItemRow(index, "taxRate", e.target.value === "" ? "" : (Number(e.target.value) || 0) * 2)}
                                      onFocus={(e) => e.target.select()}
                                      slotProps={{ input: { min: 0, max: 50, step: 0.5 } }}
                                      sx={{ width: 82, ...inputSx }}
                                    />
                                    <TextField
                                      type="number"
                                      size="small"
                                      label={useUTGST ? "UTGST %" : "SGST %"}
                                      value={item.taxRate === "" || item.taxRate == null ? "" : (Number(item.taxRate) || 0) / 2}
                                      placeholder="0"
                                      onChange={(e) => updateItemRow(index, "taxRate", e.target.value === "" ? "" : (Number(e.target.value) || 0) * 2)}
                                      onFocus={(e) => e.target.select()}
                                      slotProps={{ input: { min: 0, max: 50, step: 0.5 } }}
                                      sx={{ width: 82, ...inputSx }}
                                    />
                                  </>
                                )
                              )}
                              {Number(item.taxRate) > 0 && (
                                <Box sx={{ display: "flex", border: "1px solid", borderColor: "divider", borderRadius: "100px", overflow: "hidden", fontSize: "0.68rem", mb: 0.4 }}>
                                  {["Excl", "Incl"].map((label) => {
                                    const isIncl = label === "Incl";
                                    const active = isIncl ? !!item.taxInclusive : !item.taxInclusive;
                                    return (
                                      <Box
                                        key={label}
                                        onClick={() => updateItemRow(index, "taxInclusive", isIncl)}
                                        sx={{
                                          px: 1.1,
                                          py: 0.5,
                                          cursor: "pointer",
                                          fontWeight: 700,
                                          fontSize: "0.68rem",
                                          bgcolor: active ? tokens.primary : "transparent",
                                          color: active ? "#fff" : "text.secondary",
                                          transition: "all 0.15s",
                                          userSelect: "none",
                                        }}
                                      >
                                        {label} GST
                                      </Box>
                                    );
                                  })}
                                </Box>
                              )}
                              {!item.recipe?.length && (
                                <Tooltip title={item.notBilled ? "This line is not charged to the customer" : "Mark as not billed (e.g. a free cover/bag) — stock still deducts, ₹0 on the bill"}>
                                  <Box
                                    onClick={() => updateItemRow(index, "notBilled", !item.notBilled)}
                                    sx={{
                                      display: "flex", alignItems: "center", gap: 0.5, px: 1.1, py: 0.5, mb: 0.4,
                                      borderRadius: "100px", cursor: "pointer", userSelect: "none",
                                      border: "1px solid", borderColor: item.notBilled ? tokens.error : "divider",
                                      bgcolor: item.notBilled ? alpha(tokens.error, 0.08) : "transparent",
                                      color: item.notBilled ? tokens.error : "text.secondary",
                                      fontSize: "0.68rem", fontWeight: 700,
                                    }}
                                  >
                                    <Ban size={11} />
                                    Not billed
                                  </Box>
                                </Tooltip>
                              )}
                            </Box>
                          )}

                        </Paper>
                      );
                    })}
                  </Box>

                  <ConsolidatedRecipeStrip
                    items={items}
                    stockItems={stockItems}
                    tokens={tokens}
                    setItems={setItems}
                  />

                  <Box
                    sx={{
                      px: 2,
                      py: 1.5,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      borderTop: "1px solid rgba(0,0,0,0.06)",
                      bgcolor: "rgba(0,0,0,0.012)",
                    }}
                  >
                    <Button
                      startIcon={<Trash2 size={14} />}
                      onClick={() => setItems([{ ...BLANK_ROW }])}
                      size="small"
                      disabled={items.length === 1 && !items[0].name && !items[0].itemId}
                      sx={{
                        fontWeight: 600,
                        borderRadius: tokens.radius.sm,
                        color: "text.disabled",
                        textTransform: "none",
                        fontSize: "0.78rem",
                        "&:hover": { color: tokens.error, bgcolor: `${tokens.error}10` },
                        "&.Mui-disabled": { opacity: 0.3 },
                      }}
                    >
                      Clear All
                    </Button>
                    <Box sx={{ display: "flex", gap: 1 }}>
                      <Tooltip title="Add an item that's used up in the sale but not charged to the customer — e.g. a cover, bag, or packing consumable. Stock still deducts; it won't show on the printed bill.">
                        <Button
                          startIcon={<Ban size={14} />}
                          onClick={() => {
                            setItems((prev) => {
                              const next = [...prev, { ...BLANK_ROW, notBilled: true }];
                              return next;
                            });
                            setExpandedRowKeys((prev) => new Set(prev).add(items.length));
                          }}
                          variant="outlined"
                          size="small"
                          sx={{
                            fontWeight: 700,
                            borderRadius: tokens.radius.sm,
                            borderColor: "divider",
                            color: "text.secondary",
                            textTransform: "none",
                            "&:hover": {
                              bgcolor: alpha(tokens.error, 0.06),
                              borderColor: tokens.error,
                              color: tokens.error,
                            },
                          }}
                        >
                          Add Inventory Item
                        </Button>
                      </Tooltip>
                      <Button
                        startIcon={<Plus size={16} />}
                        onClick={addItemRow}
                        variant="outlined"
                        size="small"
                        sx={{
                          fontWeight: 700,
                          borderRadius: tokens.radius.sm,
                          borderColor: tokens.primaryBorder,
                          color: tokens.primary,
                          textTransform: "none",
                          minWidth: 120,
                          "&:hover": {
                            bgcolor: tokens.primarySoft,
                            borderColor: tokens.primary,
                          },
                        }}
                      >
                        Add Item
                      </Button>
                    </Box>
                  </Box>

                  <Box
                    sx={{
                      px: 2.5,
                      py: 1.75,
                      borderTop: "1px solid rgba(0,0,0,0.06)",
                    }}
                  >
                    <TextField
                      fullWidth
                      size="small"
                      label="Notes (optional)"
                      placeholder="Any remarks for this invoice…"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      multiline
                      rows={2}
                      sx={inputSx}
                    />
                  </Box>
                </CardContent>
              </EnhancedCard>

              {/* One by One mode — step 2 of 3: advance to Review & Checkout
                  once at least one item row is actually valid (same
                  itemId/name + qty>0 + price>=0 predicate handleSave itself
                  filters on, so Continue never unblocks a state that would
                  just fail the "No items added" check at save time anyway). */}
              {obActive && obStep === "items" && (
                <Box>
                  <Typography sx={{ fontSize: "0.68rem", color: "text.disabled", mb: 0.75, textAlign: "center" }}>
                    Press <Box component="kbd" sx={{ px: 0.6, py: 0.1, borderRadius: "4px", bgcolor: "rgba(0,0,0,0.06)", border: "1px solid rgba(0,0,0,0.12)", fontFamily: "monospace", fontWeight: 700 }}>Enter</Box> on the Rate field to add another item, or{" "}
                    <Box component="kbd" sx={{ px: 0.6, py: 0.1, borderRadius: "4px", bgcolor: "rgba(0,0,0,0.06)", border: "1px solid rgba(0,0,0,0.12)", fontFamily: "monospace", fontWeight: 700 }}>Shift+Enter</Box> to continue to Review
                  </Typography>
                  <Box sx={{ display: "flex", gap: 1 }}>
                    <Button variant="outlined" onClick={() => setObStep("party")} startIcon={<ChevronLeft size={18} />}
                      sx={{ fontWeight: 700, textTransform: "none", borderRadius: tokens.radius.md, px: 2.5 }}>
                      Back
                    </Button>
                    <GradientButton fullWidth tokens={tokens}
                      disabled={!items.some((i) => (i.itemId || i.name?.trim()) && Number(i.qty) > 0 && Number(i.price) >= 0)}
                      onClick={() => setObStep("review")} endIcon={<ChevronRight size={18} />}>
                      Continue to Review
                    </GradientButton>
                  </Box>
                </Box>
              )}
            {/* ── Guided mode Review step renders HERE, inside the same content
                column as the Party and Items steps, so the outer row's shape
                is identical on all three steps: [content flex:1][preview 280].
                It used to be a SIBLING of the preview panel (and width:100%),
                which made the row become [content][panel][review 100%] on the
                review step only — pushing the fixed-width panel to a
                different position than it held on party/items. That was the
                reported "panel shifts right to left". ── */}
            {/* One by One mode — dedicated Review & Checkout step layout.
                Built as its own separate block (not a restyle of the narrow
                296px Summary Sidebar below, which stays completely untouched
                and hidden here) — reusing all the same state/handlers, just
                composed as a proper 2-column review screen: left column for
                the settings you configure (Sale Type, Payment Mode, Advance,
                Discount), right column for the outcome you check before
                saving (totals breakdown + Invoice Total + Save/Print/Clear),
                sticky so Save stays reachable while scrolling the left side.
                Its own internal split is at `lg`, not `md`: this block now
                sits INSIDE the content column (which already gives up 280px
                to the preview rail at lg), so splitting it again at md would
                leave two cramped columns in the ~700px that remains. */}
            {obActive && obStep === "review" && (
              <Box sx={{ width: "100%", display: "flex", flexDirection: { xs: "column", lg: "row" }, gap: 2, alignItems: "flex-start" }}>
                {/* Left column — settings */}
                <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1.5 }}>
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
                    <SectionLabel icon={TrendingUp} tokens={tokens}>
                      Review & Checkout
                    </SectionLabel>
                    <Button size="small" onClick={() => setObStep("items")} startIcon={<ChevronLeft size={14} />}
                      sx={{ fontWeight: 700, textTransform: "none", fontSize: "0.75rem", color: "text.secondary" }}>
                      Back to Items
                    </Button>
                  </Box>

                  {/* Mixed GST type warning — the one alert important enough
                      to surface before totals, so it stays at the top here too. */}
                  {!noGST && mixedGstWarning && (
                    <Alert severity="warning" sx={{ fontSize: '0.78rem' }}>
                      <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, mb: 0.4 }}>
                        Mixed GST types — not compliant
                      </Typography>
                      <Typography sx={{ fontSize: '0.75rem', lineHeight: 1.5 }}>
                        A single invoice cannot have both IGST and CGST+SGST items.
                      </Typography>
                      <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', mt: 0.5, lineHeight: 1.5 }}>
                        <strong>IGST items:</strong> {mixedGstWarning.igstItems}<br />
                        <strong>Intra-state items:</strong> {mixedGstWarning.intraItems}
                      </Typography>
                    </Alert>
                  )}

                  {/* Discount */}
                  <EnhancedCard tokens={tokens}>
                    <CardContent sx={{ p: 2 }}>
                      <Typography variant="caption" sx={{ fontWeight: 800, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.06em", fontSize: "0.68rem", display: "block", mb: 1 }}>
                        Discount
                      </Typography>
                      <TextField
                        fullWidth
                        size="small"
                        type="number"
                        label={discountType === "percent" ? "Invoice Discount %" : "Invoice Discount ₹"}
                        value={discountPercent || ""}
                        placeholder="0"
                        onChange={(e) => setDiscountPercent(parseFloat(e.target.value) || 0)}
                        onFocus={(e) => e.target.select()}
                        slotProps={{
                          input: {
                            startAdornment: (
                              <InputAdornment position="start">
                                <ToggleButtonGroup
                                  value={discountType}
                                  exclusive
                                  size="small"
                                  onChange={(_, v) => {
                                    if (!v) return;
                                    const sub = calculateSubtotal();
                                    if (v === "amount" && discountType === "percent") {
                                      setDiscountPercent(sub > 0 ? parseFloat(((Number(discountPercent) || 0) / 100 * sub).toFixed(2)) : 0);
                                    } else if (v === "percent" && discountType === "amount") {
                                      setDiscountPercent(sub > 0 ? parseFloat(((Number(discountPercent) || 0) / sub * 100).toFixed(2)) : 0);
                                    }
                                    setDiscountType(v);
                                  }}
                                  sx={{ mr: 0.5 }}
                                >
                                  <ToggleButton value="percent" sx={{ py: 0.25, px: 0.75, fontSize: '0.7rem', fontWeight: 700, minWidth: 28, lineHeight: 1 }}>%</ToggleButton>
                                  <ToggleButton value="amount" sx={{ py: 0.25, px: 0.75, fontSize: '0.7rem', fontWeight: 700, minWidth: 28, lineHeight: 1 }}>₹</ToggleButton>
                                </ToggleButtonGroup>
                              </InputAdornment>
                            ),
                            min: 0,
                            step: discountType === "percent" ? 0.5 : 1,
                          },
                        }}
                        sx={inputSx}
                      />
                      {(config.features?.packingCharges !== false || config.features?.shippingCharges !== false) && (
                        <Box sx={{ mt: 1.5, pt: 1.5, borderTop: "1px dashed", borderColor: "divider" }}>
                          <Typography variant="caption" sx={{ fontWeight: 700, color: "text.disabled", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", mb: 0.75 }}>
                            Extra Charges
                          </Typography>
                          <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 1 }}>
                            {config.features?.packingCharges !== false && (
                              <TextField
                                fullWidth
                                size="small"
                                type="number"
                                label="Packing Charges"
                                placeholder="0.00"
                                value={packingCharge}
                                onChange={(e) => setPackingCharge(e.target.value)}
                                onFocus={(e) => e.target.select()}
                                slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment>, min: 0, step: 0.01 } }}
                              />
                            )}
                            {config.features?.shippingCharges !== false && (
                              <TextField
                                fullWidth
                                size="small"
                                type="number"
                                label="Shipping Charges"
                                placeholder="0.00"
                                value={shippingCharge}
                                onChange={(e) => setShippingCharge(e.target.value)}
                                onFocus={(e) => e.target.select()}
                                slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment>, min: 0, step: 0.01 } }}
                              />
                            )}
                          </Box>
                        </Box>
                      )}
                    </CardContent>
                  </EnhancedCard>

                  {/* Sale Type + Payment Mode */}
                  <EnhancedCard tokens={tokens}>
                    <CardContent sx={{ p: 2 }}>
                      <Typography variant="caption" sx={{ fontWeight: 800, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.06em", fontSize: "0.68rem", display: "block", mb: 1 }}>
                        {isSale ? "Sale Type" : "Purchase Type"}
                      </Typography>
                      <ToggleButtonGroup exclusive size="small" value={saleType} onChange={(_, v) => v && setSaleType(v)}
                        sx={{ width: "100%", bgcolor: alpha("#000", 0.03), borderRadius: tokens.radius.sm, p: 0.4, border: `1px solid ${alpha(tokens.primary, 0.14)}`,
                          "& .MuiToggleButtonGroup-grouped": { border: 0, borderRadius: `${tokens.radius.sm} !important`, flex: 1, mx: 0.25 } }}>
                        <ToggleButton value="paid" sx={{ textTransform: "none", fontWeight: 700, py: 0.6, fontSize: "0.78rem",
                          "&.Mui-selected": { bgcolor: tokens.primary, color: "white", "&:hover": { bgcolor: tokens.primary } } }}>
                          {isSale ? 'Cash / Bank Sale' : 'Cash / Bank Purchase'}
                        </ToggleButton>
                        <ToggleButton value="credit" sx={{ textTransform: "none", fontWeight: 700, py: 0.6, fontSize: "0.78rem",
                          "&.Mui-selected": { bgcolor: '#1a1a1a', color: "white", "&:hover": { bgcolor: '#333' } } }}>
                          {isSale ? 'Credit Sale' : 'Credit Purchase'}
                        </ToggleButton>
                      </ToggleButtonGroup>

                      {saleType === 'paid' && (
                        <Box sx={{ mt: 1.5 }}>
                          <Typography variant="caption" sx={{ fontWeight: 800, color: alpha(tokens.primary, 0.85), textTransform: "uppercase", letterSpacing: "0.06em", fontSize: "0.65rem", display: "block", mb: 1 }}>
                            Payment Mode
                          </Typography>
                          <PayModeTiles value={paymentMode} onChange={setPaymentMode} tokens={tokens} ariaLabel="Payment mode" />
                          {paymentMode === "Split" && (
                            <Box sx={{ mt: 1.25 }}>
                              <SplitPaymentInput
                                cash={splitCash} onCashChange={setSplitCash}
                                bank={splitBank} onBankChange={setSplitBank}
                                total={calculateFinalTotal()}
                                accentColor={tokens.primary}
                              />
                            </Box>
                          )}
                          {currentBusiness?.upiId && (paymentMode === "Bank" || (paymentMode === "Split" && Number(splitBank) > 0)) && (
                            <Button
                              fullWidth
                              size="small"
                              startIcon={<QrCode size={14} />}
                              onClick={() => setPaymentQrOpen(true)}
                              sx={{ mt: 1.25, fontWeight: 700, textTransform: "none", borderRadius: tokens.radius.sm, color: tokens.primary, bgcolor: "white", border: `1px solid ${alpha(tokens.primary, 0.25)}`, "&:hover": { bgcolor: tokens.primarySoft } }}
                            >
                              Show Payment QR (₹{paymentQrAmount.toFixed(2)})
                            </Button>
                          )}
                        </Box>
                      )}

                      {saleType === 'credit' && !!selectedParty?.id && (
                        <Box sx={{ mt: 1.5, pt: 1.5, borderTop: "1px dashed", borderColor: "divider" }}>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1 }}>
                            <Wallet size={14} color={tokens.success} />
                            <Typography variant="caption" sx={{ fontWeight: 800, color: "success.dark", textTransform: "uppercase", letterSpacing: "0.06em", fontSize: "0.65rem" }}>
                              {isSale ? "Advance Received" : "Advance Paid"}
                            </Typography>
                          </Box>
                          <TextField
                            fullWidth
                            size="small"
                            type="number"
                            placeholder="0.00"
                            value={advance}
                            onChange={(e) => setAdvance(e.target.value)}
                            onFocus={(e) => e.target.select()}
                            slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment>, min: 0, step: 0.01 } }}
                          />
                          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                            {isSale ? "Auto-recorded as payment in" : "Auto-recorded as payment out"}
                          </Typography>
                          {Number(advance) > 0 && (
                            <Box sx={{ mt: 1.25 }}>
                              <Typography variant="caption" sx={{ fontWeight: 800, color: 'success.dark', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.65rem', display: 'block', mb: 0.75 }}>
                                {isSale ? "Received Via" : "Paid Via"}
                              </Typography>
                              <PayModeTiles value={advanceMode} onChange={setAdvanceMode} tokens={tokens} accent={tokens.success} ariaLabel={isSale ? "Advance received via" : "Advance paid via"} />
                              {advanceMode === "Split" && (
                                <Box sx={{ mt: 1.25 }}>
                                  <SplitPaymentInput
                                    cash={advanceSplitCash} onCashChange={setAdvanceSplitCash}
                                    bank={advanceSplitBank} onBankChange={setAdvanceSplitBank}
                                    total={Number(advance) || 0}
                                    accentColor={tokens.success}
                                  />
                                </Box>
                              )}
                            </Box>
                          )}
                          {Number(advance) > 0 && (
                            <Box sx={{ display: "flex", justifyContent: "space-between", mt: 1.25, pt: 1.25, borderTop: "1px dashed rgba(100,116,139,0.3)" }}>
                              <Typography variant="body2" sx={{ fontWeight: 700, color: tokens.error }}>
                                {isSale ? "Balance Due" : "Balance Payable"}
                              </Typography>
                              <Typography variant="body2" sx={{ fontWeight: 800, color: tokens.error }}>
                                ₹{Math.max(0, calculateFinalTotal() - Number(advance)).toFixed(2)}
                              </Typography>
                            </Box>
                          )}
                        </Box>
                      )}
                    </CardContent>
                  </EnhancedCard>

                  {/* Notes */}
                  <EnhancedCard tokens={tokens}>
                    <CardContent sx={{ p: 2 }}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Notes (optional)"
                        placeholder="Any remarks for this invoice…"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        multiline
                        rows={2}
                        sx={inputSx}
                      />
                    </CardContent>
                  </EnhancedCard>
                </Box>

                {/* Right column — totals + checkout actions */}
                <Box sx={{ width: { xs: "100%", md: 320 }, flexShrink: 0 }}>
                  <Box sx={{ position: { md: "sticky" }, top: { md: 68 } }}>
                    <Card
                      elevation={0}
                      sx={{
                        border: `1.5px solid ${tokens.primaryBorder}`,
                        bgcolor: "rgba(17,17,17,0.025)",
                        borderRadius: tokens.radius.lg,
                        overflow: "hidden",
                        borderTop: `3px solid ${tokens.primary}`,
                        boxShadow: `0 4px 20px ${alpha(tokens.primary, 0.08)}`,
                      }}
                    >
                      <Box sx={{ px: 2.5, pt: 2, pb: 1, borderBottom: "1px solid rgba(17,17,17,0.1)" }}>
                        <SectionLabel icon={Receipt} tokens={tokens}>
                          Totals
                        </SectionLabel>
                      </Box>
                      <CardContent sx={{ pt: 1.5, pb: 2, px: 2.5 }}>
                        {!noGST && items.some(i => (i.itemId || i.name?.trim()) && Number(i.qty) > 0) && (
                          <Box sx={{ mb: 1.5 }}>
                            <Chip
                              size="small"
                              label={
                                isComposite ? 'Composite Scheme' :
                                useIGST ? 'IGST (Inter-State)' :
                                useUTGST ? 'CGST + UTGST (UT)' :
                                'CGST + SGST (Intra-State)'
                              }
                              sx={{ fontWeight: 700, fontSize: '0.7rem', height: 22, bgcolor: alpha(tokens.primary, 0.08), color: tokens.primary, border: `1px solid ${alpha(tokens.primary, 0.2)}` }}
                            />
                          </Box>
                        )}
                        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.6, mb: 1.5 }}>
                          {[
                            { label: "Subtotal", value: `₹${calculateSubtotal().toFixed(2)}` },
                            ...(discountPercent > 0
                              ? [{ label: discountType === "amount" ? `Discount (₹${discountPercent})` : `Discount (${discountPercent}%)`, value: `-₹${calculateDiscountAmount().toFixed(2)}`, color: tokens.error }]
                              : []),
                            ...(noGST
                              ? [{ label: "GST (disabled)", value: `₹0.00` }]
                              : isComposite
                              ? [{ label: 'Composition Tax', value: `₹${calculateTax().toFixed(2)}` }]
                              : useIGST
                              ? [{ label: 'IGST', value: `₹${calculateTax().toFixed(2)}` }]
                              : useUTGST
                              ? [
                                  { label: 'CGST', value: `₹${(calculateTax() / 2).toFixed(2)}` },
                                  { label: 'UTGST', value: `₹${(calculateTax() / 2).toFixed(2)}` },
                                ]
                              : [
                                  { label: 'CGST', value: `₹${(calculateTax() / 2).toFixed(2)}` },
                                  { label: 'SGST', value: `₹${(calculateTax() / 2).toFixed(2)}` },
                                ]),
                            ...(loyaltyRedeemValue > 0
                              ? [{ label: `${config.loyalty?.programName || 'Reward Points'} (${loyaltyRedeemPoints} pts)`, value: `-₹${loyaltyRedeemValue.toFixed(2)}`, color: tokens.error }]
                              : []),
                            ...(calculatePackingCharge() > 0
                              ? [{ label: "Packing Charges", value: `₹${calculatePackingCharge().toFixed(2)}` }]
                              : []),
                            ...(calculateShippingCharge() > 0
                              ? [{ label: "Shipping Charges", value: `₹${calculateShippingCharge().toFixed(2)}` }]
                              : []),
                          ].map((r) => (
                            <Box key={r.label} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <Typography variant="body2" color="text.secondary">{r.label}</Typography>
                              <Typography variant="body2" sx={{ fontWeight: 700, color: r.color || "text.primary" }}>{r.value}</Typography>
                            </Box>
                          ))}
                          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 0.25 }}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                              <Typography variant="body2" color="text.secondary">Round Off</Typography>
                              {(() => {
                                const t = calculateTotal();
                                const target = roundOff > 0 ? getRoundUpSeq(t)[roundOff - 1] : roundOff < 0 ? getRoundDownSeq(t)[Math.abs(roundOff) - 1] : null;
                                return target != null ? (
                                  <Typography variant="caption" sx={{ bgcolor: alpha(roundOff > 0 ? tokens.success : tokens.error, 0.1), color: roundOff > 0 ? tokens.success : tokens.error, fontWeight: 800, fontSize: "0.68rem", px: 0.7, py: 0.15, borderRadius: "4px", letterSpacing: "0.02em" }}>
                                    → ₹{target.toFixed(0)}
                                  </Typography>
                                ) : null;
                              })()}
                            </Box>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                              {(() => {
                                const ro = calculateRoundOff();
                                return (
                                  <Typography variant="body2" sx={{ fontWeight: 700, minWidth: "56px", textAlign: "right", color: ro > 0 ? tokens.success : ro < 0 ? tokens.error : "text.disabled" }}>
                                    {roundOff !== 0 ? `${ro >= 0 ? "+" : ""}₹${ro.toFixed(2)}` : "—"}
                                  </Typography>
                                );
                              })()}
                              <IconButton size="small" onClick={() => setRoundOff((l) => Math.max(-3, l - 1))} disabled={roundOff <= -getRoundDownSeq(calculateTotal()).length}
                                sx={{ p: 0.4, border: `1px solid ${alpha(tokens.error, 0.35)}`, color: tokens.error, bgcolor: alpha(tokens.error, 0.06), borderRadius: "6px", "&:hover": { bgcolor: alpha(tokens.error, 0.12) }, "&.Mui-disabled": { opacity: 0.35 } }}>
                                <Minus size={12} />
                              </IconButton>
                              <IconButton size="small" onClick={() => setRoundOff((l) => Math.min(3, l + 1))} disabled={roundOff >= getRoundUpSeq(calculateTotal()).length}
                                sx={{ p: 0.4, border: `1px solid ${alpha(tokens.success, 0.45)}`, color: tokens.success, bgcolor: alpha(tokens.success, 0.06), borderRadius: "6px", "&:hover": { bgcolor: alpha(tokens.success, 0.12) }, "&.Mui-disabled": { opacity: 0.35 } }}>
                                <Plus size={12} />
                              </IconButton>
                            </Box>
                          </Box>
                        </Box>

                        <Box sx={{ p: 1.5, borderRadius: tokens.radius.md, background: `linear-gradient(135deg, ${alpha(tokens.primary, 0.08)} 0%, ${alpha(tokens.primaryLight, 0.06)} 100%)`, border: `1px solid ${tokens.primaryBorder}`, mb: 1.5 }}>
                          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                            <Typography variant="body2" sx={{ fontWeight: 700, color: "text.secondary" }}>Invoice Total</Typography>
                            <Typography variant="h6" sx={{ fontWeight: 900, color: tokens.primary, letterSpacing: "-0.02em" }}>
                              ₹{calculateFinalTotal().toFixed(2)}
                            </Typography>
                          </Box>
                        </Box>

                        <GradientButton tokens={tokens} fullWidth onClick={() => handleSave()} disabled={isSaving || !canWrite} startIcon={<Save size={18} />} sx={{ py: 1.3, fontSize: "0.95rem", mb: 1 }}>
                          {isSaving ? "Saving…" : view === "edit" ? "Update Transaction" : "Save Transaction"}
                        </GradientButton>
                        <Button variant="outlined" fullWidth size="large" startIcon={<Plus size={17} />} onClick={() => handleSave({ saveAndCreateNew: true })} disabled={isSaving}
                          sx={{ borderRadius: tokens.radius.md, py: 1, fontWeight: 700, textTransform: "none", fontSize: "0.88rem", borderColor: tokens.primaryBorder, color: tokens.primary, "&:hover": { borderColor: tokens.primary, bgcolor: tokens.primarySoft } }}>
                          Save & Create New
                        </Button>
                        <Button variant="outlined" fullWidth size="large" startIcon={<Printer size={17} />} onClick={() => handleSave({ saveAndPrint: true })} disabled={isSaving}
                          sx={{ borderRadius: tokens.radius.md, py: 1, fontWeight: 700, textTransform: "none", fontSize: "0.88rem", mt: 1, borderColor: "success.main", color: "success.main", "&:hover": { borderColor: "success.dark", bgcolor: "success.50" } }}>
                          Save & Print
                        </Button>
                        <Button variant="text" fullWidth size="medium" startIcon={<RotateCcw size={15} />} onClick={() => resetForm()}
                          sx={{ borderRadius: tokens.radius.md, py: 0.75, mt: 1, fontWeight: 600, textTransform: "none", fontSize: "0.82rem", color: "text.secondary", "&:hover": { bgcolor: "rgba(0,0,0,0.04)", color: "error.main" } }}>
                          Clear All
                        </Button>
                      </CardContent>
                    </Card>
                  </Box>
                </Box>
              </Box>
            )}
            </Box>

            {/* ── Customer / Vendor Preview Panel ──
                This is a direct child of the outer row and is rendered
                UNCONDITIONALLY with respect to obStep — it must never be
                wrapped in, or ordered relative to, anything step-conditional,
                or it will appear to move between steps (which is exactly the
                bug that was reported: the review step used to render a
                width:100% sibling AFTER this panel, displacing it). Every
                guided step now renders inside the content column to this
                panel's left, so the row is always [content flex:1][rail 280]
                and this box's geometry is identical on all three steps. ── */}
            {config.features?.customerPreview !== false && (
              <Box sx={{ display: { xs: 'none', lg: 'block' }, width: 280, flexShrink: 0, alignSelf: 'flex-start' }}>
                <Box sx={{ position: 'sticky', top: 68, maxHeight: 'calc(100vh - 84px)', overflowY: 'auto', overflowX: 'hidden', borderRadius: 2, border: '1px solid', borderColor: 'divider', boxShadow: `0 4px 20px rgba(0,0,0,0.08)` }}>
                  <CustomerPreviewPanel
                    party={selectedParty}
                    onClose={null}
                    redeemedPoints={isSale ? loyaltyRedeemPoints : 0}
                    onRedeem={isSale ? (pts, val) => { setLoyaltyRedeemPoints(pts); setLoyaltyRedeemValue(val); } : null}
                    label={isSale ? 'Customer' : 'Vendor'}
                    actions={selectedParty ? (
                      <Button size="small" variant="outlined" startIcon={<Edit size={13} />}
                        onClick={() => setEditPartyOpen(true)}
                        sx={{ width: '100%', fontWeight: 600, textTransform: 'none', borderRadius: 1.5, fontSize: '0.78rem' }}>
                        Edit {isSale ? 'Customer' : 'Vendor'}
                      </Button>
                    ) : undefined}
                  />
                </Box>
              </Box>
            )}

            {/* Mobile/tablet fallback for the panel above — same content in a
                dialog, opened via the "View details" chip next to the party
                selector, since the side panel itself is display:none below lg. */}
            {/* `isLgUp &&` rather than an sx display override on the Dialog
                root: a Modal renders through a Portal and manages its own
                root styling/scroll-lock, so toggling `display` on it is not a
                reliable way to "hide" a dialog — it can still be openable and
                still take over focus. Not rendering it at all above lg (where
                the always-visible side rail already shows the same content)
                is unambiguous. */}
            {selectedParty && !isLgUp && config.features?.customerPreview !== false && (
              <Dialog open={showCustomerPanel} onClose={() => setShowCustomerPanel(false)} maxWidth="xs" fullWidth>
                <CustomerPreviewPanel
                  party={selectedParty}
                  onClose={() => setShowCustomerPanel(false)}
                  redeemedPoints={isSale ? loyaltyRedeemPoints : 0}
                  onRedeem={isSale ? (pts, val) => { setLoyaltyRedeemPoints(pts); setLoyaltyRedeemValue(val); } : null}
                  label={isSale ? 'Customer' : 'Vendor'}
                  actions={(
                    <Button size="small" variant="outlined" startIcon={<Edit size={13} />}
                      onClick={() => setEditPartyOpen(true)}
                      sx={{ width: '100%', fontWeight: 600, textTransform: 'none', borderRadius: 1.5, fontSize: '0.78rem' }}>
                      Edit {isSale ? 'Customer' : 'Vendor'}
                    </Button>
                  )}
                />
              </Dialog>
            )}


            {/* ── Summary Sidebar — the narrow always-on sidebar used outside
                One by One mode (create/edit normally, Product First, etc).
                In One by One mode this is replaced entirely by the dedicated
                wide Review & Checkout block above — hidden here on ALL 3
                steps (not just party/items) since the review step now has
                its own separate layout instead of reusing this narrow one. ── */}
            <Box sx={{ width: { xs: "100%", lg: 296 }, flexShrink: 0, ...(obActive ? { display: "none" } : {}) }}>
              <Box sx={{ position: { lg: "sticky" }, top: { lg: 68 }, maxHeight: { lg: "calc(100vh - 84px)" }, overflowY: { lg: "auto" }, pb: { lg: 0.5 } }}>
                <Card
                  elevation={0}
                  sx={{
                    border: `1.5px solid ${tokens.primaryBorder}`,
                    bgcolor: "rgba(17,17,17,0.025)",
                    borderRadius: tokens.radius.lg,
                    overflow: "hidden",
                    borderTop: `3px solid ${tokens.primary}`,
                    boxShadow: `0 4px 20px ${alpha(tokens.primary, 0.08)}`,
                  }}
                >
                  <Box
                    sx={{
                      px: 2.5,
                      pt: 2,
                      pb: 1,
                      borderBottom: "1px solid rgba(17,17,17,0.1)",
                    }}
                  >
                    <SectionLabel icon={TrendingUp} tokens={tokens}>
                      Summary
                    </SectionLabel>
                  </Box>
                  <CardContent sx={{ pt: 1.5, pb: 2, px: 2.5 }}>
                    {/* Discount field in sidebar */}
                    <TextField
                      fullWidth
                      size="small"
                      type="number"
                      label={discountType === "percent" ? "Invoice Discount %" : "Invoice Discount ₹"}
                      value={discountPercent || ""}
                      placeholder="0"
                      onChange={(e) => setDiscountPercent(parseFloat(e.target.value) || 0)}
                      onFocus={(e) => e.target.select()}
                      slotProps={{
                        input: {
                          startAdornment: (
                            <InputAdornment position="start">
                              <ToggleButtonGroup
                                value={discountType}
                                exclusive
                                size="small"
                                onChange={(_, v) => {
                                  if (!v) return;
                                  const sub = calculateSubtotal();
                                  if (v === "amount" && discountType === "percent") {
                                    setDiscountPercent(sub > 0 ? parseFloat(((Number(discountPercent) || 0) / 100 * sub).toFixed(2)) : 0);
                                  } else if (v === "percent" && discountType === "amount") {
                                    setDiscountPercent(sub > 0 ? parseFloat(((Number(discountPercent) || 0) / sub * 100).toFixed(2)) : 0);
                                  }
                                  setDiscountType(v);
                                }}
                                sx={{ mr: 0.5 }}
                              >
                                <ToggleButton value="percent" sx={{ py: 0.25, px: 0.75, fontSize: '0.7rem', fontWeight: 700, minWidth: 28, lineHeight: 1 }}>%</ToggleButton>
                                <ToggleButton value="amount" sx={{ py: 0.25, px: 0.75, fontSize: '0.7rem', fontWeight: 700, minWidth: 28, lineHeight: 1 }}>₹</ToggleButton>
                              </ToggleButtonGroup>
                            </InputAdornment>
                          ),
                          min: 0,
                          step: discountType === "percent" ? 0.5 : 1,
                        },
                      }}
                      sx={{ ...inputSx, mb: 1.75 }}
                    />
                    {/* Mixed GST type warning */}
                    {!noGST && mixedGstWarning && (
                      <Alert
                        severity="warning"
                        sx={{ mb: 1.75, fontSize: '0.72rem', py: 0.75, px: 1.25, '& .MuiAlert-message': { p: 0 }, '& .MuiAlert-icon': { fontSize: 16, mr: 1, py: 0.75 } }}
                      >
                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, mb: 0.4 }}>
                          Mixed GST types — not compliant
                        </Typography>
                        <Typography sx={{ fontSize: '0.7rem', lineHeight: 1.5 }}>
                          A single invoice cannot have both IGST and CGST+SGST items.
                        </Typography>
                        <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', mt: 0.5, lineHeight: 1.5 }}>
                          <strong>IGST items:</strong> {mixedGstWarning.igstItems}<br />
                          <strong>Intra-state items:</strong> {mixedGstWarning.intraItems}
                        </Typography>
                        <Typography sx={{ fontSize: '0.68rem', mt: 0.75, fontWeight: 600, color: 'warning.dark' }}>
                          Please update the item GST type or split into two separate bills.
                        </Typography>
                      </Alert>
                    )}

                    {/* GST type info chip — derived from items */}
                    {!noGST && items.some(i => (i.itemId || i.name?.trim()) && Number(i.qty) > 0) && (
                      <Box sx={{ mb: 1.75 }}>
                        <Chip
                          size="small"
                          label={
                            isComposite ? 'Composite Scheme' :
                            useIGST ? 'IGST (Inter-State)' :
                            useUTGST ? 'CGST + UTGST (UT)' :
                            'CGST + SGST (Intra-State)'
                          }
                          sx={{ fontWeight: 700, fontSize: '0.7rem', height: 22, bgcolor: alpha(tokens.primary, 0.08), color: tokens.primary, border: `1px solid ${alpha(tokens.primary, 0.2)}` }}
                        />
                      </Box>
                    )}
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 0.6,
                        mb: 1.5,
                      }}
                    >
                      {[
                        {
                          label: "Subtotal",
                          value: `₹${calculateSubtotal().toFixed(2)}`,
                        },
                        ...(discountPercent > 0
                          ? [
                              {
                                label: discountType === "amount" ? `Discount (₹${discountPercent})` : `Discount (${discountPercent}%)`,
                                value: `-₹${calculateDiscountAmount().toFixed(2)}`,
                                color: tokens.error,
                              },
                            ]
                          : []),
                        ...(noGST
                          ? [{ label: "GST (disabled)", value: `₹0.00` }]
                          : isComposite
                          ? [{ label: 'Composition Tax', value: `₹${calculateTax().toFixed(2)}` }]
                          : useIGST
                          ? [{ label: 'IGST', value: `₹${calculateTax().toFixed(2)}` }]
                          : useUTGST
                          ? [
                              { label: 'CGST', value: `₹${(calculateTax() / 2).toFixed(2)}` },
                              { label: 'UTGST', value: `₹${(calculateTax() / 2).toFixed(2)}` },
                            ]
                          : [
                              { label: 'CGST', value: `₹${(calculateTax() / 2).toFixed(2)}` },
                              { label: 'SGST', value: `₹${(calculateTax() / 2).toFixed(2)}` },
                            ]),
                        ...(loyaltyRedeemValue > 0
                          ? [{ label: `${config.loyalty?.programName || 'Reward Points'} (${loyaltyRedeemPoints} pts)`, value: `-₹${loyaltyRedeemValue.toFixed(2)}`, color: tokens.error }]
                          : []),
                        ...(calculatePackingCharge() > 0
                          ? [{ label: "Packing Charges", value: `₹${calculatePackingCharge().toFixed(2)}` }]
                          : []),
                        ...(calculateShippingCharge() > 0
                          ? [{ label: "Shipping Charges", value: `₹${calculateShippingCharge().toFixed(2)}` }]
                          : []),
                      ].map((r) => (
                        <Box
                          key={r.label}
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <Typography variant="body2" color="text.secondary">
                            {r.label}
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 700,
                              color: r.color || "text.primary",
                            }}
                          >
                            {r.value}
                          </Typography>
                        </Box>
                      ))}
                      {/* Round Off row */}
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          mt: 0.25,
                        }}
                      >
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.75,
                          }}
                        >
                          <Typography variant="body2" color="text.secondary">
                            Round Off
                          </Typography>
                          {(() => {
                            const t = calculateTotal();
                            const target =
                              roundOff > 0
                                ? getRoundUpSeq(t)[roundOff - 1]
                                : roundOff < 0
                                  ? getRoundDownSeq(t)[Math.abs(roundOff) - 1]
                                  : null;
                            return target != null ? (
                              <Typography
                                variant="caption"
                                sx={{
                                  bgcolor: alpha(
                                    roundOff > 0 ? tokens.success : tokens.error,
                                    0.1,
                                  ),
                                  color:
                                    roundOff > 0 ? tokens.success : tokens.error,
                                  fontWeight: 800,
                                  fontSize: "0.68rem",
                                  px: 0.7,
                                  py: 0.15,
                                  borderRadius: "4px",
                                  letterSpacing: "0.02em",
                                }}
                              >
                                → ₹{target.toFixed(0)}
                              </Typography>
                            ) : null;
                          })()}
                        </Box>
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.5,
                          }}
                        >
                          {(() => {
                            const ro = calculateRoundOff();
                            return (
                              <Typography
                                variant="body2"
                                sx={{
                                  fontWeight: 700,
                                  minWidth: "56px",
                                  textAlign: "right",
                                  color:
                                    ro > 0
                                      ? tokens.success
                                      : ro < 0
                                        ? tokens.error
                                        : "text.disabled",
                                }}
                              >
                                {roundOff !== 0
                                  ? `${ro >= 0 ? "+" : ""}₹${ro.toFixed(2)}`
                                  : "—"}
                              </Typography>
                            );
                          })()}
                          <IconButton
                            size="small"
                            onClick={() =>
                              setRoundOff((l) => Math.max(-3, l - 1))
                            }
                            disabled={
                              roundOff <= -getRoundDownSeq(calculateTotal()).length
                            }
                            sx={{
                              p: 0.4,
                              border: `1px solid ${alpha(tokens.error, 0.35)}`,
                              color: tokens.error,
                              bgcolor: alpha(tokens.error, 0.06),
                              borderRadius: "6px",
                              "&:hover": { bgcolor: alpha(tokens.error, 0.12) },
                              "&.Mui-disabled": { opacity: 0.35 },
                            }}
                          >
                            <Minus size={12} />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() =>
                              setRoundOff((l) => Math.min(3, l + 1))
                            }
                            disabled={
                              roundOff >= getRoundUpSeq(calculateTotal()).length
                            }
                            sx={{
                              p: 0.4,
                              border: `1px solid ${alpha(tokens.success, 0.45)}`,
                              color: tokens.success,
                              bgcolor: alpha(tokens.success, 0.06),
                              borderRadius: "6px",
                              "&:hover": { bgcolor: alpha(tokens.success, 0.12) },
                              "&.Mui-disabled": { opacity: 0.35 },
                            }}
                          >
                            <Plus size={12} />
                          </IconButton>
                        </Box>
                      </Box>
                    </Box>

                    {(config.features?.packingCharges !== false || config.features?.shippingCharges !== false) && (
                      <Box sx={{ mb: 1.5, pt: 1, borderTop: "1px dashed", borderColor: "divider" }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: "text.disabled", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", mb: 0.75 }}>
                          Extra Charges
                        </Typography>
                        <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 1 }}>
                        {config.features?.packingCharges !== false && (
                          <TextField
                            fullWidth
                            size="small"
                            type="number"
                            label="Packing Charges"
                            placeholder="0.00"
                            value={packingCharge}
                            onChange={(e) => setPackingCharge(e.target.value)}
                            onFocus={(e) => e.target.select()}
                            slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment>, min: 0, step: 0.01 } }}
                          />
                        )}
                        {config.features?.shippingCharges !== false && (
                          <TextField
                            fullWidth
                            size="small"
                            type="number"
                            label="Shipping Charges"
                            placeholder="0.00"
                            value={shippingCharge}
                            onChange={(e) => setShippingCharge(e.target.value)}
                            onFocus={(e) => e.target.select()}
                            slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment>, min: 0, step: 0.01 } }}
                          />
                        )}
                        </Box>
                      </Box>
                    )}

                    <Box
                      sx={{
                        p: 1.5,
                        borderRadius: tokens.radius.md,
                        background: `linear-gradient(135deg, ${alpha(tokens.primary, 0.08)} 0%, ${alpha(tokens.primaryLight, 0.06)} 100%)`,
                        border: `1px solid ${tokens.primaryBorder}`,
                        mb: 1.5,
                      }}
                    >
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                        }}
                      >
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 700, color: "text.secondary" }}
                        >
                          Invoice Total
                        </Typography>
                        <Typography
                          variant="h6"
                          sx={{
                            fontWeight: 900,
                            color: tokens.primary,
                            letterSpacing: "-0.02em",
                          }}
                        >
                          ₹{calculateFinalTotal().toFixed(2)}
                        </Typography>
                      </Box>
                    </Box>

                    {/* Sale Type — Cash/Bank (paid now) vs Credit (owed) */}
                    <Box sx={{ mb: 1.5, p: 1.5, borderRadius: tokens.radius.md, bgcolor: alpha(saleType === 'credit' ? '#1a1a1a' : tokens.primary, 0.05), border: `1px solid ${alpha(saleType === 'credit' ? '#1a1a1a' : tokens.primary, 0.18)}` }}>
                      <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', textTransform: "uppercase", letterSpacing: "0.06em", fontSize: "0.65rem", display: "block", mb: 1 }}>
                        {isSale ? 'Sale Type' : 'Purchase Type'}
                      </Typography>
                      <ToggleButtonGroup exclusive size="small" value={saleType} onChange={(_, v) => v && setSaleType(v)}
                        sx={{ width: "100%", bgcolor: "white", borderRadius: tokens.radius.sm, p: 0.4, border: `1px solid ${alpha(tokens.primary, 0.14)}`,
                          "& .MuiToggleButtonGroup-grouped": { border: 0, borderRadius: `${tokens.radius.sm} !important`, flex: 1, mx: 0.25 } }}>
                        <ToggleButton value="paid" sx={{ textTransform: "none", fontWeight: 700, py: 0.6, fontSize: "0.78rem",
                          "&.Mui-selected": { bgcolor: tokens.primary, color: "white", "&:hover": { bgcolor: tokens.primary } } }}>
                          {isSale ? 'Cash / Bank Sale' : 'Cash / Bank Purchase'}
                        </ToggleButton>
                        <ToggleButton value="credit" sx={{ textTransform: "none", fontWeight: 700, py: 0.6, fontSize: "0.78rem",
                          "&.Mui-selected": { bgcolor: '#1a1a1a', color: "white", "&:hover": { bgcolor: '#333' } } }}>
                          {isSale ? 'Credit Sale' : 'Credit Purchase'}
                        </ToggleButton>
                      </ToggleButtonGroup>
                    </Box>

                    {/* Payment mode — shown on both create and edit. Previously
                        hidden whenever view === "edit" for no documented
                        reason, even though startEdit() already correctly
                        restores paymentMode/splitCash/splitBank from the
                        transaction and handleSave already always saves
                        whatever paymentMode currently holds regardless of
                        this gate — so editing a Cash/Bank invoice silently
                        hid the Cash/Bank/Split selector with no way to see or
                        change how it was actually paid. */}
                    {saleType === 'paid' && (
                      <Box sx={{ mb: 1.5, p: 1.5, borderRadius: tokens.radius.md, bgcolor: alpha(tokens.primary, 0.04), border: `1px solid ${alpha(tokens.primary, 0.14)}` }}>
                        <Typography variant="caption" sx={{ fontWeight: 800, color: alpha(tokens.primary, 0.85), textTransform: "uppercase", letterSpacing: "0.06em", fontSize: "0.65rem", display: "block", mb: 1 }}>
                          Payment Mode
                        </Typography>
                        <PayModeTiles value={paymentMode} onChange={setPaymentMode} tokens={tokens} ariaLabel="Payment mode" />
                        {paymentMode === "Split" && (
                          <Box sx={{ mt: 1.25 }}>
                            <SplitPaymentInput
                              cash={splitCash} onCashChange={setSplitCash}
                              bank={splitBank} onBankChange={setSplitBank}
                              total={calculateFinalTotal()}
                              accentColor={tokens.primary}
                            />
                          </Box>
                        )}
                        {/* Only Bank/Split actually involve a UPI/bank
                            transfer — for Split, the QR should only ask for
                            the bank portion the customer is paying that way
                            (e.g. ₹500 total, ₹200 cash + ₹300 via QR), not
                            the full invoice total. */}
                        {currentBusiness?.upiId && (paymentMode === "Bank" || (paymentMode === "Split" && Number(splitBank) > 0)) && (
                          <Button
                            fullWidth
                            size="small"
                            startIcon={<QrCode size={14} />}
                            onClick={() => setPaymentQrOpen(true)}
                            sx={{ mt: 1.25, fontWeight: 700, textTransform: "none", borderRadius: tokens.radius.sm, color: tokens.primary, bgcolor: "white", border: `1px solid ${alpha(tokens.primary, 0.25)}`, "&:hover": { bgcolor: tokens.primarySoft } }}
                          >
                            Show Payment QR (₹{paymentQrAmount.toFixed(2)})
                          </Button>
                        )}
                      </Box>
                    )}

                    {/* Advance — credit transactions only, not for cash & carry.
                        Applies to both Sales (advance received from customer)
                        and Purchases (advance paid to vendor). */}
                    {saleType === 'credit' && !!selectedParty?.id && (
                      <Box
                        sx={{
                          mb: 1.5,
                          p: 1.5,
                          borderRadius: tokens.radius.md,
                          bgcolor: tokens.successSoft,
                          border: `1px solid rgba(100,116,139,0.2)`,
                        }}
                      >
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.75,
                            mb: 1,
                          }}
                        >
                          <Wallet size={14} color={tokens.success} />
                          <Typography
                            variant="caption"
                            sx={{
                              fontWeight: 800,
                              color: "success.dark",
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                              fontSize: "0.65rem",
                            }}
                          >
                            {isSale ? "Advance Received" : "Advance Paid"}
                          </Typography>
                        </Box>
                        <TextField
                          fullWidth
                          size="small"
                          type="number"
                          placeholder="0.00"
                          value={advance}
                          onChange={(e) => setAdvance(e.target.value)}
                          onFocus={(e) => e.target.select()}
                          disabled={false}
                          slotProps={{
                            input: {
                              startAdornment: (
                                <InputAdornment position="start">
                                  ₹
                                </InputAdornment>
                              ),
                              min: 0,
                              step: 0.01,
                            },
                          }}
                          sx={{
                            "& .MuiOutlinedInput-root": {
                              bgcolor: "white",
                              borderRadius: tokens.radius.sm,
                            },
                          }}
                        />
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: "block", mt: 0.5 }}
                        >
                          {isSale ? "Auto-recorded as payment in" : "Auto-recorded as payment out"}
                        </Typography>
                        {Number(advance) > 0 && (
                          <Box sx={{ mt: 1.25 }}>
                            <Typography variant="caption" sx={{ fontWeight: 800, color: 'success.dark', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.65rem', display: 'block', mb: 0.75 }}>
                              {isSale ? "Received Via" : "Paid Via"}
                            </Typography>
                            <PayModeTiles value={advanceMode} onChange={setAdvanceMode} tokens={tokens} accent={tokens.success} ariaLabel={isSale ? "Advance received via" : "Advance paid via"} />
                            {advanceMode === "Split" && (
                              <Box sx={{ mt: 1.25 }}>
                                <SplitPaymentInput
                                  cash={advanceSplitCash} onCashChange={setAdvanceSplitCash}
                                  bank={advanceSplitBank} onBankChange={setAdvanceSplitBank}
                                  total={Number(advance) || 0}
                                  accentColor={tokens.success}
                                />
                              </Box>
                            )}
                          </Box>
                        )}
                        {Number(advance) > 0 && (
                          <Box
                            sx={{
                              display: "flex",
                              justifyContent: "space-between",
                              mt: 1.25,
                              pt: 1.25,
                              borderTop: "1px dashed rgba(100,116,139,0.3)",
                            }}
                          >
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 700, color: tokens.error }}
                            >
                              {isSale ? "Balance Due" : "Balance Payable"}
                            </Typography>
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 800, color: tokens.error }}
                            >
                              ₹
                              {Math.max(
                                0,
                                calculateFinalTotal() - Number(advance),
                              ).toFixed(2)}
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    )}

                    <GradientButton
                      tokens={tokens}
                      fullWidth
                      onClick={() => handleSave()}
                      disabled={isSaving}
                      startIcon={<Save size={18} />}
                      sx={{ py: 1.3, fontSize: "0.95rem", mb: 1 }}
                    >
                      {isSaving
                        ? "Saving…"
                        : view === "edit"
                          ? "Update Transaction"
                          : "Save Transaction"}
                    </GradientButton>

                    {view === "create" && (
                      <Button
                        variant="outlined"
                        fullWidth
                        size="large"
                        startIcon={<Plus size={17} />}
                        onClick={() => handleSave({ saveAndCreateNew: true })}
                        disabled={isSaving}
                        sx={{
                          borderRadius: tokens.radius.md,
                          py: 1,
                          fontWeight: 700,
                          textTransform: "none",
                          fontSize: "0.88rem",
                          borderColor: tokens.primaryBorder,
                          color: tokens.primary,
                          "&:hover": {
                            borderColor: tokens.primary,
                            bgcolor: tokens.primarySoft,
                          },
                        }}
                      >
                        Save & Create New
                      </Button>
                    )}

                    <Button
                      variant="outlined"
                      fullWidth
                      size="large"
                      startIcon={<Printer size={17} />}
                      onClick={() => handleSave({ saveAndPrint: true })}
                      disabled={isSaving}
                      sx={{
                        borderRadius: tokens.radius.md,
                        py: 1,
                        fontWeight: 700,
                        textTransform: "none",
                        fontSize: "0.88rem",
                        mt: view === "create" ? 1 : 0,
                        borderColor: "success.main",
                        color: "success.main",
                        "&:hover": {
                          borderColor: "success.dark",
                          bgcolor: "success.50",
                        },
                      }}
                    >
                      Save & Print
                    </Button>

                    {view === "create" && (
                      <Button
                        variant="text"
                        fullWidth
                        size="medium"
                        startIcon={<RotateCcw size={15} />}
                        onClick={() => resetForm()}
                        sx={{
                          borderRadius: tokens.radius.md,
                          py: 0.75,
                          fontWeight: 600,
                          textTransform: "none",
                          fontSize: "0.82rem",
                          color: "text.secondary",
                          "&:hover": { bgcolor: "rgba(0,0,0,0.04)", color: "error.main" },
                        }}
                      >
                        Clear All
                      </Button>
                    )}

                    {!isMobile && (
                      <Box
                        sx={{
                          mt: 1.25,
                          pt: 1.25,
                          borderTop: "1px solid rgba(0,0,0,0.07)",
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 0.75,
                          justifyContent: "center",
                        }}
                      >
                        {[
                          {
                            key: "Ctrl+S",
                            label: view === "edit" ? "Update" : "Save",
                          },
                          ...(view === "create"
                            ? [{ key: "Ctrl+↵", label: "Save & New" }]
                            : []),
                          { key: "Esc", label: "Back" },
                        ].map((s) => (
                          <Box
                            key={s.key}
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 0.4,
                            }}
                          >
                            <Box
                              component="kbd"
                              sx={{
                                px: 0.8,
                                py: 0.25,
                                borderRadius: "5px",
                                bgcolor: "rgba(0,0,0,0.06)",
                                border: "1px solid rgba(0,0,0,0.12)",
                                fontSize: "0.6rem",
                                fontFamily: "monospace",
                                fontWeight: 800,
                                color: "text.secondary",
                              }}
                            >
                              {s.key}
                            </Box>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ fontSize: "0.68rem" }}
                            >
                              {s.label}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    )}
                  </CardContent>
                </Card>
              </Box>
            </Box>
          </Box>
        </Box>

        {/* ── Sticky mobile save bar — always reachable without scrolling.
            In One by One mode, only shown on the Review step (where the
            other 2 steps have their own Continue/Back bars in-flow, and
            this Save bar would be premature/confusing there). ── */}
        {isMobile && (!obActive || obStep === "review") && (
          <Box
            sx={{
              position: "fixed",
              left: 0,
              right: 0,
              // Sit above the global mobile bottom-nav (60px tall on phones).
              bottom: 60,
              zIndex: (t) => t.zIndex.appBar + 2,
              px: 1.5,
              py: 1,
              bgcolor: "background.paper",
              borderTop: "1px solid",
              borderColor: "divider",
              boxShadow: "0 -4px 16px rgba(0,0,0,0.12)",
              display: "flex",
              alignItems: "center",
              gap: 1.25,
            }}
          >
            <Box sx={{ flexShrink: 0 }}>
              <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600, lineHeight: 1 }}>
                Total
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 800, color: tokens.primary, lineHeight: 1.1 }}>
                ₹{calculateFinalTotal().toFixed(2)}
              </Typography>
            </Box>
            <GradientButton
              tokens={tokens}
              fullWidth
              onClick={() => handleSave()}
              disabled={isSaving}
              startIcon={<Save size={18} />}
              sx={{ py: 1.2, fontSize: "0.95rem" }}
            >
              {isSaving
                ? "Saving…"
                : view === "edit"
                  ? "Update"
                  : "Save"}
            </GradientButton>
          </Box>
        )}

        {barcodeScanEnabled && (
          <BarcodeScanner
            open={scannerOpen}
            onScan={handleBarcodeScan}
            onClose={() => setScannerOpen(false)}
          />
        )}

        <Dialog open={paymentQrOpen} onClose={() => setPaymentQrOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle sx={{ fontWeight: 800, fontSize: "1rem" }}>Scan & Pay</DialogTitle>
          <DialogContent sx={{ textAlign: "center", pb: 3 }}>
            <Box sx={{ display: "inline-flex", p: 1.5, bgcolor: "#fff", border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
              <UpiQrImage
                value={buildUpiUri({
                  upiId: currentBusiness?.upiId,
                  payeeName: currentBusiness?.name,
                  amount: paymentQrAmount,
                  note: invoiceNumber ? `Invoice ${invoiceNumber}` : undefined,
                })}
                size={220}
              />
            </Box>
            <Typography sx={{ fontWeight: 800, fontSize: "1.4rem", color: tokens.primary, mt: 1.5 }}>
              ₹{paymentQrAmount.toFixed(2)}
            </Typography>
            {paymentMode === "Split" && (
              <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.25 }}>
                Bank/UPI portion of the split payment (₹{(Number(splitCash) || 0).toFixed(2)} cash separately)
              </Typography>
            )}
            <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.5 }}>
              Scan with any UPI app to pay this exact amount
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPaymentQrOpen(false)} sx={{ textTransform: "none" }}>Close</Button>
          </DialogActions>
        </Dialog>

        {quickAddDialogs}
      </>
    );
  } // end create/edit

  /* ════════════════════════════════════════════════════════════════
     LIST VIEW
  ════════════════════════════════════════════════════════════════ */

  const activeFilterCount =
    [
      filters.dateFrom,
      filters.dateTo,
      filters.partyId,
      filters.minAmount,
      filters.maxAmount,
    ].filter(Boolean).length
    + (quickStatus !== "all" ? 1 : 0)
    + (datePreset !== "all" ? 1 : 0);

  const printBusy = pdfLoading || shareLoading;

  // Preview header + scaled invoice body — shared by the desktop side-pane
  // (list mode) and the overlay dialog (grid mode).
  const txPreviewInner = selectedTx ? (
    <>
      <Box
        sx={{
          background: '#ffffff', borderBottom: '1px solid #ece2db',
          px: 2.5,
          py: 1.75,
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          flexShrink: 0,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="overline" sx={{ color: "#6b5550", fontWeight: 700, fontSize: "0.62rem", letterSpacing: "0.1em", lineHeight: 1 }}>
            {isSale ? "Invoice Preview" : "Bill Preview"}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            <Typography variant="h6" sx={{ color: "white", fontWeight: 800, fontSize: "1rem", fontFamily: "monospace", lineHeight: 1.2 }} noWrap>
              {selectedTx.invoiceNumber}
            </Typography>
            {config.features?.billPaymentStatusChip !== false && (() => {
              const isOverdue = selectedTx.dueDate && selectedTx.status !== 'paid' && new Date(selectedTx.dueDate + 'T00:00:00') < new Date();
              const label = selectedTx.status === 'paid' ? 'Paid' : isOverdue ? 'Overdue' : 'Unpaid';
              return (
                <Chip size="small" label={label}
                  sx={{ fontWeight: 800, fontSize: '0.62rem', height: 18, bgcolor: isOverdue ? '#fee2e2' : 'rgba(92,31,34,0.08)', color: isOverdue ? '#991b1b' : '#5c1f22', border: isOverdue ? '1px solid #fecaca' : '1px solid #ece2db' }} />
              );
            })()}
            {selectedTx.sourceEstimateId && (
              <Chip size="small" icon={<FileText size={12} />} label={`From Estimate${estimatesById.get(selectedTx.sourceEstimateId)?.estimateNumber ? `: ${estimatesById.get(selectedTx.sourceEstimateId).estimateNumber}` : ''}`}
                onClick={() => viewSourceEstimate(selectedTx.sourceEstimateId)}
                sx={{ fontWeight: 700, fontSize: '0.62rem', height: 18, bgcolor: 'rgba(92,31,34,0.08)', color: '#5c1f22', border: '1px solid #ece2db', cursor: 'pointer', '& .MuiChip-icon': { color: '#5c1f22' } }} />
            )}
            {selectedTx.sourceOrderId && (
              <Chip size="small" icon={<ClipboardList size={12} />} label={`From Order${ordersById.get(selectedTx.sourceOrderId)?.orderNumber ? `: ${ordersById.get(selectedTx.sourceOrderId).orderNumber}` : ''}`}
                onClick={() => viewSourceOrder(selectedTx.sourceOrderId)}
                sx={{ fontWeight: 700, fontSize: '0.62rem', height: 18, bgcolor: 'rgba(92,31,34,0.08)', color: '#5c1f22', border: '1px solid #ece2db', cursor: 'pointer', '& .MuiChip-icon': { color: '#5c1f22' } }} />
            )}
          </Box>
        </Box>
        <Tooltip title="Edit">
          <IconButton size="small" onClick={() => startEdit(selectedTx)} sx={{ color: "#5c1f22", bgcolor: "rgba(92,31,34,0.08)", "&:hover": { bgcolor: "rgba(92,31,34,0.14)" } }}>
            <Edit size={16} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Print">
          <IconButton size="small" onClick={() => triggerPrint(selectedTx)} sx={{ color: "#5c1f22", bgcolor: "rgba(92,31,34,0.08)", "&:hover": { bgcolor: "rgba(92,31,34,0.14)" } }}>
            <Printer size={16} />
          </IconButton>
        </Tooltip>
        {selectedTx.status !== 'paid' && selectedTx.partyId && (
          <Tooltip title={isSale ? "Received Payment" : "Payment Made"}>
            <IconButton size="small" onClick={() => handleReceivePayment(selectedTx)} sx={{ color: "#5c1f22", bgcolor: "rgba(92,31,34,0.08)", "&:hover": { bgcolor: "rgba(92,31,34,0.14)" } }}>
              <Wallet size={16} />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="More">
          <IconButton size="small" onClick={(e) => setRowMoreMenu({ anchorEl: e.currentTarget, tx: selectedTx })} sx={{ color: "#5c1f22", bgcolor: "rgba(92,31,34,0.08)", "&:hover": { bgcolor: "rgba(92,31,34,0.14)" } }}>
            <MoreVertical size={16} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Close preview">
          <IconButton size="small" onClick={closeTxPreview} sx={{ color: "#6b5550", "&:hover": { color: "#5c1f22", bgcolor: "rgba(92,31,34,0.08)" } }}>
            <X size={16} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Scrollable invoice — auto-scaled to fit the pane */}
      <Box sx={{ flex: 1, overflow: "auto", bgcolor: "#e8eaed", p: 2 }}>
        <FitPreview>
          <InvoiceTemplate
            transaction={selectedTx}
            business={currentBusiness}
            paperSize={paperSize}
            printOptions={{ ...config.billPrintOptions, loyalty: config.loyalty }}
            partyBalance={parties.find((p) => p.id === selectedTx.partyId)?.balance ?? 0}
          />
        </FitPreview>
      </Box>
    </>
  ) : null;

  return (
    <Box sx={{ width: '100%' }}>
      {/* Loading mask for PDF/share generation — prevents double-tap and shows progress */}
      <Backdrop open={printBusy} sx={{ zIndex: 9999, flexDirection: 'column', gap: 2, bgcolor: 'rgba(0,0,0,0.55)' }}>
        <CircularProgress size={48} sx={{ color: 'white' }} />
        <Typography sx={{ color: 'white', fontWeight: 700 }}>{shareLoading ? 'Preparing to share…' : 'Generating PDF…'}</Typography>
      </Backdrop>
      {/* ── Page header ── */}
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          justifyContent: "space-between",
          alignItems: { xs: "flex-start", sm: "flex-end" },
          gap: 2,
          mb: 3,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Box
            sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 0.5 }}
          >
            <Box
              sx={{
                p: 1,
                borderRadius: tokens.radius.md,
                background: `linear-gradient(135deg, ${tokens.primaryDark}, ${tokens.primaryLight})`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: `0 4px 12px ${alpha(tokens.primary, 0.3)}`,
              }}
            >
              {isSale ? (
                <Receipt size={20} color="white" />
              ) : (
                <ShoppingBasket size={20} color="white" />
              )}
            </Box>
            <Typography
              variant="h5"
              sx={{ fontWeight: 900, letterSpacing: "-0.02em" }}
            >
              {isSale ? t('sales.invoices') : t('sales.bills')}
            </Typography>
          </Box>
          <Box
            sx={{ display: "flex", alignItems: "center", gap: 1.5, pl: 0.5 }}
          >
            <Typography variant="body2" color="text.secondary">
              {isSale
                ? t('sales.subSale')
                : t('sales.subPurchase')}
            </Typography>
            {transactions.length > 0 && (
              <>
                <Box
                  sx={{
                    width: 3,
                    height: 3,
                    borderRadius: "50%",
                    bgcolor: "text.disabled",
                  }}
                />
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 700, color: tokens.primary }}
                >
                  {transactions.length} records · ₹
                  {totalRevenue.toLocaleString("en-IN", {
                    maximumFractionDigits: 0,
                  })}
                </Typography>
              </>
            )}
          </Box>
        </Box>

        <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", width: { xs: "100%", sm: "auto" } }}>
          {/* Manual refresh — background sync already runs every 45s/on tab
              focus, but this lets the user pull in a save from another
              device immediately instead of waiting. */}
          <Tooltip title="Refresh — check for new invoices">
            <span>
              <IconButton
                onClick={handleManualRefresh}
                disabled={refreshing}
                size="medium"
                sx={{
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: tokens.radius.md,
                  color: "text.secondary",
                  "&:hover": { borderColor: tokens.primaryBorder, color: tokens.primary, bgcolor: tokens.primarySoft },
                  "@keyframes spin-refresh": { from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } },
                  "& svg": refreshing ? { animation: "spin-refresh 0.8s linear infinite" } : undefined,
                }}
              >
                <RefreshCw size={17} />
              </IconButton>
            </span>
          </Tooltip>
          {/* More dropdown — bulk print, excel export, tally export */}
          <Button
            variant="outlined"
            endIcon={<ChevronDown size={15} />}
            size="medium"
            onClick={(e) => setMoreMenuAnchor(e.currentTarget)}
            sx={{ borderRadius: tokens.radius.md, fontWeight: 700, textTransform: "none", borderColor: "divider", color: "text.secondary", px: 1.75, "&:hover": { borderColor: tokens.primaryBorder, color: tokens.primary, bgcolor: tokens.primarySoft } }}
          >
            More
          </Button>
          <Menu
            anchorEl={moreMenuAnchor}
            open={Boolean(moreMenuAnchor)}
            onClose={() => setMoreMenuAnchor(null)}
            transformOrigin={{ horizontal: "right", vertical: "top" }}
            anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
            PaperProps={{ elevation: 6, sx: { borderRadius: 2, mt: 0.5, minWidth: 200 } }}
          >
            <MenuItem onClick={() => { if (isSale) exportSalesToExcel(transactions, 'sales_export.xlsx'); else exportPurchasesToExcel(transactions, 'purchases_export.xlsx'); setMoreMenuAnchor(null); }} sx={{ gap: 1.5, py: 1.25 }}>
              <ListItemIcon sx={{ minWidth: "unset" }}><Download size={16} /></ListItemIcon>
              <ListItemText primary="Export Excel" primaryTypographyProps={{ fontSize: "0.875rem", fontWeight: 600 }} />
            </MenuItem>
            <MenuItem onClick={() => { exportToTallyXML({ sales: isSale ? transactions : [], purchases: isSale ? [] : transactions, businessName: currentBusiness?.name, filename: isSale ? 'sales_tally.xml' : 'purchases_tally.xml' }); setMoreMenuAnchor(null); }} sx={{ gap: 1.5, py: 1.25 }}>
              <ListItemIcon sx={{ minWidth: "unset" }}><FileDown size={16} /></ListItemIcon>
              <ListItemText primary="Export Tally XML" primaryTypographyProps={{ fontSize: "0.875rem", fontWeight: 600 }} />
            </MenuItem>
            {isSale ? (
              <MenuItem onClick={() => { setBulkAddOpen(true); setMoreMenuAnchor(null); }} sx={{ gap: 1.5, py: 1.25 }}>
                <ListItemIcon sx={{ minWidth: "unset" }}><Plus size={16} /></ListItemIcon>
                <ListItemText primary="Bulk Add Sales" primaryTypographyProps={{ fontSize: "0.875rem", fontWeight: 600 }} />
              </MenuItem>
            ) : (
              <MenuItem onClick={() => { setPurchaseBulkAddOpen(true); setMoreMenuAnchor(null); }} sx={{ gap: 1.5, py: 1.25 }}>
                <ListItemIcon sx={{ minWidth: "unset" }}><Plus size={16} /></ListItemIcon>
                <ListItemText primary="Bulk Add Purchases" primaryTypographyProps={{ fontSize: "0.875rem", fontWeight: 600 }} />
              </MenuItem>
            )}
            {isSale ? (
              <MenuItem onClick={() => { setBulkEditOpen(true); setMoreMenuAnchor(null); }} sx={{ gap: 1.5, py: 1.25 }}>
                <ListItemIcon sx={{ minWidth: "unset" }}><Edit size={16} /></ListItemIcon>
                <ListItemText primary="Bulk Edit Sales" primaryTypographyProps={{ fontSize: "0.875rem", fontWeight: 600 }} />
              </MenuItem>
            ) : (
              <MenuItem onClick={() => { setPurchaseBulkEditOpen(true); setMoreMenuAnchor(null); }} sx={{ gap: 1.5, py: 1.25 }}>
                <ListItemIcon sx={{ minWidth: "unset" }}><Edit size={16} /></ListItemIcon>
                <ListItemText primary="Bulk Edit Purchases" primaryTypographyProps={{ fontSize: "0.875rem", fontWeight: 600 }} />
              </MenuItem>
            )}
            {isSale ? (
              <MenuItem onClick={() => { setSalesImportOpen(true); setMoreMenuAnchor(null); }} sx={{ gap: 1.5, py: 1.25 }}>
                <ListItemIcon sx={{ minWidth: "unset" }}><Download size={16} /></ListItemIcon>
                <ListItemText primary="Import Sales" primaryTypographyProps={{ fontSize: "0.875rem", fontWeight: 600 }} />
              </MenuItem>
            ) : (
              <MenuItem onClick={() => { setPurchaseImportOpen(true); setMoreMenuAnchor(null); }} sx={{ gap: 1.5, py: 1.25 }}>
                <ListItemIcon sx={{ minWidth: "unset" }}><Download size={16} /></ListItemIcon>
                <ListItemText primary="Import Purchases" primaryTypographyProps={{ fontSize: "0.875rem", fontWeight: 600 }} />
              </MenuItem>
            )}
          </Menu>
          {/* Primary action */}
          <GradientButton
            tokens={tokens}
            startIcon={isSale ? <Receipt size={17} /> : <ShoppingBasket size={17} />}
            onClick={() => { resetForm(); setView("create"); }}
            size="medium"
            sx={{ px: 2.5, py: 1, flex: { xs: 1, sm: "none" } }}
          >
            {isSale ? t('sales.newInvoice') : t('sales.newBill')}
          </GradientButton>
        </Box>
      </Box>

      {/* ── Search & Filters ── */}
      <Card
        elevation={0}
        sx={{
          mb: 2,
          borderRadius: tokens.radius.lg,
          border: "1px solid rgba(0,0,0,0.07)",
          boxShadow: tokens.shadow.card,
        }}
      >
        <Box sx={{ p: 2 }}>
          <Box
            sx={{
              display: "flex",
              gap: 1.5,
              alignItems: "center",
              flexWrap: "wrap",
              mb: showFilters ? 2 : 0,
            }}
          >
            <TextField
              size="small"
              placeholder={`Search by ${isSale ? "customer" : "vendor"} or invoice number…`}
              value={filters.search || ""}
              onChange={(e) =>
                setFilters({ ...filters, search: e.target.value })
              }
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search size={16} color="#9ca3af" />
                    </InputAdornment>
                  ),
                  ...(filters.search && {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          size="small"
                          onClick={() => setFilters({ ...filters, search: "" })}
                          sx={{ p: 0.25 }}
                        >
                          <X size={14} />
                        </IconButton>
                      </InputAdornment>
                    ),
                  }),
                },
              }}
              sx={{
                flex: { xs: "1 1 100%", sm: "0 1 30%" },
                minWidth: 180,
                "& .MuiOutlinedInput-root": {
                  borderRadius: tokens.radius.md,
                  bgcolor: "rgba(0,0,0,0.02)",
                  "&:hover": { bgcolor: "white" },
                  "&.Mui-focused": {
                    bgcolor: "white",
                    boxShadow: `0 0 0 3px ${alpha(tokens.primary, 0.1)}`,
                  },
                },
              }}
            />
            {/* Quick filter pills: date range + status — the most common
                triage views in one click, without opening the full filter
                panel. Lives right next to the search box now, sharing the
                same row; scrolls horizontally if it doesn't all fit. */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "nowrap", overflowX: "auto", flex: 1, minWidth: 0 }}>
              {[
                { value: "all", label: "All time" },
                { value: "today", label: "Today" },
                { value: "week", label: "This Week" },
                { value: "month", label: "This Month" },
                { value: "year", label: "This Year" },
              ].map((opt) => (
                <Chip
                  key={opt.value}
                  label={opt.label}
                  onClick={() => setDatePreset(opt.value)}
                  variant={datePreset === opt.value ? "filled" : "outlined"}
                  sx={{
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    height: 34,
                    borderRadius: "10px",
                    flexShrink: 0,
                    ...(datePreset === opt.value
                      ? { bgcolor: tokens.primary, color: "#fff" }
                      : { borderColor: "divider", color: "text.secondary", "&:hover": { borderColor: tokens.primaryBorder, bgcolor: tokens.primarySoft } }),
                  }}
                />
              ))}
              <Box sx={{ width: "1px", alignSelf: "stretch", bgcolor: "divider", mx: 0.5, flexShrink: 0 }} />
              {[
                { value: "all", label: "All" },
                { value: "paid", label: isSale ? "Paid" : "Paid" },
                { value: "unpaid", label: isSale ? "Unpaid" : "Unpaid" },
                { value: "overdue", label: "Overdue" },
              ].map((opt) => (
                <Chip
                  key={opt.value}
                  label={opt.label}
                  onClick={() => setQuickStatus(opt.value)}
                  variant={quickStatus === opt.value ? "filled" : "outlined"}
                  sx={{
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    height: 34,
                    borderRadius: "10px",
                    flexShrink: 0,
                    ...(quickStatus === opt.value
                      ? {
                          bgcolor: opt.value === "overdue" ? STATUS_COLOR.overdue : opt.value === "unpaid" ? STATUS_COLOR.unpaid : opt.value === "paid" ? STATUS_COLOR.paid : tokens.primary,
                          color: "#fff",
                        }
                      : { borderColor: "divider", color: "text.secondary", "&:hover": { borderColor: tokens.primaryBorder, bgcolor: tokens.primarySoft } }),
                  }}
                />
              ))}
            </Box>
            <Button
              onClick={() => setShowFilters(!showFilters)}
              variant={
                showFilters || activeFilterCount > 0 ? "contained" : "outlined"
              }
              size="small"
              startIcon={<Filter size={15} />}
              sx={{
                whiteSpace: "nowrap",
                borderRadius: tokens.radius.md,
                fontWeight: 700,
                textTransform: "none",
                px: 2,
                flexShrink: 0,
                ...(showFilters || activeFilterCount > 0
                  ? {
                      bgcolor: tokens.primary,
                      "&:hover": { bgcolor: tokens.primaryDark },
                    }
                  : {
                      borderColor: "divider",
                      color: "text.secondary",
                      "&:hover": {
                        borderColor: tokens.primaryBorder,
                        color: tokens.primary,
                        bgcolor: tokens.primarySoft,
                      },
                    }),
              }}
            >
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </Button>
            {activeFilterCount > 0 && (
              <Button
                onClick={() => {
                  setFilters({
                    dateFrom: "",
                    dateTo: "",
                    partyId: "",
                    minAmount: "",
                    maxAmount: "",
                    search: "",
                  });
                  setQuickStatus("all");
                  setDatePreset("all");
                }}
                variant="text"
                size="small"
                color="error"
                sx={{
                  whiteSpace: "nowrap",
                  fontWeight: 700,
                  textTransform: "none",
                  flexShrink: 0,
                }}
              >
                Clear all
              </Button>
            )}
          </Box>

          {showFilters && (
            <Grid container spacing={1.5}>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  fullWidth
                  label="From Date"
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) =>
                    setFilters({ ...filters, dateFrom: e.target.value })
                  }
                  InputLabelProps={{ shrink: true }}
                  size="small"
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: tokens.radius.sm,
                    },
                  }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  fullWidth
                  label="To Date"
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) =>
                    setFilters({ ...filters, dateTo: e.target.value })
                  }
                  InputLabelProps={{ shrink: true }}
                  size="small"
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: tokens.radius.sm,
                    },
                  }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <PartySelect
                  options={parties}
                  value={parties.find((p) => p.id === filters.partyId) || null}
                  onChange={(v) => setFilters({ ...filters, partyId: v?.id || "" })}
                  label={isSale ? "Customer" : "Vendor"}
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 6, md: 1.5 }}>
                <TextField
                  fullWidth
                  label="Min ₹"
                  type="number"
                  value={filters.minAmount}
                  onChange={(e) =>
                    setFilters({ ...filters, minAmount: e.target.value })
                  }
                  size="small"
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: tokens.radius.sm,
                    },
                  }}
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 6, md: 1.5 }}>
                <TextField
                  fullWidth
                  label="Max ₹"
                  type="number"
                  value={filters.maxAmount}
                  onChange={(e) =>
                    setFilters({ ...filters, maxAmount: e.target.value })
                  }
                  size="small"
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: tokens.radius.sm,
                    },
                  }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 2 }}>
                <TextField
                  select
                  fullWidth
                  label="Sort By"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  size="small"
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: tokens.radius.sm,
                    },
                  }}
                >
                  <MenuItem value="date">Date</MenuItem>
                  <MenuItem value="invoiceNumber">Invoice #</MenuItem>
                  <MenuItem value="amount">Amount</MenuItem>
                  <MenuItem value="party">{isSale ? "Customer" : "Vendor"}</MenuItem>
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 1 }}>
                <TextField
                  select
                  fullWidth
                  label="Order"
                  value={sortDir}
                  onChange={(e) => setSortDir(e.target.value)}
                  size="small"
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: tokens.radius.sm,
                    },
                  }}
                >
                  <MenuItem value="desc">↓</MenuItem>
                  <MenuItem value="asc">↑</MenuItem>
                </TextField>
              </Grid>
            </Grid>
          )}
        </Box>
      </Card>

      {/* ── Bulk action bar — Bulk Print from 1+, Bulk Send needs 2+ ── */}
      {selectedIds.size >= 1 && (
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap',
          mb: 1.5, px: 2, py: 1.25, borderRadius: tokens.radius.md,
          bgcolor: 'primary.main', color: 'white',
        }}>
          <Typography variant="body2" sx={{ fontWeight: 700, flex: 1 }}>
            {selectedIds.size} {isSale ? 'invoice' : 'bill'}{selectedIds.size !== 1 ? 's' : ''} selected
          </Typography>
          <Button
            size="small"
            variant="contained"
            startIcon={<Printer size={15} />}
            disabled={bulkPrintLoading}
            onClick={triggerBulkPrint}
            sx={{ bgcolor: 'rgba(255,255,255,0.95)', color: 'primary.main', fontWeight: 700, textTransform: 'none', '&:hover': { bgcolor: 'white' }, borderRadius: 1.5 }}
          >
            {bulkPrintLoading ? 'Preparing…' : 'Bulk Print'}
          </Button>
          {selectedIds.size >= 2 && (
            <Button
              size="small"
              variant="contained"
              startIcon={<Share2 size={15} />}
              onClick={() => setBulkSendOpen(true)}
              sx={{ bgcolor: 'rgba(255,255,255,0.95)', color: 'primary.main', fontWeight: 700, textTransform: 'none', '&:hover': { bgcolor: 'white' }, borderRadius: 1.5 }}
            >
              Bulk Send
            </Button>
          )}
          <Button
            size="small"
            onClick={() => setSelectedIds(new Set())}
            sx={{ color: 'rgba(255,255,255,0.7)', textTransform: 'none', '&:hover': { color: 'white', bgcolor: 'rgba(255,255,255,0.1)' }, borderRadius: 1.5, fontSize: '0.75rem' }}
          >
            Clear
          </Button>
        </Box>
      )}

      {/* ── Transactions: card list + side preview (master-detail) ── */}
      <Box
        ref={txListContainerRef}
        sx={{
          display: "flex",
          gap: 2,
          alignItems: "stretch",
          // Measured to exactly fill the remaining viewport (see useFillHeight)
          // so the list scrolls internally with no second, outer page scroll.
          height: { md: `${txFillHeight}px` },
          minHeight: { md: 360 },
        }}
      >
        {/* LEFT: card list (all screen sizes) */}
        <Card
          elevation={0}
          sx={{
            borderRadius: tokens.radius.lg,
            border: "1px solid rgba(0,0,0,0.07)",
            overflow: "hidden",
            boxShadow: tokens.shadow.card,
            // Preview now always opens as a popup dialog (both list and grid
            // mode), so the list never narrows to make room for a side panel.
            width: "100%",
            flexShrink: 0,
            transition: "width 0.25s ease",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          {transactions.length === 0 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, py: 8, px: 2 }}>
              <Box sx={{ p: 2, borderRadius: '50%', bgcolor: tokens.primarySoft }}>
                {isSale ? <Receipt size={28} color={tokens.primary} /> : <ShoppingBasket size={28} color={tokens.primary} />}
              </Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'text.secondary' }}>No transactions yet</Typography>
              <GradientButton tokens={tokens} onClick={() => { resetForm(); setView('create'); }} size="small" sx={{ mt: 0.5, px: 3 }}>
                {isSale ? t('sales.newInvoice') : t('sales.newBill')}
              </GradientButton>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
              {/* Select-all header (pinned) */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.75, py: 1, borderBottom: '1px solid rgba(0,0,0,0.06)', bgcolor: 'rgba(0,0,0,0.015)', flexShrink: 0 }}>
                <Checkbox
                  size="small"
                  sx={{ p: 0.25 }}
                  indeterminate={selectedIds.size > 0 && selectedIds.size < transactions.length}
                  checked={transactions.length > 0 && selectedIds.size === transactions.length}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedIds(new Set(transactions.map((t) => t.id)));
                    else setSelectedIds(new Set());
                  }}
                />
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1, minWidth: 0 }}>
                  {selectedIds.size > 0 ? `${selectedIds.size} selected` : `${transactions.length} ${isSale ? 'invoice' : 'bill'}${transactions.length !== 1 ? 's' : ''}`}
                </Typography>
                <ViewModeToggle value={txViewMode} onChange={changeTxViewMode} tokens={tokens} />
              </Box>

              {/* Desktop list mode: dense filterable table (matches the
                  Transactions table layout) — row click / eye icon opens the
                  read-only preview; Edit lives in the "more" menu. */}
              {!isMobile && txViewMode === 'list' ? (
                <TxDataTable
                  records={transactions}
                  accessors={{
                    id: (tx) => tx.id,
                    number: (tx) => tx.invoiceNumber,
                    party: (tx) => tx.partyName || (isSale ? 'Cash & Carry' : 'Cash Purchase'),
                    transaction: (tx) => tx.type,
                    paymentMode: (tx) => tx.status === 'unpaid' ? null : tx.paymentMode,
                    amount: (tx) => Number(tx.totalAmount) || 0,
                    date: (tx) => tx.date,
                    dueDate: (tx) => tx.dueDate,
                    status: (tx) => config.features?.billPaymentStatusChip !== false ? tx.status : undefined,
                    isCash: (tx) => !tx.partyId,
                  }}
                  onRowClick={(tx) => selectTx(tx)}
                  onEdit={(tx) => startEdit(tx)}
                  onDelete={(tx) => handleDelete(tx)}
                  onShare={(tx) => handleShare(tx)}
                  onPrint={(tx) => triggerPrint(tx)}
                  extraMenuItems={(tx, close) => [
                    <MenuItem key="pdf" disabled={pdfLoading} onClick={() => { downloadInvoicePDF(tx); close(); }}>
                      Download PDF
                    </MenuItem>,
                    <MenuItem key="img" disabled={shareLoading} onClick={() => { shareAsImage(tx); close(); }}>
                      Download Image
                    </MenuItem>,
                    ...(referenceImagesEnabled && tx?.referenceImageIds?.length > 0 ? [
                      <MenuItem key="refimg" onClick={() => { setImageViewerRecordId(tx.id); close(); }}>
                        View Reference Images
                      </MenuItem>,
                    ] : []),
                    ...(tx.status !== 'paid' && tx.partyId ? [
                      <MenuItem key="recv" onClick={() => { handleReceivePayment(tx); close(); }}>
                        {isSale ? 'Received Payment' : 'Payment Made'}
                      </MenuItem>,
                    ] : []),
                    ...(tx.status !== 'paid' && tx.partyId ? [
                      <MenuItem key="remind" onClick={() => { handleSendReminder(tx); close(); }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <MessageCircle size={15} color="#25D366" />
                          Send Payment Reminder
                        </Box>
                      </MenuItem>,
                    ] : []),
                  ]}
                  isConverted={(tx) => !!(tx.sourceEstimateId || tx.sourceOrderId)}
                  convertedLabel={(tx) => tx.sourceEstimateId
                    ? `From Estimate${estimatesById.get(tx.sourceEstimateId)?.estimateNumber ? `: ${estimatesById.get(tx.sourceEstimateId).estimateNumber}` : ''}`
                    : `From Order${ordersById.get(tx.sourceOrderId)?.orderNumber ? `: ${ordersById.get(tx.sourceOrderId).orderNumber}` : ''}`}
                  onViewConverted={(tx) => tx.sourceEstimateId ? viewSourceEstimate(tx.sourceEstimateId) : viewSourceOrder(tx.sourceOrderId)}
                  selectable
                  selectedIds={selectedIds}
                  setSelectedIds={setSelectedIds}
                  tokens={tokens}
                  defaultRowsPerPage={50}
                />
              ) : (<>
              <Box sx={txViewMode === 'grid'
                ? { flex: 1, overflowY: "auto", minHeight: 0, p: 1.5, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 1.25, alignContent: 'start' }
                : { flex: 1, overflowY: "auto", minHeight: 0 }
              }>
              {txViewMode === 'grid' ? transactions
                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                .map((tx) => {
                  const isActive = selectedTx?.id === tx.id;
                  const overdue = tx.dueDate && tx.status !== 'paid' && new Date(tx.dueDate + 'T00:00:00') < new Date();
                  const statusTint = config.features?.billPaymentStatusChip !== false ? rowStatusTint(statusKeyOf(tx.status, overdue)) : null;
                  return (
                    <Box
                      key={tx.id}
                      onClick={() => selectTx(tx)}
                      onDoubleClick={() => startEdit(tx)}
                      sx={{
                        p: 1.75,
                        borderRadius: tokens.radius.md,
                        border: '1.5px solid',
                        borderColor: isActive ? tokens.primary : 'rgba(0,0,0,0.08)',
                        bgcolor: isActive ? tokens.primarySoft : statusTint || 'background.paper',
                        cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', gap: 0.75,
                        transition: 'border-color 0.12s, box-shadow 0.12s, transform 0.12s',
                        boxShadow: isActive ? tokens.shadow.cardHover : 'none',
                        '&:hover': { borderColor: tokens.primary, transform: 'translateY(-2px)', boxShadow: tokens.shadow.card },
                      }}
                    >
                      {/* Top row: invoice # + amount */}
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 800, fontFamily: 'monospace', fontSize: '0.8rem' }} noWrap>
                            {tx.invoiceNumber}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatDate(tx.date)}{(tx.time || formatCreatedTime(tx)) ? ` · ${tx.time || formatCreatedTime(tx)}` : ''}
                          </Typography>
                        </Box>
                        <Typography sx={{ fontWeight: 800, color: tokens.primary, fontSize: '1.05rem', flexShrink: 0, textAlign: 'right' }}>
                          ₹{Number(tx.totalAmount).toFixed(2)}
                        </Typography>
                      </Box>

                      {/* Party + phone */}
                      <Box>
                        {tx.partyId ? (
                          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{tx.partyName}</Typography>
                        ) : (
                          <Chip size="small" label={tx.partyName || (isSale ? 'Cash & Carry' : 'Cash Purchase')}
                            sx={{ fontWeight: 700, fontSize: '0.62rem', height: 18, bgcolor: 'rgba(100,116,139,0.08)', color: 'success.dark', border: '1px solid rgba(100,116,139,0.22)' }} />
                        )}
                        {tx.partyPhone && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} noWrap>{tx.partyPhone}</Typography>
                        )}
                      </Box>

                      {/* Chips: status, payment mode/credit, transaction type, source */}
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {config.features?.billPaymentStatusChip !== false && <PaidStatusChip status={tx.status} overdue={overdue} />}
                        <Chip size="small" label={tx.status === 'unpaid' ? 'Credit' : (tx.paymentMode || '—')}
                          sx={{ fontWeight: 700, fontSize: '0.62rem', height: 18, bgcolor: alpha(tokens.primary, 0.08), color: tokens.primary, border: `1px solid ${alpha(tokens.primary, 0.2)}` }} />
                        <Chip size="small" label={tx.type === 'Purchases' ? 'Purchase' : 'Sale'}
                          sx={{ fontWeight: 700, fontSize: '0.62rem', height: 18, bgcolor: 'rgba(0,0,0,0.04)', color: 'text.secondary' }} />
                        {tx.sourceEstimateId && (
                          <SourceChip label={`From Estimate${estimatesById.get(tx.sourceEstimateId)?.estimateNumber ? `: ${estimatesById.get(tx.sourceEstimateId).estimateNumber}` : ''}`} icon={FileText}
                            onClick={(e) => { e.stopPropagation(); viewSourceEstimate(tx.sourceEstimateId); }} />
                        )}
                        {tx.sourceOrderId && (
                          <SourceChip label={`From Order${ordersById.get(tx.sourceOrderId)?.orderNumber ? `: ${ordersById.get(tx.sourceOrderId).orderNumber}` : ''}`} icon={ClipboardList}
                            onClick={(e) => { e.stopPropagation(); viewSourceOrder(tx.sourceOrderId); }} />
                        )}
                      </Box>

                      {/* Due date, when set — plus an inline WhatsApp
                          reminder button for any unpaid invoice/bill with a
                          party (not just overdue ones). */}
                      {(tx.dueDate || (tx.status !== 'paid' && tx.partyId)) && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          {tx.dueDate && (
                            <Typography variant="caption" sx={{ fontWeight: 700, color: overdue ? STATUS_COLOR.overdue : 'text.disabled' }}>
                              Due {formatDate(tx.dueDate)}
                            </Typography>
                          )}
                          {tx.status !== 'paid' && tx.partyId && (
                            <Tooltip title="Send payment reminder on WhatsApp">
                              <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleSendReminder(tx); }}
                                sx={{ p: 0.3, color: '#25D366', bgcolor: 'rgba(37,211,102,0.1)', '&:hover': { bgcolor: 'rgba(37,211,102,0.2)' } }}>
                                <MessageCircle size={13} />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      )}

                      {/* Quick actions — pinned to the bottom of the tile via
                          mt: 'auto' so it lines up across tiles regardless of
                          how much content (e.g. an optional due date line)
                          precedes it in a given tile. */}
                      <Box sx={{ display: 'flex', gap: 0.5, mt: 'auto', pt: 0.75, borderTop: '1px dashed rgba(0,0,0,0.08)' }} onClick={(e) => e.stopPropagation()}>
                        <Tooltip title="Preview">
                          <IconButton size="small" onClick={() => { if (isMobile) { setPreviewTx(tx); setPreviewOpen(true); } else { selectTx(tx); } }}
                            sx={{ flex: 1, borderRadius: tokens.radius.sm, color: tokens.primary, bgcolor: `${tokens.primary}10`, '&:hover': { bgcolor: `${tokens.primary}20` } }}>
                            <Eye size={15} />
                          </IconButton>
                        </Tooltip>
                        {!isMobile && (
                          <Tooltip title="Print">
                            <IconButton size="small" onClick={() => triggerPrint(tx)}
                              sx={{ flex: 1, borderRadius: tokens.radius.sm, color: tokens.primary, bgcolor: `${tokens.primary}10`, '&:hover': { bgcolor: `${tokens.primary}20` } }}>
                              <Printer size={15} />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => startEdit(tx)}
                            sx={{ flex: 1, borderRadius: tokens.radius.sm, color: tokens.primary, bgcolor: `${tokens.primary}10`, '&:hover': { bgcolor: `${tokens.primary}20` } }}>
                            <Edit size={15} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="More">
                          <IconButton size="small" onClick={(e) => setRowMoreMenu({ anchorEl: e.currentTarget, tx })}
                            sx={{ flex: 1, borderRadius: tokens.radius.sm, color: tokens.primary, bgcolor: `${tokens.primary}10`, '&:hover': { bgcolor: `${tokens.primary}20` } }}>
                            <MoreVertical size={15} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </Box>
                  );
                }) : transactions
                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                .map((tx) => {
                  const overdue = tx.dueDate && tx.status !== 'paid' && new Date(tx.dueDate + 'T00:00:00') < new Date();
                  const isActive = selectedTx?.id === tx.id;
                  const statusTint = config.features?.billPaymentStatusChip !== false ? rowStatusTint(statusKeyOf(tx.status, overdue)) : null;
                  return (
                    <Box
                      key={tx.id}
                      onClick={() => selectTx(tx)}
                      sx={{
                        p: 1.75,
                        borderBottom: '1px solid rgba(0,0,0,0.06)',
                        borderLeft: '3px solid',
                        borderLeftColor: isActive ? tokens.primary : 'transparent',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1,
                        cursor: 'pointer',
                        transition: 'background 0.12s, border-color 0.12s',
                        bgcolor: isActive ? tokens.primarySoft : selectedIds.has(tx.id) ? 'primary.50' : statusTint || 'transparent',
                        '&:hover': { bgcolor: isActive ? tokens.primarySoft : statusTint ? alpha(STATUS_COLOR[statusKeyOf(tx.status, overdue)], 0.1) : 'rgba(17,17,17,0.04)' },
                      }}
                    >
                      {/* Top row: doc # + amount */}
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                        <Checkbox
                          size="small"
                          sx={{ p: 0.25, mt: -0.25 }}
                          checked={selectedIds.has(tx.id)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(tx.id); else next.delete(tx.id);
                              return next;
                            });
                          }}
                        />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 800, fontFamily: 'monospace', fontSize: '0.85rem' }} noWrap>
                            {tx.invoiceNumber}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatDate(tx.date)}{(tx.time || formatCreatedTime(tx)) ? ` · ${tx.time || formatCreatedTime(tx)}` : ''}
                          </Typography>
                        </Box>
                        <Typography sx={{ fontWeight: 800, color: tokens.primary, fontSize: '1rem', flexShrink: 0 }}>
                          ₹{Number(tx.totalAmount).toFixed(2)}
                        </Typography>
                      </Box>

                      {/* Middle: party + due */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', pl: 4 }}>
                        {tx.partyId ? (
                          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{tx.partyName}</Typography>
                        ) : (
                          <Chip size="small" label={tx.partyName || (isSale ? 'Cash & Carry' : 'Cash Purchase')}
                            sx={{ fontWeight: 700, fontSize: '0.68rem', height: 20, bgcolor: 'rgba(100,116,139,0.08)', color: 'success.dark', border: '1px solid rgba(100,116,139,0.22)' }} />
                        )}
                        {config.features?.billPaymentStatusChip !== false && <PaidStatusChip status={tx.status} overdue={overdue} />}
                        {tx.sourceEstimateId && (
                          <SourceChip label={`From Estimate${estimatesById.get(tx.sourceEstimateId)?.estimateNumber ? `: ${estimatesById.get(tx.sourceEstimateId).estimateNumber}` : ''}`} icon={FileText}
                            onClick={(e) => { e.stopPropagation(); viewSourceEstimate(tx.sourceEstimateId); }} />
                        )}
                        {tx.sourceOrderId && (
                          <SourceChip label={`From Order${ordersById.get(tx.sourceOrderId)?.orderNumber ? `: ${ordersById.get(tx.sourceOrderId).orderNumber}` : ''}`} icon={ClipboardList}
                            onClick={(e) => { e.stopPropagation(); viewSourceOrder(tx.sourceOrderId); }} />
                        )}
                        {tx.dueDate && (
                          <Typography variant="caption" sx={{ fontWeight: 700, color: overdue ? STATUS_COLOR.overdue : 'text.disabled' }}>
                            Due {formatDate(tx.dueDate)}
                          </Typography>
                        )}
                        {tx.status !== 'paid' && tx.partyId && (
                          <Tooltip title="Send payment reminder on WhatsApp">
                            <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleSendReminder(tx); }}
                              sx={{ p: 0.3, color: '#25D366', bgcolor: 'rgba(37,211,102,0.1)', '&:hover': { bgcolor: 'rgba(37,211,102,0.2)' } }}>
                              <MessageCircle size={13} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>

                      {/* Actions — Edit, Print (desktop only) + Received Payment
                          (+ Reference Images, when present) stay as always-visible
                          direct shortcuts; everything else (Share/Download PDF/
                          Download Image/Delete) collapses behind the "more" icon
                          so the row doesn't need 6-7 icon buttons crammed into it. */}
                      <Box sx={{ display: 'flex', gap: 0.5, pl: 4 }}>
                        {[
                          { icon: <Edit size={17} />, title: 'Edit', onClick: () => startEdit(tx), color: tokens.primary },
                          ...(isMobile ? [{ icon: <Eye size={17} />, title: 'Preview', onClick: () => { setPreviewTx(tx); setPreviewOpen(true); }, color: tokens.primary }] : []),
                          ...(!isMobile ? [{ icon: <Printer size={17} />, title: 'Print', onClick: () => { setPreviewOpen(false); triggerPrint(tx); }, color: tokens.primary }] : []),
                          ...(tx.status !== 'paid' && tx.partyId ? [{ icon: <Wallet size={17} />, title: isSale ? 'Received Payment' : 'Payment Made', onClick: () => handleReceivePayment(tx), color: tokens.success }] : []),
                        ].map(({ icon, title, onClick, color, disabled }) => (
                          <Tooltip key={title} title={title}>
                            <span style={{ flex: 1, display: 'flex' }}>
                              <IconButton size="small" disabled={disabled}
                                onClick={(e) => { e.stopPropagation(); onClick(); }}
                                sx={{ flex: 1, borderRadius: tokens.radius.sm, color, bgcolor: `${color}10`, '&:hover': { bgcolor: `${color}20` } }}>
                                {icon}
                              </IconButton>
                            </span>
                          </Tooltip>
                        ))}
                        <Tooltip title="More">
                          <span style={{ flex: 1, display: 'flex' }}>
                            <IconButton size="small"
                              onClick={(e) => { e.stopPropagation(); setRowMoreMenu({ anchorEl: e.currentTarget, tx }); }}
                              sx={{ flex: 1, borderRadius: tokens.radius.sm, color: tokens.primary, bgcolor: `${tokens.primary}10`, '&:hover': { bgcolor: `${tokens.primary}20` } }}>
                              <MoreVertical size={17} />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Box>
                    </Box>
                  );
                })}
              </Box>

              {/* Shared "more actions" menu for the row action bar above —
                  single instance keyed by rowMoreMenu.tx rather than one per
                  row, since only one can be open at a time. */}
              <Menu
                anchorEl={rowMoreMenu.anchorEl}
                open={Boolean(rowMoreMenu.anchorEl)}
                onClose={() => setRowMoreMenu({ anchorEl: null, tx: null })}
                transformOrigin={{ horizontal: "right", vertical: "top" }}
                anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
                PaperProps={{ elevation: 6, sx: { borderRadius: 2, mt: 0.5, minWidth: 190 } }}
              >
                <MenuItem onClick={() => { handleShare(rowMoreMenu.tx); setRowMoreMenu({ anchorEl: null, tx: null }); }} sx={{ gap: 1.5, py: 1.1 }}>
                  <ListItemIcon sx={{ minWidth: "unset" }}><Share2 size={16} color="#25D366" /></ListItemIcon>
                  <ListItemText primary="Share" primaryTypographyProps={{ fontSize: "0.85rem", fontWeight: 600 }} />
                </MenuItem>
                <MenuItem disabled={pdfLoading} onClick={() => { downloadInvoicePDF(rowMoreMenu.tx); setRowMoreMenu({ anchorEl: null, tx: null }); }} sx={{ gap: 1.5, py: 1.1 }}>
                  <ListItemIcon sx={{ minWidth: "unset" }}><FileDown size={16} color="#7c3aed" /></ListItemIcon>
                  <ListItemText primary="Download PDF" primaryTypographyProps={{ fontSize: "0.85rem", fontWeight: 600 }} />
                </MenuItem>
                <MenuItem disabled={shareLoading} onClick={() => { shareAsImage(rowMoreMenu.tx); setRowMoreMenu({ anchorEl: null, tx: null }); }} sx={{ gap: 1.5, py: 1.1 }}>
                  <ListItemIcon sx={{ minWidth: "unset" }}><ImageDown size={16} color="#0891b2" /></ListItemIcon>
                  <ListItemText primary="Download Image" primaryTypographyProps={{ fontSize: "0.85rem", fontWeight: 600 }} />
                </MenuItem>
                {referenceImagesEnabled && rowMoreMenu.tx?.referenceImageIds?.length > 0 && (
                  <MenuItem onClick={() => { setImageViewerRecordId(rowMoreMenu.tx.id); setRowMoreMenu({ anchorEl: null, tx: null }); }} sx={{ gap: 1.5, py: 1.1 }}>
                    <ListItemIcon sx={{ minWidth: "unset" }}><Images size={16} color="#0891b2" /></ListItemIcon>
                    <ListItemText primary="View Reference Images" primaryTypographyProps={{ fontSize: "0.85rem", fontWeight: 600 }} />
                  </MenuItem>
                )}
                <MenuItem onClick={() => { const tx = rowMoreMenu.tx; setRowMoreMenu({ anchorEl: null, tx: null }); handleDelete(tx); }} sx={{ gap: 1.5, py: 1.1 }}>
                  <ListItemIcon sx={{ minWidth: "unset" }}><Trash2 size={16} color={tokens.error} /></ListItemIcon>
                  <ListItemText primary="Delete" primaryTypographyProps={{ fontSize: "0.85rem", fontWeight: 600, color: tokens.error }} />
                </MenuItem>
              </Menu>

              <TablePagination
                component="div"
                count={transactions.length}
                page={page}
                onPageChange={(e, p) => setPage(p)}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={(e) => {
                  setRowsPerPage(parseInt(e.target.value, 10));
                  setPage(0);
                }}
                rowsPerPageOptions={txViewMode === "grid" ? [30, 60, 100] : [5, 10, 25, 50]}
                sx={{
                  borderTop: "1px solid rgba(0,0,0,0.06)",
                  flexShrink: 0,
                  "& .MuiTablePagination-select": { borderRadius: tokens.radius.sm },
                  "& .MuiTablePagination-toolbar": { flexWrap: "wrap" },
                }}
              />
            </>)}
            </Box>
          )}
        </Card>

      </Box>

      {/* Preview always opens as a popup dialog (both list and grid mode) —
          the desktop table's eye icon is the only way to open it, so a
          side-panel layout shift no longer makes sense here. */}
      <Dialog
        open={!isMobile && !!selectedTx}
        onClose={closeTxPreview}
        maxWidth="lg"
        fullWidth
        slotProps={{ paper: { sx: { display: "flex", flexDirection: "column", width: "90vw", height: "92vh", maxHeight: "92vh", borderRadius: tokens.radius.lg } } }}
      >
        {txPreviewInner}
      </Dialog>



      {/* Print hidden refs */}
      <div style={{ display: "none" }}>
        <InvoiceTemplate
          ref={printRef}
          transaction={printingTx}
          business={currentBusiness}
          paperSize={paperSize}
          printOptions={{ ...config.billPrintOptions, loyalty: config.loyalty }}
          partyBalance={
            printingTx
              ? (parties.find((p) => p.id === printingTx.partyId)?.balance ?? 0)
              : undefined
          }
        />
      </div>

      {/* Bulk print hidden stack — one InvoiceTemplate per selected transaction,
          each forced onto its own page so the combined print job / "Save as PDF"
          comes out as one bill per page in list order. */}
      <div style={{ display: "none" }}>
        <div ref={bulkPrintRef}>
          {bulkPrintTxs.map((tx, i) => (
            <div key={tx.id ?? i} className={i > 0 ? "inv-before-break" : undefined}>
              <InvoiceTemplate
                transaction={tx}
                business={currentBusiness}
                paperSize={paperSize}
                printOptions={{ ...config.billPrintOptions, loyalty: config.loyalty }}
                partyBalance={parties.find((p) => p.id === tx.partyId)?.balance ?? 0}
              />
            </div>
          ))}
        </div>
      </div>

      {/* PDF capture ref — off-screen, not display:none so html2canvas can read it */}
      <div style={{ position: "fixed", left: "-9999px", top: 0, opacity: 0, pointerEvents: "none", zIndex: -1 }}>
        <InvoiceTemplate
          ref={pdfRef}
          transaction={previewTx}
          business={currentBusiness}
          paperSize={paperSize}
          printOptions={{ ...config.billPrintOptions, loyalty: config.loyalty }}
          partyBalance={
            previewTx
              ? (parties.find((p) => p.id === previewTx.partyId)?.balance ?? 0)
              : undefined
          }
        />
      </div>

      {/* ── Preview dialog ── */}
      <Dialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
        PaperProps={{
          sx: {
            borderRadius: isMobile ? 0 : tokens.radius.xl,
            overflow: "hidden",
            maxHeight: isMobile ? '100vh' : "92vh",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 32px 80px rgba(0,0,0,0.22)",
          },
        }}
      >
        {/* Gradient header */}
        <Box
          sx={{
            background: '#ffffff', borderBottom: '1px solid #ece2db',
            px: 3,
            py: 2.5,
            display: "flex",
            alignItems: "flex-start",
            gap: 2,
            flexShrink: 0,
          }}
        >
          <Box
            sx={{
              p: 1,
              borderRadius: tokens.radius.md,
              bgcolor: "rgba(92,31,34,0.08)",
              display: "flex",
              alignItems: "center",
              mt: 0.5,
              flexShrink: 0,
            }}
          >
            <Eye size={18} color="#5c1f22" />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="overline"
              sx={{
                color: "#6b5550",
                fontWeight: 700,
                fontSize: "0.65rem",
                letterSpacing: "0.1em",
                lineHeight: 1,
              }}
            >
              {isSale ? "Invoice Preview" : "Bill Preview"}
            </Typography>
            <Typography
              variant="h6"
              sx={{
                color: "#5c1f22",
                fontWeight: 800,
                mt: 0.5,
                fontSize: "1.05rem",
                fontFamily: "monospace",
                letterSpacing: "0.02em",
              }}
            >
              {previewTx?.invoiceNumber || "—"}
            </Typography>
            <Box
              sx={{
                display: "flex",
                gap: 2,
                mt: 0.75,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              {previewTx?.partyName && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <User size={12} color="#9c8a84" />
                  <Typography
                    variant="caption"
                    sx={{ color: "#7a2e30", fontWeight: 600 }}
                  >
                    {previewTx.partyName}
                  </Typography>
                </Box>
              )}
              {previewTx?.date && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <Calendar size={12} color="#9c8a84" />
                  <Typography
                    variant="caption"
                    sx={{ color: "#7a2e30", fontWeight: 600 }}
                  >
                    {formatDate(previewTx.date)}
                  </Typography>
                </Box>
              )}
              {previewTx?.totalAmount != null && (
                <Box
                  sx={{
                    px: 1.25,
                    py: 0.25,
                    bgcolor: "rgba(92,31,34,0.08)",
                    borderRadius: "100px",
                    border: "1px solid #ece2db",
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{ color: "#5c1f22", fontWeight: 800, fontSize: "0.8rem" }}
                  >
                    ₹{previewTx.totalAmount.toFixed(2)}
                  </Typography>
                </Box>
              )}
              {previewTx && config.features?.billPaymentStatusChip !== false && (() => {
                const isOverdue = previewTx.dueDate && previewTx.status !== 'paid' && new Date(previewTx.dueDate + 'T00:00:00') < new Date();
                const label = previewTx.status === 'paid' ? 'Paid' : isOverdue ? 'Overdue' : 'Unpaid';
                return (
                  <Chip size="small" label={label}
                    sx={{ fontWeight: 800, fontSize: '0.62rem', height: 18, bgcolor: isOverdue ? '#fee2e2' : 'rgba(92,31,34,0.08)', color: isOverdue ? '#991b1b' : '#5c1f22', border: isOverdue ? '1px solid #fecaca' : '1px solid #ece2db' }} />
                );
              })()}
              {previewTx?.sourceEstimateId && (
                <Chip size="small" icon={<FileText size={12} />} label={`From Estimate${estimatesById.get(previewTx.sourceEstimateId)?.estimateNumber ? `: ${estimatesById.get(previewTx.sourceEstimateId).estimateNumber}` : ''}`}
                  onClick={() => viewSourceEstimate(previewTx.sourceEstimateId)}
                  sx={{ fontWeight: 700, fontSize: '0.62rem', height: 18, bgcolor: 'rgba(92,31,34,0.08)', color: '#5c1f22', border: '1px solid #ece2db', cursor: 'pointer', '& .MuiChip-icon': { color: '#5c1f22' } }} />
              )}
              {previewTx?.sourceOrderId && (
                <Chip size="small" icon={<ClipboardList size={12} />} label={`From Order${ordersById.get(previewTx.sourceOrderId)?.orderNumber ? `: ${ordersById.get(previewTx.sourceOrderId).orderNumber}` : ''}`}
                  onClick={() => viewSourceOrder(previewTx.sourceOrderId)}
                  sx={{ fontWeight: 700, fontSize: '0.62rem', height: 18, bgcolor: 'rgba(92,31,34,0.08)', color: '#5c1f22', border: '1px solid #ece2db', cursor: 'pointer', '& .MuiChip-icon': { color: '#5c1f22' } }} />
              )}
              {previewTx?.billedBy && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography
                    variant="caption"
                    sx={{ color: '#6b5550', fontSize: '0.7rem' }}
                  >
                    Billed by: <strong style={{ color: '#5c1f22' }}>{previewTx.billedBy}</strong>
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
          <IconButton
            onClick={() => setPreviewOpen(false)}
            size="small"
            sx={{
              color: "#6b5550",
              mt: -0.5,
              mr: -0.5,
              "&:hover": {
                color: "#5c1f22",
                bgcolor: "rgba(92,31,34,0.08)",
              },
            }}
          >
            <X size={18} />
          </IconButton>
        </Box>

        {/* Toolbar */}
        <Box
          sx={{
            px: { xs: 1.5, sm: 2.5 },
            py: 1,
            display: "flex",
            alignItems: "center",
            gap: { xs: 1, sm: 1.5 },
            borderBottom: "1px solid rgba(0,0,0,0.08)",
            bgcolor: "rgba(0,0,0,0.015)",
            flexShrink: 0,
            flexWrap: "nowrap",
            minWidth: 0,
          }}
        >
          {/* Paper size selector */}
          <TextField
            select
            size="small"
            value={paperSize}
            onChange={(e) => setPaperSize(e.target.value)}
            sx={{
              minWidth: { xs: 90, sm: 120 },
              flexShrink: 0,
              "& .MuiOutlinedInput-root": { borderRadius: tokens.radius.sm },
            }}
          >
            {PAPER_SIZES.map((ps) => (
              <MenuItem key={ps.value} value={ps.value}>{ps.value}</MenuItem>
            ))}
          </TextField>

          <Box sx={{ flex: 1 }} />

          {/* Edit + Print + Received Payment stay as direct shortcuts (same as
              the list row and side-preview panel); everything else (Share,
              Download PDF/Image, Delete) collapses into "More". */}
          <Tooltip title="Edit">
            <IconButton
              onClick={() => { setPreviewOpen(false); startEdit(previewTx); }}
              size="small"
              sx={{
                border: "1px solid rgba(22,163,74,0.28)",
                borderRadius: tokens.radius.sm,
                color: "#16a34a",
                px: 1,
                "&:hover": { bgcolor: "rgba(22,163,74,0.06)" },
              }}
            >
              <Edit size={17} />
            </IconButton>
          </Tooltip>

          <Tooltip title="Print">
            <IconButton
              onClick={() => { setPreviewOpen(false); triggerPrint(previewTx); }}
              size="small"
              sx={{
                border: "1px solid rgba(22,163,74,0.28)",
                borderRadius: tokens.radius.sm,
                color: "#16a34a",
                px: 1,
                "&:hover": { bgcolor: "rgba(22,163,74,0.06)" },
              }}
            >
              <Printer size={17} />
            </IconButton>
          </Tooltip>

          {previewTx && previewTx.status !== 'paid' && previewTx.partyId && (
            <Tooltip title={isSale ? "Received Payment" : "Payment Made"}>
              <IconButton
                onClick={() => handleReceivePayment(previewTx)}
                size="small"
                sx={{
                  border: "1px solid rgba(22,163,74,0.28)",
                  borderRadius: tokens.radius.sm,
                  color: "#16a34a",
                  px: 1,
                  "&:hover": { bgcolor: "rgba(22,163,74,0.06)" },
                }}
              >
                <Wallet size={17} />
              </IconButton>
            </Tooltip>
          )}

          <Tooltip title="More">
            <IconButton
              onClick={(e) => setRowMoreMenu({ anchorEl: e.currentTarget, tx: previewTx })}
              size="small"
              sx={{
                border: "1px solid rgba(22,163,74,0.28)",
                borderRadius: tokens.radius.sm,
                color: "#16a34a",
                px: 1,
                "&:hover": { bgcolor: "rgba(22,163,74,0.06)" },
              }}
            >
              <MoreVertical size={17} />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Scrollable preview area — auto-scaled to fit the dialog width */}
        <Box
          sx={{
            flex: 1,
            overflow: "auto",
            bgcolor: "#e8eaed",
            p: { xs: 1.5, sm: 3 },
          }}
        >
          <FitPreview>
            <InvoiceTemplate
              transaction={previewTx}
              business={currentBusiness}
              paperSize={paperSize}
              printOptions={{ ...config.billPrintOptions, loyalty: config.loyalty }}
              partyBalance={
                previewTx
                  ? (parties.find((p) => p.id === previewTx.partyId)
                      ?.balance ?? 0)
                  : undefined
              }
            />
          </FitPreview>
        </Box>
      </Dialog>

      {/* Received Payment / Payment Made — pick Cash / Bank / Split before settling */}
      <Dialog
        open={receivePayDialog.open}
        onClose={closeReceivePayDialog}
        maxWidth="xs"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: tokens.radius.lg } } }}
      >
        <Box sx={{ px: 3, pt: 2.5, pb: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '1.05rem' }}>
            {isSale ? 'Received Payment' : 'Payment Made'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Invoice #{receivePayDialog.tx?.invoiceNumber} · {receivePayDialog.tx?.partyName}
          </Typography>
          <Typography sx={{ mt: 1.5, fontWeight: 800, fontSize: '1.5rem', color: tokens.success }}>
            ₹{receivePayDialog.outstanding.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Typography>
        </Box>
        <Box sx={{ px: 3, pb: 1 }}>
          <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.75 }}>
            Received Via
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.75, mb: 1.5 }}>
            {[
              { value: 'Cash', icon: <Banknote size={14} />, color: '#16a34a' },
              { value: 'Bank', icon: <Landmark size={14} />, color: '#5c1f22' },
              { value: 'Split', icon: <Wallet size={14} />, color: '#7c3aed' },
            ].map((opt) => {
              const sel = receivePayMode === opt.value;
              return (
                <Box
                  key={opt.value}
                  onClick={() => setReceivePayMode(opt.value)}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 0.75, px: 1.5, py: 0.75, borderRadius: '8px',
                    border: '1.5px solid', cursor: 'pointer', userSelect: 'none', transition: 'all 0.12s',
                    fontWeight: 700, fontSize: '0.8rem',
                    borderColor: sel ? opt.color : 'divider',
                    bgcolor: sel ? alpha(opt.color, 0.07) : 'transparent',
                    color: sel ? opt.color : 'text.secondary',
                    '&:hover': { borderColor: opt.color, color: opt.color, bgcolor: alpha(opt.color, 0.05) },
                  }}
                >
                  {opt.icon}{opt.value}
                </Box>
              );
            })}
          </Box>
          {receivePayMode === 'Split' && (
            <SplitPaymentInput
              cash={receivePaySplitCash} onCashChange={setReceivePaySplitCash}
              bank={receivePaySplitBank} onBankChange={setReceivePaySplitBank}
              total={Math.max(0, receivePayDialog.outstanding - (parseFloat(receivePayLess) || 0))}
            />
          )}
          <TextField
            fullWidth size="small" type="date" label="Payment Date"
            value={receivePayDate}
            onChange={(e) => setReceivePayDate(e.target.value)}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: new Date().toISOString().split('T')[0] } }}
            sx={{ mt: 1.5 }}
          />
          <Box sx={{ mt: 1.5, border: '1.5px solid', borderColor: receivePayLess ? '#d97706' : 'divider', borderRadius: '10px', px: 1.5, py: 0.75, bgcolor: receivePayLess ? alpha('#d97706', 0.05) : 'transparent', transition: 'all 0.15s' }}>
            <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: receivePayLess ? '#d97706' : 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.25 }}>
              Less (Discount / Write-off)
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, color: receivePayLess ? '#d97706' : '#ddd0c9' }}>₹</Typography>
              <InputBase
                fullWidth type="number" placeholder="0 (optional)"
                value={receivePayLess}
                onChange={(e) => setReceivePayLess(e.target.value)}
                slotProps={{ input: { min: 0, max: receivePayDialog.outstanding, step: '0.01' } }}
                sx={{ fontSize: '0.9rem', fontWeight: 600 }}
              />
            </Box>
          </Box>
          {parseFloat(receivePayLess) > 0 && (
            <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', mt: 0.5 }}>
              Collecting ₹{Math.max(0, receivePayDialog.outstanding - (parseFloat(receivePayLess) || 0)).toLocaleString('en-IN', { maximumFractionDigits: 2 })} · writing off ₹{(parseFloat(receivePayLess) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })} — invoice still marked fully paid.
            </Typography>
          )}
          <TextField
            fullWidth size="small" label="Notes (optional)" placeholder="e.g. Paid via GPay, ref #123"
            value={receivePayNotes}
            onChange={(e) => setReceivePayNotes(e.target.value)}
            sx={{ mt: 1.5 }}
          />
        </Box>
        <DialogActions sx={{ px: 3, pb: 2.5, flexWrap: 'wrap', gap: 1 }}>
          <Button onClick={closeReceivePayDialog} disabled={receivePaySaving} sx={{ fontWeight: 600 }}>Cancel</Button>
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Marks the invoice as paid without recording any payment — add it manually via Payment Entry later.">
            <span>
              <Button
                onClick={markPaidWithoutPayment}
                disabled={receivePaySaving}
                variant="outlined"
                sx={{ fontWeight: 700, textTransform: 'none', borderRadius: 2 }}
              >
                Mark Paid without Payment
              </Button>
            </span>
          </Tooltip>
          <Button
            variant="contained"
            onClick={confirmReceivePayment}
            disabled={receivePaySaving}
            sx={{ fontWeight: 700, textTransform: 'none', borderRadius: 2, bgcolor: tokens.success, '&:hover': { bgcolor: tokens.success } }}
          >
            {receivePaySaving ? 'Saving…' : (isSale ? 'Confirm Received' : 'Confirm Paid')}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snack.open}
        autoHideDuration={snack.duration || 4000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setSnack((s) => ({ ...s, open: false }))}
          severity={snack.severity}
          variant="filled"
          {...(snack.severity === 'success' ? { icon: <CheckCircle2 size={18} /> } : {})}
          sx={{
            width: "100%",
            fontWeight: 700,
            borderRadius: tokens.radius.md,
          }}
        >
          {snack.message}
        </Alert>
      </Snackbar>

      <BulkSendDialog
        open={bulkSendOpen}
        onClose={() => setBulkSendOpen(false)}
        transactions={transactions.filter(t => selectedIds.has(t.id))}
        parties={getItems('parties').filter(p => p.businessId === currentBusiness?.id)}
        businessName={currentBusiness?.name || 'TallyKraft'}
        isSale={isSale}
      />

      <SalesBulkAddDialog
        open={bulkAddOpen}
        onClose={() => setBulkAddOpen(false)}
        onSuccess={(count) => setSnack({ open: true, message: `${count} sales invoice${count !== 1 ? 's' : ''} added`, severity: 'success' })}
        generateInvoiceNumber={() => generateInvoiceNumber(new Date().toISOString().split('T')[0], true)}
      />
      <SalesBulkEditDialog
        open={bulkEditOpen}
        onClose={() => setBulkEditOpen(false)}
        isSale={isSale}
      />
      <SalesImportDialog
        open={salesImportOpen}
        onClose={() => setSalesImportOpen(false)}
        isSale={isSale}
        onSuccess={(count) => setSnack({ open: true, message: `${count} invoice${count !== 1 ? 's' : ''} imported`, severity: 'success' })}
      />

      <PurchaseBulkAddDialog
        open={purchaseBulkAddOpen}
        onClose={() => setPurchaseBulkAddOpen(false)}
        onSuccess={(count) => setSnack({ open: true, message: `${count} purchase bill${count !== 1 ? 's' : ''} added`, severity: 'success' })}
        generateBillNumber={() => generateInvoiceNumber(new Date().toISOString().split('T')[0], false)}
      />
      <SalesBulkEditDialog
        open={purchaseBulkEditOpen}
        onClose={() => setPurchaseBulkEditOpen(false)}
        isSale={false}
      />
      <PurchaseImportDialog
        open={purchaseImportOpen}
        onClose={() => setPurchaseImportOpen(false)}
        onSuccess={(count) => setSnack({ open: true, message: `${count} purchase bill${count !== 1 ? 's' : ''} imported`, severity: 'success' })}
      />

      <SendDialog
        open={sendOpen}
        onClose={() => { setSendOpen(false); setSendInitialMessage(undefined); setSendDialogTitle(undefined); }}
        tx={sendTx}
        party={sendParty}
        businessName={currentBusiness?.name || 'TallyKraft'}
        isSale={isSale}
        onSharePDF={() => shareAsPDF(sendTx)}
        onShareImage={() => shareAsImage(sendTx)}
        onSharePDFToWhatsApp={() => shareAsPDF(sendTx, { toWhatsApp: true, phone: sendParty?.phone })}
        onShareImageToWhatsApp={() => shareAsImage(sendTx, { toWhatsApp: true, phone: sendParty?.phone })}
        shareLoading={shareLoading}
        initialMessage={sendInitialMessage}
        dialogTitle={sendDialogTitle}
      />

      <ImageViewerDialog
        open={!!imageViewerRecordId}
        onClose={() => setImageViewerRecordId(null)}
        recordId={imageViewerRecordId}
      />
    </Box>
  );
};

export default SalesPage;
