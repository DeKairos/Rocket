import * as T from '../vendor/three/three.module.js';
import {samplePose,wreckagePose,terrainHeight as groundHeight,CRASH_SECONDS,crashAgeFor} from './flight-data.mjs';

const random=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
const preview={steps:0,fps:50,seed:0,world:{width:20,height:13.333,pad:[8,12,3.333],terrain:
  [[0,3],[2,4.1],[4,3.7],[6,3.9],[8,3.3],[10,3.3],[12,3.3],[14,3.8],[16,4.2],[18,4],[20,4.5]]},
  frames:[{position:[10,8],angle:.04,action:0,contacts:[false,false],
    bodies:[[[9.45,7.67],[10.55,7.67],[10.55,8],[10.45,8.56],[9.55,8.56],[9.45,8]],
      [[9.0,7.4],[9.12,7.35],[9.4,7.9],[9.27,7.95]],[[10.88,7.35],[11.0,7.4],[10.73,7.95],[10.6,7.9]]]}]};

function material(color,options={}){return new T.MeshStandardMaterial({color,roughness:.68,metalness:.3,...options});}
function mesh(geometry,mat,parent,x=0,y=0,z=0){const m=new T.Mesh(geometry,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function shapeGeometry(points,depth){
  const shape=new T.Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
  const g=new T.ExtrudeGeometry(shape,{depth,bevelEnabled:false});g.translate(0,0,-depth/2);return g;
}
function surfaceTexture(){
  const bytes=new Uint8Array(128*128*4);
  for(let i=0;i<128*128;i++){const v=100+random(i)*85;bytes[i*4]=v;bytes[i*4+1]=v;bytes[i*4+2]=v;bytes[i*4+3]=255;}
  const texture=new T.DataTexture(bytes,128,128);texture.wrapS=texture.wrapT=T.RepeatWrapping;
  texture.repeat.set(1.8,1.8);texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.anisotropy=4;texture.needsUpdate=true;return texture;
}
function scorchedTexture(color){
  const rgb=new T.Color(color).convertLinearToSRGB(),bytes=new Uint8Array(128*128*4);
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){
    const i=(y*128+x)*4,noise=random(x+y*128),u=x/128,v=y/128;
    const soot=Math.max(0,1-Math.hypot((u-.3)*1.5,(v-.18)*1.3));
    const stain=.32+.68*(1-soot*soot),scratch=noise>.987&&x%7<2;
    const shade=scratch?.48:stain*(.8+noise*.2);
    bytes[i]=Math.min(255,rgb.r*255*shade+noise*12);bytes[i+1]=Math.min(255,rgb.g*255*shade+noise*10);bytes[i+2]=Math.min(255,rgb.b*255*shade+noise*8);bytes[i+3]=255;
  }
  const map=new T.DataTexture(bytes,128,128);map.colorSpace=T.SRGBColorSpace;map.magFilter=T.LinearFilter;map.needsUpdate=true;return map;
}
function bentGeometry(geometry,amount=.035){
  const p=geometry.attributes.position;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    p.setXYZ(i,x+amount*Math.sin(y*26+z*7),y-amount*Math.cos(x*19),z+amount*Math.sin(x*18+y*11));
  }p.needsUpdate=true;geometry.computeVertexNormals();return geometry;
}
function detailedOutline(points){return points.flatMap((p,i)=>{const q=points[(i+1)%points.length];return Array.from({length:5},(_,j)=>p.map((v,k)=>v+(q[k]-v)*j/5));});}
function softTexture(){
  const bytes=new Uint8Array(64*64*4);
  for(let y=0;y<64;y++)for(let x=0;x<64;x++){
    const i=(y*64+x)*4,r=Math.hypot(x-32,y-32)/32;
    bytes[i]=bytes[i+1]=bytes[i+2]=155;
    bytes[i+3]=Math.max(0,1-r)**2*(.65+.35*Math.sin(x*.34)*Math.sin(y*.27))*255;
  }
  const map=new T.DataTexture(bytes,64,64);map.magFilter=T.LinearFilter;map.needsUpdate=true;return map;
}
function makeCraft(frame,color=0xff7a43,ghost=false,damaged=false){
  const root=new T.Group(), craft=new T.Group();root.add(craft);
  const c=Math.cos(-frame.angle),s=Math.sin(-frame.angle),pos=frame.position;
  const local=frame.bodies[0].map(([x,y])=>[(x-pos[0])*c-(y-pos[1])*s,(x-pos[0])*s+(y-pos[1])*c]);
  const paint=color=>damaged&&!ghost?material(0xffffff,{map:scorchedTexture(color),roughness:.84,metalness:.5}):material(color);
  const hull=ghost?material(0x5ed4e6,{transparent:true,opacity:.35,wireframe:true}):damaged?paint(0xd2d1c6):material(0xd2d1c6);
  mesh(damaged?bentGeometry(shapeGeometry(detailedOutline(local),.46),.065):shapeGeometry(local,.46),hull,craft);
  if(!ghost){
    mesh(damaged?bentGeometry(new T.BoxGeometry(1.04,.13,.48,16,2,4),.05):new T.BoxGeometry(1.04,.13,.48),paint(color),craft,0,-.06,0);
    const ring=mesh(new T.CylinderGeometry(.16,.16,.07,24),material(0x26343c),craft,0,.22,.27);ring.rotation.x=Math.PI/2;
    const window=mesh(new T.CircleGeometry(.12,24),material(damaged?0x26353b:0x68bbce,{emissive:damaged?0:0x174d65,emissiveIntensity:.7,metalness:.65,roughness:damaged?.65:.18}),craft,0,.22,.309);
    if(damaged){ring.scale.set(1,.72,1);window.scale.set(1,.72,1);}
    const nozzle=new T.CylinderGeometry(.13,.21,.24,24,6,true);
    mesh(damaged?bentGeometry(nozzle,.045):nozzle,damaged?paint(0x676074):material(0x30363b),craft,0,-.46,0);
    mesh(new T.BoxGeometry(.04,.28,.04),material(0x7d8483),craft,.28,.64,0);
    const dish=mesh(new T.SphereGeometry(.1,12,8),material(0xc4d0ca),craft,.28,.8,0);dish.scale.y=.3;
    for(const x of [-.38,.38])mesh(new T.BoxGeometry(.09,.05,.07),material(0xf8d5a3),craft,x,.4,.25);
    if(damaged){
      const hole=mesh(shapeGeometry([[-.18,-.18],[.18,-.22],[.25,.03],[.11,.15],[-.2,.07]],.018),material(0x101518,{roughness:1}),craft,.12,-.08,.3);
      for(let i=0;i<4;i++){
        const pipe=mesh(new T.CylinderGeometry(.018,.018,.28,7),paint(0x6d7478),craft,.03+i*.055,-.08,.33);pipe.rotation.z=(i-1.5)*.2;
      }
      const cable=new T.CatmullRomCurve3([new T.Vector3(.22,.03,.34),new T.Vector3(.37,-.12,.36),new T.Vector3(.25,-.34,.31)]);
      mesh(new T.TubeGeometry(cable,12,.012,6,false),material(0x1a2022),craft);
      const cracks=new T.BufferGeometry().setFromPoints([new T.Vector3(-.08,.24,.313),new T.Vector3(.06,.19,.313),new T.Vector3(.06,.19,.313),new T.Vector3(.09,.29,.313)]);
      craft.add(new T.LineSegments(cracks,new T.LineBasicMaterial({color:0x080e11})));
    }
  }
  const legs=frame.bodies.slice(1).map(points=>{
    const center=points.reduce((a,p)=>[a[0]+p[0]/points.length,a[1]+p[1]/points.length],[0,0]);
    const heading=Math.atan2(points[1][1]-points[0][1],points[1][0]-points[0][0]);
    const m=mesh(shapeGeometry(points.map(p=>[p[0]-center[0],p[1]-center[1]]),.15),material(ghost?0x5ed4e6:0x929d99,{wireframe:ghost,transparent:ghost,opacity:ghost?.5:1}),root);
    return {mesh:m,heading};
  });
  const fire=new T.Group();craft.add(fire);fire.position.y=-.62;
  const plume=mesh(new T.CylinderGeometry(.12,0,1.2,18),new T.MeshBasicMaterial({color:0xff854a,transparent:true,opacity:.7,depthWrite:false}),fire,0,-.55,0);
  mesh(new T.CylinderGeometry(.075,0,.62,14),new T.MeshBasicMaterial({color:0xfff0bb}),fire,0,-.24,0);
  const glow=new T.PointLight(0xffa360,7,6,2);glow.position.set(0,-.45,.35);fire.add(glow);
  const side=new T.Group();craft.add(side);
  mesh(new T.ConeGeometry(.08,.5,10),new T.MeshBasicMaterial({color:0xffcc8a}),side);
  function update(pose){
    craft.position.set(...pose.position,0);craft.rotation.z=pose.angle;
    pose.bodies.slice(1).forEach((points,i)=>{
      const center=points.reduce((a,p)=>[a[0]+p[0]/points.length,a[1]+p[1]/points.length],[0,0]);
      legs[i].mesh.position.set(...center,0);
      legs[i].mesh.rotation.z=Math.atan2(points[1][1]-points[0][1],points[1][0]-points[0][0])-legs[i].heading;
    });
    fire.visible=!ghost&&!pose.complete&&pose.frame.action===2;
    fire.scale.y=.86+random(pose.frame.step||0)*.3;
    side.visible=!ghost&&!pose.complete&&(pose.frame.action===1||pose.frame.action===3);
    side.position.set(pose.frame.action===1?-.75:.75,.12,0);
    side.rotation.z=pose.frame.action===1?Math.PI/2:-Math.PI/2;
  }
  return {root,craft,update};
}
function trailFor(flight,color,dashed=false){
  const vertices=flight.frames.map(f=>new T.Vector3(f.position[0],f.position[1],-.12));
  const geometry=new T.BufferGeometry().setFromPoints(vertices);
  const mat=dashed?new T.LineDashedMaterial({color,dashSize:.2,gapSize:.18,transparent:true,opacity:.65}):new T.LineBasicMaterial({color,transparent:true,opacity:.6});
  const line=new T.Line(geometry,mat);if(dashed)line.computeLineDistances();return line;
}
function makeWreck(flight,ghost=false){
  if(flight.outcome!=='crashed')return null;
  const root=new T.Group();root.name=ghost?'reference-wreckage':'crash-wreckage';root.visible=false;
  const parts=wreckagePose(flight,0).map((piece,i)=>mesh(bentGeometry(shapeGeometry(detailedOutline(piece.points),piece.kind==='leg'?.055:.018),.025),
    material(ghost?0x60d6e9:0xffffff,
      {map:ghost?null:scorchedTexture(piece.kind==='leg'?0x626b71:i===2?0xdc7948:0xbab7a9),roughness:.83,metalness:.6,wireframe:ghost,transparent:ghost,opacity:ghost?.45:1}),root));
  const impact=flight.frames.at(-1).position;
  // Keep the same fuselage, band, window and nozzle; crush their geometry in place.
  const core=makeCraft(flight.frames[0],0xff7a43,ghost,true);core.root.name='collapsed-craft';core.craft.name='crushed-fuselage';root.add(core.root);
  core.update(samplePose(flight,flight.steps));
  core.root.children.filter(child=>child!==core.craft).forEach(leg=>{leg.visible=false;});
  const base=groundHeight(flight.world,impact[0]);
  const haze=softTexture();
  const scorch=mesh(new T.PlaneGeometry(3.1,2.3),new T.MeshBasicMaterial({color:0x101211,map:haze,transparent:true,opacity:.8,depthWrite:false}),root,
    impact[0],base+.018,0);scorch.rotation.x=-Math.PI/2;scorch.castShadow=false;scorch.visible=!ghost;
  const rimGeometry=new T.RingGeometry(.5,1.25,48,5);rimGeometry.rotateX(-Math.PI/2);
  const rimPositions=rimGeometry.attributes.position;
  for(let i=0;i<rimPositions.count;i++){
    const x=rimPositions.getX(i),z=rimPositions.getZ(i),r=Math.hypot(x,z),angle=Math.atan2(z,x);
    rimPositions.setY(i,groundHeight(flight.world,impact[0]+x)-base+.008+Math.sin((r-.5)/.75*Math.PI)*(.075+.035*Math.sin(angle*9)));
  }rimGeometry.computeVertexNormals();
  const rim=mesh(rimGeometry,material(0x62605a,{roughness:1,metalness:0,map:surfaceTexture(),side:T.DoubleSide}),root,impact[0],base,0);rim.visible=!ghost;
  const smoke=Array.from({length:7},(_,i)=>{
    const puff=new T.Sprite(new T.SpriteMaterial({map:haze,color:0x899196,transparent:true,opacity:.12,depthWrite:false}));root.add(puff);return puff;
  });
  const clouds=[{count:8,color:0xe9a76a,size:.018,life:.45},{count:40,color:0x8d887c,size:.065,life:CRASH_SECONDS}].map(spec=>{
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(new Float32Array(spec.count*3),3));
    const points=new T.Points(geometry,new T.PointsMaterial({color:spec.color,size:spec.size,transparent:true,depthWrite:false}));root.add(points);
    return {...spec,points};
  });
  const flash=new T.PointLight(0xffaf60,0,5);flash.position.set(impact[0],impact[1]+.3,.5);root.add(flash);
  function update(age,reducedMotion){
    const time=reducedMotion?CRASH_SECONDS:Math.max(0,Math.min(CRASH_SECONDS,age));
    wreckagePose(flight,time).forEach((piece,i)=>{parts[i].position.set(...piece.position);parts[i].rotation.set(...piece.rotation);});
    const collapse=Math.min(1,time/.65);
    core.craft.position.set(impact[0],impact[1]*(1-collapse)+(base+.43)*collapse,0);
    core.craft.rotation.set(-.22*collapse,.18*collapse,flight.frames.at(-1).angle+.58*collapse);
    core.craft.scale.set(1,.98-.36*collapse,1-.12*collapse);
    smoke.forEach((puff,i)=>{
      const rise=(i/7+time*.22)%1;
      puff.position.set(impact[0]+.12+Math.sin(i+time*.4)*rise*.16,base+.35+rise*.95,.1);
      const size=.13+rise*.38;puff.scale.set(size,size*1.45,1);
      puff.material.opacity=(1-rise)*.13;puff.visible=!ghost&&!reducedMotion&&time>.15;
    });
    for(const cloud of clouds){
      cloud.points.visible=!ghost&&!reducedMotion&&time<cloud.life;
      cloud.points.material.opacity=Math.max(0,1-time/cloud.life)*.28;
      const positions=cloud.points.geometry.attributes.position;
      for(let i=0;i<cloud.count;i++){
        const angle=random(i+4100)*Math.PI*2,speed=.15+random(i+4200)*.75;
        const x=impact[0]+Math.cos(angle)*speed*time;
        positions.setXYZ(i,x,Math.max(groundHeight(flight.world,x)+.06,base+.12+random(i+4300)*.6*time-time*time),Math.sin(angle)*speed*time);
      }positions.needsUpdate=true;
    }
    flash.intensity=ghost||reducedMotion?0:Math.max(0,1-time/.35)*.8;
  }
  return {root,update};
}
export function buildFlightScene(input,reference=null){
  const flight=input||preview,world=flight.world;
  const scene=new T.Scene();scene.background=new T.Color(0x060a10);scene.fog=new T.FogExp2(0x0a1119,.009);
  scene.add(new T.HemisphereLight(0xabc4dc,0x39352f,.85));
  const sun=new T.DirectionalLight(0xffe4b6,3.3);sun.position.set(-20,30,12);sun.castShadow=true;
  Object.assign(sun.shadow.camera,{left:-35,right:35,top:35,bottom:-35,near:1,far:120});
  sun.shadow.mapSize.set(1024,1024);sun.shadow.normalBias=.035;scene.add(sun);
  const fill=new T.DirectionalLight(0x7aa4d0,.7);fill.position.set(20,12,-15);scene.add(fill);
  const texture=surfaceTexture();
  // Extend only the scenery: the recorded collision contour at z=0 stays exact.
  const terrain=[[-180,-12],[-180,world.terrain[0][1]],...world.terrain,[180,world.terrain.at(-1)[1]],[180,-12]];
  const ground=mesh(shapeGeometry(terrain,300),material(0x777d80,{map:texture,roughness:1,metalness:0}),scene);ground.position.z=-75;
  // Layered ridgelines close the horizon, well behind the simulation plane.
  for(let layer=0;layer<3;layer++){
    const ridge=[[-180,-10]];
    for(let i=0;i<=60;i++)ridge.push([-180+i*6,5+layer*2+random(i+layer*91+5100)*(5+layer*3)]);
    ridge.push([180,-10]);
    mesh(shapeGeometry(ridge,12),material([0x4d535c,0x39424e,0x303d4a][layer],{roughness:1,metalness:0}),scene,0,0,-55-layer*25);
  }
  // Distant rocks are off the craft's motion plane and purely decorative.
  for(let i=0;i<95;i++){
    const x=-55+random(i+201)*130,z=-5-random(i+302)*65,r=.08+random(i+401)*.48;
    const rock=mesh(new T.IcosahedronGeometry(r,1),material(0x666f76,{map:texture,roughness:1}),scene,x,groundHeight(world,x)+r*.28,z);
    rock.scale.set(1.5,.65,1);rock.rotation.set(random(i),random(i+1)*4,random(i+2));
  }
  const pad=mesh(new T.BoxGeometry(world.pad[1]-world.pad[0],.04,1.9),material(0x343a3d,{metalness:.6}),scene,(world.pad[0]+world.pad[1])/2,world.pad[2]-.02,0);
  for(const x of [world.pad[0],world.pad[1]]){
    mesh(new T.CylinderGeometry(.025,.025,.5,6),material(0xd5d9ce),scene,x,world.pad[2]+.25,.8);
    mesh(new T.SphereGeometry(.055,8,6),new T.MeshBasicMaterial({color:0xffa064}),scene,x,world.pad[2]+.52,.8);
  }
  const starPositions=new Float32Array(700*3);
  for(let i=0;i<700;i++){starPositions[i*3]=(random(i+800)-.5)*180;starPositions[i*3+1]=18+random(i+1500)*75;starPositions[i*3+2]=-40-random(i+2200)*60;}
  const starGeo=new T.BufferGeometry();starGeo.setAttribute('position',new T.BufferAttribute(starPositions,3));
  scene.add(new T.Points(starGeo,new T.PointsMaterial({color:0xc4d3e1,size:.09,transparent:true,opacity:.6})));
  const planet=mesh(new T.SphereGeometry(4.5,32,24),material(0x567789,{emissive:0x101a26,roughness:1}),scene,-20,29,-85);
  const craft=makeCraft(flight.frames[0]);craft.root.name='flight-craft';scene.add(craft.root);
  const wreck=makeWreck(flight);if(wreck)scene.add(wreck.root);
  const trail=trailFor(flight,0xff8659);scene.add(trail);
  const ghost=reference?makeCraft(reference.frames[0],0x60d6e9,true):null;
  const refTrail=reference?trailFor(reference,0x60d6e9,true):null;
  if(ghost){scene.add(ghost.root);scene.add(refTrail);}
  const refWreck=reference?makeWreck(reference,true):null;if(refWreck)scene.add(refWreck.root);
  const dustArray=new Float32Array(160*3),dustGeo=new T.BufferGeometry();dustGeo.setAttribute('position',new T.BufferAttribute(dustArray,3));
  const dust=new T.Points(dustGeo,new T.PointsMaterial({color:0xd3c4a7,size:.06,transparent:true,opacity:.38,depthWrite:false}));scene.add(dust);
  const camera=new T.PerspectiveCamera(46,1,.05,250),cameraTarget=new T.Vector3();let cameraReady=false;
  function update(step,options={}){
    const pose=samplePose(flight,step);craft.update(pose);
    const ageFor=f=>crashAgeFor(f,step,options);
    if(wreck){wreck.root.visible=pose.complete;craft.root.visible=!pose.complete;if(pose.complete)wreck.update(ageFor(flight),options.reducedMotion);}
    trail.geometry.setDrawRange(0,Math.min(flight.frames.length,Math.floor(step)+1));
    if(ghost){ghost.root.visible=refTrail.visible=!options.split;ghost.update(samplePose(reference,step));refTrail.geometry.setDrawRange(0,Math.min(reference.frames.length,Math.floor(step)+1));}
    if(refWreck){const complete=step>=reference.steps;refWreck.root.visible=complete&&!options.split;ghost.root.visible=!complete&&!options.split;if(complete)refWreck.update(ageFor(reference),options.reducedMotion);}
    const altitude=pose.position[1]-world.pad[2];
    dust.visible=!options.reducedMotion&&!pose.complete&&pose.frame.action===2&&altitude<4;
    if(dust.visible){
      for(let i=0;i<160;i++){const age=(step*.025+random(i+3000))%1,sign=i%2?1:-1;
        dustArray[i*3]=pose.position[0]+sign*age*(1+random(i+3200)*3);
        dustArray[i*3+1]=groundHeight(world,pose.position[0])+.06+Math.sin(age*Math.PI)*(.12+random(i+3400)*.3);
        dustArray[i*3+2]=(random(i+3600)-.5)*age*6;
      }dustGeo.attributes.position.needsUpdate=true;
    }
    if(options.inspect&&cameraReady)return;
    const surface=options.camera==='surface'||options.reducedMotion;
    const target=new T.Vector3((world.pad[0]+world.pad[1])/2,world.pad[2]+4.4,0);
    let desired=new T.Vector3(target.x+7,target.y+6,25);
    if(!surface){target.x=pose.position[0]*.5+target.x*.5;target.y=(pose.position[1]+world.pad[2])/2+1;
      desired.set(target.x+5.5,target.y+4.4,Math.max(17,Math.abs(altitude)*1.22+8));}
    if(!surface&&wreck&&pose.complete){
      target.set(pose.position[0],groundHeight(world,pose.position[0])+.6,0);
      desired.set(target.x+2.2,target.y+1.9,6.8);
    }
    if(!cameraReady||surface){camera.position.copy(desired);cameraTarget.copy(target);cameraReady=true;}
    else{camera.position.lerp(desired,.065);cameraTarget.lerp(target,.065);}
    camera.lookAt(cameraTarget);
  }
  function dispose(){
    const geometries=new Set(),materials=new Set(),textures=new Set();
    scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of (Array.isArray(o.material)?o.material:[o.material])){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
  }
  return {scene,camera,craft:craft.craft,update,dispose};
}

export function create3DRenderer(canvas){
  const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,1.75));
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;
  renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  let views=[],width=1,height=1;
  function setFlights(flights){views.forEach(v=>v.dispose());views=flights.length?flights.map((f,i)=>buildFlightScene(f,i===0?flights[1]:null)):[buildFlightScene(null)];}
  function resize(){const box=canvas.parentElement.getBoundingClientRect();width=Math.max(1,box.width);height=Math.max(1,box.height);renderer.setSize(width,height,false);}
  function render(step,options={}){
    const split=options.split&&views.length===2,count=split?2:1,w=width/count;
    renderer.setScissorTest(split);
    for(let i=0;i<count;i++){
      const view=views[i];view.update(step,options);view.camera.aspect=w/height;view.camera.updateProjectionMatrix();
      renderer.setViewport(i*w,0,w,height);if(split)renderer.setScissor(i*w,0,w,height);renderer.render(view.scene,view.camera);
    }renderer.setScissorTest(false);
  }
  setFlights([]);resize();
  return {setFlights,render,resize,dispose(){views.forEach(v=>v.dispose());renderer.dispose();}};
}
