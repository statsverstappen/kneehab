/* Kneehab · fit.js
   A dependency-free FIT file decoder.

   Implements the Flexible and Interoperable Data Transfer binary protocol:
   file header, definition messages (with developer-field extensions),
   data messages, and compressed-timestamp headers. Field numbers, base types,
   scales and offsets below are taken from the official FIT profile for the
   messages this app cares about (file_id, session, lap, record).

   decodeFit(arrayBuffer) -> { messages: {session:[], record:[], lap:[], file_id:[]}, errors: [] }
   Values are returned already scaled and in profile units. Invalid sentinel
   values are dropped rather than surfaced as 0xFFFF-style garbage. */

const FIT_EPOCH_MS = 631065600000; // 1989-12-31T00:00:00Z

// baseTypeNum -> [byteSize, reader, invalidSentinel]
const BASE = {
  0x00: { size: 1, invalid: 0xff, read: (d, o) => d.getUint8(o) },              // enum
  0x01: { size: 1, invalid: 0x7f, read: (d, o) => d.getInt8(o) },               // sint8
  0x02: { size: 1, invalid: 0xff, read: (d, o) => d.getUint8(o) },              // uint8
  0x83: { size: 2, invalid: 0x7fff, read: (d, o, le) => d.getInt16(o, le) },
  0x84: { size: 2, invalid: 0xffff, read: (d, o, le) => d.getUint16(o, le) },
  0x85: { size: 4, invalid: 0x7fffffff, read: (d, o, le) => d.getInt32(o, le) },
  0x86: { size: 4, invalid: 0xffffffff, read: (d, o, le) => d.getUint32(o, le) },
  0x07: { size: 1, invalid: 0x00, read: (d, o) => d.getUint8(o), string: true },
  0x0a: { size: 1, invalid: 0x00, read: (d, o) => d.getUint8(o) },              // uint8z
  0x8b: { size: 2, invalid: 0x0000, read: (d, o, le) => d.getUint16(o, le) },   // uint16z
  0x8c: { size: 4, invalid: 0x00000000, read: (d, o, le) => d.getUint32(o, le) },
  0x0d: { size: 1, invalid: 0xff, read: (d, o) => d.getUint8(o) },              // byte
  0x88: { size: 4, invalid: null, read: (d, o, le) => d.getFloat32(o, le) },
  0x89: { size: 8, invalid: null, read: (d, o, le) => d.getFloat64(o, le) },
  0x8e: { size: 8, invalid: null, read: (d, o, le) => Number(d.getBigInt64(o, le)) },
  0x8f: { size: 8, invalid: null, read: (d, o, le) => Number(d.getBigUint64(o, le)) },
  0x90: { size: 8, invalid: 0, read: (d, o, le) => Number(d.getBigUint64(o, le)) }
};

// name, scale, offset. Absent scale means 1.
const f = (name, scale, offset, kind) => ({ name, scale, offset, kind });

const PROFILE = {
  0: { name: 'file_id', fields: { 0: f('type'), 1: f('manufacturer'), 2: f('product'), 3: f('serial_number'), 4: f('time_created', null, null, 'date') } },
  18: {
    name: 'session',
    fields: {
      253: f('timestamp', null, null, 'date'),
      2: f('start_time', null, null, 'date'),
      5: f('sport'), 6: f('sub_sport'),
      7: f('total_elapsed_time', 1000), 8: f('total_timer_time', 1000),
      9: f('total_distance', 100), 10: f('total_cycles'), 11: f('total_calories'),
      14: f('avg_speed', 1000), 15: f('max_speed', 1000),
      16: f('avg_heart_rate'), 17: f('max_heart_rate'),
      18: f('avg_cadence'), 19: f('max_cadence'),
      20: f('avg_power'), 21: f('max_power'),
      22: f('total_ascent'), 23: f('total_descent'),
      24: f('total_training_effect', 10),
      34: f('normalized_power'), 35: f('training_stress_score', 10), 36: f('intensity_factor', 1000),
      37: f('left_right_balance', null, null, 'lrb100'),
      45: f('threshold_power'), 48: f('total_work'),
      59: f('total_moving_time', 1000), 64: f('min_heart_rate'),
      89: f('avg_vertical_oscillation', 10),
      90: f('avg_stance_time_percent', 100), 91: f('avg_stance_time', 10),
      101: f('avg_left_torque_effectiveness', 2), 102: f('avg_right_torque_effectiveness', 2),
      103: f('avg_left_pedal_smoothness', 2), 104: f('avg_right_pedal_smoothness', 2),
      105: f('avg_combined_pedal_smoothness', 2),
      112: f('time_standing', 1000), 113: f('stand_count'),
      114: f('avg_left_pco'), 115: f('avg_right_pco'),
      124: f('enhanced_avg_speed', 1000),
      132: f('avg_vertical_ratio', 100),
      133: f('avg_stance_time_balance', 100),
      134: f('avg_step_length', 10),
      192: f('workout_feel'), 193: f('workout_rpe'),
      195: f('avg_stress'), 197: f('sdrr_hrv'), 198: f('rmssd_hrv')
    }
  },
  19: {
    name: 'lap',
    fields: {
      253: f('timestamp', null, null, 'date'), 2: f('start_time', null, null, 'date'),
      7: f('total_elapsed_time', 1000), 8: f('total_timer_time', 1000), 9: f('total_distance', 100),
      13: f('avg_heart_rate'), 16: f('avg_heart_rate'), 17: f('max_heart_rate'),
      18: f('avg_cadence'), 19: f('max_cadence'), 20: f('avg_power'), 21: f('max_power'),
      24: f('intensity'), 33: f('normalized_power'),
      34: f('left_right_balance', null, null, 'lrb100'),
      25: f('event_group'), 254: f('message_index')
    }
  },
  20: {
    name: 'record',
    fields: {
      253: f('timestamp', null, null, 'date'),
      2: f('altitude', 5, -500), 3: f('heart_rate'), 4: f('cadence'),
      5: f('distance', 100), 6: f('speed', 1000), 7: f('power'),
      30: f('left_right_balance', null, null, 'lrb'),
      39: f('vertical_oscillation', 10), 40: f('stance_time_percent', 100), 41: f('stance_time', 10),
      43: f('left_torque_effectiveness', 2), 44: f('right_torque_effectiveness', 2),
      45: f('left_pedal_smoothness', 2), 46: f('right_pedal_smoothness', 2),
      47: f('combined_pedal_smoothness', 2),
      53: f('fractional_cadence', 128), 73: f('enhanced_speed', 1000),
      84: f('stance_time_balance', 100), 85: f('step_length', 10)
    }
  }
};

export const SPORT = {
  0: 'generic', 1: 'running', 2: 'cycling', 3: 'transition', 4: 'fitness_equipment',
  5: 'swimming', 6: 'basketball', 10: 'training', 11: 'walking', 13: 'hiking',
  17: 'hiking', 18: 'multisport', 19: 'paddling', 31: 'rock_climbing', 37: 'mountaineering'
};

function decodeLrb(raw, hundred) {
  // left_right_balance(_100): low bits are the percentage, high bit flags which
  // side the value describes. Normalized here to "percent contributed by LEFT".
  if (raw == null) return null;
  const mask = hundred ? 0x3fff : 0x7f;
  const rightFlag = hundred ? 0x8000 : 0x80;
  const val = (raw & mask) / (hundred ? 100 : 1);
  if (!val) return null;
  return (raw & rightFlag) ? 100 - val : val;
}

export function decodeFit(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const errors = [];
  const messages = {};

  if (bytes.length < 14) throw new Error('File is too small to be a FIT file.');
  const headerSize = view.getUint8(0);
  if (headerSize !== 12 && headerSize !== 14) throw new Error('Not a FIT file (bad header size).');
  const magic = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  if (magic !== '.FIT') throw new Error('Not a FIT file (missing .FIT signature).');
  const dataSize = view.getUint32(4, true);

  let pos = headerSize;
  const end = Math.min(headerSize + dataSize, bytes.length);
  const defs = new Map();     // localMsgType -> definition
  let lastTimestamp = null;

  const push = (name, obj) => { (messages[name] || (messages[name] = [])).push(obj); };

  while (pos < end) {
    const header = view.getUint8(pos++);
    let localType, timeOffset = null;

    if (header & 0x80) {                       // compressed timestamp header
      localType = (header >> 5) & 0x03;
      timeOffset = header & 0x1f;
    } else {
      localType = header & 0x0f;
      if (header & 0x40) {                     // definition message
        pos++;                                 // reserved
        const arch = view.getUint8(pos++);
        const le = arch === 0;
        const globalNum = view.getUint16(pos, le); pos += 2;
        const numFields = view.getUint8(pos++);
        const fields = [];
        for (let i = 0; i < numFields; i++) {
          fields.push({ num: view.getUint8(pos), size: view.getUint8(pos + 1), base: view.getUint8(pos + 2) });
          pos += 3;
        }
        let devFields = [];
        if (header & 0x20) {
          const numDev = view.getUint8(pos++);
          for (let i = 0; i < numDev; i++) {
            devFields.push({ num: view.getUint8(pos), size: view.getUint8(pos + 1), idx: view.getUint8(pos + 2) });
            pos += 3;
          }
        }
        defs.set(localType, { globalNum, le, fields, devFields });
        continue;
      }
    }

    const def = defs.get(localType);
    if (!def) { errors.push(`Data message for undefined local type ${localType} at byte ${pos}`); break; }

    const spec = PROFILE[def.globalNum];
    const out = spec ? {} : null;

    for (const fd of def.fields) {
      const start = pos;
      pos += fd.size;
      if (!spec) continue;
      const bt = BASE[fd.base] ?? BASE[fd.base & 0x1f] ?? null;
      const meta = spec.fields[fd.num];
      if (!bt || !meta) continue;

      let value;
      if (bt.string) {
        let s = '';
        for (let i = start; i < start + fd.size; i++) { const c = bytes[i]; if (!c) break; s += String.fromCharCode(c); }
        value = s || null;
      } else if (fd.size > bt.size) {
        // array field: keep the first valid element, which is what the profile
        // messages used here always carry in slot 0
        value = null;
        for (let o = start; o + bt.size <= start + fd.size; o += bt.size) {
          const v = bt.read(view, o, def.le);
          if (bt.invalid === null || v !== bt.invalid) { value = v; break; }
        }
      } else {
        const v = bt.read(view, start, def.le);
        value = (bt.invalid !== null && v === bt.invalid) ? null : v;
      }
      if (value == null) continue;

      if (meta.kind === 'date') {
        lastTimestamp = value;
        out[meta.name] = new Date(value * 1000 + FIT_EPOCH_MS);
        continue;
      }
      if (meta.kind === 'lrb100' || meta.kind === 'lrb') {
        const pct = decodeLrb(value, meta.kind === 'lrb100');
        if (pct != null) out[meta.name] = pct;
        continue;
      }
      if (meta.scale) value = value / meta.scale;
      if (meta.offset) value = value + meta.offset;
      out[meta.name] = value;
    }

    for (const dv of def.devFields) pos += dv.size;

    if (!spec) continue;

    if (timeOffset !== null && lastTimestamp != null) {
      const prev = lastTimestamp;
      const next = prev + (((timeOffset - (prev & 0x1f)) + 32) % 32);
      lastTimestamp = next;
      out.timestamp = new Date(next * 1000 + FIT_EPOCH_MS);
    }
    push(spec.name, out);
  }

  return { messages, errors };
}
