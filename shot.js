const PW='/home/claude/.npm-global/lib/node_modules/@playwright/mcp/node_modules/playwright/index.js';
const { chromium } = require(PW); const path=require('path');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'});
  const pg=await b.newPage({viewport:{width:Number(process.env.VW||1536),height:Number(process.env.VH||757)},
    colorScheme:'dark'});
  await pg.goto('file://'+path.resolve(process.argv[2]));
  await pg.waitForTimeout(1500);
  if(process.env.TAB) await pg.click(`.tab[data-tab="${process.env.TAB}"]`), await pg.waitForTimeout(400);
  await pg.screenshot({path:process.argv[3]});
  await b.close();
})();
