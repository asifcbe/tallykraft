import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { firestore } from './db';
import { doc, setDoc, getDoc, deleteDoc, collection, getDocs, writeBatch } from 'firebase/firestore';
import { useAuth } from './AuthContext';
import { useNetwork } from './NetworkContext';
import { getLocalRecord, setLocalData, markSynced } from './indexedDB';
import { ensureUniquCode } from './businessCode';
// BillDheko billing gate: writes are only allowed while the current business
// has an active subscription (trial / paid / admin-granted). SubscriptionContext
// pushes state into this lightweight module so DataContext can read it without a
// circular context dependency.
import { isBusinessActive } from './activeBusinessState';

// randomUUID() is only available on HTTPS/localhost — falls back to a
// manual implementation so the app works on local-network HTTP (192.168.x.x).
const randomUUID = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
};

// Recursively remove undefined values — Firestore rejects payloads containing undefined
const stripUndefined = (obj) => {
  if (Array.isArray(obj)) return obj.map(stripUndefined);
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, stripUndefined(v)])
    );
  }
  return obj;
};

// JSON.stringify is object-key-order sensitive — Firestore's SDK does not
// guarantee it deserializes doc.data() fields back in the same key order
// they were originally written, so a row with identical content but
// different key order would previously compare as "different" and get
// wrongly queued for an unnecessary save on every login. This recursively
// sorts object keys before stringifying so only genuine content
// differences register as a diff.
const canonicalStringify = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

// ── Firestore chunked persistence ────────────────────────────────────────────
// Layout:
//   users/{uid}/biz/{bizId}                — business metadata + _cc chunk-count map
//   users/{uid}/biz/{bizId}/t/{table}_{i}  — table data chunk i

const CHUNK_ROWS = 800;
// Firestore's hard per-document limit is 1MiB; stay well under it so a
// single unusually heavy row (e.g. a sale with many line items) can't push
// a chunk over the edge on its own. Also cap row count per chunk as a floor,
// so many tiny rows don't produce an excessive number of chunk documents.
// 11534336 (the exact byte count in the recurring "Request payload size
// exceeds the limit" error) is precisely 11×1024×1024 — a fixed transport
// ceiling, not a number derived from any particular payload. That's why the
// error repeated byte-for-bit identical across genuinely different code and
// genuinely different data: no JS-side byte estimate was ever going to touch
// it, because the real bug was `schedulePersist` force-passing `dirtyTables:
// null` for staff/business-code sessions — rewriting EVERY table for EVERY
// business on every save regardless of what actually changed (see
// schedulePersist below). Kept the byte budget conservative on top of that
// fix since Firestore's actual wire encoding (protobuf field tags/overhead
// per nested field) runs measurably larger than a flat JSON.stringify count,
// and sales/purchases rows nest an items[] array + GST breakdown + party
// snapshot several levels deep.
const MAX_CHUNK_BYTES = 350 * 1024; // 350KiB — headroom under Firestore's 1MiB per-document cap
// JSON.stringify(x).length counts UTF-16 code units, NOT bytes — every ₹
// symbol, and any Hindi/regional-script name or address (this app is
// India-focused), is 1 JS string char but 3+ UTF-8 bytes on the wire. That
// gap meant chunks/batches were sized using an undercount, so real payloads
// could still burst past Firestore's byte limits even though the row/op
// counts looked safely under threshold — exactly the "still exceeds the
// limit at the same byte count" symptom. Measure real UTF-8 bytes instead.
const utf8Bytes = (str) => new TextEncoder().encode(str).length;
// Cheap 32-bit string hash (djb2) — used to fingerprint each chunk's content
// so firestoreWriteAll can skip re-uploading chunks that didn't actually
// change. With 16k+ row tables (e.g. a business with thousands of invoices),
// re-chunking is positional: editing one row only shifts chunk *contents*
// for that one chunk (occasionally its neighbour, if the edit changed the
// row's byte size enough to push content across the boundary) — everything
// else re-chunks to byte-identical output. Hashing lets us detect "identical"
// cheaply without diffing full arrays or holding previous chunk content in
// memory.
const hashStr = (str, seed = 5381) => {
  let h = seed;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return h;
};
// chunkRowsBySize also returns each chunk's content hash, computed
// incrementally from the SAME per-row JSON.stringify() already needed for
// byte-sizing — avoids a second full re-stringify of every row (previously
// done via canonicalStringify(chunk) in a separate pass) on every save.
// Plain JSON.stringify (not canonicalStringify's key-sorted version) is
// safe here: both sides of every hash comparison are produced by this same
// function from our own in-memory JS objects in the same session, never
// from a Firestore read (which is the only place key order isn't
// guaranteed) — so key-order determinism is already guaranteed for free.
//
// rowJsonCache (WeakMap<originalRow, {clean, json, bytes}>) is the fix for
// "saving one invoice in a 20k-row sales table is slow": applyMutation/
// updateItem/deleteItem all build the new table array via spread/map/filter
// over the PREVIOUS array, so every row that wasn't the one being edited
// keeps its exact same object reference. Without this cache, every save
// ran stripUndefined (allocates a new object per row) + JSON.stringify on
// all 20,000 rows just to re-derive chunk boundaries and hashes —
// synchronous, main-thread, and scaling with total table size instead of
// the size of the actual edit. Keyed on the ORIGINAL (pre-strip) row
// reference so a cache hit skips both stripUndefined and JSON.stringify
// entirely; only the handful of rows whose reference actually changed
// (realistically just the 1 edited row, occasionally its neighbours if a
// chunk boundary shifts) pay that cost. Passed in per-call (not a
// module-level singleton) so it's scoped to the DataProvider instance and
// can't leak across accounts/sessions.
const chunkRowsBySize = (rows, rowJsonCache) => {
  const chunks = [];
  let current = [];
  let currentBytes = 2; // "[]"
  let currentHash = 5381;
  for (const row of rows) {
    let cached = rowJsonCache?.get(row);
    if (!cached) {
      const clean = stripUndefined(row);
      const json = JSON.stringify(clean);
      cached = { clean, json, bytes: utf8Bytes(json) + 1 };
      rowJsonCache?.set(row, cached);
    }
    const { clean, json, bytes: rowBytes } = cached;
    const wouldExceed = current.length > 0 && (currentBytes + rowBytes > MAX_CHUNK_BYTES || current.length >= CHUNK_ROWS);
    if (wouldExceed) {
      chunks.push({ rows: current, hash: currentHash.toString(36) });
      current = [];
      currentBytes = 2;
      currentHash = 5381;
    }
    current.push(clean);
    currentBytes += rowBytes;
    currentHash = hashStr(json, currentHash);
  }
  if (current.length > 0) chunks.push({ rows: current, hash: currentHash.toString(36) });
  return chunks;
};
// Exported so consumers (e.g. Settings.jsx's "Delete All Business Data")
// don't hand-duplicate this list — a duplicated copy previously drifted out
// of sync (used 'journal'/'membership' instead of the real
// 'journalEntries'/'memberships' table names, and was missing
// opticalOrders/opticalSettings/customSectionRecords/settings/staffMembers/
// staffAttendance/staffSalary entirely), silently leaving those tables
// untouched by "Delete All Data."
// A new item's stock at creation is its OPENING stock. `stock` itself moves
// with every sale/purchase afterwards, so the opening quantity, its cost and
// date are captured once here (every creation path — item form, Bulk Add,
// Import, Migrate — goes through addItem/addItems) for the Opening Stock
// report and Stock Summary.
const openingStockStamp = (table, item) => {
  if (table !== 'items' || item.openingStock !== undefined) return {};
  if (item.itemType === 'service' || item.type === 'service' || item.isMembership) return {};
  return {
    openingStock: Number(item.stock) || 0,
    openingStockRate: Number(item.purchasePrice) || 0,
    openingStockDate: new Date().toISOString().split('T')[0],
  };
};

export const ALL_TABLES = [
  'parties','items','sales','purchases','expenses','payments','estimates',
  'creditNotes','debitNotes','deliveryNotes','journalEntries','orders',
  'opticals','opticalOrders','opticalSettings','customSectionRecords','settings','memberships',
  'cashEntries','staffMembers','staffAttendance','staffSalary','investors',
  'notes', // Dashboard notes / whiteboard
];
// `logo` is deliberately excluded — a user-uploaded image kept device-local
// only (never synced to Firestore), so it doesn't inflate Firestore
// writes/reads or leave this device. See LOCAL_ONLY_BIZ_KEYS below, which
// reconcileRemoteWithLocalInner uses to make sure a remote read (which will
// never carry it) can't wipe out what's saved locally either. `qrCode` used
// to be a second uploaded image here too, but the payment QR is now
// generated on the fly from the (normally-synced) `upiId` field instead —
// see upiUtils.js/UpiQrImage.jsx — so there's no image to keep local-only.
const BIZ_META_KEYS = [
  'id','name','gstNumber','address','phone','email','state',
  'fyStartMonth','needsSetup','password','username',
  'openingCash','openingBank','firestoreBizDocId',
  'bankName','bankAccount','ifscCode','accountHolder','upiId','upiNumber',
];
const LOCAL_ONLY_BIZ_KEYS = ['logo'];

// Cheap "did anything change?" probe for the periodic background sync.
// Reads ONLY the small per-business `biz/{bizId}` metadata docs (each holds
// the `_cc` chunk-count map, business profile fields and a monotonically
// increasing `_rev` counter — see firestoreWriteAll) and returns
// { [bizId]: rev }. It deliberately does NOT touch the `t/` chunk
// subcollections, so a poll tick that finds nothing changed costs N tiny
// reads (N = number of businesses, almost always 1) and a few dozen bytes
// of egress, instead of re-downloading every table's every chunk (~12
// reads + ~200KB) every 45s forever. Only when a rev actually differs from
// what this device last saw does syncFromCloud fall through to the full
// firestoreReadAll + reconcile path.
const firestoreReadRevs = async (uid) => {
  try {
    const bizSnap = await getDocs(collection(firestore, 'users', uid, 'biz'));
    if (bizSnap.empty) return null;
    const revs = {};
    bizSnap.docs.forEach((d) => { revs[d.id] = d.data()?._rev || 0; });
    return revs;
  } catch (err) {
    console.error('firestoreReadRevs failed:', err);
    return null;
  }
};

const firestoreReadAll = async (uid, cc, revsOut = null) => {
  try {
    const bizColl = collection(firestore, 'users', uid, 'biz');
    const bizSnap = await getDocs(bizColl);

    if (!bizSnap.empty) {
      const allData = {};
      for (const bizDoc of bizSnap.docs) {
        const bizId = bizDoc.id;
        const meta = bizDoc.data();
        if (cc) cc[bizId] = meta._cc || {};
        // Capture the current `_rev` so the caller can seed lastSeenRevsRef
        // and the cheap poll (firestoreReadRevs) can then short-circuit
        // future ticks until this business is actually written again.
        if (revsOut) revsOut[bizId] = meta._rev || 0;

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

    // Fall back to old flat format
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

// chunkHashes: { [bizId]: { [table]: string[] } } — last-written hash per
// chunk index, kept by the caller (chunkHashesRef in DataProvider) across
// calls. Lets firestoreWriteAll skip re-uploading a chunk whose content is
// byte-identical to what's already in Firestore. Without this, editing a
// single invoice in a 16k-row sales table re-chunks and re-writes every
// chunk in the table on every save (the actual cause of "adding/updating an
// invoice takes so long" with a large table) — chunking is positional, so in
// practice only the one or two chunks actually containing the changed row(s)
// come out with a different hash; everything before/after re-chunks to
// byte-identical output and is now skipped entirely.
// revsRef (optional): { [bizId]: number } — the caller's record of the last
// `_rev` value each business was written with / read at. firestoreWriteAll
// bumps `_rev` by 1 for every business it actually writes and updates this
// map in place AFTER all batches commit, so the device that just wrote knows
// the new value and its own next poll tick won't see a "changed" rev and
// pointlessly re-pull data it already has.
// A single business's data is ultimately just chunk docs under one biz —
// there's no hard Firestore limit on their *combined* size, but the
// periodic sync / initial load / cloud backup all pull the whole thing, so
// a runaway business is what makes per-user infra cost unpredictable.
// Crossing this only raises a non-blocking advisory (see setSyncWarning).
const SOFT_SIZE_WARN_BYTES = 2 * 1024 * 1024;

const firestoreWriteAll = async (uid, allData, cc, dirtyTables = null, chunkHashes = null, dirtyBizIds = null, rowJsonCache = null, revsRef = null) => {
  const ops = [];
  const pendingRevBumps = revsRef ? [] : null;
  // Scope the loop below to only the business(es) actually touched, when known
  // — otherwise (business-level ops like add/delete business, or callers that
  // don't track per-business dirt) fall back to processing every business, same
  // as before. Without this, editing ONE invoice in a small business still paid
  // the full CPU cost (re-stringify + re-hash every row) of every OTHER
  // business under the same account on every single save, even though the
  // per-chunk hash cache meant none of that work ever resulted in an actual
  // Firestore write for the untouched businesses. See applyMutation/
  // deleteManyItems, which now pass the specific bizId key they mutated.
  const entriesToProcess = dirtyBizIds
    ? Object.entries(allData).filter(([bizId]) => dirtyBizIds.has(bizId))
    : Object.entries(allData);
  // Unlike `cc` (chunk counts — only affects pagination bookkeeping if
  // stale), chunkHashes directly gates whether a chunk gets written at all.
  // Applying it optimistically (before batch.commit() succeeds) would mean
  // a failed/partial commit permanently marks unwritten chunks as "already
  // matches remote" — a retry would recompute the same hash, compare against
  // the already-overwritten cache, wrongly conclude nothing changed, and
  // silently never write that data. So hash updates are staged here and only
  // merged into the real cache after every batch below has committed.
  const pendingHashUpdates = chunkHashes ? [] : null;

  for (const [bizId, biz] of entriesToProcess) {
    const prevCC = cc?.[bizId] || {};
    const newCC = { ...prevCC };
    const bizData = biz.data || {};
    const prevHashes = chunkHashes ? (chunkHashes[bizId] || {}) : null;

    const tablesToWrite = dirtyTables
      ? ALL_TABLES.filter(t => dirtyTables.has(t))
      : ALL_TABLES;

    for (const table of tablesToWrite) {
      const rows = bizData[table] || [];
      // Chunk boundaries by BYTE size, not a fixed row count — a fixed
      // 800-rows/chunk assumed every table's rows are similarly light, but
      // sales/purchases rows carry a nested items[] array, GST breakdown and
      // party snapshot and can be far heavier than a parties/items row. A
      // heavy table could produce a single chunk doc over Firestore's 1MiB
      // per-document limit even though it "looked" fine by row count. The
      // read side (firestoreReadAll) just concatenates chunk 0..maxIdx in
      // order regardless of how many rows are in each one, so chunk sizing
      // can safely vary here without any read-side change.
      const tableRowCache = rowJsonCache ? (rowJsonCache[bizId] ||= {})[table] ||= new WeakMap() : null;
      const chunkedRows = chunkRowsBySize(rows, tableRowCache);
      const newCount = chunkedRows.length;
      newCC[table] = newCount;
      const prevCount = prevCC[table] || 0;
      const prevTableHashes = prevHashes ? (prevHashes[table] || []) : null;
      const newTableHashes = [];

      chunkedRows.forEach(({ rows: chunk, hash }, ci) => {
        newTableHashes[ci] = hash;
        if (prevTableHashes && prevTableHashes[ci] === hash) return; // unchanged — skip write
        ops.push({
          type: 's',
          ref: doc(firestore, 'users', uid, 'biz', bizId, 't', `${table}_${ci}`),
          data: { d: chunk },
        });
      });
      if (pendingHashUpdates) pendingHashUpdates.push([bizId, table, newTableHashes]);
      for (let ci = newCount; ci < prevCount; ci++) {
        ops.push({ type: 'd', ref: doc(firestore, 'users', uid, 'biz', bizId, 't', `${table}_${ci}`) });
      }
    }

    const meta = {};
    BIZ_META_KEYS.forEach(k => { if (biz[k] !== undefined) meta[k] = biz[k]; });
    meta._cc = { ...newCC };
    // Monotonic change counter — bumped on every write so another device's
    // cheap poll (firestoreReadRevs) can tell "something changed here" from
    // "nothing changed" without reading any chunk data. Seeded from the
    // caller's last-known value (revsRef) rather than a Firestore read so we
    // don't pay an extra read per save just to increment it; a rare lost
    // increment (two devices racing) only ever causes one redundant full
    // sync on the other device, never data loss.
    if (revsRef) {
      const nextRev = (revsRef[bizId] || 0) + 1;
      meta._rev = nextRev;
      pendingRevBumps.push([bizId, nextRev]);
    }
    ops.push({ type: 's', ref: doc(firestore, 'users', uid, 'biz', bizId), data: meta });

    if (cc) cc[bizId] = newCC;
  }

  // Firestore batches are capped at both 500 ops AND ~10MiB total request
  // size. Chunking purely by op count (old: 499/batch) ignores the byte
  // limit entirely — a batch of large sales/purchase chunk docs (each row
  // carries a nested items[] array, GST breakdown, party info, etc.) could
  // still exceed 10MiB well under 499 ops, which is exactly what a big bulk
  // Excel import of sales/purchases triggered ("Request payload size
  // exceeds the limit: 11534336 bytes"). That failed batch.commit() throws,
  // schedulePersist's write never completes, dirty state is correctly kept
  // (so nothing is lost) — but the data then never reaches Firestore even
  // though it saved fine to IndexedDB, matching "saving locally but not
  // online." Now batches split on whichever limit is hit first.
  const MAX_BATCH_OPS = 499;
  // Lowered from 9MiB — Firestore's actual wire encoding (field names,
  // per-document/per-field protobuf overhead) runs measurably larger than
  // raw JSON, on top of what was already an undercount before the UTF-8 fix
  // above. More headroom here costs nothing but an extra batch or two.
  const MAX_BATCH_BYTES = 3 * 1024 * 1024; // 3MiB — real wire size runs well above a raw JSON.stringify estimate, so budget far below the ~10-11MiB transport ceiling rather than just under it
  const estimateOpBytes = (op) => op.type === 's' ? utf8Bytes(JSON.stringify(op.data)) : 64;

  let batch = writeBatch(firestore);
  let batchOps = 0;
  let batchBytes = 0;
  for (const op of ops) {
    const opBytes = estimateOpBytes(op);
    if (batchOps > 0 && (batchOps >= MAX_BATCH_OPS || batchBytes + opBytes > MAX_BATCH_BYTES)) {
      await batch.commit();
      batch = writeBatch(firestore);
      batchOps = 0;
      batchBytes = 0;
    }
    if (op.type === 's') batch.set(op.ref, op.data);
    else batch.delete(op.ref);
    batchOps++;
    batchBytes += opBytes;
  }
  if (batchOps > 0) await batch.commit();

  // All batches committed successfully — now safe to record these chunks as
  // matching remote. See the note above: doing this any earlier risks a
  // failed commit permanently hiding real changes from future retries.
  if (pendingHashUpdates) {
    for (const [bizId, table, newTableHashes] of pendingHashUpdates) {
      (chunkHashes[bizId] ||= {})[table] = newTableHashes;
    }
  }
  // Same "only after every batch committed" reasoning for the rev map — if a
  // commit failed, the `_rev` field never landed in Firestore, so this
  // device must NOT record the bumped value locally either (otherwise its
  // next poll would compare a locally-bumped rev against the un-bumped
  // remote one, see them equal, and skip re-syncing data that never
  // actually reached the cloud).
  if (pendingRevBumps) {
    for (const [bizId, nextRev] of pendingRevBumps) revsRef[bizId] = nextRev;
  }
};

const firestoreDeleteBusiness = async (uid, bizId, cc) => {
  // Build the chunk doc refs straight from the known chunk counts (`_cc`,
  // loaded with the business and kept current by every write) — no read.
  // The old version did getDocs() on the whole `t` subcollection first, which
  // DOWNLOADS every chunk's full data (the entire business — every invoice,
  // item, party) just to learn the doc ids to delete; that round-trip was most
  // of why deleting a large business took so long. Only when the counts are
  // unknown (e.g. business never loaded this session) do we fall back to the
  // listing read.
  const known = cc?.[bizId];
  let refs;
  if (known && Object.keys(known).length) {
    refs = [];
    Object.entries(known).forEach(([table, count]) => {
      for (let ci = 0; ci < (Number(count) || 0); ci++) {
        refs.push(doc(firestore, 'users', uid, 'biz', bizId, 't', `${table}_${ci}`));
      }
    });
  } else {
    const tSnap = await getDocs(collection(firestore, 'users', uid, 'biz', bizId, 't'));
    refs = tSnap.docs.map(d => d.ref);
  }
  refs.push(doc(firestore, 'users', uid, 'biz', bizId));

  // Independent batches committed in parallel (not one after another).
  const commits = [];
  for (let i = 0; i < refs.length; i += 499) {
    const batch = writeBatch(firestore);
    refs.slice(i, i + 499).forEach(ref => batch.delete(ref));
    commits.push(batch.commit());
  }
  await Promise.all(commits);
  if (cc) delete cc[bizId];
};

const WRITE_DEBOUNCE_MS = 400;

// IDBObjectStore.put() structured-clones its argument SYNCHRONOUSLY on the
// calling thread before the transaction is even queued — it is not
// offloaded to a worker. applyMutation/deleteManyItems call setLocalData
// with the ENTIRE allBusinessData blob (every business × every table)
// immediately (not debounced, unlike the Firestore path) on every single
// save, so at real-world scale (e.g. 20k invoices + 5k items) that clone
// was real, main-thread, synchronous-feeling cost paid on every invoice
// save before the UI could even register the click. setLocalData is
// already fire-and-forget (.catch(), never awaited by any caller) so
// deferring it costs nothing correctness-wise — it still lands within a
// tick or two, long before any realistic reload — while letting the
// triggering click/dialog-close paint first. Also coalesces bursts (bulk
// add/edit loops that call applyMutation many times in a row) into a
// single clone of the final state instead of one per intermediate step.
const scheduleIdle = typeof requestIdleCallback === 'function'
  ? (fn) => requestIdleCallback(fn, { timeout: 500 })
  : (fn) => setTimeout(fn, 0);

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
  orders: [],
  memberships: [],
  cashEntries: [],
  staffMembers: [],
  staffAttendance: [],
  staffSalary: [],
  investors: [],
  notes: [],
});

// Transaction tables whose new records get a `createdBy` stamp (see
// creatorStamp inside DataProvider).
const CREATOR_TRACKED_TABLES = new Set([
  'sales', 'purchases', 'estimates', 'orders', 'creditNotes', 'debitNotes',
  'deliveryNotes', 'payments', 'expenses',
]);

export const DataProvider = ({ children }) => {
  const { currentUser, isAuthorized, staffSession, loading: authLoading } = useAuth();
  const { isOnline } = useNetwork();
  const [data, setData] = useState(emptyData());
  const [allBusinessData, setAllBusinessData] = useState({});
  const [loading, setLoading] = useState(true);
  const [currentBusinessId, setCurrentBusinessId] = useState(null);
  const [saving, setSaving] = useState(false);
  // A failed Firestore write previously only logged to the console — the UI
  // showed nothing beyond "Saving..." clearing, so a genuinely failed sync
  // (bad field value, permission error, network blip) looked identical to a
  // successful one. Surfaced here so Layout's AutoSaveChip (or any consumer)
  // can show the user something actually went wrong instead of silently
  // leaving local-only data that looks synced.
  const [syncError, setSyncError] = useState(null);
  // Non-fatal advisory — set when a single business's total Firestore
  // footprint crosses SOFT_SIZE_WARN_BYTES. Doesn't block anything (writes
  // still work); just makes the worst-case sync cost/size visible before it
  // turns into a surprise bill or hits Firestore's real per-document ceiling.
  // Consumed by Layout's AutoSaveChip (hover tooltip).
  const [syncWarning, setSyncWarning] = useState(null);
  const isUpdatingDataRef = useRef(false);

  const dataRef = useRef(emptyData());
  const allDataRef = useRef({});
  const currentBusinessIdRef = useRef(null);
  const chunkCountsRef = useRef({});
  // { [bizId]: number } — last `_rev` value this device has seen/written per
  // business. The cheap periodic poll (firestoreReadRevs) compares against
  // this to decide whether a full firestoreReadAll is even needed. Seeded on
  // every full load/sync and kept current by firestoreWriteAll after this
  // device's own writes so we never self-trigger a redundant pull. Empty
  // means "never synced" → the first poll does a full sync (correct).
  const lastSeenRevsRef = useRef({});
  // Per-chunk content hashes, session-local only (not read from Firestore —
  // starts empty each session/login, warms up after the first save). See
  // firestoreWriteAll's chunkHashes param: lets repeat saves in the same
  // session skip re-uploading chunks whose content didn't actually change,
  // which is what makes editing one invoice in a large sales table fast
  // instead of rewriting/re-chunking the whole table every time.
  const chunkHashesRef = useRef({});
  // Per-row stripUndefined+JSON.stringify cache, keyed by ORIGINAL row
  // object reference: { [bizId]: { [table]: WeakMap<row, {clean,json,bytes}> } }.
  // Session-local only, same lifetime/rationale as chunkHashesRef — see
  // chunkRowsBySize's comment. A stale WeakMap entry for a row that's since
  // been edited is never a problem: editing a row always produces a new
  // object reference (spread/map build a new object), so the old entry is
  // simply never looked up again and gets garbage-collected once nothing
  // else references that old row object.
  const rowJsonCacheRef = useRef({});
  const localDbKeyRef = useRef(null);
  // Coalesces bursts of applyMutation/deleteManyItems calls into a single
  // idle-deferred IndexedDB write of the FINAL state, instead of one
  // synchronous structured-clone per call. See scheduleIdle above.
  const idbWriteHandleRef = useRef(null);
  const idbWritePendingRef = useRef(null); // { newAll, pendingSync, dirtyTables }
  const flushLocalWrite = useCallback(() => {
    const pending = idbWritePendingRef.current;
    idbWritePendingRef.current = null;
    idbWriteHandleRef.current = null;
    if (!pending || !localDbKeyRef.current) return;
    setLocalData(localDbKeyRef.current, pending.newAll, {
      pendingSync: pending.pendingSync,
      dirtyTables: pending.dirtyTables,
    }).catch((e) => console.error('[flushLocalWrite] IndexedDB write failed:', e));
  }, []);
  const queueLocalWrite = useCallback((newAll, dirtyTables) => {
    idbWritePendingRef.current = { newAll, pendingSync: true, dirtyTables };
    if (idbWriteHandleRef.current == null) {
      idbWriteHandleRef.current = scheduleIdle(flushLocalWrite);
    }
  }, [flushLocalWrite]);

  // Safety net for the idle-deferred IndexedDB write above: if the tab is
  // closed/backgrounded before the idle callback fires (normally <50ms,
  // capped at a 500ms timeout, but not guaranteed), force it through
  // immediately instead of risking the last edit only living in React state.
  useEffect(() => {
    const flushNow = () => { if (idbWritePendingRef.current) flushLocalWrite(); };
    const onVisibilityChange = () => { if (document.visibilityState === 'hidden') flushNow(); };
    window.addEventListener('beforeunload', flushNow);
    window.addEventListener('pagehide', flushNow);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', flushNow);
      window.removeEventListener('pagehide', flushNow);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [flushLocalWrite]);

  const writeTimerRef = useRef(null);
  const pendingWriteSnapshotRef = useRef(null);
  // True from schedulePersist() until the latest queued write has finished.
  const persistPendingRef = useRef(false);
  const persistSeqRef = useRef(0);
  const dirtyTablesRef = useRef(new Set());
  // Which business key(s) were actually mutated since the last successful
  // persist. null means "unknown / business-level op" — firestoreWriteAll
  // falls back to processing every business in that case (safe default).
  // Kept as its own set (not just reusable off dirtyTables) since a business
  // switch + edit in between two debounced saves could touch more than one.
  const dirtyBizIdsRef = useRef(null);
  const syncInFlightRef = useRef(false);

  const staffSessionRef = useRef(staffSession);
  useEffect(() => { staffSessionRef.current = staffSession; }, [staffSession]);

  const currentUserRef = useRef(currentUser);
  const isAuthorizedRef = useRef(isAuthorized);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);
  useEffect(() => { isAuthorizedRef.current = isAuthorized; }, [isAuthorized]);

  useEffect(() => {
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

  // Periodic background sync — previously the only time this app ever
  // checked Firestore was once on login/page load, so a sale created on one
  // device was invisible on another until a manual reload.
  //
  // Each tick is a *cheap* change probe (firestoreReadRevs — N tiny reads,
  // ~tens of bytes) that only escalates to a full read+reconcile when a
  // business's `_rev` counter actually moved. See syncFromCloud.
  //
  //  • Paused entirely while the tab is hidden — a backgrounded tab isn't
  //    being looked at, and it does one immediate sync the moment it's
  //    focused again (onVisible), so nothing is missed. Also stops the
  //    still-cheap-but-not-free probe + timer wakeups from running on every
  //    idle backgrounded PWA.
  //  • Interval is adaptive: 45s when a staff/admin session is active
  //    (multi-user businesses where two people may edit concurrently and
  //    want to see each other quickly) vs 90s for a solo owner (one device
  //    in practice — a longer worst-case cross-device lag is fine, and it
  //    halves the residual probe cost/wakeups).
  useEffect(() => {
    if (authLoading) return;
    if (!staffSession && (!currentUser || !isAuthorized)) return;

    const SYNC_INTERVAL_MS = staffSession ? 45000 : 90000;
    let intervalId = null;

    const startPolling = () => {
      if (intervalId != null) return;
      intervalId = setInterval(() => { syncFromCloud(); }, SYNC_INTERVAL_MS);
    };
    const stopPolling = () => {
      if (intervalId == null) return;
      clearInterval(intervalId);
      intervalId = null;
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncFromCloud();      // catch up immediately on return
        startPolling();
      } else {
        stopPolling();        // idle backgrounded tab does no work
      }
    };
    const onFocus = () => { if (document.visibilityState === 'visible') syncFromCloud(); };

    // Start only if the tab is actually visible right now.
    if (document.visibilityState === 'visible') startPolling();
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);
    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, currentUser?.uid, isAuthorized, staffSession?.id]);

  useEffect(() => { currentBusinessIdRef.current = currentBusinessId; }, [currentBusinessId]);

  useEffect(() => {
    const storedBusinessId = localStorage.getItem('tallykraft_currentBusinessId') || '1';
    setCurrentBusinessId(storedBusinessId);
  }, []);

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

  // { [bizId]: true } once we've warned about that business this session, so
  // the advisory isn't recomputed/re-fired on every subsequent save.
  const softSizeWarnedRef = useRef({});
  const checkSoftSize = useCallback((snapshot, dirtyBizIds) => {
    if (!snapshot) return;
    const bizIds = dirtyBizIds ? [...dirtyBizIds] : Object.keys(snapshot);
    for (const bizId of bizIds) {
      if (softSizeWarnedRef.current[bizId]) continue;
      const biz = snapshot[bizId];
      if (!biz?.data) continue;
      let bytes = 0;
      try {
        // Rough UTF-8 byte estimate of just this business's table data —
        // JSON.stringify().length undercounts multi-byte (₹, regional
        // scripts) so scale it; close enough for a soft threshold.
        bytes = JSON.stringify(biz.data).length * 1.5;
      } catch { continue; }
      if (bytes >= SOFT_SIZE_WARN_BYTES) {
        softSizeWarnedRef.current[bizId] = true;
        const mb = (bytes / 1024 / 1024).toFixed(1);
        console.warn(`[dataSize] Business "${biz.name || bizId}" is ~${mb}MB of synced data — large datasets slow initial load and cross-device sync.`);
        setSyncWarning({ message: `This business has grown large (~${mb}MB). Consider archiving old years' data.`, at: Date.now() });
      }
    }
  }, []);

  // ── Debounced flush — writes to Firestore, keeps dirty state until confirmed ──
  const schedulePersist = useCallback(() => {
    pendingWriteSnapshotRef.current = allDataRef.current;
    persistPendingRef.current = true;
    persistSeqRef.current += 1;
    setSaving(true);
    clearTimeout(writeTimerRef.current);
    writeTimerRef.current = setTimeout(async () => {
      const snapshot = pendingWriteSnapshotRef.current;
      const mySeq = persistSeqRef.current;
      const user = currentUserRef.current;
      const authorized = isAuthorizedRef.current;
      const staff = staffSessionRef.current;
      const dirty = dirtyTablesRef.current.size > 0
        ? new Set(dirtyTablesRef.current)
        : null;
      const dirtyBizIds = dirtyBizIdsRef.current ? new Set(dirtyBizIdsRef.current) : null;
      // Dirty state (in-memory + IndexedDB pendingSync) is only cleared once the
      // Firestore write actually succeeds — if it fails (e.g. offline), it stays
      // marked so a reload or reconnect can retry it instead of silently losing it.
      try {
        if (staff) {
          if (!staff.ownerUid) {
            console.error('[schedulePersist] staff.ownerUid is missing — cannot persist. Session:', staff);
          } else {
            // Was hardcoded `null` (= "write every table, every business"),
            // ignoring the computed dirty set entirely — meant a staff/admin
            // (business-code) session re-serialized and rewrote ALL data for
            // ALL of the owner's businesses on every single debounced save,
            // e.g. one bulk-import edit to `sales` forced a full rewrite of
            // every table across every business. That's the real reason bulk
            // imports under a business-code/staff login blew past Firestore's
            // per-request size limit — not the chunk/batch sizing itself.
            await firestoreWriteAll(staff.ownerUid, snapshot, chunkCountsRef.current, dirty, chunkHashesRef.current, dirtyBizIds, rowJsonCacheRef.current, lastSeenRevsRef.current);
          }
        } else if (user && authorized) {
          await firestoreWriteAll(user.uid, snapshot, chunkCountsRef.current, dirty, chunkHashesRef.current, dirtyBizIds, rowJsonCacheRef.current, lastSeenRevsRef.current);
        }
        dirtyTablesRef.current.clear();
        dirtyBizIdsRef.current = null;
        setSyncError(null);
        if (localDbKeyRef.current) markSynced(localDbKeyRef.current).catch(() => {});
        // Non-blocking soft-size advisory. Only re-checked for the specific
        // business(es) just written (dirtyBizIds), at most once per session
        // per business, and only measured off the already-in-hand snapshot —
        // no extra read, no extra serialize of untouched data.
        checkSoftSize(snapshot, dirtyBizIds);
      } catch (e) {
        // Was console-only — a failed write (bad field value like NaN/a Date
        // object Firestore rejects, a permission error, a genuine network
        // failure) looked identical in the UI to a successful save, since
        // "Saving..." just clears either way. dirtyTables correctly stays
        // marked so a reload/reconnect retries it, but the user had no way
        // to know a specific save never reached the cloud without opening
        // devtools. code/message logged explicitly since Firestore errors
        // are often just "Missing or insufficient permissions" or similar
        // short strings that are easy to miss in a generic error object.
        console.error('[schedulePersist] Firestore write failed — will retry when back online. code:', e?.code, 'message:', e?.message, e);
        setSyncError({ message: e?.message || 'Sync to cloud failed', code: e?.code, at: Date.now() });
      } finally {
        if (persistSeqRef.current === mySeq) persistPendingRef.current = false;
        setSaving(false);
      }
    }, WRITE_DEBOUNCE_MS);
    // checkSoftSize is a stable useCallback([]) — safe to omit; schedulePersist
    // is intentionally identity-stable (many callers depend on that).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When connectivity returns after being offline, flush any writes that
  // failed/were queued while offline instead of waiting for the next edit.
  const prevOnlineRef = useRef(isOnline);
  useEffect(() => {
    const wasOffline = !prevOnlineRef.current;
    prevOnlineRef.current = isOnline;
    if (isOnline && wasOffline && dirtyTablesRef.current.size > 0) {
      schedulePersist();
    }
  }, [isOnline, schedulePersist]);

  const applyMutation = useCallback((table, newTableData) => {
    const bKey = String(currentBusinessIdRef.current || localStorage.getItem('tallykraft_currentBusinessId') || '1');
    const newData = { ...dataRef.current, [table]: newTableData };
    const currentBiz = allDataRef.current[bKey];
    // If the business key isn't found (can happen during first load), find the first available key
    const resolvedBiz = currentBiz || Object.values(allDataRef.current)[0];
    const resolvedKey = currentBiz ? bKey : Object.keys(allDataRef.current)[0];
    const newAll = resolvedBiz
      ? { ...allDataRef.current, [resolvedKey]: { ...resolvedBiz, data: newData } }
      : allDataRef.current;

    dirtyTablesRef.current.add(table);
    (dirtyBizIdsRef.current ||= new Set()).add(resolvedKey ?? bKey);

    dataRef.current = newData;
    allDataRef.current = newAll;
    isUpdatingDataRef.current = true;

    setData(newData);
    setAllBusinessData(newAll);

    // Write-through to IndexedDB so a reload — even within the Firestore
    // debounce window — never loses this change. Idle-deferred (not
    // synchronous) so the expensive structured-clone of the whole blob
    // doesn't block this call/the UI update that triggered it — see
    // queueLocalWrite/scheduleIdle above.
    if (localDbKeyRef.current) {
      queueLocalWrite(newAll, Array.from(dirtyTablesRef.current));
    }

    schedulePersist();
    setTimeout(() => { isUpdatingDataRef.current = false; }, 100);
    return newData;
  }, [schedulePersist, queueLocalWrite]);

  // Deletes records from several tables in ONE state/IndexedDB/persist cycle —
  // used by flows like "Delete All Business Data" that would otherwise call
  // applyMutation once per table (or worse, once per record), each triggering
  // its own re-render and debounced Firestore write.
  // tableIdMap: { [table]: idsToDelete[] }
  const deleteManyItems = useCallback((tableIdMap) => {
    // Was reading the raw `currentUser`/`isAuthorized` values destructured
    // from useAuth() at the top of this component — since this function is
    // wrapped in useCallback with deps [schedulePersist] (stable forever),
    // it's created exactly ONCE on first render and never recreated, so its
    // closure kept whatever currentUser/isAuthorized were at that first
    // render forever. If auth hadn't resolved yet at that moment (a normal
    // race with Firebase's async onAuthStateChanged on page load), this
    // guard could permanently evaluate as "not authenticated" for the rest
    // of the session even after the user was genuinely signed in and every
    // other page showed their data fine — silently no-op'ing every
    // "Delete All Business Data" call ("0 records deleted successfully")
    // while every other mutation (addItem/updateItem/deleteItem, all plain
    // functions redefined fresh each render, not useCallback'd) worked
    // normally. Switched to the *Ref versions already used correctly
    // elsewhere in this file, which stay current via their own useEffects.
    if (!currentUserRef.current && !staffSessionRef.current) return 0;
    if (currentUserRef.current && !isAuthorizedRef.current) return 0;
    if (!isBusinessActive(currentBusinessIdRef.current)) return 0;
    const bKey = String(currentBusinessIdRef.current || localStorage.getItem('tallykraft_currentBusinessId') || '1');
    const newData = { ...dataRef.current };
    let totalDeleted = 0;
    Object.entries(tableIdMap).forEach(([table, ids]) => {
      if (!ids || ids.length === 0) return;
      const idSet = new Set(ids);
      newData[table] = (dataRef.current[table] || []).filter(item => !idSet.has(item.id));
      totalDeleted += ids.length;
      dirtyTablesRef.current.add(table);
    });
    if (totalDeleted === 0) return 0;

    const currentBiz = allDataRef.current[bKey];
    const resolvedBiz = currentBiz || Object.values(allDataRef.current)[0];
    const resolvedKey = currentBiz ? bKey : Object.keys(allDataRef.current)[0];
    const newAll = resolvedBiz
      ? { ...allDataRef.current, [resolvedKey]: { ...resolvedBiz, data: newData } }
      : allDataRef.current;

    (dirtyBizIdsRef.current ||= new Set()).add(resolvedKey ?? bKey);

    dataRef.current = newData;
    allDataRef.current = newAll;
    isUpdatingDataRef.current = true;

    setData(newData);
    setAllBusinessData(newAll);

    if (localDbKeyRef.current) {
      queueLocalWrite(newAll, Array.from(dirtyTablesRef.current));
    }

    schedulePersist();
    setTimeout(() => { isUpdatingDataRef.current = false; }, 100);
    return totalDeleted;
  }, [schedulePersist, queueLocalWrite]);

  // Applies a Google-auth-shaped blob ({ [bizId]: {...meta, data} }) to state,
  // resolving which business should be selected the same way the old
  // loadAllData success-path always did.
  const applyOwnerBlob = (blob) => {
    allDataRef.current = blob;
    setAllBusinessData(blob);
    const storedId = localStorage.getItem('tallykraft_currentBusinessId');
    const keys = Object.keys(blob);
    const validKey = (storedId && keys.includes(storedId)) ? storedId : keys[0];
    if (validKey) {
      const matchByInternal = !keys.includes(storedId) && storedId
        ? keys.find(k => String(blob[k].id) === storedId)
        : null;
      const chosenKey = matchByInternal || validKey;
      currentBusinessIdRef.current = chosenKey;
      setCurrentBusinessId(chosenKey);
      localStorage.setItem('tallykraft_currentBusinessId', chosenKey); window.dispatchEvent(new Event('app-business-changed'));
    }
  };

  // Applies a staff/business-code-shaped blob, selecting the business the
  // staff/admin actually logged into (falling back to the first available).
  const applyStaffBlob = (blob, session) => {
    // session.businessId is the Firestore `businesses/{id}` doc id (e.g. "biz_abc_2"),
    // not an allBusinessData key — use localBusinessId (the actual local business
    // key, e.g. "2") which both loginAsStaff and loginAsAdmin now provide.
    const sessionLocalBizId = session.localBusinessId != null ? String(session.localBusinessId) : null;
    const matchedKey = sessionLocalBizId && blob[sessionLocalBizId] ? sessionLocalBizId : Object.keys(blob)[0];
    const matchedBizData = blob[matchedKey]?.data || emptyData();
    isUpdatingDataRef.current = true;
    allDataRef.current = blob;
    dataRef.current = matchedBizData;
    currentBusinessIdRef.current = matchedKey;
    localStorage.setItem('tallykraft_currentBusinessId', matchedKey); window.dispatchEvent(new Event('app-business-changed'));
    setAllBusinessData(blob);
    setCurrentBusinessId(matchedKey);
    setData(matchedBizData);
    setTimeout(() => { isUpdatingDataRef.current = false; }, 100);
  };

  const applyStaffFallback = (session) => {
    const fallback = { ...createDefaultBusinessData()['1'], needsSetup: false, name: session.businessName || 'Business' };
    const fallbackAll = { '1': fallback };
    allDataRef.current = fallbackAll;
    setAllBusinessData(fallbackAll);
    currentBusinessIdRef.current = '1';
    setCurrentBusinessId('1');
    dataRef.current = emptyData();
    setData(emptyData());
  };

  // Overlays device-local-only fields (logo/qrCode — never written to
  // Firestore, see BIZ_META_KEYS/LOCAL_ONLY_BIZ_KEYS) from the local cache
  // onto a blob that came straight from `remote`. `remote` never carries
  // these keys by design, so any code path that hands back `remote` (or a
  // structure built from it) without going through this first would silently
  // erase a locally-uploaded logo/QR the moment it's applied+persisted.
  const applyLocalOnlyOverlay = (blob, localBlob) => {
    if (!localBlob) return blob;
    const out = { ...blob };
    Object.keys(out).forEach((bizId) => {
      const localBiz = localBlob[bizId];
      if (!localBiz) return;
      const overrides = {};
      LOCAL_ONLY_BIZ_KEYS.forEach((k) => { if (localBiz[k] !== undefined) overrides[k] = localBiz[k]; });
      if (Object.keys(overrides).length > 0) out[bizId] = { ...out[bizId], ...overrides };
    });
    return out;
  };

  // Merges a fresh Firestore read with a locally-cached record that has
  // unsynced offline edits. Whole-table granularity: tables listed in
  // localRecord.dirtyTables keep the local (offline-edited) version; every
  // other table/business metadata takes the remote version. Re-queues a
  // Firestore write of the merged result so the offline edits actually sync.
  //
  // The `!pendingSync` fast path below used to `return remote` directly —
  // since `remote` never carries logo/qrCode (device-local-only, deliberately
  // excluded from what's written to Firestore), that silently erased a
  // locally-uploaded logo/QR on every reload/background-sync that happened
  // to land after the offline-edits flag had already cleared (the common
  // case — it clears ~400ms after any save, so most reloads hit this path).
  // Worse, callers then persist that logo-less result straight back over
  // IndexedDB, making the loss permanent instead of a one-time render glitch.
  // The overlay below is applied on BOTH paths so it can never be skipped.
  const reconcileRemoteWithLocal = (remote, localRecord) => {
    if (!localRecord?.pendingSync) return applyLocalOnlyOverlay(remote, localRecord?.data);
    try {
      return reconcileRemoteWithLocalInner(remote, localRecord);
    } catch (e) {
      // Whatever went wrong, never let it crash the load and show a blank
      // default business ("no data visible") — local data always wins here
      // since it's the version the user actually last saw, and it's still
      // marked pendingSync so the next successful reconcile can retry.
      console.error('[reconcileRemoteWithLocal] failed, falling back to local data:', e);
      return localRecord.data || remote;
    }
  };

  const reconcileRemoteWithLocalInner = (remote, localRecord) => {
    const dirtySet = new Set(localRecord.dirtyTables || []);
    const deletedSet = new Set((localRecord.deletedBizIds || []).map(String));
    const localBlob = localRecord.data || {};
    const merged = {};
    // Only tables that actually differ from what's already in Firestore get
    // re-queued for a write. Previously this unconditionally re-persisted
    // every dirty table (or ALL_TABLES when the dirty set was unknown) on
    // every login, even when the local copy already matched remote — the
    // "huge saving on initial load" the user hit, and it compounds if a
    // write ever silently fails (pendingSync never clears, so it repeats
    // forever).
    const actuallyDirty = new Set();
    const allBizIds = new Set([...Object.keys(remote), ...Object.keys(localBlob)]);
    allBizIds.forEach((bizId) => {
      // Tombstoned: this business was deleted locally — never resurrect it
      // from remote, even if the Firestore delete hasn't landed/synced yet.
      if (deletedSet.has(String(bizId))) return;
      const remoteBiz = remote[bizId];
      const localBiz = localBlob[bizId];
      if (!localBiz) { merged[bizId] = remoteBiz; return; }
      if (!remoteBiz) { merged[bizId] = localBiz; return; }
      // Tables to check: the recorded dirty set, or every table if unknown
      // (legacy record shape) — but each is only KEPT as dirty below if it
      // actually differs from remote, so "unknown" no longer means "write
      // everything regardless."
      const candidateTables = dirtySet.size > 0 ? dirtySet : new Set(ALL_TABLES);
      const mergedData = { ...remoteBiz.data };
      // Sort by id before comparing so a harmless reordering of rows (not
      // just key order within a row) can't register as a false diff either.
      const byId = (a, b) => String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
      candidateTables.forEach((t) => {
        const rawLocal = localBiz.data?.[t];
        const rawRemote = remoteBiz.data?.[t];
        const localTable = Array.isArray(rawLocal) ? rawLocal : [];
        const remoteTable = Array.isArray(rawRemote) ? rawRemote : [];
        // Any single table's comparison failing (unexpected shape, etc.)
        // must never abort the whole reconcile — that previously bubbled up
        // through loadAllData's catch and fell back to a blank default
        // business, i.e. "no data visible." Treat a failed comparison as
        // "assume different" (safe: local data wins, nothing is lost) and
        // keep going.
        let same;
        try {
          same = localTable.length === remoteTable.length &&
            canonicalStringify([...localTable].sort(byId)) === canonicalStringify([...remoteTable].sort(byId));
        } catch (e) {
          console.error(`[reconcileRemoteWithLocal] compare failed for table "${t}":`, e);
          same = false;
        }
        if (!same) {
          mergedData[t] = rawLocal ?? localTable;
          actuallyDirty.add(t);
        }
      });
      // logo/qrCode are local-only (never written to Firestore, see
      // BIZ_META_KEYS) — remoteBiz will never carry them, so spreading it
      // as the base would silently erase a locally-uploaded logo/QR on every
      // reconcile (initial load, background sync, reconnect-after-offline).
      // Always keep whatever this device already has for those two keys.
      const localOnlyOverrides = {};
      LOCAL_ONLY_BIZ_KEYS.forEach((k) => {
        if (localBiz[k] !== undefined) localOnlyOverrides[k] = localBiz[k];
      });
      merged[bizId] = { ...remoteBiz, ...localOnlyOverrides, data: mergedData };
    });
    if (actuallyDirty.size > 0) {
      dirtyTablesRef.current = actuallyDirty;
      // Re-queue only the genuinely-changed tables for sync now that we're online.
      setTimeout(() => schedulePersist(), 0);
    } else {
      // Nothing actually differs — clear the stale pendingSync flag so this
      // check doesn't repeat on every future login.
      if (localDbKeyRef.current) {
        markSynced(localDbKeyRef.current).catch(() => {});
      }
    }
    return merged;
  };

  // Guards against a partial/corrupted Firestore read silently wiping out a
  // good local cache. firestoreReadAll reads each table's chunk docs
  // separately (chunkMap in firestoreReadAll) — a transient read failure on
  // just one chunk collection still returns a structurally valid object with
  // that table defaulted to [], which previously sailed straight through the
  // "is this object non-empty" check and got written over IndexedDB as if it
  // were authoritative, permanently losing data a reload could never recover
  // (the corrupted read WAS what got cached). If the total record count
  // across a business is now drastically smaller than what's already cached
  // locally, treat the read as suspect and keep the local copy instead.
  const remoteLooksSuspiciouslyEmpty = (remoteBlob, localBlob) => {
    if (!localBlob) return false;
    for (const bizId of Object.keys(localBlob)) {
      const localBiz = localBlob[bizId];
      const remoteBiz = remoteBlob[bizId];
      // A business ENTIRELY ABSENT from remote (no key at all in the blob
      // firestoreReadAll built) is unambiguous — firestoreReadAll only ever
      // omits a bizId when its `biz/{bizId}` doc genuinely doesn't exist in
      // Firestore's `bizSnap.docs` listing, which only happens via a real
      // deletion (firestoreDeleteBusiness removes that doc). A corrupted or
      // partial read can't produce this shape — it would either throw
      // (returning null entirely, handled separately) or return the bizId
      // key with malformed/empty `data` fields, not omit the key. Treating
      // "missing" as "suspect" here meant: user deletes business B on
      // device A (which correctly removes it from Firestore) → opens the
      // app on device B, which still has B cached locally from before →
      // this loop sees B present locally, absent from remote, and — because
      // it couldn't tell "genuinely deleted" apart from "partial read" —
      // aborted the ENTIRE reconcile for every business, leaving device B's
      // stale local copy (including the deleted businesses) untouched
      // forever, since the deletion is real and will never "fix itself" on
      // a later read the way an actual transient partial-read would. Only
      // a business that's PRESENT in remote but suspiciously thin now
      // (the actual corrupted-read case this guard exists for) still
      // triggers protection below.
      if (!remoteBiz) continue;
      const localCount = Object.values(localBiz?.data || {}).reduce((s, t) => s + (Array.isArray(t) ? t.length : 0), 0);
      if (localCount < 20) continue; // too little local data for this heuristic to be meaningful
      const remoteCount = Object.values(remoteBiz.data || {}).reduce((s, t) => s + (Array.isArray(t) ? t.length : 0), 0);
      if (remoteCount < localCount * 0.2) return true;
    }
    return false;
  };

  // Cheap "did anything actually change" check between two full blobs —
  // used by periodic background sync to decide whether to touch React state
  // at all. Calling applyOwnerBlob/setAllBusinessData unconditionally every
  // tick would hand out a new object reference every time even when nothing
  // changed remotely, which would defeat every data[table]-keyed useMemo
  // across the app (Sales/Dashboard/Reports/Cash — see their "getItems
  // identity" fix) by making them think their table changed on every sync
  // tick. Short-circuits on the first difference found — doesn't need to be
  // exhaustive, just needs to correctly answer "same or not."
  const blobsDiffer = (a, b) => {
    const aKeys = Object.keys(a || {});
    const bKeys = Object.keys(b || {});
    if (aKeys.length !== bKeys.length) return true;
    const byId = (x, y) => String(x?.id ?? '').localeCompare(String(y?.id ?? ''));
    for (const bizId of aKeys) {
      const bizA = a[bizId];
      const bizB = b[bizId];
      if (!bizB) return true;
      for (const t of ALL_TABLES) {
        const ta = Array.isArray(bizA?.data?.[t]) ? bizA.data[t] : [];
        const tb = Array.isArray(bizB?.data?.[t]) ? bizB.data[t] : [];
        if (ta.length !== tb.length) return true;
        try {
          if (canonicalStringify([...ta].sort(byId)) !== canonicalStringify([...tb].sort(byId))) return true;
        } catch (e) {
          console.error(`[blobsDiffer] compare failed for table "${t}", assuming changed:`, e);
          return true;
        }
      }
    }
    return false;
  };

  // true if any business's remote `_rev` differs from what this device last
  // saw (or if we've never recorded a rev, or the probe itself failed — both
  // "be safe, do the full sync" cases). `revs` is the map from
  // firestoreReadRevs.
  const revsIndicateChange = (revs) => {
    if (!revs) return true; // probe failed → fall through to a full sync
    const seen = lastSeenRevsRef.current;
    if (Object.keys(seen).length === 0) return true; // never synced this session
    const allBizIds = new Set([...Object.keys(revs), ...Object.keys(seen)]);
    for (const bizId of allBizIds) {
      if ((revs[bizId] || 0) !== (seen[bizId] || 0)) return true;
    }
    return false;
  };

  // Periodic + tab-focus background sync so a save made on another device
  // shows up here without a manual reload.
  //
  // Two-phase to keep the common "nothing changed" tick nearly free:
  //   1. Cheap probe — firestoreReadRevs reads only the tiny per-business
  //      metadata docs (N small reads, ~tens of bytes egress) and checks
  //      their `_rev` counter against lastSeenRevsRef. ~99% of ticks stop
  //      here.
  //   2. Only if a rev actually moved (another device wrote), fall through
  //      to the exact same full firestoreReadAll + reconcile path the
  //      initial load uses — so dirty/pendingSync local edits are still
  //      protected identically — just without the setLoading(true) flash,
  //      and only touching React state when something genuinely changed.
  //
  // `{ full: true }` (manual refresh button) skips the probe and always does
  // the full read, so "Refresh" is never a no-op from the user's point of
  // view even if the probe would have said "unchanged".
  //
  // Returns a small status object so callers can tell the user what actually
  // happened, not just fire-and-forget.
  const syncFromCloud = async ({ full = false } = {}) => {
    if (syncInFlightRef.current) return { status: 'busy' };
    const user = currentUserRef.current;
    const authorized = isAuthorizedRef.current;
    const staff = staffSessionRef.current;
    if (!navigator.onLine) return { status: 'offline' };
    // A save is currently debouncing/in flight — let it finish and clear
    // dirty state first rather than racing a read against it.
    if (dirtyTablesRef.current.size > 0) return { status: 'saving' };
    if (!staff && (!user || !authorized)) return { status: 'unauthenticated' };
    if (staff && !staff.ownerUid) return { status: 'unauthenticated' };

    syncInFlightRef.current = true;
    try {
      const uid = staff ? staff.ownerUid : user.uid;

      // ── Phase 1: cheap change probe ──────────────────────────────────────
      if (!full) {
        const revs = await firestoreReadRevs(uid);
        if (!revsIndicateChange(revs)) return { status: 'unchanged' };
      }

      // ── Phase 2: full read + reconcile (only when something changed) ──────
      const freshRevs = {};
      const remote = await firestoreReadAll(uid, chunkCountsRef.current, freshRevs);
      if (!remote || typeof remote !== 'object' || Object.keys(remote).length === 0) return { status: 'error' };
      const localRecord = await getLocalRecord(uid).catch(() => null);
      if (remoteLooksSuspiciouslyEmpty(remote, localRecord?.data)) return { status: 'error' };
      const merged = reconcileRemoteWithLocal(remote, localRecord);
      // Record the revs we just pulled BEFORE the blobsDiffer short-circuit —
      // otherwise a change we successfully absorbed (or one reconcile decided
      // to keep local for) would leave lastSeenRevsRef stale and every
      // subsequent poll would re-pull the full blob forever. firestoreReadAll
      // populated freshRevs with EVERY business that currently exists in
      // Firestore, so we replace (not merge) — this also drops the entry for
      // a business deleted on another device, so the poll doesn't keep
      // seeing a phantom "changed" verdict for it forever.
      lastSeenRevsRef.current = freshRevs;
      if (!blobsDiffer(merged, allDataRef.current)) return { status: 'unchanged' }; // nothing new — skip the re-render
      if (staff) applyStaffBlob(merged, staff);
      else applyOwnerBlob(merged);
      if (!localRecord?.pendingSync) {
        setLocalData(uid, merged, { pendingSync: false, dirtyTables: [] }).catch(() => {});
      }
      return { status: 'updated' };
    } catch (e) {
      console.error('[syncFromCloud] background sync failed (will retry on next tick):', e);
      return { status: 'error', error: e };
    } finally {
      syncInFlightRef.current = false;
    }
  };

  const loadAllData = async () => {
    if (!currentUser || !isAuthorized) return;
    localDbKeyRef.current = currentUser.uid;
    try {
      setLoading(true);

      // 1) Instant local read — works offline, renders immediately.
      const localRecord = await getLocalRecord(currentUser.uid).catch(() => null);
      if (localRecord?.data && Object.keys(localRecord.data).length > 0) {
        applyOwnerBlob(localRecord.data);
        setLoading(false);
      }

      // 2) Skip the doomed network round-trip if we already know we're offline.
      if (!navigator.onLine) {
        if (!localRecord?.data) {
          const defaultData = createDefaultBusinessData();
          applyOwnerBlob(defaultData);
        }
        return;
      }

      // 3) Reconcile with Firestore in the background.
      const freshRevs = {};
      const remote = await firestoreReadAll(currentUser.uid, chunkCountsRef.current, freshRevs);
      // Seed the rev map so the periodic poll can start short-circuiting on
      // the very first tick instead of doing one guaranteed full sync first.
      lastSeenRevsRef.current = { ...lastSeenRevsRef.current, ...freshRevs };
      if (remote && typeof remote === 'object' && Object.keys(remote).length > 0) {
        if (remoteLooksSuspiciouslyEmpty(remote, localRecord?.data)) {
          // Local cache already applied in step 1 (or app starts blank if
          // there was none) — deliberately don't touch it or IndexedDB here.
          console.error('[loadAllData] Firestore read looks suspiciously emptier than local cache — ignoring it to avoid data loss. Local cache left untouched.');
        } else {
          const merged = reconcileRemoteWithLocal(remote, localRecord);
          applyOwnerBlob(merged);
          if (!localRecord?.pendingSync) {
            setLocalData(currentUser.uid, merged, { pendingSync: false, dirtyTables: [] }).catch(() => {});
          }
        }
      } else if (!localRecord?.data) {
        const defaultData = createDefaultBusinessData();
        applyOwnerBlob(defaultData);
        firestoreWriteAll(currentUser.uid, defaultData, chunkCountsRef.current, null, null, null, null, lastSeenRevsRef.current).catch(() => {});
        setLocalData(currentUser.uid, defaultData, { pendingSync: false, dirtyTables: [] }).catch(() => {});
      }
    } catch (error) {
      console.error('❌ Failed to load data:', error);
      if (!allDataRef.current || Object.keys(allDataRef.current).length === 0) {
        const defaultData = createDefaultBusinessData();
        applyOwnerBlob(defaultData);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadStaffData = async (session) => {
    localDbKeyRef.current = session.ownerUid || null;
    setLoading(true);
    try {
      const localRecord = session.ownerUid ? await getLocalRecord(session.ownerUid).catch(() => null) : null;
      if (localRecord?.data && Object.keys(localRecord.data).length > 0) {
        applyStaffBlob(localRecord.data, session);
        setLoading(false);
      }

      if (!navigator.onLine) {
        if (!localRecord?.data) applyStaffFallback(session);
        return;
      }

      const freshRevs = {};
      const businesses = await firestoreReadAll(session.ownerUid, chunkCountsRef.current, freshRevs);
      lastSeenRevsRef.current = { ...lastSeenRevsRef.current, ...freshRevs };
      if (businesses && typeof businesses === 'object' && Object.keys(businesses).length > 0) {
        if (remoteLooksSuspiciouslyEmpty(businesses, localRecord?.data)) {
          console.error('[loadStaffData] Firestore read looks suspiciously emptier than local cache — ignoring it to avoid data loss. Local cache left untouched.');
        } else {
          const merged = reconcileRemoteWithLocal(businesses, localRecord);
          applyStaffBlob(merged, session);
          if (!localRecord?.pendingSync && session.ownerUid) {
            setLocalData(session.ownerUid, merged, { pendingSync: false, dirtyTables: [] }).catch(() => {});
          }
        }
      } else if (!localRecord?.data) {
        applyStaffFallback(session);
      }
    } catch (err) {
      console.error('Failed to load staff data from Firestore:', err);
      if (!allDataRef.current || Object.keys(allDataRef.current).length === 0) applyStaffFallback(session);
    } finally {
      setLoading(false);
    }
  };

  /** Backup current business to Firestore on demand. Available to all authorized users. */
  const backupToFirestore = async (overrideAllData) => {
    if (!currentUser || !isAuthorized) return { success: false, error: 'Not authenticated' };
    try {
      const source = overrideAllData ?? allBusinessData;
      const bKey = String(currentBusinessId);
      const biz = source[bKey];
      if (!biz) return { success: false, error: 'No current business data' };
      await firestoreWriteAll(currentUser.uid, { [bKey]: biz }, chunkCountsRef.current, null, null, null, null, lastSeenRevsRef.current);
      return { success: true };
    } catch (error) {
      console.error('Firestore backup failed:', error);
      return { success: false, error: error.message };
    }
  };

  const pushBusinessToCloud = async (businessId) => {
    if (!currentUser || !isAuthorized) return { success: false, error: 'Not authenticated' };
    const bKey = String(businessId);
    const biz = allDataRef.current[bKey] || allBusinessData[bKey];
    if (!biz) return { success: false, error: 'No data for that business' };
    try {
      await firestoreWriteAll(currentUser.uid, { [bKey]: biz }, chunkCountsRef.current, null, null, null, null, lastSeenRevsRef.current);
      return { success: true };
    } catch (error) {
      console.error('pushBusinessToCloud failed:', error);
      return { success: false, error: error.message };
    }
  };

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

  /** Restore from Firestore — re-reads the current business from cloud. */
  const restoreFromFirestore = async () => {
    if (!currentUser || !isAuthorized) return { success: false, error: 'Not authenticated' };
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
      // bizFromCloud never carries logo/qrCode (device-local-only, never
      // written to Firestore) — preserve whatever this device already has
      // for those two keys instead of letting the restore erase them.
      const existingLocalBiz = allDataRef.current[bKey];
      const localOnlyOverrides = {};
      if (existingLocalBiz) {
        LOCAL_ONLY_BIZ_KEYS.forEach((k) => { if (existingLocalBiz[k] !== undefined) localOnlyOverrides[k] = existingLocalBiz[k]; });
      }
      const merged = { ...allDataRef.current, [bKey]: { ...bizFromCloud, ...localOnlyOverrides } };
      allDataRef.current = merged;
      dataRef.current = restoredData;
      isUpdatingDataRef.current = true;
      setAllBusinessData(merged);
      setData(restoredData);
      setTimeout(() => { isUpdatingDataRef.current = false; }, 100);
      return { success: true };
    } catch (error) {
      console.error('Restore from Firestore failed:', error);
      return { success: false, error: error.message };
    }
  };

  /** Restore from a file payload — writes directly to Firestore. */
  const restoreFromFile = async (businessData) => {
    if (!currentUser?.uid) return { success: false, error: 'Not authenticated' };
    if (!businessData || typeof businessData !== 'object' || Object.keys(businessData).length === 0) {
      return { success: false, error: 'Invalid backup data' };
    }
    try {
      const bKey = String(currentBusinessId);
      const bizSource = businessData[bKey] || Object.values(businessData)[0];
      if (!bizSource) return { success: false, error: 'No business data in backup' };

      const sourceId = bizSource.id;
      const targetId = currentBusinessId;
      const rawData = bizSource.data || emptyData();

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

      // Write to Firestore immediately then update in-memory state.
      await firestoreWriteAll(currentUser.uid, { [bKey]: merged[bKey] }, chunkCountsRef.current, null, null, null, null, lastSeenRevsRef.current);

      // Also write through to the local IndexedDB cache immediately — this
      // was the actual bug behind restores silently reverting: without
      // this, IndexedDB kept holding the PRE-restore data (often a larger
      // dataset than a smaller/older backup being restored), and the very
      // next loadAllData (a reload, or the periodic background sync)
      // compared that stale local cache against the freshly-restored
      // Firestore data via remoteLooksSuspiciouslyEmpty — which exists to
      // protect against a genuinely corrupted/partial Firestore read, but
      // had no way to distinguish that from "the user just restored a
      // smaller backup on purpose." It saw the restored data as
      // suspiciously thinner than the (stale) local cache, discarded it,
      // and the old business data won out, with only a console warning
      // and no user-visible error to explain why. Marking synced (not
      // pendingSync/dirty) since the Firestore write above already
      // succeeded — nothing here still needs to sync.
      setLocalData(currentUser.uid, merged, { pendingSync: false, dirtyTables: [] }).catch(() => {});

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
    localStorage.setItem('tallykraft_currentBusinessId', businessId.toString()); window.dispatchEvent(new Event('app-business-changed'));
  };

  // ── CRUD ──────────────────────────────────────────────────────────────────

  // Stamp who created a transaction — the staff id for a business-code
  // login, 'owner' otherwise — so "own bills only" staff can be scoped to
  // the records they created. Caller-supplied values (imports/restores) win.
  const creatorStamp = (table, item) => {
    if (!CREATOR_TRACKED_TABLES.has(table) || item.createdBy) return {};
    const s = staffSessionRef.current;
    return s ? { createdBy: s.id, createdByName: s.name || '' } : { createdBy: 'owner' };
  };

  const addItem = (table, item) => {
    if (!currentUser && !staffSessionRef.current) return false;
    if (currentUser && !isAuthorizedRef.current) return false;
    if (!isBusinessActive(currentBusinessIdRef.current)) return false;
    if (!item || typeof item !== 'object') return false;

    const tablesRequiringBusinessId = ['parties', 'items', 'sales', 'purchases', 'expenses', 'payments', 'opticals', 'estimates', 'creditNotes', 'debitNotes', 'deliveryNotes', 'journalEntries', 'cashEntries', 'investors', 'orders', 'notes'];
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
    if (table === 'investors' && !item.name?.trim()) return false;
    if (table === 'payments' && (!item.partyId || !item.totalAmount || item.totalAmount <= 0)) return false;
    if (table === 'expenses' && (!item.amount || item.amount <= 0 || !item.date || !item.category)) return false;
    if (table === 'cashEntries' && (!item.amount || item.amount <= 0 || !item.date || !['in','out','bank_in','bank_out'].includes(item.type))) return false;

    // Auto-stamp a creation timestamp (ms since epoch) on every new record
    // unless the caller already supplied one (e.g. a data-migration/import
    // path restoring a historical record) — this is the single choke point
    // every transaction-creating page/dialog saves through, so it covers
    // Sales/POS/Expenses/PaymentEntry/Cash/CreditNotes/DebitNotes/
    // DeliveryNotes/Estimates/Orders/etc. without touching each one.
    // Reports/lists sort by this (falling back to `date`+`time` for any
    // pre-existing record saved before this field existed).
    const newItem = { ...item, id: item.id ?? randomUUID(), createdAt: item.createdAt ?? Date.now(), ...creatorStamp(table, item), ...openingStockStamp(table, item) };
    applyMutation(table, [...(dataRef.current[table] || []), newItem]);
    return true;
  };

  const addItems = (table, items) => {
    if (!currentUser && !staffSessionRef.current) return { saved: 0, skipped: items.length };
    if (currentUser && !isAuthorizedRef.current) return { saved: 0, skipped: items.length };
    if (!isBusinessActive(currentBusinessIdRef.current)) return { saved: 0, skipped: items.length };
    const valid = [];
    let skipped = 0;
    items.forEach((item) => {
      if (!item || typeof item !== 'object') { skipped++; return; }
      if (table === 'parties') {
        if (!item.name?.trim() || !item.type || (item.type !== 'Customer' && item.type !== 'Vendor')) { skipped++; return; }
      }
      if (table === 'items' && !item.name?.trim()) { skipped++; return; }
      if (table === 'sales' || table === 'purchases') {
        if (!item.businessId) { skipped++; return; }
        if (!item.items || !Array.isArray(item.items) || item.items.length === 0) { skipped++; return; }
        const validLineItems = item.items.filter(li => (li.itemId || li.name?.trim()) && Number(li.qty) > 0);
        if (validLineItems.length === 0) { skipped++; return; }
        if (!item.totalAmount || item.totalAmount <= 0) { skipped++; return; }
      }
      valid.push({ ...item, id: item.id ?? randomUUID(), createdAt: item.createdAt ?? Date.now(), ...creatorStamp(table, item), ...openingStockStamp(table, item) });
    });
    if (valid.length) {
      applyMutation(table, [...(dataRef.current[table] || []), ...valid]);
    }
    return { saved: valid.length, skipped };
  };

  const updateItem = (table, id, updates) => {
    if (!currentUser && !staffSessionRef.current) return false;
    if (currentUser && !isAuthorizedRef.current) return false;
    if (!isBusinessActive(currentBusinessIdRef.current)) return false;
    const newTableData = (dataRef.current[table] || []).map(
      item => item.id === id ? { ...item, ...updates } : item
    );
    applyMutation(table, newTableData);
    return true;
  };

  const updateItems = (table, updates) => {
    if (!currentUser && !staffSessionRef.current) return 0;
    if (currentUser && !isAuthorizedRef.current) return 0;
    if (!isBusinessActive(currentBusinessIdRef.current)) return 0;
    if (!updates || updates.length === 0) return 0;
    const updateMap = Object.fromEntries(updates.map(u => [u.id, u]));
    const newTableData = (dataRef.current[table] || []).map(
      item => updateMap[item.id] ? { ...item, ...updateMap[item.id] } : item
    );
    applyMutation(table, newTableData);
    return updates.length;
  };

  const deleteItem = (table, id) => {
    if (!currentUser && !staffSessionRef.current) return false;
    if (currentUser && !isAuthorizedRef.current) return false;
    if (!isBusinessActive(currentBusinessIdRef.current)) return false;
    applyMutation(table, (dataRef.current[table] || []).filter(item => item.id !== id));
    return true;
  };

  // Single applyMutation call for many deletes — avoids N re-renders/N debounced
  // Firestore writes when clearing large tables (e.g. "Delete All Business Data").
  const deleteItems = (table, ids) => {
    if (!currentUser && !staffSessionRef.current) return 0;
    if (currentUser && !isAuthorizedRef.current) return 0;
    if (!isBusinessActive(currentBusinessIdRef.current)) return 0;
    if (!ids || ids.length === 0) return 0;
    const idSet = new Set(ids);
    const newTableData = (dataRef.current[table] || []).filter(item => !idSet.has(item.id));
    applyMutation(table, newTableData);
    return ids.length;
  };

  const getItems = useCallback((table) => data[table] || [], [data]);
  const getItem = useCallback((table, id) => (data[table] || []).find(item => item.id === id), [data]);

  const applyAllDataMutation = useCallback((newAll, deletedBizIds = []) => {
    allDataRef.current = newAll;
    isUpdatingDataRef.current = true;
    setAllBusinessData(newAll);
    dirtyTablesRef.current.clear();
    // Business-level ops (add/update/delete business) re-sync the whole blob
    // rather than specific tables, but still need write-through so an offline
    // change isn't lost on reload. deletedBizIds is a tombstone so a reload's
    // reconcile-with-Firestore step (reconcileRemoteWithLocal) doesn't
    // resurrect a business that was just deleted but whose Firestore delete
    // hasn't landed/synced yet.
    if (localDbKeyRef.current) {
      // Recorded as ALL_TABLES (not empty) so a future reconcile knows
      // exactly what to diff instead of falling back to "unknown" — same
      // effective set either way, but explicit here avoids relying on that
      // fallback's default.
      setLocalData(localDbKeyRef.current, newAll, { pendingSync: true, dirtyTables: ALL_TABLES, deletedBizIds })
        .catch((e) => console.error('[applyAllDataMutation] IndexedDB write failed:', e));
    }
    schedulePersist();
    setTimeout(() => { isUpdatingDataRef.current = false; }, 100);
  }, [schedulePersist]);

  const addBusiness = async (businessData) => {
    if (!currentUser && !staffSessionRef.current) return false;
    if (currentUser && !isAuthorized) return false;
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
      openingBank: Number(businessData.openingBank) || 0,
      data: {
        parties: [], items: [], sales: [], purchases: [], expenses: [],
        opticals: [], payments: [], settings: [], estimates: [],
        creditNotes: [], debitNotes: [], deliveryNotes: [], journalEntries: []
      }
    };

    // Mint this business its own Firestore businesses/{id} doc (own businessCode,
    // no adminPassword yet) so it never shares a code with any other local
    // business under this account. Best-effort/non-blocking — only the
    // authenticated owner can create this doc (firestore.rules requires
    // ownerId == request.auth.uid); under a staff/admin session this silently
    // no-ops and the owner can link a code later from Settings.
    if (currentUser?.uid) {
      try {
        const newBizDocId = `biz_${currentUser.uid}_${newId}`;
        const code = await ensureUniquCode();
        await setDoc(doc(firestore, 'businesses', newBizDocId), {
          id: newBizDocId,
          name: newBusiness.name,
          ownerId: currentUser.uid,
          ownerEmail: currentUser.email,
          businessCode: code,
          createdAt: new Date(),
        });
        newBusiness.firestoreBizDocId = newBizDocId;
      } catch (e) {
        console.warn('Could not mint business code for new local business:', e);
      }
    }

    applyAllDataMutation({ ...allDataRef.current, [String(newId)]: newBusiness });
    return newId;
  };

  const updateBusiness = (businessId, updates) => {
    if (!currentUser && !staffSessionRef.current) return false;
    if (currentUser && !isAuthorized) return false;
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

  const deleteBusiness = async (businessId) => {
    if (!currentUser && !staffSessionRef.current) return false;
    if (currentUser && !isAuthorized) return false;
    const bKey = String(businessId);
    const removedBiz = allDataRef.current[bKey];
    if (!removedBiz) return false;
    const updated = { ...allDataRef.current };
    delete updated[bKey];

    // Remove the business locally, instantly. Deliberately NOT via
    // applyAllDataMutation: that schedules a full persist with no dirty-table
    // or dirty-business scoping, i.e. it re-serialized and re-uploaded EVERY
    // table of EVERY remaining business — pure wasted work (nothing about the
    // businesses being kept changed) and the reason deleting a business sat
    // on "Saving…" for so long. Any edits already queued for other businesses
    // keep their own dirty tracking and still flush on their own timer.
    allDataRef.current = updated;
    isUpdatingDataRef.current = true;
    setAllBusinessData(updated);
    setTimeout(() => { isUpdatingDataRef.current = false; }, 100);
    // A save that's still debouncing must not write the deleted business back.
    // (Only swap if a write is actually queued/in flight.)
    if (persistPendingRef.current && pendingWriteSnapshotRef.current) pendingWriteSnapshotRef.current = updated;
    if (dirtyBizIdsRef.current) dirtyBizIdsRef.current.delete?.(bKey);
    delete chunkHashesRef.current[bKey];
    delete rowJsonCacheRef.current[bKey];
    delete lastSeenRevsRef.current[bKey];

    // IndexedDB write-through with a tombstone, so a reload before the cloud
    // delete lands can't resurrect it (reconcileRemoteWithLocal skips
    // tombstoned ids). Other tables' pending dirt is preserved as-is.
    if (localDbKeyRef.current) {
      setLocalData(localDbKeyRef.current, updated, { pendingSync: true, dirtyTables: [...dirtyTablesRef.current], deletedBizIds: [bKey] })
        .catch((e) => console.error('[deleteBusiness] IndexedDB write failed:', e));
    }

    // Cloud removal runs in the background — the UI doesn't wait on it.
    // Without it the business's `users/{uid}/biz/{id}` tree would survive
    // (writes only ever upsert businesses still in the blob).
    if (currentUser?.uid) {
      const uid = currentUser.uid;
      const profileDocId = removedBiz.firestoreBizDocId
        || (bKey === '1' ? `biz_${uid}` : `biz_${uid}_${bKey}`);
      Promise.all([
        firestoreDeleteBusiness(uid, bKey, chunkCountsRef.current),
        deleteDoc(doc(firestore, 'businesses', profileDocId)).catch(() => {}),
      ]).then(() => {
        // Clear the tombstone once nothing else is waiting to sync.
        if (localDbKeyRef.current && dirtyTablesRef.current.size === 0 && !persistPendingRef.current) {
          markSynced(localDbKeyRef.current).catch(() => {});
        }
      }).catch((e) => console.warn('Could not delete business from Firestore:', e));
    }

    return true;
  };

  return (
    <DataContext.Provider value={{
      data,
      loading,
      saving,
      syncError,
      syncWarning,
      addItem,
      addItems,
      updateItem,
      updateItems,
      deleteItem,
      deleteItems,
      deleteManyItems,
      getItems,
      getItem,
      reloadData: loadAllData,
      syncFromCloud,
      allBusinessData,
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
