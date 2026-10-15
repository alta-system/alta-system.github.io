/* Cloudflare Pages advanced-mode entrypoint. Copy to deployment/_worker.js ONLY
   for the protected Cloudflare deployment; never include in the GitHub Pages site. */
const encoder=new TextEncoder(),DAY=86400000;
const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
const bytes=h=>Uint8Array.from(h.match(/../g)||[],x=>parseInt(x,16));
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const digest=async text=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(text)));
export async function passwordHash(password,salt){const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:bytes(salt),iterations:100000},key,256));}
function equal(a,b){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
const json=(value,status=200,extra={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});
const cookie=(token,age=43200)=>`__Host-alta=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${age}`;
const validName=n=>typeof n==='string'&&/^[A-Za-z0-9_.-]{3,64}$/.test(n);
const validPassword=p=>typeof p==='string'&&p.length>=15&&p.length<=128;
const expired=u=>u.force_change||Date.now()-u.changed_at>=30*DAY;
async function session(req,env){const token=(req.headers.get('Cookie')||'').match(/(?:^|;\s*)__Host-alta=([a-f0-9]{64})(?:;|$)/)?.[1];if(!token)return null;return env.DB.prepare('SELECT u.* FROM sessions s JOIN users u ON u.username=s.username AND u.version=s.version WHERE s.token_hash=? AND s.expires>?').bind(await digest(token),Date.now()).first();}
async function issue(user,env){const token=random();await env.DB.prepare('INSERT INTO sessions VALUES(?,?,?,?)').bind(await digest(token),user.username,user.version,Date.now()+12*3600000).run();return cookie(token);}
function page(admin=false){const body=admin?`<h1>ALTA / 管理者</h1><p>アカウントを管理できます。新規・再設定後の仮パスワードは安全な別経路で本人へ渡してください。</p><form id="create"><input name="username" placeholder="新規ユーザー名" required pattern="[A-Za-z0-9_.-]{3,64}"><button>ユーザー追加</button></form><div id="users"></div><p><a href="/">マップに戻る</a> · <a href="/login">自分のパスワード変更</a></p>`:`<h1>ALTA SYSTEM</h1><form id="login"><label>ユーザー名<input name="username" autocomplete="username" required></label><label>パスワード<input name="password" type="password" autocomplete="current-password" required></label><button>ログイン</button></form><form id="change" hidden><p>初回・再設定時および30日経過時には更新が必要です。</p><label>新しいパスワード（15文字以上）<input name="password" type="password" minlength="15" maxlength="128" autocomplete="new-password" required></label><button>パスワードを更新</button></form><button id="logout">ログアウト</button>`;
const script=`const out=document.querySelector('#status');async function post(path,data){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const d=await r.json();if(!r.ok)throw Error(d.error||'失敗');return d;}function error(e){out.textContent=e.message;}const login=document.querySelector('#login'),change=document.querySelector('#change');if(login){login.onsubmit=async e=>{e.preventDefault();try{const d=await post('/auth/login',Object.fromEntries(new FormData(login)));login.reset();if(d.changeRequired){login.hidden=true;change.hidden=false;}else location.href='/';}catch(e){error(e);}};change.onsubmit=async e=>{e.preventDefault();try{await post('/auth/password',Object.fromEntries(new FormData(change)));change.reset();location.href='/';}catch(e){error(e);}};document.querySelector('#logout').onclick=async()=>{await post('/auth/logout',{});location.href='/login';};fetch('/auth/me').then(r=>r.ok?r.json():null).then(d=>{if(d){login.hidden=true;change.hidden=false;}});}const create=document.querySelector('#create');async function users(){const r=await fetch('/auth/users');if(!r.ok)throw Error('管理者権限が必要です');const d=await r.json(),root=document.querySelector('#users');root.replaceChildren();for(const u of d.users){const row=document.createElement('p');row.textContent=u.username+' / '+u.role+' / 更新 '+new Date(u.changed_at).toLocaleString();if(u.role!=='admin'){const b=document.createElement('button');b.textContent='パスワード再設定';b.onclick=async()=>{if(!confirm(u.username+' の既存ログインを無効化して再設定しますか？'))return;try{const v=await post('/auth/reset',{username:u.username});out.textContent='仮パスワード（一度だけ表示）: '+v.temporaryPassword;await users();}catch(e){error(e);}};row.append(b);}root.append(row);}}if(create){users().catch(error);create.onsubmit=async e=>{e.preventDefault();try{const d=await post('/auth/users',Object.fromEntries(new FormData(create)));out.textContent='仮パスワード（一度だけ表示）: '+d.temporaryPassword;create.reset();await users();}catch(e){error(e);}};}`;
return new Response(`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ALTA Account</title><style>body{background:#0c1b26;color:#dce9ed;font:16px system-ui;max-width:760px;margin:8vh auto;padding:24px}form,label{display:block;margin:18px 0}input,button{padding:12px;border-radius:5px;border:1px solid #43616d;background:#18333e;color:white;margin:5px}input{display:block}#status{white-space:pre-wrap;overflow-wrap:anywhere;color:#8de0c6}a{color:#8de0c6}[hidden]{display:none}</style>${body}<p id="status" role="status"></p><script>${script}</script></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Frame-Options':'DENY','Referrer-Policy':'same-origin'}});}
export default {async fetch(req,env){try{
 if(!env.DB||!validName(env.ADMIN_USERNAME)||!/^[a-f0-9]{64}$/.test(env.ADMIN_PASSWORD_HASH||'')||!/^[a-f0-9]{32,64}$/.test(env.ADMIN_PASSWORD_SALT||''))return new Response('Protected deployment is not configured.',{status:503});
 const url=new URL(req.url),path=url.pathname;
 if(req.method==='POST'){
  if(req.headers.get('Origin')!==url.origin||!req.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Forbidden'},403);
  if(Number(req.headers.get('Content-Length')||0)>4096)return json({error:'Too large'},413);
 }
 if(path==='/login'&&req.method==='GET')return page();
 if(path==='/auth/login'&&req.method==='POST'){
  const raw=await req.text();if(raw.length>4096)return json({error:'Too large'},413);const body=JSON.parse(raw),now=Date.now(),bucket=Math.floor(now/900000),ip=await digest(req.headers.get('CF-Connecting-IP')||'unknown');
  await env.DB.prepare('INSERT INTO login_limits VALUES(?,?,1) ON CONFLICT(ip_hash,bucket) DO UPDATE SET count=count+1').bind(ip,bucket).run();
  const limit=await env.DB.prepare('SELECT count FROM login_limits WHERE ip_hash=? AND bucket=?').bind(ip,bucket).first();if(limit.count>10)return json({error:'試行回数を超えました。15分後にお試しください。'},429);
  if(!validName(body.username)||typeof body.password!=='string'||body.password.length>128)return json({error:'ログイン情報を確認してください'},401);
  let user=await env.DB.prepare('SELECT * FROM users WHERE username=?').bind(body.username).first();
  const initial=!user&&body.username===env.ADMIN_USERNAME;
  const hash=await passwordHash(body.password,user?.salt||(initial?env.ADMIN_PASSWORD_SALT:'00000000000000000000000000000000'));
  if(!equal(hash,user?.password_hash||(initial?env.ADMIN_PASSWORD_HASH:'0'.repeat(64))))return json({error:'ログイン情報を確認してください'},401);
  if(initial){await env.DB.prepare("INSERT OR IGNORE INTO users VALUES(?,?,?,'admin',?,0,1)").bind(body.username,hash,env.ADMIN_PASSWORD_SALT,now).run();user=await env.DB.prepare('SELECT * FROM users WHERE username=?').bind(body.username).first();}
  await env.DB.batch([env.DB.prepare('DELETE FROM sessions WHERE expires<?').bind(now),env.DB.prepare('DELETE FROM login_limits WHERE bucket<?').bind(bucket-2)]);
  return json({changeRequired:Boolean(expired(user))},200,{'Set-Cookie':await issue(user,env)});
 }
 const user=await session(req,env);
 if(path==='/auth/me')return user?json({username:user.username,role:user.role,changeRequired:Boolean(expired(user))}):json({error:'Unauthorized'},401);
 if(!user)return path.startsWith('/auth/')?json({error:'Unauthorized'},401):Response.redirect(url.origin+'/login',302);
 if(path==='/auth/logout'&&req.method==='POST'){const token=(req.headers.get('Cookie')||'').match(/__Host-alta=([a-f0-9]{64})/)?.[1];if(token)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(token)).run();return json({ok:true},200,{'Set-Cookie':cookie('',0)});}
 if(path==='/auth/password'&&req.method==='POST'){
  const raw=await req.text();if(raw.length>4096)return json({error:'Too large'},413);const body=JSON.parse(raw);if(!validPassword(body.password))return json({error:'15〜128文字で入力してください'},400);
  if(equal(await passwordHash(body.password,user.salt),user.password_hash))return json({error:'現在とは異なるパスワードを設定してください'},400);
  const salt=random();await env.DB.batch([env.DB.prepare('UPDATE users SET password_hash=?,salt=?,changed_at=?,force_change=0,version=version+1 WHERE username=?').bind(await passwordHash(body.password,salt),salt,Date.now(),user.username),env.DB.prepare('DELETE FROM sessions WHERE username=?').bind(user.username)]);user.version++;return json({ok:true},200,{'Set-Cookie':await issue(user,env)});
 }
 if(expired(user))return path.startsWith('/auth/')?json({error:'Password update required'},403):Response.redirect(url.origin+'/login',302);
 if(path==='/admin'||path.startsWith('/auth/users')||path==='/auth/reset'){
  if(user.role!=='admin'||user.username!==env.ADMIN_USERNAME)return json({error:'Forbidden'},403);
  if(path==='/admin'&&req.method==='GET')return page(true);
  if(path==='/auth/users'&&req.method==='GET'){const r=await env.DB.prepare('SELECT username,role,changed_at,force_change FROM users ORDER BY username').all();return json({users:r.results});}
  if(req.method==='POST'&&(path==='/auth/users'||path==='/auth/reset')){const raw=await req.text();if(raw.length>4096)return json({error:'Too large'},413);const body=JSON.parse(raw);if(!validName(body.username)||body.username===env.ADMIN_USERNAME)return json({error:'ユーザー名を確認してください'},400);
   const exists=await env.DB.prepare('SELECT username FROM users WHERE username=?').bind(body.username).first();if((path==='/auth/users'&&exists)||(path==='/auth/reset'&&!exists))return json({error:'ユーザーの存在を確認してください'},409);
   const temporaryPassword=random().slice(0,24),salt=random(),hash=await passwordHash(temporaryPassword,salt);
   if(path==='/auth/users')await env.DB.prepare("INSERT INTO users VALUES(?,?,?,'user',?,1,1)").bind(body.username,hash,salt,Date.now()).run();else await env.DB.batch([env.DB.prepare('UPDATE users SET password_hash=?,salt=?,changed_at=?,force_change=1,version=version+1 WHERE username=?').bind(hash,salt,Date.now(),body.username),env.DB.prepare('DELETE FROM sessions WHERE username=?').bind(body.username)]);
   return json({temporaryPassword});
  }return json({error:'Not found'},404);
 }
 if(path.startsWith('/auth/'))return json({error:'Not found'},404);
 const response=await env.ASSETS.fetch(req);const headers=new Headers(response.headers);headers.set('Cache-Control','private, no-store');headers.set('X-Frame-Options','DENY');headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','same-origin');
 if(headers.get('Content-Type')?.includes('text/html')){const html=await response.text();headers.delete('Content-Length');headers.delete('ETag');return new Response(html.replace('</header>',`<a href="/login">アカウント</a>${user.role==='admin'?'<a href="/admin">管理者</a>':''}</header>`),{status:response.status,headers});}
 return new Response(response.body,{status:response.status,headers});
 }catch{return json({error:'認証サービスの処理に失敗しました。アクセスは許可されていません。'},503);}}};
