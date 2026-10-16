const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('web/app.js','utf8');
const line=source.split('\n').find(s=>s.startsWith('function draw(f,anchor)'));
const rendered=[];
const layer=()=>({bindTooltip(content,options){this.tooltip={content,options};return this},on(){return this}});
const context={
 $:()=>({checked:true}),node:(tag,text)=>({tag,text,children:[],append(x){this.children.push(x)}}),
 shiftedGeometry:g=>g,selectedAlerts:new Set(),baseColor:()=> '#ef4444',
 L:{circle:layer,circleMarker:layer,geoJSON:layer},map:{getZoom:()=>9},
 group:{addLayer:l=>rendered.push(l)},layers:new Map(),showDetail(){},pdfMode:false,toggleAlert(){}
};
vm.createContext(context);vm.runInContext(line,context);
for(const zoom of [3,8,4,10]){
 context.map.getZoom=()=>zoom;
 for(const geometry of [{type:'Point',coordinates:[140,35]},{type:'Polygon',coordinates:[]}]){
   context.draw({id:'test',geometry,properties:{name:'Warning',radius_m:1852,altitude:{label:'SFC — FL100'}}},0);
 }
}
assert.equal(rendered.length,8);
for(const l of rendered){
 assert.equal(l.tooltip.options.permanent,false,'hover must not turn permanent after zoom/re-render');
 assert.equal(l.tooltip.options.sticky,true);
 assert.equal(l.tooltip.content.children[1].text,'SFC — FL100');
}
console.log('Tooltip re-render regression passed');
