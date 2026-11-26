'use strict';

/* ============================================================
 *  Übungsbibliothek, Vorlagen-Splits und Kraft-Berechnungen
 * ============================================================ */

/** Muskelgruppen für Wochenvolumen und Filter. Richtwert: 10–20 harte Sätze pro Woche. */
const GROUPS = {
  chest:     'Brust',
  back:      'Rücken',
  shoulders: 'Schultern',
  arms:      'Arme',
  legs:      'Beine',
  core:      'Bauch',
};

/**
 * Bewegungsrichtung je Figur (models.js).
 * start 'top': beginnt oben, erst runter (Drücken, Kniebeugen …)
 * start 'bottom': beginnt unten, erst hoch (Ziehen, Curls, Kreuzheben …)
 */
const MOTION = {
  bench:    { start: 'top', con: 'Drücken', ecc: 'Runter' },
  incline:  { start: 'top', con: 'Drücken', ecc: 'Runter' },
  squat:    { start: 'top', con: 'Hoch', ecc: 'Runter' },
  deadlift: { start: 'bottom', con: 'Hoch', ecc: 'Ablassen' },
  ohp:      { start: 'top', con: 'Drücken', ecc: 'Runter' },
  row:      { start: 'bottom', con: 'Ziehen', ecc: 'Ablassen' },
  pullup:   { start: 'bottom', con: 'Ziehen', ecc: 'Ablassen' },
  pushup:   { start: 'top', con: 'Drücken', ecc: 'Runter' },
  dips:     { start: 'top', con: 'Drücken', ecc: 'Runter' },
  curl:     { start: 'bottom', con: 'Hoch', ecc: 'Runter' },
  lunge:    { start: 'top', con: 'Hoch', ecc: 'Runter' },
  legpress: { start: 'top', con: 'Drücken', ecc: 'Beugen' },
  latpull:  { start: 'bottom', con: 'Ziehen', ecc: 'Nachlassen' },
  triceps:  { start: 'bottom', con: 'Drücken', ecc: 'Zurück' },
  calf:     { start: 'bottom', con: 'Hoch', ecc: 'Runter' },
};

/** model: Figur aus models.js (null = keine Animation vorhanden), bw: Körpergewichtsübung */
const LIBRARY = [
  { id: 'bench',      name: 'Bankdrücken',              group: 'chest',     model: 'bench' },
  { id: 'incline',    name: 'Schrägbankdrücken',        group: 'chest',     model: 'incline' },
  { id: 'db-bench',   name: 'Kurzhantel-Bankdrücken',   group: 'chest',     model: 'bench' },
  { id: 'pushup',     name: 'Liegestütze',              group: 'chest',     model: 'pushup', bw: true },
  { id: 'dips',       name: 'Dips',                     group: 'chest',     model: 'dips', bw: true },
  { id: 'flys',       name: 'Butterfly',                group: 'chest',     model: null },
  { id: 'deadlift',   name: 'Kreuzheben',               group: 'back',      model: 'deadlift' },
  { id: 'row',        name: 'Langhantelrudern',         group: 'back',      model: 'row' },
  { id: 'db-row',     name: 'Kurzhantelrudern',         group: 'back',      model: 'row' },
  { id: 'pullup',     name: 'Klimmzüge',                group: 'back',      model: 'pullup', bw: true },
  { id: 'latpull',    name: 'Latzug',                   group: 'back',      model: 'latpull' },
  { id: 'cable-row',  name: 'Kabelrudern',              group: 'back',      model: null },
  { id: 'facepull',   name: 'Face Pulls',               group: 'shoulders', model: null },
  { id: 'ohp',        name: 'Schulterdrücken',          group: 'shoulders', model: 'ohp' },
  { id: 'db-ohp',     name: 'Kurzhantel-Schulterdrücken', group: 'shoulders', model: 'ohp' },
  { id: 'lateral',    name: 'Seitheben',                group: 'shoulders', model: null },
  { id: 'curl',       name: 'Bizeps-Curls',             group: 'arms',      model: 'curl' },
  { id: 'hammer',     name: 'Hammer-Curls',             group: 'arms',      model: 'curl' },
  { id: 'triceps',    name: 'Trizepsdrücken am Kabel',  group: 'arms',      model: 'triceps' },
  { id: 'skull',      name: 'French Press',             group: 'arms',      model: null },
  { id: 'squat',      name: 'Kniebeugen',               group: 'legs',      model: 'squat' },
  { id: 'legpress',   name: 'Beinpresse',               group: 'legs',      model: 'legpress' },
  { id: 'lunge',      name: 'Ausfallschritte',          group: 'legs',      model: 'lunge' },
  { id: 'rdl',        name: 'Rumänisches Kreuzheben',   group: 'legs',      model: 'deadlift' },
  { id: 'legcurl',    name: 'Beinbeuger',               group: 'legs',      model: null },
  { id: 'legext',     name: 'Beinstrecker',             group: 'legs',      model: null },
  { id: 'hipthrust',  name: 'Hip Thrust',               group: 'legs',      model: null },
  { id: 'calf',       name: 'Wadenheben',               group: 'legs',      model: 'calf' },
  { id: 'plank',      name: 'Unterarmstütz (Sekunden)', group: 'core',      model: null, bw: true },
  { id: 'crunch',     name: 'Crunches',                 group: 'core',      model: null, bw: true },
  { id: 'legraise',   name: 'Beinheben hängend',        group: 'core',      model: null, bw: true },
];

/** Übung nachschlagen (Bibliothek oder eigene Übungen). Unbekannte → Platzhalter mit Name. */
function exInfo(exId, fallbackName) {
  const e = LIBRARY.find((x) => x.id === exId) || (state?.customExercises || []).find((x) => x.id === exId);
  if (e) return { ...e, motion: MOTION[e.model] || MOTION.ohp };
  return { id: exId, name: fallbackName || 'Übung', group: 'core', model: null, motion: MOTION.ohp };
}
function allExercises() { return [...LIBRARY, ...(state?.customExercises || [])]; }
/** Name → Übung (für den Import alter Trainings) */
function exByName(name) {
  const n = String(name).trim().toLowerCase();
  return allExercises().find((e) => e.name.toLowerCase() === n)
    || LIBRARY.find((e) => n.startsWith(e.name.toLowerCase().split(' ')[0]));
}

/** Kleines Vorschaubild: animierte Figur, sonst Icon */
function exThumb(exId, cls = 'plan-thumb') {
  const e = exInfo(exId);
  if (e.model && window.Model3D?.ready) {
    return `<img class="model ${cls}" src="${Model3D.thumb(e.model)}" alt="" />`;
  }
  if (e.model && typeof modelSvg === 'function') {
    return `<svg class="model ${cls}" viewBox="${modelViewBox(e.model)}" aria-hidden="true">${modelSvg(e.model, 0.5)}</svg>`;
  }
  return `<div class="${cls} thumb-icon">${ic('dumbbell')}</div>`;
}

/* ---------------- Kraft-Berechnungen ---------------- */

/** Geschätztes Maximalgewicht für 1 Wiederholung (Epley). Ab 12 Wdh. wird die Schätzung ungenau. */
function e1rm(weight, reps) {
  if (!weight || !reps) return 0;
  if (reps === 1) return weight;
  return weight * (1 + Math.min(reps, 12) / 30);
}
const setVolume = (s) => (s.reps || 0) * (s.weight || 0);
function doneSets(ex) { return (ex.sets || []).filter((s) => s.done !== false && s.reps > 0); }
function workoutVolume(exercises) {
  return exercises.reduce((v, e) => v + doneSets(e).reduce((n, s) => n + setVolume(s), 0), 0);
}
function workoutSetCount(exercises) { return exercises.reduce((n, e) => n + doneSets(e).length, 0); }

function fmtKg(kg) {
  if (kg >= 10000) return (kg / 1000).toFixed(1).replace('.', ',') + ' t';
  return Math.round(kg).toLocaleString('de-DE') + ' kg';
}
const fmtW = (w) => String(Math.round(w * 100) / 100).replace('.', ',');
function fmtSet(s) { return s.weight ? `${fmtW(s.weight)} kg × ${s.reps}` : `${s.reps} Wdh.`; }
function repRange(ex) { return ex.repsMin === ex.repsMax ? String(ex.repsMin) : `${ex.repsMin}–${ex.repsMax}`; }

/** Beste Leistung einer Übung in einem Training: höchstes e1RM (bei Körpergewicht: meiste Wdh.) */
function bestOf(ex) {
  let best = null;
  for (const s of doneSets(ex)) {
    const score = s.weight ? e1rm(s.weight, s.reps) : s.reps;
    if (!best || score > best.score) best = { score, set: s, bw: !s.weight };
  }
  return best;
}

/** Verlauf einer Übung über alle Trainings, älteste zuerst */
function exerciseHistory(exId) {
  const out = [];
  for (const w of [...state.workouts].sort((a, b) => (a.date + a.createdAt).localeCompare(b.date + b.createdAt))) {
    for (const ex of w.exercises) {
      if (ex.exId !== exId) continue;
      const sets = doneSets(ex);
      if (!sets.length) continue;
      const b = bestOf(ex);
      out.push({
        w, ex, date: w.date,
        e1rm: sets.reduce((m, s) => Math.max(m, e1rm(s.weight, s.reps)), 0),
        maxW: sets.reduce((m, s) => Math.max(m, s.weight || 0), 0),
        maxReps: sets.reduce((m, s) => Math.max(m, s.reps), 0),
        volume: sets.reduce((n, s) => n + setVolume(s), 0),
        best: b,
      });
    }
  }
  return out;
}

/** Letzte Durchführung einer Übung (für vorausgefüllte Werte) */
function lastPerformance(exId, beforeId) {
  const list = [...state.workouts]
    .filter((w) => w.id !== beforeId)
    .sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
  for (const w of list) {
    const ex = w.exercises.find((e) => e.exId === exId && doneSets(e).length);
    if (ex) return { w, sets: doneSets(ex) };
  }
  return null;
}

/* ---------------- Vorlagen-Splits ---------------- */
const T = (exId, sets, repsMin, repsMax, rest = 90, tempo = '2-0-1-0') => ({ exId, sets, repsMin, repsMax, rest, tempo });

const TEMPLATES = [
  {
    id: 'tpl-ppl', name: 'Push / Pull / Legs', goal: 'Muskelaufbau', level: 'Fortgeschritten', perWeek: 6,
    description: 'Der Klassiker: jede Muskelgruppe zweimal pro Woche, jeder Tag mit klarem Fokus. Zwei Durchläufe pro Woche, ein Ruhetag.',
    days: [
      { name: 'Push', exercises: [T('bench', 4, 6, 8, 150), T('ohp', 3, 8, 10, 120), T('incline', 3, 8, 12), T('lateral', 3, 12, 15, 60), T('triceps', 3, 10, 12, 60)] },
      { name: 'Pull', exercises: [T('deadlift', 3, 5, 6, 180), T('pullup', 3, 6, 10, 120), T('row', 3, 8, 10), T('facepull', 3, 12, 15, 60), T('curl', 3, 10, 12, 60)] },
      { name: 'Legs', exercises: [T('squat', 4, 6, 8, 180), T('rdl', 3, 8, 10, 120), T('legpress', 3, 10, 12), T('legcurl', 3, 10, 12, 60), T('calf', 4, 10, 15, 60)] },
    ],
  },
  {
    id: 'tpl-ul', name: 'Oberkörper / Unterkörper', goal: 'Kraft & Masse', level: 'Mittel', perWeek: 4,
    description: 'Vier Tage pro Woche, schwere Grundübungen am Anfang, danach Volumen. Sehr gut planbar.',
    days: [
      { name: 'Oberkörper A', exercises: [T('bench', 4, 5, 6, 180), T('row', 4, 6, 8, 150), T('ohp', 3, 8, 10, 120), T('latpull', 3, 10, 12), T('curl', 2, 10, 12, 60), T('triceps', 2, 10, 12, 60)] },
      { name: 'Unterkörper A', exercises: [T('squat', 4, 5, 6, 180), T('rdl', 3, 8, 10, 150), T('lunge', 3, 10, 10), T('calf', 4, 12, 15, 60), T('plank', 3, 45, 60, 60)] },
      { name: 'Oberkörper B', exercises: [T('incline', 4, 8, 10, 120), T('pullup', 4, 6, 10, 120), T('db-ohp', 3, 10, 12), T('cable-row', 3, 10, 12), T('hammer', 2, 10, 12, 60), T('dips', 2, 8, 12, 60)] },
      { name: 'Unterkörper B', exercises: [T('deadlift', 3, 4, 6, 180), T('legpress', 4, 10, 12, 120), T('legcurl', 3, 10, 12), T('legext', 3, 12, 15, 60), T('legraise', 3, 10, 15, 60)] },
    ],
  },
  {
    id: 'tpl-fb', name: 'Ganzkörper 3×', goal: 'Allround', level: 'Mittel', perWeek: 3,
    description: 'Drei Ganzkörper-Einheiten pro Woche im Wechsel A/B. Wenig Zeit, viel Wirkung.',
    days: [
      { name: 'Ganzkörper A', exercises: [T('squat', 3, 6, 8, 150), T('bench', 3, 6, 8, 150), T('row', 3, 8, 10, 120), T('lateral', 2, 12, 15, 60), T('plank', 2, 45, 60, 60)] },
      { name: 'Ganzkörper B', exercises: [T('deadlift', 3, 5, 5, 180), T('ohp', 3, 6, 8, 120), T('pullup', 3, 6, 10, 120), T('lunge', 2, 10, 10, 90), T('curl', 2, 10, 12, 60)] },
    ],
  },
  {
    id: 'tpl-beginner', name: 'Anfänger-Start', goal: 'Einstieg', level: 'Anfänger', perWeek: 3,
    description: 'Maschinen und einfache Übungen, um Technik zu lernen. Langsames Tempo für saubere Bewegungen.',
    days: [
      { name: 'Training A', exercises: [T('legpress', 3, 10, 12, 90, '3-1-1-0'), T('db-bench', 3, 10, 12, 90, '3-1-1-0'), T('latpull', 3, 10, 12, 90, '3-1-1-0'), T('plank', 2, 30, 45, 60)] },
      { name: 'Training B', exercises: [T('lunge', 3, 8, 10, 90, '3-1-1-0'), T('pushup', 3, 8, 12, 90, '3-1-1-0'), T('db-row', 3, 10, 12, 90, '3-1-1-0'), T('crunch', 2, 12, 15, 60)] },
    ],
  },
  {
    id: 'tpl-bro', name: 'Bro-Split 5×', goal: 'Muskelaufbau', level: 'Fortgeschritten', perWeek: 5,
    description: 'Ein Muskel pro Tag, dafür richtig. Viel Volumen und Zeit pro Muskelgruppe.',
    days: [
      { name: 'Brust', exercises: [T('bench', 4, 6, 10, 150), T('incline', 4, 8, 10, 120), T('db-bench', 3, 10, 12), T('flys', 3, 12, 15, 60), T('dips', 3, 8, 12, 90)] },
      { name: 'Rücken', exercises: [T('deadlift', 3, 5, 6, 180), T('pullup', 4, 6, 10, 120), T('row', 4, 8, 10), T('latpull', 3, 10, 12), T('cable-row', 3, 10, 12, 60)] },
      { name: 'Schultern', exercises: [T('ohp', 4, 6, 8, 150), T('db-ohp', 3, 8, 10, 120), T('lateral', 4, 12, 15, 60), T('facepull', 3, 12, 15, 60)] },
      { name: 'Beine', exercises: [T('squat', 4, 6, 8, 180), T('legpress', 4, 10, 12, 120), T('rdl', 3, 8, 10, 120), T('legext', 3, 12, 15, 60), T('legcurl', 3, 10, 12, 60), T('calf', 4, 12, 15, 60)] },
      { name: 'Arme', exercises: [T('curl', 4, 8, 12, 60), T('skull', 4, 8, 12, 60), T('hammer', 3, 10, 12, 60), T('triceps', 3, 10, 12, 60)] },
    ],
  },
];

/** Vorlage oder Split tief kopieren, mit neuen IDs und Namen der Übungen */
function cloneSplit(src, extra = {}) {
  return {
    id: uid(),
    name: src.name,
    goal: src.goal || '',
    level: src.level || '',
    perWeek: src.perWeek || src.days.length,
    description: src.description || '',
    days: src.days.map((d) => ({
      id: uid(), name: d.name,
      exercises: d.exercises.map((e) => ({ ...e, name: e.name || exInfo(e.exId).name })),
    })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...extra,
  };
}
