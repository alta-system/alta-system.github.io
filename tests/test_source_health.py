import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from report_source_health import assess, read_count


class SourceHealthTests(unittest.TestCase):
    def feeds(self, air='ok', marine=('ok',)):
        return ({'status': air, 'countries': [{'status': air}]},
                {'metadata': {'sources': [{'source': 'NGA', 'status': s, 'errorCode': 'http_503', 'lastSuccess': '2026-10-29T18:44:04Z'} for s in marine]}})

    def test_all_success(self):
        self.assertEqual(assess(*self.feeds(), 0, 0)[0], 'notice')

    def test_nga_outage_is_warning_and_keeps_diagnostics(self):
        level, message, summary = assess(*self.feeds(marine=('error', 'ok')), 0, 1)
        self.assertEqual(level, 'warning')
        self.assertIn('maritime errors=1', message)
        self.assertIn('http_503', summary)
        self.assertIn('2026-10-29T18:44:04Z', summary)

    def test_faa_outage_with_working_marine_is_warning(self):
        self.assertEqual(assess(*self.feeds(air='error'), 1, 0)[0], 'warning')

    def test_total_outage_remains_error(self):
        self.assertEqual(assess(*self.feeds(air='error', marine=('error',)), 1, 1)[0], 'error')

    def test_cached_error_is_not_reported_as_healthy(self):
        self.assertEqual(assess(*self.feeds(marine=('error', 'ok')), 0, 0)[0], 'warning')

    def test_invalid_reports_fail(self):
        with self.assertRaises(ValueError):
            assess({'status': 'ok', 'countries': []}, {'metadata': {'sources': []}}, 0, 0)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'count'
            path.write_text('')
            with self.assertRaises(ValueError):
                read_count(path)
            path.write_text('1\n')
            self.assertEqual(read_count(path), 1)


if __name__ == '__main__':
    unittest.main()
