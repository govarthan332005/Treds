import { auth, db, storage } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { ref, get, set, push, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { ref as sRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

let currentUser = null;
let userData = null;
let product = null;
let uploadedFile = null;
let savedAddresses = {};
let selectedSavedId = null;
let mapPickerLocation = null; // { lat, lng, full, short }

const urlParams = new URLSearchParams(window.location.search);
const productId = urlParams.get('id');

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = 'login.html'; return; }
    currentUser = user;
    const usnap = await get(ref(db, `users/${user.uid}`));
    userData = usnap.val() || {};

    if (userData.phone) document.getElementById('phoneInput').value = userData.phone;
    if (userData.username) document.getElementById('receiverName').value = userData.username;

    savedAddresses = userData.savedAddresses || {};
    renderSavedAddrPills();

    await loadProduct();
    document.getElementById('pageLoader').classList.add('hide');
});

async function loadProduct() {
    if (!productId) {
        showToast('Product not found', 'error');
        setTimeout(() => window.location.href = 'home.html', 1500);
        return;
    }
    const snap = await get(ref(db, `writings/${productId}`));
    if (!snap.exists()) {
        showToast('Product not found', 'error');
        setTimeout(() => window.location.href = 'home.html', 1500);
        return;
    }
    product = snap.val();
    renderProduct();
    setupDefaults();
}

function renderProduct() {
    document.getElementById('headerTitle').textContent = product.title;
    document.getElementById('productTitle').textContent = product.title;
    document.getElementById('productRating').textContent = product.rating;
    document.getElementById('reviewsCount').textContent = `${product.reviews} reviews`;
    document.getElementById('productDesc').textContent = product.description;
    document.getElementById('priceCurrent').textContent = `₹${product.pricePerPage}`;
    document.getElementById('minPagesNote').textContent = product.minPages;
    document.getElementById('pagesInput').value = product.minPages;
    document.getElementById('pagesInput').min = product.minPages;
    document.getElementById('sumPrice').textContent = product.pricePerPage;

    const images = product.sampleImages && product.sampleImages.length > 0 ? product.sampleImages : [product.image];
    const track = document.getElementById('galleryTrack');
    const dots = document.getElementById('galleryDots');
    track.innerHTML = images.map(img => `<img src="${img}" alt="" loading="lazy" decoding="async">`).join('');
    dots.innerHTML = images.map((_, i) => `<div class="dot ${i===0?'active':''}"></div>`).join('');

    if (images.length > 1) {
        let idx = 0;
        setInterval(() => {
            idx = (idx + 1) % images.length;
            track.style.transform = `translateX(-${idx * 100}%)`;
            dots.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('active', i === idx));
        }, 4000);
    }

    updateSummary();
}

function setupDefaults() {
    const now = new Date();
    const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(10, 0, 0, 0);
    const delivery = new Date(now); delivery.setDate(delivery.getDate() + 4); delivery.setHours(18, 0, 0, 0);
    document.getElementById('pickupTime').value = toLocalISO(tomorrow);
    document.getElementById('deliveryTime').value = toLocalISO(delivery);
}

function toLocalISO(d) {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ===== Pages counter =====
window.changePages = function(delta) {
    const input = document.getElementById('pagesInput');
    const min = parseInt(input.min) || 1;
    let val = parseInt(input.value) || min;
    val = Math.max(min, val + delta);
    input.value = val;
    updateSummary();
};
document.getElementById('pagesInput').addEventListener('input', updateSummary);

function updateSummary() {
    const pages = parseInt(document.getElementById('pagesInput').value) || 0;
    const price = product ? product.pricePerPage : 0;
    const subtotal = pages * price;
    const delivery = 40;
    const platform = 10;
    const total = subtotal + delivery + platform;
    document.getElementById('sumPages').textContent = pages;
    document.getElementById('sumSubtotal').textContent = subtotal;
    document.getElementById('sumTotal').textContent = total;
    document.getElementById('ctaTotal').textContent = total;
}

// ===== Option chips =====
document.querySelectorAll('.option-row').forEach(row => {
    row.addEventListener('click', (e) => {
        if (e.target.classList.contains('option-chip')) {
            row.querySelectorAll('.option-chip').forEach(c => c.classList.remove('active'));
            e.target.classList.add('active');
            if (e.target.dataset.content === 'upload') {
                document.getElementById('uploadSection').style.display = 'block';
                document.getElementById('handoverSection').style.display = 'none';
            } else if (e.target.dataset.content === 'handover') {
                document.getElementById('uploadSection').style.display = 'none';
                document.getElementById('handoverSection').style.display = 'block';
            }
        }
    });
});

// ===== File upload =====
document.getElementById('fileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { showToast('File too large (max 20MB)', 'error'); return; }
    uploadedFile = file;
    document.getElementById('filename').textContent = `✓ ${file.name}`;
});

// ===== Auto-compose full address as fields change =====
['addrFlat', 'addrBuilding', 'addrArea', 'addrLandmark'].forEach(id => {
    document.getElementById(id).addEventListener('input', composeAddress);
});
function composeAddress() {
    const flat = document.getElementById('addrFlat').value.trim();
    const building = document.getElementById('addrBuilding').value.trim();
    const area = document.getElementById('addrArea').value.trim();
    const landmark = document.getElementById('addrLandmark').value.trim();
    const composed = [flat, building, area, landmark ? `Landmark: ${landmark}` : '']
        .filter(Boolean).join(', ');
    document.getElementById('addressInput').value = composed;
}

// ===== Saved address pills =====
function renderSavedAddrPills() {
    const wrap = document.getElementById('savedAddrPills');
    const list = Object.values(savedAddresses || {}).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (!list.length) { wrap.innerHTML = ''; return; }
    const icons = { home: '🏠', work: '🏢', other: '📍' };
    wrap.innerHTML = list.map(a => `
        <div class="saved-addr-pill" data-id="${a.id}">
            <div class="sp-type">${icons[a.type] || '📍'} ${(a.type || 'OTHER').toUpperCase()}</div>
            <div class="sp-line">${a.line || a.full || ''}</div>
        </div>
    `).join('');
    wrap.querySelectorAll('.saved-addr-pill').forEach(p => {
        p.addEventListener('click', () => {
            wrap.querySelectorAll('.saved-addr-pill').forEach(x => x.classList.remove('active'));
            p.classList.add('active');
            selectedSavedId = p.dataset.id;
            const a = savedAddresses[selectedSavedId];
            if (!a) return;
            document.getElementById('addrFlat').value = a.flat || '';
            document.getElementById('addrBuilding').value = a.building || '';
            document.getElementById('addrArea').value = a.short || (a.full ? a.full.split(',').slice(0, 2).join(',') : '');
            document.getElementById('addrLandmark').value = a.landmark || '';
            // pick type chip
            document.querySelectorAll('#addrTypeRow .option-chip').forEach(c => c.classList.toggle('active', c.dataset.atype === a.type));
            composeAddress();
            mapPickerLocation = a.lat ? { lat: a.lat, lng: a.lng, full: a.full, short: a.short } : null;
        });
    });
    // Auto-select first
    if (!selectedSavedId && wrap.firstElementChild) wrap.firstElementChild.click();
}

// ===== Use current location =====
document.getElementById('useCurrentLoc').addEventListener('click', () => {
    if (!navigator.geolocation) return showToast('Geolocation not supported', 'error');
    showToast('Detecting location...', '');
    navigator.geolocation.getCurrentPosition(async (pos) => {
        try {
            const { latitude, longitude } = pos.coords;
            const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`, { headers: { 'Accept-Language': 'en' } });
            const d = await r.json();
            const a = d.address || {};
            const short = [a.road || a.pedestrian || a.neighbourhood, a.suburb, a.city || a.town || a.village].filter(Boolean).join(', ');
            document.getElementById('addrArea').value = short || d.display_name.split(',').slice(0, 2).join(',');
            mapPickerLocation = { lat: latitude, lng: longitude, full: d.display_name, short };
            composeAddress();
            showToast('Location filled ✓', 'success');
        } catch (e) { showToast('Failed to get address', 'error'); }
    }, () => showToast('Permission denied', 'error'), { enableHighAccuracy: true, timeout: 8000 });
});

/* =============== MAP PICKER MODAL =============== */
const mapModal = document.getElementById('mapModal');
let orderMap, orderMarker, orderMapInited = false;
let reverseTO;

document.getElementById('pickOnMapBtn').addEventListener('click', () => {
    mapModal.classList.add('active');
    setTimeout(initOrderMap, 80);
});
document.getElementById('closeMapModal').addEventListener('click', () => mapModal.classList.remove('active'));
mapModal.addEventListener('click', (e) => { if (e.target === mapModal) mapModal.classList.remove('active'); });

function initOrderMap() {
    if (orderMapInited) { orderMap.invalidateSize(); return; }
    if (typeof L === 'undefined') { setTimeout(initOrderMap, 200); return; }
    orderMapInited = true;
    const center = mapPickerLocation && mapPickerLocation.lat
        ? [mapPickerLocation.lat, mapPickerLocation.lng]
        : (userData.location ? [userData.location.lat, userData.location.lng] : [20.5937, 78.9629]);
    const zoom = (mapPickerLocation && mapPickerLocation.lat) || userData.location ? 17 : 5;
    orderMap = L.map('orderMapPicker', { zoomControl: true, attributionControl: false }).setView(center, zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(orderMap);
    orderMap.on('moveend', () => {
        const c = orderMap.getCenter();
        clearTimeout(reverseTO);
        reverseTO = setTimeout(() => orderReverseGeo(c.lat, c.lng), 400);
    });
    if (zoom > 10) orderReverseGeo(center[0], center[1]);
    else detectOrderGPS();
}

document.getElementById('mapGPS').addEventListener('click', detectOrderGPS);
function detectOrderGPS() {
    if (!navigator.geolocation) return showToast('Geolocation not supported', 'error');
    navigator.geolocation.getCurrentPosition((pos) => {
        if (orderMap) orderMap.setView([pos.coords.latitude, pos.coords.longitude], 17, { animate: true });
    }, () => showToast('Location permission denied', 'error'), { enableHighAccuracy: true, timeout: 8000 });
}

async function orderReverseGeo(lat, lng) {
    const lineEl = document.getElementById('orderDetectedLine');
    const subEl = document.getElementById('orderDetectedSub');
    document.getElementById('orderDetectedAddr').style.display = 'flex';
    lineEl.textContent = 'Detecting...';
    subEl.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, { headers: { 'Accept-Language': 'en' } });
        const d = await r.json();
        const a = d.address || {};
        const short = [a.road || a.pedestrian || a.neighbourhood, a.suburb, a.city || a.town || a.village].filter(Boolean).join(', ');
        lineEl.textContent = short || d.display_name;
        subEl.textContent = d.display_name;
        mapPickerLocation = { lat, lng, full: d.display_name, short: short || d.display_name.split(',').slice(0, 2).join(',') };
    } catch (e) {
        lineEl.textContent = 'Could not fetch address';
    }
}

document.getElementById('confirmMapAddr').addEventListener('click', () => {
    if (!mapPickerLocation) return showToast('Move the pin to a location', 'error');
    document.getElementById('addrArea').value = mapPickerLocation.short;
    composeAddress();
    mapModal.classList.remove('active');
    showToast('Location set from map ✓', 'success');
});

/* =============== PLACE ORDER =============== */
document.getElementById('placeOrderBtn').addEventListener('click', async () => {
    const pages = parseInt(document.getElementById('pagesInput').value);
    const minPages = parseInt(document.getElementById('pagesInput').min);
    const pickup = document.getElementById('pickupTime').value;
    const delivery = document.getElementById('deliveryTime').value;
    const receiver = document.getElementById('receiverName').value.trim();
    const phone = document.getElementById('phoneInput').value.trim();
    const flat = document.getElementById('addrFlat').value.trim();
    const building = document.getElementById('addrBuilding').value.trim();
    const area = document.getElementById('addrArea').value.trim();
    const landmark = document.getElementById('addrLandmark').value.trim();
    const address = document.getElementById('addressInput').value.trim();
    const instructions = document.getElementById('instructions').value.trim();
    const addrType = document.querySelector('#addrTypeRow .option-chip.active').dataset.atype;

    const contentType = document.querySelector('[data-content].active').dataset.content;
    const writingStyle = document.querySelector('[data-style].active').dataset.style;
    const paperType = document.querySelector('[data-paper].active').dataset.paper;
    const payMethod = document.querySelector('[data-pay].active').dataset.pay;

    // Validation
    if (pages < minPages) return showToast(`Minimum ${minPages} pages required`, 'error');
    if (!pickup || !delivery) return showToast('Set pickup & delivery time', 'error');
    if (new Date(delivery) <= new Date(pickup)) return showToast('Delivery must be after pickup', 'error');
    if (!receiver) return showToast('Enter receiver name', 'error');
    if (!phone || phone.replace(/\D/g, '').length < 10) return showToast('Valid phone required', 'error');
    if (!flat) return showToast('Enter flat / floor / door no.', 'error');
    if (!building) return showToast('Enter building / society name', 'error');
    if (!area) return showToast('Enter area / street', 'error');
    if (!address) return showToast('Address could not be composed', 'error');
    if (contentType === 'upload' && !uploadedFile) return showToast('Upload your content file', 'error');

    const btn = document.getElementById('placeOrderBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Placing order...';

    try {
        let fileURL = null;
        if (uploadedFile) {
            try {
                const fileRef = sRef(storage, `orders/${currentUser.uid}/${Date.now()}_${uploadedFile.name}`);
                await uploadBytes(fileRef, uploadedFile);
                fileURL = await getDownloadURL(fileRef);
            } catch (e) {
                console.warn('Storage upload failed:', e);
                fileURL = uploadedFile.name;
            }
        }

        const orderId = 'WRT' + Date.now().toString().slice(-8) + Math.floor(Math.random()*99).toString().padStart(2,'0');
        const subtotal = pages * product.pricePerPage;
        const total = subtotal + 40 + 10;

        const addressObj = {
            receiverName: receiver,
            phone,
            flat,
            building,
            area,
            landmark,
            full: address,
            type: addrType,
            location: mapPickerLocation && mapPickerLocation.lat
                ? { lat: mapPickerLocation.lat, lng: mapPickerLocation.lng }
                : (userData.location || null)
        };

        const orderData = {
            orderId,
            userId: currentUser.uid,
            username: userData.username,
            userEmail: userData.email,
            productId: product.id,
            productTitle: product.title,
            productImage: product.image,
            writerName: product.writer,
            pages,
            pricePerPage: product.pricePerPage,
            subtotal,
            deliveryCharge: 40,
            platformFee: 10,
            totalAmount: total,
            writingStyle,
            paperType,
            contentType,
            fileURL,
            handoverNotes: contentType === 'handover' ? document.getElementById('handoverNotes').value : null,
            instructions,
            pickupTime: pickup,
            deliveryTime: delivery,
            address,             // composed string (backward-compat)
            addressDetails: addressObj,
            phone,
            paymentMethod: payMethod,
            paymentStatus: 'pending',
            status: 'placed',
            statusHistory: [
                { status: 'placed', timestamp: Date.now(), note: 'Order placed successfully' }
            ],
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        await set(ref(db, `orders/${orderId}`), orderData);
        await set(ref(db, `userOrders/${currentUser.uid}/${orderId}`), { orderId, createdAt: Date.now() });

        // Save the address to user's savedAddresses for next time
        const addrId = 'addr_' + Date.now();
        const savePayload = {
            id: addrId,
            type: addrType,
            flat, building, landmark,
            line: address,
            full: address,
            short: area,
            lat: addressObj.location ? addressObj.location.lat : null,
            lng: addressObj.location ? addressObj.location.lng : null,
            receiverName: receiver,
            phone,
            createdAt: Date.now()
        };
        await update(ref(db, `users/${currentUser.uid}/savedAddresses/${addrId}`), savePayload);

        // Update user profile last-used
        await update(ref(db, `users/${currentUser.uid}`), { phone, address, location: addressObj.location || null });

        showToast('Order placed successfully! 🎉', 'success');
        setTimeout(() => window.location.href = `order-detail.html?id=${orderId}`, 1200);
    } catch (e) {
        console.error(e);
        showToast('Failed to place order. Try again.', 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-bag-shopping"></i> Place Order';
    }
});

function showToast(msg, type = '') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = `toast show ${type}`;
    setTimeout(() => toast.classList.remove('show'), 2500);
}
