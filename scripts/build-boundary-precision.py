#!/usr/bin/env python3
"""Create an audited, repaired boundary copy in a separate public tree.

The checked-in public/data tree is never modified. Invalid polygons are repaired
with GEOS linework, coordinates are truncated toward zero to five decimals, and
the serialized output is validated again. Every feature keeps its original
properties and id; the report records repairs, area deltas and source hashes.
"""
from __future__ import annotations

import argparse
from decimal import Decimal, ROUND_DOWN
import gzip
import hashlib
import json
import math
from pathlib import Path

import pyproj
import shapely
from shapely import make_valid, orient_polygons
from shapely.geometry import MultiPolygon, Point, mapping, shape
from shapely.validation import explain_validity

GRID = Decimal("0.00001")
GEOD = pyproj.Geod(ellps="WGS84")


def encode(value):
    return (json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n").encode()


def digest(value):
    return hashlib.sha256(value).hexdigest()


def polygons(geometry):
    if geometry.is_empty:
        return []
    if geometry.geom_type == "Polygon":
        return [geometry]
    if hasattr(geometry, "geoms"):
        return [part for child in geometry.geoms for part in polygons(child)]
    return []


def ring_count(document):
    if document["type"] == "Polygon":
        return len(document["coordinates"])
    return sum(len(part) for polygon in document["coordinates"] for part in polygon)


def repair(geometry, audit, stage):
    if geometry.is_valid and not geometry.is_empty:
        return geometry
    audit["repairs"].append({"stage": stage, "reason": explain_validity(geometry)})
    fixed = make_valid(geometry, method="linework", keep_collapsed=True)
    parts = polygons(fixed)
    collapsed = sum(1 for child in getattr(fixed, "geoms", ()) if child.geom_type not in ("Polygon", "MultiPolygon"))
    if collapsed:
        audit["collapsedComponents"] += collapsed
    if not parts:
        raise ValueError(f"{audit['id']}: repair produced no polygon")
    return parts[0] if len(parts) == 1 else MultiPolygon(parts)


def quantize(document, audit):
    longs, lats, target_longs, target_lats = [], [], [], []
    rings = document["coordinates"] if document["type"] == "Polygon" else [ring for polygon in document["coordinates"] for ring in polygon]
    for ring in rings:
        output = []
        for position in ring:
            longitude, latitude = position
            target = [float(Decimal(str(longitude)).quantize(GRID, rounding=ROUND_DOWN)),
                      float(Decimal(str(latitude)).quantize(GRID, rounding=ROUND_DOWN))]
            longs.append(longitude); lats.append(latitude)
            target_longs.append(target[0]); target_lats.append(target[1])
            if not output or output[-1] != target:
                output.append(target)
        if output and output[0] != output[-1]:
            output.append(output[0])
        ring[:] = output
    _, _, distances = GEOD.inv(longs, lats, target_longs, target_lats)
    audit["maxTruncationDisplacementMetres"] = max(distances, default=0)
    audit["coordinateCount"] = len(longs)
    return document


def validate(document):
    rings = document["coordinates"] if document["type"] == "Polygon" else [ring for polygon in document["coordinates"] for ring in polygon]
    for ring in rings:
        if len(ring) < 4 or ring[0] != ring[-1] or len({tuple(point) for point in ring}) < 3:
            raise ValueError("unclosed or degenerate ring")
        for point in ring:
            if len(point) != 2 or not all(math.isfinite(value) for value in point):
                raise ValueError("invalid coordinate")
            if not -180 <= point[0] <= 180 or not -90 <= point[1] <= 90:
                raise ValueError("coordinate outside WGS84 bounds")
    geometry = shape(document)
    if geometry.is_empty or not geometry.is_valid:
        raise ValueError(explain_validity(geometry))
    return geometry


def area(geometry):
    return abs(GEOD.geometry_area_perimeter(orient_polygons(geometry, exterior_cw=False))[0])


def feature_copy(feature):
    source = shape(feature["geometry"])
    audit = {
        "id": feature["id"],
        "sourceValid": bool(source.is_valid),
        "sourceValidity": explain_validity(source),
        "sourceRingCount": ring_count(feature["geometry"]),
        "sourceCoordinateCount": int(shapely.get_num_coordinates(source)),
        "repairs": [], "collapsedComponents": 0,
    }
    geometry = repair(source, audit, "source")
    document = quantize(json.loads(json.dumps(mapping(geometry))), audit)
    audit["validAfterTruncation"] = True
    try:
        output = validate(document)
    except ValueError as first_error:
        # A five-decimal grid can collapse a very small ring before GEOS can
        # parse it. Repair the quantized shape when possible; otherwise keep
        # this feature at its repaired source precision and record the reason.
        try:
            candidate = shape(document)
        except ValueError:
            candidate = geometry
        candidate = repair(candidate, audit, "truncation")
        retry_document = quantize(json.loads(json.dumps(mapping(candidate))), audit)
        try:
            output = validate(retry_document)
            document = retry_document
        except ValueError:
            output = validate(mapping(candidate))
            document = mapping(candidate)
            audit["precisionException"] = str(first_error)
    audit["outputRingCount"] = ring_count(document)
    audit["outputCoordinateCount"] = int(shapely.get_num_coordinates(output))
    audit["sourceAreaSquareMetres"] = area(source)
    audit["outputAreaSquareMetres"] = area(output)
    audit["areaDeltaSquareMetres"] = audit["outputAreaSquareMetres"] - audit["sourceAreaSquareMetres"]
    audit["areaDeltaPercent"] = (audit["areaDeltaSquareMetres"] / audit["sourceAreaSquareMetres"] * 100
                                  if audit["sourceAreaSquareMetres"] else None)
    label = feature.get("properties", {}).get("labelCoordinates")
    if label:
        audit["sourceCoversLabel"] = bool(source.covers(Point(label)))
        audit["outputCoversLabel"] = bool(output.covers(Point(label)))
    return {**feature, "geometry": document}, audit


def convert(input_root, output_root, report_path):
    input_root = Path(input_root).resolve(); output_root = Path(output_root).resolve()
    if output_root == input_root or output_root.is_relative_to(input_root):
        raise ValueError("output root must be separate from input root")
    manifest_path = input_root / "data/boundaries/manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    report = {"algorithmVersion": "boundary-repair-1", "gridDegrees": 0.00001,
              "libraries": {"shapely": shapely.__version__, "geos": shapely.geos_version_string, "pyproj": pyproj.__version__},
              "layers": []}
    for dataset in manifest["datasets"]:
        for layer in dataset["layers"]:
            relative = Path(layer["url"].lstrip("/"))
            source_path = input_root / relative
            source_bytes = source_path.read_bytes()
            collection = json.loads(source_bytes)
            features, audits = [], []
            for feature in collection["features"]:
                converted, audit = feature_copy(feature)
                if {k: v for k, v in converted.items() if k != "geometry"} != {k: v for k, v in feature.items() if k != "geometry"}:
                    raise ValueError(f"non-geometry feature fields changed: {feature['id']}")
                features.append(converted); audits.append(audit)
            output_bytes = encode({**collection, "features": features})
            target = output_root / relative
            target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(output_bytes)
            report["layers"].append({"id": layer["id"], "featureCount": len(features),
                "sourceSha256": digest(source_bytes), "outputSha256": digest(output_bytes),
                "sourceBytes": len(source_bytes), "outputBytes": len(output_bytes),
                "sourceGzipBytes": len(gzip.compress(source_bytes, compresslevel=9, mtime=0)),
                "outputGzipBytes": len(gzip.compress(output_bytes, compresslevel=9, mtime=0)),
                "sourceInvalidCount": sum(not a["sourceValid"] for a in audits),
                "repairCount": sum(bool(a["repairs"]) for a in audits),
                "precisionExceptionCount": sum("precisionException" in a for a in audits),
                "maxTruncationDisplacementMetres": max((a["maxTruncationDisplacementMetres"] for a in audits), default=0),
                "features": audits})
            print(layer["id"], len(features), flush=True)
    report["featureCount"] = sum(layer["featureCount"] for layer in report["layers"])
    report["layerCount"] = len(report["layers"])
    report["sourceSha256"] = digest(manifest_path.read_bytes())
    Path(report_path).parent.mkdir(parents=True, exist_ok=True)
    Path(report_path).write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-root", required=True)
    parser.add_argument("--output-root", required=True)
    parser.add_argument("--report", required=True)
    args = parser.parse_args()
    convert(args.input_root, args.output_root, args.report)
