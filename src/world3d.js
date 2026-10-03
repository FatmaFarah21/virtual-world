import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { priorityColors } from './hospital.js';

const SCALE = 1 / 20;
const damp = (value,target,rate,dt) => value+(target-value)*(1-Math.exp(-rate*dt));
const turn = (value,target,dt) => value+Math.atan2(Math.sin(target-value),Math.cos(target-value))*(1-Math.exp(-8*dt));
const walkToward = (position,target,speed,dt) => {
  const distance=Math.hypot(target.x-position.x,target.z-position.z);
  if(distance>0){const amount=Math.min(1,speed*dt/distance);position.x+=(target.x-position.x)*amount;position.z+=(target.z-position.z)*amount;}
};
const worldPoint = (x, y) => new THREE.Vector3(x * SCALE, 0, y * SCALE);

export class HospitalWorld {
  constructor(canvas, rooms, onSelect) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#dce5e5');
    this.scene.fog = new THREE.Fog('#dce5e5', 95, 180);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 220);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 105;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    this.controls.target.set(27.5, 0, 16);
    this.agents = new Map();
    this.staff = new Map();
    this.floors = new Map();
    this.labels = [];
    this.pickables = [];
    this.obstacles = [];
    this.animationTime = 0;
    this.wallGroup = new THREE.Group();
    this.routeGroup = new THREE.Group();
    this.scene.add(this.wallGroup, this.routeGroup);
    this.materials = new Map();
    this.boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.sphereGeometry = new THREE.SphereGeometry(1, 12, 10);
    this.limbGeometry = new THREE.CylinderGeometry(1, 1, 1, 8);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#819e8f', 1.5));
    const sun = new THREE.DirectionalLight('#fff2dc', 2.4);
    sun.position.set(-15, 65, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 150 });
    sun.shadow.bias = -0.001;
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun);
    this.build(rooms);
    this.targetMarker = new THREE.Mesh(new THREE.RingGeometry(.65, .8, 36),new THREE.MeshBasicMaterial({color:'#e5ac40',side:THREE.DoubleSide}));
    this.targetMarker.rotation.x=-Math.PI/2;this.targetMarker.position.y=.11;this.scene.add(this.targetMarker);
    this.setView('overview');
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
    this.resize();
    const raycaster = new THREE.Raycaster();
    let down = null;
    canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
      const rect = canvas.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1), this.camera);
      const hit = raycaster.intersectObjects([...this.pickables, ...[...this.agents.values()].map(a => a.group)], true).find(h => {
        let o = h.object; while (o && !o.userData.selection) o = o.parent;
        return o?.userData.selection;
      });
      if (hit) { let o = hit.object; while (!o.userData.selection) o = o.parent; onSelect(o.userData.selection); }
      else onSelect(null);
    });
    canvas.addEventListener('keydown', e => {
      if(this.playerActive)return;
      const keys = { w: [0, -1], ArrowUp: [0, -1], s: [0, 1], ArrowDown: [0, 1], a: [-1, 0], ArrowLeft: [-1, 0], d: [1, 0], ArrowRight: [1, 0] };
      if (!keys[e.key]) return;
      e.preventDefault(); this.followId = null;
      const forward = this.controls.target.clone().sub(this.camera.position); forward.y = 0; forward.normalize();
      const right = new THREE.Vector3(-forward.z, 0, forward.x);
      const [x, z] = keys[e.key];
      const move = right.multiplyScalar(x).add(forward.multiplyScalar(-z)).multiplyScalar(1.2);
      this.camera.position.add(move); this.controls.target.add(move);
    });
  }
  material(color) {
    if (!this.materials.has(color)) this.materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.72 }));
    return this.materials.get(color);
  }
  box(parent, x, y, z, w, h, d, color) {
    const mesh = new THREE.Mesh(this.boxGeometry, this.material(color));
    mesh.position.set(x, y, z); mesh.scale.set(w, h, d); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh);
    if(parent===this.scene&&y+h/2>.3&&y-h/2<1.3&&w<20&&d<20)this.obstacles.push({x,z,w,d});
    return mesh;
  }
  sphere(parent, x, y, z, radius, color) {
    const mesh = new THREE.Mesh(this.sphereGeometry, this.material(color)); mesh.position.set(x, y, z); mesh.scale.setScalar(radius); mesh.castShadow = true; parent.add(mesh); return mesh;
  }
  label(text, x, y, z, color = '#355f57', width = 6) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 80;
    const c = canvas.getContext('2d'); c.fillStyle = '#ffffffef'; c.beginPath(); c.roundRect(2, 2, 508, 76, 12); c.fill();
    c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '600 29px Segoe UI'; c.fillText(text, 256, 40);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, toneMapped: false }));
    sprite.position.set(x, y, z); sprite.scale.set(width, width * 80 / 512, 1);sprite.userData.labelCanvas=canvas;this.scene.add(sprite); this.labels.push(sprite); return sprite;
  }
  chair(x, z, color = '#598b89', rotation = 0) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotation; this.scene.add(g);
    this.box(g, 0, .48, 0, .65, .13, .65, color); this.box(g, 0, .88, -.28, .65, .72, .12, color);
    for (const a of [-.24, .24]) for (const b of [-.24, .24]) this.box(g, a, .22, b, .055, .44, .055, '#879696');
    return g;
  }
  desk(x, z, width = 2.6) {
    this.box(this.scene, x, .8, z, width, .16, 1.05, '#dbc2a0');
    this.box(this.scene, x - width / 2 + .2, .38, z, .32, .7, .9, '#f5f4ee');
    this.box(this.scene, x + width / 2 - .2, .38, z, .32, .7, .9, '#f5f4ee');
    this.box(this.scene, x + .2, 1.15, z - .2, .65, .48, .09, '#384e58');
    this.box(this.scene, x + .2, .98, z - .2, .08, .3, .08, '#61777e');
    this.box(this.scene, x + .2, .91, z + .12, .57, .035, .2, '#718489');
  }
  bed(x, z) {
    this.box(this.scene, x, .52, z, 1.15, .16, 2.25, '#8fabb1');
    this.box(this.scene, x, .7, z, 1.09, .24, 2.1, '#f9fbf6');
    this.box(this.scene, x, .86, z + .25, 1.1, .08, 1.35, '#6ba4b0');
    this.box(this.scene, x, .86, z - .75, .82, .13, .42, '#ffffff');
    for (const a of [-.48, .48]) for (const b of [-.95, .95]) this.box(this.scene, x + a, .25, z + b, .07, .5, .07, '#68838a');
    this.box(this.scene, x + .93, 1.1, z - .6, .09, 2.2, .09, '#9baeb0');
    this.box(this.scene, x + .93, 1.92, z - .6, .25, .42, .12, '#bbdedf');
  }
  plant(x, z, size = 1) {
    this.box(this.scene, x, .24, z, .48, .48, .48, '#dfd8c8');
    this.sphere(this.scene, x, .7, z, .38 * size, '#6b9663');
    this.sphere(this.scene, x + .15, 1, z, .3 * size, '#81aa6d');
  }
  person(color, staff = false) {
    const g = new THREE.Group();
    const skin = ['#d9a17f', '#b77f62', '#875b43', '#e6b898'][Math.floor(this.agents.size % 4)];
    this.sphere(g, 0, 1.53, 0, .2, skin);
    const hair = this.sphere(g, 0, 1.63, -.045, .18, '#4e3932'); hair.scale.y *= .6;
    this.box(g, 0, 1.06, 0, .46, .55, .28, staff ? '#f5fbfb' : color);
    this.box(g, 0, .73, 0, .43, .13, .26, '#435465');
    const joints = [];
    for (const side of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(side * .125, .7, 0); g.add(leg);
      this.box(leg, 0, -.28, 0, .17, .56, .18, staff ? '#55859a' : '#465969');
      this.box(leg, 0, -.61, .055, .18, .1, .31, '#344047'); joints.push(leg);
      const arm = new THREE.Group(); arm.position.set(side * .29, 1.25, 0); g.add(arm);
      this.box(arm, 0, -.24, 0, .13, .46, .16, staff ? '#f5fbfb' : color);
      this.sphere(arm, 0, -.5, 0, .075, skin); joints.push(arm);
    }
    if (staff) { this.box(g, .09, 1.2, .15, .1, .11, .025, '#62a3ad'); }
    return { group: g, joints };
  }
  build(rooms) {
    this.box(this.scene, 27, -.65, 16, 180, .3, 150, '#c8d7cb');
    this.box(this.scene, 27.5, -.22, 16, 57, .5, 29, '#d5d8d3');
    this.box(this.scene, 27.5, .01, 17, 53.5, .04, 3.6, '#c7dce0');
    for (let x = 2; x < 54; x += 1.5) for (const z of [15.6, 18.4]) this.box(this.scene, x, .04, z, .75, .015, .04, '#7facb4');
    this.box(this.scene, 27.5, -.43, 33, 68, .12, 4, '#bbc5c4');
    this.box(this.scene, 27.5, -.4, 38, 72, .1, 6, '#899898');
    for (let x = 0; x < 62; x += 5) this.box(this.scene, x, -.33, 38, 2.3, .02, .12, '#e5e9dc');
    // Exterior trees and a small drop-off area establish the hospital as a world.
    for (const x of [-3, 58]) for (const z of [0, 11, 24, 33]) {
      this.box(this.scene, x, .9, z, .35, 2.4, .35, '#94826a');
      this.sphere(this.scene, x, 2.6, z, 1.45, '#789766');
      this.sphere(this.scene, x + .6, 3.2, z, .95, '#91ac7c');
    }
    for (let i = 0; i < 4; i++) {
      const x = 12 + i * 7, z = 34;
      this.box(this.scene, x, .18, z, 2, .7, 3.7, ['#6c8997', '#eee7d9', '#719386', '#a88d7f'][i]);
      this.box(this.scene, x, .77, z, 1.75, .65, 1.9, '#789197');
      for (const a of [-1, 1]) for (const b of [-1.15, 1.15]) this.box(this.scene, x + a, -.02, z + b, .18, .5, .55, '#435053');
    }
    this.label('HOSPITALSIM  /  OUTPATIENT', 28, .4, 30, '#42675d', 9);
    for (const r of rooms) {
      const x = r.x * SCALE, z = r.y * SCALE, w = r.width * SCALE, d = r.height * SCALE;
      const g = new THREE.Group(); g.userData.selection = { kind: 'room', id: r.id };
      this.scene.add(g);
      const floor = this.box(g, x + w / 2, .025, z + d / 2, w, .08, d, r.color);
      floor.userData.selection = g.userData.selection; this.pickables.push(g); this.floors.set(r.id, floor);
      // Back and side walls, open cutaway front, and a real corridor doorway.
      const wallHeight = 2.65, outerZ = r.y < 300 ? z : z + d;
      this.box(this.wallGroup, x + w / 2, wallHeight / 2, outerZ, w, wallHeight, .14, '#f1f0e8');
      for (const edge of [x, x + w]) this.box(this.wallGroup, edge, .8, z + d / 2, .14, 1.6, d, '#e7ebe6');
      const doorZ = r.y < 300 ? z + d : z;
      const wing = (w - 1.45) / 2;
      for (const side of [-1, 1]) this.box(this.wallGroup, x + w / 2 + side * (w / 2 - wing / 2), .45, doorZ, wing, .9, .14, '#edf0e8');
      for (const side of [-1, 1]) this.box(this.wallGroup, x + w / 2 + side * .78, 1.18, doorZ, .1, 2.36, .15, '#7faaa4');
      this.box(this.wallGroup, x + w / 2, 2.36, doorZ, 1.65, .13, .15, '#7faaa4');
      const name = this.label(r.name, x + w / 2, 3.3, outerZ, '#365f59', Math.min(w - .4, 7));
      name.userData.selection = g.userData.selection; this.pickables.push(name);
      for (let tx = x + 1; tx < x + w; tx += 1) this.box(g, tx, .075, z + d / 2, .012, .007, d, '#d9e2de');
      for (let tz = z + 1; tz < z + d; tz += 1) this.box(g, x + w / 2, .075, tz, w, .007, .012, '#d9e2de');
      if(r.id==='entrance'){
        this.box(this.scene,x+w/2, .8,z+5.15,.85,1.6,.55,'#638e8d');
        this.box(this.scene,x+w/2,1.25,z+4.84,.63,.38,.06,'#243e47');
        this.box(this.scene,x+w/2,.67,z+4.84,.35,.08,.09,'#ffffff');
        this.label('TICKET KIOSK',x+w/2,2.1,z+5.15,'#365f59',3.2);
      }else if (r.id === 'waiting') {
        for (let i = 0; i < 12; i++) this.chair(x + 1.3 + (i % 6) * 1.5, z + 3.3 + Math.floor(i / 6) * 2.1);
        this.desk(x + w - 1.4, z + d - 1.5, 1.2); this.plant(x + .6, z + d - .6);
        this.box(this.scene,x+w/2,2.05,z+d-.18,6,1.15,.15,'#355957');
        this.callSign=this.label('PLEASE WAIT FOR YOUR TICKET',x+w/2,2.15,z+d-.3,'#355957',5.8);
      } else if (r.id === 'reception') {
        this.desk(x + w / 2, z + 2.8, 6.6);
        this.box(this.scene, x + w / 2, .62, z + 3.2, 6.6, 1.2, .25, '#6c9990');
        this.chair(x + w / 2 - 1.4, z + 1.6, '#6c8188', Math.PI); this.chair(x + w / 2 + 1.4, z + 1.6, '#6c8188', Math.PI);
        this.plant(x + .7, z + .8);
      } else if (r.id.startsWith('consult') || r.id === 'triage') {
        this.bed(x + w - 2.2, z + 2.5); this.desk(x + 2, z + 2);
        this.chair(x + 2, z + .9, '#6c8188', Math.PI);
        this.box(this.scene, x + w - .8, 1.1, z + .5, .8, 2.2, .7, '#f5f6ed');
        this.plant(x + .6, z + .6);
      } else if (r.id === 'lab') {
        this.desk(x + w / 2, z + d - 1.5, w - 1.4);
        for (let i = 0; i < 3; i++) { this.box(this.scene, x + 1.7 + i * 2.2, 1.12, z + d - 1.5, .8, .5, .65, '#9db8c1'); this.box(this.scene, x + 1.7 + i * 2.2, 1.42, z + d - 1.5, .34, .1, .35, '#465f70'); }
        this.box(this.scene, x + w - .6, 1.1, z + 3.5, .6, 2.2, 1.1, '#eff5f1');
      } else if (r.id === 'pharmacy') {
        for (let i = 0; i < 3; i++) {
          const sx = x + 1.7 + i * 2.5;
          this.box(this.scene, sx, 1.1, z + d - .7, 1.9, 2.2, .5, '#cbd9d2');
          for (let h = .45; h < 2; h += .5) for (let b = 0; b < 5; b++) this.box(this.scene, sx - .65 + b * .32, h, z + d - .37, .18, .25, .17, b % 2 ? '#83adb0' : '#fcfbef');
        }
        this.desk(x + w / 2, z + 3.8, w - 1.7);
      } else {
        this.plant(x + .7, z + d - .7); this.plant(x + w - .7, z + d - .7);
        for (const a of [-.32, .32]) this.box(this.scene, x + w / 2 + a, .085, z + 2.5, .5, .015, .12, '#6a9b8d');
      }
      if (r.capacity&&r.id!=='entrance') {
        const team=[];
        for(let i=0;i<r.capacity;i++){
          const staff=this.person('#ffffff',true);
          staff.home=new THREE.Vector3(x+w/2+(i-(r.capacity-1)/2)*1.5,0,z+1.6);
          staff.group.position.copy(staff.home);staff.group.rotation.y=Math.PI;
          staff.bubble=this.label('',0,2.3,0,'#355f57',3.4);staff.bubble.userData.playerLabel=true;staff.group.add(staff.bubble);staff.bubble.visible=false;
          staff.prop=this.box(staff.joints[1],0,-.5,.12,.28,.1,.3,'#8dc6c5');staff.prop.visible=false;
          this.scene.add(staff.group);team.push(staff);
        }
        this.staff.set(r.id,team);
      }
    }
    for (let x = 2; x < 54; x += 1.6) this.box(this.routeGroup, x, .09, 17, .7, .02, .07, '#468e87');
  }
  animateStaff(sim,dt){
    const dialogue={
      1:['Welcome. Your ticket, please.','Let me register your visit.','Please wait for the triage nurse.'],
      3:['Please hold out your wrist.','Checking your pulse…','Your pulse will be recorded.'],
      5:['Tell me how you are feeling.','Let me examine you.','We will request laboratory tests.'],
      6:['Please hold your arm still.','Collecting your sample…','Please wait while we process it.'],
      8:['Your laboratory results are ready.','Let us review the findings.','Take this prescription to pharmacy.'],
      9:['Let me check your prescription.','Preparing your medication…','Here you are. Your visit is complete.']
    };
    for(const [id,team] of this.staff){
      const room=sim.room(id);
      team.forEach((staff,i)=>{
        const p=room.occupants[i],called=room.called[i];
        const patientPosition=p?this.agents.get(p.id)?.group.position:null;
        const goal=p?(patientPosition?.clone()||worldPoint(p.x,p.y)).add(new THREE.Vector3(0,0,1.05)):staff.home;
        const moving=staff.group.position.distanceTo(goal)>.08;
        if(sim.running)walkToward(staff.group.position,goal,1.5,dt);
        const target=p?patientPosition:called?worldPoint(called.x,called.y):moving?goal:null;
        if(target){const d=target.clone().sub(staff.group.position);if(sim.running)staff.group.rotation.y=turn(staff.group.rotation.y,Math.atan2(d.x,d.z),dt);}
        const wave=this.animationTime*4;
        const poses=staff.joints.map((joint,j)=>({x:moving?Math.sin(wave+(j<2?0:Math.PI))*(j%2?1:-1)*.28:0,z:0}));
        staff.prop.visible=!!p;
        if(p){
          const progress=Math.min(.999,(sim.time+sim.remainder-p.serviceStartTime)/(p.serviceEnd-p.serviceStartTime));
          const lines=dialogue[p.stage]||['How can I help you?'];
          const text=lines[Math.floor(progress*lines.length)];
          poses[1].x=-1.15+Math.sin(wave)*.08;
          poses[3].x=p.stage===3||p.stage===6?-1.2:-.65;
          if(sim.running)staff.group.rotation.z=Math.sin(this.animationTime*2)*.015;
          this.setSpeech(staff,text);
        }else{
          staff.group.rotation.z=0;
          if(called){poses[3].z=-2.3+Math.sin(wave)*.16;this.setSpeech(staff,`${called.ticket||'Patient'} — please come in!`);}
          else staff.bubble.visible=false;
        }
        if(sim.running)staff.joints.forEach((joint,j)=>{joint.rotation.x=damp(joint.rotation.x,poses[j].x,6,dt);joint.rotation.z=damp(joint.rotation.z,poses[j].z,6,dt);});
      });
    }
  }
  setSpeech(staff,text){
    staff.bubble.visible=true;
    if(staff.bubble.userData.text===text)return;
    const c=staff.bubble.userData.labelCanvas.getContext('2d');
    c.clearRect(0,0,512,80);c.fillStyle='#fffffff5';c.beginPath();c.roundRect(2,2,508,76,12);c.fill();
    c.fillStyle='#355f57';c.textAlign='center';c.textBaseline='middle';c.font='600 23px Segoe UI';c.fillText(text,256,40,490);
    staff.bubble.material.map.needsUpdate=true;staff.bubble.userData.text=text;
  }
  resize() {
    const { width, height } = this.canvas.parentElement.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height, false); this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
  }
  setView(mode) {
    this.followId = null; this.controls.target.set(27.5, 0, 16);
    if (mode === 'top') this.camera.position.set(27.5, 69, 16.1);
    else if (mode === 'walk') { this.camera.position.set(3, 2.1, 17); this.controls.target.set(30, 1.5, 17); }
    else { this.camera.position.set(62, 48, 62); }
    this.controls.update();
  }
  focus(selection, sim) {
    const entity = selection?.kind === 'room' ? sim.room(selection.id) : sim.patients.find(p => p.id === selection?.id);
    if (!entity) return;
    this.followId = null;
    const center = selection.kind === 'room' ? worldPoint(entity.x + entity.width / 2, entity.y + entity.height / 2) : worldPoint(entity.x, entity.y);
    this.controls.target.copy(center); this.camera.position.copy(center).add(new THREE.Vector3(9, 12, 14)); this.controls.update();
  }
  follow(id) {
    this.followId = id;
    if(this.playerActive&&id===this.playerId){const a=this.agents.get(id);if(a){const target=a.group.position.clone().add(new THREE.Vector3(0,1,0));this.controls.target.copy(target);this.camera.position.copy(target).add(new THREE.Vector3(4,5,7));this.controls.update();}}
  }
  enterMode(sim){
    for(const a of this.agents.values()){this.scene.remove(a.group);a.ring.geometry.dispose();a.ring.material.dispose();if(a.you){this.labels=this.labels.filter(label=>label!==a.you);a.you.material.map.dispose();a.you.material.dispose();}}
    this.agents.clear();this.playerActive=sim.mode==='player';this.playerId=sim.player?.id;this.setView('overview');
    if(sim.player){const target=worldPoint(sim.player.x,sim.player.y).add(new THREE.Vector3(0,1,0));this.controls.target.copy(target);this.camera.position.copy(target).add(new THREE.Vector3(4,5,7));this.followId=sim.player.id;this.controls.update();}
  }
  canWalk(x,y,player){
    const wx=x*SCALE,wz=y*SCALE;
    return !this.obstacles.some(o=>{
      const inside=(a,b)=>Math.abs(a-o.x)<o.w/2+.22&&Math.abs(b-o.z)<o.d/2+.22;
      if(player&&inside(player.x*SCALE,player.y*SCALE))return false;
      return inside(wx,wz);
    });
  }
  render(sim, selected, routes, dt) {
    if(sim.running)this.animationTime+=dt;this.playerActive=sim.mode==='player';this.playerId=sim.player?.id;
    this.routeGroup.visible = routes;
    const destination=sim.playerTarget();this.targetMarker.visible=!!destination;
    if(destination)this.targetMarker.position.set(destination.x*SCALE,.11,destination.y*SCALE);
    const latest=sim.calls[0],callText=latest?`${latest.ticket} → ${latest.room.toUpperCase()}`:'PLEASE WAIT FOR YOUR TICKET';
    if(this.callSign&&this.callSign.userData.text!==callText){const c=this.callSign.userData.labelCanvas.getContext('2d');c.clearRect(0,0,512,80);c.fillStyle='#fff';c.fillRect(0,0,512,80);c.fillStyle='#355957';c.textAlign='center';c.textBaseline='middle';c.font='600 27px Segoe UI';c.fillText(callText,256,40);this.callSign.material.map.needsUpdate=true;this.callSign.userData.text=callText;}
    const live = new Set();
    for (const p of sim.patients) {
      if (p.state === 'DISCHARGED'&&!p.isPlayer) continue;
      live.add(p.id);
      if (!this.agents.has(p.id)) {
        const a = this.person(p.isPlayer?'#477cbe':priorityColors[p.priority]);
        a.group.userData.selection = { kind: 'patient', id: p.id }; a.group.position.copy(worldPoint(p.x, p.y));
        const ring = new THREE.Mesh(new THREE.RingGeometry(.4, .55, 24), new THREE.MeshBasicMaterial({ color: '#e6ad3e', side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = .1; a.group.add(ring); a.ring = ring;
        if(p.isPlayer){a.you=this.label('YOU',0,2.15,0,'#477cbe',1.3);a.you.userData.playerLabel=true;a.group.add(a.you);}
        this.scene.add(a.group); this.agents.set(p.id, a);
      }
      const a = this.agents.get(p.id), goal = worldPoint(p.x, p.y);
      // Render the fractional part of the clock along the same graph path.
      // This keeps 1× motion smooth without changing simulation timestamps.
      if (p.phase === 'moving') {
        let distance = sim.remainder * 20 * SCALE;
        for (const node of p.path) {
          const target = worldPoint(node.x, node.y), delta = target.clone().sub(goal), length = delta.length();
          if (length <= distance) { goal.copy(target); distance -= length; }
          else { goal.addScaledVector(delta, distance / length); break; }
        }
      }
      const movement = goal.clone().sub(a.group.position);
      if(sim.running)walkToward(a.group.position,goal,p.isPlayer?3:Math.max(1,Math.min(8,sim.speed)),dt);
      const traveling=Math.hypot(movement.x,movement.z)>.08;
      if(sim.running&&traveling)a.group.rotation.y=turn(a.group.rotation.y,Math.atan2(movement.x,movement.z),dt);
      a.ring.visible = selected?.id === p.id||p.isPlayer;
      const seated=p.phase==='queued'&&p.currentRoom==='waiting'&&!traveling;
      if(sim.running)a.group.position.y=damp(a.group.position.y,seated?-.43:0,5,dt);
      const walking=traveling;
      const staff=this.staff.get(p.serviceRoom)?.[sim.room(p.serviceRoom)?.occupants.indexOf(p)];
      if(sim.running&&!traveling&&p.phase==='service'&&staff){const delta=staff.group.position.clone().sub(a.group.position);a.group.rotation.y=turn(a.group.rotation.y,Math.atan2(delta.x,delta.z),dt);}
      if(!a.item){a.item=this.box(a.joints[3],0,-.5,.1,.25,.035,.18,'#fff4d6');}
      a.item.visible=p.phase==='service'&&[0,1,8,9].includes(p.stage);
      const stride=this.animationTime*6;
      if(sim.running)a.joints.forEach((joint,i)=>{
        let pose=seated&&i%2===0?-1.35:walking?Math.sin(stride+(i<2?0:Math.PI))*(i%2?1:-1)*.28:p.phase==='service'&&i%2===1?-.65:0;
        if(!walking&&p.phase==='service'&&[1,5,8].includes(p.stage)&&i===3)pose=-.6+Math.sin(this.animationTime*2)*.1;
        joint.rotation.x=damp(joint.rotation.x,pose,7,dt);
      });
    }
    for (const [id, a] of this.agents) if (!live.has(id)) { this.scene.remove(a.group); a.ring.geometry.dispose(); a.ring.material.dispose(); this.agents.delete(id); }
    for (const [id, floor] of this.floors) {
      floor.material = this.material(selected?.id === id ? '#badbce' : sim.room(id).color);
    }
    if (this.followId) {
      const a = this.agents.get(this.followId);
      if (a) { const target = a.group.position.clone().add(new THREE.Vector3(0, 1, 0));if(this.playerActive&&this.followId===this.playerId){const next=this.controls.target.clone().lerp(target,1-Math.exp(-dt*5));const offset=next.clone().sub(this.controls.target);this.controls.target.copy(next);this.camera.position.add(offset);}else{this.controls.target.lerp(target, .12); this.camera.position.lerp(target.clone().add(new THREE.Vector3(3, 3, 5)), .08);} }
      else this.followId = null;
    }
    this.animateStaff(sim,dt);
    this.controls.update();
    for(const label of this.labels){if(!label.userData.playerLabel){const distance=this.camera.position.distanceTo(label.position);label.material.opacity=this.playerActive?Math.min(1,Math.max(0,(distance-9)/7)):1;}}
    this.renderer.render(this.scene, this.camera);
  }
}
