/* Kneehab · protocol.js
   All training content as data. Drill copy is preserved verbatim from Kneehab v1.
   Nothing in here depends on the DOM. */

export const FTP_DEFAULT = 124;

export const WEEK_PLAN = [
  { dow: 1, code: 'A',  label: 'Climb A',  tag: 'Climb A + PT', sub: 'Strength & drills · ~60 min · full finisher, then PT strength stack.' },
  { dow: 2, code: 'R1', label: 'Ride 1',   tag: 'Ride 1 · Z2',  sub: 'Z2 aerobic in ERG · 85+ rpm, stay seated · balance drills after.' },
  { dow: 3, code: null, label: 'Rest',     tag: 'Rest',         sub: 'Mobility + a 10–15 min easy walk. No training load.' },
  { dow: 4, code: 'B',  label: 'Climb B',  tag: 'Climb B + PT', sub: 'Endurance · ~60 min · core-only finisher, then PT strength stack.' },
  { dow: 5, code: 'R2', label: 'Ride 2',   tag: 'Ride 2 · SS',  sub: 'Sweet spot in ERG · 85–90 rpm, stay seated · balance drills after.' },
  { dow: 6, code: 'R3', label: 'Ride 3',   tag: 'Ride 3 · Long',sub: 'Long Z2 + cadence surges · 90 rpm base.' },
  { dow: 0, code: null, label: 'Rest',     tag: 'Rest',         sub: 'Full rest · YBT-A slot every 2–3 weeks.' }
];

export const DAY_NAMES = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 0: 'Sun' };

export const SESSION_LABELS = {
  A: 'Climb A', B: 'Climb B', R1: 'Ride 1', R2: 'Ride 2', R3: 'Ride 3', PT: 'PT', YBT: 'YBT-A', WJ: 'Walk–jog', CHK: 'Check-in'
};

/* ---------- climbing phases ---------- */

export const PHASES = [
  {
    n: 1, weeks: 'Weeks 1–3',
    intro: 'Straight-on movement only. Feet stay under the hips, every sequence is mirrored, and every move down is climbed rather than dropped.',
    blocks: [
      {
        title: 'Block A · Lock-off ladders', clock: '15:00–30:00 · both sessions',
        rows: [
          { drill: 'Mirrored lock-off ladder — pull to lock, hold, move up one hold. 6 moves per side. Left side, then identical sequence mirrored right.', cue: 'Feet static, hip-width', dose: '4 × 6 moves (2L / 2R)', rest: '2:30', target: 'Smooth on both sides · RPE 5–6' },
          { drill: 'Gaston → undercling ladder — alternate gaston and undercling up the grid.', cue: 'No high steps', dose: '3 × 6 moves (mirrored)', rest: '2:00', target: 'Hips square · RPE 5–6' }
        ]
      },
      {
        title: 'Block B · Tension & control', clock: '30:00–45:00 · both sessions',
        rows: [
          { drill: '3-second pause traverse — pause 3s after every hand move, hips stay square to wall.', cue: '', dose: '3 × 10 moves', rest: '2:00', target: 'Core holds the pause · RPE 6' },
          { drill: 'Downclimb repeats — climb 6 moves up, downclimb the identical sequence.', cue: 'Zero drops — this is the knee-protection drill', dose: '3 × 12 moves (6 up / 6 down)', rest: '2:30', target: 'Controlled foot placements · RPE 6' }
        ]
      }
    ]
  },
  {
    n: 2, weeks: 'Weeks 4–6',
    intro: 'Gentle knee involvement begins. Add shallow backsteps and outside flags — the foot must pivot freely; never lock the foot and twist. Steps may rise to mid-thigh from Week 5. Angle to ~20° overhang if pain-free.',
    blocks: [
      {
        title: 'Block A · Rotation entry', clock: '15:00–30:00',
        rows: [
          { drill: 'Shallow backstep ladder — outside edge, hip turns in ≤45°, 6 moves per side.', cue: 'Foot pivots freely on hold', dose: '4 × 6 moves (2L / 2R)', rest: '2:30', target: 'Compare op-leg vs. non-op tolerance · RPE 6' },
          { drill: 'Outside flag circuit — flag the free leg on every second move.', cue: 'Straight flagging leg only', dose: '3 × 8 moves (mirrored)', rest: '2:00', target: 'Hip stays close to wall · RPE 6–7' }
        ]
      },
      {
        title: 'Block B · Loaded control', clock: '30:00–45:00',
        rows: [
          { drill: 'Mid-thigh high-step repeats — deliberate high step, weight through the whole foot, stand up slowly (3s).', cue: 'Wk 5+ only · alternate legs each rep', dose: '3 × 6 reps (3 per leg)', rest: '2:30', target: 'No knee wobble on stand-up · RPE 7' },
          { drill: '3-second pause ladder on smaller feet — Phase 1 pause drill, footholds one size down.', cue: '', dose: '3 × 8 moves', rest: '2:00', target: 'Core holds the pause, not arms · RPE 7' }
        ]
      }
    ]
  },
  {
    n: 3, weeks: 'Weeks 7–8+',
    intro: 'Reintroduce rotation properly. Shallow drop knees on big holds, mirrored so the operated knee is directly compared against the healthy side. Heel hooks come absolutely last — they load the meniscus and hamstring attachment more than expected.',
    blocks: [
      {
        title: 'Block A · Drop knee entry', clock: '15:00–30:00',
        rows: [
          { drill: 'Shallow drop knee holds — big foothold, knee rotates ≤45° down, hold the position statically.', cue: 'Ease in over 2s · never snap into it', dose: '4 × 5 reps × 5s hold (mirrored)', rest: '2:30', target: 'Zero sharp/joint-line pain · RPE 6' },
          { drill: 'Drop knee ladder — link 4 moves using a shallow drop knee on alternating sides.', cue: '', dose: '3 × 4 moves (mirrored)', rest: '2:30', target: 'Op-leg matches non-op smoothness · RPE 7' }
        ]
      },
      {
        title: 'Block B · Integration', clock: '30:00–45:00',
        rows: [
          { drill: 'Mixed-pattern circuit — 8 moves combining backstep, flag, high step, and one shallow drop knee.', cue: '', dose: '4 × 8 moves (mirrored)', rest: '3:00', target: 'Fluid linking, no hesitation · RPE 7–8' },
          { drill: 'Heel hook introduction — large hold at hip height, load progressively to ~50% effort. Only if all drop-knee work is pain-free for 2 full sessions.', cue: 'Wk 8+ · stop at any posterior knee pain', dose: '2 × 4 reps × 5s (per leg)', rest: '2:00', target: 'Sub-maximal only · RPE 5' }
        ]
      }
    ]
  }
];

export const ENDURANCE = {
  intro: "Endurance work runs on Session B each week and progresses alongside the drill phases. It's knee-friendly by design — low intensity, big holds, static feet — so it starts in Week 1. On ARC blocks you should be able to hold a conversation; a deep forearm pump means the wall is too steep or the holds too small.",
  byPhase: [
    { n: 1, rows: [
      { drill: 'ARC traverse — continuous climbing, never stopping, never pumping out. Shake out on the wall, not off it.', cue: 'Feet under hips, static placements', dose: '2 × 8:00 continuous', rest: '5:00', target: 'Conversational pace · RPE 4–5' },
      { drill: 'Foot-precision cooldown traverse — same rules, eyes on every foothold until the foot lands.', cue: '', dose: '1 × 5:00', rest: '—', target: 'Zero foot readjustments · RPE 3–4' }
    ]},
    { n: 2, rows: [
      { drill: "Extended ARC — longer continuous blocks; weave in backsteps and outside flags as they're cleared in the drill phases.", cue: 'Foot pivots freely on every turn', dose: '3 × 8:00 continuous', rest: '4:00', target: 'Mild pump only, recovers on the wall · RPE 5' },
      { drill: 'Minute on / minute off ladder — 1:00 of continuous moderate climbing, 1:00 full rest. Alternate weekly with extended ARC.', cue: '', dose: '8 × 1:00 on / 1:00 off', rest: 'built in', target: 'Same move count every round · RPE 6' }
    ]},
    { n: 3, rows: [
      { drill: 'Systems 4×4 — build 4 mirrored circuits of 8 moves each; climb all 4 back-to-back with ~15s between circuits = 1 set. Downclimb, never drop.', cue: 'One shallow drop knee max per circuit', dose: '4 sets × 4 circuits', rest: '4:00 between sets', target: 'Pumped but clean on the last circuit · RPE 7–8' },
      { drill: 'ARC flush — easy continuous traverse to clear the pump after the 4×4.', cue: '', dose: '1 × 8:00', rest: '—', target: 'Recovery pace · RPE 3–4' }
    ]}
  ]
};

export const FINISHER = [
  { ex: 'Hangboard — 20mm edge, open-hand, feet assisted as needed', dose: '3 × 10s hang', rest: '1:50 between', sessionAonly: true },
  { ex: 'Front plank', dose: '3 × 30–45s', rest: '0:45' },
  { ex: 'Side plank (both sides)', dose: '2 × 20–30s / side', rest: '0:30' },
  { ex: 'Straight-leg raises, operated side', dose: '2 × 12 reps', rest: '0:45' }
];

export const MOVEMENT_KEY = [
  { state: 'ok',   title: 'Cleared from week 1', body: 'Static feet under hips, downclimbing, straight-on locks, gastons, underclings, open flags on straight leg.' },
  { state: 'warn', title: 'Introduce with caution', body: 'Backsteps & outside flags (Wk 4+), shallow drop knees (Wk 7+), high steps above mid-thigh (Wk 5+).' },
  { state: 'stop', title: 'Avoid until cleared', body: 'Heel hooks, knee bars, deep drop knees, dynamic moves, any jump-off or drop — downclimb everything.' }
];

/* ---------- cycling ----------
   pctFtp values drive the executed-vs-prescribed comparison against Garmin data. */

export const RIDES = {
  R1: {
    name: 'Ride 1 · Z2 aerobic', totalMin: 51, targetTss: 45,
    mainPctFtp: 0.68, cadenceFloor: 88, cadenceTarget: '90–95 rpm',
    blocks: [
      { block: 'Warm-up ramp', time: '10:00', pct: '50 → 65% FTP', note: 'Build gradually, settle in' },
      { block: 'Steady blocks × 3 — 3:00 @ 55% between blocks', time: '3 × 12:00', pct: '68% FTP', note: '90–95 rpm · nasal-breathing pace' },
      { block: 'Cooldown', time: '5:00', pct: '50% FTP', note: 'Easy spin' }
    ],
    phaseNote: 'Phase 1 (Wks 1–3): trim to 3 × 10:00 @ 65% — total 50:00, ~42 TSS'
  },
  R2: {
    name: 'Ride 2 · Sweet spot', totalMin: 46, targetTss: 60,
    mainPctFtp: 0.89, cadenceFloor: 85, cadenceTarget: '85–90 rpm',
    blocks: [
      { block: 'Warm-up ramp — include 2 × 0:30 @ 85% primers in the last 4 min', time: '12:00', pct: '50 → 70% FTP', note: '85–90 rpm' },
      { block: 'Sweet spot × 3 — 5:00 @ 55% between intervals', time: '3 × 8:00', pct: '88–90% FTP', note: '85–90 rpm · hold form, no rocking' },
      { block: 'Cooldown', time: '5:00', pct: '50% FTP', note: 'Easy spin' }
    ],
    phaseNote: 'Wks 1–3: 3 × 6:00 @ 85% · Wks 4–6: 3 × 10:00 @ 88–90% · Wks 7+: 2 × 15:00 @ 90% (~80 TSS)'
  },
  R3: {
    name: 'Ride 3 · Long Z2', totalMin: 75, targetTss: 65,
    mainPctFtp: 0.675, cadenceFloor: 88, cadenceTarget: '90 rpm base · surges 100–105',
    blocks: [
      { block: 'Warm-up ramp', time: '10:00', pct: '50 → 65% FTP', note: 'Relaxed' },
      { block: 'Continuous Z2 — every 12:00, insert a 1:00 cadence surge (4 total)', time: '55:00', pct: '65–70% FTP', note: '90 rpm base · surges 100–105 rpm — leg speed, not power' },
      { block: 'Cooldown', time: '10:00', pct: '50% FTP', note: 'Easy spin' }
    ],
    phaseNote: 'Swappable for an outdoor flat ride (NCR-style, minimal climbing) at the same duration once cleared for road riding'
  }
};

/* ---------- PT ---------- */

export const PT_PHASES = [
  { phase: 'III — Rebuild', timeline: 'Wk 6–16', alongside: 'App Phase 1–2 (climb drills + Z2/SS rides)', gate: 'Full ROM · swelling ≤1+ · YBT-A SSD ≤8 cm. No load >70° knee flexion through wk 16.' },
  { phase: 'IV — Restore',  timeline: 'Wk 16+',  alongside: 'App Phase 3 (dynamic climbing, full rides)', gate: 'Walk–jog: SSD ≤8 cm + ≥55% depth/LL · Continuous running: SSD ≤4 cm + ≥55%.' }
];

export const PT_STRENGTH = [
  { ex: 'Squats', dose: '12 × 3', note: 'Progress toward 70° — hard cap ≤70° under load through wk 16' },
  { ex: 'Reverse → forward lunges', dose: '10/leg × 2–3', note: 'Reverse first (easier on knee) · 3-count controlled descent' },
  { ex: 'Single-leg RDL', dose: '8–10/leg × 2–3', note: 'Hip hinge, slight knee bend — hamstring, not knee' },
  { ex: 'Lateral walks', dose: '10–15 steps × 2', note: 'Bodyweight only' },
  { ex: 'Calf raises', dose: '20 × 2', note: 'Double-leg → single-leg progression' },
  { ex: 'Step-downs', dose: '10/leg × 2–3', note: '6–8 in step · 4-sec eccentric — the key rep for running prep', tag: 'PT IV' },
  { ex: 'Single-leg squats', dose: '10/leg × 3', note: '30–45° · knee tracks over 2nd toe, no valgus collapse', tag: 'PT IV' },
  { ex: 'Plyometrics', dose: '8–10 × 2', note: 'Two-leg jumps → single-leg hops · only after jogging is symptom-free', tag: 'GATED' }
];

export const PT_BALANCE = [
  { drill: 'Single-leg stance', dose: '30–45 s × 3/leg', prog: 'Eyes closed → head turns → cushion' },
  { drill: 'Single-leg mini squat', dose: '10 × 2', prog: '30° max · wall nearby · no valgus' },
  { drill: 'Step-ups', dose: '10/leg × 2', prog: '6–8 in step · 3-sec lowering' }
];

export const WALK_JOG = [
  { wk: 'Wk 1', cycle: 'Walk 4 min · jog 1 min' },
  { wk: 'Wk 2', cycle: 'Walk 3 · jog 2' },
  { wk: 'Wk 3', cycle: 'Walk 2 · jog 3' },
  { wk: 'Wk 4', cycle: 'Walk 1 · jog 4' },
  { wk: 'Wk 5+', cycle: 'Continuous — needs SSD ≤4 cm' }
];
export const WALK_JOG_RULE = "5 cycles per session, with a 5-min warm-up and cool-down walk every time. Any swelling increase means return to the previous week's ratio. Progress week by week regardless of how good it feels.";

export const STOP_RULES = [
  { t: 'Downclimb everything.', b: 'Impact from even low drops is the single biggest threat to the healing meniscus. No exceptions in any phase.' },
  { t: '24-hour rule.', b: 'Mild fatigue-type discomfort during a session is acceptable; any swelling, sharp pain, or joint-line pain lasting past the next morning means repeat the previous week — do not progress.' },
  { t: 'Advance one variable at a time.', b: 'Angle, foothold size, or movement type — never two in the same week.' },
  { t: 'Mirror every drill.', b: 'The operated leg must match the healthy side in smoothness and confidence before its loading increases.' },
  { t: 'Phase gates.', b: 'Enter Phase 2 only if all Phase 1 drills are pain-free for 2 consecutive sessions; same rule for Phase 3. Heel hooks require 2 pain-free drop-knee sessions first.' },
  { t: 'Confirm clearance.', b: "Twisting/pivoting progression (Phase 2 onward) should align with your surgical team's return-to-sport guidance." },
  { t: 'Swelling outranks pain.', b: 'Grade it every session: 2+ = no progression this week; 3+ = drop back a phase; 4+ = call the surgeon. Any next-morning swelling increase = repeat previous week.' },
  { t: 'YBT-A gates all impact.', b: 'No walk–jog until SSD ≤8 cm and depth ≥55% LL; no continuous running until SSD ≤4 cm. Retest every 2–3 weeks. Knee flexion under load ≤70° through week 16.' }
];

/* ---------- readiness-driven session adaptation ----------
   Each entry: what changes when the day opens amber or red. */

export const ADAPT = {
  A: {
    amber: ['Drop Block B to a single set of the pause traverse; keep all downclimb work.',
            'No new movement pattern today — repeat what was already clean last session.',
            'Finisher: hangboard only if fingers feel fresh, otherwise core rows alone.'],
    red:   ['Skip the climb. Mobility plus a 10–15 min easy walk.',
            'PT strength stack is optional at half dose if the knee is quiet at rest.']
  },
  B: {
    amber: ['Cut the ARC blocks by one set and hold RPE at 4.',
            'Skip the technique block; endurance volume only.'],
    red:   ['Skip the climb. Mobility plus a 10–15 min easy walk.']
  },
  R1: {
    amber: ['Trim to 2 × 12:00 and hold the low end of the Z2 band.',
            'Cadence floor rises: stay above 90 rpm to keep crank torque down.'],
    red:   ['Replace with 20–30 min at 50–55% FTP, 90+ rpm, or take the day off the bike.']
  },
  R2: {
    amber: ['Convert sweet spot to Z2 tempo: 3 × 8:00 at 70–75% FTP instead of 88–90%.',
            'This is the session to soften first — it carries the highest pedal force of the week.'],
    red:   ['No sweet spot. Easy spin at 50–55% FTP for 20–30 min, or rest.']
  },
  R3: {
    amber: ['Cut the continuous block to 35:00 and drop the cadence surges.'],
    red:   ['Rest, or 20 min easy spin.']
  },
  PT: {
    amber: ['Hold current loads, no progression. Drop the plyometric row entirely.'],
    red:   ['Isometrics and range of motion only. No step-downs, no single-leg squats.']
  }
};

export const RIDE_CODES = ['R1', 'R2', 'R3'];
export const CLIMB_CODES = ['A', 'B'];
