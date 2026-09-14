# Kneehab v2

Post-meniscectomy return-to-climb and ride protocol, rebuilt around a Garmin-driven readiness dashboard. Static site, no backend, no build step. Everything parses and stores in the browser.

## Files

| File | What it is |
|---|---|
| `index.html` | Shell and tab structure only |
| `app.css` | Design tokens and layout |
| `app.js` | UI, state, charts, import handling |
| `engine.js` | Readiness math, load, gates, asymmetry, ride compliance. Pure functions, no DOM |
| `garmin.js` | FIT, CSV, JSON and ZIP ingest, normalization, merge |
| `fit.js` | Dependency-free FIT binary decoder |
| `protocol.js` | All training content as data |
| `sync.js` | Pulls `data/store.json` from the repo on every open and merges it into local storage |
| `sw.js` | Offline cache |
| `data/store.json` | The shared copy of the log and ride history, same shape as an export. Commit to it to reach every device |
| `docs/quick-log.md` | The two-tap logging paths, including the URL parameters and an iOS Shortcut recipe |
| `tools/make_fit.py` | Builds a synthetic FIT ride for testing |
| `tools/verify.py` | Headless Playwright checks |

Keep the existing `manifest.json`, `icon-180.png` and `icon-192.png`. They are unchanged.

## Deploying over v1

Drop these files into the repo root, replacing `index.html`. Two things to know:

1. The old service worker will still be registered in any browser that has visited the site. It caches the old single-file `index.html`, so the first load after deploying may still show v1. A second load picks up the new worker, which uses a new cache name and claims clients immediately. A hard reload forces it.
2. Nothing is lost. On first run v2 reads the old `sbkr_log_v1` and `sbkr_start_v1` keys and migrates them into `kneehab_v2`. The old keys are left in place as a fallback.

## Logging without the form (v2.2)

The Today tab now opens with a quick log: session type preselected to today's slot, swelling and pain as tap rows, one checkbox for the 24-hour flag. The same entry can be made from a URL, `?s=1&p=2`, which is what a home-screen Shortcut opens. See `docs/quick-log.md`. Drills, the score breakdown and the gate board are folded away on Today and open with a tap.

## Keeping devices in step

Browser storage does not sync between the Mac and the phone. The app now ships `data/store.json` and merges it on every open: entries and rides in that file appear on every device, nothing local is removed, and repo settings only fill blanks. To publish new entries, export from the device that has them and commit the file as `data/store.json`. Settings has a "Sync now" button.

## Getting Garmin data in

There is no Garmin API call and no OAuth. Files go in, and nothing leaves the browser.

**Per ride, the fast path.** Garmin Connect, open the activity, gear menu, Export Original. That downloads the `.fit`. Drop it on the Garmin tab. The FIT file carries what the CSV export does not: per-second power and cadence, left/right balance sampled through the ride, torque effectiveness, pedal smoothness, and the FTP the head unit was using.

**In bulk.** Garmin Connect, Activities, the export icon at the top right gives a CSV of everything on screen. Drop that. It fills in history quickly but has no per-second detail.

**Everything, including sleep and HRV.** Garmin account settings, Export Your Data. You get a large `.zip` by email. Drop the whole zip in without unpacking it. The app walks the archive, decodes the FITs, reads the activities CSV, and scans the wellness JSON for resting heart rate, overnight HRV, sleep score and duration, body battery, steps and stress. The wellness JSON key names change between exports, so the scanner matches loosely rather than assuming one schema.

Re-importing is safe. Activities are keyed on start time, sport and duration; a FIT file always wins over a CSV row for the same activity, and the CSV fills any gaps the FIT left.

A recording left running gets thrown out rather than stored. Any wheeled activity that covers real distance at under 5 km/h is skipped on import and named in the warnings with its reason, because an all-day file counts as one long low-power ride and can carry a few hundred TSS into the acute load. Walking, hiking and running are exempt, and so is an indoor ride reporting no distance.

## How readiness is scored

Out of 100, but only over the inputs that actually have data, so it works on day one and sharpens as data arrives.

| Input | Weight | Reads |
|---|---|---|
| HRV vs baseline | 24 | 3-night mean against a 60-night log-scaled baseline. Full credit at or above −0.5 SD, zero at −2 SD |
| Resting HR | 6 | Against a 30-day mean, zero at +7 bpm |
| Sleep | 12 | Garmin sleep score, or duration against 7.5 h |
| Body battery | 8 | Overnight peak |
| Swelling | 18 | Worst grade in the last 3 days |
| Pain | 12 | Last logged session |
| Acute:chronic load | 20 | 7-day TSS against the 28-day rolling equivalent, best between 0.8 and 1.3 |

Bands: 75 and above green, 55 to 74 amber, below 55 red.

**Overrides sit on top of the score and only ever push it down.** Swelling 3+ in 48 hours forces red. Swelling 2+ or a live 24-hour flag caps the day at amber. Pain 7 or above on the last session forces red. This is deliberate: the protocol says swelling outranks pain, and neither one should be outvoted by a good night's HRV.

When the day is amber or red, the session card rewrites the prescription rather than just warning. Sweet spot becomes Z2 tempo, drill blocks lose a set, the climb turns into a walk.

## The symmetry idea

The YBT-A is the formal gate for impact work, and it happens every two or three weeks. In between there is no reading at all.

A dual-sided power meter produces a left/right split on every ride, and running dynamics produce a ground contact balance on every run. Neither is a substitute for the YBT-A, but both are the same question asked continuously: is the operated leg taking its share. The Symmetry tab plots the operated-leg share per ride with a 5-ride rolling mean against the 50% line, and plots YBT-A side-to-side difference underneath with the 8 cm and 4 cm gates drawn in, so a drift in pedal balance is visible weeks before the next formal test.

Set the operated side in Settings. It decides which half of the Garmin split counts.

## Knee-specific ride checking

Watts alone do not describe knee load. Crank torque does, and torque is power over cadence: `T = P × 60 / (2π × rpm)`. The same 90 W at 60 rpm asks about 1.5 times the pedal force it does at 90 rpm.

Every ride matched to R1, R2 or R3 is checked against the prescription for power, cadence floor, duration and mean crank torque, and FIT files add the share of the ride spent below 70 rpm. Grinding is exactly the pattern the protocol is trying to avoid, and it is invisible if you only look at average power.

## Verifying

```
python3 tools/make_fit.py /tmp/ride.fit     # synthetic ride, readable by fitdecode
python3 tools/verify.py                     # headless run over every tab
```

`verify.py` checks the v1 migration, FIT and CSV and ZIP ingest, the readiness numbers, the swelling override, and that every tab renders without a console error. It writes screenshots to `/tmp/shot_*.png`.

General training guidance, not medical advice. Progress per your surgeon and PT's clearance.
