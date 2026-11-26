'use strict';

/* ============================================================
 *  Pulse Gym – Habit-Tracker
 *  Gewohnheiten abhaken, Serien, Wochen-Matrix, Pausetage, Erfolge.
 *
 *  db.schedule = [0, 2, 4]           Trainingstage (0 = Montag)
 *  db.habits   = [{ id, key, name, icon, kind: 'gym'|'check'|'count', target, unit, days, created }]
 *  db.log      = { 'yyyy-mm-dd': { habitId: true | Zahl } }
 *  db.freeze   = { 'yyyy-mm-dd': true }   Pausetag (krank, Urlaub): keine Gewohnheit ist fällig
 *  db.badges   = [badgeId, …]             freigeschaltete Erfolge
 * ============================================================ */

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const HABIT_PRESETS = [
  { key: 'gym', name: 'Training', icon: 'dumbbell', kind: 'gym', desc: 'An deinen Trainingstagen ins Gym' },
  { key: 'water', name: 'Wasser trinken', icon: 'drop', kind: 'count', target: 8, unit: 'Gläser', desc: '8 Gläser à 0,25 l pro Tag' },
  { key: 'protein', name: 'Proteinziel erreicht', icon: 'egg', kind: 'check', desc: 'Rund 1,6–2 g Eiweiß pro kg Körpergewicht' },
  { key: 'sleep', name: '7+ Stunden geschlafen', icon: 'moon', kind: 'check', desc: 'Muskeln wachsen in der Erholung' },
  { key: 'stretch', name: '10 Minuten Dehnen', icon: 'stretch', kind: 'check', desc: 'Beweglichkeit und weniger Verspannungen' },
  { key: 'creatine', name: 'Kreatin genommen', icon: 'pill', kind: 'check', desc: '3–5 g täglich, auch an Ruhetagen' },
  { key: 'steps', name: '8.000 Schritte', icon: 'steps', kind: 'check', desc: 'Alltagsbewegung neben dem Training' },
  { key: 'clean', name: 'Kein Junkfood', icon: 'leaf', kind: 'check', desc: 'Ein Tag ohne Fast Food und Süßkram' },
];
const HABIT_ICONS = ['dumbbell', 'drop', 'egg', 'moon', 'stretch', 'pill', 'steps', 'leaf', 'flame', 'target', 'bolt', 'scale'];

/* ---------------- Grundlagen ---------------- */
const wdIdx = (k) => (parseYmd(k).getDay() + 6) % 7;
const todayKey = () => ymd(today());
function makeHabit(key, created = todayKey()) {
  const p = HABIT_PRESETS.find((x) => x.key === key);
  return { id: key === 'gym' ? 'gym' : 'h_' + uid(), key, name: p.name, icon: p.icon, kind: p.kind,
    target: p.target || 1, unit: p.unit || '', days: [...ALL_DAYS], created };
}
/** Sorgt dafür, dass alle Habit-Felder existieren (auch bei älteren Daten) */
function ensureHabits() {
  db.schedule = Array.isArray(db.schedule) && db.schedule.length ? db.schedule : defaultSchedule(db.settings.weekGoal || 3);
  db.habits = Array.isArray(db.habits) ? db.habits : [];
  db.log = db.log || {};
  db.freeze = db.freeze || {};
  db.badges = db.badges || [];
  if (!db.habits.some((h) => h.kind === 'gym')) {
    const first = db.workouts.map((w) => w.date).sort()[0] || todayKey();
    db.habits.unshift(makeHabit('gym', first));
  }
}
function defaultSchedule(n) {
  return { 1: [2], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5], 7: ALL_DAYS }[n] || [0, 2, 4];
}
const habitDays = (h) => (h.kind === 'gym' ? db.schedule : h.days);
const isFrozen = (k) => !!db.freeze[k];
const isDue = (h, k) => k >= h.created && !isFrozen(k) && habitDays(h).includes(wdIdx(k));
const habitVal = (h, k) => db.log[k]?.[h.id];

/**
 * Training: Ein verpasster Trainingstag gilt als nachgeholt, wenn in derselben Woche
 * an einem freien Tag trainiert wurde (Mo–So). So bleibt die Serie fair.
 */
let gymIdx = null, gymKey = '';
function gymIndex() {
  const key = todayKey() + db.workouts.map((w) => w.date).join() + '|' + db.schedule.join() + '|' + Object.keys(db.freeze).join();
  if (key === gymKey) return gymIdx;
  const dates = new Set(db.workouts.map((w) => w.date));
  const makeup = new Set();
  const t = todayKey();
  for (const wk of new Set([...dates].map((k) => ymd(mondayOf(parseYmd(k)))))) {
    const mon = parseYmd(wk), missed = [], extra = [];
    for (let i = 0; i < 7; i++) {
      const k = ymd(addDays(mon, i));
      if (k > t) break;
      const sched = db.schedule.includes(i);
      if (sched && !db.freeze[k] && !dates.has(k)) missed.push(k);
      if (!sched && dates.has(k)) extra.push(k);
    }
    missed.slice(0, extra.length).forEach((k) => makeup.add(k));
  }
  gymKey = key;
  return (gymIdx = { dates, makeup });
}
function isDone(h, k) {
  if (h.kind === 'gym') { const g = gymIndex(); return g.dates.has(k) || g.makeup.has(k); }
  const v = habitVal(h, k);
  return h.kind === 'count' ? (v || 0) >= h.target : !!v;
}
/** Zustand einer Zelle in Matrix und Kalender */
function cellState(h, k) {
  if (k < h.created) return 'off';
  if (k > todayKey()) return isDue(h, k) ? 'due' : 'off';
  if (isFrozen(k)) return 'frozen';
  if (h.kind === 'gym' && !gymIndex().dates.has(k) && gymIndex().makeup.has(k)) return 'makeup';
  const due = isDue(h, k), done = isDone(h, k);
  if (done) return due ? 'done' : 'bonus';
  if (!due) return 'off';
  return k === todayKey() ? 'due' : 'miss';
}

/* ---------------- Serien & Quoten ---------------- */
function streakOf(dueFn, doneFn, start) {
  let d = today(), n = 0;
  if (dueFn(ymd(d)) && !doneFn(ymd(d))) d = addDays(d, -1); // heute ist noch nicht vorbei
  for (let i = 0; i < 1500; i++, d = addDays(d, -1)) {
    const k = ymd(d);
    if (k < start) break;
    if (!dueFn(k)) continue;
    if (doneFn(k)) n++; else break;
  }
  return n;
}
function bestOf(dueFn, doneFn, start) {
  let best = 0, run = 0;
  for (let d = parseYmd(start), i = 0; d <= today() && i < 1500; d = addDays(d, 1), i++) {
    const k = ymd(d);
    if (!dueFn(k)) continue;
    if (doneFn(k)) { run++; best = Math.max(best, run); } else if (k !== todayKey()) run = 0;
  }
  return best;
}
const habitStreak = (h) => streakOf((k) => isDue(h, k), (k) => isDone(h, k), h.created);
const habitBest = (h) => bestOf((k) => isDue(h, k), (k) => isDone(h, k), h.created);
function habitRate(h, days = 30) {
  let due = 0, done = 0;
  for (let i = 0; i < days; i++) {
    const k = ymd(addDays(today(), -i));
    if (i === 0 && !isDone(h, k)) continue; // heute zählt erst, wenn erledigt
    if (!isDue(h, k)) continue;
    due++; if (isDone(h, k)) done++;
  }
  return due ? Math.round((done / due) * 100) : null;
}
/** Perfekter Tag: alle an diesem Tag fälligen Gewohnheiten erledigt */
const dueHabits = (k) => db.habits.filter((h) => isDue(h, k));
const isPerfect = (k) => { const d = dueHabits(k); return d.length > 0 && d.every((h) => isDone(h, k)); };
const habitsStart = () => db.habits.reduce((m, h) => (h.created < m ? h.created : m), todayKey());
const perfectStreak = () => streakOf((k) => dueHabits(k).length > 0, isPerfect, habitsStart());
const perfectBest = () => bestOf((k) => dueHabits(k).length > 0, isPerfect, habitsStart());
const gymHabit = () => db.habits.find((h) => h.kind === 'gym');

function daysText(days) {
  if (days.length === 7) return 'Täglich';
  if (days.join() === '0,1,2,3,4') return 'Mo–Fr';
  return days.map((d) => WD[d]).join(', ');
}

/* ---------------- Abhaken ---------------- */
function setHabit(id, k, v) {
  const h = db.habits.find((x) => x.id === id);
  if (!h || h.kind === 'gym' || k > todayKey()) return;
  const wasPerfect = isPerfect(k);
  db.log[k] = db.log[k] || {};
  if (v === 'toggle') v = !db.log[k][id];
  if (h.kind === 'count') v = Math.max(0, Math.min(h.target * 3, v));
  if (!v) delete db.log[k][id]; else db.log[k][id] = v;
  if (!Object.keys(db.log[k]).length) delete db.log[k];
  saveDb();
  if (isDone(h, k)) buzz(30);
  if (k === todayKey() && !wasPerfect && isPerfect(k)) celebrate();
  checkBadges();
  refreshHabitViews(k);
}
function celebrate() {
  ensureAudio();
  beep(990, 110); setTimeout(() => beep(1320, 140), 120); setTimeout(() => beep(1760, 220), 260);
  buzz([60, 40, 60, 40, 120]);
  toast(`Perfekter Tag! ${perfectStreak()} ${perfectStreak() === 1 ? 'Tag' : 'Tage'} in Folge`);
  const ring = $('.ring');
  if (ring) { ring.classList.remove('burst'); void ring.offsetWidth; ring.classList.add('burst'); }
}
function refreshHabitViews(k) {
  if (currentView === 'home') renderHome();
  if (currentView === 'habits') renderHabits();
  if (!$('#modal').classList.contains('hidden') && $('#modal-box [data-dayk]')) showDay(k);
}

/* ---------------- Heute: Checkliste ---------------- */
function ringSvg(done, total, size = 76) {
  const r = 30, c = 2 * Math.PI * r, p = total ? done / total : 0;
  return `<svg class="ring${p >= 1 ? ' full' : ''}" viewBox="0 0 76 76" width="${size}" height="${size}" aria-hidden="true">
    <circle class="ring-bg" cx="38" cy="38" r="${r}"/>
    <circle class="ring-fg" cx="38" cy="38" r="${r}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - p)).toFixed(1)}"/>
    ${p >= 1 ? `<path class="ring-check" d="M27 39l7.5 7.5L50 31"/>` : `<text x="38" y="44">${done}/${total}</text>`}</svg>`;
}

function habitRow(h, k = todayKey(), compact = false) {
  const due = isDue(h, k), done = isDone(h, k), st = habitStreak(h);
  const streak = st ? `<span class="h-streak">${ic('flame')}${st}</span>` : '';
  let sub = '', ctrl = '';
  if (h.kind === 'gym') {
    const ws = db.workouts.filter((w) => w.date === k);
    if (ws.length) { sub = esc(ws.map((w) => w.title).join(' + ')); ctrl = `<span class="h-check on" aria-label="Erledigt">${ic('check')}</span>`; }
    else if (isFrozen(k)) sub = 'Pausetag – die Serie ist geschützt';
    else if (done) { sub = 'Diese Woche schon nachgeholt'; ctrl = `<span class="h-check on" aria-label="Erledigt">${ic('check')}</span>`; }
    else if (k !== todayKey()) sub = due ? 'Verpasst' : 'Ruhetag';
    else if (db.active) { sub = `${esc(db.active.title)} läuft`; ctrl = `<button class="btn primary sm" data-view="workout">${ic('play')}Weiter</button>`; }
    else {
      const r = nextRoutine();
      sub = due ? (r ? `${esc(r.name)} · ca. ${routineMinutes(r)} min` : 'Heute ist Trainingstag') : 'Ruhetag – Erholung gehört dazu';
      ctrl = due ? `<button class="btn primary sm" ${r ? `data-start="${r.id}"` : 'data-free'}>${ic('play')}Starten</button>`
        : `<button class="btn sm" data-choose>Trotzdem</button>`;
    }
  } else if (h.kind === 'count') {
    const v = habitVal(h, k) || 0;
    sub = `${v} / ${h.target} ${esc(h.unit)}`;
    ctrl = `<div class="h-count${done ? ' on' : ''}">
      <button class="h-cbtn" data-hminus="${h.id}" data-k="${k}" aria-label="Eins weniger" ${v ? '' : 'disabled'}>${ic('minus')}</button>
      <button class="h-cbtn plus" data-hplus="${h.id}" data-k="${k}" aria-label="Eins mehr: ${esc(h.name)}">${done ? ic('check') : ic('plus')}</button></div>`;
  } else {
    sub = due ? (done ? 'Erledigt' : 'Offen') : k === todayKey() ? 'Heute frei' : 'Frei';
    ctrl = `<button class="h-check${done ? ' on' : ''}" data-habit="${h.id}" data-k="${k}" aria-pressed="${done}" aria-label="${esc(h.name)} abhaken">${ic('check')}</button>`;
  }
  const bar = h.kind === 'count' ? `<div class="h-bar"><i style="width:${Math.min(100, ((habitVal(h, k) || 0) / h.target) * 100)}%"></i></div>` : '';
  return `<div class="h-row${done ? ' done' : ''}${due ? '' : ' free'}">
    <span class="h-ic">${ic(h.icon)}</span>
    <div class="grow"><div class="h-name">${esc(h.name)}${compact ? '' : streak}</div><div class="h-sub">${sub}</div>${bar}</div>
    ${ctrl}</div>`;
}

function todayCard() {
  const k = todayKey();
  const due = dueHabits(k), done = due.filter((h) => isDone(h, k)).length;
  const rest = db.habits.filter((h) => !isDue(h, k));
  const ps = perfectStreak();
  const msg = isFrozen(k) ? 'Pausetag: Heute ist nichts fällig, deine Serien bleiben erhalten.'
    : !due.length ? 'Heute ist nichts fällig. Genieß den freien Tag.'
    : done === due.length ? `Alles erledigt – ${ps} ${ps === 1 ? 'perfekter Tag' : 'perfekte Tage'} in Folge.`
    : `Noch ${due.length - done} ${due.length - done === 1 ? 'Gewohnheit' : 'Gewohnheiten'} bis zum perfekten Tag.`;
  return `<article class="card today-card">
    <div class="today-head">${ringSvg(done, due.length)}
      <div class="grow"><h2>Heute</h2><p class="muted">${msg}</p></div></div>
    <div class="h-list">${due.map((h) => habitRow(h)).join('')}</div>
    ${rest.length ? `<details class="h-free"><summary>Heute frei (${rest.length})</summary><div class="h-list">${rest.map((h) => habitRow(h)).join('')}</div></details>` : ''}
  </article>`;
}

function streakCard() {
  const g = gymHabit();
  const gs = habitStreak(g), gb = habitBest(g), ps = perfectStreak(), pb = perfectBest();
  return `<article class="card streaks">
    <div class="sk"><div class="sk-ic">${ic('flame')}</div><div><div class="sk-num num">${gs}</div><div class="label">Trainings in Folge</div><div class="sk-best">Rekord ${gb}</div></div></div>
    <div class="sk"><div class="sk-ic gold">${ic('star')}</div><div><div class="sk-num num">${ps}</div><div class="label">Perfekte Tage in Folge</div><div class="sk-best">Rekord ${pb}</div></div></div>
  </article>`;
}

function weekMatrix() {
  const mon = mondayOf(today());
  const days = [...Array(7)].map((_, i) => ymd(addDays(mon, i)));
  const t = todayKey();
  return `<article class="card">
    <div class="card-head"><h2>Diese Woche</h2><button class="link-btn" data-view="habits">Alle Gewohnheiten${ic('arrow-right')}</button></div>
    <div class="matrix-wrap"><table class="matrix">
      <thead><tr><th></th>${days.map((k, i) => `<th class="${k === t ? 'today' : ''}"><button data-day="${k}">${WD[i]}<span>${parseYmd(k).getDate()}</span></button></th>`).join('')}</tr></thead>
      <tbody>${db.habits.map((h) => `<tr><th scope="row" title="${esc(h.name)}"><span class="h-ic sm">${ic(h.icon)}</span><span class="m-name">${esc(h.name)}</span></th>
        ${days.map((k) => { const s = cellState(h, k); const tap = h.kind !== 'gym' && k <= t && s !== 'off' && s !== 'frozen';
          return `<td><${tap ? `button data-hcell="${h.id}" data-k="${k}"` : 'span'} class="mc ${s}" title="${esc(h.name)}, ${fmtDate(k)}: ${STATE_TXT[s]}">${s === 'done' || s === 'bonus' || s === 'makeup' ? ic('check') : s === 'frozen' ? ic('pause') : ''}</${tap ? 'button' : 'span'}></td>`; }).join('')}</tr>`).join('')}</tbody>
    </table></div>
    <div class="m-legend"><span><i class="mc done"></i>erledigt</span><span><i class="mc miss"></i>verpasst</span><span><i class="mc due"></i>fällig</span><span><i class="mc makeup"></i>nachgeholt</span><span><i class="mc frozen"></i>Pausetag</span></div>
  </article>`;
}
const STATE_TXT = { done: 'erledigt', bonus: 'zusätzlich erledigt', makeup: 'nachgeholt', miss: 'verpasst', due: 'fällig', off: 'frei', frozen: 'Pausetag' };

/* ---------------- Gewohnheiten-Seite ---------------- */
function renderHabits() {
  const weeks = 12;
  const start = addDays(mondayOf(today()), -7 * (weeks - 1));
  $('#habits-list').innerHTML = db.habits.map((h) => {
    const st = habitStreak(h), best = habitBest(h), rate = habitRate(h);
    const cells = [];
    for (let w = 0; w < weeks; w++) for (let i = 0; i < 7; i++) {
      const k = ymd(addDays(start, w * 7 + i));
      const s = cellState(h, k);
      cells.push(`<i class="hc ${s}${k === todayKey() ? ' today' : ''}" style="grid-column:${w + 1};grid-row:${i + 1}" title="${fmtDate(k)}: ${STATE_TXT[s]}"></i>`);
    }
    return `<article class="card habit-card">
      <div class="hcard-top"><span class="h-ic lg">${ic(h.icon)}</span>
        <div class="grow"><h2>${esc(h.name)}</h2><div class="muted">${h.kind === 'gym' ? 'Trainingstage: ' : ''}${daysText(habitDays(h))}${h.kind === 'count' ? ` · Ziel ${h.target} ${esc(h.unit)}` : ''}</div></div>
        <button class="icon-btn ghost" data-hedit="${h.id}" aria-label="${esc(h.name)} bearbeiten">${ic('edit')}</button></div>
      <dl class="hstats">
        <div><dt>Serie</dt><dd>${ic('flame')}${st}</dd></div>
        <div><dt>Rekord</dt><dd>${best}</dd></div>
        <div><dt>Quote 30 Tage</dt><dd>${rate === null ? '–' : rate + ' %'}</dd></div>
      </dl>
      <div class="hcal" aria-label="Letzte ${weeks} Wochen">${cells.join('')}</div>
    </article>`;
  }).join('');
  renderBadges();
}

const ICON_LABEL = { dumbbell: 'Hantel', drop: 'Wasser', egg: 'Ernährung', moon: 'Schlaf', stretch: 'Dehnen', pill: 'Supplement', steps: 'Schritte', leaf: 'Gesund', flame: 'Energie', target: 'Ziel', bolt: 'Power', scale: 'Waage' };
function habitEditor(id) {
  const h = db.habits.find((x) => x.id === id);
  const isNew = !h;
  const e = h ? { ...h, days: [...habitDays(h)] } : { id: 'h_' + uid(), key: 'custom', name: '', icon: 'target', kind: 'check', target: 1, unit: '', days: [...ALL_DAYS], created: todayKey() };
  const gym = e.kind === 'gym';
  openModal(`<h3>${isNew ? 'Neue Gewohnheit' : gym ? 'Trainingstage' : 'Gewohnheit bearbeiten'}</h3>
    ${gym ? '<p class="muted">An diesen Tagen ist Training fällig. Ein verpasster Tag gilt als nachgeholt, wenn du in derselben Woche an einem freien Tag trainierst.</p>' : ''}
    <form class="form" id="he-form">
      ${gym ? '' : `<label>Name <input name="name" required maxlength="40" value="${esc(e.name)}" placeholder="z.B. Meal Prep" /></label>
      <fieldset class="icon-pick"><legend>Symbol</legend>${HABIT_ICONS.map((i) => `<label><input type="radio" name="icon" value="${i}" ${i === e.icon ? 'checked' : ''} /><span aria-label="${ICON_LABEL[i]}">${ic(i)}</span></label>`).join('')}</fieldset>
      <fieldset class="seg-pick"><legend>Art</legend>
        <label><input type="radio" name="kind" value="check" ${e.kind === 'check' ? 'checked' : ''} /><span>Abhaken</span></label>
        <label><input type="radio" name="kind" value="count" ${e.kind === 'count' ? 'checked' : ''} /><span>Zählen</span></label></fieldset>
      <div class="row count-only${e.kind === 'count' ? '' : ' hidden'}">
        <label>Tagesziel <input name="target" inputmode="numeric" value="${e.target}" /></label>
        <label>Einheit <input name="unit" maxlength="12" value="${esc(e.unit)}" placeholder="z.B. Gläser" /></label></div>`}
      <fieldset class="day-chips"><legend>${gym ? 'Trainingstage' : 'An welchen Tagen?'}</legend>
        ${WD.map((d, i) => `<label><input type="checkbox" name="d" value="${i}" ${e.days.includes(i) ? 'checked' : ''} /><span>${d}</span></label>`).join('')}</fieldset>
      <div class="form-actions">
        <button class="btn primary grow" type="submit">${ic('check')}Speichern</button>
        ${!isNew && !gym ? `<button class="btn danger" type="button" id="he-del">${ic('trash')}Löschen</button>` : ''}
        <button class="btn" type="button" data-close>Abbrechen</button>
      </div>
    </form>`);
  const f = $('#he-form');
  f.addEventListener('change', (ev) => { if (ev.target.name === 'kind') f.querySelector('.count-only').classList.toggle('hidden', ev.target.value !== 'count'); });
  f.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const days = [...f.querySelectorAll('[name=d]:checked')].map((x) => Number(x.value));
    if (!days.length) return toast('Wähle mindestens einen Tag');
    if (gym) { db.schedule = days; db.settings.weekGoal = days.length; }
    else {
      Object.assign(e, { name: f.name.value.trim(), icon: f.icon.value, kind: f.kind.value, days,
        target: f.kind.value === 'count' ? Math.max(1, Math.round(parseNum(f.target.value)) || 1) : 1, unit: f.unit?.value.trim() || '' });
      if (!e.name) return toast('Gib der Gewohnheit einen Namen');
      if (isNew) db.habits.push(e); else Object.assign(h, e);
    }
    saveDb(); closeModal(); toast(isNew ? 'Gewohnheit angelegt' : 'Gespeichert'); refreshHabitViews(todayKey());
  });
  $('#he-del')?.addEventListener('click', async () => {
    if (!await ask(`„${h.name}“ löschen? Der Verlauf dieser Gewohnheit geht verloren.`, 'Löschen')) return;
    db.habits = db.habits.filter((x) => x.id !== h.id);
    saveDb(); refreshHabitViews(todayKey());
  });
}

function addHabitSheet() {
  const have = new Set(db.habits.map((h) => h.key));
  const avail = HABIT_PRESETS.filter((p) => !have.has(p.key));
  openModal(`<h3>Gewohnheit hinzufügen</h3><p class="muted">Kleine tägliche Gewohnheiten, die dein Training unterstützen.</p>
    <div class="menu">${avail.map((p) => `<button class="menu-row" data-hpreset="${p.key}"><span class="h-ic">${ic(p.icon)}</span><span class="grow"><b>${p.name}</b><span class="muted">${p.desc}</span></span>${ic('plus')}</button>`).join('')}
      <button class="menu-row" data-hcustom><span class="h-ic">${ic('edit')}</span><span class="grow"><b>Eigene Gewohnheit</b><span class="muted">Name, Symbol und Tage selbst festlegen</span></span>${ic('arrow-right')}</button></div>
    <div class="modal-actions"><button class="btn grow" data-close>Schließen</button></div>`);
}

/* ---------------- Pausetag ---------------- */
async function toggleFreeze(k) {
  if (!db.freeze[k]) {
    const used = Object.keys(db.freeze).filter((x) => x >= ymd(addDays(today(), -29))).length;
    if (used >= 4 && !await ask(`Du hattest in den letzten 30 Tagen schon ${used} Pausetage. Trotzdem eintragen?`, 'Eintragen', false)) return;
    db.freeze[k] = true;
    toast('Pausetag eingetragen – deine Serien sind geschützt');
  } else { delete db.freeze[k]; toast('Pausetag entfernt'); }
  saveDb();
  refreshHabitViews(k);
}

/* ---------------- Erfolge ---------------- */
const totalVolume = () => sum(db.workouts, workoutVolume);
const totalPRs = () => sum(db.workouts, (w) => (w.prs || []).length);
const totalChecks = () => sum(Object.values(db.log), (d) => Object.keys(d).length) + db.workouts.length;
const BADGES = [
  { id: 'w1', name: 'Erster Schritt', desc: 'Dein erstes Training', icon: 'dumbbell', val: () => db.workouts.length, goal: 1 },
  { id: 'w10', name: 'Stammgast', desc: '10 Trainings', icon: 'dumbbell', val: () => db.workouts.length, goal: 10 },
  { id: 'w25', name: 'Durchstarter', desc: '25 Trainings', icon: 'dumbbell', val: () => db.workouts.length, goal: 25 },
  { id: 'w50', name: 'Eisern', desc: '50 Trainings', icon: 'dumbbell', val: () => db.workouts.length, goal: 50 },
  { id: 'w100', name: 'Legende', desc: '100 Trainings', icon: 'trophy', val: () => db.workouts.length, goal: 100 },
  { id: 'g4', name: 'Dranbleiber', desc: '4 Trainings in Folge, keins verpasst', icon: 'flame', val: () => habitBest(gymHabit()), goal: 4 },
  { id: 'g12', name: 'Unaufhaltsam', desc: '12 Trainings in Folge', icon: 'flame', val: () => habitBest(gymHabit()), goal: 12 },
  { id: 'g30', name: 'Gewohnheitstier', desc: '30 Trainings in Folge', icon: 'flame', val: () => habitBest(gymHabit()), goal: 30 },
  { id: 'p3', name: 'Guter Lauf', desc: '3 perfekte Tage in Folge', icon: 'star', val: perfectBest, goal: 3 },
  { id: 'p7', name: 'Perfekte Woche', desc: '7 perfekte Tage in Folge', icon: 'star', val: perfectBest, goal: 7 },
  { id: 'p30', name: 'Perfekter Monat', desc: '30 perfekte Tage in Folge', icon: 'star', val: perfectBest, goal: 30 },
  { id: 'v10', name: '10 Tonnen', desc: '10.000 kg insgesamt bewegt', icon: 'plates', val: () => Math.floor(totalVolume() / 1000), goal: 10 },
  { id: 'v100', name: '100 Tonnen', desc: '100.000 kg insgesamt bewegt', icon: 'plates', val: () => Math.floor(totalVolume() / 1000), goal: 100 },
  { id: 'pr1', name: 'Rekordjäger', desc: 'Erste neue Bestleistung', icon: 'trophy', val: totalPRs, goal: 1 },
  { id: 'pr10', name: 'Kraftpaket', desc: '10 neue Bestleistungen', icon: 'trophy', val: totalPRs, goal: 10 },
  { id: 'c100', name: '100 Haken', desc: '100 erledigte Gewohnheiten', icon: 'check', val: totalChecks, goal: 100 },
];
function checkBadges(silent) {
  const fresh = BADGES.filter((b) => !db.badges.includes(b.id) && b.val() >= b.goal);
  if (!fresh.length) return;
  db.badges.push(...fresh.map((b) => b.id));
  saveDb();
  if (!silent) setTimeout(() => toast(`Erfolg freigeschaltet: ${fresh[fresh.length - 1].name}`), 900);
}
function renderBadges() {
  const got = BADGES.filter((b) => db.badges.includes(b.id)).length;
  $('#badges').innerHTML = `<div class="card-head"><h2>Erfolge</h2><span class="muted">${got} von ${BADGES.length}</span></div>
    <div class="badge-grid">${BADGES.map((b) => {
      const on = db.badges.includes(b.id), v = Math.min(b.val(), b.goal);
      return `<div class="bdg${on ? ' on' : ''}"><span class="bdg-ic">${ic(b.icon)}</span><b>${b.name}</b><span class="muted">${b.desc}</span>
        ${on ? '' : `<div class="bar"><i style="width:${(v / b.goal) * 100}%"></i></div><span class="bdg-n num">${v} / ${b.goal}</span>`}</div>`;
    }).join('')}</div>`;
}

/* ---------------- Events ---------------- */
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-habit],[data-hplus],[data-hminus],[data-hcell],[data-hedit],[data-hnew],[data-hpreset],[data-hcustom],[data-freeze]');
  if (!b) return;
  const d = b.dataset;
  if (d.habit) setHabit(d.habit, d.k, 'toggle');
  else if (d.hcell) {
    const h = db.habits.find((x) => x.id === d.hcell);
    setHabit(h.id, d.k, h.kind === 'count' ? (isDone(h, d.k) ? 0 : h.target) : 'toggle');
  } else if (d.hplus) { const h = db.habits.find((x) => x.id === d.hplus); setHabit(h.id, d.k, (habitVal(h, d.k) || 0) + 1); }
  else if (d.hminus) { const h = db.habits.find((x) => x.id === d.hminus); setHabit(h.id, d.k, (habitVal(h, d.k) || 0) - 1); }
  else if (d.hedit) habitEditor(d.hedit);
  else if (d.hnew !== undefined) addHabitSheet();
  else if (d.hpreset) { db.habits.push(makeHabit(d.hpreset)); saveDb(); closeModal(); toast('Gewohnheit hinzugefügt'); refreshHabitViews(todayKey()); }
  else if (d.hcustom !== undefined) habitEditor(null);
  else if (d.freeze) toggleFreeze(d.freeze);
});
