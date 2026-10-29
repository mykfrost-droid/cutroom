const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const photos=['photo-1473116763249-2faaef81ccda','photo-1518837695005-2083093ee35b','photo-1470252649378-9c29740c9fa8','photo-1464822759023-fed622ff2c3b'];
let media=photos.map((p,i)=>({id:'m'+i,name:['Coastal mornings','Into the blue','Golden hour','The way home'][i],type:'image',src:`https://images.unsplash.com/${p}?auto=format&fit=crop&w=1600&q=85`,duration:5}));
let clips=media.map((m,i)=>({id:'c'+i,media:m.id,name:m.name,duration:5,in:0,scale:100,rotation:0,brightness:100,saturation:100,speed:1,filter:'none'}));
let texts=[{text:'a little escape.',start:0,end:7}],selected='c0',current=0,playing=false,zoom=36,ratio=16/9,bg='#0c1114',kind='all',history=[],future=[],db,recording=false;
let music=[],selectedMusic=null,previewPlayer=null,activeTab='Media';
const canvas=$('#preview'),ctx=canvas.getContext('2d');
function toast(s){$('#toast').textContent=s;$('#toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('visible'),2800)}
function total(){return TimelineEngine.duration(clips)}
function chosen(){return clips.find(c=>c.id===selected)}
function format(t){return `${String(Math.floor(t/60)).padStart(2,'0')}:${(t%60).toFixed(1).padStart(4,'0')}`}
function escapeHTML(t){return String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function checkpoint(){history.push(JSON.stringify({clips,texts,music}));if(history.length>40)history.shift();future=[]}
function save(){if(!db)return;let transaction=db.transaction('project','readwrite');transaction.objectStore('project').put({clips,texts,music,media:media.map(m=>({...m,src:m.file?null:m.src})),name:$('#projectName').value,ratio,bg},'main');transaction.oncomplete=()=>$('#saved').textContent='✓ All changes saved';transaction.onerror=()=>{$('#saved').textContent='Saving unavailable';toast('Browser storage is full. Export your work before closing.')};$('#saved').textContent='Saving…'}
function renderMedia(){let list=media.filter(m=>(kind==='all'||m.type===kind)&&m.name.toLowerCase().includes($('#search').value.toLowerCase()));$('#mediaGrid').innerHTML=list.map(m=>`<div class="media-card"><div class="thumb">${m.type==='audio'?`<div class="audio-thumb">♫</div>`:m.type==='image'?`<img src="${escapeHTML(m.src)}" alt="${escapeHTML(m.name)}">`:`<video src="${escapeHTML(m.src)}" muted preload="metadata"></video>`}<span>${m.type==='image'?'▧':format(m.duration)}</span><button data-add="${m.id}" title="Add ${escapeHTML(m.name)} to timeline">＋</button></div><p>${escapeHTML(m.name)}</p></div>`).join('')||'<p class="tool-help">No matching media.</p>';$('#mediaCount').textContent=media.length+' items';$$('[data-add]').forEach(b=>b.onclick=()=>add(b.dataset.add))}
function add(id){checkpoint();const m=media.find(m=>m.id===id);if(m.type==='audio'){addMusic(m);return}const c={id:MediaImport.createId(),media:id,name:m.name,duration:Math.min(m.duration,10),in:0,scale:100,rotation:0,brightness:100,saturation:100,speed:1,filter:'none'};clips.push(c);selected=c.id;update();toast('Added to timeline')}
function timeline(){
  const layout=TimelineEngine.layout(clips),width=Math.max(total()*zoom+80,$('#trackScroll').clientWidth);
  $('#trackContent').style.width=width+'px';let marks='';
  for(let t=0;t<Math.max(total()+2,width/zoom);t+=2)marks+=`<span style="left:${t*zoom}px">${format(t)}</span>`;
  $('#ruler').innerHTML=marks;
  $('#videoTrack').innerHTML=layout.map(e=>{
    const c=e.clip,m=media.find(m=>m.id===c.media);
    return `<div class="clip ${c.id===selected?'selected':''}" draggable="true" data-clip="${c.id}" style="left:${e.start*zoom}px;width:${Math.max(12,c.duration*zoom-2)}px;${m.type==='image'?`background-image:url('${escapeHTML(m.src)}')`:'background:linear-gradient(120deg,#34585e,#192b32)'}" title="${escapeHTML(c.name)} · Drag to reorder"><span>${c.muted?'🔇 ':''}${escapeHTML(c.name)} · ${c.duration.toFixed(1)}s</span></div>${e.overlap?`<button class="transition-marker" data-transition="${c.id}" style="left:${(e.start+e.overlap/2)*zoom}px" title="${escapeHTML(e.kind)} · ${e.overlap.toFixed(2)}s">◇</button>`:''}`;
  }).join('');
  $('#textTrack').innerHTML=texts.map((t,i)=>`<button class="text-block" data-text="${i}" style="left:${t.start*zoom}px;width:${Math.max(30,(t.end-t.start)*zoom)}px">Ｔ ${escapeHTML(t.text)}</button>`).join('');
  $('#musicTrack').innerHTML=music.map(m=>{
    const asset=media.find(a=>a.id===m.media),points=asset?.waveform||[];
    return `<button class="music-block ${selectedMusic===m.id?'selected':''}" data-music="${m.id}" style="left:${m.start*zoom}px;width:${Math.max(25,m.duration*zoom)}px" title="${escapeHTML(m.name)}"><span>${m.muted?'🔇':'♫'} ${escapeHTML(m.name)}</span><svg viewBox="0 0 200 22" preserveAspectRatio="none" aria-hidden="true">${points.map((v,i)=>`<path d="M${i*200/points.length} ${11-v*10}v${v*20}"/>`).join('')}</svg></button>`;
  }).join('')||'<button class="empty-music" id="addMusicHint">＋ Add background music</button>';
  $$('[data-clip]').forEach(el=>{
    el.onclick=()=>{selected=el.dataset.clip;selectedMusic=null;update(false);if(activeTab==='Audio')setTab('Audio');if(activeTab==='Transitions')setTab('Transitions')};
    el.ondragstart=e=>e.dataTransfer.setData('text/plain',el.dataset.clip);el.ondragover=e=>e.preventDefault();
    el.ondrop=e=>{e.preventDefault();const from=clips.findIndex(c=>c.id===e.dataTransfer.getData('text/plain')),to=clips.findIndex(c=>c.id===el.dataset.clip);if(from<0)return;checkpoint();clips.splice(to,0,clips.splice(from,1)[0]);update()};
  });
  $$('[data-text]').forEach(b=>b.onclick=()=>setTab('Text'));
  $$('[data-transition]').forEach(b=>b.onclick=()=>{selected=b.dataset.transition;update(false);setTab('Transitions')});
  $$('[data-music]').forEach(b=>b.onclick=()=>{selectedMusic=b.dataset.music;timeline();setTab('Audio')});
  if($('#addMusicHint'))$('#addMusicHint').onclick=()=>setTab('Audio');
  $('#clipCount').textContent=clips.length;$('#total').textContent=format(total())+' duration';position();
}
function inspect(){let c=chosen();$('#selectedName').textContent=c?.name||'No clip selected';['scale','rotation','brightness','saturation','speed','duration','inPoint'].forEach(k=>{$('#'+k).disabled=!c;if(c)$('#'+k).value=c[k==='inPoint'?'in':k]});['scale','rotation','brightness','saturation'].forEach(k=>$('#'+k+'Value').value=(c?.[k]??100)+(k==='rotation'?'°':'%'))}
function update(persist=true){if(persist){playing=false;$('#play').textContent='▶';previewPlayer?.dispose();previewPlayer=null;music=music.filter(m=>m.start<total());for(const m of music)m.duration=Math.min(m.duration,total()-m.start)}current=Math.min(current,total());timeline();inspect();if(persist)save()}
function position(){$('#playhead').style.left=current*zoom+'px';$('#time').innerHTML=`${format(current)} <em>/ ${format(total())}</em>`}
function active(){const layers=TimelineEngine.layers(TimelineEngine.layout(clips),current);const entry=layers.at(-1);return entry?{c:entry.clip,start:entry.start}:null}
function drawComposition(output,time,lookup){TimelineEngine.paint(output,TimelineEngine.layout(clips),time,lookup,{background:bg,texts})}
function ensurePreview(){if(!previewPlayer)previewPlayer=new TimelinePlayback({clips,media,music});return previewPlayer}
function draw(){
  const player=ensurePreview();player.update(current,playing&&!recording);
  drawComposition(canvas,current,id=>player.inputs.get(id)?.element);
  if(playing&&player.error){playing=false;player.stop();$('#play').textContent='▶';toast('Playback failed. Re-import the source file.')}
}
let last=0;function frame(now){if(playing){current+=Math.max(0,(now-last)/1000);if(current>=total()){current=total();playing=false;$('#play').textContent='▶'}position()}last=now;draw();}setInterval(()=>frame(performance.now()),1000/30);
let previewPreparing=false;
async function toggle(){
  if(recording||previewPreparing)return;if(!clips.length)return toast('Add media to begin');
  if(playing){playing=false;previewPlayer?.stop();$('#play').textContent='▶';return}
  if(current>=total())current=0;
  previewPreparing=true;$('#play').textContent='…';
  try{const player=ensurePreview();await player.prepare(current);last=performance.now();playing=true;player.update(current,true);$('#play').textContent='Ⅱ'}catch(error){toast(error.message);$('#play').textContent='▶'}finally{previewPreparing=false}
}
$('#play').onclick=toggle;$('#previous').onclick=()=>{current=0;position()};$('#next').onclick=()=>{current=total();playing=false;$('#play').textContent='▶';position()};
$('#ruler').onpointerdown=e=>{if(recording)return;const seek=ev=>{current=Math.max(0,Math.min(total(),(ev.clientX-$('#ruler').getBoundingClientRect().left)/zoom));position()};seek(e);$('#ruler').setPointerCapture(e.pointerId);$('#ruler').onpointermove=seek;$('#ruler').onpointerup=()=>$('#ruler').onpointermove=null};
['scale','rotation','brightness','saturation','speed','duration','inPoint'].forEach(k=>{const el=$('#'+k);el.onfocus=()=>checkpoint();el.oninput=()=>{let c=chosen();if(!c)return;let key=k==='inPoint'?'in':k,value=+el.value;if(!Number.isFinite(value))return;if(key==='duration')value=Math.max(.5,Math.min(120,value));if(key==='in')value=Math.max(0,value);let m=media.find(m=>m.id===c.media);if(m.type==='video'){if(key==='in')value=Math.min(value,Math.max(0,m.duration-.5*c.speed));if(key==='duration')value=Math.min(value,(m.duration-c.in)/c.speed);if(key==='speed')c.duration=Math.min(c.duration,(m.duration-c.in)/value)}c[key]=value;if(m.type==='video')c.duration=Math.min(c.duration,(m.duration-c.in)/c.speed);if($('#'+k+'Value'))$('#'+k+'Value').value=value+(k==='rotation'?'°':'%');update()};el.onchange=()=>inspect()});
$('#reset').onclick=()=>{let c=chosen();if(!c)return;checkpoint();Object.assign(c,{scale:100,rotation:0,brightness:100,saturation:100,filter:'none'});update()};
$('#split').onclick=()=>{let a=active();if(!a||current-a.start<.25||a.start+a.c.duration-current<.25)return toast('Move the playhead inside a clip to split');checkpoint();let c=a.c,first=current-a.start,copy={...c,id:MediaImport.createId(),in:c.in+first*c.speed,duration:c.duration-first,transition:{kind:'none',duration:.5},fadeIn:0};c.duration=first;c.fadeOut=0;clips.splice(clips.indexOf(c)+1,0,copy);selected=copy.id;update();toast('Clip split')};
$('#delete').onclick=()=>{if(selectedMusic){checkpoint();music=music.filter(m=>m.id!==selectedMusic);selectedMusic=null;update();setTab('Audio');return}if(!chosen())return;checkpoint();clips=clips.filter(c=>c.id!==selected);selected=clips[0]?.id;update()};$('#duplicate').onclick=()=>{let c=chosen();if(!c)return;checkpoint();let copy={...c,id:MediaImport.createId()};clips.splice(clips.indexOf(c)+1,0,copy);selected=copy.id;update()};
function undo(redo=false){let from=redo?future:history,to=redo?history:future;if(!from.length)return;to.push(JSON.stringify({clips,texts,music}));let state=JSON.parse(from.pop());clips=state.clips;texts=state.texts;music=state.music||[];selectedMusic=null;selected=clips[0]?.id;update();if(activeTab==='Audio'||activeTab==='Transitions')setTab(activeTab)}$('#undo').onclick=()=>undo();$('#redo').onclick=()=>undo(true);
function setZoom(v){zoom=Math.min(70,Math.max(20,v));$('#zoom').value=zoom;timeline()}$('#zoom').oninput=e=>setZoom(+e.target.value);$('#zoomIn').onclick=()=>setZoom(zoom+5);$('#zoomOut').onclick=()=>setZoom(zoom-5);$('#fit').onclick=()=>setZoom(($('#trackScroll').clientWidth-60)/Math.max(1,total()));
function dimensions(){canvas.width=Math.round(ratio>=1?1280:1280*ratio);canvas.height=Math.round(ratio>=1?1280/ratio:1280)}$('#ratio').onchange=e=>{let [w,h]=e.target.value.split('/').map(Number);ratio=w/h;dimensions();save()};$('#fullscreen').onclick=()=>canvas.requestFullscreen?.().catch(()=>toast('Fullscreen unavailable'));
$('#import').onclick=()=>$('#file').click();
$('#file').onchange=async e=>{
  const files=[...e.target.files];
  if(!files.length)return;
  const status=$('#importStatus'),button=$('#import');
  let added=0,failures=[];
  button.disabled=true;status.hidden=false;
  try{
    for(const file of files){
      status.textContent='Reading '+file.name+'…';
      let src;
      try{
        const type=MediaImport.type(file);
        src=URL.createObjectURL(file);
        const duration=await MediaImport.probe(src,type);
        const m={id:MediaImport.createId(),name:file.name,type,src,duration,file};
        media.push(m);if(type==='audio')await makeWaveform(m);added++;
      }catch(error){
        if(src)URL.revokeObjectURL(src);
        failures.push(file.name+': '+error.message);
      }
    }
    renderMedia();if(added)save();
    const summary=added+' '+(added===1?'file':'files')+' imported'+(failures.length?' · '+failures.length+' could not be imported':'');
    status.textContent=[summary,...failures].join('\n');
    status.style.whiteSpace='pre-line';
    toast(added?summary:'Import failed — see the message below Import media.');
  }finally{button.disabled=false;e.target.value=''}
};
$('#search').oninput=renderMedia;$$('[data-kind]').forEach(b=>b.onclick=()=>{kind=b.dataset.kind;$$('[data-kind]').forEach(x=>x.classList.toggle('active',x===b));renderMedia()});
function setTab(name){activeTab=name;$$('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));$('#panelTitle').textContent=name==='Media'?'Your media':name;$('#mediaCount').hidden=name!=='Media';$('#mediaPanel').hidden=name!=='Media';$('#toolPanel').hidden=name==='Media';let panel=$('#toolPanel');if(name==='Audio'){renderAudioPanel();return}if(name==='Transitions'){renderTransitionPanel();return}if(name==='Text'){panel.innerHTML=`<p class="tool-help">A few words can change the whole story.</p><input class="tool-input" id="textInput" aria-label="Overlay text" placeholder="Your story starts here" value="${escapeHTML(texts[0]?.text||'')}"><button class="primary" id="addText">${texts.length?'Update':'Add'} text</button><p class="tool-help">Appears for the first 7 seconds.</p><button class="tool-card" id="removeText">Remove text overlay</button>`;$('#addText').onclick=()=>{let text=$('#textInput').value.trim();if(!text)return;checkpoint();texts=[{text,start:0,end:Math.min(7,total())}];update();toast('Text updated')};$('#removeText').onclick=()=>{checkpoint();texts=[];update();setTab('Text')}}if(name==='Filters'){panel.innerHTML='<p class="tool-help">Set the feeling. Apply a look to the selected clip.</p>'+['Original','Warm film','Black & white','Vintage','Cool blue'].map((s,i)=>`<button class="tool-card" data-filter="${i}">${s}<small>${['True to your moment','Soft, sun-kissed tones','A timeless perspective','A touch of nostalgia','Fresh and cinematic'][i]}</small></button>`).join('');$$('[data-filter]').forEach(b=>b.onclick=()=>{if(!chosen())return;checkpoint();chosen().filter=['none','sepia(0.3) contrast(1.08)','grayscale(1)','sepia(0.6) contrast(0.9)','hue-rotate(15deg) contrast(1.1)'][+b.dataset.filter];update();toast(b.textContent.split('A touch')[0].slice(0,25)+' applied')})}if(name==='Canvas'){panel.innerHTML='<p class="tool-help">Choose the frame for your story.</p>'+[['16/9','Landscape','YouTube · Desktop'],['9/16','Portrait','Reels · Shorts'],['1/1','Square','Social feeds']].map(([v,s,d])=>`<button class="tool-card" data-ratio="${v}">${s}<small>${d}</small></button>`).join('')+'<p class="tool-help">Background color</p><input type="color" id="bgColor" value="'+bg+'">';$$('[data-ratio]').forEach(b=>b.onclick=()=>{$('#ratio').value=b.dataset.ratio;$('#ratio').dispatchEvent(new Event('change'))});$('#bgColor').oninput=e=>{bg=e.target.value;save()}}}

async function makeWaveform(asset){
  try{
    const AudioEngine=window.AudioContext||window.webkitAudioContext,context=new AudioEngine();
    try{
      const buffer=await context.decodeAudioData(await asset.file.arrayBuffer()),data=buffer.getChannelData(0),count=100,step=Math.max(1,Math.floor(data.length/count));
      asset.waveform=Array.from({length:count},(_,i)=>{let peak=0;for(let j=i*step;j<Math.min(data.length,(i+1)*step);j+=Math.max(1,Math.floor(step/128)))peak=Math.max(peak,Math.abs(data[j]));return Math.max(.03,peak)});
    }finally{await context.close()}
  }catch(error){/* Some browser-supported formats cannot be decoded for waveform display. */}
}
function addMusic(asset){
  if(!clips.length)return toast('Add video or images before adding music');
  const start=Math.min(current,Math.max(0,total()-.1));
  const item={id:MediaImport.createId(),media:asset.id,name:asset.name,start,in:0,duration:Math.min(asset.duration,total()-start),volume:25,muted:false,fadeIn:0,fadeOut:0};
  music.push(item);selectedMusic=item.id;update();setTab('Audio');toast('Added to the music track');
}
function audioItem(){return selectedMusic?music.find(m=>m.id===selectedMusic):chosen()}
function renderAudioPanel(){
  const panel=$('#toolPanel'),item=audioItem(),assets=media.filter(m=>m.type==='audio');
  panel.innerHTML=`<button class="import" id="importAudio">＋ Import music<span>MP3, WAV, M4A, AAC, OGG, FLAC</span></button>
    <p class="tool-help">Imported music</p>${assets.map(m=>`<button class="tool-card" data-add-music="${m.id}">♫ ${escapeHTML(m.name)}<small>＋ Add at playhead · ${format(m.duration)}</small></button>`).join('')||'<p class="tool-help">Import an audio file to build your soundtrack.</p>'}
    <div class="section-title">${selectedMusic?'Music track':'Selected clip'} audio</div>
    ${item?`<p class="tool-help">${escapeHTML(item.name)}</p><label class="range-label" for="audioVolume">Volume <output id="audioVolumeValue">${item.volume??100}%</output></label><input type="range" id="audioVolume" min="0" max="100" value="${item.volume??100}"><label class="mute-control"><input type="checkbox" id="audioMuted" ${item.muted?'checked':''}> Mute</label>
    <div class="fields"><label>Fade in (s)<input id="audioFadeIn" type="number" min="0" max="${item.duration}" step="0.1" value="${item.fadeIn||0}"></label><label>Fade out (s)<input id="audioFadeOut" type="number" min="0" max="${item.duration}" step="0.1" value="${item.fadeOut||0}"></label></div>
    ${selectedMusic?`<div class="fields music-timing"><label>Start on timeline (s)<input id="musicStart" type="number" min="0" max="${Math.max(0,total()-.1)}" step="0.1" value="${item.start}"></label><label>Source in (s)<input id="musicIn" type="number" min="0" step="0.1" value="${item.in}"></label><label>Duration (s)<input id="musicDuration" type="number" min="0.1" step="0.1" value="${item.duration}"></label></div><button class="tool-card" id="removeMusic">Remove music clip</button><button class="tool-card" id="selectClipAudio">Edit selected video audio</button>`:''}`:'<p class="tool-help">Select a clip in the timeline.</p>'}`;
  $('#importAudio').onclick=()=>$('#audioFile').click();
  $$('[data-add-music]').forEach(b=>b.onclick=()=>{checkpoint();addMusic(media.find(m=>m.id===b.dataset.addMusic))});
  if(!item)return;
  const bind=(id,key,read)=>{const control=$('#'+id);control.onfocus=()=>checkpoint();control.oninput=()=>{item[key]=read(control);if(id==='audioVolume')$('#audioVolumeValue').value=item.volume+'%';timeline();save()}};
  bind('audioVolume','volume',c=>Number(c.value));bind('audioMuted','muted',c=>c.checked);
  bind('audioFadeIn','fadeIn',c=>TimelineEngine.clamp(Number(c.value)||0,0,item.duration));bind('audioFadeOut','fadeOut',c=>TimelineEngine.clamp(Number(c.value)||0,0,item.duration));
  if(selectedMusic){
    const asset=media.find(m=>m.id===item.media);
    const timing=(id,key)=>{const control=$('#'+id);control.onfocus=()=>checkpoint();control.onchange=()=>{const value=Number(control.value);if(!Number.isFinite(value))return;item[key]=value;item.start=TimelineEngine.clamp(item.start,0,Math.max(0,total()-.1));item.in=TimelineEngine.clamp(item.in,0,Math.max(0,asset.duration-.1));item.duration=TimelineEngine.clamp(item.duration,.1,Math.max(.1,Math.min(asset.duration-item.in,total()-item.start)));update();renderAudioPanel()}};
    timing('musicStart','start');timing('musicIn','in');timing('musicDuration','duration');
    $('#removeMusic').onclick=()=>$('#delete').click();$('#selectClipAudio').onclick=()=>{selectedMusic=null;timeline();renderAudioPanel()};
  }
}
function renderTransitionPanel(){
  const item=chosen(),index=clips.indexOf(item),entry=TimelineEngine.layout(clips)[index];
  $('#toolPanel').innerHTML=`<p class="tool-help">Choose the incoming transition for the selected clip. Click a clip after the first one, or a ◇ marker in the timeline.</p><p class="tool-help">${item?escapeHTML(item.name):'No clip selected'}</p>
    ${index>0?`<div class="transition-grid">${TimelineEngine.transitions.map(([id,label])=>`<button class="tool-card ${((item.transition?.kind||'none')===id)?'active':''}" data-preset="${id}"><span class="transition-icon preset-${id}">◧</span>${label}</button>`).join('')}</div><label>Transition duration (s)<input class="tool-input" id="transitionDuration" type="number" min="0.1" max="${Math.min(clips[index-1].duration/2,item.duration/2)}" step="0.1" value="${entry.overlap||item.transition?.duration||.5}"></label><p class="tool-help">Clips overlap during transitions. Duration is limited to half of each neighboring clip; the timeline length updates automatically.</p><button class="tool-card" id="applyTransitions">Apply this transition to all cuts</button>`:'<p class="tool-help">The first clip has no incoming transition. Select the next clip.</p>'}`;
  $$('[data-preset]').forEach(b=>b.onclick=()=>{checkpoint();item.transition={kind:b.dataset.preset,duration:Number($('#transitionDuration').value)||.5};update();renderTransitionPanel()});
  if(index>0){$('#transitionDuration').onfocus=()=>checkpoint();$('#transitionDuration').onchange=e=>{item.transition={kind:item.transition?.kind||'dissolve',duration:TimelineEngine.clamp(Number(e.target.value)||.5,.1,Math.min(clips[index-1].duration/2,item.duration/2))};update();renderTransitionPanel()};$('#applyTransitions').onclick=()=>{checkpoint();for(const clip of clips.slice(1))clip.transition={...item.transition};update();renderTransitionPanel();toast('Transitions applied to all cuts')}}
}
$('#audioFile').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;let src;
  try{const type=MediaImport.type(file);if(type!=='audio')throw new Error('Choose an audio file.');src=URL.createObjectURL(file);toast('Reading music…');const duration=await MediaImport.probe(src,'audio');const asset={id:MediaImport.createId(),name:file.name,type:'audio',src,duration,file};await makeWaveform(asset);media.push(asset);renderMedia();save();renderAudioPanel();toast('Music imported. Click its name to add it to the track.')}catch(error){if(src)URL.revokeObjectURL(src);toast(error.message)}finally{e.target.value=''}
};
$$('[data-tab]').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));$('#projectName').onchange=save;
document.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)||$('#exportDialog').open)return;if(e.code==='Space'){e.preventDefault();toggle()}if(e.key==='Delete')$('#delete').click();if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();undo(e.shiftKey)}});
let exportController;
$('#export').onclick=()=>{
  if(!clips.length)return toast('Add a clip before exporting');
  if(!window.MediaRecorder||!canvas.captureStream)return toast('This browser does not support video export');
  $('#exportDialog').showModal();
};
$('#closeExport').onclick=()=>{if(recording)exportController?.abort();else $('#exportDialog').close()};
$('#exportDialog').oncancel=e=>{if(recording){e.preventDefault();exportController?.abort()}};
$('#startExport').onclick=async()=>{
  $('#exportError').hidden=true;playing=false;previewPlayer?.stop();recording=true;$('#play').textContent='▶';

  exportController=new AbortController();
  $('#startExport').disabled=true;$('#startExport').textContent='Exporting…';
  $('#closeExport').title='Cancel export';$('#exportProgress').hidden=false;$('#exportProgress').value=0;
  for(const id of ['resolution','exportFps','exportQuality'])$('#'+id).disabled=true;
  try{
    const result=await VideoExport.run({clips,media,music,ratio,resolution:$('#resolution').value,
      fps:Number($('#exportFps').value),quality:$('#exportQuality').value,render:drawComposition,
      signal:exportController.signal,onProgress:value=>$('#exportProgress').value=value});
    const url=URL.createObjectURL(result.blob),link=document.createElement('a');
    link.href=url;link.download=($('#projectName').value||'Cutroom')+'.webm';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    toast(`Exported ${result.width} × ${result.height} with audio`);$('#exportDialog').close();
  }catch(error){
    $('#exportError').hidden=false;$('#exportError').textContent=error.message||'Could not export this project.';
    toast(error.message||'Export failed');
  }finally{
    recording=false;exportController=null;$('#startExport').disabled=false;
    $('#startExport').textContent='Export video ↗';$('#closeExport').title='Close';$('#exportProgress').hidden=true;
    for(const id of ['resolution','exportFps','exportQuality'])$('#'+id).disabled=false;
  }
};
const request=indexedDB.open('cutroom-studio',1);request.onupgradeneeded=()=>request.result.createObjectStore('project');request.onsuccess=()=>{db=request.result;let get=db.transaction('project').objectStore('project').get('main');get.onsuccess=()=>{if(get.result){let s=get.result;clips=s.clips;texts=s.texts;music=s.music||[];previewPlayer?.dispose();previewPlayer=null;media=s.media.map(m=>({...m,src:m.file?URL.createObjectURL(m.file):m.src}));ratio=s.ratio||16/9;bg=s.bg||bg;$('#projectName').value=s.name;$('#ratio').value=ratio===1?'1/1':ratio<1?'9/16':'16/9';selected=clips[0]?.id;dimensions();renderMedia();update(false)}}};request.onerror=()=>toast('Browser saving is unavailable. Keep this tab open.');renderMedia();update(false);new ResizeObserver(()=>timeline()).observe($('#trackScroll'));




