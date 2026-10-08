import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { isHistoricalSitesData, siteIsVisible, sitesForPeriod, type HistoricalSitesData } from "../shared/historical-sites";
import { placeTypeLabel } from "../shared/place-types";

const root = fileURLToPath(new URL("../", import.meta.url));
const data: HistoricalSitesData = JSON.parse(await readFile(path.join(root, "public/data/historical-sites.json"), "utf8"));
const catalogue = JSON.parse(await readFile(path.join(root, "data/catalog.json"), "utf8"));

test("史迹地点逐值保留来源坐标与逐字摘录，文件哈希可核验", async () => {
  assert.ok(isHistoricalSitesData(data));
  const periods = new Set(catalogue.periods.map((period: { id: string }) => period.id));
  const pages = new Map<string, { coordinates: { lon: number; lat: number }[]; extract: string; revisions: { revid: number }[] }>();
  for (const source of data.sources) {
    const bytes = await readFile(path.join(root, source.snapshotPath));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), source.snapshotSha256);
    const page = Object.values(JSON.parse(bytes.toString()).query.pages).find((item: any) => item.pageid === source.pageId) as any;
    assert.equal(page.revisions[0].revid, source.revisionId);
    assert.match(source.url, new RegExp(`oldid=${source.revisionId}$`));
    pages.set(source.id, page);
  }
  for (const site of data.sites) {
    assert.ok(site.periodIds.every(period => periods.has(period)), site.id);
    const point = pages.get(site.coordinateSourceId)!.coordinates[0];
    assert.deepEqual(site.coordinates, [point.lon, point.lat], `${site.id} 不得用目录城市中心替代具体遗址点`);
    assert.ok(!catalogue.places.some((place: { coordinates: number[] }) => place.coordinates.every((value, index) => value === site.coordinates[index])), site.id);
    for (const evidence of site.evidence) assert.ok(pages.get(evidence.sourceId)!.extract.includes(evidence.quote), `${site.id}: ${evidence.quote}`);
  }
});

test("可确年史迹不提前出现，无确年史迹保留参考性质", () => {
  assert.ok(!sitesForPeriod(data.sites, "han", 2).some(site => site.id === "white-horse-temple"));
  assert.ok(sitesForPeriod(data.sites, "han", 68).some(site => site.id === "white-horse-temple"));
  assert.ok(!sitesForPeriod(data.sites, "jin", 280).some(site => site.id === "mogao-caves"));
  assert.ok(sitesForPeriod(data.sites, "jin", 366).some(site => site.id === "mogao-caves"));
  assert.ok(!sitesForPeriod(data.sites, "han", 2).some(site => site.id === "red-cliffs"));
  assert.ok(sitesForPeriod(data.sites, "han", 208).some(site => site.id === "red-cliffs"));
  assert.ok(sitesForPeriod(data.sites, "sui", 609).some(site => site.id === "zhaozhou-bridge"));
  assert.ok(!sitesForPeriod(data.sites, "tang", 618).some(site => site.id === "daming-palace"));
  assert.equal(data.sites.find(site => site.id === "jiming-post")?.beginYear, undefined);
  assert.equal(data.sites.find(site => site.id === "red-cliffs")?.accuracy, "disputed-location");
  assert.ok(!sitesForPeriod(data.sites, "tang", 755).some(site => site.id === "yumen-pass"), "不能把汉玉门关坐标沿用于唐代迁址之后");
});

test("史迹七种类型有可核对实体，渡口保留资料缺口", () => {
  const categories = new Set(data.sites.map(site => site.type));
  assert.deepEqual([...categories].sort(), ["battlefield", "pass", "port", "post", "site", "temple", "tomb"]);
  for (const type of categories) assert.ok(placeTypeLabel(type));
  assert.ok(data.gaps.some(gap => gap.type === "ferry" && /坐标/.test(gap.note)));
  const site = data.sites[0];
  assert.equal(siteIsVisible(site, site.minZoom - 0.1), false);
  assert.equal(siteIsVisible(site, site.minZoom), true);
  assert.equal(siteIsVisible(site, 2, site.id), true, "主动定位地点时可突破自动显示阈值");
});

test("拒绝损坏坐标、悬空引用与未知类型，避免加载后崩溃", () => {
  const broken = structuredClone(data); broken.sites[0].coordinates[0] = 181;
  assert.equal(isHistoricalSitesData(broken), false);
  const dangling = structuredClone(data); dangling.sites[0].coordinateSourceId = "missing";
  assert.equal(isHistoricalSitesData(dangling), false);
  const type = structuredClone(data); Object.assign(type.sites[0], { type: "fake-category" });
  assert.equal(isHistoricalSitesData(type), false);
  assert.equal(isHistoricalSitesData({ sites: [], sources: [] }), false);
  assert.equal(isHistoricalSitesData({ ...data, sites: [null] }), false);
  assert.equal(isHistoricalSitesData({ ...data, sources: [null] }), false);
});
