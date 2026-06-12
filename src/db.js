// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, getDoc, updateDoc, onSnapshot, writeBatch } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyB54F1zEhVyQHya1oqBl-reWC2aTOF6h5Y",
  authDomain: "tallykraftdev.firebaseapp.com",
  projectId: "tallykraftdev",
  storageBucket: "tallykraftdev.firebasestorage.app",
  messagingSenderId: "1006461670204",
  appId: "1:1006461670204:web:d2a7e606df837e01564439"
}
// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const firestore = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();