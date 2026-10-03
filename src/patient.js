export class Patient {
  constructor(id,time,random,point) {
    this.id=`P${String(id).padStart(3,'0')}`; this.arrivalTime=time;this.ageBand=['Child','Adult','Older adult'][Math.floor(random()*3)];
    const n=random();this.priority=n<.08?'Critical':n<.3?'Urgent':'Routine';
    this.stage=0;this.ticket=null;this.pulse=null;this.results=null;this.resultsReadyAt=null;this.resultsWaitStart=null;this.doctorRoom=null;this.doctorVisits=0;this.isPlayer=false;this.serviceRoom=null;this.calledAt=null;this.instruction='';
    this.state='ARRIVING';this.currentRoom='entrance';this.destination=null;this.path=[];this.x=point.x;this.y=point.y;
    this.waitingTime=0;this.queueSince=null;this.serviceStartTime=null;this.dischargeTime=null;this.phase='moving';this.history=[];
  }
}
