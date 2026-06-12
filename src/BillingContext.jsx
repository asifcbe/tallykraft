import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { firestore } from './db';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

// Platform-wide seller (admin) GST / billing configuration. Stored in a single
// Firestore doc: globalConfig/billing. Read by everyone (for correct pricing &
// receipts); written only from the Admin panel.
const BillingContext = createContext();

export const defaultBilling = {
  legalName: '',          // seller's registered business name
  gstin: '',              // seller's GSTIN
  sellerState: 'Tamil Nadu',
  address: '',
  email: '',
  phone: '',
  taxEnabled: true,       // collect GST at all?
  taxRate: 18,            // total GST %
  taxInclusive: false,    // true => plan prices already include GST
  invoicePrefix: 'SUB',   // receipt/invoice number prefix
};

export const BillingProvider = ({ children }) => {
  const [billing, setBilling] = useState(defaultBilling);
  const [billingLoading, setBillingLoading] = useState(true);

  useEffect(() => {
    const ref = doc(firestore, 'globalConfig', 'billing');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setBilling(snap.exists() ? { ...defaultBilling, ...snap.data() } : defaultBilling);
        setBillingLoading(false);
      },
      () => setBillingLoading(false)
    );
    return unsub;
  }, []);

  const saveBilling = useCallback(async (patch) => {
    const ref = doc(firestore, 'globalConfig', 'billing');
    await setDoc(ref, { ...patch, updatedAt: new Date().toISOString() }, { merge: true });
  }, []);

  return (
    <BillingContext.Provider value={{ billing, billingLoading, saveBilling }}>
      {children}
    </BillingContext.Provider>
  );
};

export const useBilling = () => useContext(BillingContext);
