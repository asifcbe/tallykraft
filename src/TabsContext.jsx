import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { useConfig } from './ConfigContext';

const TabsContext = createContext();

// These paths are singletons: only one tab per path at a time
const SINGLETON_PATHS = new Set([
  '/', '/parties', '/items', '/expenses', '/payment-in', '/payment-out',
  '/reports', '/backup', '/settings', '/staff', '/ledger', '/membership',
  '/credit-notes', '/debit-notes', '/delivery-notes', '/journal',
  '/opticals', '/admin', '/investors',
]);

// Human-readable label for a path
export const pathLabel = (path) => {
  const map = {
    '/': 'Dashboard', '/parties': 'Parties', '/items': 'Items',
    '/sales': 'New Invoice', '/purchases': 'New Purchase',
    '/expenses': 'Expenses', '/payment-in': 'Payment In', '/payment-out': 'Payment Out',
    '/reports': 'Reports', '/backup': 'Backup', '/settings': 'Settings',
    '/staff': 'Staff', '/ledger': 'Ledger', '/membership': 'Membership', '/investors': 'Investors',
    '/estimates': 'Estimates', '/credit-notes': 'Credit Notes',
    '/debit-notes': 'Debit Notes', '/delivery-notes': 'Delivery Notes',
    '/journal': 'Journal', '/opticals': 'Opticals', '/admin': 'Admin',
    '/cash': 'Cash', '/calculator': 'Calculator',
  };
  if (map[path]) return map[path];
  if (path?.startsWith('/section/')) return 'Custom';
  return 'Page';
};

// Pages that can have several simultaneous tabs, and the Settings toggle
// (config.features.*) that controls each. '/reports' is always multi-tab.
const MULTI_TAB_FEATURE = { '/sales': 'multiTabSales', '/purchases': 'multiTabSales', '/pos': 'multiTabPOS', '/estimates': 'multiTabEstimates' };
export const isMultiTabAllowed = (path, features) => {
  if (path === '/reports') return true;
  const key = MULTI_TAB_FEATURE[path];
  return !!key && features?.[key] !== false;
};

let _idSeq = 0;
const makeTabId = () => `tab_${++_idSeq}`;

// Tabs are kept alive (display:none, never unmounted) while inactive — but
// MUI Dialog/Modal render via a Portal straight onto document.body, so a
// dialog left open on the tab you're navigating AWAY from is completely
// unaffected by that display:none and stays mounted, interactive, and
// on-screen (its Backdrop especially) on top of whatever tab becomes active
// next — the app then looks fully frozen/unclickable until a hard reload.
// Dispatching Escape lets every dialog close itself the normal way (each
// page's own onClose handler runs, respecting any "don't close while
// saving" guards) instead of force-removing DOM nodes and risking a state/
// DOM mismatch. Deferred one tick so it runs after the tab-switch state
// update, in case the newly-active tab's own effects open a fresh dialog of
// their own on mount (which should NOT be immediately closed by this).
const closeStrayDialogs = () => {
  setTimeout(() => {
    if (document.querySelector('.MuiModal-root, .MuiDialog-root, .MuiPopover-root')) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    }
  }, 0);
};

const buildInitialTab = () => {
  const path = window.location.pathname || '/';
  return { id: makeTabId(), path, label: pathLabel(path), closeable: path !== '/' };
};

export const TabsProvider = ({ children }) => {
  const { config } = useConfig();
  const featuresRef = useRef(config.features);
  featuresRef.current = config.features;
  const initial = useRef(buildInitialTab()).current;
  const [tabs, setTabs] = useState([initial]);
  const [activeTabId, setActiveTabId] = useState(initial.id);
  // Track which tabs have been mounted at least once (lazy-mount)
  const [mountedIds, setMountedIds] = useState(() => new Set([initial.id]));
  // Ref mirrors so callbacks can read current values without stale closures
  const tabsRef = useRef([initial]);
  const activeTabIdRef = useRef(initial.id);

  // Keep refs in sync on every render so callbacks always see current values
  tabsRef.current = tabs;
  activeTabIdRef.current = activeTabId;

  const _activateById = useCallback((tabId, newTabs) => {
    setActiveTabId(tabId);
    activeTabIdRef.current = tabId;
    setMountedIds(ids => new Set([...ids, tabId]));
    const tab = (newTabs || []).find(t => t.id === tabId);
    if (tab) window.history.replaceState(null, '', tab.path);
    closeStrayDialogs();
  }, []);

  /**
   * Open or focus a tab.
   * @param {string} path    - route path e.g. '/sales'
   * @param {string} label   - display label
   * @param {object} opts    - { duplicate: bool } duplicate=true always opens new tab (for Sales/Purchases)
   */
  const openTab = useCallback((path, label, opts = {}) => {
    // Multi-tab turned off for this page in Settings → reuse its existing tab.
    const duplicate = !!opts.duplicate && isMultiTabAllowed(path, featuresRef.current);

    if (!duplicate) {
      // Find an existing tab with this path and activate it; create only if none exists.
      let existingId = null;
      setTabs(prev => {
        const found = prev.find(t => t.path === path);
        if (found) { existingId = found.id; return prev; }
        const t = { id: makeTabId(), path, label: label || pathLabel(path), closeable: true };
        setMountedIds(ids => new Set([...ids, t.id]));
        setActiveTabId(t.id);
        window.history.replaceState(null, '', path);
        return [...prev, t];
      });
      if (existingId) {
        setActiveTabId(existingId);
        setMountedIds(ids => new Set([...ids, existingId]));
        window.history.replaceState(null, '', path);
      }
    } else {
      // duplicate: true — always open a brand-new tab
      const t = { id: makeTabId(), path, label: label || pathLabel(path), closeable: true };
      setTabs(prev => [...prev, t]);
      setMountedIds(ids => new Set([...ids, t.id]));
      setActiveTabId(t.id);
      window.history.replaceState(null, '', path);
    }
    closeStrayDialogs();
  }, []);

  const activateTab = useCallback((tabId) => {
    setTabs(prev => {
      const tab = prev.find(t => t.id === tabId);
      if (tab) window.history.replaceState(null, '', tab.path);
      return prev;
    });
    setActiveTabId(tabId);
    setMountedIds(ids => new Set([...ids, tabId]));
    closeStrayDialogs();
  }, []);

  const closeTab = useCallback((tabId, e) => {
    e?.stopPropagation();
    const currentTabs = tabsRef.current;
    const currentActiveId = activeTabIdRef.current;
    if (currentTabs.length <= 1) return; // keep at least one tab
    const idx = currentTabs.findIndex(t => t.id === tabId);
    if (idx < 0) return;
    const filtered = currentTabs.filter(t => t.id !== tabId);
    setTabs(filtered);
    setMountedIds(ids => { const n = new Set(ids); n.delete(tabId); return n; });
    // Only change the active tab if we're closing the currently active one
    if (currentActiveId === tabId) {
      const next = filtered[Math.max(0, idx - 1)] || filtered[0];
      if (next) {
        setActiveTabId(next.id);
        activeTabIdRef.current = next.id;
        setMountedIds(ids => new Set([...ids, next.id]));
        window.history.replaceState(null, '', next.path);
      }
    }
    closeStrayDialogs();
  }, []);

  /** Update label / metadata of an existing tab */
  const updateTab = useCallback((tabId, updates) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, ...updates } : t));
  }, []);

  return (
    <TabsContext.Provider value={{ tabs, activeTabId, mountedIds, openTab, activateTab, closeTab, updateTab }}>
      {children}
    </TabsContext.Provider>
  );
};

export const useTabs = () => useContext(TabsContext);
