const enc=new TextEncoder();
export const hex=bytes=>Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
export const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
export const digest=async value=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value))));
function fail(message,status=400){throw Object.assign(new Error(message),{status});}
export function username(value){if(typeof value!=='string'||! /^[a-zA-Z0-9_]{4,32}$/.test(value))fail('账号使用 4–32 位字母、数字或下划线');return value.toLowerCase();}
export function password(value){if(typeof value!=='string'||value.length<10||value.length>128)fail('密码至少 10 位，最多 128 位');return value;}
export async function passwordHash(value,salt,env){
 if(!env.PASSWORD_PEPPER)throw new Error('Password configuration unavailable');
 const material=await crypto.subtle.importKey('raw',enc.encode(value),'PBKDF2',false,['deriveBits']);
 // Cloudflare WebCrypto caps a PBKDF2 operation at 100,000 iterations.
 // A separate server-secret pepper also protects against a database-only disclosure.
 const derived=await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(salt),iterations:100000,hash:'SHA-256'},material,256);
 const key=await crypto.subtle.importKey('raw',enc.encode(env.PASSWORD_PEPPER),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return hex(new Uint8Array(await crypto.subtle.sign('HMAC',key,derived)));
}
export function equal(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
export function cookie(token){return`__Host-bw_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`;}
export async function identity(db,request){
 const match=(request.headers.get('Cookie')||'').match(/(?:^|;\s*)__Host-bw_session=([a-f0-9]{64})(?:;|$)/);if(!match)return null;
 const hash=await digest(match[1]);const row=await db.one('SELECT a.id,u.name,a.username FROM sessions s JOIN accounts a ON a.id=s.account_id LEFT JOIN users u ON u.id=a.id WHERE s.token_hash=? AND s.expires_at>?',hash,new Date().toISOString());return row||null;
}
export async function issueSession(db,accountId){const token=random(),hash=await digest(token),expires=new Date(Date.now()+7*86400000).toISOString();await db.batch([db.query('DELETE FROM sessions WHERE expires_at<?',new Date().toISOString()),db.query('INSERT INTO sessions(token_hash,account_id,expires_at) VALUES(?,?,?)',hash,accountId,expires)]);return token;}
export async function limit(db,request,account=''){
 const window=Date.now(),ip=request.headers.get('CF-Connecting-IP')||'unknown';
 const keys=await Promise.all(['ip:'+ip,'user:'+account].map(digest));
 for(let i=0;i<keys.length;i++){
  const count=i===0?100:12,expires=window+15*60000;
  await db.run('INSERT INTO auth_attempts(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<? THEN 1 ELSE count+1 END,expires_at=CASE WHEN expires_at<? THEN excluded.expires_at ELSE expires_at END',keys[i],expires,window,window);
  const row=await db.one('SELECT count FROM auth_attempts WHERE key=?',keys[i]);if(row.count>count)fail('尝试次数过多，请 15 分钟后再试',429);
 }
 await db.run('DELETE FROM auth_attempts WHERE expires_at<?',window);
}
export async function login(db,env,request,body){
 const name=username(body.username);await limit(db,request,name);
 const account=await db.one('SELECT * FROM accounts WHERE username=?',name);
 const hash=await passwordHash(String(body.password||'').slice(0,128),account?.salt||'invalid-account-comparison',env);
 if(!account||!equal(hash,account.password_hash))fail('账号或密码不正确',401);
 return issueSession(db,account.id);
}
export async function logout(db,request){const match=(request.headers.get('Cookie')||'').match(/(?:^|;\s*)__Host-bw_session=([a-f0-9]{64})(?:;|$)/);if(match)await db.run('DELETE FROM sessions WHERE token_hash=?',await digest(match[1]));}
export async function changePassword(db,env,who,body){
 const account=await db.one('SELECT * FROM accounts WHERE id=?',who.id);if(!account)fail('账号不存在',401);
 const existing=await passwordHash(String(body.currentPassword||'').slice(0,128),account.salt,env);if(!equal(existing,account.password_hash))fail('当前密码不正确',403);
 const salt=random(),hash=await passwordHash(password(body.newPassword),salt,env);
 const results=await db.batch([db.query('UPDATE accounts SET salt=?,password_hash=? WHERE id=? AND password_hash=?',salt,hash,who.id,account.password_hash),db.query('DELETE FROM sessions WHERE account_id=?',who.id)]);if(!results[0].meta.changes)fail('密码已改变，请重新登录',409);return issueSession(db,who.id);
}
