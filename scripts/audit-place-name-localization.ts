/** Full dataset audit using the same display helpers as the map. No network. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { getBoundaryDisplayLabel } from "../shared/boundary-labels";
import { simplifiedChinese } from "../shared/boundary-search";
import { isChineseDisplayName, localizePhysicalGroup } from "../shared/place-name-localization";
import type { PhysicalGroup } from "../shared/physical-geography";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (relative: string) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const manifest = read("public/data/boundaries/manifest.json");
const modern = read("public/data/modern-correspondence.json");
const groups: PhysicalGroup[] = read("public/data/physical-interactions.json").groups;
const localized = new Map(groups.map(group => [group.groupId, localizePhysicalGroup(group)]));
const rows: Record<string, { count: number; foreignBefore: number; foreignAfter: number; traditionalBefore: number; traditionalAfter: number }> = {};
function count(kind: string, before: string, after: string) {
  const row = rows[kind] ??= { count: 0, foreignBefore: 0, foreignAfter: 0, traditionalBefore: 0, traditionalAfter: 0 };
  row.count += 1;
  row.foreignBefore += Number(!isChineseDisplayName(before) && before !== "00");
  row.foreignAfter += Number(!isChineseDisplayName(after));
  row.traditionalBefore += Number(simplifiedChinese(before) !== before);
  row.traditionalAfter += Number(simplifiedChinese(after) !== after);
}
let layers = 0;
for (const dataset of manifest.datasets) for (const layer of dataset.layers) {
  layers += 1;
  for (const feature of read(`public${layer.url}`).features) {
    const source = feature.properties;
    const match = modern.entries[source.id];
    const display = getBoundaryDisplayLabel(source, match?.simplifiedName);
    count("historicalBoundaries", source.name, display.name);
    count("modernCorrespondenceHistoricalNames", match.simplifiedName, display.name);
    for (const name of match.modernNames) count("modernReferenceNames", name, simplifiedChinese(name));
  }
}
for (const group of groups) count("physicalGroups", group.name, localized.get(group.groupId)!.name);
for (const feature of read("public/data/physical-interactive.geojson").features) count("physicalFeatures", feature.properties.name, localized.get(feature.properties.groupId)!.name);
for (const feature of read("public/data/mountain-directions.geojson").features) count("mountainDirections", feature.properties.name, localized.get(feature.properties.groupId)!.name);
const inputAudit = read("data/evidence/place-name-localization/localization-audit.json");
const changedSources = Object.entries(inputAudit.sourceHashes).filter(([file, hash]) => createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex") !== hash).map(([file]) => file);
const report = { layers, rows, naturalTranslatedGroups: inputAudit.naturalTranslatedGroups, unresolvedNaturalGroups: inputAudit.unresolvedNatural.length, sourceUnnamedNaturalGroups: [...localized.values()].filter(group => group.nameStatus === "unnamed").length, unresolvedHistorical: inputAudit.unresolvedHistorical.length, changedSources };
const destination = "data/evidence/place-name-localization/display-audit.json";
fs.writeFileSync(path.join(root, destination), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
if (changedSources.length || Object.values(rows).some(row => row.foreignAfter || row.traditionalAfter)) process.exitCode = 1;
