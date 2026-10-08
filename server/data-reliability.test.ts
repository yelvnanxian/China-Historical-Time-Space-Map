import assert from "node:assert/strict";
import { test } from "node:test";
import { boundaryReliability, boundaryReliabilitySourceNote, settlementReliability } from "../shared/data-reliability";
import type { TemporalSettlementProperties } from "../shared/temporal-settlements";
import type { TangBoundaryCrosswalk } from "../shared/tang-boundary-crosswalk";
import type { BoundarySelection } from "../shared/boundaries";
import type { TangCountyDiagnostics } from "../shared/tang-county-diagnostics";
const region: BoundarySelection = { id: "x", name: "蓝田县", level: "county", year: 741, sourceId: "hartwell" };
const point = { id: "p", level: "prefecture", name: "未知郡", sourceRecordId: "1", beginYear: 742, endYear: 758, dateStatus: "specified-endpoints" } as TemporalSettlementProperties;

test("资料可靠性不把无诊断模型或年代明确点称已核对", () => {
  assert.equal(boundaryReliability(region).status, "unreviewed");
  assert.equal(settlementReliability(point, 755).status, "unreviewed");
  assert.equal(boundaryReliability({ ...region, geometryStatus: "matched" }).status, "checked");
  assert.match(boundaryReliability({ ...region, geometryStatus: "matched" }).note, /不证明/);
});
test("冲突、未定名、缺关联分别由已有字段触发", () => {
  assert.equal(boundaryReliability({ ...region, geometryStatus: "outside" }).status, "suspect");
  assert.equal(boundaryReliability({ ...region, nameStatus: "unnamed" }).status, "missing");
  assert.equal(boundaryReliability({ ...region, geometryStatus: "no-evidence" }).status, "missing");
  const crosswalk = { unmatchedSettlements: { "chgis-prefecture-1": { reasonCode: "no-named-model", reason: "没有同名模型" } } } as unknown as TangBoundaryCrosswalk;
  assert.equal(settlementReliability(point, 755, undefined, crosswalk).status, "missing");
  assert.equal(settlementReliability(point, 754, undefined, crosswalk).status, "unreviewed", "755核查不得套用其他年份");
});

test("重复来源编号不能把另一坐标点的诊断移接过来", () => {
  const diagnostics = { bySettlement: { "chgis-prefecture-1": { status: "matched", sourcePoint: { coordinates: [110, 32] } } } } as unknown as TangCountyDiagnostics;
  assert.equal(settlementReliability({ ...point, originalCoordinates: [111, 32] }, 755, diagnostics).status, "unreviewed");
  assert.equal(settlementReliability({ ...point, originalCoordinates: [110.00000001, 32] }, 755, diagnostics).status, "checked");
});

test("已核对的点面字段不能盖住未定名或另一明确冲突", () => {
  assert.equal(boundaryReliability({ ...region, geometryStatus: "matched", nameStatus: "unnamed" }).status, "missing");
  assert.equal(boundaryReliability({ ...region, geometryStatus: "matched" }, "outside").status, "suspect");
  assert.equal(boundaryReliability({ ...region, geometryStatus: "outside", nameStatus: "unnamed" }).status, "suspect");
  assert.equal(settlementReliability({ ...point, dateStatus: undefined } as unknown as TemporalSettlementProperties, 755).status, "unreviewed");
});

test("图例如实解释边界关闭、未收录、加载失败与异年参考", () => {
  const state = { enabled: true, sourceYear: 741, currentYear: 755, loading: false, error: false };
  assert.match(boundaryReliabilitySourceNote({ ...state, enabled: false }), /边界已关闭/);
  assert.match(boundaryReliabilitySourceNote({ ...state, error: true }), /加载失败/);
  assert.match(boundaryReliabilitySourceNote({ ...state, loading: true }), /正在加载/);
  assert.match(boundaryReliabilitySourceNote({ ...state, sourceYear: undefined }), /没有已接入/);
  assert.match(boundaryReliabilitySourceNote(state), /参考741年.*按755年/);
});
