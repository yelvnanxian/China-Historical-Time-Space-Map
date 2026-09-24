#!/usr/bin/env python3
"""Extract the 22 curated modern reference records from a downloaded GeoNames CN.zip.

The archive path is explicit; normal application builds do not download data.
The archive modification time must be the actual download time, not a later copy time.
"""
from datetime import datetime, timezone
from pathlib import Path
import argparse
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data/evidence/tang-expansion/north-west'


def extract(archive):
    inputs_path = ROOT / 'data/tang-expansion/north-west-places.json'
    inputs = json.loads(inputs_path.read_text())
    wanted = {item['geonameId'] for item in inputs}
    with zipfile.ZipFile(archive) as package:
        rows = {}
        for line in package.read('CN.txt').decode().splitlines():
            columns = line.split('\t')
            if columns[0] in wanted:
                assert len(columns) == 19 and columns[6] == 'P', columns[0]
                rows[columns[0]] = (line, columns)
    assert set(rows) == wanted, f'Missing GeoNames IDs: {wanted - set(rows)}'
    records = []
    for item in inputs:
        raw, row = rows[item['geonameId']]
        original = [float(row[5]), float(row[4])]
        display = [round(number, 2) for number in original]
        item['coordinates'] = display
        records.append({'placeId': item['id'], 'geonameId': item['geonameId'],
                        'rawRecord': raw, 'sourceCoordinates': original,
                        'displayCoordinates': display, 'coordinateRole': 'modern-regional-reference'})
    downloaded_at = datetime.fromtimestamp(archive.stat().st_mtime, timezone.utc).isoformat()
    snapshot = OUT / 'geonames-selection.json'
    snapshot.write_text(json.dumps({
        'sourceUrl': 'https://download.geonames.org/export/dump/CN.zip',
        'downloadedAt': downloaded_at,
        'archiveSha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
        'archiveBytes': archive.stat().st_size,
        'license': 'CC BY 4.0；署名GeoNames https://www.geonames.org/',
        'coordinateNotice': '仅采用现代居民点作地区参考，显示坐标四舍五入到0.01度；不是古城址或遗址定位。',
        'selectedRecords': records,
    }, ensure_ascii=False, indent=2) + '\n')
    metadata_path = OUT / 'geonames.json'
    metadata = json.loads(metadata_path.read_text())
    metadata.update({'retrievedAt': downloaded_at, 'snapshotSha256': hashlib.sha256(snapshot.read_bytes()).hexdigest()})
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
    inputs_path.write_text(json.dumps(inputs, ensure_ascii=False, indent=2) + '\n')
    print(f'Extracted {len(records)} modern reference records; historical sites remain unverified.')


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--archive', type=Path, required=True, help='Actual downloaded GeoNames CN.zip')
    extract(cli.parse_args().archive)
