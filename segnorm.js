// segnorm.js — does a variable segment length move the rotation profile?
//
//   node segnorm.js [duration_s] [seeds]
//
// seglen.js shows the body is 3.35 mm while crawling and 3.92 mm while casting,
// a 17% swing, so "segment length" is not a constant. Every rotation-rate
// profile is plotted against distance crawled IN SEGMENT LENGTHS, and a turn
// runs from a cast (long body) into crawling (short body) - so the ruler
// changes along the very axis being plotted.
//
// This recomputes each turn's distance axis three ways and compares:
//
//   fixed      distance_mm / 0.3636          the nominal resting segment
//   mean       distance_mm / (mean L / 11)   one ruler per recording
//   live       integrated with the INSTANTANEOUS body length each frame
//
// `live` is the honest one. The question is how far the other two move the
// profile, and in particular the position of the half-rotation point, since
// that is what "front-loaded" means.

const { trackTurns, analyse } = require('./bendtrack');

const SEGLEN = 4 / 11;
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

const bodyLen = (sp) => {
  let L = 0;
  for (let k = 1; k < sp.length; k++) L += Math.hypot(sp[k][0] - sp[k - 1][0], sp[k][1] - sp[k - 1][1]);
  return L;
};

/* distance at which half the turn's rotation has accumulated */
function halfPoint(xs, ys) {
  for (let i = 1; i < xs.length; i++)
    if (Math.abs(ys[i]) >= 0.5) {
      const d = Math.abs(ys[i]) - Math.abs(ys[i - 1]);
      const t = d > 1e-9 ? (0.5 - Math.abs(ys[i - 1])) / d : 0;
      return xs[i - 1] + t * (xs[i] - xs[i - 1]);
    }
  return xs[xs.length - 1];
}

function main() {
  const duration = +(process.argv[2] || 600);
  const seeds = +(process.argv[3] || 3);

  // one pass to get the recording-mean body length, as an analyst would
  const Ls = [];
  const runs = [];
  for (let s = 1; s <= seeds; s++) {
    const r = trackTurns({ duration, seed: s });
    if (!r.ok) { console.log('FAILED ' + r.error); return; }
    runs.push(r);
    for (const sm of r.samples) if (sm.spine) Ls.push(bodyLen(sm.spine));
  }
  const segMean = mean(Ls) / 11;

  const H = { fixed: [], mean: [], live: [] }, TOT = { fixed: [], mean: [], live: [] };
  for (const r of runs) {
    for (const t of analyse(r.samples)) {
      const f = t.frames.filter((x) => x.spine);
      if (f.length < 6) continue;
      const psi = (i) => Math.atan2(f[i].spine[3][1] - f[i].spine[11][1],
                                    f[i].spine[3][0] - f[i].spine[11][0]);
      const net = wrap(psi(f.length - 1) - psi(0));
      if (Math.abs(net) * 180 / Math.PI < 15) continue;
      const X = { fixed: [0], mean: [0], live: [0] }, ys = [0];
      let a = 0, b = 0, c = 0;
      for (let i = 1; i < f.length; i++) {
        const dmm = Math.hypot(f[i].cx - f[i - 1].cx, f[i].cy - f[i - 1].cy);
        const Lnow = bodyLen(f[i].spine) / 11;
        a += dmm / SEGLEN; b += dmm / segMean; c += dmm / Lnow;
        X.fixed.push(a); X.mean.push(b); X.live.push(c);
        ys.push(wrap(psi(i) - psi(0)) / net);
      }
      for (const k of ['fixed', 'mean', 'live']) {
        H[k].push(halfPoint(X[k], ys));
        TOT[k].push(X[k][X[k].length - 1]);
      }
    }
  }

  console.log(`\nDistance axis under three segment-length rulers, ${duration} s x ${seeds} seeds`);
  console.log(`  nominal resting segment  ${SEGLEN.toFixed(4)} mm`);
  console.log(`  recording-mean segment   ${segMean.toFixed(4)} mm   (mean body ${(segMean*11).toFixed(3)} mm)`);
  console.log(`  n turns ${H.live.length}\n`);
  console.log('  ruler        median half-rotation point   median turn length   vs live');
  console.log('  ' + '-'.repeat(68));
  const base = med(H.live);
  for (const k of ['fixed', 'mean', 'live']) {
    const h = med(H[k]), tl = med(TOT[k]);
    console.log('  ' + k.padEnd(12) + h.toFixed(3).padStart(18) + tl.toFixed(3).padStart(21) +
                (k === 'live' ? '        -' : ((100 * (h - base) / base >= 0 ? '  +' : '  ') +
                 (100 * (h - base) / base).toFixed(1) + '%').padStart(9)));
  }
  console.log('\n  The half-rotation point is what "front-loaded" means. A ruler that');
  console.log('  is too short pushes the whole turn to larger distances and makes');
  console.log('  rotation look later than it is.\n');
}

if (require.main === module) main();
