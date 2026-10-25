# Boundary behaviour — what do larvae do at the edge of the plate?

A short brief. There is a real chance this comes back empty, and that is a useful outcome, so
please do not strain to find a signal.

## Why, and the caveat first

The simulation treats the arena edge as a **hard wall**: the body is pushed back out of it and a
behavioural response fires (reverse, cast away, pause, or nothing, depending on habituation).
Measured over 900 s × 3 seeds in a 100 × 100 mm arena, the model spends 16.5% of its time at the
border and, while there, its body axis points:

| body axis vs the wall | model |
|---|---|
| 0–15° (driving straight in) | 21.7% |
| 15–30° | 25.2% |
| 30–45° | 21.5% |
| 45–60° | 13.8% |
| 60–75° | 11.1% |
| **75–90° (crawling along it)** | **6.7%** |

Median border bout 2.3 s; the head re-presses every 0.55 s. That is a larva grinding into a wall
and bouncing off, not one following an edge, and it does not look like real behaviour.

**But our boundaries are not hard walls.** The FIM-Track plates have an agar edge, not a barrier,
so whatever larvae do there may be a different phenomenon entirely — they may crawl onto the rim,
or leave, or simply never reach it. If so, the right conclusion is that the model's hard wall is
modelling a condition these recordings do not contain, and the fix is a soft-boundary mode rather
than a tuned hard one. **A null here is worth as much as a positive**, so report what is there
rather than what would be useful.

## Step 0 — what is the boundary, and is it even in the data?

Before measuring anything about behaviour, characterise the arena **from the tracks themselves**.

- Pool every tracked point across a recording. Is the occupied region a **circle** or a
  **rectangle**? Fit both and say which fits better, with the radius or the dimensions in mm.
- Is there a sharp outer limit, or does occupancy taper away? A hard edge gives a step; a soft one
  gives a gradient.
- Do any tracks end at the limit (larvae leaving or being lost there), and what fraction?
- How many larvae ever come within one body length of it, and what fraction of total frames is
  spent there?

**If larvae essentially never reach the edge, stop here and say so.** That answers the question,
and steps 1–3 would be noise.

## Step 1 — occupancy against distance from the edge

Distance from each frame's **centroid** (or tail, state which) to the nearest boundary, in mm and
in body lengths. Report the distribution: a histogram in 1 mm bins out to 15 mm, plus the fraction
within 1, 2 and 5 mm.

Compare against the occupancy expected if larvae ignored the boundary entirely — for a circle of
radius R, the area within distance d of the edge is a known fraction, so an unbiased walker gives
a predictable baseline. **Edge accumulation is only interesting relative to that baseline**, since
a bounded random walk spends more time near its edge anyway.

## Step 2 — alignment while near the edge

For frames within 2 mm of the boundary: the angle between the **body axis (tail→sp1)** and the
**local boundary tangent**, folded to 0–90° where 0 means pointing straight at the edge and 90
means moving along it. Histogram in the same six bins as the model table above.

Also report it for frames 5–10 mm from the edge as an internal control — if the two histograms
are the same shape, there is no boundary effect and the near-edge pile-up is geometry, not
behaviour.

## Step 3 — bouts

A bout is a contiguous run of frames within 2 mm of the boundary. Report the count, median and
90th percentile duration in seconds, and the median distance crawled during a bout. The model's
median bout is 2.3 s; if real bouts are tens of seconds, the model's rapid bounce-off is the
defect.

If turns are detectable within bouts, the turn rate near the boundary against the turn rate away
from it would also be informative — but it is secondary, do not let it hold up the rest.

## What to send back

`boundary.csv` (per recording and per larva: the step 0 geometry, the step 1 and 2 histograms, the
step 3 bout statistics) and a short `BOUNDARY_NOTES.md` stating every definition you had to choose
— particularly how the boundary was located, which body point defines distance, and the 2 mm
threshold if you change it.

Run it on the two real recordings. The synthetic fixtures are **not** a useful control here: the
model's arena is a hard-walled square and its boundary behaviour is the thing under test, so
putting it through the same code would compare the model with itself. Skip them.

## The honest range of outcomes

1. **Larvae never reach the edge.** Then the model's wall behaviour is untestable against this
   data, and we look for a published dish assay instead, or leave the hard wall documented as
   unvalidated.
2. **They reach it and follow it.** Then we have a target histogram, and the model's 6.7% in the
   75–90° bin is the gap to close.
3. **They reach it and ignore it** — the near-edge alignment matching the interior control. Then
   the model's wall is too strong a constraint, not too weak, which would be the opposite of what
   it looks like and worth knowing.

All three are publishable statements about the data. None of them requires the answer to be
interesting.
