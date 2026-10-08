import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { simplifiedChinese } from "../shared/boundary-search";
import type { CityPeriodProfilesData } from "../shared/city-profiles";
import type { HistoricalContextData } from "../shared/historical-context";

const root = fileURLToPath(new URL("../", import.meta.url));
const profiles: CityPeriodProfilesData = JSON.parse(await readFile(path.join(root, "public/data/city-period-profiles.json"), "utf8"));
const context: HistoricalContextData = JSON.parse(await readFile(path.join(root, "public/data/historical-context.json"), "utf8"));
const expectedPlaces = ["changan", "chengdu", "quanzhou", "dali", "nanjing"];

test("元朝首批补充保留原有三城并为五座现有城市提供简体、有限定的看点", () => {
  const yuan = profiles.profiles.filter(item => item.periodId === "yuan");
  for (const placeId of ["beijing", "shangdu", "hangzhou", ...expectedPlaces]) {
    const profile = yuan.find(item => item.placeId === placeId);
    assert.ok(profile, `缺少元朝看点 ${placeId}`);
    if (!expectedPlaces.includes(placeId)) continue;
    for (const text of [profile.summary, profile.namingNote, profile.politicalContext]) {
      assert.ok(text);
      assert.equal(text, simplifiedChinese(text));
    }
    assert.match(profile.politicalContext!, /百科固定修订快照/);
    assert.match(profile.politicalContext!, /尚未完成原始史料交叉考证/);
    assert.ok(!("coordinates" in profile) && !("geometry" in profile));
  }
});

test("元代纪年区分元末控制权转移、宫城完工和全城竣工以及港税的不同含义", () => {
  const entries = context.cityTimelines.flatMap(city => city.entries.map(entry => ({ ...entry, placeId: city.placeId })))
    .filter(entry => entry.id.startsWith("yuan-expansion-"));
  assert.equal(entries.length, 5);
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const nanjing = byId.get("yuan-expansion-nanjing-yingtian-1356")!;
  assert.equal(nanjing.placeId, "nanjing");
  assert.equal(nanjing.year, 1356);
  assert.match(nanjing.summary, /明朝尚未建立/);
  assert.match(nanjing.summary, /不表示元朝继续控制/);
  const tax = byId.get("yuan-expansion-quanzhou-maritime-tax-1281")!;
  assert.equal(tax.year, 1281);
  assert.match(tax.summary, /只输税而不再抽分/);
  assert.match(tax.summary, /不将它解释为货物全面免税/);
  const dali = byId.get("yuan-expansion-dali-route-1274")!;
  assert.equal(dali.year, 1274);
  assert.match(dali.summary, /不是云南行省治所定位/);
  const capital = byId.get("yuan-expansion-beijing-completion-1285")!;
  assert.equal(capital.year, 1285);
  assert.match(capital.summary, /1274年宫城整体建设完成/);
  assert.match(capital.summary, /1285年全城竣工/);
});

test("元朝补充生成器逐字验证快照，重复合并幂等且保留其它朝代及旧节点", () => {
  // Importing the generator builds the reviewed pack in memory; this check
  // deliberately never writes the shared publication files.
  const result = execFileSync("python3", ["-c", String.raw`
import importlib.util, json
from pathlib import Path
root=Path.cwd()
spec=importlib.util.spec_from_file_location('yuan_content',root/'scripts/build-yuan-content.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
pack=module.build_pack()
profiles=module.read(root/'public/data/city-period-profiles.json')
context=module.read(root/'public/data/historical-context.json')
before_profiles={x['id']:x for x in profiles['profiles']}
before_entries={x['id']:x for c in context['cityTimelines'] for x in c['entries']}
new_profile_ids={x['id'] for x in pack['profiles']}
new_entry_ids={x['id'] for c in pack['cityTimelines'] for x in c['entries']}
merged_profiles,merged_context=module.merge_content(profiles,context,pack)
assert (merged_profiles,merged_context)==module.merge_content(merged_profiles,merged_context,pack)
after_profiles={x['id']:x for x in merged_profiles['profiles']}
after_entries={x['id']:x for c in merged_context['cityTimelines'] for x in c['entries']}
for key,item in before_profiles.items():
 if key not in new_profile_ids: assert after_profiles[key]==item,key
for key,item in before_entries.items():
 if key not in new_entry_ids: assert after_entries[key]==item,key
assert context['geographyEntries']==merged_context['geographyEntries']
print(json.dumps({'profiles':len(pack['profiles']),'entries':len(new_entry_ids),'sources':len(pack['sources'])}))
`], { cwd: root, encoding: "utf8" });
  assert.deepEqual(JSON.parse(result), { profiles: 5, entries: 5, sources: 6 });
});
