import {create2DRenderer} from './renderer-2d.mjs';

export class RendererHost {
  constructor({canvas3d,canvas2d,onStatus=()=>{},create3D=null,create2D=create2DRenderer}) {
    Object.assign(this,{canvas3d,canvas2d,onStatus,create2D});
    this.create3D=create3D|| (async canvas=>(await import('./renderer-3d.mjs')).create3DRenderer(canvas));
    this.flights=[];this.mode='2D';this.active=null;this.generation=0;
    canvas3d.addEventListener('webglcontextlost',event=>{event.preventDefault();this.use2D('Graphics context lost · 2D playback retained');});
  }
  async start(){
    const generation=++this.generation;
    try {
      const renderer=await this.create3D(this.canvas3d);
      if(generation!==this.generation){renderer.dispose();return;}
      this.active?.dispose();this.active=renderer;this.mode='3D';
      this.canvas3d.hidden=false;this.canvas2d.hidden=true;
      this.active.setFlights(this.flights);this.resize();this.onStatus('3D');
    }catch(error){if(generation===this.generation)this.use2D(`2D fallback · ${error.message}`);}
  }
  use2D(reason='2D view'){
    ++this.generation;
    if(this.mode!=='2D'||!this.active){this.active?.dispose();this.active=this.create2D(this.canvas2d);}
    this.mode='2D';this.canvas3d.hidden=true;this.canvas2d.hidden=false;
    this.active.setFlights(this.flights);this.resize();this.onStatus(reason);
  }
  setFlights(flights){this.flights=flights;this.active?.setFlights(flights);}
  resize(){this.active?.resize();}
  render(step,options){this.active?.render(step,options);}
  dispose(){++this.generation;this.active?.dispose();}
}
