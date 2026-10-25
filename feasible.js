// Which sampled parameter sets reproduce the measured kinematics, and what do
// they have in common? This is the question a sweep over parameter space can
// answer that a single hand-tuned run cannot.
const { readCsv, stats } = require('./report');
const rows = readCsv(process.argv[2] + '/runs.csv');
const TARGET = {                       // published envelopes
  stride_mm:     [0.50, 0.75],         // 0.70 ± 0.05 (Sun); 0.52 (Lahiri)
  speed_mm_s:    [0.55, 0.95],         // 0.64 ± 0.02 (Sun); 0.84 agar (Wosniack)
  turns_per_min: [1.5, 3.0],           // 1.7–2.8 across genotype/substrate
};
const inEnv = (r) => Object.entries(TARGET).every(([k, [lo, hi]]) =>
  typeof r[k] === 'number' && r[k] >= lo && r[k] <= hi);
const ok = rows.filter(inEnv);
console.log(`  ${ok.length} of ${rows.length} sampled parameter sets (${(100*ok.length/rows.length).toFixed(1)}%) ` +
  `reproduce all three measured kinematics\n`);
for (const [k, [lo, hi]] of Object.entries(TARGET)) {
  const pass = rows.filter((r) => typeof r[k]==='number' && r[k]>=lo && r[k]<=hi).length;
  console.log(`    ${k.padEnd(14)} target ${lo}–${hi}   met by ${String(pass).padStart(3)}/${rows.length}`);
}
if (!ok.length) process.exit(0);
console.log('\n  where the feasible sets sit inside the sampled ranges:');
const pcols = Object.keys(rows[0]).filter((k) => k.startsWith('p_'))
  .filter((k) => new Set(rows.map((r) => r[k])).size > 1);
const scored = pcols.map((p) => {
  const all = stats(rows.map((r) => r[p])), sub = stats(ok.map((r) => r[p]));
  const shift = (sub.mean - all.mean) / (all.sd || 1);     // in sd of the sampled range
  return { p: p.slice(2), all, sub, shift };
}).sort((a, b) => Math.abs(b.shift) - Math.abs(a.shift));
console.log('    param    sampled range        feasible mean   shift');
for (const o of scored.slice(0, 8)) {
  console.log(`    ${o.p.padEnd(7)}  ${o.all.min.toFixed(2).padStart(6)} – ${o.all.max.toFixed(2).padStart(6)}` +
    `      ${o.sub.mean.toFixed(3).padStart(8)}   ${o.shift >= 0 ? '+' : ''}${o.shift.toFixed(2)} sd`);
}
console.log('\n    A large shift means the measured kinematics constrain that parameter;');
console.log('    a shift near zero means the data say nothing about it.');
