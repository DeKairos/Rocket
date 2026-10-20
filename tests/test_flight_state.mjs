import {test} from 'node:test';
import assert from 'node:assert/strict';
const mod = await import('../rocket_ui/modules/flight-state.mjs').catch(() => ({}));

function flight(id='root', pushes=[]) {
  return {revision_id:id, context_id:'context', policy:'trained', seed:100, fps:50,
    steps:100, reward:20, outcome:'landed', model_steps:1000, interventions:pushes,
    world:{width:20,height:13.333,pad:[8,12,3.333],terrain:[[0,3],[20,3]]},
    frames:Array.from({length:101},(_,step)=>({step,position:[10+step/100,10-step/20],
      velocity:[.5,-1], angle:0, action:step<50?2:0, reward:step/5, contacts:[step>90,step>92],
      bodies:[[[9,9],[10,10],[11,9]],[[9,8],[9,9],[9.2,9]],[[11,8],[11,9],[11.2,9]]],decision:null}))};
}

test('state controller is available independently of DOM and graphics',()=> {
  assert.equal(typeof mod.FlightController,'function');
});

test('push preserves original records, exact context, and rewind discards future pushes',async()=>{
  const queries=[];
  const controller=new mod.FlightController(async url=>{
    const q=new URLSearchParams(url.split('?')[1]); queries.push(q);
    const pushes=JSON.parse(q.get('interventions')||'[]');
    return flight('revision-'+queries.length,pushes);
  });
  await controller.launch('trained',100);
  const original=controller.state.flights[0];
  controller.seek(10); await controller.push(1);
  controller.seek(20); await controller.push(-1);
  assert.equal(controller.state.records.get(original.revision_id),original);
  assert.equal(Object.isFrozen(original.frames[0].position),true);
  assert.equal(original.interventions.length,0);
  controller.seek(5); await controller.push(-1);
  assert.deepEqual(controller.state.flights[0].interventions,[{step:5,direction:-1}]);
  assert.equal(queries.at(-1).get('expected_context_id'),'context');
  assert.equal(controller.state.history.length,4);
  await controller.compareWithoutPush();
  assert.equal(controller.state.flights.length,2);
  assert.deepEqual(controller.state.flights[1].interventions,[]);
  const pair=controller.state.history[0];
  controller.select(pair);
  assert.equal(controller.state.flights.length,2);
  assert.equal(controller.state.comparison,'counterfactual');
});

test('failed push does not record an intervention and restores playback',async()=>{
  let fail=false;
  const c=new mod.FlightController(async()=>{if(fail)throw Error('Connection lost');return flight();});
  await c.launch('trained',100); c.seek(10); c.setPlaying(true); fail=true;
  await c.push(1);
  assert.equal(c.state.flights[0].interventions.length,0);
  assert.equal(c.state.history.length,1);
  assert.equal(c.state.playing,true); assert.equal(c.state.busy,false);
  assert.match(c.state.error,/Connection lost/);
});

test('selecting a record invalidates an older asynchronous response',async()=>{
  let resolve;
  const c=new mod.FlightController(async()=>flight());
  await c.launch('trained',100); const entry=c.state.history[0];
  c.request=()=>new Promise(r=>{resolve=r;});
  const pending=c.launch('trained',101);
  c.select(entry); resolve(flight('late'));
  await pending;
  assert.equal(c.state.flights[0].revision_id,'root');
  assert.equal(c.state.records.has('late'),false);
  assert.equal(c.state.busy,false);
});

test('counterfactual removes only latest push and rejects identity mismatch',async()=>{
  const pushes=[{step:10,direction:1},{step:20,direction:-1},{step:30,direction:1}];
  let requested;
  const c=new mod.FlightController(async url=>{
    requested=new URLSearchParams(url.split('?')[1]);
    return {...flight('ref'),context_id:'different'};
  });
  c.adopt([flight('disturbed',pushes)],'solo');
  await c.compareWithoutPush();
  assert.deepEqual(JSON.parse(requested.get('interventions')),pushes.slice(0,2));
  assert.equal(c.state.flights.length,1);
  assert.match(c.state.error,/context/i);
});

test('inspection restores prior play state unless the user changes playback',async()=>{
  const c=new mod.FlightController(async()=>flight()); await c.launch('trained',100);
  c.inspect(true); assert.equal(c.state.playing,false);
  c.inspect(false); assert.equal(c.state.playing,true);
  c.inspect(true); c.seek(12); c.inspect(false); assert.equal(c.state.playing,false);
  c.seek(99); c.setPlaying(true); c.advance(1);
  assert.equal(c.state.step,100); assert.equal(c.state.playing,false);
});
