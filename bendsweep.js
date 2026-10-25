// bendsweep.js — can the bend travel at the rate the imaging implies and
// still produce turns of the measured size?
//
//   node bendsweep.js [duration_s] [seeds]
//
// bendtrack.js measures how fast the model's bend moves down the body: about
// 0.7 boundaries per completed wave at the default migK of 0.6. Zeng et al.
// (2021) report the turn resolving over two forward waves, from around A2/A3
// to A5-A7, which implies something closer to 2.
//
// Raising migK is the obvious fix, and mech_test3.js already showed it costs
// turn amplitude: at 1.5 only about 30% of the commanded sweep is realised.
// So the question is not "which migK" but whether ANY combination of
// migration rate and cast amplitude satisfies all three constraints at once -
// travel rate, turn size, and turn rate. This varies both and reports all
// three, so the trade-off is visible rather than argued about.
//
// Measured targets: mean |turn| 30-45 deg, 1.5-3 turns/min (README section 6).

const { trackTurns, analyse } = require('./bendtrack');
const { runSim } = require('./sim');

const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((x,y)=>x+(y-m)**2,0)/Math.max(1,a.length-1)); };

/** boundaries the bend peak travels per completed wave, and where it peaks */
function travel(params, duration, seeds) {
  const steps = [], peaks = [], trails = [];
  for (let s = 1; s <= seeds; s++) {
    const r = trackTurns({ duration, seed: s, params });
    if (!r.ok) continue;
    for (const t of analyse(r.samples)) {
      const strongest = t.frames.reduce((a, b) => (b.mag > a.mag ? b : a));
      peaks.push(strongest.peak); trails.push(strongest.trail);
      const byW = {};
      t.frames.forEach((f) => { byW[f.dw] = f; });
      const ks = Object.keys(byW).map(Number).sort((a, b) => a - b);
      for (let i = 1; i < ks.length; i++)
        if (ks[i] - ks[i-1] === 1) steps.push(byW[ks[i]].peak - byW[ks[i-1]].peak);
    }
  }
  return { perWave: steps.length ? mean(steps) : NaN, n: steps.length,
           peakAt: peaks.length ? mean(peaks) : NaN,
           trailAt: trails.length ? mean(trails) : NaN };
}

/** turn size and rate from the ordinary harness */
function turns(params, duration, seeds) {
  const ang = [], rate = [];
  for (let s = 1; s <= seeds; s++) {
    const r = runSim({ duration, seed: s, params: Object.assign({ aw: 200, ah: 200 }, params),
                       track: false });
    if (!r.ok || !r.summary.mean_abs_turn_deg) continue;
    ang.push(r.summary.mean_abs_turn_deg);
    rate.push(r.summary.turns_per_min);
  }
  return { deg: mean(ang), degSd: sd(ang), rate: mean(rate), n: ang.length };
}

function main() {
  const duration = +(process.argv[2] || 600);
  const seeds = +(process.argv[3] || 3);
  const MIG = [0.6, 1.0, 1.4, 1.8];
  const CA  = [55, 80, 105];

  console.log('bend travel vs turn size, ' + seeds + ' seeds x ' + duration + 's each\n');
  console.log('  targets: travel ~2 boundaries/wave (Zeng), |turn| 30-45 deg, 1.5-3 turns/min\n');
  console.log('  migK  cast   travel/wave   peak at   |turn|        turns/min');
  console.log('  ' + '-'.repeat(62));

  const rows = [];
  for (const migK of MIG) {
    for (const ca of CA) {
      const p = { migK, ca };
      const tv = travel(p, duration, seeds);
      const tn = turns(p, duration, seeds);
      rows.push({ migK, ca, ...tv, ...tn });
      const okTravel = tv.perWave >= 1.5;
      const okDeg = tn.deg >= 30 && tn.deg <= 45;
      const okRate = tn.rate >= 1.5 && tn.rate <= 3.0;
      console.log(`  ${String(migK).padEnd(5)} ${String(ca).padEnd(5)}  ` +
        `${tv.perWave.toFixed(2).padStart(6)}${okTravel?' *':'  '}      ` +
        `${tv.peakAt.toFixed(1).padStart(4)}    ` +
        `${tn.deg.toFixed(1).padStart(5)}${okDeg?' *':'  '} ` +
        `(sd ${tn.degSd.toFixed(1).padStart(4)})  ` +
        `${tn.rate.toFixed(2).padStart(5)}${okRate?' *':'  '}`);
    }
  }

  const all = rows.filter((r) => r.perWave >= 1.5 && r.deg >= 30 && r.deg <= 45 &&
                                 r.rate >= 1.5 && r.rate <= 3.0);
  console.log('\n  * marks a value inside its target window.');
  console.log(all.length
    ? `  ${all.length} combination(s) satisfy all three: ` +
      all.map((r) => `migK ${r.migK} / cast ${r.ca}`).join(', ')
    : '  No combination satisfies all three at once.');
}

if (require.main === module) main();
