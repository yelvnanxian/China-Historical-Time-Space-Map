#!/usr/bin/env python3
"""Convert archived OSM ways to unchanged lines; no peak linking, buffers or polygon axes."""
from collections import Counter
from pathlib import Path
import argparse
import gzip
import hashlib
import importlib.util
import json
import math
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'data/evidence/mountain-detail'
OUTPUT = ROOT / 'public/data/mountain-detail'
KINDS = {'ridge': '山脊', 'arete': '刃脊', 'cliff': '陡崖', 'peak': '山峰'}
spec = importlib.util.spec_from_file_location('mountain_fetch', ROOT / 'scripts/fetch-mountain-detail.py')
fetch_config = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fetch_config)


def write(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2, allow_nan=False) + '\n')


def digest(value):
    return hashlib.sha256(value).hexdigest()


def distance(a, b):
    lat1, lat2 = math.radians(a[1]), math.radians(b[1])
    dlat, dlon = lat2 - lat1, math.radians(b[0] - a[0])
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371.0088 * 2 * math.asin(min(1, math.sqrt(h)))


def bounds(points):
    return [min(p[0] for p in points), min(p[1] for p in points), max(p[0] for p in points), max(p[1] for p in points)]


def raw_geometry(element):
    if element['type'] == 'node':
        coordinates = [element['lon'], element['lat']]
        return {'type': 'Point', 'coordinates': coordinates}, [coordinates]
    points = [[point['lon'], point['lat']] for point in element['geometry']]
    assert len(points) == len(element['nodes']) >= 2, 'Incomplete way geometry'
    assert len(set(tuple(point) for point in points)) >= 2, 'Zero-length way'
    return {'type': 'LineString', 'coordinates': points}, points


def build(allow_missing=False):
    sources = []
    missing = []
    selected = {}
    duplicates = 0
    version_choices = []
    for region in fetch_config.REGIONS:
        for tile_id, *_ in fetch_config.tiles(region):
            source_path = EVIDENCE / 'osm' / f'{tile_id}-source.json'
            if not source_path.exists() and allow_missing:
                missing.append(tile_id)
                continue
            source = json.loads(source_path.read_text())
            compressed = (ROOT / source['snapshotPath']).read_bytes()
            assert digest(compressed) == source['snapshotSha256']
            expanded = gzip.decompress(compressed)
            assert digest(expanded) == source['uncompressedSnapshotSha256']
            assert digest((ROOT / source['queryPath']).read_bytes()) == source['querySha256']
            raw = json.loads(expanded)
            assert len(raw['elements']) == source['elementCount']
            sources.append(source)
            for element in raw['elements']:
                key = f"osm-{element['type']}-{element['id']}"
                if key in selected:
                    duplicates += 1
                    previous, previous_source = selected[key]
                    if previous.get('version') == element.get('version'):
                        assert previous.get('tags') == element.get('tags') and raw_geometry(previous)[0] == raw_geometry(element)[0], f'Conflicting same-version object {key}'
                    else:
                        version_choices.append({'id': key, 'versions': [previous.get('version'), element.get('version')], 'sourceIds': [previous_source['id'], source['id']], 'rule': 'Keep greater OSM version'})
                    if previous.get('version', 0) >= element.get('version', 0):
                        continue
                selected[key] = (element, source)
    features = []
    for key, (element, source) in sorted(selected.items()):
        tags = element.get('tags', {})
        kind = tags['natural']
        assert kind in KINDS
        assert (element['type'] == 'node') == (kind == 'peak')
        geometry, points = raw_geometry(element)
        assert all(-180 <= x <= 180 and -90 <= y <= 90 for x, y in points)
        names = [tags.get(k, '') for k in ['name:zh-Hans', 'name:zh', 'name:zh-Hant', 'name']]
        chinese_name = next((name for name in names if re.search(r'[\u3400-\u9fff]', name)), '')
        original_name = next((name for name in names if name), '')
        name = chinese_name or ('未定名' if original_name else '未命名') + KINDS[kind]
        length = sum(distance(a, b) for a, b in zip(points, points[1:]))
        elevation = tags.get('ele', '').strip()
        elevation_value = float(re.sub(r'\s*m$', '', elevation, flags=re.I)) if re.fullmatch(r'-?\d+(\.\d+)?\s*m?', elevation, re.I) else None
        min_zoom = (6.5 if elevation_value is not None and elevation_value >= 4000 else 8) if kind == 'peak' else 6 if length >= 30 else 7 if length >= 10 else 8 if length >= 2 else 9
        if kind == 'cliff':
            min_zoom = max(9, min_zoom)
        properties = {
            'id': key, 'name': name, 'originalName': original_name, 'hasChineseName': bool(chinese_name),
            'kind': kind, 'osmType': element['type'], 'osmId': element['id'], 'osmVersion': element.get('version', 0),
            'sourceId': source['id'], 'sourceUrl': f"https://www.openstreetmap.org/{element['type']}/{element['id']}",
            'modernReferenceOnly': True,
            'geometryNote': 'OSM现代山峰节点，保持来源坐标；不据此确认唐代名称或形态。' if kind == 'peak' else 'OSM现代' + KINDS[kind] + '完整way线，保持来源全部顶点；未经独立实测核验，不是山系范围或唐代复原。',
            'bounds': bounds(points), 'labelCoordinates': points[len(points) // 2],
            'minZoom': min_zoom, 'tags': tags,
        }
        if kind != 'peak':
            properties['mappedLengthKm'] = round(length, 3)
        if elevation_value is not None:
            properties['elevationMetres'] = elevation_value
        feature = {'type': 'Feature', 'id': key, 'geometry': geometry, 'properties': properties}
        assert feature['geometry'] == raw_geometry(element)[0]
        assert feature['properties']['tags'] == element.get('tags', {})
        features.append(feature)
    script = "import {Converter} from 'opencc-js/t2cn';let s='';for await(const c of process.stdin)s+=c;const cv=Converter({from:'t',to:'cn'});process.stdout.write(JSON.stringify(JSON.parse(s).map(cv)));"
    converted = subprocess.run(['node', '--input-type=module', '-e', script], input=json.dumps([f['properties']['name'] for f in features]), capture_output=True, text=True, cwd=ROOT, check=True)
    for feature, name in zip(features, json.loads(converted.stdout)):
        feature['properties']['name'] = name
    source_map = {s['id']: s for s in sources}
    packs, regions = [], []
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for region_id, (region_name, query_bounds) in fetch_config.REGIONS.items():
        region_features = [f for f in features if source_map[f['properties']['sourceId']]['regionId'] == region_id]
        regions.append({'id': region_id, 'name': region_name, 'bounds': query_bounds, 'featureCount': len(region_features), 'countsByKind': dict(Counter(f['properties']['kind'] for f in region_features))})
        for start in range(0, len(region_features), 750):
            part = region_features[start:start + 750]
            pack_id = f'{region_id}-{start // 750}'
            filename = f'{pack_id}.geojson.gz'
            encoded = (json.dumps({'type': 'FeatureCollection', 'features': part}, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n').encode()
            (OUTPUT / filename).write_bytes(gzip.compress(encoded, compresslevel=9, mtime=0))
            packs.append({'id': pack_id, 'regionId': region_id, 'url': '/data/mountain-detail/' + filename, 'bounds': bounds([point for f in part for point in [f['properties']['bounds'][:2], f['properties']['bounds'][2:]]]), 'featureCount': len(part), 'minZoom': min(f['properties']['minZoom'] for f in part)})
    counts = {kind: sum(f['properties']['kind'] == kind for f in features) for kind in KINDS}
    manifest = {'version': 'mountain-detail-1', 'acquisition': {'complete': not missing, 'missingTiles': missing}, 'featureCount': len(features), 'namedChineseCount': sum(f['properties']['hasChineseName'] for f in features), 'countsByKind': counts,
                'geometryNote': '现代OSM山脊、刃脊、陡崖ways及命名山峰，不是唐代复原。查询矩形仅说明采集区域；数据覆盖不完整，空白不代表没有山地。',
                'regions': regions, 'packs': packs, 'sources': sources}
    write(OUTPUT / 'manifest.json', manifest)
    write(EVIDENCE / 'validation.json', {'featureCount': len(features), 'countsByKind': counts, 'duplicateSourceCopies': duplicates, 'versionChoices': version_choices,
        'assertions': ['All source compressed, uncompressed and query SHA256 values match', 'All published IDs globally unique', 'All way coordinate sequences equal complete original OSM geometry and node counts', 'All peak coordinates equal original named OSM nodes', 'All tags equal original tags', 'No polygons, peak links, buffers, smoothing or invented ridge geometries'],
        'lengthMethod': 'Sum haversine distances along original vertices, radius 6371.0088 km; horizontal mapped line length, not terrain length or total mountain range length',
        'limitation': 'Checks source fidelity, not independent survey accuracy or Tang geography.'})
    print(json.dumps({'featureCount': len(features), 'countsByKind': counts, 'packs': len(packs), 'regions': regions}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--allow-missing', action='store_true', help='Interim UI integration only: explicitly mark missing query snapshots')
    build(parser.parse_args().allow_missing)
