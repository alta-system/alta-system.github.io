import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from sync_navarea9 import listing,build,official_url
from hazard_rules import classify

class Navarea9Tests(unittest.TestCase):
    def test_table_and_origin(self):
        html='Following enforced Navigational Warnings<table><tr><td>1</td><td>ARABIAN SEA</td><td>141500 UTC OCT 2026</td><td>374/26</td><td>LIVE WEAPON FIRING</td><td><a href="/warnings/374.pdf">View Document</a></td></tr></table>'
        rows=listing(html)
        self.assertEqual(rows[0]['number'],'374/26')
        self.assertTrue(rows[0]['url'].endswith('/warnings/374.pdf'))
        self.assertIn('NAVAREA%20IX',official_url('/NAVAREA IX/374.pdf'))
        with self.assertRaises(ValueError):official_url('https://example.com/x.pdf')
        with self.assertRaises(ValueError):listing('<html>Access denied</html>')
    def test_polygon_circle_and_expiry(self):
        rows=[dict(number='1/26',region='ARABIAN SEA',title='LIVE FIRING',issued='141500 UTC OCT 2026',url='https://hydrography.paknavy.gov.pk/1.pdf')]
        body='LIVE FIRING AREA BOUNDED BY 250000N0650000E - 260000N0650000E - 260000N0660000E'
        a=build(rows,{'1/26':body},'2026-10-16T00:00:00Z')
        self.assertEqual(len(a['features']),1)
        self.assertEqual(a['features'][0]['properties']['issuedISO'],'2026-10-14T15:00:00Z')
        b=build(rows,{'1/26':'LIVE FIRING WITHIN 5NM RADIUS OF 250000N0650000E'},'2026-10-16T00:00:00Z')
        self.assertEqual(b['features'][0]['properties']['radius_m'],9260)
        c=build(rows,{'1/26':body+' CANCEL THIS MSG 150000Z OCT 26'},'2026-10-16T00:00:00Z')
        self.assertEqual(c['features'],[])
    def test_security_and_unknown_geometry(self):
        for body in ('CONFIRMED MINE','MILITARY CONFLICT IN GULF REGION','GNSS SIGNAL INTERFERENCE'):
            self.assertTrue(classify(body))
        rows=[dict(number='2/26',region='GULF',title='SECURITY INCIDENT',issued='141500 UTC OCT 26',url='https://hydrography.paknavy.gov.pk/2.pdf')]
        a=build(rows,{'2/26':'SECURITY INCIDENT REPORTED. POSITION UNKNOWN.'},'2026-10-16T00:00:00Z')
        self.assertEqual(a['features'],[])
        self.assertEqual(len(a['unplotted']),1)
