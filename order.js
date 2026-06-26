'use strict';

// ── localStorage keys ──────────────────────────────────────────────────────

const LS_NAME   = 'showdrinks_name';
const LS_ORDERS = 'showdrinks_orders';

function getSavedName() { return localStorage.getItem(LS_NAME) || ''; }
function saveName(name) { localStorage.setItem(LS_NAME, name); }

function getSavedOrders() {
  try { return JSON.parse(localStorage.getItem(LS_ORDERS) || '[]'); } catch { return []; }
}

function saveOrderLocally(order) {
  const orders = getSavedOrders().filter(o => o.id !== order.id);
  orders.unshift({
    id: order.id,
    customerName: order.customerName,
    showDate: order.showDate,
    sessionName: order.sessionName,
    totalAmount: order.totalAmount,
  });
  localStorage.setItem(LS_ORDERS, JSON.stringify(orders.slice(0, 20)));
}

// ── State ──────────────────────────────────────────────────────────────────

const state = {
  step: 0,
  customerName: '',
  showDate: '',
  sessionId: '',
  sessionName: '',
  basket: {},
  orderId: null,
  showConfig: null,
  sessions: null,
  menuItems: [],
  settings: null,
  statusUnsubscribe: null,
};

// ── Utilities ──────────────────────────────────────────────────────────────

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast-msg ${type}`;
  el.textContent = msg;
  document.getElementById('toast').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  const names = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(d)} ${names[parseInt(m)]} ${y}`;
}

function fmtCurrency(n) { return '£' + Number(n).toFixed(2); }

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function basketTotal() {
  return Object.values(state.basket).reduce((s, i) => s + i.price * i.quantity, 0);
}
function basketCount() {
  return Object.values(state.basket).reduce((s, i) => s + i.quantity, 0);
}

// ── Navigation ─────────────────────────────────────────────────────────────

function goTo(step) {
  document.getElementById('screen' + state.step).classList.remove('active');
  state.step = step;
  document.getElementById('screen' + step).classList.add('active');
  updateStepBar();
  updateBottomBar();
  window.scrollTo(0, 0);
}

function updateStepBar() {
  for (let i = 0; i < 5; i++) {
    const dot = document.getElementById('dot' + i);
    dot.className = 'step-dot' + (i < state.step ? ' done' : i === state.step ? ' active' : '');
  }
}

function updateBottomBar() {
  const bar = document.getElementById('bottomBar');
  const next = document.getElementById('nextBtn');
  if (state.step === 0 || state.step === 3 || state.step === 4) {
    bar.style.display = 'none';
    return;
  }
  bar.style.display = 'flex';
  if (state.step === 2) {
    next.textContent = 'Review Order →';
    next.disabled = basketCount() === 0;
  } else {
    next.textContent = 'Next →';
    next.disabled = false;
  }
}

document.getElementById('backBtn').addEventListener('click', () => {
  if (state.step === 1) { goTo(0); renderHomeScreen(); }
  else if (state.step > 0) goTo(state.step - 1);
});

document.getElementById('nextBtn').addEventListener('click', () => {
  if (state.step === 1) {
    if (!state.showDate) { toast('Please select a date', 'error'); return; }
    if (!state.sessionId) { toast('Please select a session', 'error'); return; }
    goTo(2);
    renderMenu();
  } else if (state.step === 2) {
    if (basketCount() === 0) { toast('Add at least one item', 'error'); return; }
    goTo(3);
    renderReview();
  }
});

// ── Screen 0: Home (dynamic) ───────────────────────────────────────────────

function renderHomeScreen() {
  const homeContent = document.getElementById('homeContent');
  const savedName   = getSavedName();
  const savedOrders = getSavedOrders();

  if (savedName) {
    state.customerName = savedName;

    const ordersSection = savedOrders.length ? `
      <div style="margin-bottom:20px">
        <div class="section-label">Your Orders</div>
        <div id="pastOrdersList">
          ${savedOrders.map(o => `
            <div class="past-order-card" id="poc-${o.id}" onclick="viewOrder('${o.id}')">
              <div class="past-order-info">
                <div class="poi-session">${escHtml(o.sessionName || '')}</div>
                <div class="poi-detail">${fmtDate(o.showDate)}</div>
              </div>
              <div class="poi-right">
                <span class="badge badge-warning pulse" id="status-badge-${o.id}">…</span>
                <div class="poi-total">${fmtCurrency(o.totalAmount)}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>` : '';

    homeContent.innerHTML = `
      <div class="welcome-card">
        <span class="wc-emoji">👋</span>
        <div class="wc-name">Hi, ${escHtml(savedName)}!</div>
        <button class="btn btn-secondary btn-sm" onclick="changeName()">Not you?</button>
      </div>
      ${ordersSection}
      <button class="btn btn-primary btn-full btn-lg"
              style="height:52px;border-radius:12px;margin-bottom:20px"
              onclick="startNewOrder()">+ New Order</button>
      <div style="padding-top:16px;border-top:1px solid var(--border)">
        <div class="section-label">Look up an order</div>
        <div style="display:flex;gap:8px">
          <input type="text" id="checkOrderId" class="form-control" placeholder="Order reference">
          <button class="btn btn-secondary" onclick="checkOrderById()">Check</button>
        </div>
      </div>`;

    if (savedOrders.length) loadPastOrderStatuses(savedOrders);

  } else {
    // First-time visitor
    homeContent.innerHTML = `
      <div class="name-input-wrap">
        <div style="text-align:center;margin-bottom:24px">
          <div class="pwa-section-title">Welcome!</div>
          <p style="color:var(--text-muted);font-size:15px;margin-top:6px">Enter your name so we can find your order.</p>
        </div>
        <div class="form-group">
          <label for="customerName">Your Name</label>
          <input type="text" id="customerName" class="form-control big-input"
                 placeholder="First &amp; last name" autocomplete="name" autocapitalize="words">
        </div>
        <button class="btn btn-primary btn-full btn-lg"
                style="height:52px;border-radius:12px;margin-top:8px"
                onclick="submitName()">Continue →</button>
        <div style="margin-top:32px;padding-top:24px;border-top:1px solid var(--border)">
          <div class="section-label">Already ordered?</div>
          <div style="display:flex;gap:8px">
            <input type="text" id="checkOrderId" class="form-control" placeholder="Order reference">
            <button class="btn btn-secondary" onclick="checkOrderById()">Check</button>
          </div>
        </div>
      </div>`;

    setTimeout(() => {
      const input = document.getElementById('customerName');
      if (input) {
        input.focus();
        input.addEventListener('keydown', e => { if (e.key === 'Enter') submitName(); });
      }
    }, 0);
  }
}

async function loadPastOrderStatuses(savedOrders) {
  await Promise.all(savedOrders.map(async o => {
    try {
      const doc = await db.collection('orders').doc(o.id).get();
      const badge = document.getElementById(`status-badge-${o.id}`);
      const card  = document.getElementById(`poc-${o.id}`);
      if (!badge) return;

      if (doc.exists) {
        const data = doc.data();
        const isReady = data.prepStatus === 'ready';
        badge.classList.remove('pulse');
        if (isReady) {
          badge.className = 'badge badge-success';
          badge.textContent = data.locationName ? `✓ ${data.locationName}` : '✓ Ready';
          if (card) card.classList.add('ready');
        } else {
          badge.className = 'badge badge-warning';
          badge.textContent = 'Pending';
        }
      } else {
        badge.className = 'badge badge-danger';
        badge.textContent = 'Not found';
        badge.classList.remove('pulse');
      }
    } catch { /* ignore network errors */ }
  }));
}

// Global handlers called from inline onclick ─────────────────────────────

window.submitName = function() {
  const input = document.getElementById('customerName');
  if (!input) return;
  const name = input.value.trim();
  if (!name) { toast('Please enter your name', 'error'); return; }
  state.customerName = name;
  saveName(name);
  goTo(1);
  renderDateSession();
};

window.changeName = function() {
  localStorage.removeItem(LS_NAME);
  state.customerName = '';
  renderHomeScreen();
};

window.startNewOrder = function() {
  state.showDate = '';
  state.sessionId = '';
  state.sessionName = '';
  state.basket = {};
  goTo(1);
  renderDateSession();
};

window.viewOrder = async function(orderId) {
  try {
    const doc = await db.collection('orders').doc(orderId).get();
    if (!doc.exists) { toast('Order not found', 'error'); return; }
    const order = { id: doc.id, ...doc.data() };
    state.orderId = order.id;
    showOrderStatus(order);
    goTo(4);
    subscribeToOrderStatus(orderId);
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  }
};

window.checkOrderById = async function() {
  const input = document.getElementById('checkOrderId');
  if (!input) return;
  const ref = input.value.trim();
  if (!ref) return;
  try {
    const doc = await db.collection('orders').doc(ref).get();
    if (!doc.exists) { toast('Order not found', 'error'); return; }
    const order = { id: doc.id, ...doc.data() };
    state.orderId = order.id;
    showOrderStatus(order);
    goTo(4);
    subscribeToOrderStatus(order.id);
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  }
};

// ── Screen 1: Date & Session ───────────────────────────────────────────────

async function renderDateSession() {
  const dateSel = document.getElementById('dateSelector');
  const dates = state.showConfig?.dates || [];

  if (!dates.length) {
    dateSel.innerHTML = '<p style="color:var(--text-muted);font-size:14px;grid-column:1/-1">No show dates configured yet.</p>';
  } else {
    dateSel.innerHTML = dates.map(d => `
      <button class="selector-btn ${d === state.showDate ? 'selected' : ''}"
              onclick="selectDate('${d}')" data-date="${d}">
        ${fmtDate(d)}
      </button>`).join('');
  }

  renderSessionSelector();
}

window.selectDate = function(date) {
  state.showDate = date;
  document.querySelectorAll('[data-date]').forEach(b =>
    b.classList.toggle('selected', b.dataset.date === date));
  renderSessionSelector();
};

function renderSessionSelector() {
  const sesDiv = document.getElementById('sessionSelector');
  const sessions = state.sessions || {};
  const now = new Date();

  const items = ['before','interval','after'].map(id => {
    const s = sessions[id] || {};
    if (!s.enabled) return null;
    let cutOffPassed = false;
    if (state.showDate && s.cutOff) {
      const cutOffDate = s.cutOffDay === 'prev' ? subtractDay(state.showDate) : state.showDate;
      cutOffPassed = now > new Date(cutOffDate + 'T' + s.cutOff + ':00');
    }
    return { id, name: s.name || id, cutOffPassed, cutOff: s.cutOff };
  }).filter(Boolean);

  if (!items.length) {
    sesDiv.innerHTML = '<p style="color:var(--text-muted);font-size:14px">No sessions available.</p>';
    return;
  }

  sesDiv.innerHTML = '<div class="selector-grid">' + items.map(s => `
    <button class="selector-btn ${s.id === state.sessionId ? 'selected' : ''} ${s.cutOffPassed ? 'unavailable' : ''}"
            ${s.cutOffPassed ? 'disabled title="Ordering closed"' : `onclick="selectSession('${s.id}','${escHtml(s.name)}')"`}
            data-session="${s.id}">
      ${escHtml(s.name)}
      ${s.cutOff ? `<span class="sub">${s.cutOffPassed ? 'Ordering closed' : 'Order by ' + s.cutOff}</span>` : ''}
    </button>`).join('') + '</div>';
}

function subtractDay(isoDate) {
  const d = new Date(isoDate + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

window.selectSession = function(id, name) {
  state.sessionId = id;
  state.sessionName = name;
  document.querySelectorAll('[data-session]').forEach(b =>
    b.classList.toggle('selected', b.dataset.session === id));
  updateBottomBar();
};

// ── Screen 2: Menu ─────────────────────────────────────────────────────────

function renderMenu() {
  document.getElementById('menuSubtitle').textContent =
    `${fmtDate(state.showDate)} · ${state.sessionName}`;

  const grid = document.getElementById('menuGrid');
  if (!state.menuItems.length) {
    grid.innerHTML = '<p style="color:var(--text-muted);font-size:14px">No items on the menu yet.</p>';
    return;
  }

  grid.innerHTML = state.menuItems.map(item => {
    const qty = state.basket[item.id]?.quantity || 0;
    return `
      <div class="menu-item-card">
        <div class="mic-name">${escHtml(item.name)}</div>
        <div class="mic-price">${fmtCurrency(item.price)}</div>
        <div class="qty-control">
          <button onclick="changeQty('${item.id}', -1)" aria-label="Remove one">−</button>
          <span class="qty-num" id="qty-${item.id}">${qty}</span>
          <button onclick="changeQty('${item.id}', 1)" aria-label="Add one">+</button>
        </div>
      </div>`;
  }).join('');

  updateBasketCount();
  updateBottomBar();
}

window.changeQty = function(itemId, delta) {
  const item = state.menuItems.find(i => i.id === itemId);
  if (!item) return;
  if (!state.basket[itemId]) state.basket[itemId] = { name: item.name, price: item.price, quantity: 0 };
  state.basket[itemId].quantity = Math.max(0, state.basket[itemId].quantity + delta);
  if (state.basket[itemId].quantity === 0) delete state.basket[itemId];
  const el = document.getElementById('qty-' + itemId);
  if (el) el.textContent = state.basket[itemId]?.quantity || 0;
  updateBasketCount();
  updateBottomBar();
};

function updateBasketCount() {
  const count = basketCount();
  const el = document.getElementById('basketCount');
  if (el) el.textContent = count === 0
    ? '0 items'
    : `${count} item${count !== 1 ? 's' : ''} · ${fmtCurrency(basketTotal())}`;
}

// ── Screen 3: Review & Pay ─────────────────────────────────────────────────

function renderReview() {
  document.getElementById('reviewName').textContent    = state.customerName;
  document.getElementById('reviewDate').textContent    = fmtDate(state.showDate);
  document.getElementById('reviewSession').textContent = state.sessionName;

  const items = Object.values(state.basket);
  document.getElementById('reviewItems').innerHTML = items.map(i => `
    <div class="order-summary-row">
      <span class="osq">${i.quantity}×</span>
      <span class="osn">${escHtml(i.name)}</span>
      <span class="osp">${fmtCurrency(i.price * i.quantity)}</span>
    </div>`).join('');
  document.getElementById('reviewTotal').textContent = fmtCurrency(basketTotal());

  const mode = state.settings?.paymentMode || 'bar';
  document.getElementById('payAtBarSection').style.display  = mode === 'bar'   ? '' : 'none';
  document.getElementById('sumupSection').style.display     = mode === 'sumup' ? '' : 'none';
}

document.getElementById('payAtBarBtn').addEventListener('click', () => placeOrder('bar'));

document.getElementById('payOnlineBtn').addEventListener('click', () => {
  placeOrder('sumup').then(() => {
    if (state.orderId) initiateSumupPayment();
  });
});

async function placeOrder(paymentMode) {
  const btn = paymentMode === 'bar'
    ? document.getElementById('payAtBarBtn')
    : document.getElementById('payOnlineBtn');
  btn.disabled = true;
  btn.textContent = 'Placing order…';

  const items = Object.values(state.basket).map(i => ({
    name: i.name, price: i.price, quantity: i.quantity,
  }));

  const order = {
    customerName: state.customerName,
    showDate:     state.showDate,
    sessionId:    state.sessionId,
    sessionName:  state.sessionName,
    items,
    totalAmount:  basketTotal(),
    paymentMode,
    paymentStatus: paymentMode === 'bar' ? 'pending' : 'awaiting',
    prepStatus:   'pending',
    locationId:   '',
    locationName: '',
    createdAt:  firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt:  firebase.firestore.FieldValue.serverTimestamp(),
  };

  try {
    const ref = await db.collection('orders').add(order);
    state.orderId = ref.id;
    saveOrderLocally({ ...order, id: ref.id });

    if (paymentMode === 'bar') {
      showOrderStatus({ ...order, id: ref.id });
      goTo(4);
      subscribeToOrderStatus(ref.id);
    }
  } catch(e) {
    toast('Failed to place order: ' + e.message, 'error');
    btn.disabled = false;
    btn.textContent = paymentMode === 'bar' ? 'Confirm Order (Pay at Bar)' : '💳 Pay Online with SumUp';
  }
}

function initiateSumupPayment() {
  const merchantCode = state.settings?.sumupMerchantCode;
  if (!merchantCode) { toast('SumUp not configured', 'error'); return; }
  const url = `https://pay.sumup.com/b2c/QRCODE?affiliate-key=${encodeURIComponent(merchantCode)}&amount=${basketTotal().toFixed(2)}&currency=GBP&ref=${encodeURIComponent(state.orderId)}`;
  window.location.href = url;
}

// ── Screen 4: Status ───────────────────────────────────────────────────────

function showOrderStatus(order) {
  const isReady = order.prepStatus === 'ready';
  document.getElementById('statusIcon').className = `status-icon-wrap ${isReady ? 'ready' : 'pending'}`;
  document.getElementById('statusIcon').textContent = isReady ? '✅' : '⏳';
  document.getElementById('statusTitle').textContent = isReady ? 'Your drinks are ready!' : 'Order received!';
  document.getElementById('statusSub').textContent = isReady
    ? 'Head to the collection point below.'
    : 'We\'re preparing your drinks. Check back soon!';

  const locBanner = document.getElementById('locationBanner');
  if (isReady && order.locationName) {
    locBanner.style.display = '';
    document.getElementById('locationText').textContent = order.locationName;
  } else {
    locBanner.style.display = 'none';
  }

  document.getElementById('confOrderId').textContent  = order.id;
  document.getElementById('confName').textContent     = order.customerName;
  document.getElementById('confDate').textContent     = fmtDate(order.showDate);
  document.getElementById('confSession').textContent  = order.sessionName || order.sessionId;
  document.getElementById('confTotal').textContent    = fmtCurrency(order.totalAmount || 0);
}

function subscribeToOrderStatus(orderId) {
  if (state.statusUnsubscribe) state.statusUnsubscribe();
  state.statusUnsubscribe = db.collection('orders').doc(orderId).onSnapshot(snap => {
    if (snap.exists) showOrderStatus({ id: snap.id, ...snap.data() });
  });
}

document.getElementById('newOrderBtn').addEventListener('click', () => {
  if (state.statusUnsubscribe) { state.statusUnsubscribe(); state.statusUnsubscribe = null; }
  state.showDate  = '';
  state.sessionId = '';
  state.sessionName = '';
  state.basket = {};
  state.orderId = null;
  goTo(0);
  renderHomeScreen();
});

// ── Bootstrap ──────────────────────────────────────────────────────────────

async function init() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW failed', e));
  }
  if (typeof APP_VERSION !== 'undefined') {
    const el = document.getElementById('heroVersion');
    if (el) el.textContent = 'v' + APP_VERSION;
  }

  try {
    const [showDoc, sesDoc, menuSnap, settingsDoc] = await Promise.all([
      db.collection('config').doc('show').get(),
      db.collection('config').doc('sessions').get(),
      db.collection('menuItems').orderBy('name').get(),
      db.collection('config').doc('settings').get(),
    ]);

    state.showConfig = showDoc.exists ? showDoc.data() : {};
    state.sessions   = sesDoc.exists  ? sesDoc.data()  : {};
    state.menuItems  = menuSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    state.settings   = settingsDoc.exists ? settingsDoc.data() : {};

    const showName = state.showConfig.name || 'ShowDrinks';
    document.getElementById('heroShowName').textContent = showName;
    document.title = showName;

    // Handle SumUp redirect-back
    const params = new URLSearchParams(window.location.search);
    if (params.get('sumup') === 'success' && params.get('ref')) {
      const orderId = params.get('ref');
      try {
        await db.collection('orders').doc(orderId).update({
          paymentStatus: 'paid',
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        const doc = await db.collection('orders').doc(orderId).get();
        if (doc.exists) {
          showOrderStatus({ id: doc.id, ...doc.data() });
          subscribeToOrderStatus(orderId);
          goTo(4);
          history.replaceState({}, '', window.location.pathname);
        }
      } catch(e) { console.error(e); }
      return;
    }

  } catch(e) {
    console.error(e);
    toast('Could not connect to database. Check your internet connection.', 'error');
  }

  renderHomeScreen();
}

init();
