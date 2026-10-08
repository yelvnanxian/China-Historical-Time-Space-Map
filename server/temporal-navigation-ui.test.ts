import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { HistoricalContextData } from "../shared/historical-context";
import type { CityPeriodProfilesData } from "../shared/city-profiles";
import type { YearStop } from "../shared/temporal-navigation";
import { exampleCatalog } from "./fixtures";

// Styles do not participate in these server-rendered interaction assertions.
const css = registerHooks({ load(url, context, next) { return url.endsWith(".css") ? { format: "module", source: "export {};", shortCircuit: true } : next(url, context); } });
const { default: YearNavigator } = await import("../src/components/YearNavigator");
const { CityChronicle } = await import("../src/components/HistoricalContext");
const { default: CityPeriodHighlights, CityPeriodHighlight } = await import("../src/components/CityPeriodHighlights");
css.deregister();

const catalog = exampleCatalog();
test("朝内滑杆显示实际年份跨度并提供精确资料年选项及当前边界年份", () => {
  const stops: YearStop[] = [618, 741, 755, 756, 907].map(year => ({ year, kinds: [year === 741 ? "boundary" : "chronicle"], eventCount: 0, chronicleCount: 1 }));
  const html = renderToStaticMarkup(createElement(YearNavigator, { period: catalog.periods.find(p => p.id === "tang")!, year: 755, stops, boundaryYear: 741, onYearChange: () => {} }));
  assert.match(html, /type="range" min="617" max="906" step="1"/);
  assert.match(html, /value="754"/);
  assert.match(html, /aria-label="上一个资料年"/);
  assert.match(html, /aria-label="下一个资料年"/);
  assert.match(html, /aria-label="选择资料年份"/);
  assert.match(html, /<option value="741">741年 · 边界截面<\/option>/);
  assert.match(html, /边界参考 741年（与当前年不同）/);
  assert.match(html, /城池大事记/);
});

test("已有同期治所时提供带确切年份和数量的探索入口，缺数量时不显示", () => {
  const period = catalog.periods.find(p => p.id === "tang")!;
  const common = { period, year: 755, stops: [], onYearChange: () => {}, onExploreSettlements: () => {} };
  const html = renderToStaticMarkup(createElement(YearNavigator, { ...common, settlementCount: 1681 }));
  assert.match(html, /aria-label="探索755年的1681条同期治所记录"/);
  assert.match(html, /同期治所 1,681 条 · 探索/);
  const missing = renderToStaticMarkup(createElement(YearNavigator, common));
  assert.doesNotMatch(missing, /同期治所 .*探索/);
});

test("时间轴每条大事记提供可点击年份节点，只有精确当前年高亮且保留本期范围", () => {
  const data: HistoricalContextData = { version: "test", generatedAt: "test", notes: [], sources: [], geographyEntries: [], cityTimelines: [{ placeId: "changan", entries: [
    { id: "tang-record", year: 755, title: "唐记录", dateLabel: "755年", summary: "测试", sourceIds: [], evidence: [] },
    { id: "song-record", year: 1127, title: "宋记录", dateLabel: "1127年", summary: "测试", sourceIds: [], evidence: [] },
  ] }] };
  const html = renderToStaticMarkup(createElement(CityChronicle, { placeId: "changan", period: catalog.periods.find(p => p.id === "tang"), data, error: "", activeYear: 1127, onEntrySelect: () => {} }));
  assert.equal((html.match(/class="chronicle-entry"/g) ?? []).length, 2, "历代模式保留跨期的年份按钮");
  assert.match(html, /class="chronicle-entry" aria-pressed="true" aria-label="查看1127年：宋记录"/);
  assert.match(html, /class="chronicle-entry" aria-pressed="false" aria-label="查看755年：唐记录"/);
  assert.match(html, /当前年份/);
  const song = renderToStaticMarkup(createElement(CityChronicle, { placeId: "changan", period: catalog.periods.find(p => p.id === "song"), data, error: "", activeYear: 1127 }));
  assert.equal((song.match(/class="chronicle-entry"/g) ?? []).length, 1);
  assert.doesNotMatch(song, /查看755年/);
  assert.match(song, /历代/);
});

test("宋代名城与详情区分档案1200年和所选1080年，旧politicalContext只在展示层改写", () => {
  const data: CityPeriodProfilesData = { version: "test", sources: [], profiles: [{ id: "song-profile", periodId: "song", placeId: "song-city", summary: "宋代档案", politicalContext: "1200年为当前阅读截面；北宋史事与南宋建置分别标注。", sourceIds: [], evidence: [] }] };
  const original = JSON.stringify(data);
  const period = catalog.periods.find(item => item.id === "song")!;
  const common = { period, currentYear: 1080, data, error: "", onRetry: () => {} };
  const menu = renderToStaticMarkup(createElement(CityPeriodHighlights, { ...common, places: catalog.places, onSelect: () => {} }));
  const detail = renderToStaticMarkup(createElement(CityPeriodHighlight, { ...common, placeId: "song-city" }));
  for (const html of [menu, detail]) {
    assert.match(html, /当前所选年份为1080年/);
    assert.match(html, /档案.*1200年|1200年.*档案/);
    assert.doesNotMatch(html, /以1200年为地图截面|1200年为当前阅读截面/);
  }
  assert.match(detail, /1200年为档案参考年份；北宋史事与南宋建置分别标注。/);
  assert.equal(JSON.stringify(data), original);
  const defaultYear = renderToStaticMarkup(createElement(CityPeriodHighlight, { period, data, error: "", onRetry: () => {}, placeId: "song-city" }));
  assert.match(defaultYear, /当前所选年份为1200年/);
});
