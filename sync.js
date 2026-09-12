/* Kneehab · sync.js
   Repo-backed sync. The site ships a data/store.json (same shape as an
   "Export everything" backup) that is updated by committing to the repo.
   On every load the app fetches it and merges it into local storage, so a
   log entry or ride added on one device shows up on every other one the
   next time the app opens. Merging is additive: nothing local is removed,
   and settings from the file only fill blanks. */

import { mergeActivities, mergeDaily } from './garmin.js';

export const REMOTE_PATH = './data/store.json';
const SYNC_KEY = 'kneehab_sync';

export function lastSync() {
  try { return JSON.parse(localStorage.getItem(SYNC_KEY)); } catch { return null; }
}

function markSync(info) {
  try { localStorage.setItem(SYNC_KEY, JSON.stringify({ at: new Date().toISOString(), ...info })); } catch { /* ignore */ }
}

/** Merge a schema-2 store object into `store`. Returns what changed. */
export function mergeRemote(store, data) {
  const out = { sessions: 0, activities: 0, daily: 0, settings: 0, updated: 0 };
  if (!data || data.schema !== 2) return out;

  const byId = new Map(store.sessions.map(s => [s.id, s]));
  for (const x of data.sessions || []) {
    if (!x || !x.date || !x.type) continue;
    const local = byId.get(x.id);
    if (!local) { store.sessions.push(x); byId.set(x.id, x); out.sessions++; continue; }
    // the file can fill a grade the device never got (a Garmin-added ride
    // that was later rated elsewhere), but never blanks one the device has
    let touched = false;
    for (const k of ['pain', 'swell', 'rpe', 'flag24', 'notes']) {
      if ((local[k] == null || local[k] === '') && x[k] != null && x[k] !== '') { local[k] = x[k]; touched = true; }
    }
    if (touched) out.updated++;
  }

  const a = mergeActivities(store.garmin.activities, data.garmin?.activities || []);
  const w = mergeDaily(store.garmin.daily, data.garmin?.daily || []);
  store.garmin.activities = a.list; store.garmin.daily = w.list;
  out.activities = a.added; out.daily = w.added;

  const rs = data.settings || {};
  for (const k of ['surgeryDate', 'startDate', 'operatedSide']) {
    if (!store.settings[k] && rs[k]) { store.settings[k] = rs[k]; out.settings++; }
  }
  if (rs.ftp && (!store.settings.ftp || store.settings.ftpSource !== 'manual')) {
    if (store.settings.ftp !== rs.ftp) { store.settings.ftp = rs.ftp; out.settings++; }
  }
  return out;
}

/** Fetch the repo copy and merge it. Silent on failure (offline, no file yet). */
export async function pullRemote(store) {
  let data;
  try {
    const res = await fetch(`${REMOTE_PATH}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    data = await res.json();
  } catch { return null; }
  const out = mergeRemote(store, data);
  markSync({ ok: true, ...out, remoteAt: data.exportedAt || null });
  return out;
}
