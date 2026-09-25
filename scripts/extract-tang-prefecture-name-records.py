#!/usr/bin/env python3
"""Archive verifiable Tang-period CHGIS prefecture name records for crosswalks.

This extracts source attributes and original POINT coordinates. It creates no
boundaries and does not infer identity from proximity or from containment alone.
"""
from pathlib import Path
import hashlib
import io
import json
import zipfile
import shapefile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data/evidence/tang-detail/chgis/prefecture-wgs84.zip'
OUTPUT = ROOT / 'data/evidence/tang-detail/chgis/tang-prefecture-name-records.json'


def build():
    archive = zipfile.ZipFile(SOURCE)
    reader = shapefile.Reader(**{Path(name).suffix[1:]: io.BytesIO(archive.read(name))
                                 for name in archive.namelist() if name.endswith(('.shp', '.shx', '.dbf'))}, encoding='utf-8')
    records, withheld = [], []
    for record in reader.iterShapeRecords():
        source = record.record.as_dict()
        begin, end = source['BEG_YR'], source['END_YR']
        if not isinstance(begin, int) or not isinstance(end, int) or begin > 907 or end < 618:
            continue
        original_coordinates = list(record.shape.points[0])
        coordinates = [round(value, 6) for value in original_coordinates]
        item = {'recordId': str(source['SYS_ID']), 'sourceRecordIndex': record.record.oid,
                'coordinates': coordinates, 'originalCoordinates': original_coordinates, 'sourceRecord': source}
        delta = max(abs(a - b) for a, b in zip(coordinates, [source['X_COOR'], source['Y_COOR']]))
        if delta > 0.02:
            withheld.append({**item, 'maxDeltaDegrees': delta, 'reason': 'SHP与同条坐标属性差超过0.02度，沿用治所构建隔离规则。'})
        else:
            records.append(item)
    records.sort(key=lambda item: int(item['recordId']))
    output = {'version': 1, 'sourcePath': str(SOURCE.relative_to(ROOT)),
              'sourceUrl': 'https://doi.org/10.7910/DVN/WW1PD6',
              'sourceSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
              'selection': '原始府州POINT记录存续闭区间与618—907年有交集；保留起讫年、变更类型、原始SHP坐标及源字段。不是唐直辖政区清单。',
              'records': records, 'withheld': withheld}
    OUTPUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'records': len(records), 'withheld': len(withheld)}))


if __name__ == '__main__':
    build()
