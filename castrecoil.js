// castrecoil.js — does the model's cast rotate the body BACKWARDS?
//
//   node castrecoil.js [duration_s] [seeds]
//
// Every rotation profile measured so far - defaults, width, grip asymmetry,
// fast migration, slow migration - is NEGATIVE over the first one to two
// segment lengths and only becomes positive later. That is not "back-loaded".
// It means the body turns the wrong way at the start of a turn.
//
// The suspected cause is recoil. During a cast the anterior sweeps to one side.
// The placement is a force balance over the whole body, so the reaction to that
// sweep is partly taken up by the posterior rotating the other way. A real
// larva's posterior is anchored by its denticles and the reaction goes into the
// substrate instead, so there is no counter-rotation.
//
// This splits each turn's rotation by state and signs it against the turn's own
// final direction. If the cast phase is systematically negative, that is the
// defect, and it is a property of the body's shape trajectory and contact
// weighting - not of the ground model.

const { trackTurns, analyse } = require('./bendtrack');

const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const R2D = 180 / Math.PI;

function run(label, params, duration, seeds) {
  const cast = [], post = [], net = [], ABS = [];
  let nPosCast = 0;
  for (let sd = 1; sd <= seeds; sd++) {
    const r = trackTurns({ duration, seed: sd, params });
    if (!r.ok) { console.log('  ' + label + ' FAILED ' + r.error); return; }
    // state per time, so cast frames can be identified inside a turn
    const st = new Map(r.samples.map((s) => [s.t.toFixed(2), s.state]));
    for (const t of analyse(r.samples)) {
      const f = t.frames.filter((x) => x.spine);
      if (f.length < 6) continue;
      const psi = (i) => Math.atan2(f[i].spine[3][1] - f[i].spine[11][1],
                                    f[i].spine[3][0] - f[i].spine[11][0]);
      const tot = wrap(psi(f.length - 1) - psi(0));
      if (Math.abs(tot) * R2D < 15) continue;
      const sgn = Math.sign(tot);
      let c = 0, p = 0;
      for (let i = 1; i < f.length; i++) {
        const d = wrap(psi(i) - psi(i - 1)) * sgn;      // + means toward the turn
        if (st.get(f[i].t.toFixed(2)) === 'cast') c += d; else p += d;
      }
      cast.push(c * R2D); post.push(p * R2D); net.push(Math.abs(tot) * R2D);
      ABS.push(Math.abs(c) * R2D);
      if (c > 0) nPosCast++;
    }
  }
  if (!net.length) { console.log('  ' + label.padEnd(22) + ' no turns'); return; }
  console.log('  ' + label.padEnd(22) +
    mean(cast).toFixed(1).padStart(10) + mean(post).toFixed(1).padStart(11) +
    mean(net).toFixed(1).padStart(10) +
    ((100 * nPosCast / net.length).toFixed(0) + '%').padStart(10) +
    mean(ABS).toFixed(1).padStart(11) +
    ((100 * mean(ABS) / mean(net)).toFixed(0) + '%').padStart(7) +
    String(net.length).padStart(5));
}

function main() {
  const duration = +(process.argv[2] || 600);
  const seeds = +(process.argv[3] || 3);
  console.log(`\nRotation during the cast, signed toward the turn - ${duration} s x ${seeds} seeds\n`);
  console.log('  A real larva reorients DURING and immediately after the cast, so the');
  console.log('  cast column should be positive and large. Negative means the body is');
  console.log('  recoiling away from the turn while the head sweeps into it.\n');
  console.log('  ' + 'condition'.padEnd(22) + 'cast deg'.padStart(10) +
              'after deg'.padStart(11) + 'net deg'.padStart(10) +
              'cast +ve'.padStart(10) + '|cast| deg'.padStart(11) +
              'share'.padStart(7) + '    n');
  console.log('  ' + '-'.repeat(88));
  run('defaults', {}, duration, seeds);
  run('hl 0.95', { hl: 0.95 }, duration, seeds);
  run('hl 1.0', { hl: 1.0 }, duration, seeds);
  run('hl 0.5', { hl: 0.5 }, duration, seeds);
  run('hl 0', { hl: 0 }, duration, seeds);
  run('mu 30', { mu: 30 }, duration, seeds);
  console.log('');
}

if (require.main === module) main();
