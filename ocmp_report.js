// ocmp_report.js — does the comparative-memory term do anything?
//
//   node ocmp_report.js <outdir>
//
// The comparison enters the model as a gain on the leaving drift:
//
//     drift = base(quality) * (1 + ocmp * memW * (remembered - current))
//
// so on a rich patch remembered as poor the drift is cut and the decision to
// leave should take longer; on a poor patch remembered as rich it should come
// sooner.
//
// WHY THE READ-OUT IS A RATE, NOT A TIME
//
// Residence looks like the obvious measure and is the wrong one twice over.
// It contains the walk out of the patch (~20 s, set by geometry and crawl
// speed), and worse, it is censored: a visit ends either because the
// accumulator crossed threshold ('decision') or because the larva wandered
// off the patch first ('wander'). Cutting the drift lengthens the latency,
// which makes the visit MORE likely to end by wandering - so exactly the
// visits that would show a long latency are the ones deleted from the
// decision-exit sample. Measured on the survivors, a large effect looks like
// nothing: in the first run of this contrast, rich-after-poor and
// rich-after-rich came out at 137 s and 133 s while the accumulator in
// isolation differed by 83 s.
//
// The uncensored quantity is the fraction of visits that reach a decision at
// all. Slower accumulation shows up there directly.
//
// WHY A DIFFERENCE-IN-DIFFERENCES
//
// In a mixed arena the cells are geometrically confounded: arriving at a poor
// patch after a rich one is not the same journey as arriving after another
// poor one, so the cells differ even at ocmp = 0. The g = 0 condition measures
// that confound and is subtracted from each gain.

const fs = require('fs');
const path = require('path');
const { readCsv } = require('./report');

const CELLS = ['rich_after_poor', 'rich_after_rich', 'poor_after_poor', 'poor_after_rich'];

function cellOf(v) {
  if (v.prev_quality === null || !v.quality) return null;
  return (v.quality >= 1 ? 'rich' : 'poor') + '_after_' + (v.prev_quality >= 1 ? 'rich' : 'poor');
}

/** proportion with binomial se */
function prop(d, n) {
  const p = n ? d / n : 0;
  return { d, n, p, se: n ? Math.sqrt(p * (1 - p) / n) : 0 };
}
function diff(a, b) {
  return { d: a.p - b.p, se: Math.sqrt(a.se ** 2 + b.se ** 2) };
}

function main() {
  const dir = path.resolve(process.argv[2] || '/tmp/ocmp');
  const visits = readCsv(path.join(dir, 'visits.csv'));
  const runs = readCsv(path.join(dir, 'runs.csv'));
  if (!visits.length) { console.error('no visits.csv in ' + dir); process.exit(1); }

  const gain = {};
  for (const r of runs) if (gain[r.condition] === undefined) gain[r.condition] = r.p_ocmp;
  const conds = Object.keys(gain).sort((a, b) => gain[a] - gain[b]);
  const nRun = {};
  for (const r of runs) nRun[r.condition] = (nRun[r.condition] || 0) + 1;

  console.log('comparative memory: fraction of patch visits that reach the leaving decision');
  console.log(`${runs.length} runs, ${visits.length} visits, gains ${conds.map((c) => gain[c]).join(', ')}\n`);

  const tab = {};
  for (const c of conds) {
    const tot = {}, dec = {};
    for (const k of CELLS) { tot[k] = 0; dec[k] = 0; }
    for (const v of visits) {
      if (v.condition !== c) continue;
      const k = cellOf(v);
      if (!k) continue;
      tot[k]++;
      if (v.exit_type === 'decision') dec[k]++;
    }
    tab[c] = {};
    for (const k of CELLS) tab[c][k] = prop(dec[k], tot[k]);
  }

  for (const c of conds) {
    console.log(`  ocmp = ${String(gain[c]).padEnd(4)} (${c}, ${nRun[c]} runs)`);
    for (const k of CELLS) {
      const s = tab[c][k];
      console.log(`      ${k.padEnd(16)} ${String(s.d).padStart(3)}/${String(s.n).padEnd(4)} ` +
        `${(s.p * 100).toFixed(1).padStart(5)}% ± ${(s.se * 100).toFixed(1)}`);
    }
    const rich = diff(tab[c].rich_after_poor, tab[c].rich_after_rich);
    const poor = diff(tab[c].poor_after_rich, tab[c].poor_after_poor);
    console.log(`      rich: after-poor − after-rich  ${pp(rich)}   (predicted negative)`);
    console.log(`      poor: after-rich − after-poor  ${pp(poor)}   (predicted positive)`);
    console.log('');
  }

  // subtract the gain-0 condition: that is the geometric confound
  const base = conds[0];
  if (gain[base] !== 0) {
    console.log(`  (no ocmp = 0 condition present; lowest gain is ${gain[base]}, used as baseline)\n`);
  }
  console.log(`  effect over the ocmp = ${gain[base]} baseline (difference-in-differences)\n`);
  console.log('      gain    rich (want −)              poor (want +)');
  const trend = { rich: [], poor: [] };
  for (const c of conds.slice(1)) {
    const r0 = diff(tab[base].rich_after_poor, tab[base].rich_after_rich);
    const p0 = diff(tab[base].poor_after_rich, tab[base].poor_after_poor);
    const r1 = diff(tab[c].rich_after_poor, tab[c].rich_after_rich);
    const p1 = diff(tab[c].poor_after_rich, tab[c].poor_after_poor);
    const dr = { d: r1.d - r0.d, se: Math.sqrt(r1.se ** 2 + r0.se ** 2) };
    const dp = { d: p1.d - p0.d, se: Math.sqrt(p1.se ** 2 + p0.se ** 2) };
    trend.rich.push({ g: gain[c], ...dr });
    trend.poor.push({ g: gain[c], ...dp });
    console.log(`      ${String(gain[c]).padEnd(6)}  ${dd(dr)}   ${dd(dp)}`);
  }

  console.log('\n  verdict');
  verdict('rich patches held longer when the last patch was poor', trend.rich, -1);
  verdict('poor patches abandoned sooner when the last patch was rich', trend.poor, +1);
  console.log('\n  ± is the binomial standard error. |z| under 2 is not a result either way.');
  console.log('  The gain is multiplicative on a drift the quality term has already');
  console.log('  shrunk, and a gain above ~3.6 drives it negative into the 1e-4 floor,');
  console.log('  so the effect is expected to saturate rather than grow without limit.');
}

function pp(o) {
  const z = o.se ? o.d / o.se : 0;
  return `${(o.d * 100 >= 0 ? '+' : '')}${(o.d * 100).toFixed(1).padStart(5)} pp ` +
    `(se ${(o.se * 100).toFixed(1)}, z ${z >= 0 ? '+' : ''}${z.toFixed(2)})`;
}
function dd(o) {
  const z = o.se ? o.d / o.se : 0;
  const mark = Math.abs(z) >= 2 ? ' *' : '  ';
  return `${(o.d * 100 >= 0 ? '+' : '')}${(o.d * 100).toFixed(1).padStart(5)} pp z ${z >= 0 ? '+' : ''}${z.toFixed(2)}${mark}`;
}
function verdict(label, pts, wantSign) {
  if (!pts.length) { console.log(`      ${label}: no gains to compare`); return; }
  const right = pts.filter((p) => Math.sign(p.d) === wantSign).length;
  const strong = pts.filter((p) => Math.sign(p.d) === wantSign && Math.abs(p.d / (p.se || 1)) >= 2).length;
  const biggest = pts.reduce((a, b) => (Math.abs(b.d) > Math.abs(a.d) ? b : a));
  console.log(`      ${label}`);
  console.log(`        ${right}/${pts.length} gains in the predicted direction, ${strong} with |z| >= 2; ` +
    `largest ${(biggest.d * 100 >= 0 ? '+' : '')}${(biggest.d * 100).toFixed(1)} pp at gain ${biggest.g}`);
  console.log(`        ${strong >= 1 && right === pts.length
    ? 'supported: consistent direction and at least one gain resolved'
    : right === pts.length
      ? 'consistent direction at every gain, none individually resolved'
      : 'not supported at this power'}`);
}

if (require.main === module) main();
