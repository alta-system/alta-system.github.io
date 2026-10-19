// Publish only an authenticated-encrypted status snapshot. No credentials enter the payload.
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
const {subtle}=webcrypto,read=p=>{try{return JSON.parse(fs.readFileSync(p,'utf8'))}catch{return null}};
const air=read('web/production/index.json'),sea=read('web/maritime/index.json');
const select=(name,m)=>({name,status:m?.status||'missing',lastAttempt:m?.lastAttempt||null,lastSuccess:m?.lastSuccess||null,received:m?.received??null,error:m?.errorCode||m?.error||null});
const rows=[select('FAA NOTAM',air),...(sea?.metadata?.sources||[]).map(m=>select(m.source||'NAVWARN',m))];
const now=Date.now(),fresh=r=>r.status==='ok'&&r.lastSuccess&&now-Date.parse(r.lastSuccess)<70*60000;
const report={generatedAt:new Date().toISOString(),state:rows.length>1&&rows.every(fresh)?'OK':'要確認',runURL:`https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,sources:rows,chinaMSA:'直接取得は停止中',faaCoverageGap:Boolean(air?.coverageGap)};
if(report.faaCoverageGap)report.state='要確認';
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,`\n## ALTA 取得チェック: ${report.state}\n\n`+rows.map(r=>`- ${r.name}: ${r.status}; 最終成功 ${r.lastSuccess||'なし'}`).join('\n')+'\n');
const password=process.env.ALTA_ADMIN_PASSWORD||'';
if(password.length<16){fs.writeFileSync('web/operations-status.json',JSON.stringify({enabled:false}));console.log('Private status pending: set ALTA_ADMIN_PASSWORD (16+ characters).');process.exit(0)}
const salt=webcrypto.getRandomValues(new Uint8Array(16)),iv=webcrypto.getRandomValues(new Uint8Array(12)),iterations=600000;
const material=await subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
const key=await subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations},material,{name:'AES-GCM',length:256},false,['encrypt']);
const ciphertext=await subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(report)));
const b64=x=>Buffer.from(x).toString('base64');
fs.writeFileSync('web/operations-status.json',JSON.stringify({enabled:true,iterations,salt:b64(salt),iv:b64(iv),ciphertext:b64(ciphertext)}));
console.log('Private operations snapshot encrypted.');
