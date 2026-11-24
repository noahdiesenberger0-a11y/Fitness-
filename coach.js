'use strict';

/* ============================================================
 *  Animierte Figur: „Vorführen“ (Endlosschleife im Tempo) und
 *  „Tempo-Coach“ (führt durch einen Satz, zählt Wiederholungen mit
 *  und trägt sie danach im Training ein).
 *  Tempo-Schreibweise: runter-halten-hoch-halten in Sekunden, z. B. 3-1-1-0
 * ============================================================ */

const TEMPOS = [
  ['2-0-1-0', 'Normal · 2 s runter, 1 s hoch'],
  ['3-1-1-0', 'Kontrolliert · 3 s runter, 1 s halten, 1 s hoch'],
  ['4-1-2-1', 'Langsam · 4 s runter, 1 s halten, 2 s hoch'],
  ['2-0-0.7-0', 'Explosiv · 2 s runter, schnell hoch'],
];
const COUNTDOWN_MS = 3000;

function parseTempo(str) {
  const p = String(str).split('-').map(Number);
  if (p.length !== 4 || p.some((x) => isNaN(x) || x < 0) || p[0] + p[2] <= 0) return null;
  return { down: p[0], holdBottom: p[1], up: p[2], holdTop: p[3] };
}
function tempoOptions(sel) {
  const known = TEMPOS.some(([v]) => v === sel);
  return TEMPOS.map(([v, l]) => `<option value="${v}"${v === sel ? ' selected' : ''}>${l}</option>`).join('')
    + (known || !sel ? '' : `<option value="${esc(sel)}" selected>Eigenes · ${esc(sel)}</option>`);
}

/** Phasen einer Wiederholung. pos: 0 = Startposition, 1 = Endposition der Figur */
function phasesFor(exId, tempo) {
  const t = parseTempo(tempo) || parseTempo('2-0-1-0');
  const m = exInfo(exId).motion;
  const down = { key: 'down', label: m.ecc, ms: t.down * 1000, from: 1, to: 0 };
  const holdB = { key: 'holdB', label: 'Halten', ms: t.holdBottom * 1000, from: 0, to: 0 };
  const up = { key: 'up', label: m.con, ms: t.up * 1000, from: 0, to: 1 };
  const holdT = { key: 'holdT', label: 'Halten', ms: t.holdTop * 1000, from: 1, to: 1 };
  const seq = m.start === 'top' ? [down, holdB, up, holdT] : [up, holdT, down, holdB];
  return seq.filter((p) => p.ms > 0);
}

const C = { mode: '', raf: 0, exId: '', tempo: '', phases: [], cyc: 0, ms: 0, last: 0, stage: '', reps: 0, target: 0, key: '', paused: false, ex: -1, set: -1 };

function coachMarkup(title, sub, extra) {
  const info = exInfo(C.exId);
  return `<div class="coach">
    <div class="pl-head"><div><div class="pl-ex">${esc(title)}</div><div class="muted">${sub}</div></div>
      <button class="icon-btn" data-close aria-label="Schließen">${ic('x')}</button></div>
    <div class="pl-phase" id="pl-phase" aria-live="polite">Bereit</div>
    ${info.model ? `<svg class="pl-anim model" id="pl-anim" viewBox="${modelViewBox(info.model)}" aria-hidden="true"></svg>
      <div class="muscle-tags">${modelMuscleNames(info.model).map((m) => `<span>${m}</span>`).join('')}</div>`
      : `<p class="muted coach-nofig">Für diese Übung gibt es noch keine Figur. Der Takt läuft trotzdem.</p>`}
    <div class="pl-phasebar"><i id="pl-phasefill"></i></div>
    ${extra}
  </div>`;
}

function drawFigure(pos) {
  const info = exInfo(C.exId);
  const svg = document.getElementById('pl-anim');
  if (svg && info.model) svg.innerHTML = modelSvg(info.model, pos);
}

/* ---------- Vorführen ---------- */
function openDemo(exId, tempo) {
  C.mode = 'demo'; C.exId = exId; C.tempo = tempo || '2-0-1-0';
  openModal(coachMarkup(exInfo(exId).name, 'So sieht eine Wiederholung aus', `
    <label class="coach-tempo">Tempo <select id="coach-tempo">${tempoOptions(C.tempo)}</select></label>`), 'coach-box');
  $('#coach-tempo').addEventListener('change', (e) => { C.tempo = e.target.value; startLoop(); });
  startLoop();
}

/* ---------- Tempo-Coach für einen Satz ---------- */
function openCoach(i) {
  const ex = active.exercises[i];
  let j = ex.sets.findIndex((s) => !s.done);
  if (j < 0) { ex.sets.push({ ...ex.sets[ex.sets.length - 1], done: false, pr: false, prev: '' }); j = ex.sets.length - 1; }
  const s = ex.sets[j];
  unlockAudio();
  Object.assign(C, { mode: 'coach', exId: ex.exId, tempo: ex.target?.tempo || '2-0-1-0', ex: i, set: j, target: s.reps || ex.target?.repsMax || 10, paused: false });
  openModal(coachMarkup(ex.name, `Satz ${j + 1}/${ex.sets.length} · ${s.weight ? fmtW(s.weight) + ' kg' : 'Körpergewicht'}`, `
    <div class="pl-count num"><span id="pl-rep">0</span><small> / ${C.target}</small></div>
    <div class="pl-repdots" id="pl-repdots">${'<i></i>'.repeat(Math.min(C.target, 30))}</div>
    <label class="coach-tempo">Tempo <select id="coach-tempo">${tempoOptions(C.tempo)}</select></label>
    <div class="rec-buttons">
      <button class="btn xl" id="coach-pause">${ic('pause')}<span>Pausieren</span></button>
      <button class="btn primary xl" id="coach-done">${ic('check')}Satz fertig</button>
    </div>`), 'coach-box');
  $('#coach-tempo').addEventListener('change', (e) => {
    C.tempo = e.target.value;
    if (ex.target) ex.target.tempo = C.tempo;
    persistActive();
    startLoop(true);
  });
  $('#coach-pause').addEventListener('click', () => {
    C.paused = !C.paused;
    if (C.paused) window.speechSynthesis?.cancel();
    $('#coach-pause').innerHTML = C.paused ? `${ic('play')}<span>Weiter</span>` : `${ic('pause')}<span>Pausieren</span>`;
  });
  $('#coach-done').addEventListener('click', () => coachFinish(C.stage === 'count' ? 0 : C.reps));
  wakeLock(true);
  startLoop();
}

function startLoop(keepCount) {
  cancelAnimationFrame(C.raf);
  C.phases = phasesFor(C.exId, C.tempo);
  C.cyc = C.phases.reduce((n, p) => n + p.ms, 0);
  C.ms = 0;
  C.key = '';
  if (!keepCount) C.reps = 0;
  C.stage = C.mode === 'coach' && !keepCount ? 'count' : 'move';
  C.repOffset = keepCount ? C.reps : 0;
  C.last = performance.now();
  C.raf = requestAnimationFrame(coachTick);
}

function coachTick(ts) {
  if (!C.mode) return;
  const dt = Math.min(ts - C.last, 500);
  C.last = ts;
  if (!C.paused) C.ms += dt;
  const phaseEl = document.getElementById('pl-phase');
  const fill = document.getElementById('pl-phasefill');
  if (!phaseEl) return;

  if (C.stage === 'count') {
    const left = Math.ceil((COUNTDOWN_MS - C.ms) / 1000);
    if (C.ms >= COUNTDOWN_MS) { C.stage = 'move'; C.ms = 0; say('Los'); }
    else {
      if (C.key !== 'c' + left) { C.key = 'c' + left; beep(660, 80); if (left === 3) say(exInfo(C.exId).name); }
      phaseEl.textContent = left;
      phaseEl.className = 'pl-phase countdown';
      fill.style.width = (C.ms / COUNTDOWN_MS) * 100 + '%';
      fill.className = '';
      drawFigure(exInfo(C.exId).motion.start === 'top' ? 1 : 0);
    }
    C.raf = requestAnimationFrame(coachTick);
    return;
  }

  const rep = Math.floor(C.ms / C.cyc);
  let t = C.ms - rep * C.cyc;
  let ph = C.phases[0];
  for (const p of C.phases) { if (t < p.ms) { ph = p; break; } t -= p.ms; }
  const prog = Math.min(1, t / ph.ms);

  if (C.mode === 'coach') {
    const reps = C.repOffset + rep;
    if (reps > C.reps) {
      C.reps = reps;
      const el = document.getElementById('pl-rep');
      el.textContent = reps;
      el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
      $$('#pl-repdots i').forEach((d, k) => d.classList.toggle('on', k < reps));
      say(String(reps));
      buzz(50);
      if (reps >= C.target) return coachFinish(reps);
    }
    const key = rep + ph.key;
    if (key !== C.key) {
      C.key = key;
      if (ph.key === 'up') beep(990, 90); else if (ph.key === 'down') beep(520, 90); else beep(740, 50, 0.08);
    }
  }
  const eased = 0.5 - Math.cos(prog * Math.PI) / 2;
  drawFigure(ph.from + (ph.to - ph.from) * eased);
  const secLeft = Math.ceil((ph.ms - t) / 1000);
  phaseEl.textContent = C.paused ? 'Pause' : `${ph.label}${ph.ms >= 1500 ? ' · ' + secLeft : ''}`;
  phaseEl.className = 'pl-phase ' + ph.key;
  fill.style.width = prog * 100 + '%';
  fill.className = ph.key;
  C.raf = requestAnimationFrame(coachTick);
}

function coachFinish(reps) {
  const { ex: i, set: j } = C;
  stopCoach();
  closeModal();
  if (!reps) return;
  const s = active.exercises[i].sets[j];
  s.reps = reps;
  renderLive();
  toggleSet(i, j);
  say(`${reps} geschafft. Pause.`);
}

function stopCoach() {
  cancelAnimationFrame(C.raf);
  C.mode = '';
}
/** Wird von closeModal() aufgerufen */
function onModalClose() { if (C.mode) stopCoach(); }
