import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { BoundaryManifest } from '../shared/boundaries';
import { boundaryIndexPropertyKeys, type BoundaryIndex, type BoundaryIndexEntry } from '../shared/boundary-index';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.resolve(process.argv[2] ?? path.join(root, 'public/data/boundaries/indexes'));
const manifest: BoundaryManifest = JSON.parse(await readFile(path.join(root, 'public/data/boundaries/manifest.json'), 'utf8'));

function geometryBounds(geometry: Polygon | MultiPolygon): BoundaryIndexEntry['bbox'] {
  const bounds: BoundaryIndexEntry['bbox'] = [Infinity, Infinity, -Infinity, -Infinity];
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  for (const polygon of polygons) for (const ring of polygon) for (const point of ring) {
    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) throw new Error('Invalid boundary coordinates');
    bounds[0] = Math.min(bounds[0], point[0]);
    bounds[1] = Math.min(bounds[1], point[1]);
    bounds[2] = Math.max(bounds[2], point[0]);
    bounds[3] = Math.max(bounds[3], point[1]);
  }
  if (!bounds.every(Number.isFinite)) throw new Error('Boundary geometry has no coordinates');
  return bounds;
}

await mkdir(output, { recursive: true });
const summary = [];
for (const dataset of manifest.datasets) {
  const entries: BoundaryIndexEntry[] = [];
  const identifiers = new Set<string>();
  for (const layer of dataset.layers) {
    const collection: FeatureCollection<Polygon | MultiPolygon, Record<string, unknown>> = JSON.parse(await readFile(path.join(root, 'public', layer.url), 'utf8'));
    if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features) || collection.features.length !== layer.featureCount) {
      throw new Error(`Invalid boundary layer: ${layer.url}`);
    }
    for (const feature of collection.features) {
      const properties = feature.properties;
      if (!properties || typeof properties.id !== 'string' || typeof properties.name !== 'string'
        || properties.level !== layer.level || properties.year !== dataset.year || typeof properties.sourceId !== 'string'
        || !['Polygon', 'MultiPolygon'].includes(feature.geometry?.type)) throw new Error(`Invalid boundary feature in ${layer.url}`);
      if (identifiers.has(properties.id)) throw new Error(`Duplicate boundary ID: ${properties.id}`);
      identifiers.add(properties.id);
      const selected = Object.fromEntries(boundaryIndexPropertyKeys.filter(key => Object.hasOwn(properties, key)).map(key => [key, properties[key]]));
      entries.push({ ...selected, bbox: geometryBounds(feature.geometry) } as BoundaryIndexEntry);
    }
  }
  const index: BoundaryIndex = { datasetId: dataset.id, entries };
  const serialized = JSON.stringify(index) + '\n';
  await writeFile(path.join(output, `${dataset.id}.json`), serialized);
  summary.push({ datasetId: dataset.id, entries: entries.length, bytes: Buffer.byteLength(serialized) });
}
console.log(JSON.stringify(summary));
