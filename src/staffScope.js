// Staff visibility rules shared by every page that lists transactions or
// shows business-wide totals.
//
// - A "restricted staff" session is a business-code STAFF login (role
//   'staff'). The account owner (Google sign-in) and a business-code ADMIN
//   login are never restricted.
// - Restricted staff never see the per-section summary figures (receivables,
//   payables, total invoice value, stock value, etc.).
// - When the owner turns on the `ownBillsOnly` staff permission, that staff
//   member's Sales / Purchases lists only show bills they created.

export const isRestrictedStaff = (staffSession) =>
  !!staffSession && staffSession.role !== 'admin';

export const canSeeSummaries = (staffSession) => !isRestrictedStaff(staffSession);

export const ownBillsOnly = (staffSession) =>
  isRestrictedStaff(staffSession) && !!staffSession.features?.ownBillsOnly;

// Records created after this feature carry `createdBy` (the staff id, stamped
// by DataContext.addItem). Older records only have `billedBy` (the staff
// member's display name), so fall back to that.
export const isOwnRecord = (record, staffSession) => {
  if (!record || !staffSession) return false;
  if (record.createdBy) return String(record.createdBy) === String(staffSession.id);
  return !!record.billedBy && record.billedBy === staffSession.name;
};

export const filterOwnRecords = (records, staffSession) =>
  ownBillsOnly(staffSession) ? records.filter((r) => isOwnRecord(r, staffSession)) : records;
