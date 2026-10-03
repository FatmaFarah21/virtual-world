const rank={Critical:0,Urgent:1,Routine:2};
export function enqueue(room,p,time){p.phase='queued';p.queueSince=time;room.queue.push(p);room.queue.sort((a,b)=>rank[a.priority]-rank[b.priority]||a.queueSince-b.queueSince);}
export function processQueue(room,time,onCall){
  while(room.occupants.length+room.called.length<room.capacity&&room.queue.length){const p=room.queue.shift();p.waitingTime+=time-p.queueSince;p.queueSince=null;p.phase='called';p.calledAt=time;room.called.push(p);onCall(p);}
}
export function startService(room,p,time){
  const i=room.called.indexOf(p);if(i<0)throw new Error('A service slot must be reserved before admission.');
  room.called.splice(i,1);room.occupants.push(p);p.phase='service';p.serviceStartTime=time;p.serviceEnd=time+(p.stage===8?Math.max(15,room.serviceTime/2):room.serviceTime);
}
