import { useState, useEffect, useRef } from 'react';

// Small UI preferences (discount type %/₹, last-used toggle, etc.) that
// should survive a reload/new session — previously these were plain
// useState, so anything picked in the morning was gone by the afternoon on
// a fresh page load. Backed by localStorage, scoped by an explicit key so
// callers can share/namespace as needed (e.g. per-business).
export const usePersistedState = (key, defaultValue) => {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const keyRef = useRef(key);
  useEffect(() => {
    // Key changed (e.g. business-scoped key switching businesses) — reload
    // from the new key's stored value instead of overwriting it with the
    // previous business's in-memory value.
    if (keyRef.current !== key) {
      keyRef.current = key;
      try {
        const stored = localStorage.getItem(key);
        setValue(stored !== null ? JSON.parse(stored) : defaultValue);
      } catch {
        setValue(defaultValue);
      }
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full/unavailable — the preference just won't persist this time.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, value]);

  return [value, setValue];
};
