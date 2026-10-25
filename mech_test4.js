// Fourth harness: full behavioural loop in a bounded arena. Checks the larva
// explores instead of getting pinned to a wall, and reports turn statistics.
const N=11, NP=N+1, BODY=4.0, SEGLEN=BODY/N;
const D2R=Math.PI/180, R2D=180/Math.PI;

function run(opt) {
  const P=Object.assign({
    per:1.07, del:0.090, dur:0.600, amp:0.50, lift:0.90, mu:10, hl:0.85, ext:4,
    sr:0.70, migK:0.6, migrate:'travel',  // 'travel' | 'time'
    ca:45, cg:1.30, acc:0.50, rt:10, wv:8,
    WW:60, WH:30, T:900, seed:1,
  },opt);
  let seed=P.seed;
  const rnd=()=>{ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
  const expo=m=>-Math.log(1-rnd())*m;
  const wrapA=x=>{while(x>Math.PI)x-=2*Math.PI;while(x<-Math.PI)x+=2*Math.PI;return x;};

  const BW=[]; { let s=0;
    for(let i=0;i<P.ext;i++){const v=Math.exp(-Math.pow((i-1)/(P.ext*0.52),2));BW.push(v);s+=v;}
    for(let i=0;i<P.ext;i++)BW[i]/=s; }
  const CASTC=[0.05,0.10,0.30,0.60,0.85,0.95,1,1,1,1,1,1];

  let t=0,onset=new Array(N).fill(-1e9),queue=[],dir=1;
  let nextInit=0,waveEnd=0,nWaves=0,revLeft=0,wallCool=0,wallSince=-1;
  let state='run',runEnd=expo(P.rt),castStart=0,castDir=1,castAmp=0,nCast=0,decided=false;
  let bend=0,bendPos=0,straightening=false,wvPh=0,psi=0;
  let world=[]; for(let j=0;j<NP;j++) world.push([P.WW/2+(N/2-j)*SEGLEN,P.WH/2]);
  let pend=null,psiCastStart=0,nTurns=0,sumTurn=0,pathLen=0,timeAtWall=0,maxPinned=0,pinStart=-1;
  let strideSum=0,strideN=0,lastWaveC=null;

  const contr=i=>{const u=(t-onset[i])/P.dur;return (u<0||u>1)?0:0.5*(1-Math.cos(2*Math.PI*u));};
  function profile(){
    const p=new Array(N).fill(0); let tot=0;
    for(let i=1;i<N;i++){ const x=i-1-bendPos;
      if(x<-1||x>BW.length) continue;
      const k=Math.floor(x),f=x-k;
      const a=(k>=0&&k<BW.length)?BW[k]:0, b=(k+1>=0&&k+1<BW.length)?BW[k+1]:0;
      p[i]=a+(b-a)*f; tot+=p[i]; }
    if(tot>1e-6) for(let i=1;i<N;i++) p[i]/=tot;
    return p;
  }
  function localShape(){
    const p=profile(); const pts=new Array(NP); let ang=0,X=0,Y=0; pts[N]=[0,0];
    for(let i=N-1;i>=0;i--){ if(i<N-1) ang+=bend*p[i+1];
      const len=SEGLEN*(1-P.amp*contr(i));
      X+=Math.cos(ang)*len; Y+=Math.sin(ang)*len; pts[i]=[X,Y]; }
    return pts;
  }
  function weights(){
    const w=new Array(NP), casting=(state==='cast');
    for(let j=0;j<NP;j++){
      const c=Math.max(j>0?contr(j-1):0,j<N?contr(j):0);
      let v=1-P.lift*c;
      if(casting) v*=(1-P.hl*(1-CASTC[j]));
      w[j]=Math.max(0.02,v); }
    return w;
  }
  function procrustes(loc,w){
    let sw=0,cqx=0,cqy=0,crx=0,cry=0;
    for(let j=0;j<NP;j++){sw+=w[j];cqx+=w[j]*world[j][0];cqy+=w[j]*world[j][1];
      crx+=w[j]*loc[j][0];cry+=w[j]*loc[j][1];}
    cqx/=sw;cqy/=sw;crx/=sw;cry/=sw;
    let a=0,b=0;
    for(let j=0;j<NP;j++){const rx=loc[j][0]-crx,ry=loc[j][1]-cry;
      const qx=world[j][0]-cqx,qy=world[j][1]-cqy;
      a+=w[j]*(rx*qx+ry*qy);b+=w[j]*(rx*qy-ry*qx);}
    const th=Math.atan2(b,a),c=Math.cos(th),s=Math.sin(th),out=new Array(NP);
    for(let j=0;j<NP;j++){const dx=loc[j][0]-crx,dy=loc[j][1]-cry;
      out[j]=[cqx+c*dx-s*dy,cqy+s*dx+c*dy];}
    return out;
  }
  const heading=()=>Math.atan2(world[3][1]-world[N][1],world[3][0]-world[N][0]);
  const headDir=()=>Math.atan2(world[0][1]-world[2][1],world[0][0]-world[2][0]);
  const centroid=()=>{let x=0,y=0;for(let j=0;j<NP;j++){x+=world[j][0];y+=world[j][1];}return[x/NP,y/NP];};
  function nearWall(){ const m=0.30; let best=m,n=null,d;
    for(let j=0;j<NP;j++){
      d=world[j][0];      if(d<best){best=d;n=[1,0];}
      d=P.WW-world[j][0]; if(d<best){best=d;n=[-1,0];}
      d=world[j][1];      if(d<best){best=d;n=[0,1];}
      d=P.WH-world[j][1]; if(d<best){best=d;n=[0,-1];} }
    return n; }
  function intoWall(){ const m=0.5; let best=m,n=null,d; const p=world[0];
    d=p[0];      if(d<best){best=d;n=[1,0];}
    d=P.WW-p[0]; if(d<best){best=d;n=[-1,0];}
    d=p[1];      if(d<best){best=d;n=[0,1];}
    d=P.WH-p[1]; if(d<best){best=d;n=[0,-1];}
    if(!n) return null;
    const h=headDir();
    return (Math.cos(h)*n[0]+Math.sin(h)*n[1] < -0.15)?n:null; }
  function awayDir(){ const w=nearWall(); if(!w) return rnd()<0.5?1:-1;
    return (Math.cos(psi)*w[1]-Math.sin(psi)*w[0])>=0?1:-1; }
  function fire(i,time){ onset[i]=time; waveEnd=Math.max(waveEnd,time+P.dur);
    const nxt=i-dir; if(nxt<0||nxt>=N) return; queue.push([nxt,time+P.del]); }
  function enterCast(d){ if(state==='cast')return;
    state='cast';castStart=t;castDir=d;nCast=0;decided=false;castAmp=P.ca*D2R;
    queue.length=0;psiCastStart=psi; }
  function acceptSweep(){ state='run';dir=1;nCast=0;decided=false;
    straightening=true;bendPos=0;nextInit=t+0.1;waveEnd=0;runEnd=t+expo(P.rt);
    if(nearWall()) wallCool=t+5;
    pend={psi0:psiCastStart,due:t+20}; }

  const dt=0.002;
  while(t<P.T){
    for(let q=queue.length-1;q>=0;q--)
      if(t>=queue[q][1]){fire(queue[q][0],queue[q][1]);queue.splice(q,1);}
    const crawling=(state==='run'||state==='back');
    if(crawling&&t>=nextInit&&t>=waveEnd){
      dir=(state==='back')?-1:1;
      fire(dir===1?N-1:0,t); nWaves++; lastWaveC=centroid();
      nextInit=t+P.per*(state==='back'?1.35:1);
      if(state==='back'){revLeft--;if(revLeft<=0){state='run';enterCast(awayDir());}}
    }
    if(state==='run'&&straightening){
      if(P.migrate==='time'){ bendPos+=dt*P.sr*3.5; bend+=(0-bend)*Math.min(1,dt*P.sr*0.35);
        if(bendPos>N-1||Math.abs(bend)<0.5*D2R){straightening=false;bendPos=0;bend=0;} }
    } else if(state==='run'){
      bendPos=0; wvPh+=dt*0.9;
      const tgt=P.wv*D2R*Math.sin(wvPh);
      bend+=(tgt-bend)*Math.min(1,dt*P.sr);
    } else if(state==='back'){
      bend+=(0-bend)*Math.min(1,dt*P.sr*1.5);
    } else if(state==='cast'){
      bendPos=0;straightening=false;
      /* a new cast does abort the previous turn */
      const u=(t-castStart)*0.6;
      bend=castDir*castAmp*0.5*(1-Math.cos(2*Math.PI*Math.min(u,1)));
      if(!decided&&u>=0.5){
        decided=true;nCast++;
        const w=nearWall(); let ok=true;
        if(w){const pr=psi+bend; ok=(Math.cos(pr)*w[0]+Math.sin(pr)*w[1])>0.3;}
        if(ok&&(rnd()<P.acc||nCast>=5)) acceptSweep();
      }
      if(state==='cast'&&u>=1){
        castDir*=-1;castAmp=Math.min(castAmp*P.cg,145*D2R);castStart=t;decided=false;
        if(nCast>=4&&nearWall()) castDir=awayDir();
        if(nCast>=8&&nearWall()){state='back';dir=-1;revLeft=2;nextInit=t;waveEnd=0;}
      }
    }
    const c0=centroid();
    const loc=localShape(),w=weights();
    let out=procrustes(loc,w);
    const u2=[Math.cos(psi),Math.sin(psi)],w2=w.slice(); let moved=false;
    for(let j=0;j<NP;j++){const dx=out[j][0]-world[j][0],dy=out[j][1]-world[j][1];
      if(dx*u2[0]+dy*u2[1]<0){w2[j]*=P.mu;moved=true;}}
    if(moved) out=procrustes(loc,w2);
    world=out;
    if(straightening&&P.migrate==='travel'&&state!=='cast'){
      const c1=centroid(), d=Math.hypot(c1[0]-c0[0],c1[1]-c0[1]);
      bendPos+=P.migK*d/SEGLEN;
      if(bendPos>N-1+BW.length){straightening=false;bendPos=0;bend=0;}
    }
    const m=0.22; let sx=0,sy=0;
    for(let k=0;k<NP;k++){
      if(world[k][0]<m) sx=Math.max(sx,m-world[k][0]);
      if(world[k][0]>P.WW-m) sx=Math.min(sx,(P.WW-m)-world[k][0]);
      if(world[k][1]<m) sy=Math.max(sy,m-world[k][1]);
      if(world[k][1]>P.WH-m) sy=Math.min(sy,(P.WH-m)-world[k][1]); }
    if(sx||sy){ for(let k=0;k<NP;k++){world[k][0]+=sx;world[k][1]+=sy;}
      if(state==='run'&&t>wallCool&&intoWall()){ wallCool=t+2;
        state='back';dir=-1;revLeft=2;nextInit=t;waveEnd=0; } }
    if(nearWall()){ if(wallSince<0) wallSince=t;
      else if(t-wallSince>30&&state!=='back'){ state='back';dir=-1;revLeft=4;
        nextInit=t;waveEnd=0;wallSince=t;wallCool=t+6; } } else wallSince=-1;
    psi=heading();
    if(pend&&(!straightening||t>=pend.due)){ const d=wrapA(psi-pend.psi0)*R2D;
      sumTurn+=Math.abs(d); nTurns++; pend=null; }
    if(state==='run'&&t>runEnd) enterCast(rnd()<0.5?1:-1);
    const c1=centroid();
    pathLen+=Math.hypot(c1[0]-c0[0],c1[1]-c0[1]);
    if(nearWall()){ timeAtWall+=dt; if(pinStart<0) pinStart=t;
      maxPinned=Math.max(maxPinned,t-pinStart); } else pinStart=-1;
    if(lastWaveC&&nWaves>strideN+1){ strideSum+=Math.hypot(c1[0]-lastWaveC[0],c1[1]-lastWaveC[1]); }
    t+=dt;
  }
  return { turns:nTurns, meanTurn:nTurns?sumTurn/nTurns:0, path:pathLen,
    speed:pathLen/P.T, wallFrac:timeAtWall/P.T, maxPinned,
    turnsPerMin:nTurns/(P.T/60), waves:nWaves, strideMM:pathLen/nWaves };
}

function show(label,o){
  const r=run(o);
  console.log(`  ${label.padEnd(26)} turns/min ${r.turnsPerMin.toFixed(2)}  mean|turn| ${r.meanTurn.toFixed(0).padStart(3)}°  ` +
    `speed ${r.speed.toFixed(2)} mm/s  stride ${r.strideMM.toFixed(2)} mm  atWall ${(100*r.wallFrac).toFixed(0)}%  maxPinned ${r.maxPinned.toFixed(0)}s`);
}
console.log('=== arena size sweep: migK 0.6, cast 55deg, mean run 22.6 s, 1800 s ===');
for(const [W,H] of [[60,30],[100,50],[140,70]]){
  const rs=[1,7,99].map(sd=>run({migrate:'travel',migK:0.6,ca:55,amp:0.50,dur:0.600,
    rt:22.6,per:0.76,WW:W,WH:H,T:1800,seed:sd}));
  const avg=f=>rs.reduce((a,r)=>a+f(r),0)/rs.length;
  console.log(`  arena ${W}x${H} mm -> turns/min ${avg(r=>r.turnsPerMin).toFixed(2)}  `+
    `mean|turn| ${avg(r=>r.meanTurn).toFixed(0)}deg  speed ${avg(r=>r.speed).toFixed(2)} mm/s  `+
    `stride ${avg(r=>r.strideMM).toFixed(2)} mm  atWall ${(100*avg(r=>r.wallFrac)).toFixed(0)}%  `+
    `maxPinned ${avg(r=>r.maxPinned).toFixed(0)}s  path ${avg(r=>r.path).toFixed(0)} mm`);
}
console.log('\n  targets: turns/min 1.7-2.8, stride 0.52-0.70 mm, crawl speed 0.84 mm/s (rover/agar)');
