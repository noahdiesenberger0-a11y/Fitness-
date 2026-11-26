'use strict';

/* ============================================================
 *  Pulse Gym – Übungen, Pläne, laufendes Training,
 *  Pausen-Timer, Tempo-Coach und Scheibenrechner.
 *  Nutzt Helfer aus app.js ($, db, saveDb, ic, esc, toast …)
 *  und die Figuren aus models.js (modelSvg, modelViewBox …).
 * ============================================================ */

const GROUPS = ['Brust', 'Rücken', 'Schultern', 'Arme', 'Beine', 'Bauch'];

/**
 * model: Figur aus models.js (null = schlichte Hantel-Animation)
 * start: 'top' beginnt oben (erst runter), 'bottom' beginnt unten (erst hoch)
 * inc:   sinnvolle Gewichtssteigerung in kg · bar: Langhantel (Scheibenrechner)
 * bw:    Körpergewichtsübung · iso: Isolationsübung (mehr Wiederholungen)
 */
const CATALOG = [
  { id: 'bench', name: 'Bankdrücken', g: 'Brust', model: 'bench', start: 'top', con: 'Drücken', ecc: 'Runter', inc: 2.5, bar: true },
  { id: 'incline', name: 'Schrägbankdrücken', g: 'Brust', model: 'incline', start: 'top', con: 'Drücken', ecc: 'Runter', inc: 2.5, bar: true },
  { id: 'db_bench', name: 'Kurzhantel-Bankdrücken', g: 'Brust', model: 'bench', start: 'top', con: 'Drücken', ecc: 'Runter', inc: 2 },
  { id: 'flys', name: 'Butterfly (Maschine)', g: 'Brust', model: null, m: ['Brust'], start: 'bottom', con: 'Zusammen', ecc: 'Öffnen', inc: 2.5, iso: true },
  { id: 'pushup', name: 'Liegestütze', g: 'Brust', model: 'pushup', start: 'top', con: 'Drücken', ecc: 'Runter', inc: 0, bw: true },
  { id: 'dips', name: 'Dips', g: 'Brust', model: 'dips', start: 'top', con: 'Drücken', ecc: 'Runter', inc: 2.5, bw: true },
  { id: 'deadlift', name: 'Kreuzheben', g: 'Rücken', model: 'deadlift', start: 'bottom', con: 'Hoch', ecc: 'Ablassen', inc: 5, bar: true },
  { id: 'row', name: 'Langhantelrudern', g: 'Rücken', model: 'row', start: 'bottom', con: 'Ziehen', ecc: 'Ablassen', inc: 2.5, bar: true },
  { id: 'db_row', name: 'Kurzhantel-Rudern', g: 'Rücken', model: 'row', start: 'bottom', con: 'Ziehen', ecc: 'Ablassen', inc: 2 },
  { id: 'pullup', name: 'Klimmzüge', g: 'Rücken', model: 'pullup', start: 'bottom', con: 'Ziehen', ecc: 'Ablassen', inc: 2.5, bw: true },
  { id: 'latpull', name: 'Latzug', g: 'Rücken', model: 'latpull', start: 'bottom', con: 'Ziehen', ecc: 'Nachlassen', inc: 2.5 },
  { id: 'cable_row', name: 'Rudern am Kabel', g: 'Rücken', model: null, m: ['Rücken (Latissimus)', 'Bizeps'], start: 'bottom', con: 'Ziehen', ecc: 'Nachlassen', inc: 2.5 },
  { id: 'ohp', name: 'Schulterdrücken', g: 'Schultern', model: 'ohp', start: 'top', con: 'Drücken', ecc: 'Runter', inc: 2.5, bar: true },
  { id: 'db_ohp', name: 'Kurzhantel-Schulterdrücken', g: 'Schultern', model: 'ohp', start: 'top', con: 'Drücken', ecc: 'Runter', inc: 2 },
  { id: 'lateral', name: 'Seitheben', g: 'Schultern', model: null, m: ['Schultern'], start: 'bottom', con: 'Heben', ecc: 'Senken', inc: 1, iso: true },
  { id: 'facepull', name: 'Face Pulls', g: 'Schultern', model: null, m: ['Hintere Schulter', 'Oberer Rücken'], start: 'bottom', con: 'Ziehen', ecc: 'Zurück', inc: 2.5, iso: true },
  { id: 'curl', name: 'Bizeps-Curls', g: 'Arme', model: 'curl', start: 'bottom', con: 'Hoch', ecc: 'Runter', inc: 1, iso: true },
  { id: 'hammer', name: 'Hammer-Curls', g: 'Arme', model: 'curl', start: 'bottom', con: 'Hoch', ecc: 'Runter', inc: 1, iso: true },
  { id: 'triceps', name: 'Trizepsdrücken am Kabel', g: 'Arme', model: 'triceps', start: 'bottom', con: 'Drücken', ecc: 'Zurück', inc: 2.5, iso: true },
  { id: 'skull', name: 'French Press', g: 'Arme', model: null, m: ['Trizeps'], start: 'top', con: 'Strecken', ecc: 'Beugen', inc: 2.5, iso: true },
  { id: 'squat', name: 'Kniebeugen', g: 'Beine', model: 'squat', start: 'top', con: 'Hoch', ecc: 'Runter', inc: 5, bar: true },
  { id: 'legpress', name: 'Beinpresse', g: 'Beine', model: 'legpress', start: 'top', con: 'Drücken', ecc: 'Beugen', inc: 5 },
  { id: 'lunge', name: 'Ausfallschritte', g: 'Beine', model: 'lunge', start: 'top', con: 'Hoch', ecc: 'Runter', inc: 2 },
  { id: 'rdl', name: 'Rumänisches Kreuzheben', g: 'Beine', model: 'deadlift', start: 'bottom', con: 'Hoch', ecc: 'Ablassen', inc: 5, bar: true },
  { id: 'legcurl', name: 'Beinbeuger (Maschine)', g: 'Beine', model: null, m: ['Beinbeuger'], start: 'bottom', con: 'Beugen', ecc: 'Strecken', inc: 2.5, iso: true },
  { id: 'legext', name: 'Beinstrecker (Maschine)', g: 'Beine', model: null, m: ['Oberschenkel vorne'], start: 'bottom', con: 'Strecken', ecc: 'Senken', inc: 2.5, iso: true },
  { id: 'hipthrust', name: 'Hip Thrust', g: 'Beine', model: null, m: ['Gesäß', 'Beinbeuger'], start: 'bottom', con: 'Hoch', ecc: 'Runter', inc: 5, bar: true },
  { id: 'calf', name: 'Wadenheben', g: 'Beine', model: 'calf', start: 'bottom', con: 'Hoch', ecc: 'Runter', inc: 2.5, iso: true },
  { id: 'crunch', name: 'Crunches', g: 'Bauch', model: null, m: ['Bauch'], start: 'bottom', con: 'Hoch', ecc: 'Runter', inc: 0, bw: true, iso: true },
  { id: 'legraise', name: 'Beinheben hängend', g: 'Bauch', model: null, m: ['Bauch', 'Hüftbeuger'], start: 'bottom', con: 'Heben', ecc: 'Senken', inc: 0, bw: true, iso: true },
];
const EX = Object.fromEntries(CATALOG.map((e) => [e.id, e]));

/** Infos zu einer Übung – auch für eigene Übungen und alte Einträge */
function exInfo(exId, name) {
  if (EX[exId]) return EX[exId];
  const c = (db.custom || []).find((x) => x.id === exId);
  if (c) return { start: 'top', con: 'Hoch', ecc: 'Runter', inc: 2.5, model: null, m: [c.g], ...c };
  return { id: exId, name: name || 'Übung', g: 'Sonstiges', model: null, m: [], start: 'top', con: 'Hoch', ecc: 'Runter', inc: 2.5 };
}
const exName = (exId, name) => exInfo(exId, name).name;
function exMuscles(info) { return info.model ? modelMuscleNames(info.model) : (info.m || []); }
function allExercises() { return [...CATALOG, ...(db.custom || []).map((c) => exInfo(c.id))]; }

/* ---------------- Vorlagen & Ziele ---------------- */
const TEMPLATES = {
  fbA: { name: 'Ganzkörper A', ex: ['squat', 'bench', 'row', 'ohp', 'curl'] },
  fbB: { name: 'Ganzkörper B', ex: ['deadlift', 'incline', 'latpull', 'lunge', 'triceps'] },
  push: { name: 'Push', ex: ['bench', 'incline', 'db_ohp', 'lateral', 'triceps'] },
  pull: { name: 'Pull', ex: ['row', 'latpull', 'cable_row', 'facepull', 'curl', 'hammer'] },
  legs: { name: 'Beine', ex: ['squat', 'legpress', 'rdl', 'legcurl', 'calf'] },
  upA: { name: 'Oberkörper A', ex: ['bench', 'row', 'ohp', 'latpull', 'curl', 'triceps'] },
  loA: { name: 'Unterkörper A', ex: ['squat', 'rdl', 'legpress', 'calf', 'crunch'] },
  upB: { name: 'Oberkörper B', ex: ['incline', 'pullup', 'db_ohp', 'cable_row', 'hammer', 'dips'] },
  loB: { name: 'Unterkörper B', ex: ['deadlift', 'lunge', 'legext', 'legcurl', 'legraise'] },
};
const SPLITS = {
  2: { name: 'Ganzkörper A/B', why: 'Zweimal pro Woche den ganzen Körper – ideal zum Einstieg.', plans: ['fbA', 'fbB'] },
  3: { name: 'Push · Pull · Beine', why: 'Drücken, Ziehen, Beine: jede Muskelgruppe bekommt ihren eigenen Tag.', plans: ['push', 'pull', 'legs'] },
  4: { name: 'Oberkörper / Unterkörper', why: 'Jede Muskelgruppe zweimal pro Woche – sehr effektiv für Fortschritt.', plans: ['upA', 'loA', 'upB', 'loB'] },
  5: { name: 'Push · Pull · Beine + Ober/Unter', why: 'Viel Volumen für Fortgeschrittene.', plans: ['push', 'pull', 'legs', 'upA', 'loA'] },
};
const GOALS = {
  muscle: { name: 'Muskelaufbau', desc: '3 Sätze × 10 Wdh., 1:30 Pause', sets: 3, reps: 10, rest: 90, tempo: '3-1-1-0' },
  strength: { name: 'Maximalkraft', desc: '4 Sätze × 5 Wdh., 3 min Pause', sets: 4, reps: 5, rest: 180, tempo: '2-0-1-0' },
  fit: { name: 'Fit & straff', desc: '3 Sätze × 12–15 Wdh., 1 min Pause', sets: 3, reps: 12, rest: 60, tempo: '2-0-1-0' },
};

function routineFromTemplate(key, goalKey = db.profile.goal) {
  const t = TEMPLATES[key], g = GOALS[goalKey] || GOALS.muscle;
  return {
    id: uid(), name: t.name,
    ex: t.ex.map((exId) => {
      const info = EX[exId];
      const reps = info.iso ? Math.max(g.reps, 10) : g.reps;
      return { exId, sets: info.iso ? 3 : g.sets, reps, weight: 0, rest: info.iso ? Math.min(g.rest, 90) : g.rest, tempo: g.tempo };
    }),
  };
}
function routineMinutes(r) {
  return Math.round(r.ex.reduce((n, e) => n + e.sets * (e.reps * 4 + e.rest), 0) / 60);
}
function routineGroups(r) { return [...new Set(r.ex.map((e) => exInfo(e.exId).g))]; }

/** Der Plan, der als Nächstes dran ist (reihum nach dem zuletzt trainierten) */
function nextRoutine() {
  const rs = db.routines;
  if (!rs.length) return null;
  const last = sortedWorkouts().find((w) => rs.some((r) => r.id === w.routineId));
  if (!last) return rs[0];
  return rs[(rs.findIndex((r) => r.id === last.routineId) + 1) % rs.length];
}

/* ---------------- Verlauf je Übung ---------------- */
/** Sätze der Übung aus dem letzten Training, in dem sie vorkam */
function lastSetsFor(exId) {
  for (const w of sortedWorkouts()) {
    const e = w.exercises.find((x) => x.exId === exId);
    if (e && e.sets.length) return { sets: e.sets, date: w.date };
  }
  return null;
}
/**
 * Progressive Overload: Wurden beim letzten Mal alle Sätze mit der Ziel-Wiederholungszahl geschafft,
 * gibt es mehr Gewicht. Rückgabe: { weight, up: bool, text }
 */
function suggestFor(exId, targetReps) {
  const last = lastSetsFor(exId);
  if (!last) return null;
  const info = exInfo(exId);
  const top = Math.max(...last.sets.map((s) => s.weight || 0));
  const work = last.sets.filter((s) => (s.weight || 0) === top);
  const goal = targetReps || work[0].target || work[0].reps;
  const allHit = work.every((s) => s.reps >= goal);
  if (info.bw && !top) {
    return allHit ? { weight: 0, up: true, reps: goal + 1, text: `Letztes Mal alles geschafft – versuch ${goal + 1} Wdh.` } : { weight: 0, up: false, text: '' };
  }
  if (allHit && info.inc) return { weight: top + info.inc, up: true, text: `Letztes Mal alle Wdh. geschafft – heute ${fmtW(top + info.inc)} kg` };
  return { weight: top, up: false, text: top ? `Bleib bei ${fmtW(top)} kg, bis alle Wdh. sitzen` : '' };
}

/* ---------------- Animation (Figur oder schlichte Hantel) ---------------- */
function phSvg(pos) {
  const y = 186 - pos * 130;
  return `<line class="m-floor" x1="40" y1="220" x2="260" y2="220"/>
    <line class="m-cable" x1="150" y1="48" x2="150" y2="200" stroke-width="2" stroke-dasharray="3 7"/>
    <rect class="m-equip" x="96" y="${y - 3}" width="108" height="6" rx="3"/>
    <rect class="m-plate" x="78" y="${y - 22}" width="16" height="44" rx="4"/>
    <rect class="m-plate" x="206" y="${y - 22}" width="16" height="44" rx="4"/>`;
}
const animBox = (info) => (info.model ? modelViewBox(info.model) : '0 0 300 250');
const animInner = (info, pos) => (info.model ? modelSvg(info.model, pos) : phSvg(pos));
function exThumb(exId, cls = 'thumb') {
  const info = exInfo(exId);
  if (!info.model) return `<span class="${cls} thumb-ph" aria-hidden="true">${ic('dumbbell')}</span>`;
  return `<svg class="model ${cls}" viewBox="${animBox(info)}" aria-hidden="true">${animInner(info, info.start === 'top' ? 0.85 : 0.2)}</svg>`;
}
/** Alle sichtbaren <svg data-anim> laufen in einer 4-Sekunden-Schleife */
function animLoop(ts) {
  for (const svg of document.querySelectorAll('svg[data-anim]')) {
    if (!svg.getClientRects().length) continue;
    const info = exInfo(svg.dataset.anim);
    let pos = 0.5 - Math.cos(((ts % 4000) / 4000) * 2 * Math.PI) / 2;
    if (info.start === 'top') pos = 1 - pos;
    const vb = animBox(info);
    if (svg.getAttribute('viewBox') !== vb) svg.setAttribute('viewBox', vb);
    svg.innerHTML = animInner(info, pos);
  }
  requestAnimationFrame(animLoop);
}

/* ================================================================
 *  Laufendes Training
 *  db.active = { id, routineId, title, start, date, ex: [{ exId, name, rest, tempo, sets: [{ weight, reps, target, done }] }], rest }
 * ================================================================ */
async function startWorkout(routineId, opts = {}) {
  if (db.active && !await ask('Es läuft bereits ein Training. Verwerfen und neu starten?', 'Neu starten')) return showView('workout');
  const r = db.routines.find((x) => x.id === routineId);
  let ex = [];
  if (r) {
    ex = r.ex.map((e) => {
      const sug = suggestFor(e.exId, e.reps);
      const weight = sug ? sug.weight : e.weight;
      const reps = sug?.reps || e.reps;
      return { exId: e.exId, name: exName(e.exId), rest: e.rest, tempo: e.tempo,
        sets: Array.from({ length: e.sets }, () => ({ weight, reps, target: reps, done: false })) };
    });
  } else if (opts.from) {
    ex = opts.from.exercises.map((e) => ({ exId: e.exId, name: e.name, rest: e.rest || db.settings.rest, tempo: e.tempo || '3-1-1-0',
      sets: e.sets.map((s) => ({ weight: s.weight, reps: s.target || s.reps, target: s.target || s.reps, done: false })) }));
  }
  db.active = {
    id: uid(), routineId: r?.id || null, start: Date.now(), date: opts.date || ymd(today()), past: !!opts.date,
    title: r?.name || opts.from?.title || (opts.date ? 'Nachgetragenes Training' : defaultWorkoutTitle()), ex, rest: null,
  };
  saveDb();
  ensureAudio();
  showView('workout');
  if (!ex.length) setTimeout(() => openPicker((id) => addExerciseToWorkout(id)), 150);
}
function defaultWorkoutTitle() {
  const h = new Date().getHours();
  return h < 11 ? 'Morgen-Training' : h < 14 ? 'Mittags-Training' : h < 18 ? 'Nachmittags-Training' : 'Abend-Training';
}
function addExerciseToWorkout(exId) {
  const sug = suggestFor(exId);
  const last = lastSetsFor(exId);
  const reps = last?.sets[0]?.target || last?.sets[0]?.reps || 10;
  const weight = sug ? sug.weight : 0;
  db.active.ex.push({ exId, name: exName(exId), rest: db.settings.rest, tempo: '3-1-1-0',
    sets: Array.from({ length: 3 }, () => ({ weight, reps, target: reps, done: false })) });
  saveDb();
  renderWorkout();
  setTimeout(() => $('#wk-list').lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
}

function workoutCounts(w = db.active) {
  const all = w.ex.reduce((n, e) => n + e.sets.length, 0);
  const done = w.ex.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  return { all, done };
}

function renderWorkout() {
  const w = db.active;
  if (!w) return showView('home');
  $('#wk-title').value = w.title;
  $('#wk-list').innerHTML = w.ex.map((e, xi) => {
    const info = exInfo(e.exId, e.name);
    const prev = lastSetsFor(e.exId);
    const sug = suggestFor(e.exId, e.sets[0]?.target);
    const done = e.sets.filter((s) => s.done).length;
    return `<article class="wx${done === e.sets.length && done ? ' complete' : ''}" data-x="${xi}">
      <header class="wx-head">
        <button class="wx-thumb" data-exinfo="${esc(e.exId)}" aria-label="${esc(info.name)} ansehen">${exThumb(e.exId)}</button>
        <div class="grow">
          <div class="wx-name">${esc(info.name)}</div>
          <div class="muted">${esc(info.g)} · ${done}/${e.sets.length} Sätze${prev ? ` · zuletzt ${fmtDateShort(prev.date)}` : ''}</div>
        </div>
        <button class="icon-btn ghost" data-xmenu="${xi}" aria-label="Optionen für ${esc(info.name)}">${ic('more')}</button>
      </header>
      ${sug?.text ? `<div class="wx-hint${sug.up ? ' up' : ''}">${ic(sug.up ? 'trend' : 'target')}${esc(sug.text)}</div>` : ''}
      <div class="sets" role="table" aria-label="Sätze ${esc(info.name)}">
        <div class="set-row head" role="row"><span>Satz</span><span>Vorher</span><span>kg</span><span>Wdh.</span><span class="sr-only">Erledigt</span></div>
        ${e.sets.map((s, si) => {
          const p = prev?.sets[si];
          return `<div class="set-row${s.done ? ' done' : ''}" role="row" data-x="${xi}" data-s="${si}">
            <span class="set-n">${si + 1}</span>
            <button class="prev" data-copyprev="${xi}:${si}" ${p ? '' : 'disabled'} aria-label="Werte vom letzten Mal übernehmen">${p ? `${fmtW(p.weight || 0)}×${p.reps}` : '–'}</button>
            <input class="set-in" data-f="weight" inputmode="decimal" value="${s.weight ? fmtW(s.weight) : ''}" placeholder="${info.bw ? 'KG' : '0'}" aria-label="Gewicht Satz ${si + 1}" />
            <input class="set-in" data-f="reps" inputmode="numeric" value="${s.reps || ''}" placeholder="${s.target || ''}" aria-label="Wiederholungen Satz ${si + 1}" />
            <button class="set-check" data-check="${xi}:${si}" aria-pressed="${s.done}" aria-label="Satz ${si + 1} erledigt">${ic('check')}</button>
          </div>`;
        }).join('')}
      </div>
      <div class="wx-actions">
        <button class="chip-btn" data-addset="${xi}">${ic('plus')}Satz</button>
        <button class="chip-btn" data-coach="${xi}">${ic('metronome')}Tempo-Coach</button>
        ${info.bar ? `<button class="chip-btn" data-plates="${xi}">${ic('plates')}Scheiben</button>` : ''}
        <span class="muted wx-rest">${ic('timer')}${fmtDur(e.rest)}</span>
      </div>
    </article>`;
  }).join('') || `<div class="card empty"><p>Noch keine Übung in diesem Training.</p></div>`;
  updateWorkoutProgress();
}

function updateWorkoutProgress() {
  if (!db.active) return;
  const { all, done } = workoutCounts();
  $('#wk-progress').textContent = `${done} von ${all} Sätzen`;
  $('#wk-bar').style.width = all ? (done / all) * 100 + '%' : '0';
}

function toggleSet(xi, si) {
  const e = db.active.ex[xi], s = e.sets[si];
  // leere Felder mit dem Platzhalter (Ziel) füllen
  if (!s.done && !s.reps) s.reps = s.target || 0;
  s.done = !s.done;
  saveDb();
  ensureAudio();
  if (s.done) {
    if (!s.reps) { s.done = false; return toast('Bitte erst die Wiederholungen eintragen'); }
    buzz(40);
    checkLivePR(e, s);
    const isLast = db.active.ex.every((x) => x.sets.every((y) => y.done));
    if (isLast) { toast('Alle Sätze erledigt – stark!'); restStop(); }
    else restStart(e.rest);
  }
  saveDb();
  renderWorkout();
  if (s.done) $(`.set-row[data-x="${xi}"][data-s="${si}"]`)?.classList.add('just');
}

/** Gleich beim Abhaken zeigen, wenn ein Satz eine neue Bestleistung ist */
function checkLivePR(e, s) {
  if (!s.weight || !s.reps) return;
  const best = bestFor(e.exId);
  const now = e1rm(s.weight, s.reps);
  const doneBefore = e.sets.filter((x) => x !== s && x.done && x.weight).map((x) => e1rm(x.weight, x.reps));
  if (best && now > best.e1rm + 0.01 && now > Math.max(0, ...doneBefore)) {
    toast(`Neue Bestleistung: ${exName(e.exId)} ${fmtW(s.weight)} kg × ${s.reps}`);
    buzz([60, 60, 120]);
  }
}

function onWorkoutInput(ev) {
  const inp = ev.target.closest('.set-in');
  if (!inp) return;
  const row = inp.closest('.set-row');
  const s = db.active.ex[row.dataset.x].sets[row.dataset.s];
  const f = inp.dataset.f, xi = Number(row.dataset.x), si = Number(row.dataset.s);
  const v = f === 'reps' ? Math.round(parseNum(inp.value)) : parseNum(inp.value);
  const old = s[f];
  s[f] = v;
  // Folgesätze mit gleichem Wert gleich mitziehen (Gewicht einmal eintippen reicht)
  db.active.ex[xi].sets.forEach((x, j) => {
    if (j <= si || x.done || x[f] !== old) return;
    x[f] = v;
    const el = $(`.set-row[data-x="${xi}"][data-s="${j}"] [data-f="${f}"]`);
    if (el) el.value = v ? (f === 'weight' ? fmtW(v) : v) : '';
  });
  saveDb();
}

function exerciseMenu(xi) {
  const e = db.active.ex[xi];
  openModal(`<h3>${esc(exName(e.exId, e.name))}</h3>
    <div class="menu">
      <label class="menu-row">${ic('timer')}<span class="grow">Pause nach jedem Satz</span>
        <select id="xm-rest" class="select-sm">${[30, 45, 60, 90, 120, 150, 180, 240].map((v) => `<option value="${v}"${v === e.rest ? ' selected' : ''}>${fmtDur(v)}</option>`).join('')}</select></label>
      <label class="menu-row">${ic('metronome')}<span class="grow">Tempo (runter-halten-hoch-halten)</span>
        <input id="xm-tempo" class="select-sm tempo-in" value="${esc(e.tempo || '3-1-1-0')}" /></label>
      <button class="menu-row" data-xm="info">${ic('dumbbell')}<span class="grow">Übung ansehen & Verlauf</span></button>
      ${xi ? `<button class="menu-row" data-xm="up">${ic('arrow-up')}<span class="grow">Nach oben verschieben</span></button>` : ''}
      ${e.sets.length > 1 ? `<button class="menu-row" data-xm="delset">${ic('minus')}<span class="grow">Letzten Satz entfernen</span></button>` : ''}
      <button class="menu-row danger" data-xm="del">${ic('trash')}<span class="grow">Übung entfernen</span></button>
    </div>
    <div class="modal-actions"><button class="btn primary grow" data-close>Fertig</button></div>`);
  $('#xm-rest').addEventListener('change', (ev) => { e.rest = Number(ev.target.value); saveDb(); renderWorkout(); });
  $('#xm-tempo').addEventListener('change', (ev) => {
    if (parseTempo(ev.target.value)) { e.tempo = ev.target.value.trim(); saveDb(); } else toast('Tempo bitte so angeben: 3-1-1-0');
  });
  $('#modal-box').onclick = async (ev) => {
    const b = ev.target.closest('[data-xm]');
    if (!b) return;
    const a = b.dataset.xm;
    if (a === 'info') return showExercise(e.exId);
    if (a === 'up') [db.active.ex[xi - 1], db.active.ex[xi]] = [db.active.ex[xi], db.active.ex[xi - 1]];
    if (a === 'delset') e.sets.pop();
    if (a === 'del') { if (!await ask('Übung aus diesem Training entfernen?', 'Entfernen')) return; db.active.ex.splice(xi, 1); }
    saveDb(); closeModal(); renderWorkout();
  };
}

/* ---------------- Training abschließen ---------------- */
async function finishWorkoutSheet() {
  const w = db.active;
  const { done } = workoutCounts();
  if (!done) {
    if (await ask('Noch kein Satz abgehakt. Training verwerfen?', 'Verwerfen')) discardWorkout();
    return;
  }
  const exs = doneExercises(w);
  const vol = workoutVolume({ exercises: exs });
  const reps = exs.reduce((n, e) => n + e.sets.reduce((m, s) => m + s.reps, 0), 0);
  const prs = findPRs(exs);
  const mins = w.past ? 60 : Math.max(1, Math.round((Date.now() - w.start) / 60000));
  openModal(`
    <div class="sum-hero">${ic('trophy')}<h3>Training geschafft!</h3><p class="muted">${esc(w.title)}</p></div>
    <div class="totals">
      <div><div class="value">${done}</div><div class="label">Sätze</div></div>
      <div><div class="value">${reps}</div><div class="label">Wiederholungen</div></div>
      <div><div class="value">${fmtKg(vol)}</div><div class="label">Volumen</div></div>
    </div>
    ${prs.length ? `<div class="pr-box"><div class="label">${ic('trophy')}Neue Bestleistungen</div>${prs.map((p) => `<div><b>${esc(p.name)}</b> ${fmtW(p.weight)} kg × ${p.reps}</div>`).join('')}</div>` : ''}
    <form class="form" id="fin-form">
      <div class="row">
        <label>Datum <input type="date" name="date" value="${w.date}" max="${ymd(today())}" required /></label>
        <label>Dauer (Minuten) <input type="number" name="mins" inputmode="numeric" min="1" max="600" value="${mins}" /></label>
      </div>
      <fieldset class="feel"><legend>Wie war's?</legend>
        ${['Hart', 'Okay', 'Gut', 'Super'].map((f) => `<label><input type="radio" name="feel" value="${f}" /><span>${f}</span></label>`).join('')}
      </fieldset>
      <label>Notizen <textarea name="notes" rows="2" placeholder="z.B. Schulter gemerkt, nächstes Mal leichter"></textarea></label>
      ${w.routineId ? `<label class="check"><input type="checkbox" name="upd" checked /><span>Gewichte im Plan „${esc(db.routines.find((r) => r.id === w.routineId)?.name || '')}“ übernehmen</span></label>` : ''}
      <div class="form-actions">
        <button class="btn primary grow" type="submit">${ic('check')}Training speichern</button>
        <button class="btn" type="button" data-close>Weiter trainieren</button>
      </div>
    </form>`);
  $('#fin-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = ev.target;
    saveWorkout({ date: f.date.value, mins: Number(f.mins.value) || mins, feel: f.feel.value, notes: f.notes.value.trim(), upd: f.upd?.checked, prs });
  });
}

function doneExercises(w) {
  return w.ex.map((e) => ({ exId: e.exId, name: exName(e.exId, e.name), tempo: e.tempo, rest: e.rest,
    sets: e.sets.filter((s) => s.done && s.reps > 0).map((s) => ({ weight: s.weight || 0, reps: s.reps, target: s.target })) }))
    .filter((e) => e.sets.length);
}
function findPRs(exs) {
  const out = [];
  for (const e of exs) {
    const best = bestFor(e.exId);
    const top = e.sets.filter((s) => s.weight).reduce((b, s) => (!b || e1rm(s.weight, s.reps) > e1rm(b.weight, b.reps) ? s : b), null);
    if (top && (!best || e1rm(top.weight, top.reps) > best.e1rm + 0.01)) out.push({ name: e.name, weight: top.weight, reps: top.reps, first: !best });
  }
  return out.filter((p) => !p.first);
}

function saveWorkout({ date, mins, feel, notes, upd, prs }) {
  const w = db.active;
  const exs = doneExercises(w);
  db.workouts.push({ id: w.id, date, routineId: w.routineId, title: w.title.trim() || 'Training', durationSec: mins * 60,
    exercises: exs, feel, notes, prs: prs.map((p) => p.name), createdAt: new Date().toISOString() });
  if (upd && w.routineId) {
    const r = db.routines.find((x) => x.id === w.routineId);
    for (const e of exs) {
      const re = r?.ex.find((x) => x.exId === e.exId);
      if (re) re.weight = Math.max(...e.sets.map((s) => s.weight));
    }
  }
  db.active = null;
  saveDb();
  restStop();
  closeModal();
  toast(`Training gespeichert – ${habitStreak(gymHabit())} in Folge`);
  checkBadges();
  showView('home');
  showWorkoutDetail(w.id);
}
function discardWorkout() {
  db.active = null;
  saveDb();
  restStop();
  closeModal();
  showView('home');
  toast('Training verworfen');
}

/* ---------------- Pausen-Timer ---------------- */
function restStart(sec) {
  if (!db.active) return;
  db.active.rest = { end: Date.now() + sec * 1000, total: sec };
  saveDb();
  restTick();
}
function restStop() {
  if (db.active) { db.active.rest = null; saveDb(); }
  $('#restbar').classList.add('hidden');
  document.body.classList.remove('resting');
}
function restTick() {
  const r = db.active?.rest;
  if (!r) { $('#restbar').classList.add('hidden'); document.body.classList.remove('resting'); return; }
  const left = (r.end - Date.now()) / 1000;
  if (left <= 0) {
    restStop();
    beep(1320, 160); setTimeout(() => beep(1760, 240), 180);
    buzz([200, 100, 200]);
    toast('Pause vorbei – nächster Satz!');
    return;
  }
  $('#restbar').classList.remove('hidden');
  document.body.classList.add('resting');
  $('#restbar-time').textContent = fmtDur(Math.ceil(left));
  $('#restbar-fill').style.transform = `scaleX(${Math.max(0, left / r.total)})`;
  const s = Math.ceil(left);
  if (s <= 3 && s !== restTick.lastBeep) { restTick.lastBeep = s; beep(660, 80); }
}
function restAdjust(v) {
  const r = db.active?.rest;
  if (!r) return;
  if (v === 'skip') return restStop();
  r.end += Number(v) * 1000;
  r.total = Math.max(r.total, (r.end - Date.now()) / 1000);
  saveDb();
  restTick();
}

/* ---------------- Scheibenrechner ---------------- */
const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
function showPlates(xi) {
  const e = db.active.ex[xi];
  const s = e.sets.find((x) => !x.done) || e.sets[e.sets.length - 1];
  const render = (total) => {
    const bar = db.settings.bar;
    let side = (total - bar) / 2;
    const list = [];
    if (side > 0) for (const p of PLATES) while (side >= p - 1e-9) { list.push(p); side -= p; }
    const rest = Math.round(side * 100) / 100;
    $('#pc-out').innerHTML = total < bar ? `<p class="muted">Weniger als die Stange (${bar} kg).</p>` : `
      <div class="pc-bar" aria-hidden="true"><span class="pc-sleeve"></span>${list.map((p) => `<i class="p${String(p).replace('.', '_')}">${fmtW(p)}</i>`).join('')}<span class="pc-end"></span></div>
      <p>Pro Seite: <b>${list.length ? list.map(fmtW).join(' + ') + ' kg' : 'keine Scheiben'}</b>${rest > 0 ? ` <span class="muted">(${fmtW(rest)} kg fehlen – nicht genau steckbar)</span>` : ''}</p>
      <p class="muted">Stange ${bar} kg · änderbar in den Einstellungen</p>`;
  };
  openModal(`<h3>Scheibenrechner</h3><p class="muted">${esc(exName(e.exId))}</p>
    <label class="field">Gesamtgewicht (kg) <input id="pc-w" inputmode="decimal" value="${fmtW(s?.weight || db.settings.bar)}" /></label>
    <div id="pc-out"></div>
    <div class="modal-actions"><button class="btn primary grow" data-close>Schließen</button></div>`);
  render(s?.weight || db.settings.bar);
  $('#pc-w').addEventListener('input', (ev) => render(parseNum(ev.target.value)));
}

/* ---------------- Übungs-Auswahl ---------------- */
function openPicker(onPick, { title = 'Übung hinzufügen' } = {}) {
  let group = '';
  openModal(`<div class="picker">
    <div class="picker-top"><h3>${title}</h3><button class="icon-btn ghost" data-close aria-label="Schließen">${ic('x')}</button></div>
    <label class="search">${ic('search')}<input id="pk-q" placeholder="Übung suchen …" autocomplete="off" aria-label="Übung suchen" /></label>
    <div class="chips" id="pk-groups"><button class="chip active" data-g="">Alle</button>${GROUPS.map((g) => `<button class="chip" data-g="${g}">${g}</button>`).join('')}</div>
    <div class="pk-list" id="pk-list"></div>
    <details class="pk-custom"><summary>${ic('plus')}Eigene Übung anlegen</summary>
      <form class="form" id="pk-form">
        <label>Name <input name="name" required maxlength="40" placeholder="z.B. Kabelzug-Crossover" /></label>
        <label>Muskelgruppe <select name="g">${GROUPS.map((g) => `<option>${g}</option>`).join('')}</select></label>
        <button class="btn primary" type="submit">${ic('plus')}Anlegen</button>
      </form>
    </details></div>`);
  const counts = {};
  for (const w of db.workouts) for (const e of w.exercises) counts[e.exId] = (counts[e.exId] || 0) + 1;
  const draw = () => {
    const q = $('#pk-q').value.trim().toLowerCase();
    const list = allExercises().filter((e) => (!group || e.g === group) && (!q || e.name.toLowerCase().includes(q)))
      .sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0));
    $('#pk-list').innerHTML = list.map((e) => `<button class="pk-item" data-pick="${esc(e.id)}">
      ${exThumb(e.id)}<span class="grow"><b>${esc(e.name)}</b><span class="muted">${esc(e.g)}${counts[e.id] ? ` · ${counts[e.id]}× trainiert` : ''}</span></span>${ic('plus')}</button>`).join('')
      || '<p class="muted pk-none">Nichts gefunden – leg sie unten als eigene Übung an.</p>';
  };
  draw();
  $('#pk-q').addEventListener('input', draw);
  $('#pk-groups').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-g]');
    if (!b) return;
    group = b.dataset.g;
    $$('#pk-groups .chip').forEach((c) => c.classList.toggle('active', c === b));
    draw();
  });
  $('#pk-list').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-pick]');
    if (!b) return;
    closeModal();
    onPick(b.dataset.pick);
  });
  $('#pk-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const name = ev.target.name.value.trim();
    if (!name) return;
    const c = { id: 'c_' + uid(), name, g: ev.target.g.value };
    db.custom.push(c);
    saveDb();
    closeModal();
    onPick(c.id);
  });
}

/* ---------------- Übung im Detail ---------------- */
function exerciseHistory(exId) {
  const out = [];
  for (const w of [...db.workouts].sort((a, b) => a.date.localeCompare(b.date))) {
    const e = w.exercises.find((x) => x.exId === exId);
    if (!e) continue;
    const best = e.sets.reduce((b, s) => (!b || e1rm(s.weight, s.reps) > e1rm(b.weight, b.reps) ? s : b), null);
    out.push({ date: w.date, wid: w.id, sets: e.sets, best, e1rm: best.weight ? e1rm(best.weight, best.reps) : best.reps });
  }
  return out;
}

function showExercise(exId) {
  const info = exInfo(exId);
  const hist = exerciseHistory(exId);
  const best = bestFor(exId);
  const totalSets = hist.reduce((n, h) => n + h.sets.length, 0);
  openModal(`
    <div class="ex-detail">
      <div class="ex-anim"><svg class="model" data-anim="${esc(exId)}" viewBox="${animBox(info)}" aria-hidden="true"></svg>
        <div class="muscle-tags">${exMuscles(info).map((m) => `<span>${esc(m)}</span>`).join('')}</div></div>
      <h3>${esc(info.name)}</h3>
      <p class="muted">${esc(info.g)}${info.bar ? ' · Langhantel' : ''}${info.bw ? ' · Körpergewicht' : ''}</p>
      <dl class="facts inline">
        <div><dt>Bester Satz</dt><dd>${best ? `${fmtW(best.weight)} kg × ${best.reps}` : '–'}</dd></div>
        <div><dt>Geschätztes 1RM</dt><dd>${best ? fmtW(Math.round(best.e1rm * 2) / 2) + ' kg' : '–'}</dd></div>
        <div><dt>Sätze gesamt</dt><dd>${totalSets}</dd></div>
      </dl>
      ${hist.length > 1 ? `<h4>Entwicklung (geschätztes 1RM)</h4>${lineChart(hist.slice(-16).map((h) => ({ x: h.date, y: h.e1rm })), (v) => fmtW(Math.round(v)) + (info.bw && !best ? '' : ' kg'))}` : ''}
      ${hist.length ? `<h4>Letzte Trainings</h4><div class="ex-hist">${hist.slice(-6).reverse().map((h) => `<div class="ex-hist-row" data-wid="${h.wid}">
        <span class="muted">${fmtDateShort(h.date)}</span><span class="grow">${h.sets.map((s) => `${s.weight ? fmtW(s.weight) + '×' : ''}${s.reps}`).join(' · ')}</span></div>`).join('')}</div>`
        : '<p class="muted">Noch nicht trainiert. Füg sie in einem Plan oder Training hinzu.</p>'}
      <p class="muted tip">${ic('metronome')}Tipp: Im Training zeigt dir der <b>Tempo-Coach</b> diese Bewegung im eingestellten Tempo vor und zählt mit.</p>
    </div>
    <div class="modal-actions"><button class="btn primary grow" data-close>Schließen</button></div>`);
}

/* ---------------- Pläne ---------------- */
function renderPlans() {
  const next = nextRoutine();
  $('#plans-list').innerHTML = db.routines.map((r) => `
    <article class="card plan-card">
      <div class="plan-top">
        <div class="grow"><h2>${esc(r.name)}${next?.id === r.id ? '<span class="badge">Als Nächstes</span>' : ''}</h2>
          <div class="muted">${r.ex.length} Übungen · ca. ${routineMinutes(r)} min · ${routineGroups(r).join(', ')}</div></div>
        <button class="icon-btn" data-edit-routine="${r.id}" aria-label="${esc(r.name)} bearbeiten">${ic('edit')}</button>
      </div>
      <div class="plan-ex">${r.ex.map((e) => `<span>${esc(exName(e.exId))} <b>${e.sets}×${e.reps}</b>${e.weight ? ` · ${fmtW(e.weight)} kg` : ''}</span>`).join('')}</div>
      <button class="btn primary wide" data-start="${r.id}">${ic('play')}Training starten</button>
    </article>`).join('') || `<div class="card empty"><p>Noch kein Trainingsplan. Leg einen an oder übernimm eine Vorlage.</p></div>`;
  $('#templates').innerHTML = Object.entries(TEMPLATES).map(([k, t]) => `
    <div class="tpl"><div class="grow"><b>${t.name}</b><div class="muted">${t.ex.map((x) => EX[x].name).join(' · ')}</div></div>
      <button class="btn sm" data-tpl="${k}">${ic('plus')}Übernehmen</button></div>`).join('');
}

let editRoutine = null;
function openRoutineEditor(id) {
  const r = db.routines.find((x) => x.id === id);
  editRoutine = r ? JSON.parse(JSON.stringify(r)) : { id: uid(), name: '', ex: [], isNew: true };
  $('#h-routine').textContent = r ? 'Plan bearbeiten' : 'Neuer Plan';
  $('#rt-name').value = editRoutine.name;
  $('#rt-delete').classList.toggle('hidden', !r);
  showView('routine');
  renderRoutineEditor();
}
function renderRoutineEditor() {
  const rows = editRoutine.ex;
  $('#rt-list').innerHTML = rows.map((e, i) => `
    <div class="rt-item" data-i="${i}">
      <div class="rt-top">${exThumb(e.exId)}<b class="grow">${esc(exName(e.exId))}</b>
        ${i ? `<button class="icon-btn ghost" data-rt-up="${i}" aria-label="Nach oben">${ic('arrow-up')}</button>` : ''}
        <button class="icon-btn ghost" data-rt-del="${i}" aria-label="Entfernen">${ic('x')}</button></div>
      <div class="rt-fields">
        <label>Sätze<input data-rf="sets" inputmode="numeric" value="${e.sets}" /></label>
        <label>Wdh.<input data-rf="reps" inputmode="numeric" value="${e.reps}" /></label>
        <label>kg<input data-rf="weight" inputmode="decimal" value="${e.weight ? fmtW(e.weight) : ''}" placeholder="0" /></label>
        <label>Pause<select data-rf="rest">${[30, 45, 60, 90, 120, 150, 180, 240].map((v) => `<option value="${v}"${v === e.rest ? ' selected' : ''}>${fmtDur(v)}</option>`).join('')}</select></label>
      </div>
    </div>`).join('') || '<p class="muted rt-empty">Noch keine Übungen. Füg unten die erste hinzu.</p>';
}
function saveRoutine() {
  const name = $('#rt-name').value.trim();
  if (!name) { $('#rt-name').focus(); return toast('Gib dem Plan einen Namen'); }
  if (!editRoutine.ex.length) return toast('Füg mindestens eine Übung hinzu');
  editRoutine.name = name;
  const { isNew, ...r } = editRoutine;
  const i = db.routines.findIndex((x) => x.id === r.id);
  if (i >= 0) db.routines[i] = r; else db.routines.push(r);
  saveDb();
  toast('Plan gespeichert');
  showView('plans');
}

/* ---------------- Tempo-Coach ---------------- */
const COUNTDOWN_MS = 3000;
const C = { on: false, paused: false, stage: 'countdown', ms: 0, len: 0, lastTs: 0, raf: 0, key: '', reps: 0, target: 0, xi: 0, si: 0, info: null, phases: [], cyc: 0 };

function parseTempo(str) {
  const p = String(str).split('-').map(Number);
  if (p.length !== 4 || p.some((x) => isNaN(x) || x < 0) || p[0] + p[2] <= 0) return null;
  return { down: p[0], holdBottom: p[1], up: p[2], holdTop: p[3] };
}
function phasesFor(info, tempo) {
  const t = parseTempo(tempo) || parseTempo('3-1-1-0');
  const down = { key: 'down', label: info.ecc || 'Runter', ms: t.down * 1000, from: 1, to: 0 };
  const holdB = { key: 'holdB', label: 'Halten', ms: t.holdBottom * 1000, from: 0, to: 0 };
  const up = { key: 'up', label: info.con || 'Hoch', ms: t.up * 1000, from: 0, to: 1 };
  const holdT = { key: 'holdT', label: 'Halten', ms: t.holdTop * 1000, from: 1, to: 1 };
  return (info.start === 'top' ? [down, holdB, up, holdT] : [up, holdT, down, holdB]).filter((p) => p.ms > 0);
}

function openCoach(xi) {
  const e = db.active.ex[xi];
  let si = e.sets.findIndex((s) => !s.done);
  if (si < 0) { const l = e.sets[e.sets.length - 1]; e.sets.push({ ...l, done: false }); si = e.sets.length - 1; renderWorkout(); }
  const s = e.sets[si];
  ensureAudio();
  restStop();
  Object.assign(C, { on: true, paused: false, xi, si, info: exInfo(e.exId, e.name), target: s.reps || s.target || 8, reps: 0 });
  C.phases = phasesFor(C.info, e.tempo);
  C.cyc = C.phases.reduce((n, p) => n + p.ms, 0);
  $('#co-ex').textContent = C.info.name;
  $('#co-sub').textContent = `Satz ${si + 1} von ${e.sets.length}${s.weight ? ' · ' + fmtW(s.weight) + ' kg' : ''}`;
  $('#co-reps').textContent = C.target;
  $('#co-tempo').textContent = e.tempo || '3-1-1-0';
  $('#co-dots').innerHTML = '<i></i>'.repeat(C.target);
  $('#co-anim').setAttribute('viewBox', animBox(C.info));
  $('#co-pause').innerHTML = `${ic('pause')}<span>Pausieren</span>`;
  $('#co-stage').classList.remove('paused');
  $('#coach').classList.remove('hidden');
  document.body.classList.add('coaching');
  coachWake(true);
  coachStage('countdown');
  C.lastTs = performance.now();
  cancelAnimationFrame(C.raf);
  C.raf = requestAnimationFrame(coachTick);
}
function coachStage(stage) {
  C.stage = stage; C.ms = 0; C.key = '';
  if (stage === 'countdown') C.len = COUNTDOWN_MS;
  else { C.len = C.target * C.cyc; C.reps = 0; say('Los'); }
  coachRep();
}
function coachTick(ts) {
  if (!C.on) return;
  const dt = Math.min(ts - C.lastTs, 1000);
  C.lastTs = ts;
  if (!C.paused) {
    C.ms += dt;
    if (C.stage === 'countdown') coachCountdown(); else coachSet();
  }
  C.raf = requestAnimationFrame(coachTick);
}
function coachDraw(pos) { $('#co-anim').innerHTML = animInner(C.info, pos); }
function coachCountdown() {
  if (C.ms >= C.len) return coachStage('set');
  const left = Math.ceil((C.len - C.ms) / 1000);
  if ('c' + left !== C.key) {
    C.key = 'c' + left;
    beep(660, 80);
    if (left === 3) say(`${C.info.name}. ${C.target} Wiederholungen`);
  }
  $('#co-phase').textContent = left;
  $('#co-phase').className = 'pl-phase countdown';
  coachDraw(C.info.start === 'top' ? 1 : 0);
  $('#co-phasefill').style.width = (C.ms / C.len) * 100 + '%';
  $('#co-phasefill').className = '';
}
function coachSet() {
  if (C.ms >= C.len) { C.reps = C.target; coachRep(); return coachFinish(); }
  const rep = Math.floor(C.ms / C.cyc);
  let t = C.ms - rep * C.cyc;
  let ph = C.phases[0];
  for (const p of C.phases) { if (t < p.ms) { ph = p; break; } t -= p.ms; }
  const prog = Math.min(1, t / ph.ms);
  if (rep > C.reps) { C.reps = rep; coachRep(); say(String(rep)); buzz(60); }
  if (rep + ph.key !== C.key) {
    C.key = rep + ph.key;
    if (ph.key === 'up') beep(990, 90); else if (ph.key === 'down') beep(520, 90); else beep(740, 50, 0.08);
  }
  const eased = 0.5 - Math.cos(prog * Math.PI) / 2;
  coachDraw(ph.from + (ph.to - ph.from) * eased);
  const secLeft = Math.ceil((ph.ms - t) / 1000);
  $('#co-phase').textContent = `${ph.label}${ph.ms >= 1500 ? ' · ' + secLeft : ''}`;
  $('#co-phase').className = 'pl-phase ' + ph.key;
  $('#co-phasefill').style.width = prog * 100 + '%';
  $('#co-phasefill').className = ph.key;
}
function coachRep() {
  const el = $('#co-rep');
  if (C.reps > Number(el.textContent)) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  el.textContent = C.reps;
  $$('#co-dots i').forEach((d, i) => d.classList.toggle('on', i < C.reps));
}
/** Satz fertig → Wiederholungen eintragen, abhaken, Pause starten */
function coachFinish() {
  const reps = C.stage === 'set' ? C.reps : 0;
  coachClose();
  if (!reps) return;
  const e = db.active.ex[C.xi], s = e.sets[C.si];
  s.reps = reps;
  s.done = false;
  say(reps >= C.target ? 'Satz geschafft. Pause.' : 'Pause.');
  renderWorkout();
  toggleSet(C.xi, C.si);
}
function coachClose() {
  C.on = false;
  cancelAnimationFrame(C.raf);
  window.speechSynthesis?.cancel();
  $('#coach').classList.add('hidden');
  document.body.classList.remove('coaching');
  coachWake(false);
}
let coachLock = null;
async function coachWake(on) {
  try {
    if (on && !coachLock && 'wakeLock' in navigator) {
      coachLock = await navigator.wakeLock.request('screen');
      coachLock.addEventListener('release', () => { coachLock = null; });
    } else if (!on && coachLock) { await coachLock.release(); coachLock = null; }
  } catch (e) { /* z.B. Akku-Sparmodus */ }
}

/* ---------------- Events ---------------- */
function initWorkout() {
  $('#wk-list').addEventListener('input', onWorkoutInput);
  $('#wk-list').addEventListener('focusin', (ev) => { if (ev.target.classList.contains('set-in')) ev.target.select(); });
  $('#wk-list').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-check],[data-addset],[data-coach],[data-plates],[data-xmenu],[data-copyprev],[data-exinfo]');
    if (!b) return;
    const d = b.dataset;
    if (d.check) { const [x, s] = d.check.split(':').map(Number); toggleSet(x, s); }
    else if (d.addset) {
      const e = db.active.ex[d.addset];
      const l = e.sets[e.sets.length - 1] || { weight: 0, reps: 10, target: 10 };
      e.sets.push({ weight: l.weight, reps: l.target || l.reps, target: l.target || l.reps, done: false });
      saveDb(); renderWorkout();
    } else if (d.coach) openCoach(Number(d.coach));
    else if (d.plates) showPlates(Number(d.plates));
    else if (d.xmenu) exerciseMenu(Number(d.xmenu));
    else if (d.exinfo) showExercise(d.exinfo);
    else if (d.copyprev) {
      const [x, s] = d.copyprev.split(':').map(Number);
      const p = lastSetsFor(db.active.ex[x].exId)?.sets[s];
      if (!p) return;
      Object.assign(db.active.ex[x].sets[s], { weight: p.weight, reps: p.reps });
      saveDb(); renderWorkout();
    }
  });
  $('#wk-title').addEventListener('input', (ev) => { db.active.title = ev.target.value; saveDb(); });
  $('#wk-add').addEventListener('click', () => openPicker((id) => addExerciseToWorkout(id)));
  $('#wk-finish').addEventListener('click', finishWorkoutSheet);
  $('#wk-cancel').addEventListener('click', async () => { if (await ask('Training abbrechen? Nichts wird gespeichert.', 'Abbrechen und verwerfen')) discardWorkout(); });
  $('#restbar').addEventListener('click', (ev) => { const b = ev.target.closest('[data-rest]'); if (b) restAdjust(b.dataset.rest); });

  $('#co-close').addEventListener('click', coachClose);
  $('#co-done').addEventListener('click', () => (C.stage === 'countdown' ? coachStage('set') : coachFinish()));
  $('#co-pause').addEventListener('click', () => {
    C.paused = !C.paused;
    if (C.paused) window.speechSynthesis?.cancel();
    $('#co-pause').innerHTML = C.paused ? `${ic('play')}<span>Weiter</span>` : `${ic('pause')}<span>Pausieren</span>`;
    $('#co-stage').classList.toggle('paused', C.paused);
  });

  // Plan-Editor
  $('#rt-name').addEventListener('input', (ev) => { editRoutine.name = ev.target.value; });
  $('#rt-add').addEventListener('click', () => openPicker((exId) => {
    const g = GOALS[db.profile.goal] || GOALS.muscle;
    const info = exInfo(exId);
    const last = lastSetsFor(exId);
    editRoutine.ex.push({ exId, sets: info.iso ? 3 : g.sets, reps: info.iso ? Math.max(10, g.reps) : g.reps,
      weight: last ? Math.max(...last.sets.map((s) => s.weight || 0)) : 0, rest: info.iso ? Math.min(90, g.rest) : g.rest, tempo: g.tempo });
    renderRoutineEditor();
  }));
  $('#rt-list').addEventListener('click', (ev) => {
    const up = ev.target.closest('[data-rt-up]'), del = ev.target.closest('[data-rt-del]');
    if (up) { const i = Number(up.dataset.rtUp); [editRoutine.ex[i - 1], editRoutine.ex[i]] = [editRoutine.ex[i], editRoutine.ex[i - 1]]; }
    else if (del) editRoutine.ex.splice(Number(del.dataset.rtDel), 1);
    else return;
    renderRoutineEditor();
  });
  $('#rt-list').addEventListener('change', (ev) => {
    const f = ev.target.dataset.rf;
    if (!f) return;
    const e = editRoutine.ex[ev.target.closest('.rt-item').dataset.i];
    const v = parseNum(ev.target.value);
    e[f] = f === 'weight' ? Math.max(0, v) : Math.max(f === 'rest' ? 15 : 1, Math.round(v) || 1);
  });
  $('#rt-save').addEventListener('click', saveRoutine);
  $('#rt-delete').addEventListener('click', async () => {
    if (!await ask('Diesen Plan löschen? Deine gespeicherten Trainings bleiben erhalten.', 'Plan löschen')) return;
    db.routines = db.routines.filter((r) => r.id !== editRoutine.id);
    saveDb();
    showView('plans');
  });

  setInterval(() => {
    restTick();
    if (db.active) {
      const t = fmtDur((Date.now() - db.active.start) / 1000);
      $('#wk-clock').textContent = db.active.past ? 'nachgetragen' : t;
      $('#live-clock').textContent = db.active.past ? '' : t;
    }
  }, 250);
  requestAnimationFrame(animLoop);
}
