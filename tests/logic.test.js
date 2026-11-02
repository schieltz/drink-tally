// Run with: node --test
process.env.TZ = 'America/New_York';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../logic.js';
import { DEFAULT_PRESETS } from '../presets.js';
import { FALLBACK_LINES } from '../messages.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const preset = (id) => DEFAULT_PRESETS.find((p) => p.id === id);
let n = 0;
const entry = (day, std, extra = {}) => ({ id: `e${++n}`, day, std, ts: L.tsForDay(day, 20), label: 'Drink', ...extra });

// ---------- Std math ----------

test('std for every default preset', () => {
  const expected = {
    martini: 1.8, 'vodka-soda': 1.0, 'orange-crush': 1.8, cocktail: 1.3, 'hard-seltzer': 1.0,
    'canned-cocktail': 1.4, champagne: 1.0, wine: 1.1, beer: 1.0,
  };
  for (const p of DEFAULT_PRESETS) assert.equal(L.round1(L.drinkStd(p.components)), expected[p.id], p.id);
  assert.equal(Object.keys(expected).length, DEFAULT_PRESETS.length);
});

test('3 oz martini is 2.15 and shows as 2.2', () => {
  const c = L.withBaseOz(preset('martini').components, 3);
  near(L.drinkStd(c), 2.15);
  assert.equal(L.fmt1(L.drinkStd(c)), '2.2');
});

test('2-shot vodka soda, 24 oz 8% seltzer, custom drink', () => {
  near(L.drinkStd(L.withShots(preset('vodka-soda').components, 2)), 2.0);
  near(L.drinkStd(L.withComponent(preset('hard-seltzer').components, 0, { oz: 24, abv: 8 })), 3.2);
  const negroni = [
    { name: 'Gin', oz: 1, abv: 40 },
    { name: 'Campari', oz: 1, abv: 24 },
    { name: 'Sweet vermouth', oz: 1, abv: 16 },
  ];
  near(L.drinkStd(negroni), 0.4 / 0.6 + 0.24 / 0.6 + 0.16 / 0.6);
  assert.equal(L.fmt1(L.drinkStd(negroni)), '1.3');
});

test('rounding is half up and safe from float error', () => {
  assert.equal(L.fmt1(2.15), '2.2');
  assert.equal(L.fmt1(2.149), '2.1');
  assert.equal(L.fmt1(3 * 0.4 / 0.6 + 0.5 * 0.18 / 0.6), '2.2', 'float sum that lands just under 2.15');
  assert.equal(L.fmt1(1.05), '1.1');
  assert.equal(L.fmt1(0), '0.0');
});

test('pour stepper and shot chips change only the base component', () => {
  const base = preset('martini').components;
  const stepped = L.stepBase(base, 0.5);
  assert.equal(stepped[0].oz, 3);
  assert.deepEqual(stepped[1], base[1]);
  const shots = L.withShots(preset('orange-crush').components, 3);
  assert.equal(shots[0].oz, 4.5);
  assert.deepEqual(shots[1], preset('orange-crush').components[1]);
  assert.equal(base[0].oz, 2.5, 'original not mutated');
  assert.equal(L.stepBase([{ name: 'x', oz: 0.5, abv: 40, base: true }], -0.5)[0].oz, 0.5, 'min 0.5');
});

// ---------- Rollover and weeks ----------

test('rollover: 01:30 Saturday counts toward Friday; 04:00 counts toward Saturday', () => {
  assert.equal(L.drinkingDay(new Date(2026, 10, 7, 1, 30), 4), '2026-11-06');
  assert.equal(L.drinkingDay(new Date(2026, 10, 7, 4, 0), 4), '2026-11-07');
  assert.equal(L.drinkingDay(new Date(2026, 10, 7, 3, 59), 4), '2026-11-06');
  assert.equal(L.drinkingDay(new Date(2026, 10, 7, 1, 30), 0), '2026-11-07', 'rollover 0 turns it off');
});

test('week bucketing with Monday start', () => {
  const sun = L.drinkingDay(new Date(2026, 10, 8, 23, 59), 4);
  assert.equal(sun, '2026-11-08');
  assert.equal(L.weekStartOf(sun, 'mon'), '2026-11-02');
  const mon4 = L.drinkingDay(new Date(2026, 10, 9, 4, 0), 4);
  assert.equal(L.weekStartOf(mon4, 'mon'), '2026-11-09');
  const mon1 = L.drinkingDay(new Date(2026, 10, 9, 1, 0), 4);
  assert.equal(mon1, '2026-11-08', 'Monday 01:00 belongs to Sunday');
  assert.equal(L.weekStartOf(mon1, 'mon'), '2026-11-02', 'and to the previous week');
});

test('DST end week (Mon 2026-10-26 to Sun 2026-11-01)', () => {
  const days = L.weekDays('2026-10-26');
  assert.deepEqual(days, ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
  assert.equal(L.weekStartOf(L.drinkingDay(new Date(2026, 10, 1, 23, 59), 4), 'mon'), '2026-10-26');
  assert.equal(L.drinkingDay(new Date(2026, 10, 1, 1, 30), 4), '2026-10-31', 'repeated 1:30 am still rolls back');
  assert.equal(L.weekStartOf(L.drinkingDay(new Date(2026, 10, 2, 4, 0), 4), 'mon'), '2026-11-02');
  const es = [entry('2026-10-26', 1), entry('2026-11-01', 2), entry('2026-11-02', 4)];
  near(L.weekTotal(es, '2026-10-26'), 3);
});

test('DST start week (Mon 2026-03-02 to Sun 2026-03-08)', () => {
  assert.equal(L.weekDays('2026-03-02')[6], '2026-03-08');
  assert.equal(L.drinkingDay(new Date(2026, 2, 8, 3, 30), 4), '2026-03-07');
  assert.equal(L.drinkingDay(new Date(2026, 2, 8, 4, 0), 4), '2026-03-08');
  assert.equal(L.weekStartOf('2026-03-08', 'mon'), '2026-03-02');
  assert.equal(L.weekStartOf('2026-03-09', 'mon'), '2026-03-09');
});

test('year boundary week (Mon 2026-12-28 to Sun 2027-01-03)', () => {
  assert.deepEqual(L.weekDays('2026-12-28').slice(3), ['2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
  assert.equal(L.weekStartOf('2027-01-03', 'mon'), '2026-12-28');
  assert.equal(L.drinkingDay(new Date(2027, 0, 1, 0, 30), 4), '2026-12-31');
});

test('week start set to Sunday', () => {
  assert.equal(L.weekStartOf('2026-11-08', 'sun'), '2026-11-08');
  assert.equal(L.weekStartOf('2026-11-07', 'sun'), '2026-11-01');
  assert.equal(L.weekStartOf('2026-11-02', 'sun'), '2026-11-01');
});

// ---------- Check-in ----------

test('check-in shows after a drinking day with no check-in', () => {
  const es = [entry('2026-11-06', 2)];
  assert.equal(L.checkinDue(es, [], new Date(2026, 10, 7, 8, 0), 4), '2026-11-06');
});

test('check-in never shows after a dry day', () => {
  const es = [entry('2026-11-05', 2)];
  assert.equal(L.checkinDue(es, [], new Date(2026, 10, 7, 8, 0), 4), null);
});

test('check-in does not show again after Skip or Save', () => {
  const es = [entry('2026-11-06', 2)];
  const skipped = L.upsertCheckin([], { day: '2026-11-06', feel: null, skipped: true, ts: 1 });
  assert.equal(L.checkinDue(es, skipped, new Date(2026, 10, 7, 8, 0), 4), null);
  const saved = L.upsertCheckin([], { day: '2026-11-06', feel: 3, ts: 1 });
  assert.equal(L.checkinDue(es, saved, new Date(2026, 10, 7, 8, 0), 4), null);
});

test('check-in does not show before the rollover hour', () => {
  const es = [entry('2026-11-06', 2)];
  assert.equal(L.checkinDue(es, [], new Date(2026, 10, 7, 2, 0), 4), null);
  assert.equal(L.checkinDue(es, [], new Date(2026, 10, 7, 4, 0), 4), '2026-11-06');
});

// ---------- Feedback ----------

test('buckets', () => {
  assert.equal(L.bucketOf(1.9), 'low');
  assert.equal(L.bucketOf(1.96), 'mid', 'uses the shown value');
  assert.equal(L.bucketOf(3.9), 'mid');
  assert.equal(L.bucketOf(4), 'high');
});

test('feedback uses own data once a bucket has 3 check-ins', () => {
  const es = [entry('2026-11-01', 4.5), entry('2026-11-02', 5), entry('2026-11-03', 4.2), entry('2026-11-04', 1)];
  let cs = [];
  cs = L.upsertCheckin(cs, { day: '2026-11-01', feel: 2, ts: 1 });
  cs = L.upsertCheckin(cs, { day: '2026-11-02', feel: 1, ts: 1 });
  cs = L.upsertCheckin(cs, { day: '2026-11-03', feel: 4, ts: 1 });
  cs = L.upsertCheckin(cs, { day: '2026-11-04', feel: 5, ts: 1 });
  const fb = L.feedbackLine(es, cs, '2026-11-03', FALLBACK_LINES);
  assert.equal(fb.kind, 'data');
  assert.equal(fb.text, 'After 4+ drinks, you felt Rough or Bad 2 of 3 mornings.');
  const low = L.feedbackLine(es, cs, '2026-11-04', FALLBACK_LINES, () => 0);
  assert.equal(low.kind, 'fallback', 'only 1 check-in in the low bucket');
  assert.equal(low.text, FALLBACK_LINES[0]);
});

test('feedback good-mornings line and skipped check-ins are ignored', () => {
  const es = [entry('2026-11-01', 1), entry('2026-11-02', 1.5), entry('2026-11-03', 0.8), entry('2026-11-04', 1)];
  let cs = [];
  for (const d of ['2026-11-01', '2026-11-02', '2026-11-03']) cs = L.upsertCheckin(cs, { day: d, feel: 4, ts: 1 });
  cs = L.upsertCheckin(cs, { day: '2026-11-04', feel: null, skipped: true, ts: 1 });
  const fb = L.feedbackLine(es, cs, '2026-11-03', FALLBACK_LINES);
  assert.equal(fb.text, 'After under 2 drinks, you felt Good or Great 3 of 3 mornings.');
  const m = L.morningsByBucket(es, cs);
  assert.equal(m.length, 1);
  assert.equal(m[0].count, 3);
  assert.equal(m[0].avgLabel, 'Good');
});

// ---------- Week stats ----------

test('daily cap flag', () => {
  assert.equal(L.overCap(2, 2), false);
  assert.equal(L.overCap(2.15, 2), true);
});

test('ring state', () => {
  assert.equal(L.ringState(3.9, 5), 'ok');
  assert.equal(L.ringState(4, 5), 'near');
  assert.equal(L.ringState(5, 5), 'near');
  assert.equal(L.ringState(5.1, 5), 'over');
});

test('on target X of last 8 weeks; weeks with no drinks count as on target', () => {
  const cur = '2026-11-02';
  const es = [
    entry('2026-10-26', 6), // over
    entry('2026-10-19', 3), // on
    // 2026-10-12 empty: on
    entry('2026-10-05', 5), // exactly at target: on
  ];
  assert.deepEqual(L.weeksOnTarget(es, cur, 5, 'mon', 8), { on: 3, total: 4 }, 'stops at the week of the first entry');
  es.push(entry('2026-08-03', 1));
  assert.deepEqual(L.weeksOnTarget(es, cur, 5, 'mon', 8), { on: 7, total: 8 });
  assert.equal(L.weeksOnTarget([], cur, 5).total, 0);
});

test('average per week and weekly series', () => {
  const es = [entry('2026-10-26', 6), entry('2026-10-19', 2)];
  near(L.averagePerWeek(es, '2026-11-02', 'mon', 4).avg, 4);
  const s = L.weeklySeries(es, '2026-11-02', 12);
  assert.equal(s.length, 12);
  assert.equal(s[11].start, '2026-11-02');
  near(s[10].total, 6);
});

test('sort presets by use in the last 60 days, ties keep default order', () => {
  const es = [
    entry('2026-11-01', 1, { presetId: 'vodka-soda' }),
    entry('2026-11-01', 1, { presetId: 'vodka-soda' }),
    entry('2026-10-30', 1, { presetId: 'champagne' }),
    entry('2026-08-01', 1, { presetId: 'beer' }), // older than 60 days
  ];
  const ids = L.sortPresets(DEFAULT_PRESETS, es, '2026-11-02', true).map((p) => p.id);
  assert.deepEqual(ids.slice(0, 4), ['vodka-soda', 'champagne', 'martini', 'orange-crush']);
  assert.deepEqual(L.sortPresets(DEFAULT_PRESETS, es, '2026-11-02', false).map((p) => p.id), DEFAULT_PRESETS.map((p) => p.id));
});

test('group repeats and top drinks', () => {
  const es = [
    entry('2026-11-06', 1.8, { label: 'Martini' }),
    entry('2026-11-06', 1.8, { label: 'Martini' }),
    entry('2026-11-06', 1.0, { label: 'Vodka soda' }),
  ];
  assert.equal(L.groupsText(L.groupRepeats(es)), 'Martini x2, Vodka soda');
  const top = L.topDrinks(es, '2026-11-07', 30);
  assert.equal(top[0].label, 'Martini');
  near(top[0].std, 3.6);
});

// ---------- Import and CSV ----------

test('import merge dedupes by id and keeps the newer edit', () => {
  const base = L.defaultData(DEFAULT_PRESETS);
  base.entries = [
    { id: 'a', day: '2026-11-01', std: 1, ts: 100, updated: 100, label: 'A' },
    { id: 'b', day: '2026-11-02', std: 1, ts: 200, updated: 500, label: 'B new' },
  ];
  const incoming = {
    entries: [
      { id: 'a', day: '2026-11-01', std: 2, ts: 100, updated: 300, label: 'A edited' },
      { id: 'b', day: '2026-11-02', std: 1, ts: 200, updated: 200, label: 'B old' },
      { id: 'c', day: '2026-11-03', std: 1, ts: 300, label: 'C' },
    ],
    checkins: [{ day: '2026-11-01', feel: 3, ts: 1 }],
    presets: [{ id: 'negroni', name: 'Negroni', type: 'spirit', components: [] }],
  };
  const { data, counts } = L.mergeData(base, incoming, DEFAULT_PRESETS);
  assert.deepEqual(counts.entries, { added: 1, updated: 1, same: 1 });
  assert.equal(counts.checkins.added, 1);
  assert.equal(counts.presets.added, 1);
  assert.equal(data.entries.length, 3);
  assert.equal(data.entries.find((e) => e.id === 'a').label, 'A edited');
  assert.equal(data.entries.find((e) => e.id === 'b').label, 'B new');
});

test('CSV export escapes commas and quotes', () => {
  const csv = L.toCSV([
    {
      id: 'x', day: '2026-11-06', ts: new Date(2026, 10, 6, 21, 5).getTime(), label: 'Martini', std: 2.15,
      components: [{ name: 'Gin', oz: 3, abv: 40 }], note: 'Big pour, "very" dry',
    },
  ]);
  const lines = csv.trim().split('\r\n');
  assert.equal(lines[0], 'day,time,drink,std,components,note');
  assert.equal(lines[1], '2026-11-06,21:05,Martini,2.15,Gin 3 oz 40%,"Big pour, ""very"" dry"');
});

test('migrate fills defaults and keeps data', () => {
  const d = L.migrate({ entries: [{ id: 'a', day: '2026-11-01', components: [{ oz: 1.5, abv: 40 }] }] }, DEFAULT_PRESETS);
  assert.equal(d.schema, 1);
  assert.equal(d.settings.weeklyTarget, 5);
  assert.equal(d.settings.rolloverHour, 4);
  assert.equal(d.presets.length, DEFAULT_PRESETS.length);
  near(d.entries[0].std, 1);
  assert.deepEqual(L.migrate(null, DEFAULT_PRESETS).entries, []);
});

test('makeEntry copies components so preset edits never change history', () => {
  const p = JSON.parse(JSON.stringify(preset('martini')));
  const e = L.makeEntry({ id: 'x', preset: p, components: p.components, day: '2026-11-06', ts: 1, now: 1 });
  p.components[0].oz = 5;
  assert.equal(e.components[0].oz, 2.5);
  assert.equal(e.label, 'Martini');
  assert.equal(e.presetId, 'martini');
});
