# Quick log

Two ways to get a grade into Kneehab without opening the Log tab.

## 1. The card on Today

The top card on the Today tab is the quick log. Session type defaults to today's slot (R3 on a Saturday), swelling and pain are tap rows, and the checkbox sets the 24-hour flag on the last session. Save and done. "Full entry" still opens the old form for RPE, notes, and YBT-A numbers.

## 2. By URL, for a home-screen Shortcut

Opening the app with query parameters logs an entry and then clears the query so a reload does not log it twice.

    https://statsverstappen.github.io/kneehab/?s=1&p=2

| Param | Meaning | Values |
|---|---|---|
| `s` | Swelling grade | 0 to 4 |
| `p` | Pain | 0 to 10 |
| `t` | Session type | `CHK` (default, a bare check-in), `A`, `B`, `R1`, `R2`, `R3`, `PT`, `WJ` |
| `f` | Set the 24-hour flag on the most recent session before the date | `1` |
| `d` | Date, defaults to today | `YYYY-MM-DD` |
| `rpe` | Session RPE | 1 to 10 |
| `n` | Notes | URL-encoded text |

Examples:

- Morning after a ride, knee is fine: `?s=0&p=0`
- Morning after a ride, puffy and sore: `?s=1&p=2&f=1`
- Grade the ride itself, after the fact: `?t=R3&s=1&p=3&rpe=7`
- Rest day, nothing to report: `?s=0` (still records a swelling 0 so the score has a fresh reading)

If a session of that type already exists for the date (for example one the Garmin tab added but never graded), the URL grades it instead of creating a duplicate.

### Building the iOS Shortcut

1. Shortcuts app, new shortcut, name it "Knee".
2. Add **Ask for Input**, type Number, prompt "Swelling 0 to 4". Rename the output to `swell`.
3. Add **Ask for Input**, type Number, prompt "Pain 0 to 10". Rename the output to `pain`.
4. Add **Ask for Input**, type Text, prompt "Flag last session? y/n", default `n`. Rename to `flag`.
5. Add **If** `flag` is `y`, then **Text** `1`, otherwise **Text** `0`, and **Set Variable** `f` to the result.
6. Add **URL** with `https://statsverstappen.github.io/kneehab/?s=swell&p=pain&f=f` (insert the variables where the names are).
7. Add **Open URLs**.
8. Add the shortcut to the home screen, or say "Knee" to Siri.

Since the site is a PWA, opening the URL in Safari lands in the same storage as the installed icon only if the icon was added from Safari. If you use the home-screen install, run the Shortcut in Safari and let the sync step carry it across, or just tap the icon and use the card.

### Where it goes from there

Whatever lands on one device stays on that device until it is committed to `data/store.json` in the repo. That file is the same shape as an "Export everything" backup. The app pulls it on every open and merges it, so the routine is: export from the device that has new entries, commit the file, and every other device catches up on its next open. Settings has a "Sync now" button for an immediate pull.
