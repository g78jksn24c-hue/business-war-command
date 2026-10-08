import * as ui from './ui.mjs';
import {positions} from './domain.mjs';
const {esc,money,date,field,select,button}=ui,root=document.querySelector('#app');
let session=null,data=null,page='home',companyId=null,selectedPerson='',dirty=false,dialog=null,noticeTimer,mode='ta';
try{document.documentElement.dataset.theme=localStorage.getItem('shangzhan_theme_v1')==='dark'?'dark':'light';}catch{}
function notify(message,error=false){const n=document.querySelector('#notice');n.textContent=message;n.className='show'+(error?' error':'');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>n.className='',error?7000:3500);}
async function api(path,body){const response=await fetch(path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store',credentials:'same-origin'});let result;try{result=await response.json();}catch{throw new Error('连接中断，请检查网络；输入尚未保存');}if(!response.ok)throw Object.assign(new Error(result.error||'操作未成功'),{status:response.status});return result;}
function closeDialog(){dialog?.close();dialog?.remove();dialog=null;}
function modal(title,content,onSubmit){
 closeDialog();dialog=document.createElement('dialog');dialog.innerHTML=`<form><div class="dialog-head"><h2>${esc(title)}</h2><button type="button" aria-label="关闭" data-close>×</button></div>${content}<div class="actions"><button type="submit" class="primary">保存</button><button type="button" data-close>取消</button></div><p class="negative" data-error role="alert"></p></form>`;
 document.body.append(dialog);dialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=closeDialog);dialog.addEventListener('cancel',()=>closeDialog());
 const form=dialog.querySelector('form');form.onsubmit=async e=>{e.preventDefault();const submit=form.querySelector('[type=submit]');submit.disabled=true;const values=Object.fromEntries(new FormData(form));try{await onSubmit(values);closeDialog();}catch(error){form.querySelector('[data-error]').textContent=error.message;submit.disabled=false;}};dialog.showModal();
}
async function loadData(renderPage=true){data=await api('/api/state');ui.setData(data);if(renderPage)render();}
async function act(body){try{const result=await api('/api/action',{revision:data.event?.revision,...body});await loadData();notify('已保存到服务器');return result;}catch(error){if(error.status===409)try{await loadData(false);}catch{}notify(error.message,true);throw error;}}
function render(keepScroll=false){
 dirty=false;
 if(!data.event){root.innerHTML=`<main class="login"><section class="card"><span class="eyebrow">商战 · 主办方</span><h1>创建第一期活动</h1><p>从空白的第 1 天开始，不载入示例学员。添加公司、学员，再给助教发放邀请码。</p><form id="first-event">${field('活动名称','name','text','七天商战','required maxlength="100"')}<button class="primary section" type="submit">创建活动</button><p data-error role="alert" class="negative"></p></form></section></main>`;document.querySelector('#first-event').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{await act({action:'new_event',name:new FormData(e.target).get('name')});}catch(err){e.target.querySelector('[data-error]').textContent=err.message;b.disabled=false;}};return;}
 root.innerHTML=ui.shell(page,companyId,selectedPerson);if(!keepScroll)window.scrollTo(0,0);root.oninput=()=>dirty=true;
 root.onclick=async e=>{const b=e.target.closest('[data-action]');if(!b)return;try{await handle(b.dataset.action,b.dataset.value,b);}catch(err){notify(err.message,true);}};
 const form=document.querySelector('#entry-form');if(form){const requestId=crypto.randomUUID();form.onsubmit=async e=>{e.preventDefault();const values=Object.fromEntries(new FormData(form)),b=form.querySelector('[type=submit]');b.disabled=true;try{selectedPerson=values.personId||'';await act({action:'record_create',...values,day:Number(values.day||data.event.day),direct:values.direct==='true',requestId});dirty=false;}catch(error){form.querySelector('[data-error]').textContent=error.message;b.disabled=false;}};}
}
function showCode(result){modal('助教邀请码',`<p>把网站链接和此邀请码单独发给助教，对方可自行设置账号和密码。一个邀请码只绑定一个账号，有效至 ${date(result.expiresAt)}。</p><div class="inline-code">${esc(result.code)}</div><p class="muted">只在此处显示一次，请复制保存，不要公开发到网上。</p>`,async()=>{});dialog.querySelector('[type=submit]').textContent='已保存，关闭';}
function editPerson(p,cid=''){modal(p?'编辑学员':'新增学员',`<div class="fields">${field('学员姓名','name','text',p?.name||'','required maxlength="60"')}${select('公司','companyId',ui.companyOptions(),p?.company_id||cid)}${select('公司职位','position',Object.entries(positions),p?.position||'staff')}${p?select('学员状态','active',[['true','在册'],['false','停用（保留流水）']],p.active?'true':'false'):''}</div><p class="muted">修改公司或职位不会删除个人流水，公司汇总按当前成员变化。</p>`,async v=>act({action:p?'person_update':'person_create',id:p?.id,...v,active:v.active!=='false'}));}
async function handle(action,value,b){
 switch(action){
  case 'account-create':modal('添加助教账号',`${field('显示姓名','name','text','','required maxlength="60"')}${field('登录账号','username','text','','required minlength="4" maxlength="32" pattern="[a-zA-Z0-9_]{4,32}" autocomplete="off"')}${field('初始密码（至少 10 位）','password','password','','required minlength="10" maxlength="128" autocomplete="new-password"')}<p class="muted">新账号为普通助教，没有账号管理权限。请单独告知本人，并让其登录后修改密码。</p>`,async v=>act({action:'account_create',role:'ta',...v}));break;
  case 'account-password':modal('重置助教密码',`${field('新密码（至少 10 位）','password','password','','required minlength="10" maxlength="128" autocomplete="new-password"')}<p class="muted">该助教在所有设备上的旧登录都会失效，请单独告知本人新密码。</p>`,async v=>act({action:'account_password',id:value,...v}));break;
  case 'enable-ta':await act({action:'account_enable',id:value});break;
  case 'role-view':if(value==='screen'){page='rank';render();break;}if(value==='admin'&&data.me.role!=='admin'){notify('此账号是助教，主办方需要使用自己的账号登录',true);break;}if(dirty&&!confirm('有未提交的输入，确认切换？'))return;mode=value;ui.setMode(mode);page='home';render();break;
  case 'fullscreen':if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen();break;
  case 'go':if(dirty&&!confirm('本页输入尚未提交，确认离开？'))return;page=value;render();break;
  case 'student-panel':selectedPerson=value;page='student';render();break;
  case 'entry-person':selectedPerson=value;page='entry';render();break;
  case 'refresh':if(dirty){notify('请先提交或取消当前输入，再刷新');return;}b.disabled=true;try{await loadData();notify('已读取服务器最新数据');}finally{b.disabled=false;}break;
  case 'theme':document.documentElement.dataset.theme=value;try{localStorage.setItem('shangzhan_theme_v1',value);}catch{}break;
  case 'open-company':companyId=value;page='companies';render();break;
  case 'back-companies':companyId=null;render();break;
  case 'company-create':case 'company-edit':{const c=action==='company-edit'?ui.company(value):null;modal(c?'编辑公司':'创建公司',`${field('公司名称','name','text',c?.name||'','required maxlength="100"')}<div><label for="co-note">公司备注</label><textarea id="co-note" name="note" rows="3" maxlength="500">${esc(c?.note||'')}</textarea></div>`,async v=>act({action:c?'company_update':'company_create',id:c?.id,...v}));break;}
  case 'company-remove':modal('删除公司',`<p>成员将变为未加入公司，个人流水保留。不会清空学员账户。</p>${field('请输入“删除公司”','confirm','text','','required')}`,async v=>{await act({action:'company_remove',id:value,...v});companyId=null;render();});break;
  case 'person-create':editPerson(null,value);break;
  case 'person-edit':editPerson(ui.person(value));break;
  case 'assign':{const candidates=data.persons.filter(p=>p.active&&p.company_id!==value);if(!candidates.length){notify('没有可加入的现有学员，请先新建');return;}modal('加入现有学员',`${select('选择学员','personId',candidates.map(p=>[p.id,`${p.name} · ${ui.company(p.company_id)?.name||'未加入公司'}`]))}${select('新职位','position',Object.entries(positions))}`,async v=>{const p=ui.person(v.personId);await act({action:'person_update',id:p.id,name:p.name,companyId:value,position:v.position,active:true});});break;}
  case 'person-remove':modal('停用学员',`<p>${esc(ui.person(value)?.name)}退出公司，历史收支仍保留。</p>${field('请输入“停用学员”','confirm','text','','required')}`,async v=>act({action:'person_remove',id:value,...v}));break;
  case 'invite-ta':b.disabled=true;try{showCode(await act({action:'invite',role:'ta'}));}finally{b.disabled=false;}break;
  case 'revoke-ta':if(confirm('确认撤销此助教的活动权限？'))await act({action:'revoke_ta',id:value});break;
  case 'revoke-invites':if(confirm('确认使所有尚未使用的邀请码失效？已有账号不受影响。'))await act({action:'revoke_invites'});break;
  case 'approve':b.disabled=true;try{await act({action:'record_review',id:value,status:'approved'});}finally{b.disabled=false;}break;
  case 'reject':modal('驳回申报',field('驳回原因','reason','text','','required maxlength="300"'),async v=>act({action:'record_review',id:value,status:'rejected',...v}));break;
  case 'void':modal('作废流水',field('作废原因','reason','text','','required maxlength="200"'),async v=>act({action:'record_void',id:value,...v}));break;
  case 'withdraw':if(confirm('确认撤回这笔尚未审批的申报？'))await act({action:'record_withdraw',id:value});break;
  case 'event-edit':modal('活动和分配规则',`<div class="fields">${field('活动名称','name','text',data.event.name,'required maxlength="100"')}${field('老板比例（%）','boss','number',data.event.boss,'required min="0" max="100"')}${field('财务管理比例（%）','finance','number',data.event.finance,'required min="0" max="100"')}${field('员工比例（%）','staff','number',data.event.staff,'required min="0" max="100"')}${select('员工分配方式','staffMode',[['equal','平均分配'],['weighted','按正收益加权']],data.event.staff_mode)}</div><p class="muted">比例合计必须为 100%，没有成员的职位不参与分配。</p>`,async v=>act({action:'settings',...v,boss:Number(v.boss),finance:Number(v.finance),staff:Number(v.staff)}));break;
  case 'next-day':if(confirm(`进入第 ${data.event.day+1} 天？不会清除之前的记录。`))await act({action:'next_day'});break;
  case 'settle':if(confirm('确认最终结算并锁定本期收支及人员？需要第 7 天且没有待审批记录。'))await act({action:'settle'});break;
  case 'reopen':modal('重新开放活动',`<p>清除本期结算快照，原始流水保留，可重新审批和结算。</p>${field('请输入“重新开放”','confirm','text','','required')}`,async v=>act({action:'reopen',...v}));break;
  case 'new-event':modal('初始化 · 开启新活动',`<p>新活动从第 1 天空白开始。上一期仍可导出。主办方与已启用助教账号保留，停用账号不会自动恢复。</p>${field('新活动名称','name','text','七天商战','required maxlength="100"')}${field('请输入“开启新活动”','confirm','text','','required')}`,async v=>{await act({action:'new_event',...v});companyId=null;page='home';render();});break;
  case 'profile':modal('修改显示名称',field('显示名称','name','text',data.me.name,'required maxlength="60"'),async v=>act({action:'profile',...v}));break;
  case 'password':modal('修改密码',`${field('当前密码','currentPassword','password','','required autocomplete="current-password"')}${field('新密码（至少 10 位）','newPassword','password','','required minlength="10" maxlength="128" autocomplete="new-password"')}<p class="muted">其他设备的旧登录会失效，需要重新登录。</p>`,async v=>{await api('/api/password',v);notify('密码已修改');});break;
  case 'logout':if(dirty&&!confirm('尚有未提交内容，确认退出？'))return;await api('/api/logout',{});data=null;session=null;dirty=false;await start();break;
  case 'export':{const result=await api('/api/export'+(value?'?event='+encodeURIComponent(value):'')),blob=new Blob([JSON.stringify(result,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`商战备份_${result.event.name.replace(/[\\/:*?"<>|]/g,'_')}_${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('活动备份已下载');break;}
 }
}
let loginMode='login';
function login(){
 const owner=session?.needsOwner,registered=loginMode==='register'||owner,logged=session?.signedIn;
 root.innerHTML=`<main class="login"><section class="card"><div class="brand"><span class="mark">商</span>现场指挥台</div><span class="eyebrow section">七天 · 现场协作</span><h1>助教的商战工作台</h1><p>收支登记、公司人员、七天进度。手机和电脑登录同一账号，继续处理同一场活动。</p><div class="day-track">${Array.from({length:7},(_,i)=>`<div class="day">第 ${i+1} 天</div>`).join('')}</div><p class="muted">仅供主办方与助教登录。学员无需账号，由助教管理学员资料。</p></section><section class="card"><h2>${logged?'加入本期活动':registered?(owner?'首次启用 · 主办方':'注册助教账号'):'登录工作台'}</h2><p>${logged?'输入本期助教邀请码，继续使用原账号。':registered?(owner?'使用私密启用码，创建你的主办方账号。':'请输入主办方提供的助教邀请码。'):'使用网站账号和密码，不需要 ChatGPT 账号。'}</p><form id="auth-form">${logged?'':field('账号','username','text','','required minlength="4" maxlength="32" pattern="[a-zA-Z0-9_]{4,32}" autocomplete="username" placeholder="4–32 位字母、数字、下划线"')}${logged?'':field(registered?'密码（至少 10 位）':'密码','password','password','','required '+(registered?'minlength="10" autocomplete="new-password"':'autocomplete="current-password"'))}${registered||logged?field('显示姓名','name','text',session?.identity?.name||'','required maxlength="60"'):''}${registered||logged?field(owner?'主办方启用码':'助教邀请码','code','password','','required autocomplete="off"'):''}<button type="submit" class="primary section">${logged?'加入活动':registered?'创建账号':'登录'}</button><p class="negative section" data-error role="alert"></p></form><div class="actions section">${!owner&&!logged?button(registered?'已有账号，去登录':'有邀请码，注册账号','login-mode',registered?'login':'register'):''}${logged?button('退出账号','auth-logout'):''}</div><p class="section muted">登录不会清空活动。忘记密码请联系主办方，不要公开发送密码。</p></section></main>`;
 const wrapper=document.createElement('div');wrapper.className='login-shell';const content=root.firstElementChild;
 const mainTitle=content.querySelector('h1');mainTitle.textContent='商战';mainTitle.className='login-main-title';
 const subtitle=document.createElement('p');subtitle.className='school-subtitle';subtitle.textContent='X成长院';mainTitle.after(subtitle);
 const header=document.createElement('header');header.className='top';header.innerHTML=ui.brand()+ui.identityMenu(owner?'admin':mode);wrapper.append(header,content);root.replaceChildren(wrapper);
 if(!owner&&!registered&&!logged)content.querySelector('h2').textContent=mode==='admin'?'主办方登录':'助教登录';
 root.onclick=async e=>{const b=e.target.closest('[data-action]');if(!b)return;
  if(b.dataset.action==='role-view'){if(b.dataset.value==='screen'){page='rank';notify('大屏显示活动数据，需要先登录');}else{mode=b.dataset.value;page='home';}loginMode='login';login();}
  if(b.dataset.action==='login-mode'){loginMode=b.dataset.value;login();}
  if(b.dataset.action==='auth-logout'){await api('/api/logout',{});await start();}
 };
 const form=document.querySelector('#auth-form');form.onsubmit=async e=>{e.preventDefault();const b=form.querySelector('button');b.disabled=true;try{await api(logged?'/api/join':registered?'/api/register':'/api/login',{...Object.fromEntries(new FormData(form)),owner:owner===true});dirty=false;await start();}catch(err){form.querySelector('[data-error]').textContent=err.message;b.disabled=false;}};
}
async function start(){try{session=await api('/api/session');if(!session.user){data=null;login();return;}mode=session.user.role==='admin'?'admin':'ta';ui.setMode(mode);await loadData();}catch(error){root.innerHTML=`<main class="login"><section class="card"><h1>暂时无法连接活动</h1><p>${esc(error.message)}</p><button id="retry">重新连接</button><p class="muted section">不会因此初始化或创建新活动。</p>${button('退出账号','auth-logout')}</section></main>`;document.querySelector('#retry').onclick=start;root.onclick=async e=>{if(e.target.closest('[data-action=auth-logout]')){await api('/api/logout',{});await start();}};}}
window.addEventListener('beforeunload',e=>{if(dirty||dialog){e.preventDefault();e.returnValue='';}});
async function refreshQuietly(){if(!data?.event||dirty||dialog||document.hidden)return;try{const next=await api('/api/state');if(next.event?.id!==data.event.id||next.event?.revision!==data.event.revision){data=next;ui.setData(data);render(true);}}catch(error){notify('同步暂停：'+error.message,true);}}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshQuietly();});setInterval(refreshQuietly,15000);await start();
