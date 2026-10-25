// Isolates the leaving decision from the arena: integrates the OU process
// directly with a forced memory value, so residence can be read off without
// spatial confounds (travel time, re-entry, quality-dependent crawl speed).
function residence(opt) {
  const P = Object.assign({ oumu:0.22, ouq:0.75, oulk:0.05, ounz:0.35,
                            ocmp:1.2, q:1.0, memQ:-1, memW:1 }, opt);
  let seed = opt.seed || 1;
  const rnd = () => { seed = (seed*1664525 + 1013904223) >>> 0; return seed/4294967296; };
  const base = P.oumu * (1 - P.ouq*P.q);
  const cmp  = 1 + P.ocmp * (P.memQ < 0 ? 0 : P.memW) * ((P.memQ<0?0:P.memQ) - P.q);
  const drift = Math.max(0.01, base*cmp);
  let x = 0, t = 0, dt = 0.002;
  while (x < 1 && t < 4000) { x += (drift - P.oulk*x)*dt + P.ounz*Math.sqrt(dt)*(rnd()*2-1); if (x<0) x=0; t += dt; }
  return { t, drift };
}
function mean(opt, n=200) {
  let s=0, d=0;
  for (let i=1;i<=n;i++){ const r=residence(Object.assign({seed:i*7919}, opt)); s+=r.t; d=r.drift; }
  return { res: s/n, drift: d };
}
const RICH = 1.0, POOR = 0.5;
console.log('  isolated OU, 200 runs per cell, memory weight forced to 1');
for (const [label, q, memQ] of [
  ['rich, no memory   ', RICH, -1],
  ['rich after rich   ', RICH, RICH],
  ['rich after poor   ', RICH, POOR],
  ['poor, no memory   ', POOR, -1],
  ['poor after poor   ', POOR, POOR],
  ['poor after rich   ', POOR, RICH],
]) {
  const r = mean({ q, memQ });
  console.log(`  ${label} drift ${r.drift.toFixed(4)}  residence ${r.res.toFixed(1)} s`);
}
