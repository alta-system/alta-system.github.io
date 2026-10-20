import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from notam_text import extract
class TextRegressionTests(unittest.TestCase):
 def test_mexico_explicit_union(self):
  s,w=extract('PROHIBITED AREA FOR REAL FIRING LATERAL LIMIT AREA FORMED BY THE UNION OF THE FLW POINTS: 3110.0N 11640.0W - 3100.0N 11640.0W - 3100.0N 11630.0W - 3110.0N 11630.0W - 3110.0N 11640.0W 45NM AT SOUTH OF ENSENADA')
  self.assertEqual(s['geometry']['coordinates'][0][0],[-116-40/60,31+10/60]);self.assertEqual(len(s['geometry']['coordinates'][0]),5)
 def test_labelled_vertices_with_e(self):
  s,w=extract('MIL EXER AT THE FLW COORDS: A ) 061700N1162000E B ) 063600N1162725E C ) 063600N1164000E D ) 061700N1164000E E ) 061600N1163000E')
  self.assertEqual(len(s['geometry']['coordinates'][0]),6)
 def test_full_message_uses_e_only(self):
  s,w=extract('A001/26 NOTAMN Q) XX/QWMLW/IV/BO/W/000/100/3500N14000E010 E) AREA BOUNDED BY 3600N14100E - 3700N14100E - 3700N14200E F) GND G) FL100')
  self.assertEqual(s['geometry']['coordinates'][0][0],[141,36])
 def test_named_unpunctuated_areas(self):
  s,w=extract('LATERAL LIMIT AREA FORMED BY THE UNION OF THE FOLLOWING POINTS: AREA 2 3500N14000E - 3600N14000E - 3600N14100E AREA 3A 3700N14200E - 3800N14200E - 3800N14300E')
  self.assertEqual(s['geometry']['type'],'MultiPolygon');self.assertEqual(len(s['geometry']['coordinates']),2)
 def test_circle_with_position_annotation(self):
  s,w=extract('DRONE OPS WI 1.25NM OF COORD: 06 20 04.38 S 143 06 35.64 E (APRX AYMR 283 DEG TRUE AT 7.4NM).')
  self.assertEqual(s['circle']['radius'],1.25);self.assertLess(s['circle']['center'][1],0)
 def test_sector_still_rejected(self):
  self.assertIsNone(extract('SECTOR WI 1.25NM OF 062004S1430635E BTN 030 DEG AND 050 DEG')[0])

 def test_plain_dash_chain(self):
  s,w=extract('MISSILE FIRING 3500N14000E - 3600N14000E - 3600N14100E')
  self.assertEqual(s['geometry']['type'],'Polygon')
 def test_disconnected_dash_chains(self):
  s,w=extract('FIRING 3500N14000E - 3600N14000E - 3600N14100E. SECOND 3700N14200E – 3800N14200E – 3800N14300E')
  self.assertEqual(s['geometry']['type'],'MultiPolygon');self.assertEqual(len(s['geometry']['coordinates']),2)
 def test_route_not_closed_as_area(self):
  s,w=extract('ROUTE 3500N14000E - 3600N14000E - 3600N14100E')
  self.assertIsNone(s)

 def test_real_multipart_firing_preserves_every_reported_edge(self):
  from notam_text import PAIR,coord
  import re
  text=(Path(__file__).parent/'fixtures/multipart_firing.txt').read_text()
  shape,warning=extract(text)
  self.assertEqual(len(shape['geometry']['coordinates']),17)
  self.assertEqual(len(shape['referenceLines']),1)
  expected=[[coord(m) for m in PAIR.finditer(chunk)] for chunk in re.split(r'\s+AND\s+',text)]
  expected=[p for p in expected if p]
  actual=[p[0] for p in shape['geometry']['coordinates']]+shape['referenceLines']
  self.assertEqual(sorted(map(repr,actual)),sorted(map(repr,expected)))
  self.assertIn('区域4',warning)
 def test_truncated_last_area_does_not_hide_closed_areas(self):
  text=(Path(__file__).parent/'fixtures/multipart_firing.txt').read_text()
  text=text.replace('085421N1124010E-084915N1123954E AND','')
  shape,warning=extract(text)
  self.assertEqual(len(shape['geometry']['coordinates']),16)
  self.assertEqual(len(shape['referenceLines']),2)
  self.assertNotEqual(shape['referenceLines'][-1][0],shape['referenceLines'][-1][-1])
 def test_faa_keeps_partial_geometry_notes_and_lines(self):
  import publish_faa
  from test_publish_faa import feature,payload,REFS,NOW
  f=feature();f['properties']['coreNOTAMData']['notam']['text']=(Path(__file__).parent/'fixtures/multipart_firing.txt').read_text()
  p=publish_faa.build(payload(f),REFS,NOW)[0]['JP'][0]
  self.assertEqual(len(p['geometry']['coordinates']),17)
  self.assertEqual(len(p['properties']['referenceLines']),1)
  self.assertIn('区域4',p['properties']['textGeometryWarning'])
 def test_saved_multi_area_repaired_without_an_api_request(self):
  import json,tempfile
  from unittest.mock import patch
  import sync_global as g
  from test_publish_faa import feature,REFS,NOW
  records=g.apply({},[feature()],REFS,NOW,'INTERNATIONAL')
  f=next(iter(records.values()));f['geometry']={'type':'Point','coordinates':[114,9]}
  f['properties'].update(accuracy='qline-envelope',radius_m=100000,originalText=(Path(__file__).parent/'fixtures/multipart_firing.txt').read_text())
  with tempfile.TemporaryDirectory() as temp,patch.object(g,'utcnow',return_value=NOW.isoformat()),patch.object(g,'authenticate') as auth:
   state=Path(temp)/'state.json';state.write_text(json.dumps(dict(records=records,lastAttempt=NOW.isoformat())))
   self.assertEqual(g.sync(state,Path(temp)/'out'),0);auth.assert_not_called()
   saved=next(iter(json.loads(state.read_text())['records'].values()))
   self.assertEqual(len(saved['geometry']['coordinates']),17)
   self.assertEqual(len(saved['properties']['referenceLines']),1)
   self.assertNotIn('radius_m',saved['properties'])
   self.assertIn('区域4',saved['properties']['textGeometryWarning'])

 def test_airport_offsets_do_not_block_explicit_polygon(self):
  shape,warning=extract('AREA DEFINED AS 350000N1400000E (3NM W ABC) TO 360000N1400000E (2NM N ABC) TO 360000N1410000E (3NM E ABC) TO POINT OF ORIGIN')
  self.assertEqual(shape['geometry']['type'],'Polygon')
  self.assertEqual(shape['geometry']['coordinates'][0],[[140,35],[140,36],[141,36],[140,35]])
 def test_operational_except_after_vertices_is_not_a_geometry_exclusion(self):
  shape,warning=extract('AREA BOUNDED BY 3500N14000E - 3600N14000E - 3600N14100E. EXCEPT OPERATORS AUTHORISED BY ATC')
  self.assertEqual(shape['geometry']['type'],'Polygon')
 def test_two_explicit_circles_remain_two_circles(self):
  shape,warning=extract('WITHIN 5NM RADIUS OF 350000N1400000E AND WITHIN 2NM RADIUS OF 360000N1410000E')
  self.assertEqual(shape['circle']['center'],[140,35]);self.assertEqual(shape['circle']['radius'],5)
  self.assertEqual(shape['additionalCircles'],[dict(center=[141,36],radius_m=3704)])
 def test_independent_named_faa_definitions(self):
  shape,warning=extract('AIRSPACE WI AN AREA DEFINED AS (ALPHA) 3500N14000E TO 3600N14000E TO 3600N14100E TO POINT OF ORIGIN AND WI AN AREA DEFINED AS (BRAVO) 3700N14200E TO 3800N14200E TO 3800N14300E TO POINT OF ORIGIN')
  self.assertEqual(shape['geometry']['type'],'MultiPolygon');self.assertEqual(len(shape['geometry']['coordinates']),2)

 def test_metres_radius_above_one_thousand(self):
  shape,warning=extract('WI 2500M RADIUS OF 350000N1400000E')
  self.assertEqual(shape['circle']['radius'],2500);self.assertEqual(shape['circle']['unit'],'M')
 def test_explicit_same_radius_for_each_centre(self):
  shape,warning=extract('WI 5NM RADIUS OF EACH FOLLOWING POSITIONS 350000N1400000E AND 360000N1410000E')
  self.assertEqual(shape['circle']['radius'],5);self.assertEqual(shape['additionalCircles'][0]['radius_m'],9260)

 def test_reparse_maritime_cache_preserves_original_and_freshness(self):
  from notam_text import refresh_shapes
  text='WITHIN 5NM RADIUS OF 350000N1400000E AND WITHIN 2NM RADIUS OF 360000N1410000E'
  feed=dict(features=[],unplotted=[dict(id='TEST:1',originalText=text,text=text)],metadata=dict(lastSuccess='2026-10-01T00:00:00Z'))
  self.assertTrue(refresh_shapes(feed));self.assertEqual(len(feed['features']),1);self.assertEqual(feed['unplotted'],[])
  self.assertEqual(feed['features'][0]['properties']['originalText'],text)
  self.assertEqual(feed['metadata']['lastSuccess'],'2026-10-01T00:00:00Z')
  self.assertEqual(feed['features'][0]['properties']['additionalCircles'][0]['radius_m'],3704)
  self.assertFalse(refresh_shapes(feed))
