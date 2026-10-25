// rotsource.js — where does the model's rotation actually come from?
//
//   node rotsource.js [duration_s] [seeds]
//
// The claim under test is that in this model rotation is produced by the bend
// TRAVELLING along the body: the shape changes, the weighted Procrustes fit is
// re-solved, and the rotation is whatever that fit demands. If that is right,
// rotation accumulated while the bend's position is static should be close to
// zero, and the only way to rotate more is to move the bend further.
//
// If it is wrong — if a substantial share of rotation happens while the bend
// sits still, driven by amplitude growth alone — then the architecture is not
// as constrained as I said, and an asymmetry mechanism is not required to
// explain front-loaded rotation.
//
// Per frame step: dpsi, d(bend centroid in boundary units), d(crawl in seglen).
// Steps are split on whether the bend moved.

const { trackTurns, analyse } = require('./bendtrack');

const SEGLEN = 4 / 11;
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const sum = (a) => a.reduce((x, y) => x + y, 0);

function probe(label, params, duration, seeds) {
  let nT = 0;
  const acc = { still: 0, moving: 0, stillT: 0, movingT: 0, stillD: 0, movingD: 0 };
  const tot = [];
  for (let sd = 1; sd <= seeds; sd++) {
    const r = trackTurns({ duration, seed: sd, params });
    if (!r.ok) { console.log('  ' + label + ': FAILED ' + r.error); return null; }
    for (const t of analyse(r.samples)) {
      const f = t.frames.filter((x) => x.spine);
      if (f.length < 6) continue;
      const psi = (i) => Math.atan2(f[i].spine[3][1] - f[i].spine[11][1],
                                    f[i].spine[3][0] - f[i].spine[11][0]);
      const net = wrap(psi(f.length - 1) - psi(0));
      if (Math.abs(net) * 180 / Math.PI < 15) continue;
      nT++;
      tot.push(Math.abs(net) * 180 / Math.PI);
      for (let i = 1; i < f.length; i++) {
        const dp = Math.abs(wrap(psi(i) - psi(i - 1)));
        const db = Math.abs(f[i].centroid - f[i - 1].centroid);
        const dt = f[i].t - f[i - 1].t;
        const dd = Math.hypot(f[i].cx - f[i - 1].cx, f[i].cy - f[i - 1].cy) / SEGLEN;
        // "still" = the bend centroid moved less than a hundredth of a boundary
        if (db < 0.01) { acc.still += dp; acc.stillT += dt; acc.stillD += dd; }
        else { acc.moving += dp; acc.movingT += dt; acc.movingD += dd; }
      }
    }
  }
  const all = acc.still + acc.moving;
  if (!all) { console.log('  ' + label + ': no turns'); return null; }
  const deg = (r) => (r * 180 / Math.PI).toFixed(1);
  console.log(`  ${label}`);
  console.log(`    ${nT} turns, mean |turn| ${(sum(tot) / tot.length).toFixed(1)} deg`);
  console.log(`    rotation while bend STILL   ${deg(acc.still).padStart(8)} deg  ` +
              `${(100 * acc.still / all).toFixed(1)}% of all rotation  ` +
              `over ${acc.stillT.toFixed(0)} s, ${acc.stillD.toFixed(1)} seglen crawled`);
  console.log(`    rotation while bend MOVING  ${deg(acc.moving).padStart(8)} deg  ` +
              `${(100 * acc.moving / all).toFixed(1)}%  ` +
              `over ${acc.movingT.toFixed(0)} s, ${acc.movingD.toFixed(1)} seglen crawled`);
  if (acc.stillT > 0.1 && acc.movingT > 0.1)
    console.log(`    rate: still ${deg(acc.still / acc.stillT)} deg/s, ` +
                `moving ${deg(acc.moving / acc.movingT)} deg/s`);
  return { nT, still: acc.still / all };
}

function main() {
  const duration = +(process.argv[2] || 600);
  const seeds = +(process.argv[3] || 3);
  console.log(`\nWhere does rotation come from? ${duration} s x ${seeds} seeds\n`);
  console.log('  A frame step counts as "bend still" if the bend profile centroid');
  console.log('  moved < 0.01 boundary units. If rotation needs bend travel, the');
  console.log('  still share should be small.\n');
  probe('defaults', {}, duration, seeds);
  console.log('');
  probe('migK 0 (no distance-coupled migration)', { migK: 0 }, duration, seeds);
  console.log('');
  probe('migK 0.6, migV 0 - explicit, as a control', { migK: 0.6, migV: 0 }, duration, seeds);
  console.log('');
}

if (require.main === module) main();
