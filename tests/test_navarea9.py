import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from sync_navarea9 import listing,build,official_url,geometry
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

    def test_separate_official_firing_areas(self):
        shape,warning=geometry("291500 UTC SEP 2026\r\nNAVAREA IX 343/26\r\nARABIAN SEA\r\nPAKISTAN\r\nCHARTS PAK 33, 57 (INT 751), BA 38 AND 707\r\n\r\n1. NAVAL SHIPS WILL CONDUCT LIVE FIRING PRACTICE BETWEEN\r\n0300 TO 1900 UTC FROM 01-02, 05-09, 12-16, 19-23 AND 26-30\r\nOCT 26 IN FOLLOWING AREAS:\r\n\r\nSURFACE AND ANTI AIRCRAFT FIRING AREAS\r\n\r\nA.\r\n\r\n24-24.30N 066-42.00E\r\n24-19.00N 066-58.00E\r\n24-00.00N 066-39.00E\r\n24-11.00N 066-27.00E\r\n\r\nB.\r\n\r\n24-36.02N 062-30.03E\r\n24-36.02N 063-15.03E\r\n24-21.02N 063-15.03E\r\n24-21.02N 062-30.03E\r\n\r\nC.\r\n\r\n24-36.02N 061-45.03E\r\n24-36.02N 062-30.03E\r\n24-21.02N 062-30.03E\r\n24-21.02N 061-45.03E\r\n\r\nDEPTH CHARGE FIRING AREA\r\n\r\nD. \r\n\r\n24-22.00N 066-27.00E\r\n24-16.30N 066-33.00E\r\n24-10.30N 066-27.00E\r\n24-16.18N 066-20.50E\r\n\r\nMARINERS KEEP WELL CLEAR OF EXERCISE AREAS\r\n\r\n2. CANCEL THIS MSG 302000 UTC OCT 26\r\n")
        self.assertEqual(shape['geometry']['type'],'MultiPolygon')
        self.assertEqual(len(shape['geometry']['coordinates']),4)
        for polygon in shape['geometry']['coordinates']:
            self.assertEqual(len(polygon[0]),5)
