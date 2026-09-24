#!/usr/bin/env python3
"""Cache real Mapzen Terrarium DEM tiles for China and surrounding regions.

Run: python3 scripts/import-terrain.py
The original PNG bytes are preserved. No synthetic terrain is generated.
"""

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import struct
import time
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public/data/terrain"
TILE_ROOT = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium"
BOUNDS = [55, -5, 155, 65]
MIN_ZOOM, MAX_ZOOM = 0, 6
DOC_ROOT = "https://raw.githubusercontent.com/tilezen/joerd/master/docs/"


def fetch(url):
    for attempt in range(3):
        try:
            request = Request(url, headers={"User-Agent": "ShanHeJi-terrain-import/1.0"})
            with urlopen(request, timeout=45) as response:
                return response.read()
        except Exception:
            if attempt == 2:
                raise
            time.sleep(attempt + 1)


def tile_coordinate(longitude, latitude, zoom):
    count = 2**zoom
    return (
        min(count - 1, math.floor((longitude + 180) / 360 * count)),
        min(count - 1, math.floor((1 - math.asinh(math.tan(math.radians(latitude))) / math.pi) / 2 * count)),
    )


def specifications():
    west, south, east, north = BOUNDS
    for zoom in range(MIN_ZOOM, MAX_ZOOM + 1):
        x_min, y_min = tile_coordinate(west, north, zoom)
        x_max, y_max = tile_coordinate(east, south, zoom)
        for x in range(x_min, x_max + 1):
            for y in range(y_min, y_max + 1):
                yield zoom, x, y


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    existing_manifest = OUTPUT / "manifest.json"
    recorded = {}
    if existing_manifest.exists():
        recorded = {item["path"]: item for item in json.loads(existing_manifest.read_text())["tiles"]}

    def import_tile(spec):
        zoom, x, y = spec
        relative_path = f"{zoom}/{x}/{y}.png"
        destination = OUTPUT / relative_path
        url = f"{TILE_ROOT}/{relative_path}"
        data = destination.read_bytes() if destination.exists() else fetch(url)
        if data[:8] != b"\x89PNG\r\n\x1a\n" or struct.unpack_from(">II", data, 16) != (256, 256):
            raise ValueError(f"Expected a 256x256 PNG: {url}")
        digest = hashlib.sha256(data).hexdigest()
        if relative_path in recorded and recorded[relative_path]["sha256"] != digest:
            raise ValueError(f"Cached terrain checksum mismatch: {relative_path}")
        if not destination.exists():
            destination.parent.mkdir(parents=True, exist_ok=True)
            temporary = destination.with_suffix(".png.part")
            temporary.write_bytes(data)
            temporary.replace(destination)
        return {"path": relative_path, "sourceUrl": url, "bytes": len(data), "sha256": digest}

    tiles = []
    all_tiles = list(specifications())
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(import_tile, spec) for spec in all_tiles]
        for future in as_completed(futures):
            tiles.append(future.result())
            if len(tiles) % 75 == 0:
                print(f"Verified {len(tiles)}/{len(all_tiles)} terrain tiles", flush=True)
    tiles.sort(key=lambda tile: [int(part.split(".")[0]) for part in tile["path"].split("/")])
    documents = []
    for name in ["attribution.md", "formats.md", "data-sources.md"]:
        data = fetch(DOC_ROOT + name)
        (OUTPUT / name).write_bytes(data)
        documents.append({"path": name, "sourceUrl": DOC_ROOT + name, "sha256": hashlib.sha256(data).hexdigest()})
    manifest = {
        "version": "1.0",
        "title": "现代地形高程参考",
        "importedAt": datetime.now(timezone.utc).date().isoformat(),
        "sourceName": "Mapzen / Tilezen Terrain Tiles, AWS Open Data",
        "sourceUrl": "https://registry.opendata.aws/terrain-tiles/",
        "sourceTemplate": TILE_ROOT + "/{z}/{x}/{y}.png",
        "bounds": BOUNDS,
        "minzoom": MIN_ZOOM,
        "maxzoom": MAX_ZOOM,
        "tileSize": 256,
        "encoding": "terrarium",
        "elevationFormula": "red * 256 + green + blue / 256 - 32768",
        "elevationUnit": "metres",
        "note": "真实现代高程，只作自然地形参考，不代表任何历史时期的地貌。原始高程 PNG 未改写；阴影与 1.5 倍立体夸张由浏览器渲染。更大缩放级别使用已缓存高程，不增加数据精度。",
        "attribution": "Mapzen / Tilezen; global GMTED2010 and SRTM terrain data courtesy of the U.S. Geological Survey; global ETOPO1 terrain data U.S. National Oceanic and Atmospheric Administration. Full contributing-provider attribution is preserved in attribution.md.",
        "documents": documents,
        "tileCount": len(tiles),
        "totalBytes": sum(tile["bytes"] for tile in tiles),
        "tiles": tiles,
    }
    existing_manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(f"Verified {len(tiles)} original DEM tiles; {manifest['totalBytes'] / 1_000_000:.2f} MB")


if __name__ == "__main__":
    main()
