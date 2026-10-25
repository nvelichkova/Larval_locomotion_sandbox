// extsweep.js — is the crawl-bend shortfall about AMPLITUDE or about EXTENT?
//
//   node extsweep.js [duration_s] [seeds]
//
// Section 8h: the model's crawl is geometrically straight (true per-angle bend
// 0.00 deg median), real larvae read 1.43-1.61x higher than the model through
// the same measurement chain, and raising `wv` to its maximum buys 1.05x.
//
// Two explanations, with different consequences:
//
//   AMPLITUDE - the weathervane is simply too small. Then a bigger `wv` should
//               work, and it does not, so this is already in trouble.
//   EXTENT    - the weathervane bends only the anterior `ext` boundaries. A
//               tracked angle at arc 0.29 spans boundaries 1.6-4.5, so an
//               anterior-only bend appears in ONE of the three tracked angles
//               and is diluted threefold by averaging over them. larvaworld's
//               body has a single bend angle, so its weathervaning curves the
//               whole body trivially; ours cannot.
//
// This sweeps both. `ext` is shared with the cast, so turn statistics are
// reported alongside - whatever it buys for crawling, it is also changing turns.
//
// Nothing in the model is modified; these are existing sliders.

const { trackTurns } = require('./bendtrack');

const R2D = 180 / Math.PI;
const MM_PER_PX = 0.117;
const ARC5 = [0, 0.29, 0.54, 0.79, 1.0];
const POST_CAST = 15;          // exclude straightening, as section 8h does

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

function measure(params, duration, seeds) {
  const t12 = [], d5 = [], perAngle = [[], [], []];
  for (let sd = 1; sd <= seeds; sd++) {
    const r = trackTurns({ duration, seed: sd, params });
    if (!r.ok) return null;
    let lastCast = -1e9;
    for (const s of r.samples) {
      if (s.state === 'cast') lastCast = s.t;
      if (!s.spine || s.state === 'cast' || (s.t - lastCast) < POST_CAST) continue;
      const c = arcs(s.spine);
      t12.push(...angles(s.spine));
      const a5 = angles(quantise(ARC5.map((f) => atFrac(s.spine, c, f))));
      d5.push(...a5);
      for (let k = 0; k < 3; k++) perAngle[k].push(a5[k]);
    }
  }
  return { t12m: mean(t12), t12d: med(t12), d5d: med(d5), d5m: mean(d5),
           pa: perAngle.map(med) };
}

function main() {
  const duration = +(process.argv[2] || 500);
  const seeds = +(process.argv[3] || 3);

  console.log(`\nCrawl bend vs weathervane extent and amplitude - ${duration} s x ${seeds} seeds`);
  console.log(`Clean crawl set: casts and ${POST_CAST} s of straightening excluded.\n`);
  console.log('  Target: degraded median x1.43-1.61 over the ext 4 / wv 8 default.\n');
  console.log('  ' + 'ext'.padStart(4) + 'wv'.padStart(5) + '   truth12'.padStart(10) +
              '  degraded5'.padStart(12) + '  ratio' +
              '     median per tracked angle');
  console.log('  ' + 'bnd'.padStart(4) + 'deg'.padStart(5) + 'mean'.padStart(10) +
              'median'.padStart(12) + '       ' + '  0.29   0.54   0.79');
  console.log('  ' + '-'.repeat(72));

  let base = null;
  const out = [];
  for (const ext of [2, 4, 6]) {
    for (const wv of [8, 16, 25]) {
      const r = measure({ ext, wv }, duration, seeds);
      if (!r) { console.log('  FAILED ext ' + ext + ' wv ' + wv); continue; }
      if (ext === 4 && wv === 8) base = r.d5d;
      out.push([ext, wv, r]);
    }
  }
  for (const [ext, wv, r] of out) {
    console.log('  ' + String(ext).padStart(4) + String(wv).padStart(5) +
      r.t12m.toFixed(2).padStart(10) + r.d5d.toFixed(2).padStart(12) +
      (base ? (r.d5d / base).toFixed(2) : '-').padStart(7) + '    ' +
      r.pa.map((v) => v.toFixed(2).padStart(6)).join(' '));
  }
  console.log('\n  The per-angle columns are the discriminator. If crawl bend is');
  console.log('  confined to the thorax, the 0.29 angle carries it and the other');
  console.log('  two stay near the noise floor. If it is distributed, all three');
  console.log('  rise together. The same cut on the real recordings says which');
  console.log('  shape real crawling has.\n');
}

if (require.main === module) main();
