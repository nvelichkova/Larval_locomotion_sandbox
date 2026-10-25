// wallcheck.js — what does the model actually do at a wall?
//
//   node wallcheck.js [duration_s] [seeds]
//
// The collision response is a rigid push-in: every midline point is translated
// by the same amount so that none is closer than 0.22 mm to the wall. The body
// does not deform (limitation 7), so a head touch displaces the tail too, and
// nothing bends around the boundary.
//
// Real larvae at a dish edge deform against it and follow it. This measures
// what the model does instead:
//
//   heading vs wall   0 deg = crawling straight into it, 90 = along it.
//                     Edge following shows as a pile-up near 90.
//   bout length       how long one visit to the border lasts.
//   corner share      how much of the border time is spent in a corner,
//                     where two constraints act at once.
//   re-hit interval   time between successive head contacts within a bout -
//                     short intervals mean grinding rather than following.

const { trackTurns } = require('./bendtrack');

const R2D = 180 / Math.PI;
const MARGIN = 2.0;          // centroid within 2 mm, as the tracking analysis uses
const EXTRA = JSON.parse(process.argv[4] || '{}');                 // within this of a wall counts as at the border

const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

function main() {
  const duration = +(process.argv[2] || 900);
  const seeds = +(process.argv[3] || 3);
  const W = 100, H = 100;

  const ang = [], bouts = [], corner = [], hitGap = [], nearFrames = [], perSeed = [];
  const turnNear = [], turnAway = [], spdNear = [], spdAway = [];
  let nFrames = 0, nBorder = 0, nCorner = 0;

  for (let sd = 1; sd <= seeds; sd++) {
    const r = trackTurns({ duration, seed: sd,
      params: Object.assign({ aw: W, ah: H }, EXTRA) });
    if (!r.ok) { console.log('FAILED ' + r.error); return; }
    let boutStart = null, lastHit = null; const mine = []; let prev = null;
    for (const s of r.samples) {
      if (!s.spine) continue;
      nFrames++;
      /* Zone defined by the CENTROID, as the tracking analysis defines it. An
         earlier version used the head, which is not comparable: a head-
         proximity criterion admits a body POINTING at the wall from much
         further out than one lying along it, so it selects for perpendicular
         postures before any behaviour, and the geometric null - which
         randomises orientation about the centroid - does not share that
         selection. The two must use the same reference point. */
      let ccx = 0, ccy = 0;
      for (let q = 0; q < s.spine.length; q++) { ccx += s.spine[q][0]; ccy += s.spine[q][1]; }
      ccx /= s.spine.length; ccy /= s.spine.length;
      const d = [ccx, W - ccx, ccy, H - ccy];
      const nrm = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      let bi = 0; for (let i = 1; i < 4; i++) if (d[i] < d[bi]) bi = i;
      const atBorder = d[bi] < MARGIN;
      // in a corner when two different axes are both close
      const nearX = Math.min(d[0], d[1]) < MARGIN, nearY = Math.min(d[2], d[3]) < MARGIN;

      /* how fast is it turning, and moving, here versus in open arena? */
      const psiNow = Math.atan2(s.spine[3][1] - s.spine[11][1], s.spine[3][0] - s.spine[11][0]);
      if (prev && s.t - prev.t > 1e-6 && s.t - prev.t < 0.2) {
        let dp = psiNow - prev.psi;
        while (dp > Math.PI) dp -= 2*Math.PI; while (dp < -Math.PI) dp += 2*Math.PI;
        const rate = Math.abs(dp) * R2D / (s.t - prev.t);
        const sp = Math.hypot(s.cx - prev.cx, s.cy - prev.cy) / (s.t - prev.t);
        if (atBorder) { turnNear.push(rate); spdNear.push(sp); }
        else if (d[bi] > 5) { turnAway.push(rate); spdAway.push(sp); }
      }
      prev = { t: s.t, psi: psiNow, cx: s.cx, cy: s.cy };

      if (atBorder) {
        nBorder++;
        if (nearX && nearY) nCorner++;
        if (boutStart === null) boutStart = s.t;
        // heading of the body axis relative to the wall: 90 deg = along it
        const psi = Math.atan2(s.spine[3][1] - s.spine[11][1], s.spine[3][0] - s.spine[11][0]);
        const dot = Math.cos(psi) * nrm[bi][0] + Math.sin(psi) * nrm[bi][1];
        const av = 90 - Math.abs(Math.acos(Math.max(-1, Math.min(1, dot))) * R2D - 90);
        ang.push(av); mine.push(av);
        /* geometry this frame needs for the null: where the centroid is, how
           much body lies ahead of and behind it, and the wall normal */
        nearFrames.push({ cx: ccx, cy: ccy, nx: nrm[bi][0], ny: nrm[bi][1],
          ahead: Math.hypot(s.spine[0][0] - ccx, s.spine[0][1] - ccy),
          behind: Math.hypot(s.spine[11][0] - ccx, s.spine[11][1] - ccy) });
        if (Math.min(s.spine[0][0], W - s.spine[0][0], s.spine[0][1], H - s.spine[0][1]) < 0.30) {
          if (lastHit !== null && s.t - lastHit > 0.15) hitGap.push(s.t - lastHit);
          lastHit = s.t;
        }
      } else {
        if (boutStart !== null) { bouts.push(s.t - boutStart); boutStart = null; lastHit = null; }
      }
    }
    if (mine.length > 30)
      perSeed.push({ sd: sd, n: mine.length,
        hi: 100 * mine.filter((v) => v >= 75).length / mine.length });
  }

  /* Geometric null, matched to the model's own near-wall frames: the same
     centroid distances and body length, the body treated as straight, random
     orientations kept only where BOTH ends stay inside the arena. A body
     close to a wall cannot point at it without its head leaving, so the
     near-wall zone favours along-wall angles before any behaviour. This is
     the null the tracking side built; without it the zone overstates
     alignment. */
  const nullAng = [];
  let rs = 20260423;
  const rnd = () => (rs = (rs * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (const nf of nearFrames) {
    for (let tries = 0; tries < 60; tries++) {
      const th = rnd() * Math.PI * 2;
      const ax = Math.cos(th) * nf.ahead, ay = Math.sin(th) * nf.ahead;
      const bx = -Math.cos(th) * nf.behind, by = -Math.sin(th) * nf.behind;
      const hx = nf.cx + ax, hy = nf.cy + ay, tx = nf.cx + bx, ty = nf.cy + by;
      if (hx < 0 || hx > W || hy < 0 || hy > H || tx < 0 || tx > W || ty < 0 || ty > H) continue;
      const dot = Math.cos(th) * nf.nx + Math.sin(th) * nf.ny;
      nullAng.push(90 - Math.abs(Math.acos(Math.max(-1, Math.min(1, dot))) * R2D - 90));
      break;
    }
  }

  const bins = [0, 15, 30, 45, 60, 75, 90];
  console.log('  turning rate, near the wall vs away from it');
  console.log('    near  ' + (med(turnNear)*1).toFixed(2).padStart(6) + ' deg/s median   (' +
    turnNear.length + ' frames)');
  console.log('    away  ' + (med(turnAway)*1).toFixed(2).padStart(6) + ' deg/s median   (' +
    turnAway.length + ' frames)');
  console.log('    crawl speed  near ' + med(spdNear).toFixed(3) + '   away ' +
    med(spdAway).toFixed(3) + ' mm/s');
  console.log('');
  const hist = bins.slice(0, -1).map((lo, i) =>
    ang.filter((v) => v >= lo && v < bins[i + 1]).length / (ang.length || 1));

  console.log(`\nWall behaviour, ${W}x${H} mm, ${duration} s x ${seeds} seeds\n`);
  console.log(`  time at the border      ${(100 * nBorder / nFrames).toFixed(1)}%`);
  console.log(`  of that, in a corner    ${(100 * nCorner / (nBorder || 1)).toFixed(1)}%`);
  console.log(`  border bouts            ${bouts.length}, median ${med(bouts).toFixed(1)} s, ` +
              `mean ${mean(bouts).toFixed(1)} s, longest ${Math.max(0, ...bouts).toFixed(0)} s`);
  console.log(`  press-to-press interval median ${med(hitGap).toFixed(2)} s over ${hitGap.length} gaps`);
  console.log('\n  body axis vs the wall while at the border');
  console.log('  0 deg = driving straight in, 90 deg = crawling along it\n');
  bins.slice(0, -1).forEach((lo, i) => {
    const pct = 100 * hist[i];
    console.log('   ' + String(lo).padStart(3) + '-' + String(bins[i + 1]).padEnd(3) +
      ' ' + pct.toFixed(1).padStart(5) + '%  ' + '#'.repeat(Math.round(pct / 2)));
  });
  const nh = bins.slice(0, -1).map((lo, i) =>
    100 * nullAng.filter((v) => v >= lo && v < bins[i + 1]).length / (nullAng.length || 1));
  console.log('\n  geometric null (same distances, random orientations that fit inside)');
  bins.slice(0, -1).forEach((lo, i) => {
    console.log('   ' + String(lo).padStart(3) + '-' + String(bins[i + 1]).padEnd(3) +
      ' ' + nh[i].toFixed(1).padStart(5) + '%  ' + '.'.repeat(Math.round(nh[i] / 2)));
  });
  console.log('\n  75-90 bin:  model ' + (100 * hist[5]).toFixed(1) + '%   its own null ' +
    nh[5].toFixed(1) + '%');
  console.log('  tracking:   amiGA 48.2% (null 29.0%)   w1118 32.9% (null 26.6%)');
  console.log('\n  per seed, share of near-wall frames in the 75-90 bin');
  perSeed.forEach((p) => console.log('   seed ' + p.sd + '  ' + p.hi.toFixed(1).padStart(5) +
    '%  (' + p.n + ' frames)'));
  console.log('   tracking per larva: 0-69% (amiGA), 0-72% (w1118) - most at or below null\n');
}

if (require.main === module) main();
