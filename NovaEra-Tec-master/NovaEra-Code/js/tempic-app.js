// ==========================================
// TEMPIC - PAINEL WEB
// SPA sem framework: rotas por hash (#/, #/sensor/12, #/inventory,
// #/lights, #/activity, #/admin), estado único, leitura ao vivo a cada
// 5 s (RNF02) e atualização pontual do DOM para não perder foco nem hover.
// Toda a regra de negócio fica na API (php/tempic-api.php). As permissões
// vêm do servidor: aqui elas só decidem o que mostrar/bloquear — quem
// garante é a API, que responde 403 a qualquer ação fora do papel.
// ==========================================

(() => {
  'use strict';

  const API_URL = '../php/tempic-api.php';
  const TICK_MS = 5000;
  const SPARK_POINTS = 48;
  const RANGES = {
    '1h': { label: '1 h', points: 400 },
    '24h': { label: '24 h', points: 400 },
    '7d': { label: '7 dias', points: 500 },
    '30d': { label: '30 dias', points: 600 },
  };
  const TYPES = {
    CAMERA: { label: 'Câmara fria', icon: 'fa-warehouse', hint: '2 °C a 8 °C' },
    FRIDGE: { label: 'Geladeira', icon: 'fa-temperature-low', hint: '2 °C a 8 °C' },
    FREEZER: { label: 'Freezer', icon: 'fa-snowflake', hint: '−24 °C a −16 °C' },
    VEHICLE: { label: 'Veículo refrigerado', icon: 'fa-truck', hint: '0 °C a 8 °C' },
    ENVIRONMENT: { label: 'Ambiente', icon: 'fa-cloud-sun', hint: '18 °C a 26 °C' },
    OTHER: { label: 'Outro', icon: 'fa-microchip', hint: '2 °C a 8 °C' },
  };
  const STATE_LABEL = { normal: 'Normal', attention: 'Atenção', alert: 'Alerta', offline: 'Offline' };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const state = {
    csrf: '',
    user: null,
    access: null,
    preview: false,
    catalog: null,
    sensors: [],
    lights: [],
    items: [],
    inventory: null,
    spark: new Map(),
    known: new Map(),
    openAlerts: 0,
    lastTick: null,
    online: true,
    failures: 0,
    view: null,
  };

  // ==========================================
  // UTILITÁRIOS
  // ==========================================

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const num = (value, digits = 1) => Number(value).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const temp = (value, digits = 1) => (value === null || value === undefined || Number.isNaN(Number(value))) ? '—' : `${num(value, digits)} °C`;
  const limit = value => `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} °C`;

  // O SQLite grava CURRENT_TIMESTAMP em UTC, sem fuso
  function parseDb(value) {
    if (!value) return null;
    const text = String(value);
    const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(text) ? `${text.replace(' ', 'T')}Z` : text;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const timeOf = date => date ? date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
  const dateTimeOf = date => date ? date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

  function relative(date) {
    if (!date) return '—';
    const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
    if (seconds < 5) return 'agora';
    if (seconds < 60) return `há ${seconds} s`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `há ${minutes} min`;
    const hours = Math.round(minutes / 60);
    return hours < 24 ? `há ${hours} h` : dateTimeOf(date);
  }

  function dayLabel(date) {
    const today = new Date();
    const yesterday = new Date(Date.now() - 86400000);
    if (date.toDateString() === today.toDateString()) return 'Hoje';
    if (date.toDateString() === yesterday.toDateString()) return 'Ontem';
    return date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  }

  function sensorState(sensor, value = sensor.current_temperature) {
    if (sensor.status === 'offline') return 'offline';
    const current = Number(value);
    const min = Number(sensor.minimum_temperature);
    const max = Number(sensor.maximum_temperature);
    if (current < min || current > max) return 'alert';
    const margin = (max - min) * 0.1;
    return current < min + margin || current > max - margin ? 'attention' : 'normal';
  }

  const typeOf = sensor => TYPES[sensor.type] || TYPES.OTHER;
  const sensorById = id => state.sensors.find(sensor => String(sensor.id) === String(id)) || null;
  const isOn = value => Number(value) === 1;

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // ==========================================
  // ACESSO (papéis e permissões vindos da API)
  // ==========================================

  const LOCK_MESSAGE = 'Somente o administrador pode alterar isto.';

  // Na prévia, o administrador vê exatamente o que um membro vê
  function permissions() {
    if (!state.access) return [];
    return state.preview ? (state.access.rolePermissions?.member || []) : state.access.permissions;
  }

  const can = permission => permissions().includes(permission);
  const isAdminView = () => can('team.manage');

  // Controle visível, porém travado (o membro entende que existe e por que não pode usar)
  const lockAttr = permission => (can(permission) ? '' : ` disabled aria-disabled="true" data-locked title="${LOCK_MESSAGE}"`);
  const lockBadge = permission => (can(permission) ? '' : `<span class="tp-lock" title="${LOCK_MESSAGE}"><i class="fa-solid fa-lock" aria-hidden="true"></i> só admin</span>`);

  // Esconde o que exige permissão (atributo data-requires na casca e nas visões)
  function gate(root = document) {
    $$('[data-requires]', root).forEach(element => { element.hidden = !can(element.dataset.requires); });
  }

  function applyAccess(access) {
    state.access = access;
    if (!access) return;
    if (!access.rolePermissions?.member?.length || !access.permissions.includes('team.manage')) state.preview = false;
    $('#userRole').textContent = state.preview ? 'Membro (prévia)' : access.roleLabel;
    $('#userRole').dataset.role = state.preview ? 'member' : access.role;
    $('#workspaceBadge').innerHTML = `<i class="fa-solid fa-building" aria-hidden="true"></i><span>${esc(access.workspace.name)}</span>`;
    $('#previewBar').hidden = !state.preview;
    document.body.dataset.role = state.preview ? 'member' : access.role;
    gate();
  }

  // Papel mudou no servidor (promoção, remoção): recarrega o contexto e a tela atual
  async function refreshAccess(reason) {
    const result = await api('bootstrap');
    if (!result.user) { showAuth(); return; }
    const before = state.access;
    applyAccess(result);
    state.sensors = result.sensors || [];
    if (before && before.workspace.id !== result.workspace.id) {
      state.spark.clear();
      state.known.clear();
      await Promise.all([refreshLights().catch(() => {}), refreshItems().catch(() => {}), ...state.sensors.map(loadSpark)]);
      location.hash = '#/';
    }
    if (reason) toast(reason, { type: 'info', title: 'Seu acesso mudou', timeout: 7000 });
    route();
  }

  // ==========================================
  // API
  // ==========================================

  async function api(action, { method = 'GET', data = null, params = {} } = {}) {
    const url = new URL(API_URL, window.location.href);
    url.searchParams.set('action', action);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    const headers = { Accept: 'application/json' };
    const options = { method, credentials: 'same-origin', headers };
    if (method !== 'GET') {
      headers['Content-Type'] = 'application/json';
      headers['X-CSRF-Token'] = state.csrf;
      options.body = JSON.stringify(data || {});
    }

    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || 'Não foi possível concluir a solicitação.');
      error.status = response.status;
      error.code = payload.code || '';
      // 403: o papel pode ter mudado enquanto a tela estava aberta
      if (response.status === 403 && payload.code === 'forbidden' && state.user && !state.preview) {
        refreshAccess().catch(() => {});
      }
      if (response.status === 401 && !['login', 'register'].includes(action) && state.user) {
        state.user = null;
        stopLive();
        showAuth();
        toast('Sua sessão terminou. Entre novamente.', { type: 'warn' });
      }
      throw error;
    }
    if (payload.csrfToken) state.csrf = payload.csrfToken;
    return payload;
  }

  // ==========================================
  // AVISOS (toasts)
  // ==========================================

  function toast(message, { type = 'info', title = '', timeout = 4500 } = {}) {
    const icons = { info: 'fa-circle-info', success: 'fa-circle-check', warn: 'fa-triangle-exclamation', danger: 'fa-fire-flame-curved' };
    const element = document.createElement('div');
    element.className = `tp-toast tp-toast-${type}`;
    element.setAttribute('role', type === 'danger' ? 'alert' : 'status');
    element.innerHTML = `
      <i class="fa-solid ${icons[type] || icons.info}" aria-hidden="true"></i>
      <div>${title ? `<strong>${esc(title)}</strong>` : ''}<span>${esc(message)}</span></div>
      <button type="button" class="tp-toast-close" aria-label="Fechar aviso"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>`;
    const remove = () => {
      element.classList.add('is-leaving');
      setTimeout(() => element.remove(), reduceMotion ? 0 : 220);
    };
    element.querySelector('button').addEventListener('click', remove);
    $('#tpToasts').append(element);
    if (timeout) setTimeout(remove, timeout);
  }

  // ==========================================
  // TEMA
  // ==========================================

  function toggleTheme() {
    const light = document.documentElement.dataset.theme !== 'light';
    document.documentElement.dataset.theme = light ? 'light' : 'dark';
    try { localStorage.setItem('tempic-theme', light ? 'light' : 'dark'); } catch (error) { /* sem armazenamento */ }
    $('meta[name="theme-color"]').setAttribute('content', light ? '#f4f6fa' : '#070a0f');
    state.view?.redraw?.();
  }

  // ==========================================
  // COMPONENTES
  // ==========================================

  // Medidor em arco (240°): zonas de alerta/atenção/normal, ponteiro e alvo
  const GAUGE = { cx: 120, cy: 120, r: 92, start: 150, sweep: 240 };

  function gaugeDomain(sensor) {
    const min = Number(sensor.minimum_temperature);
    const max = Number(sensor.maximum_temperature);
    const pad = (max - min) * 0.5;
    return { lo: min - pad, hi: max + pad, min, max, margin: (max - min) * 0.1 };
  }

  function gaugeAngle(value, domain) {
    const t = clamp((value - domain.lo) / (domain.hi - domain.lo), 0, 1);
    return GAUGE.start + GAUGE.sweep * t;
  }

  function polar(angle, radius = GAUGE.r) {
    const rad = angle * Math.PI / 180;
    return [GAUGE.cx + radius * Math.cos(rad), GAUGE.cy + radius * Math.sin(rad)];
  }

  function arc(from, to, radius = GAUGE.r) {
    const [x1, y1] = polar(from, radius);
    const [x2, y2] = polar(to, radius);
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${to - from > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }

  function gaugeSvg(sensor, { size = 'lg' } = {}) {
    const d = gaugeDomain(sensor);
    const a = value => gaugeAngle(value, d);
    const ticks = [d.min, d.max].map(value => {
      const [x, y] = polar(a(value), GAUGE.r + 18);
      return `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" class="tp-gauge-tick">${esc(Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 1 }))}°</text>`;
    }).join('');
    return `
      <svg class="tp-gauge tp-gauge-${size}" viewBox="0 0 240 200" role="img" aria-label="Medidor de temperatura">
        <path d="${arc(GAUGE.start, GAUGE.start + GAUGE.sweep)}" class="tp-gauge-track"/>
        <path d="${arc(a(d.lo), a(d.min))}" class="tp-gauge-zone is-alert"/>
        <path d="${arc(a(d.min), a(d.min + d.margin))}" class="tp-gauge-zone is-attention"/>
        <path d="${arc(a(d.min + d.margin), a(d.max - d.margin))}" class="tp-gauge-zone is-normal"/>
        <path d="${arc(a(d.max - d.margin), a(d.max))}" class="tp-gauge-zone is-attention"/>
        <path d="${arc(a(d.max), a(d.hi))}" class="tp-gauge-zone is-alert"/>
        ${ticks}
        <g class="tp-gauge-target" data-gauge-target><line x1="${GAUGE.cx + GAUGE.r - 14}" y1="${GAUGE.cy}" x2="${GAUGE.cx + GAUGE.r + 8}" y2="${GAUGE.cy}"/></g>
        <g class="tp-gauge-needle" data-gauge-needle>
          <line x1="${GAUGE.cx}" y1="${GAUGE.cy}" x2="${GAUGE.cx + GAUGE.r - 22}" y2="${GAUGE.cy}"/>
          <circle cx="${GAUGE.cx + GAUGE.r}" cy="${GAUGE.cy}" r="7" class="tp-gauge-knob"/>
        </g>
        <circle cx="${GAUGE.cx}" cy="${GAUGE.cy}" r="5" class="tp-gauge-hub"/>
      </svg>`;
  }

  function updateGauge(root, sensor, value = sensor.current_temperature) {
    const svg = root?.querySelector('.tp-gauge');
    if (!svg) return;
    const d = gaugeDomain(sensor);
    svg.dataset.state = sensorState(sensor, value);
    svg.querySelector('[data-gauge-needle]').style.transform = `rotate(${gaugeAngle(Number(value), d)}deg)`;
    svg.querySelector('[data-gauge-target]').style.transform = `rotate(${gaugeAngle(Number(sensor.target_temperature), d)}deg)`;
  }

  // Minigráfico em SVG com a faixa segura ao fundo
  function sparkline(sensor, values) {
    const width = 220;
    const height = 54;
    const min = Number(sensor.minimum_temperature);
    const max = Number(sensor.maximum_temperature);
    if (values.length < 2) return `<svg class="tp-spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"></svg>`;
    const lo = Math.min(min, ...values) - 0.4;
    const hi = Math.max(max, ...values) + 0.4;
    const y = value => (height - 4) - ((value - lo) / (hi - lo)) * (height - 8);
    const x = index => (index / (values.length - 1)) * width;
    const line = values.map((value, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)} ${y(value).toFixed(1)}`).join(' ');
    return `
      <svg class="tp-spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
        <rect x="0" y="${y(max).toFixed(1)}" width="${width}" height="${(y(min) - y(max)).toFixed(1)}" class="tp-spark-band"/>
        <path d="${line} L${width} ${height} L0 ${height} Z" class="tp-spark-area"/>
        <path d="${line}" class="tp-spark-line"/>
        <circle cx="${x(values.length - 1).toFixed(1)}" cy="${y(values[values.length - 1]).toFixed(1)}" r="3" class="tp-spark-dot"/>
      </svg>`;
  }

  // Barra horizontal: onde a leitura atual está dentro da faixa segura
  function rangeBar(sensor) {
    const d = gaugeDomain(sensor);
    const pct = value => clamp(((value - d.lo) / (d.hi - d.lo)) * 100, 0, 100);
    return `
      <div class="tp-range" aria-hidden="true">
        <span class="tp-range-safe" style="left:${pct(d.min)}%;width:${pct(d.max) - pct(d.min)}%"></span>
        <span class="tp-range-marker" data-range-marker style="left:${pct(Number(sensor.current_temperature))}%"></span>
      </div>`;
  }

  function updateRangeBar(root, sensor) {
    const marker = root?.querySelector('[data-range-marker]');
    if (!marker) return;
    const d = gaugeDomain(sensor);
    marker.style.left = `${clamp(((Number(sensor.current_temperature) - d.lo) / (d.hi - d.lo)) * 100, 0, 100)}%`;
  }

  function stateChip(stateName) {
    return `<span class="tp-chip tp-chip-${stateName}" data-state-chip>${STATE_LABEL[stateName]}</span>`;
  }

  // Número que "rola" até o novo valor
  function animateNumber(element, to, { digits = 1, suffix = '' } = {}) {
    if (!element) return;
    const from = Number(element.dataset.value ?? to);
    element.dataset.value = to;
    if (reduceMotion || from === to) {
      element.textContent = `${num(to, digits)}${suffix}`;
      return;
    }
    const started = performance.now();
    const step = now => {
      const t = Math.min(1, (now - started) / 650);
      const eased = 1 - Math.pow(1 - t, 3);
      element.textContent = `${num(from + (to - from) * eased, digits)}${suffix}`;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    element.classList.remove('is-bump');
    void element.offsetWidth;
    element.classList.add('is-bump');
  }

  // ==========================================
  // GRÁFICO (canvas) com faixa segura, alvo e tooltip
  // ==========================================

  class TempChart {
    constructor(canvas, tooltip) {
      this.canvas = canvas;
      this.tooltip = tooltip;
      this.points = [];
      this.sensor = null;
      this.hover = null;
      this.progress = 1;
      this.resize = new ResizeObserver(() => this.draw());
      this.resize.observe(canvas.parentElement);
      canvas.addEventListener('pointermove', event => this.onMove(event));
      canvas.addEventListener('pointerleave', () => { this.hover = null; this.tooltip.hidden = true; this.draw(); });
    }

    destroy() { this.resize.disconnect(); }

    setData(readings, sensor, animate = true) {
      this.sensor = sensor;
      this.points = readings.map(reading => ({ t: parseDb(reading.recorded_at)?.getTime() ?? Date.now(), v: Number(reading.temperature), s: reading.temperature_state }));
      if (!animate || reduceMotion) {
        this.progress = 1;
        this.draw();
        return;
      }
      const started = performance.now();
      const step = now => {
        this.progress = Math.min(1, (now - started) / 800);
        this.draw();
        if (this.progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }

    append(reading, sensor, windowMs) {
      this.sensor = sensor;
      const t = parseDb(reading.recorded_at)?.getTime() ?? Date.now();
      if (this.points.length && this.points[this.points.length - 1].t >= t) return;
      this.points.push({ t, v: Number(reading.temperature), s: reading.temperature_state });
      const cutoff = t - windowMs;
      while (this.points.length > 2 && this.points[0].t < cutoff) this.points.shift();
      this.draw();
    }

    geometry() {
      const box = this.canvas.parentElement.getBoundingClientRect();
      const width = Math.max(280, Math.floor(box.width));
      const height = Math.max(220, Math.floor(box.height));
      const pad = { left: 46, right: 18, top: 18, bottom: 30 };
      const values = this.points.map(point => point.v);
      const min = Number(this.sensor.minimum_temperature);
      const max = Number(this.sensor.maximum_temperature);
      const lo = Math.min(min, ...values) - 0.8;
      const hi = Math.max(max, ...values) + 0.8;
      const t0 = this.points[0]?.t ?? Date.now() - 3600000;
      const t1 = Math.max(this.points[this.points.length - 1]?.t ?? Date.now(), t0 + 1000);
      const x = t => pad.left + ((t - t0) / (t1 - t0)) * (width - pad.left - pad.right);
      const y = v => pad.top + (1 - (v - lo) / (hi - lo)) * (height - pad.top - pad.bottom);
      return { width, height, pad, lo, hi, t0, t1, x, y, min, max };
    }

    draw() {
      if (!this.sensor) return;
      const ratio = window.devicePixelRatio || 1;
      const g = this.geometry();
      const { width, height, pad, x, y } = g;
      this.canvas.width = width * ratio;
      this.canvas.height = height * ratio;
      this.canvas.style.height = `${height}px`;
      const ctx = this.canvas.getContext('2d');
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const colors = {
        grid: cssVar('--tp-chart-grid'), text: cssVar('--tp-muted'), line: cssVar('--tp-accent'),
        safe: cssVar('--tp-ok-soft'), limit: cssVar('--tp-danger'), target: cssVar('--tp-accent-2'),
      };
      ctx.font = '11px "JetBrains Mono", ui-monospace, monospace';

      // Grade e eixo Y
      ctx.textAlign = 'right';
      for (let i = 0; i <= 4; i += 1) {
        const value = g.lo + ((g.hi - g.lo) * i) / 4;
        const py = y(value);
        ctx.strokeStyle = colors.grid;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(pad.left, py); ctx.lineTo(width - pad.right, py); ctx.stroke();
        ctx.fillStyle = colors.text;
        ctx.fillText(`${num(value, 1)}°`, pad.left - 8, py + 4);
      }

      // Faixa segura e limites
      ctx.fillStyle = colors.safe;
      ctx.fillRect(pad.left, y(g.max), width - pad.left - pad.right, y(g.min) - y(g.max));
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = colors.limit;
      ctx.globalAlpha = 0.7;
      [g.min, g.max].forEach(value => { ctx.beginPath(); ctx.moveTo(pad.left, y(value)); ctx.lineTo(width - pad.right, y(value)); ctx.stroke(); });
      ctx.setLineDash([2, 4]);
      ctx.strokeStyle = colors.target;
      const target = Number(this.sensor.target_temperature);
      ctx.beginPath(); ctx.moveTo(pad.left, y(target)); ctx.lineTo(width - pad.right, y(target)); ctx.stroke();
      ctx.restore();
      ctx.textAlign = 'left';
      ctx.fillStyle = colors.target;
      ctx.fillText('alvo', width - pad.right - 30, y(target) - 6);

      // Eixo X
      const span = g.t1 - g.t0;
      const label = t => {
        const date = new Date(t);
        return span > 36 * 3600000
          ? date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
          : date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      };
      ctx.fillStyle = colors.text;
      ctx.textAlign = 'center';
      const ticks = width < 520 ? 3 : 5;
      for (let i = 0; i <= ticks; i += 1) {
        const t = g.t0 + (span * i) / ticks;
        ctx.fillText(label(t), clamp(x(t), pad.left + 18, width - pad.right - 18), height - 8);
      }

      if (this.points.length < 2) {
        ctx.fillStyle = colors.text;
        ctx.fillText('Aguardando leituras…', width / 2, height / 2);
        return;
      }

      // Linha e área, revelados da esquerda para a direita na animação
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, pad.left + (width - pad.left - pad.right) * this.progress, height);
      ctx.clip();

      const path = new Path2D();
      this.points.forEach((point, index) => (index ? path.lineTo(x(point.t), y(point.v)) : path.moveTo(x(point.t), y(point.v))));
      const area = new Path2D(path);
      area.lineTo(x(this.points[this.points.length - 1].t), height - pad.bottom);
      area.lineTo(x(this.points[0].t), height - pad.bottom);
      area.closePath();
      const gradient = ctx.createLinearGradient(0, pad.top, 0, height - pad.bottom);
      gradient.addColorStop(0, cssVar('--tp-accent-glow'));
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.fill(area);
      ctx.strokeStyle = colors.line;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.stroke(path);

      // Pontos fora da faixa
      ctx.fillStyle = colors.limit;
      this.points.forEach(point => {
        if (point.s !== 'alert') return;
        ctx.beginPath(); ctx.arc(x(point.t), y(point.v), 2.6, 0, Math.PI * 2); ctx.fill();
      });
      ctx.restore();

      // Último ponto
      const last = this.points[this.points.length - 1];
      if (this.progress === 1) {
        ctx.fillStyle = colors.line;
        ctx.beginPath(); ctx.arc(x(last.t), y(last.v), 4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = cssVar('--tp-accent-glow');
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(x(last.t), y(last.v), 7, 0, Math.PI * 2); ctx.stroke();
      }

      // Cursor
      if (this.hover) {
        const point = this.hover;
        ctx.strokeStyle = colors.text;
        ctx.globalAlpha = 0.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(x(point.t), pad.top); ctx.lineTo(x(point.t), height - pad.bottom); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.fillStyle = cssVar('--tp-surface');
        ctx.strokeStyle = colors.line;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x(point.t), y(point.v), 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }

    onMove(event) {
      if (this.points.length < 2) return;
      const rect = this.canvas.getBoundingClientRect();
      const g = this.geometry();
      const px = event.clientX - rect.left;
      const t = g.t0 + ((px - g.pad.left) / (g.width - g.pad.left - g.pad.right)) * (g.t1 - g.t0);
      let nearest = this.points[0];
      for (const point of this.points) if (Math.abs(point.t - t) < Math.abs(nearest.t - t)) nearest = point;
      this.hover = nearest;
      this.draw();
      this.tooltip.hidden = false;
      this.tooltip.innerHTML = `<strong>${temp(nearest.v)}</strong><span>${dateTimeOf(new Date(nearest.t))}</span><em class="is-${nearest.s}">${STATE_LABEL[nearest.s]}</em>`;
      const left = clamp(g.x(nearest.t), 70, g.width - 70);
      this.tooltip.style.transform = `translate(${left}px, ${Math.max(0, g.y(nearest.v) - 64)}px) translateX(-50%)`;
    }
  }

  // ==========================================
  // MODAL E CONFIRMAÇÃO
  // ==========================================

  let modalReturnFocus = null;

  function openModal(html, { onMount, label = 'Janela', wide = false } = {}) {
    const layer = $('#tpModal');
    modalReturnFocus = document.activeElement;
    layer.innerHTML = `<div class="tp-modal-backdrop" data-close-modal></div>
      <div class="tp-modal ${wide ? 'tp-modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(label)}">
        <button type="button" class="tp-icon-btn tp-modal-close" data-close-modal aria-label="Fechar"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
        ${html}
      </div>`;
    layer.hidden = false;
    document.body.classList.add('tp-locked');
    onMount?.(layer.querySelector('.tp-modal'));
    (layer.querySelector('[autofocus]') || layer.querySelector('button, input, a'))?.focus();
  }

  function closeModal() {
    const layer = $('#tpModal');
    if (layer.hidden) return;
    layer.hidden = true;
    layer.innerHTML = '';
    document.body.classList.remove('tp-locked');
    modalReturnFocus?.focus?.();
  }

  function confirmDialog({ title, body, confirmLabel = 'Confirmar', danger = false }) {
    return new Promise(resolve => {
      let answered = false;
      const done = value => { if (!answered) { answered = true; resolve(value); } };
      openModal(`
        <h2 class="tp-modal-title">${esc(title)}</h2>
        <p class="tp-modal-text">${esc(body)}</p>
        <div class="tp-modal-actions">
          <button type="button" class="tp-btn tp-btn-ghost" data-answer="no">Cancelar</button>
          <button type="button" class="tp-btn ${danger ? 'tp-btn-danger' : 'tp-btn-primary'}" data-answer="yes" autofocus>${esc(confirmLabel)}</button>
        </div>`, {
        label: title,
        onMount: modal => {
          modal.addEventListener('click', event => {
            const answer = event.target.closest('[data-answer]')?.dataset.answer;
            if (!answer) return;
            done(answer === 'yes');
            closeModal();
          });
          const observer = new MutationObserver(() => { if ($('#tpModal').hidden) { done(false); observer.disconnect(); } });
          observer.observe($('#tpModal'), { attributes: true, attributeFilter: ['hidden'] });
        },
      });
    });
  }

  // ==========================================
  // NOVO SENSOR (2 passos + pareamento simulado)
  // ==========================================

  function openAddSensor() {
    const types = Object.entries(TYPES).map(([id, type]) => `
      <button type="button" class="tp-type" data-pick-type="${id}">
        <span class="tp-type-icon"><i class="fa-solid ${type.icon}" aria-hidden="true"></i></span>
        <strong>${type.label}</strong><small>${type.hint}</small>
      </button>`).join('');

    openModal(`
      <div class="tp-steps" aria-hidden="true"><span class="is-active"></span><span></span><span></span></div>
      <div data-step="1">
        <h2 class="tp-modal-title">Que tipo de sensor?</h2>
        <p class="tp-modal-text">A faixa segura e a temperatura alvo vêm prontas para cada tipo — dá para ajustar depois.</p>
        <div class="tp-type-grid">${types}</div>
      </div>
      <form data-step="2" hidden novalidate>
        <h2 class="tp-modal-title">Onde ele fica?</h2>
        <p class="tp-modal-text" data-type-summary></p>
        <div class="tp-field"><label for="ns-name">Nome do sensor</label><input id="ns-name" name="name" minlength="2" maxlength="100" placeholder="Ex.: Câmara fria de laticínios" required autocomplete="off"></div>
        <div class="tp-field"><label for="ns-location">Local</label><input id="ns-location" name="location" minlength="2" maxlength="120" placeholder="Ex.: Depósito · fundos" required autocomplete="off"></div>
        <div class="tp-field-row">
          <div class="tp-field"><label for="ns-wifi">Rede Wi-Fi do ESP32</label><input id="ns-wifi" name="wifi_ssid" maxlength="120" placeholder="Loja-IoT" required autocomplete="off"></div>
          <div class="tp-field"><label for="ns-pass">Senha da rede</label><input id="ns-pass" type="password" autocomplete="off" placeholder="não é enviada"></div>
        </div>
        <label class="tp-check"><input type="checkbox" name="seed_history" checked> Gerar 24 h de histórico simulado</label>
        <p class="tp-form-error" data-error role="alert" hidden></p>
        <div class="tp-modal-actions">
          <button type="button" class="tp-btn tp-btn-ghost" data-back>Voltar</button>
          <button type="submit" class="tp-btn tp-btn-primary">Conectar sensor</button>
        </div>
        <p class="tp-fine"><i class="fa-solid fa-lock" aria-hidden="true"></i> Modo demonstração: a senha do Wi-Fi não sai do seu navegador.</p>
      </form>
      <div data-step="3" hidden>
        <h2 class="tp-modal-title">Pareando o sensor…</h2>
        <ol class="tp-pairing" data-pairing>
          <li>Procurando ESP32 na rede</li>
          <li>Enviando credenciais do Wi-Fi</li>
          <li>Recebendo a primeira leitura</li>
        </ol>
        <p class="tp-fine">Etapas simuladas — nenhum hardware está conectado nesta demonstração.</p>
      </div>`, {
      label: 'Adicionar sensor',
      wide: true,
      onMount: modal => {
        let picked = 'FRIDGE';
        const steps = $$('.tp-steps span', modal);
        const show = number => {
          $$('[data-step]', modal).forEach(step => { step.hidden = step.dataset.step !== String(number); });
          steps.forEach((dot, index) => dot.classList.toggle('is-active', index < number));
        };
        modal.addEventListener('click', event => {
          const typeButton = event.target.closest('[data-pick-type]');
          if (typeButton) {
            picked = typeButton.dataset.pickType;
            $('[data-type-summary]', modal).textContent = `${TYPES[picked].label} · faixa segura de ${TYPES[picked].hint}.`;
            show(2);
            $('#ns-name', modal).focus();
          }
          if (event.target.closest('[data-back]')) show(1);
        });
        $('form', modal).addEventListener('submit', async event => {
          event.preventDefault();
          const form = event.currentTarget;
          const error = $('[data-error]', modal);
          error.hidden = true;
          if (!form.checkValidity()) {
            form.reportValidity();
            return;
          }
          show(3);
          const items = $$('[data-pairing] li', modal);
          const wait = ms => new Promise(resolve => setTimeout(resolve, reduceMotion ? 0 : ms));
          try {
            items[0].classList.add('is-running');
            const request = api('sensor', {
              method: 'POST',
              data: {
                type: picked,
                name: form.elements.name.value.trim(),
                location: form.elements.location.value.trim(),
                wifi_ssid: form.elements.wifi_ssid.value.trim(),
                seed_history: form.elements.seed_history.checked,
              },
            });
            await wait(650); items[0].classList.replace('is-running', 'is-done'); items[1].classList.add('is-running');
            const result = await request;
            await wait(650); items[1].classList.replace('is-running', 'is-done'); items[2].classList.add('is-running');
            await refreshSensors();
            await loadSpark(result.sensor);
            await wait(500); items[2].classList.replace('is-running', 'is-done');
            await wait(300);
            closeModal();
            toast(`${result.sensor.name} está online.`, { type: 'success', title: 'Sensor conectado' });
            location.hash = `#/sensor/${result.sensor.id}`;
          } catch (requestError) {
            show(2);
            error.textContent = requestError.message;
            error.hidden = false;
          }
        });
      },
    });
  }

  // ==========================================
  // INVENTÁRIO: componentes
  // O catálogo (categorias, validade, compatibilidade) vem da API.
  // ==========================================

  const UNIT_ALIASES = {
    kg: 'kg', quilo: 'kg', quilos: 'kg', kilo: 'kg', kilos: 'kg', g: 'g', gramas: 'g',
    l: 'L', litro: 'L', litros: 'L', ml: 'mL', un: 'un', und: 'un', unidade: 'un', unidades: 'un',
    cx: 'cx', caixa: 'cx', caixas: 'cx', pct: 'pct', pacote: 'pct', pacotes: 'pct',
  };
  const REASON_LABEL = { consumido: 'Consumido', descartado: 'Descartado', transferido: 'Transferido' };
  const INTEGRITY = {
    intact: { label: 'Íntegro', cls: 'normal', icon: 'fa-shield-heart' },
    exposed: { label: 'Exposto', cls: 'attention', icon: 'fa-temperature-arrow-up' },
    compromised: { label: 'Comprometido', cls: 'alert', icon: 'fa-biohazard' },
  };

  const fold = text => String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const categoryOf = id => state.catalog?.categories?.[id] || { label: 'Outros', icon: 'fa-box', allowed: {}, shelf_life: {} };
  const itemsOf = sensorId => state.items.filter(item => String(item.sensor_id) === String(sensorId));
  const qty = (value, unit) => `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${unit}`;
  const isoDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const shortDate = iso => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—');

  // Mesma divisão do servidor (InventoryCatalog::storageClass)
  function storageClass(sensor) {
    const max = Number(sensor.maximum_temperature);
    return max <= -10 ? 'frozen' : max <= 10 ? 'chilled' : 'ambient';
  }

  const STORAGE_LABEL = { frozen: 'congelado', chilled: 'refrigerado', ambient: 'em temperatura ambiente' };

  function suggestExpiry(category, sensor) {
    const days = categoryOf(category).shelf_life?.[storageClass(sensor)];
    if (days === null || days === undefined) return { iso: '', days: null };
    const date = new Date();
    date.setDate(date.getDate() + days);
    return { iso: isoDate(date), days };
  }

  const compatible = (category, sensor) => categoryOf(category).allowed?.[storageClass(sensor)] !== false;

  // Palavra-chave mais longa vence ("pao de queijo" → congelados, não laticínios)
  function detectCategory(text) {
    const words = ` ${fold(text).replace(/[^a-z0-9 ]+/g, ' ')} `;
    let best = null;
    Object.entries(state.catalog?.categories || {}).forEach(([id, category]) => {
      category.keywords.forEach(keyword => {
        if (words.includes(` ${keyword} `) || words.includes(` ${keyword}s `)) {
          if (!best || keyword.length > best.length) best = { id, length: keyword.length };
        }
      });
    });
    return best?.id || null;
  }

  /**
   * Entende frases como "2 kg de frango no freezer prateleira 2 vence em 10 dias".
   * Devolve só o que reconheceu; o resto vira o nome do item.
   */
  function parseItemText(text) {
    let rest = ` ${text.trim()} `;
    const result = { name: '', quantity: null, unit: null, shelf: null, sensorId: null, days: null, category: null };

    const expiry = rest.match(/\s(?:vence|validade)\s+(?:em\s+)?(\d{1,4})\s*d(?:ias?)?\b/i);
    if (expiry) { result.days = Number(expiry[1]); rest = rest.replace(expiry[0], ' '); }

    const shelf = rest.match(/\s(?:prateleira|prat\.?|p)\s*(\d)\b/i);
    if (shelf && Number(shelf[1]) >= 1 && Number(shelf[1]) <= (state.catalog?.shelves || 6)) { result.shelf = Number(shelf[1]); rest = rest.replace(shelf[0], ' '); }

    const amount = rest.match(/\s(\d+(?:[.,]\d+)?)\s*(kg|quilos?|kilos?|g|gramas|l|litros?|ml|un|und|unidades?|cx|caixas?|pct|pacotes?)?(?=\s)/i);
    if (amount) {
      result.quantity = Number(amount[1].replace(',', '.'));
      result.unit = UNIT_ALIASES[fold(amount[2] || 'un')] || 'un';
      rest = rest.replace(amount[0], ' ');
    }

    // "no freezer", "na câmara", "em Baú 02": casa com nome ou tipo do sensor
    const place = rest.match(/\s(?:no|na|em)\s+(.+?)\s*$/i);
    if (place) {
      const wanted = fold(place[1]).trim();
      const sensor = state.sensors.find(item => fold(item.name).includes(wanted))
        || state.sensors.find(item => wanted.split(/\s+/).some(word => word.length > 3 && fold(`${item.name} ${typeOf(item).label}`).includes(word)));
      if (sensor) { result.sensorId = sensor.id; rest = rest.replace(place[0], ' '); }
    }

    result.name = rest.replace(/^\s*(de|do|da)\s+/i, '').replace(/\s+/g, ' ').trim();
    result.name = result.name.charAt(0).toUpperCase() + result.name.slice(1);
    result.category = detectCategory(result.name);
    return result;
  }

  function expiryBadge(item) {
    const days = item.days_to_expiry;
    if (item.expiry_status === 'none') return '<span class="tp-badge is-muted">sem validade</span>';
    if (item.expiry_status === 'expired') return `<span class="tp-badge is-alert"><i class="fa-solid fa-calendar-xmark" aria-hidden="true"></i> vencido há ${Math.abs(days)} d</span>`;
    if (item.expiry_status === 'expiring') return `<span class="tp-badge is-attention"><i class="fa-solid fa-hourglass-half" aria-hidden="true"></i> ${days === 0 ? 'vence hoje' : days === 1 ? 'vence amanhã' : `vence em ${days} d`}</span>`;
    return `<span class="tp-badge is-muted">até ${shortDate(item.expires_at)}</span>`;
  }

  function integrityBadge(item) {
    const info = INTEGRITY[item.integrity] || INTEGRITY.intact;
    const minutes = Number(item.exposure_minutes);
    const detail = item.integrity === 'intact' ? '' : ` · ${minutes < 60 ? `${Math.round(minutes)} min` : `${num(minutes / 60, 1)} h`} fora da faixa`;
    return `<span class="tp-badge is-${info.cls}" title="Tempo fora da faixa segura desde que foi guardado"><i class="fa-solid ${info.icon}" aria-hidden="true"></i> ${info.label}${detail}</span>`;
  }

  function renderInventoryCount() {
    const summary = state.inventory;
    const pending = summary ? summary.expired + summary.expiring : 0;
    $$('[data-inventory-count]').forEach(badge => {
      badge.hidden = !pending;
      badge.textContent = pending > 9 ? '9+' : String(pending);
      badge.title = summary ? `${summary.expired} vencido(s), ${summary.expiring} vencendo` : '';
    });
  }

  // Envia e trata o 409 de incompatibilidade com uma confirmação explícita
  async function postItem(action, data) {
    try {
      return await api(action, { method: 'POST', data });
    } catch (error) {
      if (error.code !== 'incompatible') throw error;
      const ok = await confirmDialog({ title: 'Equipamento inadequado', body: `${error.message} Quer guardar mesmo assim? A decisão fica registrada na auditoria.`, confirmLabel: 'Guardar mesmo assim', danger: true });
      if (!ok) return null;
      return api(action, { method: 'POST', data: { ...data, acknowledge_risk: true } });
    }
  }

  async function afterInventoryChange(message) {
    await refreshItems();
    if (message) toast(message, { type: 'success' });
    state.view?.inventory?.();
  }

  function sensorOptions(selected) {
    return state.sensors.map(sensor => `<option value="${Number(sensor.id)}" ${String(sensor.id) === String(selected) ? 'selected' : ''}>${esc(sensor.name)} · ${esc(typeOf(sensor).label)}</option>`).join('');
  }

  function shelfPicker(name, selected) {
    const total = state.catalog?.shelves || 6;
    return `<div class="tp-shelf-picker" role="radiogroup" aria-label="Prateleira">${Array.from({ length: total }, (_, index) => {
      const shelf = index + 1;
      return `<label><input type="radio" name="${name}" value="${shelf}" ${shelf === Number(selected) ? 'checked' : ''}><span>P${shelf}</span></label>`;
    }).join('')}</div>`;
  }

  /** Formulário completo: guardar um item novo ou (admin) editar um registro. */
  function openItemForm({ sensorId = state.sensors[0]?.id, shelf = 1, prefill = {}, item = null } = {}) {
    if (!state.sensors.length) { toast('Cadastre um equipamento antes de guardar itens.', { type: 'warn' }); return; }
    const editing = Boolean(item);
    const source = item || prefill;
    let categoryTouched = editing || Boolean(prefill.category);
    const chips = Object.entries(state.catalog.categories).map(([id, category]) => `
      <label class="tp-cat"><input type="radio" name="category" value="${id}" ${id === (source.category || 'carnes') ? 'checked' : ''}>
        <span><i class="fa-solid ${category.icon}" aria-hidden="true"></i>${esc(category.label)}</span></label>`).join('');

    openModal(`
      <h2 class="tp-modal-title">${editing ? 'Editar registro' : 'Guardar item'}</h2>
      <p class="tp-modal-text">${editing ? 'Correções ficam registradas na auditoria.' : 'A validade é sugerida pela categoria e pelo tipo de equipamento.'}</p>
      <form class="tp-form" novalidate data-item-form>
        <div class="tp-field"><label for="it-name">O que é</label><input id="it-name" name="name" maxlength="100" required autocomplete="off" placeholder="Ex.: Peito de frango" value="${esc(source.name || '')}"></div>
        <fieldset class="tp-fieldset"><legend>Categoria <small data-cat-auto hidden>· detectada pelo nome</small></legend><div class="tp-cat-grid">${chips}</div></fieldset>
        <div class="tp-field-row tp-field-row-3">
          <div class="tp-field"><label for="it-qty">Quantidade</label><input id="it-qty" name="quantity" type="number" min="0.001" step="any" required value="${esc(source.quantity ?? 1)}"></div>
          <div class="tp-field"><label for="it-unit">Unidade</label><select id="it-unit" name="unit">${state.catalog.units.map(unit => `<option ${unit === (source.unit || 'un') ? 'selected' : ''}>${unit}</option>`).join('')}</select></div>
          <div class="tp-field"><label for="it-exp">Validade</label><input id="it-exp" name="expires_at" type="date" value="${esc(source.expires_at || '')}"></div>
        </div>
        <p class="tp-hint" data-exp-hint></p>
        ${editing ? '' : `
        <div class="tp-field"><label for="it-sensor">Onde foi guardado</label><select id="it-sensor" name="sensor_id">${sensorOptions(sensorId)}</select></div>
        <div class="tp-field"><span class="tp-label">Prateleira</span>${shelfPicker('shelf', shelf)}</div>`}
        <div class="tp-compat" data-compat role="alert" hidden>
          <p><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> <span data-compat-text></span></p>
          <label class="tp-check"><input type="checkbox" name="acknowledge_risk"> Guardar mesmo assim (fica registrado na auditoria)</label>
        </div>
        <div class="tp-field"><label for="it-notes">Observação <small>(opcional)</small></label><input id="it-notes" name="notes" maxlength="300" autocomplete="off" placeholder="Lote, fornecedor, pedido…" value="${esc(source.notes || '')}"></div>
        <p class="tp-form-error" data-error role="alert" hidden></p>
        <div class="tp-modal-actions">
          <button type="button" class="tp-btn tp-btn-ghost" data-close-modal>Cancelar</button>
          <button type="submit" class="tp-btn tp-btn-primary">${editing ? 'Salvar' : 'Guardar'}</button>
        </div>
      </form>`, {
      label: editing ? 'Editar item' : 'Guardar item',
      wide: true,
      onMount: modal => {
        const form = $('[data-item-form]', modal);
        const sensorOf = () => sensorById(editing ? item.sensor_id : form.elements.sensor_id.value);
        let expiryTouched = editing || Boolean(source.expires_at);

        const refresh = () => {
          const sensor = sensorOf();
          const category = form.elements.category.value;
          const suggestion = suggestExpiry(category, sensor);
          if (!expiryTouched) form.elements.expires_at.value = suggestion.iso;
          $('[data-exp-hint]', modal).textContent = suggestion.days === null
            ? `${categoryOf(category).label}: sem validade sugerida ${STORAGE_LABEL[storageClass(sensor)]}.`
            : `Sugestão: ${suggestion.days} dias para ${categoryOf(category).label.toLowerCase()} ${STORAGE_LABEL[storageClass(sensor)]}.`;
          $('[data-compat]', modal).hidden = editing || compatible(category, sensor);
          $('[data-compat-text]', modal).textContent = `${categoryOf(category).label} não combinam com ${sensor.name} (${STORAGE_LABEL[storageClass(sensor)]}).`;
        };

        form.addEventListener('input', event => {
          if (event.target.name === 'expires_at') expiryTouched = true;
          if (event.target.name === 'category') categoryTouched = true;
          if (event.target.name === 'name' && !categoryTouched) {
            const detected = detectCategory(event.target.value);
            if (detected) form.querySelector(`[name="category"][value="${detected}"]`).checked = true;
            $('[data-cat-auto]', modal).hidden = !detected;
          }
          refresh();
        });
        form.addEventListener('change', refresh);

        form.addEventListener('submit', async event => {
          event.preventDefault();
          const error = $('[data-error]', modal);
          error.hidden = true;
          if (!form.checkValidity()) { form.reportValidity(); return; }
          const risky = !$('[data-compat]', modal).hidden;
          if (risky && !form.elements.acknowledge_risk.checked) {
            error.textContent = 'Confirme que quer guardar neste equipamento mesmo assim, ou escolha outro.';
            error.hidden = false;
            return;
          }
          const data = {
            name: form.elements.name.value.trim(),
            category: form.elements.category.value,
            quantity: Number(form.elements.quantity.value),
            unit: form.elements.unit.value,
            expires_at: form.elements.expires_at.value || null,
            notes: form.elements.notes.value.trim(),
          };
          try {
            const result = editing
              ? await api('item-update', { method: 'POST', data: { ...data, item_id: item.id } })
              : await postItem('item', { ...data, sensor_id: Number(form.elements.sensor_id.value), shelf: Number(form.elements.shelf.value), acknowledge_risk: risky });
            if (!result) return;
            closeModal();
            await afterInventoryChange(result.message);
          } catch (requestError) {
            error.textContent = requestError.message;
            error.hidden = false;
          }
        });
        refresh();
      },
    });
  }

  /** Retirada: quanto saiu (parcial ou tudo) e por quê. */
  function openWithdraw(item) {
    const total = Number(item.quantity);
    const step = ['kg', 'L'].includes(item.unit) ? 0.1 : 1;
    openModal(`
      <h2 class="tp-modal-title">Retirar ${esc(item.name)}</h2>
      <p class="tp-modal-text">${esc(item.sensor_name)} · prateleira ${Number(item.shelf)} · saldo de ${qty(total, item.unit)}</p>
      <form class="tp-form" novalidate data-withdraw>
        <div class="tp-withdraw">
          <output class="tp-withdraw-value" data-out>${qty(total, item.unit)}</output>
          <input type="range" name="amount" min="${step}" max="${total}" step="${step}" value="${total}" aria-label="Quantidade retirada">
          <div class="tp-withdraw-quick">
            <button type="button" class="tp-btn tp-btn-ghost tp-btn-sm" data-amount="${Math.min(total, step === 1 ? 1 : 0.5)}">${step === 1 ? '1' : '0,5'} ${item.unit}</button>
            <button type="button" class="tp-btn tp-btn-ghost tp-btn-sm" data-amount="${Math.round((total / 2) / step) * step || step}">Metade</button>
            <button type="button" class="tp-btn tp-btn-ghost tp-btn-sm" data-amount="${total}">Tudo</button>
          </div>
        </div>
        <div class="tp-pills tp-pills-lg tp-pills-block" role="radiogroup" aria-label="Motivo">
          ${state.catalog.reasons.map((reason, index) => `<button type="button" role="radio" data-reason="${reason}" aria-checked="${index === 0}">${REASON_LABEL[reason] || reason}</button>`).join('')}
        </div>
        ${item.integrity === 'compromised' ? '<p class="tp-compat"><i class="fa-solid fa-biohazard" aria-hidden="true"></i> Este item ficou tempo demais fora da faixa segura. O recomendado é descartar.</p>' : ''}
        <p class="tp-form-error" data-error role="alert" hidden></p>
        <div class="tp-modal-actions">
          <button type="button" class="tp-btn tp-btn-ghost" data-close-modal>Cancelar</button>
          <button type="submit" class="tp-btn tp-btn-primary" data-submit>Retirar tudo</button>
        </div>
      </form>`, {
      label: `Retirar ${item.name}`,
      onMount: modal => {
        const form = $('[data-withdraw]', modal);
        let reason = item.integrity === 'compromised' ? 'descartado' : state.catalog.reasons[0];
        const sync = () => {
          const amount = Number(form.elements.amount.value);
          const all = amount >= total - 1e-9;
          $('[data-out]', modal).textContent = qty(all ? total : amount, item.unit);
          $('[data-submit]', modal).textContent = all ? 'Retirar tudo' : `Retirar ${qty(amount, item.unit)}`;
          $$('[data-reason]', modal).forEach(button => button.setAttribute('aria-checked', String(button.dataset.reason === reason)));
        };
        form.addEventListener('input', sync);
        form.addEventListener('click', event => {
          const quick = event.target.closest('[data-amount]');
          if (quick) { form.elements.amount.value = quick.dataset.amount; sync(); }
          const pick = event.target.closest('[data-reason]');
          if (pick) { reason = pick.dataset.reason; sync(); }
        });
        form.addEventListener('submit', async event => {
          event.preventDefault();
          const amount = Number(form.elements.amount.value);
          try {
            const result = await api('item-withdraw', { method: 'POST', data: { item_id: item.id, reason, quantity: amount >= total - 1e-9 ? null : amount } });
            closeModal();
            await afterInventoryChange(result.message);
          } catch (error) {
            $('[data-error]', modal).textContent = error.message;
            $('[data-error]', modal).hidden = false;
          }
        });
        sync();
      },
    });
  }

  function openMove(item) {
    openModal(`
      <h2 class="tp-modal-title">Mover ${esc(item.name)}</h2>
      <p class="tp-modal-text">Arrastar o item entre as prateleiras na tela do equipamento faz o mesmo.</p>
      <form class="tp-form" novalidate data-move>
        <div class="tp-field"><label for="mv-sensor">Equipamento</label><select id="mv-sensor" name="sensor_id">${sensorOptions(item.sensor_id)}</select></div>
        <div class="tp-field"><span class="tp-label">Prateleira</span>${shelfPicker('shelf', item.shelf)}</div>
        <p class="tp-form-error" data-error role="alert" hidden></p>
        <div class="tp-modal-actions">
          <button type="button" class="tp-btn tp-btn-ghost" data-close-modal>Cancelar</button>
          <button type="submit" class="tp-btn tp-btn-primary">Mover</button>
        </div>
      </form>`, {
      label: `Mover ${item.name}`,
      onMount: modal => {
        const form = $('[data-move]', modal);
        form.addEventListener('submit', async event => {
          event.preventDefault();
          try {
            const result = await postItem('item-move', { item_id: item.id, sensor_id: Number(form.elements.sensor_id.value), shelf: Number(form.elements.shelf.value) });
            if (!result) return;
            closeModal();
            await afterInventoryChange(result.message);
          } catch (error) {
            $('[data-error]', modal).textContent = error.message;
            $('[data-error]', modal).hidden = false;
          }
        });
      },
    });
  }

  /** Ficha do item com as ações permitidas para o papel. */
  function openItem(item) {
    const category = categoryOf(item.category);
    const by = item.stored_by_name ? ` por ${esc(item.stored_by_name)}` : '';
    openModal(`
      <div class="tp-item-sheet">
        <span class="tp-item-icon tp-item-icon-lg"><i class="fa-solid ${category.icon}" aria-hidden="true"></i></span>
        <div><h2 class="tp-modal-title">${esc(item.name)}</h2><p class="tp-modal-text">${esc(category.label)} · ${qty(item.quantity, item.unit)}</p></div>
      </div>
      <dl class="tp-item-facts">
        <div><dt>Onde</dt><dd>${esc(item.sensor_name)} · prateleira ${Number(item.shelf)}</dd></div>
        <div><dt>Guardado</dt><dd>${relative(parseDb(item.stored_at))}${by}</dd></div>
        <div><dt>Validade</dt><dd>${expiryBadge(item)}</dd></div>
        <div><dt>Cadeia de frio</dt><dd>${integrityBadge(item)}</dd></div>
        ${item.notes ? `<div><dt>Observação</dt><dd>${esc(item.notes)}</dd></div>` : ''}
      </dl>
      <div class="tp-modal-actions tp-modal-actions-split">
        <div>
          ${can('inventory.manage') ? '<button type="button" class="tp-icon-btn" data-item-act="edit" aria-label="Editar registro" title="Editar registro"><i class="fa-solid fa-pen" aria-hidden="true"></i></button><button type="button" class="tp-icon-btn" data-item-act="delete" aria-label="Apagar registro" title="Apagar registro (lançamento errado)"><i class="fa-regular fa-trash-can" aria-hidden="true"></i></button>' : ''}
        </div>
        <div>
          ${can('inventory.write') ? '<button type="button" class="tp-btn tp-btn-ghost" data-item-act="move"><i class="fa-solid fa-right-left" aria-hidden="true"></i> Mover</button><button type="button" class="tp-btn tp-btn-primary" data-item-act="withdraw" autofocus><i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i> Retirar</button>' : ''}
        </div>
      </div>`, {
      label: item.name,
      onMount: modal => {
        modal.addEventListener('click', async event => {
          const act = event.target.closest('[data-item-act]')?.dataset.itemAct;
          if (!act) return;
          if (act === 'withdraw') openWithdraw(item);
          if (act === 'move') openMove(item);
          if (act === 'edit') openItemForm({ item });
          if (act === 'delete') {
            const ok = await confirmDialog({ title: `Apagar o registro de ${item.name}?`, body: 'Use só para lançamentos errados. Para tirar o item do equipamento, use "Retirar" — assim o histórico fica correto.', confirmLabel: 'Apagar registro', danger: true });
            if (!ok) return;
            try {
              const result = await api('item-delete', { method: 'POST', data: { item_id: item.id } });
              await afterInventoryChange(result.message);
            } catch (error) { toast(error.message, { type: 'warn' }); }
          }
        });
      },
    });
  }

  /**
   * Interior do equipamento: uma prateleira por linha, itens como etiquetas.
   * Arrastar entre prateleiras move o item (teclado/toque: abrir o item → Mover).
   */
  function shelvesHtml(sensor) {
    const items = itemsOf(sensor.id);
    const highest = items.reduce((max, item) => Math.max(max, Number(item.shelf)), 0);
    const total = clamp(highest, 3, state.catalog?.shelves || 6);
    const writable = can('inventory.write');
    return `
      <div class="tp-cabinet is-${storageClass(sensor)}" data-cabinet>
        ${Array.from({ length: total }, (_, index) => {
          const shelf = index + 1;
          const onShelf = items.filter(item => Number(item.shelf) === shelf);
          return `
            <div class="tp-shelf" data-shelf="${shelf}">
              <span class="tp-shelf-label">P${shelf}</span>
              <div class="tp-shelf-items">
                ${onShelf.map(item => `
                  <div role="button" tabindex="0" class="tp-tag is-${item.expiry_status} is-${item.integrity}" data-item="${Number(item.id)}" ${writable ? 'draggable="true"' : ''}
                    title="${esc(item.name)} · ${qty(item.quantity, item.unit)}">
                    <i class="fa-solid ${categoryOf(item.category).icon}" aria-hidden="true"></i><span>${esc(item.name)}</span><small>${qty(item.quantity, item.unit)}</small>
                  </div>`).join('')}
                ${writable ? `<button type="button" class="tp-tag-add" data-add-shelf="${shelf}" aria-label="Guardar item na prateleira ${shelf}"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>` : ''}
                ${!onShelf.length && !writable ? '<span class="tp-shelf-empty">vazia</span>' : ''}
              </div>
            </div>`;
        }).join('')}
      </div>`;
  }

  // Liga cliques e arrastar-e-soltar das prateleiras dentro de "root"
  function bindShelves(root, sensorId) {
    root.addEventListener('click', event => {
      const tag = event.target.closest('[data-item]');
      if (tag) { const item = state.items.find(entry => String(entry.id) === tag.dataset.item); if (item) openItem(item); return; }
      const add = event.target.closest('[data-add-shelf]');
      if (add) openItemForm({ sensorId, shelf: Number(add.dataset.addShelf) });
    });
    root.addEventListener('keydown', event => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-item]')) {
        event.preventDefault();
        event.target.click();
      }
    });
    root.addEventListener('dragstart', event => {
      const tag = event.target.closest('[data-item]');
      if (!tag) return;
      event.dataTransfer.setData('text/plain', tag.dataset.item);
      event.dataTransfer.effectAllowed = 'move';
      tag.classList.add('is-dragging');
      root.querySelector('[data-cabinet]')?.classList.add('is-dragging');
    });
    root.addEventListener('dragend', () => {
      $$('.is-dragging, .is-drop', root).forEach(element => element.classList.remove('is-dragging', 'is-drop'));
    });
    root.addEventListener('dragover', event => {
      const shelf = event.target.closest('[data-shelf]');
      if (!shelf) return;
      event.preventDefault();
      $$('.is-drop', root).forEach(element => element !== shelf && element.classList.remove('is-drop'));
      shelf.classList.add('is-drop');
    });
    root.addEventListener('drop', async event => {
      const shelf = event.target.closest('[data-shelf]');
      const itemId = event.dataTransfer.getData('text/plain');
      if (!shelf || !itemId) return;
      event.preventDefault();
      const item = state.items.find(entry => String(entry.id) === itemId);
      if (!item || Number(item.shelf) === Number(shelf.dataset.shelf)) return;
      item.shelf = Number(shelf.dataset.shelf);
      state.view?.inventory?.();
      try {
        await api('item-move', { method: 'POST', data: { item_id: item.id, sensor_id: Number(sensorId), shelf: item.shelf } });
        await afterInventoryChange(`${item.name} foi para a prateleira ${item.shelf}.`);
      } catch (error) {
        toast(error.message, { type: 'warn' });
        await afterInventoryChange();
      }
    });
  }

  // ==========================================
  // PALETA DE COMANDOS (Ctrl/⌘ + K)
  // ==========================================

  let paletteItems = [];
  let paletteIndex = 0;

  function paletteCommands() {
    const commands = [
      { group: 'Páginas', icon: 'fa-gauge-high', label: 'Visão geral', run: () => { location.hash = '#/'; } },
      { group: 'Páginas', icon: 'fa-boxes-stacked', label: 'Inventário dos equipamentos', run: () => { location.hash = '#/inventory'; } },
      { group: 'Páginas', icon: 'fa-lightbulb', label: 'Iluminação do estacionamento', run: () => { location.hash = '#/lights'; } },
      { group: 'Páginas', icon: 'fa-wave-square', label: 'Atividade e alertas', run: () => { location.hash = '#/activity'; } },
    ];
    if (can('team.manage')) commands.push({ group: 'Páginas', icon: 'fa-user-shield', label: 'Administração: equipe e auditoria', run: () => { location.hash = '#/admin'; } });
    state.sensors.forEach(sensor => commands.push({
      group: 'Sensores', icon: typeOf(sensor).icon, label: sensor.name, hint: `${temp(sensor.current_temperature)} · ${sensor.location}`,
      run: () => { location.hash = `#/sensor/${sensor.id}`; },
    }));
    // "Onde está o frango?": cada item guardado é pesquisável pelo nome
    state.items.forEach(item => commands.push({
      group: 'Itens guardados', icon: categoryOf(item.category).icon, label: item.name,
      hint: `${qty(item.quantity, item.unit)} · ${item.sensor_name} · P${item.shelf}`,
      run: () => { location.hash = `#/sensor/${item.sensor_id}`; setTimeout(() => openItem(item), 50); },
    }));
    if (can('inventory.write')) commands.push({ group: 'Ações', icon: 'fa-box-open', label: 'Guardar item', run: () => openItemForm() });
    if (can('sensors.manage')) commands.push({ group: 'Ações', icon: 'fa-plus', label: 'Adicionar sensor', run: openAddSensor });
    if (can('team.manage')) commands.push({ group: 'Ações', icon: 'fa-ticket', label: 'Gerar convite para a equipe', run: () => { location.hash = '#/admin'; } });
    if (state.access?.permissions.includes('team.manage')) {
      commands.push({ group: 'Ações', icon: 'fa-eye', label: state.preview ? 'Sair da prévia de membro' : 'Ver o painel como membro', run: () => setPreview(!state.preview) });
    }
    commands.push(
      { group: 'Ações', icon: 'fa-circle-half-stroke', label: 'Alternar tema claro/escuro', run: toggleTheme },
      { group: 'Ações', icon: 'fa-arrow-right-from-bracket', label: 'Sair da conta', run: logout },
    );
    if (!state.sensors.length && can('sensors.manage')) commands.push({ group: 'Ações', icon: 'fa-wand-magic-sparkles', label: 'Criar ambiente de demonstração', run: seedDemo });
    return commands;
  }

  function renderPalette() {
    const query = $('#paletteInput').value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const normalize = text => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    // Itens guardados só aparecem quando há busca (a lista vazia mostra páginas e ações)
    paletteItems = paletteCommands().filter(item => (query ? normalize(`${item.label} ${item.hint || ''} ${item.group}`).includes(query) : item.group !== 'Itens guardados'));
    paletteIndex = clamp(paletteIndex, 0, Math.max(0, paletteItems.length - 1));
    let lastGroup = '';
    $('#paletteList').innerHTML = paletteItems.length ? paletteItems.map((item, index) => {
      const header = item.group !== lastGroup ? `<li class="tp-palette-group" role="presentation">${esc(item.group)}</li>` : '';
      lastGroup = item.group;
      return `${header}<li role="option" id="pal-${index}" class="tp-palette-item" data-index="${index}" aria-selected="${index === paletteIndex}">
        <i class="fa-solid ${item.icon}" aria-hidden="true"></i><span>${esc(item.label)}</span>${item.hint ? `<small>${esc(item.hint)}</small>` : ''}</li>`;
    }).join('') : '<li class="tp-palette-empty">Nada encontrado.</li>';
    $('#paletteInput').setAttribute('aria-activedescendant', paletteItems.length ? `pal-${paletteIndex}` : '');
    $(`#pal-${paletteIndex}`)?.scrollIntoView({ block: 'nearest' });
  }

  function openPalette() {
    if (!state.user) return;
    $('#tpPalette').hidden = false;
    $('#paletteInput').value = '';
    paletteIndex = 0;
    renderPalette();
    $('#paletteInput').focus();
  }

  function closePalette() { $('#tpPalette').hidden = true; }

  function runPalette(index) {
    const item = paletteItems[index];
    if (!item) return;
    closePalette();
    item.run();
  }

  // ==========================================
  // DADOS E LEITURA AO VIVO
  // ==========================================

  async function refreshSensors() {
    state.sensors = (await api('sensors')).sensors;
    renderSidebar();
  }

  async function refreshLights() {
    state.lights = (await api('lights')).lights;
  }

  async function refreshItems() {
    const result = await api('items');
    state.items = result.items;
    state.inventory = result.summary;
    renderInventoryCount();
  }

  async function loadSpark(sensor) {
    try {
      let history = await api('history', { params: { sensor_id: sensor.id, range: '1h', points: SPARK_POINTS } });
      if (history.readings.length < 4) history = await api('history', { params: { sensor_id: sensor.id, range: '24h', points: SPARK_POINTS } });
      state.spark.set(String(sensor.id), history.readings.map(reading => Number(reading.temperature)));
    } catch (error) {
      state.spark.set(String(sensor.id), [Number(sensor.current_temperature)]);
    }
  }

  let tickTimer = null;
  let tickBusy = false;

  async function tick(scenario = null) {
    if (!state.user) return null;
    // Um cenário pedido pelo usuário espera a leitura em andamento terminar
    for (let tries = 0; scenario && tickBusy && tries < 40; tries += 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (tickBusy) return null;
    if (!scenario && document.hidden) return null;
    tickBusy = true;
    try {
      const result = await api('tick', { method: 'POST', data: scenario || {} });
      const access = state.access;
      if (access && (result.access.role !== access.role || result.access.workspaceId !== access.workspace.id)) {
        const label = result.access.workspaceId !== access.workspace.id ? 'Você saiu da equipe e voltou ao seu próprio espaço.' : `Agora você é ${result.access.role === 'admin' ? 'Administrador' : 'Membro'} neste espaço.`;
        refreshAccess(label).catch(() => {});
      }
      state.sensors = result.sensors;
      state.openAlerts = result.openAlerts;
      state.lastTick = new Date();
      state.failures = 0;
      setOnline(true);
      result.sensors.forEach(sensor => {
        const values = state.spark.get(String(sensor.id)) || [];
        values.push(Number(sensor.current_temperature));
        while (values.length > SPARK_POINTS) values.shift();
        state.spark.set(String(sensor.id), values);
        watchState(sensor);
      });
      renderSidebar();
      renderAlertCount();
      state.view?.live?.(result);
      return result;
    } catch (error) {
      state.failures += 1;
      if (error.status !== 401) setOnline(false);
      return null;
    } finally {
      tickBusy = false;
    }
  }

  // Avisa só na transição para "alerta" (e quando volta ao normal)
  function watchState(sensor) {
    const key = String(sensor.id);
    const previous = state.known.get(key);
    const current = sensorState(sensor);
    state.known.set(key, current);
    if (previous === undefined || previous === current) return;
    if (current === 'alert') {
      // O alerta diz o que está em jogo: os itens guardados naquele equipamento
      const stored = itemsOf(sensor.id);
      const names = stored.slice(0, 3).map(item => item.name).join(', ');
      const atRisk = stored.length ? ` Em risco: ${names}${stored.length > 3 ? ` e mais ${stored.length - 3}` : ''}.` : '';
      const message = `${sensor.name} está em ${temp(sensor.current_temperature)} — fora da faixa de ${limit(sensor.minimum_temperature)} a ${limit(sensor.maximum_temperature)}.${atRisk}`;
      toast(message, { type: 'danger', title: 'Alerta de temperatura', timeout: 8000 });
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Tempic · Alerta de temperatura', { body: message, icon: '../img/opt/logo_tempic.webp', tag: `sensor-${sensor.id}` });
      }
    } else if (previous === 'alert' && current !== 'offline') {
      toast(`${sensor.name} voltou para a faixa segura.`, { type: 'success' });
    }
  }

  function setOnline(online) {
    state.online = online;
    const element = $('#liveStatus');
    element.classList.toggle('is-offline', !online);
    renderLiveText();
  }

  function renderLiveText() {
    const text = $('#liveText');
    if (!text) return;
    if (!state.online) text.textContent = 'reconectando…';
    else text.textContent = state.lastTick ? `ao vivo · ${relative(state.lastTick)}` : 'ao vivo';
  }

  let liveTextTimer = null;
  let itemsTimer = null;

  function startLive() {
    stopLive();
    tickTimer = setInterval(() => tick(), TICK_MS);
    liveTextTimer = setInterval(renderLiveText, 1000);
    // Exposição e validade mudam devagar: o inventário atualiza a cada 30 s
    itemsTimer = setInterval(() => {
      if (document.hidden) return;
      refreshItems().then(() => state.view?.inventory?.({ passive: true })).catch(() => {});
    }, 30000);
    tick();
  }

  function stopLive() {
    clearInterval(tickTimer);
    clearInterval(liveTextTimer);
    clearInterval(itemsTimer);
    tickTimer = null;
    liveTextTimer = null;
    itemsTimer = null;
  }

  // ==========================================
  // CASCA: barra lateral, contadores
  // ==========================================

  function renderSidebar() {
    const list = $('#sideSensors');
    if (!list) return;
    const active = location.hash.match(/^#\/sensor\/(\d+)/)?.[1];
    if (!state.sensors.length) {
      list.innerHTML = '<li class="tp-side-empty">Nenhum sensor ainda.</li>';
      return;
    }
    const existing = new Map($$('[data-side-sensor]', list).map(item => [item.dataset.sideSensor, item]));
    const ids = state.sensors.map(sensor => String(sensor.id));
    const sameList = existing.size === ids.length && ids.every(id => existing.has(id));
    if (!sameList) {
      list.innerHTML = state.sensors.map(sensor => `
        <li data-side-sensor="${Number(sensor.id)}">
          <a href="#/sensor/${Number(sensor.id)}"><span class="tp-status-dot" data-dot></span><span class="tp-side-name">${esc(sensor.name)}</span><b data-side-temp></b></a>
        </li>`).join('');
    }
    state.sensors.forEach(sensor => {
      const item = $(`[data-side-sensor="${Number(sensor.id)}"]`, list);
      if (!item) return;
      $('[data-dot]', item).dataset.state = sensorState(sensor);
      $('[data-side-temp]', item).textContent = temp(sensor.current_temperature);
      $('a', item).setAttribute('aria-current', String(String(sensor.id) === active ? 'page' : 'false'));
    });
  }

  function renderAlertCount() {
    $$('[data-alert-count]').forEach(badge => {
      badge.hidden = !state.openAlerts;
      badge.textContent = state.openAlerts > 9 ? '9+' : String(state.openAlerts);
    });
  }

  function setActiveNav(route) {
    $$('[data-route]').forEach(link => link.setAttribute('aria-current', link.dataset.route === route ? 'page' : 'false'));
  }

  // ==========================================
  // VISÃO GERAL
  // ==========================================

  function greeting() {
    const hour = new Date().getHours();
    return hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  }

  function nextLightChange(light) {
    if (!isOn(light.schedule_enabled)) return null;
    const now = new Date();
    const candidates = [[light.on_time, 'acende'], [light.off_time, 'apaga']].map(([time, verb]) => {
      const [h, m] = time.split(':').map(Number);
      const date = new Date(now);
      date.setHours(h, m, 0, 0);
      if (date <= now) date.setDate(date.getDate() + 1);
      return { date, verb, time };
    });
    return candidates.sort((a, b) => a.date - b.date)[0];
  }

  function overviewKpis() {
    const total = state.sensors.length;
    const states = state.sensors.map(sensor => sensorState(sensor));
    const healthy = states.filter(s => s === 'normal').length;
    const alerts = states.filter(s => s === 'alert').length;
    const cooling = state.sensors.filter(sensor => isOn(sensor.equipment_on)).length;
    const lightsOn = state.lights.filter(light => isOn(light.is_on)).length;
    return { total, healthy, alerts, cooling, lightsOn, health: total ? Math.round((healthy / total) * 100) : 0 };
  }

  function sensorCard(sensor) {
    const st = sensorState(sensor);
    const type = typeOf(sensor);
    const cooling = isOn(sensor.equipment_on);
    return `
      <a class="tp-sensor-card" href="#/sensor/${Number(sensor.id)}" data-card="${Number(sensor.id)}" data-state="${st}">
        <div class="tp-sensor-head">
          <span class="tp-sensor-icon"><i class="fa-solid ${type.icon}" aria-hidden="true"></i></span>
          <div class="tp-sensor-title"><strong>${esc(sensor.name)}</strong><small>${esc(sensor.location)}</small></div>
          ${stateChip(st)}
        </div>
        <div class="tp-sensor-reading">
          <span class="tp-sensor-temp" data-card-temp data-value="${Number(sensor.current_temperature)}">${num(sensor.current_temperature)}</span><span class="tp-unit">°C</span>
          <span class="tp-cooling ${cooling ? 'is-on' : ''}" data-card-cooling title="${cooling ? 'Refrigeração ligada' : 'Refrigeração desligada'}">
            <i class="fa-solid fa-snowflake" aria-hidden="true"></i><span>${cooling ? 'refrigerando' : 'desligada'}</span>
          </span>
        </div>
        <div class="tp-sensor-spark" data-card-spark>${sparkline(sensor, state.spark.get(String(sensor.id)) || [])}</div>
        ${rangeBar(sensor)}
        <div class="tp-sensor-foot"><span>${limit(sensor.minimum_temperature)}</span><span>${sensor.control_mode === 'auto' ? '<i class="fa-solid fa-robot" aria-hidden="true"></i> automático' : '<i class="fa-solid fa-hand" aria-hidden="true"></i> manual'}</span><span>${limit(sensor.maximum_temperature)}</span></div>
        <div class="tp-sensor-stock" data-card-stock>${stockLine(sensor)}</div>
      </a>`;
  }

  // "8 itens · 1 vencendo" + ícones das categorias guardadas
  function stockLine(sensor) {
    const items = itemsOf(sensor.id);
    if (!items.length) return '<span class="tp-muted"><i class="fa-solid fa-box-open" aria-hidden="true"></i> vazio</span>';
    const flagged = items.filter(item => item.expiry_status === 'expired' || item.expiry_status === 'expiring').length;
    const risk = items.filter(item => item.integrity !== 'intact').length;
    const icons = [...new Set(items.map(item => categoryOf(item.category).icon))].slice(0, 4).map(icon => `<i class="fa-solid ${icon}" aria-hidden="true"></i>`).join('');
    return `<span class="tp-stock-icons">${icons}</span><span>${items.length} ${items.length === 1 ? 'item' : 'itens'}</span>${flagged ? `<b class="is-attention">${flagged} vencendo</b>` : ''}${risk ? `<b class="is-alert">${risk} em risco</b>` : ''}`;
  }

  function viewOverview(main) {
    const firstName = (state.user.name || '').split(' ')[0];
    const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

    if (!state.sensors.length) {
      main.innerHTML = can('sensors.manage') ? `
        <section class="tp-empty">
          <div class="tp-empty-art" aria-hidden="true"><i class="fa-solid fa-temperature-arrow-down"></i></div>
          <h2>${greeting()}, ${esc(firstName)}. Vamos ligar o primeiro sensor?</h2>
          <p>Crie um ambiente completo com quatro sensores, itens guardados, histórico de 24 horas e iluminação programada — ou cadastre o seu sensor manualmente.</p>
          <div class="tp-empty-actions">
            <button type="button" class="tp-btn tp-btn-primary" data-action="seed-demo"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> Criar ambiente de demonstração</button>
            <button type="button" class="tp-btn tp-btn-ghost" data-action="add-sensor"><i class="fa-solid fa-plus" aria-hidden="true"></i> Adicionar sensor</button>
          </div>
        </section>` : `
        <section class="tp-empty">
          <div class="tp-empty-art" aria-hidden="true"><i class="fa-solid fa-hourglass-half"></i></div>
          <h2>${greeting()}, ${esc(firstName)}. Ainda não há sensores aqui.</h2>
          <p>O administrador de <strong>${esc(state.access.workspace.name)}</strong> ainda não cadastrou equipamentos. Assim que cadastrar, eles aparecem aqui e você passa a receber os alertas.</p>
        </section>`;
      return {};
    }

    const render = () => {
      const k = overviewKpis();
      const light = state.lights.map(item => ({ item, next: nextLightChange(item) })).filter(entry => entry.next).sort((a, b) => a.next.date - b.next.date)[0];
      main.innerHTML = `
        <section class="tp-hello">
          <div><span class="tp-kicker">${esc(today)}</span><h2>${greeting()}, ${esc(firstName)}.</h2>
          <p data-summary>${k.alerts ? `<strong class="is-alert">${k.alerts} ${k.alerts === 1 ? 'sensor precisa' : 'sensores precisam'} de atenção agora.</strong>` : 'Todos os ambientes estão dentro da faixa segura.'}</p></div>
          <div class="tp-hello-actions">
            ${can('inventory.write') ? '<button type="button" class="tp-btn tp-btn-ghost" data-action="add-item"><i class="fa-solid fa-box-open" aria-hidden="true"></i> Guardar item</button>' : ''}
            ${can('sensors.manage') ? '<button type="button" class="tp-btn tp-btn-ghost" data-action="add-sensor"><i class="fa-solid fa-plus" aria-hidden="true"></i> Novo sensor</button>' : ''}
          </div>
        </section>
        ${can('team.manage') ? '' : `<p class="tp-role-note"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Você acompanha a operação e recebe os alertas. Ajustes de temperatura, refrigeração, sensores e iluminação ficam com o administrador.</p>`}

        <section class="tp-kpis" aria-label="Indicadores">
          <article class="tp-kpi tp-kpi-health">
            <div class="tp-ring" style="--p:${k.health}" data-kpi-ring><span data-kpi="health">${k.health}%</span></div>
            <div><span class="tp-kpi-label">Saúde geral</span><strong><span data-kpi="healthy">${k.healthy}</span> de <span data-kpi="total">${k.total}</span> normais</strong></div>
          </article>
          <article class="tp-kpi ${k.alerts ? 'is-alert' : ''}" data-kpi-card="alerts">
            <span class="tp-kpi-icon"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i></span>
            <div><span class="tp-kpi-label">Em alerta</span><strong data-kpi="alerts">${k.alerts}</strong></div>
          </article>
          <article class="tp-kpi">
            <span class="tp-kpi-icon"><i class="fa-solid fa-snowflake" aria-hidden="true"></i></span>
            <div><span class="tp-kpi-label">Refrigeração ligada</span><strong><span data-kpi="cooling">${k.cooling}</span>/${k.total}</strong></div>
          </article>
          <a class="tp-kpi" href="#/lights">
            <span class="tp-kpi-icon"><i class="fa-solid fa-lightbulb" aria-hidden="true"></i></span>
            <div><span class="tp-kpi-label">Iluminação</span><strong>${k.lightsOn}/${state.lights.length} acesas</strong>
            ${light ? `<small>${esc(light.item.name)} ${light.next.verb} às ${esc(light.next.time)}</small>` : ''}</div>
          </a>
        </section>

        <section aria-labelledby="sensorsTitle">
          <div class="tp-section-head"><h2 id="sensorsTitle">Sensores</h2><span class="tp-muted">${k.total} conectados · leitura a cada 5 s</span></div>
          <div class="tp-sensor-grid">
            ${state.sensors.map(sensorCard).join('')}
            ${can('sensors.manage') ? '<button type="button" class="tp-sensor-add" data-action="add-sensor"><i class="fa-solid fa-plus" aria-hidden="true"></i><span>Adicionar sensor</span></button>' : ''}
          </div>
        </section>`;
    };

    render();
    let count = state.sensors.length;

    return {
      live() {
        if (state.sensors.length !== count) { count = state.sensors.length; render(); return; }
        const k = overviewKpis();
        state.sensors.forEach(sensor => {
          const card = $(`[data-card="${Number(sensor.id)}"]`, main);
          if (!card) return;
          const st = sensorState(sensor);
          card.dataset.state = st;
          const chip = $('[data-state-chip]', card);
          chip.className = `tp-chip tp-chip-${st}`;
          chip.textContent = STATE_LABEL[st];
          animateNumber($('[data-card-temp]', card), Number(sensor.current_temperature));
          $('[data-card-spark]', card).innerHTML = sparkline(sensor, state.spark.get(String(sensor.id)) || []);
          updateRangeBar(card, sensor);
          const cooling = $('[data-card-cooling]', card);
          const on = isOn(sensor.equipment_on);
          cooling.classList.toggle('is-on', on);
          cooling.querySelector('span').textContent = on ? 'refrigerando' : 'desligada';
        });
        $('[data-kpi="health"]', main).textContent = `${k.health}%`;
        $('[data-kpi-ring]', main).style.setProperty('--p', k.health);
        $('[data-kpi="healthy"]', main).textContent = k.healthy;
        $('[data-kpi="alerts"]', main).textContent = k.alerts;
        $('[data-kpi="cooling"]', main).textContent = k.cooling;
        $('[data-kpi-card="alerts"]', main).classList.toggle('is-alert', k.alerts > 0);
        $('[data-summary]', main).innerHTML = k.alerts
          ? `<strong class="is-alert">${k.alerts} ${k.alerts === 1 ? 'sensor precisa' : 'sensores precisam'} de atenção agora.</strong>`
          : 'Todos os ambientes estão dentro da faixa segura.';
      },
      inventory() {
        state.sensors.forEach(sensor => {
          const stock = $(`[data-card="${Number(sensor.id)}"] [data-card-stock]`, main);
          if (stock) stock.innerHTML = stockLine(sensor);
        });
      },
    };
  }

  // ==========================================
  // DETALHE DO SENSOR
  // ==========================================

  function viewSensor(main, id) {
    const sensor = sensorById(id);
    if (!sensor) {
      main.innerHTML = `<section class="tp-empty"><h2>Sensor não encontrado</h2><p>Ele pode ter sido removido.</p><a class="tp-btn tp-btn-primary" href="#/">Voltar à visão geral</a></section>`;
      return {};
    }

    let range = '1h';
    let chart = null;
    let pendingTarget = Number(sensor.target_temperature);
    let history = null;
    let lastEquipment = isOn(sensor.equipment_on);
    let lastAlert = sensorState(sensor) === 'alert';
    const type = typeOf(sensor);

    main.innerHTML = `
      <nav class="tp-crumbs" aria-label="Você está em"><a href="#/">Visão geral</a><i class="fa-solid fa-chevron-right" aria-hidden="true"></i><span>${esc(sensor.name)}</span></nav>

      <section class="tp-detail-head">
        <span class="tp-sensor-icon tp-sensor-icon-lg"><i class="fa-solid ${type.icon}" aria-hidden="true"></i></span>
        <div><h2>${esc(sensor.name)}</h2><p class="tp-muted">${esc(type.label)} · ${esc(sensor.location)} · Wi-Fi ${esc(sensor.wifi_ssid)}</p></div>
        <div class="tp-detail-head-actions">
          <span data-detail-chip>${stateChip(sensorState(sensor))}</span>
          ${can('sensors.manage') ? '<button type="button" class="tp-icon-btn" data-sensor-delete aria-label="Remover sensor" title="Remover sensor"><i class="fa-regular fa-trash-can" aria-hidden="true"></i></button>' : ''}
        </div>
      </section>

      <div class="tp-detail-grid">
        <section class="tp-card tp-card-gauge" aria-label="Leitura atual">
          <div class="tp-gauge-wrap" data-gauge>
            ${gaugeSvg(sensor)}
            <div class="tp-gauge-center">
              <span class="tp-gauge-value"><span data-current data-value="${Number(sensor.current_temperature)}">${num(sensor.current_temperature)}</span><small>°C</small></span>
              <span class="tp-gauge-caption" data-updated>atualizado ${relative(parseDb(sensor.updated_at))}</span>
            </div>
          </div>
          <div class="tp-target">
            <div class="tp-target-head"><label for="targetSlider">Temperatura alvo ${lockBadge('sensors.manage')}</label><output id="targetOut" for="targetSlider">${temp(pendingTarget)}</output></div>
            <div class="tp-target-row">
              <button type="button" class="tp-icon-btn" data-step-target="-0.5" aria-label="Diminuir alvo em 0,5 grau"${lockAttr('sensors.manage')}>−</button>
              <input type="range" id="targetSlider" min="${Number(sensor.minimum_temperature)}" max="${Number(sensor.maximum_temperature)}" step="0.5" value="${pendingTarget}"${lockAttr('sensors.manage')}>
              <button type="button" class="tp-icon-btn" data-step-target="0.5" aria-label="Aumentar alvo em 0,5 grau"${lockAttr('sensors.manage')}>+</button>
            </div>
            <div class="tp-target-foot"><span>${limit(sensor.minimum_temperature)}</span><button type="button" class="tp-btn tp-btn-primary tp-btn-sm" data-apply-target hidden>Aplicar alvo</button><span>${limit(sensor.maximum_temperature)}</span></div>
          </div>
        </section>

        <section class="tp-card tp-card-control" aria-labelledby="controlTitle">
          <div class="tp-card-head"><h3 id="controlTitle">Refrigeração ${lockBadge('equipment.control')}</h3><span class="tp-muted" data-equipment-label></span></div>
          <button type="button" class="tp-power" role="switch" aria-checked="false" data-equipment${lockAttr('equipment.control')}>
            <span class="tp-power-icon"><i class="fa-solid fa-snowflake" aria-hidden="true"></i></span>
            <span class="tp-power-text"><strong data-equipment-state></strong><small>${can('equipment.control') ? 'Toque para ligar ou desligar' : 'Somente o administrador aciona'}</small></span>
            <span class="tp-switch" aria-hidden="true"><span></span></span>
          </button>
          <div class="tp-segmented" role="radiogroup" aria-label="Modo de controle">
            <button type="button" role="radio" data-mode="auto"${lockAttr('equipment.control')}><i class="fa-solid fa-robot" aria-hidden="true"></i> Automático</button>
            <button type="button" role="radio" data-mode="manual"${lockAttr('equipment.control')}><i class="fa-solid fa-hand" aria-hidden="true"></i> Manual</button>
          </div>
          <p class="tp-hint" data-mode-hint></p>

          <div class="tp-lab" ${can('simulation.run') ? '' : 'hidden'}>
            <div class="tp-card-head"><h3><i class="fa-solid fa-flask" aria-hidden="true"></i> Laboratório de falhas</h3><span class="tp-chip tp-chip-ghost">simulação</span></div>
            <p class="tp-hint">Provoque uma situação real e veja o sistema reagir.</p>
            <div class="tp-lab-actions">
              <button type="button" class="tp-btn tp-btn-ghost tp-btn-sm" data-scenario="door"><i class="fa-solid fa-door-open" aria-hidden="true"></i> Abrir a porta</button>
              <button type="button" class="tp-btn tp-btn-ghost tp-btn-sm" data-scenario="power"><i class="fa-solid fa-plug-circle-xmark" aria-hidden="true"></i> Queda de energia</button>
              <button type="button" class="tp-btn tp-btn-ghost tp-btn-sm" data-scenario="restore"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Normalizar</button>
            </div>
          </div>
        </section>

        <section class="tp-card tp-card-chart" aria-labelledby="chartTitle">
          <div class="tp-card-head">
            <h3 id="chartTitle">Temperatura</h3>
            <div class="tp-chart-tools">
              <div class="tp-pills" role="radiogroup" aria-label="Período">
                ${Object.entries(RANGES).map(([key, value]) => `<button type="button" role="radio" data-range="${key}" aria-checked="${key === range}">${value.label}</button>`).join('')}
              </div>
              <button type="button" class="tp-icon-btn" data-export aria-label="Exportar CSV do período" title="Exportar CSV do período"><i class="fa-solid fa-file-arrow-down" aria-hidden="true"></i></button>
            </div>
          </div>
          <div class="tp-stats" data-stats></div>
          <div class="tp-chart-box"><canvas aria-label="Gráfico de temperatura do período selecionado" role="img"></canvas><div class="tp-chart-tip" hidden></div></div>
          <p class="tp-legend"><span class="is-line">leitura</span><span class="is-band">faixa segura</span><span class="is-target">alvo</span><span class="is-alert">fora da faixa</span></p>
        </section>

        <section class="tp-card tp-card-events" aria-labelledby="eventsTitle">
          <div class="tp-card-head"><h3 id="eventsTitle">Últimos eventos</h3><a class="tp-link" href="#/activity">Ver tudo</a></div>
          <ol class="tp-timeline" data-events><li class="tp-skeleton"></li><li class="tp-skeleton"></li><li class="tp-skeleton"></li></ol>
        </section>

        <section class="tp-card tp-card-stock" aria-labelledby="stockTitle">
          <div class="tp-card-head">
            <h3 id="stockTitle"><i class="fa-solid fa-boxes-stacked" aria-hidden="true"></i> Dentro do equipamento</h3>
            <div class="tp-card-head-actions">
              <span class="tp-muted" data-stock-summary></span>
              ${can('inventory.write') ? '<button type="button" class="tp-btn tp-btn-ghost tp-btn-sm" data-stock-add><i class="fa-solid fa-plus" aria-hidden="true"></i> Guardar item</button>' : ''}
            </div>
          </div>
          <div class="tp-stock-risk" data-stock-risk hidden></div>
          <div data-shelves></div>
          <p class="tp-hint">${can('inventory.write') ? 'Arraste os itens entre as prateleiras. Toque em um item para retirar, mover ou ver a validade.' : 'Toque em um item para ver validade e a exposição fora da faixa.'}</p>
        </section>
      </div>`;

    chart = new TempChart($('.tp-chart-box canvas', main), $('.tp-chart-tip', main));
    const gaugeRoot = $('[data-gauge]', main);
    requestAnimationFrame(() => updateGauge(gaugeRoot, sensor));

    const stockCard = $('.tp-card-stock', main);
    // Em alerta, o cartão do inventário diz o que está sendo exposto agora
    const renderStockRisk = current => {
      const items = itemsOf(id);
      const box = $('[data-stock-risk]', stockCard);
      box.hidden = !(sensorState(current) === 'alert' && items.length);
      if (!box.hidden) {
        box.innerHTML = `<i class="fa-solid fa-fire-flame-curved" aria-hidden="true"></i><span><strong>${items.length} ${items.length === 1 ? 'item exposto' : 'itens expostos'} agora.</strong> O equipamento está em ${temp(current.current_temperature)}; cada minuto fora da faixa conta na integridade.</span>`;
      }
    };
    const renderStock = () => {
      const current = sensorById(id) || sensor;
      const items = itemsOf(id);
      const flagged = items.filter(item => item.expiry_status === 'expired' || item.expiry_status === 'expiring').length;
      $('[data-shelves]', stockCard).innerHTML = shelvesHtml(current);
      $('[data-stock-summary]', stockCard).textContent = items.length
        ? `${items.length} ${items.length === 1 ? 'item' : 'itens'}${flagged ? ` · ${flagged} vencendo` : ''}`
        : 'vazio';
      renderStockRisk(current);
    };
    bindShelves(stockCard, id);
    stockCard.addEventListener('click', event => {
      if (event.target.closest('[data-stock-add]')) openItemForm({ sensorId: id, shelf: 1 });
    });
    renderStock();

    const renderControl = current => {
      const on = isOn(current.equipment_on);
      const auto = current.control_mode === 'auto';
      const power = $('[data-equipment]', main);
      power.setAttribute('aria-checked', String(on));
      power.classList.toggle('is-on', on);
      $('[data-equipment-state]', main).textContent = on ? 'Ligada · refrigerando' : 'Desligada';
      $('[data-equipment-label]', main).textContent = auto ? 'controle automático' : 'controle manual';
      $$('[data-mode]', main).forEach(button => button.setAttribute('aria-checked', String(button.dataset.mode === current.control_mode)));
      $('[data-mode-hint]', main).textContent = auto
        ? `Liga perto do limite máximo (${limit(current.maximum_temperature - (current.maximum_temperature - current.minimum_temperature) * 0.1)}) e desliga ao chegar 0,5 °C abaixo do alvo (${limit(current.target_temperature)}).`
        : 'O equipamento só muda quando você aciona. Os alertas continuam ativos.';
    };

    const renderStats = () => {
      if (!history) return;
      const states = history.readings.map(reading => reading.temperature_state);
      const inRange = states.length ? Math.round((states.filter(s => s === 'normal').length / states.length) * 100) : 0;
      $('[data-stats]', main).innerHTML = `
        <div><span>Mínima</span><strong>${temp(history.minimum)}</strong></div>
        <div><span>Média</span><strong>${temp(history.average)}</strong></div>
        <div><span>Máxima</span><strong>${temp(history.maximum)}</strong></div>
        <div><span>Na faixa ideal</span><strong>${inRange}%</strong></div>
        <div><span>Leituras</span><strong>${Number(history.total ?? history.readings.length).toLocaleString('pt-BR')}</strong></div>`;
    };

    const loadHistory = async (animate = true) => {
      $('.tp-chart-box', main).classList.add('is-loading');
      try {
        history = await api('history', { params: { sensor_id: sensor.id, range, points: RANGES[range].points } });
        chart.setData(history.readings, sensorById(id) || sensor, animate);
        renderStats();
      } catch (error) {
        toast(error.message, { type: 'warn' });
      } finally {
        $('.tp-chart-box', main)?.classList.remove('is-loading');
      }
    };

    const eventText = event => {
      const origins = { manual: 'manual', automatico: 'automático', programado: 'programado' };
      if (String(event.action).startsWith('modo')) return `Controle alterado para ${event.action}`;
      return `Refrigeração ${event.action} <em>${origins[event.origin] || event.origin}</em>`;
    };

    const loadEvents = async () => {
      try {
        const [alerts, events] = await Promise.all([
          api('alerts', { params: { sensor_id: sensor.id } }),
          api('events', { params: { sensor_id: sensor.id } }),
        ]);
        const items = [
          ...alerts.alerts.map(alert => ({ date: parseDb(alert.created_at), kind: alert.resolved_at ? 'resolved' : 'alert', html: `${esc(alert.message)}${alert.resolved_at ? ' <em>resolvido</em>' : ' <em>ativo</em>'}` })),
          ...events.events.map(event => ({ date: parseDb(event.created_at), kind: event.origin, html: eventText(event) })),
        ].sort((a, b) => b.date - a.date).slice(0, 7);
        $('[data-events]', main).innerHTML = items.length
          ? items.map(item => `<li class="is-${item.kind}"><span>${item.html}</span><time>${relative(item.date)}</time></li>`).join('')
          : '<li class="tp-timeline-empty">Nenhum evento ainda. Use o laboratório de falhas para gerar alguns.</li>';
      } catch (error) { /* lista fica como está */ }
    };

    const syncTarget = value => {
      pendingTarget = clamp(Math.round(value * 2) / 2, Number(sensor.minimum_temperature), Number(sensor.maximum_temperature));
      $('#targetSlider').value = pendingTarget;
      $('#targetOut').textContent = temp(pendingTarget);
      const current = sensorById(id) || sensor;
      $('[data-apply-target]', main).hidden = pendingTarget === Number(current.target_temperature);
      const preview = { ...current, target_temperature: pendingTarget };
      updateGauge(gaugeRoot, preview);
    };

    const control = async (action, data, message) => {
      try {
        const result = await api(action, { method: 'POST', data: { sensor_id: sensor.id, ...data } });
        await refreshSensors();
        const current = sensorById(id);
        if (current) { renderControl(current); updateGauge(gaugeRoot, current); }
        if (message !== false) toast(message || result.message, { type: 'success' });
        loadEvents();
        return result;
      } catch (error) {
        toast(error.message, { type: 'warn' });
        return null;
      }
    };

    main.addEventListener('input', event => {
      if (event.target.id === 'targetSlider') syncTarget(Number(event.target.value));
    });

    main.addEventListener('click', async event => {
      const target = event.target;
      const stepButton = target.closest('[data-step-target]');
      if (stepButton) { syncTarget(pendingTarget + Number(stepButton.dataset.stepTarget)); return; }

      if (target.closest('[data-apply-target]')) {
        const result = await control('target', { target_temperature: pendingTarget }, 'Temperatura alvo atualizada.');
        if (result) { $('[data-apply-target]', main).hidden = true; chart.sensor = sensorById(id); chart.draw(); }
        return;
      }

      const rangeButton = target.closest('[data-range]');
      if (rangeButton) {
        range = rangeButton.dataset.range;
        $$('[data-range]', main).forEach(button => button.setAttribute('aria-checked', String(button.dataset.range === range)));
        loadHistory(true);
        return;
      }

      if (target.closest('[data-equipment]')) {
        const current = sensorById(id);
        const on = !isOn(current.equipment_on);
        await control('equipment', { on }, `${on ? 'Refrigeração ligada' : 'Refrigeração desligada'} — controle passou para manual.`);
        return;
      }

      const modeButton = target.closest('[data-mode]');
      if (modeButton) { await control('control-mode', { mode: modeButton.dataset.mode }); return; }

      const scenario = target.closest('[data-scenario]')?.dataset.scenario;
      if (scenario === 'door') {
        toast('Porta aberta: entrou ar quente no ambiente.', { type: 'info', title: 'Simulação' });
        await tick({ sensor_id: sensor.id, scenario: 'door' });
        return;
      }
      if (scenario === 'power') {
        await control('equipment', { on: false }, 'Queda de energia simulada: a refrigeração parou. Acompanhe a temperatura subir.');
        return;
      }
      if (scenario === 'restore') {
        await control('control-mode', { mode: 'auto' }, 'Controle automático reativado.');
        return;
      }

      if (target.closest('[data-export]')) { exportCsv(sensor, range); return; }

      if (target.closest('[data-sensor-delete]')) {
        const ok = await confirmDialog({ title: `Remover ${sensor.name}?`, body: 'O histórico, os alertas e os acionamentos deste sensor também serão apagados. Essa ação não pode ser desfeita.', confirmLabel: 'Remover sensor', danger: true });
        if (!ok) return;
        try {
          await api('sensor-delete', { method: 'POST', data: { sensor_id: sensor.id } });
          state.spark.delete(String(sensor.id));
          await refreshSensors();
          toast(`${sensor.name} foi removido.`, { type: 'success' });
          location.hash = '#/';
        } catch (error) { toast(error.message, { type: 'warn' }); }
      }
    });

    renderControl(sensor);
    loadHistory(true);
    loadEvents();

    const updatedTimer = setInterval(() => {
      const current = sensorById(id);
      const label = $('[data-updated]', main);
      if (current && label) label.textContent = `atualizado ${relative(parseDb(current.updated_at))}`;
    }, 1000);

    return {
      live(result) {
        const current = sensorById(id);
        if (!current) { location.hash = '#/'; return; }
        const st = sensorState(current);
        $('[data-detail-chip]', main).innerHTML = stateChip(st);
        animateNumber($('[data-current]', main), Number(current.current_temperature));
        updateGauge(gaugeRoot, { ...current, target_temperature: pendingTarget });
        renderControl(current);
        renderStockRisk(current);
        const reading = result?.readings?.[current.id];
        if (reading && range === '1h') {
          chart.append(reading, current, 3600000);
          if (history) {
            history.readings.push(reading);
            history.total = (history.total ?? 0) + 1;
            const values = history.readings.map(r => Number(r.temperature));
            history.minimum = Math.min(history.minimum ?? Infinity, Number(reading.temperature));
            history.maximum = Math.max(history.maximum ?? -Infinity, Number(reading.temperature));
            history.average = values.reduce((a, b) => a + b, 0) / values.length;
            renderStats();
          }
        }
        // Equipamento ligou/desligou ou um alerta abriu/fechou: mostra o evento já
        if (isOn(current.equipment_on) !== lastEquipment || (st === 'alert') !== lastAlert) {
          lastEquipment = isOn(current.equipment_on);
          lastAlert = st === 'alert';
          loadEvents();
        } else {
          loadEventsThrottled();
        }
      },
      redraw() { chart.draw(); },
      inventory() { renderStock(); },
      destroy() { chart.destroy(); clearInterval(updatedTimer); },
    };

    function loadEventsThrottled() {
      const now = Date.now();
      if (now - (loadEventsThrottled.last || 0) < 15000) return;
      loadEventsThrottled.last = now;
      loadEvents();
    }
  }

  async function exportCsv(sensor, range) {
    try {
      const history = await api('history', { params: { sensor_id: sensor.id, range } });
      if (!history.readings.length) { toast('Não há leituras neste período.', { type: 'warn' }); return; }
      const rows = [['Data e hora', 'Temperatura (°C)', 'Status']].concat(history.readings.map(reading => [
        parseDb(reading.recorded_at)?.toLocaleString('pt-BR') ?? reading.recorded_at,
        Number(reading.temperature).toFixed(1).replace('.', ','),
        STATE_LABEL[reading.temperature_state] || reading.temperature_state,
      ]));
      const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\r\n');
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
      link.download = `tempic-${sensor.name.normalize('NFD').replace(/[^\w]+/g, '-').toLowerCase()}-${range}.csv`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      toast(`${history.readings.length.toLocaleString('pt-BR')} leituras exportadas.`, { type: 'success', title: 'Relatório CSV' });
    } catch (error) {
      toast(error.message, { type: 'warn' });
    }
  }

  // ==========================================
  // ILUMINAÇÃO
  // ==========================================

  function minutesOf(time) {
    const [h, m] = String(time).split(':').map(Number);
    return h * 60 + m;
  }

  function scheduleBar(onTime, offTime, enabled) {
    const on = minutesOf(onTime) / 14.4;
    const off = minutesOf(offTime) / 14.4;
    const segments = on < off ? [[on, off]] : [[0, off], [on, 100]];
    const now = new Date();
    const nowPct = (now.getHours() * 60 + now.getMinutes()) / 14.4;
    return `
      <div class="tp-schedule ${enabled ? '' : 'is-disabled'}" aria-hidden="true">
        <div class="tp-schedule-track">${segments.map(([a, b]) => `<span style="left:${a}%;width:${b - a}%"></span>`).join('')}<i style="left:${nowPct}%"></i></div>
        <div class="tp-schedule-scale"><span>00h</span><span>06h</span><span>12h</span><span>18h</span><span>24h</span></div>
      </div>`;
  }

  function viewLights(main) {
    const manage = can('lights.manage');
    const render = () => {
      main.innerHTML = `
        <section class="tp-hello">
          <div><span class="tp-kicker">RF03 · iluminação do estacionamento</span><h2>Iluminação</h2><p>Acenda e apague à distância ou programe por horário — inclusive janelas que passam da meia-noite.</p></div>
        </section>
        ${manage ? `<form class="tp-card tp-inline-form" data-light-add novalidate>
          <label for="lightName" class="tp-sr">Nome do novo circuito</label>
          <input id="lightName" name="name" minlength="2" maxlength="80" placeholder="Novo circuito, ex.: Estacionamento lateral" required autocomplete="off">
          <button type="submit" class="tp-btn tp-btn-primary"><i class="fa-solid fa-plus" aria-hidden="true"></i> Adicionar</button>
        </form>` : '<p class="tp-role-note"><i class="fa-solid fa-lock" aria-hidden="true"></i> Você vê o estado da iluminação em tempo real. Acender, apagar e programar fica com o administrador.</p>'}
        <div class="tp-light-grid">
          ${state.lights.length ? state.lights.map(light => {
            const on = isOn(light.is_on);
            const scheduled = isOn(light.schedule_enabled);
            const next = nextLightChange(light);
            const lid = Number(light.id);
            return `
              <article class="tp-card tp-light ${on ? 'is-on' : ''}" data-light="${lid}">
                <div class="tp-light-head">
                  <span class="tp-bulb" aria-hidden="true"><i class="fa-solid fa-lightbulb"></i></span>
                  <div><h3>${esc(light.name)}</h3><small>${on ? 'Acesa' : 'Apagada'}${next ? ` · ${next.verb} às ${esc(next.time)}` : ''}</small></div>
                  <button type="button" class="tp-switch-btn" role="switch" aria-checked="${on}" data-light-toggle aria-label="${on ? 'Apagar' : 'Acender'} ${esc(light.name)}"${lockAttr('lights.manage')}><span class="tp-switch"><span></span></span></button>
                </div>
                ${scheduleBar(light.on_time, light.off_time, scheduled)}
                ${manage ? '' : `<p class="tp-hint">${scheduled ? `Programado: acende às ${esc(light.on_time)} e apaga às ${esc(light.off_time)}.` : 'Sem programação de horário.'}</p>`}
                <form class="tp-light-form" data-light-form ${manage ? '' : 'hidden'}>
                  <label class="tp-check"><input type="checkbox" name="enabled" ${scheduled ? 'checked' : ''}> Programar</label>
                  <label>Acende <input type="time" name="on_time" value="${esc(light.on_time)}" required></label>
                  <label>Apaga <input type="time" name="off_time" value="${esc(light.off_time)}" required></label>
                  <button type="submit" class="tp-btn tp-btn-ghost tp-btn-sm">Salvar</button>
                  <button type="button" class="tp-icon-btn tp-icon-btn-sm" data-light-delete aria-label="Remover ${esc(light.name)}" title="Remover"><i class="fa-regular fa-trash-can" aria-hidden="true"></i></button>
                </form>
              </article>`;
          }).join('') : '<p class="tp-empty-note">Nenhum circuito ainda. Adicione o primeiro acima.</p>'}
        </div>`;
    };

    render();

    main.addEventListener('input', event => {
      const form = event.target.closest('[data-light-form]');
      if (!form) return;
      form.dataset.dirty = 'true';
      const card = form.closest('[data-light]');
      card.querySelector('.tp-schedule').outerHTML = scheduleBar(form.elements.on_time.value || '00:00', form.elements.off_time.value || '00:00', form.elements.enabled.checked);
    });

    main.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.target;
      try {
        if (form.matches('[data-light-add]')) {
          if (!form.checkValidity()) { form.reportValidity(); return; }
          await api('light', { method: 'POST', data: { name: form.elements.name.value.trim() } });
          toast('Circuito adicionado.', { type: 'success' });
        } else if (form.matches('[data-light-form]')) {
          const result = await api('light-schedule', {
            method: 'POST',
            data: { light_id: Number(form.closest('[data-light]').dataset.light), enabled: form.elements.enabled.checked, on_time: form.elements.on_time.value, off_time: form.elements.off_time.value },
          });
          toast(result.message, { type: 'success' });
        }
        await refreshLights();
        render();
      } catch (error) { toast(error.message, { type: 'warn' }); }
    });

    main.addEventListener('click', async event => {
      const card = event.target.closest('[data-light]');
      if (!card) return;
      const light = state.lights.find(item => String(item.id) === card.dataset.light);
      try {
        if (event.target.closest('[data-light-toggle]')) {
          card.classList.toggle('is-on');
          await api('light-toggle', { method: 'POST', data: { light_id: light.id, on: !isOn(light.is_on) } });
        } else if (event.target.closest('[data-light-delete]')) {
          const ok = await confirmDialog({ title: `Remover ${light.name}?`, body: 'A programação e o histórico de acionamentos deste circuito serão apagados.', confirmLabel: 'Remover', danger: true });
          if (!ok) return;
          await api('light-delete', { method: 'POST', data: { light_id: light.id } });
          toast('Circuito removido.', { type: 'success' });
        } else {
          return;
        }
        await refreshLights();
        render();
      } catch (error) { toast(error.message, { type: 'warn' }); render(); }
    });

    // A programação é conferida no servidor; atualiza se nada estiver sendo editado
    const timer = setInterval(async () => {
      if (main.querySelector('[data-dirty]') || main.contains(document.activeElement)) return;
      await refreshLights().catch(() => {});
      render();
    }, 30000);

    return { destroy() { clearInterval(timer); } };
  }

  // ==========================================
  // ATIVIDADE
  // ==========================================

  function viewActivity(main) {
    let filter = 'all';
    let data = null;

    const describe = item => {
      if (item.kind === 'alert') {
        const alert = item.raw;
        const sensor = sensorById(alert.sensor_id);
        const ack = alert.acknowledged_at ? ` · <i class="fa-solid fa-user-check" aria-hidden="true"></i> ciente: ${esc(alert.acknowledged_by_name || 'ex-membro')}` : '';
        const action = !alert.resolved_at && !alert.acknowledged_at && can('alerts.acknowledge')
          ? `<button type="button" class="tp-btn tp-btn-ghost tp-btn-sm" data-ack="${Number(alert.id)}"><i class="fa-solid fa-hand" aria-hidden="true"></i> Estou ciente</button>`
          : '';
        return { icon: 'fa-triangle-exclamation', cls: alert.resolved_at ? 'is-resolved' : 'is-alert', title: alert.message, meta: `${sensor ? esc(sensor.name) : 'Sensor removido'} · ${alert.resolved_at ? 'resolvido' : 'ativo'}${ack}`, action };
      }
      const event = item.raw;
      const origins = { manual: 'manual', automatico: 'automático', programado: 'programado' };
      const target = event.device === 'iluminacao' ? (event.light_name || 'Iluminação') : (event.sensor_name || 'Sensor');
      const title = String(event.action).startsWith('modo')
        ? `Controle alterado para ${event.action}`
        : `${event.device === 'iluminacao' ? 'Iluminação' : 'Refrigeração'} ${event.action}`;
      return { icon: event.device === 'iluminacao' ? 'fa-lightbulb' : 'fa-snowflake', cls: `is-${event.origin}`, title, meta: `${esc(target)} · ${origins[event.origin] || event.origin}` };
    };

    const render = () => {
      const items = data ? [
        ...data.alerts.map(raw => ({ kind: 'alert', raw, date: parseDb(raw.created_at) })),
        ...data.events.map(raw => ({ kind: 'event', raw, date: parseDb(raw.created_at) })),
      ].filter(item => filter === 'all' || (filter === 'alerts' ? item.kind === 'alert' : item.kind === 'event'))
        .sort((a, b) => b.date - a.date) : [];

      let lastDay = '';
      const list = items.map(item => {
        const day = dayLabel(item.date);
        const header = day !== lastDay ? `<li class="tp-feed-day">${esc(day)}</li>` : '';
        lastDay = day;
        const info = describe(item);
        return `${header}<li class="tp-feed-item ${info.cls}"><span class="tp-feed-icon"><i class="fa-solid ${info.icon}" aria-hidden="true"></i></span><div><strong>${esc(info.title)}</strong><small>${info.meta}</small></div>${info.action || ''}<time datetime="${item.date?.toISOString() ?? ''}">${timeOf(item.date)}</time></li>`;
      }).join('');

      const notifyGranted = 'Notification' in window && Notification.permission === 'granted';
      main.innerHTML = `
        <section class="tp-hello">
          <div><span class="tp-kicker">RF04 · alertas e acionamentos</span><h2>Atividade</h2><p>Tudo o que aconteceu na operação: alertas de temperatura e cada acionamento manual, automático ou programado. Marque “ciente” para a equipe saber que alguém está cuidando.</p></div>
          ${'Notification' in window ? `<button type="button" class="tp-btn tp-btn-ghost" data-notify ${notifyGranted ? 'disabled' : ''}><i class="fa-${notifyGranted ? 'solid' : 'regular'} fa-bell" aria-hidden="true"></i> ${notifyGranted ? 'Notificações ativas' : 'Ativar notificações'}</button>` : ''}
        </section>
        <div class="tp-pills tp-pills-lg" role="radiogroup" aria-label="Filtrar atividade">
          ${[['all', 'Tudo'], ['alerts', 'Alertas'], ['events', 'Acionamentos']].map(([key, label]) => `<button type="button" role="radio" data-filter="${key}" aria-checked="${key === filter}">${label}</button>`).join('')}
        </div>
        <ol class="tp-feed tp-card">${data ? (list || '<li class="tp-timeline-empty">Nada por aqui ainda.</li>') : '<li class="tp-skeleton"></li><li class="tp-skeleton"></li><li class="tp-skeleton"></li>'}</ol>`;
    };

    const load = async () => {
      try { data = await api('activity'); } catch (error) { toast(error.message, { type: 'warn' }); }
      render();
    };

    main.addEventListener('click', async event => {
      const pill = event.target.closest('[data-filter]');
      if (pill) { filter = pill.dataset.filter; render(); return; }
      const ack = event.target.closest('[data-ack]');
      if (ack) {
        ack.disabled = true;
        try {
          const result = await api('alert-ack', { method: 'POST', data: { alert_id: Number(ack.dataset.ack) } });
          toast(result.message, { type: 'success' });
        } catch (error) { toast(error.message, { type: 'warn' }); }
        load();
        return;
      }
      if (event.target.closest('[data-notify]')) {
        const permission = await Notification.requestPermission();
        toast(permission === 'granted' ? 'Você será avisado quando um sensor sair da faixa segura.' : 'O navegador bloqueou as notificações. Os alertas continuam aparecendo aqui.', { type: permission === 'granted' ? 'success' : 'warn' });
        render();
      }
    });

    render();
    load();
    let last = Date.now();
    return {
      live() {
        if (Date.now() - last < 10000) return;
        last = Date.now();
        load();
      },
    };
  }

  // ==========================================
  // INVENTÁRIO (todos os equipamentos)
  // ==========================================

  function viewInventory(main) {
    const writable = can('inventory.write');
    let filter = 'all';
    let category = '';
    let query = '';

    main.innerHTML = `
      <section class="tp-hello">
        <div><span class="tp-kicker">Inventário · cadeia de frio</span><h2>O que está guardado</h2>
        <p>Cada item sabe onde está, quando vence e quanto tempo passou fora da faixa segura. A lista segue o FEFO: o que vence primeiro aparece primeiro.</p></div>
        ${writable ? '<button type="button" class="tp-btn tp-btn-ghost" data-action="add-item"><i class="fa-solid fa-list-check" aria-hidden="true"></i> Formulário completo</button>' : ''}
      </section>
      ${writable ? `
      <form class="tp-card tp-quick" data-quick novalidate>
        <label class="tp-quick-input">
          <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
          <span class="tp-sr">Guardar item escrevendo uma frase</span>
          <input name="text" autocomplete="off" maxlength="160" placeholder="Escreva como falaria: “2 kg de frango no freezer p2”" aria-describedby="quickPreview">
          <button type="submit" class="tp-btn tp-btn-primary tp-btn-sm">Guardar</button>
        </label>
        <div class="tp-quick-preview" id="quickPreview" data-quick-preview aria-live="polite"></div>
      </form>` : '<p class="tp-role-note"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Você pode consultar tudo o que está guardado. Para guardar ou retirar itens, peça acesso ao administrador.</p>'}
      <section class="tp-kpis" aria-label="Resumo do inventário" data-stock-kpis></section>
      <div class="tp-stock-toolbar">
        <label class="tp-search-field"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><span class="tp-sr">Buscar no inventário</span>
          <input type="search" placeholder="Buscar item, equipamento ou quem guardou" data-stock-search autocomplete="off"></label>
        <div class="tp-pills" role="radiogroup" aria-label="Filtrar por situação">
          ${[['all', 'Todos'], ['expiring', 'Vencendo'], ['expired', 'Vencidos'], ['risk', 'Em risco']].map(([key, label]) => `<button type="button" role="radio" data-stock-filter="${key}" aria-checked="${key === filter}">${label}</button>`).join('')}
        </div>
      </div>
      <div class="tp-cat-filter" data-cat-filter></div>
      <div class="tp-stock-groups" data-stock-groups></div>`;

    const matches = item => {
      if (filter === 'expiring' && item.expiry_status !== 'expiring') return false;
      if (filter === 'expired' && item.expiry_status !== 'expired') return false;
      if (filter === 'risk' && item.integrity === 'intact') return false;
      if (category && item.category !== category) return false;
      return !query || fold(`${item.name} ${item.sensor_name} ${item.stored_by_name || ''} ${categoryOf(item.category).label} ${item.notes}`).includes(query);
    };

    const row = item => `
      <li class="tp-stock-row is-${item.expiry_status} is-${item.integrity}" data-row="${Number(item.id)}" role="button" tabindex="0">
        <span class="tp-item-icon"><i class="fa-solid ${categoryOf(item.category).icon}" aria-hidden="true"></i></span>
        <div class="tp-stock-main"><strong>${esc(item.name)}</strong>
          <small>${esc(categoryOf(item.category).label)} · P${Number(item.shelf)} · guardado ${relative(parseDb(item.stored_at))}${item.stored_by_name ? ` por ${esc(item.stored_by_name.split(' ')[0])}` : ''}</small></div>
        <span class="tp-stock-qty">${qty(item.quantity, item.unit)}</span>
        <div class="tp-stock-badges">${expiryBadge(item)}${integrityBadge(item)}</div>
        ${writable ? `<button type="button" class="tp-btn tp-btn-ghost tp-btn-sm" data-row-withdraw="${Number(item.id)}">Retirar</button>` : ''}
      </li>`;

    const render = () => {
      const summary = state.inventory || { total: 0, expiring: 0, expired: 0, at_risk: 0 };
      $('[data-stock-kpis]', main).innerHTML = [
        ['fa-boxes-stacked', 'Itens guardados', summary.total, ''],
        ['fa-hourglass-half', 'Vencem em até 3 dias', summary.expiring, summary.expiring ? 'is-attention' : ''],
        ['fa-calendar-xmark', 'Vencidos', summary.expired, summary.expired ? 'is-alert' : ''],
        ['fa-temperature-arrow-up', 'Expostos fora da faixa', summary.at_risk, summary.at_risk ? 'is-alert' : ''],
      ].map(([icon, label, value, cls]) => `<article class="tp-kpi ${cls}"><span class="tp-kpi-icon"><i class="fa-solid ${icon}" aria-hidden="true"></i></span><div><span class="tp-kpi-label">${label}</span><strong>${value}</strong></div></article>`).join('');

      const present = [...new Set(state.items.map(item => item.category))];
      $('[data-cat-filter]', main).innerHTML = present.length > 1 ? [['', 'Todas', 'fa-layer-group'], ...present.map(id => [id, categoryOf(id).label, categoryOf(id).icon])]
        .map(([id, label, icon]) => `<button type="button" class="tp-cat-chip" data-cat="${id}" aria-pressed="${id === category}"><i class="fa-solid ${icon}" aria-hidden="true"></i> ${esc(label)}</button>`).join('') : '';

      const visible = state.items.filter(matches);
      const groups = state.sensors.map(sensor => ({ sensor, items: visible.filter(item => String(item.sensor_id) === String(sensor.id)) })).filter(group => group.items.length);
      $('[data-stock-groups]', main).innerHTML = groups.length ? groups.map(({ sensor, items }) => `
        <section class="tp-card tp-stock-group" data-state="${sensorState(sensor)}">
          <a class="tp-stock-group-head" href="#/sensor/${Number(sensor.id)}">
            <span class="tp-sensor-icon"><i class="fa-solid ${typeOf(sensor).icon}" aria-hidden="true"></i></span>
            <div><strong>${esc(sensor.name)}</strong><small>${esc(sensor.location)} · ${items.length} ${items.length === 1 ? 'item' : 'itens'}</small></div>
            <span class="tp-stock-group-temp">${temp(sensor.current_temperature)}</span>${stateChip(sensorState(sensor))}
          </a>
          <ul class="tp-stock-list">${items.map(row).join('')}</ul>
        </section>`).join('') : `
        <div class="tp-empty tp-empty-sm">
          <div class="tp-empty-art" aria-hidden="true"><i class="fa-solid fa-box-open"></i></div>
          <h2>${state.items.length ? 'Nada com esse filtro' : 'Nenhum item guardado ainda'}</h2>
          <p>${state.items.length ? 'Tente outra busca ou situação.' : writable ? 'Escreva uma frase no campo acima, como “12 sorvetes no freezer”.' : 'Quando a equipe guardar itens, eles aparecem aqui.'}</p>
        </div>`;
    };

    // Prévia do que a frase digitada vai virar
    const renderQuick = () => {
      const box = $('[data-quick-preview]', main);
      const text = $('[data-quick] input', main)?.value.trim() || '';
      if (!box) return null;
      if (!text) {
        box.innerHTML = '<span class="tp-hint">Reconheço quantidade, unidade, categoria, equipamento (“no freezer”), prateleira (“p2”) e validade (“vence em 10 dias”).</span>';
        return null;
      }
      const parsed = parseItemText(text);
      const sensor = parsed.sensorId ? sensorById(parsed.sensorId) : null;
      const cat = parsed.category ? categoryOf(parsed.category) : null;
      const expiry = parsed.days !== null ? `vence em ${parsed.days} d` : (cat && sensor ? (() => { const s = suggestExpiry(parsed.category, sensor); return s.days === null ? 'sem validade' : `validade sugerida ${s.days} d`; })() : null);
      const chip = (ok, icon, label) => `<span class="tp-parse ${ok ? '' : 'is-missing'}"><i class="fa-solid ${icon}" aria-hidden="true"></i>${label}</span>`;
      box.innerHTML = [
        chip(Boolean(parsed.name), 'fa-tag', esc(parsed.name || 'nome?')),
        chip(Boolean(cat), cat?.icon || 'fa-circle-question', cat ? esc(cat.label) : 'categoria?'),
        chip(true, 'fa-scale-balanced', qty(parsed.quantity ?? 1, parsed.unit || 'un')),
        chip(Boolean(sensor), sensor ? typeOf(sensor).icon : 'fa-location-dot', sensor ? `${esc(sensor.name)} · P${parsed.shelf || 1}` : 'onde? (“no freezer”)'),
        expiry ? chip(true, 'fa-calendar', expiry) : '',
        sensor && cat && !compatible(parsed.category, sensor) ? chip(false, 'fa-triangle-exclamation', `${esc(cat.label)} não combinam com este equipamento`) : '',
      ].join('');
      return { parsed, sensor };
    };

    main.addEventListener('input', event => {
      if (event.target.matches('[data-stock-search]')) { query = fold(event.target.value.trim()); render(); }
      if (event.target.closest('[data-quick]')) renderQuick();
    });

    main.addEventListener('submit', async event => {
      if (!event.target.matches('[data-quick]')) return;
      event.preventDefault();
      const form = event.target;
      const result = renderQuick();
      if (!result || !result.parsed.name) return;
      const { parsed, sensor } = result;
      const prefill = { name: parsed.name, category: parsed.category, quantity: parsed.quantity ?? 1, unit: parsed.unit || 'un' };
      if (parsed.days !== null) { const date = new Date(); date.setDate(date.getDate() + parsed.days); prefill.expires_at = isoDate(date); }
      // Faltou algo essencial: abre o formulário já preenchido em vez de adivinhar
      if (!sensor || !parsed.category) {
        openItemForm({ sensorId: sensor?.id, shelf: parsed.shelf || 1, prefill });
        return;
      }
      const data = { ...prefill, sensor_id: sensor.id, shelf: parsed.shelf || 1, notes: '' };
      if (!('expires_at' in prefill)) delete data.expires_at;
      try {
        const response = await postItem('item', data);
        if (!response) return;
        form.reset();
        renderQuick();
        await afterInventoryChange(response.message);
      } catch (error) { toast(error.message, { type: 'warn' }); }
    });

    const openRow = id => { const item = state.items.find(entry => String(entry.id) === String(id)); if (item) openItem(item); };
    main.addEventListener('click', event => {
      const withdraw = event.target.closest('[data-row-withdraw]');
      if (withdraw) { const item = state.items.find(entry => String(entry.id) === withdraw.dataset.rowWithdraw); if (item) openWithdraw(item); return; }
      const rowElement = event.target.closest('[data-row]');
      if (rowElement) { openRow(rowElement.dataset.row); return; }
      const pill = event.target.closest('[data-stock-filter]');
      if (pill) {
        filter = pill.dataset.stockFilter;
        $$('[data-stock-filter]', main).forEach(button => button.setAttribute('aria-checked', String(button === pill)));
        render();
        return;
      }
      const cat = event.target.closest('[data-cat]');
      if (cat) { category = cat.dataset.cat; render(); }
    });
    main.addEventListener('keydown', event => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-row]')) { event.preventDefault(); openRow(event.target.dataset.row); }
    });

    render();
    renderQuick();
    refreshItems().then(render).catch(() => {});

    return {
      inventory() { render(); },
      live() {
        // Temperatura e estado de cada grupo acompanham a leitura ao vivo
        $$('.tp-stock-group', main).forEach(group => {
          const id = group.querySelector('a')?.getAttribute('href')?.split('/').pop();
          const sensor = sensorById(id);
          if (!sensor) return;
          group.dataset.state = sensorState(sensor);
          group.querySelector('.tp-stock-group-temp').textContent = temp(sensor.current_temperature);
          group.querySelector('[data-state-chip]').outerHTML = stateChip(sensorState(sensor));
        });
      },
    };
  }

  // ==========================================
  // ADMINISTRAÇÃO: equipe, convites, permissões e auditoria
  // ==========================================

  const AUDIT_KINDS = {
    all: { label: 'Tudo', match: () => true },
    devices: { label: 'Equipamentos', match: action => /^(sensor|equipment|light|simulation)\./.test(action) },
    stock: { label: 'Inventário', match: action => action.startsWith('item.') },
    team: { label: 'Equipe e alertas', match: action => /^(team|alert)\./.test(action) },
  };
  const AUDIT_ICON = { sensor: 'fa-microchip', equipment: 'fa-snowflake', light: 'fa-lightbulb', simulation: 'fa-flask', item: 'fa-box', team: 'fa-users', alert: 'fa-bell' };

  function untilLabel(date) {
    if (!date) return '—';
    const minutes = Math.round((date.getTime() - Date.now()) / 60000);
    if (minutes < 60) return `expira em ${Math.max(1, minutes)} min`;
    if (minutes < 1440) return `expira em ${Math.round(minutes / 60)} h`;
    return `expira em ${Math.round(minutes / 1440)} d`;
  }

  async function copyText(text, message) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      const area = Object.assign(document.createElement('textarea'), { value: text });
      document.body.append(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    toast(message, { type: 'success' });
  }

  function setPreview(on) {
    state.preview = on;
    applyAccess(state.access);
    toast(on ? 'Agora você vê o painel como um membro. Use “Sair da prévia” para voltar.' : 'Você voltou para a visão de administrador.', { type: 'info' });
    location.hash = on ? '#/' : '#/admin';
    route();
  }

  function viewAdmin(main) {
    if (!can('team.manage')) {
      main.innerHTML = `<section class="tp-empty"><div class="tp-empty-art" aria-hidden="true"><i class="fa-solid fa-lock"></i></div><h2>Área do administrador</h2><p>Você é membro deste espaço: acompanha tudo e recebe os alertas, mas a equipe e as configurações ficam com o administrador.</p><a class="tp-btn tp-btn-primary" href="#/">Voltar à visão geral</a></section>`;
      return {};
    }

    let team = null;
    let audit = [];
    let alerts = [];
    let lastInvite = null;
    let kind = 'all';
    let actor = '';
    let search = '';
    let inviteRole = 'member';

    main.innerHTML = `
      <section class="tp-hello">
        <div><span class="tp-kicker">Administração</span><h2>${esc(state.access.workspace.name)}</h2>
        <p>Gerencie quem acessa, o que cada papel pode fazer e acompanhe tudo o que foi alterado.</p></div>
        <div class="tp-hello-actions">
          <button type="button" class="tp-btn tp-btn-ghost" data-preview><i class="fa-solid fa-eye" aria-hidden="true"></i> Ver como membro</button>
        </div>
      </section>
      <section class="tp-kpis" aria-label="Indicadores da equipe" data-admin-kpis></section>
      <div class="tp-admin-grid">
        <section class="tp-card tp-admin-team" aria-labelledby="teamTitle">
          <div class="tp-card-head"><h3 id="teamTitle"><i class="fa-solid fa-users" aria-hidden="true"></i> Equipe</h3><span class="tp-muted" data-team-count></span></div>
          <ul class="tp-members" data-members><li class="tp-skeleton"></li><li class="tp-skeleton"></li></ul>
        </section>

        <section class="tp-card tp-admin-invite" aria-labelledby="inviteTitle">
          <div class="tp-card-head"><h3 id="inviteTitle"><i class="fa-solid fa-ticket" aria-hidden="true"></i> Convidar</h3></div>
          <form class="tp-invite-form" data-invite-form>
            <div class="tp-pills tp-pills-block" role="radiogroup" aria-label="Papel do convidado">
              <button type="button" role="radio" data-invite-role="member" aria-checked="true"><i class="fa-solid fa-user" aria-hidden="true"></i> Membro</button>
              <button type="button" role="radio" data-invite-role="admin" aria-checked="false"><i class="fa-solid fa-user-shield" aria-hidden="true"></i> Administrador</button>
            </div>
            <p class="tp-hint" data-invite-hint></p>
            <div class="tp-invite-row">
              <label class="tp-field"><span class="tp-label">Válido por</span>
                <select name="days"><option value="1">1 dia</option><option value="7" selected>7 dias</option><option value="30">30 dias</option></select></label>
              <button type="submit" class="tp-btn tp-btn-primary"><i class="fa-solid fa-plus" aria-hidden="true"></i> Gerar convite</button>
            </div>
          </form>
          <div data-ticket></div>
          <ul class="tp-invites" data-invites></ul>
        </section>

        <section class="tp-card tp-admin-matrix" aria-labelledby="matrixTitle">
          <div class="tp-card-head"><h3 id="matrixTitle"><i class="fa-solid fa-table-cells" aria-hidden="true"></i> O que cada papel pode fazer</h3></div>
          <div class="tp-matrix-wrap" data-matrix></div>
        </section>

        <section class="tp-card tp-admin-audit" aria-labelledby="auditTitle">
          <div class="tp-card-head">
            <h3 id="auditTitle"><i class="fa-solid fa-clipboard-list" aria-hidden="true"></i> Auditoria</h3>
            <button type="button" class="tp-icon-btn" data-audit-export aria-label="Exportar auditoria em CSV" title="Exportar CSV"><i class="fa-solid fa-file-arrow-down" aria-hidden="true"></i></button>
          </div>
          <div class="tp-audit-tools">
            <div class="tp-pills" role="radiogroup" aria-label="Tipo de registro">
              ${Object.entries(AUDIT_KINDS).map(([key, value]) => `<button type="button" role="radio" data-kind="${key}" aria-checked="${key === kind}">${value.label}</button>`).join('')}
            </div>
            <select data-actor aria-label="Filtrar por pessoa"><option value="">Todas as pessoas</option></select>
            <label class="tp-search-field"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><span class="tp-sr">Buscar na auditoria</span><input type="search" data-audit-search placeholder="Buscar" autocomplete="off"></label>
          </div>
          <ol class="tp-feed tp-audit-feed" data-audit><li class="tp-skeleton"></li><li class="tp-skeleton"></li></ol>
        </section>
      </div>`;

    const online = member => { const seen = parseDb(member.last_seen_at); return seen && Date.now() - seen.getTime() < 120000; };

    const renderKpis = () => {
      const members = team?.members || [];
      const unattended = alerts.filter(alert => !alert.resolved_at && !alert.acknowledged_at).length;
      $('[data-admin-kpis]', main).innerHTML = [
        ['fa-users', 'Pessoas na equipe', members.length, ''],
        ['fa-signal', 'Online agora', members.filter(online).length, ''],
        ['fa-bell', 'Alertas sem responsável', unattended, unattended ? 'is-alert' : ''],
        ['fa-temperature-arrow-up', 'Itens expostos', state.inventory?.at_risk ?? 0, state.inventory?.at_risk ? 'is-alert' : ''],
      ].map(([icon, label, value, cls]) => `<article class="tp-kpi ${cls}"><span class="tp-kpi-icon"><i class="fa-solid ${icon}" aria-hidden="true"></i></span><div><span class="tp-kpi-label">${label}</span><strong>${value}</strong></div></article>`).join('');
    };

    const renderTeam = () => {
      if (!team) return;
      $('[data-team-count]', main).textContent = `${team.members.length} ${team.members.length === 1 ? 'pessoa' : 'pessoas'}`;
      $('[data-members]', main).innerHTML = team.members.map(member => {
        const self = Number(member.id) === Number(state.user.id);
        const owner = Number(member.is_owner) === 1;
        const locked = self || owner;
        const seen = online(member) ? '<span class="tp-online">online</span>' : `visto ${relative(parseDb(member.last_seen_at))}`;
        return `
          <li class="tp-member" data-member="${Number(member.id)}">
            <span class="tp-avatar" aria-hidden="true">${esc((member.name || '?').charAt(0).toUpperCase())}</span>
            <div class="tp-member-text"><strong>${esc(member.name)}${self ? ' <em>você</em>' : ''}${owner ? ' <em>dono</em>' : ''}</strong><small>${esc(member.email)} · ${member.last_seen_at ? seen : 'nunca entrou'}</small></div>
            <select data-member-role aria-label="Papel de ${esc(member.name)}" ${locked ? 'disabled title="O dono e você mesmo não podem ter o papel alterado aqui."' : ''}>
              ${Object.entries(team.roles).map(([role, label]) => `<option value="${role}" ${role === member.role ? 'selected' : ''}>${esc(label)}</option>`).join('')}
            </select>
            ${locked ? '<span class="tp-member-spacer"></span>' : `<button type="button" class="tp-icon-btn tp-icon-btn-sm" data-member-remove aria-label="Remover ${esc(member.name)}" title="Remover da equipe"><i class="fa-solid fa-user-minus" aria-hidden="true"></i></button>`}
          </li>`;
      }).join('');

      $('[data-invites]', main).innerHTML = team.invites.length ? `<li class="tp-invites-title">Convites ativos</li>${team.invites.map(invite => `
        <li class="tp-invite" data-invite="${Number(invite.id)}">
          <code>${esc(invite.code)}</code><span class="tp-chip tp-chip-ghost">${esc(team.roles[invite.role])}</span>
          <small>${untilLabel(parseDb(invite.expires_at))}</small>
          <button type="button" class="tp-icon-btn tp-icon-btn-sm" data-invite-copy="${esc(invite.code)}" aria-label="Copiar link do convite" title="Copiar link"><i class="fa-solid fa-link" aria-hidden="true"></i></button>
          <button type="button" class="tp-icon-btn tp-icon-btn-sm" data-invite-revoke aria-label="Revogar convite" title="Revogar"><i class="fa-solid fa-ban" aria-hidden="true"></i></button>
        </li>`).join('')}` : '';

      const roles = Object.keys(team.roles);
      $('[data-matrix]', main).innerHTML = `
        <table class="tp-matrix">
          <thead><tr><th scope="col">Permissão</th>${roles.map(role => `<th scope="col">${esc(team.roles[role])}</th>`).join('')}</tr></thead>
          <tbody>${Object.entries(team.permissions).map(([permission, label]) => `
            <tr><th scope="row">${esc(label)}</th>${roles.map(role => team.matrix[role][permission]
              ? '<td class="is-yes"><i class="fa-solid fa-check" aria-hidden="true"></i><span class="tp-sr">sim</span></td>'
              : '<td class="is-no"><i class="fa-solid fa-lock" aria-hidden="true"></i><span class="tp-sr">não</span></td>').join('')}</tr>`).join('')}
          </tbody>
        </table>`;
      renderKpis();
    };

    const renderInviteHint = () => {
      $$('[data-invite-role]', main).forEach(button => button.setAttribute('aria-checked', String(button.dataset.inviteRole === inviteRole)));
      $('[data-invite-hint]', main).textContent = inviteRole === 'admin'
        ? 'Administradores fazem tudo: configuram sensores, acionam equipamentos, gerenciam a equipe e veem a auditoria.'
        : 'Membros acompanham em tempo real, recebem alertas, marcam “ciente” e guardam/retiram itens. Não alteram configurações.';
    };

    const renderTicket = () => {
      if (!lastInvite) { $('[data-ticket]', main).innerHTML = ''; return; }
      const link = `${location.origin}${location.pathname}?convite=${encodeURIComponent(lastInvite.code)}`;
      $('[data-ticket]', main).innerHTML = `
        <div class="tp-ticket">
          <span class="tp-ticket-label">Código para ${esc(team?.roles?.[lastInvite.role] || lastInvite.role)}</span>
          <strong class="tp-ticket-code">${esc(lastInvite.code)}</strong>
          <small>${untilLabel(parseDb(lastInvite.expires_at))} · uso único</small>
          <div class="tp-ticket-actions">
            <button type="button" class="tp-btn tp-btn-ghost tp-btn-sm" data-copy-code><i class="fa-regular fa-copy" aria-hidden="true"></i> Copiar código</button>
            <button type="button" class="tp-btn tp-btn-primary tp-btn-sm" data-copy-link="${esc(link)}"><i class="fa-solid fa-link" aria-hidden="true"></i> Copiar link</button>
          </div>
        </div>`;
    };

    const renderAudit = () => {
      const select = $('[data-actor]', main);
      const names = [...new Set(audit.map(entry => entry.actor_name).filter(Boolean))].sort();
      if (select.options.length - 1 !== names.length) {
        select.innerHTML = `<option value="">Todas as pessoas</option>${names.map(name => `<option ${name === actor ? 'selected' : ''}>${esc(name)}</option>`).join('')}`;
      }
      const visible = audit.filter(entry => AUDIT_KINDS[kind].match(entry.action)
        && (!actor || entry.actor_name === actor)
        && (!search || fold(`${entry.summary} ${entry.actor_name || ''}`).includes(search)));
      let lastDay = '';
      $('[data-audit]', main).innerHTML = visible.length ? visible.map(entry => {
        const date = parseDb(entry.created_at);
        const day = dayLabel(date);
        const header = day !== lastDay ? `<li class="tp-feed-day">${esc(day)}</li>` : '';
        lastDay = day;
        const icon = AUDIT_ICON[entry.action.split('.')[0]] || 'fa-circle';
        return `${header}<li class="tp-feed-item"><span class="tp-feed-icon"><i class="fa-solid ${icon}" aria-hidden="true"></i></span><div><strong>${esc(entry.summary)}</strong><small>${esc(entry.actor_name || 'Conta removida')}</small></div><time datetime="${date?.toISOString() ?? ''}">${timeOf(date)}</time></li>`;
      }).join('') : '<li class="tp-timeline-empty">Nenhum registro com esse filtro.</li>';
    };

    const load = async () => {
      try {
        [team, { entries: audit }, { alerts }] = await Promise.all([api('team'), api('audit'), api('alerts')]);
        renderTeam();
        renderTicket();
        renderAudit();
      } catch (error) { toast(error.message, { type: 'warn' }); }
    };

    main.addEventListener('click', async event => {
      const target = event.target;
      if (target.closest('[data-preview]')) { setPreview(true); return; }
      const roleButton = target.closest('[data-invite-role]');
      if (roleButton) { inviteRole = roleButton.dataset.inviteRole; renderInviteHint(); return; }
      if (target.closest('[data-copy-code]')) { copyText(lastInvite.code, 'Código copiado.'); return; }
      const link = target.closest('[data-copy-link]');
      if (link) { copyText(link.dataset.copyLink, 'Link do convite copiado. Quem abrir já cai no cadastro com o código preenchido.'); return; }
      const inviteCopy = target.closest('[data-invite-copy]');
      if (inviteCopy) { copyText(`${location.origin}${location.pathname}?convite=${encodeURIComponent(inviteCopy.dataset.inviteCopy)}`, 'Link do convite copiado.'); return; }
      const kindButton = target.closest('[data-kind]');
      if (kindButton) {
        kind = kindButton.dataset.kind;
        $$('[data-kind]', main).forEach(button => button.setAttribute('aria-checked', String(button === kindButton)));
        renderAudit();
        return;
      }
      if (target.closest('[data-audit-export]')) {
        const rows = [['Data e hora', 'Pessoa', 'Ação', 'Descrição']].concat(audit.map(entry => [parseDb(entry.created_at)?.toLocaleString('pt-BR') ?? entry.created_at, entry.actor_name || '', entry.action, entry.summary]));
        const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\r\n');
        const anchor = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })), download: 'tempic-auditoria.csv' });
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
        return;
      }

      const inviteRow = target.closest('[data-invite]');
      if (inviteRow && target.closest('[data-invite-revoke]')) {
        try {
          const result = await api('invite-revoke', { method: 'POST', data: { invite_id: Number(inviteRow.dataset.invite) } });
          if (lastInvite && String(lastInvite.id) === inviteRow.dataset.invite) lastInvite = null;
          toast(result.message, { type: 'success' });
          load();
        } catch (error) { toast(error.message, { type: 'warn' }); }
        return;
      }

      const memberRow = target.closest('[data-member]');
      if (memberRow && target.closest('[data-member-remove]')) {
        const member = team.members.find(entry => String(entry.id) === memberRow.dataset.member);
        const ok = await confirmDialog({ title: `Remover ${member.name}?`, body: 'A pessoa perde o acesso a este espaço na hora (inclusive com o painel aberto). O histórico dela na auditoria continua.', confirmLabel: 'Remover da equipe', danger: true });
        if (!ok) return;
        try {
          const result = await api('member-remove', { method: 'POST', data: { user_id: member.id } });
          toast(result.message, { type: 'success' });
          load();
        } catch (error) { toast(error.message, { type: 'warn' }); }
      }
    });

    main.addEventListener('change', async event => {
      if (event.target.matches('[data-actor]')) { actor = event.target.value; renderAudit(); return; }
      if (!event.target.matches('[data-member-role]')) return;
      const member = team.members.find(entry => String(entry.id) === event.target.closest('[data-member]').dataset.member);
      const role = event.target.value;
      const ok = await confirmDialog({
        title: `${member.name} vai virar ${team.roles[role]}?`,
        body: role === 'admin' ? 'Administradores podem alterar configurações, acionar equipamentos e gerenciar a equipe.' : 'A pessoa continua recebendo alertas, mas perde o acesso às configurações.',
        confirmLabel: 'Confirmar',
      });
      if (!ok) { event.target.value = member.role; return; }
      try {
        const result = await api('member-role', { method: 'POST', data: { user_id: member.id, role } });
        toast(result.message, { type: 'success' });
      } catch (error) { toast(error.message, { type: 'warn' }); }
      load();
    });

    main.addEventListener('input', event => {
      if (event.target.matches('[data-audit-search]')) { search = fold(event.target.value.trim()); renderAudit(); }
    });

    main.addEventListener('submit', async event => {
      if (!event.target.matches('[data-invite-form]')) return;
      event.preventDefault();
      try {
        const result = await api('invite', { method: 'POST', data: { role: inviteRole, days: Number(event.target.elements.days.value) } });
        lastInvite = result.invite;
        toast('Convite gerado. Mande o código ou o link para a pessoa.', { type: 'success' });
        load();
      } catch (error) { toast(error.message, { type: 'warn' }); }
    });

    renderInviteHint();
    load();
    let last = Date.now();
    return {
      inventory() { renderKpis(); },
      live() {
        // Presença e auditoria em quase tempo real, sem atrapalhar quem está digitando
        if (Date.now() - last < 15000 || main.contains(document.activeElement) && document.activeElement.matches('input, select')) return;
        last = Date.now();
        load();
      },
    };
  }

  // ==========================================
  // ROTEADOR
  // ==========================================

  function route() {
    if (!state.user) return;
    const hash = location.hash || '#/';
    const main = $('#tp-main');
    state.view?.destroy?.();
    // Nova <main> descarta os ouvintes da visão anterior
    const fresh = main.cloneNode(false);
    main.replaceWith(fresh);

    let match;
    if ((match = hash.match(/^#\/sensor\/(\d+)/))) {
      const sensor = sensorById(match[1]);
      $('#pageTitle').textContent = sensor?.name || 'Sensor';
      setActiveNav('overview');
      state.view = viewSensor(fresh, match[1]);
    } else if (hash.startsWith('#/inventory')) {
      $('#pageTitle').textContent = 'Inventário';
      setActiveNav('inventory');
      state.view = viewInventory(fresh);
    } else if (hash.startsWith('#/admin')) {
      $('#pageTitle').textContent = 'Administração';
      setActiveNav('admin');
      state.view = viewAdmin(fresh);
    } else if (hash.startsWith('#/lights')) {
      $('#pageTitle').textContent = 'Iluminação';
      setActiveNav('lights');
      state.view = viewLights(fresh);
    } else if (hash.startsWith('#/activity')) {
      $('#pageTitle').textContent = 'Atividade';
      setActiveNav('activity');
      state.view = viewActivity(fresh);
    } else {
      $('#pageTitle').textContent = 'Visão geral';
      setActiveNav('overview');
      state.view = viewOverview(fresh);
    }
    document.title = `${$('#pageTitle').textContent} | Tempic`;
    renderSidebar();
    if (!reduceMotion) fresh.classList.add('is-entering');
    window.scrollTo(0, 0);
  }

  // ==========================================
  // ACESSO
  // ==========================================

  let authPreview = null;

  function showAuth() {
    $('#tpShell').hidden = true;
    $('#tpAuth').hidden = false;
    $('#tpBoot').hidden = true;
    startAuthPreview();
  }

  async function showApp() {
    stopAuthPreview();
    $('#tpAuth').hidden = true;
    $('#tpBoot').hidden = false;
    $('#userName').textContent = state.user.name;
    $('#userName').title = state.user.email;
    $('#userAvatar').textContent = (state.user.name || '?').trim().charAt(0).toUpperCase();
    applyAccess(state.access);
    await Promise.all([refreshLights().catch(() => {}), refreshItems().catch(() => {}), ...state.sensors.map(loadSpark)]);
    state.sensors.forEach(sensor => state.known.set(String(sensor.id), sensorState(sensor)));
    try { state.openAlerts = (await api('alerts')).alerts.filter(alert => !alert.resolved_at).length; } catch (error) { /* contador fica zerado */ }
    renderAlertCount();
    $('#tpShell').hidden = false;
    $('#tpBoot').hidden = true;
    route();
    startLive();
  }

  // Prévia animada da tela de acesso (valores ilustrativos)
  function startAuthPreview() {
    if (authPreview) return;
    const fake = { minimum_temperature: 2, maximum_temperature: 8, target_temperature: 4, current_temperature: 4.2, status: 'online' };
    const root = $('#authGauge');
    root.innerHTML = `${gaugeSvg(fake, { size: 'md' })}<div class="tp-gauge-center"><span class="tp-gauge-value"><span data-preview-value data-value="4.2">4,2</span><small>°C</small></span><span class="tp-gauge-caption">Câmara fria · ao vivo</span></div>`;
    const feed = $('#authFeed');
    const messages = ['Refrigeração ligada automaticamente', 'Leitura recebida do ESP32', 'Estacionamento aceso às 18:00', 'Temperatura voltou à faixa segura'];
    let value = 4.2;
    let index = 0;
    const step = () => {
      value = clamp(value + (Math.random() - 0.45) * 0.9, 2.6, 8.6);
      fake.current_temperature = value;
      updateGauge(root, fake);
      animateNumber($('[data-preview-value]', root), value);
      const item = document.createElement('li');
      item.innerHTML = `<i class="fa-solid fa-circle" aria-hidden="true"></i>${messages[index++ % messages.length]}<time>agora</time>`;
      feed.prepend(item);
      while (feed.children.length > 3) feed.lastElementChild.remove();
    };
    requestAnimationFrame(() => updateGauge(root, fake));
    step();
    authPreview = setInterval(step, 2600);
  }

  function stopAuthPreview() {
    clearInterval(authPreview);
    authPreview = null;
  }

  function setAuthTab(name) {
    $$('[data-auth-tab]').forEach(tab => tab.setAttribute('aria-selected', String(tab.dataset.authTab === name)));
    $('#loginForm').hidden = name !== 'login';
    $('#registerForm').hidden = name !== 'register';
    $('.tp-tabs').dataset.active = name;
    $(name === 'login' ? '#login-email' : '#register-name').focus();
  }

  async function submitAuth(event, action) {
    event.preventDefault();
    const form = event.currentTarget;
    const error = $(action === 'login' ? '#loginError' : '#registerError');
    error.hidden = true;
    if (!form.checkValidity()) {
      error.textContent = action === 'login' ? 'Informe e-mail e senha.' : 'Preencha todos os campos (senha com pelo menos 8 caracteres).';
      error.hidden = false;
      form.querySelector(':invalid')?.focus();
      return;
    }
    const button = form.querySelector('[type="submit"]');
    button.classList.add('is-loading');
    button.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form));
      if (action === 'register' && !$('#inviteField').open) delete data.invite_code;
      const result = await api(action, { method: 'POST', data });
      state.user = result.user;
      state.access = result;
      state.sensors = (await api('sensors')).sensors;
      form.reset();
      if (action === 'register') renderInvitePreview('');
      if (action === 'register' && !result.workspace.isOwner) {
        toast(`Você entrou em ${result.workspace.name} como ${result.roleLabel}.`, { type: 'success', title: 'Bem-vindo à equipe', timeout: 7000 });
      }
      // Tira o ?convite= da barra de endereço: o código já foi usado
      history.replaceState(null, '', `${location.pathname}#/`);
      await showApp();
    } catch (requestError) {
      error.textContent = requestError.message;
      error.hidden = false;
    } finally {
      button.classList.remove('is-loading');
      button.disabled = false;
    }
  }

  // Convite no cadastro: mostra em qual espaço e com qual papel a pessoa vai entrar
  let inviteCheck = 0;

  function renderInvitePreview(text, tone = '') {
    const box = $('#invitePreview');
    box.textContent = text || 'Sem código, você cria o seu próprio espaço e vira administrador.';
    box.dataset.tone = tone;
  }

  async function checkInvite(raw) {
    const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const input = $('#register-invite');
    const formatted = clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4, 8)}` : clean;
    if (input.value !== formatted) input.value = formatted;
    if (!clean) { renderInvitePreview(''); return; }
    if (clean.length < 8) { renderInvitePreview('O código tem 8 caracteres (ex.: ABCD-2345).'); return; }
    const ticket = ++inviteCheck;
    renderInvitePreview('Conferindo o convite…');
    try {
      const result = await api('invite-check', { params: { code: formatted } });
      if (ticket !== inviteCheck) return;
      renderInvitePreview(`Você vai entrar em ${result.workspace} como ${result.roleLabel}.`, 'ok');
    } catch (error) {
      if (ticket === inviteCheck) renderInvitePreview(error.message, 'error');
    }
  }

  // Link de convite (?convite=ABCD-2345): abre o cadastro com o código preenchido
  function inviteFromUrl() {
    const code = new URLSearchParams(location.search).get('convite');
    if (!code) return;
    setAuthTab('register');
    $('#inviteField').open = true;
    checkInvite(code);
  }

  async function demoAccount(button) {
    button.classList.add('is-loading');
    button.disabled = true;
    const random = crypto.getRandomValues(new Uint32Array(3));
    const password = Array.from(random, n => n.toString(36)).join('') + 'Aa1!';
    try {
      const result = await api('register', {
        method: 'POST',
        data: { name: 'Visitante Tempic', email: `demo-${random[0].toString(36)}${Date.now().toString(36)}@tempic.demo`, age: 30, password, password_confirmation: password },
      });
      state.user = result.user;
      state.access = result;
      const seeded = await api('seed-demo', { method: 'POST' });
      state.sensors = seeded.sensors;
      location.hash = '#/';
      await showApp();
      toast('Quatro sensores com itens guardados e dois circuitos de iluminação estão prontos. Abra o freezer, teste o laboratório de falhas e veja o inventário reagir. Em Administração dá para convidar um membro.', { type: 'success', title: 'Ambiente criado', timeout: 9000 });
    } catch (error) {
      toast(error.message, { type: 'warn' });
    } finally {
      button.classList.remove('is-loading');
      button.disabled = false;
    }
  }

  async function seedDemo() {
    try {
      const result = await api('seed-demo', { method: 'POST' });
      state.sensors = result.sensors;
      state.lights = result.lights;
      await Promise.all([refreshItems().catch(() => {}), ...state.sensors.map(loadSpark)]);
      state.sensors.forEach(sensor => state.known.set(String(sensor.id), sensorState(sensor)));
      toast(result.message, { type: 'success' });
      route();
    } catch (error) {
      toast(error.message, { type: 'warn' });
    }
  }

  async function logout() {
    stopLive();
    try { await api('logout', { method: 'POST' }); } catch (error) { /* sessão já encerrada */ }
    try { state.csrf = (await api('bootstrap')).csrfToken; } catch (error) { state.csrf = ''; }
    Object.assign(state, { user: null, access: null, preview: false, sensors: [], lights: [], items: [], inventory: null, openAlerts: 0, lastTick: null });
    $('#previewBar').hidden = true;
    state.spark.clear();
    state.known.clear();
    state.view?.destroy?.();
    state.view = null;
    history.replaceState(null, '', location.pathname);
    showAuth();
    setAuthTab('login');
  }

  // ==========================================
  // EVENTOS GLOBAIS
  // ==========================================

  function bind() {
    $('#loginForm').addEventListener('submit', event => submitAuth(event, 'login'));
    $('#registerForm').addEventListener('submit', event => submitAuth(event, 'register'));

    document.addEventListener('click', event => {
      const tab = event.target.closest('[data-auth-tab]');
      if (tab) { setAuthTab(tab.dataset.authTab); return; }

      const reveal = event.target.closest('[data-reveal-password]');
      if (reveal) {
        const input = document.getElementById(reveal.dataset.revealPassword);
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        reveal.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
        reveal.innerHTML = `<i class="fa-regular ${show ? 'fa-eye-slash' : 'fa-eye'}" aria-hidden="true"></i>`;
        return;
      }

      if (event.target.closest('[data-close-modal]')) { closeModal(); return; }
      if (event.target === $('#tpPalette')) { closePalette(); return; }
      const paletteItem = event.target.closest('.tp-palette-item');
      if (paletteItem) { runPalette(Number(paletteItem.dataset.index)); return; }

      const action = event.target.closest('[data-action]');
      if (!action) return;
      switch (action.dataset.action) {
        case 'add-sensor': openAddSensor(); break;
        case 'add-item': openItemForm(); break;
        case 'end-preview': setPreview(false); break;
        case 'seed-demo': seedDemo(); break;
        case 'palette': openPalette(); break;
        case 'theme': toggleTheme(); break;
        case 'logout': logout(); break;
        case 'demo-account': demoAccount(action); break;
        default: break;
      }
    });

    $('#register-invite').addEventListener('input', event => checkInvite(event.target.value));
    $('#paletteInput').addEventListener('input', () => { paletteIndex = 0; renderPalette(); });
    $('#paletteInput').addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') { event.preventDefault(); paletteIndex = Math.min(paletteItems.length - 1, paletteIndex + 1); renderPalette(); }
      if (event.key === 'ArrowUp') { event.preventDefault(); paletteIndex = Math.max(0, paletteIndex - 1); renderPalette(); }
      if (event.key === 'Enter') { event.preventDefault(); runPalette(paletteIndex); }
    });

    document.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if ($('#tpPalette').hidden) openPalette(); else closePalette();
        return;
      }
      if (event.key === 'Escape') {
        if (!$('#tpPalette').hidden) closePalette();
        else closeModal();
        return;
      }
      // Mantém o foco dentro da janela aberta
      if (event.key === 'Tab' && !$('#tpModal').hidden) {
        const focusable = $$('#tpModal button:not([disabled]), #tpModal input, #tpModal a[href]').filter(element => element.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });

    window.addEventListener('hashchange', route);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && state.user) tick(); });
  }

  // ==========================================
  // INÍCIO
  // ==========================================

  async function boot() {
    bind();
    try {
      const result = await api('bootstrap');
      state.csrf = result.csrfToken;
      state.catalog = result.catalog;
      state.user = result.user;
      state.access = result.user ? result : null;
      state.sensors = result.sensors || [];
      if (state.user) await showApp();
      else { showAuth(); inviteFromUrl(); }
    } catch (error) {
      showAuth();
      const box = $('#loginError');
      box.textContent = `${error.message} Verifique se o PHP está rodando.`;
      box.hidden = false;
    }
  }

  boot();
})();
