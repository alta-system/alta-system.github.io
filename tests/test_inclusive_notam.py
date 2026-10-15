import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import unittest
from hazard_rules import classify, classify_notam

class InclusiveNotamTests(unittest.TestCase):
    def test_related_candidates(self):
        for body, q, feed in [
            ('EXERCISE IN PROGRESS', '', ''),
            ('MIL ACTIVITY', '', ''),
            ('UAV OPERATIONS', '', ''),
            ('GPS JAMMING', '', ''),
            ('AREA ACTIVE', 'QRDCA', ''),
            ('AIRSPACE ACTIVE', 'QWELW', ''),
            ('OPS IN PROGRESS', '', 'MILITARY'),
            ('MISSILE FIRING', 'QWMLW', ''),
            ('NAVAL TRAINING', '', ''),
        ]:
            with self.subTest(body=body):
                self.assertTrue(classify_notam(body, q, feed))
    def test_cancelled_and_unrelated(self):
        self.assertFalse(classify_notam('EXERCISE CANCELLED', '', 'MILITARY'))
        self.assertFalse(classify_notam('MILITARY AREA', 'QRDCN', 'MILITARY'))
        self.assertFalse(classify_notam('RWY LIGHT U/S', 'QLAAS', 'INTERNATIONAL'))
        self.assertFalse(classify_notam('NO MILITARY ACTIVITY', '', 'INTERNATIONAL'))
    def test_marine_stays_strict(self):
        self.assertFalse(classify('UAV OPERATIONS'))
        self.assertTrue(classify('MISSILE FIRING'))

if __name__ == '__main__':
    unittest.main()
