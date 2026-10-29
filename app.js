const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const photos=['photo-1473116763249-2faaef81ccda','photo-1518837695005-2083093ee35b','photo-1470252649378-9c29740c9fa8','photo-1464822759023-fed622ff2c3b'];
let media=photos.map((p,i)=>({id:'m'+i,name:['Coastal mornings','Into the blue','Golden hour','The way home'][i],type:'image',src:`https://images.unsplash.com/${p}?auto=format&fit=crop&w=1600&q=85`,duration:5}));
let clips=media.map((m,i)=>({id:'c'+i,media:m.id,name:m.name,duration:5,in:0,scale:100,rotation:0,brightness:100,saturation:100,speed:1,filter:'none'}));
let texts=[{text:'a little escape.',start:0,end:7}],selected='c0',current=0,playing=false,zoom=36,ratio=16/9,bg='#0c1114',kind='all',history=[],future=[],db,recording=false;
const cache=new Map(),canvas=$('#preview'),ctx=canvas.getContext('2d');
function toast(s){$('#toast').textContent=s;$('#toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('visible'),2800)}
function total(){return clips.reduce((s,c)=>s+c.duration,0)}
function chosen(){return clips.find(c=>c.id===selected)}
function format(t){return `${String(Math.floor(t/60)).padStart(2,'0')}:${(t%60).toFixed(1).padStart(4,'0')}`}
function escapeHTML(t){return String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function checkpoint(){history.push(JSON.stringify({clips,texts}));if(history.length>40)history.shift();future=[]}
function save(){if(!db)return;let transaction=db.transaction('project','readwrite');transaction.objectStore('project').put({clips,texts,media:media.map(m=>({...m,src:m.file?null:m.src})),name:$('#projectName').value,ratio,bg},'main');transaction.oncomplete=()=>$('#saved').textContent='✓ All changes saved';transaction.onerror=()=>{$('#saved').textContent='Saving unavailable';toast('Browser storage is full. Export your work before closing.')};$('#saved').textContent='Saving…'}
function source(m){if(cache.has(m.id))return cache.get(m.id);let el;if(m.type==='video'){el=document.createElement('video');el.src=m.src;el.muted=false;el.playsInline=true;el.preload='auto'}else{el=new Image();el.crossOrigin='anonymous';el.src=m.src}cache.set(m.id,el);return el}
function renderMedia(){let list=media.filter(m=>(kind==='all'||m.type===kind)&&m.name.toLowerCase().includes($('#search').value.toLowerCase()));$('#mediaGrid').innerHTML=list.map(m=>`<div class="media-card"><div class="thumb">${m.type==='image'?`<img src="${escapeHTML(m.src)}" alt="${escapeHTML(m.name)}">`:`<video src="${escapeHTML(m.src)}" muted preload="metadata"></video>`}<span>${m.type==='image'?'▧':format(m.duration)}</span><button data-add="${m.id}" title="Add ${escapeHTML(m.name)} to timeline">＋</button></div><p>${escapeHTML(m.name)}</p></div>`).join('')||'<p class="tool-help">No matching media.</p>';$('#mediaCount').textContent=media.length+' items';$$('[data-add]').forEach(b=>b.onclick=()=>add(b.dataset.add))}
function add(id){checkpoint();const m=media.find(m=>m.id===id);const c={id:MediaImport.createId(),media:id,name:m.name,duration:Math.min(m.duration,10),in:0,scale:100,rotation:0,brightness:100,saturation:100,speed:1,filter:'none'};clips.push(c);selected=c.id;update();toast('Added to timeline')}
function timeline(){const width=Math.max(total()*zoom+80,$('#trackScroll').clientWidth);$('#trackContent').style.width=width+'px';let marks='';for(let t=0;t<Math.max(total()+2,width/zoom);t+=2)marks+=`<span style="left:${t*zoom}px">${format(t)}</span>`;$('#ruler').innerHTML=marks;$('#videoTrack').innerHTML=clips.map(c=>{let m=media.find(m=>m.id===c.media);return `<div class="clip ${c.id===selected?'selected':''}" draggable="true" data-clip="${c.id}" style="width:${Math.max(12,c.duration*zoom-2)}px;${m.type==='image'?`background-image:url('${escapeHTML(m.src)}')`:'background:linear-gradient(120deg,#34585e,#192b32)'}" title="${escapeHTML(c.name)} · Drag to reorder"><span>${escapeHTML(c.name)} · ${c.duration.toFixed(1)}s</span></div>`}).join('');$('#textTrack').innerHTML=texts.map((t,i)=>`<button class="text-block" data-text="${i}" style="left:${t.start*zoom}px;width:${Math.max(30,(t.end-t.start)*zoom)}px">Ｔ ${escapeHTML(t.text)}</button>`).join('');$$('[data-clip]').forEach(el=>{el.onclick=()=>{selected=el.dataset.clip;update(false)};el.ondragstart=e=>e.dataTransfer.setData('text/plain',el.dataset.clip);el.ondragover=e=>e.preventDefault();el.ondrop=e=>{e.preventDefault();let from=clips.findIndex(c=>c.id===e.dataTransfer.getData('text/plain')),to=clips.findIndex(c=>c.id===el.dataset.clip);if(from<0)return;checkpoint();clips.splice(to,0,clips.splice(from,1)[0]);update()}});$$('[data-text]').forEach(b=>b.onclick=()=>setTab('Text'));$('#clipCount').textContent=clips.length;$('#total').textContent=format(total())+' duration';position()}
function inspect(){let c=chosen();$('#selectedName').textContent=c?.name||'No clip selected';['scale','rotation','brightness','saturation','speed','duration','inPoint'].forEach(k=>{$('#'+k).disabled=!c;if(c)$('#'+k).value=c[k==='inPoint'?'in':k]});['scale','rotation','brightness','saturation'].forEach(k=>$('#'+k+'Value').value=(c?.[k]??100)+(k==='rotation'?'°':'%'))}
function update(persist=true){current=Math.min(current,total());timeline();inspect();if(persist)save()}
function position(){$('#playhead').style.left=current*zoom+'px';$('#time').innerHTML=`${format(current)} <em>/ ${format(total())}</em>`}
function active(){let start=0;for(const c of clips){if(current<start+c.duration||c===clips.at(-1))return {c,start};start+=c.duration}return null}
function drawComposition(output,c,el,time){
  const context=output.getContext('2d'),width=output.width,height=output.height;
  context.fillStyle=bg;context.fillRect(0,0,width,height);
  const w=el?.videoWidth||el?.naturalWidth,h=el?.videoHeight||el?.naturalHeight;
  if(c&&w&&h){
    context.save();context.translate(width/2,height/2);context.rotate(c.rotation*Math.PI/180);
    const scale=Math.max(width/w,height/h)*c.scale/100;
    context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
    context.filter=`brightness(${c.brightness}%) saturate(${c.saturation}%) ${c.filter==='none'?'':c.filter}`;
    context.drawImage(el,-w*scale/2,-h*scale/2,w*scale,h*scale);context.restore();
  }
  for(const t of texts)if(time>=t.start&&time<t.end){
    context.save();context.textAlign='center';context.fillStyle='white';context.font=`500 ${width*.061}px Georgia`;
    context.shadowColor='#0006';context.shadowBlur=15;context.fillText(t.text,width/2,height*.54,width*.9);
    context.font=`500 ${width*.011}px sans-serif`;
    context.fillText('S L O W   D O W N .   L O O K   A R O U N D .',width/2,height*.61);context.restore();
  }
}
function draw(){
  const a=active();let element;
  if(a){
    const m=media.find(m=>m.id===a.c.media);element=source(m);
    if(m.type==='video'&&element.readyState>=2){
      const target=a.c.in+Math.min(current-a.start,a.c.duration)*a.c.speed;
      if(Math.abs(element.currentTime-target)>.18&&!element.seeking)element.currentTime=target;
      element.playbackRate=a.c.speed;
      if(playing&&!element.seeking)element.play().catch(()=>{});else if(!playing)element.pause();
    }
    for(const [id,other] of cache)if(id!==m.id&&other.tagName==='VIDEO')other.pause();
  }
  drawComposition(canvas,a?.c,element,current);
}
let last=0;function frame(now){if(playing){current+=Math.max(0,(now-last)/1000);if(current>=total()){current=total();playing=false;$('#play').textContent='▶'}position()}last=now;draw();}setInterval(()=>frame(performance.now()),1000/30);
function toggle(){if(recording)return;if(!clips.length)return toast('Add media to begin');if(current>=total())current=0;playing=!playing;$('#play').textContent=playing?'Ⅱ':'▶'}$('#play').onclick=toggle;$('#previous').onclick=()=>{current=0;position()};$('#next').onclick=()=>{current=total();playing=false;$('#play').textContent='▶';position()};
$('#ruler').onpointerdown=e=>{if(recording)return;const seek=ev=>{current=Math.max(0,Math.min(total(),(ev.clientX-$('#ruler').getBoundingClientRect().left)/zoom));position()};seek(e);$('#ruler').setPointerCapture(e.pointerId);$('#ruler').onpointermove=seek;$('#ruler').onpointerup=()=>$('#ruler').onpointermove=null};
['scale','rotation','brightness','saturation','speed','duration','inPoint'].forEach(k=>{const el=$('#'+k);el.onfocus=()=>checkpoint();el.oninput=()=>{let c=chosen();if(!c)return;let key=k==='inPoint'?'in':k,value=+el.value;if(!Number.isFinite(value))return;if(key==='duration')value=Math.max(.5,Math.min(120,value));if(key==='in')value=Math.max(0,value);let m=media.find(m=>m.id===c.media);if(m.type==='video'){if(key==='in')value=Math.min(value,Math.max(0,m.duration-.5*c.speed));if(key==='duration')value=Math.min(value,(m.duration-c.in)/c.speed);if(key==='speed')c.duration=Math.min(c.duration,(m.duration-c.in)/value)}c[key]=value;if(m.type==='video')c.duration=Math.min(c.duration,(m.duration-c.in)/c.speed);if($('#'+k+'Value'))$('#'+k+'Value').value=value+(k==='rotation'?'°':'%');timeline();save()};el.onchange=()=>inspect()});
$('#reset').onclick=()=>{let c=chosen();if(!c)return;checkpoint();Object.assign(c,{scale:100,rotation:0,brightness:100,saturation:100,filter:'none'});update()};
$('#split').onclick=()=>{let a=active();if(!a||current-a.start<.25||a.start+a.c.duration-current<.25)return toast('Move the playhead inside a clip to split');checkpoint();let c=a.c,first=current-a.start,copy={...c,id:MediaImport.createId(),in:c.in+first*c.speed,duration:c.duration-first};c.duration=first;clips.splice(clips.indexOf(c)+1,0,copy);selected=copy.id;update();toast('Clip split')};
$('#delete').onclick=()=>{if(!chosen())return;checkpoint();clips=clips.filter(c=>c.id!==selected);selected=clips[0]?.id;update()};$('#duplicate').onclick=()=>{let c=chosen();if(!c)return;checkpoint();let copy={...c,id:MediaImport.createId()};clips.splice(clips.indexOf(c)+1,0,copy);selected=copy.id;update()};
function undo(redo=false){let from=redo?future:history,to=redo?history:future;if(!from.length)return;to.push(JSON.stringify({clips,texts}));let state=JSON.parse(from.pop());clips=state.clips;texts=state.texts;selected=clips[0]?.id;update()}$('#undo').onclick=()=>undo();$('#redo').onclick=()=>undo(true);
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
        media.push(m);source(m);added++;
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
function setTab(name){$$('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));$('#panelTitle').textContent=name==='Media'?'Your media':name;$('#mediaCount').hidden=name!=='Media';$('#mediaPanel').hidden=name!=='Media';$('#toolPanel').hidden=name==='Media';let panel=$('#toolPanel');if(name==='Text'){panel.innerHTML=`<p class="tool-help">A few words can change the whole story.</p><input class="tool-input" id="textInput" aria-label="Overlay text" placeholder="Your story starts here" value="${escapeHTML(texts[0]?.text||'')}"><button class="primary" id="addText">${texts.length?'Update':'Add'} text</button><p class="tool-help">Appears for the first 7 seconds.</p><button class="tool-card" id="removeText">Remove text overlay</button>`;$('#addText').onclick=()=>{let text=$('#textInput').value.trim();if(!text)return;checkpoint();texts=[{text,start:0,end:Math.min(7,total())}];update();toast('Text updated')};$('#removeText').onclick=()=>{checkpoint();texts=[];update();setTab('Text')}}if(name==='Filters'){panel.innerHTML='<p class="tool-help">Set the feeling. Apply a look to the selected clip.</p>'+['Original','Warm film','Black & white','Vintage','Cool blue'].map((s,i)=>`<button class="tool-card" data-filter="${i}">${s}<small>${['True to your moment','Soft, sun-kissed tones','A timeless perspective','A touch of nostalgia','Fresh and cinematic'][i]}</small></button>`).join('');$$('[data-filter]').forEach(b=>b.onclick=()=>{if(!chosen())return;checkpoint();chosen().filter=['none','sepia(0.3) contrast(1.08)','grayscale(1)','sepia(0.6) contrast(0.9)','hue-rotate(15deg) contrast(1.1)'][+b.dataset.filter];update();toast(b.textContent.split('A touch')[0].slice(0,25)+' applied')})}if(name==='Canvas'){panel.innerHTML='<p class="tool-help">Choose the frame for your story.</p>'+[['16/9','Landscape','YouTube · Desktop'],['9/16','Portrait','Reels · Shorts'],['1/1','Square','Social feeds']].map(([v,s,d])=>`<button class="tool-card" data-ratio="${v}">${s}<small>${d}</small></button>`).join('')+'<p class="tool-help">Background color</p><input type="color" id="bgColor" value="'+bg+'">';$$('[data-ratio]').forEach(b=>b.onclick=()=>{$('#ratio').value=b.dataset.ratio;$('#ratio').dispatchEvent(new Event('change'))});$('#bgColor').oninput=e=>{bg=e.target.value;save()}}}
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
  $('#exportError').hidden=true;playing=false;recording=true;$('#play').textContent='▶';
  for(const element of cache.values())if(element.tagName==='VIDEO')element.pause();
  exportController=new AbortController();
  $('#startExport').disabled=true;$('#startExport').textContent='Exporting…';
  $('#closeExport').title='Cancel export';$('#exportProgress').hidden=false;$('#exportProgress').value=0;
  for(const id of ['resolution','exportFps','exportQuality'])$('#'+id).disabled=true;
  try{
    const result=await VideoExport.run({clips,media,ratio,resolution:$('#resolution').value,
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
const request=indexedDB.open('cutroom-studio',1);request.onupgradeneeded=()=>request.result.createObjectStore('project');request.onsuccess=()=>{db=request.result;let get=db.transaction('project').objectStore('project').get('main');get.onsuccess=()=>{if(get.result){let s=get.result;clips=s.clips;texts=s.texts;media=s.media.map(m=>({...m,src:m.file?URL.createObjectURL(m.file):m.src}));ratio=s.ratio||16/9;bg=s.bg||bg;$('#projectName').value=s.name;$('#ratio').value=ratio===1?'1/1':ratio<1?'9/16':'16/9';selected=clips[0]?.id;dimensions();renderMedia();update(false)}media.forEach(source)}};request.onerror=()=>toast('Browser saving is unavailable. Keep this tab open.');renderMedia();update(false);new ResizeObserver(()=>timeline()).observe($('#trackScroll'));


