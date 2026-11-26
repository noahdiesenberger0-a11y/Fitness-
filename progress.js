'use strict';

/* ============================================================
 *  Fortschritt: Kurve pro Übung, Rekorde, Sätze pro Muskelgruppe,
 *  Volumen pro Woche. Der Fortschritt wird in Prozent angegeben,
 *  damit er später zwischen Leuten vergleichbar ist.
 * ============================================================ */

let pgEx = '';
let pgMetric = 'e1rm';
const METRICS = {
  e1rm:   { name: 'Geschätztes 1RM', short: '1RM', unit: 'kg', get: (h) => h.e1rm },
  maxW:   { name: 'Schwerster Satz', short: 'Max.', unit: 'kg', get: (h) => h.maxW },
  volume: { name: 'Volumen', short: 'Volumen', unit: 'kg', get: (h) => h.volume },
  reps:   { name: 'Meiste Wiederholungen', short: 'Wdh.', unit: 'Wdh.', get: (h) => h.maxReps },
};

/** Übungen, die schon trainiert wurden, häufigste zuerst */
function trainedExercises() {
  const count = {};
  for (const w of state.workouts) for (const e of w.exercises) if (doneSets(e).length) {
    count[e.exId] = count[e.exId] || { n: 0, name: e.name };
    count[e.exId].n++;
  }
  return Object.entries(count).sort((a, b) => b[1].n - a[1].n).map(([id, v]) => ({ id, name: exInfo(id, v.name).name, n: v.n }));
}

function renderProgress() {
  const list = trainedExercises();
  const empty = !list.length;
  $('#pg-empty').classList.toggle('hidden', !empty);
  $('#pg-content').classList.toggle('hidden', empty);
  if (empty) return;
  if (!list.some((x) => x.id === pgEx)) pgEx = list[0].id;
  $('#pg-ex').innerHTML = list.map((x) => `<option value="${esc(x.id)}"${x.id === pgEx ? ' selected' : ''}>${esc(x.name)} (${x.n}×)</option>`).join('');
  renderExerciseChart();
  renderRecords();
  renderMuscleWeek();
  renderVolumeWeeks();
}

function renderExerciseChart() {
  const hist = exerciseHistory(pgEx);
  const bw = hist.every((h) => !h.maxW);
  const avail = bw ? ['reps'] : ['e1rm', 'maxW', 'volume'];
  if (!avail.includes(pgMetric)) pgMetric = avail[0];
  $('#pg-metric').innerHTML = avail.map((k) => `<button data-metric="${k}" class="${k === pgMetric ? 'active' : ''}">${METRICS[k].short}</button>`).join('');
  const m = METRICS[pgMetric];
  const pts = hist.map((h) => ({ date: h.date, v: m.get(h), h }));
  const first = pts[0], last = pts[pts.length - 1];
  const best = pts.reduce((b, p) => (p.v > b.v ? p : b), pts[0]);
  const change = first.v ? ((last.v - first.v) / first.v) * 100 : 0;
  const fmtV = (v) => (m.unit === 'kg' ? (pgMetric === 'volume' ? fmtKg(v) : fmtW(Math.round(v * 10) / 10) + ' kg') : `${v} Wdh.`);
  const days = Math.round((parseYmd(last.date) - parseYmd(first.date)) / 86400000);
  $('#pg-hero').innerHTML = `
    <div><div class="label">${m.name} · zuletzt</div><div class="hero-num num">${fmtV(last.v)}</div></div>
    ${pts.length > 1 ? `<div class="hero-change ${change > 0.5 ? 'up' : change < -0.5 ? 'down' : ''}">
      <b class="num">${change > 0 ? '+' : ''}${Math.round(change)} %</b>
      <span class="muted">seit ${fmtDate(first.date, { day: 'numeric', month: 'short' })} · ${days < 14 ? days + ' Tage' : Math.round(days / 7) + ' Wochen'}</span></div>` : ''}
    <div class="hero-best"><div class="label">Bestwert</div><div class="num">${fmtV(best.v)}</div></div>`;
  $('#pg-chart').innerHTML = lineChart(pts, fmtV);
  $('#pg-table').innerHTML = `<table class="data-table"><thead><tr><th>Datum</th><th>Bester Satz</th><th>${m.short}</th></tr></thead><tbody>
    ${[...pts].reverse().slice(0, 8).map((p) => `<tr data-workout="${p.h.w.id}"><td>${fmtDate(p.date, { day: 'numeric', month: 'short', year: '2-digit' })}</td>
      <td>${p.h.best ? fmtSet(p.h.best.set) : '–'}</td><td class="num">${fmtV(p.v)}</td></tr>`).join('')}</tbody></table>`;
  bindChartHover();
}

/**
 * Liniendiagramm (eine Reihe) mit Hover-Tooltip.
 * x = Zeit (echte Abstände), y beginnt nicht bei 0, damit Fortschritt sichtbar wird.
 */
function lineChart(pts, fmtV) {
  // In echter Pixelbreite zeichnen, damit Schrift und Linien nicht verzerrt werden
  const W = Math.max(280, Math.round($('#pg-chart').clientWidth || 640)), H = W < 500 ? 200 : 240, L = 40, R = 10, T = 14, B = 26;
  if (pts.length < 2) return `<p class="muted chart-note">Ab dem zweiten Training siehst du hier deine Kurve.</p>`;
  const t0 = parseYmd(pts[0].date).getTime(), t1 = parseYmd(pts[pts.length - 1].date).getTime();
  const vs = pts.map((p) => p.v);
  let lo = Math.min(...vs), hi = Math.max(...vs);
  const pad = (hi - lo) * 0.15 || hi * 0.1 || 1;
  lo = Math.max(0, lo - pad); hi += pad;
  const step = niceStep((hi - lo) / 4);
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  const x = (d) => L + ((parseYmd(d).getTime() - t0) / Math.max(1, t1 - t0)) * (W - L - R);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const grid = [];
  for (let v = lo; v <= hi + 1e-9; v += step) {
    grid.push(`<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>
      <text class="axis" x="${L - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${v >= 10000 ? Math.round(v / 1000) + 't' : fmtW(Math.round(v * 10) / 10)}</text>`);
  }
  // Monatsbeschriftung unten
  const ticks = [];
  const d0 = parseYmd(pts[0].date);
  for (let d = new Date(d0.getFullYear(), d0.getMonth() + 1, 1); d.getTime() <= t1; d.setMonth(d.getMonth() + 1)) {
    ticks.push(`<text class="axis" x="${x(ymd(d)).toFixed(1)}" y="${H - 8}" text-anchor="middle">${MONTHS[d.getMonth()]}</text>`);
  }
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const area = `${line}L${x(pts[pts.length - 1].date).toFixed(1)},${H - B}L${L},${H - B}Z`;
  const data = pts.map((p) => ({ x: +x(p.date).toFixed(1), y: +y(p.v).toFixed(1), label: fmtDate(p.date, { day: 'numeric', month: 'short' }), value: fmtV(p.v), set: p.h.best ? fmtSet(p.h.best.set) : '' }));
  const lastP = data[data.length - 1];
  return `<div class="chart-wrap">
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Verlauf, ${pts.length} Trainings" data-points='${esc(JSON.stringify(data))}'>
      ${grid.join('')}${ticks.join('')}
      <path class="area" d="${area}"/>
      <path class="line" d="${line}" vector-effect="non-scaling-stroke"/>
      <line class="cross hidden" y1="${T}" y2="${H - B}" vector-effect="non-scaling-stroke"/>
    </svg>
    <span class="dot last" style="left:${(lastP.x / W) * 100}%;top:${(lastP.y / H) * 100}%"></span>
    <span class="dot hover hidden"></span>
    <div class="tip hidden" role="status"></div>
  </div>`;
}
function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
function bindChartHover() {
  const wrap = $('#pg-chart .chart-wrap');
  if (!wrap) return;
  const svg = wrap.querySelector('svg');
  const pts = JSON.parse(svg.dataset.points);
  const W = svg.viewBox.baseVal.width, H = svg.viewBox.baseVal.height;
  const tip = wrap.querySelector('.tip'), dot = wrap.querySelector('.dot.hover'), cross = wrap.querySelector('.cross');
  const show = (clientX) => {
    const r = svg.getBoundingClientRect();
    const vx = ((clientX - r.left) / r.width) * W;
    const p = pts.reduce((b, q) => (Math.abs(q.x - vx) < Math.abs(b.x - vx) ? q : b), pts[0]);
    cross.setAttribute('x1', p.x); cross.setAttribute('x2', p.x);
    cross.classList.remove('hidden');
    dot.style.left = (p.x / W) * 100 + '%'; dot.style.top = (p.y / H) * 100 + '%';
    dot.classList.remove('hidden');
    tip.innerHTML = `<b>${p.value}</b><span>${p.label}${p.set ? ' · ' + p.set : ''}</span>`;
    tip.classList.remove('hidden');
    const left = (p.x / W) * r.width;
    tip.style.left = Math.min(Math.max(left, 70), r.width - 70) + 'px';
  };
  const hide = () => { tip.classList.add('hidden'); dot.classList.add('hidden'); cross.classList.add('hidden'); };
  wrap.addEventListener('pointermove', (e) => show(e.clientX));
  wrap.addEventListener('pointerdown', (e) => show(e.clientX));
  wrap.addEventListener('pointerleave', hide);
}

/** Rekorde: bestes geschätztes 1RM je Übung, dazu der schwerste Satz */
function computeRecords() {
  return trainedExercises().map((x) => {
    const h = exerciseHistory(x.id);
    const bw = h.every((p) => !p.maxW);
    const top = h.reduce((b, p) => ((bw ? p.maxReps : p.e1rm) > (bw ? b.maxReps : b.e1rm) ? p : b), h[0]);
    let heavy = null;
    for (const p of h) for (const st of doneSets(p.ex)) {
      if (!heavy || st.weight > heavy.weight || (st.weight === heavy.weight && st.reps > heavy.reps)) heavy = st;
    }
    return { x, bw, top, heavy, score: bw ? 0 : top.e1rm };
  }).sort((a, b) => b.score - a.score);
}
/** Kurzform zum Teilen: { exId, name, kg (≈1RM) | reps, set } */
function recordSummary(limit = 8) {
  return computeRecords().slice(0, limit).map((r) => r.bw
    ? { exId: r.x.id, name: r.x.name, reps: r.top.maxReps }
    : { exId: r.x.id, name: r.x.name, kg: Math.round(r.top.e1rm), set: fmtSet(r.heavy) });
}
/** Rekord-Zeilen (eigene oder geteilte Kurzform) */
function recordRows(list) {
  return list.map((r) => `
    <div class="pr"><div><div class="label">${esc(r.name)}</div>
      <div class="sub">${r.reps ? 'Meiste Wiederholungen' : `Schwerster Satz ${esc(r.set || '')}`}</div></div>
      <div class="value">${r.reps ? r.reps + ' Wdh.' : '≈ ' + fmtW(r.kg) + ' kg'}</div></div>`).join('');
}
function renderRecords() {
  const rows = computeRecords();
  $('#pg-records').innerHTML = rows.map((r) => `
    <div class="pr" data-pg-ex="${esc(r.x.id)}">
      <div><div class="label">${esc(r.x.name)}</div>
        <div class="sub">${r.bw ? `${r.top.maxReps} Wdh. am ${fmtDate(r.top.date, { day: 'numeric', month: 'short' })}` : `Schwerster Satz ${fmtSet(r.heavy)}`}</div></div>
      <div class="value">${r.bw ? r.top.maxReps + ' Wdh.' : '≈ ' + fmtW(Math.round(r.top.e1rm)) + ' kg'}</div>
    </div>`).join('');
}

/** Harte Sätze pro Muskelgruppe in dieser Woche, Richtwert 10–20 */
function renderMuscleWeek() {
  const from = ymd(mondayOf(today()));
  const from4 = ymd(addDays(mondayOf(today()), -28));
  const cur = {}, avg = {};
  for (const w of state.workouts) for (const e of w.exercises) {
    const g = exInfo(e.exId, e.name).group;
    const n = doneSets(e).length;
    if (w.date >= from) cur[g] = (cur[g] || 0) + n;
    else if (w.date >= from4) avg[g] = (avg[g] || 0) + n / 4;
  }
  const max = Math.max(20, ...Object.values(cur));
  $('#pg-muscles').innerHTML = Object.entries(GROUPS).map(([g, name]) => {
    const n = cur[g] || 0;
    const a = Math.round(avg[g] || 0);
    return `<div class="mg-row" title="${name}: ${n} Sätze diese Woche, Ø ${a} in den 4 Wochen davor">
      <span>${name}</span>
      <div class="mg-bar"><span class="mg-band" style="left:${(10 / max) * 100}%;width:${(10 / max) * 100}%"></span><i style="width:${(n / max) * 100}%"></i></div>
      <span class="num">${n}<small class="muted"> / Ø ${a}</small></span>
    </div>`;
  }).join('');
}

function renderVolumeWeeks() {
  const cur = mondayOf(today());
  const weeks = [];
  for (let i = 11; i >= 0; i--) {
    const start = addDays(cur, -7 * i);
    const s = ymd(start), e = ymd(addDays(start, 7));
    const vol = workoutVolume(state.workouts.filter((w) => w.date >= s && w.date < e).flatMap((w) => w.exercises));
    weeks.push({ start, vol, cur: i === 0 });
  }
  const max = Math.max(1000, ...weeks.map((w) => w.vol));
  const short = (v) => (v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1).replace('.', ',') + ' t' : Math.round(v) + '');
  $('#pg-weeks').innerHTML = weeks.map((w) => `
    <div class="wk${w.cur ? ' cur' : ''}" title="Woche ab ${w.start.toLocaleDateString('de-DE')}: ${fmtKg(w.vol)}">
      <span>${w.vol ? short(w.vol) : ''}</span>
      <i style="height:${(w.vol / max) * 100}%"></i>
      <span>${w.start.getDate()}.${w.start.getMonth() + 1}.</span>
    </div>`).join('');
}

function initProgress() {
  $('#pg-ex').addEventListener('change', (e) => { pgEx = e.target.value; renderExerciseChart(); });
  let rt = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (currentView === 'progress' && pgEx) renderExerciseChart(); }, 150);
  });
  document.addEventListener('click', (e) => {
    const m = e.target.closest('[data-metric]');
    if (m) { pgMetric = m.dataset.metric; renderExerciseChart(); return; }
    const x = e.target.closest('[data-pg-ex]');
    if (x) { pgEx = x.dataset.pgEx; $('#pg-ex').value = pgEx; renderExerciseChart(); $('#pg-ex-card').scrollIntoView({ behavior: 'smooth' }); }
  });
}
