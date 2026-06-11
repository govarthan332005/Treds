import { auth, db } from './firebase-config.js';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    setPersistence,
    browserLocalPersistence,
    browserSessionPersistence,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { ref, set, get, child, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ===== Redirect if already logged in =====
onAuthStateChanged(auth, (user) => {
    if (user && window.location.pathname.endsWith('login.html') || window.location.pathname.endsWith('index.html') || (user && window.location.pathname === '/' )) {
        // Check if not signing out
        if (!sessionStorage.getItem('signingOut')) {
            window.location.href = 'home.html';
        }
    }
});

// ===== Tab Switcher =====
const tabBtns = document.querySelectorAll('.tab-btn');
const tabSwitcher = document.querySelector('.tab-switcher');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        tabSwitcher.dataset.active = tab;
        
        if (tab === 'login') {
            loginForm.classList.add('active');
            signupForm.classList.remove('active');
        } else {
            signupForm.classList.add('active');
            loginForm.classList.remove('active');
        }
    });
});

// ===== Password Toggle =====
document.querySelectorAll('.toggle-pw').forEach(icon => {
    icon.addEventListener('click', () => {
        const input = icon.parentElement.querySelector('input');
        if (input.type === 'password') {
            input.type = 'text';
            icon.classList.replace('fa-eye', 'fa-eye-slash');
        } else {
            input.type = 'password';
            icon.classList.replace('fa-eye-slash', 'fa-eye');
        }
    });
});

// ===== Helpers =====
function showError(id, msg) {
    const el = document.getElementById(id);
    el.textContent = msg;
    setTimeout(() => el.textContent = '', 5000);
}

function setLoading(btn, loading) {
    if (loading) btn.classList.add('loading');
    else btn.classList.remove('loading');
}

// ===== SIGNUP =====
signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('signupUsername').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    const btn = signupForm.querySelector('.submit-btn');

    if (username.length < 3) { showError('signupError', 'Username must be at least 3 characters'); return; }
    if (password.length < 6) { showError('signupError', 'Password must be at least 6 characters'); return; }

    setLoading(btn, true);

    try {
        // Check if username already taken
        const usersRef = ref(db, 'users');
        const snap = await get(usersRef);
        if (snap.exists()) {
            const users = snap.val();
            const taken = Object.values(users).some(u => u.username && u.username.toLowerCase() === username.toLowerCase());
            if (taken) {
                setLoading(btn, false);
                showError('signupError', 'Username already taken');
                return;
            }
        }

        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await set(ref(db, `users/${cred.user.uid}`), {
            uid: cred.user.uid,
            username,
            email,
            createdAt: Date.now(),
            role: 'user',
            phone: '',
            address: '',
            location: null
        });
        // Also create a username index
        await set(ref(db, `usernames/${username.toLowerCase()}`), email);
        window.location.href = 'home.html';
    } catch (err) {
        setLoading(btn, false);
        let msg = err.message;
        if (err.code === 'auth/email-already-in-use') msg = 'Email already registered';
        else if (err.code === 'auth/weak-password') msg = 'Password is too weak';
        else if (err.code === 'auth/invalid-email') msg = 'Invalid email address';
        showError('signupError', msg);
    }
});

// ===== LOGIN =====
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    let identifier = document.getElementById('loginIdentifier').value.trim();
    const password = document.getElementById('loginPassword').value;
    const remember = document.getElementById('rememberMe').checked;
    const btn = loginForm.querySelector('.submit-btn');

    setLoading(btn, true);

    try {
        // Persistence
        await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);

        // If identifier is username (no @), look up email
        if (!identifier.includes('@')) {
            const unameSnap = await get(ref(db, `usernames/${identifier.toLowerCase()}`));
            if (!unameSnap.exists()) {
                setLoading(btn, false);
                showError('loginError', 'Username not found');
                return;
            }
            identifier = unameSnap.val();
        }

        await signInWithEmailAndPassword(auth, identifier, password);
        window.location.href = 'home.html';
    } catch (err) {
        setLoading(btn, false);
        let msg = 'Login failed. Check your credentials.';
        if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
            msg = 'Invalid email/username or password';
        } else if (err.code === 'auth/too-many-requests') {
            msg = 'Too many attempts. Try again later.';
        }
        showError('loginError', msg);
    }
});
