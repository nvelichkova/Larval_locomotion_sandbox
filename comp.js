// Does the comparative-memory effect reproduce? Pools visits across seeds and
// splits residence by (current patch quality, previous patch quality).
const { execSync } = require('child_process');
const os = require('os');
const N = Number(process.env.SEEDS || 10), T = Number(process.env.T || 5400);
const CLICK = process.env.CLICK || 's_yeast,m_p4,mix';
const EXTRA = process.env.EXTRA || '';
const AW = process.env.AW || '120';
const rows = [];
// run the seeds in parallel; one node process per seed saturates the box
const cmds = [];
for (let sd = 1; sd <= N; sd++)
  cmds.push(`APP=larval_locomotion_sandbox.html TOTAL=${T} CLICK="${CLICK}" OVERRIDE="seed=${sd},aw=${AW}${EXTRA?','+EXTRA:''}" ` +
    `node -e "const m=require('./app_headless.js');console.log('@@'+JSON.stringify(m.probe().visits()))" ` +
    `2>/dev/null > /tmp/comp_${sd}.json`);
const par = Math.max(1, Math.min(os.cpus().length, 8));
for (let i = 0; i < cmds.length; i += par)
  execSync(cmds.slice(i, i + par).join(' & ') + ' & wait', { cwd: __dirname, shell: '/bin/bash' });
const fs = require('fs');
for (let sd = 1; sd <= N; sd++) {
  const txt = fs.readFileSync(`/tmp/comp_${sd}.json`, 'utf8');
  const j = txt.split('@@')[1];
  if (j) for (const v of JSON.parse(j.trim())) rows.push(v);
}
// v = [t_enter, residence, substrate, quality, prevQuality, memWeight]
const ONLY = process.env.ONLY || '';   // 'decision' | 'wander' | '' for both
const bin = {};
let nDec = 0, nWan = 0;
for (const v of rows) {
  if (v[6] === 'decision') nDec++; else nWan++;
  if (ONLY && v[6] !== ONLY) continue;
  const q = Number(v[3]), pq = v[4] === '' ? null : Number(v[4]);
  if (pq === null) continue;
  const cur = q >= 0.75 ? 'rich' : 'poor';
  const prev = pq >= 0.75 ? 'rich' : (pq >= 0.25 ? 'poor' : 'agar');
  if (prev === 'agar') continue;
  const k = `${cur} after ${prev}`;
  (bin[k] = bin[k] || []).push(Number(v[1]));
}
const stat = a => {
  const m = a.reduce((x,y)=>x+y,0)/a.length;
  const sd = Math.sqrt(a.reduce((x,y)=>x+(y-m)*(y-m),0)/Math.max(1,a.length-1));
  return { n: a.length, m, se: sd/Math.sqrt(a.length) };
};
console.log(`  ${rows.length} visits over ${N} seeds x ${T}s  (${nDec} decision-driven, ${nWan} wander-outs)` + (ONLY?`  -- showing ${ONLY} only`:''));
const order = ['rich after poor','rich after rich','poor after poor','poor after rich'];
for (const k of order) {
  if (!bin[k]) { console.log(`  ${k.padEnd(18)} —`); continue; }
  const s = stat(bin[k]);
  console.log(`  ${k.padEnd(18)} n=${String(s.n).padStart(3)}  residence ${s.m.toFixed(1).padStart(6)} ± ${s.se.toFixed(1)} s`);
}
const g = k => bin[k] ? stat(bin[k]) : null;
const rp = g('rich after poor'), rr = g('rich after rich');
const pp = g('poor after poor'), pr = g('poor after rich');
if (rp && rr) console.log(`  PREDICTED: rich after poor > rich after rich   ->  ${rp.m.toFixed(1)} vs ${rr.m.toFixed(1)}  ${rp.m>rr.m?'OK':'FAILS'}`);
if (pp && pr) console.log(`  PREDICTED: poor after rich < poor after poor   ->  ${pr.m.toFixed(1)} vs ${pp.m.toFixed(1)}  ${pr.m<pp.m?'OK':'FAILS'}`);
