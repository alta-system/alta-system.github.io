const assert=require('node:assert/strict'),V=require('../web/view-tools.js');
const now=Date.parse('2026-10-22T03:00:00Z');
assert.equal(V.oldStart({validFrom:'2026-07-22T03:00:00Z'},now),true);
assert.equal(V.oldStart({validFrom:'2026-07-22T03:00:01Z'},now),false);
assert.equal(V.oldStart({validFrom:'2026-12-22T03:00:00Z'},now),false);
for(const validFrom of [null,'','invalid'])assert.equal(V.oldStart({validFrom},now),false);
assert.equal(new Date(V.monthCutoff(Date.parse('2024-05-31T12:34:56Z'))).toISOString(),'2024-02-29T12:34:56.000Z');
assert.equal(new Date(V.monthCutoff(Date.parse('2026-01-31T12:34:56Z'))).toISOString(),'2025-10-31T12:34:56.000Z');
// Archives use their observation date rather than the current device time.
assert.equal(V.oldStart({validFrom:'2026-07-22T03:00:00Z'},Date.parse('2026-08-01T00:00:00Z')),false);
for(const [upper,expected]of [['UNL','unlimited'],['UNLIMITED','unlimited'],['FL100','low'],['FL101','mid'],['FL300','mid'],['FL301','high'],['3048 M AMSL','low'],['10000 FT AGL','low'],['SFC','low'],['','unknown'],['NOT PROVIDED','unknown']])assert.equal(V.upperBand({upper}),expected,upper);
assert.equal(V.upperBand({altitude:{upper:{reference:'unlimited'}}}),'unlimited');
assert.equal(V.upperBand({altitude:{basis:'Q-line envelope',upper:{value:999,unit:'FL'}}}),'unknown');
assert.equal(V.upperBand({layer:'NAVWARN',upper:'UNL'}),'marine');
assert.equal(V.upperBand({text:'MISSILE WITH UNLIMITED RANGE',lower:'SFC'}),'unknown');
assert.equal(V.upperBand({altitude:{upper:{value:12000,unit:'M',reference:'AMSL'}}}),'high');
console.log('Calendar age boundaries, archive clock, explicit UNL, units and unknown/sea filters passed');
assert.equal(V.upperBand({altitude:{upper:{label:'1379FT AMSL RMK: NOTICE'}}}),'low');
assert.equal(V.upperBand({altitude:{upper:{label:'27.63, 128.86 H) 27.63, 126.86 MAX ALT: 82021 FT'}},text:'AREA G) 27.63, 128.86 H) 27.63, 126.86 MAX ALT: 82021 FT (25000M)'}),'high');

for(const validFrom of [null,undefined,'','invalid','PERM'])assert.equal(V.startKnown({validFrom}),false);
for(const validFrom of ['2026-10-22T03:00:00Z','2026-12-22T03:00:00Z'])assert.equal(V.startKnown({validFrom}),true);

// Sea warnings with missing starts must survive default date and altitude filters.
const defaults=new Set(V.defaultPeriods);
for(const [date,band,shown]of [['2026-12-01T00:00:00Z','future',true],['2026-10-01T00:00:00Z','recent',true],['2026-07-22T03:00:00Z','months',true],['2025-10-22T03:00:00Z','year',false],['2025-10-22T03:00:01Z','months',true],[null,'unknown-notam',false],['invalid','unknown-notam',false]]){const p={validFrom:date};assert.equal(V.startPeriod(p,now),band);assert.equal(V.periodMatches(p,now,defaults),shown);}
const sea={layer:'NAVWARN',validFrom:null};
assert.equal(V.startPeriod(sea,now),'unknown-marine');assert.equal(V.periodMatches(sea,now,defaults),true);
assert.equal(V.altitudeMatches(sea,new Set(['unlimited'])),true);
assert.equal(V.altitudeMatches(sea,new Set()),true);
defaults.delete('unknown-marine');assert.equal(V.periodMatches(sea,now,defaults),false);
defaults.add('unknown-notam');assert.equal(V.periodMatches({validFrom:null},now,defaults),true);
assert.equal(V.startPeriod({validFrom:'2024-02-29T00:00:00Z'},Date.parse('2025-02-28T00:00:00Z')),'months');
for(const [raw,expected]of [['3.048 KM AMSL','low'],['3048 METERS AMSL','low'],['3048 METRES AGL','low'],['10,000 FEET AMSL','low'],['FL 300','mid'],['9.144 KM','mid'],['9.145 KM','high']])assert.equal(V.upperBand({upper:raw}),expected,raw);
assert.match(V.altitudeText({lower:'SFC',upper:'10000 FT AMSL'},'m'),/3,048 m/);
assert.match(V.altitudeText({upper:'3048 M AGL'},'ft'),/10,000 ft（地表基準）/);
assert.match(V.altitudeText({upper:'FL100'},'m'),/3,048 m（気圧高度）/);
assert.match(V.altitudeText({upper:'FL100'},'fl'),/FL100/);
assert.match(V.altitudeText({upper:'10000 FT AMSL'},'fl'),/100 ×100 ft（海抜基準）/);
assert.equal(V.altitudeText({upper:'UNL'},'source'),'UNL');
assert.match(V.bandLabels('m').low,/3,048 m/);
// Exercise the actual render predicate, including layer/category switches.
const fs=require('node:fs'),vm=require('node:vm'),app=fs.readFileSync('web/app.js','utf8');
const a=app.indexOf('const altitudeBands=new Set'),b=app.indexOf('for(const c of chosen)',a);
let chosenPeriods=new Set(V.defaultPeriods),chosenAltitudes=new Set(['unlimited']);
const ctx={AltaView:V,clock:()=>now,categories:new Set(['exercise']),kinds:new Set(['Danger']),query:'',expired:()=>false,
 document:{querySelectorAll:q=>[...(q.includes('data-period')?chosenPeriods:chosenAltitudes)].map(x=>({dataset:q.includes('data-period')?{period:x}:{altitude:x}}))},
 $:()=>({checked:true})};vm.createContext(ctx);vm.runInContext(app.slice(a,b)+';globalThis.matches=matches;',ctx);
assert.equal(ctx.matches({...sea,type:'Danger',text:'MILITARY EXERCISE'}),true);
assert.equal(ctx.matches({layer:'NOTAM',type:'Danger',text:'MILITARY EXERCISE',upper:'UNL',validFrom:null}),false);
assert.equal(ctx.matches({layer:'NOTAM',type:'Danger',text:'MILITARY EXERCISE',upper:'UNL',validFrom:'2026-04-01T00:00:00Z'}),true);
assert.equal(ctx.matches({layer:'NOTAM',type:'Danger',text:'MILITARY EXERCISE',upper:'UNL',validFrom:'2024-04-01T00:00:00Z'}),false);
console.log('Independent sea/air dates, three-month/year defaults, all altitude units and real render predicate passed');

// A single height selection accepts equivalent values from different source units.
vm.runInContext('altitudeBands.clear(); altitudeBands.add("low");',ctx);
for(const upper of ['10000 FT AMSL','3048 M AMSL','3.048 KM AMSL','FL100'])assert.equal(ctx.matches({layer:'NOTAM',type:'Danger',text:'MILITARY EXERCISE',upper,validFrom:'2026-10-01T00:00:00Z'}),true,upper);
for(const upper of ['10001 FT AMSL','3049 M AMSL','3.049 KM AMSL','FL101'])assert.equal(ctx.matches({layer:'NOTAM',type:'Danger',text:'MILITARY EXERCISE',upper,validFrom:'2026-10-01T00:00:00Z'}),false,upper);
