// Dose-response on the comparative-memory gain.
//
// The binary memory/no-memory contrast was null, but it was also underpowered
// and measured on residence, which contains the walk out of the patch. This
// varies the gain over five levels and measures the decision latency, so a
// mechanism that works has to show a monotone trend and a broken one cannot
// hide behind noise.
//
// Analyse with:  node ocmp_report.js /tmp/ocmp
module.exports = {
  duration: 7200, seeds: 30, tracks: false, parallel: 2,
  base: { aw: 250, ah: 125, pr: 18 },   // explicit height: these runs predate
                                        // the arena being decoupled from the canvas
  buttons: ['s_yeast', 'm_p4', 'mix'],
  conditions: {
    g0:   { params: { ocmp: 0 } },
    g1_2: { params: { ocmp: 1.2 } },   // the app default
    g3:   { params: { ocmp: 3 } },
    g6:   { params: { ocmp: 6 } },
  },
};
