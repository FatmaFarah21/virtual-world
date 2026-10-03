import {createRooms,createGraph} from './hospital.js';
import {findPath} from './pathfinding.js';
import {Patient} from './patient.js';
import {enqueue,processQueue,startService} from './queueSystem.js';
import {JOURNEY,stageRoom,actionPoint,isWalkable} from './journey.js';

export class Simulation {
  constructor(seed=42,mode='operations'){
    this.rooms=createRooms();this.graph=createGraph(this.rooms);this.patients=[];this.events=[];this.calls=[];
    this.time=0;this.running=false;this.speed=mode==='player'?1:5;this.arrivalInterval=45;this.nextArrival=mode==='player'?Infinity:0;
    this.seed=seed;this.remainder=0;this.mode=mode;this.ticketCount=0;this.labResultDelay=180;
    if(mode==='player')this.spawn(true);
  }
  random(){this.seed=(1664525*this.seed+1013904223)>>>0;return this.seed/4294967296;}
  room(id){return this.rooms.find(r=>r.id===id);}
  get player(){return this.patients.find(p=>p.isPlayer);}
  log(type,p,room){this.events.unshift({timestamp:this.time,type,entityId:p.ticket||p.id,location:room.name});this.events=this.events.slice(0,300);p.history.push({time:this.time,type,room:room.name});}
  spawn(isPlayer=false){
    if(this.mode==='player'&&this.player)return this.player;
    const p=new Patient(this.patients.length+1,this.time,()=>this.random(),this.graph.entrance);
    p.isPlayer=isPlayer||this.mode==='player';if(p.isPlayer){p.ageBand='Adult';p.priority='Routine';}this.patients.push(p);this.log('Arrived',p,this.room('entrance'));this.send(p,0);return p;
  }
  doctor(p){
    if(!p.doctorRoom)p.doctorRoom=['consult1','consult2'].map(id=>this.room(id)).sort((a,b)=>(a.queue.length+a.occupants.length+a.called.length)/a.capacity-(b.queue.length+b.occupants.length+b.called.length)/b.capacity)[0].id;
    return this.room(p.doctorRoom);
  }
  send(p,stage){
    p.stage=stage;p.state=JOURNEY[stage].state;p.serviceRoom=null;
    const id=stageRoom(p);p.destination=id;p.path=[];
    if(p.isPlayer){p.phase='exploring';p.instruction=stage===0?'Walk to the ticket kiosk and press E.':`Go to ${this.room(id).name} and press E.`;}
    else this.route(p,id);
  }
  route(p,id){
    let start=p.currentRoom;
    if(p.isPlayer)start=Object.keys(this.graph).sort((a,b)=>Math.hypot(this.graph[a].x-p.x,this.graph[a].y-p.y)-Math.hypot(this.graph[b].x-p.x,this.graph[b].y-p.y))[0];
    p.destination=id;p.path=findPath(this.graph,start,id).map(n=>({x:n.x,y:n.y}));
    if(p.stage===0)p.path.push(actionPoint(this.room('entrance'),0));p.phase='moving';
  }
  request(p,stage){
    p.stage=stage;p.state=({1:'WAITING_RECEPTION',3:'WAITING_TRIAGE',5:'WAITING_DOCTOR',8:'WAITING_REVIEW'})[stage]||JOURNEY[stage].state;
    const r=[5,8].includes(stage)?this.doctor(p):this.room(stageRoom(p));
    p.destination=null;p.path=[];p.serviceRoom=r.id;enqueue(r,p,this.time);
    p.instruction=`Wait for ticket ${p.ticket||'issuance'} to be called for ${r.name}.`;
    this.log(stage===0?'Ticket requested':'Joined service queue',p,r);
  }
  call(p,r){
    if(p.stage!==0){this.calls.unshift({ticket:p.ticket,room:r.name,roomId:r.id,stage:JOURNEY[p.stage].name,timestamp:this.time});this.calls=this.calls.slice(0,8);this.log('Ticket called',p,r);}
    p.destination=r.id;p.instruction=`${p.ticket||p.id}, please go to ${r.name}. Press E at the doorway.`;
    if(p.stage===0||([6,9].includes(p.stage)&&p.currentRoom===r.id))this.begin(p,r);
    else if(!p.isPlayer)this.route(p,r.id);
  }
  begin(p,r){
    p.currentRoom=r.id;p.destination=null;p.path=[];p.state=JOURNEY[p.stage].state;startService(r,p,this.time);
    p.instruction=`${JOURNEY[p.stage].name} in progress.`;this.log('Service started',p,r);
  }
  arrive(p){
    const r=this.room(p.destination);p.currentRoom=r.id;p.destination=null;p.path=[];this.log('Entered',p,r);
    if(r.called.includes(p)){this.begin(p,r);return;}
    if(p.stage===10){p.state='DISCHARGED';p.phase='done';p.dischargeTime=this.time;p.instruction='Your hospital journey is complete.';this.log('Discharged',p,r);return;}
    if(p.stage===2){this.request(p,3);return;}
    if(p.stage===4){this.request(p,5);return;}
    this.request(p,p.stage);
  }
  complete(p,r){
    r.occupants.splice(r.occupants.indexOf(p),1);r.served++;this.log('Service completed',p,r);
    if(p.stage===0){p.ticket=`T${String(++this.ticketCount).padStart(3,'0')}`;this.log('Ticket issued',p,r);this.request(p,1);}
    else if(p.stage===1)this.send(p,2);
    else if(p.stage===3){p.pulse={bpm:65+Math.floor(this.random()*36),recordedAt:this.time};this.log(`Synthetic pulse recorded: ${p.pulse.bpm} bpm`,p,r);this.send(p,4);}
    else if(p.stage===5){p.doctorVisits++;this.send(p,6);}
    else if(p.stage===6){p.stage=7;p.state='LAB_RESULTS';p.phase='results';p.resultsReadyAt=this.time+this.labResultDelay;p.resultsWaitStart=this.time;p.instruction='Stay in the laboratory waiting area while your results are processed.';this.log('Lab results processing',p,r);}
    else if(p.stage===8){p.doctorVisits++;p.results.reviewedAt=this.time;this.log('Lab results reviewed',p,r);this.send(p,9);}
    else if(p.stage===9)this.send(p,10);
  }
  positionWaiting(){
    const waiting=this.room('waiting');
    this.patients.filter(p=>(p.phase==='queued'||(p.phase==='called'&&!p.isPlayer))&&p.currentRoom==='waiting').forEach((p,i)=>{p.x=waiting.x+26+(i%6)*30;p.y=waiting.y+66+Math.floor(i/6)*20;});
    for(const r of this.rooms){
      r.occupants.forEach((p,i)=>{p.x=r.id==='entrance'?r.x+r.width/2:r.x+45+(i%5)*26;p.y=r.id==='entrance'?r.y+85:r.y+130+Math.floor(i/5)*18;});
      r.queue.filter(p=>p.currentRoom===r.id).forEach((p,i)=>{p.x=r.x+24+(i%7)*21;p.y=r.y+r.height-38-Math.floor(i/7)*18;});
    }
    this.patients.filter(p=>p.phase==='results').forEach((p,i)=>{p.x=this.room('lab').x+28+(i%6)*25;p.y=this.room('lab').y+67+Math.floor(i/6)*19;});
  }
  step(){
    this.time++;
    while(this.mode!=='player'&&this.nextArrival<=this.time){this.spawn();this.nextArrival+=this.arrivalInterval;}
    for(const p of this.patients)if(p.phase==='results'&&p.resultsReadyAt<=this.time){
      p.waitingTime+=this.time-p.resultsWaitStart;p.results={id:`LAB-${p.ticket}`,status:'Ready for doctor review',readyAt:this.time,reviewedAt:null};
      this.log('Lab results ready',p,this.room('lab'));this.request(p,8);
    }
    for(const r of this.rooms.filter(r=>r.capacity)){
      r.busySeconds+=r.occupants.length;r.availableSeconds+=Math.max(r.capacity,r.occupants.length);
      for(const p of [...r.occupants])if(p.serviceEnd<=this.time)this.complete(p,r);
      processQueue(r,this.time,(p)=>this.call(p,r));
    }
    for(const p of this.patients)if(p.phase==='moving'){
      let distance=20;
      while(p.path.length&&distance>0){const n=p.path[0],dx=n.x-p.x,dy=n.y-p.y,d=Math.hypot(dx,dy);if(d<=distance){p.x=n.x;p.y=n.y;p.path.shift();distance-=d;}else{p.x+=dx/d*distance;p.y+=dy/d*distance;distance=0;}}
      if(!p.path.length)this.arrive(p);
    }
    this.positionWaiting();
  }
  advance(seconds){if(!this.running)return;this.remainder+=seconds*this.speed;while(this.remainder>=1){this.remainder--;this.step();}}
  playerTarget(){const p=this.player;if(!p||['queued','service','results','done'].includes(p.phase))return null;const r=this.room(p.destination||stageRoom(p));return {room:r,...actionPoint(r,p.stage)};}
  interact(){
    const p=this.player;if(!p)return 'Choose single player mode first.';if(!this.running)return 'Resume the world to interact.';
    const target=this.playerTarget();if(!target)return p.instruction;
    if(Math.hypot(p.x-target.x,p.y-target.y)>32)return `Move closer to ${p.stage===0?'the ticket kiosk':target.room.name}, or choose Walk to next stop.`;
    p.destination=target.room.id;this.arrive(p);return p.instruction;
  }
  walkPlayer(){const p=this.player,target=this.playerTarget();if(!p||!target||!this.running)return false;this.route(p,target.room.id);return true;}
  movePlayer(dx,dy,canWalk=()=>true){
    const p=this.player;if(!p||!this.running||!['exploring','called','moving','done'].includes(p.phase))return false;
    if(p.phase==='moving'){p.path=[];p.phase=p.serviceRoom?'called':'exploring';}
    const parts=Math.max(1,Math.ceil(Math.hypot(dx,dy)/3));let moved=false;
    for(let i=0;i<parts;i++){
      const x=p.x+dx/parts;if(isWalkable(this.rooms,x,p.y)&&canWalk(x,p.y)){p.x=x;moved=true;}
      const y=p.y+dy/parts;if(isWalkable(this.rooms,p.x,y)&&canWalk(p.x,y)){p.y=y;moved=true;}
    }
    const r=this.rooms.find(r=>p.x>=r.x&&p.x<=r.x+r.width&&p.y>=r.y&&p.y<=r.y+r.height);if(r)p.currentRoom=r.id;return moved;
  }
  skipPlayerWait(){
    const p=this.player;if(!p||!this.running||!['queued','service','results'].includes(p.phase))return false;
    const phase=p.phase,stage=p.stage;for(let i=0;i<7200&&p.phase===phase&&p.stage===stage;i++)this.step();this.remainder=0;return true;
  }
}
