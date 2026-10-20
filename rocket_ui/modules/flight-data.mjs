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
