import {test} from 'node:test';
import assert from 'node:assert/strict';
const data=await import('../rocket_ui/modules/flight-data.mjs').catch(()=>({}));
const fixture={steps:2,fps:50,world:{pad:[8,12,3]},frames:[
  {step:0,position:[0,9],angle:0,velocity:[1,-2],reward:0,action:0,contacts:[false,false],bodies:[[[0,0]]]},
  {step:1,position:[2,7],angle:.2,velocity:[2,-3],reward:4,action:2,contacts:[false,false],bodies:[[[2,2]]]},
  {step:2,position:[4,5],angle:.4,velocity:[0,0],reward:7,action:2,contacts:[true,true],bodies:[[[4,4]]]}],
  interventions:[{step:1,direction:1}],outcome:'landed',reward:7};
test('pose interpolation is visual only and terminal pose holds',()=>{
  assert.equal(typeof data.samplePose,'function');
  const pose=data.samplePose(fixture,.5);
  assert.deepEqual(pose.position,[1,8]);
  assert.equal(pose.frame.step,0);
  assert.deepEqual(data.samplePose(fixture,8).position,[4,5]);
  assert.equal(data.samplePose(fixture,8).complete,true);
});
test('events aggregate engines and debrief statements link to measured frames',()=>{
  const events=data.eventsFor(fixture);
  assert.deepEqual(events.filter(e=>e.kind==='engine').map(e=>[e.from,e.to,e.action]),[[0,2,2]]);
  assert.equal(events.find(e=>e.kind==='contact').step,2);
  const notes=data.debriefFor(fixture);
  assert.ok(notes.some(n=>n.step===1 && /push/i.test(n.text)));
  assert.ok(notes.some(n=>n.step===2 && /landed/i.test(n.text)));
});
test('plot values and comparison use simulator units and independent terminal times',()=>{
  assert.deepEqual(data.plotValues(fixture,'altitude'),[6,4,2]);
  const other={...fixture,steps:1,reward:3,frames:fixture.frames.slice(0,2)};
  const metrics=data.comparisonMetrics(fixture,other);
  assert.equal(metrics.durationDelta,.02);
  assert.equal(metrics.rewardDelta,4);
  assert.equal(metrics.displacementDelta,2);
});

test('3D scene consumes exact recorded pose without a GPU',async()=>{
  const sceneModule=await import('../rocket_ui/modules/renderer-3d.mjs').catch(()=>({}));
  assert.equal(typeof sceneModule.buildFlightScene,'function');
  const f={...fixture,world:{width:20,height:13.333,pad:[8,12,3],terrain:[[0,3],[20,3]]},
    frames:fixture.frames.map(frame=>({...frame,bodies:[[[frame.position[0]-.5,frame.position[1]-.3],[frame.position[0]+.5,frame.position[1]-.3],[frame.position[0],frame.position[1]+.5]],[[0,0],[.1,0],[.1,.5]],[[1,0],[1.1,0],[1.1,.5]]]}))};
  const view=sceneModule.buildFlightScene(f);
  view.update(.5,{reducedMotion:false});
  assert.deepEqual(view.craft.position.toArray(),[1,8,0]);
  assert.equal(view.craft.rotation.z,.1);
  const cameraPosition=view.camera.position.toArray(),cameraRotation=view.camera.quaternion.toArray();
  view.update(1.5,{inspect:true});
  assert.deepEqual(view.camera.position.toArray(),cameraPosition);
  assert.deepEqual(view.camera.quaternion.toArray(),cameraRotation);
  view.update(100,{reducedMotion:true});
  assert.deepEqual(view.craft.position.toArray(),[4,5,0]);
  view.dispose();
});

test('graphics failure and context loss retain a functioning fallback host',async()=>{
  const hostModule=await import('../rocket_ui/modules/renderer-host.mjs').catch(()=>({}));
  assert.equal(typeof hostModule.RendererHost,'function');
  let event;
  const host=new hostModule.RendererHost({canvas3d:{hidden:false,addEventListener(_name,fn){event=fn;}},
    canvas2d:{hidden:true},create3D:async()=>{throw Error('No WebGL2');},
    create2D:()=>({setFlights(){},render(){},resize(){},dispose(){}})});
  await host.start();
  assert.equal(host.mode,'2D'); assert.equal(host.canvas2d.hidden,false);
  event({preventDefault(){}});
  assert.equal(host.mode,'2D');
});

test('2D fallback renders completed comparisons and their outcome labels',async()=>{
  const {create2DRenderer}=await import('../rocket_ui/modules/renderer-2d.mjs');
  const labels=[];
  const gradient={addColorStop(){}};
  const ctx=new Proxy({fillText(text){labels.push(text);},createLinearGradient(){return gradient;},createRadialGradient(){return gradient;}},{get(target,key){return target[key]||(()=>{});}});
  const canvas={getContext(){return ctx;},parentElement:{getBoundingClientRect(){return {width:1000,height:700};}}};
  const previous=globalThis.window;globalThis.window={devicePixelRatio:1};
  try{
    const renderer=create2DRenderer(canvas);
    const f={...fixture,policy:'trained',seed:100,world:{width:20,height:13.333,pad:[8,12,3],terrain:[[0,3],[20,3]]},frames:fixture.frames.map(frame=>({...frame,bodies:[[[0,0],[1,0],[0,1]],[[0,0],[.1,0],[0,.5]],[[1,0],[1.1,0],[1,.5]]]}))};
    renderer.resize();renderer.setFlights([f,{...f,outcome:'crashed'}]);renderer.render(100);
    assert.ok(labels.includes('Landing confirmed.'));assert.ok(labels.includes('Hull impact.'));
  }finally{globalThis.window=previous;}
});
