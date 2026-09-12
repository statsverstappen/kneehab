/* Kneehab v2 · app.js
   UI layer. State lives in localStorage under kneehab_v2 and is migrated
   automatically from the v1 keys (sbkr_log_v1 / sbkr_start_v1). */

import * as P from './protocol.js';
import * as E from './engine.js';
import { ingestFiles, mergeActivities, mergeDaily, torqueNm, timeAboveTorque, reindexActivities } from './garmin.js';
import { pullRemote, lastSync } from './sync.js';

/* ============================== store ============================== */

const KEY = 'kneehab_v2';
const V1_LOG = 'sbkr_log_v1', V1_START = 'sbkr_start_v1';

const DEFAULT_STORE = () => ({
  schema: 2,
  sessions: [],
  garmin: { activities: [], daily: [] },
  settings: {
    startDate: '', surgeryDate: '', ftp: P.FTP_DEFAULT,
    operatedSide: 'left', phaseOverride: null, rideMap: {}
  }
});

let store = DEFAULT_STORE();
let ui = { tab: 'today', logType: 'A', logSwell: '0', viewDay: null, expanded: {}, ql: { type: null, swell: '0', pain: '0', flag: false } };

function loadStore() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch { s = null; }
  if (s && s.schema === 2) {
    store = { ...DEFAULT_STORE(), ...s };
    store.garmin = { activities: [], daily: [], ...(s.garmin || {}) };
    store.settings = { ...DEFAULT_STORE().settings, ...(s.settings || {}) };
    // fold together anything saved under an older activity key, and persist
    // the rewritten ids so the next import matches against them
    const before = store.garmin.activities.map(a => a.id).join('|');
    store.garmin.activities = reindexActivities(store.garmin.activities);
    if (store.garmin.activities.map(a => a.id).join('|') !== before) saveStore();
    return;
  }
  store = DEFAULT_STORE();
  try {
    const old = JSON.parse(localStorage.getItem(V1_LOG));
    if (Array.isArray(old) && old.length) store.sessions = old;
    const oldStart = localStorage.getItem(V1_START);
    if (oldStart) store.settings.startDate = oldStart;
    if (store.sessions.length || oldStart) saveStore();
  } catch { /* nothing to migrate */ }
}

function saveStore() {
  try { localStorage.setItem(KEY, JSON.stringify(store)); }
  catch (e) { alert('Could not save. Browser storage may be full or unavailable.'); }
}

/* ============================== helpers ============================== */

const $ = sel => document.querySelector(sel);
const esc = s => { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; };
const n1 = v => v == null ? '–' : (Math.round(v * 10) / 10).toFixed(1);
const n0 = v => v == null ? '–' : String(Math.round(v));
const pct = v => v == null ? '–' : `${(Math.round(v * 10) / 10).toFixed(1)}%`;
const hhmm = sec => sec == null ? '–' : `${Math.floor(sec / 3600) ? Math.floor(sec / 3600) + 'h ' : ''}${Math.round((sec % 3600) / 60)}m`;
const stateClass = s => s === 'ok' ? 'ok' : s === 'warn' ? 'warn' : s === 'bad' ? 'bad' : '';

/* ============================== charts ============================== */

/** Charts are drawn at close to their on-screen pixel size so axis text stays
 *  legible on a phone instead of being scaled down with the viewBox. */
function chartDims() {
  const avail = (document.querySelector('main')?.clientWidth || 720) - 34;
  const w = Math.max(300, Math.min(720, avail));
  return { w, h: w < 470 ? 200 : 190, pl: 38, pr: 14, pt: 14, pb: 24 };
}

/** One time-axis chart: optional bars, any number of line series, reference
 *  lines. Single y-scale by design; a second measure gets its own chart. */
function timeChart({ from, to, bars = null, lines = [], refLines = [], yLabel = '', id, fmtV = n0, unit = '' }) {
  const days = E.daysBetween(from, to);
  if (days < 1) return '<p class="empty">Not enough data yet.</p>';
  const dims = chartDims();
  const { w, h, pl, pr, pt, pb } = dims;
  const iw = w - pl - pr, ih = h - pt - pb;
  const xOf = d => pl + (E.daysBetween(from, d) / days) * iw;

  let vals = [];
  if (bars) vals = vals.concat(bars.map(b => b.y));
  for (const s of lines) vals = vals.concat(s.points.map(p => p.y));
  for (const r of refLines) vals.push(r.y);
  vals = vals.filter(v => v != null && isFinite(v));
  if (!vals.length) return '<p class="empty">No values in this window yet.</p>';
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (bars) lo = Math.min(lo, 0);
  const padY = (hi - lo) * 0.12 || 1;
  hi += padY; lo = lo === 0 ? 0 : lo - padY;
  const yOf = v => pt + ih - ((v - lo) / (hi - lo)) * ih;

  const ticks = 4;
  let g = '';
  for (let i = 0; i <= ticks; i++) {
    const v = lo + (hi - lo) * (i / ticks), y = yOf(v);
    g += `<line class="grid" x1="${pl}" y1="${y.toFixed(1)}" x2="${w - pr}" y2="${y.toFixed(1)}" opacity="${i === 0 ? 1 : .5}"/>`
       + `<text x="${pl - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end">${fmtV(v)}</text>`;
  }

  let bs = '';
  if (bars) {
    const bw = Math.max(2, Math.min(14, iw / (days + 1) - 2));
    for (const b of bars) {
      if (!b.y) continue;
      const x = xOf(b.x) - bw / 2, y = yOf(b.y);
      bs += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, yOf(0) - y).toFixed(1)}" rx="2" fill="#33404F" fill-opacity="${b.estimated ? .5 : 1}"/>`;
    }
  }

  let rl = '';
  for (const r of refLines) {
    const y = yOf(r.y);
    rl += `<line x1="${pl}" y1="${y.toFixed(1)}" x2="${w - pr}" y2="${y.toFixed(1)}" stroke="${r.color}" stroke-width="1.5" stroke-dasharray="2 4" opacity=".85"/>`
        + `<text x="${w - pr}" y="${(y - 5).toFixed(1)}" text-anchor="end" fill="${r.color}">${esc(r.label)}</text>`;
  }

  let ls = '';
  for (const s of lines) {
    const pts = s.points.filter(p => p.y != null && isFinite(p.y));
    if (!pts.length) continue;
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${xOf(p.x).toFixed(1)} ${yOf(p.y).toFixed(1)}`).join(' ');
    ls += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}/>`;
    const last = pts[pts.length - 1];
    ls += `<circle cx="${xOf(last.x).toFixed(1)}" cy="${yOf(last.y).toFixed(1)}" r="4" fill="${s.color}" stroke="var(--card)" stroke-width="2"/>`;
    if (s.labelEnd !== false) {
      ls += `<text x="${(xOf(last.x) - 8).toFixed(1)}" y="${(yOf(last.y) - 9).toFixed(1)}" text-anchor="end" fill="${s.color}">${esc(s.name)} ${fmtV(last.y)}</text>`;
    }
  }

  // x labels: first, middle, last
  let xl = '';
  for (const frac of [0, 0.5, 1]) {
    const d = E.shiftDate(from, Math.round(days * frac));
    const anchor = frac === 0 ? 'start' : frac === 1 ? 'end' : 'middle';
    xl += `<text x="${xOf(d).toFixed(1)}" y="${h - 6}" text-anchor="${anchor}">${E.fmtDate(d)}</text>`;
  }

  const payload = esc(JSON.stringify({
    from, to, unit, dims,
    lines: lines.map(s => ({ name: s.name, color: s.color, points: s.points })),
    bars: bars ? bars.filter(b => b.y).map(b => ({ x: b.x, y: b.y })) : null
  }));

  return `<svg class="chart-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(yLabel)}" data-chart="${payload}" data-id="${id || ''}">
    ${g}${bs}${rl}${ls}
    <line class="axis" x1="${pl}" y1="${pt}" x2="${pl}" y2="${h - pb}"/>
    ${xl}
    <line class="cross" x1="0" y1="${pt}" x2="0" y2="${h - pb}" stroke="var(--ink-mute)" stroke-width="1" opacity="0"/>
  </svg>`;
}

/** Horizontal bars over a categorical axis (gradient bands), one series,
 *  with an optional reference line. Values are labelled directly, so there is
 *  nothing to look up in a legend. */
function binChart({ bins, refLine = null, unit = '', fmt = n1 }) {
  const rows = bins.filter(b => b.value != null);
  if (!rows.length) return '<p class="empty">No data in this ride.</p>';
  const w = chartDims().w, rowH = 26, padL = 62, padR = 46, padT = refLine ? 16 : 6;
  const h = padT + rows.length * rowH + 16;
  const max = Math.max(...rows.map(r => r.value), refLine?.value ?? 0) * 1.12 || 1;
  const xOf = v => padL + (v / max) * (w - padL - padR);

  let out = '';
  rows.forEach((r, i) => {
    const y = padT + i * rowH;
    out += `<text x="${padL - 8}" y="${y + rowH / 2 + 3}" text-anchor="end">${esc(r.label)}</text>`
         + `<rect x="${padL}" y="${y + 5}" width="${Math.max(1, xOf(r.value) - padL).toFixed(1)}" height="${rowH - 12}" rx="3" fill="var(--s1)"/>`
         + `<text x="${(xOf(r.value) + 6).toFixed(1)}" y="${y + rowH / 2 + 3}" fill="var(--ink-soft)">${fmt(r.value)}${esc(unit)}${r.sub ? ` <tspan fill="var(--ink-mute)">${esc(r.sub)}</tspan>` : ''}</text>`;
  });
  if (refLine) {
    const x = xOf(refLine.value);
    out += `<line x1="${x.toFixed(1)}" y1="${padT - 4}" x2="${x.toFixed(1)}" y2="${padT + rows.length * rowH}" stroke="var(--amber)" stroke-width="1.5" stroke-dasharray="3 3"/>`
         + `<text x="${x.toFixed(1)}" y="${padT - 7}" text-anchor="middle" fill="var(--amber)">${esc(refLine.label)}</text>`;
  }
  return `<svg class="chart-svg" viewBox="0 0 ${w} ${h}" role="img">${out}</svg>`;
}

function dial(score, band) {
  const col = band === 'green' ? 'var(--green)' : band === 'amber' ? 'var(--amber)' : band === 'red' ? 'var(--red)' : 'var(--ink-mute)';
  const r = 46, c = 2 * Math.PI * r, frac = score == null ? 0 : score / 100;
  return `<div class="dial">
    <svg viewBox="0 0 112 112" width="112" height="112" aria-hidden="true">
      <circle cx="56" cy="56" r="${r}" fill="none" stroke="#222b36" stroke-width="9"/>
      <circle cx="56" cy="56" r="${r}" fill="none" stroke="${col}" stroke-width="9" stroke-linecap="round"
        stroke-dasharray="${(c * frac).toFixed(1)} ${c.toFixed(1)}"/>
    </svg>
    <div class="val"><b>${score == null ? '–' : score}</b><span>Readiness</span></div>
  </div>`;
}

/* tooltip */
let tipEl = null;
function initChartTips() {
  document.addEventListener('pointermove', ev => {
    const svg = ev.target.closest?.('svg.chart-svg');
    if (!svg) { hideTip(); return; }
    let data;
    try { data = JSON.parse(svg.dataset.chart); } catch { return; }
    const D = data.dims || { w: 720, pl: 38, pr: 14 };
    const box = svg.getBoundingClientRect();
    const sx = (ev.clientX - box.left) / box.width * D.w;
    const days = E.daysBetween(data.from, data.to);
    const frac = (sx - D.pl) / (D.w - D.pl - D.pr);
    if (frac < -0.05 || frac > 1.05) { hideTip(); return; }
    const date = E.shiftDate(data.from, Math.round(Math.max(0, Math.min(1, frac)) * days));
    const rows = [];
    for (const s of data.lines) {
      const p = s.points.find(q => q.x === date);
      if (p && p.y != null) rows.push({ color: s.color, name: s.name, v: p.y });
    }
    if (data.bars) {
      const b = data.bars.find(q => q.x === date);
      if (b) rows.push({ color: '#33404F', name: 'Daily', v: b.y });
    }
    if (!rows.length) { hideTip(); return; }
    showTip(ev, `<b>${E.fmtDate(date)}</b>` + rows.map(r =>
      `<div class="k"><i style="background:${r.color}"></i>${esc(r.name)}: ${n1(r.v)}${esc(data.unit || '')}</div>`).join(''));
    const x = D.pl + frac * (D.w - D.pl - D.pr);
    const cross = svg.querySelector('.cross');
    if (cross) { cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('opacity', '.5'); }
  });
  document.addEventListener('pointerleave', hideTip);
}
function showTip(ev, html) {
  if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tip'; document.body.appendChild(tipEl); }
  tipEl.innerHTML = html;
  tipEl.style.left = Math.min(window.innerWidth - 245, ev.clientX + 14) + 'px';
  tipEl.style.top = Math.max(8, ev.clientY - 60) + 'px';
  tipEl.style.display = 'block';
}
function hideTip() {
  if (tipEl) tipEl.style.display = 'none';
  document.querySelectorAll('svg.chart-svg .cross').forEach(c => c.setAttribute('opacity', '0'));
}

/* ============================== TODAY ============================== */

function renderToday() {
  const today = E.todayISO();
  const r = E.computeReadiness(store, today);
  const plan = E.plannedSession(store, today);
  const ph = E.phaseFor(store, today);
  const gates = E.computeGates(store, today);
  const code = plan.entry?.code || null;
  const adapt = E.adaptFor(code, r.band);

  const bandCopy = {
    green: 'Train as prescribed.',
    amber: 'Train, but soften the session below.',
    red: 'Do not load the knee today.',
    unknown: 'Log a session or import Garmin data to score the day.'
  }[r.band];

  let html = `<div class="card">
    <div class="hero">
      ${dial(r.band === 'unknown' ? null : r.score, r.band)}
      <div class="hero-txt">
        <span class="band-pill band-${r.band}"><i></i>${esc(r.bandLabel)}</span>
        <p style="margin:9px 0 4px">${esc(bandCopy)}</p>
        <p class="small muted" style="margin:0">${esc(ph.label)}${r.coverage < 0.99 ? ` · scored on ${Math.round(r.coverage * 100)}% of inputs` : ''}</p>
      </div>
    </div>
    ${r.overrides.map(o => {
      const head = o.level === 'red' ? 'Stop rule' : o.level === 'amber' ? 'Caution' : 'Thin data';
      return `<div class="notice n-${o.level}"><b>${head}</b>${esc(o.text)}</div>`;
    }).join('')}
  </div>`;

  /* quick log: the two numbers the protocol actually runs on */
  html += quickLogCard(code, plan);

  /* today's session, drills folded away */
  html += `<div class="card">
    <span class="cap">Today's session</span>
    <h3 style="margin-top:4px">${esc(plan.entry?.tag || 'Rest')}</h3>
    <p class="small muted" style="margin:6px 0 0">${esc(plan.entry?.sub || '')}</p>
    ${plan.note ? `<p class="small" style="color:${/✓/.test(plan.note) ? 'var(--green)' : 'var(--amber)'};margin:8px 0 0">${esc(plan.note)}</p>` : ''}
    ${adapt.length ? `<div class="notice n-${r.band}"><b>Adapted for ${r.bandLabel.toLowerCase()}</b><ul style="margin:6px 0 0;padding-left:18px">${adapt.map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>` : ''}
    ${code ? `<details class="fold"><summary>Session detail</summary>${sessionDetail(code, ph.phase)}</details>` : ''}
  </div>`;

  /* everything else behind one fold */
  html += `<details class="fold card-fold"><summary class="card-summary">Score breakdown and impact gates</summary>
    <div class="card">
      <span class="cap">What went into the score</span>
      <div style="margin-top:8px">${r.components.map(c => {
        const p = c.pts == null ? 0 : (c.pts / c.max) * 100;
        return `<div class="comp st-${stateClass(c.state) || 'none'}">
          <div class="nm">${esc(c.label)}</div>
          <div class="sc">${c.pts == null ? 'no data' : `${Math.round(c.pts)}/${c.max}`}</div>
          <div class="meter"><i style="width:${p.toFixed(0)}%"></i></div>
          <div class="dt">${esc(c.detail)}</div>
        </div>`;
      }).join('')}</div>
      <p class="small muted" style="margin:12px 0 0">Garmin data can only lower this score. Swelling and the 24-hour flag override it outright.</p>
    </div>
    ${gateBoard(gates)}
  </details>`;
  return html;
}

/** The fast path. Type defaults to today's planned session; "Check-in" is a
    grade with no session attached, for mornings and rest days. */
function quickLogCard(code, plan) {
  const today = E.todayISO();
  if (ui.ql.type == null) {
    // today's own slot first, then whatever the planner is carrying over, else a bare check-in
    const slot = P.WEEK_PLAN.find(p => p.dow === E.dowOf(today))?.code || null;
    ui.ql.type = (slot && !plan.logged[slot]) ? slot : (code && !plan.logged[code]) ? code : 'CHK';
  }
  const last = store.sessions.filter(s => s.date < today).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)[0] || null;
  const types = [['CHK', 'Check-in'], ['A', 'Climb A'], ['B', 'Climb B'], ['R1', 'R1'], ['R2', 'R2'], ['R3', 'R3'], ['PT', 'PT'], ['WJ', 'Walk–jog']];
  return `<div class="card ql">
    <span class="cap">Quick log · ${E.fmtDate(today)}</span>
    <div class="seg ql-seg" data-ql="type" style="margin-top:8px">
      ${types.map(([v, l]) => `<button data-v="${v}"${ui.ql.type === v ? ' class="on"' : ''}>${esc(l)}</button>`).join('')}
    </div>
    <div class="ql-row"><span class="cap">Swelling</span>
      <div class="seg ql-seg" data-ql="swell">${['0', '1', '2', '3', '4'].map(v => `<button data-v="${v}"${ui.ql.swell === v ? ' class="on"' : ''}>${v}${v === '0' ? '' : '+'}</button>`).join('')}</div></div>
    <div class="ql-row"><span class="cap">Pain</span>
      <div class="seg ql-seg tight" data-ql="pain">${[...Array(11).keys()].map(v => `<button data-v="${v}"${ui.ql.pain === String(v) ? ' class="on"' : ''}>${v}</button>`).join('')}</div></div>
    ${last ? `<label class="ql-flag"><input type="checkbox" id="ql-flag"${ui.ql.flag ? ' checked' : ''}> 24h flag on ${esc(P.SESSION_LABELS[last.type] || last.type)} ${E.fmtDate(last.date)} (swelling or pain this morning)</label>` : ''}
    <div class="row" style="margin-top:12px">
      <button class="btn" data-act="ql-save">Save</button>
      <button class="btn ghost" data-act="go-log">Full entry</button>
      ${code && P.RIDE_CODES.includes(code) ? `<button class="btn ghost" data-act="go-garmin">Import ride</button>` : ''}
    </div>
  </div>`;
}

/** Shared by the quick-log card and the ?s=&p= URL entry point. */
function addQuickEntry({ type = 'CHK', swell = null, pain = null, flag = false, date = null, notes = '', rpe = null }) {
  const d = date || E.todayISO();
  const msgs = [];
  if (flag) {
    const last = store.sessions.filter(s => s.date < d).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)[0];
    if (last) { last.flag24 = true; msgs.push(`24-hour flag set on ${P.SESSION_LABELS[last.type] || last.type} ${E.fmtDate(last.date)}. Repeat the previous week, do not progress.`); }
  }
  // a check-in with nothing graded and no flag is a no-op
  if (type === 'CHK' && swell == null && pain == null && !notes) { saveStore(); return msgs; }
  // if today's session of that type is already logged but ungraded (Garmin-added), grade it
  const existing = type !== 'CHK' ? store.sessions.find(s => s.date === d && s.type === type) : null;
  if (existing) {
    if (swell != null) existing.swell = swell;
    if (pain != null) existing.pain = pain;
    if (rpe != null) existing.rpe = rpe;
    if (notes) existing.notes = existing.notes ? `${existing.notes} · ${notes}` : notes;
    msgs.push(`Updated ${P.SESSION_LABELS[type] || type} for ${E.fmtDate(d)}.`);
  } else {
    store.sessions.push({
      id: Date.now(), date: d, type, phase: E.phaseFor(store, d).phase,
      pain, swell, rpe, notes, flag24: null, src: 'quick'
    });
    msgs.push(`${type === 'CHK' ? 'Check-in' : (P.SESSION_LABELS[type] || type)} saved for ${E.fmtDate(d)}.`);
  }
  if (swell != null && swell >= 3) msgs.push(`Swelling ${swell}+. Drop back a phase, ice and elevate${swell >= 4 ? ', and contact your surgeon' : ''}.`);
  else if (swell === 2) msgs.push('Swelling 2+. No progression this week.');
  saveStore();
  return msgs;
}

/** ?s=1&p=2&t=R3&f=1&d=2026-09-12&rpe=6&n=notes  → log and strip the query.
    Built for a home-screen Shortcut: two questions, one URL, done. */
function quickLogFromUrl() {
  const q = new URLSearchParams(location.search);
  if (!q.has('s') && !q.has('p') && !q.has('f') && !q.has('t')) return null;
  const int = k => q.has(k) && q.get(k) !== '' ? parseInt(q.get(k), 10) : null;
  const opts = {
    type: (q.get('t') || 'CHK').toUpperCase(), swell: int('s'), pain: int('p'), rpe: int('rpe'),
    flag: q.get('f') === '1', date: /^\d{4}-\d{2}-\d{2}$/.test(q.get('d') || '') ? q.get('d') : null,
    notes: (q.get('n') || '').trim()
  };
  if (opts.swell != null && !(opts.swell >= 0 && opts.swell <= 4)) opts.swell = null;
  if (opts.pain != null && !(opts.pain >= 0 && opts.pain <= 10)) opts.pain = null;
  const msgs = addQuickEntry(opts);
  history.replaceState(null, '', location.pathname);
  return msgs;
}

function toast(lines) {
  if (!lines || !lines.length) return;
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.innerHTML = lines.map(esc).join('<br>');
  el.classList.add('on');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('on'), 4200);
}

function gateBoard(gates) {
  return `<div class="card">
    <span class="cap">Impact gates · YBT-A</span>
    <div class="grid2" style="margin-top:10px">
      ${gates.gates.map(g => `<div class="stat">
        <span class="chip ${g.open ? 'ok' : 'bad'}">${g.open ? 'Unlocked' : 'Locked'}</span>
        <b style="font-size:19px;margin-top:7px">${esc(g.name)}</b>
        <div class="sub">${esc(g.need)}</div>
        ${g.open ? '' : `<div class="sub" style="color:var(--amber);margin-top:5px">${g.reasons.map(esc).join('<br>')}</div>`}
      </div>`).join('')}
    </div>
    ${gates.latest ? `<p class="small muted" style="margin:12px 0 0">Last YBT-A ${E.fmtDate(gates.latest.date)}: SSD ${n1(gates.latest.ssd)} cm · depth ${n0(gates.latest.pctLL)}% LL · LSI ${n0(gates.latest.lsi)}%.
      ${gates.retestDue ? `<span style="color:var(--amber)">Retest due, ${gates.staleDays} days since the last one.</span>` : `Next retest in ${21 - gates.staleDays} days.`}</p>`
      : `<p class="small muted" style="margin:12px 0 0">No YBT-A logged yet. Log one from the Log tab to open these gates.</p>`}
  </div>`;
}

function sessionDetail(code, phase) {
  if (P.RIDE_CODES.includes(code)) {
    const s = P.RIDES[code], ftp = store.settings.ftp;
    return `<hr class="sep"><div class="tbl-scroll"><table>
      <thead><tr><th>Block</th><th>Time</th><th>Target</th><th>Cadence / notes</th></tr></thead>
      <tbody>${s.blocks.map(b => `<tr>
        <td>${esc(b.block)}</td><td class="num">${esc(b.time)}</td>
        <td class="num">${esc(b.pct)}<br><span style="color:var(--blue)">${wattsFor(b.pct, ftp)}</span></td>
        <td class="small muted">${esc(b.note)}</td></tr>`).join('')}</tbody>
    </table></div><p class="small muted" style="margin:9px 0 0">${esc(s.phaseNote)}</p>`;
  }
  if (code === 'A' || code === 'B') {
    const ph = P.PHASES[phase - 1];
    const blocks = code === 'A' ? ph.blocks : null;
    let out = `<hr class="sep"><p class="small muted">${esc(ph.intro)}</p>`;
    if (code === 'A') {
      out += blocks.map(b => drillTable(b)).join('');
      out += `<h4 style="margin-top:14px;font-size:13px">45:00–60:00 · Finisher</h4>` + finisherTable(true);
    } else {
      const end = P.ENDURANCE.byPhase[phase - 1];
      out += drillTable({ title: 'Endurance · 15:00–40:00', clock: `Phase ${phase}`, rows: end.rows });
      out += `<p class="small muted" style="margin:10px 0 0">40:00–52:00 · one Block A drill from Phase ${phase} at RPE 5. No hangboard.</p>`;
      out += `<h4 style="margin-top:14px;font-size:13px">52:00–60:00 · Core finisher</h4>` + finisherTable(false);
    }
    out += `<h4 style="margin-top:14px;font-size:13px">After climbing · PT strength stack</h4>` + ptStrengthTable();
    return out;
  }
  return '';
}

function wattsFor(pctStr, ftp) {
  const nums = (pctStr.match(/\d+(\.\d+)?/g) || []).map(Number).filter(v => v <= 200);
  if (!nums.length) return '';
  return nums.map(v => Math.round(ftp * v / 100) + ' W').join(' → ');
}

function drillTable(b) {
  return `<h4 style="margin-top:14px;font-size:13px">${esc(b.title)}</h4>
  <div class="cap" style="margin:2px 0 6px">${esc(b.clock || '')}</div>
  <div class="tbl-scroll"><table>
    <thead><tr><th>Drill</th><th>Sets × reps</th><th>Rest</th><th>Target</th></tr></thead>
    <tbody>${b.rows.map(r => `<tr>
      <td>${esc(r.drill)}${r.cue ? `<br><span class="chip key" style="margin-top:5px">${esc(r.cue)}</span>` : ''}</td>
      <td class="num">${esc(r.dose)}</td><td class="num">${esc(r.rest)}</td>
      <td class="small muted">${esc(r.target || '')}</td></tr>`).join('')}</tbody>
  </table></div>`;
}
function finisherTable(withHang) {
  const rows = P.FINISHER.filter(f => withHang || !f.sessionAonly);
  return `<div class="tbl-scroll"><table><thead><tr><th>Exercise</th><th>Sets × reps</th><th>Rest</th></tr></thead>
    <tbody>${rows.map(f => `<tr><td>${esc(f.ex)}</td><td class="num">${esc(f.dose)}</td><td class="num">${esc(f.rest)}</td></tr>`).join('')}</tbody></table></div>`;
}
function ptStrengthTable() {
  return `<div class="tbl-scroll"><table><thead><tr><th>Exercise</th><th>Dose</th><th>Notes</th></tr></thead>
    <tbody>${P.PT_STRENGTH.map(e => `<tr>
      <td>${esc(e.ex)}${e.tag ? ` <span class="chip ${e.tag === 'GATED' ? 'warn' : ''}">${esc(e.tag)}</span>` : ''}</td>
      <td class="num">${esc(e.dose)}</td><td class="small muted">${esc(e.note)}</td></tr>`).join('')}</tbody></table></div>`;
}

/* ============================== LOG ============================== */

function renderLog() {
  const today = E.todayISO();
  const ph = E.phaseFor(store, today);
  const data = store.sessions.slice().sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const ws = E.weekStartOf(today);
  const wk = data.filter(e => e.date >= ws);
  const wkClimb = wk.filter(e => e.type === 'A' || e.type === 'B').length;
  const wkBike = wk.filter(e => String(e.type)[0] === 'R').length;
  const last5 = data.slice(0, 5);

  return `<div class="card">
    <span class="cap">Log a session</span>
    <label class="fld"><span class="cap">Date</span><input type="date" id="log-date" value="${today}"></label>
    <label class="fld"><span class="cap">Session</span></label>
    <div class="seg" id="type-btns">
      ${[['A', 'A · Strength'], ['B', 'B · Endur'], ['R1', 'R1 · Z2'], ['R2', 'R2 · SS'], ['R3', 'R3 · Long'], ['PT', 'PT'], ['WJ', 'Walk–jog'], ['YBT', 'YBT-A']]
      .map(([v, l]) => `<button data-v="${v}"${ui.logType === v ? ' class="on"' : ''}>${esc(l)}</button>`).join('')}
    </div>
    <div id="ybt-fields" class="${ui.logType === 'YBT' ? '' : 'hidden'}">
      <div class="grid3">
        <label class="fld"><span class="cap">Leg length (cm)</span><input type="number" step="0.1" id="ybt-ll"></label>
        <label class="fld"><span class="cap">Left reach (cm)</span><input type="number" step="0.1" id="ybt-l"></label>
        <label class="fld"><span class="cap">Right reach (cm)</span><input type="number" step="0.1" id="ybt-r"></label>
      </div>
    </div>
    <label class="fld"><span class="cap">Knee pain during session (0–10) · <b id="pain-val">0</b></span>
      <input type="range" id="log-pain" min="0" max="10" step="1" value="0"></label>
    <label class="fld"><span class="cap">Swelling (0–4+) · primary signal</span></label>
    <div class="seg" id="swell-btns">
      ${['0', '1', '2', '3', '4'].map(v => `<button data-v="${v}"${ui.logSwell === v ? ' class="on"' : ''}>${v}${v === '0' ? '' : '+'}</button>`).join('')}
    </div>
    <label class="fld"><span class="cap">Session RPE (optional)</span>
      <input type="number" id="log-rpe" min="1" max="10" step="1" placeholder="1–10"></label>
    <label class="fld"><span class="cap">Notes</span><textarea id="log-notes" placeholder="Drills / intervals completed, cadence, what felt off"></textarea></label>
    <div class="row" style="margin-top:14px"><button class="btn" data-act="save-session">Save session</button>
      <span class="small muted">Logging as Phase ${ph.phase}</span></div>
  </div>

  <div class="card">
    <div class="grid3">
      <div class="stat"><b>${data.length}</b><span class="cap">Sessions</span></div>
      <div class="stat"><b>${wkClimb + wkBike} / 5</b><span class="cap">This week</span><div class="sub">Climb ${wkClimb}/2 · Bike ${wkBike}/3</div></div>
      <div class="stat"><b>${last5.length ? n1(last5.reduce((s, e) => s + e.pain, 0) / last5.length) : '–'}</b><span class="cap">Avg pain, last 5</span></div>
    </div>
  </div>

  ${painSwellChart()}

  <div class="card">
    <span class="cap">Entries</span>
    <div id="entries" style="margin-top:8px">
      ${data.length ? data.slice(0, 60).map(entryHtml).join('') : '<div class="empty">No sessions logged yet. The first one starts the clock.</div>'}
    </div>
    <div class="row" style="margin-top:12px">
      <button class="btn ghost" data-act="export">Export JSON</button>
      <button class="btn ghost" data-act="import">Import JSON</button>
      <input type="file" id="import-file" accept="application/json,.json" class="hidden">
    </div>
  </div>`;
}

function painSwellChart() {
  const today = E.todayISO(), from = E.shiftDate(today, -56);
  const rows = store.sessions.filter(s => s.date >= from && s.date <= today);
  if (rows.length < 3) return '';
  const byDate = new Map();
  for (const s of rows) {
    const cur = byDate.get(s.date) || { pain: 0, swell: 0 };
    cur.pain = Math.max(cur.pain, s.pain ?? 0);
    cur.swell = Math.max(cur.swell, s.swell ?? 0);
    byDate.set(s.date, cur);
  }
  const dates = [...byDate.keys()].sort();
  return `<div class="card"><figure class="chart">
    <figcaption><h4>Pain and swelling, 8 weeks</h4>
      <div class="legend"><span><i style="background:var(--s1)"></i>Pain 0–10</span><span><i style="background:var(--s2);height:3px"></i>Swelling 0–4</span></div>
    </figcaption>
    ${timeChart({
      from, to: today, id: 'painswell',
      lines: [
        { name: 'Pain', color: 'var(--s1)', points: dates.map(d => ({ x: d, y: byDate.get(d).pain })) },
        { name: 'Swelling', color: 'var(--s2)', dash: '5 4', points: dates.map(d => ({ x: d, y: byDate.get(d).swell })) }
      ],
      refLines: [{ y: 2, label: 'Swelling 2+ · no progression', color: 'var(--amber)' }],
      fmtV: n0
    })}
  </figure></div>`;
}

function entryHtml(e) {
  const tCls = e.type === 'A' ? 'key' : e.type === 'B' ? 'key' : e.type === 'PT' ? '' : e.type === 'YBT' ? 'ok' : '';
  const tLbl = P.SESSION_LABELS[e.type] || e.type;
  const rated = e.pain != null;
  const painCls = !rated ? '' : e.pain <= 2 ? 'ok' : e.pain <= 4 ? 'warn' : 'bad';
  let extra = '';
  if (e.src === 'garmin') extra += `<span class="chip key">From Garmin</span>`;
  if (!rated) extra += `<span class="chip warn">Needs pain &amp; swelling</span>`;
  if (e.swell != null) extra += `<span class="chip ${e.swell <= 1 ? 'ok' : e.swell === 2 ? 'warn' : 'bad'}">Swell ${e.swell}${e.swell ? '+' : ''}</span>`;
  if (e.type === 'YBT' && e.ll > 0) {
    const ssd = Math.abs(e.reachL - e.reachR), p = Math.min(e.reachL, e.reachR) / e.ll * 100;
    extra += `<span class="chip ${ssd <= 4 ? 'ok' : ssd <= 8 ? 'warn' : 'bad'}">SSD ${n1(ssd)} cm</span><span class="chip ${p >= 55 ? 'ok' : 'warn'}">${n0(p)}% LL</span>`;
  }
  if (e.rpe) extra += `<span class="chip">RPE ${e.rpe}</span>`;
  const flag = e.flag24 === true ? `<button class="flag-on" data-act="flag" data-id="${e.id}">⚠ 24h: swelling/pain</button>`
    : e.flag24 === false ? `<button class="flag-ok" data-act="flag" data-id="${e.id}">✓ 24h: clear</button>`
    : `<button data-act="flag" data-id="${e.id}">24h check · tap tomorrow</button>`;
  const painOpts = ['<option value="">–</option>']
    .concat([...Array(11).keys()].map(v => `<option value="${v}"${e.pain === v ? ' selected' : ''}>${v}</option>`)).join('');
  const swellOpts = ['<option value="">–</option>']
    .concat([0, 1, 2, 3, 4].map(v => `<option value="${v}"${e.swell === v ? ' selected' : ''}>${v}${v ? '+' : ''}</option>`)).join('');

  return `<div class="entry${rated ? '' : ' unrated'}">
    <div class="entry-top"><span class="d">${E.fmtDate(e.date)}</span>
      <span class="chip ${tCls}">${esc(tLbl)}</span>
      <span class="chip">Phase ${esc(String(e.phase ?? '–'))}</span>
      ${rated ? `<span class="chip ${painCls}">Pain ${e.pain}</span>` : ''}${extra}</div>
    ${e.notes ? `<div class="note-txt">${esc(e.notes)}</div>` : ''}
    <div class="entry-edit">
      <label>Pain <select data-act="edit-pain" data-id="${e.id}">${painOpts}</select></label>
      <label>Swelling <select data-act="edit-swell" data-id="${e.id}">${swellOpts}</select></label>
    </div>
    <div class="entry-actions">${flag}<button data-act="del" data-id="${e.id}">Delete</button></div>
  </div>`;
}

/** Rides Garmin knows about that the knee log has no entry for. Without the
 *  pain and swelling half, a ride is training data with no outcome attached. */
function missingRides() {
  const logged = new Set();
  for (const s of store.sessions) if (String(s.type)[0] === 'R') logged.add(s.date);
  const seen = new Set();
  return store.garmin.activities.filter(a => {
    if (a.sport !== 'cycling' || (a.durSec || 0) < 1200) return false;
    if (logged.has(a.date) || seen.has(a.date)) return false;
    seen.add(a.date);
    return true;
  });
}

/* ============================== GARMIN ============================== */

function renderGarmin() {
  const today = E.todayISO();
  const acts = store.garmin.activities;
  const daily = store.garmin.daily;
  const acwr = E.computeAcwr(acts, store.settings.ftp, today);
  const hrv = E.hrvStatus(daily, today);

  let html = `<div class="card">
    <span class="cap">Import</span>
    <div class="drop" id="drop" style="margin-top:10px">
      <h4>Drop Garmin files here</h4>
      <p class="small muted" style="margin:4px 0 12px">.fit activity files, the Garmin Connect activities .csv, wellness .json, or the whole Export Your Data .zip. Everything is parsed in this browser and nothing is uploaded.</p>
      <button class="btn" data-act="pick">Choose files</button>
      <input type="file" id="garmin-file" multiple accept=".fit,.csv,.json,.zip" class="hidden">
    </div>
    <div id="import-status" class="small muted" style="margin-top:10px"></div>
    <div class="grid3" style="margin-top:12px">
      <div class="stat"><b>${acts.length}</b><span class="cap">Activities</span></div>
      <div class="stat"><b>${daily.length}</b><span class="cap">Wellness days</span></div>
      <div class="stat"><b>${acwr.ratio == null || acwr.chronic < 15 ? '–' : n1(acwr.ratio)}</b><span class="cap">Acute:chronic</span>
        <div class="sub">${acwr.chronic < 15 ? 'needs ~4 weeks of history' : `${n0(acwr.acute)} vs ${n0(acwr.chronic)} TSS`}</div></div>
    </div>
  </div>`;

  const missing = missingRides();
  if (missing.length) {
    html += `<div class="card">
      <span class="cap">Unlogged rides</span>
      <p class="small" style="margin:8px 0 0">${missing.length} ride${missing.length === 1 ? '' : 's'} in your Garmin history ${missing.length === 1 ? 'has' : 'have'} no entry in the knee log, so there is no pain or swelling reading attached to ${missing.length === 1 ? 'it' : 'them'}.</p>
      <div class="tbl-scroll" style="margin-top:8px"><table>
        <thead><tr><th>Date</th><th>Would log as</th><th>Time</th><th>NP</th><th>Cadence</th></tr></thead>
        <tbody>${missing.map(a => `<tr>
          <td class="num">${E.fmtDate(a.date)}</td>
          <td>${esc(P.SESSION_LABELS[guessRideCode(a)] || 'Ride')}</td>
          <td class="num">${hhmm(a.durSec)}</td>
          <td class="num">${n0(a.np ?? a.avgPower)} W</td>
          <td class="num">${n0(a.avgCadence)} rpm</td></tr>`).join('')}</tbody>
      </table></div>
      <div class="row" style="margin-top:12px"><button class="btn" data-act="log-rides">Add ${missing.length} to the log</button></div>
      <p class="small muted" style="margin:8px 0 0">They go in unrated. Set pain and swelling on each from the Log tab, and change the session type there if I guessed it wrong.</p>
    </div>`;
  }

  if (acts.length) {
    const series = E.loadSeries(acts, store.settings.ftp, today, 56);
    const from = series[0].date;
    const rollAcute = [], rollChronic = [];
    // Partial windows at the left edge would draw a spike that is an artefact of
    // the import range, not of training, so they are left off the chart.
    for (let i = 0; i < series.length; i++) {
      const win7 = series.slice(Math.max(0, i - 6), i + 1);
      const win28 = series.slice(Math.max(0, i - 27), i + 1);
      if (i >= 6) rollAcute.push({ x: series[i].date, y: win7.reduce((s, d) => s + d.tss, 0) });
      if (i >= 13) rollChronic.push({ x: series[i].date, y: (win28.reduce((s, d) => s + d.tss, 0) / win28.length) * 7 });
    }
    html += `<div class="card"><figure class="chart">
      <figcaption><h4>Training load</h4>
        <p class="small muted" style="margin:2px 0 0">Daily TSS with the 7-day total against the 28-day rolling equivalent. When the blue line pulls well above the pink one, the week has ramped faster than the base supports.</p>
        <div class="legend"><span><i style="background:#33404F;height:9px;width:9px;border-radius:2px"></i>Daily TSS</span>
          <span><i style="background:var(--s1)"></i>7-day load</span>
          <span><i style="background:var(--s2)"></i>28-day baseline</span></div>
      </figcaption>
      ${timeChart({
        from, to: today, id: 'load', unit: ' TSS',
        bars: series.map(d => ({ x: d.date, y: d.tss, estimated: d.estimated })),
        lines: [
          { name: '7-day', color: 'var(--s1)', points: rollAcute },
          { name: '28-day', color: 'var(--s2)', dash: '5 4', points: rollChronic }
        ]
      })}
    </figure></div>`;
  }

  const hrvPts = daily.filter(d => d.hrv != null && d.date >= E.shiftDate(today, -56)).map(d => ({ x: d.date, y: d.hrv }));
  const rhrPts = daily.filter(d => d.rhr != null && d.date >= E.shiftDate(today, -56)).map(d => ({ x: d.date, y: d.rhr }));
  if (hrvPts.length > 3) {
    html += `<div class="card"><figure class="chart">
      <figcaption><h4>Overnight HRV</h4>
        <p class="small muted" style="margin:2px 0 0">${hrv.baseline ? `Baseline ${n0(hrv.baseline)} ms from ${hrv.n} nights. The dashed line is where the readiness score stops rewarding.` : 'Baseline needs about a week of nights.'}</p>
      </figcaption>
      ${timeChart({
        from: hrvPts[0].x, to: today, id: 'hrv', unit: ' ms',
        lines: [{ name: 'HRV', color: 'var(--s1)', points: hrvPts }],
        refLines: hrv.baseline ? [{ y: hrv.baseline, label: 'baseline', color: 'var(--ink-mute)' }] : []
      })}
    </figure></div>`;
  }
  if (rhrPts.length > 3) {
    html += `<div class="card"><figure class="chart">
      <figcaption><h4>Resting heart rate</h4></figcaption>
      ${timeChart({ from: rhrPts[0].x, to: today, id: 'rhr', unit: ' bpm', lines: [{ name: 'Resting HR', color: 'var(--s2)', points: rhrPts }] })}
    </figure></div>`;
  }

  /* activities table */
  if (acts.length) {
    const recent = acts.slice().reverse().slice(0, 40);
    html += `<div class="card"><span class="cap">Recent activities</span>
      <div class="tbl-scroll" style="margin-top:8px"><table>
        <thead><tr><th>Date</th><th>Sport</th><th>Time</th><th>Avg / NP</th><th>Cad</th><th>TSS</th><th>Op leg</th><th></th></tr></thead>
        <tbody>${recent.map(a => {
          const opShare = a.leftPct == null ? null : (store.settings.operatedSide === 'left' ? a.leftPct : 100 - a.leftPct);
          return `<tr>
            <td class="num">${E.fmtDate(a.date)}</td>
            <td>${esc((a.sport || '').replace('_', ' '))}</td>
            <td class="num">${hhmm(a.durSec)}</td>
            <td class="num">${a.avgPower ? `${n0(a.avgPower)} / ${n0(a.np)} W` : '–'}</td>
            <td class="num">${n0(a.avgCadence)}</td>
            <td class="num">${n0(E.activityLoad(a, store.settings.ftp).tss)}</td>
            <td class="num">${opShare == null ? '–' : `<span class="chip ${opShare >= 48 ? 'ok' : opShare >= 45 ? 'warn' : 'bad'}">${pct(opShare)}</span>`}</td>
            <td class="num"><button class="btn ghost" style="padding:4px 9px;font-size:12px" data-act="detail" data-id="${esc(a.id)}">${ui.expanded[a.id] ? 'Hide' : 'Check'}</button></td>
          </tr>${ui.expanded[a.id] ? `<tr><td colspan="8">${activityDetail(a)}</td></tr>` : ''}`;
        }).join('')}</tbody>
      </table></div></div>`;
  }
  return html;
}

function activityDetail(a) {
  const code = guessRideCode(a);
  const comp = code ? E.rideCompliance(a, code, store.settings.ftp) : null;
  let html = '';
  if (comp) {
    html += `<div class="cap">Checked against ${esc(comp.spec.name)}</div>
      <div style="margin-top:7px">${comp.findings.map(f =>
        `<div class="notice n-${f.level === 'warn' ? 'amber' : f.level === 'ok' ? 'green' : 'blue'}" style="margin:6px 0">${esc(f.text)}</div>`).join('')}</div>`;
  }
  const d = a.detail;
  const bits = [];
  if (a.teL != null) bits.push(`Torque effectiveness ${n1(a.teL)}% left / ${n1(a.teR)}% right`);
  if (a.psL != null) bits.push(`Pedal smoothness ${n1(a.psL)}% / ${n1(a.psR)}%`);
  if (d?.balanceSd != null) bits.push(`Balance steadiness ±${n1(d.balanceSd)}% over ${d.samples} samples`);
  if (d?.p95Torque != null) bits.push(`Peak sustained torque ${n1(d.p95Torque)} Nm (95th percentile)`);
  if (a.gctBalanceLeftPct != null) bits.push(`Ground contact balance ${n1(a.gctBalanceLeftPct)}% left`);
  if (bits.length) html += `<p class="small muted" style="margin:8px 0 0">${bits.map(esc).join(' · ')}</p>`;
  html += terrainBlock(a, comp);
  if (!html) html = '<p class="small muted">No detailed metrics in this file.</p>';
  return html;
}

/** What the legs did at each gradient. Only a FIT file carries the per-second
 *  altitude this needs; a CSV row knows the ride climbed 1,000 ft and nothing
 *  about where or how steeply. */
function terrainBlock(a, comp) {
  const t = a.terrain;
  if (!t) {
    return a.source === 'csv'
      ? `<hr class="sep"><p class="small muted">Terrain: ${a.distKm ? '' : ''}only the ride total is in a CSV export. Drop the .fit file for this ride to get gradient detail.</p>`
      : '';
  }
  const prescribed = comp?.targetTorque ?? null;
  const climbing = t.bins.filter(b => b.key !== 'desc' && b.key !== 'flat');
  const climbSec = climbing.reduce((s, b) => s + b.sec, 0);
  const lowCadSec = t.bins.reduce((s, b) => s + b.lowCadSec, 0);
  const overSec = prescribed ? timeAboveTorque(t, prescribed * 1.25) : null;

  return `<hr class="sep">
  <div class="cap">Terrain</div>
  <div class="grid3" style="margin:8px 0 12px">
    <div class="stat"><b>${Math.round((a.ascentM ?? t.ascentM) * 3.28084)}</b><span class="cap">ft climbed</span></div>
    <div class="stat"><b>${hhmm(climbSec)}</b><span class="cap">above 1%</span>
      <div class="sub">${n0((climbSec / t.movingSec) * 100)}% of the ride</div></div>
    <div class="stat"><b>${hhmm(lowCadSec)}</b><span class="cap">below 70 rpm</span>
      <div class="sub">${n0((lowCadSec / t.movingSec) * 100)}% of the ride</div></div>
  </div>
  ${overSec != null ? `<div class="notice n-${overSec > 300 ? 'amber' : 'green'}">
      <b>Crank torque</b>${hhmm(overSec)} spent more than 25% above the ${n1(prescribed)} Nm this session prescribes.</div>` : ''}
  <figure class="chart" style="margin-top:10px">
    <figcaption><h4 style="font-size:13px">Mean crank torque by gradient</h4></figcaption>
    ${binChart({
      bins: t.bins.map(b => ({ label: b.label, value: b.avgTorque, sub: b.sec ? `· ${Math.round(b.sec / 60)} min` : '' })),
      refLine: prescribed ? { value: prescribed, label: 'prescribed' } : null,
      unit: ' Nm'
    })}
  </figure>
  <div class="tbl-scroll" style="margin-top:10px"><table>
    <thead><tr><th>Gradient</th><th>Time</th><th>Share</th><th>Cadence</th><th>Power</th><th>Torque</th><th>Peak</th></tr></thead>
    <tbody>${t.bins.filter(b => b.sec).map(b => `<tr>
      <td>${esc(b.label)}</td>
      <td class="num">${hhmm(b.sec)}</td>
      <td class="num">${n0(b.pct)}%</td>
      <td class="num"><span class="chip ${b.avgCadence == null ? '' : b.avgCadence >= 85 ? 'ok' : b.avgCadence >= 70 ? 'warn' : 'bad'}">${n0(b.avgCadence)} rpm</span></td>
      <td class="num">${n0(b.avgPower)} W</td>
      <td class="num">${n1(b.avgTorque)} Nm</td>
      <td class="num">${n1(b.p95Torque)} Nm</td></tr>`).join('')}</tbody>
  </table></div>
  <p class="small muted" style="margin:8px 0 0">Gradient is taken over rolling 25 m runs of smoothed altitude, so a sustained pitch sitting exactly on a bin edge splits across two rows.</p>
  ${climbBlock(a)}`;
}

/** The climbs themselves. Total ascent alone cannot distinguish one sustained
 *  effort from a long shallow drift, and they are not the same knee exposure. */
function climbBlock(a) {
  const climbs = a.climbs;
  if (!climbs) return '';
  if (!climbs.length) {
    return `<hr class="sep"><div class="cap">Climbs</div>
      <p class="small muted" style="margin:6px 0 0">No sustained climb on this ride. Every rise was shallower than 2% or shorter than 150 m.</p>`;
  }
  const gain = climbs.reduce((s, c) => s + c.gainM, 0);
  const secs = climbs.reduce((s, c) => s + c.secs, 0);
  const total = a.ascentM ?? a.terrain?.ascentM ?? null;
  const steepest = climbs.reduce((m, c) => (c.maxGrade > (m?.maxGrade ?? -99) ? c : m), null);
  const hardest = climbs.reduce((m, c) => ((c.avgTorque ?? 0) > (m?.avgTorque ?? -1) ? c : m), null);

  return `<hr class="sep">
  <div class="cap">Climbs</div>
  <div class="grid3" style="margin:8px 0 12px">
    <div class="stat"><b>${climbs.length}</b><span class="cap">Climbs</span>
      <div class="sub">${hhmm(secs)} of climbing</div></div>
    <div class="stat"><b>${Math.round(gain * 3.28084)}</b><span class="cap">ft in climbs</span>
      ${total ? `<div class="sub">${n0((gain / total) * 100)}% of the ride's ascent</div>` : ''}</div>
    <div class="stat"><b>${n1(steepest?.maxGrade)}%</b><span class="cap">Steepest pitch</span>
      <div class="sub">at ${n1(steepest?.startKm)} km</div></div>
  </div>
  ${total && gain / total < 0.5 ? `<p class="small muted" style="margin:0 0 10px">Only ${n0((gain / total) * 100)}% of the ascent came from real climbs. The rest accumulated below 2%, which never feels like climbing while riding it.</p>` : ''}
  <div class="tbl-scroll"><table data-notimer="1">
    <thead><tr><th>#</th><th>At</th><th>Length</th><th>Gain</th><th>Time</th><th>Avg</th><th>Peak</th><th>Cadence</th><th>Power</th><th>Torque</th></tr></thead>
    <tbody>${climbs.map((c, i) => `<tr>
      <td class="num">${i + 1}</td>
      <td class="num">${n1(c.startKm)} km</td>
      <td class="num">${c.lenM} m</td>
      <td class="num">${n1(c.gainM)} m</td>
      <td class="num">${Math.floor(c.secs / 60)}:${String(c.secs % 60).padStart(2, '0')}</td>
      <td class="num">${n1(c.avgGrade)}%</td>
      <td class="num">${n1(c.maxGrade)}%</td>
      <td class="num"><span class="chip ${c.avgCadence == null ? '' : c.avgCadence >= 80 ? 'ok' : c.avgCadence >= 70 ? 'warn' : 'bad'}">${n0(c.avgCadence)}</span>${c.minCadence != null && c.minCadence < 40 ? `<br><span style="color:var(--amber)">min ${c.minCadence}</span>` : ''}</td>
      <td class="num">${n0(c.avgPower)} W</td>
      <td class="num">${n1(c.avgTorque)}<br><span style="color:var(--ink-mute)">pk ${n1(c.peakTorque)}</span></td></tr>`).join('')}</tbody>
  </table></div>
  ${hardest?.avgTorque != null ? `<p class="small muted" style="margin:8px 0 0">Hardest on the knee was climb ${climbs.indexOf(hardest) + 1} at ${n1(hardest.startKm)} km: ${n1(hardest.avgTorque)} Nm average, peaking at ${n1(hardest.peakTorque)} Nm.</p>` : ''}
  ${climbs.some(c => c.minCadence != null && c.minCadence < 40)
    ? `<p class="small muted" style="margin:6px 0 0">A minimum cadence under 40 rpm inside a climb usually means a stop or a near-stall. Restarting on a gradient asks more of the knee than riding through it does.</p>` : ''}`;
}

/** Match a ride to R1/R2/R3 by the day it fell on, then by shape. */
function guessRideCode(a) {
  if (a.sport !== 'cycling') return null;
  const manual = store.settings.rideMap[a.id];
  if (manual) return manual;
  const dow = E.dowOf(a.date);
  const byDay = { 2: 'R1', 5: 'R2', 6: 'R3' }[dow];
  if (byDay) return byDay;
  const mins = (a.durSec || 0) / 60;
  if (mins > 65) return 'R3';
  const p = a.np ?? a.avgPower;
  if (p && store.settings.ftp && p / store.settings.ftp > 0.8) return 'R2';
  return 'R1';
}

/* ============================== SYMMETRY ============================== */

function renderSymmetry() {
  const today = E.todayISO();
  const asym = E.asymmetrySeries(store, today, 120);
  const gates = E.computeGates(store, today);
  const opSide = store.settings.operatedSide;

  let html = `<div class="card">
    <span class="cap">Operated limb · ${esc(opSide)}</span>
    <h3 style="margin-top:4px">Is the operated leg doing its share?</h3>
    <p class="small muted" style="margin:6px 0 0">The YBT-A is the formal gate, but it only happens every two or three weeks. Every ride with a dual-sided power meter, and every run, gives a symmetry reading in between. 50% is even.</p>
    <div class="grid3" style="margin-top:12px">
      <div class="stat"><b>${asym.currentCycling == null ? '–' : pct(asym.currentCycling)}</b><span class="cap">Pedal balance, op leg</span>
        <div class="sub">5-ride rolling mean</div></div>
      <div class="stat"><b>${gates.latest ? n1(gates.latest.ssd) + ' cm' : '–'}</b><span class="cap">YBT-A SSD</span>
        <div class="sub">${gates.latest ? E.fmtDate(gates.latest.date) : 'not tested'}</div></div>
      <div class="stat"><b>${asym.currentRunning == null ? '–' : pct(asym.currentRunning)}</b><span class="cap">Ground contact, op leg</span>
        <div class="sub">from running data</div></div>
    </div>
    ${asym.deficitCycling != null && asym.deficitCycling > 3
      ? `<div class="notice n-amber"><b>Pedal deficit</b>The operated leg is contributing ${n1(asym.deficitCycling)} percentage points below even. Worth raising with PT before adding load, and worth watching against the next YBT-A.</div>`
      : asym.deficitCycling != null
        ? `<div class="notice n-green"><b>Within range</b>Pedal balance is inside 3 points of even.</div>` : ''}
  </div>`;

  if (asym.cycling.length > 2) {
    const from = asym.cycling[0].date;
    html += `<div class="card"><figure class="chart">
      <figcaption><h4>Operated-leg share, per ride</h4>
        <div class="legend"><span><i style="background:var(--s1)"></i>Per ride</span><span><i style="background:var(--s2)"></i>5-ride mean</span></div>
      </figcaption>
      ${timeChart({
        from, to: today, id: 'asym', unit: '%',
        lines: [
          { name: 'Ride', color: 'var(--s1)', points: asym.cycling.map(p => ({ x: p.date, y: p.opShare })), labelEnd: false },
          { name: 'Mean', color: 'var(--s2)', dash: '5 4', points: asym.cycling.map(p => ({ x: p.date, y: p.roll })) }
        ],
        refLines: [{ y: 50, label: 'even', color: 'var(--green)' }],
        fmtV: n1
      })}
    </figure></div>`;
  }

  if (gates.history.length) {
    const from = gates.history[0].date;
    html += `<div class="card"><figure class="chart">
      <figcaption><h4>YBT-A side-to-side difference</h4>
        <p class="small muted" style="margin:2px 0 0">Lower is better. The two dashed lines are the walk-jog and continuous-running gates.</p>
      </figcaption>
      ${timeChart({
        from, to: today, id: 'ybt', unit: ' cm',
        lines: [{ name: 'SSD', color: 'var(--s1)', points: gates.history.map(y => ({ x: y.date, y: y.ssd })) }],
        refLines: [
          { y: 8, label: 'walk–jog gate', color: 'var(--amber)' },
          { y: 4, label: 'running gate', color: 'var(--green)' }
        ],
        fmtV: n1
      })}
    </figure>
    <div class="tbl-scroll" style="margin-top:10px"><table>
      <thead><tr><th>Date</th><th>Leg length</th><th>Left</th><th>Right</th><th>SSD</th><th>% LL</th><th>LSI</th></tr></thead>
      <tbody>${gates.history.slice().reverse().map(y => `<tr>
        <td class="num">${E.fmtDate(y.date)}</td><td class="num">${n1(y.ll)}</td>
        <td class="num">${n1(y.reachL)}</td><td class="num">${n1(y.reachR)}</td>
        <td class="num"><span class="chip ${y.ssd <= 4 ? 'ok' : y.ssd <= 8 ? 'warn' : 'bad'}">${n1(y.ssd)} cm</span></td>
        <td class="num">${n0(y.pctLL)}%</td><td class="num">${n0(y.lsi)}%</td></tr>`).join('')}</tbody>
    </table></div></div>`;
  }

  html += gateBoard(gates);
  html += `<div class="card"><span class="cap">Walk–jog progression</span>
    <div class="tbl-scroll" style="margin-top:8px"><table><thead><tr><th>Week</th><th>5 cycles of</th></tr></thead>
      <tbody>${P.WALK_JOG.map(w => `<tr><td class="num">${esc(w.wk)}</td><td>${esc(w.cycle)}</td></tr>`).join('')}</tbody></table></div>
    <p class="small muted" style="margin:9px 0 0">${esc(P.WALK_JOG_RULE)}</p></div>`;
  return html;
}

/* ============================== PROTOCOL ============================== */

function renderProtocol() {
  const ph = E.phaseFor(store, E.todayISO());
  const sec = (title, cap, body, open) =>
    `<details class="sec"${open ? ' open' : ''}><summary><h3>${esc(title)}</h3><span class="cap">${esc(cap)}</span></summary><div>${body}</div></details>`;

  let html = `<div class="card"><span class="cap">Weekly layout</span>
    <div class="tbl-scroll" style="margin-top:8px"><table>
      <thead><tr><th>Day</th><th>Session</th><th>Add-on</th></tr></thead>
      <tbody>${P.WEEK_PLAN.map(d => `<tr>
        <td class="num">${P.DAY_NAMES[d.dow]}</td><td>${esc(d.label)}</td>
        <td class="small muted">${esc(d.sub)}</td></tr>`).join('')}</tbody>
    </table></div>
    <p class="small muted" style="margin:9px 0 0">Keep 48 hours or more between the two climbing sessions.</p></div>`;

  html += `<div class="card"><span class="cap">Movement key</span>
    ${P.MOVEMENT_KEY.map(m => `<div class="notice n-${m.state === 'ok' ? 'green' : m.state === 'warn' ? 'amber' : 'red'}"><b>${esc(m.title)}</b>${esc(m.body)}</div>`).join('')}</div>`;

  for (const p of P.PHASES) {
    html += sec(`Phase ${p.n}`, p.weeks, `<p class="small muted">${esc(p.intro)}</p>${p.blocks.map(drillTable).join('')}`, p.n === ph.phase);
  }
  html += sec('Endurance', 'Session B · 15:00–40:00',
    `<p class="small muted">${esc(P.ENDURANCE.intro)}</p>` +
    P.ENDURANCE.byPhase.map(e => drillTable({ title: `Phase ${e.n}`, clock: '', rows: e.rows })).join(''));
  html += sec('Finisher', 'Session A · 45:00–60:00', finisherTable(true));
  for (const code of P.RIDE_CODES) {
    html += sec(P.RIDES[code].name, `${P.RIDES[code].totalMin} min · ~${P.RIDES[code].targetTss} TSS`, sessionDetail(code, ph.phase));
  }
  html += sec('PT · post-meniscectomy protocol', 'YBT-A gated',
    `<div class="tbl-scroll"><table><thead><tr><th>PT phase</th><th>Timeline</th><th>Runs alongside</th><th>Gate to advance</th></tr></thead>
      <tbody>${P.PT_PHASES.map(p => `<tr><td>${esc(p.phase)}</td><td class="num">${esc(p.timeline)}</td>
        <td class="small muted">${esc(p.alongside)}</td><td class="small muted">${esc(p.gate)}</td></tr>`).join('')}</tbody></table></div>
     <h4 style="margin-top:14px;font-size:13px">Strength stack</h4>${ptStrengthTable()}
     <h4 style="margin-top:14px;font-size:13px">Balance, after rides</h4>
     <div class="tbl-scroll"><table><thead><tr><th>Drill</th><th>Dose</th><th>Progression</th></tr></thead>
       <tbody>${P.PT_BALANCE.map(b => `<tr><td>${esc(b.drill)}</td><td class="num">${esc(b.dose)}</td><td class="small muted">${esc(b.prog)}</td></tr>`).join('')}</tbody></table></div>`);
  html += sec('Progression &amp; stop rules', 'Read before progressing',
    P.STOP_RULES.map(r => `<p style="margin:10px 0"><b style="font-family:var(--disp);letter-spacing:.04em">${esc(r.t)}</b><br><span class="small muted">${esc(r.b)}</span></p>`).join(''));
  return html;
}

/* ============================== SETTINGS ============================== */

function renderSettings() {
  const s = store.settings;
  const week = E.postOpWeek(store, E.todayISO());
  return `<div class="card">
    <span class="cap">Plan</span>
    <label class="fld"><span class="cap">Surgery date</span><input type="date" id="set-surgery" value="${esc(s.surgeryDate)}"></label>
    <label class="fld"><span class="cap">Plan start date</span><input type="date" id="set-start" value="${esc(s.startDate)}"></label>
    <p class="small muted" style="margin:8px 0 0">${week ? `Week ${week} post-op.` : 'Set the surgery date to track the post-op week.'}</p>
    <label class="fld"><span class="cap">FTP (watts)</span><input type="number" id="set-ftp" value="${esc(String(s.ftp))}" min="50" max="400"></label>
    <label class="fld"><span class="cap">Operated side</span></label>
    <div class="seg" id="side-btns">
      <button data-v="left"${s.operatedSide === 'left' ? ' class="on"' : ''}>Left</button>
      <button data-v="right"${s.operatedSide === 'right' ? ' class="on"' : ''}>Right</button>
    </div>
    <p class="small muted" style="margin:8px 0 0">This decides which side of the Garmin left/right split counts as the operated leg.</p>
    <div class="row" style="margin-top:16px"><button class="btn" data-act="save-settings">Save settings</button></div>
  </div>

  <div class="card">
    <span class="cap">Sync</span>
    ${(() => { const ls = lastSync(); return `<p class="small muted" style="margin:8px 0 12px">The app pulls <code>data/store.json</code> from the repo on every open and merges it in, so entries and rides committed there reach every device. ${ls?.at ? `Last pull ${new Date(ls.at).toLocaleString()}${ls.remoteAt ? `, repo copy from ${new Date(ls.remoteAt).toLocaleDateString()}` : ''}.` : 'Not pulled yet.'}</p>`; })()}
    <div class="row"><button class="btn ghost" data-act="sync-now">Sync now</button></div>
    <hr class="sep">
    <span class="cap">Quick log by URL</span>
    <p class="small muted" style="margin:8px 0 0">Open the app with <code>?s=&lt;swelling&gt;&amp;p=&lt;pain&gt;</code> and it logs a check-in and clears the query. Add <code>t=R3</code> (or A, B, R1, R2, PT, WJ) to attach it to a session, <code>f=1</code> to set the 24-hour flag on the last session, <code>d=YYYY-MM-DD</code> to backdate. An iOS Shortcut that asks two questions and opens that URL is the two-tap version; recipe in <code>docs/quick-log.md</code>.</p>
  </div>

  <div class="card">
    <span class="cap">Data</span>
    <p class="small muted" style="margin:8px 0 12px">Everything lives in this browser's storage. Safari can clear site data after long inactivity, so export a backup now and then.</p>
    <div class="row">
      <button class="btn ghost" data-act="export-all">Export everything</button>
      <button class="btn ghost" data-act="import">Import a backup</button>
      <input type="file" id="import-file" accept="application/json,.json" class="hidden">
    </div>
    <hr class="sep">
    <div class="row">
      <button class="btn danger" data-act="clear-garmin">Clear Garmin data</button>
      <button class="btn danger" data-act="clear-all">Clear everything</button>
    </div>
  </div>

  <div class="card">
    <span class="cap">How the score works</span>
    <p class="small muted" style="margin-top:8px">Readiness is scored out of the inputs that actually have data, so it works before any Garmin import and sharpens as data arrives.</p>
    <div class="tbl-scroll" style="margin-top:8px"><table>
      <thead><tr><th>Input</th><th>Weight</th><th>What it reads</th></tr></thead><tbody>
      <tr><td>HRV vs baseline</td><td class="num">24</td><td class="small muted">3-night mean against a 60-night log-scaled baseline. Full credit at or above −0.5 SD, zero at −2 SD.</td></tr>
      <tr><td>Resting HR</td><td class="num">6</td><td class="small muted">Against a 30-day mean. Zero at +7 bpm.</td></tr>
      <tr><td>Sleep</td><td class="num">12</td><td class="small muted">Garmin sleep score, or duration against 7.5 h.</td></tr>
      <tr><td>Body battery</td><td class="num">8</td><td class="small muted">The overnight peak.</td></tr>
      <tr><td>Swelling</td><td class="num">18</td><td class="small muted">Worst grade in the last 3 days.</td></tr>
      <tr><td>Pain</td><td class="num">12</td><td class="small muted">Last logged session.</td></tr>
      <tr><td>Acute:chronic load</td><td class="num">20</td><td class="small muted">7-day TSS against the 28-day rolling equivalent. Best between 0.8 and 1.3.</td></tr>
      </tbody></table></div>
    <p class="small muted" style="margin:10px 0 0">Overrides sit on top: swelling 3+ in 48 hours forces red, swelling 2+ or a 24-hour flag caps the day at amber, and pain 7+ on the last session forces red. No amount of good Garmin data lifts those.</p>
  </div>`;
}

/* ============================== actions ============================== */

function render() {
  const week = E.postOpWeek(store, E.todayISO());
  const ph = E.phaseFor(store, E.todayISO());
  $('#top-right').innerHTML = `${week ? `Wk ${week} post-op<br>` : ''}${esc(ph.label)}`;
  const map = { today: renderToday, log: renderLog, garmin: renderGarmin, symmetry: renderSymmetry, protocol: renderProtocol, settings: renderSettings };
  for (const t of Object.keys(map)) {
    const el = document.getElementById('tab-' + t);
    el.classList.toggle('hidden', t !== ui.tab);
    if (t === ui.tab) el.innerHTML = map[t]();
  }
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
  attachTimers(document.getElementById('tab-' + ui.tab));
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function saveSession() {
  const dateEl = $('#log-date');
  const entry = {
    id: Date.now(), date: dateEl.value, type: ui.logType,
    phase: E.phaseFor(store, dateEl.value).phase,
    pain: parseInt($('#log-pain').value, 10),
    swell: parseInt(ui.logSwell, 10),
    rpe: parseInt($('#log-rpe').value, 10) || null,
    notes: $('#log-notes').value.trim(), flag24: null
  };
  if (ui.logType === 'YBT') {
    const ll = parseFloat($('#ybt-ll').value), rl = parseFloat($('#ybt-l').value), rr = parseFloat($('#ybt-r').value);
    if (!(ll > 0 && rl > 0 && rr > 0)) { alert('Enter leg length and both reach distances for the YBT-A.'); return; }
    entry.ll = ll; entry.reachL = rl; entry.reachR = rr;
  }
  store.sessions.push(entry);
  saveStore();
  if (entry.swell >= 3) alert(`Swelling ${entry.swell}+ logged. Per the PT protocol: drop back a phase, ice and elevate${entry.swell >= 4 ? ', and contact your surgeon.' : '.'}`);
  else if (entry.swell === 2) alert('Swelling 2+ logged. Reduce intensity and do not progress this week.');
  ui.logSwell = '0';
  render();
  if (store.sessions.length && store.sessions.length % 5 === 0) {
    if (confirm(`You have logged ${store.sessions.length} sessions. Download a backup file?`)) exportAll();
  }
}

function download(name, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportAll() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  download(`kneehab_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`, JSON.stringify(store, null, 2));
}

function importBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { alert('That file is not valid JSON.'); return; }
  if (Array.isArray(data)) {                       // a v1 session-only export
    const ids = new Set(store.sessions.map(s => s.id));
    let added = 0;
    for (const x of data) {
      if (!x || !x.date || !x.type) continue;
      if (!x.id) x.id = Date.now() + Math.floor(Math.random() * 1000);
      if (!ids.has(x.id)) { store.sessions.push(x); ids.add(x.id); added++; }
    }
    saveStore(); render();
    alert(`Imported ${added} session${added === 1 ? '' : 's'}.`);
    return;
  }
  if (data.schema === 2) {
    const ids = new Set(store.sessions.map(s => s.id));
    let added = 0;
    for (const x of data.sessions || []) if (!ids.has(x.id)) { store.sessions.push(x); ids.add(x.id); added++; }
    const a = mergeActivities(store.garmin.activities, data.garmin?.activities || []);
    const w = mergeDaily(store.garmin.daily, data.garmin?.daily || []);
    store.garmin.activities = a.list; store.garmin.daily = w.list;
    store.settings = { ...store.settings, ...(data.settings || {}) };
    saveStore(); render();
    alert(`Imported ${added} session${added === 1 ? '' : 's'}, ${a.added} activities, ${w.added} wellness days.`);
    return;
  }
  alert('Unrecognised backup file.');
}

async function handleGarminFiles(fileList) {
  const status = $('#import-status');
  const files = [...fileList];
  if (!files.length) return;
  status.textContent = `Reading ${files.length} file${files.length === 1 ? '' : 's'}…`;
  try {
    const { activities, daily, warnings } = await ingestFiles(files, {
      onProgress: (done, total) => { status.textContent = `Parsed ${done} of ${total}…`; }
    });
    const a = mergeActivities(store.garmin.activities, activities);
    const w = mergeDaily(store.garmin.daily, daily);
    store.garmin.activities = a.list;
    store.garmin.daily = w.list;
    const ftpFromFile = activities.map(x => x.ftp).filter(Boolean).pop();
    if (ftpFromFile && ftpFromFile !== store.settings.ftp) {
      if (confirm(`These files report an FTP of ${ftpFromFile} W. Your setting is ${store.settings.ftp} W. Update it?`)) store.settings.ftp = ftpFromFile;
    }
    saveStore();
    render();
    const s = $('#import-status');
    if (s) {
      s.innerHTML = `<span style="color:var(--green)">Added ${a.added} activities and ${w.added} wellness days${a.updated ? `, updated ${a.updated}` : ''}.</span>`
        + (warnings.length ? `<br><span style="color:var(--amber)">${warnings.slice(0, 6).map(esc).join('<br>')}</span>` : '');
    }
  } catch (err) {
    status.innerHTML = `<span style="color:var(--red)">${esc(err.message)}</span>`;
  }
}

/* ---------- rest timers, carried over from v1 ---------- */
let tInt = null, tEnd = 0, actx = null;
function beep() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const now = actx.currentTime;
    [0, 0.3, 0.6].forEach(off => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(actx.destination);
      g.gain.setValueAtTime(0.25, now + off);
      g.gain.exponentialRampToValueAtTime(0.001, now + off + 0.25);
      o.start(now + off); o.stop(now + off + 0.26);
    });
  } catch { /* audio unavailable */ }
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}
function tick() {
  const s = Math.max(0, Math.round((tEnd - Date.now()) / 1000));
  $('#tb-time').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  if (s <= 0) {
    clearInterval(tInt); tInt = null;
    $('#timerbar').classList.add('done');
    $('#tb-label').textContent = 'Rest done, tap to dismiss';
    beep();
  }
}
function startTimer(sec) {
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch { /* ignore */ }
  if (tInt) clearInterval(tInt);
  const bar = $('#timerbar');
  bar.classList.remove('done'); bar.classList.add('on');
  $('#tb-label').textContent = 'Rest timer, tap to cancel';
  tEnd = Date.now() + sec * 1000; tick();
  tInt = setInterval(tick, 250);
}
function attachTimers(root) {
  if (!root) return;
  root.querySelectorAll('td.num').forEach(td => {
    if (td.dataset.tmr) return;
    // climb durations are not rest intervals; tapping one should do nothing
    if (td.closest('[data-notimer]')) return;
    const m = td.textContent.trim().match(/^(\d{1,2}):(\d{2})\b/);
    if (!m || td.textContent.includes('×')) return;
    td.dataset.tmr = '1';
    td.classList.add('t-timer'); td.title = 'Tap to start a rest timer';
    td.addEventListener('click', () => startTimer(parseInt(m[1], 10) * 60 + parseInt(m[2], 10)));
  });
}

/* ============================== wiring ============================== */

function onClick(ev) {
  const btn = ev.target.closest('button');
  if (!btn) return;

  if (btn.dataset.tab) { ui.tab = btn.dataset.tab; render(); return; }
  const act = btn.dataset.act;

  if (btn.closest('#type-btns')) {
    ui.logType = btn.dataset.v;
    btn.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn));
    $('#ybt-fields').classList.toggle('hidden', ui.logType !== 'YBT');
    return;
  }
  if (btn.closest('#swell-btns')) {
    ui.logSwell = btn.dataset.v;
    btn.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn));
    return;
  }
  const qlSeg = btn.closest('.ql-seg');
  if (qlSeg) {
    ui.ql[qlSeg.dataset.ql] = btn.dataset.v;
    qlSeg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn));
    return;
  }
  if (btn.closest('#side-btns')) {
    store.settings.operatedSide = btn.dataset.v;
    btn.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn));
    return;
  }

  switch (act) {
    case 'go-log': ui.tab = 'log'; render(); break;
    case 'go-garmin': ui.tab = 'garmin'; render(); break;
    case 'save-session': saveSession(); break;
    case 'ql-save': {
      const msgs = addQuickEntry({
        type: ui.ql.type || 'CHK', swell: parseInt(ui.ql.swell, 10), pain: parseInt(ui.ql.pain, 10),
        flag: !!document.getElementById('ql-flag')?.checked
      });
      ui.ql = { type: null, swell: '0', pain: '0', flag: false };
      render(); toast(msgs);
      break;
    }
    case 'sync-now': {
      btn.disabled = true; btn.textContent = 'Syncing…';
      pullRemote(store).then(out => {
        saveStore(); render();
        toast([out ? `Synced: ${out.sessions} sessions, ${out.activities} rides, ${out.daily} wellness days added${out.updated ? `, ${out.updated} updated` : ''}.` : 'Could not reach the repo copy. Offline, or no data/store.json published yet.']);
      });
      break;
    }
    case 'export': case 'export-all': exportAll(); break;
    case 'import': $('#import-file').click(); break;
    case 'pick': $('#garmin-file').click(); break;
    case 'detail': ui.expanded[btn.dataset.id] = !ui.expanded[btn.dataset.id]; render(); break;
    case 'log-rides': {
      const missing = missingRides();
      let i = 0;
      for (const a of missing) {
        const bits = [`${Math.round((a.durSec || 0) / 60)} min`];
        if (a.np ?? a.avgPower) bits.push(`${Math.round(a.np ?? a.avgPower)} W NP`);
        if (a.avgCadence) bits.push(`${Math.round(a.avgCadence)} rpm`);
        if (a.leftPct != null) bits.push(`${a.leftPct}% left`);
        store.sessions.push({
          id: Date.now() + (i++), date: a.date, type: guessRideCode(a) || 'R1',
          phase: E.phaseFor(store, a.date).phase,
          pain: null, swell: null, notes: `Added from Garmin · ${bits.join(' · ')}`,
          flag24: null, src: 'garmin', garminId: a.id
        });
      }
      saveStore();
      ui.tab = 'log';
      render();
      break;
    }
    case 'save-settings': {
      store.settings.surgeryDate = $('#set-surgery').value;
      store.settings.startDate = $('#set-start').value;
      const newFtp = parseInt($('#set-ftp').value, 10) || P.FTP_DEFAULT;
      if (newFtp !== store.settings.ftp) store.settings.ftpSource = 'manual';
      store.settings.ftp = newFtp;
      saveStore(); render();
      break;
    }
    case 'clear-garmin':
      if (confirm('Remove all imported Garmin activities and wellness days? Your session log is untouched.')) {
        store.garmin = { activities: [], daily: [] }; saveStore(); render();
      }
      break;
    case 'clear-all':
      if (confirm('Delete everything, including the session log? This cannot be undone.')) {
        store = DEFAULT_STORE(); saveStore(); render();
      }
      break;
    case 'flag': {
      const id = Number(btn.dataset.id);
      const s = store.sessions.find(x => x.id === id);
      if (!s) return;
      s.flag24 = s.flag24 === null || s.flag24 === undefined ? false : (s.flag24 === false ? true : null);
      saveStore();
      if (s.flag24 === true) alert('24-hour flag set. Per the stop rules: repeat the previous week, do not progress.');
      render();
      break;
    }
    case 'del': {
      if (!confirm('Delete this session?')) return;
      const id = Number(btn.dataset.id);
      store.sessions = store.sessions.filter(x => x.id !== id);
      saveStore(); render();
      break;
    }
  }
}

function onChange(ev) {
  const t = ev.target;
  if (t.id === 'log-pain') { $('#pain-val').textContent = t.value; return; }

  if (t.dataset && (t.dataset.act === 'edit-pain' || t.dataset.act === 'edit-swell')) {
    const s = store.sessions.find(x => x.id === Number(t.dataset.id));
    if (!s) return;
    const v = t.value === '' ? null : parseInt(t.value, 10);
    if (t.dataset.act === 'edit-pain') s.pain = v; else s.swell = v;
    saveStore();
    const entry = t.closest('.entry');
    if (entry) entry.outerHTML = entryHtml(s);          // repaint one row, keep scroll
    if (v != null && t.dataset.act === 'edit-swell' && v >= 2) {
      alert(v >= 3
        ? `Swelling ${v}+ recorded. Per the PT protocol: drop back a phase, ice and elevate${v >= 4 ? ', and contact your surgeon.' : '.'}`
        : 'Swelling 2+ recorded. Reduce intensity and do not progress this week.');
    }
    return;
  }
  if (t.id === 'import-file' && t.files[0]) {
    const r = new FileReader();
    r.onload = () => importBackup(r.result);
    r.readAsText(t.files[0]);
    t.value = '';
    return;
  }
  if (t.id === 'garmin-file' && t.files.length) { handleGarminFiles(t.files); t.value = ''; }
}

function initDrop() {
  document.addEventListener('dragover', ev => {
    const dz = document.getElementById('drop');
    if (!dz) return;
    ev.preventDefault(); dz.classList.add('over');
  });
  document.addEventListener('dragleave', () => document.getElementById('drop')?.classList.remove('over'));
  document.addEventListener('drop', ev => {
    const dz = document.getElementById('drop');
    if (!dz) return;
    ev.preventDefault(); dz.classList.remove('over');
    if (ev.dataTransfer?.files?.length) handleGarminFiles(ev.dataTransfer.files);
  });
}

loadStore();
const urlMsgs = quickLogFromUrl();
document.addEventListener('click', onClick);
document.addEventListener('input', onChange);
document.addEventListener('change', onChange);
$('#timerbar').addEventListener('click', () => {
  if (tInt) { clearInterval(tInt); tInt = null; }
  $('#timerbar').classList.remove('on', 'done');
});
initDrop();
initChartTips();

let resizeTimer = null, lastWidth = window.innerWidth;
window.addEventListener('resize', () => {
  if (Math.abs(window.innerWidth - lastWidth) < 40) return;
  lastWidth = window.innerWidth;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(render, 180);   // charts are sized in real pixels
});

render();
if (urlMsgs) toast(urlMsgs);

// repo-backed sync: merge the published copy, repaint if anything arrived
pullRemote(store).then(out => {
  if (!out) return;
  const n = out.sessions + out.activities + out.daily + out.settings + out.updated;
  if (n) { saveStore(); render(); }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
