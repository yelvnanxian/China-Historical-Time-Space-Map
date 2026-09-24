"""Fetch a small, sequential batch of Chinese name evidence; no map mutation.

Research candidates are not automatically accepted translations. Existing raw
responses are reused. English Wikipedia requests/concurrent scraping are avoided.
"""
from datetime import datetime, timezone
import argparse
import hashlib
import json
from pathlib import Path
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data/evidence/place-name-localization'
OUT.mkdir(parents=True, exist_ok=True)
parser = argparse.ArgumentParser()
parser.add_argument('--offline', action='store_true')
parser.add_argument('--supplement', action='store_true')
args = parser.parse_args()
candidates = json.loads((OUT / 'name-candidates.json').read_text())
titles = sorted({r['candidateTitle'] for r in candidates['natural'] if r['candidateTitle']} | set(candidates['historicalTitles']))
if args.supplement:
    titles = ['黑龙江 (河流)', '扎曲 (澜沧江)', '郁江 (西江支流)', '蒙河 (湄公河)', '漳河 (卫河)', '卡加延河 (吕宋)', '巴江 (越南)', '泉河 (颍河)', '环江 (马莲河支流)', '融江', '南乌河', '南俄水坝', '因戈达河', '大葉尼塞河', '奥卡河 (安加拉河)', '屏河', '绥河', '马哈纳迪河', '殷水县', '鄂嘉土县', '峨嘉县', '商水县', '鄂嘉镇']
responses = []
for index in range(0, len(titles), 20):
    batch = titles[index:index + 20]
    path = OUT / f"zhwiki-{'supplement' if args.supplement else 'names'}-{index // 20:02d}.json"
    meta_path = path.with_suffix('.meta.json')
    query = {'action': 'query', 'format': 'json', 'formatversion': 2,
             'titles': '|'.join(batch), 'redirects': 1, 'converttitles': 1,
             'prop': 'langlinks|coordinates|extracts|revisions|pageprops',
             'lllang': 'en', 'lllimit': 'max', 'exintro': 1, 'explaintext': 1,
             'exlimit': 'max', 'rvprop': 'ids', 'ppprop': 'disambiguation'}
    url = 'https://zh.wikipedia.org/w/api.php?' + urllib.parse.urlencode(query)
    if not path.exists() or not meta_path.exists() or json.loads(meta_path.read_text()).get('url') != url:
        if args.offline:
            continue
        request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 ShanhejiPersonalAtlas/0.8'})
        with urllib.request.urlopen(request, timeout=45) as response:
            payload = response.read()
        data = json.loads(payload)
        if 'error' in data:
            raise RuntimeError(data['error'])
        path.write_bytes(payload)
        meta_path.write_text(json.dumps({'url': url, 'retrievedAt': datetime.now(timezone.utc).isoformat(),
                                        'sha256': hashlib.sha256(payload).hexdigest(), 'path': str(path.relative_to(ROOT))}, ensure_ascii=False, indent=2) + '\n')
    responses.append({'data': json.loads(path.read_text()), 'metadata': json.loads(meta_path.read_text())})
    print('Read', path.name, flush=True)

# Index all acquired Wikipedia batches, including explicitly reviewed supplemental titles.
responses = [{'data': json.loads(path.read_text()), 'metadata': json.loads(path.with_suffix('.meta.json').read_text())}
             for path in sorted(OUT.glob('zhwiki-*.json')) if not path.name.endswith('.meta.json') and path.with_suffix('.meta.json').exists()]
pages, redirects = {}, {}
for response in responses:
    query = response['data'].get('query', {})
    for row in query.get('normalized', []) + query.get('converted', []) + query.get('redirects', []):
        redirects[row['from']] = row['to']
    for page in query.get('pages', []):
        if not page.get('missing'):
            pages[page['title']] = {**page, 'evidencePath': response['metadata']['path']}

def resolve(title):
    seen = set()
    while title in redirects and title not in seen:
        seen.add(title)
        title = redirects[title]
    return title

index = {'redirects': redirects, 'pages': pages, 'resolvedTitles': {title: resolve(title) for title in titles}}
(OUT / 'wikipedia-name-index.json').write_text(json.dumps(index, ensure_ascii=False, indent=2) + '\n')
missing = [title for title in titles if resolve(title) not in pages]
print(json.dumps({'titles': len(titles), 'pages': len(pages), 'missing': missing}, ensure_ascii=False))
