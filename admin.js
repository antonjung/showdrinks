'use strict';

// ── Utilities ──────────────────────────────────────────────────────────────

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast-msg ${type}`;
  el.style.cursor = 'pointer';
  el.title = 'Click to dismiss';
  el.textContent = msg;
  el.addEventListener('click', () => el.remove());
  document.getElementById('toast').appendChild(el);
  // Errors stay until clicked; info/success auto-dismiss after 4s
  if (type !== 'error') setTimeout(() => el.remove(), 4000);
}

function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function fmtCurrency(n) {
  return '£' + Number(n).toFixed(2);
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Tab switching ──────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'orders') loadOrders();
  });
});

// ── Show & Sessions ────────────────────────────────────────────────────────

let showDates = [];

async function loadShow() {
  try {
    const doc = await db.collection('config').doc('show').get();
    if (doc.exists) {
      const data = doc.data();
      document.getElementById('showName').value = data.name || '';
      document.getElementById('headerShowName').textContent = data.name || 'No show configured';
      showDates = data.dates || [];
      renderDates();
    }

    const sesDoc = await db.collection('config').doc('sessions').get();
    if (sesDoc.exists) {
      const s = sesDoc.data();
      ['before','interval','after'].forEach(id => {
        const d = s[id] || {};
        document.getElementById(`${id}Name`).value = d.name || '';
        document.getElementById(`${id}Enabled`).value = d.enabled !== false ? 'true' : 'false';
        document.getElementById(`${id}CutOff`).value = d.cutOff || '';
        document.getElementById(`${id}CutOffDay`).value = d.cutOffDay || 'same';
      });
    }
  } catch(e) {
    console.error(e);
    toast('Could not load show data – check Firebase config', 'error');
  }
}

function renderDates() {
  const el = document.getElementById('datesList');
  el.innerHTML = showDates.length
    ? showDates.map(d => `
        <span class="date-chip">
          ${fmtDate(d)}
          <button onclick="removeDate('${d}')" title="Remove">×</button>
        </span>`).join('')
    : '<span style="color:var(--text-muted);font-size:13px">No dates added yet</span>';
}

window.removeDate = function(d) {
  showDates = showDates.filter(x => x !== d);
  renderDates();
};

document.getElementById('addDateBtn').addEventListener('click', () => {
  const val = document.getElementById('newDateInput').value;
  if (!val) return;
  if (showDates.includes(val)) { toast('Date already added', 'error'); return; }
  showDates.push(val);
  showDates.sort();
  renderDates();
  document.getElementById('newDateInput').value = '';
});

document.getElementById('saveShowBtn').addEventListener('click', async () => {
  const name = document.getElementById('showName').value.trim();
  if (!name) { toast('Enter a show name', 'error'); return; }

  const sessions = {};
  ['before','interval','after'].forEach(id => {
    sessions[id] = {
      name: document.getElementById(`${id}Name`).value.trim(),
      enabled: document.getElementById(`${id}Enabled`).value === 'true',
      cutOff: document.getElementById(`${id}CutOff`).value,
      cutOffDay: document.getElementById(`${id}CutOffDay`).value,
    };
  });

  try {
    await Promise.all([
      db.collection('config').doc('show').set({ name, dates: showDates }),
      db.collection('config').doc('sessions').set(sessions),
    ]);
    document.getElementById('headerShowName').textContent = name;
    populateDateFilter();
    toast('Show & sessions saved', 'success');
  } catch(e) {
    console.error(e);
    toast('Save failed – ' + e.message, 'error');
  }
});

// ── Menu Items ─────────────────────────────────────────────────────────────

let _allMenuItems        = [];
let _menuCategories      = [];
let _selectedMenuCat     = 'all';

async function loadMenuItems() {
  // Fetch all, sort client-side by category then name
  const snap = await db.collection('menuItems').get();
  _allMenuItems = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => {
      const ca = (a.category || '').toLowerCase(), cb = (b.category || '').toLowerCase();
      if (ca !== cb) return ca < cb ? -1 : 1;
      return (a.name || '').toLowerCase() < (b.name || '').toLowerCase() ? -1 : 1;
    });

  _menuCategories = [...new Set(_allMenuItems.map(i => i.category).filter(Boolean))].sort();

  // Reset filter if category no longer exists
  if (_selectedMenuCat !== 'all' && !_menuCategories.includes(_selectedMenuCat)) {
    _selectedMenuCat = 'all';
  }

  const clearBtn = document.getElementById('clearAllMenuBtn');
  if (clearBtn) clearBtn.style.display = _allMenuItems.length ? '' : 'none';

  renderMenuCategoryBar();
  renderMenuTable();
}

function renderMenuCategoryBar() {
  const bar = document.getElementById('menuCategoryBar');
  if (!_menuCategories.length) { bar.innerHTML = ''; return; }
  bar.innerHTML = ['all', ..._menuCategories].map(cat => `
    <button class="cat-filter-btn ${cat === _selectedMenuCat ? 'active' : ''}"
            onclick="setMenuCat('${escHtml(cat)}')">
      ${cat === 'all' ? 'All' : escHtml(cat)}
    </button>`).join('');
}

window.setMenuCat = function(cat) {
  _selectedMenuCat = cat;
  renderMenuCategoryBar();
  renderMenuTable();
};

function renderMenuTable() {
  const tbody = document.getElementById('menuTableBody');
  const items = _selectedMenuCat === 'all'
    ? _allMenuItems
    : _allMenuItems.filter(i => i.category === _selectedMenuCat);

  const defaultCat = _selectedMenuCat === 'all' ? '' : _selectedMenuCat;
  tbody.innerHTML = items.map(i => menuItemRow(i.id, i)).join('') + newItemRow(defaultCat);
}

function categorySelectHtml(selected, onchangeJs) {
  const opts = `<option value="">— none —</option>` +
    _menuCategories.map(c =>
      `<option value="${escHtml(c)}"${c === selected ? ' selected' : ''}>${escHtml(c)}</option>`
    ).join('') +
    `<option value="__new__">+ Add new category…</option>`;
  return `<select class="grid-input" onchange="${onchangeJs}">${opts}</select>`;
}

function menuItemRow(id, item) {
  const name  = escHtml(item.name || '');
  const price = Number(item.price || 0).toFixed(2);
  return `<tr id="mrow-${id}">
    <td>${categorySelectHtml(item.category || '', `handleCatChange('${id}',this)`)}</td>
    <td><input class="grid-input" value="${name}" placeholder="Item name"
               onblur="saveMenuField('${id}','name',this.value.trim())"></td>
    <td><input class="grid-input price-input" type="number" value="${price}" min="0" step="0.50"
               onblur="saveMenuField('${id}','price',parseFloat(this.value)||0)"></td>
    <td style="text-align:center">
      <button class="grid-del-btn" title="Delete" onclick="deleteMenuItem('${id}')">×</button>
    </td>
  </tr>`;
}

function newItemRow(defaultCat) {
  return `<tr id="newItemRow" class="new-item-row">
    <td>${categorySelectHtml(defaultCat, 'handleNewCatChange(this)')}</td>
    <td><input class="grid-input" id="newItemName" placeholder="New item name…"
               onblur="autoCreateItem(event)"></td>
    <td><input class="grid-input price-input" type="number" id="newItemPrice"
               placeholder="0.00" min="0" step="0.50" onblur="autoCreateItem(event)"></td>
    <td></td>
  </tr>`;
}

// Prompt for a new category name; update select and optionally save to a doc
function promptNewCategory(selectEl, afterCb) {
  const name = prompt('New category name:');
  if (!name || !name.trim()) { selectEl.value = ''; return; }
  const cat = name.trim();
  if (!_menuCategories.includes(cat)) { _menuCategories.push(cat); _menuCategories.sort(); }
  // Rebuild the select options in place
  selectEl.innerHTML = `<option value="">— none —</option>` +
    _menuCategories.map(c => `<option value="${escHtml(c)}"${c === cat ? ' selected' : ''}>${escHtml(c)}</option>`).join('') +
    `<option value="__new__">+ Add new category…</option>`;
  selectEl.value = cat;
  if (afterCb) afterCb(cat);
}

window.handleCatChange = async function(id, selectEl) {
  if (selectEl.value === '__new__') {
    promptNewCategory(selectEl, async cat => {
      await saveMenuField(id, 'category', cat);
      await loadMenuItems();
    });
  } else {
    await saveMenuField(id, 'category', selectEl.value);
    // If filtering by category and this item moved out, reload
    if (_selectedMenuCat !== 'all') await loadMenuItems();
  }
};

window.handleNewCatChange = function(selectEl) {
  if (selectEl.value === '__new__') promptNewCategory(selectEl, null);
};

window.autoCreateItem = async function(e) {
  if (e && e.relatedTarget && e.relatedTarget.closest('#newItemRow')) return;
  const nameEl  = document.getElementById('newItemName');
  const priceEl = document.getElementById('newItemPrice');
  const catSel  = document.querySelector('#newItemRow select');
  if (!nameEl) return;
  const name = nameEl.value.trim();
  if (!name) return;
  const cat   = (catSel?.value === '__new__' || !catSel?.value) ? '' : catSel.value;
  const price = parseFloat(priceEl?.value) || 0;
  try {
    await db.collection('menuItems').add({
      category: cat, name, price, available: true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    await loadMenuItems();
  } catch(e) {
    toast('Failed: ' + e.message, 'error');
  }
};

window.saveMenuField = async function(id, field, value) {
  try {
    await db.collection('menuItems').doc(id).update({ [field]: value });
  } catch(e) {
    toast('Save failed: ' + e.message, 'error');
  }
};

document.getElementById('clearAllMenuBtn').addEventListener('click', async () => {
  if (!confirm('Delete ALL menu items?')) return;
  const snap = await db.collection('menuItems').get();
  const batch = db.batch();
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  _allMenuItems = []; _menuCategories = []; _selectedMenuCat = 'all';
  loadMenuItems();
  toast('All items deleted', 'info');
});

window.deleteMenuItem = async function(id) {
  await db.collection('menuItems').doc(id).delete();
  _allMenuItems = _allMenuItems.filter(i => i.id !== id);
  _menuCategories = [...new Set(_allMenuItems.map(i => i.category).filter(Boolean))].sort();
  if (_selectedMenuCat !== 'all' && !_menuCategories.includes(_selectedMenuCat)) _selectedMenuCat = 'all';
  const clearBtn = document.getElementById('clearAllMenuBtn');
  if (clearBtn) clearBtn.style.display = _allMenuItems.length ? '' : 'none';
  renderMenuCategoryBar();
  renderMenuTable();
  toast('Item deleted', 'info');
};

// ── Locations ──────────────────────────────────────────────────────────────

async function loadLocations() {
  const snap = await db.collection('locations').orderBy('name').get();
  const list = document.getElementById('locationsList');
  if (snap.empty) {
    list.innerHTML = '<p style="color:var(--text-muted);font-size:14px">No locations yet.</p>';
    return;
  }
  list.innerHTML = snap.docs.map(d => {
    const loc = d.data();
    return `
      <div class="item-row">
        <span class="item-name">${escHtml(loc.name)}</span>
        <div class="item-actions">
          <button class="btn btn-secondary btn-sm" onclick="editLocation('${d.id}','${escHtml(loc.name)}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteLocation('${d.id}')">Delete</button>
        </div>
      </div>`;
  }).join('');
}

document.getElementById('addLocationBtn').addEventListener('click', async () => {
  const name = document.getElementById('locationName').value.trim();
  if (!name) { toast('Enter a location name', 'error'); return; }
  try {
    await db.collection('locations').add({ name, active: true });
    document.getElementById('locationName').value = '';
    loadLocations();
    toast('Location added', 'success');
  } catch(e) {
    toast('Failed: ' + e.message, 'error');
  }
});

window.deleteLocation = async function(id) {
  if (!confirm('Delete this location?')) return;
  await db.collection('locations').doc(id).delete();
  loadLocations();
  toast('Location deleted', 'info');
};

window.editLocation = function(id, name) {
  openModal('Edit Location', { id, name, type: 'location' });
};

// ── Edit Modal ─────────────────────────────────────────────────────────────

let _modalCtx = null;

function openModal(title, ctx) {
  _modalCtx = ctx;
  document.getElementById('editModalTitle').textContent = title;
  document.getElementById('editName').value = ctx.name || '';
  const priceGroup = document.getElementById('editPriceGroup');
  if (ctx.type === 'menuItem') {
    priceGroup.style.display = '';
    document.getElementById('editPrice').value = ctx.price || '';
  } else {
    priceGroup.style.display = 'none';
  }
  const modal = document.getElementById('editModal');
  modal.style.display = 'flex';
}

window.closeModal = function() {
  document.getElementById('editModal').style.display = 'none';
  _modalCtx = null;
};

document.getElementById('editSaveBtn').addEventListener('click', async () => {
  if (!_modalCtx) return;
  const name = document.getElementById('editName').value.trim();
  if (!name) { toast('Name required', 'error'); return; }

  try {
    if (_modalCtx.type === 'location') {
      await db.collection('locations').doc(_modalCtx.id).update({ name });
      loadLocations();
      closeModal();
    }
    toast('Saved', 'success');
  } catch(e) {
    toast('Failed: ' + e.message, 'error');
  }
});

// Click outside modal to close
document.getElementById('editModal').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

// ── Orders ─────────────────────────────────────────────────────────────────

let _locations = [];
let _ordersUnsubscribe = null;

async function loadLocationsCache() {
  const snap = await db.collection('locations').get();
  _locations = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function populateDateFilter() {
  const doc = await db.collection('config').doc('show').get();
  const dates = doc.exists ? (doc.data().dates || []) : [];
  const sel = document.getElementById('filterDate');
  const current = sel.value;
  sel.innerHTML = '<option value="">All dates</option>' +
    dates.map(d => `<option value="${d}">${fmtDate(d)}</option>`).join('');
  if (current) sel.value = current;
}

async function loadOrders() {
  if (_ordersUnsubscribe) { _ordersUnsubscribe(); _ordersUnsubscribe = null; }
  await loadLocationsCache();
  await populateDateFilter();

  const date = document.getElementById('filterDate').value;
  const session = document.getElementById('filterSession').value;
  const status = document.getElementById('filterStatus').value;

  let query = db.collection('orders');
  if (date)    query = query.where('showDate',  '==', date);
  if (session) query = query.where('sessionId', '==', session);
  query = query.orderBy('createdAt', 'asc');

  _ordersUnsubscribe = query.onSnapshot(snap => {
    let orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (status === 'all') { /* no filter */ }
    else if (status === '') orders = orders.filter(o => o.prepStatus !== 'collected');
    else orders = orders.filter(o => o.prepStatus === status);
    renderOrders(orders);
  }, err => {
    console.error('Firestore orders error:', err);
    const msg = err.code === 'failed-precondition'
      ? 'Index still building — check browser console for the index creation link, or wait ~1 min and refresh'
      : 'Error loading orders: ' + err.message;
    toast(msg, 'error');
  });
}

function renderOrders(orders) {
  const container = document.getElementById('ordersContainer');
  const summary = document.getElementById('ordersSummary');

  const total = orders.length;
  const ready = orders.filter(o => o.prepStatus === 'ready').length;
  const pending = total - ready;
  const totalRevenue = orders.reduce((s, o) => s + (o.totalAmount || 0), 0);

  summary.innerHTML = `
    <div class="summary-card"><div class="snum">${total}</div><div class="slabel">Total Orders</div></div>
    <div class="summary-card"><div class="snum" style="color:var(--warning)">${pending}</div><div class="slabel">Pending</div></div>
    <div class="summary-card"><div class="snum" style="color:var(--success)">${ready}</div><div class="slabel">Ready</div></div>
    <div class="summary-card"><div class="snum">${fmtCurrency(totalRevenue)}</div><div class="slabel">Revenue</div></div>`;

  if (!orders.length) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:14px">No orders found for this filter.</p>';
    return;
  }

  const locationOptions = _locations.map(l => `<option value="${l.id}">${escHtml(l.name)}</option>`).join('');

  container.innerHTML = orders.map(o => {
    const isReady     = o.prepStatus === 'ready';
    const isCollected = o.prepStatus === 'collected';
    const sessionLabel = o.sessionName || o.sessionId || '';
    const statusBadge = isCollected ? '<span class="badge badge-primary">Collected</span>'
      : isReady ? '<span class="badge badge-success">Ready</span>'
      : '<span class="badge badge-warning">Pending</span>';
    const actionBtns = isCollected
      ? `<button class="btn btn-secondary btn-sm" onclick="markReady('${o.id}')">↩ Undo Collected</button>`
      : isReady
        ? `<button class="btn btn-primary btn-sm" onclick="markCollected('${o.id}')">✓ Collected</button>
           <button class="btn btn-secondary btn-sm" onclick="markPending('${o.id}')">↩ Pending</button>`
        : `<button class="btn btn-success btn-sm" onclick="markReady('${o.id}')">✓ Mark Ready</button>`;
    return `
      <div class="order-card ${isReady ? 'prepared' : ''} ${isCollected ? 'order-collected' : ''}" id="order-${o.id}">
        <div class="order-card-header">
          ${o.orderNumber ? `<span style="font-size:22px;font-weight:900;color:var(--primary);min-width:44px">#${o.orderNumber}</span>` : ''}
          <div class="order-customer">${escHtml(o.customerName)}</div>
          ${statusBadge}
          <span class="badge badge-primary">${escHtml(sessionLabel)}</span>
          <span style="font-size:12px;color:var(--text-muted)">${fmtDate(o.showDate)}</span>
          <div class="order-total">${fmtCurrency(o.totalAmount || 0)}</div>
        </div>
        <div class="order-items">
          ${(o.items || []).map(item => `
            <div class="order-item-row">
              <span class="qty">${item.quantity}×</span>
              <span class="iname">${escHtml(item.name)}</span>
              <span class="iprice">${fmtCurrency(item.price * item.quantity)}</span>
            </div>`).join('')}
        </div>
        <div class="order-card-footer">
          <select class="form-control" style="max-width:200px" id="loc-${o.id}" onchange="setOrderLocation('${o.id}',this.value)">
            <option value="">Set location…</option>
            ${locationOptions}
          </select>
          ${o.locationId ? `<span class="badge badge-primary">📍 ${escHtml(o.locationName || '')}</span>` : ''}
          ${actionBtns}
          <span style="font-size:12px;color:var(--text-muted);margin-left:auto">
            ${o.paymentMode === 'bar' ? '💵 Pay at bar' : '💳 Paid online'}
          </span>
        </div>
      </div>`;
  }).join('');

  // Restore current location selections
  orders.forEach(o => {
    const sel = document.getElementById(`loc-${o.id}`);
    if (sel && o.locationId) sel.value = o.locationId;
  });
}

window.markReady = async function(id) {
  try {
    await db.collection('orders').doc(id).update({
      prepStatus: 'ready',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    toast('Order marked as ready', 'success');
  } catch(e) {
    toast('Failed: ' + e.message, 'error');
  }
};

window.markPending = async function(id) {
  try {
    await db.collection('orders').doc(id).update({
      prepStatus: 'pending',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    toast('Order marked as pending', 'info');
  } catch(e) {
    toast('Failed: ' + e.message, 'error');
  }
};

window.markCollected = async function(id) {
  try {
    await db.collection('orders').doc(id).update({
      prepStatus: 'collected',
      collectedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    toast('Order marked as collected', 'success');
  } catch(e) {
    toast('Failed: ' + e.message, 'error');
  }
};

window.setOrderLocation = async function(id, locationId) {
  if (!locationId) return;
  const loc = _locations.find(l => l.id === locationId);
  if (!loc) return;
  try {
    await db.collection('orders').doc(id).update({
      locationId,
      locationName: loc.name,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    toast('Location set', 'success');
  } catch(e) {
    toast('Failed: ' + e.message, 'error');
  }
};

document.getElementById('refreshOrdersBtn').addEventListener('click', loadOrders);
document.getElementById('filterDate').addEventListener('change', loadOrders);
document.getElementById('filterSession').addEventListener('change', loadOrders);
document.getElementById('filterStatus').addEventListener('change', loadOrders);

document.getElementById('clearAllOrdersBtn').addEventListener('click', async () => {
  if (!confirm('Delete ALL orders? This cannot be undone.')) return;
  try {
    let snap = await db.collection('orders').limit(500).get();
    while (!snap.empty) {
      const batch = db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      snap = await db.collection('orders').limit(500).get();
    }
    toast('All orders deleted', 'info');
  } catch(e) {
    toast('Failed: ' + e.message, 'error');
  }
});

// ── Settings & QR ──────────────────────────────────────────────────────────

async function loadSettings() {
  try {
    const doc = await db.collection('config').doc('settings').get();
    if (doc.exists) {
      const d = doc.data();
      document.getElementById('siteUrl').value = d.siteUrl || '';
      document.getElementById('sumupMerchantCode').value = d.sumupMerchantCode || '';
      document.getElementById('sumupApiKey').value = d.sumupApiKey || '';
      document.getElementById('paymentMode').value = d.paymentMode || 'bar';
    }
  } catch(e) {
    console.error(e);
  }
}

document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
  const settings = {
    siteUrl: document.getElementById('siteUrl').value.trim(),
    sumupMerchantCode: document.getElementById('sumupMerchantCode').value.trim(),
    sumupApiKey: document.getElementById('sumupApiKey').value.trim(),
    paymentMode: document.getElementById('paymentMode').value,
  };
  try {
    await db.collection('config').doc('settings').set(settings);
    toast('Settings saved', 'success');
  } catch(e) {
    toast('Failed: ' + e.message, 'error');
  }
});

let _qrInstance = null;

document.getElementById('generateQrBtn').addEventListener('click', () => {
  const baseUrl = document.getElementById('siteUrl').value.trim() || window.location.origin + window.location.pathname.replace('admin.html', '');
  const orderUrl = baseUrl.replace(/\/$/, '') + '/index.html';
  document.getElementById('qrUrl').textContent = orderUrl;

  const container = document.getElementById('qrcode');
  container.innerHTML = '';
  _qrInstance = new QRCode(container, {
    text: orderUrl,
    width: 220,
    height: 220,
    correctLevel: QRCode.CorrectLevel.M,
  });

  document.getElementById('downloadQrBtn').style.display = '';
  toast('QR code generated', 'success');
});

document.getElementById('downloadQrBtn').addEventListener('click', () => {
  const canvas = document.querySelector('#qrcode canvas');
  if (!canvas) return;
  const link = document.createElement('a');
  link.download = 'showdrinks-qr.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
});

// ── Bootstrap ──────────────────────────────────────────────────────────────

async function init() {
  if (typeof APP_VERSION !== 'undefined') {
    document.getElementById('headerVersion').textContent = 'v' + APP_VERSION;
  }
  try {
    await Promise.all([loadShow(), loadMenuItems(), loadLocations(), loadSettings()]);
  } catch(e) {
    document.getElementById('headerShowName').textContent = 'Firebase not configured';
    toast('Firebase not configured – edit firebase-config.js', 'error');
  }
}

init();
