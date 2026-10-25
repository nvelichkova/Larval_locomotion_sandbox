// wavecheck.js — three things that look wrong on screen
//
//   node wavecheck.js [duration_s] [seeds]
//
// 1. Do successive waves overlap? The next wave is gated on
//        waveEnd = t + (N-1)*del/1000
//    which is when the relay FRONT reaches the far end - it does not include
//    the time the last segment then spends contracting (`dur`). So the
//    anterior may still be contracting when the next wave fires at the tail.
//
// 2. What is the head's substrate contact doing at that moment? Real larvae
//    plant their mouth hooks to anchor the anterior as a forward wave starts.
//    Here the head's weight is 1 - lift*contraction, so when T1 contracts the
//    head RELEASES - the opposite of an anchor.
//
// 3. After a turn, how long does the posterior stay bent?

const { trackTurns, analyse } = require('./bendtrack');

const R2D = 180 / Math.PI;
const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

function bendsOf(sp) {
  const out = [];
  for (let k = 1; k < sp.length - 1; k++) {
    const ux = sp[k][0]-sp[k-1][0], uy = sp[k][1]-sp[k-1][1];
    const vx = sp[k+1][0]-sp[k][0], vy = sp[k+1][1]-sp[k][1];
    out.push(Math.abs(Math.atan2(ux*vy - uy*vx, ux*vx + uy*vy)) * R2D);
  }
  return out;
}

function main() {
  const duration = +(process.argv[2] || 600);
  const seeds = +(process.argv[3] || 3);

  /* ---- 1 and 2: wave timing, straight from the parameters ---- */
  const del = 90, dur = 600, per = 0.90, N = 11, lift = 0.90;
  const front = (N - 1) * del / 1000;
  const lastDone = front + dur / 1000;
  console.log('\n1. Wave timing, from the shipped defaults\n');
  console.log('   intersegmental delay      ' + del + ' ms');
  console.log('   per-segment contraction   ' + dur + ' ms');
  console.log('   stride period             ' + (per * 1000) + ' ms');
  console.log('   relay front reaches T1    ' + (front * 1000).toFixed(0) + ' ms after the tail fires');
  console.log('   T1 finishes contracting   ' + (lastDone * 1000).toFixed(0) + ' ms');
  console.log('   next wave fires at        ' + (Math.max(per, front) * 1000).toFixed(0) + ' ms' +
              '   (gate: max(stride period, relay front))');
  console.log('\n   => waves OVERLAP by ' + ((lastDone - Math.max(per, front)) * 1000).toFixed(0) +
              ' ms, which is ' +
              (100 * (lastDone - Math.max(per, front)) / lastDone).toFixed(0) +
              '% of a wave. The anterior is still contracting when the');
  console.log('      next wave starts at the tail, exactly as it looks on screen.');
  console.log('      `waveEnd` tracks the relay FRONT and ignores `dur`; adding it');
  console.log('      would give ' + (lastDone * 1000).toFixed(0) + ' ms and no overlap.');

  console.log('\n2. Head contact through one wave (weight 1 = planted, 0 = released)\n');
  console.log('   T1 fires at ' + (front * 1000).toFixed(0) + ' ms and contracts for ' + dur + ' ms.');
  console.log('   The head weight is 1 - lift*contr(T1), lift = ' + lift + ':\n');
  console.log('      ms after tail fires   T1 contraction   head weight');
  for (const ms of [900, 1000, 1100, 1200, 1350, 1500]) {
    const u = (ms / 1000 - front) / (dur / 1000);
    const c = (u < 0 || u > 1) ? 0 : 0.5 * (1 - Math.cos(2 * Math.PI * u));
    console.log('      ' + String(ms).padStart(11) + '   ' + c.toFixed(2).padStart(13) +
                '   ' + (1 - lift * c).toFixed(2).padStart(11));
  }
  console.log('\n   => the head is at its MOST RELEASED in the middle of its own');
  console.log('      contraction, which is when a real larva plants its mouth hooks.');

  /* ---- 3: how long the posterior stays bent after a turn ---- */
  const tailAt = [], antAt = [];
  for (let sd = 1; sd <= seeds; sd++) {
    const r = trackTurns({ duration, seed: sd });
    if (!r.ok) { console.log('\n3. FAILED ' + r.error); return; }
    for (const tn of analyse(r.samples)) {
      const f = tn.frames.filter((x) => x.spine);
      if (f.length < 8) continue;
      // bend at the last frame of the turn, anterior vs posterior boundaries
      const b = bendsOf(f[f.length - 1].spine);
      antAt.push(mean(b.slice(0, 3)));          // T1/T2 .. T3/A1
      tailAt.push(mean(b.slice(7)));            // A5/A6 .. A7/Tail
    }
  }
  console.log('\n3. Bend remaining at the end of a turn (mean |bend| per boundary)\n');
  console.log('   anterior  T1/T2-T3/A1   ' + mean(antAt).toFixed(2) + ' deg  (median ' +
              med(antAt).toFixed(2) + ')');
  console.log('   posterior A5/A6-A7/Tl   ' + mean(tailAt).toFixed(2) + ' deg  (median ' +
              med(tailAt).toFixed(2) + ')');
  console.log('   ratio posterior/anterior ' + (mean(tailAt) / mean(antAt)).toFixed(2) +
              '   over ' + antAt.length + ' turns');
  console.log('\n   A turn ends when the bend profile has run off the tail, so whatever');
  console.log('   is left sits at the posterior. Above 1 means the tail is still bent');
  console.log('   when the model calls the turn finished.\n');
}

if (require.main === module) main();
