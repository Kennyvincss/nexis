/* =====================================================================
   NEXIS CORE — utilities, icons, toasts, dialogs, charts, per-user store.
   Loaded first; every other script uses these globals.
   ===================================================================== */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const delay = (ms) => new Promise(r => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const HOUR = 3600e3, DAY = 24 * HOUR;
const now = () => Date.now();
const usd = (n, d = 2) => (n < 0 ? '−$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const sUsd = (n, d = 2) => (n >= 0 ? '+' : '') + usd(n, d);
const kfmt = (n) => { const a = Math.abs(n); if (a >= 1e6) return (n/1e6).toFixed(a >= 1e7 ? 0 : 2).replace(/\.?0+$/,'') + 'M'; if (a >= 1e3) return (n/1e3).toFixed(a >= 1e5 ? 0 : 1).replace(/\.0$/,'') + 'K'; return String(Math.round(n)); };
const kusd = (n) => '$' + kfmt(n);
const cents = (p) => Math.round(p * 100) + '¢';
/** The NO price shown next to a YES price, so the two always add up to 100¢. */
const noCents = (yes) => (100 - Math.round(yes * 100)) + '¢';
const pct = (n, d = 1) => (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(d) + '%';
const chgHtml = (n) => Math.abs(n) < 0.05 ? '<span class="chg flat">0.0%</span>' : `<span class="chg ${n >= 0 ? 'up' : 'down'}">${n >= 0 ? '▲' : '▼'} ${Math.abs(n).toFixed(1)}%</span>`;
const fmtDate = (t, o = { month: 'short', day: 'numeric' }) => new Date(t).toLocaleDateString('en-US', o);
const fmtDateLong = (t) => new Date(t).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const ago = (t) => { const d = (now() - t) / 1000; if (d < 45) return 'now'; if (d < 3600) return Math.round(d/60) + 'm'; if (d < 86400) return Math.round(d/3600) + 'h'; if (d < 86400*7) return Math.round(d/86400) + 'd'; return fmtDate(t); };
const timeLeft = (t) => { let d = t - now(); if (d <= 0) return 'Ended'; const dd = Math.floor(d / DAY); d -= dd * DAY; const h = Math.floor(d / HOUR); d -= h * HOUR; const m = Math.floor(d / 60e3); if (dd >= 30) return Math.round(dd / 30.4) + 'mo'; if (dd > 0) return `${dd}d ${h}h`; if (h > 0) return `${h}h ${m}m`; return `${m}m`; };
const uid = (p = 'id') => p + '-' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };


const P = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
  users: '<path d="M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1"/><circle cx="9" cy="7" r="4"/><path d="M22 20v-1a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  msg: '<path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z"/>',
  plus: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/>',
  plain_plus: '<path d="M12 5v14M5 12h14"/>',
  brief: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  wallet: '<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-4a2 2 0 0 0 0 4h4v3a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5"/><path d="M17 14h.01"/>',
  spark: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 3v4M17 5h4"/>',
  heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 12 5a5.5 5.5 0 0 0-10 3.5c0 2.3 1.5 4 3 5.5l7 7z"/>',
  reply: '<path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  trend: '<path d="M22 7l-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  trendDown: '<path d="M22 17l-8.5-8.5-5 5L2 7"/><path d="M16 17h6v-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  chevDown: '<path d="m6 9 6 6 6-6"/>',
  chevRight: '<path d="m9 6 6 6-6 6"/>',
  chevLeft: '<path d="m15 6-6 6 6 6"/>',
  arrowUR: '<path d="M7 17 17 7M7 7h10v10"/>',
  arrowR: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  play: '<path d="m7 4 13 8-13 8z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  flag: '<path d="M4 22V4M4 4h12l-2 4 2 4H4"/>',
  userPlus: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  dollar: '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
};
const ic = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;
const xLogo = (s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.78zm-1.08 16.2h1.7L7.4 4.73H5.58z"/></svg>`;
const logoMark = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 19V5l16 14V5" stroke="#F2F4F8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="4" cy="19" r="2.2" fill="#3D7BFF"/><circle cx="20" cy="5" r="2.2" fill="#8E6BFF"/></svg>`;
const pantaMark = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg>`;


Object.assign(P, {
  soccer: '<circle cx="12" cy="12" r="9"/><path d="m12 7.5 3.8 2.8-1.5 4.4H9.7l-1.5-4.4z"/><path d="M12 3v4.5M15.8 10.3l4.4-1.6M14.3 14.7l2.8 3.8M9.7 14.7l-2.8 3.8M8.2 10.3 3.8 8.7"/>',
  basketball: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M5.6 5.6c2.4 3.3 2.4 9.5 0 12.8M18.4 5.6c-2.4 3.3-2.4 9.5 0 12.8"/>',
  tennis: '<circle cx="12" cy="12" r="9"/><path d="M5.2 6.2c3 3 3 8.6 0 11.6M18.8 6.2c-3 3-3 8.6 0 11.6"/>',
  amfootball: '<path d="M5 19c-1.5-4.5.5-10 4.5-12.5S19 5 19 5s1.5 5.5-2 10-12 4-12 4z"/><path d="m9 15 6-6M10.5 11l2.5 2.5M12.5 9l2.5 2.5"/>',
  racing: '<path d="M4 21V4h14l-2 4 2 4H4"/><path d="M8 4v8M12 4v8M4 8h14"/>',
  whistle: '<circle cx="8" cy="15" r="5"/><path d="M11.5 11.5 21 6v4l-6.5 2.5"/>',
  card: '<rect x="7" y="3" width="10" height="16" rx="2" transform="rotate(8 12 11)"/>',
  ball: '<circle cx="12" cy="12" r="9"/>',
});
Object.assign(P, {
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  eyeOff: '<path d="m3 3 18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  laptop: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 9.2-9.2M17 6l3 3M14.5 8.5l2 2"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
});
Object.assign(P, { radio: '<circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19 5a10 10 0 0 1 0 14M5 19A10 10 0 0 1 5 5"/>', bellOff: '<path d="M8.7 3A6 6 0 0 1 18 8a21 21 0 0 0 .6 5M17 17H3s3-2 3-9a4.7 4.7 0 0 1 .3-1.7M10.3 21a1.9 1.9 0 0 0 3.4 0M2 2l20 20"/>' });
const googleG = `<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

/* ---------- Toasts ---------- */
function toast({ title, body = '', kind = 'ok', action, ms = 4800 }) {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.setAttribute('role', 'status');
  const icn = { ok: 'check', info: 'info', warn: 'alert', err: 'alert' }[kind];
  el.innerHTML = `<span class="ti">${ic(icn, 'sm')}</span><div><b>${esc(title)}</b>${body ? `<p>${body}</p>` : ''}${action ? `<button class="btn btn-ghost sm" style="margin-top:9px" data-toast-act>${esc(action.label)}</button>` : ''}</div><button class="iconbtn" style="width:24px;height:24px" aria-label="Dismiss">${ic('x', 'sm')}</button>`;
  const kill = () => { el.classList.add('out'); setTimeout(() => el.remove(), 220); };
  el.querySelector('.iconbtn').onclick = kill;
  if (action) el.querySelector('[data-toast-act]').onclick = () => { kill(); action.fn ? action.fn() : (location.hash = action.href); };
  box.appendChild(el);
  setTimeout(kill, ms);
}

/* ---------- Modal ---------- */
let modalStack = [];
function openModal(html, { size = '', onClose, label = 'Dialog' } = {}) {
  closeModal(true);
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="modal ${size}" role="dialog" aria-modal="true" aria-label="${esc(label)}">${html}</div>`;
  ov.addEventListener('mousedown', e => { if (e.target === ov) closeModal(); });
  document.body.appendChild(ov);
  document.body.style.overflow = 'hidden';
  modalStack = [{ ov, onClose }];
  setTimeout(() => { const f = ov.querySelector('[autofocus]') || ov.querySelector('input,textarea,button.btn-blue,button.btn-primary'); f && f.focus(); }, 30);
  hydrate(ov);
  return ov.querySelector('.modal');
}
function setModal(html) { const m = $('.overlay .modal'); if (m) { m.innerHTML = html; hydrate(m); const f = m.querySelector('[autofocus]'); f && f.focus(); } }
function closeModal(silent) {
  modalStack.forEach(({ ov, onClose }) => { ov.remove(); if (!silent && onClose) onClose(); });
  modalStack = []; document.body.style.overflow = '';
}
const modalHead = (title, sub = '') => `<div class="modal-head"><div style="flex:1;min-width:0"><h2>${title}</h2>${sub ? `<div class="mut" style="font-size:12.5px;margin-top:2px">${sub}</div>` : ''}</div><button class="iconbtn" data-action="closeModal" aria-label="Close">${ic('x')}</button></div>`;
const infoNote = (text) => `<div class="sim-note">${ic('info', 'sm')}<span>${text}</span></div>`;

/* ---------- Charts ---------- */
function sparkSvg(vals, { w = 120, h = 40, color } = {}) {
  const step = Math.max(1, Math.floor(vals.length / 48));
  const v = vals.filter((_, i) => i % step === 0 || i === vals.length - 1);
  const mn = Math.min(...v), mx = Math.max(...v), rg = (mx - mn) || .01;
  const pts = v.map((p, i) => [(i / (v.length - 1)) * w, h - 3 - ((p - mn) / rg) * (h - 6)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
  const c = color || (v[v.length - 1] >= v[0] ? 'var(--green)' : 'var(--red)');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" fill="none" stroke="${c}" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/><circle cx="${pts[pts.length-1][0]}" cy="${pts[pts.length-1][1]}" r="2.2" fill="${c}"/></svg>`;
}
const chartData = new WeakMap();
function lineChart(el, { values, times, fmt = (v) => v.toFixed(1), color = 'var(--blue)', domain, zero, xl } = {}) {
  chartData.set(el, { values, times, fmt, color, domain, zero, xl });
  drawChart(el);
}
function drawChart(el) {
  const cfg = chartData.get(el); if (!cfg) return;
  if (cfg.series) return drawMulti(el, cfg);
  const { values, times, fmt, color, zero, xl } = cfg;
  const W = Math.max(200, el.clientWidth), H = Math.max(120, el.clientHeight);
  const padL = 4, padR = 46, padT = 10, padB = 24;
  let mn = Math.min(...values), mx = Math.max(...values);
  if (cfg.domain) { mn = Math.max(cfg.domain[0], mn - (mx - mn) * .25 - .02 * (cfg.domain[1] - cfg.domain[0])); mx = Math.min(cfg.domain[1], mx + (mx - mn) * .25 + .02 * (cfg.domain[1] - cfg.domain[0])); }
  else { const pad = (mx - mn) * .15 || 1; mn -= pad; mx += pad; }
  if (zero !== undefined) { mn = Math.min(mn, zero); mx = Math.max(mx, zero); }
  const rg = mx - mn || 1;
  const X = (i) => padL + (i / (values.length - 1)) * (W - padL - padR);
  const Yf = (v) => padT + (1 - (v - mn) / rg) * (H - padT - padB);
  const d = values.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Yf(v).toFixed(1)).join('');
  const area = d + `L${X(values.length - 1).toFixed(1)} ${H - padB}L${X(0)} ${H - padB}Z`;
  const ticks = 4; let grid = '';
  for (let i = 0; i <= ticks; i++) { const v = mn + rg * (i / ticks); const y = Yf(v); grid += `<line x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}" stroke="var(--line)" stroke-dasharray="${i === 0 ? '' : '2 4'}"/><text x="${W - padR + 8}" y="${y + 4}" fill="var(--muted)" font-size="11" font-family="var(--mono)">${fmt(v)}</text>`; }
  let xl2 = '', xl_ = '';
  if (xl) { const n = 4; for (let i = 0; i <= n; i++) { const idx = Math.round((values.length - 1) * i / n); xl_ += `<text x="${X(idx)}" y="${H - 6}" fill="var(--muted)" font-size="11" text-anchor="${i === 0 ? 'start' : i === n ? 'end' : 'middle'}">${xl[idx]}</text>`; } xl2 = xl_; }
  else if (times) { const n = 4; for (let i = 0; i <= n; i++) { const idx = Math.round((values.length - 1) * i / n); const lab = (times[values.length - 1] - times[0]) < 2 * DAY ? new Date(times[idx]).toLocaleTimeString('en-US', { hour: 'numeric' }) : fmtDate(times[idx]); xl2 += `<text x="${X(idx)}" y="${H - 6}" fill="var(--muted)" font-size="11" text-anchor="${i === 0 ? 'start' : i === n ? 'end' : 'middle'}">${lab}</text>`; } }
  const zl = zero !== undefined ? `<line x1="${padL}" x2="${W - padR}" y1="${Yf(zero)}" y2="${Yf(zero)}" stroke="var(--line-3)"/>` : '';
  const gid = 'g' + Math.random().toString(36).slice(2, 7);
  const lx = X(values.length - 1), ly = Yf(values[values.length - 1]);
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Chart"><defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".16"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>${grid}${zl}${xl2}<path d="${area}" fill="url(#${gid})"/><path d="${d}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round"/><circle cx="${lx}" cy="${ly}" r="3.5" fill="${color}"/><circle cx="${lx}" cy="${ly}" r="8" fill="${color}" opacity=".18"/><g class="hov" style="display:none"><line y1="${padT}" y2="${H - padB}" stroke="var(--line-3)"/><circle r="4" fill="${color}" stroke="var(--bg)" stroke-width="2"/></g><rect x="0" y="0" width="${W - padR}" height="${H}" fill="transparent" class="hit"/></svg><div class="chart-tip"></div>`;
  const svg = el.querySelector('svg'), hov = svg.querySelector('.hov'), tip = el.querySelector('.chart-tip');
  const move = (cx) => {
    const r = svg.getBoundingClientRect(); const x = (cx - r.left) * (W / r.width);
    const i = clamp(Math.round((x - padL) / (W - padL - padR) * (values.length - 1)), 0, values.length - 1);
    const px = X(i), py = Yf(values[i]);
    hov.style.display = ''; hov.querySelector('line').setAttribute('x1', px); hov.querySelector('line').setAttribute('x2', px);
    hov.querySelector('circle').setAttribute('cx', px); hov.querySelector('circle').setAttribute('cy', py);
    tip.style.opacity = 1; tip.style.left = (px / W * 100) + '%'; tip.style.top = (py / H * 100) + '%';
    tip.innerHTML = `<b>${fmt(values[i])}</b>${xl ? `<span>${xl[i]}</span>` : times ? `<span>${new Date(times[i]).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric' })}</span>` : ''}`;
  };
  const hit = svg.querySelector('.hit');
  hit.addEventListener('mousemove', e => move(e.clientX));
  hit.addEventListener('touchmove', e => { move(e.touches[0].clientX); }, { passive: true });
  const leave = () => { hov.style.display = 'none'; tip.style.opacity = 0; };
  hit.addEventListener('mouseleave', leave); hit.addEventListener('touchend', leave);
}
const ro = new ResizeObserver(entries => entries.forEach(e => drawChart(e.target)));

function drawMulti(el, cfg) {
  const { series, xs, xmax } = cfg; const mini = !!el.dataset.mini;
  const W = Math.max(200, el.clientWidth), H = Math.max(80, el.clientHeight);
  const padL = 2, padR = mini ? 4 : 40, padT = 6, padB = mini ? 4 : 22;
  const X = (x) => padL + (x / xmax) * (W - padL - padR), Yv = (v) => padT + (1 - v) * (H - padT - padB);
  let g = '';
  if (!mini) { [0, .25, .5, .75, 1].forEach(v => { g += `<line x1="${padL}" x2="${W - padR}" y1="${Yv(v)}" y2="${Yv(v)}" stroke="var(--line)" stroke-dasharray="${v ? '2 4' : ''}"/><text x="${W - padR + 8}" y="${Yv(v) + 4}" fill="var(--muted)" font-size="11" font-family="var(--mono)">${Math.round(v * 100)}¢</text>`; });
    const marks = xmax > 60 ? [0, 45, 90] : [0, 10, 20, 30, 40]; marks.forEach(mk => { if (mk <= xmax) g += `<line x1="${X(mk)}" x2="${X(mk)}" y1="${padT}" y2="${H - padB}" stroke="var(--line)"/><text x="${X(mk)}" y="${H - 6}" fill="var(--muted)" font-size="11" text-anchor="${mk === 0 ? 'start' : 'middle'}">${mk}’</text>`; }); }
  const paths = series.map(s => { const d = s.pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Yv(p[1]).toFixed(1)).join(''); const l = s.pts[s.pts.length - 1]; return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${mini ? 1.5 : 2}" stroke-linejoin="round"/><circle cx="${X(l[0])}" cy="${Yv(l[1])}" r="${mini ? 2.5 : 3.5}" fill="${s.color}"/>`; }).join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Probability chart">${g}${paths}<g class="hov" style="display:none"><line y1="${padT}" y2="${H - padB}" stroke="var(--line-3)"/></g><rect class="hit" x="0" y="0" width="${W - padR}" height="${H}" fill="transparent"/></svg><div class="chart-tip"></div>`;
  if (mini) return;
  const svg = el.querySelector('svg'), hov = svg.querySelector('.hov'), tip = el.querySelector('.chart-tip');
  const move = (cx) => { const r = svg.getBoundingClientRect(); const x = ((cx - r.left) * (W / r.width) - padL) / (W - padL - padR) * xmax; const vals = series.map(s => { let best = s.pts[0]; for (const p of s.pts) if (Math.abs(p[0] - x) < Math.abs(best[0] - x)) best = p; return [s, best]; }); const bx = vals[0][1][0];
    hov.style.display = ''; hov.querySelector('line').setAttribute('x1', X(bx)); hov.querySelector('line').setAttribute('x2', X(bx)); tip.style.opacity = 1; tip.style.left = (X(bx) / W * 100) + '%'; tip.style.top = '18%';
    tip.innerHTML = `<span>${Math.round(bx)}’</span>` + vals.map(([s, p]) => `<b style="color:${s.color === 'var(--text-2)' ? 'var(--text)' : s.color}">${esc(s.name)} ${Math.round(p[1] * 100)}¢</b>`).join(''); };
  const hit = svg.querySelector('.hit'); hit.addEventListener('mousemove', e => move(e.clientX)); hit.addEventListener('touchmove', e => move(e.touches[0].clientX), { passive: true }); const leave = () => { hov.style.display = 'none'; tip.style.opacity = 0; }; hit.addEventListener('mouseleave', leave); hit.addEventListener('touchend', leave);
}

const SPORT_IC = { Football: 'soccer', Basketball: 'basketball', 'American Football': 'amfootball', Baseball: 'baseball', Hockey: 'hockey', 'Australian Football': 'amfootball', Tennis: 'tennis', Motorsport: 'racing', MMA: 'target', Boxing: 'target', Esports: 'play', Golf: 'flag', Rugby: 'ball', Cricket: 'ball' };
Object.assign(P, { baseball: '<circle cx="12" cy="12" r="9"/><path d="M6.5 5.5c2 2 2 11 0 13M17.5 5.5c-2 2-2 11 0 13"/>', hockey: '<path d="M4 3l7 14h8a2 2 0 0 1 0 4H9a2 2 0 0 1-1.8-1.1L2 6"/><ellipse cx="17" cy="14" rx="3" ry="1.3"/>' });
Object.assign(P, { target: P.target, coin: '<circle cx="12" cy="12" r="9"/><path d="M14.8 9a2.8 2.8 0 0 0-2.8-1.5c-1.7 0-2.8.9-2.8 2.1 0 2.9 5.6 1.6 5.6 4.6 0 1.2-1.2 2.3-2.8 2.3a3 3 0 0 1-2.9-1.7M12 6v1.5M12 16.5V18"/>', plug: '<path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0zM12 17v5"/>', ext: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>' });

/* ---------- misc helpers ---------- */
const nz = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const jparse = (v) => { if (Array.isArray(v)) return v; try { const j = JSON.parse(v || '[]'); return Array.isArray(j) ? j : []; } catch (e) { return []; } };
const shortW = (a) => a ? String(a).slice(0, 4) + '…' + String(a).slice(-4) : '';
const toMs = (t) => { if (t == null || t === '') return null; if (typeof t === 'number' || /^\d+$/.test(String(t))) { const n = Number(t); return n < 1e11 ? n * 1000 : n; } const d = Date.parse(t); return Number.isFinite(d) ? d : null; };
const agoT = (t) => { const a = ago(t); return a === 'now' ? 'just now' : /^\d+[mhd]$/.test(a) ? a + ' ago' : 'on ' + a; };
const fmtPx = (p) => p == null ? '—' : p >= 1000 ? usd(p, 2) : p >= 1 ? usd(p, p < 10 ? 4 : 2) : '$' + p.toPrecision(4);
const fmtNum = (n, d = 2) => n == null || !Number.isFinite(+n) ? '—' : (+n).toLocaleString('en-US', { maximumFractionDigits: d });
const pctOrDash = (n) => n == null || !Number.isFinite(+n) ? '—' : pct(+n, 2);
function emptyState({ icon = 'search', title, body, cta = '' }) { return `<div class="empty"><div class="ei">${ic(icon)}</div><h3>${title}</h3><p>${body}</p>${cta}</div>`; }
function unavailable(what, detail, cta = '') { return `<div class="unavail">${ic('plug')}<div><b>${what}</b><p>${detail}</p>${cta}</div></div>`; }
function skeletonCards(n = 6) { return `<div class="grid gauto">${Array.from({ length: n }, () => `<div class="mcard"><div class="sk" style="height:14px;width:40%"></div><div class="sk" style="height:18px;width:92%"></div><div class="sk" style="height:18px;width:70%"></div><div class="sk" style="height:40px"></div></div>`).join('')}</div>`; }
function skeletonPage() { return `<div class="page"><div class="sk" style="height:28px;width:280px;margin-bottom:10px"></div><div class="sk" style="height:16px;width:420px;max-width:100%;margin-bottom:28px"></div>${skeletonCards(6)}</div>`; }
function avatarFor(name, img, size = '') {
  if (img && /^https:\/\//.test(img)) return `<span class="avatar ${size}" style="background:var(--card-3);overflow:hidden"><img src="${esc(img)}" alt="" style="width:100%;height:100%;object-fit:cover" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()"></span>`;
  const hue = hashStr(String(name || '?')) % 360;
  return `<span class="avatar ${size}" style="background:linear-gradient(135deg,hsl(${hue} 55% 42%),hsl(${(hue + 40) % 360} 50% 30%))" aria-hidden="true">${esc(String(name || '?').replace(/^0x/, '').replace(/^@/, '').slice(0, 2).toUpperCase())}</span>`;
}
function flashEl(el, up) { el.classList.remove('tick-up', 'tick-down'); void el.offsetWidth; el.classList.add(up ? 'tick-up' : 'tick-down'); }
function setText(sel, text, flash) { $$(sel).forEach(el => { if (el.textContent !== text) { const up = parseFloat(text.replace(/[^\d.-]/g, '')) >= parseFloat(el.textContent.replace(/[^\d.-]/g, '')); el.textContent = text; if (flash) flashEl(el, up); } }); }

/* ---------- chart mount registry: views register how to draw each data-chart kind ---------- */
const ChartKinds = {};
function mountChartEl(el) { const fn = ChartKinds[el.dataset.chart]; if (fn) { fn(el); ro.observe(el); } }
function hydrate(root = document) { $$('[data-chart]', root).forEach(mountChartEl); }

/* ---------- tiny event bus ---------- */
const Bus = { h: {}, on(ev, fn) { (this.h[ev] = this.h[ev] || new Set()).add(fn); return () => this.h[ev].delete(fn); }, emit(ev, d) { (this.h[ev] || []).forEach(fn => { try { fn(d); } catch (e) { console.error(ev, e); } }); } };

/* ---------- per-user preferences & app state (browser storage; no market or balance data) ---------- */
const LS_KEY = 'nexis-v4';
const Store = {
  s: null, key: LS_KEY + ':guest',
  fresh() { return { v: 4, settings: { notifyTracked: true, notifyMoves: true, notifyTx: true, notifyGoals: true, liveAI: true }, tracked: [], trackerLog: [], notifs: [], txs: [], entries: {}, copy: {}, followedEvents: [], watch: [] }; },
  init(uid) {
    this.key = LS_KEY + ':' + (uid || 'guest'); let saved = null;
    try { saved = JSON.parse(localStorage.getItem(this.key) || 'null'); } catch (e) { saved = null; }
    this.s = saved && saved.v === 4 ? { ...this.fresh(), ...saved, settings: { ...this.fresh().settings, ...(saved.settings || {}) } } : this.fresh();
    Bus.emit('store');
  },
  save() { try { localStorage.setItem(this.key, JSON.stringify(this.s)); } catch (e) { /* storage unavailable: session only */ } },
  emit(ev) { this.save(); Bus.emit('store', ev); },
};

/* ---------- shared view state ---------- */
const UI = { trade: {}, markets: { cat: 'all', sort: 'popular', q: '', limit: 60 }, crypto: { sort: 'mcap', q: '' }, sports: { filter: 'All', mode: 'book' }, tracker: { tab: 'Positions', q: '', results: null }, portfolio: { tab: 'Positions' }, activity: { tab: 'Panta' }, chartRange: {} };
const Views = {};
let current = { route: null, arg: null, params: new URLSearchParams() };
