const assert=require('node:assert/strict'),fs=require('node:fs'),S=require('../web/shapefile.js');
const feature=(id,geometry,p={})=>({type:'Feature',id,geometry,properties:{id,name:'試験警報 '+id,layer:'NOTAM',originalText:'全文を保持 '+('座標・原文 '.repeat(200)),...p}});
const poly=[[[139,35],[140,35],[140,36],[139,36],[139,35]],[[139.2,35.2],[139.2,35.4],[139.4,35.4],[139.4,35.2],[139.2,35.2]]];
const records=[feature('polygon',{type:'Polygon',coordinates:poly}),feature('circle',{type:'Point',coordinates:[141,35]},{radius_m:1852}),feature('extra',{type:'Polygon',coordinates:poly},{additionalCircles:[{center:[142,35],radius_m:2500}]}),feature('trace',{type:'MultiPoint',coordinates:[[10,10],[11,11]]},{accuracy:'text-trace',referenceLines:[[[10,10],[11,11]],[[179,20],[-179,21]]]}),feature('point',{type:'Point',coordinates:[12,12]}),feature('multi',{type:'MultiPolygon',coordinates:[poly,[[[20,20],[21,20],[21,21],[20,20]]]]}),feature('dateline',{type:'Polygon',coordinates:[[[179,30],[-179,30],[-179,32],[179,32],[179,30]]]}),feature('dateline-circle',{type:'Point',coordinates:[179.99,40]},{radius_m:10000}),feature('unplotted',null)];
const result=S.build(records),f=result.files;
assert(result.shapeCount>=12);assert.equal(result.issues.length,1);
const raw=JSON.parse(f['alerts.json']);assert.equal(raw.records.length,records.length);assert.equal(raw.records[0].feature.properties.originalText,records[0].properties.originalText);
for(const name of ['polygons','lines','points']){
 const shp=new DataView(f[name+'.shp'].buffer),shx=new DataView(f[name+'.shx'].buffer),dbf=new DataView(f[name+'.dbf'].buffer),n=(shx.byteLength-100)/8;
 assert.equal(shp.getInt32(0),9994);assert.equal(shp.getInt32(24)*2,shp.byteLength);assert.equal(shp.getInt32(28,true),1000);assert.equal(dbf.getUint32(4,true),n);assert.equal(f[name+'.cpg'],'UTF-8');assert.match(f[name+'.prj'],/WGS 84/);
 let end=100;for(let i=0;i<n;i++){const offset=shx.getInt32(100+i*8)*2,len=shx.getInt32(104+i*8)*2;assert.equal(offset,end);assert.equal(shp.getInt32(offset),i+1);assert.equal(shp.getInt32(offset+4)*2,len);assert.equal(shp.getInt32(offset+8,true),shp.getInt32(32,true));end=offset+8+len;}assert.equal(end,shp.byteLength);
}
const p=S.prepare(records);assert.equal(p.groups.points.length,1);assert.equal(p.groups.lines.length,2);assert.equal(p.groups.lines[1].parts.length,2);
const signed=r=>r.slice(1).reduce((n,c,i)=>n+r[i][0]*c[1]-c[0]*r[i][1],0)/2;
for(const row of p.groups.polygons){row.parts.forEach((r,i)=>{assert.deepEqual(r[0],r.at(-1));assert(i===0?signed(r)<0:signed(r)>0);for(const [x,y]of r){assert(x>=-180&&x<=180);assert(y>=-90&&y<=90);}});const xs=row.parts.flat().map(c=>c[0]);assert(Math.max(...xs)-Math.min(...xs)<5);}
assert.equal(p.groups.polygons.filter(r=>r.p.id==='dateline').length,2);
assert.equal(p.groups.polygons.filter(r=>r.p.id==='dateline-circle').length,2);
const ring=S.circle([141,35],1852);assert.equal(ring.length,361);assert.deepEqual(ring[0],ring.at(-1));
const r=Math.PI/180;for(const [x,y]of ring){const h=Math.sin((y-35)*r/2)**2+Math.cos(35*r)*Math.cos(y*r)*Math.sin((x-141)*r/2)**2;assert(Math.abs(2*6371000*Math.asin(Math.sqrt(h))-1852)<.001);}
assert.throws(()=>S.build([]));assert(S.prepare([feature('bad',{type:'Point',coordinates:[NaN,35]})]).issues.length>0);
if(process.env.ALTA_TEST_ZIP)fs.writeFileSync(process.env.ALTA_TEST_ZIP,result.bytes);
console.log('SHP/SHX/DBF alignment, multipart, hole winding, dateline split, circles, traces and full originals passed');
for(const lat of [89.9,-89.9]){const cap=S.prepare([feature('polar',{type:'Point',coordinates:[0,lat]},{radius_m:100000})]);assert.equal(cap.issues.length,0);assert(cap.groups.polygons.flatMap(r=>r.parts.flat()).some(c=>c[1]===(lat>0?90:-90)));}
assert.equal(S.lines([[179,20],[180,20]]).length,1);
assert.equal(S.lines([[180,20],[179,20]]).length,1);
