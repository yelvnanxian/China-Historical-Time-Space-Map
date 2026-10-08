import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Period } from "../../shared/types";
import { formatNavigationYear, nearestYearStop, yearAxisValue, yearFromAxisValue, yearStopKindLabels, type YearStop } from "../../shared/temporal-navigation";
import "../year-navigator.css";

export interface YearNavigatorProps {
  period: Period;
  year: number;
  stops: readonly YearStop[];
  onYearChange: (year: number) => void;
  boundaryYear?: number;
}

export default function YearNavigator({ period, year, stops, onYearChange, boundaryYear }: YearNavigatorProps) {
  const [draftYear, setDraftYear] = useState<number>();
  const dragging = useRef(false);
  const pendingYear = useRef<number | undefined>(undefined);
  useEffect(() => { dragging.current = false; pendingYear.current = undefined; setDraftYear(undefined); }, [year, period.id]);
  const shownYear = draftYear ?? year;
  const available = stops.filter(stop => stop.year >= period.startYear && stop.year <= period.endYear).sort((a, b) => a.year - b.year);
  const previous = [...available].reverse().find(stop => stop.year < year);
  const next = available.find(stop => stop.year > year);
  const active = available.find(stop => stop.year === shownYear);
  const min = yearAxisValue(period.startYear), max = yearAxisValue(period.endYear);
  const kinds = active?.kinds.map(kind => yearStopKindLabels[kind]).join(" · ") ?? "指定年份";
  function commit(nextYear: number | undefined) {
    dragging.current = false; pendingYear.current = undefined; setDraftYear(undefined);
    if (nextYear !== undefined && nextYear !== year) onYearChange(nextYear);
  }
  function chooseNearest(value: number) {
    const stop = nearestYearStop(yearFromAxisValue(value), available);
    if (!stop) return;
    if (dragging.current) { pendingYear.current = stop.year; setDraftYear(stop.year); }
    else commit(stop.year);
  }
  return <section className="year-navigator" aria-label={`${period.label}年份导航`}>
    <div className="year-navigator-current"><strong>{formatNavigationYear(shownYear)}{draftYear !== undefined && <small>松开查看</small>}</strong><span>{kinds}</span></div>
    <div className="year-navigator-track">
      <button type="button" aria-label="上一个资料年" disabled={!previous} title={previous ? `上一个资料年：${formatNavigationYear(previous.year)}` : "已到本期资料起点"} onClick={() => commit(previous?.year)}><ChevronLeft size={16} /></button>
      <div className="year-navigator-range">
        <div className="year-navigator-ticks" aria-hidden="true">{available.map(stop => <span key={stop.year} style={{ left: `${max === min ? 0 : (yearAxisValue(stop.year) - min) / (max - min) * 100}%` }} className={stop.kinds.includes("boundary") ? "has-boundary" : ""} />)}</div>
        <input type="range" min={min} max={max} step={1} value={Math.min(max, Math.max(min, yearAxisValue(shownYear)))} disabled={!available.length || min === max} aria-label={`${period.label}资料年份`} aria-valuetext={`${formatNavigationYear(shownYear)}，${kinds}`} onPointerDown={event => { dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerUp={() => commit(pendingYear.current)} onLostPointerCapture={() => commit(pendingYear.current)} onPointerCancel={() => commit(undefined)} onBlur={() => commit(pendingYear.current)} onChange={event => chooseNearest(Number(event.target.value))} onKeyDown={event => {
          const target = ["ArrowLeft", "ArrowDown"].includes(event.key) ? previous : ["ArrowRight", "ArrowUp"].includes(event.key) ? next : event.key === "Home" ? available[0] : event.key === "End" ? available[available.length - 1] : undefined;
          if (["ArrowLeft", "ArrowDown", "ArrowRight", "ArrowUp", "Home", "End"].includes(event.key)) { event.preventDefault(); commit(target?.year); }
        }} />
        <div className="year-navigator-endpoints"><span>{formatNavigationYear(period.startYear)}</span><span>{formatNavigationYear(period.endYear)}</span></div>
      </div>
      <button type="button" aria-label="下一个资料年" disabled={!next} title={next ? `下一个资料年：${formatNavigationYear(next.year)}` : "已到本期资料终点"} onClick={() => commit(next?.year)}><ChevronRight size={16} /></button>
    </div>
    <div className="year-navigator-tools"><select aria-label="选择资料年份" value={available.some(stop => stop.year === year) ? year : ""} onChange={event => commit(Number(event.target.value))}>
      {!available.some(stop => stop.year === year) && <option value="" disabled>{formatNavigationYear(year)} · 指定年份</option>}
      {available.map(stop => <option key={stop.year} value={stop.year}>{formatNavigationYear(stop.year)} · {stop.kinds.map(kind => yearStopKindLabels[kind]).join(" / ")}</option>)}
    </select><p className="year-navigator-source">{boundaryYear !== undefined ? `边界参考 ${formatNavigationYear(boundaryYear)}${boundaryYear === year ? "" : "（与当前年不同）"}` : "当前无边界截面"}</p></div>
  </section>;
}
