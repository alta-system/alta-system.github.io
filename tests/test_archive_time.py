import unittest,sys,json,gzip,tempfile
from pathlib import Path
from datetime import datetime,timezone,timedelta
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from maritime_time import times
from archive_snapshots import archive
from notam_text import reference_points
class ArchiveTimeTests(unittest.TestCase):
 def test_explicit_utc_and_cancellation(self):
  x=times('101519Z OCT 26\nFIRING DAILY. CANCEL THIS MSG 140500Z OCT 26.')
  self.assertEqual(x['issuedISO'],'2026-10-10T15:19:00Z');self.assertEqual(x['validTo'],'2026-10-14T05:00:00Z')
  self.assertNotIn('validFrom',x)
  self.assertEqual(times('CANCEL THIS MSG 321200Z OCT 26'),{})
 def test_points_not_fake_boundary(self):
  self.assertEqual(reference_points('SECTOR RADIUS 5NM 35-00N 140-00E'),[[140,35]])
 def test_archive_deduplicates_slots_and_keeps_observation_time(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);(root/'production').mkdir();(root/'maritime').mkdir()
   (root/'production/index.json').write_text(json.dumps({'generation':'a','countries':[]}))
   (root/'maritime/index.json').write_text(json.dumps({'features':[],'unplotted':[],'metadata':{'status':'ok'}}))
   t=datetime(2026,10,15,6,3,tzinfo=timezone.utc)
   archive(root,t);archive(root,t+timedelta(minutes=4))
   m=json.loads((root/'archive/index.json').read_text());self.assertEqual(len(m['snapshots']),1)
   d=json.loads(gzip.decompress((root/'archive'/m['snapshots'][0]['file']).read_bytes()));self.assertEqual(d['capturedAt'],'2026-10-15T06:03:00Z')
   archive(root,t+timedelta(days=31));self.assertEqual(len(json.loads((root/'archive/index.json').read_text())['snapshots']),1)
