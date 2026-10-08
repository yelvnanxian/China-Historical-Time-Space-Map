import type { BoundarySelection } from "./boundaries";
import type { TangBoundaryCrosswalk } from "./tang-boundary-crosswalk";
import type { TangCountyDiagnostics, TangCountyDiagnosticStatus } from "./tang-county-diagnostics";
import { temporalSettlementLink, temporalTangSettlementKey, temporalSettlementYearLabel, type TemporalSettlementProperties } from "./temporal-settlements";

export type DataReliabilityStatus = "checked" | "suspect" | "missing" | "unreviewed";
export interface DataReliability { status: DataReliabilityStatus; label: string; note: string; color: string }
export const reliabilityColors: Record<DataReliabilityStatus, string> = { checked: "#397965", suspect: "#b76939", missing: "#96649b", unreviewed: "#78828b" };
export const reliabilityLabels: Record<DataReliabilityStatus, string> = { checked: "已核对", suspect: "存疑", missing: "缺关联", unreviewed: "未核查" };
export const reliabilityStatuses = ["checked", "suspect", "missing", "unreviewed"] as const;
const assessment = (status: DataReliabilityStatus, note: string): DataReliability => ({ status, label: reliabilityLabels[status], color: reliabilityColors[status], note });
function diagnosticAssessment(status: TangCountyDiagnosticStatus): DataReliability {
  if (status === "matched") return assessment("checked", "已核对的治所点落在关联参考面内；只表示点面相符，不证明古址或边界准确。");
  if (status === "outside") return assessment("suspect", "核查显示治所点在相关参考面外，两套资料存在位置冲突。");
  if (status === "ambiguous") return assessment("suspect", "来源同名或关联候选不唯一，尚不能确定对应。");
  return assessment("missing", "尚无对应参考面的充分证据；缺关联不表示当时没有此建置。");
}

/** This view communicates the extent of checks, not a numeric credibility score. */
export function boundaryReliability(region: BoundarySelection, pointStatus?: "inside" | "outside"): DataReliability {
  if (region.geometryStatus === "outside" || region.geometryStatus === "ambiguous") return diagnosticAssessment(region.geometryStatus);
  if (pointStatus === "outside") return assessment("suspect", "已关联的城市参考点在来源模型之外，点面位置存疑。");
  if (region.nameStatus === "unresolved" || region.nameStatus === "unnamed") return assessment("missing", "来源名称尚未核定或未提供，保留原模型并标出名称缺口。");
  if (region.geometryStatus) return diagnosticAssessment(region.geometryStatus);
  if (pointStatus === "inside") return assessment("checked", "已核对的城市参考点位于来源面内；名称与建置史料另见详情，边线仍未逐段核定。");
  return assessment("unreviewed", "有来源模型，但当前没有点面一致性诊断；未发现标记不等于已经核实。");
}

export function settlementReliability(p: TemporalSettlementProperties, year: number, diagnostics?: TangCountyDiagnostics, crosswalk?: TangBoundaryCrosswalk): DataReliability {
  const legacyId = temporalTangSettlementKey(p, year);
  if (legacyId) {
    const diagnostic = diagnostics?.bySettlement[legacyId];
    if (diagnostic) {
      const samePoint = p.originalCoordinates?.every((coordinate, index) => Number(coordinate.toFixed(6)) === diagnostic.sourcePoint.coordinates[index]);
      if (!samePoint) return assessment("unreviewed", "同一来源编号的既有诊断坐标与本条原始点不一致，未将该诊断套用于此点。");
      return diagnosticAssessment(diagnostic.status);
    }
    const missing = crosswalk?.unmatchedSettlements?.[legacyId];
    if (missing) return assessment(missing.reasonCode === "outside-named-model" || missing.reasonCode === "ambiguous-named-model" ? "suspect" : "missing", `${missing.reason} 此核查仅关联755年治所与741年参考模型。`);
    const link = crosswalk?.settlements[legacyId];
    if (link) return assessment("checked", `已核对关联至${link.boundaryYear}年“${link.boundaryName}”模型；仅指来源关联，不能作为755年精确辖界。`);
  }
  const documented = temporalSettlementLink(p, year);
  if (documented) return assessment(documented.boundaryPointStatus === "outside" ? "suspect" : "checked", documented.boundaryNote);
  if (p.dateStatus === "broad-endpoints" || p.dateStatus === "incomplete-date-rules") return assessment("suspect", `${p.dateCaution} 这里的存疑针对年代精度，不表示治所位置已判错。`);
  return assessment("unreviewed", "尚无本浏览年的独立位置或辖区关联核查；缺少核查记录不等于来源已获确认。");
}

/** Keep a persistent legend from suggesting a hidden or failed layer is drawn. */
export function boundaryReliabilitySourceNote({ enabled, sourceYear, currentYear, loading, error }: {
  enabled: boolean; sourceYear?: number; currentYear: number; loading: boolean; error: boolean;
}): string {
  if (!enabled) return "行政边界已关闭；颜色仍用于已显示的同期治所。";
  if (error) return "行政边界加载失败，缺失图层不参与核查标注。";
  if (loading) return "行政边界正在加载，暂不把空白区域当作资料缺口。";
  if (sourceYear === undefined) return "当前年份没有已接入的行政边界；颜色仅用于已显示的同期治所。";
  return `行政面参考${temporalSettlementYearLabel(sourceYear)}；同期治所按${temporalSettlementYearLabel(currentYear)}筛选。`;
}
