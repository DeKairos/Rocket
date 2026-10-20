// Numerical views use frames. Only samplePose interpolates presentation geometry.
export function frameAt(flight, step) {
  return flight.frames[Math.max(0, Math.min(flight.steps, Math.floor(step)))];
}

export function samplePose(flight, step) {
  const frame=frameAt(flight,step), next=frameAt(flight,step+1);
  const complete=step>=flight.steps, t=complete?0:Math.max(0,step%1);
  const lerp=(a,b)=>a+(b-a)*t;
  return {frame,complete,position:frame.position.map((v,i)=>lerp(v,next.position[i])),
    angle:lerp(frame.angle,next.angle),
    bodies:frame.bodies.map((body,i)=>body.map((p,j)=>p.map((v,k)=>lerp(v,next.bodies[i][j][k]))))};
}

export function plotValues(flight, metric) {
  return flight.frames.map(f=> metric==='altitude'?f.position[1]-flight.world.pad[2]:
    metric==='vx'?f.velocity[0]:metric==='vy'?f.velocity[1]:f.angle*180/Math.PI);
}

export function eventsFor(flight) {
  const events=(flight.interventions||[]).map(p=>({kind:'push',step:p.step,
    text:`Push ${p.direction<0?'left':'right'} · 1.5 u/s`,direction:p.direction}));
  let interval=null,contact=false;
  for (const frame of flight.frames.slice(1)) {
    if (!interval || interval.action!==frame.action) {
      interval={kind:'engine',step:frame.step-1,from:frame.step-1,to:frame.step,action:frame.action};
      events.push(interval);
    } else interval.to=frame.step;
    if (!contact && frame.contacts.some(Boolean)) {
      events.push({kind:'contact',step:frame.step,text:'First landing-gear contact'}); contact=true;
    }
  }
  events.push({kind:'terminal',step:flight.steps,text:`Episode ended · ${flight.outcome}`});
  return events.sort((a,b)=>a.step-b.step);
}

export function comparisonMetrics(flight, reference) {
  const displacement=f=>f.frames.at(-1).position[0]-f.frames[0].position[0];
  return {durationDelta:flight.steps/flight.fps-reference.steps/reference.fps,
    rewardDelta:flight.reward-reference.reward,
    displacementDelta:displacement(flight)-displacement(reference)};
}

export function debriefFor(flight, reference=null) {
  const notes=[];
  for (const p of (flight.interventions||[]).slice(-3)) {
    const before=frameAt(flight,p.step), after=frameAt(flight,p.step+1);
    notes.push({step:p.step,text:`${p.direction<0?'Left':'Right'} push at ${(p.step/flight.fps).toFixed(2)}s. Horizontal velocity changed from ${before.velocity[0].toFixed(2)} to ${after.velocity[0].toFixed(2)} u/s over the next simulation step.`});
  }
  const contact=eventsFor(flight).find(e=>e.kind==='contact');
  if(contact) notes.push({step:contact.step,text:`First gear contact at ${(contact.step/flight.fps).toFixed(2)}s; vertical velocity ${frameAt(flight,contact.step).velocity[1].toFixed(2)} u/s.`});
  notes.push({step:flight.steps,text:`Simulator outcome: ${flight.outcome}. ${flight.reward.toFixed(1)} reward over ${(flight.steps/flight.fps).toFixed(2)}s.`});
  if(reference) {
    const m=comparisonMetrics(flight,reference);
    notes.push({step:flight.steps,text:`Matched pair: reference ${reference.outcome}; reward difference ${m.rewardDelta.toFixed(1)}, duration difference ${m.durationDelta.toFixed(2)}s, final horizontal displacement difference ${m.displacementDelta.toFixed(2)} u. These measurements describe this pair only.`});
  }
  return notes;
}

// Cosmetic aftermath only: never append simulation frames or change the cursor.
export const CRASH_SECONDS=1.8;
export function crashAgeFor(flight,step,{endStep=flight.steps,crashAge=CRASH_SECONDS,reducedMotion=false}={}){
  if(reducedMotion)return CRASH_SECONDS;
  const tail=step>=endStep?crashAge:0;
  return Math.max(0,Math.min(CRASH_SECONDS,(step-flight.steps)/flight.fps+tail));
}
export class CrashPlaybackClock {
  constructor(){this.key='';this.step=0;this.age=CRASH_SECONDS;this.active=false;}
  tick(state,elapsed,wasPlaying,reducedMotion=false){
    const key=state.flights.map(f=>f.revision_id).join(':'),end=Math.max(0,...state.flights.map(f=>f.steps));
    const changed=key!==this.key,atEnd=state.flights.length>0&&state.step>=end;
    const arrived=!changed&&atEnd&&this.step<end&&wasPlaying;
    let redraw=false;
    if(changed||!atEnd){this.age=CRASH_SECONDS;this.active=false;}
    if(arrived&&state.flights.some(f=>f.outcome==='crashed'&&(end-f.steps)/f.fps<CRASH_SECONDS)&&!reducedMotion){this.age=0;this.active=true;redraw=true;}
    else if(reducedMotion){redraw=this.active;this.age=CRASH_SECONDS;this.active=false;}
    else if(this.active&&!state.inspection){this.age=Math.min(CRASH_SECONDS,this.age+Math.max(0,elapsed));redraw=true;this.active=this.age<CRASH_SECONDS;}
    this.key=key;this.step=state.step;
    return {age:this.age,redraw};
  }
}

const fragmentRandom=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
export function terrainHeight(world,x){
  const points=world.terrain;
  if(x<=points[0][0])return points[0][1];
  for(let i=1;i<points.length;i++)if(x<=points[i][0]){
    const a=points[i-1],b=points[i];return a[1]+(x-a[0])/(b[0]-a[0])*(b[1]-a[1]);
  }
  return points.at(-1)[1];
}
export function wreckagePose(flight,seconds,reducedMotion=false){
  if(flight.outcome!=='crashed')return null;
  const frame=flight.frames.at(-1),hull=frame.bodies[0];
  const center=points=>points.reduce((sum,p)=>[sum[0]+p[0]/points.length,sum[1]+p[1]/points.length],[0,0]);
  const hub=center(hull);
  const pieces=hull.map((p,i)=>({kind:'hull',points:[hub,p,hull[(i+1)%hull.length]]}));
  pieces.push(...frame.bodies.slice(1).map(points=>({kind:'leg',points})));
  const age=reducedMotion?CRASH_SECONDS:Math.max(0,Math.min(CRASH_SECONDS,seconds));
  return pieces.map(({kind,points},i)=>{
    const origin=center(points),seed=i+(flight.seed||0)*17;
    const spread=(fragmentRandom(seed+30)-.5)*5,travel=1-Math.exp(-age*2.5);
    const x=origin[0]+spread*travel;
    const y=Math.max(terrainHeight(flight.world,x)+.10,
      origin[1]+(.8+fragmentRandom(seed+60)*2.4)*age-4.8*age*age);
    return {kind,points:points.map(p=>[p[0]-origin[0],p[1]-origin[1]]),
      position:[x,y,(fragmentRandom(seed+90)-.5)*2*travel],
      rotation:[age*(fragmentRandom(seed+120)-.5)*3,age*(fragmentRandom(seed+150)-.5)*3,age*(fragmentRandom(seed+180)-.5)*5]};
  });
}
