"""Build selectable modern physical features from actual Natural Earth geometries.

Requires Shapely 2.x and the project's Node/opencc-js installation.
Run: python scripts/build-physical-interactions.py --cache-dir /tmp/map-naturalearth-inputs
Existing rivers/lakes/physical-labels are read-only inputs. No buffers, hulls,
hand-drawn polygons or historical reconstruction are used.
"""
from __future__ import annotations
import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import urllib.request

from shapely.geometry import box, shape

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public/data'
EVIDENCE = ROOT / 'data/evidence/physical-geography'
EVIDENCE.mkdir(parents=True, exist_ok=True)
BASE = json.loads((PUBLIC / 'natural-geography-sources.json').read_text())
SOURCES = {source['dataset']: source for source in BASE['sources']}
COMMIT = BASE['repositoryCommit']
BBOX = BASE['clipBounds']
WINDOW = box(*BBOX)
REGIONS = 'ne_10m_geography_regions_polys'
MARINE = 'ne_10m_geography_marine_polys'
RIVERS = 'ne_10m_rivers_lake_centerlines'
LAKES = 'ne_10m_lakes'
parser = argparse.ArgumentParser()
parser.add_argument('--cache-dir', type=Path, default=Path(tempfile.gettempdir()) / 'map-naturalearth-inputs')
args = parser.parse_args()
args.cache_dir.mkdir(parents=True, exist_ok=True)


def digest(payload):
    return hashlib.sha256(payload).hexdigest()


def read_source(dataset):
    source = SOURCES[dataset]
    snapshot = EVIDENCE / f'{dataset}.geojson'
    cached = args.cache_dir / f'{dataset}.geojson'
    if snapshot.exists():
        payload = snapshot.read_bytes()
    elif cached.exists():
        payload = cached.read_bytes()
    else:
        request = urllib.request.Request(source['url'], headers={'User-Agent': 'HistoricalAtlasPhysicalFeatures/0.6'})
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = response.read()
    assert digest(payload) == source['sha256'], f'Source hash mismatch: {dataset}'
    snapshot.write_bytes(payload)
    return json.loads(payload)['features']


def props(feature):
    return {key.lower(): value for key, value in feature['properties'].items()}


def useful_name(value):
    return isinstance(value, str) and bool(value.strip()) and not value.replace('.', '').strip().isdigit()


inputs = {name: json.loads((PUBLIC / name).read_text()) for name in
          ['rivers.geojson', 'lakes.geojson', 'physical-labels.geojson']}
input_hashes = {name: digest((PUBLIC / name).read_bytes()) for name in inputs}
labels = inputs['physical-labels.geojson']['features']
label_lookup = {(f['properties']['sourceDataset'], index): f for f in labels
                for index in f['properties']['sourceFeatureIndices']}
region_source = read_source(REGIONS)
marine_source = read_source(MARINE)

# These are display translations only. Geometries retain the original source
# record and coordinates; original labels remain available in sourceName.
EDITORIAL_NAMES = {
    'Borohoro Mts.': '博罗科努山',
    'EASTERN SAYAN MTS.': '东萨彦岭',
}
NAME_ZOOM = {
    'PLATEAU OF TIBET': 3.0, 'Loess Plateau': 4.0, 'YUNGUI PLATEAU': 4.2,
    'MONGOLIAN PLATEAU': 4.0, 'SHAN PLATEAU': 5.0,
}

# Same Natural Earth river identifier joins river + lake-centerline pieces.
# The existing checked label inventory explicitly joins the two Yangtze
# and Huang He records despite their distinct upstream identifiers.
river_index = {f['properties']['sourceFeatureIndex']: f for f in inputs['rivers.geojson']['features']}
river_labels_by_source_id = {}
for label in labels:
    lp = label['properties']
    if lp['kind'] != 'river':
        continue
    for index in lp['sourceFeatureIndices']:
        river_labels_by_source_id[river_index[index]['properties']['sourceId']] = label

features = []
coordinate_methods = Counter()


def add_feature(feature_id, geometry, kind, dataset, index, source_id, source_name,
                name, name_en, name_origin, group_id, min_zoom, geometry_note,
                label=None, extra=None):
    geom = shape(geometry)
    assert geom.is_valid and not geom.is_empty, feature_id
    assert geom.geom_type in ['LineString', 'MultiLineString', 'Polygon', 'MultiPolygon']
    if kind == 'river':
        longest = max(geom.geoms, key=lambda part: part.length) if geom.geom_type == 'MultiLineString' else geom
        point = longest.interpolate(0.5, normalized=True)
        method = 'planar-length-midpoint-of-longest-existing-line-part'
    else:
        point = geom.representative_point()
        method = 'interior-representative-point-of-feature-polygon'
    coordinate_methods[method] += 1
    fallback = not useful_name(name)
    if fallback:
        kind_name = {'river': '河流', 'lake': '湖泊', 'mountain': '山系', 'plateau': '高原', 'sea': '海域'}[kind]
        name = f'未命名{kind_name}（源编号{source_id}）'
        name_origin = 'unnamed-source-fallback'
    if not useful_name(name_en):
        name_en = f'Unnamed {kind} ({source_id})'
    properties = {
        'id': feature_id, 'groupId': group_id, 'name': name, 'nameEn': name_en,
        'kind': kind, 'sourceDataset': dataset, 'sourceUrl': SOURCES[dataset]['url'],
        'sourceFeatureIndices': [index], 'sourceId': source_id, 'sourceName': source_name,
        'nameOrigin': name_origin, 'geometryNote': geometry_note,
        'bounds': list(geom.bounds), 'labelCoordinates': list(point.coords[0]),
        'labelCoordinateMethod': method, 'minZoom': min_zoom,
        'modernBackgroundOnly': True, 'unnamed': fallback,
    }
    if label:
        properties['existingLabelId'] = label['id']
    if extra:
        properties.update(extra)
    features.append({'type': 'Feature', 'id': feature_id, 'properties': properties, 'geometry': geometry})


for filename, kind in [('rivers.geojson', 'river'), ('lakes.geojson', 'lake')]:
    for original in inputs[filename]['features']:
        p = original['properties']
        dataset, index = p['sourceDataset'], p['sourceFeatureIndex']
        label = river_labels_by_source_id.get(p['sourceId']) if kind == 'river' else label_lookup.get((dataset, index))
        display = label['properties'] if label else p
        group_id = label['id'] if label else f'{kind}-{dataset}-{p["sourceId"]}'
        note = ('现代河线；Natural Earth 1:1000万，已按展示范围裁剪并以0.012°简化；包含穿湖中心线，不代表历代河道。'
                if kind == 'river' else
                '现代湖面；Natural Earth 1:1000万，已按展示范围裁剪并以0.006°简化；部分为现代水库，不代表历代湖岸。')
        add_feature(str(original['id']), original['geometry'], kind, dataset, index, p['sourceId'],
                    p.get('sourceName'), display.get('name'), display.get('nameEn'),
                    display.get('nameOrigin', 'natural-earth-original'), group_id,
                    display.get('minZoom', p.get('minZoom', 5)), note, label,
                    {'sourceFeatureClass': p.get('featurecla'), 'rawDisplayName': p.get('name'),
                     'rawNameEn': p.get('nameEn')})

selected_regions = []
for index, original in enumerate(region_source):
    p = props(original)
    if p['featurecla'] not in ['Range/mtn', 'Plateau'] or not shape(original['geometry']).intersects(WINDOW):
        continue
    kind = 'mountain' if p['featurecla'] == 'Range/mtn' else 'plateau'
    label = label_lookup.get((REGIONS, index))
    source_name = p['name']
    name = EDITORIAL_NAMES.get(source_name) or p.get('name_zh') or source_name
    name_origin = ('editorial-translation' if source_name in EDITORIAL_NAMES else
                   'natural-earth-name_zh' if p.get('name_zh') else 'natural-earth-original')
    feature_id = f'{REGIONS}-{index}'
    min_zoom = (label['properties']['minZoom'] if label else
                NAME_ZOOM.get(source_name, max(4.6, min(float(p.get('min_label') or 5), 6))))
    add_feature(feature_id, original['geometry'], kind, REGIONS, index, p['ne_id'], source_name,
                name, p.get('name_en') or source_name, name_origin, feature_id, min_zoom,
                'Natural Earth 1:1000万地图概括命名范围；使用来源原始多边形，不是测绘边界或精确山体边界。',
                label, {'sourceFeatureClass': p['featurecla'], 'sourceNameZh': p.get('name_zh'),
                        'sourceWikidataId': p.get('wikidataid'), 'geometryDerivation': 'exact-source-geometry'})
    selected_regions.append({'featureId': feature_id, 'sourceFeatureIndex': index, 'sourceId': p['ne_id']})

sea_indices = {index for label in labels if label['properties']['kind'] == 'sea'
               for index in label['properties']['sourceFeatureIndices']}
for index in sorted(sea_indices):
    original = marine_source[index]
    p = props(original)
    label = label_lookup[(MARINE, index)]
    feature_id = f'{MARINE}-{index}'
    add_feature(feature_id, original['geometry'], 'sea', MARINE, index, p['ne_id'], p['name'],
                p.get('name_zh') or p['name'], p.get('name_en') or p['name'],
                'natural-earth-name_zh' if p.get('name_zh') else 'natural-earth-original',
                feature_id, label['properties']['minZoom'],
                'Natural Earth 1:1000万海域命名范围；使用来源原始多边形，不是海洋法界线或历史海岸线。',
                label, {'sourceFeatureClass': p['featurecla'], 'geometryDerivation': 'exact-source-geometry'})

# Normalize only visible Chinese labels; source fields retain their exact values.
node_script = """import * as OpenCC from 'opencc-js';
let input=''; for await (const chunk of process.stdin) input+=chunk;
const convert=OpenCC.Converter({from:'tw',to:'cn'});
process.stdout.write(JSON.stringify(JSON.parse(input).map(convert)));"""
names = [feature['properties']['name'] for feature in features]
converted = json.loads(subprocess.run(['node', '--input-type=module', '-e', node_script],
                                    input=json.dumps(names), text=True, capture_output=True,
                                    cwd=ROOT, check=True).stdout)
for feature, name in zip(features, converted):
    p = feature['properties']
    if name != p['name']:
        p['nameBeforeSimplification'] = p['name']
        p['nameOrigin'] += '+opencc-tw-to-cn'
    p['name'] = name

groups_by_id = defaultdict(list)
for feature in features:
    groups_by_id[feature['properties']['groupId']].append(feature)
groups = []
for group_id, members in groups_by_id.items():
    first = members[0]['properties']
    rectangles = [f['properties']['bounds'] for f in members]
    aliases = sorted({str(f['properties'][key]) for f in members
                      for key in ['name', 'nameEn', 'sourceName'] if useful_name(f['properties'].get(key))})
    matching_label = next((label for label in labels if label['id'] == group_id), None)
    group = {key: first[key] for key in ['name', 'nameEn', 'kind', 'sourceDataset', 'sourceUrl', 'geometryNote']}
    group.update({
        'id': group_id, 'groupId': group_id, 'featureIds': [f['id'] for f in members],
        'bounds': [min(b[0] for b in rectangles), min(b[1] for b in rectangles),
                   max(b[2] for b in rectangles), max(b[3] for b in rectangles)],
        'labelCoordinates': (matching_label['geometry']['coordinates'] if matching_label else first['labelCoordinates']),
        'minZoom': min(f['properties']['minZoom'] for f in members), 'aliases': aliases,
        'unnamed': all(f['properties']['unnamed'] for f in members),
    })
    groups.append(group)
groups.sort(key=lambda group: (group['unnamed'], group['minZoom'], group['kind'], group['id']))

metadata = {
    'version': '1.0.0', 'sourceManifestUrl': '/data/physical-geography-sources.json',
    'coordinateSystem': BASE['coordinateSystem'], 'scale': BASE['scale'],
    'modernBackgroundOnly': True,
}
collection = {'type': 'FeatureCollection', 'metadata': metadata, 'features': features}
region_collection = {'type': 'FeatureCollection', 'metadata': metadata,
                     'features': [f for f in features if f['properties']['kind'] in ['mountain', 'plateau']]}
interaction_index = {'version': '1.0.0', 'geometryUrl': '/data/physical-interactive.geojson',
                     'sourceManifestUrl': '/data/physical-geography-sources.json', 'groups': groups}
outputs = {}
for filename, data in [('physical-interactive.geojson', collection), ('physical-regions.geojson', region_collection),
                       ('physical-interactions.json', interaction_index)]:
    payload = (json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
    (PUBLIC / filename).write_bytes(payload)
    outputs[filename] = {'sha256': digest(payload), 'bytes': len(payload)}

manifest = {
    **metadata, 'repositoryCommit': COMMIT, 'license': BASE['license'], 'licenseUrl': BASE['licenseUrl'],
    'selectionWindow': BBOX,
    'sources': [{**SOURCES[dataset], 'snapshotPath': f'data/evidence/physical-geography/{dataset}.geojson'}
                for dataset in [REGIONS, MARINE]],
    'readOnlyInputs': [{'path': f'public/data/{name}', 'sha256': checksum} for name, checksum in input_hashes.items()],
    'featureCounts': dict(Counter(f['properties']['kind'] for f in features)),
    'groupCounts': dict(Counter(g['kind'] for g in groups)),
    'outputs': outputs,
    'selection': 'Every Range/mtn and Plateau source polygon intersecting the selection window; eight marine label regions already in the existing label inventory.',
    'geometryDerivation': {
        'mountainPlateauSea': 'Exact original source geometry. No clipping, simplification, buffering, hull, rounding or invented boundary.',
        'riverLake': 'Exact copy of existing display geometry. Prior clipping, simplification and repairs remain documented in natural-geography-sources.json.',
        'selectionWindow': 'Used only to select region records; complete selected source geometries may extend outside the window.',
        'labelCoordinates': dict(coordinate_methods),
    },
    'selectedRegions': selected_regions,
    'grouping': 'River parts with the same sourceId join; the existing physical-labels explicit sourceFeatureIndices additionally join Yangtze and Huang He records. Matching river-centerline IDs inherit that group. Names alone are never used to merge rivers.',
    'displayNames': {'simplification': 'opencc-js tw→cn', 'editorialRegionTranslations': EDITORIAL_NAMES,
                     'riverTranslations': 'Reuse existing physical-labels checked source-index mappings; unknown original names retained, empty/numeric names explicitly marked unnamed.',
                     'rawNames': 'sourceName/rawDisplayName/rawNameEn and original snapshots retain the original values.'},
    'coverageLimitations': [
        'A source cartographic naming extent is not a surveyed physical boundary; overlapping ranges and plateaus are intentional.',
        'Natural Earth does not provide a named Hengduan or Changbai mountain polygon in this pinned dataset; no guessed substitute was created.',
        'Modern lakes may include reservoirs and modern rivers may include lake centerlines; these are not historical reconstructions.',
        'Source English names and Chinese transliterations are not a complete authoritative Chinese gazetteer.',
    ],
}
(PUBLIC / 'physical-geography-sources.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
assert all(digest((PUBLIC / name).read_bytes()) == checksum for name, checksum in input_hashes.items())
print(json.dumps({'features': manifest['featureCounts'], 'groups': manifest['groupCounts'], 'outputs': outputs}, ensure_ascii=False, indent=2))
