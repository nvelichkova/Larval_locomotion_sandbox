// seglen.js — is the spacing between spine points fixed?
//
//   node seglen.js [duration_s] [seeds]
//
// Everything in the turn analysis is normalised "per segment length", and the
// synthetic control writes a `segment_length_ref_mm` to match distances against.
// That is only safe if segment length is a constant. It is not: the model
// shortens each segment as the peristaltic wave passes it,
//
//     len = SEGLEN * (1 - amp * contr(i))
//
// so at amp 0.5 a fully contracted segment is half its resting length. This
// measures what that does to (a) the twelve midline points, which sit at the
// segment boundaries, and (b) the five points a tracker fits, which sit at
// fixed FRACTIONS of arc length and so move with total body length.
//
// Run and cast are reported separately, since the question is whether the
// normaliser differs between crawling and turning.

const { trackTurns, analyse } = require('./bendtrack');

const SEGLEN = 4 / 11;
const ARC = [0, 0.29, 0.54, 0.79, 1.0];     // tracker spine fractions, head to tail

const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) * (v - m)))); };
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

/* cumulative arc length along a 12-point midline */
function arcs(sp) {
  const c = [0];
  for (let k = 1; k < sp.length; k++)
    c.push(c[k - 1] + Math.hypot(sp[k][0] - sp[k - 1][0], sp[k][1] - sp[k - 1][1]));
  return c;
}
/* point at a given fraction of total arc, the way a tracker places one */
function atFrac(sp, c, f) {
  const d = f * c[c.length - 1];
  let k = 1; while (k < c.length - 1 && c[k] < d) k++;
  const t = (c[k] - c[k - 1]) > 1e-9 ? (d - c[k - 1]) / (c[k] - c[k - 1]) : 0;
  return [sp[k - 1][0] + t * (sp[k][0] - sp[k - 1][0]),
          sp[k - 1][1] + t * (sp[k][1] - sp[k - 1][1])];
}

function main() {
  const duration = +(process.argv[2] || 600);
  const seeds = +(process.argv[3] || 3);

  const segAll = [], bodyRun = [], bodyCast = [], gapRun = [[], [], [], []], gapCast = [[], [], [], []];
  const segByState = { run: [], cast: [] };

  for (let sd0 = 1; sd0 <= seeds; sd0++) {
    const r = trackTurns({ duration, seed: sd0 });
    if (!r.ok) { console.log('FAILED ' + r.error); return; }
    for (const s of r.samples) {
      if (!s.spine) continue;
      const c = arcs(s.spine), L = c[c.length - 1];
      const casting = (s.state === 'cast');
      (casting ? bodyCast : bodyRun).push(L);
      for (let k = 1; k < s.spine.length; k++) {
        const d = c[k] - c[k - 1];
        segAll.push(d);
        if (segByState[casting ? 'cast' : 'run']) segByState[casting ? 'cast' : 'run'].push(d);
      }
      const P5 = ARC.map((f) => atFrac(s.spine, c, f));
      for (let k = 0; k < 4; k++) {
        const g = Math.hypot(P5[k + 1][0] - P5[k][0], P5[k + 1][1] - P5[k][1]);
        (casting ? gapCast : gapRun)[k].push(g);
      }
    }
  }

  const row = (lab, a) => console.log('  ' + lab.padEnd(30) +
    mean(a).toFixed(4).padStart(8) + sd(a).toFixed(4).padStart(9) +
    pct(a, 0.02).toFixed(4).padStart(9) + pct(a, 0.98).toFixed(4).padStart(9) +
    (100 * (pct(a, 0.98) - pct(a, 0.02)) / mean(a)).toFixed(1).padStart(8) + '%');

  console.log(`\nSpine-point spacing, ${duration} s x ${seeds} seeds. SEGLEN is ${SEGLEN.toFixed(4)} mm.\n`);
  console.log('  ' + ''.padEnd(30) + 'mean'.padStart(8) + 'sd'.padStart(9) +
              '2nd'.padStart(9) + '98th'.padStart(9) + '  2-98 spread');
  console.log('  ' + '-'.repeat(74));
  console.log('\n  THE MODEL\'S OWN 12 POINTS (at segment boundaries), mm');
  row('all segments', segAll);
  row('  during runs', segByState.run);
  row('  during casts', segByState.cast);

  console.log('\n  TOTAL BODY LENGTH, mm (nominal 4.0)');
  row('during runs', bodyRun);
  row('during casts', bodyCast);

  console.log('\n  A TRACKER\'S 5 POINTS (fixed arc fractions), mm between neighbours');
  for (let k = 0; k < 4; k++) row(`gap ${ARC[k]}-${ARC[k + 1]} during runs`, gapRun[k]);
  for (let k = 0; k < 4; k++) row(`gap ${ARC[k]}-${ARC[k + 1]} during casts`, gapCast[k]);

  const allRun = mean(bodyRun), allCast = mean(bodyCast);
  console.log(`\n  mean body length: runs ${allRun.toFixed(4)}, casts ${allCast.toFixed(4)} mm` +
              `  (${(100 * (allCast - allRun) / allRun).toFixed(2)}% difference)`);
  console.log(`  a "segment length" taken as L/11 is ${(allRun / 11).toFixed(4)} in a run ` +
              `and ${(allCast / 11).toFixed(4)} in a cast\n`);
}

if (require.main === module) main();
