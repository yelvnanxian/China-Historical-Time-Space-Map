import { useEffect, useState } from "react";
import type { MingBoundaryResearchDocument } from "../../shared/ming-boundary-research";

/** A documented administrative association, never point-in-polygon inference. */
export default function MingJurisdictionInfo({ placeId, onView }: { placeId: string; onView: (id: string) => void }) {
  const [data, setData] = useState<MingBoundaryResearchDocument>();
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/ming-boundary-research.json", { signal: controller.signal })
      .then(response => { if (!response.ok) throw Error(); return response.json(); })
      .then(document => {
        if (document.periodId !== "ming" || !document.byBoundary) throw Error();
        setData(document);
      })
      .catch(cause => { if (cause.name !== "AbortError") setError("建置关联资料暂时无法加载，请刷新重试。"); });
    return () => controller.abort();
  }, []);
  const links = Object.values(data?.byBoundary ?? {}).filter(record => record.researchEntryId === `ming-geography-${placeId}`);
  const unresolved = data?.unlinkedEntries.find(record => record.researchEntryId === `ming-geography-${placeId}`);
  return <section className="ming-jurisdiction-info" aria-label="明代相关建置范围">
    <h3>相关建置与参考范围</h3>
    {!data ? <p role="status">{error || "建置关联加载中…"}</p> : links.length ? <>
      <p>可查看史料所述行政单位的来源模型。城市参考点、城墙范围与府县辖区分开理解。</p>
      {links.map(link => <div key={link.boundaryId}><button className="detail-focus-button" type="button" onClick={() => onView(link.boundaryId)}>查看{link.researchName} · 1391年参考范围</button><p>{link.yearNotice}</p></div>)}
    </> : <p>{unresolved?.reason || "尚未建立可靠的同名、同层级模型关联，不以最近区域代替本地辖区。"}</p>}
  </section>;
}
