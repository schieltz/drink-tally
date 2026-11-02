// Pure logic for Drink Tally. No DOM access. Tested with `node --test`.

export const STD_ETHANOL_OZ = 0.6; // 1 US standard drink = 14 g = 0.6 fl oz ethanol (NIAAA)
export const SHOT_OZ = 1.5;
export const SCHEMA = 1;

export const FEEL = { 5: 'Great', 4: 'Good', 3: 'OK', 2: 'Rough', 1: 'Bad' };
export const SLEEP = { 3: 'Good', 2: 'OK', 1: 'Poor' };

export const BUCKETS = [
  { id: 'low', label: 'under 2' },
  { id: 'mid', label: '2 to 3.9' },
  { id: 'high', label: '4+' },
];

export const DEFAULT_SETTINGS = {
  weeklyTarget: 5,
  dailyCap: 2,
  weekStart: 'mon',
  rolloverHour: 4,
  sortByUse: true,
  lastBackup: null,
  installDismissed: false,
};

const EPS = 1e-9;

// ---------- Drink math ----------

export function componentStd(oz, abv) {
  const o = Number(oz) || 0;
  const a = Number(abv) || 0;
  return (o * (a / 100)) / STD_ETHANOL_OZ;
}

export function drinkStd(components) {
  return (components || []).reduce((sum, c) => sum + componentStd(c.oz, c.abv), 0);
}

// Round half up to 1 decimal, guarding against float error (2.1499999 -> 2.2).
export function round1(x) {
  const n = Number(x) || 0;
  const sign = n < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(n) * 10 + 1e-9)) / 10;
}

export function fmt1(x) {
  return round1(x).toFixed(1);
}

// Short number: 3 -> "3", 2.5 -> "2.5", 2.75 -> "2.75"
export function fmtNum(x) {
  return String(Math.round((Number(x) || 0) * 100) / 100);
}

export function baseIndex(components) {
  const i = (components || []).findIndex((c) => c.base);
  return i >= 0 ? i : 0;
}

export function cloneComponents(components) {
  return (components || []).map((c) => ({ ...c }));
}

export function withBaseOz(components, oz) {
  const bi = baseIndex(components);
  return cloneComponents(components).map((c, i) => (i === bi ? { ...c, oz: Math.max(0, Number(oz) || 0) } : c));
}

export function stepBase(components, delta, min = 0.5, max = 10) {
  const bi = baseIndex(components);
  const cur = Number(components[bi]?.oz) || 0;
  const next = Math.min(max, Math.max(min, Math.round((cur + delta) * 100) / 100));
  return withBaseOz(components, next);
}

export function withShots(components, shots) {
  return withBaseOz(components, shots * SHOT_OZ);
}

export function withComponent(components, index, patch) {
  return cloneComponents(components).map((c, i) => (i === index ? { ...c, ...patch } : c));
}

export function shotsOf(oz) {
  return (Number(oz) || 0) / SHOT_OZ;
}

export function cleanComponents(components) {
  return (components || [])
    .map((c) => {
      const out = { name: String(c.name || 'Drink').slice(0, 40), oz: Number(c.oz) || 0, abv: Number(c.abv) || 0 };
      if (c.base) out.base = true;
      return out;
    })
    .filter((c) => c.oz > 0);
}

export function makeEntry({ id, preset, label, components, day, ts, note = '', now }) {
  const comps = cleanComponents(components);
  return {
    id,
    ts,
    day,
    presetId: preset ? preset.id : null,
    label: label || (preset ? preset.name : 'Custom'),
    components: comps,
    std: drinkStd(comps),
    note: String(note || '').slice(0, 200),
    updated: now ?? ts,
  };
}

// ---------- Dates (all day math on YYYY-MM-DD strings, via UTC, so DST never matters) ----------

const pad = (n) => String(n).padStart(2, '0');

export function dayFromParts(y, m, d) {
  const t = new Date(Date.UTC(y, m - 1, d));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function parseDay(day) {
  const [y, m, d] = String(day).split('-').map(Number);
  return { y, m, d };
}

export function addDays(day, n) {
  const { y, m, d } = parseDay(day);
  return dayFromParts(y, m, d + n);
}

export function weekdayOf(day) {
  const { y, m, d } = parseDay(day);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
}

export function diffDays(a, b) {
  const pa = parseDay(a);
  const pb = parseDay(b);
  return Math.round((Date.UTC(pa.y, pa.m - 1, pa.d) - Date.UTC(pb.y, pb.m - 1, pb.d)) / 86400000);
}

export function localDay(date) {
  const dt = date instanceof Date ? date : new Date(date);
  return dayFromParts(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

// The drinking day: a drink before the rollover hour counts toward the night before.
export function drinkingDay(date, rolloverHour = 4) {
  const dt = date instanceof Date ? date : new Date(date);
  const day = localDay(dt);
  return dt.getHours() < (Number(rolloverHour) || 0) ? addDays(day, -1) : day;
}

export function weekStartOf(day, weekStart = 'mon') {
  const dow = weekdayOf(day);
  const offset = weekStart === 'sun' ? dow : (dow + 6) % 7;
  return addDays(day, -offset);
}

export function weekDays(start) {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

// Local timestamp for a day at a given hour (used for backfills).
export function tsForDay(day, hour = 20) {
  const { y, m, d } = parseDay(day);
  return new Date(y, m - 1, d, hour, 0, 0, 0).getTime();
}

// ---------- Totals ----------

export function sumStd(entries) {
  return (entries || []).reduce((s, e) => s + (Number(e.std) || 0), 0);
}

export function entriesOnDay(entries, day) {
  return (entries || []).filter((e) => e.day === day).sort((a, b) => a.ts - b.ts);
}

export function dayTotals(entries) {
  const out = {};
  for (const e of entries || []) out[e.day] = (out[e.day] || 0) + (Number(e.std) || 0);
  return out;
}

export function weekTotal(entries, start) {
  const end = addDays(start, 6);
  return sumStd((entries || []).filter((e) => e.day >= start && e.day <= end));
}

export function ringState(total, target) {
  if (!(target > 0)) return total > EPS ? 'over' : 'ok';
  const r = total / target;
  if (r > 1 + EPS) return 'over';
  if (r >= 0.8 - EPS) return 'near';
  return 'ok';
}

export function overCap(dayTotal, cap) {
  return dayTotal > cap + EPS;
}

export function weeklySeries(entries, currentStart, n = 12) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const start = addDays(currentStart, -7 * i);
    out.push({ start, total: weekTotal(entries, start) });
  }
  return out;
}

export function firstDay(entries) {
  let first = null;
  for (const e of entries || []) if (!first || e.day < first) first = e.day;
  return first;
}

// Completed weeks before the current one, newest first, never before the week of the first entry.
export function completedWeeks(entries, currentStart, weekStart = 'mon', n = 8) {
  const first = firstDay(entries);
  if (!first) return [];
  const firstStart = weekStartOf(first, weekStart);
  const out = [];
  for (let i = 1; i <= n; i++) {
    const start = addDays(currentStart, -7 * i);
    if (start < firstStart) break;
    out.push({ start, total: weekTotal(entries, start) });
  }
  return out;
}

export function weeksOnTarget(entries, currentStart, target, weekStart = 'mon', n = 8) {
  const weeks = completedWeeks(entries, currentStart, weekStart, n);
  return { on: weeks.filter((w) => w.total <= target + EPS).length, total: weeks.length };
}

export function averagePerWeek(entries, currentStart, weekStart = 'mon', n = 4) {
  const weeks = completedWeeks(entries, currentStart, weekStart, n);
  if (!weeks.length) return null;
  return { avg: weeks.reduce((s, w) => s + w.total, 0) / weeks.length, weeks: weeks.length };
}

export function topDrinks(entries, today, days = 30, limit = 5) {
  const from = addDays(today, -(days - 1));
  const map = new Map();
  for (const e of entries || []) {
    if (e.day < from || e.day > today) continue;
    const key = e.label || 'Drink';
    const v = map.get(key) || { label: key, std: 0, count: 0 };
    v.std += Number(e.std) || 0;
    v.count += 1;
    map.set(key, v);
  }
  return [...map.values()].sort((a, b) => b.std - a.std).slice(0, limit);
}

export function sortPresets(presets, entries, today, enabled = true, days = 60) {
  if (!enabled) return (presets || []).slice();
  const from = addDays(today, -(days - 1));
  const counts = {};
  for (const e of entries || []) {
    if (e.presetId && e.day >= from && e.day <= today) counts[e.presetId] = (counts[e.presetId] || 0) + 1;
  }
  return (presets || [])
    .map((p, i) => ({ p, i, c: counts[p.id] || 0 }))
    .sort((a, b) => b.c - a.c || a.i - b.i)
    .map((x) => x.p);
}

// Group same drink + same size: "Martini x3".
export function groupRepeats(entries) {
  const groups = [];
  for (const e of entries || []) {
    const key = `${e.label}|${round1(e.std)}`;
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, label: e.label, count: 0, std: 0, ids: [] };
      groups.push(g);
    }
    g.count += 1;
    g.std += Number(e.std) || 0;
    g.ids.push(e.id);
  }
  return groups;
}

export function groupsText(groups) {
  return groups.map((g) => (g.count > 1 ? `${g.label} x${g.count}` : g.label)).join(', ');
}

// ---------- Morning check-in ----------

export function bucketOf(total) {
  const t = round1(total);
  if (t < 2) return 'low';
  if (t < 4) return 'mid';
  return 'high';
}

export function bucketLabel(id) {
  return (BUCKETS.find((b) => b.id === id) || BUCKETS[0]).label;
}

export function checkinFor(checkins, day) {
  return (checkins || []).find((c) => c.day === day) || null;
}

// Returns the drinking day to ask about, or null.
export function checkinDue(entries, checkins, now, rolloverHour = 4) {
  const today = drinkingDay(now, rolloverHour);
  const prev = addDays(today, -1);
  if (!(entries || []).some((e) => e.day === prev)) return null;
  if (checkinFor(checkins, prev)) return null; // answered or skipped
  return prev;
}

export function upsertCheckin(checkins, record) {
  const rest = (checkins || []).filter((c) => c.day !== record.day);
  return [...rest, record].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

export function bucketFeels(entries, checkins) {
  const totals = dayTotals(entries);
  const out = { low: [], mid: [], high: [] };
  for (const c of checkins || []) {
    if (c.feel == null) continue;
    const total = totals[c.day] || 0;
    if (total <= EPS) continue; // dry days are not "after N drinks"
    out[bucketOf(total)].push(Number(c.feel));
  }
  return out;
}

export function morningsByBucket(entries, checkins, min = 3) {
  const feels = bucketFeels(entries, checkins);
  return BUCKETS.map((b) => {
    const list = feels[b.id];
    const avg = list.length ? list.reduce((s, f) => s + f, 0) / list.length : null;
    return { id: b.id, label: b.label, count: list.length, avg, avgLabel: avg == null ? '' : FEEL[Math.round(avg)] };
  }).filter((b) => b.count >= min);
}

export function feedbackLine(entries, checkins, day, fallbacks, pick = Math.random) {
  const total = dayTotals(entries)[day] || 0;
  const b = bucketOf(total);
  const feels = bucketFeels(entries, checkins)[b];
  const label = bucketLabel(b);
  if (total > EPS && feels.length >= 3) {
    const n = feels.length;
    const rough = feels.filter((f) => f <= 2).length;
    const good = feels.filter((f) => f >= 4).length;
    if (rough * 2 >= n) return { kind: 'data', text: `After ${label} drinks, you felt Rough or Bad ${rough} of ${n} mornings.` };
    if (good * 2 >= n) return { kind: 'data', text: `After ${label} drinks, you felt Good or Great ${good} of ${n} mornings.` };
    const avg = feels.reduce((s, f) => s + f, 0) / n;
    return { kind: 'data', text: `After ${label} drinks, your mornings average ${FEEL[Math.round(avg)]}.` };
  }
  const list = fallbacks && fallbacks.length ? fallbacks : ['Noted.'];
  const i = Math.min(list.length - 1, Math.max(0, Math.floor(pick() * list.length)));
  return { kind: 'fallback', text: list[i] };
}

// ---------- Backup ----------

export function daysSince(fromTs, nowTs) {
  return Math.floor((nowTs - fromTs) / 86400000);
}

export function backupDue(data, nowTs, maxDays = 30) {
  if (!data.entries || !data.entries.length) return false;
  const last = data.settings && data.settings.lastBackup;
  const ref = last || Math.min(...data.entries.map((e) => e.ts || nowTs));
  return daysSince(ref, nowTs) > maxDays;
}

export function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function hhmm(ts) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function toCSV(entries) {
  const head = ['day', 'time', 'drink', 'std', 'components', 'note'];
  const rows = (entries || [])
    .slice()
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.ts - b.ts))
    .map((e) => [
      e.day,
      hhmm(e.ts),
      e.label,
      (Number(e.std) || 0).toFixed(2),
      (e.components || []).map((c) => `${c.name} ${c.oz} oz ${c.abv}%`).join('; '),
      e.note || '',
    ]);
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

// ---------- Storage shape ----------

export function defaultData(presets) {
  return {
    schema: SCHEMA,
    settings: { ...DEFAULT_SETTINGS },
    presets: JSON.parse(JSON.stringify(presets || [])),
    entries: [],
    checkins: [],
  };
}

export function migrate(raw, presets) {
  if (!raw || typeof raw !== 'object') return defaultData(presets);
  const d = { ...raw };
  if (!d.schema) d.schema = 1;
  // Future: if (d.schema === 1) { ...change shape...; d.schema = 2; }
  d.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
  d.presets = Array.isArray(d.presets) ? d.presets : JSON.parse(JSON.stringify(presets || []));
  d.entries = (Array.isArray(d.entries) ? d.entries : []).filter((e) => e && e.id && typeof e.day === 'string');
  for (const e of d.entries) {
    if (typeof e.std !== 'number') e.std = drinkStd(e.components);
    if (!e.ts) e.ts = tsForDay(e.day);
  }
  d.checkins = (Array.isArray(d.checkins) ? d.checkins : []).filter((c) => c && typeof c.day === 'string');
  return d;
}

const stamp = (x) => Number(x.updated || x.ts || 0);

export function mergeData(current, incomingRaw, presets) {
  const incoming = migrate(incomingRaw, presets);
  const counts = {
    entries: { added: 0, updated: 0, same: 0 },
    checkins: { added: 0, updated: 0, same: 0 },
    presets: { added: 0 },
  };
  const byId = new Map(current.entries.map((e) => [e.id, e]));
  for (const e of incoming.entries) {
    const cur = byId.get(e.id);
    if (!cur) {
      byId.set(e.id, e);
      counts.entries.added++;
    } else if (stamp(e) > stamp(cur)) {
      byId.set(e.id, e);
      counts.entries.updated++;
    } else counts.entries.same++;
  }
  const byDay = new Map(current.checkins.map((c) => [c.day, c]));
  for (const c of incoming.checkins) {
    const cur = byDay.get(c.day);
    if (!cur) {
      byDay.set(c.day, c);
      counts.checkins.added++;
    } else if (stamp(c) > stamp(cur)) {
      byDay.set(c.day, c);
      counts.checkins.updated++;
    } else counts.checkins.same++;
  }
  const presetIds = new Set(current.presets.map((p) => p.id));
  const mergedPresets = current.presets.slice();
  for (const p of incoming.presets) {
    if (p && p.id && !presetIds.has(p.id)) {
      mergedPresets.push(p);
      presetIds.add(p.id);
      counts.presets.added++;
    }
  }
  return {
    data: {
      ...current,
      presets: mergedPresets,
      entries: [...byId.values()].sort((a, b) => a.ts - b.ts),
      checkins: [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : 1)),
    },
    counts,
  };
}

export function parseNumberList(text) {
  return String(text || '')
    .split(/[,\s]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);
}
