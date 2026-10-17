/* Shared-password Cloudflare gate. No user accounts or admin routes.
   Not active until runtime secrets and RATE_LIMITER binding are configured. */
const enc=new TextEncoder(),TTL=43200;
const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
const equal=(a,b)=>{if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;};
async function mac(key,text){const k=await crypto.subtle.importKey('raw',enc.encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',k,enc.encode(text)));}
function reply(body,status=200,extra={}){return new Response(body,{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer',...extra}});}
const cookie=(value,age=TTL)=>'__Host-alta='+value+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age='+age;
const login=message=>'<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ALTA SYSTEM | ACCESS</title><body style="background:#07121d;color:#d7f2ee;font:16px system-ui;max-width:400px;margin:15vh auto;padding:24px"><h1>ALTA SYSTEM</h1><p>共通パスワードを入力してください。</p><form method="post" action="/auth/login"><input name="password" type="password" autocomplete="current-password" required maxlength="128" aria-label="共通パスワード"><button>マップを開く</button></form><p>'+message+'</p></body></html>';
export default {async fetch(req,env){
 const url=new URL(req.url),path=url.pathname;
 if(path==='/admin'||path.startsWith('/auth/users')||path.startsWith('/auth/reset'))return reply('Not found',404);
 if(typeof env.ALTA_SITE_PASSWORD!=='string'||env.ALTA_SITE_PASSWORD.length<16||typeof env.ALTA_SESSION_SECRET!=='string'||env.ALTA_SESSION_SECRET.length<32||!env.RATE_LIMITER?.limit)return reply('共通パスワード認証は設定待ちです。',503);
 if(path==='/auth/login'&&req.method==='POST'){
  if(req.headers.get('Origin')!==url.origin)return reply('Forbidden',403);
  if(!req.headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded'))return reply('Unsupported request',415);
  const limit=await env.RATE_LIMITER.limit({key:'login:'+req.headers.get('CF-Connecting-IP')});
  if(!limit.success)return reply(login('時間を置いて再度お試しください。'),429,{'Retry-After':'60'});
  const reader=req.body?.getReader();let chunks=[],length=0;
  if(!reader)return reply('Bad request',400);
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>2048){await reader.cancel();return reply('Request too large',413);}chunks.push(value);}
  const buffer=new Uint8Array(length);let pos=0;for(const c of chunks){buffer.set(c,pos);pos+=c.length;}
  const password=new URLSearchParams(new TextDecoder().decode(buffer)).get('password')||'';
  if(password.length>128||!equal(await mac(env.ALTA_SESSION_SECRET,password),await mac(env.ALTA_SESSION_SECRET,env.ALTA_SITE_PASSWORD)))return reply(login('パスワードが一致しません。'),401);
  const expiry=Math.floor(Date.now()/1000)+TTL,version=await mac(env.ALTA_SESSION_SECRET,'version:'+env.ALTA_SITE_PASSWORD);
  const payload=expiry+'.'+version;
  return reply('',303,{'Location':'/','Set-Cookie':cookie(payload+'.'+await mac(env.ALTA_SESSION_SECRET,payload))});
 }
 if(path==='/auth/logout'&&req.method==='POST'){
  if(req.headers.get('Origin')!==url.origin)return reply('Forbidden',403);
  return reply('',303,{'Location':'/login','Set-Cookie':cookie('',0)});
 }
 if(path==='/login'&&req.method==='GET')return reply(login(''));
 const value=(req.headers.get('Cookie')||'').match(/(?:^|;\s*)__Host-alta=(\d+\.[a-f0-9]{64}\.[a-f0-9]{64})(?:;|$)/)?.[1];
 let valid=false;
 if(value){const [expiry,version,sig]=value.split('.'),now=Math.floor(Date.now()/1000);
  valid=Number(expiry)>now&&Number(expiry)<=now+TTL&&equal(version,await mac(env.ALTA_SESSION_SECRET,'version:'+env.ALTA_SITE_PASSWORD))&&equal(sig,await mac(env.ALTA_SESSION_SECRET,expiry+'.'+version));}
 if(!valid)return reply('',303,{'Location':'/login'});
 if(path.startsWith('/auth/'))return reply('Not found',404);
 // The server gate supersedes the UI-only gate on this protected deployment.
 if(path==='/access-config.json')return new Response('{"enabled":false,"serverAuthenticated":true}',{headers:{'Content-Type':'application/json','Cache-Control':'private, no-store'}});
 const response=await env.ASSETS.fetch(req),headers=new Headers(response.headers);
 headers.set('Cache-Control','private, no-store');headers.set('X-Content-Type-Options','nosniff');headers.set('X-Frame-Options','DENY');headers.set('Referrer-Policy','same-origin');
 return new Response(response.body,{status:response.status,headers});
}};
