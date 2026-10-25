// Headless harness for the sandbox mechanics: measures emergent stride length
// and emergent turn angle, so the model can be checked against the literature
// (stride 0.70 mm; turns broad, tens of degrees) without a browser.

const N = 11, NP = N + 1, BODY = 4.0, SEGLEN = BODY / N;
const D2R = Math.PI / 180, R2D = 180 / Math.PI;

function makeSim(opt) {
  const P = Object.assign({
    per: 1.07, del: 0.090, dur: 0.350, amp: 0.45,
    lift: 0.90, mu: 10, hl: 0.85, ext: 4, sr: 0.70,
    releaseMode: 'sym',        // 'sym' = magnitude, 'swing' = shortening phase only
  }, opt);

  const BW = [];
  { let s = 0;
    for (let i = 0; i < P.ext; i++) { const v = Math.exp(-Math.pow((i - 1) / (P.ext * 0.52), 2)); BW.push(v); s += v; }
    for (let i = 0; i < P.ext; i++) BW[i] /= s; }

  const CASTC = [0.05,0.10,0.30,0.60,0.85,0.95,1,1,1,1,1,1];

  let t = 0, onset = new Array(N).fill(-1e9), queue = [], dir = 1;
  let nextInit = 0, waveEnd = 0, nWaves = 0;
  let bend = 0, bendPos = 0, casting = false, straightening = false;
  let world = [];
  for (let j = 0; j < NP; j++) world.push([20 + (N / 2 - j) * SEGLEN, 10]);

  const contr = i => { const u = (t - onset[i]) / P.dur; return (u < 0 || u > 1) ? 0 : 0.5 * (1 - Math.cos(2 * Math.PI * u)); };
  // rate sign: +1 while shortening (first half), -1 while re-lengthening
  const shortening = i => { const u = (t - onset[i]) / P.dur; return (u >= 0 && u <= 0.5); };

  function bendAt(i) {
    const x = i - 1 - bendPos;
    if (x < -1 || x > BW.length) return 0;
    const k = Math.floor(x), f = x - k;
    const a = (k >= 0 && k < BW.length) ? BW[k] : 0;
    const b = (k + 1 >= 0 && k + 1 < BW.length) ? BW[k + 1] : 0;
    return a + (b - a) * f;
  }
  function localShape() {
    const bends = new Array(N).fill(0);
    for (let b = 1; b < N; b++) bends[b] = bend * bendAt(b);
    const pts = new Array(NP); let ang = 0, X = 0, Y = 0;
    pts[N] = [0, 0];
    for (let i = N - 1; i >= 0; i--) {
      if (i < N - 1) ang += bends[i + 1];
      const len = SEGLEN * (1 - P.amp * contr(i));
      X += Math.cos(ang) * len; Y += Math.sin(ang) * len;
      pts[i] = [X, Y];
    }
    return pts;
  }
  function weights() {
    const w = new Array(NP);
    for (let j = 0; j < NP; j++) {
      const ca = j > 0 ? contr(j - 1) : 0, cb = j < N ? contr(j) : 0;
      let c;
      if (P.releaseMode === 'swing') {
        // released only while the segment is actively shortening (swing phase)
        const sa = (j > 0 && shortening(j - 1)) ? ca : 0;
        const sb = (j < N && shortening(j)) ? cb : 0;
        c = Math.max(sa, sb);
      } else {
        c = Math.max(ca, cb);
      }
      let v = 1 - P.lift * c;
      if (casting) v *= (1 - P.hl * (1 - CASTC[j]));
      w[j] = Math.max(0.02, v);
    }
    return w;
  }
  function procrustes(loc, w) {
    let sw = 0, cqx = 0, cqy = 0, crx = 0, cry = 0;
    for (let j = 0; j < NP; j++) { sw += w[j];
      cqx += w[j]*world[j][0]; cqy += w[j]*world[j][1];
      crx += w[j]*loc[j][0];   cry += w[j]*loc[j][1]; }
    cqx/=sw; cqy/=sw; crx/=sw; cry/=sw;
    let a = 0, b = 0;
    for (let j = 0; j < NP; j++) {
      const rx = loc[j][0]-crx, ry = loc[j][1]-cry;
      const qx = world[j][0]-cqx, qy = world[j][1]-cqy;
      a += w[j]*(rx*qx + ry*qy); b += w[j]*(rx*qy - ry*qx);
    }
    const th = Math.atan2(b, a), c = Math.cos(th), s = Math.sin(th), out = new Array(NP);
    for (let j = 0; j < NP; j++) {
      const dx = loc[j][0]-crx, dy = loc[j][1]-cry;
      out[j] = [cqx + c*dx - s*dy, cqy + s*dx + c*dy];
    }
    return out;
  }
  const heading = () => Math.atan2(world[3][1]-world[N][1], world[3][0]-world[N][0]);
  const centroid = () => { let x=0,y=0; for (let j=0;j<NP;j++){x+=world[j][0];y+=world[j][1];} return [x/NP,y/NP]; };

  function fire(i, time) {
    onset[i] = time; waveEnd = Math.max(waveEnd, time + P.dur);
    const nxt = i - dir;
    if (nxt < 0 || nxt >= N) return;
    queue.push([nxt, time + P.del]);
  }

  function step(dt) {
    for (let q = queue.length - 1; q >= 0; q--)
      if (t >= queue[q][1]) { fire(queue[q][0], queue[q][1]); queue.splice(q, 1); }
    if (!casting && t >= nextInit && t >= waveEnd) {
      fire(dir === 1 ? N - 1 : 0, t); nWaves++; nextInit = t + P.per;
    }
    if (straightening) {
      bendPos += dt * P.sr * 3.5;
      bend += (0 - bend) * Math.min(1, dt * P.sr * 0.35);
      if (bendPos > N - 1 || Math.abs(bend) < 0.5 * D2R) { straightening = false; bendPos = 0; bend = 0; }
    }
    const psi = heading();
    const loc = localShape(), w = weights();
    let out = procrustes(loc, w);
    const u = [Math.cos(psi), Math.sin(psi)], w2 = w.slice();
    let moved = false;
    for (let j = 0; j < NP; j++) {
      const dx = out[j][0]-world[j][0], dy = out[j][1]-world[j][1];
      if (dx*u[0] + dy*u[1] < 0) { w2[j] *= P.mu; moved = true; }
    }
    if (moved) out = procrustes(loc, w2);
    world = out;
    t += dt;
  }

  return {
    get t(){return t;}, get nWaves(){return nWaves;},
    set casting(v){casting=v;}, set bend(v){bend=v;},
    get bend(){return bend;},
    startStraighten(){ straightening = true; bendPos = 0; },
    heading, centroid, step, P
  };
}

function measureStride(opt, waves = 12) {
  const s = makeSim(opt);
  const dt = 0.002;
  // settle
  while (s.nWaves < 3) s.step(dt);
  const c0 = s.centroid(), w0 = s.nWaves, t0 = s.t;
  while (s.nWaves < w0 + waves) s.step(dt);
  const c1 = s.centroid();
  const d = Math.hypot(c1[0]-c0[0], c1[1]-c0[1]);
  return { stride: d / waves, speed: d / (s.t - t0) };
}

function measureTurn(opt, castDeg = 60) {
  const s = makeSim(opt);
  const dt = 0.002;
  while (s.nWaves < 4) s.step(dt);
  const psi0 = s.heading();
  // head sweep: anterior released, bend ramps to peak
  s.casting = true;
  const T = 1 / 0.6;
  for (let k = 0; k < Math.round(T * 0.5 / dt); k++) {
    const u = k * dt / T;
    s.bend = castDeg * D2R * 0.5 * (1 - Math.cos(2 * Math.PI * u));
    s.step(dt);
  }
  const bendAtAccept = s.bend * R2D;
  // accept: resume crawling, migrate the bend posteriorly
  s.casting = false;
  s.startStraighten();
  const tEnd = s.t + 8;
  while (s.t < tEnd) s.step(dt);
  let d = (s.heading() - psi0) * R2D;
  while (d > 180) d -= 360; while (d < -180) d += 360;
  return { commanded: bendAtAccept, realised: d };
}

console.log('=== stride length per wave (target 0.70 mm; 0.52 mm from Lahiri) ===');
for (const mode of ['sym', 'swing']) {
  for (const amp of [0.30, 0.45, 0.60]) {
    const r = measureStride({ releaseMode: mode, amp });
    console.log(`  release=${mode.padEnd(5)} amp=${amp.toFixed(2)}  stride=${r.stride.toFixed(3)} mm  speed=${r.speed.toFixed(3)} mm/s`);
  }
}

console.log('\n=== emergent turn angle (commanded 60 deg sweep) ===');
for (const mode of ['sym', 'swing']) {
  for (const sr of [0.4, 0.7, 1.5]) {
    const r = measureTurn({ releaseMode: mode, sr });
    console.log(`  release=${mode.padEnd(5)} straighten=${sr}  bend at accept=${r.commanded.toFixed(1)}deg  realised turn=${r.realised.toFixed(1)}deg`);
  }
}

console.log('\n=== release depth sweep (swing mode, amp 0.45) ===');
for (const lift of [0.5, 0.7, 0.9, 0.98]) {
  const r = measureStride({ releaseMode: 'swing', lift });
  console.log(`  lift=${lift}  stride=${r.stride.toFixed(3)} mm`);
}
