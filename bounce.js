const PW='/home/claude/.npm-global/lib/node_modules/@playwright/mcp/node_modules/playwright/index.js';
const { chromium } = require(PW); const path=require('path');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'});
  const pg=await b.newPage({viewport:{width:1536,height:757},colorScheme:'dark'});
  await pg.goto('file://'+path.resolve(process.argv[2]||'larval_locomotion_sandbox.html'));
  await pg.waitForTimeout(1800);
  for (const txt of ['reverse 100%','turn 48%','pause 20%','none 5%']) {
    const m = await pg.evaluate(t => {
      document.getElementById('s_wr').textContent = t;
      const st = document.querySelector('.stats').getBoundingClientRect();
      const ar = document.getElementById('arena').getBoundingClientRect();
      return { stats: Math.round(st.height), arena: Math.round(ar.height),
               aspect: +(ar.height/ar.width).toFixed(4) };
    }, txt);
    console.log(`  wall resp "${txt.padEnd(13)}"  stats ${m.stats}px  arena ${m.arena}px  aspect ${m.aspect}`);
  }
  await b.close();
})();
