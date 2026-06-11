import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { ref, get, update, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const STATUS_FLOW = [
    { key: 'placed', label: 'Order Placed', desc: 'Your order has been received' },
    { key: 'pickup_assigned', label: 'Delivery Partner Assigned', desc: 'Coming to pick up your content' },
    { key: 'picked_up', label: 'Content Picked Up', desc: 'Your material is on the way to writer' },
    { key: 'writing', label: 'Writing in Progress', desc: 'Our writer is crafting your work' },
    { key: 'completed', label: 'Writing Completed', desc: 'Quality checked and ready' },
    { key: 'out_for_delivery', label: 'Out for Delivery', desc: 'Delivery partner heading to you' },
    { key: 'delivered', label: 'Delivered', desc: 'Your order has been delivered' }
];

const urlParams = new URLSearchParams(window.location.search);
const orderId = urlParams.get('id');
let currentUser = null;

onAuthStateChanged(auth, (user) => {
    if (!user) { window.location.href = 'login.html'; return; }
    currentUser = user;
    listenOrder();
});

function listenOrder() {
    if (!orderId) { showToast('Order not found', 'error'); return; }
    onValue(ref(db, `orders/${orderId}`), (snap) => {
        if (!snap.exists()) { showToast('Order not found', 'error'); return; }
        renderOrder(snap.val());
        document.getElementById('pageLoader').classList.add('hide');
    });
}

function renderOrder(o) {
    const content = document.getElementById('content');
    const isCancelled = o.status === 'cancelled';
    const flowIdx = STATUS_FLOW.findIndex(s => s.key === o.status);
    
    const timeline = isCancelled
        ? `<div class="timeline-item done" style="--c:var(--error);">
              <h4 style="color:var(--error);">Order Cancelled</h4>
              <p>${new Date(o.updatedAt).toLocaleString('en-IN')}</p>
           </div>`
        : STATUS_FLOW.map((s, i) => {
            const cls = i < flowIdx ? 'done' : i === flowIdx ? 'current' : 'upcoming';
            const hist = o.statusHistory ? o.statusHistory.find(h => h.status === s.key) : null;
            const time = hist ? new Date(hist.timestamp).toLocaleString('en-IN', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : '';
            return `
              <div class="timeline-item ${cls}">
                  <h4>${s.label}</h4>
                  <p>${time ? time + ' • ' : ''}${s.desc}</p>
              </div>`;
        }).join('');
    
    content.innerHTML = `
        <div class="order-hero">
            <div class="badge">${isCancelled ? '❌ Cancelled' : flowIdx >= 6 ? '🎉 Delivered' : '🔥 ' + STATUS_FLOW[flowIdx]?.label}</div>
            <h2>${o.productTitle}</h2>
            <p>${o.pages} pages • ${o.writingStyle} • ${o.paperType}</p>
            <div class="order-id-big">Order ID: ${o.orderId}</div>
        </div>
        
        <div class="timeline-card">
            <h3>📍 Order Timeline</h3>
            <div class="timeline">${timeline}</div>
        </div>
        
        <div class="info-card">
            <h3><i class="fas fa-box"></i> Product Details</h3>
            <div class="product-block">
                <img src="${o.productImage}" alt="">
                <div>
                    <h4>${o.productTitle}</h4>
                    <p>By ${o.writerName}</p>
                    <p>₹${o.pricePerPage}/page × ${o.pages} pages</p>
                </div>
            </div>
        </div>
        
        <div class="info-card">
            <h3><i class="fas fa-file-lines"></i> Order Info</h3>
            <div class="info-row"><span class="label">Writing Style</span><span class="value">${cap(o.writingStyle)}</span></div>
            <div class="info-row"><span class="label">Paper Type</span><span class="value">${cap(o.paperType)}</span></div>
            <div class="info-row"><span class="label">Content Source</span><span class="value">${o.contentType === 'upload' ? 'Uploaded File' : 'Pickup Material'}</span></div>
            ${o.fileURL ? `<div class="info-row"><span class="label">File</span><span class="value"><a href="${o.fileURL}" target="_blank" style="color:var(--primary);">View</a></span></div>` : ''}
            ${o.instructions ? `<div class="info-row"><span class="label">Instructions</span><span class="value">${o.instructions}</span></div>` : ''}
        </div>
        
        <div class="info-card">
            <h3><i class="fas fa-truck"></i> Pickup & Delivery</h3>
            <div class="info-row"><span class="label">Pickup Time</span><span class="value">${new Date(o.pickupTime).toLocaleString('en-IN', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</span></div>
            <div class="info-row"><span class="label">Delivery Time</span><span class="value">${new Date(o.deliveryTime).toLocaleString('en-IN', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</span></div>
            <div class="info-row"><span class="label">Address</span><span class="value">${o.address}</span></div>
            <div class="info-row"><span class="label">Contact</span><span class="value">${o.phone}</span></div>
        </div>
        
        <div class="info-card">
            <h3><i class="fas fa-receipt"></i> Bill Summary</h3>
            <div class="info-row"><span class="label">Subtotal</span><span class="value">₹${o.subtotal}</span></div>
            <div class="info-row"><span class="label">Delivery</span><span class="value">₹${o.deliveryCharge}</span></div>
            <div class="info-row"><span class="label">Platform Fee</span><span class="value">₹${o.platformFee}</span></div>
            <div class="info-row" style="padding-top:12px;border-top:1px dashed var(--border);margin-top:8px;"><span class="label" style="font-weight:700;color:var(--text-dark);">Total Paid</span><span class="value" style="font-size:18px;color:var(--primary);">₹${o.totalAmount}</span></div>
            <div class="info-row"><span class="label">Payment</span><span class="value">${o.paymentMethod.toUpperCase()} • ${cap(o.paymentStatus)}</span></div>
        </div>
    `;
    
    // Action buttons
    const actions = document.getElementById('actions');
    if (!isCancelled && flowIdx < 2) {
        actions.innerHTML = `
            <button class="btn-cancel" onclick="cancelOrder('${o.orderId}')"><i class="fas fa-times"></i> Cancel Order</button>
            <button class="btn-support" onclick="window.location.href='tel:+919999999999'"><i class="fas fa-headset"></i> Support</button>
        `;
    } else if (o.status === 'delivered') {
        actions.innerHTML = `
            <button class="btn-support" style="flex:1;" onclick="window.location.href='home.html'"><i class="fas fa-rotate"></i> Order Again</button>
        `;
    } else {
        actions.innerHTML = `
            <button class="btn-support" style="flex:1;" onclick="window.location.href='tel:+919999999999'"><i class="fas fa-headset"></i> Contact Support</button>
        `;
    }
}

window.cancelOrder = async function(id) {
    if (!confirm('Cancel this order?')) return;
    await update(ref(db, `orders/${id}`), {
        status: 'cancelled',
        updatedAt: Date.now()
    });
    showToast('Order cancelled', 'success');
};

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : ''; }

function showToast(msg, type = '') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = `toast show ${type}`;
    setTimeout(() => toast.classList.remove('show'), 2500);
}
