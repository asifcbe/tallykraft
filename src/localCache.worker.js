/**
 * Dedicated Web Worker for the large "businessData" IndexedDB writes.
 *
 * Why: IDBObjectStore.put() structured-clones its argument SYNCHRONOUSLY on
 * the calling thread. The app calls setLocalData with the ENTIRE
 * allBusinessData blob (every business × every table) on every save, so at
 * real-world scale (20k+ invoices, 5k+ items) that clone is a measurable
 * main-thread hitch right when the UI needs to feel responsive. The main
 * thread already defers this to an idle callback (queueLocalWrite), but the
 * clone itself still lands on the UI thread whenever that idle slot fires.
 *
 * Moving just the put() into a worker means the structured-clone happens
 * off-thread. The DB name/schema is IDENTICAL to indexedDB.js's — this
 * worker opens the same TallyKraftDB and writes the same record shape — so
 * there is NO migration and the main thread can still read/write directly
 * whenever it wants (e.g. if the worker fails to spawn). Reads stay on the
 * main thread; only these two large writes are offloaded.
 */

const DB_NAME = 'TallyKraftDB';
const DB_VERSION = 1;
const STORE_NAME = 'businessData';
const IMAGES_STORE_NAME = 'referenceImages';
const REQUIRED_STORES = [STORE_NAME, IMAGES_STORE_NAME];

let dbPromise = null;

function createMissingStores(db) {
  if (!db.objectStoreNames.contains(STORE_NAME)) {
    db.createObjectStore(STORE_NAME, { keyPath: 'userId' });
  }
  if (!db.objectStoreNames.contains(IMAGES_STORE_NAME)) {
    const store = db.createObjectStore(IMAGES_STORE_NAME, { keyPath: 'id' });
    store.createIndex('recordId', 'recordId', { unique: false });
  }
}

function openWith(versionOrNull) {
  return new Promise((resolve, reject) => {
    const req = versionOrNull != null
      ? indexedDB.open(DB_NAME, versionOrNull)
      : indexedDB.open(DB_NAME);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = (e) => createMissingStores(e.target.result);
    req.onsuccess = () => resolve(req.result);
  });
}

async function getExistingVersion() {
  try {
    if (typeof indexedDB.databases !== 'function') return null;
    const dbs = await indexedDB.databases();
    const found = dbs.find((d) => d && d.name === DB_NAME);
    return found ? found.version : null;
  } catch {
    return null;
  }
}

async function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    const existing = await getExistingVersion();
    const initial = typeof existing === 'number' ? Math.max(DB_VERSION, existing) : null;
    const db = await openWith(initial);
    if (REQUIRED_STORES.every((s) => db.objectStoreNames.contains(s))) return db;
    db.close();
    const forced = typeof existing === 'number' ? existing + 1 : DB_VERSION + 1;
    return openWith(forced);
  })();
  return dbPromise;
}

function setLocalData(userId, businessData, syncState) {
  const { pendingSync = false, dirtyTables = [], deletedBizIds = [] } = syncState || {};
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put({
          userId,
          data: businessData,
          updatedAt: new Date().toISOString(),
          pendingSync,
          dirtyTables,
          deletedBizIds,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

function markSynced(userId) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const getReq = store.get(userId);
        getReq.onsuccess = () => {
          const existing = getReq.result;
          if (existing) {
            store.put({ ...existing, pendingSync: false, dirtyTables: [], deletedBizIds: [] });
          }
        };
        getReq.onerror = () => reject(getReq.error);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

self.onmessage = async (e) => {
  const { id, op, args } = e.data || {};
  try {
    if (op === 'setLocalData') {
      await setLocalData(args.userId, args.businessData, args.syncState);
    } else if (op === 'markSynced') {
      await markSynced(args.userId);
    } else {
      throw new Error(`localCache.worker: unknown op "${op}"`);
    }
    self.postMessage({ id, ok: true });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err?.message || String(err) });
  }
};
