#!/usr/bin/env python3
"""Acquire actual modern water/peak geometries for regional offline detail packs.

No synthetic rivers, buffers or historical reconstructions. Reuses successful
snapshots unless --refresh is passed. Two requests maximum run concurrently.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
import argparse
import hashlib
import gzip
import json
import subprocess

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data/evidence/tang-detail/osm'
REGIONS = {
    'guanzhong': ('关中与秦岭北麓', [106.5, 33.5, 110.5, 35.5]),
    'luoyang': ('洛阳与豫西', [110.5, 33.3, 113.5, 35.5]),
    'central-plains': ('中原与淮北', [113.5, 32.5, 116.5, 35.5]),
    'jianghuai': ('南京、皖南与江淮', [117, 30.7, 120.5, 33.5]),
    'taihu': ('太湖与长江口', [119.5, 29.5, 122, 32.5]),
    'zhejiang': ('浙江中北部', [118, 28, 122, 30.7]),
}
ENDPOINT = 'https://overpass.kumi.systems/api/interpreter'


def fetch(region, refresh=False):
    label, bounds = REGIONS[region]
    west, south, east, north = bounds
    query = f'''[out:json][timeout:110][maxsize:268435456];
(
way[waterway~"^(river|stream|canal)$"]({south},{west},{north},{east});
way[natural=water]({south},{west},{north},{east});
way[waterway=riverbank]({south},{west},{north},{east});
relation[type=multipolygon][natural=water]({south},{west},{north},{east});
relation[type=multipolygon][waterway=riverbank]({south},{west},{north},{east});
node[natural~"^(peak|saddle)$"]({south},{west},{north},{east});
);
out meta geom;
'''
    OUT.mkdir(parents=True, exist_ok=True)
    query_path = OUT / f'{region}.ql'
    response_path = OUT / f'{region}.json.gz'
    metadata_path = OUT / f'{region}-source.json'
    query_path.write_text(query)
    if response_path.exists() and metadata_path.exists() and not refresh:
        meta = json.loads(metadata_path.read_text())
        assert hashlib.sha256(response_path.read_bytes()).hexdigest() == meta['snapshotSha256']
        return {'region': region, 'cached': True, 'elements': meta['elementCount']}
    temp = response_path.with_suffix('.part')
    errors = []
    for attempt in range(3):
        response = subprocess.run(['curl', '-G', '-L', '--fail', '--max-time', '145', '-sS',
                                   '--data-urlencode', f'data@{query_path}', ENDPOINT, '-o', str(temp)],
                                  capture_output=True, text=True)
        try:
            response.check_returncode()
            raw_bytes = temp.read_bytes()
            raw = json.loads(raw_bytes)
            assert not raw.get('remark'), raw.get('remark')
            assert raw.get('elements'), 'Empty OSM response'
            break
        except Exception as error:
            errors.append(str(error) + response.stderr)
            if attempt == 2:
                raise RuntimeError(f'{region}: {errors}') from error
    response_path.write_bytes(gzip.compress(raw_bytes, compresslevel=9, mtime=0))
    temp.unlink()
    metadata = {
        'id': f'osm-tang-detail-{region}', 'title': f'OpenStreetMap 现代地理：{label}',
        'url': 'https://www.openstreetmap.org/copyright', 'endpoint': ENDPOINT,
        'retrievedAt': datetime.now(timezone.utc).isoformat(), 'bounds': bounds,
        'snapshotPath': str(response_path.relative_to(ROOT)),
        'snapshotSha256': hashlib.sha256(response_path.read_bytes()).hexdigest(),
        'uncompressedSnapshotSha256': hashlib.sha256(raw_bytes).hexdigest(),
        'snapshotEncoding': 'gzip',
        'queryPath': str(query_path.relative_to(ROOT)),
        'querySha256': hashlib.sha256(query_path.read_bytes()).hexdigest(),
        'osmBaseTimestamp': raw.get('osm3s', {}).get('timestamp_osm_base'),
        'elementCount': len(raw['elements']),
        'license': 'Open Data Commons Open Database License (ODbL) 1.0',
        'attribution': '© OpenStreetMap contributors',
        'modernReferenceOnly': True,
        'note': '真实OSM河流、溪流、运河、水面、山峰与山口记录。现代参照，不代表唐代河道、湖岸或水利工程。',
    }
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
    return {'region': region, 'cached': False, 'elements': len(raw['elements']), 'bytes': response_path.stat().st_size}


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--regions', nargs='+', choices=list(REGIONS), default=list(REGIONS))
    cli.add_argument('--refresh', action='store_true')
    args = cli.parse_args()
    with ThreadPoolExecutor(max_workers=2) as pool:
        for result in pool.map(lambda region: fetch(region, args.refresh), args.regions):
            print(json.dumps(result, ensure_ascii=False), flush=True)
