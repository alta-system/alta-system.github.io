/* ALTA SYSTEM: multi-country selection, independent region browsing, local PDF export. */
'use strict';
(async()=>{await window.altaAccessReady;
const $=s=>document.querySelector(s);
const params=new URLSearchParams(location.search),demoMode=false,dataRoot='production/';
const regions={...Object.fromEntries(Object.entries(AltaMonitor.regions).map(([k,v])=>[k,v.name])),Antarctic:'南極',Other:'国未特定 / 国際海域'};
let marineFeed=null,archiveAt=null,archiveManifest=null,pdfMode=false,activeId=null;const unread=new Map();let restoredNotifications=false;let notificationState=null;const notificationKey='alta-notifications-v1';try{notificationState=JSON.parse(localStorage.getItem(notificationKey)||'null');}catch{}
let region=params.get('region')||(params.has('countries')?'custom':'Asia'),index=null,catalog=[],feeds=new Map(),visible=[],layers=new Map(),loading=false,failures=[];
let selectedCountries=new Set((params.get('countries')??params.get('country')??(demoMode?'JP,KR,US,GB,AU':'')).toUpperCase().split(',').filter(c=>/^[A-Z]{2}$/.test(c)));
const selectedAlerts=new Set();
let rangeBox=null,rangeStart=null,rangeDrawing=false,rangeLayer=null;
try{const b=JSON.parse(params.get('box')||'null');if(Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)&&b[0]>=-90&&b[2]<=90&&b[0]<b[2]&&b[1]<b[3]&&b[3]-b[1]<=360)rangeBox=b;}catch{}
let reportURL=null,pdfBusy=false,initialCountries=!params.has('countries')&&!params.has('country')&&!demoMode;
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
const time=v=>v?new Date(v).toLocaleString('ja-JP',{timeZone:'UTC'})+' UTC':'未取得';
const accuracy={'provider-boundary':'提供元の境界','provider-circle':'提供元の円','qline-envelope':'Q行の概略円（正確な境界ではありません）','text-boundary':'本文の直線境界から抽出','text-circle':'本文の中心・半径から抽出','reference-point':'参照点のみ・危険区域の境界や半径は不明'};
const clock=()=>archiveAt?Date.parse(archiveAt):Date.now();
const expired=p=>p.validTo&&p.validTo!=='PERM'&&Date.parse(p.validTo)<=clock();
const issuedAt=p=>{const n=Date.parse(p.issuedISO||p.issued||p.issueDate||'');return Number.isFinite(n)?n:null;};
const recent=p=>{const t=issuedAt(p);return t!==null&&t<=clock()&&clock()-t<=10800000;};
const uncertain=p=>!p.validFrom||(!p.validTo&&p.validTo!=='PERM')||/unparsed|unknown|invalid/.test(p.timeStatus||'')||Boolean(p.schedule&&!/^H24$/i.test(p.schedule.trim()));
const baseColor=f=>f.properties.layer==='NAVWARN'?'#ffad42':'#fb5267';
function viewMatch(f){if(region==='all')return true;if(region==='range')return AltaSpatial.intersects(f,rangeBox);if(region==='custom')return selectedCountries.has(f.properties.country);const c=catalog.find(c=>c.code===f.properties.country);return (c&&c.code!=='ZZ'?AltaMonitor.countryRegion(c)===region:AltaMonitor.inBox(f,AltaMonitor.regions[region].box));}
const countryName=c=>catalog.find(x=>x.code===c)?.name||c;
const map=typeof L!=='undefined'?L.map('map',{worldCopyJump:false,zoomControl:false,preferCanvas:true}).setView([28,125],3):null;
let group=null;
if(map){L.control.zoom({position:'bottomright'}).addTo(map);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);group=L.featureGroup().addTo(map);}

function syncURL(){const p=new URLSearchParams(location.search);p.delete('country');p.set('countries',[...selectedCountries].sort().join(','));p.set('region',region);if(rangeBox)p.set('box',JSON.stringify(rangeBox));else p.delete('box');history.replaceState(null,'',location.pathname+'?'+p.toString());}
function allFeatures(){const m=new Map();for(const data of feeds.values()){
 for(const f of data.features||[])if(!expired(f.properties))m.set(f.id,f);
 for(const p of data.unplotted||[])if(!expired(p)){const id=p.featureId||p.country+':'+p.id;m.set(id,{type:'Feature',id,geometry:null,properties:p});}
}return m;}
function reportSelection(){const all=allFeatures();return [...selectedAlerts].map(id=>all.get(id)).filter(Boolean);}
function pruneSelection(){const all=allFeatures();for(const id of selectedAlerts)if(!all.has(id))selectedAlerts.delete(id);}
function updateReportUI(){const all=allFeatures(),selected=reportSelection();$('#pdf-button').disabled=pdfBusy||!selected.length;$('#pdf-count').textContent=`選択 ${selected.length}件（表示条件に隠れた選択も含む）`;document.querySelectorAll('[data-alert-id]').forEach(n=>n.checked=selectedAlerts.has(n.dataset.alertId));for(const [id,l] of layers)l.setStyle({color:selectedAlerts.has(id)?'#5eead4':baseColor(all.get(id)),weight:selectedAlerts.has(id)?4:2});}
function toggleAlert(id,checked){checked?selectedAlerts.add(id):selectedAlerts.delete(id);updateReportUI();}
function alertCheck(f){const label=node('label',null,'report-check');label.hidden=!pdfMode;const c=node('input');c.type='checkbox';c.dataset.alertId=f.id;c.checked=selectedAlerts.has(f.id);c.setAttribute('aria-label',f.properties.name+'をPDFに選択');c.onchange=()=>toggleAlert(f.id,c.checked);label.append(c,node('span','PDFに選択'));return label;}
function details(f){const p=f.properties,el=node('article',null,'popup');el.append(node('small',p.type+' / '+countryName(p.country)),node('h3',p.name),alertCheck(f));const dl=node('dl');for(const [k,v] of [['識別子',p.id],['Qコード',p.qcode||'未提供'],['区域情報',accuracy[p.accuracy]||'未描画'],['国の分類根拠',p.countryBasis||'デモ'],['所在地コード',p.icaoLocation||p.location||'未提供'],['形状の注意',[p.geometryWarning,p.geometryNote,p.textGeometryWarning].filter(Boolean).join(' / ')||'—'],['時刻の注意',p.timeWarning||'—'],['高度',p.altitude?.label||`${p.lower??'未提供'} — ${p.upper??'未提供'}`],['高度の根拠',p.altitude?.basis||'未提供'],['抽出根拠',(p.criticalReasons||p.matches||[]).join(' / ')],['レイヤー',p.layer||'NOTAM'],['発表時刻',p.issuedISO?time(p.issuedISO):(p.issued||p.issueDate||'未提供（取得時刻とは異なります）')],['取得時刻',time(p.fetchedAt)],['開始',p.validFrom||'未提供'],['終了',p.validTo||'未提供'],['時間条件',p.schedule||p.timeStatus],['出典',p.source]])dl.append(node('dt',k),node('dd',v));el.append(dl);const raw=node('details');raw.append(node('summary','本文・運用時間を確認'),node('p',p.text||''));el.append(raw);if(p.sourceURL){try{const u=new URL(p.sourceURL);if(u.protocol==='https:'&&['msi.nga.mil','www1.kaiho.mlit.go.jp','hydrography.paknavy.gov.pk'].includes(u.hostname)){const a=node('a','公式の海域警報を開く ↗');a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';a.className='source-link';el.append(a);}}catch{}}return el;}
function positions(g){if(g.type==='Point')return [g.coordinates];if(g.type==='MultiPoint')return g.coordinates;return g.type==='Polygon'?g.coordinates.flat():g.coordinates.flat(2);}
// The largest empty longitude gap places JP + US around the Pacific, avoiding an unnecessary world-wide view.
function longitudeAnchor(fs){const xs=fs.flatMap(f=>positions(f.geometry).map(p=>(p[0]+360)%360)).sort((a,b)=>a-b);if(!xs.length)return 0;let gap=-1,start=xs[0];for(let i=0;i<xs.length;i++){const next=i+1<xs.length?xs[i+1]:xs[0]+360;if(next-xs[i]>gap){gap=next-xs[i];start=next%360;}}return start;}
function longitudeCenter(fs){const start=longitudeAnchor(fs),xs=fs.flatMap(f=>positions(f.geometry).map(p=>{let x=(p[0]+360)%360;return x<start?x+360:x;}));return xs.length?(Math.min(...xs)+Math.max(...xs))/2:0;}
function shiftedGeometry(g,anchor){const pts=positions(g),center=pts.reduce((s,p)=>s+p[0],0)/pts.length;const offset=360*Math.round((anchor-center)/360);const shift=p=>[p[0]+offset,p[1]];return {type:g.type,coordinates:g.type==='Point'?shift(g.coordinates):g.type==='MultiPoint'?g.coordinates.map(shift):g.type==='Polygon'?g.coordinates.map(r=>r.map(shift)):g.coordinates.map(poly=>poly.map(r=>r.map(shift)))};}
// Resize the canvas after toolbar/sidebar/viewport changes without moving the camera.
if(map){
  let resizeFrame;
  const resizeMap=()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>map.invalidateSize({pan:false,debounceMoveend:true}));};
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(resizeMap).observe($('#map'));
  window.addEventListener('resize',resizeMap);
  const closeHover=hideHover;
  map.on('zoomstart movestart',closeHover);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)closeHover();});
}
$('#sidebar-toggle').onclick=()=>{const open=document.body.classList.toggle('sidebar-open');$('#sidebar-toggle').setAttribute('aria-expanded',String(open));};
$('#sidebar-close').onclick=()=>{document.body.classList.remove('sidebar-open');$('#sidebar-toggle').setAttribute('aria-expanded','false');};
document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('#sidebar-close').click();$('#picker-close').click();}});
function hideHover(){const tip=$('#hover-detail');if(tip){tip.hidden=true;tip.replaceChildren();}}
function showHover(f,event){
 const e=event.originalEvent;
 if(!e||e.pointerType==='touch')return;
 const box=$('#map').getBoundingClientRect(),tip=$('#hover-detail'),p=f.properties;
 tip.replaceChildren(node('strong',p.name));
 if($('#alt-labels').checked)tip.append(node('div',p.altitude?.label||'高度未提供'));
 tip.hidden=false;
 tip.style.left=Math.max(8,Math.min(e.clientX-box.left+14,box.width-tip.offsetWidth-8))+'px';
 tip.style.top=Math.max(8,Math.min(e.clientY-box.top+14,box.height-tip.offsetHeight-8))+'px';
}
$('#map').addEventListener('pointerleave',hideHover);
window.addEventListener('blur',hideHover);
function draw(f,anchor){const p=f.properties,g=shiftedGeometry(f.geometry,anchor),selected=selectedAlerts.has(f.id);const style={color:selected?'#5eead4':baseColor(f),weight:selected?4:2,fillColor:baseColor(f),fillOpacity:p.accuracy==='qline-envelope'?.025:.07,dashArray:p.accuracy==='qline-envelope'?'6 5':undefined};let l;if(g.type==='Point'){const [lon,lat]=g.coordinates;l=Number.isFinite(p.radius_m)&&p.radius_m>0?L.circle([lat,lon],{...style,radius:p.radius_m}):L.circleMarker([lat,lon],{...style,radius:5,fillOpacity:.7});}else l=L.geoJSON({...f,geometry:g},{style,pointToLayer:(_,latlng)=>L.circleMarker(latlng,{...style,radius:6,fillOpacity:.5,dashArray:'2 3'})});l.on('mouseover',e=>showHover(f,e));l.on('mousemove',e=>showHover(f,e));l.on('mouseout',hideHover);l.on('remove',hideHover);l.on('click',e=>{if(e.originalEvent)L.DomEvent.stopPropagation(e.originalEvent);if(rangeDrawing)return;selectAt(e.latlng,f);});group.addLayer(l);layers.set(f.id,l);return l;}

let lockedMapHandlers=null;
function lockRangeMap(on){
 if(!map)return;
 if(on&&!lockedMapHandlers){map.stop();lockedMapHandlers=['dragging','touchZoom','doubleClickZoom','scrollWheelZoom','boxZoom','keyboard'].filter(k=>map[k]?.enabled());for(const k of lockedMapHandlers)map[k].disable();hideHover();$('#detail-panel').hidden=true;$('#overlap-panel').hidden=true;}
 else if(!on&&lockedMapHandlers){for(const k of lockedMapHandlers)map[k].enable();lockedMapHandlers=null;}
 $('.map-shell').classList.toggle('drawing-range',on);
}
function updateRangeUI(){
 $('#range-tools').hidden=region!=='range';
 const drawing=region==='range'&&rangeDrawing;lockRangeMap(drawing);$('#range-drag-surface').hidden=!drawing;if(!drawing)rangeDrag.reset();
 $('#range-draw').textContent=drawing?'範囲指定を中止':'範囲指定を開始';
 $('#range-status').textContent=rangeDrawing?'地図をドラッグして、離すと範囲が確定します（Escで中止）':rangeBox?`北緯 ${rangeBox[0].toFixed(2)}〜${rangeBox[2].toFixed(2)} / 経度 ${rangeBox[1].toFixed(2)}〜${rangeBox[3].toFixed(2)}`:'範囲を指定してください';
 $('#range-draw').setAttribute('aria-pressed',String(rangeDrawing));
 if(rangeLayer)map?.removeLayer(rangeLayer);rangeLayer=null;
 if(region==='range'&&rangeBox&&map)rangeLayer=L.rectangle([[rangeBox[0],rangeBox[1]],[rangeBox[2],rangeBox[3]]],{color:'#5eead4',weight:2,dashArray:'8 6',fill:false,interactive:false}).addTo(map);
}
function useCurrentRange(){if(!map)return;const b=map.getBounds(),w=b.getWest(),e=Math.min(b.getEast(),w+360);rangeBox=[Math.max(-90,b.getSouth()),w,Math.min(90,b.getNorth()),e];rangeDrawing=false;rangeStart=null;syncURL();}
function openFeature(f){$('#overlap-panel').hidden=true;showDetail(f);if(pdfMode)toggleAlert(f.id,!selectedAlerts.has(f.id));}
function selectAt(ll,fallback){
 if(!ll){openFeature(fallback);return;}
 hideHover();const anchor=map.getCenter().lng,p=map.latLngToContainerPoint(ll),project=xy=>{const q=map.latLngToContainerPoint([xy[1],xy[0]]);return [q.x,q.y];};
 const hits=visible.filter(f=>AltaSpatial.hit(f,[p.x,p.y],project,anchor));
 if(fallback&&!hits.some(f=>f.id===fallback.id))hits.push(fallback);
 if(hits.length===1){openFeature(hits[0]);return;}if(!hits.length)return;
 $('#detail-panel').hidden=true;
 $('#overlap-title').textContent=`この場所の警報 ${hits.length}件`;
 $('#overlap-list').replaceChildren(...hits.map(f=>{const b=node('button',`${f.properties.layer||'NOTAM'} / ${f.properties.id} / ${f.properties.name}`);b.onclick=()=>openFeature(f);return b;}));
 $('#overlap-panel').hidden=false;
}
$('#overlap-close').onclick=()=>{$('#overlap-panel').hidden=true;};
$('#range-current').onclick=()=>{useCurrentRange();render();};
$('#range-draw').onclick=()=>{rangeDrawing=!rangeDrawing;rangeStart=null;updateRangeUI();};
const rangeDrag=AltaRangeDrag.attach($('#range-drag-surface'),$('#range-drag-preview'),(a,b)=>{
 if(!map||region!=='range'||!rangeDrawing)return;
 const p=map.containerPointToLatLng(a),q=map.containerPointToLatLng(b);
 const w=Math.min(p.lng,q.lng),e=Math.max(p.lng,q.lng);
 if(e-w>360){$('#range-status').textContent='世界一周（360度）以内の幅で指定してください';return;}
 rangeBox=[Math.max(-90,Math.min(p.lat,q.lat)),w,Math.min(90,Math.max(p.lat,q.lat)),e];
 rangeDrawing=false;rangeStart=null;syncURL();render();
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&rangeDrawing){rangeDrawing=false;rangeStart=null;updateRangeUI();}});
function cancelRangeDrag(){if(rangeDrawing){rangeDrawing=false;rangeStart=null;updateRangeUI();}else rangeDrag.reset();}
window.addEventListener('blur',cancelRangeDrag);
if(map)map.on('resize',cancelRangeDrag);

function fitVisible(){if(!map)return;if(group.getLayers().length){map.fitBounds(group.getBounds(),{padding:[50,50],maxZoom:8,animate:false});}else{const chosen=catalog.filter(c=>selectedCountries.has(c.code));if(chosen.length===1)map.setView(chosen[0].center,4,{animate:false});else if(chosen.length){const a=longitudeAnchor(chosen.map(c=>({geometry:{type:'Point',coordinates:[c.center[1],c.center[0]]}})));map.fitBounds(chosen.map(c=>{let lon=(c.center[1]+360)%360;if(lon<a)lon+=360;return [c.center[0],lon]}),{padding:[50,50],maxZoom:5,animate:false});}else map.setView([25,20],2);}}
function jumpCountry(code){if(!map)return;const ls=visible.filter(f=>f.properties.country===code).map(f=>layers.get(f.id)).filter(Boolean);if(ls.length)map.fitBounds(L.featureGroup(ls).getBounds(),{padding:[45,45],maxZoom:8,animate:false});else{const c=catalog.find(c=>c.code===code);if(c)map.setView(c.center,4,{animate:false});}}
function countryStatus(code){const c=index?.countries.find(c=>c.code===code);if(!c)return demoMode?'デモなし':'今回の取得範囲にデータなし';const m=feeds.get(code)?.metadata;if(failures.includes(code))return '再読込失敗';if(m?.status==='unconfigured')return 'API未接続';return demoMode?'架空デモ':(index?.status==='error'||m?.status==='error')?'取得失敗':m?.lastSuccess?`${c.count+c.unplotted}件`:'未取得';}
function updateChoices(){const list=catalog;const openGroups=new Set([...document.querySelectorAll('.country-region[open]')].map(n=>n.dataset.region));const groups=[];for(const [r,title]of Object.entries(regions)){const members=list.filter(c=>AltaMonitor.countryRegion(c)===r);if(!members.length)continue;const section=node('details',null,'country-region');section.dataset.region=r;section.open=openGroups.has(r);section.append(node('summary',`${title}（選択 ${members.filter(c=>selectedCountries.has(c.code)).length} / ${members.length}）`));for(const c of members){const row=node('div',null,'country-row'),check=node('input'),jump=node('button',c.name+' / '+c.code+' ↗');check.type='checkbox';check.checked=selectedCountries.has(c.code);check.setAttribute('aria-label',c.name+'を表示');check.onchange=()=>{region='custom';check.checked?selectedCountries.add(c.code):selectedCountries.delete(c.code);syncURL();render(true);updateChoices();};jump.type='button';jump.title='地図を'+c.name+'へ移動';jump.setAttribute('aria-label',c.name+'へ移動');jump.onclick=()=>jumpCountry(c.code);row.append(check,jump,node('small',countryStatus(c.code)));section.append(row);}groups.push(section);}$('#country-list').replaceChildren(...groups);$('#country-count').textContent=`選択 ${selectedCountries.size} / 250 国・地域＋国未特定`;document.querySelectorAll('#tabs button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.region===region)));}
function render(fit=false){hideHover();$('#overlap-panel').hidden=true;updateRangeUI();group?.clearLayers();layers.clear();visible=[];const rows=[],missing=[];const kinds=new Set([...document.querySelectorAll('[data-kind]:checked')].map(x=>x.dataset.kind));const query=$('#search').value.trim().toLowerCase();const chosen=catalog;const matches=p=>((p.layer==='NAVWARN')?$('#layer-marine').checked:$('#layer-notam').checked)&&!expired(p)&&($('#include-future').checked||!p.validFrom||Date.parse(p.validFrom)<=clock())&&($('#include-unknown').checked||!uncertain(p))&&kinds.has(p.type)&&(!query||`${p.id} ${p.name} ${p.text} ${p.qcode}`.toLowerCase().includes(query));for(const c of chosen){const data=feeds.get(c.code);if(!data)continue;for(const f of data.features){const p=f.properties;if(!viewMatch(f)||!matches(p))continue;visible.push(f);}for(const p of data.unplotted||[])if(region!=='range'&&matches(p)&&(c.code==='ZZ'||region==='all'||(region==='custom'?selectedCountries.has(p.country):AltaMonitor.countryRegion(c)===region))){const f={type:'Feature',id:p.featureId||p.country+':'+p.id,geometry:null,properties:p};const el=node('details',null,'unplotted-item');el.append(node('summary',`${c.code==='ZZ'?'地域未判定':c.code} / ${p.name} — 範囲・位置を描画できません`),details(f));missing.push(el);}}const anchor=fit?(AltaMonitor.regions[region]?.view[1]??longitudeCenter(visible)):(map?.getCenter().lng??0);visible.sort((a,b)=>(issuedAt(b.properties)||0)-(issuedAt(a.properties)||0));const recentRows=[];for(const f of visible){const p=f.properties,l=map?draw(f,anchor):null,row=node('div',null,'area');row.dataset.featureId=f.id;row.classList.toggle('active-alert',activeId===f.id);const b=node('button',null,'area-detail');b.append(node('span',p.country+' / '+p.type,'area-type'),node('strong',p.name),node('small',`発表 ${issuedAt(p)?time(new Date(issuedAt(p)).toISOString()):(p.issued||'未提供')} / ${uncertain(p)?'時間条件未判定':p.validFrom&&Date.parse(p.validFrom)>clock()?'開始前':'有効期間内'}`),node('small',(p.altitude?.label||'高度未提供')+' · '+p.id+(p.timeStatus==='future'?' · 開始前':'')+(p.accuracy==='qline-envelope'?' · 概略円':p.accuracy==='reference-point'?' · 参照点／範囲不明':'')));b.onclick=()=>showDetail(f);const locate=node('button','地図へ ↗','locate-alert');locate.onclick=()=>focusFeature(f);row.append(b,locate,alertCheck(f));if(recent(p)){row.classList.add('recent-alert');recentRows.push(row);}else rows.push(row);}$('#count').textContent=String(visible.length).padStart(2,'0');$('#recent-areas').replaceChildren(node('h3',`発表から3時間以内 ${recentRows.length}件`),...(recentRows.length?recentRows:[node('p','該当なし（発表時刻が未提供の警報は含みません）','micro')]));$('#areas').replaceChildren(node('h3','その他の表示中警報'),...(rows.length?rows:[node('p','表示対象はありません。未描画の警報・取得範囲・選択条件もご確認ください。','empty')]));$('#unplotted-count').textContent=`未描画の警報 ${missing.length}件`;$('#unplotted-list').replaceChildren(...missing);$('#map-title').textContent=region==='range'?'指定した範囲':region==='custom'?`選択した ${selectedCountries.size} 国・地域`:region==='all'?'世界全体':regions[region];
const stale=index.status==='error'||failures.length>0||(!demoMode&&(!index.lastSuccess||Date.now()-Date.parse(index.lastSuccess)>3600000));
const note=[];if(demoMode)note.push('DEMO：すべて架空');else note.push(index.lastSuccess?'FAA本番環境・定期取得':'FAA本番環境・取得未完了');
if(!demoMode&&index.status==='error')note.push(index.error==='http_401'||index.error==='http_403'?'本番の認証・アクセス権を確認してください':`取得エラー：${index.error||'unknown'}`);
if(!demoMode&&index.coverage&&!index.coverageComplete)note.push('初回取得の一部が未完了');
if(index.coverageGap)note.push('同期の空白期間あり・再取得待ち');
if(stale)note.push(index.lastSuccess?'取得失敗または古いデータ：前回の成功分を表示':'本番データは未取得です');
if(region==='custom'&&!selectedCountries.size)note.push('対象国をチェックしてください');if(!map)note.push('地図ライブラリの読込失敗');
$('#notice').textContent=archiveAt?'保存時点 '+time(archiveAt)+' の観測記録（現在の警報ではありません）':note.join(' / ');$('#notice').classList.toggle('warning',Boolean(stale));
$('#mode').textContent=demoMode?'DEMO DATA':index.lastSuccess?'FAA PRODUCTION':'FAA PRODUCTION / 未取得';
$('#updated').textContent=demoMode?'架空データ・API未使用':'FAA取得成功：'+time(index.lastSuccess);
const st=index.stats;$('#feed-summary').textContent=demoMode?'架空データの操作デモ':st?`今回受信 ${st.received}件 / 保存中の対象警報 ${st.retained}件 / 本文形状 ${st.textShapes||0}件 / ${index.countries.filter(c=>c.count+c.unplotted>0).length}国・地域に分類。FAA配信範囲内。`:'本番データはまだ取得できていません。取得状態をご確認ください。';
const scopeFeatures=[...feeds.values()].flatMap(d=>d.features||[]).filter(f=>viewMatch(f)&&!expired(f.properties));
const future=scopeFeatures.filter(f=>f.properties.validFrom&&Date.parse(f.properties.validFrom)>clock()).length;
const approximate=scopeFeatures.filter(f=>f.properties.accuracy==='qline-envelope').length;
$('#visibility-summary').textContent=`この地域の描画可能な対象 ${scopeFeatures.length}件 → 表示 ${visible.length}件。開始前 ${future}件／概略円 ${approximate}件（境界の精度に注意）。条件に合う境界未確定 ${missing.length}件は下の一覧へ。全NOTAMではなく軍事・安全保障の抽出対象です。`;
pruneSelection();updateReportUI();if(fit){if(AltaMonitor.regions[region]){const [lat,lon,z]=AltaMonitor.regions[region].view;map?.setView([lat,lon],z,{animate:true});}else if(region==='range'){if(rangeBox)map?.fitBounds([[rangeBox[0],rangeBox[1]],[rangeBox[2],rangeBox[3]]],{padding:[20,20],animate:false});}else fitVisible();}}
async function json(url){const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('HTTP '+r.status);return r.json();}
async function refresh(first=false){
 if(archiveAt)return 'success';
 if(loading)return;loading=true;$('#refresh').disabled=true;
 try{
  const [next,countries,nav]=await Promise.all([json(dataRoot+'index.json'),catalog.length?Promise.resolve(null):json('countries.json'),demoMode?Promise.resolve(null):json('maritime/index.json').catch(()=>null)]);
  if(next.schemaVersion!==1||!Array.isArray(next.countries)||(!demoMode&&next.environment!=='production'))throw Error('schema');
  if(countries)catalog=[...countries.countries,{code:'ZZ',name:'国未特定',english:'Unassigned',region:'Other',center:[0,0]}].sort((a,b)=>a.name.localeCompare(b.name,'ja'));
  const nextFeeds=new Map();failures=[];
  for(let i=0;i<next.countries.length;i+=8){await Promise.all(next.countries.slice(i,i+8).map(async c=>{
   try{
    if(!/^[A-Z]{2}$/.test(c.code)||c.file!==c.code+'.json')throw Error('path');
    const data=await json(dataRoot+c.file+(next.generation?'?v='+encodeURIComponent(next.generation):''));
    if(!Array.isArray(data.features)||!Array.isArray(data.unplotted)||data.metadata.country!==c.code||data.metadata.demo!==next.demo||(!demoMode&&(data.metadata.environment!=='production'||data.metadata.generation!==next.generation)))throw Error('snapshot');
    nextFeeds.set(c.code,data);
   }catch{failures.push(c.code);}
  }));}
  // Commit all feeds together: a partial network failure must not mix snapshot generations.
  if(failures.length){$('#notice').textContent='国別JSONの同期失敗。前回の表示を保持しています。';return 'partial';}
  index=next;feeds=nextFeeds;
  if(nav?.type==='FeatureCollection'&&Array.isArray(nav.features)&&Array.isArray(nav.unplotted)){marineFeed=nav;}
  if(marineFeed){const zz=feeds.get('ZZ')||{features:[],unplotted:[],metadata:{country:'ZZ'}};feeds.set('ZZ',{...zz,features:[...zz.features,...marineFeed.features],unplotted:[...zz.unplotted,...marineFeed.unplotted]});}
  $('#marine-status').textContent=demoMode?'海域の架空データなし':!nav?'海域JSONの取得失敗・前回分を保持':(nav.metadata.sources||[nav.metadata]).map(m=>`${m.source}: 受信${m.received??'—'}件 → 対象${m.retained??0}件 / ${m.status==='ok'?'取得成功':'取得失敗・前回分'} ${m.errorCode||''} / ${time(m.lastSuccess)}`).join(' ｜ ')+` / 海域の未描画 ${nav.unplotted.length}件。配信範囲のみ・掲載中でも実施日時は原文参照。`;

  if(initialCountries){selectedCountries=new Set();initialCountries=false;}
  selectedCountries=new Set([...selectedCountries].filter(c=>catalog.some(x=>x.code===c)));
  updateChoices();syncURL();render(first);detectNewAlerts();return demoMode||(nav&&nav.metadata.status==='ok')?'success':'partial';
 }catch{$('#notice').textContent='一覧の同期失敗。前回の表示を保持しています。';throw Error('JSON synchronization failed');}
 finally{loading=false;$('#refresh').disabled=false;}
}
$('#tabs').onclick=e=>{const b=e.target.closest('[data-region]');if(!b)return;rangeDrawing=false;rangeStart=null;region=b.dataset.region;if(region==='range'&&!rangeBox)useCurrentRange();updateChoices();syncURL();if(index)render(true);};
$('#countries-clear').onclick=()=>{region='custom';selectedCountries.clear();syncURL();updateChoices();render(true);};$('#countries-all').onclick=()=>{region='custom';for(const c of catalog)selectedCountries.add(c.code);syncURL();updateChoices();render(true);};
$('#map-style').onchange=()=>{const value=$('#map-style').value;$('#map').dataset.style=value;try{localStorage.setItem('alta-map-style',value);}catch{}};
try{const saved=localStorage.getItem('alta-map-style');if(['standard','light','dark'].includes(saved))$('#map-style').value=saved;}catch{}
$('#map-style').onchange();
$('#show-all-hazards').onclick=()=>{region='all';$('#search').value='';$('#include-future').checked=false;$('#include-unknown').checked=true;document.querySelectorAll('[data-kind],#layer-notam,#layer-marine').forEach(el=>el.checked=true);syncURL();updateChoices();render(true);};
$('#search').oninput=()=>render();document.querySelectorAll('[data-kind],#include-future,#include-unknown,#layer-notam,#layer-marine,#alt-labels').forEach(el=>el.onchange=()=>render());$('#refresh').onclick=()=>archiveAt?loadArchive():refresher.manual();$('#fit').onclick=fitVisible;$('#pdf-clear').onclick=()=>{selectedAlerts.clear();updateReportUI();};
$('#pdf-button').onclick=async()=>{const button=$('#pdf-button');pdfBusy=true;button.disabled=true;$('#pdf-status').textContent='PDFを作成中…';try{const records=structuredClone(reportSelection());if(!records.length)throw Error('警報を選択してください。');const result=await AltaReport.download(records,{demo:demoMode,staging:false,countryName,feeds});if(reportURL)URL.revokeObjectURL(reportURL);reportURL=URL.createObjectURL(result.blob);const save=node('a','PDFを保存');save.href=reportURL;save.download=result.filename;save.className='pdf-save';$('#pdf-status').replaceChildren(node('span',`${records.length}件のPDFを作成しました。自動保存が始まらない場合はこちら： `),save);save.click();}catch(e){$('#pdf-status').textContent='PDF作成失敗：'+e.message;}finally{pdfBusy=false;updateReportUI();}};
if(!['all','custom','range',...Object.keys(AltaMonitor.regions)].includes(region))region='Asia';
let firstRefresh=true;
const refresher=new AltaRefreshController({load:async()=>{const result=await refresh(firstRefresh);firstRefresh=false;return result;},onState:s=>{
 const stamp=v=>v==null?'未同期':new Date(v).toLocaleTimeString('ja-JP',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});
 $('#sync-time').textContent=stamp(s.lastSuccess);
 const seconds=Math.ceil(s.remaining/1000);$('#sync-countdown').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}分${String(seconds%60).padStart(2,'0')}秒`;
 $('#sync-result').textContent=archiveAt?'アーカイブ表示中（自動切替しません）':({idle:'待機中',loading:'公開JSONを同期中…',success:'同期成功',partial:'一部の同期に失敗・前回データを保持',error:'通信失敗・前回の表示を保持'})[s.status];
 $('#sync-panel').dataset.state=s.status;
 $('#sync-attempt').textContent=s.lastAttempt==null?'—':stamp(s.lastAttempt);
 $('#refresh').disabled=s.busy;
}});
refresher.start();
setInterval(()=>{if(index&&!loading){render();detectNewAlerts();}},60000);
// Background tabs and sleeping devices may throttle timers. Catch up once when overdue.
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresher.due();});
window.addEventListener('online',()=>refresher.due());

function updateBell(){const count=unread.size;$('#bell-count').textContent=count;$('#bell').classList.toggle('has-new',count>0);$('#bell').setAttribute('aria-label',`新着・更新 ${count}件`);const rows=[];for(const f of unread.values()){const b=node('button',(f.notificationReason||'新着・更新')+' / '+(f.properties.layer||'NOTAM')+' / '+f.properties.name);b.onclick=()=>{showDetail(f);$('#notifications').hidden=true;$('#bell').setAttribute('aria-expanded','false');};rows.push(b);}$('#notification-list').replaceChildren(...(rows.length?rows:[node('p','未読の新着・更新はありません。')]));}
function detectNewAlerts(){
 if(archiveAt){$('#notification-status').textContent='アーカイブ表示中：通知監視は一時停止';return;}
 const all=allFeatures(),bounds=map?.getBounds();if(!bounds)return;
 if(!restoredNotifications){for(const [id,reason]of Object.entries(notificationState?.unread||{})){const f=all.get(id);if(f)unread.set(id,{...f,notificationReason:String(reason)});}restoredNotifications=true;}
 const result=AltaMonitor.notificationScan(notificationState,all,visible,[bounds.getSouth(),bounds.getWest(),bounds.getNorth(),bounds.getEast()],Date.now());
 notificationState=result.state;
 for(const {feature,reason}of result.events)unread.set(feature.id,{...feature,notificationReason:reason});
 for(const id of unread.keys())if(!all.has(id)||expired(all.get(id).properties))unread.delete(id);
 notificationState.unread=Object.fromEntries([...unread].map(([id,f])=>[id,f.notificationReason]));
 try{localStorage.setItem(notificationKey,JSON.stringify(notificationState));}catch{}
 $('#notification-status').textContent='監視中・最終確認 '+new Date(notificationState.lastScan).toLocaleTimeString('ja-JP',{hour12:false})+' ／ 今回検出 '+result.events.length+'件';
 updateBell();
}
$('#bell').onclick=()=>{const panel=$('#notifications');panel.hidden=!panel.hidden;$('#bell').setAttribute('aria-expanded',String(!panel.hidden));};
$('#notifications-clear').onclick=()=>{unread.clear();if(notificationState){notificationState.unread={};try{localStorage.setItem(notificationKey,JSON.stringify(notificationState));}catch{}}updateBell();};
let jumpMarker=null;
$('#jump-form').onsubmit=e=>{e.preventDefault();try{const ll=AltaMonitor.coordinateText($('#jump-coordinate').value);map.setView(ll,9,{animate:false});if(jumpMarker)map.removeLayer(jumpMarker);jumpMarker=L.circleMarker(ll,{radius:8,color:'#5eead4',fillOpacity:0,weight:2}).addTo(map).bindTooltip('入力座標');$('#jump-status').textContent=ll.map(n=>n.toFixed(5)).join(', ');}catch(error){$('#jump-status').textContent=error.message;}};


function showDetail(f){activeId=f.id;$('#detail-body').replaceChildren(details(f));$('#original-body').textContent=f.properties.originalText||f.properties.text||'原文なし';$('#detail-panel').hidden=false;document.querySelectorAll('.area').forEach(n=>n.classList.toggle('active-alert',n.dataset.featureId===f.id));for(const [id,l] of layers)l.setStyle({weight:id===f.id?5:2});}
function focusFeature(f){const l=layers.get(f.id);if(!l)return;const bounds=l.getBounds?l.getBounds():L.latLngBounds([l.getLatLng()]);map.fitBounds(bounds,{padding:[55,55],maxZoom:8,animate:false});showDetail(f);}
$('#detail-close').onclick=()=>{$('#detail-panel').hidden=true;activeId=null;updateReportUI();};
$('#detail-focus').onclick=()=>{const f=allFeatures().get(activeId);if(f)focusFeature(f);};
$('#original-toggle').onclick=()=>{$('#original-body').hidden=!$('#original-body').hidden;$('#detail-panel').classList.toggle('show-original',!$('#original-body').hidden);$('#original-toggle').setAttribute('aria-expanded',String(!$('#original-body').hidden));};
$('#pdf-mode').onclick=()=>{pdfMode=!pdfMode;$('#pdf-mode').setAttribute('aria-pressed',String(pdfMode));$('#pdf-mode').textContent=pdfMode?'PDF選択を終了':'PDFにする警報を選択';document.querySelectorAll('.report-check').forEach(n=>n.hidden=!pdfMode);};
function picker(open){$('#country-picker').hidden=!open;$('#picker-toggle').setAttribute('aria-expanded',String(open));}
$('#picker-toggle').onclick=()=>picker($('#country-picker').hidden);$('#picker-close').onclick=()=>picker(false);
$('#history-mode').onchange=async()=>{const on=$('#history-mode').value==='archive';for(const id of ['archive-date','archive-time','archive-load'])$('#'+id).hidden=!on;if(!on){archiveAt=null;$('#archive-status').textContent='';await refresher.manual();return;}try{archiveManifest=await json('archive/index.json');const entries=archiveManifest.snapshots||[];if(!entries.length)throw Error();$('#archive-date').value=entries[entries.length-1].at.slice(0,10);archiveChoices();$('#archive-status').textContent='保存日・時刻はUTC。選択後「この時点を表示」を押してください。';}catch{$('#archive-status').textContent='保存済みアーカイブはまだありません。今後の定期更新から蓄積します。';}};
function archiveChoices(){const date=$('#archive-date').value;$('#archive-time').replaceChildren(...(archiveManifest?.snapshots||[]).filter(e=>e.at.startsWith(date)).map(e=>{const o=node('option',e.at.slice(11,19)+' UTC');o.value=e.file;return o;}));}
$('#archive-date').onchange=archiveChoices;$('#archive-load').onclick=loadArchive;
async function loadArchive(){if(loading){$('#archive-status').textContent='同期中です。完了後に選択してください。';return;}const entry=archiveManifest?.snapshots.find(e=>e.file===$('#archive-time').value);if(!entry||!/^\d{8}T\d{4}Z\.json\.gz$/.test(entry.file)){$('#archive-status').textContent='この日の保存データはありません。';return;}try{loading=true;$('#history-mode').disabled=true;const r=await fetch('archive/'+entry.file,{cache:'no-store'});if(!r.ok)throw Error();const stream=r.body.pipeThrough(new DecompressionStream('gzip'));const data=await new Response(stream).json();if(data.schemaVersion!==1||!Array.isArray(data.feeds))throw Error();archiveAt=data.capturedAt;index=data.index;feeds=new Map(data.feeds);selectedAlerts.clear();unread.clear();updateBell();$('#detail-panel').hidden=true;updateChoices();render();$('#archive-status').textContent='アーカイブ '+time(archiveAt)+' ／ 当時取得できた情報です。';}catch{$('#archive-status').textContent='アーカイブ読込失敗。現在の表示を保持しました。';}finally{loading=false;$('#history-mode').disabled=false;}}
})();

