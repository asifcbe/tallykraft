/**
 * Super-admin-controlled per-business fair-use caps.
 *
 * Stored on the `businesses/{profileDocId}` doc as `maxStaff` / `maxDevices`
 * (set in Admin → Businesses tab). Unset ⇒ the defaults below.
 *
 *   • maxStaff   — how many staff accounts the business may create.
 *                  Enforced in StaffPage.jsx + Settings.jsx (Add Staff blocked).
 *   • maxDevices — how many devices/sessions may be logged in at once.
 *                  Enforced at login via deviceLimit.js (newest login blocked).
 */

export const DEFAULT_MAX_STAFF = 3;
export const DEFAULT_MAX_DEVICES = 2;

export const resolveMaxStaff = (bizDoc) => {
  const n = Number(bizDoc?.maxStaff);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_STAFF;
};

export const resolveMaxDevices = (bizDoc) => {
  const n = Number(bizDoc?.maxDevices);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_DEVICES;
};
