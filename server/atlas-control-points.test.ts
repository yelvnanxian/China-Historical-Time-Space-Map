import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const read = async (path: string) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));

test("原图参照点绑定已核读的原始图幅与目录坐标，不改变原图或推定古址", async () => {
  const index = await read("public/data/atlas/control-points.json");
  const atlas = await read("public/data/atlas/manifest.json");
  const catalog = await read("data/catalog.json");
  assert.equal(index.method, "manual-modern-reference-landmarks");
  assert.equal(index.images.length, 6);
  const ids = new Set<string>();
  for (const image of index.images) {
    const original = atlas.images.find((entry: { id: string }) => entry.id === image.imageId);
    assert.ok(original, image.imageId);
    assert.equal(image.imageSha256, original.sha256);
    assert.equal(image.width, original.width);
    assert.equal(image.height, original.height);
    assert.equal(image.imageSha256, createHash("sha256").update(await readFile(new URL(`../public${original.imageUrl}`, import.meta.url))).digest("hex"));
    assert.equal(image.points.length, 2);
    for (const point of image.points) {
      assert.ok(!ids.has(point.id)); ids.add(point.id);
      assert.equal(point.kind, "modern-reference");
      assert.ok(point.x > 0 && point.x < 1 && point.y > 0 && point.y < 1);
      assert.equal(point.x, point.imagePixel[0] / image.width);
      assert.equal(point.y, point.imagePixel[1] / image.height);
      const place = catalog.places.find((entry: { id: string }) => entry.id === point.catalogPlaceId);
      assert.deepEqual(point.coordinates, place.coordinates);
      assert.match(point.note, /不核定.*古城/);
      for (const id of point.sourceIds) assert.ok(catalog.sources.some((source: { id: string }) => source.id === id));
    }
  }
  assert.equal(ids.size, 12);
});
