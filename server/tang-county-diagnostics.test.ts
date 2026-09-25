import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";
import { boundaryContainsPoint, type TangBoundaryCrosswalk } from "../shared/tang-boundary-crosswalk";
import type { TangCountyDiagnostics, TangCountyDiagnosticStatus } from "../shared/tang-county-diagnostics";
import type { TangDetailCollection } from "../shared/tang-detail";

const root = new URL("../", import.meta.url);
const bytes = (path: string) => readFileSync(new URL(path, root));
const read = <T,>(path: string): T => JSON.parse(bytes(path).toString("utf8"));
const diagnostics = read<TangCountyDiagnostics>("public/data/tang-county-diagnostics.json");
const current = read<TangDetailCollection>("public/data/tang-detail/settlements-755.geojson").features.filter(feature => feature.properties.level === "county");
const old = new Map(read<TangDetailCollection>("public/data/tang-detail/settlements-741.geojson").features.map(feature => [feature.properties.id, feature]));
const models = read<FeatureCollection<Polygon | MultiPolygon, { id: string; name: string; sourceName: string; labelCoordinates: Position }>>("public/data/boundaries/hartwell-741-county.geojson").features;
const modelById = new Map(models.map(feature => [feature.properties.id, feature]));
const crosswalk = read<TangBoundaryCrosswalk>("public/data/tang-boundary-crosswalk.json");
const countyId = (id: number) => `hartwell-741-county-v5_0741_chin_chn_0741_c-${id}`;

test("县点面诊断覆盖全部1365县点1495原模型，来源哈希与独立原ZIP核验记录一致", () => {
  assert.equal(Object.keys(diagnostics.bySettlement).length, current.length);
  assert.equal(Object.keys(diagnostics.byBoundary).length, models.length);
  assert.equal(diagnostics.statistics.sourceCountyPoints, 1365);
  assert.equal(diagnostics.statistics.countyModels, 1495);
  assert.deepEqual(diagnostics.statistics.settlementsByStatus, { matched: 831, outside: 248, ambiguous: 0, "no-evidence": 286 });
  assert.deepEqual(diagnostics.statistics.boundariesByStatus, { matched: 831, outside: 205, ambiguous: 32, "no-evidence": 427 });
  for (const [entries, totals] of [[diagnostics.bySettlement, diagnostics.statistics.settlementsByStatus], [diagnostics.byBoundary, diagnostics.statistics.boundariesByStatus]] as const) {
    for (const status of ["matched", "outside", "ambiguous", "no-evidence"] as TangCountyDiagnosticStatus[]) {
      assert.equal(Object.values(entries).filter(entry => entry.status === status).length, totals[status]);
    }
  }
  for (const source of diagnostics.sources) assert.equal(createHash("sha256").update(bytes(source.path)).digest("hex"), source.sha256, source.id);
  const audit = read<{ publishedSha256: string; sourceVerification: Record<string, unknown> }>("data/evidence/tang-detail/county-point-model-audit.json");
  assert.equal(audit.publishedSha256, createHash("sha256").update(bytes("public/data/tang-county-diagnostics.json")).digest("hex"));
  assert.deepEqual(audit.sourceVerification, { publishedCountyPointsComparedToOriginalZip: 1365, pointCoordinatesAndFieldsEqualSource: true,
    countyModelsComparedToOriginalZip: 1495, modelSourceNamesAndCodesEqual: true, allModelGeometriesEqualOriginalReprojection: true,
    modelLabelAnchorsInsideTheirOwnGeometry: true, linkedCountyPointOutsideItsVerifiedModel: [] });
});

test("每个诊断点保持真实来源坐标，县面contains判断与原模型几何一致", () => {
  for (const feature of current) {
    const p = feature.properties, diagnostic = diagnostics.bySettlement[p.id];
    assert.ok(diagnostic, p.id);
    assert.equal(feature.geometry.type, "Point");
    if (feature.geometry.type !== "Point") continue;
    const coordinates = feature.geometry.coordinates;
    assert.deepEqual(diagnostic.sourcePoint.coordinates, coordinates, p.id);
    assert.equal(diagnostic.sourcePoint.sourceRecordId, p.sourceRecordId);
    assert.equal(diagnostic.sourcePoint.name, p.name);
    const containing = diagnostic.candidates.filter(candidate => {
      const actual = boundaryContainsPoint(modelById.get(candidate.boundaryId)!.geometry, coordinates);
      assert.equal(candidate.containsPoint, actual, `${p.id}/${candidate.boundaryId}`);
      assert.equal(candidate.distanceKm === 0, actual, `${p.id}/${candidate.boundaryId}`);
      return actual;
    });
    assert.deepEqual(diagnostic.sourcePoint.matchedBoundaryIds, containing.map(candidate => candidate.boundaryId));
    if (diagnostic.status === "matched") assert.equal(containing.length, 1);
    if (diagnostic.status === "outside") assert.equal(containing.length, 0);
  }
});

/** Independent spherical local-plane check, suitable for these nearby edges. */
function localDistanceKm(point: Position, geometry: Polygon | MultiPolygon) {
  const project = (p: Position) => [(p[0] - point[0]) * Math.cos(point[1] * Math.PI / 180) * 6371 * Math.PI / 180, (p[1] - point[1]) * 6371 * Math.PI / 180];
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let distance = Infinity;
  for (const rings of polygons) for (const ring of rings) for (let index = 1; index < ring.length; index += 1) {
    const a = project(ring[index - 1]), b = project(ring[index]);
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / (dx * dx + dy * dy || 1)));
    distance = Math.min(distance, Math.hypot(a[0] + t * dx, a[1] + t * dy));
  }
  return distance;
}

test("唐城与湖北吉阳的8.86和2.33公里差异来自原始点面，并非标签中心或错误crosswalk", () => {
  for (const [id, areaId, distance] of [["chgis-county-43627", countyId(695), 8.86033], ["chgis-county-43673", countyId(1029), 2.327538]] as const) {
    const diagnostic = diagnostics.bySettlement[id], boundary = diagnostics.byBoundary[areaId];
    assert.equal(diagnostic.status, "outside");
    assert.deepEqual(diagnostic.candidateBoundaryIds, [areaId]);
    assert.equal(boundary.status, "outside");
    assert.equal(boundary.sourcePoints.length, 1);
    assert.equal(boundary.sourcePoints[0].id, id);
    assert.equal(diagnostic.sourcePoint.sameRecordIn741, true);
    assert.equal(crosswalk.settlements[id], undefined, "No incorrect county or parent crosswalk was silently created");
    assert.equal(diagnostic.minDistanceKm, distance);
    assert.ok(Math.abs(localDistanceKm(diagnostic.sourcePoint.coordinates, modelById.get(areaId)!.geometry) - distance) < .05);
    assert.notDeepEqual(diagnostic.sourcePoint.coordinates, modelById.get(areaId)!.properties.labelCoordinates);
    assert.deepEqual(old.get(id)!.geometry, { type: "Point", coordinates: diagnostic.sourcePoint.coordinates });
  }
});

test("两处吉阳依据古籍州属区分，异地同名面不进入当前县的可选诊断候选", () => {
  const hubei = diagnostics.bySettlement["chgis-county-43673"], hainan = diagnostics.bySettlement["chgis-county-42505"];
  assert.deepEqual(hubei.candidateBoundaryIds, [countyId(1029)]);
  assert.deepEqual(hubei.excludedHomonymBoundaryIds, [countyId(1408)]);
  assert.deepEqual(hainan.candidateBoundaryIds, [countyId(1408)]);
  assert.deepEqual(hainan.excludedHomonymBoundaryIds, [countyId(1029)]);
  assert.equal(hainan.status, "matched");
  assert.equal(diagnostics.byBoundary[countyId(1408)].status, "matched");
  assert.deepEqual(diagnostics.byBoundary[countyId(1408)].sourcePoints.map(point => point.id), ["chgis-county-42505"]);
  assert.deepEqual(diagnostics.byBoundary[countyId(1029)].sourcePoints.map(point => point.id), ["chgis-county-43673"]);
  assert.ok(diagnostics.byBoundary[countyId(1408)].excludedHomonyms.some(point => point.id === hubei.sourcePoint.id));
  assert.ok(diagnostics.byBoundary[countyId(1029)].excludedHomonyms.some(point => point.id === hainan.sourcePoint.id));
  assert.equal(crosswalk.settlements[hainan.sourcePoint.id].countyBoundaryId, countyId(1408));
});

test("标记冲突的205模型都有唯一可比身份和741同点，歧义与无证据模型不冒充错误边界", () => {
  for (const diagnostic of Object.values(diagnostics.byBoundary)) {
    if (diagnostic.status !== "outside") continue;
    assert.equal(diagnostic.sourcePoints.length, 1, diagnostic.boundaryId);
    const point = diagnostic.sourcePoints[0];
    assert.equal(point.sameRecordIn741, true);
    assert.equal(point.insideBoundary, false);
    assert.deepEqual(diagnostics.bySettlement[point.id].candidateBoundaryIds, [diagnostic.boundaryId]);
    assert.ok(point.distanceKm > 0);
    assert.equal(boundaryContainsPoint(modelById.get(diagnostic.boundaryId)!.geometry, point.coordinates), false);
  }
  const outsideBoth = Object.values(diagnostics.bySettlement).filter(item => item.status === "outside" && item.sourcePoint.sameRecordIn741);
  assert.equal(outsideBoth.length, 239);
  assert.equal(diagnostics.statistics.outsideInBoth741And755, 239);
});

test("唐城吉阳史料引文逐字可查，引用不能冒充精确坐标或古代县界考证", () => {
  const evidence = read<{ sources: { id: string; snapshotPath: string; snapshotSha256: string }[];
    historicalTextEvidence: { sourceId: string; quote: string; appliesToSysIds: number[]; doesNotSupport: string[] }[];
    notEstablished: string[] }>("data/evidence/tang-detail/county-location-historical-references.json");
  const sources = new Map(evidence.sources.map(source => [source.id, source]));
  for (const source of sources.values()) assert.equal(createHash("sha256").update(bytes(source.snapshotPath)).digest("hex"), source.snapshotSha256);
  for (const item of evidence.historicalTextEvidence) {
    assert.ok(bytes(sources.get(item.sourceId)!.snapshotPath).toString("utf8").includes(item.quote), item.sourceId);
    assert.ok(item.doesNotSupport.length);
  }
  assert.ok(evidence.historicalTextEvidence.some(item => item.appliesToSysIds.includes(43627) && item.quote.includes("開元二十六年")));
  assert.ok(evidence.historicalTextEvidence.some(item => item.appliesToSysIds.includes(43673) && item.quote.includes("吉陽")));
  assert.ok(evidence.notEstablished.some(note => note.includes("未独立复原")));
  assert.equal(Object.values(diagnostics.bySettlement).filter(item => item.historicalContext).length, 3);
  assert.equal(Object.values(diagnostics.byBoundary).filter(item => item.historicalContext).length, 3);
  for (const [id, areaId, expectedSummary] of [["chgis-county-43627", countyId(695), "738"], ["chgis-county-43673", countyId(1029), "安陆郡"], ["chgis-county-42505", countyId(1408), "临振郡"]]) {
    const context = diagnostics.bySettlement[id].historicalContext!;
    assert.ok(context.summary.includes(expectedSummary));
    assert.ok(evidence.historicalTextEvidence.some(item => item.quote === context.quote && item.appliesToSysIds.includes(Number(diagnostics.bySettlement[id].sourcePoint.sourceRecordId))));
    assert.match(context.sourceUrl, /oldid=\d+/);
    assert.deepEqual(diagnostics.byBoundary[areaId].historicalContext, context);
  }
});
