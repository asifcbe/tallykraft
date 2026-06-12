import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, googleProvider, firestore } from './db';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import {
  collection, doc, setDoc, getDoc, getDocs, deleteDoc, query, where
} from 'firebase/firestore';
import { isAlwaysAdmin } from './alwaysAdmin';

const AuthContext = createContext();

const generateBusinessCode = () => {
  // Avoid ambiguous chars (O/0, I/1/l)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
};

const ensureUniquCode = async (attempt = 0) => {
  const code = generateBusinessCode();
  if (attempt > 3) return code; // Give up after a few tries — collision chance is tiny
  const snap = await getDocs(query(collection(firestore, 'businesses'), where('businessCode', '==', code)));
  return snap.empty ? code : ensureUniquCode(attempt + 1);
};

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authError, setAuthError] = useState('');
  const [staffSession, setStaffSession] = useState(null);
  const [currentBusiness, setCurrentBusiness] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const email = user.email || '';
          const userConfigRef = doc(firestore, 'userConfig', email);
          const userConfigSnap = await getDoc(userConfigRef);
          let allowed = false;
          let adminFlag = false;
          let businessId = null;

          if (!userConfigSnap.exists()) {
            // First user bootstrap
            const cfgCollection = collection(firestore, 'userConfig');
            const existingCfg = await getDocs(cfgCollection);

            if (existingCfg.empty) {
              await setDoc(userConfigRef, {
                email,
                allowed: true,
                isAdmin: true,
                config: {
                  businessType: 'general',
                  features: {
                    dashboard: true, parties: true, items: true, sales: true,
                    purchases: true, expenses: true, opticals: false, payments: true,
                    reports: true, backup: true, settings: true, estimates: false,
                    creditNotes: false, deliveryNotes: false, journal: false
                  },
                  multiBusiness: true,
                  useIndexedDB: true,
                  theme: { primaryColor: '#1976d2', secondaryColor: '#dc004e' }
                }
              });
              allowed = true;
              adminFlag = true;
            } else {
              // New user — auto-allow; data stays local by default (no cloud backup)
              await setDoc(userConfigRef, { email, allowed: true, isAdmin: false, config: { backupOnlineEnabled: false } });
              allowed = true;
              adminFlag = false;
            }
          } else {
            const data = userConfigSnap.data();
            allowed = data.allowed !== false;
            adminFlag = !!data.isAdmin;
            businessId = data.businessId || null;
          }

          // VITE_ALWAYSADMIN super-admin: always authorized + admin, no matter
          // what Firestore says. Guarantees the app owner can't be locked out.
          if (isAlwaysAdmin(email)) {
            allowed = true;
            adminFlag = true;
          }

          setIsAuthenticated(true);
          setCurrentUser(user);
          setIsAuthorized(allowed);
          setIsAdmin(adminFlag);
          setStaffSession(null);
          setAuthError(
            allowed
              ? ''
              : 'Your email is not authorized to access this application. Please contact the administrator.'
          );

          // Auto-create/load business for admin users (never blocks the app)
          if (allowed && adminFlag) {
            if (!businessId) {
              // Silently create a business in the background so staff features are ready
              try {
                const code = await ensureUniquCode();
                const newBizId = `biz_${user.uid}`;
                const newBizData = {
                  id: newBizId,
                  name: user.displayName || (user.email?.split('@')[0] || 'My Business'),
                  businessType: 'general',
                  ownerId: user.uid,
                  ownerEmail: user.email,
                  businessCode: code,
                  createdAt: new Date()
                };
                await setDoc(doc(firestore, 'businesses', newBizId), newBizData);
                await setDoc(userConfigRef, { businessId: newBizId }, { merge: true });
                setCurrentBusiness(newBizData);
              } catch (bizErr) {
                console.warn('Could not auto-create business:', bizErr);
                setCurrentBusiness(null);
              }
            } else {
              // Load existing business
              try {
                const bizSnap = await getDoc(doc(firestore, 'businesses', businessId));
                if (bizSnap.exists()) {
                  setCurrentBusiness({ id: bizSnap.id, ...bizSnap.data() });
                } else {
                  setCurrentBusiness(null);
                }
              } catch (_) {
                setCurrentBusiness(null);
              }
            }
          }

          // Maintain user profile document
          const userDocRef = doc(firestore, 'users', user.uid);
          const userDoc = await getDoc(userDocRef);
          if (allowed) {
            if (!userDoc.exists()) {
              await setDoc(userDocRef, {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName,
                photoURL: user.photoURL,
                createdAt: new Date(),
                lastLogin: new Date()
              });
            } else {
              await setDoc(userDocRef, { lastLogin: new Date() }, { merge: true });
            }
          } else {
            if (userDoc.exists()) await deleteDoc(userDocRef);
          }
        } catch (err) {
          console.error('Error checking user access:', err);
          setIsAuthorized(false);
          setIsAdmin(false);
          setAuthError('Unable to verify access. Please try again later.');
        }
      } else {
        // No Firebase user — restore staff session from sessionStorage if present
        const savedStaff = sessionStorage.getItem('staffSession');
        if (savedStaff) {
          try {
            const staff = JSON.parse(savedStaff);
            setStaffSession(staff);
            setIsAuthenticated(true);
            setIsAuthorized(true);
            setIsAdmin(false);
            setCurrentUser(null);
            setCurrentBusiness({ id: staff.businessId, name: staff.businessName });
          } catch (_) {
            sessionStorage.removeItem('staffSession');
            resetGuestState();
          }
        } else {
          resetGuestState();
        }
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const resetGuestState = () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    setIsAuthorized(false);
    setIsAdmin(false);
    setStaffSession(null);
    setCurrentBusiness(null);
    setAuthError('');
  };

  const loginWithGoogle = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      return { success: true, user: result.user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const loginAsStaff = async (businessCode, username, password) => {
    try {
      const trimCode = businessCode.trim().toUpperCase();

      // Find business by code
      const bizQuery = query(
        collection(firestore, 'businesses'),
        where('businessCode', '==', trimCode)
      );
      const bizSnap = await getDocs(bizQuery);

      if (bizSnap.empty) {
        return { success: false, error: 'Invalid business code. Please check with your employer.' };
      }

      const bizDoc = bizSnap.docs[0];
      const business = { id: bizDoc.id, ...bizDoc.data() };

      // Find staff by username (stored lowercase)
      const staffQuery = query(
        collection(firestore, 'businesses', business.id, 'staff'),
        where('username', '==', username.trim().toLowerCase())
      );
      const staffSnap = await getDocs(staffQuery);

      if (staffSnap.empty) {
        return { success: false, error: 'Invalid username or password.' };
      }

      const staffDoc = staffSnap.docs[0];
      const staffData = staffDoc.data();

      if (staffData.active === false) {
        return { success: false, error: 'Your account has been deactivated. Contact your employer.' };
      }

      if (staffData.password !== password) {
        return { success: false, error: 'Invalid username or password.' };
      }

      const session = {
        id: staffDoc.id,
        name: staffData.name,
        username: staffData.username,
        features: staffData.features || {},
        businessId: business.id,
        businessName: business.name,
        ownerUid: business.ownerId,
        role: 'staff'
      };

      sessionStorage.setItem('staffSession', JSON.stringify(session));
      setStaffSession(session);
      setCurrentBusiness(business);
      setIsAuthenticated(true);
      setIsAuthorized(true);
      setIsAdmin(false);
      setCurrentUser(null);

      return { success: true };
    } catch (err) {
      console.error('Staff login error:', err);
      return { success: false, error: 'Login failed. Please try again.' };
    }
  };

  const logout = async () => {
    try {
      if (staffSession) {
        sessionStorage.removeItem('staffSession');
        resetGuestState();
        return { success: true };
      }
      await signOut(auth);
      setCurrentBusiness(null);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  return (
    <AuthContext.Provider value={{
      isAuthenticated,
      currentUser,
      loading,
      isAuthorized,
      isAdmin,
      authError,
      staffSession,
      currentBusiness,
      loginWithGoogle,
      loginAsStaff,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
