import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Box, Typography, Card, CardContent, TextField, Button, Grid,
  Divider, List, ListItem, ListItemText, IconButton, ButtonBase, Alert, Avatar,
  FormControl, InputLabel, Select, MenuItem, Chip, FormControlLabel, Switch, Checkbox,
  InputAdornment, Stack, Tooltip, alpha, useTheme, useMediaQuery, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, Slider, Snackbar,
} from '@mui/material';
import { Save, Plus, Trash2, Building2, Check, Image, QrCode, FileSearch, RotateCcw, CornerUpLeft, Truck, BookOpen, CalendarRange, Printer, Users, Copy, KeyRound, Download, FileDown, SlidersHorizontal, Palette, Package, ReceiptText, Barcode, HardDrive, Clock, RefreshCw, AlertTriangle, Paintbrush, Coins, Percent, LayoutDashboard, Store, ShoppingBag, DollarSign, Wallet, FileText, CreditCard, Eye, Calculator, LayoutList, Search, ChevronDown, ChevronRight, GripVertical, Columns3, Lock, Handshake, ClipboardList, Landmark, LayoutTemplate, Hash, Layers, X, ShieldCheck, CheckSquare, Square } from 'lucide-react';
import BillDesigner from './BillDesigner';
import InvoiceTemplateComponent, { INVOICE_THEMES, THEME_COLORS, PAPER_SIZES, SAMPLE_INVOICE, SAMPLE_BUSINESS, getPaperWidthPx, ALL_COLUMN_KEYS, COLUMN_LABELS, resolveColumnOrder, CUSTOM_TEMPLATE_SECTIONS, resolveCustomTemplate } from './InvoiceTemplate';
import { exportFullBusinessToExcel, exportToTallyXML } from './exportUtils';
import { GST_RATES, STATE_NAMES } from './gstUtils';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { useBusiness } from './BusinessContext';
import { useConfig } from './ConfigContext';
import { useData, ALL_TABLES } from './DataContext';
import { saveCustomCategories, saveCustomItemCategories } from './partyUtils';
import { useDialog } from './DialogContext';
import { useAuth } from './AuthContext';
import SectionBuilder from './SectionBuilder';
import DashboardSettings from './DashboardSettings';
import AddBusinessDialog from './AddBusinessDialog';
import BillingPayments from './BillingPayments';
import { useSubscription } from './SubscriptionContext';
import { usePlanCheckout } from './PlanCheckout';
import { PLANS as PLAN_LIST, planById } from './planTiers';
import { useI18n } from './i18n/I18nContext';
import { firestore } from './db';
import { collection, doc, onSnapshot, setDoc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { ensureUniquCode, resolveBizDocId, useBusinessAuthDoc } from './businessCode';
import { resolveMaxStaff } from './businessLimits';
import { buildUpiUri } from './upiUtils';
import UpiQrImage from './UpiQrImage';
import { CODE_POSITIONS, CONTENT_ALIGNS, BORDER_STYLES, ALL_LABEL_FIELDS, resolveFieldOrder, buildSizeConfig, UnifiedLabel } from './Items';
import LabelDesigner from './LabelDesigner';
import { templateLayout, LABEL_SIZES, resolveLabelEntry } from './labelDesignerUtils';
import { STAFF_FEATURE_GROUPS, STAFF_FEATURE_KEYS, STAFF_FEATURE_LABELS, OFF_BY_DEFAULT, defaultStaffFeatures, STAFF_RESTRICTION_ITEMS, isModuleOffForBusiness } from './staffPermissions'; // shared with StaffPage.jsx + ConfigContext.jsx
import { useResizableWidth, ResizeHandle } from './PanelResizer';


// Scales an invoice preview down to fit a container while reserving the
// correct (unscaled-natural-height × scale) space for it — mounted fresh via
// `key={paperSize}` by the caller so switching paper size (e.g. A4 → A6, very
// different proportions) never shows stale height from the previous size:
// without a remount, `h` starts at the old paper's measured height and
// `overflow: hidden` on the reserved box clips the new content to it until
// the effect re-measures, which reads as a permanently cut-off preview if
// ResizeObserver doesn't fire again for some sizes.
const ScaledPreviewBox = ({ scale, width, children }) => {
  const ref = React.useRef(null);
  const [h, setH] = React.useState(null);
  React.useLayoutEffect(() => {
    const measure = () => { if (ref.current) setH(ref.current.scrollHeight * scale); };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro && ref.current) ro.observe(ref.current);
    return () => { if (ro) ro.disconnect(); };
  }, [scale]);
  return (
    <Box sx={{ width: Math.round(width * scale), height: h ?? 'auto', mx: 'auto', position: 'relative', overflow: h == null ? 'visible' : 'hidden' }}>
      <Box ref={ref} sx={{ transform: `scale(${scale})`, transformOrigin: 'top left', width, position: 'absolute', top: 0, left: 0, boxShadow: '0 2px 16px rgba(0,0,0,0.18)' }}>
        {children}
      </Box>
    </Box>
  );
};

// Which Bill Sections toggle controls each item-table column's visibility —
// used only to show a live "on/off" hint next to each row in the reorder
// list; `null` means the column always shows (Item, Qty, Rate, Amount, and
// Tax — Tax's own visibility is really the transaction's gst type, not a
// single toggle, so it's treated as always-present here too).
const COLUMN_VISIBILITY_KEY = {
  srno: 'showSrNo', item: null, hsn: 'showHSNColumn', qty: null, unit: 'showUnitColumn',
  rate: null, disc: 'showDiscountColumn', tax: null, amount: null,
};

// Drag-to-reorder list for the printed item table's column order — same
// native HTML5 drag pattern already used for barcode label field order in
// Items.jsx (no external DnD library). Order is stored as `columnOrder` on
// `config.billPrintOptions`, resolved/back-filled by `resolveColumnOrder()`
// so it degrades safely for configs saved before this feature existed.
const ColumnOrderEditor = ({ bpo, getChecked, primary, dragKeyRef, onChange }) => {
  const order = useMemo(() => resolveColumnOrder(bpo.columnOrder), [bpo.columnOrder]);

  const handleDragStart = (key) => { dragKeyRef.current = key; };
  const handleDragOver = (e, overKey) => {
    e.preventDefault();
    if (!dragKeyRef.current || dragKeyRef.current === overKey) return;
    const from = order.indexOf(dragKeyRef.current);
    const to = order.indexOf(overKey);
    if (from === -1 || to === -1) return;
    const next = [...order];
    next.splice(from, 1);
    next.splice(to, 0, dragKeyRef.current);
    onChange(next);
  };
  const handleDrop = () => { dragKeyRef.current = null; };

  return (
    <Box sx={{ mt: 1, pt: 1, borderTop: '1px dashed', borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75, px: 1 }}>
        <Columns3 size={12} color={alpha(primary, 0.7)} />
        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', fontSize: '0.7rem' }}>Column Order</Typography>
        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.65rem' }}>— drag to reorder how columns print</Typography>
      </Box>
      {order.map((key) => {
        const toggleKey = COLUMN_VISIBILITY_KEY[key];
        const isOn = toggleKey ? getChecked(toggleKey) : true;
        return (
          <Box
            key={key}
            draggable
            onDragStart={() => handleDragStart(key)}
            onDragOver={(e) => handleDragOver(e, key)}
            onDrop={handleDrop}
            sx={{
              display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.6, mb: 0.4,
              borderRadius: '8px', border: '1px solid', borderColor: isOn ? alpha(primary, 0.18) : 'divider',
              bgcolor: isOn ? alpha(primary, 0.03) : '#fafafa', cursor: 'grab', userSelect: 'none',
              transition: 'all 0.12s', '&:hover': { borderColor: alpha(primary, 0.4), bgcolor: alpha(primary, 0.06) },
            }}
          >
            <GripVertical size={14} color="#b0b8c1" style={{ flexShrink: 0 }} />
            <Typography sx={{ flex: 1, fontSize: '0.8rem', fontWeight: 600, color: isOn ? '#3f1417' : '#5f4f47' }}>
              {COLUMN_LABELS[key]}
            </Typography>
            {!isOn && (
              <Typography variant="caption" sx={{ fontSize: '0.65rem', color: '#b0b8c1', fontWeight: 600 }}>hidden</Typography>
            )}
          </Box>
        );
      })}
    </Box>
  );
};

// Drag-and-drop builder for the "Custom" invoice theme — reorders and
// toggles whole bill sections (Header, Items Table, Totals, etc.), stored as
// `config.billPrintOptions.customTemplate.sections`. Same native HTML5 drag
// pattern as ColumnOrderEditor above, but each row also carries its own
// enabled/disabled Switch (a section can be off entirely, not just reordered)
// rather than deriving on/off from an existing separate toggle field.
const CustomTemplateEditor = ({ customTemplate, primary, dragKeyRef, onChange }) => {
  const sections = useMemo(() => resolveCustomTemplate(customTemplate).sections, [customTemplate]);
  const labelFor = (key) => CUSTOM_TEMPLATE_SECTIONS.find(s => s.key === key);

  const handleDragStart = (key) => { dragKeyRef.current = key; };
  const handleDragOver = (e, overKey) => {
    e.preventDefault();
    if (!dragKeyRef.current || dragKeyRef.current === overKey) return;
    const keys = sections.map(s => s.key);
    const from = keys.indexOf(dragKeyRef.current);
    const to = keys.indexOf(overKey);
    if (from === -1 || to === -1) return;
    const next = [...sections];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange({ sections: next });
  };
  const handleDrop = () => { dragKeyRef.current = null; };
  const toggleSection = (key, enabled) => {
    onChange({ sections: sections.map(s => s.key === key ? { ...s, enabled } : s) });
  };

  return (
    <Box>
      {sections.map((s) => {
        const meta = labelFor(s.key);
        const isOn = s.enabled;
        return (
          <Box
            key={s.key}
            draggable
            onDragStart={() => handleDragStart(s.key)}
            onDragOver={(e) => handleDragOver(e, s.key)}
            onDrop={handleDrop}
            sx={{
              display: 'flex', alignItems: 'center', gap: 1, px: 1.25, py: 1, mb: 0.6,
              borderRadius: '10px', border: '1px solid', borderColor: isOn ? alpha(primary, 0.2) : 'divider',
              bgcolor: isOn ? alpha(primary, 0.03) : '#fafafa', cursor: 'grab', userSelect: 'none',
              transition: 'all 0.12s', '&:hover': { borderColor: alpha(primary, 0.45), bgcolor: alpha(primary, 0.06) },
            }}
          >
            <GripVertical size={16} color="#b0b8c1" style={{ flexShrink: 0 }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: isOn ? '#3f1417' : '#5f4f47', lineHeight: 1.3 }}>
                {meta?.label || s.key}
              </Typography>
              <Typography sx={{ fontSize: '0.7rem', color: isOn ? 'text.secondary' : '#c0c7d1', lineHeight: 1.3 }}>
                {meta?.desc}
              </Typography>
            </Box>
            <Switch size="small" checked={isOn} onChange={(e) => toggleSection(s.key, e.target.checked)} onClick={(e) => e.stopPropagation()} />
          </Box>
        );
      })}
    </Box>
  );
};

// Groups offered in Settings → Data → "Delete Data". Every table that
// "Delete All Data" covers must appear in exactly one group. Settings and
// staff tables are never deleted here.
const DELETE_DATA_GROUPS = [
  { key: 'sales', label: 'Sales invoices', tables: ['sales'] },
  { key: 'purchases', label: 'Purchase bills', tables: ['purchases'] },
  { key: 'payments', label: 'Payments', tables: ['payments'] },
  { key: 'expenses', label: 'Expenses', tables: ['expenses'] },
  { key: 'cashEntries', label: 'Cash & Bank entries', tables: ['cashEntries'] },
  { key: 'parties', label: 'Customers & Vendors', tables: ['parties'] },
  { key: 'items', label: 'Items / Inventory', tables: ['items'] },
  { key: 'estimates', label: 'Estimates', tables: ['estimates'] },
  { key: 'orders', label: 'Orders', tables: ['orders'] },
  { key: 'creditNotes', label: 'Credit notes', tables: ['creditNotes'] },
  { key: 'debitNotes', label: 'Debit notes', tables: ['debitNotes'] },
  { key: 'deliveryNotes', label: 'Delivery notes', tables: ['deliveryNotes'] },
  { key: 'journalEntries', label: 'Journal entries', tables: ['journalEntries'] },
  { key: 'opticals', label: 'Opticals', tables: ['opticals', 'opticalOrders', 'opticalSettings'] },
  { key: 'memberships', label: 'Memberships', tables: ['memberships'] },
  { key: 'investors', label: 'Investors', tables: ['investors'] },
  { key: 'customSectionRecords', label: 'Custom section records', tables: ['customSectionRecords'] },
  { key: 'notes', label: 'Dashboard notes', tables: ['notes'] },
];

// Settings that "Delete Data" can also reset to defaults. All UNTICKED by
// default (kept) — clearing records should not wipe the business setup.
// The business profile (name, address, GST, bank) is never touched here.
const DELETE_SETTINGS_GROUPS = [
  { key: 'cfg_invoice', label: 'Invoice & print settings', desc: 'Layout, bill sections, numbering, paper size', configKeys: ['billPrintOptions', 'invoiceNumberConfig', 'defaultPaperSize', 'defaultSaleTypeSales', 'defaultSaleTypePOS'] },
  { key: 'cfg_features', label: 'Modules & features', desc: 'Feature switches, custom sections, dashboard layout', configKeys: ['features', 'customSections', 'sidebarOrder', 'dashboard'] },
  { key: 'cfg_lists', label: 'Lists & categories', desc: 'Expense categories, units, item & party categories', configKeys: ['expenseCategories', 'itemUnits', 'defaultItemUnit', 'itemCategories'] },
  { key: 'cfg_other', label: 'Barcode, loyalty & GST defaults', desc: 'Label design, reward points, item GST defaults', configKeys: ['barcodeLabel', 'loyalty', 'itemDefaults'] },
  { key: 'staff', label: 'Staff & logins', desc: 'Staff, attendance, salary and staff login accounts', tables: ['staffMembers', 'staffAttendance', 'staffSalary'] },
];

// Tile + section header used by the Delete Data dialog.
const DEL_RED = '#dc2626';
const DelTile = ({ on, onClick, icon, label, sub, badge, dim }) => (
  <ButtonBase onClick={onClick} role="checkbox" aria-checked={on}
    sx={{
      justifyContent: 'flex-start', textAlign: 'left', gap: 1, px: 1, py: 0.85, borderRadius: '10px', minWidth: 0, width: '100%',
      border: '1.5px solid', borderColor: on ? alpha(DEL_RED, 0.55) : 'divider',
      bgcolor: on ? alpha(DEL_RED, 0.05) : 'background.paper', opacity: dim && !on ? 0.6 : 1,
      transition: 'all .12s', '&:hover': { borderColor: on ? DEL_RED : alpha(DEL_RED, 0.35) },
      '&.Mui-focusVisible': { outline: `2px solid ${alpha(DEL_RED, 0.4)}`, outlineOffset: 1 },
    }}>
    <Box sx={{ color: on ? DEL_RED : 'text.disabled', display: 'flex', flexShrink: 0 }}>
      {on ? <CheckSquare size={16} /> : <Square size={16} />}
    </Box>
    <Box sx={{ width: 26, height: 26, borderRadius: '7px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: on ? alpha(DEL_RED, 0.1) : alpha('#57433e', 0.08), color: on ? DEL_RED : '#57433e' }}>
      {React.createElement(icon, { size: 14 })}
    </Box>
    <Box sx={{ minWidth: 0, flex: 1 }}>
      <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, lineHeight: 1.2, color: on ? 'text.primary' : 'text.secondary', overflowWrap: 'anywhere' }}>{label}</Typography>
      {sub && <Typography noWrap sx={{ fontSize: '0.66rem', lineHeight: 1.25, color: 'text.disabled' }}>{sub}</Typography>}
    </Box>
    {badge}
  </ButtonBase>
);

const DelSectionHead = ({ icon, title, chip, action }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
    {React.createElement(icon, { size: 15, color: '#57433e' })}
    <Typography sx={{ fontSize: '0.82rem', fontWeight: 800 }}>{title}</Typography>
    {chip}
    <Box sx={{ flex: 1 }} />
    {action}
  </Box>
);

const SettingsPage = () => {
  const settingsNav = useResizableWidth('settings-nav', 220, { min: 180, max: 380 });
  const { currentBusiness, businesses, switchBusiness, setCurrentBusinessId } = useBusiness();
  const { t, lang, setLang, languages } = useI18n();
  const { config, saveConfig, resetConfigKeys } = useConfig();
  const { data, addBusiness, updateBusiness, deleteBusiness: deleteBusinessFromData, addItem, updateItem, deleteItem, deleteManyItems, getItems, backupToFirestore, allBusinessData } = useData();
  const { confirm, showAlert } = useDialog();
  const { currentBusiness: authBusiness, isAdmin, staffSession, currentUser } = useAuth();
  const [uploading, setUploading] = useState({ logo: false });
  const [activeTab, setActiveTab] = useState('profile'); // Settings tab key
  const [sidebarOrderDraft, setSidebarOrderDraft] = useState(null); // null = not editing / no unsaved changes
  const sidebarDragKeyRef = useRef(null);
  const [deleteDataDialog, setDeleteDataDialog] = useState(false);
  const [deleteDataInput, setDeleteDataInput] = useState('');
  const [deleteDataInputError, setDeleteDataInputError] = useState('');
  // Which data groups "Delete All Data" will erase — all ticked by default;
  // unticked groups are kept.
  const [deleteDataSel, setDeleteDataSel] = useState(() => DELETE_DATA_GROUPS.map(g => g.key));
  const [deleteSettingsSel, setDeleteSettingsSel] = useState([]);
  const [formData, setFormData] = useState({
    name: '', gstNumber: '', address: '', phone: '', email: '', state: '',
    fyStartMonth: 3,
    bankName: '', bankAccount: '', ifscCode: '', accountHolder: '',
    upiId: '', upiNumber: '',
  });
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [isNew, setIsNew] = useState(false);
  // Billing: a new business is created only after its first ₹299 / 30-day
  // payment succeeds (see handleCreateBusiness / bizPayNow).
  const { activateSubscription } = useSubscription();
  const { openCheckout: openBizCheckout, checkoutDialog: bizCheckoutDialog, paying: bizPaying, error: bizPayError, setError: setBizPayError } = usePlanCheckout();
  const [showBizPayModal, setShowBizPayModal] = useState(false);
  const [pendingBizData, setPendingBizData] = useState(null);
  const [featuresSaving, setFeaturesSaving] = useState(false);
  const [newExpenseCat, setNewExpenseCat] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('');

  // ── Draft state for config sections (no auto-save on change) ──────────────
  const [loyaltyDraft, setLoyaltyDraft] = useState(null);   // null = synced with config
  const [barcodeDraft, setBarcodeDraft] = useState(null);
  const [barcodeExpandedField, setBarcodeExpandedField] = useState(null);
  const barcodeDragKeyRef = useRef(null);
  const [gstDefaultsDraft, setGstDefaultsDraft] = useState(null);
  const [invoiceNumDraft, setInvoiceNumDraft] = useState(null);
  const [printOptsDraft, setPrintOptsDraft] = useState(null);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [tempTheme, setTempTheme] = useState(null); // holds theme value while picker is open
  const [billPreviewOpen, setBillPreviewOpen] = useState(false);
  const [billDesignerOpen, setBillDesignerOpen] = useState(false);
  const [invoiceSub, setInvoiceSub] = useState('print'); // Invoice & Lists sub-tab: print | numbering | lists
  const [billDesignsTemp, setBillDesignsTemp] = useState(null);
  const [useDesignerTemp, setUseDesignerTemp] = useState(false);
  // Reset counter confirmation dialog state
  const [resetCounterDlg, setResetCounterDlg] = useState(null); // { label, prefix, start, numKey, prefixKey, prefixDef, resetKey }
  const [resetCounterInput, setResetCounterInput] = useState('');

  const [savingSection, setSavingSection] = useState(''); // which section is saving
  const [navSearch, setNavSearch] = useState('');
  const [collapsedBillGroups, setCollapsedBillGroups] = useState(new Set());
  const columnDragKey = useRef(null);
  const customTemplateDragKey = useRef(null);
  const [advancedTab, setAdvancedTab] = useState('barcode'); // 'barcode' | 'loyalty' | 'gst' | 'others'
  const [featSub, setFeatSub] = useState('modules'); // Features sub-tab: modules | barcode | loyalty | gst | others | sections
  const [moduleSearch, setModuleSearch] = useState('');

  // Sync drafts when config loads (first load or external change)
  useEffect(() => {
    setLoyaltyDraft(null);
    setBarcodeDraft(null);
    setGstDefaultsDraft(null);
    setInvoiceNumDraft(null);
    setPrintOptsDraft(null);
  }, [config]);

  // Effective values: draft takes precedence over saved config
  const loyaltyEff = loyaltyDraft ?? config.loyalty ?? {};
  const barcodeEff = barcodeDraft ?? config.barcodeLabel ?? {};
  const gstEff = gstDefaultsDraft ?? config.itemDefaults ?? {};
  const invoiceNumEff = invoiceNumDraft ?? config.invoiceNumberConfig ?? {};
  const printOptsEff = printOptsDraft ?? config.billPrintOptions ?? {};

  const isDirty = {
    loyalty: loyaltyDraft !== null,
    barcode: barcodeDraft !== null,
    gst: gstDefaultsDraft !== null,
    invoiceNum: invoiceNumDraft !== null,
    printOpts: printOptsDraft !== null,
  };

  const saveSection = async (section) => {
    setSavingSection(section);
    try {
      if (section === 'loyalty') {
        const cleanLoyalty = {
          ...loyaltyEff,
          pointsPerRupee: Math.max(0, Number(loyaltyEff.pointsPerRupee) || 0),
          earnEveryRupees: Math.max(1, Number(loyaltyEff.earnEveryRupees) || 1),
          rupeePerPoint: Math.max(0, Number(loyaltyEff.rupeePerPoint) || 0),
          minRedeemPoints: Math.max(1, Number(loyaltyEff.minRedeemPoints) || 1),
        };
        await saveConfig({ ...config, loyalty: cleanLoyalty, features: { ...config.features, loyalty: loyaltyEff._enabled ?? config.features?.loyalty } });
        setLoyaltyDraft(null);
      } else if (section === 'barcode') {
        await saveConfig({ ...config, barcodeLabel: { ...barcodeEff, columns: Math.max(1, Math.min(8, Number(barcodeEff.columns) || 1)) } });
        setBarcodeDraft(null);
      } else if (section === 'gst') {
        await saveConfig({ ...config, itemDefaults: gstEff });
        setGstDefaultsDraft(null);
      } else if (section === 'invoiceNum') {
        const cleanInvoiceNum = { ...invoiceNumEff };
        Object.keys(cleanInvoiceNum).forEach((k) => {
          if (k.endsWith('StartingNumber')) cleanInvoiceNum[k] = parseInt(cleanInvoiceNum[k]) || 1;
        });
        await saveConfig({ ...config, invoiceNumberConfig: cleanInvoiceNum });
        setInvoiceNumDraft(null);
      } else if (section === 'printOpts') {
        await saveConfig({ ...config, billPrintOptions: printOptsEff, defaultPaperSize: printOptsEff._paperSize ?? config.defaultPaperSize });
        setPrintOptsDraft(null);
      }
      setMsg({ type: 'success', text: 'Settings saved.' });
      setTimeout(() => setMsg({ type: '', text: '' }), 2500);
    } catch (err) {
      console.error('[saveSection] error:', err);
      setMsg({ type: 'error', text: 'Failed to save. Please try again.' });
    } finally {
      setSavingSection('');
    }
  };

  // Invoice preview container measurement
  const previewContainerRef = useRef(null);
  const [previewContainerWidth, setPreviewContainerWidth] = useState(0);
  useEffect(() => {
    const el = previewContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      setPreviewContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    setPreviewContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [activeTab]); // re-measure when switching to invoice tab

  // Staff management state
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [staffForm, setStaffForm] = useState({
    name: '', username: '', password: '', active: true, features: defaultStaffFeatures()
  });
  const [showStaffPwd, setShowStaffPwd] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [staffMsg, setStaffMsg] = useState({ type: '', text: '' });

  // Admin password state
  const [adminPwdForm, setAdminPwdForm] = useState({ password: '', confirm: '' });
  const [showAdminPwd, setShowAdminPwd] = useState(false);
  const [adminPwdMsg, setAdminPwdMsg] = useState({ type: '', text: '' });
  const [savingAdminPwd, setSavingAdminPwd] = useState(false);

  // Business code / admin password are scoped per LOCAL business (not the
  // account-wide `authBusiness` from AuthContext, which is only one doc per
  // Google account) — resolved from whichever business is selected in the
  // switcher, via its own `businesses/{id}` Firestore doc.
  const ownerUid = currentUser?.uid || authBusiness?.ownerId;
  const scopedBiz = useBusinessAuthDoc(currentBusiness, ownerUid);
  const [scopedBizLoading, setScopedBizLoading] = useState(false);

  // Lazily mints a businessCode/doc for the selected local business if it
  // doesn't have one yet — covers accounts/businesses created before this fix.
  const handleLinkBusinessCode = async () => {
    if (!currentUser?.uid || !currentBusiness) return;
    setScopedBizLoading(true);
    try {
      const bizDocId = resolveBizDocId(currentBusiness, ownerUid);
      if (!bizDocId) return;
      const existing = await getDoc(doc(firestore, 'businesses', bizDocId));
      if (!existing.exists()) {
        const code = await ensureUniquCode();
        await setDoc(doc(firestore, 'businesses', bizDocId), {
          id: bizDocId,
          name: currentBusiness.name,
          ownerId: currentUser.uid,
          ownerEmail: currentUser.email,
          businessCode: code,
          createdAt: new Date(),
        });
      }
      if (!currentBusiness.firestoreBizDocId) {
        await updateBusiness(currentBusiness.id, { firestoreBizDocId: bizDocId });
      }
    } catch (err) {
      setMsg({ type: 'error', text: 'Failed to link business code: ' + err.message });
    } finally {
      setScopedBizLoading(false);
    }
  };

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const primary = theme.palette.primary.main;
  const primaryDark = theme.palette.primary.dark || primary;
  const baseRadius = 8;
  const cardSx = {
    elevation: 0,
    sx: {
      border: '1px solid',
      borderColor: '#e5e7eb',
      borderRadius: '16px',
      overflow: 'hidden',
      bgcolor: '#fff',
      boxShadow: 'none',
    },
  };
  const accentCardSx = cardSx;
  const fieldSx = { '& .MuiOutlinedInput-root': { borderRadius: '10px', bgcolor: '#fafafa' } };

  // Load staff login docs from Firestore scoped to the currently selected business's own doc.
  // This subcollection alone is NOT the full staff list — see `staffList` memo below.
  const [staffAccountsList, setStaffAccountsList] = useState([]);
  useEffect(() => {
    if (!scopedBiz?.id || !currentBusiness?.id) return;
    setStaffAccountsList([]);
    resetStaffForm();
    const ref = collection(firestore, 'businesses', scopedBiz.id, 'staffAccounts');
    const unsub = onSnapshot(ref,
      snap => setStaffAccountsList(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.error('Staff load error:', err)
    );
    return unsub;
  }, [scopedBiz?.id, currentBusiness?.id]);

  // Merge with the `staffMembers` DataContext table (the store StaffPage.jsx renders
  // from) so staff created before the staffAccounts-mirroring fix, or via any path
  // that only wrote one of the two stores, still show up here.
  const staffMembersList = getItems('staffMembers').filter(s => String(s.businessId) === String(currentBusiness?.id));
  const staffList = useMemo(() => {
    const byId = new Map();
    staffMembersList.forEach(m => byId.set(String(m.id), { ...m, active: m.status !== 'inactive' }));
    staffAccountsList.forEach(a => byId.set(String(a.id), { ...byId.get(String(a.id)), ...a }));
    return Array.from(byId.values());
  }, [staffMembersList, staffAccountsList]);

  // Super-admin per-business staff cap (Admin → Businesses → Usage Limits).
  const maxStaffLimit = resolveMaxStaff(scopedBiz);
  const activeStaffCount = staffList.filter(s => s.active !== false).length;
  const atStaffCap = activeStaffCount >= maxStaffLimit;

  const resetStaffForm = () => {
    setSelectedStaff(null);
    setStaffForm({ name: '', username: '', password: '', active: true, features: defaultStaffFeatures(), role: 'Sales Staff', phone: '', email: '', salary: '', salaryType: 'monthly', joiningDate: '', notes: '', showInSalesSelector: false });
    setShowStaffPwd(false);
  };

  const loadStaff = (staff) => {
    setSelectedStaff(staff);
    setStaffForm({
      role: 'Sales Staff', phone: '', email: '', salary: '', salaryType: 'monthly', joiningDate: '', notes: '', showInSalesSelector: false,
      ...staff,
      password: '',
      active: staff.active !== false,
      features: { ...defaultStaffFeatures(), ...(staff.features || {}) }
    });
    setShowStaffPwd(false);
  };

  const handleSaveAdminPassword = async () => {
    if (!adminPwdForm.password) { setAdminPwdMsg({ type: 'error', text: 'Password cannot be empty.' }); return; }
    if (adminPwdForm.password.length < 6) { setAdminPwdMsg({ type: 'error', text: 'Password must be at least 6 characters.' }); return; }
    if (adminPwdForm.password !== adminPwdForm.confirm) { setAdminPwdMsg({ type: 'error', text: 'Passwords do not match.' }); return; }
    if (!scopedBiz?.id) { setAdminPwdMsg({ type: 'error', text: 'No business linked yet — click "Generate Code" first.' }); return; }
    setSavingAdminPwd(true);
    try {
      await updateDoc(doc(firestore, 'businesses', scopedBiz.id), { adminPassword: adminPwdForm.password });
      setAdminPwdMsg({ type: 'success', text: 'Admin password saved.' });
      setAdminPwdForm({ password: '', confirm: '' });
      setTimeout(() => setAdminPwdMsg({ type: '', text: '' }), 3000);
    } catch (err) {
      setAdminPwdMsg({ type: 'error', text: err.message });
    } finally {
      setSavingAdminPwd(false);
    }
  };

  const staffCollectionRef = () =>
    collection(firestore, 'businesses', scopedBiz.id, 'staffAccounts');

  const handleSaveStaff = async () => {
    if (!scopedBiz?.id) { setStaffMsg({ type: 'error', text: 'No business linked to your account yet.' }); return; }
    if (!currentBusiness?.id) { setStaffMsg({ type: 'error', text: 'No business selected.' }); return; }
    if (!staffForm.name.trim()) { setStaffMsg({ type: 'error', text: 'Name is required.' }); return; }
    if (!staffForm.username.trim()) { setStaffMsg({ type: 'error', text: 'Username is required.' }); return; }
    if (!selectedStaff && !staffForm.password) { setStaffMsg({ type: 'error', text: 'Password is required for new staff.' }); return; }
    if (!selectedStaff && atStaffCap) { setStaffMsg({ type: 'error', text: `Staff limit reached (${maxStaffLimit}). Contact your administrator to raise it.` }); return; }

    const username = staffForm.username.trim().toLowerCase();
    const duplicate = staffList.find(s => s.username === username && s.id !== selectedStaff?.id);
    if (duplicate) { setStaffMsg({ type: 'error', text: 'Username already taken.' }); return; }

    try {
      const staffId = selectedStaff?.id || `staff_${Date.now()}`;
      const sharedFields = {
        role: staffForm.role || 'Sales Staff',
        phone: staffForm.phone || '',
        email: staffForm.email || '',
        salary: Number(staffForm.salary) || 0,
        salaryType: staffForm.salaryType || 'monthly',
        joiningDate: staffForm.joiningDate || '',
        notes: staffForm.notes || '',
        showInSalesSelector: !!staffForm.showInSalesSelector,
      };
      const staffData = {
        id: staffId,
        name: staffForm.name.trim(),
        username,
        active: staffForm.active,
        features: staffForm.features,
        businessId: String(currentBusiness.id),
        ...sharedFields,
        ...(staffForm.password ? { password: staffForm.password } : {})
      };
      await setDoc(doc(staffCollectionRef(), staffId), staffData, { merge: true });

      // Sync into staffMembers (DataContext) so StaffPage sees the same record
      const bId = currentBusiness.id;
      const memberRecord = {
        name: staffData.name,
        features: staffData.features,
        status: staffData.active ? 'active' : 'inactive',
        businessId: String(bId),
        ...sharedFields,
      };
      const existingMember = getItems('staffMembers').find(m => m.id === staffId);
      if (existingMember) {
        updateItem('staffMembers', staffId, memberRecord);
      } else {
        addItem('staffMembers', { id: staffId, ...memberRecord });
      }

      setStaffMsg({ type: 'success', text: selectedStaff ? 'Staff updated.' : 'Staff account created.' });
      if (!selectedStaff) resetStaffForm();
      else setSelectedStaff({ ...selectedStaff, ...staffData });
      setTimeout(() => setStaffMsg({ type: '', text: '' }), 3000);
    } catch (err) {
      setStaffMsg({ type: 'error', text: 'Failed: ' + err.message });
    }
  };

  const handleDeleteStaff = async (staff) => {
    if (!scopedBiz?.id || !currentBusiness?.id) return;
    const ok = await confirm({
      title: `Remove: ${staff.name}`,
      message: `Remove ${staff.name}'s account? They will no longer be able to log in.`,
      confirmLabel: 'Remove', variant: 'danger'
    });
    if (!ok) return;
    try {
      await deleteDoc(doc(staffCollectionRef(), staff.id));
      // Also remove from staffMembers so StaffPage stays in sync
      deleteItem('staffMembers', staff.id);
      if (selectedStaff?.id === staff.id) resetStaffForm();
      setStaffMsg({ type: 'success', text: 'Staff account removed.' });
      setTimeout(() => setStaffMsg({ type: '', text: '' }), 3000);
    } catch (err) {
      setStaffMsg({ type: 'error', text: 'Failed: ' + err.message });
    }
  };

  const copyCode = () => {
    if (scopedBiz?.businessCode) {
      navigator.clipboard.writeText(scopedBiz.businessCode).catch(() => {});
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleFeatureToggle = async (featureKey, checked) => {
    const newFeatures = { ...(config.features || {}), [featureKey]: checked };
    setFeaturesSaving(true);
    try {
      await saveConfig({ features: newFeatures });
      setMsg({ type: 'success', text: 'Features updated.' });
      setTimeout(() => setMsg({ type: '', text: '' }), 3000);
    } catch (err) {
      setMsg({ type: 'error', text: 'Failed to update features.' });
    } finally {
      setFeaturesSaving(false);
    }
  };

  // Turn several modules on/off with a single save.
  const handleFeaturesBulk = async (patch) => {
    setFeaturesSaving(true);
    try {
      await saveConfig({ features: { ...(config.features || {}), ...patch } });
      setMsg({ type: 'success', text: 'Features updated.' });
      setTimeout(() => setMsg({ type: '', text: '' }), 3000);
    } catch {
      setMsg({ type: 'error', text: 'Failed to update features.' });
    } finally {
      setFeaturesSaving(false);
    }
  };

  // Keep the inline edit form in sync with the active business.
  useEffect(() => {
    if (currentBusiness) {
      setFormData({
        name: currentBusiness.name || '',
        gstNumber: currentBusiness.gstNumber || '',
        address: currentBusiness.address || '',
        phone: currentBusiness.phone || '',
        email: currentBusiness.email || '',
        state: currentBusiness.state || '',
        fyStartMonth: currentBusiness.fyStartMonth ?? 3,
        openingCash: currentBusiness.openingCash ?? 0,
        openingBank: currentBusiness.openingBank ?? 0,
        bankName: currentBusiness.bankName || '',
        bankAccount: currentBusiness.bankAccount || '',
        ifscCode: currentBusiness.ifscCode || '',
        accountHolder: currentBusiness.accountHolder || '',
        upiId: currentBusiness.upiId || '',
        upiNumber: currentBusiness.upiNumber || '',
      });
    }
  }, [currentBusiness]);


  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file || !currentBusiness?.id) return;
    setUploading(u => ({ ...u, logo: true }));
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await updateBusiness(currentBusiness.id, { logo: reader.result });
        setMsg({ type: 'success', text: 'Logo updated.' });
      } catch (err) {
        setMsg({ type: 'error', text: 'Failed to update logo.' });
      }
      setUploading(u => ({ ...u, logo: false }));
    };
    reader.onerror = () => { setUploading(u => ({ ...u, logo: false })); setMsg({ type: 'error', text: 'Failed to read file.' }); };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemoveLogo = async () => {
    if (!currentBusiness?.id) return;
    try {
      await updateBusiness(currentBusiness.id, { logo: '' });
      setMsg({ type: 'success', text: 'Logo removed.' });
    } catch (err) {
      setMsg({ type: 'error', text: 'Failed to remove logo.' });
    }
  };

  // Create-new flow lives in the AddBusinessDialog popup. It hands us the
  // assembled payload; every business needs its own subscription, so we
  // validate limits, then ask for the first payment (see bizPayNow) — the
  // business is only created once Razorpay reports success.
  const handleCreateBusiness = (businessData) => {
    if (!config.multiBusiness) {
      setMsg({ type: 'error', text: 'Multiple businesses feature is disabled. Please enable it in the admin panel.' });
      setTimeout(() => setMsg({ type: '', text: '' }), 4000);
      return;
    }
    const maxBiz = config.maxBusinesses || 0;
    if (maxBiz > 0 && Object.keys(allBusinessData || {}).length >= maxBiz) {
      setMsg({ type: 'error', text: `Business limit reached (max ${maxBiz}). Contact your administrator to increase your limit.` });
      setTimeout(() => setMsg({ type: '', text: '' }), 5000);
      return;
    }
    setPendingBizData(businessData);
    setBizPayError('');
    setShowBizPayModal(true);
    setIsNew(false); // close the AddBusinessDialog
  };

  const bizPayNow = () => {
    const pending = pendingBizData;
    setShowBizPayModal(false);
    openBizCheckout({
      planId: PLAN_LIST[0].id,
      businessName: pending?.name,
      defaultState: pending?.state || currentBusiness?.state,
      onPaid: async (planId, paymentId, billingMeta) => {
        const id = await addBusiness(pending);
        if (!id) throw new Error('Business creation failed after payment');
        await activateSubscription(String(id), planId, paymentId, billingMeta);
        await backupToFirestore?.().catch?.(() => {});
        setCurrentBusinessId(id);
        setPendingBizData(null);
        setMsg({ type: 'success', text: `"${pending?.name}" created — active for ${planById(planId).period}.` });
        setTimeout(() => setMsg({ type: '', text: '' }), 4000);
      },
    });
  };

  const handleSaveListUpdate = async (e) => {
    e.preventDefault();

    // Validate required fields
    if (!formData.name || formData.name.trim() === '') {
      setMsg({ type: 'error', text: 'Business name is required!' });
      setTimeout(() => setMsg({ type: '', text: '' }), 4000);
      return;
    }

    try {
      if (currentBusiness?.id) {
        const updateData = {
          name: formData.name,
          gstNumber: formData.gstNumber || '',
          address: formData.address || '',
          phone: formData.phone || '',
          email: formData.email || '',
          state: formData.state || '',
          fyStartMonth: Number(formData.fyStartMonth ?? 3),
          openingCash: Number(formData.openingCash) || 0,
          openingBank: Number(formData.openingBank) || 0,
          bankName: formData.bankName || '',
          bankAccount: formData.bankAccount || '',
          ifscCode: formData.ifscCode || '',
          accountHolder: formData.accountHolder || '',
          upiId: formData.upiId || '',
          upiNumber: formData.upiNumber || '',
        };
        
        const saved = await updateBusiness(currentBusiness.id, updateData);
        if (saved) {
          setMsg({ type: 'success', text: 'Business profile updated successfully!' });
        } else {
          setMsg({ type: 'error', text: 'Failed to update business. Please try again.' });
        }
      }
    } catch (err) {
      console.error("Save failed:", err);
      setMsg({ type: 'error', text: 'Failed to save: ' + (err.message || 'Unknown error') });
    }
    setTimeout(() => setMsg({ type: '', text: '' }), 4000);
  };


  const handleDeleteBusiness = async (id) => {
    const bizToDelete = businesses.find(b => b.id === id);
    if (!bizToDelete) return;

    if (businesses.length <= 1) {
      await showAlert({ title: 'Cannot delete', message: 'You need at least one business at all times.', variant: 'warning' });
      return;
    }

    const ok = await confirm({
      title: `Delete "${bizToDelete.name}"`,
      message: `EXTREME CAUTION: This will permanently delete "${bizToDelete.name}" along with ALL its parties, items, invoices, and transactions. This cannot be undone.`,
      confirmLabel: 'Delete Business',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      const otherBusiness = businesses.find(b => b._key !== id);

      // deleteBusinessFromData (DataContext.jsx's deleteBusiness) removes the
      // entire business — including all its nested parties/items/sales/etc. —
      // via a single Firestore batch delete of the whole business doc tree.
      // A granular per-record deleteItem() pass isn't needed here (and was
      // previously a no-op for any business other than the currently active
      // one, since getItems() only ever reads the active business's data).
      const deleted = await deleteBusinessFromData(id);
      
      if (deleted) {
        if (id === currentBusiness?._key && otherBusiness) {
          switchBusiness(otherBusiness._key);
        }
        setMsg({ type: 'success', text: 'Business and all its data deleted.' });
      } else {
        setMsg({ type: 'error', text: 'Failed to delete business. Please try again.' });
      }
    } catch (err) {
      console.error("Deletion failed:", err);
      setMsg({ type: 'error', text: 'Deletion failed: ' + (err.message || 'Unknown error') });
    }
    setTimeout(() => setMsg({ type: '', text: '' }), 4000);
  };

  // Record count per delete group for the current business (shown in the
  // Delete Data dialog). Only computed while the dialog is open.
  const deleteDataCounts = useMemo(() => {
    if (!deleteDataDialog) return {};
    const bid = currentBusiness?.id;
    const out = {};
    DELETE_DATA_GROUPS.forEach(g => {
      out[g.key] = g.tables.reduce((n, t) => n + (data?.[t] || []).filter(r => r.businessId === bid).length, 0);
    });
    out.staff = (data?.staffMembers || []).filter(r => r.businessId === bid).length;
    return out;
  }, [deleteDataDialog, data, currentBusiness?.id]);

  const handleDeleteAllData = () => {
    setDeleteDataInput('');
    setDeleteDataInputError('');
    setDeleteDataSel(DELETE_DATA_GROUPS.map(g => g.key));
    setDeleteSettingsSel([]);
    setDeleteDataDialog(true);
  };

  const handleDeleteDataConfirm = async (withBackup = false) => {
    const biz = currentBusiness;
    if (!biz) return;
    const hasPassword = !!scopedBiz?.adminPassword;
    if (hasPassword) {
      if (deleteDataInput !== scopedBiz.adminPassword) {
        setDeleteDataInputError('Incorrect password. Please try again.');
        return;
      }
    } else {
      if (deleteDataInput.trim().toLowerCase() !== 'delete') {
        setDeleteDataInputError('Please type "delete" exactly to confirm.');
        return;
      }
    }
    const wipeStaff = deleteSettingsSel.includes('staff');
    const selectedTables = [
      ...DELETE_DATA_GROUPS.filter(g => deleteDataSel.includes(g.key)).flatMap(g => g.tables),
      ...(wipeStaff ? ['staffMembers', 'staffAttendance', 'staffSalary'] : []),
    ];
    const resetGroups = DELETE_SETTINGS_GROUPS.filter(g => g.configKeys && deleteSettingsSel.includes(g.key));
    if (selectedTables.length === 0 && resetGroups.length === 0) {
      setDeleteDataInputError('Select at least one thing to delete or reset.');
      return;
    }
    setDeleteDataDialog(false);

    // Export backup first if requested
    if (withBackup) {
      try {
        const bizKey = String(biz.id);
        const bizData = allBusinessData[bizKey];
        if (bizData) {
          const payload = { businesses: { [bizKey]: bizData }, exportedAt: new Date().toISOString() };
          const safeName = biz.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
          const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `tallykraft_${safeName}_${new Date().toISOString().split('T')[0]}.json`;
          link.click();
          URL.revokeObjectURL(url);
        }
      } catch (err) {
        setMsg({ type: 'error', text: 'Backup failed, deletion aborted: ' + (err.message || 'Unknown error') });
        setTimeout(() => setMsg({ type: '', text: '' }), 4000);
        return;
      }
    }

    const id = biz.id;
    // Derived from the canonical ALL_TABLES (DataContext.jsx) instead of a
    // separately hand-maintained list — the old copy here had drifted out of
    // sync (used 'journal'/'membership' instead of the real
    // 'journalEntries'/'memberships' table names, so getItems() on those
    // always returned [] and nothing in them was ever deleted; it was also
    // missing opticalOrders/opticalSettings/customSectionRecords entirely).
    // 'settings' (business config) and staff records are excluded
    // deliberately — this is "delete all business DATA", not a full
    // business teardown.
    const EXCLUDED_FROM_DELETE_ALL = new Set(['settings', ...(wipeStaff ? [] : ['staffMembers', 'staffAttendance', 'staffSalary'])]);
    // Only the groups the user left ticked in the dialog.
    const ALL_STORES = ALL_TABLES.filter(t => !EXCLUDED_FROM_DELETE_ALL.has(t) && selectedTables.includes(t));
    try {
      // Single batched mutation across all stores instead of one deleteItem()
      // call per record — with large datasets (thousands of sales/items) the
      // per-record approach caused a full re-render + debounced Firestore
      // write for every single row, which is what made this feel frozen.
      const tableIdMap = {};
      let totalMatched = 0;
      ALL_STORES.forEach(store => {
        const ids = getItems(store).filter(r => r.businessId === id).map(r => r.id);
        if (ids.length) { tableIdMap[store] = ids; totalMatched += ids.length; }
      });
      // deleteManyItems silently no-ops (returns 0) if tableIdMap ends up
      // empty — a "Delete All" that appears to succeed but changes nothing
      // is worse than no feedback at all, since the user has no reason to
      // suspect anything is wrong. This surfaces exactly that instead of
      // showing the same "deleted successfully" toast either way.
      const deletedCount = totalMatched > 0 ? deleteManyItems(tableIdMap) : 0;
      const done = [];
      if (deletedCount > 0) done.push(`${deletedCount} records deleted`);

      // Staff login accounts for this business (Firestore staffAccounts).
      if (wipeStaff && scopedBiz?.id) {
        const accs = staffAccountsList.map(a => a.id);
        await Promise.all(accs.map(sid => deleteDoc(doc(staffCollectionRef(), sid)).catch(() => {})));
        if (accs.length) done.push(`${accs.length} staff logins removed`);
      }

      // Settings → back to defaults for this business only.
      if (resetGroups.length) {
        await resetConfigKeys(resetGroups.flatMap(g => g.configKeys));
        if (deleteSettingsSel.includes('cfg_lists')) {
          // Device-only copies, otherwise they'd be carried back in.
          ['product', 'service', 'membership'].forEach(t => saveCustomItemCategories(id, t, []));
          ['Customer', 'Vendor'].forEach(t => saveCustomCategories(id, t, []));
        }
        done.push(`${resetGroups.length} setting group${resetGroups.length > 1 ? 's' : ''} reset`);
      }

      if (!done.length) {
        setMsg({ type: 'error', text: 'No records found in the selected data for this business — nothing was deleted.' });
        setTimeout(() => setMsg({ type: '', text: '' }), 6000);
        return;
      }
      setMsg({ type: 'success', text: `${withBackup ? 'Backed up. ' : ''}${done.join(', ')}.` });
    } catch (err) {
      setMsg({ type: 'error', text: 'Deletion failed: ' + (err.message || 'Unknown error') });
    }
    setTimeout(() => setMsg({ type: '', text: '' }), 4000);
  };

  // Compact row toggle (label + switch, no border)
  const ToggleRow = ({ label, desc, checked, onChange, disabled }) => (
    <Box onClick={disabled ? undefined : () => onChange(!checked)}
      sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1, py: 0.6, borderRadius: '8px', cursor: disabled ? 'default' : 'pointer', '&:hover': disabled ? {} : { bgcolor: '#f6efe9' } }}>
      <Switch size="small" checked={checked} disabled={disabled}
        onChange={e => { e.stopPropagation(); onChange(e.target.checked); }} sx={{ flexShrink: 0 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600, fontSize: '0.82rem', lineHeight: 1.2, color: checked ? '#3f1417' : '#57433e' }}>{label}</Typography>
        {desc && <Typography variant="caption" sx={{ color: '#5f4f47', lineHeight: 1.2, fontSize: '0.72rem' }}>{desc}</Typography>}
      </Box>
    </Box>
  );

  // Card section header
  const SH = ({ icon: Icon, title, subtitle, action }) => (
    <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <Icon size={15} color={primary} style={{ flexShrink: 0, opacity: 0.8 }} />
        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.3, color: '#3f1417' }}>{title}</Typography>
          {subtitle && <Typography variant="caption" sx={{ color: '#57433e', lineHeight: 1.4, display: 'block' }}>{subtitle}</Typography>}
        </Box>
      </Box>
      {action}
    </Box>
  );

  // Shared button sx
  const gradBtnSx = {
    borderRadius: '10px',
    bgcolor: primary,
    fontWeight: 700,
    boxShadow: 'none',
    '&:hover': { bgcolor: primaryDark, boxShadow: 'none' },
  };

  const NAV_ITEMS = [
    { key: 'profile', icon: Building2, label: t('settings.profile') },
    { key: 'features', icon: Package, label: t('settings.features') },
    { key: 'invoice', icon: ReceiptText, label: t('settings.invoice') },
    { key: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    ...((currentUser || staffSession?.role === 'admin') ? [{ key: 'staff', icon: Users, label: 'Access Control' }] : []),
    ...((currentUser && !staffSession) ? [{ key: 'billing', icon: CreditCard, label: t('settings.billing') }] : []),
    { key: 'appearance', icon: Palette, label: t('settings.appearance') },
    { key: 'data', icon: HardDrive, label: t('settings.data') },
  ];

  // Mirrors Layout.jsx's navGroups gating exactly (same config.features /
  // staff-permission checks) so the reorder list only shows items the user
  // actually sees in their sidebar.
  const sidebarNavGroups = useMemo(() => {
    const isAdminSession = staffSession?.role === 'admin';
    const sfeat = (!staffSession || isAdminSession) ? null : (staffSession.features || {});
    const canStaff = (key) => !sfeat || !!sfeat[key];
    return [
      { items: [
        ...(config.features?.dashboard && canStaff('dashboard') ? [{ text: t('nav.dashboard'), icon: LayoutDashboard, path: '/' }] : []),
        ...(config.features?.parties && canStaff('parties') ? [{ text: t('nav.parties'), icon: Users, path: '/parties' }] : []),
        ...(config.features?.items && canStaff('items') ? [{ text: t('nav.items'), icon: Package, path: '/items' }] : []),
      ] },
      { label: t('nav.transactions'), items: [
        ...(config.features?.pos && canStaff('pos') ? [{ text: t('nav.pos'), icon: Store, path: '/pos' }] : []),
        ...(config.features?.sales && canStaff('sales') ? [{ text: t('nav.sales'), icon: ReceiptText, path: '/sales' }] : []),
        ...(config.features?.purchases && canStaff('purchases') ? [{ text: t('nav.purchases'), icon: ShoppingBag, path: '/purchases' }] : []),
        ...(config.features?.expenses && canStaff('expenses') ? [{ text: t('nav.expenses'), icon: DollarSign, path: '/expenses' }] : []),
        ...(config.features?.payments && canStaff('payments') ? [{ text: t('nav.payments'), icon: Download, path: '/payment-in' }] : []),
        ...(!sfeat && config.features?.staff ? [{ text: t('nav.staff'), icon: Users, path: '/staff' }] : []),
      ] },
      { label: t('nav.documents'), items: [
        ...(config.features?.estimates && canStaff('estimates') ? [{ text: t('nav.estimates'), icon: FileSearch, path: '/estimates' }] : []),
        ...(config.features?.creditNotes && canStaff('creditNotes') ? [{ text: t('nav.creditNotes'), icon: RotateCcw, path: '/credit-notes' }] : []),
        ...(config.features?.debitNotes && canStaff('debitNotes') ? [{ text: t('nav.debitNotes'), icon: CornerUpLeft, path: '/debit-notes' }] : []),
        ...(config.features?.deliveryNotes && canStaff('deliveryNotes') ? [{ text: t('nav.deliveryNotes'), icon: Truck, path: '/delivery-notes' }] : []),
      ] },
      { label: t('nav.accounting'), items: [
        ...(config.features?.cash !== false && canStaff('cash') ? [{ text: 'Cash & Bank', icon: Wallet, path: '/cash' }] : []),
        ...(config.features?.calculator !== false ? [{ text: t('nav.calculator'), icon: Calculator, path: '/calculator' }] : []),
        ...(config.features?.ledger && canStaff('ledger') ? [{ text: t('nav.ledger'), icon: BookOpen, path: '/ledger' }] : []),
        ...(config.features?.membership && canStaff('membership') ? [{ text: t('nav.membership'), icon: CreditCard, path: '/membership' }] : []),
        ...(config.features?.opticals && canStaff('opticals') ? [{ text: t('nav.opticals'), icon: Eye, path: '/opticals' }] : []),
        ...(config.customSections || []).map(section => ({ text: section.name, icon: LayoutList, path: `/section/${section.id}` })),
      ] },
      { label: t('nav.analytics'), items: [
        ...(config.features?.reports && canStaff('reports') ? [{ text: t('nav.reports'), icon: FileText, path: '/reports' }] : []),
      ] },
    ].filter(g => g.items.length > 0);
  }, [config, staffSession, t]);

  const sidebarFlatItems = useMemo(
    () => sidebarNavGroups.flatMap(g => g.items.map(item => ({ ...item, _group: g.label || 'General' }))),
    [sidebarNavGroups]
  );

  // Effective (draft-if-editing, else the saved order applied to the current
  // item list) — recomputed whenever the underlying item set changes so
  // newly-enabled features appear without wiping an in-progress drag.
  const sidebarOrderEff = useMemo(() => {
    if (sidebarOrderDraft) return sidebarOrderDraft;
    const saved = config.sidebarOrder || [];
    if (!saved.length) return sidebarFlatItems;
    return [...sidebarFlatItems].sort((a, b) => {
      const ai = saved.indexOf(a.path), bi = saved.indexOf(b.path);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [sidebarOrderDraft, config.sidebarOrder, sidebarFlatItems]);

  const sidebarOrderDirty = sidebarOrderDraft !== null;

  const handleSidebarDragOver = (e, overPath) => {
    e.preventDefault();
    const dragPath = sidebarDragKeyRef.current;
    if (!dragPath || dragPath === overPath) return;
    setSidebarOrderDraft((prev) => {
      const base = prev || sidebarOrderEff;
      const next = [...base];
      const from = next.findIndex(i => i.path === dragPath);
      const to = next.findIndex(i => i.path === overPath);
      if (from === -1 || to === -1) return prev;
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const saveSidebarOrder = async () => {
    if (!sidebarOrderDraft) return;
    await saveConfig({ ...config, sidebarOrder: sidebarOrderDraft.map(i => i.path) });
    setSidebarOrderDraft(null);
    setMsg({ type: 'success', text: 'Sidebar order saved.' });
    setTimeout(() => setMsg({ type: '', text: '' }), 2500);
  };

  const resetSidebarOrder = async () => {
    setSidebarOrderDraft(null);
    if (config.sidebarOrder?.length) {
      await saveConfig({ ...config, sidebarOrder: [] });
    }
  };

  return (
    <>
    <Box sx={{ pb: 8 }}>

      {/* ── Page header ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Box sx={{ p: 1, borderRadius: '12px', bgcolor: alpha(primary, 0.1), display: 'flex' }}>
          <SlidersHorizontal size={20} color={primary} />
        </Box>
        <Box>
          <Typography sx={{ fontWeight: 800, fontSize: '1.25rem', lineHeight: 1.2, color: '#3f1417' }}>Settings</Typography>
          {currentBusiness && (
            <Typography sx={{ color: '#57433e', fontSize: '0.82rem' }}>{currentBusiness.name}</Typography>
          )}
        </Box>
      </Box>

      {msg.text && (
        <Alert severity={msg.type} sx={{ mb: 2.5, borderRadius: '12px' }}>
          {msg.text}
        </Alert>
      )}

      {/* ── Mobile nav pills ── */}
      {isMobile && (
        <Box sx={{
          display: 'flex', gap: 0.5, overflowX: 'auto', pb: 0.5, mb: 2.5,
          '&::-webkit-scrollbar': { height: 0 },
        }}>
          {NAV_ITEMS.map(({ key, icon: Icon, label }) => {
            const active = activeTab === key;
            return (
              <Box key={key} onClick={() => setActiveTab(key)} sx={{
                display: 'flex', alignItems: 'center', gap: 0.75, px: 1.5, py: 0.75,
                borderRadius: '100px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                bgcolor: active ? primary : '#f6efe9',
                color: active ? 'white' : '#7a2e30',
                transition: 'all 0.15s',
              }}>
                <Icon size={13} />
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 600 }}>{label}</Typography>
              </Box>
            );
          })}
        </Box>
      )}

      {/* ── Two-column layout: sidebar + content ── */}
      <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>

        {/* ── LEFT SIDEBAR (desktop only) ── */}
        {!isMobile && (
          <Box sx={{ width: settingsNav.width, flexShrink: 0, position: 'sticky', top: 80 }}>
            <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '16px', overflow: 'hidden', mb: 2 }}>
              {/* Search */}
              <Box sx={{ px: 1.5, pt: 1.5, pb: 0.75 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1.25, py: 0.875, borderRadius: '10px', bgcolor: '#f6efe9', border: '1px solid #e8ddd6' }}>
                  <Search size={13} color="#5f4f47" />
                  <Box component="input"
                    placeholder="Search…"
                    value={navSearch}
                    onChange={e => setNavSearch(e.target.value)}
                    name="settingsNavSearch"
                    autoComplete="off"
                    style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: '0.82rem', color: '#5c1f22', width: '100%', fontFamily: 'inherit' }}
                  />
                </Box>
              </Box>
              <Box sx={{ px: 1.5, pb: 1.5 }}>
                {NAV_ITEMS.filter(item => !navSearch || item.label.toLowerCase().includes(navSearch.toLowerCase())).map(({ key, icon: Icon, label }) => {
                  const active = activeTab === key;
                  return (
                    <Box key={key} onClick={() => { setActiveTab(key); setNavSearch(''); }} sx={{
                      display: 'flex', alignItems: 'center', gap: 1.25,
                      px: 1.25, py: 1, mt: 0.25,
                      borderRadius: '10px', cursor: 'pointer',
                      borderLeft: active ? `3px solid ${primary}` : '3px solid transparent',
                      bgcolor: active ? alpha(primary, 0.07) : 'transparent',
                      color: active ? primary : '#7a2e30',
                      transition: 'all 0.15s',
                      '&:hover': { bgcolor: active ? alpha(primary, 0.09) : '#f6efe9', color: active ? primary : '#5c1f22' },
                    }}>
                      <Icon size={15} />
                      <Typography sx={{ fontSize: '0.85rem', fontWeight: active ? 700 : 500 }}>{label}</Typography>
                    </Box>
                  );
                })}
              </Box>
            </Box>

            {/* Quick Toggles */}
            <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '16px', overflow: 'hidden' }}>
              <Box sx={{ px: 1.75, py: 1.25, borderBottom: '1px solid #f6efe9' }}>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#5f4f47', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Quick Toggles</Typography>
              </Box>
              <Box sx={{ px: 1.5, py: 0.75 }}>
                {[
                  { key: 'barcode',    label: 'Barcodes',     icon: Barcode },
                  { key: 'loyalty',    label: 'Loyalty',      icon: Coins },
                  { key: 'stockAlert', label: 'Stock Alerts', icon: AlertTriangle },
                  { key: 'estimates',  label: 'Estimates',    icon: FileText },
                  { key: 'journal',    label: 'Journal',      icon: BookOpen },
                ].map(({ key, label, icon: Icon }) => {
                  const on = !!config.features?.[key];
                  return (
                    <Box key={key} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.6, cursor: 'pointer' }}
                      onClick={() => !featuresSaving && handleFeatureToggle(key, !on)}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Icon size={12} color={on ? primary : '#5f4f47'} />
                        <Typography sx={{ fontSize: '0.8rem', fontWeight: 500, color: on ? '#3f1417' : '#57433e' }}>{label}</Typography>
                      </Box>
                      <Switch size="small" checked={on} disabled={featuresSaving}
                        onChange={e => { e.stopPropagation(); handleFeatureToggle(key, e.target.checked); }}
                        sx={{ transform: 'scale(0.75)', mr: -0.75 }} />
                    </Box>
                  );
                })}
              </Box>
            </Box>
          </Box>
        )}
        {!isMobile && <ResizeHandle panel={settingsNav} side="right" label="Resize settings menu" />}

        {/* ── CONTENT AREA ── */}
        <Box sx={{ flex: 1, minWidth: 0 }}>

      {/* ── Business Profile ── */}
      <Box sx={{ mb: 4, display: activeTab === 'profile' ? 'block' : 'none' }}>
        <Grid container spacing={2}>
          {/* Left: form */}
          <Grid size={{ xs: 12, md: 7 }}>
            <Card elevation={0} sx={{ ...cardSx.sx }}>
              <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid #f6efe9', display: 'flex', alignItems: 'center', gap: 1 }}>
                <Building2 size={13} color={primary} style={{ opacity: 0.7 }} />
                <Typography sx={{ fontWeight: 700, fontSize: '0.875rem', color: '#3f1417' }}>Business Details</Typography>
              </Box>
              <CardContent sx={{ p: 2 }}>
                <form onSubmit={handleSaveListUpdate}>
                  <Grid container spacing={1.25}>
                    <Grid size={12}>
                      <TextField size="small" fullWidth label="Business Name *" required
                        name="businessDisplayName" autoComplete="off"
                        value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} sx={fieldSx} />
                    </Grid>
                    <Grid size={6}>
                      <TextField size="small" fullWidth label="GSTIN"
                        value={formData.gstNumber} onChange={(e) => setFormData({ ...formData, gstNumber: e.target.value })} sx={fieldSx} />
                    </Grid>
                    <Grid size={6}>
                      <TextField size="small" fullWidth label="Phone"
                        value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} sx={fieldSx} />
                    </Grid>
                    <Grid size={12}>
                      <TextField size="small" fullWidth label="Address" multiline rows={2}
                        value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} sx={fieldSx} />
                    </Grid>
                    <Grid size={6}>
                      <FormControl fullWidth size="small" sx={fieldSx}>
                        <InputLabel>State</InputLabel>
                        <Select label="State" value={formData.state || ''} onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                          MenuProps={{ PaperProps: { sx: { maxHeight: 320 } } }}>
                          <MenuItem value=""><em>Not set</em></MenuItem>
                          {STATE_NAMES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                        </Select>
                      </FormControl>
                      <Typography variant="caption" sx={{ color: '#5f4f47', fontSize: '0.68rem', display: 'block', mt: 0.375 }}>
                        Used as the GST "Place of Supply" on every bill
                      </Typography>
                    </Grid>
                    <Grid size={6}>
                      <FormControl fullWidth size="small" sx={fieldSx}>
                        <InputLabel>FY Start</InputLabel>
                        <Select value={formData.fyStartMonth} label="FY Start"
                          onChange={(e) => setFormData({ ...formData, fyStartMonth: e.target.value })}>
                          <MenuItem value={3}>April (India)</MenuItem>
                          <MenuItem value={0}>January</MenuItem>
                          <MenuItem value={6}>July</MenuItem>
                          <MenuItem value={9}>October</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid size={3}>
                      <TextField size="small" fullWidth type="number" label="Opening Cash"
                        value={formData.openingCash ?? 0}
                        onChange={(e) => setFormData({ ...formData, openingCash: e.target.value })}
                        slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> } }}
                        sx={fieldSx} />
                    </Grid>
                    <Grid size={3}>
                      <TextField size="small" fullWidth type="number" label="Opening Bank"
                        value={formData.openingBank ?? 0}
                        onChange={(e) => setFormData({ ...formData, openingBank: e.target.value })}
                        slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> } }}
                        sx={fieldSx} />
                    </Grid>

                    <Grid size={12}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1, mb: -0.25 }}>
                        <Landmark size={13} color={primary} style={{ opacity: 0.7 }} />
                        <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', color: '#3f1417' }}>Bank & UPI Details</Typography>
                      </Box>
                      <Typography variant="caption" sx={{ color: '#5f4f47', fontSize: '0.7rem', display: 'block', mt: 0.25 }}>
                        Shown on printed bills when "Bank Details" is enabled in Invoice settings — the payment QR appears with the UPI ID/number below it.
                      </Typography>
                    </Grid>
                    {/* QR is generated live from the UPI ID below (no photo
                        upload) — updates the instant the field changes, and
                        the exact same generator is what prints on bills. */}
                    <Grid size={12}>
                      <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
                        <Box sx={{ flexShrink: 0, width: 64, textAlign: 'center' }}>
                          {formData.upiId ? (
                            <Box sx={{ width: 64, height: 64, borderRadius: '8px', border: '1px solid #e8ddd6', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', bgcolor: '#fff' }}>
                              <UpiQrImage value={buildUpiUri({ upiId: formData.upiId, payeeName: currentBusiness?.name })} size={64} />
                            </Box>
                          ) : (
                            <Box sx={{ width: 64, height: 64, borderRadius: '8px', border: '1px dashed #d1d5db', bgcolor: alpha(primary, 0.05), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <QrCode size={20} color={alpha(primary, 0.45)} />
                            </Box>
                          )}
                          <Typography sx={{ fontSize: '0.62rem', color: '#5f4f47', fontWeight: 600, mt: 0.375, lineHeight: 1.2 }}>
                            {formData.upiId ? 'Payment QR' : 'Add UPI ID →'}
                          </Typography>
                        </Box>
                        <Grid container spacing={1.25} sx={{ flex: 1 }}>
                          <Grid size={6}>
                            <TextField size="small" fullWidth label="Bank Name"
                              value={formData.bankName} onChange={(e) => setFormData({ ...formData, bankName: e.target.value })} sx={fieldSx} />
                          </Grid>
                          <Grid size={6}>
                            <TextField size="small" fullWidth label="Account Holder Name"
                              value={formData.accountHolder} onChange={(e) => setFormData({ ...formData, accountHolder: e.target.value })} sx={fieldSx} />
                          </Grid>
                          <Grid size={6}>
                            <TextField size="small" fullWidth label="Account Number"
                              value={formData.bankAccount} onChange={(e) => setFormData({ ...formData, bankAccount: e.target.value })} sx={fieldSx} />
                          </Grid>
                          <Grid size={6}>
                            <TextField size="small" fullWidth label="IFSC Code"
                              value={formData.ifscCode} onChange={(e) => setFormData({ ...formData, ifscCode: e.target.value.toUpperCase() })} sx={fieldSx} />
                          </Grid>
                          <Grid size={6}>
                            <TextField size="small" fullWidth label="UPI ID"
                              placeholder="yourname@okhdfcbank"
                              value={formData.upiId} onChange={(e) => setFormData({ ...formData, upiId: e.target.value })} sx={fieldSx} />
                          </Grid>
                          <Grid size={6}>
                            <TextField size="small" fullWidth label="UPI Number"
                              placeholder="Mobile number linked to UPI"
                              value={formData.upiNumber} onChange={(e) => setFormData({ ...formData, upiNumber: e.target.value.replace(/\D/g, '').slice(0, 15) })} sx={fieldSx} />
                          </Grid>
                        </Grid>
                      </Box>
                    </Grid>

                    <Grid size={12}>
                      <Button type="submit" variant="contained" fullWidth startIcon={<Save size={15} />} sx={gradBtnSx}>Save Profile</Button>
                    </Grid>
                  </Grid>
                </form>
              </CardContent>
            </Card>
          </Grid>

          {/* Right: branding + businesses */}
          <Grid size={{ xs: 12, md: 5 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* Branding: logo. Payment QR moved into Bank & UPI Details
                  (left column) since it's payment-related, not branding. */}
              <Card elevation={0} sx={{ ...cardSx.sx }}>
                <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid #f6efe9', display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Image size={13} color={primary} style={{ opacity: 0.7 }} />
                  <Typography sx={{ fontWeight: 700, fontSize: '0.875rem' }}>Branding</Typography>
                </Box>
                <CardContent sx={{ p: 2 }}>
                  <Box sx={{ maxWidth: 200, mx: 'auto', border: '1px dashed #d1d5db', borderRadius: '10px', p: 1.5, textAlign: 'center' }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: '#57433e', display: 'block', mb: 1, fontSize: '0.72rem' }}>LOGO</Typography>
                    {currentBusiness?.logo ? (
                      <Box>
                        <img src={currentBusiness.logo} alt="Logo" style={{ maxHeight: 56, maxWidth: '100%', objectFit: 'contain', display: 'block', margin: '0 auto 8px' }} />
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                          <Button size="small" component="label" sx={{ fontSize: '0.7rem', textTransform: 'none', minWidth: 0, px: 1 }}>
                            Change<input type="file" hidden accept="image/*" onChange={handleLogoUpload} />
                          </Button>
                          <Button size="small" color="error" onClick={handleRemoveLogo} sx={{ fontSize: '0.7rem', textTransform: 'none', minWidth: 0, px: 1 }}>Remove</Button>
                        </Box>
                      </Box>
                    ) : (
                      <Box>
                        <Box sx={{ width: 40, height: 40, borderRadius: '8px', bgcolor: alpha(primary, 0.08), display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 1 }}>
                          <Image size={18} color={alpha(primary, 0.4)} />
                        </Box>
                        <Button size="small" variant="outlined" component="label" disabled={uploading.logo} sx={{ fontSize: '0.7rem', textTransform: 'none', px: 1 }}>
                          Upload<input type="file" hidden accept="image/*" onChange={handleLogoUpload} />
                        </Button>
                      </Box>
                    )}
                  </Box>
                </CardContent>
              </Card>

              {/* Businesses — visible to Google-auth admins and business-code admins alike */}
              {config.multiBusiness && (!staffSession || staffSession.role === 'admin') && (
                <Card elevation={0} sx={{ ...cardSx.sx }}>
                  <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid #f6efe9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Building2 size={13} color={primary} style={{ opacity: 0.7 }} />
                      <Typography sx={{ fontWeight: 700, fontSize: '0.875rem' }}>Businesses</Typography>
                    </Box>
                    {staffSession
                      ? <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', fontStyle: 'italic' }}>Log in with email to add a new business</Typography>
                      : <Button size="small" startIcon={<Plus size={12} />} onClick={() => setIsNew(true)}
                          sx={{ fontSize: '0.75rem', textTransform: 'none', py: 0.25 }}>Add</Button>}
                  </Box>
                  <Box sx={{ p: 1.25 }}>
                    {businesses.map((biz) => {
                      const isActive = biz._key === currentBusiness?._key;
                      return (
                        <Box key={biz._key} onClick={() => { if (!isActive) { setIsNew(false); switchBusiness(biz._key); } }}
                          sx={{ mb: 0.75, p: 1.25, borderRadius: '10px', border: '1px solid', borderColor: isActive ? alpha(primary, 0.35) : '#e5e7eb', bgcolor: isActive ? alpha(primary, 0.04) : 'transparent', display: 'flex', alignItems: 'center', gap: 1.25, cursor: isActive ? 'default' : 'pointer', '&:hover': !isActive ? { bgcolor: '#f6efe9' } : {} }}>
                          <Avatar sx={{ width: 30, height: 30, fontSize: '0.75rem', bgcolor: isActive ? primary : alpha(primary, 0.12), color: isActive ? 'white' : primary, fontWeight: 700 }}>
                            {(biz.name?.[0] || '?').toUpperCase()}
                          </Avatar>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" sx={{ fontWeight: 700, color: isActive ? primary : 'text.primary', lineHeight: 1.2, fontSize: '0.82rem' }}>{biz.name}</Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>{biz.gstNumber || 'No GSTIN'}</Typography>
                          </Box>
                          {isActive
                            ? <Chip label="Active" size="small" sx={{ height: 18, fontSize: '0.62rem', bgcolor: alpha(primary, 0.1), color: primary, fontWeight: 700 }} />
                            : <IconButton size="small" color="primary" onClick={e => { e.stopPropagation(); switchBusiness(biz._key); }}><Check size={14} /></IconButton>
                          }
                          <IconButton size="small" color="error" disabled={businesses.length <= 1} onClick={e => { e.stopPropagation(); handleDeleteBusiness(biz._key); }}>
                            <Trash2 size={13} />
                          </IconButton>
                        </Box>
                      );
                    })}
                  </Box>
                </Card>
              )}
            </Box>
          </Grid>
        </Grid>
      </Box>

      {/* ── Features & Sections sub-tabs — one area at a time ── */}
      <Box sx={{ mb: 2, display: activeTab === 'features' ? 'flex' : 'none', gap: 0.5, flexWrap: 'wrap', p: 0.5, borderRadius: '12px', border: '1px solid #e5e7eb', bgcolor: '#fafafa', width: 'fit-content', maxWidth: '100%' }}>
        {[
          { key: 'modules', label: 'Modules', icon: LayoutDashboard },
          { key: 'barcode', label: 'Barcode Label', icon: Barcode, dirty: isDirty.barcode },
          { key: 'loyalty', label: 'Loyalty', icon: Coins, dirty: isDirty.loyalty },
          { key: 'gst', label: 'GST Defaults', icon: Percent, dirty: isDirty.gst },
          { key: 'others', label: 'Others', icon: RefreshCw },
          { key: 'sections', label: 'Custom Sections', icon: Layers },
        ].map((tab) => {
          const on = featSub === tab.key;
          const pick = () => { setFeatSub(tab.key); if (['barcode', 'loyalty', 'gst', 'others'].includes(tab.key)) setAdvancedTab(tab.key); };
          return (
            <Box key={tab.key} role="button" tabIndex={0} onClick={pick}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } }}
              sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1.4, py: 0.7, borderRadius: '9px', cursor: 'pointer', userSelect: 'none',
                fontSize: '0.8rem', fontWeight: on ? 700 : 600, color: on ? '#fff' : '#57433e', bgcolor: on ? primary : 'transparent',
                transition: 'all 0.12s', '&:hover': { bgcolor: on ? primary : '#f6efe9' } }}>
              <tab.icon size={14} />{tab.label}
              {tab.dirty && <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: on ? '#fff' : 'warning.main' }} />}
            </Box>
          );
        })}
      </Box>

      {/* ── Modules ── */}
      <Box sx={{ mb: 2, display: activeTab === 'features' && featSub === 'modules' ? 'block' : 'none' }}>
        {(() => {
          // `def: 'off'` modules are off until switched on; the rest are on unless switched off.
          const GROUPS = [
            { title: 'Core', items: [
              { key: 'dashboard',  icon: LayoutDashboard, label: 'Dashboard',   desc: 'KPIs, charts and activity' },
              { key: 'parties',    icon: Users,           label: 'Parties',     desc: 'Customers and vendors' },
              { key: 'items',      icon: Package,         label: 'Items',       desc: 'Products, stock and prices' },
              { key: 'pos',        icon: Store,           label: 'POS',         desc: 'Quick counter billing' },
              { key: 'sales',      icon: ReceiptText,     label: 'Sales',       desc: 'Sales invoices' },
              { key: 'purchases',  icon: ShoppingBag,     label: 'Purchases',   desc: 'Purchase bills' },
              { key: 'expenses',   icon: DollarSign,      label: 'Expenses',    desc: 'Business expenses' },
              { key: 'payments',   icon: Download,        label: 'Payments',    desc: 'Payment in / out' },
              { key: 'reports',    icon: FileText,        label: 'Reports',     desc: 'Sales, GST, P&L and more' },
              { key: 'cash',       icon: Wallet,          label: 'Cash & Bank', desc: 'Cash book and bank book' },
              { key: 'ledger',     icon: BookOpen,        label: 'Ledger',      desc: 'Party-wise statement' },
              { key: 'calculator', icon: Calculator,      label: 'Calculator',  desc: 'Quick calculator' },
              { key: 'backup',     icon: HardDrive,       label: 'Backup',      desc: 'Backup and restore' },
            ] },
            { title: 'Optional modules', items: [
              { key: 'estimates',     icon: FileSearch,    label: 'Estimates',      desc: 'Quotations you can convert to sales', def: 'off' },
              { key: 'orders',        icon: ClipboardList, label: 'Orders',         desc: 'Customer orders with delivery status', def: 'off' },
              { key: 'creditNotes',   icon: RotateCcw,     label: 'Credit Notes',   desc: 'Sales returns', def: 'off' },
              { key: 'debitNotes',    icon: CornerUpLeft,  label: 'Debit Notes',    desc: 'Purchase returns', def: 'off' },
              { key: 'deliveryNotes', icon: Truck,         label: 'Delivery Notes', desc: 'Dispatch / delivery challans', def: 'off' },
              { key: 'journal',       icon: BookOpen,      label: 'Journal',        desc: 'Manual journal entries', def: 'off' },
              { key: 'membership',    icon: CreditCard,    label: 'Membership',     desc: 'Plans and member tracking', def: 'off' },
              { key: 'investors',     icon: Handshake,     label: 'Investors',      desc: 'Investor capital and returns', def: 'off' },
              { key: 'opticals',      icon: Eye,           label: 'Opticals',       desc: 'Eye exams and optical orders', def: 'off' },
              { key: 'barcode',       icon: Barcode,       label: 'Barcodes',       desc: 'Barcode / QR scanning and labels', def: 'off' },
              { key: 'staff',         icon: Users,         label: 'Staff Mgmt',     desc: 'Attendance and salary', def: 'off' },
            ] },
            { title: 'Sales & POS options', items: [
              { key: 'multiTabSales',         icon: Layers,        label: 'Multi-tab Sales',     desc: 'Open several invoices / bills at once in tabs' },
              { key: 'multiTabPOS',           icon: Store,         label: 'Multi-tab POS',       desc: 'Serve several customers at once in POS tabs' },
              { key: 'multiTabEstimates',     icon: Layers,        label: 'Multi-tab Estimates', desc: 'Work on several estimates at once in tabs' },
              { key: 'customerPreview',       icon: Users,         label: 'Customer Preview',    desc: 'Customer panel with history on Sales / POS' },
              { key: 'unitColumn',            icon: LayoutList,    label: 'Unit Column',         desc: 'Unit picker on invoice rows' },
              { key: 'itemRowSummary',        icon: Eye,           label: 'Item Summary',        desc: 'Stock, price and margin under each invoice row' },
              { key: 'billPaymentStatusChip', icon: ReceiptText,   label: 'Paid/Unpaid Chip',    desc: 'Status chip and row colour on bills' },
              { key: 'referenceImages',       icon: Image,         label: 'Reference Images',    desc: 'Attach photos to bills (this device only)', def: 'off' },
              { key: 'packingCharges',        icon: Package,       label: 'Packing Charges',     desc: 'Packing charge field on invoices' },
              { key: 'shippingCharges',       icon: Truck,         label: 'Shipping Charges',    desc: 'Shipping charge field on invoices' },
              { key: 'alertExpired',          icon: AlertTriangle, label: 'Expired Item Alert',  desc: 'Warn when billing an expired batch' },
            ] },
          ];
          const isOn = (it) => (it.def === 'off' ? config.features?.[it.key] === true : config.features?.[it.key] !== false);
          const q = moduleSearch.trim().toLowerCase();
          const match = (it) => !q || it.label.toLowerCase().includes(q) || it.desc.toLowerCase().includes(q);
          const totalOn = GROUPS.reduce((n, g) => n + g.items.filter(isOn).length, 0);
          const total = GROUPS.reduce((n, g) => n + g.items.length, 0);
          return (
            <Card elevation={0} sx={{ ...cardSx.sx }}>
              <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid #f6efe9', display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
                <Box sx={{ flex: 1, minWidth: 180 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }}>Sections & Modules</Typography>
                  <Typography variant="caption" sx={{ color: '#5f4f47' }}>
                    {totalOn} of {total} on · turned-off sections are hidden · applies to {currentBusiness?.name || 'this business'} only
                  </Typography>
                </Box>
                <TextField size="small" placeholder="Search modules…" value={moduleSearch} onChange={(e) => setModuleSearch(e.target.value)}
                  slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search size={14} /></InputAdornment> } }}
                  sx={{ ...fieldSx, width: { xs: '100%', sm: 220 } }} />
              </Box>
              <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                {GROUPS.map((g) => {
                  const items = g.items.filter(match);
                  if (!items.length) return null;
                  const onCount = g.items.filter(isOn).length;
                  return (
                    <Box key={g.title} sx={{ mb: 1.5, '&:last-child': { mb: 0 } }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: '0.68rem', color: '#57433e', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{g.title}</Typography>
                        <Chip size="small" label={`${onCount}/${g.items.length} on`} sx={{ height: 18, fontSize: '0.64rem', fontWeight: 700, bgcolor: alpha(primary, 0.08), color: primary }} />
                        <Box sx={{ flex: 1, height: '1px', bgcolor: '#f6efe9' }} />
                        {!q && (
                          <>
                            <Button size="small" disabled={featuresSaving || onCount === g.items.length} onClick={() => handleFeaturesBulk(Object.fromEntries(g.items.map((it) => [it.key, true])))}
                              sx={{ textTransform: 'none', fontSize: '0.7rem', minWidth: 0, px: 0.75, py: 0 }}>All on</Button>
                            <Button size="small" color="inherit" disabled={featuresSaving || onCount === 0} onClick={() => handleFeaturesBulk(Object.fromEntries(g.items.map((it) => [it.key, false])))}
                              sx={{ textTransform: 'none', fontSize: '0.7rem', minWidth: 0, px: 0.75, py: 0, color: '#5f4f47' }}>All off</Button>
                          </>
                        )}
                      </Box>
                      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 0.5 }}>
                        {items.map((it) => {
                          const on = isOn(it);
                          return (
                            <Box key={it.key} role="switch" aria-checked={on} tabIndex={0}
                              onClick={() => !featuresSaving && handleFeatureToggle(it.key, !on)}
                              onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !featuresSaving) { e.preventDefault(); handleFeatureToggle(it.key, !on); } }}
                              sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 1, pr: 0.25, py: 0.4, borderRadius: '8px', border: '1px solid',
                                borderColor: on ? alpha(primary, 0.28) : '#eef0f2', bgcolor: on ? alpha(primary, 0.045) : '#fff',
                                cursor: featuresSaving ? 'default' : 'pointer', transition: 'all 0.12s',
                                '&:hover': { borderColor: alpha(primary, 0.45) }, '&:focus-visible': { outline: `2px solid ${primary}`, outlineOffset: 1 } }}>
                              <Box sx={{ width: 26, height: 26, borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                bgcolor: on ? alpha(primary, 0.12) : '#f4f5f7', color: on ? primary : '#9ca3af' }}>
                                <it.icon size={14} />
                              </Box>
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography noWrap sx={{ fontWeight: 700, fontSize: '0.8rem', color: on ? '#3f1417' : '#57433e', lineHeight: 1.25 }}>{it.label}</Typography>
                                <Typography noWrap sx={{ fontSize: '0.68rem', color: '#5f4f47', lineHeight: 1.25 }}>{it.desc}</Typography>
                              </Box>
                              <Switch size="small" checked={on} disabled={featuresSaving} onClick={(e) => e.stopPropagation()} onChange={(e) => handleFeatureToggle(it.key, e.target.checked)} sx={{ transform: 'scale(0.8)', flexShrink: 0 }} />
                            </Box>
                          );
                        })}
                      </Box>
                    </Box>
                  );
                })}
                {q && GROUPS.every((g) => !g.items.some(match)) && (
                  <Typography sx={{ fontSize: '0.8rem', color: 'text.disabled', py: 2, textAlign: 'center' }}>No module matches “{moduleSearch}”.</Typography>
                )}
              </CardContent>
            </Card>
          );
        })()}
      </Box>

      {/* ── Barcode / Loyalty / GST Defaults / Others — picked from the sub-tabs above ── */}
      <Box sx={{ mb: 2, display: activeTab === 'features' && ['barcode', 'loyalty', 'gst', 'others'].includes(featSub) ? 'block' : 'none' }}>
        <Card elevation={0} sx={{ ...cardSx.sx }}>
          {/* Former in-card tab pills — now driven by the Features sub-tabs */}
          <Box sx={{ display: 'none' }}>
            {[
              { key: 'barcode', icon: Barcode, label: 'Barcode Label', dirty: isDirty.barcode },
              { key: 'loyalty', icon: Coins, label: 'Loyalty Points', dirty: isDirty.loyalty },
              { key: 'gst', icon: Percent, label: 'GST Defaults', dirty: isDirty.gst },
              { key: 'others', icon: RefreshCw, label: 'Others', dirty: isDirty.gst },
            ].map(({ key, icon: Icon, label, dirty }) => (
              <Box key={key} onClick={() => setAdvancedTab(key)}
                sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1.5, py: 0.75, cursor: 'pointer', borderBottom: advancedTab === key ? `2px solid ${primary}` : '2px solid transparent', color: advancedTab === key ? primary : '#57433e', transition: 'all 0.15s', '&:hover': { color: primary } }}>
                <Icon size={13} />
                <Typography sx={{ fontSize: '0.82rem', fontWeight: advancedTab === key ? 700 : 500 }}>{label}</Typography>
                {dirty && <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'warning.main' }} />}
              </Box>
            ))}
          </Box>

          {/* Barcode tab — the single source of truth for barcode/QR label
              layout; Items only offers Copies/Columns per print run and
              always renders using whatever is saved here. */}
          {advancedTab === 'barcode' && (() => {
            const setBc = (patch) => setBarcodeDraft(d => ({ ...(d ?? config.barcodeLabel ?? {}), ...patch }));
            const fieldOrder = resolveFieldOrder(barcodeEff);
            const fieldStyles = barcodeEff.fieldStyles || {};
            const fieldLabels = barcodeEff.fieldLabels || {};
            const contentScale = barcodeEff.contentScale || 1.0;
            const codeScale = barcodeEff.codeScale || 1.0;
            const setFieldOrder = (next) => setBc({ fieldOrder: next });
            const setFieldStyle = (fieldKey, prop, val) =>
              setBc({ fieldStyles: { ...fieldStyles, [fieldKey]: { ...(fieldStyles[fieldKey] || {}), [prop]: val } } });
            const setFieldLabel = (fieldKey, val) => setBc({ fieldLabels: { ...fieldLabels, [fieldKey]: val } });
            const handleDragStart = (key) => { barcodeDragKeyRef.current = key; };
            const handleDragOver = (e, overKey) => {
              e.preventDefault();
              if (!barcodeDragKeyRef.current || barcodeDragKeyRef.current === overKey) return;
              const next = [...fieldOrder];
              const from = next.indexOf(barcodeDragKeyRef.current);
              const to = next.indexOf(overKey);
              if (from === -1 || to === -1) return;
              next.splice(from, 1);
              next.splice(to, 0, barcodeDragKeyRef.current);
              setFieldOrder(next);
            };
            const handleDrop = () => { barcodeDragKeyRef.current = null; };

            const sizeEntry = resolveLabelEntry(barcodeEff);
            const sizeConfig = buildSizeConfig(sizeEntry, contentScale, codeScale);
            const previewSizeConfig = { ...sizeConfig, width: 'auto', height: 'auto' };
            const sampleItem = {
              name: 'Sample Item', itemCode: 'ITM-001', category: 'General',
              mrp: 499, salePrice: 399, barcode: '8901234567890', hsnCode: '6109',
              size: 'M', variant: 'Blue', _businessName: currentBusiness?.name || 'My Business',
              barcodeExtraFields: [{ label: 'Pkd', value: '09/2026' }],
            };
            const lblWithOrder = { ...barcodeEff, fieldOrder, fieldStyles, fieldLabels };
            const codeType = barcodeEff.codeType === 'qr' ? 'qr' : 'barcode';
            const isCustomLayout = barcodeEff.layoutMode === 'custom';
            const capsLabel = { fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.65rem' };

            // Layout mode switch — Simple (automatic stacked layout) vs Custom
            // (free-form designer). First switch to Custom seeds the designer
            // from the current simple settings so it starts from something familiar.
            const layoutModeSwitch = (
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" sx={capsLabel}>Layout</Typography>
                <Box sx={{ display: 'flex', gap: 0.75, maxWidth: 520 }}>
                  {[
                    { value: 'simple', label: 'Simple', desc: 'Pick fields, the layout arranges itself' },
                    { value: 'custom', label: 'Custom designer', desc: 'Drag, resize and place every element' },
                  ].map((m) => {
                    const active = (isCustomLayout ? 'custom' : 'simple') === m.value;
                    return (
                      <Box key={m.value}
                        onClick={() => {
                          if (m.value === 'custom') {
                            setBc({ layoutMode: 'custom', ...(barcodeEff.customLayout?.elements?.length ? {} : { customLayout: templateLayout(barcodeEff, sizeEntry.widthMm, sizeEntry.heightMm) }) });
                          } else setBc({ layoutMode: 'simple' });
                        }}
                        sx={{ flex: 1, px: 1.5, py: 1, borderRadius: 1.5, cursor: 'pointer', border: '1.5px solid', transition: 'all 0.12s',
                          borderColor: active ? primary : 'divider', bgcolor: active ? alpha(primary, 0.08) : 'transparent',
                          '&:hover': { borderColor: primary } }}>
                        <Typography sx={{ fontWeight: 700, fontSize: '0.82rem', color: active ? primary : 'text.primary' }}>{m.label}</Typography>
                        <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>{m.desc}</Typography>
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            );

            const sizeSelect = (
              <Box sx={{ display: 'flex', gap: 1, flex: 1, minWidth: 220 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5 }}>Label Size</Typography>
                  <TextField select size="small" fullWidth value={barcodeEff.defaultLabelSize || 'standard'}
                    onChange={e => setBc({ defaultLabelSize: e.target.value })} sx={fieldSx}>
                    {LABEL_SIZES.map(s => <MenuItem key={s.key} value={s.key}>{s.label}</MenuItem>)}
                  </TextField>
                </Box>
                {barcodeEff.defaultLabelSize === 'custom' && (
                  <>
                    <Box sx={{ width: 78 }}>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5 }}>W (mm)</Typography>
                      <TextField type="number" size="small" fullWidth value={barcodeEff.customWidthMm ?? 50}
                        onChange={e => setBc({ customWidthMm: e.target.value })} inputProps={{ min: 10, max: 300 }} sx={fieldSx} />
                    </Box>
                    <Box sx={{ width: 78 }}>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5 }}>H (mm)</Typography>
                      <TextField type="number" size="small" fullWidth value={barcodeEff.customHeightMm ?? 25}
                        onChange={e => setBc({ customHeightMm: e.target.value })} inputProps={{ min: 8, max: 300 }} sx={fieldSx} />
                    </Box>
                  </>
                )}
              </Box>
            );

            const saveRow = (
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 2 }}>
                {isDirty.barcode && <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 600, mr: 'auto', alignSelf: 'center' }}>Unsaved</Typography>}
                <Button size="small" variant="outlined" disabled={!isDirty.barcode} onClick={() => setBarcodeDraft(null)} sx={{ textTransform: 'none', borderRadius: '8px' }}>Discard</Button>
                <Button size="small" variant="contained" disabled={!isDirty.barcode || savingSection === 'barcode'} onClick={() => saveSection('barcode')}
                  startIcon={savingSection === 'barcode' ? <CircularProgress size={13} color="inherit" /> : <Save size={13} />}
                  sx={{ ...gradBtnSx, textTransform: 'none' }}>Save</Button>
              </Box>
            );

            if (isCustomLayout) {
              return (
                <CardContent sx={{ p: 2 }}>
                  {layoutModeSwitch}
                  <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'flex-end', mb: 2 }}>
                    {sizeSelect}
                    <Box sx={{ width: 90 }}>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5 }}>Columns</Typography>
                      <TextField type="number" size="small" fullWidth value={barcodeEff.columns || 1}
                        onChange={e => { const v = e.target.value; setBc({ columns: v === '' ? '' : Math.max(1, Math.min(8, Number(v) || 1)) }); }}
                        onBlur={() => setBc({ columns: Math.max(1, Math.min(8, Number(barcodeEff.columns) || 1)) })}
                        inputProps={{ min: 1, max: 8 }} sx={fieldSx} />
                    </Box>
                    <Box sx={{ width: 90 }}>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5 }}>Copies</Typography>
                      <TextField type="number" size="small" fullWidth value={barcodeEff.copies || 1}
                        onChange={e => { const v = e.target.value; setBc({ copies: v === '' ? '' : Math.max(1, Math.min(500, Number(v) || 1)) }); }}
                        onBlur={() => setBc({ copies: Math.max(1, Math.min(500, Number(barcodeEff.copies) || 1)) })}
                        inputProps={{ min: 1, max: 500 }} sx={fieldSx} />
                    </Box>
                    <Box sx={{ width: 120 }}>
                      <TextField select label="Label border" size="small" fullWidth value={barcodeEff.borderStyle || 'solid'}
                        onChange={e => setBc({ borderStyle: e.target.value })} sx={fieldSx}>
                        {BORDER_STYLES.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                      </TextField>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Background</Typography>
                        <input type="color" value={barcodeEff.backgroundColor || '#ffffff'} onChange={e => setBc({ backgroundColor: e.target.value })}
                          style={{ width: 52, height: 36, border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Text colour</Typography>
                        <input type="color" value={barcodeEff.textColor || '#000000'} onChange={e => setBc({ textColor: e.target.value })}
                          style={{ width: 52, height: 36, border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
                      </Box>
                    </Box>
                  </Box>

                  <LabelDesigner
                    widthMm={sizeEntry.widthMm}
                    heightMm={sizeEntry.heightMm}
                    layout={barcodeEff.customLayout || { elements: [] }}
                    onChange={(next) => setBc({ customLayout: next })}
                    onResetTemplate={() => setBc({ customLayout: templateLayout(barcodeEff, sizeEntry.widthMm, sizeEntry.heightMm) })}
                    item={sampleItem}
                    lbl={barcodeEff}
                    primary={primary}
                  />

                  <Box sx={{ mt: 2, maxWidth: 520 }}>
                    <ToggleRow
                      label="Auto Print Barcodes"
                      desc="After saving a purchase, opens a print popup for that bill's items instead of the invoice preview"
                      checked={barcodeEff.autoPrintAfterPurchase === true}
                      onChange={v => setBc({ autoPrintAfterPurchase: v })}
                    />
                  </Box>
                  {saveRow}
                </CardContent>
              );
            }

            return (
              <CardContent sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', gap: 2.5, flexDirection: { xs: 'column', md: 'row' } }}>
                  {/* Left: all settings */}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    {layoutModeSwitch}
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.65rem' }}>Code Type</Typography>
                    <Box sx={{ display: 'flex', gap: 0.75, mb: 1.5 }}>
                      {[{ value: 'barcode', label: 'Barcode', icon: Barcode }, { value: 'qr', label: 'QR Code', icon: QrCode }].map((tile) => {
                        const active = codeType === tile.value;
                        return (
                          <Box key={tile.value} onClick={() => setBc({ codeType: tile.value })}
                            sx={{
                              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75,
                              px: 1.5, py: 0.85, borderRadius: 1.5, cursor: 'pointer', userSelect: 'none', transition: 'all 0.12s',
                              border: '1.5px solid', borderColor: active ? primary : 'divider',
                              bgcolor: active ? alpha(primary, 0.08) : 'transparent',
                              color: active ? primary : 'text.secondary', fontWeight: 700, fontSize: '0.82rem',
                              '&:hover': { borderColor: primary, color: primary },
                            }}>
                            <tile.icon size={16} />{tile.label}
                          </Box>
                        );
                      })}
                    </Box>

                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.65rem' }}>Fields on Label</Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 0.25, mb: 1.5 }}>
                      {[
                        { key: 'showItemName', label: 'Item Name' }, { key: 'showItemCode', label: 'Item Code' },
                        { key: 'showCategory', label: 'Category' }, { key: 'showMrp', label: 'MRP (struck off)' },
                        { key: 'showSalePrice', label: 'Sale Price' }, { key: 'showBarcode', label: 'Barcode Image' },
                        { key: 'showBarcodeNumber', label: 'Barcode Number' }, { key: 'showBusinessName', label: 'Business Name' },
                        { key: 'showHsn', label: 'HSN / SAC Code' }, { key: 'showExtraFields', label: 'Extra Fields' },
                      ].map(({ key, label }) => {
                        const on = barcodeEff[key] !== false;
                        return <ToggleRow key={key} label={label} checked={on} onChange={v => setBc({ [key]: v })} />;
                      })}
                    </Box>

                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.65rem' }}>Print Behavior</Typography>
                    <Box sx={{ mb: 1.5 }}>
                      <ToggleRow
                        label="Auto Print Barcodes"
                        desc="After saving a purchase, opens a print popup for that bill's items instead of the invoice preview"
                        checked={barcodeEff.autoPrintAfterPurchase === true}
                        onChange={v => setBc({ autoPrintAfterPurchase: v })}
                      />
                    </Box>

                    <Box sx={{ display: 'flex', gap: 1.5, mb: 1.5 }}>
                      {sizeSelect}
                      <Box sx={{ width: 100 }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5 }}>Columns</Typography>
                        <TextField type="number" size="small" fullWidth value={barcodeEff.columns || 1}
                          onChange={e => { const v = e.target.value; setBc({ columns: v === '' ? '' : Math.max(1, Math.min(8, Number(v) || 1)) }); }}
                          onBlur={() => setBc({ columns: Math.max(1, Math.min(8, Number(barcodeEff.columns) || 1)) })}
                          inputProps={{ min: 1, max: 8 }} sx={fieldSx} />
                      </Box>
                      <Box sx={{ width: 100 }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5 }}>Copies</Typography>
                        <TextField type="number" size="small" fullWidth value={barcodeEff.copies || 1}
                          onChange={e => { const v = e.target.value; setBc({ copies: v === '' ? '' : Math.max(1, Math.min(500, Number(v) || 1)) }); }}
                          onBlur={() => setBc({ copies: Math.max(1, Math.min(500, Number(barcodeEff.copies) || 1)) })}
                          inputProps={{ min: 1, max: 500 }} sx={fieldSx} />
                      </Box>
                    </Box>

                    <Box sx={{ display: 'flex', gap: 1.5, mb: 1.5 }}>
                      <TextField select label="Code Position" size="small" fullWidth value={barcodeEff.codePosition || 'top'}
                        onChange={e => setBc({ codePosition: e.target.value })} sx={fieldSx}>
                        {CODE_POSITIONS.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                      </TextField>
                      <TextField select label="Text Alignment" size="small" fullWidth value={barcodeEff.contentAlign || 'center'}
                        onChange={e => setBc({ contentAlign: e.target.value })} sx={fieldSx}>
                        {CONTENT_ALIGNS.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                      </TextField>
                    </Box>

                    <TextField select label="Border" size="small" fullWidth value={barcodeEff.borderStyle || 'solid'}
                      onChange={e => setBc({ borderStyle: e.target.value })} sx={{ ...fieldSx, mb: 1.5 }}>
                      {BORDER_STYLES.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                    </TextField>

                    <Box sx={{ mb: 1.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.25 }}>
                        <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>Content (Text) Size</Typography>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: primary }}>{Math.round(contentScale * 100)}%</Typography>
                      </Box>
                      <Slider size="small" min={0.4} max={2.0} step={0.05} value={contentScale}
                        onChange={(_, v) => setBc({ contentScale: v })}
                        marks={[{ value: 0.4, label: '40%' }, { value: 1.0, label: '100%' }, { value: 2.0, label: '200%' }]}
                        sx={{ color: primary, '& .MuiSlider-markLabel': { fontSize: '0.6rem' } }} />
                    </Box>

                    <Box sx={{ mb: 1.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.25 }}>
                        <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>Code (Barcode/QR) Size</Typography>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: primary }}>{Math.round(codeScale * 100)}%</Typography>
                      </Box>
                      <Slider size="small" min={0.3} max={3.0} step={0.05} value={codeScale}
                        onChange={(_, v) => setBc({ codeScale: v })}
                        marks={[{ value: 0.3, label: '30%' }, { value: 1.0, label: '100%' }, { value: 2.0, label: '200%' }, { value: 3.0, label: '300%' }]}
                        sx={{ color: primary, '& .MuiSlider-markLabel': { fontSize: '0.58rem' } }} />
                    </Box>

                    <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Background</Typography>
                        <input type="color" value={barcodeEff.backgroundColor || '#ffffff'} onChange={e => setBc({ backgroundColor: e.target.value })}
                          style={{ width: '100%', height: 36, border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
                      </Box>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Text Color</Typography>
                        <input type="color" value={barcodeEff.textColor || '#000000'} onChange={e => setBc({ textColor: e.target.value })}
                          style={{ width: '100%', height: 36, border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
                      </Box>
                    </Box>

                    <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'text.secondary', display: 'block', mb: 0.5 }}>Fields &amp; Order</Typography>
                    <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.65rem', display: 'block', mb: 1 }}>Drag ≡ to reorder · tap row to expand</Typography>
                    {fieldOrder.map((key) => {
                      const meta = ALL_LABEL_FIELDS.find(f => f.key === key);
                      if (!meta) return null;
                      const on = barcodeEff[key] !== false;
                      const isExpanded = barcodeExpandedField === key;
                      const fst = fieldStyles[key] || {};
                      const customLabel = fieldLabels[key] ?? '';
                      const sizeVal = fst.size || 'medium';
                      const colorVal = fst.color || '';
                      return (
                        <Box key={key} sx={{ mb: 0.5 }}>
                          <Box
                            draggable
                            onDragStart={() => handleDragStart(key)}
                            onDragOver={e => handleDragOver(e, key)}
                            onDrop={handleDrop}
                            onClick={() => setBarcodeExpandedField(isExpanded ? null : key)}
                            sx={{
                              display: 'flex', alignItems: 'center', gap: 0.75,
                              px: 1, py: 0.6, borderRadius: isExpanded ? '6px 6px 0 0' : 1.5,
                              border: '1px solid',
                              borderColor: on ? alpha(primary, 0.3) : 'divider',
                              borderBottom: isExpanded ? 'none' : undefined,
                              bgcolor: on ? alpha(primary, 0.05) : 'transparent',
                              cursor: 'pointer', userSelect: 'none', transition: 'all 0.12s',
                              '&:hover': { borderColor: alpha(primary, 0.4), bgcolor: alpha(primary, 0.08) },
                            }}>
                            <Box sx={{ color: 'text.disabled', fontSize: '0.75rem', lineHeight: 1, flexShrink: 0, cursor: 'grab' }}>≡</Box>
                            <Typography variant="caption" sx={{ flex: 1, fontSize: '0.75rem', fontWeight: 600, color: on ? primary : 'text.secondary' }}>
                              {customLabel || meta.defaultLabel}
                              {fst.size && fst.size !== 'medium' && fst.size !== 'md' && (
                                <Box component="span" sx={{ ml: 0.5, fontSize: '0.6rem', opacity: 0.6, fontWeight: 400 }}>({fst.size.toUpperCase()})</Box>
                              )}
                            </Typography>
                            {fst.color && (
                              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: fst.color, border: '1px solid #ccc', flexShrink: 0 }} />
                            )}
                            <Box onClick={(e) => { e.stopPropagation(); setBc({ [key]: !on }); }}
                              sx={{ px: 1, py: 0.25, borderRadius: 1.5, cursor: 'pointer', fontSize: '0.65rem', fontWeight: 700,
                                bgcolor: on ? alpha(primary, 0.15) : 'action.hover',
                                color: on ? primary : 'text.disabled',
                                border: '1px solid', borderColor: on ? alpha(primary, 0.3) : 'divider',
                                flexShrink: 0,
                              }}>
                              {on ? 'ON' : 'OFF'}
                            </Box>
                          </Box>
                          {isExpanded && (
                            <Box sx={{ px: 1, py: 1, border: '1px solid', borderColor: alpha(primary, 0.3), borderTop: 'none', borderRadius: '0 0 6px 6px', bgcolor: alpha(primary, 0.02) }}>
                              <TextField
                                size="small" fullWidth
                                label="Custom label text"
                                placeholder={meta.defaultLabel}
                                value={customLabel}
                                onChange={e => setFieldLabel(key, e.target.value)}
                                helperText="Leave blank to hide label prefix"
                                sx={{ mb: 1, '& .MuiInputBase-input': { fontSize: '0.78rem' } }}
                              />
                              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', mb: 0.5 }}>Size</Typography>
                              <Box sx={{ display: 'flex', gap: 0.4, mb: 1, flexWrap: 'wrap' }}>
                                {[
                                  { val: 'xs', label: 'XS' }, { val: 'sm', label: 'S' }, { val: 'md', label: 'M' },
                                  { val: 'lg', label: 'L' }, { val: 'xl', label: 'XL' }, { val: '2xl', label: '2XL' },
                                ].map(({ val: sz, label }) => {
                                  const active = !(Number(fst.fontPt) > 0) && (sizeVal === sz || (sz === 'md' && (sizeVal === 'medium' || !sizeVal)));
                                  return (
                                    <Box key={sz} onClick={() => setBc({ fieldStyles: { ...fieldStyles, [key]: { ...(fieldStyles[key] || {}), size: sz, fontPt: '' } } })}
                                      sx={{
                                        flex: '1 0 auto', textAlign: 'center', py: 0.35, px: 0.5, borderRadius: 1.5, cursor: 'pointer',
                                        border: '1px solid', fontSize: '0.62rem',
                                        fontWeight: active ? 700 : 400,
                                        borderColor: active ? primary : 'divider',
                                        bgcolor: active ? alpha(primary, 0.12) : 'transparent',
                                        color: active ? primary : 'text.secondary',
                                      }}>
                                      {label}
                                    </Box>
                                  );
                                })}
                              </Box>
                              <TextField size="small" type="number" fullWidth label="Exact font size" placeholder="Use the size above"
                                value={fst.fontPt ?? ''}
                                onChange={e => setFieldStyle(key, 'fontPt', e.target.value === '' ? '' : Math.min(72, Math.max(3, Number(e.target.value) || 0)))}
                                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: 3, max: 72, step: 0.5 }, input: { endAdornment: <InputAdornment position="end">pt</InputAdornment> } }}
                                helperText="Overrides the XS–2XL size. Leave blank to use it."
                                sx={{ mb: 1, '& .MuiInputBase-input': { fontSize: '0.78rem' } }} />
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, flexShrink: 0 }}>Color</Typography>
                                <input type="color" value={colorVal || barcodeEff.textColor || '#000000'} onChange={e => setFieldStyle(key, 'color', e.target.value)}
                                  style={{ flex: 1, height: 28, border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', padding: 1 }} />
                                {colorVal && (
                                  <Box onClick={() => setFieldStyle(key, 'color', '')}
                                    sx={{ fontSize: '0.65rem', color: 'text.disabled', cursor: 'pointer', '&:hover': { color: 'error.main' } }}>
                                    reset
                                  </Box>
                                )}
                              </Box>
                            </Box>
                          )}
                        </Box>
                      );
                    })}
                  </Box>

                  {/* Right: live preview */}
                  <Box sx={{ width: { xs: '100%', md: 220 }, flexShrink: 0 }}>
                    <Typography variant="caption" sx={{ color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.07em', fontSize: '0.6rem', display: 'block', mb: 1, textAlign: 'center' }}>Live Preview</Typography>
                    <Box sx={{ position: { md: 'sticky' }, top: { md: 16 }, display: 'flex', justifyContent: 'center', p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: '#f8f8f8' }}>
                      <UnifiedLabel item={sampleItem} sizeConfig={previewSizeConfig} lbl={lblWithOrder} mode={codeType} />
                    </Box>
                  </Box>
                </Box>

                {saveRow}
              </CardContent>
            );
          })()}

          {/* Loyalty tab */}
          {advancedTab === 'loyalty' && (
            <CardContent sx={{ p: 2 }}>
              <ToggleRow label="Enable Loyalty Program" desc="Reward customers with points on every purchase"
                checked={!!config.features?.loyalty}
                onChange={async v => { await saveConfig({ ...config, features: { ...config.features, loyalty: v } }); }} />
              {config.features?.loyalty && (() => {
                const pts = Number(loyaltyEff.pointsPerRupee ?? 1);
                const every = Number(loyaltyEff.earnEveryRupees ?? 1);
                const rpp = Number(loyaltyEff.rupeePerPoint ?? 0.25);
                const minR = Number(loyaltyEff.minRedeemPoints ?? 10);
                const earnedExample = Math.floor((500 / every) * pts);
                const redeemExample = Math.floor(minR * rpp * 100) / 100;
                return (
                  <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <TextField size="small" fullWidth label="Program Name" placeholder="e.g. Reward Points"
                      value={loyaltyEff.programName ?? 'Reward Points'}
                      onChange={e => setLoyaltyDraft(d => ({ ...(d ?? config.loyalty ?? {}), programName: e.target.value }))} sx={fieldSx} />
                    <Box sx={{ p: 1.5, borderRadius: '10px', border: '1px solid #e5e7eb', bgcolor: '#fafafa' }}>
                      <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#57433e', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1 }}>Earn Rule</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                        <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary' }}>Customer earns</Typography>
                        <TextField size="small" type="number" value={loyaltyEff.pointsPerRupee ?? 1}
                          onChange={e => { const v = e.target.value; setLoyaltyDraft(d => ({ ...(d ?? config.loyalty ?? {}), pointsPerRupee: v === '' ? '' : Math.max(0, Number(v) || 0) })); }}
                          onBlur={() => setLoyaltyDraft(d => ({ ...(d ?? config.loyalty ?? {}), pointsPerRupee: Math.max(0, Number((d ?? config.loyalty ?? {}).pointsPerRupee) || 0) }))}
                          inputProps={{ min: 0, step: 1, style: { textAlign: 'center', padding: '4px 6px' } }} sx={{ ...fieldSx, width: 60 }} />
                        <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary' }}>pt(s) for every</Typography>
                        <TextField size="small" type="number" value={loyaltyEff.earnEveryRupees ?? 1}
                          onChange={e => { const v = e.target.value; setLoyaltyDraft(d => ({ ...(d ?? config.loyalty ?? {}), earnEveryRupees: v === '' ? '' : Math.max(1, Number(v) || 1) })); }}
                          onBlur={() => setLoyaltyDraft(d => ({ ...(d ?? config.loyalty ?? {}), earnEveryRupees: Math.max(1, Number((d ?? config.loyalty ?? {}).earnEveryRupees) || 1) }))}
                          inputProps={{ min: 1, step: 1, style: { textAlign: 'center', padding: '4px 6px' } }} sx={{ ...fieldSx, width: 60 }} />
                        <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary' }}>₹ spent</Typography>
                      </Box>
                      <Typography variant="caption" sx={{ color: primary, fontWeight: 600, display: 'block', mt: 0.75 }}>
                        ₹500 bill → <strong>{earnedExample} pts</strong>
                      </Typography>
                    </Box>
                    <Box sx={{ p: 1.5, borderRadius: '10px', border: '1px solid #e5e7eb', bgcolor: '#fafafa' }}>
                      <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#57433e', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1 }}>Redeem Rule</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', mb: 0.75 }}>
                        <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary' }}>1 pt =</Typography>
                        <TextField size="small" type="number" value={loyaltyEff.rupeePerPoint ?? 0.25}
                          onChange={e => { const v = e.target.value; setLoyaltyDraft(d => ({ ...(d ?? config.loyalty ?? {}), rupeePerPoint: v === '' ? '' : Math.max(0, Number(v) || 0) })); }}
                          onBlur={() => setLoyaltyDraft(d => ({ ...(d ?? config.loyalty ?? {}), rupeePerPoint: Math.max(0, Number((d ?? config.loyalty ?? {}).rupeePerPoint) || 0) }))}
                          inputProps={{ min: 0, step: 0.05, style: { textAlign: 'center', padding: '4px 6px' } }} sx={{ ...fieldSx, width: 70 }} />
                        <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary' }}>₹ &nbsp;·&nbsp; Min</Typography>
                        <TextField size="small" type="number" value={loyaltyEff.minRedeemPoints ?? 10}
                          onChange={e => { const v = e.target.value; setLoyaltyDraft(d => ({ ...(d ?? config.loyalty ?? {}), minRedeemPoints: v === '' ? '' : Math.max(1, Number(v) || 1) })); }}
                          onBlur={() => setLoyaltyDraft(d => ({ ...(d ?? config.loyalty ?? {}), minRedeemPoints: Math.max(1, Number((d ?? config.loyalty ?? {}).minRedeemPoints) || 1) }))}
                          inputProps={{ min: 1, style: { textAlign: 'center', padding: '4px 6px' } }} sx={{ ...fieldSx, width: 70 }} />
                        <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary' }}>pts to redeem</Typography>
                      </Box>
                      <Typography variant="caption" sx={{ color: '#b45309', fontWeight: 600 }}>
                        {minR} pts = <strong>₹{redeemExample} off</strong>
                      </Typography>
                    </Box>
                  </Box>
                );
              })()}
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1.5 }}>
                {isDirty.loyalty && <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 600, mr: 'auto', alignSelf: 'center' }}>Unsaved</Typography>}
                <Button size="small" variant="outlined" disabled={!isDirty.loyalty} onClick={() => setLoyaltyDraft(null)} sx={{ textTransform: 'none', borderRadius: '8px' }}>Discard</Button>
                <Button size="small" variant="contained" disabled={!isDirty.loyalty || savingSection === 'loyalty'} onClick={() => saveSection('loyalty')}
                  startIcon={savingSection === 'loyalty' ? <CircularProgress size={13} color="inherit" /> : <Save size={13} />}
                  sx={{ ...gradBtnSx, textTransform: 'none' }}>Save</Button>
              </Box>
            </CardContent>
          )}

          {/* GST Defaults tab */}
          {advancedTab === 'gst' && (
            <CardContent sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                <ToggleRow label="GST On by default" desc="New items open with GST enabled"
                  checked={gstEff.gstOn ?? false} onChange={v => setGstDefaultsDraft(d => ({ ...(d ?? config.itemDefaults ?? {}), gstOn: v }))} />
                {gstEff.gstOn && (
                  <>
                    <FormControl size="small" fullWidth sx={fieldSx}>
                      <InputLabel>Default GST Rate</InputLabel>
                      <Select label="Default GST Rate" value={gstEff.useCustomRate ? 'custom' : (gstEff.taxRate ?? 18)}
                        onChange={e => { if (e.target.value === 'custom') setGstDefaultsDraft(d => ({ ...(d ?? config.itemDefaults ?? {}), useCustomRate: true })); else setGstDefaultsDraft(d => ({ ...(d ?? config.itemDefaults ?? {}), useCustomRate: false, taxRate: Number(e.target.value) })); }}
                        MenuProps={{ PaperProps: { sx: { maxHeight: 320 } } }}>
                        {GST_RATES.map(r => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
                        <MenuItem value="custom"><em>Custom %…</em></MenuItem>
                      </Select>
                    </FormControl>
                    {gstEff.useCustomRate && (
                      <TextField size="small" fullWidth type="number" label="Custom GST %" sx={fieldSx}
                        value={gstEff.taxRate ?? ''}
                        inputProps={{ min: 0, max: 100, step: 0.01 }}
                        onChange={e => { const v = e.target.value === '' ? '' : Math.max(0, Math.min(100, Number(e.target.value))); setGstDefaultsDraft(d => ({ ...(d ?? config.itemDefaults ?? {}), taxRate: v })); }}
                        InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }} />
                    )}
                    <FormControl size="small" fullWidth sx={fieldSx}>
                      <InputLabel>GST Type</InputLabel>
                      <Select label="GST Type" value={gstEff.gstType ?? 'cgst_sgst'}
                        onChange={e => setGstDefaultsDraft(d => ({ ...(d ?? config.itemDefaults ?? {}), gstType: e.target.value }))}>
                        <MenuItem value="cgst_sgst">Intra-state (CGST + SGST)</MenuItem>
                        <MenuItem value="igst">Inter-state (IGST)</MenuItem>
                        <MenuItem value="utgst">Union Territory (CGST + UTGST)</MenuItem>
                        <MenuItem value="composite">Composite Scheme</MenuItem>
                      </Select>
                    </FormControl>
                    {(['cgst_sgst', 'utgst'].includes(gstEff.gstType ?? 'cgst_sgst')) && (() => {
                      const rate = Number(gstEff.taxRate) || 0;
                      const half = (rate / 2).toFixed(rate % 1 === 0 ? 0 : 2);
                      const secondLabel = gstEff.gstType === 'utgst' ? 'UTGST' : 'SGST';
                      return (
                        <Box sx={{ display: 'flex', gap: 1, p: 1, borderRadius: '10px', bgcolor: '#f6efe9', border: '1px solid #e5e7eb' }}>
                          <Box sx={{ flex: 1, textAlign: 'center', py: 0.5 }}>
                            <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#57433e', textTransform: 'uppercase', letterSpacing: '0.04em' }}>CGST</Typography>
                            <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: '#3f1417' }}>{half}%</Typography>
                          </Box>
                          <Box sx={{ width: '1px', bgcolor: '#e5e7eb' }} />
                          <Box sx={{ flex: 1, textAlign: 'center', py: 0.5 }}>
                            <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#57433e', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{secondLabel}</Typography>
                            <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: '#3f1417' }}>{half}%</Typography>
                          </Box>
                        </Box>
                      );
                    })()}
                    <ToggleRow label="Price inclusive" desc="Sale price includes GST"
                      checked={gstEff.taxInclusive ?? false} onChange={v => setGstDefaultsDraft(d => ({ ...(d ?? config.itemDefaults ?? {}), taxInclusive: v }))} />
                  </>
                )}
              </Box>
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1.5 }}>
                {isDirty.gst && <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 600, mr: 'auto', alignSelf: 'center' }}>Unsaved</Typography>}
                <Button size="small" variant="outlined" disabled={!isDirty.gst} onClick={() => setGstDefaultsDraft(null)} sx={{ textTransform: 'none', borderRadius: '8px' }}>Discard</Button>
                <Button size="small" variant="contained" disabled={!isDirty.gst || savingSection === 'gst'} onClick={() => saveSection('gst')}
                  startIcon={savingSection === 'gst' ? <CircularProgress size={13} color="inherit" /> : <Save size={13} />}
                  sx={{ ...gradBtnSx, textTransform: 'none' }}>Save</Button>
              </Box>
            </CardContent>
          )}

          {/* Others tab — misc item-pricing behaviors that don't belong under
              GST Defaults specifically. Shares the same config.itemDefaults
              object/draft/save plumbing as the GST tab (both save via
              saveSection('gst')) since there's no reason for a second config
              namespace just for two toggles. */}
          {advancedTab === 'others' && (
            <CardContent sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                <ToggleRow label="Auto-update sale rate" desc="When saving a Sales invoice with a changed price, update the item's sale price to match"
                  checked={gstEff.autoUpdateSalePrice ?? false} onChange={v => setGstDefaultsDraft(d => ({ ...(d ?? config.itemDefaults ?? {}), autoUpdateSalePrice: v }))} />
                <ToggleRow label="Auto-update purchase rate" desc="When saving a Purchase bill with a changed price, update the item's purchase price to match"
                  checked={gstEff.autoUpdatePurchasePrice ?? false} onChange={v => setGstDefaultsDraft(d => ({ ...(d ?? config.itemDefaults ?? {}), autoUpdatePurchasePrice: v }))} />
                {(gstEff.autoUpdateSalePrice || gstEff.autoUpdatePurchasePrice) && (
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Only applies when the rate typed on the bill is different from the item's current price — the item master is updated the moment the bill is saved. Leaving the price unchanged never rewrites anything.
                  </Typography>
                )}
              </Box>
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1.5 }}>
                {isDirty.gst && <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 600, mr: 'auto', alignSelf: 'center' }}>Unsaved</Typography>}
                <Button size="small" variant="outlined" disabled={!isDirty.gst} onClick={() => setGstDefaultsDraft(null)} sx={{ textTransform: 'none', borderRadius: '8px' }}>Discard</Button>
                <Button size="small" variant="contained" disabled={!isDirty.gst || savingSection === 'gst'} onClick={() => saveSection('gst')}
                  startIcon={savingSection === 'gst' ? <CircularProgress size={13} color="inherit" /> : <Save size={13} />}
                  sx={{ ...gradBtnSx, textTransform: 'none' }}>Save</Button>
              </Box>
            </CardContent>
          )}
        </Card>
      </Box>

      {/* DEAD CODE REMOVED: old 3-col barcode/loyalty/gst grid replaced by tabbed card above */}
      {false && <Box>
          {/* Barcode Label */}
          <Grid item xs={12} md={4}>
            <Card elevation={0} sx={{ ...cardSx.sx, height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ px: 2.5, py: 1.5, borderBottom: '1px solid #f6efe9', display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ display: 'flex', opacity: 0.7 }}>
                  <Barcode size={13} color={primary} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', lineHeight: 1.2 }}>Barcode Label</Typography>
                  <Typography variant="caption" color="text.secondary">Fields on printed labels</Typography>
                </Box>
              </Box>
              <CardContent sx={{ p: 2, flex: 1, display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, flex: 1 }}>
                  {[
                    { key: 'showItemName',      label: 'Item Name',        desc: 'Product name' },
                    { key: 'showItemCode',      label: 'Item Code',        desc: 'Article code' },
                    { key: 'showCategory',      label: 'Category',         desc: 'Item category' },
                    { key: 'showMrp',           label: 'MRP (struck off)', desc: 'MRP strikethrough' },
                    { key: 'showSalePrice',     label: 'Sale Price',       desc: 'Price in bold' },
                    { key: 'showBarcode',       label: 'Barcode Image',    desc: 'Barcode bars' },
                    { key: 'showBarcodeNumber', label: 'Barcode Number',   desc: 'Digits below bars' },
                    { key: 'showBusinessName',  label: 'Business Name',    desc: 'Shop name' },
                    { key: 'showHsn',           label: 'HSN / SAC Code',   desc: 'Tax code' },
                    { key: 'showExtraFields',   label: 'Extra Fields',     desc: 'Custom fields' },
                  ].map(({ key, label }) => {
                    const on = barcodeEff[key] !== false;
                    return (
                      <Box key={key} onClick={() => setBarcodeDraft(d => ({ ...(d ?? config.barcodeLabel ?? {}), [key]: !on }))}
                        sx={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1,
                          px: 1.25, py: 0.6, borderRadius: '8px',
                          cursor: 'pointer', transition: 'background 0.12s',
                          '&:hover': { bgcolor: '#f6efe9' },
                        }}>
                        <Typography sx={{ fontWeight: 500, fontSize: '0.82rem', color: on ? '#3f1417' : '#5f4f47', lineHeight: 1.2 }}>{label}</Typography>
                        <Switch size="small" checked={on} onChange={e => { e.stopPropagation(); setBarcodeDraft(d => ({ ...(d ?? config.barcodeLabel ?? {}), [key]: e.target.checked })); }} />
                      </Box>
                    );
                  })}
                </Box>
                <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 1 }}>Default label size</Typography>
                  <TextField select size="small" fullWidth value={barcodeEff.defaultLabelSize || 'standard'}
                    onChange={e => setBarcodeDraft(d => ({ ...(d ?? config.barcodeLabel ?? {}), defaultLabelSize: e.target.value }))}>
                    {[
                      { value: 'standard', label: '80×40mm (Standard)' },
                      { value: '50x40',    label: '50×40mm' },
                      { value: '50x30',    label: '50×30mm' },
                      { value: '50x25',    label: '50×25mm' },
                      { value: '38x25',    label: '38×25mm (Jewellery)' },
                      { value: '30x20',    label: '30×20mm (Mini)' },
                      { value: 'small',    label: '58×30mm (Narrow Thermal)' },
                      { value: '60x40',    label: '60×40mm' },
                      { value: '70x40',    label: '70×40mm' },
                      { value: '100x50',   label: '100×50mm (Large)' },
                      { value: '100x75',   label: '100×75mm (Shipping)' },
                      { value: '100x150',  label: '100×150mm (Large Shipping)' },
                      { value: 'large',    label: '100×60mm' },
                      { value: 'a4',       label: 'A4 Full Page' },
                    ].map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                  </TextField>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mt: 1.5, mb: 0.75 }}>Default columns per row</Typography>
                  <TextField type="number" size="small" fullWidth value={barcodeEff.columns || 1}
                    onChange={e => { const v = e.target.value; setBarcodeDraft(d => ({ ...(d ?? config.barcodeLabel ?? {}), columns: v === '' ? '' : Math.max(1, Math.min(8, Number(v) || 1)) })); }}
                    onBlur={() => setBarcodeDraft(d => ({ ...(d ?? config.barcodeLabel ?? {}), columns: Math.max(1, Math.min(8, Number((d ?? config.barcodeLabel ?? {}).columns) || 1)) }))}
                    inputProps={{ min: 1, max: 8 }}
                    helperText="For printers that print 2+ labels side by side" />
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.5, justifyContent: 'flex-end' }}>
                    {isDirty.barcode && <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 600, mr: 'auto' }}>Unsaved</Typography>}
                    <Button variant="outlined" size="small" disabled={!isDirty.barcode} onClick={() => setBarcodeDraft(null)}
                      sx={{ borderRadius: `${baseRadius + 2}px`, textTransform: 'none' }}>Discard</Button>
                    <Button variant="contained" size="small" startIcon={savingSection === 'barcode' ? <CircularProgress size={14} color="inherit" /> : <Save size={14} />}
                      disabled={!isDirty.barcode || savingSection === 'barcode'}
                      onClick={() => saveSection('barcode')}
                      sx={{ ...gradBtnSx, textTransform: 'none', px: 2 }}>
                      Save
                    </Button>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Loyalty */}
          <Grid item xs={12} md={4}>
            <Card elevation={0} sx={{ ...cardSx.sx, height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ px: 2.5, py: 1.5, borderBottom: '1px solid #f6efe9', display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ display: 'flex', opacity: 0.7 }}>
                  <Coins size={13} color={primary} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', lineHeight: 1.2 }}>Loyalty Points</Typography>
                  <Typography variant="caption" color="text.secondary">Reward customers on every sale</Typography>
                </Box>
              </Box>
              <CardContent sx={{ p: 2, flex: 1, display: 'flex', flexDirection: 'column' }}>
                {/* Enable toggle */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, py: 1, borderRadius: '10px', border: '1px solid #e5e7eb', bgcolor: '#fafafa', mb: 2 }}>
                  <Box>
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 700 }}>Enable Loyalty Program</Typography>
                    <Typography variant="caption" color="text.secondary">Reward customers with points on every purchase</Typography>
                  </Box>
                  <Switch size="small" checked={!!config.features?.loyalty}
                    onChange={async e => { await saveConfig({ ...config, features: { ...config.features, loyalty: e.target.checked } }); }} color="primary" />
                </Box>

                {config.features?.loyalty && (() => {
                  const pts = Number(loyaltyEff.pointsPerRupee ?? 1);
                  const every = Number(loyaltyEff.earnEveryRupees ?? 1);
                  const rpp = Number(loyaltyEff.rupeePerPoint ?? 0.25);
                  const minR = Number(loyaltyEff.minRedeemPoints ?? 10);
                  const exampleBill = 500;
                  const earnedExample = Math.floor((exampleBill / every) * pts);
                  const redeemExample = Math.floor(minR * rpp * 100) / 100;
                  return (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>

                      {/* Program name */}
                      <TextField size="small" fullWidth label="Program Name"
                        placeholder='e.g. Star Points, Reward Points'
                        value={loyaltyEff.programName ?? 'Reward Points'}
                        onChange={e => setLoyaltyDraft(d => ({ ...(d ?? config.loyalty ?? {}), programName: e.target.value }))}
                        sx={fieldSx} />

                      {/* Earning rule */}
                      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: `${baseRadius}px`, p: 1.5 }}>
                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1.25 }}>
                          How customers earn points
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary', flexShrink: 0 }}>Customer earns</Typography>
                          <TextField size="small" type="number"
                            value={loyaltyEff.pointsPerRupee ?? 1}
                            onChange={e => { const v = e.target.value; setLoyaltyDraft(d => ({ ...(d ?? config.loyalty ?? {}), pointsPerRupee: v === '' ? '' : Math.max(0, Number(v) || 0) })); }}
                          onBlur={() => setLoyaltyDraft(d => ({ ...(d ?? config.loyalty ?? {}), pointsPerRupee: Math.max(0, Number((d ?? config.loyalty ?? {}).pointsPerRupee) || 0) }))}
                            inputProps={{ min: 0, step: 1, style: { textAlign: 'center', padding: '5px 6px' } }}
                            sx={{ ...fieldSx, width: 64 }} />
                          <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary', flexShrink: 0 }}>point(s) for every</Typography>
                          <TextField size="small" type="number"
                            value={loyaltyEff.earnEveryRupees ?? 1}
                            onChange={e => { const v = e.target.value; setLoyaltyDraft(d => ({ ...(d ?? config.loyalty ?? {}), earnEveryRupees: v === '' ? '' : Math.max(1, Number(v) || 1) })); }}
                          onBlur={() => setLoyaltyDraft(d => ({ ...(d ?? config.loyalty ?? {}), earnEveryRupees: Math.max(1, Number((d ?? config.loyalty ?? {}).earnEveryRupees) || 1) }))}
                            inputProps={{ min: 1, step: 1, style: { textAlign: 'center', padding: '5px 6px' } }}
                            sx={{ ...fieldSx, width: 64 }} />
                          <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary', flexShrink: 0 }}>₹ spent</Typography>
                        </Box>
                        <Box sx={{ mt: 1.25, px: 1.25, py: 0.75, bgcolor: alpha(primary, 0.05), borderRadius: `${baseRadius - 2}px`, border: `1px dashed ${alpha(primary, 0.25)}` }}>
                          <Typography sx={{ fontSize: '0.75rem', color: primary, fontWeight: 600 }}>
                            Example: On a ₹{exampleBill} bill, customer earns <strong>{earnedExample} points</strong>
                          </Typography>
                        </Box>
                      </Box>

                      {/* Redemption rule */}
                      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: `${baseRadius}px`, p: 1.5 }}>
                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1.25 }}>
                          How customers redeem points
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1.25 }}>
                          <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary', flexShrink: 0 }}>1 point =</Typography>
                          <TextField size="small" type="number"
                            value={loyaltyEff.rupeePerPoint ?? 0.25}
                            onChange={e => { const v = e.target.value; setLoyaltyDraft(d => ({ ...(d ?? config.loyalty ?? {}), rupeePerPoint: v === '' ? '' : Math.max(0, Number(v) || 0) })); }}
                          onBlur={() => setLoyaltyDraft(d => ({ ...(d ?? config.loyalty ?? {}), rupeePerPoint: Math.max(0, Number((d ?? config.loyalty ?? {}).rupeePerPoint) || 0) }))}
                            inputProps={{ min: 0, step: 0.05, style: { textAlign: 'center', padding: '5px 6px' } }}
                            sx={{ ...fieldSx, width: 72 }} />
                          <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary', flexShrink: 0 }}>₹ discount</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary', flexShrink: 0 }}>Minimum points needed to redeem:</Typography>
                          <TextField size="small" type="number"
                            value={loyaltyEff.minRedeemPoints ?? 10}
                            onChange={e => { const v = e.target.value; setLoyaltyDraft(d => ({ ...(d ?? config.loyalty ?? {}), minRedeemPoints: v === '' ? '' : Math.max(1, Number(v) || 1) })); }}
                          onBlur={() => setLoyaltyDraft(d => ({ ...(d ?? config.loyalty ?? {}), minRedeemPoints: Math.max(1, Number((d ?? config.loyalty ?? {}).minRedeemPoints) || 1) }))}
                            inputProps={{ min: 1, style: { textAlign: 'center', padding: '5px 6px' } }}
                            sx={{ ...fieldSx, width: 72 }} />
                          <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary', flexShrink: 0 }}>points</Typography>
                        </Box>
                        <Box sx={{ mt: 1.25, px: 1.25, py: 0.75, bgcolor: alpha('#f59e0b', 0.07), borderRadius: `${baseRadius - 2}px`, border: `1px dashed ${alpha('#f59e0b', 0.4)}` }}>
                          <Typography sx={{ fontSize: '0.75rem', color: '#b45309', fontWeight: 600 }}>
                            Example: {minR} points = <strong>₹{redeemExample} off</strong> on next purchase
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                  );
                })()}

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2, pt: 1.5, borderTop: '1px solid', borderColor: 'divider', justifyContent: 'flex-end' }}>
                  {isDirty.loyalty && <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 600, mr: 'auto' }}>Unsaved changes</Typography>}
                  <Button variant="outlined" size="small" disabled={!isDirty.loyalty} onClick={() => setLoyaltyDraft(null)}
                    sx={{ borderRadius: `${baseRadius + 2}px`, textTransform: 'none' }}>Discard</Button>
                  <Button variant="contained" size="small" startIcon={savingSection === 'loyalty' ? <CircularProgress size={14} color="inherit" /> : <Save size={14} />}
                    disabled={!isDirty.loyalty || savingSection === 'loyalty'}
                    onClick={() => saveSection('loyalty')}
                    sx={{ ...gradBtnSx, textTransform: 'none', px: 2 }}>
                    Save
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Item GST Defaults */}
          <Grid item xs={12} md={4}>
            <Card elevation={0} sx={{ ...cardSx.sx, height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ px: 2.5, py: 1.5, borderBottom: '1px solid #f6efe9', display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ display: 'flex', opacity: 0.7 }}>
                  <Percent size={13} color={primary} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', lineHeight: 1.2 }}>Item GST Defaults</Typography>
                  <Typography variant="caption" color="text.secondary">Pre-fill when creating items</Typography>
                </Box>
              </Box>
              <CardContent sx={{ p: 2, flex: 1, display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.25, py: 0.875, borderRadius: `${baseRadius}px`, border: '1px solid', borderColor: 'divider', bgcolor: 'rgba(0,0,0,0.02)' }}>
                    <Box>
                      <Typography sx={{ fontSize: '0.82rem', fontWeight: 700 }}>GST On by default</Typography>
                      <Typography variant="caption" color="text.secondary">New items open with GST enabled</Typography>
                    </Box>
                    <Switch size="small" checked={gstEff.gstOn ?? false}
                      onChange={e => setGstDefaultsDraft(d => ({ ...(d ?? config.itemDefaults ?? {}), gstOn: e.target.checked }))} color="primary" />
                  </Box>
                  {(gstEff.gstOn) && (
                    <>
                      <FormControl size="small" fullWidth sx={fieldSx}>
                        <InputLabel>Default GST Rate</InputLabel>
                        <Select label="Default GST Rate"
                          value={gstEff.useCustomRate ? 'custom' : (gstEff.taxRate ?? 18)}
                          onChange={e => {
                            if (e.target.value === 'custom') {
                              setGstDefaultsDraft(d => ({ ...(d ?? config.itemDefaults ?? {}), useCustomRate: true }));
                            } else {
                              setGstDefaultsDraft(d => ({ ...(d ?? config.itemDefaults ?? {}), useCustomRate: false, taxRate: Number(e.target.value) }));
                            }
                          }}
                          MenuProps={{ PaperProps: { sx: { maxHeight: 320 } } }}>
                          {GST_RATES.map(r => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
                          <MenuItem value="custom"><em>Custom %…</em></MenuItem>
                        </Select>
                      </FormControl>
                      {gstEff.useCustomRate && (
                        <TextField size="small" fullWidth type="number" label="Custom GST %" sx={fieldSx}
                          value={gstEff.taxRate ?? ''}
                          inputProps={{ min: 0, max: 100, step: 0.01 }}
                          onChange={e => {
                            const raw = e.target.value;
                            const v = raw === '' ? '' : Math.max(0, Math.min(100, Number(raw)));
                            setGstDefaultsDraft(d => ({ ...(d ?? config.itemDefaults ?? {}), taxRate: v }));
                          }}
                          InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                        />
                      )}
                      <FormControl size="small" fullWidth sx={fieldSx}>
                        <InputLabel>Default GST Type</InputLabel>
                        <Select label="Default GST Type"
                          value={gstEff.gstType ?? 'cgst_sgst'}
                          onChange={e => setGstDefaultsDraft(d => ({ ...(d ?? config.itemDefaults ?? {}), gstType: e.target.value }))}>
                          <MenuItem value="cgst_sgst">Intra-state (CGST + SGST)</MenuItem>
                          <MenuItem value="igst">Inter-state (IGST)</MenuItem>
                          <MenuItem value="utgst">Union Territory (CGST + UTGST)</MenuItem>
                          <MenuItem value="composite">Composite Scheme</MenuItem>
                        </Select>
                      </FormControl>
                      {(['cgst_sgst', 'utgst'].includes(gstEff.gstType ?? 'cgst_sgst')) && (() => {
                        const rate = Number(gstEff.taxRate) || 0;
                        const half = (rate / 2).toFixed(rate % 1 === 0 ? 0 : 2);
                        const secondLabel = gstEff.gstType === 'utgst' ? 'UTGST' : 'SGST';
                        return (
                          <Box sx={{ display: 'flex', gap: 1, p: 1, borderRadius: `${baseRadius}px`, bgcolor: 'rgba(0,0,0,0.02)', border: '1px solid', borderColor: 'divider' }}>
                            <Box sx={{ flex: 1, textAlign: 'center', py: 0.5 }}>
                              <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em' }}>CGST</Typography>
                              <Typography sx={{ fontSize: '1rem', fontWeight: 800 }}>{half}%</Typography>
                            </Box>
                            <Box sx={{ width: '1px', bgcolor: 'divider' }} />
                            <Box sx={{ flex: 1, textAlign: 'center', py: 0.5 }}>
                              <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{secondLabel}</Typography>
                              <Typography sx={{ fontSize: '1rem', fontWeight: 800 }}>{half}%</Typography>
                            </Box>
                          </Box>
                        );
                      })()}
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.25, py: 0.875, borderRadius: `${baseRadius}px`, border: '1px solid', borderColor: 'divider', bgcolor: 'rgba(0,0,0,0.02)' }}>
                        <Box>
                          <Typography sx={{ fontSize: '0.82rem', fontWeight: 700 }}>Price inclusive</Typography>
                          <Typography variant="caption" color="text.secondary">Sale price includes GST</Typography>
                        </Box>
                        <Switch size="small" checked={gstEff.taxInclusive ?? false}
                          onChange={e => setGstDefaultsDraft(d => ({ ...(d ?? config.itemDefaults ?? {}), taxInclusive: e.target.checked }))} color="primary" />
                      </Box>
                    </>
                  )}
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2, pt: 1.5, borderTop: '1px solid', borderColor: 'divider', justifyContent: 'flex-end' }}>
                  {isDirty.gst && <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 600, mr: 'auto' }}>Unsaved</Typography>}
                  <Button variant="outlined" size="small" disabled={!isDirty.gst} onClick={() => setGstDefaultsDraft(null)}
                    sx={{ borderRadius: `${baseRadius + 2}px`, textTransform: 'none' }}>Discard</Button>
                  <Button variant="contained" size="small" startIcon={savingSection === 'gst' ? <CircularProgress size={14} color="inherit" /> : <Save size={14} />}
                    disabled={!isDirty.gst || savingSection === 'gst'}
                    onClick={() => saveSection('gst')}
                    sx={{ ...gradBtnSx, textTransform: 'none', px: 2 }}>
                    Save
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Grid>

        </Box>}

      <Box sx={{ mb: 2, display: activeTab === 'features' && featSub === 'sections' ? 'block' : 'none' }}>
        <Card elevation={0} sx={{ ...cardSx.sx }}>
          <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid #f6efe9', display: 'flex', alignItems: 'center', gap: 1 }}>
            <Package size={13} color={primary} style={{ opacity: 0.7 }} />
            <Typography sx={{ fontWeight: 700, fontSize: '0.875rem' }}>Custom Sections</Typography>
            <Typography variant="caption" sx={{ color: '#5f4f47', ml: 0.5 }}>
              — applies to {currentBusiness?.name || 'this business'} only
            </Typography>
          </Box>
          <CardContent sx={{ p: 2 }}>
            <SectionBuilder />
          </CardContent>
        </Card>
      </Box>

      {/* ── Invoice & Lists sub-tabs — one area at a time instead of one long page ── */}
      <Box sx={{ mb: 2, display: activeTab === 'invoice' ? 'flex' : 'none', gap: 0.75, flexWrap: 'wrap', p: 0.5, borderRadius: '12px', border: '1px solid #e5e7eb', bgcolor: '#fafafa', width: 'fit-content', maxWidth: '100%' }}>
        {[
          { key: 'print', label: 'Print & Layout', icon: Printer },
          { key: 'numbering', label: 'Numbering & Defaults', icon: Hash },
          { key: 'lists', label: 'Lists & Categories', icon: BookOpen },
        ].map((tab) => {
          const { key, label } = tab;
          const on = invoiceSub === key;
          return (
            <Box key={key} role="button" tabIndex={0} onClick={() => setInvoiceSub(key)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setInvoiceSub(key); } }}
              sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1.5, py: 0.75, borderRadius: '9px', cursor: 'pointer', userSelect: 'none',
                fontSize: '0.82rem', fontWeight: on ? 700 : 600, color: on ? '#fff' : '#57433e', bgcolor: on ? primary : 'transparent',
                transition: 'all 0.12s', '&:hover': { bgcolor: on ? primary : '#f6efe9' } }}>
              <tab.icon size={14} />{label}
              {key === 'numbering' && isDirty.invoiceNum && <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: on ? '#fff' : 'warning.main' }} />}
              {key === 'print' && isDirty.printOpts && <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: on ? '#fff' : 'warning.main' }} />}
            </Box>
          );
        })}
      </Box>

      {/* ── Lists & Categories ── */}
      <Box sx={{ mb: 2, display: activeTab === 'invoice' && invoiceSub === 'lists' ? 'block' : 'none' }}>
        <SH icon={BookOpen} title="Lists & Categories" subtitle="Reusable categories and units picked from dropdowns across Expenses and Items" />
        <Card elevation={0} sx={{ ...cardSx.sx }}>
          <Grid container>
            <Grid size={{ xs: 12, md: 6 }} sx={{ p: 2.25, borderRight: { md: '1px solid #f6efe9' }, borderBottom: { xs: '1px solid #f6efe9', md: 'none' } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <Box sx={{ width: 26, height: 26, borderRadius: '7px', bgcolor: alpha('#ea580c', 0.1), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <CreditCard size={13} color="#ea580c" />
                </Box>
                <Box>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', lineHeight: 1.2 }}>Expense Categories</Typography>
                  <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.68rem' }}>{(config.expenseCategories || []).length} categories</Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', gap: 0.75, mb: 1.25 }}>
                <TextField size="small" fullWidth placeholder="e.g. Rent, Utilities…" value={newExpenseCat}
                  onChange={e => setNewExpenseCat(e.target.value)}
                  onKeyDown={async e => { if (e.key === 'Enter' && newExpenseCat.trim()) { const cats = config.expenseCategories || []; if (!cats.includes(newExpenseCat.trim())) await saveConfig({ ...config, expenseCategories: [...cats, newExpenseCat.trim()] }); setNewExpenseCat(''); } }}
                  sx={fieldSx} />
                <Button variant="contained" disableElevation size="small" startIcon={<Plus size={13} />}
                  onClick={async () => { if (!newExpenseCat.trim()) return; const cats = config.expenseCategories || []; if (!cats.includes(newExpenseCat.trim())) await saveConfig({ ...config, expenseCategories: [...cats, newExpenseCat.trim()] }); setNewExpenseCat(''); }}
                  sx={{ ...gradBtnSx, flexShrink: 0, textTransform: 'none' }}>Add</Button>
              </Box>
              <Box sx={{ p: 1.25, borderRadius: '10px', bgcolor: '#fafafa', border: '1px solid #f6efe9', minHeight: 56, display: 'flex', flexWrap: 'wrap', gap: 0.5, alignContent: 'flex-start' }}>
                {(config.expenseCategories || []).length === 0 ? (
                  <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic', px: 0.5, py: 0.5 }}>No categories yet — add one above</Typography>
                ) : (config.expenseCategories || []).map(item => (
                  <Chip key={item} label={item} size="small"
                    sx={{ height: 24, fontSize: '0.72rem', bgcolor: '#fff', border: '1px solid', borderColor: alpha('#ea580c', 0.25), color: '#c2410c', fontWeight: 600 }}
                    onDelete={async () => await saveConfig({ ...config, expenseCategories: (config.expenseCategories || []).filter(c => c !== item) })} />
                ))}
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }} sx={{ p: 2.25 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <Box sx={{ width: 26, height: 26, borderRadius: '7px', bgcolor: alpha(primary, 0.1), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Package size={13} color={primary} />
                </Box>
                <Box>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', lineHeight: 1.2 }}>Item Units</Typography>
                  <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.68rem' }}>{(config.itemUnits || []).length} units · default: {config.defaultItemUnit || (config.itemUnits?.[0] || 'NOS')}</Typography>
                </Box>
              </Box>
              <FormControl fullWidth size="small" sx={{ ...fieldSx, mb: 1.25 }}>
                <InputLabel>Default Unit</InputLabel>
                <Select label="Default Unit" value={config.defaultItemUnit || (config.itemUnits?.[0] || 'NOS')}
                  onChange={async (e) => await saveConfig({ ...config, defaultItemUnit: e.target.value })}>
                  {(config.itemUnits?.length ? config.itemUnits : ['BAG','BOX','KGS','LTR','MTR','NOS','PCS']).map(u => <MenuItem key={u} value={u}>{u}</MenuItem>)}
                </Select>
              </FormControl>
              <Box sx={{ display: 'flex', gap: 0.75, mb: 1.25 }}>
                <TextField size="small" fullWidth placeholder="e.g. Ream, Dozen…" value={newItemUnit}
                  onChange={e => setNewItemUnit(e.target.value)}
                  onKeyDown={async e => { if (e.key === 'Enter' && newItemUnit.trim()) { const units = config.itemUnits || []; if (!units.includes(newItemUnit.trim())) await saveConfig({ ...config, itemUnits: [...units, newItemUnit.trim()] }); setNewItemUnit(''); } }}
                  sx={fieldSx} />
                <Button variant="contained" disableElevation size="small" startIcon={<Plus size={13} />}
                  onClick={async () => { if (!newItemUnit.trim()) return; const units = config.itemUnits || []; if (!units.includes(newItemUnit.trim())) await saveConfig({ ...config, itemUnits: [...units, newItemUnit.trim()] }); setNewItemUnit(''); }}
                  sx={{ ...gradBtnSx, flexShrink: 0, textTransform: 'none' }}>Add</Button>
              </Box>
              <Box sx={{ p: 1.25, borderRadius: '10px', bgcolor: '#fafafa', border: '1px solid #f6efe9', minHeight: 56, display: 'flex', flexWrap: 'wrap', gap: 0.5, alignContent: 'flex-start' }}>
                {(config.itemUnits || []).length === 0 ? (
                  <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic', px: 0.5, py: 0.5 }}>No units yet — add one above</Typography>
                ) : (config.itemUnits || []).map(item => (
                  <Chip key={item} label={item} size="small"
                    sx={{ height: 24, fontSize: '0.72rem', bgcolor: '#fff', border: '1px solid', borderColor: alpha(primary, 0.25), color: primary, fontWeight: 600 }}
                    onDelete={async () => await saveConfig({ ...config, itemUnits: (config.itemUnits || []).filter(u => u !== item) })} />
                ))}
              </Box>
            </Grid>
          </Grid>
        </Card>
      </Box>

      {/* ── Sale Type Defaults + Invoice Numbering (combined compact card) ── */}
      <Box sx={{ mb: 2, display: activeTab === 'invoice' && invoiceSub === 'numbering' ? 'block' : 'none' }}>
        <SH icon={ReceiptText} title="Sale Defaults & Numbering" subtitle="Default payment type per module, and the invoice/note number format for each document type" />
        <Card elevation={0} sx={{ ...cardSx.sx }}>
          <CardContent sx={{ p: 2.25 }}>
            {/* Sale Type Defaults */}
            <Grid container spacing={1.5} sx={{ mb: 2 }}>
              {[
                { label: 'Invoice Default', key: 'defaultSaleTypeSales', def: 'credit' },
                { label: 'POS Default', key: 'defaultSaleTypePOS', def: 'paid' },
              ].map(({ label, key, def }) => (
                <Grid key={key} size={{ xs: 12, sm: 6 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.25, py: 0.75, borderRadius: '8px', border: '1px solid #e5e7eb', bgcolor: '#fafafa' }}>
                    <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}>{label}</Typography>
                    <Box sx={{ display: 'flex', gap: 0, borderRadius: '6px', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                      {[{ value: 'paid', label: 'Cash' }, { value: 'credit', label: 'Credit' }].map(({ value, label: lbl }) => {
                        const active = (config[key] ?? def) === value;
                        return (
                          <Box key={value} onClick={() => saveConfig({ ...config, [key]: value })}
                            sx={{ px: 1.5, py: 0.4, cursor: 'pointer', fontWeight: 700, fontSize: '0.75rem', transition: 'all 0.12s', userSelect: 'none',
                              bgcolor: active ? primary : 'transparent', color: active ? '#fff' : '#57433e',
                              '&:hover': { bgcolor: active ? primary : '#f6efe9' } }}>
                            {lbl}
                          </Box>
                        );
                      })}
                    </Box>
                  </Box>
                </Grid>
              ))}
            </Grid>

            {/* Invoice Numbering — one compact row per document type */}
            <Box sx={{ pt: 1.5, borderTop: '1px solid #f6efe9' }}>
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#57433e', mb: 1, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Numbering</Typography>
              <Box sx={{ overflowX: 'auto' }}>
                <Box sx={{ minWidth: 560 }}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '120px 150px 1fr 100px 110px 36px', gap: 1, px: 0.5, pb: 0.5, borderBottom: '1px solid #f6efe9' }}>
                    {['Document', 'Number type', 'Prefix', 'Start #', 'Preview', ''].map((h) => (
                      <Typography key={h} sx={{ fontSize: '0.66rem', fontWeight: 700, color: '#5f4f47', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</Typography>
                    ))}
                  </Box>
                  {[
                    { label: 'Sales', typeKey: 'salesType', prefixKey: 'salesPrefix', numKey: 'salesStartingNumber', prefixDef: 'INV', resetKey: 'salesCounterOverride' },
                    { label: 'Purchases', typeKey: 'purchaseType', prefixKey: 'purchasePrefix', numKey: 'purchaseStartingNumber', prefixDef: 'BILL', resetKey: 'purchaseCounterOverride' },
                    { label: 'Estimates', typeKey: null, prefixKey: 'estimatePrefix', numKey: 'estimateStartingNumber', prefixDef: 'EST', resetKey: 'estimateCounterOverride' },
                    { label: 'Credit Notes', typeKey: null, prefixKey: 'creditNotePrefix', numKey: 'creditNoteStartingNumber', prefixDef: 'CN', resetKey: 'creditNoteCounterOverride' },
                    { label: 'Debit Notes', typeKey: null, prefixKey: 'debitNotePrefix', numKey: 'debitNoteStartingNumber', prefixDef: 'DBN', resetKey: 'debitNoteCounterOverride' },
                    { label: 'Delivery Notes', typeKey: null, prefixKey: 'deliveryNotePrefix', numKey: 'deliveryNoteStartingNumber', prefixDef: 'DLV', resetKey: 'deliveryNoteCounterOverride' },
                  ].map(({ label, typeKey, prefixKey, numKey, prefixDef, resetKey }) => (
                    <Box key={label} sx={{ display: 'grid', gridTemplateColumns: '120px 150px 1fr 100px 110px 36px', gap: 1, alignItems: 'center', px: 0.5, py: 0.6, borderBottom: '1px solid #f6efe9', '&:hover': { bgcolor: '#fafafa' } }}>
                      <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151' }}>{label}</Typography>
                      {typeKey ? (
                        <Select size="small" value={invoiceNumEff[typeKey] || 'auto'} sx={{ ...fieldSx, fontSize: '0.8rem', '& .MuiSelect-select': { py: 0.6 } }}
                          onChange={e => setInvoiceNumDraft(d => ({ ...(d ?? config.invoiceNumberConfig ?? {}), [typeKey]: e.target.value }))}>
                          <MenuItem value="auto">Auto-increment</MenuItem>
                          <MenuItem value="date">Date-based</MenuItem>
                          <MenuItem value="manual">Manual</MenuItem>
                        </Select>
                      ) : (
                        <Typography sx={{ fontSize: '0.75rem', color: '#5f4f47' }}>Auto-increment</Typography>
                      )}
                      <TextField size="small" sx={{ ...fieldSx, '& .MuiInputBase-input': { py: 0.6, fontSize: '0.8rem' } }}
                        value={invoiceNumEff[prefixKey] ?? prefixDef}
                        onChange={e => setInvoiceNumDraft(d => ({ ...(d ?? config.invoiceNumberConfig ?? {}), [prefixKey]: e.target.value }))} />
                      <TextField size="small" type="number" sx={{ ...fieldSx, '& .MuiInputBase-input': { py: 0.6, fontSize: '0.8rem' } }}
                        value={invoiceNumEff[numKey] ?? 1}
                        onChange={e => { const v = e.target.value; setInvoiceNumDraft(d => ({ ...(d ?? config.invoiceNumberConfig ?? {}), [numKey]: v === '' ? '' : parseInt(v) || 1 })); }}
                        onBlur={() => setInvoiceNumDraft(d => ({ ...(d ?? config.invoiceNumberConfig ?? {}), [numKey]: parseInt((d ?? config.invoiceNumberConfig ?? {})[numKey]) || 1 }))} />
                      <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, fontFamily: 'monospace', color: primary }} noWrap>
                        {invoiceNumEff[prefixKey] ?? prefixDef}-{String(invoiceNumEff[numKey] ?? 1).padStart(3, '0')}
                      </Typography>
                      <Tooltip title="Reset counter">
                        <IconButton size="small" color="warning"
                          onClick={() => {
                            const start = config.invoiceNumberConfig?.[numKey] ?? 1;
                            const prefix = config.invoiceNumberConfig?.[prefixKey] ?? prefixDef;
                            setResetCounterInput('');
                            setResetCounterDlg({ label, prefix, start, numKey, prefixKey, prefixDef, resetKey });
                          }}>
                          <RotateCcw size={14} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  ))}
                </Box>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1, pt: 1.5, mt: 1, borderTop: '1px solid #f6efe9' }}>
              {isDirty.invoiceNum && <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 600, mr: 'auto' }}>Unsaved changes</Typography>}
              <Button size="small" variant="outlined" disabled={!isDirty.invoiceNum} onClick={() => setInvoiceNumDraft(null)}
                sx={{ borderRadius: '6px', textTransform: 'none', fontSize: '0.8rem' }}>Discard</Button>
              <Button size="small" variant="contained" startIcon={savingSection === 'invoiceNum' ? <CircularProgress size={12} color="inherit" /> : <Save size={13} />}
                disabled={!isDirty.invoiceNum || savingSection === 'invoiceNum'}
                onClick={() => saveSection('invoiceNum')}
                sx={{ ...gradBtnSx, textTransform: 'none', px: 2 }}>Save</Button>
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* ── Invoice Theme & Print Settings (merged) ── */}
      <Box sx={{ mb: 2, display: activeTab === 'invoice' && invoiceSub === 'print' ? 'block' : 'none' }}>
        <SH icon={Paintbrush} title="Invoice Theme & Print Settings" subtitle="Choose look, paper size, accent colour, bill sections — preview updates live"
          action={
            <Button size="small" variant="outlined" startIcon={<Eye size={14} />} onClick={() => setBillPreviewOpen(true)}
              sx={{ borderRadius: `${baseRadius + 2}px`, textTransform: 'none', fontWeight: 700, px: 2, flexShrink: 0 }}>
              Preview Bill
            </Button>
          }
        />
        <Card elevation={0} sx={{ ...cardSx.sx, overflow: 'hidden' }}>
          <Grid container spacing={0}>
            {/* LEFT PANEL: all settings */}
            <Grid size={{ xs: 12, md: 5 }} sx={{ p: 2.5, borderRight: { md: '1px solid' }, borderColor: { md: 'divider' }, borderBottom: { xs: '1px solid', md: 'none' } }}>

              <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: primary, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.5 }}>
                <Palette size={13} /> Look & Feel
              </Typography>

              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', mb: 1 }}>
                Paper Size
              </Typography>
              <FormControl fullWidth size="small" sx={{ ...fieldSx, mb: 2.5 }}>
                <Select
                  value={printOptsEff._paperSize ?? config.defaultPaperSize ?? 'A4'}
                  displayEmpty
                  onChange={e => setPrintOptsDraft(d => ({ ...(d ?? config.billPrintOptions ?? {}), _paperSize: e.target.value }))}
                >
                  {['Standard', 'Special', 'Thermal'].map(grp => [
                    <MenuItem key={`hdr-${grp}`} disabled sx={{ fontSize: '0.7rem', fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.07em', py: 0.5, opacity: 1 }}>{grp}</MenuItem>,
                    ...PAPER_SIZES.filter(ps => ps.group === grp).map(ps => (
                      <MenuItem key={ps.value} value={ps.value} sx={{ pl: 2.5 }}>{ps.label}</MenuItem>
                    )),
                  ])}
                </Select>
              </FormControl>

              <Box sx={{ display: 'flex', gap: 2, mb: 2.5 }}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', mb: 0.75 }}>Date Format</Typography>
                  <FormControl fullWidth size="small" sx={fieldSx}>
                    <Select value={printOptsEff.dateFormat || 'DD/MM/YYYY'}
                      onChange={e => setPrintOptsDraft(d => ({ ...(d ?? config.billPrintOptions ?? {}), dateFormat: e.target.value }))}>
                      {['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY', 'DD MMM YYYY'].map(f => <MenuItem key={f} value={f}>{f}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Box>
              </Box>

              {(() => {
                const ps = printOptsEff._paperSize ?? config.defaultPaperSize ?? 'A4';
                const isThermalOrDot = ps === 'Thermal 80mm' || ps === 'Thermal 58mm' || ps === 'Dot Matrix';
                const currentThemeValue = printOptsEff.invoiceTheme || 'classic';
                const currentTheme = INVOICE_THEMES.find(t => t.value === currentThemeValue);
                if (isThermalOrDot) {
                  const designed = !!printOptsEff.billDesigns?.[ps]?.enabled;
                  return (
                    <Box sx={{ mb: 2.5, p: 1.5, borderRadius: `${baseRadius}px`, bgcolor: alpha(primary, 0.05), border: '1px solid', borderColor: alpha(primary, 0.15), display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                      <Box sx={{ flex: 1, minWidth: 180 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.86rem', color: primary }}>
                          {designed ? `Custom design (${ps})` : (ps === 'Dot Matrix' ? 'Standard dot-matrix layout' : 'Standard receipt layout')}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {designed ? 'Printing uses your own receipt design.' : 'Open the designer to place and size every part of the receipt yourself.'}
                        </Typography>
                      </Box>
                      <Button
                        size="small" variant="contained" startIcon={<LayoutTemplate size={14} />}
                        onClick={() => { setBillDesignsTemp({ ...(printOptsEff.billDesigns || {}) }); setUseDesignerTemp(printOptsEff.invoiceTheme === 'designer'); setBillDesignerOpen(true); }}
                        sx={{ ...gradBtnSx, borderRadius: `${baseRadius + 2}px`, textTransform: 'none', fontWeight: 700, px: 2, flexShrink: 0 }}
                      >
                        Design {ps === 'Dot Matrix' ? 'Print' : 'Receipt'}
                      </Button>
                    </Box>
                  );
                }
                return (
                  <>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', mb: 1.25 }}>
                      Layout Style
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5, p: 1.5, border: '1px solid #e5e7eb', borderRadius: '10px', bgcolor: '#fafafa' }}>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.88rem', color: primary }}>{currentTheme?.label || 'Classic'}</Typography>
                        <Typography variant="caption" color="text.secondary">{currentTheme?.desc || ''}</Typography>
                      </Box>
                      <Button
                        size="small" variant="outlined"
                        onClick={() => { setTempTheme(currentThemeValue); setThemePickerOpen(true); }}
                        sx={{ borderRadius: `${baseRadius + 2}px`, textTransform: 'none', fontWeight: 700, px: 2, flexShrink: 0 }}
                      >
                        Change Layout
                      </Button>
                      <Button
                        size="small" variant="contained" startIcon={<LayoutTemplate size={14} />}
                        onClick={() => { setBillDesignsTemp({ ...(printOptsEff.billDesigns || {}) }); setUseDesignerTemp(printOptsEff.invoiceTheme === 'designer'); setBillDesignerOpen(true); }}
                        sx={{ ...gradBtnSx, borderRadius: `${baseRadius + 2}px`, textTransform: 'none', fontWeight: 700, px: 2, flexShrink: 0 }}
                      >
                        Design Bill
                      </Button>
                    </Box>
                  </>
                );
              })()}

              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', mb: 1.25 }}>
                Accent Color
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2.5 }}>
                {THEME_COLORS.map(c => {
                  const isSel = (printOptsEff.themeColor || '#5c1f22') === c.value;
                  return (
                    <Tooltip key={c.value} title={c.label}>
                      <Box
                        onClick={() => setPrintOptsDraft(d => ({ ...(d ?? config.billPrintOptions ?? {}), themeColor: c.value }))}
                        sx={{
                          width: 28, height: 28, borderRadius: '50%', bgcolor: c.value, cursor: 'pointer',
                          border: isSel ? `3px solid ${c.value}` : '2px solid transparent',
                          outline: isSel ? `2px solid ${alpha(c.value, 0.5)}` : '2px solid transparent',
                          outlineOffset: '1px',
                          boxShadow: isSel ? `0 0 0 3px ${alpha(c.value, 0.25)}` : '0 1px 4px rgba(0,0,0,0.18)',
                          transition: 'all 0.15s',
                          '&:hover': { transform: 'scale(1.15)', boxShadow: `0 2px 8px ${alpha(c.value, 0.45)}` },
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        {isSel && <Check size={13} color="#fff" strokeWidth={3} />}
                      </Box>
                    </Tooltip>
                  );
                })}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, ml: 0.5 }}>
                  <Box component="input" type="color"
                    value={printOptsEff.themeColor || '#5c1f22'}
                    onChange={e => setPrintOptsDraft(d => ({ ...(d ?? config.billPrintOptions ?? {}), themeColor: e.target.value }))}
                    style={{ width: 28, height: 28, border: 'none', padding: 0, cursor: 'pointer', borderRadius: '50%', background: 'none' }}
                  />
                  <Typography variant="caption" color="text.secondary">Custom</Typography>
                </Box>
              </Box>

              <Box sx={{ height: '1px', bgcolor: 'divider', my: 2.5 }} />

              <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: primary, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.5 }}>
                <FileText size={13} /> Content
              </Typography>

              <Grid container spacing={1.5} sx={{ mb: 2 }}>
              <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', mb: 1 }}>
                Terms (Sales / Purchases)
              </Typography>
              <TextField
                multiline rows={3} fullWidth size="small" sx={{ ...fieldSx }}
                placeholder={'1. Goods once sold will not be taken back.\n2. Interest @ 18% charged if payment is delayed.'}
                value={printOptsEff.termsText || ''}
                onChange={e => setPrintOptsDraft(d => ({ ...(d ?? config.billPrintOptions ?? {}), termsText: e.target.value }))}
              />

              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', mb: 1 }}>
                Terms (Estimates / Quotes)
              </Typography>
              <TextField
                multiline rows={3} fullWidth size="small" sx={{ ...fieldSx }}
                placeholder={'Falls back to the Sales terms if left blank.'}
                value={printOptsEff.estimateTermsText || ''}
                onChange={e => setPrintOptsDraft(d => ({ ...(d ?? config.billPrintOptions ?? {}), estimateTermsText: e.target.value }))}
              />
              </Grid>
              </Grid>

              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', mb: 0.5 }}>
                Logo Size
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem', display: 'block', mb: 0.5 }}>
                Size of the business logo on printed bills (every theme, paper size and thermal). 100% = default.
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, px: 0.5 }}>
                <Slider
                  size="small" min={30} max={300} step={5}
                  value={Number(printOptsEff.logoScale) || 100}
                  onChange={(_, v) => setPrintOptsDraft(d => ({ ...(d ?? config.billPrintOptions ?? {}), logoScale: v }))}
                  valueLabelDisplay="auto" valueLabelFormat={v => `${v}%`}
                  disabled={printOptsEff.showLogo === false}
                  sx={{ flex: 1 }}
                />
                <TextField
                  size="small" type="number" sx={{ ...fieldSx, width: 96 }}
                  value={Number(printOptsEff.logoScale) || 100}
                  onChange={e => {
                    const v = Math.min(300, Math.max(30, Number(e.target.value) || 100));
                    setPrintOptsDraft(d => ({ ...(d ?? config.billPrintOptions ?? {}), logoScale: v }));
                  }}
                  disabled={printOptsEff.showLogo === false}
                  slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }}
                />
                <Tooltip title="Reset to 100%">
                  <span>
                    <IconButton size="small" disabled={printOptsEff.showLogo === false || (Number(printOptsEff.logoScale) || 100) === 100}
                      onClick={() => setPrintOptsDraft(d => ({ ...(d ?? config.billPrintOptions ?? {}), logoScale: 100 }))}>
                      <RotateCcw size={14} />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>

              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', mb: 0.5 }}>
                Page Padding
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem', display: 'block', mb: 1 }}>
                Blank space around the printed content (px). Blank Left/Right = theme default.
              </Typography>
              <Grid container spacing={1} sx={{ mb: 2 }}>
                {[
                  { key: 'docPaddingTop', label: 'Top', fallback: 0 },
                  { key: 'docPaddingBottom', label: 'Bottom', fallback: 0 },
                  { key: 'docPaddingLeft', label: 'Left', fallback: '' },
                  { key: 'docPaddingRight', label: 'Right', fallback: '' },
                ].map(({ key, label, fallback }) => (
                  <Grid size={{ xs: 6, sm: 3 }} key={key}>
                    <TextField
                      size="small" fullWidth type="number" label={label} sx={fieldSx}
                      placeholder={fallback === '' ? 'auto' : String(fallback)}
                      value={printOptsEff[key] ?? fallback}
                      onChange={e => {
                        const raw = e.target.value;
                        const next = raw === '' ? null : Number(raw);
                        setPrintOptsDraft(d => ({ ...(d ?? config.billPrintOptions ?? {}), [key]: next }));
                      }}
                      slotProps={{ input: { endAdornment: <InputAdornment position="end">px</InputAdornment> } }}
                    />
                  </Grid>
                ))}
              </Grid>

              <Box sx={{ height: '1px', bgcolor: 'divider', mb: 2 }} />

              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', mb: 0.5 }}>
                Bill Sections
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem', display: 'block', mb: 1.5 }}>
                Toggle what appears on the printed bill, grouped by area
              </Typography>
              {(() => {
                const bpo = printOptsEff;
                const grouped = [
                  {
                    group: 'Header',
                    items: [
                      { key: 'showLogo',          label: 'Business Logo',      desc: 'Logo image at top of bill' },
                      { key: 'showGSTIN',         label: 'GSTIN Number',       desc: 'GST registration number' },
                      { key: 'showBusinessPhone', label: 'Business Phone',      desc: 'Your business phone number' },
                      { key: 'showBusinessEmail', label: 'Business Email',      desc: 'Your business email address' },
                      { key: 'showQRCode',        label: 'Business QR Code',   desc: 'QR code image in header' },
                    ],
                  },
                  {
                    group: 'Invoice Details',
                    items: [
                      { key: 'showInvoiceNumber', label: 'Invoice Number',     desc: 'Bill / invoice number' },
                      { key: 'showDate',          label: 'Invoice Date',        desc: 'Date of the invoice' },
                      { key: 'showTime',          label: 'Time',                desc: 'Bill time next to the date' },
                      { key: 'showDueDate',       label: 'Due Date',            desc: 'Payment due date' },
                      { key: 'showBilledBy',      label: 'Billed By',           desc: 'Staff name who created the bill' },
                      { key: 'showPaymentMode',   label: 'Payment Mode',        desc: 'Cash / UPI / Bank mode label' },
                      { key: 'showPlaceOfSupply', label: 'Place of Supply',     desc: 'GST place of supply state' },
                    ],
                  },
                  {
                    group: 'Customer / Vendor',
                    items: [
                      { key: 'showPartyPhone',   label: 'Party Phone',          desc: 'Customer / vendor phone number' },
                      { key: 'showPartyAddress', label: 'Party Address',         desc: 'Customer / vendor address' },
                      { key: 'showPartyGSTIN',   label: 'Party GSTIN',           desc: 'Customer / vendor GST number' },
                    ],
                  },
                  {
                    group: 'Items Table',
                    items: [
                      { key: 'showSrNo',           label: 'Sr. No Column',      desc: 'Serial number column in items table' },
                      { key: 'showUnitColumn',     label: 'Unit Column',         desc: 'Separate unit column (e.g. pcs, kg)' },
                      { key: 'showHSNColumn',      label: 'HSN / SAC Column',   desc: 'HSN or SAC code column' },
                      { key: 'showGSTColumn',      label: 'GST % Column',        desc: 'Tax percentage in items table' },
                      { key: 'showDiscountColumn', label: 'Discount % Column',   desc: 'Discount percentage column' },
                      { key: 'showItemCategory',   label: 'Item Category',       desc: 'Show category below item name' },
                      { key: 'showItemSize',       label: 'Item Size',           desc: 'Show size below item name' },
                      { key: 'showItemVariant',    label: 'Item Variant',        desc: 'Show variant below item name' },
                    ],
                  },
                  {
                    group: 'Totals',
                    items: [
                      { key: 'showOldBalance',    label: 'Opening Balance',      desc: 'Pending / previous balance' },
                      { key: 'autoRoundOff',      label: 'Auto Round-off',        desc: 'Round total to nearest rupee' },
                      { key: 'showAmountInWords', label: 'Amount in Words',       desc: 'Total in Indian words (Rupees …)' },
                      { key: 'showTaxSummary',    label: 'HSN / Tax Summary',     desc: 'HSN-wise GST summary table below items' },
                    ],
                  },
                  {
                    group: 'Footer',
                    items: [
                      { key: 'showLoyaltyOnBill', label: 'Loyalty Points Block', desc: 'Points added, redeemed & balance on bill' },
                      { key: 'showBankDetails',   label: 'Bank Details',          desc: 'Bank name, A/C no., IFSC in footer' },
                      { key: 'showTerms',         label: 'Terms & Conditions',    desc: 'Terms text at the bottom' },
                      { key: 'showSignature',     label: 'Signature Block',       desc: 'Authorized signatory section' },
                    ],
                  },
                ];
                const isDefaultFalseKeys = new Set([
                  'showOldBalance', 'autoRoundOff', 'showBankDetails', 'showAmountInWords',
                  'showDueDate', 'showTime', 'showBilledBy', 'showPaymentMode', 'showQRCode', 'showBusinessEmail',
                  'showUnitColumn', 'showItemCategory', 'showItemSize', 'showItemVariant',
                  'showLoyaltyOnBill',
                ]);
                const getChecked = (key) => isDefaultFalseKeys.has(key) ? (bpo[key] === true) : (bpo[key] !== false);
                const toggle = (key) => setPrintOptsDraft(d => {
                  const base = d ?? config.billPrintOptions ?? {};
                  return { ...base, [key]: !getChecked(key) };
                });
                return (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {grouped.map(({ group, items }) => {
                      const isCollapsed = collapsedBillGroups.has(group);
                      const activeCount = items.filter(({ key }) => getChecked(key)).length;
                      return (
                        <Box key={group}>
                          <Box
                            onClick={() => setCollapsedBillGroups(prev => {
                              const next = new Set(prev);
                              if (next.has(group)) next.delete(group); else next.add(group);
                              return next;
                            })}
                            sx={{
                              display: 'flex', alignItems: 'center', gap: 1, mt: 1.5, mb: 0.6, px: 0.5, cursor: 'pointer',
                              '&:hover .grp-label': { color: primary },
                            }}
                          >
                            {isCollapsed ? <ChevronRight size={12} color="#9ca3af" /> : <ChevronDown size={12} color="#9ca3af" />}
                            <Typography className="grp-label" variant="caption" sx={{ fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.07em', fontSize: '0.68rem', flex: 1, transition: 'color 0.15s' }}>
                              {group}
                            </Typography>
                            <Typography variant="caption" sx={{ fontSize: '0.68rem', color: alpha(primary, 0.7), fontWeight: 600 }}>{activeCount}/{items.length}</Typography>
                          </Box>
                          {!isCollapsed && (
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.6 }}>
                              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 0.5 }}>
                              {items.map(({ key, label, desc }) => {
                                const isChecked = getChecked(key);
                                return (
                                  <Tooltip key={key} title={desc} placement="top" enterDelay={400}>
                                    <Box onClick={() => toggle(key)}
                                      sx={{
                                        display: 'flex', alignItems: 'center', gap: 0.5, pl: 0.25, pr: 1, py: 0.1,
                                        borderRadius: '8px', cursor: 'pointer', border: '1px solid',
                                        borderColor: isChecked ? alpha(primary, 0.25) : '#f6efe9',
                                        bgcolor: isChecked ? alpha(primary, 0.04) : 'transparent',
                                        transition: 'all 0.12s',
                                        '&:hover': { bgcolor: isChecked ? alpha(primary, 0.08) : '#f6efe9' },
                                      }}>
                                      <Switch size="small" checked={isChecked} onClick={(e) => e.stopPropagation()} onChange={() => toggle(key)} sx={{ flexShrink: 0, transform: 'scale(0.85)' }} />
                                      <Typography noWrap sx={{ fontWeight: isChecked ? 600 : 500, fontSize: '0.79rem', color: isChecked ? '#3f1417' : '#57433e', minWidth: 0 }}>{label}</Typography>
                                    </Box>
                                  </Tooltip>
                                );
                              })}
                              </Box>
                              {group === 'Items Table' && (
                                <ColumnOrderEditor
                                  bpo={bpo}
                                  getChecked={getChecked}
                                  primary={primary}
                                  dragKeyRef={columnDragKey}
                                  onChange={(nextOrder) => setPrintOptsDraft(d => ({ ...(d ?? config.billPrintOptions ?? {}), columnOrder: nextOrder }))}
                                />
                              )}
                            </Box>
                          )}
                        </Box>
                      );
                    })}
                  </Box>
                );
              })()}

              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1.5, mt: 2.5, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
                {isDirty.printOpts && <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 600, mr: 'auto' }}>Unsaved changes</Typography>}
                <Button variant="outlined" size="small" disabled={!isDirty.printOpts} onClick={() => setPrintOptsDraft(null)}
                  sx={{ borderRadius: `${baseRadius + 2}px`, textTransform: 'none' }}>Discard</Button>
                <Button variant="contained" size="small" startIcon={savingSection === 'printOpts' ? <CircularProgress size={14} color="inherit" /> : <Save size={14} />}
                  disabled={!isDirty.printOpts || savingSection === 'printOpts'}
                  onClick={() => saveSection('printOpts')}
                  sx={{ ...gradBtnSx, textTransform: 'none', px: 2.5 }}>
                  Save Invoice Settings
                </Button>
              </Box>
            </Grid>

            {/* RIGHT PANEL: live invoice preview — sticky so it stays in view as left panel grows */}
            <Grid size={{ xs: 12, md: 7 }} sx={{ p: 2, bgcolor: 'grey.100', display: 'flex', flexDirection: 'column', minHeight: 520, position: { md: 'sticky' }, top: { md: 16 }, alignSelf: { md: 'flex-start' } }}>
              {(() => {
                const ps = printOptsEff._paperSize ?? config.defaultPaperSize ?? 'A4';
                const themeName = INVOICE_THEMES.find(t => t.value === (printOptsEff.invoiceTheme || 'classic'))?.label || 'Classic';
                const paperWidthPx = getPaperWidthPx(ps);
                const previewOpts = { ...printOptsEff };
                return (
                  <>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 1, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.72rem' }}>
                      Preview — {themeName} / {ps}
                    </Typography>
                    <Box ref={previewContainerRef} sx={{ overflow: 'auto', flex: 1, bgcolor: '#d1d5db', borderRadius: 1, p: 1.5 }}>
                      {previewContainerWidth > 0 && (() => {
                        const availW = previewContainerWidth - 24;
                        const scale = Math.min(availW / paperWidthPx, 1);
                        return (
                          <ScaledPreviewBox key={ps} scale={scale} width={paperWidthPx}>
                            <InvoiceTemplateComponent
                              transaction={SAMPLE_INVOICE}
                              business={SAMPLE_BUSINESS}
                              paperSize={ps}
                              printOptions={previewOpts}
                            />
                          </ScaledPreviewBox>
                        );
                      })()}
                    </Box>
                  </>
                );
              })()}
            </Grid>
          </Grid>
        </Card>
      </Box>

      {/* ── Access Control ── */}
      {(currentUser || staffSession?.role === 'admin') && (
        <Box sx={{ mb: 2, display: activeTab === 'staff' ? 'block' : 'none' }}>

          {!scopedBiz?.businessCode && (
            <Alert severity="warning" sx={{ mb: 2, borderRadius: '10px' }}
              action={
                <Button size="small" onClick={handleLinkBusinessCode} disabled={scopedBizLoading}
                  sx={{ textTransform: 'none', fontWeight: 700 }}>
                  {scopedBizLoading ? 'Generating…' : 'Generate Code'}
                </Button>
              }>
              This business doesn't have a login code yet.
            </Alert>
          )}
          {staffMsg.text && (
            <Alert severity={staffMsg.type} sx={{ mb: 1.5, borderRadius: '10px' }} onClose={() => setStaffMsg({ type: '', text: '' })}>
              {staffMsg.text}
            </Alert>
          )}

          {/* Credentials row — business code + admin password in one card */}
          <Card elevation={0} sx={{ ...cardSx.sx, mb: 2 }}>
            <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid #f6efe9', display: 'flex', alignItems: 'center', gap: 1 }}>
              <KeyRound size={13} color={primary} style={{ opacity: 0.7 }} />
              <Typography sx={{ fontWeight: 700, fontSize: '0.875rem' }}>Login Credentials</Typography>
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0 }}>
              {/* Business Code */}
              {scopedBiz?.businessCode && (
                <Box sx={{ flex: '1 1 200px', px: 2, py: 1.5, borderRight: { sm: '1px solid #f6efe9' }, borderBottom: { xs: '1px solid #f6efe9', sm: 'none' } }}>
                  <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#5f4f47', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.75 }}>Business Code</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, py: 1, borderRadius: '8px', bgcolor: alpha(primary, 0.05), border: `1px solid ${alpha(primary, 0.12)}` }}>
                    <Typography sx={{ fontWeight: 900, letterSpacing: 5, fontFamily: 'monospace', color: primary, fontSize: '1.2rem', flex: 1 }}>
                      {scopedBiz.businessCode}
                    </Typography>
                    <Tooltip title={copiedCode ? 'Copied!' : 'Copy'}>
                      <IconButton size="small" onClick={copyCode} sx={{ color: primary, bgcolor: alpha(primary, 0.08), '&:hover': { bgcolor: alpha(primary, 0.15) } }}>
                        {copiedCode ? <Check size={14} /> : <Copy size={14} />}
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <Typography variant="caption" sx={{ color: '#5f4f47', mt: 0.75, display: 'block' }}>Share with staff for login to this business</Typography>
                </Box>
              )}

              {/* Admin Password */}
              <Box sx={{ flex: '2 1 320px', px: 2, py: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                  <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#5f4f47', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Admin Password</Typography>
                  {scopedBiz?.adminPassword && <Chip label="Active" size="small" sx={{ height: 16, fontSize: '0.65rem', bgcolor: alpha('#16a34a', 0.1), color: '#16a34a', fontWeight: 700 }} />}
                </Box>
                {adminPwdMsg.text && (
                  <Alert severity={adminPwdMsg.type} sx={{ mb: 1, borderRadius: '8px', py: 0.25, fontSize: '0.8rem' }} onClose={() => setAdminPwdMsg({ type: '', text: '' })}>
                    {adminPwdMsg.text}
                  </Alert>
                )}
                <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
                  <TextField size="small" label="New Password" type={showAdminPwd ? 'text' : 'password'}
                    value={adminPwdForm.password}
                    onChange={e => setAdminPwdForm(f => ({ ...f, password: e.target.value }))}
                    sx={{ ...fieldSx, flex: 1 }}
                    slotProps={{ input: { endAdornment: (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setShowAdminPwd(v => !v)} tabIndex={-1}>
                          {showAdminPwd ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    ) } }}
                  />
                  <TextField size="small" label="Confirm" type={showAdminPwd ? 'text' : 'password'}
                    value={adminPwdForm.confirm}
                    onChange={e => setAdminPwdForm(f => ({ ...f, confirm: e.target.value }))}
                    sx={{ ...fieldSx, flex: 1 }}
                  />
                  <Button variant="contained" disableElevation size="small"
                    onClick={handleSaveAdminPassword} disabled={savingAdminPwd}
                    sx={{ ...gradBtnSx, textTransform: 'none', flexShrink: 0, height: 40, px: 1.5, minWidth: 0 }}>
                    {savingAdminPwd ? '…' : scopedBiz?.adminPassword ? 'Update' : 'Set'}
                  </Button>
                </Box>
              </Box>
            </Box>
          </Card>

          {/* Business Switch Lock — off by default; when on, switching
              businesses via the sidebar/topbar switcher requires that
              business's admin password (already-set passwords are used as
              before; when off, switching is always free regardless). */}
          <Card elevation={0} sx={{ ...cardSx.sx, mb: 2 }}>
            <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <Lock size={13} color={primary} style={{ opacity: 0.7, flexShrink: 0 }} />
                <Box>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.875rem' }}>Business Switch Lock</Typography>
                  <Typography variant="caption" sx={{ color: '#5f4f47' }}>
                    {config.features?.businessSwitchLock
                      ? 'Switching businesses requires the admin password.'
                      : 'Off — anyone can switch businesses freely.'}
                  </Typography>
                </Box>
              </Box>
              <Switch
                checked={!!config.features?.businessSwitchLock}
                disabled={featuresSaving}
                onChange={e => handleFeatureToggle('businessSwitchLock', e.target.checked)}
              />
            </Box>
          </Card>

          {/* Staff — list on left, form on right, unified card */}
          <Card elevation={0} sx={{ ...cardSx.sx, overflow: 'hidden' }}>
            <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid #f6efe9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Users size={13} color={primary} style={{ opacity: 0.7 }} />
                <Typography sx={{ fontWeight: 700, fontSize: '0.875rem' }}>Staff Accounts</Typography>
                {staffList.length > 0 && (
                  <Chip label={`${activeStaffCount}/${maxStaffLimit}`} size="small" sx={{ height: 18, fontSize: '0.68rem', bgcolor: atStaffCap ? alpha('#dc2626', 0.1) : alpha(primary, 0.1), color: atStaffCap ? '#dc2626' : primary, fontWeight: 700 }} />
                )}
              </Box>
              <Tooltip title={atStaffCap ? `Staff limit reached (${maxStaffLimit}). Contact your administrator to raise it.` : ''}>
                <span>
                  <Button size="small" startIcon={<Plus size={12} />} onClick={resetStaffForm} disabled={atStaffCap}
                    sx={{ fontSize: '0.75rem', textTransform: 'none', color: primary, borderRadius: '6px',
                      '&:hover': { bgcolor: alpha(primary, 0.06) } }}>
                    Add Staff
                  </Button>
                </span>
              </Tooltip>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, minHeight: 0 }}>
              {/* Left: staff list */}
              <Box sx={{ width: { xs: '100%', md: 220 }, flexShrink: 0, borderRight: { md: '1px solid #f6efe9' }, borderBottom: { xs: '1px solid #f6efe9', md: 'none' }, overflowY: 'auto', maxHeight: { md: 520 } }}>
                {staffList.length === 0 ? (
                  <Box sx={{ py: 5, textAlign: 'center', px: 2 }}>
                    <Users size={28} color={alpha(primary, 0.2)} style={{ margin: '0 auto 8px' }} />
                    <Typography variant="caption" sx={{ color: '#5f4f47', display: 'block', fontWeight: 600 }}>No staff yet</Typography>
                  </Box>
                ) : (
                  <Box sx={{ p: 1 }}>
                    {staffList.map(s => {
                      const isSel = selectedStaff?.id === s.id;
                      return (
                        <Box key={s.id} onClick={() => loadStaff(s)} sx={{
                          mb: 0.5, px: 1.25, py: 0.875, borderRadius: '8px', cursor: 'pointer',
                          bgcolor: isSel ? alpha(primary, 0.07) : 'transparent',
                          display: 'flex', alignItems: 'center', gap: 1.25,
                          transition: 'all 0.12s',
                          '&:hover': { bgcolor: isSel ? alpha(primary, 0.09) : '#f6efe9' },
                        }}>
                          <Avatar sx={{ width: 30, height: 30, fontSize: '0.75rem', fontWeight: 800, flexShrink: 0,
                            bgcolor: isSel ? primary : alpha(primary, 0.12),
                            color: isSel ? '#fff' : primary }}>
                            {(s.name?.[0] || '?').toUpperCase()}
                          </Avatar>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography sx={{ fontWeight: 700, fontSize: '0.82rem', lineHeight: 1.2, color: isSel ? primary : '#3f1417', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {s.name}
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: s.active !== false ? '#16a34a' : '#5f4f47', flexShrink: 0 }} />
                              <Typography sx={{ fontSize: '0.7rem', color: '#5f4f47', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{s.username}</Typography>
                            </Box>
                          </Box>
                          <Tooltip title="Delete">
                            <IconButton size="small" onClick={e => { e.stopPropagation(); handleDeleteStaff(s); }}
                              sx={{ opacity: 0, '.MuiBox-root:hover > &': { opacity: 1 }, color: '#ef4444', flexShrink: 0,
                                '&:hover': { bgcolor: alpha('#ef4444', 0.08) } }}>
                              <Trash2 size={13} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      );
                    })}
                  </Box>
                )}
              </Box>

              {/* Right: staff form */}
              <Box sx={{ flex: 1, p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.82rem', color: '#57433e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {selectedStaff ? `Editing — ${selectedStaff.name}` : 'New Staff Account'}
                  </Typography>
                </Box>

                {/* Identity row — login credentials */}
                <Box sx={{ mb: 1 }}>
                  <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#5f4f47', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.75 }}>Login Credentials</Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    <TextField size="small" label="Full Name *" value={staffForm.name} placeholder="e.g. Rahul Kumar"
                      onChange={e => setStaffForm(f => ({ ...f, name: e.target.value }))} sx={{ ...fieldSx, flex: '1 1 140px' }} />
                    <TextField size="small" label="Username *" value={staffForm.username || ''} placeholder="rahul"
                      helperText="Used to log in"
                      onChange={e => setStaffForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') }))} sx={{ ...fieldSx, flex: '1 1 120px' }} />
                    <TextField size="small" label={selectedStaff ? 'Password (blank=keep)' : 'Password *'}
                      type={showStaffPwd ? 'text' : 'password'} value={staffForm.password}
                      onChange={e => setStaffForm(f => ({ ...f, password: e.target.value }))}
                      sx={{ ...fieldSx, flex: '1 1 140px' }}
                      InputProps={{
                        endAdornment: <InputAdornment position="end">
                          <IconButton size="small" onClick={() => setShowStaffPwd(v => !v)} tabIndex={-1}>
                            {showStaffPwd ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                          </IconButton>
                        </InputAdornment>
                      }}
                    />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1.25, borderRadius: '8px', border: '1px solid #e5e7eb', bgcolor: '#fafafa', flexShrink: 0, height: 40 }}>
                      <Switch size="small" checked={staffForm.active} color="success"
                        onChange={e => setStaffForm(f => ({ ...f, active: e.target.checked }))} />
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: staffForm.active ? '#16a34a' : '#5f4f47', whiteSpace: 'nowrap' }}>
                        {staffForm.active ? 'Active' : 'Inactive'}
                      </Typography>
                    </Box>
                  </Box>
                </Box>

                {/* HR details */}
                <Box sx={{ pt: 1, borderTop: '1px solid #f6efe9', mb: 1 }}>
                  <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#5f4f47', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.75 }}>HR Details</Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    <TextField size="small" select label="Role" value={staffForm.role || 'Sales Staff'}
                      onChange={e => setStaffForm(f => ({ ...f, role: e.target.value }))} sx={{ ...fieldSx, flex: '1 1 120px' }}>
                      {['Manager','Cashier','Sales Staff','Delivery','Accountant','Helper','Security','Other'].map(r => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                    </TextField>
                    <TextField size="small" label="Phone" value={staffForm.phone || ''}
                      onChange={e => setStaffForm(f => ({ ...f, phone: e.target.value }))} sx={{ ...fieldSx, flex: '1 1 120px' }} />
                    <TextField size="small" label="Email" value={staffForm.email || ''}
                      onChange={e => setStaffForm(f => ({ ...f, email: e.target.value }))} sx={{ ...fieldSx, flex: '1 1 140px' }} />
                    <TextField size="small" label="Salary (₹)" type="number" value={staffForm.salary || ''}
                      onChange={e => setStaffForm(f => ({ ...f, salary: e.target.value }))} sx={{ ...fieldSx, flex: '1 1 100px' }} />
                    <TextField size="small" select label="Salary Type" value={staffForm.salaryType || 'monthly'}
                      onChange={e => setStaffForm(f => ({ ...f, salaryType: e.target.value }))} sx={{ ...fieldSx, flex: '1 1 100px' }}>
                      {['monthly','daily','hourly'].map(t => <MenuItem key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</MenuItem>)}
                    </TextField>
                    <TextField size="small" label="Joining Date" type="date" value={staffForm.joiningDate || ''}
                      onChange={e => setStaffForm(f => ({ ...f, joiningDate: e.target.value }))}
                      slotProps={{ inputLabel: { shrink: true } }} sx={{ ...fieldSx, flex: '1 1 130px' }} />
                  </Box>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                    <TextField size="small" label="Notes" value={staffForm.notes || ''}
                      onChange={e => setStaffForm(f => ({ ...f, notes: e.target.value }))} sx={{ ...fieldSx, flex: 1 }} />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1.25, borderRadius: '8px', border: '1px solid #e5e7eb', bgcolor: '#fafafa', height: 40, flexShrink: 0 }}>
                      <Switch size="small" checked={!!staffForm.showInSalesSelector}
                        onChange={e => setStaffForm(f => ({ ...f, showInSalesSelector: e.target.checked }))} />
                      <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: '#57433e', whiteSpace: 'nowrap' }}>Show in Sales/POS</Typography>
                    </Box>
                  </Box>
                </Box>

                {/* Permissions */}
                <Box sx={{ pt: 1, borderTop: '1px solid #f6efe9' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                    <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#5f4f47', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Permissions</Typography>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Button size="small" onClick={() => setStaffForm(f => ({ ...f, features: STAFF_FEATURE_KEYS.reduce((a, k) => ({ ...a, [k]: true }), { ...f.features }) }))}
                        sx={{ fontSize: '0.68rem', textTransform: 'none', py: 0.2, px: 0.75, minWidth: 0, color: primary, '&:hover': { bgcolor: alpha(primary, 0.06) } }}>All On</Button>
                      <Button size="small" onClick={() => setStaffForm(f => ({ ...f, features: STAFF_FEATURE_KEYS.reduce((a, k) => ({ ...a, [k]: false }), { ...f.features }) }))}
                        sx={{ fontSize: '0.68rem', textTransform: 'none', py: 0.2, px: 0.75, minWidth: 0, color: '#5f4f47', '&:hover': { bgcolor: '#f6efe9' } }}>All Off</Button>
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {STAFF_FEATURE_GROUPS.map(({ group, keys }) => (
                      <Box key={group}>
                        <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#ddd0c9', textTransform: 'uppercase', letterSpacing: '0.07em', mb: 0.5 }}>{group}</Typography>
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 0.5 }}>
                          {keys.map(key => {
                            const on = !!staffForm.features[key];
                            return (
                              <Box key={key}
                                onClick={() => setStaffForm(f => ({ ...f, features: { ...f.features, [key]: !f.features[key] } }))}
                                sx={{
                                  display: 'flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.625, borderRadius: '6px',
                                  cursor: 'pointer', border: '1px solid', transition: 'all 0.12s',
                                  borderColor: on ? alpha(primary, 0.25) : '#f6efe9',
                                  bgcolor: on ? alpha(primary, 0.05) : '#fafafa',
                                  '&:hover': { bgcolor: on ? alpha(primary, 0.08) : '#f6efe9' },
                                }}>
                                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: on ? primary : '#e8ddd6', flexShrink: 0, transition: 'background 0.12s' }} />
                                <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: on ? primary : '#57433e', lineHeight: 1.2, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {STAFF_FEATURE_LABELS[key] || key}
                                </Typography>
                                {isModuleOffForBusiness(key, config.features) && (
                                  <Tooltip title="Turned off for this business — switch it on in Settings → Features first, or staff won't see it">
                                    <Box component="span" sx={{ fontSize: '0.58rem', fontWeight: 800, color: '#b45309', bgcolor: alpha('#f59e0b', 0.14), px: 0.5, py: 0.1, borderRadius: '4px', flexShrink: 0 }}>OFF</Box>
                                  </Tooltip>
                                )}
                              </Box>
                            );
                          })}
                        </Box>
                      </Box>
                    ))}
                  </Box>
                </Box>

                <Box sx={{ mt: 1.25 }}>
                  <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#ddd0c9', textTransform: 'uppercase', letterSpacing: '0.07em', mb: 0.5 }}>Restrictions</Typography>
                  {STAFF_RESTRICTION_ITEMS.map(({ key, label, hint }) => (
                    <Box key={key} onClick={() => setStaffForm(f => ({ ...f, features: { ...f.features, [key]: !f.features[key] } }))}
                      sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.75, borderRadius: '6px', cursor: 'pointer', border: '1px solid', borderColor: staffForm.features[key] ? alpha('#d97706', 0.35) : '#f6efe9', bgcolor: staffForm.features[key] ? alpha('#d97706', 0.05) : '#fafafa' }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: staffForm.features[key] ? '#b45309' : '#57433e' }}>{label}</Typography>
                        <Typography sx={{ fontSize: '0.68rem', color: '#5f4f47' }}>{hint}</Typography>
                      </Box>
                      <Switch size="small" checked={!!staffForm.features[key]} onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setStaffForm(f => ({ ...f, features: { ...f.features, [key]: e.target.checked } }))} />
                    </Box>
                  ))}
                  <Typography sx={{ fontSize: '0.66rem', color: '#5f4f47', mt: 0.5 }}>
                    Staff logins never see summary totals (receivables, payables, invoice totals, stock value).
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', pt: 1.5, mt: 1, borderTop: '1px solid #f6efe9' }}>
                  <Button size="small" variant="outlined" onClick={resetStaffForm}
                    sx={{ borderRadius: '6px', textTransform: 'none', fontSize: '0.8rem' }}>Cancel</Button>
                  <Button size="small" variant="contained" startIcon={<Save size={13} />} onClick={handleSaveStaff}
                    disabled={!selectedStaff && atStaffCap}
                    sx={{ ...gradBtnSx, textTransform: 'none', px: 2 }}>
                    {selectedStaff ? 'Update' : 'Create'}
                  </Button>
                </Box>
              </Box>
            </Box>
          </Card>
        </Box>
      )}

      {/* ── Billing & Payments (Google-auth owners only) ── */}
      {currentUser && !staffSession && (
        <Box sx={{ mb: 2, display: activeTab === 'billing' ? 'block' : 'none' }}>
          <Card elevation={0} sx={{ ...cardSx.sx }}>
            <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid #f6efe9', display: 'flex', alignItems: 'center', gap: 1 }}>
              <CreditCard size={13} color={primary} style={{ opacity: 0.7 }} />
              <Typography sx={{ fontWeight: 700, fontSize: '0.875rem' }}>{t('settings.billing')}</Typography>
            </Box>
            <CardContent sx={{ p: 2 }}>
              <BillingPayments />
            </CardContent>
          </Card>
        </Box>
      )}

      {/* ── Appearance ── */}
      {/* ── Dashboard customisation ── */}
      <Box sx={{ mb: 2, display: activeTab === 'dashboard' ? 'block' : 'none' }}>
        <DashboardSettings config={config} saveConfig={saveConfig} primary={primary} businessName={currentBusiness?.name} />
      </Box>

      <Box sx={{ mb: 2, display: activeTab === 'appearance' ? 'block' : 'none' }}>
        <Card elevation={0} sx={{ ...cardSx.sx }}>
          <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid #f6efe9', display: 'flex', alignItems: 'center', gap: 1 }}>
            <Palette size={13} color={primary} style={{ opacity: 0.7 }} />
            <Typography sx={{ fontWeight: 700, fontSize: '0.875rem' }}>{t('settings.appearance')}</Typography>
          </Box>
          <CardContent sx={{ p: 2 }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 5, md: 4 }}>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#57433e', mb: 0.75, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('settings.language')}</Typography>
                <TextField select size="small" fullWidth value={lang} onChange={(e) => setLang(e.target.value)} sx={fieldSx}>
                  {languages.map((l) => (
                    <MenuItem key={l.code} value={l.code}>{l.native}{l.native !== l.label ? ` · ${l.label}` : ''}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 7, md: 8 }}>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#57433e', mb: 0.75, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Display Options</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {[
                    { key: 'compactTables', label: 'Compact Tables', desc: 'Smaller row height in lists' },
                    { key: 'showStockOnInvoice', label: 'Show Stock in Invoice', desc: 'Display available qty when adding items' },
                    { key: 'confirmOnDelete', label: 'Confirm Before Delete', desc: 'Ask confirmation before deleting' },
                  ].map(({ key, label, desc }) => {
                    const checked = key === 'confirmOnDelete'
                      ? (config.displayOptions?.[key] !== false)
                      : (config.displayOptions?.[key] === true);
                    return (
                      <ToggleRow key={key} label={label} desc={desc} checked={checked}
                        onChange={async (v) => await saveConfig({ ...config, displayOptions: { ...(config.displayOptions || {}), [key]: v } })} />
                    );
                  })}
                </Box>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Box>

      {/* ── Sidebar Order ── */}
      <Box sx={{ mb: 2, display: activeTab === 'appearance' ? 'block' : 'none' }}>
        <Card elevation={0} sx={{ ...cardSx.sx }}>
          <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid #f6efe9', display: 'flex', alignItems: 'center', gap: 1 }}>
            <LayoutList size={13} color={primary} style={{ opacity: 0.7 }} />
            <Typography sx={{ fontWeight: 700, fontSize: '0.875rem', flex: 1 }}>Sidebar Order</Typography>
            {sidebarOrderDirty && (
              <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 600, mr: 1 }}>Unsaved</Typography>
            )}
            {(sidebarOrderDirty || config.sidebarOrder?.length > 0) && (
              <Button size="small" variant="outlined" onClick={resetSidebarOrder}
                sx={{ borderRadius: '8px', textTransform: 'none', fontSize: '0.75rem', mr: 1 }}>
                Reset to Default
              </Button>
            )}
            <Button size="small" variant="contained" disabled={!sidebarOrderDirty} onClick={saveSidebarOrder}
              startIcon={<Save size={13} />} sx={{ ...gradBtnSx, textTransform: 'none' }}>
              Save
            </Button>
          </Box>
          <CardContent sx={{ p: 2 }}>
            <Typography sx={{ fontSize: '0.78rem', color: '#57433e', mb: 1.5 }}>
              Drag items to rearrange the left navigation menu. Section labels stay attached to whichever item is above them.
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, maxWidth: 420 }}>
              {sidebarOrderEff.map((item, idx) => {
                const Icon = item.icon;
                const prevGroup = idx > 0 ? sidebarOrderEff[idx - 1]._group : null;
                const showGroupLabel = item._group !== prevGroup;
                return (
                  <React.Fragment key={item.path}>
                    {showGroupLabel && (
                      <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: '#5f4f47', textTransform: 'uppercase', letterSpacing: '0.06em', mt: idx > 0 ? 1 : 0, mb: 0.25 }}>
                        {item._group}
                      </Typography>
                    )}
                    <Box
                      draggable
                      onDragStart={() => { sidebarDragKeyRef.current = item.path; }}
                      onDragOver={(e) => handleSidebarDragOver(e, item.path)}
                      onDrop={() => { sidebarDragKeyRef.current = null; }}
                      onDragEnd={() => { sidebarDragKeyRef.current = null; }}
                      sx={{
                        display: 'flex', alignItems: 'center', gap: 1, px: 1.25, py: 0.85,
                        borderRadius: '8px', border: '1px solid #e5e7eb', bgcolor: '#fff',
                        cursor: 'grab', userSelect: 'none',
                        '&:hover': { borderColor: primary, bgcolor: alpha(primary, 0.03) },
                      }}
                    >
                      <GripVertical size={14} color="#b0b8c1" style={{ flexShrink: 0 }} />
                      {Icon && <Icon size={15} color="#57433e" style={{ flexShrink: 0 }} />}
                      <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#3f1417' }}>{item.text}</Typography>
                    </Box>
                  </React.Fragment>
                );
              })}
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* ── Export Business Data ── */}
      <Box sx={{ mb: 2, display: activeTab === 'data' ? 'block' : 'none' }}>
        <Card elevation={0} sx={{ ...cardSx.sx }}>
          <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid #f6efe9', display: 'flex', alignItems: 'center', gap: 1 }}>
            <Download size={13} color={primary} style={{ opacity: 0.7 }} />
            <Typography sx={{ fontWeight: 700, fontSize: '0.875rem' }}>Export Data</Typography>
          </Box>
          <CardContent sx={{ p: 0 }}>
            {[
              {
                icon: Download, iconColor: primary,
                title: 'Export to Excel',
                desc: 'All data (Items, Parties, Sales, Purchases, Expenses) as a .xlsx workbook',
                label: 'Export Excel',
                onClick: () => { const biz = currentBusiness; if (!biz) return; exportFullBusinessToExcel({ businessName: biz.name, businessId: biz.id, allData: data, customSections: config.customSections || [] }); },
              },
              {
                icon: FileDown, iconColor: '#5c1f22',
                title: 'Export to Tally XML',
                desc: 'Sales & Purchase vouchers as Tally-compatible XML. Import via Gateway → Import Data → Vouchers',
                label: 'Export XML',
                onClick: () => { const biz = currentBusiness; if (!biz) return; exportToTallyXML({ sales: getItems('sales').filter(s => s.businessId === biz.id), purchases: getItems('purchases').filter(p => p.businessId === biz.id), businessName: biz.name, filename: `${biz.name}_tally_export.xml` }); },
              },
            ].map(({ icon: Icon, iconColor, title, desc, label, onClick }, i, arr) => (
              <Box key={title} sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 2, py: 1.5, borderBottom: i < arr.length - 1 ? '1px solid #f6efe9' : 'none' }}>
                <Box sx={{ width: 36, height: 36, borderRadius: '8px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: alpha(iconColor, 0.1) }}>
                  <Icon size={16} color={iconColor} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', lineHeight: 1.3 }}>{title}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>{desc}</Typography>
                </Box>
                <Button variant="outlined" size="small" startIcon={<Icon size={13} />} onClick={onClick}
                  sx={{ borderRadius: '6px', textTransform: 'none', fontSize: '0.8rem', fontWeight: 600, flexShrink: 0, borderColor: alpha(iconColor, 0.35), color: iconColor, '&:hover': { bgcolor: alpha(iconColor, 0.06), borderColor: iconColor } }}>
                  {label}
                </Button>
              </Box>
            ))}
          </CardContent>
        </Card>
      </Box>

      {/* ── Danger Zone ── */}
      <Box sx={{ mb: 2, display: activeTab === 'data' ? 'block' : 'none' }}>
        <Card elevation={0} sx={{ border: '1px solid #fca5a5', borderRadius: '12px', bgcolor: alpha('#dc2626', 0.02) }}>
          <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid #fca5a5', display: 'flex', alignItems: 'center', gap: 1 }}>
            <AlertTriangle size={13} color="#dc2626" style={{ opacity: 0.8 }} />
            <Typography sx={{ fontWeight: 700, fontSize: '0.875rem', color: '#dc2626' }}>Danger Zone</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 2, py: 1.5 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: '#dc2626', lineHeight: 1.3 }}>Delete All Business Data</Typography>
              <Typography variant="caption" color="text.secondary">
                Permanently erase all records for <strong>{currentBusiness?.name || 'this business'}</strong>. Business profile remains. Cannot be undone.
              </Typography>
            </Box>
            <Button variant="outlined" size="small" startIcon={<Trash2 size={13} />} onClick={handleDeleteAllData}
              sx={{ flexShrink: 0, borderRadius: '6px', textTransform: 'none', fontSize: '0.8rem', fontWeight: 700, color: '#dc2626', borderColor: '#fca5a5', '&:hover': { bgcolor: alpha('#dc2626', 0.07), borderColor: '#dc2626' } }}>
              Delete Data
            </Button>
          </Box>
        </Card>
      </Box>

        </Box>{/* end right content */}
      </Box>{/* end flex row */}

    </Box>

    {/* ── Add-Business popup (collects details, then opens payment) ── */}
    <AddBusinessDialog open={isNew} onClose={() => setIsNew(false)} onCreate={handleCreateBusiness} />

    {/* ── Add-business payment modal ── */}
    <Dialog open={showBizPayModal} onClose={() => setShowBizPayModal(false)} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>Subscribe {pendingBizData?.name || 'your new business'}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Each business needs its own subscription — all features, cloud backup &amp; multi-device sync.
          The business is created as soon as the payment succeeds.
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
          {PLAN_LIST.map(p => (
            <Box key={p.id} sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: alpha(primary, 0.25), bgcolor: alpha(primary, 0.04) }}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'text.secondary' }}>{p.name}{p.badge ? ` · ${p.badge}` : ''}</Typography>
              <Typography sx={{ fontWeight: 900, fontSize: '1.35rem', color: primary }}>₹{p.price.toLocaleString('en-IN')}</Typography>
              <Typography variant="caption" color="text.secondary">{p.period}</Typography>
            </Box>
          ))}
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.25 }}>
          You'll choose the plan on the next step. Plans can't be cancelled or refunded once paid.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => { setShowBizPayModal(false); setPendingBizData(null); }}>Cancel</Button>
        <Button variant="contained" onClick={bizPayNow} disabled={bizPaying}
          startIcon={bizPaying ? <CircularProgress size={14} color="inherit" /> : undefined}
          sx={{ textTransform: 'none', fontWeight: 700 }}>
          Continue to payment
        </Button>
      </DialogActions>
    </Dialog>
    {bizCheckoutDialog}
    {bizPayError && (
      <Snackbar open anchorOrigin={{ vertical: 'top', horizontal: 'center' }} onClose={() => setBizPayError('')}>
        <Alert severity="error" variant="filled" onClose={() => setBizPayError('')}>{bizPayError}</Alert>
      </Snackbar>
    )}

    {/* ── Delete Data dialog ── */}
    {(() => {
      const RED = '#dc2626';
      const DATA_ICONS = { sales: ReceiptText, purchases: ShoppingBag, payments: CreditCard, expenses: Wallet, cashEntries: Landmark, parties: Users, items: Package, estimates: FileText, orders: ClipboardList, creditNotes: CornerUpLeft, debitNotes: RotateCcw, deliveryNotes: Truck, journalEntries: BookOpen, opticals: Eye, memberships: Handshake, investors: DollarSign, customSectionRecords: LayoutList };
      const SETTING_ICONS = { cfg_invoice: Printer, cfg_features: SlidersHorizontal, cfg_lists: Layers, cfg_other: Barcode, staff: Users };
      const allData = deleteDataSel.length === DELETE_DATA_GROUPS.length;
      const toggleData = (key) => { setDeleteDataSel(sel => sel.includes(key) ? sel.filter(k => k !== key) : [...sel, key]); setDeleteDataInputError(''); };
      const toggleSetting = (key) => { setDeleteSettingsSel(sel => sel.includes(key) ? sel.filter(k => k !== key) : [...sel, key]); setDeleteDataInputError(''); };
      const selRecords = DELETE_DATA_GROUPS.filter(g => deleteDataSel.includes(g.key)).reduce((n, g) => n + (deleteDataCounts[g.key] || 0), 0)
        + (deleteSettingsSel.includes('staff') ? (deleteDataCounts.staff || 0) : 0);
      const resetCount = deleteSettingsSel.filter(k => k !== 'staff').length;
      const keepsPartiesOnly = !deleteDataSel.includes('parties') && ['sales', 'purchases', 'payments'].some(k => deleteDataSel.includes(k));
      const hasPwd = !!scopedBiz?.adminPassword;
      const nothing = deleteDataSel.length === 0 && deleteSettingsSel.length === 0;
      const canGo = !nothing && (hasPwd ? !!deleteDataInput : deleteDataInput.trim().toLowerCase() === 'delete');
      const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

      return (
        <Dialog open={deleteDataDialog} onClose={() => setDeleteDataDialog(false)} maxWidth="sm" fullWidth fullScreen={isMobile}
          slotProps={{ paper: { sx: { borderRadius: isMobile ? 0 : '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: isMobile ? '100%' : 'calc(100% - 48px)' } }, backdrop: { sx: { bgcolor: 'rgba(0,0,0,0.45)' } } }}>

          {/* Header */}
          <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 1.5, px: 2.5, py: 1.75, bgcolor: alpha(RED, 0.05), borderBottom: `1px solid ${alpha(RED, 0.15)}` }}>
            <Box sx={{ width: 38, height: 38, borderRadius: '10px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: RED, color: '#fff' }}>
              <Trash2 size={18} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 800, fontSize: '1rem', lineHeight: 1.25 }}>Delete data</Typography>
              <Typography noWrap sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                {currentBusiness?.name || 'This business'} · ticked items are erased, the rest is kept
              </Typography>
            </Box>
            <IconButton size="small" onClick={() => setDeleteDataDialog(false)} aria-label="Close"><X size={18} /></IconButton>
          </Box>

          {/* Body */}
          <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 2.5, py: 2 }}>
            <DelSectionHead icon={HardDrive} title="Records"
              chip={<Chip size="small" label={`${deleteDataSel.length}/${DELETE_DATA_GROUPS.length}`} sx={{ height: 20, fontSize: '0.66rem', fontWeight: 700 }} />}
              action={
                <Button size="small" onClick={() => { setDeleteDataSel(allData ? [] : DELETE_DATA_GROUPS.map(g => g.key)); setDeleteDataInputError(''); }}
                  sx={{ textTransform: 'none', fontSize: '0.74rem', fontWeight: 700, py: 0 }}>
                  {allData ? 'Keep all' : 'Select all'}
                </Button>
              } />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr' }, gap: 0.75 }}>
              {DELETE_DATA_GROUPS.map(g => {
                const cnt = deleteDataCounts[g.key] || 0;
                return (
                  <DelTile key={g.key} on={deleteDataSel.includes(g.key)} onClick={() => toggleData(g.key)}
                    icon={DATA_ICONS[g.key] || FileText} label={g.label} sub={`${fmt(cnt)} record${cnt === 1 ? '' : 's'}`} dim={cnt === 0} />
                );
              })}
            </Box>
            {keepsPartiesOnly && (
              <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-start', mt: 1, px: 1, py: 0.75, borderRadius: '8px', bgcolor: alpha('#f59e0b', 0.1) }}>
                <AlertTriangle size={14} color="#b45309" style={{ flexShrink: 0, marginTop: 1 }} />
                <Typography sx={{ fontSize: '0.72rem', color: '#92400e', lineHeight: 1.4 }}>
                  Customers & Vendors are kept, but their balances are not recalculated after deleting bills or payments.
                </Typography>
              </Box>
            )}

            <Box sx={{ mt: 2.25 }}>
              <DelSectionHead icon={SlidersHorizontal} title="Settings"
                chip={deleteSettingsSel.length
                  ? <Chip size="small" label={`${deleteSettingsSel.length} selected`} sx={{ height: 20, fontSize: '0.66rem', fontWeight: 700, bgcolor: alpha(RED, 0.1), color: RED }} />
                  : <Chip size="small" icon={<ShieldCheck size={11} />} label="All kept" sx={{ height: 20, fontSize: '0.66rem', fontWeight: 700, bgcolor: alpha('#16a34a', 0.1), color: '#15803d', '& .MuiChip-icon': { color: '#15803d' } }} />}
                action={deleteSettingsSel.length > 0 && (
                  <Button size="small" onClick={() => setDeleteSettingsSel([])} sx={{ textTransform: 'none', fontSize: '0.74rem', fontWeight: 700, py: 0 }}>Keep all</Button>
                )} />
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 0.75 }}>
                {DELETE_SETTINGS_GROUPS.map(g => {
                  const on = deleteSettingsSel.includes(g.key);
                  const isStaff = g.key === 'staff';
                  return (
                    <DelTile key={g.key} on={on} onClick={() => toggleSetting(g.key)}
                      icon={SETTING_ICONS[g.key] || SlidersHorizontal}
                      label={isStaff ? `${g.label} (${deleteDataCounts.staff || 0})` : g.label}
                      sub={g.desc}
                      badge={on && (
                        <Box sx={{ flexShrink: 0, px: 0.6, py: 0.1, borderRadius: '5px', bgcolor: RED, color: '#fff', fontSize: '0.6rem', fontWeight: 800 }}>
                          {isStaff ? 'DELETE' : 'RESET'}
                        </Box>
                      )} />
                  );
                })}
              </Box>
              <Typography sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1, fontSize: '0.7rem', color: 'text.secondary' }}>
                <Lock size={11} /> The business and its profile (name, address, GST, bank) are never deleted here.
              </Typography>
            </Box>
          </Box>

          {/* Footer */}
          <Box sx={{ flexShrink: 0, borderTop: '1px solid', borderColor: 'divider', px: 2.5, pt: 1.5, pb: 2, bgcolor: 'background.paper' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.25, px: 1.25, py: 0.85, borderRadius: '10px', bgcolor: nothing ? alpha('#57433e', 0.06) : alpha(RED, 0.06) }}>
              <AlertTriangle size={15} color={nothing ? '#57433e' : RED} style={{ flexShrink: 0 }} />
              <Typography sx={{ fontSize: '0.76rem', lineHeight: 1.4, color: nothing ? 'text.secondary' : '#991b1b' }}>
                {nothing
                  ? 'Nothing selected yet.'
                  : <>Will delete <b>{fmt(selRecords)} record{selRecords === 1 ? '' : 's'}</b>{resetCount > 0 && <> and reset <b>{resetCount} setting group{resetCount > 1 ? 's' : ''}</b></>}. This cannot be undone.</>}
              </Typography>
            </Box>

            <TextField
              fullWidth size="small" autoComplete="off" type={hasPwd ? 'password' : 'text'}
              label={hasPwd ? 'Admin password' : 'Type "delete" to confirm'}
              placeholder={hasPwd ? '' : 'delete'}
              value={deleteDataInput}
              onChange={e => { setDeleteDataInput(e.target.value); setDeleteDataInputError(''); }}
              onKeyDown={e => e.key === 'Enter' && canGo && handleDeleteDataConfirm()}
              error={!!deleteDataInputError}
              helperText={deleteDataInputError || ' '}
              sx={{ mb: 0.25 }}
            />

            <Box sx={{ display: 'flex', gap: 1, flexDirection: { xs: 'column-reverse', sm: 'row' }, '& > .MuiButton-root': { width: { xs: '100%', sm: 'auto' } } }}>
              <Button variant="text" onClick={() => setDeleteDataDialog(false)}
                sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700, color: 'text.secondary' }}>
                Cancel
              </Button>
              <Box sx={{ flex: 1, display: { xs: 'none', sm: 'block' } }} />
              <Button variant="outlined" onClick={() => handleDeleteDataConfirm(true)} disabled={!canGo}
                startIcon={<Download size={14} />}
                sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700, color: RED, borderColor: alpha(RED, 0.4), '&:hover': { bgcolor: alpha(RED, 0.06), borderColor: RED } }}>
                Backup & Delete
              </Button>
              <Button variant="contained" onClick={() => handleDeleteDataConfirm(false)} disabled={!canGo}
                startIcon={<Trash2 size={14} />}
                sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700, bgcolor: RED, boxShadow: 'none', '&:hover': { bgcolor: '#b91c1c', boxShadow: 'none' }, '&.Mui-disabled': { bgcolor: alpha(RED, 0.35), color: '#fff' } }}>
                {allData && deleteSettingsSel.length === DELETE_SETTINGS_GROUPS.length ? 'Delete everything' : 'Delete selected'}
              </Button>
            </Box>
          </Box>
        </Dialog>
      );
    })()}

    {/* ── Reset Counter Confirmation Dialog ── */}
    <Dialog open={!!resetCounterDlg} onClose={() => setResetCounterDlg(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '14px' } }}>
      <Box sx={{ px: 3, pt: 3, pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.5 }}>
          <Box sx={{ p: 1, borderRadius: '10px', bgcolor: '#fef3c7', display: 'flex' }}>
            <RotateCcw size={18} color="#d97706" />
          </Box>
          <Typography sx={{ fontWeight: 800, fontSize: '1rem' }}>Reset {resetCounterDlg?.label} Counter?</Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          This will restart numbering from{' '}
          <strong>{resetCounterDlg?.prefix}-{String(resetCounterDlg?.start ?? 1).padStart(4, '0')}</strong>.
          All existing {resetCounterDlg?.label?.toLowerCase()} records are unaffected but future ones will reuse these numbers.
        </Typography>
        <Typography variant="body2" sx={{ mb: 1, fontWeight: 600, color: '#374151' }}>
          Type <strong>reset</strong> to confirm:
        </Typography>
        <TextField
          autoFocus fullWidth size="small"
          placeholder="Type reset here…"
          value={resetCounterInput}
          onChange={e => setResetCounterInput(e.target.value)}
          onKeyDown={async e => {
            if (e.key === 'Enter' && resetCounterInput.trim().toLowerCase() === 'reset') {
              const dlg = resetCounterDlg;
              setResetCounterDlg(null);
              setResetCounterInput('');
              await saveConfig({ ...config, invoiceNumberConfig: { ...(config.invoiceNumberConfig || {}), [dlg.resetKey]: dlg.start } });
            }
          }}
          sx={{ mb: 2.5, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
          inputProps={{ style: { fontFamily: 'monospace', fontWeight: 700 } }}
        />
      </Box>
      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', px: 3, pb: 2.5 }}>
        <Button size="small" variant="outlined" onClick={() => setResetCounterDlg(null)}
          sx={{ borderRadius: '8px', textTransform: 'none' }}>Cancel</Button>
        <Button size="small" variant="contained" color="warning" disabled={resetCounterInput.trim().toLowerCase() !== 'reset'}
          onClick={async () => {
            const dlg = resetCounterDlg;
            setResetCounterDlg(null);
            setResetCounterInput('');
            await saveConfig({ ...config, invoiceNumberConfig: { ...(config.invoiceNumberConfig || {}), [dlg.resetKey]: dlg.start } });
          }}
          sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700 }}>
          Reset Counter
        </Button>
      </Box>
    </Dialog>

    {/* ── Bill Designer (free-form header/footer) ── */}
    <Dialog open={billDesignerOpen} onClose={() => setBillDesignerOpen(false)} fullScreen>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 3, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        <LayoutTemplate size={20} color={primary} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '1rem' }}>Bill Designer</Typography>
          <Typography sx={{ fontSize: '0.74rem', color: 'text.secondary' }}>
            Place and size everything on your bill — every paper size, thermal and dot matrix included, gets its own design.
          </Typography>
        </Box>
        <Button onClick={() => setBillDesignerOpen(false)} sx={{ textTransform: 'none', fontWeight: 600, color: 'text.secondary' }}>Cancel</Button>
        <Button variant="contained" startIcon={<Check size={15} />}
          onClick={() => {
            setPrintOptsDraft(d => {
              const cur = d ?? config.billPrintOptions ?? {};
              const theme = useDesignerTemp ? 'designer' : (cur.invoiceTheme === 'designer' ? 'classic' : cur.invoiceTheme);
              return { ...cur, invoiceTheme: theme, billDesigns: billDesignsTemp };
            });
            setBillDesignerOpen(false);
          }}
          sx={{ ...gradBtnSx, textTransform: 'none', fontWeight: 700 }}>
          Apply to bill
        </Button>
      </Box>
      <Box sx={{ p: { xs: 2, md: 3 }, overflowY: 'auto' }}>
        {billDesignerOpen && billDesignsTemp && (
          <BillDesigner
            designs={billDesignsTemp}
            onDesignsChange={setBillDesignsTemp}
            fallbackDesign={printOptsEff.billDesign}
            initialPaperSize={printOptsEff._paperSize ?? config.defaultPaperSize ?? 'A4'}
            useDesignerTheme={useDesignerTemp}
            onUseDesignerThemeChange={setUseDesignerTemp}
            opts={printOptsEff}
            business={currentBusiness}
            primary={primary}
          />
        )}
        <Typography sx={{ fontSize: '0.72rem', color: 'text.disabled', mt: 1.5 }}>
          After "Apply to bill", click Save in the Invoice settings to keep the design.
        </Typography>
      </Box>
    </Dialog>

    {/* ── Theme Picker Dialog ── */}
    <Dialog
      open={themePickerOpen}
      onClose={() => setThemePickerOpen(false)}
      maxWidth="md"
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: '16px', overflow: 'hidden', height: '85vh' } } }}
    >
      <DialogTitle sx={{ pb: 1, pt: 2, px: 3, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '1rem' }}>Choose Invoice Layout</Typography>
          <IconButton size="small" onClick={() => setThemePickerOpen(false)} sx={{ color: 'text.secondary' }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>✕</span>
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent sx={{ p: 0, display: 'flex', overflow: 'hidden' }}>
        {/* Left panel: scrollable theme list */}
        <Box sx={{ width: 220, flexShrink: 0, borderRight: '1px solid', borderColor: 'divider', overflowY: 'auto', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {INVOICE_THEMES.map(theme => {
            const isSel = (tempTheme ?? (printOptsEff.invoiceTheme || 'classic')) === theme.value;
            const ps = printOptsEff._paperSize ?? config.defaultPaperSize ?? 'A4';
            const pw = getPaperWidthPx(ps);
            const thumbScale = 160 / pw;
            const thumbH = Math.round(pw * thumbScale * 1.41);
            return (
              <Box
                key={theme.value}
                onClick={() => setTempTheme(theme.value)}
                sx={{
                  border: '2px solid', borderColor: isSel ? primary : 'divider',
                  borderRadius: `${baseRadius + 2}px`, p: 1, cursor: 'pointer',
                  bgcolor: isSel ? alpha(primary, 0.04) : 'transparent',
                  transition: 'all 0.15s',
                  '&:hover': { borderColor: alpha(primary, isSel ? 1 : 0.4) },
                }}
              >
                {/* Mini scaled preview */}
                <Box sx={{ width: 160, height: thumbH, overflow: 'hidden', borderRadius: '6px', border: '1px solid', borderColor: 'divider', bgcolor: '#fff', mb: 0.75, flexShrink: 0 }}>
                  <Box sx={{ transform: `scale(${thumbScale})`, transformOrigin: 'top left', width: pw }}>
                    <InvoiceTemplateComponent
                      transaction={SAMPLE_INVOICE}
                      business={SAMPLE_BUSINESS}
                      paperSize={ps === 'A5' ? 'A5' : 'A4'}
                      printOptions={{ ...printOptsEff, invoiceTheme: theme.value }}
                    />
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.82rem', color: isSel ? primary : 'text.primary', flex: 1 }}>{theme.label}</Typography>
                  {isSel && <Check size={13} color={primary} />}
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3, display: 'block', mt: 0.25 }}>{theme.desc}</Typography>
              </Box>
            );
          })}
        </Box>

        {/* Right panel: section builder (Custom theme only) + full-size preview of tempTheme */}
        {(() => {
          const selectedThemeValue = tempTheme ?? (printOptsEff.invoiceTheme || 'classic');
          const ps = printOptsEff._paperSize ?? config.defaultPaperSize ?? 'A4';
          const isCustom = selectedThemeValue === 'custom';
          const pw = getPaperWidthPx(ps);
          const rightPanelW = isCustom ? 360 : 580;
          const scale = Math.min(rightPanelW / pw, 0.55);
          const previewOpts = { ...printOptsEff, invoiceTheme: selectedThemeValue };
          return (
            <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              {isCustom && (
                <Box sx={{ width: 300, flexShrink: 0, borderRight: '1px solid', borderColor: 'divider', overflowY: 'auto', p: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                    <GripVertical size={14} color={alpha(primary, 0.7)} />
                    <Typography sx={{ fontWeight: 700, fontSize: '0.82rem' }}>Build Your Layout</Typography>
                  </Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5, lineHeight: 1.4 }}>
                    Drag to reorder sections, toggle off any you don't want on the bill. Preview updates live.
                  </Typography>
                  <CustomTemplateEditor
                    customTemplate={printOptsEff.customTemplate}
                    primary={primary}
                    dragKeyRef={customTemplateDragKey}
                    onChange={(next) => setPrintOptsDraft(d => ({ ...(d ?? config.billPrintOptions ?? {}), customTemplate: next }))}
                  />
                </Box>
              )}
              <Box sx={{ flex: 1, overflowY: 'auto', bgcolor: '#e5e7eb', p: 2, display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
                <ScaledPreviewBox key={`${ps}-${selectedThemeValue}-${JSON.stringify(previewOpts.customTemplate)}`} scale={scale} width={pw}>
                  <InvoiceTemplateComponent
                    transaction={SAMPLE_INVOICE}
                    business={SAMPLE_BUSINESS}
                    paperSize={ps}
                    printOptions={previewOpts}
                  />
                </ScaledPreviewBox>
              </Box>
            </Box>
          );
        })()}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5, borderTop: '1px solid', borderColor: 'divider', gap: 1 }}>
        <Button variant="outlined" onClick={() => setThemePickerOpen(false)} sx={{ borderRadius: `${baseRadius + 2}px`, textTransform: 'none', fontWeight: 700, px: 2.5, borderColor: 'divider', color: 'text.secondary' }}>
          Cancel
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="contained"
          onClick={() => {
            if (tempTheme) {
              setPrintOptsDraft(d => ({ ...(d ?? config.billPrintOptions ?? {}), invoiceTheme: tempTheme }));
            }
            setThemePickerOpen(false);
          }}
          sx={{ ...gradBtnSx, textTransform: 'none', fontWeight: 700, px: 3, borderRadius: `${baseRadius + 2}px` }}
        >
          Apply Layout
        </Button>
      </DialogActions>
    </Dialog>

    {/* ── Bill Preview Dialog — quick full-screen preview with current settings ── */}
    <Dialog
      open={billPreviewOpen}
      onClose={() => setBillPreviewOpen(false)}
      maxWidth="md"
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: '16px', overflow: 'hidden', height: '85vh' } } }}
    >
      <DialogTitle sx={{ pb: 1, pt: 2, px: 3, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '1rem' }}>Bill Preview</Typography>
            <Typography variant="caption" color="text.secondary">Sample invoice with your current print settings applied</Typography>
          </Box>
          <IconButton size="small" onClick={() => setBillPreviewOpen(false)} sx={{ color: 'text.secondary' }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>✕</span>
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent sx={{ p: 0, display: 'flex', justifyContent: 'center', overflow: 'auto', bgcolor: '#e5e7eb' }}>
        {(() => {
          const ps = printOptsEff._paperSize ?? config.defaultPaperSize ?? 'A4';
          const pw = getPaperWidthPx(ps);
          const BillPreviewDialogContent = () => {
            const containerRef = React.useRef(null);
            const [containerW, setContainerW] = React.useState(0);
            React.useEffect(() => {
              if (!containerRef.current) return;
              const ro = new ResizeObserver(entries => setContainerW(entries[0].contentRect.width));
              ro.observe(containerRef.current);
              return () => ro.disconnect();
            }, []);
            const scale = containerW > 0 ? Math.min((containerW - 48) / pw, 0.85) : 0.5;
            return (
              <Box ref={containerRef} sx={{ width: '100%', p: 3, display: 'flex', justifyContent: 'center' }}>
                <ScaledPreviewBox key={ps} scale={scale} width={pw}>
                  <InvoiceTemplateComponent
                    transaction={SAMPLE_INVOICE}
                    business={SAMPLE_BUSINESS}
                    paperSize={ps}
                    printOptions={printOptsEff}
                  />
                </ScaledPreviewBox>
              </Box>
            );
          };
          return <BillPreviewDialogContent />;
        })()}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
        <Button variant="contained" onClick={() => setBillPreviewOpen(false)} sx={{ ...gradBtnSx, textTransform: 'none', fontWeight: 700, px: 3, borderRadius: `${baseRadius + 2}px` }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>

    </>
  );
};

export default SettingsPage;
