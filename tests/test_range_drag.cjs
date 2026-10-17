const assert=require('node:assert/strict'),{attach}=require('../web/range-drag.js');
const handlers={},surface={addEventListener:(n,f)=>handlers[n]=f,getBoundingClientRect:()=>({left:10,top:20,width:500,height:300}),setPointerCapture(id){this.id=id},hasPointerCapture(id){return this.id===id},releasePointerCapture(){this.id=null}};
const preview={hidden:true,style:{}},done=[],controller=attach(surface,preview,(a,b)=>done.push([a,b]));
function event(n,x,y,extra={}){handlers[n]({pointerId:1,pointerType:'mouse',button:0,clientX:x,clientY:y,preventDefault(){},stopPropagation(){},...extra});}
event('pointerdown',110,120);event('pointermove',210,220);assert.equal(preview.style.width,'100px');assert.equal(preview.hidden,false);event('pointerup',210,220);assert.deepEqual(done[0],[[100,100],[200,200]]);assert.equal(preview.hidden,true);
event('pointerdown',110,120);event('pointerup',111,121);assert.equal(done.length,1);
event('pointerdown',210,220,{pointerType:'touch'});event('pointerup',10,20,{pointerType:'touch'});assert.deepEqual(done[1],[[200,200],[0,0]]);
event('pointerdown',110,120);event('pointercancel',200,200);event('pointerup',210,220);assert.equal(done.length,2);
event('pointerdown',110,120);event('pointerup',900,900);assert.deepEqual(done[2],[[100,100],[500,300]]);
event('pointerdown',110,120);controller.reset();assert.equal(preview.hidden,true);
console.log('Drag preview, release, touch, cancellation, click rejection and bounds passed');

let offset=0;surface.getBoundingClientRect=()=>({left:10+offset,top:20,width:500,height:300});
event('pointerdown',110,120);offset=20;event('pointerup',210,220);assert.equal(done.length,3,'Layout movement cancels rather than committing shifted bounds');
offset=0;event('pointerdown',110,120);surface.getBoundingClientRect=()=>({left:10,top:20,width:700,height:300});event('pointermove',210,220);assert.equal(preview.hidden,true);event('pointerup',210,220);assert.equal(done.length,3);
console.log('Layout movement and resize cancellation passed');
