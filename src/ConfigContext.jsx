import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { firestore } from './db';
import { doc, onSnapshot, setDoc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { useAuth } from './AuthContext';
import { isAlwaysAdmin } from './alwaysAdmin';

const ConfigContext = createContext();

const defaultConfig = {
  businessType: 'general',
  features: {
    dashboard: true,
    parties: true,
    items: true,
    pos: true,
    sales: true,
    purchases: true,
    expenses: true,
    opticals: false,
    payments: true,
    reports: true,
    backup: true,
    settings: true,
    backupExportFile: true,
    backupRestoreFile: true,
    backupOnline: true,
    backupRestoreOnline: true,
    estimates: false,
    creditNotes: false,
    deliveryNotes: false,
    orders: false,
    journal: false,
    barcode: true,
    ledger: true,
    cash: true,
    calculator: true,
    membership: false,
    investors: false,
    loyalty: false,
    customerPreview: true,
    unitColumn: true,
    // Off by default — switching businesses is unrestricted unless the user
    // explicitly turns this on in Settings → Access Control. Independent of
    // whether a per-business admin password happens to be set: today the
    // password dialog gates every switch and only skips itself once it's
    // resolved that specific business has no password — this flag lets the
    // user disable that gate entirely, even for businesses that do have one.
    businessSwitchLock: false,
    // On by default — shows a small Paid/Unpaid chip on every sales/purchase
    // bill (list row, grid card, and the preview header) so status is
    // visible at a glance without opening filters.
    billPaymentStatusChip: true,
    // Off by default — attach up to 5 reference photos (receipts, goods,
    // damage, etc.) per sale/purchase. The images themselves are stored
    // ONLY in local IndexedDB (see referenceImages.js) and never sync to
    // Firestore — only this on/off flag and a lightweight array of local
    // image ids on the transaction record travel online.
    referenceImages: false,
    // On by default — adds an optional Packing Charges field to the
    // Sales/Purchases invoice summary (added on top of the grand total,
    // same treatment as Round Off). Independent from shippingCharges below
    // so either can be turned off without affecting the other.
    packingCharges: true,
    // On by default — adds an optional Shipping Charges field, same
    // treatment as packingCharges above but tracked separately.
    shippingCharges: true,
  },
  loyalty: {
    programName: 'Reward Points',
    pointsPerRupee: 1,
    earnEveryRupees: 1,
    rupeePerPoint: 0.25,
    minRedeemPoints: 10,
    showOnBill: true,
  },
  itemDefaults: {
    gstOn: false,
    gstType: 'cgst_sgst',   // cgst_sgst | igst | utgst | composite
    taxRate: 18,
    useCustomRate: false,
    taxInclusive: false,
  },
  multiBusiness: true,
  maxBusinesses: 0,
  // User-customized sidebar nav order — array of path strings. Items not
  // listed here keep their default position (appended in original order).
  sidebarOrder: [],
  useIndexedDB: true,
  theme: {
    primaryColor: '#3f3f46',
    secondaryColor: '#dc004e'
  },
  customSections: [],
  completeOffline: false,
  defaultPaperSize: 'A4',
  expenseCategories: ['Office Supplies', 'Travel', 'Utilities', 'Rent', 'Marketing', 'Equipment', 'Miscellaneous'],
  itemUnits: ['BAG','BAL','BDL','BKL','BOU','BOX','BTL','BUN','CAN','CCM','CMS','CTN','DOZ','DRM','GGK','GMS','GRS','GYD','KGS','KLR','KME','LTR','MLT','MTR','NOS','PAC','PCS','PRS','QTL','ROL','SET','SQF','SQM','SQY','TBS','TGM','THD','TON','TUB','UGS','UNT','YDS'],
  defaultItemUnit: 'NOS',
  invoiceNumberConfig: {
    salesType: 'auto',
    salesPrefix: 'INV',
    salesStartingNumber: 1,
    purchaseType: 'auto',
    purchasePrefix: 'BILL',
    purchaseStartingNumber: 1,
    estimatePrefix: 'EST',
    estimateStartingNumber: 1,
    creditNotePrefix: 'CN',
    creditNoteStartingNumber: 1,
    debitNotePrefix: 'DBN',
    debitNoteStartingNumber: 1,
    deliveryNotePrefix: 'DLV',
    deliveryNoteStartingNumber: 1,
  },
  barcodeLabel: {
    showItemName: true,
    showItemCode: true,
    showMrp: true,
    showSalePrice: true,
    showBarcode: true,
    showBarcodeNumber: true,
    showBusinessName: false,
    showHsn: false,
    showCategory: false,
    showSize: false,
    showVariant: false,
    showExtraFields: true,
    defaultLabelSize: 'standard',
    // Layout settings
    codePosition: 'top',      // 'top' | 'middle' | 'bottom' | 'left' | 'right'
    contentAlign: 'center',   // 'left' | 'center' | 'right'
    borderStyle: 'solid',     // 'solid' | 'dashed' | 'none'
    backgroundColor: '#ffffff',
    textColor: '#000000',
    copies: 1,
    columns: 1,
    contentScale: 1.0,
    codeScale: 1.0,
    fieldStyles: {},
    fieldLabels: {},
  },
  defaultSaleTypeSales: 'credit',
  defaultSaleTypePOS: 'paid',
  billPrintOptions: {
    showLogo: true,
    showGSTIN: true,
    showInvoiceNumber: true,
    showDate: true,
    showGSTColumn: true,
    showDiscountColumn: true,
    showTerms: true,
    showSignature: true,
    showOldBalance: false,
    dateFormat: 'DD/MM/YYYY',
    autoRoundOff: false,
    invoiceTheme: 'classic',
    themeColor: '#0d9488',
    termsText: '',
  },
};

// Every feature flag set to true — used to grant a super-admin full access.
const ALL_FEATURES_ON = Object.keys(defaultConfig.features).reduce(
  (acc, key) => ({ ...acc, [key]: true }),
  {}
);

// Recursively remove undefined values so Firestore doesn't reject the payload
const stripUndefined = (obj) => {
  if (Array.isArray(obj)) return obj.map(stripUndefined);
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, stripUndefined(v)])
    );
  }
  return obj;
};

// Deep merge utility
const deepMerge = (target, source) => {
  if (!source) return target;
  for (const key in source) {
    if (source[key] instanceof Object && key in target) {
      Object.assign(source[key], deepMerge(target[key], source[key]));
    }
  }
  Object.assign(target || {}, source);
  return target;
};

// Fields that are user-level (account-wide, shared by every business under
// one login) — always read from `config`, never overridden per business.
// `features` and `customSections` used to live here, which meant toggling a
// module (Loyalty, Barcode, Customer Preview, etc.) or editing a custom
// section for ANY one business silently changed it for every business on the
// account — not what "enable/disable a feature per business" means. Moved to
// business scope (removed from this set) so each business gets its own
// on/off state and section list, same as barcodeLabel/invoiceNumberConfig
// already work.
//
// No separate migration step was needed: `buildConfig` below seeds `merged`
// from the account-wide `userCfg` FIRST (deepMerge(defaultConfig, userCfg)),
// then `applyBusinessOverride` only replaces a key if the business's OWN
// `config_{bizId}` doc actually contains it. So every existing business
// keeps seeing today's account-wide features/customSections as its
// effective default — nothing changes — until the user explicitly edits
// Settings while that business is selected, which then saves ONLY into that
// business's own config_{bizId} and no longer affects the others.
const USER_LEVEL_KEYS = new Set([
  'multiBusiness', 'maxBusinesses', 'useIndexedDB', 'completeOffline',
  'backupOnlineEnabled', 'theme', 'businessType',
]);

// The set of feature keys that are actual grantable staff PERMISSIONS
// (mirrors Settings.jsx's STAFF_FEATURE_KEYS — kept as an independent literal
// here rather than importing from a page component). Every other key under
// `features` (packingCharges, shippingCharges, unitColumn, customerPreview,
// billPaymentStatusChip, referenceImages, businessSwitchLock, etc.) is an
// owner-configured app-behavior toggle, not something a staff grant list
// should ever be able to switch off — a staff member with ANY explicit grant
// used to have every non-whitelisted feature key zeroed out below, silently
// hiding things like Packing/Shipping Charges that were never meant to be
// staff-permission-gated at all.
const STAFF_GRANTABLE_KEYS = new Set([
  'dashboard', 'pos', 'sales', 'purchases', 'expenses', 'payments',
  'parties', 'items', 'estimates', 'creditNotes', 'deliveryNotes', 'membership', 'opticals',
  'reports', 'journal', 'ledger', 'cash', 'calculator',
  'barcode', 'loyalty', 'settings', 'viewPurchasePrice',
  'backup', 'backupExportFile', 'backupRestoreFile', 'backupOnline', 'backupRestoreOnline',
]);

const applyBusinessOverride = (baseCfg, bizCfg) => {
  if (!bizCfg || typeof bizCfg !== 'object') return baseCfg;
  const out = JSON.parse(JSON.stringify(baseCfg));
  for (const key of Object.keys(bizCfg)) {
    if (!USER_LEVEL_KEYS.has(key)) {
      if (bizCfg[key] instanceof Object && !Array.isArray(bizCfg[key]) && key in out) {
        out[key] = deepMerge(JSON.parse(JSON.stringify(out[key])), bizCfg[key]);
      } else {
        out[key] = bizCfg[key];
      }
    }
  }
  return out;
};

export const ConfigProvider = ({ children }) => {
  const { currentUser, staffSession } = useAuth();
  const [config, setConfig] = useState(defaultConfig);
  const [loading, setLoading] = useState(false);
  // Super-admin-controlled Payment Reminder / Freeze status for this account
  // (see the onSnapshot handler below for how these are derived).
  const [paymentStatus, setPaymentStatus] = useState({ reminderEnabled: false, frozen: false });
  // Track current business ID so we can react when it changes (business switch).
  // Read directly from localStorage since BusinessContext is a child of ConfigProvider.
  const [currentBizId, setCurrentBizId] = useState(
    () => localStorage.getItem('digitzebra_currentBusinessId') || null
  );
  // Raw Firestore doc data — reused when business switches without a Firestore re-read
  const firestoreDataRef = React.useRef(null);
  // Extra biz-level config saved by staff/admin sessions (from businesses/{bizId}/appConfig/settings)
  const bizAppConfigRef = useRef({});

  // Listen for business switches that happen inside BusinessContext (child)
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'digitzebra_currentBusinessId') {
        setCurrentBizId(e.newValue);
      }
    };
    // Also poll on focus (same-tab switches don't fire storage event)
    const onFocus = () => {
      const id = localStorage.getItem('digitzebra_currentBusinessId') || null;
      setCurrentBizId(prev => prev !== id ? id : prev);
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // Build merged config from raw Firestore data + current business override
  const buildConfig = useCallback((data, bizId, email, extraBizCfg) => {
    const userCfg = data?.config || {};
    const bizCfg = bizId ? (data?.[`config_${bizId}`] || {}) : {};

    const merged = deepMerge(JSON.parse(JSON.stringify(defaultConfig)), userCfg);
    if (Array.isArray(userCfg.customSections)) merged.customSections = userCfg.customSections;

    // Apply business-specific overrides (invoice settings, barcode, loyalty config, etc.)
    let withBiz = applyBusinessOverride(merged, bizCfg);
    // Apply extra biz config (saved by staff/admin sessions to businesses/{bizId}/appConfig/settings)
    if (extraBizCfg && Object.keys(extraBizCfg).length > 0) {
      withBiz = applyBusinessOverride(withBiz, extraBizCfg);
    }

    const backupOnlineEnabled = userCfg.backupOnlineEnabled;
    let forceOffline;
    if (backupOnlineEnabled === false) {
      forceOffline = true;
    } else if (backupOnlineEnabled === true) {
      forceOffline = !!withBiz.completeOffline;
    } else {
      forceOffline = !!withBiz.completeOffline;
    }
    if (forceOffline) {
      localStorage.setItem('digitzebra_offline_mode', 'true');
    } else {
      localStorage.removeItem('digitzebra_offline_mode');
    }
    localStorage.setItem('digitzebra_backup_online_enabled', backupOnlineEnabled === true ? 'true' : backupOnlineEnabled === false ? 'false' : '');
    withBiz.backupOnlineEnabled = backupOnlineEnabled;

    if (isAlwaysAdmin(email)) {
      withBiz.features = { ...withBiz.features, ...ALL_FEATURES_ON };
    }
    return withBiz;
  }, []);

  // Re-derive config when business switches (without a Firestore round-trip)
  useEffect(() => {
    if (!firestoreDataRef.current) return;
    const email = currentUser?.email || resolvedOwnerEmailRef.current || null;
    if (!email) return;
    setConfig(buildConfig(firestoreDataRef.current, currentBizId, email, bizAppConfigRef.current));
  }, [currentBizId]); // eslint-disable-line

  // Resolved owner email for staff/admin sessions (populated async when ownerEmail missing from session)
  const resolvedOwnerEmailRef = useRef(null);
  const [resolvedOwnerEmail, setResolvedOwnerEmail] = useState(null);

  // When a staff session has no ownerEmail, look it up via ownerUid → userConfig
  useEffect(() => {
    if (!staffSession) { setResolvedOwnerEmail(null); resolvedOwnerEmailRef.current = null; return; }
    if (staffSession.ownerEmail) {
      resolvedOwnerEmailRef.current = staffSession.ownerEmail;
      setResolvedOwnerEmail(staffSession.ownerEmail);
      return;
    }
    // ownerEmail missing — resolve via uid query on userConfig collection
    if (!staffSession.ownerUid) { setResolvedOwnerEmail(null); return; }
    getDocs(query(collection(firestore, 'userConfig'), where('uid', '==', staffSession.ownerUid)))
      .then(snap => {
        if (!snap.empty) {
          const email = snap.docs[0].id; // userConfig doc ID is the email
          resolvedOwnerEmailRef.current = email;
          setResolvedOwnerEmail(email);
        }
      })
      .catch(() => {});
  }, [staffSession]);

  useEffect(() => {
    // Determine which email to use for loading config
    const email = currentUser?.email || resolvedOwnerEmail || null;

    if (!email) {
      if (staffSession && !resolvedOwnerEmail) return undefined; // still resolving
      setConfig(defaultConfig);
      setPaymentStatus({ reminderEnabled: false, frozen: false });
      return undefined;
    }

    setLoading(true);
    const ref = doc(firestore, 'userConfig', email);

    const unsubscribe = onSnapshot(
      ref,
      async (snapshot) => {
        const data = snapshot.data() || {};
        firestoreDataRef.current = data;
        const bizId = localStorage.getItem('digitzebra_currentBusinessId') || null;
        setCurrentBizId(bizId);

        // Super-admin-controlled Payment Reminder / Freeze — top-level fields
        // on this same userConfig/{email} doc (sibling to allowed/isAdmin),
        // read live via this same onSnapshot so Freeze can lock an already-
        // open session without waiting for a reload. Never applies to the
        // always-admin super-admin account itself (would be a lockout bug —
        // that's the account that controls these toggles for everyone else).
        setPaymentStatus(isAlwaysAdmin(email) ? { reminderEnabled: false, frozen: false } : {
          reminderEnabled: !!data.paymentReminderEnabled,
          frozen: !!data.freezeAccount,
        });

        // For staff/admin sessions, also load biz-level config they saved to
        // businesses/{firestoreBizId}/appConfig/settings — must use the Firestore
        // doc id (staffSession.businessId, e.g. "biz_abc_2"), not the local
        // allBusinessData key (bizId, e.g. "2") used elsewhere in this file.
        const firestoreBizId = staffSession?.businessId || null;
        if (staffSession && firestoreBizId) {
          try {
            const bizCfgSnap = await getDoc(doc(firestore, 'businesses', firestoreBizId, 'appConfig', 'settings'));
            bizAppConfigRef.current = bizCfgSnap.exists() ? bizCfgSnap.data() : {};
          } catch (_) {
            bizAppConfigRef.current = {};
          }
        }

        const built = buildConfig(data, bizId, email, bizAppConfigRef.current);

        // For staff sessions: apply feature restrictions on top
        if (staffSession) {
          const staffFeatures = staffSession.features && typeof staffSession.features === 'object'
            ? staffSession.features : {};
          // Admin role gets full owner config; staff role gets feature-restricted view
          if (staffSession.role === 'admin') {
            setConfig(built);
          } else {
            const restrictedFeatures = { ...built.features };
            const hasExplicitGrants = Object.values(staffFeatures).some(v => v === true);
            if (hasExplicitGrants) {
              for (const key of Object.keys(restrictedFeatures)) {
                if (!STAFF_GRANTABLE_KEYS.has(key)) continue;
                if (staffFeatures[key] !== true) restrictedFeatures[key] = false;
              }
            } else {
              for (const key of Object.keys(restrictedFeatures)) {
                if (!STAFF_GRANTABLE_KEYS.has(key)) continue;
                if (staffFeatures[key] === false) restrictedFeatures[key] = false;
              }
            }
            setConfig({ ...built, features: restrictedFeatures });
          }
        } else {
          setConfig(built);
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error loading user config:', error);
        if (staffSession) {
          const staffFeatures = staffSession.features && typeof staffSession.features === 'object'
            ? staffSession.features : {};
          setConfig(deepMerge(JSON.parse(JSON.stringify(defaultConfig)), { features: staffFeatures }));
        } else {
          setConfig(defaultConfig);
        }
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser, staffSession, resolvedOwnerEmail, buildConfig]);

  const saveConfig = useCallback(
    async (newConfig) => {
      const cleanConfig = deepMerge(JSON.parse(JSON.stringify(defaultConfig)), newConfig || {});
      const bizId = localStorage.getItem('digitzebra_currentBusinessId') || null;

      // Staff/admin sessions (no Firebase Auth) — save all settings to
      // businesses/{firestoreBizId}/appConfig/settings. Must use the Firestore
      // doc id (staffSession.businessId, e.g. "biz_abc_2") — bizId above is the
      // local allBusinessData key (e.g. "2") and is NOT a valid businesses/ doc id.
      if (staffSession) {
        const firestoreBizId = staffSession.businessId || null;
        if (!firestoreBizId) { console.error('[saveConfig] no businessId on staff session'); return; }
        const bizLevelConfig = {};
        for (const key of Object.keys(cleanConfig)) {
          if (!USER_LEVEL_KEYS.has(key)) {
            bizLevelConfig[key] = cleanConfig[key];
          }
        }
        bizAppConfigRef.current = { ...bizAppConfigRef.current, ...bizLevelConfig };
        try {
          await setDoc(
            doc(firestore, 'businesses', firestoreBizId, 'appConfig', 'settings'),
            stripUndefined(bizLevelConfig),
            { merge: true }
          );
        } catch (err) {
          console.error('[saveConfig] setDoc failed for staff session:', err, 'businessId:', firestoreBizId);
          throw err;
        }
        // Re-apply so UI reflects immediately
        const built = buildConfig(firestoreDataRef.current || {}, bizId, resolvedOwnerEmailRef.current, bizAppConfigRef.current);
        setConfig(built);
        return;
      }

      // Normal Google-auth session — save to userConfig/{email}
      const email = currentUser?.email || null;
      if (!email) return;
      const ref = doc(firestore, 'userConfig', email);

      // Separate user-level keys from business-specific keys
      const userLevelConfig = {};
      const bizLevelConfig = {};
      for (const key of Object.keys(cleanConfig)) {
        if (USER_LEVEL_KEYS.has(key)) {
          userLevelConfig[key] = cleanConfig[key];
        } else {
          bizLevelConfig[key] = cleanConfig[key];
        }
      }

      const payload = {
        email,
        config: { ...(firestoreDataRef.current?.config || {}), ...userLevelConfig },
      };
      if (bizId) {
        payload[`config_${bizId}`] = {
          ...(firestoreDataRef.current?.[`config_${bizId}`] || {}),
          ...bizLevelConfig,
        };
      } else {
        payload.config = cleanConfig;
      }

      try {
        await setDoc(ref, stripUndefined(payload), { merge: true });
      } catch (err) {
        console.error('[saveConfig] setDoc failed for Google session:', err, 'email:', email);
        throw err;
      }
    },
    [currentUser, staffSession, buildConfig]
  );

  return (
    <ConfigContext.Provider value={{ config, loading, saveConfig, paymentStatus }}>
      {children}
    </ConfigContext.Provider>
  );
};

export const useConfig = () => useContext(ConfigContext);