# Stage 13 follow-up — three cuts, in priority order

A short brief. Stage 13's artefacts answered the question they were asked; these are the three
things that follow from them. All three are cuts on data and machinery you already have.

**Headline from the simulation side:** your correction was right and it closed the question. The
model's crawl is *geometrically straight* — per-angle bend 0.00° median on its own 12-point
midline once turns and their straightening are excluded. So everything the measurement reports
for it (~5°) is artefact, known exactly rather than estimated. Your synthetic medians of
4.64–5.19° and mine of 4.97° agree from two unrelated pipelines, which is the control working.

Real is 7.6–8.2°. The excess over the model is **2.4–3.0°, a ratio of 1.43–1.61**.

Raising the model's weathervane cannot produce that: at the slider maximum it buys ×1.05, and
widening the bend's extent does not help either. The model's true per-angle bend never exceeds
~1° in any configuration, which is well under the ~5° floor — so the measured quantity is
floor-saturated and insensitive. That is why the three cuts below matter before anything is
implemented.

---

## A. Signed rotation during the cast, on real turns — **highest priority**

This is the most valuable measurement available right now, and it is not about crawling at all.

The model's central defect is that it rotates the **wrong way** at turn onset. Signing each
turn's rotation against that turn's own final direction (`castrecoil.js`, 600 s × 3 seeds):

| | cast | after cast | net | casts positive |
|---|---|---|---|---|
| model, defaults | **−2.6°** | +52.4° | 49.9° | **5%** |

95% of the model's turns recoil backwards while the head sweeps. Real larvae are believed to do
the opposite, but **we have never measured it on real turns**, and the entire case for the next
piece of modelling work rests on it.

**What to compute.** For each detected turn, using stage 12's existing boundaries:

- `dpsi_total_deg` — signed heading change over the whole turn, on the tail→sp1 axis.
- `dpsi_cast_deg` — signed heading change from turn onset to the cast end, **multiplied by
  `sign(dpsi_total)`** so positive means *toward* the final turn direction.
- `dpsi_after_deg` — the same for cast end to turn end.
- `abs_dpsi_cast_deg` — the unsigned version, for comparison (see the trap below).
- Fraction of turns with `dpsi_cast_deg > 0`.

Report per genotype and pooled, with n. Use the sp1 bend peak as the cast end, as stage 12
already does. Run it on the synthetic fixtures too — the model's answer through your pipeline
is the calibration, and it should come out near −2.6° / ~5% positive.

**The trap, which has already cost us a published-in-the-docs error.** Do not average absolute
values and read the result as a contribution. A rotation that recoils has a large magnitude and
reads as progress. On the model the cast is −2.6° signed but +4.3° unsigned, and the unsigned
figure was written into our documentation as "20% of the turn happens during the sweep" for
weeks. Report both columns so the gap is visible.

**Why it matters.** If real casts are strongly positive, that number is the direct quantitative
target for an applied-yaw-moment mechanism — it says how much reorientation the moment has to
deliver, and when. If real casts are near zero too, our diagnosis is wrong and the modelling
plan changes completely.

---

## B. Is the crawl-bend residual posture, or spine-fit noise?

The 2.4–3.0° excess may not be biological. FIM-Track's spine fitting adds error that the
synthetic fixtures do not model, and all of it lands on the real side. Nothing measured so far
separates the two, and the evidence is inconsistent: w1118 shows shorter larvae bending more
(r = −0.77), amiGA-amRNAi shows nothing (r = −0.13), and a floor effect should not be
genotype-specific.

**The discriminator is temporal.** A real posture is held across frames; spine-fit and pixel
noise are close to frame-independent. So:

- For each larva and **each tracked angle separately**, the autocorrelation of the bend time
  series over crawl frames, at lags 1–30 frames (0.1–3 s at 10 fps).
- Report lag-1, lag-5 and lag-10 values, and the lag at which it first falls below 0.2.
- **Use the signed bend**, not `|bend|`. Your notes say nothing directional is computed; this is
  just dropping the `abs` and keeping the sign of the cross product. Signed is far more
  discriminating — noise flips sign frame to frame, a held curve does not. Report unsigned as
  well if it is cheap.
- Run it on the real recordings, both synthetic fixtures, and the noise-floor rows. The
  synthetic and floor rows are the null: the model's crawl is genuinely straight, so whatever
  autocorrelation they show **is** the measurement's own.

**Critical: unsmoothed data only.** Savitzky–Golay with a 7-frame window imposes correlation out
to ~7 frames by construction and would manufacture exactly the signature being tested for. If
you report a smoothed version too, label it clearly and do not draw the conclusion from it.

**Reading it.** If the real autocorrelation decays as fast as the synthetic one, the residual is
measurement and there is nothing in the model to change. If it persists for seconds where the
synthetic decays in a frame or two, it is real posture and C becomes worth doing.

---

## C. Is real crawl curvature distributed along the body, or thoracic?

Only worth doing if B says the residual is real.

Stage 13 pooled all three tracked angles into one number. Split it: the same statistics per
angle index (0.29, 0.54, 0.79), for real recordings, synthetic fixtures **and the noise-floor
rows**.

The floor rows are not optional here. The tracked points are unevenly spaced — the gaps are
roughly 0.29, 0.25, 0.25 and 0.21 of the body — so shorter segments subtend larger pixel-induced
angles and **the noise floor is not flat across the three angles**. In the simulation data the
0.79 angle is consistently the highest for exactly that reason. The comparison has to be
real-minus-floor per angle, not raw per angle.

**Reading it.** If all three angles sit at a similar height above their own floor, real crawl
curvature is distributed along the body. If the 0.29 angle carries it, curvature is thoracic.
Those imply different mechanisms, and the model currently has only the thoracic kind — its
weathervane bends the anterior four boundaries and nothing else.

---

## What is not wanted

- No implementation, no tuning, nothing changed to make numbers agree.
- No verdict on whether the model is right. These are measurements; the comparison against
  known truth happens on the simulation side.
- A is independent of B and C. If time is short, do A and stop — it is worth more than the other
  two together, because it bears on the model's actual defect rather than on a sub-floor
  discrepancy in crawling.

As before: state every definition you had to choose, and flag anything this brief left
unspecified. Every mismatch between our two sides so far has come from an unstated definition —
most recently the 23–27°, which cost a day of work on the simulation side before you caught it.
