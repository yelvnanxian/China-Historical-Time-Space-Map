/** Reproduce navigation coverage from the five published Hartwell snapshots.
 *
 * Run: npx tsx scripts/audit-boundary-hierarchy.ts
 * This is a navigation audit, not a verification of historical jurisdictions.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BoundaryLevel, BoundaryManifest, BoundarySelection } from "../shared/boundaries";
import { boundaryHierarchyRelations, type BoundaryHierarchyRelations } from "../shared/boundary-hierarchy";
import { simplifiedChinese } from "../shared/boundary-search";

interface SourceCollection {
  type: "FeatureCollection";
  features: { properties: BoundarySelection }[];
}

const root = fileURLToPath(new URL("../", import.meta.url));
const outputPath = "data/evidence/boundary-hierarchy-navigation-audit.json";
const inputHashes: Record<string, string> = {};
const sourceYears = [741, 1080, 1200, 1290, 1391];
const normalize = (value: string | undefined): string => simplifiedChinese(value ?? "").trim();

async function readInput(relativePath: string): Promise<Buffer> {
  const bytes = await readFile(path.join(root, relativePath));
  inputHashes[relativePath] = createHash("sha256").update(bytes).digest("hex");
  return bytes;
}

function scopeKey(region: BoundarySelection): string {
  return JSON.stringify([
    region.year,
    region.sourceId,
    normalize(region.sourceHierarchy?.polity),
    normalize(region.sourceHierarchy?.province),
  ]);
}

function count(regions: BoundarySelection[], predicate: (region: BoundarySelection) => boolean): number {
  return regions.filter(predicate).length;
}

function auditYear(year: number, regions: BoundarySelection[]) {
  assert.equal(new Set(regions.map(region => region.id)).size, regions.length, `${year}: duplicate feature IDs`);
  const groups = new Map<string, BoundarySelection[]>();
  for (const region of regions) {
    const key = scopeKey(region);
    const group = groups.get(key) ?? [];
    group.push(region);
    groups.set(key, group);
  }

  // Every parent, child and duplicate-identity predicate requires this same
  // source/year/polity/province scope. Pre-grouping reduces repeated OpenCC
  // work without changing the production resolver or source properties.
  const relations = new Map<string, BoundaryHierarchyRelations>(regions.map(region => [
    region.id,
    boundaryHierarchyRelations(region, groups.get(scopeKey(region))!),
  ]));
  const relation = (region: BoundarySelection): BoundaryHierarchyRelations => relations.get(region.id)!;
  const equivalenceSamples = [
    regions[0],
    regions[regions.length - 1],
    ...regions.filter(region => region.level === "prefecture" && region.sourceHierarchy?.dependentPrefecture).slice(0, 2),
  ].filter((region): region is BoundarySelection => !!region);
  for (const region of equivalenceSamples) {
    assert.deepEqual(relation(region), boundaryHierarchyRelations(region, regions), `${year}: scope equivalence ${region.id}`);
  }

  const selectLevel = (level: BoundaryLevel): BoundarySelection[] => regions.filter(region => region.level === level);
  const counties = selectLevel("county");
  const prefectures = selectLevel("prefecture");
  const provinces = selectLevel("province");
  const hasParent = (region: BoundarySelection, level: BoundaryLevel): boolean => relation(region).parents.some(parent => parent.level === level);
  const hasChildren = (region: BoundarySelection): boolean => relation(region).children.length > 0;
  const hasAmbiguities = (region: BoundarySelection): boolean => relation(region).ambiguousParents.length > 0;

  return {
    year,
    total: regions.length,
    counties: counties.length,
    countiesWithProvince: count(counties, region => hasParent(region, "province")),
    countiesWithPrefecture: count(counties, region => hasParent(region, "prefecture")),
    countiesWithBoth: count(counties, region => hasParent(region, "province") && hasParent(region, "prefecture")),
    countiesWithAnyParent: count(counties, region => relation(region).parents.length > 0),
    countyAmbiguities: count(counties, hasAmbiguities),
    prefectures: prefectures.length,
    prefecturesWithCountyList: count(prefectures, hasChildren),
    prefecturesWithProvince: count(prefectures, region => hasParent(region, "province")),
    prefectureAmbiguities: count(prefectures, hasAmbiguities),
    provinces: provinces.length,
    provincesWithPrefectureList: count(provinces, hasChildren),
    unresolvedSourceScopes: count(regions, region => !normalize(region.sourceHierarchy?.polity) || !normalize(region.sourceHierarchy?.province)),
    duplicateParentIdentities: regions
      .filter(region => /多个同路径/.test(relation(region).missingReason ?? ""))
      .map(region => ({ id: region.id, name: region.name, path: region.sourceHierarchy })),
    dualAmbiguityGroups: regions
      .filter(region => relation(region).ambiguousParents.filter(group => group.level === "prefecture").length > 1)
      .map(region => region.id),
    prefectureAncestorOmissions: prefectures.flatMap(region => {
      const hierarchy = region.sourceHierarchy;
      if (!normalize(hierarchy?.prefecture) || !normalize(hierarchy?.dependentPrefecture)) return [];
      const candidates = groups.get(scopeKey(region))!.filter(candidate => candidate.id !== region.id
        && candidate.level === "prefecture"
        && normalize(candidate.sourceHierarchy?.prefecture) === normalize(hierarchy?.prefecture)
        && !normalize(candidate.sourceHierarchy?.dependentPrefecture));
      return candidates.length === 1 && !relation(region).parents.some(parent => parent.id === candidates[0].id)
        ? [{ id: region.id, name: region.name, path: hierarchy, parent: candidates[0].id }]
        : [];
    }),
  };
}

const manifest: BoundaryManifest = JSON.parse((await readInput("public/data/boundaries/manifest.json")).toString("utf8"));
for (const relativePath of ["shared/boundary-hierarchy.ts", "shared/boundary-search.ts", "package-lock.json"]) await readInput(relativePath);
const snapshots = [];
for (const year of sourceYears) {
  const dataset = manifest.datasets.find(item => item.id === `hartwell-${year}`);
  assert.ok(dataset && dataset.year === year, `Missing Hartwell snapshot ${year}`);
  const regions: BoundarySelection[] = [];
  for (const layer of dataset.layers) {
    assert.ok(layer.url.startsWith("/data/boundaries/") && !layer.url.includes(".."), layer.url);
    const collection: SourceCollection = JSON.parse((await readInput(`public${layer.url}`)).toString("utf8"));
    assert.equal(collection.type, "FeatureCollection");
    assert.equal(collection.features.length, layer.featureCount, layer.id);
    for (const { properties } of collection.features) {
      assert.equal(properties.year, year, properties.id);
      assert.equal(properties.level, layer.level, properties.id);
      assert.ok(properties.id && properties.sourceId, layer.id);
      regions.push(properties);
    }
  }
  const result = auditYear(year, regions);
  snapshots.push(result);
  console.log(`${year}: county ${result.countiesWithPrefecture}/${result.counties} → prefecture; ${result.countiesWithProvince}/${result.counties} → province; prefecture child lists ${result.prefecturesWithCountyList}/${result.prefectures}`);
}

const report = {
  schemaVersion: 1,
  command: "npx tsx scripts/audit-boundary-hierarchy.ts",
  method: "Call the production boundaryHierarchyRelations resolver on the original published sourceHierarchy fields. Restrict only by identical source, year, simplified polity and province; independently compare sample results against the full snapshot. Count unique navigable targets, and retain ambiguous and missing paths without inference.",
  limitations: [
    "These counts describe navigation availability, not verified historical administrative relationships or complete jurisdiction coverage.",
    "Source geometry, source names and hierarchy fields are not corrected or inferred by this audit. Display-name corrections do not participate in identity matching.",
    "Prefecture links may include explicit ancestors above dependent prefectures; child lists can include dependent-prefecture paths, not only directly administered counties.",
    "1290 province features have no polity field, so the resolver deliberately provides no province navigation instead of guessing a relationship.",
    "Repeated complete parent paths remain ambiguous even when their display names differ. Unnamed or malformed records are not matched using a corrected display name.",
  ],
  inputHashes,
  snapshots,
};
await mkdir(path.dirname(path.join(root, outputPath)), { recursive: true });
await writeFile(path.join(root, outputPath), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Wrote ${outputPath}`);
