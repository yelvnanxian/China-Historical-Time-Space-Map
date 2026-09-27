#!/usr/bin/env python3
"""Build the 1200 CHGIS seat-point slice offline using only Python's stdlib.

SHP points, original DBF fields and archive hashes are retained. No polygon
centroids, nearest-neighbour links, synthetic coordinates or name deduplication.
"""
from collections import Counter, defaultdict
from pathlib import Path
import hashlib
import json
import math
import re
import struct
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / 'data/evidence/tang-detail/chgis'
OUTPUT = ROOT / 'public/data/song-settlements'
AUDIT = ROOT / 'data/evidence/song-settlements'
YEAR = 1200
MAX_DELTA = 0.02
DATE_RULES = {'1': '按跨朝代时段约定', '2': '按朝代约定', '3': '按年号或在位期约定',
              '4': '明确到年', '5': '明确到季节或月', '6': '明确到日', '9': '资料单年切片'}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write(path, data, compact=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, allow_nan=False,
                              indent=None if compact else 2,
                              separators=(',', ':') if compact else None) + '\n')


def read_original_points(archive_path):
    """Read DBF and SHP in lockstep; deleted or non-point rows cannot shift IDs."""
    with zipfile.ZipFile(archive_path) as archive:
        members = {Path(name).suffix: archive.read(name) for name in archive.namelist()}
    dbf, shp = members['.dbf'], members['.shp']
    assert struct.unpack_from('<I', shp, 32)[0] == 1, 'Source must be POINT'
    count, header_length, row_length = struct.unpack_from('<IHH', dbf, 4)
    fields, offset = [], 32
    while dbf[offset] != 13:
        name = dbf[offset:offset + 11].split(b'\0')[0].decode('ascii')
        fields.append((name, chr(dbf[offset + 11]), dbf[offset + 16], dbf[offset + 17]))
        offset += 32
    shape_offset, records = 100, []
    for index in range(count):
        row_start = header_length + index * row_length
        assert dbf[row_start] != 0x2a, 'Deleted DBF row would invalidate source alignment'
        offset, original = row_start + 1, {}
        for name, kind, width, decimals in fields:
            value = dbf[offset:offset + width].decode('utf-8').strip()
            if kind in ('N', 'F'):
                if not value:
                    value = None
                elif re.fullmatch(r'[+-]?\d+(?:\.\d+)?', value):
                    value = float(value) if decimals or kind == 'F' else int(value)
            original[name] = value
            offset += width
        assert struct.unpack_from('>I', shp, shape_offset)[0] == index + 1
        assert struct.unpack_from('<I', shp, shape_offset + 8)[0] == 1
        coordinates = list(struct.unpack_from('<dd', shp, shape_offset + 12))
        shape_offset += 8 + struct.unpack_from('>I', shp, shape_offset + 4)[0] * 2
        records.append((index, original, coordinates))
    assert shape_offset == len(shp), 'SHP/DBF record count disagreement'
    return records


def contains(point, geometry):
    """Diagnostic only, called after reviewed documentary identity links exist."""
    def ring_contains(ring):
        inside = False
        for a, b in zip(ring, ring[1:] + ring[:1]):
            if (a[1] > point[1]) != (b[1] > point[1]) and point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]:
                inside = not inside
        return inside
    polygons = [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates']
    return any(ring_contains(polygon[0]) and not any(ring_contains(hole) for hole in polygon[1:]) for polygon in polygons)


def main():
    features, withheld, sources, input_hashes, source_counts, selection_counts = [], [], [], {}, {}, {}
    date_rejected = []
    for level, doi in [('county', 'Q9VOF5'), ('prefecture', 'WW1PD6')]:
        archive_path = INPUT / f'{level}-wgs84.zip'
        metadata_path = INPUT / f'{level}-metadata.json'
        metadata = json.loads(metadata_path.read_text())['data']['latestVersion']
        official = next(item['dataFile'] for item in metadata['files'] if 'utf_wgs84.zip' in item['dataFile']['filename'])
        assert hashlib.md5(archive_path.read_bytes()).hexdigest() == official['checksum']['value']
        for file in [archive_path, metadata_path]:
            input_hashes[str(file.relative_to(ROOT))] = digest(file)
        source_id = f'chgis-v6-song-settlements-{level}'
        sources.append({
            'id': source_id, 'title': f'CHGIS V6 时序{"县级" if level == "county" else "府级"}治所点',
            'url': f'https://doi.org/10.7910/DVN/{doi}',
            'snapshotPath': str(archive_path.relative_to(ROOT)), 'snapshotSha256': digest(archive_path),
            'metadataPath': str(metadata_path.relative_to(ROOT)), 'metadataSha256': digest(metadata_path),
            'license': '保留原CHGIS V6 README及Harvard Dataverse元数据条款；本项目使用已归档来源，未改写原声明。',
            'attribution': 'CHGIS, Version 6. Fairbank Center for Chinese Studies, Harvard University; Center for Historical Geographical Studies, Fudan University, 2016.',
            'note': '官方WGS84 POINT图层。1350年前公开说明仍有覆盖缺口；县/府为源文件分组，实际行政类型另列。源点没有政权与隶属字段，不能把所有1200年点视为南宋治所。',
        })
        records = read_original_points(archive_path)
        source_counts[level] = len(records)
        selection_counts[level] = 0
        seen_ids = set()
        for index, original, original_coordinates in records:
            record_id = str(original['SYS_ID'])
            begin, end = original['BEG_YR'], original['END_YR']
            if not isinstance(begin, int) or not isinstance(end, int) or begin > end:
                date_rejected.append({'level': level, 'recordIndex': index, 'sourceRecordId': record_id,
                                      'reason': '起讫年缺失、非整数或逆序，不能判断1200年是否有效。', 'sourceRecord': original})
                continue
            if not begin <= YEAR <= end:
                continue
            assert record_id not in seen_ids, f'Duplicate selected source ID: {level} {record_id}'
            seen_ids.add(record_id)
            selection_counts[level] += 1
            coordinates = [round(value, 6) for value in original_coordinates]
            fields = [original['X_COOR'], original['Y_COOR']]
            reasons = []
            if len(coordinates) != 2 or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in coordinates + fields):
                reasons.append('坐标缺失或非有限数值。')
            elif not (-180 <= coordinates[0] <= 180 and -90 <= coordinates[1] <= 90):
                reasons.append('源SHP经纬度超出WGS84有效范围。')
            elif max(abs(a - b) for a, b in zip(coordinates, fields)) > MAX_DELTA:
                reasons.append('SHP与同条经纬度属性差超过0.02度；隔离，不猜选哪个为正确古址。')
            name = original['NAME_CH']
            if not isinstance(name, str) or not re.search(r'[\u3400-\u9fff]', name) or re.search(r'[A-Za-z\u0400-\u04ff]', name):
                reasons.append('源中文名称缺失或混入未核定外文，不自行翻译。')
            begin_rule, end_rule = str(original['BEG_RULE'] or ''), str(original['END_RULE'] or '')
            if '9' in (begin_rule, end_rule) and begin != end:
                reasons.append('日期规则9定义为单年切片，但起讫年不相同；来源定年规则内部冲突。')
            if reasons:
                withheld.append({'level': level, 'sourceRecordId': record_id, 'recordIndex': index,
                                 'originalCoordinates': original_coordinates, 'shapeCoordinates': coordinates,
                                 'fieldCoordinates': fields, 'reasons': reasons, 'sourceRecord': original})
                continue
            status = 'specified-endpoints' if begin_rule in ('4', '5', '6', '9') and end_rule in ('4', '5', '6', '9') else 'incomplete-date-rules' if begin_rule not in DATE_RULES or end_rule not in DATE_RULES else 'broad-endpoints'
            caution = {
                'specified-endpoints': '来源起讫端点有明确年、月或日规则；按1200年落入闭区间筛选，仍未经逐年独立核验。',
                'broad-endpoints': '至少一个端点按朝代、跨朝代或年号时段约定；仅作1200年时序候选，不能据此断言全年确定存在。',
                'incomplete-date-rules': '至少一个端点的日期规则缺失或未定义；仅按来源起讫年筛为1200年候选，具体定年仍待核。',
            }[status]
            ident = f'chgis-song-{level}-{record_id}'
            properties = {
                'id': ident, 'name': name, 'sourceName': name, 'level': level, 'subtype': original['TYPE_CH'],
                'year': YEAR, 'sourceId': source_id, 'sourceRecordId': record_id, 'sourceRecordIndex': index,
                'sourceUrl': f'https://doi.org/10.7910/DVN/{doi}', 'beginYear': begin, 'endYear': end,
                'beginRuleCode': begin_rule, 'endRuleCode': end_rule,
                'beginRule': DATE_RULES.get(begin_rule, '来源未给定或未定义规则'),
                'endRule': DATE_RULES.get(end_rule, '来源未给定或未定义规则'),
                'dateStatus': status, 'dateCaution': caution, 'presentLocation': original['PRES_LOC'],
                'geometryNote': '保留CHGIS官方WGS84原始治所POINT几何，仅舍入至六位小数。SHP与DBF相符不证明古址准确；不是面中心、标签点或现代城镇替身。',
                'coordinateStatus': 'source-fields-consistent', 'originalCoordinates': original_coordinates,
                'fieldCoordinates': fields, 'minZoom': 8 if level == 'county' else 6,
                'sourceRecord': original,
                'polityNote': '源点没有政权或上级隶属字段，尚未逐条核定1200年政治归属；“宋代同期”不表示属于南宋。',
            }
            features.append({'type': 'Feature', 'id': ident, 'properties': properties,
                             'geometry': {'type': 'Point', 'coordinates': coordinates}})
    fields = ('name', 'subtype', 'presentLocation')
    values = [feature['properties'][field] for feature in features for field in fields]
    code = "import {Converter} from 'opencc-js/t2cn';let s='';for await(const c of process.stdin)s+=c;const cv=Converter({from:'t',to:'cn'});process.stdout.write(JSON.stringify(JSON.parse(s).map(v=>cv(v))));"
    result = subprocess.run(['node', '--input-type=module', '-e', code], input=json.dumps(values), capture_output=True, text=True, check=True, cwd=ROOT)
    converted = iter(json.loads(result.stdout))
    for feature in features:
        for field in fields:
            feature['properties'][field] = next(converted)

    # The source lacks parent and polity columns. Only these individually
    # inspected source IDs, source names, exact modern-location strings and
    # already documented identities are linked. No bulk name or spatial joins.
    reviewed = [
        ('prefecture', '210115', '大同府', '今山西大同市', 'datong'),
        ('prefecture', '210451', '济南府', '今山东省济南市治', 'qizhou-jinan'),
        ('prefecture', '210727', '开封府', '今河南省开封市', 'kaifeng'),
        ('prefecture', '210886', '河南府', '今河南省洛阳市东北', 'luoyang'),
        ('prefecture', '211263', '重庆府', '今四川省重庆市', 'yuzhou-chongqing'),
        ('prefecture', '211437', '京兆府', '今陕西西安市北', 'changan'),
        ('prefecture', '34346', '襄阳府', '今湖北襄樊市汉水南襄城区', 'xiangyang'),
        ('prefecture', '34367', '鄂州', '今湖北武汉市武昌', 'ezhou-jiangxia'),
        ('prefecture', '34433', '江陵府', '今湖北省江陵县', 'jingzhou'),
        ('prefecture', '32075', '泉州', '福建省泉州市', 'quanzhou'),
        ('prefecture', '32089', '福州', '福建省福州市老城区', 'fuzhou-fujian'),
        ('prefecture', '32168', '庆元府', '今浙江宁波市', 'mingzhou'),
        ('prefecture', '32297', '建康府', '今江苏南京市', 'nanjing'),
        ('prefecture', '32344', '临安府', '今浙江杭州市', 'hangzhou'),
        ('prefecture', '32073', '平江府', '今江苏苏州市区', 'suzhou'),
        ('prefecture', '32589', '隆兴府', '江西南昌市', 'hongzhou'),
        ('prefecture', '34004', '广州', '广东省广州市', 'guangzhou'),
        ('prefecture', '33345', '扬州', '江苏扬州市', 'yangzhou'),
        ('county', '95597', '平晋县', '今山西太原市小店区城西村一带', 'jinyang'),
        ('county', '85235', '临淄县', '今山东淄博市临淄区北东、西古城', 'linzi'),
    ]
    research_path = ROOT / 'public/data/song-boundary-research.json'
    research = json.loads(research_path.read_text())
    input_hashes[str(research_path.relative_to(ROOT))] = digest(research_path)
    models = {}
    for level in ('county', 'prefecture'):
        model_path = ROOT / f'public/data/boundaries/hartwell-1200-{level}.geojson'
        input_hashes[str(model_path.relative_to(ROOT))] = digest(model_path)
        models.update({feature['properties']['id']: feature for feature in json.loads(model_path.read_text())['features']})
    link_audit = []
    by_id = {feature['properties']['id']: feature for feature in features}
    for level, record_id, name, modern_location, place_id in reviewed:
        feature = by_id[f'chgis-song-{level}-{record_id}']
        p = feature['properties']
        assert p['sourceName'] == name and p['sourceRecord']['PRES_LOC'] == modern_location
        assert p['subtype'] == ('县' if level == 'county' else '府' if name.endswith('府') else '州')
        linked = [record for record in research['byBoundary'].values() if record['catalogPlaceId'] == place_id]
        assert len(linked) == 1
        link = linked[0]
        assert link['researchName'] == name and link['modelYear'] == YEAR and link['modelLevel'] == level
        assert link['historicalResearch'] and all(finding['evidence'] for entry in link['historicalResearch'] for finding in entry['findings'])
        model = models[link['boundaryId']]
        inside = contains(feature['geometry']['coordinates'], model['geometry'])
        p.update({
            'catalogPlaceId': place_id, 'researchEntryId': link['researchEntryId'],
            'polityLabel': link['polityLabel'],
            'polityNote': f"本条依据已核建置文献关联为1200年{link['polityLabel']}同名建置；原始CHGIS点本身没有政权字段，此结论不向其他点推广。",
            'boundaryId': link['boundaryId'], 'boundaryName': link['researchName'],
            'boundaryLinkBasis': 'reviewed-source-record-and-documentary-identity',
            'boundaryPointStatus': 'inside' if inside else 'outside',
            'boundaryNote': ('按已核来源记录、具名地点与文献建置身份关联1200年近似模型，不以包含关系或最近点推断隶属。'
                             + ('此CHGIS参考点落在模型内，但不证明边线或治所准确。' if inside else '此CHGIS参考点落在模型外，点面位置存疑；保留原点与原面供核查。')
                             + link['yearNotice']),
        })
        link_audit.append({'settlementId': p['id'], 'boundaryId': p['boundaryId'], 'researchEntryId': p['researchEntryId'],
                           'originalSourceName': name, 'originalPresentLocation': modern_location, 'sourceSubtype': p['subtype'],
                           'polityLabel': p['polityLabel'], 'boundaryPointStatus': p['boundaryPointStatus'],
                           'basis': p['boundaryLinkBasis'], 'note': p['boundaryNote']})
    names = defaultdict(list)
    for feature in features:
        p = feature['properties']
        names[(p['level'], p['name'], p['subtype'])].append(p)
    same_name_groups = []
    for (level, name, subtype), group in names.items():
        if len(group) < 2:
            continue
        ids = [p['id'] for p in group]
        same_name_groups.append({'level': level, 'name': name, 'subtype': subtype, 'recordIds': ids})
        for p in group:
            p['sameNameRecordIds'] = [ident for ident in ids if ident != p['id']]
            p['sameNameNote'] = '源资料在1200年筛选中存在其他同名同类型记录，可能为异地同名或时序重叠；保留独立源记录，不按同名、近邻或同坐标合并。'
    features.sort(key=lambda feature: (feature['properties']['level'], int(feature['properties']['sourceRecordId'])))
    collection = {'type': 'FeatureCollection', 'features': features}
    write(OUTPUT / 'settlements-1200.geojson', collection, compact=True)
    level_counts = Counter(feature['properties']['level'] for feature in features)
    date_counts = Counter(feature['properties']['dateStatus'] for feature in features)
    manifest = {
        'version': '2026-09-27', 'periodId': 'song', 'year': YEAR,
        'url': '/data/song-settlements/settlements-1200.geojson', 'featureCount': len(features),
        'countsByLevel': dict(level_counts), 'countsBySubtype': dict(Counter(feature['properties']['subtype'] for feature in features)),
        'countsByDateStatus': {status: date_counts[status] for status in ('specified-endpoints', 'broad-endpoints', 'incomplete-date-rules')},
        'boundaryLinkedCount': len(link_audit), 'withheldCount': len(withheld), 'eligibleSourceCount': sum(selection_counts.values()),
        'sameNameGroupCount': len(same_name_groups),
        'note': '真实CHGIS时序治所点按1200年起讫年闭区间筛选；不是Hartwell标签点，也不代表普通村镇全覆盖。每条原始类型、名称、日期规则与记录号可查。',
        'dateNote': '明确端点也不等于逐年核定；宽时段与缺失规则的点为1200年时序候选。规则9与非单年起讫冲突的记录隔离，同名记录不合并。',
        'coverageNote': 'CHGIS官方说明1350年前仍有覆盖缺口。此包包含源资料覆盖的南宋、金及其他同期地区；不推断西夏、大理、西部或乡村城镇已经完整收录。',
        'polityNote': '源文件没有政权与上级隶属字段；除20条具名文献身份关联外，不按坐标或行政面包含推断政权，不把所有点标为南宋。',
        'sources': sources, 'inputHashes': input_hashes,
    }
    write(OUTPUT / 'manifest.json', manifest)
    audit = {
        'year': YEAR, 'sourceRowCounts': source_counts, 'eligibleSourceCounts': selection_counts,
        'publishedCounts': dict(level_counts), 'withheldCount': len(withheld), 'withheldRecords': withheld,
        'invalidDateRecordsOutsideSelection': date_rejected, 'sameNameGroups': same_name_groups,
        'reviewedBoundaryLinks': link_audit, 'inputHashes': input_hashes,
        'outputHashes': {'public/data/song-settlements/settlements-1200.geojson': digest(OUTPUT / 'settlements-1200.geojson')},
        'method': {'coordinateThresholdDegrees': MAX_DELTA, 'coordinateChoice': 'Original SHP POINT rounded to six decimals; original doubles and DBF coordinates retained.',
                   'selection': 'BEG_YR <= 1200 <= END_YR; reject invalid intervals, source date-rule conflicts, unusable Chinese names and inconsistent coordinates.',
                   'identity': 'No deduplication by name or coordinates; source IDs are unique within each original layer. No nearest-point or polygon-containment identity join.',
                   'polity': 'No source political or parent fields. Only individually reviewed documentary links may state a polity.'},
    }
    write(AUDIT / 'selection-audit.json', audit)
    print(json.dumps({key: manifest[key] for key in ['featureCount', 'countsByLevel', 'countsByDateStatus', 'withheldCount', 'boundaryLinkedCount', 'sameNameGroupCount']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
