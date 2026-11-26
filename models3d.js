/* ============================================================
 *  3D-Übungsfiguren (Three.js)
 *
 *  Eine selbst gebaute Gliederpuppe mit anatomischen Gelenken.
 *  Jede Übung hat zwei Posen (p0 = Start der Bewegung, p1 = Ende),
 *  dazwischen wird weich interpoliert – gesteuert vom Trainingstempo.
 *
 *  Pose-Werte in Grad:
 *    pitch/roll/yaw  ganzer Körper (pitch + = nach vorne kippen, -90 = auf dem Rücken liegen)
 *    spine, chest    Rumpf beugen (+ = nach vorne)      neck  Kopf (+ = nicken)
 *    shF  Schulter beugen (+ = Arm nach vorne/oben)     shA  Arm seitlich abspreizen
 *    shR  Oberarm außen drehen                          el   Ellbogen beugen
 *    sup  Unterarm supinieren (90 = Handfläche vorne)   wr   Handgelenk beugen
 *    hpF  Hüfte beugen (+ = Bein nach vorne)            hpA  Bein abspreizen   hpR Bein außen drehen
 *    kn   Knie beugen                                    an   Sprunggelenk (+ = Zehen hoch, - = Zehenstand)
 *  Mit Präfix l_ / r_ gilt ein Wert nur für die linke/rechte Seite.
 *
 *  Koordinaten in Metern, Y nach oben, die Figur schaut Richtung +Z.
 * ============================================================ */
import * as THREE from './vendor/three.module.min.js';

const D = THREE.MathUtils.degToRad;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/* ---------------- Übungen ---------------- */
const STAND = { pitch: 0, spine: 0, chest: 0, neck: 0, hpF: 0, hpA: 4, hpR: 6, kn: 0, an: 0 };
const ARMS_DOWN = { shF: 0, shA: 6, shR: 0, el: 6, sup: 0 };

const EX = {
  bench: {
    anchor: 'hip', at: [0, 0.56, 0.12], muscles: ['chest', 'triceps', 'delts'], bar: 'hands', equip: ['bench', 'rack'], view: 62,
    p0: { pitch: -90, spine: 0, chest: -6, neck: 8, shF: -62, shA: 55, shR: 20, el: 105, sup: -80, hpF: -8, hpA: 24, hpR: 16, kn: 82, an: 0 },
    p1: { pitch: -90, spine: 0, chest: -6, neck: 8, shF: 80, shA: 20, shR: 0, el: 4, sup: -80, hpF: -8, hpA: 24, hpR: 16, kn: 82, an: 0 },
  },
  incline: {
    anchor: 'hip', at: [0, 0.56, 0], muscles: ['chest', 'delts', 'triceps'], bar: 'hands', equip: ['incline'], view: 62,
    p0: { pitch: -42, spine: 0, chest: -4, neck: 18, shF: -40, shA: 50, shR: 40, el: 120, sup: -80, hpF: 52, hpA: 18, hpR: 14, kn: 95, an: 0 },
    p1: { pitch: -42, spine: 0, chest: -4, neck: 18, shF: 84, shA: 20, shR: 0, el: 4, sup: -80, hpF: 52, hpA: 18, hpR: 14, kn: 95, an: 0 },
  },
  squat: {
    anchor: 'feet', muscles: ['quads', 'glutes'], bar: 'back', view: 58,
    p0: { pitch: 42, spine: 4, chest: 0, neck: -32, hpF: 128, hpA: 16, hpR: 18, kn: 122, an: 32, shF: -30, shA: 70, shR: 80, el: 120, sup: -80 },
    p1: { ...STAND, hpA: 12, hpR: 14, shF: -30, shA: 70, shR: 80, el: 120, sup: -80 },
  },
  deadlift: {
    anchor: 'feet', muscles: ['hamstrings', 'glutes', 'lowerBack'], bar: 'hands', view: 68,
    p0: { pitch: 62, spine: 6, chest: 0, neck: -44, hpF: 122, hpA: 10, hpR: 10, kn: 84, an: 24, shF: 64, shA: 8, shR: 0, el: 2, sup: -85 },
    p1: { pitch: -2, spine: 0, chest: 0, neck: 0, hpF: 0, hpA: 6, hpR: 6, kn: 0, an: 0, shF: 2, shA: 10, shR: 0, el: 2, sup: -85 },
  },
  ohp: {
    anchor: 'feet', muscles: ['delts', 'triceps'], bar: 'hands', view: 55,
    p0: { ...STAND, pitch: -4, neck: 4, shF: 15, shA: 30, shR: 30, el: 145, sup: -60 },
    p1: { ...STAND, pitch: 0, shF: 172, shA: 8, shR: 30, el: 3, sup: -60 },
  },
  row: {
    anchor: 'feet', muscles: ['lats', 'biceps'], bar: 'hands', view: 70,
    p0: { pitch: 48, spine: 4, neck: -38, hpF: 64, hpA: 6, hpR: 6, kn: 24, an: 12, shF: 50, shA: 8, shR: 0, el: 2, sup: -85 },
    p1: { pitch: 48, spine: 4, neck: -38, hpF: 64, hpA: 6, hpR: 6, kn: 24, an: 12, shF: -22, shA: 34, shR: 0, el: 96, sup: -85 },
  },
  pullup: {
    anchor: 'hands', at: [0, 2.25, 0], muscles: ['lats', 'biceps'], equip: ['pullbar'], view: 40,
    p0: { pitch: 4, neck: 0, shF: 6, shA: 158, shR: 90, el: 4, sup: 0, hpF: 18, kn: 70, an: -20, l_hpA: 2, r_hpA: 2 },
    p1: { pitch: 10, neck: -6, shF: 18, shA: 52, shR: 90, el: 128, sup: 0, hpF: 22, kn: 72, an: -20, l_hpA: 2, r_hpA: 2 },
  },
  pushup: {
    anchor: 'toes', at: [0, 0, -0.62], muscles: ['chest', 'triceps'], view: 72,
    p0: { pitch: 86, spine: 0, neck: -14, shF: -18, shA: 46, shR: 0, el: 112, sup: -90, wr: -85, grip: 0, hpF: 0, hpA: 6, kn: 0, an: -32 },
    p1: { pitch: 72.5, spine: 0, neck: -12, shF: 72, shA: 12, shR: 0, el: 2, sup: -90, wr: -85, grip: 0, hpF: 0, hpA: 6, kn: 0, an: -20 },
  },
  dips: {
    anchor: 'hands', at: [0, 1.22, 0], muscles: ['chest', 'triceps'], equip: ['dipbar'], view: 62,
    p0: { pitch: 26, neck: -14, shF: -54, shA: 14, shR: 0, el: 96, sup: -10, hpF: 14, kn: 70, an: -20 },
    p1: { pitch: 8, neck: -4, shF: 8, shA: 8, shR: 0, el: 2, sup: -10, hpF: 10, kn: 70, an: -20 },
  },
  curl: {
    anchor: 'feet', muscles: ['biceps'], dumbbells: true, view: 48,
    p0: { ...STAND, ...ARMS_DOWN, shA: 15, sup: 90, el: 6 },
    p1: { ...STAND, ...ARMS_DOWN, shF: 12, shA: 12, sup: 90, el: 138 },
  },
  lunge: {
    anchor: 'lfoot', at: [0, 0, 0.32], muscles: ['quads', 'glutes'], dumbbells: true, view: 72,
    p0: { pitch: 0, neck: 0, ...ARMS_DOWN, el: 4, l_hpF: 30, l_kn: 26, l_an: -4, r_hpF: -22, r_kn: 6, r_an: -18, hpA: 4 },
    p1: { pitch: 4, neck: -4, ...ARMS_DOWN, el: 4, l_hpF: 92, l_kn: 92, l_an: 6, r_hpF: -4, r_kn: 96, r_an: -30, hpA: 4 },
  },
  legpress: {
    anchor: 'hip', at: [0, 0.6, -0.3], muscles: ['quads', 'glutes'], equip: ['legpress'], view: 64,
    p0: { pitch: -52, neck: 26, shF: 22, shA: 22, shR: 0, el: 20, sup: 0, hpF: 132, hpA: 14, hpR: 10, kn: 96, an: 44 },
    p1: { pitch: -52, neck: 26, shF: 22, shA: 22, shR: 0, el: 20, sup: 0, hpF: 88, hpA: 12, hpR: 8, kn: 6, an: 4 },
  },
  latpull: {
    anchor: 'hip', at: [0, 0.6, 0], muscles: ['lats', 'biceps'], equip: ['latseat'], view: 50,
    p0: { pitch: -8, neck: 0, shF: 10, shA: 160, shR: 90, el: 4, sup: 0, hpF: 82, hpA: 10, kn: 88, an: 0 },
    p1: { pitch: -16, neck: 6, shF: 10, shA: 42, shR: 90, el: 126, sup: 0, hpF: 90, hpA: 10, kn: 88, an: 0 },
  },
  triceps: {
    anchor: 'feet', muscles: ['triceps'], equip: ['cable'], view: 62,
    p0: { ...STAND, pitch: 10, neck: -8, hpF: 8, kn: 8, an: 2, shF: 14, shA: 10, shR: 0, el: 102, sup: -80, wr: 10 },
    p1: { ...STAND, pitch: 10, neck: -8, hpF: 8, kn: 8, an: 2, shF: 12, shA: 10, shR: 0, el: 6, sup: -80, wr: 0 },
  },
  calf: {
    anchor: 'feet', muscles: ['calves'], dumbbells: true, view: 84,
    p0: { ...STAND, ...ARMS_DOWN, an: 0 },
    p1: { ...STAND, ...ARMS_DOWN, an: -38 },
  },
};
EX.custom = { ...EX.ohp, bar: null, dumbbells: true,
  p0: { ...STAND, pitch: -2, shF: 10, shA: 80, shR: 90, el: 100, sup: -80 },
  p1: { ...STAND, shF: 6, shA: 160, shR: 90, el: 6, sup: -80 } };

/* ---------------- Farben ---------------- */
function themeColors() {
  const cs = getComputedStyle(document.documentElement);
  const g = (n, fb) => cs.getPropertyValue(n).trim() || fb;
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  return {
    dark,
    body: dark ? '#d8d2c8' : '#cbc5bb',
    accent: g('--accent', '#c8420c'),
    metal: dark ? '#9a958d' : '#7d786f',
    pad: dark ? '#3b3733' : '#46413b',
    frame: dark ? '#56524c' : '#8b857b',
    plate: dark ? '#2b2825' : '#2f2b27',
    floor: g('--line', '#e4e1da'),
    shorts: dark ? '#34312d' : '#3d3934',
    eye: '#2a2622',
  };
}

/* ---------------- Geometrie ---------------- */
/** Glied entlang -Y: oben Radius r0, unten r1, mit Muskelbauch und runden Enden */
function limbGeo(len, r0, r1, bulge = 0, at = 0.4) {
  const k = Math.log(0.5) / Math.log(at);
  const r = (u) => r0 + (r1 - r0) * u + bulge * Math.sin(Math.PI * Math.pow(u, k));
  const pts = [];
  for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + (Math.PI / 2) * (i / 6); pts.push(new THREE.Vector2(Math.cos(a) * r1 + 1e-4, -len + Math.sin(a) * r1)); }
  for (let i = 1; i < 14; i++) { const u = 1 - i / 14; pts.push(new THREE.Vector2(r(u), -len * u)); }
  for (let i = 0; i <= 6; i++) { const a = (Math.PI / 2) * (i / 6); pts.push(new THREE.Vector2(Math.cos(a) * r0 + 1e-4, Math.sin(a) * r0)); }
  const g = new THREE.LatheGeometry(pts, 20);
  g.computeVertexNormals();
  return g;
}
const SPHERE = new THREE.SphereGeometry(1, 24, 16);

function blob(mat, pos, scale, rot = [0, 0, 0]) {
  const m = new THREE.Mesh(SPHERE, mat);
  m.position.copy(pos); m.scale.set(...scale); m.rotation.set(...rot);
  m.castShadow = true;
  return m;
}
function limb(mat, len, r0, r1, bulge, at) {
  const m = new THREE.Mesh(limbGeo(len, r0, r1, bulge, at), mat);
  m.castShadow = true;
  return m;
}
function joint(parent, pos) { const j = new THREE.Group(); j.position.copy(pos); parent.add(j); return j; }

/* ---------------- Figur ---------------- */
function buildFigure(mats) {
  const B = mats.body;
  const muscles = {}; // key -> [meshes]
  const mus = (key, parent, pos, scale, rot) => {
    const m = blob(B, pos, scale, rot);
    (muscles[key] ||= []).push(m);
    parent.add(m);
    return m;
  };

  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  root.add(blob(B, V(0, -0.01, -0.005), [0.165, 0.11, 0.115]));

  const spine = joint(root, V(0, 0.05, 0));
  spine.add(blob(B, V(0, 0.1, 0), [0.14, 0.14, 0.1]));
  mus('abs', spine, V(0, 0.1, 0.06), [0.085, 0.12, 0.05]);
  mus('lowerBack', spine, V(0.04, 0.09, -0.055), [0.04, 0.11, 0.05]);
  mus('lowerBack', spine, V(-0.04, 0.09, -0.055), [0.04, 0.11, 0.05]);

  const chest = joint(spine, V(0, 0.19, 0));
  chest.add(blob(B, V(0, 0.13, -0.01), [0.165, 0.18, 0.115]));
  chest.add(blob(B, V(0, 0.27, -0.02), [0.17, 0.05, 0.08])); // Schultergürtel
  mus('chest', chest, V(0.07, 0.17, 0.07), [0.075, 0.06, 0.05], [0, 0, -0.15]);
  mus('chest', chest, V(-0.07, 0.17, 0.07), [0.075, 0.06, 0.05], [0, 0, 0.15]);
  mus('lats', chest, V(0.11, 0.1, -0.05), [0.06, 0.14, 0.065], [0, 0, 0.22]);
  mus('lats', chest, V(-0.11, 0.1, -0.05), [0.06, 0.14, 0.065], [0, 0, -0.22]);
  chest.add(blob(B, V(0, 0.25, -0.06), [0.12, 0.06, 0.05])); // Nacken (Trapez)

  const neck = joint(chest, V(0, 0.29, -0.01));
  const neckMesh = limb(B, 0.09, 0.05, 0.048, 0, 0.5);
  neckMesh.rotation.x = Math.PI; neck.add(neckMesh);
  const head = joint(neck, V(0, 0.09, 0.005));
  head.add(blob(B, V(0, 0.1, 0.005), [0.086, 0.112, 0.1]));
  head.add(blob(B, V(0, 0.045, 0.035), [0.068, 0.05, 0.07])); // Kiefer
  head.add(blob(B, V(0, 0.09, 0.1), [0.014, 0.022, 0.016])); // Nase

  const sides = {};
  for (const [side, s] of [['l', 1], ['r', -1]]) {
    // Arm
    const sh = joint(chest, V(0.185 * s, 0.245, -0.01));
    sh.rotation.order = 'XZY';
    mus('delts', sh, V(0.012 * s, -0.025, 0), [0.062, 0.075, 0.068]);
    sh.add(limb(B, 0.29, 0.044, 0.035, 0.004, 0.45));
    mus('biceps', sh, V(0, -0.135, 0.022), [0.034, 0.085, 0.032]);
    mus('triceps', sh, V(0, -0.12, -0.026), [0.037, 0.095, 0.033]);
    const el = joint(sh, V(0, -0.29, 0));
    el.add(limb(B, 0.25, 0.037, 0.024, 0.007, 0.25));
    const wr = joint(el, V(0, -0.255, 0));
    wr.rotation.order = 'YXZ';
    wr.add(blob(B, V(0, -0.06, 0.006), [0.024, 0.065, 0.044]));
    wr.add(blob(B, V(0, -0.035, 0.04), [0.016, 0.03, 0.014], [0.4, 0, 0])); // Daumen
    const grip = joint(wr, V(0, -0.07, 0.004));

    // Bein
    mus('glutes', root, V(0.07 * s, -0.035, -0.07), [0.085, 0.095, 0.07]);
    const hp = joint(root, V(0.09 * s, -0.06, 0));
    hp.rotation.order = 'XZY';
    hp.add(limb(B, 0.43, 0.075, 0.046, 0.008, 0.35));
    mus('quads', hp, V(0.004 * s, -0.2, 0.03), [0.058, 0.17, 0.05]);
    mus('hamstrings', hp, V(0, -0.22, -0.03), [0.054, 0.16, 0.045]);
    const kn = joint(hp, V(0, -0.43, 0));
    kn.add(limb(B, 0.42, 0.048, 0.03, 0.006, 0.25));
    mus('calves', kn, V(0, -0.12, -0.028), [0.044, 0.1, 0.042]);
    const an = joint(kn, V(0, -0.42, 0));
    an.add(blob(B, V(0, -0.045, 0.045), [0.044, 0.038, 0.115]));
    const heel = joint(an, V(0, -0.08, -0.06));
    const toe = joint(an, V(0, -0.08, 0.16));
    sides[side] = { s, sh, el, wr, grip, hp, kn, an, heel, toe };
  }
  const traps = joint(chest, V(0, 0.255, -0.1)); // Auflage der Langhantel bei Kniebeugen
  return { root, spine, chest, neck, head, sides, muscles, traps };
}

function applyPose(F, P) {
  const g = (side, k) => P[side + '_' + k] ?? P[k] ?? 0;
  F.root.rotation.set(D(P.pitch || 0), D(P.yaw || 0), D(P.roll || 0));
  F.spine.rotation.x = D(P.spine || 0);
  F.chest.rotation.x = D(P.chest || 0);
  F.neck.rotation.x = D((P.neck || 0) * 0.5);
  F.head.rotation.x = D((P.neck || 0) * 0.5);
  for (const side of ['l', 'r']) {
    const S = F.sides[side], s = S.s;
    S.sh.rotation.set(-D(g(side, 'shF')), s * D(g(side, 'shR')), s * D(g(side, 'shA')));
    S.el.rotation.x = -D(g(side, 'el'));
    // Handgelenk beugen (+) / strecken (-) Richtung Handfläche, dann Unterarm drehen
    S.wr.rotation.set(0, s * D(g(side, 'sup')), -s * D(g(side, 'wr')));
    S.hp.rotation.set(-D(g(side, 'hpF')), s * D(g(side, 'hpR')), s * D(g(side, 'hpA')));
    S.kn.rotation.x = D(g(side, 'kn'));
    S.an.rotation.x = -D(g(side, 'an'));
  }
}

const lerp = (a, b, t) => a + (b - a) * t;
function interpPose(p0, p1, t) {
  const out = {};
  for (const k of new Set([...Object.keys(p0), ...Object.keys(p1)])) out[k] = lerp(p0[k] ?? 0, p1[k] ?? p0[k] ?? 0, t);
  return out;
}
const wp = (o) => o.getWorldPosition(new THREE.Vector3());

/* ---------------- Geräte ---------------- */
function cyl(mat, r, len, seg = 20) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function box(mat, w, h, d, radius = 0) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true; m.receiveShadow = true;
  if (radius) m.userData.r = radius;
  return m;
}
function cushion(mat, w, h, d) {
  // Polster: abgerundete Box aus Kapseln
  const g = new THREE.Group();
  const r = h / 2;
  const core = box(mat, w - 2 * r, h, d - 2 * r); g.add(core);
  for (const [x, len, rotZ] of [[0, d - 2 * r, 0]]) {
    for (const sx of [-1, 1]) {
      const c = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 12), mat);
      c.rotation.x = Math.PI / 2; c.position.x = sx * (w / 2 - r); c.castShadow = true; g.add(c);
    }
  }
  for (const sz of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.CapsuleGeometry(r, w - 2 * r, 6, 12), mat);
    c.rotation.z = Math.PI / 2; c.position.z = sz * (d / 2 - r); c.castShadow = true; g.add(c);
  }
  return g;
}
/** Stab von a nach b */
function rod(mat, r) {
  const m = cyl(mat, r, 1, 12);
  m.userData.rod = true;
  return m;
}
function setRod(m, a, b) {
  const d = b.clone().sub(a), len = d.length();
  m.position.copy(a).addScaledVector(d, 0.5);
  m.scale.set(1, Math.max(len, 1e-4), 1);
  m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
}

function barbell(mats, plates = 2) {
  const g = new THREE.Group();
  const bar = cyl(mats.metal, 0.014, 2.05); bar.rotation.z = Math.PI / 2; g.add(bar);
  for (const sx of [-1, 1]) {
    const sleeve = cyl(mats.metal, 0.025, 0.36); sleeve.rotation.z = Math.PI / 2; sleeve.position.x = sx * 0.83; g.add(sleeve);
    for (let i = 0; i < plates; i++) {
      const p = cyl(mats.plate, i ? 0.17 : 0.225, 0.045, 32); p.rotation.z = Math.PI / 2; p.position.x = sx * (0.7 + i * 0.05); g.add(p);
    }
    const col = cyl(mats.metal, 0.034, 0.03); col.rotation.z = Math.PI / 2; col.position.x = sx * (0.67); g.add(col);
  }
  return g;
}
function dumbbell(mats) {
  const g = new THREE.Group();
  const h = cyl(mats.metal, 0.016, 0.2); h.rotation.x = Math.PI / 2; g.add(h);
  for (const sz of [-1, 1]) {
    const p = cyl(mats.plate, 0.06, 0.05, 6); p.rotation.x = Math.PI / 2; p.position.z = sz * 0.1; g.add(p);
  }
  return g;
}

function buildEquip(def, mats, F) {
  const E = { static: new THREE.Group(), dyn: [] };
  const add = (o, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); E.static.add(o); return o; };
  const legs = (x, z, h, w = 0.05) => add(box(mats.frame, w, h, w), x, h / 2, z);

  if (def.bar) {
    const bb = barbell(mats);
    E.static.parent; E.dyn.push(() => {
      const L = wp(F.sides.l.grip), R = wp(F.sides.r.grip);
      if (def.bar === 'back') {
        const c = wp(F.traps);
        const dir = L.clone().sub(R).setY(0).normalize();
        bb.position.copy(c);
        bb.quaternion.setFromUnitVectors(V(1, 0, 0), dir.lengthSq() ? dir : V(1, 0, 0));
      } else {
        bb.position.copy(L).add(R).multiplyScalar(0.5);
        bb.quaternion.setFromUnitVectors(V(1, 0, 0), L.sub(R).normalize());
      }
    });
    E.barbell = bb;
  }
  if (def.dumbbells) {
    for (const s of ['l', 'r']) F.sides[s].grip.add(dumbbell(mats));
  }
  for (const e of def.equip || []) {
    if (e === 'bench') {
      const top = 0.44, z0 = -0.72, len = 1.2;
      add(cushion(mats.pad, 0.3, 0.07, len), 0, top - 0.035, z0 + len / 2);
      add(box(mats.frame, 0.1, top - 0.07, 0.9), 0, (top - 0.07) / 2, z0 + 0.6);
      add(box(mats.frame, 0.5, 0.04, 0.06), 0, 0.02, z0 + 0.1);
      add(box(mats.frame, 0.5, 0.04, 0.06), 0, 0.02, z0 + 1.1);
    }
    if (e === 'rack') {
      for (const sx of [-1, 1]) {
        add(box(mats.frame, 0.06, 1.15, 0.06), sx * 0.58, 0.575, -0.38);
        add(box(mats.frame, 0.06, 0.06, 0.12), sx * 0.58, 1.05, -0.33);
        add(box(mats.frame, 0.06, 0.04, 0.5), sx * 0.58, 0.02, -0.38);
      }
    }
    if (e === 'incline') {
      const seatTop = 0.45;
      add(cushion(mats.pad, 0.3, 0.07, 0.36), 0, seatTop - 0.035, 0.1);
      const back = add(cushion(mats.pad, 0.3, 0.07, 0.86), 0, 0.73, -0.37);
      back.rotation.x = D(48);
      add(box(mats.frame, 0.08, seatTop - 0.07, 0.08), 0, (seatTop - 0.07) / 2, 0.08);
      const strut = add(box(mats.frame, 0.07, 0.62, 0.07), 0, 0.34, -0.42); strut.rotation.x = D(20);
      add(box(mats.frame, 0.07, 0.07, 0.9), 0, 0.06, -0.2);
      add(box(mats.frame, 0.5, 0.04, 0.06), 0, 0.02, 0.22);
      add(box(mats.frame, 0.5, 0.04, 0.06), 0, 0.02, -0.64);
    }
    if (e === 'pullbar') {
      const y = def.at[1];
      const bar = cyl(mats.metal, 0.016, 1.5); bar.rotation.z = Math.PI / 2; add(bar, 0, y, 0);
      for (const sx of [-1, 1]) { add(box(mats.frame, 0.07, y + 0.08, 0.07), sx * 0.72, (y + 0.08) / 2, 0); add(box(mats.frame, 0.07, 0.04, 0.8), sx * 0.72, 0.02, 0); }
    }
    if (e === 'dipbar') {
      const y = def.at[1];
      const bars = [];
      for (const sx of [-1, 1]) {
        const b = cyl(mats.metal, 0.022, 0.8); b.rotation.x = Math.PI / 2; add(b, sx * 0.26, y - 0.01, 0.05);
        const p1 = box(mats.frame, 0.06, y, 0.06), p2 = box(mats.frame, 0.06, y, 0.06);
        add(p1, sx * 0.26, y / 2, -0.32); add(p2, sx * 0.26, y / 2, 0.42);
        add(box(mats.frame, 0.06, 0.04, 0.9), sx * 0.26, 0.02, 0.05);
        bars.push([b, p1, p2, sx]);
      }
      E.dyn.push(() => {
        for (const [b, p1, p2, sx] of bars) {
          const x = wp(F.sides[sx > 0 ? 'l' : 'r'].grip).x;
          b.position.x = p1.position.x = p2.position.x = x + sx * 0.005;
        }
      });
    }
    if (e === 'legpress') {
      // Sitz und Rückenlehne (Lehne entlang des Rückens, 52° nach hinten)
      const seat = add(cushion(mats.pad, 0.42, 0.08, 0.38), 0, 0.45, -0.26); seat.rotation.x = D(-10);
      const back = add(cushion(mats.pad, 0.42, 0.08, 0.8), 0, 0.7, -0.69); back.rotation.x = D(38);
      add(box(mats.frame, 0.1, 0.42, 0.1), 0, 0.21, -0.3);
      const bs = add(box(mats.frame, 0.08, 0.6, 0.08), 0, 0.3, -0.85); bs.rotation.x = D(-20);
      for (const sx of [-1, 1]) { const h = cyl(mats.metal, 0.018, 0.22); h.rotation.x = Math.PI / 2; add(h, sx * 0.29, 0.5, -0.12); }
      // Schlitten: Schienen unter der Fußplatte, 45° nach vorne oben
      const dir = V(0, Math.SQRT1_2, Math.SQRT1_2), nrm = V(0, -Math.SQRT1_2, Math.SQRT1_2);
      // Schienen werden nach dem Bau an die tatsächliche Fußbahn angepasst (calibrate)
      const rails = [];
      for (const sx of [-1, 1]) {
        const r = rod(mats.metal, 0.028), post = rod(mats.frame, 0.035), post2 = rod(mats.frame, 0.035);
        E.static.add(r, post, post2);
        rails.push([sx, r, post, post2]);
      }
      const basePl = add(box(mats.frame, 0.6, 0.05, 1), 0, 0.025, 0);
      E.calibrate = (c0, c1) => {
        const d = c1.clone().sub(c0).setX(0).normalize();
        const n = V(0, -d.z, d.y); // senkrecht zur Bahn, nach unten/vorne
        const a = c0.clone().addScaledVector(d, -0.3).addScaledVector(n, 0.2);
        const b = c1.clone().addScaledVector(d, 0.65).addScaledVector(n, 0.2);
        for (const [sx, r, post, post2] of rails) {
          setRod(r, a.clone().setX(sx * 0.24), b.clone().setX(sx * 0.24));
          setRod(post, V(sx * 0.24, 0, b.z), b.clone().setX(sx * 0.24));
          setRod(post2, V(sx * 0.24, 0, a.z), a.clone().setX(sx * 0.24));
        }
        const z0 = -0.95, z1 = b.z + 0.12;
        basePl.scale.z = z1 - z0; basePl.position.z = (z0 + z1) / 2;
      };
      // Fußplatte folgt den Füßen
      const plate = new THREE.Group();
      plate.add(box(mats.frame, 0.6, 0.55, 0.04));
      const car = box(mats.frame, 0.56, 0.12, 0.3); car.position.set(0, -0.2, 0.14); plate.add(car);
      for (const sx of [-1, 1]) {
        const h = cyl(mats.metal, 0.025, 0.26); h.rotation.z = Math.PI / 2; h.position.set(sx * 0.4, -0.08, 0.1); plate.add(h);
        for (let i = 0; i < 2; i++) { const p = cyl(mats.plate, i ? 0.16 : 0.22, 0.045, 32); p.rotation.z = Math.PI / 2; p.position.set(sx * (0.36 + i * 0.05), -0.08, 0.1); plate.add(p); }
      }
      plate.rotation.x = D(-45);
      E.static.add(plate);
      E.dyn.push(() => {
        const c = wp(F.sides.l.heel).add(wp(F.sides.l.toe)).add(wp(F.sides.r.heel)).add(wp(F.sides.r.toe)).multiplyScalar(0.25);
        plate.position.copy(c).addScaledVector(dir, 0.025);
        plate.position.x = 0;
        E.plateC = plate.position.clone();
      });
    }
    if (e === 'latseat') {
      add(cushion(mats.pad, 0.38, 0.08, 0.36), 0, 0.5, 0.06);
      add(box(mats.frame, 0.08, 0.46, 0.08), 0, 0.23, 0.04);
      add(box(mats.frame, 0.55, 0.04, 0.5), 0, 0.02, 0.2);
      for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.14, 6, 12), mats.pad); p.rotation.z = Math.PI / 2; p.castShadow = true; add(p, sx * 0.12, 0.72, 0.34); }
      add(box(mats.frame, 0.06, 0.25, 0.06), 0, 0.68, 0.48);
      add(box(mats.frame, 0.1, 2.45, 0.1), 0, 1.225, 0.62);
      add(box(mats.frame, 0.08, 0.08, 0.68), 0, 2.4, 0.3);
      const pulley = cyl(mats.metal, 0.05, 0.03, 20); pulley.rotation.z = Math.PI / 2; add(pulley, 0, 2.34, 0.02);
      const lb = new THREE.Group();
      const b = cyl(mats.metal, 0.014, 1.15); b.rotation.z = Math.PI / 2; lb.add(b);
      for (const sx of [-1, 1]) { const end = cyl(mats.metal, 0.014, 0.14); end.position.set(sx * 0.6, -0.05, 0); end.rotation.z = sx * 0.6; lb.add(end); }
      E.static.add(lb);
      const cable = rod(mats.plate, 0.004); E.static.add(cable);
      E.dyn.push(() => {
        const c = wp(F.sides.l.grip).add(wp(F.sides.r.grip)).multiplyScalar(0.5);
        lb.position.copy(c);
        setRod(cable, c, V(0, 2.3, 0.02));
      });
    }
    if (e === 'cable') {
      const z = 0.42;
      add(box(mats.frame, 0.12, 2.25, 0.12), 0, 1.125, z + 0.1);
      add(box(mats.frame, 0.6, 0.04, 0.5), 0, 0.02, z + 0.1);
      add(box(mats.frame, 0.08, 0.08, 0.2), 0, 2.15, z);
      const pulley = cyl(mats.metal, 0.045, 0.03, 20); pulley.rotation.z = Math.PI / 2; add(pulley, 0, 2.1, z - 0.06);
      add(box(mats.plate, 0.2, 0.45, 0.08), 0, 0.5, z + 0.18);
      const tb = cyl(mats.metal, 0.014, 0.4); tb.rotation.z = Math.PI / 2; E.static.add(tb);
      const cable = rod(mats.plate, 0.004); E.static.add(cable);
      E.dyn.push(() => {
        const c = wp(F.sides.l.grip).add(wp(F.sides.r.grip)).multiplyScalar(0.5);
        tb.position.copy(c);
        setRod(cable, c, V(0, 2.08, z - 0.06));
      });
    }
  }
  if (E.barbell) E.static.add(E.barbell);
  return E;
}

/* ---------------- Realistischer Mensch (MakeHuman, CC0) ----------------
 *  Das Modell hat ein eigenes Skelett in der Grundhaltung von MakeHuman (A-Pose).
 *  Die Gliederpuppe oben bleibt unsichtbar als "Treiber": Ihre Gelenkrotationen
 *  werden auf die Knochen übertragen. Pro Knochen gleicht R_bind den Unterschied
 *  zwischen A-Pose und unserer Ruhehaltung (Arme hängen) aus.
 */
let HUMAN = null; // { meta, buf }
let humanVersion = 0;
/** Figur: 'man' oder 'woman' (Character-Creator-Modelle in assets/) */
const FIGURES = ['man', 'woman'];
const FIG_KEY = 'pulse-figure';
let figure = (() => { try { return FIGURES.includes(localStorage.getItem(FIG_KEY)) ? localStorage.getItem(FIG_KEY) : 'man'; } catch (e) { return 'man'; } })();
const humanCache = {};
function loadHuman(name) {
  if (typeof fetch === 'undefined') return Promise.resolve();
  if (!humanCache[name]) {
    const base = new URL('./assets/', import.meta.url);
    humanCache[name] = Promise.all([
      fetch(new URL(name + '.json', base)).then((r) => r.json()),
      fetch(new URL(name + '.bin', base)).then((r) => r.arrayBuffer()),
    ]).then(([meta, buf]) => ({ meta, buf })).catch(() => { delete humanCache[name]; return null; });
  }
  return humanCache[name].then((h) => {
    if (h && name === figure) { HUMAN = h; humanVersion++; }
  });
}
let humanReady = loadHuman(figure);

const TYPES = { i16: Int16Array, u16: Uint16Array, u8: Uint8Array };
function buf(name) {
  const b = HUMAN.meta.buffers[name];
  return new TYPES[b.type](HUMAN.buf, b.offset, b.length / TYPES[b.type].BYTES_PER_ELEMENT);
}

/** Ruhe-Richtung je Gelenk (Arme/Beine hängen) und Kind-Gelenk, das die Richtung im Modell vorgibt */
const REST_AIM = { sh: 'el', el: 'wr', fa: 'wr', wr: 'f1', f1: 'f2', f2: 'f3', f3: 'f3', th1: 'th2', th2: 'th2', hp: 'kn', kn: 'an' };
/** Zusätzliche Drehung um die Längsachse (Grad), damit die Handflächen zum Körper zeigen */
const REST_TWIST = { el: 0, fa: 0, wr: 0, f1: 0, f2: 0 };

/** Griff: Beugung je Fingerglied (Anteil von "curl" in Grad) und Lage der Stange in der Faust (m) */
const GRIP = { curl: 78, mcp: 0.85, pip: 1.0, dip: 0.65, th1: 0.5, th2: 0.6, palm: 0.028, along: 0.012 };

function buildHuman(colors) {
  const { meta } = HUMAN;
  const n = meta.vertices;
  const geo = new THREE.BufferGeometry();
  const tex = meta.buffers.col ? buf('col') : null; // Farben aus den Texturen (Haut, Kleidung, Haare)
  const p16 = buf('pos');
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < pos.length; i++) pos[i] = p16[i] / 1000;
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(new Uint16Array(buf('idx')), 1));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(buf('ji')), 4));
  const jw = buf('jw'), w = new Float32Array(jw.length);
  for (let i = 0; i < jw.length; i++) w[i] = jw[i] / 255;
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(w, 4));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.computeVertexNormals();

  // Skelett in Grundhaltung: alle Knochen ohne Drehung, nur versetzt
  const J = {}, bones = [];
  for (const j of meta.joints) {
    const b = new THREE.Bone();
    b.name = j.name;
    const p = V(...j.pos);
    if (j.parent) { b.position.copy(p).sub(V(...J[j.parent].pos)); J[j.parent].bone.add(b); }
    else b.position.copy(p);
    J[j.name] = { bone: b, pos: j.pos, parent: j.parent, rbindInv: new THREE.Quaternion() };
    bones.push(b);
  }
  // R_bind: dreht unsere Ruhehaltung in die A-Pose des Modells
  for (const [name, info] of Object.entries(J)) {
    const [kind, side] = name.split('.');
    const aim = REST_AIM[kind];
    if (!aim || !side) continue;
    let child = J[aim + '.' + side];
    let from = V(...info.pos);
    if (aim === kind) { from = V(...J[info.parent].pos); child = info; } // letztes Fingerglied: Richtung des Elternglieds
    const dir = V(...child.pos).sub(from).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, -1, 0), dir);
    const tw = REST_TWIST[kind] || 0;
    if (tw) q.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), D(tw * (side === 'L' ? 1 : -1))));
    info.rbindInv = q.invert();
  }
  const root = J.root.bone;
  const skeleton = new THREE.Skeleton(bones);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: tex ? 0.68 : 0.6, metalness: 0, side: tex ? THREE.DoubleSide : THREE.FrontSide });
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.add(root);
  mesh.updateMatrixWorld(true);
  mesh.bind(skeleton);
  mesh.castShadow = true;
  mesh.frustumCulled = false;

  // Marker (Griff, Ferse, Zehen, Nacken) hängen an den Knochen
  const mk = (name) => {
    const m = meta.markers[name];
    const o = new THREE.Object3D();
    o.position.copy(V(...m.pos)).sub(V(...J[m.joint].pos));
    J[m.joint].bone.add(o);
    return o;
  };
  const sides = {};
  const H = { mesh, J, root, sides, traps: mk('traps'), hand: {} };
  /* Hand-Geometrie im Hand-System unserer Ruhehaltung (Arm hängt):
   *  ax  = Knöchellinie (Beugeachse der Finger)   d = Fingerrichtung
   *  np  = Richtung Handfläche (dorthin krümmen sich die Finger)
   *  Der Griffpunkt liegt in der geschlossenen Faust, dort läuft die Stange durch. */
  for (const [s, S] of [['l', 'L'], ['r', 'R']]) {
    const wr = J['wr.' + S], rbind = wr.rbindInv.clone().invert();
    const toRest = (p) => V(...p).sub(V(...wr.pos)).applyQuaternion(wr.rbindInv);
    const [k2, k5] = meta.knuckles[S].map(toRest);
    const kmid = k2.clone().add(k5).multiplyScalar(0.5);
    let ax = k5.clone().sub(k2).normalize();
    if (S === 'R') ax.negate();
    const d = toRest(J['f2.' + S].pos).sub(toRest(J['f1.' + S].pos)).normalize();
    const np = d.clone().applyAxisAngle(ax, 0.1).sub(d).normalize();
    const t = toRest(J['th2.' + S].pos).sub(toRest(J['th1.' + S].pos)).normalize();
    let axT = V().crossVectors(t, np).normalize();
    if (t.clone().applyAxisAngle(axT, 0.1).dot(np) < t.dot(np)) axT.negate();
    H.hand[S] = { ax, d, np, axT };
    // Griff: Kind des Handknochens, lokale Z-Achse entlang der Knöchellinie (Stange/Hantelgriff)
    const gripRest = kmid.clone().addScaledVector(np, GRIP.palm).addScaledVector(d, GRIP.along);
    const grip = new THREE.Object3D();
    grip.position.copy(gripRest).applyQuaternion(rbind);
    grip.quaternion.copy(rbind).multiply(new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), ax));
    wr.bone.add(grip);
    sides[s] = { grip, heel: mk('heel.' + S), toe: mk('toe.' + S) };
  }

  H.paint = (active) => {
    const masks = buf('mask'), part = buf('part'), mk = meta.masks.length;
    const col = geo.attributes.color.array;
    const body = new THREE.Color(colors.body), acc = new THREE.Color(colors.accent);
    const shorts = new THREE.Color(colors.shorts), eye = new THREE.Color(colors.eye);
    const ai = active.map((k) => meta.masks.indexOf(k)).filter((i) => i >= 0);
    const si = meta.masks.indexOf('shorts');
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      if (tex) {
        // echte Farben; trainierte Muskeln (nur auf der Haut) in Akzentfarbe
        c.setRGB(tex[i * 3] / 255, tex[i * 3 + 1] / 255, tex[i * 3 + 2] / 255, THREE.SRGBColorSpace);
        if (part[i] === 0) {
          let a = 0;
          for (const k of ai) a = Math.max(a, masks[i * mk + k] / 255);
          c.lerp(acc, a * 0.85);
        }
        c.toArray(col, i * 3);
        continue;
      }
      if (part[i] === 1) { eye.toArray(col, i * 3); continue; }
      let a = 0;
      for (const k of ai) a = Math.max(a, masks[i * mk + k] / 255);
      const sh = masks[i * mk + si] / 255;
      c.copy(body).lerp(shorts, sh).lerp(acc, a * (1 - sh * 0.25));
      c.toArray(col, i * 3);
    }
    geo.attributes.color.needsUpdate = true;
  };

  const tmpQ = new THREE.Quaternion(), world = {};
  /** Treiber-Pose (Gliederpuppe) auf das Skelett übertragen */
  H.drive = (F, P) => {
    const wq = (o) => o.getWorldQuaternion(new THREE.Quaternion());
    const g = (side, k) => P[side + '_' + k] ?? P[k] ?? 0;
    const src = {
      root: wq(F.root), spine: wq(F.spine), chest: wq(F.chest), neck: wq(F.neck), head: wq(F.head),
    };
    for (const [s, S] of [['l', 'L'], ['r', 'R']]) {
      const T = F.sides[s], sg = T.s;
      src['sh.' + S] = wq(T.sh);
      src['el.' + S] = wq(T.el);
      src['wr.' + S] = wq(T.wr);
      let twist = sg * D(g(s, 'sup'));
      if (H.align) {
        // Hand so um die Unterarmachse drehen, dass die Knöchellinie entlang der Stange liegt
        const bar = H.align === 'between' ? wp(F.sides.l.wr).sub(wp(F.sides.r.wr)).normalize() : H.align.clone();
        const fore = V(0, 1, 0).applyQuaternion(src['wr.' + S]);
        const k = H.hand[S].ax.clone().applyQuaternion(src['wr.' + S]).projectOnPlane(fore).normalize();
        const b = bar.projectOnPlane(fore).normalize();
        if (b.lengthSq() > 0.5 && k.lengthSq() > 0.5) {
          let ang = Math.atan2(V().crossVectors(k, b).dot(fore), k.dot(b));
          if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI; // Stange hat keine Richtung
          src['wr.' + S] = tmpQ.setFromAxisAngle(fore, ang).clone().multiply(src['wr.' + S]);
          twist += ang;
        }
      }
      // Unterarm dreht nur halb mit (wie Elle/Speiche), Hand ganz
      src['fa.' + S] = src['el.' + S].clone().multiply(tmpQ.setFromAxisAngle(V(0, 1, 0), twist * 0.5));
      // Finger umschließen den Griff: Grund-, Mittel- und Endglied beugen sich um die Knöchellinie,
      // der Daumen legt sich von der anderen Seite darüber
      const c = D(P.grip ?? GRIP.curl), hd = H.hand[S];
      src['f1.' + S] = src['wr.' + S].clone().multiply(tmpQ.setFromAxisAngle(hd.ax, c * GRIP.mcp));
      src['f2.' + S] = src['f1.' + S].clone().multiply(tmpQ.setFromAxisAngle(hd.ax, c * GRIP.pip));
      src['f3.' + S] = src['f2.' + S].clone().multiply(tmpQ.setFromAxisAngle(hd.ax, c * GRIP.dip));
      src['th1.' + S] = src['wr.' + S].clone().multiply(tmpQ.setFromAxisAngle(hd.axT, c * GRIP.th1));
      src['th2.' + S] = src['th1.' + S].clone().multiply(tmpQ.setFromAxisAngle(hd.axT, c * GRIP.th2));
      src['hp.' + S] = wq(T.hp);
      src['kn.' + S] = wq(T.kn);
      src['an.' + S] = wq(T.an);
      const an = g(s, 'an');
      src['toe.' + S] = src['an.' + S].clone().multiply(tmpQ.setFromAxisAngle(V(1, 0, 0), an < 0 ? D(an) : 0));
    }
    for (const [name, info] of Object.entries(J)) {
      let q = src[name];
      if (!q) {
        // Schulterblatt: folgt dem Arm zu einem Drittel
        const S = name.split('.')[1];
        const arm = src['sh.' + S].clone().multiply(J['sh.' + S].rbindInv);
        q = src.chest.clone().slerp(arm, 0.33);
        world[name] = q;
      } else {
        world[name] = q.clone().multiply(info.rbindInv);
      }
      const b = info.bone;
      if (info.parent) b.quaternion.copy(world[info.parent]).invert().multiply(world[name]);
      else b.quaternion.copy(world[name]);
    }
  };
  return H;
}

/* ---------------- Szene je Ansicht ---------------- */
class View {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.opts = opts;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: !!opts.thumb });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(28, 1.2, 0.1, 50);
    this.az = null; this.el = 12;
    this.exId = null;
    this.colors = null;
    if (!opts.thumb) this.bindOrbit();
  }

  build(exId) {
    const def = EX[exId] || EX.custom;
    const C = (this.colors = themeColors());
    const mats = {
      body: new THREE.MeshStandardMaterial({ color: C.body, roughness: 0.62, metalness: 0 }),
      muscle: new THREE.MeshStandardMaterial({ color: C.accent, roughness: 0.5, metalness: 0, emissive: C.accent, emissiveIntensity: 0.18 }),
      metal: new THREE.MeshStandardMaterial({ color: C.metal, roughness: 0.3, metalness: 0.8 }),
      pad: new THREE.MeshStandardMaterial({ color: C.pad, roughness: 0.8 }),
      frame: new THREE.MeshStandardMaterial({ color: C.frame, roughness: 0.5, metalness: 0.4 }),
      plate: new THREE.MeshStandardMaterial({ color: C.plate, roughness: 0.7, metalness: 0.1 }),
    };
    this.mats = mats;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, C.dark ? 0x2a2622 : 0x9a948a, C.dark ? 1.5 : 1.7));
    const key = new THREE.DirectionalLight(0xffffff, C.dark ? 2.2 : 2.0);
    key.position.set(1.6, 4, 2.6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2.5, bottom: -1.5, near: 0.5, far: 10 });
    key.shadow.radius = 4;
    key.shadow.bias = -0.0005;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 0.8);
    rim.position.set(-2, 2.5, -3);
    scene.add(rim);

    // Boden: weicher Kreis + Schatten
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.6, 48), new THREE.MeshBasicMaterial({ color: C.floor, transparent: true, opacity: 0.55, map: radialTex() }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.001;
    scene.add(floor);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.ShadowMaterial({ opacity: C.dark ? 0.45 : 0.18 }));
    shadow.rotation.x = -Math.PI / 2; shadow.receiveShadow = true;
    scene.add(shadow);

    const F = buildFigure(mats);
    let A = F, H = null;
    if (HUMAN) {
      // Realistischer Körper; die Gliederpuppe bleibt unsichtbar als Treiber
      H = buildHuman(C);
      // Stangen-Übungen: Hände automatisch an der Stange ausrichten
      const eq = def.equip || [];
      H.align = eq.includes('dipbar') ? V(0, 0, 1)
        : (def.bar === 'hands' || eq.some((e) => ['pullbar', 'latseat', 'cable'].includes(e))) ? 'between' : null;
      H.paint(def.muscles);
      scene.add(H.mesh);
      A = H;
    } else {
      for (const k of def.muscles) for (const m of F.muscles[k] || []) m.material = mats.muscle;
      scene.add(F.root);
    }
    const E = buildEquip(def, mats, A);
    scene.add(E.static);
    this.scene = scene; this.F = F; this.H = H; this.A = A; this.E = E; this.def = def; this.exId = exId;
    if (this.az === null || !this.keepAz) this.az = def.view ?? 55;
    if (E.calibrate) {
      this.pose(0); const c0 = E.plateC.clone();
      this.pose(1); E.calibrate(c0, E.plateC.clone());
    }
    this.fitBox = this.computeBox();
  }

  pose(pos) {
    const def = this.def;
    const P = interpPose(def.p0, def.p1, Math.max(0, Math.min(1, pos)));
    const F = this.A, D0 = this.F, H = this.H;
    D0.root.position.set(0, 0, 0);
    applyPose(D0, P);
    D0.root.updateMatrixWorld(true);
    if (H) {
      H.drive(D0, P);
      H.root.position.set(0, 0, 0);
      H.mesh.updateMatrixWorld(true);
    }
    const at = def.at ? V(...def.at) : V(0, 0, 0);
    let off;
    const soles = (sides) => sides.flatMap((s) => [wp(F.sides[s].heel), wp(F.sides[s].toe)]);
    if (def.anchor === 'hip') off = at.clone();
    else if (def.anchor === 'hands') {
      const c = wp(F.sides.l.grip).add(wp(F.sides.r.grip)).multiplyScalar(0.5);
      off = at.clone().sub(c);
    } else if (def.anchor === 'toes') {
      const c = wp(F.sides.l.toe).add(wp(F.sides.r.toe)).multiplyScalar(0.5);
      off = at.clone().sub(c);
    } else {
      const pts = soles(def.anchor === 'lfoot' ? ['l'] : ['l', 'r']);
      const all = soles(['l', 'r']);
      const minY = Math.min(...all.map((p) => p.y));
      const c = pts.reduce((a, p) => a.add(p), V()).multiplyScalar(1 / pts.length);
      off = V(at.x - c.x, at.y - minY, at.z - c.z);
    }
    F.root.position.copy(off);
    (H ? H.mesh : F.root).updateMatrixWorld(true);
    for (const fn of this.E.dyn) fn();
    this.lastPose = P;
  }

  computeBox() {
    const box = new THREE.Box3();
    for (const t of [0, 0.5, 1]) {
      this.pose(t);
      this.scene.updateMatrixWorld(true);
      if (this.H) {
        this.H.mesh.computeBoundingBox();
        box.union(this.H.mesh.boundingBox.clone().applyMatrix4(this.H.mesh.matrixWorld));
      } else box.union(new THREE.Box3().expandByObject(this.F.root));
      if (this.E.static.children.length) box.union(new THREE.Box3().setFromObject(this.E.static));
    }
    box.min.y = Math.min(box.min.y, 0);
    return box;
  }

  fitCamera(aspect) {
    // window.__m3dFocus: nur zum Testen (Ausschnitt vergrößern)
    const box = (typeof window !== 'undefined' && window.__m3dFocus?.(this, THREE)) || this.fitBox;
    const c = box.getCenter(V());
    const az = D(this.az), el = D(this.el);
    const dir = V(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)); // Kamera-Richtung (vom Ziel weg)
    const fwd = dir.clone().negate();
    const right = V().crossVectors(fwd, V(0, 1, 0)).normalize();
    const up = V().crossVectors(right, fwd).normalize();
    const tv = Math.tan(D(this.camera.fov / 2)), th = tv * aspect;
    let dist = 0;
    for (let i = 0; i < 8; i++) {
      const p = V(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(c);
      const w = p.dot(dir);
      dist = Math.max(dist, w + Math.abs(p.dot(right)) / th, w + Math.abs(p.dot(up)) / tv);
    }
    dist *= 1.04;
    this.camera.aspect = aspect;
    this.camera.position.copy(c).addScaledVector(dir, dist);
    this.camera.lookAt(c);
    this.camera.updateProjectionMatrix();
  }

  draw(exId, pos, w, h) {
    if (exId !== this.exId || themeKey() !== this.themeKey) { this.themeKey = themeKey(); this.build(exId); }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (this.canvas.width !== W || this.canvas.height !== H) this.renderer.setSize(w, h, false), this.renderer.setPixelRatio(dpr);
    this.pose(pos);
    this.fitCamera(w / h);
    this.renderer.render(this.scene, this.camera);
  }

  bindOrbit() {
    const c = this.canvas;
    let start = null;
    c.addEventListener('pointerdown', (e) => { start = { x: e.clientX, az: this.az }; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', (e) => {
      if (!start) return;
      this.az = start.az - (e.clientX - start.x) * 0.6;
      this.keepAz = true;
    });
    const end = () => { start = null; };
    c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
    c.addEventListener('dblclick', () => { this.az = this.def?.view ?? 55; });
  }
}

let radial = null;
function radialTex() {
  if (radial) return radial;
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const x = cv.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.6, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  radial = new THREE.CanvasTexture(cv);
  radial.colorSpace = THREE.SRGBColorSpace;
  return radial;
}
const themeKey = () => humanVersion + (matchMedia('(prefers-color-scheme: dark)').matches ? 'd' : 'l') + getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();

/* ---------------- Öffentliche Schnittstelle ---------------- */
const views = new Map();
const thumbs = new Map();
let thumbView = null;

const Model3D = {
  ready: false,
  /** Figur in ein Canvas zeichnen (pos: 0 = Start, 1 = Ende der Bewegung) */
  draw(canvas, exId, pos) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    let v = views.get(canvas);
    if (!v) { v = new View(canvas); views.set(canvas, v); }
    if (v.exId !== exId) v.keepAz = false;
    v.draw(exId, pos, w, h);
  },
  /** Standbild als Daten-URL (für Listen) */
  thumb(exId, pos = 0.5) {
    const key = exId + '|' + themeKey();
    if (thumbs.has(key)) return thumbs.get(key);
    if (!thumbView) {
      const cv = document.createElement('canvas');
      thumbView = new View(cv, { thumb: true });
    }
    thumbView.keepAz = false;
    thumbView.draw(exId, pos, 144, 120);
    const url = thumbView.canvas.toDataURL('image/png');
    thumbs.set(key, url);
    return url;
  },
  exercises: EX,
  get humanReady() { return humanReady; },
  figures: FIGURES,
  get figure() { return figure; },
  /** Figur wechseln ('man' | 'woman'); zeichnet danach alle Ansichten neu */
  setFigure(name) {
    if (!FIGURES.includes(name) || name === figure) return humanReady;
    figure = name;
    try { localStorage.setItem(FIG_KEY, name); } catch (e) { /* ignore */ }
    humanReady = loadHuman(name).then(() => { if (HUMAN) window.dispatchEvent(new Event('model3d-ready')); });
    return humanReady;
  },
  /** Gelenkpositionen (zum Prüfen der Posen) */
  debug(exId, pos) {
    if (!thumbView) thumbView = new View(document.createElement('canvas'), { thumb: true });
    const v = thumbView;
    if (v.exId !== exId) { v.themeKey = themeKey(); v.build(exId); }
    v.pose(pos);
    const r = (o) => wp(o).toArray().map((n) => +n.toFixed(3));
    const A = v.A, o = { root: r(A.root), traps: r(A.traps) };
    for (const s of ['l', 'r']) for (const k of ['grip', 'heel', 'toe']) o[s + '.' + k] = r(A.sides[s][k]);
    if (v.H) for (const [n, j] of Object.entries(v.H.J)) o['J.' + n] = r(j.bone);
    return o;
  },
};

function webglOk() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (e) { return false; }
}

export { EX, buildFigure, applyPose, interpPose };

if (typeof document !== 'undefined' && webglOk()) {
  Model3D.ready = true;
  window.Model3D = Model3D;
  document.documentElement.classList.add('has-3d');
  window.dispatchEvent(new Event('model3d-ready'));
  // Sobald der realistische Körper geladen ist, Vorschaubilder neu zeichnen
  humanReady.then(() => { if (HUMAN) window.dispatchEvent(new Event('model3d-ready')); });
}
