import type { FeatureCollection, LineString } from "geojson";

export type MountainShapeBounds = [number, number, number, number];

/** Contours are derived modern elevations, never mountain or historical boundaries. */
export interface MountainContourProperties {
  id: string;
  areaId: string;
  elevation: number;
  index: boolean;
  modernReferenceOnly: true;
}

export type MountainContourCollection = FeatureCollection<LineString, MountainContourProperties>;

export interface MountainShapeSourceTile {
  z: number;
  x: number;
  y: number;
  sourceUrl: string;
  evidencePath: string;
  sha256: string;
  bytes: number;
  retrievedAt: string;
}

export interface MountainShapeArea {
  id: string;
  name: string;
  regionId: string;
  center: [number, number];
  bounds: MountainShapeBounds;
  contoursUrl: string;
  shadeUrl: string;
  imageCoordinates: [[number, number], [number, number], [number, number], [number, number]];
  sourcePeak: {
    id: string;
    name: string;
    coordinates: [number, number];
    sourceUrl: string;
    sourcePackUrl: string;
    sourcePackSha256: string;
    tags: Record<string, string>;
  };
  demZoom: number;
  pixelSizeMeters: number;
  pixelSizeMetersRange: [number, number];
  pixelDimensions: [number, number];
  contourInterval: number;
  indexInterval: number;
  minZoom: number;
  featureCount: number;
  vertexCount: number;
  elevationRange: [number, number];
  excludedDemSamples: { coordinates: [number, number]; elevation: number; reason: string }[];
  sourceTiles: MountainShapeSourceTile[];
  contoursSha256: string;
  shadeSha256: string;
  modernReferenceOnly: true;
  note: string;
}

export interface MountainShapesManifest {
  version: string;
  title: string;
  modernReferenceOnly: true;
  source: {
    name: string;
    url: string;
    template: string;
    encoding: "terrarium";
    elevationFormula: string;
    attribution: string;
    attributionUrl: string;
  };
  processing: {
    contourMethod: string;
    hillshadeMethod: string;
    sunAzimuth: number;
    sunAltitude: number;
    verticalExaggeration: number;
    edgeFadePixels: number;
    demExclusionPolicy: string;
  };
  areaCount: number;
  sourceTileCount: number;
  featureCount: number;
  note: string;
  areas: MountainShapeArea[];
}
