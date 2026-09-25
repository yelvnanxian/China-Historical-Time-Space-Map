#!/usr/bin/env python3
"""Archive full OSM ridge/arete/cliff ways and named peak nodes; never synthesize lines."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
import argparse
import gzip
import hashlib
import json
import subprocess

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data/evidence/mountain-detail/osm'
REGIONS = {
    'qinling': ('秦岭与关中南缘', [104, 32, 112, 35]),
    'taihang': ('太行山地区', [111, 34.5, 115, 40.5]),
    'qilian': ('祁连山地区', [94, 36, 103, 40.5]),
    'tianshan': ('天山地区', [79, 40.5, 92, 45.5]),
    'west-sichuan': ('川西山地', [97, 28, 104, 34]),
}
ENDPOINTS = ['https://overpass.kumi.systems/api/interpreter', 'https://overpass-api.de/api/interpreter']


def tiles(region):
    label, (west, south, east, north) = REGIONS[region]
    index = 0
    y = south
    while y < north:
        x = west
        while x < east:
            yield f'{region}-{index}', region, label, [x, y, min(x + 4, east), min(y + 3, north)]
            x += 4
            index += 1
        y += 3


def fetch(tile, refresh=False):
    tile_id, region_id, label, bounds = tile
    west, south, east, north = bounds
    query = f'''[out:json][timeout:110][maxsize:268435456];
(
way[natural~"^(ridge|arete|cliff)$"]({south},{west},{north},{east});
node[natural=peak][~"^name(:.*)?$"~"."]({south},{west},{north},{east});
);
out meta geom;
'''
    OUT.mkdir(parents=True, exist_ok=True)
    query_path = OUT / f'{tile_id}.ql'
    archive_path = OUT / f'{tile_id}.json.gz'
    source_path = OUT / f'{tile_id}-source.json'
    query_path.write_text(query)
    if archive_path.exists() and source_path.exists() and not refresh:
        meta = json.loads(source_path.read_text())
        assert hashlib.sha256(archive_path.read_bytes()).hexdigest() == meta['snapshotSha256']
        assert hashlib.sha256(query_path.read_bytes()).hexdigest() == meta['querySha256']
        return {'tile': tile_id, 'cached': True, 'elements': meta['elementCount']}
    temp = archive_path.with_suffix('.part')
    errors = []
    for attempt in range(4):
        endpoint = ENDPOINTS[attempt % len(ENDPOINTS)]
        result = subprocess.run(['curl', '-G', '-L', '--fail', '--connect-timeout', '15', '--max-time', '140', '-sS',
                                 '--data-urlencode', f'data@{query_path}', endpoint, '-o', str(temp)],
                                capture_output=True, text=True)
        try:
            result.check_returncode()
            raw_bytes = temp.read_bytes()
            raw = json.loads(raw_bytes)
            assert not raw.get('remark'), raw.get('remark')
            assert isinstance(raw.get('elements'), list), 'Missing element list'
            break
        except Exception as error:
            errors.append(str(error) + result.stderr)
            print(json.dumps({'tile': tile_id, 'attempt': attempt + 1, 'error': errors[-1]}, ensure_ascii=False), flush=True)
            if attempt == 3:
                raise RuntimeError(f'{tile_id}: {errors}') from error
    archive_path.write_bytes(gzip.compress(raw_bytes, compresslevel=9, mtime=0))
    temp.unlink()
    meta = {
        'id': f'osm-mountain-detail-{tile_id}', 'regionId': region_id,
        'title': f'OpenStreetMap 山地线与命名山峰：{label} / {tile_id}',
        'url': 'https://www.openstreetmap.org/copyright', 'endpoint': endpoint,
        'bounds': bounds, 'retrievedAt': datetime.now(timezone.utc).isoformat(),
        'snapshotPath': str(archive_path.relative_to(ROOT)),
        'snapshotSha256': hashlib.sha256(archive_path.read_bytes()).hexdigest(),
        'uncompressedSnapshotSha256': hashlib.sha256(raw_bytes).hexdigest(),
        'queryPath': str(query_path.relative_to(ROOT)),
        'querySha256': hashlib.sha256(query_path.read_bytes()).hexdigest(),
        'osmBaseTimestamp': raw.get('osm3s', {}).get('timestamp_osm_base'),
        'elementCount': len(raw['elements']), 'modernReferenceOnly': True,
        'license': 'Open Data Commons Open Database License (ODbL) 1.0',
        'attribution': '© OpenStreetMap contributors',
        'note': '完整OSM way几何与命名peak节点；现代参照，未经独立实测核验，不是唐代复原。查询边框不是山脉范围。',
    }
    source_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n')
    return {'tile': tile_id, 'cached': False, 'elements': len(raw['elements']), 'bytes': archive_path.stat().st_size}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--regions', nargs='+', choices=list(REGIONS), default=list(REGIONS))
    parser.add_argument('--refresh', action='store_true')
    args = parser.parse_args()
    failures = []
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(fetch, tile, args.refresh) for region in args.regions for tile in tiles(region)]
        for future in as_completed(futures):
            try:
                print(json.dumps(future.result(), ensure_ascii=False), flush=True)
            except Exception as error:
                failures.append(str(error))
                print(json.dumps({'failure': str(error)}, ensure_ascii=False), flush=True)
    if failures:
        raise SystemExit(f'{len(failures)} queries failed; rerun to retry missing snapshots.')
