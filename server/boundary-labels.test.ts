import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import type { FeatureCollection } from "geojson";
import type { BoundaryManifest } from "../shared/boundaries";
import type { ModernCorrespondenceData } from "../shared/modern-correspondence";
import {
  boundaryDisplayName,
  getBoundaryDisplayLabel,
  isPlaceholderBoundaryName,
} from "../shared/boundary-labels";

const root = fileURLToPath(new URL("../", import.meta.url));
const affectedId = "hartwell-1200-province-v5_1200_chin_chn_1200_l-19";

test("占位检测处理空值、数字代码和全角00，并保留Nan等有效拼音", () => {
  for (const placeholder of [null, undefined, "", "  ", 0, "0", "00", "００", "21", "N/A", "NA", "NaN", Number.NaN, "---", "？？"])
    assert.equal(isPlaceholderBoundaryName(placeholder), true, String(placeholder));
  for (const name of ["Nan", "Na", "南州", "零陵县", "五原", "第十二州", "Aboriginal Tribal Lands", "Yinshui"])
    assert.equal(isPlaceholderBoundaryName(name), false, name);
});

test("同源证据恢复山东西路，覆盖古今对照中继承的00而保留原值", () => {
  const source = Object.freeze({ id: affectedId, name: "00", sourceName: "00", recordId: "19", sourceId: "hartwell-chgis-v5", sourceCode: "J003200000000", year: 1200 });
  const display = getBoundaryDisplayLabel(source, "00");
  assert.equal(display.name, "山东西路");
  assert.equal(display.originalName, "00");
  assert.equal(display.nameStatus, "source-recovered");
  assert.match(display.nameCorrectionNote!, /同源10个/);
  assert.equal(display.nameSourceUrl, "https://doi.org/10.7910/DVN/29302");
  assert.equal(source.name, "00");
  assert.equal(source.sourceName, "00");
});

test("修补只作用于核实过的源记录，不按上级、现代名或相同占位猜配", () => {
  const unrelated = { id: "another-region", name: "00", recordId: "7", sourceHierarchy: { polity: "東平府" } };
  const unresolved = getBoundaryDisplayLabel(unrelated, "济宁市");
  assert.equal(unresolved.name, "来源未命名区域 · 7");
  assert.equal(unresolved.nameStatus, "unnamed");
  assert.equal(getBoundaryDisplayLabel({ id: affectedId, name: "00", sourceCode: "DIFFERENT" }).nameStatus, "unnamed");
  assert.equal(getBoundaryDisplayLabel({ id: affectedId, name: "00", year: 1391 }).nameStatus, "unnamed");
  assert.equal(boundaryDisplayName({ name: "山東東路" }, "00"), "山东东路");
  assert.equal(boundaryDisplayName({ name: "", NAME_CH: "藍田縣" }), "蓝田县");
  assert.equal(boundaryDisplayName({ name: "Yinshui", sourceName: "" }), "未定名行政区");
});

test("核查记录以同一编码组10个府州及几何一致性支持山东西路，不误用東平府", async () => {
  const audit = JSON.parse(await readFile(path.join(root, "data/evidence/boundary-labels/placeholder-audit.json"), "utf8"));
  const correction = audit.correction;
  assert.equal(correction.boundaryId, affectedId);
  assert.equal(correction.rawSourceRecord.H_UNICODE_, "00");
  assert.equal(correction.rawSourceRecord.H_SUP_CHPV, "東平府");
  assert.equal(correction.restoredTraditionalName, "山東西路");
  assert.equal(correction.childSourceRecords.length, 10);
  for (const child of correction.childSourceRecords) {
    assert.ok(child.fields.CODE.startsWith("J0032"));
    assert.equal(child.fields.H_CHINPROV, "山東西路");
    assert.equal(child.fields.H_PROVINCE, "Shandong Xi Lu");
  }
  assert.ok(correction.spatialEvidence.intersectionOverUnion > 0.999999999);
  const archive = await readFile(path.join(root, correction.sourceArchive));
  assert.equal(createHash("sha256").update(archive).digest("hex"), correction.sourceArchiveSHA256);
});

test("全量历史区域的显示名无占位泄漏，古今对照原名不被暗改", async () => {
  const manifest: BoundaryManifest = JSON.parse(await readFile(path.join(root, "public/data/boundaries/manifest.json"), "utf8"));
  const modern: ModernCorrespondenceData = JSON.parse(await readFile(path.join(root, "public/data/modern-correspondence.json"), "utf8"));
  let recovered = 0;
  let visited = 0;
  for (const dataset of manifest.datasets) {
    for (const layer of dataset.layers) {
      const document: FeatureCollection = JSON.parse(await readFile(path.join(root, "public", layer.url.slice(1)), "utf8"));
      for (const feature of document.features) {
        const properties = feature.properties!;
        const cached = modern.entries[properties.id];
        const display = getBoundaryDisplayLabel(properties, cached?.simplifiedName);
        assert.ok(!isPlaceholderBoundaryName(display.name), properties.id);
        assert.equal(display.originalName, properties.name);
        assert.equal(cached.historicalName, properties.name);
        if (display.nameStatus === "source-recovered") recovered += 1;
        visited += 1;
      }
    }
  }
  assert.equal(visited, 12111);
  assert.equal(recovered, 1);
  assert.equal(modern.entries[affectedId].historicalName, "00");
  assert.equal(modern.entries[affectedId].simplifiedName, "00");
  assert.deepEqual(modern.entries[affectedId].modernNames, ["山东", "济宁市"]);
});
