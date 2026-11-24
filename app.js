'use strict';

/* ============================================================
 *  Pulse – Fitness Tracker
 *  Daten liegen lokal im Browser (localStorage).
 * ============================================================ */

const TYPES = {
  run:   { name: 'Laufen',        icon: '🏃', distance: true,  pace: 'min' },
  ride:  { name: 'Radfahren',     icon: '🚴', distance: true,  pace: 'speed' },
  swim:  { name: 'Schwimmen',     icon: '🏊', distance: true,  pace: 'swim' },
  hike:  { name: 'Wandern',       icon: '🥾', distance: true,  pace: 'min' },
  walk:  { name: 'Gehen',         icon: '🚶', distance: true,  pace: 'min' },
  gym:   { name: 'Krafttraining', icon: '🏋️', distance: false },
  yoga:  { name: 'Yoga',          icon: '🧘', distance: false },
  other: { name: 'Sonstiges',     icon: '⚡', distance: false },
};

const STORE_KEY = 'pulse.v1';
const DAY_MS = 86400000;
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

/* ---------------- State ---------------- */
let state = load();
let period = 'week';

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && Array.isArray(s.activities)) return { activities: s.activities, marks: s.marks || {} };
  } catch (e) { /* ignore */ }
  return { activities: [], marks: {} };
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { toast('Speichern fehlgeschlagen'); }
}

/* ---------------- Helpers ---------------- */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function today() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function mondayOf(d) { const r = new Date(d); r.setHours(0, 0, 0, 0); r.setDate(r.getDate() - ((r.getDay() + 6) % 7)); return r; }

function fmtDur(sec) {
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
function fmtHours(sec) {
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}
function parseDur(str) {
  const p = String(str).trim().split(':').map(Number);
  if (p.some(isNaN)) return NaN;
  return p.reduce((acc, v) => acc * 60 + v, 0);
}
function fmtKm(km) { return km >= 100 ? km.toFixed(0) : km.toFixed(2); }
function fmtDate(s) {
  return parseYmd(s).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/** Pace/Speed je nach Sportart. secPerKm = Sekunden pro km. */
function fmtPace(type, secPerKm) {
  if (!isFinite(secPerKm) || secPerKm <= 0) return '–';
  const t = TYPES[type] || {};
  if (t.pace === 'speed') return (3600 / secPerKm).toFixed(1) + ' km/h';
  if (t.pace === 'swim') return fmtDur(secPerKm / 10) + ' /100m';
  return fmtDur(secPerKm) + ' /km';
}
function paceLabel(type) {
  const t = TYPES[type] || {};
  return t.pace === 'speed' ? 'Ø Tempo' : 'Ø Pace';
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), 2200);
}

/* ---------------- Aggregation ---------------- */
function activitiesByDay(filterType) {
  const map = new Map();
  for (const a of state.activities) {
    if (filterType && a.type !== filterType) continue;
    if (!map.has(a.date)) map.set(a.date, []);
    map.get(a.date).push(a);
  }
  return map;
}

/**
 * Streak-Regeln:
 *  - Ein Tag mit Aktivität oder als Ruhetag markiert hält die Streak.
 *  - Ein Tag ohne Eintrag oder ein "Skip" bricht sie.
 *  - Heute zählt noch nicht als Bruch (der Tag ist ja noch nicht vorbei).
 *  Gezählt werden nur Tage mit Aktivität.
 */
function computeStreaks() {
  const byDay = activitiesByDay();
  const keeps = (key) => byDay.has(key) || state.marks[key] === 'rest';
  const active = (key) => byDay.has(key);

  // Aktuelle Streak
  let current = 0;
  let d = today();
  if (!keeps(ymd(d))) d = addDays(d, -1);
  while (keeps(ymd(d))) {
    if (active(ymd(d))) current++;
    d = addDays(d, -1);
  }

  // Längste Streak
  const keys = [...byDay.keys()].sort();
  let longest = 0;
  if (keys.length) {
    let run = 0;
    const end = today();
    for (let x = parseYmd(keys[0]); x <= end; x = addDays(x, 1)) {
      const k = ymd(x);
      if (keeps(k)) { if (active(k)) run++; longest = Math.max(longest, run); }
      else run = 0;
    }
  }

  // Wochen-Streak (Wochen in Folge mit mind. 1 Aktivität, Mo–So)
  const weeks = new Set(keys.map((k) => ymd(mondayOf(parseYmd(k)))));
  let weekStreak = 0;
  let w = mondayOf(today());
  if (!weeks.has(ymd(w))) w = addDays(w, -7);
  while (weeks.has(ymd(w))) { weekStreak++; w = addDays(w, -7); }

  // Skips der letzten 365 Tage
  const from = ymd(addDays(today(), -364));
  const skips = Object.entries(state.marks).filter(([k, v]) => v === 'skip' && k >= from).length;

  return { current, longest, weekStreak, skips };
}

function sum(list, f) { return list.reduce((a, x) => a + (f(x) || 0), 0); }

/* ---------------- Rendering: Dashboard ---------------- */
function renderDashboard() {
  const s = computeStreaks();
  $('#welcome').classList.toggle('hidden', state.activities.length > 0);
  $('#st-current').textContent = s.current;
  $('#st-longest').textContent = s.longest;
  $('#st-weeks').textContent = s.weekStreak;
  $('#st-skips').textContent = s.skips;
  renderHeatmap();
  renderTotals();
  renderWeekChart();
  renderPRs();
}

function renderHeatmap() {
  const filter = $('#heat-filter').value;
  const byDay = activitiesByDay(filter);
  const end = today();
  const start = addDays(mondayOf(end), -52 * 7); // 53 Wochen, Wochenstart Montag
  const el = $('#heatmap');
  const parts = [];

  // Wochentags-Labels
  ['Mo', '', 'Mi', '', 'Fr', '', ''].forEach((l, i) =>
    parts.push(`<div class="daylbl" style="grid-row:${i + 2}">${l}</div>`));

  // Intensitäts-Stufen anhand Minuten pro Tag (Quantile der eigenen Daten)
  const mins = [];
  for (const list of byDay.values()) mins.push(sum(list, (a) => a.durationSec) / 60);
  mins.sort((a, b) => a - b);
  const q = (p) => mins.length ? mins[Math.min(mins.length - 1, Math.floor(p * mins.length))] : 0;
  const t1 = q(0.25), t2 = q(0.5), t3 = q(0.75);
  const level = (m) => (m <= 0 ? 0 : m <= t1 ? 1 : m <= t2 ? 2 : m <= t3 ? 3 : 4);

  let count = 0, col = 2, lastMonth = -1; // Spalte 1 = Wochentags-Labels
  const todayKey = ymd(end);
  for (let wk = new Date(start); wk <= end; wk = addDays(wk, 7), col++) {
    // Monats-Label in der Woche, die den 1. eines Monats enthält
    const first = [...Array(7)].map((_, i) => addDays(wk, i)).find((x) => x.getDate() === 1);
    if (first && first.getMonth() !== lastMonth) {
      parts.push(`<div class="month" style="grid-column:${col}">${MONTHS[first.getMonth()]}</div>`);
      lastMonth = first.getMonth();
    }
    for (let i = 0; i < 7; i++) {
      const d = addDays(wk, i);
      const k = ymd(d);
      let cls = 'cell';
      let tip;
      if (d > end) cls += ' future';
      const list = byDay.get(k);
      if (list) {
        count += list.length;
        const mm = sum(list, (a) => a.durationSec) / 60;
        const km = sum(list, (a) => a.distanceKm);
        cls += ' l' + level(mm);
        tip = `${list.length} Aktivität${list.length > 1 ? 'en' : ''} · ${Math.round(mm)} min${km ? ' · ' + fmtKm(km) + ' km' : ''}`;
      } else if (state.marks[k] === 'rest') {
        cls += ' rest'; tip = 'Ruhetag';
      } else if (state.marks[k] === 'skip') {
        cls += ' skip'; tip = 'Skip – ausgelassen';
      } else {
        tip = 'Keine Aktivität';
      }
      if (k === todayKey) cls += ' today';
      parts.push(`<div class="${cls}" style="grid-column:${col};grid-row:${i + 2}" data-day="${k}" title="${fmtDate(k)}: ${tip}"></div>`);
    }
  }
  el.innerHTML = parts.join('');
  $('#contrib-title').textContent = `${count} Aktivität${count === 1 ? '' : 'en'} im letzten Jahr`;
  // ans Ende (heute) scrollen
  el.parentElement.scrollLeft = el.parentElement.scrollWidth;
}

function periodStart(p) {
  const t = today();
  if (p === 'week') return mondayOf(t);
  if (p === 'month') return new Date(t.getFullYear(), t.getMonth(), 1);
  return new Date(t.getFullYear(), 0, 1);
}

function renderTotals() {
  const from = ymd(periodStart(period));
  const list = state.activities.filter((a) => a.date >= from);
  const secs = sum(list, (a) => a.durationSec);
  const km = sum(list, (a) => a.distanceKm);
  $('#totals').innerHTML = `
    <div><div class="value">${list.length}</div><div class="label">Aktivitäten</div></div>
    <div><div class="value">${fmtKm(km)}</div><div class="label">km</div></div>
    <div><div class="value">${fmtHours(secs)}</div><div class="label">Zeit</div></div>`;

  const byType = {};
  for (const a of list) byType[a.type] = (byType[a.type] || 0) + a.durationSec;
  const max = Math.max(1, ...Object.values(byType));
  $('#type-breakdown').innerHTML = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .map(([t, sec]) => `<div class="bar-row"><span>${TYPES[t]?.icon || ''} ${TYPES[t]?.name || t}</span>
      <div class="bar"><i style="width:${(sec / max) * 100}%"></i></div><span class="num">${fmtHours(sec)}</span></div>`)
    .join('') || '<p class="muted">Noch keine Aktivitäten in diesem Zeitraum.</p>';
}

function renderWeekChart() {
  const cur = mondayOf(today());
  const weeks = [];
  for (let i = 11; i >= 0; i--) {
    const start = addDays(cur, -7 * i);
    const s = ymd(start), e = ymd(addDays(start, 7));
    const mins = sum(state.activities.filter((a) => a.date >= s && a.date < e), (a) => a.durationSec) / 60;
    weeks.push({ start, mins, cur: i === 0 });
  }
  const max = Math.max(30, ...weeks.map((w) => w.mins));
  $('#weekchart').innerHTML = weeks.map((w) => `
    <div class="wk${w.cur ? ' cur' : ''}" title="Woche ab ${w.start.toLocaleDateString('de-DE')}: ${Math.round(w.mins)} min">
      <span>${w.mins ? Math.round(w.mins) : ''}</span>
      <i style="height:${(w.mins / max) * 100}%"></i>
      <span>${w.start.getDate()}.${w.start.getMonth() + 1}.</span>
    </div>`).join('');
}

function renderPRs() {
  const acts = state.activities;
  const prs = [];
  const best = (list, f) => list.reduce((b, a) => (f(a) > (b ? f(b) : -Infinity) ? a : b), null);

  const runs = acts.filter((a) => a.type === 'run' && a.distanceKm > 0);
  const longestRun = best(runs, (a) => a.distanceKm);
  if (longestRun) prs.push(['Längster Lauf', fmtKm(longestRun.distanceKm) + ' km', longestRun]);

  let fastest = null;
  for (const a of runs) splitPaces(a.splits || [], a.distanceKm).forEach((x, i) => {
    if (!x.partial && (!fastest || x.pace < fastest.sec)) fastest = { sec: x.pace, a, i };
  });
  if (fastest) prs.push(['Schnellster km (Laufen)', fmtDur(fastest.sec) + ' /km', fastest.a, `km ${fastest.i + 1}`]);

  for (const [dist, label] of [[5, '5 km'], [10, '10 km'], [21.1, 'Halbmarathon']]) {
    const cands = runs.filter((a) => a.distanceKm >= dist);
    const b = best(cands, (a) => -a.durationSec / a.distanceKm);
    if (b) prs.push([`Beste Pace ≥ ${label}`, fmtPace('run', b.durationSec / b.distanceKm), b]);
  }

  const rides = acts.filter((a) => a.type === 'ride' && a.distanceKm > 0);
  const longestRide = best(rides, (a) => a.distanceKm);
  if (longestRide) prs.push(['Längste Radtour', fmtKm(longestRide.distanceKm) + ' km', longestRide]);

  const longest = best(acts, (a) => a.durationSec);
  if (longest) prs.push(['Längste Einheit', fmtDur(longest.durationSec), longest]);

  // Aktivster Tag & Monat
  const byDay = activitiesByDay();
  let bestDay = null;
  for (const [k, list] of byDay) {
    const s = sum(list, (a) => a.durationSec);
    if (!bestDay || s > bestDay.s) bestDay = { k, s };
  }
  if (bestDay) prs.push(['Aktivster Tag', fmtHours(bestDay.s), null, fmtDate(bestDay.k)]);

  $('#prs').innerHTML = prs.map(([label, value, a, extra]) => `
    <div class="pr"${a ? ` data-id="${a.id}" style="cursor:pointer"` : ''}>
      <div class="label">${label}</div><div class="value">${value}</div>
      <div class="sub">${a ? esc(a.title) + ' · ' + fmtDate(a.date) : ''}${extra ? (a ? ' · ' : '') + extra : ''}</div>
    </div>`).join('') || '<p class="muted">Trag deine erste Aktivität ein, um Bestleistungen zu sammeln.</p>';
}

/**
 * Splits werden als Sekunden pro Abschnitt gespeichert. Der letzte Abschnitt kann ein
 * angefangener km sein (z.B. 0,73 km) – hier wird er auf Sekunden pro km hochgerechnet.
 * Rückgabe: [{ km: Label, pace: s/km, partial: bool }]
 */
function splitPaces(splits, distanceKm) {
  const full = Math.floor(distanceKm || splits.length);
  return splits.map((s, i) => {
    const part = distanceKm && i === splits.length - 1 && i >= full ? distanceKm - full : 0;
    return part > 0
      ? { km: (full + part).toFixed(2), pace: s / part, partial: true }
      : { km: String(i + 1), pace: s, partial: false };
  });
}

/* ---------------- Rendering: Feed ---------------- */
function miniSplits(a) {
  if (!a.splits || a.splits.length < 2) return '';
  const paces = splitPaces(a.splits, a.distanceKm).map((x) => x.pace);
  const max = Math.max(...paces), min = Math.min(...paces);
  // schnellerer Split = höherer Balken
  return `<div class="mini-splits">${paces.map((s) => {
    const h = max === min ? 70 : 30 + ((max - s) / (max - min)) * 70;
    return `<i class="${s === min ? 'best' : ''}" style="height:${h}%"></i>`;
  }).join('')}</div>`;
}

function renderFeed() {
  const filter = $('#feed-filter').value;
  const list = state.activities
    .filter((a) => !filter || a.type === filter)
    .sort((a, b) => (b.date + (b.createdAt || '')).localeCompare(a.date + (a.createdAt || '')));
  if (!list.length) {
    $('#feed').innerHTML = `<div class="card empty">Noch keine Aktivitäten.<br><br>
      <button class="btn primary" data-goto="add">+ Erste Aktivität eintragen</button></div>`;
    return;
  }
  $('#feed').innerHTML = list.map((a) => {
    const t = TYPES[a.type] || TYPES.other;
    const stats = [`<div><div class="label">Zeit</div><div class="value">${fmtDur(a.durationSec)}</div></div>`];
    if (a.distanceKm) {
      stats.unshift(`<div><div class="label">Distanz</div><div class="value">${fmtKm(a.distanceKm)} km</div></div>`);
      stats.push(`<div><div class="label">${paceLabel(a.type)}</div><div class="value">${fmtPace(a.type, a.durationSec / a.distanceKm)}</div></div>`);
    }
    if (a.feel) stats.push(`<div><div class="label">Gefühl</div><div class="value">${esc(a.feel)}</div></div>`);
    return `<div class="card activity" data-id="${a.id}">
      <div class="act-top"><div class="act-icon">${t.icon}</div>
        <div><div class="act-title">${esc(a.title)}</div><div class="act-meta">${t.name} · ${fmtDate(a.date)}${a.route ? ' · 📍 GPS' : ''}</div></div>
      </div>
      <div class="act-stats">${stats.join('')}</div>
      ${miniSplits(a)}
    </div>`;
  }).join('');
}

/* ---------------- Splits & Route ---------------- */
function splitsTable(type, splits, distanceKm) {
  if (!splits || !splits.length) return '';
  const sp = splitPaces(splits, distanceKm);
  const paces = sp.map((x) => x.pace);
  const min = Math.min(...paces), max = Math.max(...paces);
  const avg = paces.reduce((a, b) => a + b, 0) / paces.length;
  const rows = sp.map(({ km, pace }, i) => {
    const diff = i ? pace - paces[i - 1] : 0;
    const w = max === min ? 80 : 35 + ((max - pace) / (max - min)) * 65;
    return `<tr class="${pace === min && sp.length > 1 ? 'best' : ''}">
      <td>${km}</td>
      <td>${fmtPace(type, pace)}</td>
      <td class="barcell"><div class="sbar" style="width:${w}%"></div></td>
      <td class="diff ${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}">${i ? (diff > 0 ? '+' : diff < 0 ? '−' : '±') + fmtDur(Math.abs(diff)) : ''}</td>
    </tr>`;
  });
  return `<thead><tr><th>km</th><th>${paceLabel(type).replace('Ø ', '')}</th><th></th><th>±</th></tr></thead><tbody>${rows.join('')}</tbody>
    <tfoot><tr><td colspan="4" class="muted">Ø ${fmtPace(type, avg)} · Schnellster ${fmtPace(type, min)} · Langsamster ${fmtPace(type, max)}${
      paces.length > 1 ? ' · ' + splitTrend(paces) : ''}</td></tr></tfoot>`;
}

/** Negativ-Split, wenn die zweite Hälfte schneller war. */
function splitTrend(splits) {
  const h = Math.floor(splits.length / 2);
  const a = splits.slice(0, h).reduce((x, y) => x + y, 0) / h;
  const b = splits.slice(-h).reduce((x, y) => x + y, 0) / h;
  return b < a ? '✅ Negativ-Split' : 'Positiv-Split';
}

function routeSvg(points) {
  if (!points || points.length < 2) return '';
  const lats = points.map((p) => p[0]), lons = points.map((p) => p[1]);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const k = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
  const w = Math.max((maxLon - minLon) * k, 1e-6), h = Math.max(maxLat - minLat, 1e-6);
  const scale = Math.min(280 / w, 180 / h);
  const ox = (300 - w * scale) / 2, oy = (200 - h * scale) / 2;
  const xy = points.map(([la, lo]) => [ox + (lo - minLon) * k * scale, oy + (maxLat - la) * scale]);
  const pts = xy.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ');
  const [s, e] = [xy[0], xy[xy.length - 1]];
  return `<polyline points="${pts}"/><circle class="s" cx="${s[0]}" cy="${s[1]}" r="5"/><circle class="e" cx="${e[0]}" cy="${e[1]}" r="5"/>`;
}

/* ---------------- Modals ---------------- */
function openModal(html) {
  $('#modal-box').innerHTML = html;
  $('#modal').classList.remove('hidden');
}
function closeModal() { $('#modal').classList.add('hidden'); }

function showActivity(id) {
  const a = state.activities.find((x) => x.id === id);
  if (!a) return;
  const t = TYPES[a.type] || TYPES.other;
  const pace = a.distanceKm ? `<div><div class="label">${paceLabel(a.type)}</div><div class="value">${fmtPace(a.type, a.durationSec / a.distanceKm)}</div></div>` : '';
  openModal(`
    <div class="act-top"><div class="act-icon">${t.icon}</div>
      <div><h3>${esc(a.title)}</h3><div class="act-meta">${t.name} · ${fmtDate(a.date)}</div></div></div>
    <div class="act-stats">
      ${a.distanceKm ? `<div><div class="label">Distanz</div><div class="value">${fmtKm(a.distanceKm)} km</div></div>` : ''}
      <div><div class="label">Zeit</div><div class="value">${fmtDur(a.durationSec)}</div></div>
      ${pace}
      ${a.feel ? `<div><div class="label">Gefühl</div><div class="value">${esc(a.feel)}</div></div>` : ''}
    </div>
    ${a.notes ? `<p>${esc(a.notes)}</p>` : ''}
    ${a.route ? `<svg class="route" viewBox="0 0 300 200">${routeSvg(a.route)}</svg>` : ''}
    ${a.splits?.length ? `<h3 style="margin-top:14px">Splits</h3><table class="splits">${splitsTable(a.type, a.splits, a.distanceKm)}</table>` : ''}
    <div class="modal-actions">
      <button class="btn" data-edit="${a.id}">✏️ Bearbeiten</button>
      <button class="btn danger" data-del="${a.id}">🗑 Löschen</button>
      <button class="btn" data-close>Schließen</button>
    </div>`);
}

function showDay(k) {
  const list = state.activities.filter((a) => a.date === k);
  const mark = state.marks[k];
  const isFuture = k > ymd(today());
  openModal(`
    <h3>${fmtDate(k)}</h3>
    <p class="muted">${list.length ? `${list.length} Aktivität(en)` : mark === 'rest' ? '😴 Ruhetag' : mark === 'skip' ? '⏭️ Skip – ausgelassen' : 'Kein Eintrag'}</p>
    ${list.map((a) => `<div class="card activity" data-id="${a.id}" style="margin-bottom:8px;padding:10px">
      ${TYPES[a.type]?.icon || ''} <b>${esc(a.title)}</b> · ${fmtDur(a.durationSec)}${a.distanceKm ? ' · ' + fmtKm(a.distanceKm) + ' km' : ''}</div>`).join('')}
    <div class="modal-actions">
      ${isFuture ? '' : `<button class="btn primary" data-add-day="${k}">+ Aktivität</button>`}
      ${list.length ? '' : `
        <button class="btn" data-mark="${k}:rest">😴 Ruhetag</button>
        <button class="btn" data-mark="${k}:skip">⏭️ Skip</button>
        ${mark ? `<button class="btn" data-mark="${k}:">Markierung entfernen</button>` : ''}`}
      <button class="btn" data-close>Schließen</button>
    </div>`);
}

/* ---------------- Formular ---------------- */
function fillTypeSelects() {
  const opts = Object.entries(TYPES).map(([k, t]) => `<option value="${k}">${t.icon} ${t.name}</option>`).join('');
  $('#add-type').innerHTML = opts;
  $('#rec-type').innerHTML = Object.entries(TYPES).filter(([, t]) => t.distance)
    .map(([k, t]) => `<option value="${k}">${t.icon} ${t.name}</option>`).join('');
  $('#heat-filter').innerHTML += opts;
  $('#feed-filter').innerHTML += opts;
}

function updateDistFields() {
  const hasDist = TYPES[$('#add-type').value]?.distance;
  $$('.dist-field').forEach((el) => el.classList.toggle('hidden', !hasDist));
}

function resetForm(date) {
  const f = $('#add-form');
  f.reset();
  f.id.value = '';
  f.date.value = date || ymd(today());
  $('#form-title').textContent = 'Aktivität eintragen';
  updateDistFields();
}

function editActivity(id) {
  const a = state.activities.find((x) => x.id === id);
  if (!a) return;
  const f = $('#add-form');
  f.id.value = a.id;
  f.type.value = a.type;
  f.title.value = a.title;
  f.date.value = a.date;
  f.duration.value = fmtDur(a.durationSec);
  f.distance.value = a.distanceKm || '';
  f.feel.value = a.feel || '';
  f.splits.value = (a.splits || []).map(fmtDur).join(', ');
  f.notes.value = a.notes || '';
  $('#form-title').textContent = 'Aktivität bearbeiten';
  updateDistFields();
  closeModal();
  showView('add');
}

function defaultTitle(type, date) {
  const h = new Date().getHours();
  const part = h < 11 ? 'Morgen' : h < 14 ? 'Mittags' : h < 18 ? 'Nachmittags' : 'Abend';
  const n = TYPES[type]?.name || 'Training';
  return date === ymd(today()) ? `${part}-${n}` : n;
}

function onSubmit(e) {
  e.preventDefault();
  const f = e.target;
  const durationSec = parseDur(f.duration.value);
  if (!durationSec || durationSec <= 0) return toast('Bitte eine gültige Dauer angeben');
  const type = f.type.value;
  const hasDist = TYPES[type].distance;
  const distanceKm = hasDist ? parseFloat(f.distance.value) || 0 : 0;
  let splits = [];
  if (hasDist && f.splits.value.trim()) {
    splits = f.splits.value.split(/[,;\s]+/).filter(Boolean).map(parseDur);
    if (splits.some((s) => !s || s <= 0)) return toast('Splits bitte als mm:ss, z.B. 5:12, 5:05');
  }
  const existing = state.activities.find((x) => x.id === f.id.value);
  const a = {
    ...(existing || {}),
    id: existing?.id || uid(),
    type,
    title: f.title.value.trim() || defaultTitle(type, f.date.value),
    date: f.date.value,
    durationSec,
    distanceKm,
    splits,
    feel: f.feel.value,
    notes: f.notes.value.trim(),
    createdAt: existing?.createdAt || new Date().toISOString(),
  };
  if (existing) Object.assign(existing, a);
  else state.activities.push(a);
  delete state.marks[a.date]; // Ein Tag mit Aktivität ist kein Skip/Ruhetag mehr
  save();
  toast(existing ? 'Aktivität aktualisiert' : 'Aktivität gespeichert 💪');
  resetForm();
  showView('feed');
}

/* ---------------- GPS-Aufzeichnung ---------------- */
const rec = { running: false, paused: false, startTs: 0, elapsed: 0, dist: 0, last: null, points: [], splits: [], splitStartSec: 0, watch: null, timer: null };

function haversine(a, b) {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (b[0] - a[0]) * toR, dLon = (b[1] - a[1]) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function recElapsed() { return rec.elapsed + (rec.running && !rec.paused ? (Date.now() - rec.startTs) / 1000 : 0); }

function recUpdateUi() {
  const sec = recElapsed();
  const type = $('#rec-type').value;
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  $('#rec-time').textContent = [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
  $('#rec-dist').textContent = rec.dist.toFixed(2);
  $('#rec-pace-label').textContent = paceLabel(type) + (TYPES[type].pace === 'speed' ? '' : ' /km');
  $('#rec-pace').textContent = rec.dist > 0.02 ? fmtPace(type, sec / rec.dist).replace(/ \/(km|100m)$/, '') : '–';
  const partKm = rec.dist - rec.splits.length;
  $('#rec-split').textContent = partKm > 0.02 ? fmtPace(type, (sec - rec.splitStartSec) / partKm).replace(/ \/(km|100m)$/, '') : '–';
}

function onPosition(pos) {
  const { latitude, longitude, accuracy } = pos.coords;
  $('#rec-gps').textContent = `GPS: ±${Math.round(accuracy)} m`;
  if (!rec.running || rec.paused || accuracy > 50) return; // ungenaue Punkte ignorieren
  const p = [latitude, longitude];
  if (rec.last) {
    const d = haversine(rec.last, p);
    if (d < 0.003) return; // < 3 m: Rauschen
    rec.dist += d;
  }
  rec.last = p;
  rec.points.push(p);
  // km-Split abschließen
  while (rec.dist >= rec.splits.length + 1) {
    const now = recElapsed();
    rec.splits.push(Math.round(now - rec.splitStartSec));
    rec.splitStartSec = now;
    toast(`km ${rec.splits.length}: ${fmtDur(rec.splits[rec.splits.length - 1])}`);
    if (navigator.vibrate) navigator.vibrate(200);
  }
  $('#rec-route').innerHTML = routeSvg(rec.points);
  $('#rec-splits').innerHTML = splitsTable($('#rec-type').value, rec.splits);
  recUpdateUi();
}

function recStart() {
  if (!navigator.geolocation) return toast('GPS wird von diesem Gerät nicht unterstützt');
  if (!rec.running) {
    Object.assign(rec, { running: true, paused: false, elapsed: 0, dist: 0, last: null, points: [], splits: [], splitStartSec: 0 });
    $('#rec-route').innerHTML = '';
    $('#rec-splits').innerHTML = '';
    rec.watch = navigator.geolocation.watchPosition(onPosition,
      (err) => { $('#rec-gps').textContent = 'GPS-Fehler: ' + err.message; },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
    rec.timer = setInterval(recUpdateUi, 500);
  } else {
    rec.paused = false;
    rec.last = null; // nach Pause keine "Sprung"-Distanz zählen
  }
  rec.startTs = Date.now();
  $('#rec-start').classList.add('hidden');
  $('#rec-pause').classList.remove('hidden');
  $('#rec-stop').classList.remove('hidden');
  $('#rec-type').disabled = true;
}
function recPause() {
  rec.elapsed = recElapsed();
  rec.paused = true;
  $('#rec-start').textContent = '▶ Weiter';
  $('#rec-start').classList.remove('hidden');
  $('#rec-pause').classList.add('hidden');
}
function recStop() {
  const sec = recElapsed();
  navigator.geolocation.clearWatch(rec.watch);
  clearInterval(rec.timer);
  rec.running = false;
  const type = $('#rec-type').value;
  $('#rec-start').textContent = '▶ Start';
  $('#rec-start').classList.remove('hidden');
  $('#rec-pause').classList.add('hidden');
  $('#rec-stop').classList.add('hidden');
  $('#rec-type').disabled = false;
  if (sec < 10) return toast('Zu kurz – nicht gespeichert');
  // Rest-Split (angefangener km)
  const splits = [...rec.splits];
  if (rec.dist - splits.length > 0.05) splits.push(Math.round(sec - rec.splitStartSec));
  const date = ymd(today());
  // Route ausdünnen, damit localStorage nicht überläuft
  const step = Math.max(1, Math.ceil(rec.points.length / 500));
  const a = {
    id: uid(), type, date, title: defaultTitle(type, date), durationSec: Math.round(sec),
    distanceKm: +rec.dist.toFixed(2), splits, feel: '', notes: '',
    route: rec.points.length > 1 ? rec.points.filter((_, i) => i % step === 0 || i === rec.points.length - 1) : undefined,
    createdAt: new Date().toISOString(),
  };
  state.activities.push(a);
  delete state.marks[date];
  save();
  toast('Aktivität gespeichert 🎉');
  recUpdateUi();
  showView('feed');
  showActivity(a.id);
}

/* ---------------- Demo / Import / Export ---------------- */
function loadDemo() {
  if (state.activities.length && !confirm('Demo-Daten zu deinen bestehenden Daten hinzufügen?')) return;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const t = today();
  for (let i = 300; i >= 0; i--) {
    const d = addDays(t, -i);
    const k = ymd(d);
    const r = Math.random();
    const wd = d.getDay();
    if (r < 0.08) { state.marks[k] = 'skip'; continue; }
    if (wd === 1 && r < 0.6) { state.marks[k] = 'rest'; continue; }
    if (r < 0.3) continue;
    const type = r < 0.6 ? 'run' : r < 0.75 ? 'ride' : r < 0.87 ? 'gym' : r < 0.93 ? 'yoga' : r < 0.97 ? 'swim' : 'hike';
    let distanceKm = 0, durationSec, splits = [];
    if (type === 'run') {
      distanceKm = +(wd === 0 ? rnd(12, 22) : rnd(4, 11)).toFixed(2);
      const base = rnd(285, 340) - (300 - i) * 0.05; // langsam schneller werden
      for (let km = 0; km < Math.floor(distanceKm); km++) splits.push(Math.round(base + rnd(-12, 12) - km * 0.6));
      const rest = distanceKm - Math.floor(distanceKm);
      if (rest > 0.05) splits.push(Math.round(base * rest));
      durationSec = splits.reduce((x, y) => x + y, 0);
    } else if (type === 'ride') {
      distanceKm = +rnd(20, 75).toFixed(2); durationSec = Math.round((distanceKm / rnd(22, 30)) * 3600);
    } else if (type === 'swim') {
      distanceKm = +rnd(1, 3).toFixed(2); durationSec = Math.round(distanceKm * rnd(1100, 1400));
    } else if (type === 'hike') {
      distanceKm = +rnd(8, 18).toFixed(2); durationSec = Math.round(distanceKm * rnd(700, 900));
    } else {
      durationSec = Math.round(rnd(30, 75)) * 60;
    }
    state.activities.push({
      id: uid(), type, date: k, title: defaultTitle(type, '') + (type === 'run' && wd === 0 ? ' – Long Run' : ''),
      durationSec, distanceKm, splits, feel: '', notes: '', createdAt: d.toISOString(), demo: true,
    });
  }
  save();
  renderAll();
  toast('Demo-Daten geladen');
  showView('dashboard');
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `pulse-backup-${ymd(today())}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
function importData(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!Array.isArray(d.activities)) throw new Error();
      state = { activities: d.activities, marks: d.marks || {} };
      save(); renderAll(); toast('Import erfolgreich');
    } catch { toast('Ungültige Datei'); }
  };
  r.readAsText(file);
}

/* ---------------- Navigation & Events ---------------- */
function showView(v) {
  $$('.view').forEach((el) => el.classList.toggle('active', el.id === 'view-' + v));
  $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
  if (v === 'dashboard') renderDashboard();
  if (v === 'feed') renderFeed();
  window.scrollTo(0, 0);
}
function renderAll() { renderDashboard(); renderFeed(); }

function setMark(k, value) {
  if (value) state.marks[k] = value; else delete state.marks[k];
  save();
  renderDashboard();
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-view],[data-goto],[data-day],[data-id],[data-edit],[data-del],[data-close],[data-mark],[data-add-day],[data-p]');
  if (e.target.id === 'modal') return closeModal();
  if (e.target.closest('[data-demo]')) return loadDemo();
  if (!el) return;
  const ds = el.dataset;
  if (ds.view) showView(ds.view);
  else if (ds.goto) showView(ds.goto);
  else if (ds.day) showDay(ds.day);
  else if (ds.edit) editActivity(ds.edit);
  else if (ds.del) {
    if (!confirm('Aktivität wirklich löschen?')) return;
    state.activities = state.activities.filter((a) => a.id !== ds.del);
    save(); closeModal(); renderAll();
  } else if (ds.close !== undefined) closeModal();
  else if (ds.mark !== undefined) { const [k, v] = ds.mark.split(':'); setMark(k, v); closeModal(); }
  else if (ds.addDay) { closeModal(); resetForm(ds.addDay); showView('add'); }
  else if (ds.p) {
    period = ds.p;
    $$('#period-seg button').forEach((b) => b.classList.toggle('active', b === el));
    renderTotals();
  } else if (ds.id) showActivity(ds.id);
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

function init() {
  fillTypeSelects();
  resetForm();
  $('#add-type').addEventListener('change', updateDistFields);
  $('#add-form').addEventListener('submit', onSubmit);
  $('#add-cancel').addEventListener('click', () => { resetForm(); showView('feed'); });
  $('#heat-filter').addEventListener('change', renderHeatmap);
  $('#feed-filter').addEventListener('change', renderFeed);
  $('#rec-start').addEventListener('click', recStart);
  $('#rec-pause').addEventListener('click', recPause);
  $('#rec-stop').addEventListener('click', recStop);
  $('#rec-type').addEventListener('change', recUpdateUi);
  $('#btn-export').addEventListener('click', exportData);
  $('#file-import').addEventListener('change', (e) => e.target.files[0] && importData(e.target.files[0]));
  $('#btn-reset').addEventListener('click', () => {
    if (!confirm('Wirklich ALLE Daten löschen?')) return;
    state = { activities: [], marks: {} }; save(); renderAll(); toast('Alle Daten gelöscht');
  });
  renderAll();
}
init();
