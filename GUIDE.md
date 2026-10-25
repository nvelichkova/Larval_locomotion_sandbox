# Start here

An orientation to the larval locomotion sandbox for someone who has not seen it before.
Read this first; `README.md` is the 1500-line reference and is not a good first encounter.

---

## 1. What it is, in one paragraph

A simulation of a *Drosophila* larva crawling, turning and foraging, written as a single HTML
file that runs in a browser with no installation. It is a **neuromechanical** model: a body
with segments that contract, substrate contact that grips and releases, and a behavioural
layer that decides when to turn and when to leave a food patch. The body's shape is commanded;
where that body ends up on the dish is **solved**, not scripted. The same file is the
interactive page, the batch runner, and the model that the headless Node scripts drive, so
there is exactly one copy of the model and no chance of the page and the analysis diverging.

Open `larval_locomotion_sandbox.html` in a browser. Nothing else is required to use it.

---

## 2. The one idea worth understanding

Everything else follows from this.

The body is 12 midline points making 11 segments (T1–T3, A1–A8), 4 mm long. Each timestep:

1. The **local shape** is rebuilt from scratch — 11 segment lengths and 10 bend angles. A
   peristaltic wave shortens segments in sequence; a turn adds a bend near the front.
2. Some points are **gripping** the substrate and some are not. A segment in the swing phase
   of a wave releases; during a head sweep the anterior releases and the abdomen stays planted.
3. The body is then **placed** in the world by finding the rigid motion — translation and
   rotation — that best fits the new shape onto where the gripping points currently are.

Step 3 is the whole trick. **Nobody tells the larva to move forward or to turn.** Forward
progress is what falls out of contracting segments while the planted ones hold; a turn is what
falls out of bending while the abdomen holds. Crawling speed, stride length, turn angle and
trajectory are *outputs*, which is what makes them worth comparing against real measurements.

If you change one thing in this model, understand what it does to step 3.

> **A refinement worth knowing early.** That "best fit" is a weighted least-squares problem,
> and setting its derivatives to zero gives a force balance and a torque balance with isotropic
> springs. So the model was always doing statics — its springs simply pull equally in every
> direction. This matters for §6 below.

---

## 3. What you can do with it

- **Watch one larva.** Open the page. It crawls immediately. The right-hand panels show the
  peristaltic wave as a kymograph and the bend angles as a second one.
- **Change something and see what happens.** Every parameter is a slider with a tooltip saying
  where its value came from — a paper, or a note that it was calibrated here.
- **Run batches.** From the page (`Batch` button) or from Node (`sweep.js`). Output is CSV.
- **Export.** Trajectories as CSV, figures as PDF, replays as video clips.
- **Import real tracking data** and play it back through the same display.

`RUNNING.md` is the how-to for all of that.

---

## 4. What it is for

Three kinds of question:

1. **Does a mechanical account reproduce published kinematics?** Crawl speed, stride length,
   wave period, turn rate and turn size all come out of the mechanics rather than being set.
   §6a of the README lists what the model produces against what the literature reports.
2. **What does a measurement do to an answer?** The model can be run and then *degraded exactly
   as a camera and tracker degrade a real larva* — 5 spine points, 10 fps, whole pixels — with
   the truth kept alongside. This has already shown that one headline turn statistic is
   **biased, not merely noisy**, reporting a between-condition difference seven times too large
   with the opposite sign. See `synthetic/SYNTHETIC.md`. If you are designing an analysis, run
   it through this first.
3. **Foraging decisions.** Patch leaving as evidence accumulation, comparative memory between
   patches, habituation to the arena wall.

---

## 5. What is solid

- **Crawling.** Speed, stride length and wave period match published values and were not tuned
  to do so.
- **The foraging layer.** The comparative-memory effect is real and dose-dependent, 3/3 across
  seeds at |z| up to 8, once the censoring problem is handled — residence time is censored by
  the very effect it measures, so the uncensored read-out is the decision *rate*.
- **The three-host architecture.** Page, Node and Web Worker instantiate the same model source
  with every global shadowed. Same seed, bit-identical results.
- **The synthetic control.** Known-truth recordings for testing an analysis before spending
  real recordings on it.

## 6. What is broken, and it is the turns

This is the honest state of play and the thing anyone joining should know.

Real larvae reorient **early**: 26% of a 58° turn happens in the first half segment-length of
crawling, decaying to zero by about five. The model does not. Measured by rotation rate against
distance crawled, among turns reaching each bin:

| | 0–0.5 | 0.5–1 | 1–1.5 | 2–3 | 3–4 | 4–5 |
|---|---|---|---|---|---|---|
| real larvae | **+0.259** | +0.104 | +0.072 | +0.046 | +0.024 | +0.008 |
| the model | −0.015 | −0.035 | −0.056 | +0.051 | +0.125 | −0.019 |

The model is **negative at the start** — it turns the wrong way — and delivers its rotation
late and spread over 10–20 segment lengths. At trace level that is the visible difference: the
model draws long sweeping arcs where a real larva makes a sharp reorientation. (The *runs* no
longer go straight — §8k added the body-wide postural curvature that was missing, and
trajectories now curve continuously. The turns are the part still wrong.)

What is **not** wrong is the amount. Post-cast rotation is +55° in the model against +57° in real
larvae (§8j). The defect is where that rotation lands in distance, not how much there is — which
matters, because it means the fix has to redistribute rotation rather than add it.

Four candidate fixes have been built and measured, and all four failed:

| fix | result |
|---|---|
| faster bend migration (`migV`, `migK`) | early bins get *more* negative; no turns at all above `migV` 4 |
| articulation leaving with the profile (`bexit`) | no change to rotation — but it fixed the *bend distribution*, and is now the default (§8i) |
| giving the body width (`rsp`) | <1% effect on fitted rotation |
| bilateral grip asymmetry (`asym`) | 4% even at a 30:1 anisotropy |

The reason they failed is one thing: **rotation in this model is bounded by the shape change.**
The placement step only decides where a prescribed shape sits, so no contact model can extract
more rotation than the shape trajectory affords.

What does work, tested in the isolated solver, is an **applied yaw moment** — the moment an
asymmetric muscle contraction exerts about the body, resisted by the ground rather than by a
best fit. Rotation is linear in it, has no ceiling, and it flips the sign of the cast-phase
recoil. That is the open piece of work. It is written up in README §8g, including what it costs:
the model's core claim becomes *solved from an actuation model* rather than *solved, never
prescribed*, and every result would be re-derived against it.

**Do not start that without reading §8e through §8g.** Three plausible fixes were refuted there,
and the fourth is plausible in the same way.

## 7. Two traps that have each cost a wrong result

Mentioned here because they are easy to repeat.

- **Absolute values of a signed quantity.** A rotation that recoils reads as progress when you
  average its magnitude. This put a wrong "20% of the turn happens during the sweep" into the
  documentation; signed, it is −2.6°, and the sweep contributes nothing.
- **Unstated definitions.** The headline turn statistic moves from 0.031 to 0.232 on *the same
  turns* from a head-angle definition change alone. Distances in "segment lengths" depend on
  which segment length — the nominal resting value is 16% off the honest one. Quote the
  definition with the number, always.

---

## 8. Where things live

| file | what it is |
|---|---|
| `larval_locomotion_sandbox.html` | the model, the page, the batch runner — everything |
| `GUIDE.md` | this file |
| `README.md` | the full reference: mechanics, parameters, provenance, findings, limitations |
| `RUNNING.md` | how to run single simulations, batches, and get results into Python |
| `synthetic/` | known-truth recordings and the control they support |
| `sim.js`, `sweep.js`, `report.js`, `params.js` | the headless harness |

Measurement scripts, each answering one question and printing its own reasoning:

| script | question |
|---|---|
| `bendtrack.js` | where is the bend and how fast does it travel? |
| `bendshape.js` | does the bend sit along the body the way a real larva's does? |
| `rotsource.js` | does rotation need the bend to travel? (89.5% yes) |
| `castrecoil.js` | does the cast rotate the body backwards? (yes, but see `castdef.js`) |
| `castdef.js` | how much of that answer is the cast-end definition? (most of it) |
| `widthprofile.js` | does width or grip asymmetry front-load rotation? (no) |
| `asymtest.js` | can a best fit convert grip asymmetry into rotation? (no, <1%) |
| `forcetest.js` | does anisotropy help, and does an applied moment? (no; yes) |
| `seglen.js`, `segnorm.js` | is segment length constant? (no; 17% crawl/cast) |
| `crawlbend.js` | how much crawl bend does the measurement chain manufacture? |
| `wvsweep.js`, `extsweep.js` | can the weathervane reach the measured crawl bend? (no) |
| `posturefit.js` | fit the body-wide curvature to amplitude and persistence at once |
| `synthtrack.js`, `synthcheck.py` | generate and read the known-truth recordings |

---

## 9. If you are picking this up

A reasonable first hour:

1. Open the page. Watch it crawl. Drag `Cast amp` and `Bend migrate` and see the turns change.
2. Drag `Denticle rows` to 0.22 to see the substrate contacts, which are otherwise on the
   midline. It is off by default because it changes results without improving them.
3. `node params.js` to see every parameter, its default, its range and its provenance.
4. `node sim.js '{"duration":600,"seed":1}'` for one headless run.
5. Read README §6a (what the model produces) and §8e–§8g (what is broken and why).
6. Run `node castrecoil.js 600 3`. It prints the central defect in six lines.

If you want to help, the highest-value open items are the applied-moment work in §8g, and
measuring signed cast-phase rotation on real turns (`STAGE13_FOLLOWUP.md`) — a measurement on
real recordings rather than a modelling task, and the thing the whole §8g case rests on.

One habit this project has earned the hard way: **a mechanism refuted against one measure is
refuted against that measure only.** `bexit` was written off in §8e on the rotation profile and
turned out to be right on the bend distribution (§8i), which nothing could test until
hand-labelled 12-point data existed. Check what a result was measured against before trusting
it.
