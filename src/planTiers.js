// Plan constants shared by SubscriptionContext, SubscriptionPage, Settings
// (add-business checkout) and the Admin panel. Kept in a plain module (not a
// context/component file) so React Fast Refresh can still hot-reload the
// components that import these.

export const BRAND_NAME = 'BillDheko';

// One plan: ₹299 per business for 30 days. A 7-day free trial comes first.
export const TRIAL_DAYS = 7;
export const PLAN_DAYS = 30;
export const PLAN_ID = 'monthly_pro';
export const PLAN_PRICE = 299;                 // ₹, list price per business per period
export const PLAN_AMOUNT_PAISE = PLAN_PRICE * 100;
export const PLAN_LABEL = `₹${PLAN_PRICE} / ${PLAN_DAYS} days`;

// Paid plan ids that still unlock a business. 'yearly_pro' is no longer sold,
// but subscriptions bought earlier stay valid until their end date.
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
