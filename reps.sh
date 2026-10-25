#!/bin/bash
# usage: reps.sh "<CLICK>" "<OVERRIDE>" <secs> <n>
CL="$1"; OV="$2"; T="${3:-900}"; N="${4:-8}"
B=0; TM=0; PA=0; IP=0
for ((s=1;s<=N;s++)); do
  O="seed=$s"; [ -n "$OV" ] && O="$O,$OV"
  R=$(APP=app.html TOTAL=$T CLICK="$CL" OVERRIDE="$O" node -e "
const m=require('./app_headless.js'); const d=m.doc;
const g=i=>d.getElementById(i).textContent.replace('%','').replace('—','0');
console.log(g('s_bd'),g('s_tm'),g('s_pl'),g('s_ip'));" 2>/dev/null | tail -1)
  set -- $R; B=$(echo "$B+$1"|bc -l); TM=$(echo "$TM+$2"|bc -l); PA=$(echo "$PA+$3"|bc -l); IP=$(echo "$IP+$4"|bc -l)
done
printf "  border %5.1f%%   turns/min %4.2f   path %5.0f mm   in-patch %4.1f%%\n" \
  $(echo "$B/$N"|bc -l) $(echo "$TM/$N"|bc -l) $(echo "$PA/$N"|bc -l) $(echo "$IP/$N"|bc -l)
