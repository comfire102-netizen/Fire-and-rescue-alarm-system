/**
 * אפליקציה ראשית - Frontend
 */

// חיבור ל-WebSocket
const socket = io();

// API base URL
const API_BASE = '/api';

// State
let scannerStatus = {
    isRunning: false,
    stats: {
        scanCount: 0,
        alertCount: 0,
        telnetSuccess: 0,
        telnetFailed: 0
    }
};

let alerts = [];
let alertHistory = []; // היסטוריה לניתוח
let currentAlertType = 'real'; // 'real' or 'drill'
    let stationAlertState = {}; // map station.serial -> { timeoutId, details }

// DOM Elements
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const statusDot = document.getElementById('statusDot');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const simulateBtn = document.getElementById('simulateBtn');
const scanCountEl = document.getElementById('scanCount');
const alertCountEl = document.getElementById('alertCount');
const telnetSuccessEl = document.getElementById('telnetSuccess');
const realAlertsListEl = document.getElementById('realAlertsList');
const drillAlertsListEl = document.getElementById('drillAlertsList');
const recentAlertsEl = document.getElementById('recentAlerts');
const realBtn = document.getElementById('realBtn');
const drillBtn = document.getElementById('drillBtn');
const totalTodayEl = document.getElementById('totalToday');
const realTodayEl = document.getElementById('realToday');
const drillTodayEl = document.getElementById('drillToday');
const analysisBreakdownEl = document.getElementById('analysisBreakdown');
const scannerDetailEl = document.getElementById('scannerDetail');
const toastContainer = document.getElementById('toastContainer');

// Event Listeners
startBtn.addEventListener('click', () => {
    console.log('Start button clicked');
    startScanner();
});
stopBtn.addEventListener('click', () => {
    console.log('Stop button clicked');
    stopScanner();
});

if (simulateBtn) {
    simulateBtn.addEventListener('click', () => openSimModal());
}
// Simulation modal logic
const simModal = document.getElementById('simModal');
const simBackdrop = document.getElementById('simBackdrop');
const simForm = document.getElementById('simForm');
const simTypeSelect = document.getElementById('simTypeSelect');
const simCitiesSelect = document.getElementById('simCitiesSelect');
const simCitySearch = document.getElementById('simCitySearch');
const simInstructions = document.getElementById('simInstructions');
const simCancel = document.getElementById('simCancel');
const simSubmit = document.getElementById('simSubmit');

function openSimModal() {
    if (!simModal) return;
    simModal.setAttribute('aria-hidden', 'false');
    simModal.style.display = 'flex';
    // populate types from `alerts` if available
    populateSimTypes();
    populateSimCities();
}

function closeSimModal() {
    if (!simModal) return;
    simModal.setAttribute('aria-hidden', 'true');
    simModal.style.display = 'none';
}

function populateSimTypes() {
    if (!simTypeSelect || !alerts) return;
    // keep existing options but add from alerts if missing
    const existing = new Set(Array.from(simTypeSelect.options).map(o => o.value));
    alerts.forEach(a => {
        if (a && a.type && !existing.has(a.type)) {
            const opt = document.createElement('option');
            opt.value = a.type; opt.textContent = a.name || a.type;
            simTypeSelect.appendChild(opt);
            existing.add(a.type);
        }
    });
}

async function populateSimCities() {
    if (!simCitiesSelect) return;
    try {
        // get stations grouped by district
        const resp = await fetch(`${API_BASE}/stations`);
        const res = await resp.json();
        if (!res.success) return;
        // collect unique polygon names from all stations
        const polygons = new Set();
        res.data.forEach(group => {
            group.stations.forEach(s => polygons.add(s.polygon || s.stationName || s.apiCode));
        });
        const list = Array.from(polygons).sort((a,b)=> a.localeCompare(b,'he'));
        simCitiesSelect.innerHTML = list.map(p => `<option value="${p}">${p}</option>`).join('');

        // wire search filter
        if (simCitySearch) {
            simCitySearch.addEventListener('input', () => {
                const q = simCitySearch.value.trim().toLowerCase();
                Array.from(simCitiesSelect.options).forEach(opt => {
                    const show = opt.value.toLowerCase().includes(q);
                    opt.style.display = show ? '' : 'none';
                });
            });
        }
    } catch (err) {
        console.error('populateSimCities error', err);
    }
}

if (simCancel) simCancel.addEventListener('click', closeSimModal);
if (simBackdrop) simBackdrop.addEventListener('click', closeSimModal);

if (simForm) {
    simForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const type = simTypeSelect.value;
        const cities = simCitiesSelect ? Array.from(simCitiesSelect.selectedOptions).map(o => o.value) : [];
        const instructions = simInstructions.value || '';
        const mode = Array.from(simForm.elements['simMode']).find(r => r.checked).value;
        const dryRun = mode === 'dry';

        try {
            setButtonLoading(simSubmit, true, 'שולח...');
            const resp = await fetch(`${API_BASE}/scanner/simulate`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, cities, instructions, dryRun })
            });
            const result = await resp.json();
            if (result.success) {
                showToast(dryRun ? 'סימולציה (הצגה בלבד) נשלחה' : 'סימולציה מבוצעת', 'success');
            } else {
                showToast('שגיאה בסימולציה: ' + (result.error || result.message), 'error');
            }
        } catch (err) {
            console.error('Simulate error', err);
            showToast('שגיאה בסימולציה', 'error');
        } finally {
            setButtonLoading(simSubmit, false);
            closeSimModal();
            // clear form
            if (simCitiesSelect) { Array.from(simCitiesSelect.options).forEach(o => o.selected = false); }
            simInstructions.value = '';
        }
    });
}

realBtn.addEventListener('click', () => {
    currentAlertType = 'real';
    realBtn.classList.add('active');
    drillBtn.classList.remove('active');
    realAlertsListEl.style.display = 'grid';
    drillAlertsListEl.style.display = 'none';
});

drillBtn.addEventListener('click', () => {
    currentAlertType = 'drill';
    drillBtn.classList.add('active');
    realBtn.classList.remove('active');
    drillAlertsListEl.style.display = 'grid';
    realAlertsListEl.style.display = 'none';
});

// WebSocket Events
socket.on('connect', () => {
    console.log('Connected to server');
    loadInitialData();
});

socket.on('scanner:status', (data) => {
    console.log('Scanner status update:', data);
    if (data.data) {
        updateScannerStatus(data.data);
    } else {
        updateScannerStatus(data);
    }
});

socket.on('alert:new', (data) => {
    console.log('New alert:', data);
    addRecentAlert(data);
    addToHistory(data);
    updateAnalysis();
    // חיבור לאזור/תחנה
    try {
        handleIncomingAlertStations(data);
    } catch (err) {
        console.error('Error handling station alert mapping', err);
    }
});

// Always show header popup on new alert (even if station mapping not found)
socket.on('alert:new', (data) => {
    try {
        const cities = Array.isArray(data.cities) ? data.cities.join(', ') : (data.cities || 'אזור לא ידוע');
        showHeaderAlertPopup(`${getAlertTypeName(data.type)} — ${cities}`);
    } catch (e) { /* ignore */ }
});

// Polling to refresh status and alerts periodically
setInterval(() => {
    loadScannerStatus();
    loadAlerts();
}, 7000);

/**
 * טעינת תחנות ומחוזות מהשרת
 */
async function loadStations() {
    try {
        const resp = await fetch(`${API_BASE}/stations`);
        const res = await resp.json();
        if (res.success) {
            renderDistricts(res.data);
            // attach click handlers after render
            document.querySelectorAll('.district-card').forEach(c => c.addEventListener('click', () => openDistrictView(c.dataset.district)));
        } else {
            document.getElementById('districtList').innerHTML = '<p class="loading">שגיאה בטעינת תחנות</p>';
        }
    } catch (err) {
        console.error('Error loading stations', err);
        document.getElementById('districtList').innerHTML = '<p class="loading">שגיאה בטעינת תחנות</p>';
    }
}

function renderDistricts(districts) {
    const container = document.getElementById('districtList');
    container.innerHTML = '';
    // build a normalized list of district names (prefer known order)
    const preferredOrder = ['דרום','דן','מרכז','יו"ש','ירושלים','חוף','צפון'];
    const namesSet = new Set();
    // each group may contain comma-separated names; split and collect
    districts.forEach(d => {
        const parts = (d.name || '').split(/[,:،\-\/]+/).map(s => s.trim()).filter(Boolean);
        if (parts.length === 0) parts.push(d.name);
        parts.forEach(p => namesSet.add(p));
    });
    // order: preferred first if present, then alphabetical
    const names = [];
    preferredOrder.forEach(p => { if (namesSet.has(p)) { names.push(p); namesSet.delete(p); } });
    Array.from(namesSet).sort((a,b)=> a.localeCompare(b,'he')).forEach(n => names.push(n));

    names.forEach(name => {
        const card = document.createElement('div');
        card.className = 'district-card';
        card.dataset.district = name;
        card.innerHTML = `<div class="district-name">${name}</div><div style="margin-top:6px;text-align:left"><button class="btn btn-info open-page" data-district="${name}" style="padding:6px 8px;font-size:0.85rem">פתח בדף</button></div>`;
        container.appendChild(card);
    });

    // wire page-open buttons
    container.querySelectorAll('.open-page').forEach(b=> b.addEventListener('click', (e)=>{
        const d = e.currentTarget.dataset.district;
        if (d) location.href = `/alerts.html?district=${encodeURIComponent(d)}`;
    }));
}

function openDistrictView(districtName) {
    let view = document.getElementById('districtView');
    let title = document.getElementById('districtViewTitle');
    let list = document.getElementById('districtStations');

    // defensive: if DOM elements missing (older HTML), create minimal drawer
    if (!view || !title || !list) {
        console.warn('districtView elements missing, creating fallback drawer');
        // create container
        view = document.createElement('div');
        view.id = 'districtView';
        view.className = 'modal drawer';
        view.setAttribute('aria-hidden', 'true');
        view.innerHTML = `
            <div class="modal-backdrop" id="districtViewBackdrop"></div>
            <div class="modal-content bg-white rounded-xl p-4 shadow-xl w-[640px]" role="dialog" aria-modal="true">
                <div class="flex items-center justify-between mb-3">
                    <h3 id="districtViewTitle" class="text-lg font-bold text-slate-800">מחוז</h3>
                    <button id="districtBack" class="px-3 py-1 rounded-md bg-slate-100">סגור</button>
                </div>
                <div id="districtStations" class="space-y-2 max-h-[60vh] overflow-auto"><p class="text-slate-500">טוען תחנות...</p></div>
            </div>
        `;
        document.body.appendChild(view);
        title = document.getElementById('districtViewTitle');
        list = document.getElementById('districtStations');
        const backBtn = document.getElementById('districtBack');
        if (backBtn) backBtn.addEventListener('click', () => { view.setAttribute('aria-hidden','true'); });
    }
    title.textContent = districtName;
    list.innerHTML = '';
    // fetch stations for this district from API (we already have render data but simpler to call)
    fetch(`${API_BASE}/stations`).then(r => r.json()).then(res => {
        if (!res.success) return;
        const grp = res.data.find(g => g.name === districtName);
        if (!grp) { list.innerHTML = '<p class="empty">אין תחנות</p>'; }
        else {
            grp.stations.forEach(st => {
                const row = document.createElement('div');
                row.className = 'station-row';
                // determine status from stationAlertState
                const isAlert = stationAlertState[st.serial];
                if (isAlert) row.classList.add('alert'); else row.classList.add('ok');
                row.innerHTML = `<div><strong>${st.stationName}</strong> <div class="station-note">${st.apiCode}</div></div><div>${isAlert ? '🔴' : '🟢'}</div>`;
                list.appendChild(row);
            });
        }
        view.setAttribute('aria-hidden', 'false');
    }).catch(err => { list.innerHTML = '<p class="loading">שגיאה בטעינת תחנות</p>'; view.setAttribute('aria-hidden','false'); });
}

document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'districtBack') {
        const view = document.getElementById('districtView');
        view.setAttribute('aria-hidden', 'true');
    }
});

// Sidebar toggle
const sidebarToggle = document.getElementById('sidebarToggle');
if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
        const sb = document.querySelector('.sidebar');
        if (!sb) return;
        sb.classList.toggle('collapsed');
    });
}

async function handleIncomingAlertStations(alertData) {
    // alertData.cities may be a string like 'תל אביב, רמת גן' or array
    const cities = Array.isArray(alertData.cities) ? alertData.cities : (typeof alertData.cities === 'string' ? alertData.cities.split(',').map(s => s.trim()).filter(Boolean) : []);
    for (const city of cities) {
        try {
            const resp = await fetch(`${API_BASE}/stations/search?city=${encodeURIComponent(city)}`);
            const res = await resp.json();
            if (res.success && res.data && res.data.length) {
                res.data.forEach(st => markStationAlert(st, alertData));
            }
        } catch (err) {
            console.error('Station search error for', city, err);
        }
    }
}

function markStationAlert(station, alertData) {
    const serial = station.serial;
    const card = document.querySelector(`.station-item[data-serial="${serial}"]`);

    // always promote the district (so it appears on top)
    promoteDistrict(station.districtNormalized || station.districts || station.serverDistrict || '');

    // prepare note text
    const when = alertData.timestamp ? new Date(alertData.timestamp).toLocaleString('he-IL') : new Date().toLocaleString('he-IL');
    const noteText = `${getAlertTypeName(alertData.type)} • ${when}`;

    // If DOM card exists, update it visually
    if (card) {
        card.classList.add('alerting');
        let note = card.querySelector('.station-note');
        if (!note) {
            note = document.createElement('div');
            note.className = 'station-note';
            card.appendChild(note);
        }
        note.textContent = noteText;
    }

    // clear previous timeout
    if (stationAlertState[serial] && stationAlertState[serial].timeoutId) {
        clearTimeout(stationAlertState[serial].timeoutId);
    }

    // register alert state even if no DOM element exists so header popup and history include it
    const timeoutId = setTimeout(() => {
        // remove DOM changes if present
        const c = document.querySelector(`.station-item[data-serial="${serial}"]`);
        if (c) {
            c.classList.remove('alerting');
            const n = c.querySelector('.station-note'); if (n) n.remove();
        }
        delete stationAlertState[serial];
    }, 10 * 60 * 1000);

    stationAlertState[serial] = { timeoutId, details: { ...alertData, stationName: station.stationName, note: noteText, district: station.districtNormalized || station.districts || station.serverDistrict || '' } };

    // show header popup briefly (will read from stationAlertState as well)
    showHeaderAlertPopup(`${getAlertTypeName(alertData.type)} ב-${station.stationName}`);
}

function promoteDistrict(districtName) {
    if (!districtName) return;
    const container = document.getElementById('districtList');
    const node = container.querySelector(`.district-card[data-district="${districtName}"]`);
    if (node) {
        container.prepend(node);
        // highlight briefly
        node.classList.add('active');
        setTimeout(() => node.classList.remove('active'), 8000);
    }
}

function showHeaderAlertPopup(text) {
    const popup = document.getElementById('alertPopup');
    const popupTitle = document.getElementById('alertPopupTitle');
    const popupDetails = document.getElementById('alertPopupDetails');
    if (!popup || !popupTitle || !popupDetails) return;
    popupTitle.textContent = text || 'זוהתה התרעה!';
    // list currently alerting stations
    const items = Object.values(stationAlertState).map(s => s.details && s.details.stationName ? s.details.stationName : (s.details && s.details.type ? s.details.type : null)).filter(Boolean);
    // better: iterate keys and find DOM station names
    const list = [];
    for (const serial in stationAlertState) {
        const st = stationAlertState[serial];
        const details = st.details || {};
        const when = details.timestamp ? new Date(details.timestamp).toLocaleString('he-IL') : '';
        const label = details.stationName || details.cities || details.type || serial;
        list.push({ label, when, serial, district: details.district || '' });
    }
    if (list.length === 0) {
        popupDetails.innerHTML = '<div class="text-gray-600">אין תחנות פעילות כרגע</div>';
    } else {
        // build detailed rows with link to alerts page
        popupDetails.innerHTML = list.map(i => {
            const serial = i.serial || '';
            const district = i.district || '';
            const qs = [];
            if (district) qs.push('district=' + encodeURIComponent(district));
            if (serial) qs.push('serial=' + encodeURIComponent(serial));
            const href = '/alerts.html' + (qs.length ? ('?' + qs.join('&')) : '');
            return `<div class="px-2 py-1 border-b flex items-center justify-between">` +
                   `<div><strong>${i.label}</strong> <div class="text-sm text-gray-500">${i.when}</div></div>` +
                   `<div><a class="btn btn-info" href="${href}">פתח בדף</a></div>` +
                   `</div>`;
        }).join('');
    }
    popup.classList.add('show');
    popup.setAttribute('aria-hidden', 'false');
    setTimeout(() => { popup.classList.remove('show'); popup.setAttribute('aria-hidden', 'true'); }, 8000);
}

// Functions
async function loadInitialData() {
    await Promise.all([
        loadScannerStatus(),
        loadAlerts(),
        loadStations()
    ]);
}

// UI helpers
function showToast(message, type = 'info', ttl = 4000) {
    if (!toastContainer) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    toastContainer.appendChild(el);
    setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 300);
    }, ttl);
}

function setButtonLoading(button, isLoading, text) {
    if (isLoading) {
        button.classList.add('loading');
        button.disabled = true;
        if (text) button.dataset.prevText = button.textContent, button.textContent = text;
    } else {
        button.classList.remove('loading');
        button.disabled = false;
        if (button.dataset.prevText) { button.textContent = button.dataset.prevText; delete button.dataset.prevText; }
    }
}

function disableAlertToggles(disabled) {
    const inputs = document.querySelectorAll('.alerts-list input[type="checkbox"]');
    inputs.forEach(i => i.disabled = disabled);
}

async function loadScannerStatus() {
    try {
        const response = await fetch(`${API_BASE}/scanner/status`);
        const result = await response.json();
        console.log('Scanner status loaded:', result);
        if (result.success) {
            updateScannerStatus(result.data);
        }
    } catch (error) {
        console.error('Error loading scanner status:', error);
    }
}

async function loadAlerts() {
    try {
        const response = await fetch(`${API_BASE}/alerts/types`);
        const result = await response.json();
        if (result.success) {
            alerts = result.data;
            renderAlertsList();
        }
    } catch (error) {
        console.error('Error loading alerts:', error);
        realAlertsListEl.innerHTML = '<p class="loading">שגיאה בטעינת התרעות</p>';
        drillAlertsListEl.innerHTML = '<p class="loading">שגיאה בטעינת התרעות</p>';
    }
}

function renderAlertsList() {
    // הפרדה בין אמת לתרגיל
    const realAlerts = alerts.filter(alert => !alert.type.includes('Drill') && alert.type !== 'none');
    const drillAlerts = alerts.filter(alert => alert.type.includes('Drill'));

    // רינדור התרעות אמת
    if (realAlerts.length === 0) {
        realAlertsListEl.innerHTML = '<p class="empty">אין התרעות</p>';
    } else {
        realAlertsListEl.innerHTML = realAlerts.map(alert => `
            <div class="alert-item ${alert.enabled ? 'enabled' : ''}">
                <div class="alert-info">
                    <div class="alert-name">${alert.name || alert.type}</div>
                    <div class="alert-code">קוד: ${alert.code || 'לא מוגדר'}</div>
                </div>
                <label class="toggle-switch">
                    <input type="checkbox" ${alert.enabled ? 'checked' : ''} 
                           onchange="toggleAlert('${alert.type}', this.checked)">
                    <span class="toggle-slider"></span>
                </label>
            </div>
        `).join('');
    }

    // רינדור תרגילים
    if (drillAlerts.length === 0) {
        drillAlertsListEl.innerHTML = '<p class="empty">אין תרגילים</p>';
    } else {
        drillAlertsListEl.innerHTML = drillAlerts.map(alert => `
            <div class="alert-item ${alert.enabled ? 'enabled' : ''}">
                <div class="alert-info">
                    <div class="alert-name">${alert.name || alert.type}</div>
                    <div class="alert-code">קוד: ${alert.code || 'לא מוגדר'}</div>
                </div>
                <label class="toggle-switch">
                    <input type="checkbox" ${alert.enabled ? 'checked' : ''} 
                           onchange="toggleAlert('${alert.type}', this.checked)">
                    <span class="toggle-slider"></span>
                </label>
            </div>
        `).join('');
    }
}

async function toggleAlert(alertType, enabled) {
    const endpoint = enabled ? 'enable' : 'disable';
    try {
        disableAlertToggles(true);
        showToast((enabled ? 'מפעיל' : 'כיבוי') + ' התראה...', 'info', 1500);
        const response = await fetch(`${API_BASE}/alerts/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ alertType })
        });
        const result = await response.json();
        if (result.success) {
            const alert = alerts.find(a => a.type === alertType);
            if (alert) {
                alert.enabled = enabled;
                renderAlertsList();
            }
            showToast('העדכון נשמר', 'success');
        } else {
            showToast('שגיאה: ' + (result.error || 'לא הצלחנו לעדכן'), 'error');
            loadAlerts();
        }
    } catch (error) {
        console.error('Error toggling alert:', error);
        showToast('שגיאה בעדכון התראה', 'error');
        loadAlerts();
    } finally {
        disableAlertToggles(false);
    }
}

async function startScanner() {
    try {
        setButtonLoading(startBtn, true, 'מפעיל...');
        console.log('Sending start request...');
        const response = await fetch(`${API_BASE}/scanner/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        const result = await response.json();
        console.log('Start response:', result);
        if (result.success) {
            showToast('הסורק הופעל', 'success');
        } else {
            showToast('שגיאה: ' + (result.message || 'לא הצלחנו להפעיל'), 'error');
        }
    } catch (error) {
        console.error('Error starting scanner:', error);
        showToast('שגיאה בהפעלת הסורק: ' + error.message, 'error');
    } finally {
        setButtonLoading(startBtn, false);
    }
}

async function stopScanner() {
    try {
        if (!confirm('האם אתה בטוח שברצונך לעצור את הסורק?')) return;
        setButtonLoading(stopBtn, true, 'עוצר...');
        console.log('Sending stop request...');
        const response = await fetch(`${API_BASE}/scanner/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        const result = await response.json();
        console.log('Stop response:', result);
        if (result.success) {
            showToast('הסורק נעצר', 'success');
        } else {
            showToast('שגיאה: ' + (result.message || 'לא הצלחנו לעצור'), 'error');
        }
    } catch (error) {
        console.error('Error stopping scanner:', error);
        showToast('שגיאה בעצירת הסורק: ' + error.message, 'error');
    } finally {
        setButtonLoading(stopBtn, false);
    }
}

function updateScannerStatus(data) {
    console.log('Updating scanner status:', data);
    
    scannerStatus.isRunning = data.isRunning || false;
    
    if (data.stats) {
        scannerStatus.stats = { ...scannerStatus.stats, ...data.stats };
    }
    
    // עדכון UI
    if (scannerStatus.isRunning) {
        statusDot.style.background = '#48bb78';
        statusText.textContent = 'פועל';
        startBtn.disabled = true;
        stopBtn.disabled = false;
    } else {
        statusDot.style.background = '#ef4444';
        statusText.textContent = 'עוצר';
        startBtn.disabled = false;
        stopBtn.disabled = true;
    }
    
    // עדכון סטטיסטיקות
    scanCountEl.textContent = scannerStatus.stats.scanCount || 0;
    alertCountEl.textContent = scannerStatus.stats.alertCount || 0;
    telnetSuccessEl.textContent = scannerStatus.stats.telnetSuccess || 0;

    // scanner details
    if (scannerDetailEl) {
        const startedAt = scannerStatus.stats.startTime ? new Date(scannerStatus.stats.startTime).toLocaleString('he-IL') : 'לא הותחל';
        const enabledCount = (data.enabledAlerts && data.enabledAlerts.length) ? data.enabledAlerts.length : 0;
        scannerDetailEl.textContent = `מצב: ${scannerStatus.isRunning ? 'פועל' : 'עוצר'} • תחנות נטענו: ${enabledCount} • התחלה: ${startedAt}`;
    }
}

function addRecentAlert(alertData) {
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert-entry success';
    const simBadge = alertData.simulated ? '<span class="sim-badge">סימולציה</span>' : '';
    alertDiv.innerHTML = `
        <div class="alert-entry-header">
            <span class="alert-type">${getAlertTypeName(alertData.type)} ${simBadge}</span>
            <span class="alert-time">${formatTime(alertData.timestamp)}</span>
        </div>
        <div class="alert-cities">${alertData.cities || 'אין פרטים'}</div>
        <div class="alert-status success">✅ נשלח</div>
    `;
    
    recentAlertsEl.insertBefore(alertDiv, recentAlertsEl.firstChild);
    
    // הגבלת מספר התרעות
    const maxAlerts = 10;
    while (recentAlertsEl.children.length > maxAlerts) {
        recentAlertsEl.removeChild(recentAlertsEl.lastChild);
    }
    
    // הסרת הודעה ריקה אם יש
    const emptyMsg = recentAlertsEl.querySelector('.empty');
    if (emptyMsg) {
        emptyMsg.remove();
    }
}

function addToHistory(alertData) {
    alertHistory.push({
        ...alertData,
        date: new Date().toDateString()
    });
}

function updateAnalysis() {
    const today = new Date().toDateString();
    const todayAlerts = alertHistory.filter(a => a.date === today);
    
    const realAlerts = todayAlerts.filter(a => !a.type.includes('Drill'));
    const drillAlerts = todayAlerts.filter(a => a.type.includes('Drill'));
    
    totalTodayEl.textContent = todayAlerts.length;
    realTodayEl.textContent = realAlerts.length;
    drillTodayEl.textContent = drillAlerts.length;
    
    // Breakdown לפי סוג
    const breakdown = {};
    todayAlerts.forEach(alert => {
        const type = alert.type;
        breakdown[type] = (breakdown[type] || 0) + 1;
    });
    
    if (Object.keys(breakdown).length === 0) {
        analysisBreakdownEl.innerHTML = '<p class="empty">אין נתונים לניתוח</p>';
    } else {
        analysisBreakdownEl.innerHTML = Object.entries(breakdown)
            .map(([type, count]) => `
                <div class="breakdown-item">
                    <span class="breakdown-label">${getAlertTypeName(type)}</span>
                    <span class="breakdown-count">${count}</span>
                </div>
            `).join('');
    }
}

function getAlertTypeName(type) {
    const names = {
        'missiles': '🚀 ירי רקטות וטילים',
        'earthQuake': '🌍 רעידת אדמה',
        'hostileAircraftIntrusion': '✈️ חדירת כלי טיס עוין',
        'newsFlash': '📢 התרעה מקדימה',
        'terroristInfiltration': '⚠️ חדירת מחבלים',
        'missilesDrill': '🚀 תרגיל טילים',
        'earthQuakeDrill': '🌍 תרגיל רעידת אדמה',
        'hostileAircraftIntrusionDrill': '✈️ תרגיל כלי טיס',
        'terroristInfiltrationDrill': '⚠️ תרגיל חדירת מחבלים'
    };
    return names[type] || type;
}

function formatTime(timestamp) {
    if (!timestamp) return new Date().toLocaleTimeString('he-IL');
    const date = new Date(timestamp);
    return date.toLocaleTimeString('he-IL');
}

// Expose to global for inline handlers
window.toggleAlert = toggleAlert;
