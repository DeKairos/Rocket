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
    assert.ok(labels.includes('Pad landing confirmed.'));assert.ok(labels.includes('Hull impact.'));
    renderer.setFlights([{...f,outcome:'off_pad'},{...f,outcome:'unsafe_landing'}]);renderer.render(100);
    assert.ok(labels.includes('Landing pad missed.'));assert.ok(labels.includes('Touchdown not confirmed.'));
  }finally{globalThis.window=previous;}
});

test('crash wreckage is deterministic, settles on terrain and never changes recorded frames',()=>{
  assert.equal(typeof data.wreckagePose,'function');
  const f={...fixture,outcome:'crashed',seed:107,world:{pad:[8,12,3],terrain:[[0,3],[20,3]]},frames:fixture.frames.map(frame=>({...frame,bodies:[[[3.5,4],[4.5,4],[4.5,5],[3.5,5]],[[3,3],[3.1,3],[3.1,3.6]],[[5,3],[5.1,3],[5.1,3.6]]]}))};
  const before=JSON.stringify(f);
  const impact=data.wreckagePose(f,0),burst=data.wreckagePose(f,.4),settled=data.wreckagePose(f,1.8);
  assert.ok(impact.length>=6);assert.notDeepEqual(impact,burst);
  assert.deepEqual(burst,data.wreckagePose(f,.4));
  assert.deepEqual(settled,data.wreckagePose(f,100));
  assert.deepEqual(settled,data.wreckagePose(f,0,true));
  assert.ok(settled.every(p=>p.position[1]>=3&&p.position[1]<3.3));
  for(const outcome of ['landed','off_pad','unsafe_landing','timeout','out_of_bounds'])assert.equal(data.wreckagePose({...f,outcome},1),null);
  assert.equal(JSON.stringify(f),before);
});

test('cosmetic crash clock runs after the last frame, freezes for inspection and resets on rewind',()=>{
  assert.equal(typeof data.CrashPlaybackClock,'function');
  const clock=new data.CrashPlaybackClock();
  const f={...fixture,outcome:'crashed',revision_id:'crash'};
  const state={flights:[f],step:1,inspection:false};
  clock.tick(state,.02,true);
  state.step=2;
  assert.equal(clock.tick(state,.02,true).age,0);
  assert.ok(clock.tick(state,.2,false).age>0);
  state.inspection=true;const held=clock.tick(state,.2,false).age;
  assert.equal(clock.tick(state,.2,false).age,held);
  state.inspection=false;assert.ok(clock.tick(state,.2,false).age>held);
  state.step=0;clock.tick(state,.1,false);state.step=2;
  assert.equal(clock.tick(state,.1,false).age,1.8); // A seek shows the settled wreck.
  state.step=0;clock.tick(state,.1,true);state.step=2;
  assert.equal(clock.tick(state,.1,true,true).age,1.8);
  assert.equal(state.step,2);
});

test('3D crashes replace the intact craft, hold wreckage and restore on rewind',async()=>{
  const {buildFlightScene}=await import('../rocket_ui/modules/renderer-3d.mjs');
  const f={...fixture,outcome:'crashed',seed:107,world:{width:20,height:13.333,pad:[8,12,3],terrain:[[0,3],[20,3]]},frames:fixture.frames.map(frame=>({...frame,bodies:[[[3.5,4],[4.5,4],[4,5]],[[3,3],[3.1,3],[3,3.6]],[[5,3],[5.1,3],[5,3.6]]]}))};
  const view=buildFlightScene(f);
  const root=view.scene.getObjectByName('flight-craft'),wreck=view.scene.getObjectByName('crash-wreckage');
  assert.ok(root&&wreck);
  view.update(1);assert.equal(root.visible,true);assert.equal(wreck.visible,false);
  view.update(2,{crashAge:.4});assert.equal(root.visible,false);assert.equal(wreck.visible,true);
  const burst=wreck.children[0].position.toArray();
  view.update(2,{crashAge:1.8});assert.notDeepEqual(wreck.children[0].position.toArray(),burst);
  const settled=wreck.children[0].position.toArray();
  view.update(2,{crashAge:0,reducedMotion:true});assert.deepEqual(wreck.children[0].position.toArray(),settled);
  view.update(0);assert.equal(root.visible,true);assert.equal(wreck.visible,false);
  view.dispose();
});

test('shorter crashed comparisons finish their cosmetic tail after the shared timeline ends',()=>{
  assert.equal(typeof data.crashAgeFor,'function');
  const f={...fixture,outcome:'crashed',steps:99,fps:50,revision_id:'short'};
  const other={...fixture,outcome:'landed',steps:100,fps:50,revision_id:'long'};
  const clock=new data.CrashPlaybackClock();
  const state={flights:[f,other],step:99,inspection:false};clock.tick(state,.02,true);
  state.step=100;const start=clock.tick(state,.02,true);
  assert.equal(start.age,0);
  assert.equal(data.crashAgeFor(f,100,{endStep:100,crashAge:start.age}),.02);
  const later=clock.tick(state,.5,false);
  assert.ok(data.crashAgeFor(f,100,{endStep:100,crashAge:later.age})>.5);
  assert.equal(data.crashAgeFor(f,100,{endStep:100,crashAge:1.8}),1.8);
  assert.equal(data.crashAgeFor(f,99,{endStep:100,crashAge:1.8}),0);
});

test('wreckage remains close to impact and uses torn shell strips instead of solid wedges',()=>{
  const f={...fixture,outcome:'crashed',seed:107,world:{pad:[8,12,3],terrain:[[0,3],[20,3]]},frames:fixture.frames.map(frame=>({...frame,bodies:[[[3.5,4],[4.5,4],[4.5,5],[3.5,5]],[[3,3],[3.1,3],[3.1,3.6]],[[5,3],[5.1,3],[5.1,3.6]]]}))};
  const impact=data.wreckagePose(f,0),rest=data.wreckagePose(f,1.8);
  assert.ok(impact.filter(p=>p.kind==='hull').every(p=>p.points.length===4));
  assert.ok(rest.every((p,i)=>Math.abs(p.position[0]-impact[i].position[0])<1));
});

test('damaged comparison references remain transparent wireframe',async()=>{
  const {buildFlightScene}=await import('../rocket_ui/modules/renderer-3d.mjs');
  const f={...fixture,outcome:'crashed',seed:107,world:{width:20,height:13.333,pad:[8,12,3],terrain:[[0,3],[20,3]]},frames:fixture.frames.map(frame=>({...frame,bodies:[[[3.5,4],[4.5,4],[4,5]],[[3,3],[3.1,3],[3,3.6]],[[5,3],[5.1,3],[5,3.6]]]}))};
  const view=buildFlightScene(f,f);view.update(2,{reducedMotion:true});
  const hull=view.scene.getObjectByName('reference-wreckage').getObjectByName('crushed-fuselage').children[0];
  assert.equal(hull.material.wireframe,true);assert.ok(hull.material.opacity<1);
  view.dispose();
});
