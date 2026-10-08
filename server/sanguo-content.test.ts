import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { simplifiedChinese } from "../shared/boundary-search";
import type { CityPeriodProfile } from "../shared/city-profiles";
import type { CityTimeline, HistoricalContextSource } from "../shared/historical-context";

const root = fileURLToPath(new URL("../", import.meta.url));
const pack: {
  profiles: CityPeriodProfile[];
  sources: HistoricalContextSource[];
  cityTimelines: CityTimeline[];
  excludedCandidates: { placeId: string; topic: string; reason: string }[];
} = JSON.parse(execFileSync("python3", ["-c", String.raw`
import importlib.util,json
from pathlib import Path
spec=importlib.util.spec_from_file_location('sanguo_content',Path.cwd()/'scripts/build-sanguo-content.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
print(json.dumps(module.build_pack(),ensure_ascii=False))
`], { cwd: root, encoding: "utf8" }));
const entries = pack.cityTimelines.flatMap(city => city.entries.map(entry => ({ ...entry, placeId: city.placeId })));
const profile = (id: string) => pack.profiles.find(item => item.placeId === id)!;

test("三国批次补有据的11档，保留三个实际缺口，不生成古址或辖界", () => {
  assert.deepEqual(pack.profiles.map(item => item.placeId).sort(), ["changan", "luoyang", "beijing", "hangzhou", "guangzhou", "yangzhou", "jingzhou", "jinyang", "datong", "linzi", "dunhuang"].sort());
  for (const item of pack.profiles) {
    assert.equal(item.periodId, "sanguo");
    assert.equal(item.id, `sanguo-${item.placeId}`);
    assert.match(item.politicalContext!, /默认230年/);
    assert.match(item.politicalContext!, /266年起北方已进入西晋时期/);
    assert.match(item.politicalContext!, /今地参考/);
    assert.ok(!("geometry" in item) && !("coordinates" in item));
    for (const text of [item.summary, item.namingNote, item.politicalContext]) assert.equal(text, simplifiedChinese(text!));
  }
  for (const id of ["kaifeng", "handan", "tongguan"]) {
    assert.ok(!pack.profiles.some(item => item.placeId === id));
    assert.ok(pack.excludedCandidates.some(item => item.placeId === id));
  }
  assert.match(pack.excludedCandidates.find(item => item.placeId === "handan")!.reason, /不能把邺城.*放在邯郸城/);
});

test("孙吴广州短置、复旧与264年复置分期，钱唐封爵不伪装成到任或建县", () => {
  const guangzhou = profile("guangzhou");
  assert.match(guangzhou.summary, /226年.*俄复旧.*264年/);
  assert.match(guangzhou.namingNote!, /默认230年.*番禺/);
  assert.deepEqual(entries.filter(item => item.placeId === "guangzhou").map(item => item.year), [226, 264]);
  const qiantang = profile("hangzhou");
  assert.match(qiantang.summary, /258年.*钱唐侯/);
  assert.match(qiantang.summary, /不等于孙德亲自到钱唐任官/);
  assert.match(qiantang.namingNote!, /不是钱唐县的初置年/);
  assert.match(entries.find(item => item.placeId === "hangzhou")!.summary, /不表示孙德到任/);
  assert.ok(pack.excludedCandidates.some(item => item.placeId === "guangzhou" && /217年仍属汉末/.test(item.reason)));
});

test("三国地方薄证据不变成230年确切建置或虚构工程节点", () => {
  assert.match(profile("datong").summary, /今大同地区.*乌桓、鲜卑/);
  assert.match(profile("datong").summary, /230年的具体控制权仍待核实/);
  assert.match(profile("datong").namingNote!, /不能自动等同平城县城/);
  assert.match(profile("dunhuang").summary, /太和年间.*通行文书.*护送/);
  assert.match(profile("dunhuang").namingNote!, /不能.*补造.*具体年份/);
  assert.match(profile("beijing").summary, /原文未给工程确年/);
  assert.match(profile("jinyang").summary, /不把梁习任职自动当作230年官署位置的证明/);
  for (const id of ["datong", "dunhuang", "beijing", "jinyang", "linzi"]) {
    assert.ok(!entries.some(item => item.placeId === id), `${id}没有无确年或时代不合的伪造节点`);
  }
  assert.match(profile("linzi").summary, /214年.*221年/);
  assert.match(profile("linzi").namingNote!, /不等同实际长期居住/);
});

test("9个新大事记纪年清楚，不重复既有成都称帝与南京迁都", () => {
  assert.equal(entries.length, 9);
  assert.deepEqual(entries.map(item => item.year).sort((a, b) => a - b), [220, 221, 223, 224, 225, 226, 228, 258, 264]);
  for (const item of entries) {
    assert.ok(item.id.startsWith("sanguo-timeline-"));
    assert.match(item.dateLabel, new RegExp(`${item.year}年`));
    assert.equal(item.title, simplifiedChinese(item.title));
    assert.equal(item.summary, simplifiedChinese(item.summary));
    assert.ok(item.evidence.length >= 2, "保留纪年及地方事实两部分证据");
  }
  assert.ok(!entries.some(item => ["nanjing", "chengdu"].includes(item.placeId)));
  assert.match(entries.find(item => item.year === 228)!.summary, /不把街亭战场放在长安城中/);
  assert.match(entries.find(item => item.year === 223)!.summary, /魏方夸张战果/);
  assert.match(entries.find(item => item.year === 220)!.summary, /不把曹魏受禅地点认作洛阳/);
});

test("三国50段引文逐字匹配固定修订，原API可复现最小文本转换", async () => {
  assert.equal(pack.sources.length, 12);
  const snapshots = new Map<string, string>();
  for (const source of pack.sources) {
    const snapshot = await readFile(path.join(root, source.snapshotPath), "utf8");
    assert.equal(createHash("sha256").update(snapshot).digest("hex"), source.snapshotSha256);
    assert.match(new URL(source.url).searchParams.get("oldid") ?? "", /^\d+$/);
    snapshots.set(source.id, snapshot);
    if (source.id.startsWith("context-sanguo-")) {
      const key = source.id.slice("context-".length);
      const metadata = JSON.parse(await readFile(path.join(root, `data/evidence/historical-context/${key}.json`), "utf8"));
      const rawBytes = await readFile(path.join(root, metadata.apiSnapshotPath));
      assert.equal(createHash("sha256").update(rawBytes).digest("hex"), metadata.apiSnapshotSha256);
      const page = JSON.parse(rawBytes.toString()).query.pages[0];
      assert.equal(page.revisions[0].revid, Number(new URL(source.url).searchParams.get("oldid")));
      if (new URL(source.url).hostname === "zh.wikisource.org") {
        const reconstructed = page.revisions[0].slots.main.content.replaceAll("'''", "")
          .replace(/\[\[([^\[\]]+)\]\]/g, (_match: string, text: string) => text.split("|").at(-1)!)
          .replace(/\{\{YL\|([^{}]+)\}\}/g, (_match: string, text: string) => text.split("|")[0] + (text.includes("|") ? `（${text.split("|")[1]}）` : ""));
        assert.equal(snapshot, reconstructed);
      } else assert.equal(snapshot, page.extract);
    }
  }
  const evidence = [...pack.profiles.flatMap(item => item.evidence), ...entries.flatMap(item => item.evidence)];
  assert.equal(evidence.length, 50);
  for (const item of evidence) {
    assert.ok(snapshots.get(item.sourceId)?.includes(item.quote), `${item.sourceId}: ${item.quote}`);
    assert.doesNotMatch(item.quote, /\[\[|\{\{/, "用户摘录不显示维基标记");
  }
  assert.ok(evidence.some(item => /臨菑/.test(item.quote)), "古籍原字形必须保留");
});

test("三国合并幂等且完整保留其他批次、同名异哈希冲突会拒绝", () => {
  const result = execFileSync("python3", ["-c", String.raw`
import importlib.util,json
from copy import deepcopy
from pathlib import Path
root=Path.cwd()
spec=importlib.util.spec_from_file_location('sanguo_content',root/'scripts/build-sanguo-content.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
pack=module.build_pack()
profiles=module.read(root/'public/data/city-period-profiles.json');context=module.read(root/'public/data/historical-context.json')
original_profiles,original_context=deepcopy(profiles),deepcopy(context)
merged_profiles,merged_context=module.merge_content(profiles,context,pack)
assert (profiles,context)==(original_profiles,original_context),'mutated input'
assert (merged_profiles,merged_context)==module.merge_content(merged_profiles,merged_context,pack),'not idempotent'
profile_ids={x['id'] for x in pack['profiles']};entry_ids={x['id'] for c in pack['cityTimelines'] for x in c['entries']}
by_profile={x['id']:x for x in merged_profiles['profiles']};by_entry={x['id']:x for c in merged_context['cityTimelines'] for x in c['entries']}
for item in original_profiles['profiles']:
 if item['id'] not in profile_ids:assert by_profile[item['id']]==item,item['id']
for city in original_context['cityTimelines']:
 for item in city['entries']:
  if item['id'] not in entry_ids:assert by_entry[item['id']]==item,item['id']
assert original_context['geographyEntries']==merged_context['geographyEntries']
source=pack['sources'][0]
try:module.merge_sources([source],[dict(source,snapshotSha256='0'*64)])
except AssertionError:pass
else:raise AssertionError('accepted conflicting source')
print(json.dumps({'profiles':len(profile_ids),'entries':len(entry_ids),'sources':len(pack['sources'])}))
`], { cwd: root, encoding: "utf8" });
  assert.deepEqual(JSON.parse(result), { profiles: 11, entries: 9, sources: 12 });
});
