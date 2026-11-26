'use strict';

/* ============================================================
 *  Cloud (Supabase): Konto, Sync, Splits teilen, Entdecken.
 *
 *  Prinzip „lokal zuerst“: Die App arbeitet immer mit den lokalen Daten.
 *  Ist man angemeldet, gleicht sync() im Hintergrund ab:
 *   - Für jedes Element (Training, Cardio, Split) wird ein Fingerabdruck des
 *     zuletzt hochgeladenen Stands gemerkt (state.sync.hashes).
 *   - Geändert → hochladen, lokal gelöscht → in der Cloud löschen,
 *     nur in der Cloud vorhanden → herunterladen.
 *  Offline schlägt der Upload fehl und wird beim nächsten Mal wiederholt.
 * ============================================================ */

const SUPABASE_URL = 'https://qmdseosdryysmiksmxnj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_6mA3Nt518JKRdqzsdnVO2A_n2k-3zP3'; // öffentlicher Schlüssel, darf im Code stehen

let sb = null;
let user = null;
let syncing = false;
let syncAgain = false;
let syncTimer = 0;
let lastSyncError = '';
let authProviders = { email: true, google: false };

function cloudReady() { return !!sb; }
function initCloud() {
  if (!window.supabase?.createClient) return; // Bibliothek nicht geladen
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  state.sync = state.sync || { hashes: {} };
  sb.auth.onAuthStateChange((event, session) => {
    const prev = user?.id;
    user = session?.user || null;
    if (event === 'PASSWORD_RECOVERY') setTimeout(newPasswordForm, 300);
    if (user && user.id !== prev) setTimeout(onSignedIn, 0);
    if (!user && prev) onSignedOut();
    renderAccount();
  });
  fetch(SUPABASE_URL + '/auth/v1/settings', { headers: { apikey: SUPABASE_KEY } })
    .then((r) => r.json()).then((s) => { authProviders = { email: !!s.external?.email, google: !!s.external?.google }; })
    .catch(() => {});
  window.addEventListener('online', () => scheduleSync(500));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleSync(1000); });
}

/* ---------------- Konto ---------------- */
async function onSignedIn() {
  // Gehörten die lokalen Daten zu einem anderen Konto? Dann nicht vermischen.
  if (state.sync.owner && state.sync.owner !== user.id) {
    const keep = confirm('Auf diesem Gerät liegen Daten eines anderen Kontos. In dieses Konto übernehmen?\n\nAbbrechen = Gerät leeren und nur die Daten dieses Kontos laden.');
    if (!keep) { const s = blankState(); state = s; }
    state.sync = { hashes: {} };
  }
  state.sync.owner = user.id;
  save(true);
  // Profil holen; lokalen Namen übernehmen, falls das Profil noch keinen hat
  const { data: prof } = await sb.from('profiles').select('display_name, visibility').eq('id', user.id).maybeSingle();
  if (prof) {
    if (prof.display_name && !state.profile.name) state.profile.name = prof.display_name;
    // Erste Anmeldung auf diesem Gerät: Einstellung aus der Cloud gilt
    if (!state.sync.profileHash && prof.visibility) state.profile.visibility = prof.visibility;
  }
  await sync();
  renderCurrent();
  if (typeof onSocialSignIn === 'function') onSocialSignIn();
}
function onSignedOut() {
  state.sync = { hashes: {} };
  save(true);
  if (typeof onSocialSignOut === 'function') onSocialSignOut();
  renderCurrent();
}

/** Wird nach jedem save() aufgerufen */
function scheduleSync(ms = 1500) {
  if (!user) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(sync, ms);
}

/* ---------------- Sync ---------------- */
/** Kurzer Fingerabdruck eines Objekts (djb2) */
function hashOf(obj) {
  const s = JSON.stringify(obj);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + s.length.toString(36);
}
const TABLES = {
  w: { table: 'workouts', list: () => state.workouts, set: (l) => { state.workouts = l; },
       row: (x) => ({ id: x.id, date: x.date, visibility: x.visibility || 'public', data: x }) },
  c: { table: 'cardio', list: () => state.cardio, set: (l) => { state.cardio = l; },
       row: (x) => ({ id: x.id, date: x.date, data: x }) },
  s: { table: 'splits', list: () => state.splits, set: (l) => { state.splits = l; },
       row: (x) => ({ id: x.id, is_public: !!x.public, published_at: x.publishedAt || null, data: x }) },
};
/** Beispieldaten bleiben lokal */
const syncable = (x) => !x.demo;

async function sync() {
  if (!user || !sb) return;
  if (syncing) { syncAgain = true; return; }
  syncing = true;
  setSyncStatus('läuft');
  try {
    const H = state.sync.hashes;
    let pulled = false;
    for (const [k, t] of Object.entries(TABLES)) {
      // 1) Cloud lesen
      const { data: remote, error } = await sb.from(t.table).select('id, data, updated_at').eq('user_id', user.id);
      if (error) throw error;
      const local = new Map(t.list().map((x) => [x.id, x]));
      const remoteIds = new Set();
      const toDelete = [];
      for (const r of remote) {
        remoteIds.add(r.id);
        const key = k + ':' + r.id;
        const l = local.get(r.id);
        if (!l) {
          if (H[key]) toDelete.push(r.id);             // lokal gelöscht → in der Cloud löschen
          else { t.list().push(r.data); H[key] = hashOf(r.data); pulled = true; } // neu von anderem Gerät
        } else if (H[key] === hashOf(l) && hashOf(r.data) !== H[key]) {
          // lokal unverändert, in der Cloud neuer (anderes Gerät) → übernehmen
          Object.assign(l, r.data);
          H[key] = hashOf(l);
          pulled = true;
        }
      }
      if (toDelete.length) {
        const { error: e2 } = await sb.from(t.table).delete().eq('user_id', user.id).in('id', toDelete);
        if (e2) throw e2;
        toDelete.forEach((id) => delete H[k + ':' + id]);
      }
      // Hashes von Elementen, die es nirgends mehr gibt, aufräumen
      for (const key of Object.keys(H)) {
        if (key.startsWith(k + ':') && !local.has(key.slice(2)) && !remoteIds.has(key.slice(2))) delete H[key];
      }
      // 2) Geänderte oder neue Elemente hochladen
      const changed = t.list().filter((x) => syncable(x) && H[k + ':' + x.id] !== hashOf(x));
      for (let i = 0; i < changed.length; i += 200) {
        const chunk = changed.slice(i, i + 200);
        const { error: e3 } = await sb.from(t.table).upsert(chunk.map((x) => ({ ...t.row(x), updated_at: new Date().toISOString() })), { onConflict: 'user_id,id' });
        if (e3) throw e3;
        chunk.forEach((x) => { H[k + ':' + x.id] = hashOf(x); });
      }
    }
    // Profil
    const prof = { display_name: (state.profile.name || '').slice(0, 40), visibility: state.profile.visibility || 'public' };
    if (state.sync.profileHash !== hashOf(prof)) {
      const { error } = await sb.from('profiles').upsert({ id: user.id, ...prof, updated_at: new Date().toISOString() });
      if (error) throw error;
      state.sync.profileHash = hashOf(prof);
    }
    await pushResults();
    await pushStats();
    if (pulled) markAllPRs();
    state.sync.last = new Date().toISOString();
    lastSyncError = '';
    save(true);
    if (pulled) renderCurrent();
    setSyncStatus('ok');
  } catch (e) {
    lastSyncError = e?.message || String(e);
    setSyncStatus('fehler');
  } finally {
    syncing = false;
    if (syncAgain) { syncAgain = false; scheduleSync(300); }
  }
}

/* ---------------- Fortschritt pro Split ---------------- */
/** Welche öffentliche Referenz hat ein lokaler Split? (Vorlage, eigener geteilter oder übernommener) */
function splitRef(s) {
  if (s.public && user) return user.id + ':' + s.id;
  return s.source?.ref || s.source?.templateId || null;
}

/**
 * Fortschritt mit einem Split: pro Übung bestes geschätztes 1RM der ersten
 * und der letzten beiden Einheiten. Gewertet werden Übungen mit mindestens
 * 3 Einheiten; Durchschnitt über alle diese Übungen.
 */
function splitStats(split) {
  const ws = state.workouts.filter((w) => w.splitId === split.id && !w.demo)
    .sort((a, b) => (a.date + a.createdAt).localeCompare(b.date + b.createdAt));
  if (ws.length < 2) return null;
  const per = {};
  for (const w of ws) for (const e of w.exercises) {
    const top = doneSets(e).reduce((m, s) => Math.max(m, e1rm(s.weight, s.reps)), 0);
    if (!top) continue;
    (per[e.exId] = per[e.exId] || { name: e.name, vals: [] }).vals.push(top);
  }
  const lifts = Object.entries(per).filter(([, v]) => v.vals.length >= 3).map(([exId, v]) => {
    const from = v.vals[0];
    const to = Math.max(...v.vals.slice(-2));
    return { exId, name: v.name, from: Math.round(from * 10) / 10, to: Math.round(to * 10) / 10, pct: Math.round(((to - from) / from) * 1000) / 10 };
  }).sort((a, b) => b.pct - a.pct);
  if (!lifts.length) return null;
  const days = Math.round((parseYmd(ws[ws.length - 1].date) - parseYmd(ws[0].date)) / 86400000);
  return {
    splitName: split.name,
    workouts: ws.length,
    weeks: Math.max(1, Math.round(days / 7)),
    avgPct: Math.round((lifts.reduce((n, l) => n + l.pct, 0) / lifts.length) * 10) / 10,
    lifts: lifts.slice(0, 6),
    since: ws[0].date,
    last: ws[ws.length - 1].date,
  };
}

async function pushResults() {
  const H = state.sync.hashes;
  const wanted = {};
  if (state.profile.visibility !== 'private') {
    for (const s of state.splits) {
      const ref = splitRef(s);
      const st = ref && splitStats(s);
      if (st) wanted[ref] = st;
    }
  }
  for (const [ref, stats] of Object.entries(wanted)) {
    if (H['r:' + ref] === hashOf(stats)) continue;
    const { error } = await sb.from('split_results').upsert({ split_ref: ref, stats, updated_at: new Date().toISOString() }, { onConflict: 'user_id,split_ref' });
    if (error) throw error;
    H['r:' + ref] = hashOf(stats);
  }
  for (const key of Object.keys(H)) {
    if (!key.startsWith('r:') || wanted[key.slice(2)]) continue;
    const { error } = await sb.from('split_results').delete().eq('user_id', user.id).eq('split_ref', key.slice(2));
    if (error) throw error;
    delete H[key];
  }
}

/* ---------------- Profil-Statistik für Follower ---------------- */
/** Skips, Ruhetage (12 Monate), Streak und Rekorde – sichtbar je nach Profil-Sichtbarkeit */
function profileStats() {
  // Nur mit echten Trainings teilen – Beispieldaten bleiben auf dem Gerät
  const real = state.workouts.some((w) => !w.demo) || state.cardio.some((c) => !c.demo);
  if (!real) return { marks: {}, records: [], streak: {} };
  const from = ymd(addDays(today(), -365));
  const marks = {};
  for (const [k, v] of Object.entries(state.marks || {})) if (k >= from && (v === 'skip' || v === 'rest')) marks[k] = v;
  const s = computeStreaks();
  return {
    marks,
    records: recordSummary(8),
    streak: { current: s.current, longest: s.longest, weeks: s.weekStreak, skips: s.skips },
  };
}
let statsMissing = false; // Tabelle noch nicht angelegt (stats.sql nicht ausgeführt)
async function pushStats() {
  if (statsMissing) return;
  const st = profileStats();
  const h = hashOf(st);
  if (state.sync.statsHash === h) return;
  const { error } = await sb.from('profile_stats').upsert({ user_id: user.id, ...st, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') { statsMissing = true; return; }
    throw error;
  }
  state.sync.statsHash = h;
}

/* ---------------- Anmelden / Registrieren ---------------- */
function setSyncStatus(s) {
  const el = $('#acc-sync');
  if (!el) return;
  if (s === 'läuft') el.textContent = 'Synchronisiere …';
  else if (s === 'fehler') el.textContent = navigator.onLine ? 'Sync fehlgeschlagen – wird wiederholt' : 'Offline – wird synchronisiert, sobald du online bist';
  else el.textContent = state.sync?.last ? `Synchronisiert · ${new Date(state.sync.last).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : '';
}

function renderAccount() {
  const box = $('#account');
  if (!box) return;
  if (!sb) {
    box.innerHTML = `<h2>Konto</h2><p class="muted">Die Cloud ist gerade nicht erreichbar. Deine Daten bleiben auf diesem Gerät.</p>`;
    return;
  }
  if (!user) {
    box.innerHTML = `
      <h2>Konto</h2>
      <p class="muted">Mit einem Konto sind deine Trainings gesichert, auf jedem Gerät da, und du kannst deine Splits und deinen Fortschritt teilen.</p>
      <div class="form-actions"><button class="btn primary" data-auth="signup">${ic('user')}Konto erstellen</button><button class="btn" data-auth="login">Anmelden</button></div>`;
    return;
  }
  box.innerHTML = `
    <h2>Konto</h2>
    <div class="acc-row"><div><b>${esc(user.email || '')}</b><div class="muted" id="acc-sync"></div></div></div>
    ${lastSyncError ? `<p class="muted err">Fehler: ${esc(lastSyncError)}</p>` : ''}
    <div class="form-actions">
      <button class="btn" data-sync-now>${ic('upload')}Jetzt synchronisieren</button>
      <button class="btn" data-logout>Abmelden</button>
    </div>`;
  setSyncStatus(syncing ? 'läuft' : lastSyncError ? 'fehler' : 'ok');
}

function authForm(mode = 'login') {
  const signup = mode === 'signup';
  openModal(`
    <form class="form" id="auth-form" data-mode="${mode}">
      <h3>${signup ? 'Konto erstellen' : 'Anmelden'}</h3>
      ${authProviders.google ? `<button class="btn wide" type="button" data-google>${ic('user')}Mit Google ${signup ? 'registrieren' : 'anmelden'}</button>
        <div class="or"><span>oder mit E-Mail</span></div>` : ''}
      ${signup ? `<label>Name (sehen andere) <input name="name" maxlength="40" autocomplete="nickname" value="${esc(state.profile.name || '')}" required /></label>` : ''}
      <label>E-Mail <input name="email" type="email" autocomplete="email" required /></label>
      <label>Passwort <input name="password" type="password" minlength="8" autocomplete="${signup ? 'new-password' : 'current-password'}" required /></label>
      ${signup ? '<p class="muted">Mindestens 8 Zeichen. Danach bekommst du eine E-Mail zur Bestätigung.</p>' : ''}
      <p class="muted err hidden" id="auth-err" role="alert"></p>
      <div class="form-actions">
        <button class="btn primary" type="submit">${signup ? 'Konto erstellen' : 'Anmelden'}</button>
        <button class="btn" type="button" data-close>Abbrechen</button>
      </div>
      <p class="muted">${signup ? 'Schon ein Konto? <button type="button" class="link-btn" data-auth="login">Anmelden</button>'
        : 'Neu hier? <button type="button" class="link-btn" data-auth="signup">Konto erstellen</button> · <button type="button" class="link-btn" data-reset-pw>Passwort vergessen</button>'}</p>
    </form>`);
  setTimeout(() => $('#auth-form input')?.focus(), 50);
}
const redirectUrl = () => location.origin + location.pathname;
const authError = (e) => {
  const m = e?.message || '';
  if (/invalid login/i.test(m)) return 'E-Mail oder Passwort stimmt nicht.';
  if (/not confirmed/i.test(m)) return 'Bitte bestätige zuerst deine E-Mail (Link in der Mail).';
  if (/already registered/i.test(m)) return 'Für diese E-Mail gibt es schon ein Konto. Melde dich an.';
  if (/rate limit/i.test(m)) return 'Zu viele Versuche. Bitte warte kurz.';
  if (/password/i.test(m)) return 'Das Passwort ist zu schwach (mindestens 8 Zeichen).';
  return m || 'Das hat nicht geklappt. Bist du online?';
};
async function onAuthSubmit(f) {
  const err = $('#auth-err');
  const btn = f.querySelector('[type=submit]');
  err.classList.add('hidden');
  btn.disabled = true;
  const email = f.email.value.trim(), password = f.password.value;
  try {
    if (f.dataset.mode === 'signup') {
      const name = f.name.value.trim();
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { display_name: name }, emailRedirectTo: redirectUrl() } });
      if (error) throw error;
      state.profile.name = name;
      save();
      if (!data.session) {
        openModal(`<h3>Fast geschafft</h3><p>Wir haben dir eine E-Mail an <b>${esc(email)}</b> geschickt. Tippe auf den Link darin, dann bist du angemeldet.</p>
          <p class="muted">Keine Mail? Schau im Spam-Ordner nach.</p><div class="modal-actions"><button class="btn" data-close>Okay</button></div>`);
        return;
      }
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
    closeModal();
    toast('Angemeldet');
  } catch (e) {
    err.textContent = authError(e);
    err.classList.remove('hidden');
  } finally { btn.disabled = false; }
}
async function resetPassword() {
  const email = ($('#auth-form [name=email]')?.value || '').trim() || prompt('Deine E-Mail-Adresse:');
  if (!email) return;
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() });
  toast(error ? authError(error) : 'Link zum Zurücksetzen ist unterwegs');
}
function newPasswordForm() {
  openModal(`<form class="form" id="newpw-form"><h3>Neues Passwort</h3>
    <label>Neues Passwort <input name="password" type="password" minlength="8" autocomplete="new-password" required /></label>
    <div class="form-actions"><button class="btn primary" type="submit">Speichern</button></div></form>`);
}

/* ---------------- Splits teilen ---------------- */
async function setSplitPublic(id, on) {
  if (!user) { authForm('signup'); return toast('Zum Teilen brauchst du ein Konto'); }
  const s = state.splits.find((x) => x.id === id);
  s.public = on;
  if (on && !s.publishedAt) s.publishedAt = new Date().toISOString();
  s.author = state.profile.name || '';
  save();
  closeModal();
  toast(on ? `„${esc(s.name)}“ ist jetzt öffentlich` : 'Split ist wieder privat');
  renderSplits();
}

/* ---------------- Entdecken ---------------- */
let discover = { loaded: 0, splits: [], results: [], profiles: {} };
let discoverSort = 'progress';

async function loadDiscover(force) {
  if (!sb) return;
  if (!force && Date.now() - discover.loaded < 60000) return;
  $('#dc-status').textContent = 'Lade …';
  try {
    const [sp, rs] = await Promise.all([
      sb.from('splits').select('user_id, ref, data, published_at').eq('is_public', true).order('published_at', { ascending: false }).limit(100),
      sb.from('split_results').select('user_id, split_ref, stats, updated_at').order('updated_at', { ascending: false }).limit(500),
    ]);
    if (sp.error) throw sp.error;
    if (rs.error) throw rs.error;
    const ids = [...new Set([...sp.data.map((x) => x.user_id), ...rs.data.map((x) => x.user_id)])];
    const profiles = {};
    if (ids.length) {
      const { data: pr, error } = await sb.from('profiles').select('id, display_name').in('id', ids);
      if (error) throw error;
      for (const p of pr) profiles[p.id] = p.display_name || 'Anonym';
    }
    discover = { loaded: Date.now(), splits: sp.data, results: rs.data, profiles };
    $('#dc-status').textContent = '';
  } catch (e) {
    $('#dc-status').textContent = !navigator.onLine ? 'Du bist offline.'
      : e?.code === 'PGRST205' ? 'Die Datenbank ist noch nicht eingerichtet (supabase/schema.sql ausführen).'
      : 'Konnte nicht laden: ' + (e.message || e);
  }
  renderDiscover();
}

/** Split-Infos zu einer Referenz: Vorlage oder geteilter Split */
function refInfo(ref) {
  const tpl = TEMPLATES.find((t) => t.id === ref);
  if (tpl) return { ref, split: tpl, author: 'Pulse-Vorlage', template: true };
  const s = discover.splits.find((x) => x.ref === ref);
  if (s) return { ref, split: s.data, author: discover.profiles[s.user_id] || 'Anonym', userId: s.user_id };
  return null;
}

function renderDiscover() {
  const box = $('#dc-content');
  if (!box) return;
  // Splits mit Ergebnissen gruppieren
  const groups = {};
  for (const r of discover.results) (groups[r.split_ref] = groups[r.split_ref] || []).push(r);
  const refs = new Set([...Object.keys(groups), ...discover.splits.map((s) => s.ref), ...TEMPLATES.map((t) => t.id)]);
  const cards = [...refs].map((ref) => {
    const info = refInfo(ref);
    if (!info) return null;
    const res = groups[ref] || [];
    const avg = res.length ? res.reduce((n, r) => n + r.stats.avgPct, 0) / res.length : null;
    const weeks = res.length ? Math.round(res.reduce((n, r) => n + r.stats.weeks, 0) / res.length) : 0;
    return { ...info, res, avg, weeks };
  }).filter(Boolean);
  cards.sort((a, b) => discoverSort === 'people' ? b.res.length - a.res.length || (b.avg ?? -1e9) - (a.avg ?? -1e9)
    : (b.avg ?? -1e9) - (a.avg ?? -1e9) || b.res.length - a.res.length);

  const people = discover.results.filter((r) => r.stats.weeks >= 2).sort((a, b) => b.stats.avgPct - a.stats.avgPct).slice(0, 12);
  $('#dc-splits').innerHTML = cards.length ? cards.map((c) => `
    <article class="card split-card" data-dc-split="${esc(c.ref)}">
      <div class="split-top"><div><h3>${esc(c.split.name)}</h3><div class="muted">von ${esc(c.author)} · ${esc(splitMeta(c.split))}</div></div>
        ${c.avg !== null ? `<span class="badge">${c.avg > 0 ? '+' : ''}${fmtW(Math.round(c.avg * 10) / 10)} %</span>` : ''}</div>
      <div class="dc-stat">${c.res.length
        ? `${ic('user')}${c.res.length} ${c.res.length === 1 ? 'Person' : 'Leute'} · Ø ${c.weeks} Wochen · bester Lift ${esc(bestLift(c.res))}`
        : `${ic('user')}Noch keine Ergebnisse – sei der Erste`}</div>
      <div class="split-days">${c.split.days.map((d) => `<span>${esc(d.name)}</span>`).join('')}</div>
    </article>`).join('') : '<div class="card empty"><p>Noch keine geteilten Splits.</p></div>';

  $('#dc-people').innerHTML = people.length ? people.map((r) => {
    const name = discover.profiles[r.user_id] || 'Anonym';
    const top = r.stats.lifts[0];
    return `<button class="person" data-dc-person="${esc(r.user_id)}|${esc(r.split_ref)}">
      <span class="avatar sm" aria-hidden="true">${esc(name.charAt(0).toUpperCase())}</span>
      <span class="person-body"><b>${esc(name)}${user && r.user_id === user.id ? ' (du)' : ''}</b>
        <small class="muted">${esc(r.stats.splitName)} · ${r.stats.weeks} Wochen${top ? ` · ${esc(top.name)} +${fmtW(top.pct)} %` : ''}</small></span>
      <span class="person-pct num">+${fmtW(r.stats.avgPct)} %</span>
    </button>`;
  }).join('') : '<p class="muted">Noch niemand. Trainiere ein paar Wochen mit einem Split, dann erscheinst du hier.</p>';
}
function bestLift(res) {
  let best = null;
  for (const r of res) for (const l of r.stats.lifts) if (!best || l.pct > best.pct) best = l;
  return best ? `${best.name} +${fmtW(best.pct)} %` : '–';
}

function showDiscoverSplit(ref) {
  const info = refInfo(ref);
  if (!info) return;
  const s = info.split;
  const res = discover.results.filter((r) => r.split_ref === ref).sort((a, b) => b.stats.avgPct - a.stats.avgPct);
  const mine = state.splits.some((x) => splitRef(x) === ref || (user && x.public && user.id + ':' + x.id === ref));
  openModal(`
    <div class="muted">von ${esc(info.author)}</div>
    <h3>${esc(s.name)}</h3>
    <p class="muted">${esc(splitMeta(s))}</p>
    ${s.description ? `<p class="notes">${esc(s.description)}</p>` : ''}
    ${res.length ? `<h4 class="sd-h">Ergebnisse</h4><div class="people">${res.map((r) => personRow(r)).join('')}</div>` : ''}
    <div class="sd-days">${s.days.map((d) => `
      <section class="sd-day"><h4>${esc(d.name)}</h4>
        <ul class="next-list">${d.exercises.map((e) => `<li>${exThumb(e.exId, 'mini-thumb')}<span>${esc(e.name || exInfo(e.exId).name)}</span>
          <span class="muted num">${e.sets} × ${repRange(e)}</span></li>`).join('')}</ul></section>`).join('')}</div>
    <div class="modal-actions">
      ${mine ? '<span class="badge quiet">Schon bei deinen Splits</span>' : `<button class="btn primary" data-dc-adopt="${esc(ref)}">${ic('copy')}Split übernehmen</button>`}
      <button class="btn" data-close>Schließen</button>
    </div>`, 'tall');
}
function personRow(r) {
  const name = discover.profiles[r.user_id] || 'Anonym';
  return `<button class="person" data-dc-person="${esc(r.user_id)}|${esc(r.split_ref)}">
    <span class="avatar sm" aria-hidden="true">${esc(name.charAt(0).toUpperCase())}</span>
    <span class="person-body"><b>${esc(name)}</b><small class="muted">${r.stats.weeks} Wochen · ${r.stats.workouts} Trainings</small></span>
    <span class="person-pct num">+${fmtW(r.stats.avgPct)} %</span></button>`;
}
function showPerson(userId, ref) {
  const r = discover.results.find((x) => x.user_id === userId && x.split_ref === ref);
  if (!r) return;
  const name = discover.profiles[userId] || 'Anonym';
  const info = refInfo(ref);
  const st = r.stats;
  openModal(`
    <div class="profile-head"><div class="avatar lg" aria-hidden="true">${esc(name.charAt(0).toUpperCase())}</div>
      <div class="pf-body"><h3>${esc(name)}</h3><div class="muted">${esc(st.splitName)} · seit ${fmtDate(st.since, { day: 'numeric', month: 'short', year: 'numeric' })}</div></div></div>
    <div class="act-stats">
      <div><div class="label">Fortschritt Ø</div><div class="value pr-val">+${fmtW(st.avgPct)} %</div></div>
      <div><div class="label">Zeitraum</div><div class="value">${st.weeks} Wo.</div></div>
      <div><div class="label">Trainings</div><div class="value">${st.workouts}</div></div>
    </div>
    <h4 class="sd-h">Geschätztes 1RM, Start → jetzt</h4>
    <div class="lifts">${st.lifts.map((l) => `<div class="lift-row"><span>${esc(l.name)}</span>
      <span class="muted num">${fmtW(l.from)} → <b>${fmtW(l.to)} kg</b></span><span class="num lift-pct">${l.pct > 0 ? '+' : ''}${fmtW(l.pct)} %</span></div>`).join('')}</div>
    <div class="modal-actions">
      ${info ? `<button class="btn primary" data-dc-adopt="${esc(ref)}">${ic('copy')}Diesen Split übernehmen</button>` : ''}
      <button class="btn" data-close>Schließen</button>
    </div>`);
}
function adoptRef(ref) {
  const info = refInfo(ref);
  if (!info) return;
  const s = cloneSplit(info.split, { source: info.template ? { templateId: ref, ref } : { ref, author: info.author } });
  delete s.public; delete s.publishedAt; delete s.author;
  state.splits.push(s);
  state.activeSplitId = s.id;
  save();
  closeModal();
  toast(`„${esc(s.name)}“ übernommen und aktiv`);
  showView('splits');
}

function renderDiscoverView() {
  $('#dc-login').classList.toggle('hidden', !!user || !sb);
  $('#dc-offline').classList.toggle('hidden', !!sb);
  renderDiscover();
  loadDiscover();
}

/* ---------------- Events ---------------- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-auth],[data-logout],[data-sync-now],[data-reset-pw],[data-google],[data-share-split],[data-unshare-split],[data-dc-split],[data-dc-person],[data-dc-adopt],[data-dc-sort],[data-dc-reload]');
  if (!el || !sb) return;
  const ds = el.dataset;
  if (ds.auth) authForm(ds.auth);
  else if (ds.logout !== undefined) {
    if (!confirm('Abmelden? Deine Daten bleiben auf diesem Gerät.')) return;
    sb.auth.signOut();
  } else if (ds.syncNow !== undefined) sync().then(renderAccount);
  else if (ds.resetPw !== undefined) resetPassword();
  else if (ds.google !== undefined) sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectUrl() } });
  else if (ds.shareSplit) setSplitPublic(ds.shareSplit, true);
  else if (ds.unshareSplit) setSplitPublic(ds.unshareSplit, false);
  else if (ds.dcSplit) showDiscoverSplit(ds.dcSplit);
  else if (ds.dcPerson) { const [u, r] = ds.dcPerson.split('|'); showPerson(u, r); }
  else if (ds.dcAdopt) adoptRef(ds.dcAdopt);
  else if (ds.dcSort) {
    discoverSort = ds.dcSort;
    $$('#dc-sort button').forEach((b) => b.classList.toggle('active', b === el));
    renderDiscover();
  } else if (ds.dcReload !== undefined) loadDiscover(true);
});
document.addEventListener('submit', async (e) => {
  const id = e.target.getAttribute('id');
  if (id === 'auth-form') { e.preventDefault(); onAuthSubmit(e.target); }
  if (id === 'newpw-form') {
    e.preventDefault();
    const { error } = await sb.auth.updateUser({ password: e.target.password.value });
    if (error) return toast(authError(error));
    closeModal(); toast('Passwort geändert');
  }
});
