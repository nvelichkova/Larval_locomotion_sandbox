// wallseq.js — after a wall hit, what does the larva actually do?
//
//   node wallseq.js [duration_s] [seeds]
//
// Reading the code, a reversal always ends the same way:
//
//     if(state==='back'){ revLeft--; if(revLeft<=0){ state='run'; enterCast(awayDir()); } }
//
// `revLeft` is set to 2 everywhere it is set, and the exit is unconditional, so
// every reversal is followed by a head cast and none resumes straight. This
// checks that against what the simulation does, and measures the sequence a
// wall contact actually produces: how many backward waves, how long, and how
// far the heading has moved by the time forward crawling resumes.

const { trackTurns } = require('./bendtrack');

const R2D = 180 / Math.PI;
const wrap = (a) => { while (a > Math.PI) a -= 2*Math.PI; while (a < -Math.PI) a += 2*Math.PI; return a; };
const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const med = (a) => { const s = a.slice().sort((x,y)=>x-y); return s.length ? s[Math.floor(s.length/2)] : NaN; };

function main() {
  const duration = +(process.argv[2] || 900);
  const seeds = +(process.argv[3] || 4);
  const W = 100, H = 100;

  let nRev = 0, nCastAfter = 0, nStraightAfter = 0;
  const revDur = [], revWaves = [], netTurn = [], outAng = [];

  for (let sd = 1; sd <= seeds; sd++) {
    const r = trackTurns({ duration, seed: sd, params: { aw: W, ah: H } });
    if (!r.ok) { console.log('FAILED ' + r.error); return; }
    const S = r.samples.filter((s) => s.spine);
    let i = 0;
    while (i < S.length - 1) {
      // a reversal begins
      if (S[i].state !== 'back' && S[i+1].state === 'back') {
        const start = i + 1;
        const psiIn = Math.atan2(S[start].spine[3][1]-S[start].spine[11][1],
                                 S[start].spine[3][0]-S[start].spine[11][0]);
        const w0 = S[start].waves;
        let j = start;
        while (j < S.length - 1 && S[j].state === 'back') j++;
        nRev++;
        revDur.push(S[j].t - S[start].t);
        revWaves.push(S[j].waves - w0);
        // what state does it land in?
        if (S[j].state === 'cast') nCastAfter++; else nStraightAfter++;
        // heading once forward crawling resumes
        let k = j;
        while (k < S.length - 1 && S[k].state !== 'run') k++;
        const psiOut = Math.atan2(S[k].spine[3][1]-S[k].spine[11][1],
                                  S[k].spine[3][0]-S[k].spine[11][0]);
        netTurn.push(Math.abs(wrap(psiOut - psiIn)) * R2D);
        // and relative to the wall it hit
        const cx = S[start].cx, cy = S[start].cy;
        const d = [cx, W - cx, cy, H - cy];
        const nrm = [[1,0],[-1,0],[0,1],[0,-1]];
        let bi = 0; for (let q = 1; q < 4; q++) if (d[q] < d[bi]) bi = q;
        const dot = Math.cos(psiOut)*nrm[bi][0] + Math.sin(psiOut)*nrm[bi][1];
        outAng.push(Math.acos(Math.max(-1, Math.min(1, dot))) * R2D);
        i = k;
      } else i++;
    }
  }

  console.log(`\nAfter a reversal - ${duration} s x ${seeds} seeds, ${W}x${H} mm\n`);
  if (!nRev) { console.log('  no reversals\n'); return; }
  console.log('  reversals                 ' + nRev);
  console.log('  followed by a head cast   ' + nCastAfter + '  (' +
              (100*nCastAfter/nRev).toFixed(1) + '%)');
  console.log('  resumed straight          ' + nStraightAfter + '  (' +
              (100*nStraightAfter/nRev).toFixed(1) + '%)');
  console.log('\n  backward waves per reversal   median ' + med(revWaves).toFixed(1) +
              '   range ' + Math.min(...revWaves) + '-' + Math.max(...revWaves));
  console.log('  reversal duration             median ' + med(revDur).toFixed(2) + ' s');
  console.log('  |heading change| by the time forward crawling resumes');
  console.log('      median ' + med(netTurn).toFixed(1) + ' deg,  mean ' +
              mean(netTurn).toFixed(1) + ' deg');
  const sm = netTurn.filter((v) => v < 20).length;
  console.log('      under 20 deg (effectively straight on): ' +
              (100*sm/netTurn.length).toFixed(1) + '%');
  console.log('\n  departure angle from the wall it hit (0 = back along the inward normal)');
  console.log('      median ' + med(outAng).toFixed(0) + ' deg\n');
}

if (require.main === module) main();
