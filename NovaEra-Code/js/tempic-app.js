const API_URL = '../php/tempic-api.php';
const SENSOR_TYPES = [
  { id: 'CAMERA', label: 'Sensor de Câmara Fria', icon: 'fa-solid fa-warehouse' },
  { id: 'FRIDGE', label: 'Sensor de Geladeira', icon: 'fa-solid fa-temperature-low' },
  { id: 'FREEZER', label: 'Sensor de Freezer', icon: 'fa-solid fa-snowflake' },
  { id: 'VEHICLE', label: 'Sensor de Veículo Refrigerado', icon: 'fa-solid fa-truck' },
  { id: 'ENVIRONMENT', label: 'Sensor de Ambiente', icon: 'fa-solid fa-cloud' },
  { id: 'OTHER', label: 'Outro Sensor', icon: 'fa-solid fa-microchip' },
];
const PROTECTED_SCREENS = ['home', 'add-sensor', 'configure', 'detail'];
// RNF02 do TCC: no máximo 5 segundos entre a coleta e a exibição no painel
const READING_INTERVAL_MS = 5000;

let csrfToken = '';
let currentUser = null;
let sensors = [];
let lights = [];
let activeSensorId = null;
let selectedType = 'FRIDGE';
let pendingTarget = 4;
let activeRange = '7d';
let activePanel = 'chart';
let demoTimer = null;
let lastHistory = [];
const knownStates = new Map();

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

async function api(action, { method = 'GET', data = null, params = {} } = {}) {
  const url = new URL(API_URL, window.location.href);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const headers = { Accept: 'application/json' };
  const options = { method, credentials: 'same-origin', headers };

  if (data) {
    headers['Content-Type'] = 'application/json';
    headers['X-CSRF-Token'] = csrfToken;
    options.body = JSON.stringify(data);
  }

  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && action !== 'login' && action !== 'register') {
      currentUser = null;
      sensors = [];
      setScreen('login');
    }
    throw new Error(payload.error || 'Não foi possível concluir a solicitação.');
  }
  return payload;
}

function setScreen(name, updateAddress = true) {
  if (PROTECTED_SCREENS.includes(name) && !currentUser) name = 'login';
  document.querySelectorAll('.tempic-screen').forEach(screen => {
    screen.classList.toggle('active', screen.id === `screen-${name}`);
  });
  if (updateAddress) {
    const url = new URL(window.location.href);
    if (name === 'splash') url.searchParams.delete('view');
    else url.searchParams.set('view', name);
    window.history.replaceState({}, '', url);
  }
}

function navigateToHome() {
  window.location.assign(`${window.location.pathname}?view=home`);
}

function formatTemperature(value) {
  return value === null || value === undefined ? '—' : `${Number(value).toFixed(1)} °C`;
}

function formatDate(value) {
  if (!value) return '—';
  // O SQLite grava CURRENT_TIMESTAMP em UTC sem indicar o fuso: tratamos como UTC
  const text = String(value);
  const isoUtc = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(text) ? `${text.replace(' ', 'T')}Z` : text.replace(' ', 'T');
  const date = new Date(isoUtc);
  return Number.isNaN(date.getTime()) ? escapeHtml(value) : date.toLocaleString('pt-BR');
}

function typeLabel(id) {
  return SENSOR_TYPES.find(type => type.id === id)?.label.replace('Sensor de ', '') || 'Outro';
}

function sensorById(id = activeSensorId) {
  return sensors.find(sensor => String(sensor.id) === String(id)) || null;
}

function getTemperatureState(sensor) {
  const current = Number(sensor.current_temperature);
  const minimum = Number(sensor.minimum_temperature);
  const maximum = Number(sensor.maximum_temperature);
  if (current < minimum || current > maximum) return 'alert';
  const margin = (maximum - minimum) * 0.1;
  return current < minimum + margin || current > maximum - margin ? 'attention' : 'normal';
}

function renderUser() {
  document.getElementById('userBadgeText').textContent = currentUser?.name || 'Visitante';
  document.querySelectorAll('[data-action="logout"]').forEach(button => {
    button.hidden = !currentUser;
  });
}

function renderSensorTypes() {
  const grid = document.getElementById('sensorTypeGrid');
  grid.innerHTML = SENSOR_TYPES.map(type => `
    <button class="type-option" type="button" data-type="${type.id}">
      <div class="type-icon"><i class="${type.icon}" aria-hidden="true"></i></div>
      <span>${type.label}</span>
      <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
    </button>
  `).join('');
}

function renderSensorList() {
  const list = document.getElementById('sensorList');
  const empty = document.getElementById('homeEmptyState');
  list.innerHTML = '';
  if (!sensors.length) {
    empty.hidden = false;
    list.hidden = true;
    return;
  }

  empty.hidden = true;
  list.hidden = false;
  list.innerHTML = sensors.map(sensor => {
    const online = sensor.status === 'online';
    const demo = sensor.source_mode === 'demo';
    const icon = SENSOR_TYPES.find(type => type.id === sensor.type)?.icon || 'fa-solid fa-microchip';
    return `
      <button class="sensor-card ${String(sensor.id) === String(activeSensorId) ? 'active' : ''}"
        type="button" data-sensor-id="${Number(sensor.id)}" aria-pressed="${String(sensor.id) === String(activeSensorId)}">
        <span class="sensor-kind-icon"><i class="${icon}" aria-hidden="true"></i></span>
        <span class="sensor-card-header">
          <span class="sensor-name">${escapeHtml(sensor.name)}</span>
          <span class="sensor-status ${demo ? 'demo' : (online ? '' : 'offline')}">${demo ? 'Simulado' : (online ? 'Online' : 'Offline')}</span>
        </span>
        <span class="sensor-card-type">${escapeHtml(typeLabel(sensor.type))} · ${escapeHtml(sensor.location)}</span>
        <span class="sensor-temp">${formatTemperature(sensor.current_temperature)}</span>
      </button>
    `;
  }).join('');
}

function updateSensorCard(sensor) {
  const card = document.querySelector(`[data-sensor-id="${Number(sensor.id)}"]`);
  if (!card) return;

  const demo = sensor.source_mode === 'demo';
  const online = sensor.status === 'online';
  const status = card.querySelector('.sensor-status');
  status.className = `sensor-status ${demo ? 'demo' : (online ? '' : 'offline')}`;
  status.textContent = demo ? 'Simulado' : (online ? 'Online' : 'Offline');
  card.querySelector('.sensor-temp').textContent = formatTemperature(sensor.current_temperature);
}

function formatLimit(value) {
  return `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} °C`;
}

// ---------- RF02: refrigeração e modo de controle ----------
function renderEquipment(sensor) {
  const on = Number(sensor.equipment_on) === 1;
  const auto = sensor.control_mode === 'auto';
  const state = document.getElementById('equipmentState');
  const toggle = document.getElementById('equipmentSwitch');

  state.textContent = on ? 'Ligada' : 'Desligada';
  state.className = `sensor-status ${on ? '' : 'offline'}`;
  toggle.setAttribute('aria-checked', String(on));
  document.querySelectorAll('[data-mode]').forEach(button => {
    button.setAttribute('aria-checked', String(button.dataset.mode === sensor.control_mode));
  });
  document.getElementById('equipmentHint').textContent = auto
    ? `Automático: liga perto do limite máximo (${formatLimit(sensor.maximum_temperature)}) e desliga ao chegar abaixo do alvo (${formatLimit(sensor.target_temperature)}).`
    : 'Manual: o equipamento só muda quando você aciona. Fique atento aos alertas.';
}

// ---------- RF03: iluminação do estacionamento ----------
function renderLights() {
  const list = document.getElementById('lightList');
  document.getElementById('lightsEmpty').hidden = lights.length > 0;

  // Guarda programações editadas e ainda não salvas para não perdê-las ao redesenhar
  const drafts = new Map();
  list.querySelectorAll('[data-light-schedule][data-dirty]').forEach(form => {
    drafts.set(form.dataset.lightSchedule, {
      enabled: form.elements.enabled.checked,
      on_time: form.elements.on_time.value,
      off_time: form.elements.off_time.value,
    });
  });
  const focusedName = list.contains(document.activeElement) ? document.activeElement.name : null;
  const focusedForm = document.activeElement?.closest?.('[data-light-schedule]')?.dataset.lightSchedule;

  list.innerHTML = lights.map(light => {
    const on = Number(light.is_on) === 1;
    const scheduled = Number(light.schedule_enabled) === 1;
    const id = Number(light.id);
    return `
      <article class="light-card ${on ? 'is-on' : ''}">
        <div class="light-head">
          <span class="light-icon"><i class="fa-${on ? 'solid' : 'regular'} fa-lightbulb" aria-hidden="true"></i></span>
          <div>
            <strong>${escapeHtml(light.name)}</strong>
            <span class="light-state">${on ? 'Acesa' : 'Apagada'}${scheduled ? ` · programada ${escapeHtml(light.on_time)}–${escapeHtml(light.off_time)}` : ''}</span>
          </div>
          <button class="tempic-switch compact" type="button" role="switch" aria-checked="${on}" data-light-toggle="${id}"
            aria-label="${on ? 'Apagar' : 'Acender'} ${escapeHtml(light.name)}">
            <span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>
          </button>
        </div>
        <form class="light-schedule" data-light-schedule="${id}">
          <label class="schedule-enable"><input type="checkbox" name="enabled" ${scheduled ? 'checked' : ''}> Programar</label>
          <label>Acender <input type="time" name="on_time" value="${escapeHtml(light.on_time)}" required></label>
          <label>Apagar <input type="time" name="off_time" value="${escapeHtml(light.off_time)}" required></label>
          <button type="submit" class="tempic-btn secondary">Salvar</button>
        </form>
      </article>
    `;
  }).join('');

  drafts.forEach((draft, id) => {
    const form = list.querySelector(`[data-light-schedule="${id}"]`);
    if (!form) return;
    form.elements.enabled.checked = draft.enabled;
    form.elements.on_time.value = draft.on_time;
    form.elements.off_time.value = draft.off_time;
    form.dataset.dirty = 'true';
  });
  if (focusedForm && focusedName) {
    list.querySelector(`[data-light-schedule="${focusedForm}"]`)?.elements[focusedName]?.focus();
  }
}

async function refreshLights() {
  try {
    lights = (await api('lights')).lights;
    renderLights();
  } catch (error) {
    showMessage('lightMessage', error.message);
  }
}

// ---------- RF04: notificações do navegador ----------
function updateNotifyButton() {
  const button = document.getElementById('notifyButton');
  if (!button) return;
  if (!('Notification' in window)) {
    button.hidden = true;
    return;
  }
  const granted = Notification.permission === 'granted';
  button.disabled = granted;
  button.innerHTML = granted
    ? '<i class="fa-solid fa-bell" aria-hidden="true"></i> Notificações ativas'
    : '<i class="fa-regular fa-bell" aria-hidden="true"></i> Ativar notificações';
}

function notifyIfNewAlert(sensor) {
  const previous = knownStates.get(String(sensor.id));
  const state = getTemperatureState(sensor);
  knownStates.set(String(sensor.id), state);
  if (state !== 'alert' || previous === 'alert' || previous === undefined) return;

  const body = `${sensor.name}: ${formatTemperature(sensor.current_temperature)} — fora da faixa de ${formatLimit(sensor.minimum_temperature)} a ${formatLimit(sensor.maximum_temperature)}.`;
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('TempIC · Alerta de temperatura', { body, icon: '../img/opt/logo_tempic.webp', tag: `sensor-${sensor.id}` });
  }
}

// ---------- RF05: relatório ----------
function exportCsv() {
  const sensor = sensorById();
  if (!sensor || !lastHistory.length) {
    showMessage('targetMessage', 'Não há leituras neste período para exportar.');
    return;
  }
  const rows = [['Data e hora', 'Temperatura (°C)', 'Status']]
    .concat(lastHistory.map(reading => [
      formatDate(reading.recorded_at),
      Number(reading.temperature).toFixed(1).replace('.', ','),
      reading.temperature_state,
    ]));
  const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  link.download = `tempic-${sensor.name.normalize('NFD').replace(/[^\w]+/g, '-').toLowerCase()}-${activeRange}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function renderEvents(events) {
  const list = document.getElementById('eventList');
  const origins = { manual: 'Manual', automatico: 'Automático', programado: 'Programado' };
  list.innerHTML = events.map(event => `
    <div class="alert-entry event-entry">
      <span><strong>${escapeHtml(origins[event.origin] || event.origin)}</strong> · ${String(event.action).startsWith('modo')
        ? `Controle alterado para ${escapeHtml(event.action)}`
        : `Refrigeração ${escapeHtml(event.action)}`}</span>
      <span>${formatDate(event.created_at)}</span>
    </div>
  `).join('');
  document.getElementById('eventsEmpty').hidden = events.length > 0;
}

function renderChart(readings, sensor = sensorById()) {
  const canvas = document.getElementById('sensorChart');
  const box = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(320, Math.floor(box.width));
  const height = 250;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const context = canvas.getContext('2d');
  context.scale(ratio, ratio);
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#f7fafd';
  context.fillRect(0, 0, width, height);

  const values = readings.map(reading => Number(reading.temperature));
  if (!values.length) return;
  const limitMin = Number(sensor?.minimum_temperature ?? 2);
  const limitMax = Number(sensor?.maximum_temperature ?? 8);
  const minimum = Math.min(...values, limitMin) - 0.5;
  const maximum = Math.max(...values, limitMax) + 0.5;
  const range = Math.max(1, maximum - minimum);
  const padding = { left: 42, right: 16, top: 16, bottom: 28 };
  const chartHeight = height - padding.top - padding.bottom;
  const chartWidth = width - padding.left - padding.right;

  context.font = '12px Roboto, sans-serif';
  context.textAlign = 'right';
  for (let index = 0; index < 4; index += 1) {
    const value = minimum + (range * index / 3);
    const y = height - padding.bottom - chartHeight * index / 3;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.strokeStyle = 'rgba(107, 124, 140, 0.2)';
    context.stroke();
    context.fillStyle = '#6b7c8c';
    context.fillText(`${value.toFixed(1)}°`, padding.left - 8, y + 4);
  }

  // Faixa segura do sensor (linhas tracejadas)
  context.save();
  context.setLineDash([6, 5]);
  context.lineWidth = 1.5;
  context.strokeStyle = 'rgba(220, 38, 38, 0.55)';
  context.textAlign = 'left';
  context.fillStyle = '#b91c1c';
  [limitMin, limitMax].forEach(limit => {
    const y = height - padding.bottom - ((limit - minimum) / range) * chartHeight;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillText(`limite ${limit.toFixed(1)}°`, padding.left + 6, y - 5);
  });
  context.restore();

  context.beginPath();
  values.forEach((value, index) => {
    const x = padding.left + chartWidth * index / Math.max(1, values.length - 1);
    const y = height - padding.bottom - ((value - minimum) / range) * chartHeight;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.strokeStyle = '#007bff';
  context.lineWidth = 2.5;
  context.stroke();
}

function renderHistory(readings) {
  const rows = document.getElementById('historyRows');
  const empty = document.getElementById('historyEmpty');
  rows.innerHTML = readings.map(reading => `
    <tr>
      <td>${formatDate(reading.recorded_at)}</td>
      <td>${formatTemperature(reading.temperature)}</td>
      <td>${escapeHtml(reading.temperature_state)}</td>
    </tr>
  `).join('');
  empty.hidden = readings.length > 0;
}

function renderAlerts(alerts) {
  const list = document.getElementById('alertList');
  const empty = document.getElementById('alertsEmpty');
  const sensorAlerts = alerts.filter(alert => String(alert.sensor_id) === String(activeSensorId));
  list.innerHTML = sensorAlerts.map(alert => `
    <div class="alert-entry ${alert.resolved_at ? 'resolved' : ''}">
      <span>${escapeHtml(alert.message)}</span>
      <span>${formatDate(alert.created_at)}${alert.resolved_at ? ' · Resolvido' : ''}</span>
    </div>
  `).join('');
  empty.hidden = sensorAlerts.length > 0;
}

async function renderDashboard() {
  const sensor = sensorById();
  if (!sensor) return;

  activeSensorId = sensor.id;
  const current = Number(sensor.current_temperature);
  const state = getTemperatureState(sensor);
  document.getElementById('detailTitle').textContent = sensor.name;
  const lastUpdate = sensor.updated_at ? formatDate(sensor.updated_at).split(' ').pop() : '';
  document.getElementById('detailSource').textContent = (sensor.source_mode === 'demo' ? 'Modo demonstração · sem hardware conectado' : 'Conectado')
    + (lastUpdate ? ` · última leitura ${lastUpdate}` : '');
  document.getElementById('detailCurrent').textContent = formatTemperature(current);
  document.getElementById('detailMin').textContent = `${sensor.minimum_temperature} °C`;
  document.getElementById('detailMax').textContent = `${sensor.maximum_temperature} °C`;
  document.getElementById('detailLocation').textContent = sensor.location;
  document.getElementById('detailType').textContent = typeLabel(sensor.type);
  document.getElementById('detailOnlineStatus').textContent = sensor.source_mode === 'demo'
    ? 'Modo demonstração'
    : (sensor.status === 'online' ? 'Online' : 'Offline');
  document.getElementById('detailTarget').textContent = formatTemperature(sensor.target_temperature);
  const detailState = document.getElementById('detailStatus');
  const stateLabel = sensor.status === 'offline' ? 'Offline' : ({ normal: 'Normal', attention: 'Atenção', alert: 'Alerta' }[state]);
  detailState.textContent = stateLabel;
  document.getElementById('detailMonitoredStatus').textContent = stateLabel;
  detailState.className = `sensor-status ${sensor.status === 'offline' || state === 'alert' ? 'offline' : ''}`;
  pendingTarget = Number(sensor.target_temperature);
  const slider = document.getElementById('targetSlider');
  slider.min = sensor.minimum_temperature;
  slider.max = sensor.maximum_temperature;
  document.getElementById('targetRangeLabel').textContent =
    `Faixa recomendada: ${formatLimit(sensor.minimum_temperature)} a ${formatLimit(sensor.maximum_temperature)}`;
  document.getElementById('targetValue').textContent = `${pendingTarget.toFixed(1)} °C`;
  slider.value = pendingTarget;
  renderEquipment(sensor);

  const alertBox = document.getElementById('alertBox');
  alertBox.className = `alert-box ${state === 'attention' ? 'attention' : ''}`;
  alertBox.textContent = sensor.status === 'offline'
    ? 'Sensor offline: nenhuma leitura recente.'
    : ({ normal: 'Temperatura normal.', attention: 'Temperatura próxima do limite recomendado.', alert: 'Temperatura fora do limite recomendado.' }[state]);
  alertBox.hidden = sensor.status === 'online' && state === 'normal';

  try {
    const [history, alertPayload, eventPayload] = await Promise.all([
      api('history', { params: { sensor_id: sensor.id, range: activeRange } }),
      api('alerts', { params: { sensor_id: sensor.id } }),
      api('events', { params: { sensor_id: sensor.id } }),
    ]);
    lastHistory = history.readings;
    renderHistory(history.readings);
    renderChart(history.readings, sensor);
    renderEvents(eventPayload.events);
    document.getElementById('summaryMin').textContent = formatTemperature(history.minimum);
    document.getElementById('summaryMax').textContent = formatTemperature(history.maximum);
    document.getElementById('summaryAverage').textContent = formatTemperature(history.average);
    renderAlerts(alertPayload.alerts);
  } catch (error) {
    showMessage('targetMessage', error.message);
  }
}

function showMessage(elementId, message, success = false) {
  const element = document.getElementById(elementId);
  element.textContent = message;
  element.classList.toggle('success', success);
  element.hidden = false;
}

function clearMessage(elementId) {
  const element = document.getElementById(elementId);
  element.textContent = '';
  element.classList.remove('success');
  element.hidden = true;
}

async function refreshSensors(preferredId = activeSensorId) {
  const result = await api('sensors');
  sensors = result.sensors;
  if (!sensors.some(sensor => String(sensor.id) === String(preferredId))) {
    preferredId = sensors[0]?.id ?? null;
  }
  activeSensorId = preferredId;
  renderSensorList();
  if (activeSensorId) await renderDashboard();
}

function selectDashboardPanel(name) {
  activePanel = name;
  document.querySelectorAll('.dashboard-tab').forEach(button => {
    const active = button.dataset.panel === name;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.dashboard-view').forEach(panel => {
    panel.hidden = panel.id !== `panel-${name}`;
  });
}

async function submitLogin(event) {
  event.preventDefault();
  clearMessage('loginMessage');
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  try {
    const result = await api('login', { method: 'POST', data });
    if (result.user) navigateToHome();
  } catch (error) {
    showMessage('loginMessage', error.message);
  }
}

async function submitRegister(event) {
  event.preventDefault();
  clearMessage('registerMessage');
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  try {
    const result = await api('register', { method: 'POST', data });
    if (result.user) navigateToHome();
  } catch (error) {
    showMessage('registerMessage', error.message);
  }
}

async function submitSensor(event) {
  event.preventDefault();
  clearMessage('sensorMessage');
  const form = event.currentTarget;
  const data = {
    name: document.getElementById('sensor-name').value.trim(),
    location: document.getElementById('sensor-local').value.trim(),
    wifi_ssid: document.getElementById('sensor-wifi').value.trim(),
    type: selectedType,
  };
  try {
    const result = await api('sensor', { method: 'POST', data });
    form.reset();
    activeSensorId = result.sensor.id;
    await refreshSensors(activeSensorId);
    setScreen('home');
  } catch (error) {
    showMessage('sensorMessage', error.message);
  }
}

async function saveTarget() {
  clearMessage('targetMessage');
  try {
    await api('target', {
      method: 'POST',
      data: { sensor_id: activeSensorId, target_temperature: pendingTarget },
    });
    await refreshSensors(activeSensorId);
    showMessage('targetMessage', 'Temperatura alvo atualizada.', true);
    document.getElementById('targetDialog').hidden = true;
  } catch (error) {
    showMessage('targetMessage', error.message);
  }
}

let pollInProgress = false;

async function pollDemoReading() {
  const activeScreen = document.querySelector('.tempic-screen.active')?.id;
  if (pollInProgress || !currentUser || !sensors.length || !['screen-home', 'screen-detail'].includes(activeScreen)) return;
  pollInProgress = true;
  const pollingUserId = currentUser.id;
  try {
    // Todos os sensores recebem leitura no mesmo ciclo (RNF02: até 5 s)
    for (const { id } of [...sensors]) {
      const result = await api('reading', { method: 'POST', data: { sensor_id: id } });
      if (!currentUser || currentUser.id !== pollingUserId || !result.sensor) return;
      sensors = sensors.map(sensor => String(sensor.id) === String(id) ? result.sensor : sensor);
      updateSensorCard(result.sensor);
      notifyIfNewAlert(result.sensor);
    }
    if (activeSensorId && document.getElementById('screen-detail').classList.contains('active')) {
      await renderDashboard();
    }
  } catch (error) {
    if (currentUser && currentUser.id === pollingUserId) console.error(error);
  } finally {
    pollInProgress = false;
  }
}

async function logout() {
  if (demoTimer) window.clearInterval(demoTimer);
  demoTimer = null;
  currentUser = null;
  try {
    await api('logout', { method: 'POST', data: {} });
    const anonymousSession = await api('bootstrap');
    csrfToken = anonymousSession.csrfToken;
  } catch (error) {
    console.error(error);
    csrfToken = '';
  }
  currentUser = null;
  sensors = [];
  activeSensorId = null;
  renderUser();
  renderSensorList();
  setScreen('splash');
}

function bindActions() {
  document.getElementById('loginForm').addEventListener('submit', submitLogin);
  document.getElementById('registerForm').addEventListener('submit', submitRegister);
  document.getElementById('sensorConfigForm').addEventListener('submit', submitSensor);

  document.getElementById('lightForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    clearMessage('lightMessage');
    try {
      await api('light', { method: 'POST', data: { name: form.elements.name.value.trim() } });
      form.reset();
      form.hidden = true;
      await refreshLights();
    } catch (error) {
      showMessage('lightMessage', error.message);
    }
  });

  document.getElementById('lightList').addEventListener('input', event => {
    const form = event.target.closest('[data-light-schedule]');
    if (form) form.dataset.dirty = 'true';
  });

  document.getElementById('lightList').addEventListener('submit', async event => {
    const form = event.target.closest('[data-light-schedule]');
    if (!form) return;
    event.preventDefault();
    clearMessage('lightMessage');
    // A versão salva passa a valer: o rascunho deixa de existir
    delete form.dataset.dirty;
    try {
      const result = await api('light-schedule', {
        method: 'POST',
        data: {
          light_id: Number(form.dataset.lightSchedule),
          enabled: form.elements.enabled.checked,
          on_time: form.elements.on_time.value,
          off_time: form.elements.off_time.value,
        },
      });
      await refreshLights();
      showMessage('lightMessage', result.message, true);
    } catch (error) {
      showMessage('lightMessage', error.message);
    }
  });

  document.addEventListener('click', async event => {
    const typeButton = event.target.closest('[data-type]');
    if (typeButton) {
      selectedType = typeButton.dataset.type;
      setScreen('configure');
      return;
    }

    const sensorCard = event.target.closest('[data-sensor-id]');
    if (sensorCard) {
      activeSensorId = Number(sensorCard.dataset.sensorId);
      await refreshSensors(activeSensorId);
      selectDashboardPanel('summary');
      setScreen('detail');
      return;
    }

    const panelButton = event.target.closest('[data-panel]');
    if (panelButton) {
      selectDashboardPanel(panelButton.dataset.panel);
      if (activeSensorId) await renderDashboard();
      return;
    }

    const rangeButton = event.target.closest('[data-range]');
    if (rangeButton) {
      activeRange = rangeButton.dataset.range;
      document.querySelectorAll('.filter-btn').forEach(button => button.classList.toggle('active', button.dataset.range === activeRange));
      await renderDashboard();
      return;
    }

    const lightToggle = event.target.closest('[data-light-toggle]');
    if (lightToggle) {
      const on = lightToggle.getAttribute('aria-checked') !== 'true';
      try {
        await api('light-toggle', { method: 'POST', data: { light_id: Number(lightToggle.dataset.lightToggle), on } });
        await refreshLights();
      } catch (error) {
        showMessage('lightMessage', error.message);
      }
      return;
    }

    const modeButton = event.target.closest('[data-mode]');
    if (modeButton && activeSensorId) {
      try {
        const result = await api('control-mode', { method: 'POST', data: { sensor_id: activeSensorId, mode: modeButton.dataset.mode } });
        await refreshSensors(activeSensorId);
        showMessage('equipmentMessage', result.message, true);
      } catch (error) {
        showMessage('equipmentMessage', error.message);
      }
      return;
    }

    const targetButton = event.target.closest('[data-target-action]');
    if (targetButton) {
      const delta = targetButton.dataset.targetAction === 'increase' ? 0.5 : -0.5;
      const sensor = sensorById();
      const lowest = Number(sensor?.minimum_temperature ?? 2);
      const highest = Number(sensor?.maximum_temperature ?? 8);
      pendingTarget = Math.max(lowest, Math.min(highest, pendingTarget + delta));
      document.getElementById('targetValue').textContent = `${pendingTarget.toFixed(1)} °C`;
      document.getElementById('targetSlider').value = pendingTarget;
      return;
    }

    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) return;
    if (actionButton.matches('a')) event.preventDefault();
    switch (actionButton.dataset.action) {
      case 'go-login': setScreen('login'); break;
      case 'go-register': setScreen('register'); break;
      case 'add-sensor': renderSensorTypes(); setScreen('add-sensor'); break;
      case 'back-home': document.getElementById('targetDialog').hidden = true; setScreen('home'); break;
      case 'open-alerts':
        if (sensors.length) {
          activeSensorId = activeSensorId || sensors[0].id;
          await renderDashboard();
          selectDashboardPanel('alerts');
          setScreen('detail');
        }
        break;
      case 'open-adjustment':
        if (sensorById()) document.getElementById('targetDialog').hidden = false;
        break;
      case 'close-adjustment': document.getElementById('targetDialog').hidden = true; break;
      case 'confirm-target': await saveTarget(); break;
      case 'logout': await logout(); break;
      case 'toggle-equipment': {
        const sensor = sensorById();
        if (!sensor) break;
        try {
          const result = await api('equipment', { method: 'POST', data: { sensor_id: sensor.id, on: Number(sensor.equipment_on) !== 1 } });
          await refreshSensors(sensor.id);
          showMessage('equipmentMessage', `${result.message} Controle passou para o modo manual.`, true);
        } catch (error) {
          showMessage('equipmentMessage', error.message);
        }
        break;
      }
      case 'add-light': {
        const form = document.getElementById('lightForm');
        form.hidden = false;
        form.elements.name.focus();
        break;
      }
      case 'cancel-light': {
        const form = document.getElementById('lightForm');
        form.reset();
        form.hidden = true;
        break;
      }
      case 'export-csv': exportCsv(); break;
      case 'enable-notifications':
        if ('Notification' in window) {
          const permission = await Notification.requestPermission();
          updateNotifyButton();
          showMessage('notifyMessage', permission === 'granted'
            ? 'Pronto! Você será avisado quando um sensor sair da faixa segura.'
            : 'As notificações foram bloqueadas no navegador. Os alertas continuam aparecendo nesta tela.', permission === 'granted');
        }
        break;
      case 'forgot-password': showMessage('loginMessage', 'A recuperação por e-mail ainda não está configurada.'); break;
    }
  });

  document.getElementById('targetSlider').addEventListener('input', event => {
    pendingTarget = Number(event.currentTarget.value);
    document.getElementById('targetValue').textContent = `${pendingTarget.toFixed(1)} °C`;
  });

  window.addEventListener('resize', () => {
    if (activePanel === 'chart' && document.getElementById('screen-detail').classList.contains('active')) {
      renderDashboard();
    }
  });
}

async function bootstrap() {
  bindActions();
  renderSensorTypes();
  try {
    const result = await api('bootstrap');
    csrfToken = result.csrfToken;
    currentUser = result.user;
    sensors = result.sensors;
    activeSensorId = sensors[0]?.id ?? null;
    renderUser();
    renderSensorList();
    if (currentUser) {
      sensors.forEach(sensor => knownStates.set(String(sensor.id), getTemperatureState(sensor)));
      updateNotifyButton();
      await Promise.all([renderDashboard(), refreshLights()]);
      setScreen('home');
      demoTimer = window.setInterval(pollDemoReading, READING_INTERVAL_MS);
      // A programação da iluminação é conferida a cada 30 segundos
      window.setInterval(() => { if (currentUser) refreshLights(); }, 30000);
    } else {
      const requestedView = new URLSearchParams(window.location.search).get('view');
      const unauthenticatedView = PROTECTED_SCREENS.includes(requestedView)
        ? 'login'
        : (['login', 'register'].includes(requestedView) ? requestedView : 'splash');
      setScreen(unauthenticatedView);
    }
  } catch (error) {
    showMessage('loginMessage', error.message);
    setScreen('login');
  }
}

bootstrap();
