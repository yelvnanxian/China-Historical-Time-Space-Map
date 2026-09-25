#!/usr/bin/env python3
"""Archive cited editions for the Tangcheng/Jiyang research; use saved revisions on rerun."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote, urlencode
import hashlib
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data/evidence/tang-county-research/focus-sources'
PAGES = {
    'xintangshu-40': ('新唐書/卷040', 'official-history'),
    'xintangshu-41': ('新唐書/卷041', 'official-history'),
    'xintangshu-43a': ('新唐書/卷043上', 'official-history'),
    'yuanhe-21': ('元和郡縣圖志/卷21', 'historical-geography'),
    'yuanhe-27': ('元和郡縣圖志/卷27', 'historical-geography'),
    'songshi-88': ('宋史/卷088', 'official-history'),
    'songshi-90': ('宋史/卷090', 'official-history'),
}


class Text(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
    def handle_data(self, data):
        self.parts.append(data)
    def handle_starttag(self, tag, attrs):
        if tag in ('p', 'div', 'br', 'h1', 'h2', 'h3', 'h4', 'li'):
            self.parts.append('\n')
    def handle_endtag(self, tag):
        if tag in ('p', 'div', 'h1', 'h2', 'h3', 'h4', 'li'):
            self.parts.append('\n')


def fetch(item):
    key, (title, kind) = item
    path = OUT / f'{key}.json'
    previous = json.loads(path.read_text()) if path.exists() else {}
    params = {'action': 'parse', 'prop': 'text|revid', 'format': 'json'}
    params.update({'oldid': previous['revisionId']} if previous else {'page': title})
    api_url = 'https://zh.wikisource.org/w/api.php?' + urlencode(params)
    raw = subprocess.run(['curl', '-fLsS', '--max-time', '40', '--retry', '1', api_url],
                         check=True, capture_output=True, text=True).stdout
    parsed = json.loads(raw)['parse']
    parser = Text()
    parser.feed(re.sub(r'<(style|script)\b[^>]*>.*?</\1>', '', parsed['text']['*'], flags=re.I | re.S))
    content = '\n'.join(re.sub(r'\s+', ' ', line).strip() for line in ''.join(parser.parts).splitlines() if line.strip()) + '\n'
    assert len(content) > 1000
    OUT.mkdir(parents=True, exist_ok=True)
    snapshot = OUT / f'{key}.txt'
    snapshot.write_text(content)
    (OUT / f'{key}.api.json').write_text(raw)
    metadata = {'id': f'county-focus-{key}', 'title': title.replace('/', '·') + '（维基文库固定版本）',
                'url': f'https://zh.wikisource.org/w/index.php?title={quote(title)}&oldid={parsed["revid"]}',
                'kind': kind, 'snapshotPath': str(snapshot.relative_to(ROOT)),
                'snapshotSha256': hashlib.sha256(snapshot.read_bytes()).hexdigest(),
                'retrievedAt': datetime.now(timezone.utc).isoformat(), 'revisionId': str(parsed['revid']), 'apiUrl': api_url}
    path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
    return {'source': key, 'characters': len(content), 'revisionId': metadata['revisionId']}


if __name__ == '__main__':
    with ThreadPoolExecutor(max_workers=3) as pool:
        for result in pool.map(fetch, PAGES.items()):
            print(json.dumps(result, ensure_ascii=False), flush=True)
