import type { TangBoundaryLink } from "../../shared/tang-boundary-crosswalk";

export default function TangJurisdictionInfo({ link, name, loading = false, missingReason, onView }: { link?: TangBoundaryLink; name: string; loading?: boolean; missingReason?: string; onView: (id: string) => void }) {
  return <section className="tang-jurisdiction-info" aria-label="唐代行政层级与辖区">
    <strong>{/郡/.test(name) ? "郡 · 州级行政区" : "州 / 郡辖区参考"}</strong>
    <p className="tang-level-chain">道（监察区） → 府 / 州 / 郡 → 县</p>
    <p>郡比县高一级，下辖县。742年改州为郡，758年复称州；府在这里按同层显示。道是监察分区。</p>
    {loading ? <p>正在核对对应辖区…</p> : link ? <>
      <p>对应{link.boundaryYear}年资料中的“{link.boundaryName}”参考范围，并非755年精确界线。</p>
      <button className="detail-focus-button" onClick={() => onView(link.boundaryId)}>查看{link.boundaryName}完整辖区 · {link.boundaryYear}年参考</button>
      <details><summary>查看对应依据与名称沿革</summary><p>{link.note}</p>
        {link.nameChain && <><ol>{link.nameChain.map(step => <li key={step.sourceRecordId}>{step.beginYear}—{step.endYear}年 · {step.name}</li>)}</ol><p>以上是来源记录的名称存续期，不证明辖区边线在此期间不变。</p></>}
      </details>
    </> : <p>此处尚无可靠的州郡辖区关联。{missingReason ?? "保留地点定位，不用附近多边形猜作辖区。"}</p>}
  </section>;
}
