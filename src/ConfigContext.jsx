import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { firestore } from './db';
import { doc, onSnapshot, setDoc, updateDoc, FieldPath, collection, query, where, getDocs } from 'firebase/firestore';
import { useAuth } from './AuthContext';
import { isAlwaysAdmin } from './alwaysAdmin';
import { STAFF_FEATURE_KEYS } from './staffPermissions';

const ConfigContext = createContext();

const defaultConfig = {
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
    // Multiple simultaneous tabs for Sales/Purchases and POS (Settings →
    // Features → Sales & POS options). Off = one tab per section.
    multiTabSales: true,
    multiTabPOS: true,
    multiTabEstimates: true,
    // Compact stock/price/margin line under each Sales/Purchases item row.
    itemRowSummary: true,
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
    // Off by default — when on, saving a Sales/POS invoice whose item row
    // price differs from that item's own master salePrice silently updates
    // the item master to match (so the next bill picks up the latest price).
    // If the row price was left equal to the master (unchanged), nothing is
    // written back. Purchase price has its own independent flag below.
    autoUpdateSalePrice: false,
    // Off by default — same behavior as autoUpdateSalePrice, but for
    // purchasePrice, driven by Purchases invoice rows.
    autoUpdatePurchasePrice: false,
  },
  multiBusiness: true,
  maxBusinesses: 0,
  // User-customized sidebar nav order — array of path strings. Items not
  // listed here keep their default position (appended in original order).
  sidebarOrder: [],
  useIndexedDB: true,
  theme: {
    primaryColor: '#5c1f22',
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
    autoPrintAfterPurchase: false,
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
    themeColor: '#5c1f22',
    termsText: '',
    estimateTermsText: '',
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
    // Arrays are replaced wholesale, never merged index-by-index — merging a
    // shorter saved list (e.g. after deleting a category) over a longer default
    // would leave the default's trailing items behind.
    if (source[key] instanceof Object && !Array.isArray(source[key]) && key in target && target[key] instanceof Object && !Array.isArray(target[key])) {
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
// Defaults for business settings that have no entry in defaultConfig.
const RESET_FALLBACKS = {
  itemCategories: { product: [], service: [], membership: [] },
};

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
const STAFF_GRANTABLE_KEYS = new Set(STAFF_FEATURE_KEYS);

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

// Firestore `businesses/{id}` doc id for a LOCAL business key ("1", "2", …).
// Business "1" uses the legacy `biz_${uid}` id, every later business
// `biz_${uid}_${key}` (see businessCode.js). A staff/admin session knows its own
// business's exact doc id, so that wins when the keys match.
const bizDocIdFor = (localKey, ownerUid, staffSession) => {
  if (staffSession?.businessId && localKey != null
    && String(staffSession.localBusinessId ?? '') === String(localKey)) return staffSession.businessId;
  if (!localKey || !ownerUid) return staffSession?.businessId || null;
  return String(localKey) === '1' ? `biz_${ownerUid}` : `biz_${ownerUid}_${localKey}`;
};

// Fired (same tab) whenever the current business key in localStorage changes —
// the `storage` event only reaches OTHER tabs.
const BIZ_CHANGE_EVENT = 'app-business-changed';
const BIZ_STORAGE_KEY = 'tallykraft_currentBusinessId';
const NO_APP_CFG = {};

export const ConfigProvider = ({ children }) => {
  const { currentUser, staffSession } = useAuth();
  // Current LOCAL business key. BusinessContext/DataContext are children of
  // this provider, so it's read from localStorage and kept fresh via events.
  const [currentBizId, setCurrentBizId] = useState(
    () => localStorage.getItem(BIZ_STORAGE_KEY) || null
  );
  // Raw userConfig/{ownerEmail} doc, tagged with the email it belongs to so a
  // stale doc from a previous login is never used. The ref mirrors it for
  // saveConfig (which merges into the latest copy).
  const [owner, setOwner] = useState({ email: null, data: null, error: false });
  const firestoreDataRef = React.useRef(null);
  // Business-level settings saved from a business-code (staff/admin) login,
  // which has no Firebase Auth and so can't write userConfig — they live at
  // businesses/{bizDocId}/appConfig/settings. Loaded live for EVERY session
  // (owner and staff) so both see the same, newest settings.
  const [appCfg, setAppCfg] = useState({ id: null, data: NO_APP_CFG });

  useEffect(() => {
    const sync = () => {
      const id = localStorage.getItem(BIZ_STORAGE_KEY) || null;
      setCurrentBizId(prev => (prev !== id ? id : prev));
    };
    const onStorage = (e) => { if (e.key === BIZ_STORAGE_KEY) sync(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', sync);
    window.addEventListener(BIZ_CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', sync);
      window.removeEventListener(BIZ_CHANGE_EVENT, sync);
    };
  }, []);

  // Build merged config from raw Firestore data + current business override
  const buildConfig = useCallback((data, bizId, email, extraBizCfg) => {
    const userCfg = data?.config || {};
    const bizCfg = bizId ? (data?.[`config_${bizId}`] || {}) : {};

    const merged = deepMerge(JSON.parse(JSON.stringify(defaultConfig)), userCfg);
    if (Array.isArray(userCfg.customSections)) merged.customSections = userCfg.customSections;

    // Owner-saved business settings (invoice, barcode, loyalty, features…)
    let withBiz = applyBusinessOverride(merged, bizCfg);
    // Newest business-level copy of `features` (owner or business-code save).
    let bizFeaturesAt = bizCfg.features ? (Number(bizCfg._savedAt) || 0) : -1;
    // Settings saved from a business-code login. Newest save wins: this layer
    // used to be applied unconditionally on top, so one old save from a staff/
    // admin login froze those settings forever — any later change made in the
    // owner account (terms, GST column, …) never reached the staff login.
    // Both writers now stamp `_savedAt`; unstamped legacy data only applies
    // while the owner's copy is unstamped too (same result as before).
    if (extraBizCfg && Object.keys(extraBizCfg).length > 0) {
      const ownerAt = Number(bizCfg._savedAt) || 0;
      const extraAt = Number(extraBizCfg._savedAt) || 0;
      if (extraAt ? extraAt >= ownerAt : !ownerAt) {
        withBiz = applyBusinessOverride(withBiz, extraBizCfg);
        if (extraBizCfg.features) bizFeaturesAt = Math.max(bizFeaturesAt, extraAt);
      }
    }
    delete withBiz._savedAt;

    // Super-admin feature toggles (Admin → Users → Features) are written to
    // the account-level `config.features` with `adminFeaturesAt`. Every
    // business keeps its own `features` copy once the owner saves any
    // setting, and that copy used to always win — so admin changes silently
    // never reached those customers. Admin's toggles now win over any
    // business copy saved BEFORE the admin change; a later Settings save by
    // the user (which carries the admin values forward) wins after that.
    const adminAt = Number(data?.adminFeaturesAt) || 0;
    if (adminAt && userCfg.features && typeof userCfg.features === 'object' && adminAt > bizFeaturesAt) {
      withBiz.features = { ...withBiz.features, ...userCfg.features };
    }
    delete withBiz._savedAt;

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
      localStorage.setItem('tallykraft_offline_mode', 'true');
    } else {
      localStorage.removeItem('tallykraft_offline_mode');
    }
    localStorage.setItem('tallykraft_backup_online_enabled', backupOnlineEnabled === true ? 'true' : backupOnlineEnabled === false ? 'false' : '');
    withBiz.backupOnlineEnabled = backupOnlineEnabled;

    if (isAlwaysAdmin(email)) {
      withBiz.features = { ...withBiz.features, ...ALL_FEATURES_ON };
    }
    return withBiz;
  }, []);

  // Staff permission restrictions. Applied on EVERY rebuild — previously only
  // the initial load applied them, so switching business or saving a setting
  // from a staff login silently handed back the owner's unrestricted features.
  const finalizeForSession = useCallback((built) => {
    if (!staffSession || staffSession.role === 'admin') return built;
    const staffFeatures = staffSession.features && typeof staffSession.features === 'object'
      ? staffSession.features : {};
    const restrictedFeatures = { ...built.features };
    // `ownBillsOnly` is a restriction, not a grant — ignore it here.
    const hasExplicitGrants = Object.entries(staffFeatures).some(([k, v]) => v === true && k !== 'ownBillsOnly');
    for (const key of Object.keys(restrictedFeatures)) {
      if (!STAFF_GRANTABLE_KEYS.has(key)) continue;
      if (hasExplicitGrants ? staffFeatures[key] !== true : staffFeatures[key] === false) {
        restrictedFeatures[key] = false;
      }
    }
    return { ...built, features: restrictedFeatures };
  }, [staffSession]);

  // Owner email for staff/admin sessions. Normally on the session itself;
  // older sessions without it look it up once via ownerUid → userConfig.
  const [lookedUpEmail, setLookedUpEmail] = useState({ uid: null, email: null });
  useEffect(() => {
    if (!staffSession || staffSession.ownerEmail || !staffSession.ownerUid) return;
    const uid = staffSession.ownerUid;
    getDocs(query(collection(firestore, 'userConfig'), where('uid', '==', uid)))
      .then(snap => {
        // userConfig doc ID is the email
        if (!snap.empty) setLookedUpEmail({ uid, email: snap.docs[0].id });
      })
      .catch(() => {});
  }, [staffSession]);
  const resolvedOwnerEmail = staffSession
    ? (staffSession.ownerEmail || (lookedUpEmail.uid === staffSession.ownerUid ? lookedUpEmail.email : null))
    : null;
  const email = currentUser?.email || resolvedOwnerEmail || null;

  const ownerUid = currentUser?.uid || staffSession?.ownerUid || null;
  const firestoreBizId = bizDocIdFor(currentBizId, ownerUid, staffSession);

  // Live business-code settings for the CURRENT business (re-subscribes on
  // business switch — it used to keep the first business's copy forever).
  useEffect(() => {
    if (!firestoreBizId) return undefined;
    const unsub = onSnapshot(
      doc(firestore, 'businesses', firestoreBizId, 'appConfig', 'settings'),
      (snap) => setAppCfg({ id: firestoreBizId, data: snap.exists() ? (snap.data() || {}) : {} }),
      () => setAppCfg({ id: firestoreBizId, data: {} }),
    );
    return () => unsub();
  }, [firestoreBizId]);
  const bizAppConfig = appCfg.id === firestoreBizId ? appCfg.data : NO_APP_CFG;

  useEffect(() => {
    if (!email) { firestoreDataRef.current = null; return undefined; }
    const unsubscribe = onSnapshot(
      doc(firestore, 'userConfig', email),
      (snapshot) => {
        const data = snapshot.data() || {};
        firestoreDataRef.current = data;
        // Pick up the business key DataContext may have just written.
        const bizId = localStorage.getItem(BIZ_STORAGE_KEY) || null;
        setCurrentBizId(prev => (prev !== bizId ? bizId : prev));
        setOwner({ email, data, error: false });
      },
      (error) => {
        console.error('Error loading user config:', error);
        setOwner({ email, data: null, error: true });
      }
    );
    return () => unsubscribe();
  }, [email]);

  const ownerData = owner.email === email ? owner.data : null;
  const ownerError = owner.email === email && owner.error;
  const loading = !!email && !ownerData && !ownerError;

  // Super-admin-controlled Payment Reminder / Freeze — top-level fields on the
  // same userConfig/{email} doc, read live so Freeze can lock an already-open
  // session. Never applies to the always-admin super-admin account itself.
  const paymentStatus = useMemo(() => (
    !ownerData || isAlwaysAdmin(email)
      ? { reminderEnabled: false, frozen: false }
      : { reminderEnabled: !!ownerData.paymentReminderEnabled, frozen: !!ownerData.freezeAccount }
  ), [ownerData, email]);

  // The one place config is built — owner data, current business,
  // business-code settings and staff restrictions all flow through here.
  const config = useMemo(() => {
    if (ownerError) {
      if (!staffSession) return defaultConfig;
      const staffFeatures = staffSession.features && typeof staffSession.features === 'object'
        ? staffSession.features : {};
      return deepMerge(JSON.parse(JSON.stringify(defaultConfig)), { features: staffFeatures });
    }
    if (!email || !ownerData) return defaultConfig;
    return finalizeForSession(buildConfig(ownerData, currentBizId, email, bizAppConfig));
  }, [ownerError, staffSession, email, ownerData, currentBizId, bizAppConfig, finalizeForSession, buildConfig]);

  const saveConfig = useCallback(
    async (newConfig) => {
      const cleanConfig = deepMerge(JSON.parse(JSON.stringify(defaultConfig)), newConfig || {});
      const bizId = localStorage.getItem(BIZ_STORAGE_KEY) || null;
      const savedAt = Date.now();

      // Staff/admin sessions (no Firebase Auth) — save business settings to
      // businesses/{bizDocId}/appConfig/settings for the CURRENT business.
      if (staffSession) {
        const targetBizDocId = bizDocIdFor(bizId, staffSession.ownerUid, staffSession);
        if (!targetBizDocId) { console.error('[saveConfig] no businessId on staff session'); return; }
        const bizLevelConfig = { _savedAt: savedAt };
        for (const key of Object.keys(cleanConfig)) {
          if (!USER_LEVEL_KEYS.has(key)) {
            bizLevelConfig[key] = cleanConfig[key];
          }
        }
        // A regular staff login's `features` is ITS OWN permission-restricted
        // view, not the business's module switches. Saving it would turn
        // modules off for everyone (e.g. when a staff member adds an item
        // category). Only owners / business-code admins may change modules.
        if (staffSession.role !== 'admin') delete bizLevelConfig.features;
        try {
          await setDoc(
            doc(firestore, 'businesses', targetBizDocId, 'appConfig', 'settings'),
            stripUndefined(bizLevelConfig),
            { merge: true }
          );
        } catch (err) {
          console.error('[saveConfig] setDoc failed for staff session:', err, 'businessId:', targetBizDocId);
          throw err;
        }
        // Reflect immediately (the live listener will confirm it).
        setAppCfg(prev => ({ id: targetBizDocId, data: { ...(prev.id === targetBizDocId ? prev.data : {}), ...bizLevelConfig } }));
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
          // Newer than any earlier business-code save → wins for every login.
          _savedAt: savedAt,
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
    [currentUser, staffSession]
  );

  // Reset some business-level settings back to their defaults for the CURRENT
  // business only (Settings → Data → Delete Data). Each key is REPLACED, not
  // merged (setDoc merge would keep stale nested fields), and stamped newer
  // so it wins over any older copy from the other login type.
  const resetConfigKeys = useCallback(
    async (keys = []) => {
      const list = keys.filter(k => !USER_LEVEL_KEYS.has(k));
      if (!list.length) return;
      const bizId = localStorage.getItem(BIZ_STORAGE_KEY) || null;
      const savedAt = Date.now();
      const defaultFor = (k) => (k in defaultConfig
        ? JSON.parse(JSON.stringify(defaultConfig[k]))
        : (RESET_FALLBACKS[k] ?? null));

      let ref; let prefix = [];
      if (staffSession) {
        const bizDocId = bizDocIdFor(bizId, staffSession.ownerUid, staffSession);
        if (!bizDocId) throw new Error('No business selected');
        ref = doc(firestore, 'businesses', bizDocId, 'appConfig', 'settings');
        await setDoc(ref, { _savedAt: savedAt }, { merge: true });
      } else {
        const email = currentUser?.email;
        if (!email || !bizId) throw new Error('No business selected');
        ref = doc(firestore, 'userConfig', email);
        prefix = [`config_${bizId}`];
        await setDoc(ref, { [`config_${bizId}`]: { _savedAt: savedAt } }, { merge: true });
      }
      const args = [];
      list.forEach((k) => { args.push(new FieldPath(...prefix, k), stripUndefined(defaultFor(k))); });
      await updateDoc(ref, ...args);
    },
    [currentUser, staffSession]
  );

  return (
    <ConfigContext.Provider value={{ config, loading, saveConfig, resetConfigKeys, paymentStatus }}>
      {children}
    </ConfigContext.Provider>
  );
};

export const useConfig = () => useContext(ConfigContext);