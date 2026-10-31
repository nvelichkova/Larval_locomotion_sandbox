// sim.js — run one headless simulation of the larval sandbox and return
// structured results. One process per run: startup is ~170 ms against ~5.5 s
// for an hour of simulated time, so an in-process harness would not pay for
// its own complexity.
//
//   const { runSim } = require('./sim');
//   const r = runSim({ duration: 3600, seed: 4,
//                      params: { aw: 250, pr: 18 }, buttons: ['s_yeast','m_p4'] });
//
// Everything the simulation needs is reached through the app's __LARVA_HOOK,
// so this file does not depend on the internal layout of the HTML.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_APP = path.join(__dirname, 'larval_locomotion_sandbox.html');

function fingerprint(str) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = (h1 ^ c) >>> 0; h1 = Math.imul(h1, 16777619) >>> 0;
    h2 = (h2 + c) >>> 0; h2 = Math.imul(h2, 2246822519) >>> 0;
  }
  return ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
}

function buildDom() {
  const noop = () => {};
  const MT = () => ({ width: 10 });
  const makeCtx = () => {
    const cache = {};
    return new Proxy({}, {
      get: (_, k) => {
        if (k === 'canvas') return { width: 800, height: 400 };
        if (k === 'measureText') return MT;
        return cache[k] || (cache[k] = noop);
      },
      set: () => true,
    });
  };
  const rect = () => ({ width: 800, height: 400 });
  const els = {};
  const makeEl = (id) => ({
    id, value: '0', textContent: '', className: '', style: {},
    options: [], selectedIndex: -1,
    _h: {},
    addEventListener(k, f) { this._h[k] = f; },
    dispatchEvent(ev) { const f = this._h[ev.type]; if (f) f.call(this, ev); },
    classList: { toggle: noop, contains: () => false },
    onclick: null,
    getElementsByClassName: () => [],
    getAttribute: () => null,
    getContext: makeCtx,
    getBoundingClientRect: rect,
    appendChild: noop, click: noop, preventDefault: noop, focus: noop,
  });
  return {
    els,
    document: {
      getElementById(id) { if (!els[id]) els[id] = makeEl(id); return els[id]; },
      createElement(tag) {
        return tag === 'canvas'
          ? { width: 800, height: 400, getContext: makeCtx, getBoundingClientRect: rect }
          : makeEl('tmp');
      },
      documentElement: {},
      querySelectorAll: () => [],
    },
  };
}

/** Run one simulation. Returns summary metrics plus the raw logs. */
function runSim(opt = {}) {
  const appPath = opt.app || DEFAULT_APP;
  const html = fs.readFileSync(appPath, 'utf8');
  const m = html.match(/<script id="model">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('no <script id="model"> in ' + appPath);
  const src = m[1];
  const appHash = crypto.createHash('sha1').update(html).digest('hex').slice(0, 10);
  /* the same non-cryptographic fingerprint the page computes over the same
     model text, so a bundle exported from the browser and a sweep run here
     can be compared field for field. crypto.subtle is unavailable on file://
     pages, which is why the browser cannot simply use sha1. */
  const mkDefaults = {};
  for (const d of html.matchAll(/<input type="range" id="(\w+)"[^>]*value="([-\d.]+)"/g))
    mkDefaults[d[1]] = d[2];
  const modelFp = fingerprint(src + '\n' + JSON.stringify(mkDefaults));

  const duration = Number(opt.duration || 900);     // simulated seconds
  const step = Number(opt.step || 0.002);           // integration step, s
  const simSpeed = Number(opt.simSpeed || 20);      // redraw frequency only
  const keepTrack = opt.track !== false;
  const trackHz = Number(opt.trackHz || 1);

  const dom = buildDom();
  let rafCb = null;
  let hook = null;

  // the app reads these globals at load; they do nothing in a browser
  const prev = {};
  const setG = (k, v) => { prev[k] = global[k]; global[k] = v; };
  setG('window', { devicePixelRatio: 1, addEventListener: () => {} });
  setG('performance', { now: () => simClock * 1000 });
  setG('requestAnimationFrame', (cb) => { rafCb = cb; });
  setG('document', dom.document);
  setG('getComputedStyle', () => ({ getPropertyValue: () => '#fff' }));
  setG('Blob', function () {});
  setG('FileReader', function () {});
  setG('URL', { createObjectURL: () => '', revokeObjectURL: () => {} });
  setG('Event', function (type) { this.type = type; });
  setG('__LARVA_H', step);
  setG('__LARVA_NODRAW', opt.draw === true ? false : true);
  setG('__LARVA_HOOK', (api) => { hook = api; });

  let simClock = 0;

  // slider defaults come from the markup, since there is no real DOM
  for (const m of html.matchAll(/<input type="range" id="(\w+)"[^>]*value="([-\d.]+)"/g))
    dom.document.getElementById(m[1]).value = m[2];

  try {
    new Function(src)();
    if (!hook) throw new Error('app did not call __LARVA_HOOK — wrong app version?');

    // buttons first (they can rewrite sliders via presets), then explicit params
    for (const id of (opt.buttons || [])) {
      const e = dom.document.getElementById(id);
      if (typeof e.onclick === 'function') e.onclick.call(e);
    }
    const params = Object.assign({ spd: simSpeed }, opt.params || {});
    if (opt.seed !== undefined) params.seed = opt.seed;
    for (const [k, v] of Object.entries(params)) {
      const e = dom.document.getElementById(k);
      e.value = String(v);
      e.dispatchEvent(new global.Event('input'));
    }
    // a seed change must restart the run so the stream starts from it
    hook.reset();

    // drive by SIMULATED time, not wall clock: sim speed only sets how many
    // 2 ms substeps run between redraws and is bit-identical across values
    const DT = 0.05;                       // the app clamps dt to this
    let guard = 0;
    while (hook.t < duration && guard < 5e7) {
      simClock += DT;
      const cb = rafCb; rafCb = null;
      if (!cb) break;
      cb(simClock * 1000);
      // optional per-frame callback, e.g. to poke at chosen times:
      //   onFrame: (hook) => { if (hook.t > 20 && !done) { hook.poke('head', 1, 'script'); done = true; } }
      if (opt.onFrame) opt.onFrame(hook);
      guard++;
    }

    const g = (id) => dom.document.getElementById(id).textContent;
    const num = (id) => {
      const v = parseFloat(String(g(id)).replace(/[^\d.\-]/g, ''));
      return Number.isFinite(v) ? v : null;
    };

    const summary = {
      sim_time_s: +hook.t.toFixed(1),
      path_mm: +hook.pathLen.toFixed(2),
      speed_mm_s: hook.t > 0 ? +(hook.pathLen / hook.t).toFixed(4) : 0,
      stride_mm: +hook.strideMM.toFixed(4),
      waves: hook.nWaves,
      turns: hook.nTurns,
      turns_per_min: hook.t > 0 ? +(hook.nTurns / (hook.t / 60)).toFixed(3) : 0,
      mean_abs_turn_deg: hook.nTurns ? +(hook.sumTurn / hook.nTurns).toFixed(2) : null,
      border_frac: hook.t > 0 ? +(hook.timeBorder / hook.t).toFixed(4) : 0,
      in_patch_frac: hook.t > 0 ? +(hook.timeIn / hook.t).toFixed(4) : 0,
      patch_visits: hook.patchVisits,
      mean_residence_s: hook.resN ? +(hook.resSum / hook.resN).toFixed(2) : null,
      n_decision_exits: hook.nDecide,
      n_wander_exits: hook.nWander,
      habituation_end: +hook.habit.toFixed(4),
      wall_tier_end: hook.wallTier,
      ...pokeSummary(hook),
      touch_habit_end: hook.tHabit !== undefined ? +hook.tHabit.toFixed(4) : null,
      stride_period_s: num('v_per'),
      pause_fraction: num('v_pf'),
      mean_run_s: num('v_rt'),
      target_speed_mm_s: num('s_tg'),
    };

    // centroid track, downsampled from the replay history
    let track = null;
    if (keepTrack && hook.hCount) {
      const H = hook.HIST, FW = hook.FW;
      const SNAME = ['run', 'cast', 'back', 'pause'];
      const LNAME = ['agar', 'sucrose', 'yeast'];
      const everyS = 1 / trackHz;
      track = [];
      let nextT = 0;
      for (let i = 0; i < hook.hCount; i++) {
        const o = FW * hook.histAt(i);
        if (H[o] < nextT) continue;
        nextT = H[o] + everyS;
        track.push({
          t_s: +H[o].toFixed(2),
          x_mm: +H[o + 60].toFixed(3),
          y_mm: +H[o + 61].toFixed(3),
          state: SNAME[H[o + 1]] || 'run',
          local: LNAME[H[o + 2]] || 'agar',
          in_border: H[o + 71] !== undefined ? 1 : 0,
        });
      }
    }

    return {
      ok: true,
      app: path.basename(appPath),
      app_sha1: appHash,
      model_fingerprint: modelFp,
      duration_s: duration,
      step_s: step,
      seed: opt.seed,
      params: Object.assign({}, hook.P),
      buttons: (opt.buttons || []).join('|'),
      summary,
      visits: hook.visitLog.map((r) => ({
        t_enter_s: +r[0], residence_s: +r[1], substrate: r[2],
        quality: +r[3], prev_quality: r[4] === '' ? null : +r[4],
        mem_weight: +r[5], exit_type: r[6],
        decision_latency_s: (r[7] === '' || r[7] === undefined) ? null : +r[7],
      })),
      turns: hook.turnLog.map((r) => ({
        t_s: +r[0], turn_angle_deg: +r[1], n_sweeps: +r[2], local: r[3],
      })),
      track,
    };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err), seed: opt.seed };
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete global[k]; else global[k] = v;
    }
  }
}

/* Share of head pokes that got each response (reverse_extended counts as
   reverse); null when there were none. Same as the in-page batch runner. */
function pokeSummary(hook) {
  const c = { reverse: 0, turn: 0, pause: 0, none: 0 };
  let n = 0;
  for (const r of hook.pokeLog || []) {
    if (r[2] !== 'head') continue;
    n++;
    const k = r[6] === 'reverse_extended' ? 'reverse' : r[6];
    if (k in c) c[k]++;
  }
  const frac = (k) => (n ? +(c[k] / n).toFixed(4) : null);
  return { n_head_pokes: n, poke_reverse_frac: frac('reverse'), poke_turn_frac: frac('turn'),
           poke_pause_frac: frac('pause'), poke_none_frac: frac('none') };
}

module.exports = { runSim, DEFAULT_APP };

// CLI:  node sim.js '{"duration":600,"seed":1}'
if (require.main === module) {
  const arg = process.argv[2] ? JSON.parse(process.argv[2]) : {};
  const r = runSim(arg);
  if (!r.ok) { console.error('FAILED:', r.error); process.exit(1); }
  if (process.env.JSON) { console.log(JSON.stringify(r)); }
  else {
    console.log(`  ${r.duration_s}s sim, seed ${r.seed}, step ${r.step_s}s, app ${r.app_sha1}`);
    for (const [k, v] of Object.entries(r.summary)) console.log(`    ${k.padEnd(20)} ${v}`);
    console.log(`    ${String('visits').padEnd(20)} ${r.visits.length}`);
  }
}
