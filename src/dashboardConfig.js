// Dashboard customisation (Settings → Dashboard). Stored per business as
// `config.dashboard` = { widgets: [{ key, visible }], kpis: { id: bool },
// showClock, defaultPeriod, shortcuts: [{ id, type, target, label, color }] }.
import {
  ReceiptText, ShoppingBag, DollarSign, Download, Upload, Banknote, Landmark,
  Users, Package, FileText, ClipboardList, CornerUpLeft, RotateCcw, Truck,
  BarChart3, BookOpen, Wallet, Calculator, Store, HardDrive, Settings as SettingsIcon,
  Eye, Handshake, UserCog, TrendingUp, Link2, HelpCircle, Zap,
} from 'lucide-react';

export const DASHBOARD_WIDGETS = [
  { key: 'shortcuts', label: 'Shortcuts', desc: 'Your quick-access buttons' },
  { key: 'summary', label: 'Business summary', desc: 'KPI cards with clock & calendar' },
  { key: 'chart', label: 'Sales & purchase chart', desc: 'Trend for the selected period' },
  { key: 'expenses', label: 'Expense breakdown', desc: 'Donut by category' },
  { key: 'activity', label: 'Activity stream', desc: 'Latest invoices and bills' },
  { key: 'notes', label: 'Notes', desc: 'Whiteboard for things to remember' },
  { key: 'overdue', label: 'Overdue bills', desc: 'Unpaid, past due date' },
  { key: 'payables', label: 'Vendor payables', desc: 'Amounts owed to vendors' },
  { key: 'examReminders', label: 'Eye exam reminders', desc: 'Opticals module only' },
];

export const DASHBOARD_KPIS = [
  { id: 'sales', label: 'Sales' },
  { id: 'purchases', label: 'Purchases' },
  { id: 'receivable', label: 'Receivable' },
  { id: 'payable', label: 'Payable' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'cash', label: 'Cash in Hand' },
  { id: 'bank', label: 'Bank Balance' },
  { id: 'capital', label: 'Total Capital' },
];

export const DASHBOARD_PERIODS = [
  { value: 'day', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
];

export const SHORTCUT_ICONS = {
  invoice: ReceiptText, purchase: ShoppingBag, expense: DollarSign, payIn: Download, payOut: Upload,
  cash: Banknote, bank: Landmark, parties: Users, items: Package, estimate: FileText, order: ClipboardList,
  credit: CornerUpLeft, debit: RotateCcw, delivery: Truck, reports: BarChart3, ledger: BookOpen,
  wallet: Wallet, calculator: Calculator, pos: Store, backup: HardDrive, settings: SettingsIcon,
  opticals: Eye, membership: Handshake, staff: UserCog, investors: TrendingUp, link: Link2, help: HelpCircle, zap: Zap,
};

export const SHORTCUT_COLORS = ['#5c1f22', '#5c1f22', '#5c1f22', '#d97706', '#e11d48', '#0891b2', '#7c3aed', '#7a2e30'];

// `action` = opens a page AND starts a new entry; `page` = just opens it.
// `feature` = only offered/shown while that module is switched on.
export const SHORTCUT_PRESETS = [
  { type: 'action', target: 'newInvoice', label: 'New Invoice', icon: 'invoice', color: '#5c1f22', path: '/sales', tab: 'New Invoice', intent: 'createNew' },
  { type: 'action', target: 'newPurchase', label: 'New Purchase', icon: 'purchase', color: '#5c1f22', path: '/purchases', tab: 'New Purchase', intent: 'createNew' },
  { type: 'action', target: 'addExpense', label: 'Add Expense', icon: 'expense', color: '#e11d48', path: '/expenses', tab: 'Expenses', intent: 'openAdd' },
  { type: 'action', target: 'paymentIn', label: 'Payment In', icon: 'payIn', color: '#5c1f22', path: '/payment-in', tab: 'Payment In', intent: 'openAdd' },
  { type: 'action', target: 'paymentOut', label: 'Payment Out', icon: 'payOut', color: '#d97706', path: '/payment-out', tab: 'Payment Out', intent: 'openAdd' },
  { type: 'action', target: 'cashIn', label: 'Cash In', icon: 'cash', color: '#0891b2', path: '/cash', tab: 'Cash Book', intent: 'cash_in' },
  { type: 'action', target: 'cashOut', label: 'Cash Out', icon: 'cash', color: '#7a2e30', path: '/cash', tab: 'Cash Book', intent: 'cash_out' },
  { type: 'page', target: '/pos', label: 'POS', icon: 'pos', color: '#5c1f22', feature: 'pos' },
  { type: 'page', target: '/sales', label: 'Sales', icon: 'invoice', color: '#5c1f22' },
  { type: 'page', target: '/purchases', label: 'Purchases', icon: 'purchase', color: '#5c1f22' },
  { type: 'page', target: '/parties', label: 'Customers & Vendors', icon: 'parties', color: '#7c3aed' },
  { type: 'page', target: '/items', label: 'Items', icon: 'items', color: '#d97706' },
  { type: 'page', target: '/reports', label: 'Reports', icon: 'reports', color: '#0891b2', feature: 'reports' },
  { type: 'page', target: '/ledger', label: 'Ledger', icon: 'ledger', color: '#7a2e30' },
  { type: 'page', target: '/cash', label: 'Cash & Bank', icon: 'bank', color: '#0891b2' },
  { type: 'page', target: '/expenses', label: 'Expenses', icon: 'wallet', color: '#e11d48' },
  { type: 'page', target: '/estimates', label: 'Estimates', icon: 'estimate', color: '#5c1f22', feature: 'estimates' },
  { type: 'page', target: '/orders', label: 'Orders', icon: 'order', color: '#5c1f22', feature: 'orders' },
  { type: 'page', target: '/credit-notes', label: 'Credit Notes', icon: 'credit', color: '#7c3aed', feature: 'creditNotes' },
  { type: 'page', target: '/debit-notes', label: 'Debit Notes', icon: 'debit', color: '#7c3aed', feature: 'debitNotes' },
  { type: 'page', target: '/delivery-notes', label: 'Delivery Notes', icon: 'delivery', color: '#d97706', feature: 'deliveryNotes' },
  { type: 'page', target: '/opticals', label: 'Opticals', icon: 'opticals', color: '#0891b2', feature: 'opticals' },
  { type: 'page', target: '/membership', label: 'Membership', icon: 'membership', color: '#7c3aed', feature: 'membership' },
  { type: 'page', target: '/investors', label: 'Investors', icon: 'investors', color: '#5c1f22', feature: 'investors' },
  { type: 'page', target: '/staff', label: 'Staff', icon: 'staff', color: '#7a2e30', feature: 'staff' },
  { type: 'page', target: '/calculator', label: 'Calculator', icon: 'calculator', color: '#7a2e30' },
  { type: 'page', target: '/backup', label: 'Backup', icon: 'backup', color: '#7a2e30' },
  { type: 'page', target: '/settings', label: 'Settings', icon: 'settings', color: '#7a2e30' },
  { type: 'page', target: '/help', label: 'Help', icon: 'help', color: '#7a2e30' },
];

export const presetFor = (s) => SHORTCUT_PRESETS.find(p => p.type === s.type && p.target === s.target);

// Is this shortcut usable with the business's current module switches?
export const shortcutAvailable = (s, features = {}) => {
  if (s.type === 'link') return !!s.target;
  const p = presetFor(s);
  if (!p) return false;
  return !p.feature || features[p.feature] !== false;
};

export const DEFAULT_SHORTCUTS = ['newInvoice', 'newPurchase', 'addExpense', 'paymentIn', 'paymentOut']
  .map((t, i) => { const p = SHORTCUT_PRESETS.find(x => x.target === t); return { id: `sc_default_${i}`, type: p.type, target: p.target, label: p.label, icon: p.icon, color: p.color }; });

export const DEFAULT_DASHBOARD = {
  widgets: DASHBOARD_WIDGETS.map(w => ({ key: w.key, visible: true })),
  kpis: Object.fromEntries(DASHBOARD_KPIS.map(k => [k.id, true])),
  showClock: true,
  defaultPeriod: 'day',
  shortcuts: DEFAULT_SHORTCUTS,
};

// Fill in anything missing from a saved dashboard (and drop unknown widgets),
// so new widgets added in later versions show up automatically.
export const resolveDashboard = (saved) => {
  const d = saved && typeof saved === 'object' ? saved : {};
  const known = new Set(DASHBOARD_WIDGETS.map(w => w.key));
  const seen = new Set();
  const widgets = [];
  (Array.isArray(d.widgets) ? d.widgets : []).forEach(w => {
    if (w && known.has(w.key) && !seen.has(w.key)) { seen.add(w.key); widgets.push({ key: w.key, visible: w.visible !== false }); }
  });
  DEFAULT_DASHBOARD.widgets.forEach(w => { if (!seen.has(w.key)) widgets.push({ ...w }); });
  return {
    widgets,
    kpis: { ...DEFAULT_DASHBOARD.kpis, ...(d.kpis || {}) },
    showClock: d.showClock !== false,
    defaultPeriod: DASHBOARD_PERIODS.some(p => p.value === d.defaultPeriod) ? d.defaultPeriod : 'day',
    shortcuts: Array.isArray(d.shortcuts) ? d.shortcuts.filter(s => s && s.type && s.target) : DEFAULT_SHORTCUTS,
  };
};
