import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useData } from './DataContext';
import { useSubscription } from './SubscriptionContext';

const BusinessContext = createContext();

export const BusinessProvider = ({ children }) => {
  const { allBusinessData, loading, updateCurrentBusinessId } = useData();
  const { businessSubs, adminGrantedAll, subLoading } = useSubscription();
  const [currentBusinessId, setCurrentBusinessId] = useState(() => {
    return Number(localStorage.getItem('currentBusinessId')) || 1;
  });

  // Extract every business stored locally.
  const allBusinesses = useMemo(() => Object.values(allBusinessData).map(b => ({
    id: b.id,
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
  })), [allBusinessData]);

  // ── Verify businesses against the subscriptions database ────────────────────
  // Only businesses that have a subscription record (any state: active, trial,
  // expired, or admin-granted) are shown. "Ghost" businesses with no record are
  // hidden from the list (their local data is kept, not deleted). Admins bypass
  // the filter, and we show everything until subscription data has loaded so a
  // valid business never flickers out.
  const businesses = useMemo(() => {
    if (adminGrantedAll || subLoading) return allBusinesses;
    const verified = allBusinesses.filter(b =>
      Object.prototype.hasOwnProperty.call(businessSubs || {}, String(b.id)));
    // Safety net: never lock the user out with an empty switcher — if nothing
    // matched but they do have local businesses, keep the selected one visible.
    if (verified.length === 0 && allBusinesses.length > 0) {
      const fallback = allBusinesses.find(b => b.id === currentBusinessId);
      return fallback ? [fallback] : [allBusinesses[0]];
    }
    return verified;
  }, [allBusinesses, businessSubs, adminGrantedAll, subLoading, currentBusinessId]);

  const currentBusiness = businesses.find(b => b.id === currentBusinessId) || businesses[0];

  useEffect(() => {
    if (currentBusiness && !loading) {
      setCurrentBusinessId(currentBusiness.id);
      localStorage.setItem('currentBusinessId', currentBusiness.id);
      if (updateCurrentBusinessId) {
        updateCurrentBusinessId(currentBusiness.id);
      }
    }
  }, [currentBusiness?.id, loading, updateCurrentBusinessId]);

  const switchBusiness = (id) => {
    setCurrentBusinessId(id);
    localStorage.setItem('currentBusinessId', id);
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
