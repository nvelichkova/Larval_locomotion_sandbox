// report.js — summarise a sweep.
//
//   node report.js <outdir> [metric ...]        group by condition
//   node report.js <outdir> --corr              rank parameters by |correlation|
//   node report.js <outdir> --range             what the model can produce
//
// Deliberately reports spread, not just means: single runs of this model vary
// enough that a difference smaller than the between-seed spread is not a
// difference at all.

const fs = require('fs');
const path = require('path');

function readCsv(file) {
  const txt = fs.readFileSync(file, 'utf8').trim();
  if (!txt) return [];
  const lines = txt.split('\n');
  const cols = splitLine(lines[0]);
  return lines.slice(1).map((l) => {
    const c = splitLine(l), o = {};
    cols.forEach((k, i) => {
      const v = c[i];
      o[k] = (v === '' || v === undefined) ? null : (isNaN(Number(v)) ? v : Number(v));
    });
    return o;
  });
}
function splitLine(l) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < l.length; i++) {
    const ch = l[i];
    if (q) { if (ch === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur); return out;
}

const num = (a) => a.filter((v) => typeof v === 'number' && Number.isFinite(v));
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
function stats(a) {
  a = num(a);
  if (!a.length) return null;
  const m = mean(a);
  const sd = a.length > 1 ? Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)) : 0;
  const s = a.slice().sort((x, y) => x - y);
  return { n: a.length, mean: m, sd, se: sd / Math.sqrt(a.length),
    min: s[0], max: s[s.length - 1], med: s[Math.floor(s.length / 2)] };
}
function pearson(x, y) {
  const n = x.length;
  if (n < 3) return 0;
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return (sxx && syy) ? sxy / Math.sqrt(sxx * syy) : 0;
}

const DEFAULT_METRICS = ['speed_mm_s', 'stride_mm', 'turns_per_min', 'mean_abs_turn_deg',
  'border_frac', 'in_patch_frac', 'mean_residence_s', 'patch_visits'];

function main() {
  const dir = path.resolve(process.argv[2] || 'sweep_out');
  const rows = readCsv(path.join(dir, 'runs.csv'));
  if (!rows.length) { console.error('no runs.csv in ' + dir); process.exit(1); }
  const args = process.argv.slice(3);
  const flags = args.filter((a) => a.startsWith('--'));
  const metrics = args.filter((a) => !a.startsWith('--'));
  const use = metrics.length ? metrics : DEFAULT_METRICS;

  if (flags.includes('--range')) {
    console.log(`what the model produces across ${rows.length} runs:\n`);
    console.log('  metric                   min      med      max    mean ±  sd');
    for (const m of use) {
      const s = stats(rows.map((r) => r[m]));
      if (!s) continue;
      console.log(`  ${m.padEnd(20)} ${f(s.min)} ${f(s.med)} ${f(s.max)}  ${f(s.mean)} ± ${f(s.sd)}`);
    }
    return;
  }

  if (flags.includes('--corr')) {
    /* per, rt and pf are recomputed by the model from the genotype and
       substrate every frame (README section 5). They vary across a sweep as
       OUTPUTS - the final period is essentially a function of the
       intersegmental delay - so ranking them beside the inputs reports one
       effect twice and invites reading a consequence as a cause. Pass
       --derived to include them anyway. */
    const DERIVED = new Set(['p_per', 'p_rt', 'p_pf']);
    const pcols = Object.keys(rows[0]).filter((k) => k.startsWith('p_'));
    let varying = pcols.filter((k) => new Set(rows.map((r) => r[k])).size > 1);
    const dropped = varying.filter((k) => DERIVED.has(k));
    if (!flags.includes('--derived')) varying = varying.filter((k) => !DERIVED.has(k));
    if (dropped.length && !flags.includes('--derived'))
      console.log(`  (excluding ${dropped.map((k) => k.slice(2)).join(', ')}: ` +
        `derived from the substrate each frame, not an input — --derived to include)\n`);
    console.log(`parameter sensitivity over ${rows.length} runs ` +
      `(${varying.length} parameters varied), Pearson r:\n`);
    for (const m of use) {
      const ys = rows.map((r) => r[m]);
      if (!num(ys).length) continue;
      const ranked = varying.map((p) => {
        const pairs = rows.filter((r) => typeof r[m] === 'number' && Number.isFinite(r[m]));
        return { p: p.slice(2), r: pearson(pairs.map((q) => q[p]), pairs.map((q) => q[m])) };
      }).filter((o) => Number.isFinite(o.r))
        .sort((a, b) => Math.abs(b.r) - Math.abs(a.r)).slice(0, 5);
      console.log(`  ${m}`);
      for (const o of ranked)
        console.log(`      ${o.r >= 0 ? '+' : '-'}${Math.abs(o.r).toFixed(2)}  ${o.p}`);
    }
    return;
  }

  // group by condition
  const byCond = {};
  for (const r of rows) (byCond[r.condition] = byCond[r.condition] || []).push(r);
  const conds = Object.keys(byCond);
  console.log(`${rows.length} runs in ${conds.length} conditions ` +
    `(${byCond[conds[0]].length} seeds each)\n`);
  for (const m of use) {
    const any = conds.some((c) => stats(byCond[c].map((r) => r[m])));
    if (!any) continue;
    console.log(`  ${m}`);
    for (const c of conds) {
      const s = stats(byCond[c].map((r) => r[m]));
      if (!s) { console.log(`      ${c.padEnd(10)} —`); continue; }
      console.log(`      ${c.padEnd(10)} ${f(s.mean)} ± ${f(s.se)}  (sd ${f(s.sd)}, n ${s.n})`);
    }
  }
  console.log('\n  ± is the standard error of the mean; sd is the spread between seeds.');
  console.log('  A gap smaller than sd is not a difference, however clean the means look.');
}
function f(v) { return (v === null || v === undefined) ? '   —  ' : v.toFixed(3).padStart(7); }

if (require.main === module) main();
module.exports = { readCsv, stats, pearson };
