// Re-run of the comparative-memory contrast with seeds that work.
// Published geometry: 250 mm arena, four patches r 18 mm, alternating foods.
// Analyse with:  node comp_sweep.js /tmp/mem
module.exports = {
  duration: 7200, seeds: 12, tracks: false,
  base: { aw: 250, ah: 125, pr: 18 },   // height was implicit (W/2) before the
                                        // arena was decoupled from the canvas
  buttons: ['s_yeast', 'm_p4', 'mix'],
  conditions: {
    memory:    {},
    no_memory: { params: { ocmp: 0 } },     // comparison term off: the control
  },
};
