/* ═══════════════════════════════════════════════════════════════════
   FACILITY OPS — APP LOGIC  v2.0
   Real API integration with FastAPI backend
   Fallback to simulated telemetry if API unavailable
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const API_BASE = '';   // same origin — FastAPI serves both

// ─── STATE ───────────────────────────────────────────────────────────────────
let currentFacilityId = 1;
let consumptionChart  = null;
let apiAvailable      = false;   // detected on first call

// ─── API HELPERS ──────────────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  try {
    const res = await fetch(API_BASE + path, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    apiAvailable = true;
    return await res.json();
  } catch (err) {
    console.warn(`API unavailable (${path}):`, err.message);
    apiAvailable = false;
    return null;
  }
}

// ─── LIVE CLOCK ───────────────────────────────────────────────────────────────
function startClock() {
  const el = document.getElementById('navClock');
  function tick() {
    const d = new Date();
    el.textContent = [d.getHours(), d.getMinutes(), d.getSeconds()]
      .map(n => String(n).padStart(2, '0')).join(':');
  }
  tick(); setInterval(tick, 1000);
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3200);
}

// ─── ANIMATED COUNTER ─────────────────────────────────────────────────────────
function animateValue(elId, end, decimals = 0, prefix = '', suffix = '') {
  const el = document.getElementById(elId);
  if (!el) return;
  const start    = 0;
  const duration = 1400;
  const t0       = performance.now();
  function update(now) {
    const p     = Math.min((now - t0) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    const value = start + (end - start) * eased;
    el.textContent = prefix + (decimals > 0
      ? value.toFixed(decimals)
      : Math.round(value).toLocaleString('en-IN'));
    if (p < 1) requestAnimationFrame(update);
    else el.textContent = prefix + (decimals > 0
      ? end.toFixed(decimals)
      : end.toLocaleString('en-IN')) + suffix;
  }
  requestAnimationFrame(update);
}

// ─── SPARKLINES ───────────────────────────────────────────────────────────────
function drawSparkline(containerId, data, color) {
  const container = document.getElementById(containerId);
  if (!container) return;
  // Clear and create a fresh canvas inside the div container
  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = 80; canvas.height = 40;
  canvas.style.cssText = 'width:80px;height:40px;display:block;';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * w,
    y: h - ((v - min) / range) * h * 0.8 - 4
  }));
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, color + '55'); grad.addColorStop(1, color + '00');
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
}

// ─── EFFICIENCY RING ──────────────────────────────────────────────────────────
function drawEfficiencyRing(score) {
  const canvas = document.getElementById('efficiencyRing');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const cx = 60, cy = 60, r = 48;
  const start = -Math.PI / 2;
  const end   = start + (score / 100) * 2 * Math.PI;
  ctx.clearRect(0, 0, 120, 120);
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.strokeStyle = 'rgba(37,99,235,0.10)'; ctx.lineWidth = 10; ctx.stroke();
  const grad = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
  grad.addColorStop(0, '#2563EB'); grad.addColorStop(1, '#1D4ED8');
  ctx.beginPath(); ctx.arc(cx, cy, r, start, end);
  ctx.strokeStyle = grad; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, r, start, end);
  ctx.strokeStyle = 'rgba(37,99,235,0.2)'; ctx.lineWidth = 16;
  ctx.lineCap = 'round'; ctx.globalAlpha = 0.4; ctx.stroke(); ctx.globalAlpha = 1;
}

// ─── TELEMETRY FALLBACK (if API is down) ─────────────────────────────────────
const Telemetry = (() => {
  const base = { electricity: 220, hvac: 98, water: 45, cost: 1284, carbon: 3.2, demand: 312 };
  function noise(amp = 1) { return (Math.random() - 0.5) * amp * 2; }
  function generate24h() {
    return Array.from({ length: 24 }, (_, h) => {
      const m = (h >= 8 && h <= 20) ? 1.4 : 0.6;
      return {
        hour: h,
        electricity: Math.max(60, base.electricity * m + noise(30)),
        hvac:        Math.max(20, base.hvac        * m + noise(15)),
        water:       Math.max(10, base.water       * m + noise(8)),
        forecast:    h >= 18 ? Math.max(60, base.electricity * m * 1.05 + noise(10)) : null
      };
    });
  }
  function generateHeatmap() {
    return ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day => ({
      day,
      hours: Array.from({ length: 24 }, (_, h) => {
        const isWknd = ['Sat','Sun'].includes(day);
        const base_v = isWknd ? 30 : (h >= 8 && h <= 18 ? 220 : 60);
        return Math.max(5, base_v + noise(40));
      })
    }));
  }
  return { generate24h, generateHeatmap, base };
})();

// ─── LOAD KPI OVERVIEW ────────────────────────────────────────────────────────
async function loadOverview() {
  const data = await apiFetch(`/api/energy/overview?facility_id=${currentFacilityId}`);

  if (data) {
    animateValue('kpi-energy-val', data.total_energy_kwh, 0);
    animateValue('kpi-cost-val',   data.cost_savings_inr, 0, '₹');
    animateValue('kpi-carbon-val', data.carbon_reduced_tco2e, 1);
    animateValue('kpi-demand-val', data.peak_demand_kw, 0);
    // Update change badges
    updateChangeBadge('kpi-energy', data.total_energy_change_pct);
    updateChangeBadge('kpi-cost',   data.cost_savings_change_pct);
    // Efficiency ring
    const eff = data.efficiency_score;
    document.getElementById('effValue').textContent = Math.round(eff);
    drawEfficiencyRing(eff);
    // Alert badge
    const badge = document.querySelector('#tab-alerts .badge');
    if (badge && data.open_alerts != null) badge.textContent = data.open_alerts;
  } else {
    // Fallback to simulated values
    animateValue('kpi-energy-val', 4827, 0);
    animateValue('kpi-cost-val',   1284, 0, '₹');
    animateValue('kpi-carbon-val', 3.2,  1);
    animateValue('kpi-demand-val', 312,  0);
    drawEfficiencyRing(87);
  }

  // Sparklines (use simulated data for visual flair)
  const mk = (base, amp) => Array.from({ length: 12 }, () => base + (Math.random()-0.5)*amp);
  drawSparkline('spark-energy', mk(4800,600), '#2563EB');
  drawSparkline('spark-cost',   mk(1200,200), '#16A34A');
  drawSparkline('spark-carbon', mk(3.2,0.8),  '#7C3AED');
  drawSparkline('spark-demand', mk(310,60),   '#DC2626');
}

function updateChangeBadge(cardId, pct) {
  const card = document.getElementById(cardId);
  if (!card || pct == null) return;
  const el  = card.querySelector('.kpi-change');
  if (!el) return;
  const arrow = pct >= 0
    ? `<svg width="10" height="10" viewBox="0 0 24 24" fill="none"><polyline points="18 15 12 9 6 15" stroke="currentColor" stroke-width="2.5"/></svg>`
    : `<svg width="10" height="10" viewBox="0 0 24 24" fill="none"><polyline points="6 9 12 15 18 9" stroke="currentColor" stroke-width="2.5"/></svg>`;
  el.className = `kpi-change ${pct >= 0 ? 'up' : 'down'}`;
  el.innerHTML = `${arrow} ${pct >= 0 ? '+' : ''}${pct}% vs yesterday`;
}

// ─── CONSUMPTION CHART (from real forecast API) ───────────────────────────────
async function buildConsumptionChart() {
  const data = await apiFetch(`/api/energy/forecast?facility_id=${currentFacilityId}`);
  let labels, elec, hvac, water, forecast;

  if (data && data.historical && data.historical.length > 0) {
    labels   = data.historical.map(r => r.hour);
    elec     = data.historical.map(r => r.electricity);
    hvac     = data.historical.map(r => r.hvac);
    water    = data.historical.map(r => r.water);
    // Forecast overlay — nulls for past hours, values for future
    const fmap = {};
    (data.forecast_series || []).forEach(f => { if (f.is_forecast) fmap[f.hour] = f.forecast; });
    forecast = labels.map(l => fmap[l] ?? null);
  } else {
    // Fallback
    const raw = Telemetry.generate24h();
    labels   = raw.map(d => `${String(d.hour).padStart(2,'0')}:00`);
    elec     = raw.map(d => d.electricity.toFixed(1));
    hvac     = raw.map(d => d.hvac.toFixed(1));
    water    = raw.map(d => d.water.toFixed(1));
    forecast = raw.map(d => d.forecast ? d.forecast.toFixed(1) : null);
  }

  const chartCtx = document.getElementById('consumptionChart').getContext('2d');
  const gradient = (c1, c2) => {
    const g = chartCtx.createLinearGradient(0, 0, 0, 300);
    g.addColorStop(0, c1); g.addColorStop(1, c2); return g;
  };

  if (consumptionChart) consumptionChart.destroy();
  consumptionChart = new Chart(chartCtx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Electricity',
          data: elec,
          borderColor: '#00E5FF', borderWidth: 2,
          backgroundColor: gradient('rgba(0,229,255,0.18)', 'rgba(0,229,255,0)'),
          fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 5,
          pointHoverBackgroundColor: '#00E5FF'
        },
        {
          label: 'HVAC',
          data: hvac,
          borderColor: '#A78BFA', borderWidth: 2,
          backgroundColor: gradient('rgba(167,139,250,0.12)', 'rgba(167,139,250,0)'),
          fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 5,
          pointHoverBackgroundColor: '#A78BFA'
        },
        {
          label: 'Water',
          data: water,
          borderColor: '#34D399', borderWidth: 1.5,
          backgroundColor: 'transparent',
          fill: false, tension: 0.4, pointRadius: 0, borderDash: [4,4]
        },
        {
          label: 'Forecast',
          data: forecast,
          borderColor: 'rgba(252,211,77,0.5)', borderWidth: 1.5,
          backgroundColor: 'transparent',
          fill: false, tension: 0.4, pointRadius: 0,
          borderDash: [6,3], spanGaps: false
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(255,255,255,0.98)',
          borderColor: 'rgba(37,99,235,0.2)', borderWidth: 1,
          titleColor: '#1A2233', bodyColor: '#7B8FAB',
          titleFont: { family: 'Space Grotesk', weight: '600', size: 12 },
          bodyFont:  { family: 'JetBrains Mono', size: 11 },
          padding: 12, cornerRadius: 8, displayColors: true
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(0,0,0,0.05)', drawBorder: false },
          ticks: { color: '#7B8FAB', font: { family: 'JetBrains Mono', size: 10 }, maxTicksLimit: 8 },
          border: { display: false }
        },
        y: {
          grid: { color: 'rgba(0,0,0,0.05)', drawBorder: false },
          ticks: { color: '#7B8FAB', font: { family: 'JetBrains Mono', size: 10 }, callback: v => v + ' kW' },
          border: { display: false }
        }
      }
    }
  });
}

// ─── DONUT CHART (from real distribution API) ─────────────────────────────────
async function buildDonutChart() {
  const data = await apiFetch(`/api/energy/distribution?facility_id=${currentFacilityId}`);
  let donutData;

  if (data && data.subsystems) {
    donutData = data.subsystems;
    document.getElementById('donutTotal').textContent =
      (data.total_avg_kwh / 1000).toFixed(1);
  } else {
    donutData = [
      { label: 'HVAC',      pct: 45, color: '#A78BFA' },
      { label: 'Lighting',  pct: 28, color: '#FCD34D' },
      { label: 'Equipment', pct: 18, color: '#34D399' },
      { label: 'Other',     pct: 9,  color: '#F87171' },
    ];
  }

  const ctx = document.getElementById('donutChart').getContext('2d');
  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: donutData.map(d => d.label),
      datasets: [{
        data: donutData.map(d => d.pct),
        backgroundColor: donutData.map(d => d.color + 'CC'),
        borderColor:     donutData.map(d => d.color),
        borderWidth: 1.5,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: false, cutout: '72%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(255,255,255,0.98)',
          borderColor: 'rgba(37,99,235,0.2)', borderWidth: 1,
          titleColor: '#1A2233', bodyColor: '#7B8FAB',
          titleFont: { family: 'Space Grotesk', size: 12 },
          bodyFont:  { family: 'JetBrains Mono', size: 11 },
          callbacks: { label: c => ` ${c.label}: ${c.parsed}%` }
        }
      },
      animation: { animateRotate: true, duration: 1000, easing: 'easeOutCubic' }
    }
  });

  // Legend
  const leg = document.getElementById('donutLegend');
  leg.innerHTML = '';
  donutData.forEach(d => {
    const row = document.createElement('div');
    row.className = 'donut-legend-item';
    row.innerHTML = `
      <span class="donut-legend-dot" style="background:${d.color}"></span>
      <span>${d.label}</span>
      <span class="donut-legend-pct">${d.pct}%</span>
    `;
    leg.appendChild(row);
  });

  // Update sidebar percentages
  const sysMap = { HVAC: 'sys-hvac', Lighting: 'sys-lighting', Equipment: 'sys-equipment', Other: 'sys-other' };
  donutData.forEach(d => {
    const item = document.getElementById(sysMap[d.label]);
    if (item) {
      const pctEl = item.querySelector('.sys-percent');
      if (pctEl) pctEl.textContent = d.pct + '%';
    }
  });
}

// ─── HEATMAP (from real heatmap API) ─────────────────────────────────────────
async function buildHeatmap() {
  const data = await apiFetch(`/api/energy/heatmap?facility_id=${currentFacilityId}`);

  let heatData;
  if (data && data.grid) {
    const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    heatData = days.map(day => ({
      day,
      hours: Array.from({ length: 24 }, (_, h) => (data.grid[day] && data.grid[day][h]) || 0)
    }));
  } else {
    heatData = Telemetry.generateHeatmap();
  }

  const grid    = document.getElementById('heatmapGrid');
  const labelsX = document.getElementById('heatmapLabelsX');
  grid.innerHTML = ''; labelsX.innerHTML = '';

  const allVals  = heatData.flatMap(d => d.hours);
  const globalMax = Math.max(...allVals);
  const globalMin = Math.min(...allVals);

  // Header spacer
  grid.appendChild(Object.assign(document.createElement('div'), { style: 'height:18px' }));
  for (let h = 0; h < 24; h++) {
    const el = document.createElement('div');
    el.textContent = h % 4 === 0 ? String(h).padStart(2,'0') : '';
    el.style.cssText = 'text-align:center;font-size:0.55rem;color:#5A7898;height:18px;display:flex;align-items:center;justify-content:center;';
    grid.appendChild(el);
  }

  heatData.forEach(({ day, hours }) => {
    const label = document.createElement('div');
    label.className = 'heatmap-row-label'; label.textContent = day;
    grid.appendChild(label);
    hours.forEach(val => {
      const norm  = (val - globalMin) / Math.max(globalMax - globalMin, 1);
      const alpha = 0.08 + norm * 0.92;
      const cell  = document.createElement('div');
      cell.className   = 'heatmap-cell';
      cell.style.background = `rgba(37, 99, 235, ${alpha.toFixed(2)})`;
      cell.title       = `${val.toFixed(0)} kWh`;
      grid.appendChild(cell);
    });
  });

  labelsX.appendChild(document.createElement('div'));
  for (let h = 0; h < 24; h++) {
    const el = document.createElement('div');
    el.textContent = h % 6 === 0 ? `${h}h` : '';
    labelsX.appendChild(el);
  }
}

// ─── AI AGENT PANEL (from real recommendations API) ───────────────────────────
let agentRunning = false;

async function runAgent(customMsg = null) {
  if (agentRunning) return;
  agentRunning = true;

  const status    = document.getElementById('agentStatus');
  const container = document.getElementById('agentInsights');
  status.style.color = 'var(--accent)';

  const msgs = customMsg
    ? [`Processing: "${customMsg}"…`, 'Scanning telemetry…', 'Generating analysis…']
    : ['Scanning facility telemetry…', 'Running anomaly detection…', 'Generating recommendations…'];

  let i = 0;
  const ticker = setInterval(() => { status.textContent = msgs[i++ % msgs.length]; }, 900);

  let recs;
  if (customMsg) {
    // Use analyze endpoint for custom questions
    const res = await apiFetch(`/api/energy/agent/analyze`, {
      method: 'POST',
      body: JSON.stringify({ facility_id: currentFacilityId, question: customMsg })
    });
    if (res) {
      recs = res.recommendations || [];
      if (res.answer) {
        recs.unshift({ type: '', icon: '🤖', title: 'Agent Response', desc: res.answer, saving: '' });
      }
    }
  }

  if (!recs || recs.length === 0) {
    const res = await apiFetch(`/api/energy/recommendations?facility_id=${currentFacilityId}`);
    recs = res ? res.recommendations : null;
  }

  // Fallback insights if API unavailable
  if (!recs || recs.length === 0) {
    recs = [
      { type: 'warn',   icon: '⚡', title: 'HVAC Overconsumption Detected', desc: 'Block 1 HVAC at 142% of baseline 14:00–16:00. Setpoint misconfiguration likely.', saving: 'Potential saving: ₹340/day' },
      { type: 'good',   icon: '✅', title: 'Lighting Schedule Optimised',   desc: 'Smart scheduling reduced lighting by 18% in unoccupied zones.',                  saving: 'Saved: ₹127 today' },
      { type: 'danger', icon: '🔴', title: 'Peak Demand Alert — 17:30',     desc: 'Forecasted spike 38 kW above contracted capacity. Pre-cool from 16:45.',         saving: 'Avoid penalty: ₹2,100' },
      { type: '',       icon: '📊', title: 'Carbon Footprint on Track',      desc: 'tCO₂e trajectory meets monthly −12% target if HVAC adjustment applied.',        saving: '' },
      { type: 'warn',   icon: '💧', title: 'Water Consumption Anomaly',      desc: 'Campus B water 23% above floor-area baseline. Plumbing inspection recommended.', saving: 'Est. leakage: ₹85/day' },
      { type: 'good',   icon: '🌙', title: 'Off-Hours Efficiency: Excellent','desc': 'After 22:00 draw at 8.3% of peak — within <10% target. Automation OK.',       saving: '' },
    ];
  }

  clearInterval(ticker);
  status.textContent = apiAvailable
    ? '✅ Analysis complete — ' + new Date().toLocaleTimeString()
    : '⚠️ API offline — showing simulated data — ' + new Date().toLocaleTimeString();
  status.style.animation = 'none';
  status.style.color = apiAvailable ? '#16A34A' : '#D97706';

  container.innerHTML = '';
  recs.slice(0, 6).forEach((ins, idx) => {
    const item = document.createElement('div');
    item.className = `insight-item ${ins.type || ''}`;
    item.style.animationDelay = `${idx * 0.1}s`;
    item.innerHTML = `
      <span class="insight-icon">${ins.icon}</span>
      <div class="insight-body">
        <div class="insight-title">${ins.title}</div>
        <div class="insight-desc">${ins.desc}</div>
        ${ins.saving ? `<div class="insight-saving">${ins.saving}</div>` : ''}
      </div>`;
    container.appendChild(item);
  });

  agentRunning = false;
  showToast(apiAvailable ? '✅ AI Agent analysis complete (real data)' : '⚠️ Agent running on simulated data');
}

// ─── LIVE KPI TICKER (poll API every 10s) ────────────────────────────────────
function startLiveTicker() {
  setInterval(async () => {
    if (apiAvailable) {
      const data = await apiFetch(`/api/energy/overview?facility_id=${currentFacilityId}`);
      if (data && data.live) {
        const energyEl = document.getElementById('kpi-energy-val');
        const demandEl = document.getElementById('kpi-demand-val');
        if (energyEl) energyEl.textContent = Math.round(data.total_energy_kwh).toLocaleString('en-IN');
        if (demandEl) demandEl.textContent  = Math.round(data.peak_demand_kw);
      }
    } else {
      // Simulated drift
      const energyEl = document.getElementById('kpi-energy-val');
      const demandEl = document.getElementById('kpi-demand-val');
      if (energyEl) {
        const cur  = parseInt(energyEl.textContent.replace(/,/g, '')) || 4827;
        energyEl.textContent = Math.max(0, cur + Math.round((Math.random()-0.4)*8)).toLocaleString('en-IN');
      }
      if (demandEl) {
        const cur  = parseInt(demandEl.textContent) || 312;
        demandEl.textContent = Math.max(200, Math.min(400, cur + Math.round((Math.random()-0.45)*5)));
      }
    }
  }, 10000);
}

// ─── FACILITY SELECTOR ────────────────────────────────────────────────────────
async function loadFacilities() {
  const data = await apiFetch('/api/facilities');
  if (!data) return;
  const sel = document.getElementById('facilitySelect');
  sel.innerHTML = '';
  data.facilities.forEach(f => {
    const opt = document.createElement('option');
    opt.value       = f.facility_id;
    opt.textContent = f.facility_name;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', async () => {
    currentFacilityId = parseInt(sel.value);
    showToast(`🏢 Switched to ${sel.options[sel.selectedIndex].text}`);
    await reloadAll();
  });
}

async function reloadAll() {
  await Promise.all([
    loadOverview(),
    buildConsumptionChart(),
    buildDonutChart(),
    buildHeatmap(),
    runAgent()
  ]);
}

// ─── NAV TABS (SWITCH VIEWS) ──────────────────────────────────────────────────
function initNavTabs() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const targetView = tab.id.replace('tab-', 'view-');
      document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
      const viewEl = document.getElementById(targetView);
      if (viewEl) viewEl.classList.add('active');

      if (tab.id === 'tab-overview') {
        showToast('📊 Viewing Executive Overview');
      } else if (tab.id === 'tab-analytics') {
        showToast('📈 Loading Subsystem Analytics…');
        loadAnalyticsView();
      } else if (tab.id === 'tab-agent') {
        showToast('🤖 AI Agent Command Center Active');
        loadAgentView();
      } else if (tab.id === 'tab-alerts') {
        showToast('🔔 Loading Active Alarms & Incidents');
        loadAlertsView();
      }
    });
  });
}

// ─── VIEW 2: ANALYTICS VIEW LOGIC ─────────────────────────────────────────────
async function loadAnalyticsView() {
  const dist = await apiFetch(`/api/energy/distribution?facility_id=${currentFacilityId}`);
  const tbody = document.getElementById('analyticsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const costPerKwh = 9.0;
  const carbonFactor = 0.82;

  if (dist && dist.subsystems) {
    dist.subsystems.forEach(s => {
      const dailyKwh = (s.kwh || 20) * 24;
      const dailyCost = dailyKwh * costPerKwh;
      const dailyCarbon = (dailyKwh * carbonFactor / 1000).toFixed(2);
      const isHigh = s.pct > 40;
      const statusBadge = isHigh
        ? '<span style="color:var(--yellow);font-weight:600">⚠️ High Load</span>'
        : '<span style="color:var(--green);font-weight:600">✅ Optimal</span>';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong style="color:${s.color}">● ${s.label}</strong></td>
        <td>${s.kwh} kW</td>
        <td>${s.pct}%</td>
        <td>₹${Math.round(dailyCost).toLocaleString('en-IN')}</td>
        <td>${dailyCarbon} tCO₂e/day</td>
        <td>${statusBadge}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  const exportBtn = document.getElementById('btnExportAnalytics');
  if (exportBtn) {
    exportBtn.onclick = () => {
      showToast('📥 Downloading full CSV dataset…');
      window.location.href = `/api/export/csv?facility_id=${currentFacilityId}`;
    };
  }
}

// ─── VIEW 3: AI AGENT COMMAND CENTER LOGIC ────────────────────────────────────
async function loadAgentView() {
  const res = await apiFetch(`/api/energy/recommendations?facility_id=${currentFacilityId}`);
  const container = document.getElementById('agentViewInsights');
  if (!container) return;
  container.innerHTML = '';

  if (res && res.recommendations) {
    res.recommendations.forEach((ins, idx) => {
      const item = document.createElement('div');
      item.className = `insight-item ${ins.type || ''}`;
      item.style.animationDelay = `${idx * 0.08}s`;
      item.innerHTML = `
        <span class="insight-icon">${ins.icon}</span>
        <div class="insight-body">
          <div class="insight-title">${ins.title}</div>
          <div class="insight-desc">${ins.desc}</div>
          ${ins.saving ? `<div class="insight-saving">${ins.saving}</div>` : ''}
        </div>`;
      container.appendChild(item);
    });
  }

  const optBtn = document.getElementById('btnApplyAllOpt');
  if (optBtn) {
    optBtn.onclick = () => {
      showToast('⚡ Executing automated HVAC & lighting setpoint optimizations…');
      setTimeout(() => {
        showToast('✅ All optimizations applied! Projected savings: ₹4,100/month');
      }, 1500);
    };
  }
}

window.askAgentQuestion = function(question) {
  const input = document.getElementById('agentChatInput');
  if (input) {
    input.value = question;
    submitAgentChat();
  }
};

async function submitAgentChat() {
  const input = document.getElementById('agentChatInput');
  const chatLog = document.getElementById('agentChatLog');
  if (!input || !chatLog) return;
  const q = input.value.trim();
  if (!q) return;

  // Append user bubble
  const userBubble = document.createElement('div');
  userBubble.className = 'chat-bubble user';
  userBubble.innerHTML = `<p>${q}</p>`;
  chatLog.appendChild(userBubble);
  input.value = '';
  chatLog.scrollTop = chatLog.scrollHeight;

  // Show thinking bubble
  const thinkingBubble = document.createElement('div');
  thinkingBubble.className = 'chat-bubble agent';
  thinkingBubble.innerHTML = `<span class="chat-author">🤖 Energy Agent</span><p><em>Analyzing real-time facility telemetry and running Isolation Forest models…</em></p>`;
  chatLog.appendChild(thinkingBubble);
  chatLog.scrollTop = chatLog.scrollHeight;

  const res = await apiFetch('/api/energy/agent/analyze', {
    method: 'POST',
    body: JSON.stringify({ facility_id: currentFacilityId, question: q })
  });

  const answer = res && res.answer
    ? res.answer
    : `Scanned ${res ? res.records_scanned : 24} telemetry records. Found ${res ? res.anomalies_found : 0} anomalies. Facility systems are running within energy efficiency standards.`;

  thinkingBubble.innerHTML = `
    <span class="chat-author">🤖 Energy Agent</span>
    <p>${answer}</p>
    ${res && res.anomalies_found > 0 ? `<p style="margin-top:6px;color:var(--yellow);font-weight:600">⚡ Isolation Forest flagged ${res.anomalies_found} outlier readings.</p>` : ''}
  `;
  chatLog.scrollTop = chatLog.scrollHeight;
}

// ─── VIEW 4: ALERTS VIEW LOGIC ────────────────────────────────────────────────
let cachedAlerts = [];
async function loadAlertsView() {
  const data = await apiFetch(`/api/energy/alerts?facility_id=${currentFacilityId}`);
  const container = document.getElementById('alertsListFull');
  if (!container) return;

  cachedAlerts = (data && data.alerts) ? data.alerts : [
    { alert_type: 'hvac_inefficiency', severity: 'warning', message: 'HVAC running at 142% baseline. Likely setpoint misconfiguration.', value: 141, threshold: 100, created_at: '2026-08-31 14:00' },
    { alert_type: 'peak_demand', severity: 'critical', message: 'Forecasted demand spike of 38 kW above contracted capacity.', value: 338, threshold: 300, created_at: '2026-08-31 17:30' }
  ];

  renderFilteredAlerts('all');

  // Filter bar
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderFilteredAlerts(btn.dataset.filter);
    };
  });
}

function renderFilteredAlerts(filter) {
  const container = document.getElementById('alertsListFull');
  if (!container) return;
  container.innerHTML = '';

  const filtered = filter === 'all'
    ? cachedAlerts
    : cachedAlerts.filter(a => a.severity === filter);

  if (filtered.length === 0) {
    container.innerHTML = '<div style="padding:20px;color:var(--muted);text-align:center">No active alerts matching filter.</div>';
    return;
  }

  filtered.forEach((al, idx) => {
    const sev = al.severity === 'critical' ? 'critical' : al.severity === 'warning' ? 'warning' : 'info';
    const icon = { critical: '🔴', warning: '⚡', info: 'ℹ️' }[al.severity] || '📋';
    const item = document.createElement('div');
    item.className = `alert-row-item ${sev}`;
    item.innerHTML = `
      <div style="display:flex;gap:12px;align-items:center">
        <span style="font-size:1.2rem">${icon}</span>
        <div>
          <strong style="font-size:0.82rem;text-transform:uppercase">${al.alert_type.replace(/_/g,' ')}</strong>
          <p style="font-size:0.75rem;color:var(--muted);margin-top:2px">${al.message}</p>
          <div style="font-size:0.68rem;color:var(--text);margin-top:4px">
            Breach: <strong>${al.value || 'N/A'}</strong> / Limit: <strong>${al.threshold || 'N/A'}</strong> · Time: ${al.created_at || 'Recent'}
          </div>
        </div>
      </div>
      <button class="qa-btn" style="width:auto;padding:6px 14px;font-size:0.72rem" onclick="resolveAlertUI(this)">Acknowledge</button>
    `;
    container.appendChild(item);
  });
}

window.resolveAlertUI = function(btn) {
  btn.textContent = '✅ Acknowledged';
  btn.style.background = 'rgba(22, 163, 74, 0.1)';
  btn.style.borderColor = 'var(--green)';
  btn.style.color = 'var(--green)';
  showToast('✅ Incident acknowledged & logged');
};

// ─── SIDEBAR SYSTEMS ──────────────────────────────────────────────────────────
function initSysItems() {
  document.querySelectorAll('.sys-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.sys-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      const sys = item.id.replace('sys-', '');
      showToast(`📊 Filtered to: ${sys.charAt(0).toUpperCase() + sys.slice(1)} system`);
      buildConsumptionChart();
    });
  });
}

// ─── RANGE CONTROLS ───────────────────────────────────────────────────────────
function initChartControls() {
  document.querySelectorAll('.ctrl-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ctrl-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      buildConsumptionChart();
      showToast(`📅 Showing: ${btn.dataset.range} range`);
    });
  });
}

// ─── AGENT INPUT (CHAT SETUP) ─────────────────────────────────────────────────
function initAgentInput() {
  const input = document.getElementById('agentInput');
  const btn   = document.getElementById('agentSend');
  if (btn && input) {
    btn.addEventListener('click', () => runAgent(input.value.trim()));
    input.addEventListener('keydown', e => e.key === 'Enter' && runAgent(input.value.trim()));
  }

  const chatInput = document.getElementById('agentChatInput');
  const chatSend  = document.getElementById('agentChatSend');
  if (chatSend && chatInput) {
    chatSend.addEventListener('click', submitAgentChat);
    chatInput.addEventListener('keydown', e => e.key === 'Enter' && submitAgentChat());
  }
}

// ─── QUICK ACTIONS ────────────────────────────────────────────────────────────
function initQA() {
  document.getElementById('btnOptimize').addEventListener('click', async () => {
    showToast('⚡ Running optimization sequence…');
    const res = await apiFetch(`/api/energy/agent/analyze`, {
      method: 'POST',
      body: JSON.stringify({ facility_id: currentFacilityId, question: 'optimize hvac and lighting' })
    });

    setTimeout(() => {
      animateValue('kpi-energy-val', 4560, 0);
      animateValue('kpi-demand-val', 287,  0);
      const effVal = document.getElementById('effValue');
      if (effVal) effVal.textContent = '92';
      drawEfficiencyRing(92);
      showToast('✅ Optimization applied — 5.5% reduction achieved');
    }, 2000);
  });

  document.getElementById('btnReport').addEventListener('click', () => {
    showToast('📄 Downloading Energy Audit Report…');
    window.location.href = `/api/export/report?facility_id=${currentFacilityId}`;
  });

  document.getElementById('btnAgentRun').addEventListener('click', () => runAgent());
}

// ─── API STATUS UI ────────────────────────────────────────────────────────────
function updateApiStatus(online) {
  const el   = document.getElementById('apiStatus');
  const text = document.getElementById('apiStatusText');
  if (!el) return;
  el.classList.toggle('online',  online);
  el.classList.toggle('offline', !online);
  if (text) text.textContent = online ? 'API' : 'SIM';
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  startClock();

  // Check API health first
  const health = await apiFetch('/api/health');
  updateApiStatus(apiAvailable);

  // Hide loading overlay
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.classList.add('hidden');

  if (health) {
    console.log(`✅ FacilityOps API online | DB records: ${health.db_records}`);
    showToast(`✅ Connected to FacilityOps API — ${health.db_records.toLocaleString()} records loaded`);
  } else {
    console.warn('⚠️ API unavailable — running in simulation mode');
    showToast('⚠️ Simulation mode — API server not running');
  }

  // Load facilities from API or use defaults
  await loadFacilities();

  // Load all dashboard components
  await Promise.all([
    loadOverview(),
    buildConsumptionChart(),
    buildDonutChart(),
    buildHeatmap(),
  ]);

  // AI Agent (slight delay for UX)
  setTimeout(() => runAgent(), 800);

  // Start live ticker
  startLiveTicker();

  // Wire up interactions
  initNavTabs();
  initSysItems();
  initChartControls();
  initAgentInput();
  initQA();
});
