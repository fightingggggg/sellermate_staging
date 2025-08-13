import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAxZ0lTXab1JALiNnHKAx2_N7hlr84YSN0",
  authDomain: "smartstoreseo.firebaseapp.com",
  projectId: "smartstoreseo",
  storageBucket:  "smartstoreseo.appspot.com",
  messagingSenderId: "1034657335294",
  appId:"1:1034657335294:web:c3d36cc05995a9f078e2af",
  measurementId: "G-R2MZHJPS6G"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;
