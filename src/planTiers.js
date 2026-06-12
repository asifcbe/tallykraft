// Plan-tier constants shared across SubscriptionContext and the UI.
// Kept in a plain module (not the context file) so React Fast Refresh can still
// hot-reload the components that import these.

// Solo / Basic plans: local-only storage, single device.
export const SOLO_PLANS = ['monthly', 'yearly'];
// Business / Pro plans: cloud sync + multi-device.
export const PRO_PLANS = ['monthly_pro', 'yearly_pro'];

// True for any Pro plan id (the cloud-sync tier).
export const isProPlanId = (planId) => PRO_PLANS.includes(planId);
