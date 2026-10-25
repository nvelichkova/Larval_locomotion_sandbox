// castdef.js — how much of the cast-rotation result is the cast-end DEFINITION?
//
//   node castdef.js [duration_s] [seeds]
//
// castrecoil.js reports the model's cast rotation as -2.6 deg with 5% of turns
// positive. Stage 13's truth file, on the same model's own 12-point geometry,
// reports +0.01 deg and 59% positive for the same condition and the same net
// turn. Both cannot be right about the same thing, so they are not measuring
// the same thing.
//
// The likely cause is the instant the cast is said to end:
//
//   state   castrecoil.js uses the state machine leaving 'cast'
//   sp1     stage 12 (and the brief) use the peak bend at sp1, arc 0.29 -
//           midline point 3 here. The bend starts anterior and migrates, so it
//           arrives at sp1 LATER than the cast state ends, and the window picks
//           up post-cast rotation that the state-based window excludes.
//
// This measures both windows on the same turns, so the difference is isolated.
// Rotation is signed against each turn's own final direction throughout.

const { trackTurns, analyse } = require('./bendtrack');

const R2D = 180 / Math.PI;
const wrap = (a) => { while (a > Math.PI) a -= 2*Math.PI; while (a < -Math.PI) a += 2*Math.PI; return a; };
const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const med = (a) => { const s = a.slice().sort((x,y)=>x-y); return s.length ? s[Math.floor(s.length/2)] : NaN; };

/* interior angle at midline point k, signed */
function angAt(sp, k) {
  const ux = sp[k][0]-sp[k-1][0], uy = sp[k][1]-sp[k-1][1];
  const vx = sp[k+1][0]-sp[k][0], vy = sp[k+1][1]-sp[k][1];
  return Math.atan2(ux*vy - uy*vx, ux*vx + uy*vy);
}

function run(label, params, duration, seeds) {
  const out = { state: [], sp1: [] }, net = [];
  let tEnd = { state: [], sp1: [] };
  for (let sd = 1; sd <= seeds; sd++) {
    const r = trackTurns({ duration, seed: sd, params });
    if (!r.ok) { console.log('  ' + label + ' FAILED ' + r.error); return null; }
    const st = new Map(r.samples.map((s) => [s.t.toFixed(2), s.state]));
    for (const t of analyse(r.samples)) {
      const f = t.frames.filter((x) => x.spine);
      if (f.length < 6) continue;
      const psi = (i) => Math.atan2(f[i].spine[3][1]-f[i].spine[11][1],
                                    f[i].spine[3][0]-f[i].spine[11][0]);
      const tot = wrap(psi(f.length-1) - psi(0));
      if (Math.abs(tot)*R2D < 15) continue;
      const sgn = Math.sign(tot);
      net.push(Math.abs(tot)*R2D);

      // (a) last frame whose state is still 'cast'
      let iState = 0;
      for (let i = 0; i < f.length; i++) if (st.get(f[i].t.toFixed(2)) === 'cast') iState = i;
      // (b) frame of peak |bend| at midline point 3 (arc 0.273, the model's sp1)
      let iSp1 = 0, best = -1;
      for (let i = 0; i < f.length; i++) {
        const v = Math.abs(angAt(f[i].spine, 3));
        if (v > best) { best = v; iSp1 = i; }
      }
      out.state.push(wrap(psi(iState) - psi(0)) * sgn * R2D);
      out.sp1.push(wrap(psi(iSp1) - psi(0)) * sgn * R2D);
      tEnd.state.push(f[iState].t - f[0].t);
      tEnd.sp1.push(f[iSp1].t - f[0].t);
    }
  }
  if (!net.length) { console.log('  ' + label.padEnd(20) + ' no turns'); return null; }
  for (const k of ['state', 'sp1']) {
    const v = out[k];
    console.log('  ' + (label + ', ' + k).padEnd(28) +
      mean(v).toFixed(2).padStart(9) + med(v).toFixed(2).padStart(9) +
      ((100*v.filter((x)=>x>0).length/v.length).toFixed(0)+'%').padStart(9) +
      mean(v.map(Math.abs)).toFixed(2).padStart(9) +
      mean(tEnd[k]).toFixed(2).padStart(9) +
      mean(net).toFixed(1).padStart(8) + String(v.length).padStart(6));
  }
  return out;
}

function main() {
  const duration = +(process.argv[2] || 600);
  const seeds = +(process.argv[3] || 3);
  console.log(`\nCast rotation under two cast-end definitions - ${duration} s x ${seeds} seeds\n`);
  console.log('  Signed toward each turn\'s own final direction. Real larvae, measured');
  console.log('  through five points with the sp1 definition: +1.72 deg, 66% positive,');
  console.log('  net 58.9 deg over 156 turns.\n');
  console.log('  ' + 'condition, cast-end def'.padEnd(28) + 'mean'.padStart(9) +
    'median'.padStart(9) + '+ve'.padStart(9) + '|mean|'.padStart(9) +
    'dur s'.padStart(9) + 'net'.padStart(8) + '     n');
  console.log('  ' + '-'.repeat(88));
  run('bexit 0 (fixture build)', { bexit: 0 }, duration, seeds);
  console.log('');
  run('bexit 1 (current default)', { bexit: 1 }, duration, seeds);
  console.log('');
  run('migK 1.4, bexit 0', { migK: 1.4, bexit: 0 }, duration, seeds);
  console.log('');
  run('migK 1.4, bexit 1', { migK: 1.4, bexit: 1 }, duration, seeds);
  console.log('\n  If the two rows of a pair differ, the cast-end instant is doing the');
  console.log('  work, not the mechanics. The sp1 row is the one comparable with the');
  console.log('  tracking result.\n');
}

if (require.main === module) main();
