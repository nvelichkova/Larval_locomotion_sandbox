// sweep.js — run many simulations and write tidy CSV.
//
//   node sweep.js config.js [outdir]
//
// Two modes, and a config may use both:
//
//   conditions: { wt: {...}, rut: {...} }   named settings, compared to each other
//   sample:     { n: 200, vary: {...} }     Latin-hypercube over ranges, to see
//                                           what the model can do at all
//
// Output is long-format CSV, one row per run / per visit / per turn, so it
// loads straight into pandas or R. Runs are written as they finish and the
// sweep is resumable: re-running skips work already on disk.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { fork } = require('child_process');
const { runSim } = require('./sim');

/* ---------- Latin hypercube ------------------------------------------------
   Stratified: each parameter's range is cut into n bins, one sample per bin,
   and the bins are shuffled independently per parameter. Covers the space far
   more evenly than n independent uniform draws, which clump and leave holes. */
function lhs(n, vary, rnd) {
  const keys = Object.keys(vary);
  const cols = {};
  for (const k of keys) {
    const idx = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    const [lo, hi] = vary[k];
    const isInt = Number.isInteger(lo) && Number.isInteger(hi) && (hi - lo) >= 2;
    cols[k] = idx.map((b) => {
      const u = (b + rnd()) / n;
      const v = lo + u * (hi - lo);
      return isInt ? Math.round(v) : +v.toFixed(6);
    });
  }
  return Array.from({ length: n }, (_, i) => {
    const row = {};
    for (const k of keys) row[k] = cols[k][i];
    return row;
  });
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** expand a config into a flat list of runs */
function planRuns(cfg) {
  const runs = [];
  const base = cfg.base || {};
  const duration = cfg.duration || 1800;
  const step = cfg.step || 0.002;
  const seeds = cfg.seeds || 1;
  const seed0 = cfg.seed0 || 1;

  if (cfg.conditions) {
    for (const [name, c] of Object.entries(cfg.conditions)) {
      for (let s = 0; s < seeds; s++) {
        runs.push({
          run_id: `${name}_s${seed0 + s}`,
          condition: name,
          seed: seed0 + s,
          duration: c.duration || duration,
          step: c.step || step,
          params: Object.assign({}, base, c.params || {}),
          buttons: c.buttons || cfg.buttons || [],
        });
      }
    }
  }
  if (cfg.sample) {
    const rnd = mulberry32(cfg.sample.seed || 12345);
    const pts = lhs(cfg.sample.n, cfg.sample.vary, rnd);
    pts.forEach((p, i) => {
      for (let s = 0; s < (cfg.sample.seeds || 1); s++) {
        runs.push({
          run_id: `sample${String(i).padStart(4, '0')}_s${seed0 + s}`,
          condition: cfg.sample.name || 'sample',
          seed: seed0 + s,
          duration: cfg.sample.duration || duration,
          step: cfg.sample.step || step,
          params: Object.assign({}, base, p),
          buttons: cfg.sample.buttons || cfg.buttons || [],
        });
      }
    });
  }
  return runs;
}

/* ---------- CSV ----------------------------------------------------------- */
/* headers for the long-format outputs, so an empty sweep still produces a
   readable file with the right columns */
const VISIT_COLS = ['run_id', 'condition', 't_enter_s', 'residence_s', 'substrate',
  'quality', 'prev_quality', 'mem_weight', 'exit_type', 'decision_latency_s'];
const TURN_COLS = ['run_id', 'condition', 't_s', 'turn_angle_deg', 'n_sweeps', 'local'];
const RUN_COLS = ['run_id', 'condition', 'seed', 'duration_s', 'step_s', 'buttons', 'app_sha1'];

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
/* `fallback` is the header to use when there are no rows. An empty file is a
   trap: pandas raises EmptyDataError on it rather than giving an empty frame,
   so a sweep with no patch visits breaks an analysis script that would
   otherwise have handled zero visits perfectly well. */
function writeCsv(file, rows, fallback) {
  if (!rows.length) {
    fs.writeFileSync(file, fallback && fallback.length ? fallback.join(',') + '\n' : '');
    return;
  }
  const cols = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
  const out = [cols.join(',')];
  for (const r of rows) out.push(cols.map((c) => csvEscape(r[c])).join(','));
  fs.writeFileSync(file, out.join('\n') + '\n');
}

/* ---------- worker mode --------------------------------------------------- */
if (process.env.SWEEP_WORKER) {
  process.on('message', (job) => {
    const r = runSim({
      duration: job.duration, step: job.step, seed: job.seed,
      params: job.params, buttons: job.buttons,
      track: job.track !== false, trackHz: job.trackHz || 1,
      app: job.app,
    });
    process.send({ run_id: job.run_id, condition: job.condition, result: r });
  });
  return;
}

/* ---------- driver -------------------------------------------------------- */
/* collect whatever runs are already on disk into the CSVs, without running
   anything: useful for inspecting a long sweep while it is still going */
function collect(outDir) {
  const runDir = path.join(outDir, 'runs');
  const files = fs.readdirSync(runDir).filter((f) => f.endsWith('.json'));
  const runRows = [], visitRows = [], turnRows = [];
  for (const f of files) {
    const d = JSON.parse(fs.readFileSync(path.join(runDir, f), 'utf8'));
    const flatParams = {};
    for (const [k, v] of Object.entries(d.params || {})) flatParams['p_' + k] = v;
    runRows.push(Object.assign(
      { run_id: d.run_id, condition: d.condition, seed: d.seed,
        duration_s: d.duration_s, step_s: d.step_s, buttons: d.buttons,
        app_sha1: d.app_sha1, param_ignored: d.param_ignored || '' },
      d.summary, flatParams));
    for (const v of d.visits) visitRows.push(Object.assign({ run_id: d.run_id, condition: d.condition }, v));
    for (const t of d.turns) turnRows.push(Object.assign({ run_id: d.run_id, condition: d.condition }, t));
  }
  writeCsv(path.join(outDir, 'runs.csv'), runRows, RUN_COLS);
  writeCsv(path.join(outDir, 'visits.csv'), visitRows, VISIT_COLS);
  writeCsv(path.join(outDir, 'turns.csv'), turnRows, TURN_COLS);
  return { runs: runRows.length, visits: visitRows.length, turns: turnRows.length };
}

async function main() {
  if (process.argv[2] === '--collect') {
    const r = collect(path.resolve(process.argv[3] || 'sweep_out'));
    console.log(`collected ${r.runs} runs, ${r.visits} visits, ${r.turns} turns`);
    return;
  }
  const cfgPath = path.resolve(process.argv[2] || 'config.js');
  const cfg = require(cfgPath);
  const outDir = path.resolve(process.argv[3] || cfg.out || 'sweep_out');
  const runDir = path.join(outDir, 'runs');
  const trackDir = path.join(outDir, 'tracks');
  fs.mkdirSync(runDir, { recursive: true });
  if (cfg.tracks !== false) fs.mkdirSync(trackDir, { recursive: true });

  const all = planRuns(cfg);
  const todo = all.filter((r) => !fs.existsSync(path.join(runDir, r.run_id + '.json')));
  const nPar = Math.max(1, Math.min(cfg.parallel || os.cpus().length, 16));

  console.log(`sweep: ${all.length} runs (${all.length - todo.length} already done), ` +
    `${nPar} workers, ${cfg.duration || 1800}s each`);
  const t0 = Date.now();
  let done = 0, failed = 0;

  await new Promise((resolve) => {
    const queue = todo.slice();
    let active = 0;
    const launch = () => {
      if (!queue.length && active === 0) return resolve();
      while (queue.length && active < nPar) {
        const job = queue.shift();
        active++;
        const w = fork(__filename, [], { env: Object.assign({}, process.env, { SWEEP_WORKER: '1' }) });
        w.on('message', (msg) => {
          const r = msg.result;
          if (r.ok) {
            /* Did the values we asked for survive to the end of the run? Some
               parameters are recomputed by the model from the substrate on
               every frame (README section 5), so a sampled value can be
               silently discarded - which produces conditions that are
               identical to each other, or a sampled dimension that was never
               actually explored. An earlier version of cfg_explore.js varied
               two such parameters and nobody noticed for a whole analysis. */
            const ignored = [];
            for (const [k, v] of Object.entries(job.params || {})) {
              const want = Number(v), got = Number(r.params[k]);
              if (Number.isFinite(want) && Number.isFinite(got) && Math.abs(want - got) > 1e-9)
                ignored.push(k);
            }
            if (ignored.length) r.param_ignored = ignored.join('|');
            fs.writeFileSync(path.join(runDir, msg.run_id + '.json'),
              JSON.stringify({ run_id: msg.run_id, condition: msg.condition, ...r }));
            if (cfg.tracks !== false && r.track)
              writeCsv(path.join(trackDir, msg.run_id + '.csv'), r.track);
          } else { failed++; console.error(`  FAILED ${msg.run_id}: ${r.error}`); }
          done++;
          if (done % 10 === 0 || done === todo.length) {
            const el = (Date.now() - t0) / 1000;
            const rate = done / el;
            process.stdout.write(`  ${done}/${todo.length}  ${el.toFixed(0)}s elapsed, ` +
              `~${((todo.length - done) / Math.max(rate, 1e-9)).toFixed(0)}s left\n`);
          }
          w.kill(); active--; launch();
        });
        w.send(Object.assign({}, job, { app: cfg.app, track: cfg.tracks !== false, trackHz: cfg.trackHz }));
      }
    };
    if (!todo.length) resolve(); else launch();
  });

  // collect every run on disk, including ones from earlier invocations
  const runRows = [], visitRows = [], turnRows = [];
  for (const r of all) {
    const f = path.join(runDir, r.run_id + '.json');
    if (!fs.existsSync(f)) continue;
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    const flatParams = {};
    for (const [k, v] of Object.entries(d.params || {})) flatParams['p_' + k] = v;
    runRows.push(Object.assign(
      { run_id: d.run_id, condition: d.condition, seed: d.seed,
        duration_s: d.duration_s, step_s: d.step_s, buttons: d.buttons,
        app_sha1: d.app_sha1, param_ignored: d.param_ignored || '' },
      d.summary, flatParams));
    for (const v of d.visits) visitRows.push(Object.assign({ run_id: d.run_id, condition: d.condition }, v));
    for (const t of d.turns) turnRows.push(Object.assign({ run_id: d.run_id, condition: d.condition }, t));
  }
  writeCsv(path.join(outDir, 'runs.csv'), runRows, RUN_COLS);
  writeCsv(path.join(outDir, 'visits.csv'), visitRows, VISIT_COLS);
  writeCsv(path.join(outDir, 'turns.csv'), turnRows, TURN_COLS);

  const el = (Date.now() - t0) / 1000;
  console.log(`done in ${el.toFixed(0)}s — ${runRows.length} runs, ${visitRows.length} visits, ` +
    `${turnRows.length} turns${failed ? `, ${failed} failed` : ''}`);

  const ign = {};
  for (const r of runRows)
    if (r.param_ignored) for (const k of String(r.param_ignored).split('|')) ign[k] = (ign[k] || 0) + 1;
  const ignKeys = Object.keys(ign);
  if (ignKeys.length) {
    console.log('\n  WARNING: the model overrode values this sweep set.');
    for (const k of ignKeys)
      console.log(`    ${k}: discarded in ${ign[k]} of ${runRows.length} runs`);
    console.log('  Those parameters are derived from the genotype and substrate every');
    console.log('  frame (README section 5) and cannot be swept. Conditions that differ');
    console.log('  only in them are not actually different. See the param_ignored column.');
  }
  console.log(`  ${path.join(outDir, 'runs.csv')}`);
}

if (require.main === module) main();
module.exports = { planRuns, lhs, writeCsv, collect };
