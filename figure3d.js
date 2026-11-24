'use strict';

/* ============================================================
 *  3D-Übungsfigur (Test): eigene Figur mit three.js
 *
 *  Die Figur ist aus weichen, gedrehten Körperteilen gebaut
 *  (Lathe-Formen mit Muskelbauch). Pro Bild werden die Gelenke
 *  aus der Pose berechnet und jedes Körperteil zwischen zwei
 *  Gelenke gelegt. Trainierte Muskeln liegen als Akzent-Flächen
 *  auf dem Körper.
 *
 *  Einheiten: Meter. x = vorne, y = oben, z = seitlich.
 * ============================================================ */

const F3D = (() => {
  const L = { shin: 0.43, thigh: 0.45, torso: 0.50, neck: 0.11, ua: 0.29, fa: 0.26, ankleH: 0.075 };
  const HIP_W = 0.095, SHOULDER_W = 0.185;

  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const rad = (d) => (d * Math.PI) / 180;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const mix = (a, b, t) => a + (b - a) * t;

  /* ---------- Formen ---------- */

  /** Gedrehte Form entlang +Y (Länge len): r0 oben, r1 unten, Muskelbauch bei `peak`. */
  function limbGeo(len, r0, r1, bulge = 0.12, peak = 0.35, depth = 1) {
    const pts = [];
    const capN = 8;
    for (let i = 0; i <= capN; i++) { // runde Kappe am Anfang
      const a = (i / capN) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.sin(a) * r0, -Math.cos(a) * r0));
    }
    const N = 24;
    for (let i = 1; i < N; i++) {
      const u = i / N;
      const base = mix(r0, r1, u);
      const b = Math.exp(-Math.pow((u - peak) / 0.28, 2)) * bulge * r0;
      pts.push(new THREE.Vector2(base + b, u * len));
    }
    for (let i = 0; i <= capN; i++) { // runde Kappe am Ende
      const a = (i / capN) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.cos(a) * r1, len + Math.sin(a) * r1));
    }
    const g = new THREE.LatheGeometry(pts, 40);
    g.scale(depth, 1, 1);
    g.computeVertexNormals();
    return g;
  }

  /** Rumpf: Becken → Taille → Brustkorb → Schultern. Breite in z, Tiefe in x. */
  function torsoGeo() {
    const prof = [
      [0.000, 0.000], [0.110, 0.010], [0.135, 0.06], [0.140, 0.10], [0.128, 0.17],
      [0.122, 0.22], [0.135, 0.29], [0.150, 0.36], [0.158, 0.42], [0.150, 0.47],
      [0.120, 0.51], [0.070, 0.535], [0.000, 0.54],
    ].map(([r, y]) => new THREE.Vector2(r, y - 0.02));
    const g = new THREE.LatheGeometry(prof, 48);
    // Tiefe (x) flacher als Breite (z), Brust etwas nach vorn gewölbt
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const chest = Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, (y - 0.25) / 0.25))));
      const depth = x > 0 ? 0.62 + 0.12 * chest : 0.62;
      p.setXYZ(i, x * depth, y, z * 1.12);
    }
    g.computeVertexNormals();
    return g;
  }

  /* ---------- Szene ---------- */

  function create(canvas, opts = {}) {
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    const C = dark
      ? { bg: 0x161513, body: 0x8f8a82, muscle: 0xe0561c, equip: 0x3a3733, plate: 0x0f0e0d, steel: 0xb8b4ac, floor: 0x000000 }
      : { bg: 0xf6f5f2, body: 0xd2ccc2, muscle: 0xc8420c, equip: 0x5f5a52, plate: 0x24211e, steel: 0x9c978e, floor: 0x000000 };

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(C.bg);

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    const target = V(0, 0.74, 0);

    scene.add(new THREE.HemisphereLight(0xffffff, dark ? 0x30302c : 0xb9b3a8, dark ? 0.9 : 1.1));
    const key = new THREE.DirectionalLight(0xffffff, dark ? 2.0 : 2.4);
    key.position.set(2.2, 4, 2.6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -1.2, right: 1.2, top: 2.2, bottom: -0.3, near: 0.5, far: 10 });
    key.shadow.radius = 6;
    key.shadow.bias = -0.0005;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, dark ? 1.0 : 0.7);
    rim.position.set(-2.5, 2.5, -2);
    scene.add(rim);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ opacity: dark ? 0.45 : 0.16 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const mBody = new THREE.MeshStandardMaterial({ color: C.body, roughness: 0.62, metalness: 0.0 });
    const mMuscle = new THREE.MeshStandardMaterial({ color: C.muscle, roughness: 0.5, emissive: C.muscle, emissiveIntensity: 0.1 });
    const mPlate = new THREE.MeshStandardMaterial({ color: C.plate, roughness: 0.55 });
    const mSteel = new THREE.MeshStandardMaterial({ color: C.steel, roughness: 0.3, metalness: 0.8 });

    const shadowed = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
    const mesh = (g, m) => shadowed(new THREE.Mesh(g, m));

    /* Körperteile: Gruppe pro Segment, Geometrie entlang +Y */
    function segment(len, r0, r1, bulge, peak, depth) {
      const grp = new THREE.Group();
      grp.add(mesh(limbGeo(len, r0, r1, bulge, peak, depth), mBody));
      scene.add(grp);
      return grp;
    }
    /** Muskel-Auflage: Ellipsoid in Segment-Koordinaten (u = 0..1 entlang Länge). */
    function muscle(seg, len, u, size, offset) {
      const m = mesh(new THREE.SphereGeometry(1, 32, 20), mMuscle);
      m.scale.set(...size);
      m.position.set(offset[0], u * len, offset[1]);
      seg.add(m);
      return m;
    }

    const parts = {};
    const sides = { L: 1, R: -1 };
    for (const s of Object.keys(sides)) {
      const z = sides[s];
      parts['thigh' + s] = segment(L.thigh, 0.085, 0.052, 0.18, 0.3, 1);
      parts['shin' + s] = segment(L.shin, 0.055, 0.035, 0.22, 0.25, 1);
      parts['ua' + s] = segment(L.ua, 0.052, 0.038, 0.16, 0.45, 1);
      parts['fa' + s] = segment(L.fa, 0.042, 0.027, 0.18, 0.2, 0.9);
      // Quadrizeps vorne auf dem Oberschenkel (Segment zeigt nach unten → vorne = -X)
      muscle(parts['thigh' + s], L.thigh, 0.45, [0.072, 0.2, 0.074], [-0.03, 0.006 * z]);
      muscle(parts['thigh' + s], L.thigh, 0.8, [0.05, 0.09, 0.05], [-0.03, -0.022 * z]);
      // Hand + Fuß
      parts['hand' + s] = mesh(new THREE.SphereGeometry(1, 20, 14), mBody);
      parts['hand' + s].scale.set(0.045, 0.05, 0.035);
      scene.add(parts['hand' + s]);
      const foot = mesh(limbGeo(0.17, 0.042, 0.036, 0.05, 0.4, 0.62), mBody);
      foot.rotation.z = -Math.PI / 2;           // nach vorne
      const footG = new THREE.Group();
      foot.position.set(-0.05, 0, 0);
      footG.add(foot);
      parts['foot' + s] = footG;
      scene.add(footG);
      // Gelenk-Kugeln für weiche Übergänge
      parts['knee' + s] = mesh(new THREE.SphereGeometry(0.052, 24, 16), mBody); scene.add(parts['knee' + s]);
      parts['elbow' + s] = mesh(new THREE.SphereGeometry(0.039, 20, 14), mBody); scene.add(parts['elbow' + s]);
      parts['shoulder' + s] = mesh(new THREE.SphereGeometry(0.068, 24, 16), mBody); scene.add(parts['shoulder' + s]);
    }

    const torso = new THREE.Group();
    torso.add(mesh(torsoGeo(), mBody));
    // Gesäß: zwei Muskelbäuche hinten unten (Rumpf zeigt nach oben → hinten = -X)
    for (const z of [1, -1]) {
      const g = mesh(new THREE.SphereGeometry(1, 32, 20), mMuscle);
      g.scale.set(0.08, 0.1, 0.085);
      g.position.set(-0.03, 0.05, 0.06 * z);
      torso.add(g);
    }
    scene.add(torso);
    parts.neck = segment(L.neck, 0.048, 0.044, 0, 0.5, 1);
    const head = new THREE.Group();
    const skull = mesh(new THREE.SphereGeometry(0.098, 36, 24), mBody);
    skull.scale.set(1.0, 1.18, 0.92);
    skull.position.y = 0.11;
    head.add(skull);
    const jaw = mesh(new THREE.SphereGeometry(0.06, 24, 16), mBody);
    jaw.position.set(0.022, 0.06, 0);
    jaw.scale.set(1, 0.95, 1.25);
    head.add(jaw);
    scene.add(head);

    /* Langhantel */
    const bar = new THREE.Group();
    const barLen = 1.7;
    const shaft = mesh(new THREE.CylinderGeometry(0.013, 0.013, barLen, 20), mSteel);
    shaft.rotation.x = Math.PI / 2;
    bar.add(shaft);
    for (const z of [1, -1]) {
      for (const [r, w, off] of [[0.225, 0.045, 0.6], [0.17, 0.035, 0.645]]) {
        const p = mesh(new THREE.CylinderGeometry(r, r, w, 48), mPlate);
        p.rotation.x = Math.PI / 2;
        p.position.z = off * z;
        bar.add(p);
      }
      const collar = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 20), mSteel);
      collar.rotation.x = Math.PI / 2;
      collar.position.z = 0.68 * z;
      bar.add(collar);
    }
    scene.add(bar);

    /* ---------- Platzieren ---------- */
    const Y = V(), X = V(), Z = V(), M = new THREE.Matrix4(), WZ = V(0, 0, 1);
    function place(obj, a, b) {
      Y.subVectors(b, a).normalize();
      X.crossVectors(Y, WZ).normalize();
      Z.crossVectors(X, Y);
      M.makeBasis(X, Y, Z);
      obj.quaternion.setFromRotationMatrix(M);
      obj.position.copy(a);
    }
    /** Zwei-Knochen-IK: Ellbogen zwischen Schulter s und Hand h, gebeugt Richtung pole. */
    function ik(s, h, l1, l2, pole) {
      const d = V().subVectors(h, s);
      const dist = Math.min(d.length(), l1 + l2 - 1e-4);
      d.normalize();
      const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
      const hgt = Math.sqrt(Math.max(0, l1 * l1 - a * a));
      const perp = V().copy(pole).sub(V().copy(d).multiplyScalar(pole.dot(d))).normalize();
      return V().copy(s).addScaledVector(d, a).addScaledVector(perp, hgt);
    }

    /* Kniebeuge: t = 0 stehend, t = 1 tief unten */
    function squatJoints(t) {
      const as = rad(mix(2, 36, t)), at = rad(mix(2, 82, t)), ab = rad(mix(6, 40, t));
      const J = {};
      for (const [s, z] of Object.entries(sides)) {
        const ankle = V(0, L.ankleH, 0.15 * z);
        const knee = V(Math.sin(as) * L.shin, L.ankleH + Math.cos(as) * L.shin, (0.15 + 0.045 * t) * z);
        const hip = V(knee.x - Math.sin(at) * L.thigh, knee.y + Math.cos(at) * L.thigh, HIP_W * z);
        Object.assign(J, { ['ankle' + s]: ankle, ['knee' + s]: knee, ['hip' + s]: hip });
      }
      const pelvis = V().addVectors(J.hipL, J.hipR).multiplyScalar(0.5).add(V(0, 0.02, 0));
      const up = V(Math.sin(ab), Math.cos(ab), 0);
      const back = V(-Math.cos(ab), Math.sin(ab), 0);
      J.pelvis = V().copy(pelvis).addScaledVector(up, -0.06);
      J.chestTop = V().copy(J.pelvis).addScaledVector(up, L.torso + 0.02);
      const shoulderC = V().copy(J.pelvis).addScaledVector(up, L.torso - 0.06);
      J.shoulderL = V().copy(shoulderC).add(V(0, 0, SHOULDER_W));
      J.shoulderR = V().copy(shoulderC).add(V(0, 0, -SHOULDER_W));
      J.neckBase = V().copy(J.pelvis).addScaledVector(up, L.torso - 0.04);
      const headDir = V(Math.sin(ab * 0.45), Math.cos(ab * 0.45), 0);
      J.neckTop = V().copy(J.neckBase).addScaledVector(headDir, L.neck);
      // Stange auf dem oberen Rücken
      J.bar = V().copy(shoulderC).addScaledVector(back, 0.085).addScaledVector(up, 0.03);
      J.handL = V().copy(J.bar).add(V(0, 0, 0.36));
      J.handR = V().copy(J.bar).add(V(0, 0, -0.36));
      const pole = V().copy(up).multiplyScalar(-1).addScaledVector(back, 0.6).normalize();
      J.elbowL = ik(J.shoulderL, J.handL, L.ua, L.fa, pole);
      J.elbowR = ik(J.shoulderR, J.handR, L.ua, L.fa, pole);
      J.torsoAng = ab;
      J.headAng = ab * 0.45;
      return J;
    }

    function pose(J) {
      for (const s of Object.keys(sides)) {
        place(parts['thigh' + s], J['hip' + s], J['knee' + s]);
        place(parts['shin' + s], J['knee' + s], J['ankle' + s]);
        parts['knee' + s].position.copy(J['knee' + s]);
        place(parts['ua' + s], J['shoulder' + s], J['elbow' + s]);
        place(parts['fa' + s], J['elbow' + s], J['hand' + s]);
        parts['elbow' + s].position.copy(J['elbow' + s]);
        parts['shoulder' + s].position.copy(J['shoulder' + s]);
        parts['hand' + s].position.copy(J['hand' + s]);
        const f = parts['foot' + s];
        f.position.copy(J['ankle' + s]).add(V(0, -0.035, 0));
        f.rotation.y = -0.18 * sides[s];      // Fußspitzen leicht nach außen
      }
      torso.position.copy(J.pelvis);
      torso.rotation.set(0, 0, -J.torsoAng);
      place(parts.neck, J.neckBase, J.neckTop);
      head.position.copy(J.neckTop).add(V(0, -0.03, 0));
      head.rotation.set(0, 0, -J.headAng);
      bar.position.copy(J.bar);
    }

    /* ---------- Kamera: ziehen zum Drehen ---------- */
    let yaw = rad(50), pitch = rad(10), dist = 3.3, dragging = null, idle = 0;
    function updateCamera() {
      camera.position.set(
        target.x + Math.cos(pitch) * Math.cos(yaw) * dist,
        target.y + Math.sin(pitch) * dist,
        target.z + Math.cos(pitch) * Math.sin(yaw) * dist,
      );
      camera.lookAt(target);
    }
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', (e) => { dragging = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      yaw += (e.clientX - dragging.x) * 0.01;
      pitch = Math.max(rad(-5), Math.min(rad(60), pitch + (e.clientY - dragging.y) * 0.006));
      dragging = { x: e.clientX, y: e.clientY };
      idle = 0;
    });
    const stopDrag = () => { dragging = null; };
    canvas.addEventListener('pointerup', stopDrag);
    canvas.addEventListener('pointercancel', stopDrag);

    function resize() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
    }

    /* ---------- Tempo: 2 s runter, 0,3 s Pause, 1 s hoch, 0,7 s oben ---------- */
    const tempo = opts.tempo || [2, 0.3, 1, 0.7];
    const cycle = tempo.reduce((a, b) => a + b, 0);
    function phase(time) {
      let x = time % cycle;
      if (x < tempo[0]) return { t: ease(x / tempo[0]), effort: 0.35 };
      x -= tempo[0];
      if (x < tempo[1]) return { t: 1, effort: 0.6 };
      x -= tempo[1];
      if (x < tempo[2]) return { t: 1 - ease(x / tempo[2]), effort: 1 };
      return { t: 0, effort: 0.1 };
    }

    let running = true, last = performance.now(), clock = 0, glow = 0.1;
    function frame(now) {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      clock += dt;
      idle += dt;
      if (!dragging && idle > 2.5 && opts.autoRotate !== false) yaw += dt * 0.12;
      const ph = phase(clock);
      glow += (ph.effort - glow) * Math.min(1, dt * 6);
      mMuscle.emissiveIntensity = 0.05 + glow * 0.35;
      pose(squatJoints(ph.t));
      resize();
      updateCamera();
      renderer.render(scene, camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    return {
      setPose(t) { running = false; pose(squatJoints(t)); resize(); updateCamera(); renderer.render(scene, camera); },
      stop() { running = false; },
    };
  }

  return { create };
})();
