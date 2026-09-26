import { useEffect, useState } from "react";
import type { SongBoundaryResearchDocument } from "../../shared/song-boundary-research";

/** Reviewed names, administrative levels and chronology; never nearest polygon. */
export default function SongJurisdictionInfo({ placeId, onView }: { placeId: string; onView: (id: string) => void }) {
  const [data, setData] = useState<SongBoundaryResearchDocument>();
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/song-boundary-research.json", { signal: controller.signal })
      .then(response => { if (!response.ok) throw Error(); return response.json(); })
      .then(document => {
        if (document.periodId !== "song" || document.boundaryYear !== 1200 || !document.byBoundary || !Array.isArray(document.unlinkedEntries)) throw Error();
        setData(document);
      })
      .catch(cause => { if (cause.name !== "AbortError") setError("宋代建置关联资料暂时无法加载，请刷新重试。"); });
    return () => controller.abort();
  }, []);
  const links = Object.values(data?.byBoundary ?? {}).filter(record => record.catalogPlaceId === placeId);
  const unresolved = data?.unlinkedEntries.find(record => record.catalogPlaceId === placeId);
  return <section className="ming-jurisdiction-info song-jurisdiction-info" aria-label="宋代同期建置参考范围">
    <h3>相关建置与参考范围</h3>
    {!data ? <p role="status">{error || "建置关联加载中…"}</p> : links.length ? <>
      <p>城市参考点与府州县辖区分开显示。点击下方可高亮1200年来源模型，行政层级仍随缩放切换。</p>
      {links.map(link => <div key={link.boundaryId}>
        <button className="detail-focus-button" type="button" onClick={() => onView(link.boundaryId)}>查看{link.polityLabel} · {link.researchName}参考范围{link.catalogPointComparison.status === "outside" ? "（点面存疑）" : ""}</button>
        <p>{link.yearNotice}</p>
      </div>)}
    </> : <p>{unresolved?.reason || "尚未建立可靠的同名、同层级且年代相符的模型关联，不以最近区域代替本地辖区。"}</p>}
  </section>;
}
