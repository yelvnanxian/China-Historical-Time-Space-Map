#!/usr/bin/env python3
"""Independently check published contour coordinates against preserved source DEM.

No network or contour generator is used. Each published lon/lat vertex is
converted back to its DEM pixel position and bilinearly sampled.
"""

import gzip
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    manifest = json.loads((ROOT / "public/data/mountain-shapes/manifest.json").read_text())
    audits = []
    source_hashes = {}
    for area in manifest["areas"]:
        z = area["demZoom"]
        tiles = area["sourceTiles"]
        min_x, max_x = min(t["x"] for t in tiles), max(t["x"] for t in tiles)
        min_y, max_y = min(t["y"] for t in tiles), max(t["y"] for t in tiles)
        dem = np.empty(((max_y-min_y+1)*256, (max_x-min_x+1)*256), dtype=float)
        for tile in tiles:
            path = ROOT / tile["evidencePath"]
            assert digest(path.read_bytes()) == tile["sha256"], str(path)
            with Image.open(path) as image:
                assert image.mode == "RGB" and image.size == (256, 256)
                rgb = np.asarray(image, dtype=float)
            grid = rgb[:, :, 0]*256 + rgb[:, :, 1] + rgb[:, :, 2]/256 - 32768
            y, x = (tile["y"]-min_y)*256, (tile["x"]-min_x)*256
            dem[y:y+256, x:x+256] = grid
            source_hashes[tile["evidencePath"]] = tile["sha256"]
        source_pack = ROOT / "public" / area["sourcePeak"]["sourcePackUrl"].lstrip("/")
        assert digest(source_pack.read_bytes()) == area["sourcePeak"]["sourcePackSha256"]
        source_peaks = json.loads(gzip.decompress(source_pack.read_bytes()))["features"]
        peak = next(f for f in source_peaks if f["properties"]["id"] == area["sourcePeak"]["id"])
        assert peak["geometry"]["coordinates"] == area["center"] == area["sourcePeak"]["coordinates"]
        assert peak["properties"]["name"] == area["name"]
        contour_path = ROOT / "public" / area["contoursUrl"].lstrip("/")
        assert digest(contour_path.read_bytes()) == area["contoursSha256"]
        contours = json.loads(gzip.decompress(contour_path.read_bytes()))["features"]
        errors = []
        count = 0
        for feature in contours:
            assert feature["geometry"]["type"] == "LineString"
            p = feature["properties"]
            assert p["areaId"] == area["id"] and p["modernReferenceOnly"] is True
            assert p["elevation"] % area["contourInterval"] == 0
            assert p["index"] == (p["elevation"] % area["indexInterval"] == 0)
            coords = np.asarray(feature["geometry"]["coordinates"])
            global_x = (coords[:, 0]+180)/360*(256*2**z)
            global_y = (1-np.arcsinh(np.tan(np.radians(coords[:, 1])))/math.pi)/2*(256*2**z)
            x, y = global_x-min_x*256-0.5, global_y-min_y*256-0.5
            assert x.min() >= -1e-4 and y.min() >= -1e-4 and x.max() <= dem.shape[1]-1+1e-4 and y.max() <= dem.shape[0]-1+1e-4
            ix = np.clip(np.floor(x).astype(int), 0, dem.shape[1]-2)
            iy = np.clip(np.floor(y).astype(int), 0, dem.shape[0]-2)
            fx, fy = x-ix, y-iy
            sampled = ((1-fx)*(1-fy)*dem[iy, ix] + fx*(1-fy)*dem[iy, ix+1] + (1-fx)*fy*dem[iy+1, ix] + fx*fy*dem[iy+1, ix+1])
            error = np.abs(sampled-p["elevation"])
            errors.append(float(error.max()))
            count += len(coords)
        max_error = max(errors)
        # 8-decimal-degree serialization introduces sub-millimetre ground error.
        # 0.1 m allows quantization and steep local gradients, not contour drift.
        assert max_error < 0.1, (area["id"], max_error)
        assert len(contours) == area["featureCount"] and count == area["vertexCount"]
        shade_path = ROOT / "public" / area["shadeUrl"].lstrip("/")
        assert digest(shade_path.read_bytes()) == area["shadeSha256"]
        with Image.open(shade_path) as image:
            assert image.mode == "RGBA" and list(image.size) == area["pixelDimensions"]
            alpha = np.asarray(image)[:, :, 3]
        assert (alpha[0] == 0).all() and (alpha[-1] == 0).all() and (alpha[:, 0] == 0).all() and (alpha[:, -1] == 0).all()
        assert 0 < int(alpha.max()) < 255 and len(np.unique(alpha)) > 50
        assert np.count_nonzero(alpha == 0) > alpha.size / 10
        audits.append({"id": area["id"], "featureCount": len(contours), "vertexCount": count,
                       "publishedCoordinateElevationMaxErrorMeters": max_error, "sourcePeakExact": True,
                       "sourceHashesValid": True, "rgbaTransparencyValid": True})
    result = {"areaCount": len(audits), "sourceTileCount": len(source_hashes),
              "featureCount": sum(a["featureCount"] for a in audits), "vertexCount": sum(a["vertexCount"] for a in audits),
              "maxPublishedCoordinateElevationErrorMeters": max(a["publishedCoordinateElevationMaxErrorMeters"] for a in audits),
              "allSourceHashesValid": True, "allPeakNamesAndCoordinatesExact": True,
              "allShadeImagesTransparentAtCropEdge": True, "areas": audits}
    (ROOT / "data/evidence/mountain-shapes/roundtrip-validation.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({key: value for key, value in result.items() if key != "areas"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
