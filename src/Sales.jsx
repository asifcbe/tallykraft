import React, { useState, useEffect, useRef } from "react";
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
  List,
  ListItem,
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
} from "@mui/material";
import {
  Plus,
  Trash2,
  Printer,
  Save,
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
} from "lucide-react";
import { exportToExcel, exportToTallyXML, SALE_COLUMNS, PURCHASE_COLUMNS } from './exportUtils';
import { useBusiness } from "./BusinessContext";
import { useData } from "./DataContext";
import { useConfig } from "./ConfigContext";
import { useAuth } from "./AuthContext";
import { useSubscription } from "./SubscriptionContext";
import { useReactToPrint } from "react-to-print";
import { useLocation } from "react-router-dom";
import { useTabs } from "./TabsContext";
import InvoiceTemplate from "./InvoiceTemplate";
import { FitPreview } from "./TxListView";
import { useI18n } from "./i18n/I18nContext";
import BarcodeScanner from "./BarcodeScanner";
import ItemFormDialog from "./ItemFormDialog";
import { useDialog } from "./DialogContext";
import PartySelect from "./PartySelect";
import SendDialog from "./SendDialog";
import BulkSendDialog from "./BulkSendDialog";
import ItemSelect from "./ItemSelect";


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

/* ─── Reusable styled helpers ─── */
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
        color === "primary" ? tokens.primaryBorder : "rgba(16,185,129,0.18)",
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

const GradientButton = ({
  children,
  fullWidth = false,
  size = "large",
  disabled = false,
  onClick,
  startIcon,
  tokens,
  sx = {},
}) => (
  <Button
    variant="contained"
    fullWidth={fullWidth}
    size={size}
    disabled={disabled}
    onClick={onClick}
    startIcon={startIcon}
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
);

/* ─── Main Component ─── */
const SalesPage = ({ mode = "sales" }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const tokens = React.useMemo(() => getThemeTokens(theme), [theme]);
  const { t } = useI18n();
  const { confirm, showAlert } = useDialog();
  const isSale = mode === "sales";
  const { currentBusiness } = useBusiness();
  const { data, addItem, updateItem, deleteItem, getItems } = useData();
  const { config } = useConfig();
  const { staffSession, currentUser } = useAuth();
  const { isBusinessActive } = useSubscription();
  const canWrite = isBusinessActive(currentBusiness?.id);
  const canViewPurchasePrice = !staffSession || !!staffSession.features?.viewPurchasePrice;
  const ownerName = staffSession ? staffSession.name : (currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Admin');
  const salesStaff = getItems('staffMembers').filter(s => s.businessId === currentBusiness?.id && s.showInSalesSelector === true && s.status === 'active');
  const location = useLocation();
  const { tabs, activeTabId } = useTabs();
  const thisPath = mode === "purchase" ? "/purchases" : "/sales";
  const barcodeScanEnabled = !!config.features?.barcode;

  const [view, setView] = useState("list");
  const [editId, setEditId] = useState(null);
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
      qty: 1,
      price: "",
      taxRate: 0,
      discountPercent: "",
      total: 0,
    },
  ]);
  const [description, setDescription] = useState("");
  const [noGST, setNoGST] = useState(false);
  const [discountPercent, setDiscountPercent] = useState("");
  const [discountType, setDiscountType] = useState("percent"); // 'percent' | 'amount'
  const [printingTx, setPrintingTx] = useState(null);
  const [printTrigger, setPrintTrigger] = useState(0);
  const [paperSize, setPaperSize] = useState(() => config.defaultPaperSize || 'A4');
  React.useEffect(() => {
    if (config.defaultPaperSize) setPaperSize(config.defaultPaperSize);
  }, [config.defaultPaperSize]);
  const printRef = useRef();
  const pdfRef = useRef();
  const bulkPrintRef = useRef();
  const _shareInFlight = useRef(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [shareMenuAnchor, setShareMenuAnchor] = useState(null);
  const [shareLoading, setShareLoading] = useState(false);

  const [bulkPrintOpen, setBulkPrintOpen] = useState(false);
  const [bulkPrintFormat, setBulkPrintFormat] = useState(() => config.defaultPaperSize || 'A4');
  const [bulkPrintDateFrom, setBulkPrintDateFrom] = useState(
    () => new Date().toISOString().split("T")[0],
  );
  const [bulkPrintDateTo, setBulkPrintDateTo] = useState(
    () => new Date().toISOString().split("T")[0],
  );
  const [bulkPrintPartyId, setBulkPrintPartyId] = useState("");
  const [isBulkPrinting, setIsBulkPrinting] = useState(false);
  const [bulkPrintSelectedIds, setBulkPrintSelectedIds] = useState(
    () => new Set(),
  );
  const [advance, setAdvance] = useState("");
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [splitCash, setSplitCash] = useState("");
  const [splitBank, setSplitBank] = useState("");
  const [splitBankMode, setSplitBankMode] = useState("Bank");
  const [isSaving, setIsSaving] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [taxMode, setTaxMode] = useState("exclusive");
  const [selectedBilledBy, setSelectedBilledBy] = useState('');

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
  const [quickAddPartyLoading, setQuickAddPartyLoading] = useState(false);
  const quickAddPartyCallbackRef = useRef(null);
  // "+ New item" opens the shared full item-creation dialog (same as the Items page).
  const [itemDialog, setItemDialog] = useState({ open: false, name: "" });
  const itemDialogCallbackRef = useRef(null);
  const savingRef = useRef(false);
  const formIsInterState = !!(currentBusiness?.state && selectedParty?.state && currentBusiness.state !== selectedParty.state);
  const keepDataOnNewRef = useRef(false);
  const pendingScannedItemRef = useRef(null);
  const prevActiveTabIdRef = useRef(activeTabId);
  const gModeRef = useRef(false);
  const gModeTimerRef = useRef(null);
  const viewRef = useRef(view);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTx, setPreviewTx] = useState(null);
  // Desktop master-detail: the transaction shown in the side preview pane.
  const [selectedTx, setSelectedTx] = useState(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendTx, setSendTx] = useState(null);
  const [sendParty, setSendParty] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkSendOpen, setBulkSendOpen] = useState(false);
  const [moreMenuAnchor, setMoreMenuAnchor] = useState(null);

  // Invoice previews auto-scale to fit their container via <FitPreview>.
  const [roundOff, setRoundOff] = useState(0); // 0=off, +1/+2/+3=round-up to 1/10/100, -1/-2/-3=round-down

  const [filters, setFilters] = useState({
    dateFrom: "",
    dateTo: "",
    partyId: "",
    minAmount: "",
    maxAmount: "",
    status: "all",
    search: "",
  });
  const [showFilters, setShowFilters] = useState(false);
  const [entryMode, setEntryMode] = useState("customer");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const handlePrint = useReactToPrint({ contentRef: printRef });
  const handleBulkPrint = useReactToPrint({
    contentRef: bulkPrintRef,
    copyStyles: true,
  });

  const parties = getItems("parties").filter(
    (p) =>
      p.businessId === currentBusiness?.id &&
      p.type === (isSale ? "Customer" : "Vendor"),
  );
  const stockItems = getItems("items").filter(
    (item) => item.businessId === currentBusiness?.id,
  );

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
          (i) => i.barcode === scannedBarcode || i.id === scannedBarcode,
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
    const stockItems = getItems("items").filter(
      (i) => i.businessId === currentBusiness?.id,
    );
    const foundItem = stockItems.find(
      (i) => i.barcode === barcode || i.id === barcode,
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
      total: price * (1 - (Number(discountPercent) || 0) / 100) * (1 + taxRate / 100),
    };
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
  }, [getItems, tableName, selectedTx]);

  const transactions = getItems(tableName)
    .filter((tx) => tx.businessId === currentBusiness?.id)
    
    .filter((tx) => {
      if (filters.search) {
        const s = filters.search.toLowerCase();
        if (
          !tx.partyName?.toLowerCase().includes(s) &&
          !tx.invoiceNumber?.toLowerCase().includes(s)
        )
          return false;
      }
      if (filters.dateFrom && new Date(tx.date) < new Date(filters.dateFrom))
        return false;
      if (filters.dateTo && new Date(tx.date) > new Date(filters.dateTo))
        return false;
      if (filters.partyId && tx.partyId !== filters.partyId) return false;
      if (filters.minAmount && tx.totalAmount < parseFloat(filters.minAmount))
        return false;
      if (filters.maxAmount && tx.totalAmount > parseFloat(filters.maxAmount))
        return false;
      if (filters.status !== "all" && tx.status !== filters.status)
        return false;
      return true;
    })
    .reverse();

  // Desktop: auto-select the first transaction so the preview pane shows by default.
  useEffect(() => {
    if (isMobile) return;
    if (view !== "list") return;
    if (!selectedTx && transactions.length > 0) {
      setSelectedTx(transactions[0]);
    }
  }, [isMobile, view, selectedTx, transactions]);

  const totalRevenue = transactions.reduce(
    (s, t) => s + (t.totalAmount || 0),
    0,
  );

  const today = new Date();
  const thisMonthTotal = transactions
    .filter(t => { const d = new Date(t.date + 'T12:00:00'); return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth(); })
    .reduce((s, t) => s + (t.totalAmount || 0), 0);
  const overdueCount = transactions.filter(t => t.dueDate && new Date(t.dueDate + 'T00:00:00') < today).length;

  const bulkPrintQueue = React.useMemo(() => {
    if (!isSale || !currentBusiness?.id) return [];
    const from = bulkPrintDateFrom
      ? new Date(bulkPrintDateFrom + "T00:00:00")
      : null;
    const to = bulkPrintDateTo
      ? new Date(bulkPrintDateTo + "T23:59:59.999")
      : null;
    const allSales = getItems("sales")
      .filter((tx) => tx.businessId === currentBusiness.id)
      .filter((tx) => {
        if (!from && !to) return true;
        const d = new Date(tx.date + "T12:00:00");
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      })
      .filter((tx) => !bulkPrintPartyId || tx.partyId === bulkPrintPartyId);
    const byParty = {};
    allSales.forEach((tx) => {
      const key = tx.partyId;
      if (!byParty[key])
        byParty[key] = {
          partyId: tx.partyId,
          partyName: tx.partyName,
          transactions: [],
        };
      byParty[key].transactions.push(tx);
    });
    return Object.values(byParty).sort((a, b) =>
      (a.partyName || "").localeCompare(b.partyName || ""),
    );
  }, [
    isSale,
    currentBusiness?.id,
    bulkPrintDateFrom,
    bulkPrintDateTo,
    bulkPrintPartyId,
    getItems,
  ]);

  const bulkPrintAllBills = React.useMemo(() => {
    const list = [];
    bulkPrintQueue.forEach((group) => {
      group.transactions.forEach((tx) => list.push(tx));
    });
    return list;
  }, [bulkPrintQueue]);

  useEffect(() => {
    if (!bulkPrintOpen) return;
    setBulkPrintSelectedIds(new Set(bulkPrintAllBills.map((tx) => tx.id)));
    setBulkPrintFormat(paperSize);
    setBulkPrintPartyId("");
  }, [bulkPrintOpen]); // eslint-disable-line

  useEffect(() => {
    if (!bulkPrintOpen) return;
    setBulkPrintSelectedIds(new Set(bulkPrintAllBills.map((tx) => tx.id)));
  }, [bulkPrintDateFrom, bulkPrintDateTo, bulkPrintPartyId, bulkPrintAllBills]); // eslint-disable-line

  const handleBulkPrintClick = () => {
    if (bulkPrintMergedList.length === 0) return;
    setIsBulkPrinting(true);
    setTimeout(() => {
      handleBulkPrint();
      setIsBulkPrinting(false);
    }, 300);
  };

  const toggleBulkPrintBill = (id) => {
    setBulkPrintSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAllBulkPrintBills = () =>
    setBulkPrintSelectedIds(new Set(bulkPrintAllBills.map((tx) => tx.id)));
  const deselectAllBulkPrintBills = () => setBulkPrintSelectedIds(new Set());

  const bulkPrintFlatList = React.useMemo(
    () => bulkPrintAllBills.filter((tx) => bulkPrintSelectedIds.has(tx.id)),
    [bulkPrintAllBills, bulkPrintSelectedIds],
  );

  const bulkPrintMergedList = React.useMemo(() => {
    const groupKey = (tx) => `${tx.partyId}|${tx.date}`;
    const groups = {};
    bulkPrintFlatList.forEach((tx) => {
      const key = groupKey(tx);
      if (!groups[key]) groups[key] = [];
      groups[key].push(tx);
    });
    return Object.values(groups)
      .map((txs) => {
        const first = txs[0];
        if (txs.length === 1) return { ...first, type: "Sales", id: first.id };
        const mergedItems = txs.flatMap((t) =>
          (t.items || []).map((it) => ({ ...it })),
        );
        const subtotal = txs.reduce((s, t) => s + (t.subtotal ?? 0), 0);
        const taxAmount = txs.reduce((s, t) => s + (t.taxAmount ?? 0), 0);
        const discountAmount = txs.reduce(
          (s, t) => s + (t.discountAmount ?? 0),
          0,
        );
        const totalAmount = txs.reduce((s, t) => s + (t.totalAmount ?? 0), 0);
        const invoiceLabel =
          txs.length > 1
            ? `${first.invoiceNumber} (+${txs.length - 1} more on same day)`
            : first.invoiceNumber;
        return {
          ...first,
          id: `merged-${first.partyId}-${first.date}`,
          type: "Sales",
          invoiceNumber: invoiceLabel,
          items: mergedItems,
          subtotal,
          taxAmount,
          discountAmount,
          totalAmount,
          discountPercent: first.discountPercent ?? 0,
        };
      })
      .sort((a, b) => {
        const nameCmp = (a.partyName || "").localeCompare(b.partyName || "");
        if (nameCmp !== 0) return nameCmp;
        return (a.date || "").localeCompare(b.date || "");
      });
  }, [bulkPrintFlatList]);

  useEffect(() => {
    if (view === "create" && !savingRef.current && !isSaving) {
      if (keepDataOnNewRef.current) {
        keepDataOnNewRef.current = false;
        return;
      }
      const today = new Date().toISOString().split("T")[0];
      setInvoiceNumber(generateInvoiceNumber(today, isSale));
      setSelectedParty(null);
      setInvoiceDate(today);
      const nowT = new Date(); setInvoiceTime(`${String(nowT.getHours()).padStart(2,'0')}:${String(nowT.getMinutes()).padStart(2,'0')}`);
      setDescription("");
      setNoGST(false);
      setDiscountPercent("");
      setDiscountType("percent");
      setAdvance("");
      setPaymentMode("Cash");
      setSplitCash("");
      setSplitBank("");
      setSplitBankMode("Bank");
      setDueDate("");
      setTaxMode("inclusive");
      setRoundOff(config.billPrintOptions?.autoRoundOff ? 1 : 0);
      setEditId(null);
      setSelectedBilledBy(ownerName);

      // If a barcode scan triggered this view switch, populate that item instead of an empty row
      const pending = pendingScannedItemRef.current;
      pendingScannedItemRef.current = null;
      if (pending) {
        const { found, isSaleAtTime } = pending;
        const price = Number(isSaleAtTime ? (found.salePrice ?? found.price) : (found.purchasePrice ?? found.price)) || 0;
        const taxRate = Number(found.taxRate) || 0;
        const discountPercent = isSaleAtTime && Number(found.discount) ? Number(found.discount) : "";
        setItems([{ itemId: found.id, name: found.name, qty: 1, price: price || "", taxRate, discountPercent, total: price * (1 - (Number(discountPercent) || 0) / 100) * (1 + taxRate / 100) }]);
      } else {
        setItems([{ itemId: "", name: "", qty: 1, price: "", taxRate: 0, discountPercent: "", total: 0 }]);
      }
    }
  }, [view, isSale, isSaving]); // eslint-disable-line

  // Reset the form when the user navigates back to this tab while in "create" mode.
  // Pages are CSS keep-alive (not unmounted), so view-change alone won't fire.
  useEffect(() => {
    const prevId = prevActiveTabIdRef.current;
    prevActiveTabIdRef.current = activeTabId;
    if (!activeTabId || prevId === activeTabId) return;
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab?.path !== thisPath) return;
    // User just switched TO this tab — if we're sitting on the create form, reset it
    if (viewRef.current === "create" && !savingRef.current) {
      const today = new Date().toISOString().split("T")[0];
      setInvoiceNumber(generateInvoiceNumber(today, isSale));
      setSelectedParty(null);
      setInvoiceDate(today);
      const nowT = new Date();
      setInvoiceTime(`${String(nowT.getHours()).padStart(2, "0")}:${String(nowT.getMinutes()).padStart(2, "0")}`);
      setDescription("");
      setNoGST(false);
      setDiscountPercent("");
      setDiscountType("percent");
      setAdvance("");
      setPaymentMode("Cash");
      setSplitCash("");
      setSplitBank("");
      setSplitBankMode("Bank");
      setDueDate("");
      setTaxMode("inclusive");
      setRoundOff(config.billPrintOptions?.autoRoundOff ? 1 : 0);
      setEditId(null);
      setSelectedBilledBy(ownerName);
      setItems([{ itemId: "", name: "", qty: 1, price: "", taxRate: 0, discountPercent: "", total: 0 }]);
    }
  }, [activeTabId]); // eslint-disable-line

  useEffect(() => {
    if (view === "create" && !savingRef.current && !isSaving)
      setInvoiceNumber(generateInvoiceNumber(invoiceDate, isSale));
  }, [invoiceDate, isSale]); // eslint-disable-line

  useEffect(() => {
    setPage(0);
  }, [filters]);

  // Keep viewRef in sync so keyboard handler never has a stale closure
  useEffect(() => { viewRef.current = view; }, [view]);

  useEffect(() => {
    const handleKeyDown = (e) => {
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
    const onQuickNew = (e) => {
      if (e.detail?.path === thisPath && e.detail?.intent === "createNew") setView("create");
    };
    window.addEventListener("dashboard-quick-new", onQuickNew);
    return () => window.removeEventListener("dashboard-quick-new", onQuickNew);
  }, []); // eslint-disable-line

  const addItemRow = () =>
    setItems([
      ...items,
      {
        itemId: "",
        name: "",
        qty: 1,
        price: "",
        taxRate: 0,
        discountPercent: "",
        total: 0,
      },
    ]);
  const removeItemRow = (index) => {
    const n = items.filter((_, i) => i !== index);
    setItems(
      n.length
        ? n
        : [
            {
              itemId: "",
              name: "",
              qty: 1,
              price: "",
              taxRate: 0,
              discountPercent: "",
              total: 0,
            },
          ],
    );
  };

  const updateItemRow = (index, field, value) => {
    const newItems = [...items];
    let item = { ...newItems[index], [field]: value };
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
        // Apply the item's default discount on sales (kept off for purchases).
        item.discountPercent = isSale && Number(selected.discount) ? Number(selected.discount) : "";
        // Auto-fill the default supplier when creating a purchase and no party is selected yet
        if (!isSale && selected.defaultPartyId && !selectedParty) {
          const supplier = getItems("parties").find(
            (p) => p.id === selected.defaultPartyId && p.businessId === currentBusiness?.id,
          );
          if (supplier) setSelectedParty(supplier);
        }
      }
    }
    const qty = Number(item.qty) || 0;
    const price = Number(item.price) || 0;
    const discountPercent = Number(item.discountPercent) || 0;
    const taxRate = Number(item.taxRate) || 0;
    if (taxMode === "inclusive") {
      item.total = qty * price * (1 - discountPercent / 100);
    } else {
      item.total =
        qty * price * (1 - discountPercent / 100) * (1 + taxRate / 100);
    }
    newItems[index] = item;
    setItems(newItems);
  };

  const getBasePrice = (item) => {
    const price = Number(item.price) || 0;
    const taxRate = Number(item.taxRate) || 0;
    return taxMode === "inclusive" ? price / (1 + taxRate / 100) : price;
  };
  const calculateSubtotal = () =>
    items.reduce((sum, item) => {
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
      const qty = Number(item.qty) || 0;
      const discPct = Number(item.discountPercent) || 0;
      const taxRate = Number(item.taxRate) || 0;
      const base = getBasePrice(item);
      return sum + qty * base * (1 - discPct / 100) * (taxRate / 100);
    }, 0);
  };
  const calculateTotal = () =>
    calculateSubtotal() - calculateDiscountAmount() + calculateTax();
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
  const calculateFinalTotal = () => calculateTotal() + calculateRoundOff();

  const handleSave = async (options = {}) => {
    const { saveAndCreateNew = false, saveAndPrint = false } = options;
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
      const currentIsSale = isSale;
      const currentBusinessId = currentBusiness?.id;
      const currentAdvance =
        currentIsSale && !editId ? Number(advance) || 0 : 0;
      const currentPaymentMode = paymentMode || "Cash";
      const currentSplitCash = Number(splitCash) || 0;
      const currentSplitBank = Number(splitBank) || 0;
      const currentSplitBankMode = splitBankMode || "Bank";
      const currentDueDate = dueDate;
      const currentTaxMode = taxMode;
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
        return currentTaxMode === "inclusive"
          ? price / (1 + taxRate / 100)
          : price;
      };
      const finalSubtotal = currentItems.reduce((sum, item) => {
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
            const qty = Number(item.qty) || 0;
            const discPct = Number(item.discountPercent) || 0;
            const taxRate = Number(item.taxRate) || 0;
            const base = getBasePriceFinal(item);
            return sum + qty * base * (1 - discPct / 100) * (taxRate / 100);
          }, 0);
      const finalTotalAmount =
        finalSubtotal - finalDiscountAmount + finalTaxAmount;
      const finalRoundOffAmount = (() => {
        if (roundOff === 0) return 0;
        const buildUpSeq = (val) => { const seq = []; let c = val; for (const s of [1,10,100,1000,10000]) { const r = Math.ceil(c/s)*s; if (r>c){seq.push(r);c=r;if(seq.length>=3)break;} } return seq; };
        const buildDnSeq = (val) => { const seq = []; let c = val; for (const s of [1,10,100,1000,10000]) { const r = Math.floor(c/s)*s; if (r<c){seq.push(r);c=r;if(seq.length>=3)break;} } return seq; };
        if (roundOff > 0) { const t = buildUpSeq(finalTotalAmount)[roundOff-1]; return t != null ? t - finalTotalAmount : 0; }
        const t = buildDnSeq(finalTotalAmount)[Math.abs(roundOff)-1]; return t != null ? t - finalTotalAmount : 0;
      })();
      const finalGrandTotal = finalTotalAmount + finalRoundOffAmount;
      const cleanedItems = currentItems
        .filter(
          (i) =>
            (i.itemId || i.name?.trim()) &&
            Number(i.qty) > 0 &&
            Number(i.price) >= 0,
        )
        .map((item) => ({
          ...item,
          qty: Number(item.qty) || 0,
          price: Number(item.price) || 0,
          taxRate: currentNoGST ? 0 : (Number(item.taxRate) || 0),
          discountPercent: Number(item.discountPercent) || 0,
        }));
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

      const bizState = currentBusiness?.state || '';
      const partyState = currentSelectedParty?.state || '';
      const isInterState = !!(bizState && partyState && bizState !== partyState);
      const transactionData = {
        businessId: currentBusinessId,
        partyId: currentSelectedParty?.id || "",
        partyName:
          currentSelectedParty?.name ||
          (currentIsSale ? "Cash & Carry" : "Cash Purchase"),
        partyGstNumber: currentSelectedParty?.gstNumber || "",
        partyAddress: currentSelectedParty?.address || "",
        partyCity: currentSelectedParty?.city || "",
        partyState,
        partyPhone: currentSelectedParty?.phone || "",
        placeOfSupply: partyState || bizState,
        isInterState,
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
        roundOffAmount: finalRoundOffAmount || 0,
        totalAmount: finalGrandTotal,
        advance: currentAdvance,
        dueDate: currentDueDate || "",
        taxMode: currentTaxMode,
        paymentMode: currentPaymentMode,
        ...(currentPaymentMode === "Split" && {
          paymentSplit: { cash: currentSplitCash, bank: currentSplitBank, bankMode: currentSplitBankMode },
        }),
        billedBy: selectedBilledBy || ownerName,
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
          const oldBalanceRollback = currentIsSale
            ? -oldTx.totalAmount
            : oldTx.totalAmount;
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
            // On edits: restore the qty that was previously deducted for this item
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
            // Roll back the party balance update that already happened above
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

      const tName = currentIsSale ? "sales" : "purchases";
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
      }

      const balanceChange = currentIsSale
        ? transactionData.totalAmount
        : -transactionData.totalAmount;
      const newParty = currentSelectedParty?.id
        ? currentParties.find((p) => p.id === currentSelectedParty.id)
        : null;
      if (newParty) {
        const isEditSameParty =
          currentEditId &&
          editedOldTx &&
          editedOldParty &&
          editedOldParty.id === currentSelectedParty.id;
        const newBalance = isEditSameParty
          ? editedOldParty.balance +
            editedOldBalanceRollback +
            balanceChange -
            currentAdvance
          : newParty.balance + balanceChange - currentAdvance;
        await updateItem("parties", currentSelectedParty.id, {
          balance: newBalance,
        });
      }

      if (currentIsSale && !currentEditId && currentAdvance > 0 && currentSelectedParty?.id) {
        await addItem("payments", {
          businessId: currentBusinessId,
          partyId: currentSelectedParty.id,
          partyName: currentSelectedParty.name || "Unknown",
          type: "PaymentIn",
          totalAmount: currentAdvance,
          date: currentInvoiceDate,
          paymentMode: "Cash",
          referenceNo: `ADV-${currentInvoiceNumber.trim()}`,
          notes: `Advance received for invoice ${currentInvoiceNumber.trim()}`,
        });
      }

      // For split-payment POS / cash-and-carry sales, record each portion as a PaymentIn.
      // Party-linked sales use the party balance flow instead, so split is a UI-only hint there.
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

      if (currentEditId && editedOldTx) {
        // Compute net stock delta: rollback old items + apply new items in one pass.
        // Using a snapshot (currentStockItems) is safe because each itemId is only
        // touched once — no double-counting from sequential reads of stale state.
        const stockDeltas = {};
        for (const item of editedOldTx.items) {
          if (item.itemId) {
            const q = Number(item.qty) || 0;
            stockDeltas[item.itemId] =
              (stockDeltas[item.itemId] || 0) + (currentIsSale ? q : -q);
          }
        }
        for (const item of transactionData.items) {
          if (item.itemId) {
            const q = Number(item.qty) || 0;
            stockDeltas[item.itemId] =
              (stockDeltas[item.itemId] || 0) + (currentIsSale ? -q : q);
          }
        }
        for (const [itemId, delta] of Object.entries(stockDeltas)) {
          if (delta !== 0) {
            // Object.entries converts keys to strings; match by string comparison
            // then use stockItem.id (original type) for the updateItem call.
            const stockItem = currentStockItems.find((i) => String(i.id) === itemId);
            if (stockItem)
              await updateItem("items", stockItem.id, {
                stock: stockItem.stock + delta,
              });
          }
        }
      } else {
        for (const item of transactionData.items) {
          if (item.itemId) {
            const q = Number(item.qty) || 0;
            const stockItem = currentStockItems.find((i) => i.id === item.itemId);
            if (stockItem)
              await updateItem("items", item.itemId, {
                stock: stockItem.stock + (currentIsSale ? -q : q),
              });
          }
        }
      }

      if (saveAndCreateNew) {
        // Increment serial directly from current number — generateInvoiceNumber reads
        // getItems which hasn't flushed the just-saved item to React state yet
        const parts = currentInvoiceNumber.trim().split("-");
        const serial = parseInt(parts[parts.length - 1], 10) || 0;
        parts[parts.length - 1] = String(serial + 1).padStart(4, "0");
        keepDataOnNewRef.current = true;
        setInvoiceNumber(parts.join("-"));
        setSelectedParty(null);
        setEditId(null);
        setView("create");
      } else if (saveAndPrint) {
        triggerPrint(transactionData);
        setAdvance(""); setPaymentMode("Cash"); setSplitCash(""); setSplitBank(""); setSplitBankMode("Bank");
        setView("list");
        setEditId(null);
      } else {
        setAdvance(""); setPaymentMode("Cash"); setSplitCash(""); setSplitBank(""); setSplitBankMode("Bank");
        setView("list");
        setEditId(null);
        // Prompt to send to customer if it's a sale and party has contact info
        if (currentIsSale && saved) {
          const savedParty = getItems('parties').find(p => p.id === (saved.partyId || transactionData.partyId));
          if (savedParty?.phone || savedParty?.email) {
            setSendTx(saved || transactionData);
            setSendParty(savedParty);
            setSendOpen(true);
          }
        }
      }
    } catch (error) {
      console.error("Error saving transaction:", error);
      await showAlert({ title: "Save error", message: "An error occurred while saving. Please try again.", variant: "danger" });
    } finally {
      savingRef.current = false;
      setIsSaving(false);
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
      if (party)
        updateItem("parties", tx.partyId, {
          balance: party.balance + (isSale ? -tx.totalAmount : tx.totalAmount),
        });
      for (const item of tx.items) {
        if (item.itemId) {
          const q = Number(item.qty) || 0;
          const stockItem = getItems("items").find((i) => i.id === item.itemId);
          if (stockItem)
            updateItem("items", item.itemId, {
              stock: stockItem.stock + (isSale ? q : -q),
            });
        }
      }
      deleteItem(isSale ? "sales" : "purchases", tx.id);
      // Clear the side preview if it was showing the deleted record.
      setSelectedTx((cur) => (cur?.id === tx.id ? null : cur));
    } catch (error) {
      console.error("Delete failed:", error);
      await showAlert({ title: "Delete failed", message: "Error deleting record: " + error.message, variant: "danger" });
    }
  };

  const startEdit = (tx) => {
    setEditId(tx.id);
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
    setDiscountType(tx.discountType || "percent");
    setDiscountPercent(tx.discountType === "amount" ? (tx.discountValue ?? tx.discountAmount ?? 0) : (tx.discountPercent ?? 0));
    setAdvance(tx.advance ? String(tx.advance) : "");
    setPaymentMode(tx.paymentMode || "Cash");
    setSplitCash(tx.paymentSplit?.cash ? String(tx.paymentSplit.cash) : "");
    setSplitBank(tx.paymentSplit?.bank ? String(tx.paymentSplit.bank) : "");
    setSplitBankMode(tx.paymentSplit?.bankMode || "Bank");
    setDueDate(tx.dueDate || "");
    setTaxMode(tx.taxMode || "inclusive");
    setView("edit");
  };

  useEffect(() => {
    if (!printTrigger) return;
    handlePrint();
  }, [printTrigger]); // eslint-disable-line

  const triggerPrint = (tx) => {
    setPrintingTx(tx);
    setPrintTrigger((t) => t + 1);
  };

  const openSendDialog = (tx) => {
    const party = getItems('parties').find(p => p.id === tx.partyId) || null;
    setSendTx(tx);
    setSendParty(party);
    setSendOpen(true);
  };

  const handleShare = (tx) => openSendDialog(tx);

  const downloadInvoicePDF = async () => {
    if (!pdfRef.current || !previewTx) return;
    setPdfLoading(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const el = pdfRef.current;
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const isNarrow = paperSize === 'Thermal 80mm' || paperSize === 'Thermal 58mm';
      let pdfWidthMm, pdfHeightMm;
      if (paperSize === 'Thermal 58mm') { pdfWidthMm = 58; }
      else if (paperSize === 'Thermal 80mm') { pdfWidthMm = 80; }
      else if (paperSize === 'A5') { pdfWidthMm = 148; }
      else if (paperSize === 'Letter') { pdfWidthMm = 216; }
      else if (paperSize === 'Legal') { pdfWidthMm = 216; }
      else { pdfWidthMm = 210; }
      pdfHeightMm = (canvas.height * pdfWidthMm) / canvas.width;
      const pdf = new jsPDF({
        orientation: isNarrow ? 'portrait' : 'portrait',
        unit: 'mm',
        format: isNarrow ? [pdfWidthMm, pdfHeightMm] : (paperSize === 'A5' ? 'a5' : paperSize === 'Legal' ? 'legal' : paperSize === 'Letter' ? 'letter' : 'a4'),
      });
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidthMm, pdfHeightMm);
      pdf.save(`${previewTx.invoiceNumber || 'invoice'}.pdf`);
    } catch (err) {
      console.error('PDF generation failed', err);
    } finally {
      setPdfLoading(false);
    }
  };

  const captureInvoiceCanvas = async () => {
    const { default: html2canvas } = await import('html2canvas');
    return html2canvas(pdfRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
  };

  const shareAsPDF = async () => {
    if (!pdfRef.current || !previewTx || _shareInFlight.current) return;
    _shareInFlight.current = true;
    setShareLoading(true);
    try {
      const [canvas, { jsPDF }] = await Promise.all([
        captureInvoiceCanvas(),
        import('jspdf').then(m => ({ jsPDF: m.jsPDF })),
      ]);
      const imgData = canvas.toDataURL('image/png');
      const isNarrow = paperSize === 'Thermal 80mm' || paperSize === 'Thermal 58mm';
      let pdfWidthMm = paperSize === 'Thermal 58mm' ? 58 : paperSize === 'Thermal 80mm' ? 80 : paperSize === 'A5' ? 148 : 210;
      const pdfHeightMm = (canvas.height * pdfWidthMm) / canvas.width;
      const pdf = new jsPDF({
        unit: 'mm',
        format: isNarrow ? [pdfWidthMm, pdfHeightMm] : (paperSize === 'A5' ? 'a5' : paperSize === 'Legal' ? 'legal' : paperSize === 'Letter' ? 'letter' : 'a4'),
      });
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidthMm, pdfHeightMm);
      const fileName = `${previewTx.invoiceNumber || 'invoice'}.pdf`;
      const pdfBlob = pdf.output('blob');
      const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: fileName });
      } else {
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a'); a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) { console.error('Share as PDF failed', err); }
    finally { setShareLoading(false); _shareInFlight.current = false; }
  };

  const shareAsImage = async () => {
    if (!pdfRef.current || !previewTx || _shareInFlight.current) return;
    _shareInFlight.current = true;
    setShareLoading(true);
    try {
      const canvas = await captureInvoiceCanvas();
      await new Promise((resolve, reject) => {
        canvas.toBlob(async (blob) => {
          if (!blob) { reject(new Error('No blob')); return; }
          const fileName = `${previewTx.invoiceNumber || 'invoice'}.png`;
          const file = new File([blob], fileName, { type: 'image/png' });
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], title: fileName });
          } else {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = fileName;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }
          resolve();
        }, 'image/png');
      });
    } catch (err) { console.error('Share as Image failed', err); }
    finally { setShareLoading(false); _shareInFlight.current = false; }
  };

  const shareAsBoth = async () => {
    if (!pdfRef.current || !previewTx || _shareInFlight.current) return;
    _shareInFlight.current = true;
    setShareLoading(true);
    try {
      const [canvas, { jsPDF }] = await Promise.all([
        captureInvoiceCanvas(),
        import('jspdf').then(m => ({ jsPDF: m.jsPDF })),
      ]);
      const imgData = canvas.toDataURL('image/png');
      const baseName = previewTx.invoiceNumber || 'invoice';
      const isNarrow = paperSize === 'Thermal 80mm' || paperSize === 'Thermal 58mm';
      let pdfWidthMm = paperSize === 'Thermal 58mm' ? 58 : paperSize === 'Thermal 80mm' ? 80 : paperSize === 'A5' ? 148 : 210;
      const pdfHeightMm = (canvas.height * pdfWidthMm) / canvas.width;
      const pdf = new jsPDF({
        unit: 'mm',
        format: isNarrow ? [pdfWidthMm, pdfHeightMm] : (paperSize === 'A5' ? 'a5' : paperSize === 'Legal' ? 'legal' : paperSize === 'Letter' ? 'letter' : 'a4'),
      });
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidthMm, pdfHeightMm);
      const pdfBlob = pdf.output('blob');
      const pdfFile = new File([pdfBlob], `${baseName}.pdf`, { type: 'application/pdf' });
      const imgBlob = await new Promise(res => canvas.toBlob(res, 'image/png'));
      const imgFile = new File([imgBlob], `${baseName}.png`, { type: 'image/png' });
      const files = [pdfFile, imgFile];
      if (navigator.canShare?.({ files })) {
        await navigator.share({ files, title: baseName });
      } else {
        for (const f of files) {
          const url = URL.createObjectURL(f);
          const a = document.createElement('a'); a.href = url; a.download = f.name;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      }
    } catch (err) { console.error('Share both failed', err); }
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
    setPfCustomers((prev) =>
      prev.map((r) => (r._key === key ? { ...r, [field]: value } : r)),
    );
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

  const openQuickAddParty = (inputValue, callback) => {
    quickAddPartyCallbackRef.current = callback;
    setQuickAddParty({
      open: true,
      name: inputValue || "",
      phone: "",
      balance: "",
    });
  };
  const handleQuickSaveParty = async () => {
    const name = quickAddParty.name.trim();
    if (!name) return;
    setQuickAddPartyLoading(true);
    try {
      const newParty = {
        id: Date.now(),
        businessId: currentBusiness.id,
        name,
        type: isSale ? "Customer" : "Vendor",
        phone: quickAddParty.phone || "",
        gstNumber: "",
        address: "",
        balance: Number(quickAddParty.balance) || 0,
      };
      await addItem("parties", newParty);
      if (quickAddPartyCallbackRef.current)
        quickAddPartyCallbackRef.current(newParty);
      setQuickAddParty({ open: false, name: "", phone: "", balance: "" });
    } finally {
      setQuickAddPartyLoading(false);
    }
  };

  const openQuickAddItem = (inputValue, callback) => {
    itemDialogCallbackRef.current = callback;
    setItemDialog({ open: true, name: inputValue || "" });
  };

  /* ── Quick-add dialogs ── */
  const quickAddDialogs = (
    <>
      <Dialog
        open={quickAddParty.open}
        onClose={() =>
          !quickAddPartyLoading &&
          setQuickAddParty((s) => ({ ...s, open: false }))
        }
        maxWidth="xs"
        fullWidth
        fullScreen={isMobile}
        PaperProps={{
          sx: {
            borderRadius: isMobile ? 0 : tokens.radius.xl,
            boxShadow: "0 24px 64px rgba(0,0,0,0.15)",
          },
        }}
      >
        <DialogTitle
          sx={{ fontWeight: 800, pb: 0.5, pt: 2.5, fontSize: "1.1rem" }}
        >
          Add New {isSale ? "Customer" : "Vendor"}
        </DialogTitle>
        <DialogContent>
          <Box
            sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1.5 }}
          >
            <TextField
              label="Name *"
              value={quickAddParty.name}
              autoFocus
              fullWidth
              size="small"
              onChange={(e) =>
                setQuickAddParty((s) => ({ ...s, name: e.target.value }))
              }
              onKeyDown={(e) => e.key === "Enter" && handleQuickSaveParty()}
              sx={{
                "& .MuiOutlinedInput-root": { borderRadius: tokens.radius.sm },
              }}
            />
            <TextField
              label="Phone"
              value={quickAddParty.phone}
              fullWidth
              size="small"
              onChange={(e) =>
                setQuickAddParty((s) => ({ ...s, phone: e.target.value }))
              }
              sx={{
                "& .MuiOutlinedInput-root": { borderRadius: tokens.radius.sm },
              }}
            />
            <TextField
              label="Opening Balance (₹)"
              type="number"
              value={quickAddParty.balance}
              fullWidth
              size="small"
              placeholder="0"
              onChange={(e) =>
                setQuickAddParty((s) => ({ ...s, balance: e.target.value }))
              }
              sx={{
                "& .MuiOutlinedInput-root": { borderRadius: tokens.radius.sm },
              }}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button
            onClick={() => setQuickAddParty((s) => ({ ...s, open: false }))}
            disabled={quickAddPartyLoading}
            sx={{ borderRadius: tokens.radius.sm }}
          >
            Cancel
          </Button>
          <GradientButton
            tokens={tokens}
            onClick={handleQuickSaveParty}
            disabled={quickAddPartyLoading || !quickAddParty.name.trim()}
            size="medium"
          >
            {quickAddPartyLoading ? "Creating…" : "Create & Select"}
          </GradientButton>
        </DialogActions>
      </Dialog>

      <ItemFormDialog
        open={itemDialog.open}
        initialName={itemDialog.name}
        onClose={() => setItemDialog({ open: false, name: "" })}
        onSaved={(newItem) => {
          if (itemDialogCallbackRef.current) itemDialogCallbackRef.current(newItem);
          itemDialogCallbackRef.current = null;
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
          <Box sx={{ maxWidth: 1050, mx: "auto", pb: 4 }}>

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
                  <Grid size={{ xs: 12, sm: 7 }}>
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
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <TextField fullWidth size="small" type="date" label="Invoice Date" value={pfDate} onChange={(e) => setPfDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} sx={inputSx} />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 2 }} sx={{ display: "flex", alignItems: "center" }}>
                    <FormControlLabel
                      control={<Switch size="small" checked={pfNoGST} onChange={(e) => setPfNoGST(e.target.checked)} />}
                      label={<Typography variant="body2" sx={{ fontWeight: 600 }}>No GST</Typography>}
                      sx={{ m: 0 }}
                    />
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
                  <TableHead>
                    <TableRow>
                      {["#", "Customer *", "Qty", "Rate (₹)", "Disc %", "Amount", ""].map((h, i) => (
                        <TableCell
                          key={i}
                          align={i >= 2 && i <= 4 ? "center" : i === 5 ? "right" : "left"}
                          sx={{
                            fontWeight: 700, fontSize: "0.72rem", textTransform: "uppercase",
                            letterSpacing: "0.06em", color: "text.secondary",
                            pl: i === 0 ? 3 : undefined, pr: i === 6 ? 1 : undefined,
                            width: [36, undefined, 100, 140, 90, 130, 44][i],
                            borderBottom: "2px solid", borderColor: "divider",
                            bgcolor: "rgba(0,0,0,0.018)", py: 1.25,
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
                              "&:hover": { bgcolor: tokens.primarySoft },
                              ...(isValid && { bgcolor: alpha(tokens.success, 0.025) }),
                              transition: "background 0.1s",
                            }}
                          >
                            <TableCell sx={{ pl: 3, color: "text.disabled", fontWeight: 700, fontSize: "0.78rem" }}>
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
                                onChange={(e) => { if (e.target.value === "") { updatePfCustomer(row._key, "qty", ""); return; } const n = parseFloat(e.target.value); updatePfCustomer(row._key, "qty", isNaN(n) ? "" : Math.round(n * 1000) / 1000); }}
                                onFocus={(e) => e.target.select()}
                                slotProps={{ input: { min: 0, step: 1, style: { textAlign: "center" } } }}
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

              {/* Table footer: add row + running total */}
              <Box sx={{ px: 2.5, py: 1.75, display: "flex", alignItems: "center", gap: 2, borderTop: "1px solid rgba(0,0,0,0.06)", bgcolor: "rgba(0,0,0,0.012)" }}>
                <Button
                  startIcon={<Plus size={15} />}
                  variant="outlined"
                  size="small"
                  onClick={addPfCustomer}
                  sx={{ fontWeight: 700, borderRadius: tokens.radius.sm, textTransform: "none", borderColor: tokens.primaryBorder, color: tokens.primary, "&:hover": { bgcolor: tokens.primarySoft } }}
                >
                  Add Customer Row
                </Button>
                <Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 2 }}>
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
    // Hide the per-row GST column when the whole invoice is tax-free — i.e. the
    // "No GST" toggle is on, or every row's GST rate is 0 (items created with 0 GST).
    const showGstColumn = !noGST && items.some((it) => Number(it.taxRate) > 0);
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
          </Box>

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
              {/* Card 1: Invoice Details */}
              <EnhancedCard accent tokens={tokens}>
                <Box sx={{ px: 2.5, pt: 2, pb: 1 }}>
                  <SectionLabel icon={FileText} tokens={tokens}>
                    {isSale ? "Sales Invoice Details" : "Purchase Bill Details"}
                  </SectionLabel>
                </Box>
                <CardContent sx={{ pt: 1, pb: 2, px: 2.5 }}>
                  <Grid container spacing={2}>
                    <Grid size={12}>
                      <PartySelect
                        options={parties}
                        value={selectedParty}
                        onChange={(v) => setSelectedParty(v)}
                        onAddNew={(inputValue) =>
                          openQuickAddParty(inputValue, (p) => setSelectedParty(p))
                        }
                        label={isSale ? "Customer" : "Vendor"}
                        placeholder={`Search ${isSale ? "customer" : "vendor"}… (optional — Cash & Carry)`}
                        sx={inputSx}
                      />
                      {!selectedParty && (
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.75,
                            mt: 0.75,
                          }}
                        >
                          <Chip
                            size="small"
                            label="Cash & Carry"
                            sx={{
                              fontWeight: 700,
                              fontSize: "0.7rem",
                              bgcolor: tokens.successSoft,
                              color: "success.dark",
                              border: "1px solid rgba(16,185,129,0.25)",
                              height: 20,
                            }}
                          />
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ fontSize: "0.7rem" }}
                          >
                            No {isSale ? "customer" : "vendor"} selected — will save as{" "}
                            {isSale ? "Cash & Carry" : "Cash Purchase"}
                          </Typography>
                        </Box>
                      )}
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
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
                    <Grid size={{ xs: 6, sm: 4 }}>
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
                    <Grid size={{ xs: 6, sm: 2 }}>
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
                    <Grid size={{ xs: 12, sm: 3 }}>
                      <TextField
                        fullWidth
                        size="small"
                        type="date"
                        label="Due Date (optional)"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        slotProps={{ inputLabel: { shrink: true } }}
                        sx={inputSx}
                      />
                    </Grid>
                    {salesStaff.length > 0 && (
                      <Grid size={{ xs: 12, sm: 3 }}>
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
                    <Grid
                      size={{ xs: 12, sm: 9 }}
                      sx={{ display: "flex", alignItems: "center", gap: 1.5 }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 700,
                          color: "text.secondary",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Tax Mode:
                      </Typography>
                      <ToggleButtonGroup
                        value={taxMode}
                        exclusive
                        onChange={(_, v) => v && setTaxMode(v)}
                        size="small"
                        sx={{
                          bgcolor: "rgba(0,0,0,0.04)",
                          p: "3px",
                          borderRadius: tokens.radius.sm,
                          "& .MuiToggleButtonGroup-grouped": {
                            border: 0,
                            borderRadius: `${tokens.radius.sm} !important`,
                            mx: 0.25,
                          },
                        }}
                      >
                        <ToggleButton
                          value="exclusive"
                          sx={{
                            textTransform: "none",
                            fontWeight: 600,
                            px: 1.5,
                            py: 0.6,
                            fontSize: "0.78rem",
                            "&.Mui-selected": {
                              bgcolor: "white",
                              boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
                              color: tokens.primary,
                            },
                          }}
                        >
                          Exclusive
                        </ToggleButton>
                        <ToggleButton
                          value="inclusive"
                          sx={{
                            textTransform: "none",
                            fontWeight: 600,
                            px: 1.5,
                            py: 0.6,
                            fontSize: "0.78rem",
                            "&.Mui-selected": {
                              bgcolor: "white",
                              boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
                              color: tokens.primary,
                            },
                          }}
                        >
                          Inclusive
                        </ToggleButton>
                      </ToggleButtonGroup>
                    </Grid>
                  </Grid>
                </CardContent>
              </EnhancedCard>

              {/* Card 2: Items */}
              <EnhancedCard tokens={tokens}>
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
                  {isMobile ? (
                    /* ── Mobile: card-per-item ── */
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25, p: 1.5 }}>
                      {items.map((item, index) => (
                        <Paper
                          key={index}
                          variant="outlined"
                          sx={{
                            p: 1.5,
                            borderRadius: tokens.radius.md,
                            borderColor: "divider",
                            "&:hover": { borderColor: tokens.primaryBorder },
                          }}
                        >
                          {/* Item selector */}
                          <ItemSelect
                            options={stockItems}
                            value={
                              item.itemId
                                ? stockItems.find((i) => i.id === item.itemId) || null
                                : item.name || null
                            }
                            onChange={(v) => {
                              if (typeof v === "string") {
                                const newItems = [...items];
                                newItems[index] = { ...newItems[index], itemId: "", name: v };
                                setItems(newItems);
                                return;
                              }
                              updateItemRow(index, "itemId", v?.id);
                            }}
                            onInputChange={(val) => {
                              if (!item.itemId) {
                                const newItems = [...items];
                                newItems[index] = { ...newItems[index], name: val };
                                setItems(newItems);
                              }
                            }}
                            onAddNew={(inputValue) =>
                              openQuickAddItem(inputValue, (newItem) =>
                                updateItemRow(index, "itemId", newItem.id),
                              )
                            }
                            isSale={isSale}
                            canViewPurchasePrice={canViewPurchasePrice}
                            placeholder="Search or select item…"
                            sx={inputSx}
                          />
                          {/* Qty + Rate row */}
                          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, mt: 1 }}>
                            <TextField
                              type="number"
                              size="small"
                              label="Qty"
                              value={item.qty}
                              onChange={(e) => {
                                if (e.target.value === "") { updateItemRow(index, "qty", ""); return; }
                                const n = parseFloat(e.target.value);
                                updateItemRow(index, "qty", isNaN(n) ? "" : Math.round(n * 1000) / 1000);
                              }}
                              onFocus={(e) => e.target.select()}
                              slotProps={{ input: { min: 0, step: 1 } }}
                              sx={inputSx}
                            />
                            <TextField
                              type="number"
                              size="small"
                              label="Rate (₹)"
                              value={item.price}
                              placeholder="0.00"
                              onChange={(e) => updateItemRow(index, "price", e.target.value)}
                              onFocus={(e) => e.target.select()}
                              slotProps={{
                                input: {
                                  startAdornment: (
                                    <InputAdornment position="start">
                                      <Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 600 }}>₹</Typography>
                                    </InputAdornment>
                                  ),
                                  min: 0,
                                  step: 0.01,
                                },
                              }}
                              sx={inputSx}
                            />
                          </Box>
                          {/* Disc % + GST — equal-width grid so it never overflows */}
                          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, mt: 1 }}>
                            <TextField
                              type="number"
                              size="small"
                              label="Disc %"
                              value={item.discountPercent ?? ""}
                              placeholder="0"
                              onChange={(e) => updateItemRow(index, "discountPercent", e.target.value)}
                              onFocus={(e) => e.target.select()}
                              slotProps={{ input: { min: 0, max: 100, step: 0.5 } }}
                              sx={inputSx}
                            />
                            {formIsInterState ? (
                              <TextField
                                type="number"
                                size="small"
                                label="IGST %"
                                value={item.taxRate ?? ""}
                                placeholder="0"
                                onChange={(e) => updateItemRow(index, "taxRate", e.target.value === "" ? 0 : Number(e.target.value))}
                                onFocus={(e) => e.target.select()}
                                slotProps={{ input: { min: 0, max: 100, step: 0.5, endAdornment: <InputAdornment position="end">%</InputAdornment> } }}
                                sx={inputSx}
                              />
                            ) : (
                              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0.5 }}>
                                <TextField
                                  type="number"
                                  size="small"
                                  label="CGST %"
                                  value={(Number(item.taxRate) || 0) / 2}
                                  onChange={(e) => updateItemRow(index, "taxRate", (Number(e.target.value) || 0) * 2)}
                                  onFocus={(e) => e.target.select()}
                                  slotProps={{ input: { min: 0, max: 50, step: 0.5 } }}
                                  sx={inputSx}
                                />
                                <TextField
                                  type="number"
                                  size="small"
                                  label="SGST %"
                                  value={(Number(item.taxRate) || 0) / 2}
                                  onChange={(e) => updateItemRow(index, "taxRate", (Number(e.target.value) || 0) * 2)}
                                  onFocus={(e) => e.target.select()}
                                  slotProps={{ input: { min: 0, max: 50, step: 0.5 } }}
                                  sx={inputSx}
                                />
                              </Box>
                            )}
                          </Box>
                          {/* Amount + Delete row */}
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}>
                            <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600 }}>
                              Amount
                            </Typography>
                            <Typography variant="body1" sx={{ fontWeight: 800, color: tokens.primary, flex: 1 }}>
                              ₹{(item.total || 0).toFixed(2)}
                            </Typography>
                            <Button
                              size="small"
                              onClick={() => removeItemRow(index)}
                              startIcon={<Trash2 size={15} />}
                              sx={{
                                color: tokens.error,
                                textTransform: "none",
                                fontWeight: 600,
                                "&:hover": { bgcolor: `${tokens.error}12` },
                                borderRadius: tokens.radius.sm,
                              }}
                            >
                              Remove
                            </Button>
                          </Box>
                        </Paper>
                      ))}
                    </Box>
                  ) : (
                    /* ── Desktop: table ── */
                    <TableContainer sx={{ overflowX: "auto" }}>
                      <Table size="small" sx={{ minWidth: 700 }}>
                        <TableHead sx={{ bgcolor: "rgba(0,0,0,0.018)" }}>
                          <TableRow>
                            {[
                              ["Item / Product", { pl: 3, minWidth: 280 }],
                              ["Qty", { width: 90, align: "center" }],
                              ["Rate (₹)", { width: 150, align: "right" }],
                              ["Disc %", { width: 100, align: "center" }],
                              ...(showGstColumn
                                ? [[formIsInterState ? "IGST %" : "CGST / SGST %", { width: 120, align: "center" }]]
                                : []),
                              ["Amount", { width: 130, pr: 3, align: "right" }],
                              ["", { width: 44 }],
                            ].map(([label, style], i) => (
                              <TableCell
                                key={i}
                                align={style.align}
                                sx={{
                                  fontWeight: 700,
                                  fontSize: "0.7rem",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.06em",
                                  color: "text.secondary",
                                  ...style,
                                }}
                              >
                                {label}
                              </TableCell>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {items.map((item, index) => (
                            <TableRow
                              key={index}
                              sx={{
                                "&:hover": { bgcolor: "rgba(79,70,229,0.025)" },
                                transition: "background 0.12s",
                              }}
                            >
                              <TableCell sx={{ pl: 3, py: 1.25 }}>
                                <ItemSelect
                                  options={stockItems}
                                  value={
                                    item.itemId
                                      ? stockItems.find((i) => i.id === item.itemId) || null
                                      : item.name || null
                                  }
                                  onChange={(v) => {
                                    if (typeof v === "string") {
                                      const newItems = [...items];
                                      newItems[index] = { ...newItems[index], itemId: "", name: v };
                                      setItems(newItems);
                                      return;
                                    }
                                    updateItemRow(index, "itemId", v?.id);
                                  }}
                                  onInputChange={(val) => {
                                    if (!item.itemId) {
                                      const newItems = [...items];
                                      newItems[index] = { ...newItems[index], name: val };
                                      setItems(newItems);
                                    }
                                  }}
                                  onAddNew={(inputValue) =>
                                    openQuickAddItem(inputValue, (newItem) =>
                                      updateItemRow(index, "itemId", newItem.id),
                                    )
                                  }
                                  isSale={isSale}
                                  canViewPurchasePrice={canViewPurchasePrice}
                                  placeholder="Search or select item…"
                                  sx={inputSx}
                                />
                              </TableCell>
                              <TableCell align="center" sx={{ py: 1.25 }}>
                                <TextField
                                  type="number"
                                  size="small"
                                  value={item.qty}
                                  onChange={(e) => {
                                    if (e.target.value === "") { updateItemRow(index, "qty", ""); return; }
                                    const n = parseFloat(e.target.value);
                                    updateItemRow(index, "qty", isNaN(n) ? "" : Math.round(n * 1000) / 1000);
                                  }}
                                  onFocus={(e) => e.target.select()}
                                  slotProps={{
                                    input: {
                                      style: { textAlign: "center" },
                                      min: 0,
                                      step: 1,
                                    },
                                  }}
                                  sx={{ width: 74, ...inputSx }}
                                />
                              </TableCell>
                              <TableCell align="right" sx={{ py: 1.25 }}>
                                <TextField
                                  type="number"
                                  size="small"
                                  value={item.price}
                                  placeholder="0.00"
                                  onChange={(e) =>
                                    updateItemRow(index, "price", e.target.value)
                                  }
                                  onFocus={(e) => e.target.select()}
                                  slotProps={{
                                    input: {
                                      startAdornment: (
                                        <InputAdornment position="start">
                                          <Typography
                                            variant="body2"
                                            sx={{
                                              color: "text.secondary",
                                              fontWeight: 600,
                                            }}
                                          >
                                            ₹
                                          </Typography>
                                        </InputAdornment>
                                      ),
                                      style: { textAlign: "right" },
                                      min: 0,
                                      step: 0.01,
                                    },
                                  }}
                                  sx={{ width: 130, ...inputSx }}
                                />
                              </TableCell>
                              <TableCell align="center" sx={{ py: 1.25 }}>
                                <TextField
                                  type="number"
                                  size="small"
                                  value={item.discountPercent ?? ""}
                                  placeholder="0"
                                  onChange={(e) =>
                                    updateItemRow(
                                      index,
                                      "discountPercent",
                                      e.target.value,
                                    )
                                  }
                                  onFocus={(e) => e.target.select()}
                                  slotProps={{
                                    input: {
                                      style: { textAlign: "center" },
                                      min: 0,
                                      max: 100,
                                      step: 0.5,
                                    },
                                  }}
                                  sx={{ width: 84, ...inputSx }}
                                />
                              </TableCell>
                              {showGstColumn && (
                              <TableCell align="center" sx={{ py: 1.25 }}>
                                {formIsInterState ? (
                                  <TextField
                                    type="number"
                                    size="small"
                                    label="IGST %"
                                    value={item.taxRate ?? ""}
                                    placeholder="0"
                                    onChange={(e) => updateItemRow(index, "taxRate", e.target.value === "" ? 0 : Number(e.target.value))}
                                    onFocus={(e) => e.target.select()}
                                    slotProps={{ input: { style: { textAlign: "center" }, min: 0, max: 100, step: 0.5, endAdornment: <InputAdornment position="end">%</InputAdornment> } }}
                                    sx={{ width: 84, ...inputSx }}
                                  />
                                ) : (
                                  <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.3 }}>
                                    <TextField
                                      type="number"
                                      size="small"
                                      label="CGST %"
                                      value={(Number(item.taxRate) || 0) / 2}
                                      onChange={(e) => updateItemRow(index, "taxRate", (Number(e.target.value) || 0) * 2)}
                                      onFocus={(e) => e.target.select()}
                                      slotProps={{ input: { min: 0, max: 50, step: 0.5, style: { textAlign: "center" } } }}
                                      sx={{ width: 84, ...inputSx }}
                                    />
                                    <TextField
                                      type="number"
                                      size="small"
                                      label="SGST %"
                                      value={(Number(item.taxRate) || 0) / 2}
                                      onChange={(e) => updateItemRow(index, "taxRate", (Number(e.target.value) || 0) * 2)}
                                      onFocus={(e) => e.target.select()}
                                      slotProps={{ input: { min: 0, max: 50, step: 0.5, style: { textAlign: "center" } } }}
                                      sx={{ width: 84, ...inputSx }}
                                    />
                                  </Box>
                                )}
                              </TableCell>
                              )}
                              <TableCell align="right" sx={{ pr: 3, py: 1.25 }}>
                                <Typography
                                  variant="body2"
                                  sx={{ fontWeight: 800, color: tokens.primary }}
                                >
                                  ₹{(item.total || 0).toFixed(2)}
                                </Typography>
                              </TableCell>
                              <TableCell sx={{ pr: 1 }}>
                                <IconButton
                                  size="small"
                                  onClick={() => removeItemRow(index)}
                                  sx={{
                                    color: "text.disabled",
                                    "&:hover": {
                                      color: tokens.error,
                                      bgcolor: `${tokens.error}12`,
                                    },
                                    borderRadius: tokens.radius.sm,
                                  }}
                                >
                                  <Trash2 size={15} />
                                </IconButton>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}

                  <Box
                    sx={{
                      px: 2,
                      py: 1.5,
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      flexWrap: "wrap",
                      borderTop: "1px solid rgba(0,0,0,0.06)",
                      bgcolor: "rgba(0,0,0,0.012)",
                    }}
                  >
                    <Button
                      startIcon={<Plus size={16} />}
                      onClick={addItemRow}
                      variant="outlined"
                      size={isMobile ? "medium" : "small"}
                      fullWidth={isMobile}
                      sx={{
                        fontWeight: 700,
                        borderRadius: tokens.radius.sm,
                        borderColor: tokens.primaryBorder,
                        color: tokens.primary,
                        textTransform: "none",
                        "&:hover": {
                          bgcolor: tokens.primarySoft,
                          borderColor: tokens.primary,
                        },
                      }}
                    >
                      Add Item
                    </Button>
                    {barcodeScanEnabled && (
                      <Button
                        startIcon={<ScanLine size={15} />}
                        onClick={() => setScannerOpen(true)}
                        variant="outlined"
                        size={isMobile ? "medium" : "small"}
                        fullWidth={isMobile}
                        sx={{
                          fontWeight: 700,
                          borderRadius: tokens.radius.sm,
                          textTransform: "none",
                        }}
                      >
                        Scan Barcode
                      </Button>
                    )}
                    {!isMobile && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ ml: 0.5 }}
                      >
                        Click a field and type to replace
                      </Typography>
                    )}
                  </Box>

                  <Box
                    sx={{
                      px: 2.5,
                      py: 1.75,
                      borderTop: "1px solid rgba(0,0,0,0.06)",
                    }}
                  >
                    <Grid container spacing={2} alignItems="center">
                      <Grid size={{ xs: 12, sm: 9 }}>
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
                      </Grid>
                      <Grid
                        size={{ xs: 12, sm: 3 }}
                        sx={{ display: "flex", alignItems: "center" }}
                      >
                        <FormControlLabel
                          control={
                            <Switch
                              size="small"
                              checked={noGST}
                              onChange={(e) => setNoGST(e.target.checked)}
                            />
                          }
                          label={
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 600 }}
                            >
                              No GST
                            </Typography>
                          }
                          sx={{ m: 0 }}
                        />
                      </Grid>
                    </Grid>
                  </Box>
                </CardContent>
              </EnhancedCard>
            </Box>

            {/* ── Summary Sidebar ── */}
            <Box sx={{ width: { xs: "100%", lg: 296 }, flexShrink: 0 }}>
              <Box sx={{ position: { lg: "sticky" }, top: { lg: 68 } }}>
                <Card
                  elevation={0}
                  sx={{
                    border: `1.5px solid ${tokens.primaryBorder}`,
                    bgcolor: "rgba(79,70,229,0.025)",
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
                      borderBottom: "1px solid rgba(79,70,229,0.1)",
                    }}
                  >
                    <SectionLabel icon={TrendingUp} tokens={tokens}>
                      Summary
                    </SectionLabel>
                  </Box>
                  <CardContent sx={{ pt: 1.75, pb: 2, px: 2.5 }}>
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
                          : formIsInterState
                          ? [
                              {
                                label: `IGST (${taxMode === "inclusive" ? "Incl." : "Excl."})`,
                                value: `₹${calculateTax().toFixed(2)}`,
                              },
                            ]
                          : [
                              {
                                label: `CGST (${taxMode === "inclusive" ? "Incl." : "Excl."})`,
                                value: `₹${(calculateTax() / 2).toFixed(2)}`,
                              },
                              {
                                label: `SGST (${taxMode === "inclusive" ? "Incl." : "Excl."})`,
                                value: `₹${(calculateTax() / 2).toFixed(2)}`,
                              },
                            ]),
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
                                  fontSize: "0.62rem",
                                  px: 0.6,
                                  py: 0.1,
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

                    {/* Payment mode */}
                    {isSale && view !== "edit" && (
                      <Box sx={{ mb: 1.5, p: 1.5, borderRadius: tokens.radius.md, bgcolor: alpha(tokens.primary, 0.04), border: `1px solid ${alpha(tokens.primary, 0.14)}` }}>
                        <Typography variant="caption" sx={{ fontWeight: 800, color: alpha(tokens.primary, 0.85), textTransform: "uppercase", letterSpacing: "0.06em", fontSize: "0.65rem", display: "block", mb: 1 }}>
                          Payment Mode
                        </Typography>
                        <ToggleButtonGroup exclusive size="small" value={paymentMode} onChange={(_, v) => v && setPaymentMode(v)}
                          sx={{ width: "100%", bgcolor: "white", borderRadius: tokens.radius.sm, p: 0.4, border: `1px solid ${alpha(tokens.primary, 0.14)}`,
                            "& .MuiToggleButtonGroup-grouped": { border: 0, borderRadius: `${tokens.radius.sm} !important`, flex: 1, mx: 0.25 } }}>
                          {["Cash", "Bank", "UPI", "Split"].map((m) => (
                            <ToggleButton key={m} value={m} sx={{ textTransform: "none", fontWeight: 700, py: 0.6, fontSize: "0.78rem",
                              "&.Mui-selected": { bgcolor: tokens.primary, color: "white", "&:hover": { bgcolor: tokens.primary } } }}>
                              {m}
                            </ToggleButton>
                          ))}
                        </ToggleButtonGroup>
                        {paymentMode === "Split" && (
                          <Box sx={{ mt: 1.25, display: "flex", flexDirection: "column", gap: 1 }}>
                            <TextField size="small" fullWidth type="number" label="Cash portion" placeholder="0.00" value={splitCash}
                              onChange={(e) => setSplitCash(e.target.value)} onFocus={(e) => e.target.select()}
                              slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> } }}
                              sx={{ "& .MuiOutlinedInput-root": { bgcolor: "white", borderRadius: tokens.radius.sm } }} />
                            <Box sx={{ display: "flex", gap: 1 }}>
                              <TextField size="small" fullWidth type="number" label={`${splitBankMode} portion`} placeholder="0.00" value={splitBank}
                                onChange={(e) => setSplitBank(e.target.value)} onFocus={(e) => e.target.select()}
                                slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> } }}
                                sx={{ "& .MuiOutlinedInput-root": { bgcolor: "white", borderRadius: tokens.radius.sm } }} />
                              <ToggleButtonGroup exclusive size="small" value={splitBankMode} onChange={(_, v) => v && setSplitBankMode(v)}
                                sx={{ flexShrink: 0, "& .MuiToggleButtonGroup-grouped": { border: "1px solid", borderColor: "divider", borderRadius: `${tokens.radius.sm} !important` } }}>
                                {["Bank", "UPI"].map((m) => (
                                  <ToggleButton key={m} value={m} sx={{ textTransform: "none", fontWeight: 700, py: 0.5, px: 1, fontSize: "0.75rem",
                                    "&.Mui-selected": { bgcolor: tokens.primary, color: "white", "&:hover": { bgcolor: tokens.primary } } }}>
                                    {m}
                                  </ToggleButton>
                                ))}
                              </ToggleButtonGroup>
                            </Box>
                            {(Number(splitCash) + Number(splitBank)) > 0 && (
                              <Box sx={{ display: "flex", justifyContent: "space-between", pt: 0.75, borderTop: `1px dashed ${alpha(tokens.primary, 0.2)}` }}>
                                <Typography variant="caption" color="text.secondary">Total split</Typography>
                                <Typography variant="caption" sx={{ fontWeight: 800, color: (Number(splitCash) + Number(splitBank)) === calculateFinalTotal() ? tokens.success : tokens.error }}>
                                  ₹{(Number(splitCash) + Number(splitBank)).toFixed(2)}
                                  {(Number(splitCash) + Number(splitBank)) !== calculateFinalTotal() && ` / ₹${calculateFinalTotal().toFixed(2)}`}
                                </Typography>
                              </Box>
                            )}
                          </Box>
                        )}
                      </Box>
                    )}

                    {/* Advance — sales only, not for cash & carry */}
                    {isSale && !!selectedParty?.id && (
                      <Box
                        sx={{
                          mb: 1.5,
                          p: 1.5,
                          borderRadius: tokens.radius.md,
                          bgcolor: tokens.successSoft,
                          border: `1px solid rgba(16,185,129,0.2)`,
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
                            Advance Received
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
                          disabled={view === "edit"}
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
                          {view === "edit"
                            ? `Advance of ₹${Number(advance) || 0} was recorded on creation`
                            : "Auto-recorded as payment in"}
                        </Typography>
                        {Number(advance) > 0 && view === "create" && (
                          <Box
                            sx={{
                              display: "flex",
                              justifyContent: "space-between",
                              mt: 1.25,
                              pt: 1.25,
                              borderTop: "1px dashed rgba(16,185,129,0.3)",
                            }}
                          >
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 700, color: tokens.error }}
                            >
                              Balance Due
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
                      disabled={isSaving || !canWrite}
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
                        disabled={isSaving || !canWrite}
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
                      disabled={isSaving || !canWrite}
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

        {/* ── Sticky mobile save bar — always reachable without scrolling ── */}
        {isMobile && (
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
              disabled={isSaving || !canWrite}
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
    ].filter(Boolean).length + (filters.status !== "all" ? 1 : 0);

  const printBusy = pdfLoading || shareLoading;

  return (
    <Box sx={{ maxWidth: selectedTx && !isMobile ? 1500 : 1200, mx: "auto", transition: "max-width 0.25s ease" }}>
      <Backdrop open={printBusy} sx={{ zIndex: 9999, flexDirection: 'column', gap: 2, bgcolor: 'rgba(0,0,0,0.55)' }}>
        <CircularProgress size={48} sx={{ color: 'white' }} />
        <Typography sx={{ color: 'white', fontWeight: 700 }}>{shareLoading ? 'Preparing to share…' : 'Generating PDF…'}</Typography>
      </Backdrop>
      {/* ── Page header ── */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: { xs: "flex-start", sm: "flex-end" },
          flexWrap: "wrap",
          gap: 2,
          mb: 3,
        }}
      >
        <Box>
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

        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Button
            variant="outlined"
            endIcon={<ChevronDown size={15} />}
            size="medium"
            onClick={(e) => setMoreMenuAnchor(e.currentTarget)}
            sx={{
              borderRadius: tokens.radius.md,
              fontWeight: 700,
              textTransform: 'none',
              borderColor: 'divider',
              color: 'text.secondary',
              '&:hover': { borderColor: tokens.primaryBorder, color: tokens.primary, bgcolor: tokens.primarySoft },
            }}
          >
            More
          </Button>
          <Menu
            anchorEl={moreMenuAnchor}
            open={Boolean(moreMenuAnchor)}
            onClose={() => setMoreMenuAnchor(null)}
            PaperProps={{ sx: { borderRadius: tokens.radius.md, minWidth: 180 } }}
          >
            {isSale && (
              <MenuItem onClick={() => { setMoreMenuAnchor(null); setBulkPrintOpen(true); }} disabled={!canWrite}>
                <Printer size={15} style={{ marginRight: 8 }} /> {t('sales.bulkPrint')}
              </MenuItem>
            )}
            <MenuItem onClick={() => { setMoreMenuAnchor(null); exportToExcel(transactions, isSale ? SALE_COLUMNS : PURCHASE_COLUMNS, isSale ? 'sales_export.xlsx' : 'purchases_export.xlsx'); }} disabled={!canWrite}>
              <Download size={15} style={{ marginRight: 8 }} /> Export Excel
            </MenuItem>
            <MenuItem onClick={() => { setMoreMenuAnchor(null); exportToTallyXML({ sales: isSale ? transactions : [], purchases: isSale ? [] : transactions, businessName: currentBusiness?.name, filename: isSale ? 'sales_tally.xml' : 'purchases_tally.xml' }); }} disabled={!canWrite}>
              <FileDown size={15} style={{ marginRight: 8 }} /> Export Tally XML
            </MenuItem>
          </Menu>
          <GradientButton
            tokens={tokens}
            startIcon={isSale ? <Receipt size={17} /> : <ShoppingBasket size={17} />}
            onClick={() => setView('create')}
            disabled={!canWrite}
            size="medium"
            sx={{ px: 2.5, py: 1 }}
          >
            {isSale ? t('sales.newInvoice') : t('sales.newBill')}
          </GradientButton>
        </Box>
      </Box>

      {/* ── Stats Strip ── */}
      {transactions.length > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 2, mb: 2 }}>
          {[
            { label: isSale ? t('sales.totalRevenue') : t('sales.totalSpend'), value: `₹${totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, sub: `${transactions.length} ${isSale ? 'invoice' : 'bill'}${transactions.length !== 1 ? 's' : ''}`, color: tokens.primary, soft: tokens.primarySoft },
            { label: 'This Month', value: `₹${thisMonthTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, sub: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }), color: tokens.success, soft: tokens.successSoft },
            { label: 'Overdue', value: overdueCount, sub: overdueCount === 0 ? 'All up to date' : `${overdueCount} past due`, color: overdueCount > 0 ? tokens.error : tokens.success, soft: overdueCount > 0 ? `${tokens.error}12` : tokens.successSoft },
          ].map(({ label, value, sub, color, soft }) => (
            <Box key={label} sx={{ bgcolor: soft, border: `1px solid ${color}22`, borderRadius: tokens.radius.lg, p: 2, position: 'relative', overflow: 'hidden' }}>
              <Box sx={{ position: 'absolute', top: -12, right: -12, width: 64, height: 64, borderRadius: '50%', bgcolor: `${color}10`, pointerEvents: 'none' }} />
              <Typography variant="caption" sx={{ fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.68rem' }}>{label}</Typography>
              <Typography variant="h6" sx={{ fontWeight: 800, color, mt: 0.25, lineHeight: 1.1 }}>{value}</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>{sub}</Typography>
            </Box>
          ))}
        </Box>
      )}

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
              mb: showFilters ? 2 : 0,
            }}
          >
            <TextField
              fullWidth
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
                onClick={() =>
                  setFilters({
                    dateFrom: "",
                    dateTo: "",
                    partyId: "",
                    minAmount: "",
                    maxAmount: "",
                    status: "all",
                    search: "",
                  })
                }
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
                  label="Status"
                  value={filters.status}
                  onChange={(e) =>
                    setFilters({ ...filters, status: e.target.value })
                  }
                  size="small"
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: tokens.radius.sm,
                    },
                  }}
                >
                  <MenuItem value="all">All</MenuItem>
                  <MenuItem value="completed">Completed</MenuItem>
                  <MenuItem value="pending">Pending</MenuItem>
                </TextField>
              </Grid>
            </Grid>
          )}
        </Box>
      </Card>

      {/* ── Bulk action bar ── */}
      {selectedIds.size >= 2 && (
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap',
          mb: 1.5, px: 2, py: 1.25, borderRadius: tokens.radius.md,
          bgcolor: 'primary.main', color: 'white',
        }}>
          <Typography variant="body2" sx={{ fontWeight: 700, flex: 1 }}>
            {selectedIds.size} invoice{selectedIds.size !== 1 ? 's' : ''} selected
          </Typography>
          <Button
            size="small"
            variant="contained"
            startIcon={<Share2 size={15} />}
            onClick={() => setBulkSendOpen(true)}
            sx={{ bgcolor: 'white', color: 'primary.main', fontWeight: 700, textTransform: 'none', '&:hover': { bgcolor: 'rgba(255,255,255,0.9)' } }}
          >
            Bulk Send
          </Button>
          {isSale && (
            <Button
              size="small"
              variant="contained"
              startIcon={<Printer size={15} />}
              onClick={() => setBulkPrintOpen(true)}
              sx={{ bgcolor: 'white', color: 'primary.main', fontWeight: 700, textTransform: 'none', '&:hover': { bgcolor: 'rgba(255,255,255,0.9)' } }}
            >
              Bulk Print
            </Button>
          )}
          <Button
            size="small"
            variant="outlined"
            onClick={() => setSelectedIds(new Set())}
            sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', textTransform: 'none', '&:hover': { borderColor: 'white', bgcolor: 'rgba(255,255,255,0.1)' } }}
          >
            Clear
          </Button>
        </Box>
      )}
      {selectedIds.size === 1 && (
        <Box sx={{ mb: 1.5, px: 2, py: 1, borderRadius: tokens.radius.md, bgcolor: alpha(tokens.primary, 0.08), color: 'text.secondary' }}>
          <Typography variant="body2">Select at least 2 invoices to enable Bulk Send / Bulk Print</Typography>
        </Box>
      )}

      {/* ── Transactions: card list + side preview (master-detail) ── */}
      <Box
        sx={{
          display: "flex",
          gap: 2,
          alignItems: "stretch",
          // Desktop: bound the region to the viewport so only the list scrolls
          // internally — the header / stats / filters above stay put. The offset
          // clears the app bar, page header, stats strip and filter bar.
          height: { md: "calc(100vh - 300px)" },
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
            // On desktop the list is the master pane; preview takes the rest.
            width: { xs: "100%", md: selectedTx ? 440 : "100%" },
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
              <GradientButton tokens={tokens} onClick={() => setView('create')} size="small" sx={{ mt: 0.5, px: 3 }}>
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
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {selectedIds.size > 0 ? `${selectedIds.size} selected` : `${transactions.length} ${isSale ? 'invoice' : 'bill'}${transactions.length !== 1 ? 's' : ''}`}
                </Typography>
              </Box>

              {/* Scrollable card list */}
              <Box sx={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
              {transactions
                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                .map((tx) => {
                  const overdue = tx.dueDate && new Date(tx.dueDate + 'T00:00:00') < new Date();
                  const isActive = selectedTx?.id === tx.id;
                  return (
                    <Box
                      key={tx.id}
                      onClick={() => setSelectedTx(tx)}
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
                        bgcolor: isActive ? tokens.primarySoft : selectedIds.has(tx.id) ? 'primary.50' : 'transparent',
                        '&:hover': { bgcolor: isActive ? tokens.primarySoft : 'rgba(79,70,229,0.04)' },
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
                            {formatDate(tx.date)}{tx.time ? ` · ${tx.time}` : ''}
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
                            sx={{ fontWeight: 700, fontSize: '0.68rem', height: 20, bgcolor: 'rgba(16,185,129,0.08)', color: 'success.dark', border: '1px solid rgba(16,185,129,0.22)' }} />
                        )}
                        {tx.dueDate && (
                          <Typography variant="caption" sx={{ fontWeight: 700, color: overdue ? tokens.error : 'text.disabled' }}>
                            Due {formatDate(tx.dueDate)}
                          </Typography>
                        )}
                      </Box>

                      {/* Actions */}
                      <Box sx={{ display: 'flex', gap: 0.5, pl: 4 }}>
                        {[
                          { icon: <Edit size={17} />, title: 'Edit', onClick: () => startEdit(tx), color: tokens.primary },
                          ...(isMobile ? [{ icon: <Eye size={17} />, title: 'Preview', onClick: () => { setPreviewTx(tx); setPreviewOpen(true); }, color: tokens.primary }] : []),
                          { icon: <Share2 size={17} />, title: 'Share', onClick: () => handleShare(tx), color: '#25D366' },
                          { icon: <Trash2 size={17} />, title: 'Delete', onClick: () => handleDelete(tx), color: tokens.error },
                        ].map(({ icon, title, onClick, color }) => (
                          <IconButton key={title} size="small"
                            onClick={(e) => { e.stopPropagation(); onClick(); }}
                            sx={{ flex: 1, borderRadius: tokens.radius.sm, color, bgcolor: `${color}10`, '&:hover': { bgcolor: `${color}20` } }}>
                            {icon}
                          </IconButton>
                        ))}
                      </Box>
                    </Box>
                  );
                })}
              </Box>

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
                rowsPerPageOptions={[5, 10, 25, 50]}
                sx={{
                  borderTop: "1px solid rgba(0,0,0,0.06)",
                  flexShrink: 0,
                  "& .MuiTablePagination-select": { borderRadius: tokens.radius.sm },
                  "& .MuiTablePagination-toolbar": { flexWrap: "wrap" },
                }}
              />
            </Box>
          )}
        </Card>

        {/* RIGHT: live preview pane (desktop only, when a row is selected) */}
        {!isMobile && selectedTx && (
          <Card
            elevation={0}
            sx={{
              flex: 1,
              minWidth: 0,
              borderRadius: tokens.radius.lg,
              border: "1px solid rgba(0,0,0,0.07)",
              boxShadow: tokens.shadow.card,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              height: "100%",
              minHeight: 0,
            }}
          >
            {/* Preview header + actions */}
            <Box
              sx={{
                background: `linear-gradient(135deg, ${tokens.primaryDark} 0%, ${tokens.primaryLight} 100%)`,
                px: 2.5,
                py: 1.75,
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                flexShrink: 0,
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="overline" sx={{ color: "rgba(255,255,255,0.72)", fontWeight: 700, fontSize: "0.62rem", letterSpacing: "0.1em", lineHeight: 1 }}>
                  {isSale ? "Invoice Preview" : "Bill Preview"}
                </Typography>
                <Typography variant="h6" sx={{ color: "white", fontWeight: 800, fontSize: "1rem", fontFamily: "monospace", lineHeight: 1.2 }} noWrap>
                  {selectedTx.invoiceNumber}
                </Typography>
              </Box>
              <Tooltip title="Edit">
                <IconButton size="small" onClick={() => startEdit(selectedTx)} sx={{ color: "white", bgcolor: "rgba(255,255,255,0.14)", "&:hover": { bgcolor: "rgba(255,255,255,0.25)" } }}>
                  <Edit size={16} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Share on WhatsApp">
                <IconButton size="small" onClick={() => handleShare(selectedTx)} sx={{ color: "white", bgcolor: "rgba(255,255,255,0.14)", "&:hover": { bgcolor: "rgba(255,255,255,0.25)" } }}>
                  <Share2 size={16} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Print">
                <IconButton size="small" onClick={() => triggerPrint(selectedTx)} sx={{ color: "white", bgcolor: "rgba(255,255,255,0.14)", "&:hover": { bgcolor: "rgba(255,255,255,0.25)" } }}>
                  <Printer size={16} />
                </IconButton>
              </Tooltip>
            </Box>

            {/* Scrollable invoice — auto-scaled to fit the side pane */}
            <Box sx={{ flex: 1, overflow: "auto", bgcolor: "#e8eaed", p: 2 }}>
              <FitPreview>
                <InvoiceTemplate
                  transaction={selectedTx}
                  business={currentBusiness}
                  paperSize={paperSize}
                  printOptions={config.billPrintOptions}
                  partyBalance={parties.find((p) => p.id === selectedTx.partyId)?.balance ?? 0}
                />
              </FitPreview>
            </Box>
          </Card>
        )}
      </Box>


      {/* ── Bulk print dialog ── */}
      {isSale && (
        <Dialog
          open={bulkPrintOpen}
          onClose={() => !isBulkPrinting && setBulkPrintOpen(false)}
          maxWidth="sm"
          fullWidth
          PaperProps={{
            sx: {
              borderRadius: tokens.radius.xl,
              boxShadow: "0 24px 64px rgba(0,0,0,0.15)",
            },
          }}
        >
          <DialogTitle
            sx={{ fontWeight: 800, pt: 2.5, pb: 0.5, fontSize: "1.05rem" }}
          >
            Print Bills by Date Range
          </DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Select a date range, then choose which bills to print. Bills from
              the same customer on the same day are merged.
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label="From date"
                  type="date"
                  value={bulkPrintDateFrom}
                  onChange={(e) => setBulkPrintDateFrom(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: tokens.radius.sm,
                    },
                  }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label="To date"
                  type="date"
                  value={bulkPrintDateTo}
                  onChange={(e) => setBulkPrintDateTo(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: tokens.radius.sm,
                    },
                  }}
                />
              </Grid>
              <Grid size={12}>
                <PartySelect
                  options={parties}
                  value={parties.find((p) => p.id === bulkPrintPartyId) || null}
                  onChange={(v) => setBulkPrintPartyId(v?.id || "")}
                  label="Filter by Customer (optional)"
                />
              </Grid>
              <Grid size={12}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  Print Format
                </Typography>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
                  {[
                    { value: 'A4', label: 'A4' },
                    { value: 'A5', label: 'A5' },
                    { value: 'Thermal 80mm', label: 'Thermal 80mm' },
                    { value: 'Thermal 58mm', label: 'Thermal 58mm' },
                  ].map((opt) => (
                    <Button
                      key={opt.value}
                      size="small"
                      variant={bulkPrintFormat === opt.value ? "contained" : "outlined"}
                      onClick={() => setBulkPrintFormat(opt.value)}
                      sx={{
                        borderRadius: tokens.radius.sm,
                        textTransform: "none",
                        fontWeight: 700,
                        ...(bulkPrintFormat === opt.value
                          ? { background: `linear-gradient(135deg, ${tokens.primary} 0%, ${tokens.primaryDark} 100%)`, boxShadow: `0 2px 8px ${tokens.primaryBorder}` }
                          : { borderColor: tokens.primaryBorder, color: tokens.primary }),
                      }}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </Box>
              </Grid>
              <Grid size={12}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 1,
                    mb: 1,
                  }}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {bulkPrintSelectedIds.size} of {bulkPrintAllBills.length}{" "}
                    bills selected
                  </Typography>
                  <Box sx={{ display: "flex", gap: 0.5 }}>
                    <Button
                      size="small"
                      onClick={selectAllBulkPrintBills}
                      disabled={bulkPrintAllBills.length === 0}
                      sx={{ fontWeight: 700, textTransform: "none" }}
                    >
                      Select all
                    </Button>
                    <Button
                      size="small"
                      onClick={deselectAllBulkPrintBills}
                      disabled={bulkPrintAllBills.length === 0}
                      sx={{ fontWeight: 700, textTransform: "none" }}
                    >
                      Deselect all
                    </Button>
                  </Box>
                </Box>
                {bulkPrintAllBills.length === 0 ? (
                  <Box sx={{ py: 3, textAlign: "center" }}>
                    <Typography variant="body2" color="text.secondary">
                      No bills in selected range.
                    </Typography>
                  </Box>
                ) : (
                  <List
                    dense
                    sx={{
                      border: "1px solid rgba(0,0,0,0.08)",
                      borderRadius: tokens.radius.md,
                      maxHeight: 280,
                      overflow: "auto",
                    }}
                  >
                    {bulkPrintQueue.map((group) => (
                      <React.Fragment key={group.partyId}>
                        <ListItem
                          sx={{ py: 0.75, bgcolor: tokens.primarySoft }}
                        >
                          <ListItemText
                            primary={group.partyName || "Unknown"}
                            primaryTypographyProps={{
                              fontWeight: 700,
                              variant: "body2",
                              color: tokens.primary,
                            }}
                          />
                        </ListItem>
                        {group.transactions.map((tx) => (
                          <ListItem
                            key={tx.id}
                            dense
                            secondaryAction={
                              <Checkbox
                                edge="end"
                                checked={bulkPrintSelectedIds.has(tx.id)}
                                onChange={() => toggleBulkPrintBill(tx.id)}
                                size="small"
                              />
                            }
                            sx={{ pl: 3 }}
                          >
                            <ListItemText
                              primary={`#${tx.invoiceNumber} · ${formatDate(tx.date)}`}
                              secondary={`₹${(tx.totalAmount || 0).toFixed(2)}`}
                              primaryTypographyProps={{
                                variant: "body2",
                                fontWeight: 600,
                              }}
                              secondaryTypographyProps={{ variant: "caption" }}
                            />
                          </ListItem>
                        ))}
                      </React.Fragment>
                    ))}
                  </List>
                )}
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
            <Button
              onClick={() => setBulkPrintOpen(false)}
              disabled={isBulkPrinting}
              sx={{ borderRadius: tokens.radius.sm }}
            >
              Cancel
            </Button>
            <GradientButton
              tokens={tokens}
              startIcon={<Printer size={16} />}
              onClick={handleBulkPrintClick}
              disabled={bulkPrintMergedList.length === 0 || isBulkPrinting}
              size="medium"
            >
              {isBulkPrinting
                ? "Opening…"
                : `Print ${bulkPrintMergedList.length} bill${bulkPrintMergedList.length !== 1 ? "s" : ""}`}
            </GradientButton>
          </DialogActions>
        </Dialog>
      )}

      {/* Print hidden refs */}
      <div style={{ display: "none" }}>
        <InvoiceTemplate
          ref={printRef}
          transaction={printingTx}
          business={currentBusiness}
          paperSize={paperSize}
          printOptions={config.billPrintOptions}
          partyBalance={
            printingTx
              ? (parties.find((p) => p.id === printingTx.partyId)?.balance ?? 0)
              : undefined
          }
        />
      </div>

      {/* PDF capture ref — off-screen, not display:none so html2canvas can read it */}
      <div style={{ position: "fixed", left: "-9999px", top: 0, opacity: 0, pointerEvents: "none", zIndex: -1 }}>
        <InvoiceTemplate
          ref={pdfRef}
          transaction={previewTx}
          business={currentBusiness}
          paperSize={paperSize}
          printOptions={config.billPrintOptions}
          partyBalance={
            previewTx
              ? (parties.find((p) => p.id === previewTx.partyId)?.balance ?? 0)
              : undefined
          }
        />
      </div>
      {isSale && bulkPrintOpen && bulkPrintMergedList.length > 0 && (
        <div
          ref={bulkPrintRef}
          className="bulk-print-content"
          style={{
            position: "fixed",
            left: 0,
            top: 0,
            width: "100%",
            maxWidth: bulkPrintFormat === 'Thermal 58mm' ? '58mm' : bulkPrintFormat === 'Thermal 80mm' ? '80mm' : bulkPrintFormat === 'A5' ? '148mm' : '210mm',
            zIndex: -1,
            opacity: 0,
            pointerEvents: "none",
            overflow: "visible",
          }}
        >
          {bulkPrintMergedList.map((tx, i) => (
            <div
              key={tx.id}
              style={{
                pageBreakAfter: i < bulkPrintMergedList.length - 1 ? "always" : "auto",
                breakAfter: i < bulkPrintMergedList.length - 1 ? "page" : "auto",
                pageBreakInside: "avoid",
                breakInside: "avoid",
              }}
            >
              <InvoiceTemplate
                transaction={{ ...tx, type: "Sales" }}
                business={currentBusiness}
                paperSize={bulkPrintFormat}
                printOptions={config.billPrintOptions}
                partyBalance={parties.find((p) => p.id === tx.partyId)?.balance}
              />
            </div>
          ))}
        </div>
      )}

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
            background: `linear-gradient(135deg, ${tokens.primaryDark} 0%, ${tokens.primaryLight} 100%)`,
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
              bgcolor: "rgba(255,255,255,0.15)",
              display: "flex",
              alignItems: "center",
              mt: 0.5,
              flexShrink: 0,
            }}
          >
            <Eye size={18} color="white" />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="overline"
              sx={{
                color: "rgba(255,255,255,0.72)",
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
                color: "white",
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
                  <User size={12} color="rgba(255,255,255,0.65)" />
                  <Typography
                    variant="caption"
                    sx={{ color: "rgba(255,255,255,0.85)", fontWeight: 600 }}
                  >
                    {previewTx.partyName}
                  </Typography>
                </Box>
              )}
              {previewTx?.date && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <Calendar size={12} color="rgba(255,255,255,0.65)" />
                  <Typography
                    variant="caption"
                    sx={{ color: "rgba(255,255,255,0.85)", fontWeight: 600 }}
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
                    bgcolor: "rgba(255,255,255,0.18)",
                    borderRadius: "100px",
                    border: "1px solid rgba(255,255,255,0.25)",
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{ color: "white", fontWeight: 800, fontSize: "0.8rem" }}
                  >
                    ₹{previewTx.totalAmount.toFixed(2)}
                  </Typography>
                </Box>
              )}
              {previewTx?.billedBy && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography
                    variant="caption"
                    sx={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.7rem' }}
                  >
                    Billed by: <strong style={{ color: 'rgba(255,255,255,0.95)' }}>{previewTx.billedBy}</strong>
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
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
            {["A4", "A5", "Letter", "Legal", "Thermal 80mm", "Thermal 58mm"].map((s) => (
              <MenuItem key={s} value={s}>{s}</MenuItem>
            ))}
          </TextField>

          <Box sx={{ flex: 1 }} />

          {/* Share button — icon-only on mobile */}
          <Tooltip title="Share">
            <IconButton
              onClick={(e) => setShareMenuAnchor(e.currentTarget)}
              disabled={shareLoading}
              size="small"
              sx={{
                border: "1px solid rgba(22,163,74,0.28)",
                borderRadius: tokens.radius.sm,
                color: "#16a34a",
                px: 1,
                "&:hover": { bgcolor: "rgba(22,163,74,0.06)" },
              }}
            >
              <Share2 size={17} />
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={shareMenuAnchor}
            open={Boolean(shareMenuAnchor)}
            onClose={() => setShareMenuAnchor(null)}
            transformOrigin={{ horizontal: "right", vertical: "top" }}
            anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
            PaperProps={{ elevation: 6, sx: { borderRadius: 2, mt: 0.5, minWidth: 180 } }}
          >
            <MenuItem onClick={() => { shareAsBoth(); setShareMenuAnchor(null); }} sx={{ gap: 1.5, py: 1.25 }}>
              <ListItemIcon sx={{ minWidth: "unset" }}><Share2 size={16} /></ListItemIcon>
              <ListItemText primary="Share PDF + Image" primaryTypographyProps={{ fontSize: "0.875rem", fontWeight: 600 }} />
            </MenuItem>
            <MenuItem onClick={() => { shareAsPDF(); setShareMenuAnchor(null); }} sx={{ gap: 1.5, py: 1.25 }}>
              <ListItemIcon sx={{ minWidth: "unset" }}><FileDown size={16} /></ListItemIcon>
              <ListItemText primary="Share as PDF" primaryTypographyProps={{ fontSize: "0.875rem", fontWeight: 600 }} />
            </MenuItem>
            <MenuItem onClick={() => { shareAsImage(); setShareMenuAnchor(null); }} sx={{ gap: 1.5, py: 1.25 }}>
              <ListItemIcon sx={{ minWidth: "unset" }}><ImageDown size={16} /></ListItemIcon>
              <ListItemText primary="Share as Image" primaryTypographyProps={{ fontSize: "0.875rem", fontWeight: 600 }} />
            </MenuItem>
          </Menu>

          {/* PDF download — icon-only on mobile */}
          <Tooltip title="Download as PDF">
            <IconButton
              onClick={downloadInvoicePDF}
              disabled={pdfLoading}
              size="small"
              sx={{
                border: "1px solid rgba(124,58,237,0.28)",
                borderRadius: tokens.radius.sm,
                color: "#7c3aed",
                px: 1,
                "&:hover": { bgcolor: "rgba(124,58,237,0.06)" },
              }}
            >
              <FileDown size={17} />
            </IconButton>
          </Tooltip>

          {/* Print — always visible, shows text on larger screens */}
          <GradientButton
            tokens={tokens}
            startIcon={<Printer size={15} />}
            onClick={() => {
              setPreviewOpen(false);
              triggerPrint(previewTx);
            }}
            size="small"
            sx={{ px: { xs: 1.5, sm: 2.5 }, flexShrink: 0 }}
          >
            <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>Print</Box>
          </GradientButton>
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
              printOptions={config.billPrintOptions}
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

      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setSnack((s) => ({ ...s, open: false }))}
          severity={snack.severity}
          variant="filled"
          icon={<CheckCircle2 size={18} />}
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

      <SendDialog
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        tx={sendTx}
        party={sendParty}
        businessName={currentBusiness?.name || 'TallyKraft'}
        isSale={isSale}
        onSharePDF={async () => {
          if (sendTx && sendTx.id !== previewTx?.id) {
            setPreviewTx(sendTx);
            await new Promise(r => setTimeout(r, 300));
          }
          await shareAsPDF();
        }}
        onShareImage={async () => {
          if (sendTx && sendTx.id !== previewTx?.id) {
            setPreviewTx(sendTx);
            await new Promise(r => setTimeout(r, 300));
          }
          await shareAsImage();
        }}
        shareLoading={shareLoading}
      />
    </Box>
  );
};

export default SalesPage;
