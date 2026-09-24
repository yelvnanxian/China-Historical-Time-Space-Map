#!/usr/bin/env python3
"""Import original Hartwell V5 administrative polygons without smoothing/dissolving.

Requires: pip install pyshp pyproj shapely
The checked original shapefile components are saved in data/evidence/hartwell/
source-layers.zip. --download reacquires them using verified ZIP range requests.
"""
from __future__ import annotations

import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import struct
import tempfile
import time
from urllib.request import Request, urlopen
import zipfile
import zlib

import pyproj
from pyproj import CRS, Transformer
import shapefile
import shapely
from shapely.geometry import mapping, shape
from shapely.ops import transform

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "data/evidence/hartwell"
OUTPUT = ROOT / "public/data/boundaries"
API = "https://dataverse.harvard.edu/api/access/datafile/2542563"
DOI = "https://doi.org/10.7910/DVN/29302"
SOURCE_ID = "hartwell-chgis-v5"
YEARS = (741, 1080, 1200, 1290, 1391)
PERIODS = {741: "tang", 1080: "song", 1200: "song", 1290: "yuan", 1391: "ming"}
TITLES = {741: "唐及周边 · 741 年", 1080: "宋辽及周边 · 1080 年", 1200: "宋金及周边 · 1200 年", 1290: "元及周边 · 1290 年", 1391: "明及周边 · 1391 年"}
COLORS = ("#bb8068", "#839b7a", "#7f9eae", "#af91ad", "#bda26a", "#78a19c", "#d09775", "#9296b6", "#9faa70", "#b58191", "#72928d", "#a49373")
LABELS = {"country": "独立政权 / 诸部（源分类）", "province": "道 / 路 / 省及同层单位", "prefecture": "府 / 州及同层单位", "county": "县及同层单位"}


def write_json(path, value, pretty=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, allow_nan=False,
                               indent=2 if pretty else None,
                               separators=None if pretty else (",", ":")) + "\n")


def selected(name):
    return (name.endswith((".shp", ".shx", ".dbf", ".prj"))
            and (("_chin_chn_" in name) or "_0741_circ_" in name))


def download():
    """Keep exact original members; their ZIP CRC checks catch range corruption."""
    with urlopen(Request(API, headers={"Range": "bytes=-262144"}), timeout=90) as response:
        final_url = response.geturl()
        total = int(response.headers["Content-Range"].split("/")[-1])
        tail = response.read()
    eocd = struct.unpack("<4s4H2LH", tail[tail.rfind(b"PK\x05\x06"):][:22])
    assert eocd[5] <= len(tail) - 22, "ZIP directory exceeds initial tail"
    with tempfile.TemporaryFile() as sparse:
        sparse.truncate(total)
        sparse.seek(total - len(tail))
        sparse.write(tail)
        with zipfile.ZipFile(sparse) as archive:
            infos = sorted(archive.infolist(), key=lambda item: item.header_offset)
    entries = []
    for index, info in enumerate(infos):
        if selected(info.filename):
            end = infos[index + 1].header_offset if index + 1 < len(infos) else eocd[6]
            entries.append((info, end))

    def get_range(start, end):
        for attempt in range(3):
            try:
                with urlopen(Request(final_url, headers={"Range": f"bytes={start}-{end}"}), timeout=90) as response:
                    data = response.read()
                assert len(data) == end - start + 1
                return data
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(attempt + 1)

    EVIDENCE.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=24) as pool:
        pieces = {info.filename: [pool.submit(get_range, offset, min(offset + 262143, end - 1))
                  for offset in range(info.header_offset, end, 262144)] for info, end in entries}
        with zipfile.ZipFile(EVIDENCE / "source-layers.zip", "w", zipfile.ZIP_DEFLATED) as archive:
            for info, _ in entries:
                raw = b"".join(future.result() for future in pieces[info.filename])
                header = struct.unpack("<4s5H3L2H", raw[:30])
                start = 30 + header[-2] + header[-1]
                compressed = raw[start:start + info.compress_size]
                data = zlib.decompress(compressed, -15) if header[3] == 8 else compressed
                assert len(data) == info.file_size and zlib.crc32(data) == info.CRC
                archive.writestr(Path(info.filename).name, data)
                print("Downloaded", info.filename, flush=True)


def independence(record):
    return record.get("H_ADMIN_TY", "").lower().startswith("independent")


def normalize_name(record):
    name = record.get("H_UNICODE_", "").strip()
    if not name or "\ufffd" in name:
        return record.get("H_PINYIN_N", "").strip() or record.get("CODE") or "来源未命名区域"
    suffix = {"Xian": "縣", "Zhou": "州", "Fu": "府", "Dao": "道", "Lu": "路", "Sheng": "省"}.get(record.get("H_ADMIN_TY"))
    if suffix and not name.endswith(suffix):
        name += suffix
    return name


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--download", action="store_true")
    parser.add_argument("--input-dir", type=Path, help="Use extracted original components")
    parser.add_argument("--years", nargs="+", type=int, default=list(YEARS))
    args = parser.parse_args()
    if args.download:
        download()
    original_archive = EVIDENCE / "source-layers.zip"
    with tempfile.TemporaryDirectory(prefix="hartwell-convert-") as temporary:
        input_dir = args.input_dir or Path(temporary)
        if not args.input_dir:
            with zipfile.ZipFile(original_archive) as archive:
                archive.extractall(input_dir)
        datasets, reports, source_members = [], [], []
        for year in args.years:
            prefix = f"v5_{year:04d}_chin_chn_{year:04d}"
            sources = [(f"{prefix}_c", "county"), (f"{prefix}_{'l' if year == 1290 else 'p'}", "prefecture")]
            if year == 741:
                sources += [(path.stem, "province") for path in sorted(input_dir.glob("v5_0741_circ_*.shp"))]
                country_stem = f"{prefix}_p"
            else:
                country_stem = f"{prefix}_{'l' if year in (1080, 1200) else 's'}"
                sources.append((country_stem, "province"))
            layers = {level: [] for level in LABELS}
            year_report = {"year": year, "sourceLayers": [], "invalidSourceFeatures": [], "invalidTransformedFeatures": [], "nameFallbacks": [], "repeatedVerticesForRingEncoding": []}
            for stem, container_level in sources:
                path = input_dir / (stem + ".shp")
                source_crs = CRS.from_wkt(path.with_suffix(".prj").read_text())
                assert source_crs.to_epsg() == 2333
                transformer = Transformer.from_crs(source_crs, "EPSG:4326", always_xy=True)
                reader = shapefile.Reader(str(path), encoding="big5", encodingErrors="replace")
                counts = Counter()
                for feature_index, item in enumerate(reader.iterShapeRecords()):
                    record = item.record.as_dict()
                    if independence(record):
                        if stem != country_stem:
                            continue
                        level = "country"
                    else:
                        level = container_level
                    source_geom = shape(item.shape.__geo_interface__)
                    # GEOS pads a degenerate three-position ring with an existing
                    # endpoint; record this encoding change without altering its path.
                    padding = int(shapely.get_num_coordinates(source_geom)) - len(item.shape.points)
                    if padding:
                        year_report["repeatedVerticesForRingEncoding"].append({"sourceLayer": stem, "sourceRecordIndex": feature_index, "repeatedVertices": padding})
                    if source_geom.is_empty:
                        raise ValueError(f"Unexpected empty original geometry: {stem} #{feature_index}")
                    if not source_geom.is_valid:
                        year_report["invalidSourceFeatures"].append(f"{stem}#{feature_index}")
                    geometry = transform(transformer.transform, source_geom)
                    if not geometry.is_valid:
                        year_report["invalidTransformedFeatures"].append(f"{stem}#{feature_index}")
                    # No repair, dissolve, simplification, smoothing, or manual vertex edits.
                    assert geometry.geom_type in ("Polygon", "MultiPolygon")
                    minx, miny, maxx, maxy = geometry.bounds
                    assert 50 < minx <= maxx < 160 and 0 < miny <= maxy < 65
                    point = geometry.representative_point()
                    assert geometry.covers(point)
                    key = next((key for key in record if key.endswith("_I")), None)
                    record_id = str(record[key]) if key else str(feature_index)
                    if record_id.endswith(".0"):
                        record_id = record_id[:-2]
                    name = normalize_name(record)
                    if not record.get("H_UNICODE_", "").strip() or "\ufffd" in record.get("H_UNICODE_", ""):
                        year_report["nameFallbacks"].append({"sourceLayer": stem, "recordId": record_id, "displayName": name})
                    color_key = record.get("H_CHINPROV") or record.get("H_SUP_CHPV") or name
                    color = COLORS[int(hashlib.sha256(color_key.encode()).hexdigest()[:8], 16) % len(COLORS)]
                    properties = {
                        "id": f"hartwell-{year}-{level}-{stem}-{record_id}", "name": name,
                        "level": level, "sourceId": SOURCE_ID, "year": year,
                        "approximate": True, "color": color, "recordId": record_id,
                        "sourceLayer": stem, "sourceRecordIndex": feature_index,
                        "sourceCode": record.get("CODE", ""), "sourceName": record.get("H_UNICODE_", ""),
                        "sourceAdminType": record.get("H_ADMIN_TY", ""),
                        "sourceContainerLevel": container_level,
                        "sourceHierarchy": {"polity": record.get("H_SUP_CHPV", ""), "province": record.get("H_CHINPROV", ""), "prefecture": record.get("H_CHIN_PRF", ""), "dependentPrefecture": record.get("H_CHIN_DPR", "")},
                        "labelCoordinates": [point.x, point.y],
                    }
                    layers[level].append({"type": "Feature", "id": properties["id"], "properties": properties, "geometry": mapping(geometry)})
                    counts[level] += 1
                year_report["sourceLayers"].append({"name": stem, "originalFeatureCount": reader.numRecords, "exportedByLevel": dict(counts), "crs": source_crs.to_string(), "transform": transformer.description, "transformAccuracyMeters": transformer.accuracy})
                for extension in (".shp", ".dbf", ".shx", ".prj"):
                    member = path.with_suffix(extension)
                    raw = member.read_bytes()
                    source_members.append({"name": member.name, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(), "crc32": f"{zlib.crc32(raw):08x}"})
            manifest_layers = []
            for level, features in layers.items():
                if not features:
                    continue
                filename = f"hartwell-{year}-{level}.geojson"
                geojson = {"type": "FeatureCollection", "name": f"Hartwell {year} {level}", "features": features}
                write_json(OUTPUT / filename, geojson)
                manifest_layers.append({"id": f"hartwell-{year}-{level}", "level": level, "label": LABELS[level], "url": f"/data/boundaries/{filename}", "featureCount": len(features)})
            note = "Hartwell 近似行政模型；现代县界拼合、分割所得，保留原始轮廓。独立政权/诸部来自源记录分类；未构造唐、宋、辽、金、元、明的完整国界。"
            if year == 741:
                note += "原始文件为 741 年，README 写 742 年；按文件年份展示，不能代表 755 年实控疆界。"
            if year == 1290:
                note += "原始文件为 1290 年，README 写 1280 年；按文件年份展示。"
            datasets.append({"id": f"hartwell-{year}", "title": TITLES[year], "year": year, "periodId": PERIODS[year], "sourceName": "Hartwell China Historical GIS · CHGIS V5", "sourceUrl": DOI, "accuracy": "approximate-model", "note": note, "coverage": "原数据覆盖的历史行政区与部分周边独立政权/诸部；不保证完整疆域。层级为原图层的显示分组，具体行政类型保留在每条记录中。", "layers": manifest_layers})
            year_report["exportedCounts"] = {level: len(features) for level, features in layers.items()}
            reports.append(year_report)
            print(year, year_report["exportedCounts"], flush=True)
        write_json(OUTPUT / "hartwell-manifest.json", {"version": "1.0", "datasets": datasets}, pretty=True)
        report = {"createdAt": datetime.now(timezone.utc).isoformat(), "sourceId": SOURCE_ID, "sourceUrl": DOI, "sourceFileId": 2542563, "inputCrs": "EPSG:2333", "outputCrs": "EPSG:4326", "originalCrsCaveat": "The 2010 projection notes assume the undefined original coordinates are WGS84. PROJ uses a ballpark Xian 1980 to WGS84 datum offset; accuracy is unknown.", "geometryOperations": ["Inverse Gauss-Kruger projection and ballpark datum transformation only", "No dissolve, manual boundary editing, repair, smoothing or simplification"], "libraries": {"pyshp": shapefile.__version__, "pyproj": pyproj.__version__, "shapely": shapely.__version__}, "sourceMembers": source_members, "datasets": reports}
        if original_archive.exists():
            report["preservedOriginalMembersArchive"] = {"path": str(original_archive.relative_to(ROOT)), "sha256": hashlib.sha256(original_archive.read_bytes()).hexdigest()}
        write_json(EVIDENCE / "import-validation.json", report, pretty=True)


if __name__ == "__main__":
    main()
