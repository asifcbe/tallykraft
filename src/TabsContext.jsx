import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

const TabsContext = createContext();

// These paths are singletons: only one tab per path at a time
const SINGLETON_PATHS = new Set([
  '/', '/parties', '/items', '/expenses', '/payment-in', '/payment-out',
  '/reports', '/backup', '/settings', '/staff', '/ledger', '/membership',
  '/estimates', '/credit-notes', '/debit-notes', '/delivery-notes', '/journal',
  '/opticals', '/admin',
]);

// Human-readable label for a path
export const pathLabel = (path) => {
  const map = {
    '/': 'Dashboard', '/parties': 'Parties', '/items': 'Items',
    '/sales': 'New Invoice', '/purchases': 'New Purchase',
    '/expenses': 'Expenses', '/payment-in': 'Payment In', '/payment-out': 'Payment Out',
    '/reports': 'Reports', '/backup': 'Backup', '/settings': 'Settings',
    '/staff': 'Staff', '/ledger': 'Ledger', '/membership': 'Membership',
    '/estimates': 'Estimates', '/credit-notes': 'Credit Notes',
    '/debit-notes': 'Debit Notes', '/delivery-notes': 'Delivery Notes',
    '/journal': 'Journal', '/opticals': 'Opticals', '/admin': 'Admin',
    '/cash': 'Cash', '/calculator': 'Calculator',
  };
  if (map[path]) return map[path];
  if (path?.startsWith('/section/')) return 'Custom';
  return 'Page';
};

let _idSeq = 0;
const makeTabId = () => `tab_${++_idSeq}`;

const buildInitialTab = () => {
  const path = window.location.pathname || '/';
  return { id: makeTabId(), path, label: pathLabel(path), closeable: path !== '/' };
};

export const TabsProvider = ({ children }) => {
  const initial = useRef(buildInitialTab()).current;
  const [tabs, setTabs] = useState([initial]);
  const [activeTabId, setActiveTabId] = useState(initial.id);
  // Track which tabs have been mounted at least once (lazy-mount)
  const [mountedIds, setMountedIds] = useState(() => new Set([initial.id]));

  const _activateById = useCallback((tabId, newTabs) => {
    setActiveTabId(tabId);
    setMountedIds(ids => new Set([...ids, tabId]));
    const tab = (newTabs || []).find(t => t.id === tabId);
    if (tab) window.history.replaceState(null, '', tab.path);
  }, []);

  /**
   * Open or focus a tab.
   * @param {string} path    - route path e.g. '/sales'
   * @param {string} label   - display label
   * @param {object} opts    - { duplicate: bool } duplicate=true always opens new tab (for Sales/Purchases)
   */
  const openTab = useCallback((path, label, opts = {}) => {
    const { duplicate = false } = opts;

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
  }, []);

  const activateTab = useCallback((tabId) => {
    setTabs(prev => {
      const tab = prev.find(t => t.id === tabId);
      if (tab) window.history.replaceState(null, '', tab.path);
      return prev;
    });
    setActiveTabId(tabId);
    setMountedIds(ids => new Set([...ids, tabId]));
  }, []);

  const closeTab = useCallback((tabId, e) => {
    e?.stopPropagation();
    setTabs(prev => {
      if (prev.length <= 1) return prev; // keep at least one tab
      const idx = prev.findIndex(t => t.id === tabId);
      const filtered = prev.filter(t => t.id !== tabId);
      setActiveTabId(current => {
        if (current !== tabId) return current;
        const next = filtered[Math.max(0, idx - 1)] || filtered[0];
        if (next) window.history.replaceState(null, '', next.path);
        return next?.id ?? filtered[0]?.id;
      });
      setMountedIds(ids => { const n = new Set(ids); n.delete(tabId); return n; });
      return filtered;
    });
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
