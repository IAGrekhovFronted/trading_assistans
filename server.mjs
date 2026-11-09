import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.argv.find(v=>v.startsWith('--port='))?.split('=')[1]||4666);
const allowed=new Set(['index.html','styles.css','app.mjs','engine.mjs','storage.mjs','schemes.mjs','builder.mjs','examples.mjs','hint-images.mjs','image-drop.mjs','scheme-map.mjs','journal.mjs','scheme-flow.mjs','trade-data.mjs','trade-parsers.mjs','parsers/sprint-details.mjs','trade-import.mjs']);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  if(url.pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({app:'entry-navigator',version:'0.1',port}));return;}
  const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
  if(!allowed.has(name)){res.writeHead(404);res.end('Not found');return;}
  try{const body=await fs.readFile(path.join(root,name));res.writeHead(200,{'Content-Type':types[path.extname(name)],'Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'"});res.end(req.method==='HEAD'?undefined:body);}catch{res.writeHead(500);res.end('Unable to read application');}
});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'Порт уже занят. Открой http://127.0.0.1:'+port:e.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log('Точка входа: http://127.0.0.1:'+port));
