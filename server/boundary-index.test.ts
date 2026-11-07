import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import type { FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';
import type { BoundaryManifest, BoundarySelection } from '../shared/boundaries';
import { boundaryIndexUrl, type BoundaryIndex, type BoundaryIndexEntry } from '../shared/boundary-index';
import { getBoundaryDisplayLabel } from '../shared/boundary-labels';
import { boundarySearchKey } from '../shared/boundary-search';
import { boundaryHierarchyRelations } from '../shared/boundary-hierarchy';
import type { ModernCorrespondenceData } from '../shared/modern-correspondence';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (relative: string) => readFile(path.join(root, relative));
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const manifestBytes = await read('public/data/boundaries/manifest.json');
const manifest: BoundaryManifest = JSON.parse(manifestBytes.toString());
const inputHashes = new Map([['public/data/boundaries/manifest.json', hash(manifestBytes)]]);
const modern: ModernCorrespondenceData = JSON.parse((await read('public/data/modern-correspondence.json')).toString());
const datasets = await Promise.all(manifest.datasets.map(async dataset => {
  const index: BoundaryIndex = JSON.parse((await read(`public${boundaryIndexUrl(dataset.id)}`)).toString());
  const collections = await Promise.all(dataset.layers.map(async layer => {
    const filename = `public${layer.url}`;
    const bytes = await read(filename);
    inputHashes.set(filename, hash(bytes));
    return JSON.parse(bytes.toString()) as FeatureCollection<Polygon | MultiPolygon, BoundarySelection & Record<string, unknown>>;
  }));
  return { dataset, index, features: collections.flatMap(collection => collection.features) };
}));

test('全部边界索引保留搜索、显示和上下级导航字段，逐条对应源记录且不含几何', () => {
  const sourceFields = [
    'id', 'name', 'level', 'year', 'sourceId', 'recordId', 'polity', 'sourceAdminType',
    'originalPolity', 'originalAdminType', 'originalName', 'modernNames', 'correspondenceNote',
    'correspondenceSourceIds', 'nameCorrectionNote', 'nameSourceUrl', 'nameStatus', 'sourceHierarchy',
    'geometryStatus', 'sourceCode', 'sourceName', 'NAME_CH', 'NAME_FT', 'NAME_PY', 'labelCoordinates',
  ];
  let count = 0;
  for (const { dataset, index, features } of datasets) {
    assert.equal(index.datasetId, dataset.id);
    assert.equal(index.entries.length, features.length);
    assert.equal(new Set(index.entries.map(entry => entry.id)).size, features.length);
    for (const [offset, entry] of index.entries.entries()) {
      const properties = features[offset].properties;
      const { bbox, ...indexedProperties } = entry;
      assert.deepEqual(indexedProperties, Object.fromEntries(sourceFields.filter(key => Object.hasOwn(properties, key)).map(key => [key, properties[key]])), entry.id);
      assert.equal(entry.id, properties.id);
      assert.equal(entry.recordId, properties.recordId);
      assert.equal(entry.year, properties.year);
      assert.equal(entry.sourceId, properties.sourceId);
      assert.deepEqual(entry.sourceHierarchy, properties.sourceHierarchy);
      assert.ok(!Object.hasOwn(entry, 'geometry'));
      assert.equal(bbox.length, 4);
      count++;
    }
  }
  assert.equal(count, 12111);
});

test('索引bbox精确包围原始所有多边形坐标，未以标签点或截断坐标代替范围', () => {
  for (const { index, features } of datasets) {
    for (const [offset, feature] of features.entries()) {
      const bbox = index.entries[offset].bbox;
      const extrema = [Infinity, Infinity, -Infinity, -Infinity];
      const visit = (coordinates: Position | Position[] | Position[][] | Position[][][]) => {
        if (typeof coordinates[0] === 'number') {
          const [longitude, latitude] = coordinates as Position;
          assert.ok(longitude >= bbox[0] && longitude <= bbox[2] && latitude >= bbox[1] && latitude <= bbox[3], feature.properties.id);
          extrema[0] = Math.min(extrema[0], longitude); extrema[1] = Math.min(extrema[1], latitude);
          extrema[2] = Math.max(extrema[2], longitude); extrema[3] = Math.max(extrema[3], latitude);
        } else {
          for (const child of coordinates as Position[] | Position[][] | Position[][][]) visit(child);
        }
      };
      visit(feature.geometry.coordinates);
      assert.deepEqual(bbox, extrema, feature.properties.id);
    }
  }
});

test('索引与完整几何的中文显示名和搜索结果完全一致，保留00纠错及原名入口', () => {
  for (const { index, features } of datasets) {
    const searchable = (properties: BoundarySelection) => {
      const correspondence = modern.entries[properties.id];
      const display = getBoundaryDisplayLabel(properties, correspondence?.simplifiedName);
      return { id: properties.id, display, key: boundarySearchKey([display.name, display.originalName, ...(correspondence?.modernNames ?? [])].join(' ')) };
    };
    const indexed = index.entries.map(searchable);
    const original = features.map(feature => searchable(feature.properties));
    assert.deepEqual(indexed, original);
    for (const query of ['京兆', '長安', '江陵', '山东', '00', '北京', '未定名']) {
      const key = boundarySearchKey(query);
      assert.deepEqual(indexed.filter(entry => entry.key.includes(key)).map(entry => entry.id), original.filter(entry => entry.key.includes(key)).map(entry => entry.id));
    }
  }
});

test('各朝各级和属州路径的上下级导航在索引与完整源属性间一致', () => {
  const summarize = (selected: BoundarySelection, regions: BoundarySelection[]) => {
    const relations = boundaryHierarchyRelations(selected, regions);
    return {
      parents: relations.parents.map(region => region.id), children: relations.children.map(region => region.id),
      ambiguousParents: relations.ambiguousParents.map(group => ({ level: group.level, candidates: group.candidates.map(region => region.id) })),
      sourcePath: relations.sourcePath, missingReason: relations.missingReason,
    };
  };
  for (const { dataset, index, features } of datasets) {
    const properties = features.map(feature => feature.properties);
    const samples = new Set(dataset.layers.flatMap(layer => {
      const candidates = index.entries.filter(entry => entry.level === layer.level);
      return [candidates[0], candidates[candidates.length - 1]].filter((entry): entry is BoundaryIndexEntry => !!entry);
    }));
    const dependent = index.entries.find(entry => entry.sourceHierarchy?.dependentPrefecture);
    if (dependent) samples.add(dependent);
    const sourceById = new Map(properties.map(entry => [entry.id, entry]));
    for (const entry of samples) assert.deepEqual(summarize(entry, index.entries), summarize(sourceById.get(entry.id)!, properties), entry.id);
  }
});

test('生成器可重复生成完全相同的索引，原始manifest及所有几何文件字节不变', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'atlas-boundary-index-'));
  try {
    execFileSync(process.execPath, ['--import', 'tsx', path.join(root, 'scripts/build-boundary-indexes.ts'), directory], { cwd: root });
    for (const { dataset } of datasets) {
      assert.deepEqual(await readFile(path.join(directory, `${dataset.id}.json`)), await read(`public${boundaryIndexUrl(dataset.id)}`), dataset.id);
    }
    for (const [filename, expected] of inputHashes) assert.equal(hash(await read(filename)), expected, filename);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
