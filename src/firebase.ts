import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDmLB62gKnNKh4aBCdq5NskFt-Acc-7L_A",
  authDomain: "repair--project.firebaseapp.com",
  projectId: "repair--project",
  storageBucket: "repair--project.firebasestorage.app",
  messagingSenderId: "9922849217",
  appId: "1:9922849217:web:7af0a846f417576dd42740",
  measurementId: "G-17HRE6QJ7B"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);