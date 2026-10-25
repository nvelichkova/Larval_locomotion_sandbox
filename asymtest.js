// asymtest.js — can a weighted rigid fit convert grip asymmetry into rotation?
//
//   node asymtest.js
//
// The sweep says adding width and bilateral grip asymmetry leaves the rotation
// profile unchanged. Before concluding that from a noisy behavioural
// measurement, test the claim where it actually lives: in the solver.
//
// The placement step takes the body's new local shape and finds the rigid
// transform that best fits it, in a weighted least-squares sense, onto where
// the contacts currently are. The question is whether making the inside row of
// denticles grip harder than the outside row changes the ROTATION that fit
// returns, or only the translation.
//
// This builds a bent body, advances the bend by one step the way a turn does,
// and reads the fitted rotation angle as the asymmetry gain is raised. No
// simulation, no seeds - just the algebra the model runs every frame.

const N = 11, NP = 12, SEGLEN = 4 / 11, D2R = Math.PI / 180;

/* --- copied verbatim from the page, so this tests the real solver --- */
function rigidFit(src, dst, w) {
  let sw = 0, cqx = 0, cqy = 0, crx = 0, cry = 0, j; const n = src.length;
  for (j = 0; j < n; j++) {
    sw += w[j];
    cqx += w[j] * dst[j][0]; cqy += w[j] * dst[j][1];
    crx += w[j] * src[j][0]; cry += w[j] * src[j][1];
  }
  cqx /= sw; cqy /= sw; crx /= sw; cry /= sw;
  let a = 0, b = 0;
  for (j = 0; j < n; j++) {
    const rx = src[j][0] - crx, ry = src[j][1] - cry;
    const qx = dst[j][0] - cqx, qy = dst[j][1] - cqy;
    a += w[j] * (rx * qx + ry * qy); b += w[j] * (rx * qy - ry * qx);
  }
  return { th: Math.atan2(b, a), tx: cqx - crx, ty: cqy - cry };
}
function normalAt(pts, j) {
  const pa = pts[Math.max(0, j - 1)], pb = pts[Math.min(N, j + 1)];
  const ux = pb[0] - pa[0], uy = pb[1] - pa[1], ul = Math.hypot(ux, uy) || 1;
  return [-uy / ul, ux / ul];
}
function contactRows(pts, rsp) {
  const out = new Array(2 * NP);
  for (let j = 0; j < NP; j++) {
    const n = normalAt(pts, j);
    const r = rsp * (0.2105 + 0.7895 * Math.sin(Math.PI * (j + 0.5) / NP));
    out[j] = [pts[j][0] + n[0] * r, pts[j][1] + n[1] * r];
    out[NP + j] = [pts[j][0] - n[0] * r, pts[j][1] - n[1] * r];
  }
  return out;
}

/* a body with a bend of amplitude `amp` centred on boundary `pos` */
const BW = [0.15, 0.35, 0.35, 0.15];
function bodyAt(pos, amp) {
  const bends = new Array(N).fill(0);
  let tot = 0; const raw = new Array(N).fill(0);
  for (let b = 1; b < N; b++) {
    const x = b - pos;
    const k = Math.floor(x), f = x - k;
    const lo = (k >= 0 && k < BW.length) ? BW[k] : 0;
    const hi = (k + 1 >= 0 && k + 1 < BW.length) ? BW[k + 1] : 0;
    raw[b] = lo + (hi - lo) * f; tot += raw[b];
  }
  if (tot > 1e-6) for (let b = 1; b < N; b++) bends[b] = amp * raw[b] / tot;
  const pts = new Array(NP); let ang = 0, X = 0, Y = 0;
  pts[N] = [0, 0];
  for (let i = N - 1; i >= 0; i--) {
    if (i < N - 1) ang += bends[i + 1];
    X += Math.cos(ang) * SEGLEN; Y += Math.sin(ang) * SEGLEN;
    pts[i] = [X, Y];
  }
  return { pts, bends };
}

const WHICH = process.argv[2] === 'lat' ? 'lat' : 'th';

function main() {
  const amp = 55 * D2R;              // a full commanded sweep
  const pos = 2.0, step = 0.25;      // bend migrates a quarter boundary
  console.log('\n' + (WHICH === 'th'
    ? 'Fitted ROTATION (deg) for one placement step, bend '
    : 'Fitted LATERAL SHIFT (micrometres) for one placement step, bend ') + pos +
              ' -> ' + (pos + step) + ' boundaries, amplitude 55 deg\n');
  console.log('  Weights: a uniformly planted body, then the inside row of');
  console.log('  denticles weighted up by (1+a) and the outside by (1-a),');
  console.log('  where a = asym * local bend. a is capped at 0.95, so asym 2');
  console.log('  already means a 39:1 grip ratio across the bent segments.\n');

  for (const rsp of [0, 0.08, 0.15, 0.22, 0.30, 0.40]) {
    const out = [];
    for (const asym of [0, 0.5, 1, 2, 5]) {
      const A = bodyAt(pos, amp), B = bodyAt(pos + step, amp);
      const ref = (amp) / 4;                        // P.ca*D2R / P.ext
      const wL = [], wR = [];
      for (let j = 0; j < NP; j++) {
        const k = (j <= 0) ? A.bends[1] : (j >= N) ? A.bends[N - 1] : A.bends[j];
        let kn = k / ref; kn = kn > 1 ? 1 : kn < -1 ? -1 : kn;
        let a = asym * kn;
        if (a > 0.95) a = 0.95; else if (a < -0.95) a = -0.95;
        wL.push(1 * (1 + a)); wR.push(1 * (1 - a));
      }
      let F;
      if (rsp <= 0) {
        const wm = wL.map((v, j) => 0.5 * (v + wR[j]));
        F = rigidFit(B.pts, A.pts, wm);
      } else {
        F = rigidFit(contactRows(B.pts, rsp), contactRows(A.pts, rsp),
                     wL.concat(wR));
      }
      /* lateral offset of the placement, perpendicular to the body axis at the
         tail - this is where asymmetric weighting actually goes */
      const ax = A.pts[3][0] - A.pts[11][0], ay = A.pts[3][1] - A.pts[11][1];
      const al = Math.hypot(ax, ay) || 1;
      const lat = (F.tx * -ay + F.ty * ax) / al;
      out.push((WHICH === 'th' ? (F.th * 180 / Math.PI).toFixed(4)
                               : (1000 * lat).toFixed(3)).padStart(10));
    }
    console.log('  rsp ' + rsp.toFixed(2) + '   ' + out.join(''));
  }
  console.log('\n            asym:' + [0, 0.5, 1, 2, 5].map((v) =>
    String(v).padStart(10)).join(''));
  console.log('\n  Read down a column for the cost of width alone, and across a');
  console.log('  row for what asymmetry buys. Both are small, and both saturate');
  console.log('  by asym 1. Rotation moves under 1%; lateral shift about 6%.');
  console.log('');
  console.log('  The reason is geometric. The two rows are parallel offsets of');
  console.log('  the same midline, so their shape-displacement products differ');
  console.log('  only by a term of order (row spacing / body length) - about 5%');
  console.log('  at rsp 0.22 on a 4 mm body. Reweighting one row against the');
  console.log('  other therefore trades between two nearly equal contributions');
  console.log('  to the same least-squares fit. The effect does grow with rsp,');
  console.log('  as a second-order term should, but it cannot reach the');
  console.log('  order-unity change the measured profile needs.');
  console.log('');
  console.log('  A best-fit placement has residuals, not forces. Weighting a');
  console.log('  contact more makes the body move less there; it does not make');
  console.log('  the contact PUSH. Asymmetric friction generates a couple in a');
  console.log('  real animal because the contacts exert force, and there is no');
  console.log('  force in this formulation for it to act on.\n');
}

if (require.main === module) main();
