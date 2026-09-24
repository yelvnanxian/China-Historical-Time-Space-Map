#!/usr/bin/env python3
"""Build period-specific reading profiles from locally preserved source extracts."""
from pathlib import Path
from urllib.parse import quote
import hashlib
import json
from tang_content import load_bundles

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'data/evidence/historical-context'
catalog = json.loads((ROOT / 'data/catalog.json').read_text())
places = {p['id']: p for p in catalog['places']}
sources = {}
texts = {}
profiles = []

def cite(key, excerpt, supports):
    source_id = 'context-' + key
    if source_id not in sources:
        metadata = json.loads((EVIDENCE / (key + '.json')).read_text())
        snapshot = ROOT / metadata['snapshotPath']
        assert hashlib.sha256(snapshot.read_bytes()).hexdigest() == metadata['snapshotSha256']
        record = {k: metadata[k] for k in ('id', 'title', 'url', 'retrievedAt', 'note', 'snapshotPath', 'snapshotSha256')}
        revision = metadata['revision']['revid']
        record['url'] = 'https://zh.wikipedia.org/w/index.php?title=' + quote(metadata['title'].removesuffix(' — 维基百科')) + '&oldid=' + str(revision)
        record['note'] += f' 本次读取页面修订号：{revision}。'
        sources[source_id] = record
        texts[source_id] = snapshot.read_text()
    assert excerpt in texts[source_id], f'Missing quote: {key} / {excerpt}'
    return {'sourceId': source_id, 'quote': excerpt, 'supports': supports}

def profile(period, place, summary, *quotes):
    assert period in places[place]['periodIds'], f'Profile must be visible in period: {period}/{place}'
    evidence = [cite(key, excerpt, supports) for key, excerpt, supports in quotes]
    profiles.append({'id': f'{period}-{place}', 'periodId': period, 'placeId': place, 'summary': summary, 'sourceIds': list(dict.fromkeys(e['sourceId'] for e in evidence)), 'evidence': evidence})

profile('qin','xianyang','统一后的咸阳是秦朝都城。阅读这一时期，可把宫殿营建与帝国政治中心联系起来；秦都遗址与现代咸阳市区并不完全重合。',
 ('xianyang','是中国历史上第一个中央集权王朝——秦朝的都城所在地','秦都所在地区的身份。'),
 ('xianyang','秦始皇仿建六国宫殿，使咸阳城成为规模恢宏的帝都。','秦始皇时期的宫殿营建。'))
profile('qin','linzi','秦灭齐后，临淄从齐国都城转为齐郡所属县城。对照咸阳，可以观察统一后旧诸侯都城与帝国首都的角色变化。',
 ('linzi','秦国置临淄县，属齐郡。','秦代临淄县及所属郡。'),
 ('qi-state','齊王建出城投降，齊國滅亡。秦國統一天下，在齊地設置齊郡和琅邪郡。','秦灭齐及郡县转换。'))
profile('qin','kaifeng','秦代的浚仪承接旧魏都大梁地区，属三川郡。当地另有开封县；读到大梁、浚仪、开封时，应区分旧都、县名与不同城址。',
 ('kaifeng','秦统一六国后，实行郡县制，开封作为败亡国的国都被降为浚仪县，属三川郡。','浚仪及三川郡关系。'),
 ('kaifeng','开封县也是在秦代时期，在开封境内设置的另外一个县。','开封县与浚仪不是同一县名的简单替换。'))
profile('han','changan','西汉长安的宫殿、居民闾里与市场共同构成都城空间，城西北有著名的“长安九市”。汉长安城与后来隋唐新都位置不同。',
 ('changan','居民区分布在城北，划分为160个“闾里”。市场在城市的西北角上，称为“长安九市”。','汉城居民区和市场布局。'),
 ('changan','汉长安城位于今西安市区西北郊外','汉长安城位置的概略说明，非坐标核定。'))
profile('han','chengdu','汉代成都的织锦业是理解“锦官城”别称的线索：朝廷设锦官管理，并在城西南建锦官城。这里的城市看点侧重生产和贡赋。',
 ('chengdu','汉代的成都，经济已相当繁荣，织锦业尤其发达，成为朝廷重要的贡赋来源。于是朝廷在成都专门设置锦官管理，并在成都城西南建造“锦官城”；“锦官城”、“锦城”由此成为成都的别称。','汉代织锦、锦官和城市别称的联系。'))
profile('han','dunhuang','敦煌是汉朝经营河西与西域的阅读入口。东汉主管西域事务的护西域副尉常驻敦煌，体现其军政联系；本点不表示汉代边界或两关的精确位置。',
 ('dunhuang','东汉建立，复名敦煌郡。','东汉敦煌郡名称。'),
 ('dunhuang','中央主管西域事务的护西域副尉长驻敦煌，这里成为统辖西域的军政中心。','东汉敦煌的西域军政职能。'))
profile('sanguo','nanjing','229年孙权迁都建业，城市进入孙吴都城阶段。可与成都对照三国不同政权的政治中心；建业是南京地区的当期名称。',
 ('nanjing','229年，孙权称帝建立东吴，将都城从武昌迁至有“钟山龙盘，石头虎踞”之称的建业，开启了南京的都城史。','孙吴迁都建业。'))
profile('sanguo','chengdu','成都承担蜀汉都城职能，农业、盐业和织锦支持政权运作。263年刘禅在成都投降，城市角色随蜀汉终结而变化。',
 ('chengdu','成都的农业、盐业和织锦业在这一时期得到较大恢复发展，发展成蜀汉最大的城市，是蜀汉政权的政治、经济、军事、文化中心。','蜀汉成都的产业和政治角色。'),
 ('chengdu','蜀汉炎兴元年（263年），魏邓艾、钟会率军进攻蜀汉，蜀汉后主刘禅在成都投降。','263年蜀汉终结的节点。'))
profile('sanguo','xiangyang','襄阳在曹魏与孙吴争夺的前线，多次受到孙吴进攻。与长江沿线的江陵对照，可理解汉水通道上的军事城镇角色。',
 ('xiangyang','孙权派陈邵占领襄阳空城，但随即被曹丕以孙权“擅取襄阳”为由派曹仁、徐晃夺回。三国时期，孙吴多次攻打襄阳，皆未果。','魏吴争夺襄阳及孙吴多次进攻。'))
profile('jin','nanjing','317年司马睿在建康建立东晋，北方人口陆续南迁。这个时期的看点是政权南移与都城延续，不能将建康名称套回孙吴建业的全部年代。',
 ('nanjing','317年，琅邪王司马睿在建康建立东晋，北方人口纷纷南迁。','建康成为东晋政治中心及人口南迁。'))
profile('jin','chengdu','两晋时期成都经历成汉和东晋等政权转换。347年桓温灭成汉，成都重新成为东晋益州所领；同一时期不应把整个西南一概看作晋朝稳定直辖。',
 ('chengdu','光熙元年（306年），李雄在成都自立为帝，国号大成。','成都的成汉建国阶段。'),
 ('chengdu','永和三年（347年），成汉为东晋桓温所攻灭，成都重新成为东晋所领的益州。','347年的政权转换。'))
profile('jin','jingzhou','晋代荆州刺史治江陵，江陵作为州治获得“荆州城”别称。读史时应区分荆州这个广大州域与江陵这座治所城市。',
 ('jingzhou','晋朝时荆州刺史治江陵，江陵城作爲荆州的州城由此有了“荆州城”之別稱。','晋代州治与城市别称的关系。'))
profile('nanbei','datong','平城是北魏早期都城，直到494年孝文帝迁都洛阳。南北朝时期的平城看点是这一政治重心转移；“大同”不应无说明地作为北魏当期正式城名。',
 ('datong','直到太和十八年（494）魏孝文帝迁都洛阳为止，平城作为北魏的都城近百年之久','平城都城阶段的结束。'))
profile('nanbei','nanjing','宋、齐、梁、陈相继建都建康，使这里成为南朝政权交替中的共同都城。548年侯景之乱给城市带来重创，也说明都城延续并不等于始终安定。',
 ('nanjing','420年东晋灭亡后，宋、齐、梁、陈四朝相继在建康建都，与东吴、东晋合称六朝。','南朝各政权建都建康。'),
 ('nanjing','548年（太清二年）侯景之乱爆发，建康遭到沉重的打击','侯景之乱对城市的影响。'))
profile('nanbei','jingzhou','552年梁元帝一度在江陵建都。与长期作为南朝都城的建康对照，江陵展示了梁末政治中心短暂转移的一面。',
 ('jingzhou','552年梁元帝一度在江陵建都。','梁元帝的江陵都城节点。'))
profile('sui','changan','隋朝在旧汉长安城东南营建大兴，583年迁入新都。选择这里可以理解“同一城市沿革”中仍可能发生城址和整体规划的重大变化。',
 ('changan','当时的长安破败狭小，水污染严重，于是便决定在东南方向的龙首塬南坡另建一座新城。','大兴另建新城的空间关系。'),
 ('changan','开皇三年（583年），隋王朝迁至新都','隋王朝迁入大兴城的年份。'))
profile('sui','luoyang','605年隋在汉魏故城西南营建新洛阳，通济渠又把洛阳与黄淮水运联系起来。新都和运河关系比单看一个都城点更能解释隋代布局。',
 ('luoyang-palace','隋煬帝大业元年（605年），为促进经济发展和加强中央集权。故于汉魏洛阳城西南方向设计兴建新都洛阳城','隋洛阳另建新都。'),
 ('sui-canal','隋炀帝大业元年605年，开通济渠，工程西段自今洛阳西郊引谷、洛二水入黄河','洛阳与通济渠的联系；不证明精确古渠线。'))
profile('sui','hangzhou','589年隋代开始使用杭州之名并筑城；610年江南运河联系杭州与钱塘江。城市命名和水运网络共同构成这一时期的看点。',
 ('hangzhou','隋文帝开皇九年（589年），隋灭南陈，首度改称杭州，开建城垣，是为杭州得名之始。','隋代地名和筑城。'),
 ('sui-canal','公元610年继开江南运河，由今镇江引江水经常州、无锡、苏州、嘉兴至杭州通钱塘江。','江南运河的区域联系。'))
profile('song','kaifeng','北宋东京的坊市界限逐渐松动，商店、夜市和晓市展现都城商业生活。1127年东京失陷后改称汴京，宋代诸政权时期内城市身份也在变化。',
 ('kaifeng','北宋时，随着商品经济的发展和城市人口的增加，“坊”、“市”的界线被打破，商店可以随处开设，不再采取集中的方式。','北宋商业空间变化。'),
 ('kaifeng','市场除白天营业外，还有夜市和晓市。','市场营业形态。'),
 ('kaifeng','靖康二年（1127年），靖康之難，金軍佔領東京，徽欽二帝與大量宋朝皇室被俘，东京改称汴京。','时期内政权及城名变化。'))
profile('song','hangzhou','1138年起，临安长期承担南宋实际都城职能，政治、经济和文化中心随之南移。与北宋东京对照，可读出宋代前后两个城市中心。',
 ('hangzhou','紹興八年（1138年）起，杭州成為宋朝實際意義上的首都。杭州是南宋的政治、经济、文化中心。','临安承担南宋实际都城职能。'))
profile('song','quanzhou','1087年市舶司的设立，使泉州海上贸易有了明确的管理和征税机构。泉州这一时期的看点是港口制度与对外交流，港区范围不等于古城点。',
 ('quanzhou','北宋元祐二年（1087年），宋朝政府在泉州设置福建提举市舶司“掌蕃货、海舶、征榷贸易之事”','市舶司与海上贸易管理。'))
profile('yuan','beijing','元大都从1267年开始分阶段营建，1285年全城竣工。城市和宫城不是一年建成；这里提供大都营建过程的阅读入口。',
 ('beijing-history','大都营建始于1267年，次年首座宫殿落成，1274年完成宫城整体建设，至1285年全城竣工。','大都与宫城的分阶段建设。'))
profile('yuan','shangdu','上都是元帝季节性驻跸与理政的重要地点，与大都形成联系。草原城市的粮食物资依赖内地供给，1293年部分工匠迁回大都，提示了供应条件的限制。',
 ('shangdu','元上都的主要职能是供元朝皇帝前来避暑，每年春分元帝即从都城大都前往此地，秋分时返回都城大都。','季节性驻跸职能。'),
 ('shangdu','但最终因粮食供应不便而在至元三十年（1293年）将城中部分工匠迁回都城大都。','粮食供应与工匠迁移。'))
profile('yuan','hangzhou','1276年元军占领临安后，临安府改为杭州路，并成为江浙行省治所。杭州由南宋行在转为元朝区域行政中心。',
 ('hangzhou','1276年，蒙元占领杭州后，杭州基本保持原貌','元军进入杭州的年份。'),
 ('hangzhou','临安府改名杭州路，是江浙等处行中书省的治所','名称和区域行政中心地位。'))
profile('ming','beijing','1421年明朝迁都北京，顺天府北京成为京师。与同时保留机构的南京对照，可以理解明代两京格局。',
 ('beijing-history','1421年正月，朱棣迁都北京，以顺天府北京为“京师”，而原本的京师“应天府”改为“南京”。','明代迁都与两京称呼。'))
profile('ming','nanjing','明初应天为京师；1421年迁都后南京仍设六部等机构。都城职能发生调整，却不能把南京简单理解为从此退出政治生活。',
 ('nanjing','1368年，朱元璋建立明朝，以应天为京师','明初京师身份。'),
 ('nanjing','1421年，迁都顺天府，将应天府改为南京陪都，设南京六部等机构。','南京保留的机构。'))
profile('ming','datong','大同是明代边防重镇。1372年在辽金元土城基础上扩建砖城，适合把军事防御需求与城市形态放在一起阅读。',
 ('datong','为九塞（九边）之一。','明代边防重镇角色。'),
 ('datong','洪武五年（1372）朱元璋派大将徐达督率军民，在辽、金、元土城的基础上，把大同扩建成新的砖城。','明代砖城扩建。'))
profile('qing','beijing','1644年顺治帝迁居紫禁城，清朝定都北京。清代基本沿用明城格局，八旗驻守内城，为同一城市增加了新的居住和管理结构。',
 ('beijing-history','同年十月，迎幼主顺治帝自旧都盛京迁居紫禁城，正式定鼎北京，确立清朝都城。','1644年清朝定都北京；同年承接原段首1644。'),
 ('beijing-history','清朝基本沿用了明代北京城的空间格局，八旗（含满洲、蒙古与汉军八旗）分别驻守内城八座城门并依门而居。','城制继承与八旗驻居。'))
profile('qing','guangzhou','1842年《南京条约》将广州等五处列为通商口岸。广州的看点是晚清对外贸易制度变化；条约口岸地位不意味着此前没有对外贸易。',
 ('guangzhou','1842年，清政府战败，签订《南京条约》开通广州等五处为通商口岸。','条约和五口通商节点。'))
profile('qing','quanzhou','1784年开放泉州蚶江与台湾鹿港对渡，显示清代泉台贸易联系。与宋代市舶司看点对照，同城在不同时期有不同制度与航运关系。',
 ('quanzhou','乾隆四十九年（1784年）又开放泉州的蚶江与台湾鹿港对渡，开展泉台海上贸易。','清代蚶江鹿港对渡。'))

bundles, tang_sources, tang_profiles, new_places = load_bundles()
profiles = [profile for profile in profiles if profile['periodId'] != 'tang'] + tang_profiles
for profile in tang_profiles:
    assert 'tang' in places[profile['placeId']]['periodIds']
sources.update(tang_sources)
used_sources = {source for profile in profiles for source in profile['sourceIds']}
sources = {key: value for key, value in sources.items() if key in used_sources}
counts = {p['id']: sum(x['periodId'] == p['id'] for x in profiles) for p in catalog['periods']}
assert all(n >= 3 for n in counts.values())
assert len({p['id'] for p in profiles}) == len(profiles)
assert len({p['summary'] for p in profiles}) == len(profiles)
result = {'version':'2.0', 'sources': list(sources.values()), 'profiles':profiles}
output = ROOT / 'public/data/city-period-profiles.json'
output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
validation = {'profiles':len(profiles),'periodCoverage':counts,'distinctPlaceEntriesInProfiles':len({p['placeId'] for p in profiles}),'sources':len(sources),'quotesMatched':sum(len(p['evidence']) for p in profiles),'outputSha256':hashlib.sha256(output.read_bytes()).hexdigest(),'newCatalogPlaces':len(new_places),'newCatalogPeriodRelationships':1,'note':'按档案入口计数；幽州与范阳为既有不同阅读入口，不宣称104处互不重合的古城遗址。'}
(EVIDENCE/'city-profile-validation.json').write_text(json.dumps(validation,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(validation,ensure_ascii=False,indent=2))
