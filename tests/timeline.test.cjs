const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../timeline-engine.js'),'utf8')+';globalThis.engine=TimelineEngine;',context);
const engine=context.engine;
const clip=(id,duration,kind='none',transitionDuration=.5)=>({id,duration,transition:{kind,duration:transitionDuration}});
test('old projects retain hard cuts and their original duration',()=>{
 assert.equal(engine.duration([{id:'a',duration:3},{id:'b',duration:4}]),7);
});
test('incoming transitions overlap clips and shorten the timeline',()=>{
 const layout=engine.layout([clip('a',3),clip('b',4,'dissolve',1)]);
 assert.equal(layout[1].start,2);assert.equal(layout[1].end,6);assert.equal(engine.duration(layout.map(e=>e.clip)),6);
 const layers=engine.layers(layout,2.5);assert.equal(layers.length,2);
 assert.equal(engine.audioWeight(layers[0],layers),.5);assert.equal(engine.audioWeight(layers[1],layers),.5);
});
test('short clips clamp overlaps and prevent triple overlaps',()=>{
 const layout=engine.layout([clip('a',1),clip('b',.5,'dissolve',3),clip('c',1,'slide-left',3)]);
 assert.equal(layout[1].overlap,.25);assert.equal(layout[2].overlap,.25);
 for(let t=0;t<2;t+=.01)assert.ok(engine.layers(layout,t).length<=2);
});
test('all presets share the same transition timing',()=>{
 for(const [kind] of engine.transitions){const layout=engine.layout([clip('a',2),clip('b',2,kind,.4)]);assert.equal(layout[1].overlap,kind==='none'?0:.4)}
});
test('volume, mute and both fade envelopes have predictable gains',()=>{
 const item={duration:4,volume:50,fadeIn:1,fadeOut:1};
 assert.equal(engine.envelope(item,0),0);assert.equal(engine.envelope(item,.5),.25);
 assert.equal(engine.envelope(item,2),.5);assert.equal(engine.envelope(item,3.5),.25);
 assert.equal(engine.envelope({...item,muted:true},2),0);assert.equal(engine.envelope(item,4),0);
 assert.equal(engine.envelope({duration:4},2),1);
});
test('unknown transition types fall back to a cut',()=>{
 assert.equal(engine.layout([clip('a',2),clip('b',2,'invalid',1)])[1].overlap,0);
});
test('HTTP LAN UUID generation and audio extension detection',()=>{
 const {webcrypto}=require('node:crypto');const c=vm.createContext({crypto:{getRandomValues:webcrypto.getRandomValues.bind(webcrypto)},Uint8Array});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../media-import.js'),'utf8')+';globalThis.importer=MediaImport',c);
 assert.equal(c.importer.type({name:'music.M4A',type:''}),'audio');
 assert.equal(c.importer.type({name:'IMG_5170.MOV',type:''}),'video');
 assert.match(c.importer.createId(),/^[0-9a-f-]{36}$/);
});
test('portrait export sizes and bitrate scale with resolution',()=>{
 const c=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(__dirname,'../video-export.js'),'utf8')+';globalThis.exporter=VideoExport',c);
 assert.equal(c.exporter.dimensions('1080',9/16,[]).width,1080);
 assert.equal(c.exporter.dimensions('1080',9/16,[]).height,1920);
 assert.ok(c.exporter.bitrate(1920,1080,60,'maximum')>c.exporter.bitrate(1920,1080,30,'maximum'));
});
