# Larval locomotion sandbox

**▶ Run it in your browser: https://nvelichkova.github.io/Larval_locomotion_sandbox/**
(the **Docs** button in the page explains every mechanism, with equations and code)

An interactive, literature-parameterised model of *Drosophila melanogaster* third-instar larval
crawling, head casting and substrate exploration. Single self-contained HTML file, no dependencies,
no build step — open `larval_locomotion_sandbox.html` in any modern browser.

> **New to this?** Read **`GUIDE.md`** first. This file is the full reference and is organised
> for looking things up, not for a first encounter. `RUNNING.md` is the how-to for simulations.

> **Status.** Crawling, the foraging layer and the measurement-control machinery are sound and
> validated (§6a, §7a, `synthetic/`). **The turns are not.** The model rotates the wrong way at
> turn onset and delivers rotation far too late; four candidate fixes have been built and
> refuted. §8e–§8g document the measurements and what would actually be required. Anyone
> working on turning should start there.

---

## 1. What this is

A **quasi-static neuromechanical model**. Three things are modelled explicitly:

1. **A relay of segmental contractions** (peristalsis) propagating along a chain of 11 named segments.
2. **Substrate contact** that is actively modulated — segments release from the ground when they
   contract, and the anterior releases during head sweeps.
3. **A behavioural state machine** on top: run, pause, head cast, backward crawl.

Around that sit the things you need to use it as an instrument rather than a demo: batch
simulation across every core the browser will give it (§8b, §8d), vector figure export and video
clips (§9), and a headless Node harness that runs the same model file for long or scripted sweeps
(`RUNNING.md`).

The animal's **translation and rotation are not prescribed anywhere**. They are solved for, each
timestep, from which parts of the body are gripping the substrate and which are not. There is no
"speed" variable, no steering term, no pivot point. If you set swing release to 0 — nothing ever
lets go of the ground — the larva cannot move at all, which is the correct degenerate case.

### What it is *not*

- Not a dynamic simulation. There are no masses, no forces, no inertia. It solves *where the body
  ends up*, not *what forces produced it*. This is the overdamped limit, reasonable at this scale,
  but it means the model cannot predict ground reaction forces.
- Not a neural model. Contractions are relayed by a timer-and-probability rule, not by a circuit.
  There are no neurons, no proprioceptive feedback, no CPG dynamics.
- Not fitted. Parameters are set from published measurements and the resulting kinematics are
  *compared* to published measurements. Nothing was optimised.

---

## 2. Body representation

```
head                segment boundaries                       tail
  •———•———•———•———•———•———•———•———•———•———•———•
  0   1   2   3   4   5   6   7   8   9  10  11      ← 12 midline points
    T1  T2  T3  A1  A2  A3  A4  A5  A6  A7  A8       ← 11 segments
      ↑   ↑   ↑   ↑                                  ← bend applied here (default extent 4)
     T1/T2 … A1/A2
```

- **12 midline points**: the head extremity, 10 segment boundaries (`T1/T2` … `A7/A8`), the tail
  extremity. Eleven spine points is what larval tracking software typically extracts, so the
  representation is deliberately comparable to tracking output.
- **11 segments**: T1–T3 thoracic, A1–A8 abdominal. Body length 4 mm, so segments are 0.364 mm at rest.
- **Larvae have no joints.** The angles reported and plotted are *intersegmental bend angles* at
  segment boundaries. There is no skeletal articulation anywhere in this model and the word "joint"
  is not used.

Body shape at any instant is fully specified by 11 segment lengths and 10 intersegmental bend
angles. Shape is rebuilt from scratch each timestep — it never accumulates numerical drift.

**Segment length is not constant.** `len = SEGLEN*(1 - amp*contr)`, so a segment at full
contraction is half its resting length, and the whole body is 3.35 mm while crawling against
3.92 mm while casting. Anything normalised "per segment length" has to say which one; §8e-i
measures what the choice costs.

### Width

The body also has width, though it is off by default. `rsp` is the half-spacing of the two
ventral denticle bands — the belts are paramedian, so it is less than the body half-width of
about 0.4 mm — and it tapers to head and tail with the body. With `rsp` above 0 the substrate
contacts live on those two rows rather than on the midline, 2·NP of them, and the body can
tell its left side from its right. `asym` then makes the inside of a bend grip harder than the
outside.

Both default to 0, which collapses the rows onto the midline and reproduces the original line
body bit for bit. They are off because **they were measured and they do not help** (§8f): width
costs about 8% of turn amplitude and changes the rotation profile not at all. They are kept as
instruments, and because the question "would width fix the turns?" is an obvious one that
deserves a measured answer rather than an opinion.

---

## 3. The mechanics

This is the core of the model and the part worth understanding.

### 3.1 The problem

A soft-bodied crawler has its whole ventral surface in contact with the substrate. It moves by
changing shape, not by pushing off a limb. So "where does the body go when it changes shape?" is
answered by friction: parts that grip stay put, parts that are released slide.

### 3.2 The solution: weighted Procrustes placement

Each timestep:

1. **Build the shape** in a body-local frame from current segment lengths and bend angles.
2. **Assign a contact weight** `w_j ∈ (0,1]` to each of the 12 points (section 3.3).
3. **Place the shape in the world** by finding the rigid transform (rotation `R`, translation `T`)
   that minimises

   ```
   Σ_j  w_j · ‖ R·r_j + T − q_j ‖²
   ```

   where `r_j` is the new local shape and `q_j` the previous world position. This is a weighted
   Kabsch/Procrustes fit with a closed-form 2D solution — no iteration, no solver.
4. **Apply friction anisotropy** (section 3.4) and refit once.

Heavily weighted points barely move; lightly weighted points absorb the displacement. Net
translation and net rotation of the body fall out of the fit. Nothing is privileged — not the head,
not the tail, not the centroid.

With `rsp` above 0 the fit is solved from the two denticle rows instead of from the midline —
2·NP points, each with its own weight — and the resulting transform is then applied to the whole
body. At `rsp` 0 it falls back to the midline fit, bit for bit.

> **What this least-squares fit actually is.** Minimising `Σ w‖d‖²` and setting the derivatives
> to zero gives `Σ w·d = 0` and `Σ w(r × d) = 0` — a force balance and a torque balance with
> **isotropic linear springs** of stiffness `w`. So the placement step is not an alternative to
> statics; it *is* statics, with one restriction: its springs pull equally in every direction.
> A contact that grips harder therefore resists motion in all directions and cannot steer, which
> is why bilateral grip asymmetry does nothing (§8f) and why the turns are wrong (§8g).
> `forcetest.js` makes the equivalence explicit — its anisotropic solver reproduces this one to
> 7×10⁻¹⁵ when the anisotropy ratio is 1.

### 3.3 Contact weights

```
w_j = 1 − release × contraction_j                 (baseline)
w_j = w_j × (1 − anterior_release × (1 − C_j))    (additionally, during a head sweep)
```

where `contraction_j` is the larger of the contraction of the two segments meeting at point `j`,
and `C_j` is a fixed anterior profile `[0.05, 0.10, 0.30, 0.60, 0.85, 0.95, 1, 1, 1, 1, 1, 1]`
running head → tail. So during a cast the head and the first two or three boundaries release while
everything from mid-abdomen back stays fully planted. **The tail never leaves the substrate during
a cast.**

With `rsp` above 0 each point's weight is split between its two denticle rows,

```
w_left  = w_j × (1 + asym × κ_j)        κ_j = local bend, scaled so a full sweep is ±1
w_right = w_j × (1 − asym × κ_j)        the product is capped at ±0.95
```

on the reasoning that the inside of a bend has compressed cuticle, so the belts bunch and grip
harder per unit path length, while the outside is stretched. `wts` remains the mean of the two,
so the history buffer, the CSV and the kymographs still carry one contact value per point.
Measured effect: under 1% (§8f).

### 3.4 Friction anisotropy

Denticle belts have anterior–posterior polarity, so backward sliding is resisted more than forward
sliding. Implemented as a second pass: any point whose provisional displacement has a backward
component gets its weight multiplied by `μ_bf` (default 10) and the fit is repeated. This is a
two-pass approximation to a proper friction cone, not an exact solution.

### 3.5 Why this produces crawling

With a posterior→anterior wave, the released region travels forward along the body. Shortening at
the released region is taken up by that region moving forward relative to the planted remainder.
As the wave advances, the "slack" is passed up the body, and when it reaches T1 the head extends.
Net result: forward displacement per wave. Reverse the relay direction and the animal reverses.
This is the classic peristaltic mechanism and it requires no asymmetric friction at all — μ_bf
only scales it.

**Stride length is therefore an output, not an input.** It emerges from contraction amplitude and
from how many segments are released simultaneously (contraction duration ÷ intersegmental delay).

### 3.6 Why this produces turning

During a cast the anterior releases and the abdomen is planted, so the fit rotates the anterior
around a planted posterior — the head sweeps, the body does not swing.

Converting that sweep into a lasting heading change needs care, and two obvious implementations
both fail. This section is written from measurements, not intuition: see §6a.

**Decay in place fails.** A forward wave releases the posterior first and reaches the anterior last,
so a bend that simply decayed at the thorax would straighten at the moment the anterior is released
— moving the head back toward the body axis and undoing the turn on every wave. Measured realised
turn for a commanded 60 deg sweep: **7 deg**.

**Migrating the bend on a clock also fails.** The region of asymmetric contraction does progress
retrogradely over roughly three waves following a head sweep, with the peristalsis anterior to it
pulling posterior segments into the bend (Lahiri et al. 2011). But driving that migration from a
timer decouples it from how far the animal has actually crawled. Measured: **7-22 deg** depending
on the rate, and it inverts (-5 deg) if the migration outruns the body.

**Locking migration to distance crawled works.** `bendPos` advances by `migK` boundaries per
segment-length of centroid travel. At `migK = 1` the bend is fixed in the *world* and the body
threads through it — follow-the-leader kinematics, the same reason a train follows its engine. The
bend profile is renormalised so the commanded articulation is conserved while it is inside the body,
and the turn is scored when the bend exits at the tail rather than on a fixed clock. Measured
realisation of a commanded sweep:

| `migK` | cast 30 deg | cast 60 deg | cast 90 deg |
|---|---|---|---|
| 0.6 (default) | 33 deg | 53 deg | 67 deg |
| 1.0 | 21 deg | 31 deg | 30 deg |
| 1.5 | 13 deg | 20 deg | 15 deg |

Slower-than-world-fixed migration realises the sweep best, which is a property of the rigid-fit
placement rather than a prediction about larvae — treat `migK` as calibration, not as a measured
quantity. You can watch the bend march from T1/T2 to A7/A8 in the intersegmental bend panel after
each turn. Set anterior release to 0 and you see the broken version: nothing releases during the
sweep, so the whole body has to pivot.

### Where a turn's rotation comes from, and what that costs

Measured with `bendtrack.js` and `bendsweep.js` (85 turns, 4 seeds x 600 s, 200 x 200 mm arena),
prompted by comparing the model against the muscle-imaging literature.

**Where the bend sits.** At the moment of maximum bend the peak is at boundary 4.1 — A1/A2 — with
its trailing edge at 5.8, around A3/A4. Zeng et al. (2021) put the bend point of a head cast near
A2/A3, boundary 5. So the model's bend is about one boundary anterior of the imaging, which is
closer than the onset position suggests: the profile *starts* peaked at T2/T3 and has already
migrated by the time the bend is strongest. Initiation stays thoracic, as Berni (2015) requires.

**How fast it travels.** The peak moves **0.69 boundaries per completed wave** (sd 0.46, n 288).
Zeng's realignment sequence — segments near A2/A3 realigning in the second-to-last wave, A5-A7 in
the last — implies something closer to 2. The model is roughly a third of the rate the imaging
suggests.

**Why it cannot simply be sped up.** Rotation in this model is produced *by* the bend travelling,
not by the sweep. Cumulative heading change through a turn:

| waves since sweep | mean abs. heading change | share of final |
|---|---|---|
| 0 (the sweep itself) | 3.5 deg | 20% |
| 1 | 4.7 deg | 26% |
| 3 | 5.8 deg | 32% |
| 4 | 13.7 deg | 76% |

(Absolute values of a signed quantity, so the series need not be monotonic, and it is not — at two
waves it dips to 0.7 deg, which is a heading swinging back rather than a rotation undone.)

> **Correction (§8g).** The sentence that used to follow — "the share at wave 0 is the robust
> number" — was wrong, and so is reading that 20% as a contribution. Absolute values cannot be
> negative, so a recoil is counted as if it were progress. Signing each turn's rotation against
> its own final direction (`castrecoil.js`) gives the sweep **−2.6°**, against **+4.3°** unsigned
> — a 9% "share" that is really a negative contribution, and 95% of turns are negative during the
> cast. The sweep does not contribute a fifth of the turn; it contributes nothing and slightly
> opposes it. The decision rule stated at the end of this section was built on the unsigned
> figure and should be read with that in mind.

**Four fifths of the heading change happens during the migration.** Migration rate and turn
amplitude are therefore the same mechanism seen twice, and the constraints collide:

| migK | travel/wave | mean abs. turn | turns/min |
|---|---|---|---|
| 0.6 (default) | 0.70 | 50 deg | 2.4 |
| 1.0 | 1.14 | 28-31 deg | 3.1-3.9 |
| 1.4 | 1.60 | 10-14 deg | 3.4-6.6 |
| 1.8 | 2.00 | 8-10 deg | 4.7-6.0 |

Raising the commanded cast does not rescue it: at `migK` 1.4, going from 55 to 105 degrees of cast
*lowers* the realised turn from 14 to 10 degrees while the turn rate rises to 6.6/min, because
larger sweeps are straightened before they are realised and the failed attempts are counted as
turns. **No combination of migration rate and cast amplitude satisfies the travel rate, a
reorientation-sized turn, and the published 1.7-2.8 turns/min at once.**

That is a structural limit of this implementation, not a tuning problem. Either the model's
rotation should come from the sweep rather than from the bend's passage, or the imaging's
realignment sequence tracks something other than the bend peak — most likely its trailing edge,
which travels at 0.75 boundaries per wave here and so is no better a match.

**The experiment that settles it** is on real tracking data, not in the model: take spine
trajectories through turns, compute the per-boundary bend angle series, and measure what fraction
of the net heading change has accumulated by the end of the head sweep, before the next forward
wave. If it matches the model, the architecture is right and only `migK` needs raising, with turn
amplitude restored some other way. If it is most of it, rotation belongs in the sweep and the
bend's passage is a consequence rather than the cause.

**That experiment has now been run**, on both sides. It is acutely definition-sensitive — the
same real turns give 0.031 or 0.232 depending only on how the head angle is defined, so the
single number is not the discriminator it was meant to be. The discriminator that does work is
the rotation rate against distance crawled among turns *reaching* each bin (§8e), and it says
rotation belongs in the sweep: real larvae put 26% of a 58° turn into the first half segment
length and are done by five, while the model is negative there. §8g is the consequence.

---

**Ordering trap.** The bend state machine must test `cast` *before* the straightening hold. Putting
the hold first short-circuits the cast branch, so a sweep that begins while a previous turn is still
straightening never completes — the animal freezes mid-cast and stops crawling entirely. This cost
an evening; the headless harness caught it in one run.

---

## 4. The behavioural state machine

| State | What happens | Exit |
|---|---|---|
| `run` | Waves initiate every stride period, posterior→anterior. Weathervane adds low-amplitude bend. | Run timer expires (exponential), wall contact, or pause |

**Wave gating.** A wave may start once the relay front has reached the far end of the body — after
`(N-1) x intersegmental delay` — not after the last segment has also finished contracting. With the
measured 90 ms delay that is 0.9 s, which is exactly what a 1.07 s stride period at duty 0.83
leaves for the wave. Gating on relay-plus-contraction instead inflates the cycle to 1.5 s and drags
crawling speed down to 0.37 mm/s; gating on the relay alone gives 0.62 mm/s against a measured
0.64 ± 0.02. The stride period is floored at the relay traverse time, since asking for a stride
faster than the relay that carries it is meaningless.
| `pause` | No waves. Bend relaxes. | After an exponential interval (mean 1.5 s) |
| `cast` | No waves. Anterior releases, head sweeps out and back at 0.6 Hz. | A sweep is accepted |
| `back` | Waves initiate anterior→posterior, 1.35× slower. | After 2 strides → cast |

**Cast decision rule.** The decision is taken at the **peak** of each sweep, not at the end. Accept
with probability `accept_prob`; on rejection the sweep completes, the direction flips, amplitude is
multiplied by `cast_growth`, and another sweep begins. Forced acceptance after 5 sweeps. Near a
wall, acceptance additionally requires the proposed heading to point into the arena, and after 6
failed sweeps the larva reverses to get clear. The turn angle is therefore an *outcome* of which
sweep was accepted, not a sampled parameter.

**Turn angle measurement.** Heading at cast onset versus heading once the bend has migrated out of
the body (capped at 25 s). A fixed 2 s window truncates the turn while the heading is still
rotating, which under-reports it by roughly half.

**Wall behaviour.** A wall counts as an obstacle only when the *head direction* has a negative
component along the inward wall normal — contact alone is not enough, so a larva running parallel
to a wall follows the edge rather than reacting to it. What the animal then does depends on how
habituated it is (§4a), not on a fixed reflex. A sweep near a wall is only accepted if the resulting
heading points into the arena; after four failed sweeps the cast direction is pinned to the open
side rather than alternating, and after eight the larva reverses to get clear.

---

## 4a. Boundary habituation

Larvae really do accumulate at arena edges — in a 5.8 cm arena naïve larvae leave the centre within
about 30 s and show a significant edge preference — so edge dwelling is not a modelling artefact to
be suppressed. What is well quantified is **habituation of the mechanosensory response**, and since
the boundary response here *is* a mechanosensory reflex, that is what governs it.

The response runs down a hierarchy with repeated contact:

| Habituation level | Response |
|---|---|
| > 0.66 | reversal — two backward strides, then a cast with probability `rvp` (§8n) |
| 0.33 – 0.66 | turn only — cast away from the wall |
| 0.12 – 0.33 | pause |
| < 0.12 | none — keep crawling along the wall |

Decay happens only while the head is driving into the wall; recovery only once clear. Two
mechanisms, both from the vibration-habituation data:

- **Sustained contact** decays the response with τ_des (wild type 18.9 s).
- **Each discrete touch** carries a dose in equivalent seconds, because the repeated-pulse protocol
  steps the response down per pulse even with long gaps between them. Default 3 s per touch.
- **Recovery** uses τ_res (wild type 5.3 s) and accelerates with the number of contacts in the
  current bout — by the fourth contact the response returns in under a second.
- Habituation is one-way within a bout: the response never climbs back up the hierarchy until the
  larva is clear.

The four preset buttons are the published mutant time constants: WT 18.9/5.3 s, *rut* 5.2/3.6,
*dnc* 14.3/9.8, *cam⁰* 25.6/6.5. They dissociate desensitisation from re-sensitisation, so they are
a real test rather than a cosmetic option.

**Measured effect** — and a correction. The first version of this table was wrong, because the
harness that produced it swept a seed that had no effect (see *A fifth bug*, below). Re-measured
with 20 working seeds per condition, 900 s each, uniform agar:

| Condition | Border time | Turns/min | Speed mm/s |
|---|---|---|---|
| No habituation | 0.451 ± 0.019 | 3.97 ± 0.15 | 0.550 |
| *cam⁰* (slow) | 0.446 ± 0.023 | 3.27 ± 0.10 | 0.562 |
| Wild type | 0.475 ± 0.017 | 3.31 ± 0.09 | 0.562 |
| *dnc* | 0.479 ± 0.019 | 3.24 ± 0.11 | 0.561 |
| *rut* (fast) | 0.477 ± 0.024 | 2.91 ± 0.08 | 0.569 |

(± is the standard error of the mean; the between-seed sd is 0.07–0.11 for border time and
0.34–0.67 for turn rate.)

**Habituation does not reduce time spent at the border.** All five conditions sit between 0.45 and
0.48, inside one standard error of each other and far inside the between-seed spread. The earlier
claim of a monotonic fall from 61% to 38% was an artefact of comparing single runs.

What habituation *does* change is **turn rate**, from 3.97 to 2.91 per minute between no
habituation and the fastest-habituating mutant. That is a real effect — the gap is several standard
errors — and it has a coherent reading: a habituated larva stops reversing and casting at the wall
and simply crawls along it. It is at the wall just as much; it does less there. The published
behavioural measure that would distinguish these is turn rate near the boundary, not occupancy.

Note also that turn rate without habituation (3.97/min) sits above the published 1.7–2.8, and with
it (2.9–3.3) much closer — so habituation improves agreement on the metric it actually affects.

**Correction (2026-10-26): the turn-rate effect was a bug.** The habituation code did not do what
this section describes. `lastClear` was refreshed on every step clear of the wall, so (1) the
contact dose was applied every 0.5 s of *continuous* pressing rather than once per touch, (2)
touches shorter than 0.5 s got no dose at all, and (3) the 8 s bout reset never fired, so the
contact count grew for the whole run and recovery kept getting faster. Fixed to one dose per touch
onset (a re-touch within 0.5 s is the same touch) and a bout that ends after 8 s clear.

Re-measured with `cfg_habituation.js` (20 seeds × 900 s, uniform agar), on the current model just
before and just after the fix. The table above is from an earlier model version, so its absolute
values differ from the "before" column. ± is the standard error.

| Condition | Border time, before | Border time, after | Turns/min, before | Turns/min, after | Speed mm/s, before | Speed mm/s, after |
|---|---|---|---|---|---|---|
| No habituation | 0.497 ± 0.031 | 0.497 ± 0.031 | 3.61 ± 0.10 | 3.61 ± 0.10 | 0.390 | 0.390 |
| *cam⁰* (slow) | 0.502 ± 0.027 | 0.478 ± 0.024 | 3.09 ± 0.10 | 3.67 ± 0.13 | 0.406 | 0.385 |
| Wild type | 0.478 ± 0.024 | 0.472 ± 0.033 | 3.12 ± 0.09 | 4.01 ± 0.19 | 0.406 | 0.387 |
| *dnc* | 0.502 ± 0.033 | 0.489 ± 0.025 | 2.98 ± 0.10 | 3.74 ± 0.13 | 0.410 | 0.388 |
| *rut* (fast) | 0.559 ± 0.031 | 0.482 ± 0.025 | 2.69 ± 0.09 | 3.48 ± 0.13 | 0.425 | 0.398 |

Border time is still unaffected by habituation. **Turn rate no longer falls with habituation**:
with the fix all five conditions are within about two standard errors of each other, and wild type
sits slightly *above* no habituation. Habituation itself still happens — mean response level at
the end of a run is 0.99 with none, 0.93 wild type, 0.76 *rut* — but one dose per touch is far
less than one dose per half-second of pressing, and that is not enough to change how often the
larva turns. The reading above ("a habituated larva stops reversing and casting at the wall"), and
the claim that habituation brings turn rate closer to the published 1.7–2.8, no longer hold.

---

## 4b. Touch stimulation (poking the larva)

**Click the larva** in the arena to poke it (the cursor turns to a crosshair over the body), or set
**Auto-poke** (`pki`, Boundary panel) to poke the head every *n* seconds on a random side. A click
counts as a hit within 0.5 mm of the midline or 8 screen pixels, whichever is larger, and is
classified by where along the body it lands and on which side:

| Region | Response |
|---|---|
| Head (T1–T3) | By touch habituation level, below |
| Mid-body (A1–A6) | A short pause, Exp(0.8 s), if crawling forward |
| Tail (A7–A8) | Logged only. Real larvae accelerate forward; not modelled |

Head pokes use the same four-level hierarchy as the wall, chosen from the level *before* the poke's
dose:

| Touch level | Response |
|---|---|
| > 0.66 | reverse 2 waves, then turn **away from the poked side** with probability `rvp` |
| 0.33 – 0.66 | turn — a head sweep starting away from the poked side |
| 0.12 – 0.33 | pause |
| ≤ 0.12 | none |

A poke during a reversal adds one more backward wave. "Right" is the side a positive bend turns the
head toward, which is the larva's right as seen from above in the arena view.

**Habituation is separate from the wall's** — its own level, the "Touch resp" stat tile — but uses
the same equations and time constants (`tdes`, `tres`, `cdose`, `rgain`): one dose per poke (a poke
within 0.5 s of the last is the same touch), recovery between pokes that speeds up within a bout,
and a bout that ends after 8 s without a poke. Keeping it separate means a poke protocol does not
change the wall response, and every wall result above still stands.

**Measured, and a known gap.** Auto-poke at 2, 5, 10 and 30 s intervals (20 seeds × 600 s each,
100 × 50 mm agar): every head poke got a full reversal — 100 % at every interval. With the wall's
parameters the touch level never falls below the reversal threshold: one poke removes only about
15 % of it, and it recovers before the next. A wall offsets this because sustained pressing keeps
driving the level down; a poke is instantaneous. Even with `rgain` = 0, pokes every 2 s settle at a
level of about 0.76. Real larvae do habituate to repeated gentle touch (Kernan et al. 1994, from
memory — to be checked), so pokes probably need their own dose and recovery parameters, fitted to a
published repeated-touch curve. Also: at 2 s intervals every poke lands during the previous
reversal and extends it, so the larva reverses continuously.

Verified: the larva turned away from the poked side in 48 of 48 poke-triggered turns (8 seeds, both
sides, with and without postural curvature), and runs without pokes are bit-for-bit unchanged.

**Output.** Each poke draws a fading ring and a purple tick at the top of both kymographs, and is
logged — the **Pokes** button exports time, source (mouse / auto), region, side, level and touch
habituation before the poke, response, and the state it interrupted. Batch runs and the Node tools
add `n_head_pokes`, `poke_reverse_frac`, `poke_turn_frac`, `poke_pause_frac`, `poke_none_frac` and
`touch_habit_end` to each run's summary. `report.js` does not show these by default; name them:
`node report.js out/ poke_reverse_frac poke_turn_frac touch_habit_end`. For scripted protocols,
`runSim` takes an `onFrame(hook)` callback called every 0.05 s of simulated time, and
`hook.poke(region, side, source)` pokes from it. Clicks are ignored during replay.

---

## 5. Parameters and their provenance

Every slider has a tooltip with its source. Summary (third instar unless noted):

### Arena size

`Arena W` and `Arena H` are both in mm and both explicit. The size menu in the header offers
the geometries the literature actually uses:

| Arena | Study | What it is for |
|---|---|---|
| 15 x 15 mm | Heckscher et al. 2012 (apple-juice agar cap) | single-larva kinematics over 3-5 min |
| 93 x 93 mm | Ohyama et al. 2013 (Petri dish) | nociception assays |
| 240 x 240 mm | Wosniack et al. 2022 | foraging, patch geometry |
| 250 x 250 mm | Ohyama et al. 2013 | high-throughput behaviour |

The two groups measure different things. On a 15 mm cap a larva barely meets a wall in the
few minutes of a kinematics recording, so stride, speed and wave timing are clean. Anything
about turning, exploration or edge occupancy needs the large square arenas, because in a
small one the boundary itself generates turns (limitation 10, §11).

**The height used to come from the browser window**, and only the width was a parameter.
Identical settings produced a 100 x 35 mm arena in a wide window and 100 x 80 mm in a tall
one - a 2.3x range in area and in the perimeter-to-area ratio that border occupancy depends
on - so live results were not reproducible across window sizes, the live view disagreed with
the headless harness (fixed at 0.5), and a square arena could not be asked for at all. The
arena is now its own size and the view letterboxes it; empty space in the panel is the
correct answer. Every result in this README was produced headlessly at height = width / 2
and is unaffected, but configs that set `aw` now state `ah` explicitly to keep that
geometry.

### Three parameters are derived, not set

**Stride period (`per`), mean run (`rt`) and pause fraction (`pf`) cannot be varied.**
`applyLocal()` recomputes all three from the genotype preset and the local substrate on
every frame, so a value written to them is overwritten before it can affect anything. They
are shown in amber in the control panel and marked *auto* in the batch parameter list.

This matters most in batch work, because a sweep over one of them produces conditions that
are byte-identical to each other — which is indistinguishable, at a glance, from the seed
bug in §*A fifth bug*. To change the stride period, change what drives it: the genotype
preset (rover vs sitter) or the substrate.

The derivation is deliberate. Stride period follows from the target speed and the measured
stride length, floored at the wave duration, because a wave cannot be shorter than the relay
that carries it; pause fraction is then whatever is needed to reconcile the two. Making
these independent sliders would let the page be set to a combination the animal cannot
produce.

### Peristalsis

| Parameter | Default | Source |
|---|---|---|
| Stride period | 1.07 s | 1.07 ± 0.12 s, Sun et al. 2022. Normal range 0.6–2 s, Liu et al. 2023 |
| Intersegmental delay | 90 ms | 0.09 ± 0.01 s, Sun et al. 2022 |
| Contraction duration | 600 ms | Sets simultaneous release; duty D = 0.83 ± 0.22, Pehlevan & Gjorgjieva 2013. Chosen with amplitude to put emergent stride in the measured window — see §6a |
| Contraction amplitude | 0.50 | Not measured; **calibrated** so emergent stride ≈ measured. See §6a |
| Propagation reliability | 1.00 | Free parameter; <1 lets waves die mid-body |

### Substrate contact

| Parameter | Default | Source |
|---|---|---|
| Swing release | 0.90 | Segments lift off the ground when they contract, Pehlevan et al. 2016; protopodial sequestration, Booth et al. 2024 |
| Friction μ_bf | 10 | Sun et al. 2022, from denticle A–P polarity |
| Anterior release | 0.85 | Head sweeps involve a portion of anterior segments only, Lahiri et al. 2011 |
| Bend extent | 4 boundaries | Asymmetry confined to thorax + anterior abdomen (muscles T1–A1, asymmetry greatest T3–A2); front ~5 segments best predict head reorientation |
| Bend migration | 0.60 | Calibration, not a measured quantity — see §3.6 and §6a |
| Bend relax | 0.70 /s | Weathervane tracking only; does not affect turns |
| Posture sd | 25° | Body-wide postural curvature. Fitted to the measured crawl bend and its 1–3 s persistence (§8k). Without it the model's runs are straight lines |
| Posture tau | 2.0 s | How long a curve is held. Below about 1 s it scrambles casts (§8k) |
| Wall deflect | 0 (off) | Deflection along a boundary. Built on a mismeasurement and refuted once corrected (§8l) |
| Mouth hooks | 1 | Head anchors as the forward wave reaches the anterior (§8m). Does not affect stride |
| Reverse-to-turn | 0.7 | **GUESSED, not measured** — chance a reversal ends in a cast. Was hard-wired at 1.0 (§8n). Unmeasurable from tracking: the boundary is where FIM-Track fails |
| Bend exits | **1 (on)** | Whether articulation leaves with the profile. Refuted against the rotation profile (§8e), then **vindicated against the measured bend distribution** (§8i): r = +0.78 where `bexit` 0 gives −0.39 |
| Bend speed | 0 (off) | Time-driven migration, independent of crawling. Refuted — early rotation gets *more* negative and turns vanish above 4 (§8g) |
| Denticle rows | 0 (off) | Half-spacing of the ventral denticle belts. Belts are paramedian so below the ~0.4 mm body half-width. Off because measured and unhelpful (§8f) |
| Grip asym | 0 (off) | Inside-of-bend grip gain. Refuted: <1% of fitted rotation even at a 39:1 ratio (§8f) |

### Behaviour

| Parameter | Default | Source |
|---|---|---|
| Cast amplitude | 55° | Casts scored above \|θ\| > 37°, Davies et al. 2015; set above threshold so realised turns land in a plausible range |
| Cast growth | 1.30 | Second sweep larger than first, Zhao et al. 2017 |
| Accept probability | 0.50 | 1-cast turns succeed ~50%, Zhao et al. 2017 |
| Mean run duration | preset | From measured turns/min, Vijayan et al. 2022 |
| Pause fraction | preset | Food quality modulates distance via speed *and* pauses, Vijayan et al. 2022 |
| Weathervane | 8° | Low-amplitude casts without interrupting the run, Gomez-Marin & Louis 2014 |

---

## 6. Validation targets

The model is not fitted, so these are things to check rather than things guaranteed:

| Quantity | Published | Where to read it |
|---|---|---|
| Stride length | 0.70 ± 0.05 mm (Sun 2022); ~0.13 body lengths/wave ≈ 0.52 mm (Lahiri 2011) | `Stride mm` stat |
| Crawling speed | 0.64 ± 0.02 mm/s (Sun 2022); 0.84 mm/s on agar (Vijayan 2022) | `Speed mm/s` vs `Target` stat |
| Turns per minute | 1.7–2.8 depending on genotype/substrate | `Turns/min` stat |
| Run-length distribution | approximately exponential | `Turns` CSV export |
| Turn-angle distribution | broad, symmetric, heavy-tailed | `Turns` CSV export |
| Trajectory structure | bimodal persistent random walk: persistent runs + broad reorientations | Arena track |

Note the two stride-length estimates differ by ~30% between studies; treat the window 0.5–0.7 mm
as the target rather than any single number.

---

## 6a. What the model actually produces

These are measured, not asserted. `app_headless.js` runs the shipped HTML against a DOM stub and
drives its animation loop, so these numbers come from the same code the browser executes.

```
node app_headless.js 1800                      # 30 min, default uniform agar
OVERRIDE="aw=160" node app_headless.js 1800    # override any slider
CLICK="s_yeast,m_p2" node app_headless.js 1800 # press buttons before running
PROBE=1 node app_headless.js 300               # dump internal state at the end
```

Rover on uniform agar, 30 simulated minutes, square arenas:

| Quantity | Model | Published |
|---|---|---|
| Stride length | 0.51–0.55 mm | 0.70 ± 0.05 mm; 0.52 mm from Lahiri |
| Crawling speed | 0.39–0.41 mm/s (path ÷ duration) | 0.64 ± 0.02 mm/s (Sun); 0.84 mm/s (Wosniack) — **regressed by §8m** |
| Wave period | 1.64 s | 1.07 ± 0.12 s — **now too slow**, see §8m |
| Turns per minute | 2.67 (220 mm) – 3.13 (100 mm) | 1.7–2.8 |
| Mean \|turn\| | 28° | broad, tens of degrees; 58.4° measured here — **regressed by §8m** |

Measured 2026-10-23 on the current build. Three of the five rows moved when the wave gate was
corrected (§8m): speed, wave period and turn amplitude are all worse than they were, and the
reason is documented there rather than tuned away.

> **These numbers were re-measured on 2026-10-22 and the previous ones were stale.** The table
> used to read 3.1–4.1 turns/min and 33–40° mean |turn|. Two things had changed underneath it
> without it being re-run: the arena was decoupled from the canvas aspect (§5), so a "100 mm"
> arena is now genuinely 100 × 100 rather than whatever the window gave; and `app_headless.js`
> had been throwing since the model script was tagged `<script id="model">`, because its regex
> still expected a bare `<script>`. The harness is fixed. The lesson is that a validation table
> is only as current as the last time its harness ran — this one was silently a build or two
> behind.
>
> A second defect in the same table: the speed row used the page's `s_sp` readout, which is an
> exponentially-weighted **instantaneous** speed with a 2 s time constant — a snapshot of the
> final moment, not a mean over the run. It now reports path length ÷ duration. The two agree
> while the larva crawls straight and diverge once it does not, which is why this surfaced only
> when postural curvature went in (§8k).
>
> The change is **not** attributable to the new `bexit` default: at matched conditions (100 × 100,
> 1800 s, 3 seeds) `bexit` 0 gives |turn| 46.5 and 2.83 turns/min against `bexit` 1's 45.3 and
> 3.13, with stride 0.556 against 0.527.

Honest reading: stride and speed sit at the bottom of their windows, stride period is slightly
short, and turn rate now lands inside the published range rather than above it. Turn rate still
falls as the arena grows (2.83 → 2.63), which is the boundary effect showing through. `mech_test3.js` holds the parameter
sweeps behind the amplitude and duration defaults:

```
node mech_test3.js    # stride vs amplitude x duration, and turn vs migration rate
```

Stride scales almost linearly with contraction amplitude and strongly with contraction duration, and
is nearly independent of friction anisotropy (0.24 mm at μ_bf = 1 versus 0.32 mm at μ_bf = 200) and
of release depth. That last result is worth knowing: in this model the ratchet comes from the
geometry of the travelling release, not from the denticle asymmetry, which only scales it.

---

## 7a. Arena types and food patches

Three arena modes:

- **Uniform** — the whole arena is the selected substrate. Equivalent to the homogeneous-substrate
  experiments (agar, sucrose or yeast).
- **1 patch** — a single central food patch on agar. The simplest patch-leaving geometry: the larva
  either stays on it or does not, with no second patch to find.
- **2 patches** — two circular food patches on agar. This is the geometry of Wosniack et al. 2022,
  who modelled patchy environments as two circular patches of radius 25 mm of sucrose or yeast with
  agar elsewhere.
- **4 patches** — four patches equidistant from the centre, following Dhawan et al. 2025 (25 × 25 cm
  arena, four circular patches of radius 17.5 cm/10, placed 6.25 cm from centre).

Patch radius and arena size are sliders; the defaults are scaled down from the published geometry so
a 4 mm larva remains visible. Patches are drawn in substrate colours following the source figures:
agar blue, sucrose green, yeast orange. The centroid track is drawn in the patch colour while the
larva is inside a patch and purple outside, so residence is legible at a glance.

### Location-dependent behaviour

In patchy arenas, **stride period, pause fraction and mean run duration are set by the substrate
under the centroid**, not by the sliders — those three sliders become read-outs (their labels are
amber) and update on every patch entry and exit. Values come from the same measured table as the
uniform presets. This reproduces the published finding that larvae crawl significantly slower inside
yeast and apple-juice patches than outside them, and pause much more on yeast, probably to feed.

### Inward turn bias

The mechanism that actually keeps larvae on food is not a speed change. At the food–no-food
interface larvae bias their turns toward the patch centre, with a probability `P_bias` that depends
on distance from the patch centre, and the bias persists briefly after the larva has exited the
patch. Crucially this is food-specific: agar–agar and agar–gel borders produce no such bias.

Implemented as: when a spontaneous turn is initiated, the first sweep is directed toward the nearest
patch centre with probability `P_bias`, otherwise by the handedness parameter. The spatial profile is

```
P_bias(d) = 0.5 + (P_max − 0.5) · exp( −((d − R) / 0.45R)² )
```

peaked at the border `d = R` and decaying both inward and outward. **`P_max` is a slider, and the
shape of this curve is my parameterisation, not digitised from the paper** — what is taken from the
literature is that the bias exists, that it peaks near the border, that it persists just outside the
patch, and that it is absent for non-food borders. The curve is set to zero when the patch substrate
is agar, reproducing that control.

**Handedness.** Larvae show an individual turning bias (H > 0.5 counter-clockwise, H < 0.5
clockwise), and the inward turn is reported to be achieved while maintaining handedness. The
handedness slider sets the baseline direction probability used when no inward bias applies; the
interaction between handedness and inward bias in the model is a simple override, which is cruder
than what the data suggest.

### Local search after leaving a patch

Larvae that have encountered and then lost food search locally: they stay off the edge, circle the
former food position, and — contrary to a simple slow-down account — move *faster* than before
(Finding a path, JEB 2025; fed larvae spent 53% of time in the reward zone against 19% unfed, and
the behaviour persists for minutes in darkness).

On leaving a food patch the model stores the exit point and enters local search for `Local search
(s)` seconds, during which:

- mean run duration is multiplied by `Search intensity` (default 0.35), so turns are about three
  times more frequent;
- stride period is shortened by 15%, so the larva speeds up rather than slowing;
- each turn is aimed back at the stored exit point with probability `Return bias`.

**Measured effect** (one yeast patch, 120 mm arena, 1800 s, means over seeds):

| Condition | In-patch time | Border time | Turns/min |
|---|---|---|---|
| Local search off | 22% | 29% | 2.80 |
| On, 120 s, no aiming | **40%** | 16% | 3.90 |
| On, 120 s, aiming at exit point (0.7) | 27% | 27% | 4.10 |
| On, 240 s, aiming 0.7 | 18% | 28% | 4.17 |

Local search nearly doubles patch residence — but **only without the return bias**, which is why
its default is 0. Aiming turns back at the exit point makes things worse, and the reason is
instructive: the exit point is on the patch *rim*, so steering at it repeatedly returns the larva to
the edge and straight back out. Undirected area-restricted search keeps it in the neighbourhood,
where the inward turn bias at the border can do its work. "Circling the former food position" is not
the same operation as "steering toward it", and I had implemented the second. The slider is kept
because the comparison is worth being able to run.

### Reproducibility

Every stochastic choice draws from a seeded PRNG (mulberry32), so a seed reproduces a run exactly.
This matters more than it sounds: **border occupancy varied 37–62% between unseeded runs of the
same condition**, so single runs cannot distinguish conditions at all. Compare across seeds, not
across single runs. The `reps.sh` helper in the repository averages a condition over N seeds using
the headless harness.

### Patch leaving as evidence accumulation

Residence time is no longer a side effect of run/turn statistics. While the larva is standing on
food, a decision variable accumulates as an Ornstein–Uhlenbeck process — drift, leak and noise — and
crossing threshold releases the inward border bias so the larva can walk out. This is the model
Dhawan et al. fit to larval patch residence: a single drift parameter suffices in homogeneous
environments, and a leak term (decay of accumulated information) is needed and improves the fit in
heterogeneous ones.

**Drift is lower on better food**, so evidence accumulates more slowly and exploitation lasts
longer — the published direction. `Quality effect` sets how strongly; at 0 all patches are
equivalent. `Noise` is what makes residence a distribution rather than a fixed duration.

### Comparative memory

The quality of the last patch is remembered with a weight decaying over `Memory τ` seconds, and the
drift on the current patch is scaled by `(remembered − current)` quality. The three published
results fall out of that one term:

- a good patch after a poor one is exploited **longer** (drift reduced);
- a poor patch after a good one is abandoned **sooner** (drift raised);
- two patches of equal quality produce **no effect**, which is the paper's own control and the
  reason the authors rule out metabolic satiety — a satiety account predicts shortening regardless
  of what came before.

Memory τ defaults to 600 s because larvae took about 10 minutes to travel between patches and the
effect still showed; at the earlier 300 s default the memory had largely decayed before the next
patch was found, which the visit log makes obvious (the `mem_weight` column).

**This needs a heterogeneous arena.** The `Mixed` button makes alternate patches carry the other
food, so quality differs between them — yeast and sucrose are the two substrates here with measured
kinematics, and they differ substantially (rover: 0.37 vs 0.68 mm/s, and far more pausing on yeast).
In a uniform arena the comparison term is identically zero, which is the correct behaviour, not a
bug.

**Honest framing.** This is the published phenomenological model reimplemented on top of the
mechanics, not something emerging from them. The OU process is a decision layer; nothing in the
peristalsis or the substrate contact gives rise to it. The quality scale (agar 0, sucrose 0.5,
yeast 1) is my assignment, not a measurement, and the drift and leak values here are not the
paper's fitted numbers — those are not reported numerically in the text.

### Leaving has to be acted on, not just permitted

The first implementation had the threshold crossing simply *release* the inward border bias, on the
reasoning that a larva no longer held in will drift out. Measured, that failed both predictions —
and in the wrong direction, which is the signature of a confound rather than a sign error.

`ou_test.js` integrates the decision process on its own, with the memory value forced, and shows the
term itself is correct:

| | drift | residence |
|---|---|---|
| rich, no memory | 0.055 | 16.3 s |
| rich after rich | 0.055 | 16.3 s |
| rich after poor | 0.022 | **26.5 s** |
| poor, no memory | 0.138 | 7.2 s |
| poor after poor | 0.138 | 7.2 s |
| poor after rich | 0.220 | **4.6 s** |

Both predicted orderings hold, and the equal-quality control gives exactly the no-memory value. But
in the arena residence was 44–70 s against the decision's 5–27 s, so most of what was being measured
was **transit**: after deciding to leave, the larva still had to wander out of the patch, and it does
that more slowly on rich food (0.37 mm/s on yeast against 0.68 on sucrose). Exit time swamped
decision time and carried the opposite quality dependence.

The fix is that a leaving decision now *directs* turns out of the patch, mirroring the inward bias
at the border rather than merely switching it off, and shortens runs while leaving so those turns
get taken. That is also the more faithful reading: the published mechanism is a turning bias at the
food–no-food interface, and leaving is the same mechanism with the sign flipped.

### 7c. What the arena actually produces — and why residence is the wrong read-out

Re-measured after the seed bug (§ *A fifth bug*), with a dose-response design rather than a single
contrast: four gains on the comparison term (`ocmp` = 0, 1.2, 3, 6) × 30 seeds × 2 h in the
published geometry (250 mm arena, four patches of radius 18 mm, alternating yeast and sucrose).
120 runs, 2263 visits. `cfg_ocmp.js`, analysed by `ocmp_report.js`.

The first attempt at this measurement found nothing, and the reason it found nothing is the most
useful thing in this section.

#### Residence is the wrong read-out

A visit ends one of two ways: the accumulator crosses threshold (`decision`), or the larva wanders
off the patch before it does (`wander`). Cutting the drift lengthens the latency — which makes the
visit *more likely to end by wandering*. So the visits that would show a long latency are exactly
the ones removed from the decision-exit sample. Residence is censored by the effect it is supposed
to measure.

The size of the distortion is easy to check, because the accumulator can be integrated on its own
(`scratchpad/ou_fp.js`). At the default gain, first passage on a rich patch should move from 150 s
to 233 s — an 83 s effect, resolvable with about five visits per cell. Measured on residence in the
full model, the same cells came out at 137 s and 133 s. A large effect read as nothing, with
*n* = 6 in the critical cell, because the long visits had been deleted.

The uncensored quantity is the **fraction of visits that reach a decision at all**. Slower
accumulation shows up there directly, and nothing is dropped.

#### The cells are geometrically confounded

Arriving at a poor patch after a rich one is not the same journey as arriving after another poor
one, so the four cells differ even with the memory term switched off. At `ocmp` = 0 the rich
contrast sits at +5.1 pp and the poor contrast at +0.3 pp — small, but not zero, and the poor-patch
asymmetry was large enough in the first run of this to be mistaken for a real effect. The zero-gain
condition measures the confound, and every effect below is a difference against it.

#### The result

Effect over the `ocmp` = 0 baseline, in percentage points of decision rate:

| gain | rich after poor − after rich | poor after rich − after poor |
|---|---|---|
| 1.2 (default) | **−18.3 pp** (z −2.4) | **+18.0 pp** (z +2.0) |
| 3 | **−28.4 pp** (z −3.8) | **+30.1 pp** (z +3.6) |
| 6 | **−27.7 pp** (z −3.9) | **+38.3 pp** (z +4.8) |

Both predicted directions hold at every gain, and both are resolved. The equal-quality control is
flat, as the published control requires.

The *shape* is the part worth trusting, because it was predicted before it was measured. The gain
multiplies a drift the quality term has already shrunk, and the result is floored at 1e-4, so above
`ocmp` ≈ 3.6 the rich-patch drift is already clamped and further gain can do nothing: the rich
effect should saturate. The poor-patch term raises drift instead and is never clamped, so it should
keep growing. That is exactly what the table does — rich flattens between 3 and 6 (−28.4, −27.7)
while poor continues (+30.1, +38.3). A mechanism that was merely correlated with the gain would
have no reason to break at the one point where the arithmetic says it must.

#### The testable claim

Both halves of the published result reproduce, but **not in residence** — in how often the leaving
decision is reached before the animal wanders off. That makes a prediction about experiments rather
than about larvae: a real dataset analysed on residence alone can show the abandon-sooner effect and
miss the exploit-longer one entirely, not because the memory is absent but because patch retention
censors the long tail. If only the abandon-sooner half appears in a dataset, retention is the first
thing to check — the exploit-longer effect lives in the cell most vulnerable to being wandered out
of.

An earlier version of this section claimed the asymmetry could be fixed by raising the inward turn
bias to 0.95. That claim came from seed-bug data and is withdrawn; the censoring is not an artefact
of weak retention, it is intrinsic to measuring a first-passage time through a leaky window.

### A fourth: the trail vanishing at the arena edge

Reported as two symptoms — the page jumping when the larva hit a wall, and the accumulated path
disappearing while still being visible in replay. One cause.

The wall-response stat shows text like `reverse 100%`, which wrapped onto a second line, while
`turn 48%` did not. Measured, the stats row was **47 px wrapped against 31 px unwrapped**. Those
16 px came out of the arena, which changed its aspect ratio by 0.015 — just past the 0.012 threshold
in `syncAspect`, which resized the trail's backing canvas and cleared it. The larva hitting a wall
changed the text, so the bounce and the erasure happened together, and replay was unaffected because
it draws from the history buffer rather than that canvas.

Two fixes, because either alone leaves a real bug:

- The stats row is now a fixed height with no wrapping, so **layout cannot depend on the text**. A
  value that changes length must never resize the canvas next to it.
- An aspect change now **redraws the trail from the replay history** instead of clearing it. That is
  lossless, since every centroid is already stored, and it also fixes trail loss on an ordinary
  window resize or a change of arena size — both of which silently wiped it before.

Measured with a pixel count on the arena canvas: across a window resize the trail went from 916
pixels to 5 before the fix and from 1798 to 1001 after (lower only because the arena itself is
smaller); across an arena-size change, 283 to 0 before and 1798 to 1045 after.

### A fifth: a swept seed that did nothing

Found while building the batch tooling, and it invalidated published numbers in this file.

The seed slider set `P.seed`, but the random stream was only ever seeded inside `reset()`. A driver
that set the seed after startup therefore changed a number that nothing read: **every "seed" ran the
identical simulation.** Checked directly — seeds 1, 2 and 3 all returned path 174 mm, 2.80
turns/min, 27% border, to the digit.

The tell had been visible and I had ignored it twice. Standard errors in the patch-visit analysis
came out at ±0.4 s and ±1.5 s, which I noted as "suspiciously small" and did not chase; pooled visit
counts were exactly divisible by the seed count (56, 48, 72 over 8 seeds) because the same run was
being counted eight times. An error bar computed over identical copies is zero by construction, and
that is what those were.

The fix is one line — changing the seed restarts the run — plus a runner that reseeds explicitly.
Both §4a and §7c have since been re-measured on working seeds.

**What this cost:** the habituation result reversed. The effect I reported on border occupancy does
not exist; the effect on turn rate does. Any single-run comparison in a model with this much
between-seed spread is worthless, which was the whole argument for adding a seed — undone by the
seed not working.

The comparative-memory result survived re-measurement, but only after the read-out was changed: on
working seeds the original residence contrast is flat, and the effect is there in the decision rate
(§7c). Two faults had been stacked, and fixing the seed exposed the second.

### Three bugs worth recording

All three were invisible by eye and only showed up as inverted statistics.

1. **A leaving decision has to be acted on.** Releasing the inward bias was not enough: the larva
   still had to wander out, and it does that more slowly on rich food, so exit time carried the
   opposite quality dependence and swamped the decision. Leaving now directs turns outward.
2. **Proximity merging fused neighbouring patches.** The published rule counts return trips within
   3 cm of the patch edge as part of the same visit. Implemented on distance alone, it merged
   *different* patches whose edges were 29 mm apart — one visit spanning two patches, labelled with
   the wrong substrate, which inverted the measured effect. Merging now applies to the same patch.
3. **A stale clamp erased the quality effect.** `Math.max(0.01, drift)` was harmless at the original
   base drift of 0.22. After lowering it to 0.03 so decisions would outlast transit, the floor
   became active and clamped every rich-patch drift to the same value — both the quality effect and
   the memory effect vanished into it.

Each of these produced a result that looked like a wrong sign in the model. None of them was.

### The visit log

`Visits` exports one row per patch visit: entry time, residence, which substrate, its quality, the
previous patch's quality, the memory weight at the moment of leaving, the **exit type** —
`decision` if the accumulator crossed threshold, `wander` if the larva left before it did — and
`decision_latency_s`, the time from patch entry to the threshold crossing, blank on a wander exit.

The last two columns matter more than residence. Residence contains the walk out of the patch and is
censored by the wander exits, so it hides effects on the decision; the latency isolates the
accumulator, and the exit type lets the analysis use the uncensored read-out, the fraction of visits
that reach a decision at all. §7c is the worked example of why this is not a detail.
`ocmp_report.js` does that analysis; `comp_sweep.js` does the older residence split, kept for
comparison.

### What this does *not* model

There is no olfaction, no gradient, no feeding, no satiety and no patch-quality integration. The
larva cannot smell a patch it is not standing in — the inward bias is a local reflex at the border,
which is how the source model implements it too, although the authors note the persistence of the
bias outside the patch may reflect olfactory processing. Patch-leaving here is the by-product of
run/turn statistics, not a decision process; for a drift-diffusion account of patch residence time
see Dhawan et al. 2025.

---

## 7. Genotype and substrate presets

The `foraging` (`for`) gene encodes a cGMP-dependent protein kinase and carries a natural
polymorphism: **rover** (`forR`, high PKG) larvae have longer foraging path lengths than **sitter**
(`forS`, low PKG) larvae on a yeast patch; rovers forage between patches, sitters within them. Off
food, path lengths do not differ between the morphs.

The preset buttons set stride period, pause fraction and mean run duration from measured means
(Vijayan et al. 2022, eLife 11:e75826):

| | Agar | Sucrose | Yeast |
|---|---|---|---|
| **Rover** speed (mm/s) | 0.84 | 0.68 | 0.37 |
| **Rover** turns/min | 2.65 | 2.44 | 2.00 |
| **Sitter** speed (mm/s) | 0.96 | 0.68 | 0.31 |
| **Sitter** turns/min | 2.79 | 2.13 | 1.71 |

**Read these honestly.** That study found the rover/sitter differences in *homogeneous* substrates
were **not statistically significant**, and explicitly less dramatic than the classic result where
rover path length was roughly twice sitter path length in yeast paste. Note also that on agar the
sitter mean speed is slightly *higher* than rover. The presets reproduce the published means,
including the non-significant ones; they are a convenient way to explore the parameter region, not
a claim that the genotypes differ in these conditions.

The mapping is: target speed → stride period (speed correlates with stride period more than with
stride length), with any shortfall made up by pause fraction, since food quality modulates distance
travelled through both speed and pause frequency. Turns/min → mean run duration = 60/turns.

---

## 8. Reading the display

**Arena.** Top-down view, scaled in mm. Body segments shade teal with contraction. Midline points:
filled = planted, **open coral circle = released from the substrate**. Head is purple, tail amber,
small purple dot is the centroid. The purple track is the accumulated centroid path (not the head
path — centroid is what tracking software reports). Segment-boundary labels appear when the scale
is large enough; shrink the arena-width slider to enlarge the animal.

**Zoom.** The arena magnifies up to 40×, which is what makes the peristaltic wave actually
watchable — at fitted scale a 4 mm larva in a 100 mm arena is a few dozen pixels. The wheel zooms
about the cursor, dragging pans, double-click returns to the fitted view, and the slider beside the
replay transport does the same. `Follow` keeps the larva centred; dragging turns it off, since the
two fight each other. A click that moves less than a few pixels is not a drag: on the larva it is a
poke (§4b), so double-clicking the larva pokes it twice rather than resetting the zoom. Zoom is a view setting, not a model setting — it changes nothing about the
simulation, and it works the same while scrubbing or replaying.

Two things change automatically above a few times magnification, because what reads correctly at
arena scale does not read correctly close up:

- **The body is drawn as a tapered outline**, with each segment a quad sharing its edge with the
  next, rather than a row of round-capped strokes. Strokes scallop the silhouette and, being
  translucent, stacked into blobs where segments overlapped — segments are wider than they are
  long, so they always overlap. Contraction is now carried by hue on an opaque fill, so overlaps
  cannot stack, and faint ticks mark the segment boundaries so the wave can be counted.
- **The trail is redrawn as a vector path** from the replay history instead of the accumulated
  bitmap. The bitmap is sized for the whole arena, so magnifying it just magnifies its pixels. It
  is subsampled to bound the work on long runs.

**Contraction · release kymograph.** Rows T1 (top) → A8 (bottom), time flowing right, one column
per 50 ms of simulated time. Green
intensity is contraction; the thin coral band marks release from the substrate. Forward waves are
diagonals rising toward T1; backward waves run the other way; a failed relay shows as a stripe that
stops mid-body.

**Intersegmental bend kymograph.** Rows T1/T2 → A7/A8. Teal = bend one way, coral = the other,
±25° full scale. During a run only the top rows flicker (weathervane). During a cast the top three
light up and everything from A2/A3 back stays blank — the thoracic restriction, visible rather than
asserted. Watch the bend migrate backward as the body straightens.

**Stats.** `Target` is the published speed for the current genotype/substrate preset, for comparison
with the emergent `Speed`. `Wall resp` and `Touch resp` show the response a wall contact or a head
poke would get now, and the matching habituation level (§4a, §4b).

---

## 8a. Replay

The bar under the canvases is a replay scrubber with its own transport: `▶ Replay` plays the
recording back at a rate you set with the speed slider (0.25×–16× real time), and dragging the
slider at any point stops playback and jumps there. Playback renders incrementally — it appends
trail segments and kymograph columns rather than rebuilding them each frame — so it stays smooth
over long recordings. Everything already simulated is held in a ring
buffer, sampled every 50 ms of **simulated** time, and dragging the slider renders that moment: body
posture, which points were planted, both kymographs, and every stat, all as they stood then. The
arena caption shows `REPLAY t=…` so a replayed frame is never mistaken for a live one. `Live`
returns to the present; so does pressing play.

This is **playback, not rewind**. The simulation cannot be returned to an earlier state — that would
need the relay queue, the pending-turn record and the random stream restored too — so you cannot
scrub back and run forward along a different branch. Pressing play resumes from the live frame.

The buffer holds 60,000 samples, which is 50 minutes of simulated time (about 17 MB). Beyond that
the oldest samples fall off the front, so the scrubber covers the most recent 50 minutes. `Reset`
clears it.

Useful things to scrub for: a turn, to watch the bend march from T1/T2 to A7/A8 across the following
waves; a wall encounter, to see which sweeps were rejected before one was accepted; a patch
crossing, to see the stride period and pause fraction change at the border.

**Side effect worth knowing.** The kymographs now advance one column per history sample rather than
one per animation frame, so their time axis is simulated seconds and no longer compresses when the
sim-speed slider is raised. A column is 50 ms of sim time at any speed, and the visible window is
about 37 s.

---

## 8b. Batch simulation

Sweeps also run **in the page itself** — the Batch button, which uses Web Workers where
the browser permits them and falls back to the page's own thread where it does not (Chrome
and Safari refuse workers on some `file://` pages). The page and the Node tooling share the
model source, produce identical numbers for the same seed, and stamp output with the same
`model_fingerprint`; §8d has the details.

**See `RUNNING.md` for how to actually run these** — installing Node, writing a config, getting the
output into pandas.

A handful of files turn the sandbox into something you can run experiments on. The browser page is
the same file — these drive it headlessly.

```
sim.js          run one simulation, return structured results
sweep.js        run many, write tidy CSV; parallel, resumable
report.js       summarise a sweep by condition, or rank parameters, or show range
feasible.js     which sampled parameter sets reproduce the measured kinematics
ocmp_report.js  the comparative-memory dose-response, on the uncensored read-out
comp_sweep.js   the older residence split by current/previous patch quality
params.js       list every settable parameter, its default and range
```

Configs in the repository: `cfg_explore.js` (220 Latin-hypercube samples over 12 parameters),
`cfg_habituation.js` (5 conditions × 20 seeds), `cfg_ocmp.js` (4 gains × 30 seeds, the §7c
dose-response).

The sandbox exposes `__LARVA_HOOK`, `__LARVA_H` (integration step) and `__LARVA_NODRAW`, which do
nothing in a browser. Earlier harnesses injected a probe by regex into the closure; that broke
silently whenever the end of the file was edited.

### Two modes, one output format

A config can name **conditions** to compare, **sample** parameter space to see what the model can
do, or both:

```js
module.exports = {
  duration: 900, seeds: 20,
  base: { aw: 100 },
  conditions: { wt: { buttons: ['h_wt'] },
                none: { params: { cdose: 0, tdes: 600 } } },
  sample: { n: 220, duration: 600,
            vary: { per: [0.6, 2.0], amp: [0.2, 0.7], migK: [0.2, 1.6] } },
};
```

`sample` uses a Latin hypercube — each range cut into *n* bins with one sample per bin, shuffled
independently per parameter. Independent uniform draws clump and leave holes; stratified ones do
not, which matters when a run costs seconds and you want coverage rather than precision.

```
node sweep.js cfg_explore.js out/      # run (resumable: re-run to continue)
node sweep.js --collect out/           # rebuild CSVs from a sweep still in flight
node report.js out/ --range            # what the model produced
node report.js out/ --corr             # rank parameters by correlation
node report.js out/                    # group by condition, mean ± se, sd
node feasible.js out/                  # which parameter sets match the literature
node ocmp_report.js out/               # comparative-memory dose-response
```

**Prefer a dose-response to a single contrast.** A two-condition comparison cannot tell "no
mechanism" from "mechanism too weak to resolve at this *n*", and it gives nothing to check a
positive result against either. Varying the gain costs one more line of config and buys both: a
flat line across a 5× range is close to decisive, and a result whose *shape* matches what the
arithmetic predicts — including where it should saturate — is far harder to get by accident than
one that is merely significant. §7c is the worked case.

Output is long format — `runs.csv` (one row per run, every parameter and metric), `visits.csv`,
`turns.csv`, and optional `tracks/<run_id>.csv` at 1 Hz — so it loads straight into pandas or R.
Full 50 ms resolution for 200 one-hour runs would be ~14 M rows; 1 Hz centroid is ~720 k. Keep the
full detail for the handful of runs you want to inspect in the page.

### Cost

About **675 seconds of simulated time per second of CPU**, so an hour of sim costs ~5.5 s and
process startup is ~170 ms — which is why each run gets its own process rather than a shared one.
Twenty seeds across ten conditions at an hour each is roughly 18 minutes on one core.

The sim-speed slider is **bit-identical** across values (same seed and duration at 1×, 4× and 20×
gave path 693 mm, 2.80 turns/min, 51% border, to the digit), so batch runs use 20× for free. The
integration step is *not* — 2 ms → 4 ms is 1.8× faster and leaves stride and speed alone but moves
turn rate and border time. Whether that is a bias or just a different random draw needs a
multi-seed comparison, which is exactly what this tooling is for; until then batch runs stay at
2 ms.

### How many seeds

Between-seed sd is around 0.08 for border fraction and 0.4–0.7 for turns per minute. Detecting a
difference of about one sd at reasonable power needs roughly **15–20 seeds per condition**. Do not
compare single runs: the habituation result in §4a reversed completely when it was re-measured
properly.

Comparing two individual trajectories is not meaningful either — they are single realisations of a
stochastic process. Compare distributions over seeds.

---

## 8c. What the model can do

220 Latin-hypercube samples over twelve parameters (intersegmental delay, contraction
duration and amplitude, swing release, friction, anterior release, bend migration, cast
amplitude, cast growth, bend relax, acceptance, weathervane), 600 s each on uniform agar:

| metric | min | median | max |
|---|---|---|---|
| speed (mm/s) | 0.03 | 0.35 | 1.46 |
| stride (mm) | 0.07 | 0.33 | 1.09 |
| turns/min | 1.6 | 3.3 | 11.3 |
| mean \|turn\| (°) | 3.6 | 21.4 | 111.0 |
| border fraction | 0.00 | 0.52 | 0.95 |

> **This sample replaces an earlier one that was partly invalid.** The first version of
> `cfg_explore.js` sampled stride period and mean run alongside the rest. Both are derived
> (§5): `rt` came out *constant* across all 220 runs, and the final `per` correlated
> r = 0.975 with the intersegmental delay, because the period is floored at the wave
> duration the delay sets. So two of the twelve dimensions were not being explored at all,
> and the sensitivity table reported period and delay as separate influences when they were
> one effect counted twice. `sweep.js` now checks every sampled value against what the model
> finished with and says so; `report.js --corr` excludes derived columns, since they are
> outputs. The conclusions below survived the correction, with smaller coefficients.

The measured kinematics are a **tight** joint constraint. Stride is met by 33 of 220 sets,
speed by 47, turn rate by 87 — but **none** of the 220 meets all three. That is not a claim
that the model cannot do it: the hand-tuned defaults land at speed 0.57 mm/s, stride 0.54 mm
and 2.6–3.4 turns/min across seeds, which is inside the window on the first two and at the
edge on the third. It means the satisfying region is small enough that 220 draws across
twelve dimensions miss it. Hand-tuning to the literature was doing real work.

Sensitivity over the same sample (Pearson r, derived parameters excluded):

| output | strongest influences |
|---|---|
| speed | −0.65 intersegmental delay, +0.36 contraction amplitude, +0.19 friction |
| stride | +0.55 contraction amplitude, −0.25 delay, +0.24 contraction duration |
| turns/min | −0.40 delay, **+0.38 bend migration**, +0.24 cast amplitude |
| mean \|turn\| | **−0.50 bend migration**, +0.24 cast amplitude, −0.21 delay |
| border fraction | **+0.45 bend migration**, −0.31 delay, +0.27 friction |

Bend migration is the row I would not have guessed, and it survived the correction (+0.45,
previously +0.51 in the flawed sample). Time at the wall is driven more by how a turn is
*executed* than by anything in the turning decision. A larva whose bend leaves the body
quickly completes turns and escapes the boundary; one whose bend lingers keeps being carried
back into it. The same parameter is also the strongest influence on how large a turn ends up
being (−0.50), which is the mechanism: a bend that migrates away fast has less time to
accumulate heading change.

That is a mechanical explanation for an ecological statistic, and it is testable — it
predicts that manipulations altering the retrograde progression of asymmetric contraction
should change edge occupancy and turn size together, while leaving turn *frequency* far less
affected than either.

---

## 8d. The same model in three places

The browser page, the Node harness and the page's Web Workers all execute the **same**
`<script id="model">` block. Nothing is reimplemented, so there is no second copy to drift.

The page reads its own model source back as text and instantiates it with every global it
touches passed in as a parameter — `document`, `window`, `performance`,
`requestAnimationFrame`, `globalThis` — against a stub DOM. The instance therefore cannot
see the real page, and several instances coexist without interfering. A worker gets the
same source plus those two functions serialised with `Function.prototype.toString`.

Two consequences worth stating, because both were bugs first:

**A parameter you set may not be the parameter the model uses.** `per`, `rt` and `pf` are
recomputed from the genotype and local substrate by `applyLocal()` on every frame, so a
batch value for them is overwritten before it takes effect, and the conditions come out
byte-identical - indistinguishable from a broken seed. The page guards against this by
comparing the requested values against the model's own parameters at the end of each run
and reporting any that differ, which catches clamped values and any future derived
parameter as well. A list of known-derived parameters would not have.

Note the distinction the check preserves: `ocmp` in a uniform arena also produces identical
conditions, but is *not* flagged, because the value did reach the model and is simply inert
where there are no patches. That is a fact about the model, not a mistake.

**Workers are probed, not assumed.** A `Worker` constructed from a blob can be created
successfully and then die on load, so availability is decided by whether a worker has
actually *replied* to a ping. If none does, the batch runs on the page's thread in 12 ms
slices with a yield between them: one core, but the page stays at ~37 fps rather than
freezing.

**The track is sampled during the run, not read back afterwards.** The model's history is a
3000-second ring buffer (`CAP=60000` at 50 ms), so extracting a trajectory from it after a
long run silently returns only the last 50 minutes. The batch runner samples the centroid as
it goes. The frame callback advances `dt × spd` of simulated time, which sets the finest
possible sample rate, so the runner picks `spd` from the requested rate instead of leaving
it at 20 and capping every track at 1 Hz — results are bit-identical across that slider, so
this is free.

**Each run carries the arena it ran in.** The trajectory overlay draws the substrate and
the food patches under the tracks, taken from the model's own `patches()` and stored with
the result rather than recomputed in the UI — patch geometry is the model's to own, and a
second copy in the page would be a second thing to get wrong. Because the geometry travels
with each run, a selection spanning two different arenas is detectable: the panel then draws
no substrate and says why, instead of showing one arena's patches under another's tracks.

Both front ends stamp output with `model_fingerprint`, computed over the model source **and
the markup defaults**, since changing a default value alters every result while leaving the
code untouched. `crypto.subtle` is unavailable on `file://` pages, which is why this is a
plain FNV-style hash rather than SHA-1.

---

## 8e. Where the model's rotation comes from

Tracking gives the rotation rate against distance crawled, among turns that reach each bin,
so survivorship inside a bin is removed. Real larvae are front-loaded and decay to zero by
about five segment lengths; the model is back-loaded, peaking at 8–9. Two mechanisms were
tried and refuted *against this measure* (`migV`, `bexit` — but see §8i, where `bexit` turns
out to be right on a different one), and a 12-parameter random search over the whole
existing space (`fitturn.js`, 80 sets × 3 seeds) improved the combined score by 5%, which is
nothing.

What the search did show is a **trade-off**, not an impossibility. Four of the top twenty
reach a front-loaded first bin, and all four do it with high `migV`. Every one of them pays
for it: mean |turn| 6.6–23.6° against a real 58.4°, and 4.5–11.8 turns/min against a
published 1.7–2.8. The best-scoring sets are the mirror image — tail right, front negative.
Nothing in the space achieves front-loading *and* a decaying tail *and* realistic turns.

`rotsource.js` says why. Splitting every frame step by whether the bend's position on the
body moved:

| | rotation | share | rate |
|---|---|---|---|
| bend moving | 2090° | **89.5%** | 12.1 °/s |
| bend still | 245° | 10.5% | 5.5 °/s |

and with migration off (`migK` 0) the model produces **no completed turns at all**. So total
rotation is essentially (distance the bend travels) × (rotation each step of travel buys),
and every parameter in the model acts on the first factor. Raising travel speed front-loads
the rotation and shrinks the turn by the same mechanism, which is exactly the trade-off
above. Closing the gap needs the *second* factor — more rotation per unit of bend travel.

(The "still" threshold is 0.01 boundary units per frame, and with distance-coupled migration
the bend creeps constantly, so that 10.5% is an upper bound on a bound. Nothing here rests
on it.)

### 8e-i. "Segment length" is not a constant

Every profile above is plotted against distance crawled **in segment lengths**, so it is
worth knowing that segment length varies. `localShape()` sets `len = SEGLEN*(1 - amp*contr)`,
so a segment at full contraction is half its resting length. Measured over 600 s × 3 seeds
(`seglen.js`):

| | mean | 2nd–98th | spread |
|---|---|---|---|
| individual segments | 0.310 mm | 0.182 – 0.364 | **59%** |
| body length, crawling | 3.348 mm | 3.21 – 3.65 | 13% |
| body length, casting | 3.916 mm | 3.30 – 4.00 | 18% |

The body is **17% longer while casting than while crawling**, and a turn runs from a cast
into crawling — so the ruler changes along the very axis being plotted. A tracker's five
points sit at fixed arc *fractions*, so their spacing is neither constant (8–27% spread) nor
equal to each other (0.97 / 0.83 / 0.83 / 0.69 mm during runs).

What that costs, as the position of the half-rotation point (`segnorm.js`):

| ruler | half-rotation point | vs instantaneous |
|---|---|---|
| nominal resting, 4.0/11 = 0.3636 | 8.51 | **−15.7%** |
| recording-mean, 0.3098 | 9.99 | −1.1% |
| instantaneous body length | 10.09 | — |

So a **recording-mean ruler is fine to about 1%** — the 17% swing does not propagate, because
most of the time is spent crawling. The ruler that is wrong is the **nominal resting length**,
which is 16% too long and makes rotation look 16% more front-loaded than it is.

The model-side bins in §8e and §8f use exactly that nominal ruler (`SEGLEN = 4/11`), so they
are compressed by about 16%: the model's peak at 8–9 is nearer 10 on an honest axis. This
does not change the conclusion — the model is still back-loaded where real larvae decay to
zero by five — but any model-against-data comparison has to state which ruler each side used.
The synthetic truth file's `segment_length_ref_mm` is the median 5-point polyline length
measured outside turns, divided by 11, which is a crawl-state ruler and therefore within
about 2% of the recording mean.

## 8f. Body width, and why it does not help

§8e names the missing ingredient, and bilateral asymmetry in substrate grip is the obvious
candidate: it should raise rotation per unit of bend travel rather than raising travel speed.
Larvae grip with ventral denticle belts arranged in two paramedian bands, and in a bend the
inside cuticle is compressed while the outside is stretched, so the two sides need not grip
equally. Until now the model could not express that at all — the body was a line, and a line
has no sides.

Width is therefore real now. `rsp` is the half-spacing of the two denticle bands at the
widest point (the belts are paramedian, so it is less than the body half-width of about 0.4),
and the rigid placement is solved from the 2·NP band positions instead of from the midline.
`asym` is the gain on the inside/outside grip difference. **Both were measured and the
mechanism does not work.**

Rotation rate by distance crawled, 500 s × 3 seeds:

| condition | 0–0.5 | 0.5–1 | 1–1.5 | 1.5–2 | 2–3 | 3–4 | 4–5 | \|turn\| |
|---|---|---|---|---|---|---|---|---|
| real larvae | +0.259 | +0.104 | +0.072 | +0.073 | +0.046 | +0.024 | +0.008 | 58.4 |
| line body | −0.015 | −0.035 | −0.056 | −0.029 | +0.051 | +0.125 | −0.019 | 51.5 |
| rsp 0.30, asym 0 | −0.016 | −0.034 | −0.055 | −0.035 | +0.049 | +0.131 | −0.023 | 50.4 |
| rsp 0.30, asym 2 | −0.018 | −0.041 | −0.049 | −0.005 | +0.025 | +0.129 | −0.015 | 53.2 |

Unchanged to within noise, and the share of rotation produced while the bend is still stays
at 10–11% in every condition — so asymmetry does not move rotation off bend travel, which was
the whole point of trying it.

`asymtest.js` tests the claim in the solver rather than in the behaviour. One placement step,
a 55° bend migrating a quarter boundary, reading the fitted rotation as the gain rises:

| | asym 0 | 0.5 | 1 | 2 | 5 |
|---|---|---|---|---|---|
| rsp 0 | −1.5868 | −1.5868 | −1.5868 | −1.5868 | −1.5868 |
| rsp 0.22 | −1.5889 | −1.6013 | −1.6108 | −1.6114 | −1.6114 |
| rsp 0.40 | −1.5933 | −1.6134 | −1.6265 | −1.6260 | −1.6260 |

A 39:1 grip ratio across the bent segments moves the fitted rotation by **under 1%**, and it
saturates by `asym` 1. Lateral shift moves about 6%.

The reason is geometric and then formal. Geometrically, the two rows are parallel offsets of
the same midline, so their shape-displacement products differ only by a term of order (row
spacing / body length) — about 5% here. Reweighting one row against the other trades between
two nearly equal contributions to the same least-squares fit; the effect grows with `rsp`, as
a second-order term should, but cannot reach the order-unity change the measured profile
needs. Formally, **a best-fit placement has residuals, not forces.** Weighting a contact more
makes the body move less there; it does not make the contact push. Asymmetric friction
generates a couple in a real animal because contacts exert force, and this formulation has no
force for it to act on.

So the answer to "would width get the turning?" is no, and the reason is not the geometry —
it is the solver. Producing front-loaded rotation would mean replacing the weighted-Procrustes
placement with a quasi-static force and torque balance, in which each contact resists slip
with an anisotropic friction force (the denticle A–P polarity is already parameterised, as
`mu`) and the body's rigid motion is the one where net force and net torque vanish. In that
formulation grip asymmetry does generate a couple. That is a different model, not a parameter,
and every result in this README would have to be re-derived against it.

**Both parameters default to 0**, which collapses the rows onto the midline and reproduces
the line-body fit bit for bit — verified on three seeds across path length, turn count, mean
turn and border fraction. Everything measured in §6a, §8c and §10 therefore still stands.
Drag *Denticle rows* to about 0.22 to see the bands; they are drawn inside the silhouette,
each tick scaled and shaded by that row's contact weight. Width alone costs roughly 8% of
turn amplitude and buys nothing, which is why it is off rather than on.

## 8g. What the turns actually need

The defect is sharper than "back-loaded". Every profile measured — defaults, width, grip
asymmetry, fast and slow migration — is **negative over the first one to two segment
lengths**. The model turns the wrong way at the start of a turn. Splitting each turn by state
and signing it against its own final direction (`castrecoil.js`, 600 s × 3 seeds):

| | cast | after cast | net | casts positive |
|---|---|---|---|---|
| defaults | **−2.6°** | +52.4° | 49.9° | **5%** |
| anterior release 1.0 | −1.4° | +52.6° | 51.2° | 9% |
| anterior release 0 | −4.8° | +55.0° | 50.2° | 5% |

95% of turns recoil backwards while the head sweeps, and all the net rotation arrives
afterwards, spread over 10–20 segment lengths.

> **Correction (§8j).** That 95% is **definition-dependent and overstated.** `castrecoil.js`
> ends the cast when the state machine leaves `cast`; tracking ends it at the sp1 bend peak,
> which is later because the bend has to migrate there (0.82 s against 2.08 s). Measured on the
> same turns with the sp1 definition the model gives **−0.78°, 36% of turns positive** — not
> −2.6° and 5%. Real larvae measured that way give +1.72° and 66% positive. The direction of
> the claim survives; its size does not. `castdef.js` isolates the two windows. Real larvae put 26% of a 58° turn into the
first half segment length and are done by five. At trace level that is the visible difference:
the model draws long sweeping arcs where a real larva makes a sharp reorientation.

Planting the anterior instead of releasing it makes the recoil *worse*, which is the
diagnostic result. It would help if the problem were grip. It isn't.

**Rotation in this model is bounded by the shape change.** The placement solver only decides
where a prescribed shape sits, so no contact model can extract more rotation than the shape
trajectory affords. Three mechanisms were measured against that ceiling and all three failed:
width (<1%, §8f), bilateral grip asymmetry (4% even at 30:1 anisotropy), and migration speed
(early bins become *more* negative; no turns at all above `migV` 4).

It is also worth being precise about why. Weighted Procrustes minimises `Σ w|d|²`, and its
stationarity conditions are `Σ w·d = 0` and `Σ w(r × d) = 0` — a force and torque balance with
**isotropic** linear springs of stiffness `w`. The model was always doing statics. Its springs
simply pull equally in every direction, so a contact that grips harder resists everything more
and cannot steer. Making them anisotropic (`forcetest.js`, validated against the page's own
solver to 7×10⁻¹⁵ at A = 1) does not help either.

What does work is an **applied yaw moment** in the same balance — the moment an asymmetric
contraction exerts about the body, resisted by the ground rather than by a best fit. Rotation
per placement step, degrees:

| anisotropy | M 0 | M 0.5 | M 1 | M 2 | M 4 |
|---|---|---|---|---|---|
| A = 1 | −1.589 | −0.774 | +0.041 | +1.673 | +4.945 |
| A = 3 | −1.495 | −1.152 | −0.810 | −0.127 | +1.232 |
| A = 10 | −1.256 | −1.103 | −0.950 | −0.645 | −0.037 |

Linear in M, no ceiling, and it **flips the sign of the cast-phase rotation**, which is the
measured defect. Anisotropy resists it, so A and M have to be calibrated together.

Biologically this is the asymmetric contraction in T1–T3 and A1 that prompted the whole
enquiry. The model currently represents that contraction *only* as a change in target shape.
It needs to enter the force balance as a moment as well.

The cost is honest to state: the model's core claim is that translation and rotation are
**solved, never prescribed**. With an applied moment it becomes *solved from an actuation
model* — still not prescribed, but the actuation is now a modelling choice needing its own
justification, and every result here would be re-derived against the new placement. Whether
the moment can be *derived* from the bilateral asymmetry of §8f rather than parameterised
independently is open, and is the question that would make the width work pay for itself.

---

## 8h. Crawl bend: the model is straight, real larvae are not quite

Tracking first reported a per-boundary crawl bend of 23–27°, which would have meant the model's
crawling was far too straight. **That number was the total summed over the three tracked angles,
not a per-angle value**, and the per-angle quantity was always 5–9°. Stage 13 measured it
properly: real recordings and both synthetic fixtures through one code path, so the comparison
is like-for-like.

Per-angle bend during crawls, 5 tracked points, unsmoothed, pooled medians:

| | mean | median |
|---|---|---|
| real, amiGA-amRNAi | 10.31° | 7.62° |
| real, w1118 | 10.97° | 8.19° |
| this model, their pipeline | 6.00–7.08° | 4.64–5.19° |
| this model, `wvsweep.js`, clean crawl set | 4.70° | 4.97° |
| **this model, ground truth (12-point midline)** | **0.31°** | **0.00°** |

**The model's crawl is geometrically straight.** With turns and their straightening excluded
(15 s after each cast), the true per-angle bend is 0.00° in both mean and median at `wv` 0 and
0.31° at the default. Everything the measurement reports for it — about 5° of median — is
therefore artefact, and that is known exactly rather than estimated. Two independent pipelines
agree on it: 4.97° here against 4.64–5.19° there.

So of the real 7.6–8.2°, about 5° is the measurement chain and **2.4–3.0° is not** — a ratio of
1.43–1.61 over the model.

**`wv` cannot supply it.** Raising the weathervane to the slider maximum of 25 moves the
degraded median by a factor of 1.05, against the 1.43–1.61 required, and the true per-angle bend
only reaches 0.97°. The weathervane is a low-amplitude anterior oscillation, attenuated further
by the first-order lag of `sr` against a 0.9 rad/s target, then shared among boundaries. Closing
the gap would need curvature *distributed along the body during crawling* — a different
mechanism, not a larger number.

One incidental finding: only **46%** of frames survive a 15 s post-cast exclusion. The model
spends more than half its time straightening out of a turn, which is §8g's problem measured
another way.

**Whether the residual is biological is not settled.** FIM-Track's own spine fitting adds error
that the synthetic fixtures do not model, and it would land entirely on the real side. Two
observations bear on it, inconsistently: in w1118 shorter larvae bend more (r = −0.77,
−2.51°/mm), and the pixel floor measured here has a slope of −1.12°/mm, so the floor accounts
for about 45% of that relation and 55% is something else. But amiGA-amRNAi shows no relation at
all (r = −0.13). A floor effect should not be genotype-specific.

The discriminator, on data already collected, is the **temporal autocorrelation of per-angle
bend during crawling**: a genuine posture is held across frames, spine-fit noise is close to
frame-independent. Until that is run, raising crawl curvature in the model would be fitting a
residual that may not be the animal.

---

## 8i. Hand-labelled segmental data, and the two things it changed

Everything in §8e–§8h is limited by what a five-point tracked spine can resolve. A separate
DeepLabCut project (`larva_segmental_tracking`) labels something much closer to this model's own
representation: **Head, st1–st3, sa1–sa7, Tail — twelve midline points at the real segment
boundaries — plus left and right landmark rows at every segment.** That is the model's midline
exactly, with the width the model otherwise has to guess.

**What it is, and what it is not.** 116 frames across three recordings (two genotypes, *tsh>w1118*
and *tsh>Ubx*), hand-placed, sampled every third frame. These are DeepLabCut *training* labels,
picked for posture diversity, so they are enriched for bent postures and are **not** a behavioural
sample. There is no crawl/turn segmentation and no mm calibration anywhere in the project. So this
data can say what shape a bending larva takes; it cannot say how often, or how bent a crawling one
is. Nothing in §8h was revised on the strength of it.

### Bend distribution along the body — and `bexit`

Mean |bend| per boundary, hand-labelled:

```
 T1/T2  T2/T3  T3/A1  A1/A2  A2/A3  A3/A4  A4/A5  A5/A6  A6/A7  A7/Tl
  8.14   8.51  10.78  10.80   9.83   9.37   7.42   5.29   4.56   4.91   deg
```

Broad, peaked at T3/A1–A1/A2, and every boundary carries at least 42% of the peak. Normalised and
compared against the model's own time-averaged profile (`bendshape.js`):

| | RMS | r |
|---|---|---|
| `bexit` 0, all frames | 0.323 | **−0.14** |
| `bexit` 0, most-bent 25% | 0.416 | **−0.39** |
| `bexit` 1, all frames | 0.153 | +0.69 |
| **`bexit` 1, most-bent 25%** | **0.148** | **+0.78** |

The old default was *anticorrelated* with real bend distribution. The cause is the renormalisation
in `localShape()`, which its own comment describes: with `bexit` 0 the commanded articulation is
conserved while any of the profile is on the body, so as it runs off the tail the remainder is
amplified into a kink at A7/A8 — and that kink dominates the time average, giving a bend profile
peaked at the *tail* where a real larva peaks at T3/A1.

**`bexit` now defaults to 1.** Cost at matched conditions: |turn| 46.5 → 45.3°, turns/min
2.83 → 3.13, stride 0.556 → 0.527 mm, speed 0.573 → 0.566 mm/s.

This is worth recording as a methodological point, not just a parameter change. §8e lists `bexit`
as "tried and refuted" — and it was, **against the rotation profile**. It was never tested against
bend *shape*, because until this data existed there was no real bend shape to test against. A
mechanism refuted on one measure is refuted on that measure, and the documentation should have
said so.

One residual: after the change, T1/T2 reads 0.38 of peak against a real 0.75, so the model's
anterior-most boundary still bends too little. Raising `ext` does not fix it (0.39 at `ext` 6).
Unexplained.

### Width profile — measured rather than assumed

Normalised width at T1–A7, from the paired left/right landmarks:

```
  T1    T2    T3    A1    A2    A3    A4    A5    A6    A7
 0.59  0.75  0.87  0.96  1.00  1.00  0.97  0.92  0.84  0.72   measured
 0.52  0.70  0.84  0.95  1.00  1.00  0.95  0.84  0.70  0.52   old sine taper
```

The guessed sine taper had the shape right — peak at A2/A3, near-symmetric — and was wrong only
at the posterior, where a real larva stays fuller (0.72 against 0.52). The measured profile now
drives both the drawn silhouette and the denticle row offsets, with head and tail tapered to 0.30
since the extremities carry no landmarks. This is cosmetic for any default run, because `rsp`
is 0.

Measured width/length is **0.32–0.39** against this model's 0.19, so the body is roughly 1.5–2×
too narrow in absolute terms. That is *not* acted on: there is no mm scale in the project, and the
12-point polyline underestimates true arc by about 16%, which inflates the ratio. It matters only
if `rsp` is ever used in anger.

### Left–right asymmetry — the premise, measured

The asymmetry index (L−R)/(L+R) per segment, over the same frames:

```
 T1/T2  T2/T3  T3/A1  A1/A2  A2/A3  A3/A4  A4/A5  A5/A6  A6/A7
 0.191  0.249  0.364  0.358  0.323  0.234  0.158  0.131  0.126
```

Anterior mean 0.268 against posterior 0.162. At the peak, 0.364 means **the inside of the bend is
less than half the length of the outside**, and it is spatially coherent — 85% of segments share a
sign within a frame, and 59% of frames have at least 8 of 9 agreeing — so it is posture, not noise.

This is the premise the whole turning investigation started from: asymmetric contraction
concentrated in thorax and anterior abdomen. It is now a measurement rather than an assumption,
and it is the empirical input for §8g if the applied yaw moment is to be *derived* from asymmetric
contraction rather than parameterised independently. That was the open question that would make
the width work of §8f pay for itself.

---

## 8j. Cast rotation and crawl bend, measured on real recordings

Stage 13's follow-up ran three cuts on real tracking (156 turns, 18 larvae, two genotypes) with
the synthetic fixtures through the same code. It settles two questions and corrects one of this
document's own numbers.

### A. Real larvae do rotate toward the turn during the cast — slightly

Signed against each turn's own final direction, tail→sp1, turns of 15° or more:

| | turns | cast signed | unsigned | positive | after cast | net |
|---|---|---|---|---|---|---|
| **real, pooled** | 156 | **+1.72°** | 5.69° | **66%** | +57.2° | 58.9° |
| model slow_bend, stage 12 path | 56 | −2.21° | 2.64° | 18% | +55.4° | 53.2° |
| model fast_bend, stage 12 path | 85 | −6.60° | 7.13° | 2% | +25.3° | 18.7° |

At larva level, 14 of 17 real larvae have a positive mean against 0 of 8 model larvae. Both
genotypes give 66%. The signed/unsigned gap is visible in the real data exactly as warned:
+1.72° against 5.69°.

**Two corrections, both on this side.**

1. **The calibration target was computed with the wrong cast end.** `castrecoil.js` ends the cast
   at the state-machine transition (0.82 s); the brief and stage 12 use the sp1 bend peak
   (2.08 s), which is later because the bend must migrate there. On matched turns the model gives
   **−0.78°, 36% positive** under the sp1 definition against −2.76°, 5% under the state
   definition. So §8g's "95% of turns recoil" was an artefact of comparing two windows.
   `bexit` is not the cause (−0.64 at `bexit` 0 against −0.78 at 1). `castdef.js` measures both.
2. **Five points bias the cast toward recoil by about 2°.** On slow_bend the truth file gives
   +0.01° at 12 points, −1.53° at five, and stage 12 reports −2.21°. If real larvae carry the
   same bias their true cast rotation is more positive than +1.72°, which cannot be checked from
   tracking alone.

**What survives.** Real casts lean toward the turn and the model's do not — consistently, at
larva level, in both genotypes. **What does not.** The size of that difference: 1–3°, against a
net turn of 59°. The cast is not where reorientation happens in either the model or the animal.

**And the most useful number here is the one nobody asked for.** Post-cast rotation is +57.2° in
real larvae and +55.4° in the model, with nets of 58.9° and 53.2°. **The model produces about the
right amount of rotation**; §8e shows it delivers that rotation over 10–20 segment lengths where
real larvae are done in five. The defect is distributional, not a deficit — which makes an applied
yaw moment (§8g) a less direct fix than it appeared, since adding rotation is not what is needed.
Redistributing it in distance is, and that means adding a moment *and* removing bend-travel
rotation later, not simply adding a term.

### B. The crawl-bend residual is not pixel noise

Both nulls proposed from this side were wrong, and the reasons are worth keeping:

- **The synthetic fixtures are strongly autocorrelated** (signed lag-1 0.74–0.95), because the
  model's own bending survives both ways of excluding turns. They cannot serve as a
  measurement-only null.
- **Pixel noise is not frame-independent at low speed.** For a straight 3.35 mm body, lag-1 is
  1.00 at rest, 0.94 at 0.02 mm/s and 0.87–0.92 at 0.05 mm/s. The floor rows in §8h move at a
  fixed 0.5 mm/s, so they are no null for larvae crawling at 0.035–1.40 mm/s. This is the second
  time an independent-pose assumption has been wrong here; the first was the smoothed floor.

The null used instead is a perfectly straight body moved along each real larva's own path, with
its headings, speeds, pauses and pixel grid. Against it:

| | lag-1 (sp1/sp2/sp3) | first lag < 0.2 |
|---|---|---|
| real amiGA-amRNAi | 0.62 / 0.44 / 0.29 | 17 / 22 / 9 frames |
| straight-body null, same paths | 0.10 / 0.13 / 0.19 | 1 / 1 / 1 |
| real w1118 | 0.66 / 0.63 / 0.51 | 8 / 13 / >30 |
| straight-body null, same paths | 0.04 / 0.06 / 0.08 | 1 / 1 / 1 |

Real crawl bend is **held for 1–3 s**; the null is gone by one frame. Pixel rounding is excluded
as the source. FIM-Track's spine fit is not — an error in placing points on a slowly changing
contour could also persist.

### C. The residual is distributed, not thoracic

Median per-angle bend minus the straight-body null on the same paths:

| | sp1 (0.29) | sp2 (0.54) | sp3 (0.79) |
|---|---|---|---|
| amiGA-amRNAi | +4.5° | +3.2° | +3.7° |
| w1118 | +6.1° | +3.0° | +4.9° |

The null is highest at sp3, the shortest link, as predicted. The excess is present at **all
three** angles, largest anteriorly and smallest mid-body. (Subtracting medians is not the same as
recovering a true bend; read it as an ordering.)

So real crawling carries a persistent, body-wide curvature that this model does not have at all —
its crawl is geometrically straight, §8h. That is what shows up at trace level as the model
drawing straight runs where real larvae draw curved ones, and it is a better-posed target than
the per-angle statistic, because path curvature integrates over time and escapes the ~5° floor
that left §8h inconclusive.

---

## 8k. Postural curvature — why the trajectories were straight

The model's runs were straight lines. Real trajectories curve continuously, and §8j measured why:
real crawling carries a **persistent, body-wide bend** — present at all three tracked angles,
held for 1–3 s — where this model's crawl is geometrically straight (§8h, true per-angle bend
0.00°). The weathervane cannot supply it: `wv` is an anterior oscillator on a 7 s clock, damped
further by the `sr` lag, and at its maximum it moves the measured crawl bend by ×1.05 against the
×1.43–1.61 needed (`wvsweep.js`, `extsweep.js`).

### The mechanism

`cb` is a body-wide curvature in radians of total bend, spread equally over all ten boundaries
and added to whatever the cast commands. It is driven by an Ornstein–Uhlenbeck process, so it
**wanders and persists** rather than oscillating. `cbs` is its standard deviation in degrees,
`cbt` the time a curve is held.

Equal spreading is the honest default: §8j finds the excess at all three angles, largest
anteriorly and smallest mid-body, which is not a clean gradient to fit.

**One thing had to be fixed for it to work at all, and it is worth recording.** A raw OU process
is Brownian at short times — its per-frame step scales as √dt, so however slowly it wanders it is
rough frame to frame. In this model every shape change is converted into body motion by the
placement step, so that roughness was **rectified into forward speed**: crawling went from 0.56
to 1.54 mm/s and stride from 0.53 to 0.84 mm, purely from the noise. Passing the OU through a
second lag (a fixed eighth of `cbt`) makes the curvature smooth, with a per-frame step
proportional to `dt`, which is what a held posture actually looks like. After that filter the
crawl statistics are untouched.

This is the §8f/§8g lesson again from a new direction: shape change is the only input the
placement has, so it cannot tell a posture from a movement command unless the posture is smooth.

### Fit

Measured through the same chain as the recordings — five points, whole pixels — on crawl frames
only, against real larvae referenced to a straight-body null on their own paths:

| | median \|bend\| sp1/sp2/sp3 | autocorr lag-1 | first lag < 0.2 |
|---|---|---|---|
| real amiGA-amRNAi | 7.93 / 6.58 / 8.12 | 0.62 / 0.44 / 0.29 | 17 / 22 / 9 |
| real w1118 | 9.88 / 6.97 / 9.53 | 0.66 / 0.63 / 0.51 | 8 / 13 / >30 |
| model, `cbs` 0 | 4.40 / 4.97 / 4.97 | 0.53 / 0.47 / 0.46 | 5 / 4 / 4 |
| **model, `cbs` 25 `cbt` 2** | **6.12 / 7.13 / 6.34** | 0.76 / 0.70 / 0.67 | 22 / 26 / 21 |
| model, `cbs` 36 `cbt` 0.8 | 7.82 / 7.82 / 7.13 | 0.78 / 0.70 / 0.65 | 12 / 10 / 10 |

`cbs` 36 / `cbt` 0.8 fits the amplitude better and sits squarely inside the real persistence
range — **but it destroys the turns**: mean |turn| falls from 44.9° to 19.6°, turn rate rises to
5.24/min and border occupancy from 0.42 to 0.71. `cbt` is the damaging variable, not amplitude: a
fast-wandering body-wide bend scrambles a cast while it is being executed.

`cbs` 25 / `cbt` 2 is therefore the default. Cost at 900 s × 3 seeds: |turn| 44.9 → 43.9, turns
per minute 3.26 → 3.11, speed 0.559 → 0.570 mm/s, stride 0.530 → 0.538 — every one inside seed
noise. It buys roughly 60–70% of the measured curvature amplitude for nothing. Pushing to `cbs`
28 starts to cost turn size (40.7°), and 32 more (37.9°).

**What it does not do.** It is not a fix for §8g. The turns still deliver their rotation over
10–20 segment lengths where real larvae are done in five. This addresses the *runs*, which were
straight, and that is a separate defect that happened to be the visible one.

**Still open:** lag-1 autocorrelation is too high (0.76 against a real 0.62), meaning the model's
curvature is smoother at short lags than a real larva's. The smoothing filter that stopped the
speed inflation is the likely cause, and the honest reading is that one filter is now doing two
jobs.

---

## 8l. The boundary — measured, and a correction to my own measurement

The arena edge looked wrong on screen: the model appeared to grind into a wall and bounce rather
than follow it. Tracking was asked what real larvae do.

### What the recordings say

**The arena is a circle**, Ø 99.5–99.8 mm, the same in both recordings though they sit at
different places in the camera field; no body point ever enters the corners of the bounding
square. Larvae reach it widely — 21 of 22 larva IDs come within one body length, and the edge is
touched in 54–78% of its 5° sectors.

**No bulk accumulation.** Within 2 mm the occupancy is 6.9% against 6.9% expected from area
alone, and 8.6% against 7.1%. There *is* a thin dense rim: within about 1.5 mm, centroid density
reaches 1.5–2.9× its value 3–4 mm in.

**Alignment is bimodal between individuals**, which none of the brief's three outcomes
anticipated. Pooled, 48% and 33% of near-edge frames lie along the edge — but against a
*geometric null* of 27–29%, and the pooled figures are dominated by single animals. Per larva the
share runs 0–69% and 0–72%: **most larvae sit at or below chance and two or three follow the edge
strongly.** With 21 larva IDs that split cannot be estimated.

That geometric null is the tracking side's own addition and it is the reason any of this is
readable: a centroid within 2 mm of the wall often *cannot* point at it without the head leaving
the dish, so the zone favours along-wall angles before any behaviour.

**Bouts** are 3.6 and 4.8 s median, but 42–63% are censored, and **48–70% of all tracking losses
occur within 2 mm of the edge** where only 10–12% of frames are. The near-edge record is
truncated exactly where it is being measured, so bout duration is too weak a quantity to fit to.

### The model, and my error

I first reported the model at **5.0% aligned against its own null of 22.8%** — a factor of four
*below* chance — and concluded the hard wall was actively driving the body perpendicular. **That
was wrong, and the fault was in my measurement.** `wallcheck.js` defined "at the border" by the
**head** within 0.6 mm, while the null randomised orientation about the **centroid**. A
head-proximity criterion admits a body *pointing at* the wall from much further out than one lying
along it, so it selects perpendicular postures before any behaviour, and the null does not share
that selection. The tracking analysis used the centroid throughout, which is why its zone and its
null were consistent and mine were not.

With the zone matched to the tracking definition:

| | aligned (75–90°) | geometric null | ratio |
|---|---|---|---|
| model, defaults | 32.3% | 30.4% | **1.06** |
| real, w1118 | 32.9% | 26.6% | 1.24 |
| real, amiGA-amRNAi | 48.2% | 29.0% | 1.66 |

The model sits slightly above its own null and close to the weaker of the two recordings. It is
**mildly under-aligned, not catastrophically anti-aligned**, and there is no four-fold defect to
fix.

Two things nearly went wrong here and are worth recording. A fix was built on the strength of the
bad number — a wall-deflection term, `wdf` — and on the corrected measure it makes alignment
*worse* relative to the null (0.84 against 1.06), so it stays at 0. And the diagnosis en route was
also wrong: the hypothesis that a blocked larva cannot turn, because rotation needs travel (§8e),
is refuted by measurement — near-wall turning runs at 6.3 °/s against 5.3 °/s away, and crawl
speed is only 16% lower. Nothing is stuck.

`wdf` is kept at 0 as a documented instrument, like `rsp` and `asym`: the question "does deflecting
the body along the wall help?" is an obvious one and now has a measured answer.

### What is still worth doing

The arena is **square and the real one is a circle** — measured, not assumed. Corners do not exist
in a dish and this model's corners trap (limitation 10a). That change stands on the geometry
alone, independent of anything above, and has not been made.

---

## 8m. Wave overlap and mouth hooks — a correct fix that makes the table worse

Two things looked wrong on screen: the anterior was still contracting when the next wave fired at
the tail, and the head released at the moment a real larva plants its mouth hooks. Both were real,
both are now fixed, and the first one **exposed a parameter set that does not hold together**.

### The overlap, and what it was doing

`initWave` gated the next wave on

```
waveEnd = time + (N-1)*del/1000          // 10 x 90 ms = 900 ms
```

which is when the relay **front** reaches the far end. The segment it reaches then spends `dur`
= 600 ms contracting, so T1 finished at 1500 ms while the next wave fired at 900 ms: **waves
overlapped by 600 ms, 40% of a wave.** The comment justifying it claimed "the trailing segment
finished contracting long before that", which is false by 600 ms.

Imaging of segmental activity says the anterior is *not* active when the next wave initiates, so
the gate now includes the contraction:

```
waveEnd = time + (N-1)*del/1000 + P.dur/1000
```

### What that costs, and why it cannot be tuned away

Non-overlap means one wave occupies `10·del + dur`. With the **measured** delay of 90 ms that is
900 ms of pure relay, so inside the **measured** stride period of 1.07 s only 170 ms is left for
contraction — and 170 ms cannot produce a realistic stride at any amplitude the slider allows
(`amp` ≤ 0.7 gives 0.33 mm against a published 0.52–0.70).

Every configuration tried is worse than the overlapping one:

| | stride | speed | \|turn\| | turns/min | s per wave |
|---|---|---|---|---|---|
| published | 0.52–0.70 | 0.64 | tens | 1.7–2.8 | 1.07 ± 0.12 |
| before (overlapping waves) | 0.538 | 0.570 | 43.9 | 3.11 | 0.90 |
| **now (non-overlapping)** | **0.529** | **0.398** | **31.3** | **2.95** | **1.64** |
| `dur` 170, `amp` 0.7 | 0.331 | 0.350 | 18.2 | 4.66 | 1.07 |
| `del` 50, `dur` 570, `amp` 0.5 | 0.696 | 0.800 | 26.2 | 4.89 | 1.07 |

So **the model's crawl kinematics were partly produced by waves overlapping.** Removing a
mechanism that imaging says is wrong has exposed that, and the validation table is worse for it:
crawl speed falls from 0.570 to 0.398 mm/s and the wave period rises to 1.64 s against a published
1.07 ± 0.12. Stride is barely changed. **This is a real regression on the numbers and it is kept
deliberately**, because the alternative is retaining a known-wrong mechanism that happened to
compensate.

`dur` and `amp` are left at their documented values rather than re-tuned to chase the table. The
one configuration that restores crawling is **`del` ≈ 50 ms** (stride 0.696 and speed 0.800, both
inside their published windows for the first time), which contradicts the measured 0.09 ± 0.01 s
(Sun et al. 2022) and degrades turn amplitude. That is a falsifiable prediction rather than a
change: **if the intersegmental delay in intact crawling is nearer 50 ms than 90 ms, this model
becomes self-consistent.** It is measurable from wave-propagation imaging.

### Mouth hooks

The head's contact weight is `1 - lift·contraction`, so through T1's own contraction it ran

| ms after tail fires | T1 contraction | head weight |
|---|---|---|
| 900 | 0.00 | 1.00 |
| 1100 | 0.75 | 0.32 |
| **1200** | **1.00** | **0.10** |
| 1500 | 0.00 | 1.00 |

The head was **most released at the peak of its own contraction** — the moment a real larva plants
its mouth hooks to anchor the newly advanced anterior. `mh` adds grip at the head in proportion to
T1's contraction, forward crawling only, and defaults to 1.

**It does not recover the lost stride** (0.331 → 0.341 at `dur` 170; 0.412 → 0.408 at `dur` 300).
That is consistent with what §6a already records: in this model the ratchet comes from the
geometry of the travelling release, not from grip, which only scales it. The hooks are in because
the mechanism is right, not because they fix anything.

### The remaining visual, which is not new

The tail staying bent coming out of a turn is **§8e seen from another angle**, not a separate
defect. At the model's own definition of turn end nothing is bent (0.06° at both ends, ratio
1.01); the turn simply does not *end* until the bend has run off the tail, which takes 10–20
segment lengths. For the back half of that the posterior is the only bent part.

---

## 8n. After a reversal — a branch that was missing, and a guessed number

**Before this, a reversal could not end any way but in a turn.** The exit was unconditional:

```js
if(state==='back'){ revLeft--; if(revLeft<=0){ state='run'; enterCast(awayDir()); } }
```

Measured over 41 wall-triggered reversals: 100% followed by a head cast, 0% resumed straight. No
stochastic branch existed anywhere in that path, and `revLeft` was always 2.

That also contradicted §4a. The habituation hierarchy is documented as *alternative* responses —
reversal, then turn, then pause, then none — but appending a cast to every reversal made the top
tier "reversal **and** turn" while the tier below it was "turn alone". The hierarchy as
implemented was not the hierarchy as described.

`rvp` is the branch: the chance a reversal ends in a head cast rather than the animal crawling on.

### The number is a guess

**It is not measured and it cannot be, from the recordings we have.** The boundary is where
FIM-Track fails — 48–70% of all tracking losses occur within 2 mm of the edge, where only 10–12%
of frames are (§8l). 0.7 is a plausible default and nothing more. It is flagged as a guess here,
in its tooltip and in the parameter table, and it should be the first thing re-examined if
boundary data ever becomes available.

### What it does

| `rvp` | cast after | median \|Δψ\| | effectively straight | stride | speed | \|turn\| | turns/min | border | near-wall alignment / null |
|---|---|---|---|---|---|---|---|---|---|
| 1.0 (old behaviour) | 100% | 10.7° | 72% | 0.552 | 0.386 | 27.6 | 3.50 | 0.332 | 25.5 / 31.2 |
| **0.7 (default)** | 71% | 8.9° | 90% | 0.538 | 0.392 | 29.0 | **3.16** | 0.342 | 21.0 / 31.1 |
| 0.4 | 39% | 6.2° | 94% | 0.503 | 0.410 | 29.5 | **2.98** | 0.452 | 13.0 / 29.0 |

The branch tracks the parameter exactly, so it works. Its behavioural effect is **small and
mixed**: turn rate moves toward the published 1.7–2.8, wall alignment moves away from the real
1.24–1.66 ratio, and the crawl statistics barely move.

The reason the heading outcome changes so little is worth noting on its own: **even when a cast
always follows, 72% of reversals end up within 20° of where they started.** Acceptance is 0.50 and
an unaccepted single cast leaves the heading roughly unchanged, so the old 100% figure was
"always attempts a turn", not "always turns".

**This is kept because the structure is right, not because the numbers improved.** A hard-wired
100% was indefensible once seen; a branch with a guessed probability is honest about what is not
known. One thing still fixed that should not be: `revLeft` is always 2, so every reversal is the
same length.

---

## 9. Data export and import

### Export

The data exports are CSV, which opens directly in Excel; figures and clips are covered below. The
trajectory is written straight from the replay buffer, so **what you export is exactly what you can
scrub through** — sampled every 50 ms of simulated time rather than at the 2 ms integration step,
which keeps files a manageable size and matches typical tracking frame rates. Everything on this
page is written by the page: no server, no upload, nothing leaves the machine.

`Export CSV` — one row per 50 ms:

```
t_s, cx_mm, cy_mm, heading_deg, head_angle_deg, state, dir, genotype,
local_substrate, dist_patch_centre_mm,
in_border, local_search, wall_habituation, wall_tier, cum_border_s,
spine_x0_mm, spine_y0_mm … spine_x11_mm, spine_y11_mm    (12 midline points)
contract_T1 … contract_A8                                (11 cols, 0–1)
contact_head, contact_T1_T2 … contact_tail               (12 cols, 0–1)
bend_T1_T2_deg … bend_A7_A8_deg                          (10 cols)
```

`Turns` — one row per completed turn: `t_s, turn_angle_deg, n_sweeps, local_substrate`.

`Visits` — one row per patch visit, including `decision_latency_s` (§*The visit log*).

### Figures

`Figure` writes the trajectory on screen as a **vector PDF**, or SVG with shift-click: the arena,
its food patches, the track, a scale bar and a legend naming genotype and arena. Real paths, not a
screenshot, so it scales and opens for editing in Illustrator or Inkscape. The batch panel has the
same export for the runs ticked in its table, overlaying them coloured by condition.

The PDF is written by the page itself — a small writer emitting paths, filled circles and
Helvetica text, embedding no fonts, with transparency flattened against white instead of using an
ExtGState. That keeps the page one self-contained file with no dependencies, which is the property
that lets it be emailed to someone and just work.

Under the arena it states the **duration of the trace**, bottom right, opposite the scale bar:
`800 s (13 min)` for one trace, `2 runs, 600 s (10 min)` when several share a duration, and
`2 runs, 300-1800 s (5.0-30 min)` when they do not. The figure is often the only artefact that
leaves the session, so it should say how much behaviour it represents without needing the file
name.

That number is taken from the **track itself** — the first and last `t_s` actually drawn — not
from the run's requested duration. It draws the **replay buffer**, so on a run longer than 3000 s
it shows the last 3000 s; stating the requested duration there would overstate what is on the
page. It is the centroid track rather than the body outline.

PDF string literals are delimited by parentheses, so every text run in the writer is escaped
(`pstr`) before it is emitted. Previously only non-printables were stripped, which meant a bracket
or backslash in any label — a condition name, an imported genotype — would have produced a
malformed file. Nothing in the shipped presets contains one, so this was latent rather than
broken.

### Video clips

The replay bar marks a clip with **In** and **Out**, and the rate menu sets how much simulated time
each second of video carries. The label states the resulting video length before you commit to it.

A clip is a rendering of the replay buffer through the same `goScrub` the scrubber uses, so it
cannot disagree with what you can scrub through. Zoom and Follow are recorded as set — zoom in and
choose 1x for peristalsis, since at 20x a stride lasts a single frame. The arena caption and replay
timestamp are burned into the picture, because a video has no page around it to carry them.

Frames are pushed by hand through a zero-fps capture stream rather than letting the recorder sample
the canvas on its own clock, which drops or repeats frames whenever the tab is busy. The cost is
that the recorder timestamps frames by wall clock, so **recording happens in real time** — a 20 s
clip takes 20 s to make. That is the reason clips are offered and whole runs are not: an hour of
simulated time at 1x would take an hour to film. Output is WebM (MP4 on Safari); `ffmpeg -i
clip.webm -c:v libx264 -pix_fmt yuv420p clip.mp4` converts it.

### File naming and location

The text field in the header sets the filename prefix; leaving it blank produces
`larva_<genotype>_<substrate>_<arena>_<timestamp>`. Files are suffixed `_trajectory.csv` and
`_turns.csv`.

**A page cannot be given a folder by a browser.** Where the File System Access API is available
(Chromium over http(s)) a save picker opens and you choose folder and name yourself; otherwise the
file goes wherever your browser puts downloads. Opening the HTML from `file://` usually falls back
to the plain download, so if you want the picker, serve the folder — `python3 -m http.server` in the
directory, then open `http://localhost:8000/larval_locomotion_sandbox.html`.

### Import

`Import` loads a trajectory CSV into the replay buffer and puts the sandbox into replay over it.
It reads two kinds of file:

1. **This sandbox's own export** — round-trips exactly, including spine, contraction and bend.
2. **Foreign spine tracking** — anything with a time column and x/y columns per midline point.
   Column spellings matched include `spine_x3`, `x3`, `x_3`, `point3_x`, `spinepoint_3_x`, `p3x`,
   in either axis-first or index-first order, case-insensitive. Time is taken from `t`, `t_s`,
   `time`, `sec` or `timestamp`; failing that a `frame` or `index` column is used **assuming 30 fps**,
   which the caption states. Comma, tab and semicolon delimiters all work.

What happens on import:

- The spine is resampled by arc length onto this model's 12 points, so a tracker with 7, 11 or 20
  points all load.
- **Units are detected.** If the relaxed body length (90th percentile, since the median is pulled
  short by contracting segments) is already a few mm the file is taken at face value; otherwise it
  is assumed to be pixels and scaled so the relaxed body is 4 mm. The caption states which, and the
  scale factor.
- **Segment contraction and intersegmental bend are recomputed from the geometry**, so both
  kymographs work on real tracked data — contraction from each segment's length against its own
  relaxed length, bend from the angle between consecutive segments.
- The arena is resized to fit the track.
- A file with only a centroid and no spine still loads; the body is hidden and you get the path.

**Substrate contact is not recoverable from tracking.** Imported frames show every point planted and
the release band stays blank. That is missing data, not a measurement of zero — stance and swing
need ground reaction forces or ventral imaging, not a midline.

Imported frames are someone else's data, so pressing play clears the import and restarts the model
rather than splicing a simulation onto a recording. The state stat reads `imported` throughout.

## 10. Controls

Header: genotype, substrate, arena type and **arena size**, wall-response mode, spontaneous-turn
toggle, pause/play, manual cast, manual reverse, reset, exports (CSV, turns, visits, figure),
import, **Batch**, and a control-panel hide toggle (gives the arena the full window). Below the
canvases, the replay scrubber and its transport (§8a), the clip controls (§9) and the stats row.

The arena size menu offers the published geometries (§5); `Arena W` and `Arena H` set anything
else. Both are in mm and neither depends on the window — the panel letterboxes the arena, so the
window's shape is now purely cosmetic and can be used to frame a clip tightly.

### Control layout

There are 44 parameters (`node params.js` lists them all with provenance), which at two lines per control took more vertical space than the arena.
Each control is now one line — label, value, slider — and the **All** view dissolves the four panel
boxes into a single flat grid. That matters more than it sounds: with separate panels the block is
as tall as the *tallest* panel, so three short groups leave dead space under them. Rows are tinted
down the left by group, matching the tab underlines, since the flat grid has no room for headings.

The tabs show one group at a time when you want the arena bigger. Measured in a headless browser
(`measure.js`), at 1536 × 757:

| View | Controls | Arena |
|---|---|---|
| Original two-line layout | 147 px | 443 px (59%) |
| All, flat grid | 112 px | 481 px (64%) |
| Single group | 46 px | 687 px (76%) |

At 1280 × 650 the original took 222 px of a 650 px window; the flat grid takes 150 px, and a single
group 46 px. `Hide controls` still removes them entirely. Sliders are grouped into peristalsis, substrate contact, and behaviour/arena. Sim speed
runs 0.25×–20× by scaling substeps per frame — the 2 ms integration step is unchanged, so the
mechanics are identical at any speed; only the kymograph time-per-column changes.

---

## 11. Known limitations

1. **Quasi-static, not dynamic.** No masses or inertia, and no ground reaction forces to compare
   against ERISM/WARP measurements. Note the refinement in §3.2: the placement *is* a force and
   torque balance, but with isotropic springs and no applied moment, which is the specific
   restriction that breaks the turns (§8g) — not the absence of forces as such.
2. **Anisotropy is a two-pass approximation**, not a friction cone. A proper directional
   resistance tensor is implemented and validated in `forcetest.js` but is not in the model;
   on its own it does not help (§8g).
1b. **The crawl kinematics partly depended on a wave-timing bug** (§8m). With waves gated
   correctly the measured intersegmental delay, the measured stride period and a realistic stride
   length cannot all hold at once; speed, wave period and turn amplitude are all currently worse
   than published. The regression is kept rather than compensated, and the open question is
   whether `del` is nearer 50 ms than 90 ms in intact crawling.
1a. **Postural curvature is a process, not a mechanism.** `cbs`/`cbt` reproduce the measured
   body-wide crawl bend and the curved trajectories that follow from it, but nothing in the
   model *generates* that curvature — it is an OU process fitted to data, in the same sense
   that patch leaving is a decision layer rather than emergent mechanics (limitation 11).
2a. **The body has no width by default.** `rsp` adds two denticle rows and `asym` a bilateral
   grip difference, but both are off because measurement showed they change nothing that
   matters (§8f). With them off the body is a line and cannot distinguish left from right.
3. **Wave initiation is a clock.** There is evidence the next wave is gated by completion of the
   previous one, which would make stride period emergent rather than a parameter.
4. **No proprioception.** Real wave propagation depends on stretch feedback; here the relay is
   open-loop with a failure probability standing in for it.
5. **No sensory environment.** Food patches change motor parameters and bias turns at the border,
   but there is no olfaction, no gradient, no feeding and no satiety.
6. **Bend profile is fixed in shape.** Real asymmetric contraction has a measured anterior and
   posterior extent and a peak position that migrate during a turn; here only the extent is
   adjustable and the profile shape is static. Since `bexit` became the default the
   time-averaged distribution matches hand-labelled data well (r = +0.78, §8i), but the
   anterior-most boundary T1/T2 still bends about half as much as it should.
7. **Collision is a rigid push-in.** The body does not deform against the wall.
8. **2D only.** No rolling, no digging, no self-righting, no denticle folding.
9. **Contraction amplitude and bend migration are calibrated, not measured.** They are the two
   parameters set to make the output match published kinematics rather than taken from a paper.
   Both are flagged as such in their tooltips.
10. **Turn rate runs above the published range** in small arenas because boundary encounters add
   turns. Use a large arena when comparing turn statistics.
10a. **The arena is rectangular**, so a Petri dish is approximated by a square of the same width.
   A circular boundary meets a crawling larva at a continuously varying angle; a square has
   corners, which trap. For edge-occupancy work prefer the square arenas, which the foraging
   literature uses anyway.
11. **Patch leaving is a decision layer, not emergent mechanics.** The OU process and the
   comparative memory are the published phenomenological model reimplemented on top of the
   neuromechanics; nothing in the peristalsis gives rise to them. The quality scale
   (agar 0, sucrose 0.5, yeast 1) is an assignment, not a measurement, and the drift, leak and
   noise values are tuned here rather than taken from the paper, which does not report them
   numerically.
12. **Replay is playback only.** The scrubber reviews what happened; it cannot restore the
   simulation to an earlier state or branch from it. Video clips are rendered from the same
   buffer, so they inherit its 3000 s limit and are recorded in real time — a clip takes as
   long to make as it does to watch, which is why whole runs are not offered.
13. **Imported tracking has no contact data**, and its contraction and bend are reconstructed from
   midline geometry rather than measured — a tracker's spine smoothing will show up in both.
14. **Three parameters cannot be swept** — stride period, mean run and pause fraction are derived
   from the substrate every frame (§5). Both the page and `sweep.js` now compare every value
   set against the parameters the model finished with and report the discrepancy
   (`param_ignored` in `runs.csv`), but the check is a guard rail, not a fix: those parameters
   remain unsweepable, and §8c records what sweeping them cost before the guard existed.
15. **The turns are wrong in their distance distribution** (§8e–§8g, §8j). Rotation is produced
   as the bend travels back through the body, so turn amplitude and migration rate are one
   mechanism seen twice and cannot both match the literature. The model is *negative* over the
   first one to two segment lengths where real larvae put 26% of the turn into the first half
   segment length. Note what is **not** wrong: the total rotation after the cast is about right
   (model +55°, real +57°, §8j), so the defect is where the rotation is delivered in distance,
   not how much of it there is. Four fixes were built and
   measured against this and all four failed: faster migration, articulation exit, body width,
   and bilateral grip asymmetry. Rotation here is bounded by the shape change, so no contact
   model can repair it. Treat `migK` as a calibration that buys turn size at the cost of a
   physiologically slow bend, and read §8g before attempting anything.
15a. **Rotation and translation are solved, but shape is prescribed.** The model's central claim
   is that placement is solved rather than scripted, and that holds. But the shape trajectory
   itself is commanded, and §8g shows that is where the missing rotation would have to come
   from — which is why fixing the turns changes what the model claims, not just what it fits.
15b. **A refutation is only ever against one measure.** `bexit` was recorded as refuted in §8e
   on the rotation profile, then turned out to be right on the bend distribution (§8i). Several
   other mechanisms here were tested against one quantity only: `migV`, `rsp` and `asym` have
   each been checked against rotation and turn statistics, not against bend shape.
16. **Cross-engine determinism is unverified.** The same seed gives bit-identical results between
   Node and Chromium, but both are V8, and `Math.sin`, `cos` and `atan2` are not required to be
   correctly rounded — two engines may differ in the last bit, which over millions of substeps
   could diverge. Nothing in the design depends on it (every run stores its own track rather than
   being re-run to redraw it), but a trajectory reproduced in Firefox or Safari from a seed may
   not match one produced in Chrome. `batch/parity.js` is the test if it ever matters.

---

## 12. References

- Booth, J. et al. (2024) Optical mapping of ground reaction force dynamics in freely behaving
  *Drosophila melanogaster* larvae. *eLife* 12:RP87746.
- Davies, A., Louis, M., Webb, B. (2015) A model of *Drosophila* larva chemotaxis.
  *PLoS Comput Biol* 11:e1004606.
- Gomez-Marin, A., Louis, M. (2014) Multilevel control of run orientation in *Drosophila* larval
  chemotaxis. *Front Behav Neurosci* 8:38.
- Gomez-Marin, A., Stephens, G.J., Louis, M. (2011) Active sampling and decision making in
  *Drosophila* chemotaxis. *Nat Commun* 2:441.
- Günther, M.N. et al. (2016) Quantifying and predicting *Drosophila* larvae crawling phenotypes.
  *Sci Rep* 6:27972.
- Heckscher, E.S., Lockery, S.R., Doe, C.Q. (2012) Characterization of *Drosophila* larval crawling
  at the level of organism, segment, and somatic body wall musculature. *J Neurosci* 32:12460.
- Kane, E.A. et al. (2013) Sensorimotor structure of *Drosophila* larva phototaxis. *PNAS* 110:E3868.
- Lahiri, S. et al. (2011) Two alternating motor programs drive navigation in *Drosophila* larva.
  *PLoS ONE* 6:e23180.
- Liu, Y. et al. (2023) Synchronous multi-segmental activity between metachronal waves controls
  locomotion speed in *Drosophila* larvae. *eLife* 12:e83328.
- Loveless, J., Lagogiannis, K., Webb, B. (2019) Modelling the mechanics of exploration in larval
  *Drosophila*. *PLoS Comput Biol* 15:e1006635.
- Ohyama, T. et al. (2013) High-throughput analysis of stimulus-evoked behaviors in *Drosophila*
  larva. *PLoS ONE* 8:e71706.
- Osborne, K.A., de Belle, J.S., Sokolowski, M.B. (2001) Foraging behaviour in *Drosophila* larvae:
  mushroom body ablation. *Chem Senses* 26:223.
- Pehlevan, C., Paoletti, P., Mahadevan, L. (2016) Integrative neuromechanics of crawling in
  *D. melanogaster* larvae. *eLife* 5:e11031.
- Pehlevan, C., Gjorgjieva, J. et al. (2013) Neural circuits for peristaltic wave propagation in
  crawling *Drosophila* larvae. *Front Comput Neurosci* 7:24.
- Pulver, S.R. et al. (2015) Imaging fictive locomotor patterns in larval *Drosophila*.
  *J Neurophysiol* 114:2564.
- Sokolowski, M.B. (1980) Foraging strategies of *Drosophila melanogaster*: a chromosomal analysis.
  *Behav Genet* 10:291.
- Sun, X. et al. (2022) A neuromechanical model for *Drosophila* larval crawling based on physical
  measurements. *BMC Biol* 20:130.
- Takagi, S. et al. (2017) Divergent connectivity of homologous command-like neurons mediates
  segment-specific touch responses in *Drosophila*. *Neuron* 96:1373.
- Wosniack, M.E., Festa, D., Hu, N., Gjorgjieva, J., Berni, J. (2022) Adaptation of *Drosophila*
  larva foraging in response to changes in food resources. *eLife* 11:e75826. (240 x 240 mm arena;
  patch radius 25 mm for two patches, 12.5 mm for eight.)
- Zeng, X. et al. (2021) Representation of *Drosophila* larval behaviors by muscle activity patterns.
  bioRxiv 2021.11.26.470133. (Head-cast bend point near A2/A3; asymmetry posterior to the bend in
  A3-A5, carried by ventral oblique muscles 15/16 and largely as tone rather than shortening; the
  turn resolved over two forward waves.)
- Berni, J. (2015) Genetic dissection of a regionally differentiated network for exploratory
  behavior in *Drosophila* larvae. *Curr Biol* 25:1319. (Asymmetric output generating turns is
  initiated only in the thoracic segments; symmetric thoracic and abdominal output generates crawls.)
- Berni, J., Pulver, S.R., Griffith, L.C., Bate, M. (2012) Autonomous circuitry for substrate
  exploration in freely moving *Drosophila* larvae. *Curr Biol* 22:1861.
- Lesar, A. et al. (2025) Inhibitory circuit motifs in *Drosophila* larvae generate motor program
  diversity and variability. *PLOS Biol* 23:e3003094. (Head sweeps as asymmetric activity in
  thoracic and anterior abdominal segments, read out as a left-minus-right trace in T3; half-centre
  inhibition alternating the bias; an A1-A2 chiasm reconciling asymmetric thoracic activity with
  symmetric backward waves.)
- Zhao, W. et al. (2017) Turns with multiple and single head cast mediate *Drosophila* larval light
  avoidance. *PLoS ONE* 12:e0181193.
