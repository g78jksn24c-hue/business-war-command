import {mkdir,readFile,writeFile,cp,rm} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(),dist=path.join(root,'dist');
if(path.basename(root)!=='business-war-site')throw new Error('Build must run in the site checkout');
// dist is exclusively generated output; source and old offline deliverables remain intact.
await rm(dist,{recursive:true,force:true});await mkdir(path.join(dist,'server'),{recursive:true});
await cp('src',path.join(dist,'server'),{recursive:true});
await cp('public',path.join(dist,'client'),{recursive:true});
const files={'index.html':'text/html; charset=utf-8','style.css':'text/css; charset=utf-8','layout.css':'text/css; charset=utf-8','app.mjs':'text/javascript; charset=utf-8','controller.mjs':'text/javascript; charset=utf-8','ui.mjs':'text/javascript; charset=utf-8','domain.mjs':'text/javascript; charset=utf-8'},assets={};
for(const[name,type]of Object.entries(files))assets['/'+name]={type,body:await readFile('public/'+name,'utf8')};
await writeFile(path.join(dist,'server','assets.mjs'),'export const assets='+JSON.stringify(assets)+';\n');
await writeFile(path.join(dist,'server','index.js'),"export {default} from './worker.mjs';\n");
await mkdir(path.join(dist,'.openai'),{recursive:true});await cp('.openai/hosting.json',path.join(dist,'.openai/hosting.json'));await cp('drizzle',path.join(dist,'.openai/drizzle'),{recursive:true});
await writeFile(path.join(dist,'server','wrangler.json'),JSON.stringify({name:'business-war-command',main:'index.js',compatibility_date:'2026-10-01',d1_databases:[{binding:'DB',database_name:'business-war',database_id:'local-preview-only'}]},null,2));
console.log('Built Worker, browser assets and immutable D1 migrations.');
