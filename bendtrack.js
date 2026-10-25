// bendtrack.js — where is the bend, and how fast does it travel?
//
//   node bendtrack.js [duration_s] [seeds]
//
// The literature gives two numbers the model can be checked against. Zeng et
// al. (2021), imaging muscle activity, report that during a head cast the bend
// point sits around A2/A3, and that the turn is resolved by forward waves: the
// second-to-last wave realigns segments near A2/A3, the last wave realigns
// A5-A7. The model instead starts its bend peaked at T2/T3 and moves it
// posteriorly at a rate set by `migK`.
//
// Comparing those directly is a trap. "Realign" in the imaging data is a
// segment returning to straight, which tracks the TRAILING edge of the bend,
// while `migK` moves its PEAK. This measures both, per wave, so the comparison
// is like with like.
//
// Boundaries are numbered 1..10 = T1/T2 .. A7/A8, so the A2/A3 boundary is 5
// and A5/A6 is 8.

const fs = require('fs');
const path = require('path');

const SEG = ['T1','T2','T3','A1','A2','A3','A4','A5','A6','A7','A8'];
const BOUND = [];
for (let i = 1; i < SEG.length; i++) BOUND.push(SEG[i-1] + '/' + SEG[i]);   // index 0 => boundary 1

function boundName(b) {                      // b is 1-based, may be fractional
  if (!Number.isFinite(b)) return '-';
  const i = Math.max(1, Math.min(10, b));
  const lo = Math.floor(i), hi = Math.min(10, lo + 1), f = i - lo;
  return f < 0.25 ? BOUND[lo-1] : f > 0.75 ? BOUND[hi-1] : BOUND[lo-1] + '+';
}

function buildDom() {
  const noop = () => {};
  const mk = () => new Proxy({}, { get: (_, k) =>
    k === 'canvas' ? { width: 800, height: 400 } :
    k === 'measureText' ? () => ({ width: 10 }) : noop, set: () => true });
  const rect = () => ({ width: 800, height: 400 });
  const els = {};
  const el = (id) => ({ id, value: '0', textContent: '', className: '', style: {},
    options: [], selectedIndex: -1, _h: {},
    addEventListener(k, f) { this._h[k] = f; },
    dispatchEvent(e) { const f = this._h[e.type]; if (f) f.call(this, e); },
    classList: { toggle: noop, add: noop, remove: noop, contains: () => false },
    onclick: null, getElementsByClassName: () => [], querySelectorAll: () => [],
    getAttribute: () => null, setAttribute: noop, getContext: mk,
    getBoundingClientRect: rect, appendChild: noop, click: noop,
    preventDefault: noop, focus: noop });
  return { els, document: {
    getElementById(id) { return els[id] || (els[id] = el(id)); },
    createElement(t) { return t === 'canvas'
      ? { width: 800, height: 400, getContext: mk, getBoundingClientRect: rect } : el('tmp'); },
    documentElement: {}, body: { appendChild: noop },
    querySelectorAll: () => [], querySelector: () => null, addEventListener: noop } };
}

/** run once, returning one record per turn */
function trackTurns(opt) {
  const html = fs.readFileSync(path.join(__dirname, 'larval_locomotion_sandbox.html'), 'utf8');
  const src = html.match(/<script id="model">([\s\S]*?)<\/script>/)[1];
  const dom = buildDom();
  let hook = null, rafCb = null, clock = 0;
  const prev = {};
  const set = (k, v) => { prev[k] = global[k]; global[k] = v; };
  set('window', { devicePixelRatio: 1, addEventListener: () => {} });
  set('performance', { now: () => clock * 1000 });
  set('requestAnimationFrame', (cb) => { rafCb = cb; });
  set('document', dom.document);
  set('getComputedStyle', () => ({ getPropertyValue: () => '#fff' }));
  set('Blob', function () {}); set('FileReader', function () {});
  set('URL', { createObjectURL: () => '', revokeObjectURL: () => {} });
  set('Event', function (t) { this.type = t; });
  set('__LARVA_H', 0.002);
  set('__LARVA_NODRAW', true);
  set('__LARVA_HOOK', (api) => { hook = api; });

  try {
    for (const m of html.matchAll(/<input type="range" id="(\w+)"[^>]*value="([-\d.]+)"/g))
      dom.document.getElementById(m[1]).value = m[2];
    new Function(src)();

    // spd 1 means one frame callback advances 0.05 s, matching the history step,
    // so every stored frame is seen exactly once
    const params = Object.assign({ spd: 1, seed: opt.seed, aw: 200, ah: 200 }, opt.params || {});
    for (const [k, v] of Object.entries(params)) {
      const e = dom.document.getElementById(k);
      e.value = String(v); e.dispatchEvent(new global.Event('input'));
    }
    hook.reset();

    const H = () => hook.HIST, FW = () => hook.FW;
    /* the whole midline, so heading can be recomputed on any axis afterwards */
    const spineNow = () => {
      if (!hook.hCount) return null;
      const o = FW() * hook.histAt(hook.hCount - 1), pts = [];
      for (let k = 0; k <= 11; k++) pts.push([H()[o + 3 + 2*k], H()[o + 4 + 2*k]]);
      return pts;
    };
    const bendsNow = () => {
      if (!hook.hCount) return null;
      const o = FW() * hook.histAt(hook.hCount - 1);
      const b = [];
      for (let k = 1; k <= 10; k++) b.push(H()[o + 49 + k]);
      return b;
    };

    const samples = [];     // {t, waves, state, turns, b[10]}
    let lastT = -1;
    while (hook.t < opt.duration) {
      clock += 0.05;
      const cb = rafCb; rafCb = null;
      if (!cb) break;
      cb(clock * 1000);
      const b = bendsNow();
      if (b && hook.t !== lastT) {
        lastT = hook.t;
        const c = hook.centroid();
        samples.push({ t: hook.t, waves: hook.nWaves, state: hook.state,
                       turns: hook.nTurns, psi: hook.heading(), b,
                       spine: spineNow(), cx: c[0], cy: c[1] });
      }
    }
    return { ok: true, samples, nTurns: hook.nTurns, seed: opt.seed };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  } finally {
    for (const [k, v] of Object.entries(prev))
      if (v === undefined) delete global[k]; else global[k] = v;
  }
}

/* position descriptors of one bend profile, in boundary units (1..10) */
function describe(b) {
  const a = b.map(Math.abs);
  const tot = a.reduce((x, y) => x + y, 0);
  if (tot < 1e-6) return null;
  let peakI = 0;
  for (let i = 1; i < a.length; i++) if (a[i] > a[peakI]) peakI = i;
  const peakV = a[peakI];
  // centroid, and the posterior-most boundary still carrying a fifth of the peak:
  // that is what "has not yet realigned" means in the imaging data
  let cen = 0, trail = peakI;
  for (let i = 0; i < a.length; i++) {
    cen += (i + 1) * a[i];
    if (a[i] >= 0.2 * peakV) trail = i;
  }
  return { peak: peakI + 1, centroid: cen / tot, trail: trail + 1, mag: tot };
}

function analyse(samples) {
  const turns = [];
  let cur = null;
  for (let i = 1; i < samples.length; i++) {
    const s = samples[i], p = samples[i-1];
    if (s.state === 'cast' && p.state !== 'cast') {
      cur = { tStart: s.t, wave0: s.waves, frames: [] };
    }
    if (cur) {
      if (cur.psi0 === undefined) cur.psi0 = s.psi;
      const d = describe(s.b);
      if (d) cur.frames.push({ t: s.t, dw: s.waves - cur.wave0, psi: s.psi,
                               spine: s.spine, cx: s.cx, cy: s.cy, ...d });
      // a turn is done when the bend has essentially gone
      if (cur.frames.length > 4 && (!d || d.mag < 0.02)) {
        if (cur.frames.length > 8) turns.push(cur);
        cur = null;
      }
      if (cur && s.t - cur.tStart > 60) { cur = null; }     // runaway guard
    }
  }
  return turns;
}

function main() {
  const duration = +(process.argv[2] || 900);
  const nSeed = +(process.argv[3] || 4);
  const all = [];
  for (let s = 1; s <= nSeed; s++) {
    const r = trackTurns({ duration, seed: s });
    if (!r.ok) { console.error('seed ' + s + ' failed: ' + r.error); continue; }
    analyse(r.samples).forEach((t) => all.push(t));
  }
  if (!all.length) { console.log('no turns captured'); return; }

  console.log(`${all.length} turns from ${nSeed} seeds x ${duration}s\n`);

  // where the bend is at its strongest moment
  const atPeak = all.map((t) => t.frames.reduce((a, b) => (b.mag > a.mag ? b : a)));
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = (xs) => { const m = mean(xs); return Math.sqrt(xs.reduce((a,b)=>a+(b-m)**2,0)/Math.max(1,xs.length-1)); };
  const pk = mean(atPeak.map((f) => f.peak)), ct = mean(atPeak.map((f) => f.centroid));
  console.log('  at maximum bend');
  console.log(`    peak boundary      ${pk.toFixed(2)} (${boundName(pk)})  sd ${sd(atPeak.map(f=>f.peak)).toFixed(2)}`);
  console.log(`    centroid           ${ct.toFixed(2)} (${boundName(ct)})`);
  console.log(`    trailing edge      ${mean(atPeak.map(f=>f.trail)).toFixed(2)} (${boundName(mean(atPeak.map(f=>f.trail)))})`);
  console.log('    Zeng et al. put the bend point near A2/A3 = boundary 5.\n');

  // how far it travels per completed wave after the sweep
  console.log('  travel after the sweep, by waves elapsed');
  console.log('    waves   n    peak boundary        trailing edge');
  for (let w = 0; w <= 4; w++) {
    const fr = [];
    all.forEach((t) => {
      const c = t.frames.filter((f) => f.dw === w);
      if (c.length) fr.push(c[c.length - 1]);
    });
    if (fr.length < 3) continue;
    const p = mean(fr.map((f) => f.peak)), tr = mean(fr.map((f) => f.trail));
    console.log(`      ${w}    ${String(fr.length).padStart(3)}   ${p.toFixed(2)} (${boundName(p).padEnd(6)})      ` +
                `${tr.toFixed(2)} (${boundName(tr)})`);
  }

  /* Where does the heading change actually happen? The bend has to travel to
     become rotation in this model, so the answer decides whether a faster
     migration is a fix or a contradiction: if the rotation is produced DURING
     the travel, speeding it up cannot be free. */
  const wrap = (a) => { while (a > Math.PI) a -= 2*Math.PI; while (a < -Math.PI) a += 2*Math.PI; return a; };
  console.log('\n  cumulative heading change, by waves elapsed since the sweep');
  console.log('    waves   n    mean |d heading|   share of final');
  const finals = all.map((t) => {
    const f = t.frames[t.frames.length - 1];
    return Math.abs(wrap(f.psi - t.psi0)) * 180 / Math.PI;
  });
  const finalMean = mean(finals);
  for (let w = 0; w <= 4; w++) {
    const vals = [];
    all.forEach((t) => {
      const c = t.frames.filter((f) => f.dw === w);
      if (c.length) vals.push(Math.abs(wrap(c[c.length-1].psi - t.psi0)) * 180 / Math.PI);
    });
    if (vals.length < 3) continue;
    const m = mean(vals);
    console.log(`      ${w}    ${String(vals.length).padStart(3)}      ${m.toFixed(1).padStart(5)} deg        ` +
      `${(100*m/finalMean).toFixed(0)}%`);
  }
  console.log(`    final mean |d heading| ${finalMean.toFixed(1)} deg over ${all.length} turns`);

  const perWave = [];
  all.forEach((t) => {
    const byW = {};
    t.frames.forEach((f) => { byW[f.dw] = f; });
    const ks = Object.keys(byW).map(Number).sort((a, b) => a - b);
    for (let i = 1; i < ks.length; i++)
      if (ks[i] - ks[i-1] === 1) perWave.push(byW[ks[i]].peak - byW[ks[i-1]].peak);
  });
  if (perWave.length) {
    console.log(`\n  peak travel per completed wave: ${mean(perWave).toFixed(2)} boundaries ` +
      `(sd ${sd(perWave).toFixed(2)}, n ${perWave.length})`);
    console.log('  Zeng\'s realignment sequence (A2/A3 then A5-A7 over two waves)');
    console.log('  implies roughly 2 boundaries per wave for the trailing edge.');
  }
}

if (require.main === module) main();
module.exports = { trackTurns, analyse, describe };
