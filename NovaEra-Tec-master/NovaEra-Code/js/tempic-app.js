// ==========================================
// TEMPIC - PAINEL WEB
// SPA sem framework: rotas por hash (#/, #/sensor/12, #/lights,
// #/activity), estado único, leitura ao vivo a cada 5 s (RNF02) e
// atualização pontual do DOM para não perder foco nem hover.
// Toda a regra de negócio fica na API (php/tempic-api.php).
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
    sensors: [],
    lights: [],
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
  // PALETA DE COMANDOS (Ctrl/⌘ + K)
  // ==========================================

  let paletteItems = [];
  let paletteIndex = 0;

  function paletteCommands() {
    const commands = [
      { group: 'Páginas', icon: 'fa-gauge-high', label: 'Visão geral', run: () => { location.hash = '#/'; } },
      { group: 'Páginas', icon: 'fa-lightbulb', label: 'Iluminação do estacionamento', run: () => { location.hash = '#/lights'; } },
      { group: 'Páginas', icon: 'fa-wave-square', label: 'Atividade e alertas', run: () => { location.hash = '#/activity'; } },
    ];
    state.sensors.forEach(sensor => commands.push({
      group: 'Sensores', icon: typeOf(sensor).icon, label: sensor.name, hint: `${temp(sensor.current_temperature)} · ${sensor.location}`,
      run: () => { location.hash = `#/sensor/${sensor.id}`; },
    }));
    commands.push(
      { group: 'Ações', icon: 'fa-plus', label: 'Adicionar sensor', run: openAddSensor },
      { group: 'Ações', icon: 'fa-circle-half-stroke', label: 'Alternar tema claro/escuro', run: toggleTheme },
      { group: 'Ações', icon: 'fa-arrow-right-from-bracket', label: 'Sair da conta', run: logout },
    );
    if (!state.sensors.length) commands.push({ group: 'Ações', icon: 'fa-wand-magic-sparkles', label: 'Criar ambiente de demonstração', run: seedDemo });
    return commands;
  }

  function renderPalette() {
    const query = $('#paletteInput').value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const normalize = text => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    paletteItems = paletteCommands().filter(item => !query || normalize(`${item.label} ${item.hint || ''} ${item.group}`).includes(query));
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
      const message = `${sensor.name} está em ${temp(sensor.current_temperature)} — fora da faixa de ${limit(sensor.minimum_temperature)} a ${limit(sensor.maximum_temperature)}.`;
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

  function startLive() {
    stopLive();
    tickTimer = setInterval(() => tick(), TICK_MS);
    liveTextTimer = setInterval(renderLiveText, 1000);
    tick();
  }

  function stopLive() {
    clearInterval(tickTimer);
    clearInterval(liveTextTimer);
    tickTimer = null;
    liveTextTimer = null;
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
      </a>`;
  }

  function viewOverview(main) {
    const firstName = (state.user.name || '').split(' ')[0];
    const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

    if (!state.sensors.length) {
      main.innerHTML = `
        <section class="tp-empty">
          <div class="tp-empty-art" aria-hidden="true"><i class="fa-solid fa-temperature-arrow-down"></i></div>
          <h2>${greeting()}, ${esc(firstName)}. Vamos ligar o primeiro sensor?</h2>
          <p>Crie um ambiente completo com quatro sensores, histórico de 24 horas e iluminação programada — ou cadastre o seu sensor manualmente.</p>
          <div class="tp-empty-actions">
            <button type="button" class="tp-btn tp-btn-primary" data-action="seed-demo"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> Criar ambiente de demonstração</button>
            <button type="button" class="tp-btn tp-btn-ghost" data-action="add-sensor"><i class="fa-solid fa-plus" aria-hidden="true"></i> Adicionar sensor</button>
          </div>
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
          <button type="button" class="tp-btn tp-btn-ghost" data-action="add-sensor"><i class="fa-solid fa-plus" aria-hidden="true"></i> Novo sensor</button>
        </section>

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
            <button type="button" class="tp-sensor-add" data-action="add-sensor"><i class="fa-solid fa-plus" aria-hidden="true"></i><span>Adicionar sensor</span></button>
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
          <button type="button" class="tp-icon-btn" data-sensor-delete aria-label="Remover sensor" title="Remover sensor"><i class="fa-regular fa-trash-can" aria-hidden="true"></i></button>
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
            <div class="tp-target-head"><label for="targetSlider">Temperatura alvo</label><output id="targetOut" for="targetSlider">${temp(pendingTarget)}</output></div>
            <div class="tp-target-row">
              <button type="button" class="tp-icon-btn" data-step-target="-0.5" aria-label="Diminuir alvo em 0,5 grau">−</button>
              <input type="range" id="targetSlider" min="${Number(sensor.minimum_temperature)}" max="${Number(sensor.maximum_temperature)}" step="0.5" value="${pendingTarget}">
              <button type="button" class="tp-icon-btn" data-step-target="0.5" aria-label="Aumentar alvo em 0,5 grau">+</button>
            </div>
            <div class="tp-target-foot"><span>${limit(sensor.minimum_temperature)}</span><button type="button" class="tp-btn tp-btn-primary tp-btn-sm" data-apply-target hidden>Aplicar alvo</button><span>${limit(sensor.maximum_temperature)}</span></div>
          </div>
        </section>

        <section class="tp-card tp-card-control" aria-labelledby="controlTitle">
          <div class="tp-card-head"><h3 id="controlTitle">Refrigeração</h3><span class="tp-muted" data-equipment-label></span></div>
          <button type="button" class="tp-power" role="switch" aria-checked="false" data-equipment>
            <span class="tp-power-icon"><i class="fa-solid fa-snowflake" aria-hidden="true"></i></span>
            <span class="tp-power-text"><strong data-equipment-state></strong><small>Toque para ligar ou desligar</small></span>
            <span class="tp-switch" aria-hidden="true"><span></span></span>
          </button>
          <div class="tp-segmented" role="radiogroup" aria-label="Modo de controle">
            <button type="button" role="radio" data-mode="auto"><i class="fa-solid fa-robot" aria-hidden="true"></i> Automático</button>
            <button type="button" role="radio" data-mode="manual"><i class="fa-solid fa-hand" aria-hidden="true"></i> Manual</button>
          </div>
          <p class="tp-hint" data-mode-hint></p>

          <div class="tp-lab">
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
      </div>`;

    chart = new TempChart($('.tp-chart-box canvas', main), $('.tp-chart-tip', main));
    const gaugeRoot = $('[data-gauge]', main);
    requestAnimationFrame(() => updateGauge(gaugeRoot, sensor));

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
    const render = () => {
      main.innerHTML = `
        <section class="tp-hello">
          <div><span class="tp-kicker">RF03 · iluminação do estacionamento</span><h2>Iluminação</h2><p>Acenda e apague à distância ou programe por horário — inclusive janelas que passam da meia-noite.</p></div>
        </section>
        <form class="tp-card tp-inline-form" data-light-add novalidate>
          <label for="lightName" class="tp-sr">Nome do novo circuito</label>
          <input id="lightName" name="name" minlength="2" maxlength="80" placeholder="Novo circuito, ex.: Estacionamento lateral" required autocomplete="off">
          <button type="submit" class="tp-btn tp-btn-primary"><i class="fa-solid fa-plus" aria-hidden="true"></i> Adicionar</button>
        </form>
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
                  <button type="button" class="tp-switch-btn" role="switch" aria-checked="${on}" data-light-toggle aria-label="${on ? 'Apagar' : 'Acender'} ${esc(light.name)}"><span class="tp-switch"><span></span></span></button>
                </div>
                ${scheduleBar(light.on_time, light.off_time, scheduled)}
                <form class="tp-light-form" data-light-form>
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
        const sensor = sensorById(item.raw.sensor_id);
        return { icon: 'fa-triangle-exclamation', cls: item.raw.resolved_at ? 'is-resolved' : 'is-alert', title: item.raw.message, meta: `${sensor ? esc(sensor.name) : 'Sensor removido'} · ${item.raw.resolved_at ? 'resolvido' : 'ativo'}` };
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
        return `${header}<li class="tp-feed-item ${info.cls}"><span class="tp-feed-icon"><i class="fa-solid ${info.icon}" aria-hidden="true"></i></span><div><strong>${esc(info.title)}</strong><small>${info.meta}</small></div><time datetime="${item.date?.toISOString() ?? ''}">${timeOf(item.date)}</time></li>`;
      }).join('');

      const notifyGranted = 'Notification' in window && Notification.permission === 'granted';
      main.innerHTML = `
        <section class="tp-hello">
          <div><span class="tp-kicker">RF04 · alertas e acionamentos</span><h2>Atividade</h2><p>Tudo o que aconteceu na sua operação: alertas de temperatura e cada acionamento manual, automático ou programado.</p></div>
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
    $('#userEmail').textContent = state.user.email;
    $('#userAvatar').textContent = (state.user.name || '?').trim().charAt(0).toUpperCase();
    await Promise.all([refreshLights().catch(() => {}), ...state.sensors.map(loadSpark)]);
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
      const result = await api(action, { method: 'POST', data: Object.fromEntries(new FormData(form)) });
      state.user = result.user;
      state.sensors = (await api('sensors')).sensors;
      form.reset();
      location.hash = '#/';
      await showApp();
    } catch (requestError) {
      error.textContent = requestError.message;
      error.hidden = false;
    } finally {
      button.classList.remove('is-loading');
      button.disabled = false;
    }
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
      const seeded = await api('seed-demo', { method: 'POST' });
      state.sensors = seeded.sensors;
      location.hash = '#/';
      await showApp();
      toast('Quatro sensores e dois circuitos de iluminação simulados estão prontos. Abra um sensor e teste o laboratório de falhas.', { type: 'success', title: 'Ambiente criado', timeout: 7000 });
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
      await Promise.all(state.sensors.map(loadSpark));
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
    Object.assign(state, { user: null, sensors: [], lights: [], openAlerts: 0, lastTick: null });
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
        case 'seed-demo': seedDemo(); break;
        case 'palette': openPalette(); break;
        case 'theme': toggleTheme(); break;
        case 'logout': logout(); break;
        case 'demo-account': demoAccount(action); break;
        default: break;
      }
    });

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
      state.user = result.user;
      state.sensors = result.sensors || [];
      if (state.user) await showApp();
      else showAuth();
    } catch (error) {
      showAuth();
      const box = $('#loginError');
      box.textContent = `${error.message} Verifique se o PHP está rodando.`;
      box.hidden = false;
    }
  }

  boot();
})();
