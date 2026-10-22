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
