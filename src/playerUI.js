import {JOURNEY} from './journey.js';

export function createPlayerUI({getSim,getWorld,onMode,onChange,clock}){
  const map=document.querySelector('.map-panel'),toolbar=document.querySelector('.world-toolbar');
  const modes=document.createElement('div');modes.className='mode-switch';
  modes.innerHTML='<div><button data-mode="player">Single player</button><button data-mode="operations">Hospital simulation</button></div><small>Switching mode starts a fresh visit.</small>';
  toolbar.before(modes);
  const hud=document.createElement('section');hud.className='player-hud';hud.setAttribute('aria-label','Player controls');
  hud.innerHTML='<div class="eyebrow">YOUR JOURNEY <span id="hudTicket">NO TICKET YET</span></div><h3 id="playerStage"></h3><p id="playerInstruction"></p><span id="playerDistance"></span><div class="player-actions"><button id="interact">E · Interact</button><button id="walkNext">Walk to next stop</button><button id="skipWait" title="Advance simulation time until the next call, service completion, or lab result.">Wait</button><button id="followMe">Follow me</button></div><div id="playerNotice" role="status"></div><div class="movement-row"><div class="dpad"><button data-direction="w" aria-label="Walk forward">↑</button><button data-direction="a" aria-label="Walk left">←</button><button data-direction="s" aria-label="Walk backward">↓</button><button data-direction="d" aria-label="Walk right">→</button></div><small>WASD / arrows to walk<br>E to interact · Drag to orbit</small></div>';
  document.querySelector('.canvas-wrap').append(hud);
  const records=document.createElement('div');records.className='hud-records';records.innerHTML='<span id="hudPulse">Pulse —</span><span id="hudLab">Lab —</span>';hud.querySelector('.player-actions').before(records);
  const board=document.createElement('section');board.className='call-board';board.setAttribute('aria-label','Ticket call board');board.innerHTML='<div class="eyebrow">NOW CALLING</div><div id="ticketCalls"></div>';
  document.querySelector('.canvas-wrap').append(board);
  const card=document.createElement('section');card.className='journey-card';
  card.innerHTML='<div class="panel-heading"><h2>Your visit</h2><span id="journeyProgress" class="tag">1 / 11</span></div><div class="visit-records"><div>Ticket<strong id="recordTicket">Not issued</strong></div><div>Pulse<strong id="recordPulse">Not recorded</strong></div><div class="lab-record">Lab report<strong id="recordLab">Not collected</strong><small>Synthetic visit records</small></div></div><ol class="journey-steps">'+JOURNEY.map((step,i)=>`<li data-stage="${i}"><span>${i+1}</span>${step.name}</li>`).join('')+'</ol>';
  document.querySelector('aside').prepend(card);
  const $=id=>document.getElementById(id),keys=new Set();
  function notify(message){$('playerNotice').textContent=message||'';onChange();}
  function interact(){notify(getSim().interact());}
  $('interact').onclick=interact;
  $('walkNext').onclick=()=>{if(getSim().walkPlayer()){notify('Walking to your next stop. Use movement keys to take over.');}else notify('Resume the world or wait for your call first.');};
  $('skipWait').onclick=()=>{getSim().skipPlayerWait();notify(getSim().player?.instruction);};
  $('followMe').onclick=()=>getWorld()?.follow(getSim().player.id);
  modes.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{keys.clear();onMode(b.dataset.mode);});
  const typing=e=>['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)||e.target.isContentEditable;
  const arrows={ArrowUp:'w',ArrowLeft:'a',ArrowDown:'s',ArrowRight:'d'};
  document.addEventListener('keydown',e=>{
    if(getSim().mode!=='player'||typing(e)||e.ctrlKey||e.metaKey||e.altKey)return;
    const key=arrows[e.key]||e.key.toLowerCase();
    if(['w','a','s','d'].includes(key)){e.preventDefault();keys.add(key);}
    if(key==='e'&&!e.repeat){e.preventDefault();interact();}
  });
  document.addEventListener('keyup',e=>keys.delete(arrows[e.key]||e.key.toLowerCase()));
  window.addEventListener('blur',()=>keys.clear());document.addEventListener('visibilitychange',()=>keys.clear());
  hud.querySelectorAll('[data-direction]').forEach(b=>{
    b.onpointerdown=e=>{e.preventDefault();keys.add(b.dataset.direction);b.setPointerCapture(e.pointerId);};
    b.onpointerup=b.onpointercancel=b.onlostpointercapture=()=>keys.delete(b.dataset.direction);
    b.onclick=()=>{keys.add(b.dataset.direction);move(.2);keys.delete(b.dataset.direction);onChange();};
  });
  let previousStatus='';
  function update(){
    const sim=getSim(),p=sim.player,playing=sim.mode==='player';map.classList.toggle('player-mode',playing);hud.hidden=card.hidden=!playing;
    document.querySelector('.header-right>span:last-child').textContent=playing?'SINGLE PLAYER · v0.4':'HOSPITAL SIMULATION · v0.4';
    document.getElementById('hospitalCanvas').setAttribute('aria-label',playing?'3D hospital world. WASD or arrow keys walk your player. E interacts at your destination. Drag to orbit and scroll to zoom.':'3D hospital world. Drag to orbit, scroll to zoom, right-drag to pan. WASD or arrow keys move the camera.');
    modes.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('selected',b.dataset.mode===sim.mode);b.setAttribute('aria-pressed',b.dataset.mode===sim.mode);});
    $('add').disabled=playing;$('arrival').disabled=playing;
    board.hidden=sim.calls.length===0;
    $('ticketCalls').innerHTML=sim.calls.slice(0,3).map(c=>`<div><strong>${c.ticket}</strong><span>${c.room}<small>${clock(c.timestamp)}</small></span></div>`).join('');
    if(!p)return;
    const target=sim.playerTarget(),near=target&&Math.hypot(p.x-target.x,p.y-target.y)<=32;
    $('hudTicket').textContent=p.ticket||'NO TICKET YET';$('playerStage').textContent=p.phase==='done'?'Visit complete':JOURNEY[p.stage].name;
    $('playerInstruction').textContent=sim.running?p.instruction:'World paused. Resume to walk or interact.';
    $('playerDistance').textContent=target?`${(Math.hypot(p.x-target.x,p.y-target.y)/20).toFixed(1)} m to ${p.stage===0?'ticket kiosk':target.room.name}`:p.phase==='results'?`${Math.max(0,p.resultsReadyAt-sim.time)} simulated seconds until results`:p.phase==='service'?`${Math.max(0,p.serviceEnd-sim.time)} simulated seconds remaining`:p.phase==='done'?'You can continue exploring the hospital.':'Your ticket will appear on the call board.';
    $('interact').disabled=!sim.running||!near||p.phase==='moving';$('interact').textContent=p.stage===0?'E · Take ticket':[2,4].includes(p.stage)?'E · Sit & wait':'E · Check in';
    $('walkNext').disabled=!sim.running||!target||p.phase==='moving';$('skipWait').disabled=!sim.running||!['queued','service','results'].includes(p.phase);
    $('skipWait').textContent=p.phase==='service'?'Finish service':p.phase==='results'?'Wait for results':'Wait for call';
    $('recordTicket').textContent=p.ticket||'Not issued';$('recordPulse').textContent=p.pulse?`${p.pulse.bpm} bpm · synthetic`:'Not recorded';
    $('hudPulse').textContent=p.pulse?`Pulse ${p.pulse.bpm} bpm`:'Pulse —';$('hudLab').textContent=p.results?(p.results.reviewedAt===null?'Lab ready':'Lab reviewed'):p.phase==='results'?'Lab processing':'Lab —';
    $('recordLab').textContent=p.results?(p.results.reviewedAt===null?'Ready for doctor review':'Reviewed by doctor'):p.phase==='results'?'Processing sample':'Not collected';
    $('journeyProgress').textContent=p.phase==='done'?'COMPLETE':`${p.stage+1} / ${JOURNEY.length}`;
    card.querySelectorAll('[data-stage]').forEach(li=>{const n=Number(li.dataset.stage);li.classList.toggle('completed',n<p.stage||p.phase==='done');li.classList.toggle('current',n===p.stage&&p.phase!=='done');});
    const status=`${p.stage}-${p.phase}-${sim.running}`;if(status!==previousStatus){$('playerNotice').textContent='';previousStatus=status;}
  }
  function move(dt){
    const sim=getSim(),world=getWorld(),p=sim.player;if(!p)return;p.manualWalking=false;if(!keys.size||!sim.running)return;
    const camera=world?.camera,target=world?.controls.target;let fx=0,fy=-1;
    if(camera&&target){fx=target.x-camera.position.x;fy=target.z-camera.position.z;const n=Math.hypot(fx,fy)||1;fx/=n;fy/=n;}
    const front=Number(keys.has('w'))-Number(keys.has('s')),side=Number(keys.has('d'))-Number(keys.has('a'));
    let x=fx*front-fy*side,y=fy*front+fx*side;const n=Math.hypot(x,y);if(!n)return;
    p.manualWalking=sim.movePlayer(x/n*50*dt,y/n*50*dt,(x,y)=>world?world.canWalk(x,y,p):true);
  }
  return {update,move,clear:()=>keys.clear()};
}
