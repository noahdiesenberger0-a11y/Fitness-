'use strict';

/* ============================================================
 *  Pulse – Einrichtung beim ersten Start
 *
 *  Schritte: Willkommen (Name) → Ziel → Erfahrung → Trainingstage →
 *  Split (passende Vorlage vorgeschlagen) → Gewohnheiten → Sichtbarkeit → Fertig.
 *  Ergebnis: Profil, aktiver Split, feste Trainingstage und Habits.
 *  Bestehende Nutzer mit Daten überspringen die Einrichtung automatisch;
 *  in den Einstellungen lässt sie sich erneut starten.
 * ============================================================ */

const OB_GOALS = {
  muscle: { name: 'Muskeln aufbauen', desc: 'Mehr Masse und sichtbare Form', icon: 'dumbbell' },
  strength: { name: 'Stärker werden', desc: 'Mehr Gewicht bei den Grundübungen', icon: 'trophy' },
  fit: { name: 'Fit und gesund bleiben', desc: 'Regelmäßig trainieren, gut fühlen', icon: 'heart' },
  start: { name: 'Mit dem Gym anfangen', desc: 'Technik lernen, Routine finden', icon: 'bolt' },
};
const OB_LEVELS = {
  beginner: { name: 'Anfänger', desc: 'Weniger als 6 Monate im Gym' },
  mid: { name: 'Mittel', desc: '6 Monate bis 2 Jahre' },
  pro: { name: 'Fortgeschritten', desc: 'Mehr als 2 Jahre, sichere Technik' },
};
const OB_STEPS = 8;
let obShown = -1; // zuletzt gezeigter Schritt (Animation nur beim Schrittwechsel)
const ob = { step: 0, name: '', goal: 'muscle', level: 'mid', sched: [0, 2, 4], tpl: '', habits: ['water', 'sleep'], vis: 'public' };

/** Passende Vorlage zu Tagen, Erfahrung und Ziel */
function recommendTemplate() {
  const n = ob.sched.length;
  if (ob.level === 'beginner' || ob.goal === 'start') return 'tpl-beginner';
  if (n >= 6) return 'tpl-ppl';
  if (n === 5) return ob.level === 'pro' ? 'tpl-bro' : 'tpl-ul';
  if (n === 4) return 'tpl-ul';
  return 'tpl-fb';
}
const obTpl = () => TEMPLATES.find((t) => t.id === (ob.tpl || recommendTemplate()));

function needsOnboarding() {
  if (state.profile.onboarded) return false;
  // Wer schon Daten hat (alte Version, Import, anderes Gerät), braucht keine Einrichtung
  if (state.workouts.some((w) => !w.demo) || state.cardio.some((c) => !c.demo) || state.splits.length) {
    state.profile.onboarded = true;
    save(true);
    return false;
  }
  return true;
}

function showOnboarding(again) {
  obShown = -1;
  Object.assign(ob, { step: 0, name: state.profile.name || '', vis: state.profile.visibility || 'public', tpl: '' });
  if (again && Array.isArray(state.schedule) && state.schedule.length) ob.sched = [...state.schedule];
  if (again && state.habits?.length) ob.habits = state.habits.filter((h) => h.kind !== 'gym').map((h) => h.key).filter((k) => k !== 'custom');
  $('#onboard').classList.remove('hidden');
  document.body.classList.add('onboarding');
  renderOnboarding();
}
function closeOnboarding() {
  $('#onboard').classList.add('hidden');
  document.body.classList.remove('onboarding');
}

function obOption(attr, key, item, on) {
  return `<button class="ob-opt${on ? ' active' : ''}" data-${attr}="${key}" aria-pressed="${on}">
    ${item.icon ? `<span class="ob-opt-ic">${ic(item.icon)}</span>` : ''}
    <span class="ob-opt-body"><b>${item.name}</b><span class="muted">${item.desc}</span></span>
    <span class="ob-radio" aria-hidden="true">${on ? ic('check') : ''}</span></button>`;
}

function renderOnboarding() {
  const s = ob.step;
  const dots = `<div class="ob-dots" aria-hidden="true">${[...Array(OB_STEPS)].map((_, i) => `<i class="${i <= s ? 'on' : ''}"></i>`).join('')}</div>`;
  const back = s > 0 ? `<button class="btn" data-ob="back">${ic('back')}Zurück</button>` : '';
  const next = (label = 'Weiter', disabled = false) => `<button class="btn primary grow" data-ob="next" ${disabled ? 'disabled' : ''}>${label}${ic('arrow-right')}</button>`;
  let html = '';
  if (s === 0) {
    html = `<div class="ob-hero"><svg class="i ob-logo" aria-hidden="true"><use href="#i-logo"/></svg></div>
      <h1 id="ob-title">Willkommen bei Pulse</h1>
      <p class="ob-lead">Trainieren, dranbleiben und sehen, was deine Freunde machen. In einer Minute ist alles für dich eingerichtet.</p>
      <ul class="ob-points">
        <li>${ic('list')}<span><b>Dein Plan</b> passend zu Ziel und Trainingstagen</span></li>
        <li>${ic('habits')}<span><b>Habits</b> wie Wasser, Schlaf und Protein mit Serien</span></li>
        <li>${ic('feed')}<span><b>Freunde</b> folgen, Trainings übernehmen, gemeinsam nicht skippen</span></li>
      </ul>
      <label class="ob-field">Wie sollen andere dich sehen?
        <input id="ob-name" maxlength="40" autocomplete="nickname" placeholder="Dein Name" value="${esc(ob.name)}" /></label>
      <div class="ob-actions">${next("Los geht's")}</div>
      <button class="link-btn ob-skip" data-ob="demo">Erst mal mit Beispieldaten umschauen</button>`;
  } else if (s === 1) {
    html = `<h1 id="ob-title">Was ist dein Ziel?</h1>
      <p class="ob-lead">Danach schlagen wir dir einen passenden Plan vor.</p>
      <div class="ob-options">${Object.entries(OB_GOALS).map(([k, g]) => obOption('goal', k, g, ob.goal === k)).join('')}</div>
      <div class="ob-actions">${back}${next()}</div>`;
  } else if (s === 2) {
    html = `<h1 id="ob-title">Wie viel Erfahrung hast du?</h1>
      <p class="ob-lead">Für Anfänger gibt es einfachere Übungen und ein langsameres Tempo.</p>
      <div class="ob-options">${Object.entries(OB_LEVELS).map(([k, g]) => obOption('level', k, g, ob.level === k)).join('')}</div>
      <div class="ob-actions">${back}${next()}</div>`;
  } else if (s === 3) {
    html = `<h1 id="ob-title">An welchen Tagen trainierst du?</h1>
      <p class="ob-lead">Feste Tage machen Training zur Gewohnheit. Lieber realistisch starten, du kannst sie jederzeit ändern.</p>
      <div class="ob-week">${HWD.map((d, i) => `<button class="ob-wd${ob.sched.includes(i) ? ' active' : ''}" data-wd="${i}" aria-pressed="${ob.sched.includes(i)}">${d}</button>`).join('')}</div>
      <p class="ob-count">${ob.sched.length ? `<b>${ob.sched.length}× pro Woche</b> · ${daysText(ob.sched)}` : 'Tippe mindestens einen Tag an.'}</p>
      <div class="ob-actions">${back}${next('Weiter', !ob.sched.length)}</div>`;
  } else if (s === 4) {
    const rec = recommendTemplate(), cur = obTpl();
    html = `<h1 id="ob-title">Dein Plan</h1>
      <p class="ob-lead">Passend zu ${ob.sched.length} Tagen pro Woche empfehlen wir <b>${esc(TEMPLATES.find((t) => t.id === rec).name)}</b>. Du kannst ihn später anpassen.</p>
      <div class="ob-options">${TEMPLATES.map((t) => `<button class="ob-opt${cur.id === t.id ? ' active' : ''}" data-tpl="${t.id}" aria-pressed="${cur.id === t.id}">
        <span class="ob-opt-body"><b>${esc(t.name)}${t.id === rec ? ' <span class="ob-tag">Empfohlen</span>' : ''}</b>
          <span class="muted">${t.perWeek}× pro Woche · ${esc(t.level)} · ${esc(t.goal)}</span>
          ${cur.id === t.id ? `<span class="ob-days">${t.days.map((d) => `<span>${esc(d.name)}</span>`).join('')}</span>` : ''}</span>
        <span class="ob-radio" aria-hidden="true">${cur.id === t.id ? ic('check') : ''}</span></button>`).join('')}</div>
      <div class="ob-actions">${back}${next()}</div>`;
  } else if (s === 5) {
    html = `<h1 id="ob-title">Welche Gewohnheiten willst du aufbauen?</h1>
      <p class="ob-lead">Neben dem Training. Fang mit zwei oder drei an, weniger ist am Anfang mehr.</p>
      <div class="ob-options compact">${HABIT_PRESETS.filter((p) => p.key !== 'gym').map((p) => {
        const on = ob.habits.includes(p.key);
        return `<button class="ob-opt${on ? ' active' : ''}" data-obh="${p.key}" aria-pressed="${on}">
          <span class="ob-opt-ic">${ic(p.icon)}</span><span class="ob-opt-body"><b>${p.name}</b><span class="muted">${p.desc}</span></span>
          <span class="ob-check" aria-hidden="true">${on ? ic('check') : ''}</span></button>`;
      }).join('')}</div>
      <div class="ob-actions">${back}${next(ob.habits.length ? 'Weiter' : 'Ohne Gewohnheiten weiter')}</div>`;
  } else if (s === 6) {
    html = `<h1 id="ob-title">Wer darf dein Training sehen?</h1>
      <p class="ob-lead">Pulse lebt davon, dass Freunde mitziehen: Trainings, Skips und Habit-Serien sind für sie sichtbar.</p>
      <div class="ob-options">${Object.entries({
        public: { name: 'Öffentlich', desc: 'Alle können dein Profil und deine Trainings sehen', icon: 'feed' },
        followers: { name: 'Nur Follower', desc: 'Nur Leute, die dir folgen', icon: 'user' },
        private: { name: 'Privat', desc: 'Nur du siehst deine Daten', icon: 'pin' },
      }).map(([k, g]) => obOption('vis', k, g, ob.vis === k)).join('')}</div>
      <p class="muted ob-note">Ein Konto brauchst du erst, wenn du Leuten folgen oder auf mehreren Geräten trainieren willst.</p>
      <div class="ob-actions">${back}${next()}</div>`;
  } else {
    const t = obTpl();
    const first = t.days[0];
    html = `<div class="ob-hero done">${ic('check')}</div>
      <h1 id="ob-title">Alles bereit${ob.name ? ', ' + esc(ob.name.split(' ')[0]) : ''}!</h1>
      <p class="ob-lead">Dein erstes Training ist <b>${esc(first.name)}</b> mit ${first.exercises.length} Übungen.</p>
      <dl class="ob-summary">
        <div><dt>Ziel</dt><dd>${OB_GOALS[ob.goal].name}</dd></div>
        <div><dt>Plan</dt><dd>${esc(t.name)}</dd></div>
        <div><dt>Trainingstage</dt><dd>${daysText(ob.sched)}</dd></div>
        <div><dt>Habits</dt><dd>${ob.habits.length ? ob.habits.map((k) => HABIT_PRESETS.find((p) => p.key === k).name).join(', ') : 'Nur Training'}</dd></div>
      </dl>
      <div class="ob-actions col">
        <button class="btn primary xl wide" data-ob="finish-start">${ic('play')}${esc(first.name)} jetzt starten</button>
        <button class="btn wide" data-ob="finish">Erst mal umschauen</button>
      </div>`;
  }
  const changed = obShown !== s;
  obShown = s;
  const box = $('#onboard'), keep = box.scrollTop;
  $('#onboard-box').innerHTML = dots + `<div class="ob-step${changed ? ' enter' : ''}">${html}</div>`;
  box.scrollTop = changed ? 0 : keep;
  const first = $('#onboard-box h1');
  if (changed && first && s !== 0) { first.setAttribute('tabindex', '-1'); first.focus({ preventScroll: true }); }
}

/** Einrichtung übernehmen: Profil, Split, Trainingstage, Habits */
function finishOnboarding(startNow) {
  state.profile.name = ob.name.trim().slice(0, 40);
  state.profile.visibility = ob.vis;
  state.profile.goal = ob.goal;
  state.profile.level = ob.level;
  state.profile.onboarded = true;
  const t = obTpl();
  // Gleiche Vorlage nicht doppelt anlegen (z. B. bei erneuter Einrichtung)
  let split = state.splits.find((s) => s.source?.templateId === t.id);
  if (!split) {
    split = cloneSplit(t, { source: { templateId: t.id, author: 'Pulse' }, perWeek: ob.sched.length });
    state.splits.push(split);
  }
  state.activeSplitId = split.id;
  state.schedule = [...ob.sched].sort();
  ensureHabits();
  for (const key of ob.habits) if (!state.habits.some((h) => h.key === key)) state.habits.push(makeHabit(key));
  save();
  closeOnboarding();
  const pv = $('#pf-vis'); if (pv) pv.value = ob.vis;
  showView('train');
  if (startNow && typeof startDay === 'function') startDay(split.id, split.days[0].id);
  else toast('Willkommen bei Pulse!');
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('#onboard [data-ob],#onboard [data-goal],#onboard [data-level],#onboard [data-wd],#onboard [data-tpl],#onboard [data-obh],#onboard [data-vis]');
  if (!b) return;
  const d = b.dataset;
  const nameEl = $('#ob-name');
  if (nameEl) ob.name = nameEl.value;
  if (d.ob === 'next') ob.step = Math.min(OB_STEPS - 1, ob.step + 1);
  else if (d.ob === 'back') ob.step = Math.max(0, ob.step - 1);
  else if (d.ob === 'demo') {
    state.profile.onboarded = true;
    closeOnboarding();
    loadDemo(true);
    return;
  } else if (d.ob === 'finish') return finishOnboarding(false);
  else if (d.ob === 'finish-start') return finishOnboarding(true);
  else if (d.goal) ob.goal = d.goal;
  else if (d.level) ob.level = d.level;
  else if (d.wd !== undefined) {
    const i = Number(d.wd);
    ob.sched = ob.sched.includes(i) ? ob.sched.filter((x) => x !== i) : [...ob.sched, i].sort();
    ob.tpl = '';
  } else if (d.tpl) ob.tpl = d.tpl;
  else if (d.obh) ob.habits = ob.habits.includes(d.obh) ? ob.habits.filter((k) => k !== d.obh) : [...ob.habits, d.obh];
  else if (d.vis) ob.vis = d.vis;
  if (d.goal || d.level) ob.tpl = '';
  renderOnboarding();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'ob-name') { e.preventDefault(); $('#onboard [data-ob=next]')?.click(); }
});
