const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),V=require('../web/view-tools.js');
for(const [text,expected]of [['MILITARY EXERCISE WITHIN AREA','exercise'],['ROCKET LAUNCHING','missile'],['LIVE FIRING','firing'],['BIRDTAM BIRD ACTIVITY','birds'],['MILITARY AIRPORT RWY CLOSED DUE WIP','airport'],['RWY LIGHTING U/S','airport'],['UAS ACTIVITY','drone'],['RESTRICTED AREA ACTIVATED','other']])assert.equal(V.category({text}),expected,text);
assert.equal(V.emphasized({text:'MILITARY AIRPORT RWY CLOSED'}),false);
const raw='ORIGINAL\r\n  3500N14000E';assert.equal(V.original({originalText:raw,text:'different'}).text,raw);assert.match(V.original({text:'fallback'}).label,/原文フィールドなし/);
const state={version:1,center:[35,140],zoom:7,url:'/?region=range&box=1',query:'?region=range',controls:{'include-future':false},rangeCollapsed:true};assert.deepEqual(V.readState({getItem:()=>JSON.stringify(state)}),state);assert.equal(V.readState({getItem:()=>'{broken'}),null);
const links=[{},{}];const context={sessionStorage:{getItem:()=>JSON.stringify(state)},location:{href:'https://alta-system.github.io/help.html',origin:'https://alta-system.github.io'},document:{querySelectorAll:()=>links},URL};vm.runInNewContext(fs.readFileSync('web/help-return.js','utf8'),context);assert.equal(links[0].href,'https://alta-system.github.io/?region=range&box=1');state.url='https://example.com';links[0].href='safe';vm.runInNewContext(fs.readFileSync('web/help-return.js','utf8'),context);assert.equal(links[0].href,'safe');
console.log('Activity categories, raw text preservation, session view and safe help return passed');
const app=fs.readFileSync('web/app.js','utf8');const start=app.indexOf('let previewId=null;'),end=app.indexOf('function draw(f,anchor)',start);
const features=[{id:'a',properties:{text:'MISSILE FIRING',layer:'NOTAM'}},{id:'b',properties:{text:'RESTRICTED AREA',layer:'NAVWARN'}}];const painted=new Map(features.map(f=>[f.id,{setStyle(s){this.style=s},bringToFront(){this.front=true}}]));
const cx={AltaView:V,AltaUI:require('../web/monitor-ui.js'),clock:()=>Date.now(),map:null,selectedAlerts:new Set(),activeId:null,baseColor:f=>f.properties.layer==='NAVWARN'?'orange':'red',visible:features,layers:painted};vm.createContext(cx);vm.runInContext(app.slice(start,end),cx);cx.previewFeature(features[0]);assert.equal(painted.get('a').style.color,'#f5f2e8');cx.previewFeature(features[1]);assert.equal(painted.get('a').style.color,'red');assert.equal(painted.get('a').style.weight,2);cx.clearPreview();assert.equal(painted.get('b').style.color,'orange');assert.equal(painted.get('b').style.weight,2);
console.log('Hover candidate highlight and restored hazard emphasis passed');

cx.activeId='b';cx.clearPreview();assert.equal(cx.alertStyle(features[1]).color,'#f5f2e8');assert.match(app,/b.onclick=\(\)=>focusFeature\(f\)/);

cx.activeId=null;assert.equal(cx.alertStyle({id:'sea',properties:{text:'MISSILE FIRING',layer:'NAVWARN'}}).color,'orange');assert.equal(cx.alertStyle(features[0]).weight,cx.alertStyle(features[1]).weight);

cx.clock=()=>Date.parse('2026-10-20T03:00:00Z');const live={id:'live',properties:{validFrom:'2026-10-20T02:00:00Z',validTo:'2026-10-20T04:00:00Z'}};
assert.equal(cx.alertStyle(live).fill,false);assert.equal(cx.alertStyle(live).fillOpacity,0);assert.equal(cx.alertStyle(live).dashArray,null);assert.equal(cx.alertStyle({...live,properties:{...live.properties,validFrom:'2026-10-20T03:30:00Z'}}).fill,false);assert.equal(cx.alertStyle({...live,properties:{...live.properties,accuracy:'text-trace'}}).fill,false);

assert.equal(V.category({text:'RWY LOW VISIBILITY DUE FOG'}),'weather');assert.equal(V.category({text:'MILITARY EXERCISE SUBJECT TO WEATHER'}),'exercise');

for(const properties of [{...live.properties,validFrom:"2026-10-20T03:30:00Z"},{},{...live.properties,schedule:"DLY 0400-0500"}]){const style=cx.alertStyle({id:"inactive",properties});assert.equal(style.fill,false);assert.equal(style.fillOpacity,0);assert.equal(style.dashArray,"6 5");}
assert.equal(cx.alertStyle({...live,properties:{...live.properties,accuracy:"qline-envelope"}}).dashArray,null);
