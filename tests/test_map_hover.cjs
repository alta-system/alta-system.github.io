const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('web/app.js','utf8');
const line=source.split('\n').find(s=>s.startsWith('function draw(f,anchor)'));
const rendered=[],hover={hidden:true,children:[],style:{},replaceChildren(...x){this.children=x},append(x){this.children.push(x)},offsetWidth:160,offsetHeight:60};
const elements={'#hover-detail':hover,'#alt-labels':{checked:true},'#map':{getBoundingClientRect:()=>({left:0,top:0,width:500,height:300})}};
const layer=()=>({handlers:{},bindTooltip(){throw Error('Per-layer tooltip must not be created')},on(name,fn){this.handlers[name]=fn;return this}});
const context={$:s=>elements[s],node:(tag,text)=>({tag,text}),shiftedGeometry:g=>g,selectedAlerts:new Set(),baseColor:()=> '#ef4444',
 L:{circle:layer,circleMarker:layer,geoJSON:layer},group:{addLayer:l=>rendered.push(l)},layers:new Map(),showDetail(){},pdfMode:false,toggleAlert(){}};
vm.createContext(context);
const start=source.indexOf('function hideHover()'),end=source.indexOf("$('#map').addEventListener",start);
vm.runInContext(source.slice(start,end)+'\n'+line,context);
for(let i=0;i<8;i++)context.draw({id:String(i),geometry:{type:'Point',coordinates:[140,35]},properties:{name:'Warning '+i,radius_m:1852,altitude:{label:'SFC — FL100'}}},0);
for(const l of rendered){l.handlers.mouseover({originalEvent:{clientX:490,clientY:290}});assert.equal(hover.hidden,false);assert.equal(hover.children.length,2);assert.equal(hover.style.left,'332px');l.handlers.mouseout();assert.equal(hover.hidden,true);}
rendered[0].handlers.mouseover({originalEvent:{clientX:25,clientY:25}});
rendered[1].handlers.mouseover({originalEvent:{clientX:50,clientY:50}});
assert.equal(hover.children[0].text,'Warning 1');assert.equal(hover.children.length,2);
rendered[1].handlers.remove();assert.equal(hover.hidden,true);
console.log('Single hover panel regression passed');
