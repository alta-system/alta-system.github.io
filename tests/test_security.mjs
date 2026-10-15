import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const {default:worker,passwordHash}=await import('../security/worker.mjs');
const base='https://protected.example';
let env={ADMIN_USERNAME:'owner',ADMIN_PASSWORD_HASH:'a'.repeat(64),ADMIN_PASSWORD_SALT:'b'.repeat(64),DB:{prepare(){return {bind(){return this},async first(){return null}}}},ASSETS:{fetch(){return new Response('asset')}}};
for(const path of ['/','/admin','/production/index.json','/archive/index.json']){const r=await worker.fetch(new Request(base+path),env);assert.equal(r.status,302);assert.equal(r.headers.get('Location'),base+'/login');}
assert.equal((await worker.fetch(new Request(base+'/'),{})).status,503);
assert.equal((await worker.fetch(new Request(base+'/auth/users',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'}),env)).status,403);
let who={username:'viewer',role:'user',changed_at:Date.now(),force_change:0,version:1};
env.DB.prepare=sql=>{assert.match(sql,/JOIN users/);return {bind(){return this},async first(){return who}}};
const request=path=>new Request(base+path,{headers:{Cookie:'__Host-alta='+'c'.repeat(64)}});
assert.equal((await worker.fetch(request('/admin'),env)).status,403);
assert.equal((await worker.fetch(request('/auth/users'),env)).status,403);
assert.equal(await (await worker.fetch(request('/production/index.json'),env)).text(),'asset');
who={...who,changed_at:Date.now()-31*86400000};assert.equal((await worker.fetch(request('/production/index.json'),env)).status,302);
who={...who,role:'admin',username:'someone-else',changed_at:Date.now()};assert.equal((await worker.fetch(request('/admin'),env)).status,403);
assert.equal((await passwordHash('example password long','00'.repeat(32))).length,64);
console.log('security: fail-closed, anonymous asset gate, CSRF, owner-only admin and 30-day expiry passed');
