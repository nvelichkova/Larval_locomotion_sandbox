// Measures the real rendered layout: how much vertical space the controls take
// versus the arena, at a given viewport, for each controls view.
const PW='/home/claude/.npm-global/lib/node_modules/@playwright/mcp/node_modules/playwright/index.js';
const { chromium } = require(PW);
const path = require('path');
const file = 'file://' + path.resolve(process.argv[2] || 'larval_locomotion_sandbox.html');
const W = Number(process.env.VW || 1920), H = Number(process.env.VH || 1000);

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
  const pg = await b.newPage({ viewport: { width: W, height: H } });
  await pg.goto(file);
  await pg.waitForTimeout(600);
  const rows = [];
  const hasTabs = await pg.evaluate(() => !!document.querySelector('.tab'));
  for (const tab of (hasTabs ? ['all','0','1','2','3'] : ['all'])) {
    if (tab !== 'all') await pg.click(`.tab[data-tab="${tab}"]`);
    await pg.waitForTimeout(250);
    const m = await pg.evaluate(() => {
      const r = s => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
      const c = r('#ctl'), a = r('#arena'), st = r('.stats'), hd = r('header'), sb = r('.scrubbar');
      return { ctl: c ? Math.round(c.height) : 0, arena: a ? Math.round(a.height) : 0,
               stats: Math.round(st.height), head: Math.round(hd.height),
               scrub: Math.round(sb.height),
               overflow: document.documentElement.scrollHeight > window.innerHeight + 2 };
    });
    rows.push([tab, m]);
  }
  const T = H;
  console.log(`viewport ${W}x${H}`);
  for (const [tab, m] of rows)
    console.log(`  ${String(tab).padEnd(5)} header ${String(m.head).padStart(3)}  controls ${String(m.ctl).padStart(3)}px (${(100*m.ctl/T).toFixed(0).padStart(2)}%)  arena ${String(m.arena).padStart(3)}px (${(100*m.arena/T).toFixed(0).padStart(2)}%)  stats ${m.stats}  scrub ${m.scrub}  ${m.overflow?'OVERFLOW':'fits'}`);
  await b.close();
})();
