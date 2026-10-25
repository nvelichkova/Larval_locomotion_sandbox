// Runs the REAL app script from larval_locomotion_sandbox.html against a DOM stub,
// then drives the animation loop fast so the shipped mechanics can be measured.
const fs = require('fs');
const HTML_PATH = process.env.APP || 'larval_locomotion_sandbox.html';
const html = fs.readFileSync(HTML_PATH, 'utf8');
// The page now carries several <script> blocks, so take the tagged model one,
// exactly as sim.js does. The old greedy /<script>...<\/script>/ matched none
// of them once the tag was added, which silently broke this harness.
const m = html.match(/<script id="model">([\s\S]*?)<\/script>/);
if (!m) throw new Error('no <script id="model"> in ' + HTML_PATH);
const src = m[1];

const noop = () => {};
// A Proxy that built a fresh closure on every property access dominated the
// run time (the app makes thousands of canvas calls per simulated second).
// Cache one noop per key instead.
const MT = () => ({ width: 10 });
function makeCtx() {
  const cache = {};
  return new Proxy({}, { get: (_, k) => {
    if (k === 'canvas') return { width: 800, height: 400 };
    if (k === 'measureText') return MT;
    return cache[k] || (cache[k] = noop);
  }, set: () => true });
}
function makeCanvas(w, h) {
  return { width: w||800, height: h||400, getContext: makeCtx,
    getBoundingClientRect: () => ({ width: 800, height: 400 }) };
}
const els = {};
function makeEl(id) {
  const e = { id, value: '0', textContent: '', className: '', style: {},
    _h: {}, addEventListener(k, f){ this._h[k]=f; },
    dispatchEvent(ev){ const f=this._h[ev.type]; if(f) f.call(this, ev); },
    classList:{ toggle:noop, contains:()=>false }, onclick:null,
    getElementsByClassName: () => [], getAttribute: () => null,
    getContext: makeCtx, getBoundingClientRect: () => ({ width: 800, height: 400 }),
    appendChild: noop, click: noop,
    preventDefault: noop, focus: noop };
  return e;
}
let rafCb = null;
global.window = { devicePixelRatio: 1 };
global.performance = { now: () => 0 };
global.requestAnimationFrame = (cb) => { rafCb = cb; };
global.document = {
  getElementById(id) { if (!els[id]) els[id] = makeEl(id); return els[id]; },
  createElement(tag) { return tag === 'canvas' ? makeCanvas() : makeEl('tmp'); },
  documentElement: {},
  querySelectorAll: () => [],
};
global.getComputedStyle = () => ({ getPropertyValue: () => '#fff' });
global.Blob = function(){}; global.FileReader = function(){}; global.URL = { createObjectURL:()=> '', revokeObjectURL: noop };
global.Event = function(type){ this.type = type; };
global.window.addEventListener = noop;   // zoom/pan handlers bind to window

// slider defaults must come from the markup, since the stub has no real DOM
for (const m of html.matchAll(/<input type="range" id="(\w+)"[^>]*value="([-\d.]+)"/g))
  document.getElementById(m[1]).value = m[2];

const probed = src.replace(/requestAnimationFrame\(loop\);\s*\}\)\(\);\s*$/,
  'requestAnimationFrame(loop);\nglobal.__probe=function(){return{t:t,state:state,bend:bend*R2D,bendPos:bendPos,straight:straightening,nWaves:nWaves,wts:wts.slice(),cen:centroid(),hCount:hCount,FW:FW,HIST:HIST,histAt:histAt,csv:timeseriesCSV,imp:importCSV,note:function(){return importNote;},toggleReplay:toggleReplay,goScrub:goScrub,scrubIdx:function(){return scrubIdx;},replaying:function(){return replaying;},habit:function(){return habit;},tier:function(){return wallTier;},border:function(){return timeBorder;},ls:function(){return inLS();},ou:function(){return ouX;},leaving:function(){return leaving;},res:function(){return resN?resSum/resN:0;},resN:function(){return resN;},memQ:function(){return memQ;},memW:function(){return memW();},drift:function(){return ouDrift();},local:function(){return curLocal;},setZoom:setZoom,zoom:function(){return zoom;},view:function(){return{sc:vSc,tx:vTx,ty:vTy};},toWorld:toWorld,follow:function(v){if(v!==undefined)follow=v;return follow;},visits:function(){return visitLog;}};};\n})();');
if (probed === src) throw new Error('probe injection failed');
new Function(probed)();
// allow slider overrides:  OVERRIDE="aw=160,rt=22.6" node app_headless.js 1800
if (process.env.OVERRIDE) for (const kv of process.env.OVERRIDE.split(',')) {
  const [k,v]=kv.split('='); const e=document.getElementById(k);
  e.value=v; e.dispatchEvent(new Event('input'));
}

// allow button clicks:  CLICK="m_p2,s_yeast" node app_headless.js 900
if (process.env.CLICK) for (const id of process.env.CLICK.split(',')) {
  const e = document.getElementById(id);
  if (typeof e.onclick === 'function') e.onclick.call(e);
  else console.log('   (no handler for ' + id + ')');
}

// drive: each rAF tick advances dt seconds of wall clock * sim speed
const SIM_SPEED = 1;
let simClock = 0;
const DT = 0.02;                       // 50 fps
global.performance.now = () => simClock * 1000;
const TOTAL = Number(process.env.TOTAL || process.argv[2] || 900);
let ticks = 0;
while (simClock < TOTAL) {
  simClock += DT;
  const cb = rafCb; rafCb = null;
  if (!cb) break;
  cb(simClock * 1000);
  ticks++;
}
const g = (id) => document.getElementById(id).textContent;
if (process.env.SCRUB) {
  const sl = document.getElementById('scrub');
  const max = Number(sl.max);
  console.log(`   history: ${max+1} samples, slider max ${max}`);
  for (const frac of [0, 0.25, 0.5, 0.9]) {
    sl.value = String(Math.round(max*frac));
    sl.dispatchEvent(new Event('input'));
    console.log(`   scrub ${(frac*100).toFixed(0).padStart(3)}% -> t ${g('s_t').padStart(9)}  ` +
      `state ${g('s_state').padEnd(8)} path ${g('s_pl').padStart(5)} mm  turns ${g('s_tm')}  ` +
      `head ${g('s_ha')}  maxbend ${g('s_mj')}`);
  }
  document.getElementById('live').onclick();
  console.log(`   back to live -> t ${g('s_t')}  path ${g('s_pl')} mm  state ${g('s_state')}`);
}
if (process.env.PROBE) { const p = global.__probe();
  console.log('   PROBE t',p.t.toFixed(1),'state',p.state,'nWaves',p.nWaves,
    'bend',p.bend.toFixed(1),'bendPos',p.bendPos.toFixed(2),'straight',p.straight,
    'centroid',p.cen.map(v=>v.toFixed(2)).join(','),
    'weights',p.wts.map(w=>w.toFixed(2)).join(' '));
}
console.log(`  after ${TOTAL}s of wall clock (${ticks} frames)`);
console.log(`   state ${g('s_state')}   local ${g('s_loc')}   sim time ${g('s_t')}`);
console.log(`   speed ${g('s_sp')} mm/s (target ${g('s_tg')})   stride ${g('s_st')} mm`);
console.log(`   turns/min ${g('s_tm')}   mean|turn| ${g('s_mt')}   path ${g('s_pl')} mm`);
console.log(`   stride period ${document.getElementById('v_per').textContent} s   ` +
            `pause frac ${document.getElementById('v_pf').textContent}   ` +
            `mean run ${document.getElementById('v_rt').textContent} s`);

module.exports = { probe: () => global.__probe(), doc: global.document };
