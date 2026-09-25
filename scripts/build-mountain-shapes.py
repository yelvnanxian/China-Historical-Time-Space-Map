#!/usr/bin/env python3
"""Derive local modern contours and transparent hillshade from original Terrarium DEM.

Requires numpy, pillow, contourpy. Run with --offline to reproduce cached inputs.
The selected peak IDs are existing published OSM records: names/coordinates are
read from those records. Crop extents are acquisition windows, never mountain
boundaries. No synthetic elevations, manual ridge sketches, or smoothed contours.
"""

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import argparse
import gzip
import hashlib
import io
import json
import math
from pathlib import Path
import time
from urllib.request import Request, urlopen

import contourpy
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public/data/mountain-shapes"
EVIDENCE = ROOT / "data/evidence/mountain-shapes"
TILE_ROOT = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium"
DEM_ZOOM = 11
TILE_SIZE = 256
TILE_RADIUS = 1
EARTH_CIRCUMFERENCE = 40075016.68557849
SUN_AZIMUTH, SUN_ALTITUDE = 315, 45
EDGE_FADE = 24

# (stable local id, existing source peak id, contour interval, index interval)
SELECTION = [
    ("baxiantai", "osm-node-4631429623", 100, 500),
    ("huashan-south", "osm-node-2260053296", 100, 500),
    ("zhongnanshan", "osm-node-10313072026", 100, 500),
    ("maijishan", "osm-node-6026512454", 100, 500),
    ("wangwushan", "osm-node-11691087205", 100, 500),
    ("wangmangling", "osm-node-5977241906", 100, 500),
    ("wutai-north", "osm-node-1697356333", 100, 500),
    ("gangshika", "osm-node-6733228790", 200, 1000),
    ("shule-nanshan", "osm-node-4119221867", 200, 1000),
    ("zhuoershan", "osm-node-13731487059", 100, 500),
    ("khan-tengri", "osm-node-2117690354", 200, 1000),
    ("bogda", "osm-node-2554874049", 200, 1000),
    ("xuelian", "osm-node-4547084707", 200, 1000),
    ("gongga", "osm-node-710005654", 200, 1000),
    ("yaomei", "osm-node-3227322901", 200, 1000),
    ("xiannairi", "osm-node-2959964823", 200, 1000),
    ("queershan", "osm-node-3034352548", 200, 1000),
]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def tile_xy(longitude, latitude, zoom=DEM_ZOOM):
    count = 2 ** zoom
    return (math.floor((longitude + 180) / 360 * count),
            math.floor((1 - math.asinh(math.tan(math.radians(latitude))) / math.pi) / 2 * count))


def lon_at(global_pixel, zoom=DEM_ZOOM):
    return np.asarray(global_pixel) / (TILE_SIZE * 2 ** zoom) * 360 - 180


def lat_at(global_pixel, zoom=DEM_ZOOM):
    return np.degrees(np.arctan(np.sinh(math.pi * (1 - 2 * np.asarray(global_pixel) / (TILE_SIZE * 2 ** zoom)))))


def load_peaks():
    manifest_path = ROOT / "public/data/mountain-detail/manifest.json"
    manifest = json.loads(manifest_path.read_text())
    wanted = {item[1] for item in SELECTION}
    result = {}
    for pack in manifest["packs"]:
        data = (ROOT / "public" / pack["url"].lstrip("/")).read_bytes()
        for feature in json.loads(gzip.decompress(data))["features"]:
            p = feature["properties"]
            if p["id"] not in wanted:
                continue
            if feature["geometry"]["type"] != "Point" or p["kind"] != "peak" or not p["hasChineseName"]:
                raise ValueError("Selected record is not a published named Chinese peak: " + p["id"])
            if p["id"] in result:
                raise ValueError("Nonunique peak source: " + p["id"])
            result[p["id"]] = {"feature": feature, "packUrl": pack["url"], "packSha256": sha(data), "regionId": pack["regionId"]}
    if set(result) != wanted:
        raise ValueError("Missing selected peaks: " + str(wanted - set(result)))
    return result, sha(manifest_path.read_bytes())


def fetch_tile(spec, offline=False):
    zoom, x, y = spec
    path = EVIDENCE / "dem" / str(zoom) / str(x) / f"{y}.png"
    meta_path = path.with_suffix(".json")
    url = f"{TILE_ROOT}/{zoom}/{x}/{y}.png"
    if path.exists():
        data = path.read_bytes()
    else:
        if offline:
            raise FileNotFoundError(f"Missing cached original DEM: {path}")
        for attempt in range(3):
            try:
                with urlopen(Request(url, headers={"User-Agent": "ShanHeJi-mountain-shapes/1.0"}), timeout=45) as response:
                    data = response.read()
                break
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(attempt + 1)
    with Image.open(io.BytesIO(data)) as image:
        if image.format != "PNG" or image.size != (TILE_SIZE, TILE_SIZE) or image.mode != "RGB":
            raise ValueError(f"Unexpected Terrarium PNG format at {url}: {image.size}/{image.mode}")
        image.verify()
    digest = sha(data)
    if meta_path.exists():
        metadata = json.loads(meta_path.read_text())
        if metadata["sha256"] != digest or metadata["sourceUrl"] != url:
            raise ValueError(f"Original DEM hash/source changed: {path}")
    else:
        metadata = {"z": zoom, "x": x, "y": y, "sourceUrl": url,
                    "evidencePath": str(path.relative_to(ROOT)), "sha256": digest, "bytes": len(data),
                    "retrievedAt": datetime.now(timezone.utc).isoformat()}
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_bytes(data)
    if not meta_path.exists():
        write_json(meta_path, metadata)
    return spec, metadata


def decode_tile(metadata):
    with Image.open(ROOT / metadata["evidencePath"]) as image:
        rgb = np.asarray(image, dtype=np.float64)
    return rgb[:, :, 0] * 256 + rgb[:, :, 1] + rgb[:, :, 2] / 256 - 32768


def make_hillshade(dem, global_y, excluded):
    latitudes = lat_at(global_y + np.arange(dem.shape[0]) + 0.5)
    spacing = EARTH_CIRCUMFERENCE / (TILE_SIZE * 2 ** DEM_ZOOM) * np.cos(np.radians(latitudes))
    dz_south, dz_east = np.gradient(dem)
    dz_east = dz_east / spacing[:, None]
    dz_north = -dz_south / spacing[:, None]
    azimuth, altitude = math.radians(SUN_AZIMUTH), math.radians(SUN_ALTITUDE)
    sun_east = math.sin(azimuth) * math.cos(altitude)
    sun_north = math.cos(azimuth) * math.cos(altitude)
    illumination = (-dz_east * sun_east - dz_north * sun_north + math.sin(altitude)) / np.sqrt(1 + dz_east ** 2 + dz_north ** 2)
    # Relative to flat-ground illumination: flat land has exactly zero opacity.
    # This is transparent physical hillshade, not hypsometric/mountain-area fill.
    alpha = np.clip((math.sin(altitude) - illumination) / math.sin(altitude), 0, 1) * 175
    rows, columns = np.indices(dem.shape)
    edge_distance = np.minimum.reduce([rows, columns, dem.shape[0] - 1 - rows, dem.shape[1] - 1 - columns])
    alpha *= np.clip(edge_distance / EDGE_FADE, 0, 1)
    # Avoid shading source anomalies or gradients that directly touch them.
    padded = np.pad(excluded, 1, constant_values=False)
    excluded_gradient = np.logical_or.reduce([padded[dy:dy+dem.shape[0], dx:dx+dem.shape[1]] for dy in range(3) for dx in range(3)])
    alpha[excluded_gradient] = 0
    rgba = np.empty((*dem.shape, 4), dtype=np.uint8)
    rgba[:, :, :3] = [66, 62, 51]
    rgba[:, :, 3] = np.rint(alpha).astype(np.uint8)
    return rgba, spacing


def derive_area(selection, source, tiles):
    ident, _, interval, index_interval = selection
    feature = source["feature"]
    p = feature["properties"]
    center = feature["geometry"]["coordinates"]
    tx, ty = tile_xy(*center)
    x0, y0 = tx - TILE_RADIUS, ty - TILE_RADIUS
    area_tiles = [tiles[(DEM_ZOOM, x, y)] for y in range(y0, ty + TILE_RADIUS + 1) for x in range(x0, tx + TILE_RADIUS + 1)]
    side = 2 * TILE_RADIUS + 1
    dem = np.block([[decode_tile(tiles[(DEM_ZOOM, x, y)]) for x in range(x0, x0 + side)] for y in range(y0, y0 + side)])
    if not np.isfinite(dem).all() or dem.max() > 9000:
        raise ValueError(f"Unusable DEM range for {ident}")
    size = side * TILE_SIZE
    global_x, global_y = x0 * TILE_SIZE, y0 * TILE_SIZE
    west, east = float(lon_at(global_x)), float(lon_at(global_x + size))
    north, south = float(lat_at(global_y)), float(lat_at(global_y + size))
    coords = np.arange(size, dtype=np.float64) + 0.5
    # These selected windows are inland upland sites. Isolated below-sea-level
    # samples encountered in two windows are recorded as suspected source
    # anomalies, omitted without filling, and preserved in the raw PNGs.
    excluded = dem < 0
    if int(excluded.sum()) > dem.size * 0.001:
        raise ValueError(f"Too many source anomalies for an upland crop: {ident}")
    excluded_samples = [{"coordinates": [float(lon_at(global_x+j+0.5)), float(lat_at(global_y+i+0.5))],
                         "elevation": float(dem[i, j]), "reason": "所选内陆山地窗口内孤立负高程，作为待核源异常排除；未填补或修改原DEM。"}
                        for i, j in np.argwhere(excluded)]
    generator = contourpy.contour_generator(x=coords, y=coords, z=np.ma.masked_array(dem, mask=excluded), name="serial", line_type="Separate", corner_mask=False)
    contours = []
    first_elevation = math.ceil(float(dem[~excluded].min()) / interval) * interval
    last_elevation = math.floor(float(dem.max()) / interval) * interval
    max_interpolation_error = 0.0
    vertex_count = 0
    for elevation in range(first_elevation, last_elevation + 1, interval):
        for line in generator.lines(elevation):
            if len(line) < 2:
                continue
            # Verify against the DEM cell edge interpolation, independently of
            # longitude/latitude conversion; contourpy vertices lie on grid edges.
            grid = line - 0.5
            ix = np.clip(np.floor(grid[:, 0]).astype(int), 0, size - 2)
            iy = np.clip(np.floor(grid[:, 1]).astype(int), 0, size - 2)
            fx, fy = grid[:, 0] - ix, grid[:, 1] - iy
            z = ((1-fx)*(1-fy)*dem[iy, ix] + fx*(1-fy)*dem[iy, ix+1] + (1-fx)*fy*dem[iy+1, ix] + fx*fy*dem[iy+1, ix+1])
            max_interpolation_error = max(max_interpolation_error, float(np.max(np.abs(z - elevation))))
            coordinates = np.column_stack((lon_at(global_x + line[:, 0]), lat_at(global_y + line[:, 1])))
            coordinates = np.round(coordinates, 8).tolist()
            contour_id = f"{ident}-{elevation}-{len(contours)}"
            contours.append({"type": "Feature", "id": contour_id,
                             "properties": {"id": contour_id, "areaId": ident, "elevation": elevation,
                                            "index": elevation % index_interval == 0, "modernReferenceOnly": True},
                             "geometry": {"type": "LineString", "coordinates": coordinates}})
            vertex_count += len(coordinates)
    if not contours or max_interpolation_error > 1e-6:
        raise ValueError(f"Contour interpolation failed for {ident}: {max_interpolation_error}")
    contour_data = gzip.compress(json.dumps({"type": "FeatureCollection", "features": contours}, ensure_ascii=False, separators=(",", ":")).encode(), mtime=0)
    contour_file = f"{ident}-contours.geojson.gz"
    (PUBLIC / contour_file).write_bytes(contour_data)
    rgba, spacing = make_hillshade(dem, global_y, excluded)
    shade_file = f"{ident}-shade.png"
    Image.fromarray(rgba).save(PUBLIC / shade_file, optimize=True)
    shade_data = (PUBLIC / shade_file).read_bytes()
    area = {"id": ident, "name": p["name"], "regionId": source["regionId"], "center": center,
            "bounds": [west, south, east, north], "contoursUrl": "/data/mountain-shapes/" + contour_file,
            "shadeUrl": "/data/mountain-shapes/" + shade_file,
            "imageCoordinates": [[west, north], [east, north], [east, south], [west, south]],
            "sourcePeak": {"id": p["id"], "name": p["name"], "coordinates": center, "sourceUrl": p["sourceUrl"],
                           "sourcePackUrl": source["packUrl"], "sourcePackSha256": source["packSha256"], "tags": p["tags"]},
            "demZoom": DEM_ZOOM, "pixelSizeMeters": round(float(EARTH_CIRCUMFERENCE / (TILE_SIZE * 2 ** DEM_ZOOM) * math.cos(math.radians(center[1]))), 3),
            "pixelSizeMetersRange": [round(float(spacing.min()), 3), round(float(spacing.max()), 3)],
            "pixelDimensions": [size, size], "contourInterval": interval, "indexInterval": index_interval,
            "minZoom": 9, "featureCount": len(contours), "vertexCount": vertex_count,
            "elevationRange": [float(dem[~excluded].min()), float(dem.max())], "excludedDemSamples": excluded_samples, "sourceTiles": area_tiles,
            "contoursSha256": sha(contour_data), "shadeSha256": sha(shade_data), "modernReferenceOnly": True,
            "note": "真实现代DEM推导等高线与山影；覆盖框只是取数裁切范围，不是山体边界。像素间距不是独立测量精度；不能用于唐代地貌或精确峰顶海拔判定。"}
    audit = {"id": ident, "featureCount": len(contours), "vertexCount": vertex_count,
             "contourInterpolationMaxErrorMeters": max_interpolation_error,
             "shadeAlphaRange": [int(rgba[:, :, 3].min()), int(rgba[:, :, 3].max())],
             "shadeTransparentPixels": int(np.count_nonzero(rgba[:, :, 3] == 0)),
             "shadeBytes": len(shade_data), "contoursBytes": len(contour_data),
             "sourcePeakUnchanged": center == source["feature"]["geometry"]["coordinates"]}
    audit["excludedDemSampleCount"] = len(excluded_samples)
    return area, audit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true", help="Verify and reuse all cached source DEM; never access network")
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()
    peaks, peak_manifest_hash = load_peaks()
    needed = set()
    for _, peak_id, _, _ in SELECTION:
        x, y = tile_xy(*peaks[peak_id]["feature"]["geometry"]["coordinates"])
        needed.update((DEM_ZOOM, tx, ty) for tx in range(x-TILE_RADIUS, x+TILE_RADIUS+1) for ty in range(y-TILE_RADIUS, y+TILE_RADIUS+1))
    PUBLIC.mkdir(parents=True, exist_ok=True)
    tiles = {}
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = [executor.submit(fetch_tile, spec, args.offline) for spec in sorted(needed)]
        for future in as_completed(futures):
            spec, metadata = future.result()
            tiles[spec] = metadata
            if len(tiles) % 15 == 0 or len(tiles) == len(needed):
                print(f"Verified {len(tiles)}/{len(needed)} original DEM tiles", flush=True)
    areas, audits = [], []
    for selection in SELECTION:
        area, audit = derive_area(selection, peaks[selection[1]], tiles)
        areas.append(area)
        audits.append(audit)
        print(f"Built {area['name']}: {area['featureCount']} contours, {area['vertexCount']} vertices", flush=True)
    manifest = {"version": "mountain-shapes-1", "title": "山地现代等高线与精细山影", "modernReferenceOnly": True,
                "source": {"name": "Mapzen / Tilezen Terrain Tiles, AWS Open Data", "url": "https://registry.opendata.aws/terrain-tiles/",
                           "template": TILE_ROOT + "/{z}/{x}/{y}.png", "encoding": "terrarium", "elevationFormula": "red * 256 + green + blue / 256 - 32768",
                           "attribution": "Mapzen / Tilezen; SRTM and GMTED2010 courtesy of USGS; additional providers listed in the original terrain attribution.",
                           "attributionUrl": "/data/terrain/attribution.md"},
                "processing": {"contourMethod": "ContourPy serial marching squares over unmodified decoded DEM; linear edge interpolation; no smoothing or line simplification; coordinates rounded to 8 decimal places.",
                               "hillshadeMethod": "Surface-normal illumination with latitude-adjusted pixel spacing; shade alpha is darkness relative to flat ground. Transparent RGBA, with crop-edge opacity fade only.",
                               "sunAzimuth": SUN_AZIMUTH, "sunAltitude": SUN_ALTITUDE, "verticalExaggeration": 1, "edgeFadePixels": EDGE_FADE,
                               "demExclusionPolicy": "仅在所选内陆山地窗口排除孤立负高程待核异常；不把该规则推广为全球DEM无效值规则。清单逐点保留原坐标与高程。等高线跳过涉及格网，山影异常像素及邻接梯度透明；未插值补洞。"},
                "areaCount": len(areas), "sourceTileCount": len(tiles), "featureCount": sum(area["featureCount"] for area in areas),
                "note": "仅覆盖所列真实OSM峰点周边近览区，非连续全国山地数据；采集区名称不证明某峰属于某山系。等高线表示现代高程，不是山脉轮廓或古代边界；OSM峰高和DEM像素高可能不同，均不作独立实测核定。", "areas": areas}
    write_json(PUBLIC / "manifest.json", manifest)
    write_json(EVIDENCE / "validation.json", {"version": 1, "peakManifestPath": "public/data/mountain-detail/manifest.json",
               "peakManifestSha256": peak_manifest_hash, "sourceTileCount": len(tiles), "sourceBytes": sum(t["bytes"] for t in tiles.values()),
               "areaCount": len(areas), "featureCount": manifest["featureCount"], "vertexCount": sum(a["vertexCount"] for a in areas),
               "derivedBytes": sum(a["shadeBytes"] + a["contoursBytes"] for a in audits),
               "peakCoordinatesPreserved": all(a["sourcePeakUnchanged"] for a in audits),
               "allContourVerticesCheckedAgainstDEM": True, "areas": audits})
    print(f"Published {len(areas)} modern terrain areas from {len(tiles)} preserved original DEM tiles", flush=True)


if __name__ == "__main__":
    main()
