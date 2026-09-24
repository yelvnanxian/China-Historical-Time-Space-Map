#!/usr/bin/env python3
"""Idempotently integrate validated Tang bundles; preserve other periods/events."""
from urllib.parse import urlparse, parse_qs
from tang_content import ROOT, load_bundles
import json

bundles, bundle_sources, profiles, new_places = load_bundles()
path = ROOT/'data/catalog.json'
catalog = json.loads(path.read_text())
places = {place['id']:place for place in catalog['places']}
generated_prefixes = ('tang-nw-', 'tang-se-', 'tang-central-')
sources = {source['id']:source for source in catalog['sources'] if not source['id'].startswith(generated_prefixes)}
for place in places.values():
    place['sourceIds'] = [sid for sid in place['sourceIds'] if not sid.startswith(generated_prefixes)]
for sid, source in bundle_sources.items():
    parsed = urlparse(source['url'])
    record = {'id':sid, 'title':source['title'], 'author':'编者及资料性质见来源原页', 'locator':source['title'], 'note':source['note'], 'url':source['url'], 'verification':'reference', 'retrievedAt':source['retrievedAt'], 'snapshotPath':source['snapshotPath']}
    revision = parse_qs(parsed.query).get('oldid')
    if revision: record['revisionId'] = revision[0]
    sources[sid] = record
for place in new_places:
    places[place['id']] = place
for bundle in bundles:
    for update in bundle.get('placeUpdates', []):
        place = places[update['id']]
        for source_key, target_key in [('addPeriodIds','periodIds'),('addAliases','aliases'),('addSourceIds','sourceIds')]:
            place[target_key] = list(dict.fromkeys(place[target_key] + update.get(source_key, [])))
        for key in ('nameByPeriod','typeByPeriod'):
            place[key] = {**place.get(key, {}), **update.get(key, {})}
for profile in profiles:
    place = places[profile['placeId']]
    assert 'tang' in place['periodIds'], f'Tang profile invisible: {place["id"]}'
    place['sourceIds'] = list(dict.fromkeys(place['sourceIds'] + profile['sourceIds']))
    assert all(sid in sources for sid in place['sourceIds'])
assert {place['id'] for place in places.values() if 'tang' in place['periodIds']} == {p['placeId'] for p in profiles}
catalog['places'] = list(places.values())
catalog['sources'] = list(sources.values())
catalog['metadata']['version'] = '0.8.0'
context = json.loads((ROOT/'public/data/historical-context.json').read_text())
catalog['metadata']['dataNotice'] = (
    f"本版含11个代表历史截面、{len(places)}个地点档案，其中唐时期有{len(profiles)}个城镇阅读入口及专门看点。"
    "唐代条目含都城、州府、商贸城镇、关隘、驿站及同时期周边政权；幽州与范阳沿用同城不同阅读入口，数量不表示互不重合的古城遗址。"
    "历史行政界接入CHGIS 1820/1911和Hartwell 741/1080/1200/1290/1391资料；资料年份独立标注，不能直接等同地图代表年。"
    "Hartwell是近似历史行政模型，行政区界不等于古城墙或完整国家边界；另提供18张历史地图纸图参考。"
    f"历史地理含{len(context['geographyEntries'])}条概述，历代大事记覆盖{len(context['cityTimelines'])}城、{sum(len(t['entries']) for t in context['cityTimelines'])}个节点。"
    "城池资料保留原文出处、名称年代和近似位置说明；引文可回查不等于古址已考证。"
    "现有12,111条历史行政记录通过显示层处理为简体中文，12,100条有代表点所在现代地区参考；这不证明古今行政实体相同。"
    "事件连线不是实际行军路线，传统纪年未换算公历。"
)
path.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'catalogPlaces':len(places),'tangProfiles':len(profiles),'newPlaces':len(new_places),'catalogSources':len(sources)},ensure_ascii=False))
