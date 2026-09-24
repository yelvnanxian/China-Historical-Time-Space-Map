"""Rebuild modern Natural Earth background layers; requires Shapely 2.x.

Sources are pinned to a repository commit. No historical geometry is inferred.
Run: python public/data/prepare-natural-layers.py --cache-dir /tmp/map-naturalearth-inputs
"""
from __future__ import annotations
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import tempfile
import urllib.request
from shapely import make_valid
from shapely.geometry import box, mapping, shape
from shapely.ops import linemerge, unary_union

COMMIT = 'ca96624a56bd078437bca8184e78163e5039ad19'
BBOX = [70, 10, 142, 56]
WINDOW = box(*BBOX)
ROOT = Path(__file__).resolve().parent
NAMES = ['ne_10m_rivers_lake_centerlines', 'ne_10m_lakes',
         'ne_10m_geography_regions_polys', 'ne_10m_geography_marine_polys',
         'ne_10m_geography_regions_elevation_points']
parser = argparse.ArgumentParser()
parser.add_argument('--cache-dir', type=Path, default=Path(tempfile.gettempdir()) / 'map-naturalearth-inputs')
args = parser.parse_args()
args.cache_dir.mkdir(parents=True, exist_ok=True)
sources = {}
source_meta = []
for name in NAMES:
    path = args.cache_dir / f'{name}.geojson'
    meta_path = args.cache_dir / f'{name}.json'
    url = f'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/{COMMIT}/geojson/{name}.geojson'
    if not path.exists():
        request = urllib.request.Request(url, headers={'User-Agent': 'HistoricalAtlasNaturalEarthData/0.3'})
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = response.read()
        path.write_bytes(payload)
        meta = {'dataset': name, 'url': url, 'repositoryCommit': COMMIT,
                'downloadedAt': datetime.now(timezone.utc).isoformat(),
                'sha256': hashlib.sha256(payload).hexdigest(), 'bytes': len(payload)}
        meta_path.write_text(json.dumps(meta, indent=2) + '\n')
    meta = json.loads(meta_path.read_text())
    if 'datasetVersion' not in meta:
        version_url = f'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/{COMMIT}/10m_physical/{name}.VERSION.txt'
        request = urllib.request.Request(version_url, headers={'User-Agent': 'HistoricalAtlasNaturalEarthData/0.3'})
        with urllib.request.urlopen(request, timeout=30) as response:
            meta['datasetVersion'] = response.read().decode().strip()
        meta['versionUrl'] = version_url
        meta_path.write_text(json.dumps(meta, indent=2) + '\n')
    assert meta['repositoryCommit'] == COMMIT
    assert hashlib.sha256(path.read_bytes()).hexdigest() == meta['sha256']
    sources[name] = json.loads(path.read_text())['features']
    source_meta.append(meta)

RIVERS, LAKES, REGIONS, MARINE, PEAKS = NAMES

def lower_properties(feature):
    return {key.lower(): value for key, value in feature['properties'].items()}

def clean_geometry(feature):
    geometry = shape(feature['geometry'])
    if not geometry.is_valid:
        geometry = make_valid(geometry)
    return geometry

def only_type(geometry, family):
    accepted = {'line': {'LineString', 'MultiLineString'}, 'polygon': {'Polygon', 'MultiPolygon'}}[family]
    if geometry.geom_type in accepted:
        return geometry
    if geometry.geom_type == 'GeometryCollection':
        geometries = [part for part in geometry.geoms if part.geom_type in accepted and not part.is_empty]
        return unary_union(geometries) if geometries else None
    return None

def rounded(value):
    if isinstance(value, float):
        return round(value, 6)
    if isinstance(value, (tuple, list)):
        return [rounded(x) for x in value]
    if isinstance(value, dict):
        return {key: rounded(val) for key, val in value.items()}
    return value

# Project display translations, keyed to source feature indices to disambiguate
# similarly named rivers (notably Sichuan Min / Fujian Min and China Han / Korea Han).
RIVER_LABELS = [
    ('changjiang', [289, 301], '长江', 2.8),
    ('huanghe', [954, 1326], '黄河', 2.8),
    ('hanjiang', [412], '汉江', 4.2),
    ('huaihe', [683], '淮河', 4.2),
    ('weihe', [1228], '渭河', 4.0),
    ('jinghe', [1238], '泾河', 5.3),
    ('fenhe', [90], '汾河', 5.0),
    ('qinhe', [1241], '沁河', 5.6),
    ('ganjiang', [426], '赣江', 4.8),
    ('xiangjiang', [682], '湘江', 4.8),
    ('yuanjiang', [364], '沅江', 5.2),
    ('jialingjiang', [775], '嘉陵江', 4.6),
    ('daduhe', [465], '大渡河', 5.1),
    ('minjiang-sichuan', [531], '岷江', 5.0),
    ('yalongjiang', [778], '雅砻江', 5.0),
    ('wujiang', [681], '乌江', 5.2),
    ('songhuajiang', [530], '松花江', 4.0),
    ('nenjiang', [1306], '嫩江', 5.0),
    ('heilongjiang', [1305], '黑龙江', 3.6),
    ('liaohe', [362], '辽河', 4.8),
    ('haihe', [882], '海河', 5.0),
    ('yongdinghe', [855], '永定河', 5.8),
    ('luanhe', [1269], '滦河', 5.5),
    ('xijiang', [1337], '西江', 4.4),
    ('beijiang', [791], '北江', 5.6),
    ('dongjiang', [776], '东江', 5.5),
    ('minjiang-fujian', [700], '闽江', 5.0),
    ('fuchunjiang', [557], '富春江', 5.1),
    ('tarim', [511], '塔里木河', 3.8),
    ('yarlung', [651], '雅鲁藏布江', 3.5),
    ('lancang', [609], '澜沧江', 4.0),
    ('nujiang', [222], '怒江', 4.6),
]
translations = {}
for label_id, indices, name, min_zoom in RIVER_LABELS:
    for index in indices:
        translations[index] = name

# A visibly unrelated upstream translation is withheld, not silently treated as verified.
REJECTED_CHINESE_NAMES = {'Nam Ngum Reservoir': '塔什幹日本滯留者墓地'}

def feature_name(props, river_index=None):
    if river_index in translations:
        return translations[river_index], 'editorial-translation'
    chinese = props.get('name_zh')
    if chinese and props.get('name') not in REJECTED_CHINESE_NAMES:
        return chinese, 'natural-earth-name_zh'
    return props.get('name') or props.get('name_en') or '', 'natural-earth-original'

def common_props(dataset, index, feature):
    props = lower_properties(feature)
    name, origin = feature_name(props, index if dataset == RIVERS else None)
    return {'name': name, 'nameEn': props.get('name_en') or props.get('name') or '',
            'nameOrigin': origin, 'sourceName': props.get('name'),
            'sourceDataset': dataset, 'sourceFeatureIndex': index,
            'sourceId': props.get('ne_id', props.get('rivernum')),
            'scalerank': props.get('scalerank', 10),
            'minZoom': props.get('min_zoom', 3),
            'min_zoom': props.get('min_zoom', 3),
            'featurecla': props.get('featurecla')}

outputs = {}
repairs = []
for dataset, filename, family, tolerance in [(RIVERS, 'rivers.geojson', 'line', 0.012),
                                            (LAKES, 'lakes.geojson', 'polygon', 0.006)]:
    features = []
    for index, feature in enumerate(sources[dataset]):
        if not feature.get('geometry'):
            continue
        original = shape(feature['geometry'])
        if not original.is_valid:
            repairs.append({'dataset': dataset, 'featureIndex': index, 'operation': 'Shapely make_valid'})
        geometry = clean_geometry(feature)
        if not geometry.intersects(WINDOW):
            continue
        clipped = only_type(geometry.intersection(WINDOW), family)
        if clipped is None or clipped.is_empty:
            continue
        simplified = clipped.simplify(tolerance, preserve_topology=True)
        if simplified.is_empty:
            continue
        result = rounded(mapping(simplified))
        assert shape(result).is_valid
        features.append({'type': 'Feature', 'id': f'{dataset}-{index}',
                         'properties': common_props(dataset, index, feature), 'geometry': result})
    outputs[filename] = {'type': 'FeatureCollection', 'bbox': BBOX,
                         'metadata': {'source': 'Natural Earth 1:10m', 'commit': COMMIT,
                                      'modernBackgroundOnly': True, 'simplificationDegrees': tolerance,
                                      'sourceManifest': 'natural-geography-sources.json'},
                         'features': features}

labels = []

def add_label(label_id, dataset, indices, kind, min_zoom, point, method, name_override=None):
    first = sources[dataset][indices[0]]
    props = lower_properties(first)
    name, origin = feature_name(props, indices[0] if dataset == RIVERS else None)
    if name_override:
        name, origin = name_override, 'editorial-translation'
    assert name and point.geom_type == 'Point' and WINDOW.covers(point)
    feature_props = {'name': name, 'nameEn': props.get('name_en') or props.get('name') or name,
                     'kind': kind, 'minZoom': min_zoom, 'nameOrigin': origin,
                     'sourceName': props.get('name'), 'sourceDataset': dataset,
                     'sourceFeatureIndices': indices, 'sourceId': props.get('ne_id', props.get('rivernum')),
                     'coordinateMethod': method}
    # Preserve original source coordinates for elevation points, otherwise round display-derived points.
    geometry = mapping(point) if method == 'source-point' else rounded(mapping(point))
    labels.append({'type': 'Feature', 'id': label_id, 'properties': feature_props, 'geometry': geometry})

for label_id, indices, name, min_zoom in RIVER_LABELS:
    segments = [clean_geometry(sources[RIVERS][i]).intersection(WINDOW) for i in indices]
    combined = unary_union(segments)
    if combined.geom_type == 'MultiLineString':
        combined = linemerge(combined)
    line = max(combined.geoms, key=lambda g: g.length) if combined.geom_type == 'MultiLineString' else combined
    assert line.geom_type == 'LineString'
    add_label('river-' + label_id, RIVERS, indices, 'river', min_zoom,
              line.interpolate(0.5, normalized=True),
              'midpoint-by-planar-length-of-longest-merged-source-line-after-bbox-clipping', name)

LAKE_SELECTION = {
    'Qinghai Hu': 3.5, 'Poyang Hu': 4.4, 'Dongting Hu': 4.4, 'Tai Hu': 4.5,
    'Hongze Hu': 4.7, 'Chao Hu': 5.3, 'Hong Hu': 5.6, 'Weishan Hu': 5.5,
    'Gaoyou Hu': 5.8, 'Lake Baikal': 3.4, 'Lake Balkhash': 3.7,
    'Lake Khanka': 4.5, 'Hulun Nuur': 4.6, 'Nam Co': 4.5,
    'Bosten Hu': 4.5, 'Siling Co': 4.6, 'Mapam Yumco': 5.5,
    'Yamzho Yumco': 5.5, 'Issyk-Kul': 4.5, 'Uvs Nuur': 5.1,
}
RANGE_SELECTION = {
    'HIMALAYAS': 2.6, 'KUNLUN MOUNTAINS': 3.2, 'TIAN SHAN': 3.0,
    'QUILIAN MOUNTAINS': 3.8, 'Qinling Mountains': 3.6, 'Taihang Mts.': 4.2,
    'Dabie Mts.': 5.2, 'Nan Ling Mts.': 4.9, 'GREATER KHINGAN RANGE': 3.7,
    'Lesser Khingan Range': 5.0, 'ALTAY MOUNTAINS': 4.0, 'ALTUN MTS.': 4.2,
    'Yin Mts.': 4.5, 'Lüliang Mts.': 5.0, 'Wuyi Mts.': 5.0,
    'PAMIRS': 3.6, 'KARAKORAM RA.': 4.5, 'HINDU KUSH': 4.8,
}
PEAK_SELECTION = {'Mount Everest': 4.8, 'K2': 5.2, 'Taibai Shan': 6.0,
                  'Wutai Shan': 5.8, 'Gongga Shan': 5.8, 'Geladandong': 5.8,
                  'Kailash': 5.9, 'Yu Shan': 5.3}
SEA_SELECTION = {'Bo Hai': 4.0, 'Yellow Sea': 3.0, 'East China Sea': 3.0,
                 'South China Sea': 2.7, 'Sea of Japan': 3.6, 'Taiwan Strait': 4.8,
                 'Philippine Sea': 3.5, 'Bay of Bengal': 3.5}
for dataset, selection, kind, point_source in [(LAKES, LAKE_SELECTION, 'lake', False),
                                                (REGIONS, RANGE_SELECTION, 'mountain', False),
                                                (PEAKS, PEAK_SELECTION, 'mountain', True),
                                                (MARINE, SEA_SELECTION, 'sea', False)]:
    found = set()
    for index, feature in enumerate(sources[dataset]):
        props = lower_properties(feature)
        name = props.get('name')
        if name not in selection:
            continue
        geometry = clean_geometry(feature)
        if not geometry.intersects(WINDOW):
            continue
        clipped = geometry.intersection(WINDOW)
        point = geometry if point_source else clipped.representative_point()
        add_label(f'{kind}-{dataset}-{index}', dataset, [index], kind, selection[name], point,
                  'source-point' if point_source else 'interior-representative-point-of-source-polygon-after-bbox-clipping')
        found.add(name)
    assert found == set(selection), (dataset, sorted(set(selection) - found))
assert len(labels) <= 100
assert all(set(['name', 'nameEn', 'kind', 'minZoom']) <= set(f['properties']) for f in labels)
assert {'长江', '黄河', '淮河', '汉江', '渭河'} <= {f['properties']['name'] for f in labels}
outputs['physical-labels.geojson'] = {
    'type': 'FeatureCollection', 'bbox': BBOX,
    'metadata': {'source': 'Natural Earth 1:10m', 'commit': COMMIT, 'modernBackgroundOnly': True,
                 'labelPlacement': 'Derived from actual source geometry; no hand-written coordinates.',
                 'editorialTranslations': 'Common river names translated for display by this project; nameEn and sourceName preserve original fields.',
                 'sourceManifest': 'natural-geography-sources.json'},
    'features': labels}

stats = {}
for filename, data in outputs.items():
    payload = json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n'
    (ROOT / filename).write_text(payload)
    stats[filename] = {'features': len(data['features']), 'bytes': len(payload.encode()),
                       'sha256': hashlib.sha256(payload.encode()).hexdigest()}

manifest = {
    'generatedAt': datetime.now(timezone.utc).isoformat(), 'repositoryCommit': COMMIT,
    'coordinateSystem': 'WGS84 longitude/latitude, EPSG:4326',
    'clipBounds': BBOX, 'scale': 'Natural Earth 1:10m (1:10,000,000)',
    'license': 'Natural Earth public domain',
    'licenseUrl': 'https://www.naturalearthdata.com/about/terms-of-use/',
    'sources': source_meta, 'outputs': stats,
    'labelCounts': dict(Counter(f['properties']['kind'] for f in labels)),
    'derivation': {'rivers': 'Clip source linework to bbox; topology-preserving simplify at 0.012 degrees.',
                   'lakes': 'Repair invalid input if required; clip polygons; topology-preserving simplify at 0.006 degrees.',
                   'riverLabels': 'Merge explicitly listed original segments, take longest continuous line, interpolate midpoint by coordinate-space length.',
                   'polygonLabels': 'Shapely representative_point inside clipped original polygon (no simplification used for label position).',
                   'mountainPeaks': 'Copy Natural Earth elevation-point geometry; not a new survey.',
                   'minZoom': 'Project editorial display thresholds; not a claim of measurement accuracy.',
                   'precision': 'Derived/display geometries rounded to 6 decimals; retained precision does not indicate metre-level accuracy.'},
    'editorialRiverTranslations': [{'labelId': x[0], 'sourceFeatureIndices': x[1], 'name': x[2]} for x in RIVER_LABELS],
    'withheldNameZh': [{'sourceName': name, 'upstreamValue': val,
                       'reason': 'Clearly unrelated translated name; original source name retained instead.'}
                      for name, val in REJECTED_CHINESE_NAMES.items()],
    'geometryRepairs': repairs,
    'limitations': ['All layers are modern natural-geography context, not reconstructed ancient coastlines, waterways or lakes.',
                    'Some lake polygons are modern reservoirs; no inference is made about their existence in an ancient period.',
                    'Mountain-range and sea label polygons are cartographic naming areas, not surveyed boundaries.',
                    'No forest or grassland historical distribution was invented or supplied.']}
previous_manifest_path = ROOT / 'natural-geography-sources.json'
if previous_manifest_path.exists():
    previous_manifest = json.loads(previous_manifest_path.read_text())
    if 'licenseCheck' in previous_manifest:
        manifest['licenseCheck'] = previous_manifest['licenseCheck']
(ROOT / 'natural-geography-sources.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'outputs': stats, 'labelCounts': manifest['labelCounts'], 'labelsTotal': len(labels)}, ensure_ascii=False, indent=2))
