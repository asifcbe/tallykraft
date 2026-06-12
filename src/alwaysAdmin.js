// Super-admin override driven by the VITE_ALWAYSADMIN env key.
// Any email listed here is always treated as an authorized admin with every
// feature enabled, regardless of what Firestore's userConfig says. Useful for
// the app owner so they can never lock themselves out.
//
// VITE_ALWAYSADMIN may hold one email or a comma-separated list.

const ALWAYS_ADMIN_EMAILS = String(import.meta.env.VITE_ALWAYSADMIN || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/** True if the given email is configured as an always-on super-admin. */
export const isAlwaysAdmin = (email) =>
  !!email && ALWAYS_ADMIN_EMAILS.includes(String(email).trim().toLowerCase());
