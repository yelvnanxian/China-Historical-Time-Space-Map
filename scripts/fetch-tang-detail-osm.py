#!/usr/bin/env python3
"""Acquire actual modern water/peak geometries for regional offline detail packs.

No synthetic rivers, buffers or historical reconstructions. Reuses successful
snapshots unless --refresh is passed. Two requests maximum run concurrently.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
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
    'west-chengdu': ('成都—都江堰与岷沱水系', [103.45, 30.15, 104.9, 31.25]),
    'west-lanzhou': ('兰州黄河走廊', [103.25, 35.8, 104.55, 36.55]),
    'west-tianshui': ('天水与渭河上游', [105.05, 34.05, 106.35, 34.85]),
    'west-wuwei': ('武威与石羊河绿洲', [102.3, 37.5, 103.15, 38.35]),
    'west-zhangye': ('张掖与黑河绿洲', [100.05, 38.4, 100.95, 39.15]),
    'west-jiuquan': ('酒泉与讨赖河绿洲', [98.05, 39.25, 99, 40.05]),
    'west-dunhuang': ('敦煌与党河绿洲', [94.25, 39.55, 95.1, 40.5]),
    'west-qiuci': ('龟兹与库车河绿洲', [82.35, 41.3, 83.65, 42.25]),
    'west-yanqi': ('焉耆—博斯腾湖西岸', [86, 41.55, 87.05, 42.45]),
    'west-hami': ('伊吾与哈密绿洲', [92.9, 42.4, 93.95, 43.35]),
    'west-turpan': ('交河—高昌与吐鲁番绿洲', [88.5, 42.45, 89.65, 43.35]),
    'west-hotan': ('于阗与和田双河绿洲', [79.55, 36.7, 80.4, 37.55]),
    'west-kashgar': ('疏勒与喀什绿洲', [75.55, 39.15, 76.6, 39.95]),
    'west-lhasa': ('拉萨河下游与拉萨地区', [90.65, 29.2, 91.65, 30]),
    'west-shannan': ('山南与雅鲁藏布江走廊', [91.35, 29, 92.15, 29.65]),
    'city-beijing': ('幽州北京附近水系', [116.2, 39.7, 116.6, 40.1]),
    'city-jinyang': ('晋阳与汾河附近水系', [112.25, 37.53, 112.65, 37.93]),
    'city-xiangyang': ('襄阳与汉水附近水系', [111.94, 31.84, 112.34, 32.24]),
    'city-jingzhou': ('江陵荆州附近水系', [112.04, 30.14, 112.44, 30.54]),
    'city-jiangxia': ('江夏武汉附近水系', [114.1128, 30.3547, 114.5128, 30.7547]),
    'city-changsha': ('潭州长沙附近水系', [112.739, 28.028, 113.139, 28.428]),
    'city-guangzhou': ('广州与珠江附近水系', [113.07, 22.93, 113.47, 23.33]),
    'city-quanzhou': ('泉州与晋江附近水系', [118.48, 24.68, 118.88, 25.08]),
    'city-fuzhou': ('福州与闽江附近水系', [119.0833, 25.95, 119.4833, 26.35]),
    'city-jinan': ('齐州济南附近水系', [116.8, 36.47, 117.2, 36.87]),
    'city-qingzhou-linzi': ('青州与临淄附近水系', [118.11, 36.5, 118.68, 37.02]),
    # These are modern acquisition windows, not Ming jurisdiction boundaries.
    'city-ming-datong': ('大同与御河附近水系', [113.1, 39.88, 113.5, 40.28]),
    'city-ming-handan': ('邯郸与滏阳河附近水系', [114.29, 36.41, 114.69, 36.81]),
    'city-ming-yinchuan': ('银川与黄河走廊', [106.03, 38.29, 106.65, 38.69]),
    'city-ming-dali': ('大理与洱海', [99.97, 25.49, 100.37, 26.0]),
    'city-ming-yanzhou': ('兖州与泗河附近水系', [116.63, 35.35, 117.03, 35.75]),
    'city-ming-nanchang': ('南昌与赣江附近水系', [115.658, 28.483, 116.058, 28.883]),
    # The original Chongqing window timed out at both endpoints. These adjacent
    # subwindows preserve its entire area and retain separate original replies.
    'city-ming-chongqing-west': ('重庆西部附近水系', [106.3504, 29.3637, 106.5504, 29.7637]),
    'city-ming-chongqing-east': ('重庆东部附近水系', [106.5504, 29.3637, 106.7504, 29.7637]),
    'city-ming-guilin': ('桂林与漓江附近水系', [109.9799, 25.0344, 110.45, 25.4344]),
    # Song entry expansion: present-day local detail only, never Song river reconstruction.
    'city-song-jiujiang': ('九江与长江南岸水系', [115.8026, 29.5054, 116.2026, 29.9054]),
    'city-song-hengzhou': ('衡阳与湘江水系', [112.372, 26.693, 112.772, 27.093]),
    'city-song-wenzhou': ('温州与瓯江水系', [120.499, 27.793, 120.899, 28.193]),
    'city-song-santai': ('三台与涪江水系', [104.8936, 30.8958, 105.2936, 31.2958]),
    # A 0.4-degree window timed out at both mirrors; keep a narrower real query.
    'city-song-mianyang': ('绵阳与涪江水系', [104.5579, 31.347, 104.7979, 31.587]),
    'city-song-jiange': ('剑阁附近水系', [105.324, 32.088, 105.724, 32.488]),
    'city-song-hanzhong': ('汉中与汉江水系', [106.8233, 32.8675, 107.2233, 33.2675]),
    'city-song-fengjie': ('奉节与长江峡江水系', [109.265, 30.8175, 109.665, 31.2175]),
    'city-song-langzhong': ('阆中与嘉陵江水系', [105.805, 31.358, 106.205, 31.758]),
    'city-song-suining': ('遂宁与涪江水系', [105.3923, 30.3333, 105.7923, 30.7333]),
    'city-song-yueyang': ('岳阳与洞庭湖东岸水系', [112.93, 29.16, 113.33, 29.56]),
    'city-song-jian': ('吉安与赣江水系', [114.76, 26.89, 115.16, 27.29]),
    'city-song-ganzhou': ('赣州与章贡双江水系', [114.73, 25.63, 115.13, 26.03]),
}
ENDPOINT = 'https://overpass.kumi.systems/api/interpreter'
ALTERNATE_ENDPOINT = 'https://overpass.private.coffee/api/interpreter'


def fetch(region, refresh=False, preferred_endpoint=ENDPOINT):
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
    if response_path.exists() and metadata_path.exists() and not refresh:
        meta = json.loads(metadata_path.read_text())
        assert hashlib.sha256(response_path.read_bytes()).hexdigest() == meta['snapshotSha256']
        assert hashlib.sha256(query_path.read_bytes()).hexdigest() == meta['querySha256']
        return {'region': region, 'cached': True, 'elements': meta['elementCount']}
    query_path.write_text(query)
    temp = response_path.with_suffix('.part')
    errors = []
    for attempt in range(3):
        endpoints = [preferred_endpoint, ALTERNATE_ENDPOINT if preferred_endpoint == ENDPOINT else ENDPOINT]
        endpoint = endpoints[attempt % len(endpoints)]
        response = subprocess.run(['curl', '-G', '-L', '--fail', '--max-time', '145', '-sS',
                                   '--data-urlencode', f'data@{query_path}', endpoint, '-o', str(temp)],
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
            print(json.dumps({'region': region, 'attempt': attempt + 1, 'endpoint': endpoint, 'error': str(error)}, ensure_ascii=False), flush=True)
            if attempt == 2:
                raise RuntimeError(f'{region}: {errors}') from error
    response_path.write_bytes(gzip.compress(raw_bytes, compresslevel=9, mtime=0))
    temp.unlink()
    metadata = {
        'id': f'osm-tang-detail-{region}', 'title': f'OpenStreetMap 现代地理：{label}',
        'url': 'https://www.openstreetmap.org/copyright', 'endpoint': endpoint,
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
        'note': '真实OSM河流、溪流、运河、水面、山峰与山口记录。现代参照，不代表所选朝代的河道、湖岸或水利工程。查询框仅表示采集窗口，不是历史辖区或自然地物边界。',
    }
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
    return {'region': region, 'cached': False, 'elements': len(raw['elements']), 'bytes': response_path.stat().st_size}


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--regions', nargs='+', choices=list(REGIONS), default=list(REGIONS))
    cli.add_argument('--refresh', action='store_true')
    cli.add_argument('--endpoint', choices=[ENDPOINT, ALTERNATE_ENDPOINT], default=ENDPOINT)
    args = cli.parse_args()
    failures = []
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(fetch, region, args.refresh, args.endpoint) for region in args.regions]
        for future in as_completed(futures):
            try:
                print(json.dumps(future.result(), ensure_ascii=False), flush=True)
            except Exception as error:
                failures.append(str(error))
                print(json.dumps({'failure': str(error)}, ensure_ascii=False), flush=True)
    if failures:
        raise SystemExit(f'{len(failures)} queries failed; rerun to retry missing snapshots.')
