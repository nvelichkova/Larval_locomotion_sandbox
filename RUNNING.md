# Running the simulations

Two front ends, one model, the same output format. Which you want depends on who is running it.

- **the page** — `larval_locomotion_sandbox.html`, double-click it. No server, no install,
  nothing to learn. Watch one animal, turn knobs, **and run batches** — the Batch button
  does parameter sweeps across every core the browser will give it. This is what to hand
  to someone else.
- **the batch tools** — the `.js` files, run with Node from a terminal. Same model, same
  CSV schema, but scriptable, resumable, and safe to leave running overnight. This is for
  your own long sweeps.

The `.js` files are *not* a web page and will not run by opening them in a browser.

Both produce identical numbers for the same seed and parameters — that is a tested
property, not an aspiration (`scratchpad/parity.js`), and both stamp their output with the
same `model_fingerprint` so you can tell whether two sets of results came from the same
model.

---

## 0. Running batches from the page

Open the page, set up the arena and sliders as you want them, press **Batch**.

Pick a parameter, give it a few values, choose how many seeds and how long each run is.
The line underneath tells you how many runs that is and roughly how long it will take.
Press Run. Results fill the table as they arrive.

- **click a row** to draw its trajectory in the panel on the left; click more to overlay
  them, coloured by condition. The arena and its food patches are drawn underneath, and
  thicker segments are where the larva was on food. Each run records its own arena, so if
  you select runs from different arenas no substrate is drawn and the panel says why —
  rather than showing one arena's patches under another arena's tracks.
- **double-click a row** to load that run's parameters and seed into the live view, so you
  can watch that exact animal crawl.
From the **main window**, the **Figure** button does the same for the trajectory on screen —
vector PDF, or SVG with shift-click. It draws what the replay buffer holds, which is the
last 3000 s of a longer run.

**Video clips.** On the replay bar, scrub to where you want the clip to start and press
**In**, scrub to the end and press **Out**, pick how much simulated time each second of
video should carry, then press **Clip**. The label tells you how long the video will be
before you commit to it.

A clip is a rendering of the replay buffer, not a re-run, so it cannot disagree with what
the scrubber shows. Zoom and Follow are recorded as they are set — **zoom in on the animal
first if you want the peristalsis legible**, and pick 1x, since at 20x a stride lasts one
frame. The arena label and the replay timestamp are burned into the picture.

Recording happens in real time: a 20 s clip takes 20 s to make. That is why this does clips
rather than whole runs — an hour of simulated time at 1x would take an hour to film. Output
is WebM (MP4 on Safari). For a presentation that wants MP4:

```bash
ffmpeg -i larva_clip.webm -c:v libx264 -pix_fmt yuv420p larva_clip.mp4
```

Since the arena no longer takes its shape from the window, the window shape is now purely
cosmetic — resize it to frame a square arena tightly before recording, and the clip wastes
less space on margins.

From the batch panel:

- **Export PDF** / **SVG** writes the selected trajectories as a vector figure, 120 mm
  wide, with the arena, its patches, a scale bar and a legend. Real paths, not a screenshot,
  so it scales and opens for editing in Illustrator or Inkscape. The PDF is written by the
  page itself, so this works offline with nothing installed.
- **Export bundle** writes one self-describing `.json`: the config, the model fingerprint,
  and the runs, visits, turns and tracks tables. **Export CSVs** writes the same three
  tables in the long format `sweep.js` uses, for Excel or pandas.

**Arena size is two parameters**, `aw` and `ah`, both in mm — the header's size menu sets
published geometries (240 x 240 for foraging, 93 x 93 for a dish, 15 x 15 for kinematics).
Before this was decoupled, only the width was a parameter and the height came from the
browser window, so a config that sets `aw` should now also set `ah`; the ones here do.

**Three parameters cannot be varied.** Stride period (`per`), mean run (`rt`) and pause
fraction (`pf`) are recomputed by the model from the genotype and the local substrate on
every frame, so a value you set for them is overwritten before it does anything. They are
marked *auto* in the page's parameter list and in the batch dropdown. Setting one produces
conditions that are identical to each other, which looks exactly like a broken simulation.

Both front ends check for this generally rather than from a list: after each run they
compare the values you asked for against the parameters the model finished with and report
any that differ — a warning in the page, a `param_ignored` column and an end-of-sweep
warning in `sweep.js`. That catches clamping and any future derived parameter too, not just
these three. To change the stride period, change what drives it — the genotype preset or
the substrate.

This is not hypothetical. The original `cfg_explore.js` swept two of them, and the resulting
parameter-sensitivity table reported one effect twice for a whole analysis before anyone
noticed (README §8c).

**Workers, and why a hosted page is faster.** The page runs simulations in Web Workers,
one per core, when the browser allows it. Chrome and Safari sometimes refuse to start a
worker on a page opened as a `file://` URL, so the runner probes first and silently falls
back to running on the page's own thread — correct results, one core, and the page stays
responsive while it works. The status line says which happened. If sweeps feel slow, that
line is the first thing to look at: serving the file (`python -m http.server`, or hosting
it) is usually what unlocks the other cores.

Everything is client-side. Nothing is uploaded, hosted or not.

---

## 1. One-off setup

You need Node. Nothing else — no `npm install`, no `package.json`, no dependencies. Every
`require` in these files is a Node built-in.

```bash
node --version          # need v16 or newer; developed on v22
```

If that errors: `brew install node` (macOS), `sudo apt install nodejs` (Debian/Ubuntu), or
nodejs.org. On Sussex managed machines where you can't install, `conda install -c conda-forge
nodejs` works inside an environment you already own.

**Keep all the batch files in one folder, together with a copy of
`larval_locomotion_sandbox.html`.** The tools load the HTML from their own directory and run
the real page's code — that is the point of the design, so there is no second implementation
of the model to drift out of sync. Move the HTML away and they stop working.

```
batch/
  larval_locomotion_sandbox.html   <- the model; must be here
  sim.js  sweep.js  report.js  params.js  feasible.js  ocmp_report.js  comp_sweep.js
  cfg_*.js
```

---

## 2. One simulation

```bash
node sim.js '{"duration":300,"seed":1}'
```

Prints a summary table. Takes about half a second for 300 s of larva time.

```bash
node sim.js '{"duration":3600,"seed":4,"params":{"aw":250,"pr":18},"buttons":["s_yeast","m_p4","mix"]}'
```

`JSON=1 node sim.js '...' > one_run.json` gives you the full structure instead — summary,
every patch visit, every turn, and a 1 Hz centroid track.

On Windows, `cmd` hates single quotes. Use PowerShell, or put the JSON in a file and
`node sim.js "$(cat args.json)"`.

### What can I set?

```bash
node params.js                  # all 39 parameters, with defaults and ranges
node params.js memory patch     # only matching ones, with the tooltip text
node params.js --json           # if you'd rather read it from Python
```

`params` take slider ids (`aw`, `pr`, `ocmp`…). `buttons` take preset ids (`s_yeast`,
`m_p4`, `mix`, `h_rut`…) and are applied **first**, so anything you also set in `params`
wins. Sweeps are not clamped to the slider ranges — the `ocmp` dose-response deliberately
runs to 6 against a slider maximum of 3.

---

## 3. Many simulations

Write a config, run it, report it. A config is a plain JS file exporting an object:

```js
// cfg_mine.js
module.exports = {
  duration: 1800,                              // simulated seconds per run
  seeds: 20,                                   // independent runs per condition
  parallel: 2,                                 // workers; set to your core count
  tracks: false,                               // true also writes 1 Hz xy per run
  base: { aw: 250, pr: 18 },                   // applied to every condition
  buttons: ['s_yeast', 'm_p4', 'mix'],
  conditions: {
    on:  { params: { ocmp: 1.2 } },
    off: { params: { ocmp: 0 } },
  },
};
```

```bash
node sweep.js cfg_mine.js out/     # run it
node report.js out/                # mean ± se and sd, per condition
```

**It is resumable.** Re-running skips any run already on disk, so a sweep you interrupt
picks up where it stopped. `node sweep.js --collect out/` rebuilds the CSVs from a sweep
still in flight, if you want to look before it finishes.

To explore what the model can do rather than compare two things, sample instead:

```js
  sample: { n: 220, duration: 600,
            vary: { per: [0.6, 2.0], amp: [0.2, 0.7], migK: [0.2, 1.6] } },
```

That is a Latin hypercube over those ranges. Then:

```bash
node report.js out/ --range        # what came out
node report.js out/ --corr         # which parameters drove it
node feasible.js out/              # which sets match the published kinematics
```

The three configs already here are worked examples: `cfg_explore.js` (parameter space),
`cfg_habituation.js` (conditions), `cfg_ocmp.js` (a dose-response).

### Cost

About 10 s per simulated hour per core. So 120 runs × 2 h on 2 cores took 12 minutes.
Budget roughly `runs × hours × 10 / cores` seconds.

---

## 4. Getting it into Python

Output is long format, one row per run / visit / turn, so it loads directly:

```python
import pandas as pd
runs   = pd.read_csv('out/runs.csv')      # one row per run; p_* are the parameters
visits = pd.read_csv('out/visits.csv')    # one row per patch visit
turns  = pd.read_csv('out/turns.csv')     # one row per turn
track  = pd.read_csv('out/tracks/on_s3.csv')   # 1 Hz centroid, if tracks: true

runs.groupby('condition')[['speed_mm_s', 'turns_per_min', 'border_frac']].agg(['mean', 'sem'])
```

`runs.csv` carries every parameter of every run as `p_<id>` columns, so the CSV is
self-describing — you can reconstruct exactly what produced a row a year from now.

The `report.js` helpers are a convenience, not a dependency. If you'd rather do all the
statistics in pandas, read the CSVs and ignore them.

---

## 5. Moving between the two

A bundle from the page and a sweep from `sweep.js` carry the same tables and the same
`model_fingerprint`. Reading a bundle in Python:

```python
import json, pandas as pd
d = json.load(open('batch_20261020_1630_bundle.json'))
runs   = pd.DataFrame(d['runs'])
visits = pd.DataFrame(d['visits'])
track  = pd.DataFrame(d['tracks']['ocmp=3_s7'])
print(d['model_fingerprint'], d['config'])
```

If two sets of results have different fingerprints they came from different models —
different code, or a changed default — and should not be pooled.

---

## 6. Two things worth knowing before you trust a result

**Seeds.** Between-seed spread in this model is large: sd ≈ 0.08 on border fraction and
0.4–0.7 on turns/min. Use 15–20 seeds per condition. A two-condition comparison on one seed
each is worthless, and the README documents the day that cost me a published-looking result.

**Prefer a dose-response to a single contrast.** Two conditions cannot distinguish "no
effect" from "effect too small to resolve at this *n*", and give nothing to check a positive
result against. Varying a parameter over four levels costs one line of config and buys both:
a flat line across a 5× range is close to decisive, and a result whose shape matches what the
arithmetic predicts is far harder to get by accident than one that is merely significant.
§7c of the README is the worked case — and the case where measuring the obvious quantity
gave exactly the wrong answer.

---

## 7. The measurement scripts

Separate from the sweep harness. Each answers one question, prints its own reasoning, and takes
`[duration_s] [seeds]` unless noted. They drive the same model file as everything else, so a
result here and a result from the page are the same model.

```bash
node bendtrack.js 900 4        # where is the bend, and how fast does it travel?
node bendsweep.js              # the migration / amplitude trade-off table
node bendshape.js 500 3        # bend distribution vs hand-labelled 12-point data
node wvsweep.js 500 3          # can the weathervane reach the measured crawl bend?
node extsweep.js 500 3         # the same, sweeping bend extent as well
node posturefit.js 600 3       # fit postural curvature: amplitude AND persistence
node wavecheck.js 600 3        # do successive waves overlap? what is the head doing?
node wallcheck.js 900 3 '{}'   # behaviour at a boundary, against a geometric null
node wallseq.js 900 4          # what follows a reversal: cast or straight on?
node rotsource.js 600 3        # does rotation require the bend to travel? (89.5% yes)
node castrecoil.js 600 3       # does the cast rotate the body backwards?
node castdef.js 600 3          # how much of that is the cast-end definition? (most)
node widthprofile.js 500 3     # rotation profile with body width and grip asymmetry
node widthprofile.js 500 3 migv  # the same, sweeping migration speed instead
node headingaxes.js            # the headline number on every heading axis
node seglen.js 600 3           # is segment length constant? (no)
node segnorm.js 600 3          # what a variable ruler costs the distance axis
node crawlbend.js 600 3        # crawl bend at 12, 7 and 5 points
node crawlbend.js 1 1 floor    # what a perfectly straight larva reads as
node fitturn.js 80 3 400       # random search over the turn parameters (slow, ~30 min)
```

Two of them need no simulation at all — they test the solver's algebra directly, in a second:

```bash
node asymtest.js               # can a best fit turn grip asymmetry into rotation? (no)
node asymtest.js lat           # the same, showing lateral shift instead
node forcetest.js              # does anisotropy help? does an applied moment? (no; yes)
```

`forcetest.js` validates itself against the page's own solver before reporting anything — if
that check ever fails, the numbers below it are not comparable and it says so.

### The synthetic control

```bash
node synthtrack.js outdir 900 8 10 5   # outdir, seconds, larvae, fps, spine points
python3 synthcheck.py outdir 7         # dir, Savitzky-Golay window
```

Generates model output degraded exactly as the camera and tracker degrade a real larva, with
truth files alongside. `synthetic/SYNTHETIC.md` explains what it is for and what it has already
shown. Run any new analysis through this before spending recordings on it.

### Development utilities

Not part of any result, kept because they produced figures or numbers quoted in the
documentation. All of them drive the shipped HTML through a headless Chromium.

```bash
node measure.js      # control-layout heights, the table in README section 10
node shot.js  <html> <png>   # a screenshot of the page
node zshot.js        # the same, zoomed on the larva
node bounce.js       # wall-collision spot check
node trailtest.js    # trail rendering spot check
node comp.js         # side-by-side of two builds
bash reps.sh "<CLICK>" "<OVERRIDE>" <secs> <n>   # repeat headless runs, averaged
```

`mech_test.js`, `mech_test2.js` and `mech_test4.js` are earlier mechanics probes kept for
provenance; `mech_test3.js` is the one section 6a cites. `cfg_smoke.js` and `cfg_memory.js` are
sweep configurations alongside the three the documentation names.
