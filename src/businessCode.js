import { useState, useEffect } from 'react';
import { firestore } from './db';
import { collection, query, where, getDocs, doc, onSnapshot } from 'firebase/firestore';

const generateBusinessCode = () => {
  // Avoid ambiguous chars (O/0, I/1/l)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
};

export const ensureUniquCode = async () => {
  while (true) {
    const code = generateBusinessCode();
    const snap = await getDocs(query(collection(firestore, 'businesses'), where('businessCode', '==', code)));
    if (snap.empty) return code;
  }
};

// Resolves which `businesses/{id}` Firestore doc backs a given LOCAL business
// (allBusinessData entry). Business "1" keeps the legacy `biz_${uid}` doc id;
// every other local business uses `biz_${uid}_${localId}` (see addBusiness()
// in DataContext.jsx, which mints these on creation). Prefers an explicit
// `business.firestoreBizDocId` if already resolved/stamped.
export const resolveBizDocId = (business, ownerUid) => {
  if (!business) return null;
  if (business.firestoreBizDocId) return business.firestoreBizDocId;
  if (!ownerUid) return null;
  return String(business.id ?? business._key) === '1'
    ? `biz_${ownerUid}`
    : `biz_${ownerUid}_${business.id ?? business._key}`;
};

// Live-subscribes to the `businesses/{id}` doc (code/password/etc.) for a
// specific LOCAL business — shared by every place that needs to check/display
// a per-business code or password (Settings.jsx, Layout.jsx business switcher)
// instead of each rolling its own onSnapshot + id-resolution logic.
export const useBusinessAuthDoc = (business, ownerUid) => {
  const [authDoc, setAuthDoc] = useState(null);
  const bizDocId = resolveBizDocId(business, ownerUid);

  useEffect(() => {
    if (!bizDocId) { setAuthDoc(null); return; }
    const ref = doc(firestore, 'businesses', bizDocId);
    const unsub = onSnapshot(ref,
      snap => setAuthDoc(snap.exists() ? { id: snap.id, ...snap.data() } : { id: bizDocId }),
      err => console.error('Business auth doc load error:', err)
    );
    return unsub;
  }, [bizDocId]);

  return authDoc;
};
