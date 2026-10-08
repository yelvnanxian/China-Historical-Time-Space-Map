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
spec=importlib.util.spec_from_file_location('han_content',root/'scripts/build-han-content.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
pack=module.build_pack()
`;
const pack: {
  profiles: CityPeriodProfilesData["profiles"];
  sources: CityPeriodProfilesData["sources"];
  cityTimelines: HistoricalContextData["cityTimelines"];
  excludedCandidates: { placeId: string; candidate: string; reason: string }[];
} = JSON.parse(execFileSync("python3", ["-c", importBuilder + "\nprint(json.dumps(pack,ensure_ascii=False))"], { cwd: root, encoding: "utf8" }));
const expectedPlaces = ["luoyang", "beijing", "kaifeng", "nanjing", "hangzhou", "guangzhou", "yangzhou", "xiangyang", "jingzhou", "jinyang", "datong", "linzi", "handan"];
const byPlace = new Map(pack.profiles.map(profile => [profile.placeId, profile]));
const entries = pack.cityTimelines.flatMap(city => city.entries.map(entry => ({ ...entry, placeId: city.placeId })));

test("汉朝第二批补齐十三处目录缺档，并将两汉概览与公元2年截面区分", () => {
  assert.deepEqual([...byPlace.keys()].sort(), [...expectedPlaces].sort());
  for (const profile of pack.profiles) {
    for (const text of [profile.summary, profile.namingNote, profile.politicalContext]) {
      assert.ok(text);
      assert.equal(text, simplifiedChinese(text), profile.id);
    }
    assert.match(profile.politicalContext!, /不表示全部事实发生于默认公元2年/);
    assert.match(profile.politicalContext!, /转录未与点校本校勘/);
    assert.match(profile.politicalContext!, /不核定古城址或辖界/);
    assert.ok(profile.evidence.some(item => item.sourceId === "context-han-geography"));
    assert.ok(!("coordinates" in profile) && !("geometry" in profile));
  }
  assert.match(byPlace.get("kaifeng")!.summary, /浚仪与开封是两个县名/);
  assert.match(byPlace.get("kaifeng")!.summary, /浚仪列在陈留郡，将开封列在河南郡/);
  assert.match(byPlace.get("yangzhou")!.summary, /广陵与江都.*并非同一个县/);
  assert.match(byPlace.get("guangzhou")!.summary, /直到前111年/);
  assert.match(byPlace.get("jinyang")!.summary, /随后又获准移都马邑/);
});

test("汉朝新增纪年保留公元前后之别、营建区间与汉末建业的政治阶段", () => {
  assert.equal(entries.length, 8);
  const byId = new Map(entries.map(item => [item.id, item]));
  assert.deepEqual(entries.map(item => item.year).sort((a, b) => a - b), [-201, -200, -111, 60, 96, 190, 211, 212]);
  for (const entry of entries) {
    assert.ok(entry.id.startsWith("han-expansion-"));
    assert.ok(entry.year >= -202 && entry.year < 220 && entry.year !== 0);
    for (const text of [entry.title, entry.summary, entry.dateLabel]) assert.equal(text, simplifiedChinese(text));
  }
  const northPalace = byId.get("han-expansion-luoyang-north-palace-60")!;
  assert.equal(northPalace.year, 60);
  assert.match(northPalace.summary, /自60年至65年/);
  assert.match(northPalace.summary, /不能据此断言北宫当年已经全部落成/);
  const moling = byId.get("han-expansion-nanjing-moling-211")!;
  assert.match(moling.summary, /尚未到229年称帝建立东吴/);
  assert.match(moling.summary, /不据同一句叙述给石头城营建强行系于211年/);
  const jianye = byId.get("han-expansion-nanjing-jianye-212")!;
  assert.equal(jianye.year, 212);
  assert.match(jianye.summary, /东汉末/);
  assert.match(jianye.evidence[0].quote, /211年.*次年改秣陵为建业/);
  assert.match(byId.get("han-expansion-jinyang-hanwangxin-201")!.summary, /不是淮阴侯韩信/);
  assert.match(byId.get("han-expansion-datong-baideng-200")!.summary, /不将该点认作白登山战场的实测坐标/);
  const guangyang = byId.get("han-expansion-beijing-guangyang-96")!;
  assert.equal(guangyang.title, "广阳郡恢复建置");
  assert.match(guangyang.summary, /永平八年校为永元八年/);
  assert.match(guangyang.summary, /不据复郡记载推定郡治位置/);
  assert.ok(guangyang.evidence.some(item => item.sourceId === "context-han-guangyang-textual-note" && item.quote.includes("據和帝紀")));
  assert.ok(!entries.some(item => item.year === 25 || item.year === 26 || item.year === -105));
  assert.ok(pack.excludedCandidates.some(item => item.placeId === "luoyang" && item.reason.includes("冲突")));
});

test("汉代新引文逐字存在固定修订快照，新快照与保存的API原文一致", async () => {
  const snapshots = new Map<string, string>();
  for (const source of pack.sources) {
    const text = await readFile(path.join(root, source.snapshotPath), "utf8");
    assert.equal(createHash("sha256").update(text).digest("hex"), source.snapshotSha256);
    const url = new URL(source.url);
    assert.equal(url.protocol, "https:");
    assert.match(url.searchParams.get("oldid") ?? "", /^\d+$/);
    snapshots.set(source.id, text);
  }
  for (const entry of [...pack.profiles, ...entries]) {
    for (const item of entry.evidence) assert.ok(snapshots.get(item.sourceId)?.includes(item.quote), entry.id);
  }
  for (const key of ["han-geography", "han-baideng", "han-luoyang-site", "han-guangyang-textual-note"]) {
    const metadata = JSON.parse(await readFile(path.join(root, `data/evidence/historical-context/${key}.json`), "utf8"));
    const raw = await readFile(path.join(root, metadata.apiSnapshotPath), "utf8");
    assert.equal(createHash("sha256").update(raw).digest("hex"), metadata.apiSnapshotSha256);
    const page = JSON.parse(raw).query.pages[0];
    assert.equal(page.revisions[0].revid, metadata.revision.revid);
    const isTranscription = key === "han-geography" || key === "han-guangyang-textual-note";
    const expected = isTranscription ? page.revisions[0].slots.main.content.replaceAll("'''", "") : page.extract;
    assert.equal(snapshots.get(metadata.id), expected);
    if (isTranscription) {
      assert.equal(new URL(metadata.url).hostname, "zh.wikisource.org");
      assert.match(metadata.note, /未与刻本或点校本逐字校勘/);
      assert.match(metadata.note, /不把郡国户口当作城市人口/);
    }
  }
});

test("汉代批次重复合并幂等，全部十六处当期目录有档案且不改既有节点和地理", () => {
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
expected={x['id'] for x in catalog['places'] if 'han' in x['periodIds']}
actual={x['placeId'] for x in merged_profiles['profiles'] if x['periodId']=='han'}
assert expected==actual
print(json.dumps({'profiles':len(pack['profiles']),'entries':len(new_entry_ids),'sources':len(pack['sources']),'hanCoverage':len(actual)}))
`], { cwd: root, encoding: "utf8" });
  assert.deepEqual(JSON.parse(result), { profiles: 13, entries: 8, sources: 9, hanCoverage: 16 });
});
