// Plan-tier constants shared across SubscriptionContext and the UI.
// Kept in a plain module (not the context file) so React Fast Refresh can still
// hot-reload the components that import these.

// TallyKraft has a single plan tier (₹299/mo, ₹2999/yr). SOLO_PLANS kept as an
// empty array so legacy computeState branches remain harmless.
export const SOLO_PLANS = [];
// Business / Pro plans: cloud sync + multi-device.
export const PRO_PLANS = ['monthly_pro', 'yearly_pro'];

// True for any Pro plan id (the cloud-sync tier).
export const isProPlanId = (planId) => PRO_PLANS.includes(planId);
