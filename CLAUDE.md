# Drink Tally

Personal drink log. iPhone home screen web app on GitHub Pages. Read `SPEC.md` before changing behavior.

## Commands
- Test: `node --test` (no installs)
- Serve locally: `python3 -m http.server 8000`, then open http://localhost:8000/

## Hard rules
- Vanilla HTML, CSS and JavaScript (ES modules). No framework. No build step. No runtime dependencies.
- Never commit user data, sample personal data, or secrets.
- Keep pure logic (drink math, dates, check-in rules, feedback, import/merge, CSV) in `logic.js` with no DOM access, so Node can test it.
- Tests run with `node --test` and no installs.
- Works offline after the first load.
- Copy tone: neutral, calm, short, no shaming, no exclamation marks, no emojis. No streaks, badges or points.

## Conventions
- All day math uses the `day` string (YYYY-MM-DD drinking day), never `ts`. Date arithmetic goes through `addDays` (UTC), so DST never matters.
- Std values are always computed from oz and ABV. Never hard-code them.
- Entries copy their components and std, so preset edits never change history.
- Every asset path is relative (`./`). The site lives at `/drink-tally/`.
- On every release: bump `CACHE` in `sw.js` and `VERSION` in `app.js` together. Add any new file to `ASSETS` in `sw.js`.
