/* Pointer capture keeps a drag active until release, including touch input. */
(function(root){
function attach(surface,preview,complete){
 let start=null,pointer=null;
 function point(e){const b=surface.getBoundingClientRect();return [Math.max(0,Math.min(b.width,e.clientX-b.left)),Math.max(0,Math.min(b.height,e.clientY-b.top))];}
 function reset(){const id=pointer;pointer=null;start=null;preview.hidden=true;if(id!==null&&surface.hasPointerCapture(id))surface.releasePointerCapture(id);}
 function block(e){e.preventDefault();e.stopPropagation();}
 surface.addEventListener('pointerdown',e=>{block(e);if(pointer!==null||e.isPrimary===false||(e.pointerType==='mouse'&&e.button!==0))return;pointer=e.pointerId;start=point(e);surface.setPointerCapture(pointer);preview.hidden=false;preview.style.left=start[0]+'px';preview.style.top=start[1]+'px';preview.style.width='0px';preview.style.height='0px';});
 surface.addEventListener('pointermove',e=>{if(e.pointerId!==pointer)return;block(e);const p=point(e);preview.style.left=Math.min(start[0],p[0])+'px';preview.style.top=Math.min(start[1],p[1])+'px';preview.style.width=Math.abs(p[0]-start[0])+'px';preview.style.height=Math.abs(p[1]-start[1])+'px';});
 surface.addEventListener('pointerup',e=>{if(e.pointerId!==pointer)return;block(e);const p=point(e),a=start;reset();if(Math.abs(p[0]-a[0])>=8&&Math.abs(p[1]-a[1])>=8)complete(a,p);});
 surface.addEventListener('pointercancel',reset);surface.addEventListener('lostpointercapture',reset);
 for(const name of ['click','dblclick','contextmenu','wheel'])surface.addEventListener(name,block,{passive:false});
 return {reset};
}
if(typeof module!=='undefined')module.exports={attach};root.AltaRangeDrag={attach};
})(typeof window==='undefined'?globalThis:window);
