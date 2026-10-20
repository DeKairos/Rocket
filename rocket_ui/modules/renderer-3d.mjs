import * as T from '../vendor/three/three.module.js';
import {samplePose} from './flight-data.mjs';

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
function groundHeight(world,x){
  const points=world.terrain;
  if(x<=points[0][0])return points[0][1];
  for(let i=1;i<points.length;i++)if(x<=points[i][0]){
    const a=points[i-1],b=points[i],t=(x-a[0])/(b[0]-a[0]);return a[1]+t*(b[1]-a[1]);
  }
  return points.at(-1)[1];
}
function surfaceTexture(){
  const bytes=new Uint8Array(128*128*4);
  for(let i=0;i<128*128;i++){const v=100+random(i)*85;bytes[i*4]=v;bytes[i*4+1]=v;bytes[i*4+2]=v;bytes[i*4+3]=255;}
  const texture=new T.DataTexture(bytes,128,128);texture.wrapS=texture.wrapT=T.RepeatWrapping;
  texture.repeat.set(.16,.16);texture.needsUpdate=true;return texture;
}
function makeCraft(frame,color=0xff7a43,ghost=false){
  const root=new T.Group(), craft=new T.Group();root.add(craft);
  const c=Math.cos(-frame.angle),s=Math.sin(-frame.angle),pos=frame.position;
  const local=frame.bodies[0].map(([x,y])=>[(x-pos[0])*c-(y-pos[1])*s,(x-pos[0])*s+(y-pos[1])*c]);
  const hull=material(ghost?0x5ed4e6:0xd2d1c6,{transparent:ghost,opacity:ghost?.35:1,wireframe:ghost});
  mesh(shapeGeometry(local,.46),hull,craft);
  if(!ghost){
    mesh(new T.BoxGeometry(1.04,.13,.48),material(color),craft,0,-.06,0);
    const ring=mesh(new T.CylinderGeometry(.16,.16,.07,24),material(0x26343c),craft,0,.22,.27);ring.rotation.x=Math.PI/2;
    const window=mesh(new T.CircleGeometry(.12,24),material(0x68bbce,{emissive:0x174d65,emissiveIntensity:.7,metalness:.65,roughness:.18}),craft,0,.22,.309);
    mesh(new T.CylinderGeometry(.13,.21,.24,20,1,true),material(0x30363b),craft,0,-.46,0);
    mesh(new T.BoxGeometry(.04,.28,.04),material(0x7d8483),craft,.28,.64,0);
    const dish=mesh(new T.SphereGeometry(.1,12,8),material(0xc4d0ca),craft,.28,.8,0);dish.scale.y=.3;
    for(const x of [-.38,.38])mesh(new T.BoxGeometry(.09,.05,.07),material(0xf8d5a3),craft,x,.4,.25);
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
  const craft=makeCraft(flight.frames[0]);scene.add(craft.root);
  const trail=trailFor(flight,0xff8659);scene.add(trail);
  const ghost=reference?makeCraft(reference.frames[0],0x60d6e9,true):null;
  const refTrail=reference?trailFor(reference,0x60d6e9,true):null;
  if(ghost){scene.add(ghost.root);scene.add(refTrail);}
  const dustArray=new Float32Array(160*3),dustGeo=new T.BufferGeometry();dustGeo.setAttribute('position',new T.BufferAttribute(dustArray,3));
  const dust=new T.Points(dustGeo,new T.PointsMaterial({color:0xd3c4a7,size:.06,transparent:true,opacity:.38,depthWrite:false}));scene.add(dust);
  const camera=new T.PerspectiveCamera(46,1,.05,250);let cameraReady=false;
  function update(step,options={}){
    const pose=samplePose(flight,step);craft.update(pose);
    trail.geometry.setDrawRange(0,Math.min(flight.frames.length,Math.floor(step)+1));
    if(ghost){ghost.root.visible=refTrail.visible=!options.split;ghost.update(samplePose(reference,step));refTrail.geometry.setDrawRange(0,Math.min(reference.frames.length,Math.floor(step)+1));}
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
    if(!cameraReady||surface){camera.position.copy(desired);cameraReady=true;}else camera.position.lerp(desired,.065);
    camera.lookAt(target);
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
