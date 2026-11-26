'use strict';

/* ============================================================
 *  Pulse Gym – Trainings-App fürs Fitnessstudio
 *  Daten liegen nur lokal im Browser (localStorage).
 * ============================================================ */

const STORE_KEY = 'pulse.gym.v1';
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const MONTHS_LONG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/* ---------------- Helfer ---------------- */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ic = (name, cls = '') => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const sum = (list, f) => list.reduce((a, x) => a + (f(x) || 0), 0);

function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function today() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function mondayOf(d) { const r = new Date(d); r.setHours(0, 0, 0, 0); r.setDate(r.getDate() - ((r.getDay() + 6) % 7)); return r; }

function fmtDur(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
function fmtHours(sec) { const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); return h ? `${h} h ${m} min` : `${m} min`; }
const fmtW = (w) => String(Math.round((w || 0) * 100) / 100).replace('.', ',');
function fmtKg(kg) { return kg >= 1000 ? (kg / 1000).toFixed(1).replace('.', ',') + ' t' : Math.round(kg) + ' kg'; }
const parseNum = (v) => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : 0; };
function fmtDate(s) { return parseYmd(s).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); }
function fmtDateShort(s) {
  const d = parseYmd(s), diff = Math.round((today() - d) / 86400000);
  if (diff === 0) return 'heute';
  if (diff === 1) return 'gestern';
  if (diff < 7) return `vor ${diff} Tagen`;
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}
/** Geschätztes Maximalgewicht für 1 Wiederholung (Epley-Formel) */
const e1rm = (w, r) => (r <= 1 ? w : w * (1 + Math.min(r, 12) / 30));

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), 2600);
}

/* ---------------- Daten ---------------- */
function defaultDb() {
  return {
    v: 1,
    profile: { name: '', goal: 'muscle', days: 3, onboarded: false },
    settings: { sound: true, voice: true, vibrate: true, weekGoal: 3, rest: 90, bar: 20 },
    routines: [], workouts: [], custom: [], body: [], active: null,
  };
}
let db = null; // wird in init() geladen, wenn auch workout.js (Übungskatalog) bereit ist

function loadDb() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE_KEY));
    if (d && Array.isArray(d.workouts)) {
      const def = defaultDb();
      return { ...def, ...d, profile: { ...def.profile, ...d.profile }, settings: { ...def.settings, ...d.settings } };
    }
  } catch (e) { /* ignore */ }
  return migrateOld(defaultDb());
}
function saveDb() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); }
  catch (e) { toast('Speichern fehlgeschlagen – Speicher voll?'); }
}

/** Krafttrainings aus der alten Pulse-Version übernehmen (Laufen, Rad usw. fallen weg) */
function migrateOld(d) {
  try {
    const old = JSON.parse(localStorage.getItem('pulse.v1'));
    const byName = (name) => {
      const alias = { 'Trizepsdrücken': 'triceps', 'Schulterdrücken': 'ohp' };
      if (alias[name]) return alias[name];
      const hit = CATALOG.find((e) => e.name === name);
      if (hit) return hit.id;
      let c = d.custom.find((x) => x.name === name);
      if (!c) { c = { id: 'c_' + uid(), name, g: 'Sonstiges' }; d.custom.push(c); }
      return c.id;
    };
    for (const a of old?.activities || []) {
      if (!a.exercises?.length) continue;
      d.workouts.push({
        id: a.id, date: a.date, routineId: null, title: a.title, durationSec: a.durationSec, feel: a.feel || '', notes: a.notes || '',
        exercises: a.exercises.map((e) => ({ exId: byName(e.name), name: e.name, tempo: e.tempo,
          sets: e.sets.map((s) => ({ weight: s.weight || 0, reps: s.reps, target: s.target || s.reps })) })),
        createdAt: a.createdAt,
      });
    }
    const st = JSON.parse(localStorage.getItem('pulse.strength'));
    if (st?.plan?.length) {
      d.routines.push({ id: uid(), name: 'Mein Plan', ex: st.plan.map((p) => ({
        exId: EX[p.exId] && p.exId !== 'custom' ? p.exId : byName(p.name), sets: p.sets, reps: p.reps, weight: p.weight || 0, rest: p.rest || 90, tempo: p.tempo || '3-1-1-0' })) });
    }
    if (d.workouts.length || d.routines.length) d.profile.onboarded = true;
  } catch (e) { /* keine alten Daten */ }
  return d;
}

/* ---------------- Auswertungen ---------------- */
const sortedWorkouts = () => [...db.workouts].sort((a, b) => (b.date + (b.createdAt || '')).localeCompare(a.date + (a.createdAt || '')));
const workoutVolume = (w) => sum(w.exercises, (e) => sum(e.sets, (s) => (s.weight || 0) * s.reps));
const workoutSets = (w) => sum(w.exercises, (e) => e.sets.length);

/** Bester Satz einer Übung über alle gespeicherten Trainings (nach geschätztem 1RM) */
function bestFor(exId) {
  let best = null;
  for (const w of db.workouts) for (const e of w.exercises) {
    if (e.exId !== exId) continue;
    for (const s of e.sets) {
      if (!s.weight || !s.reps) continue;
      const v = e1rm(s.weight, s.reps);
      if (!best || v > best.e1rm) best = { e1rm: v, weight: s.weight, reps: s.reps, date: w.date, wid: w.id };
    }
  }
  return best;
}

function weekCounts() {
  const m = {};
  for (const w of db.workouts) { const k = ymd(mondayOf(parseYmd(w.date))); m[k] = (m[k] || 0) + 1; }
  return m;
}
/** Wochen in Folge, in denen das Wochenziel erreicht wurde. Die laufende Woche bricht die Serie noch nicht. */
function weekStreak() {
  const c = weekCounts(), goal = db.settings.weekGoal;
  let w = mondayOf(today()), n = 0;
  if ((c[ymd(w)] || 0) >= goal) n++;
  w = addDays(w, -7);
  while ((c[ymd(w)] || 0) >= goal) { n++; w = addDays(w, -7); }
  let longest = 0, run = 0;
  const keys = Object.keys(c).sort();
  if (keys.length) for (let x = parseYmd(keys[0]); x <= today(); x = addDays(x, 7)) {
    if ((c[ymd(x)] || 0) >= goal) { run++; longest = Math.max(longest, run); } else if (ymd(x) !== ymd(mondayOf(today()))) run = 0;
  }
  return { current: n, longest };
}

/* ---------------- Ton, Sprache, Vibration ---------------- */
let audioCtx = null;
function ensureAudio() {
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch (e) { audioCtx = null; }
}
function beep(freq = 880, ms = 90, vol = 0.18) {
  if (!db.settings.sound || !audioCtx) return;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.frequency.value = freq; o.type = 'sine';
  g.gain.setValueAtTime(vol, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + ms / 1000);
  o.connect(g).connect(audioCtx.destination);
  o.start(); o.stop(audioCtx.currentTime + ms / 1000 + 0.02);
}
function say(text) {
  if (!db.settings.voice || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'de-DE'; u.rate = 1.1;
  speechSynthesis.speak(u);
}
function buzz(p) { if (db.settings.vibrate && navigator.vibrate) navigator.vibrate(p); }

/* ---------------- Diagramme ---------------- */
function lineChart(points, fmt) {
  if (points.length < 2) return '';
  const W = 320, H = 130, pl = 6, pr = 6, pt = 18, pb = 22;
  const ys = points.map((p) => p.y);
  let min = Math.min(...ys), max = Math.max(...ys);
  if (max - min < 1) { max += 1; min -= 1; }
  const x = (i) => pl + (i / (points.length - 1)) * (W - pl - pr);
  const y = (v) => pt + (1 - (v - min) / (max - min)) * (H - pt - pb);
  const pts = points.map((p, i) => `${x(i).toFixed(1)},${y(p.y).toFixed(1)}`);
  const last = points[points.length - 1], first = points[0];
  const delta = last.y - first.y;
  return `<div class="linechart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Verlauf von ${fmt(first.y)} auf ${fmt(last.y)}">
    <polyline class="lc-area" points="${pl},${H - pb} ${pts.join(' ')} ${W - pr},${H - pb}"/>
    <polyline class="lc-line" points="${pts.join(' ')}"/>
    ${points.map((p, i) => `<circle class="lc-dot${i === points.length - 1 ? ' last' : ''}" cx="${x(i).toFixed(1)}" cy="${y(p.y).toFixed(1)}" r="${i === points.length - 1 ? 4.5 : 2.5}"/>`).join('')}
    <text x="${pl}" y="${H - 6}" class="lc-lbl">${fmtDateShort(first.x)}</text>
    <text x="${W - pr}" y="${H - 6}" class="lc-lbl" text-anchor="end">${fmtDateShort(last.x)}</text>
  </svg><div class="lc-sum"><b>${fmt(last.y)}</b> <span class="${delta >= 0 ? 'pos' : 'neg'}">${delta >= 0 ? '+' : '−'}${fmt(Math.abs(delta))}</span> <span class="muted">seit ${fmtDateShort(first.x)}</span></div></div>`;
}

/* ================================================================
 *  HEUTE
 * ================================================================ */
function renderHome() {
  const h = new Date().getHours();
  const greet = h < 11 ? 'Guten Morgen' : h < 18 ? 'Hallo' : 'Guten Abend';
  $('#home-date').textContent = today().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#h-home').textContent = db.profile.name ? `${greet}, ${db.profile.name}` : greet;
  const parts = [];

  if (db.active) {
    const { all, done } = workoutCounts();
    parts.push(`<article class="card hero live">
      <div class="label"><span class="live-dot"></span>Training läuft</div>
      <h2 class="hero-title">${esc(db.active.title)}</h2>
      <div class="muted">${done} von ${all} Sätzen erledigt</div>
      <div class="bar big"><i style="width:${all ? (done / all) * 100 : 0}%"></i></div>
      <button class="btn primary xl wide" data-view="workout">${ic('play')}Weiter trainieren</button>
    </article>`);
  } else {
    const r = nextRoutine();
    if (r) {
      const ups = r.ex.filter((e) => suggestFor(e.exId, e.reps)?.up).length;
      parts.push(`<article class="card hero">
        <div class="label">Nächstes Training</div>
        <h2 class="hero-title">${esc(r.name)}</h2>
        <div class="muted">${r.ex.length} Übungen · ca. ${routineMinutes(r)} min · ${routineGroups(r).join(', ')}</div>
        <ol class="hero-ex">${r.ex.map((e) => {
          const sug = suggestFor(e.exId, e.reps);
          const w = sug ? sug.weight : e.weight;
          return `<li>${exThumb(e.exId)}<span class="grow">${esc(exName(e.exId))}</span>
            <span class="num hero-sets">${e.sets} × ${sug?.reps || e.reps}${w ? ` · ${fmtW(w)} kg` : ''}${sug?.up ? ic('trend', 'up') : ''}</span></li>`;
        }).join('')}</ol>
        ${ups ? `<p class="hero-note">${ic('trend')}Bei ${ups} ${ups === 1 ? 'Übung' : 'Übungen'} darfst du heute steigern – die Gewichte sind schon eingetragen.</p>` : ''}
        <button class="btn primary xl wide" data-start="${r.id}">${ic('play')}Training starten</button>
        <div class="hero-alt">
          ${db.routines.length > 1 ? `<button class="link-btn" data-choose>Anderen Plan wählen</button>` : ''}
          <button class="link-btn" data-free>Freies Training ohne Plan</button>
        </div>
      </article>`);
    } else {
      parts.push(`<article class="card hero">
        <div class="label">Los geht's</div>
        <h2 class="hero-title">Leg deinen ersten Trainingsplan an</h2>
        <p class="muted">Nimm eine fertige Vorlage oder stell dir deine Übungen selbst zusammen.</p>
        <button class="btn primary xl wide" data-view="plans">${ic('plans')}Plan auswählen</button>
        <div class="hero-alt"><button class="link-btn" data-free>Freies Training ohne Plan</button></div>
      </article>`);
    }
  }

  // Woche
  const mon = mondayOf(today());
  const days = [...Array(7)].map((_, i) => addDays(mon, i));
  const byDay = new Set(db.workouts.map((w) => w.date));
  const n = db.workouts.filter((w) => w.date >= ymd(mon)).length;
  const goal = db.settings.weekGoal;
  const st = weekStreak();
  const msg = n >= goal ? 'Wochenziel erreicht! Alles Weitere ist Bonus.'
    : `Noch ${goal - n} ${goal - n === 1 ? 'Training' : 'Trainings'} bis zum Wochenziel${st.current ? ' – so hältst du deine Serie' : ''}.`;
  parts.push(`<article class="card week">
    <div class="card-head"><h2>Diese Woche</h2>
      <span class="streak-pill${st.current ? ' on' : ''}">${ic('flame')}${st.current} ${st.current === 1 ? 'Woche' : 'Wochen'} in Folge</span></div>
    <div class="week-days">${days.map((d, i) => {
      const k = ymd(d), did = byDay.has(k), isT = k === ymd(today());
      return `<button class="wd${did ? ' done' : ''}${isT ? ' today' : ''}${d > today() ? ' future' : ''}" data-day="${k}" aria-label="${fmtDate(k)}${did ? ': trainiert' : ''}">
        <span>${WD[i]}</span><i>${did ? ic('check') : d.getDate()}</i></button>`;
    }).join('')}</div>
    <div class="goal-line"><div class="bar"><i style="width:${Math.min(100, (n / goal) * 100)}%"></i></div><span class="num"><b>${n}</b> / ${goal}</span></div>
    <p class="muted">${msg}</p>
  </article>`);

  const list = sortedWorkouts();
  if (!list.length) {
    parts.push(`<article class="card how">
      <h2>So funktioniert Pulse Gym</h2>
      <ol class="steps">
        <li><b>Training starten</b><span>Dein Plan ist oben schon bereit. Ein Tipp auf „Training starten“ genügt.</span></li>
        <li><b>Sätze abhaken</b><span>Gewicht und Wiederholungen eintragen, Haken setzen – die Satzpause läuft automatisch.</span></li>
        <li><b>Stärker werden</b><span>Schaffst du alle Wiederholungen, schlägt dir die App beim nächsten Mal mehr Gewicht vor.</span></li>
      </ol>
      <button class="btn" data-demo>Erst mal mit Beispieldaten umschauen</button>
    </article>`);
  } else {
    // Monat im Vergleich
    const t = today();
    const mStart = ymd(new Date(t.getFullYear(), t.getMonth(), 1));
    const pStart = ymd(new Date(t.getFullYear(), t.getMonth() - 1, 1));
    const pEnd = ymd(addDays(new Date(t.getFullYear(), t.getMonth() - 1, 1), t.getDate()));
    const cur = db.workouts.filter((w) => w.date >= mStart);
    const prevSame = db.workouts.filter((w) => w.date >= pStart && w.date < pEnd);
    const vol = sum(cur, workoutVolume), pvol = sum(prevSame, workoutVolume);
    const last = list[0];
    parts.push(`<div class="grid2">
      <article class="card">
        <div class="card-head"><h2>${MONTHS_LONG[t.getMonth()]}</h2>${pvol ? `<span class="delta ${vol >= pvol ? 'pos' : 'neg'}">${vol >= pvol ? '+' : '−'}${Math.abs(Math.round((vol / pvol - 1) * 100))} % ggü. Vormonat</span>` : ''}</div>
        <div class="totals">
          <div><div class="value">${cur.length}</div><div class="label">Trainings</div></div>
          <div><div class="value">${fmtKg(vol)}</div><div class="label">bewegt</div></div>
          <div><div class="value">${fmtHours(sum(cur, (w) => w.durationSec)).replace(' min', 'm').replace(' h ', 'h ')}</div><div class="label">im Gym</div></div>
        </div>
      </article>
      <article class="card last-w" data-wid="${last.id}">
        <div class="card-head"><h2>Letztes Training</h2><span class="muted">${fmtDateShort(last.date)}</span></div>
        <div class="lw-title">${esc(last.title)}</div>
        <div class="muted">${workoutSets(last)} Sätze · ${fmtKg(workoutVolume(last))} · ${fmtHours(last.durationSec)}</div>
        ${last.prs?.length ? `<div class="pr-chip">${ic('trophy')}${last.prs.length} neue ${last.prs.length === 1 ? 'Bestleistung' : 'Bestleistungen'}</div>` : ''}
      </article>
    </div>`);
  }
  $('#home-body').innerHTML = parts.join('');
}

function chooseRoutine() {
  openModal(`<h3>Welchen Plan trainierst du?</h3>
    <div class="menu">${db.routines.map((r) => `<button class="menu-row" data-start="${r.id}">${ic('plans')}<span class="grow"><b>${esc(r.name)}</b><span class="muted">${r.ex.length} Übungen · ca. ${routineMinutes(r)} min</span></span>${ic('arrow-right')}</button>`).join('')}
    <button class="menu-row" data-free>${ic('plus')}<span class="grow"><b>Freies Training</b><span class="muted">Übungen spontan auswählen</span></span>${ic('arrow-right')}</button></div>
    <div class="modal-actions"><button class="btn grow" data-close>Abbrechen</button></div>`);
}

function showDay(k) {
  const list = db.workouts.filter((w) => w.date === k);
  const future = k > ymd(today());
  openModal(`<h3>${fmtDate(k)}</h3>
    <p class="muted">${list.length ? `${list.length} ${list.length === 1 ? 'Training' : 'Trainings'}` : future ? 'Noch nicht da' : 'Kein Training eingetragen'}</p>
    ${list.length ? `<div class="menu">${list.map((w) => `<button class="menu-row" data-wid="${w.id}">${ic('dumbbell')}<span class="grow"><b>${esc(w.title)}</b><span class="muted">${workoutSets(w)} Sätze · ${fmtKg(workoutVolume(w))}</span></span>${ic('arrow-right')}</button>`).join('')}</div>` : ''}
    <div class="modal-actions">
      ${future ? '' : `<button class="btn primary" data-log-date="${k}">${ic('plus')}Training nachtragen</button>`}
      <button class="btn" data-close>Schließen</button>
    </div>`);
}

function logPastSheet() {
  openModal(`<h3>Training nachtragen</h3>
    <p class="muted">Für ein Training, das du nicht live mitgeloggt hast.</p>
    <form class="form" id="past-form">
      <label>Datum <input type="date" name="date" max="${ymd(today())}" value="${ymd(addDays(today(), -1))}" required /></label>
      <label>Plan <select name="r"><option value="">Ohne Plan – Übungen selbst wählen</option>${db.routines.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select></label>
      <div class="form-actions"><button class="btn primary grow" type="submit">${ic('arrow-right')}Weiter</button><button class="btn" type="button" data-close>Abbrechen</button></div>
    </form>`);
  $('#past-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    closeModal();
    startWorkout(f.r.value || null, { date: f.date.value });
  });
}

/* ================================================================
 *  VERLAUF
 * ================================================================ */
function renderHistory() {
  const list = sortedWorkouts();
  if (!list.length) {
    $('#history-list').innerHTML = `<div class="card empty">${ic('history', 'empty-i')}<p>Hier erscheinen deine Trainings, sobald du das erste gespeichert hast.</p>
      <button class="btn primary" data-view="home">${ic('play')}Zum nächsten Training</button></div>`;
    return;
  }
  const groups = new Map();
  for (const w of list) {
    const d = parseYmd(w.date);
    const k = `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(w);
  }
  $('#history-list').innerHTML = [...groups].map(([month, ws]) => `
    <h2 class="month-h">${month}<span class="muted">${ws.length} ${ws.length === 1 ? 'Training' : 'Trainings'} · ${fmtKg(sum(ws, workoutVolume))}</span></h2>
    ${ws.map((w) => `<article class="card hist" data-wid="${w.id}">
      <div class="hist-top">
        <div class="hist-date"><b>${parseYmd(w.date).getDate()}</b><span>${WD[(parseYmd(w.date).getDay() + 6) % 7]}</span></div>
        <div class="grow"><div class="act-title">${esc(w.title)}</div>
          <div class="muted">${fmtHours(w.durationSec)} · ${workoutSets(w)} Sätze · ${fmtKg(workoutVolume(w))}${w.feel ? ' · ' + esc(w.feel) : ''}</div></div>
        ${w.prs?.length ? `<span class="pr-chip sm">${ic('trophy')}${w.prs.length}</span>` : ''}
      </div>
      <div class="ex-chips">${w.exercises.map((e) => `<span>${esc(exName(e.exId, e.name))} <b>${exerciseShort(e)}</b></span>`).join('')}</div>
    </article>`).join('')}`).join('');
}

/** "3×8 @ 60" bzw. "8, 8, 6 @ 60" */
function exerciseShort(e) {
  const reps = e.sets.map((s) => s.reps);
  const same = reps.every((r) => r === reps[0]);
  const top = Math.max(...e.sets.map((s) => s.weight || 0));
  return (same ? `${reps.length}×${reps[0]}` : reps.join(', ')) + (top ? ` @ ${fmtW(top)}` : '');
}

function showWorkoutDetail(id) {
  const w = db.workouts.find((x) => x.id === id);
  if (!w) return;
  openModal(`
    <div class="wd-head"><div class="act-icon">${ic('dumbbell')}</div>
      <div><h3>${esc(w.title)}</h3><div class="muted">${fmtDate(w.date)}</div></div></div>
    <div class="totals">
      <div><div class="value">${workoutSets(w)}</div><div class="label">Sätze</div></div>
      <div><div class="value">${fmtKg(workoutVolume(w))}</div><div class="label">Volumen</div></div>
      <div><div class="value">${fmtHours(w.durationSec).replace(' min', 'm').replace(' h ', 'h ')}</div><div class="label">Dauer</div></div>
    </div>
    ${w.prs?.length ? `<div class="pr-box"><div class="label">${ic('trophy')}Bestleistungen in diesem Training</div><div>${w.prs.map(esc).join(' · ')}</div></div>` : ''}
    ${w.feel ? `<p><span class="muted">Gefühl:</span> ${esc(w.feel)}</p>` : ''}
    ${w.notes ? `<p class="notes">${esc(w.notes)}</p>` : ''}
    <table class="ex-table">
      <thead><tr><th>Übung</th><th>Sätze</th></tr></thead>
      <tbody>${w.exercises.map((e) => `<tr><td><button class="link-btn" data-ex="${esc(e.exId)}">${esc(exName(e.exId, e.name))}</button></td>
        <td>${e.sets.map((s, i) => `<div><span class="muted">${i + 1}.</span> ${s.weight ? fmtW(s.weight) + ' kg × ' : ''}${s.reps}${s.target && s.reps < s.target ? ` <span class="miss">(Ziel ${s.target})</span>` : ''}</div>`).join('')}</td></tr>`).join('')}</tbody>
    </table>
    <div class="modal-actions">
      <button class="btn primary" data-again="${w.id}">${ic('play')}Nochmal machen</button>
      <button class="btn" data-asplan="${w.id}">${ic('copy')}Als Plan speichern</button>
      <button class="btn danger" data-delw="${w.id}">${ic('trash')}Löschen</button>
      <button class="btn" data-close>Schließen</button>
    </div>`);
}

/* ================================================================
 *  FORTSCHRITT
 * ================================================================ */
function renderProgress() {
  const parts = [];
  const st = weekStreak();
  const total = db.workouts.length;
  const c = weekCounts();
  const avg = [...Array(8)].reduce((n, _, i) => n + (c[ymd(addDays(mondayOf(today()), -7 * (i + 1)))] || 0), 0) / 8;

  parts.push(`<article class="card streak-card">
    <div class="streak-top">
      <div class="streak-main">
        <div class="label">Wochen in Folge mit Wochenziel (${db.settings.weekGoal}× pro Woche)</div>
        <div class="streak-num"><span id="st-current">${st.current}</span><span class="unit">${st.current === 1 ? 'Woche' : 'Wochen'}</span></div>
      </div>
      <dl class="facts">
        <div><dt>Längste Serie</dt><dd>${st.longest}</dd></div>
        <div><dt>Trainings gesamt</dt><dd>${total}</dd></div>
        <div><dt>Ø pro Woche (8 Wochen)</dt><dd>${avg.toFixed(1).replace('.', ',')}</dd></div>
      </dl>
    </div>
    <div class="heat-block">
      <div class="card-head"><h2>Trainingstage im letzten Jahr</h2></div>
      <div class="heatmap-wrap"><div class="heatmap" id="heatmap"></div></div>
      <div class="heat-legend"><span>Tipp auf einen Tag zeigt das Training</span>
        <span class="legend-scale">Weniger <i class="cell l1"></i><i class="cell l2"></i><i class="cell l3"></i><i class="cell l4"></i> Mehr Sätze</span></div>
    </div>
  </article>`);

  if (!total) {
    parts.push(`<div class="card empty">${ic('chart', 'empty-i')}<p>Sobald du trainierst, siehst du hier dein Volumen, Muskelgruppen, Bestleistungen und deine Kraftentwicklung.</p>
      <button class="btn" data-demo>Mit Beispieldaten ansehen</button></div>`);
  } else {
    // Volumen pro Woche
    const cur = mondayOf(today());
    const weeks = [...Array(12)].map((_, i) => {
      const start = addDays(cur, -7 * (11 - i));
      const s = ymd(start), e = ymd(addDays(start, 7));
      return { start, vol: sum(db.workouts.filter((w) => w.date >= s && w.date < e), workoutVolume), cur: i === 11 };
    });
    const max = Math.max(1, ...weeks.map((w) => w.vol));
    // Sätze pro Muskelgruppe (diese Woche)
    const sets = Object.fromEntries(GROUPS.map((g) => [g, 0]));
    for (const w of db.workouts.filter((x) => x.date >= ymd(cur))) for (const e of w.exercises) {
      const g = exInfo(e.exId, e.name).g;
      sets[g] = (sets[g] || 0) + e.sets.length;
    }
    parts.push(`<div class="grid2">
      <article class="card">
        <div class="card-head"><h2>Volumen pro Woche</h2><span class="muted">Gewicht × Wdh.</span></div>
        <div class="weekchart">${weeks.map((w) => `<div class="wk${w.cur ? ' cur' : ''}" title="Woche ab ${w.start.toLocaleDateString('de-DE')}: ${fmtKg(w.vol)}">
          <span>${w.vol ? (w.vol / 1000).toFixed(1).replace('.', ',') : ''}</span><i style="height:${(w.vol / max) * 100}%"></i><span>${w.start.getDate()}.${w.start.getMonth() + 1}.</span></div>`).join('')}</div>
        <p class="muted chart-note">Werte in Tonnen</p>
      </article>
      <article class="card">
        <div class="card-head"><h2>Sätze pro Muskel</h2><span class="muted">diese Woche</span></div>
        <div class="muscle-bars">${Object.entries(sets).map(([g, n]) => `<div class="mb-row"><span>${g}</span>
          <div class="mb-track"><i class="zone"></i><i class="fill${n >= 10 ? ' ok' : ''}" style="width:${Math.min(100, (n / 24) * 100)}%"></i></div><span class="num">${n}</span></div>`).join('')}</div>
        <p class="muted chart-note">Markierter Bereich: 10–20 Sätze pro Woche gelten als guter Richtwert für Muskelaufbau.</p>
      </article>
    </div>`);

    // Bestleistungen
    const ids = [...new Set(db.workouts.flatMap((w) => w.exercises.map((e) => e.exId)))];
    const prs = ids.map((id) => ({ id, b: bestFor(id) })).filter((x) => x.b).sort((a, b) => b.b.e1rm - a.b.e1rm);
    parts.push(`<article class="card">
      <div class="card-head"><h2>Bestleistungen</h2><span class="muted">Tippen für Entwicklung</span></div>
      <div class="prs">${prs.map(({ id, b }) => `<button class="pr" data-ex="${esc(id)}">
        <div class="pr-l">${exThumb(id)}<div><div class="label">${esc(exName(id))}</div><div class="sub">${fmtW(b.weight)} kg × ${b.reps} · ${fmtDateShort(b.date)}</div></div></div>
        <div class="value">${fmtW(Math.round(b.e1rm * 2) / 2)}<small> kg 1RM</small></div></button>`).join('') || '<p class="muted">Trag Gewichte ein, um Bestleistungen zu sammeln.</p>'}</div>
    </article>`);
  }

  // Körpergewicht
  const body = [...db.body].sort((a, b) => a.date.localeCompare(b.date));
  parts.push(`<article class="card">
    <div class="card-head"><h2>Körpergewicht</h2>${body.length ? `<span class="muted">zuletzt ${fmtDateShort(body[body.length - 1].date)}</span>` : ''}</div>
    ${lineChart(body.slice(-20).map((b) => ({ x: b.date, y: b.kg })), (v) => fmtW(Math.round(v * 10) / 10) + ' kg')}
    ${body.length === 1 ? `<p><b>${fmtW(body[0].kg)} kg</b> <span class="muted">am ${fmtDate(body[0].date)}</span></p>` : ''}
    <form class="inline-form" id="body-form">
      <label class="sr-only" for="body-kg">Gewicht in kg</label>
      <input id="body-kg" name="kg" inputmode="decimal" placeholder="${body.length ? fmtW(body[body.length - 1].kg) : 'z.B. 78,5'}" />
      <button class="btn primary" type="submit">${ic('scale')}Heute eintragen</button>
    </form>
  </article>`);

  parts.push(`<article class="card">
    <div class="card-head"><h2>Übungs-Bibliothek</h2><span class="muted">${allExercises().length} Übungen</span></div>
    <p class="muted">Alle Übungen mit animierter Figur, Muskeln und deinem Verlauf.</p>
    <button class="btn wide" data-library>${ic('search')}Übungen durchsuchen</button>
  </article>`);

  $('#progress-body').innerHTML = parts.join('');
  renderHeatmap();
  $('#body-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const kg = parseNum(e.target.kg.value);
    if (kg < 20 || kg > 400) return toast('Bitte ein gültiges Gewicht eingeben');
    const k = ymd(today());
    db.body = db.body.filter((b) => b.date !== k);
    db.body.push({ date: k, kg });
    saveDb();
    renderProgress();
    toast('Gewicht eingetragen');
  });
}

function renderHeatmap() {
  const el = $('#heatmap');
  if (!el) return;
  const byDay = new Map();
  for (const w of db.workouts) byDay.set(w.date, (byDay.get(w.date) || 0) + workoutSets(w));
  const end = today();
  const start = addDays(mondayOf(end), -52 * 7);
  const parts = [];
  ['Mo', '', 'Mi', '', 'Fr', '', ''].forEach((l, i) => parts.push(`<div class="daylbl" style="grid-row:${i + 2}">${l}</div>`));
  const vals = [...byDay.values()].sort((a, b) => a - b);
  const q = (p) => (vals.length ? vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] : 0);
  const t1 = q(0.25), t2 = q(0.5), t3 = q(0.75);
  const level = (m) => (m <= t1 ? 1 : m <= t2 ? 2 : m <= t3 ? 3 : 4);
  let col = 2, lastMonth = -1;
  const tk = ymd(end);
  for (let wk = new Date(start); wk <= end; wk = addDays(wk, 7), col++) {
    const first = [...Array(7)].map((_, i) => addDays(wk, i)).find((x) => x.getDate() === 1);
    if (first && first.getMonth() !== lastMonth) {
      parts.push(`<div class="month" style="grid-column:${col}">${MONTHS[first.getMonth()]}</div>`);
      lastMonth = first.getMonth();
    }
    for (let i = 0; i < 7; i++) {
      const d = addDays(wk, i), k = ymd(d), n = byDay.get(k);
      let cls = 'cell' + (n ? ' l' + level(n) : '') + (d > end ? ' future' : '') + (k === tk ? ' today' : '');
      parts.push(`<div class="${cls}" style="grid-column:${col};grid-row:${i + 2}" data-day="${k}" title="${fmtDate(k)}${n ? `: ${n} Sätze` : ''}"></div>`);
    }
  }
  el.innerHTML = parts.join('');
  el.parentElement.scrollLeft = el.parentElement.scrollWidth;
}

/* ================================================================
 *  EINSTELLUNGEN
 * ================================================================ */
function renderSettings() {
  $('#set-name').value = db.profile.name;
  $('#set-goal').value = String(db.settings.weekGoal);
  $('#set-rest').value = String(db.settings.rest);
  $('#set-bar').value = String(db.settings.bar);
  for (const k of ['sound', 'voice', 'vibrate']) $('#set-' + k).checked = db.settings[k] !== false;
}
function initSettings() {
  $('#set-name').addEventListener('input', (e) => { db.profile.name = e.target.value.trim(); saveDb(); });
  $('#set-goal').addEventListener('change', (e) => { db.settings.weekGoal = Number(e.target.value); saveDb(); });
  $('#set-rest').addEventListener('change', (e) => { db.settings.rest = Number(e.target.value); saveDb(); });
  $('#set-bar').addEventListener('change', (e) => { db.settings.bar = Number(e.target.value); saveDb(); });
  for (const k of ['sound', 'voice', 'vibrate']) $('#set-' + k).addEventListener('change', (e) => { db.settings[k] = e.target.checked; saveDb(); });
  $('#btn-export').addEventListener('click', exportData);
  $('#file-import').addEventListener('change', (e) => e.target.files[0] && importData(e.target.files[0]));
  $('#btn-onboard').addEventListener('click', showOnboarding);
  $('#btn-reset').addEventListener('click', async () => {
    if (!await ask('Wirklich ALLE Daten löschen? Das kann nicht rückgängig gemacht werden.', 'Alles löschen')) return;
    db = defaultDb(); saveDb(); toast('Alle Daten gelöscht'); showOnboarding();
  });
}

function exportData() {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `pulse-gym-backup-${ymd(today())}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function importData(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!Array.isArray(d.workouts)) throw new Error();
      const def = defaultDb();
      db = { ...def, ...d, profile: { ...def.profile, ...d.profile, onboarded: true }, settings: { ...def.settings, ...d.settings } };
      saveDb(); toast('Backup importiert'); showView('home');
    } catch { toast('Ungültige Datei'); }
  };
  r.readAsText(file);
}

/* ================================================================
 *  EINRICHTUNG (erster Start)
 * ================================================================ */
let ob = { step: 0, name: '', goal: 'muscle', days: 3 };
function showOnboarding() {
  ob = { step: 0, name: db.profile.name, goal: db.profile.goal || 'muscle', days: Math.min(5, Math.max(2, db.profile.days || 3)) };
  $('#onboard').classList.remove('hidden');
  document.body.classList.add('onboarding');
  renderOnboarding();
}
function renderOnboarding() {
  const dots = `<div class="ob-dots">${[0, 1, 2, 3].map((i) => `<i class="${i <= ob.step ? 'on' : ''}"></i>`).join('')}</div>`;
  const back = ob.step ? `<button class="btn" data-ob="back">${ic('back')}Zurück</button>` : '';
  let html = '';
  if (ob.step === 0) {
    html = `<div class="ob-hero"><img src="icons/icon-192.png" alt="" width="72" height="72" /></div>
      <h1 id="ob-title">Willkommen bei Pulse&nbsp;Gym</h1>
      <p class="ob-lead">Dein Trainingspartner fürs Fitnessstudio: Plan, Sätze, Pausen-Timer und Fortschritt an einem Ort. In drei kurzen Schritten ist dein Plan fertig.</p>
      <label class="field">Wie heißt du? <input id="ob-name" maxlength="30" placeholder="Dein Vorname (optional)" value="${esc(ob.name)}" /></label>
      <div class="ob-actions"><button class="btn primary xl grow" data-ob="next">Los geht's${ic('arrow-right')}</button></div>
      <button class="link-btn ob-skip" data-ob="demo">Erst mal mit Beispieldaten umschauen</button>`;
  } else if (ob.step === 1) {
    html = `<h1 id="ob-title">Was ist dein Ziel?</h1>
      <p class="ob-lead">Danach richten sich Sätze, Wiederholungen und Pausen. Du kannst alles später ändern.</p>
      <div class="ob-options">${Object.entries(GOALS).map(([k, g]) => `<button class="ob-opt${ob.goal === k ? ' active' : ''}" data-goal="${k}">
        ${ic(k === 'strength' ? 'bolt' : k === 'muscle' ? 'dumbbell' : 'flame')}<span><b>${g.name}</b><span class="muted">${g.desc}</span></span></button>`).join('')}</div>
      <div class="ob-actions">${back}<button class="btn primary grow" data-ob="next">Weiter${ic('arrow-right')}</button></div>`;
  } else if (ob.step === 2) {
    html = `<h1 id="ob-title">Wie oft willst du trainieren?</h1>
      <p class="ob-lead">Pro Woche. Lieber realistisch starten – Regelmäßigkeit schlägt alles.</p>
      <div class="ob-days">${[2, 3, 4, 5].map((n) => `<button class="ob-day${ob.days === n ? ' active' : ''}" data-days="${n}"><b>${n}×</b><span>pro Woche</span></button>`).join('')}</div>
      <div class="ob-split"><b>${SPLITS[ob.days].name}</b><p class="muted">${SPLITS[ob.days].why}</p></div>
      <div class="ob-actions">${back}<button class="btn primary grow" data-ob="next">Weiter${ic('arrow-right')}</button></div>`;
  } else {
    const plans = SPLITS[ob.days].plans;
    html = `<h1 id="ob-title">Dein Plan ist fertig</h1>
      <p class="ob-lead">${SPLITS[ob.days].name} · ${GOALS[ob.goal].name} · ${ob.days}× pro Woche. Die Pläne trainierst du einfach der Reihe nach.</p>
      <div class="ob-plans">${plans.map((k, i) => `<div class="ob-plan"><span class="ob-n">${i + 1}</span><div><b>${TEMPLATES[k].name}</b>
        <div class="muted">${TEMPLATES[k].ex.map((x) => EX[x].name).join(' · ')}</div></div></div>`).join('')}</div>
      ${db.routines.length ? '<p class="muted">Hinweis: Deine bisherigen Pläne werden dabei ersetzt. Gespeicherte Trainings bleiben.</p>' : ''}
      <div class="ob-actions">${back}<button class="btn primary xl grow" data-ob="finish">${ic('check')}Plan übernehmen</button></div>`;
  }
  $('#onboard-in').innerHTML = dots + `<div class="ob-step">${html}</div>`;
  $('#onboard-in').scrollTop = 0;
}
function onboardClick(e) {
  const b = e.target.closest('[data-ob],[data-goal],[data-days]');
  if (!b) return;
  if (b.dataset.goal) { ob.goal = b.dataset.goal; return renderOnboarding(); }
  if (b.dataset.days) { ob.days = Number(b.dataset.days); return renderOnboarding(); }
  const a = b.dataset.ob;
  if (ob.step === 0) ob.name = $('#ob-name')?.value.trim() || '';
  if (a === 'next') ob.step++;
  if (a === 'back') ob.step--;
  if (a === 'demo') { db.profile.name = ob.name; finishOnboarding(true); return loadDemo(true); }
  if (a === 'finish') return finishOnboarding();
  renderOnboarding();
}
function finishOnboarding(silent) {
  db.profile = { name: ob.name, goal: ob.goal, days: ob.days, onboarded: true };
  db.settings.weekGoal = ob.days;
  db.settings.rest = GOALS[ob.goal].rest;
  db.routines = SPLITS[ob.days].plans.map((k) => routineFromTemplate(k, ob.goal));
  saveDb();
  $('#onboard').classList.add('hidden');
  document.body.classList.remove('onboarding');
  if (!silent) { toast('Dein Plan ist bereit'); showView('home'); }
}

/* ---------------- Beispieldaten ---------------- */
const DEMO_BASE = { bench: 50, incline: 40, db_bench: 20, squat: 60, deadlift: 80, row: 45, db_row: 22, ohp: 30, db_ohp: 14, lateral: 7,
  facepull: 15, triceps: 20, latpull: 45, cable_row: 45, curl: 12, hammer: 12, legpress: 100, rdl: 60, legcurl: 35, legext: 35, calf: 40,
  lunge: 14, hipthrust: 60, flys: 35, skull: 20 };
async function loadDemo(skipConfirm) {
  if (!skipConfirm && db.workouts.length && !await ask('Beispieldaten zu deinen bestehenden Daten hinzufügen?', 'Hinzufügen', false)) return;
  if (!db.routines.length) db.routines = SPLITS[3].plans.map((k) => routineFromTemplate(k, 'muscle'));
  const cur = { ...DEMO_BASE };
  const rnd = (a, b) => a + Math.random() * (b - a);
  let ri = 0;
  const t = today();
  for (let i = 84; i >= 1; i--) {
    const d = addDays(t, -i);
    const wd = (d.getDay() + 6) % 7;
    if (![0, 2, 4].includes(wd) || Math.random() < 0.12) continue;
    const r = db.routines[ri++ % db.routines.length];
    const exercises = r.ex.map((e) => {
      const info = exInfo(e.exId);
      const w = info.bw ? 0 : Math.round((cur[e.exId] ?? 20) * 2) / 2;
      const ok = Math.random() < 0.65;
      const sets = Array.from({ length: e.sets }, (_, si) => ({
        weight: w, target: e.reps,
        reps: info.bw ? e.reps + Math.round(rnd(-2, 3)) : !ok && si === e.sets - 1 ? e.reps - Math.ceil(rnd(0, 2)) : e.reps,
      }));
      if (ok && !info.bw) cur[e.exId] = (cur[e.exId] ?? 20) + info.inc;
      return { exId: e.exId, name: info.name, tempo: e.tempo, rest: e.rest, sets };
    });
    db.workouts.push({ id: uid(), date: ymd(d), routineId: r.id, title: r.name, durationSec: Math.round(rnd(48, 72)) * 60,
      exercises, feel: ['Gut', 'Super', 'Okay', 'Gut'][Math.floor(Math.random() * 4)], notes: '', prs: [],
      createdAt: new Date(d.getTime() + 18 * 3600000).toISOString(), demo: true });
    if (wd === 0) db.body.push({ date: ymd(d), kg: Math.round((78 + (84 - i) * 0.025 + rnd(-0.4, 0.4)) * 10) / 10 });
  }
  for (const r of db.routines) for (const e of r.ex) if (!exInfo(e.exId).bw) e.weight = Math.round((cur[e.exId] ?? 20) * 2) / 2 - exInfo(e.exId).inc;
  saveDb();
  toast('Beispieldaten geladen');
  showView('home');
}

/* ================================================================
 *  Navigation, Sheet, Events
 * ================================================================ */
let currentView = 'home';
function showView(v) {
  if (v === 'workout' && !db.active) v = 'home';
  currentView = v;
  $$('.view').forEach((el) => el.classList.toggle('active', el.id === 'view-' + v));
  const tab = v === 'routine' ? 'plans' : v;
  $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === tab));
  document.body.dataset.page = v;
  if (v === 'home') renderHome();
  if (v === 'plans') renderPlans();
  if (v === 'history') renderHistory();
  if (v === 'progress') renderProgress();
  if (v === 'settings') renderSettings();
  if (v === 'workout') renderWorkout();
  updateLiveBar();
  window.scrollTo(0, 0);
}
function updateLiveBar() {
  const show = !!db.active && currentView !== 'workout';
  $('#live-bar').classList.toggle('hidden', !show);
  document.body.classList.toggle('has-live', show);
  if (db.active) $('#live-text').textContent = db.active.title || 'Training läuft';
}

function openModal(html) {
  const box = $('#modal-box');
  box.onclick = null;
  box.innerHTML = html;
  $('#modal').classList.remove('hidden');
  box.scrollTop = 0;
}
/** Eigene Rückfrage statt confirm() – funktioniert überall, auch eingebettet */
function ask(text, ok = 'Ja', danger = true) {
  return new Promise((resolve) => {
    openModal(`<h3>${esc(text)}</h3>
      <div class="modal-actions"><button class="btn ${danger ? 'danger-fill' : 'primary'} grow" id="ask-ok">${esc(ok)}</button>
      <button class="btn grow" id="ask-no">Abbrechen</button></div>`);
    $('#ask-ok').onclick = () => { closeModal(); resolve(true); };
    $('#ask-no').onclick = () => { closeModal(); resolve(false); };
  });
}
function closeModal() { $('#modal').classList.add('hidden'); $('#modal-box').innerHTML = ''; }

document.addEventListener('click', async (e) => {
  if (e.target.id === 'modal') return closeModal();
  if (e.target.closest('[data-demo]')) { closeModal(); return loadDemo(); }
  const el = e.target.closest('[data-view],[data-start],[data-free],[data-choose],[data-day],[data-wid],[data-close],[data-ex],[data-library],[data-log-past],[data-log-date],[data-new-routine],[data-edit-routine],[data-tpl],[data-again],[data-asplan],[data-delw]');
  if (!el) return;
  const d = el.dataset;
  if (d.view) { closeModal(); showView(d.view); }
  else if (d.start) { closeModal(); startWorkout(d.start); }
  else if (d.free !== undefined) { closeModal(); startWorkout(null); }
  else if (d.choose !== undefined) chooseRoutine();
  else if (d.day) showDay(d.day);
  else if (d.wid) showWorkoutDetail(d.wid);
  else if (d.close !== undefined) closeModal();
  else if (d.ex) showExercise(d.ex);
  else if (d.library !== undefined) openPicker((id) => showExercise(id), { title: 'Übungs-Bibliothek' });
  else if (d.logPast !== undefined) logPastSheet();
  else if (d.logDate) { closeModal(); startWorkout(null, { date: d.logDate }); }
  else if (d.newRoutine !== undefined) openRoutineEditor(null);
  else if (d.editRoutine) openRoutineEditor(d.editRoutine);
  else if (d.tpl) { db.routines.push(routineFromTemplate(d.tpl)); saveDb(); renderPlans(); toast(`Plan „${TEMPLATES[d.tpl].name}“ hinzugefügt`); }
  else if (d.again) { const w = db.workouts.find((x) => x.id === d.again); closeModal(); startWorkout(null, { from: w }); }
  else if (d.asplan) {
    const w = db.workouts.find((x) => x.id === d.asplan);
    db.routines.push({ id: uid(), name: w.title, ex: w.exercises.map((x) => ({ exId: x.exId, sets: x.sets.length, reps: x.sets[0].target || x.sets[0].reps,
      weight: Math.max(...x.sets.map((s) => s.weight || 0)), rest: x.rest || db.settings.rest, tempo: x.tempo || '3-1-1-0' })) });
    saveDb(); closeModal(); toast('Als Plan gespeichert'); showView('plans');
  } else if (d.delw) {
    if (!await ask('Dieses Training wirklich löschen?', 'Löschen')) return;
    db.workouts = db.workouts.filter((w) => w.id !== d.delw);
    saveDb(); closeModal(); showView(currentView);
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('#coach').classList.contains('hidden')) return coachClose();
  closeModal();
});
$('#onboard').addEventListener('click', onboardClick);

function init() {
  db = loadDb();
  initWorkout();
  initSettings();
  const hash = location.hash.slice(1);
  if (!db.profile.onboarded) showOnboarding();
  if (hash === 'start' && db.profile.onboarded) {
    if (db.active) showView('workout'); else { const r = nextRoutine(); r ? startWorkout(r.id) : showView('home'); }
  } else if (db.active) showView('workout');
  else showView(['home', 'plans', 'history', 'progress'].includes(hash) ? hash : 'home');
  setupInstall();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  window.addEventListener('beforeunload', (e) => { if (C.on) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && C.on) coachWake(true); });
}

/* ---------------- Installation als App ---------------- */
function setupInstall() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) return;
  let deferred = null;
  const box = $('#install');
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  try { if (localStorage.getItem('pulse.install.dismissed') === '1') return; } catch (e) { /* ignore */ }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    $('#install-text').textContent = 'Installiere Pulse Gym auf deinem Home-Bildschirm – wie eine echte App.';
    $('#install-btn').classList.remove('hidden');
    box.classList.remove('hidden');
  });
  if (isIos) {
    $('#install-text').innerHTML = 'Als App installieren: tippe unten auf <b>Teilen</b> und dann auf <b>„Zum Home-Bildschirm“</b>.';
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
