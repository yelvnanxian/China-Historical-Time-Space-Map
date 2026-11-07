import type { BoundarySelection } from './boundaries';

export interface BoundaryIndexEntry extends BoundarySelection {
  sourceCode?: string;
  sourceName?: unknown;
  NAME_CH?: unknown;
  NAME_FT?: unknown;
  NAME_PY?: unknown;
  labelCoordinates?: [number, number];
  bbox: [number, number, number, number];
}

export interface BoundaryIndex {
  datasetId: string;
  entries: BoundaryIndexEntry[];
}

export const boundaryIndexPropertyKeys = [
  'id', 'name', 'level', 'year', 'sourceId', 'recordId', 'polity', 'sourceAdminType',
  'originalPolity', 'originalAdminType', 'originalName', 'modernNames',
  'correspondenceNote', 'correspondenceSourceIds', 'nameCorrectionNote',
  'nameSourceUrl', 'nameStatus', 'sourceHierarchy', 'geometryStatus',
  'sourceCode', 'sourceName', 'NAME_CH', 'NAME_FT', 'NAME_PY', 'labelCoordinates',
] as const satisfies readonly (keyof BoundaryIndexEntry)[];

export function boundaryIndexUrl(datasetId: string): string {
  return `/data/boundaries/indexes/${datasetId}.json`;
}
