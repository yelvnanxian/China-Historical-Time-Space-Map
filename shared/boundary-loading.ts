import type { BoundaryDataset, BoundaryLevel } from './boundaries';
import type { BoundaryIndex } from './boundary-index';

export function neededBoundaryLayers(dataset: BoundaryDataset | undefined, visibleLevels: readonly BoundaryLevel[], index: BoundaryIndex | undefined, targetIds: readonly string[] = []) {
  if (!dataset) return [];
  const wanted = new Set(visibleLevels);
  if (index?.datasetId === dataset.id) {
    for (const entry of index.entries) if (targetIds.includes(entry.id)) wanted.add(entry.level);
  }
  return dataset.layers.filter(layer => layer.featureCount > 0 && wanted.has(layer.level));
}

export function boundaryTargetReady(dataset: BoundaryDataset | undefined, index: BoundaryIndex | undefined, loadedLayerIds: readonly string[], targetId: string | undefined): boolean {
  if (!dataset || index?.datasetId !== dataset.id || !targetId) return false;
  const target = index.entries.find(entry => entry.id === targetId);
  if (!target) return true;
  const layers = dataset.layers.filter(layer => layer.level === target.level && layer.featureCount > 0);
  return layers.length > 0 && layers.every(layer => loadedLayerIds.includes(layer.id));
}
