#!/usr/bin/env python3
"""Build local Tang seat points and modern OSM detail from archived real sources.

Requires pyshp, shapely. Historical points never originate from area centroids.
OSM polygons are assembled only from complete source ways; gaps are not closed.
"""
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import gzip
import io
import json
import math
import subprocess
import zipfile
import shapefile
from shapely.geometry import Point, LineString, Polygon, MultiPolygon, mapping
from shapely.ops import linemerge

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'data/evidence/tang-detail'
OUTPUT = ROOT / 'public/data/tang-detail'
YEARS = (741, 742, 755)
MAX_SOURCE_COORDINATE_DELTA = 0.02
sources = []


def write(path, value, compact=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, allow_nan=False,
                              indent=None if compact else 2,
                              separators=(',', ':') if compact else None) + '\n')


def write_gzip(path, value):
    encoded = (json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(',', ':')) + '\n').encode()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(gzip.compress(encoded, compresslevel=9, mtime=0))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def simplify_names(features):
    # Use the app's actual OpenCC dictionary for authored display fields only.
    fields = ('name', 'nameEn', 'subtype', 'presentLocation')
    values = [f['properties'].get(key, '') for f in features for key in fields]
    script = "import {Converter} from 'opencc-js/t2cn';let s='';for await(const c of process.stdin)s+=c;const cv=Converter({from:'t',to:'cn'});process.stdout.write(JSON.stringify(JSON.parse(s).map(v=>cv(v))));"
    result = subprocess.run(['node', '--input-type=module', '-e', script], input=json.dumps(values),
                            capture_output=True, text=True, check=True, cwd=ROOT)
    converted = iter(json.loads(result.stdout))
    for feature in features:
        for key in fields:
            value = next(converted)
            if key in feature['properties']:
                feature['properties'][key] = value


def historical():
    dictionary = json.loads((EVIDENCE / 'chgis/dictionary-extract.json').read_text())
    date_rules = {'1': '按跨朝代时段约定', '2': '按朝代约定', '3': '按年号或在位期约定',
                  '4': '明确到年', '5': '明确到季节或月', '6': '明确到日', '9': '资料单年切片'}
    features_by_year = {year: [] for year in YEARS}
    withheld = []
    for level, doi in [('county', 'Q9VOF5'), ('prefecture', 'WW1PD6')]:
        archive_path = EVIDENCE / 'chgis' / f'{level}-wgs84.zip'
        metadata = json.loads((EVIDENCE / 'chgis' / f'{level}-metadata.json').read_text())['data']['latestVersion']
        official = next(f['dataFile'] for f in metadata['files'] if 'utf_wgs84.zip' in f['dataFile']['filename'])
        assert hashlib.md5(archive_path.read_bytes()).hexdigest() == official['checksum']['value']
        source_id = f'chgis-v6-tang-detail-{level}'
        sources.append({
            'id': source_id, 'title': f'CHGIS V6 时序{"县级" if level == "county" else "府级"}治所点',
            'url': f'https://doi.org/10.7910/DVN/{doi}',
            'retrievedAt': datetime.fromtimestamp(archive_path.stat().st_mtime, timezone.utc).isoformat(),
            'snapshotPath': str(archive_path.relative_to(ROOT)), 'snapshotSha256': digest(archive_path),
            'license': 'CHGIS V6：学术研究与非商业使用；原README限制再分发。县点网页CC0元数据与README冲突，须保留说明并在公开分发前复核。',
            'attribution': 'CHGIS, Version 6. Fairbank Center for Chinese Studies, Harvard University; Center for Historical Geographical Studies, Fudan University, 2016.',
            'note': '来自官方WGS84 POINT图层。按原始起讫年闭区间筛选；公开说明1350年前覆盖仍有缺口。保留年代规则，未将羁縻或周边单位统一归为唐直辖。',
        })
        archive = zipfile.ZipFile(archive_path)
        reader = shapefile.Reader(**{Path(name).suffix[1:]: io.BytesIO(archive.read(name))
                                     for name in archive.namelist() if name.endswith(('.shp', '.shx', '.dbf'))}, encoding='utf-8')
        assert reader.shapeType == shapefile.POINT
        for record in reader.iterShapeRecords():
            original = record.record.as_dict()
            begin, end = original['BEG_YR'], original['END_YR']
            if not isinstance(begin, int) or not isinstance(end, int):
                continue
            included_years = [year for year in YEARS if begin <= year <= end]
            if not included_years:
                continue
            assert record.record.oid == record.shape.oid
            coordinate = [round(value, 6) for value in record.shape.points[0]]
            source_coordinate = [original['X_COOR'], original['Y_COOR']]
            delta = max(abs(a-b) for a, b in zip(coordinate, source_coordinate))
            if delta > MAX_SOURCE_COORDINATE_DELTA:
                withheld.append({'level': level, 'sourceRecordId': str(original['SYS_ID']), 'years': included_years,
                                 'recordIndex': record.record.oid, 'shapeCoordinates': coordinate,
                                 'fieldCoordinates': source_coordinate, 'maxDeltaDegrees': delta,
                                 'reason': 'SHP与同条经纬度属性差超过0.02度；保留隔离，不猜选哪个为正确古址。',
                                 'sourceRecord': original})
                continue
            ident = f'chgis-{level}-{original["SYS_ID"]}'
            for year in included_years:
                note = ('CHGIS历史治所点，保留官方WGS84点几何；不从行政区面取中心。'
                        '坐标是历史GIS资料定位，未经本项目独立考古核验；原图层可能含羁縻与周边单位。'
                        '起讫年只按来源记录筛选，未推定为全年无争议存在。')
                properties = {'id': ident, 'name': original['NAME_CH'], 'nameEn': original['NAME_PY'],
                              'kind': 'settlement', 'subtype': original['TYPE_CH'], 'sourceId': source_id,
                              'sourceDataset': 'CHGIS V6 Time Series Points',
                              'sourceUrl': f'https://doi.org/10.7910/DVN/{doi}', 'modernReferenceOnly': False,
                              'geometryNote': note, 'minZoom': 7.2 if level == 'county' else 6.0,
                              'bounds': coordinate + coordinate, 'labelCoordinates': coordinate,
                              'year': year, 'level': level, 'sourceRecordId': str(original['SYS_ID']),
                              'beginYear': begin, 'endYear': end,
                              'beginRule': date_rules.get(original['BEG_RULE'], '来源未给定或未定义规则'),
                              'endRule': date_rules.get(original['END_RULE'], '来源未给定或未定义规则'),
                              'presentLocation': original['PRES_LOC'], 'sourceRecord': original}
                features_by_year[year].append({'type': 'Feature', 'id': ident, 'properties': properties,
                                              'geometry': {'type': 'Point', 'coordinates': coordinate}})
    statistics = {}
    for year, features in features_by_year.items():
        simplify_names(features)
        write(OUTPUT / f'settlements-{year}.geojson', {'type': 'FeatureCollection', 'features': features}, compact=True)
        counts = Counter(f['properties']['level'] for f in features)
        statistics[year] = {'year': year, 'url': f'/data/tang-detail/settlements-{year}.geojson',
                            'featureCount': len(features), 'countyCount': counts['county'], 'prefectureCount': counts['prefecture'],
                            'withheldCount': sum(year in f['years'] for f in withheld),
                            'note': '按官方时序点起讫年筛选，不代表唐代全部城镇；保留原分类，部分记录年代较宽。明显坐标字段冲突的记录另存审计、未进入地图。'}
    write(EVIDENCE / 'chgis/withheld-coordinate-conflicts.json', {'thresholdDegrees': MAX_SOURCE_COORDINATE_DELTA, 'records': withheld})
    write(EVIDENCE / 'chgis/selection-validation.json', {'years': list(statistics.values()), 'dateRules': dictionary['xtra_date_rules.xlsx'], 'coordinateChoice': 'Original SHP POINT geometry rounded to six decimals; records conflicting with DBF coordinates by >0.02 degree withheld. Direct SHP/DBF indices matched; no deleted records.'})
    return statistics[755]


def points(raw):
    return [(point['lon'], point['lat']) for point in raw if 'lon' in point and 'lat' in point]


def water_polygon(element):
    if element['type'] == 'way':
        coordinates = points(element.get('geometry', []))
        if len(coordinates) < 4 or coordinates[0] != coordinates[-1]:
            raise ValueError('Water way is not a closed ring')
        polygon = Polygon(coordinates)
    else:
        rings = {'outer': [], 'inner': []}
        for member in element.get('members', []):
            if member['type'] != 'way' or member.get('role', '') not in ('outer', 'inner', ''):
                continue
            coordinates = points(member.get('geometry', []))
            if len(coordinates) < 2:
                raise ValueError('Missing multipolygon member geometry')
            rings['inner' if member.get('role') == 'inner' else 'outer'].append(LineString(coordinates))
        polygons = {}
        for role, lines in rings.items():
            polygons[role] = []
            if not lines:
                continue
            merged = linemerge(lines)
            for line in ([merged] if merged.geom_type == 'LineString' else list(merged.geoms)):
                if not line.is_ring:
                    raise ValueError('Multipolygon member ways do not form a complete ring')
                polygons[role].append(Polygon(line.coords))
        if not polygons['outer']:
            raise ValueError('No complete outer ring')
        result = []
        for outer in polygons['outer']:
            holes = [list(inner.exterior.coords) for inner in polygons['inner'] if outer.contains(inner)]
            result.append(Polygon(outer.exterior.coords, holes))
        for inner in polygons['inner']:
            if not any(outer.contains(inner) for outer in polygons['outer']):
                raise ValueError('Inner ring has no containing outer ring')
        polygon = result[0] if len(result) == 1 else MultiPolygon(result)
    if polygon.is_empty or not polygon.is_valid:
        raise ValueError('Invalid water polygon; no synthetic repair applied')
    return polygon


def modern():
    regions = []
    globally_included_ids = set()
    # Keep original six-region order and all existing IDs/pack bytes stable as
    # additional areas are added. New western regions follow original sources.
    metadata_paths = sorted((EVIDENCE / 'osm').glob('*-source.json'),
                            key=lambda p: (2 if p.name.startswith('city-') else 1 if p.name.startswith('west-') else 0, p.name))
    for metadata_path in metadata_paths:
        meta = json.loads(metadata_path.read_text())
        source_path = ROOT / meta['snapshotPath']
        assert digest(source_path) == meta['snapshotSha256']
        raw = json.loads(gzip.decompress(source_path.read_bytes()) if source_path.suffix == '.gz' else source_path.read_text())
        assert not raw.get('remark')
        source_id = meta['id']
        region_id = metadata_path.name.removesuffix('-source.json')
        sources.append({key: meta[key] for key in ('id', 'title', 'url', 'retrievedAt', 'snapshotPath', 'snapshotSha256', 'license', 'attribution', 'note')})
        features, rejected = [], []
        cross_region_duplicates = 0
        represented_water_ways = set()
        # Relations first so simple outer ways do not duplicate successful surfaces.
        elements = sorted(raw['elements'], key=lambda item: item['type'] != 'relation')
        for element in elements:
            tags = element.get('tags', {})
            etype, eid = element['type'], element['id']
            if (etype, eid) in globally_included_ids:
                cross_region_duplicates += 1
                continue
            try:
                if tags.get('natural') in ('peak', 'saddle') and etype == 'node':
                    kind = tags['natural']; geometry = Point(element['lon'], element['lat'])
                elif tags.get('natural') == 'water' or tags.get('waterway') == 'riverbank':
                    if etype == 'way' and eid in represented_water_ways:
                        continue
                    kind = 'water'; geometry = water_polygon(element)
                    if etype == 'relation':
                        represented_water_ways.update(m['ref'] for m in element['members'] if m['type'] == 'way')
                elif etype == 'way' and tags.get('waterway') in ('river', 'stream', 'canal'):
                    kind = tags['waterway']; coordinates = points(element.get('geometry', []))
                    if len(coordinates) < 2:
                        raise ValueError('Line contains fewer than two coordinates')
                    geometry = LineString(coordinates)
                else:
                    continue
                if geometry.is_empty or not geometry.is_valid:
                    raise ValueError('Invalid geometry')
                subtype = tags.get('water') or tags.get('waterway') or tags.get('natural', '')
                fallback = {'river': '未命名河流', 'stream': '未命名溪流', 'canal': '未命名水渠',
                            'water': '未命名水面', 'peak': '未命名山峰', 'saddle': '未命名山口'}[kind]
                name = tags.get('name:zh-Hans') or tags.get('name:zh') or tags.get('name') or fallback
                anchor = geometry if geometry.geom_type == 'Point' else geometry.interpolate(.5, normalized=True) if geometry.geom_type == 'LineString' else geometry.representative_point()
                min_zoom = {'river': 8, 'stream': 10.5, 'canal': 10, 'water': 9, 'peak': 10, 'saddle': 11}[kind]
                if kind == 'water':
                    area_km2 = geometry.area * 111.32 ** 2 * math.cos(math.radians(anchor.y))
                    min_zoom = 8 if area_km2 >= 1 else 9 if area_km2 >= .05 else 10.5 if area_km2 >= .005 else 12
                ident = f'osm-{etype}-{eid}'
                properties = {'id': ident, 'name': name, 'nameEn': tags.get('name:en', ''), 'kind': kind,
                              'subtype': subtype, 'sourceId': source_id, 'sourceDataset': 'OpenStreetMap',
                              'sourceUrl': f'https://www.openstreetmap.org/{etype}/{eid}',
                              'modernReferenceOnly': True, 'geometryNote': '现代OSM原始几何；水面仅拼合完整成员环，未平滑、补画或缓冲。仅供现代地理参照，不是唐代河道、湖岸或工程。',
                              'minZoom': min_zoom, 'bounds': list(geometry.bounds), 'labelCoordinates': [anchor.x, anchor.y],
                              'osmType': etype, 'osmId': eid, 'tags': tags}
                if region_id.startswith(('west-', 'city-')):
                    source_conditions = []
                    if tags.get('location') == 'underground' or tags.get('canal') == 'qanat':
                        source_conditions.append('地下水渠，不能作为地表河流理解')
                    if tags.get('status') == 'abandoned' or tags.get('abandoned') == 'yes':
                        source_conditions.append('源标签标为已废弃')
                    if tags.get('intermittent') == 'yes':
                        source_conditions.append('间歇性水道或水面，不表示全年有水')
                    if source_conditions:
                        properties['geometryNote'] += '来源补充：' + '；'.join(source_conditions) + '。'
                features.append({'type': 'Feature', 'id': ident, 'properties': properties, 'geometry': mapping(geometry)})
                globally_included_ids.add((etype, eid))
            except (ValueError, KeyError) as error:
                rejected.append({'osmType': etype, 'osmId': eid, 'reason': str(error)})
        simplify_names(features)
        # Original line/area geometries are never clipped to grid boundaries.
        # The manifest uses each pack's actual feature bounds, so a feature whose
        # anchor lies outside the viewport is still discoverable by intersection.
        packs = {'overview': []}
        for feature in features:
            properties = feature['properties']
            if properties['kind'] == 'river' or properties['kind'] == 'water' and properties['minZoom'] <= 9:
                key = 'overview'
            else:
                longitude, latitude = properties['labelCoordinates']
                key = f'{math.floor(longitude * 2)}-{math.floor(latitude * 2)}'
                packs.setdefault(key, [])
            packs[key].append(feature)
        bounded_packs = {}
        for key, pack in packs.items():
            part = []; part_bytes = 0; part_number = 0
            for feature in pack:
                size = len(json.dumps(feature, ensure_ascii=False, separators=(',', ':')).encode()) + 1
                assert size < 8_000_000, f'Single OSM object exceeds 8MB; needs separate geometry streaming: {feature["id"]}'
                if part and part_bytes + size > 8_000_000:
                    bounded_packs[f'{key}-part{part_number}'] = part
                    part = []; part_bytes = 0; part_number += 1
                part.append(feature); part_bytes += size
            if part:
                bounded_packs[f'{key}-part{part_number}'] = part
        for key, pack in bounded_packs.items():
            if not pack:
                continue
            pack_id = f'{region_id}-{key}'
            write_gzip(OUTPUT / f'modern-{pack_id}.geojson.gz', {'type': 'FeatureCollection', 'features': pack})
            uncompressed_previous = OUTPUT / f'modern-{pack_id}.geojson'
            if uncompressed_previous.exists():
                uncompressed_previous.unlink()
            bounds = [min(f['properties']['bounds'][0] for f in pack), min(f['properties']['bounds'][1] for f in pack),
                      max(f['properties']['bounds'][2] for f in pack), max(f['properties']['bounds'][3] for f in pack)]
            regions.append({'id': pack_id, 'name': meta['title'].split('：', 1)[-1] + (' · 主河与水面' if key.startswith('overview') else ' · 局部细节'), 'bounds': bounds,
                            'url': f'/data/tang-detail/modern-{pack_id}.geojson.gz', 'featureCount': len(pack),
                            'countsByKind': dict(Counter(f['properties']['kind'] for f in pack)),
                            'minZoom': 8 if key.startswith('overview') else 10, 'sourceId': source_id, 'regionId': region_id})
        write(EVIDENCE / 'osm' / f'{region_id}-conversion.json', {'featureCount': len(features), 'countsByKind': dict(Counter(f['properties']['kind'] for f in features)), 'rejected': rejected, 'sourceMemberWayDuplicatesSuppressed': len(represented_water_ways), 'crossRegionDuplicateIdsSuppressed': cross_region_duplicates, 'geometryPolicy': 'Unsmoothed original coordinate sequences; exact endpoint line merging for complete water rings. No guessed closing edges, buffers or polygon repair.'})
        previous_monolithic = OUTPUT / f'modern-{region_id}.geojson'
        if previous_monolithic.exists():
            previous_monolithic.unlink()
    return regions


def modern_coverage(regions):
    coverage = []
    for metadata_path in sorted((EVIDENCE / 'osm').glob('*-source.json')):
        meta = json.loads(metadata_path.read_text())
        bounds = meta['bounds']
        # Global ID deduplication can place an overlapping area's rivers in an
        # adjacent region's pack. Include those packs in the completeness gate.
        ids = [p['id'] for p in regions if p['minZoom'] == 8
               and p['bounds'][0] <= bounds[2] and p['bounds'][2] >= bounds[0]
               and p['bounds'][1] <= bounds[3] and p['bounds'][3] >= bounds[1]]
        coverage.append({'id': metadata_path.name.removesuffix('-source.json'),
                         'name': meta['title'].split('：', 1)[-1], 'bounds': bounds,
                         'packageIds': ids, 'minZoom': 8})
    return coverage


if __name__ == '__main__':
    OUTPUT.mkdir(parents=True, exist_ok=True)
    history = historical()
    regions = modern()
    manifest = {'version': 'tang-detail-1', 'historical': history, 'modernRegions': regions,
                'modernCoverageRegions': modern_coverage(regions), 'sources': sources}
    write(OUTPUT / 'manifest.json', manifest)
    print(json.dumps({'historical': history, 'modernPacks': len(regions), 'modernFeatureCopies': sum(p['featureCount'] for p in regions), 'sourceCount': len(sources)}, ensure_ascii=False, indent=2))
