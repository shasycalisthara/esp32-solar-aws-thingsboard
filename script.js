// ================= 1. KONTROL TEMA INDEPENDEN (DEFAULT: LIGHT) =================
(function initThemeToggle() {
  const themeCheckbox = document.getElementById('theme-checkbox');
  const htmlElement = document.documentElement;

  function applyTheme(theme) {
    const isDark = theme === 'dark';
    htmlElement.setAttribute('data-theme', theme);
    if (themeCheckbox) themeCheckbox.checked = isDark;
    localStorage.setItem('weather_dashboard_theme', theme);

    try {
      if (typeof charts !== 'undefined' && charts) {
        const tickColor = isDark ? '#95a5a6' : '#636e72';
        Object.values(charts).forEach(chart => {
          if (chart && chart.options) {
            chart.options.scales.x.ticks.color = tickColor;
            chart.options.scales.x.title.color = tickColor;
            chart.options.scales.y.ticks.color = tickColor;
            chart.options.scales.y.title.color = tickColor;
            chart.options.plugins.title.color = tickColor;
            chart.update('none');
          }
        });
      }
    } catch (e) {}
  }

  const currentTheme = htmlElement.getAttribute('data-theme') || 'light';
  applyTheme(currentTheme);

  if (themeCheckbox) {
    themeCheckbox.addEventListener('change', (e) => {
      applyTheme(e.target.checked ? 'dark' : 'light');
    });
  }
})();

// ================= 2. KONFIGURASI GOOGLE APPS SCRIPT =================
const GAS_URL = 'https://script.google.com/macros/s/AKfycbypkwfXIc_fG5-UeGAskLtSnjV_M5EFYZLRNisUJ-YlqFqt-fYJCQSJMsEdi0oR0ypuMw/exec';
const POLLING_INTERVAL_MS = 10000;
// ====================================================================

let historyData = [];
let currentRange = 'all';

function degToCompass(num) {
  const deg = Number(num);
  if (isNaN(deg)) return String(num || '--');
  const val = Math.floor(((deg % 360) / 45) + 0.5);
  const arr = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return arr[(val % 8)];
}

// Konversi huruf arah mata angin (N, NE, E, dst.) ke derajat agar jarum kompas tetap berputar
function compassToDeg(val) {
  if (val === undefined || val === null || val === '') return NaN;
  const num = Number(val);
  if (!isNaN(num)) return num;

  const dir = String(val).trim().toUpperCase();
  const map = {
    'N': 0,     'UTARA': 0,
    'NNE': 22.5,
    'NE': 45,   'TIMUR LAUT': 45,
    'ENE': 67.5,
    'E': 90,    'TIMUR': 90,
    'ESE': 112.5,
    'SE': 135,  'TENGGARA': 135,
    'SSE': 157.5,
    'S': 180,   'SELATAN': 180,
    'SSW': 202.5,
    'SW': 225,  'BARAT DAYA': 225,
    'WSW': 247.5,
    'W': 270,   'BARAT': 270,
    'WNW': 292.5,
    'NW': 315,  'BARAT LAUT': 315,
    'NNW': 337.5
  };
  return map[dir] !== undefined ? map[dir] : NaN;
}

function parseFlexibleTimestamp(raw) {
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw;
  if (typeof raw === 'number') return new Date(raw);

  const str = String(raw || '').trim();
  if (!str) return null;

  const direct = new Date(str);
  if (!isNaN(direct.getTime())) return direct;

  const match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[\s,T]+(\d{1,2})[:.](\d{1,2})(?:[:.](\d{1,2}))?)?/);
  if (match) {
    const day   = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const year  = parseInt(match[3], 10);
    const hour  = parseInt(match[4] || '0', 10);
    const min   = parseInt(match[5] || '0', 10);
    const sec   = parseInt(match[6] || '0', 10);
    const d = new Date(year, month, day, hour, min, sec);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

function formatDateShort(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

function formatTimeOnly(d) {
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${min}`;
}

function isSameCalendarDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
}

// ================= 3. INISIALISASI GRAFIK (CHART.JS) =================
let charts = {};

function createLineChart(canvasId, title, unit, lineColor) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === 'undefined') return null;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const tickColor = isDark ? '#95a5a6' : '#636e72';

  return new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: `${title} (${unit})`,
        data: [],
        borderColor: lineColor,
        backgroundColor: lineColor + '1A',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        fill: true,
        tension: 0.25
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        title: {
          display: true,
          text: `${title} (${unit})`,
          color: tickColor,
          font: { size: 14, weight: 'bold' }
        },
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: function(context) {
              const idx = context[0].dataIndex;
              const chartObj = context[0].chart;
              if (chartObj._fullTimestamps && chartObj._fullTimestamps[idx]) {
                return chartObj._fullTimestamps[idx];
              }
              return context[0].label;
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Waktu', color: tickColor },
          ticks: {
            color: tickColor,
            autoSkip: true,
            autoSkipPadding: 14,
            maxTicksLimit: 6,
            maxRotation: 45,
            minRotation: 45,
            callback: function(value) {
              const label = this.getLabelForValue(value);
              return label ? label : null;
            }
          },
          grid: { color: 'rgba(127, 140, 141, 0.1)' }
        },
        y: {
          title: { display: true, text: unit, color: tickColor },
          ticks: { color: tickColor },
          grid: { color: 'rgba(127, 140, 141, 0.1)' }
        }
      }
    }
  });
}

charts = {
  temp:  createLineChart('chart-temp', 'Temperature', '°C', '#ff7675'),
  hum:   createLineChart('chart-hum', 'Humidity', '%', '#00d2ff'),
  press: createLineChart('chart-press', 'Pressure', 'hPa', '#a29bfe'),
  wind:  createLineChart('chart-wind', 'Wind Speed', 'm/s', '#55efc4'),
  rain:  createLineChart('chart-rain', 'Rainfall', 'mm', '#74b9ff')
};

// ================= 4. EVALUASI LOGO & WARNA BERDASARKAN RANGE =================
const SVG_ICONS = {
  rainClear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`,
  rainLight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 16.2A4.5 4.5 0 0 0 17.5 8h-1.8A7 7 0 1 0 4 14.9"></path><path d="M12 14v5"></path></svg>`,
  rainHeavy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"></path><polyline points="13 11 9 17 15 17 11 23"></polyline></svg>`,
  tempCold:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line><line x1="19.07" y1="4.93" x2="4.93" y2="19.07"></line></svg>`,
  tempNorm:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"></path></svg>`,
  tempHot:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></svg>`
};

function updateSensorVisuals(data) {
  if (data.temperature !== undefined && data.temperature !== '') {
    const t = Number(data.temperature);
    const card = document.getElementById('card-temp');
    const icon = document.getElementById('icon-temp');
    const status = document.getElementById('status-temp');

    if (t < 24) {
      card.setAttribute('data-level', 'low');
      icon.innerHTML = SVG_ICONS.tempCold;
      status.innerText = 'Sejuk / Dingin';
    } else if (t <= 31) {
      card.setAttribute('data-level', 'normal');
      icon.innerHTML = SVG_ICONS.tempNorm;
      status.innerText = 'Suhu Optimal';
    } else if (t <= 34) {
      card.setAttribute('data-level', 'warning');
      icon.innerHTML = SVG_ICONS.tempHot;
      status.innerText = 'Hangat / Panas';
    } else {
      card.setAttribute('data-level', 'danger');
      icon.innerHTML = SVG_ICONS.tempHot;
      status.innerText = 'Panas Ekstrem';
    }
  }

  if (data.humidity !== undefined && data.humidity !== '') {
    const h = Number(data.humidity);
    const card = document.getElementById('card-hum');
    const status = document.getElementById('status-hum');

    if (h < 50) {
      card.setAttribute('data-level', 'warning');
      status.innerText = 'Udara Kering';
    } else if (h <= 80) {
      card.setAttribute('data-level', 'normal');
      status.innerText = 'Kelembapan Ideal';
    } else {
      card.setAttribute('data-level', 'low');
      status.innerText = 'Sangat Lembap';
    }
  }

  if (data.pressure !== undefined && data.pressure !== '') {
    const p = Number(data.pressure);
    const card = document.getElementById('card-press');
    const status = document.getElementById('status-press');

    if (p < 1008) {
      card.setAttribute('data-level', 'warning');
      status.innerText = 'Tekanan Rendah';
    } else if (p <= 1018) {
      card.setAttribute('data-level', 'normal');
      status.innerText = 'Tekanan Normal';
    } else {
      card.setAttribute('data-level', 'low');
      status.innerText = 'Tekanan Tinggi';
    }
  }

  if (data.wind_speed !== undefined && data.wind_speed !== '') {
    const w = Number(data.wind_speed);
    const card = document.getElementById('card-wind');
    const status = document.getElementById('status-wind');

    if (w < 2.0) {
      card.setAttribute('data-level', 'low');
      status.innerText = 'Angin Tenang';
    } else if (w <= 8.0) {
      card.setAttribute('data-level', 'normal');
      status.innerText = 'Angin Sepoi';
    } else if (w <= 12.0) {
      card.setAttribute('data-level', 'warning');
      status.innerText = 'Angin Kencang';
    } else {
      card.setAttribute('data-level', 'danger');
      status.innerText = 'Badai / Ekstrem';
    }
  }

  // Mendukung arah angin berupa huruf (N, NE, E, dst.) maupun angka derajat
  if (data.wind_dir_angle !== undefined && data.wind_dir_angle !== '') {
    const deg = compassToDeg(data.wind_dir_angle);
    const needle = document.getElementById('compass-needle');
    if (needle && !isNaN(deg)) {
      needle.style.transform = `rotate(${deg}deg)`;
    }
  }

  if (data.rainfall !== undefined && data.rainfall !== '') {
    const r = Number(data.rainfall);
    const card = document.getElementById('card-rain');
    const icon = document.getElementById('icon-rain');
    const status = document.getElementById('status-rain');

    if (r === 0) {
      card.setAttribute('data-level', 'normal');
      icon.innerHTML = SVG_ICONS.rainClear;
      status.innerText = 'Cerah / Tidak Hujan';
    } else if (r <= 1.5) {
      card.setAttribute('data-level', 'low');
      icon.innerHTML = SVG_ICONS.rainLight;
      status.innerText = 'Hujan Ringan';
    } else if (r <= 3.5) {
      card.setAttribute('data-level', 'warning');
      icon.innerHTML = SVG_ICONS.rainLight;
      status.innerText = 'Hujan Sedang';
    } else {
      card.setAttribute('data-level', 'danger');
      icon.innerHTML = SVG_ICONS.rainHeavy;
      status.innerText = 'Hujan Lebat';
    }
  }
}

// ================= 5. UPDATE TAMPILAN KARTU & GRAFIK =================
function renderCardsOnly(data, timestamp = new Date()) {
  if (data.temperature !== undefined && data.temperature !== '') document.getElementById('val-temp').innerText = Number(data.temperature).toFixed(1);
  if (data.humidity !== undefined && data.humidity !== '')       document.getElementById('val-hum').innerText = Number(data.humidity).toFixed(1);
  if (data.pressure !== undefined && data.pressure !== '')       document.getElementById('val-press').innerText = Number(data.pressure).toFixed(1);
  if (data.wind_speed !== undefined && data.wind_speed !== '')   document.getElementById('val-windspd').innerText = Number(data.wind_speed).toFixed(1);
  if (data.rainfall !== undefined && data.rainfall !== '')       document.getElementById('val-rain').innerText = Number(data.rainfall).toFixed(1);

  if (data.wind_dir_angle !== undefined && data.wind_dir_angle !== '') {
    const rawDir = String(data.wind_dir_angle).trim();
    const deg = compassToDeg(rawDir);

    if (!isNaN(Number(rawDir))) {
      document.getElementById('val-winddir').innerText = degToCompass(Number(rawDir));
      document.getElementById('val-winddeg').innerText = `${Number(rawDir).toFixed(0)}°`;
    } else {
      document.getElementById('val-winddir').innerText = rawDir.toUpperCase();
      document.getElementById('val-winddeg').innerText = !isNaN(deg) ? `${deg}°` : '--°';
    }
  }

  updateSensorVisuals(data);

  const deviceLabel = data.device ? ` (${data.device})` : '';
  document.getElementById('last-update').innerText = `${formatDateShort(timestamp)} ${formatTimeOnly(timestamp)}${deviceLabel}`;
}

function updateRangeDescription(filtered, latestDate) {
  const rangeTextEl = document.getElementById('active-range-text');
  if (!rangeTextEl) return;

  if (!filtered || filtered.length === 0) {
    rangeTextEl.innerText = 'Data rentang: Tidak ada data';
    return;
  }

  const labelMap = {
    'all': 'Semua Data',
    '1h':  '1 Jam',
    '12h': '12 Jam',
    '1d':  '1 Hari',
    '1w':  '1 Minggu'
  };

  const firstDate = filtered[0].time;
  const lastDate  = filtered[filtered.length - 1].time;
  const titleTag  = labelMap[currentRange] || 'Semua Data';

  if (isSameCalendarDay(firstDate, lastDate)) {
    rangeTextEl.innerText = `Data rentang (${titleTag}): ${formatDateShort(firstDate)} pukul ${formatTimeOnly(firstDate)} – ${formatTimeOnly(lastDate)} (${filtered.length} data)`;
  } else {
    rangeTextEl.innerText = `Data rentang (${titleTag}): ${formatDateShort(firstDate)} ${formatTimeOnly(firstDate)} – ${formatDateShort(lastDate)} ${formatTimeOnly(lastDate)} (${filtered.length} data)`;
  }
}

function renderCharts() {
  if (!historyData || historyData.length === 0) return;

  const latestDate = historyData[historyData.length - 1].time;
  const latestTime = latestDate.getTime();

  const rangeConfig = {
    'all': { ms: Infinity,               maxTicks: 6, xTitle: 'Tanggal & Jam' },
    '1h':  { ms: 60 * 60 * 1000,         maxTicks: 5, xTitle: 'Jam (1 Jam Terakhir)' },
    '12h': { ms: 12 * 60 * 60 * 1000,    maxTicks: 6, xTitle: 'Jam (12 Jam Terakhir)' },
    '1d':  { ms: 24 * 60 * 60 * 1000,    maxTicks: 6, xTitle: 'Jam (1 Hari Terakhir)' },
    '1w':  { ms: 7 * 24 * 60 * 60 * 1000, maxTicks: 8, xTitle: 'Tanggal (1 Minggu)' }
  };

  const cfg = rangeConfig[currentRange] || rangeConfig['all'];

  const filtered = currentRange === 'all'
    ? historyData
    : historyData.filter(item => (latestTime - item.time.getTime()) <= cfg.ms);

  updateRangeDescription(filtered, latestDate);

  const fullTimestamps = filtered.map(item => `${formatDateShort(item.time)} ${formatTimeOnly(item.time)}`);

  let lastShownDateStr = '';
  const labels = filtered.map(item => {
    const dateStr = formatDateShort(item.time);
    const timeStr = formatTimeOnly(item.time);

    if (currentRange === '1w') {
      if (dateStr !== lastShownDateStr) {
        lastShownDateStr = dateStr;
        return dateStr;
      }
      return '';
    }

    if (currentRange === '1h' || currentRange === '12h' || currentRange === '1d') {
      return timeStr;
    }

    if (dateStr !== lastShownDateStr) {
      lastShownDateStr = dateStr;
      return dateStr;
    }
    return timeStr;
  });

  const isTilted = (currentRange === 'all' || currentRange === '1w');

  const chartSeriesMap = [
    { chart: charts.temp,  values: filtered.map(d => Number(d.temperature)) },
    { chart: charts.hum,   values: filtered.map(d => Number(d.humidity)) },
    { chart: charts.press, values: filtered.map(d => Number(d.pressure)) },
    { chart: charts.wind,  values: filtered.map(d => Number(d.wind_speed)) },
    { chart: charts.rain,  values: filtered.map(d => Number(d.rainfall)) }
  ];

  chartSeriesMap.forEach(({ chart, values }) => {
    if (!chart) return;
    chart._fullTimestamps = fullTimestamps;
    chart.options.scales.x.ticks.autoSkip = (currentRange !== '1w');
    chart.options.scales.x.ticks.maxTicksLimit = cfg.maxTicks;
    chart.options.scales.x.ticks.minRotation = isTilted ? 45 : 0;
    chart.options.scales.x.ticks.maxRotation = isTilted ? 45 : 0;
    chart.options.scales.x.title.text = cfg.xTitle;
    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    chart.update('none');
  });
}

// ================= 6. FILTER WAKTU & DROPDOWN AKSI =================
document.querySelectorAll('input[name="time-range"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    currentRange = e.target.value;
    renderCharts();
  });
});

const dropdown = document.querySelector('.action-dropdown');
const dropdownTrigger = document.querySelector('.dropdown-trigger');

if (dropdown && dropdownTrigger) {
  dropdownTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target)) {
      dropdown.classList.remove('open');
    }
  });
}

const btnRefreshData = document.getElementById('btn-refresh-data');
if (btnRefreshData) {
  btnRefreshData.addEventListener('click', () => {
    fetchFromGoogleSheets();
    if (dropdown) dropdown.classList.remove('open');
  });
}

// ================= 7. SINKRONISASI DATA GOOGLE APPS SCRIPT =================
function getColumnValue(row, targetNames) {
  const keys = Object.keys(row);
  for (const target of targetNames) {
    if (row[target] !== undefined) return row[target];
    const foundKey = keys.find(k => k.trim().toLowerCase() === target.toLowerCase());
    if (foundKey !== undefined) return row[foundKey];
  }
  return undefined;
}

async function fetchFromGoogleSheets() {
  const syncDot = document.getElementById('sync-dot');
  const syncStatus = document.getElementById('sync-status');

  if (!GAS_URL || GAS_URL.includes('TEMPELKAN_URL')) {
    syncDot.classList.remove('connected');
    syncStatus.innerText = 'URL Google Apps Script belum diisi';
    return;
  }

  try {
    const response = await fetch(GAS_URL);
    const result = await response.json();
    const rows = Array.isArray(result) ? result : (result.data || result.records || [result]);

    syncDot.classList.add('connected');
    syncStatus.innerText = 'Terhubung ke Google Sheets (ThingsBoard Sync)';

    if (!rows || rows.length === 0) return;

    historyData = [];

    rows.forEach((row, idx) => {
      const rawTime = getColumnValue(row, ['TimeStamp', 'Timestamp', 'timestamp', 'Waktu']);
      const parsedTime = parseFlexibleTimestamp(rawTime) || new Date(Date.now() - (rows.length - idx) * 60000);

      historyData.push({
        time:           parsedTime,
        device:         getColumnValue(row, ['Device', 'device']),
        temperature:    getColumnValue(row, ['Temperature (°C)', 'Temperature', 'temperature', 'Suhu']),
        humidity:       getColumnValue(row, ['Humidity (%)', 'Humidity', 'humidity', 'Kelembaban']),
        rainfall:       getColumnValue(row, ['Curah Hujan (mm)', 'Rainfall', 'rainfall', 'Curah Hujan']),
        pressure:       getColumnValue(row, ['Tekanan (hPa)', 'Pressure', 'pressure', 'Tekanan']),
        wind_dir_angle: getColumnValue(row, ['Wind Direction (°)', 'Wind Direction', 'wind_direction', 'wind_dir', 'wind_dir_angle', 'Arah Angin']),
        wind_speed:     getColumnValue(row, ['Wind Speed (m/s)', 'Wind Speed', 'wind_speed'])
      });
    });

    historyData.sort((a, b) => a.time.getTime() - b.time.getTime());

    const latest = historyData[historyData.length - 1];
    if (latest) {
      renderCardsOnly(latest, latest.time);
      renderCharts();
    }
  } catch (err) {
    syncDot.classList.remove('connected');
    syncStatus.innerText = 'Gagal menarik data dari Google Sheets';
    console.error('Error fetch Google Sheets:', err);
  }
}

fetchFromGoogleSheets();
setInterval(fetchFromGoogleSheets, POLLING_INTERVAL_MS);
