#!/usr/bin/env python3
"""Merge the first Qing reading batch from pinned local source snapshots.

This is a textual reading expansion, not a survey of Qing city sites. Source
quotes are verbatim; user-facing summaries use simplified Chinese. Run with
--check to validate without writing, or --output-root DIR to test in isolation.
"""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'data/evidence/historical-context'
NOTICE = '清代首批增补6座城市的文字档案，依据已保存固定修订的百科概述；未据此核定古城坐标、县府范围或建筑位置，仍待地方志和遗址资料互证。'

# key, verbatim quote, bounded interpretation. Never convert a reign date from
# a contradictory source into a silently "corrected" Gregorian year.
QUOTES = {
 'xian-wall': ('changan', '清代基本沿袭明制，对西安城墙进行过十二次补修。其中规模最大的是乾隆四十六年（1781年）的工程，将包墙增厚，铺设海墁，并增修排水道等，大大增强了西安城的防御能力。', '清代西安城墙沿用与1781年修缮内容；不证明具体墙线。'),
 'kaifeng-rebuild': ('kaifeng', '清朝统治中原后，于1662年重修了开封城池，并将河南省治、开封府治均设置在开封。', '1662年重修城池及清代省、府治身份；不把省府治设置强定为同年。'),
 'jiangning-office': ('nanjing', '直到清末，江宁是统辖江苏（包含今上海市）、安徽、江西三省的两江总督驻地', '江宁作为两江总督驻地的区域职能；并非全清代不变的辖境。'),
 'jiangning-weaving': ('nanjing', '清廷在江宁设立规模庞大的江宁织造署，生产供应皇家需求的丝织品，因此在经济方面江宁也具有相当的重要性。', '江宁织造与皇家丝织品生产的联系。'),
 'nanjing-treaty': ('nanjing', '1842年8月，清朝在第一次鸦片战争中战败，被迫与陈兵江宁江面的英国签订《南京条约》。', '1842年8月江宁地区议约、签约背景，不定位具体签约点。'),
 'tianjing-capital': ('nanjing', '1853年3月，太平軍攻陷江宁后定都于此，改名“天京”。', '1853年3月政权、都城身份及名称变化。'),
 'tianjing-fall': ('nanjing', '1864年7月19日，天京之役结束。曾國藩弟曾國荃率湘军入城后纵火杀掠。', '1864年天京之役结束与湘军入城。'),
 'xiaguan-port': ('nanjing', '战后的江宁一度极为萧条，虽然《天津条约》将江宁列为通商口岸，但直到1899年才在下关正式开辟商埠。', '1899年下关正式开辟商埠；条约列名与实际开埠并非同一节点。'),
 'hangzhou-capital': ('hangzhou', '清代，仍称杭州府，为浙江行省省会。', '清代杭州府及浙江省会身份。'),
 'hangzhou-garrison': ('hangzhou', '1650年修建一座城中之城的八旗驻防城：杭州驻防城，俗称“旗下营”，将旗人与汉人市民隔离开来。', '1650年杭州驻防城的营建；不由文字补画城界。'),
 'qingyutang': ('hangzhou', '胡庆余堂坐落在杭州秀丽的吴山北麓河坊街，享有“江南药王”的美誉。它是中国保存最完好的国药字号和最完整的清代徽派商业古建筑群。由清末红顶商人胡雪巖于同治十三年（1874年）创办，以“采办务真，修制务精”为制药祖训，以“是乃仁术，真不二价”为经营理念。', '胡庆余堂的1874年创办时间与经营原则；不采用段落中的完整性比较评价。'),
 'jiangshu-railway': ('hangzhou', '1907年，杭州建成从城南钱塘江边的闸口，沿东城墙向北至拱宸桥的江墅铁路。', '1907年江墅铁路的建成及文字描述的走向，不生成线路几何。'),
 'chengdu-office': ('chengdu', '清沿明制，设四川布政使司于成都。皇帝另简派四川总督、成都将军驻成都。', '成都的地方行政与驻防机构，不替代逐年官制研究。'),
 'chengdu-machinery': ('chengdu', '光绪三年（1877年），四川总督丁宝祯创办四川机械局，是成都城市经济近代化因素出现的标志。', '1877年四川机械局创办；摘要不扩写产量、厂址或产业规模。'),
 'chengdu-railway-movement': ('chengdu', '清宣统三年（1911年）6月，保路运动在成都发起', '1911年6月保路运动的成都节点，不从概述推演其单一因果。'),
 'ningxia-counties': ('yinchuan', '清设宁夏府。清雍正二年（1724年）起，设宁朔县，宁夏县、宁朔县均治宁夏城内。', '宁夏府与宁夏、宁朔两县的层级及同城治所关系。'),
 'yinchuan-academy': ('yinchuan', '清乾隆十八年(1753)宁夏知府赵本植创建银川书院', '1753年银川书院的创建；书院名称不代表此年城市正式改名。'),
 'yinchuan-gazetteer': ('yinchuan', '清朝乾隆二十年（1755）《银川小志》成书', '1755年地方文献成书，不将“银川”文献用名等同现代市名设立。'),
}

# place, region, summary, naming caveat, quote keys
PROFILES = [
 ('changan', '西北·陕西', '清代西安城墙沿袭明代基础，多次修缮。乾隆四十六年（1781年）的工程加厚包墙、铺设海墁并增修排水道，可从城防维护理解这座区域中心的城市形态；这里不把唐长安城界沿用为清代城界。', '本期阅读西安城；“长安”是跨朝代目录入口。唐代都城、清代城墙与现代西安地区参考点不可混为同一范围。', ['xian-wall']),
 ('kaifeng', '中原·河南', '经历明末破坏后，开封于1662年重修城池。清代河南省治与开封府治设在这里，同一城市承担省级和府级治所职能；重建记录说明城池的延续，并不证明与北宋东京城界完全重合。', '开封城、开封府与河南省分属不同范围。原文未将省府治设置明确系于1662年，本条仅将城池修缮定在该年。', ['kaifeng-rebuild']),
 ('nanjing', '江南·江宁', '清代江宁是两江总督驻地，又有为皇家供应丝织品的江宁织造署。1853年太平军定都并改称天京，1864年湘军入城；1899年下关才正式开辟商埠。行政、织造、战争与口岸转换共同构成这一时期的城市沿革。', '本入口对应今南京地区。江宁、天京是不同阶段称谓；清代页面中的太平天国阶段应明确区分政权，不能把本朝概览当作1820年的现状。', ['jiangning-office', 'jiangning-weaving', 'tianjing-capital', 'tianjing-fall', 'xiaguan-port']),
 ('hangzhou', '江南·浙江', '清代杭州府仍为浙江省会，1650年修建八旗驻防城，形成城内特殊的驻防空间。1874年胡庆余堂创办，1907年江墅铁路建成，可分别阅读清代驻防、商业与交通变化；后两个节点属于晚清，不能提前套入1820年。', '杭州府、府城与八旗驻防城不是同一级或同一范围；江墅铁路目前仅有文字节点，不据概述绘制线路。', ['hangzhou-capital', 'hangzhou-garrison', 'qingyutang', 'jiangshu-railway']),
 ('chengdu', '西南·四川', '清代成都设四川布政使司，又驻四川总督、成都将军。1877年四川机械局创办，1911年6月保路运动在成都发起。通过这些机构与事件，可以继续阅读成都从省级行政中心到晚清工业、政治活动城市的变化。', '本条为清代各阶段概览。晚清机械局和保路运动通过确年节点呈现，文字中的机构、活动地点均不扩写成未经核查的范围。', ['chengdu-office', 'chengdu-machinery', 'chengdu-railway-movement']),
 ('yinchuan', '西北·宁夏', '清代宁夏府城内有宁夏、宁朔两县同治，1724年起的建置不能简化为一座城只对应一个县。1753年银川书院创建、1755年《银川小志》成书，说明“银川”已用于书院和文献名称，但不表示清代已有现代银川市建制。', '清代当期入口为宁夏；兴庆府属于西夏，银川是现代地区对应名及清代文献别称。府、同城两县和城址须分开阅读。', ['ningxia-counties', 'yinchuan-academy', 'yinchuan-gazetteer']),
]

# Existing 1724 Ningxia entry is deliberately not duplicated.
EVENTS = [
 ('changan', 1781, '清·乾隆四十六年', '修缮西安城墙', '对西安城墙加厚包墙、铺设海墁并增修排水道。本节点不表示城墙范围已测绘。', ['xian-wall']),
 ('kaifeng', 1662, '清·1662年', '重修开封城池', '清代于1662年重修开封城池。省治与府治身份另在本朝看点说明，不据同段文字认定同年设治。', ['kaifeng-rebuild']),
 ('nanjing', 1842, '清·1842年8月', '江宁地区签订《南京条约》', '清朝在第一次鸦片战争中战败后与英国签订《南京条约》。地图点仅对应江宁地区，不指向具体签约船只或地点。', ['nanjing-treaty']),
 ('nanjing', 1853, '1853年3月·太平天国', '定都天京', '太平军攻陷江宁，定都于此并改称天京。此阶段的城市政权与清朝不同。', ['tianjing-capital']),
 ('nanjing', 1864, '清·1864年7月19日', '天京之役结束', '天京之役结束，曾国荃率湘军入城，原文记载纵火杀掠。本节点不推定伤亡数字。', ['tianjing-fall']),
 ('nanjing', 1899, '清·1899年', '下关正式开辟商埠', '江宁虽已在条约中列为通商口岸，到1899年才在下关正式开辟商埠；区分条约列名与实际开埠。', ['xiaguan-port']),
 ('hangzhou', 1650, '清·1650年', '营建杭州驻防城', '杭州城内修建八旗驻防城，俗称“旗下营”。这是城中驻防空间，不是整个杭州府范围。', ['hangzhou-garrison']),
 ('hangzhou', 1874, '清·同治十三年', '胡庆余堂创办', '胡雪岩创办胡庆余堂。现有城市参考点不作为商号的建筑定位。', ['qingyutang']),
 ('hangzhou', 1907, '清·1907年', '江墅铁路建成', '江墅铁路由钱塘江边闸口沿东城墙向北至拱宸桥。此处保留文字走向，尚未核定线路几何。', ['jiangshu-railway']),
 ('chengdu', 1877, '清·光绪三年', '四川机械局创办', '四川总督创办四川机械局。本节点记录城市产业变化，不把目录点认作具体厂址。', ['chengdu-machinery']),
 ('chengdu', 1911, '清·1911年6月', '保路运动在成都发起', '1911年6月，保路运动在成都发起。本节点记录地方活动，不将清末政治变化归结为单一原因。', ['chengdu-railway-movement']),
 ('yinchuan', 1753, '清·乾隆十八年', '银川书院创建', '宁夏知府赵本植创建银川书院。“银川”在这里是书院名称，不表示现代银川市于此年设立。', ['yinchuan-academy']),
 ('yinchuan', 1755, '清·乾隆二十年', '《银川小志》成书', '《银川小志》成书，作为清代使用“银川”名称的文献节点，不等同正式城市更名。', ['yinchuan-gazetteer']),
]

EXCLUDED = [
 {'placeId': 'dunhuang', 'sourceId': 'context-dunhuang', 'quote': '乾隆三十五年（1760年）改为敦煌县。', 'reason': '年号纪年与公元年不一致；未选择其一，也未生成置县节点，待地方志核对。'},
 {'placeId': 'nanjing', 'sourceId': 'context-nanjing', 'quote': '随着1906年沪宁铁路和1911年津浦铁路先后通车', 'reason': '铁路始建、分段和全线通车需专门核对，当前城市概述不足以支持精确通车节点。'},
 {'placeId': 'hangzhou', 'sourceId': 'context-hangzhou', 'quote': '清光绪二十二年（1896年），《马关条约》将杭州辟为通商口岸', 'reason': '同一快照历史段以1895年记条约、1896年记设通商场，段落表达混同；本批不新增开埠确年节点。'},
]


def read(path):
 return json.loads(path.read_text())


def write(path, value):
 path.parent.mkdir(parents=True, exist_ok=True)
 path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def build():
 catalog = read(ROOT / 'data/catalog.json')
 places = {p['id']: p for p in catalog['places']}
 sources, citations = {}, {}
 for key, (source_key, excerpt, supports) in QUOTES.items():
  metadata = read(EVIDENCE / (source_key + '.json'))
  snapshot = ROOT / metadata['snapshotPath']
  assert hashlib.sha256(snapshot.read_bytes()).hexdigest() == metadata['snapshotSha256'], source_key
  assert excerpt in snapshot.read_text(), f'Missing exact quotation: {key}'
  source_id = metadata['id']
  source = {field: metadata[field] for field in ('id', 'title', 'url', 'retrievedAt', 'note', 'snapshotPath', 'snapshotSha256')}
  source['url'] = 'https://zh.wikipedia.org/w/index.php?title=' + quote(metadata['title'].removesuffix(' — 维基百科')) + '&oldid=' + str(metadata['revision']['revid'])
  sources[source_id] = source
  citations[key] = {'sourceId': source_id, 'quote': excerpt, 'supports': supports}
 def evidence(keys):
  result = [citations[key].copy() for key in keys]
  return {'sourceIds': sorted({q['sourceId'] for q in result}), 'evidence': result}
 profiles = []
 for place, region, summary, naming_note, keys in PROFILES:
  assert 'qing' in places[place]['periodIds'], place
  profiles.append({'id': 'qing-' + place, 'placeId': place, 'periodId': 'qing', 'region': region, 'summary': summary, 'namingNote': naming_note, 'politicalContext': NOTICE, **evidence(keys)})
 entries = []
 for place, year, date, title, summary, keys in EVENTS:
  assert 'qing' in places[place]['periodIds'] and 1644 <= year <= 1911
  entries.append({'placeId': place, 'entry': {'id': f'qing-timeline-{place}-{year}', 'year': year, 'dateLabel': date, 'title': title, 'summary': summary, **evidence(keys)}})
 assert len({p['id'] for p in profiles}) == len(profiles)
 assert len({row['entry']['id'] for row in entries}) == len(entries)
 for record in EXCLUDED:
  metadata = read(EVIDENCE / (record['sourceId'].removeprefix('context-') + '.json'))
  assert record['quote'] in (ROOT / metadata['snapshotPath']).read_text()
 return {'version': '1.0', 'notes': [NOTICE], 'sources': list(sources.values()), 'profiles': profiles, 'timelineAdditions': entries, 'excludedCandidates': EXCLUDED}


def main():
 parser = argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--check', action='store_true')
 parser.add_argument('--output-root', type=Path, default=ROOT)
 args = parser.parse_args()
 pack = build()
 profile_path = args.output_root / 'public/data/city-period-profiles.json'
 context_path = args.output_root / 'public/data/historical-context.json'
 # Inputs are always the existing datasets, so a separate output root is safe.
 profiles = read(ROOT / 'public/data/city-period-profiles.json')
 context = read(ROOT / 'public/data/historical-context.json')
 before_profile_ids = {p['id'] for p in profiles['profiles']}
 additions = {p['id']: p for p in pack['profiles']}
 profiles['profiles'] = [p for p in profiles['profiles'] if p['id'] not in additions] + list(additions.values())
 entry_ids = {row['entry']['id'] for row in pack['timelineAdditions']}
 timelines = {row['placeId']: row for row in context['cityTimelines']}
 for row in timelines.values():
  row['entries'] = [entry for entry in row['entries'] if entry['id'] not in entry_ids]
 for row in pack['timelineAdditions']:
  timelines.setdefault(row['placeId'], {'placeId': row['placeId'], 'entries': []})['entries'].append(row['entry'])
 for row in timelines.values():
  row['entries'].sort(key=lambda entry: (entry['year'], entry['id']))
 context['cityTimelines'] = list(timelines.values())
 for data in [profiles, context]:
  by_id = {source['id']: source for source in data['sources']}
  for source in pack['sources']:
   # Preserve established metadata text on a reused fixed-version source.
   if source['id'] in by_id:
    assert by_id[source['id']]['snapshotSha256'] == source['snapshotSha256']
   else:
    by_id[source['id']] = source
  data['sources'] = list(by_id.values())
 if NOTICE not in context['notes']:
  context['notes'].append(NOTICE)
 audit = {'profileCount': len(pack['profiles']), 'datedEntryCount': len(pack['timelineAdditions']), 'sourceCount': len(pack['sources']), 'qingProfilesAfterMerge': sum(p['periodId'] == 'qing' for p in profiles['profiles']), 'initiallyMissingProfileIds': sorted(set(additions) - before_profile_ids), 'excludedCandidates': EXCLUDED, 'note': NOTICE}
 if not args.check:
  write(profile_path, profiles)
  write(context_path, context)
  write(args.output_root / 'data/evidence/qing-research/content.json', pack)
  # Fixed scope is used instead of a mutable "new this run" count for reproducibility.
  audit.pop('initiallyMissingProfileIds')
  write(args.output_root / 'data/evidence/qing-research/content-audit.json', audit)
 print(json.dumps(audit, ensure_ascii=False, indent=2))


if __name__ == '__main__':
 main()
