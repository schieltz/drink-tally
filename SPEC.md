# Build: Drink Tally v1 (personal drink log, iPhone web app)

## Goal
Build a small web app that I open from my iPhone home screen. I log drinks at night in one or two taps. The app counts US standard drinks, not glasses, and shows my week against a target (default 5). The morning after a drinking day, it asks how I feel and, over time, shows me how my mornings change with how much I drank. This is an awareness tool, not a medical app. My data stays on my phone. No accounts. No backend.

My drinks are mostly martinis, vodka sodas, Orange Crushes, other cocktails, canned hard seltzers and canned cocktails, and sometimes champagne or wine. Beer is rare. The presets and the size controls must fit these drinks.

## How to work
1. First commit: save this whole prompt as `SPEC.md` in the repo root. It is the source of truth for later sessions.
2. Plan first. Show me a short plan: file list, data model, test list, and any spec conflicts or questions. Wait for my OK.
3. Create `CLAUDE.md`. Put the "Hard rules" section in it, plus the test and local-serve commands, plus "Read SPEC.md before changing behavior."
4. Build in small commits with clear messages.
5. Do the "Verify before done" checklist. Do not say "done" until every item you can run passes.

## Repo and hosting
- The repo `drink-tally` already exists (public, with a README). Do not create a repo.
- Work on the session branch and push it. I will create and merge the PR.
- The site will be served by GitHub Pages from branch `main`, folder `/` (root), at `https://<user>.github.io/drink-tally/`. No build step. No Actions workflow.
- Use relative paths for every asset, the manifest `start_url` and `scope` (`./`), and the service worker, because the site lives at a subpath.
- Do not try to turn on Pages yourself. Put the exact steps in the README and in your final reply.

## Hard rules
- Vanilla HTML, CSS and JavaScript (ES modules). No framework. No build step. No runtime dependencies.
- Never commit user data, sample personal data, or secrets.
- Keep pure logic (drink math, dates, check-in rules, feedback, import/merge, CSV) in `logic.js` with no DOM access, so Node can test it.
- Tests run with `node --test` and no installs.
- Works offline after the first load.
- Copy tone: neutral, calm, short, no shaming, no exclamation marks, no emojis. No streaks, badges or points.

## Suggested files
`index.html`, `styles.css`, `app.js` (UI), `logic.js` (pure functions), `store.js` (localStorage and migrations), `presets.js` (default drinks), `messages.js` (fallback lines), `sw.js`, `manifest.webmanifest`, `icons/` (simple coupe-glass icon: 180, 192, 512, plus a maskable 512), `tests/logic.test.js`, `README.md`, `CLAUDE.md`, `SPEC.md`.

## Core concept: standard drinks
- 1 US standard drink = 14 g pure alcohol = 0.6 fl oz of ethanol (NIAAA).
- A drink is a list of alcoholic components. For each component: `std = oz * (abv / 100) / 0.6`. The drink total is the sum.
- Non-alcoholic mixers (soda, juice, olive brine) are not stored.
- Store full precision. Show 1 decimal, rounding half up (guard against float error, so 2.15 shows as 2.2).
- Compute every value in code from oz and ABV. Do not hard-code results.

## Default presets
Two adjust types:
- `spirit`: one component is the base spirit. The adjust sheet changes the base pour in 0.5 oz steps, shows it in oz and shots (1 shot = 1.5 oz), and has quick chips for 1, 2 and 3 shots.
- `pour`: the adjust sheet has size chips and ABV chips.

| Preset | Type | Components (oz at ABV%) | Std | Adjust chips |
|---|---|---|---|---|
| Martini | spirit | base: vodka or gin 2.5 at 40; dry vermouth 0.5 at 18 | 1.8 | base pour stepper |
| Vodka soda | spirit | base: vodka 1.5 at 40 | 1.0 | 1, 2, 3 shots |
| Orange Crush | spirit | base: orange vodka 2 at 35; triple sec 2 at 20 | 1.8 | base pour stepper |
| Cocktail | spirit | base: spirit 2 at 40 | 1.3 | 1, 2, 3 shots |
| Hard seltzer | pour | 12 at 5 | 1.0 | size 12, 16, 24 oz; ABV 4.5, 5, 8 |
| Canned cocktail | pour | 12 at 7 | 1.4 | size 12, 16 oz; ABV 4.5, 7, 10, 12 |
| Champagne | pour | 5 at 12 | 1.0 | size 4, 5, 6 oz |
| Wine | pour | 5 at 13 | 1.1 | size 5, 6, 9 oz |
| Beer | pour | 12 at 5 | 1.0 | size 12, 16 oz; ABV 4, 5, 7 |
| Custom | spirit or pour | user builds components | live | n/a |

- Presets are editable in Settings: name, type, components (name, oz, ABV), and which component is the base. I can add, duplicate, delete and reorder.
- Order the preset grid by how often I used each preset in the last 60 days, ties in default order. A Settings toggle turns this off.

## Logging flow
- Tap a preset: log 1 of that drink now at its default pour. Show a toast for 6 seconds: "Martini, 1.8 std" with "Adjust" and "Undo".
- "Adjust" (or long-press a preset before logging) opens a bottom sheet:
  - Pour controls for the preset type (above), with a live std preview.
  - Count stepper 1 to 6 (for "I had 3 of these tonight").
  - When: "Now" (default), "Earlier tonight", or pick a date and time.
  - Optional short note (for example "Bar pour, big glass").
  - Save. Each drink in the count becomes its own entry.
- Drinking-day rollover: a drink logged from midnight to 3:59 am counts toward the previous day. The rollover hour is a setting (default 4).

## Screens
One page with a bottom tab bar: Week, History, Settings. Phone first (390 px wide). Thumb-reachable controls in the bottom half.

### Week (home)
- Morning check-in card at the top when the check-in rule (below) says to show it.
- Large progress ring: this week's std drinks vs target, for example "3.6 / 5".
- Ring color: below 80% of target = calm/green, 80 to 100% = amber, above target = red. Color plus the number only, no warning text.
- Under the ring: "Left this week: 1.4" (or "Over by 0.6").
- Mon to Sun day strip with small bars. Today is highlighted. A small dot marks any day above the daily cap (default 2).
- Preset button grid (2 columns). Each button shows the name and its default std value.
- Tap a day in the strip to open that day: its drinks, its check-in, add a drink to that day, edit or delete drinks.

### Morning check-in
- Rule: show the card on the first app open after the rollover hour when the previous drinking day has at least one drink and no check-in yet. Never show it after a dry day. If I skip it, do not show it again for that day, but I can still add it from that day's view.
- The card asks "How do you feel this morning?" with 5 buttons: Great, Good, OK, Rough, Bad (stored 5 to 1). Optional second row: "Sleep: Good, OK, Poor". Optional note. Save or Skip.
- After Save, show one line of feedback for 8 seconds:
  - If I have at least 3 check-ins in the same drinks bucket as last night, show a fact from my own data. Buckets by the night's total std: under 2, 2 to 3.9, 4 or more. Example: "After 4+ drinks, you felt Rough or Bad 4 of 5 mornings." Or: "After under 2 drinks, you usually feel Good."
  - Otherwise show one fallback line from `messages.js` (about 12 lines, plain and calm, no cheer, no guilt). Example: "Noted. A few more check-ins and patterns will show."

### History
- Bar chart of the last 12 weeks vs a target line. Plain inline SVG, no chart library.
- "On target: X of last 8 weeks." No streak counter.
- 4-week average std per week.
- "Mornings by drinks": for each bucket, the average feeling and the count of check-ins. Hide a bucket with fewer than 3 check-ins.
- Top drinks in the last 30 days by std (for example "Martini: 7.2 std").
- Entry list grouped by week, then by day, newest first. Group repeats ("Martini x3, 5.5"). Tap to edit or delete.

### Settings
- Weekly target (default 5, step 0.5), daily cap (default 2), week start (default Monday), rollover hour (default 4).
- Presets editor and the "sort by use" toggle.
- Export JSON, Export CSV (one row per drink), Import JSON (merge by id, confirm with counts).
- "Last backup: N days ago". If more than 30 days, show a gentle banner on the Week screen.
- About: standard drink definition and formula, and "Estimates only. Bar pours vary. Not medical advice."

## Data model
localStorage key `drinkTally.v1`:

    {
      "schema": 1,
      "settings": { "weeklyTarget": 5, "dailyCap": 2, "weekStart": "mon",
                    "rolloverHour": 4, "sortByUse": true, "lastBackup": null },
      "presets": [
        { "id": "martini", "name": "Martini", "type": "spirit",
          "components": [
            { "name": "Vodka or gin", "oz": 2.5, "abv": 40, "base": true },
            { "name": "Dry vermouth", "oz": 0.5, "abv": 18 }
          ],
          "chips": { "shots": [1, 2, 3] } }
      ],
      "entries": [
        { "id": "uuid", "ts": 1793998800000, "day": "2026-11-06",
          "presetId": "martini", "label": "Martini",
          "components": [ { "name": "Vodka or gin", "oz": 3, "abv": 40 },
                          { "name": "Dry vermouth", "oz": 0.5, "abv": 18 } ],
          "std": 2.15, "note": "" }
      ],
      "checkins": [
        { "day": "2026-11-06", "feel": 2, "sleep": 3, "note": "", "ts": 1794049200000 }
      ]
    }

- `day` is the drinking day: the local date after applying the rollover hour (or the chosen date for a backfill). All week, bucket and check-in math uses `day`, never `ts`. This avoids time zone and daylight-saving bugs.
- A check-in's `day` is the drinking day it is about (the night before), not the morning it was saved.
- Copy the resolved components and std onto each entry, so editing a preset later never changes history.
- Call `navigator.storage.persist()` on first run.
- Add a small migration function keyed on `schema`.

## iPhone web app details
- Manifest: name "Drink Tally", short_name "Tally", display "standalone", start_url "./", scope "./", theme and background colors, icons 192/512 plus maskable.
- In `<head>`: apple-touch-icon (180), apple-mobile-web-app-capable, mobile-web-app-capable, apple-mobile-web-app-status-bar-style, apple-mobile-web-app-title, viewport with `viewport-fit=cover`.
- Pad for safe areas with `env(safe-area-inset-*)`.
- Service worker: cache-first app shell with a versioned cache name. When a new version is ready, show "Update ready. Tap to reload."
- Light and dark mode via `prefers-color-scheme`. Dark mode matters: I log at night. System font stack. Tap targets at least 44 px. `touch-action: manipulation` on buttons. Do not block pinch zoom.
- First-run card (dismissible): "Add this page to your Home Screen, then log only from the icon. The home screen app and Safari keep separate data." Include the 3 steps (Share, Add to Home Screen, Add).

## Tests (`node --test`)
- Std math for every default preset, a 3 oz martini (2.15 at full precision, shown as 2.2), a 2-shot vodka soda (2.0), a 24 oz 8% seltzer (3.2), and a custom drink.
- Base pour stepper and shot chips change only the base component.
- Rollover: a drink at 01:30 on Sat 2026-11-07 counts toward Fri 2026-11-06; a drink at 04:00 counts toward Sat. Rollover hour set to 0 turns this off.
- Week bucketing with Monday start: Sunday 23:59 stays in that week; Monday 04:00 starts a new week; a Monday 01:00 drink belongs to the previous Sunday and the previous week.
- Daylight-saving weeks: week of Mon 2026-10-26 (DST ends Sun 2026-11-01) and week of Mon 2026-03-02 (DST starts Sun 2026-03-08).
- Year boundary: week of Mon 2026-12-28 to Sun 2027-01-03.
- Week start set to Sunday buckets correctly.
- Check-in rule: shows after a drinking day with no check-in; never after a dry day; not again after Skip; not before the rollover hour.
- Feedback: picks the right bucket; needs at least 3 check-ins in that bucket; otherwise returns a fallback line.
- Daily cap flag, "On target X of last 8 weeks" (weeks with no drinks count as on target), sort by use.
- Import merge dedupes by id and keeps the newer edit. CSV export escapes commas and quotes.

## Verify before done
1. `node --test` passes.
2. Serve locally (`python3 -m http.server`). If a headless browser is available, smoke test: no console errors, service worker registers, manifest is valid, 390 px layout, log a martini, adjust to 3 oz, reload and confirm it persists, check-in card logic with a faked date. If no headless browser is available, do static checks and tell me what you could not run.
3. Push the branch.
4. Final reply: what you built, test results, what you could not verify, and these steps for me: merge the PR; Settings > Pages > Deploy from a branch > main, / (root) > Save; open `https://<user>.github.io/drink-tally/` in Safari; Share > Add to Home Screen > Add.

## Out of scope for v1 (list in README as "Backlog")
Accounts, cloud sync, backend, push notifications, Apple Health, money or calorie stats, per-day drink plans, multiple users, barcode or photo logging.
