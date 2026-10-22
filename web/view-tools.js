/* Display-only categories: do not discard provider records. */
(function(root){
const labels={missile:'ミサイル・ロケット',firing:'射撃・武器',exercise:'軍事演習',security:'安全保障',drone:'無人機',other:'その他の空域・活動',birds:'鳥・野生動物',airport:'滑走路・施設',weather:'気象・滑走路の気象'};
function category(p){const t=String(p.originalText||p.text||'').toUpperCase(),q=String(p.qcode||'');
 if(/\b(MISSILES?|ROCKETS?|SPACE (LAUNCH|DEBRIS)|RE[ -]?ENTRY)\b|ミサイル|ロケット|导弹/.test(t))return 'missile';
 if(/\b(LIVE[ -]?FIRING|FIRING|GUNNERY|GUNFIRE|BOMBING|WEAPONS? (EXERCISE|TRAINING))\b|射撃|射爆撃|实弹/.test(t)||/^Q?WM/.test(q))return 'firing';
 if(/\b(?:MILITARY|NAVAL|MIL|ARMED FORCES)\s+(?:EXERCISE|EXER|TRAINING|OPERATIONS?)\b|軍事演習|军事训练|军事演习/.test(t))return 'exercise';
 if(/\b(TERRORISM|TERRORIST|HOSTILITIES|ARMED CONFLICT|NATIONAL SECURITY|FLIGHT PROHIBITION|GPS JAMMING|GNSS INTERFERENCE)\b|テロ|武力紛争/.test(t))return 'security';
 if(/\b(?:WEATHER|WX|METEOROLOGICAL|VISIBILITY|CEILING|TURBULENCE|QNH|WIND|THUNDERSTORMS?|METAR|TAF|WINDSHEAR|LLWS|RVR|SNOW|ICE|ICY|FOG|VOLCANIC ASH|STRONG WINDS?)\b|気象|雷雨|視程|降雪|着氷/.test(t))return 'weather';
 if(/\b(BIRD(?:S|TAM)?|WILDLIFE|BIRDSTRIKE)\b|鳥群|鳥の群れ/.test(t))return 'birds';
 if(/\b(RWY|RUNWAY|TWY|TAXIWAY|ILS|VOR|APRON|AERODROME|AIRPORT|LIGHTING)\b[\s\S]{0,100}\b(CLOSED|CLSD|WIP|WORK|WORKS|CONSTRUCTION|MAINTENANCE|U\/S|UNSERVICEABLE|OUTAGE|NOT AVBL|UNAVAILABLE)\b|滑走路.*(?:工事|閉鎖|故障)/.test(t))return 'airport';
 if(/\b(UAS|UAV|DRONE|RPAS)\b|無人機/.test(t))return 'drone';return 'other';}
function emphasized(p){return ['missile','firing','exercise','security'].includes(category(p));}
function readState(storage){try{const s=JSON.parse(storage.getItem('alta-view-v1'));if(!s||s.version!==1)return null;if(!Array.isArray(s.center)||s.center.length!==2||!s.center.every(Number.isFinite)||Math.abs(s.center[0])>90||!Number.isFinite(s.zoom)||s.zoom<0||s.zoom>20)return null;return s;}catch{return null;}}
function original(p){if(p.originalText)return {text:p.originalText,label:p.layer==='NAVWARN'?'公式配信本文（HTML / PDFのテキスト抽出を含む）':'FAA配信の原文本文'};return {text:p.text||'',label:'原文フィールドなし：取得済み本文を表示'};}
// Calendar periods use the displayed UTC observation time (including archives).
function monthCutoff(now,months=3){const d=new Date(now),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-months);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return d.getTime();}
function startKnown(p){return Number.isFinite(Date.parse(p.validFrom||''));}
function oldStart(p,now){const start=Date.parse(p.validFrom||'');return Number.isFinite(start)&&start<=monthCutoff(now);}
function startPeriod(p,now){const start=Date.parse(p.validFrom||'');if(!Number.isFinite(start))return p.layer==='NAVWARN'?'unknown-marine':'unknown-notam';if(start>now)return 'future';if(start<=monthCutoff(now,12))return 'year';if(start<=monthCutoff(now,3))return 'months';return 'recent';}
const defaultPeriods=['future','recent','months','unknown-marine'];
const periodLabels={future:'開始前',recent:'開始から3か月未満',months:'開始から3か月〜1年未満',year:'開始から1年以上','unknown-notam':'開始日時不明の空域警報','unknown-marine':'開始日時不明の海域警報'};
function periodMatches(p,now,chosen){return chosen.has(startPeriod(p,now));}
const unitNames={FT:'ft',FEET:'ft',FOOT:'ft',M:'m',METER:'m',METERS:'m',METRE:'m',METRES:'m',KM:'km',KILOMETER:'km',KILOMETERS:'km',KILOMETRE:'km',KILOMETRES:'km',FL:'fl'};
function parseHeight(input){
 const object=input&&typeof input==='object'?input:null;
 let raw=String(object?.label??input??'').normalize('NFKC').trim().toUpperCase().replace(/(\d),(?=\d{3}(?:\D|$))/g,'$1');
 raw=raw.split(/\s+(?:RMK|CREATED|SOURCE)\s*:/)[0].trim();
 if(object?.reference==='unlimited'||/^(?:UNL|UNLIMITED)(?:\s|$)/.test(raw))return {kind:'unlimited',raw};
 if(object?.reference==='surface'||/^(?:SFC(?: \/ GND)?|GND|GROUND)$/.test(raw))return {kind:'surface',feet:0,reference:'surface',raw};
 let value=object?.value,unit=unitNames[String(object?.unit||'').toUpperCase()],reference=object?.reference;
 if(!Number.isFinite(value)||!unit){const fl=raw.match(/^FL\s*(\d+(?:\.\d+)?)$/),m=raw.match(/^(\d+(?:\.\d+)?)\s*(FT|FEET|FOOT|M|METERS?|METRES?|KM|KILOMETERS?|KILOMETRES?)(?:\s+(AMSL|MSL|AGL))?$/);if(fl){value=Number(fl[1]);unit='fl';reference='pressure';}else if(m){value=Number(m[1]);unit=unitNames[m[2]];reference=m[3]||'unspecified';}else return {kind:'unknown',raw};}
 if(value<0)return {kind:'unknown',raw};
 const feet=value*(unit==='fl'?100:unit==='m'?1/.3048:unit==='km'?1000/.3048:1);
 return {kind:'finite',feet,reference:reference||(unit==='fl'?'pressure':'unspecified'),unit,value,raw};
}
function upperHeight(p){
 let result=parseHeight(p.altitude?.upper??p.upper);
 if(result.kind==='unknown'){result=parseHeight(p.upper);if(result.kind==='unknown'){const max=String(p.originalText||p.text||'').toUpperCase().match(/\bMAX(?:IMUM)?\s+ALT(?:ITUDE)?\s*:\s*(UNLIMITED|UNL|FL\s*\d{2,3}|\d+(?:\.\d+)?\s*(?:FT|FEET|M|METERS?|METRES?|KM)\b(?:\s+(?:AGL|AMSL|MSL))?)/);if(max)result=parseHeight(max[1]);}}
 if(p.altitude?.basis==='Q-line envelope'&&result.unit==='fl'&&result.value===999)return {kind:'unknown',raw:'FL999'};
 return result;
}
function upperBand(p){if(p.layer==='NAVWARN')return 'marine';const u=upperHeight(p);if(u.kind==='unlimited')return 'unlimited';if(!Number.isFinite(u.feet))return 'unknown';return u.feet<=10000+1e-7?'low':u.feet<=30000+1e-7?'mid':'high';}
function altitudeMatches(p,chosen){return p.layer==='NAVWARN'||chosen.has(upperBand(p));}
const number=n=>Number(n.toFixed(1)).toLocaleString('ja-JP');
function heightText(h,unit){
 if(h.kind==='unlimited')return '上限なし（UNL）';if(h.kind==='surface')return '地表・水面（SFC）';if(h.kind!=='finite')return '不明';
 const ref={AGL:'地表基準',AMSL:'海抜基準',MSL:'海抜基準',pressure:'気圧高度'}[h.reference]||'基準不明';
 const amount=unit==='m'?number(h.feet*.3048)+' m':unit==='fl'?(h.reference==='pressure'?'FL'+number(h.feet/100):number(h.feet/100)+' ×100 ft'):number(h.feet)+' ft';
 return amount+'（'+ref+'）';
}
function altitudeText(p,unit='ft',includeOriginal=true){
 const raw=p.altitude?.label||[p.lower,p.upper].filter(v=>v!=null&&v!=='').join(' 〜 ');
 if(unit==='source')return raw||'高度の記載なし';
 const lo=parseHeight(p.altitude?.lower??p.lower),hi=upperHeight(p);
 if(p.layer==='NAVWARN'&&lo.kind==='unknown'&&hi.kind==='unknown')return '海域警報（高度指定なし）';
 const converted='下限 '+heightText(lo,unit)+' 〜 '+heightText(hi,unit);
 return converted+(includeOriginal&&raw?' ／ 原文：'+raw:'');
}
function bandLabels(unit){const first=unit==='m'?'3,048 m':unit==='fl'?'100 ×100 ft（FL100相当）':'10,000 ft',second=unit==='m'?'9,144 m':unit==='fl'?'300 ×100 ft（FL300相当）':'30,000 ft';return {unlimited:'上限なし（UNL）',low:'上限が '+first+' 以下',mid:'上限が '+first+' 超〜'+second+' 以下',high:'上限が '+second+' 超',unknown:'上限高度が不明'};}
function altitudeBasis(p){return {'F/G':'NOTAM本文の下限・上限（F/G項）',provider:'配信元の高度情報','Q-line envelope':'Q行の高度範囲（概略）'}[p.altitude?.basis]||'高度情報の出典不明';}
function reasonText(p){const names={'missile/rocket':'ミサイル・ロケット','live-fire/weapons':'射撃・武器の活動','military-exercise':'軍事演習','security-incident':'安全保障上の事象','security-restriction':'安全保障上の制限','cn-critical':'中国語本文の軍事・危険情報','jp-critical':'日本語本文の軍事・危険情報','ICAO-WM':'射撃などを示すQコード','military-feed-candidate':'軍事関連として配信','military-word-candidate':'軍事関連の語句を含む','restricted-area-candidate':'制限・禁止・危険区域の記載','warning-or-restricted-qcode-candidate':'警告活動・制限区域のQコード'};return (p.criticalReasons||p.matches||[]).map(x=>names[x]||x).join(' / ')||'情報なし';}
const api={labels,category,emphasized,readState,original,monthCutoff,oldStart,startKnown,startPeriod,defaultPeriods,periodLabels,periodMatches,upperBand,upperHeight,parseHeight,altitudeMatches,altitudeText,bandLabels,altitudeBasis,reasonText};root.AltaView=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
