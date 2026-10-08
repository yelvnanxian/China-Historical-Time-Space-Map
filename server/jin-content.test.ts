import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { simplifiedChinese } from "../shared/boundary-search";
import type { CityPeriodProfilesData } from "../shared/city-profiles";
import type { HistoricalContextData } from "../shared/historical-context";

const root = fileURLToPath(new URL("../", import.meta.url));
const importBuilder = String.raw`
import importlib.util,json
from pathlib import Path
root=Path.cwd()
spec=importlib.util.spec_from_file_location('jin_content',root/'scripts/build-jin-content.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
pack=module.build_pack()
`;
const pack: {
  profiles: CityPeriodProfilesData["profiles"];
  sources: CityPeriodProfilesData["sources"];
  cityTimelines: HistoricalContextData["cityTimelines"];
  excludedCandidates: { placeId: string; candidate: string; reason: string }[];
} = JSON.parse(execFileSync("python3", ["-c", importBuilder + "\nprint(json.dumps(pack,ensure_ascii=False))"], { cwd: root, encoding: "utf8" }));
const expectedPlaces = ["changan", "luoyang", "beijing", "kaifeng", "hangzhou", "guangzhou", "yangzhou", "xiangyang", "jinyang", "datong", "linzi", "handan", "tongguan", "dunhuang"];
const byPlace = new Map(pack.profiles.map(profile => [profile.placeId, profile]));
const entries = pack.cityTimelines.flatMap(city => city.entries.map(entry => ({ ...entry, placeId: city.placeId })));
const byId = new Map(entries.map(entry => [entry.id, entry]));

test("两晋补十四处档案，分开县目、现代地区及同期其他政权", () => {
  assert.deepEqual([...byPlace.keys()].sort(), [...expectedPlaces].sort());
  for (const profile of pack.profiles) {
    for (const text of [profile.summary, profile.namingNote, profile.politicalContext]) {
      assert.ok(text);
      assert.equal(text, simplifiedChinese(text), profile.id);
    }
    assert.match(profile.politicalContext!, /不表示全部事实发生于默认280年/);
    assert.match(profile.politicalContext!, /不表示本点在266—420年始终由晋直接管辖/);
    assert.match(profile.politicalContext!, /不核定古城址、关址或辖界/);
    assert.ok(!("coordinates" in profile) && !("geometry" in profile));
  }
  assert.match(byPlace.get("datong")!.summary, /398年北魏迁都/);
  assert.match(byPlace.get("datong")!.namingNote!, /不确认两者古址完全相同/);
  assert.match(byPlace.get("handan")!.summary, /邯郸列在广平郡.*邺列在魏郡/);
  assert.match(byPlace.get("dunhuang")!.summary, /不表示整个时期都由晋廷直接控制/);
  assert.match(byPlace.get("linzi")!.summary, /脱漏、错接/);
  assert.match(byPlace.get("tongguan")!.summary, /刘裕在东晋时北伐后秦/);
});

test("两晋十三节点保留事件阶段，不重复旧羊祜、北魏平城、西凉节点", () => {
  assert.equal(entries.length, 13);
  assert.deepEqual(entries.map(item => item.year).sort((a, b) => a - b), [282, 306, 311, 313, 313, 316, 317, 318, 347, 378, 379, 417, 417]);
  for (const entry of entries) {
    assert.ok(entry.id.startsWith("jin-timeline-"));
    assert.ok(entry.year >= 266 && entry.year < 420);
    for (const text of [entry.title, entry.summary, entry.dateLabel]) assert.equal(text, simplifiedChinese(text));
  }
  const king = byId.get("jin-timeline-nanjing-jin-king-317")!;
  assert.equal(king.relatedEventId, "eastern-jin");
  assert.match(king.summary, /此时尚未称帝/);
  assert.match(byId.get("jin-timeline-nanjing-emperor-318")!.title, /称帝/);
  assert.match(byId.get("jin-timeline-nanjing-jianye-282")!.summary, /默认280年仍显示建业/);
  assert.match(byId.get("jin-timeline-chengdu-li-xiong-306")!.summary, /不能因节点归在两晋时间段就说成都在306年仍由晋直接管辖/);
  assert.match(byId.get("jin-timeline-xiangyang-attack-378")!.summary, /避免把378年的攻势提前写成襄阳已经陷落/);
  assert.match(byId.get("jin-timeline-xiangyang-fall-379")!.summary, /次年关系换算/);
  assert.ok(!entries.some(entry => [269, 304, 366, 398, 400].includes(entry.year)));
  assert.ok(pack.excludedCandidates.some(item => item.placeId === "beijing"));
});

test("东晋义熙十三年节点同时提供年号锚点和同节原文，不误称攻陷潼关", () => {
  for (const id of ["jin-timeline-tongguan-tan-daoji-417", "jin-timeline-changan-wang-zhen-e-417"]) {
    const entry = byId.get(id)!;
    assert.equal(entry.year, 417);
    assert.ok(entry.evidence.some(item => item.quote === "==義熙十三年=="));
    assert.ok(entry.evidence.some(item => item.quote.includes("405年") && item.supports.includes("405+12")));
    assert.ok(entry.evidence.some(item => item.quote.includes("檀道濟等次潼關") && item.quote.includes("王鎮惡剋長安")));
  }
  const tongguan = byId.get("jin-timeline-tongguan-tan-daoji-417")!;
  assert.match(tongguan.summary, /不等同于当天攻陷关城/);
  assert.match(tongguan.summary, /不将旧历二月直接换为公历二月/);
});

test("两晋全部引文、固定修订及原API快照一致，古籍转换保留校勘", async () => {
  const snapshots = new Map<string, string>();
  for (const source of pack.sources) {
    const text = await readFile(path.join(root, source.snapshotPath), "utf8");
    assert.equal(createHash("sha256").update(text).digest("hex"), source.snapshotSha256);
    assert.match(new URL(source.url).searchParams.get("oldid") ?? "", /^\d+$/);
    snapshots.set(source.id, text);
  }
  for (const entry of [...pack.profiles, ...entries]) {
    for (const item of entry.evidence) {
      assert.ok(snapshots.get(item.sourceId)?.includes(item.quote), entry.id);
      assert.ok(!item.quote.includes("{{"), entry.id);
    }
  }
  for (const key of ["jin-geography-014", "jin-geography-015", "jin-songshu-wudi", "jin-yongjia", "jin-min-emperor", "jin-yuan-emperor", "jin-yixi"]) {
    const metadata = JSON.parse(await readFile(path.join(root, `data/evidence/historical-context/${key}.json`), "utf8"));
    const raw = await readFile(path.join(root, metadata.apiSnapshotPath), "utf8");
    assert.equal(createHash("sha256").update(raw).digest("hex"), metadata.apiSnapshotSha256);
    const page = JSON.parse(raw).query.pages[0];
    assert.equal(page.revisions[0].revid, metadata.revision.revid);
    const transcription = key.startsWith("jin-geography-") || key === "jin-songshu-wudi";
    let expected = transcription ? page.revisions[0].slots.main.content : page.extract;
    if (transcription) {
      expected = expected.replaceAll("'''", "")
        .replace(/\{\{YL\|([^{}|]+)\|([^{}|]+)\}\}/g, "$1（$2）")
        .replace(/\{\{YL\|([^{}|]+)\}\}/g, "$1")
        .replace(/\[\[([^\[\]|]+)\|([^\[\]]+)\]\]/g, "$2")
        .replace(/\[\[([^\[\]]+)\]\]/g, "$1")
        .replace(/<ref[^>]*>([\s\S]*?)<\/ref>/g, "（校勘：$1）")
        .replace(/\{\{\*\|([\s\S]*?)\}\}/g, "（$1）")
        .replaceAll("-{乾}-", "乾");
      assert.equal(new URL(metadata.url).hostname, "zh.wikisource.org");
      assert.match(metadata.note, /未与刻本或点校本逐字校勘/);
      assert.match(expected, /校勘：/);
    }
    assert.equal(snapshots.get(metadata.id), expected);
  }
});

test("两晋批次幂等且全部十七入口有档，完整保留旧档案、事件与地理", () => {
  const result = execFileSync("python3", ["-c", importBuilder + String.raw`
profiles=module.read(root/'public/data/city-period-profiles.json')
context=module.read(root/'public/data/historical-context.json')
before_profiles={x['id']:x for x in profiles['profiles']}
before_entries={x['id']:x for c in context['cityTimelines'] for x in c['entries']}
new_profile_ids={x['id'] for x in pack['profiles']}
new_entry_ids={x['id'] for c in pack['cityTimelines'] for x in c['entries']}
merged_profiles,merged_context=module.merge_content(profiles,context,pack)
assert (merged_profiles,merged_context)==module.merge_content(merged_profiles,merged_context,pack)
assert profiles==module.read(root/'public/data/city-period-profiles.json')
assert context==module.read(root/'public/data/historical-context.json')
after_profiles={x['id']:x for x in merged_profiles['profiles']}
after_entries={x['id']:x for c in merged_context['cityTimelines'] for x in c['entries']}
for key,item in before_profiles.items():
 if key not in new_profile_ids: assert after_profiles[key]==item,key
for key,item in before_entries.items():
 if key not in new_entry_ids: assert after_entries[key]==item,key
assert context['geographyEntries']==merged_context['geographyEntries']
catalog=module.read(root/'data/catalog.json')
expected={x['id'] for x in catalog['places'] if 'jin' in x['periodIds']}
actual={x['placeId'] for x in merged_profiles['profiles'] if x['periodId']=='jin'}
assert expected==actual
print(json.dumps({'profiles':len(pack['profiles']),'entries':len(new_entry_ids),'sources':len(pack['sources']),'jinCoverage':len(actual)}))
`], { cwd: root, encoding: "utf8" });
  assert.deepEqual(JSON.parse(result), { profiles: 14, entries: 13, sources: 13, jinCoverage: 17 });
});
