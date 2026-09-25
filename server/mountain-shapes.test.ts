import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import type { MountainContourCollection, MountainShapesManifest } from "../shared/mountain-shapes";
import type { MountainDetailCollection } from "../shared/mountain-detail";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest: MountainShapesManifest = JSON.parse(await readFile(path.join(root, "public/data/mountain-shapes/manifest.json"), "utf8"));
const hash = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

test("terrain areas retain exact published OSM peak identities and original DEM hashes", async () => {
  assert.equal(manifest.areaCount, manifest.areas.length);
  assert.equal(new Set(manifest.areas.map(area => area.regionId)).size, 5);
  const sourceTiles = new Set<string>();
  for (const area of manifest.areas) {
    const peakData = await readFile(path.join(root, "public", area.sourcePeak.sourcePackUrl));
    assert.equal(hash(peakData), area.sourcePeak.sourcePackSha256);
    const peaks: MountainDetailCollection = JSON.parse(gunzipSync(peakData).toString("utf8"));
    const peak = peaks.features.find(feature => feature.properties.id === area.sourcePeak.id);
    assert.ok(peak);
    assert.equal(peak.geometry.type, "Point");
    assert.deepEqual(peak.geometry.coordinates, area.center);
    assert.deepEqual(area.sourcePeak.coordinates, area.center);
    assert.equal(peak.properties.name, area.name);
    assert.deepEqual(peak.properties.tags, area.sourcePeak.tags);
    assert.equal(area.sourceTiles.length, 9);
    for (const tile of area.sourceTiles) {
      sourceTiles.add(tile.evidencePath);
      const data = await readFile(path.join(root, tile.evidencePath));
      assert.equal(hash(data), tile.sha256);
      assert.equal(data.length, tile.bytes);
      assert.equal(data.readUInt32BE(16), 256);
      assert.equal(data.readUInt32BE(20), 256);
      assert.equal(data[25], 2, "original DEM PNG must remain RGB");
      assert.equal(tile.sourceUrl, `${manifest.source.template.replace("{z}", String(tile.z)).replace("{x}", String(tile.x)).replace("{y}", String(tile.y))}`);
    }
  }
  assert.equal(sourceTiles.size, manifest.sourceTileCount);
});

test("published contours are correctly attributed elevation lines inside DEM windows", async () => {
  let totalFeatures = 0;
  for (const area of manifest.areas) {
    const data = await readFile(path.join(root, "public", area.contoursUrl));
    assert.equal(hash(data), area.contoursSha256);
    const collection: MountainContourCollection = JSON.parse(gunzipSync(data).toString("utf8"));
    assert.equal(collection.features.length, area.featureCount);
    const [west, south, east, north] = area.bounds;
    assert.ok(area.center[0] > west && area.center[0] < east && area.center[1] > south && area.center[1] < north);
    assert.deepEqual(area.imageCoordinates, [[west, north], [east, north], [east, south], [west, south]]);
    let vertexCount = 0;
    let majorLines = 0;
    for (const feature of collection.features) {
      assert.equal(feature.geometry.type, "LineString");
      assert.equal(feature.properties.areaId, area.id);
      assert.equal(feature.properties.modernReferenceOnly, true);
      assert.equal(feature.properties.elevation % area.contourInterval, 0);
      assert.equal(feature.properties.index, feature.properties.elevation % area.indexInterval === 0);
      assert.ok(feature.properties.elevation >= area.elevationRange[0] && feature.properties.elevation <= area.elevationRange[1]);
      if (feature.properties.index) majorLines++;
      assert.ok(feature.geometry.coordinates.length >= 2);
      for (const [longitude, latitude] of feature.geometry.coordinates) {
        assert.ok(Number.isFinite(longitude) && longitude > west && longitude < east);
        assert.ok(Number.isFinite(latitude) && latitude > south && latitude < north);
      }
      vertexCount += feature.geometry.coordinates.length;
    }
    assert.equal(vertexCount, area.vertexCount);
    assert.ok(majorLines > 0);
    totalFeatures += area.featureCount;
    const shade = await readFile(path.join(root, "public", area.shadeUrl));
    assert.equal(hash(shade), area.shadeSha256);
    assert.equal(shade[25], 6, "hillshade must be RGBA, not an opaque rectangular image");
    assert.deepEqual([shade.readUInt32BE(16), shade.readUInt32BE(20)], area.pixelDimensions);
  }
  assert.equal(totalFeatures, manifest.featureCount);
});

test("all serialized contour vertices have an independent archived DEM roundtrip audit", async () => {
  const audit = JSON.parse(await readFile(path.join(root, "data/evidence/mountain-shapes/roundtrip-validation.json"), "utf8"));
  assert.equal(audit.areaCount, manifest.areaCount);
  assert.equal(audit.sourceTileCount, manifest.sourceTileCount);
  assert.equal(audit.featureCount, manifest.featureCount);
  assert.equal(audit.vertexCount, manifest.areas.reduce((sum, area) => sum + area.vertexCount, 0));
  assert.ok(audit.maxPublishedCoordinateElevationErrorMeters < 0.1);
  assert.equal(audit.allSourceHashesValid, true);
  assert.equal(audit.allPeakNamesAndCoordinatesExact, true);
  assert.equal(audit.allShadeImagesTransparentAtCropEdge, true);
});
