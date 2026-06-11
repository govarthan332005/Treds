import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { ref, get, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

let currentUser = null;
let allOrders = [];
let currentFilter = 'all';

const STATUS_FLOW = ['placed', 'pickup_assigned', 'picked_up', 'writing', 'completed', 'out_for_delivery', 'delivered'];
const STATUS_LABELS = {
    placed: 'Order Placed',
    pickup_assigned: 'Pickup Assigned',
    picked_up: 'Picked Up',
    writing: 'Writing in Progress',
    completed: 'Writing Completed',
    out_for_delivery: 'Out for Delivery',
    delivered: 'Delivered',
    cancelled: 'Cancelled'
};

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = 'login.html'; return; }
    currentUser = user;
    
    const usnap = await get(ref(db, `users/${user.uid}`));
    const u = usnap.val() || {};
    document.getElementById('userAvatar').textContent = (u.username || 'U').charAt(0).toUpperCase();
    
    listenOrders();
});

function listenOrders() {
    const userOrdersRef = ref(db, `userOrders/${currentUser.uid}`);
    onValue(userOrdersRef, async (snap) => {
        if (!snap.exists()) {
            allOrders = [];
            renderOrders();
            document.getElementById('pageLoader').classList.add('hide');
            return;
        }
        const orderIds = Object.keys(snap.val());
        const orders = await Promise.all(orderIds.map(async id => {
            const os = await get(ref(db, `orders/${id}`));
            return os.val();
        }));
        allOrders = orders.filter(Boolean).sort((a,b) => b.createdAt - a.createdAt);
        renderOrders();
        document.getElementById('pageLoader').classList.add('hide');
    });
}

function renderOrders() {
    const list = document.getElementById('ordersList');
    let filtered = allOrders;
    
    if (currentFilter === 'active') {
        filtered = allOrders.filter(o => !['delivered', 'cancelled'].includes(o.status));
    } else if (currentFilter === 'delivered') {
        filtered = allOrders.filter(o => o.status === 'delivered');
    } else if (currentFilter === 'cancelled') {
        filtered = allOrders.filter(o => o.status === 'cancelled');
    }
    
    if (filtered.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-bag-shopping"></i>
                <h3>No orders here yet</h3>
                <p>When you place an order, it will appear here</p>
                <button class="btn-primary" onclick="window.location.href='home.html'">Browse Writings</button>
            </div>
        `;
        return;
    }
    
    list.innerHTML = filtered.map(o => {
        const flowIdx = STATUS_FLOW.indexOf(o.status);
        const isCancelled = o.status === 'cancelled';
        
        const progressBars = STATUS_FLOW.slice(0, 7).map((_, i) => {
            if (isCancelled) return '<div class="progress-step"></div>';
            if (i < flowIdx) return '<div class="progress-step active"></div>';
            if (i === flowIdx) return '<div class="progress-step current"></div>';
            return '<div class="progress-step"></div>';
        }).join('');
        
        return `
        <div class="order-card" onclick="window.location.href='order-detail.html?id=${o.orderId}'">
            <div class="order-top">
                <img class="order-img" src="${o.productImage}" alt="">
                <div class="order-info">
                    <h4>${o.productTitle}</h4>
                    <div class="order-id">#${o.orderId}</div>
                    <div class="order-meta">${o.pages} pages • ${new Date(o.createdAt).toLocaleDateString('en-IN', {day:'numeric', month:'short'})}</div>
                </div>
                <div class="order-status status-${o.status}">${STATUS_LABELS[o.status]}</div>
            </div>
            ${!isCancelled ? `<div class="order-progress">${progressBars}</div>` : ''}
            <div class="order-bottom">
                <div class="order-total">₹${o.totalAmount}</div>
                <button class="track-btn"><i class="fas fa-location-arrow"></i> Track</button>
            </div>
        </div>
        `;
    }).join('');
}

document.querySelectorAll('.tab-pill').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab-pill').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentFilter = tab.dataset.status;
        renderOrders();
    });
});
