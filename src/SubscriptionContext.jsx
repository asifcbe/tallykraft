import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { firestore } from './db';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { useAuth } from './AuthContext';
import { setBusinessActive, setBusinessPro, setAllBusinessesActive, notifyProStateChange } from './activeBusinessState';
import { SOLO_PLANS, PRO_PLANS, TRIAL_DAYS, PLAN_DAYS, PLAN_ID, PLAN_PRICE, addDays } from './planTiers';

const SubscriptionContext = createContext();

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

  // Re-evaluate once a minute so a trial / paid period that ends while the app
  // is open locks the business without needing a reload (state is derived
  // from endDate vs now, and the Firestore doc itself doesn't change).
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // ── Derived state ────────────────────────────────────────────────────────

  const adminGrantedAll = !!(subDoc?.adminGrantedAll);
  const businessSubs = parseBizSubs(subDoc); // { [bId]: { plan, status, ... } }

  const getBusinessState = useCallback(
    (bId) => {
      if (adminGrantedAll) return 'admin_granted';
      return computeState(businessSubs[String(bId)]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick re-derives time-based state
    [adminGrantedAll, businessSubs, tick]
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick re-derives time-based state
    [adminGrantedAll, businessSubs, tick]
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
      // One free trial per business — never restart it over an existing record.
      if (businessSubs[bId]) return;
      const now = new Date();
      const endDate = addDays(now, TRIAL_DAYS);
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
              // Kept permanently (activateSubscription doesn't touch them) so the
              // Admin panel can show trial history after the business converts.
              trialStartDate: now.toISOString(),
              trialEndDate: endDate.toISOString(),
              trialDays: TRIAL_DAYS,
            },
          },
          trialUsed: true,
          firstTrialAt: now.toISOString(),
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
      const existing = businessSubs[bId] || {};
      // Every payment buys PLAN_DAYS (30) days. Paying while still active (trial
      // or paid) stacks onto the remaining time instead of discarding it.
      const currentEnd = existing.endDate && existing.status === 'active' ? new Date(existing.endDate) : null;
      const periodStart = currentEnd && currentEnd > now ? currentEnd : now;
      const endDate = addDays(periodStart, PLAN_DAYS);
      const planId = plan || PLAN_ID;

      // Build a payment/receipt record. Appended to a per-business history so the
      // customer can download GST receipts from Settings → Billing & Payments.
      const prevPayments = Array.isArray(existing.payments) ? existing.payments : [];
      const seq = prevPayments.length + 1;
      const invoiceNo = billingMeta?.invoicePrefix
        ? `${billingMeta.invoicePrefix}-${bId}-${now.getFullYear()}-${String(seq).padStart(4, '0')}`
        : `SUB-${bId}-${String(seq).padStart(4, '0')}`;
      const paymentRecord = {
        invoiceNo,
        date: now.toISOString(),
        plan: planId,
        paymentId: paymentId || null,
        amount: Number(billingMeta?.total) || PLAN_PRICE,
        days: PLAN_DAYS,
        periodStart: periodStart.toISOString(),
        periodEnd: endDate.toISOString(),
        ...(billingMeta || {}),
      };
      // Carry the trial window over from a legacy trial record that predates
      // the trialStartDate/trialEndDate fields.
      const legacyTrial = existing.plan === 'trial' && !existing.trialStartDate
        ? { trialStartDate: existing.startDate || null, trialEndDate: existing.endDate || null }
        : {};

      await setDoc(
        doc(firestore, 'subscriptions', currentUser.email),
        {
          email: currentUser.email,
          businesses: {
            ...businessSubs,
            [bId]: {
              ...existing,
              ...legacyTrial,
              plan: planId,
              status: 'active',
              startDate: periodStart.toISOString(),
              endDate: endDate.toISOString(),
              razorpayPaymentId: paymentId,
              activatedAt: now.toISOString(),
              firstPaidAt: existing.firstPaidAt || now.toISOString(),
              ...(billingMeta?.businessName ? { businessName: billingMeta.businessName } : {}),
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
