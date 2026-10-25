// headingaxes.js — the model's headline number is not one number.
//
//   node headingaxes.js [duration_s] [seeds]
//
// "What fraction of a turn's heading change happens during the sweep" depends
// on which body axis defines heading, and the tracking analysis has to use the
// same axis for the comparison to mean anything. The model reports 0.20 on its
// own axis; this computes it on every axis the tracking data could offer, so
// the two can be matched rather than assumed equivalent.
//
// Midline points are 0 (head) to 11 (tail), equally spaced along a 4 mm body
// of 11 segments, so point k sits at arc fraction k/11 from the head and the
// axis tail->k spans the posterior (11-k)/11 of the animal.

const { trackTurns, analyse } = require('./bendtrack');

const wrap = (a) => { while (a > Math.PI) a -= 2*Math.PI; while (a < -Math.PI) a += 2*Math.PI; return a; };
const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const med = (a) => { const s = a.slice().sort((x,y)=>x-y); return s.length ? s[Math.floor(s.length/2)] : NaN; };

function psiOf(spine, k) {
  return Math.atan2(spine[k][1] - spine[11][1], spine[k][0] - spine[11][0]);
}

function main() {
  const duration = +(process.argv[2] || 600);
  const seeds = +(process.argv[3] || 4);
  const turns = [];
  for (let s = 1; s <= seeds; s++) {
    const r = trackTurns({ duration, seed: s });
    if (!r.ok) continue;
    analyse(r.samples).forEach((t) => { if (t.frames.length > 8 && t.frames[0].spine) turns.push(t); });
  }
  if (!turns.length) { console.log('no turns'); return; }

  // sweep end = frame of maximum head angle; approximated here by maximum
  // total bend in the first third, which is when the sweep is at its widest
  const rows = [];
  const AX = [0, 1, 2, 3, 4, 6, 8, 9, 10];
  for (const k of AX) {
    const fracs = [], tots = [];
    for (const t of turns) {
      const f = t.frames;
      /* sweep end = frame of maximum |head angle| within the first sweep, the
         same definition the tracking analysis uses: head angle is the angle
         from the posterior axis to the anterior axis (model: headDir uses
         p0->p2, heading uses tail->p3). Using maximum total bend instead puts
         sweep-end during the migration and inflates the fraction. */
      let iPk = 0, best = -1;
      for (let i = 0; i < f.length; i++) {
        const sp = f[i].spine;
        const hd = Math.atan2(sp[0][1]-sp[2][1], sp[0][0]-sp[2][0]);
        const ax = Math.atan2(sp[3][1]-sp[11][1], sp[3][0]-sp[11][0]);
        const ha = Math.abs(wrap(hd - ax));
        if (ha > best) { best = ha; iPk = i; }
        else if (best > 0.35 && ha < best * 0.6) break;   // first sweep only
      }
      const p0 = psiOf(f[0].spine, k);
      const pS = psiOf(f[iPk].spine, k);
      const pE = psiOf(f[f.length-1].spine, k);
      const dS = wrap(pS - p0), dT = wrap(pE - p0);
      if (Math.abs(dT) * 180 / Math.PI < 15) continue;      // same 15 deg floor
      fracs.push(Math.abs(dS) / Math.abs(dT));
      tots.push(Math.abs(dT) * 180 / Math.PI);
    }
    if (fracs.length < 5) continue;
    rows.push({ k, arc: k/11, spans: (11-k)/11, n: fracs.length,
                mean: mean(fracs), med: med(fracs), tot: mean(tots) });
  }

  console.log(`model heading-axis sensitivity, ${turns.length} turns ` +
              `(${seeds} seeds x ${duration}s)\n`);
  console.log('  axis            arc of    body     n    frac in sweep     mean |dpsi|');
  console.log('  tail->point     front pt  spanned        mean   median       total');
  console.log('  ' + '-'.repeat(68));
  for (const r of rows)
    console.log(`  tail->p${String(r.k).padEnd(2)}        ${r.arc.toFixed(2)}      ` +
      `${(100*r.spans).toFixed(0).padStart(3)}%   ${String(r.n).padStart(3)}    ` +
      `${r.mean.toFixed(2)}   ${r.med.toFixed(2)}        ${r.tot.toFixed(1)} deg`);
  console.log('\n  The model\'s own heading() is tail->p3 (arc 0.27, posterior 73%).');
  console.log('  FIM-Track 5-point spines give sp1 ~0.29, sp2 ~0.54, sp3 ~0.79,');
  console.log('  so tail->sp1 ~ tail->p3, tail->sp2 ~ tail->p6, tail->sp3 ~ tail->p9.');
}

if (require.main === module) main();
