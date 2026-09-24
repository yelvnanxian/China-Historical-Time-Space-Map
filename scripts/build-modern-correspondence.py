#!/usr/bin/env python3
"""Build spatial modern-name references without changing historical GeoJSON.

Requires shapely>=2.1 and opencc-python-reimplemented.
Run with --offline to require the retained, SHA256-verified source snapshots.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import subprocess
import zipfile
from collections import Counter
from pathlib import Path

from opencc import OpenCC
from shapely import STRtree, make_valid
from shapely.geometry import Point, shape

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "data/evidence/modern-correspondence"
OUT = ROOT / "public/data/modern-correspondence.json"
CC = OpenCC("t2s")
PROVINCE_TRANSLATIONS = {"HongKong": "香港特别行政区", "Macau": "澳门特别行政区"}
GB_TRANSLATIONS = {
    "Hainan Province": "海南省", "Taiwan Province": "台湾省",
    "Guangxi Zhuang Autonomous Region": "广西壮族自治区", "Fujian Province": "福建省",
    "Yunnan Province": "云南省", "Guizhou Province": "贵州省", "Jiangxi Province": "江西省",
    "Hunan Province": "湖南省", "Zhejiang Province": "浙江省", "Shanghai Municipality": "上海市",
    "Chongqing Municipality": "重庆市", "Hubei Province": "湖北省", "Sichuan Province": "四川省",
    "Anhui Province": "安徽省", "Jiangsu Province": "江苏省", "Henan Province": "河南省",
    "Tibet Autonomous Region": "西藏自治区", "Shandong Province": "山东省", "Qinghai Province": "青海省",
    "Ningxia Ningxia Hui Autonomous Region": "宁夏回族自治区", "Shaanxi Province": "陕西省",
    "Tianjin Municipality": "天津市", "Shanxi Province": "山西省", "Beijing Municipality": "北京市",
    "Gansu Province": "甘肃省", "Hebei Province": "河北省", "Liaoning Province": "辽宁省",
    "Jilin Province": "吉林省", "Xinjiang Uyghur Autonomous Region": "新疆维吾尔自治区",
    "Inner Mongolia Autonomous Region": "内蒙古自治区", "Heilongjiang Province": "黑龙江省",
    "Macau Special Administrative Region": "澳门特别行政区",
    "Hong Kong Special Administrative Region": "香港特别行政区",
    # Upstream's English label is wrong; this polygon covers Guangdong. Disclosed in source notes.
    "Guangzhou Province": "广东省",
}
SOURCES = [
    {"id": "gadm41-chn-adm1", "title": "GADM 4.1 中国省级参考面（2022版）",
     "url": "https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_CHN_1.json.zip",
     "year": 2022, "version": "4.1", "coordinateSystem": "OGC:CRS84 / WGS84 longitude-latitude",
     "note": "官方GeoJSON声明CRS84；NL_NAME_1中文名经OpenCC转简体。2022是文件版本时间，不代表2026实时区划，也不是每条边界的核验日期。源含特殊区域和重复省名分区，按原记录处理。许可原文保留于gadm-license.html。"},
    {"id": "gadm41-chn-adm2", "title": "GADM 4.1 中国市、州等二级参考面（2022版）",
     "url": "https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_CHN_2.json.zip",
     "year": 2022, "version": "4.1", "coordinateSystem": "OGC:CRS84 / WGS84 longitude-latitude",
     "note": "使用源NL_NAME_2及GID_1父级关系；层中含地级市、自治州等不同建制，香港部分是区级，不能把所有记录都叫地级市。个别缺中文名时保留源英文名，不编造中文名。2022是数据版本时间，不承诺后续区划更名已同步。"},
    {"id": "geoboundaries-chn-adm1-2019", "title": "geoBoundaries 中国省级参考面（2019资料）",
     "url": "https://www.geoboundaries.org/api/current/gbOpen/CHN/ADM1/",
     "year": 2019, "version": "9469f09 / CHN-ADM1-43563684",
     "coordinateSystem": "OGC:CRS84 / WGS84 longitude-latitude",
     "note": "仅在GADM无省级对应时补充，包括台湾资料。34个源面较粗，省名采用明确的中英对照表；源误写Guangzhou Province的广东面显示广东省，原字段未改。Public Domain。"},
    {"id": "natural-earth-countries-5.1.1", "title": "Natural Earth 5.1.1 国家及地区参考面",
     "url": "https://github.com/nvkelso/natural-earth-vector/blob/ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_10m_admin_0_countries.geojson",
     "version": "5.1.1", "coordinateSystem": "OGC:CRS84 / WGS84 longitude-latitude",
     "note": "WGS84，1:10,000,000比例尺，NAME_ZH中文名经OpenCC转简体；用于境外或更细行政区无覆盖时的国家/地区级对应。小岛和海岸仍可能有资料缺口。Public domain。"},
    {"id": "opencc-t2s", "title": "OpenCC 繁体转简体字形转换",
     "url": "https://github.com/yichen0831/opencc-python",
     "version": "opencc-python-reimplemented 0.1.7 / t2s",
     "note": "只进行繁简字形转换，不把古名改成今名，不进行行政实体等同推断；historicalName始终保留源显示名。"},
]


def write_json(path, value, compact=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, allow_nan=False,
                               indent=None if compact else 2,
                               separators=(",", ":") if compact else None) + "\n", encoding="utf-8")


def ensure_sources(offline):
    manifest = json.loads((EVIDENCE / "download-manifest.json").read_text())
    for item in manifest["assets"]:
        path = EVIDENCE / item["file"]
        if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() == item["sha256"]:
            continue
        if offline:
            raise ValueError(f"Missing or changed source snapshot: {path}")
        temporary = path.with_suffix(path.suffix + ".part")
        for attempt in range(3):
            result = subprocess.run(["curl", "-fsSL", "--continue-at", "-", "--max-time", "240",
                                     item["url"], "-o", str(temporary)])
            if result.returncode == 0:
                break
            if attempt == 2:
                result.check_returncode()
        if hashlib.sha256(temporary.read_bytes()).hexdigest() != item["sha256"]:
            raise ValueError(f"Source SHA256 mismatch: {path}")
        temporary.replace(path)
    return manifest


def load_geojson(filename):
    path = EVIDENCE / filename
    if filename.endswith(".zip"):
        with zipfile.ZipFile(path) as archive:
            document = json.loads(archive.read(next(n for n in archive.namelist() if n.endswith(".json"))))
    else:
        document = json.loads(path.read_text())
    declared_crs = document.get("crs", {}).get("properties", {}).get("name", "")
    if declared_crs != "urn:ogc:def:crs:OGC:1.3:CRS84":
        raise ValueError(f"Unverified source CRS: {filename}: {declared_crs}")
    return document


class SpatialIndex:
    def __init__(self, document, source_id, level, names):
        self.features, self.geometries, self.repairs = [], [], []
        self.source_id, self.level = source_id, level
        for index, feature in enumerate(document["features"]):
            geometry = shape(feature["geometry"])
            if not geometry.is_valid:
                self.repairs.append(index)
                geometry = make_valid(geometry)
            if geometry.is_empty:
                raise ValueError(f"Empty reference geometry {source_id}/{index}")
            properties = feature["properties"]
            name = names(properties)
            if not name:
                raise ValueError(f"Empty reference name {source_id}/{index}")
            self.features.append({"properties": properties, "name": name,
                                  "sourceFeatureIndex": index})
            self.geometries.append(geometry)
        self.tree = STRtree(self.geometries)

    def query(self, point):
        return [self.features[int(index)] for index in self.tree.query(point, predicate="intersects")]


def local_name(properties, level):
    value = properties.get(f"NL_NAME_{level}", "")
    if value and value != "NA":
        return CC.convert(value.split("|")[0].strip())
    original = properties.get(f"NAME_{level}", "")
    return PROVINCE_TRANSLATIONS.get(original, original)


def region(feature, source_id, level, year=None, parent_relation=False):
    p = feature["properties"]
    result = {"name": feature["name"], "level": level, "sourceId": source_id,
              "sourceFeatureIndex": feature["sourceFeatureIndex"],
              "sourceRecordId": p.get("GID_2") if level == "prefecture" else p.get("GID_1") or p.get("shapeID") or p.get("ADM0_A3")}
    if year is not None:
        result["referenceYear"] = year
    if parent_relation:
        result["relation"] = "source-prefecture-parent"
    if p.get("ENGTYPE_2") or p.get("ENGTYPE_1"):
        result["sourceType"] = p.get("ENGTYPE_2") or p.get("ENGTYPE_1")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()
    source_manifest = ensure_sources(args.offline)
    provinces = SpatialIndex(load_geojson("gadm41_CHN_1.json.zip"), SOURCES[0]["id"], "province", lambda p: local_name(p, 1))
    prefectures = SpatialIndex(load_geojson("gadm41_CHN_2.json.zip"), SOURCES[1]["id"], "prefecture", lambda p: local_name(p, 2))
    supplement = SpatialIndex(load_geojson("chn-adm1.geojson"), SOURCES[2]["id"], "province", lambda p: GB_TRANSLATIONS[p["shapeName"]])
    countries = SpatialIndex(load_geojson("ne-countries.geojson"), SOURCES[3]["id"], "country-or-area", lambda p: CC.convert(p.get("NAME_ZH") or p["ADMIN"]))
    province_by_id = {f["properties"]["GID_1"]: f for f in provinces.features}
    boundary_manifest = json.loads((ROOT / "public/data/boundaries/manifest.json").read_text())
    entries, layer_stats, unmatched, historical_hashes = {}, [], [], []
    global_counts = Counter()
    for dataset in boundary_manifest["datasets"]:
        for layer in dataset["layers"]:
            path = ROOT / "public" / layer["url"].lstrip("/")
            original_bytes = path.read_bytes()
            historical_hashes.append({"file": str(path.relative_to(ROOT)), "sha256": hashlib.sha256(original_bytes).hexdigest()})
            document = json.loads(original_bytes)
            counts = Counter()
            for feature in document["features"]:
                p = feature["properties"]
                feature_id = str(p.get("id") or feature["id"])
                if feature_id in entries:
                    raise ValueError(f"Duplicate historical ID: {feature_id}")
                historical_name = p["name"]
                coordinates = p.get("labelCoordinates")
                valid_point = (isinstance(coordinates, list) and len(coordinates) == 2
                               and all(isinstance(value, (float, int)) and math.isfinite(value) for value in coordinates)
                               and -180 <= coordinates[0] <= 180 and -90 <= coordinates[1] <= 90)
                regions = []
                reason = None
                if valid_point:
                    point = Point(coordinates)
                    local = prefectures.query(point)
                    if local:
                        parent_ids = set()
                        for match in local:
                            parent_id = match["properties"].get("GID_1")
                            if parent_id in province_by_id and parent_id not in parent_ids:
                                regions.append(region(province_by_id[parent_id], provinces.source_id, "province", 2022, True))
                                parent_ids.add(parent_id)
                        regions.extend(region(match, prefectures.source_id, "prefecture", 2022) for match in local)
                        match_level = "prefecture"
                    else:
                        local = provinces.query(point)
                        if local:
                            regions = [region(match, provinces.source_id, "province", 2022) for match in local]
                            match_level = "province"
                        else:
                            local = supplement.query(point)
                            if local:
                                regions = [region(match, supplement.source_id, "province", 2019) for match in local]
                                match_level = "province-supplement"
                            else:
                                local = countries.query(point)
                                if local:
                                    regions = [region(match, countries.source_id, "country-or-area") for match in local]
                                    match_level = "country-or-area"
                                else:
                                    reason = "water-or-source-geometry-gap"
                                    match_level = "unmatched"
                else:
                    reason, match_level = "missing-or-invalid-representative-point", "unmatched"
                modern_names = list(dict.fromkeys(item["name"] for item in regions))
                years = sorted(set(item["referenceYear"] for item in regions if "referenceYear" in item))
                if modern_names:
                    year_note = "、".join(map(str, years)) + "版/年资料" if years else "Natural Earth 5.1.1资料"
                    note = (f"代表点所在现代地区，依据{year_note}作空间查询；不是古今同一行政实体的证明，"
                            "也不是整个历史区域的全部现代覆盖范围。")
                    if match_level == "province-supplement":
                        note += " 较细的GADM面未覆盖该点，此处使用较粗的省级参考面。"
                    if match_level == "country-or-area":
                        note += " 仅有国家/地区级对应。"
                else:
                    note = ("未匹配：代表点未落入已载入的现代省、地级或国家/地区面；"
                            "可能涉及海域、小岛或源几何缺口，未用最近地区猜配。") if valid_point else "未匹配：缺少有效的历史面代表点。"
                entry = {"historicalName": historical_name, "simplifiedName": CC.convert(historical_name),
                         "modernNames": modern_names, "method": "representative-point", "note": note,
                         "sourceIds": list(dict.fromkeys(([item["sourceId"] for item in regions] if regions else [source["id"] for source in SOURCES[:-1]]) + ["opencc-t2s"])),
                         "matchStatus": "matched" if modern_names else "unmatched", "matchLevel": match_level,
                         "representativeCoordinates": coordinates, "historicalYear": dataset["year"],
                         "historicalDatasetId": dataset["id"], "historicalLayerId": layer["id"],
                         "referenceYears": years, "modernRegions": regions}
                if reason:
                    entry["unmatchedReason"] = reason
                    unmatched.append({"id": feature_id, "historicalName": historical_name, "coordinates": coordinates,
                                      "datasetId": dataset["id"], "level": layer["level"], "reason": reason})
                entries[feature_id] = entry
                counts[match_level] += 1
                counts["total"] += 1
                counts["simplifiedNameChanged"] += entry["simplifiedName"] != historical_name
            stats = {"datasetId": dataset["id"], "layerId": layer["id"], **counts}
            stats["matched"] = counts["total"] - counts["unmatched"]
            stats["coverageRate"] = round(stats["matched"] / counts["total"], 6)
            layer_stats.append(stats)
            global_counts.update(counts)
            print(f"{layer['id']}: {stats['matched']}/{counts['total']} matched", flush=True)
    total = len(entries)
    statistics = {**global_counts, "matched": total - len(unmatched), "unmatched": len(unmatched),
                  "coverageRate": round((total - len(unmatched)) / total, 6), "layerCount": len(layer_stats),
                  "unmatchedReasons": dict(Counter(item["reason"] for item in unmatched)), "byLayer": layer_stats}
    output = {"version": "modern-correspondence-1", "coordinateSystem": "WGS84 longitude/latitude",
              "sources": SOURCES, "statistics": statistics, "entries": entries}
    write_json(OUT, output, compact=True)
    report = {"statistics": statistics, "unmatched": unmatched, "historicalInputs": historical_hashes,
              "sourceFeatureCounts": {index.source_id: len(index.features) for index in [provinces, prefectures, supplement, countries]},
              "sourceGeometryRepairs": {index.source_id: index.repairs for index in [provinces, prefectures, supplement, countries]},
              "provinceEnglishTranslations": PROVINCE_TRANSLATIONS, "supplementProvinceTranslations": GB_TRANSLATIONS,
              "sourceDownloads": source_manifest, "outputBytes": OUT.stat().st_size,
              "outputSHA256": hashlib.sha256(OUT.read_bytes()).hexdigest(),
              "historicalGeoJSONUnchanged": all(hashlib.sha256((ROOT / item["file"]).read_bytes()).hexdigest() == item["sha256"] for item in historical_hashes)}
    write_json(EVIDENCE / "coverage-report.json", report)
    print(json.dumps({"total": total, "matched": total - len(unmatched), "unmatched": len(unmatched),
                      "coverageRate": statistics["coverageRate"], "bytes": OUT.stat().st_size}))


if __name__ == "__main__":
    main()
