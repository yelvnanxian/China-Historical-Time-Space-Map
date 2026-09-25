#!/usr/bin/env python3
"""Associate only evidenced modern Yellow River water surfaces with named lines.

Does not alter any source geometry or infer ancient waterways. A surface needs
an actual named main-river vertex strictly inside it and positive line overlap.
"""
from pathlib import Path
from collections import Counter
import gzip
import hashlib
import json
import re
import unicodedata
from shapely.geometry import shape, Point

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public/data/tang-detail'
EVIDENCE = ROOT / 'data/evidence/tang-detail'
NAME_KEYS = ('name', 'name:zh', 'name:zh-Hans', 'name:zh-Hant', 'name:en', 'name:zh-Latn-pinyin')


def normalize_name(value):
    text = unicodedata.normalize('NFD', value).lower().replace('黃', '黄')
    text = ''.join(character for character in text if unicodedata.category(character) != 'Mn')
    return re.sub(r'\s+', '', text)


def matches(tags):
    return [{'key': key, 'value': tags[key], 'normalized': normalize_name(tags[key])}
            for key in NAME_KEYS if key in tags and normalize_name(tags[key]) in ('黄河', 'huanghe', 'yellowriver')]


def read_pack(path):
    raw = path.read_bytes()
    return json.loads(gzip.decompress(raw) if path.suffix == '.gz' else raw)


def build():
    manifest_path = PUBLIC / 'manifest.json'
    manifest = json.loads(manifest_path.read_text())
    rivers, waters = [], []
    rejected_names = []
    for pack in manifest['modernRegions']:
        data = read_pack(ROOT / ('public' + pack['url']))
        for feature in data['features']:
            properties = feature['properties']
            tags = properties.get('tags', {})
            if properties['kind'] == 'river' and tags.get('waterway') == 'river':
                name_matches = matches(tags)
                if name_matches:
                    rivers.append((feature, shape(feature['geometry']), name_matches))
                elif any(re.search(r'黄|黃|huang|yellow', value, flags=re.I) for key, value in tags.items() if key in NAME_KEYS):
                    rejected_names.append({'riverId': properties['id'], 'names': {key: tags[key] for key in NAME_KEYS if key in tags},
                                           'reason': '名称不等值于现代黄河主河名，不能凭huang/黄/yellow子串关联。'})
            elif properties['kind'] == 'water' and tags.get('water') == 'river' and feature['geometry']['type'] in ('Polygon', 'MultiPolygon'):
                waters.append((feature, shape(feature['geometry'])))
    assert rivers and waters
    associations = []
    boundary_only = []
    for feature, water in waters:
        evidence = []
        for river_feature, river, name_matches in rivers:
            if not water.intersects(river):
                continue
            overlap = water.intersection(river)
            inside = [(index, list(coordinate)) for index, coordinate in enumerate(river.coords) if water.contains(Point(coordinate))]
            if overlap.length <= 0 or not inside:
                boundary_only.append({'waterId': feature['properties']['id'], 'riverId': river_feature['properties']['id'],
                                      'intersectionLengthDegrees': overlap.length,
                                      'reason': '没有严格在面内的真实中心线顶点，或仅边界接触；保守不关联。'})
                continue
            index, coordinate = inside[len(inside) // 2]
            river_properties = river_feature['properties']
            evidence.append({'riverId': river_properties['id'], 'riverSourceUrl': river_properties['sourceUrl'],
                             'riverSourceId': river_properties['sourceId'], 'nameMatches': name_matches,
                             'sourceVertexIndex': index, 'sourcePoint': coordinate,
                             'interiorVertexCount': len(inside), 'intersectionLengthDegrees': overlap.length})
        if evidence:
            properties = feature['properties']
            associations.append({'waterId': properties['id'], 'waterSourceUrl': properties['sourceUrl'],
                                 'waterSourceId': properties['sourceId'], 'riverIds': [entry['riverId'] for entry in evidence],
                                 'bounds': list(water.bounds), 'evidence': evidence})
    associations.sort(key=lambda item: item['waterId'])
    statistics = {'mainRiverLines': len(rivers), 'riverWaterCandidates': len(waters),
                  'associatedWaterSurfaces': len(associations),
                  'lineSurfaceAssociations': sum(len(item['evidence']) for item in associations),
                  'unassociatedWaterSurfaces': len(waters) - len(associations),
                  'nonMainRiverNameCandidatesRejected': len(rejected_names),
                  'boundaryOnlyPairsNotAssociated': len(boundary_only)}
    data = {'version': 'yellow-river-water-associations-1', 'sourceManifestUrl': '/data/tang-detail/manifest.json',
            'method': '仅关联water=river水面与名称全值匹配黄河、黃河、Huang He或Yellow River的现代river线；保留真实源线顶点索引，要求顶点严格在面内并有正长度线面交集。不作历史河道推断，也不自动关联邻近或仅接触的水面。',
            'associations': associations, 'statistics': statistics}
    output = PUBLIC / 'yellow-river-water-associations.json'
    output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    audit = {'outputPath': str(output.relative_to(ROOT)), 'outputSha256': hashlib.sha256(output.read_bytes()).hexdigest(),
             'sourceManifestSha256': hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
             'statistics': statistics,
             'lineRecords': [{'riverId': feature['properties']['id'], 'nameMatches': name_matches,
                              'sourceId': feature['properties']['sourceId'], 'sourceUrl': feature['properties']['sourceUrl']}
                             for feature, _, name_matches in rivers],
             'nameRejections': rejected_names, 'boundaryOnlyPairs': boundary_only,
             'limitations': ['现代线面空间关联，非历史黄河水面考证。', '未关联水面不表示它一定不属于黄河；本算法宁可留下不确定记录。',
                            '关联覆盖实际取得的六区域OSM快照，不代表全部现代黄河。', '前端只在已经加载历史河道的适当下游范围替代这些水面。']}
    (EVIDENCE / 'yellow-river-water-association-audit.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(statistics, ensure_ascii=False))


if __name__ == '__main__':
    build()
