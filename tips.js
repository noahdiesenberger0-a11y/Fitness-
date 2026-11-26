/* ============================================================
 *  Übungs-Tipps: So geht's (3 Punkte) und typische Fehler (2 Punkte).
 *  Allgemeine Technik-Hinweise, kein Ersatz für einen Trainer.
 * ============================================================ */
'use strict';

const TIPS = {
  bench: {
    how: ['Schulterblätter zusammen und nach unten ziehen, Füße fest am Boden.', 'Stange kontrolliert zur unteren Brust senken, Unterarme senkrecht.', 'Kurz berühren, dann kraftvoll nach oben und leicht Richtung Gesicht drücken.'],
    avoid: ['Stange auf der Brust abfedern lassen.', 'Ellbogen ganz seitlich (90°) abspreizen – belastet die Schultern.'],
  },
  incline: {
    how: ['Bank auf etwa 30° stellen, nicht steiler.', 'Stange zur oberen Brust unter dem Schlüsselbein senken.', 'Schulterblätter bleiben während des ganzen Satzes zusammen.'],
    avoid: ['Gesäß von der Bank heben, um mehr Gewicht zu schaffen.', 'Zu steile Bank – dann wird es Schulterdrücken.'],
  },
  'db-bench': {
    how: ['Hanteln auf den Oberschenkeln mit nach hinten kippen in Position bringen.', 'Tief absenken, bis du eine Dehnung in der Brust spürst.', 'Oben die Hanteln leicht zueinander führen, ohne sie aneinanderzuschlagen.'],
    avoid: ['Hanteln unkontrolliert fallen lassen.', 'Handgelenke nach hinten abknicken.'],
  },
  pushup: {
    how: ['Hände etwas weiter als schulterbreit, Körper bildet eine Linie.', 'Bauch und Gesäß anspannen, Brust bis knapp über den Boden.', 'Ellbogen etwa 45° vom Körper weg.'],
    avoid: ['Hüfte durchhängen lassen.', 'Nur halbe Wiederholungen.'],
  },
  dips: {
    how: ['Schultern nach unten weg von den Ohren, Brust raus.', 'Senken, bis die Oberarme etwa parallel zum Boden sind.', 'Leicht nach vorn lehnen für mehr Brust, aufrecht für mehr Trizeps.'],
    avoid: ['Zu tief gehen, wenn die Schultern zwicken.', 'Schwung aus den Beinen holen.'],
  },
  flys: {
    how: ['Arme leicht gebeugt lassen, der Winkel bleibt gleich.', 'In einem Bogen öffnen, bis du die Dehnung in der Brust spürst.', 'Mit der Brust zusammenführen, nicht mit den Armen drücken.'],
    avoid: ['Arme beim Zurückführen strecken und beugen (wird zum Drücken).', 'Zu weit nach hinten öffnen.'],
  },
  deadlift: {
    how: ['Stange über der Fußmitte, schienbeinnah greifen.', 'Rücken gerade, Spannung aufbauen, dann mit den Beinen vom Boden drücken.', 'Stange am Körper entlang führen, oben Hüfte ganz strecken.'],
    avoid: ['Runder Rücken beim Hochziehen.', 'Oben nach hinten überstrecken.'],
  },
  row: {
    how: ['Oberkörper etwa 45° nach vorn, Rücken gerade, Knie leicht gebeugt.', 'Stange zum Bauchnabel ziehen, Ellbogen nah am Körper.', 'Oben kurz die Schulterblätter zusammendrücken.'],
    avoid: ['Mit Schwung aus dem Oberkörper reißen.', 'Runder Rücken.'],
  },
  'db-row': {
    how: ['Eine Hand und ein Knie auf der Bank, Rücken flach.', 'Hantel Richtung Hüfte ziehen, nicht zur Brust.', 'Unten ganz strecken, damit der Rücken gedehnt wird.'],
    avoid: ['Oberkörper beim Ziehen aufdrehen.', 'Nur mit dem Bizeps ziehen.'],
  },
  pullup: {
    how: ['Etwas weiter als schulterbreit greifen, ganz aushängen.', 'Schulterblätter zuerst nach unten ziehen, dann Brust zur Stange.', 'Kontrolliert ablassen bis die Arme gestreckt sind.'],
    avoid: ['Mit den Beinen schwingen (Kipping).', 'Nur halbe Wiederholungen oben.'],
  },
  latpull: {
    how: ['Oberschenkel fest unter dem Polster, Brust raus.', 'Stange zur oberen Brust ziehen, Ellbogen nach unten.', 'Langsam zurückführen, Arme oben fast strecken.'],
    avoid: ['Weit nach hinten lehnen.', 'Stange hinter den Nacken ziehen.'],
  },
  'cable-row': {
    how: ['Aufrecht sitzen, Knie leicht gebeugt.', 'Griff zum Bauch ziehen, Schulterblätter zusammen.', 'Beim Zurückführen Schultern nach vorn dehnen lassen, Rücken bleibt gerade.'],
    avoid: ['Mit dem ganzen Oberkörper vor und zurück schaukeln.', 'Schultern zu den Ohren hochziehen.'],
  },
  facepull: {
    how: ['Seil auf Augenhöhe, mit Daumen nach hinten greifen.', 'Zum Gesicht ziehen und die Hände nach außen auseinanderziehen.', 'Ellbogen bleiben hoch, auf Schulterhöhe.'],
    avoid: ['Zu viel Gewicht und mit Schwung ziehen.', 'Ellbogen absinken lassen.'],
  },
  ohp: {
    how: ['Stange auf den vorderen Schultern, Griff knapp schulterbreit.', 'Gesäß und Bauch anspannen, Stange gerade nach oben drücken.', 'Kopf kurz nach hinten, oben unter die Stange schieben.'],
    avoid: ['Ins Hohlkreuz fallen.', 'Stange vor dem Körper nach vorn drücken.'],
  },
  'db-ohp': {
    how: ['Hanteln auf Schulterhöhe, Handflächen nach vorn oder leicht zueinander.', 'Senkrecht nach oben drücken, oben nicht ganz zusammenschlagen.', 'Rücken an der Lehne, Bauch fest.'],
    avoid: ['Hohlkreuz.', 'Zu tief absenken, wenn die Schulter schmerzt.'],
  },
  lateral: {
    how: ['Leicht nach vorn lehnen, Arme minimal gebeugt.', 'Seitlich bis auf Schulterhöhe heben, Ellbogen führen.', 'Langsam absenken, nicht fallen lassen.'],
    avoid: ['Mit Schwung aus der Hüfte heben.', 'Schultern zu den Ohren hochziehen.'],
  },
  curl: {
    how: ['Oberarme bleiben fest am Körper.', 'Gewicht ohne Schwung bis zur Schulter beugen.', 'Langsam ganz ablassen, bis der Arm gestreckt ist.'],
    avoid: ['Mit dem Oberkörper Schwung holen.', 'Ellbogen nach vorn wandern lassen.'],
  },
  hammer: {
    how: ['Hanteln mit Daumen nach oben halten (neutraler Griff).', 'Ellbogen am Körper, nur der Unterarm bewegt sich.', 'Abwechselnd oder gleichzeitig, beides ist gut.'],
    avoid: ['Handgelenke eindrehen.', 'Schwung aus den Schultern.'],
  },
  triceps: {
    how: ['Oberarme fest an den Seiten, leicht nach vorn gelehnt.', 'Nach unten drücken, bis die Arme ganz gestreckt sind.', 'Langsam zurück bis etwa 90° im Ellbogen.'],
    avoid: ['Ellbogen nach vorn und oben wandern lassen.', 'Mit dem Oberkörper nachdrücken.'],
  },
  skull: {
    how: ['Oberarme zeigen schräg nach oben und bleiben ruhig.', 'Gewicht langsam hinter die Stirn absenken.', 'Nur aus dem Ellbogen strecken.'],
    avoid: ['Ellbogen weit nach außen öffnen.', 'Zu schweres Gewicht – Ellbogen werden stark belastet.'],
  },
  squat: {
    how: ['Füße schulterbreit, Zehen leicht nach außen.', 'Hüfte nach hinten und unten, Knie folgen den Zehen.', 'So tief, wie der Rücken gerade bleibt, dann aus den Fersen hochdrücken.'],
    avoid: ['Knie nach innen fallen lassen.', 'Fersen vom Boden heben.'],
  },
  legpress: {
    how: ['Füße schulterbreit mittig auf der Platte.', 'Senken, bis die Knie etwa 90° gebeugt sind, Gesäß bleibt auf dem Polster.', 'Kontrolliert wegdrücken, oben nicht ganz durchstrecken.'],
    avoid: ['Knie oben komplett durchdrücken.', 'Gesäß unten vom Sitz abheben.'],
  },
  lunge: {
    how: ['Großer Schritt, Oberkörper aufrecht.', 'Hinteres Knie bis knapp über den Boden senken.', 'Über die vordere Ferse zurückdrücken.'],
    avoid: ['Vorderes Knie nach innen kippen.', 'Zu kurzer Schritt – das Knie schiebt weit über die Zehen.'],
  },
  rdl: {
    how: ['Knie leicht gebeugt und fest, Hüfte nach hinten schieben.', 'Stange an den Beinen entlang bis etwa Mitte Schienbein senken.', 'Mit dem Gesäß nach vorn kommen, Rücken bleibt gerade.'],
    avoid: ['Runder Rücken.', 'Knie zu stark beugen – dann wird es Kreuzheben.'],
  },
  legcurl: {
    how: ['Polster knapp über den Fersen, Knie auf Höhe des Drehpunkts.', 'Beine ganz beugen, oben kurz halten.', 'Langsam zurück, nicht abprallen lassen.'],
    avoid: ['Hüfte beim Beugen vom Polster heben.', 'Mit Schwung arbeiten.'],
  },
  legext: {
    how: ['Rücken an der Lehne, Knie auf Höhe des Drehpunkts.', 'Beine ganz strecken, oben kurz anspannen.', 'Kontrolliert absenken.'],
    avoid: ['Gewicht unten fallen lassen.', 'Gesäß vom Sitz heben.'],
  },
  hipthrust: {
    how: ['Oberer Rücken auf der Bank, Stange über der Hüfte (mit Polster).', 'Füße so, dass die Schienbeine oben senkrecht stehen.', 'Hüfte hochdrücken bis Oberkörper und Oberschenkel eine Linie bilden, Gesäß anspannen.'],
    avoid: ['Oben ins Hohlkreuz gehen.', 'Mit den Füßen zu weit vorn – dann arbeiten die Beinbeuger.'],
  },
  calf: {
    how: ['Fußballen auf der Kante, Ferse frei.', 'Ganz nach oben drücken und kurz halten.', 'Unten die Ferse tief absenken für die Dehnung.'],
    avoid: ['Wippen statt kontrollieren.', 'Nur kleine Bewegungen.'],
  },
  plank: {
    how: ['Ellbogen unter den Schultern, Körper bildet eine Linie.', 'Bauch und Gesäß fest anspannen.', 'Ruhig weiteratmen.'],
    avoid: ['Hüfte durchhängen oder zu hoch.', 'Luft anhalten.'],
  },
  crunch: {
    how: ['Füße am Boden, Hände leicht am Kopf.', 'Oberkörper einrollen, Rippen Richtung Becken.', 'Langsam zurück, Kopf nicht ablegen.'],
    avoid: ['Am Kopf ziehen.', 'Mit Schwung hochreißen.'],
  },
  legraise: {
    how: ['Ruhig hängen, Schultern aktiv.', 'Beine heben und das Becken nach oben einrollen.', 'Langsam absenken, ohne zu schwingen.'],
    avoid: ['Schwung aus dem Körper.', 'Nur die Beine heben, ohne das Becken zu rollen.'],
  },
};

/** Tipps-Sheet für eine Übung */
function showTips(exId) {
  const e = exInfo(exId);
  const t = TIPS[exId];
  openModal(`
    <div class="tips-head">${exThumb(exId, 'tips-thumb')}<div><h3>${esc(e.name)}</h3><div class="muted">${GROUPS[e.group] || ''}</div></div></div>
    ${t ? `<h4 class="sd-h">So geht's</h4><ol class="tips-list">${t.how.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
      <h4 class="sd-h">Typische Fehler</h4><ul class="tips-list avoid">${t.avoid.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`
      : '<p class="muted">Für diese Übung gibt es noch keine Tipps.</p>'}
    <div class="modal-actions">
      <button class="btn" data-close>Schließen</button>
    </div>`, 'tall');
}

/** In der Übungsauswahl: Tipps direkt unter der Zeile auf- und zuklappen */
function toggleInlineTips(row, exId, btn) {
  const open = row.nextElementSibling?.classList.contains('pk-tips');
  if (open) { row.nextElementSibling.remove(); btn.setAttribute('aria-expanded', 'false'); return; }
  const t = TIPS[exId];
  row.insertAdjacentHTML('afterend', `<div class="pk-tips"><ol class="tips-list">${t.how.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
    <ul class="tips-list avoid">${t.avoid.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`);
  btn.setAttribute('aria-expanded', 'true');
}

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-tips],[data-tips-demo]');
  if (!el) return;
  ev.preventDefault();
  ev.stopPropagation();
  const row = el.closest('.pk-row');
  if (row && el.dataset.tips) return toggleInlineTips(row, el.dataset.tips, el);
  if (el.dataset.tips) showTips(el.dataset.tips);
  else openDemo(el.dataset.tipsDemo, '2-0-1-0');
}, true);
