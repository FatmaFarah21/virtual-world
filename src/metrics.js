export function metrics(sim) {
  const active=sim.patients.filter(p=>p.state!=='DISCHARGED'), done=sim.patients.filter(p=>p.state==='DISCHARGED');
  const waits=sim.patients.map(p=>p.waitingTime+(p.queueSince===null?0:sim.time-p.queueSince)+(p.phase==='results'?sim.time-p.resultsWaitStart:0));
  return {arrivals:sim.patients.length,active:active.length,waiting:active.filter(p=>['queued','results'].includes(p.phase)).length,serving:active.filter(p=>p.phase==='service').length,discharged:done.length,avgWait:waits.reduce((a,b)=>a+b,0)/(waits.length||1),maxWait:Math.max(0,...waits),los:done.reduce((a,p)=>a+p.dischargeTime-p.arrivalTime,0)/(done.length||1),throughput:done.length/(sim.time/3600||1)};
}
