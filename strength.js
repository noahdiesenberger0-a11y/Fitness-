'use strict';

/* ============================================================
 *  Kraft-Modus: Sätze & Wiederholungen mit Tempo-Animation
 *  Nutzt Helfer aus app.js ($, state, save, uid, ymd, today, toast, showView, esc, fmtDur …)
 * ============================================================ */

/**
 * start: 'top'    → Übung beginnt oben, erst runter (Drücken, Kniebeugen …)
 *        'bottom' → Übung beginnt unten, erst hoch (Ziehen, Curls, Kreuzheben …)
 */
const EXERCISES = [
  { id: 'bench',    name: 'Bankdrücken',          start: 'top', con: 'Drücken', ecc: 'Runter' },
  { id: 'squat',    name: 'Kniebeugen',           start: 'top', con: 'Hoch', ecc: 'Runter' },
  { id: 'deadlift', name: 'Kreuzheben',           start: 'bottom', con: 'Hoch', ecc: 'Ablassen' },
  { id: 'ohp',      name: 'Schulterdrücken',      start: 'top', con: 'Drücken', ecc: 'Runter' },
  { id: 'row',      name: 'Langhantelrudern',     start: 'bottom', con: 'Ziehen', ecc: 'Ablassen' },
  { id: 'pullup',   name: 'Klimmzüge',            start: 'bottom', con: 'Ziehen', ecc: 'Ablassen' },
  { id: 'pushup',   name: 'Liegestütze',          start: 'top', con: 'Drücken', ecc: 'Runter' },
  { id: 'dips',     name: 'Dips',                 start: 'top', con: 'Drücken', ecc: 'Runter' },
  { id: 'curl',     name: 'Bizeps-Curls',         start: 'bottom', con: 'Hoch', ecc: 'Runter' },
  { id: 'lunge',    name: 'Ausfallschritte',      start: 'top', con: 'Hoch', ecc: 'Runter' },
  { id: 'legpress', name: 'Beinpresse',           start: 'top', con: 'Drücken', ecc: 'Beugen' },
  { id: 'latpull',  name: 'Latzug',               start: 'bottom', con: 'Ziehen', ecc: 'Nachlassen' },
  { id: 'incline',  name: 'Schrägbankdrücken',    start: 'top', con: 'Drücken', ecc: 'Runter' },
  { id: 'triceps',  name: 'Trizepsdrücken',       start: 'bottom', con: 'Drücken', ecc: 'Zurück' },
  { id: 'calf',     name: 'Wadenheben',           start: 'bottom', con: 'Hoch', ecc: 'Runter' },
  { id: 'custom',   name: 'Eigene Übung …',       start: 'top', con: 'Hoch', ecc: 'Runter' },
];

const ST_KEY = 'pulse.strength';
const COUNTDOWN_MS = 3000;

/* ---------------- Helfer (auch von app.js genutzt) ---------------- */
function fmtKg(kg) {
  return kg >= 1000 ? (kg / 1000).toFixed(1).replace('.', ',') + ' t' : Math.round(kg) + ' kg';
}
function workoutVolume(exercises) {
  return exercises.reduce((v, e) => v + e.sets.reduce((s, x) => s + x.reps * (x.weight || 0), 0), 0);
}
/** "3×8 @ 60 kg" bzw. "8, 8, 6 @ 60 kg" wenn die Sätze unterschiedlich waren */
function exerciseShort(e) {
  const reps = e.sets.map((s) => s.reps);
  const same = reps.every((r) => r === reps[0]);
  const w = e.sets[0]?.weight ? ` @ ${String(e.sets[0].weight).replace('.', ',')} kg` : '';
  return (same ? `${reps.length}×${reps[0]}` : reps.join(', ')) + w;
}
function exercisesTable(exercises) {
  return `<h3 style="margin-top:14px">Übungen</h3><table class="splits ex-table">
    <thead><tr><th>Übung</th><th>Sätze</th><th>Volumen</th></tr></thead>
    <tbody>${exercises.map((e) => `<tr>
      <td><b>${esc(e.name)}</b>${e.tempo ? `<div class="muted">Tempo ${esc(e.tempo)}</div>` : ''}</td>
      <td>${e.sets.map((s, i) => `<div>${i + 1}. ${s.reps} × ${s.weight ? String(s.weight).replace('.', ',') + ' kg' : 'Körpergewicht'}${
        s.target && s.reps < s.target ? ` <span class="diff up">(${s.target})</span>` : ''}</div>`).join('')}</td>
      <td>${workoutVolume([e]) ? fmtKg(workoutVolume([e])) : '–'}</td></tr>`).join('')}</tbody></table>`;
}
/** Bestleistungen: schwerstes Gewicht je Übung (Top 4) */
function strengthPRs() {
  const best = {};
  for (const a of state.activities) for (const e of a.exercises || []) for (const s of e.sets) {
    if (s.weight > 0 && s.reps > 0 && (!best[e.name] || s.weight > best[e.name].w || (s.weight === best[e.name].w && s.reps > best[e.name].r))) {
      best[e.name] = { w: s.weight, r: s.reps, a };
    }
  }
  return Object.entries(best).sort((x, y) => y[1].w - x[1].w).slice(0, 4)
    .map(([name, b]) => [`Max. ${name}`, `${String(b.w).replace('.', ',')} kg × ${b.r}`, b.a]);
}

function parseTempo(str) {
  const p = String(str).split('-').map(Number);
  if (p.length !== 4 || p.some((x) => isNaN(x) || x < 0) || p[0] + p[2] <= 0) return null;
  return { down: p[0], holdBottom: p[1], up: p[2], holdTop: p[3] };
}

/* ---------------- Plan ---------------- */
let plan = loadPlan();
function loadPlan() {
  try {
    const d = JSON.parse(localStorage.getItem(ST_KEY));
    if (d && Array.isArray(d.plan)) return d;
  } catch (e) { /* ignore */ }
  return { plan: [{ exId: 'bench', name: 'Bankdrücken', start: 'top', sets: 3, reps: 8, weight: 40, tempo: '3-1-1-0', rest: 90 }],
    sound: true, voice: true, vibrate: true };
}
function savePlan() { try { localStorage.setItem(ST_KEY, JSON.stringify(plan)); } catch (e) { /* ignore */ } }

function renderPlan() {
  const list = plan.plan;
  const totalSets = list.reduce((n, e) => n + e.sets, 0);
  const estSec = list.reduce((n, e) => {
    const t = parseTempo(e.tempo);
    const cyc = t ? t.down + t.holdBottom + t.up + t.holdTop : 4;
    return n + e.sets * (e.reps * cyc + COUNTDOWN_MS / 1000) + (e.sets - 1) * e.rest;
  }, 0) + Math.max(0, list.length - 1) * 90;
  $('#st-plan-sum').textContent = list.length ? `${totalSets} Sätze · ca. ${Math.round(estSec / 60)} min` : '';
  $('#st-plan').innerHTML = list.length ? list.map((e, i) => `
    <div class="plan-item">
      ${window.Model3D?.ready
        ? `<img class="plan-thumb" src="${Model3D.thumb(e.exId)}" alt="" />`
        : `<svg class="model plan-thumb" viewBox="${modelViewBox(e.exId)}" aria-hidden="true">${modelSvg(e.exId, 0.5)}</svg>`}
      <div class="plan-body">
        <div class="plan-name">${esc(e.name)}</div>
        <div class="muted">${e.sets} × ${e.reps} Wdh. · ${e.weight ? String(e.weight).replace('.', ',') + ' kg' : 'Körpergewicht'} · Tempo ${esc(e.tempo)} · Pause ${fmtDur(e.rest)}</div>
      </div>
      <div class="plan-act">
        ${i ? `<button class="icon-btn" data-plan-up="${i}" aria-label="${esc(e.name)} nach oben schieben">${ic('arrow-up')}</button>` : ''}
        <button class="icon-btn" data-plan-del="${i}" aria-label="${esc(e.name)} entfernen">${ic('x')}</button>
      </div>
    </div>`).join('') : '<p class="muted">Füge unten deine erste Übung hinzu.</p>';
  $('#st-start').disabled = !list.length;
}

function onAddExercise(e) {
  e.preventDefault();
  const f = e.target;
  const ex = EXERCISES.find((x) => x.id === f.exercise.value);
  const name = ex.id === 'custom' ? f.custom.value.trim() : ex.name;
  if (!name) return toast('Bitte einen Namen für die Übung eingeben');
  const tempo = f.tempo.value === 'custom' ? f.tempoCustom.value.trim() : f.tempo.value;
  if (!parseTempo(tempo)) return toast('Tempo bitte so angeben: 3-1-1-0');
  const sets = Math.max(1, Math.min(20, parseInt(f.sets.value, 10) || 1));
  const reps = Math.max(1, Math.min(100, parseInt(f.reps.value, 10) || 1));
  const weight = Math.max(0, parseFloat(String(f.weight.value).replace(',', '.')) || 0);
  plan.plan.push({ exId: ex.id, name, start: ex.start, sets, reps, weight, tempo, rest: parseInt(f.rest.value, 10) });
  savePlan();
  renderPlan();
  toast(`${name} hinzugefügt`);
}

/* ---------------- Ton, Sprache, Vibration ---------------- */
let audioCtx = null;
function beep(freq = 880, ms = 90, vol = 0.18) {
  if (!plan.sound || !audioCtx) return;
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
  if (!plan.voice || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'de-DE';
  u.rate = 1.1;
  speechSynthesis.speak(u);
}
function buzz(p) { if (plan.vibrate && navigator.vibrate) navigator.vibrate(p); }

let stWake = null;
async function stWakeLock(on) {
  try {
    if (on && !stWake && 'wakeLock' in navigator) {
      stWake = await navigator.wakeLock.request('screen');
      stWake.addEventListener('release', () => { stWake = null; });
    } else if (!on && stWake) { await stWake.release(); stWake = null; }
  } catch (e) { /* ignore */ }
}

/* ---------------- Trainings-Ablauf ----------------
 * Stufen: countdown → set → rest → countdown → set … → done
 * Zeit wird pro Stufe in ms gezählt (pausierbar).
 */
const W = { active: false, paused: false, stage: 'idle', exIdx: 0, setIdx: 0, stageMs: 0, stageLen: 0,
  lastTs: 0, totalMs: 0, raf: 0, lastKey: '', results: [], repsDone: 0, restExtra: 0 };

const curEx = () => plan.plan[W.exIdx];

/** Phasen einer Wiederholung je nach Startposition. pos: 0 = unten, 1 = oben */
const exDef = (ex) => EXERCISES.find((e) => e.id === ex.exId) || EXERCISES[EXERCISES.length - 1];

function phasesFor(ex) {
  const t = parseTempo(ex.tempo);
  const def = exDef(ex);
  const down = { key: 'down', label: def.ecc || 'Runter', ms: t.down * 1000, from: 1, to: 0 };
  const holdB = { key: 'holdB', label: 'Halten', ms: t.holdBottom * 1000, from: 0, to: 0 };
  const up = { key: 'up', label: def.con || 'Hoch', ms: t.up * 1000, from: 0, to: 1 };
  const holdT = { key: 'holdT', label: 'Halten', ms: t.holdTop * 1000, from: 1, to: 1 };
  const seq = ex.start === 'top' ? [down, holdB, up, holdT] : [up, holdT, down, holdB];
  return seq.filter((p) => p.ms > 0);
}
const cycleMs = (ex) => phasesFor(ex).reduce((n, p) => n + p.ms, 0);

function startWorkout() {
  if (!plan.plan.length) return;
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch (e) { audioCtx = null; }
  Object.assign(W, { active: true, paused: false, exIdx: 0, setIdx: 0, totalMs: 0, restExtra: 0,
    results: plan.plan.map((e) => ({ name: e.name, tempo: e.tempo, sets: [] })) });
  $('#st-setup').classList.add('hidden');
  $('#st-summary').classList.add('hidden');
  $('#st-player').classList.remove('hidden');
  document.body.classList.add('training');
  stWakeLock(true);
  enterStage('countdown');
  W.lastTs = performance.now();
  cancelAnimationFrame(W.raf);
  W.raf = requestAnimationFrame(tick);
  window.scrollTo(0, 0);
}

function enterStage(stage) {
  const ex = curEx();
  W.stage = stage;
  W.stageMs = 0;
  W.lastKey = '';
  if (stage === 'countdown') W.stageLen = COUNTDOWN_MS;
  if (stage === 'set') { W.stageLen = ex.reps * cycleMs(ex); W.repsDone = 0; say('Los'); }
  if (stage === 'rest') { W.stageLen = (W.restLen || 60) * 1000; }
  renderPlayerStatic();
}

function finishSet(repsDone) {
  const ex = curEx();
  W.results[W.exIdx].sets.push({ reps: repsDone, target: ex.reps, weight: ex.weight });
  beep(1320, 160); setTimeout(() => beep(1760, 220), 170);
  buzz([120, 80, 120]);
  const lastSetOfEx = W.setIdx >= ex.sets - 1;
  const lastEx = W.exIdx >= plan.plan.length - 1;
  if (lastSetOfEx && lastEx) return finishWorkout();
  // Pause: zwischen Sätzen die eingestellte Pause, zwischen Übungen 90 s
  W.restLen = lastSetOfEx ? Math.max(90, ex.rest) : ex.rest;
  say(repsDone >= ex.reps ? 'Satz geschafft. Pause.' : 'Pause.');
  enterStage('rest');
  $('#pl-done').value = repsDone;
}

function nextSet() {
  // Ergebnis aus der Pause übernehmen (ggf. angepasste Wiederholungen)
  const lastRes = W.results[W.exIdx].sets[W.results[W.exIdx].sets.length - 1];
  if (lastRes) lastRes.reps = Math.max(0, parseInt($('#pl-done').value, 10) || 0);
  if (W.setIdx >= curEx().sets - 1) { W.exIdx++; W.setIdx = 0; } else W.setIdx++;
  enterStage('countdown');
}

function tick(ts) {
  if (!W.active) return;
  // Im Satz Sprünge begrenzen (App war im Hintergrund), Pause läuft in Echtzeit weiter
  const dt = W.stage === 'set' ? Math.min(ts - W.lastTs, 1000) : ts - W.lastTs;
  W.lastTs = ts;
  if (!W.paused) {
    W.stageMs += dt;
    W.totalMs += dt;
    if (W.stage === 'countdown') updateCountdown();
    else if (W.stage === 'set') updateSet();
    else if (W.stage === 'rest') updateRest();
  }
  $('#pl-clock').textContent = fmtDur(W.totalMs / 1000);
  W.raf = requestAnimationFrame(tick);
}

function updateCountdown() {
  const left = Math.ceil((W.stageLen - W.stageMs) / 1000);
  if (W.stageMs >= W.stageLen) return enterStage('set');
  const key = 'c' + left;
  if (key !== W.lastKey) {
    W.lastKey = key;
    beep(660, 80);
    if (left === 3) say(`${curEx().name}. Satz ${W.setIdx + 1}`);
  }
  $('#pl-phase').textContent = left;
  $('#pl-phase').className = 'pl-phase countdown';
  setBar(curEx().start === 'top' ? 1 : 0);
  $('#pl-phasefill').style.width = (W.stageMs / W.stageLen) * 100 + '%';
}

function updateSet() {
  const ex = curEx();
  const cyc = cycleMs(ex);
  if (W.stageMs >= W.stageLen) { W.repsDone = ex.reps; renderRep(); return finishSet(ex.reps); }
  const rep = Math.floor(W.stageMs / cyc);
  let t = W.stageMs - rep * cyc;
  const phases = phasesFor(ex);
  let ph = phases[0];
  for (const p of phases) { if (t < p.ms) { ph = p; break; } t -= p.ms; }
  const prog = Math.min(1, t / ph.ms);

  // Wiederholung abgeschlossen?
  if (rep > W.repsDone) {
    W.repsDone = rep;
    renderRep();
    say(String(rep));
    buzz(60);
  }
  // Phasenwechsel → Ton
  const key = rep + ph.key;
  if (key !== W.lastKey) {
    W.lastKey = key;
    if (ph.key === 'up') beep(990, 90);
    else if (ph.key === 'down') beep(520, 90);
    else beep(740, 50, 0.08);
  }
  const eased = 0.5 - Math.cos(prog * Math.PI) / 2; // weich beschleunigen/abbremsen
  setBar(ph.from + (ph.to - ph.from) * eased);
  const secLeft = Math.ceil((ph.ms - t) / 1000);
  $('#pl-phase').textContent = `${ph.label}${ph.ms >= 1500 ? ' · ' + secLeft : ''}`;
  $('#pl-phase').className = 'pl-phase ' + ph.key;
  $('#pl-phasefill').style.width = prog * 100 + '%';
  $('#pl-phasefill').className = ph.key;
}

function updateRest() {
  const left = Math.max(0, W.stageLen - W.stageMs);
  const sec = Math.ceil(left / 1000);
  $('#pl-rest-time').textContent = fmtDur(sec);
  const c = 2 * Math.PI * 52;
  $('#pl-ring').style.strokeDasharray = c;
  $('#pl-ring').style.strokeDashoffset = c * (1 - left / W.stageLen);
  const key = 'r' + sec;
  if (key !== W.lastKey) {
    W.lastKey = key;
    if (sec <= 3 && sec > 0) beep(660, 80);
    if (sec === 10) say('Noch 10 Sekunden');
  }
  if (left <= 0) nextSet();
}

/** Figur zeichnen: 0 = Startposition, 1 = Endposition der Bewegung */
function setBar(pos) {
  if (window.Model3D?.ready) return Model3D.draw($('#pl-anim3d'), curEx().exId, pos);
  const svg = $('#pl-anim');
  const vb = modelViewBox(curEx().exId);
  if (svg.getAttribute('viewBox') !== vb) svg.setAttribute('viewBox', vb);
  svg.innerHTML = modelSvg(curEx().exId, pos);
}

function renderRep() {
  const el = $('#pl-rep');
  if (W.repsDone > Number(el.textContent)) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  el.textContent = W.repsDone;
  $$('#pl-repdots i').forEach((d, i) => d.classList.toggle('on', i < W.repsDone));
}

function renderPlayerStatic() {
  const ex = curEx();
  const resting = W.stage === 'rest';
  $('#pl-ex').textContent = ex.name;
  $('#pl-sub').textContent = `Übung ${W.exIdx + 1}/${plan.plan.length} · ${ex.weight ? String(ex.weight).replace('.', ',') + ' kg' : 'Körpergewicht'} · Tempo ${ex.tempo}`;
  $('#pl-stage').classList.toggle('hidden', resting);
  $('#pl-rest').classList.toggle('hidden', !resting);
  $('#pl-ctrl').classList.toggle('hidden', resting);
  $('#pl-reps').textContent = ex.reps;
  $('#pl-muscles').innerHTML = modelMuscleNames(ex.exId).map((m) => `<span>${m}</span>`).join('');
  if (!resting && W.stage === 'countdown') setBar(ex.start === 'top' ? 1 : 0);
  if (W.stage !== 'set') { W.repsDone = 0; }
  $('#pl-rep').textContent = W.repsDone;
  // Satz-Anzeige
  $('#pl-sets').innerHTML = Array.from({ length: ex.sets }, (_, i) =>
    `<span class="${i < W.setIdx ? 'done' : i === W.setIdx ? 'cur' : ''}">Satz ${i + 1}</span>`).join('') +
    `<div class="pl-repdots" id="pl-repdots">${'<i></i>'.repeat(ex.reps)}</div>`;
  renderRep();
  if (resting) {
    const lastOfEx = W.setIdx >= ex.sets - 1;
    const nx = lastOfEx ? plan.plan[W.exIdx + 1] : ex;
    $('#pl-next').textContent = `Als Nächstes: ${nx.name} · Satz ${lastOfEx ? 1 : W.setIdx + 2}/${nx.sets} · ${nx.reps} Wdh.`;
    $('#pl-done').max = ex.reps * 3;
  }
  $('#pl-pause').innerHTML = W.paused ? `${ic('play')}<span>Fortsetzen</span>` : `${ic('pause')}<span>Pausieren</span>`;
}

function togglePause() {
  W.paused = !W.paused;
  if (W.paused) window.speechSynthesis?.cancel();
  $('#pl-pause').innerHTML = W.paused ? `${ic('play')}<span>Fortsetzen</span>` : `${ic('pause')}<span>Pausieren</span>`;
  $('#pl-stage').classList.toggle('paused', W.paused);
}

function finishWorkout() {
  W.active = false;
  cancelAnimationFrame(W.raf);
  stWakeLock(false);
  document.body.classList.remove('training');
  say('Training beendet. Stark!');
  // Sätze mit 0 Wiederholungen nicht speichern
  const results = W.results.map((r) => ({ ...r, sets: r.sets.filter((x) => x.reps > 0) })).filter((r) => r.sets.length);
  if (!results.length) return resetStrengthView();
  W.final = { results, sec: Math.round(W.totalMs / 1000) };
  const sets = results.reduce((n, e) => n + e.sets.length, 0);
  const reps = results.reduce((n, e) => n + e.sets.reduce((s, x) => s + x.reps, 0), 0);
  $('#sum-totals').innerHTML = `
    <div><div class="value">${sets}</div><div class="label">Sätze</div></div>
    <div><div class="value">${reps}</div><div class="label">Wiederholungen</div></div>
    <div><div class="value">${fmtKg(workoutVolume(results))}</div><div class="label">Volumen</div></div>`;
  $('#sum-table').innerHTML = exercisesTable(results) + `<p class="muted">Dauer: ${fmtDur(W.final.sec)}</p>`;
  $('#sum-form').reset();
  $('#st-player').classList.add('hidden');
  $('#st-summary').classList.remove('hidden');
  window.scrollTo(0, 0);
}

function stopWorkout() {
  if (!confirm('Training beenden? Bereits geschaffte Sätze werden gespeichert.')) return;
  if (W.stage === 'set' && W.repsDone > 0) {
    W.results[W.exIdx].sets.push({ reps: W.repsDone, target: curEx().reps, weight: curEx().weight });
  } else if (W.stage === 'rest') {
    const r = W.results[W.exIdx].sets;
    if (r.length) r[r.length - 1].reps = Math.max(0, parseInt($('#pl-done').value, 10) || 0);
  }
  finishWorkout();
}

function saveWorkout(e) {
  e.preventDefault();
  const f = e.target;
  const { results, sec } = W.final;
  const date = ymd(today());
  const names = results.map((r) => r.name);
  const a = {
    id: uid(), type: 'gym', date,
    title: names.length === 1 ? names[0] : names.length === 2 ? names.join(' & ') : `${names[0]}, ${names[1]} & mehr`,
    durationSec: Math.max(60, sec), distanceKm: 0, splits: [],
    exercises: results.map((r) => ({ name: r.name, tempo: r.tempo, sets: r.sets })),
    feel: f.feel.value, notes: f.notes.value.trim(), createdAt: new Date().toISOString(),
  };
  state.activities.push(a);
  delete state.marks[date];
  save();
  toast('Training gespeichert');
  resetStrengthView();
  showView('feed');
  showActivity(a.id);
}

function resetStrengthView() {
  W.active = false;
  $('#st-player').classList.add('hidden');
  $('#st-summary').classList.add('hidden');
  $('#st-setup').classList.remove('hidden');
  renderPlan();
}

/* ---------------- Vorschau beim Hinzufügen ---------------- */
let previewRaf = 0;
function previewLoop(ts) {
  const view = $('#view-strength');
  if (view.classList.contains('active') && !W.active && !$('#st-setup').classList.contains('hidden')) {
    const id = $('#st-exercise').value;
    const def = EXERCISES.find((e) => e.id === id);
    // 4-Sekunden-Schleife: Start → Ende → Start, weich
    const t = (ts % 4000) / 4000;
    let pos = 0.5 - Math.cos(t * 2 * Math.PI) / 2;
    if (def.start === 'top') pos = 1 - pos;
    if (window.Model3D?.ready) {
      Model3D.draw($('#st-preview3d'), id, pos);
    } else {
      const svg = $('#st-preview');
      const vb = modelViewBox(id);
      if (svg.getAttribute('viewBox') !== vb) svg.setAttribute('viewBox', vb);
      svg.innerHTML = modelSvg(id, pos);
    }
  }
  previewRaf = requestAnimationFrame(previewLoop);
}
function updatePreviewMuscles() {
  $('#st-preview-muscles').innerHTML = modelMuscleNames($('#st-exercise').value).map((m) => `<span>${m}</span>`).join('');
}

/* ---------------- Events ---------------- */
function initStrength() {
  $('#st-exercise').innerHTML = EXERCISES.map((e) => `<option value="${e.id}">${e.name}</option>`).join('');
  $('#st-exercise').addEventListener('change', (e) => {
    $('#st-custom-wrap').classList.toggle('hidden', e.target.value !== 'custom');
    updatePreviewMuscles();
  });
  updatePreviewMuscles();
  previewRaf = requestAnimationFrame(previewLoop);
  // 3D-Modul lädt asynchron: danach Vorschaubilder in der Liste neu zeichnen
  window.addEventListener('model3d-ready', () => renderPlan());
  $('#st-tempo').addEventListener('change', (e) => {
    $('#st-tempo-custom-wrap').classList.toggle('hidden', e.target.value !== 'custom');
  });
  $('#st-add').addEventListener('submit', onAddExercise);
  $('#st-add').addEventListener('click', (e) => {
    const b = e.target.closest('[data-step]');
    if (!b) return;
    const [field, d] = b.dataset.step.split(':');
    const inp = $('#st-add')[field];
    const v = Math.max(Number(inp.min) || 0, (parseFloat(inp.value) || 0) + Number(d));
    inp.value = Math.round(v * 10) / 10;
  });
  $('#st-plan').addEventListener('click', (e) => {
    const del = e.target.closest('[data-plan-del]'), up = e.target.closest('[data-plan-up]');
    if (del) plan.plan.splice(Number(del.dataset.planDel), 1);
    else if (up) { const i = Number(up.dataset.planUp); [plan.plan[i - 1], plan.plan[i]] = [plan.plan[i], plan.plan[i - 1]]; }
    else return;
    savePlan(); renderPlan();
  });
  for (const k of ['sound', 'voice', 'vibrate']) {
    const el = $('#st-' + k);
    el.checked = plan[k] !== false;
    el.addEventListener('change', () => { plan[k] = el.checked; savePlan(); });
  }
  $('#st-start').addEventListener('click', startWorkout);
  $('#pl-pause').addEventListener('click', togglePause);
  $('#pl-setdone').addEventListener('click', () => {
    if (W.stage === 'countdown') return enterStage('set');
    if (W.stage === 'set') finishSet(W.repsDone);
  });
  $('#pl-stop').addEventListener('click', stopWorkout);
  $('#pl-rest-skip').addEventListener('click', nextSet);
  $('#pl-rest-add').addEventListener('click', () => { W.stageLen += 15000; });
  $('#pl-done-minus').addEventListener('click', () => { $('#pl-done').value = Math.max(0, ($('#pl-done').value | 0) - 1); });
  $('#pl-done-plus').addEventListener('click', () => { $('#pl-done').value = ($('#pl-done').value | 0) + 1; });
  $('#sum-form').addEventListener('submit', saveWorkout);
  $('#sum-discard').addEventListener('click', () => {
    if (confirm('Training wirklich verwerfen?')) resetStrengthView();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && W.active) stWakeLock(true);
  });
  window.addEventListener('beforeunload', (e) => { if (W.active) { e.preventDefault(); e.returnValue = ''; } });
  renderPlan();
}
initStrength();
