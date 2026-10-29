/* Shared timeline timing, audio envelopes, and transition rendering. */
const TimelineEngine = {
  transitions: [['none','Cut'],['dissolve','Cross dissolve'],['fade-black','Fade through black'],['fade-white','Fade through white'],['wipe-left','Wipe left'],['wipe-right','Wipe right'],['slide-left','Slide left'],['slide-right','Slide right'],['zoom','Zoom dissolve']],
  clamp(value,min,max){return Math.max(min,Math.min(max,value))},
  layout(clips){
    let end=0;
    return clips.map((clip,index)=>{
      const kind=this.transitions.some(([id])=>id===clip.transition?.kind)?clip.transition.kind:'none';
      const overlap=index&&kind!=='none'?this.clamp(Number(clip.transition?.duration)||.5,0,Math.min(clips[index-1].duration/2,clip.duration/2)):0;
      const start=end-overlap;end=start+clip.duration;
      return {clip,index,start,end,overlap,kind};
    });
  },
  duration(clips){return this.layout(clips).at(-1)?.end||0},
  layers(layout,time){
    const duration=layout.at(-1)?.end||0;
    const t=this.clamp(time,0,Math.max(0,duration-.00001));
    return layout.filter(entry=>t>=entry.start&&t<entry.end).map(entry=>({...entry,local:t-entry.start}));
  },
  envelope(item,local){
    if(item.muted||local<0||local>=item.duration)return 0;
    const fadeIn=this.clamp(Number(item.fadeIn)||0,0,item.duration),fadeOut=this.clamp(Number(item.fadeOut)||0,0,item.duration);
    return this.clamp(Number(item.volume??100)/100,0,1)*Math.min(1,fadeIn?local/fadeIn:1,fadeOut?(item.duration-local)/fadeOut:1);
  },
  audioWeight(entry,layers){
    if(layers.length!==2)return 1;
    const incoming=layers[1],progress=this.clamp(incoming.local/incoming.overlap,0,1);
    return entry.index===incoming.index?progress:1-progress;
  },
  paint(output,layout,time,lookup,{background='#0c1114',texts=[]}={}){
    const context=output.getContext('2d'),w=output.width,h=output.height,layers=this.layers(layout,time);
    context.fillStyle=background;context.fillRect(0,0,w,h);
    const draw=(entry,alpha=1,x=0,zoom=1,mask=null)=>{
      const element=lookup(entry.clip.id),sw=element?.videoWidth||element?.naturalWidth,sh=element?.videoHeight||element?.naturalHeight;
      if(!sw||!sh)return;
      const c=entry.clip;context.save();
      if(mask){context.beginPath();context.rect(...mask);context.clip()}
      // Clip to the translated frame so a cover-scaled image cannot bleed across a slide seam.
      context.beginPath();context.rect(x,0,w,h);context.clip();
      context.globalAlpha=alpha;context.translate(w/2+x,h/2);context.rotate((c.rotation||0)*Math.PI/180);
      const scale=Math.max(w/sw,h/sh)*(c.scale??100)/100*zoom;
      context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
      context.filter=`brightness(${c.brightness??100}%) saturate(${c.saturation??100}%) ${c.filter&&c.filter!=='none'?c.filter:''}`;
      context.drawImage(element,-sw*scale/2,-sh*scale/2,sw*scale,sh*scale);context.restore();
    };
    if(layers.length===1)draw(layers[0]);
    else if(layers.length===2){
      const [outgoing,incoming]=layers,p=this.clamp(incoming.local/incoming.overlap,0,1);
      switch(incoming.kind){
        case 'fade-black':case 'fade-white':
          context.fillStyle=incoming.kind==='fade-white'?'#fff':'#000';context.fillRect(0,0,w,h);
          if(p<.5)draw(outgoing,1-p*2);else draw(incoming,(p-.5)*2);break;
        case 'wipe-left':draw(outgoing);draw(incoming,1,0,1,[w*(1-p),0,w*p,h]);break;
        case 'wipe-right':draw(outgoing);draw(incoming,1,0,1,[0,0,w*p,h]);break;
        case 'slide-left':draw(outgoing,1,-w*p);draw(incoming,1,w*(1-p));break;
        case 'slide-right':draw(outgoing,1,w*p);draw(incoming,1,-w*(1-p));break;
        case 'zoom':draw(outgoing,1,0,1+.2*p);draw(incoming,p,0,1.2-.2*p);break;
        default:draw(outgoing);draw(incoming,p);
      }
    }
    for(const t of texts)if(time>=t.start&&time<t.end){
      context.save();context.textAlign='center';context.fillStyle='white';context.font=`500 ${w*.061}px Georgia`;
      context.shadowColor='#0006';context.shadowBlur=15;context.fillText(t.text,w/2,h*.54,w*.9);
      context.font=`500 ${w*.011}px sans-serif`;context.fillText('S L O W   D O W N .   L O O K   A R O U N D .',w/2,h*.61);context.restore();
    }
  }
};

class TimelinePlayback {
  constructor({clips,media,music=[],audioContext=null,destination=null}){
    this.layout=TimelineEngine.layout(clips);this.duration=TimelineEngine.duration(clips);this.inputs=new Map();this.error=null;
    this.entries=[...this.layout.map(e=>({...e,id:e.clip.id,item:e.clip,mediaId:e.clip.media})),...music.map(m=>({id:m.id,item:m,mediaId:m.media,start:m.start,end:Math.min(this.duration,m.start+m.duration),music:true}))];
    for(const entry of this.entries){
      const m=media.find(m=>m.id===entry.mediaId);if(!m)throw new Error('A timeline source file is missing.');
      const element=document.createElement(m.type==='image'?'img':m.type==='audio'?'audio':'video');
      const input={...entry,type:m.type,element};this.inputs.set(entry.id,input);
      if(m.type==='image')element.crossOrigin='anonymous';
      else{
        element.preload='auto';element.playsInline=true;element.volume=0;element.muted=false;
        if(audioContext){
          input.node=audioContext.createMediaElementSource(element);input.gain=audioContext.createGain();input.gain.gain.value=0;
          input.node.connect(input.gain);input.gain.connect(destination);element.volume=1;
        }
      }
      element.src=m.src;
    }
  }
  wait(element,event,ready,signal){
    if(signal?.aborted)return Promise.reject(new Error('Export cancelled.'));
    if(ready())return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const clean=()=>{clearTimeout(timer);element.removeEventListener(event,done);element.removeEventListener('error',failed);signal?.removeEventListener('abort',cancel)};
      const done=()=>{clean();resolve()},failed=()=>{clean();reject(new Error('Cannot decode a timeline source. Re-import the file.'))},cancel=()=>{clean();reject(new Error('Export cancelled.'))};
      const timer=setTimeout(()=>{clean();reject(new Error('A timeline source took too long to load.'))},30000);
      element.addEventListener(event,done,{once:true});element.addEventListener('error',failed,{once:true});signal?.addEventListener('abort',cancel,{once:true});
    });
  }
  async prepare(time=0,signal){
    await Promise.all([...this.inputs.values()].map(async input=>{
      const {element,type,item,start}=input;
      await this.wait(element,type==='image'?'load':'loadeddata',()=>type==='image'?element.complete&&element.naturalWidth>0:element.readyState>=2,signal);
      if(type!=='image'){
        element.playbackRate=item.speed||1;
        const local=TimelineEngine.clamp(time-start,0,Math.max(0,item.duration-.01));
        const target=(item.in||0)+local*(item.speed||1);
        if(Math.abs(element.currentTime-target)>.001){element.currentTime=target;await this.wait(element,'seeked',()=>!element.seeking&&Math.abs(element.currentTime-target)<.05,signal)}
      }
    }));
  }
  update(time,playing){
    const layers=TimelineEngine.layers(this.layout,time),activeIds=new Set(layers.map(e=>e.clip.id));
    for(const input of this.inputs.values()){
      if(input.type==='image')continue;
      const {element,item,start,end}=input,local=time-start;
      const active=input.music?time>=start&&time<end:activeIds.has(input.id)&&time<this.duration;
      const layer=layers.find(e=>e.clip.id===input.id);
      const gain=active?TimelineEngine.envelope(item,local)*(input.music?1:TimelineEngine.audioWeight(layer,layers)):0;
      if(input.gain)input.gain.gain.value=gain;else element.volume=gain;
      if(active){
        const target=(item.in||0)+Math.max(0,local)*(item.speed||1);element.playbackRate=item.speed||1;
        if(Math.abs(element.currentTime-target)>(playing?.25:.025)&&!element.seeking)element.currentTime=target;
        if(playing&&!element.seeking&&!input.running){input.running=true;element.play().catch(error=>{input.running=false;this.error=error})}
        if(!playing){element.pause();input.running=false}
      }else{element.pause();input.running=false}
    }
  }
  stop(){for(const input of this.inputs.values())if(input.type!=='image'){input.element.pause();input.running=false;if(input.gain)input.gain.gain.value=0;else input.element.volume=0}}
  dispose(){this.stop();for(const input of this.inputs.values()){input.node?.disconnect();input.gain?.disconnect();if(input.type!=='image'){input.element.removeAttribute('src');input.element.load()}}this.inputs.clear()}
}
