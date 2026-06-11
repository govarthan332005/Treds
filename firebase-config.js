// Firebase Configuration
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyDAisnBAmG3qGyjA_lkzSDrWccNxyr2jMc",
    authDomain: "slice-investment.firebaseapp.com",
    databaseURL: "https://slice-investment-default-rtdb.firebaseio.com",
    projectId: "slice-investment",
    storageBucket: "slice-investment.firebasestorage.app",
    messagingSenderId: "263752083276",
    appId: "1:263752083276:web:03b4f22872ccec55c3d1e9",
    measurementId: "G-4J9033N8WS"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
export const storage = getStorage(app);
export default app;
