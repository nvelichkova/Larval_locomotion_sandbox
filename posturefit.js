// posturefit.js — fit the postural curvature to the two measured targets.
//
//   node posturefit.js [duration_s] [seeds]
//
// Section 8j measured real crawling two ways, with a straight-body null moved
// along the larvae's own paths as the reference:
//
//   per-angle bend above that null   +3.0 to +6.1 deg (median, 5 points)
//   autocorrelation of signed bend   lag-1 0.29-0.66, below 0.2 by 8-22 frames
//
// The model had neither: its crawl is geometrically straight, so its runs are
// straight lines. `cbs` (sd of body-wide curvature) and `cbt` (how long a curve
// is held) are swept against both targets at once, because either alone is easy
// to hit and meaningless - a fast wobble can match the amplitude with no
// persistence, and a slow drift can match the persistence with no amplitude.
//
// Everything is measured through the same degradation the recordings suffer:
// five points at the tracker's arc fractions, whole pixels at 0.117 mm/px.

const { trackTurns } = require('./bendtrack');

const R2D = 180 / Math.PI;
const MM_PER_PX = 0.117;
const ARC5 = [0, 0.29, 0.54, 0.79, 1.0];
const POST_CAST = 15;
const FPS = 10;                      // tracking rate the targets were measured at

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
/* signed interior angles */
function angles(pts) {
  const out = [];
  for (let k = 1; k < pts.length - 1; k++) {
    const ax = pts[k][0] - pts[k - 1][0], ay = pts[k][1] - pts[k - 1][1];
    const bx = pts[k + 1][0] - pts[k][0], by = pts[k + 1][1] - pts[k][1];
    out.push(Math.atan2(ax * by - ay * bx, ax * bx + ay * by) * R2D);
  }
  return out;
}
const quantise = (pts) => pts.map((p) =>
  [Math.round(p[0] / MM_PER_PX) * MM_PER_PX, Math.round(p[1] / MM_PER_PX) * MM_PER_PX]);

/* Pearson autocorrelation at lag k over contiguous runs only */
function autocorr(runs, k) {
  let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (const r of runs) {
    for (let i = 0; i + k < r.length; i++) {
      const x = r[i], y = r[i + k];
      n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
    }
  }
  if (n < 20) return NaN;
  const cov = sxy / n - (sx / n) * (sy / n);
  const vx = sxx / n - (sx / n) ** 2, vy = syy / n - (sy / n) ** 2;
  return (vx > 1e-12 && vy > 1e-12) ? cov / Math.sqrt(vx * vy) : NaN;
}

function measure(params, duration, seeds) {
  const absA = [[], [], []];
  const runsA = [[], [], []];
  for (let sd = 1; sd <= seeds; sd++) {
    const r = trackTurns({ duration, seed: sd, params });
    if (!r.ok) return null;
    let lastCast = -1e9, cur = [[], [], []], lastT = -1e9;
    const flush = () => { for (let k = 0; k < 3; k++) { if (cur[k].length > 3) runsA[k].push(cur[k]); cur[k] = []; } };
    for (const s of r.samples) {
      if (s.state === 'cast') lastCast = s.t;
      const inSet = s.spine && s.state !== 'cast' && (s.t - lastCast) >= POST_CAST;
      if (!inSet) { flush(); continue; }
      // decimate the 20 Hz history to the tracker's 10 fps
      if (s.t - lastT < 1 / FPS - 1e-9) continue;
      if (lastT > -1e8 && s.t - lastT > 1.5 / FPS) flush();
      lastT = s.t;
      const c = arcs(s.spine);
      const a5 = angles(quantise(ARC5.map((f) => atFrac(s.spine, c, f))));
      for (let k = 0; k < 3; k++) { absA[k].push(Math.abs(a5[k])); cur[k].push(a5[k]); }
    }
    flush();
  }
  const lag = (k) => [0, 1, 2].map((i) => autocorr(runsA[i], k));
  const firstBelow = (i) => {
    for (let k = 1; k <= 30; k++) { const v = autocorr(runsA[i], k); if (!(v >= 0.2)) return k; }
    return 99;
  };
  return { medA: absA.map(med), l1: lag(1), l5: lag(5), l10: lag(10),
           fb: [0, 1, 2].map(firstBelow) };
}

function row(lab, r) {
  if (!r) { console.log('  ' + lab.padEnd(18) + ' FAILED'); return; }
  console.log('  ' + lab.padEnd(18) +
    r.medA.map((v) => v.toFixed(2).padStart(6)).join('') + '  ' +
    r.l1.map((v) => v.toFixed(2).padStart(6)).join('') + '  ' +
    r.fb.map((v) => (v === 99 ? '>30' : String(v)).padStart(4)).join(''));
}

function main() {
  const duration = +(process.argv[2] || 600);
  const seeds = +(process.argv[3] || 3);
  console.log(`\nPostural curvature against the two measured targets - ${duration} s x ${seeds} seeds\n`);
  console.log('  Measured through 5 points + whole pixels, crawl frames only.');
  console.log('  Real larvae, above a straight-body null on their own paths:');
  console.log('    per-angle median excess  +4.5 / +3.2 / +3.7  (amiGA)   +6.1 / +3.0 / +4.9  (w1118)');
  console.log('    autocorr lag-1           0.62 / 0.44 / 0.29  (amiGA)   0.66 / 0.63 / 0.51  (w1118)');
  console.log('    first lag below 0.2      17 / 22 / 9                   8 / 13 / >30\n');
  console.log('  ' + 'cbs   cbt'.padEnd(18) + '   median |bend| deg' + '      autocorr lag-1' + '   first<0.2');
  console.log('  ' + ''.padEnd(18) + '  sp1   sp2   sp3' + '     sp1   sp2   sp3' + '   1   2   3');
  console.log('  ' + '-'.repeat(74));
  row('off (baseline)', measure({ cbs: 0 }, duration, seeds));
  console.log('');
  for (const cbt of [0.8, 1.2, 2.0]) {
    for (const cbs of [28, 36, 44]) {
      row(`${cbs}   ${cbt.toFixed(1)}`, measure({ cbs, cbt }, duration, seeds));
    }
    console.log('');
  }
  console.log('  The baseline row is pure measurement artefact: the model\'s crawl is');
  console.log('  straight, so its median bend there is the pixel floor and its');
  console.log('  autocorrelation is whatever the floor carries.\n');
}

if (require.main === module) main();
