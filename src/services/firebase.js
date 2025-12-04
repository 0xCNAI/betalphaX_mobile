import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
    apiKey: "AIzaSyAMMk37tmdFOXULC9BJPJmJ3rAyB20AYBg",
    authDomain: "betalphapick.firebaseapp.com",
    projectId: "betalphapick",
    storageBucket: "betalphapick.firebasestorage.app",
    messagingSenderId: "1069329661064",
    appId: "1:1069329661064:web:69246bab3d6497dee4f33d",
    measurementId: "G-N3H568MC2K"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const analytics = getAnalytics(app);
