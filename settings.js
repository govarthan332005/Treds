import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { ref, get, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

let currentUser = null;
let userData = null;

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = 'login.html'; return; }
    currentUser = user;
    const snap = await get(ref(db, `users/${user.uid}`));
    userData = snap.val() || {};
    
    document.getElementById('profileAvatar').textContent = (userData.username || 'U').charAt(0).toUpperCase();
    document.getElementById('profileName').textContent = userData.username || 'User';
    document.getElementById('profileEmail').textContent = userData.email || '';
    document.getElementById('addressDesc').textContent = userData.address || 'No saved addresses';
    
    // Load preferences
    const prefs = userData.preferences || { notifications: true, locationServices: true, emailUpdates: false };
    document.querySelectorAll('.setting-toggle').forEach(t => {
        const k = t.dataset.key;
        if (prefs[k]) t.classList.add('active');
        else t.classList.remove('active');
    });
    
    document.getElementById('pageLoader').classList.add('hide');
});

// ===== Modals =====
window.openModal = function(name) {
    if (name === 'editProfile') {
        document.getElementById('editUsername').value = userData.username || '';
        document.getElementById('editPhone').value = userData.phone || '';
        document.getElementById('editAddress').value = userData.address || '';
    } else if (name === 'addresses') {
        document.getElementById('addrInput').value = userData.address || '';
    }
    document.getElementById(name + 'Modal').classList.add('active');
};

window.closeModal = function(name) {
    document.getElementById(name + 'Modal').classList.remove('active');
};

document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', (e) => {
        if (e.target === m) m.classList.remove('active');
    });
});

document.getElementById('editProfileBtn').addEventListener('click', () => openModal('editProfile'));

// ===== Save Profile =====
document.getElementById('saveProfileBtn').addEventListener('click', async () => {
    const username = document.getElementById('editUsername').value.trim();
    const phone = document.getElementById('editPhone').value.trim();
    const address = document.getElementById('editAddress').value.trim();
    
    if (username.length < 3) return showToast('Username too short', 'error');
    
    try {
        await update(ref(db, `users/${currentUser.uid}`), { username, phone, address });
        userData.username = username;
        userData.phone = phone;
        userData.address = address;
        document.getElementById('profileName').textContent = username;
        document.getElementById('profileAvatar').textContent = username.charAt(0).toUpperCase();
        document.getElementById('addressDesc').textContent = address || 'No saved addresses';
        closeModal('editProfile');
        showToast('Profile updated ✓', 'success');
    } catch (e) {
        showToast('Failed to update', 'error');
    }
});

// ===== Address =====
document.getElementById('saveAddrBtn').addEventListener('click', async () => {
    const addr = document.getElementById('addrInput').value.trim();
    if (!addr) return showToast('Enter an address', 'error');
    await update(ref(db, `users/${currentUser.uid}`), { address: addr });
    userData.address = addr;
    document.getElementById('addressDesc').textContent = addr;
    closeModal('addresses');
    showToast('Address saved ✓', 'success');
});

document.getElementById('useGPSBtn').addEventListener('click', () => {
    navigator.geolocation.getCurrentPosition(async (pos) => {
        try {
            const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`);
            const d = await r.json();
            document.getElementById('addrInput').value = d.display_name || '';
            showToast('Location detected ✓', 'success');
        } catch (e) { showToast('Failed to get location', 'error'); }
    }, () => showToast('Permission denied', 'error'));
});

// ===== Toggle Settings =====
window.toggleSetting = async function(key, el) {
    const toggle = el.querySelector('.setting-toggle');
    if (!toggle) return;
    toggle.classList.toggle('active');
    const value = toggle.classList.contains('active');
    await update(ref(db, `users/${currentUser.uid}/preferences`), { [key]: value });
    showToast(`${key} ${value ? 'enabled' : 'disabled'}`, 'success');
};

// ===== Logout =====
window.logout = async function() {
    if (!confirm('Are you sure you want to logout?')) return;
    sessionStorage.setItem('signingOut', '1');
    await signOut(auth);
    sessionStorage.removeItem('signingOut');
    window.location.href = 'login.html';
};

function showToast(msg, type = '') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = `toast show ${type}`;
    setTimeout(() => toast.classList.remove('show'), 2500);
}
