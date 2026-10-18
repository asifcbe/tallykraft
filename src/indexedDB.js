/**
 * IndexedDB layer for BillDheko - primary local storage.
 * No Firestore/backend calls except login. Backup to online is explicit (Backup page).
 * NOTE: the DB name below is intentionally kept as the legacy "TallyKraftDB" so
 * existing users' locally-stored data is not orphaned by the rebrand.
 */
const DB_NAME = 'TallyKraftDB';
// NOTE:
// IndexedDB version numbers are not allowed to go backwards.
// If a user previously ran a build that created the DB with a higher version
// and we now open with a lower version, the browser throws:
// "The requested version (x) is less than the existing version (y)".
//
// We keep a minimum expected version, but we will open with the existing
// version when available to avoid downgrades.
const DB_VERSION = 1;
const STORE_NAME = 'businessData';
// Reference-image attachments (Sales/Purchases, up to 5 per record) — local-
// only, never synced to Firestore (see referenceImages.js). Added as a
// second object store in the SAME database rather than a new database, so it
// rides the exact same self-healing "missing store → forced version bump"
// logic below instead of duplicating openDB()'s downgrade-avoidance dance.
const IMAGES_STORE_NAME = 'referenceImages';
const REQUIRED_STORES = [STORE_NAME, IMAGES_STORE_NAME];

let dbInstance = null;

async function getExistingDbVersion() {
  // `indexedDB.databases()` is supported in modern Chromium/Edge.
  // If unavailable, we'll just fall back to opening without specifying a version.
  try {
    if (typeof indexedDB.databases !== 'function') return null;
    const dbs = await indexedDB.databases();
    const found = dbs.find(d => d && d.name === DB_NAME);
    return found ? found.version : null;
  } catch (_) {
    return null;
  }
}

function createMissingStores(db) {
  if (!db.objectStoreNames.contains(STORE_NAME)) {
    db.createObjectStore(STORE_NAME, { keyPath: 'userId' });
  }
  if (!db.objectStoreNames.contains(IMAGES_STORE_NAME)) {
    const store = db.createObjectStore(IMAGES_STORE_NAME, { keyPath: 'id' });
    // Looked up by the sale/purchase record's id when loading an invoice's
    // attached images, and when purging images on record delete.
    store.createIndex('recordId', 'recordId', { unique: false });
  }
}

async function openDB() {
  if (dbInstance) return dbInstance;

  const existingVersion = await getExistingDbVersion();
  const initialVersion =
    typeof existingVersion === 'number' ? Math.max(DB_VERSION, existingVersion) : null;

  const openWith = (versionOrNull) =>
    new Promise((resolve, reject) => {
      const request =
        versionOrNull != null ? indexedDB.open(DB_NAME, versionOrNull) : indexedDB.open(DB_NAME);

      request.onerror = () => reject(request.error);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        createMissingStores(db);
      };
      request.onsuccess = () => resolve(request.result);
    });

  // 1) Open with existing/current version (avoid downgrades).
  // 2) If any required objectStore is missing, force an upgrade by bumping
  //    version by +1 so `onupgradeneeded` runs and we can create it. This
  //    covers both a brand-new DB and an existing user's DB (created before
  //    the referenceImages store existed) transparently.
  try {
    const db = await openWith(initialVersion);
    if (REQUIRED_STORES.every(s => db.objectStoreNames.contains(s))) {
      dbInstance = db;
      return dbInstance;
    }

    // A required store is missing: force upgrade.
    db.close();
    const forcedVersion =
      typeof existingVersion === 'number' ? existingVersion + 1 : DB_VERSION + 1;
    const dbAfterUpgrade = await openWith(forcedVersion);
    const stillMissing = REQUIRED_STORES.filter(s => !dbAfterUpgrade.objectStoreNames.contains(s));
    if (stillMissing.length > 0) {
      throw new Error(
        `IndexedDB opened but store(s) still missing after upgrade: ${stillMissing.join(', ')}`
      );
    }
    dbInstance = dbAfterUpgrade;
    return dbInstance;
  } catch (err) {
    // If we can't upgrade (e.g., version downgrade), advise the user to clear IndexedDB.
    throw new Error(
      `${err?.message || err}\n` +
        `If this persists, clear your browser's IndexedDB for this app and try restoring again.`
    );
  }
}

/**
 * Get stored data for a user (all businesses). Returns null if not found.
 * @param {string} userId - Firebase Auth UID
 */
export async function getLocalData(userId) {
  if (!userId) return null;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(userId);
    req.onsuccess = () => resolve(req.result?.data ?? null);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Get the full stored record for a user, including pending-sync state.
 * @param {string} userId - Firebase Auth UID
 * @returns {Promise<{userId, data, updatedAt, pendingSync, dirtyTables}|null>}
 */
export async function getLocalRecord(userId) {
  if (!userId) return null;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(userId);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

// ─── Off-main-thread write offload ───────────────────────────────────────────
// IDBObjectStore.put() structured-clones its arg SYNCHRONOUSLY on the calling
// thread. setLocalData is called with the ENTIRE allBusinessData blob on every
// save; at scale (20k+ invoices) that clone is a real main-thread hitch.
// localCache.worker.js opens the SAME database/schema and does the put()
// there instead, so the clone happens off-thread. Everything degrades
// gracefully to the direct main-thread path if the worker can't spawn
// (older browser, blocked, SSR-ish contexts) or a message errors — no
// migration, no schema change, reads untouched.
let cacheWorker = null;
let cacheWorkerDead = false;
const workerPending = new Map(); // id -> { resolve, reject }
let workerMsgId = 0;

function getCacheWorker() {
  if (cacheWorkerDead) return null;
  if (cacheWorker) return cacheWorker;
  try {
    if (typeof Worker === 'undefined') { cacheWorkerDead = true; return null; }
    cacheWorker = new Worker(new URL('./localCache.worker.js', import.meta.url), { type: 'module' });
    cacheWorker.onmessage = (e) => {
      const { id, ok, error } = e.data || {};
      const p = workerPending.get(id);
      if (!p) return;
      workerPending.delete(id);
      if (ok) p.resolve();
      else p.reject(new Error(error || 'localCache worker error'));
    };
    cacheWorker.onerror = () => {
      // Fatal worker error — fail every in-flight request so callers fall
      // back, and stop using the worker for the rest of the session.
      cacheWorkerDead = true;
      cacheWorker = null;
      workerPending.forEach(({ reject }) => reject(new Error('localCache worker crashed')));
      workerPending.clear();
    };
    return cacheWorker;
  } catch {
    cacheWorkerDead = true;
    return null;
  }
}

function runInWorker(op, args) {
  const w = getCacheWorker();
  if (!w) return Promise.reject(new Error('no worker'));
  return new Promise((resolve, reject) => {
    const id = ++workerMsgId;
    workerPending.set(id, { resolve, reject });
    // Safety timeout — a hung worker must not leave the caller's promise
    // pending forever (and thus never fall back).
    setTimeout(() => {
      if (workerPending.has(id)) {
        workerPending.delete(id);
        reject(new Error('localCache worker timeout'));
      }
    }, 8000);
    w.postMessage({ id, op, args });
  });
}

/**
 * Save all business data for a user to IndexedDB.
 * @param {string} userId - Firebase Auth UID
 * @param {Object} businessData - { [businessId]: { id, name, ..., data: { parties, items, ... } } }
 * @param {Object} [syncState] - { pendingSync: boolean, dirtyTables: string[], deletedBizIds: string[] }
 */
export async function setLocalData(userId, businessData, syncState = {}) {
  if (!userId) return;
  try {
    await runInWorker('setLocalData', { userId, businessData, syncState });
    return;
  } catch {
    // fall through to the direct main-thread write
  }
  return setLocalDataDirect(userId, businessData, syncState);
}

async function setLocalDataDirect(userId, businessData, syncState = {}) {
  const db = await openDB();
  const { pendingSync = false, dirtyTables = [], deletedBizIds = [] } = syncState;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({ userId, data: businessData, updatedAt: new Date().toISOString(), pendingSync, dirtyTables, deletedBizIds });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Mark a user's cached data as fully synced (clears pendingSync/dirtyTables)
 * without re-writing the (potentially large) data blob.
 * @param {string} userId - Firebase Auth UID
 */
export async function markSynced(userId) {
  if (!userId) return;
  try {
    await runInWorker('markSynced', { userId });
    return;
  } catch {
    // fall through
  }
  return markSyncedDirect(userId);
}

async function markSyncedDirect(userId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(userId);
    getReq.onsuccess = () => {
      const existing = getReq.result;
      if (!existing) { resolve(); return; }
      store.put({ ...existing, pendingSync: false, dirtyTables: [], deletedBizIds: [] });
    };
    getReq.onerror = () => reject(getReq.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Clear local data for a user (e.g. on logout).
 */
export async function clearLocalData(userId) {
  if (!userId) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(userId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── Reference image attachments (Sales/Purchases) ────────────────────────
// Local-only — never read/written by DataContext.jsx's Firestore sync path.
// Each record: { id, recordId, table ('sales'|'purchases'), businessId,
//                letter (A/B/C/D/E — position among the record's images),
//                fileName, mimeType, blob (Blob), createdAt }.
// `id` is a fresh randomUUID-ish string per image, independent of `recordId`
// so multiple images per invoice each get their own row.

function genImageId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `img_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * Save one reference image blob for a sale/purchase record. Returns the
 * saved image's id.
 */
export async function saveReferenceImage({ recordId, table, businessId, letter, fileName, mimeType, blob }) {
  if (!recordId || !blob) throw new Error('saveReferenceImage requires recordId and blob');
  const db = await openDB();
  const record = {
    id: genImageId(),
    recordId: String(recordId),
    table,
    businessId,
    letter,
    fileName,
    mimeType: mimeType || blob.type || 'image/jpeg',
    blob,
    createdAt: new Date().toISOString(),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMAGES_STORE_NAME, 'readwrite');
    tx.objectStore(IMAGES_STORE_NAME).put(record);
    tx.oncomplete = () => resolve(record.id);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * List every reference image attached to a given sale/purchase record,
 * ordered by letter (A, B, C...).
 */
export async function getReferenceImages(recordId) {
  if (!recordId) return [];
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMAGES_STORE_NAME, 'readonly');
    const idx = tx.objectStore(IMAGES_STORE_NAME).index('recordId');
    const req = idx.getAll(String(recordId));
    req.onsuccess = () => resolve((req.result || []).sort((a, b) => (a.letter || '').localeCompare(b.letter || '')));
    req.onerror = () => reject(req.error);
  });
}

/**
 * Delete a single reference image by its own id.
 */
export async function deleteReferenceImage(imageId) {
  if (!imageId) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMAGES_STORE_NAME, 'readwrite');
    tx.objectStore(IMAGES_STORE_NAME).delete(imageId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Delete every reference image attached to a record (used when the
 * sale/purchase itself is deleted, so orphaned images don't linger).
 */
export async function deleteReferenceImagesForRecord(recordId) {
  if (!recordId) return;
  const images = await getReferenceImages(recordId);
  if (!images.length) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMAGES_STORE_NAME, 'readwrite');
    const store = tx.objectStore(IMAGES_STORE_NAME);
    images.forEach(img => store.delete(img.id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * List every reference image for an entire business — used by the backup
 * export flow to bundle all images into the downloaded zip.
 */
export async function getAllReferenceImagesForBusiness(businessId) {
  if (!businessId) return [];
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMAGES_STORE_NAME, 'readonly');
    const req = tx.objectStore(IMAGES_STORE_NAME).getAll();
    req.onsuccess = () => resolve((req.result || []).filter(img => String(img.businessId) === String(businessId)));
    req.onerror = () => reject(req.error);
  });
}

export default {
  getLocalData, getLocalRecord, setLocalData, markSynced, clearLocalData, openDB,
  saveReferenceImage, getReferenceImages, deleteReferenceImage, deleteReferenceImagesForRecord, getAllReferenceImagesForBusiness,
};

// ─── Local Backup Store (TallyKraftBackups) ───────────────────────────────────
// Separate database dedicated to versioned snapshots. Every user gets backups
// stored locally regardless of whether online backup is enabled.

const BACKUP_DB_NAME = 'TallyKraftBackups';
const BACKUP_DB_VERSION = 1;
const BACKUP_STORE = 'snapshots';
const MAX_BACKUPS_PER_USER = 10;

let backupDbInstance = null;

function openBackupDB() {
  if (backupDbInstance) return Promise.resolve(backupDbInstance);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BACKUP_DB_NAME, BACKUP_DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(BACKUP_STORE)) {
        const store = db.createObjectStore(BACKUP_STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('userId', 'userId', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = (e) => {
      backupDbInstance = e.target.result;
      resolve(backupDbInstance);
    };
  });
}

function pruneOldBackups(userId) {
  openBackupDB().then(db => {
    const tx = db.transaction(BACKUP_STORE, 'readwrite');
    const store = tx.objectStore(BACKUP_STORE);
    const req = store.index('userId').getAll(userId);
    req.onsuccess = () => {
      const all = (req.result || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      if (all.length > MAX_BACKUPS_PER_USER) {
        all.slice(MAX_BACKUPS_PER_USER).forEach(b => store.delete(b.id));
      }
    };
  }).catch(() => {});
}

/**
 * Create a versioned local backup snapshot for the current user.
 * @param {string} userId - Firebase Auth UID
 * @param {string} email - User email (for display)
 * @param {Object} businessData - allBusinessData object
 * @param {string} label - Human-readable label (defaults to current date/time)
 */
export async function createBackupSnapshot(userId, email, businessData, label = '') {
  if (!userId || !businessData) return null;
  const db = await openBackupDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BACKUP_STORE, 'readwrite');
    const store = tx.objectStore(BACKUP_STORE);
    const snapshot = {
      userId,
      email: email || '',
      label: label.trim() || new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
      data: businessData,
      createdAt: new Date().toISOString(),
      sizeBytes: JSON.stringify(businessData).length,
    };
    const addReq = store.add(snapshot);
    addReq.onsuccess = () => {
      snapshot.id = addReq.result;
      pruneOldBackups(userId);
      resolve(snapshot);
    };
    addReq.onerror = () => reject(addReq.error);
  });
}

/**
 * List all backup snapshots for a user (newest first, data field excluded for perf).
 */
export async function listBackupSnapshots(userId) {
  if (!userId) return [];
  const db = await openBackupDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BACKUP_STORE, 'readonly');
    const req = tx.objectStore(BACKUP_STORE).index('userId').getAll(userId);
    req.onsuccess = () => {
      const sorted = (req.result || [])
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map(({ data: _data, ...meta }) => meta); // strip heavy data field for list
      resolve(sorted);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Get a single backup snapshot (including its data) by id.
 */
export async function getBackupSnapshot(id) {
  const db = await openBackupDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(BACKUP_STORE, 'readonly').objectStore(BACKUP_STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Delete a single backup snapshot by id.
 */
export async function deleteBackupSnapshot(id) {
  const db = await openBackupDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BACKUP_STORE, 'readwrite');
    tx.objectStore(BACKUP_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
