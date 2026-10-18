import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useConfig } from './ConfigContext';
import { useBusiness } from './BusinessContext';
import { useData } from './DataContext';
import {
  BUILTIN_PRODUCT_CATEGORIES, BUILTIN_SERVICE_CATEGORIES, BUILTIN_MEMBERSHIP_CATEGORIES,
  loadCustomItemCategories, saveCustomItemCategories,
} from './partyUtils';

// One live list of item categories, shared by the Items page (Categories
// manager + filter), the item form, Bulk Add and Bulk Edit.
//
// Why: custom categories used to live ONLY in this browser's localStorage, and
// each screen read them once when it mounted. So a category added in the
// Categories manager didn't show in an already-open item form, never reached
// another device or a staff login, and categories that only existed on items
// (imported / bulk-added / added elsewhere) were missing from the dropdowns —
// editing such an item showed a blank category.
//
// Now custom categories are stored in the business's synced settings
// (`config.itemCategories = { product: [], service: [], membership: [] }`),
// any categories already saved on this device are carried over once, and every
// category actually used on an item is always offered.

const BUILTINS = {
  product: BUILTIN_PRODUCT_CATEGORIES,
  service: BUILTIN_SERVICE_CATEGORIES,
  membership: BUILTIN_MEMBERSHIP_CATEGORIES,
};

const typeOf = (item) => {
  if (item.isMembership || item.itemType === 'membership') return 'membership';
  if (item.itemType === 'service') return 'service';
  return 'product';
};

const uniqCI = (list) => {
  const seen = new Set();
  const out = [];
  list.forEach((c) => {
    const name = String(c || '').trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) return;
    seen.add(key);
    out.push(name);
  });
  return out;
};

export const useItemCategories = (itemType = 'product') => {
  const { config, saveConfig } = useConfig();
  const { currentBusiness } = useBusiness();
  const { data } = useData();
  const bizId = currentBusiness?.id;
  const builtins = useMemo(() => BUILTINS[itemType] || BUILTIN_PRODUCT_CATEGORIES, [itemType]);

  const savedCustom = config?.itemCategories?.[itemType];
  const legacyCustom = useMemo(
    () => (bizId ? loadCustomItemCategories(bizId, itemType) : []),
    // re-read when the synced list changes so both stay in step
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bizId, itemType, savedCustom],
  );

  // Custom = synced list, plus anything still only on this device.
  const custom = useMemo(() => {
    const builtinKeys = new Set(builtins.map((c) => c.toLowerCase()));
    return uniqCI([...(savedCustom || []), ...legacyCustom]).filter((c) => !builtinKeys.has(c.toLowerCase()));
  }, [savedCustom, legacyCustom, builtins]);

  // Categories found on this business's items but in neither list above.
  const inUse = useMemo(() => {
    const known = new Set([...builtins, ...custom].map((c) => c.toLowerCase()));
    const found = [];
    (data?.items || []).forEach((it) => {
      if (it.businessId !== bizId || typeOf(it) !== itemType) return;
      const c = String(it.category || '').trim();
      if (c && !known.has(c.toLowerCase())) { known.add(c.toLowerCase()); found.push(c); }
    });
    return found.sort((a, b) => a.localeCompare(b));
  }, [data?.items, bizId, itemType, builtins, custom]);

  const all = useMemo(() => [...builtins, ...custom, ...inUse], [builtins, custom, inUse]);

  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const writeCustom = useCallback(async (next) => {
    if (!bizId) return;
    saveCustomItemCategories(bizId, itemType, next); // device copy, for older screens
    const cfg = configRef.current || {};
    await saveConfig({ ...cfg, itemCategories: { ...(cfg.itemCategories || {}), [itemType]: next } });
  }, [bizId, itemType, saveConfig]);

  // One-time carry-over of categories that so far exist only on this device.
  const migratedRef = useRef('');
  useEffect(() => {
    const key = `${bizId}:${itemType}`;
    if (!bizId || migratedRef.current === key) return;
    const synced = new Set((savedCustom || []).map((c) => c.toLowerCase()));
    const missing = legacyCustom.filter((c) => !synced.has(c.toLowerCase()));
    migratedRef.current = key;
    if (missing.length) writeCustom(uniqCI([...(savedCustom || []), ...missing])).catch(() => { migratedRef.current = ''; });
  }, [bizId, itemType, savedCustom, legacyCustom, writeCustom]);

  /** Adds a category. Returns the stored name (existing match wins, any case). */
  const add = useCallback(async (raw) => {
    const name = String(raw || '').trim();
    if (!name) return '';
    const existing = [...builtins, ...custom].find((c) => c.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    // An in-use category being "added" just gets promoted into the list.
    const promoted = inUse.find((c) => c.toLowerCase() === name.toLowerCase()) || name;
    await writeCustom([...custom, promoted]);
    return promoted;
  }, [builtins, custom, inUse, writeCustom]);

  const remove = useCallback(async (name) => {
    await writeCustom(custom.filter((c) => c !== name));
  }, [custom, writeCustom]);

  return { builtins, custom, inUse, all, add, remove };
};

export default useItemCategories;
