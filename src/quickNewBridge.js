// Cross-tab hand-off used by Dashboard's "+ New Entry", InvoicePreviewDialog's
// Edit button, and Estimates/Orders' "Convert to Sale" — all of them open a
// brand-new Sales/Purchases/Expenses/Cash tab via TabsContext's `openTab` and
// then need to hand a payload to that tab's listener once it's mounted.
//
// The old approach fired a single `dashboard-quick-new` CustomEvent after a
// blind `setTimeout(..., 60)`, racing against the target page's mount — Sales
// is lazy-loaded (`lazy(() => import('./Sales'))`), so on a cold chunk (the
// first time /sales is opened in a session) mounting can easily take longer
// than 60ms, silently dropping the event with no listener ever having been
// registered to hear it.
//
// dispatchQuickNew now retries on a short interval until acknowledged (or a
// timeout elapses), and the receiving pages call acknowledgeQuickNew() as
// soon as they actually act on a matching event so the retries stop.
const RETRY_MS = 40;
const MAX_WAIT_MS = 4000;

export const dispatchQuickNew = (detail) => {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const payload = { ...detail, __id: id };
  const start = Date.now();
  const fire = () => {
    if (window.__quickNewAcked?.has(id)) return;
    window.dispatchEvent(new CustomEvent('dashboard-quick-new', { detail: payload }));
    if (Date.now() - start < MAX_WAIT_MS) {
      setTimeout(fire, RETRY_MS);
    }
  };
  fire();
};

export const acknowledgeQuickNew = (detail) => {
  if (!detail?.__id) return;
  if (!window.__quickNewAcked) window.__quickNewAcked = new Set();
  window.__quickNewAcked.add(detail.__id);
};
