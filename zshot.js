const PW='/home/claude/.npm-global/lib/node_modules/@playwright/mcp/node_modules/playwright/index.js';
const { chromium } = require(PW); const path=require('path');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'});
  const pg=await b.newPage({viewport:{width:1536,height:757},colorScheme:'dark'});
  await pg.goto('file://'+path.resolve('larval_locomotion_sandbox.html'));
  await pg.waitForTimeout(2500);
  const z=process.env.Z||'1';
  await pg.evaluate(zz=>{ const e=document.getElementById('zm'); e.value=zz; e.dispatchEvent(new Event('input')); }, z);
  await pg.waitForTimeout(900);
  await pg.screenshot({path:process.argv[2]});
  await b.close();
})();
