'use strict';

/* ============================================================
 *  Übungs-Modelle: animierte Figuren in Seitenansicht
 *
 *  Jede Figur ist ein einfaches Skelett (Rumpf, Kopf, Arme, Beine).
 *  Pro Übung gibt es zwei Posen aus Gelenkwinkeln:
 *    p0 = Startposition der Bewegung (z.B. Hantel auf der Brust)
 *    p1 = Endposition der Bewegung (z.B. Arme gestreckt)
 *  Dazwischen wird weich interpoliert – gesteuert vom Trainingstempo.
 *
 *  Winkel in Grad, SVG-Koordinaten: 0 = rechts, 90 = unten, -90 = oben.
 *  Ein "Anker" (Fuß, Hand oder Hüfte) bleibt fest stehen, z.B. die Hand an der Stange.
 * ============================================================ */

const BONES = { torso: 60, head: 19, ua: 34, fa: 30, th: 44, sh: 42, ft: 15 };
const WIDTH = { torso: 25, ua: 12, fa: 10, th: 17, sh: 12, ft: 7, neck: 9 };
const GROUND = 220;

const MUSCLES = {
  chest:      { name: 'Brust',             seg: 'torso', a: 0.6,  b: 0.9,  side: 1,  w: 12 },
  abs:        { name: 'Bauch',             seg: 'torso', a: 0.18, b: 0.55, side: 1,  w: 10 },
  lats:       { name: 'Rücken (Latissimus)', seg: 'torso', a: 0.42, b: 0.85, side: -1, w: 12 },
  lowerBack:  { name: 'Unterer Rücken',    seg: 'torso', a: 0.1,  b: 0.42, side: -1, w: 10 },
  glutes:     { name: 'Gesäß',             seg: 'torso', a: -0.04, b: 0.14, side: -1, w: 16 },
  delts:      { name: 'Schultern',         seg: 'ua',    a: 0,    b: 0.32, side: 0,  w: 15 },
  biceps:     { name: 'Bizeps',            seg: 'ua',    a: 0.28, b: 0.85, side: -1, w: 8 },
  triceps:    { name: 'Trizeps',           seg: 'ua',    a: 0.22, b: 0.85, side: 1,  w: 8 },
  quads:      { name: 'Oberschenkel vorne', seg: 'th',   a: 0.12, b: 0.85, side: -1, w: 11 },
  hamstrings: { name: 'Beinbeuger',        seg: 'th',    a: 0.15, b: 0.85, side: 1,  w: 10 },
  calves:     { name: 'Waden',             seg: 'sh',    a: 0.1,  b: 0.5,  side: 1,  w: 9 },
};

// Gemeinsame Bein-/Rumpfhaltung für stehende Übungen
const STAND = { torso: -90, head: -90, th: 90, sh: 90, ft: 0 };

const MODELS = {
  bench: {
    anchor: 'hip', at: [175, 150], muscles: ['chest', 'triceps', 'delts'],
    hold: 'barbell', equip: ['bench'],
    p0: { torso: 180, head: 182, ua: 45, fa: -112, th: 35, sh: 95, ft: 0, fth: 30, fsh: 98 },
    p1: { torso: 180, head: 182, ua: -80, fa: -88, th: 35, sh: 95, ft: 0, fth: 30, fsh: 98 },
  },
  incline: {
    anchor: 'hip', at: [165, 160], muscles: ['chest', 'delts', 'triceps'],
    hold: 'barbell', equip: ['incline'],
    p0: { torso: -150, head: -148, ua: 45, fa: -112, th: 20, sh: 95, ft: 0, fth: 15, fsh: 98 },
    p1: { torso: -150, head: -148, ua: -95, fa: -92, th: 20, sh: 95, ft: 0, fth: 15, fsh: 98 },
  },
  squat: {
    anchor: 'ankle', at: [150, 212], muscles: ['quads', 'glutes'],
    hold: 'barbell',
    p0: { torso: -45, head: -40, th: 8, sh: 115, ft: 0, ua: 193, fa: -7 },
    p1: { torso: -88, head: -86, th: 92, sh: 88, ft: 0, ua: 150, fa: -50 },
  },
  deadlift: {
    anchor: 'ankle', at: [150, 212], muscles: ['hamstrings', 'glutes', 'lowerBack'],
    hold: 'barbell',
    p0: { torso: -32, head: -15, th: 15, sh: 108, ft: 0, ua: 89, fa: 90 },
    p1: { torso: -91, head: -88, th: 90, sh: 90, ft: 0, ua: 92, fa: 90 },
  },
  ohp: {
    anchor: 'ankle', at: [150, 212], muscles: ['delts', 'triceps'],
    hold: 'barbell',
    p0: { ...STAND, ua: 70, fa: -100 },
    p1: { ...STAND, ua: -88, fa: -90 },
  },
  row: {
    anchor: 'ankle', at: [150, 212], muscles: ['lats', 'biceps'],
    hold: 'barbell',
    p0: { torso: -30, head: -15, th: 60, sh: 100, ft: 0, ua: 90, fa: 90 },
    p1: { torso: -30, head: -15, th: 60, sh: 100, ft: 0, ua: 145, fa: 100 },
  },
  pullup: {
    anchor: 'hand', at: [150, 8], muscles: ['lats', 'biceps'],
    equip: ['pullbar'],
    p0: { torso: -90, head: -90, ua: -90, fa: -90, th: 98, sh: 132, ft: 75, fth: 94, fsh: 138 },
    p1: { torso: -88, head: -84, ua: 70, fa: -110, th: 95, sh: 135, ft: 75, fth: 90, fsh: 140 },
  },
  pushup: {
    anchor: 'hand', at: [190, 214], muscles: ['chest', 'triceps'],
    p0: { torso: -6, head: -3, ua: 138, fa: -11, th: 174, sh: 174, ft: 165 },
    p1: { torso: -27, head: -22, ua: 90, fa: 90, th: 155, sh: 155, ft: 165 },
  },
  dips: {
    anchor: 'hand', at: [170, 96], muscles: ['chest', 'triceps'],
    equip: ['dipbar'],
    p0: { torso: -70, head: -64, ua: 135, fa: 18, th: 95, sh: 170, ft: 150 },
    p1: { torso: -85, head: -84, ua: 90, fa: 90, th: 100, sh: 165, ft: 150 },
  },
  curl: {
    anchor: 'ankle', at: [150, 212], muscles: ['biceps'],
    hold: 'dumbbell',
    p0: { ...STAND, ua: 92, fa: 88 },
    p1: { ...STAND, ua: 88, fa: -62 },
  },
  lunge: {
    anchor: 'ankle', at: [190, 212], muscles: ['quads', 'glutes'],
    hold: 'dumbbell',
    p0: { torso: -86, head: -86, th: 2, sh: 92, ft: 0, fth: 92, fsh: 178, fft: 20, ua: 90, fa: 90 },
    p1: { torso: -90, head: -90, th: 55, sh: 70, ft: 0, fth: 118, fsh: 125, fft: 20, ua: 90, fa: 90 },
  },
  legpress: {
    anchor: 'hip', at: [125, 155], muscles: ['quads', 'glutes'],
    equip: ['legpress'], hold: 'legplatform',
    p0: { torso: -135, head: -128, th: -80, sh: 10, ft: -125, ua: 100, fa: 40 },
    p1: { torso: -135, head: -128, th: -33, sh: -37, ft: -125, ua: 100, fa: 40 },
  },
  latpull: {
    anchor: 'hip', at: [140, 160], muscles: ['lats', 'biceps'],
    equip: ['latseat'], hold: 'latbar',
    p0: { torso: -100, head: -96, th: 0, sh: 90, ft: 0, ua: -80, fa: -82 },
    p1: { torso: -102, head: -95, th: 0, sh: 90, ft: 0, ua: 110, fa: -70 },
  },
  triceps: {
    anchor: 'ankle', at: [140, 212], muscles: ['triceps'],
    hold: 'cable',
    p0: { ...STAND, torso: -84, head: -82, ua: 96, fa: -48 },
    p1: { ...STAND, torso: -84, head: -82, ua: 92, fa: 86 },
  },
  calf: {
    anchor: 'toe', at: [168, 214], muscles: ['calves'],
    hold: 'dumbbell',
    p0: { ...STAND, ft: 0, ua: 90, fa: 90 },
    p1: { ...STAND, ft: 38, ua: 90, fa: 90 },
  },
};
MODELS.custom = { ...MODELS.ohp, hold: 'dumbbell' };

/* ---------------- Mathe ---------------- */
const rad = (d) => (d * Math.PI) / 180;
const add = (p, ang, len) => [p[0] + Math.cos(rad(ang)) * len, p[1] + Math.sin(rad(ang)) * len];
const lerp = (a, b, t) => a + (b - a) * t;

function interpPose(p0, p1, t) {
  const out = {};
  for (const k of Object.keys(p0)) out[k] = lerp(p0[k], p1[k] ?? p0[k], t);
  return out;
}

/** Vorwärts-Kinematik: aus Winkeln die Gelenkpositionen berechnen. */
function solve(model, pose) {
  const P = pose;
  const limb = (pre) => {
    const g = (k) => P[pre + k] ?? P[k];
    return g;
  };
  const build = (hip, g) => {
    const shoulder = add(hip, P.torso, BONES.torso);
    const elbow = add(shoulder, g('ua'), BONES.ua);
    const hand = add(elbow, g('fa'), BONES.fa);
    const knee = add(hip, g('th'), BONES.th);
    const ankle = add(knee, g('sh'), BONES.sh);
    const toe = add(ankle, g('ft'), BONES.ft);
    return { hip, shoulder, elbow, hand, knee, ankle, toe };
  };
  const near0 = build([0, 0], limb(''));
  const anchorPt = near0[model.anchor];
  const off = [model.at[0] - anchorPt[0], model.at[1] - anchorPt[1]];
  const move = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, [v[0] + off[0], v[1] + off[1]]]));
  const near = move(near0);
  const far = move(build([0, 0], limb('f')));
  const head = add(near.shoulder, P.head ?? P.torso, BONES.head);
  return { near, far, head, pose: P };
}

/* ---------------- Zeichnen ---------------- */
const f1 = (n) => n.toFixed(1);
function capsule(a, b, w, cls) {
  return `<line class="${cls}" x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke-width="${w}"/>`;
}
/** Körperteil mit leichtem 3D-Glanz (Lichtkante oben links) */
function limbShape(a, b, w, far) {
  const base = capsule(a, b, w, far ? 'm-far' : 'm-body');
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
  let nx = -dy / L, ny = dx / L;
  if (nx + ny > 0) { nx = -nx; ny = -ny; } // Licht von oben links
  const o = w * 0.22;
  const hl = capsule([a[0] + nx * o, a[1] + ny * o], [b[0] + nx * o, b[1] + ny * o], w * 0.32, 'm-shine');
  return base + (far ? '' : hl);
}

function muscleShape(J, key, far) {
  const m = MUSCLES[key];
  const segs = { torso: ['hip', 'shoulder'], ua: ['shoulder', 'elbow'], th: ['hip', 'knee'], sh: ['knee', 'ankle'] };
  const [s, e] = segs[m.seg];
  const a = J[s], b = J[e];
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L;
  const baseW = WIDTH[m.seg];
  const o = m.side * (baseW / 2 - m.w / 2.6);
  const p = (t) => [a[0] + dx * t + nx * o, a[1] + dy * t + ny * o];
  return capsule(p(m.a), p(m.b), m.w, far ? 'm-muscle far' : 'm-muscle');
}

function plate(c, r, far) {
  return `<circle class="m-plate${far ? ' far' : ''}" cx="${f1(c[0])}" cy="${f1(c[1])}" r="${r}"/>` +
    `<circle class="m-plate-in" cx="${f1(c[0])}" cy="${f1(c[1])}" r="${r * 0.32}"/>`;
}

function equipBack(model, S) {
  const out = [];
  const { near } = S;
  for (const e of model.equip || []) {
    if (e === 'bench') {
      out.push(`<rect class="m-equip" x="70" y="${near.hip[1] + 10}" width="150" height="9" rx="4"/>`,
        `<rect class="m-equip2" x="88" y="${near.hip[1] + 19}" width="7" height="${GROUND - near.hip[1] - 19}"/>`,
        `<rect class="m-equip2" x="196" y="${near.hip[1] + 19}" width="7" height="${GROUND - near.hip[1] - 19}"/>`);
    }
    if (e === 'incline') {
      const back0 = add(near.hip, -150, -6), back1 = add(near.hip, -150, 78);
      const n = add([0, 0], -60, -16);
      out.push(capsule([back0[0] + n[0], back0[1] + n[1]], [back1[0] + n[0], back1[1] + n[1]], 10, 'm-equip-line'),
        `<rect class="m-equip" x="${near.hip[0] - 30}" y="${near.hip[1] + 10}" width="60" height="9" rx="4"/>`,
        `<rect class="m-equip2" x="${near.hip[0] - 4}" y="${near.hip[1] + 19}" width="8" height="${GROUND - near.hip[1] - 19}"/>`);
    }
    if (e === 'pullbar') {
      out.push(`<rect class="m-equip2" x="56" y="${model.at[1] - 3}" width="8" height="${GROUND - model.at[1] + 3}"/>`,
        capsule([60, model.at[1]], [236, model.at[1]], 7, 'm-equip-line'));
    }
    if (e === 'dipbar') {
      const [hx, hy] = model.at;
      out.push(capsule([hx - 30, hy + 4], [hx + 32, hy + 4], 7, 'm-equip-line'),
        `<rect class="m-equip2" x="${hx + 22}" y="${hy + 4}" width="7" height="${GROUND - hy - 4}"/>`);
    }
    if (e === 'legpress') {
      const [hx, hy] = model.at;
      const o = add([0, 0], 55, 26); // Schiene unterhalb der Fußbahn
      const r0 = add([hx, hy], -35, 40), r1 = add([hx, hy], -35, 175);
      out.push(capsule([r0[0] + o[0], r0[1] + o[1]], [r1[0] + o[0], r1[1] + o[1]], 6, 'm-equip-line'),
        capsule(add([hx, hy], 45, 14), add(add([hx, hy], 45, 14), -135, 70), 12, 'm-equip-line'),
        capsule([hx - 18, hy + 12], [hx + 26, hy + 12], 10, 'm-equip-line'),
        `<rect class="m-equip2" x="${hx - 6}" y="${hy + 16}" width="10" height="${GROUND - hy - 16}"/>`,
        `<rect class="m-equip2" x="${f1(r1[0] + o[0] - 4)}" y="${f1(r1[1] + o[1])}" width="8" height="${f1(GROUND - r1[1] - o[1])}"/>`);
    }
    if (e === 'latseat') {
      const [hx, hy] = model.at;
      out.push(`<rect class="m-equip" x="${hx - 22}" y="${hy + 9}" width="56" height="9" rx="4"/>`,
        `<rect class="m-equip2" x="${hx}" y="${hy + 18}" width="8" height="${GROUND - hy - 18}"/>`,
        capsule([hx + 30, hy - 14], [hx + 52, hy - 14], 9, 'm-equip-line'),
        `<rect class="m-equip2" x="${hx + 92}" y="16" width="8" height="${GROUND - 16}"/>`,
        capsule([hx - 5, 16], [hx + 96, 16], 6, 'm-equip-line'));
    }
  }
  return out.join('');
}

function equipFront(model, S) {
  const { near, far } = S;
  const h = near.hand;
  switch (model.hold) {
    case 'barbell': return `<circle class="m-bar" cx="${f1(h[0])}" cy="${f1(h[1])}" r="3.5"/>` + plate(h, 19);
    case 'dumbbell': return plate(h, 8.5);
    case 'legplatform': {
      // Fußplatte des Schlittens, senkrecht zur Schiene
      const c = add(near.ankle, -35, 4);
      return capsule(add(c, -125, 24), add(c, 55, 20), 8, 'm-equip-line');
    }
    case 'latbar': {
      const top = [MODELS.latpull.at[0] + 4, 16];
      return capsule(top, h, 1.6, 'm-cable') + capsule([h[0] - 16, h[1] - 2], [h[0] + 16, h[1] - 2], 5, 'm-equip-line');
    }
    case 'cable': {
      const top = [model.at[0] + 46, 20];
      return `<rect class="m-equip2" x="${top[0] - 3}" y="16" width="8" height="${GROUND - 16}"/>` +
        capsule(top, h, 1.6, 'm-cable') + capsule([h[0] - 6, h[1]], [h[0] + 6, h[1]], 5, 'm-equip-line');
    }
    default: return '';
  }
}
function equipFarHand(model, S) {
  if (model.hold === 'dumbbell') return plate(S.far.hand, 8.5, true);
  return '';
}

/** Figur als SVG-Inhalt; pos: 0 = Startposition (p0), 1 = Endposition (p1) */
function modelSvg(exId, pos) {
  const model = MODELS[exId] || MODELS.custom;
  const pose = interpPose(model.p0, model.p1, Math.max(0, Math.min(1, pos)));
  const S = solve(model, pose);
  const { near: N, far: F } = S;
  const parts = [];
  parts.push(`<line class="m-floor" x1="10" y1="${GROUND}" x2="290" y2="${GROUND}"/>`);
  parts.push(`<ellipse class="m-shadow" cx="${f1((N.ankle[0] + F.ankle[0] + N.hip[0]) / 3)}" cy="${GROUND + 2}" rx="58" ry="5"/>`);
  parts.push(equipBack(model, S));
  // hinteres Bein & Arm (dunkler)
  parts.push(limbShape(F.hip, F.knee, WIDTH.th, true), limbShape(F.knee, F.ankle, WIDTH.sh, true), limbShape(F.ankle, F.toe, WIDTH.ft, true));
  for (const k of model.muscles) if (['th', 'sh'].includes(MUSCLES[k].seg)) parts.push(muscleShape(F, k, true));
  parts.push(equipFarHand(model, S));
  parts.push(limbShape(F.shoulder, F.elbow, WIDTH.ua, true), limbShape(F.elbow, F.hand, WIDTH.fa, true));
  for (const k of model.muscles) if (MUSCLES[k].seg === 'ua') parts.push(muscleShape(F, k, true));
  // Rumpf, Hals, Kopf
  parts.push(limbShape(N.hip, N.shoulder, WIDTH.torso));
  parts.push(capsule(N.shoulder, add(N.shoulder, pose.head ?? pose.torso, BONES.head * 0.55), WIDTH.neck, 'm-body'));
  parts.push(`<circle class="m-head" cx="${f1(S.head[0])}" cy="${f1(S.head[1])}" r="11.5"/>`);
  // vorderes Bein
  parts.push(limbShape(N.hip, N.knee, WIDTH.th), limbShape(N.knee, N.ankle, WIDTH.sh), limbShape(N.ankle, N.toe, WIDTH.ft));
  // Muskeln an Rumpf und vorderem Bein
  for (const k of model.muscles) if (MUSCLES[k].seg !== 'ua') parts.push(muscleShape(N, k));
  // vorderer Arm + Muskeln + Gerät in der Hand
  parts.push(limbShape(N.shoulder, N.elbow, WIDTH.ua), limbShape(N.elbow, N.hand, WIDTH.fa));
  for (const k of model.muscles) if (MUSCLES[k].seg === 'ua') parts.push(muscleShape(N, k));
  parts.push(`<circle class="m-hand" cx="${f1(N.hand[0])}" cy="${f1(N.hand[1])}" r="5.5"/>`);
  parts.push(equipFront(model, S));
  return parts.join('');
}

function modelMuscleNames(exId) {
  const model = MODELS[exId] || MODELS.custom;
  return model.muscles.map((k) => MUSCLES[k].name);
}

/** Bildausschnitt passend zur Übung (Figur + Gerät, über die ganze Bewegung), Seitenverhältnis 6:5 */
const boxCache = {};
function modelViewBox(exId) {
  if (boxCache[exId]) return boxCache[exId];
  const model = MODELS[exId] || MODELS.custom;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = GROUND + 6;
  const take = (p, r = 0) => {
    x0 = Math.min(x0, p[0] - r); x1 = Math.max(x1, p[0] + r);
    y0 = Math.min(y0, p[1] - r); y1 = Math.max(y1, p[1] + r);
  };
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const S = solve(model, interpPose(model.p0, model.p1, t));
    for (const J of [S.near, S.far]) for (const p of Object.values(J)) take(p, 10);
    take(S.head, 14);
    if (model.hold === 'barbell') take(S.near.hand, 21);
  }
  const eq = model.equip || [];
  if (eq.includes('bench')) { take([68, 160]); take([222, 160]); }
  if (eq.includes('pullbar')) { take([54, model.at[1]]); take([238, model.at[1]]); }
  if (eq.includes('latseat') || model.hold === 'cable') take([model.at[0] + 100, 12]);
  if (eq.includes('legpress')) take(add(model.at, -35, 185));
  const pad = 8;
  x0 -= pad; x1 += pad; y0 -= pad;
  let w = x1 - x0, h = y1 - y0;
  const ratio = 300 / 250;
  if (w / h < ratio) { const nw = h * ratio; x0 -= (nw - w) / 2; w = nw; }
  else { const nh = w / ratio; y0 -= nh - h; h = nh; } // Boden bleibt unten
  return (boxCache[exId] = `${f1(x0)} ${f1(y0)} ${f1(w)} ${f1(h)}`);
}
