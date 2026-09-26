#!/usr/bin/env python3
"""Audit Song entry coordinates against archived modern sampling windows.

Containment establishes acquisition coverage only. It is neither a completeness
claim for streams and peaks nor evidence of historical geography.
"""
from collections import Counter
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return json.loads((ROOT / path).read_text())


def digest(path):
    return hashlib.sha256((ROOT / path).read_bytes()).hexdigest()


def contains(bounds, point):
    return bounds[0] <= point[0] <= bounds[2] and bounds[1] <= point[1] <= bounds[3]


def distance_km(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, [*a, *b])
    h = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return 6371.0088 * 2 * math.asin(min(1, math.sqrt(h)))


def main():
    catalog = read('data/catalog.json')
    detail = read('public/data/tang-detail/manifest.json')
    terrain = read('public/data/mountain-shapes/manifest.json')
    ridge = read('public/data/mountain-detail/manifest.json')
    rivers = read('public/data/historical-rivers/manifest.json')
    rows = []
    used_regions = set()
    for place in catalog['places']:
        if 'song' not in place['periodIds']:
            continue
        point = place['coordinates']
        regions = [r['id'] for r in detail['modernCoverageRegions'] if contains(r['bounds'], point)]
        used_regions.update(regions)
        rows.append({'placeId': place['id'], 'name': place.get('nameByPeriod', {}).get('song', place['name']),
                     'coordinates': point, 'queryRegionIds': regions,
                     'pointCoveredByAcquisitionWindow': bool(regions),
                     'demAreaIdsAtCityCoordinate': [a['id'] for a in terrain['areas'] if contains(a['bounds'], point)],
                     'demAreaIdsWithin50km': [a['id'] for a in terrain['areas'] if distance_km(a['center'], point) <= 50]})
    sources = []
    for region_id in sorted(used_regions):
        path = f'data/evidence/tang-detail/osm/{region_id}-source.json'
        source = read(path)
        assert digest(source['snapshotPath']) == source['snapshotSha256'], region_id
        assert digest(source['queryPath']) == source['querySha256'], region_id
        sources.append({'regionId': region_id, 'metadataPath': path, 'metadataSha256': digest(path),
                        'snapshotPath': source['snapshotPath'], 'snapshotSha256': source['snapshotSha256']})
    counts = Counter()
    for pack in detail['modernRegions']:
        counts.update(pack['countsByKind'])
    epoch = next(e for e in rivers['epochs'] if e['startYear'] <= 1200 < e['endYear'])
    result = {
        'periodId': 'song', 'boundaryReferenceYear': 1200,
        'note': '城市坐标落入现代OSM查询框仅表示已采集该窗口，不表示所有河湖山峰已收录，不证明宋代河道、湖岸、山名或行政归属。等高线为局部现代DEM，山脊另用OSM来源；没有资料不等于没有山。',
        'catalogSha256': digest('data/catalog.json'),
        'detailManifestSha256': digest('public/data/tang-detail/manifest.json'),
        'terrainManifestSha256': digest('public/data/mountain-shapes/manifest.json'),
        'placeCount': len(rows), 'coveredPlaceCount': sum(r['pointCoveredByAcquisitionWindow'] for r in rows),
        'uncoveredPlaceIds': [r['placeId'] for r in rows if not r['pointCoveredByAcquisitionWindow']],
        'sharedModernFeatureCountsByKind': dict(counts),
        'sharedModernSamplingRegionCount': len(detail['modernCoverageRegions']),
        'sharedDemAreaCount': terrain['areaCount'], 'sharedContourCount': terrain['featureCount'],
        'sharedRidgeSamplingRegionCount': len(ridge['regions']), 'sharedRidgeFeatureCount': ridge['featureCount'],
        'yellowRiverEpochAt1200': epoch['id'],
        'yellowRiverGeometrySha256': epoch['geometrySha256'],
        'places': rows, 'sources': sources,
    }
    target = ROOT / 'data/evidence/song-natural-coverage.json'
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({key: value for key, value in result.items() if key not in ['places', 'sources']}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
