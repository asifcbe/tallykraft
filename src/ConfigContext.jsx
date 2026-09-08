import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { firestore } from './db';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
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
    journal: false,
    barcode: true,
    ledger: true,
    cash: true,
    calculator: true,
    membership: false
  },
  multiBusiness: true,
  maxBusinesses: 0,
  useIndexedDB: true,
  theme: {
    primaryColor: '#1976d2',
    secondaryColor: '#dc004e'
  },
  customSections: [],
  completeOffline: false,
  defaultPaperSize: 'A4',
  expenseCategories: ['Office Supplies', 'Travel', 'Utilities', 'Rent', 'Marketing', 'Equipment', 'Miscellaneous'],
  itemUnits: ['BAG','BAL','BDL','BKL','BOU','BOX','BTL','BUN','CAN','CCM','CMS','CTN','DOZ','DRM','GGK','GMS','GRS','GYD','KGS','KLR','KME','LTR','MLT','MTR','NOS','PAC','PCS','PRS','QTL','ROL','SET','SQF','SQM','SQY','TBS','TGM','THD','TON','TUB','UGS','UNT','YDS'],
  invoiceNumberConfig: {
    salesType: 'auto',
    salesPrefix: 'INV',
    salesStartingNumber: 1,
    purchaseType: 'auto',
    purchasePrefix: 'BILL',
    purchaseStartingNumber: 1,
  },
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
  },
};

// Every feature flag set to true — used to grant a super-admin full access.
const ALL_FEATURES_ON = Object.keys(defaultConfig.features).reduce(
  (acc, key) => ({ ...acc, [key]: true }),
  {}
);

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

export const ConfigProvider = ({ children }) => {
  const { currentUser, staffSession } = useAuth();
  const [config, setConfig] = useState(defaultConfig);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Staff session: apply only the feature flags set by the owner; everything else from defaults
    if (staffSession) {
      try {
        const staffFeatures = staffSession.features && typeof staffSession.features === 'object'
          ? staffSession.features
          : {};
        const merged = deepMerge(JSON.parse(JSON.stringify(defaultConfig)), { features: staffFeatures });
        setConfig(merged);
      } catch (_) {
        setConfig(defaultConfig);
      }
      setLoading(false);
      return undefined;
    }

    if (!currentUser?.email) {
      setConfig(defaultConfig);
      return undefined;
    }

    setLoading(true);
    const ref = doc(firestore, 'userConfig', currentUser.email);

    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        const data = snapshot.data();
        const userCfg = data?.config || {};
        const merged = deepMerge(JSON.parse(JSON.stringify(defaultConfig)), userCfg);
        // deepMerge merges arrays by index — override array fields from source directly
        if (Array.isArray(userCfg.customSections)) merged.customSections = userCfg.customSections;

        // backupOnlineEnabled (admin-controlled): if explicitly false, force offline so
        // business data never reaches Firestore. Existing users without this field keep
        // their current completeOffline behaviour for backward compatibility.
        const backupOnlineEnabled = userCfg.backupOnlineEnabled; // true | false | undefined
        let forceOffline;
        if (backupOnlineEnabled === false) {
          forceOffline = true;  // admin disabled online backup
        } else if (backupOnlineEnabled === true) {
          forceOffline = !!merged.completeOffline; // respect user's own preference
        } else {
          forceOffline = !!merged.completeOffline; // not set — backward-compat behaviour
        }
        if (forceOffline) {
          localStorage.setItem('tallykraft_offline_mode', 'true');
        } else {
          localStorage.removeItem('tallykraft_offline_mode');
        }
        // Expose for components that need to read it synchronously
        localStorage.setItem('tallykraft_backup_online_enabled', backupOnlineEnabled === true ? 'true' : backupOnlineEnabled === false ? 'false' : '');
        merged.backupOnlineEnabled = backupOnlineEnabled; // pass through to consumers

        // VITE_ALWAYSADMIN super-admin: force every feature on, ignoring any
        // disabled flags in their stored config.
        if (isAlwaysAdmin(currentUser.email)) {
          merged.features = { ...merged.features, ...ALL_FEATURES_ON };
        }

        setConfig(merged);
        setLoading(false);
      },
      (error) => {
        console.error('Error loading user config:', error);
        setConfig(defaultConfig);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser, staffSession]);

  const saveConfig = useCallback(
    async (newConfig) => {
      if (!currentUser?.email) return;
      const ref = doc(firestore, 'userConfig', currentUser.email);
      const cleanConfig = deepMerge(JSON.parse(JSON.stringify(defaultConfig)), newConfig || {});
      await setDoc(
        ref,
        {
          email: currentUser.email,
          config: cleanConfig
        },
        { merge: true }
      );
    },
    [currentUser]
  );

  return (
    <ConfigContext.Provider value={{ config, loading, saveConfig }}>
      {children}
    </ConfigContext.Provider>
  );
};

export const useConfig = () => useContext(ConfigContext);