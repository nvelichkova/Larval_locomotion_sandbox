// fitturn.js — can the existing model produce the measured turn shape?
//
//   node fitturn.js [n_samples] [seeds] [duration_s]
//
// Tracking of real larvae gives the rotation rate against distance crawled,
// among turns that reach each bin (survivorship removed within the bin):
//
//   0-0.5  0.5-1  1-1.5  1.5-2   2-3    3-4    4-5    6-7
//   0.259  0.104  0.072  0.073  0.046  0.024  0.008  0.000
//
// Front-loaded and decaying to zero by about five segment lengths. The model
// at its defaults is back-loaded, peaking at 8-9. Two mechanisms were tried
// and refuted (migV, bexit), so before inventing a third this searches the
// parameters the model already has. A good fit means the gap was calibration;
// no good fit anywhere in the space means it is architecture, which is a far
// stronger statement than "the defaults do not match".
//
// Turn size and rate are scored too, so a profile match bought by destroying
// the turns themselves does not win.

const { trackTurns, analyse } = require('./bendtrack');
const { runSim } = require('./sim');

const SEGLEN = 4/11;
const BINS = [[0,0.5],[0.5,1],[1,1.5],[1.5,2],[2,3],[3,4],[4,5],[6,7]];
const REAL = [0.2587, 0.1042, 0.0716, 0.0730, 0.0462, 0.0236, 0.0083, 0.0000];
const REAL_DEG = 58.4, REAL_RATE = 2.25;      // mean |turn|, turns/min

const wrap = (a) => { while (a > Math.PI) a -= 2*Math.PI; while (a < -Math.PI) a += 2*Math.PI; return a; };
const med = (a) => { const s = a.slice().sort((x,y)=>x-y); return s.length ? s[Math.floor(s.length/2)] : NaN; };
const mean = (a) => a.reduce((x,y)=>x+y,0)/(a.length||1);

function rateProfile(params, seeds, duration) {
  const S = [];
  for (let sd = 1; sd <= seeds; sd++) {
    const r = trackTurns({ duration, seed: sd, params });
    if (!r.ok) continue;
    for (const t of analyse(r.samples)) {
      const f = t.frames.filter((x) => x.spine);
      if (f.length < 6) continue;
      const psi = (i) => Math.atan2(f[i].spine[3][1]-f[i].spine[11][1], f[i].spine[3][0]-f[i].spine[11][0]);
      const tot = wrap(psi(f.length-1) - psi(0));
      if (Math.abs(tot)*180/Math.PI < 15) continue;
      let d = 0; const xs = [0], ys = [0];
      for (let i = 1; i < f.length; i++) {
        d += Math.hypot(f[i].cx-f[i-1].cx, f[i].cy-f[i-1].cy)/SEGLEN;
        xs.push(d); ys.push(wrap(psi(i)-psi(0))/tot);
      }
      const reach = xs[xs.length-1];
      for (let i = 1; i < xs.length; i++) {
        const dx = xs[i]-xs[i-1];
        if (dx > 1e-6) S.push({ x:0.5*(xs[i]+xs[i-1]), rate:(ys[i]-ys[i-1])/dx, reach });
      }
    }
  }
  return BINS.map(([lo,hi]) => {
    const q = S.filter((v) => v.x >= lo && v.x < hi && v.reach >= hi);
    return q.length >= 8 ? med(q.map((v) => v.rate)) : null;
  });
}

function score(params, seeds, duration) {
  const prof = rateProfile(params, seeds, duration);
  if (prof.filter((v) => v !== null).length < 6) return null;
  let e = 0, n = 0;
  prof.forEach((v, i) => { if (v !== null) { e += (v - REAL[i])**2; n++; } });
  const shape = Math.sqrt(e/n);

  const deg = [], rate = [];
  for (let s = 1; s <= Math.min(3, seeds); s++) {
    const r = runSim({ duration: 900, seed: s, params: Object.assign({ aw:200, ah:200 }, params), track:false });
    if (r.ok && r.summary.mean_abs_turn_deg) { deg.push(r.summary.mean_abs_turn_deg); rate.push(r.summary.turns_per_min); }
  }
  const d = mean(deg), rt = mean(rate);
  /* penalties, so a flat profile bought by abolishing turns cannot win */
  const pDeg = Math.abs(d - REAL_DEG)/REAL_DEG;
  const pRate = Math.max(0, Math.abs(rt - REAL_RATE) - 0.55)/REAL_RATE;
  return { shape, deg:d, rate:rt, total: shape + 0.25*pDeg + 0.25*pRate, prof };
}

function mulberry32(a){return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);
  t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;};}

const VARY = {
  migK: [0.2, 2.0], migV: [0, 14], bexit: [0, 1],
  ca:   [25, 110],  cg:   [1.0, 2.0], acc: [0.15, 1.0],
  hl:   [0.3, 1.0], lift: [0.4, 1.0], mu:  [2, 30],
  sr:   [0.1, 3.0], ext:  [2, 6],     wv:  [0, 20],
};

function main() {
  const N = +(process.argv[2] || 80);
  const seeds = +(process.argv[3] || 3);
  const duration = +(process.argv[4] || 400);
  const rnd = mulberry32(99);
  const keys = Object.keys(VARY);

  const base = score({}, seeds, duration);
  console.log('  defaults: shape error ' + base.shape.toFixed(4) +
    ', |turn| ' + base.deg.toFixed(1) + ', ' + base.rate.toFixed(2) + '/min');
  console.log('  searching ' + N + ' parameter sets over ' + keys.length + ' parameters\n');

  const out = [];
  for (let i = 0; i < N; i++) {
    const p = {};
    for (const k of keys) {
      const [lo, hi] = VARY[k];
      let v = lo + rnd()*(hi-lo);
      if (k === 'bexit') v = v > 0.5 ? 1 : 0;
      if (k === 'ext') v = Math.round(v);
      p[k] = +v.toFixed(4);
    }
    const s = score(p, seeds, duration);
    if (!s) continue;
    out.push({ p, ...s });
    if ((i+1) % 10 === 0)
      console.log('   ' + (i+1) + '/' + N + '  best shape error so far ' +
        Math.min(...out.map((o) => o.total)).toFixed(4));
  }
  out.sort((a,b) => a.total - b.total);
  console.log('\n  best five by combined score\n');
  console.log('   score  shape  |turn|  /min   parameters');
  for (const o of out.slice(0,5))
    console.log('   ' + o.total.toFixed(3) + '  ' + o.shape.toFixed(3) + '  ' +
      o.deg.toFixed(1).padStart(5) + '  ' + o.rate.toFixed(2) + '   ' +
      Object.entries(o.p).map(([k,v]) => k+'='+v).join(' '));
  const b = out[0];
  console.log('\n   bin        real    best    defaults');
  BINS.forEach(([lo,hi], i) => {
    const f = (v) => v === null ? '  -   ' : v.toFixed(4).padStart(7);
    console.log('   ' + (lo+'-'+hi).padEnd(9) + REAL[i].toFixed(4).padStart(7) +
      f(b.prof[i]) + f(base.prof[i]));
  });
  require('fs').writeFileSync('/tmp/fitturn.json', JSON.stringify(out.slice(0,20), null, 1));
}
if (require.main === module) main();
