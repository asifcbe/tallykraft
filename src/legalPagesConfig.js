// Public legal / policy pages (rendered by LegalPages.jsx, routed in App.jsx
// before the login check). Kept in a plain module so components can import it.
export const LEGAL_PAGES = [
  { path: '/terms', key: 'terms', title: 'Terms & Conditions' },
  { path: '/privacy', key: 'privacy', title: 'Privacy Policy' },
  { path: '/refund-policy', key: 'refund', title: 'Cancellation & Refund Policy' },
  { path: '/shipping-policy', key: 'shipping', title: 'Shipping & Delivery Policy' },
  { path: '/contact', key: 'contact', title: 'Contact Us' },
];

export const legalPageForPath = (path) => LEGAL_PAGES.find(p => p.path === path) || null;

// In-app navigation for the public pages: switch page without a full reload
// (a reload re-boots the app and triggers the browser's "leave site?" prompt
// from App.jsx's BeforeUnloadGuard). App.jsx listens for 'app-pathchange'.
let lastPath = typeof window !== 'undefined' ? window.location.pathname : '/';

export const navigateTo = (path) => {
  if (typeof window === 'undefined' || path === window.location.pathname) return;
  lastPath = path;
  window.history.pushState({ legalNav: true }, '', path);
  window.dispatchEvent(new Event('app-pathchange'));
  window.scrollTo(0, 0);
};

// For a popstate (Back/Forward): true when it moves to, from or between the
// public pages — the BeforeUnloadGuard must then not intercept it. Call once
// per popstate event.
export const isPublicPageNav = (e) => {
  const from = lastPath;
  const to = window.location.pathname;
  lastPath = to;
  return !!(legalPageForPath(from) || legalPageForPath(to) || e?.state?.legalNav);
};

// onClick for <a href> links to public pages: same-tab clicks navigate in
// place; ctrl/cmd/middle-click still open a new tab normally.
export const linkTo = (path) => (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  navigateTo(path);
};
