function freeze(value) {
  if(value && typeof value==='object' && !Object.isFrozen(value)) {
    Object.freeze(value); Object.values(value).forEach(freeze);
  }
  return value;
}

export class FlightController {
  constructor(request,onChange=()=>{}) {
    this.request=request; this.onChange=onChange; this.serial=0; this.restorePlaying=null;
    this.state={flights:[],records:new Map(),history:[],step:0,playing:false,busy:false,
      speed:1,comparison:'solo',inspection:false,error:null,maxSteps:0};
  }
  emit(){this.onChange(this.state);}
  query(policy,seed,interventions=[],context=null){
    const q=new URLSearchParams({policy,seed,interventions:JSON.stringify(interventions)});
    if(context)q.set('expected_context_id',context);
    return `/api/flight?${q}`;
  }
  async operation(work,apply){
    const token=++this.serial, wasPlaying=this.state.playing;
    this.state.busy=true;this.state.playing=false;this.state.error=null;this.emit();
    try{
      const value=await work(); if(token!==this.serial)return false;
      apply(value,wasPlaying); return true;
    }catch(error){
      if(token===this.serial){this.state.error=error.message||'Flight request failed';this.state.playing=wasPlaying;}
      return false;
    }finally{if(token===this.serial){this.state.busy=false;this.emit();}}
  }
  remember(flight){
    if(!flight.revision_id || !Array.isArray(flight.frames) || flight.frames.length!==flight.steps+1)
      throw Error('Simulator returned an incomplete flight record.');
    const existing=this.state.records.get(flight.revision_id);
    if(existing)return existing;
    const record=freeze(structuredClone(flight));this.state.records.set(record.revision_id,record);return record;
  }
  adopt(flights,comparison='solo',step=0,playing=true,log=true){
    this.state.flights=flights.map(f=>this.remember(f));
    this.state.comparison=comparison;this.state.maxSteps=Math.max(...flights.map(f=>f.steps));
    this.state.step=Math.min(step,this.state.maxSteps);this.state.playing=playing&&!this.state.inspection;
    if(log){
      const entry=freeze({id:flights[0].revision_id,reference:flights[1]?.revision_id||null,comparison});
      const last=this.state.history[0];
      if(!last||last.id!==entry.id||last.reference!==entry.reference)this.state.history.unshift(entry);
    }
    this.emit();
  }
  launch(policy,seed,compareRandom=false){
    return this.operation(()=>Promise.all((compareRandom?[policy,'random']:[policy])
      .map(p=>this.request(this.query(p,seed)))),flights=>this.adopt(flights,compareRandom?'random':'solo'));
  }
  async push(direction){
    const f=this.state.flights[0], step=Math.floor(this.state.step);
    if(this.state.busy||this.state.flights.length!==1||!f||step>=f.steps)return false;
    const interventions=f.interventions.filter(p=>p.step<step);
    if(interventions.length>=12)return false;
    interventions.push({step,direction});
    return this.operation(()=>this.request(this.query(f.policy,f.seed,interventions,f.context_id)),(changed,playing)=>{
      if(changed.context_id!==f.context_id)throw Error('Experiment context does not match the original flight.');
      this.adopt([changed],'solo',step,playing);
    });
  }
  async compareWithoutPush(){
    const f=this.state.flights[0];
    if(this.state.busy||!f?.interventions.length)return false;
    const interventions=[...f.interventions].sort((a,b)=>a.step-b.step).slice(0,-1);
    const step=this.state.step;
    return this.operation(()=>this.request(this.query(f.policy,f.seed,interventions,f.context_id)),(reference,playing)=>{
      if(reference.context_id!==f.context_id)throw Error('Counterfactual context does not match the disturbed flight.');
      this.adopt([f,reference],'counterfactual',step,playing);
    });
  }
  select(entry){
    if(typeof entry==='string')entry={id:entry,reference:null,comparison:'solo'};
    const flights=[this.state.records.get(entry.id)];
    if(entry.reference)flights.push(this.state.records.get(entry.reference));
    if(flights.some(f=>!f))return;
    ++this.serial;this.state.busy=false;this.state.error=null;
    this.adopt(flights,entry.comparison,0,true,false);
  }
  setPlaying(playing){
    if(this.state.busy||!this.state.flights.length)return;
    this.restorePlaying=null;
    if(playing&&this.state.step>=this.state.maxSteps)this.state.step=0;
    this.state.playing=playing;this.emit();
  }
  seek(step){
    if(this.state.busy)return;
    this.state.step=Math.max(0,Math.min(this.state.maxSteps,Math.floor(step)));
    this.state.playing=false;this.restorePlaying=null;this.emit();
  }
  inspect(open){
    if(open===this.state.inspection)return;
    if(open){this.restorePlaying=this.state.playing;this.state.playing=false;}
    else if(this.restorePlaying!==null)this.state.playing=this.restorePlaying;
    this.state.inspection=open;this.restorePlaying=null===this.restorePlaying?null:this.restorePlaying;
    this.emit();
  }
  advance(seconds){
    const s=this.state;
    if(!s.playing||s.busy||!s.flights.length)return;
    s.step=Math.min(s.maxSteps,s.step+seconds*s.flights[0].fps*s.speed);
    if(s.step>=s.maxSteps){s.playing=false;this.emit();}
  }
}
