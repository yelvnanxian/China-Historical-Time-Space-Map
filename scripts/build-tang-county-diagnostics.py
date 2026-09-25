#!/usr/bin/env python3
"""Audit CHGIS county seats against original Hartwell county models.

Names and previously evidenced county identities produce candidates. Distance is
reported only after matching and is never used to select a corresponding unit.
"""
from collections import Counter, defaultdict
from pathlib import Path
import hashlib
import io
import json
import subprocess
import zipfile
import shapefile
from pyproj import CRS, Transformer
from shapely.geometry import Point, shape
from shapely.ops import transform
from tang_county_research import load_research

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public/data/tang-county-diagnostics.json'
AUDIT = ROOT / 'data/evidence/tang-detail/county-point-model-audit.json'
STATUSES = ('matched', 'outside', 'ambiguous', 'no-evidence')


def read(path):
    return json.loads((ROOT / path).read_text())


def sha(path):
    return hashlib.sha256((ROOT / path).read_bytes()).hexdigest()


def source_reader(archive, stem, encoding):
    return shapefile.Reader(**{extension: io.BytesIO(archive.read(stem + '.' + extension))
                               for extension in ('shp', 'shx', 'dbf')}, encoding=encoding, encodingErrors='replace')


def build():
    current_path = 'public/data/tang-detail/settlements-755.geojson'
    old_path = 'public/data/tang-detail/settlements-741.geojson'
    models_path = 'public/data/boundaries/hartwell-741-county.geojson'
    crosswalk_path = 'public/data/tang-boundary-crosswalk.json'
    current = [f for f in read(current_path)['features'] if f['properties']['level'] == 'county']
    old = {f['properties']['id']: f for f in read(old_path)['features'] if f['properties']['level'] == 'county'}
    models = read(models_path)['features']
    crosswalk = read(crosswalk_path)
    identity_path = 'data/evidence/tang-detail/county-model-reviewed-identities.json'
    identities = read(identity_path)
    historical_references = read(identities['referenceAuditPath'])
    reviewed_identities = {entry['settlementId']: entry for entry in identities['entries']}
    context_summaries = {
        'chgis-county-43627': '唐城县于开元二十六年（738）分枣阳县设置；天宝时隶属汉东郡（前后称随州）。',
        'chgis-county-43673': '湖北吉阳县承梁平阳县、后魏京池县，隋代改称吉阳；天宝时隶属安陆郡（安州）。',
        'chgis-county-42505': '海南吉阳县于贞观二年（628）分延德县设置；天宝时隶属临振郡（振州），与湖北吉阳为不同单位。',
    }
    reference_sources = {source['id']: source for source in historical_references['sources']}
    contexts = {ident: {'summary': context_summaries[ident], 'quote': entry['historicalQuote'],
                       'sourceTitle': reference_sources[entry['historicalSourceId']]['title'],
                       'sourceUrl': reference_sources[entry['historicalSourceId']]['url']}
                for ident, entry in reviewed_identities.items() if ident in context_summaries}
    # Reuse app normalization and source-name recovery, including recorded aliases.
    script = """import { readFileSync } from 'node:fs';
import { getBoundaryDisplayLabel } from './shared/boundary-labels';
import { boundarySearchKey } from './shared/boundary-search';
const input=JSON.parse(readFileSync(0,'utf8'));
const key=(name)=>boundarySearchKey(name).replace(/(?:大都督府|大都护府|都督府|都护府|府|州|郡|县)$/u,'');
console.log(JSON.stringify({models:input.models.map(p=>({id:p.id,name:getBoundaryDisplayLabel(p).name,key:key(getBoundaryDisplayLabel(p).name)})),points:input.points.map(p=>({id:p.id,key:key(p.name)}))}));"""
    names = json.loads(subprocess.run(['npx', 'tsx', '-e', script], input=json.dumps({
        'models': [f['properties'] for f in models], 'points': [f['properties'] for f in current]}),
        cwd=ROOT, text=True, capture_output=True, check=True).stdout)
    model_names = {item['id']: item for item in names['models']}
    point_keys = {item['id']: item['key'] for item in names['points']}
    model_by_id = {f['properties']['id']: f for f in models}
    research = load_research({f['properties']['id'] for f in current}, set(model_by_id))
    model_shapes = {ident: shape(f['geometry']) for ident, f in model_by_id.items()}
    models_by_key = defaultdict(list)
    for item in names['models']:
        if not item['name'].startswith(('未定名', '来源未命名')):
            models_by_key[item['key']].append(item['id'])

    # Check the actual archives independently of previously generated audits.
    county_zip_path = 'data/evidence/tang-detail/chgis/county-wgs84.zip'
    county_zip = zipfile.ZipFile(ROOT / county_zip_path)
    county_reader = source_reader(county_zip, 'v6_time_cnty_pts_utf_wgs84', 'utf-8')
    raw_points = {str(item.record.as_dict()['SYS_ID']): item for item in county_reader.iterShapeRecords()}
    point_checks = []
    for f in current:
        p = f['properties']; original = raw_points[p['sourceRecordId']]
        coordinates = [round(value, 6) for value in original.shape.points[0]]
        assert coordinates == f['geometry']['coordinates'], p['id']
        assert original.record.as_dict() == p['sourceRecord'], p['id']
        point_checks.append(p['id'])
    hartwell_zip_path = 'data/evidence/hartwell/source-layers.zip'
    hartwell_zip = zipfile.ZipFile(ROOT / hartwell_zip_path)
    stem = 'v5_0741_chin_chn_0741_c'
    reader = source_reader(hartwell_zip, stem, 'big5')
    projection = Transformer.from_crs(CRS.from_wkt(hartwell_zip.read(stem + '.prj').decode()), 4326, always_xy=True)
    model_checks = []
    original_models = list(reader.iterShapeRecords())
    for f in models:
        p = f['properties']; original = original_models[p['sourceRecordIndex']]
        attributes = original.record.as_dict()
        assert attributes['CODE'] == p['sourceCode'], p['id']
        assert attributes['H_UNICODE_'].strip() == p['sourceName'], p['id']
        original_shape = transform(projection.transform, shape(original.shape.__geo_interface__))
        assert original_shape.equals_exact(model_shapes[p['id']], 1e-10), p['id']
        assert model_shapes[p['id']].covers(Point(p['labelCoordinates'])), p['id']
        model_checks.append(p['id'])

    by_settlement = {}; incoming = defaultdict(list); pair_distances = {}
    same_record_outside = 0; linked_county_outside = []
    for f in current:
        p = f['properties']; coordinates = f['geometry']['coordinates']; point = Point(coordinates)
        ident = p['id']; link = crosswalk['settlements'].get(ident, {})
        linked_county = link.get('countyBoundaryId')
        named_ids = models_by_key[point_keys[ident]]
        research_links = [area_id for point_id, area_id in research['links'] if point_id == ident]
        candidate_ids = sorted(set(named_ids + research_links + ([linked_county] if linked_county else [])))
        excluded_ids = []
        reviewed = reviewed_identities.get(ident)
        if reviewed:
            target = model_by_id[reviewed['boundaryId']]['properties']
            assert p['name'] == reviewed['expectedName']
            assert target['sourceCode'] == reviewed['expectedSourceCode']
            assert target['sourceName'] == reviewed['expectedSourceName']
            assert all(target['sourceHierarchy'][key] == value for key, value in reviewed['expectedSourceHierarchy'].items())
            assert any(item['sourceId'] == reviewed['historicalSourceId'] and item['quote'] == reviewed['historicalQuote']
                       and int(p['sourceRecordId']) in item['appliesToSysIds'] for item in historical_references['historicalTextEvidence'])
            assert reviewed['boundaryId'] in candidate_ids
            excluded_ids = [area_id for area_id in candidate_ids if area_id != reviewed['boundaryId']]
            candidate_ids = [reviewed['boundaryId']]
        research_excluded = [area_id for point_id, area_id in research['exclusions'] if point_id == ident]
        assert linked_county not in research_excluded, f'Research conflicts with verified crosswalk: {ident}'
        for area_id in research_excluded:
            assert area_id in candidate_ids or area_id in excluded_ids, (ident, area_id, 'Exclusion must address an actual candidate')
        excluded_ids = sorted(set(excluded_ids + research_excluded))
        candidate_ids = [area_id for area_id in candidate_ids if area_id not in excluded_ids]
        inside_ids = [area_id for area_id in candidate_ids if model_shapes[area_id].covers(point)]
        same_741 = ident in old and old[ident]['geometry'] == f['geometry']
        source_point = {'id': ident, 'sourceRecordId': p['sourceRecordId'], 'name': p['name'], 'year': 755,
                        'coordinates': coordinates, 'presentLocation': p.get('presentLocation', ''),
                        'beginYear': p['beginYear'], 'endYear': p['endYear'], 'sourceUrl': p['sourceUrl'],
                        'sameRecordIn741': same_741, 'matchedBoundaryIds': inside_ids}
        if linked_county:
            source_point['linkedCountyBoundaryId'] = linked_county
            if linked_county not in inside_ids:
                linked_county_outside.append({'id': ident, 'countyBoundaryId': linked_county})
        local_projection = Transformer.from_crs(4326, f'+proj=aeqd +lat_0={point.y} +lon_0={point.x} +datum=WGS84 +units=m', always_xy=True)
        candidates = []
        for area_id in candidate_ids + excluded_ids:
            distance = 0.0 if area_id in inside_ids else round(transform(local_projection.transform, model_shapes[area_id]).distance(Point(0, 0)) / 1000, 6)
            pair_distances[(ident, area_id)] = distance
            area = model_by_id[area_id]['properties']
            if area_id in candidate_ids:
                candidates.append({'boundaryId': area_id, 'name': model_names[area_id]['name'], 'sourceName': area['sourceName'],
                                   'year': 741, 'containsPoint': area_id in inside_ids, 'distanceKm': distance,
                                   'basis': 'documented-research' if area_id in research_links else 'reviewed-source-hierarchy' if reviewed else 'source-name' if area_id in named_ids else 'documented-county-link'})
            incoming[area_id].append(source_point)
        status = 'no-evidence' if not candidate_ids else 'outside' if not inside_ids else 'matched' if len(inside_ids) == 1 else 'ambiguous'
        if status == 'outside' and same_741:
            same_record_outside += 1
        reason = {
            'matched': '原始治所点位于唯一的同名或已有明确改名证据县面内；这只表示两套来源相容，不证明模型边界已核实。',
            'outside': '原始治所点在所有同名或有明确更名证据的县模型面之外；尚无可靠县面对应，不自动选最近县面。',
            'ambiguous': '原始治所点同时落入多个名称候选县面，来源身份有歧义，暂不选择。',
            'no-evidence': '未找到同名或已有明确改名证据的县模型；这不表示该县在历史上没有辖区。',
        }[status]
        if status == 'outside' and same_741:
            reason += '741年筛选保留同一原始点，差异不能简单归因于741与755年份不同。'
        elif status == 'outside':
            reason += '本条未以同一记录出现在741年筛选中，还存在跨年可比性限制。'
        if research_excluded:
            reason += '已依据建置、州属或名称年代史料排除异地同名候选，排除依据见下方史料核查。'
        by_settlement[ident] = {'status': status, 'name': p['name'], 'year': 755, 'reason': reason, 'sourcePoint': source_point,
                               'candidateBoundaryIds': candidate_ids, 'excludedHomonymBoundaryIds': excluded_ids, 'candidates': candidates,
                               'minDistanceKm': min((item['distanceKm'] for item in candidates), default=None)}
        if ident in contexts:
            by_settlement[ident]['historicalContext'] = contexts[ident]
        if ident in research['bySettlement']:
            by_settlement[ident]['historicalResearch'] = research['bySettlement'][ident]

    by_boundary = {}
    for area in models:
        p = area['properties']; ident = p['id']; relevant = []; excluded = []
        for point in incoming[ident]:
            inside = ident in point['matchedBoundaryIds']
            other = [target for target in point['matchedBoundaryIds'] if target != ident]
            record = {**point, 'insideBoundary': inside, 'distanceKm': pair_distances[(point['id'], ident)], 'linkedOtherBoundaryIds': other}
            reviewed = reviewed_identities.get(point['id'])
            if reviewed and reviewed['boundaryId'] != ident:
                record['linkedOtherBoundaryIds'] = sorted(set(other + [reviewed['boundaryId']]))
            research_excluded = (point['id'], ident) in research['exclusions']
            (excluded if (other and not inside) or reviewed and reviewed['boundaryId'] != ident or research_excluded else relevant).append(record)
        inside = [point for point in relevant if point['insideBoundary']]
        if len(inside) == 1:
            status = 'matched'; reason = '一个名称候选原始治所点位于此模型内；仅说明来源点面相容，不代表已核实古代县界。'
        elif len(inside) > 1:
            status = 'ambiguous'; reason = '多个同名治所点落在此模型内，不能自动视作唯一县治对应。'
        elif len(relevant) == 1 and relevant[0]['sameRecordIn741'] and len(by_settlement[relevant[0]['id']]['candidateBoundaryIds']) == 1:
            status = 'outside'; reason = '唯一保留的名称或文献更名候选治所点在本模型之外，且741与755年都保留同一原始点。两套来源存在点面冲突，此面仅作诊断参照。'
        elif relevant:
            status = 'ambiguous'; reason = '现有同名候选点在模型外，但存在多个候选或未在741年保留同一记录；不足以断定本模型与哪条治所记录对应。'
        else:
            status = 'no-evidence'; reason = '当前755年治所资料没有可核对的同名或明确改名县治点；缺少验证依据，不等于模型错误。'
            if excluded:
                reason += '部分同名点已对应其他县面，或经史料证明并非同一单位，已排除；不能据此把异地同名县判为冲突。'
        by_boundary[ident] = {'status': status, 'boundaryId': ident, 'name': model_names[ident]['name'], 'sourceName': p['sourceName'], 'year': 741,
                             'reason': reason, 'sourcePoints': relevant, 'excludedHomonyms': excluded,
                             'minDistanceKm': min((point['distanceKm'] for point in relevant), default=None)}
        context_ids = [point_id for point_id, entry in reviewed_identities.items() if entry['boundaryId'] == ident and point_id in contexts]
        if len(context_ids) == 1:
            by_boundary[ident]['historicalContext'] = contexts[context_ids[0]]
        if ident in research['byBoundary']:
            by_boundary[ident]['historicalResearch'] = research['byBoundary'][ident]

    source_specs = [
        ('chgis-county-755', 'CHGIS V6 755年县治所筛选', 'https://doi.org/10.7910/DVN/Q9VOF5', current_path),
        ('chgis-county-741', 'CHGIS V6 741年县治所筛选', 'https://doi.org/10.7910/DVN/Q9VOF5', old_path),
        ('chgis-county-original', 'CHGIS V6 原始县级POINT归档', 'https://doi.org/10.7910/DVN/Q9VOF5', county_zip_path),
        ('hartwell-county-741', 'Hartwell 741年县级近似模型', 'https://doi.org/10.7910/DVN/29302', models_path),
        ('hartwell-original', 'Hartwell 原始SHP与DBF归档', 'https://doi.org/10.7910/DVN/29302', hartwell_zip_path),
        ('hartwell-methods', 'Hartwell 原始方法说明', 'https://sites.fas.harvard.edu/~chgis/data/hartwell/', 'data/evidence/hartwell/README_CHGIS_V5_HARTWELL.txt'),
        ('tang-crosswalk', '已核对的唐代名称链与原始县面隶属', 'https://doi.org/10.7910/DVN/29302', crosswalk_path),
        ('county-historical-references', '唐城与湖北、海南吉阳原始记录和旧唐书引文复核', 'https://zh.wikisource.org/wiki/舊唐書', 'data/evidence/tang-detail/county-location-historical-references.json'),
        ('county-reviewed-identities', '古籍所属州与模型源隶属核对，仅作诊断身份和同名排除', 'https://zh.wikisource.org/wiki/舊唐書', identity_path),
    ]
    source_specs += [(f'county-research-{Path(path).stem}', '唐代县级存疑资料的史料核查包', 'https://zh.wikisource.org/wiki/舊唐書', path)
                     for path in research['paths']]
    source_specs += [(source['id'], source['title'], source['url'], source['snapshotPath']) for source in research['sources'].values()]
    statistics = {'sourceCountyPoints': len(current), 'countyModels': len(models),
                  'settlementsByStatus': {status: sum(item['status'] == status for item in by_settlement.values()) for status in STATUSES},
                  'boundariesByStatus': {status: sum(item['status'] == status for item in by_boundary.values()) for status in STATUSES},
                  'outsideInBoth741And755': same_record_outside}
    result = {'version': '1.1.0', 'sourceYear': 755, 'boundaryYear': 741, 'bySettlement': by_settlement, 'byBoundary': by_boundary,
              'statistics': statistics, 'researchCoverage': research['coverage'], 'sources': [{'id': ident, 'title': title, 'url': url, 'path': path, 'sha256': sha(path)} for ident, title, url, path in source_specs],
              'notes': ['Hartwell以1990年县域为构件近似表示古代行政区，官方说明其来源和方法与CHGIS时序点完全不同，许多边界可能不适合作为真实辖区。',
                        'matched仅表示名称及点面相容，outside表示来源冲突；均不裁定哪一套资料正确，也不独立验证治所经纬度。',
                        '模型标签点是位于该源面内的排字锚点，不是历史治所；没有把县治移动到标签点。',
                        '县治与县面诊断独立于既有父级州面关联，不能把州面高亮误称为该县县界。',
                        '繁简及行政通名正规化使用应用现有规则；异名仅使用已有countyBoundaryId证据或明确的史料改名链。两处吉阳及本轮核查条目按古籍州郡隶属排除异地同名。距离不参与配对。',
                        '新增史料逐条列出事实、原文与仍待考证项；文献记载互异时并列保留。只有显式审核的身份排除和改名链调整诊断候选，不据文献里程绘制县界或移动治所。',
                        'distanceKm采用以原始治所为中心的WGS84方位等距投影至模型的最短平面距离，属近似量；远距离同名候选仅供排除，不作匹配依据。']}
    PUBLIC.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
    focus_ids = ['chgis-county-43627', 'chgis-county-43673', 'chgis-county-42505']
    audit = {'statistics': statistics, 'publishedPath': str(PUBLIC.relative_to(ROOT)), 'publishedSha256': hashlib.sha256(PUBLIC.read_bytes()).hexdigest(),
             'sourceVerification': {'publishedCountyPointsComparedToOriginalZip': len(point_checks), 'pointCoordinatesAndFieldsEqualSource': True,
                                    'countyModelsComparedToOriginalZip': len(model_checks), 'modelSourceNamesAndCodesEqual': True,
                                    'allModelGeometriesEqualOriginalReprojection': True, 'modelLabelAnchorsInsideTheirOwnGeometry': True,
                                    'linkedCountyPointOutsideItsVerifiedModel': linked_county_outside},
             'focusCases': {ident: by_settlement[ident] for ident in focus_ids},
             'reviewedModelIdentities': identities,
             'researchCoverage': research['coverage'], 'researchExclusions': list(research['exclusions'].values()),
             'researchNameLinks': list(research['links'].values()),
             'conflictingModels': [item for item in by_boundary.values() if item['status'] == 'outside'],
             'ambiguousModels': [item for item in by_boundary.values() if item['status'] == 'ambiguous'],
             'sources': result['sources'], 'notes': result['notes']}
    AUDIT.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'statistics': statistics, 'sourceVerification': audit['sourceVerification'], 'bytes': PUBLIC.stat().st_size}, ensure_ascii=False))


if __name__ == '__main__':
    build()
