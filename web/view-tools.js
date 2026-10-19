/* Display-only categories: do not discard provider records. */
(function(root){
const labels={missile:'ミサイル・ロケット',firing:'射撃・武器',exercise:'軍事演習',security:'安全保障',drone:'無人機',other:'その他の空域・活動',birds:'鳥・野生動物',airport:'滑走路・施設'};
function category(p){const t=String(p.originalText||p.text||'').toUpperCase(),q=String(p.qcode||'');
 if(/\b(MISSILES?|ROCKETS?|SPACE (LAUNCH|DEBRIS)|RE[ -]?ENTRY)\b|ミサイル|ロケット|导弹/.test(t))return 'missile';
 if(/\b(LIVE[ -]?FIRING|FIRING|GUNNERY|GUNFIRE|BOMBING|WEAPONS? (EXERCISE|TRAINING))\b|射撃|射爆撃|实弹/.test(t)||/^Q?WM/.test(q))return 'firing';
 if(/\b(?:MILITARY|NAVAL|MIL|ARMED FORCES)\s+(?:EXERCISE|EXER|TRAINING|OPERATIONS?)\b|軍事演習|军事训练|军事演习/.test(t))return 'exercise';
 if(/\b(TERRORISM|TERRORIST|HOSTILITIES|ARMED CONFLICT|NATIONAL SECURITY|FLIGHT PROHIBITION|GPS JAMMING|GNSS INTERFERENCE)\b|テロ|武力紛争/.test(t))return 'security';
 if(/\b(BIRD(?:S|TAM)?|WILDLIFE|BIRDSTRIKE)\b|鳥群|鳥の群れ/.test(t))return 'birds';
 if(/\b(RWY|RUNWAY|TWY|TAXIWAY|ILS|VOR|APRON|AERODROME|AIRPORT|LIGHTING)\b[\s\S]{0,100}\b(CLOSED|CLSD|WIP|WORK|WORKS|CONSTRUCTION|MAINTENANCE|U\/S|UNSERVICEABLE|OUTAGE|NOT AVBL|UNAVAILABLE)\b|滑走路.*(?:工事|閉鎖|故障)/.test(t))return 'airport';
 if(/\b(UAS|UAV|DRONE|RPAS)\b|無人機/.test(t))return 'drone';return 'other';}
function emphasized(p){return ['missile','firing','exercise','security'].includes(category(p));}
function readState(storage){try{const s=JSON.parse(storage.getItem('alta-view-v1'));if(!s||s.version!==1)return null;if(!Array.isArray(s.center)||s.center.length!==2||!s.center.every(Number.isFinite)||Math.abs(s.center[0])>90||!Number.isFinite(s.zoom)||s.zoom<0||s.zoom>20)return null;return s;}catch{return null;}}
function original(p){if(p.originalText)return {text:p.originalText,label:p.layer==='NAVWARN'?'公式配信本文（HTML / PDFのテキスト抽出を含む）':'FAA配信の原文本文'};return {text:p.text||'',label:'原文フィールドなし：取得済み本文を表示'};}
function overview(p){return ['分類：'+labels[category(p)],'警報ID：'+(p.id||'—'),'開始：'+(p.validFrom||'本文参照'),'終了：'+(p.validTo||'本文参照'),'高度：'+(p.altitude?.label||'本文参照'),'運用時間：'+(p.schedule||'本文参照')].join('\n');}
const api={labels,category,emphasized,readState,original,overview};root.AltaView=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
