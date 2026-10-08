export function database(env){
 if(!env.DB)throw new Error('Database binding unavailable');
 const db=env.DB;
 return {
  raw:db,
  query:(sql,...args)=>db.prepare(sql).bind(...args),
  one:(sql,...args)=>db.prepare(sql).bind(...args).first(),
  all:async(sql,...args)=>(await db.prepare(sql).bind(...args).all()).results,
  run:(sql,...args)=>db.prepare(sql).bind(...args).run(),
  batch:statements=>db.batch(statements)
 };
}
