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
  async run({clips,media,music=[],ratio,resolution='source',fps=30,quality='maximum',render,onProgress=()=>{},signal}){
    const AudioEngine=window.AudioContext||window.webkitAudioContext;
    if(!AudioEngine)throw new Error('Audio export is unavailable. Try Chrome or Edge.');
    const audio=new AudioEngine({sampleRate:48000}),destination=audio.createMediaStreamDestination();
    const limiter=audio.createDynamicsCompressor();limiter.threshold.value=-3;limiter.knee.value=0;limiter.ratio.value=20;limiter.connect(destination);
    const resumed=audio.resume();let playback,stream,recorder,animation,timer,recordingError;
    const chunks=[];
    try{
      await resumed;if(signal?.aborted)throw new Error('Export cancelled.');
      playback=new TimelinePlayback({clips,media,music,audioContext:audio,destination:limiter});
      await playback.prepare(0,signal);
      const {width,height}=this.dimensions(resolution,ratio,[...playback.inputs.values()]);
      const output=document.createElement('canvas');output.width=width;output.height=height;
      render(output,0,id=>playback.inputs.get(id)?.element);
      stream=output.captureStream(fps);for(const track of destination.stream.getAudioTracks())stream.addTrack(track);
      const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(type=>MediaRecorder.isTypeSupported(type));
      if(!mime)throw new Error('WebM audio export is unavailable in this browser.');
      recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:this.bitrate(width,height,fps,quality),audioBitsPerSecond:256000});
      const stopped=new Promise((resolve,reject)=>{recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.onstop=resolve;recorder.onerror=e=>{recordingError=e.error||new Error('Encoding failed. Try 1080p at 30 fps.');reject(recordingError)}});stopped.catch(()=>{});
      recorder.start();const started=performance.now();
      await new Promise((resolve,reject)=>{
        let finished=false;
        const finish=error=>{if(finished)return;finished=true;cancelAnimationFrame(animation);clearInterval(timer);signal?.removeEventListener('abort',cancel);error?reject(error):resolve()};
        const cancel=()=>finish(new Error('Export cancelled.'));
        const tick=()=>{
          try{
            if(signal?.aborted)throw new Error('Export cancelled.');if(recordingError)throw recordingError;
            if(document.hidden)throw new Error('Keep this tab visible while exporting.');
            const time=Math.min(playback.duration,(performance.now()-started)/1000);
            playback.update(time,time<playback.duration);
            if(playback.error)throw new Error('Media playback failed during export: '+playback.error.message);
            for(const input of playback.inputs.values())if(input.running&&(input.element.error||input.element.readyState<2))throw new Error('A source stopped decoding. Try a shorter export.');
            render(output,time,id=>playback.inputs.get(id)?.element);onProgress(time/playback.duration*100);
            if(time>=playback.duration)finish();
          }catch(error){finish(error)}
        };
        const animate=()=>{tick();if(!finished)animation=requestAnimationFrame(animate)};
        signal?.addEventListener('abort',cancel,{once:true});timer=setInterval(tick,100);animation=requestAnimationFrame(animate);
      });
      playback.stop();recorder.stop();await stopped;
      return {blob:new Blob(chunks,{type:recorder.mimeType}),width,height,fps,videoBitsPerSecond:recorder.videoBitsPerSecond,audioBitsPerSecond:recorder.audioBitsPerSecond};
    }finally{
      cancelAnimationFrame(animation);clearInterval(timer);playback?.dispose();
      if(recorder&&recorder.state!=='inactive')recorder.stop();
      stream?.getTracks().forEach(track=>track.stop());destination.stream.getTracks().forEach(track=>track.stop());limiter.disconnect();await audio.close();
    }
  }
};
