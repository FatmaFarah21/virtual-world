export const JOURNEY = [
  {name:'Take a ticket',room:'entrance',state:'TICKETING'},
  {name:'Reception',room:'reception',state:'REGISTERING'},
  {name:'Wait for triage',room:'waiting',state:'WAITING_TRIAGE'},
  {name:'Triage · record pulse',room:'triage',state:'TRIAGE'},
  {name:'Wait for the doctor',room:'waiting',state:'WAITING_DOCTOR'},
  {name:'Doctor consultation',room:'doctor',state:'CONSULTATION'},
  {name:'Laboratory sample',room:'lab',state:'LAB'},
  {name:'Wait for lab results',room:'lab',state:'LAB_RESULTS'},
  {name:'Return to the doctor',room:'doctor',state:'DOCTOR_REVIEW'},
  {name:'Pharmacy',room:'pharmacy',state:'PHARMACY'},
  {name:'Leave the hospital',room:'exit',state:'LEAVING'},
];
export function stageRoom(p){const room=JOURNEY[p.stage].room;return room==='doctor'?p.doctorRoom:room;}
export function actionPoint(room,stage){return stage===0?{x:room.x+room.width/2,y:room.y+85}:{x:room.x+room.width/2,y:room.y<300?room.y+room.height-22:room.y+24};}
export function isWalkable(rooms,x,y){
  if(x>=35&&x<=1065&&y>=300&&y<=380)return true;
  return rooms.some(r=>{
    if(x>=r.x+5&&x<=r.x+r.width-5&&y>=r.y+5&&y<=r.y+r.height-5)return true;
    return Math.abs(x-r.x-r.width/2)<=10&&(r.y<300?y>=r.y+r.height-30&&y<=310:y>=370&&y<=r.y+30);
  });
}
