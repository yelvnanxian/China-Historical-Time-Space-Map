import { simplifiedChinese } from "../../shared/boundary-search";
import type { HistoricalResearchEntry } from "../../shared/historical-research";

const topicNames: Record<string, string> = {
  identity: "地名辨析",
  administration: "行政隶属",
  establishment: "建置沿革",
  seat: "治所位置",
  chronology: "年代核对",
  geography: "地理位置",
  event: "历史事件",
};

const correspondenceNames: Record<string, string> = {
  "same-unit": "史料支持同一建置",
  "different-unit": "异地同名 · 已排除对应",
  "documented": "文献记载已核对",
  "documented-description": "文献记载已核对",
  unresolved: "对应关系仍待核",
};

function topicName(topic: string) {
  return topicNames[topic] ?? topic;
}

function correspondenceName(correspondence: string) {
  return correspondenceNames[correspondence] ?? correspondence;
}

/**
 * Shared evidence card for dynasty-specific research.
 *
 * It is kept independent from county geometry so Ming records can present
 * the same source/quote treatment even when they do not have a Tang model
 * diagnostic or a county polygon.
 */
export default function HistoricalResearchNotice({
  entries,
  limitNote = "史实已补充，参考范围仍待核定；不据此改画县界。",
  label = "县级史料研究",
}: {
  entries: HistoricalResearchEntry[];
  limitNote?: string;
  label?: string;
}) {
  if (!entries.length) return null;
  return <div className="county-historical-research" aria-label={label}>
    <span className="county-research-badge">已核对史料</span>
    {entries.map(entry => <article className="county-research-entry" key={entry.id}>
      <h4>{simplifiedChinese(entry.title)}</h4>
      <span className={`county-research-correspondence is-${entry.correspondence}`}>{correspondenceName(entry.correspondence)}</span>
      {!entry.findings.some(finding => finding.statement === entry.summary) && <p>{simplifiedChinese(entry.summary)}</p>}
      {entry.findings.length > 0 && <div className="county-research-findings">
        <h5>已核对事实</h5>
        <ul>{entry.findings.map((finding, index) => <li key={`${finding.topic}-${index}`}><span>{topicName(finding.topic)}</span>{simplifiedChinese(finding.statement)}</li>)}</ul>
      </div>}
      {entry.unresolved.length > 0 && <div className="county-research-unresolved"><h5>仍待考证</h5><ul>{entry.unresolved.map((question, index) => <li key={index}>{simplifiedChinese(question)}</li>)}</ul></div>}
      {entry.findings.some(finding => finding.evidence.length > 0) && <details className="county-research-evidence">
        <summary>查看逐字引文与来源</summary>
        <p className="county-research-original-note">引文保留原文，按所列篇卷与版本核查。</p>
        {entry.findings.filter(finding => finding.evidence.length > 0).map((finding, findingIndex) => <div className="county-research-evidence-topic" key={`${finding.topic}-${findingIndex}`}>
          <h5>{topicName(finding.topic)}</h5>
          {finding.evidence.map((evidence, evidenceIndex) => <figure key={`${evidence.sourceId}-${evidenceIndex}`}>
            <blockquote>{evidence.quote}</blockquote>
            <figcaption><a href={evidence.sourceUrl} target="_blank" rel="noreferrer">{evidence.sourceTitle} ↗</a><span>{evidence.locator}</span></figcaption>
          </figure>)}
        </div>)}
      </details>}
    </article>)}
    <p className="county-research-limit">{limitNote}</p>
  </div>;
}
