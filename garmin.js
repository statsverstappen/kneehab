/* Kneehab · garmin.js
   Turns whatever Garmin hands you into one normalized store.

   Handles: .fit activity files, .zip archives (Garmin's "Export Your Data"
   bundle or a folder of FITs), Garmin Connect activity .csv exports, and the
   wellness .json files inside the data export. Everything runs in the browser;
   nothing leaves the device. */

import { decodeFit, SPORT } from './fit.js';

/* ============================== helpers ============================== */

export const iso = d => {
  const dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt)) return null;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

const num = v => {
  if (v == null || v === '' || v === '--') return null;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isFinite(n) ? n : null;
};

function parseDuration(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);         // already seconds
  const parts = s.split(':').map(parseFloat);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

/** Crank torque in Nm from power and cadence. The knee-relevant number:
 *  the same 90 W at 60 rpm asks roughly 1.5x the pedal force it does at 90 rpm. */
export const torqueNm = (watts, rpm) => (!watts || !rpm || rpm < 20) ? null : (watts * 60) / (2 * Math.PI * rpm);

/* ================================ ZIP ================================ */
/* Minimal reader: central directory walk, stored + deflate entries.
   Deflate uses the platform DecompressionStream, so no bundled inflater. */

export async function unzip(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a zip archive.');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const out = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOff = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;

    const lnLen = view.getUint16(localOff + 26, true);
    const leLen = view.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + lnLen + leLen;
    const raw = bytes.subarray(dataStart, dataStart + compSize);
    let content;
    if (method === 0) {
      content = raw.slice().buffer;
    } else if (method === 8 && typeof DecompressionStream !== 'undefined') {
      const ds = new DecompressionStream('deflate-raw');
      const stream = new Blob([raw]).stream().pipeThrough(ds);
      content = await new Response(stream).arrayBuffer();
    } else {
      continue; // unsupported compression, skip quietly
    }
    out.push({ name, buffer: content });
  }
  return out;
}

/* ================================ CSV ================================ */

export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const head = rows[0].map(h => h.trim());
  return rows.slice(1).filter(r => r.length > 1).map(r => {
    const o = {};
    head.forEach((h, i) => { o[h] = (r[i] ?? '').trim(); });
    return o;
  });
}

/* Garmin renames these columns between exports and locales, so match loosely. */
const CSV_ALIASES = {
  date: ['date', 'activity date', 'start time', 'datum'],
  type: ['activity type', 'type'],
  title: ['title', 'activity name'],
  durSec: ['time', 'elapsed time', 'moving time', 'duration'],
  distKm: ['distance'],
  avgHr: ['avg hr', 'average heart rate', 'avg heart rate'],
  maxHr: ['max hr', 'max heart rate'],
  avgCadence: ['avg bike cadence', 'avg cadence', 'average cadence'],
  maxCadence: ['max bike cadence', 'max cadence'],
  avgRunCadence: ['avg run cadence'],
  avgPower: ['avg power', 'average power'],
  maxPower: ['max power'],
  np: ['normalized power® (np®)', 'normalized power', 'np'],
  tss: ['training stress score®', 'training stress score', 'tss'],
  leftPct: ['avg left right balance', 'avg l/r balance', 'left right balance'],
  gct: ['avg ground contact time', 'avg gct'],
  gctBalance: ['avg gct balance', 'avg ground contact time balance'],
  vertOsc: ['avg vertical oscillation'],
  steps: ['steps', 'total steps'],
  calories: ['calories']
};

function pick(row, key) {
  const names = CSV_ALIASES[key] || [];
  for (const k of Object.keys(row)) {
    const lk = k.toLowerCase().trim();
    if (names.includes(lk)) return row[k];
  }
  return null;
}

/** "49.8% L / 50.2% R" or "48.6" -> percent contributed by the left side. */
function parseBalance(v) {
  if (v == null || v === '') return null;
  const s = String(v);
  const m = s.match(/([\d.]+)\s*%?\s*L/i);
  if (m) return parseFloat(m[1]);
  const r = s.match(/([\d.]+)\s*%?\s*R/i);
  if (r && !m) return 100 - parseFloat(r[1]);
  return num(s);
}

const SPORT_FROM_TEXT = t => {
  const s = (t || '').toLowerCase();
  if (/climb|boulder/.test(s)) return 'rock_climbing';
  if (/run|jog/.test(s)) return 'running';
  if (/walk/.test(s)) return 'walking';
  if (/hik/.test(s)) return 'hiking';
  if (/(indoor|virtual)?\s*(cycl|bike|ride|trainer)/.test(s)) return 'cycling';
  if (/strength|cardio|training|yoga/.test(s)) return 'training';
  return 'other';
};

/* ========================= normalized records ========================= */

function activityId(a) {
  return `${a.startISO || a.date}|${a.sport}|${Math.round(a.durSec || 0)}`;
}

function fitToActivity(msgs, fileName) {
  const s = (msgs.session || [])[0];
  if (!s) return null;
  const recs = msgs.record || [];
  const start = s.start_time || s.timestamp;
  const a = {
    date: iso(start), startISO: start ? start.toISOString() : null,
    sport: SPORT[s.sport] || 'other', subSport: s.sub_sport ?? null,
    source: 'fit', file: fileName,
    durSec: s.total_timer_time ?? s.total_elapsed_time ?? null,
    distKm: s.total_distance != null ? s.total_distance / 1000 : null,
    avgPower: s.avg_power ?? null, maxPower: s.max_power ?? null, np: s.normalized_power ?? null,
    tss: s.training_stress_score ?? null, intensity: s.intensity_factor ?? null,
    ftp: s.threshold_power ?? null,
    avgHr: s.avg_heart_rate ?? null, maxHr: s.max_heart_rate ?? null,
    avgCadence: s.avg_cadence ?? null, maxCadence: s.max_cadence ?? null,
    leftPct: s.left_right_balance ?? null,
    teL: s.avg_left_torque_effectiveness ?? null, teR: s.avg_right_torque_effectiveness ?? null,
    psL: s.avg_left_pedal_smoothness ?? null, psR: s.avg_right_pedal_smoothness ?? null,
    gctBalanceLeftPct: s.avg_stance_time_balance ?? null,
    stanceMs: s.avg_stance_time ?? null, vertOsc: s.avg_vertical_oscillation ?? null,
    stepLenMm: s.avg_step_length ?? null,
    calories: s.total_calories ?? null, rpe: s.workout_rpe ?? null,
    steps: null
  };
  if (recs.length > 20) a.detail = summarizeRecords(recs);
  a.id = activityId(a);
  return a;
}

/** Per-second analysis: how much of the ride sat at knee-unfriendly torque,
 *  and how steady the left/right split actually was. */
function summarizeRecords(recs) {
  const torques = [], cadences = [], balances = [];
  let lowCad = 0, n = 0;
  for (const r of recs) {
    if (r.cadence != null) { cadences.push(r.cadence); if (r.cadence > 0 && r.cadence < 70) lowCad++; }
    if (r.power != null && r.cadence) {
      const t = torqueNm(r.power, r.cadence);
      if (t != null) torques.push(t);
    }
    if (r.left_right_balance != null) balances.push(r.left_right_balance);
    n++;
  }
  const sorted = torques.slice().sort((x, y) => x - y);
  const q = p => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : null;
  const mean = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
  const bMean = mean(balances);
  const bSd = balances.length > 1
    ? Math.sqrt(balances.reduce((s, v) => s + (v - bMean) ** 2, 0) / (balances.length - 1)) : null;
  return {
    samples: n,
    lowCadPct: cadences.length ? (lowCad / cadences.length) * 100 : null,
    meanTorque: mean(torques), medTorque: q(0.5), p95Torque: q(0.95),
    balanceMean: bMean, balanceSd: bSd,
    cadenceMean: mean(cadences)
  };
}

function csvToActivity(row) {
  const dateRaw = pick(row, 'date');
  const d = dateRaw ? new Date(dateRaw.replace(' ', 'T')) : null;
  if (!d || isNaN(d)) return null;
  const a = {
    date: iso(d), startISO: d.toISOString(),
    sport: SPORT_FROM_TEXT(pick(row, 'type')), subSport: null,
    source: 'csv', title: pick(row, 'title') || null,
    durSec: parseDuration(pick(row, 'durSec')),
    distKm: num(pick(row, 'distKm')),
    avgPower: num(pick(row, 'avgPower')), maxPower: num(pick(row, 'maxPower')),
    np: num(pick(row, 'np')), tss: num(pick(row, 'tss')), intensity: null, ftp: null,
    avgHr: num(pick(row, 'avgHr')), maxHr: num(pick(row, 'maxHr')),
    avgCadence: num(pick(row, 'avgCadence')) ?? num(pick(row, 'avgRunCadence')),
    maxCadence: num(pick(row, 'maxCadence')),
    leftPct: parseBalance(pick(row, 'leftPct')),
    teL: null, teR: null, psL: null, psR: null,
    gctBalanceLeftPct: parseBalance(pick(row, 'gctBalance')),
    stanceMs: num(pick(row, 'gct')), vertOsc: num(pick(row, 'vertOsc')),
    stepLenMm: null, calories: num(pick(row, 'calories')),
    steps: num(pick(row, 'steps')), rpe: null
  };
  a.id = activityId(a);
  return a;
}

/* ===================== wellness JSON (tolerant scan) ===================== */

const DATE_KEYS = ['calendarDate', 'calendar_date', 'statisticsStartDate', 'wellnessStartTimeLocal',
  'startTimestampLocal', 'sleepStartTimestampLocal', 'date', 'day'];

const METRIC_KEYS = {
  hrv: ['avgOvernightHrv', 'lastNightAvg', 'avgHrv', 'hrvValue', 'weeklyAvgHrv', 'rmssd'],
  hrvStatus: ['status', 'hrvStatus'],
  rhr: ['restingHeartRate', 'restingHR', 'resting_heart_rate', 'wellnessRestingHeartRate'],
  sleepScore: ['sleepScore', 'overallScore', 'overall'],
  sleepSec: ['sleepTimeSeconds', 'totalSleepSeconds', 'sleepTimeInSeconds'],
  bbHigh: ['bodyBatteryHighestValue', 'bodyBatteryHigh', 'highestBodyBattery'],
  bbLow: ['bodyBatteryLowestValue', 'bodyBatteryLow', 'lowestBodyBattery'],
  bbCharged: ['bodyBatteryChargedValue', 'charged', 'bodyBatteryCharged'],
  bbDrained: ['bodyBatteryDrainedValue', 'drained', 'bodyBatteryDrained'],
  steps: ['totalSteps', 'steps', 'wellnessTotalSteps'],
  stress: ['averageStressLevel', 'avgStressLevel', 'overallStressLevel']
};

function scanWellness(node, out, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 8) return;
  if (Array.isArray(node)) { node.forEach(n => scanWellness(n, out, depth + 1)); return; }

  let date = null;
  for (const k of DATE_KEYS) {
    if (node[k]) { const d = iso(String(node[k]).slice(0, 10)); if (d) { date = d; break; } }
  }
  if (date) {
    const rec = { date };
    let got = 0;
    for (const [metric, aliases] of Object.entries(METRIC_KEYS)) {
      for (const a of aliases) {
        let v = node[a];
        if (v && typeof v === 'object' && 'value' in v) v = v.value;
        if (typeof v === 'string' && metric === 'hrvStatus') { rec[metric] = v; got++; break; }
        if (typeof v === 'number' && isFinite(v)) { rec[metric] = v; got++; break; }
      }
    }
    if (got) {
      // sleep scores nest one level deeper in some exports
      if (rec.sleepScore == null && node.sleepScores?.overall?.value != null) rec.sleepScore = node.sleepScores.overall.value;
      out.push(rec);
    }
  }
  for (const v of Object.values(node)) if (v && typeof v === 'object') scanWellness(v, out, depth + 1);
}

export function parseWellnessJson(text) {
  let data;
  try { data = JSON.parse(text); } catch { return []; }
  const out = [];
  scanWellness(data, out);
  // one row per day, later scans filling gaps rather than overwriting
  const byDate = new Map();
  for (const r of out) {
    const cur = byDate.get(r.date) || { date: r.date, source: 'json' };
    for (const [k, v] of Object.entries(r)) if (k !== 'date' && v != null && cur[k] == null) cur[k] = v;
    byDate.set(r.date, cur);
  }
  return [...byDate.values()];
}

/* =============================== ingest =============================== */

const readBuf = file => file.arrayBuffer();
const readText = file => file.text();

export async function ingestFiles(files, { onProgress } = {}) {
  const activities = [], daily = [], warnings = [];
  const queue = [];
  for (const file of files) queue.push({ name: file.name, file });

  let done = 0;
  while (queue.length) {
    const item = queue.shift();
    const name = item.name.toLowerCase();
    try {
      if (name.endsWith('.zip')) {
        const buf = item.buffer ?? await readBuf(item.file);
        const entries = await unzip(buf);
        if (!entries.length) warnings.push(`${item.name}: nothing readable inside the archive.`);
        for (const e of entries) {
          const n = e.name.toLowerCase();
          if (/\.(fit|csv|json)$/.test(n) && !n.includes('__macosx')) queue.push({ name: e.name, buffer: e.buffer });
        }
      } else if (name.endsWith('.fit')) {
        const buf = item.buffer ?? await readBuf(item.file);
        const { messages } = decodeFit(buf);
        const a = fitToActivity(messages, item.name);
        if (a) activities.push(a); else warnings.push(`${item.name}: no session message found.`);
      } else if (name.endsWith('.csv')) {
        const text = item.buffer ? new TextDecoder().decode(item.buffer) : await readText(item.file);
        const rows = parseCsv(text);
        let n = 0;
        for (const r of rows) { const a = csvToActivity(r); if (a) { activities.push(a); n++; } }
        if (!n) warnings.push(`${item.name}: no activity rows recognised.`);
      } else if (name.endsWith('.json')) {
        const text = item.buffer ? new TextDecoder().decode(item.buffer) : await readText(item.file);
        const rows = parseWellnessJson(text);
        if (rows.length) daily.push(...rows);
        else warnings.push(`${item.name}: no daily wellness values recognised.`);
      } else {
        warnings.push(`${item.name}: unsupported file type, skipped.`);
      }
    } catch (err) {
      warnings.push(`${item.name}: ${err.message}`);
    }
    done++;
    onProgress?.(done, done + queue.length);
  }
  return { activities, daily, warnings };
}

/* ============================ merge into store ============================ */

/** FIT beats CSV for the same activity; CSV fills the gaps FIT files leave. */
export function mergeActivities(existing, incoming) {
  const byId = new Map(existing.map(a => [a.id, a]));
  let added = 0, updated = 0;
  for (const a of incoming) {
    const cur = byId.get(a.id);
    if (!cur) { byId.set(a.id, a); added++; continue; }
    const winner = (a.source === 'fit' && cur.source !== 'fit') ? { ...cur, ...strip(a) } : { ...a, ...strip(cur) };
    winner.id = a.id;
    byId.set(a.id, winner);
    updated++;
  }
  return { list: [...byId.values()].sort((x, y) => (x.startISO || '').localeCompare(y.startISO || '')), added, updated };
}
const strip = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null));

export function mergeDaily(existing, incoming) {
  const byDate = new Map(existing.map(d => [d.date, d]));
  let added = 0, updated = 0;
  for (const d of incoming) {
    const cur = byDate.get(d.date);
    if (!cur) { byDate.set(d.date, d); added++; }
    else { byDate.set(d.date, { ...cur, ...strip(d) }); updated++; }
  }
  return { list: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)), added, updated };
}
