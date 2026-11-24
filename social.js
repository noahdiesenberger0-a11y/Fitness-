'use strict';

/* ============================================================
 *  Sozial (Etappe 3): Benutzername, Folgen, Feed, Kudos,
 *  Kommentare, Benachrichtigungen, Profil teilen (Link + QR).
 *
 *  Nutzt sb und user aus cloud.js. Datenbank: supabase/social.sql.
 *  Der Feed zeigt nur dich und Leute, denen du folgst – kein „Für dich“.
 * ============================================================ */

const social = {
  me: null,               // eigenes Profil { id, username, display_name }
  following: new Set(),   // IDs, denen ich folge
  profiles: {},           // Cache: id → { id, username, display_name }
  feed: [], feedLoaded: 0, feedMore: true, feedLoading: false,
  kudos: {},              // 'owner|id' → { n, mine }
  comments: {},           // 'owner|id' → Anzahl
  notifs: [], unread: 0,
};
const PAGE = 20;
const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;
let notifTimer = 0;

/* ---------------- Start, Anmelden, Abmelden ---------------- */
function initSocial() {
  // Geteilter Profil-Link: …/index.html?u=benutzername
  const params = new URLSearchParams(location.search);
  const u = (params.get('u') || '').toLowerCase();
  if (u) {
    params.delete('u');
    history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '') + location.hash);
    if (USERNAME_RE.test(u)) setTimeout(() => openUsername(u), 600);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') loadNotifs(); });
  notifTimer = setInterval(() => { if (document.visibilityState === 'visible') loadNotifs(); }, 60000);
}

async function onSocialSignIn() {
  if (!sb || !user) return;
  const [{ data: me }, { data: fol }] = await Promise.all([
    sb.from('profiles').select('id, username, display_name').eq('id', user.id).maybeSingle(),
    sb.from('follows').select('following').eq('follower', user.id),
  ]);
  social.me = me || { id: user.id, username: null, display_name: state.profile.name || '' };
  social.profiles[user.id] = social.me;
  social.following = new Set((fol || []).map((f) => f.following));
  social.feedLoaded = 0;
  loadNotifs();
  // Wollte jemand vor der Anmeldung jemandem folgen?
  let pending = null;
  try { pending = localStorage.getItem('pulse.pendingFollow'); localStorage.removeItem('pulse.pendingFollow'); } catch (e) { /* ignore */ }
  if (!social.me.username) setTimeout(() => usernameForm(true), 400);
  else if (pending) followUser(pending, true);
  if (currentView === 'feed' || currentView === 'profile') renderCurrent();
}
function onSocialSignOut() {
  Object.assign(social, { me: null, following: new Set(), feed: [], feedLoaded: 0, kudos: {}, comments: {}, notifs: [], unread: 0 });
  updateBadges();
}

/* ---------------- Hilfen ---------------- */
const displayName = (p) => (p?.display_name || '').trim() || (p?.username ? '@' + p.username : 'Anonym');
const avatar = (p, cls = 'sm') => `<span class="avatar ${cls}" aria-hidden="true">${esc(displayName(p).replace('@', '').charAt(0).toUpperCase() || '?')}</span>`;
const profileUrl = (username) => location.origin + location.pathname.replace(/index\.html$/, '') + '?u=' + encodeURIComponent(username);

function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'gerade eben';
  if (s < 3600) return `vor ${Math.floor(s / 60)} Min.`;
  if (s < 86400) return `vor ${Math.floor(s / 3600)} Std.`;
  if (s < 7 * 86400) { const d = Math.floor(s / 86400); return `vor ${d} ${d === 1 ? 'Tag' : 'Tagen'}`; }
  return fmtDate(iso.slice(0, 10), { day: 'numeric', month: 'short' });
}

/** Profile nachladen, die noch nicht im Cache sind */
async function loadProfiles(ids) {
  const missing = [...new Set(ids)].filter((id) => id && !social.profiles[id]);
  if (!missing.length) return;
  const { data, error } = await sb.from('profiles').select('id, username, display_name').in('id', missing);
  if (error) throw error;
  for (const p of data) social.profiles[p.id] = p;
}

function needAccount(msg) {
  toast(msg || 'Dafür brauchst du ein Konto');
  authForm('signup');
}

/* ---------------- Benutzername ---------------- */
function suggestUsername() {
  const base = (state.profile.name || user?.email?.split('@')[0] || 'pulse')
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9_.]+/g, '').slice(0, 16);
  return base.length >= 3 ? base : (base + 'pulse').slice(0, 16);
}
function usernameForm(first = false) {
  if (!user) return needAccount();
  const cur = social.me?.username || '';
  openModal(`
    <form class="form" id="username-form">
      <h3>${first ? 'Wähle deinen Benutzernamen' : 'Benutzername ändern'}</h3>
      <p class="muted">Darüber finden dich deine Freunde, und er steht in deinem Profil-Link. 3–20 Zeichen: Kleinbuchstaben, Zahlen, Punkt und Unterstrich.</p>
      <label>Benutzername
        <span class="at-input"><span>@</span><input name="username" value="${esc(cur || suggestUsername())}" maxlength="20" autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="username" required /></span></label>
      <p class="muted err hidden" id="un-err" role="alert"></p>
      <div class="form-actions">
        <button class="btn primary" type="submit">Speichern</button>
        <button class="btn" type="button" data-close>${first ? 'Später' : 'Abbrechen'}</button>
      </div>
    </form>`);
  setTimeout(() => { const i = $('#username-form input'); i?.focus(); i?.select(); }, 60);
}
async function saveUsername(f) {
  const err = $('#un-err');
  const name = f.username.value.trim().toLowerCase().replace(/^@/, '');
  err.classList.add('hidden');
  if (!USERNAME_RE.test(name)) {
    err.textContent = 'Nur a–z, 0–9, Punkt und Unterstrich, 3 bis 20 Zeichen.';
    return err.classList.remove('hidden');
  }
  const btn = f.querySelector('[type=submit]');
  btn.disabled = true;
  const { error } = await sb.from('profiles').update({ username: name, updated_at: new Date().toISOString() }).eq('id', user.id);
  btn.disabled = false;
  if (error) {
    err.textContent = error.code === '23505' ? `@${name} ist schon vergeben. Probier einen anderen.` : 'Das hat nicht geklappt: ' + error.message;
    return err.classList.remove('hidden');
  }
  social.me = { ...(social.me || { id: user.id }), username: name };
  social.profiles[user.id] = social.me;
  closeModal();
  toast(`Du bist jetzt @${name}`);
  let pending = null;
  try { pending = localStorage.getItem('pulse.pendingFollow'); localStorage.removeItem('pulse.pendingFollow'); } catch (e) { /* ignore */ }
  if (pending) followUser(pending, true);
  renderCurrent();
}

/* ---------------- Eigenes Profil: Benutzername, Follower, Teilen ---------------- */
async function renderMySocial() {
  const box = $('#pf-social');
  if (!box) return;
  if (!sb || !user) { box.innerHTML = ''; return; }
  const me = social.me;
  box.innerHTML = `
    <div class="card pf-social-card">
      <div class="pf-handle">${me?.username ? `<b>@${esc(me.username)}</b>` : '<span class="muted">Noch kein Benutzername</span>'}
        <button class="link-btn" data-username>${me?.username ? 'Ändern' : 'Festlegen'}</button></div>
      <div class="pf-counts">
        <button data-follow-list="followers"><b class="num" id="pf-n-followers">–</b><span>Follower</span></button>
        <button data-follow-list="following"><b class="num" id="pf-n-following">${social.following.size}</b><span>Folge ich</span></button>
      </div>
      <div class="form-actions">
        <button class="btn primary" data-share-profile>${ic('qr')}Profil teilen</button>
        <button class="btn" data-people>${ic('user-plus')}Leute finden</button>
      </div>
    </div>`;
  const { count } = await sb.from('follows').select('follower', { count: 'exact', head: true }).eq('following', user.id);
  const el = $('#pf-n-followers');
  if (el) el.textContent = count ?? 0;
}

/* ---------------- Pulse-Code: eigener QR-Code im Stil des Logos ---------------- */
const CODE_W = 1080, CODE_H = 1400;
/** Zeichnet die Profil-Karte mit QR-Code auf ein Canvas und gibt es zurück */
async function drawPulseCode(url, username) {
  try { await document.fonts.ready; } catch (e) { /* ignore */ }
  const qr = qrcode(0, 'H'); // höchste Fehlerkorrektur: das Logo in der Mitte darf Punkte verdecken
  qr.addData(url);
  qr.make();
  const n = qr.getModuleCount();
  const cv = document.createElement('canvas');
  cv.width = CODE_W; cv.height = CODE_H;
  const g = cv.getContext('2d');
  const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  const grad = (x, y, w, h, c1, c2) => { const l = g.createLinearGradient(x, y, x + w, y + h); l.addColorStop(0, c1); l.addColorStop(1, c2); return l; };

  // Karte: Ägyptischblau mit leichtem Verlauf, wie das App-Icon
  g.fillStyle = '#1034a6';
  rr(0, 0, CODE_W, CODE_H, 96); g.fill();

  // Kopf: kleines Logo + Schriftzug
  drawLogo(g, 96, 84, 76, false);
  g.fillStyle = '#ffffff';
  g.font = '700 64px "Barlow Semi Condensed", Barlow, system-ui, sans-serif';
  g.textBaseline = 'middle';
  g.fillText('Pulse', 196, 124);

  // Weiße Fläche für den Code (Ruhezone: 3 Module)
  const plate = 840, px = (CODE_W - plate) / 2, py = 220;
  g.fillStyle = '#ffffff';
  rr(px, py, plate, plate, 64); g.fill();
  const quiet = 3;
  const m = plate / (n + quiet * 2);
  const ox = px + quiet * m, oy = py + quiet * m;

  // Freie Mitte für das Logo
  const hole = Math.round(n * 0.2) | 1;
  const h0 = Math.floor((n - hole) / 2), h1 = h0 + hole;
  const inFinder = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  const inHole = (r, c) => r >= h0 - 1 && r < h1 + 1 && c >= h0 - 1 && c < h1 + 1;

  // Module: flache, abgerundete Kacheln in Ägyptischblau – ruhig wie das Logo
  const pad = m * 0.04, tile = m - pad * 2, rad = m * 0.2;
  g.fillStyle = '#1034a6';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!qr.isDark(r, c) || inFinder(r, c) || inHole(r, c)) continue;
    rr(ox + c * m + pad, oy + r * m + pad, tile, tile, rad); g.fill();
  }

  // Ecken-Markierungen: blauer Rahmen, roter Kern (das eine Rot, wie die „heute“-Kachel)
  for (const [r, c] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    const x = ox + c * m, y = oy + r * m;
    g.fillStyle = '#1034a6';
    rr(x + pad, y + pad, 7 * m - pad * 2, 7 * m - pad * 2, m * 1.9); g.fill();
    g.fillStyle = '#ffffff';
    rr(x + m, y + m, 5 * m, 5 * m, m * 1.3); g.fill();
    g.fillStyle = '#c8102e';
    rr(x + 2 * m, y + 2 * m, 3 * m, 3 * m, m * 0.9); g.fill();
  }

  // Logo in der Mitte
  const ls = hole * m;
  drawLogo(g, ox + h0 * m, oy + h0 * m, ls);

  // Name und Hinweis
  g.textAlign = 'center';
  g.fillStyle = '#ffffff';
  g.font = '700 88px "Barlow Semi Condensed", Barlow, system-ui, sans-serif';
  let name = '@' + username;
  while (g.measureText(name).width > CODE_W - 140 && g.font.match(/\d+px/)) {
    const size = parseInt(g.font.match(/(\d+)px/)[1], 10) - 4;
    g.font = `700 ${size}px "Barlow Semi Condensed", Barlow, system-ui, sans-serif`;
  }
  g.fillText(name, CODE_W / 2, 1180);
  g.fillStyle = '#c9d4f2';
  g.font = '500 40px Barlow, system-ui, sans-serif';
  g.fillText('Scannen, um mir auf Pulse zu folgen', CODE_W / 2, 1262);
  return cv;
}
/** Das App-Logo: blaue Fläche, weiße Kacheln, die Kachel „heute“ rot */
function drawLogo(g, x, y, size, ring = true) {
  const k = size / 512;
  g.fillStyle = '#1034a6';
  g.beginPath(); g.roundRect(x, y, size, size, size * 0.22); g.fill();
  if (ring) {
    g.strokeStyle = '#ffffff'; g.lineWidth = Math.max(2, size * 0.04);
    g.beginPath(); g.roundRect(x, y, size, size, size * 0.22); g.stroke();
  }
  // 60:30:10 – blaue Fläche, weiße Kacheln, rote Diagonale (Fortschritt)
  const T = 82, G = 19, S0 = (512 - (4 * T + 3 * G)) / 2;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    g.fillStyle = r + c === 3 ? '#c8102e' : '#ffffff';
    g.beginPath(); g.roundRect(x + (S0 + c * (T + G)) * k, y + (S0 + r * (T + G)) * k, T * k, T * k, 16 * k); g.fill();
  }
}

let codeBlob = null;
async function shareProfile() {
  if (!user) return needAccount('Zum Teilen brauchst du ein Konto');
  if (!social.me?.username) return usernameForm(true);
  const url = profileUrl(social.me.username);
  openModal(`
    <div class="share-card">
      <div class="pulse-code" id="pulse-code" role="img" aria-label="Dein Pulse-Code für @${esc(social.me.username)}"></div>
      <p class="muted">Lass den Code scannen oder schick ihn als Bild oder Link. Wer ihn öffnet, kann dir mit einem Tipp folgen.</p>
    </div>
    <div class="modal-actions">
      <button class="btn primary" data-share-code>${ic('share')}Code teilen</button>
      ${navigator.share ? `<button class="btn" data-share-link>${ic('share')}Link teilen</button>` : ''}
      <button class="btn" data-copy-link>${ic('copy')}Link kopieren</button>
      <button class="btn" data-close>Schließen</button>
    </div>`, 'tall');
  try {
    const cv = await drawPulseCode(url, social.me.username);
    const img = new Image();
    img.src = cv.toDataURL('image/png');
    img.alt = '';
    $('#pulse-code')?.replaceChildren(img);
    codeBlob = await new Promise((res) => cv.toBlob(res, 'image/png'));
  } catch (e) {
    $('#pulse-code')?.replaceChildren(Object.assign(document.createElement('p'), { className: 'muted', textContent: url }));
  }
}
/** Code als Bild teilen (Teilen-Menü) oder herunterladen */
async function shareCode() {
  if (!codeBlob) return;
  const name = `pulse-${social.me.username}.png`;
  const file = new File([codeBlob], name, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Mein Pulse-Code', text: `Folge mir auf Pulse: ${profileUrl(social.me.username)}` }); }
    catch (e) { /* abgebrochen */ }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(codeBlob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Bild gespeichert');
}
async function shareLink() {
  const url = profileUrl(social.me.username);
  try { await navigator.share({ title: 'Folge mir auf Pulse', text: `Folge mir auf Pulse: @${social.me.username}`, url }); }
  catch (e) { /* abgebrochen */ }
}
async function copyLink() {
  const url = profileUrl(social.me.username);
  try { await navigator.clipboard.writeText(url); toast('Link kopiert'); }
  catch (e) { prompt('Link zum Kopieren:', url); }
}

/* ---------------- Leute finden ---------------- */
let searchTimer = 0;
function peopleSearch() {
  if (!sb) return toast('Die Cloud ist gerade nicht erreichbar');
  openModal(`
    <h3>Leute finden</h3>
    <label class="search-field">${ic('search')}<input id="people-q" type="search" placeholder="Benutzername oder Name" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="search" /></label>
    <div class="people user-list" id="people-res"><p class="muted">Tipp den @Namen deiner Freunde ein. Oder schick ihnen deinen Profil-Link.</p></div>
    <div class="modal-actions">
      ${user ? `<button class="btn" data-share-profile>${ic('qr')}Mein Profil teilen</button>` : ''}
      <button class="btn" data-close>Schließen</button>
    </div>`, 'tall');
  const inp = $('#people-q');
  setTimeout(() => inp.focus(), 60);
  inp.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => runSearch(inp.value), 250); });
}
async function runSearch(raw) {
  const box = $('#people-res');
  if (!box) return;
  const q = raw.trim().replace(/^@/, '').replace(/[^\p{L}\p{N}_. -]/gu, '').slice(0, 30);
  if (q.length < 2) { box.innerHTML = '<p class="muted">Mindestens 2 Zeichen.</p>'; return; }
  const uq = q.toLowerCase().replace(/[^a-z0-9_.]/g, '');
  const ors = [`display_name.ilike.%${q.replace(/[%_,()]/g, '')}%`];
  if (uq) ors.unshift(`username.ilike.${uq}%`);
  const { data, error } = await sb.from('profiles').select('id, username, display_name').not('username', 'is', null).or(ors.join(',')).limit(20);
  if (!$('#people-res')) return;
  if (error) { box.innerHTML = `<p class="muted err">Suche fehlgeschlagen: ${esc(error.message)}</p>`; return; }
  data.forEach((p) => { social.profiles[p.id] = p; });
  const list = data.filter((p) => !user || p.id !== user.id);
  box.innerHTML = list.length ? list.map(userRow).join('') : '<p class="muted">Niemand gefunden.</p>';
}
function userRow(p) {
  const me = user && p.id === user.id;
  const f = social.following.has(p.id);
  return `<div class="person user-row">
    <button class="user-open" data-user="${p.id}">${avatar(p)}
      <span class="person-body"><b>${esc(displayName(p))}</b>${p.username ? `<small class="muted">@${esc(p.username)}</small>` : ''}</span></button>
    ${me ? '<span class="badge quiet">Du</span>' : `<button class="btn sm ${f ? '' : 'primary'}" data-follow="${p.id}">${f ? 'Gefolgt' : 'Folgen'}</button>`}
  </div>`;
}

/* ---------------- Folgen ---------------- */
async function followUser(id, quiet) {
  if (!user) {
    try { localStorage.setItem('pulse.pendingFollow', id); } catch (e) { /* ignore */ }
    return needAccount('Erstelle ein Konto, dann folgst du automatisch');
  }
  if (id === user.id) return;
  const on = !social.following.has(id);
  if (on) social.following.add(id); else social.following.delete(id);
  refreshFollowButtons(id);
  haptic();
  const q = on ? sb.from('follows').insert({ follower: user.id, following: id })
    : sb.from('follows').delete().eq('follower', user.id).eq('following', id);
  const { error } = await q;
  if (error && error.code !== '23505') {
    if (on) social.following.delete(id); else social.following.add(id);
    refreshFollowButtons(id);
    return toast('Das hat nicht geklappt. Bist du online?');
  }
  social.feedLoaded = 0;
  try { await loadProfiles([id]); } catch (e) { /* ignore */ }
  const p = social.profiles[id];
  if (on || !quiet) toast(on ? `Du folgst jetzt ${displayName(p)}` : `Du folgst ${displayName(p)} nicht mehr`);
  if (currentView === 'profile') renderMySocial();
}
function refreshFollowButtons(id) {
  const f = social.following.has(id);
  $$(`[data-follow="${id}"]`).forEach((b) => { b.textContent = f ? 'Gefolgt' : 'Folgen'; b.classList.toggle('primary', !f); });
}

async function showFollowList(kind) {
  if (!user) return;
  const col = kind === 'followers' ? 'follower' : 'following';
  const by = kind === 'followers' ? 'following' : 'follower';
  const { data, error } = await sb.from('follows').select(col).eq(by, user.id).order('created_at', { ascending: false }).limit(200);
  if (error) return toast('Konnte nicht laden');
  const ids = data.map((r) => r[col]);
  await loadProfiles(ids).catch(() => {});
  openModal(`<h3>${kind === 'followers' ? 'Deine Follower' : 'Du folgst'}</h3>
    <div class="people user-list">${ids.length ? ids.map((id) => userRow(social.profiles[id] || { id })).join('')
      : `<p class="muted">${kind === 'followers' ? 'Noch niemand. Teile deinen Profil-Link!' : 'Du folgst noch niemandem.'}</p>`}</div>
    <div class="modal-actions"><button class="btn" data-close>Schließen</button></div>`, 'tall');
}

/* ---------------- Profil einer anderen Person ---------------- */
async function openUsername(name) {
  if (!sb) return;
  const { data } = await sb.from('profiles').select('id, username, display_name').eq('username', name).maybeSingle();
  if (!data) return toast(`@${name} gibt es nicht`);
  social.profiles[data.id] = data;
  showUser(data.id);
}

async function showUser(id) {
  if (!sb) return;
  if (user && id === user.id) { closeModal(); return showView('profile'); }
  const p = social.profiles[id] || { id };
  openModal(`<div class="profile-head">${avatar(p, 'lg')}<div class="pf-body"><h3>${esc(displayName(p))}</h3>
    ${p.username ? `<div class="muted">@${esc(p.username)}</div>` : ''}</div></div><p class="muted">Lade …</p>`, 'tall');
  try {
    const [prof, followers, following, ws, sp] = await Promise.all([
      sb.from('profiles').select('id, username, display_name, visibility').eq('id', id).maybeSingle(),
      sb.from('follows').select('follower', { count: 'exact', head: true }).eq('following', id),
      sb.from('follows').select('following', { count: 'exact', head: true }).eq('follower', id),
      sb.from('workouts').select('user_id, id, date, data, updated_at').eq('user_id', id).order('date', { ascending: false }).limit(60),
      sb.from('splits').select('user_id, ref, data, published_at').eq('user_id', id).eq('is_public', true),
    ]);
    if (prof.error) throw prof.error;
    const pr = prof.data || p;
    social.profiles[id] = { id, username: pr.username, display_name: pr.display_name };
    const list = ws.data || [];
    // Splits in den Entdecken-Speicher, damit „Übernehmen“ funktioniert
    for (const s of sp.data || []) if (!discover.splits.some((x) => x.ref === s.ref)) discover.splits.push(s);
    discover.profiles[id] = displayName(pr);
    const f = social.following.has(id);
    const fourWeeks = ymd(addDays(today(), -28));
    const recent = list.filter((r) => r.date >= fourWeeks).length;
    const prs = list.reduce((n, r) => n + (r.data.prs || 0), 0);
    if (!$('#modal-box .profile-head')) return; // Sheet inzwischen geschlossen
    openModal(`
      <div class="profile-head">${avatar(pr, 'lg')}<div class="pf-body"><h3>${esc(displayName(pr))}</h3>
        ${pr.username ? `<div class="muted">@${esc(pr.username)}</div>` : ''}</div></div>
      <div class="pf-counts other">
        <div><b class="num">${followers.count ?? 0}</b><span>Follower</span></div>
        <div><b class="num">${following.count ?? 0}</b><span>Folgt</span></div>
        <div><b class="num">${recent}</b><span>Trainings · 4 Wo.</span></div>
        <div><b class="num">${prs}</b><span>Rekorde</span></div>
      </div>
      ${user && user.id !== id ? `<button class="btn wide ${f ? '' : 'primary'}" data-follow="${id}">${f ? 'Gefolgt' : 'Folgen'}</button>`
        : !user ? `<button class="btn wide primary" data-follow="${id}">Folgen</button>` : ''}
      ${list.length ? `<h4 class="sd-h">Aktivität</h4>${miniHeat(list.map((r) => r.date))}` : ''}
      ${(sp.data || []).length ? `<h4 class="sd-h">Splits</h4>${sp.data.map((s) => `
        <button class="card split-card mini" data-dc-split="${esc(s.ref)}"><b>${esc(s.data.name)}</b>
          <span class="muted">${esc(splitMeta(s.data))}</span></button>`).join('')}` : ''}
      <h4 class="sd-h">Letzte Trainings</h4>
      ${list.length ? `<div class="feed in-sheet">${list.slice(0, 5).map((r) => feedCard(r, { noWho: true })).join('')}</div>`
        : `<p class="muted">${pr.visibility === 'private' ? 'Dieses Profil ist privat.' : pr.visibility === 'followers' && !f ? 'Folge, um die Trainings zu sehen.' : 'Noch keine Trainings.'}</p>`}
      <div class="modal-actions"><button class="btn" data-close>Schließen</button></div>`, 'tall');
    await loadCounts(list.slice(0, 5));
    paintCounts();
  } catch (e) {
    toast('Profil konnte nicht geladen werden');
  }
}

/** Kleiner Aktivitätskalender: letzte 12 Wochen */
function miniHeat(dates) {
  const set = {};
  for (const d of dates) set[d] = (set[d] || 0) + 1;
  const start = addDays(mondayOf(today()), -11 * 7);
  let cells = '';
  for (let w = 0; w < 12; w++) for (let i = 0; i < 7; i++) {
    const d = addDays(start, w * 7 + i);
    const k = ymd(d);
    const n = set[k] || 0;
    cells += `<i class="cell ${d > today() ? 'future' : n ? (n > 1 ? 'l4' : 'l3') : ''}" style="grid-column:${w + 1};grid-row:${i + 1}" title="${fmtDate(k)}"></i>`;
  }
  return `<div class="mini-heat">${cells}</div>`;
}

/* ---------------- Feed ---------------- */
function renderFeedView() {
  const box = $('#feed-box');
  if (!sb) { box.innerHTML = '<div class="card empty"><p>Die Cloud ist gerade nicht erreichbar.</p></div>'; return; }
  if (!user) {
    box.innerHTML = `<div class="card feed-intro">
      <h2>Trainiere mit Freunden</h2>
      <p class="muted">Folge deinen Freunden und sieh ihre Trainings, Rekorde und Splits. Gib Kudos und kommentiere.</p>
      <div class="form-actions"><button class="btn primary" data-auth="signup">Konto erstellen</button><button class="btn" data-auth="login">Anmelden</button></div>
    </div>`;
    return;
  }
  if (Date.now() - social.feedLoaded > 30000) loadFeed(true);
  else paintFeed();
}

async function loadFeed(reset) {
  if (!user || social.feedLoading) return;
  social.feedLoading = true;
  if (reset && !social.feed.length) $('#feed-box').innerHTML = '<p class="muted">Lade …</p>';
  try {
    const ids = [user.id, ...social.following];
    const from = reset ? 0 : social.feed.length;
    const { data, error } = await sb.from('workouts').select('user_id, id, date, data, updated_at')
      .in('user_id', ids).order('date', { ascending: false }).order('updated_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    social.feed = reset ? data : social.feed.concat(data);
    social.feedMore = data.length === PAGE;
    social.feedLoaded = Date.now();
    await loadProfiles(data.map((r) => r.user_id));
    await loadCounts(data);
  } catch (e) {
    if (!social.feed.length) $('#feed-box').innerHTML = `<div class="card empty"><p>${navigator.onLine ? 'Der Feed konnte nicht geladen werden.' : 'Du bist offline.'}</p></div>`;
    social.feedLoading = false;
    return;
  }
  social.feedLoading = false;
  paintFeed();
}

function paintFeed() {
  const box = $('#feed-box');
  if (!box || currentView !== 'feed') return;
  const nobody = !social.following.size;
  const hint = nobody ? `<div class="card feed-intro">
      <h2>Folge deinen Freunden</h2>
      <p class="muted">Hier erscheinen deine Trainings und die der Leute, denen du folgst.</p>
      <div class="form-actions"><button class="btn primary" data-people>${ic('user-plus')}Leute finden</button>
        <button class="btn" data-share-profile>${ic('qr')}Profil teilen</button></div></div>` : '';
  box.innerHTML = hint + (social.feed.length ? `<div class="feed">${social.feed.map((r) => feedCard(r)).join('')}</div>`
      + (social.feedMore ? '<button class="btn wide" data-feed-more>Mehr laden</button>' : '<p class="muted feed-end">Das war alles.</p>')
    : nobody ? '' : '<div class="card empty"><p>Noch keine Trainings. Leg los!</p></div>');
}

function feedCard(r, o = {}) {
  const key = r.user_id + '|' + r.id;
  const p = social.profiles[r.user_id] || { id: r.user_id };
  const mine = user && r.user_id === user.id;
  return workoutCard(r.data, {
    who: o.noWho ? null : { name: mine ? (state.profile.name || displayName(p)) : displayName(p) },
    attr: `data-fw="${esc(key)}"`,
    footer: socialBar(key),
  });
}
function socialBar(key) {
  const k = social.kudos[key] || { n: 0, mine: false };
  const c = social.comments[key] || 0;
  return `<div class="social-bar" data-sb="${esc(key)}">
    <button class="kudos-btn ${k.mine ? 'on' : ''}" data-kudos="${esc(key)}" aria-pressed="${k.mine}" aria-label="Kudos geben">${ic('flex')}<span class="num">${k.n || ''}</span></button>
    <button class="comment-btn" data-fw="${esc(key)}" data-focus-comment aria-label="Kommentieren">${ic('comment')}<span class="num">${c || ''}</span></button>
  </div>`;
}

/** Kudos und Kommentaranzahl für eine Liste von Trainings laden */
async function loadCounts(rows) {
  if (!rows.length || !sb) return;
  const ids = [...new Set(rows.map((r) => r.id))];
  const [k, c] = await Promise.all([
    sb.from('kudos').select('workout_owner, workout_id, user_id').in('workout_id', ids),
    sb.from('comments').select('workout_owner, workout_id').in('workout_id', ids),
  ]);
  const want = new Set(rows.map((r) => r.user_id + '|' + r.id));
  for (const key of want) { social.kudos[key] = { n: 0, mine: false }; social.comments[key] = 0; }
  for (const x of k.data || []) {
    const key = x.workout_owner + '|' + x.workout_id;
    if (!want.has(key)) continue;
    social.kudos[key].n++;
    if (user && x.user_id === user.id) social.kudos[key].mine = true;
  }
  for (const x of c.data || []) {
    const key = x.workout_owner + '|' + x.workout_id;
    if (want.has(key)) social.comments[key]++;
  }
}
function paintCounts() {
  $$('[data-sb]').forEach((el) => { el.outerHTML = socialBar(el.dataset.sb); });
}

/* ---------------- Kudos ---------------- */
async function toggleKudos(key) {
  if (!user) return needAccount('Für Kudos brauchst du ein Konto');
  const [owner, id] = key.split('|');
  const k = social.kudos[key] = social.kudos[key] || { n: 0, mine: false };
  k.mine = !k.mine; k.n += k.mine ? 1 : -1;
  haptic();
  paintCounts();
  $$(`[data-kudos="${CSS.escape(key)}"]`).forEach((b) => { if (k.mine) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); } });
  const { error } = k.mine
    ? await sb.from('kudos').insert({ workout_owner: owner, workout_id: id, user_id: user.id })
    : await sb.from('kudos').delete().eq('workout_owner', owner).eq('workout_id', id).eq('user_id', user.id);
  if (error && error.code !== '23505') {
    k.mine = !k.mine; k.n += k.mine ? 1 : -1;
    paintCounts();
    toast(/foreign key/i.test(error.message) ? 'Dieses Training ist noch nicht synchronisiert' : 'Das hat nicht geklappt. Bist du online?');
  }
  if ($('.social-box')) fillSocialBoxes();
}

/* ---------------- Training im Feed öffnen (mit Kudos und Kommentaren) ---------------- */
function showFeedWorkout(key, focusComment) {
  const [owner, id] = key.split('|');
  const r = social.feed.find((x) => x.user_id === owner && x.id === id);
  if (!r && user && owner === user.id && state.workouts.some((w) => w.id === id)) {
    showWorkout(id);
    if (focusComment) setTimeout(() => $('#comment-form textarea')?.focus(), 400);
    return;
  }
  if (!r) return fetchAndShow(owner, id, focusComment);
  renderWorkoutSheet(r, focusComment);
}
async function fetchAndShow(owner, id, focusComment) {
  const { data } = await sb.from('workouts').select('user_id, id, date, data, updated_at').eq('user_id', owner).eq('id', id).maybeSingle();
  if (!data) return toast('Dieses Training gibt es nicht mehr');
  await loadProfiles([owner]).catch(() => {});
  renderWorkoutSheet(data, focusComment);
}
function renderWorkoutSheet(r, focusComment) {
  const w = r.data;
  const p = social.profiles[r.user_id] || { id: r.user_id };
  const rows = w.exercises.map((e) => {
    const b = bestOf(e);
    return `<div class="wd-ex">
      <div class="wd-head">${exThumb(e.exId, 'wd-thumb')}<div><b>${esc(e.name)}</b>
        <div class="muted">${GROUPS[exInfo(e.exId, e.name).group]}${b && !b.bw ? ` · 1RM ≈ ${fmtW(Math.round(b.score))} kg` : ''}</div></div></div>
      <ol class="wd-sets">${doneSets(e).map((s) => `<li class="${s.pr ? 'pr' : ''}"><span class="num">${fmtSet(s)}</span>${s.pr ? `<span class="pr-tag">${ic('trophy')}Rekord</span>` : ''}</li>`).join('')}</ol>
    </div>`;
  }).join('');
  openModal(`
    <button class="who-row" data-user="${r.user_id}">${avatar(p)}<span><b>${esc(displayName(p))}</b>
      <small class="muted">${fmtDate(w.date)}${w.splitName ? ' · ' + esc(w.splitName) : ''}</small></span></button>
    <h3>${esc(w.title)}</h3>
    <div class="act-stats">
      <div><div class="label">Dauer</div><div class="value">${fmtDur(w.durationSec)}</div></div>
      <div><div class="label">Volumen</div><div class="value">${fmtKg(workoutVolume(w.exercises))}</div></div>
      <div><div class="label">Sätze</div><div class="value">${workoutSetCount(w.exercises)}</div></div>
      ${w.prs ? `<div><div class="label">Rekorde</div><div class="value pr-val">${ic('trophy')}${w.prs}</div></div>` : ''}
    </div>
    ${muscleBar(w.exercises)}
    ${w.notes ? `<p class="notes">${esc(w.notes)}</p>` : ''}
    <div class="wd-list">${rows}</div>
    <div class="social-box" data-social="${r.user_id}|${r.id}"></div>
    <div class="modal-actions"><button class="btn" data-close>Schließen</button></div>`, 'tall');
  fillSocialBoxes(focusComment);
}

/** Kudos-Leiste und Kommentare in alle offenen .social-box füllen */
async function fillSocialBoxes(focusComment) {
  for (const box of $$('.social-box[data-social]')) {
    const key = box.dataset.social;
    const [owner, id] = key.split('|');
    if (!box.innerHTML) box.innerHTML = '<p class="muted">Lade Kommentare …</p>';
    const [k, c] = await Promise.all([
      sb.from('kudos').select('user_id, created_at').eq('workout_owner', owner).eq('workout_id', id).order('created_at'),
      sb.from('comments').select('id, user_id, body, created_at').eq('workout_owner', owner).eq('workout_id', id).order('created_at'),
    ]);
    if (k.error || c.error) { box.innerHTML = '<p class="muted">Kommentare erscheinen, sobald das Training synchronisiert ist.</p>'; continue; }
    await loadProfiles([...k.data.map((x) => x.user_id), ...c.data.map((x) => x.user_id)]).catch(() => {});
    const mine = !!user && k.data.some((x) => x.user_id === user.id);
    social.kudos[key] = { n: k.data.length, mine };
    social.comments[key] = c.data.length;
    const givers = k.data.map((x) => social.profiles[x.user_id]).filter(Boolean);
    box.innerHTML = `
      <div class="kudos-row">
        <button class="kudos-btn big ${mine ? 'on' : ''}" data-kudos="${esc(key)}" aria-pressed="${mine}">${ic('flex')}<span>${mine ? 'Kudos gegeben' : 'Kudos geben'}</span></button>
        ${givers.length ? `<button class="givers" data-kudos-list="${esc(key)}"><span class="stack">${givers.slice(0, 4).map((g) => avatar(g, 'xs')).join('')}</span>
          <span class="muted">${givers.length === 1 ? esc(displayName(givers[0])) : `${givers.length} Kudos`}</span></button>` : ''}
      </div>
      <h4 class="sd-h">Kommentare${c.data.length ? ` <span class="muted">${c.data.length}</span>` : ''}</h4>
      <div class="comments">${c.data.map((x) => commentRow(x, owner)).join('') || '<p class="muted">Noch keine Kommentare.</p>'}</div>
      ${user ? `<form class="comment-form" id="comment-form" data-key="${esc(key)}">
          <textarea name="body" rows="1" maxlength="500" placeholder="Kommentieren …" required></textarea>
          <button class="icon-btn round" type="submit" aria-label="Senden">${ic('arrow-up')}</button>
        </form>` : `<button class="btn wide" data-auth="signup">Zum Kommentieren anmelden</button>`}`;
    if (focusComment) setTimeout(() => $('#comment-form textarea')?.focus(), 200);
  }
  paintCounts();
}
function commentRow(x, owner) {
  const p = social.profiles[x.user_id] || { id: x.user_id };
  const canDel = user && (x.user_id === user.id || owner === user.id);
  return `<div class="comment">
    <button class="c-av" data-user="${x.user_id}" aria-label="${esc(displayName(p))}">${avatar(p, 'xs')}</button>
    <div class="c-body"><div><b>${esc(displayName(p))}</b> <small class="muted">${timeAgo(x.created_at)}</small></div>
      <p>${esc(x.body)}</p></div>
    ${canDel ? `<button class="icon-btn sm ghost" data-del-comment="${x.id}" aria-label="Kommentar löschen">${ic('trash')}</button>` : ''}
  </div>`;
}
async function postComment(f) {
  const body = f.body.value.trim();
  if (!body) return;
  const [owner, id] = f.dataset.key.split('|');
  const btn = f.querySelector('[type=submit]');
  btn.disabled = true;
  const { error } = await sb.from('comments').insert({ workout_owner: owner, workout_id: id, user_id: user.id, body });
  btn.disabled = false;
  if (error) return toast(/foreign key/i.test(error.message) ? 'Dieses Training ist noch nicht synchronisiert' : 'Senden hat nicht geklappt');
  f.body.value = '';
  await fillSocialBoxes();
}
async function deleteComment(cid) {
  if (!confirm('Kommentar löschen?')) return;
  const { error } = await sb.from('comments').delete().eq('id', cid);
  if (error) return toast('Löschen hat nicht geklappt');
  fillSocialBoxes();
}
async function showKudosList(key) {
  const [owner, id] = key.split('|');
  const { data } = await sb.from('kudos').select('user_id').eq('workout_owner', owner).eq('workout_id', id);
  await loadProfiles((data || []).map((x) => x.user_id)).catch(() => {});
  openModal(`<h3>Kudos ${ic('flex')}</h3><div class="people user-list">${(data || []).map((x) => userRow(social.profiles[x.user_id] || { id: x.user_id })).join('')}</div>
    <div class="modal-actions"><button class="btn" data-fw="${esc(key)}">Zurück zum Training</button></div>`);
}

/* ---------------- Benachrichtigungen ---------------- */
async function loadNotifs() {
  if (!sb || !user) return;
  const { data, error } = await sb.from('notifications').select('id, actor, type, workout_id, created_at, read_at')
    .eq('user_id', user.id).order('created_at', { ascending: false }).limit(50);
  if (error) return;
  social.notifs = data;
  social.unread = data.filter((n) => !n.read_at).length;
  updateBadges();
}
function updateBadges() {
  const n = social.unread;
  const b = $('#bell-n');
  if (b) { b.textContent = n > 9 ? '9+' : n; b.classList.toggle('hidden', !n); }
  $('#tab-dot')?.classList.toggle('hidden', !n);
  const bell = $('[data-notifs]');
  if (bell) bell.setAttribute('aria-label', n ? `Benachrichtigungen, ${n} neu` : 'Benachrichtigungen');
}
async function showNotifs() {
  if (!user) return needAccount();
  await loadNotifs();
  await loadProfiles(social.notifs.map((n) => n.actor)).catch(() => {});
  const text = { follow: 'folgt dir jetzt', kudos: 'hat dir Kudos gegeben', comment: 'hat dein Training kommentiert' };
  openModal(`<h3>Benachrichtigungen</h3>
    <div class="notifs">${social.notifs.length ? social.notifs.map((n) => {
      const p = social.profiles[n.actor] || { id: n.actor };
      const target = n.type === 'follow' ? `data-user="${n.actor}"` : `data-fw="${user.id}|${esc(n.workout_id)}"`;
      return `<button class="notif ${n.read_at ? '' : 'new'}" ${target}>${avatar(p)}
        <span><b>${esc(displayName(p))}</b> ${text[n.type]}<small class="muted">${timeAgo(n.created_at)}</small></span>
        ${n.type === 'follow' && !social.following.has(n.actor) ? `<span class="btn sm primary" data-follow="${n.actor}">Folgen</span>` : ''}
      </button>`;
    }).join('') : '<p class="muted">Noch nichts. Sobald dir jemand folgt, Kudos gibt oder kommentiert, steht es hier.</p>'}</div>
    <div class="modal-actions"><button class="btn" data-close>Schließen</button></div>`, 'tall');
  if (social.unread) {
    await sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', user.id).is('read_at', null);
    social.notifs.forEach((n) => { n.read_at = n.read_at || new Date().toISOString(); });
    social.unread = 0;
    updateBadges();
  }
}

/* ---------------- Events ---------------- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-follow],[data-user],[data-fw],[data-kudos],[data-kudos-list],[data-people],[data-notifs],[data-share-profile],[data-share-code],[data-share-link],[data-copy-link],[data-username],[data-follow-list],[data-feed-more],[data-del-comment]');
  if (!el || !sb) return;
  const ds = el.dataset;
  if (ds.follow) { e.stopPropagation(); followUser(ds.follow); }
  else if (ds.kudos) { e.stopPropagation(); toggleKudos(ds.kudos); }
  else if (ds.user) showUser(ds.user);
  else if (ds.fw) showFeedWorkout(ds.fw, ds.focusComment !== undefined);
  else if (ds.kudosList) showKudosList(ds.kudosList);
  else if (ds.people !== undefined) peopleSearch();
  else if (ds.notifs !== undefined) showNotifs();
  else if (ds.shareProfile !== undefined) shareProfile();
  else if (ds.shareCode !== undefined) shareCode();
  else if (ds.shareLink !== undefined) shareLink();
  else if (ds.copyLink !== undefined) copyLink();
  else if (ds.username !== undefined) usernameForm(!social.me?.username);
  else if (ds.followList) showFollowList(ds.followList);
  else if (ds.feedMore !== undefined) loadFeed(false);
  else if (ds.delComment) deleteComment(ds.delComment);
}, true);
document.addEventListener('submit', (e) => {
  const id = e.target.getAttribute('id');
  if (id === 'username-form') { e.preventDefault(); saveUsername(e.target); }
  if (id === 'comment-form') { e.preventDefault(); postComment(e.target); }
});
document.addEventListener('keydown', (e) => {
  // Enter sendet den Kommentar, Shift+Enter macht eine neue Zeile
  if (e.key === 'Enter' && !e.shiftKey && e.target.matches('#comment-form textarea')) {
    e.preventDefault();
    e.target.form.requestSubmit();
  }
});
