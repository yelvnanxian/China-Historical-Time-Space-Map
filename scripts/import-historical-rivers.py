"""Archive and import WorldMap's dated Yellow River vectors without smoothing.

Run from the repository root. Network is used only here; the app serves snapshots.
"""
import concurrent.futures
import hashlib
import json
import pathlib
import subprocess
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "data/evidence/historical-rivers"
OUTPUT = ROOT / "public/data/historical-rivers"
EPOCHS = [
    ("yellow-602bce-11", -602, 11, "前602—公元11年", "08062f2a44964b53b0f7ad1c599beee9"),
    ("yellow-11-1048", 11, 1048, "11—1048年（含唐代）", "38dc2d5df1534a2c8b6033c134e6134c"),
    ("yellow-1048-1128", 1048, 1128, "1048—1128年", "74747a4c412740698f764ee4adc917e8"),
    ("yellow-1128-1368", 1128, 1368, "1128—1368年", "a21458441fdd4d4cb4c1d3d633e6a4d3"),
    ("yellow-1368-1855", 1368, 1855, "1368—1855年", "d153bb2ae389426e99ff452d0552f63c"),
]


def download(url, path):
    subprocess.run(["curl", "-fLsS", "--retry", "2", "--max-time", "90", url, "-o", str(path)], check=True)
    return json.loads(path.read_text())


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def import_epoch(epoch):
    epoch_id, start, end, label, item_id = epoch
    item_path = EVIDENCE / f"{epoch_id}-item.json"
    item_url = f"https://www.arcgis.com/sharing/rest/content/items/{item_id}?f=json"
    item = download(item_url, item_path)
    service = download(item["url"] + "?f=json", EVIDENCE / f"{epoch_id}-service.json")
    layer_id = service["layers"][0]["id"]
    query = item["url"] + f"/{layer_id}/query?where=1%3D1&outFields=*&outSR=4326&returnGeometry=true&f=geojson"
    raw_path = EVIDENCE / f"{epoch_id}-raw.geojson"
    raw = download(query, raw_path)
    assert raw["type"] == "FeatureCollection" and raw["features"] and not raw.get("exceededTransferLimit")
    features, points = [], []
    for index, feature in enumerate(raw["features"]):
        geom = feature["geometry"]
        assert geom["type"] in ["LineString", "MultiLineString"]
        lines = [geom["coordinates"]] if geom["type"] == "LineString" else geom["coordinates"]
        points.extend(point for line in lines for point in line)
        features.append({"type": "Feature", "geometry": geom, "properties": {
            "id": f"{epoch_id}-{index}", "epochId": epoch_id, "name": "黄河历史河道",
            "startYear": start, "endYear": end, "dateLabel": label,
            "sourceProperties": feature["properties"], "sourceId": item_id,
        }})
    bounds = [min(p[0] for p in points), min(p[1] for p in points), max(p[0] for p in points), max(p[1] for p in points)]
    output_path = OUTPUT / f"{epoch_id}.geojson"
    output_path.write_text(json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False, separators=(",", ":")) + "\n")
    return {"id": epoch_id, "startYear": start, "endYear": end, "label": label,
            "url": f"/data/historical-rivers/{epoch_id}.geojson", "bounds": bounds,
            "labelCoordinates": points[len(points)//2], "featureCount": len(features), "vertexCount": len(points),
            "sourceId": item_id, "sourceTitle": item["title"], "sourceOwner": item["owner"],
            "sourceUrl": f"https://www.arcgis.com/home/item.html?id={item_id}", "queryUrl": query,
            "sourceDescription": item["description"], "metadataPath": str(item_path.relative_to(ROOT)),
            "metadataSha256": digest(item_path), "snapshotPath": str(raw_path.relative_to(ROOT)),
            "snapshotSha256": digest(raw_path), "geometrySha256": digest(output_path),
            "geometryNote": "WorldMap 历史图集数字化河道线，保留来源全部顶点；用于比较下游流向，不是逐年河岸测绘，也不表示真实河宽。"}


if __name__ == "__main__":
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        epochs = list(executor.map(import_epoch, EPOCHS))
    manifest = {"version": "1.0.0", "retrievedAt": datetime.now(timezone.utc).isoformat(), "epochs": epochs,
                "dateRule": "起年包含、讫年不包含；交界年采用新时期图，不表示当年瞬间完成改道。",
                "coverageNote": "黄河中下游历史流向。11—1048年图包含唐朝；其他河流仍为现代参照。",
                "precisionNote": "来源没有提供可验证的比例尺或定位误差，不能用于认定古代河岸、支流、湖泊轮廓或逐年变化。"}
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    for epoch in epochs:
        print(epoch["id"], epoch["featureCount"], epoch["vertexCount"], epoch["bounds"])
