import test from 'node:test';
import assert from 'node:assert/strict';
import {setData,shell,identityMenu} from '../public/ui.mjs';

const state=role=>({me:{id:'user',name:'测试账号',role},event:{id:'event',name:'商战活动',day:3,settled:false},companies:[],persons:[],records:[],accounts:[],history:[],serverTime:'2026-10-08T09:00:00Z'});
test('one account entry identifies role; both staff roles have a read-only screen',()=>{
 assert.match(identityMenu(null),/账号登录/);
 for(const role of ['admin','ta']){
  setData(state(role));
  const menu=identityMenu();
  assert.match(menu,role==='admin'?/主办方/:/助教/);
  assert.match(menu,/开启只读大屏/);
  assert.doesNotMatch(menu,/role-view/);
  const screen=shell('rank');
  assert.match(screen,/只读大屏/);
  assert.match(screen,/screen-close/);
  assert.match(screen,/fullscreen/);
  assert.doesNotMatch(screen,/底部主导航|account-create|person-create|record_create|收益登记|设置/);
  const settings=shell('settings');
  if(role==='admin')assert.match(settings,/account-create/);
  else assert.doesNotMatch(settings,/account-create|账号管理/);
 }
});
