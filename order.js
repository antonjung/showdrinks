'use strict';

// ── localStorage ───────────────────────────────────────────────────────────

const LS_NAME   = 'showdrinks_name';
const LS_ORDERS = 'showdrinks_orders';

function getSavedName()  { return localStorage.getItem(LS_NAME) || ''; }
function saveName(n)     { localStorage.setItem(LS_NAME, n); }

function getSavedOrders() {
  try { return JSON.parse(localStorage.getItem(LS_ORDERS) || '[]'); } catch { return []; }
}
function saveOrderLocally(o) {
  const list = getSavedOrders().filter(x => x.id !== o.id);
  list.unshift({ id: o.id, orderNumber: o.orderNumber || null, customerName: o.customerName,
                 showDate: o.showDate, sessionName: o.sessionName, totalAmount: o.totalAmount });
  localStorage.setItem(LS_ORDERS, JSON.stringify(list.slice(0, 30)));
}

// ── State ──────────────────────────────────────────────────────────────────

const state = {
  step: 0,
  customerName: '',
  showDate: '', sessionId: '', sessionName: '',
  basket: {},          // name → { name, price, quantity }
  selectedCategory: null,
  orderId: null, orderNumber: null,
  editingOrderId: null, editingOrderStatus: null, editingOrderNumber: null,
  currentStatusOrderId: null,
  showConfig: null, sessions: null, menuItems: [], settings: null,
  statusUnsubscribe: null,
  posGrids: {}, posGridStack: [],
  selectedBasketKey: null,
};

// ── Utilities ──────────────────────────────────────────────────────────────

function today() { return new Date().toISOString().slice(0, 10); }

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast-msg ${type}`;
  el.textContent = msg;
  document.getElementById('toast').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  const mn = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(d)} ${mn[parseInt(m)]} ${y}`;
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

const body = document.querySelector('.pwa-body');

function goTo(step) {
  document.getElementById('screen' + state.step).classList.remove('active');
  state.step = step;
  document.getElementById('screen' + step).classList.add('active');
  // Compact hero on all non-home screens
  body.classList.toggle('sub-screen', step !== 0);
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
  const bar  = document.getElementById('bottomBar');
  const next = document.getElementById('nextBtn');
  const back = document.getElementById('backBtn');
  if (state.step === 0 || state.step === 4) { bar.style.display = 'none'; return; }
  if (state.step === 3) {
    bar.style.display = 'flex';
    back.textContent = '← Amend';
    next.style.display = 'none';
    return;
  }
  if (state.step === 2 && !state.editingOrderId) { bar.style.display = 'none'; return; }
  next.style.display = '';
  bar.style.display = 'flex';
  if (state.step === 2) {
    back.textContent = '← Cancel';
    const isEditable = state.editingOrderStatus === 'pending';
    next.textContent = isEditable ? 'Save Changes' : 'View Status →';
    next.disabled = false;
  } else {
    back.textContent = '← Back';
    next.textContent = 'Next →';
    next.disabled = false;
  }
}

document.getElementById('backBtn').addEventListener('click', () => {
  if (state.step === 2 && state.posGridStack.length > 1) {
    state.posGridStack.pop(); renderPosGrid(); return;
  }
  if (state.step === 2 && state.editingOrderId) {
    state.editingOrderId = null; state.editingOrderStatus = null; state.editingOrderNumber = null;
    state.basket = {};
    goTo(0); renderHomeScreen();
  } else if (state.step === 1) {
    goTo(0); renderHomeScreen();
  } else if (state.step > 0) {
    goTo(state.step - 1);
  }
});

document.getElementById('nextBtn').addEventListener('click', async () => {
  if (state.step === 1) {
    if (!state.showDate)  { toast('Please select a date',    'error'); return; }
    if (!state.sessionId) { toast('Please select a session', 'error'); return; }
    goTo(2); renderMenu();
  } else if (state.step === 2) {
    if (state.editingOrderId) {
      if (state.editingOrderStatus !== 'pending') {
        goTo(4); subscribeToOrderStatus(state.editingOrderId);
      } else {
        await saveOrderEdits();
      }
    } else {
      if (basketCount() === 0) { toast('Add at least one item', 'error'); return; }
      goTo(3); renderReview();
    }
  }
});

// ── Screen 0: Home ─────────────────────────────────────────────────────────

async function renderHomeScreen() {
  const homeContent = document.getElementById('homeContent');
  const savedName   = getSavedName();

  if (!savedName) { renderNameForm(homeContent); return; }

  state.customerName = savedName;
  const allSaved = getSavedOrders();
  const todayStr = today();

  // Split into today vs other days
  const todayOrders = allSaved.filter(o => o.showDate === todayStr);
  const otherDates  = [...new Set(allSaved.filter(o => o.showDate !== todayStr).map(o => o.showDate))].sort().reverse();

  homeContent.innerHTML = buildWelcomeCard(savedName) +
    '<div style="text-align:center;padding:12px 0;color:var(--text-muted);font-size:13px">Loading orders…</div>';

  // Fetch live statuses for today's orders only (fast)
  const todayDocs = await Promise.all(
    todayOrders.map(o => db.collection('orders').doc(o.id).get().catch(() => null))
  );
  const todayEnriched = todayDocs.map((doc, i) => {
    if (!doc || !doc.exists) return null;
    return { ...todayOrders[i], ...doc.data(), id: doc.id };
  }).filter(Boolean);

  const openOrders      = todayEnriched.filter(o => o.prepStatus === 'pending');
  const doneOrders      = todayEnriched.filter(o => o.prepStatus === 'ready');
  const collectedOrders = todayEnriched.filter(o => o.prepStatus === 'collected');

  const openSection = openOrders.length ? `
    <div style="margin-bottom:14px">
      <div class="orders-section-label pending-label">⏳ Open orders – today</div>
      ${openOrders.map(orderCard).join('')}
    </div>` : '';

  const doneSection = doneOrders.length ? `
    <div style="margin-bottom:14px">
      <div class="orders-section-label ready-label">✓ Ready to collect</div>
      ${doneOrders.map(orderCard).join('')}
    </div>` : '';

  const collectedSection = collectedOrders.length ? `
    <div style="margin-bottom:14px">
      <button class="past-toggle" onclick="toggleCollected(this)" style="font-size:12px;color:var(--text-muted)">
        Show ${collectedOrders.length} collected order${collectedOrders.length !== 1 ? 's' : ''} ▾
      </button>
      <div class="collected-list" style="display:none">
        ${collectedOrders.map(orderCard).join('')}
      </div>
    </div>` : '';

  const noToday = !openOrders.length && !doneOrders.length && !collectedOrders.length && todayOrders.length
    ? '<p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">No active orders for today.</p>'
    : '';

  // Other days dropdown
  const otherSection = otherDates.length ? `
    <div class="other-days-wrap">
      <div class="section-label" style="margin-bottom:6px">Other days</div>
      <select class="form-control" id="otherDaySelect" onchange="showOtherDay(this.value)" style="max-width:220px">
        <option value="">Select date…</option>
        ${otherDates.map(d => `<option value="${d}">${fmtDate(d)}</option>`).join('')}
      </select>
      <div id="otherDayOrders" style="margin-top:10px"></div>
    </div>` : '';

  homeContent.innerHTML =
    buildWelcomeCard(savedName) +
    openSection + doneSection + collectedSection + noToday +
    `<button class="btn btn-primary btn-full btn-lg"
             style="height:52px;border-radius:12px;margin:4px 0 16px"
             onclick="startNewOrder()">+ New Order</button>` +
    otherSection +
    `<div style="padding-top:16px;border-top:1px solid var(--border);margin-top:4px">
       <div class="section-label">Look up an order</div>
       <div style="display:flex;gap:8px">
         <input type="number" id="checkOrderNum" class="form-control"
                placeholder="Order number" min="1" style="max-width:140px">
         <button class="btn btn-secondary" onclick="checkOrderByNumber()">Find</button>
       </div>
     </div>`;
}

function buildWelcomeCard(name) {
  return `<div class="welcome-card">
    <span class="wc-emoji">👋</span>
    <div class="wc-name">Hi, ${escHtml(name)}!</div>
    <button class="btn btn-secondary btn-sm" onclick="changeName()">Not you?</button>
  </div>`;
}

function orderCard(o) {
  const isReady     = o.prepStatus === 'ready';
  const isCollected = o.prepStatus === 'collected';
  const numLabel = o.orderNumber ? `<span style="font-weight:900;color:var(--primary)">#${o.orderNumber}</span> · ` : '';
  const statusLabel = isCollected ? 'Collected'
    : isReady ? (o.locationName ? `✓ ${escHtml(o.locationName)}` : '✓ Ready') : 'Pending';
  const badgeCls = isCollected ? 'badge-primary' : isReady ? 'badge-success' : 'badge-warning';
  return `<div class="past-order-card ${isReady ? 'ready' : ''} ${isCollected ? 'collected' : ''}"
              onclick="viewOrder('${o.id}')">
    <div class="past-order-info">
      <div class="poi-session">${numLabel}${escHtml(o.sessionName || '')}</div>
      <div class="poi-detail">${fmtDate(o.showDate)}</div>
    </div>
    <div class="poi-right">
      <span class="badge ${badgeCls}">${statusLabel}</span>
      <div class="poi-total">${fmtCurrency(o.totalAmount)}</div>
    </div>
  </div>`;
}

window.toggleCollected = function(btn) {
  const list = btn.nextElementSibling;
  const visible = list.style.display !== 'none';
  list.style.display = visible ? 'none' : '';
  btn.textContent = visible
    ? btn.textContent.replace('▴', '▾')
    : btn.textContent.replace('▾', '▴');
};

function renderNameForm(container) {
  container.innerHTML = `
    <div class="name-input-wrap">
      <div style="text-align:center;margin-bottom:20px">
        <div class="pwa-section-title">Welcome!</div>
        <p style="color:var(--text-muted);font-size:14px;margin-top:4px">Enter your name to get started.</p>
      </div>
      <div class="form-group">
        <label for="customerName">Your Name</label>
        <input type="text" id="customerName" class="form-control big-input"
               placeholder="First &amp; last name" autocomplete="name" autocapitalize="words">
      </div>
      <button class="btn btn-primary btn-full btn-lg"
              style="height:52px;border-radius:12px;margin-top:8px"
              onclick="submitName()">Continue →</button>
      <div style="margin-top:28px;padding-top:20px;border-top:1px solid var(--border)">
        <div class="section-label">Already ordered?</div>
        <div style="display:flex;gap:8px">
          <input type="number" id="checkOrderNum" class="form-control"
                 placeholder="Order number" min="1" style="max-width:140px">
          <button class="btn btn-secondary" onclick="checkOrderByNumber()">Find</button>
        </div>
      </div>
    </div>`;
  setTimeout(() => {
    const el = document.getElementById('customerName');
    if (el) { el.focus(); el.addEventListener('keydown', e => { if (e.key === 'Enter') submitName(); }); }
  }, 0);
}

// Global onclick handlers ──────────────────────────────────────────────────

window.submitName = function() {
  const input = document.getElementById('customerName');
  const name  = input ? input.value.trim() : '';
  if (!name) { toast('Please enter your name', 'error'); return; }
  state.customerName = name;
  saveName(name);
  goTo(1); renderDateSession();
};

window.changeName = function() {
  localStorage.removeItem(LS_NAME); state.customerName = ''; renderHomeScreen();
};

window.startNewOrder = function() {
  state.showDate = ''; state.sessionId = ''; state.sessionName = ''; state.basket = {};
  state.editingOrderId = null; state.editingOrderStatus = null; state.editingOrderNumber = null;
  goTo(1); renderDateSession();
};

window.viewOrder = async function(orderId) {
  try {
    const doc = await db.collection('orders').doc(orderId).get();
    if (!doc.exists) { toast('Order not found', 'error'); return; }
    const order = { id: doc.id, ...doc.data() };
    state.currentStatusOrderId = orderId;
    // Load order into the edit/view screen (screen 2)
    state.editingOrderId     = orderId;
    state.editingOrderStatus = order.prepStatus;
    state.editingOrderNumber = order.orderNumber || null;
    state.showDate    = order.showDate;
    state.sessionId   = order.sessionId;
    state.sessionName = order.sessionName;
    // Build basket from saved items (key = item name)
    state.basket = {};
    (order.items || []).forEach(item => {
      state.basket[item.name] = { name: item.name, price: item.price, quantity: item.quantity };
    });
    state.selectedCategory = null;
    goTo(2); renderMenu();
  } catch(e) { toast('Error: ' + e.message, 'error'); }
};

window.showOtherDay = async function(date) {
  if (!date) return;
  const container = document.getElementById('otherDayOrders');
  container.innerHTML = '<p style="font-size:13px;color:var(--text-muted)">Loading…</p>';
  const saved = getSavedOrders().filter(o => o.showDate === date);
  const docs  = await Promise.all(saved.map(o => db.collection('orders').doc(o.id).get().catch(() => null)));
  const enriched = docs.map((doc, i) => {
    if (!doc || !doc.exists) return null;
    return { ...saved[i], ...doc.data(), id: doc.id };
  }).filter(Boolean);
  container.innerHTML = enriched.length
    ? enriched.map(orderCard).join('')
    : '<p style="font-size:13px;color:var(--text-muted)">No orders found for this date.</p>';
};

window.checkOrderByNumber = async function() {
  const input = document.getElementById('checkOrderNum');
  const num   = input ? parseInt(input.value, 10) : NaN;
  if (!num || num < 1) { toast('Enter an order number', 'error'); return; }
  try {
    const snap = await db.collection('orders')
      .where('orderNumber', '==', num)
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();
    if (snap.empty) { toast('Order #' + num + ' not found', 'error'); return; }
    window.viewOrder(snap.docs[0].id);
  } catch(e) { toast('Error: ' + e.message, 'error'); }
};

// ── Screen 1: Date & Session ───────────────────────────────────────────────

function renderDateSession() {
  const todayStr = today();
  // Only show dates that are today or future
  const dates = (state.showConfig?.dates || []).filter(d => d >= todayStr);
  const dateSel = document.getElementById('dateSelector');

  dateSel.innerHTML = dates.length
    ? dates.map(d => `<button class="selector-btn ${d === state.showDate ? 'selected' : ''}"
                               onclick="selectDate('${d}')" data-date="${d}">${fmtDate(d)}</button>`).join('')
    : '<p style="color:var(--text-muted);font-size:14px;grid-column:1/-1">No upcoming show dates.</p>';

  renderSessionSelector();
}

window.selectDate = function(date) {
  state.showDate = date;
  document.querySelectorAll('[data-date]').forEach(b => b.classList.toggle('selected', b.dataset.date === date));
  renderSessionSelector();
};

function renderSessionSelector() {
  const sesDiv   = document.getElementById('sessionSelector');
  const sessions = state.sessions || {};
  const now = new Date();

  const items = ['before','interval','after'].map(id => {
    const s = sessions[id] || {};
    if (!s.enabled) return null;
    let cutOffPassed = false;
    if (state.showDate && s.cutOff) {
      const d = s.cutOffDay === 'prev' ? subtractDay(state.showDate) : state.showDate;
      cutOffPassed = now > new Date(d + 'T' + s.cutOff + ':00');
    }
    return { id, name: s.name || id, cutOffPassed, cutOff: s.cutOff };
  }).filter(Boolean);

  sesDiv.innerHTML = items.length
    ? '<div class="selector-grid">' + items.map(s => `
        <button class="selector-btn ${s.id === state.sessionId ? 'selected' : ''} ${s.cutOffPassed ? 'unavailable' : ''}"
                ${s.cutOffPassed ? 'disabled' : `onclick="selectSession('${s.id}','${escHtml(s.name)}')"`}
                data-session="${s.id}">
          ${escHtml(s.name)}
          ${s.cutOff ? `<span class="sub">${s.cutOffPassed ? 'Ordering closed' : 'Order by ' + s.cutOff}</span>` : ''}
        </button>`).join('') + '</div>'
    : '<p style="color:var(--text-muted);font-size:14px">No sessions available.</p>';
}

function subtractDay(iso) {
  const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10);
}

window.selectSession = function(id, name) {
  state.sessionId = id; state.sessionName = name;
  document.querySelectorAll('[data-session]').forEach(b => b.classList.toggle('selected', b.dataset.session === id));
  updateBottomBar();
};

// ── Screen 2: Order / Edit ─────────────────────────────────────────────────

function renderMenu() {
  const statusTag = state.editingOrderId
    ? ` · ${state.editingOrderStatus === 'ready' ? '✅ Ready' : state.editingOrderStatus === 'collected' ? '🎉 Collected' : '⏳ Pending'}`
    : '';
  const numTag = state.editingOrderNumber ? `#${state.editingOrderNumber} · ` : '';
  document.getElementById('menuSubtitle').textContent =
    `${numTag}${fmtDate(state.showDate)} · ${state.sessionName}${statusTag}`;
  state.posGridStack = ['root'];
  renderPosGrid();
  renderOrderGrid();
}

function posIsLight(hex) {
  if (!hex || hex.length < 4) return true;
  const h = hex.length === 4 ? '#'+hex[1]+hex[1]+hex[2]+hex[2]+hex[3]+hex[3] : hex;
  const r = parseInt(h.slice(1,3),16), g = parseInt(h.slice(3,5),16), b = parseInt(h.slice(5,7),16);
  return (r*299+g*587+b*114)/1000 > 128;
}

function renderPosGrid() {
  const gridId = state.posGridStack[state.posGridStack.length - 1];
  const grid = state.posGrids[gridId];
  const el = document.getElementById('posGrid');
  if (!el) return;
  if (!grid) {
    el.innerHTML = '<p style="color:var(--text-muted);font-size:13px;padding:12px;grid-column:1/-1">POS layout not set up yet — configure it in Admin → POS Layout.</p>';
    return;
  }
  const cells = (grid.cells || []).slice(0, 12);
  while (cells.length < 12) cells.push({ type: 'empty' });
  el.innerHTML = cells.map((cell, i) => {
    if (!cell || cell.type === 'empty') return `<button class="pos-btn empty" disabled></button>`;
    const style = cell.color
      ? `background:${cell.color};color:${posIsLight(cell.color)?'#1e293b':'#fff'};border-color:${cell.color};` : '';
    const icon = cell.type === 'grid' ? '▶' : cell.type === 'back' ? '◀' : '';
    const price = cell.type === 'item' && cell.menuItemPrice ? fmtCurrency(cell.menuItemPrice) : '';
    return `<button class="pos-btn" style="${style}" onclick="handlePosBtn(${i})">
      ${icon ? `<span class="pb-icon">${icon}</span>` : ''}
      <span class="pb-lbl">${escHtml(cell.label || '')}</span>
      ${price ? `<span class="pb-price">${price}</span>` : ''}
    </button>`;
  }).join('');
}

window.handlePosBtn = function(idx) {
  const gridId = state.posGridStack[state.posGridStack.length - 1];
  const grid = state.posGrids[gridId];
  if (!grid) return;
  const cell = (grid.cells || [])[idx];
  if (!cell || cell.type === 'empty') return;
  if (cell.type === 'item') {
    const menuItem = state.menuItems.find(i => i.id === cell.menuItemId);
    if (!menuItem) { toast('Item not available', 'error'); return; }
    const key = menuItem.name;
    if (!state.basket[key]) state.basket[key] = { name: menuItem.name, price: menuItem.price, quantity: 0 };
    state.basket[key].quantity += 1;
    state.selectedBasketKey = key;
    state.posGridStack = ['root'];
    renderPosGrid();
    renderOrderGrid();
    updateBottomBar();
  } else if (cell.type === 'clear') {
    state.basket = {}; state.selectedBasketKey = null;
    renderOrderGrid(); updateBottomBar();
  } else if (cell.type === 'plus') {
    const key = state.selectedBasketKey;
    if (!key || !state.basket[key]) { toast('Select an item first', 'error'); return; }
    state.basket[key].quantity += 1;
    renderOrderGrid(); updateBottomBar();
  } else if (cell.type === 'minus') {
    const key = state.selectedBasketKey;
    if (!key || !state.basket[key]) { toast('Select an item first', 'error'); return; }
    state.basket[key].quantity -= 1;
    if (state.basket[key].quantity <= 0) { delete state.basket[key]; state.selectedBasketKey = null; }
    renderOrderGrid(); updateBottomBar();
  } else if (cell.type === 'grid') {
    if (cell.targetGridId && state.posGrids[cell.targetGridId]) {
      state.posGridStack.push(cell.targetGridId);
      renderPosGrid();
    }
  } else if (cell.type === 'back') {
    if (state.posGridStack.length > 1) {
      state.posGridStack.pop(); renderPosGrid();
    } else {
      goTo(1); renderDateSession();
    }
  } else if (cell.type === 'finish') {
    if (basketCount() === 0) { toast('Add at least one item', 'error'); return; }
    goTo(3); renderReview();
  }
};

function renderOrderGrid() {
  const pane  = document.getElementById('orderGridPane');
  const entries = Object.entries(state.basket);

  if (!entries.length) {
    state.selectedBasketKey = null;
    pane.innerHTML = '<div class="og-empty">Your order is empty — tap items below to add</div>';
    return;
  }

  const count = basketCount();
  pane.innerHTML =
    `<div class="og-header">
       <span>${count} item${count !== 1 ? 's' : ''}</span>
       <span>${fmtCurrency(basketTotal())}</span>
     </div>
     <div class="og-rows">` +
    entries.map(([key, i]) => {
      const enc = encodeURIComponent(key);
      const sel = key === state.selectedBasketKey;
      return `<div class="og-row ${sel ? 'selected' : ''}" onclick="selectBasketItem('${enc}')">
        <span class="og-qty">${i.quantity}×</span>
        <span>${escHtml(i.name)}</span>
        <span class="og-price">${fmtCurrency(i.price * i.quantity)}</span>
        <button class="og-trash" onclick="event.stopPropagation();removeFromBasket('${enc}')" title="Remove">🗑</button>
      </div>`;
    }).join('') +
    `</div>
     <div class="og-total"><span>Total</span><span>${fmtCurrency(basketTotal())}</span></div>`;
}

window.selectBasketItem = function(encodedKey) {
  state.selectedBasketKey = decodeURIComponent(encodedKey);
  renderOrderGrid();
};

function renderMenuItems() {
  const grid = document.getElementById('menuGrid');
  const cat  = state.selectedCategory;
  const items = state.menuItems.filter(item =>
    cat === 'all' || !cat || item.category === cat
  );

  grid.innerHTML = items.length
    ? items.map(item => `
        <button class="item-btn" onclick="addItem('${item.id}')">
          <span class="ib-name">${escHtml(item.name)}</span>
          <span class="ib-price">${fmtCurrency(item.price)}</span>
        </button>`).join('')
    : '<p style="color:var(--text-muted);font-size:13px;grid-column:1/-1">No items.</p>';
}

window.selectCategory = function(cat) {
  state.selectedCategory = cat;
  document.querySelectorAll('.cat-btn').forEach(b =>
    b.classList.toggle('active',
      (cat === 'all' && b.textContent.trim() === 'All') || b.textContent.trim() === cat));
  renderMenuItems();
};

window.addItem = function(menuItemId) {
  const item = state.menuItems.find(i => i.id === menuItemId);
  if (!item) return;
  const key = item.name;
  if (!state.basket[key]) state.basket[key] = { name: item.name, price: item.price, quantity: 0 };
  state.basket[key].quantity += 1;
  renderOrderGrid();
  updateBottomBar();
};

window.removeFromBasket = function(encodedKey) {
  const key = decodeURIComponent(encodedKey);
  delete state.basket[key];
  renderOrderGrid();
  updateBottomBar();
};

async function saveOrderEdits() {
  if (!state.editingOrderId) return;
  const next = document.getElementById('nextBtn');
  next.disabled = true; next.textContent = 'Saving…';
  try {
    const items = Object.values(state.basket).map(i => ({ name: i.name, price: i.price, quantity: i.quantity }));
    await db.collection('orders').doc(state.editingOrderId).update({
      items, totalAmount: basketTotal(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    saveOrderLocally({ id: state.editingOrderId, orderNumber: state.editingOrderNumber,
      customerName: state.customerName, showDate: state.showDate,
      sessionName: state.sessionName, totalAmount: basketTotal() });
    toast('Order updated', 'success');
    state.currentStatusOrderId = state.editingOrderId;
    const doc = await db.collection('orders').doc(state.editingOrderId).get();
    if (doc.exists) showOrderStatus({ id: doc.id, ...doc.data() });
    state.editingOrderId = null; state.editingOrderStatus = null; state.editingOrderNumber = null;
    goTo(4);
    subscribeToOrderStatus(state.currentStatusOrderId);
  } catch(e) {
    toast('Failed: ' + e.message, 'error');
    next.disabled = false; next.textContent = 'Save Changes';
  }
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
  placeOrder('sumup').then(() => { if (state.orderId) initiateSumupPayment(); });
});

async function placeOrder(paymentMode) {
  const btn = paymentMode === 'bar' ? document.getElementById('payAtBarBtn') : document.getElementById('payOnlineBtn');
  btn.disabled = true; btn.textContent = 'Placing order…';

  const order = {
    customerName: state.customerName,
    showDate:     state.showDate,
    sessionId:    state.sessionId,
    sessionName:  state.sessionName,
    items: Object.values(state.basket).map(i => ({ name: i.name, price: i.price, quantity: i.quantity })),
    totalAmount:  basketTotal(),
    paymentMode,
    paymentStatus: paymentMode === 'bar' ? 'pending' : 'awaiting',
    prepStatus:   'pending',
    locationId: '', locationName: '',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  const doPlace = async () => {
    const counterRef = db.collection('counters').doc('global');
    const orderRef   = db.collection('orders').doc();
    let orderNumber;
    await db.runTransaction(async t => {
      const cDoc = await t.get(counterRef);
      orderNumber = (cDoc.exists ? (cDoc.data().next || 0) : 0) + 1;
      t.set(counterRef, { next: orderNumber }, { merge: true });
      t.set(orderRef, { ...order, orderNumber });
    });
    return { orderRef, orderNumber };
  };

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Request timed out – please try again')), 15000)
  );

  try {
    const { orderRef, orderNumber } = await Promise.race([doPlace(), timeout]);

    state.orderId              = orderRef.id;
    state.currentStatusOrderId = orderRef.id;
    state.orderNumber          = orderNumber;
    saveOrderLocally({ ...order, id: orderRef.id, orderNumber });

    if (paymentMode === 'bar') {
      showOrderStatus({ ...order, id: orderRef.id, orderNumber });
      goTo(4);
      subscribeToOrderStatus(orderRef.id);
    }
  } catch(e) {
    toast('Failed to place order: ' + e.message, 'error');
    btn.disabled = false;
    btn.textContent = paymentMode === 'bar' ? 'Confirm Order (Pay at Bar)' : '💳 Pay Online with SumUp';
  }
}

function initiateSumupPayment() {
  const code = state.settings?.sumupMerchantCode;
  if (!code) { toast('SumUp not configured', 'error'); return; }
  window.location.href = `https://pay.sumup.com/b2c/QRCODE?affiliate-key=${encodeURIComponent(code)}&amount=${basketTotal().toFixed(2)}&currency=GBP&ref=${encodeURIComponent(state.orderId)}`;
}

// ── Screen 4: Status ───────────────────────────────────────────────────────

function showOrderStatus(order) {
  const isReady     = order.prepStatus === 'ready';
  const isCollected = order.prepStatus === 'collected';

  const iconState = isCollected ? 'collected' : isReady ? 'ready' : 'pending';
  document.getElementById('statusIcon').className   = `status-icon-wrap ${iconState}`;
  document.getElementById('statusIcon').textContent = isCollected ? '🎉' : isReady ? '✅' : '⏳';
  document.getElementById('statusTitle').textContent = isCollected ? 'Enjoy your drinks!'
    : isReady ? 'Your drinks are ready!' : 'Order received!';
  document.getElementById('statusSub').textContent = isCollected
    ? 'Your order has been collected.'
    : isReady ? 'Head to the collection point below.'
    : 'We\'re preparing your drinks. Check back soon!';

  const numEl = document.getElementById('confOrderNum');
  if (numEl) numEl.textContent = order.orderNumber ? '#' + order.orderNumber : '';

  const locBanner = document.getElementById('locationBanner');
  if (isReady && order.locationName) {
    locBanner.style.display = '';
    document.getElementById('locationText').textContent = order.locationName;
  } else {
    locBanner.style.display = 'none';
  }

  document.getElementById('confName').textContent    = order.customerName;
  document.getElementById('confDate').textContent    = fmtDate(order.showDate);
  document.getElementById('confSession').textContent = order.sessionName || order.sessionId;
  document.getElementById('confTotal').textContent   = fmtCurrency(order.totalAmount || 0);

  const collectBtn = document.getElementById('collectBtn');
  if (collectBtn) collectBtn.style.display = isReady ? '' : 'none';
}

function subscribeToOrderStatus(orderId) {
  if (state.statusUnsubscribe) state.statusUnsubscribe();
  state.statusUnsubscribe = db.collection('orders').doc(orderId).onSnapshot(snap => {
    if (snap.exists) showOrderStatus({ id: snap.id, ...snap.data() });
  });
}

document.getElementById('collectBtn').addEventListener('click', async () => {
  const orderId = state.currentStatusOrderId;
  if (!orderId) return;
  try {
    await db.collection('orders').doc(orderId).update({
      prepStatus: 'collected',
      collectedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    toast('Order marked as collected', 'success');
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  }
});

document.getElementById('newOrderBtn').addEventListener('click', () => {
  if (state.statusUnsubscribe) { state.statusUnsubscribe(); state.statusUnsubscribe = null; }
  state.showDate = ''; state.sessionId = ''; state.sessionName = '';
  state.basket = {}; state.orderId = null; state.selectedCategory = null;
  state.editingOrderId = null; state.editingOrderStatus = null; state.editingOrderNumber = null;
  goTo(0); renderHomeScreen();
});

// ── Service Worker update banner ───────────────────────────────────────────

function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    if (reg.waiting) showUpdateBanner(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      sw.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner(sw);
      });
    });
  }).catch(e => console.warn('SW failed', e));

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloading) { reloading = true; window.location.reload(); }
  });
}

function showUpdateBanner(sw) {
  const banner = document.getElementById('updateBanner');
  if (!banner) return;
  banner.classList.add('visible');
  document.getElementById('updateBtn').addEventListener('click', () => {
    banner.querySelector('span').textContent = 'Updating…';
    sw.postMessage('SKIP_WAITING');
  });
}

// ── Bootstrap ──────────────────────────────────────────────────────────────

async function init() {
  initServiceWorker();

  if (typeof APP_VERSION !== 'undefined') {
    const el = document.getElementById('heroVersion');
    if (el) el.textContent = 'v' + APP_VERSION;
  }

  try {
    const [showDoc, sesDoc, menuSnap, settingsDoc, posSnap] = await Promise.all([
      db.collection('config').doc('show').get(),
      db.collection('config').doc('sessions').get(),
      db.collection('menuItems').orderBy('name').get(),
      db.collection('config').doc('settings').get(),
      db.collection('posGrids').get(),
    ]);

    state.showConfig = showDoc.exists     ? showDoc.data()     : {};
    state.sessions   = sesDoc.exists      ? sesDoc.data()      : {};
    state.menuItems  = menuSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    state.settings   = settingsDoc.exists ? settingsDoc.data() : {};
    state.posGrids   = {};
    posSnap.docs.forEach(d => { state.posGrids[d.id] = { id: d.id, ...d.data() }; });

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
          return;
        }
      } catch(e) { console.error(e); }
    }

  } catch(e) {
    console.error(e);
    toast('Could not connect – check your connection.', 'error');
  }

  renderHomeScreen();
}

init();
