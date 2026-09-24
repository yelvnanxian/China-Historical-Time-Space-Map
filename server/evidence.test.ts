import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { loadCatalog } from './catalog';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const catalog = await loadCatalog(path.join(projectRoot, 'data/catalog.json'));

test('发布库所有已核对引文逐字存在于对应卷来源快照，事件和地点引用不串卷', async () => {
  const sources = new Map(catalog.sources.map(source => [source.id, source]));
  const checked = [...catalog.events, ...catalog.places].flatMap(entity =>
    (entity.evidence ?? []).filter(evidence => evidence.status === 'checked').map(evidence => ({ entity, evidence })));
  assert.ok(checked.length > 0, '专题应提供实际核对过的证据');
  const sourceIds = [...new Set(checked.map(({ evidence }) => evidence.sourceId))];
  const snapshots = new Map(await Promise.all(sourceIds.map(async sourceId => {
    const source = sources.get(sourceId)!;
    assert.ok(source.snapshotPath, `${sourceId} 缺少可复核文本快照`);
    assert.ok(source.revisionId && source.retrievedAt && source.license, `${sourceId} 缺少修订、获取时间或许可信息`);
    const snapshotPath = path.resolve(projectRoot, source.snapshotPath);
    assert.ok(snapshotPath.startsWith(`${path.join(projectRoot, 'data', 'evidence')}${path.sep}`), `${sourceId} 快照必须位于证据目录`);
    return [sourceId, await readFile(snapshotPath, 'utf8')] as const;
  })));
  for (const { entity, evidence } of checked) {
    const source = sources.get(evidence.sourceId)!;
    assert.ok(entity.sourceIds.includes(source.id), `${entity.id}/${evidence.id} 来源未关联`);
    assert.ok(snapshots.get(source.id)!.includes(evidence.quote!), `${entity.id}/${evidence.id} 的逐字引文不在 ${source.snapshotPath} 中`);
    const sourceVolume = source.locator.match(/卷\s*(\d+)/)?.[1];
    const evidenceVolume = evidence.locator.match(/卷\s*(\d+)/)?.[1];
    if (sourceVolume) assert.equal(evidenceVolume, sourceVolume, `${entity.id}/${evidence.id} 的引用位置与所属卷不符`);
    assert.ok(evidence.supports.trim(), `${entity.id}/${evidence.id} 缺少明确支持事项`);
  }
});
