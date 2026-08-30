/* Kneehab · engine.js
   The readiness math. Pure functions over the store, no DOM.

   Design rule that governs everything below: Garmin data can only ever LOWER
   the day's readiness. Swelling and the 24-hour flag are the protocol's primary
   signals, so they cap the band regardless of how good HRV looks. */

import { ADAPT, WEEK_PLAN, RIDES, SESSION_LABELS } from './protocol.js';
import { torqueNm } from './garmin.js';

/* ------------------------------ dates ------------------------------ */

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const shiftDate = (dateStr, days) => {
  const d = new Date(dateStr + 'T12:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 86400000);
export const dowOf = dateStr => new Date(dateStr + 'T12:00').getDay();
export const weekStartOf = dateStr => {
  const d = new Date(dateStr + 'T12:00');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const fmtDate = s => { const p = s.split('-'); return `${p[1]}/${p[2]}/${p[0].slice(2)}`; };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
const sd = a => {
  if (a.length < 2) return null;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
};
const lerp = (x, x0, x1, y0, y1) => y0 + (clamp(x, Math.min(x0, x1), Math.max(x0, x1)) - x0) * (y1 - y0) / (x1 - x0);

/* --------------------------- training load --------------------------- */

const SPORT_TSS_PER_HOUR = { cycling: 55, running: 70, rock_climbing: 50, training: 35, walking: 15, hiking: 30, other: 35 };

/** Every activity gets a load number. Power-based TSS when it exists, an
 *  intensity-factor calculation when power and FTP do, otherwise a coarse
 *  per-sport rate that is flagged as an estimate. */
export function activityLoad(a, ftp) {
  if (a.tss != null) return { tss: a.tss, estimated: false };
  const hours = (a.durSec || 0) / 3600;
  const p = a.np ?? a.avgPower;
  if (p && ftp) {
    const intensity = p / ftp;
    return { tss: hours * intensity * intensity * 100, estimated: false };
  }
  if (!hours) return { tss: 0, estimated: true };
  return { tss: hours * (SPORT_TSS_PER_HOUR[a.sport] ?? 35), estimated: true };
}

export function loadSeries(activities, ftp, endDate, days = 60) {
  const byDate = new Map();
  for (const a of activities) {
    if (!a.date) continue;
    const { tss, estimated } = activityLoad(a, ftp);
    const cur = byDate.get(a.date) || { date: a.date, tss: 0, estimated: false, count: 0 };
    cur.tss += tss; cur.estimated = cur.estimated || estimated; cur.count++;
    byDate.set(a.date, cur);
  }
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = shiftDate(endDate, -i);
    out.push(byDate.get(d) || { date: d, tss: 0, estimated: false, count: 0 });
  }
  return out;
}

export function computeAcwr(activities, ftp, dateStr) {
  const series = loadSeries(activities, ftp, dateStr, 28);
  const acute = series.slice(-7).reduce((s, d) => s + d.tss, 0);
  const chronic = series.reduce((s, d) => s + d.tss, 0) / 4;
  const ratio = chronic > 0 ? acute / chronic : null;
  return { acute, chronic, ratio, series };
}

/* --------------------------- daily wellness --------------------------- */

function lookback(daily, dateStr, days, key) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = daily.find(x => x.date === shiftDate(dateStr, -i));
    if (d && d[key] != null) out.push(d[key]);
  }
  return out;
}

export function hrvStatus(daily, dateStr) {
  const recent = lookback(daily, dateStr, 3, 'hrv');
  const base = lookback(daily, dateStr, 60, 'hrv').slice(3);
  if (!recent.length || base.length < 7) {
    return { value: recent.length ? mean(recent) : null, z: null, baseline: base.length ? mean(base) : null, n: base.length };
  }
  const lnBase = base.map(Math.log);
  const m = mean(lnBase), s = sd(lnBase) || 0.001;
  const z = (Math.log(mean(recent)) - m) / s;
  return { value: mean(recent), z, baseline: Math.exp(m), n: base.length };
}

export function rhrStatus(daily, dateStr) {
  const today = lookback(daily, dateStr, 1, 'rhr')[0] ?? null;
  const base = lookback(daily, dateStr, 30, 'rhr').slice(1);
  const b = base.length >= 5 ? mean(base) : null;
  return { value: today, baseline: b, delta: (today != null && b != null) ? today - b : null };
}

/* ------------------------------ knee log ------------------------------ */

export function kneeStatus(sessions, dateStr) {
  const recent = sessions
    .filter(s => s.date <= dateStr && daysBetween(s.date, dateStr) <= 3)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const last = sessions.filter(s => s.date <= dateStr)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)[0] || null;
  // An unrated entry (one auto-added from Garmin, pain and swelling not yet
  // filled in) must not read as a zero. Absent is absent.
  const graded = recent.filter(s => s.swell != null).map(s => s.swell);
  const graded48 = recent.filter(s => daysBetween(s.date, dateStr) <= 2 && s.swell != null).map(s => s.swell);
  const lastRated = sessions.filter(s => s.date <= dateStr && s.pain != null)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)[0] || null;
  return {
    lastSession: last,
    swellMax3d: graded.length ? Math.max(...graded) : null,
    swellMax48h: graded48.length ? Math.max(...graded48) : null,
    lastPain: lastRated ? lastRated.pain : null,
    lastRated,
    flagged: recent.some(s => s.flag24 === true),
    daysSinceLast: lastRated ? daysBetween(lastRated.date, dateStr) : null,
    unrated: sessions.filter(s => s.date <= dateStr && s.pain == null).length,
    entries: recent.length
  };
}

/* ---------------------------- YBT-A + gates ---------------------------- */

export function ybtEntries(sessions) {
  return sessions
    .filter(s => s.type === 'YBT' && s.ll > 0 && s.reachL > 0 && s.reachR > 0)
    .map(s => ({
      date: s.date, ll: s.ll, reachL: s.reachL, reachR: s.reachR,
      ssd: Math.abs(s.reachL - s.reachR),
      pctLL: (Math.min(s.reachL, s.reachR) / s.ll) * 100,
      lsi: (Math.min(s.reachL, s.reachR) / Math.max(s.reachL, s.reachR)) * 100
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function computeGates(store, dateStr) {
  const ybts = ybtEntries(store.sessions);
  const latest = ybts[ybts.length - 1] || null;
  const knee = kneeStatus(store.sessions, dateStr);
  const swellQuiet = store.sessions
    .filter(s => s.date <= dateStr && daysBetween(s.date, dateStr) <= 7)
    .every(s => (s.swell ?? 0) <= 1);

  const mk = (name, ssdMax, need) => {
    const reasons = [];
    if (!latest) reasons.push('No YBT-A logged yet');
    else {
      if (latest.ssd > ssdMax) reasons.push(`SSD ${latest.ssd.toFixed(1)} cm, needs ≤${ssdMax} cm`);
      if (latest.pctLL < 55) reasons.push(`Depth ${latest.pctLL.toFixed(0)}% LL, needs ≥55%`);
    }
    if (!swellQuiet) reasons.push('Swelling above 1+ in the last 7 days');
    return { name, need, open: reasons.length === 0, reasons, latest };
  };

  const staleDays = latest ? daysBetween(latest.date, dateStr) : null;
  return {
    latest, history: ybts,
    retestDue: staleDays == null || staleDays >= 21,
    staleDays,
    gates: [
      mk('Walk–jog', 8, 'SSD ≤8 cm · depth ≥55% LL · swelling ≤1+'),
      mk('Continuous running', 4, 'SSD ≤4 cm · depth ≥55% LL · swelling ≤1+')
    ],
    swellQuiet
  };
}

/* ----------------------------- asymmetry ----------------------------- */

/** One timeline of "how much of the work the operated leg is doing", pulled
 *  from whichever sources exist. 50% is symmetric; below 50 is a deficit. */
export function asymmetrySeries(store, dateStr, days = 90) {
  const from = shiftDate(dateStr, -days);
  const op = store.settings.operatedSide || 'right';
  const share = leftPct => (op === 'left' ? leftPct : 100 - leftPct);
  const out = [];
  for (const a of store.garmin.activities) {
    if (!a.date || a.date < from || a.date > dateStr) continue;
    if (a.leftPct != null) out.push({ date: a.date, kind: 'cycling', opShare: share(a.leftPct), label: 'Pedal balance' });
    if (a.gctBalanceLeftPct != null) out.push({ date: a.date, kind: 'running', opShare: share(a.gctBalanceLeftPct), label: 'Ground contact' });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  const rolling = (kind, n = 5) => {
    const pts = out.filter(p => p.kind === kind);
    return pts.map((p, i) => ({ ...p, roll: mean(pts.slice(Math.max(0, i - n + 1), i + 1).map(x => x.opShare)) }));
  };
  const cycling = rolling('cycling'), running = rolling('running');
  const latestCyc = cycling[cycling.length - 1] || null;
  return {
    all: out, cycling, running,
    currentCycling: latestCyc ? latestCyc.roll : null,
    deficitCycling: latestCyc ? 50 - latestCyc.roll : null,
    currentRunning: running.length ? running[running.length - 1].roll : null,
    operatedSide: op
  };
}

/* ---------------------------- ride compliance ---------------------------- */

/** Was the ride actually ridden the way the protocol prescribes, and did the
 *  knee pay for it? Crank torque is the number that matters here, not watts. */
export function rideCompliance(activity, code, ftp) {
  const spec = RIDES[code];
  if (!spec || !activity) return null;
  const findings = [];
  const targetW = ftp * spec.mainPctFtp;
  const targetTorque = torqueNm(targetW, spec.cadenceFloor + 3);
  const p = activity.np ?? activity.avgPower;

  if (p != null) {
    const drift = ((p - targetW) / targetW) * 100;
    if (drift > 12) findings.push({ level: 'warn', text: `Rode ${drift.toFixed(0)}% above the ${Math.round(targetW)} W target for ${spec.name.split('·')[1].trim()}.` });
    else if (drift < -15) findings.push({ level: 'info', text: `Rode ${Math.abs(drift).toFixed(0)}% below the ${Math.round(targetW)} W target.` });
    else findings.push({ level: 'ok', text: `Power on target: ${Math.round(p)} W against ${Math.round(targetW)} W.` });
  }
  if (activity.avgCadence != null) {
    if (activity.avgCadence < spec.cadenceFloor) {
      findings.push({ level: 'warn', text: `Average cadence ${Math.round(activity.avgCadence)} rpm, below the ${spec.cadenceFloor} rpm floor. Lower cadence at the same power means higher pedal force through the knee.` });
    } else {
      findings.push({ level: 'ok', text: `Cadence ${Math.round(activity.avgCadence)} rpm, at or above the ${spec.cadenceFloor} rpm floor.` });
    }
  }
  const actualTorque = torqueNm(p, activity.avgCadence);
  if (actualTorque != null && targetTorque != null) {
    const over = ((actualTorque - targetTorque) / targetTorque) * 100;
    findings.push({
      level: over > 20 ? 'warn' : 'ok',
      text: `Mean crank torque ${actualTorque.toFixed(1)} Nm against ${targetTorque.toFixed(1)} Nm prescribed${over > 20 ? `, ${over.toFixed(0)}% high` : ''}.`
    });
  }
  const d = activity.detail;
  if (d?.lowCadPct != null && d.lowCadPct > 10) {
    findings.push({ level: 'warn', text: `${d.lowCadPct.toFixed(0)}% of the ride sat below 70 rpm. Grinding is the pedalling pattern this protocol is trying to avoid.` });
  }
  if (activity.durSec) {
    const mins = activity.durSec / 60;
    const diff = mins - spec.totalMin;
    if (Math.abs(diff) > 8) findings.push({ level: 'info', text: `${Math.round(mins)} min against ${spec.totalMin} min prescribed.` });
  }
  return { spec, targetW, targetTorque, actualTorque, findings };
}

/* ----------------------------- readiness ----------------------------- */

const BANDS = { green: 'Green', amber: 'Amber', red: 'Red' };

export function computeReadiness(store, dateStr) {
  const daily = store.garmin.daily, sessions = store.sessions;
  const ftp = store.settings.ftp;
  const comps = [];

  /* 1. Autonomic: HRV against the personal baseline, resting HR as support */
  const hrv = hrvStatus(daily, dateStr);
  const rhr = rhrStatus(daily, dateStr);
  if (hrv.z != null) {
    const pts = lerp(hrv.z, -2, 0.5, 0, 24);
    comps.push({
      key: 'hrv', label: 'HRV vs baseline', max: 24, pts,
      state: hrv.z >= -0.5 ? 'ok' : hrv.z >= -1.5 ? 'warn' : 'bad',
      detail: `${hrv.value.toFixed(0)} ms · ${hrv.z >= 0 ? '+' : ''}${hrv.z.toFixed(1)} SD from a ${hrv.n}-night baseline of ${hrv.baseline.toFixed(0)} ms`
    });
  } else {
    comps.push({ key: 'hrv', label: 'HRV vs baseline', max: 24, pts: null, state: 'none', detail: hrv.value != null ? 'Need about a week of nights to build a baseline' : 'No HRV imported' });
  }
  if (rhr.delta != null) {
    const pts = lerp(rhr.delta, 7, 0, 0, 6);
    comps.push({
      key: 'rhr', label: 'Resting HR', max: 6, pts,
      state: rhr.delta <= 2 ? 'ok' : rhr.delta <= 5 ? 'warn' : 'bad',
      detail: `${rhr.value} bpm · ${rhr.delta >= 0 ? '+' : ''}${rhr.delta.toFixed(1)} vs 30-day mean`
    });
  } else {
    comps.push({ key: 'rhr', label: 'Resting HR', max: 6, pts: null, state: 'none', detail: 'No resting HR imported' });
  }

  /* 2. Sleep and body battery */
  const today = daily.find(d => d.date === dateStr) || {};
  if (today.sleepScore != null || today.sleepSec != null) {
    const score = today.sleepScore ?? clamp((today.sleepSec / 3600 / 7.5) * 100, 0, 100);
    const pts = lerp(score, 40, 90, 0, 12);
    comps.push({
      key: 'sleep', label: 'Sleep', max: 12, pts,
      state: score >= 75 ? 'ok' : score >= 55 ? 'warn' : 'bad',
      detail: today.sleepScore != null
        ? `Score ${today.sleepScore}${today.sleepSec ? ` · ${(today.sleepSec / 3600).toFixed(1)} h` : ''}`
        : `${(today.sleepSec / 3600).toFixed(1)} h`
    });
  } else {
    comps.push({ key: 'sleep', label: 'Sleep', max: 12, pts: null, state: 'none', detail: 'No sleep data for today' });
  }
  if (today.bbHigh != null) {
    const pts = lerp(today.bbHigh, 35, 85, 0, 8);
    comps.push({
      key: 'bb', label: 'Body battery', max: 8, pts,
      state: today.bbHigh >= 70 ? 'ok' : today.bbHigh >= 50 ? 'warn' : 'bad',
      detail: `Peaked at ${today.bbHigh}${today.bbCharged != null ? ` · charged ${today.bbCharged}` : ''}`
    });
  } else {
    comps.push({ key: 'bb', label: 'Body battery', max: 8, pts: null, state: 'none', detail: 'No body battery data' });
  }

  /* 3. Knee: the protocol's own signals, and the only always-present block */
  const knee = kneeStatus(sessions, dateStr);
  const swell = knee.swellMax3d;
  if (swell != null) {
    const pts = swell === 0 ? 18 : swell === 1 ? 12 : swell === 2 ? 5 : 0;
    comps.push({
      key: 'swell', label: 'Swelling (3 days)', max: 18, pts,
      state: swell <= 1 ? 'ok' : swell === 2 ? 'warn' : 'bad',
      detail: swell === 0 ? 'None logged' : `Peak ${swell}+ in the last 3 days`
    });
  } else {
    comps.push({ key: 'swell', label: 'Swelling (3 days)', max: 18, pts: null, state: 'none', detail: 'Nothing logged in the last 3 days' });
  }
  // A pain score only describes today if it is recent. An old entry is shown
  // but not scored, so a stale log cannot manufacture a confident green.
  if (knee.lastPain != null && knee.daysSinceLast <= 4) {
    const pts = knee.lastPain <= 2 ? 12 : knee.lastPain <= 4 ? 8 : knee.lastPain <= 6 ? 3 : 0;
    comps.push({
      key: 'pain', label: 'Pain, last session', max: 12, pts,
      state: knee.lastPain <= 2 ? 'ok' : knee.lastPain <= 4 ? 'warn' : 'bad',
      detail: `${knee.lastPain}/10 on ${fmtDate(knee.lastRated.date)}${knee.flagged ? ' · 24h flag set' : ''}`
    });
  } else {
    comps.push({
      key: 'pain', label: 'Pain, last session', max: 12, pts: null, state: 'none',
      detail: knee.lastPain == null ? 'No session logged yet'
        : `Last session was ${knee.daysSinceLast} days ago (pain ${knee.lastPain}/10), too old to score today`
    });
  }

  /* 4. Load */
  const acwr = computeAcwr(store.garmin.activities, ftp, dateStr);
  if (acwr.ratio != null && acwr.chronic >= 15) {
    const r = acwr.ratio;
    const pts = r < 0.8 ? 16 : r <= 1.3 ? 20 : r <= 1.5 ? 12 : 4;
    comps.push({
      key: 'load', label: 'Acute:chronic load', max: 20, pts,
      state: r <= 1.3 ? 'ok' : r <= 1.5 ? 'warn' : 'bad',
      detail: `${r.toFixed(2)} · ${Math.round(acwr.acute)} TSS this week vs ${Math.round(acwr.chronic)} typical`
    });
  } else {
    comps.push({ key: 'load', label: 'Acute:chronic load', max: 20, pts: null, state: 'none', detail: acwr.chronic > 0 ? 'Building a load history, needs about 4 weeks' : 'No training load imported' });
  }

  const scored = comps.filter(c => c.pts != null);
  const available = scored.reduce((s, c) => s + c.max, 0);
  const earned = scored.reduce((s, c) => s + c.pts, 0);
  const score = available > 0 ? Math.round((earned / available) * 100) : null;
  const coverage = available / comps.reduce((s, c) => s + c.max, 0);

  // Too little of today's picture to call it. Better to say so than to publish a
  // confident green off one stale input.
  const THIN = 0.35;
  let band = (score == null || coverage < THIN) ? 'unknown'
    : score >= 75 ? 'green' : score >= 55 ? 'amber' : 'red';
  const overrides = [];
  if (score != null && coverage < THIN) {
    overrides.push({ level: 'blue', text: 'Not enough of today to score it. Log a session, or import a Garmin file, and the score fills in.' });
  }
  const cap = b => { if (b === 'red') band = 'red'; else if (band === 'green') band = 'amber'; };

  if (knee.swellMax48h != null && knee.swellMax48h >= 3) {
    band = 'red';
    overrides.push({ level: 'red', text: `Swelling ${knee.swellMax48h}+ logged in the last 48 hours. Protocol says drop back a phase, ice and elevate${knee.swellMax48h >= 4 ? ', and contact the surgeon' : ''}.` });
  } else if (knee.swellMax48h === 2) {
    cap('amber');
    overrides.push({ level: 'amber', text: 'Swelling 2+ in the last 48 hours. No progression this week, reduce intensity.' });
  }
  if (knee.flagged) {
    cap('amber');
    overrides.push({ level: 'amber', text: '24-hour flag set on the last session. Repeat the previous week, do not progress.' });
  }
  if (knee.lastPain != null && knee.lastPain >= 7 && knee.daysSinceLast <= 1) {
    band = 'red';
    overrides.push({ level: 'red', text: `Pain ${knee.lastPain}/10 on the last session.` });
  }

  return {
    date: dateStr, score, band, bandLabel: BANDS[band] || 'Not enough data',
    components: comps, overrides, coverage, knee, acwr, hrv, rhr
  };
}

/* ------------------------- today's prescription ------------------------- */

/** Which session is actually due, honouring the "not done yet this week"
 *  catch-up behaviour from v1. */
export function plannedSession(store, dateStr) {
  const ws = weekStartOf(dateStr);
  const logged = {};
  for (const s of store.sessions) if (s.date >= ws && s.date <= dateStr) logged[s.type] = s.date;
  const todayIdx = (dowOf(dateStr) + 6) % 7;
  const plan = WEEK_PLAN.filter(p => p.code);
  const pending = plan.filter(p => !logged[p.code]);
  const overdue = pending.filter(p => (p.dow + 6) % 7 <= todayIdx);

  if (overdue.length) {
    const p = overdue[0];
    const late = (p.dow + 6) % 7 < todayIdx;
    return {
      entry: p, logged,
      note: late ? `${SESSION_LABELS[p.code]} not done yet (${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][(p.dow + 6) % 7]} slot), showing it today.` : ''
    };
  }
  const entry = WEEK_PLAN.find(p => p.dow === dowOf(dateStr));
  const done = entry?.code && logged[entry.code];
  return {
    entry, logged,
    note: !pending.length ? 'All 5 sessions logged this week ✓' : done ? `Today's ${SESSION_LABELS[entry.code]} is logged ✓` : ''
  };
}

export function adaptFor(code, band) {
  if (!code || band === 'green' || band === 'unknown') return [];
  const a = ADAPT[code];
  if (!a) return [];
  return a[band] || [];
}

/* --------------------------- phase tracking --------------------------- */

export function phaseFor(store, dateStr) {
  const start = store.settings.startDate;
  if (!start) return { week: null, phase: store.settings.phaseOverride || 1, label: 'Set a plan start date' };
  const days = daysBetween(start, dateStr);
  if (days < 0) return { week: null, phase: 1, label: `Starts ${fmtDate(start)}` };
  const week = Math.floor(days / 7) + 1;
  const phase = week <= 3 ? 1 : week <= 6 ? 2 : 3;
  return { week, phase, label: `Week ${week} · Phase ${phase}` };
}

export function postOpWeek(store, dateStr) {
  const s = store.settings.surgeryDate;
  if (!s) return null;
  const d = daysBetween(s, dateStr);
  return d < 0 ? null : Math.floor(d / 7) + 1;
}
