import {database} from './db.mjs';
import {amountCents,settlement,totals,positions} from './domain.mjs';
import {assets} from './assets.mjs';
import * as auth from './auth.mjs';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const now=()=>new Date().toISOString(),id=()=>crypto.randomUUID();
function fail(message,status=400){throw Object.assign(new Error(message),{status});}
function text(value,max=100){if(typeof value!=='string'||!value.trim()||value.trim().length>max)fail(`请填写不超过 ${max} 字的内容`);return value.trim();}
function note(value){if(value!=null&&typeof value!=='string')fail('备注格式不正确');return String(value||'').trim().slice(0,500);}
function integer(value,min,max){if(!Number.isInteger(value)||value<min||value>max)fail('数值超出允许范围');return value;}
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
async function eventOf(db){return db.one("SELECT * FROM events WHERE id=(SELECT value FROM app_config WHERE key='active_event')");}
async function userOf(db,identity,event){if(!identity)return null;const user=await db.one('SELECT * FROM users WHERE id=?',identity.id);if(!user)return null;if(user.role==='admin')return user;return event&&user.event_id===event.id?user:null;}
async function ownerClaim(db,env,identity,body,accountStatement){
 if(!env.OWNER_SETUP_KEY||body.code!==env.OWNER_SETUP_KEY)fail('主办方启用码不正确',403);
 const created=now();
 await db.batch([
  db.query("INSERT INTO app_config(key,value) VALUES('owner_id',?) ON CONFLICT(key) DO NOTHING",identity.id),
  ...accountStatement?[accountStatement]:[],
  db.query("INSERT INTO users(id,name,role,created_at) SELECT ?,?,'admin',? WHERE (SELECT value FROM app_config WHERE key='owner_id')=? ON CONFLICT(id) DO UPDATE SET role='admin'",identity.id,text(body.name||identity.name,60),created,identity.id)
 ]);
 const owner=await db.one("SELECT value FROM app_config WHERE key='owner_id'");
 if(owner?.value!==identity.id)fail('主办方已启用，请向现有主办方申请权限',403);
 return{ok:true};
}
async function createEvent(db,user,body){
 const eventId=id(),created=now(),name=text(body.name||'七天商战',100);
 const statements=[db.query('INSERT INTO events(id,name,created_at) VALUES(?,?,?)',eventId,name,created),db.query("UPDATE users SET event_id=? WHERE role='ta' AND event_id=(SELECT value FROM app_config WHERE key='active_event')",eventId),db.query("INSERT INTO app_config(key,value) VALUES('active_event',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",eventId),db.query('INSERT INTO audit(id,event_id,user_id,action,detail,created_at) VALUES(?,?,?,?,?,?)',id(),eventId,user.id,'new_event',name,created)];
 await db.batch(statements);return{ok:true,eventId};
}
async function join(db,identity,body,event,accountStatement){
 if(!event)fail('活动尚未创建，请联系主办方',409);
 const hash=await digest(text(body.code,100).toUpperCase()),invite=await db.one('SELECT * FROM invites WHERE hash=? AND event_id=?',hash,event.id);
 if(!invite||invite.expires_at<now()||invite.consumed_by&&invite.consumed_by!==identity.id)fail('邀请码无效、已使用或已过期',403);
 if(invite.role!=='ta')fail('本网站仅供主办方和助教使用',403);
 const existing=await db.one('SELECT * FROM users WHERE id=?',identity.id);
 if(existing?.role==='admin')fail('主办方无需使用学员邀请码');
 if(invite.role==='student'){
  const person=await db.one('SELECT * FROM persons WHERE id=? AND event_id=? AND active=1',invite.person_id,event.id);
  if(!person||person.user_id&&person.user_id!==identity.id)fail('学员已绑定其他账号，请联系主办方',409);
  const linked=await db.one('SELECT id FROM persons WHERE event_id=? AND user_id=? AND id!=?',event.id,identity.id,person.id);
  if(linked)fail('你的账号已绑定其他学员，请联系主办方',409);
 }
 const created=now(),name=text(body.name||identity.name,60);
 const guard="EXISTS(SELECT 1 FROM invites WHERE hash=? AND consumed_by=? AND event_id=(SELECT value FROM app_config WHERE key='active_event'))";
 const statements=[db.query('UPDATE invites SET consumed_by=? WHERE hash=? AND (consumed_by IS NULL OR consumed_by=?) AND expires_at>=? AND event_id=(SELECT value FROM app_config WHERE key=?)',identity.id,hash,identity.id,created,'active_event')];
 if(accountStatement)statements.push(accountStatement);
 if(invite.role==='student')statements.push(db.query(`UPDATE persons SET user_id=? WHERE id=? AND (user_id IS NULL OR user_id=?) AND ${guard}`,identity.id,invite.person_id,identity.id,hash,identity.id));
 statements.push(db.query(`INSERT INTO users(id,name,role,event_id,created_at) SELECT ?,?,?,?,? WHERE ${guard} ON CONFLICT(id) DO UPDATE SET name=excluded.name,role=excluded.role,event_id=excluded.event_id`,identity.id,name,invite.role,event.id,created,hash,identity.id));
 const result=await db.batch(statements);if(!result[0].meta.changes)fail('邀请码已被使用，请重新获取',409);return{ok:true};
}
async function stateOf(db,user,event){
 const results=await db.batch([
  db.query('SELECT * FROM events WHERE id=?',event.id),
  db.query('SELECT * FROM companies WHERE event_id=? ORDER BY created_at',event.id),
  db.query('SELECT * FROM persons WHERE event_id=? ORDER BY created_at',event.id),
  db.query('SELECT * FROM records WHERE event_id=? ORDER BY submit_at DESC',event.id)
 ]);
 const [e,c,p,r]=results.map(x=>x.results),current=e[0],earned=totals(p,r);
 const mine=p.find(x=>x.user_id===user.id&&x.active);
 if(user.role==='student'&&!mine)fail('学员账号已停用或尚未绑定，请联系主办方',403);
 const visible=p.map(({user_id,...x})=>({...x,balance:earned[x.id],linked:Boolean(user_id)}));
 if(user.role==='student'){
  const allowed=r.filter(x=>x.person_id===mine.id).map(({submit_by,review_by,...x})=>x);
  const snapshot=current.snapshot?JSON.parse(current.snapshot).filter(x=>x.personId===mine.id):null;
  return{event:{...current,gate:undefined,snapshot},companies:c,persons:visible.filter(x=>x.active),records:allowed,me:{...user,personId:mine.id},serverTime:now()};
 }
 const accounts=user.role==='admin'?await db.all("SELECT u.id,u.name,u.role,a.username,CASE WHEN u.role='admin' OR u.event_id=? THEN 1 ELSE 0 END AS active FROM users u JOIN accounts a ON a.id=u.id WHERE u.role IN ('admin','ta') ORDER BY u.created_at",event.id):[];
 const invites=user.role==='admin'?await db.all('SELECT role,person_id,expires_at,consumed_by FROM invites WHERE event_id=?',event.id):[];
 const history=user.role==='admin'?await db.all('SELECT id,name,day,settled,created_at FROM events ORDER BY created_at DESC'):[];
 return{event:{...current,gate:undefined,snapshot:current.snapshot?JSON.parse(current.snapshot):null},companies:c,persons:visible,records:r,accounts,invites,history,me:user,serverTime:now()};
}
async function mutate(db,user,event,body,env){
 const action=body.action,admin=user.role==='admin',staff=admin||user.role==='ta';
 const mustAdmin=()=>{if(!admin)fail('只有主办方可以进行此操作',403);};
 const mustStaff=()=>{if(!staff)fail('只有主办方和助教可以管理人员与公司',403);};
 if(action==='new_event'){mustAdmin();if(event&&body.confirm!=='开启新活动')fail('请输入“开启新活动”确认');return createEvent(db,user,body);}
 if(!event)fail('请先创建活动',409);
 if(event.settled&&!['invite','revoke_invites','unbind','profile','reopen','account_create','account_password','account_enable','revoke_ta'].includes(action))fail('活动已结算，主办方可在设置中重新开放',409);
 integer(body.revision,0,Number.MAX_SAFE_INTEGER);
 const gate=id(),statements=[],created=now();
 const check="EXISTS(SELECT 1 FROM events WHERE id=? AND gate=?)";
 const params=()=>[event.id,gate];
 const insert=(table,columns,values)=>statements.push(db.query(`INSERT INTO ${table}(${columns.join(',')}) SELECT ${values.map(()=>'?').join(',')} WHERE ${check}`,...values,...params()));
 const update=(sql,values)=>statements.push(db.query(`${sql} AND ${check}`,...values,...params()));
 const person=async personId=>{const p=await db.one('SELECT * FROM persons WHERE id=? AND event_id=?',personId,event.id);if(!p)fail('找不到此学员',404);return p;};
 const company=async companyId=>{if(!companyId)return null;const c=await db.one('SELECT * FROM companies WHERE id=? AND event_id=?',companyId,event.id);if(!c)fail('找不到此公司',404);return c;};
 let response={ok:true};
 switch(action){
  case 'account_create':mustAdmin();{
   if(body.role&&body.role!=='ta')fail('新增账号只能授予助教权限');
   const username=auth.username(body.username);auth.password(body.password);
   if(await db.one('SELECT id FROM accounts WHERE username=?',username))fail('此账号已经存在');
   const accountId=id(),salt=auth.random(),hash=await auth.passwordHash(body.password,salt,env);
   insert('accounts',['id','username','password_hash','salt','created_at'],[accountId,username,hash,salt,created]);
   insert('users',['id','name','role','event_id','created_at'],[accountId,text(body.name,60),'ta',event.id,created]);break;
  }
  case 'account_password':mustAdmin();{
   const account=await db.one("SELECT a.* FROM accounts a JOIN users u ON u.id=a.id WHERE a.id=? AND u.role='ta'",body.id);if(!account)fail('只能重置助教的密码');
   const salt=auth.random(),hash=await auth.passwordHash(auth.password(body.password),salt,env);
   update('UPDATE accounts SET salt=?,password_hash=? WHERE id=?',[salt,hash,body.id]);update('DELETE FROM sessions WHERE account_id=?',[body.id]);break;
  }
  case 'account_enable':mustAdmin();update("UPDATE users SET event_id=? WHERE id=? AND role='ta'",[event.id,body.id]);break;
  case 'company_create':mustStaff();insert('companies',['id','event_id','name','note','created_at'],[id(),event.id,text(body.name),note(body.note),created]);break;
  case 'company_update':mustStaff();await company(body.id);update('UPDATE companies SET name=?,note=? WHERE id=? AND event_id=?',[text(body.name),note(body.note),body.id,event.id]);break;
  case 'company_remove':mustAdmin();await company(body.id);if(body.confirm!=='删除公司')fail('请输入“删除公司”确认');update('UPDATE persons SET company_id=NULL WHERE company_id=? AND event_id=?',[body.id,event.id]);update('DELETE FROM companies WHERE id=? AND event_id=?',[body.id,event.id]);break;
  case 'person_create':mustStaff();await company(body.companyId);if(!positions[body.position||'staff'])fail('职位不正确');insert('persons',['id','event_id','name','company_id','position','created_at'],[id(),event.id,text(body.name,60),body.companyId||null,body.position||'staff',created]);break;
  case 'person_update':mustStaff();await person(body.id);await company(body.companyId);if(!positions[body.position])fail('职位不正确');update('UPDATE persons SET name=?,company_id=?,position=?,active=? WHERE id=? AND event_id=?',[text(body.name,60),body.companyId||null,body.position,body.active===false?0:1,body.id,event.id]);break;
  case 'person_remove':mustStaff();await person(body.id);if(body.confirm!=='停用学员')fail('请输入“停用学员”确认');update('UPDATE persons SET active=0,company_id=NULL WHERE id=? AND event_id=?',[body.id,event.id]);update('UPDATE invites SET expires_at=? WHERE person_id=? AND event_id=?',[created,body.id,event.id]);break;
  case 'unbind':mustAdmin();{const p=await person(body.id);update('UPDATE persons SET user_id=NULL WHERE id=? AND event_id=?',[p.id,event.id]);update('UPDATE invites SET expires_at=? WHERE person_id=? AND event_id=?',[created,p.id,event.id]);if(p.user_id)update("UPDATE users SET event_id=NULL WHERE id=? AND role!='admin'",[p.user_id]);}break;
  case 'record_create':{
   let p;if(staff)p=await person(body.personId);else p=await db.one('SELECT * FROM persons WHERE event_id=? AND user_id=? AND active=1',event.id,user.id);
   if(!p||!p.active)fail('学员不存在或已停用',403);
   const day=staff?integer(body.day,1,event.day):event.day;
   const amount=amountCents(body.amount)*(body.direction==='expense'?-1:1);
   if(!['income','expense'].includes(body.direction))fail('请选择收入或支出');
   const requestId=text(body.requestId,100);
   const duplicate=await db.one('SELECT id FROM records WHERE submit_by=? AND request_id=?',user.id,requestId);
   if(duplicate)return{ok:true,duplicate:true};
   const direct=admin&&body.direct===true;
   insert('records',['id','event_id','person_id','day','amount','category','note','status','submit_by','submit_at','review_by','review_at','request_id'],[id(),event.id,p.id,day,amount,text(body.category,60),note(body.note),direct?'approved':'pending',user.id,created,direct?user.id:null,direct?created:null,requestId]);break;
  }
  case 'record_review':mustAdmin();{
   if(!['approved','rejected'].includes(body.status))fail('审批状态不正确');
   const r=await db.one('SELECT * FROM records WHERE id=? AND event_id=?',body.id,event.id);if(!r||r.status!=='pending')fail('此申报已处理，请刷新',409);
   update('UPDATE records SET status=?,review_by=?,review_at=?,reject_reason=? WHERE id=? AND event_id=? AND status=?',[body.status,user.id,created,body.status==='rejected'?text(body.reason,300):'',body.id,event.id,'pending']);break;
  }
  case 'record_withdraw':{
   const r=await db.one('SELECT * FROM records WHERE id=? AND event_id=?',body.id,event.id);if(!r||r.status!=='pending'||r.submit_by!==user.id)fail('只能撤回自己尚未审批的申报',403);
   update('DELETE FROM records WHERE id=? AND status=? AND submit_by=?',[r.id,'pending',user.id]);break;
  }
  case 'record_void':mustAdmin();{
   const r=await db.one('SELECT * FROM records WHERE id=? AND event_id=?',body.id,event.id);if(!r||r.status!=='approved')fail('只能作废已通过的流水');
   update('UPDATE records SET status=?,reject_reason=?,review_by=?,review_at=? WHERE id=? AND event_id=?',['rejected','主办方作废：'+text(body.reason,200),user.id,created,r.id,event.id]);break;
  }
  case 'settings':mustAdmin();{
   const name=text(body.name),boss=integer(body.boss,0,100),finance=integer(body.finance,0,100),employee=integer(body.staff,0,100);if(boss+finance+employee!==100)fail('职位分配比例合计应为 100%');
   if(!['equal','weighted'].includes(body.staffMode))fail('员工分配方式不正确');
   update('UPDATE events SET name=?,boss=?,finance=?,staff=?,staff_mode=? WHERE id=?',[name,boss,finance,employee,body.staffMode,event.id]);break;
  }
  case 'next_day':mustAdmin();if(event.day>=7)fail('已是第 7 天');update('UPDATE events SET day=day+1 WHERE id=? AND day=?',[event.id,event.day]);break;
  case 'settle':mustAdmin();{
   if(event.day!==7)fail('请在第 7 天完成最终结算');
   const pending=await db.one("SELECT COUNT(*) AS n FROM records WHERE event_id=? AND status='pending'",event.id);if(pending.n)fail('请先处理所有待审批申报');
   const c=await db.all('SELECT * FROM companies WHERE event_id=?',event.id),p=await db.all('SELECT * FROM persons WHERE event_id=?',event.id),r=await db.all('SELECT * FROM records WHERE event_id=?',event.id);
   const unassigned=p.filter(x=>x.active&&!x.company_id);if(unassigned.length)fail('请先为所有在册学员分配公司，或停用未参与学员');
   const rows=settlement(c,p,r,event);update('UPDATE events SET settled=1,snapshot=? WHERE id=?',[JSON.stringify(rows),event.id]);break;
  }
  case 'reopen':mustAdmin();if(body.confirm!=='重新开放')fail('请输入“重新开放”确认');update('UPDATE events SET settled=0,snapshot=NULL WHERE id=?',[event.id]);break;
  case 'invite':mustStaff();{
   if(body.role!=='ta')fail('本网站不创建学员登录账号');mustAdmin();
   const p=body.role==='student'?await person(body.personId):null;if(p&&(!p.active||p.user_id))fail('请先停用原绑定或选择未绑定的在册学员');
   const bytes=crypto.getRandomValues(new Uint8Array(12)),code=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('').toUpperCase();
   const hash=await digest(code),expires=new Date(Date.now()+7*86400000).toISOString();
   if(p)update('UPDATE invites SET expires_at=? WHERE person_id=? AND event_id=? AND consumed_by IS NULL',[created,p.id,event.id]);
   insert('invites',['hash','event_id','role','person_id','expires_at','created_at'],[hash,event.id,body.role,p?.id||null,expires,created]);response={ok:true,code,expiresAt:expires};break;
  }
  case 'revoke_ta':mustAdmin();if(body.id===user.id)fail('不能撤销自己');update("UPDATE users SET event_id=NULL WHERE id=? AND role='ta' AND event_id=?",[body.id,event.id]);break;
  case 'revoke_invites':mustAdmin();update('UPDATE invites SET expires_at=? WHERE event_id=? AND consumed_by IS NULL',[created,event.id]);break;
  case 'profile':update('UPDATE users SET name=? WHERE id=?',[text(body.name,60),user.id]);break;
  default:fail('不支持此操作',404);
 }
 insert('audit',['id','event_id','user_id','action','detail','created_at'],[id(),event.id,user.id,action,JSON.stringify({id:body.id||null,personId:body.personId||null}),created]);
 const guard=db.query("UPDATE events SET revision=revision+1,gate=? WHERE id=? AND revision=? AND id=(SELECT value FROM app_config WHERE key='active_event')",gate,event.id,body.revision);
 const result=await db.batch([guard,...statements]);if(!result[0].meta.changes)fail('另一位成员已更新活动，请刷新后重试；你的输入仍保留',409);
 return response;
}
async function api(request,env,url){
 const db=database(env),who=await auth.identity(db,request),event=await eventOf(db),user=await userOf(db,who,event);
 if(url.pathname==='/api/session'&&request.method==='GET')return json({signedIn:Boolean(who),identity:who?{name:who.name}:null,user,event:event?{id:event.id,name:event.name,day:event.day,settled:event.settled}:null,needsOwner:!(await db.one("SELECT value FROM app_config WHERE key='owner_id'"))});
 if(request.method==='GET'){
  if(!who)fail('请先登录',401);
  if(!user)fail('请先使用邀请码加入活动',403);
  if(url.pathname==='/api/state'){if(!event)return json({event:null,me:user,companies:[],persons:[],records:[],history:[]});return json(await stateOf(db,user,event));}
  if(url.pathname==='/api/export'){if(user.role!=='admin')fail('只有主办方可以导出活动',403);const exportId=url.searchParams.get('event')||event?.id,exportEvent=await db.one('SELECT * FROM events WHERE id=?',exportId);if(!exportEvent)fail('找不到活动',404);const data=await stateOf(db,user,exportEvent);data.audit=await db.all('SELECT * FROM audit WHERE event_id=? ORDER BY created_at',exportId);delete data.invites;delete data.accounts;delete data.me;return json({format:'business-war-online-v2',exportedAt:now(),...data});}
  fail('找不到接口',404);
 }
 if(request.method!=='POST')fail('不支持的请求方法',405);
 const origin=request.headers.get('Origin');if(origin!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site')fail('请求来源不被允许',403);
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))fail('请求格式不正确',415);
 const raw=await request.text();if(raw.length>64000)fail('请求过大',413);let body;try{body=JSON.parse(raw);}catch{fail('请求格式不正确');}if(!body||typeof body!=='object'||Array.isArray(body))fail('请求格式不正确');
 const logged=(token)=>{const response=json({ok:true});response.headers.set('Set-Cookie',auth.cookie(token));return response;};
 if(url.pathname==='/api/login')return logged(await auth.login(db,env,request,body));
 if(url.pathname==='/api/logout'){await auth.logout(db,request);const response=json({ok:true});response.headers.set('Set-Cookie',auth.cookie('')+'; Max-Age=0');return response;}
 if(url.pathname==='/api/register'){
  const username=auth.username(body.username);await auth.limit(db,request,username);auth.password(body.password);
  if(await db.one('SELECT id FROM accounts WHERE username=?',username))fail('账号已存在，请登录或更换账号名',409);
  const accountId=id(),name=text(body.name,60),created=now(),salt=auth.random(),hash=await auth.passwordHash(body.password,salt,env),newWho={id:accountId,name};
  if(body.owner===true){
   const guard="(SELECT value FROM app_config WHERE key='owner_id')=?";
   const statement=db.query(`INSERT INTO accounts(id,username,password_hash,salt,created_at) SELECT ?,?,?,?,? WHERE ${guard}`,accountId,username,hash,salt,created,accountId);
   await ownerClaim(db,env,newWho,body,statement);
  }else{
   const inviteHash=await digest(text(body.code,100).toUpperCase());
   const statement=db.query('INSERT INTO accounts(id,username,password_hash,salt,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM invites WHERE hash=? AND consumed_by=?)',accountId,username,hash,salt,created,inviteHash,accountId);
   await join(db,newWho,body,event,statement);
  }
  return logged(await auth.issueSession(db,accountId));
 }
 if(!who)fail('请先登录',401);
 if(url.pathname==='/api/password'){await auth.limit(db,request,who.username);return logged(await auth.changePassword(db,env,who,body));}
 if(url.pathname==='/api/claim-owner')return json(await ownerClaim(db,env,who,body));
 if(url.pathname==='/api/join')return json(await join(db,who,body,event));
 if(!user)fail('请先加入活动',403);
 if(url.pathname==='/api/action')return json(await mutate(db,user,event,body,env));
 fail('找不到接口',404);
}
export default {async fetch(request,env,ctx){
 const url=new URL(request.url);
 try{
  if(url.pathname.startsWith('/api/'))return await api(request,env,url);
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
  const asset=assets[url.pathname]||((url.pathname==='/'||url.pathname==='/index.html')?assets['/index.html']:null);
  if(!asset)return new Response('Not found',{status:404});
  return new Response(request.method==='HEAD'?null:asset.body,{headers:{'Content-Type':asset.type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'"}});
 }catch(error){if(!error.status)console.error('Business war request failed:',error.message);return json({error:error.status?error.message:'服务器暂时不可用，请稍后重试；未保存的输入请保留'},error.status||503);}
}};
