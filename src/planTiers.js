// Plan constants shared by SubscriptionContext, SubscriptionPage, Settings
// (add-business checkout) and the Admin panel. Kept in a plain module (not a
// context/component file) so React Fast Refresh can still hot-reload the
// components that import these.

export const BRAND_NAME = 'BillDheko';

// Two plans per business, after a 7-day free trial. Both are prepaid for a
// fixed period, do not auto-renew, and are NOT cancellable or refundable once
// paid (see the Terms / Refund Policy pages in LegalPages.jsx).
export const TRIAL_DAYS = 7;
export const PLANS = [
  { id: 'monthly_pro', name: 'Monthly', price: 299, days: 30, period: '30 days', short: '/ 30 days' },
  { id: 'yearly_pro', name: 'Yearly', price: 2999, days: 365, period: '1 year', short: '/ year', badge: 'Save ₹589' },
];
export const planById = (id) => PLANS.find(p => p.id === id) || PLANS[0];

// Defaults (the monthly plan) — kept for places that show "from ₹299".
export const PLAN_ID = PLANS[0].id;
export const PLAN_PRICE = PLANS[0].price;           // ₹, monthly list price per business
export const PLAN_DAYS = PLANS[0].days;
export const YEARLY_PRICE = PLANS[1].price;
export const PLAN_LABEL = `₹${PLAN_PRICE} / ${PLAN_DAYS} days`;

// Paid plan ids that unlock a business.
export const PRO_PLANS = ['monthly_pro', 'yearly_pro'];
// Legacy: no local-only tier any more. Kept empty so old branches stay inert.
export const SOLO_PLANS = [];

export const isProPlanId = (planId) => PRO_PLANS.includes(planId);

export const DAY_MS = 24 * 60 * 60 * 1000;
export const addDays = (date, days) => new Date(new Date(date).getTime() + days * DAY_MS);

// Razorpay. The test key (rzp_test_…) comes from .env (VITE_RAZORPAY_KEY);
// test payments show up in the Razorpay dashboard's Test Mode.
// Falls back to the same public test key the app has always shipped with.
export const RAZORPAY_KEY = import.meta.env.VITE_RAZORPAY_KEY || 'rzp_test_SgTH0ctSdvsPBb';

export const loadRazorpay = () =>
  new Promise((resolve) => {
    if (window.Razorpay) { resolve(true); return; }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

// Trial / paid-period facts for one business subscription record, for the
// Admin panel and receipts. Older records only kept the current plan's dates,
// so a record still on 'trial' supplies its own dates as the trial window.
export const trialInfo = (biz) => {
  if (!biz) return { start: null, end: null };
  const start = biz.trialStartDate || (biz.plan === 'trial' ? biz.startDate : null) || null;
  const end = biz.trialEndDate || (biz.plan === 'trial' ? biz.endDate : null) || null;
  return { start, end };
};
