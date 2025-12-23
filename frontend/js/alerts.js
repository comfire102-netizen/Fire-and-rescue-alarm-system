(function(){
  const socket = io();
  const API_BASE = '/api';
  const districtSelect = document.getElementById('districtSelect');
  const stationsList = document.getElementById('stationsList');
  const pageTitle = document.getElementById('pageTitle');
  const filterInput = document.getElementById('filterInput');
  const refreshBtn = document.getElementById('refreshBtn');
  const backIndex = document.getElementById('backIndex');
  const liveHeader = document.getElementById('liveHeader');

  let stationsData = [];
  let grouped = [];
  let alertState = {}; // serial -> details

  function qParam(name){
    const u = new URL(location.href);
    return u.searchParams.get(name);
  }

  async function loadStations(){
    try{
      const r = await fetch(`${API_BASE}/stations`);
      const j = await r.json();
      if(!j.success) return;
      grouped = j.data;
      stationsData = j.data.flatMap(g=>g.stations.map(s=>({...s, group: g.name})));
      populateDistricts();
        const q = qParam('district');
        const qSerial = qParam('serial');
        if(q) selectDistrict(q);
        else selectDistrict(grouped[0] && grouped[0].name);
        if(qSerial){
          const st = stationsData.find(x=>String(x.serial) === String(qSerial));
          if(st){
            const fakeAlert = { type: 'manual', timestamp: Date.now(), cities: [st.polygon] };
            applyAlert(st, fakeAlert);
            setTimeout(()=>{
              const el = document.getElementById('station-' + qSerial);
              if(el) el.scrollIntoView({behavior:'smooth', block:'center'});
            }, 50);
          }
        }
    }catch(e){
      console.error('loadStations',e);
    }
  }

  function populateDistricts(){
    districtSelect.innerHTML = grouped.map(g=>`<option value="${g.name}">${g.name} (${g.stations.length})</option>`).join('');
  }

  function selectDistrict(name){
    if(!name) return;
    districtSelect.value = name;
    pageTitle.textContent = `מחוז — ${name}`;
    renderStations(name);
  }

  function renderStations(district){
    const q = (filterInput.value||'').toLowerCase().trim();
    const list = stationsData.filter(s=>s.group===district && (!q || (s.stationName||'').toLowerCase().includes(q) || (s.polygon||'').toLowerCase().includes(q)));
    stationsList.innerHTML = list.map(s=>renderStationRow(s)).join('');
  }

  function renderStationRow(s){
    const a = alertState[s.serial];
    const cls = a ? 'station-row alert' : 'station-row ok';
    const note = a ? `<div class="station-note">${a.note}</div>` : `<div class="station-note">${s.apiCode}</div>`;
    return `<div id="station-${s.serial}" data-serial="${s.serial}" class="${cls}"><div><strong>${s.stationName}</strong>${note}</div><div>${a? '🔴': '🟢'}</div></div>`;
  }

  // socket handling - mirror structure from app.js
  socket.on('connect', ()=>{ console.log('alerts page socket connected'); });
  socket.on('alert:new', (data)=>{
    // mark matching stations
    const cities = Array.isArray(data.cities) ? data.cities : (typeof data.cities === 'string' ? data.cities.split(',').map(x=>x.trim()).filter(Boolean) : []);
    for(const city of cities){
      // try exact polygon first
      const exact = stationsData.find(s=> (s.polygon||'').toLowerCase() === city.toLowerCase() || (s.stationName||'').toLowerCase() === city.toLowerCase());
      if(exact){ applyAlert(exact, data); continue; }
      // try token matching
      const tokens = city.split(/[^\p{L}0-9]+/u).filter(Boolean).map(t=>t.toLowerCase());
      const found = stationsData.filter(s=>{
        const pk = (s.polygon||'').toLowerCase();
        return tokens.some(t=> pk.split(/[^\p{L}0-9]+/u).includes(t));
      });
      found.forEach(st=> applyAlert(st, data));
    }
    // update header
    updateLiveHeader();
  });

  function applyAlert(station, alertData){
    const when = alertData.timestamp ? new Date(alertData.timestamp).toLocaleString('he-IL') : new Date().toLocaleString('he-IL');
    const note = `${getAlertTypeName(alertData.type)} • ${when}`;
    // clear prev timeout
    if(alertState[station.serial] && alertState[station.serial].timeoutId) clearTimeout(alertState[station.serial].timeoutId);
    const timeoutId = setTimeout(()=>{ delete alertState[station.serial]; renderStations(districtSelect.value); updateLiveHeader(); }, 10*60*1000);
    alertState[station.serial] = { details: alertData, note, timeoutId };
    renderStations(districtSelect.value);
  }

  function updateLiveHeader(){
    const items = Object.values(alertState).map(a=>a.note);
    if(items.length===0){ liveHeader.innerHTML = '<div class="p-2 text-sm text-slate-600">אין התרעות פעילות כרגע</div>'; }
    else { liveHeader.innerHTML = `<div class="p-2 bg-red-50 rounded-md">${items.slice(0,8).map(i=>`<div>${i}</div>`).join('')}</div>`; }
  }

  function getAlertTypeName(type){
    const names = { 'missiles':'🚀 ירי רקטות וטילים','earthQuake':'🌍 רעידת אדמה','hostileAircraftIntrusion':'✈️ חדירת כלי טיס עוין','newsFlash':'📢 התרעה מקדימה','terroristInfiltration':'⚠️ חדירת מחבלים' };
    return names[type] || type;
  }

  // UI events
  districtSelect.addEventListener('change', ()=> selectDistrict(districtSelect.value));
  filterInput.addEventListener('input', ()=> renderStations(districtSelect.value));
  refreshBtn.addEventListener('click', ()=> loadStations());
  backIndex.addEventListener('click', ()=> location.href = '/');

  // init
  loadStations();

})();
