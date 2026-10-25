# Stage 13 — crawl bend: is 23–27° per boundary real?

A brief for the Larval Explorer instance. Self-contained: assumes no knowledge of the
simulation side.

## Why

Tracking of our FIM-Track recordings reports a mean per-boundary bend of **23–27° during
crawls**. That is a lot of curvature for an animal going straight, and it matters twice over:

- It sets the floor a turn-detection threshold has to clear. If crawls really sit at 25°, a
  bend-amplitude threshold tuned below that fires constantly.
- It is a direct test of the biomechanical model, whose crawling larva bends far less. If the
  number is real the model is wrong; if it is a measurement artefact the model is fine and the
  analysis needs a correction.

The simulation side has already measured how much of such a number the **measurement chain
alone** manufactures. Those reference values are at the bottom. Roughly 11° of 23–27° is
explained by sampling and pixels, leaving ~12–16° unexplained — so this is worth settling
rather than assuming either way.

**Do not try to decide whether the number is real.** Produce the measurement with its
definitions stated explicitly, on both real and synthetic data. The comparison happens on the
simulation side, where the ground truth is known.

## The task

Add a stage that computes **per-angle bend during crawling**, and report its distribution.

### 1. Define the crawl set

Frames that are *not* part of a turn, from larvae that are being tracked cleanly.

- Exclude frames inside a detected turn.
- Exclude a **margin either side** of each turn — the approach and the recovery are genuinely
  bent and will inflate the mean. Produce the measurement at margins of **0, 1 and 2 seconds**
  so the sensitivity is visible.
- Exclude `is_coiled`.
- **Do not exclude on `is_well_oriented`.** We established earlier that it is largely a posture
  flag (1–3% of frames are straight, 72–83% are past 90°), so excluding on it removes real
  behaviour. Report the measurement both with and without it so the effect is quantified, but
  the headline uses all frames.

### 2. Compute the angles — at two samplings

This is the single biggest lever on the answer, so do both.

- **Native**: the interior turning angles of the tracked spine polyline as it comes. With 5
  points that is 3 angles. State how many points the recordings actually carry.
- **Resampled to 11 boundaries**: interpolate the spine to 12 equally spaced points *by arc
  length* and take the 10 interior angles.

An interior angle at point *k* is the absolute angle between segment (k−1→k) and (k→k+1).
Report in degrees.

The two differ by roughly a factor of 3, because the same total turning is shared among fewer
angles. A number quoted without its sampling is meaningless — this is why.

### 3. Smoothing on and off

Run the whole thing twice: with the pipeline's usual spatial/temporal smoothing, and with none.
Whole-pixel coordinates manufacture apparent bend, and smoothing removes most of it — on
synthetic data the floor drops from ~4.5° to ~1.2° per angle. State the smoothing used
(filter, window, order) in the output.

### 4. Report the distribution, not the mean

**This is the decisive part.** Per condition, give: n frames, n larvae, mean, **median**, IQR,
90th percentile, and a histogram (2° bins, 0–60°).

The reason: the model's crawl bend has mean 2.87° but **median 0.00°** — it is straight most of
the time with intermittent weathervane peaks. If the real median is also far below the real
mean, real larvae are intermittently bent like the model and the mean is being dragged by
something (most likely turn shoulders, which is what the margin sweep tests). If the real
median is ~25° too, that is **persistent** curvature, a qualitatively different animal, and no
amount of parameter tuning reproduces it. These two outcomes lead to completely different work,
so the median is the number that matters.

Also report **per-larva** medians, not just pooled. Crawl speeds in this dataset span
0.045–1.42 mm/s with some larvae barely moving, and a near-stationary larva contributes many
frames of whatever posture it is stuck in.

### 5. Run it on the synthetic fixtures too

`slow_bend.csv` and `fast_bend.csv` are already in the test fixtures. They are model output
degraded exactly as the camera and tracker degrade a real larva (5 spine points, 10 fps, whole
pixels at 0.117 mm/px), and the true answer is known.

Run the identical code path over them and report the same statistics. This is the calibration:
it says what *this pipeline* reports when the answer is known, so the real number can be read
against it. Without this the real number cannot be interpreted.

### 6. Also report body length

Per larva, the median tracked spine length in mm. The pixel noise floor depends on it — a 3.0 mm
larva has a 4.91° floor, a 4.5 mm larva 3.43°, because the same pixel error subtends a bigger
angle on a shorter body.

## Output

One tidy CSV, `crawl_bend.csv`, one row per (dataset × larva × sampling × smoothing × margin):

```
dataset, larva, genotype, age, n_frames, n_frames_total,
sampling,            # "native5" | "resampled11"
n_angles,            # 3 or 10
smoothing,           # "none" | "<filter>_w<window>_o<order>"
turn_margin_s,       # 0 | 1 | 2
well_oriented_filter,# "all" | "excluded"
bend_mean_deg, bend_median_deg, bend_q25_deg, bend_q75_deg, bend_p90_deg,
spine_length_median_mm, crawl_speed_median_mm_s
```

Plus `crawl_bend_hist.csv` with the pooled histogram per condition
(`dataset, sampling, smoothing, turn_margin_s, bin_lo_deg, count`).

Plus a short `CRAWL_BEND_NOTES.md` stating, in plain sentences: how many spine points the
recordings carry, the exact smoothing, how the crawl set was defined, and anything you had to
decide that this brief did not specify. **Decisions you had to invent are the most important
part of that file** — every mismatch we have hit so far has come from an unstated definition.

## Reference values from the simulation side

The same quantity, measured on the model during crawls, 600 s × 3 seeds. The model's commanded
weathervane is 8°.

| sampling | angles | mean | median |
|---|---|---|---|
| 12 points (the model's own midline — ground truth) | 10 | 2.87° | 0.00° |
| 7 points | 5 | 5.09° | 0.01° |
| 5 points at tracker arc fractions | 3 | 7.76° | 0.20° |
| 5 points + whole pixels | 3 | **10.86°** | **6.12°** |

Sampling alone accounts for 2.70×; pixel quantisation adds 1.40× on top.

Noise floor — a **perfectly straight** body, 5 points, whole pixels at 0.117 mm/px, so every
degree is manufactured by the measurement:

| body length | mean | median | 90th pct | with smoothing |
|---|---|---|---|---|
| 3.00 mm | 4.91° | 4.76° | 10.30° | 1.36° |
| 3.35 mm | 4.48° | 4.40° | 9.46° | 1.24° |
| 4.00 mm | 3.75° | 3.41° | 8.13° | 1.03° |
| 4.50 mm | 3.43° | 3.18° | 6.91° | 0.93° |

The script that produced both tables is `crawlbend.js` in the synthetic folder, if you want to
check the definitions against it:
`node crawlbend.js 600 3` and `node crawlbend.js 1 1 floor`.

## Traps

These have each already cost us a wrong result in this project.

1. **Absolute values of a signed quantity.** Bend magnitude is fine to take absolute. But if you
   compute anything directional, do not average absolute values and call it a contribution — a
   quantity that recoils reads as progress. This exact error put a wrong 20% in the model's
   documentation for weeks.
2. **Per-turn correlations on stereotyped data.** If you correlate anything per-turn against the
   synthetic fixtures, remember the model's turns are nearly identical to each other, so a low
   r measures noise, not information loss.
3. **Definition sensitivity.** The headline turn statistic moved from 0.031 to 0.232 on the same
   turns from a head-angle definition change alone. Assume any number here is that fragile until
   shown otherwise, which is what the margin / smoothing / sampling sweeps are for.
4. **Do not tune anything to make the numbers agree.** The value of this measurement is entirely
   in it being independent.

## What success looks like

Not a verdict. Three artefacts: `crawl_bend.csv`, `crawl_bend_hist.csv`, `CRAWL_BEND_NOTES.md`,
each covering real recordings and both synthetic fixtures under the same code path. Send those
back and the comparison against known truth happens on the simulation side.
