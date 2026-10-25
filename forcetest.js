// forcetest.js — does anisotropic ground resistance convert grip asymmetry
//                 into rotation?
//
//   node forcetest.js
//
// asymtest.js showed that making the inside row of denticles grip 39x harder
// than the outside row moves the fitted rotation by under 1%. The explanation
// is sharper than "there are no forces in the model".
//
// Weighted Procrustes minimises  sum_j w_j |d_j|^2 . Setting the derivatives to
// zero gives  sum_j w_j d_j = 0  and  sum_j w_j (r_j x d_j) = 0 : a force and
// torque balance with ISOTROPIC linear springs of stiffness w_j. The model is
// already doing statics. What it is missing is that its springs pull equally in
// every direction, so a contact that grips harder simply resists everything
// more and cannot steer.
//
// Real denticles are hooks. They resist lateral and backward slip far more than
// forward slip. Splitting each contact's resistance into a longitudinal and a
// lateral stiffness,
//
//     E = sum_j [ kl_j (d_j . t_j)^2 + kn_j (d_j . n_j)^2 ],   A = kn/kl
//
// and minimising over the rigid motion (tx, ty, theta) gives the same 3x3
// solve. A = 1 is exactly weighted Procrustes, which this script checks against
// the real solver before reporting anything else.

const N = 11, NP = 12, SEGLEN = 4 / 11, D2R = Math.PI / 180;

/* ---- the page's own solver, for the A = 1 check ---- */
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
  return Math.atan2(b, a);
}

function normalAt(pts, j) {
  const pa = pts[Math.max(0, j - 1)], pb = pts[Math.min(N, j + 1)];
  const ux = pb[0] - pa[0], uy = pb[1] - pa[1], ul = Math.hypot(ux, uy) || 1;
  return [-uy / ul, ux / ul];
}
function tangentAt(pts, j) {
  const n = normalAt(pts, j); return [n[1], -n[0]];
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

const BW = [0.15, 0.35, 0.35, 0.15];
function bodyAt(pos, amp) {
  const bends = new Array(N).fill(0);
  let tot = 0; const raw = new Array(N).fill(0);
  for (let b = 1; b < N; b++) {
    const x = b - pos, k = Math.floor(x), f = x - k;
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

/* solve 3x3 by Gaussian elimination */
function solve3(M, v) {
  const A = M.map((r, i) => r.concat([v[i]]));
  for (let c = 0; c < 3; c++) {
    let p = c; for (let r = c + 1; r < 3; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    if (Math.abs(A[c][c]) < 1e-14) return [0, 0, 0];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 4; k++) A[r][k] -= f * A[c][k];
    }
  }
  return [A[0][3] / A[0][0], A[1][3] / A[1][1], A[2][3] / A[2][2]];
}

/* quasi-static force and torque balance with anisotropic contact resistance.
   src = where the contacts would be from shape change alone,
   dst = where they are currently planted.
   tHat/nHat are each contact's local axes. A = lateral / longitudinal. */
function forceSolve(src, dst, tHat, nHat, kl, A, iters, M) {
  M = M || 0;
  let tx = 0, ty = 0, th = 0;
  const cur = src.map((p) => [p[0], p[1]]);
  for (let it = 0; it < iters; it++) {
    const MM = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], v = [0, 0, 0];
    for (let j = 0; j < cur.length; j++) {
      const c = cur[j], e = [c[0] - dst[j][0], c[1] - dst[j][1]];
      const perp = [-c[1], c[0]];
      for (let a = 0; a < 2; a++) {
        const ax = a ? nHat[j] : tHat[j];
        const k = kl[j] * (a ? A : 1);
        // residual = (e + t + th*perp) . ax ; gradient rows are [ax.x, ax.y, perp.ax]
        const g = [ax[0], ax[1], perp[0] * ax[0] + perp[1] * ax[1]];
        const r0 = e[0] * ax[0] + e[1] * ax[1];
        for (let p = 0; p < 3; p++) {
          for (let q = 0; q < 3; q++) MM[p][q] += k * g[p] * g[q];
          v[p] -= k * g[p] * r0;
        }
      }
    }
    v[2] += M;            /* applied yaw moment from asymmetric contraction */
    const [dx, dy, dth] = solve3(MM, v);
    tx += dx; ty += dy; th += dth;
    const c0 = Math.cos(dth), s0 = Math.sin(dth);
    for (let j = 0; j < cur.length; j++) {
      const x = cur[j][0], y = cur[j][1];
      cur[j] = [c0 * x - s0 * y + dx, s0 * x + c0 * y + dy];
    }
  }
  return th;
}

function main() {
  const amp = 55 * D2R, pos = 2.0, step = 0.25, rsp = 0.22;
  const A0 = bodyAt(pos, amp), B0 = bodyAt(pos + step, amp);
  const dst = contactRows(A0.pts, rsp), src = contactRows(B0.pts, rsp);
  const tH = [], nH = [];
  for (let s = 0; s < 2; s++) for (let j = 0; j < NP; j++) { tH.push(tangentAt(A0.pts, j)); nH.push(normalAt(A0.pts, j)); }

  const weights = (asym) => {
    const ref = amp / 4, wL = [], wR = [];
    for (let j = 0; j < NP; j++) {
      const k = (j <= 0) ? A0.bends[1] : (j >= N) ? A0.bends[N - 1] : A0.bends[j];
      let kn = k / ref; kn = kn > 1 ? 1 : kn < -1 ? -1 : kn;
      let a = asym * kn; if (a > 0.95) a = 0.95; else if (a < -0.95) a = -0.95;
      wL.push(1 + a); wR.push(1 - a);
    }
    return wL.concat(wR);
  };

  console.log('\nAnisotropic contact resistance: does grip asymmetry now steer?\n');
  console.log('  One placement step, bend ' + pos + ' -> ' + (pos + step) +
              ' boundaries, 55 deg, rsp ' + rsp + '.');
  console.log('  A is lateral resistance / longitudinal resistance at each contact.');
  console.log('  A = 1 is isotropic, which IS weighted Procrustes.\n');

  // validation: A = 1 must reproduce the page's own solver
  const w1 = weights(0);
  const ref1 = rigidFit(src, dst, w1) * 180 / Math.PI;
  const got1 = forceSolve(src, dst, tH, nH, w1, 1, 12) * 180 / Math.PI;
  console.log('  check  A=1 vs the page solver:  ' + ref1.toFixed(5) + '  vs  ' +
              got1.toFixed(5) + '   diff ' + Math.abs(ref1 - got1).toExponential(1));
  if (Math.abs(ref1 - got1) > 2e-3) console.log('  *** MISMATCH - the solver below is not comparable ***');

  const ASYM = [0, 0.5, 1, 2];
  console.log('\n  fitted rotation, degrees per placement step\n');
  console.log('      A  ' + ASYM.map((a) => ('asym ' + a).padStart(11)).join('') + '     ratio');
  console.log('  ' + '-'.repeat(62));
  for (const A of [1, 2, 3, 5, 10, 30]) {
    const vals = ASYM.map((a) => forceSolve(src, dst, tH, nH, weights(a), A, 12) * 180 / Math.PI);
    const ratio = Math.abs(vals[0]) > 1e-9 ? vals[3] / vals[0] : NaN;
    console.log('  ' + String(A).padStart(5) + '  ' +
      vals.map((v) => v.toFixed(4).padStart(11)).join('') + '   ' + ratio.toFixed(3).padStart(7));
  }
  console.log('\n  The ratio column is rotation at asym 2 over rotation at asym 0:');
  console.log('  how much the bilateral asymmetry buys at that anisotropy.\n');

  console.log('  Now an APPLIED YAW MOMENT in the same balance - the moment an');
  console.log('  asymmetric contraction exerts about the body, resisted by the');
  console.log('  ground rather than by a best fit. Rotation per step, degrees:\n');
  console.log('      A  ' + [0, 0.5, 1, 2, 4].map((m) =>
    ('M ' + m).padStart(11)).join(''));
  console.log('  ' + '-'.repeat(62));
  for (const A of [1, 3, 10]) {
    const vals = [0, 0.5, 1, 2, 4].map((m) =>
      forceSolve(src, dst, tH, nH, weights(0), A, 12, m) * 180 / Math.PI);
    console.log('  ' + String(A).padStart(5) + '  ' +
      vals.map((v) => v.toFixed(4).padStart(11)).join(''));
  }
  console.log('\n  Rotational stiffness here is about 54 weight*mm^2, so a moment of');
  console.log('  order 1-4 is what buys a degree or two per step. The response is');
  console.log('  LINEAR in M and has no ceiling - unlike width (1%), bilateral');
  console.log('  asymmetry (4% even at 30:1 anisotropy) and migration speed, which');
  console.log('  all saturate or destroy the turn. A moment also flips the SIGN of');
  console.log('  the cast-phase rotation, which is the measured defect: 95% of the');
  console.log('  model\'s turns currently recoil backwards during the cast.\n');
}

if (require.main === module) main();
