import { BookOpen, CheckCircle2, Clock3, ExternalLink } from "lucide-react";
import type { Evidence, Source } from "../../shared/types";

export default function EvidencePanel({
  evidence,
  sources,
  expanded = false,
}: {
  evidence: Evidence[];
  sources: Source[];
  expanded?: boolean;
}) {
  if (!evidence.length) return null;
  return (
    <section className="evidence-panel" aria-label="事实依据">
      <h3>
        <BookOpen size={15} />
        事实依据<span>{evidence.length} 条</span>
      </h3>
      <p className="evidence-intro">
        核对状态针对下述具体事实，不代表整条记录已被全面考证。
      </p>
      {evidence.map((item, index) => {
        const source = sources.find(
          (candidate) => candidate.id === item.sourceId,
        );
        return (
          <details
            className={`evidence-card ${item.status}`}
            key={item.id}
            open={expanded || index === 0}
          >
            <summary>
              <span className="evidence-status">
                {item.status === "checked" ? (
                  <CheckCircle2 size={12} />
                ) : (
                  <Clock3 size={12} />
                )}{" "}
                {item.status === "checked" ? "已核对原文" : "待核验"}
              </span>
              <strong>{item.supports}</strong>
              <span className="evidence-expand">展开 / 收起</span>
            </summary>
            <div className="evidence-body">
              {item.quote && <blockquote>“{item.quote}”</blockquote>}
              <p className="evidence-locator">
                {source?.title || "参考史料"} · {item.locator}
              </p>
              {item.note && <p className="evidence-note">{item.note}</p>}
              <div className="evidence-bottom">
                <span>
                  {item.status === "checked" && item.checkedAt
                    ? `核查于 ${item.checkedAt}`
                    : "尚待逐条原文核查"}
                </span>
                {source?.url && (
                  <a href={source.url} target="_blank" rel="noreferrer">
                    查看原文
                    <ExternalLink size={11} />
                  </a>
                )}
              </div>
            </div>
          </details>
        );
      })}
    </section>
  );
}
