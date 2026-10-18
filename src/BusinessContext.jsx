import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useData } from './DataContext';
import { useSubscription } from './SubscriptionContext';
import { useAuth } from './AuthContext';

const BusinessContext = createContext();

export const BusinessProvider = ({ children }) => {
  const { allBusinessData, loading, updateCurrentBusinessId } = useData();
  const { businessSubs, adminGrantedAll, subLoading } = useSubscription();
  const { staffSession } = useAuth();
  const [currentBusinessId, setCurrentBusinessId] = useState(() => {
    return localStorage.getItem('tallykraft_currentBusinessId') || '1';
  });

  // Extract every business stored locally, carrying the Firestore doc key (_key).
  // id is normalised to _key (the Firestore doc ID) so every component that
  // saves/filters by currentBusiness.id uses the same key as DataContext.
  const allBusinesses = useMemo(() => Object.entries(allBusinessData).map(([key, b]) => ({
    _key: key,
    id: key,
    name: b.name,
    gstNumber: b.gstNumber,
    address: b.address,
    phone: b.phone,
    email: b.email,
    state: b.state,
    logo: b.logo || '',
    qrCode: b.qrCode || '',
    fyStartMonth: b.fyStartMonth ?? 3,
    needsSetup: b.needsSetup ?? false,
    openingCash: b.openingCash ?? 0,
    openingBank: b.openingBank ?? 0,
    bankName: b.bankName || '',
    bankAccount: b.bankAccount || '',
    ifscCode: b.ifscCode || '',
    accountHolder: b.accountHolder || '',
    upiId: b.upiId || '',
    upiNumber: b.upiNumber || '',
    firestoreBizDocId: b.firestoreBizDocId || null,
  })), [allBusinessData]);

  // ── Verify businesses against the subscriptions database ────────────────────
  // Only businesses that have a subscription record (any state: active, trial,
  // expired, or admin-granted) are shown. "Ghost" businesses with no record are
  // hidden from the list (their local data is kept, not deleted). Admins bypass
  // the filter, and we show everything until subscription data has loaded so a
  // valid business never flickers out.
  const businesses = useMemo(() => {
    // Business-code / staff logins (no Firebase Auth) are scoped to the single
    // business they logged into — never expose the rest of the owner account's
    // businesses, even though allBusinessData holds the full blob locally.
    if (staffSession) {
      const sessionKey = staffSession.localBusinessId != null ? String(staffSession.localBusinessId) : null;
      const own = allBusinesses.find(b => String(b._key) === sessionKey);
      if (own) return [own];
      return allBusinesses.length > 0 ? [allBusinesses[0]] : [];
    }
    if (adminGrantedAll || subLoading) return allBusinesses;
    const verified = allBusinesses.filter(b =>
      Object.prototype.hasOwnProperty.call(businessSubs || {}, String(b.id)));
    // Safety net: never lock the user out with an empty switcher — if nothing
    // matched but they do have local businesses, keep the selected one visible.
    if (verified.length === 0 && allBusinesses.length > 0) {
      const fallback = allBusinesses.find(b => String(b._key) === String(currentBusinessId));
      return fallback ? [fallback] : [allBusinesses[0]];
    }
    return verified;
  }, [allBusinesses, businessSubs, adminGrantedAll, subLoading, currentBusinessId, staffSession]);

  const currentBusiness = businesses.find(b => String(b._key) === String(currentBusinessId)) || businesses[0];

  useEffect(() => {
    if (currentBusiness && !loading) {
      const key = currentBusiness._key;
      setCurrentBusinessId(key);
      localStorage.setItem('tallykraft_currentBusinessId', key); window.dispatchEvent(new Event('app-business-changed'));
      if (updateCurrentBusinessId) {
        updateCurrentBusinessId(key);
      }
    }
  }, [currentBusiness?._key, loading, updateCurrentBusinessId]);

  const switchBusiness = (id) => {
    setCurrentBusinessId(id);
    localStorage.setItem('tallykraft_currentBusinessId', id); window.dispatchEvent(new Event('app-business-changed'));
    if (updateCurrentBusinessId) {
      updateCurrentBusinessId(id);
    }
  };

  return (
    <BusinessContext.Provider value={{ currentBusiness, businesses, switchBusiness, setCurrentBusinessId }}>
      {children}
    </BusinessContext.Provider>
  );
};

export const useBusiness = () => useContext(BusinessContext);
