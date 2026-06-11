import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { ref, get, set, update, push, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

let currentUser = null;
let userData = null;
let allWritings = [];
let currentCategory = 'all';
let savedAddresses = {}; // { addrId: { ... } }

// ===== Sample Writings Data =====
const sampleWritings = [
    { id: 'w001', title: 'Math Assignment Pro', category: 'assignment', description: 'Neat handwritten math assignments with diagrams. Perfect for engineering & high school students.', image: 'https://images.unsplash.com/photo-1635372722656-389f87a941b7?w=600&q=80', pricePerPage: 15, minPages: 5, rating: 4.8, reviews: 234, deliveryTime: '2-3 days', writer: 'Priya S.', sampleImages: ['https://images.unsplash.com/photo-1635372722656-389f87a941b7?w=600&q=80','https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=600&q=80'] },
    { id: 'w002', title: 'Chemistry Lab Record', category: 'record', description: 'Detailed lab records with neat experiments, observations and diagrams.', image: 'https://images.unsplash.com/photo-1532634922-8fe0b757fb13?w=600&q=80', pricePerPage: 20, minPages: 10, rating: 4.9, reviews: 412, deliveryTime: '3-4 days', writer: 'Rahul K.', sampleImages: ['https://images.unsplash.com/photo-1532634922-8fe0b757fb13?w=600&q=80','https://images.unsplash.com/photo-1453733190371-0a9bedd82893?w=600&q=80'] },
    { id: 'w003', title: 'English Essay Writer', category: 'essay', description: 'Creative & well-structured essays in beautiful cursive handwriting.', image: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?w=600&q=80', pricePerPage: 12, minPages: 3, rating: 4.7, reviews: 189, deliveryTime: '1-2 days', writer: 'Anjali M.', sampleImages: ['https://images.unsplash.com/photo-1455390582262-044cdead277a?w=600&q=80'] },
    { id: 'w004', title: 'Physics Project File', category: 'project', description: 'Complete project files with diagrams, graphs and detailed explanations.', image: 'https://images.unsplash.com/photo-1576086213369-97a306d36557?w=600&q=80', pricePerPage: 25, minPages: 15, rating: 4.8, reviews: 156, deliveryTime: '4-5 days', writer: 'Vikram J.', sampleImages: ['https://images.unsplash.com/photo-1576086213369-97a306d36557?w=600&q=80'] },
    { id: 'w005', title: 'Quick Class Notes', category: 'notes', description: 'Crisp & clean class notes with highlights and important points.', image: 'https://images.unsplash.com/photo-1517842645767-c639042777db?w=600&q=80', pricePerPage: 10, minPages: 5, rating: 4.6, reviews: 298, deliveryTime: '1-2 days', writer: 'Sneha R.', sampleImages: ['https://images.unsplash.com/photo-1517842645767-c639042777db?w=600&q=80'] },
    { id: 'w006', title: 'Biology Record Book', category: 'record', description: 'Detailed biology records with neat anatomical diagrams.', image: 'https://images.unsplash.com/photo-1530026405186-ed1f139313f8?w=600&q=80', pricePerPage: 22, minPages: 10, rating: 4.9, reviews: 367, deliveryTime: '3-4 days', writer: 'Karthik N.', sampleImages: ['https://images.unsplash.com/photo-1530026405186-ed1f139313f8?w=600&q=80'] },
    { id: 'w007', title: 'Computer Science Assignment', category: 'assignment', description: 'Programming assignments with code, output screenshots and explanations.', image: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=600&q=80', pricePerPage: 18, minPages: 6, rating: 4.7, reviews: 201, deliveryTime: '2-3 days', writer: 'Arjun T.', sampleImages: ['https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=600&q=80'] },
    { id: 'w008', title: 'History Essay Special', category: 'essay', description: 'Well-researched historical essays with proper structure and references.', image: 'https://images.unsplash.com/photo-1532153975070-2e9ab71f1b14?w=600&q=80', pricePerPage: 14, minPages: 4, rating: 4.8, reviews: 145, deliveryTime: '2-3 days', writer: 'Meera P.', sampleImages: ['https://images.unsplash.com/photo-1532153975070-2e9ab71f1b14?w=600&q=80'] }
];

// ===== INSTANT RENDER from cache (BEFORE Firebase) =====
if (window.__WRITELY_CACHE__) {
    allWritings = window.__WRITELY_CACHE__;
    renderWritings();
}

// ===== Auth Check =====
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    currentUser = user;

    // Fire user-data and writings fetches in PARALLEL (was sequential)
    const [usnap, wsnap] = await Promise.all([
        get(ref(db, `users/${user.uid}`)),
        get(ref(db, 'writings'))
    ]);

    userData = usnap.val() || {};
    document.getElementById('userAvatar').textContent = (userData.username || 'U').charAt(0).toUpperCase();

    if (userData.address) {
        document.getElementById('locationText').innerHTML = `${userData.address} <i class="fas fa-chevron-down" style="font-size:10px;"></i>`;
        localStorage.setItem('writely_address_v1', userData.address);
    }

    savedAddresses = userData.savedAddresses || {};

    // Writings
    if (!wsnap.exists()) {
        const seed = {};
        sampleWritings.forEach(w => { seed[w.id] = w; });
        set(ref(db, 'writings'), seed); // fire-and-forget
        allWritings = sampleWritings;
    } else {
        allWritings = Object.values(wsnap.val());
    }

    // Cache for next visit (instant load next time)
    try {
        localStorage.setItem('writely_cache_v1', JSON.stringify({ ts: Date.now(), data: allWritings }));
    } catch (e) {}

    renderWritings();
});

// ===== Render Writings =====
function renderWritings() {
    const grid = document.getElementById('writingsGrid');
    const searchTerm = (document.getElementById('searchInput').value || '').toLowerCase();

    let filtered = allWritings;
    if (currentCategory !== 'all') filtered = filtered.filter(w => w.category === currentCategory);
    if (searchTerm) {
        filtered = filtered.filter(w =>
            w.title.toLowerCase().includes(searchTerm) ||
            w.description.toLowerCase().includes(searchTerm)
        );
    }

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <h3>No results found</h3>
                <p>Try different keywords or categories</p>
            </div>`;
        return;
    }

    grid.innerHTML = filtered.map(w => `
        <div class="writing-card" onclick="window.location.href='product.html?id=${w.id}'">
            <div class="card-image">
                <img src="${w.image}" alt="${w.title}" loading="lazy" decoding="async" width="600" height="180">
                <div class="card-badge">⚡ ${w.deliveryTime}</div>
                <div class="card-fav" onclick="event.stopPropagation(); toggleFav('${w.id}', this)">
                    <i class="fas fa-heart"></i>
                </div>
            </div>
            <div class="card-body">
                <div class="card-title-row">
                    <div class="card-title">${w.title}</div>
                    <div class="rating-badge">
                        <i class="fas fa-star" style="font-size:10px;"></i>
                        ${w.rating}
                    </div>
                </div>
                <div class="card-desc">${w.description}</div>
                <div class="card-meta">
                    <div class="meta-info">
                        <span><i class="fas fa-user-pen"></i> ${w.writer}</span>
                        <span><i class="fas fa-file-lines"></i> ${w.minPages}+ pages</span>
                    </div>
                    <div class="card-price">₹${w.pricePerPage}<small>/page</small></div>
                </div>
            </div>
        </div>
    `).join('');
}

// ===== Favorite =====
window.toggleFav = async function(id, el) {
    el.classList.toggle('active');
    if (!currentUser) return;
    const favRef = ref(db, `users/${currentUser.uid}/favorites/${id}`);
    if (el.classList.contains('active')) {
        await set(favRef, true);
        showToast('Added to favorites ❤️', 'success');
    } else {
        await set(favRef, null);
        showToast('Removed from favorites', 'success');
    }
};

// ===== Filters / Search =====
document.querySelectorAll('.category-chip').forEach(chip => {
    chip.addEventListener('click', () => {
        document.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentCategory = chip.dataset.cat;
        renderWritings();
    });
});

let searchTO;
document.getElementById('searchInput').addEventListener('input', () => {
    clearTimeout(searchTO);
    searchTO = setTimeout(renderWritings, 120);
});

document.getElementById('heroExploreBtn')?.addEventListener('click', () => {
    document.querySelector('.writings-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

/* ===================================================================
   ZOMATO-STYLE LOCATION PICKER (Map + Search + Manual + Saved)
=================================================================== */
const locationModal = document.getElementById('locationModal');
let map, marker, mapLoaded = false;
let currentPickedAddress = null; // { lat, lng, full, short, components }

document.getElementById('locationBtn').addEventListener('click', openLocationModal);
document.getElementById('closeLocModal').addEventListener('click', closeLocationModal);
locationModal.addEventListener('click', (e) => { if (e.target === locationModal) closeLocationModal(); });

function openLocationModal() {
    locationModal.classList.add('active');
    renderSavedAddresses();
    // Lazy init map only when modal opens
    setTimeout(initMap, 80);
}
function closeLocationModal() { locationModal.classList.remove('active'); }

// Tabs
document.querySelectorAll('.loc-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.loc-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.loc-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const panelName = tab.dataset.panel;
        document.querySelector(`.loc-panel[data-panel="${panelName}"]`).classList.add('active');
        if (panelName === 'map' && map) setTimeout(() => map.invalidateSize(), 100);
    });
});

// ===== Map (Leaflet) =====
function initMap() {
    if (mapLoaded) { map.invalidateSize(); return; }
    if (typeof L === 'undefined') {
        // Leaflet not loaded yet, retry
        setTimeout(initMap, 200);
        return;
    }
    mapLoaded = true;

    const defaultCenter = [20.5937, 78.9629]; // India center
    map = L.map('mapPicker', {
        zoomControl: true,
        attributionControl: false
    }).setView(defaultCenter, 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OSM'
    }).addTo(map);

    // Use the center of the map as the pin (overlay) – update on movement
    map.on('moveend', onMapMoveEnd);

    // Try to auto-locate
    detectGPS(true);
}

let reverseTO;
function onMapMoveEnd() {
    const c = map.getCenter();
    clearTimeout(reverseTO);
    reverseTO = setTimeout(() => reverseGeocode(c.lat, c.lng), 400);
}

async function reverseGeocode(lat, lng) {
    const box = document.getElementById('detectedAddr');
    const lineEl = document.getElementById('detectedAddrLine');
    const subEl = document.getElementById('detectedAddrSub');
    box.style.display = 'flex';
    lineEl.textContent = 'Detecting address...';
    subEl.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
            headers: { 'Accept-Language': 'en' }
        });
        const d = await r.json();
        const a = d.address || {};
        const short = [
            a.road || a.pedestrian || a.neighbourhood || a.suburb,
            a.suburb && a.suburb !== a.neighbourhood ? a.suburb : null,
            a.city || a.town || a.village || a.county
        ].filter(Boolean).join(', ');
        const full = d.display_name || `${lat}, ${lng}`;
        lineEl.textContent = short || full.split(',').slice(0, 2).join(',');
        subEl.textContent = full;
        currentPickedAddress = { lat, lng, full, short: short || full.split(',').slice(0, 2).join(','), components: a };
        document.getElementById('mapAddrForm').style.display = 'flex';
    } catch (e) {
        lineEl.textContent = 'Could not fetch address';
        subEl.textContent = 'Use Manual entry instead';
    }
}

// GPS button
document.getElementById('useGPS').addEventListener('click', () => detectGPS(false));
document.getElementById('recenterBtn').addEventListener('click', () => detectGPS(false));

function detectGPS(silent) {
    if (!navigator.geolocation) {
        if (!silent) showToast('Geolocation not supported', 'error');
        return;
    }
    if (!silent) showToast('Finding your location...', '');
    navigator.geolocation.getCurrentPosition((pos) => {
        const { latitude, longitude } = pos.coords;
        if (map) {
            map.setView([latitude, longitude], 17, { animate: true });
        }
    }, (err) => {
        if (!silent) {
            const msg = err.code === 1 ? 'Location permission denied' : 'Could not get location';
            showToast(msg, 'error');
        }
    }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 });
}

// Type chips (Map panel)
document.getElementById('addrTypeRow')?.addEventListener('click', (e) => {
    if (!e.target.classList.contains('addr-type-chip')) return;
    e.currentTarget.querySelectorAll('.addr-type-chip').forEach(c => c.classList.remove('active'));
    e.target.classList.add('active');
});
document.getElementById('manualTypeRow')?.addEventListener('click', (e) => {
    if (!e.target.classList.contains('addr-type-chip')) return;
    e.currentTarget.querySelectorAll('.addr-type-chip').forEach(c => c.classList.remove('active'));
    e.target.classList.add('active');
});

// Save from MAP
document.getElementById('saveMapAddr').addEventListener('click', async () => {
    if (!currentPickedAddress) return showToast('Pick a location on the map', 'error');
    const flat = document.getElementById('addrFlat').value.trim();
    const building = document.getElementById('addrBuilding').value.trim();
    const landmark = document.getElementById('addrLandmark').value.trim();
    const type = document.querySelector('#addrTypeRow .addr-type-chip.active').dataset.type;

    const composed = [flat, building, currentPickedAddress.short, landmark ? `near ${landmark}` : '']
        .filter(Boolean).join(', ');

    await saveAddress({
        type,
        flat, building, landmark,
        line: composed,
        full: currentPickedAddress.full,
        short: currentPickedAddress.short,
        lat: currentPickedAddress.lat,
        lng: currentPickedAddress.lng
    });
});

// Save from MANUAL
document.getElementById('saveManualAddr').addEventListener('click', async () => {
    const full = document.getElementById('manualFullAddr').value.trim();
    if (!full) return showToast('Enter full address', 'error');
    const flat = document.getElementById('manualFlat').value.trim();
    const building = document.getElementById('manualBuilding').value.trim();
    const landmark = document.getElementById('manualLandmark').value.trim();
    const type = document.querySelector('#manualTypeRow .addr-type-chip.active').dataset.type;

    const short = full.split(',').slice(0, 2).join(',');
    const composed = [flat, building, full, landmark ? `near ${landmark}` : ''].filter(Boolean).join(', ');

    await saveAddress({
        type, flat, building, landmark,
        line: composed, full, short,
        lat: null, lng: null
    });
});

async function saveAddress(addr) {
    if (!currentUser) return showToast('Please log in first', 'error');
    const addrId = 'addr_' + Date.now();
    const payload = { ...addr, id: addrId, createdAt: Date.now() };

    savedAddresses[addrId] = payload;

    await Promise.all([
        update(ref(db, `users/${currentUser.uid}/savedAddresses/${addrId}`), payload),
        update(ref(db, `users/${currentUser.uid}`), {
            address: addr.line,
            location: addr.lat ? { lat: addr.lat, lng: addr.lng, fullAddress: addr.full } : null
        })
    ]);

    localStorage.setItem('writely_address_v1', addr.line);

    document.getElementById('locationText').innerHTML = `${addr.line} <i class="fas fa-chevron-down" style="font-size:10px;"></i>`;
    showToast('Address saved ✓', 'success');
    closeLocationModal();
}

// ===== Saved addresses list =====
function renderSavedAddresses() {
    const wrap = document.getElementById('savedAddrList');
    const section = document.getElementById('savedAddressesSection');
    const list = Object.values(savedAddresses || {}).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    if (!list.length) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';

    const icons = { home: 'fa-house', work: 'fa-briefcase', other: 'fa-location-dot' };
    wrap.innerHTML = list.map(a => `
        <div class="saved-addr" data-id="${a.id}">
            <div class="a-icon"><i class="fas ${icons[a.type] || 'fa-location-dot'}"></i></div>
            <div class="a-body">
                <div class="a-type">${(a.type || 'other').toUpperCase()}</div>
                <div class="a-text">${a.line || a.full || ''}</div>
            </div>
            <button class="a-del" data-del="${a.id}" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
    `).join('');

    wrap.querySelectorAll('.saved-addr').forEach(el => {
        el.addEventListener('click', async (e) => {
            if (e.target.closest('.a-del')) return;
            const id = el.dataset.id;
            const a = savedAddresses[id];
            if (!a) return;
            await update(ref(db, `users/${currentUser.uid}`), {
                address: a.line,
                location: a.lat ? { lat: a.lat, lng: a.lng, fullAddress: a.full } : null
            });
            localStorage.setItem('writely_address_v1', a.line);
            document.getElementById('locationText').innerHTML = `${a.line} <i class="fas fa-chevron-down" style="font-size:10px;"></i>`;
            showToast('Address selected ✓', 'success');
            closeLocationModal();
        });
    });
    wrap.querySelectorAll('.a-del').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.dataset.del;
            delete savedAddresses[id];
            await remove(ref(db, `users/${currentUser.uid}/savedAddresses/${id}`));
            renderSavedAddresses();
            showToast('Address removed', '');
        });
    });
}

// ===== Search (Nominatim) =====
const searchInputLoc = document.getElementById('locSearchInput');
let searchLocTO;
searchInputLoc?.addEventListener('input', () => {
    clearTimeout(searchLocTO);
    const q = searchInputLoc.value.trim();
    if (q.length < 3) {
        document.getElementById('searchSuggestions').style.display = 'none';
        document.getElementById('searchEmpty').style.display = 'block';
        return;
    }
    searchLocTO = setTimeout(() => doLocationSearch(q), 350);
});

async function doLocationSearch(q) {
    try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=6&addressdetails=1`, {
            headers: { 'Accept-Language': 'en' }
        });
        const data = await r.json();
        const wrap = document.getElementById('searchSuggestions');
        document.getElementById('searchEmpty').style.display = 'none';
        if (!data.length) {
            wrap.innerHTML = `<div class="suggestion-item"><i class="fas fa-info-circle"></i><div><div class="s-main">No results</div></div></div>`;
            wrap.style.display = 'block';
            return;
        }
        wrap.innerHTML = data.map(d => `
            <div class="suggestion-item" data-lat="${d.lat}" data-lng="${d.lon}" data-name="${(d.display_name || '').replace(/"/g, '&quot;')}">
                <i class="fas fa-location-dot"></i>
                <div>
                    <div class="s-main">${(d.name || d.display_name.split(',')[0])}</div>
                    <div class="s-sub">${d.display_name}</div>
                </div>
            </div>
        `).join('');
        wrap.style.display = 'block';
        wrap.querySelectorAll('.suggestion-item').forEach(it => {
            it.addEventListener('click', () => {
                const lat = parseFloat(it.dataset.lat);
                const lng = parseFloat(it.dataset.lng);
                // Switch to map tab + center
                document.querySelector('.loc-tab[data-panel="map"]').click();
                setTimeout(() => {
                    if (map) {
                        map.setView([lat, lng], 17, { animate: true });
                    }
                }, 150);
            });
        });
    } catch (e) {
        showToast('Search failed', 'error');
    }
}

// ===== Toast =====
function showToast(msg, type = '') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = `toast show ${type}`;
    setTimeout(() => toast.classList.remove('show'), 2500);
}
window.showToast = showToast;
