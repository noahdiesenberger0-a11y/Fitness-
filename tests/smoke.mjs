/* ============================================================
 *  Pulse – Rauchtest im echten Browser (Playwright, Chromium)
 *
 *  Startet einen kleinen Webserver für den Projektordner, öffnet die App
 *  in Handy-Größe und prüft die wichtigsten Abläufe:
 *  Einrichtung, Startseite, Habits, Training starten, Fortschritt, Beispieldaten.
 *  Aufruf: npm test   (oder: node tests/smoke.mjs)
 * ============================================================ */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try {
    const file = join(ROOT, path.endsWith('/') ? path + 'index.html' : path);
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const BASE = `http://localhost:${server.address().port}/`;

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) failed++; };

const browser = await chromium.launch();
try {
  const errors = [];
  const newPage = async () => {
    const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
    p.on('pageerror', (e) => errors.push(e.message));
    // Cloud (Supabase) im Test abklemmen: Die App muss ohne Netz laufen
    await p.route(/supabase\.co/, (r) => r.abort());
    await p.goto(BASE);
    return p;
  };

  const page = await newPage();
  check(await page.isVisible('#onboard'), 'Einrichtung erscheint beim ersten Start');

  await page.fill('#ob-name', 'Test Person');
  await page.click('#onboard [data-ob=next]');                 // → Ziel
  await page.click('#onboard [data-goal=strength]');
  await page.click('#onboard [data-ob=next]');                 // → Erfahrung
  await page.click('#onboard [data-ob=next]');                 // → Tage
  await page.click('#onboard [data-wd="1"]');                   // Di dazu → 4 Tage
  check((await page.textContent('#onboard .ob-count')).includes('4×'), 'Trainingstage lassen sich wählen');
  await page.click('#onboard [data-ob=next]');                 // → Plan
  check(await page.isVisible('#onboard [data-tpl=tpl-ul].active'), 'Bei 4 Tagen wird Oberkörper/Unterkörper empfohlen');
  await page.click('#onboard [data-ob=next]');                 // → Habits
  await page.click('#onboard [data-obh=protein]');
  await page.click('#onboard [data-ob=next]');                 // → Sichtbarkeit
  await page.click('#onboard [data-vis=followers]');
  await page.click('#onboard [data-ob=next]');                 // → Fertig
  await page.click('#onboard [data-ob=finish]');

  const st = await page.evaluate(() => ({ ...state.profile, split: state.splits[0]?.name, sched: state.schedule, habits: state.habits.map((h) => h.key) }));
  check(!(await page.isVisible('#onboard')), 'Einrichtung schließt sich');
  check(st.onboarded && st.name === 'Test Person' && st.visibility === 'followers', 'Profil wird übernommen');
  check(st.split === 'Oberkörper / Unterkörper' && st.sched.length === 4, 'Split und Trainingstage werden angelegt');
  check(['gym', 'water', 'sleep', 'protein'].every((k) => st.habits.includes(k)), 'Gewählte Habits werden angelegt');

  check((await page.textContent('#tr-greet')).includes('Test'), 'Startseite begrüßt mit Namen');
  check(await page.isVisible('#tr-next [data-start-day]'), 'Startseite zeigt das nächste Training');
  check(await page.isVisible('#tr-start .start-card'), 'Startseite zeigt „Erste Schritte“');

  await page.click('#tr-habits [data-habit]');
  check(await page.evaluate(() => Object.keys(state.habitLog).length === 1), 'Habit lässt sich auf der Startseite abhaken');

  await page.click('#tabs [data-view=habits]');
  check(await page.isVisible('#view-habits .today-card'), 'Habits-Tab zeigt die Heute-Liste');
  check((await page.$$('#badges .bdg')).length === 16, 'Habits-Tab zeigt 16 Erfolge');

  await page.click('#tabs [data-view=profile]');
  await page.click('#view-profile [data-view=progress]');
  check(await page.evaluate(() => currentView) === 'progress', 'Fortschritt ist über das Profil erreichbar');
  await page.click('#nav-back');
  check(await page.evaluate(() => currentView) === 'profile', 'Zurück führt ins Profil');

  await page.click('#tabs [data-view=train]');
  await page.click('#tr-next [data-start-day]');
  check(await page.isVisible('#tr-live'), 'Training startet');
  await page.click('[data-coach]');
  check(await page.isVisible('.tempo-orb'), 'Tempo-Coach öffnet sich mit Tempo-Kreis');

  // Neuer Nutzer, der erst mal Beispieldaten ansehen will
  const p2 = await newPage();
  await p2.click('#onboard [data-ob=demo]');
  check(await p2.evaluate(() => state.workouts.length > 20 && state.profile.onboarded), 'Beispieldaten lassen sich direkt aus der Einrichtung laden');

  check(errors.length === 0, `Keine JavaScript-Fehler${errors.length ? ': ' + errors.join(' | ') : ''}`);
} finally {
  await browser.close();
  server.close();
}
console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : '\nAlle Prüfungen bestanden');
process.exit(failed ? 1 : 0);
