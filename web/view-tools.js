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
// Calendar months, clamped at month end; use the displayed (live/archive) UTC time.
function monthCutoff(now){const d=new Date(now),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-3);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return d.getTime();}
function startKnown(p){return Number.isFinite(Date.parse(p.validFrom||''));}
function oldStart(p,now){const start=Date.parse(p.validFrom||'');return Number.isFinite(start)&&start<=monthCutoff(now);}
function upperBand(p){
 if(p.layer==='NAVWARN')return 'marine';
 const u=p.altitude?.upper;let raw=String(u?.label||p.upper||'').trim().toUpperCase();
 raw=raw.split(/\s+(?:RMK|CREATED|SOURCE)\s*:/)[0].trim();
 if(!/^(?:UNL|UNLIMITED|FL\s*\d|\d+(?:\.\d+)?\s*(?:FT|FEET|M)\b|SFC|GND|GROUND)/.test(raw)){const max=String(p.originalText||p.text||'').toUpperCase().match(/\bMAX(?:IMUM)?\s+ALT(?:ITUDE)?\s*:\s*(UNLIMITED|UNL|FL\s*\d{2,3}|\d+(?:\.\d+)?\s*(?:FT|FEET|M)\b(?:\s+(?:AGL|AMSL|MSL))?)/);if(max)raw=max[1];}
 if(u?.reference==='unlimited'||/^(?:UNL|UNLIMITED)(?:\s|$)/.test(raw))return 'unlimited';
 let value=u?.value,unit=String(u?.unit||'').toUpperCase();
 if(!Number.isFinite(value)){let m=raw.match(/^FL\s*(\d+(?:\.\d+)?)$/);if(m){value=Number(m[1]);unit='FL';}else if((m=raw.match(/^(\d+(?:\.\d+)?)\s*(FT|FEET|M)(?:\s+(?:AGL|AMSL|MSL))?$/))){value=Number(m[1]);unit=m[2];}else if(/^(?:SFC|GND|GROUND)$/.test(raw)){value=0;unit='FT';}}
 // Q-line FL999 is an unspecified/unlimited envelope, not proof of UNL.
 if(p.altitude?.basis==='Q-line envelope'&&unit==='FL'&&value===999)return 'unknown';
 if(!Number.isFinite(value)||value<0||!['FL','FT','FEET','M'].includes(unit))return 'unknown';
 const feet=value*(unit==='FL'?100:unit==='M'?1/0.3048:1);
 return feet<=10000?'low':feet<=30000?'mid':'high';
}
const api={labels,category,emphasized,readState,original,monthCutoff,oldStart,startKnown,upperBand};root.AltaView=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
