// Render the timeline into a dedicated canvas and mux original clip audio into WebM.
const VideoExport = {
  dimensions(resolution, ratio, inputs) {
    let height = Number(resolution) / Math.min(1, ratio);
    if (resolution === 'source') {
      const sizes = inputs.filter(x => x.type === 'video').map(x => Math.min(x.element.videoHeight, x.element.videoWidth / ratio));
      height = sizes.length ? Math.max(...sizes) : 1080;
    }
    height = Math.max(2, Math.min(4320, Math.round(height / 2) * 2));
    return { width: Math.max(2, Math.round(height * ratio / 2) * 2), height };
  },
  bitrate(width, height, fps, quality) {
    // Scale with pixel count and frame rate instead of using one rate for every export.
    return Math.round(Math.max(8000000, Math.min(160000000, width * height * fps * (quality === 'maximum' ? .32 : .2))));
  },
  async run({clips, media, ratio, resolution='source', fps=30, quality='maximum', render, onProgress=()=>{}, signal}) {
    const AudioEngine = window.AudioContext || window.webkitAudioContext;
    if (!AudioEngine) throw new Error('Audio export is unavailable in this browser. Try Chrome or Edge.');
    const audio = new AudioEngine({sampleRate:48000});
    const destination = audio.createMediaStreamDestination();
    const output = document.createElement('canvas');
    const inputs = new Map(), chunks = [];
    let recorder, stream, animation, timer, recordingError, aborted=false;
    const assertActive = () => { if (signal?.aborted || aborted) throw new Error('Export cancelled.'); if(recordingError)throw recordingError; };
    const abort = () => { aborted=true; };
    signal?.addEventListener('abort', abort);
    const wait = (element, event, ready) => new Promise((resolve,reject)=>{
      if(ready())return resolve();
      const clean=()=>{clearTimeout(timeout);element.removeEventListener(event,success);element.removeEventListener('error',failure);signal?.removeEventListener('abort',cancel)};
      const success=()=>{clean();resolve()};
      const failure=()=>{clean();reject(new Error('Could not decode an export clip. Re-import the source video.'))};
      const cancel=()=>{clean();reject(new Error('Export cancelled.'))};
      const timeout=setTimeout(()=>{clean();reject(new Error('A clip took too long to load. Try exporting a shorter section.'))},30000);
      element.addEventListener(event,success,{once:true});element.addEventListener('error',failure,{once:true});signal?.addEventListener('abort',cancel,{once:true});
    });
    try {
      await audio.resume();assertActive();
      for(const clip of clips){
        assertActive();if(inputs.has(clip.media))continue;
        const item=media.find(m=>m.id===clip.media);
        if(!item)throw new Error('A timeline clip is missing its source media.');
        const element=document.createElement(item.type==='video'?'video':'img');
        const input={element,type:item.type};inputs.set(item.id,input);
        if(item.type==='video'){
          element.preload='auto';element.playsInline=true;element.muted=false;element.volume=1;
          // Route audio only to the recording destination; no microphone access is needed.
          input.node=audio.createMediaElementSource(element);input.gain=audio.createGain();input.gain.gain.value=0;
          input.node.connect(input.gain);input.gain.connect(destination);
        }else element.crossOrigin='anonymous';
        element.src=item.src;
        await wait(element,item.type==='video'?'loadeddata':'load',()=>item.type==='video'?element.readyState>=2:element.complete&&element.naturalWidth>0);
      }
      const {width,height}=this.dimensions(resolution,ratio,[...inputs.values()]);
      output.width=width;output.height=height;
      const context=output.getContext('2d');context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
      const first=clips[0];if(!first)throw new Error('Add a clip before exporting.');
      render(output,first,inputs.get(first.media).element,0);
      stream=output.captureStream(fps);
      for(const track of destination.stream.getAudioTracks())stream.addTrack(track);
      const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(type=>MediaRecorder.isTypeSupported(type));
      if(!mime)throw new Error('This browser cannot export WebM with audio. Try Chrome or Edge.');
      recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:this.bitrate(width,height,fps,quality),audioBitsPerSecond:256000});
      const stopped=new Promise((resolve,reject)=>{
        recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
        recorder.onstop=resolve;
        recorder.onerror=e=>{recordingError=e.error||new Error('Video encoding failed. Try 1080p or 30 fps.');reject(recordingError)};
      });
      // Handle rejection immediately even if it occurs before we reach the final await.
      stopped.catch(()=>{});
      const duration=clips.reduce((sum,c)=>sum+c.duration,0);
      let elapsed=0;
      for(const clip of clips){
        assertActive();
        const input=inputs.get(clip.media),element=input.element;
        if(input.type==='video'){
          element.pause();element.playbackRate=clip.speed;
          if(Math.abs(element.currentTime-clip.in)>.001){
            element.currentTime=clip.in;
            await wait(element,'seeked',()=>!element.seeking&&Math.abs(element.currentTime-clip.in)<.05);
          }
          await wait(element,'loadeddata',()=>element.readyState>=2);
        }
        render(output,clip,element,elapsed);
        if(recorder.state==='inactive')recorder.start();
        else if(recorder.state==='paused')recorder.resume();
        if(input.gain)input.gain.gain.value=1;
        if(input.type==='video')await element.play();
        const started=performance.now();
        await new Promise((resolve,reject)=>{
          let finished=false;
          const finish=error=>{if(finished)return;finished=true;cancelAnimationFrame(animation);clearInterval(timer);signal?.removeEventListener('abort',cancel);error?reject(error):resolve()};
          const cancel=()=>finish(new Error('Export cancelled.'));
          const tick=()=>{
            try{
              assertActive();
              if(document.hidden)throw new Error('Export stopped because the tab was hidden. Keep this tab visible while exporting.');
              if(input.type==='video'&&element.error)throw new Error('A source video stopped decoding during export.');
              const local=input.type==='video'?(element.currentTime-clip.in)/clip.speed:(performance.now()-started)/1000;
              if((performance.now()-started)/1000>clip.duration+30)throw new Error('Video playback stalled. Try a shorter export or lower resolution.');
              render(output,clip,element,elapsed+Math.min(clip.duration,Math.max(0,local)));
              onProgress((elapsed+Math.min(clip.duration,Math.max(0,local)))/duration*100);
              if(local>=clip.duration-0.5/fps || input.type==='video'&&element.ended)return finish();
            }catch(error){finish(error)}
          };
          const animate=()=>{tick();if(!finished)animation=requestAnimationFrame(animate)};
          signal?.addEventListener('abort',cancel,{once:true});
          timer=setInterval(tick,100);animation=requestAnimationFrame(animate);
        });
        if(input.gain)input.gain.gain.value=0;
        if(input.type==='video')element.pause();
        if(recorder.state==='recording')recorder.pause();
        elapsed+=clip.duration;
      }
      recorder.stop();await stopped;assertActive();
      return {blob:new Blob(chunks,{type:recorder.mimeType}),width,height,fps,videoBitsPerSecond:recorder.videoBitsPerSecond,audioBitsPerSecond:recorder.audioBitsPerSecond};
    } finally {
      cancelAnimationFrame(animation);clearInterval(timer);signal?.removeEventListener('abort',abort);
      if(recorder&&recorder.state!=='inactive')recorder.stop();
      for(const {element,node,gain,type} of inputs.values()){
        node?.disconnect();gain?.disconnect();
        if(type==='video'){element.pause();element.removeAttribute('src');element.load()}
      }
      stream?.getTracks().forEach(track=>track.stop());
      destination.stream.getTracks().forEach(track=>track.stop());
      await audio.close();
    }
  }
};
