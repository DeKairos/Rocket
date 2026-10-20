import {frameAt,plotValues,eventsFor,debriefFor,comparisonMetrics} from './flight-data.mjs';
const actions=['Coast','Left side engine','Main engine','Right side engine'];
const metrics=[['altitude','Altitude','u'],['vx','Horizontal velocity','u/s'],['vy','Vertical velocity','u/s'],['tilt','Tilt','°']];
const ns='http://www.w3.org/2000/svg';
const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};

export class AnalysisView {
  constructor(root,onSeek){this.root=root;this.onSeek=onSeek;this.charts=[];this.step=0;}
  setFlights(flights,comparison){
    this.flights=flights;this.comparison=comparison;this.charts=[];
    const f=flights[0],ref=flights[1],plots=this.root.querySelector('#plots');plots.replaceChildren();
    if(!f)return;
    this.maxSteps=Math.max(...flights.map(item=>item.steps));
    for(const [key,label,unit] of metrics){
      const article=node('article'),heading=node('div');heading.className='plot-heading';
      heading.append(node('span',label));const value=node('strong');heading.append(value,node('small',unit));
      const values=plotValues(f,key),others=ref?plotValues(ref,key):[];
      const lo=Math.min(...values,...others),hi=Math.max(...values,...others),range=hi-lo||1;
      const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 360 90');
      svg.setAttribute('role','slider');svg.setAttribute('tabindex','0');svg.setAttribute('aria-label',`${label} plot`);
      svg.setAttribute('aria-valuemin','0');svg.setAttribute('aria-valuemax',this.maxSteps);
      const makePath=(data,reference)=>{
        const path=document.createElementNS(ns,'path');
        path.setAttribute('d',data.map((v,i)=>`${i?'L':'M'}${(i/this.maxSteps*354+3).toFixed(2)},${(65-(v-lo)/range*56).toFixed(2)}`).join(' '));
        path.setAttribute('class',reference?'reference-line':'measured-line');svg.append(path);
      };
      makePath(values,false);if(ref)makePath(others,true);
      const cursor=document.createElementNS(ns,'line');cursor.setAttribute('y1','4');cursor.setAttribute('y2','70');cursor.setAttribute('class','plot-cursor');svg.append(cursor);
      for(const [x,y,text] of [[3,87,'0s'],[295,87,`${(this.maxSteps/f.fps).toFixed(2)}s`],[3,12,hi.toFixed(1)]]){
        const textNode=document.createElementNS(ns,'text');textNode.setAttribute('x',x);textNode.setAttribute('y',y);textNode.textContent=text;svg.append(textNode);
      }
      const select=event=>{const box=svg.getBoundingClientRect();this.onSeek(Math.round((event.clientX-box.left)/box.width*this.maxSteps));};
      svg.addEventListener('pointerdown',event=>{event.preventDefault();svg.setPointerCapture(event.pointerId);select(event);});
      svg.addEventListener('pointermove',event=>{if(event.buttons===1)select(event);});
      svg.addEventListener('keydown',event=>{
        const keys={ArrowLeft:this.step-1,ArrowRight:this.step+1,Home:0,End:this.maxSteps};
        if(event.key in keys){event.preventDefault();this.onSeek(keys[event.key]);}
      });
      article.append(heading,svg);plots.append(article);this.charts.push({cursor,svg,value,key});
    }
    const policy=this.root.querySelector('#policy-bars');policy.replaceChildren();this.bars=[];
    actions.forEach(label=>{
      const row=node('div');row.className='policy-row';const name=node('span',label),percent=node('strong','—'),bar=node('i');
      row.append(name,percent,bar);policy.append(row);this.bars.push({row,percent,bar});
    });
    const notes=this.root.querySelector('#debrief-notes');notes.replaceChildren();
    debriefFor(f,comparison==='counterfactual'?ref:null).forEach(note=>{
      const button=node('button');button.className='evidence-note';button.append(node('time',`T+${(note.step/f.fps).toFixed(2)}`),node('span',note.text));
      button.addEventListener('click',()=>this.onSeek(note.step));notes.append(button);
    });
    const events=this.root.querySelector('#engine-events');events.replaceChildren();
    for(const event of eventsFor(f)){
      const text=event.kind==='engine'?`${actions[event.action]} · ${(event.from/f.fps).toFixed(2)}–${(event.to/f.fps).toFixed(2)}s`:event.text;
      const button=node('button',text);button.addEventListener('click',()=>this.onSeek(event.step));events.append(button);
    }
    this.root.querySelector('#experiment-meta').textContent=JSON.stringify({
      context_id:f.context_id,revision_id:f.revision_id,interventions:f.interventions,...f.experiment},null,2);
    const pair=this.root.querySelector('#comparison-measurements');pair.replaceChildren();pair.hidden=!ref;
    if(ref){
      const m=comparisonMetrics(f,ref);
      pair.append(node('h3',comparison==='counterfactual'?'Matched pair differences':'Controller differences'),
        node('p',`Primary − reference: ${m.rewardDelta.toFixed(1)} reward · ${m.durationDelta.toFixed(2)}s duration · ${m.displacementDelta.toFixed(2)} u final horizontal displacement.`),
        node('small',comparison==='counterfactual'?'Same context, latest push omitted. Each flight makes its own policy decisions.':'Same starting seed and terrain; controllers differ. This is not a push counterfactual.'));
    }
  }
  update(step){
    if(!this.flights?.length)return;
    this.step=Math.floor(step);const f=this.flights[0],frame=frameAt(f,step);
    this.root.querySelector('#inspection-frame').textContent=`FRAME ${frame.step} · T+${(frame.step/f.fps).toFixed(2)}s`;
    for(const chart of this.charts){
      const value=chart.key==='altitude'?frame.position[1]-f.world.pad[2]:chart.key==='vx'?frame.velocity[0]:chart.key==='vy'?frame.velocity[1]:frame.angle*180/Math.PI;
      chart.value.textContent=value.toFixed(2);const x=3+Math.min(step,this.maxSteps)/this.maxSteps*354;
      chart.cursor.setAttribute('x1',x);chart.cursor.setAttribute('x2',x);chart.svg.setAttribute('aria-valuenow',Math.min(this.step,this.maxSteps));
    }
    this.bars.forEach(({row,bar,percent},i)=>{
      const p=frame.decision?.probabilities[i];row.classList.toggle('selected',frame.decision?.selected_action===i);
      bar.style.width=`${(p||0)*100}%`;percent.textContent=p===undefined?'—':`${(p*100).toFixed(1)}%`;
    });
    this.root.querySelector('#decision-source').textContent=frame.decision?
      `Decision from frame ${frame.decision.source_step}, using the observation before this action${f.interventions.some(p=>p.step===frame.decision.source_step)?' and after your push':''}.`:
      'Reset frame. No policy decision has been made yet.';
    this.root.querySelector('#decision-observation').textContent=frame.decision?frame.decision.observation.map(v=>v.toFixed(5)).join(', '):'No decision observation at reset.';
  }
}
