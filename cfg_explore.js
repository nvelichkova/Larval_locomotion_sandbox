// What can the model actually produce? Latin-hypercube sample over the
// mechanics and behaviour parameters, one seed each (the point is coverage of
// parameter space, not precision per point), on a uniform agar arena.
//
// NOT sampled, deliberately: stride period (per), mean run (rt) and pause
// fraction (pf). The model recomputes all three from the genotype and local
// substrate every frame (README §5), so sampling them does nothing. An
// earlier version of this file varied `per` and `rt`; `rt` came out constant
// across all 220 runs, and the final `per` correlated r = 0.975 with the
// intersegmental delay, because the period is floored at the wave duration
// that the delay sets. The sensitivity table built on that sample reported
// period and delay as separate influences when they were one effect counted
// twice. Bend relax and cast growth take their places here.
module.exports = {
  tracks: false,
  base: { aw: 100, ah: 50 },
  sample: {
    n: 220, seeds: 1, duration: 600, name: 'explore', seed: 20261020,
    vary: {
      del:  [30, 180],      // intersegmental delay, ms (this sets the period)
      dur:  [150, 700],     // contraction duration, ms
      amp:  [0.20, 0.70],   // contraction amplitude
      lift: [0.40, 1.00],   // swing release
      mu:   [1, 30],        // friction anisotropy
      hl:   [0.30, 1.00],   // anterior release during a cast
      migK: [0.20, 1.60],   // bend migration rate
      ca:   [20, 110],      // first cast amplitude, deg
      cg:   [1.0, 2.0],     // cast growth between sweeps
      sr:   [0.10, 3.00],   // bend relaxation rate
      acc:  [0.15, 1.00],   // sweep acceptance probability
      wv:   [0, 20],        // weathervane, deg
    },
  },
};
