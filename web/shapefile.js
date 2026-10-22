/* Browser-only ESRI Shapefile + ZIP export. No network calls or server upload.
 * Binary layout: https://downloads.esri.com/support/whitepapers/ao_/shapefile.pdf
 * polygon-clipping (MIT, vendored) splits antimeridian polygons without bridges.
 */
(function(root){
'use strict';
const clip=typeof module!=='undefined'?require('./vendor/polygon-clipping-0.15.7.js'):root.polygonClipping;
const enc=new TextEncoder(),prj='GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]';
const wrap=x=>((x+180)%360+360)%360-180;
const valid=p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[1])<=90;
function checked(points,min){if(!Array.isArray(points)||points.length<min||!points.every(valid))throw Error('座標が不正です');return points.map(p=>p.slice(0,2));}
function unwrap(points){const out=checked(points,2);out[0][0]=wrap(out[0][0]);for(let i=1;i<out.length;i++)if(!(Math.abs(out[i][1])===90&&out[i][1]===out[i-1][1]))out[i][0]+=360*Math.round((out[i-1][0]-out[i][0])/360);return out;}
function closed(r){const p=checked(r,3);if(p[0][0]!==p.at(-1)[0]||p[0][1]!==p.at(-1)[1])p.push([...p[0]]);return p;}
function area(r){let sum=0;for(let i=0;i<r.length-1;i++)sum+=r[i][0]*r[i+1][1]-r[i+1][0]*r[i][1];return sum/2;}
function polygons(rings){
 const outer=unwrap(closed(rings[0])),anchor=outer[0][0];
 const unwrapped=[outer,...rings.slice(1).map(r=>{const h=unwrap(closed(r)),offset=360*Math.round((anchor-h[0][0])/360);return h.map(([x,y])=>[x+offset,y]);})];
 const xs=outer.map(p=>p[0]),min=Math.min(...xs),max=Math.max(...xs),result=[];
 for(let k=Math.floor((min+180)/360);k<=Math.floor((max+180)/360);k++){
  const left=-180+360*k,right=180+360*k;
  const pieces=clip.intersection(unwrapped,[[[left,-90],[right,-90],[right,90],[left,90],[left,-90]]]);
  for(const poly of pieces){const parts=poly.map((r,i)=>{let ring=closed(r.map(([x,y])=>[Math.max(-180,Math.min(180,x-360*k)),y]));if((area(ring)>0)===(i===0))ring.reverse();return ring;});if(parts.length&&Math.abs(area(parts[0]))>1e-12)result.push(parts);}
 }
 return result;
}
function circle(center,radius){
 if(!valid(center)||!Number.isFinite(radius)||radius<=0||radius>2000000)throw Error('円の中心・半径が不正です');
 const rad=Math.PI/180,lat=center[1]*rad,lon=center[0]*rad,d=radius/6371000,ring=[];
 for(let i=0;i<360;i++){const b=i*rad,p=Math.asin(Math.sin(lat)*Math.cos(d)+Math.cos(lat)*Math.sin(d)*Math.cos(b));const l=lon+Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(lat),Math.cos(d)-Math.sin(lat)*Math.sin(p));ring.push([l/rad,p/rad]);}
 ring.push([...ring[0]]);
 // A polar cap requires a boundary through the pole in longitude/latitude space.
 const u=unwrap(ring);if(Math.abs(u.at(-1)[0]-u[0][0])>180){const pole=center[1]>0?90:-90;u.push([u.at(-1)[0],pole],[u[0][0],pole],[...u[0]]);return u;}
 return ring;
}
function lines(points){const p=unwrap(points),result=[];let current=[[wrap(p[0][0]),p[0][1]]];
 for(let i=1;i<p.length;i++){const a=p[i-1],b=p[i],ka=Math.floor((a[0]+180)/360),kb=Math.floor((b[0]+180)/360);if(ka!==kb){const edge=ka<kb?180+360*ka:-180+360*ka,t=(edge-a[0])/(b[0]-a[0]),y=a[1]+t*(b[1]-a[1]),side=ka<kb?180:-180;current.push([side,y]);if(current.length>1&&current.some(p=>p[0]!==current[0][0]||p[1]!==current[0][1]))result.push(current);current=[[-side,y]];}current.push([wrap(b[0]),b[1]]);}if(current.length>1&&current.some(p=>p[0]!==current[0][0]||p[1]!==current[0][1]))result.push(current);return result;
}
function prepare(records){const groups={polygons:[],lines:[],points:[]},issues=[];
 records.forEach((f,index)=>{const p=f.properties||{},key=index+1;let count=0;
  const add=(kind,parts,method,radius=0)=>{groups[kind].push({parts,p,key,method,radius});count++;};
  const attempt=fn=>{try{fn();}catch(e){issues.push({record:key,id:f.id,message:e.message});}};
  const addPolygon=(rings,method,radius)=>{for(const part of polygons(rings))add('polygons',part,method,radius);};
  const addCircle=(center,radius)=>addPolygon([circle(center,radius)],'CIRCLE_360',radius);
  const g=f.geometry;
  if(g)attempt(()=>{switch(g.type){
   case 'Polygon':addPolygon(g.coordinates,'POLYGON');break;
   case 'MultiPolygon':for(const poly of g.coordinates)attempt(()=>addPolygon(poly,'POLYGON'));break;
   case 'Point':if(p.radius_m>0)addCircle(g.coordinates,p.radius_m);else add('points',[[wrap(checked([g.coordinates],1)[0][0]),g.coordinates[1]]],'REFERENCE');break;
   case 'MultiPoint':if(p.accuracy!=='text-trace'||!p.referenceLines?.length)for(const c of checked(g.coordinates,1))add('points',[[wrap(c[0]),c[1]]],'REFERENCE');break;
   case 'LineString':add('lines',lines(g.coordinates),'SOURCE_LINE');break;
   case 'MultiLineString':for(const l of g.coordinates)add('lines',lines(l),'SOURCE_LINE');break;
   default:throw Error('未対応の形状 '+g.type);
  }});
  for(const c of p.additionalCircles||[])attempt(()=>addCircle(c.center,c.radius_m));
  for(const l of p.referenceLines||[])attempt(()=>add('lines',lines(l),'SOURCE_LINE'));
  if(!count)issues.push({record:key,id:f.id,message:'出力できる位置・範囲がありません。原文は alerts.json に保存しました。'});
 });return {groups,issues};}
function box(points){let b=[Infinity,Infinity,-Infinity,-Infinity];for(const p of points){b[0]=Math.min(b[0],p[0]);b[1]=Math.min(b[1],p[1]);b[2]=Math.max(b[2],p[0]);b[3]=Math.max(b[3],p[1]);}return b;}
function putBox(v,offset,b){b.forEach((x,i)=>v.setFloat64(offset+i*8,x,true));}
function shapeFiles(rows,type){
 const bodies=rows.map(row=>{const pts=type===1?row.parts:row.parts.flat(),size=type===1?20:44+row.parts.length*4+pts.length*16,b=new Uint8Array(size),v=new DataView(b.buffer);v.setInt32(0,type,true);
  if(type===1){v.setFloat64(4,pts[0][0],true);v.setFloat64(12,pts[0][1],true);}else{putBox(v,4,box(pts));v.setInt32(36,row.parts.length,true);v.setInt32(40,pts.length,true);let offset=0;row.parts.forEach((r,i)=>{v.setInt32(44+i*4,offset,true);offset+=r.length;});pts.forEach(([x,y],i)=>{v.setFloat64(44+row.parts.length*4+i*16,x,true);v.setFloat64(52+row.parts.length*4+i*16,y,true);});}return b;});
 const bounds=box(rows.flatMap(r=>type===1?r.parts:r.parts.flat()));
 const header=size=>{const b=new Uint8Array(size),v=new DataView(b.buffer);v.setInt32(0,9994);v.setInt32(24,size/2);v.setInt32(28,1000,true);v.setInt32(32,type,true);putBox(v,36,bounds);return b;};
 const shp=header(100+bodies.reduce((n,b)=>n+8+b.length,0)),shx=header(100+rows.length*8),sv=new DataView(shp.buffer),xv=new DataView(shx.buffer);let offset=100;
 bodies.forEach((b,i)=>{sv.setInt32(offset,i+1);sv.setInt32(offset+4,b.length/2);shp.set(b,offset+8);xv.setInt32(100+i*8,offset/2);xv.setInt32(104+i*8,b.length/2);offset+=8+b.length;});return {shp,shx};
}
const fields=[['RECORD',10,r=>r.key],['ALERT_ID',254,r=>r.p.id],['NAME',254,r=>r.p.name],['COUNTRY',8,r=>r.p.country],['LAYER',12,r=>r.p.layer||'NOTAM'],['SOURCE',120,r=>r.p.source],['START_UTC',32,r=>r.p.validFrom],['END_UTC',32,r=>r.p.validTo],['LOWER',80,r=>r.p.altitude?.lower?.label||r.p.lower],['UPPER',80,r=>r.p.altitude?.upper?.label||r.p.upper],['ALT_BASIS',40,r=>r.p.altitude?.basis],['ACCURACY',40,r=>r.p.accuracy],['GEOM_KIND',24,r=>r.method],['RADIUS_M',24,r=>r.radius||''],['SOURCE_URL',254,r=>r.p.sourceURL]];
function utf8(value,max){let result='',bytes=0;for(const ch of String(value??'').replace(/[\u0000-\u001f]/g,' ')){const n=enc.encode(ch).length;if(bytes+n>max)break;result+=ch;bytes+=n;}return enc.encode(result);}
function dbf(rows){const head=33+fields.length*32,len=1+fields.reduce((n,f)=>n+f[1],0),b=new Uint8Array(head+len*rows.length+1),v=new DataView(b.buffer),d=new Date();b[0]=3;b[1]=d.getUTCFullYear()-1900;b[2]=d.getUTCMonth()+1;b[3]=d.getUTCDate();v.setUint32(4,rows.length,true);v.setUint16(8,head,true);v.setUint16(10,len,true);fields.forEach(([name,width],i)=>{const o=32+i*32;b.set(enc.encode(name),o);b[o+11]=67;b[o+16]=width;});b[head-1]=13;
 rows.forEach((r,i)=>{let o=head+i*len;b.fill(32,o,o+len);o++;for(const [,width,get]of fields){b.set(utf8(get(r),width),o);o+=width;}});b[b.length-1]=26;return b;}
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let j=0;j<8;j++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(b){let c=0xffffffff;for(const x of b)c=crcTable[(c^x)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function join(parts){const b=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let o=0;for(const p of parts){b.set(p,o);o+=p.length;}return b;}
function zip(files){const local=[],central=[];let offset=0;for(const [name,value]of Object.entries(files)){const data=typeof value==='string'?enc.encode(value):value,n=enc.encode(name),crc=crc32(data),h=new Uint8Array(30+n.length),v=new DataView(h.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,n.length,true);h.set(n,30);local.push(h,data);
 const c=new Uint8Array(46+n.length),cv=new DataView(c.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint16(14,33,true);cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,n.length,true);cv.setUint32(42,offset,true);c.set(n,46);central.push(c);offset+=h.length+data.length;}
 const end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,central.length,true);v.setUint16(10,central.length,true);v.setUint32(12,central.reduce((n,p)=>n+p.length,0),true);v.setUint32(16,offset,true);return join([...local,...central,end]);}
function build(records){if(!records.length)throw Error('警報を選択してください。');const {groups,issues}=prepare(records),files={};let shapeCount=0;
 for(const [name,rows]of Object.entries(groups)){if(!rows.length)continue;const type=name==='polygons'?5:name==='lines'?3:1;const {shp,shx}=shapeFiles(rows,type);files[name+'.shp']=shp;files[name+'.shx']=shx;files[name+'.dbf']=dbf(rows);files[name+'.prj']=prj;files[name+'.cpg']='UTF-8';shapeCount+=rows.length;}
 files['alerts.json']=JSON.stringify({exportedAt:new Date().toISOString(),records:records.map((feature,i)=>({record:i+1,feature})),issues},null,2);
 files['README.txt']='ALTA SYSTEM / Shapefile export\nWGS 84 (EPSG:4326), longitude/latitude, UTF-8 attributes.\n'+
 'polygons: areas; lines: source coordinate traces (not confirmed boundaries); points: reference locations.\n'+
 'Circles are approximated by 360 geodesic vertices (Earth radius 6371000m). GEOM_KIND=CIRCLE_360; RADIUS_M preserves the source radius.\n'+
 'Antimeridian polygons/lines are split at +/-180 degrees. Multipart warnings retain a shared RECORD number.\n'+
 'DBF fields have byte limits. alerts.json preserves the complete original properties/text and geometry; join using RECORD.\n'+
 'Altitude labels retain their source reference (FL/AGL/AMSL). Geometry is 2D; no height datum conversion is performed.\n'+
 '選択済み警報は表示フィルターに隠れたものも含みます。描画できない警報・部分形状は alerts.json の issues を確認してください。\n'+
 '警報 '+records.length+'件 / 出力形状 '+shapeCount+'件 / 確認事項 '+issues.length+'件\n';
 return {files,bytes:zip(files),shapeCount,issues,filename:'alta-alerts-'+new Date().toISOString().replace(/[:.]/g,'-')+'.zip'};
}
const api={build,prepare,circle,polygons,lines};root.AltaShape=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
