#!/usr/bin/env python3
"""Reproduce local CHGIS boundary layers from official Dataverse downloads.

Dependencies: pyshp, pyproj, shapely (2.1+). No guessed boundaries are generated.
Original ZIP files, dataset metadata, source fields and conversion reports remain
under data/evidence/boundaries. Run with --offline after the first download.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import logging
import subprocess
import zipfile
from pathlib import Path

import shapefile
from pyproj import CRS
from pyproj.transformer import TransformerGroup
from shapely import get_num_coordinates, make_valid, orient_polygons, set_precision
from shapely.geometry import MultiPolygon, Polygon, mapping, shape
from shapely.ops import transform
from shapely.validation import explain_validity

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "data/evidence/boundaries"
OUTPUT = ROOT / "public/data/boundaries"
API = "https://dataverse.harvard.edu/api"
CITATION = ('"CHGIS Version 6." (c) Fairbank Center for Chinese Studies and the '
            'Institute for Chinese Historical Geography at Fudan University, Dec 2016.')
PRECISION = 0.000001
DATASETS = {
    1820: {
        "dois": ["ST5KKM", "2K4FHX"],
        "layers": [
            ("province", "省及大区域", "province.zip", "utf-8", "ST5KKM", 2966720),
            ("prefecture", "府 / 州等", "prefecture-gbk.zip", "gbk", "2K4FHX", 2966700),
        ],
    },
    1911: {
        "dois": ["0P89R9"],
        "layers": [
            ("province", "省及大区域", "province-gbk.zip", "gbk", "0P89R9", 2966679),
            ("prefecture", "府 / 州等", "prefecture-gbk.zip", "gbk", "0P89R9", 2966676),
            ("county", "县级区域", "county-gbk.zip", "gbk", "0P89R9", 2966678),
        ],
    },
}


def write_json(path: Path, value, *, compact=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, allow_nan=False,
                               separators=(",", ":") if compact else None,
                               indent=None if compact else 2) + "\n", encoding="utf-8")


def md5(path: Path):
    return hashlib.md5(path.read_bytes()).hexdigest()


def download(url: str, path: Path, offline: bool, expected_md5=None):
    if path.exists() and (not expected_md5 or md5(path) == expected_md5):
        return
    if offline:
        raise RuntimeError(f"Missing or checksum-invalid cached source: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".part")
    for attempt in range(3):
        result = subprocess.run(["curl", "-fsSL", "--continue-at", "-", "--max-time", "180",
                                 "-A", "Mozilla/5.0", url, "-o", str(temporary)])
        if result.returncode == 0:
            break
        if attempt == 2:
            result.check_returncode()
    if expected_md5 and md5(temporary) != expected_md5:
        raise RuntimeError(f"Official MD5 mismatch: {url}")
    temporary.replace(path)


def polygon_parts(geometry):
    if isinstance(geometry, Polygon):
        return [geometry]
    if hasattr(geometry, "geoms"):
        return [part for child in geometry.geoms for part in polygon_parts(child)]
    return []


def polygonal(geometry):
    parts = polygon_parts(geometry)
    if not parts:
        raise ValueError("Source feature has no polygonal geometry")
    return parts[0] if len(parts) == 1 else MultiPolygon(parts)


class ShapeWarnings(logging.Handler):
    def __init__(self):
        super().__init__()
        self.messages = []

    def emit(self, record):
        self.messages.append(record.getMessage())


def convert_layer(year, layer, metadata, evidence_dir):
    level, label, archive_name, encoding, doi, file_id = layer
    archive_path = evidence_dir / archive_name
    file_metadata = next(item["dataFile"] for item in metadata[doi]["files"]
                         if item["dataFile"]["id"] == file_id)
    with zipfile.ZipFile(archive_path) as archive:
        stem = next(name[:-4] for name in archive.namelist() if name.endswith(".shp"))
        reader = shapefile.Reader(
            shp=io.BytesIO(archive.read(stem + ".shp")),
            shx=io.BytesIO(archive.read(stem + ".shx")),
            dbf=io.BytesIO(archive.read(stem + ".dbf")), encoding=encoding)
        source_wkt = archive.read(stem + ".prj").decode("utf-8-sig")
        source_crs = CRS.from_wkt(source_wkt)
        transformer = TransformerGroup(source_crs, CRS.from_epsg(4326),
                                       always_xy=True).transformers[0]
        features, corrections, years, conflict_years = [], [], set(), set()
        used_ids, duplicate_record_ids = set(), []
        original_vertices, invalid_source = 0, 0
        shape_warnings = ShapeWarnings()
        logging.getLogger("shapefile").addHandler(shape_warnings)
        for index, row in enumerate(reader.iterShapeRecords()):
            source_fields = row.record.as_dict()
            geometry = shape(row.shape.__geo_interface__)
            original_vertices += len(row.shape.points)
            correction = {"recordIndex": index, "sourceId": source_fields.get("SYS_ID"),
                          "name": source_fields.get("NAME_CH")}
            if not geometry.is_valid:
                invalid_source += 1
                correction["sourceValidity"] = explain_validity(geometry)
                valid = make_valid(geometry)
                correction["makeValidResultType"] = valid.geom_type
                correction["originalAreaSquareMetres"] = geometry.area
                geometry = polygonal(valid)
                correction["repairedAreaSquareMetres"] = geometry.area
            geometry = transform(transformer.transform, geometry)
            if not geometry.is_valid:
                correction["reprojectedValidity"] = explain_validity(geometry)
                geometry = polygonal(make_valid(geometry))
            before_precision = int(get_num_coordinates(geometry))
            geometry = polygonal(set_precision(geometry, PRECISION, mode="valid_output"))
            geometry = orient_polygons(geometry, exterior_cw=False)
            if not geometry.is_valid or geometry.is_empty:
                raise ValueError(f"Unusable geometry: {year}/{level}/{index}")
            if get_num_coordinates(geometry) != before_precision:
                correction["verticesBeforePrecision"] = before_precision
                correction["verticesAfterPrecision"] = int(get_num_coordinates(geometry))
            if len(correction) > 3:
                corrections.append(correction)
            minx, miny, maxx, maxy = geometry.bounds
            if not (-180 <= minx <= maxx <= 180 and -90 <= miny <= maxy <= 90):
                raise ValueError(f"Invalid longitude/latitude extent: {geometry.bounds}")
            point = geometry.representative_point()
            if not geometry.covers(point):
                raise ValueError("Representative point is outside its polygon")
            record_id = str(source_fields.get("SYS_ID", index))
            feature_id = f"chgis-{year}-{level}-{record_id}"
            if feature_id in used_ids:
                duplicate_record_ids.append({"recordId": record_id, "sourceRowIndex": index})
                feature_id += f"-row-{index}"
            used_ids.add(feature_id)
            start, end = source_fields.get("BEG_YR"), source_fields.get("END_YR")
            conflict = start is not None and end is not None and not start <= year <= end
            if start is not None or end is not None:
                years.add((start, end))
            if conflict:
                conflict_years.add((start, end))
            source_name = (source_fields.get("NAME_CH") or source_fields.get("NAME_PY") or "").strip()
            display_name = source_name or f"{source_fields.get('TYPE_CH') or '区域'}（原图未命名） · {record_id}"
            features.append({
                "type": "Feature", "id": feature_id,
                "properties": {
                    **source_fields,
                    "id": feature_id, "name": display_name,
                    "nameBasis": "source-name" if source_name else "unnamed-source-record",
                    "level": level, "sourceId": f"chgis-v6-{year}", "recordId": record_id,
                    "sourceRowIndex": index,
                    "year": year, "approximate": False,
                    "geometryRepaired": "sourceValidity" in correction or "reprojectedValidity" in correction,
                    "sourceYearStart": start, "sourceYearEnd": end,
                    "yearConflict": conflict,
                    "yearBasis": "official-dataset-and-filename",
                    "labelCoordinates": [point.x, point.y],
                    "sourceUrl": f"https://doi.org/10.7910/DVN/{doi}",
                    "sourceFileId": file_id,
                },
                "geometry": mapping(geometry),
            })
        logging.getLogger("shapefile").removeHandler(shape_warnings)
    if len({feature["id"] for feature in features}) != len(features):
        raise ValueError("Duplicate source record IDs")
    filename = f"chgis-{year}-{level}.geojson"
    source_info = {
        "title": f"CHGIS V6 {year}: {file_metadata['filename']}",
        "sourceUrl": f"https://doi.org/10.7910/DVN/{doi}",
        "sourceFileId": file_id, "sourceArchiveMD5": md5(archive_path),
        "citation": CITATION,
        "sourceCRS": source_crs.to_string(), "targetCRS": "EPSG:4326",
        "transformation": transformer.description,
        "transformationAccuracyMetres": transformer.accuracy,
        "coordinatePrecisionDegrees": PRECISION,
        "simplified": False,
        "yearBasis": "Official dataset title and filename; original date fields are retained.",
    }
    conflicts = sum(feature["properties"]["yearConflict"] for feature in features)
    warning = (f"官方文件标为 {year} 年，但 {conflicts} 个区域的原始 BEG_YR / END_YR "
               f"字段与该年冲突（{sorted(conflict_years)}）；异常原值已保留，年份尚未核实。") if conflicts else None
    if warning:
        source_info["warning"] = warning
    collection = {"type": "FeatureCollection", "metadata": source_info, "features": features}
    write_json(OUTPUT / filename, collection, compact=True)
    report = {
        **source_info,
        "featureCount": len(features), "sourceFields": [field[0] for field in reader.fields[1:]],
        "sourceVertexCount": original_vertices,
        "outputVertexCount": sum(int(get_num_coordinates(shape(f["geometry"]))) for f in features),
        "invalidSourceFeatureCount": invalid_source, "invalidOutputFeatureCount": 0,
        "sourceDatePairs": sorted(years), "yearConflictCount": conflicts,
        "duplicateSourceRecordIds": duplicate_record_ids,
        "sourceWarnings": shape_warnings.messages, "geometryCorrections": corrections,
        "outputBytes": (OUTPUT / filename).stat().st_size,
        "outputSHA256": hashlib.sha256((OUTPUT / filename).read_bytes()).hexdigest(),
        "output": str((OUTPUT / filename).relative_to(ROOT)),
    }
    write_json(evidence_dir / f"{level}-conversion-report.json", report)
    manifest_layer = {"id": f"chgis-{year}-{level}", "level": level,
                      "label": label + ("（年份字段冲突）" if warning else ""),
                      "url": f"/data/boundaries/{filename}", "featureCount": len(features)}
    if warning:
        manifest_layer["warning"] = warning
    print(f"{year} {level}: {len(features)} features, {report['outputBytes']:,} bytes; "
          f"{invalid_source} source topology repairs; {conflicts} date conflicts", flush=True)
    return manifest_layer


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true", help="Require cached sources and verify MD5")
    parser.add_argument("--years", nargs="+", type=int, choices=list(DATASETS), default=list(DATASETS))
    args = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    datasets = []
    for year in args.years:
        config = DATASETS[year]
        evidence_dir = EVIDENCE / f"chgis-{year}"
        metadata = {}
        for doi in config["dois"]:
            metadata_path = evidence_dir / f"{doi}-metadata.json"
            download(f"{API}/datasets/:persistentId/?persistentId=doi:10.7910/DVN/{doi}",
                     metadata_path, args.offline)
            metadata[doi] = json.loads(metadata_path.read_text())["data"]["latestVersion"]
        layers = []
        for layer in config["layers"]:
            _, _, archive_name, _, doi, file_id = layer
            source = next(item["dataFile"] for item in metadata[doi]["files"]
                          if item["dataFile"]["id"] == file_id)
            download(f"{API}/access/datafile/{file_id}", evidence_dir / archive_name,
                     args.offline, source["checksum"]["value"])
            layers.append(convert_layer(year, layer, metadata, evidence_dir))
        # Keep actual source license files even when Dataverse's catalog says CC0.
        primary = metadata[config["dois"][0]]
        for entry in primary["files"]:
            source = entry["dataFile"]
            if source["filename"] in ("CHGIS_V6_README.txt", "CHGIS_V6_EULA.txt"):
                download(f"{API}/access/datafile/{source['id']}", evidence_dir / source["filename"],
                         args.offline, source["checksum"]["value"])
        note = ("官方 CHGIS 历史 GIS 面，经原始投影转换为 WGS84。保留原始档案和属性，"
                "仅修复无效拓扑与坐标精度；没有手绘、平滑或补造边界。"
                "省/府层含边疆大区域、特殊区域与岛礁，并非全部属于同一种行政建制；"
                "投影转换仅有 ballpark datum offset，不代表米级精度。")
        if year == 1820:
            note += " 府级官方文件名为1820，但全部320条起止年字段均为1911，年份存在未决冲突。未找到1820县级面，未用点构造县界。千里石塘源环有自交及孤立环，拓扑修复后的计算面积变化约2.63%，该修复不代表史学核定。"
        else:
            note += " " + " ".join(layer["warning"] for layer in layers if layer.get("warning"))
        datasets.append({
            "id": f"chgis-v6-{year}", "title": f"清代 · CHGIS {year} 年资料",
            "year": year, "periodId": "qing", "sourceName": "CHGIS V6 · 哈佛大学 / 复旦大学",
            "sourceUrl": f"https://dataverse.harvard.edu/dataverse/chgis_v6_{year}",
            "accuracy": "historical-gis", "note": note,
            "coverage": "；".join(f"{layer['label']} {layer['featureCount']} 个源区域" for layer in layers)
                        + "。仅显示源资料已有的面，不代表经过核定的国家疆界。",
            "layers": layers,
        })
    manifest_path = OUTPUT / "chgis-manifest.json"
    # --years permits incremental conversion without deleting other delivered years.
    if manifest_path.exists():
        previous = json.loads(manifest_path.read_text()).get("datasets", [])
        datasets.extend(item for item in previous if item["year"] not in args.years)
    write_json(manifest_path, {"version": "chgis-v6-local-1", "datasets": sorted(datasets, key=lambda d: d["year"])})
    print(f"Manifest: {manifest_path}")


if __name__ == "__main__":
    main()
