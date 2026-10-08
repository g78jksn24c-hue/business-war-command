// Loopback-only preview. Mock identities exist here, never in the production Worker.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import worker from '../src/worker.mjs';
import {fixture} from '../tests/db-fixture.mjs';
const {DB}=fixture(),env={DB,OWNER_SETUP_KEY:'local-only-preview-key',PASSWORD_PEPPER:'local-only-preview-pepper'};
let previewCookie;
async function seed(body,path='/api/action'){
 const h={'Content-Type':'application/json',Origin:'http://127.0.0.1:4173'};if(previewCookie)h.Cookie=previewCookie;
 if(path==='/api/action'){
  const r=await worker.fetch(new Request('http://127.0.0.1:4173/api/state',{headers:previewCookie?{Cookie:previewCookie}:{}}),env,{}),d=await r.json();body.revision=d.event?.revision;
 }
 const r=await worker.fetch(new Request('http://127.0.0.1:4173'+path,{method:'POST',headers:h,body:JSON.stringify(body)}),env,{});
 if(r.headers.get('Set-Cookie'))previewCookie=r.headers.get('Set-Cookie').split(';')[0];
 const d=await r.json();if(!r.ok)throw new Error(d.error);return d;
}
await seed({owner:true,code:env.OWNER_SETUP_KEY,username:'preview_admin',password:'Preview_12345!',name:'预览主办方'},'/api/register');
await seed({action:'new_event',name:'七天商战 · 本地预览'});
for(const[name,note]of [['星辰公司','以行动创造价值'],['远航公司','一起向前'],['启航公司','稳扎稳打']])await seed({action:'company_create',name,note});
let preview=await(await worker.fetch(new Request('http://127.0.0.1:4173/api/state',{headers:{Cookie:previewCookie}}),env,{})).json();
for(const[i,c]of preview.companies.entries())for(const[name,position]of [[['陈宇','林悦','周浩'][i],'boss'],[['李晨','赵欣','王宁'][i],'staff']])await seed({action:'person_create',name,position,companyId:c.id});
preview=await(await worker.fetch(new Request('http://127.0.0.1:4173/api/state',{headers:{Cookie:previewCookie}}),env,{})).json();
for(let day=1;day<=3;day++){
 if(day>1)await seed({action:'next_day'});
 for(const[i,p]of preview.persons.entries())await seed({action:'record_create',personId:p.id,day,direction:'income',amount:String(300+i*80+day*60),category:'销售收益',direct:true,requestId:`preview-${day}-${i}`});
}
const assets=new Set(['index.html','style.css','layout.css','app.mjs','ui.mjs','controller.mjs','domain.mjs']);
const previewPort=4187,previewOrigin='http://127.0.0.1:'+previewPort;
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,previewOrigin);
  if(url.pathname.startsWith('/api/')){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const body=Buffer.concat(chunks),headers=new Headers(req.headers);
   const request=new Request(url,{method:req.method,headers,body:body.length?body:undefined});
   const result=await worker.fetch(request,env,{});
   res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));return;
  }
  const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
  if(!assets.has(name)){res.writeHead(404);res.end('Not found');return;}
  const data=await readFile(path.resolve('public',name));
  res.writeHead(200,{'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8','Cache-Control':'no-store'});res.end(data);
});
server.listen(previewPort,'127.0.0.1',()=>console.log('Local: '+previewOrigin));
