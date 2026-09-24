"""Combine independently imported historical boundary source manifests."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
directory = root / "public/data/boundaries"
datasets = []
for name in ("hartwell-manifest.json", "chgis-manifest.json"):
    source = directory / name
    if source.exists():
        datasets.extend(json.loads(source.read_text())["datasets"])
if not datasets:
    raise SystemExit("No imported datasets found")
ids = set()
for dataset in datasets:
    if dataset["id"] in ids:
        raise ValueError("Duplicate dataset: " + dataset["id"])
    ids.add(dataset["id"])
    for layer in dataset["layers"]:
        path = root / "public" / layer["url"].lstrip("/")
        collection = json.loads(path.read_text())
        assert len(collection["features"]) == layer["featureCount"], path
        for feature in collection["features"]:
            assert feature["properties"]["year"] == dataset["year"], path
            assert feature["properties"]["level"] == layer["level"], path
datasets.sort(key=lambda item: item["year"])
output = directory / "manifest.json"
output.write_text(json.dumps({"version": "0.4.0", "datasets": datasets}, ensure_ascii=False, indent=2) + "\n")
print(f"Wrote {len(datasets)} datasets / {sum(len(d['layers']) for d in datasets)} layers to {output}")
