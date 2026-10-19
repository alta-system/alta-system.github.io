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
