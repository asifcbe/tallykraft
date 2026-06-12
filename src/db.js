// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, getDoc, updateDoc, onSnapshot, writeBatch } from 'firebase/firestore';

// Your web app's Firebase configuration
const firebaseConfigsolobook = {
  apiKey: "AIzaSyDMX1vuI2zS2ZMyfMIwmqRKeqQgNU7Ch4w",
  authDomain: "accounting-648fa.firebaseapp.com",
  projectId: "accounting-648fa",
  storageBucket: "accounting-648fa.firebasestorage.app",
  messagingSenderId: "537358440365",
  appId: "1:537358440365:web:6d1fa0a66de12b14d8b324"
};
const firebaseConfigsolobookDev = {
  apiKey: "AIzaSyDc_QNnsDR7eI1YvOOt453gyJUldOJwSiw",
  authDomain: "solobookdev.firebaseapp.com",
  projectId: "solobookdev",
  storageBucket: "solobookdev.firebasestorage.app",
  messagingSenderId: "653030630222",
  appId: "1:653030630222:web:7856bf590fcb413a7c741f"
};
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