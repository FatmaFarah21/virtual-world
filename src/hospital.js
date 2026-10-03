export const definitions = [
  ['entrance','Entrance & tickets','TICKETING',30,390,150,130,1,15,'#e5eee9'],
  ['reception','Reception','REGISTERING',30,80,210,210,2,90,'#dfeeea'],
  ['triage','Triage','TRIAGE',265,80,185,210,1,120,'#e5edf7'],
  ['consult1','Consultation 01','CONSULTATION',475,80,205,210,1,360,'#ece8f4'],
  ['consult2','Consultation 02','CONSULTATION',705,80,205,210,1,360,'#ece8f4'],
  ['waiting','Waiting room','WAITING',210,390,240,170,0,0,'#f3eddf'],
  ['lab','Laboratory','LAB',475,390,205,170,1,240,'#e3edf4'],
  ['pharmacy','Pharmacy','PHARMACY',705,390,205,170,1,120,'#e5eee9'],
  ['exit','Exit','DISCHARGED',940,390,130,130,0,0,'#e5eee9'],
];
export function createRooms() { return definitions.map(([id,name,type,x,y,width,height,capacity,serviceTime,color]) => ({id,name,type,x,y,width,height,capacity,serviceTime,color,queue:[],called:[],occupants:[],busySeconds:0,availableSeconds:0,served:0})); }
export function createGraph(rooms) {
  const graph = {};
  rooms.forEach((r,i) => { graph[r.id] = {x:r.x+r.width/2,y:r.y<300?r.y+r.height-22:r.y+24,edges:[`hall${i}`]}; graph[`hall${i}`] = {x:r.x+r.width/2,y:340,edges:[r.id]}; });
  const sorted = rooms.map((r,i)=>`hall${i}`).sort((a,b)=>graph[a].x-graph[b].x);
  sorted.forEach((id,i)=>graph[id].edges.push(...[sorted[i-1],sorted[i+1]].filter(Boolean)));
  return graph;
}
export const priorityColors = {Routine:'#408c82',Urgent:'#d69b38',Critical:'#ce6265'};
