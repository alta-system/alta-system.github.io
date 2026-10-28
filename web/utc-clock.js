/* A display-only UTC clock: no HTTP requests and no connection to feed refresh. */
(function(){
 'use strict';
 const el=document.getElementById('utc-clock');
 if(!el)return;
 const time=el.querySelector('[data-utc-time]'),day=el.querySelector('[data-utc-date]');
 let timer=null;
 function update(){
  const iso=new Date().toISOString();
  el.dateTime=iso;
  time.textContent=iso.slice(11,19);
  day.textContent=iso.slice(0,10);
 }
 function start(){
  if(timer!==null){clearInterval(timer);timer=null;}
  update();
  if(!document.hidden)timer=setInterval(update,1000);
 }
 document.addEventListener('visibilitychange',start);
 window.addEventListener('pageshow',start);
 window.addEventListener('pagehide',()=>{if(timer!==null){clearInterval(timer);timer=null;}});
 start();
})();
