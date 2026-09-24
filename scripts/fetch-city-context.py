#!/usr/bin/env python3
"""Acquire city encyclopedia extracts and revision metadata for the V0.7 review.

Run explicitly to refresh evidence; content builders use the checked-in snapshots.
This is a secondary-source reading aid, not ancient-site/coordinate verification.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode, quote
import hashlib
import json
import subprocess

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'data/evidence/historical-context'
PAGES = {
    'xianyang': '咸阳市', 'jinyang': '太原市', 'datong': '大同市',
    'linzi': '临淄区', 'handan': '邯郸市', 'xiangyang': '襄阳市',
    'tongguan': '潼关', 'yinchuan': '银川市', 'shangdu': '元上都',
    'quanzhou': '泉州市', 'dali': '大理市', 'dunhuang': '敦煌市',
    'qi-state': '齐国', 'linzi-county': '临淄县',
}

def fetch(item):
    key, title = item
    params = {
        'action': 'query', 'prop': 'extracts|revisions', 'titles': title,
        'redirects': 1, 'explaintext': 1, 'rvprop': 'ids|timestamp',
        'format': 'json', 'formatversion': 2,
    }
    # Verified page IDs avoid an intermittent proxy failure on these title URLs.
    if key in ('dali', 'dunhuang'):
        params.pop('titles')
        params['pageids'] = {'dali': 13473, 'dunhuang': 49861}[key]
    api = 'https://zh.wikipedia.org/w/api.php?' + urlencode(params)
    response = subprocess.run(['curl', '-L', '--fail', '--retry', '2', '--max-time', '40', '-sS', api], capture_output=True, text=True, check=True)
    raw = json.loads(response.stdout)
    page = raw['query']['pages'][0]
    text = page['extract']
    assert len(text) > 200, title
    snapshot = EVIDENCE / f'{key}.txt'
    snapshot.write_text(text, encoding='utf-8')
    (EVIDENCE / f'{key}.api.json').write_text(json.dumps(raw, ensure_ascii=False, indent=2) + '\n')
    metadata = {
        'id': 'context-' + key, 'title': page['title'] + ' — 维基百科',
        'url': 'https://zh.wikipedia.org/wiki/' + quote(page['title']),
        'retrievedAt': datetime.now(timezone.utc).isoformat(),
        'note': '百科条目，用于核对概述性时间节点；不是逐条原始史料考证，亦不是古城坐标或边界核定。引文保留本次页面原字形。',
        'snapshotPath': str(snapshot.relative_to(ROOT)),
        'snapshotSha256': hashlib.sha256(snapshot.read_bytes()).hexdigest(),
        'pageId': page['pageid'], 'revision': page['revisions'][0], 'apiUrl': api,
    }
    (EVIDENCE / f'{key}.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
    return {'key': key, 'title': page['title'], 'characters': len(text), 'revid': metadata['revision']['revid']}

if __name__ == '__main__':
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=4) as executor:
        for result in executor.map(fetch, PAGES.items()):
            print(json.dumps(result, ensure_ascii=False))
