// Draft invoice-number registry shared by every open Sales / Purchases / POS
// tab instance. Each kept-alive tab used to derive its next number purely
// from SAVED records, so two "New Invoice" tabs opened side by side both
// showed (and could save) the same number. A tab now RESERVES the serial it
// is showing; other tabs skip reserved serials when picking their own.
//
// When a draft is abandoned (tab closed / cancelled without saving) its
// serial is released and the remaining drafts in the same scope are
// re-packed so the numbering stays gap-free: drafts 5, 6, 7 → close 6 →
// the tab showing 7 becomes 6.
//
// Module-level (not React state) on purpose: every Sales/POS instance in the
// same page shares this one map, and changes are pushed to subscribers.

const drafts = new Map(); // ownerId -> { scope, prefix, serial }
const listeners = new Set();

const keyOf = (scope, prefix) => `${scope}::${prefix}`;

export const formatInvoiceNumber = (prefix, serial) => `${prefix}-${String(serial).padStart(4, '0')}`;

export const parseSerial = (invoiceNumber, prefix) => {
  if (!invoiceNumber || !invoiceNumber.startsWith(prefix + '-')) return null;
  const parts = invoiceNumber.split('-');
  const n = parseInt(parts[parts.length - 1], 10);
  return Number.isNaN(n) ? null : n;
};

/** Serials reserved by OTHER owners for this scope/prefix. */
export const reservedSerials = (scope, prefix, excludeOwner) => {
  const k = keyOf(scope, prefix);
  const out = new Set();
  drafts.forEach((d, owner) => {
    if (owner !== excludeOwner && keyOf(d.scope, d.prefix) === k) out.add(d.serial);
  });
  return out;
};

export const getDraft = (ownerId) => drafts.get(ownerId) || null;

export const reserve = (ownerId, scope, prefix, serial) => {
  drafts.set(ownerId, { scope, prefix, serial });
};

const notify = (changed) => {
  if (!changed.size) return;
  listeners.forEach((fn) => { try { fn(changed); } catch { /* ignore */ } });
};

/**
 * Release an owner's reservation.
 * @param {object} opts
 *   repack        — re-pack the remaining drafts into the freed slot (draft abandoned)
 *   isSavedSerial — (serial) => bool, serials already used by saved records are never handed out
 */
export const release = (ownerId, { repack = false, isSavedSerial = () => false } = {}) => {
  const d = drafts.get(ownerId);
  if (!d) return;
  drafts.delete(ownerId);
  if (!repack) return;

  const k = keyOf(d.scope, d.prefix);
  const others = [];
  drafts.forEach((od, owner) => { if (keyOf(od.scope, od.prefix) === k) others.push([owner, od]); });
  if (!others.length) return;

  // Pool = the remaining drafts' serials + the freed one; hand the lowest
  // free ones back to the remaining drafts, keeping their relative order.
  const pool = [...new Set([d.serial, ...others.map(([, od]) => od.serial)])]
    .filter((s) => !isSavedSerial(s))
    .sort((a, b) => a - b);
  others.sort((a, b) => a[1].serial - b[1].serial);

  const changed = new Set();
  others.forEach(([owner, od], i) => {
    const next = pool[i];
    if (next != null && next !== od.serial) {
      drafts.set(owner, { ...od, serial: next });
      changed.add(owner);
    }
  });
  notify(changed);
};

export const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
