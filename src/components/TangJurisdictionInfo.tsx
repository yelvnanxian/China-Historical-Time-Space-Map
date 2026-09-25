import type { TangBoundaryLink } from "../../shared/tang-boundary-crosswalk";

export default function TangJurisdictionInfo({ link, name, loading = false, onView }: { link?: TangBoundaryLink; name: string; loading?: boolean; onView: (id: string) => void }) {
  return <section className="tang-jurisdiction-info" aria-label="唐代行政层级与辖区">
    <strong>{/郡/.test(name) ? "郡 · 州级行政区" : "州 / 郡辖区参考"}</strong>
    <p>天宝元年（742年）改州为郡，乾元元年（758年）复称州。唐755年图中的郡与州属于同一层级；府也归在这一层显示。</p>
    {loading ? <p>正在核对对应辖区…</p> : link ? <>
      <p>{link.note}</p><button className="detail-focus-button" onClick={() => onView(link.boundaryId)}>查看{link.boundaryName}辖区 · {link.boundaryYear}年参考</button>
    </> : <p>此处尚无可靠的州郡辖区关联；保留地点定位，不用附近多边形猜作辖区。</p>}
  </section>;
}
