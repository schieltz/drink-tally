# Drink Tally

A private drink log for iPhone. Log drinks at night in one or two taps. It counts US standard drinks, not glasses, and shows your week against a target (default 5). The morning after a drinking day, it asks how you feel, and over time it shows how your mornings change with how much you drank.

No accounts. No server. Your data stays on your phone.

## Install on iPhone
1. Open https://schieltz.github.io/drink-tally/ in Safari.
2. Tap Share, then Add to Home Screen, then Add.
3. Log only from the home screen icon. The icon app and Safari keep separate data.

## How it counts
- 1 US standard drink = 14 g of pure alcohol = 0.6 fl oz (NIAAA).
- Each alcoholic ingredient: `oz x ABV / 0.6`. A drink is the sum. Mixers add nothing.
- Example: martini, 2.5 oz at 40% plus 0.5 oz vermouth at 18% = 1.8 std.
- Drinks logged after midnight and before 4 am count toward the night before (change in Settings).

## Using it
- Tap a drink to log it. The toast lets you Adjust or Undo.
- Press and hold a drink to set the pour, count and time first.
- Tap a day in the strip to see, edit, backfill, or add a check-in.
- Settings: target, daily cap, week start, night end, drink buttons, backup.

## Backup
Data lives in the browser storage of the home screen app. Export JSON from Settings now and then (the app reminds you after 30 days). Import merges by id and never deletes.

## Turn on GitHub Pages (one time)
Repo Settings > Pages > Build and deployment > Deploy from a branch > `main`, `/ (root)` > Save. The site appears at https://schieltz.github.io/drink-tally/ in about a minute.

## Develop
- `node --test` runs the logic tests. No installs.
- `python3 -m http.server 8000` serves the app locally.
- See `CLAUDE.md` for rules and `SPEC.md` for the full spec.

## Backlog
Not in v1: accounts, cloud sync, backend, push notifications, Apple Health, money or calorie stats, per-day drink plans, multiple users, barcode or photo logging.
