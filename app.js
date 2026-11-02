// Drink Tally UI. All math lives in logic.js.
import * as L from './logic.js';
import { DEFAULT_PRESETS } from './presets.js';
import { FALLBACK_LINES } from './messages.js';
import { load, save, requestPersist } from './store.js';

const VERSION = '1.0.0'; // keep in step with CACHE in sw.js

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const uid = () =>
  globalThis.crypto && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const loaded = load();
let data = loaded.data;
if (loaded.firstRun) {
  save(data);
  requestPersist();
}

const ui = { tab: 'week', sheet: null, toast: null, ci: null, histWeeks: 8, update: null, updating: false };

const S = () => data.settings;
const today = () => L.drinkingDay(new Date(), S().rolloverHour);
const f1 = L.fmt1;
const num = L.fmtNum;
const presetById = (id) => data.presets.find((p) => p.id === id) || null;

function commit() {
  if (!save(data)) showToast({ text: 'Could not save. Storage may be full.', ms: 5000 });
}

// ---------- Formatting ----------

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function dayLabel(day) {
  const { m, d } = L.parseDay(day);
  return `${DOW[L.weekdayOf(day)]}, ${MON[m - 1]} ${d}`;
}
function shortDay(day) {
  const { m, d } = L.parseDay(day);
  return `${MON[m - 1]} ${d}`;
}
function timeLabel(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
function plural(n, word) {
  const r = L.round1(n);
  return `${r} ${word}${r === 1 ? '' : 's'}`;
}
function ago(ts) {
  const n = L.daysSince(ts, Date.now());
  return n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`;
}
function toLocalInput(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function isStandalone() {
  return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

// ---------- Render ----------

function render() {
  const main = $('#main');
  main.innerHTML = ui.tab === 'history' ? renderHistory() : ui.tab === 'settings' ? renderSettings() : renderWeek();
  document.querySelectorAll('.tab').forEach((b) => {
    if (b.dataset.tab === ui.tab) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  renderSheet();
  renderUpdate();
}

// Week

function renderWeek() {
  const t = today();
  const start = L.weekStartOf(t, S().weekStart);
  const days = L.weekDays(start);
  const totals = L.dayTotals(data.entries);
  const total = days.reduce((s, d) => s + (totals[d] || 0), 0);
  const target = Number(S().weeklyTarget) || 0;
  const state = L.ringState(total, target);
  const left = L.round1(target - total);
  const leftText = left > 0 ? `Left this week: ${f1(left)}` : left === 0 ? 'At target this week' : `Over by ${f1(-left)}`;
  const maxDay = Math.max(S().dailyCap * 1.5, 3, ...days.map((d) => totals[d] || 0));
  return `
    <header class="top"><div><h1>This week</h1><p class="sub">${shortDay(start)} to ${shortDay(days[6])}</p></div></header>
    ${renderCheckinCard()}
    ${renderBanners()}
    <section class="ring-wrap">${ringSvg(total, target, state)}<p class="ring-note">${leftText}</p></section>
    <section class="strip" aria-label="Days this week">${days.map((d) => dayCell(d, totals[d] || 0, t, maxDay)).join('')}</section>
    <section class="grid" aria-label="Log a drink">${presetButtons(t)}</section>`;
}

function ringSvg(total, target, state) {
  const R = 80;
  const C = 2 * Math.PI * R;
  const frac = target > 0 ? Math.min(total / target, 1) : total > 0 ? 1 : 0;
  const arc =
    frac > 0
      ? `<circle class="ring-fill" cx="100" cy="100" r="${R}" stroke-dasharray="${(frac * C).toFixed(2)} ${C.toFixed(2)}" transform="rotate(-90 100 100)"/>`
      : '';
  return `<svg class="ring is-${state}" viewBox="0 0 200 200" role="img" aria-label="${f1(total)} of ${num(target)} standard drinks this week">
    <circle class="ring-track" cx="100" cy="100" r="${R}"/>${arc}
    <text class="ring-num" x="100" y="110">${f1(total)}</text>
    <text class="ring-sub" x="100" y="136">of ${num(target)} std</text></svg>`;
}

function dayCell(d, v, t, maxDay) {
  const h = v > 0 ? Math.max(6, Math.min(44, Math.round((v / maxDay) * 44))) : 3;
  const cls = ['day', d === t ? 'is-today' : '', d > t ? 'is-future' : ''].join(' ').trim();
  const dot = L.overCap(v, S().dailyCap) ? '<span class="cap-dot" aria-hidden="true"></span>' : '';
  return `<button class="${cls}" data-act="open-day" data-day="${d}" aria-label="${dayLabel(d)}, ${f1(v)} std">
    <span class="bar-box">${dot}<span class="bar${v > 0 ? ' has' : ''}" style="height:${h}px"></span></span>
    <span class="day-name">${DOW[L.weekdayOf(d)].slice(0, 1)}</span>
    <span class="day-val">${v > 0 ? f1(v) : ''}</span></button>`;
}

function presetButton(p, act) {
  const press = act === 'log' ? ' data-press="1"' : '';
  return `<button class="preset" data-act="${act}"${press} data-id="${esc(p.id)}"><span class="p-name">${esc(p.name)}</span><span class="p-std">${f1(L.drinkStd(p.components))} std</span></button>`;
}

function presetButtons(t) {
  const list = L.sortPresets(data.presets, data.entries, t, S().sortByUse);
  return (
    list.map((p) => presetButton(p, 'log')).join('') +
    `<button class="preset is-custom" data-act="custom"><span class="p-name">Custom</span><span class="p-std">Build a drink</span></button>` +
    `<p class="hint">Tap to log. Press and hold to set the pour first.</p>`
  );
}

function renderCheckinCard() {
  const due = L.checkinDue(data.entries, data.checkins, new Date(), S().rolloverHour);
  if (!due) {
    ui.ci = null;
    return '';
  }
  if (!ui.ci || ui.ci.day !== due) ui.ci = { day: due, feel: null, sleep: null, note: '' };
  const total = L.sumStd(L.entriesOnDay(data.entries, due));
  return `<section class="card checkin" aria-label="Morning check-in">${checkinBody(ui.ci, total, 'card')}</section>`;
}

function checkinBody(d, total, where) {
  const feel = [5, 4, 3, 2, 1]
    .map((v) => `<button class="chip ${d.feel === v ? 'on' : ''}" data-act="ci-feel" data-where="${where}" data-v="${v}">${L.FEEL[v]}</button>`)
    .join('');
  const sleep = [3, 2, 1]
    .map((v) => `<button class="chip ${d.sleep === v ? 'on' : ''}" data-act="ci-sleep" data-where="${where}" data-v="${v}">${L.SLEEP[v]}</button>`)
    .join('');
  const title = where === 'card' ? 'How do you feel this morning?' : 'How did you feel the morning after?';
  return `<h2>${title}</h2>
    <p class="sub">${dayLabel(d.day)}: ${f1(total)} std</p>
    <div class="chips five">${feel}</div>
    <p class="label">Sleep (optional)</p><div class="chips">${sleep}</div>
    <input class="input" type="text" placeholder="Note (optional)" maxlength="200" data-field="ci-note" data-where="${where}" value="${esc(d.note)}">
    <p class="err" id="ci-err-${where}" role="alert"></p>
    <div class="row-end">${where === 'card' ? '<button class="btn ghost" data-act="ci-skip">Skip</button>' : ''}<button class="btn primary" data-act="ci-save" data-where="${where}">Save</button></div>`;
}

function renderBanners() {
  let out = '';
  if (!isStandalone() && !S().installDismissed) {
    out += `<section class="card note"><h2>Add to your Home Screen</h2>
      <p>Then log only from the icon. The home screen app and Safari keep separate data.</p>
      <ol><li>Tap Share in Safari</li><li>Tap Add to Home Screen</li><li>Tap Add</li></ol>
      <div class="row-end"><button class="btn ghost" data-act="dismiss-install">Got it</button></div></section>`;
  }
  if (L.backupDue(data, Date.now())) {
    const msg = S().lastBackup ? `Last backup was ${ago(S().lastBackup)}.` : 'You have not backed up yet.';
    out += `<section class="card note"><p>${msg} Your log lives only on this phone.</p>
      <div class="row-end"><button class="btn" data-act="export-json">Back up now</button></div></section>`;
  }
  return out;
}

// History

function renderHistory() {
  const t = today();
  const ws = S().weekStart;
  const cur = L.weekStartOf(t, ws);
  const target = Number(S().weeklyTarget) || 0;
  const series = L.weeklySeries(data.entries, cur, 12);
  const ot = L.weeksOnTarget(data.entries, cur, target, ws, 8);
  const avg = L.averagePerWeek(data.entries, cur, ws, 4);
  const mornings = L.morningsByBucket(data.entries, data.checkins);
  const top = L.topDrinks(data.entries, t, 30);
  const weeksWord = (n) => `last ${n} full week${n === 1 ? '' : 's'}`;
  return `
    <header class="top"><div><h1>History</h1><p class="sub">Last 12 weeks vs your target of ${num(target)}</p></div></header>
    <section class="card">${chartSvg(series, target)}</section>
    <section class="stats">
      <div class="stat"><span class="stat-label">On target</span><span class="stat-val">${ot.total ? `${ot.on} of ${ot.total}` : 'n/a'}</span><span class="stat-foot">${ot.total ? weeksWord(ot.total) : 'after a full week'}</span></div>
      <div class="stat"><span class="stat-label">Weekly average</span><span class="stat-val">${avg ? f1(avg.avg) : 'n/a'}</span><span class="stat-foot">${avg ? weeksWord(avg.weeks) : 'after a full week'}</span></div>
    </section>
    <section class="card"><h2>Mornings by drinks</h2>${
      mornings.length
        ? `<ul class="rows">${mornings.map((m) => `<li><span>After ${m.label} drinks</span><span class="muted">${m.avgLabel}, ${m.count} mornings</span></li>`).join('')}</ul>`
        : '<p class="muted">Shows once you have 3 check-ins at a drink level.</p>'
    }</section>
    <section class="card"><h2>Top drinks, last 30 days</h2>${
      top.length
        ? `<ul class="rows">${top.map((d) => `<li><span>${esc(d.label)} <span class="muted">x${d.count}</span></span><span>${f1(d.std)} std</span></li>`).join('')}</ul>`
        : '<p class="muted">Nothing logged in the last 30 days.</p>'
    }</section>
    ${historyList(ws)}`;
}

function chartSvg(series, target) {
  const W = 340;
  const H = 170;
  const pl = 22;
  const pr = 6;
  const pt = 10;
  const pb = 22;
  const max = Math.max(target * 1.25, ...series.map((s) => s.total), 1);
  const cw = (W - pl - pr) / series.length;
  const bw = Math.max(8, cw * 0.62);
  const y = (v) => pt + (H - pt - pb) * (1 - v / max);
  const bars = series
    .map((s, i) => {
      const x = pl + i * cw + (cw - bw) / 2;
      const top = y(s.total);
      const h = Math.max(0, H - pb - top);
      return `<rect class="cbar is-${L.ringState(s.total, target)}" x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3"><title>Week of ${shortDay(s.start)}: ${f1(s.total)} std</title></rect>`;
    })
    .join('');
  const labels = series
    .map((s, i) => {
      if ((series.length - 1 - i) % 3 !== 0) return '';
      const { m, d } = L.parseDay(s.start);
      return `<text class="axis" x="${(pl + i * cw + cw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${m}/${d}</text>`;
    })
    .join('');
  const ty = y(target).toFixed(1);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weekly standard drinks for the last 12 weeks">
    <line class="base" x1="${pl}" x2="${W - pr}" y1="${H - pb}" y2="${H - pb}"/>
    ${bars}
    <line class="target" x1="${pl}" x2="${W - pr}" y1="${ty}" y2="${ty}"/>
    <text class="axis" x="${pl - 4}" y="${(Number(ty) + 3).toFixed(1)}" text-anchor="end">${num(target)}</text>
    <text class="axis" x="${pl - 4}" y="${H - pb + 3}" text-anchor="end">0</text>
    ${labels}</svg>`;
}

function historyList(ws) {
  const byWeek = new Map();
  for (const e of data.entries) {
    const w = L.weekStartOf(e.day, ws);
    if (!byWeek.has(w)) byWeek.set(w, []);
    byWeek.get(w).push(e);
  }
  const weeks = [...byWeek.keys()].sort().reverse();
  if (!weeks.length) return '<section class="card"><h2>Log</h2><p class="muted">Your drinks will show here.</p></section>';
  const shown = weeks.slice(0, ui.histWeeks);
  const blocks = shown
    .map((w) => {
      const es = byWeek.get(w);
      const byDay = new Map();
      for (const e of es) {
        if (!byDay.has(e.day)) byDay.set(e.day, []);
        byDay.get(e.day).push(e);
      }
      const rows = [...byDay.keys()]
        .sort()
        .reverse()
        .map((d) => {
          const de = byDay.get(d).sort((a, b) => a.ts - b.ts);
          return `<button class="day-row" data-act="open-day" data-day="${d}"><span class="dr-day">${dayLabel(d)}</span><span class="dr-what">${esc(L.groupsText(L.groupRepeats(de)))}</span><span class="dr-std">${f1(L.sumStd(de))}</span></button>`;
        })
        .join('');
      return `<div class="week-block"><div class="week-head"><span>Week of ${shortDay(w)}</span><span>${f1(L.sumStd(es))} std</span></div>${rows}</div>`;
    })
    .join('');
  const more = weeks.length > shown.length ? '<button class="btn ghost wide" data-act="hist-more">Show more</button>' : '';
  return `<section class="card"><h2>Log</h2>${blocks}${more}</section>`;
}

// Settings

function stepRow(label, key, val) {
  return `<div class="row"><span>${label}</span><div class="mini-stepper">
    <button data-act="set-step" data-key="${key}" data-d="-0.5" aria-label="Lower ${label}">−</button>
    <span>${num(val)}</span>
    <button data-act="set-step" data-key="${key}" data-d="0.5" aria-label="Raise ${label}">+</button></div></div>`;
}

function renderSettings() {
  const s = S();
  const hourLabel = (h) => (h === 0 ? 'Midnight' : `${h} am`);
  const presets = data.presets
    .map(
      (p, i) => `<li>
      <button class="pl-main" data-act="edit-preset" data-id="${esc(p.id)}"><span>${esc(p.name)}</span><span class="muted">${f1(L.drinkStd(p.components))} std</span></button>
      <button class="icon-btn" data-act="move-preset" data-id="${esc(p.id)}" data-d="-1" aria-label="Move ${esc(p.name)} up"${i === 0 ? ' disabled' : ''}>↑</button>
      <button class="icon-btn" data-act="move-preset" data-id="${esc(p.id)}" data-d="1" aria-label="Move ${esc(p.name)} down"${i === data.presets.length - 1 ? ' disabled' : ''}>↓</button></li>`,
    )
    .join('');
  return `
    <header class="top"><div><h1>Settings</h1></div></header>
    <section class="card"><h2>Targets</h2>
      ${stepRow('Weekly target', 'weeklyTarget', s.weeklyTarget)}
      ${stepRow('Daily cap', 'dailyCap', s.dailyCap)}
      <label class="row"><span>Week starts</span><select data-set="weekStart">
        <option value="mon"${s.weekStart === 'mon' ? ' selected' : ''}>Monday</option>
        <option value="sun"${s.weekStart === 'sun' ? ' selected' : ''}>Sunday</option></select></label>
      <label class="row"><span>Night ends at</span><select data-set="rolloverHour">${[0, 1, 2, 3, 4, 5, 6]
        .map((h) => `<option value="${h}"${Number(s.rolloverHour) === h ? ' selected' : ''}>${hourLabel(h)}</option>`)
        .join('')}</select></label>
      <p class="hint">Drinks logged after midnight and before this time count toward the night before.</p>
    </section>
    <section class="card"><h2>Drinks</h2>
      <label class="row"><span>Sort by most used</span><input type="checkbox" class="switch" data-set="sortByUse"${s.sortByUse ? ' checked' : ''}></label>
      <ul class="preset-list">${presets}</ul>
      <p class="hint">Tap a drink to change its pour, ABV or chips. Past logs keep their own values.</p>
      <div class="row-end"><button class="btn" data-act="restore-presets">Restore defaults</button><button class="btn" data-act="new-preset">Add drink</button></div>
    </section>
    <section class="card"><h2>Backup</h2>
      <p class="muted">Last backup: ${s.lastBackup ? ago(s.lastBackup) : 'never'}. Your log lives only on this phone.</p>
      <div class="btn-col">
        <button class="btn" data-act="export-json">Export JSON (full backup)</button>
        <button class="btn" data-act="export-csv">Export CSV (spreadsheet)</button>
        <button class="btn" data-act="import">Import JSON</button></div>
      <input type="file" id="import-file" accept="application/json,.json" hidden>
    </section>
    <section class="card"><h2>About</h2>
      <p>One US standard drink is 14 g of pure alcohol (0.6 fl oz). Drink Tally adds up each alcoholic ingredient: oz x ABV / 0.6.</p>
      <p>Example: a martini with 2.5 oz of 40% vodka and 0.5 oz of 18% vermouth is 1.8 standard drinks.</p>
      <p class="muted">Estimates only. Bar pours vary. Not medical advice. Version ${VERSION}.</p>
    </section>`;
}

// ---------- Sheets ----------

function renderSheet() {
  const back = $('#sheet-backdrop');
  const el = $('#sheet');
  if (!ui.sheet) {
    back.hidden = true;
    el.innerHTML = '';
    document.body.classList.remove('locked');
    return;
  }
  const s = ui.sheet;
  const views = { adjust: adjustSheet, custom: customSheet, day: daySheet, pick: pickSheet, checkin: checkinSheet, preset: presetSheet, import: importSheet };
  el.innerHTML = `<div class="grabber" aria-hidden="true"></div><button class="close" data-act="close" aria-label="Close">×</button>${(views[s.kind] || (() => ''))(s)}`;
  back.hidden = false;
  document.body.classList.add('locked');
}

function openSheet(s) {
  ui.sheet = s;
  renderSheet();
}

function closeSheet() {
  ui.sheet = ui.sheet && ui.sheet.returnTo ? ui.sheet.returnTo : null;
  renderSheet();
}

function sheetError(msg) {
  const el = $('#sheet-err');
  if (el) el.textContent = msg;
}

function stdLine(components) {
  return `<p class="big-std"><span id="sheet-std">${f1(L.drinkStd(components))}</span> <span class="muted">std each</span></p>`;
}

function countRow(s) {
  return `<div class="row"><span>How many</span><div class="mini-stepper">
    <button data-act="adj-count" data-d="-1" aria-label="Fewer">−</button><span>${s.count}</span>
    <button data-act="adj-count" data-d="1" aria-label="More">+</button></div></div>`;
}

function saveLabel(s) {
  const each = L.drinkStd(s.components);
  const n = s.count || 1;
  const verb = s.mode === 'edit' ? 'Save' : 'Log';
  return n > 1 ? `${verb} ${n} (${f1(each * n)} std)` : `${verb} (${f1(each)} std)`;
}

function whenHint(s) {
  if (s.when !== 'pick') return '';
  const d = new Date(s.pick);
  return Number.isNaN(d.getTime()) ? '' : `Counts toward ${dayLabel(L.drinkingDay(d, S().rolloverHour))}.`;
}

function whenControls(s) {
  if (s.fixedDay) return `<div class="row"><span>Day</span><span>${dayLabel(s.fixedDay)}</span></div>`;
  if (s.mode === 'edit' && !s.fromToast) {
    return `<label class="row"><span>Time</span><input class="input dt" type="datetime-local" data-field="pick" value="${esc(s.pick)}"></label>
      <p class="hint" id="when-hint">${s.when === 'pick' ? whenHint(s) : `Counts toward ${dayLabel(s.origDay)}.`}</p>`;
  }
  const opts = [
    ['now', 'Now'],
    ['earlier', 'Earlier tonight'],
    ['pick', 'Pick time'],
  ];
  return `<p class="label">When</p><div class="seg">${opts
    .map(([v, l]) => `<button class="seg-btn ${s.when === v ? 'on' : ''}" data-act="adj-when" data-v="${v}">${l}</button>`)
    .join('')}</div>
    ${s.when === 'pick' ? `<input class="input dt" type="datetime-local" data-field="pick" value="${esc(s.pick)}"><p class="hint" id="when-hint">${whenHint(s)}</p>` : ''}`;
}

function noteAndSave(s, extra = '') {
  return `<input class="input" type="text" placeholder="Note (optional)" maxlength="200" data-field="note" value="${esc(s.note)}">
    ${extra}
    <p class="err" id="sheet-err" role="alert"></p>
    <div class="row-end">${s.mode === 'edit' ? '<button class="btn danger" data-act="adj-delete">Delete</button>' : ''}<button class="btn primary" id="save-btn" data-act="adj-save">${saveLabel(s)}</button></div>`;
}

function spiritControls(s) {
  const bi = L.baseIndex(s.components);
  const b = s.components[bi];
  const shots = s.chips && s.chips.shots && s.chips.shots.length ? s.chips.shots : [1, 2, 3];
  const others = s.components.filter((_, i) => i !== bi);
  return `<p class="label">${esc(b.name)}</p>
    <div class="stepper"><button data-act="adj-base" data-d="-0.5" aria-label="Pour less">−</button>
      <div class="stepper-val"><strong>${num(b.oz)} oz</strong><span class="muted">${plural(L.shotsOf(b.oz), 'shot')}</span></div>
      <button data-act="adj-base" data-d="0.5" aria-label="Pour more">+</button></div>
    <div class="chips">${shots
      .map((n) => `<button class="chip ${Math.abs(b.oz - n * L.SHOT_OZ) < 1e-9 ? 'on' : ''}" data-act="adj-shots" data-v="${n}">${plural(n, 'shot')}</button>`)
      .join('')}</div>
    <label class="row"><span>${esc(b.name)} ABV</span><span class="unit-input"><input class="input num" type="number" inputmode="decimal" step="0.5" min="0" max="80" data-field="c-abv" data-i="${bi}" value="${num(b.abv)}">%</span></label>
    ${others.length ? `<p class="hint">Also counted: ${others.map((c) => `${esc(c.name)} ${num(c.oz)} oz at ${num(c.abv)}%`).join(', ')}.</p>` : ''}`;
}

function pourControls(s) {
  const c = s.components[0];
  const sizes = (s.chips && s.chips.sizes) || [];
  const abvs = (s.chips && s.chips.abvs) || [];
  return `<p class="label">Size</p>
    ${sizes.length ? `<div class="chips">${sizes.map((v) => `<button class="chip ${Number(c.oz) === v ? 'on' : ''}" data-act="adj-size" data-v="${v}">${num(v)} oz</button>`).join('')}</div>` : ''}
    <label class="row"><span>Ounces</span><span class="unit-input"><input class="input num" type="number" inputmode="decimal" step="0.5" min="0.5" max="64" data-field="c-oz" data-i="0" value="${num(c.oz)}"> oz</span></label>
    <p class="label">Strength</p>
    ${abvs.length ? `<div class="chips">${abvs.map((v) => `<button class="chip ${Number(c.abv) === v ? 'on' : ''}" data-act="adj-abv" data-v="${v}">${num(v)}%</button>`).join('')}</div>` : ''}
    <label class="row"><span>ABV</span><span class="unit-input"><input class="input num" type="number" inputmode="decimal" step="0.5" min="0" max="80" data-field="c-abv" data-i="0" value="${num(c.abv)}">%</span></label>`;
}

function adjustSheet(s) {
  return `<h2 class="sheet-title">${esc(s.name)}</h2>
    ${stdLine(s.components)}
    ${s.type === 'pour' ? pourControls(s) : spiritControls(s)}
    ${s.allowCount ? countRow(s) : ''}
    ${whenControls(s)}
    ${noteAndSave(s)}`;
}

function openAdjustNew(presetId, fixedDay = null, returnTo = null) {
  const p = presetById(presetId);
  if (!p) return;
  openSheet({
    kind: 'adjust', mode: 'new', presetId: p.id, name: p.name, type: p.type || 'spirit', chips: p.chips || {},
    components: L.cloneComponents(p.components), count: 1, when: 'now', pick: toLocalInput(Date.now()),
    fixedDay, note: '', allowCount: true, returnTo,
  });
}

function openAdjustEdit(entryId, fromToast = false, returnTo = null) {
  const e = data.entries.find((x) => x.id === entryId);
  if (!e) return;
  const p = presetById(e.presetId);
  const type = p ? p.type : e.components.length === 1 && !e.components[0].base ? 'pour' : 'spirit';
  openSheet({
    kind: 'adjust', mode: 'edit', entryId, presetId: e.presetId, name: e.label, type, chips: (p && p.chips) || {},
    components: L.cloneComponents(e.components), count: 1, when: fromToast ? 'now' : 'keep', pick: toLocalInput(e.ts),
    fixedDay: null, note: e.note || '', allowCount: fromToast, fromToast, origDay: e.day, origTs: e.ts, returnTo,
  });
}

function customSheet(s) {
  const rows = s.components
    .map(
      (c, i) => `<div class="comp-row">
      <input class="input" type="text" placeholder="Ingredient" maxlength="40" data-field="c-name" data-i="${i}" value="${esc(c.name)}" aria-label="Ingredient name">
      <span class="unit-input"><input class="input num" type="number" inputmode="decimal" step="0.25" min="0" data-field="c-oz" data-i="${i}" value="${num(c.oz)}" aria-label="Ounces">oz</span>
      <span class="unit-input"><input class="input num" type="number" inputmode="decimal" step="0.5" min="0" max="80" data-field="c-abv" data-i="${i}" value="${num(c.abv)}" aria-label="ABV">%</span>
      ${s.components.length > 1 ? `<button class="icon-btn" data-act="c-remove" data-i="${i}" aria-label="Remove ingredient">×</button>` : ''}</div>`,
    )
    .join('');
  return `<h2 class="sheet-title">Custom drink</h2>
    ${stdLine(s.components)}
    <input class="input" type="text" placeholder="Name, like Negroni" maxlength="40" data-field="c-title" value="${esc(s.name)}" aria-label="Drink name">
    <p class="label">Alcoholic ingredients</p>${rows}
    <div class="row-end start"><button class="btn ghost" data-act="c-add">Add ingredient</button></div>
    <p class="hint">Skip mixers like soda or juice. They add no alcohol.</p>
    ${countRow(s)}
    ${whenControls(s)}
    ${noteAndSave(s, `<label class="row"><span>Save as a drink button</span><input type="checkbox" class="switch" data-field="c-save"${s.save ? ' checked' : ''}></label>`)}`;
}

function openCustom(fixedDay = null, returnTo = null) {
  openSheet({
    kind: 'custom', mode: 'new', name: '', components: [{ name: 'Spirit', oz: 1.5, abv: 40, base: true }],
    count: 1, when: 'now', pick: toLocalInput(Date.now()), fixedDay, note: '', save: false, returnTo,
  });
}

function pickSheet(s) {
  return `<h2 class="sheet-title">Add a drink</h2><p class="sub">${dayLabel(s.day)}</p>
    <div class="grid sheet-grid">${data.presets.map((p) => presetButton(p, 'pick-preset')).join('')}
    <button class="preset is-custom" data-act="pick-custom"><span class="p-name">Custom</span><span class="p-std">Build a drink</span></button></div>`;
}

function daySheet(s) {
  const es = L.entriesOnDay(data.entries, s.day);
  const total = L.sumStd(es);
  const ci = L.checkinFor(data.checkins, s.day);
  const over = L.overCap(total, S().dailyCap) ? `, above your daily cap of ${num(S().dailyCap)}` : '';
  const list = es.length
    ? `<ul class="entry-list">${es
        .map(
          (e) => `<li><button class="entry" data-act="edit-entry" data-id="${esc(e.id)}"><span class="e-main"><span>${esc(e.label)}</span><span class="muted small">${timeLabel(e.ts)}${e.note ? `, ${esc(e.note)}` : ''}</span></span><span>${f1(e.std)}</span></button></li>`,
        )
        .join('')}</ul>`
    : '<p class="muted">No drinks logged.</p>';
  const ciText =
    ci && ci.feel != null
      ? `<p>${L.FEEL[ci.feel]}${ci.sleep ? `, sleep ${L.SLEEP[ci.sleep].toLowerCase()}` : ''}${ci.note ? `. ${esc(ci.note)}` : ''}</p><button class="btn ghost" data-act="ci-open" data-day="${s.day}">Edit check-in</button>`
      : `<button class="btn ghost" data-act="ci-open" data-day="${s.day}">Add check-in</button>`;
  return `<h2 class="sheet-title">${dayLabel(s.day)}</h2>
    <p class="big-std">${f1(total)} <span class="muted">std${over}</span></p>
    ${list}
    <div class="row-end"><button class="btn" data-act="day-add" data-day="${s.day}">Add drink</button></div>
    <h3>Morning after</h3>${ciText}`;
}

function checkinSheet(s) {
  const total = L.sumStd(L.entriesOnDay(data.entries, s.day));
  return checkinBody(s, total, 'sheet');
}

function presetSheet(s) {
  const spirit = s.type === 'spirit';
  const comps = spirit ? s.components : s.components.slice(0, 1);
  const rows = comps
    .map(
      (c, i) => `<div class="comp-row">
      ${spirit ? `<label class="base-pick"><input type="radio" name="base" data-field="p-base" data-i="${i}"${c.base ? ' checked' : ''}><span>Base</span></label>` : ''}
      <input class="input" type="text" placeholder="Ingredient" maxlength="40" data-field="c-name" data-i="${i}" value="${esc(c.name)}" aria-label="Ingredient name">
      <span class="unit-input"><input class="input num" type="number" inputmode="decimal" step="0.25" min="0" data-field="c-oz" data-i="${i}" value="${num(c.oz)}" aria-label="Ounces">oz</span>
      <span class="unit-input"><input class="input num" type="number" inputmode="decimal" step="0.5" min="0" max="80" data-field="c-abv" data-i="${i}" value="${num(c.abv)}" aria-label="ABV">%</span>
      ${spirit && comps.length > 1 ? `<button class="icon-btn" data-act="c-remove" data-i="${i}" aria-label="Remove ingredient">×</button>` : ''}</div>`,
    )
    .join('');
  const chips = spirit
    ? `<label class="row"><span>Shot chips</span><input class="input chip-in" type="text" inputmode="decimal" data-field="p-shots" value="${esc(s.shots)}"></label>`
    : `<label class="row"><span>Size chips (oz)</span><input class="input chip-in" type="text" inputmode="decimal" data-field="p-sizes" value="${esc(s.sizes)}"></label>
       <label class="row"><span>ABV chips (%)</span><input class="input chip-in" type="text" inputmode="decimal" data-field="p-abvs" value="${esc(s.abvs)}"></label>`;
  return `<h2 class="sheet-title">${s.id ? 'Edit drink' : 'New drink'}</h2>
    ${stdLine(comps)}
    <input class="input" type="text" placeholder="Name" maxlength="40" data-field="p-name" value="${esc(s.name)}" aria-label="Drink name">
    <label class="row"><span>Type</span><select data-field="p-type">
      <option value="spirit"${spirit ? ' selected' : ''}>Mixed drink (pour in shots)</option>
      <option value="pour"${!spirit ? ' selected' : ''}>Can or glass (size and ABV)</option></select></label>
    <p class="label">${spirit ? 'Alcoholic ingredients. Base is the one the pour buttons change.' : 'Default pour'}</p>
    ${rows}
    ${spirit ? '<div class="row-end start"><button class="btn ghost" data-act="c-add">Add ingredient</button></div>' : ''}
    ${chips}
    <p class="hint">Separate chip values with commas.</p>
    <p class="err" id="sheet-err" role="alert"></p>
    <div class="row-end">
      ${s.id ? `<button class="btn danger" data-act="p-delete">${s.confirmDelete ? 'Tap again to delete' : 'Delete'}</button><button class="btn" data-act="p-dup">Duplicate</button>` : ''}
      <button class="btn primary" data-act="p-save">Save</button></div>`;
}

function openPresetEditor(id) {
  const p = id ? presetById(id) : null;
  openSheet({
    kind: 'preset', id: p ? p.id : null, name: p ? p.name : '', type: p ? p.type : 'spirit',
    components: p ? L.cloneComponents(p.components) : [{ name: 'Spirit', oz: 2, abv: 40, base: true }],
    shots: ((p && p.chips && p.chips.shots) || [1, 2, 3]).join(', '),
    sizes: ((p && p.chips && p.chips.sizes) || []).join(', '),
    abvs: ((p && p.chips && p.chips.abvs) || []).join(', '),
    confirmDelete: false,
  });
}

function importSheet(s) {
  const c = s.counts;
  return `<h2 class="sheet-title">Import backup</h2>
    <ul class="rows">
      <li><span>New drinks</span><span>${c.entries.added}</span></li>
      <li><span>Updated drinks</span><span>${c.entries.updated}</span></li>
      <li><span>Already here</span><span>${c.entries.same}</span></li>
      <li><span>New check-ins</span><span>${c.checkins.added + c.checkins.updated}</span></li>
      <li><span>New drink buttons</span><span>${c.presets.added}</span></li></ul>
    <p class="hint">Nothing is deleted. Matching drinks keep the newer edit.</p>
    <div class="row-end"><button class="btn ghost" data-act="close">Cancel</button><button class="btn primary" data-act="import-confirm">Import</button></div>`;
}

// ---------- Toast and update banner ----------

let toastTimer = null;
function showToast(t) {
  ui.toast = t;
  renderToast();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    ui.toast = null;
    renderToast();
  }, t.ms || 4000);
}
function hideToast() {
  clearTimeout(toastTimer);
  ui.toast = null;
  renderToast();
}
function renderToast() {
  const el = $('#toast');
  if (!ui.toast) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  el.innerHTML = `<span>${esc(ui.toast.text)}</span>${(ui.toast.actions || []).map(([label, act]) => `<button data-act="${act}">${label}</button>`).join('')}`;
  el.hidden = false;
}
function renderUpdate() {
  const el = $('#update');
  if (!ui.update) {
    el.hidden = true;
    return;
  }
  el.innerHTML = '<button data-act="apply-update">Update ready. Tap to reload.</button>';
  el.hidden = false;
}

// ---------- Actions ----------

function logPreset(id) {
  const p = presetById(id);
  if (!p) return;
  const now = Date.now();
  const e = L.makeEntry({ id: uid(), preset: p, components: p.components, day: today(), ts: now, now });
  data.entries.push(e);
  commit();
  render();
  showToast({ text: `${p.name}, ${f1(e.std)} std`, actions: [['Adjust', 'toast-adjust'], ['Undo', 'toast-undo']], ids: [e.id], ms: 6000 });
}

function resolveWhen(s) {
  const roll = S().rolloverHour;
  if (s.fixedDay) return { ts: L.tsForDay(s.fixedDay, 20), day: s.fixedDay };
  if (s.when === 'keep' || (s.mode === 'edit' && s.when === 'now')) return { ts: s.origTs, day: s.origDay };
  if (s.when === 'pick') {
    const d = new Date(s.pick);
    if (Number.isNaN(d.getTime())) return null;
    return { ts: d.getTime(), day: L.drinkingDay(d, roll) };
  }
  if (s.when === 'earlier') return { ts: Date.now() - 90 * 60000, day: today() };
  return { ts: Date.now(), day: today() };
}

function saveDrinkSheet() {
  const s = ui.sheet;
  const comps = L.cleanComponents(s.components);
  if (!comps.length || L.drinkStd(comps) <= 0) return sheetError('Set a pour and ABV above zero.');
  const w = resolveWhen(s);
  if (!w) return sheetError('Pick a valid date and time.');
  const now = Date.now();
  const note = (s.note || '').trim();
  let preset = presetById(s.presetId);
  let label = s.name;
  if (s.kind === 'custom') {
    label = (s.name || '').trim() || 'Custom';
    if (s.save) {
      const pour = comps.length === 1 && comps[0].abv < 20;
      const pcomps = comps.map((c, i) => {
        const { base, ...rest } = c;
        return pour ? rest : { ...rest, ...(i === 0 ? { base: true } : {}) };
      });
      preset = {
        id: `p-${uid().slice(0, 8)}`, name: label, type: pour ? 'pour' : 'spirit', components: pcomps,
        chips: pour ? { sizes: [pcomps[0].oz], abvs: [] } : { shots: [1, 2, 3] },
      };
      data.presets.push(preset);
    } else preset = null;
  }
  const ids = [];
  const count = s.count || 1;
  let first = 0;
  if (s.mode === 'edit') {
    const e = data.entries.find((x) => x.id === s.entryId);
    if (e) {
      Object.assign(e, { components: comps, std: L.drinkStd(comps), note, ts: w.ts, day: w.day, updated: now });
      ids.push(e.id);
    }
    first = 1;
  }
  for (let i = first; i < count; i++) {
    const e = L.makeEntry({ id: uid(), preset, label, components: comps, day: w.day, ts: w.ts + i * 1000, note, now });
    data.entries.push(e);
    ids.push(e.id);
  }
  commit();
  const returnTo = s.returnTo;
  ui.sheet = returnTo || null;
  render();
  const total = L.drinkStd(comps) * count;
  showToast({
    text: `${count > 1 ? `${count} x ` : ''}${label}, ${f1(total)} std${s.mode === 'edit' ? ', saved' : ''}`,
    actions: s.mode === 'new' ? [['Undo', 'toast-undo']] : [],
    ids,
    ms: 5000,
  });
}

function saveCheckin(where) {
  const d = where === 'card' ? ui.ci : ui.sheet;
  if (!d) return;
  if (!d.feel) {
    const el = $(`#ci-err-${where}`);
    if (el) el.textContent = 'Pick how you feel first.';
    return;
  }
  data.checkins = L.upsertCheckin(data.checkins, { day: d.day, feel: d.feel, sleep: d.sleep || null, note: (d.note || '').trim(), ts: Date.now() });
  commit();
  const fb = L.feedbackLine(data.entries, data.checkins, d.day, FALLBACK_LINES);
  if (where === 'card') ui.ci = null;
  else ui.sheet = ui.sheet.returnTo || null;
  render();
  showToast({ text: fb.text, ms: 8000 });
}

async function exportFile(name, text, type) {
  const blob = new Blob([text], { type });
  try {
    const file = new File([blob], name, { type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return true;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return false;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

async function onImportFile(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  try {
    const obj = JSON.parse(await file.text());
    if (!obj || !Array.isArray(obj.entries)) throw new Error('shape');
    const { data: merged, counts } = L.mergeData(data, obj, DEFAULT_PRESETS);
    openSheet({ kind: 'import', merged, counts });
  } catch {
    showToast({ text: 'That file is not a Drink Tally backup.', ms: 5000 });
  }
}

function clampSetting(key, v) {
  const max = key === 'weeklyTarget' ? 50 : 20;
  return Math.min(max, Math.max(0.5, L.round1(v)));
}

const ACTIONS = {
  tab(el) {
    ui.tab = el.dataset.tab;
    ui.histWeeks = 8;
    ui.sheet = null;
    render();
    window.scrollTo(0, 0);
  },
  log(el) {
    logPreset(el.dataset.id);
  },
  custom() {
    openCustom();
  },
  'open-day'(el) {
    openSheet({ kind: 'day', day: el.dataset.day });
  },
  close() {
    closeSheet();
  },
  'toast-undo'() {
    const ids = (ui.toast && ui.toast.ids) || [];
    data.entries = data.entries.filter((e) => !ids.includes(e.id));
    commit();
    render();
    showToast({ text: 'Removed', ms: 2500 });
  },
  'toast-adjust'() {
    const id = ui.toast && ui.toast.ids && ui.toast.ids[0];
    hideToast();
    if (id) openAdjustEdit(id, true);
  },
  'toast-restore'() {
    const e = ui.toast && ui.toast.restore;
    if (e) {
      data.entries.push(e);
      commit();
      render();
    }
    hideToast();
  },
  'adj-base'(el) {
    const s = ui.sheet;
    s.components = L.stepBase(s.components, Number(el.dataset.d));
    renderSheet();
  },
  'adj-shots'(el) {
    ui.sheet.components = L.withShots(ui.sheet.components, Number(el.dataset.v));
    renderSheet();
  },
  'adj-size'(el) {
    ui.sheet.components = L.withComponent(ui.sheet.components, 0, { oz: Number(el.dataset.v) });
    renderSheet();
  },
  'adj-abv'(el) {
    ui.sheet.components = L.withComponent(ui.sheet.components, 0, { abv: Number(el.dataset.v) });
    renderSheet();
  },
  'adj-count'(el) {
    const s = ui.sheet;
    s.count = Math.min(6, Math.max(1, (s.count || 1) + Number(el.dataset.d)));
    renderSheet();
  },
  'adj-when'(el) {
    ui.sheet.when = el.dataset.v;
    renderSheet();
  },
  'adj-save'() {
    saveDrinkSheet();
  },
  'adj-delete'() {
    const s = ui.sheet;
    const e = data.entries.find((x) => x.id === s.entryId);
    data.entries = data.entries.filter((x) => x.id !== s.entryId);
    commit();
    ui.sheet = s.returnTo || null;
    render();
    if (e) showToast({ text: `Deleted ${e.label}`, actions: [['Undo', 'toast-restore']], restore: e, ms: 5000 });
  },
  'edit-entry'(el) {
    openAdjustEdit(el.dataset.id, false, ui.sheet);
  },
  'day-add'(el) {
    openSheet({ kind: 'pick', day: el.dataset.day, returnTo: ui.sheet });
  },
  'pick-preset'(el) {
    const s = ui.sheet;
    openAdjustNew(el.dataset.id, s.day, s.returnTo);
  },
  'pick-custom'() {
    const s = ui.sheet;
    openCustom(s.day, s.returnTo);
  },
  'c-add'() {
    const s = ui.sheet;
    s.components = [...L.cloneComponents(s.components), { name: 'Liqueur', oz: 0.5, abv: 20 }];
    renderSheet();
  },
  'c-remove'(el) {
    const s = ui.sheet;
    const i = Number(el.dataset.i);
    const wasBase = s.components[i] && s.components[i].base;
    s.components = s.components.filter((_, j) => j !== i);
    if (wasBase && s.components[0]) s.components[0].base = true;
    renderSheet();
  },
  'ci-feel'(el) {
    const d = el.dataset.where === 'card' ? ui.ci : ui.sheet;
    if (!d) return;
    d.feel = Number(el.dataset.v);
    if (el.dataset.where === 'card') render();
    else renderSheet();
  },
  'ci-sleep'(el) {
    const d = el.dataset.where === 'card' ? ui.ci : ui.sheet;
    if (!d) return;
    const v = Number(el.dataset.v);
    d.sleep = d.sleep === v ? null : v;
    if (el.dataset.where === 'card') render();
    else renderSheet();
  },
  'ci-save'(el) {
    saveCheckin(el.dataset.where);
  },
  'ci-skip'() {
    if (!ui.ci) return;
    data.checkins = L.upsertCheckin(data.checkins, { day: ui.ci.day, feel: null, sleep: null, note: '', skipped: true, ts: Date.now() });
    ui.ci = null;
    commit();
    render();
  },
  'ci-open'(el) {
    const day = el.dataset.day;
    const c = L.checkinFor(data.checkins, day);
    openSheet({ kind: 'checkin', day, feel: c ? c.feel : null, sleep: c ? c.sleep : null, note: (c && c.note) || '', returnTo: ui.sheet });
  },
  'dismiss-install'() {
    S().installDismissed = true;
    commit();
    render();
  },
  'hist-more'() {
    ui.histWeeks += 8;
    render();
  },
  'set-step'(el) {
    const key = el.dataset.key;
    S()[key] = clampSetting(key, Number(S()[key]) + Number(el.dataset.d));
    commit();
    render();
  },
  'edit-preset'(el) {
    openPresetEditor(el.dataset.id);
  },
  'new-preset'() {
    openPresetEditor(null);
  },
  'move-preset'(el) {
    const i = data.presets.findIndex((p) => p.id === el.dataset.id);
    const j = i + Number(el.dataset.d);
    if (i < 0 || j < 0 || j >= data.presets.length) return;
    const list = data.presets.slice();
    [list[i], list[j]] = [list[j], list[i]];
    data.presets = list;
    commit();
    render();
  },
  'restore-presets'() {
    const have = new Set(data.presets.map((p) => p.id));
    const missing = DEFAULT_PRESETS.filter((p) => !have.has(p.id));
    data.presets.push(...JSON.parse(JSON.stringify(missing)));
    commit();
    render();
    showToast({ text: missing.length ? `Restored ${missing.length} drink${missing.length === 1 ? '' : 's'}` : 'All default drinks are here', ms: 3000 });
  },
  'p-save'() {
    const s = ui.sheet;
    const name = (s.name || '').trim();
    if (!name) return sheetError('Give the drink a name.');
    let comps = L.cleanComponents(s.type === 'spirit' ? s.components : s.components.slice(0, 1));
    if (!comps.length || L.drinkStd(comps) <= 0) return sheetError('Set a pour and ABV above zero.');
    if (s.type === 'spirit') {
      if (!comps.some((c) => c.base)) comps[0].base = true;
    } else comps = comps.map(({ base, ...rest }) => rest);
    const chips =
      s.type === 'spirit'
        ? { shots: L.parseNumberList(s.shots).slice(0, 5) }
        : { sizes: L.parseNumberList(s.sizes).slice(0, 5), abvs: L.parseNumberList(s.abvs).slice(0, 5) };
    if (s.id) {
      const p = presetById(s.id);
      if (p) Object.assign(p, { name, type: s.type, components: comps, chips });
    } else {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'drink';
      data.presets.push({ id: `${slug}-${uid().slice(0, 6)}`, name, type: s.type, components: comps, chips });
    }
    commit();
    ui.sheet = null;
    render();
    showToast({ text: `${name} saved`, ms: 2500 });
  },
  'p-delete'() {
    const s = ui.sheet;
    if (!s.confirmDelete) {
      s.confirmDelete = true;
      renderSheet();
      return;
    }
    data.presets = data.presets.filter((p) => p.id !== s.id);
    commit();
    ui.sheet = null;
    render();
    showToast({ text: 'Drink button deleted. Past logs are kept.', ms: 3500 });
  },
  'p-dup'() {
    const p = presetById(ui.sheet.id);
    if (!p) return;
    const copy = JSON.parse(JSON.stringify(p));
    copy.id = `${p.id}-${uid().slice(0, 4)}`;
    copy.name = `${p.name} copy`.slice(0, 40);
    data.presets.splice(data.presets.indexOf(p) + 1, 0, copy);
    commit();
    render();
    openPresetEditor(copy.id);
  },
  async 'export-json'() {
    const name = `drink-tally-${L.localDay(new Date())}.json`;
    const ok = await exportFile(name, JSON.stringify(data, null, 2), 'application/json');
    if (ok) {
      S().lastBackup = Date.now();
      commit();
      render();
      showToast({ text: 'Backup exported', ms: 2500 });
    }
  },
  async 'export-csv'() {
    await exportFile(`drink-tally-${L.localDay(new Date())}.csv`, L.toCSV(data.entries), 'text/csv');
  },
  import() {
    const input = $('#import-file');
    if (input) input.click();
  },
  'import-confirm'() {
    const s = ui.sheet;
    data = s.merged;
    commit();
    ui.sheet = null;
    render();
    showToast({ text: 'Backup imported', ms: 2500 });
  },
  'apply-update'() {
    if (!ui.update) return;
    ui.updating = true;
    ui.update.postMessage('skipWaiting');
  },
};

// ---------- Events ----------

let suppressClick = false;
let pressTimer = null;
let pressStart = null;

document.addEventListener('click', (e) => {
  // The release of a long-press can fire one click (on the button or on <body>). Eat only that one.
  if (suppressClick) {
    suppressClick = false;
    e.preventDefault();
    return;
  }
  if (e.target && e.target.id === 'sheet-backdrop') {
    closeSheet();
    return;
  }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.act];
  if (fn) {
    e.preventDefault();
    fn(el, e);
  }
});

// Press and hold a drink button to set the pour before logging.
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('[data-press]');
  if (!el) return;
  pressStart = { x: e.clientX, y: e.clientY };
  clearTimeout(pressTimer);
  pressTimer = setTimeout(() => {
    pressTimer = null;
    suppressClick = true;
    if (navigator.vibrate) navigator.vibrate(10);
    openAdjustNew(el.dataset.id);
  }, 450);
});
document.addEventListener('pointermove', (e) => {
  if (pressTimer && pressStart && Math.hypot(e.clientX - pressStart.x, e.clientY - pressStart.y) > 10) {
    clearTimeout(pressTimer);
    pressTimer = null;
  }
});
['pointerup', 'pointercancel'].forEach((type) =>
  document.addEventListener(type, () => {
    clearTimeout(pressTimer);
    pressTimer = null;
    if (suppressClick) setTimeout(() => (suppressClick = false), 60);
  }),
);
document.addEventListener('contextmenu', (e) => {
  if (e.target.closest('[data-press]')) e.preventDefault();
});

function updatePreview() {
  const s = ui.sheet;
  if (!s || !s.components) return;
  const std = $('#sheet-std');
  if (std) std.textContent = f1(L.drinkStd(s.kind === 'preset' && s.type === 'pour' ? s.components.slice(0, 1) : s.components));
  const btn = $('#save-btn');
  if (btn) btn.textContent = saveLabel(s);
  const hint = $('#when-hint');
  if (hint && s.when === 'pick') hint.textContent = whenHint(s);
}

function onField(el) {
  const f = el.dataset.field;
  const i = Number(el.dataset.i);
  const v = el.type === 'checkbox' ? el.checked : el.value;
  if (f === 'ci-note') {
    const d = el.dataset.where === 'card' ? ui.ci : ui.sheet;
    if (d) d.note = v;
    return;
  }
  const s = ui.sheet;
  if (!s) return;
  switch (f) {
    case 'note': s.note = v; break;
    case 'pick': s.pick = v; if (s.mode === 'edit' && !s.fromToast) s.when = 'pick'; break;
    case 'c-oz': s.components = L.withComponent(s.components, i, { oz: parseFloat(v) || 0 }); break;
    case 'c-abv': s.components = L.withComponent(s.components, i, { abv: parseFloat(v) || 0 }); break;
    case 'c-name': s.components = L.withComponent(s.components, i, { name: v }); break;
    case 'c-title': case 'p-name': s.name = v; break;
    case 'c-save': s.save = v; break;
    case 'p-base': s.components = s.components.map((c, j) => ({ ...c, base: j === i })); break;
    case 'p-shots': s.shots = v; break;
    case 'p-sizes': s.sizes = v; break;
    case 'p-abvs': s.abvs = v; break;
    case 'p-type':
      s.type = v;
      if (v === 'pour') {
        s.components = s.components.slice(0, 1).map(({ base, ...rest }) => rest);
        if (!s.sizes) s.sizes = String(s.components[0] ? s.components[0].oz : 12);
      } else if (s.components[0]) s.components[0].base = true;
      renderSheet();
      return;
    default: return;
  }
  updatePreview();
}

document.addEventListener('input', (e) => {
  if (e.target.dataset && e.target.dataset.field) onField(e.target);
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.id === 'import-file') {
    onImportFile(el);
    return;
  }
  if (el.dataset && el.dataset.set) {
    const key = el.dataset.set;
    S()[key] = key === 'sortByUse' ? el.checked : key === 'rolloverHour' ? Number(el.value) : el.value;
    commit();
    render();
    return;
  }
  if (el.dataset && el.dataset.field && (el.type === 'checkbox' || el.type === 'radio' || el.tagName === 'SELECT')) onField(el);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && ui.sheet) closeSheet();
});

// Re-render when the app comes back (the day or the check-in may have changed overnight).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    render();
    if (swReg) swReg.update().catch(() => {});
  }
});

// ---------- Service worker ----------

let swReg = null;
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        swReg = reg;
        const ready = (w) => {
          ui.update = w;
          renderUpdate();
        };
        if (reg.waiting && navigator.serviceWorker.controller) ready(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          if (!w) return;
          w.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller) ready(w);
          });
        });
      })
      .catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (ui.updating) window.location.reload();
    });
  });
}

render();
