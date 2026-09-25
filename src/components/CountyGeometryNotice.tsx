import type { TangCountyBoundaryDiagnostic, TangCountySettlementDiagnostic } from "../../shared/tang-county-diagnostics";
import HistoricalResearchNotice from "./HistoricalResearchNotice";

export default function CountyGeometryNotice({ diagnostic, onCompare }: {
  diagnostic: TangCountyBoundaryDiagnostic | TangCountySettlementDiagnostic;
  onCompare?: () => void;
}) {
  const outside = diagnostic.status === "outside";
  const matched = diagnostic.status === "matched";
  const research = diagnostic.historicalResearch ?? [];
  const hasResearch = research.length > 0;
  const hasExcludedHomonym = research.some(entry => entry.correspondence === "different-unit");
  // An excluded homonym can coexist with a documented, valid candidate. The
  // diagnostic status still describes the candidates retained by the audit.
  const excludedHomonymsOnly = diagnostic.status === "no-evidence" && hasExcludedHomonym;
  return <section className={`county-geometry-notice${outside ? " is-conflicted" : ""}${excludedHomonymsOnly ? " is-homonym-excluded" : ""}`} aria-label="县治与参考范围核查">
    <strong>{excludedHomonymsOnly ? "已排除异地同名对应" : outside ? "治所与参考范围不一致" : matched ? "治所点与参考面相符" : diagnostic.status === "ambiguous" ? "同名资料尚不能唯一对应" : "县级范围尚缺对应证据"}</strong>
    {excludedHomonymsOnly ? <p>史料中的同名记录分属不同建置，已排除相互对应，当前尚无可靠的县面候选。两处位置间距不能解释为迁城；县域范围仍待核。</p> : outside ? <>
      <p>{"boundaryId" in diagnostic ? "圆点是CHGIS记录的县治位置；虚线是Hartwell的741年近似模型。两者有冲突，虚线不能当作已确认的县界。" : "CHGIS县治点位于相关Hartwell近似模型之外。本县范围待核；可打开存疑模型，与治所同屏对照。"}</p>
      {diagnostic.minDistanceKm !== null && <p>治所点在相关模型面外，距其最近边缘约{diagnostic.minDistanceKm.toFixed(1)}千米。这是两套资料的位置差异，不是迁城距离。</p>}
    </> : matched ? <p>点位落在同名或有来源关联的参考面内；这只说明两套资料相符，县界仍是近似模型。</p> : <p>{diagnostic.reason}</p>}
    {onCompare && !excludedHomonymsOnly && <button type="button" className="detail-focus-button" onClick={onCompare}>同屏对照治所与模型</button>}
    {hasResearch ? <HistoricalResearchNotice entries={research} /> : diagnostic.historicalContext && <div className="county-history-context"><p>{diagnostic.historicalContext.summary}</p><details><summary>查看建置史料</summary><blockquote>{diagnostic.historicalContext.quote}</blockquote><a href={diagnostic.historicalContext.sourceUrl} target="_blank" rel="noreferrer">{diagnostic.historicalContext.sourceTitle} ↗</a></details></div>}
    {outside && <details><summary>为什么保留冲突</summary><p>{diagnostic.reason}</p><p>保留两套来源原始几何，待史料核定。没有把治所挪进多边形，也没有用现代县界填补。</p></details>}
  </section>;
}
