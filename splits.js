'use strict';

/* ============================================================
 *  Splits: eigene Trainingspläne bauen, Vorlagen übernehmen.
 *  Ein Split hat Tage (z. B. Push, Pull, Legs), jeder Tag Übungen
 *  mit Sätzen, Wiederholungsbereich, Pause und Tempo.
 * ============================================================ */

const GOALS = ['Muskelaufbau', 'Kraft', 'Kraft & Masse', 'Allround', 'Einstieg', 'Definition'];
const RESTS = [45, 60, 90, 120, 150, 180, 240];
let draft = null;       // Split, der gerade bearbeitet wird
let draftIsNew = false;

function splitMeta(s) {
  return [s.goal, `${s.perWeek}× pro Woche`, `${s.days.length} ${s.days.length === 1 ? 'Tag' : 'Tage'}`, s.level].filter(Boolean).join(' · ');
}

function renderSplits() {
  const mine = state.splits;
  $('#sp-mine').innerHTML = mine.length ? mine.map((s) => {
    const isActive = s.id === state.activeSplitId;
    const done = state.workouts.filter((w) => w.splitId === s.id).length;
    return `<article class="card split-card${isActive ? ' is-active' : ''}" data-split="${s.id}">
      <div class="split-top">
        <div><h3>${esc(s.name)}</h3><div class="muted">${esc(splitMeta(s))}</div></div>
        <span class="badges">${s.public ? `<span class="badge quiet">Öffentlich</span>` : ''}${isActive ? `<span class="badge">${ic('check')}Aktiv</span>` : ''}</span>
      </div>
      <div class="split-days">${s.days.map((d) => `<span>${esc(d.name)}</span>`).join('')}</div>
      <div class="muted small">${done ? `${done}× trainiert` : 'Noch nicht trainiert'}${s.source?.templateId ? ' · aus Vorlage' : s.source?.author ? ` · von ${esc(s.source.author)}` : ''}</div>
    </article>`;
  }).join('') : `<div class="card empty"><p>Du hast noch keinen Split. Übernimm eine Vorlage oder bau deinen eigenen.</p></div>`;

  $('#sp-templates').innerHTML = TEMPLATES.map((t) => {
    const copied = state.splits.some((s) => s.source?.templateId === t.id);
    return `<article class="card split-card tpl" data-template="${t.id}">
      <div class="split-top">
        <div><h3>${esc(t.name)}</h3><div class="muted">${esc(splitMeta(t))}</div></div>
        ${copied ? `<span class="badge quiet">Übernommen</span>` : ''}
      </div>
      <p class="tpl-desc">${esc(t.description)}</p>
      <div class="split-days">${t.days.map((d) => `<span>${esc(d.name)}</span>`).join('')}</div>
    </article>`;
  }).join('');
}

/** Detail eines Splits (eigener oder Vorlage) */
function showSplit(id, isTemplate) {
  const s = isTemplate ? TEMPLATES.find((t) => t.id === id) : state.splits.find((x) => x.id === id);
  if (!s) return;
  const isActive = !isTemplate && s.id === state.activeSplitId;
  openModal(`
    <div class="muted">${isTemplate ? 'Vorlage' : s.public ? 'Dein Split · öffentlich geteilt' : 'Dein Split'}</div>
    <h3>${esc(s.name)}</h3>
    <p class="muted">${esc(splitMeta(s))}</p>
    ${s.description ? `<p class="notes">${esc(s.description)}</p>` : ''}
    <div class="sd-days">${s.days.map((d) => `
      <section class="sd-day"><h4>${esc(d.name)}</h4>
        <ul class="next-list">${d.exercises.map((e) => `<li>${exThumb(e.exId, 'mini-thumb')}<span>${esc(e.name || exInfo(e.exId).name)}</span>
          <span class="muted num">${e.sets} × ${repRange(e)} · ${fmtDur(e.rest)}</span></li>`).join('')}</ul>
      </section>`).join('')}</div>
    <div class="modal-actions">
      ${isTemplate
        ? `<button class="btn primary" data-adopt="${s.id}">${ic('copy')}Split übernehmen</button>`
        : `${isActive ? '' : `<button class="btn primary" data-activate="${s.id}">${ic('check')}Als aktiv setzen</button>`}
           <button class="btn" data-edit-split="${s.id}">${ic('edit')}Bearbeiten</button>
           <button class="btn" data-dup-split="${s.id}">${ic('copy')}Duplizieren</button>
           ${s.source?.ref || s.source?.templateId ? '' : s.public
             ? `<button class="btn" data-unshare-split="${s.id}">Nicht mehr teilen</button>`
             : `<button class="btn" data-share-split="${s.id}">${ic('upload')}Öffentlich teilen</button>`}
           <button class="btn danger" data-del-split="${s.id}">${ic('trash')}Löschen</button>`}
      <button class="btn" data-close>Schließen</button>
    </div>`, 'tall');
}

function adoptTemplate(id) {
  const t = TEMPLATES.find((x) => x.id === id);
  const s = cloneSplit(t, { source: { templateId: t.id, author: 'Pulse' } });
  state.splits.push(s);
  state.activeSplitId = s.id;
  save();
  closeModal();
  toast(`„${esc(s.name)}“ übernommen und aktiv`);
  renderSplits();
}

/* ---------------- Baukasten ---------------- */
function editSplit(id) {
  const src = id && state.splits.find((s) => s.id === id);
  draftIsNew = !src;
  draft = src ? JSON.parse(JSON.stringify(src)) : {
    id: uid(), name: '', goal: 'Muskelaufbau', level: '', perWeek: 3, description: '',
    days: [{ id: uid(), name: 'Tag A', exercises: [] }],
    createdAt: new Date().toISOString(),
  };
  closeModal();
  showView('split-edit');
  renderEditor();
}

function renderEditor() {
  const d = draft;
  $('#se-title').textContent = draftIsNew ? 'Neuer Split' : 'Split bearbeiten';
  $('#se-meta').innerHTML = `
    <label>Name <input data-sf="name" value="${esc(d.name)}" maxlength="40" placeholder="z. B. Mein PPL" required /></label>
    <div class="row">
      <label>Ziel <select data-sf="goal">${GOALS.map((g) => `<option${g === d.goal ? ' selected' : ''}>${g}</option>`).join('')}</select></label>
      <label>Trainings pro Woche <select data-sf="perWeek">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option${n === d.perWeek ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
    </div>
    <label>Beschreibung (optional) <textarea data-sf="description" rows="2" placeholder="Für wen ist der Split, was ist die Idee?">${esc(d.description)}</textarea></label>`;
  $('#se-days').innerHTML = d.days.map((day, di) => `
    <section class="card se-day" data-di="${di}">
      <div class="se-day-head">
        <input class="se-day-name" data-df="${di}" value="${esc(day.name)}" aria-label="Name von Tag ${di + 1}" maxlength="30" />
        ${di > 0 ? `<button class="icon-btn" data-day-up="${di}" aria-label="Tag nach oben">${ic('arrow-up')}</button>` : ''}
        <button class="icon-btn" data-day-del="${di}" aria-label="Tag löschen">${ic('trash')}</button>
      </div>
      ${day.exercises.map((e, ei) => `
        <div class="se-ex" data-di="${di}" data-ei="${ei}">
          <div class="se-ex-top">${exThumb(e.exId, 'mini-thumb')}<b>${esc(e.name)}</b>
            <span class="se-ex-act">
              ${ei > 0 ? `<button class="icon-btn sm" data-ex-up="${di}:${ei}" aria-label="${esc(e.name)} nach oben">${ic('arrow-up')}</button>` : ''}
              <button class="icon-btn sm" data-ex-del="${di}:${ei}" aria-label="${esc(e.name)} entfernen">${ic('x')}</button>
            </span></div>
          <div class="se-grid">
            <label>Sätze <input type="number" inputmode="numeric" min="1" max="12" data-ef="sets" value="${e.sets}" /></label>
            <label>Wdh. von <input type="number" inputmode="numeric" min="1" max="100" data-ef="repsMin" value="${e.repsMin}" /></label>
            <label>bis <input type="number" inputmode="numeric" min="1" max="100" data-ef="repsMax" value="${e.repsMax}" /></label>
            <label>Pause <select data-ef="rest">${RESTS.map((r) => `<option value="${r}"${r === e.rest ? ' selected' : ''}>${fmtDur(r)}</option>`).join('')}</select></label>
            <label class="se-tempo">Tempo <select data-ef="tempo">${tempoOptions(e.tempo)}</select></label>
          </div>
        </div>`).join('')}
      <button class="btn sm" data-add-ex="${di}">${ic('plus')}Übung hinzufügen</button>
    </section>`).join('');
}

function saveDraft() {
  const d = draft;
  d.name = d.name.trim();
  if (!d.name) { toast('Bitte gib deinem Split einen Namen'); $('[data-sf=name]').focus(); return; }
  d.days = d.days.filter((day) => day.exercises.length);
  if (!d.days.length) return toast('Füge mindestens eine Übung hinzu');
  for (const day of d.days) for (const e of day.exercises) {
    e.repsMin = Math.max(1, e.repsMin | 0);
    e.repsMax = Math.max(e.repsMin, e.repsMax | 0);
    e.sets = Math.max(1, Math.min(12, e.sets | 0));
  }
  d.updatedAt = new Date().toISOString();
  const i = state.splits.findIndex((s) => s.id === d.id);
  if (i >= 0) state.splits[i] = d; else state.splits.push(d);
  if (!state.activeSplitId || draftIsNew) state.activeSplitId = d.id;
  save();
  draft = null;
  toast('Split gespeichert');
  showView('splits');
}

/* ---------------- Events ---------------- */
function initSplits() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-split],[data-template],[data-adopt],[data-activate],[data-edit-split],[data-dup-split],[data-del-split],[data-new-split],[data-add-ex],[data-ex-up],[data-ex-del],[data-day-up],[data-day-del],[data-add-day],[data-save-split],[data-cancel-split]');
    if (!el) return;
    const ds = el.dataset;
    if (ds.split) showSplit(ds.split);
    else if (ds.template) showSplit(ds.template, true);
    else if (ds.adopt) adoptTemplate(ds.adopt);
    else if (ds.activate) { state.activeSplitId = ds.activate; save(); closeModal(); toast('Aktiver Split geändert'); renderSplits(); }
    else if (ds.editSplit) editSplit(ds.editSplit);
    else if (ds.dupSplit) {
      const s = state.splits.find((x) => x.id === ds.dupSplit);
      const copy = cloneSplit(s, { name: s.name + ' (Kopie)', source: s.source });
      delete copy.public; delete copy.publishedAt;
      state.splits.push(copy);
      save(); closeModal(); renderSplits(); toast('Kopie angelegt');
    } else if (ds.delSplit) {
      if (!confirm('Split löschen? Deine bisherigen Trainings bleiben erhalten.')) return;
      state.splits = state.splits.filter((s) => s.id !== ds.delSplit);
      if (state.activeSplitId === ds.delSplit) state.activeSplitId = state.splits[0]?.id || null;
      save(); closeModal(); renderSplits();
    } else if (ds.newSplit !== undefined) editSplit(null);
    else if (ds.addEx) {
      const di = +ds.addEx;
      openPicker((exId) => {
        draft.days[di].exercises.push({ exId, name: exInfo(exId).name, sets: 3, repsMin: 8, repsMax: 12, rest: 90, tempo: '2-0-1-0' });
        renderEditor();
      });
    } else if (ds.exUp) { const [di, ei] = ds.exUp.split(':').map(Number); const l = draft.days[di].exercises; [l[ei - 1], l[ei]] = [l[ei], l[ei - 1]]; renderEditor(); }
    else if (ds.exDel) { const [di, ei] = ds.exDel.split(':').map(Number); draft.days[di].exercises.splice(ei, 1); renderEditor(); }
    else if (ds.dayUp) { const i = +ds.dayUp; const l = draft.days; [l[i - 1], l[i]] = [l[i], l[i - 1]]; renderEditor(); }
    else if (ds.dayDel) {
      const i = +ds.dayDel;
      if (draft.days[i].exercises.length && !confirm(`${draft.days[i].name} löschen?`)) return;
      draft.days.splice(i, 1);
      if (!draft.days.length) draft.days.push({ id: uid(), name: 'Tag A', exercises: [] });
      renderEditor();
    } else if (ds.addDay !== undefined) {
      draft.days.push({ id: uid(), name: 'Tag ' + String.fromCharCode(65 + draft.days.length), exercises: [] });
      renderEditor();
      requestAnimationFrame(() => $$('.se-day-name').pop()?.select());
    } else if (ds.saveSplit !== undefined) saveDraft();
    else if (ds.cancelSplit !== undefined) { draft = null; showView('splits'); }
  });
  // Eingaben im Baukasten direkt in den Entwurf schreiben
  $('#view-split-edit').addEventListener('input', onEditorInput);
  $('#view-split-edit').addEventListener('change', onEditorInput);
}
function onEditorInput(e) {
  if (!draft) return;
  const t = e.target;
  if (t.dataset.sf) draft[t.dataset.sf] = t.dataset.sf === 'perWeek' ? +t.value : t.value;
  else if (t.dataset.df !== undefined) draft.days[+t.dataset.df].name = t.value;
  else if (t.dataset.ef) {
    const box = t.closest('.se-ex');
    const ex = draft.days[+box.dataset.di].exercises[+box.dataset.ei];
    ex[t.dataset.ef] = t.dataset.ef === 'tempo' ? t.value : Number(t.value);
  }
}
