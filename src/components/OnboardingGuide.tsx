import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, CircleHelp, X } from "lucide-react";
import "../onboarding.css";

const storageKey = "shanheji:onboarding:v1";
const steps = [
  { anchor: "period-picker", title: "先选时代，再选资料年份", body: "朝代菜单展示起止年份。下方时间条会吸附到已收录的事件、大事记或资料年份，拖动后松开查看，也可用前后按钮或年份菜单切换。治所按当前年份筛选；边界另标实际参考年，未必与当前年相同。" },
  { anchor: "display-mode", title: "选择要点选的对象", body: "“城池、山川、河流、全部”只筛选名称和可点击对象，底图、山地、河湖仍保留。只想查水系时选“河流”，就不会误点行政区；“全部”可直接点击河线、湖面或山脊，空白处再查行政区。" },
  { anchor: "map-canvas", title: "放大地图，逐级看辖区", body: "层级随缩放从已有国家、省道切换到府州、县域与城池。唐代州郡、宋代府州军监通常在县之上；从城市详情的“参考范围”查看已核查关联。圆点不是辖区，也不是城墙范围。宋代有1080年与1200年两套参考模型，无法可靠关联的城市会说明原因。" },
  { anchor: "map-tools", title: "比较黄河不同时期的流向", body: "打开“地图工具→黄河改道”查看当前选用的河道年代，再用“叠加对比”选择另一时期。蓝色实线是所选河道，棕色虚线用于对比。河道年代和行政边界年份分别标明；历史图集概括时期流向，不表示逐年河岸或真实河宽。" },
  { anchor: "map-tools", title: "查当年治所，沿大事记跳转", body: "府州级治所从6级、县级从8级逐步出现。“地图工具→同期治所”按当前年份筛选，可查古名、今录位置或源编号；未收录不代表当时不存在。城市详情可切换“本朝／本期”和“历代”大事记，点击节点跳到记载年份；边界仍使用已收录的参考截面。" },
  { anchor: "map-canvas", title: "并排比较两年的辖区", body: "地图旁的“边界对比”可任选两套已收录年份，左右地图同步拖动和缩放。城市详情中的“对比此城唐、宋、明辖区”可在三朝间切换，缺少可靠关联时留空。来源年份和近似模型标注始终可见；对比窗口可以收起或关闭。" },
  { anchor: "map-canvas", title: "先看山系区域，再近览山形", body: "淡绿色山纹表示资料中的山地概略分布。点名称或左上的“山系概略分布”可定位秦岭、太行等整片山系；山川模式也能直接点区域。全部模式的区域点击仍查看行政区。“地图工具→山地近览”可定位已收录的等高线窗口，9级起显示。它们都是现代参照，山系概括外沿不是精确山脚界线。" },
  { anchor: "map-tools", title: "查看来源，再理解地图", body: "历史治所、图集黄河线和现代河湖都有各自的资料说明。详情中的“查看原始记录”或来源链接可核查依据；现代水系不能据此认作所选朝代的河道和湖岸，无名地物不会补造名称。地图下方的“历史地图原图”和“历史地理”还能继续阅读。" },
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
        <p id={descriptionId}>{step < 0 ? "认识年份导航、同期治所、城市大事记和边界对比，再探索山川河湖。也可以直接开始，随时从“使用帮助”重看。" : steps[step].body}</p>
        <div className="guide-actions">
          {step > 0 ? <button type="button" className="guide-back" onClick={() => move(step - 1)}><ArrowLeft size={13} />上一步</button> : <button type="button" className="guide-back" onClick={() => close(false)}>先自己看看</button>}
          <button type="button" className="guide-next" onClick={() => step === steps.length - 1 ? close(true) : move(step + 1)}>{step < 0 ? "开始导览" : step === steps.length - 1 ? "开始探索" : "下一步"}<ArrowRight size={14} /></button>
        </div>
      </section>
    </>, document.body)}
  </>;
}
