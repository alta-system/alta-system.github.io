const assert=require('node:assert/strict'),B=require('../web/busy-ui.js');
(async()=>{
 const events=[],busy=B.controller({show:s=>events.push(s),hide:()=>events.push('hide')});
 const endLoad=busy.begin('loading'),endDraw=busy.begin('drawing');
 endLoad();assert.equal(busy.active,true);assert.equal(events.at(-1),'drawing');endLoad();assert.equal(busy.active,true);endDraw();assert.equal(busy.active,false);assert.equal(events.at(-1),'hide');
 const paints=[],draws=[],errors=[],paint=()=>new Promise(resolve=>paints.push(resolve)),tick=()=>new Promise(resolve=>setImmediate(resolve));
 const r=B.renderer({busy,paint,draw:fit=>draws.push(fit),onError:e=>errors.push(e)});
 const p=r.request(false),p2=r.request(true);assert.equal(p,p2);assert.equal(busy.active,true);assert.deepEqual(draws,[]);
 paints.shift()();await tick();assert.deepEqual(draws,[true]);assert.equal(busy.active,true);
 const p3=r.request(false);assert.equal(p3,p);paints.shift()();await tick();assert.deepEqual(draws,[true,false]);assert.equal(busy.active,true);
 paints.shift()();assert.equal(await p,true);assert.equal(busy.active,false);assert.equal(r.active,false);
 let fail=true;const retry=B.renderer({busy,paint:async()=>{},draw:()=>{if(fail)throw Error('draw failed');},onError:e=>errors.push(e)});
 assert.equal(await retry.request(),false);assert.equal(busy.active,false);assert.equal(retry.active,false);assert.equal(errors.length,1);
 fail=false;assert.equal(await retry.request(),true);assert.equal(busy.active,false);
 const release=busy.begin('network loading');assert.equal(await retry.request(),true);assert.equal(busy.active,true);release();assert.equal(busy.active,false);
 const rejected=B.renderer({busy,paint:async()=>{throw Error('frame failed');},draw:()=>assert.fail('must not draw'),onError:e=>errors.push(e)});
 assert.equal(await rejected.request(),false);assert.equal(busy.active,false);
 // Verify real DOM adapter interaction/focus state, including pre-existing locks.
 const attrs=new Map([['aria-busy','false']]),classes=new Set(),listeners={};let doc;
 const focus={isConnected:true,inert:false,focus(){doc.activeElement=this;}},main={tagName:'MAIN',inert:false},prelocked={tagName:'SECTION',inert:true};
 const panel={tagName:'DIV',hidden:true,focus(){doc.activeElement=this;}},label={textContent:''};
 doc={activeElement:focus,querySelector:s=>s==='#busy-overlay'?panel:label,addEventListener:(name,fn)=>listeners[name]=fn,body:{children:[main,prelocked,panel],getAttribute:k=>attrs.get(k)??null,setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k),classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)}}};
 const ui=B.mount(doc),end=ui.begin('working');assert.equal(main.inert,true);assert.equal(prelocked.inert,true);assert.equal(panel.hidden,false);assert.equal(doc.activeElement,panel);assert.equal(attrs.get('aria-busy'),'true');
 let blocked=0;listeners.keydown({key:'Tab',preventDefault:()=>blocked++,stopImmediatePropagation:()=>blocked++});assert.equal(blocked,2);
 listeners.keydown({key:'r',metaKey:true,preventDefault:()=>assert.fail('browser reload must remain available'),stopImmediatePropagation(){}});
 end();assert.equal(main.inert,false);assert.equal(prelocked.inert,true);assert.equal(panel.hidden,true);assert.equal(attrs.get('aria-busy'),'false');assert.equal(doc.activeElement,focus);assert.equal(classes.size,0);
 console.log('Busy overlay: paint before draw, coalescing, nested tasks, failure cleanup, interaction/focus restoration passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
