import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
export function fixture(filename=':memory:'){
 const sql=new DatabaseSync(filename);sql.exec('PRAGMA foreign_keys=ON');
 if(!sql.prepare("SELECT name FROM sqlite_schema WHERE name='events'").get())for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
 const prepared=(query,args=[])=>({
  bind:(...values)=>prepared(query,values),
  first:async()=>sql.prepare(query).get(...args)||null,
  all:async()=>({results:sql.prepare(query).all(...args)}),
  run:async()=>({meta:{changes:Number(sql.prepare(query).run(...args).changes)}}),
  execute:()=>/^\s*(SELECT|PRAGMA)/i.test(query)?{results:sql.prepare(query).all(...args),meta:{changes:0}}:{results:[],meta:{changes:Number(sql.prepare(query).run(...args).changes)}}
 });
 return{sql,DB:{prepare:prepared,batch:async statements=>{sql.exec('BEGIN');try{const results=statements.map(s=>s.execute());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}}};
}
