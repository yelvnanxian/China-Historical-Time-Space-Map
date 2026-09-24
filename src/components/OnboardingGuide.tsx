import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, CircleHelp, X } from "lucide-react";
import "../onboarding.css";

const storageKey = "shanheji:onboarding:v1";
const steps = [
  { anchor: "period-picker", title: "先选一个时代", body: "朝代菜单展示代表年份。地图收录的是精选地点；行政边界的资料年份另有标注，未必与代表年相同。" },
  { anchor: "display-mode", title: "决定这次看什么", body: "“城池”看历史地点与行政区；“山川河流”看现代自然地理；“同时显示”把两者放在同一张地图里。" },
  { anchor: "map-canvas", title: "名称与区域，各有用途", body: "点城池名称打开档案，点山川名称高亮该对象。同时显示时，点其他区域只查看历史行政区；未收录边界的地方不会代画。" },
  { anchor: "map-tools", title: "继续查找，也回看出处", body: "地图工具里可查山川、查行政区和切换立体。“本朝名城”整理当期看点；地图下方的原图与历史地理提供更多资料。" },
];
type Box = { left: number; top: number; width: number; height: number };

export default function OnboardingGuide() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(-1);
  const [anchor, setAnchor] = useState<Box | null>(null);
  const [position, setPosition] = useState({ left: 12, top: 12 });
  const launch = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusRequested = useRef(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    try { if (!window.localStorage.getItem(storageKey)) setOpen(true); }
    catch { setOpen(true); }
  }, []);

  function close(completed: boolean) {
    try { window.localStorage.setItem(storageKey, completed ? "completed" : "skipped"); } catch { /* Storage is optional. */ }
    setOpen(false);
    setAnchor(null);
    launch.current?.focus({ preventScroll: true });
  }

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: KeyboardEvent) => { if (event.key === "Escape") close(false); };
    document.addEventListener("keydown", dismiss);
    return () => document.removeEventListener("keydown", dismiss);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const target = step >= 0 ? document.querySelector<HTMLElement>(`[data-tour="${steps[step].anchor}"]`) : null;
    if (target) target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
    let frame = 0;
    const place = () => {
      const visual = window.visualViewport;
      const viewportLeft = visual?.offsetLeft ?? 0;
      const viewportTop = visual?.offsetTop ?? 0;
      const viewportWidth = visual?.width ?? window.innerWidth;
      const viewportHeight = visual?.height ?? window.innerHeight;
      const width = Math.min(350, viewportWidth - 24);
      const height = card.current?.getBoundingClientRect().height ?? 215;
      const minLeft = viewportLeft + 12, maxLeft = Math.max(minLeft, viewportLeft + viewportWidth - width - 12);
      const minTop = viewportTop + 12, maxTop = Math.max(minTop, viewportTop + viewportHeight - height - 12);
      const rect = target?.getBoundingClientRect();
      let left = maxLeft, top = maxTop;
      if (rect && rect.width && rect.height) {
        const clipped = { left: Math.max(viewportLeft + 4, rect.left - 4), top: Math.max(viewportTop + 4, rect.top - 4), width: 0, height: 0 };
        clipped.width = Math.max(0, Math.min(viewportLeft + viewportWidth - 4, rect.right + 4) - clipped.left);
        clipped.height = Math.max(0, Math.min(viewportTop + viewportHeight - 4, rect.bottom + 4) - clipped.top);
        setAnchor(clipped.width && clipped.height ? clipped : null);
        left = Math.max(minLeft, Math.min(maxLeft, rect.left));
        if (rect.bottom + 12 + height <= viewportTop + viewportHeight - 12) top = rect.bottom + 12;
        else if (rect.top - height - 12 >= minTop) top = rect.top - height - 12;
        else top = maxTop;
      } else setAnchor(null);
      setPosition({ left, top: Math.max(minTop, Math.min(maxTop, top)) });
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(place); };
    place();
    const observer = new ResizeObserver(schedule);
    if (target) observer.observe(target);
    if (card.current) observer.observe(card.current);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    if (focusRequested.current) { heading.current?.focus({ preventScroll: true }); focusRequested.current = false; }
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, [open, step]);

  function move(next: number) { focusRequested.current = true; setStep(next); }

  return <>
    <button ref={launch} type="button" className="guide-launch" aria-label="重看使用引导" title="使用帮助" onClick={() => {
      if (open && step === 0) heading.current?.focus({ preventScroll: true });
      else { focusRequested.current = true; setStep(0); setOpen(true); }
    }}>
      <CircleHelp size={17} /><span>使用帮助</span>
    </button>
    {open && createPortal(<>
      {anchor && <div className="guide-anchor" style={anchor} aria-hidden="true" />}
      <section ref={card} className="guide-card" style={position} role="dialog" aria-modal="false" aria-labelledby={titleId} aria-describedby={descriptionId}>
        <div className="guide-caption"><span>{step < 0 ? "第一次来到山河纪" : `使用引导 · ${step + 1} / ${steps.length}`}</span><button type="button" aria-label="跳过使用引导" onClick={() => close(false)}><X size={17} /></button></div>
        <h2 ref={heading} id={titleId} tabIndex={-1}>{step < 0 ? "从一个时代，走近一座城" : steps[step].title}</h2>
        <p id={descriptionId}>{step < 0 ? "用四步认识朝代、城池和山川。也可以直接开始，随时从“使用帮助”重看。" : steps[step].body}</p>
        <div className="guide-actions">
          {step > 0 ? <button type="button" className="guide-back" onClick={() => move(step - 1)}><ArrowLeft size={13} />上一步</button> : <button type="button" className="guide-back" onClick={() => close(false)}>先自己看看</button>}
          <button type="button" className="guide-next" onClick={() => step === steps.length - 1 ? close(true) : move(step + 1)}>{step < 0 ? "开始导览" : step === steps.length - 1 ? "开始探索" : "下一步"}<ArrowRight size={14} /></button>
        </div>
      </section>
    </>, document.body)}
  </>;
}
