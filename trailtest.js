const PW='/home/claude/.npm-global/lib/node_modules/@playwright/mcp/node_modules/playwright/index.js';
const { chromium } = require(PW); const path=require('path');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'});
  const pg=await b.newPage({viewport:{width:1536,height:757},colorScheme:'dark'});
  await pg.goto('file://'+path.resolve(process.argv[2]||'larval_locomotion_sandbox.html'));
  await pg.evaluate(()=>{ const e=document.getElementById('spd'); e.value='20'; e.dispatchEvent(new Event('input')); });
  await pg.waitForTimeout(6000);          // build up a trail fast
  const count = () => pg.evaluate(() => {
    // count purple trail pixels on the arena canvas
    const c=document.getElementById('arena'), x=c.getContext('2d');
    const d=x.getImageData(0,0,c.width,c.height).data;
    let n=0;
    // trail is rgb(127,119,221) at 0.6 alpha over a dark panel: blue-dominant
    for(let i=0;i<d.length;i+=4){
      const r=d[i],g=d[i+1],bl=d[i+2];
      if(bl>r+35 && bl>g+35 && bl>70) n++;
    }
    return n;
  });
  const before = await count();
  // force an aspect change the same way a layout shift would
  await pg.setViewportSize({width:1536,height:700});
  await pg.waitForTimeout(1200);
  const after = await count();
  console.log(`  trail pixels before resize ${before}, after ${after}`);
  console.log(`  verdict: ${after > before*0.5 ? 'TRAIL SURVIVED' : 'TRAIL LOST'}`);
  await b.close();
})();
