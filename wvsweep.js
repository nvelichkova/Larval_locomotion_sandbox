// wvsweep.js — what weathervane amplitude matches the real crawl bend?
//
//   node wvsweep.js [duration_s] [seeds]
//
// Stage 13 measured per-angle crawl bend on real recordings and on the
// synthetic fixtures through one code path. Real exceeds the model by a factor
// of 1.43-1.61 in the median (2.4-3.0 degrees). Absolute degrees cannot be
// carried between the two analysis pipelines - they disagree by x1.25 on the
// median of identical data - so the target here is the RATIO.
//
// This raises `wv` and reports what the model's crawl bend does, both in truth
// (its own 12-point midline) and after the same degradation the recordings
// suffer (5 points at the tracker's arc fractions, whole pixels). The ratio
// column is relative to the default wv of 8.

const { trackTurns } = require('./bendtrack');

const R2D = 180 / Math.PI;
const MM_PER_PX = 0.117;
const ARC5 = [0, 0.29, 0.54, 0.79, 1.0];

const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

function arcs(sp) {
  const c = [0];
  for (let k = 1; k < sp.length; k++)
    c.push(c[k - 1] + Math.hypot(sp[k][0] - sp[k - 1][0], sp[k][1] - sp[k - 1][1]));
  return c;
}
function atFrac(sp, c, f) {
  const d = f * c[c.length - 1];
  let k = 1; while (k < c.length - 1 && c[k] < d) k++;
  const t = (c[k] - c[k - 1]) > 1e-9 ? (d - c[k - 1]) / (c[k] - c[k - 1]) : 0;
  return [sp[k - 1][0] + t * (sp[k][0] - sp[k - 1][0]),
          sp[k - 1][1] + t * (sp[k][1] - sp[k - 1][1])];
}
function angles(pts) {
  const out = [];
  for (let k = 1; k < pts.length - 1; k++) {
    const ax = pts[k][0] - pts[k - 1][0], ay = pts[k][1] - pts[k - 1][1];
    const bx = pts[k + 1][0] - pts[k][0], by = pts[k + 1][1] - pts[k][1];
    out.push(Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by)) * R2D);
  }
  return out;
}
const quantise = (pts) => pts.map((p) =>
  [Math.round(p[0] / MM_PER_PX) * MM_PER_PX, Math.round(p[1] / MM_PER_PX) * MM_PER_PX]);

function measure(wv, duration, seeds, postCast) {
  const t12 = [], d5 = [];
  let speed = [];
  let kept = 0, total = 0;
  for (let sd = 1; sd <= seeds; sd++) {
    const r = trackTurns({ duration, seed: sd, params: { wv } });
    if (!r.ok) return null;
    let prev = null, lastCast = -1e9;
    for (const s of r.samples) {
      if (s.state === 'cast') lastCast = s.t;
      if (s.spine) total++;
      /* a cast is followed by the bend migrating the length of the body, and
         those frames are bent. Excluding only the cast leaves the straightening
         in the crawl set, which is what the stage 13 notes found on their side. */
      if (!s.spine || s.state === 'cast' || (s.t - lastCast) < postCast) { prev = null; continue; }
      kept++;
      const c = arcs(s.spine);
      t12.push(...angles(s.spine));
      d5.push(...angles(quantise(ARC5.map((f) => atFrac(s.spine, c, f)))));
      if (prev) speed.push(Math.hypot(s.cx - prev[0], s.cy - prev[1]) / 0.05);
      prev = [s.cx, s.cy];
    }
  }
  return { t12m: mean(t12), t12d: med(t12), d5m: mean(d5), d5d: med(d5), v: med(speed),
           keep: total ? kept / total : 0 };
}

function main() {
  const duration = +(process.argv[2] || 500);
  const seeds = +(process.argv[3] || 3);
  const WV = [0, 8, 12, 16, 20, 25];

  console.log(`\nWeathervane vs crawl bend, ${duration} s x ${seeds} seeds\n`);
  console.log('  Target: the model\'s degraded crawl bend must rise by x1.43-1.61');
  console.log('  in the MEDIAN to match the real/synthetic excess measured in');
  console.log('  stage 13. Absolute degrees are not portable between the two');
  console.log('  analysis pipelines; the ratio is.\n');
  console.log('  ' + 'wv'.padStart(5) + '  truth 12pt'.padStart(14) + '    degraded 5pt+px'.padStart(20) +
              '   ratio   speed');
  console.log('  ' + 'deg'.padStart(5) + 'mean'.padStart(8) + 'median'.padStart(8) +
              'mean'.padStart(10) + 'median'.padStart(8) + 'vs wv8'.padStart(9) + '  mm/s');
  console.log('  ' + '-'.repeat(60));

  for (const pc of [0, 5, 15]) {
    console.log('\n  --- excluding ' + pc + ' s after each cast ---');
    let base = null;
    const rows = [];
    for (const wv of WV) {
      const r = measure(wv, duration, seeds, pc);
      if (!r) { console.log('  ' + String(wv).padStart(5) + '   FAILED'); continue; }
      if (wv === 8) base = r.d5d;
      rows.push([wv, r]);
    }
    for (const [wv, r] of rows) {
      console.log('  ' + String(wv).padStart(5) + r.t12m.toFixed(2).padStart(8) +
        r.t12d.toFixed(2).padStart(8) + r.d5m.toFixed(2).padStart(10) +
        r.d5d.toFixed(2).padStart(8) +
        (base ? (r.d5d / base).toFixed(2) : '-').padStart(9) +
        r.v.toFixed(3).padStart(7) + ('  keep ' + (100 * r.keep).toFixed(0) + '%'));
    }
  }
  console.log('\n  The degraded column is what an analysis of this model would');
  console.log('  report. The truth column is what the body is actually doing.\n');
}

if (require.main === module) main();
