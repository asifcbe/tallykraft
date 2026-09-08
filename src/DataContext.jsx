import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { firestore } from './db';
import { doc, setDoc, getDoc, collection, getDocs, writeBatch } from 'firebase/firestore';
import { useAuth } from './AuthContext';
import { getLocalData, setLocalData, clearLocalData, createBackupSnapshot, listBackupSnapshots, getBackupSnapshot, deleteBackupSnapshot } from './indexedDB';
import { isBusinessActive, isBusinessPro, onProStateChange } from './activeBusinessState';

// ── Firestore chunked persistence ────────────────────────────────────────────
// Each business is stored as a subcollection document, and each table is split
// into CHUNK_ROWS-row chunks to stay under Firestore's 1 MB document limit.
//
// Layout:
//   users/{uid}/biz/{bizId}            — business metadata + _cc chunk-count map
//   users/{uid}/biz/{bizId}/t/{table}_{i}  — table data chunk i
//
// Backward compat: if the new subcollection is empty, falls back to reading
// the old flat `users/{uid}.businesses` field automatically.

const CHUNK_ROWS = 800;
const ALL_TABLES = [
  'parties','items','sales','purchases','expenses','payments','estimates',
  'creditNotes','debitNotes','deliveryNotes','journalEntries',
  'opticals','opticalOrders','opticalSettings','customSectionRecords','settings','memberships',
  'cashEntries',
];
const BIZ_META_KEYS = [
  'id','name','gstNumber','address','phone','email','state',
  'logo','qrCode','fyStartMonth','needsSetup','password','username',
  'openingCash',
];

/**
 * Read all businesses from Firestore.
 * @param {string} uid  — Firebase UID (could be owner's UID for staff sessions)
 * @param {object} cc   — mutable chunk-counts object (chunkCountsRef.current); updated in-place
 * @returns {object|null}  allBusinessData map, or null if nothing found
 */
const firestoreReadAll = async (uid, cc) => {
  try {
    // ── New subcollection format ──────────────────────────────────────────────
    const bizColl = collection(firestore, 'users', uid, 'biz');
    const bizSnap = await getDocs(bizColl);

    if (!bizSnap.empty) {
      const allData = {};
      for (const bizDoc of bizSnap.docs) {
        const bizId = bizDoc.id;
        const meta = bizDoc.data();
        if (cc) cc[bizId] = meta._cc || {};

        const tSnap = await getDocs(collection(firestore, 'users', uid, 'biz', bizId, 't'));
        const chunkMap = {};
        tSnap.docs.forEach(d => {
          const li = d.id.lastIndexOf('_');
          const tName = d.id.substring(0, li);
          const ci = parseInt(d.id.substring(li + 1), 10);
          if (!chunkMap[tName]) chunkMap[tName] = {};
          chunkMap[tName][ci] = d.data().d || [];
        });

        const data = {};
        ALL_TABLES.forEach(t => {
          const chunks = chunkMap[t];
          if (!chunks) { data[t] = []; return; }
          const maxIdx = Math.max(...Object.keys(chunks).map(Number));
          data[t] = [];
          for (let i = 0; i <= maxIdx; i++) data[t].push(...(chunks[i] || []));
        });

        const bizMeta = { ...meta };
        delete bizMeta._cc;
        allData[bizId] = { ...bizMeta, data };
      }
      return allData;
    }

    // ── Fall back to old flat format ─────────────────────────────────────────
    const snap = await getDoc(doc(firestore, 'users', uid));
    if (snap.exists()) {
      const remote = snap.data()?.businesses;
      if (remote && typeof remote === 'object' && Object.keys(remote).length > 0) return remote;
    }
    return null;
  } catch (err) {
    console.error('firestoreReadAll failed:', err);
    return null;
  }
};

/**
 * Write businesses to Firestore using the chunked subcollection format.
 * @param {string} uid
 * @param {object} allData     — allBusinessData map
 * @param {object} cc          — mutable chunk-counts object; updated in-place after each write
 * @param {Set|null} dirtyTables — when provided, only rewrite chunks for these tables;
 *                                 null/undefined means full rewrite (used on first sync / restore)
 */
const firestoreWriteAll = async (uid, allData, cc, dirtyTables = null) => {
  const ops = [];

  for (const [bizId, biz] of Object.entries(allData)) {
    const prevCC = cc?.[bizId] || {};
    // Start from the existing chunk-count map so untouched tables keep their counts.
    const newCC = { ...prevCC };
    const bizData = biz.data || {};

    // When dirtyTables is provided, only process those tables.
    // Always write ALL_TABLES on a full sync (dirtyTables === null).
    const tablesToWrite = dirtyTables
      ? ALL_TABLES.filter(t => dirtyTables.has(t))
      : ALL_TABLES;

    for (const table of tablesToWrite) {
      const rows = bizData[table] || [];
      const newCount = Math.ceil(rows.length / CHUNK_ROWS) || 0;
      newCC[table] = newCount;
      const prevCount = prevCC[table] || 0;

      for (let ci = 0; ci < newCount; ci++) {
        ops.push({
          type: 's',
          ref: doc(firestore, 'users', uid, 'biz', bizId, 't', `${table}_${ci}`),
          data: { d: rows.slice(ci * CHUNK_ROWS, (ci + 1) * CHUNK_ROWS) },
        });
      }
      // Delete chunks that no longer exist (table shrank)
      for (let ci = newCount; ci < prevCount; ci++) {
        ops.push({ type: 'd', ref: doc(firestore, 'users', uid, 'biz', bizId, 't', `${table}_${ci}`) });
      }
    }

    const meta = {};
    BIZ_META_KEYS.forEach(k => { if (biz[k] !== undefined) meta[k] = biz[k]; });
    meta._cc = { ...newCC };
    ops.push({ type: 's', ref: doc(firestore, 'users', uid, 'biz', bizId), data: meta });

    if (cc) cc[bizId] = newCC;
  }

  // Firestore batches are capped at 500 operations
  for (let i = 0; i < ops.length; i += 499) {
    const batch = writeBatch(firestore);
    ops.slice(i, i + 499).forEach(op => {
      if (op.type === 's') batch.set(op.ref, op.data);
      else batch.delete(op.ref);
    });
    await batch.commit();
  }
};

/**
 * Delete a single business's entire cloud copy from Firestore — every table
 * chunk under .../biz/{bizId}/t plus the business meta doc. Used when a business
 * is downgraded from Pro to Basic and its data must leave the cloud.
 * @param {string} uid
 * @param {string} bizId
 * @param {object} cc  — chunk-counts ref; the entry for bizId is cleared on success
 */
const firestoreDeleteBusiness = async (uid, bizId, cc) => {
  // Delete every chunk doc under the business's `t` subcollection. We read the
  // live collection rather than trusting cc so orphaned chunks are cleaned too.
  const tColl = collection(firestore, 'users', uid, 'biz', bizId, 't');
  const tSnap = await getDocs(tColl);
  const refs = tSnap.docs.map(d => d.ref);
  refs.push(doc(firestore, 'users', uid, 'biz', bizId)); // the meta doc itself

  for (let i = 0; i < refs.length; i += 499) {
    const batch = writeBatch(firestore);
    refs.slice(i, i + 499).forEach(ref => batch.delete(ref));
    await batch.commit();
  }
  if (cc) delete cc[bizId];
};

// Delay (ms) after the last mutation before flushing to IndexedDB / Firestore.
// Batches rapid sequential writes (e.g. sale + party update + N stock updates)
// into a single write, preventing blocking the main thread after each mutation.
const WRITE_DEBOUNCE_MS = 400;

const DataContext = createContext();

const emptyData = () => ({
  parties: [],
  items: [],
  sales: [],
  purchases: [],
  expenses: [],
  opticals: [],
  opticalOrders: [],
  opticalSettings: [],
  customSectionRecords: [],
  payments: [],
  settings: [],
  estimates: [],
  creditNotes: [],
  debitNotes: [],
  deliveryNotes: [],
  journalEntries: [],
  memberships: [],
  cashEntries: []
});

export const DataProvider = ({ children }) => {
  const { currentUser, isAuthorized, staffSession, loading: authLoading } = useAuth();
  const [data, setData] = useState(emptyData());
  const [allBusinessData, setAllBusinessData] = useState({});
  const [loading, setLoading] = useState(true);
  const [currentBusinessId, setCurrentBusinessId] = useState(null);
  const [saving, setSaving] = useState(false);
  const isUpdatingDataRef = useRef(false);

  // Mutable refs mirror state so mutations never read stale closures.
  // Updated synchronously before setData/setAllBusinessData so sequential
  // mutations within the same event loop tick always see the latest values.
  const dataRef = useRef(emptyData());
  const allDataRef = useRef({});
  const currentBusinessIdRef = useRef(null);
  // Tracks how many Firestore chunk docs exist per table per business.
  // Needed so writes can delete stale chunks when a table shrinks.
  const chunkCountsRef = useRef({});

  // Debounced write: one timer shared across all mutations.
  const writeTimerRef = useRef(null);
  const pendingWriteSnapshotRef = useRef(null); // latest allData to flush
  // Tracks which tables have been mutated since the last Firestore flush.
  // Passed to firestoreWriteAll so only dirty chunks are rewritten.
  const dirtyTablesRef = useRef(new Set());

  // Keep staffSession readable from inside the debounced flush closure.
  const staffSessionRef = useRef(staffSession);
  useEffect(() => { staffSessionRef.current = staffSession; }, [staffSession]);

  // Keep currentUser/isAuthorized readable from inside the flush closure.
  const currentUserRef = useRef(currentUser);
  const isAuthorizedRef = useRef(isAuthorized);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);
  useEffect(() => { isAuthorizedRef.current = isAuthorized; }, [isAuthorized]);

  useEffect(() => {
    // Wait for Firebase auth to finish resolving before touching data
    if (authLoading) return;

    if (staffSession) {
      loadStaffData(staffSession);
      return;
    }
    if (!currentUser || !isAuthorized) {
      setData(emptyData());
      setAllBusinessData({});
      setLoading(false);
      return;
    }
    loadAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, currentUser?.uid, isAuthorized, staffSession?.id]);

  // Keep currentBusinessIdRef in sync with state.
  useEffect(() => { currentBusinessIdRef.current = currentBusinessId; }, [currentBusinessId]);

  // Listen for business changes from localStorage
  useEffect(() => {
    const storedBusinessId = Number(localStorage.getItem('tallykraft_currentBusinessId')) || 1;
    setCurrentBusinessId(storedBusinessId);
  }, []);

  // Reload data when business changes (but not during active data updates)
  useEffect(() => {
    if (currentBusinessId && Object.keys(allBusinessData).length > 0 && !isUpdatingDataRef.current) {
      loadBusinessData(currentBusinessId);
    }
  }, [currentBusinessId, allBusinessData]);

  const createDefaultBusinessData = () => ({
    '1': {
      id: 1,
      name: 'My Business',
      gstNumber: '',
      address: '',
      phone: '',
      email: '',
      state: '',
      logo: '',
      qrCode: '',
      needsSetup: true,
      data: emptyData()
    }
  });

  const isCompleteOffline = () => localStorage.getItem('tallykraft_offline_mode') === 'true';

  // ── Debounced flush ────────────────────────────────────────────────────────
  // Called after every mutation. Schedules a single write 400 ms after the
  // last change, so a sale (which fires ~N+2 mutations) causes only 1 write.
  const schedulePersist = useCallback(() => {
    pendingWriteSnapshotRef.current = allDataRef.current;
    setSaving(true);
    clearTimeout(writeTimerRef.current);
    writeTimerRef.current = setTimeout(async () => {
      const snapshot = pendingWriteSnapshotRef.current;
      const user = currentUserRef.current;
      const authorized = isAuthorizedRef.current;
      const staff = staffSessionRef.current;
      // Snapshot dirty tables then immediately clear so the next mutation
      // cycle starts fresh. null = full rewrite (staff path always does full).
      const dirty = dirtyTablesRef.current.size > 0
        ? new Set(dirtyTablesRef.current)
        : null;
      dirtyTablesRef.current.clear();
      try {
        if (staff) {
          // Staff users write straight to the owner's Firestore path (full rewrite).
          await firestoreWriteAll(staff.ownerUid, snapshot, chunkCountsRef.current, null);
        } else if (user && authorized) {
          // IndexedDB is the local source of truth for ALL businesses (both plans).
          await setLocalData(user.uid, snapshot);
          // Only Pro (₹299) businesses sync to the cloud. Basic (₹99) businesses
          // never leave the device — filter them out of the Firestore write.
          if (!isCompleteOffline()) {
            const proSnapshot = {};
            for (const [bizId, biz] of Object.entries(snapshot)) {
              if (isBusinessPro(bizId)) proSnapshot[bizId] = biz;
            }
            if (Object.keys(proSnapshot).length > 0) {
              // Pass dirty set — only rewrite chunks for tables that changed.
              firestoreWriteAll(user.uid, proSnapshot, chunkCountsRef.current, dirty).catch(() => {});
            }
          }
        }
      } catch (e) {
        console.error('Persist failed:', e);
      } finally {
        setSaving(false);
      }
    }, WRITE_DEBOUNCE_MS);
  }, []); // stable — reads everything from refs

  // ── Core mutation helper ───────────────────────────────────────────────────
  // Updates data + allBusinessData synchronously (single React batch), then
  // triggers a debounced persist. Returns the new `data` snapshot.
  const applyMutation = useCallback((table, newTableData) => {
    const bKey = String(currentBusinessIdRef.current || localStorage.getItem('tallykraft_currentBusinessId') || 1);
    const newData = { ...dataRef.current, [table]: newTableData };
    const currentBiz = allDataRef.current[bKey];
    const newAll = currentBiz
      ? { ...allDataRef.current, [bKey]: { ...currentBiz, data: newData } }
      : allDataRef.current;

    // Mark this table dirty so schedulePersist only rewrites its chunks.
    dirtyTablesRef.current.add(table);

    // Update refs first — next mutation in the same tick reads fresh values.
    dataRef.current = newData;
    allDataRef.current = newAll;
    isUpdatingDataRef.current = true;

    // Single React state update (React 18 auto-batches).
    setData(newData);
    setAllBusinessData(newAll);

    schedulePersist();
    setTimeout(() => { isUpdatingDataRef.current = false; }, 100);
    return newData;
  }, [schedulePersist]);

  const loadAllData = async () => {
    if (!currentUser || !isAuthorized) return;
    try {
      setLoading(true);

      // ── Per-business data source ──────────────────────────────────────────
      // IndexedDB is the base for every business (Basic = ₹99 lives here only).
      // For Pro (= ₹299) businesses we prefer the Firestore copy so data is fresh
      // across devices, and we pull-once-migrate any Pro business that exists in
      // the cloud but not yet locally. Basic businesses never read from Firestore.
      const local = await getLocalData(currentUser.uid);
      let finalData = (local && typeof local === 'object' && Object.keys(local).length > 0)
        ? { ...local }
        : null;

      if (!isCompleteOffline()) {
        try {
          const remote = await firestoreReadAll(currentUser.uid, chunkCountsRef.current);
          if (remote && typeof remote === 'object') {
            const base = finalData || {};
            const merged = { ...base };
            let changed = false;
            for (const [bizId, remoteBiz] of Object.entries(remote)) {
              // Only trust the cloud copy for businesses on a Pro plan.
              if (isBusinessPro(bizId)) {
                merged[bizId] = remoteBiz;
                changed = true;
              }
            }
            if (changed || !finalData) {
              finalData = merged;
              // Persist the merged result so the local copy stays the source of truth.
              saveToIndexedDB(finalData).catch(() => {});
            }
          }
        } catch (_) {
          // Firestore unreachable — operate purely on local data.
        }
      }

      if (finalData) {
        allDataRef.current = finalData;
        setAllBusinessData(finalData);
        const storedId = Number(localStorage.getItem('tallykraft_currentBusinessId'));
        const ids = Object.values(finalData).map(b => b.id);
        const validId = ids.includes(storedId) ? storedId : ids[0];
        if (validId) {
          currentBusinessIdRef.current = validId;
          setCurrentBusinessId(validId);
          localStorage.setItem('tallykraft_currentBusinessId', validId.toString());
        }
      } else {
        const defaultData = createDefaultBusinessData();
        allDataRef.current = defaultData;
        setAllBusinessData(defaultData);
        currentBusinessIdRef.current = 1;
        setCurrentBusinessId(1);
        localStorage.setItem('tallykraft_currentBusinessId', '1');
        await saveToIndexedDB(defaultData);
      }
    } catch (error) {
      console.error('❌ Failed to load data:', error);
      const defaultData = createDefaultBusinessData();
      allDataRef.current = defaultData;
      setAllBusinessData(defaultData);
      currentBusinessIdRef.current = 1;
      setCurrentBusinessId(1);
      localStorage.setItem('tallykraft_currentBusinessId', '1');
      await saveToIndexedDB(defaultData);
    } finally {
      setLoading(false);
    }
  };

  // Re-pull Pro businesses from Firestore after subscription state resolves.
  // Runs without a loading spinner; merges cloud copies of Pro businesses over
  // the current local data, leaving Basic businesses and the active selection
  // untouched.
  const refreshProFromCloud = useCallback(async () => {
    const user = currentUserRef.current;
    if (!user?.uid || !isAuthorizedRef.current || staffSessionRef.current) return;
    if (isCompleteOffline()) return;
    // Skip if there are no Pro businesses to pull.
    const base = allDataRef.current || {};
    const hasPro = Object.keys(base).some((bizId) => isBusinessPro(bizId));
    if (!hasPro) return;
    try {
      const remote = await firestoreReadAll(user.uid, chunkCountsRef.current);
      if (!remote || typeof remote !== 'object') return;
      const merged = { ...base };
      let changed = false;
      for (const [bizId, remoteBiz] of Object.entries(remote)) {
        if (isBusinessPro(bizId)) { merged[bizId] = remoteBiz; changed = true; }
      }
      if (changed) {
        allDataRef.current = merged;
        setAllBusinessData(merged);
        const bKey = String(currentBusinessIdRef.current);
        if (merged[bKey]?.data) {
          dataRef.current = merged[bKey].data;
          setData(merged[bKey].data);
        }
        saveToIndexedDB(merged).catch(() => {});
      }
    } catch { /* offline — ignore */ }
  }, []); // reads everything from refs

  // Re-pull from cloud whenever subscription/pro state changes (e.g. resolved
  // after the initial data load, or a business upgraded to Pro).
  useEffect(() => {
    const off = onProStateChange(() => { refreshProFromCloud(); });
    return off;
  }, [refreshProFromCloud]);

  const saveToIndexedDB = async (businessData) => {
    if (!currentUser?.uid) return true;
    try {
      await setLocalData(currentUser.uid, businessData);
      return true;
    } catch (e) {
      console.error('IndexedDB save failed:', e);
      return false;
    }
  };

  /** Force an immediate IndexedDB backup of all current business data. */
  const backupNow = () => saveToIndexedDB(allDataRef.current);

  /** Load business data from the owner's Firestore backup for staff sessions. */
  const loadStaffData = async (session) => {
    setLoading(true);
    try {
      const businesses = await firestoreReadAll(session.ownerUid, chunkCountsRef.current);

      if (businesses && typeof businesses === 'object' && Object.keys(businesses).length > 0) {
        allDataRef.current = businesses;
        setAllBusinessData(businesses);
        const firstBiz = Object.values(businesses)[0];
        const firstBizData = firstBiz.data || emptyData();
        currentBusinessIdRef.current = firstBiz.id;
        setCurrentBusinessId(firstBiz.id);
        dataRef.current = firstBizData;
        setData(firstBizData);
      } else {
        const fallback = { ...createDefaultBusinessData()['1'], needsSetup: false, name: session.businessName || 'Business' };
        const fallbackAll = { '1': fallback };
        allDataRef.current = fallbackAll;
        setAllBusinessData(fallbackAll);
        currentBusinessIdRef.current = 1;
        setCurrentBusinessId(1);
        dataRef.current = emptyData();
        setData(emptyData());
      }
    } catch (err) {
      console.error('Failed to load staff data from Firestore:', err);
      const fallback = { ...createDefaultBusinessData()['1'], needsSetup: false, name: session.businessName || 'Business' };
      const fallbackAll = { '1': fallback };
      allDataRef.current = fallbackAll;
      setAllBusinessData(fallbackAll);
      currentBusinessIdRef.current = 1;
      setCurrentBusinessId(1);
      dataRef.current = emptyData();
      setData(emptyData());
    } finally {
      setLoading(false);
    }
  };

  /** Called only when user clicks "Backup to Online" on Backup page. No automatic Firestore writes. */
  const backupToFirestore = async (overrideAllData) => {
    if (!currentUser || !isAuthorized) return { success: false, error: 'Not authenticated' };
    const bKey = String(currentBusinessId);
    // Online/cloud backup is a Pro-tier feature, enforced per business.
    if (!isBusinessPro(bKey)) {
      return { success: false, error: 'Online backup requires the Pro plan (₹299/mo) for this business.' };
    }
    try {
      const source = overrideAllData ?? allBusinessData;
      const biz = source[bKey];
      if (!biz) return { success: false, error: 'No current business data' };
      await firestoreWriteAll(currentUser.uid, { [bKey]: biz }, chunkCountsRef.current);
      return { success: true };
    } catch (error) {
      console.error('Firestore backup failed:', error);
      return { success: false, error: error.message };
    }
  };

  /**
   * Seed/refresh a single business's full cloud copy. Called right after a
   * Basic→Pro upgrade so the existing local data lands in Firestore immediately
   * (before any further edit). Unlike backupToFirestore this does NOT gate on
   * isBusinessPro, because the plan flag may not have propagated yet at call time.
   */
  const pushBusinessToCloud = async (businessId) => {
    if (!currentUser || !isAuthorized) return { success: false, error: 'Not authenticated' };
    const bKey = String(businessId);
    const biz = allDataRef.current[bKey] || allBusinessData[bKey];
    if (!biz) return { success: false, error: 'No data for that business' };
    try {
      await firestoreWriteAll(currentUser.uid, { [bKey]: biz }, chunkCountsRef.current);
      return { success: true };
    } catch (error) {
      console.error('pushBusinessToCloud failed:', error);
      return { success: false, error: error.message };
    }
  };

  /**
   * Permanently delete a single business's cloud copy. Called on a Pro→Basic
   * downgrade — the data stays in local IndexedDB but must leave the cloud.
   */
  const deleteBusinessFromCloud = async (businessId) => {
    if (!currentUser || !isAuthorized) return { success: false, error: 'Not authenticated' };
    const bKey = String(businessId);
    try {
      await firestoreDeleteBusiness(currentUser.uid, bKey, chunkCountsRef.current);
      return { success: true };
    } catch (error) {
      console.error('deleteBusinessFromCloud failed:', error);
      return { success: false, error: error.message };
    }
  };

  /** Restore from Firestore into IndexedDB — only current business is pulled. */
  const restoreFromFirestore = async () => {
    if (!currentUser || !isAuthorized) return { success: false, error: 'Not authenticated' };
    if (!isBusinessPro(String(currentBusinessId))) {
      return { success: false, error: 'Online restore requires the Pro plan (₹299/mo) for this business.' };
    }
    try {
      const firestoreBusinesses = await firestoreReadAll(currentUser.uid, chunkCountsRef.current);
      if (!firestoreBusinesses || typeof firestoreBusinesses !== 'object') {
        return { success: false, error: 'No backup found online' };
      }
      const bKey = String(currentBusinessId);
      const bizFromCloud = firestoreBusinesses[bKey];
      if (!bizFromCloud) {
        return { success: false, error: 'No backup for current business found online' };
      }
      const restoredData = bizFromCloud.data || emptyData();
      const merged = { ...allDataRef.current, [bKey]: bizFromCloud };
      allDataRef.current = merged;
      dataRef.current = restoredData;
      isUpdatingDataRef.current = true;
      setAllBusinessData(merged);
      setData(restoredData);
      setTimeout(() => { isUpdatingDataRef.current = false; }, 100);
      setLocalData(currentUser.uid, merged).catch(e => console.error('Restore persist failed:', e));
      return { success: true };
    } catch (error) {
      console.error('Restore from Firestore failed:', error);
      return { success: false, error: error.message };
    }
  };

  /** Restore from a file payload (businesses object) into current business slot only. */
  const restoreFromFile = async (businessData) => {
    if (!currentUser?.uid) return { success: false, error: 'Not authenticated' };
    if (!businessData || typeof businessData !== 'object' || Object.keys(businessData).length === 0) {
      return { success: false, error: 'Invalid backup data' };
    }
    try {
      const bKey = String(currentBusinessId);
      // Match by key first (same business), fall back to first entry (cross-business restore)
      const bizSource = businessData[bKey] || Object.values(businessData)[0];
      if (!bizSource) return { success: false, error: 'No business data in backup' };

      const sourceId = bizSource.id;
      const targetId = currentBusinessId;
      const rawData = bizSource.data || emptyData();

      // Remap every record's businessId to match the current business so component
      // filters (item.businessId === currentBusiness.id) work regardless of what
      // ID was used in the export file.
      const ALL_BIZ_TABLES = [
        'parties','items','sales','purchases','expenses','payments','estimates',
        'creditNotes','debitNotes','deliveryNotes','journalEntries',
        'opticals','opticalOrders','opticalSettings','customSectionRecords',
        'staffMembers','staffAttendance','staffSalary',
      ];
      const restoredData = { ...rawData };
      if (sourceId !== targetId) {
        ALL_BIZ_TABLES.forEach(table => {
          if (Array.isArray(rawData[table])) {
            restoredData[table] = rawData[table].map(r =>
              r.businessId !== undefined ? { ...r, businessId: targetId } : r
            );
          }
        });
      }

      const merged = {
        ...allDataRef.current,
        [bKey]: { ...bizSource, id: targetId, data: restoredData },
      };

      // Save to IndexedDB first so a subsequent page reload reads correct data.
      await setLocalData(currentUser.uid, merged);

      // Update refs then flush both state updates in the same synchronous tick.
      allDataRef.current = merged;
      dataRef.current = restoredData;
      isUpdatingDataRef.current = true;
      setAllBusinessData(merged);
      setData(restoredData);
      setTimeout(() => { isUpdatingDataRef.current = false; }, 100);

      return { success: true };
    } catch (error) {
      console.error('Restore from file failed:', error);
      return { success: false, error: error.message };
    }
  };

  const loadBusinessData = (businessId) => {
    const businessKey = String(businessId);
    const business = allDataRef.current[businessKey] || allBusinessData[businessKey];
    const bizData = (business && business.data) ? business.data : emptyData();
    dataRef.current = bizData;
    setData(bizData);
  };

  const updateCurrentBusinessId = (businessId) => {
    currentBusinessIdRef.current = businessId;
    setCurrentBusinessId(businessId);
    localStorage.setItem('tallykraft_currentBusinessId', businessId.toString());
  };

  // ── CRUD — all synchronous, single debounced write ─────────────────────────

  const addItem = (table, item) => {
    if (!isBusinessActive(currentBusinessIdRef.current)) return false;
    if (!item || typeof item !== 'object') return false;

    const tablesRequiringBusinessId = ['parties', 'items', 'sales', 'purchases', 'expenses', 'payments', 'opticals', 'estimates', 'creditNotes', 'debitNotes', 'deliveryNotes', 'journalEntries', 'cashEntries'];
    if (tablesRequiringBusinessId.includes(table) && !item.businessId) return false;

    if (table === 'sales' || table === 'purchases') {
      if (!item.items || !Array.isArray(item.items) || item.items.length === 0) return false;
      const validItems = item.items.filter(i => (i.itemId || i.name?.trim()) && Number(i.qty) > 0);
      if (validItems.length === 0) return false;
      if (!item.totalAmount || item.totalAmount <= 0) return false;
    }
    if (table === 'parties') {
      if (!item.name?.trim()) return false;
      if (!item.type || (item.type !== 'Customer' && item.type !== 'Vendor')) return false;
    }
    if (table === 'items' && !item.name?.trim()) return false;
    if (table === 'payments' && (!item.partyId || !item.totalAmount || item.totalAmount <= 0)) return false;
    if (table === 'expenses' && (!item.amount || item.amount <= 0 || !item.date || !item.category)) return false;
    if (table === 'cashEntries' && (!item.amount || item.amount <= 0 || !item.date || !['in','out','bank_in','bank_out'].includes(item.type))) return false;

    const newItem = { ...item, id: item.id || Date.now() };
    applyMutation(table, [...(dataRef.current[table] || []), newItem]);
    return true;
  };

  // Bulk-insert: validates each item with the same rules as addItem, appends all
  // valid ones in a single applyMutation (one state update, one persist write).
  // Returns { saved, skipped } counts.
  const addItems = (table, items) => {
    if (!isBusinessActive(currentBusinessIdRef.current)) return { saved: 0, skipped: items.length };
    const valid = [];
    let skipped = 0;
    const now = Date.now();
    items.forEach((item, i) => {
      if (!item || typeof item !== 'object') { skipped++; return; }
      if (table === 'parties') {
        if (!item.name?.trim() || !item.type || (item.type !== 'Customer' && item.type !== 'Vendor')) { skipped++; return; }
      }
      if (table === 'items' && !item.name?.trim()) { skipped++; return; }
      valid.push({ ...item, id: item.id || (now + i) });
    });
    if (valid.length) {
      applyMutation(table, [...(dataRef.current[table] || []), ...valid]);
    }
    return { saved: valid.length, skipped };
  };

  const updateItem = (table, id, updates) => {
    if (!isBusinessActive(currentBusinessIdRef.current)) return false;
    const newTableData = (dataRef.current[table] || []).map(
      item => item.id === id ? { ...item, ...updates } : item
    );
    applyMutation(table, newTableData);
    return true;
  };

  const deleteItem = (table, id) => {
    if (!isBusinessActive(currentBusinessIdRef.current)) return false;
    applyMutation(table, (dataRef.current[table] || []).filter(item => item.id !== id));
    return true;
  };

  const getItems = useCallback((table) => data[table] || [], [data]);
  const getItem = useCallback((table, id) => (data[table] || []).find(item => item.id === id), [data]);

  // ── Local backup snapshot helpers ─────────────────────────────────────────
  const createLocalBackup = useCallback(async (label = '') => {
    if (!currentUser?.uid) return { success: false, error: 'Not authenticated' };
    try {
      const bKey = String(currentBusinessIdRef.current || currentBusinessId);
      const biz = allDataRef.current[bKey] || allBusinessData[bKey];
      if (!biz) return { success: false, error: 'No current business data' };
      const snapshot = await createBackupSnapshot(currentUser.uid, currentUser.email, { [bKey]: biz }, label);
      return { success: true, snapshot };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, [currentUser, allBusinessData, currentBusinessId]);

  const listLocalBackups = useCallback(async () => {
    if (!currentUser?.uid) return [];
    return listBackupSnapshots(currentUser.uid);
  }, [currentUser]);

  const restoreFromLocalBackup = useCallback(async (id) => {
    if (!currentUser?.uid) return { success: false, error: 'Not authenticated' };
    try {
      const backup = await getBackupSnapshot(id);
      if (!backup?.data) return { success: false, error: 'Backup not found' };
      return restoreFromFile(backup.data);
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, [currentUser]); // restoreFromFile is stable

  const deleteLocalBackup = useCallback(async (id) => {
    try {
      await deleteBackupSnapshot(id);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, []);

  // Wipe ALL on-device data for the current user: the working data store and
  // every local backup snapshot. Does NOT touch any cloud copy. Resets the app
  // to a single fresh business.
  const clearAllLocalData = useCallback(async () => {
    if (!currentUser?.uid) return { success: false, error: 'Not signed in' };
    try {
      await clearLocalData(currentUser.uid);
      // Remove any local backup snapshots too.
      try {
        const snaps = await listBackupSnapshots(currentUser.uid);
        for (const s of (snaps || [])) { await deleteBackupSnapshot(s.id).catch(() => {}); }
      } catch { /* snapshots store may be empty */ }

      // Reset in-memory state to a fresh default business.
      const fresh = createDefaultBusinessData();
      allDataRef.current = fresh;
      setAllBusinessData(fresh);
      currentBusinessIdRef.current = 1;
      setCurrentBusinessId(1);
      dataRef.current = fresh['1'].data;
      setData(fresh['1'].data);
      localStorage.setItem('tallykraft_currentBusinessId', '1');
      chunkCountsRef.current = {};
      await setLocalData(currentUser.uid, fresh);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, [currentUser]); // createDefaultBusinessData is stable within render

  // ── Business management ────────────────────────────────────────────────────

  const applyAllDataMutation = useCallback((newAll) => {
    allDataRef.current = newAll;
    isUpdatingDataRef.current = true;
    setAllBusinessData(newAll);
    // Business-level change (add/rename/delete) — force a full rewrite so
    // the new business meta and all its tables land in Firestore correctly.
    dirtyTablesRef.current.clear();
    schedulePersist();
    setTimeout(() => { isUpdatingDataRef.current = false; }, 100);
  }, [schedulePersist]);

  const addBusiness = (businessData) => {
    if (!currentUser || !isAuthorized) return false;
    if (!businessData.name?.trim()) return false;

    const existingIds = Object.values(allDataRef.current).map(b => b.id);
    const newId = Math.max(...existingIds, 0) + 1;
    const newBusiness = {
      id: newId,
      name: businessData.name.trim(),
      gstNumber: businessData.gstNumber || '',
      address: businessData.address || '',
      phone: businessData.phone || '',
      email: businessData.email || '',
      state: businessData.state || 'Unknown',
      logo: businessData.logo || '',
      qrCode: businessData.qrCode || '',
      username: businessData.username || '',
      password: businessData.password || '',
      openingCash: Number(businessData.openingCash) || 0,
      data: {
        parties: [], items: [], sales: [], purchases: [], expenses: [],
        opticals: [], payments: [], settings: [], estimates: [],
        creditNotes: [], debitNotes: [], deliveryNotes: [], journalEntries: []
      }
    };
    applyAllDataMutation({ ...allDataRef.current, [String(newId)]: newBusiness });
    return newId;
  };

  const updateBusiness = (businessId, updates) => {
    if (!currentUser || !isAuthorized) return false;
    const bKey = String(businessId);
    if (!allDataRef.current[bKey]) return false;
    const updated = {
      ...allDataRef.current,
      [bKey]: {
        ...allDataRef.current[bKey],
        ...updates,
        name: updates.name?.trim() || allDataRef.current[bKey].name
      }
    };
    applyAllDataMutation(updated);
    return updated;
  };

  const deleteBusiness = (businessId) => {
    if (!currentUser || !isAuthorized) return false;
    const bKey = String(businessId);
    if (!allDataRef.current[bKey]) return false;
    const updated = { ...allDataRef.current };
    delete updated[bKey];
    applyAllDataMutation(updated);
    return true;
  };

  return (
    <DataContext.Provider value={{
      data,
      loading,
      saving,
      addItem,
      addItems,
      updateItem,
      deleteItem,
      getItems,
      getItem,
      reloadData: loadAllData,
      allBusinessData,
      backupNow,
      updateCurrentBusinessId,
      currentBusinessId,
      addBusiness,
      updateBusiness,
      deleteBusiness,
      backupToFirestore,
      pushBusinessToCloud,
      deleteBusinessFromCloud,
      restoreFromFirestore,
      restoreFromFile,
      createLocalBackup,
      listLocalBackups,
      restoreFromLocalBackup,
      deleteLocalBackup,
      clearAllLocalData
    }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};
