// Shared helpers for the record-creation timestamp (`createdAt`, ms since
// epoch, auto-stamped by DataContext.jsx's addItem/addItems on every save)
// — used to sort transactions in true chronological order (not just by
// `date`, which only has day precision and leaves same-day records in
// insertion-order or worse) and to show a small "created at" time wherever
// a transaction list is displayed.

// Sort key: prefer the real creation timestamp; fall back to combining the
// record's own `date` + `time` (Sales.jsx's user-editable invoice time)
// for any record saved before `createdAt` existed, so older data still
// sorts sensibly instead of colliding at 0.
export const txSortKey = (r) => {
  if (r.createdAt) return Number(r.createdAt) || 0;
  const d = r.date ? Date.parse(r.time ? `${r.date}T${r.time}` : r.date) : 0;
  return Number.isFinite(d) ? d : 0;
};

// Ascending/descending comparator built on txSortKey — use directly in
// `.sort()` calls in place of a plain `a.date.localeCompare(b.date)`.
export const byTxTimeAsc = (a, b) => txSortKey(a) - txSortKey(b);
export const byTxTimeDesc = (a, b) => txSortKey(b) - txSortKey(a);

// Small "created at" clock time for display next to a date, e.g. "2:45 PM".
// Returns '' when there's nothing to show (no createdAt on old records).
export const formatCreatedTime = (r) => {
  if (!r?.createdAt) return '';
  try {
    return new Date(r.createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return '';
  }
};
