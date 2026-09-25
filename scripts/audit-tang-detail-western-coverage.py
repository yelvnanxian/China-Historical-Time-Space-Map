#!/usr/bin/env python3
"""Audit western source/package coverage and small views around existing cities.

This creates an audit report only, never inferred river or settlement geometry.
Requires shapely; runs entirely against saved source and published files.
"""
from collections import Counter
from pathlib import Path
import gzip
import hashlib
import json
from shapely.geometry import shape, box
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'data/evidence/tang-detail'
OUTPUT = ROOT / 'public/data/tang-detail'


def main():
    manifest = json.loads((OUTPUT / 'manifest.json').read_text())
    baseline = json.loads((EVIDENCE / 'western-expansion-baseline.json').read_text())
    catalog = json.loads((ROOT / 'data/catalog.json').read_text())
    historical = json.loads((OUTPUT / 'settlements-755.geojson').read_text())
    coverage = [region for region in manifest['modernCoverageRegions'] if region['id'].startswith(('west-', 'city-'))]
    regions = []
    western_features = []
    for region in coverage:
        packs = [pack for pack in manifest['modernRegions'] if pack['regionId'] == region['id']]
        metadata = json.loads((EVIDENCE / 'osm' / f'{region["id"]}-source.json').read_text())
        counts = Counter()
        for pack in packs:
            data = json.loads(gzip.decompress((ROOT / ('public' + pack['url'])).read_bytes()))
            western_features.extend(data['features'])
            counts.update(feature['properties']['kind'] for feature in data['features'])
        regions.append({'id': region['id'], 'name': region['name'], 'queryBounds': region['bounds'],
                        'sourceElements': metadata['elementCount'], 'publishedFeatures': sum(counts.values()),
                        'countsByKind': dict(counts), 'packageCount': len(packs),
                        'sourceGzipBytes': (ROOT / metadata['snapshotPath']).stat().st_size,
                        'publicGzipBytes': sum((ROOT / ('public' + pack['url'])).stat().st_size for pack in packs)})
    water_features = [feature for feature in western_features if feature['properties']['kind'] in ('river', 'stream', 'canal', 'water')]
    geometries = [shape(feature['geometry']) for feature in water_features]
    tree = STRtree(geometries)
    focus_points = []
    for place in catalog['places']:
        if 'tang' not in place['periodIds']:
            continue
        if any(box(*region['bounds']).covers(shape({'type': 'Point', 'coordinates': place['coordinates']})) for region in coverage):
            focus_points.append({'id': place['id'], 'name': place['name'], 'coordinates': place['coordinates'], 'coordinateSource': '既有城镇入口，位置角色以原档案说明为准'})
    # Add actual official source point examples where the editorial catalog has
    # no city entrance. Never create a new historical point from a modern town.
    for feature in historical['features']:
        if feature['properties']['name'] in ('金城郡', '天水郡'):
            focus_points.append({'id': feature['properties']['id'], 'name': feature['properties']['name'],
                                 'coordinates': feature['geometry']['coordinates'], 'coordinateSource': '已审核CHGIS官方755年POINT记录'})
    examples = []
    for focus in focus_points:
        longitude, latitude = focus['coordinates']
        viewport = box(longitude - .04, latitude - .03, longitude + .04, latitude + .03)
        indices = [int(index) for index in tree.query(viewport, predicate='intersects')]
        features = [water_features[index] for index in indices]
        counts = Counter(feature['properties']['kind'] for feature in features)
        surface = [feature for feature in features if feature['properties'].get('tags', {}).get('location') != 'underground'
                   and feature['properties'].get('tags', {}).get('canal') != 'qanat'
                   and feature['properties'].get('tags', {}).get('status') != 'abandoned']
        examples.append({**focus, 'sampleViewBounds': list(viewport.bounds), 'visibleAtZoom14': sum(feature['properties']['minZoom'] <= 14 for feature in features),
                         'surfaceWaterVisibleAtZoom14': sum(feature['properties']['minZoom'] <= 14 for feature in surface),
                         'countsByKind': dict(counts), 'namedWaterExamples': sorted(set(feature['properties']['name'] for feature in features if not feature['properties']['name'].startswith('未命名')))[:12],
                         'sampleFeatureIds': [feature['properties']['id'] for feature in features[:12]]})
    current_packs = {pack['id']: pack for pack in manifest['modernRegions']}
    preserved = []
    for original in baseline['packages']:
        current = current_packs.get(original['id'])
        assert current == {key: value for key, value in original.items() if key != 'sha256'}, original['id']
        assert hashlib.sha256((ROOT / ('public' + original['url'])).read_bytes()).hexdigest() == original['sha256'], original['id']
        preserved.append(original['id'])
    public_bytes = sum(path.stat().st_size for path in OUTPUT.rglob('*') if path.is_file())
    source_bytes = sum(path.stat().st_size for path in EVIDENCE.rglob('*') if path.is_file())
    western_count = sum(region['publishedFeatures'] for region in regions if region['id'].startswith('west-'))
    city_count = sum(region['publishedFeatures'] for region in regions if region['id'].startswith('city-'))
    report = {'newQueryRegions': regions, 'westernPublishedFeatureCount': western_count,
              'cityCloseupPublishedFeatureCount': city_count, 'allNewPublishedFeatureCount': len(western_features),
              'smallViewsAtExistingEntrances': examples,
              'maximumWesternFeatureMinZoom': max(feature['properties']['minZoom'] for feature in western_features),
              'preservedOriginalPackageCount': len(preserved), 'preservedOriginalPackageIds': preserved,
              'publicDirectoryBytes': public_bytes, 'evidenceDirectoryBytes': source_bytes,
              'coverageFindings': ['旧六区均未覆盖本次西部城市；空白不能通过继续提高zoom消除。',
                                   '细节源minZoom最高为12，zoom14不存在进一步因minZoom被隐藏的水系记录。',
                                   'OSM无名称地物仍保留几何；不应因标签缺失当作没有水。',
                                   '查询范围只说明采集范围，不证明每处均有OSM细河。不能按query bbox整体删除粗河线。',
                                   '建议仅按同河明确名称及已实际加载几何做局部替代；无匹配细线时保留概览参照。',
                                   '沙漠、绿洲与高原的OSM调查密度不一，间歇河标签不代表唐代水量；走廊之间大片西部仍未采集。'],
              'smallViewMethod': '在既有入口/官方点周围取经度±0.04、纬度±0.03的小视野检查真实线面交集；只是放大视野样本，不是城市界线或唐代水系范围。'}
    assert source_bytes < 120_000_000, source_bytes
    assert public_bytes < 80_000_000, public_bytes
    (EVIDENCE / 'western-detail-coverage-validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'regions': len(regions), 'westernFeatures': western_count, 'cityCloseupFeatures': city_count, 'publicMB': public_bytes / 1e6,
                      'evidenceMB': source_bytes / 1e6, 'originalPacksPreserved': len(preserved),
                      'surfaceSmallViewCounts': {item['name']: item['surfaceWaterVisibleAtZoom14'] for item in examples}}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
