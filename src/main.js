import './style.css';
import {Simulation} from './simulation.js';
import {HospitalWorld} from './world3d.js';
import {metrics} from './metrics.js';
import {createPlayerUI} from './playerUI.js';
let sim=new Simulation(42,'player'), selected={kind:'patient',id:'P001'}, showRoutes=true;
sim.running=true;
const clock=t=>{const s=Math.floor(t);return `${String(Math.floor(s/3600)+8).padStart(2,'0')}:${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;};
const mins=t=>`${(t/60).toFixed(1)} min`;
const $=id=>document.getElementById(id);
document.querySelector('#app').innerHTML=`
<header><a class="brand" href="/"><span class="brand-icon">✚</span><div>Hospital<span>Sim</span><small>OPERATIONS SANDBOX</small></div></a><div class="header-right"><span class="tag">SYNTHETIC DATA</span><span>SINGLE PLAYER · v0.4</span></div></header>
<main><section class="page-heading"><div><div class="eyebrow">YOUR VIRTUAL HOSPITAL</div><h1>Step inside your virtual hospital.</h1><p>Take a ticket. Answer your call. Walk through your hospital visit.</p></div><div class="floor-label">● Outpatient hospital<small>Ground floor · 9 departments</small></div></section>
<section class="kpis">${[['active','In hospital','Patients on the floor'],['waiting','Waiting for service','Across all departments'],['serving','In service','Resources currently occupied'],['discharged','Discharged','Completed care pathways'],['avgWait','Average wait','All arrivals · cumulative wait']].map(([id,name,desc])=>`<article><span>${name}</span><strong id="${id}">0</strong><small>${desc}</small></article>`).join('')}</section>
<div class="workspace"><section class="map-panel"><div class="panel-heading"><div><h2>Hospital world</h2><small>Drag to orbit · Scroll to zoom · Right-drag to pan</small></div><label><input id="routes" type="checkbox" checked> Routes</label></div><div class="world-toolbar"><div class="view-buttons"><button data-view="overview" class="selected">3D overview</button><button data-view="top">Top view</button><button data-view="walk">Corridor view</button></div><div><span id="worldTime" class="world-time">08:00:00</span><button id="worldPlay" class="world-play">▶ Start</button><label><input id="walls" type="checkbox" checked> Walls</label><label><input id="labels" type="checkbox" checked> Labels</label><button id="expand">⛶ Expand</button></div></div><div class="canvas-wrap"><canvas id="hospitalCanvas" tabindex="0" aria-label="3D hospital world. Drag to orbit, scroll to zoom, right-drag to pan. Use WASD or arrow keys to move the camera."></canvas><div class="world-badge"><span class="dot"></span> LIVE 3D WORLD</div><div class="world-help">ORBIT <b>Drag</b> &nbsp; ZOOM <b>Scroll</b> &nbsp; MOVE <b>W A S D</b></div><div id="worldError" role="alert" hidden></div></div><div class="map-footer"><div class="legend"><span><i style="background:#408c82"></i>Routine</span><span><i style="background:#d69b38"></i>Urgent</span><span><i style="background:#ce6265"></i>Critical</span></div><span>Priority labels are simulation assumptions</span></div><div id="inspector" class="inspector"></div></section>
<aside><section class="control-panel"><div class="panel-heading"><h2>Simulation control</h2><span id="status" class="tag">Ready</span></div><div id="time" class="clock">08:00:00</div><div class="clock-caption">SIMULATED TIME <span id="elapsed">0 min elapsed</span></div><button id="play" class="primary">▶ Start simulation</button><div class="speed-label">Playback speed</div><div class="speeds">${[1,5,20,100].map(n=>`<button data-speed="${n}" class="${n===sim.speed?'selected':''}" aria-pressed="${n===sim.speed}">${n}×</button>`).join('')}</div><div class="actions"><button id="add">＋ Add patient</button><button id="reset">↺ Reset</button></div></section><section class="queue-panel"><div class="panel-heading"><h2>Department activity</h2><small>Queue / capacity</small></div><div id="queues"></div><p class="util-legend">Bars show resource utilization over this run</p></section></aside></div>
<div class="lower-grid"><section class="settings-panel"><div class="panel-heading"><h2>Scenario assumptions</h2><span class="tag">DETERMINISTIC</span></div><p>Ticket → reception → waiting → triage → waiting → doctor → lab results → doctor review → pharmacy → exit.</p><label class="arrival-label">Patient arrival interval <div><input id="arrival" type="number" min="5" max="3600" step="5" value="45"> simulated seconds</div></label><div class="summary-metrics">${[['arrivals','Total arrivals'],['maxWait','Max wait'],['los','Avg. length of stay'],['throughput','Throughput']].map(([id,label])=>`<div>${label}<strong id="${id}">0</strong></div>`).join('')}</div><button id="export">↓ Export patient results CSV</button><span id="notice" role="status"></span></section><section class="events-panel"><div class="panel-heading"><h2>Activity feed</h2><small>Latest 8 events</small></div><div id="events"></div></section></div>
<footer><span>HospitalSim · An environment for operational exploration</span><span>Educational simulation · Synthetic patients · No clinical decisions</span></footer></main>`;
const canvas=$('hospitalCanvas');
let world;
try { world=new HospitalWorld(canvas,sim.rooms,selection=>{selected=selection;inspect();}); }
catch(error){$('worldError').hidden=false;$('worldError').textContent='The 3D renderer could not start. Enable hardware acceleration or open this app in a WebGL 2 capable browser.';console.error(error);}

const playerUI=createPlayerUI({getSim:()=>sim,getWorld:()=>world,onMode:beginSession,onChange:update,clock});
world?.enterMode(sim);
function beginSession(mode){
 sim=new Simulation(42,mode);sim.running=mode==='player';playerUI.clear();world?.enterMode(sim);selected=sim.player?{kind:'patient',id:sim.player.id}:null;
 $('arrival').value=45;$('notice').textContent='';document.querySelectorAll('[data-speed]').forEach(b=>{b.classList.toggle('selected',Number(b.dataset.speed)===sim.speed);b.setAttribute('aria-pressed',Number(b.dataset.speed)===sim.speed);});
 inspect();update();
}
function inspect(){
 if(!selected){$('inspector').innerHTML='<span class="inspect-icon">⌖</span><div><h3>Every department tells a story</h3><p>Select a room to adjust its capacity and service time, or a patient to follow their journey.</p></div>';return;}
 if(selected.kind==='room'){
 const r=sim.room(selected.id);$('inspector').innerHTML=`<div><div class="eyebrow">DEPARTMENT INSPECTOR</div><h3>${r.name}</h3><p id="roomSummary">${r.queue.length} queued · ${r.called.length} called · ${r.occupants.length} in service · ${r.served} completed</p></div>${r.capacity?`<label>Capacity<input id="capacity" type="number" min="1" max="20" value="${r.capacity}"></label><label>Service time (sec)<input id="service" type="number" min="5" max="7200" value="${r.serviceTime}"></label>`:'<span class="tag">TRANSIT AREA</span>'}`;
 addCameraActions();
 if(r.capacity){$('capacity').onchange=e=>{const v=Number(e.target.value);if(Number.isInteger(v)&&v>=1&&v<=20)r.capacity=v;e.target.value=r.capacity;};$('service').onchange=e=>{const v=Number(e.target.value);if(Number.isFinite(v)&&v>=5&&v<=7200)r.serviceTime=v;e.target.value=r.serviceTime;};}
 }else{const p=sim.patients.find(p=>p.id===selected.id);$('inspector').innerHTML=`<div><div class="eyebrow">PATIENT INSPECTOR</div><h3>${p.id} · ${p.priority}</h3><p id="patientSummary">${p.ageBand} · ${p.state.toLowerCase()} · ${p.phase}</p></div><div id="patientDetails" class="patient-detail">Arrived <b>${clock(p.arrivalTime)}</b><br>Wait <b>${mins(p.waitingTime+(p.queueSince===null?0:sim.time-p.queueSince))}</b><br>Destination <b>${p.destination?sim.room(p.destination).name:p.state==='DISCHARGED'?'Pathway completed':sim.room(p.currentRoom).name}</b></div>`;addCameraActions();}
}
function addCameraActions(){const controls=document.createElement('div');controls.className='camera-actions';controls.innerHTML='<button id="focus">⌖ Focus</button>'+(selected.kind==='patient'?'<button id="follow">Follow patient</button>':'');$('inspector').append(controls);$('focus').onclick=()=>world?.focus(selected,sim);if($('follow'))$('follow').onclick=()=>{world?.follow(selected.id);$('follow').textContent='Following';};}

function update(){
 playerUI.update();
 const m=metrics(sim);for(const k of ['active','waiting','serving','discharged','arrivals'])$(k).textContent=m[k];$('avgWait').innerHTML=`${(m.avgWait/60).toFixed(1)} <em>min</em>`;
 for(const k of ['maxWait','los'])$(k).textContent=mins(m[k]);$('throughput').textContent=`${m.throughput.toFixed(1)} / hr`;
 $('time').textContent=clock(sim.time);$('worldTime').textContent=clock(sim.time);$('worldPlay').textContent=sim.running?'Ⅱ Pause':sim.time?'▶ Resume':'▶ Start';$('elapsed').textContent=`${Math.floor(sim.time/60)} min elapsed`;$('status').textContent=sim.running?'Running':sim.time?'Paused':'Ready';$('play').textContent=sim.running?'Ⅱ Pause simulation':sim.time?'▶ Resume simulation':'▶ Start simulation';
 $('queues').innerHTML=sim.rooms.filter(r=>r.capacity).map(r=>{const u=Math.min(100,r.busySeconds/(r.availableSeconds||1)*100);return `<button class="queue-row" data-room="${r.id}"><div><span>${r.name}</span><b>${r.queue.length} <small>/ ${r.capacity}</small></b></div><div class="bar"><i style="width:${u}%"></i></div><small>${u.toFixed(0)}% utilization · ${r.occupants.length} serving · ${r.called.length} called</small></button>`;}).join('');
 document.querySelectorAll('[data-room]').forEach(b=>b.onclick=()=>{selected={kind:'room',id:b.dataset.room};inspect();});
 $('events').innerHTML=sim.events.length?sim.events.slice(0,8).map(e=>`<div class="event"><time>${clock(e.timestamp)}</time><div><b>${e.entityId}</b> ${e.type.toLowerCase()}<small>${e.location}</small></div><span>·</span></div>`).join(''):'<div class="empty-feed"><span>↗</span><h3>The floor is ready.</h3><p>Start the simulation to see patients arrive and their journeys unfold.</p></div>';
 if(selected?.kind==='patient'){
 const p=sim.patients.find(p=>p.id===selected.id);
 $('patientSummary').textContent=`${p.ageBand} · ${p.state.toLowerCase()} · ${p.phase}`;
 $('patientDetails').innerHTML=`Arrived <b>${clock(p.arrivalTime)}</b><br>Wait <b>${mins(p.waitingTime+(p.queueSince===null?0:sim.time-p.queueSince))}</b><br>Destination <b>${p.destination?sim.room(p.destination).name:p.state==='DISCHARGED'?'Pathway completed':sim.room(p.currentRoom).name}</b>`;
 if($('follow'))$('follow').textContent=world?.followId===p.id?'Following':'Follow patient';
 }
 if(selected?.kind==='room'){const r=sim.room(selected.id); $('roomSummary').textContent=`${r.queue.length} queued · ${r.called.length} called · ${r.occupants.length} in service · ${r.served} completed`;}
}
$('play').onclick=$('worldPlay').onclick=()=>{sim.running=!sim.running;update();};
document.querySelectorAll('[data-speed]').forEach(b=>b.onclick=()=>{sim.speed=Number(b.dataset.speed);document.querySelectorAll('[data-speed]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',x===b);});});
$('add').onclick=()=>{const p=sim.spawn();selected={kind:'patient',id:p.id};inspect();update();};
$('reset').onclick=()=>beginSession(sim.mode);
$('routes').onchange=e=>showRoutes=e.target.checked;
$('arrival').onchange=e=>{const v=Number(e.target.value);if(Number.isFinite(v)&&v>=5&&v<=3600){sim.arrivalInterval=v;sim.nextArrival=sim.time+v;}e.target.value=sim.arrivalInterval;};
$('export').onclick=()=>{const rows=[['id','ticket','age_band','priority','state','arrival_seconds','waiting_seconds','discharge_seconds','length_of_stay_seconds','pulse_bpm','doctor_visits','lab_results_ready_seconds'],...sim.patients.map(p=>[p.id,p.ticket||'',p.ageBand,p.priority,p.state,p.arrivalTime,p.waitingTime+(p.queueSince===null?0:sim.time-p.queueSince)+(p.phase==='results'?sim.time-p.resultsWaitStart:0),p.dischargeTime??'',p.dischargeTime===null?'':p.dischargeTime-p.arrivalTime,p.pulse?.bpm??'',p.doctorVisits,p.results?.readyAt??''])];const url=URL.createObjectURL(new Blob([rows.map(r=>r.join(',')).join('\n')],{type:'text/csv'}));const a=document.createElement('a');a.href=url;a.download='hospitalsim-patients.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('notice').textContent=`Exported ${sim.patients.length} synthetic patient records.`;};
let previous=performance.now(),lastUpdate=0;
function frame(now){const dt=Math.min((now-previous)/1000,.25);sim.advance(dt);previous=now;playerUI.move(dt);world?.render(sim,selected,showRoutes,dt);if(now-lastUpdate>250){update();lastUpdate=now;}requestAnimationFrame(frame);}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{world?.setView(b.dataset.view);document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('selected',x===b));});
$('walls').onchange=e=>{if(world)world.wallGroup.visible=e.target.checked;};
$('labels').onchange=e=>world?.labels.forEach(label=>label.visible=e.target.checked);
$('expand').onclick=()=>{const panel=document.querySelector('.map-panel');panel.classList.toggle('expanded');$('expand').textContent=panel.classList.contains('expanded')?'✕ Close':'⛶ Expand';world?.resize();};
document.addEventListener('keydown',e=>{if(e.code==='Space'&&e.target===canvas){e.preventDefault();sim.running=!sim.running;update();}if(e.key==='Escape'){document.querySelector('.map-panel').classList.remove('expanded');$('expand').textContent='⛶ Expand';world?.resize();}});
inspect();update();requestAnimationFrame(frame);

