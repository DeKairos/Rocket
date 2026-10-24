import {FlightController} from './modules/flight-state.mjs';
import {frameAt,CrashPlaybackClock} from './modules/flight-data.mjs';
import {RendererHost} from './modules/renderer-host.mjs';
import {AnalysisView} from './modules/analysis.mjs';

const $=id=>document.getElementById(id);
const names={trained:'Trained pilot',best:'Best checkpoint',random:'Random controller'};
const actions=['Coast / engines idle','Left side engine','Main engine','Right side engine'];
const outcomes={landed:'Pad landing confirmed.',off_pad:'Landing pad missed.',unsafe_landing:'Touchdown not confirmed.',crashed:'Hull impact.',timeout:'Time limit reached.',out_of_bounds:'Craft left the flight area.'};
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const narrow=matchMedia('(max-width: 760px)');
const options={camera:reducedMotion.matches?'surface':'chase',split:false};
let status=null,dirty=true,flightSignature='',historySignature='',lastUi=0,lastTime=0,lastDraw=0;
let focusReturn=null,announceSignature='',lastPerformanceUpdate=0;
const frameIntervals=[],renderCosts=[];
const crashClock=new CrashPlaybackClock();

async function request(url){
  const response=await fetch(url);let data;
  try{data=await response.json();}catch{throw Error('The simulator returned an incomplete response. The previous flight is retained.');}
  if(!response.ok)throw Error(data.error||`Request failed (${response.status}).`);
  return data;
}
const host=new RendererHost({canvas3d:$('flight-canvas-3d'),canvas2d:$('flight-canvas-2d'),onStatus(text){
  $('render-mode').textContent=text;$('graphics-toggle').textContent=host.mode==='3D'?'2D view':'Retry 3D';dirty=true;
}});
const controller=new FlightController(request,syncUI);
const analysis=new AnalysisView($('analysis-drawer'),step=>controller.seek(step));

function time(seconds){const m=Math.floor(seconds/60);return `${String(m).padStart(2,'0')}:${(seconds-m*60).toFixed(2).padStart(5,'0')}`;}
function enable(id,enabled){$(id).disabled=!enabled;}
function announce(text){$('mission-message').textContent=text;}

function syncUI(){
  const s=controller.state,f=s.flights[0],has=Boolean(f),complete=has&&s.step>=s.maxSteps;
  const signature=s.flights.map(item=>item.revision_id).join(':')+s.comparison;
  if(signature!==flightSignature){
    flightSignature=signature;host.setFlights(s.flights);analysis.setFlights(s.flights,s.comparison);
    options.split=s.comparison==='random';
    const markers=$('push-markers');markers.replaceChildren();
    for(const push of f?.interventions||[]){
      const button=document.createElement('button');button.style.left=`${push.step/s.maxSteps*100}%`;
      button.setAttribute('aria-label',`Push ${push.direction<0?'left':'right'} at ${(push.step/f.fps).toFixed(2)} seconds`);
      button.addEventListener('click',()=>{controller.seek(push.step);openInspection();});markers.append(button);
    }
  }
  $('preview-copy').hidden=has;$('flight-legend').hidden=!has;
  $('reference-legend').hidden=s.flights.length<2;
  $('scene-id').textContent=has?`${names[f.policy].toUpperCase()} / SEED ${f.seed}`:'LUNAR LANDER · EXPERIMENT 001';
  $('flight-state').textContent=s.busy?'COMPUTING / PLAYBACK HELD':complete?'EPISODE COMPLETE':s.playing?'SIMULATION PLAYBACK':has?'PLAYBACK PAUSED':'PREVIEW / NO FLIGHT RUNNING';
  $('loading-overlay').hidden=!s.busy;
  $('timeline').disabled=!has||s.busy;$('timeline').max=s.maxSteps||1;
  enable('launch',Boolean(status)&&!s.busy);enable('setup-launch',Boolean(status)&&!s.busy);
  enable('play-pause',has&&!s.busy);enable('restart',has&&!s.busy);enable('inspect',has&&!s.busy);
  const retained=(f?.interventions||[]).filter(p=>p.step<Math.floor(s.step)).length;
  const canPush=has&&!s.busy&&s.flights.length===1&&s.step<f.steps&&retained<12;
  enable('disturb',canPush);enable('push-left',canPush);enable('push-right',canPush);
  if(!has||complete||s.flights.length!==1){
    $('push-panel').hidden=true;$('disturb').setAttribute('aria-expanded','false');
  }
  const canCompare=has&&!s.busy&&f.interventions.length>0&&s.comparison!=='counterfactual';
  enable('counterfactual',canCompare);enable('result-compare',canCompare);
  $('result-compare').hidden=!f?.interventions.length;
  $('push-count').textContent=`${f?.interventions.length||0} / 12 pushes`;
  $('play-pause').textContent=s.playing?'Ⅱ':'▶';$('play-pause').setAttribute('aria-label',s.playing?'Pause playback':'Play playback');
  $('single-view').hidden=s.flights.length!==2;$('split-view').hidden=s.flights.length!==2;
  $('split-view').setAttribute('aria-pressed',String(options.split));
  $('analysis-drawer').hidden=!s.inspection;$('inspect').setAttribute('aria-expanded',String(s.inspection));
  $('analysis-drawer').setAttribute('aria-modal',String(s.inspection&&narrow.matches));
  document.body.classList.toggle('analysis-open',s.inspection);
  $('result-banner').hidden=!complete;
  if(complete){$('result-title').textContent=outcomes[f.outcome]||f.outcome;
    $('result-detail').textContent=`${f.reward.toFixed(1)} REWARD / ${(f.steps/f.fps).toFixed(2)}s / ${f.interventions.length} PUSH${f.interventions.length===1?'':'ES'}`;}
  $('error-banner').hidden=!s.error;if(s.error)$('error-message').textContent=s.error;
  const newAnnouncement=[signature,s.busy,s.inspection,s.playing,complete,s.error].join('|');
  if(newAnnouncement!==announceSignature){announceSignature=newAnnouncement;
    announce(s.error|| (s.busy?'Computing the simulator trajectory. Previous flight retained.':
      complete?`Simulator outcome: ${f.outcome}. Inspect the flight to see measured evidence.`:
      s.inspection?'Scientific inspection. Plots and scene share the selected recorded frame.':
      has?`${names[f.policy]} · ${f.interventions.length} recorded pushes · ${s.playing?'playback running':'playback paused'}.`:'Ready to launch a local simulator episode.'));
  }
  renderHistory();dirty=true;refreshTelemetry();
}

function refreshTelemetry(){
  const s=controller.state,f=s.flights[0];if(!f)return;
  const frame=frameAt(f,s.step);
  $('altitude').textContent=(frame.position[1]-f.world.pad[2]).toFixed(2);
  $('velocity').textContent=`${frame.velocity[1]>=0?'+':''}${frame.velocity[1].toFixed(2)}`;
  $('action-name').textContent=frame.step===0?'Reset / no decision':frame.step===f.steps?'Episode complete':actions[frame.action];
  $('tilt-label').textContent=`${(frame.angle*180/Math.PI).toFixed(1)}° tilt`;
  $('frame-counter').textContent=`FRAME ${String(Math.floor(s.step)).padStart(4,'0')}${frame.step===f.steps&&f.outcome==='crashed'?' / COSMETIC WRECKAGE':''}`;
  $('playback-time').textContent=time(s.step/f.fps);$('total-time').textContent=time(s.maxSteps/f.fps);
  $('timeline').value=Math.floor(s.step);
  $('primary-label').textContent=`${s.comparison==='counterfactual'?'Disturbed':names[f.policy]}${s.step>=f.steps?' · COMPLETE':''}`;
  const ref=s.flights[1];if(ref)$('reference-label').textContent=`${s.comparison==='counterfactual'?'Without latest push':'Random controller'}${s.step>=ref.steps?' · COMPLETE':''}`;
  if(s.inspection)analysis.update(s.step);
  const retained=f.interventions.filter(p=>p.step<Math.floor(s.step)).length;
  const allowed=!s.busy&&s.flights.length===1&&s.step<f.steps&&retained<12;
  enable('push-left',allowed);enable('push-right',allowed);enable('disturb',allowed);
}

function renderHistory(){
  const s=controller.state,signature=s.history.map(e=>e.id+e.reference).join(':');
  if(signature===historySignature)return;historySignature=signature;
  $('record-count').textContent=String(s.history.length).padStart(2,'0');
  const list=$('record-list');list.replaceChildren();
  s.history.forEach((entry,i)=>{
    const f=s.records.get(entry.id),row=document.createElement('div');row.className='record-row';
    const text=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('small');
    title.textContent=`${names[f.policy]} · seed ${f.seed}`;
    detail.textContent=`${f.interventions.length} pushes / ${entry.comparison==='counterfactual'?'MATCHED PAIR':entry.comparison==='random'?'VS RANDOM':'SAVED FLIGHT'} / ${f.revision_id.slice(0,10)}`;
    text.append(title,detail);const button=document.createElement('button');button.textContent='Replay ↗';button.setAttribute('aria-label',`Replay session record ${s.history.length-i}`);
    button.addEventListener('click',()=>{controller.select(entry);$('recorder-dialog').close();});
    row.append(text,button);list.append(row);
  });
}

function openInspection(){
  if(!controller.state.flights.length)return;focusReturn=document.activeElement;
  controller.inspect(true);$('close-analysis').focus();
}
function closeInspection(){controller.inspect(false);(focusReturn?.disabled?$('inspect'):focusReturn||$('inspect')).focus();}
function showError(message){controller.state.error=message;syncUI();}
function chosenSeed(){
  if($('fresh-start').checked)$('seed').value=crypto.getRandomValues(new Uint32Array(1))[0];
  if(!$('seed').checkValidity()||$('seed').value.trim()==='')throw Error('Choose a whole-number seed between 0 and 4294967295.');
  return Number($('seed').value);
}
async function launch(){
  if(controller.state.busy||!status)return;
  const policy=$('policy').value,compare=$('compare-random').checked;
  if(compare&&policy==='random'){showError('Select a PPO pilot to compare with random, or turn off controller comparison.');return;}
  try{const seed=chosenSeed();if($('setup-dialog').open)$('setup-dialog').close();await controller.launch(policy,seed,compare);}
  catch(error){showError(error.message);}
}
async function compare(){if(await controller.compareWithoutPush())openInspection();}

$('launch').addEventListener('click',launch);$('setup-launch').addEventListener('click',launch);
$('play-pause').addEventListener('click',()=>controller.setPlaying(!controller.state.playing));
$('restart').addEventListener('click',()=>{controller.seek(0);controller.setPlaying(true);});
$('timeline').addEventListener('input',()=>controller.seek(Number($('timeline').value)));
$('inspect').addEventListener('click',()=>controller.state.inspection?closeInspection():openInspection());
$('result-inspect').addEventListener('click',openInspection);$('close-analysis').addEventListener('click',closeInspection);
$('disturb').addEventListener('click',()=>{const open=$('push-panel').hidden;$('push-panel').hidden=!open;$('disturb').setAttribute('aria-expanded',String(open));});
$('push-left').addEventListener('click',()=>controller.push(-1));$('push-right').addEventListener('click',()=>controller.push(1));
$('counterfactual').addEventListener('click',compare);$('result-compare').addEventListener('click',compare);
$('single-view').addEventListener('click',()=>controller.select(controller.state.flights[0].revision_id));
$('split-view').addEventListener('click',()=>{options.split=!options.split;$('split-view').setAttribute('aria-pressed',String(options.split));dirty=true;});
$('speed').addEventListener('click',()=>{const values=[.5,1,2,4];controller.state.speed=values[(values.indexOf(controller.state.speed)+1)%values.length];$('speed').textContent=`${controller.state.speed}×`;$('speed').setAttribute('aria-label',`Playback speed: ${controller.state.speed} times`);});
for(const camera of ['chase','surface'])$(`camera-${camera}`).addEventListener('click',()=>{options.camera=camera;for(const key of ['chase','surface'])$(`camera-${key}`).setAttribute('aria-pressed',String(camera===key));dirty=true;});
$('graphics-toggle').addEventListener('click',()=>host.mode==='3D'?host.use2D('2D view · recorded Box2D fixtures'):host.start());
$('seed').addEventListener('input',()=>{$('fresh-start').checked=false;});
$('shuffle').addEventListener('click',()=>{$('seed').value=crypto.getRandomValues(new Uint32Array(1))[0];$('fresh-start').checked=false;});
$('dismiss-error').addEventListener('click',()=>{controller.state.error=null;syncUI();});
for(const [button,dialog] of [['open-setup','setup-dialog'],['open-recorder','recorder-dialog'],['open-experiment','experiment-dialog']])$(button).addEventListener('click',()=>$(dialog).showModal());
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>$(button.dataset.close).close()));
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}}));
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&controller.state.inspection&&!document.querySelector('dialog[open]')){closeInspection();return;}
  if(event.key==='Tab'&&controller.state.inspection&&narrow.matches){
    const focusables=[...$('analysis-drawer').querySelectorAll('button,summary,[tabindex="0"]')].filter(el=>el.getClientRects().length);
    const first=focusables[0],last=focusables.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
  const editing=event.target.closest('input,select,textarea,button,a,[contenteditable],[role="slider"]');
  if(event.code==='Enter'&&event.target===$('seed')){event.preventDefault();launch();return;}
  if(editing||document.querySelector('dialog[open]'))return;
  if(event.code==='Space'){event.preventDefault();controller.setPlaying(!controller.state.playing);}
  if(event.code==='Enter'){event.preventDefault();launch();}
  if(!event.repeat&&(event.code==='KeyA'||event.code==='KeyD')){event.preventDefault();controller.push(event.code==='KeyA'?-1:1);}
});
new ResizeObserver(()=>{host.resize();dirty=true;}).observe($('scene-wrap'));
reducedMotion.addEventListener('change',()=>{if(reducedMotion.matches)options.camera='surface';dirty=true;});
narrow.addEventListener('change',syncUI);
document.addEventListener('visibilitychange',()=>{lastTime=0;lastDraw=0;});

function animate(now){
  const elapsed=lastTime?Math.min((now-lastTime)/1000,.1):0;lastTime=now;
  if(document.hidden){requestAnimationFrame(animate);return;}
  const s=controller.state,wasPlaying=s.playing;
  controller.advance(elapsed);
  const crash=crashClock.tick(s,elapsed,wasPlaying,reducedMotion.matches);
  if(wasPlaying||dirty||crash.redraw){
    const begin=performance.now();host.render(s.step,{...options,endStep:s.maxSteps,crashAge:crash.age,reducedMotion:reducedMotion.matches,inspect:s.inspection});
    if(wasPlaying&&lastDraw&&now-lastDraw<250){frameIntervals.push(now-lastDraw);renderCosts.push(performance.now()-begin);if(frameIntervals.length>600){frameIntervals.shift();renderCosts.shift();}}
    lastDraw=wasPlaying?now:0;dirty=false;
  }
  if(now-lastUi>80){refreshTelemetry();lastUi=now;}
  if(frameIntervals.length>30&&now-lastPerformanceUpdate>600){
    const sorted=[...frameIntervals].sort((a,b)=>a-b),average=frameIntervals.reduce((a,b)=>a+b,0)/frameIntervals.length;
    const p95=sorted[Math.floor(sorted.length*.95)],cost=renderCosts.reduce((a,b)=>a+b,0)/renderCosts.length;
    $('performance-label').textContent=`LAST PLAYBACK SAMPLE / ${(1000/average).toFixed(0)} Hz / P95 ${p95.toFixed(1)}ms`;
    $('runtime-measurements').textContent=`${frameIntervals.length} playback frame intervals; mean ${average.toFixed(2)}ms, p95 ${p95.toFixed(2)}ms. Mean render submission ${cost.toFixed(2)}ms (CPU, not GPU timing). ${host.mode}, viewport ${innerWidth}×${innerHeight}, device pixel ratio ${devicePixelRatio}. This is a local sample, not a hardware-independent guarantee.`;
    lastPerformanceUpdate=now;
  }
  requestAnimationFrame(animate);
}

async function init(){
  host.start();requestAnimationFrame(animate);
  try{
    status=await request('/api/status');$('connection-label').textContent='SIMULATOR ONLINE';
    for(const option of $('policy').options)option.disabled=!status.policies[option.value];
    $('policy').value=status.policies.trained?'trained':status.policies.best?'best':'random';
    $('model-note').textContent=status.policies.trained?'Local PPO checkpoint available. Weights stay fixed during flight.':'Some policy files are missing. Disabled controllers need a model supplied with rocket demo --model / --best-model. Random remains available.';
    const benchmarks=$('benchmarks');benchmarks.replaceChildren();
    for(const policy of ['trained','best','random'])if(status.benchmarks[policy]){
      const report=status.benchmarks[policy],row=document.createElement('div');row.className='benchmark-row';
      const label=document.createElement('span');label.textContent=names[policy];const value=document.createElement('strong');
      const landingLabel=report.outcome_rule==='pad_gear_contacts_v1'?'pad landings':'simulator rests (legacy rule)';
      value.textContent=`${report.outcomes.landed}/${report.episodes} ${landingLabel} · ${report.mean_reward.toFixed(1)} reward`;row.append(label,value);benchmarks.append(row);
    }
    if(!benchmarks.children.length)benchmarks.textContent='No local evaluation reports. See the README for evaluation commands.';
    syncUI();
  }catch(error){$('connection-label').textContent='SIMULATOR OFFLINE';showError(`Cannot reach the local simulator. ${error.message}`);}
}
init();
