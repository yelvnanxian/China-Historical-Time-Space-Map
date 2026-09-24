import { useEffect, useId, useRef } from "react";
import { ArrowRight, ChevronDown, Landmark, MapPin, X } from "lucide-react";
import type { CityPeriodProfilesData } from "../../shared/city-profiles";
import type { Period, Place } from "../../shared/types";
import { ContextEvidence } from "./HistoricalContext";
import "../city-period-highlights.css";

type DataProps = { data: CityPeriodProfilesData | null; error: string; onRetry: () => void };

export default function CityPeriodHighlights({ period, places, data, error, onRetry, onSelect }: DataProps & {
  period: Period; places: Place[]; onSelect: (placeId: string) => void;
}) {
  const disclosure = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const titleId = useId();
  const profiles = (data?.profiles ?? []).filter(item => item.periodId === period.id && places.some(place => place.id === item.placeId));
  useEffect(() => { if (disclosure.current) disclosure.current.open = false; }, [period.id]);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!disclosure.current?.contains(event.target as Node) && disclosure.current) disclosure.current.open = false; };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && disclosure.current?.open) { disclosure.current.open = false; summary.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, []);
  return <details ref={disclosure} className="period-city-menu" data-tour="period-cities">
    <summary ref={summary}><Landmark size={14} /><span>本朝名城</span><ChevronDown size={11} /></summary>
    <section className="period-city-panel" aria-labelledby={titleId}>
      <header><div><span>从一座城读懂这个时代</span><h3 id={titleId}>{period.label} · 本朝名城</h3></div><button type="button" aria-label="收起本朝名城" onClick={() => { if (disclosure.current) disclosure.current.open = false; summary.current?.focus(); }}><X size={17} /></button></header>
      <p className="period-city-intro">{profiles.length ? `精选 ${profiles.length} 座有本朝看点的城池，点击定位并查看出处。` : "这里整理各朝代的代表城池看点。"}按朝代整理，不限于地图代表年。</p>
      <div className="period-city-list">
        {error ? <p className="period-city-status" role="status">{error}<button type="button" onClick={onRetry}>重新加载</button></p> : !data ? <p className="period-city-status" role="status">本朝看点加载中…</p> : !profiles.length ? <p className="period-city-status">这个时期的专门看点尚待补充，仍可点击地图中的已收录地点。</p> : profiles.map(profile => {
          const place = places.find(item => item.id === profile.placeId)!;
          return <button type="button" key={profile.id} onClick={() => { if (disclosure.current) disclosure.current.open = false; onSelect(place.id); }}>
            <span className="period-city-name"><strong>{place.nameByPeriod?.[period.id] ?? place.name}</strong><ArrowRight size={14} /></span>
            <span className="period-city-modern"><MapPin size={11} />今参考 · {place.modernName}</span>
            <span className="period-city-summary">{profile.summary}</span>
          </button>;
        })}
      </div>
    </section>
  </details>;
}

export function CityPeriodHighlight({ period, placeId, data, error, onRetry }: DataProps & { period: Period; placeId: string }) {
  const profile = data?.profiles.find(item => item.periodId === period.id && item.placeId === placeId);
  if (!profile && data && !error) return <p className="period-highlight-missing">此城的{period.label}专门看点尚待补充，以下为已收录的概览与沿革。</p>;
  return <section className="period-city-highlight" aria-label="本朝看点">
    <h3><Landmark size={15} />本朝看点<span>{period.label}</span></h3>
    {error ? <p className="period-city-status" role="status">{error}<button type="button" onClick={onRetry}>重新加载</button></p> : !profile || !data ? <p className="period-city-status" role="status">本朝看点加载中…</p> : <>
      <p>{profile.summary}</p>
      <p className="period-highlight-date-note">概览当前时期，不限于地图代表年；具体年代见文字与出处。</p>
      <ContextEvidence evidence={profile.evidence} sources={data.sources} />
    </>}
  </section>;
}
