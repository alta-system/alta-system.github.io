/* Processing feedback and interaction lock. No data/API requests. */
(function(root){
'use strict';
const nextPaint=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
function controller({show,hide}){
 const tasks=new Map();
 function begin(message){const token=Symbol();tasks.set(token,message);show(message);let ended=false;return ()=>{if(ended)return;ended=true;tasks.delete(token);if(tasks.size)show([...tasks.values()].at(-1));else hide();};}
 return {begin,get active(){return tasks.size>0;}};
}
function mount(doc){
 const panel=doc.querySelector('#busy-overlay'),message=doc.querySelector('#busy-message');
 let locked=false,focus=null,children=[],priorBusy=null;
 const state=controller({show(text){message.textContent=text;if(locked)return;locked=true;focus=doc.activeElement;priorBusy=doc.body.getAttribute('aria-busy');children=[...doc.body.children].filter(el=>el!==panel&&!['SCRIPT','STYLE','LINK'].includes(el.tagName)).map(el=>[el,el.inert]);for(const [el]of children)el.inert=true;doc.body.setAttribute('aria-busy','true');doc.body.classList.add('is-processing');panel.hidden=false;panel.focus({preventScroll:true});},hide(){if(!locked)return;locked=false;panel.hidden=true;for(const [el,inert]of children)el.inert=inert;children=[];if(priorBusy===null)doc.body.removeAttribute('aria-busy');else doc.body.setAttribute('aria-busy',priorBusy);doc.body.classList.remove('is-processing');if(focus?.isConnected&&!focus.inert)focus.focus?.({preventScroll:true});focus=null;}});
 doc.addEventListener('keydown',e=>{if(state.active&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!/^F\d{1,2}$/.test(e.key)){e.preventDefault();e.stopImmediatePropagation();}},true);
 return state;
}
// Coalesce overlapping requests; paint the overlay before heavy synchronous work,
// and leave it up until Leaflet's next canvas frame has had a chance to render.
function renderer({busy,draw,paint=nextPaint,onError=()=>{}}){
 let task=null,fit=false,version=0;
 function request(shouldFit=false){fit=fit||shouldFit;version++;if(task)return task;
  const release=busy.begin('警報の表示を更新しています…');
  task=(async()=>{try{await paint();for(;;){const current=version,wantFit=fit;fit=false;draw(wantFit);await paint();if(current===version)return true;}}catch(error){onError(error);return false;}finally{task=null;release();}})();return task;
 }
 return {request,get active(){return task!==null;}};
}
const api={controller,mount,renderer,nextPaint};root.AltaBusy=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
