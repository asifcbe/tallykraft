// The ONE list of per-staff permissions. Used by Settings → Access Control,
// the Staff page's Access tab, and ConfigContext (which turns off any
// un-granted feature for a staff login). Previously each screen kept its own
// list and they had drifted apart — the Staff page couldn't grant Orders,
// Investors, Calculator, Barcode, Loyalty or Backup at all.
//
// Add a new section here (and to Layout.jsx's STAFF_ROUTE_FEATURES) and it
// appears in both screens. `staff`/`settings` are deliberately absent: those
// pages are owner / business-code-admin only, whatever a staff grant says.
export const STAFF_FEATURE_GROUPS = [
  { group: 'Main', keys: ['dashboard', 'pos', 'sales', 'purchases', 'expenses', 'payments'] },
  { group: 'Records', keys: ['parties', 'items', 'estimates', 'orders', 'creditNotes', 'debitNotes', 'deliveryNotes', 'membership', 'investors', 'opticals'] },
  { group: 'Accounting', keys: ['reports', 'ledger', 'cash', 'calculator'] },
  { group: 'Tools', keys: ['barcode', 'loyalty', 'viewPurchasePrice'] },
  { group: 'Backup', keys: ['backup', 'backupExportFile', 'backupRestoreFile', 'backupOnline', 'backupRestoreOnline'] },
];

export const STAFF_FEATURE_KEYS = STAFF_FEATURE_GROUPS.flatMap((g) => g.keys);

export const STAFF_FEATURE_LABELS = {
  dashboard: 'Dashboard', pos: 'POS', sales: 'Sales', purchases: 'Purchases',
  expenses: 'Expenses', payments: 'Payments', parties: 'Parties', items: 'Items',
  estimates: 'Estimates', orders: 'Orders', creditNotes: 'Credit Notes',
  debitNotes: 'Debit Notes', deliveryNotes: 'Delivery Notes',
  membership: 'Membership', investors: 'Investors', opticals: 'Opticals', reports: 'Reports',
  ledger: 'Ledger', cash: 'Cash & Bank', calculator: 'Calculator',
  barcode: 'Barcode', loyalty: 'Loyalty Points',
  viewPurchasePrice: 'View Purchase Price',
  backup: 'Backup Page', backupExportFile: 'Export File',
  backupRestoreFile: 'Restore File', backupOnline: 'Backup Online',
  backupRestoreOnline: 'Restore Online',
};

// Off for a NEW staff member until explicitly granted.
export const OFF_BY_DEFAULT = new Set([
  'backup', 'backupOnline', 'backupRestoreOnline', 'backupExportFile', 'backupRestoreFile',
  'viewPurchasePrice', 'estimates', 'orders', 'creditNotes', 'debitNotes', 'deliveryNotes',
  'membership', 'investors', 'opticals', 'loyalty',
]);

export const defaultStaffFeatures = () =>
  STAFF_FEATURE_KEYS.reduce((acc, key) => ({ ...acc, [key]: !OFF_BY_DEFAULT.has(key) }), {});

// Sections that are ALSO a business-level module (Settings → Features). A staff
// grant can't show a section the business itself has switched off, so the
// permission screens flag these. Cash and Calculator count as on unless
// explicitly turned off; the rest must be switched on.
const MODULE_KEYS = new Set([
  'dashboard', 'pos', 'sales', 'purchases', 'expenses', 'payments', 'parties', 'items',
  'estimates', 'orders', 'creditNotes', 'debitNotes', 'deliveryNotes', 'membership',
  'investors', 'opticals', 'reports', 'ledger', 'cash', 'calculator', 'barcode', 'loyalty',
]);
const ON_UNLESS_OFF = new Set(['cash', 'calculator']);
export const isModuleOffForBusiness = (key, features = {}) =>
  MODULE_KEYS.has(key) && (ON_UNLESS_OFF.has(key) ? features?.[key] === false : !features?.[key]);


// Visibility restrictions (ON = more restricted) — kept out of
// STAFF_FEATURE_KEYS so "All On" / "All Off" never flip them.
export const STAFF_RESTRICTION_ITEMS = [
  { key: 'ownBillsOnly', label: 'Show only bills created by this staff', hint: 'Sales & Purchases lists show only the invoices / bills this staff member created.' },
];
