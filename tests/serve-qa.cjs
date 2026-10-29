// Local-only browser checks. Generated fixtures stay in ignored tests/artifacts/.
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const root=path.resolve(__dirname,'..'),artifacts=path.join(__dirname,'artifacts');
fs.mkdirSync(artifacts,{recursive:true});
const server=http.createServer((req,res)=>{
  try{
    const url=decodeURIComponent(req.url.split('?')[0]);
    const outputs={'/source':'source.webm','/wave':'tone.wav','/artifact':'export.webm'};
    if(req.method==='POST'&&outputs[url]){
      const file=fs.createWriteStream(path.join(artifacts,outputs[url]));
      file.on('error',()=>{res.writeHead(500);res.end('Could not save fixture')});
      req.pipe(file);file.on('finish',()=>res.end('saved'));return;
    }
    const file=url==='/qa'?path.join(__dirname,'browser-qa.html'):path.resolve(root,'.'+(url==='/'?'/index.html':url));
    if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end('Forbidden')}
    fs.readFile(file,(error,data)=>{
      if(error){res.writeHead(404);return res.end('Not found')}
      res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8');res.end(data);
    });
  }catch(error){res.writeHead(400);res.end('Bad request')}
});
server.listen(0,'127.0.0.1',()=>console.log(`Open http://127.0.0.1:${server.address().port}/qa and click Run browser checks. Keep the tab visible. Ctrl+C stops the server.`));
