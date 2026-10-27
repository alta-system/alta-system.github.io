import json,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from sync_navarea8 import build,geometry,parse_document,official_url,sync,due
URL='https://hydrobharat.gov.in/documents/d/guest/test'
NOW='2026-10-27T06:00:00Z'
POLY='FIRING AREA BOUNDED BY 10-00N 080-00E, 11-00N 080-00E, 11-00N 081-00E, 10-00N 081-00E. CANCEL THIS MSG 301200 UTC OCT 26'
def doc(body=POLY,number='100/26',day='27 OCT 2026'):
 return 'NAVAREA VIII - WARNINGS IN FORCE AS ON '+day+'\n261002Z/OCT 26\nNAVAREA VIII -'+number+'\n-----------------\n'+body
class Navarea8Tests(unittest.TestCase):
 def test_pdf_freshness_and_validation(self):
  rows,asof=parse_document(doc(),NOW);self.assertEqual(len(rows),1);self.assertEqual(asof,'2026-10-27')
  with self.assertRaisesRegex(ValueError,'stale'):parse_document(doc(day='07 JUL 2025'),NOW)
  with self.assertRaises(ValueError):parse_document('Access denied',NOW)
 def test_polygon_original_and_issue(self):
  text=doc();r=build(text,URL,NOW);f=r['features'][0]
  self.assertEqual(f['geometry']['type'],'Polygon');self.assertEqual(len(f['geometry']['coordinates'][0]),5)
  self.assertEqual(f['properties']['issuedISO'],'2026-10-26T10:02:00Z');self.assertEqual(f['properties']['validTo'],'2026-10-30T12:00:00Z')
  self.assertIn(POLY,f['properties']['originalText']);self.assertEqual(f['properties']['country'],'IN')
 def test_rectangle(self):
  g,n=geometry('FIRING DANGER AREA BOUNDED WITHIN 10-20N TO 10-50N AND 075-00E TO 075-35E')
  self.assertEqual(g['geometry']['type'],'Polygon');self.assertAlmostEqual(g['geometry']['coordinates'][0][0][1],10+20/60)
  self.assertAlmostEqual(g['geometry']['coordinates'][0][2][0],75+35/60)
 def test_separate_areas_and_linewrap(self):
  body='FIRING DANGER\nAREAS BOUNDED BY (A) 10-00N 080-00E, 11-00N 080-00E, 11-00N 081-00E (B) 12-00N 082-\n00E, 13-00N 082-00E, 13-00N 083-00E'
  g,n=geometry(body);self.assertEqual(g['geometry']['type'],'MultiPolygon');self.assertEqual(len(g['geometry']['coordinates']),2)
 def test_circle_and_sector(self):
  r=build(doc('FIRING WITHIN 5 NM RADIUS OF 1000N08000E'),URL,NOW)
  self.assertEqual(r['features'][0]['properties']['radius_m'],9260)
  g,n=geometry('FIRING IN DANGER SECTOR EXTENDING 11 NM BETWEEN BEARING 045 AND 075 FROM 13-07.02N 080-18.01E')
  self.assertEqual(g['geometry']['type'],'Polygon');self.assertEqual(len(g['geometry']['coordinates'][0]),33);self.assertIn('近似',n)
 def test_complex_arc_not_invented(self):
  r=build(doc('FIRING IN AREA BOUNDED BY 1000N08000E, 1100N08100E AND ARC OF 41 NM RADIUS JOINING THE POINTS'),URL,NOW)
  self.assertEqual(r['features'][0]['geometry']['type'],'MultiPoint');self.assertEqual(r['features'][0]['properties']['accuracy'],'reference-point')
 def test_expired_nonmilitary_cancelled_removed(self):
  self.assertEqual(build(doc('BUOY MISSING AT 1000N08000E. EXERCISE CAUTION'),URL,NOW)['features'],[])
  self.assertEqual(build(doc(POLY.replace('301200','261200')),URL,NOW)['features'],[])
  text=doc()+'\n261003Z/OCT 26\nNAVAREA VIII -101/26\nCANCEL NAVAREA VIII MSG 100/26\n'
  self.assertEqual(build(text,URL,NOW)['features'],[])
 def test_origin_and_hourly_cooldown(self):
  self.assertEqual(official_url(URL),URL)
  for u in ('https://example.com/documents/a','http://hydrobharat.gov.in/documents/a','https://hydrobharat.gov.in/o/private','https://hydrobharat.gov.in/documents/a?token=secret'):
   with self.assertRaises(ValueError):official_url(u)
  self.assertFalse(due({'metadata':{'lastAttempt':'2026-10-27T05:30:00Z'}},NOW));self.assertTrue(due(None,NOW))
 def test_sync_failure_preserves_and_cooldown(self):
  with tempfile.TemporaryDirectory() as folder:
   path=Path(folder)/'in.json';old=build(doc(),URL,NOW);path.write_text(json.dumps(old))
   sync(path,lambda:self.fail('must not fetch'),stamp='2026-10-27T06:30:00Z')
   def fail():raise ValueError('page_unavailable')
   sync(path,fail,stamp='2026-10-27T07:30:00Z');r=json.loads(path.read_text())
   self.assertEqual(r['metadata']['status'],'error');self.assertEqual(len(r['features']),1);self.assertEqual(r['metadata']['lastSuccess'],NOW)
 def test_sync_success_removes_missing_records(self):
  with tempfile.TemporaryDirectory() as folder,patch('sync_navarea8.pdf_text',return_value=doc(number='102/26')):
   path=Path(folder)/'in.json';path.write_text(json.dumps(build(doc(),URL,NOW)))
   sync(path,lambda:URL,lambda u:b'pdf',stamp='2026-10-27T07:30:00Z');r=json.loads(path.read_text())
   self.assertEqual([f['id'] for f in r['features']],['IN-NAVAREA8:102/26'])
if __name__=='__main__':unittest.main()
