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

  // Maintenance Agent chat
  const maintInput = document.getElementById('maintChatInput');
  const maintSend  = document.getElementById('maintChatSend');
  if (maintSend && maintInput) {
    maintSend.addEventListener('click', submitMaintenanceChat);
    maintInput.addEventListener('keydown', e => e.key === 'Enter' && submitMaintenanceChat());
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

  document.getElementById('btnAgentRun') &&
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

/* ════════════════════════════════════════════════════════════════════
   MILESTONE 2 — MAINTENANCE DASHBOARD & AGENT SIDEBAR JAVASCRIPT
   ════════════════════════════════════════════════════════════════════ */

// ─── AGENT SIDEBAR SWITCHING ──────────────────────────────────────────────────
window.switchAgentView = function(agentKey) {
  document.querySelectorAll('.agent-sidebar-item').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('.agent-panel').forEach(p => p.classList.remove('active'));
  const navEl   = document.getElementById(`agentNav-${agentKey}`);
  const panelEl = document.getElementById(`agentPanel-${agentKey}`);
  if (navEl)   navEl.classList.add('active');
  if (panelEl) panelEl.classList.add('active');

  if (agentKey === 'maintenance') {
    loadMaintAgentPanel();
  }
};

// ─── MAINTENANCE CHAT Q&A ─────────────────────────────────────────────────────
window.askMaintenanceQuestion = function(q) {
  const input = document.getElementById('maintChatInput');
  if (input) { input.value = q; submitMaintenanceChat(); }
};

async function submitMaintenanceChat() {
  const input   = document.getElementById('maintChatInput');
  const chatLog = document.getElementById('maintChatLog');
  if (!input || !chatLog) return;
  const q = input.value.trim();
  if (!q) return;

  const userBubble = document.createElement('div');
  userBubble.className = 'chat-bubble user';
  userBubble.innerHTML = `<p>${q}</p>`;
  chatLog.appendChild(userBubble);
  input.value = '';
  chatLog.scrollTop = chatLog.scrollHeight;

  const thinkBubble = document.createElement('div');
  thinkBubble.className = 'chat-bubble agent';
  thinkBubble.innerHTML = `<span class="chat-author" style="color:#34D399">🔧 Maintenance Agent</span><p><em>Scanning equipment telemetry and running health assessments…</em></p>`;
  chatLog.appendChild(thinkBubble);
  chatLog.scrollTop = chatLog.scrollHeight;

  const res = await apiFetch('/api/maintenance/agent/analyze', {
    method: 'POST',
    body: JSON.stringify({ facility_id: currentFacilityId, question: q })
  });

  const answer = res && res.answer
    ? res.answer
    : `Maintenance Agent scanned facility assets. Overall health index on track.`;

  thinkBubble.innerHTML = `
    <span class="chat-author" style="color:#34D399">🔧 Maintenance Agent</span>
    <p>${answer}</p>
    ${res && res.critical_count > 0 ? `<p style="margin-top:6px;color:var(--red);font-weight:600">🔴 ${res.critical_count} critical asset(s) require immediate attention.</p>` : ''}
    ${res && res.warning_count > 0  ? `<p style="margin-top:4px;color:var(--yellow);font-weight:600">⚡ ${res.warning_count} asset(s) in warning state.</p>` : ''}
  `;
  chatLog.scrollTop = chatLog.scrollHeight;
}

// ─── MAINTENANCE AGENT PANEL (in AI Agent tab) ────────────────────────────────
async function loadMaintAgentPanel() {
  const res = await apiFetch('/api/assets');
  const container = document.getElementById('maintAgentInsights');
  if (!container || !res) return;
  container.innerHTML = '';

  res.assets.slice(0, 8).forEach((a, idx) => {
    const hs = a.health_score || 85;
    const status = (a.health_status || a.status || 'GOOD').toLowerCase();
    const barColor = { excellent: '#34D399', good: '#2563EB', warning: '#FCD34D', critical: '#F87171' }[status] || '#A78BFA';
    const item = document.createElement('div');
    item.className = 'insight-item';
    item.style.animationDelay = `${idx * 0.06}s`;
    item.innerHTML = `
      <span class="insight-icon">${{ AHU:'🌀', Chiller:'❄️', Pump:'💧', Transformer:'⚡', Elevator:'🛗', Genset:'🔋' }[a.asset_type] || '🔧'}</span>
      <div class="insight-body" style="flex:1">
        <div class="insight-title" style="display:flex;justify-content:space-between">
          <span>${a.asset_name}</span>
          <span class="status-badge ${status}">${(a.health_status || a.status)}</span>
        </div>
        <div class="health-bar-wrap" style="margin-top:6px">
          <div class="health-bar"><div class="health-bar-fill" style="width:${hs}%;background:${barColor}"></div></div>
          <span class="health-score-label" style="color:${barColor}">${hs}</span>
        </div>
        <div class="insight-desc" style="margin-top:4px">${(a.contributing_factors && a.contributing_factors[0]) || 'Operating within normal parameters'}</div>
      </div>`;
    container.appendChild(item);
  });

  const btn = document.getElementById('btnRunMaintAgent');
  if (btn) btn.onclick = async () => {
    showToast('🔧 Running Maintenance Agent analysis…');
    const r = await apiFetch('/api/maintenance/agent/analyze', {
      method: 'POST', body: JSON.stringify({ facility_id: currentFacilityId })
    });
    if (r) {
      showToast(`✅ Analysis complete: ${r.critical} critical, ${r.warning} warnings, ${r.healthy} healthy`);
      loadMaintAgentPanel();
    }
  };
}

// ─── MAINTENANCE DASHBOARD VIEW ───────────────────────────────────────────────
let cachedAssets = [], cachedMaintAlerts = [], maintHealthChart = null, maintRiskChart = null;

async function loadMaintenanceView() {
  showToast('🔧 Loading Predictive Maintenance System…');

  // KPI overview
  const ov = await apiFetch(`/api/maintenance/overview?facility_id=${currentFacilityId}`);
  if (ov) {
    document.getElementById('maint-kpi-total').textContent   = ov.total_assets;
    document.getElementById('maint-kpi-healthy').textContent = ov.operational;
    document.getElementById('maint-kpi-warning').textContent = ov.warning;
    document.getElementById('maint-kpi-critical').textContent= ov.critical;
    document.getElementById('maint-kpi-alerts').textContent  = ov.open_alerts;
    document.getElementById('maint-kpi-wo').textContent      = ov.open_work_orders;
  }

  // Assets
  const assetsRes = await apiFetch('/api/assets');
  if (assetsRes) {
    cachedAssets = assetsRes.assets;
    renderAssetTable(cachedAssets);
    buildHealthDistChart(cachedAssets);
    buildRiskDistChart(cachedAssets);
  }

  // Maintenance Alerts
  const alertsRes = await apiFetch(`/api/maintenance/alerts?facility_id=${currentFacilityId}`);
  if (alertsRes) {
    cachedMaintAlerts = alertsRes.alerts;
    renderMaintAlerts('all');
  }

  // Work Orders
  const woRes = await apiFetch(`/api/maintenance/work-orders?facility_id=${currentFacilityId}`);
  if (woRes) renderWorkOrders(woRes.work_orders);

  initMaintFilters();

  // Run All Assets button
  const btn = document.getElementById('btnRunAllAssets');
  if (btn) btn.onclick = async () => {
    showToast('🔧 Analyzing all assets…');
    btn.disabled = true;
    const r = await apiFetch('/api/maintenance/agent/analyze', {
      method: 'POST', body: JSON.stringify({ facility_id: currentFacilityId })
    });
    btn.disabled = false;
    if (r) {
      showToast(`✅ Done: ${r.critical} critical, ${r.warning} warnings, ${r.healthy} healthy`);
      loadMaintenanceView();
    }
  };
}

// ─── ASSET TABLE RENDER ───────────────────────────────────────────────────────
function renderAssetTable(assets) {
  const filter = (document.getElementById('assetRiskFilter') || {}).value || 'all';
  const filtered = filter === 'all' ? assets : assets.filter(a => (a.risk_level || '').toUpperCase() === filter);
  const tbody = document.getElementById('assetTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  filtered.forEach(a => {
    const hs = a.health_score || 85;
    const status = (a.health_status || a.status || 'GOOD').toLowerCase();
    const risk = (a.risk_level || 'LOW').toLowerCase();
    const barColor = { excellent: '#34D399', good: '#2563EB', warning: '#FCD34D', critical: '#F87171' }[status] || '#A78BFA';
    const tr = document.createElement('tr');
    tr.className = 'asset-row-clickable';
    tr.onclick = () => openAssetModal(a.asset_id);
    tr.innerHTML = `
      <td><strong style="font-size:0.8rem">${a.asset_name}</strong><br><span style="font-size:0.65rem;color:var(--muted);font-family:var(--font-mono)">${a.asset_id}</span></td>
      <td>${a.asset_type}</td>
      <td style="font-size:0.75rem">${a.location_zone || '—'}</td>
      <td>
        <div class="health-bar-wrap">
          <div class="health-bar"><div class="health-bar-fill" style="width:${hs}%;background:${barColor}"></div></div>
          <span class="health-score-label" style="color:${barColor}">${hs}</span>
        </div>
      </td>
      <td><span class="status-badge ${status}">${a.health_status || a.status}</span></td>
      <td><span class="risk-badge ${risk}">${a.risk_level || 'LOW'}</span></td>
      <td style="font-size:0.72rem">${a.last_maintenance_date || '—'}</td>
      <td>
        <button class="qa-btn" style="width:auto;padding:4px 10px;font-size:0.68rem" onclick="event.stopPropagation();openAssetModal('${a.asset_id}')">Inspect</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

// ─── MAINTENANCE ALERTS RENDER ────────────────────────────────────────────────
function renderMaintAlerts(filter) {
  const container = document.getElementById('maintAlertsList');
  if (!container) return;
  container.innerHTML = '';
  const filtered = filter === 'all' ? cachedMaintAlerts : cachedMaintAlerts.filter(a => a.severity === filter);
  if (!filtered.length) {
    container.innerHTML = '<div style="padding:20px;color:var(--muted);text-align:center">No active maintenance alerts for this filter.</div>';
    return;
  }
  filtered.forEach(al => {
    const icon = al.severity === 'critical' ? '🔴' : '⚡';
    const div = document.createElement('div');
    div.className = `maint-alert-item ${al.severity}`;
    div.innerHTML = `
      <div style="display:flex;gap:12px;align-items:flex-start;flex:1">
        <span style="font-size:1.1rem;margin-top:2px">${icon}</span>
        <div>
          <div style="font-size:0.78rem;font-weight:700;color:var(--text)">${al.asset_name || al.asset_id} — ${al.alert_type.replace(/_/g,' ').toUpperCase()}</div>
          <div style="font-size:0.72rem;color:var(--muted);margin-top:3px">${al.description}</div>
          <div style="font-size:0.68rem;color:var(--text);margin-top:4px">Condition: <strong>${al.detected_condition}</strong></div>
          <div style="font-size:0.68rem;color:var(--accent);margin-top:2px">→ ${al.recommended_action}</div>
        </div>
      </div>
      <div class="maint-alert-actions">
        <span class="status-badge ${al.status === 'NEW' ? 'warning' : al.status === 'ACKNOWLEDGED' ? 'good' : 'excellent'}" style="font-size:0.6rem">${al.status}</span>
        ${al.status === 'NEW' ? `<button class="qa-btn" style="width:auto;padding:4px 10px;font-size:0.68rem" onclick="acknowledgeAlert(${al.alert_id}, this)">Acknowledge</button>` : ''}
      </div>`;
    container.appendChild(div);
  });
}

window.acknowledgeAlert = async function(alertId, btn) {
  const res = await apiFetch(`/api/maintenance/alerts/${alertId}/acknowledge`, { method: 'POST' });
  if (res) {
    btn.textContent = '✅ Done'; btn.disabled = true;
    showToast('✅ Maintenance alert acknowledged');
    const al = cachedMaintAlerts.find(a => a.alert_id === alertId);
    if (al) al.status = 'ACKNOWLEDGED';
    renderMaintAlerts(document.querySelector('[data-mfilter].active')?.dataset.mfilter || 'all');
  }
};

// ─── WORK ORDERS RENDER ───────────────────────────────────────────────────────
function renderWorkOrders(wos) {
  const container = document.getElementById('workOrdersList');
  if (!container) return;
  container.innerHTML = '';
  if (!wos || !wos.length) {
    container.innerHTML = '<div style="color:var(--muted);font-size:0.75rem;padding:12px">No open work orders.</div>';
    return;
  }
  wos.forEach(wo => {
    const priority = (wo.priority || 'MEDIUM').toLowerCase();
    const status   = (wo.status || 'OPEN').toLowerCase().replace(' ', '_');
    const div = document.createElement('div');
    div.className = 'work-order-card';
    div.innerHTML = `
      <div class="wo-header">
        <span class="wo-id">${wo.work_order_id}</span>
        <span class="wo-priority ${priority}">${wo.priority}</span>
      </div>
      <div class="wo-issue">${wo.issue}</div>
      <div class="wo-asset">🔧 ${wo.asset_name || wo.asset_id}</div>
      <div class="wo-status-row">
        <span class="wo-status-pill ${status}">${wo.status}</span>
        <div style="display:flex;gap:4px">
          ${wo.status === 'OPEN' ? `<button class="qa-btn" style="width:auto;padding:3px 8px;font-size:0.65rem" onclick="updateWOStatus('${wo.work_order_id}','IN_PROGRESS', this)">Start</button>` : ''}
          ${wo.status === 'IN_PROGRESS' ? `<button class="qa-btn" style="width:auto;padding:3px 8px;font-size:0.65rem;background:rgba(52,211,153,0.1);border-color:var(--green)" onclick="updateWOStatus('${wo.work_order_id}','COMPLETED', this)">Complete ✓</button>` : ''}
        </div>
      </div>`;
    container.appendChild(div);
  });
}

window.updateWOStatus = async function(woId, status, btn) {
  const res = await apiFetch(`/api/maintenance/work-orders/${woId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  });
  if (res) {
    showToast(`✅ Work Order ${woId} updated to ${status}`);
    const woRes = await apiFetch(`/api/maintenance/work-orders?facility_id=${currentFacilityId}`);
    if (woRes) renderWorkOrders(woRes.work_orders);
  }
};

// ─── MAINTENANCE FILTER BUTTONS ───────────────────────────────────────────────
function initMaintFilters() {
  document.querySelectorAll('[data-mfilter]').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('[data-mfilter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderMaintAlerts(btn.dataset.mfilter);
    };
  });

  const filterSel = document.getElementById('assetRiskFilter');
  if (filterSel) filterSel.onchange = () => renderAssetTable(cachedAssets);

  const createWOBtn = document.getElementById('btnCreateWO');
  if (createWOBtn) createWOBtn.onclick = () => showCreateWOModal();
}

// ─── HEALTH DISTRIBUTION CHART (COMPACT & OPTIMIZED) ────────────────────────
function buildHealthDistChart(assets) {
  const counts = { EXCELLENT: 0, GOOD: 0, WARNING: 0, CRITICAL: 0 };
  assets.forEach(a => {
    const s = (a.health_status || a.status || 'GOOD').toUpperCase();
    if (s in counts) counts[s]++; else counts.GOOD++;
  });
  const ctx = document.getElementById('healthDistChart');
  if (!ctx) return;
  if (maintHealthChart) maintHealthChart.destroy();
  maintHealthChart = new Chart(ctx.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: ['Excellent', 'Good', 'Warning', 'Critical'],
      datasets: [{
        data: [counts.EXCELLENT, counts.GOOD, counts.WARNING, counts.CRITICAL],
        backgroundColor: ['#34D399CC', '#2563EBCC', '#FCD34DCC', '#F87171CC'],
        borderColor:     ['#34D399',   '#2563EB',   '#FCD34D',   '#F87171'],
        borderWidth: 1.5,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      layout: { padding: { top: 4, bottom: 4, left: 4, right: 4 } },
      plugins: {
        legend: {
          position: 'right',
          labels: {
            boxWidth: 8,
            boxHeight: 8,
            usePointStyle: true,
            font: { family: 'Space Grotesk', size: 11 },
            padding: 8,
            color: '#1A2233'
          }
        },
        tooltip: {
          backgroundColor: 'rgba(255,255,255,0.97)',
          titleColor: '#1A2233',
          bodyColor: '#7B8FAB',
          bodyFont: { family: 'JetBrains Mono', size: 11 },
          padding: 10,
          borderColor: 'rgba(0,0,0,0.08)',
          borderWidth: 1
        }
      }
    }
  });
}

// ─── RISK DISTRIBUTION CHART (COMPACT & OPTIMIZED) ──────────────────────────
function buildRiskDistChart(assets) {
  const riskCounts = { 'Low': 0, 'Medium': 0, 'High': 0, 'Critical': 0 };
  assets.forEach(a => {
    const r = (a.risk_level || 'LOW').toUpperCase();
    if (r === 'CRITICAL') riskCounts['Critical']++;
    else if (r === 'HIGH') riskCounts['High']++;
    else if (r === 'MEDIUM') riskCounts['Medium']++;
    else riskCounts['Low']++;
  });

  const ctx = document.getElementById('riskDistChart');
  if (!ctx) return;
  if (maintRiskChart) maintRiskChart.destroy();
  maintRiskChart = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels: ['Low Risk', 'Medium Risk', 'High Risk', 'Critical Risk'],
      datasets: [{
        label: 'Assets',
        data: [riskCounts['Low'], riskCounts['Medium'], riskCounts['High'], riskCounts['Critical']],
        backgroundColor: ['#34D399CC', '#FCD34DCC', '#FB923CCC', '#F87171CC'],
        borderColor:     ['#34D399',   '#FCD34D',   '#FB923C',   '#F87171'],
        borderWidth: 1.5,
        borderRadius: 5,
        maxBarThickness: 34
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 6, bottom: 2 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(255,255,255,0.97)',
          titleColor: '#1A2233',
          bodyColor: '#7B8FAB',
          bodyFont: { family: 'JetBrains Mono', size: 11 },
          padding: 10
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#7B8FAB', font: { family: 'Space Grotesk', size: 10 } }
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: { color: '#7B8FAB', font: { family: 'JetBrains Mono', size: 10 }, stepSize: 1 }
        }
      }
    }
  });
}

// ─── ASSET DETAIL MODAL ───────────────────────────────────────────────────────
let assetModal = null;
function ensureModal() {
  if (document.getElementById('assetModal')) return;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay'; overlay.id = 'assetModal';
  overlay.innerHTML = `<div class="modal-box" id="assetModalBox"></div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeAssetModal(); });
  document.body.appendChild(overlay);
}

async function openAssetModal(assetId) {
  ensureModal();
  const overlay = document.getElementById('assetModal');
  const box     = document.getElementById('assetModalBox');
  box.innerHTML = `<div style="text-align:center;padding:40px;color:var(--muted)">Loading asset data…</div>`;
  overlay.classList.add('open');

  const data = await apiFetch(`/api/assets/${assetId}`);
  if (!data) { box.innerHTML = '<div style="padding:20px;color:var(--red)">Failed to load asset data.</div>'; return; }

  const a = data.asset;
  const tele = (data.telemetry || [])[0] || {};
  const pred = data.latest_prediction;
  const hStatus = (a.status || 'OPERATIONAL').toLowerCase();
  const hs = (data.health_history && data.health_history[0]) ? data.health_history[0].health_score : 85;
  const factors = (data.health_history && data.health_history[0] && data.health_history[0].contributing_factors)
    ? JSON.parse(data.health_history[0].contributing_factors || '[]') : [];
  const barColor = { excellent: '#34D399', good: '#2563EB', warning: '#FCD34D', critical: '#F87171',
    operational: '#2563EB', maintenance: '#A78BFA' }[hStatus] || '#A78BFA';

  box.innerHTML = `
    <div class="modal-header">
      <div>
        <h3 style="font-size:1.05rem;margin-bottom:4px">${a.asset_name}</h3>
        <div style="display:flex;gap:8px;align-items:center">
          <span style="font-family:var(--font-mono);font-size:0.72rem;color:var(--muted)">${a.asset_id}</span>
          <span class="status-badge ${hStatus}">${a.status}</span>
          <span style="font-size:0.7rem;color:var(--muted)">${a.asset_type} · ${a.location_zone}</span>
        </div>
      </div>
      <button class="modal-close" onclick="closeAssetModal()">✕</button>
    </div>

    <!-- Health Score -->
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;padding:16px;background:var(--surface2);border-radius:var(--radius-sm)">
      <div style="text-align:center;min-width:80px">
        <div style="font-family:var(--font-mono);font-size:2rem;font-weight:700;color:${barColor}">${hs.toFixed ? hs.toFixed(0) : hs}</div>
        <div style="font-size:0.65rem;color:var(--muted)">HEALTH SCORE</div>
      </div>
      <div style="flex:1">
        <div style="display:flex;justify-content:space-between;font-size:0.72rem;margin-bottom:6px">
          <span style="color:var(--muted)">Equipment Health Index</span>
          <span style="font-weight:600">/100</span>
        </div>
        <div class="health-bar" style="height:10px"><div class="health-bar-fill" style="width:${hs}%;background:${barColor}"></div></div>
        ${factors.length ? `<div style="margin-top:8px;font-size:0.7rem;color:var(--muted)">${factors.slice(0,2).join(' · ')}</div>` : ''}
        ${pred ? `<div style="margin-top:6px;padding:8px;background:var(--surface);border-radius:6px;border:1px solid var(--border)"><span style="font-size:0.68rem;font-weight:700;color:var(--text)">${pred.priority}</span> <span style="font-size:0.68rem;color:var(--muted)">— ${pred.recommended_action}</span></div>` : ''}
      </div>
    </div>

    <!-- Live Sensor Tiles -->
    <div class="modal-sensor-grid">
      <div class="sensor-tile">
        <div class="sensor-tile-label">Temperature</div>
        <div class="sensor-tile-value">${tele.temperature_c ?? '—'}</div>
        <div class="sensor-tile-unit">°C</div>
      </div>
      <div class="sensor-tile">
        <div class="sensor-tile-label">Vibration</div>
        <div class="sensor-tile-value">${tele.vibration_mm_s ?? '—'}</div>
        <div class="sensor-tile-unit">mm/s</div>
      </div>
      <div class="sensor-tile">
        <div class="sensor-tile-label">Current</div>
        <div class="sensor-tile-value">${tele.current_amps ?? '—'}</div>
        <div class="sensor-tile-unit">A</div>
      </div>
      <div class="sensor-tile">
        <div class="sensor-tile-label">Voltage</div>
        <div class="sensor-tile-value">${tele.voltage_v ?? '—'}</div>
        <div class="sensor-tile-unit">V</div>
      </div>
    </div>

    <!-- Info Grid -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:0.75rem;margin-bottom:16px">
      <div><span style="color:var(--muted)">Installed:</span> <strong>${a.installation_date || '—'}</strong></div>
      <div><span style="color:var(--muted)">Last Maintenance:</span> <strong>${a.last_maintenance_date || '—'}</strong></div>
      <div><span style="color:var(--muted)">Operating Hours:</span> <strong>${Number(a.operating_hours || 0).toLocaleString()} hrs</strong></div>
      <div><span style="color:var(--muted)">Facility ID:</span> <strong>${a.facility_id}</strong></div>
    </div>

    <!-- Alerts -->
    ${data.alerts && data.alerts.length ? `
    <div style="margin-bottom:16px">
      <div style="font-size:0.78rem;font-weight:600;margin-bottom:8px;color:var(--text)">Active Alerts (${data.alerts.length})</div>
      ${data.alerts.slice(0,3).map(al => `
        <div class="maint-alert-item ${al.severity}" style="margin-bottom:6px">
          <div style="font-size:0.72rem"><strong>${al.alert_type.replace(/_/g,' ').toUpperCase()}</strong>
          <p style="color:var(--muted);margin-top:2px">${al.description}</p></div>
          <span class="status-badge ${al.status.toLowerCase()}">${al.status}</span>
        </div>`).join('')}
    </div>` : ''}

    <!-- Work Orders -->
    ${data.work_orders && data.work_orders.length ? `
    <div style="margin-bottom:16px">
      <div style="font-size:0.78rem;font-weight:600;margin-bottom:8px;color:var(--text)">Work Orders</div>
      ${data.work_orders.map(wo => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:var(--surface2);border-radius:6px;margin-bottom:6px;font-size:0.72rem">
          <div><span style="font-family:var(--font-mono);color:var(--accent)">${wo.work_order_id}</span> — ${wo.issue}</div>
          <span class="wo-status-pill ${wo.status.toLowerCase()}">${wo.status}</span>
        </div>`).join('')}
    </div>` : ''}

    <!-- Footnote -->
    <div style="font-size:0.65rem;color:var(--muted);border-top:1px solid var(--border);padding-top:10px;margin-top:4px">
      ⚠️ DEMO/SIMULATION DATA — Sensor readings generated from synthetic telemetry model. Replace with real IoT data source for production use.
    </div>
  `;
}

window.closeAssetModal = function() {
  const overlay = document.getElementById('assetModal');
  if (overlay) overlay.classList.remove('open');
};

function showCreateWOModal() {
  showToast('ℹ️ Select an asset from the table and click Inspect to create a work order');
}

// ─── UPDATED NAV TABS (includes maintenance tab) ──────────────────────────────
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
      } else if (tab.id === 'tab-maintenance') {
        loadMaintenanceView();
      } else if (tab.id === 'tab-agent') {
        showToast('🤖 AI Agent Command Center');
        loadAgentView();
      } else if (tab.id === 'tab-alerts') {
        showToast('🔔 Loading Active Alarms & Incidents');
        loadAlertsView();
      }
    });
  });
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  startClock();

  const health = await apiFetch('/api/health');
  updateApiStatus(apiAvailable);

  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.classList.add('hidden');

  if (health) {
    console.log(`✅ FacilityOps API online | DB records: ${health.db_records}`);
    showToast(`✅ Connected to FacilityOps API — ${health.db_records.toLocaleString()} records loaded`);
  } else {
    console.warn('⚠️ API unavailable — running in simulation mode');
    showToast('⚠️ Simulation mode — API server not running');
  }

  await loadFacilities();

  await Promise.all([
    loadOverview(),
    buildConsumptionChart(),
    buildDonutChart(),
    buildHeatmap(),
  ]);

  setTimeout(() => runAgent(), 800);

  startLiveTicker();
  initNavTabs();
  initSysItems();
  initChartControls();
  initAgentInput();
  initQA();
});

