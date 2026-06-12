/**
 * Lightweight mutable module for DataContext to check subscription state
 * without creating a circular context dependency with SubscriptionContext.
 *
 * SubscriptionContext writes here whenever subscription data changes.
 * DataContext reads here before allowing write operations.
 *
 * Two dimensions tracked per business:
 *   active — subscription is valid (any plan, including trial)
 *   pro    — subscription is a Pro-tier plan (cloud sync enabled)
 */

const _active = new Set();
const _pro = new Set();
let _adminAll = false;

// Listeners notified when pro/admin state changes, so DataContext can re-pull
// Pro businesses from Firestore once subscription state has resolved.
const _listeners = new Set();
export function onProStateChange(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
export function notifyProStateChange() {
  _listeners.forEach((fn) => { try { fn(); } catch (_) { /* ignore */ } });
}

export function setBusinessActive(bId, active) {
  if (active) _active.add(String(bId));
  else _active.delete(String(bId));
}

export function setBusinessPro(bId, isPro) {
  if (isPro) _pro.add(String(bId));
  else _pro.delete(String(bId));
}

export function setAllBusinessesActive(val) {
  _adminAll = !!val;
}

/** Returns true if the given business has an active subscription (any tier). */
export function isBusinessActive(bId) {
  return _adminAll || _active.has(String(bId));
}

/** Returns true if the given business is on a Pro plan (cloud sync enabled). */
export function isBusinessPro(bId) {
  return _adminAll || _pro.has(String(bId));
}
