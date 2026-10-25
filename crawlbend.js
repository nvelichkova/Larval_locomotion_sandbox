// crawlbend.js — is a 23-27 degree crawl bend real, or a sampling artefact?
//
//   node crawlbend.js [duration_s] [seeds]
//
// Tracking of real larvae reports a mean per-boundary bend of 23-27 degrees
// DURING CRAWLS, which is a lot of curvature for an animal going straight. Two
// readings: either real larvae crawl far more bent than this model does (the
// weathervane is 8 degrees), or the number is inflated by the measurement.
//
// A per-boundary angle depends on how many boundaries there are. The total
// turning along the body is a property of the shape, so if ten angles share it
// each is small and if three share it each is large. The model has 12 midline
// points, so 10 interior angles; a tracker fitting 5 points has 3. That alone
// predicts a factor of about 10/3.
//
// This measures it rather than assuming it: the same crawling bodies, sampled
// at 12, 7 and 5 points, with the tracker's own arc fractions and with pixel
// quantisation, so sampling and pixels can be told apart.

const { trackTurns } = require('./bendtrack');

const R2D = 180 / Math.PI;
const MM_PER_PX = 0.117;                        // the rig's scale
const ARC5 = [0, 0.29, 0.54, 0.79, 1.0];        // the tracker's spine fractions
const ARC7 = [0, 0.17, 0.34, 0.5, 0.66, 0.83, 1.0];

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
/* interior turning angles of a polyline, in degrees */
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

function main() {
  const duration = +(process.argv[2] || 600);
  const seeds = +(process.argv[3] || 3);

  const A = { p12: [], p7: [], p5: [], p5q: [], p12sum: [], p5sum: [] };
  for (let sd = 1; sd <= seeds; sd++) {
    const r = trackTurns({ duration, seed: sd });
    if (!r.ok) { console.log('FAILED ' + r.error); return; }
    for (const s of r.samples) {
      if (!s.spine || s.state === 'cast') continue;      // crawls only
      const c = arcs(s.spine);
      const a12 = angles(s.spine);
      const p5 = ARC5.map((f) => atFrac(s.spine, c, f));
      const a5 = angles(p5);
      const a7 = angles(ARC7.map((f) => atFrac(s.spine, c, f)));
      const a5q = angles(quantise(p5));
      A.p12.push(...a12); A.p7.push(...a7); A.p5.push(...a5); A.p5q.push(...a5q);
      A.p12sum.push(a12.reduce((x, y) => x + y, 0));
      A.p5sum.push(a5.reduce((x, y) => x + y, 0));
    }
  }

  console.log(`\nPer-angle bend during CRAWLS, ${duration} s x ${seeds} seeds.`);
  console.log(`Model weathervane is 8 deg; real tracking reports 23-27 deg per boundary.\n`);
  console.log('  sampling                      angles   mean deg   median deg');
  console.log('  ' + '-'.repeat(62));
  const row = (lab, n, a) => console.log('  ' + lab.padEnd(30) + String(n).padStart(6) +
    mean(a).toFixed(2).padStart(11) + med(a).toFixed(2).padStart(13));
  row('12 points (model midline)', 10, A.p12);
  row('7 points', 5, A.p7);
  row('5 points, tracker fractions', 3, A.p5);
  row('5 points + whole pixels', 3, A.p5q);

  console.log('\n  total turning along the body (sum of interior angles), deg');
  console.log('    from 12 points  ' + mean(A.p12sum).toFixed(2));
  console.log('    from 5 points   ' + mean(A.p5sum).toFixed(2) +
              '   (' + (100 * mean(A.p5sum) / mean(A.p12sum)).toFixed(0) + '% of it recovered)');
  console.log('\n  ratio of per-angle means, 5 points / 12 points: ' +
              (mean(A.p5) / mean(A.p12)).toFixed(2) +
              '   (naive prediction 10/3 = 3.33)');
  console.log('  pixel quantisation on top of that: x' +
              (mean(A.p5q) / mean(A.p5)).toFixed(2) + '\n');
}

if (require.main === module) main();

/* ---- the noise floor: what does a PERFECTLY STRAIGHT larva read as? ----
   A straight body, at random orientations and random sub-pixel offsets,
   sampled at the tracker's arc fractions and rounded to whole pixels. Any
   angle this reports is manufactured by the measurement. */
function floorTest(lenMM, n, sg) {
  const outRaw = [], outSm = [];
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < n; i++) {
    const th = rnd() * Math.PI * 2, ox = rnd(), oy = rnd();
    const pts = ARC5.map((f) => [ox + Math.cos(th) * f * lenMM, oy + Math.sin(th) * f * lenMM]);
    outRaw.push(...angles(quantise(pts)));
    if (sg) {                                  // crude 3-point smoothing of the polyline
      const q = quantise(pts), s = q.map((p, k) => {
        if (k === 0 || k === q.length - 1) return p;
        return [(q[k-1][0] + q[k][0] + q[k+1][0]) / 3, (q[k-1][1] + q[k][1] + q[k+1][1]) / 3];
      });
      outSm.push(...angles(s));
    }
  }
  return { raw: outRaw, sm: outSm };
}

if (process.argv[4] === 'floor') {
  console.log('\nNoise floor: a PERFECTLY STRAIGHT larva, 5 points, whole pixels\n');
  console.log('  body mm   mean deg   median deg   90th pct   spatial smoothing');
  console.log('  ' + '-'.repeat(66));
  for (const L of [3.0, 3.35, 4.0, 4.5]) {
    const f = floorTest(L, 4000, true);
    const p90 = f.raw.slice().sort((a, b) => a - b)[Math.floor(0.9 * f.raw.length)];
    console.log('  ' + L.toFixed(2).padStart(7) + mean(f.raw).toFixed(2).padStart(11) +
      med(f.raw).toFixed(2).padStart(13) + p90.toFixed(2).padStart(11) +
      mean(f.sm).toFixed(2).padStart(20));
  }
  console.log('\n  Every degree here is manufactured by whole-pixel coordinates.');
  console.log('  Scale 0.117 mm/px. Subtract this floor before reading a crawl bend.\n');
}
