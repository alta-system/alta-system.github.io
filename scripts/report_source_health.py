"""Report partial upstream outages without failing an otherwise published run.

Collection, validation and deployment steps still fail normally. A complete
collection outage or missing/corrupt health reports remains a workflow failure.
This script performs no network requests and does not alter source status.
"""
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read_count(path):
    value = Path(path).read_text().strip()
    if not value.isdecimal():
        raise ValueError('invalid source failure count')
    return int(value)


def assess(air, marine, air_errors, marine_errors):
    countries = air['countries']
    sources = marine['metadata']['sources']
    if not isinstance(countries, list) or not isinstance(sources, list) or not sources:
        raise ValueError('invalid source health schema')
    healthy_air = air.get('status') == 'ok' or any(c.get('status') == 'ok' for c in countries)
    healthy_marine = any(s.get('status') == 'ok' for s in sources)
    failed = [s for s in sources if s.get('status') != 'ok']
    partial = bool(air_errors or marine_errors or failed or air.get('status') != 'ok')
    level = 'error' if not (healthy_air or healthy_marine) else 'warning' if partial else 'notice'
    lines = [
        '## データ取得結果',
        '',
        f'- NOTAM取得エラー数: {air_errors}',
        f'- 海域警報取得エラー数: {marine_errors}',
    ]
    for source in failed:
        # Only source identity, code and timestamp; no payloads or credentials.
        name = str(source.get('source', '不明な海域ソース')).replace('\n', ' ')
        code = str(source.get('errorCode', '取得状態を確認')).replace('\n', ' ')
        last = str(source.get('lastSuccess') or '成功履歴なし')
        lines.append(f'- {name}: {code} / 最終成功（UTC）: {last}')
    lines += ['', '一部取得失敗時は取得できたデータと前回成功分を公開します。各ソースの状態・最終成功時刻は確認用ページに記録します。']
    message = {
        'error': 'All source groups failed to update; published data may be stale.',
        'warning': f'Partial upstream outage: NOTAM errors={air_errors}, maritime errors={marine_errors}. Available data and source health were published.',
        'notice': 'Source refresh and website publication completed.',
    }[level]
    return level, message, '\n'.join(lines) + '\n'


def main():
    try:
        air = json.loads((ROOT / 'web/production/index.json').read_text())
        marine = json.loads((ROOT / 'web/maritime/index.json').read_text())
        level, message, summary = assess(air, marine, read_count('/tmp/airspace-errors'), read_count('/tmp/maritime-errors'))
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        print('::error::Source health reports are missing or invalid.')
        return 1
    print(f'::{level}::{message}')
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as out:
            out.write(summary)
    return 1 if level == 'error' else 0


if __name__ == '__main__':
    raise SystemExit(main())
