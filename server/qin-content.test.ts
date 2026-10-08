import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { simplifiedChinese } from "../shared/boundary-search";
import type { CityPeriodProfile, CityPeriodProfilesData } from "../shared/city-profiles";
import type { CityTimeline, HistoricalContextData, HistoricalContextSource } from "../shared/historical-context";

const root = fileURLToPath(new URL("../", import.meta.url));
const profiles: CityPeriodProfilesData = JSON.parse(await readFile(path.join(root, "public/data/city-period-profiles.json"), "utf8"));
const context: HistoricalContextData = JSON.parse(await readFile(path.join(root, "public/data/historical-context.json"), "utf8"));
const expectedPlaces = ["luoyang", "chengdu", "jingzhou", "jinyang", "handan"];
const pack: {
  profiles: CityPeriodProfile[];
  sources: HistoricalContextSource[];
  cityTimelines: CityTimeline[];
  excludedCandidates: { placeId: string; topic: string; reason: string }[];
} = JSON.parse(execFileSync("python3", ["-c", String.raw`
import importlib.util,json
from pathlib import Path
spec=importlib.util.spec_from_file_location('qin_content',Path.cwd()/'scripts/build-qin-content.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
print(json.dumps(module.build_pack(),ensure_ascii=False))
`], { cwd: root, encoding: "utf8" }));

test("秦朝补充覆盖目录中原有八城，保留先秦背景与古今位置的限制", () => {
  const qin = profiles.profiles.filter(item => item.periodId === "qin");
  assert.deepEqual(qin.map(item => item.placeId).sort(), ["xianyang", "kaifeng", "linzi", ...expectedPlaces].sort());
  for (const added of pack.profiles) {
    assert.deepEqual(qin.find(item => item.id === added.id), added);
    for (const text of [added.summary, added.namingNote, added.politicalContext]) {
      assert.ok(text);
      assert.equal(text, simplifiedChinese(text));
    }
    assert.match(added.politicalContext!, /前221年以前.*秦国时期/);
    assert.match(added.politicalContext!, /尚未完成原始史料交叉考证/);
    assert.match(added.politicalContext!, /今地参考/);
    assert.ok(!("coordinates" in added) && !("geometry" in added));
  }
});

test("秦代有分歧的建郡年和郡治位置公开保留，不转成确定日期或空间", () => {
  const luoyang = pack.profiles.find(item => item.placeId === "luoyang")!;
  assert.match(luoyang.summary, /洛阳与荥阳两说/);
  const jinyang = pack.profiles.find(item => item.placeId === "jinyang")!;
  assert.match(jinyang.namingNote!, /前246年/);
  assert.match(jinyang.namingNote!, /前248年之后次年/);
  assert.match(jinyang.namingNote!, /内部纪年冲突/);
  assert.match(jinyang.summary, /晋阳是城邑及县名/);
  const jingzhou = pack.profiles.find(item => item.placeId === "jingzhou")!;
  assert.match(jingzhou.summary, /不把楚郢都与后世江陵城视作同一城址/);
  assert.match(jingzhou.summary, /没有足够材料核定/);
  assert.ok(pack.excludedCandidates.some(item => item.placeId === "xianyang" && /前219年与前212年/.test(item.reason)));
  assert.ok(pack.excludedCandidates.some(item => item.placeId === "chengdu" && /任职年份不能直接当作都江堰/.test(item.reason)));
});

test("秦朝新节点仅使用帝国时期确年，咸阳发丧与沙丘死亡不混为一处", () => {
  const entries = context.cityTimelines.flatMap(city => city.entries.map(entry => ({ ...entry, placeId: city.placeId })))
    .filter(entry => entry.id.startsWith("qin-expansion-"));
  assert.equal(entries.length, 3);
  assert.deepEqual(entries.map(item => item.year).sort((a, b) => a - b), [-220, -216, -210]);
  for (const item of entries) {
    assert.equal(item.placeId, "xianyang");
    assert.ok(item.year >= -221 && item.year <= -207);
    assert.equal(item.title, simplifiedChinese(item.title));
    assert.equal(item.summary, simplifiedChinese(item.summary));
    assert.match(item.dateLabel, new RegExp(`前${Math.abs(item.year)}年`));
  }
  assert.match(entries.find(item => item.year === -220)!.summary, /未取得可核定的秦驰道路线/);
  assert.match(entries.find(item => item.year === -216)!.summary, /不代表兰池宫遗址/);
  assert.match(entries.find(item => item.year === -210)!.summary, /去世的沙丘或安葬的骊山/);
  const handan = context.cityTimelines.find(item => item.placeId === "handan")!;
  assert.equal(handan.entries.filter(item => item.year === -209).length, 1);
  assert.ok(handan.entries.some(item => item.id === "handan-context-2-209"));
});

test("秦朝新引文可逐字匹配固定修订与哈希，保留原文字形", async () => {
  assert.equal(pack.sources.length, 7);
  const snapshots = new Map<string, string>();
  for (const source of pack.sources) {
    const snapshot = await readFile(path.join(root, source.snapshotPath), "utf8");
    assert.equal(createHash("sha256").update(snapshot).digest("hex"), source.snapshotSha256);
    assert.match(new URL(source.url).searchParams.get("oldid") ?? "", /^\d+$/);
    snapshots.set(source.id, snapshot);
  }
  const quotes = [...pack.profiles.flatMap(item => item.evidence), ...pack.cityTimelines.flatMap(city => city.entries.flatMap(item => item.evidence))];
  assert.equal(quotes.length, 15);
  for (const item of quotes) assert.ok(snapshots.get(item.sourceId)?.includes(item.quote), item.sourceId);
  assert.ok(quotes.some(item => /秦莊襄王/.test(item.quote)), "原始繁体字不能被显示文本的简体转换改写");
});

test("秦朝合并幂等、不会修改输入或旧记录，并拒绝同ID不同快照", () => {
  const result = execFileSync("python3", ["-c", String.raw`
import importlib.util,json
from copy import deepcopy
from pathlib import Path
root=Path.cwd()
spec=importlib.util.spec_from_file_location('qin_content',root/'scripts/build-qin-content.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
pack=module.build_pack()
profiles=module.read(root/'public/data/city-period-profiles.json')
context=module.read(root/'public/data/historical-context.json')
original_profiles,original_context=deepcopy(profiles),deepcopy(context)
merged_profiles,merged_context=module.merge_content(profiles,context,pack)
assert (profiles,context)==(original_profiles,original_context),'mutated input'
assert (merged_profiles,merged_context)==module.merge_content(merged_profiles,merged_context,pack),'not idempotent'
new_profile_ids={x['id'] for x in pack['profiles']}
new_entry_ids={x['id'] for c in pack['cityTimelines'] for x in c['entries']}
after_profiles={x['id']:x for x in merged_profiles['profiles']}
after_entries={x['id']:x for c in merged_context['cityTimelines'] for x in c['entries']}
for item in original_profiles['profiles']:
 if item['id'] not in new_profile_ids: assert after_profiles[item['id']]==item,item['id']
for city in original_context['cityTimelines']:
 for item in city['entries']:
  if item['id'] not in new_entry_ids: assert after_entries[item['id']]==item,item['id']
assert original_context['geographyEntries']==merged_context['geographyEntries']
source=pack['sources'][0]
try: module.merge_sources([source],[dict(source,snapshotSha256='0'*64)])
except AssertionError: pass
else: raise AssertionError('accepted conflicting source hash')
print(json.dumps({'profiles':len(pack['profiles']),'entries':len(new_entry_ids),'sources':len(pack['sources'])}))
`], { cwd: root, encoding: "utf8" });
  assert.deepEqual(JSON.parse(result), { profiles: 5, entries: 3, sources: 7 });
});
