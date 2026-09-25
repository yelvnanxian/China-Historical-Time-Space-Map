import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { canOpenCountyModel } from "../shared/county-model-interaction";
import type { TangCountyDiagnostics } from "../shared/tang-county-diagnostics";

const data: TangCountyDiagnostics = JSON.parse(readFileSync(new URL("../public/data/tang-county-diagnostics.json", import.meta.url), "utf8"));

test("县治跳转必须保持原对象身份，不能打开匹配另一同名治所的模型", () => {
  let rejectedAmbiguities = 0;
  for (const settlement of Object.values(data.bySettlement)) for (const candidate of settlement.candidates) {
    const boundary = data.byBoundary[candidate.boundaryId];
    const allowed = canOpenCountyModel(settlement, candidate, boundary);
    if (allowed) {
      assert.ok(boundary.sourcePoints.some(point => point.id === settlement.sourcePoint.id));
      if (settlement.status === "matched") assert.ok(candidate.containsPoint && boundary.status === "matched");
      else assert.equal(boundary.status, "outside");
    }
    if (settlement.status === "outside" && boundary.status !== "outside") {
      assert.equal(allowed, false, `${settlement.sourcePoint.id}不能跳进歧义或另一同名县的已匹配面`);
      rejectedAmbiguities++;
    }
  }
  assert.ok(rejectedAmbiguities > 0, "实际资料存在同名多模型回归样例");
});

test("唐城县与湖北吉阳县可查看存疑模型，海南吉阳县只打开自身匹配模型", () => {
  for (const id of ["chgis-county-43627", "chgis-county-43673", "chgis-county-42505"]) {
    const settlement = data.bySettlement[id];
    assert.ok(settlement);
    const targets = settlement.candidates.filter(candidate => canOpenCountyModel(settlement, candidate, data.byBoundary[candidate.boundaryId]));
    assert.equal(targets.length, 1);
    assert.equal(data.byBoundary[targets[0].boundaryId].status, id.endsWith("42505") ? "matched" : "outside");
  }
});
