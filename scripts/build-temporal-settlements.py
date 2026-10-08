#!/usr/bin/env python3
"""Build all dated CHGIS seat intervals into dynasty packages, entirely offline.

The archived official point parser is shared with the earlier Song importer.
No fixed dynasty names, invented positions, nearest-point joins or intervals
inferred from the catalog are introduced.
"""
from collections import Counter
from pathlib import Path
import gzip
import hashlib
import importlib.util
import json
import math
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/data/temporal-settlements'
AUDIT = ROOT / 'data/evidence/temporal-settlements'
spec = importlib.util.spec_from_file_location('song_source_reader', ROOT / 'scripts/build-song-settlements.py')
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)
DATE_RULES = reader.DATE_RULES


def main():
    periods = [{key: item[key] for key in ('id', 'name', 'startYear', 'endYear', 'year')}
               for item in json.loads((ROOT / 'data/catalog.json').read_text())['periods']]
    # Only date bounds are an input: unrelated catalog text edits must not make
    # source-point provenance stale.
    reader.write(AUDIT / 'period-definitions.json', periods)
    song_path = ROOT / 'public/data/song-settlements/settlements-1200.geojson'
    song = json.loads(song_path.read_text())
    reviewed = {(f['properties']['level'], f['properties']['sourceRecordIndex']): f
                for f in song['features'] if f['properties'].get('boundaryId')}
    assert len(reviewed) == 20
    input_hashes = {str(song_path.relative_to(ROOT)): reader.digest(song_path),
                    str((AUDIT / 'period-definitions.json').relative_to(ROOT)): reader.digest(AUDIT / 'period-definitions.json')}
    all_features, withheld, sources, total, row_counts = [], [], [], 0, {}
    reason_counts = Counter()
    for level, doi in [('county', 'Q9VOF5'), ('prefecture', 'WW1PD6')]:
        archive = reader.INPUT / f'{level}-wgs84.zip'
        metadata = reader.INPUT / f'{level}-metadata.json'
        original_meta = json.loads(metadata.read_text())['data']['latestVersion']
        official = next(item['dataFile'] for item in original_meta['files'] if 'utf_wgs84.zip' in item['dataFile']['filename'])
        assert hashlib.md5(archive.read_bytes()).hexdigest() == official['checksum']['value']
        for file in (archive, metadata):
            input_hashes[str(file.relative_to(ROOT))] = reader.digest(file)
        source_id = f'chgis-v6-temporal-{level}'
        sources.append({'id': source_id, 'title': f'CHGIS V6 时序{"县级" if level == "county" else "府州级"}治所点',
                        'url': f'https://doi.org/10.7910/DVN/{doi}',
                        'snapshotPath': str(archive.relative_to(ROOT)), 'snapshotSha256': reader.digest(archive),
                        'metadataPath': str(metadata.relative_to(ROOT)), 'metadataSha256': reader.digest(metadata),
                        'attribution': 'CHGIS V6, Harvard University / Fudan University, 2016.',
                        'license': '保留官方CHGIS V6 README与Harvard Dataverse元数据中的来源及条款。'})
        rows = reader.read_original_points(archive)
        total += len(rows)
        row_counts[level] = len(rows)
        for index, original, exact_xy in rows:
            begin, end = original['BEG_YR'], original['END_YR']
            xy = [round(v, 6) for v in exact_xy]
            field_xy = [original['X_COOR'], original['Y_COOR']]
            begin_rule, end_rule = str(original['BEG_RULE'] or ''), str(original['END_RULE'] or '')
            reasons = []
            valid_years = isinstance(begin, int) and isinstance(end, int) and begin != 0 and end != 0 and begin <= end
            if not valid_years:
                reasons.append('invalid-date-interval')
            elif begin > 1912 or end > 1912:
                reasons.append('date-outside-source-historical-domain')
            if '9' in (begin_rule, end_rule) and begin != end:
                reasons.append('timeslice-rule-conflict')
            if not all(isinstance(v, (float, int)) and math.isfinite(v) for v in xy + field_xy):
                reasons.append('invalid-coordinate')
            elif not -180 <= xy[0] <= 180 or not -90 <= xy[1] <= 90:
                reasons.append('invalid-coordinate')
            elif max(abs(a-b) for a, b in zip(xy, field_xy)) > .02:
                reasons.append('coordinate-field-conflict')
            name = original['NAME_CH']
            if not isinstance(name, str) or not re.search(r'[\u3400-\u9fff]', name) or re.search(r'[A-Za-z\u0400-\u04ff]', name):
                reasons.append('unverified-chinese-name')
            if reasons:
                reason_counts.update(reasons)
                withheld.append({'level': level, 'sourceRecordIndex': index, 'sourceRecordId': str(original['SYS_ID']),
                                 'beginYear': begin, 'endYear': end, 'reasons': reasons, 'sourceRecord': original,
                                 'originalCoordinates': exact_xy, 'fieldCoordinates': field_xy})
                continue
            status = 'specified-endpoints' if begin_rule in ('4', '5', '6', '9') and end_rule in ('4', '5', '6', '9') else 'incomplete-date-rules' if begin_rule not in DATE_RULES or end_rule not in DATE_RULES else 'broad-endpoints'
            caution = {
                'specified-endpoints': '来源起讫端点有明确年、月或日规则；浏览年落入闭区间只表示时序候选，未经逐年独立核验。',
                'broad-endpoints': '至少一个端点按朝代、跨朝代或年号时段约定；仅作浏览年份的时序候选，不能据此断言全年确定存在。',
                'incomplete-date-rules': '至少一个端点的日期规则缺失或未定义；仅按来源起讫年筛选，具体定年仍待核。',
            }[status]
            ident = f'chgis-temporal-{level}-{original["SYS_ID"]}-{index}'
            p = {'id': ident, 'name': name, 'sourceName': name, 'level': level, 'subtype': original['TYPE_CH'],
                 'sourceId': source_id, 'sourceRecordId': str(original['SYS_ID']), 'sourceRecordIndex': index,
                 'sourceUrl': f'https://doi.org/10.7910/DVN/{doi}', 'beginYear': begin, 'endYear': end,
                 'beginRuleCode': begin_rule, 'endRuleCode': end_rule,
                 'beginRule': DATE_RULES.get(begin_rule, '来源未给定或未定义规则'), 'endRule': DATE_RULES.get(end_rule, '来源未给定或未定义规则'),
                 'dateStatus': status, 'dateCaution': caution, 'presentLocation': original['PRES_LOC'],
                 'geometryNote': '官方WGS84原始治所POINT仅舍入至六位小数；SHP与DBF相符不证明古址准确，不是行政面中心、标签点或现代城镇替身。',
                 'originalCoordinates': exact_xy, 'fieldCoordinates': field_xy, 'minZoom': 8 if level == 'county' else 6,
                 'sourceRecord': original, 'polityNote': '源点没有政权与上级隶属字段；不能因浏览朝代、年份或空间包含关系认定其政治归属。'}
            if (level, index) in reviewed:
                legacy = reviewed[(level, index)]
                assert legacy['properties']['sourceRecord'] == original
                assert legacy['geometry']['coordinates'] == xy
                p['documented1200'] = {'year': 1200, **{key: legacy['properties'][key] for key in ('boundaryId', 'boundaryName', 'boundaryNote', 'boundaryPointStatus', 'catalogPlaceId', 'researchEntryId', 'polityLabel', 'polityNote')}}
            all_features.append({'type': 'Feature', 'id': ident, 'properties': p, 'geometry': {'type': 'Point', 'coordinates': xy}})
    fields = ('name', 'subtype', 'presentLocation')
    values = [feature['properties'][key] for feature in all_features for key in fields]
    code = "import {Converter} from 'opencc-js/t2cn';let s='';for await(const c of process.stdin)s+=c;const cv=Converter({from:'t',to:'cn'});process.stdout.write(JSON.stringify(JSON.parse(s).map(v=>cv(v))));"
    translated = iter(json.loads(subprocess.run(['node', '--input-type=module', '-e', code], input=json.dumps(values), text=True, capture_output=True, check=True, cwd=ROOT).stdout))
    for feature in all_features:
        for key in fields:
            feature['properties'][key] = next(translated)
    all_features.sort(key=lambda f: (f['properties']['level'], f['properties']['sourceRecordIndex']))
    OUT.mkdir(parents=True, exist_ok=True)
    packages, output_hashes = [], {}
    for period in periods:
        features = [f for f in all_features if f['properties']['beginYear'] <= period['endYear'] and f['properties']['endYear'] >= period['startYear']]
        encoded = (json.dumps({'type': 'FeatureCollection', 'features': features}, ensure_ascii=False, allow_nan=False, separators=(',', ':')) + '\n').encode()
        file = OUT / f'{period["id"]}.geojson.gz'
        file.write_bytes(gzip.compress(encoded, compresslevel=9, mtime=0))
        output_hashes[str(file.relative_to(ROOT))] = reader.digest(file)
        counts = Counter(f['properties']['level'] for f in features)
        packages.append({'periodId': period['id'], 'periodName': period['name'], 'startYear': period['startYear'], 'endYear': period['endYear'],
                         'representativeYear': period['year'], 'url': f'/data/temporal-settlements/{file.name}', 'featureCount': len(features),
                         'countsByLevel': {level: counts[level] for level in ('county', 'prefecture')},
                         'representativeYearCount': sum(f['properties']['beginYear'] <= period['year'] <= f['properties']['endYear'] for f in features),
                         'withheldIntersectingCount': sum(isinstance(w['beginYear'], int) and isinstance(w['endYear'], int) and w['beginYear'] <= period['endYear'] and w['endYear'] >= period['startYear'] for w in withheld),
                         'compressedBytes': file.stat().st_size, 'expandedBytes': len(encoded), 'sha256': reader.digest(file)})
    manifest = {'version': '2026-10-08', 'kind': 'chgis-temporal-settlements', 'packages': packages,
                'uniqueFeatureCount': len(all_features), 'sourceRecordCount': total, 'withheldCount': len(withheld),
                'sources': sources, 'inputHashes': input_hashes,
                'dateNote': '按原始起讫年闭区间筛选浏览年份；明确端点也不等于逐年核验。宽时段与缺失规则分别说明，迁治或改名按不同源记录保留。',
                'coverageNote': 'CHGIS官方说明1350年前空间覆盖仍有缺口；此包不是任何朝代的全部城镇。分包按时间范围，不代表每条记录都属所选政权。源记录终年多为1911，1912年仅显示少量源记录，不能外推沿用。',
                'polityNote': '源文件没有政权与上级隶属字段。既有20条文献身份关系只在1200年提供；其他年份不能套用其辖区、政权或城池档案关系。'}
    reader.write(OUT / 'manifest.json', manifest)
    reader.write(AUDIT / 'selection-audit.json', {'sourceRowCounts': row_counts, 'sourceRecordCount': total, 'acceptedCount': len(all_features),
                  'withheldCount': len(withheld), 'reasons': dict(reason_counts), 'withheldRecords': withheld,
                  'acceptedSourceRows': [{'id': f['properties']['id'], 'level': f['properties']['level'], 'sourceRecordIndex': f['properties']['sourceRecordIndex'], 'sourceRecordId': f['properties']['sourceRecordId']} for f in all_features],
                  'inputHashes': input_hashes, 'outputHashes': output_hashes,
                  'method': 'Preserve every unique source row, including duplicate SYS_ID across time. No name/coordinate merging. Invalid dates, endpoints beyond 1912, timeslice-rule conflicts, coordinate-field conflicts and unverified Chinese names are quarantined. Geometry is original WGS84 POINT rounded to six decimals.'})
    print(json.dumps({'accepted': len(all_features), 'withheld': len(withheld), 'reasons': dict(reason_counts), 'packages': [(p['periodId'], p['featureCount'], p['representativeYearCount'], p['compressedBytes']) for p in packages]}, ensure_ascii=False))


if __name__ == '__main__':
    main()
