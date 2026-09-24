#!/usr/bin/env python3
"""Reacquire north/west textual evidence at its recorded MediaWiki revision.

Acquisition is optional: normal builds use checked-in snapshots and run offline.
Use --latest only when deliberately updating the source edition and quotations.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote, urlencode
import argparse
import hashlib
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data/evidence/tang-expansion/north-west'
PAGES = {
    **{f'jiutangshu-{v}': (f'舊唐書/卷{v}', 'zh.wikisource.org') for v in (38, 39, 40)},
    'jiangzhou': ('绛州', 'zh.wikipedia.org'),
}


class Plain(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)

    def handle_starttag(self, tag, attrs):
        if tag in ('p', 'div', 'br', 'h2', 'h3', 'li'):
            self.parts.append('\n')

    def handle_endtag(self, tag):
        if tag in ('p', 'div', 'h2', 'h3', 'li'):
            self.parts.append('\n')


def plain_text(markup, source_key):
    # The initial classical-text snapshots remove stylesheet/script content.
    # The encyclopedia snapshot preserves the originally acquired rendered text.
    if source_key.startswith('jiutangshu-'):
        markup = re.sub(r'<(style|script)\b[^>]*>.*?</\1>', '', markup, flags=re.I | re.S)
    parser = Plain()
    parser.feed(markup)
    return '\n'.join(re.sub(r'\s+', ' ', line).strip()
                     for line in ''.join(parser.parts).splitlines() if line.strip()) + '\n'


def fetch(key, latest=False):
    title, host = PAGES[key]
    metadata_path = OUT / f'{key}.json'
    metadata = json.loads(metadata_path.read_text()) if metadata_path.exists() else {}
    parameters = {'action': 'parse', 'prop': 'text|revid', 'format': 'json'}
    if metadata.get('revisionId') and not latest:
        parameters['oldid'] = metadata['revisionId']
    else:
        parameters['page'] = title
    api_url = f'https://{host}/w/api.php?' + urlencode(parameters)
    response = subprocess.run(
        ['curl', '-L', '--fail', '--max-time', '40', '--retry', '2', '-sS', api_url],
        capture_output=True, text=True, check=True).stdout
    parsed = json.loads(response)['parse']
    content = plain_text(parsed['text']['*'], key)
    assert len(content) > 300, key
    OUT.mkdir(parents=True, exist_ok=True)
    snapshot = OUT / f'{key}.txt'
    snapshot.write_text(content)
    (OUT / f'{key}.api.json').write_text(response)
    metadata.update({
        'id': f'tang-nw-{key}',
        'title': title + (' — 维基文库' if 'wikisource' in host else ' — 维基百科'),
        'url': f'https://{host}/w/index.php?title={quote(title)}&oldid={parsed["revid"]}',
        'retrievedAt': datetime.now(timezone.utc).isoformat(),
        'note': metadata.get('note', '实际取得的固定修订文本；历史叙事与现代坐标分别核查。'),
        'snapshotPath': str(snapshot.relative_to(ROOT)),
        'snapshotSha256': hashlib.sha256(snapshot.read_bytes()).hexdigest(),
        'revisionId': str(parsed['revid']),
        'apiUrl': api_url,
    })
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
    return {'source': key, 'revisionId': metadata['revisionId'], 'characters': len(content)}


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--sources', nargs='+', choices=list(PAGES), default=list(PAGES))
    cli.add_argument('--latest', action='store_true', help='Fetch current pages instead of recorded revisions')
    args = cli.parse_args()
    with ThreadPoolExecutor(max_workers=4) as pool:
        for result in pool.map(lambda key: fetch(key, args.latest), args.sources):
            print(json.dumps(result, ensure_ascii=False))
