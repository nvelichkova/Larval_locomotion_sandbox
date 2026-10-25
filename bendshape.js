// bendshape.js — how does the model's bend distribution compare with the
//                 hand-labelled 12-point data?
//
//   node bendshape.js [duration_s] [seeds]
//
// The DLC training set gives mean |bend| per boundary on a true 12-point
// midline, hand-placed at the real segment boundaries:
//
//   T1/T2 T2/T3 T3/A1 A1/A2 A2/A3 A3/A4 A4/A5 A5/A6 A6/A7 A7/Tl
//    8.14  8.51 10.78 10.80  9.83  9.37  7.42  5.29  4.56  4.91   deg
//
// Normalised, every boundary carries at least 42% of the peak. The model's
// bend profile BW = [0.15,0.35,0.35,0.15] spans `ext` boundaries and is
// EXACTLY ZERO everywhere else - but it migrates, so the time average covers
// more of the body than any single frame does. This measures the time-averaged
// shape, which is the like-for-like comparison.
//
// Those 116 frames were picked by DeepLabCut for posture diversity, so they
// are enriched for bent postures rather than being a random sample. The model
// is therefore also reported over its more strongly bent frames, selected the
// same way, so the two selections match as closely as they can.

const { trackTurns } = require('./bendtrack');

const R2D = 180 / Math.PI;
const BN = ['T1/T2','T2/T3','T3/A1','A1/A2','A2/A3','A3/A4','A4/A5','A5/A6','A6/A7','A7/Tl'];
const DLC = [8.14, 8.51, 10.78, 10.80, 9.83, 9.37, 7.42, 5.29, 4.56, 4.91];

const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);

function bendsOf(sp) {
  const out = [];
  for (let k = 1; k < sp.length - 1; k++) {
    const ux = sp[k][0] - sp[k-1][0], uy = sp[k][1] - sp[k-1][1];
    const vx = sp[k+1][0] - sp[k][0], vy = sp[k+1][1] - sp[k][1];
    out.push(Math.abs(Math.atan2(ux*vy - uy*vx, ux*vx + uy*vy)) * R2D);
  }
  return out;
}

function profile(duration, seeds, topFrac, params) {
  const frames = [];
  for (let sd = 1; sd <= seeds; sd++) {
    const r = trackTurns({ duration, seed: sd, params: params || {} });
    if (!r.ok) return null;
    for (const s of r.samples) if (s.spine) frames.push(bendsOf(s.spine));
  }
  let use = frames;
  if (topFrac < 1) {
    const idx = frames.map((b, i) => [b.reduce((x, y) => x + y, 0), i])
                      .sort((a, b) => b[0] - a[0]);
    use = idx.slice(0, Math.max(1, Math.round(frames.length * topFrac))).map(([, i]) => frames[i]);
  }
  const P = [];
  for (let k = 0; k < 10; k++) P.push(mean(use.map((b) => b[k])));
  return { P, n: use.length };
}

function show(lab, P) {
  const mx = Math.max(...P);
  console.log('  ' + lab.padEnd(26) + P.map((v) => (v / mx).toFixed(2).padStart(7)).join(''));
}

function main() {
  const duration = +(process.argv[2] || 500);
  const seeds = +(process.argv[3] || 3);
  console.log(`\nBend distribution along the body - ${duration} s x ${seeds} seeds\n`);
  console.log('  ' + ''.padEnd(26) + BN.map((b) => b.padStart(7)).join(''));
  console.log('  ' + '-'.repeat(96));
  show('hand-labelled (DLC)', DLC);
  console.log('');
  for (const [lab, f, pr] of [['model, all frames', 1, {}],
                              ['model, most-bent 25%', 0.25, {}],
                              ['model, most-bent 10%', 0.10, {}],
                              ['bexit 1, all frames', 1, { bexit: 1 }],
                              ['bexit 1, most-bent 25%', 0.25, { bexit: 1 }],
                              ['ext 8, all frames', 1, { ext: 6 }],
                              ['bexit 1 + ext 6, bent 25%', 0.25, { bexit: 1, ext: 6 }]]) {
    const r = profile(duration, seeds, f, pr);
    if (!r) { console.log('  ' + lab + ' FAILED'); continue; }
    show(lab, r.P);
  }
  console.log('\n  All rows normalised to their own maximum, so this compares SHAPE,');
  console.log('  not amplitude. The question is whether the model spreads its bend');
  console.log('  over the body the way a real larva does, or keeps it anterior.\n');
}

if (require.main === module) main();
