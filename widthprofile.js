// widthprofile.js — does bilateral grip asymmetry front-load the rotation?
//
//   node widthprofile.js [duration_s] [seeds]
//
// Turn size and turn rate (the sweep in the terminal) are gross statistics and
// barely move with width, but they cannot see WHERE in a turn the rotation
// happens, which is the thing that does not match. Tracking of real larvae
// gives the rotation rate against distance crawled, among turns that reach
// each bin:
//
//   0-0.5  0.5-1  1-1.5  1.5-2   2-3    3-4    4-5
//   0.259  0.104  0.072  0.073  0.046  0.024  0.008
//
// Front-loaded, decaying to zero by about five segment lengths. The line body
// is back-loaded. 8e showed 90% of its rotation is produced by the bend
// TRAVELLING, so every existing parameter trades shape against size.
//
// Asymmetric grip is the one mechanism that should raise rotation per unit of
// bend travel instead, so this is where it has to show up or not at all.
// `still` is the share of rotation produced while the bend is not migrating -
// if asymmetry is doing what it should, that share rises.

const { trackTurns, analyse } = require('./bendtrack');

const SEGLEN = 4 / 11;
const BINS = [[0, 0.5], [0.5, 1], [1, 1.5], [1.5, 2], [2, 3], [3, 4], [4, 5]];
const REAL = [0.259, 0.104, 0.072, 0.073, 0.046, 0.024, 0.008];

const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

function profile(params, duration, seeds) {
  const S = [];
  let nT = 0, tot = 0, still = 0, moving = 0;
  for (let sd = 1; sd <= seeds; sd++) {
    const r = trackTurns({ duration, seed: sd, params });
    if (!r.ok) return { err: r.error };
    for (const t of analyse(r.samples)) {
      const f = t.frames.filter((x) => x.spine);
      if (f.length < 6) continue;
      const psi = (i) => Math.atan2(f[i].spine[3][1] - f[i].spine[11][1],
                                    f[i].spine[3][0] - f[i].spine[11][0]);
      const net = wrap(psi(f.length - 1) - psi(0));
      if (Math.abs(net) * 180 / Math.PI < 15) continue;
      nT++; tot += Math.abs(net) * 180 / Math.PI;
      let d = 0; const xs = [0], ys = [0];
      for (let i = 1; i < f.length; i++) {
        d += Math.hypot(f[i].cx - f[i - 1].cx, f[i].cy - f[i - 1].cy) / SEGLEN;
        xs.push(d); ys.push(wrap(psi(i) - psi(0)) / net);
        const dp = Math.abs(wrap(psi(i) - psi(i - 1)));
        if (Math.abs(f[i].centroid - f[i - 1].centroid) < 0.01) still += dp; else moving += dp;
      }
      const reach = xs[xs.length - 1];
      for (let i = 1; i < xs.length; i++) {
        const dx = xs[i] - xs[i - 1];
        if (dx > 1e-6) S.push({ x: 0.5 * (xs[i] + xs[i - 1]), rate: (ys[i] - ys[i - 1]) / dx, reach });
      }
    }
  }
  const prof = BINS.map(([lo, hi]) => {
    const q = S.filter((v) => v.x >= lo && v.x < hi && v.reach >= hi);
    return q.length >= 8 ? med(q.map((v) => v.rate)) : null;
  });
  return { prof, nT, turn: tot / (nT || 1), still: still / ((still + moving) || 1) };
}

function show(label, params, duration, seeds) {
  const r = profile(params, duration, seeds);
  if (r.err) { console.log('  ' + label.padEnd(26) + ' FAILED ' + r.err); return; }
  const cells = r.prof.map((v) => v === null ? '    -  ' : (v >= 0 ? '+' : '') + v.toFixed(3));
  // front share: how much of the profile mass sits in the first segment length
  const fin = r.prof.filter((v) => v !== null);
  console.log('  ' + label.padEnd(26) + cells.map((c) => c.padStart(8)).join('') +
    '   |' + r.turn.toFixed(1).padStart(6) + '  n' + String(r.nT).padStart(4) +
    '  still ' + (100 * r.still).toFixed(0) + '%');
}

function main() {
  const duration = +(process.argv[2] || 500);
  const seeds = +(process.argv[3] || 3);
  console.log(`\nRotation rate by distance crawled - ${duration} s x ${seeds} seeds\n`);
  console.log('  ' + 'condition'.padEnd(26) +
    BINS.map(([lo, hi]) => (lo + '-' + hi).padStart(8)).join('') + '   | |turn|      n');
  console.log('  ' + '-'.repeat(26 + 8 * BINS.length + 22));
  console.log('  ' + 'REAL LARVAE'.padEnd(26) +
    REAL.map((v) => ('+' + v.toFixed(3)).padStart(8)).join('') + '   |  58.4');
  console.log('');
  const only = process.argv[4];
  if (only === 'migv') {
    show('defaults (migK 0.6)', {}, duration, seeds);
    console.log('');
    for (const migV of [1, 2, 4, 8, 16])
      show(`migV ${migV}`, { migV }, duration, seeds);
    console.log('');
    for (const migK of [1.0, 1.5, 2.0, 3.0])
      show(`migK ${migK.toFixed(1)}`, { migK }, duration, seeds);
    console.log('');
    return;
  }
  show('line body (rsp 0)', { rsp: 0 }, duration, seeds);
  for (const rsp of [0.15, 0.30]) {
    console.log('');
    for (const asym of [0, 0.5, 1.0, 2.0])
      show(`rsp ${rsp.toFixed(2)}  asym ${asym.toFixed(1)}`, { rsp, asym }, duration, seeds);
  }
  console.log('');
}

if (require.main === module) main();
