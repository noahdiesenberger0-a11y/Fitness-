'use strict';

/* ============================================================
 *  Pulse – Krafttraining-Tracker
 *  Kern: Daten, Helfer, Streaks, Heatmap, Profil, Verlauf, Cardio.
 *  Daten liegen lokal im Browser (localStorage). Das Datenmodell ist so
 *  angelegt, dass es später 1:1 auf einen Server (Konten, Teilen) passt.
 * ============================================================ */

const STORE_KEY = 'pulse.v2';
const OLD_KEY = 'pulse.v1';
const OLD_PLAN_KEY = 'pulse.strength';
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

/** Cardio ist Nebensache: einfache Einträge ohne GPS */
const CARDIO = {
  run:   { name: 'Laufen', icon: 'run' },
  ride:  { name: 'Radfahren', icon: 'ride' },
  swim:  { name: 'Schwimmen', icon: 'swim' },
  walk:  { name: 'Gehen', icon: 'walk' },
  hike:  { name: 'Wandern', icon: 'hike' },
  yoga:  { name: 'Yoga & Mobility', icon: 'yoga' },
  other: { name: 'Sonstiges', icon: 'bolt' },
};

const VISIBILITY = { public: 'Öffentlich', followers: 'Nur Follower', private: 'Privat' };

/* ---------------- State ---------------- */
function blankState() {
  return {
    version: 2,
    profile: { name: '', visibility: 'public' },
    workouts: [],
    cardio: [],
    splits: [],
    activeSplitId: null,
    customExercises: [],
    marks: {},
    settings: { sound: true, voice: true, vibrate: true, autoRest: true },
    sync: { hashes: {} }, // Stand des Cloud-Abgleichs (cloud.js)
  };
}

/** Wird in init() geladen, wenn alle Skripte (auch exercises.js) bereit sind */
let state = null;
let period = 'week';

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && s.version === 2) return { ...blankState(), ...s, settings: { ...blankState().settings, ...s.settings }, sync: { hashes: {}, ...s.sync } };
  } catch (e) { /* ignore */ }
  return migrate();
}

/**
 * Daten der alten Lauf-App übernehmen:
 *  - Krafttrainings → Trainings (Übungen per Name zugeordnet)
 *  - alle anderen Aktivitäten → Cardio-Einträge
 *  - der alte Kraft-Plan → ein Split „Mein Plan“
 * Die alten Daten bleiben unangetastet gespeichert.
 */
function migrate() {
  const s = blankState();
  let old = null, oldPlan = null;
  try { old = JSON.parse(localStorage.getItem(OLD_KEY)); } catch (e) { /* ignore */ }
  try { oldPlan = JSON.parse(localStorage.getItem(OLD_PLAN_KEY)); } catch (e) { /* ignore */ }
  if (old && Array.isArray(old.activities)) {
    s.marks = old.marks || {};
    for (const a of old.activities) {
      if (a.demo) continue;
      if (a.type === 'gym' && a.exercises?.length) {
        s.workouts.push({
          id: a.id, date: a.date, title: a.title, durationSec: a.durationSec,
          exercises: a.exercises.map((e) => {
            const lib = exByName(e.name);
            return { exId: lib ? lib.id : 'old-' + e.name, name: e.name, sets: e.sets.map((x) => ({ weight: x.weight || 0, reps: x.reps })) };
          }),
          feel: a.feel || '', notes: a.notes || '', visibility: 'public', createdAt: a.createdAt || new Date().toISOString(),
        });
      } else {
        s.cardio.push({
          id: a.id, date: a.date, kind: a.type === 'gym' ? 'other' : (CARDIO[a.type] ? a.type : 'other'),
          title: a.title, durationSec: a.durationSec, distanceKm: a.distanceKm || 0,
          notes: a.notes || '', createdAt: a.createdAt || new Date().toISOString(),
        });
      }
    }
  }
  if (oldPlan && Array.isArray(oldPlan.plan) && oldPlan.plan.length) {
    const split = {
      id: uid(), name: 'Mein Plan', goal: '', level: '', perWeek: 3, description: 'Aus deinem bisherigen Kraft-Plan übernommen.',
      days: [{ id: uid(), name: 'Training', exercises: oldPlan.plan.map((p) => {
        const lib = LIBRARY.find((x) => x.id === p.exId) || exByName(p.name);
        return { exId: lib ? lib.id : 'old-' + p.name, name: p.name, sets: p.sets, repsMin: p.reps, repsMax: p.reps, rest: p.rest || 90, tempo: p.tempo || '2-0-1-0' };
      }) }],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    s.splits.push(split);
    s.activeSplitId = split.id;
    for (const k of ['sound', 'voice', 'vibrate']) if (oldPlan[k] === false) s.settings[k] = false;
  }
  return s;
}

/** Speichert lokal und stößt (wenn angemeldet) den Cloud-Abgleich an. noSync: nur lokal. */
function save(noSync) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { toast('Speichern fehlgeschlagen'); }
  if (!noSync && typeof scheduleSync === 'function') scheduleSync();
}

/* ---------------- Helfer ---------------- */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** Icon aus dem SVG-Set in index.html */
const ic = (name, cls = '') => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
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
  return h ? `${h} h ${m} min` : `${m} min`;
}
function parseDur(str) {
  const p = String(str).trim().split(':').map(Number);
  if (p.some(isNaN)) return NaN;
  if (p.length === 1) return p[0] * 60; // nur Minuten
  return p.reduce((acc, v) => acc * 60 + v, 0);
}
function fmtDate(s, opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) {
  return parseYmd(s).toLocaleDateString('de-DE', opts);
}
/** „Heute“, „Gestern“, sonst Datum */
function fmtDateRel(s) {
  const k = ymd(today());
  if (s === k) return 'Heute';
  if (s === ymd(addDays(today(), -1))) return 'Gestern';
  return fmtDate(s, { weekday: 'short', day: 'numeric', month: 'short' });
}

function toast(msg, kind = '') {
  const t = $('#toast');
  t.innerHTML = msg;
  t.className = 'toast ' + kind;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), kind === 'pr' ? 3200 : 2200);
}
function sum(list, f) { return list.reduce((a, x) => a + (f(x) || 0), 0); }

/** Alle Einträge (Kraft + Cardio) für Kalender und Streaks */
function allEntries() {
  return [
    ...state.workouts.map((w) => ({ ...w, entry: 'strength' })),
    ...state.cardio.map((c) => ({ ...c, entry: 'cardio' })),
  ];
}
function entriesByDay(filter) {
  const map = new Map();
  for (const a of allEntries()) {
    if (filter && a.entry !== filter) continue;
    if (!map.has(a.date)) map.set(a.date, []);
    map.get(a.date).push(a);
  }
  return map;
}

/* ---------------- Streaks ----------------
 *  - Ein Tag mit Training oder als Ruhetag markiert hält die Streak.
 *  - Ein Tag ohne Eintrag oder ein „Skip“ bricht sie.
 *  - Heute zählt noch nicht als Bruch (der Tag ist ja noch nicht vorbei).
 *  Gezählt werden nur Tage mit Training.
 */
function computeStreaks() {
  const byDay = entriesByDay();
  const keeps = (key) => byDay.has(key) || state.marks[key] === 'rest';
  const active = (key) => byDay.has(key);

  let current = 0;
  let d = today();
  if (!keeps(ymd(d))) d = addDays(d, -1);
  while (keeps(ymd(d))) { if (active(ymd(d))) current++; d = addDays(d, -1); }

  const keys = [...byDay.keys()].sort();
  let longest = 0;
  if (keys.length) {
    let run = 0;
    for (let x = parseYmd(keys[0]), end = today(); x <= end; x = addDays(x, 1)) {
      const k = ymd(x);
      if (keeps(k)) { if (active(k)) run++; longest = Math.max(longest, run); } else run = 0;
    }
  }

  const weeks = new Set(keys.map((k) => ymd(mondayOf(parseYmd(k)))));
  let weekStreak = 0;
  let w = mondayOf(today());
  if (!weeks.has(ymd(w))) w = addDays(w, -7);
  while (weeks.has(ymd(w))) { weekStreak++; w = addDays(w, -7); }

  const from = ymd(addDays(today(), -364));
  const skips = Object.entries(state.marks).filter(([k, v]) => v === 'skip' && k >= from).length;
  return { current, longest, weekStreak, skips };
}

/* ---------------- Profil ---------------- */
function renderProfile() {
  const name = state.profile.name || 'Du';
  $('#pf-avatar').textContent = name.trim().charAt(0).toUpperCase() || 'D';
  renderIconPick();
  $('#pf-name').textContent = name;
  $('#pf-vis').value = state.profile.visibility || 'public';
  const n = state.workouts.length;
  $('#pf-sub').textContent = `${n} Training${n === 1 ? '' : 's'} · ${fmtKg(workoutVolume(state.workouts.flatMap((w) => w.exercises)))} bewegt`;

  const s = computeStreaks();
  $('#st-current').textContent = s.current;
  $('#st-unit').textContent = s.current === 1 ? 'Tag' : 'Tage';
  const doneToday = allEntries().some((a) => a.date === ymd(today()));
  $('#st-note').textContent = doneToday
    ? 'Heute erledigt. Morgen geht es weiter.'
    : s.current > 0 ? 'Trainiere heute, um deine Streak zu halten. Ruhetage zählen auch.' : 'Trainiere heute, um eine neue Streak zu starten.';
  $('#st-longest').textContent = s.longest;
  $('#st-weeks').textContent = s.weekStreak;
  $('#st-skips').textContent = s.skips;
  renderHeatmap();
  renderTotals();
  renderHistory();
  renderAccount();
}

function renderHeatmap() {
  const filter = $('#heat-filter').value;
  const byDay = entriesByDay(filter);
  const end = today();
  const start = addDays(mondayOf(end), -52 * 7);
  const parts = [];
  ['Mo', '', 'Mi', '', 'Fr', '', ''].forEach((l, i) => parts.push(`<div class="daylbl" style="grid-row:${i + 2}">${l}</div>`));

  // Stufen nach Minuten pro Tag (Quantile der eigenen Daten)
  const mins = [...byDay.values()].map((l) => sum(l, (a) => a.durationSec) / 60).sort((a, b) => a - b);
  const q = (p) => mins.length ? mins[Math.min(mins.length - 1, Math.floor(p * mins.length))] : 0;
  const t1 = q(0.25), t2 = q(0.5), t3 = q(0.75);
  const level = (m) => (m <= 0 ? 0 : m <= t1 ? 1 : m <= t2 ? 2 : m <= t3 ? 3 : 4);

  let count = 0, col = 2, lastMonth = -1;
  const todayKey = ymd(end);
  for (let wk = new Date(start); wk <= end; wk = addDays(wk, 7), col++) {
    const first = [...Array(7)].map((_, i) => addDays(wk, i)).find((x) => x.getDate() === 1);
    if (first && first.getMonth() !== lastMonth) {
      parts.push(`<div class="month" style="grid-column:${col}">${MONTHS[first.getMonth()]}</div>`);
      lastMonth = first.getMonth();
    }
    for (let i = 0; i < 7; i++) {
      const d = addDays(wk, i);
      const k = ymd(d);
      let cls = 'cell', tip;
      if (d > end) cls += ' future';
      const list = byDay.get(k);
      if (list) {
        count += list.length;
        const mm = sum(list, (a) => a.durationSec) / 60;
        cls += ' l' + level(mm);
        tip = list.map((a) => a.title).join(', ') + ` · ${Math.round(mm)} min`;
      } else if (state.marks[k] === 'rest') { cls += ' rest'; tip = 'Ruhetag'; }
      else if (state.marks[k] === 'skip') { cls += ' skip'; tip = 'Skip – ausgelassen'; }
      else tip = 'Kein Training';
      if (k === todayKey) cls += ' today';
      parts.push(`<div class="${cls}" style="grid-column:${col};grid-row:${i + 2}" data-day="${k}" title="${esc(fmtDate(k))}: ${esc(tip)}"></div>`);
    }
  }
  $('#heatmap').innerHTML = parts.join('');
  $('#contrib-title').textContent = `${count} Einheit${count === 1 ? '' : 'en'} im letzten Jahr`;
  const wrap = $('#heatmap').parentElement;
  wrap.scrollLeft = wrap.scrollWidth;
}

function periodStart(p) {
  const t = today();
  if (p === 'week') return mondayOf(t);
  if (p === 'month') return new Date(t.getFullYear(), t.getMonth(), 1);
  return new Date(t.getFullYear(), 0, 1);
}
function renderTotals() {
  const from = ymd(periodStart(period));
  const ws = state.workouts.filter((w) => w.date >= from);
  const cs = state.cardio.filter((c) => c.date >= from);
  const secs = sum(ws, (w) => w.durationSec) + sum(cs, (c) => c.durationSec);
  $('#totals').innerHTML = `
    <div><div class="value">${ws.length}</div><div class="label">Krafttrainings</div></div>
    <div><div class="value">${fmtKg(workoutVolume(ws.flatMap((w) => w.exercises)))}</div><div class="label">Volumen</div></div>
    <div><div class="value">${fmtHours(secs)}</div><div class="label">Zeit${cs.length ? ` · ${cs.length}× Cardio` : ''}</div></div>`;
}

/* ---------------- Verlauf / Feed-Karten ---------------- */
function workoutCard(w) {
  const sets = workoutSetCount(w.exercises);
  const vol = workoutVolume(w.exercises);
  const groups = {};
  for (const e of w.exercises) {
    const g = exInfo(e.exId, e.name).group;
    groups[g] = (groups[g] || 0) + doneSets(e).length;
  }
  const groupTotal = Object.values(groups).reduce((a, b) => a + b, 0) || 1;
  const lines = w.exercises.slice(0, 3).map((e) => {
    const b = bestOf(e);
    return `<li><span>${esc(e.name)}</span><span class="muted">${doneSets(e).length} × · ${b ? fmtSet(b.set) : '–'}</span></li>`;
  }).join('');
  const more = w.exercises.length > 3 ? `<li class="muted">+ ${w.exercises.length - 3} weitere Übung${w.exercises.length - 3 === 1 ? '' : 'en'}</li>` : '';
  const name = state.profile.name || 'Du';
  return `<article class="card activity" data-workout="${w.id}">
    <div class="act-top">
      <div class="avatar sm" aria-hidden="true">${esc(name.charAt(0).toUpperCase())}</div>
      <div><div class="act-who">${esc(name)}</div><div class="act-meta">${fmtDateRel(w.date)}${w.splitName ? ` · ${esc(w.splitName)}` : ''}</div></div>
    </div>
    <h3 class="act-title">${esc(w.title)}</h3>
    <div class="act-stats">
      <div><div class="label">Dauer</div><div class="value">${fmtDur(w.durationSec)}</div></div>
      <div><div class="label">Volumen</div><div class="value">${vol ? fmtKg(vol) : '–'}</div></div>
      <div><div class="label">Sätze</div><div class="value">${sets}</div></div>
      ${w.prs ? `<div><div class="label">Rekorde</div><div class="value pr-val">${ic('trophy')}${w.prs}</div></div>` : ''}
    </div>
    <div class="muscle-bar" aria-label="Sätze pro Muskelgruppe">${Object.entries(groups).sort((a, b) => b[1] - a[1])
      .map(([g, n]) => `<span style="flex:${n}" title="${GROUPS[g]}: ${n} Sätze"><i></i><small>${GROUPS[g]} ${Math.round((n / groupTotal) * 100)} %</small></span>`).join('')}</div>
    <ul class="ex-lines">${lines}${more}</ul>
  </article>`;
}
function cardioCard(c) {
  const t = CARDIO[c.kind] || CARDIO.other;
  return `<article class="card activity cardio" data-cardio="${c.id}">
    <div class="act-top"><div class="act-icon">${ic(t.icon)}</div>
      <div><div class="act-who">${esc(c.title || t.name)}</div><div class="act-meta">${fmtDateRel(c.date)} · Cardio</div></div></div>
    <div class="act-stats">
      <div><div class="label">Dauer</div><div class="value">${fmtDur(c.durationSec)}</div></div>
      ${c.distanceKm ? `<div><div class="label">Distanz</div><div class="value">${String(c.distanceKm).replace('.', ',')} km</div></div>` : ''}
    </div>
  </article>`;
}
function sortedEntries(filter) {
  return allEntries()
    .filter((a) => !filter || a.entry === filter)
    .sort((a, b) => (b.date + (b.createdAt || '')).localeCompare(a.date + (a.createdAt || '')));
}
function entryCard(a) { return a.entry === 'strength' ? workoutCard(a) : cardioCard(a); }

function renderHistory() {
  const filter = $('#hist-filter').value;
  const list = sortedEntries(filter);
  $('#history').innerHTML = list.length ? list.map(entryCard).join('')
    : `<div class="card empty"><p>Noch keine Einträge.</p></div>`;
}

/* ---------------- Detail-Ansichten ---------------- */
function openModal(html, cls = '') {
  const box = $('#modal-box');
  box.innerHTML = html;
  box.className = 'modal-box ' + cls;
  box.style.transform = ''; box.style.transition = ''; box.scrollTop = 0;
  $('#modal').classList.remove('hidden');
  document.body.classList.add('modal-open');
}
function closeModal() {
  $('#modal').classList.add('hidden');
  document.body.classList.remove('modal-open');
  if (typeof onModalClose === 'function') onModalClose();
}

function showWorkout(id) {
  const w = state.workouts.find((x) => x.id === id);
  if (!w) return;
  const rows = w.exercises.map((e) => {
    const b = bestOf(e);
    return `<div class="wd-ex">
      <div class="wd-head">${exThumb(e.exId, 'wd-thumb')}<div><b>${esc(e.name)}</b>
        <div class="muted">${GROUPS[exInfo(e.exId, e.name).group]}${b && !b.bw ? ` · 1RM ≈ ${fmtW(Math.round(b.score))} kg` : ''}</div></div></div>
      <ol class="wd-sets">${doneSets(e).map((s) => `<li class="${s.pr ? 'pr' : ''}"><span class="num">${fmtSet(s)}</span>${s.pr ? `<span class="pr-tag">${ic('trophy')}Rekord</span>` : ''}</li>`).join('')}</ol>
    </div>`;
  }).join('');
  openModal(`
    <div class="muted">${fmtDate(w.date)}${w.splitName ? ' · ' + esc(w.splitName) : ''} · ${VISIBILITY[w.visibility] || 'Öffentlich'}</div>
    <h3>${esc(w.title)}</h3>
    <div class="act-stats">
      <div><div class="label">Dauer</div><div class="value">${fmtDur(w.durationSec)}</div></div>
      <div><div class="label">Volumen</div><div class="value">${fmtKg(workoutVolume(w.exercises))}</div></div>
      <div><div class="label">Sätze</div><div class="value">${workoutSetCount(w.exercises)}</div></div>
      ${w.feel ? `<div><div class="label">Gefühl</div><div class="value">${esc(w.feel)}</div></div>` : ''}
    </div>
    ${w.notes ? `<p class="notes">${esc(w.notes)}</p>` : ''}
    <div class="wd-list">${rows}</div>
    <div class="modal-actions">
      <button class="btn" data-repeat="${w.id}">${ic('play')}Nochmal machen</button>
      <button class="btn danger" data-del-workout="${w.id}">${ic('trash')}Löschen</button>
      <button class="btn" data-close>Schließen</button>
    </div>`);
}

function showCardio(id) {
  const c = state.cardio.find((x) => x.id === id);
  if (!c) return;
  const t = CARDIO[c.kind] || CARDIO.other;
  openModal(`
    <div class="act-top"><div class="act-icon">${ic(t.icon)}</div>
      <div><h3>${esc(c.title || t.name)}</h3><div class="act-meta">${fmtDate(c.date)} · Cardio</div></div></div>
    <div class="act-stats">
      <div><div class="label">Dauer</div><div class="value">${fmtDur(c.durationSec)}</div></div>
      ${c.distanceKm ? `<div><div class="label">Distanz</div><div class="value">${String(c.distanceKm).replace('.', ',')} km</div></div>` : ''}
    </div>
    ${c.notes ? `<p class="notes">${esc(c.notes)}</p>` : ''}
    <div class="modal-actions">
      <button class="btn" data-edit-cardio="${c.id}">${ic('edit')}Bearbeiten</button>
      <button class="btn danger" data-del-cardio="${c.id}">${ic('trash')}Löschen</button>
      <button class="btn" data-close>Schließen</button>
    </div>`);
}

function showDay(k) {
  const list = allEntries().filter((a) => a.date === k);
  const mark = state.marks[k];
  const isFuture = k > ymd(today());
  openModal(`
    <h3>${fmtDate(k)}</h3>
    <p class="muted">${list.length ? `${list.length} ${list.length === 1 ? 'Einheit' : 'Einheiten'}` : mark === 'rest' ? 'Ruhetag – hält deine Streak' : mark === 'skip' ? 'Skip – ausgelassen' : 'Kein Eintrag'}</p>
    ${list.length ? `<div class="day-list">${list.map((a) => `<div class="day-item" ${a.entry === 'strength' ? `data-workout="${a.id}"` : `data-cardio="${a.id}"`}>
      ${ic(a.entry === 'strength' ? 'dumbbell' : (CARDIO[a.kind]?.icon || 'bolt'))}<span><b>${esc(a.title)}</b> · ${fmtDur(a.durationSec)}</span></div>`).join('')}</div>` : ''}
    <div class="modal-actions">
      ${isFuture ? '' : `<button class="btn" data-cardio-day="${k}">${ic('plus')}Cardio eintragen</button>`}
      ${list.length ? '' : `
        <button class="btn" data-mark="${k}:rest">${ic('moon')}Als Ruhetag markieren</button>
        <button class="btn" data-mark="${k}:skip">${ic('skip')}Als Skip markieren</button>
        ${mark ? `<button class="btn" data-mark="${k}:">Markierung entfernen</button>` : ''}`}
      <button class="btn" data-close>Schließen</button>
    </div>`);
}

/* ---------------- Cardio eintragen ---------------- */
function cardioForm(c, date) {
  openModal(`
    <form class="form" id="cardio-form">
      <h3>${c ? 'Cardio bearbeiten' : 'Cardio eintragen'}</h3>
      <input type="hidden" name="id" value="${c ? c.id : ''}" />
      <label>Art <select name="kind">${Object.entries(CARDIO).map(([k, t]) => `<option value="${k}"${c?.kind === k ? ' selected' : ''}>${t.name}</option>`).join('')}</select></label>
      <div class="row">
        <label>Datum <input type="date" name="date" required value="${c ? c.date : date || ymd(today())}" max="${ymd(today())}" /></label>
        <label>Dauer (min oder h:mm:ss) <input name="duration" required inputmode="numeric" placeholder="30" value="${c ? fmtDur(c.durationSec) : ''}" /></label>
      </div>
      <label>Distanz in km (optional) <input name="distance" type="number" step="0.01" min="0" inputmode="decimal" value="${c?.distanceKm || ''}" /></label>
      <label>Notizen <textarea name="notes" rows="2" placeholder="z. B. lockeres Auslaufen">${esc(c?.notes || '')}</textarea></label>
      <div class="form-actions">
        <button class="btn primary" type="submit">${ic('check')}Speichern</button>
        <button class="btn" type="button" data-close>Abbrechen</button>
      </div>
    </form>`);
}
function onCardioSubmit(f) {
  const durationSec = parseDur(f.duration.value);
  if (!durationSec || durationSec <= 0) return toast('Bitte eine gültige Dauer angeben');
  const existing = state.cardio.find((x) => x.id === f.id.value);
  const c = {
    id: existing?.id || uid(), kind: f.kind.value, title: CARDIO[f.kind.value].name,
    date: f.date.value, durationSec, distanceKm: parseFloat(f.distance.value) || 0,
    notes: f.notes.value.trim(), createdAt: existing?.createdAt || new Date().toISOString(),
  };
  if (existing) Object.assign(existing, c); else state.cardio.push(c);
  delete state.marks[c.date];
  save();
  closeModal();
  toast(existing ? 'Gespeichert' : 'Cardio eingetragen');
  renderCurrent();
}

/* ---------------- Demo / Import / Export ---------------- */
/**
 * Beispieldaten: 16 Wochen Push/Pull/Legs mit echter Progression
 * (Gewichte steigen langsam, ab und zu ein schlechter Tag), dazu etwas Cardio.
 */
function loadDemo() {
  if ((state.workouts.length || state.cardio.length) && !confirm('Beispieldaten zu deinen bestehenden Daten hinzufügen?')) return;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const round = (x) => Math.round(x / 2.5) * 2.5;
  const split = cloneSplit(TEMPLATES[0], { source: { templateId: 'tpl-ppl' }, demo: true });
  state.splits.push(split);
  state.activeSplitId = split.id;
  const start = { bench: 55, ohp: 35, incline: 40, lateral: 7, triceps: 20, deadlift: 85, pullup: 0, row: 50, facepull: 15, curl: 10,
    squat: 65, rdl: 60, legpress: 110, legcurl: 30, calf: 40 };
  const weekly = { bench: 0.9, ohp: 0.45, incline: 0.7, lateral: 0.08, triceps: 0.35, deadlift: 1.6, row: 0.8, facepull: 0.2, curl: 0.15,
    squat: 1.4, rdl: 1.1, legpress: 2.2, legcurl: 0.5, calf: 0.8 };
  let dayIdx = 0;
  const t = today();
  for (let i = 16 * 7; i >= 1; i--) {
    const d = addDays(t, -i);
    const k = ymd(d);
    const wd = d.getDay();
    const week = (16 * 7 - i) / 7;
    if (wd === 0) { if (Math.random() < 0.7) state.marks[k] = 'rest'; continue; }
    if (Math.random() < 0.12) { state.marks[k] = 'skip'; continue; }
    if (wd === 3 && Math.random() < 0.5) {
      state.cardio.push({ id: uid(), kind: 'run', title: 'Laufen', date: k, durationSec: Math.round(rnd(22, 40)) * 60,
        distanceKm: +rnd(4, 7).toFixed(1), notes: '', createdAt: d.toISOString(), demo: true });
      continue;
    }
    const day = split.days[dayIdx % 3];
    dayIdx++;
    const bad = Math.random() < 0.1;
    const exercises = day.exercises.map((e) => {
      const base = e.exId === 'pullup' ? 0 : round(start[e.exId] + weekly[e.exId] * week * (bad ? 0.9 : 1));
      const sets = [];
      for (let s = 0; s < e.sets; s++) {
        const reps = Math.max(e.repsMin - 1, Math.round(e.repsMax - s * rnd(0.3, 1.2) - (bad ? 1 : 0)));
        sets.push({ weight: base, reps: e.exId === 'pullup' ? Math.round(5 + week * 0.3 - s) : reps });
      }
      return { exId: e.exId, name: e.name, sets };
    });
    state.workouts.push({
      id: uid(), date: k, title: day.name, splitId: split.id, dayId: day.id, splitName: split.name,
      durationSec: Math.round(rnd(48, 75)) * 60, exercises, feel: '', notes: '', visibility: 'public',
      createdAt: new Date(d.getTime() + 18 * 3600e3).toISOString(), demo: true,
    });
  }
  markAllPRs();
  save();
  toast('Beispieldaten geladen');
  showView('train');
}

/** Rekorde für alle Trainings neu berechnen (nach Import, Demo, Löschen) */
function markAllPRs() {
  const best = {};
  const list = [...state.workouts].sort((a, b) => (a.date + a.createdAt).localeCompare(b.date + b.createdAt));
  for (const w of list) {
    let n = 0;
    for (const e of w.exercises) {
      for (const s of e.sets) {
        delete s.pr;
        if (!(s.reps > 0)) continue;
        const score = s.weight ? e1rm(s.weight, s.reps) : s.reps;
        const key = e.exId + (s.weight ? '' : ':bw');
        if (best[key] !== undefined && score > best[key] + 0.01) { s.pr = true; n++; }
        if (best[key] === undefined || score > best[key]) best[key] = score;
      }
    }
    w.prs = n;
  }
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
      if (d.version === 2 && Array.isArray(d.workouts)) { const sync = state.sync; state = { ...blankState(), ...d, sync }; }
      else if (Array.isArray(d.activities)) {
        // Backup der alten Lauf-App
        localStorage.setItem(OLD_KEY, JSON.stringify(d));
        const sync = state.sync;
        state = migrate();
        state.sync = sync;
      } else throw new Error();
      markAllPRs();
      save(); toast('Import erfolgreich'); renderCurrent();
    } catch { toast('Ungültige Datei'); }
  };
  r.readAsText(file);
}

/* ---------------- Navigation ---------------- */
let currentView = 'train';
const VIEWS = ['train', 'splits', 'discover', 'progress', 'profile', 'split-edit'];
const VIEW_TITLES = { train: 'Training', splits: 'Splits', discover: 'Entdecken', progress: 'Fortschritt', profile: 'Profil', 'split-edit': 'Split' };
const PUSHED = { 'split-edit': 'splits' }; // Unterseiten: Zurück führt zu diesem Tab
const scrollMemory = {};

function showView(v) {
  if (!VIEWS.includes(v)) v = 'train';
  const same = v === currentView;
  if (!same) scrollMemory[currentView] = window.scrollY;
  currentView = v;
  $$('.view').forEach((el) => el.classList.toggle('active', el.id === 'view-' + v));
  const tab = PUSHED[v] || v;
  $$('#tabs button').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === tab);
    if (b.dataset.view === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  $('#nav-title').textContent = v === 'split-edit' ? $('#se-title').textContent : VIEW_TITLES[v] || '';
  $('#nav-back').classList.toggle('hidden', !PUSHED[v]);
  document.body.classList.toggle('pushed', !!PUSHED[v]);
  renderCurrent();
  if (!same) window.scrollTo(0, PUSHED[v] ? 0 : scrollMemory[v] || 0);
  onScroll();
}
function onScroll() { document.body.classList.toggle('scrolled', window.scrollY > 36); }

/* ---------------- Filter-Chips (ersetzen Auswahlfelder) ---------------- */
function buildChips() {
  $$('.chips[data-for]').forEach((box) => {
    const sel = document.getElementById(box.dataset.for);
    box.innerHTML = [...sel.options].map((o) =>
      `<button type="button" data-chip="${o.value}" aria-pressed="${o.value === sel.value}">${esc(o.text)}</button>`).join('');
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-chip]');
      if (!b) return;
      sel.value = b.dataset.chip;
      box.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b));
      sel.dispatchEvent(new Event('change'));
    });
  });
}

/* ---------------- Profil: App-Icon ---------------- */
const APP_ICONS = { blau: 'Blau', hellblau: 'Hellblau' };
function renderIconPick() {
  const c = document.documentElement.dataset.color || 'blau';
  $('#color-pick').innerHTML = Object.entries(APP_ICONS).map(([k, name]) =>
    `<button class="color-opt" role="radio" aria-checked="${k === c}" data-color="${k}">
      <img src="icons/${k}/icon-192.png" alt="" width="60" height="60" /><span>${name}</span></button>`).join('');
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  $('#color-hint').textContent = standalone
    ? 'Für das neue Icon auf dem Home-Bildschirm: Pulse dort entfernen und über Teilen → „Zum Home-Bildschirm“ neu hinzufügen. Deine Daten bleiben erhalten.'
    : 'Dieses Icon bekommt Pulse, wenn du es zum Home-Bildschirm hinzufügst.';
}
function setAppIcon(c) {
  if (!APP_ICONS[c]) return;
  document.documentElement.dataset.color = c;
  try { localStorage.setItem('pulse.color', c); } catch (e) { /* ignore */ }
  $('#l-manifest').href = `manifest-${c}.json`;
  $('#l-favicon').href = `icons/${c}/favicon-32.png`;
  $('#l-touch').href = `icons/${c}/apple-touch-icon.png`;
  $('#install-icon').src = `icons/${c}/icon-192.png`;
  haptic();
  renderIconPick();
}
function haptic() { try { navigator.vibrate && navigator.vibrate(8); } catch (e) { /* ignore */ } }

/* ---------------- Bottom-Sheet nach unten wegwischen ---------------- */
function setupSheetSwipe() {
  const box = $('#modal-box');
  let y0 = null, dy = 0;
  box.addEventListener('touchstart', (e) => {
    y0 = box.scrollTop <= 0 && !e.target.closest('input, textarea, select') ? e.touches[0].clientY : null; dy = 0;
  }, { passive: true });
  box.addEventListener('touchmove', (e) => {
    if (y0 === null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    if (dy > 0) { box.style.transition = 'none'; box.style.transform = `translateY(${dy}px)`; }
  }, { passive: true });
  box.addEventListener('touchend', () => {
    if (y0 === null) return;
    box.style.transition = 'transform 220ms cubic-bezier(.22, 1, .36, 1)';
    if (dy > 110) { box.style.transform = 'translateY(100%)'; setTimeout(closeModal, 180); }
    else box.style.transform = '';
    y0 = null;
  });
}

function renderCurrent() {
  if (currentView === 'train') renderTrain();
  if (currentView === 'splits') renderSplits();
  if (currentView === 'progress') renderProgress();
  if (currentView === 'discover') renderDiscoverView();
  if (currentView === 'profile') renderProfile();
}

function setMark(k, value) {
  if (value) state.marks[k] = value; else delete state.marks[k];
  save();
  renderCurrent();
}

document.addEventListener('click', (e) => {
  if (e.target.id === 'modal') return closeModal();
  const ico = e.target.closest('.color-opt');
  if (ico) return setAppIcon(ico.dataset.color);
  const el = e.target.closest('[data-view],[data-day],[data-workout],[data-cardio],[data-close],[data-mark],[data-cardio-day],[data-p],[data-del-workout],[data-del-cardio],[data-edit-cardio],[data-repeat],[data-demo],[data-new-cardio]');
  if (!el) return;
  const ds = el.dataset;
  if (ds.view) {
    haptic();
    // Erneutes Tippen auf den aktiven Tab scrollt nach oben
    if (el.closest('#tabs') && ds.view === currentView) window.scrollTo({ top: 0, behavior: 'smooth' });
    else showView(ds.view);
  }
  else if (ds.demo !== undefined) loadDemo();
  else if (ds.newCardio !== undefined) cardioForm(null);
  else if (ds.day) showDay(ds.day);
  else if (ds.workout) showWorkout(ds.workout);
  else if (ds.cardio) showCardio(ds.cardio);
  else if (ds.close !== undefined) closeModal();
  else if (ds.mark !== undefined) { const [k, v] = ds.mark.split(':'); setMark(k, v); closeModal(); }
  else if (ds.cardioDay) cardioForm(null, ds.cardioDay);
  else if (ds.editCardio) cardioForm(state.cardio.find((c) => c.id === ds.editCardio));
  else if (ds.delWorkout) {
    if (!confirm('Training wirklich löschen?')) return;
    state.workouts = state.workouts.filter((w) => w.id !== ds.delWorkout);
    markAllPRs(); save(); closeModal(); renderCurrent();
  } else if (ds.delCardio) {
    if (!confirm('Eintrag wirklich löschen?')) return;
    state.cardio = state.cardio.filter((c) => c.id !== ds.delCardio);
    save(); closeModal(); renderCurrent();
  } else if (ds.repeat) { closeModal(); repeatWorkout(ds.repeat); }
  else if (ds.p) {
    period = ds.p;
    $$('#period-seg button').forEach((b) => b.classList.toggle('active', b === el));
    renderTotals();
  }
});
document.addEventListener('submit', (e) => {
  if (e.target.getAttribute('id') === 'cardio-form') { e.preventDefault(); onCardioSubmit(e.target); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').classList.contains('hidden')) closeModal(); });

function init() {
  state = load();
  $('#heat-filter').addEventListener('change', renderHeatmap);
  $('#hist-filter').addEventListener('change', renderHistory);
  $('#pf-vis').addEventListener('change', (e) => { state.profile.visibility = e.target.value; save(); toast('Gespeichert'); });
  $('#pf-edit').addEventListener('click', () => {
    const n = prompt('Wie sollen andere dich sehen? (Name)', state.profile.name || '');
    if (n === null) return;
    state.profile.name = n.trim().slice(0, 40);
    save(); renderProfile();
  });
  for (const k of ['sound', 'voice', 'vibrate', 'autoRest']) {
    const el = $('#set-' + k);
    el.checked = state.settings[k] !== false;
    el.addEventListener('change', () => { state.settings[k] = el.checked; save(); });
  }
  $('#btn-export').addEventListener('click', exportData);
  $('#file-import').addEventListener('change', (e) => e.target.files[0] && importData(e.target.files[0]));
  $('#btn-reset').addEventListener('click', () => {
    const online = typeof user !== 'undefined' && user;
    if (!confirm(online ? 'Wirklich ALLE Daten löschen? Auch in der Cloud – auf allen Geräten.' : 'Wirklich ALLE Daten löschen? Trainings, Splits und Einstellungen.')) return;
    const sync = state.sync;
    state = blankState();
    if (online) state.sync = sync; // so werden die Löschungen in die Cloud übertragen
    save(); toast('Alle Daten gelöscht'); showView('train');
  });
  initWorkout();
  initSplits();
  initProgress();
  save(true); // übernommene Daten sofort im neuen Format sichern
  initCloud();
  buildChips();
  $('#nav-back').addEventListener('click', () => showView(PUSHED[currentView] || 'train'));
  window.addEventListener('scroll', onScroll, { passive: true });
  setupSheetSwipe();
  const hashView = location.hash.slice(1);
  showView(VIEWS.includes(hashView) && hashView !== 'split-edit' ? hashView : 'train');
  restoreWorkout();
  setupInstall();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

/* ---------------- Installation als App ---------------- */
function setupInstall() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) return;
  let deferred = null;
  const box = $('#install');
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  let dismissed = false;
  try { dismissed = localStorage.getItem('pulse.install.dismissed') === '1'; } catch (e) { /* ignore */ }
  if (dismissed) return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    $('#install-text').textContent = 'Installiere Pulse auf deinem Home-Bildschirm – wie eine echte App.';
    $('#install-btn').classList.remove('hidden');
    box.classList.remove('hidden');
  });
  if (isIos) {
    $('#install-text').innerHTML = 'Als App installieren: tippe unten auf <b>Teilen</b> <svg class="ios-share" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5v10h14V11h-1"/></svg> und dann auf <b>„Zum Home-Bildschirm“</b>.';
    box.classList.remove('hidden');
  }
  $('#install-btn').addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    box.classList.add('hidden');
  });
  $('#install-close').addEventListener('click', () => {
    box.classList.add('hidden');
    try { localStorage.setItem('pulse.install.dismissed', '1'); } catch (e) { /* ignore */ }
  });
  window.addEventListener('appinstalled', () => box.classList.add('hidden'));
}

document.addEventListener('DOMContentLoaded', init);
