import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { firestore } from './db';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { useAuth } from './AuthContext';
import { setBusinessActive, setBusinessPro, setAllBusinessesActive, notifyProStateChange } from './activeBusinessState';
import { SOLO_PLANS, PRO_PLANS } from './planTiers';

const SubscriptionContext = createContext();
const TRIAL_DAYS = 3;

// ── Per-business state computation ──────────────────────────────────────────

const computeState = (bizSub) => {
  if (!bizSub) return 'none';
  if (bizSub.plan === 'admin_granted') return bizSub.status === 'active' ? 'admin_granted' : 'none';
  const active =
    bizSub.status === 'active' && (!bizSub.endDate || new Date(bizSub.endDate) > new Date());
  if (bizSub.plan === 'trial') return active ? 'trial' : 'trial_expired';
  if (SOLO_PLANS.includes(bizSub.plan) || PRO_PLANS.includes(bizSub.plan))
    return active ? 'subscribed' : 'expired';
  return 'none';
};

const computeDaysLeft = (bizSub) => {
  if (!bizSub?.endDate || bizSub.plan === 'admin_granted') return null;
  const diff = new Date(bizSub.endDate) - new Date();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
};

/**
 * Parse subscription Firestore doc into a per-business map.
 * Handles legacy flat structure (old per-user docs) by treating them as business "1".
 */
const parseBizSubs = (data) => {
  if (!data) return {};
  if (data.businesses && typeof data.businesses === 'object') return data.businesses;
  // Legacy flat doc: { plan, status, endDate, ... } → treat as business "1"
  if (data.plan) {
    return {
      '1': {
        plan: data.plan,
        status: data.status,
        endDate: data.endDate || null,
        startDate: data.startDate || null,
      },
    };
  }
  return {};
};

// ── Provider ─────────────────────────────────────────────────────────────────

export const SubscriptionProvider = ({ children }) => {
  const { currentUser, isAdmin, staffSession, isAuthorized } = useAuth();
  const [subDoc, setSubDoc] = useState(null);
  const [subLoading, setSubLoading] = useState(true);
  const unsubRef = useRef(null);

  useEffect(() => {
    if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }

    if (isAdmin || staffSession) {
      setSubDoc({ adminGrantedAll: true });
      setAllBusinessesActive(true);
      setSubLoading(false);
      return;
    }

    if (!currentUser?.email || !isAuthorized) {
      setSubDoc(null);
      setAllBusinessesActive(false);
      setSubLoading(false);
      return;
    }

    const ref = doc(firestore, 'subscriptions', currentUser.email);
    let mounted = true;

    unsubRef.current = onSnapshot(
      ref,
      (snap) => {
        if (!mounted) return;
        const data = snap.exists() ? snap.data() : null;
        setSubDoc(data);
        setSubLoading(false);
      },
      () => { if (mounted) setSubLoading(false); }
    );

    return () => {
      mounted = false;
      if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
    };
  }, [currentUser?.email, isAdmin, staffSession, isAuthorized]);

  // ── Derived state ────────────────────────────────────────────────────────

  const adminGrantedAll = !!(subDoc?.adminGrantedAll);
  const businessSubs = parseBizSubs(subDoc); // { [bId]: { plan, status, ... } }

  const getBusinessState = useCallback(
    (bId) => {
      if (adminGrantedAll) return 'admin_granted';
      return computeState(businessSubs[String(bId)]);
    },
    [adminGrantedAll, businessSubs]
  );

  const isBusinessActive = useCallback(
    (bId) => ['trial', 'subscribed', 'admin_granted'].includes(getBusinessState(bId)),
    [getBusinessState]
  );

  // True when the business is on a Pro (cloud sync) plan or admin-granted
  const isBusinessProPlan = useCallback(
    (bId) => {
      if (adminGrantedAll) return true;
      const plan = businessSubs[String(bId)]?.plan;
      return PRO_PLANS.includes(plan);
    },
    [adminGrantedAll, businessSubs]
  );

  // Raw plan id for a business (e.g. 'monthly', 'yearly_pro', 'trial') or null.
  const getBusinessPlan = useCallback(
    (bId) => {
      if (adminGrantedAll) return 'admin_granted';
      return businessSubs[String(bId)]?.plan || null;
    },
    [adminGrantedAll, businessSubs]
  );

  const daysLeftForBusiness = useCallback(
    (bId) => {
      if (adminGrantedAll) return null;
      return computeDaysLeft(businessSubs[String(bId)]);
    },
    [adminGrantedAll, businessSubs]
  );

  // Has the user started any subscription at all (even expired)?
  // Used in App.jsx to decide whether to show the full-screen welcome.
  const hasAnySubscription = adminGrantedAll || Object.keys(businessSubs).length > 0;

  // Sync the lightweight activeBusinessState module so DataContext can check
  useEffect(() => {
    if (adminGrantedAll) {
      setAllBusinessesActive(true);
    } else {
      setAllBusinessesActive(false);
      Object.keys(businessSubs).forEach((bId) => {
        setBusinessActive(bId, isBusinessActive(bId));
        setBusinessPro(bId, isBusinessProPlan(bId));
      });
    }
    // Let DataContext know plan state is ready so it can pull Pro businesses
    // from the cloud (the initial data load may have run before this resolved).
    if (!subLoading) notifyProStateChange();
  }, [adminGrantedAll, businessSubs, isBusinessActive, isBusinessProPlan, subLoading]);

  // ── Write operations ─────────────────────────────────────────────────────

  const startTrial = useCallback(
    async (businessId = '1') => {
      if (!currentUser?.email) return;
      const bId = String(businessId);
      const now = new Date();
      const endDate = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
      await setDoc(
        doc(firestore, 'subscriptions', currentUser.email),
        {
          email: currentUser.email,
          businesses: {
            ...businessSubs,
            [bId]: {
              plan: 'trial',
              status: 'active',
              startDate: now.toISOString(),
              endDate: endDate.toISOString(),
              createdAt: now.toISOString(),
            },
          },
        },
        { merge: true }
      );
    },
    [currentUser?.email, businessSubs]
  );

  const activateSubscription = useCallback(
    async (businessId, plan, paymentId, billingMeta = null) => {
      if (!currentUser?.email) return;
      const bId = String(businessId);
      const now = new Date();
      const endDate = new Date(now);
      if (plan === 'yearly' || plan === 'yearly_pro') endDate.setFullYear(endDate.getFullYear() + 1);
      else endDate.setMonth(endDate.getMonth() + 1);

      // Build a payment/receipt record. Appended to a per-business history so the
      // customer can download GST receipts from Settings → Billing & Payments.
      const existing = businessSubs[bId] || {};
      const prevPayments = Array.isArray(existing.payments) ? existing.payments : [];
      const seq = prevPayments.length + 1;
      const invoiceNo = billingMeta?.invoicePrefix
        ? `${billingMeta.invoicePrefix}-${bId}-${now.getFullYear()}-${String(seq).padStart(4, '0')}`
        : `SUB-${bId}-${String(seq).padStart(4, '0')}`;
      const paymentRecord = {
        invoiceNo,
        date: now.toISOString(),
        plan,
        paymentId: paymentId || null,
        ...(billingMeta || {}),
      };

      await setDoc(
        doc(firestore, 'subscriptions', currentUser.email),
        {
          email: currentUser.email,
          businesses: {
            ...businessSubs,
            [bId]: {
              ...existing,
              plan,
              status: 'active',
              startDate: now.toISOString(),
              endDate: endDate.toISOString(),
              razorpayPaymentId: paymentId,
              activatedAt: now.toISOString(),
              lastBilling: billingMeta || existing.lastBilling || null,
              payments: [...prevPayments, paymentRecord],
            },
          },
        },
        { merge: true }
      );
    },
    [currentUser?.email, businessSubs]
  );

  return (
    <SubscriptionContext.Provider
      value={{
        subDoc,
        subLoading,
        businessSubs,
        adminGrantedAll,
        getBusinessState,
        isBusinessActive,
        isBusinessProPlan,
        getBusinessPlan,
        hasAnySubscription,
        daysLeftForBusiness,
        startTrial,
        activateSubscription,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = () => useContext(SubscriptionContext);
