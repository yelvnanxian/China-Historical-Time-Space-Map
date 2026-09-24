"""Rebuild reviewed display-only names from cached source evidence (no network).

The explicit exceptions below are essential: title redirects alone are not an
identity check. Raw map assets and their historical affiliations stay unchanged.
"""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'data/evidence/place-name-localization'
candidate = json.loads((EVIDENCE / 'name-candidates.json').read_text())
pages, redirects = {}, {}
for path in sorted(EVIDENCE.glob('zhwiki-*.json')):
    if path.name.endswith('.meta.json'):
        continue
    query = json.loads(path.read_text()).get('query', {})
    for row in query.get('normalized', []) + query.get('converted', []) + query.get('redirects', []):
        redirects[row['from']] = row['to']
    for page in query.get('pages', []):
        if not page.get('missing'):
            pages[page['title']] = {**page, 'evidencePath': str(path.relative_to(ROOT))}

def resolve(title):
    seen = set()
    while title in redirects and title not in seen:
        seen.add(title)
        title = redirects[title]
    return title

def wiki(title, display=None):
    page = pages[resolve(title)]
    assert 'pageprops' not in page, title
    revision = page['revisions'][0]['revid']
    return {'displayName': display or page['title'], 'method': 'wikipedia-name',
            'sourceUrl': f'https://zh.wikipedia.org/w/index.php?oldid={revision}',
            'evidencePath': page['evidencePath'], 'evidenceTitle': page['title'],
            'note': '中文名按来源词条、外文对应及所在河段核对；仅转换名称显示。'}

english = {p['title']: p for p in json.loads((EVIDENCE / 'enwiki-remaining.json').read_text())['query']['pages'] if not p.get('missing')}

def enwiki(title, display=None):
    page = english[title]
    chinese = [r['title'] for r in page.get('langlinks', []) if r['lang'] == 'zh']
    assert chinese or display
    return {'displayName': display or chinese[0], 'method': 'wikipedia-language-link',
            'sourceUrl': f"https://en.wikipedia.org/w/index.php?oldid={page['revisions'][0]['revid']}",
            'evidencePath': 'data/evidence/place-name-localization/enwiki-remaining.json',
            'evidenceTitle': title, 'note': '按外文词条的中文语言链接及地理位置核对名称。'}

def wikidata(qid, display):
    for path in EVIDENCE.glob('wikidata-search-*.json'):
        if path.name.endswith('.meta.json') or path.name.endswith('index.json'):
            continue
        for item in json.loads(path.read_text()).get('search', []):
            if item['id'] == qid:
                return {'displayName': display, 'method': 'wikidata-label',
                        'sourceUrl': f'https://www.wikidata.org/wiki/{qid}',
                        'evidencePath': str(path.relative_to(ROOT)), 'evidenceTitle': item['label'],
                        'note': '中文名按知识库名称及国家、河流身份核对，括号补充同名消歧。'}
    raise ValueError(qid)

# Explicitly checked river identities; never apply a short romanization globally.
overrides = {
    '35': wiki('扎曲 (澜沧江)', '扎曲（澜沧江）'),
    '72': wiki('黑龙江 (河流)', '黑龙江'),
    '125': wiki('伊洛瓦底江', '恩梅开江'),
    '271': wiki('马哈纳迪河', '默哈讷迪河'),
    '387': wikidata('Q586733', '永河（泰国）'),
    '459': enwiki('Ingoda (river)'),
    '485': enwiki('Manas River'),
    '486': wiki('南乌河', '南乌河'),
    '537': enwiki('Sekong River', '公河（湄公河）'),
    '549': enwiki('Mahi River'),
    '561': enwiki('Penna River'),
    '600': wikidata('Q2639171', '婆罗门河'),
    '608': enwiki('Srepok River'),
    '623': wiki('郁江 (西江支流)', '郁江'),
    '626': wiki('汉江 (朝鲜半岛)', '汉江（朝鲜半岛）'),
    '646': wiki('第二松花江', '第二松花江'),
    '672': enwiki('Tungabhadra River'),
    '693': wiki('奥卡河 (安加拉河)', '奥卡河（安加拉河支流）'),
    '707': wiki('叶尼塞河', '大叶尼塞河'),
    '734': wiki('蒙河 (湄公河)', '蒙河（湄公河）'),
    '735': enwiki('Chi River'),
    '737': wiki('闪电河', '闪电河'),
    '738': wiki('沱江 (红河)', '沱江（越南）'),
    '840': wiki('嫩江', '南瓮河'),
    '884': wiki('米坦格河', '密埃河'),
    '893': wiki('漳河 (卫河)', '漳河'),
    '895': wiki('卡加延河 (吕宋)', '卡加延河（吕宋）'),
    '950': enwiki('Uda (Khabarovsk Krai)'),
    '1001': {**wiki('洞里萨湖', '洞里萨河'), 'method': 'compound-translation', 'note': '以已核对的洞里萨中文专名，加原始资料的河流类型译出；不是湖面名称。'},
    '1072': wikidata('Q29988214', '波仓藏布'),
    '1083': enwiki('Kaladan River'),
    '1086': wiki('梅江 (赣江支流)', '梅江（赣江支流）'),
    '1092': wikidata('Q1418174', '松河（印度）'),
    '1096': wiki('巴江 (越南)', '巴江（越南）'),
    '1118': wiki('泉河 (颍河)', '泉河（颍河）'),
    '1159125069': {**wiki('南俄河', '南俄水库'), 'method': 'compound-translation', 'note': '以已核对的南俄河中文专名，加来源中的水库类型译出；未采用原数据中错配的中文值。'},
}
# These need more evidence. Ambiguous geometry, redirects to a different feature,
# missing Chinese attestation, and absent original names are different cases.
unresolved = {
    '47': '来源把此上游河段单列，尚未核实此河段的确切中文专名。',
    '107': '来源单列上游支流，不能直接以整条小叶尼塞河之名替换。',
    '133': '尚未核实该河段的中文专名。',
    '148': '拼写与广西河段位置不能与泉河对应，暂不据形状猜配。',
    '419': '来源拼写的所指尚待核查。',
    '455': '越南多条河名使用相似前缀，现有资料不足以消歧。',
    '824': '候选词条重定向至整条柳江，尚未取得都柳江河段的直接中文证据。',
    '967': '名称与源几何所在河段存在疑问，不能套用另一条同拼写记录。',
    '1081': '现有同名词条指向广西行政区或河南洹河，与源几何不符。',
}

natural = {}
for row in candidate['natural']:
    suffix = row['groupId'].split('-')[-1]
    entry = overrides.get(suffix)
    if not entry and suffix not in unresolved and row['candidateTitle']:
        title = resolve(row['candidateTitle'])
        page = pages.get(title)
        if page and 'pageprops' not in page:
            entry = wiki(row['candidateTitle'], row['candidateTitle'])
    if not entry:
        entry = {'displayName': f'未定名河流（源编号{suffix}）', 'method': 'unresolved',
                 'note': unresolved.get(suffix, '已核对外文记录，尚未取得足够的中文名称对应证据。')}
    natural[row['groupId']] = {'expectedName': row['expectedName'], **entry}

manifest = json.loads((ROOT / 'public/data/boundaries/manifest.json').read_text())
foreign = []
inputs = ['public/data/boundaries/manifest.json', 'public/data/modern-correspondence.json', 'public/data/physical-interactions.json', 'public/data/physical-interactive.geojson', 'public/data/mountain-directions.geojson']
for dataset in manifest['datasets']:
    for layer in dataset['layers']:
        pathname = 'public' + layer['url']
        inputs.append(pathname)
        for feature in json.loads((ROOT / pathname).read_text())['features']:
            p = feature['properties']
            if any(c.isascii() and c.isalpha() for c in p['name']) or 'ㄦ' in p['name']:
                foreign.append(p)

historical = {}
for p in foreign:
    name = p['name']
    base = {'expectedName': name, 'expectedSourceId': p['sourceId'], 'expectedSourceCode': p.get('sourceCode'), 'expectedYear': p['year']}
    if 'ㄦ' in name:
        records = json.loads((EVIDENCE / 'source-bopomofo-records.json').read_text())
        record = next(row for row in records if row['CODE'] == p['sourceCode'] and row['sourceLayer'] == p['sourceLayer'])
        assert 'er' in record['H_PINYIN_N'] and record['H_UNICODE_'] == name
        entry = {'displayName': name.replace('ㄦ', '儿'), 'method': 'source-transcription', 'sourceUrl': 'https://doi.org/10.7910/DVN/29302', 'evidencePath': 'data/evidence/hartwell/source-layers.zip', 'note': '原始中文字段中的注音符号ㄦ按同记录拼音转写为儿，仅规范字形，不改变来源年份或行政归属。'}
    elif name == 'Yinshui':
        pages_ws = json.loads((EVIDENCE / 'wikisource-historical-names.json').read_text())['query']['pages']
        page = next(page for page in pages_ws if page['title'] == '新唐書/卷038')
        entry = {'displayName': '溵水县', 'method': 'historical-text', 'sourceUrl': f"https://zh.wikisource.org/w/index.php?oldid={page['revisions'][0]['revid']}", 'evidencePath': 'data/evidence/place-name-localization/wikisource-historical-names.json', 'note': '《新唐书》卷三十八陈州条列溵水；按唐代、陈州所属及源记录位置核对为溵水县。'}
    elif name == 'Hankuang':
        entry = wiki('浛洭县', '浛洭县')
    elif name == 'Weimo':
        entry = {**wiki('濊貊', '濊貊'), 'note': '采用名称的中文对应濊貊；保留原资料的年份、分组及行政类型，不据此修订历史归属。'}
    elif name in ('Ao Zhou', '楚雄fu1府'):
        display = '隩州' if name == 'Ao Zhou' else '楚雄府'
        entry = {'displayName': display, 'method': 'source-field', 'sourceUrl': 'https://doi.org/10.7910/DVN/29302', 'evidencePath': 'data/evidence/hartwell/source-layers.zip', 'note': '按该记录自身的同级中文名称字段恢复，未用上级或现代地名替代。'}
    elif name == 'Aboriginal Tribal Lands':
        entry = {'displayName': '原住民部落地区', 'method': 'literal-translation', 'sourceUrl': 'https://doi.org/10.7910/DVN/29302', 'evidencePath': 'data/evidence/hartwell/source-layers.zip', 'note': '忠实翻译来源地区名称，不推断族属或政治归属。'}
    else:
        entry = {'displayName': f'未定名行政区（源编号{p["recordId"]}）', 'method': 'unresolved', 'note': '现有资料不足以核定历史中文名，原文保留供核查；未用现代地区名替代。'}
    historical[p['id']] = {**base, **entry}

document = {'version': '2026-09-24', 'natural': natural, 'historical': historical}
(ROOT / 'shared/place-name-localizations.json').write_text(json.dumps(document, ensure_ascii=False, indent=2) + '\n')
audit = {'sourceHashes': {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in inputs},
         'naturalForeignGroups': len(natural), 'naturalTranslatedGroups': sum(e['method'] != 'unresolved' for e in natural.values()),
         'unresolvedNatural': [{'id': key, **value} for key, value in natural.items() if value['method'] == 'unresolved'],
         'historicalForeignRecords': sum('ㄦ' not in e['expectedName'] for e in historical.values()),
         'historicalBopomofoRecords': sum('ㄦ' in e['expectedName'] for e in historical.values()),
         'unresolvedHistorical': [{'id': key, **value} for key, value in historical.items() if value['method'] == 'unresolved']}
(EVIDENCE / 'localization-audit.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({k: v for k, v in audit.items() if k != 'sourceHashes'}, ensure_ascii=False, indent=2))
