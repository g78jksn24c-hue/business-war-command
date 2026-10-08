import test from 'node:test';import assert from 'node:assert/strict';
import worker from '../src/worker.mjs';import {fixture} from './db-fixture.mjs';import {settlement,amountCents} from '../src/domain.mjs';
test('real login, roles, persistence, concurrency, approval, company editing and archive',async()=>{
 const f=fixture(),env={DB:f.DB,OWNER_SETUP_KEY:'test-owner-only-key',PASSWORD_PEPPER:'test-pepper-never-deployed'},cookies={};
 async function req(path,body,who='admin',headers={}){
  const h={...(cookies[who]?{Cookie:cookies[who]}:{}),...headers};if(body){h['Content-Type']='application/json';h.Origin='https://test.local';}
  const response=await worker.fetch(new Request('https://test.local'+path,{method:body?'POST':'GET',headers:h,body:body?JSON.stringify(body):undefined}),env,{});
  const result=await response.json();if(response.headers.get('Set-Cookie'))cookies[who]=response.headers.get('Set-Cookie').split(';')[0];return{status:response.status,...result};
 }
 let x=await req('/api/state',null,'anon',{'oai-authenticated-user-id':'spoofed-admin'});assert.equal(x.status,401);
 x=await req('/api/register',{username:'organizer',password:'Strong_Test_123!',name:'主办方',owner:true,code:'wrong'});assert.equal(x.status,403);
 x=await req('/api/register',{username:'organizer',password:'Strong_Test_123!',name:'主办方',owner:true,code:env.OWNER_SETUP_KEY});assert.equal(x.status,200);
 x=await req('/api/action',{action:'new_event',name:'真实活动'});assert.equal(x.status,200);
 const state=()=>req('/api/state');let d=await state();assert.equal(d.event.day,1);assert.equal(d.persons.length,0);
 const action=async body=>{const d=await state();return req('/api/action',{revision:d.event.revision,...body});};
 await action({action:'company_create',name:'甲公司',note:'第一公司'});d=await state();const c=d.companies[0];
 await action({action:'person_create',name:'张三',companyId:c.id,position:'boss'});d=await state();const p=d.persons[0];
 const invite=await action({action:'invite',role:'ta'});assert.equal(invite.status,200);assert.equal(invite.code.length,24);
 x=await req('/api/register',{username:'assistant',password:'Assistant_123!',name:'助教甲',code:invite.code},'ta');assert.equal(x.status,200);
 x=await req('/api/register',{username:'otheruser',password:'OtherUser_123!',name:'另一位',code:invite.code},'other');assert.equal(x.status,403);
 d=await req('/api/state',null,'ta');assert.equal(d.me.role,'ta');assert.equal(d.companies[0].name,'甲公司');
 x=await req('/api/action',{revision:d.event.revision,action:'next_day'},'ta');assert.equal(x.status,403);
 x=await req('/api/action',{revision:d.event.revision,action:'invite',role:'student',personId:p.id},'ta');assert.notEqual(x.status,200);
 const rev=d.event.revision;
 x=await req('/api/action',{revision:rev,action:'record_create',personId:p.id,day:1,direction:'income',amount:'123.45',category:'销售收益',note:'手机提交',requestId:'same-request'},'ta');assert.equal(x.status,200);
 x=await req('/api/action',{revision:rev,action:'record_create',personId:p.id,day:1,direction:'income',amount:'123.45',category:'销售收益',requestId:'same-request'},'ta');assert.equal(x.duplicate,true);
 d=await state();assert.equal(d.records.length,1);assert.equal(d.records[0].status,'pending');assert.equal(d.persons[0].balance,0);
 const r=d.records[0];x=await action({action:'record_review',id:r.id,status:'approved'});assert.equal(x.status,200);d=await state();assert.equal(d.persons[0].balance,12345);
 x=await req('/api/action',{revision:rev,action:'company_update',id:c.id,name:'陈旧覆盖',note:''});assert.equal(x.status,409);d=await state();assert.equal(d.companies[0].name,'甲公司');
 await action({action:'company_update',id:c.id,name:'新公司名',note:'更新备注'});await action({action:'person_update',id:p.id,name:'张三新名',companyId:c.id,position:'finance',active:true});
 await action({action:'record_create',personId:p.id,day:1,direction:'expense',amount:'23.45',category:'采购支出',direct:true,requestId:'expense-1'});
 d=await state();assert.equal(d.persons[0].balance,10000);assert.equal(d.persons[0].position,'finance');
 await req('/api/logout',{});x=await req('/api/state');assert.equal(x.status,401);
 x=await req('/api/login',{username:'organizer',password:'wrong'});assert.equal(x.status,401);
 x=await req('/api/login',{username:'organizer',password:'Strong_Test_123!'});assert.equal(x.status,200);d=await state();assert.equal(d.persons[0].balance,10000);assert.equal(d.companies[0].name,'新公司名');
 for(let i=1;i<7;i++)await action({action:'next_day'});x=await action({action:'next_day'});assert.equal(x.status,400);
 x=await action({action:'settle'});assert.equal(x.status,200);d=await state();assert.equal(d.event.settled,1);assert.equal(d.event.snapshot[0].payout,10000);
 x=await action({action:'person_update',id:p.id,name:'不允许',position:'staff',companyId:c.id});assert.equal(x.status,409);
 const oldId=d.event.id;await action({action:'new_event',name:'第二期',confirm:'开启新活动'});d=await state();assert.equal(d.event.day,1);assert.equal(d.persons.length,0);assert.equal(d.history.length,2);
 x=await req('/api/export?event='+oldId);assert.equal(x.persons[0].balance,10000);assert.equal(x.records.length,2);assert.ok(!JSON.stringify(x).includes('password_hash'));
 x=await req('/api/state',null,'ta');assert.equal(x.status,200);assert.equal(x.accounts.length,0);
 const joinInvite=await action({action:'invite',role:'ta'});x=await req('/api/join',{code:joinInvite.code,name:'助教甲'},'ta');assert.equal(x.status,200);
 d=await req('/api/state',null,'ta');x=await req('/api/action',{revision:d.event.revision,action:'account_create',username:'forbidden',password:'Forbidden_123!',name:'越权'},'ta');assert.equal(x.status,403);
 x=await action({action:'account_create',username:'created_ta',password:'Created_TA_123!',name:'新助教'});assert.equal(x.status,200);
 x=await req('/api/login',{username:'created_ta',password:'Created_TA_123!'},'newta');assert.equal(x.status,200);d=await req('/api/state',null,'newta');assert.equal(d.me.role,'ta');assert.equal(d.accounts.length,0);
 await action({action:'revoke_ta',id:d.me.id});x=await req('/api/state',null,'newta');assert.equal(x.status,403);
 await action({action:'account_enable',id:d.me.id});x=await req('/api/state',null,'newta');assert.equal(x.status,200);
 x=await req('/api/action',{revision:x.event.revision,action:'account_password',id:d.me.id,password:'Forbidden_Reset_123!'},'ta');assert.equal(x.status,403);
 await action({action:'account_password',id:d.me.id,password:'Reset_Password_123!'});x=await req('/api/state',null,'newta');assert.equal(x.status,401);
 x=await req('/api/password',{currentPassword:'Assistant_123!',newPassword:'Assistant_NEW_123!'},'ta');assert.equal(x.status,200);
 await req('/api/logout',{},'ta');x=await req('/api/login',{username:'assistant',password:'Assistant_123!'},'ta');assert.equal(x.status,401);x=await req('/api/login',{username:'assistant',password:'Assistant_NEW_123!'},'ta');assert.equal(x.status,200);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM accounts').get().n,3);f.sql.close();
});
test('settlement preserves integer cents, including negative balances',()=>{
 for(const amount of [10001,-10001,0,1]){
  const c=[{id:'c',name:'公司'}],p=[{id:'a',name:'老板',position:'boss',company_id:'c',active:1},{id:'b',name:'员工1',position:'staff',company_id:'c',active:1},{id:'d',name:'员工2',position:'staff',company_id:'c',active:1}],r=[{person_id:'a',amount,status:'approved'}];
  const rows=settlement(c,p,r,{boss:30,finance:20,staff:50,staff_mode:'equal'});assert.equal(rows.reduce((n,r)=>n+r.payout,0),amount);assert.ok(rows.every(x=>Number.isInteger(x.payout)));
 }
 assert.equal(amountCents('0.01'),1);assert.throws(()=>amountCents('0'));assert.throws(()=>amountCents('10.123'));assert.throws(()=>amountCents('-1'));
});
