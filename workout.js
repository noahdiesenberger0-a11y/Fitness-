'use strict';

/* ============================================================
 *  Training: Startseite, Live-Training (Sätze abhaken),
 *  Pausen-Timer, Rekord-Erkennung, Abschluss, Übungsauswahl.
 * ============================================================ */

const ACTIVE_KEY = 'pulse.active';
let active = null;      // laufendes Training
let rest = null;        // { end, total } Pausen-Timer
let restTimer = 0;
let clockTimer = 0;

/* ---------------- Signale: Ton, Sprache, Vibration ---------------- */
let audioCtx = null;
function unlockAudio() {
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch (e) { audioCtx = null; }
}
function beep(freq = 880, ms = 90, vol = 0.18) {
  if (!state.settings.sound || !audioCtx) return;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.frequency.value = freq;
  o.type = 'sine';
  g.gain.setValueAtTime(vol, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + ms / 1000);
  o.connect(g).connect(audioCtx.destination);
  o.start();
  o.stop(audioCtx.currentTime + ms / 1000 + 0.02);
}
function say(text) {
  if (!state.settings.voice || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'de-DE';
  u.rate = 1.1;
  speechSynthesis.speak(u);
}
function buzz(p) { if (state.settings.vibrate && navigator.vibrate) navigator.vibrate(p); }

let wake = null;
async function wakeLock(on) {
  try {
    if (on && !wake && 'wakeLock' in navigator) {
      wake = await navigator.wakeLock.request('screen');
      wake.addEventListener('release', () => { wake = null; });
    } else if (!on && wake) { await wake.release(); wake = null; }
  } catch (e) { /* z. B. Akku-Sparmodus */ }
}

/* ---------------- Startseite ---------------- */
function activeSplit() { return state.splits.find((s) => s.id === state.activeSplitId) || null; }

/** Nächster Tag im Split: der Tag nach dem zuletzt trainierten */
function nextDayIndex(split) {
  const last = [...state.workouts]
    .filter((w) => w.splitId === split.id)
    .sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt))[0];
  if (!last) return 0;
  const i = split.days.findIndex((d) => d.id === last.dayId);
  return i < 0 ? 0 : (i + 1) % split.days.length;
}

function renderTrain() {
  const live = !!active;
  $('#tr-home').classList.toggle('hidden', live);
  $('#tr-live').classList.toggle('hidden', !live);
  if (live) return renderLive();

  const hasData = state.workouts.length || state.cardio.length || state.splits.length;
  $('#welcome').classList.toggle('hidden', !!hasData);

  const split = activeSplit();
  const next = $('#tr-next');
  if (split && split.days.length) {
    const idx = nextDayIndex(split);
    const day = split.days[idx];
    const sets = day.exercises.reduce((n, e) => n + e.sets, 0);
    next.innerHTML = `
      <div class="card-head"><div><div class="label">Als Nächstes · ${esc(split.name)}</div><h2 class="next-title">${esc(day.name)}</h2></div>
        <span class="muted num">${day.exercises.length} Übungen · ${sets} Sätze</span></div>
      <ul class="next-list">${day.exercises.map((e) => `<li>${exThumb(e.exId, 'mini-thumb')}<span>${esc(e.name)}</span><span class="muted num">${e.sets} × ${repRange(e)}</span></li>`).join('')}</ul>
      <button class="btn primary xl wide" data-start-day="${split.id}:${day.id}">${ic('play')}${esc(day.name)} starten</button>
      ${split.days.length > 1 ? `<div class="day-chips"><span class="muted">Anderer Tag:</span>${split.days.map((d, i) => i === idx ? '' :
        `<button class="chip" data-start-day="${split.id}:${d.id}">${esc(d.name)}</button>`).join('')}</div>` : ''}`;
  } else {
    next.innerHTML = `
      <h2>Wähle deinen Split</h2>
      <p class="muted">Ein Split ist dein Trainingsplan, z. B. Push/Pull/Legs. Nimm eine Vorlage oder bau dir deinen eigenen.</p>
      <div class="form-actions"><button class="btn primary" data-view="splits">${ic('list')}Splits ansehen</button></div>`;
  }

  // Diese Woche
  const from = ymd(mondayOf(today()));
  const ws = state.workouts.filter((w) => w.date >= from);
  const goal = split?.perWeek || 3;
  $('#tr-week').innerHTML = `
    <div class="week-dots" aria-label="${ws.length} von ${goal} Trainings diese Woche">${Array.from({ length: Math.max(goal, ws.length) }, (_, i) =>
      `<i class="${i < ws.length ? 'on' : ''}"></i>`).join('')}</div>
    <div><b>${ws.length} von ${goal}</b> Trainings diese Woche${ws.length ? ` · ${fmtKg(workoutVolume(ws.flatMap((w) => w.exercises)))}` : ''}</div>`;

  renderHomeExtras(split);

  const recent = sortedEntries().slice(0, 3);
  $('#tr-feed-head').classList.toggle('hidden', !recent.length);
  $('#tr-feed').classList.toggle('hidden', !recent.length);
  $('#tr-feed').innerHTML = recent.map(entryRow).join('');
}

/* ---------------- Startseite: Begrüßung, Habits, erste Schritte, Tipp ---------------- */
function renderHomeExtras(split) {
  const h = new Date().getHours();
  const hello = h < 5 ? 'Gute Nacht' : h < 11 ? 'Guten Morgen' : h < 18 ? 'Hallo' : 'Guten Abend';
  const first = (state.profile.name || '').trim().split(' ')[0];
  const s = computeStreaks();
  const date = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#tr-greet').innerHTML = `<div><div class="greet-date">${esc(date)}</div>
      <h1 class="large-title" id="h-train">${hello}${first ? ', ' + esc(first) : ''}</h1></div>
    ${s.current ? `<span class="greet-streak" title="Streak">${ic('flame')}<b class="num">${s.current}</b></span>` : ''}`;

  // Heute fällige Habits zum direkten Abhaken
  let habitsHtml = '';
  if (typeof ensureHabits === 'function') {
    ensureHabits();
    const k = todayKey();
    const due = dueHabits(k).filter((x) => x.kind !== 'gym');
    if (due.length) {
      const done = due.filter((x) => isDone(x, k)).length;
      habitsHtml = `<article class="card home-habits">
        <div class="card-head"><h2>Heute</h2><button class="link-btn" data-view="habits">${done} von ${due.length} erledigt${ic('chevron')}</button></div>
        <div class="h-list">${due.map((x) => habitRow(x)).join('')}</div></article>`;
    }
  }
  $('#tr-habits').innerHTML = habitsHtml;

  // Erste Schritte: solange noch nicht alles erledigt ist
  const real = state.workouts.filter((w) => !w.demo);
  const signedIn = typeof user !== 'undefined' && !!user;
  const steps = [
    { done: !!split, label: 'Plan auswählen', sub: 'Dein Split für die Woche', act: 'data-view="splits"' },
    { done: real.length > 0, label: 'Erstes Training machen', sub: 'Sätze abhaken, Pausen-Timer läuft automatisch', act: split?.days?.length ? `data-start-day="${split.id}:${split.days[nextDayIndex(split)].id}"` : 'data-start-empty' },
    { done: Object.keys(state.habitLog || {}).length > 0, label: 'Eine Gewohnheit abhaken', sub: 'Wasser, Schlaf oder Protein', act: 'data-view="habits"' },
    { done: signedIn, label: 'Konto erstellen', sub: 'Backup in der Cloud und Freunden folgen', act: 'data-auth="signup"' },
    { done: typeof social !== 'undefined' && social.following?.size > 0, label: 'Freunden folgen', sub: 'Gemeinsam dranbleiben, Skips sehen', act: 'data-view="feed"' },
  ];
  const left = steps.filter((x) => !x.done).length;
  $('#tr-start').innerHTML = left && !state.profile.hideStart ? `<article class="card start-card">
    <div class="card-head"><div><h2>Erste Schritte</h2><span class="muted">${steps.length - left} von ${steps.length} erledigt</span></div>
      <button class="icon-btn ghost" data-hide-start aria-label="Ausblenden">${ic('x')}</button></div>
    <div class="bar"><i style="width:${((steps.length - left) / steps.length) * 100}%"></i></div>
    <div class="start-list">${steps.map((x) => `<button class="start-row${x.done ? ' done' : ''}" ${x.done ? 'disabled' : x.act}>
      <span class="start-check">${x.done ? ic('check') : ''}</span>
      <span class="start-body"><b>${x.label}</b><span class="muted">${x.sub}</span></span>${x.done ? '' : ic('chevron')}</button>`).join('')}</div>
  </article>` : '';

  // Tipp des Tages: eine Übung aus dem nächsten Training
  let tipHtml = '';
  if (typeof TIPS !== 'undefined') {
    const day = split?.days?.length ? split.days[nextDayIndex(split)] : null;
    const pool = (day ? day.exercises.map((e) => e.exId) : Object.keys(TIPS)).filter((id) => TIPS[id]);
    if (pool.length) {
      const n = Math.floor(Date.now() / 86400000);
      const id = pool[n % pool.length];
      const tip = TIPS[id].how[n % TIPS[id].how.length];
      tipHtml = `<article class="card tip-card"><div class="label">Tipp des Tages · ${esc(exInfo(id).name)}</div>
        <p>${esc(tip)}</p><button class="link-btn" data-tips="${esc(id)}">Mehr zur Technik${ic('chevron')}</button></article>`;
    }
  }
  $('#tr-tip').innerHTML = tipHtml;
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('[data-hide-start]')) return;
  state.profile.hideStart = true;
  save(true);
  renderTrain();
});

/* ---------------- Training starten ---------------- */
/** Satz-Zeilen vorausfüllen: Werte vom letzten Mal, mit Progressions-Tipp */
function prefill(exId, name, target) {
  const last = lastPerformance(exId);
  const info = exInfo(exId, name);
  let hint = '';
  let bump = 0;
  if (last && target) {
    const top = last.sets.every((s) => s.reps >= target.repsMax);
    const w0 = last.sets[0].weight || 0;
    if (top && w0 > 0) {
      bump = w0 < 20 ? 1 : 2.5;
      hint = `Letztes Mal alle Sätze mit ${target.repsMax} Wdh. geschafft: heute +${fmtW(bump)} kg`;
    }
  }
  const n = target?.sets || last?.sets.length || 3;
  const sets = Array.from({ length: n }, (_, i) => {
    const p = last ? last.sets[Math.min(i, last.sets.length - 1)] : null;
    return {
      weight: p ? (p.weight || 0) + (p.weight ? bump : 0) : 0,
      reps: bump ? target.repsMin : p ? p.reps : target ? target.repsMax : 10,
      prev: p ? fmtSet(p) : '',
      done: false,
    };
  });
  return { exId, name: name || info.name, target: target || null, sets, hint };
}

function beginWorkout(w) {
  unlockAudio();
  active = { id: uid(), startedAt: Date.now(), ...w };
  persistActive();
  wakeLock(true);
  showView('train');
}

function startDay(splitId, dayId) {
  if (active) return toast('Es läuft schon ein Training');
  const split = state.splits.find((s) => s.id === splitId);
  const day = split?.days.find((d) => d.id === dayId);
  if (!day) return;
  beginWorkout({
    title: day.name, splitId, dayId, splitName: split.name,
    exercises: day.exercises.map((e) => prefill(e.exId, e.name, { sets: e.sets, repsMin: e.repsMin, repsMax: e.repsMax, rest: e.rest, tempo: e.tempo })),
  });
}
function startEmpty() {
  if (active) return toast('Es läuft schon ein Training');
  beginWorkout({ title: 'Freies Training', exercises: [] });
  openPicker(addExerciseToActive);
}
/** Ziel je Übung aus einem fertigen Training (Satzzahl und Wdh. wie dort) */
function targetsFrom(w) {
  return w.exercises.filter((e) => doneSets(e).length).map((e) => {
    const s = doneSets(e);
    const reps = Math.max(...s.map((x) => x.reps || 0)) || 10;
    return { exId: e.exId, name: e.name, sets: s.length, repsMin: reps, repsMax: reps, rest: 90, tempo: '2-0-1-0' };
  });
}
function repeatWorkout(id) {
  if (active) return toast('Es läuft schon ein Training');
  const w = state.workouts.find((x) => x.id === id);
  if (!w) return;
  beginWorkout({
    title: w.title, splitId: w.splitId, dayId: w.dayId, splitName: w.splitName,
    exercises: targetsFrom(w).map((t) => prefill(t.exId, t.name, t)),
  });
}
/** Training einer anderen Person nachmachen (mit deinen eigenen Gewichten vom letzten Mal) */
function copyWorkout(w, who) {
  if (active) return toast('Es läuft schon ein Training');
  closeModal();
  beginWorkout({ title: w.title, exercises: targetsFrom(w).map((t) => prefill(t.exId, t.name, t)) });
  toast(`Training von ${who} gestartet`);
}
/** Training einer anderen Person als neuen Tag in den aktiven Split übernehmen */
function copyWorkoutToSplit(w, who) {
  let split = activeSplit();
  if (!split) {
    split = { id: uid(), name: 'Mein Split', goal: 'Muskelaufbau', level: '', perWeek: 3, description: '', days: [], createdAt: new Date().toISOString() };
    state.splits.push(split);
    state.activeSplitId = split.id;
  }
  const day = { id: uid(), name: w.title || 'Tag ' + String.fromCharCode(65 + split.days.length), exercises: targetsFrom(w) };
  split.days.push(day);
  save();
  closeModal();
  toast(`„${day.name}“ von ${who} zu ${split.name} hinzugefügt`);
}
function addExerciseToActive(exId) {
  const info = exInfo(exId);
  active.exercises.push(prefill(exId, info.name, { sets: 3, repsMin: 8, repsMax: 12, rest: 90, tempo: '2-0-1-0' }));
  persistActive();
  renderLive();
  requestAnimationFrame(() => $(`#tr-live .lx[data-ex="${active.exercises.length - 1}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

function persistActive() {
  try {
    if (active) localStorage.setItem(ACTIVE_KEY, JSON.stringify({ ...active, rest }));
    else localStorage.removeItem(ACTIVE_KEY);
  } catch (e) { /* ignore */ }
}
function restoreWorkout() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(ACTIVE_KEY)); } catch (e) { return; }
  if (!d || !d.exercises) return;
  rest = d.rest && d.rest.end > Date.now() ? d.rest : null;
  delete d.rest;
  active = d;
  wakeLock(true);
  showView('train');
  if (rest) startRestTicker();
  toast('Training wird fortgesetzt');
}

/* ---------------- Live-Training ---------------- */
function elapsedSec() { return active ? Math.round((Date.now() - active.startedAt) / 1000) : 0; }

/** Bisheriger Bestwert einer Übung (ohne das laufende Training) */
function historicBest(exId, bw) {
  let best = 0;
  for (const w of state.workouts) for (const e of w.exercises) {
    if (e.exId !== exId) continue;
    for (const s of doneSets(e)) {
      if (bw ? !s.weight : s.weight) best = Math.max(best, bw ? s.reps : e1rm(s.weight, s.reps));
    }
  }
  return best;
}
const hasHistory = (exId) => state.workouts.some((w) => w.exercises.some((e) => e.exId === exId));

function renderLive() {
  const doneCount = active.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  const total = active.exercises.reduce((n, e) => n + e.sets.length, 0);
  $('#lv-title').textContent = active.title;
  $('#lv-sub').textContent = `${active.splitName ? active.splitName + ' · ' : ''}${doneCount}/${total} Sätze`;
  $('#lv-progress').style.width = total ? (doneCount / total) * 100 + '%' : '0';
  updateLiveVolume();
  $('#lv-list').innerHTML = active.exercises.map((e, i) => {
    const info = exInfo(e.exId, e.name);
    const t = e.target;
    return `<section class="card lx" data-ex="${i}">
      <div class="lx-head">
        ${exThumb(e.exId, 'lx-thumb')}
        <div class="lx-name"><h3>${esc(e.name)}</h3>
          <div class="muted">${GROUPS[info.group]}${t ? ` · Ziel ${t.sets} × ${repRange(t)}` : ''}${t?.tempo && t.tempo !== '2-0-1-0' ? ` · Tempo ${esc(t.tempo)}` : ''}</div></div>
        <button class="icon-btn ghost" data-ex-menu="${i}" aria-label="Optionen für ${esc(e.name)}">${ic('more')}</button>
      </div>
      ${e.hint ? `<p class="lx-hint">${ic('arrow-up')}${esc(e.hint)}</p>` : ''}
      <div class="sets">
        <div class="set-row head"><span>Satz</span><span>Letztes Mal</span><span>kg</span><span>Wdh.</span><span class="sr-only">Erledigt</span></div>
        ${e.sets.map((s, j) => `<div class="set-row${s.done ? ' done' : ''}${s.pr ? ' pr' : ''}" data-ex="${i}" data-set="${j}">
          <span class="set-no">${s.pr ? ic('trophy') : j + 1}</span>
          <span class="set-prev">${esc(s.prev) || '–'}</span>
          <input class="set-in" data-f="weight" type="number" inputmode="decimal" step="0.5" min="0" value="${s.weight || ''}" placeholder="0" aria-label="Gewicht Satz ${j + 1}" />
          <input class="set-in" data-f="reps" type="number" inputmode="numeric" min="0" value="${s.reps || ''}" placeholder="0" aria-label="Wiederholungen Satz ${j + 1}" />
          <button class="set-check" data-check="${i}:${j}" aria-pressed="${s.done}" aria-label="Satz ${j + 1} erledigt">${ic('check')}</button>
        </div>`).join('')}
      </div>
      <div class="lx-actions">
        <button class="btn sm" data-add-set="${i}">${ic('plus')}Satz</button>
        <button class="btn sm" data-tips="${esc(e.exId)}">${ic('info')}Tipps</button>
        <button class="btn sm" data-coach="${i}">${ic('timer')}Tempo-Coach</button>
      </div>
    </section>`;
  }).join('') || '<div class="card empty"><p>Noch keine Übung. Füge deine erste hinzu.</p></div>';
  renderRestBar();
  tickClock();
}

function updateLiveVolume() {
  const vol = workoutVolume(active.exercises.map((e) => ({ sets: e.sets.filter((s) => s.done) })));
  $('#lv-vol').textContent = fmtKg(vol);
}
function tickClock() { if (active) $('#lv-clock').textContent = fmtDur(elapsedSec()); }

function toggleSet(i, j) {
  const e = active.exercises[i];
  const s = e.sets[j];
  const row = $(`#tr-live .set-row[data-ex="${i}"][data-set="${j}"]`);
  // aktuelle Eingaben übernehmen
  s.weight = Math.max(0, parseFloat(row.querySelector('[data-f=weight]').value) || 0);
  s.reps = Math.max(0, parseInt(row.querySelector('[data-f=reps]').value, 10) || 0);
  if (!s.done && !s.reps) return toast('Bitte Wiederholungen eintragen');
  s.done = !s.done;
  s.pr = false;
  if (s.done) {
    // Rekord? Nur wenn es schon Trainings mit dieser Übung gibt und kein anderer Satz heute besser war
    const bw = !s.weight;
    const score = bw ? s.reps : e1rm(s.weight, s.reps);
    const todayBest = Math.max(0, ...e.sets.filter((x, k) => k !== j && x.done && !x.weight === bw).map((x) => (bw ? x.reps : e1rm(x.weight, x.reps))));
    const prev = historicBest(e.exId, bw);
    if (hasHistory(e.exId) && score > prev + 0.01 && score > todayBest) {
      e.sets.forEach((x) => { if (x.pr && !x.weight === bw) x.pr = false; });
      s.pr = true;
      toast(`${ic('trophy')}Neuer Rekord: ${esc(e.name)} ${bw ? s.reps + ' Wdh.' : '· 1RM ≈ ' + fmtW(Math.round(score)) + ' kg'}`, 'pr');
      buzz([80, 60, 80, 60, 160]);
      beep(1320, 120); setTimeout(() => beep(1760, 200), 130);
    } else {
      buzz(40);
    }
    if (state.settings.autoRest) startRest(e.target?.rest || 90);
  }
  persistActive();
  renderLive();
}

/* ---------------- Pausen-Timer ---------------- */
function startRest(sec) {
  rest = { end: Date.now() + sec * 1000, total: sec * 1000, warned: false };
  persistActive();
  startRestTicker();
}
function startRestTicker() {
  clearInterval(restTimer);
  restTimer = setInterval(restTick, 250);
  restTick();
}
function restTick() {
  if (!rest) return renderRestBar();
  const left = rest.end - Date.now();
  if (left <= 3000 && left > 0 && !rest.warned) { rest.warned = true; beep(660, 80); setTimeout(() => beep(660, 80), 1000); setTimeout(() => beep(660, 80), 2000); }
  if (left <= 0) {
    rest = null;
    clearInterval(restTimer);
    beep(990, 220);
    buzz([200, 100, 200]);
    say('Weiter geht’s');
    persistActive();
  }
  renderRestBar();
}
function renderRestBar() {
  const bar = $('#rest-bar');
  const show = !!(active && rest);
  bar.classList.toggle('hidden', !show);
  document.body.classList.toggle('resting', show);
  if (!show) return;
  const left = Math.max(0, rest.end - Date.now());
  $('#rest-time').textContent = fmtDur(Math.ceil(left / 1000));
  $('#rest-fill').style.width = (1 - left / rest.total) * 100 + '%';
}
function adjustRest(d) {
  if (!rest) return;
  rest.end += d * 1000;
  rest.total = Math.max(1000, rest.total + d * 1000);
  if (rest.end - Date.now() > 3000) rest.warned = false;
  persistActive();
  restTick();
}

/* ---------------- Optionen pro Übung ---------------- */
function exerciseMenu(i) {
  const e = active.exercises[i];
  openModal(`
    <h3>${esc(e.name)}</h3>
    <div class="menu-list">
      <button class="menu-item" data-mx="swap:${i}">${ic('swap')}Übung austauschen</button>
      ${i > 0 ? `<button class="menu-item" data-mx="up:${i}">${ic('arrow-up')}Nach oben schieben</button>` : ''}
      ${e.sets.length > 1 ? `<button class="menu-item" data-mx="delset:${i}">${ic('x')}Letzten Satz entfernen</button>` : ''}
      <button class="menu-item danger" data-mx="del:${i}">${ic('trash')}Übung entfernen</button>
    </div>
    <div class="modal-actions"><button class="btn" data-close>Schließen</button></div>`);
}
function onMenu(action, i) {
  const list = active.exercises;
  closeModal();
  if (action === 'up') [list[i - 1], list[i]] = [list[i], list[i - 1]];
  if (action === 'delset') list[i].sets.pop();
  if (action === 'del') { if (!confirm(`${list[i].name} entfernen?`)) return; list.splice(i, 1); }
  if (action === 'swap') {
    return openPicker((exId) => {
      const info = exInfo(exId);
      const old = list[i];
      list[i] = prefill(exId, info.name, old.target || { sets: old.sets.length, repsMin: 8, repsMax: 12, rest: 90, tempo: '2-0-1-0' });
      persistActive(); renderLive();
    });
  }
  persistActive();
  renderLive();
}

/* ---------------- Abschluss ---------------- */
function finishPrompt() {
  const exercises = active.exercises.map((e) => ({ ...e, sets: e.sets.filter((s) => s.done && s.reps > 0) })).filter((e) => e.sets.length);
  if (!exercises.length) {
    if (confirm('Noch kein Satz abgehakt. Training verwerfen?')) discardWorkout();
    return;
  }
  const open = active.exercises.reduce((n, e) => n + e.sets.filter((s) => !s.done).length, 0);
  const prs = exercises.reduce((n, e) => n + e.sets.filter((s) => s.pr).length, 0);
  openModal(`
    <form class="form" id="finish-form">
      <h3>Training abschließen</h3>
      ${open ? `<p class="muted">${open} Satz${open === 1 ? '' : 'e'} nicht abgehakt – ${open === 1 ? 'wird' : 'werden'} nicht gespeichert.</p>` : ''}
      <div class="act-stats">
        <div><div class="label">Dauer</div><div class="value">${fmtDur(elapsedSec())}</div></div>
        <div><div class="label">Volumen</div><div class="value">${fmtKg(workoutVolume(exercises))}</div></div>
        <div><div class="label">Sätze</div><div class="value">${workoutSetCount(exercises)}</div></div>
        ${prs ? `<div><div class="label">Rekorde</div><div class="value pr-val">${ic('trophy')}${prs}</div></div>` : ''}
      </div>
      <label>Titel <input name="title" value="${esc(active.title)}" maxlength="60" /></label>
      <div class="row">
        <label>Gefühl <select name="feel"><option value="">–</option><option>Hart</option><option>Okay</option><option>Gut</option><option>Super</option></select></label>
        <label>Wer sieht das? <select name="visibility">${Object.entries(VISIBILITY).map(([k, v]) =>
          `<option value="${k}"${k === (state.profile.visibility || 'public') ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      </div>
      <label>Notizen <textarea name="notes" rows="2" placeholder="Wie lief's?"></textarea></label>
      <div class="form-actions">
        <button class="btn primary" type="submit">${ic('check')}Speichern</button>
        <button class="btn" type="button" data-close>Weiter trainieren</button>
        <button class="btn danger" type="button" data-discard>Verwerfen</button>
      </div>
    </form>`);
}
function saveWorkout(f) {
  const exercises = active.exercises
    .map((e) => ({ exId: e.exId, name: e.name, sets: e.sets.filter((s) => s.done && s.reps > 0).map((s) => ({ weight: s.weight || 0, reps: s.reps, ...(s.pr ? { pr: true } : {}) })) }))
    .filter((e) => e.sets.length);
  const date = ymd(today());
  const w = {
    id: active.id, date, title: f.title.value.trim() || active.title,
    splitId: active.splitId, dayId: active.dayId, splitName: active.splitName,
    durationSec: Math.max(60, elapsedSec()), exercises,
    prs: exercises.reduce((n, e) => n + e.sets.filter((s) => s.pr).length, 0),
    feel: f.feel.value, notes: f.notes.value.trim(), visibility: f.visibility.value,
    createdAt: new Date().toISOString(),
  };
  state.workouts.push(w);
  delete state.marks[date];
  save();
  endWorkout();
  closeModal();
  say('Training gespeichert. Stark!');
  showView('train');
  showWorkout(w.id);
}
function discardWorkout() {
  closeModal();
  endWorkout();
  toast('Training verworfen');
  showView('train');
}
function endWorkout() {
  active = null;
  rest = null;
  clearInterval(restTimer);
  persistActive();
  wakeLock(false);
  renderRestBar();
}

/* ---------------- Übungsauswahl (auch vom Split-Baukasten genutzt) ---------------- */
let pickerCb = null;
let pickerGroup = '';
function openPicker(cb) {
  pickerCb = cb;
  pickerGroup = '';
  openModal(`
    <h3>Übung wählen</h3>
    <input type="search" id="pk-search" placeholder="Suchen, z. B. Bankdrücken" autocomplete="off" />
    <div class="chips" id="pk-groups">
      <button class="chip active" data-pk-group="">Alle</button>
      ${Object.entries(GROUPS).map(([k, v]) => `<button class="chip" data-pk-group="${k}">${v}</button>`).join('')}
    </div>
    <div class="pk-list" id="pk-list"></div>
    <details class="pk-custom">
      <summary>${ic('plus')}Eigene Übung anlegen</summary>
      <form class="form" id="pk-custom-form">
        <label>Name <input name="name" required maxlength="40" placeholder="z. B. Kabelzug Crossover" /></label>
        <label>Muskelgruppe <select name="group">${Object.entries(GROUPS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
        <div class="form-actions"><button class="btn" type="submit">${ic('check')}Anlegen und wählen</button></div>
      </form>
    </details>
    <div class="modal-actions"><button class="btn" data-close>Abbrechen</button></div>`, 'tall');
  renderPickerList();
  $('#pk-search').addEventListener('input', renderPickerList);
}
function renderPickerList() {
  const q = ($('#pk-search')?.value || '').trim().toLowerCase();
  const list = allExercises().filter((e) => (!pickerGroup || e.group === pickerGroup) && (!q || e.name.toLowerCase().includes(q)));
  $('#pk-list').innerHTML = list.map((e) => `<div class="pk-row"><button class="pk-item" data-pick="${e.id}">
      ${exThumb(e.id, 'mini-thumb')}<span><b>${esc(e.name)}</b><small class="muted">${GROUPS[e.group]}</small></span></button>
      ${TIPS[e.id] ? `<button class="icon-btn ghost" data-tips="${e.id}" aria-label="Tipps zu ${esc(e.name)}">${ic('info')}</button>` : ''}</div>`).join('')
    || '<p class="muted">Nichts gefunden. Leg die Übung unten selbst an.</p>';
}
function pick(exId) {
  const cb = pickerCb;
  pickerCb = null;
  closeModal();
  if (cb) cb(exId);
}

/* ---------------- Events ---------------- */
function initWorkout() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-start-day],[data-start-empty],[data-check],[data-add-set],[data-ex-menu],[data-mx],[data-pick],[data-pk-group],[data-discard],[data-demo-ex],[data-coach]');
    if (!el) return;
    const ds = el.dataset;
    if (ds.startDay) { const [s, d] = ds.startDay.split(':'); startDay(s, d); }
    else if (ds.startEmpty !== undefined) startEmpty();
    else if (ds.check) { const [i, j] = ds.check.split(':').map(Number); toggleSet(i, j); }
    else if (ds.addSet) {
      const ex = active.exercises[+ds.addSet];
      const last = ex.sets[ex.sets.length - 1];
      ex.sets.push({ weight: last?.weight || 0, reps: last?.reps || 10, prev: '', done: false });
      persistActive(); renderLive();
    } else if (ds.exMenu) exerciseMenu(+ds.exMenu);
    else if (ds.mx) { const [a, i] = ds.mx.split(':'); onMenu(a, +i); }
    else if (ds.pick) pick(ds.pick);
    else if (ds.pkGroup !== undefined) {
      pickerGroup = ds.pkGroup;
      $$('#pk-groups .chip').forEach((c) => c.classList.toggle('active', c === el));
      renderPickerList();
    } else if (ds.discard !== undefined) { if (confirm('Training wirklich verwerfen? Nichts wird gespeichert.')) discardWorkout(); }
    else if (ds.demoEx) { const ex = active.exercises[+ds.demoEx]; openDemo(ex.exId, ex.target?.tempo || '2-0-1-0'); }
    else if (ds.coach) openCoach(+ds.coach);
  });
  // Eingaben sofort merken (ohne neu zu zeichnen, damit der Fokus bleibt)
  $('#tr-live').addEventListener('input', (e) => {
    const inp = e.target.closest('.set-in');
    if (!inp) return;
    const row = inp.closest('.set-row');
    const s = active.exercises[+row.dataset.ex].sets[+row.dataset.set];
    s[inp.dataset.f] = inp.dataset.f === 'weight' ? Math.max(0, parseFloat(inp.value) || 0) : Math.max(0, parseInt(inp.value, 10) || 0);
    if (s.done) updateLiveVolume();
    persistActive();
  });
  $('#tr-live').addEventListener('focusin', (e) => { if (e.target.classList.contains('set-in')) e.target.select(); });
  document.addEventListener('submit', (e) => {
    if (e.target.getAttribute('id') === 'finish-form') { e.preventDefault(); saveWorkout(e.target); }
    if (e.target.getAttribute('id') === 'pk-custom-form') {
      e.preventDefault();
      const f = e.target;
      const ex = { id: 'c-' + uid(), name: f.name.value.trim(), group: f.group.value, model: null, custom: true };
      if (!ex.name) return;
      state.customExercises.push(ex);
      save();
      pick(ex.id);
    }
  });
  $('#lv-add').addEventListener('click', () => openPicker(addExerciseToActive));
  $('#lv-finish').addEventListener('click', finishPrompt);
  $('#rest-minus').addEventListener('click', () => adjustRest(-15));
  $('#rest-plus').addEventListener('click', () => adjustRest(15));
  $('#rest-skip').addEventListener('click', () => { rest = null; persistActive(); restTick(); });
  clockTimer = setInterval(tickClock, 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && active) { wakeLock(true); restTick(); }
  });
}
