// Split patch residence by current and previous patch quality, from a sweep's
// visits.csv. Replaces comp.js, which drove the old broken-seed harness.
const { readCsv, stats } = require('./report');
const dir = process.argv[2] || 'sweep_out';
const only = process.env.ONLY || '';
const rows = readCsv(dir + '/visits.csv');
const conds = [...new Set(rows.map((r) => r.condition))];
for (const c of conds) {
  const rs = rows.filter((r) => r.condition === c && r.prev_quality !== null)
                 .filter((r) => !only || r.exit_type === only);
  const bin = {};
  for (const r of rs) {
    const cur = r.quality >= 0.75 ? 'rich' : 'poor';
    const prev = r.prev_quality >= 0.75 ? 'rich' : 'poor';
    (bin[`${cur} after ${prev}`] ||= []).push(r.residence_s);
  }
  const dec = rows.filter((r) => r.condition === c && r.exit_type === 'decision').length;
  console.log(`\n  ${c}: ${rs.length} visits${only ? ` (${only} exits only)` : ''}` +
    `, ${dec} decision-driven overall`);
  for (const k of ['rich after poor', 'rich after rich', 'poor after poor', 'poor after rich']) {
    const s = bin[k] && stats(bin[k]);
    console.log(`    ${k.padEnd(18)} ${s ? `n=${String(s.n).padStart(3)}  ${s.mean.toFixed(1).padStart(6)} ± ${s.se.toFixed(1)} s  (sd ${s.sd.toFixed(1)})` : '—'}`);
  }
  const g = (k) => bin[k] && stats(bin[k]);
  const rp = g('rich after poor'), rr = g('rich after rich');
  const pp = g('poor after poor'), pr = g('poor after rich');
  if (rp && rr) console.log(`    exploit longer: rich after poor > rich after rich  ` +
    `${rp.mean.toFixed(1)} vs ${rr.mean.toFixed(1)}  ${rp.mean > rr.mean ? 'OK' : 'FAILS'}`);
  if (pp && pr) console.log(`    abandon sooner: poor after rich < poor after poor  ` +
    `${pr.mean.toFixed(1)} vs ${pp.mean.toFixed(1)}  ${pr.mean < pp.mean ? 'OK' : 'FAILS'}`);
}
