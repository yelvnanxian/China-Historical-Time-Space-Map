#!/usr/bin/env python3
"""Link reviewed Ming profiles to catalog entries without moving historical points.

Run after build-ming-content.py.
The city coordinates stay regional references. Textual identity cannot validate them.
"""
import json
from pathlib import Path
from urllib.parse import urlparse, parse_qs

ROOT = Path(__file__).resolve().parents[1]
NAMES = {
    'suzhou': '苏州', 'qizhou-jinan': '济南', 'yanzhou': '兖州',
    'ezhou-jiangxia': '武昌', 'fuzhou-fujian': '福州',
    'yuzhou-chongqing': '重庆', 'guizhou-guilin': '桂林',
    'mingzhou': '宁波', 'hongzhou': '南昌', 'jinyang': '太原县',
}


def main():
    path = ROOT / 'data/catalog.json'
    catalog = json.loads(path.read_text())
    profiles = json.loads((ROOT / 'public/data/city-period-profiles.json').read_text())
    ming = [p for p in profiles['profiles'] if p['periodId'] == 'ming']
    assert len(ming) == 28, 'Build the 28 reviewed Ming profiles first'
    sources = {s['id']: s for s in profiles['sources']}
    catalog_sources = {s['id']: s for s in catalog['sources']}
    places = {p['id']: p for p in catalog['places']}
    for profile in ming:
        place = places[profile['placeId']]
        if 'ming' not in place['periodIds']:
            place['periodIds'].append('ming')
        if place['id'] in NAMES:
            place.setdefault('nameByPeriod', {})['ming'] = NAMES[place['id']]
        for source_id in profile['sourceIds']:
            if source_id not in place['sourceIds']:
                place['sourceIds'].append(source_id)
            if source_id not in catalog_sources:
                source = sources[source_id]
                revision = parse_qs(urlparse(source['url']).query)['oldid'][0]
                catalog_source = {
                    'id': source_id, 'title': source['title'], 'author': '张廷玉等',
                    'locator': source['title'].split('（')[0], 'note': source['note'],
                    'url': source['url'], 'verification': 'verified',
                    'retrievedAt': source['retrievedAt'], 'revisionId': revision,
                    'edition': '维基文库固定修订；原文快照与原始API分别归档',
                    'license': '原著公版；电子整理文本条款见维基文库来源页',
                    'snapshotPath': source['snapshotPath'],
                }
                catalog['sources'].append(catalog_source)
                catalog_sources[source_id] = catalog_source
        # Preserve all existing Tang, coordinate and event evidence. Ming research
        # is displayed by the period profile, which keeps periods from mixing.
    catalog['metadata']['version'] = '0.14.0'
    period = next(p for p in catalog['periods'] if p['id'] == 'ming')
    period['description'] = '以1582年为代表截面，阅读两京、府州县与卫所沿革；建置史料涵盖明代不同阶段，行政面采用1391年近似参考。'
    path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')
    print(f'Linked {len(ming)} Ming profiles; preserved all place coordinates and Tang period names.')


if __name__ == '__main__':
    main()
