// ================= KONFIGURASI =================
const MQTT_BROKER = '';
const MQTT_TOPIC  = '';
const GAS_URL     = 'https://script.google.com/macros/s/AKfycbypkwfXIc_fG5-UeGAskLtSnjV_M5EFYZLRNisUJ-YlqFqt-fYJCQSJMsEdi0oR0ypuMw/exec'; // Opsional: URL Web App Google Apps Script untuk histori awal
// ===============================================

let historyData = [];
let currentRange = 'all';

function degToCompass(num) {
  if (typeof num === 'string') return num;
  const val = Math.floor((num / 45) + 0.5);
  const arr = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return arr[(val % 8)];
}

// ================= INISIALISASI GRAFIK (CHART.JS) =================
function createLineChart(canvasId, title, unit, lineColor) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: `${title} (${unit})`,
        data: [],
        borderColor: lineColor,
        backgroundColor: lineColor + '22',
        borderWidth: 2.5,
        pointRadius: 2,
        fill: true,
        tension: 0.35
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: `${title} (${unit})`,
          color: '#95a5a6',
          font: { size: 14, weight: 'bold' }
        },
        legend: { display: false }
      },
      scales: {
        x: {
          title: { display: true, text: 'Waktu', color: '#7f8c8d' },
          ticks: { color: '#7f8c8d', maxTicksLimit: 6 },
          grid: { color: 'rgba(127, 140, 141, 0.1)' }
        },
        y: {
          title: { display: true, text: unit, color: '#7f8c8d' },
          ticks: { color: '#7f8c8d' },
          grid: { color: 'rgba(127, 140, 141, 0.1)' }
        }
      }
    }
  });
}

const charts = {
  temp:  createLineChart('chart-temp', 'Temperature', '°C', '#ff7675'),
  hum:   createLineChart('chart-hum', 'Humidity', '%', '#00d2ff'),
  press: createLineChart('chart-press', 'Pressure', 'hPa', '#a29bfe'),
  wind:  createLineChart('chart-wind', 'Wind Speed', 'm/s', '#55efc4'),
  rain:  createLineChart('chart-rain', 'Rainfall', 'mm', '#74b9ff')
};

// ================= EVALUASI LOGO & WARNA BERDASARKAN RANGE =================
const SVG_ICONS = {
  rainClear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`,
  rainLight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 16.2A4.5 4.5 0 0 0 17.5 8h-1.8A7 7 0 1 0 4 14.9"></path><path d="M12 14v5"></path></svg>`,
  rainHeavy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"></path><polyline points="13 11 9 17 15 17 11 23"></polyline></svg>`,
  tempCold:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line><line x1="19.07" y1="4.93" x2="4.93" y2="19.07"></line></svg>`,
  tempNorm:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"></path></svg>`,
  tempHot:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></svg>`
};

function updateSensorVisuals(data) {
  // 1. Temperature (°C)
  if (data.temperature !== undefined) {
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

  // 2. Humidity (%)
  if (data.humidity !== undefined) {
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

  // 3. Pressure (hPa)
  if (data.pressure !== undefined) {
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

  // 4. Wind Speed (m/s)
  if (data.wind_speed !== undefined) {
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

  // 5. Wind Direction (Rotasi jarum kompas)
  if (data.wind_dir_angle !== undefined) {
    const deg = Number(data.wind_dir_angle);
    const needle = document.getElementById('compass-needle');
    if (needle) needle.style.transform = `rotate(${deg}deg)`;
  }

  // 6. Rainfall (mm)
  if (data.rainfall !== undefined) {
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

// ================= UPDATE TAMPILAN & GRAFIK =================
function updateUI(data, timestamp = new Date()) {
  if (data.temperature !== undefined) document.getElementById('val-temp').innerText = Number(data.temperature).toFixed(1);
  if (data.humidity !== undefined)    document.getElementById('val-hum').innerText = Number(data.humidity).toFixed(1);
  if (data.pressure !== undefined)    document.getElementById('val-press').innerText = Number(data.pressure).toFixed(1);
  if (data.wind_speed !== undefined)  document.getElementById('val-windspd').innerText = Number(data.wind_speed).toFixed(1);
  if (data.rainfall !== undefined)    document.getElementById('val-rain').innerText = Number(data.rainfall).toFixed(1);

  if (data.wind_direction !== undefined) {
    document.getElementById('val-winddir').innerText = degToCompass(data.wind_direction);
  } else if (data.wind_dir !== undefined) {
    document.getElementById('val-winddir').innerText = degToCompass(data.wind_dir);
  }

  if (data.wind_dir_angle !== undefined) {
    document.getElementById('val-winddeg').innerText = `${data.wind_dir_angle}°`;
  }

  // Perbarui warna & ikon kartu berdasarkan rentang nilai
  updateSensorVisuals(data);

  historyData.push({ time: timestamp, ...data });
  if (historyData.length > 500) historyData.shift();

  document.getElementById('last-update').innerText = timestamp.toLocaleString('id-ID');
  renderCharts();
}

function renderCharts() {
  const now = Date.now();
  const rangeMs = {
    '1h':  60 * 60 * 1000,
    '12h': 12 * 60 * 60 * 1000,
    '1d':  24 * 60 * 60 * 1000,
    '1w':  7 * 24 * 60 * 60 * 1000
  };

  const filtered = currentRange === 'all' 
    ? historyData 
    : historyData.filter(item => (now - item.time.getTime()) <= rangeMs[currentRange]);

  const labels = filtered.map(item => {
    if (currentRange === '1w' || currentRange === '1d') {
      return item.time.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) + ' ' +
             item.time.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    }
    return item.time.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  });

  charts.temp.data.labels = labels;
  charts.temp.data.datasets[0].data = filtered.map(d => d.temperature);
  charts.temp.update('none');

  charts.hum.data.labels = labels;
  charts.hum.data.datasets[0].data = filtered.map(d => d.humidity);
  charts.hum.update('none');

  charts.press.data.labels = labels;
  charts.press.data.datasets[0].data = filtered.map(d => d.pressure);
  charts.press.update('none');

  charts.wind.data.labels = labels;
  charts.wind.data.datasets[0].data = filtered.map(d => d.wind_speed);
  charts.wind.update('none');

  charts.rain.data.labels = labels;
  charts.rain.data.datasets[0].data = filtered.map(d => d.rainfall);
  charts.rain.update('none');
}

// ================= KONEKSI MQTT REAL-TIME =================
const client = mqtt.connect(MQTT_BROKER);

client.on('connect', () => {
  document.getElementById('mqtt-dot').classList.add('connected');
  document.getElementById('mqtt-status').innerText = 'MQTT Live Terhubung';
  client.subscribe(MQTT_TOPIC);
});

client.on('offline', () => {
  document.getElementById('mqtt-dot').classList.remove('connected');
  document.getElementById('mqtt-status').innerText = 'MQTT Terputus (Menghubungkan ulang...)';
});

client.on('message', (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    updateUI(payload, new Date());
  } catch (err) {
    console.error('Format JSON tidak valid:', err);
  }
});

// ================= INTERAKSI UI (DAY/NIGHT SWITCH) =================
const themeCheckbox = document.getElementById('theme-checkbox');
const htmlElement = document.documentElement;

function applyTheme(theme) {
  const isDark = theme === 'dark';
  htmlElement.setAttribute('data-theme', theme);
  themeCheckbox.checked = isDark;
  localStorage.setItem('weather_dashboard_theme', theme);

  const tickColor = isDark ? '#95a5a6' : '#636e72';
  Object.values(charts).forEach(chart => {
    chart.options.scales.x.ticks.color = tickColor;
    chart.options.scales.y.ticks.color = tickColor;
    chart.options.plugins.title.color = tickColor;
    chart.update('none');
  });
}

const savedTheme = localStorage.getItem('weather_dashboard_theme') || 'dark';
applyTheme(savedTheme);

themeCheckbox.addEventListener('change', (e) => {
  applyTheme(e.target.checked ? 'dark' : 'light');
});

// ================= FILTER RENTANG WAKTU (SEGMENTED CONTROL) =================
document.querySelectorAll('input[name="time-range"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    currentRange = e.target.value;
    renderCharts();
  });
});

// ================= LOGIKA DROPDOWN & AKSI DATASHEET =================
const dropdown = document.querySelector('.action-dropdown');
const dropdownTrigger = document.querySelector('.dropdown-trigger');

dropdownTrigger.addEventListener('click', (e) => {
  e.stopPropagation();
  dropdown.classList.toggle('open');
});

document.addEventListener('click', (e) => {
  if (!dropdown.contains(e.target)) {
    dropdown.classList.remove('open');
  }
});

document.getElementById('btn-download-csv').addEventListener('click', () => {
  if (historyData.length === 0) {
    alert('Belum ada data telemetry yang terekam untuk diunduh.');
    return;
  }

  const headers = ['Waktu', 'Temperature (C)', 'Humidity (%)', 'Pressure (hPa)', 'Wind Speed (m/s)', 'Wind Direction', 'Wind Angle (deg)', 'Rainfall (mm)'];
  const rows = historyData.map(item => [
    `"${item.time.toLocaleString('id-ID')}"`,
    item.temperature ?? '',
    item.humidity ?? '',
    item.pressure ?? '',
    item.wind_speed ?? '',
    item.wind_direction ?? item.wind_dir ?? '',
    item.wind_dir_angle ?? '',
    item.rainfall ?? ''
  ].join(','));

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
  const encodedUri = encodeURI(csvContent);
  
  const link = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0, 10);
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `Datasheet_Cuaca_${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  dropdown.classList.remove('open');
});

document.getElementById('btn-clear-history').addEventListener('click', () => {
  historyData = [];
  renderCharts();
  dropdown.classList.remove('open');
});

// Opsional: Muat histori awal dari Google Sheets jika GAS_URL diisi
if (GAS_URL) {
  fetch(GAS_URL)
    .then(res => res.json())
    .then(data => {
      if (Array.isArray(data)) {
        data.forEach(row => historyData.push({ time: new Date(row.timestamp), ...row }));
        if (historyData.length > 0) updateUI(historyData[historyData.length - 1], historyData[historyData.length - 1].time);
      } else if (data.temperature !== undefined) {
        updateUI(data, new Date(data.timestamp || Date.now()));
      }
    })
    .catch(err => console.warn('Gagal mengambil histori Sheets:', err));
}
