import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { getBoundaryDisplayLabel } from "../shared/boundary-labels";
import { boundarySearchKey, simplifiedChinese } from "../shared/boundary-search";
import { isChineseDisplayName, localizedAdminType, localizedPolity, localizePhysicalGroup, naturalNameTranslations, historicalNameTranslations } from "../shared/place-name-localization";
import type { PhysicalGroup, PhysicalInteractionIndex } from "../shared/physical-geography";

const root = fileURLToPath(new URL("../", import.meta.url));
async function json(relative: string) { return JSON.parse(await readFile(path.join(root, relative), "utf8")); }
function assertSimplified(name: string) {
  assert.ok(isChineseDisplayName(name), name);
  assert.equal(simplifiedChinese(name), name, name);
}

test("全部25个行政图层和古今对照显示简体中文，并保留原名及历史归属", async () => {
  const manifest = await json("public/data/boundaries/manifest.json");
  const modern = await json("public/data/modern-correspondence.json");
  let layers = 0, features = 0, foreign = 0, unresolved = 0;
  for (const dataset of manifest.datasets) for (const layer of dataset.layers) {
    layers += 1;
    const collection = await json(`public${layer.url}`);
    for (const feature of collection.features) {
      const source = feature.properties;
      const copy = JSON.stringify(source);
      const display = getBoundaryDisplayLabel(source, modern.entries[source.id]?.simplifiedName);
      assertSimplified(display.name);
      assert.equal(display.originalName, source.name);
      assert.equal(JSON.stringify(source), copy);
      if (!isChineseDisplayName(source.name) && source.name !== "00") foreign += 1;
      if (display.nameStatus === "unresolved") unresolved += 1;
      const polity = localizedPolity(source.sourceHierarchy?.polity);
      const type = localizedAdminType(source.sourceAdminType);
      if (polity) assertSimplified(polity);
      if (type) assertSimplified(type);
      for (const name of modern.entries[source.id].modernNames) assertSimplified(simplifiedChinese(name));
      features += 1;
    }
  }
  assert.deepEqual({ layers, features, foreign, unresolved }, { layers: 25, features: 12111, foreign: 21, unresolved: 1 });
  assert.equal(getBoundaryDisplayLabel({ name: "於潛縣" }, "於潜县").name, "于潜县");
  assert.equal(getBoundaryDisplayLabel({ name: "金谿縣" }, "金谿县").name, "金溪县");
  assert.equal(getBoundaryDisplayLabel({ name: "劄佐長官司" }, "劄佐长官司").name, "札佐长官司");
});

test("540组自然地理、581个交互要素和51条山系走向共用中文名，源未命名河流不冒充已译名", async () => {
  const data: PhysicalInteractionIndex = await json("public/data/physical-interactions.json");
  const localized = new Map(data.groups.map(group => [group.groupId, localizePhysicalGroup(group)]));
  let translated = 0, unresolved = 0, unnamed = 0;
  for (const group of data.groups) {
    const result = localized.get(group.groupId)!;
    assertSimplified(result.name);
    assert.equal(result.originalName, group.name);
    assert.ok(result.aliases.includes(group.name));
    if (result.nameStatus === "translated") translated += 1;
    if (result.nameStatus === "unresolved") unresolved += 1;
    if (group.name.startsWith("未命名")) {
      unnamed += 1;
      assert.equal(result.name, group.name);
      assert.equal(result.nameStatus, "unnamed");
    }
  }
  assert.deepEqual({ groups: localized.size, translated, unresolved }, { groups: 540, translated: 163, unresolved: 21 });
  assert.ok(unnamed > 0);
  const geometry = await json("public/data/physical-interactive.geojson");
  assert.equal(geometry.features.length, 581);
  for (const feature of geometry.features) assertSimplified(localized.get(feature.properties.groupId)!.name);
  const directions = await json("public/data/mountain-directions.geojson");
  assert.equal(directions.features.length, 51);
  for (const feature of directions.features) assertSimplified(feature.properties.name);
});

test("按原始编号消歧，外文搜索仍找到中文结果，错配编号不会套用译名", async () => {
  const data: PhysicalInteractionIndex = await json("public/data/physical-interactions.json");
  const group = (id: number) => data.groups.find(g => g.groupId === `river-ne_10m_rivers_lake_centerlines-${id}`)!;
  assert.equal(localizePhysicalGroup(group(486)).name, "南乌河");
  assert.equal(localizePhysicalGroup(group(886)).name, "瓯江");
  assert.equal(localizePhysicalGroup(group(387)).name, "永河（泰国）");
  assert.equal(localizePhysicalGroup(group(1092)).name, "松河（印度）");
  assert.match(localizePhysicalGroup(group(148)).name, /^未定名/);
  assert.equal(localizePhysicalGroup(group(1118)).name, "泉河（颍河）");
  assert.match(localizePhysicalGroup(group(967)).name, /^未定名/);
  assert.equal(localizePhysicalGroup(group(646)).name, "第二松花江");
  const translated = localizePhysicalGroup(group(15));
  assert.equal(translated.name, "金沙江");
  assert.ok(boundarySearchKey([translated.name, ...translated.aliases].join(" ")).includes("jinsha"));
  assert.match(localizePhysicalGroup({ ...group(15), name: "Not Jinsha" } as PhysicalGroup).name, /^未定名/);
  const id = "hartwell-741-county-v5_0741_chin_chn_0741_c-316";
  assert.equal(getBoundaryDisplayLabel({ id, name: "Yinshui", sourceCode: "T001200003225", year: 741 }).name, "溵水县");
  assert.match(getBoundaryDisplayLabel({ id, name: "Yinshui", sourceCode: "WRONG", year: 741 }).name, /^未定名/);
  assert.match(getBoundaryDisplayLabel({ id, name: "Yinshui", year: 1391 }).name, /^未定名/);
});

test("原始地图和对照资料哈希不变，公开译名均可追溯到本地证据", async () => {
  const audit = await json("data/evidence/place-name-localization/localization-audit.json");
  for (const [relative, expected] of Object.entries(audit.sourceHashes)) {
    const bytes = await readFile(path.join(root, relative));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expected, relative);
  }
  for (const [id, translation] of Object.entries({ ...naturalNameTranslations, ...historicalNameTranslations })) {
    assertSimplified(simplifiedChinese(translation.displayName));
    if (translation.method === "unresolved") continue;
    assert.ok(translation.sourceUrl, id);
    assert.ok(translation.evidencePath, id);
    const evidence = await readFile(path.join(root, translation.evidencePath!));
    assert.ok(evidence.length > 0, id);
    if (translation.evidencePath!.endsWith(".json")) {
      const meta = await json(translation.evidencePath!.replace(/\.json$/, ".meta.json"));
      assert.equal(createHash("sha256").update(evidence).digest("hex"), meta.sha256, id);
    }
  }
});
