#!/usr/bin/env python3
"""Build the central/north-east linking towns from checked-in source snapshots.

Acquisition is separate; this builder runs offline and verifies every quotation.
Coordinates reference present-day areas, never a surveyed Tang city site.
"""
from pathlib import Path
from urllib.parse import quote
import json
import hashlib

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'data/evidence/tang-expansion'
sources = {}
texts = {}
for volume in (38, 39, 40, 41):
    region = 'south-east' if volume == 41 else 'north-west'
    meta = json.loads((BASE / region / f'jiutangshu-{volume}.json').read_text())
    snapshot = ROOT / meta['snapshotPath']
    assert hashlib.sha256(snapshot.read_bytes()).hexdigest() == meta['snapshotSha256']
    sources[meta['id']] = meta
    texts[volume] = snapshot.read_text()

# id, common name, 755 label, modern reference page, geographic group, summary,
# name clarification, [(volume, verbatim excerpt, what it supports)], optional context
entries = [
('xianyang','咸阳','咸阳',None,'关中与两京',
 '唐代咸阳是京畿县城，与秦都咸阳的身份不同。武德二年重新设县，起初治鲍桥，同年移到杜邮；武周又因顺陵在境内调整县等。它适合与长安对照，观察都城周围的县治、陵寝与行政联系。',
 '619年复置咸阳县；唐代县城、秦都遗址和现代咸阳市区不能视作同一城址。',
 [(38,'咸陽 隋廢縣。武德二年，復分涇陽置。初治鮑橋，其年，移治杜郵。','唐代咸阳县复置及迁治。'),(38,'天授二年，則天以其母順陵在其界，升為赤，神龍初復','武周因顺陵而调整咸阳县等。')]),
('cangzhou','沧州','景城郡','沧州市','河北与河东',
 '沧州在唐初多次迁治，经历清池、饶安、胡苏，贞观初又归清池。天宝时期的景城郡也是河北军事网络的一环，《旧唐书》记横海军驻沧州城。今沧州市点位仅供区域定位，不能代替东南方向的古州治。',
 '742年改景城郡，758年复称沧州；州治清池与现代沧州市中心不重合。',
 [(39,'又以滴河、厭次二縣屬德州，以胡蘇屬觀州，仍移治于清池。','贞观初的治所迁移。'),(38,'橫海軍，在滄州城內，管兵六千人。','沧州的横海军驻防。')]),
('yingzhou-hejian','瀛州','河间郡','Hejian','河北与河东',
 '瀛州承接隋河间郡，唐初平定河北后恢复州名，周围县份的归属多次调整。天宝改称河间郡，乾元又复瀛州；河间县与所领高阳、平舒等县构成其行政网络，应区分治所城镇与整个州郡范围。',
 '此为河北瀛州，不是辽宁营州。742年至758年间称河间郡。',
 [(39,'瀛州 上，隋河間郡。武德四年，討平竇建德，改為瀛州，領河間、樂壽、景城、文安、束城、豐利六縣','唐初瀛州及领县。'),(39,'天寶元年，改為河間郡。乾元元年，復為瀛州。','天宝、乾元间的州郡更名。')]),
('dingzhou','定州','博陵郡','Dingzhou','河北与河东',
 '定州以安喜县为治所，唐初一度设大总管府，统辖河北众多州。天宝时期称博陵郡，州城西还设北平军。它既是地方行政中心，也能帮助理解河北中部与幽州方向之间的军事联系。',
 '唐初州治安喜，天宝时为博陵郡，758年复定州；今定州市为地区参考。',
 [(39,'武德四年，復為安喜，州所治也','安喜为定州治所。'),(38,'北平軍，在定州城西，管兵六千人。','定州城西的北平军。'),(39,'六年，昇為大總管府，管定、洺、相、磁、黎、冀、深、蠡、滄、瀛、魏、貝、景、博、趙、宗、觀、廉、井、邢、欒、德、衛、滿、幽、易、燕、檀、平、營等三十二州。','唐初大总管府的统辖范围。')]),
('yizhou-hebei','易州','上谷郡','Yi County, Hebei','河北与河东',
 '易州连接河北北部诸县，州内置高阳军。开元二十三年又分置五回、楼亭、板城三县，展示出治下行政组织的变化。易州、上谷郡是前后使用的州郡名，不能因此把同名上谷地区在各时代的范围视为一致。',
 '742年改上谷郡，758年复易州；今河北易县为位置参考。',
 [(38,'高陽軍，在易州城內，管兵六千人。','易州城内的高阳军。'),(39,'開元二十三年，分置五回、樓亭、板城三縣。天寶元年，改為上谷郡，復隋舊名。乾元元年，復為易州。','领县扩充与州郡更名。')]),
('yingzhou-liaoxi','营州','柳城郡','朝阳市','河北与河东',
 '营州是唐朝东北方向的重要军政城镇，平卢节度使治所在此。契丹战争之后，营州府曾在柳城与渔阳之间迁移，开元十一年又归柳城旧治。阅读它的沿革，关键是把军府名称、驻地变化和边境关系分开。',
 '此为辽西营州，不是河北瀛州。742年改柳城郡；营州军府并非始终驻在同一地点。',
 [(39,'開元四年，復移還柳城。八年，又往就漁陽。十一年，又還柳城舊治。天寶元年，改為柳城郡。','营州驻地往返及天宝郡名。'),(38,'平盧軍節度使治，在營州，管兵萬七千五百人，馬五千五百疋。','营州的平卢节度使驻地身份。')]),
('chenzhou-huaiyang','陈州','淮阳郡','淮阳区','中原与山东',
 '陈州以宛丘为州治，唐初设置后经历领县裁并，天宝改为淮阳郡。它与汴州、许州、蔡州可组成中原城镇的对照：州名、县名与旧国地望交织，却并不指同一层级的行政单位。',
 '742年陈州改淮阳郡，758年复州名；治县宛丘，今参考河南周口淮阳地区。',
 [(38,'武德元年，討平房憲伯，改為陳州，領宛丘、箕城、扶樂、太康、新平五縣。','陈州设置及领县。'),(38,'宛丘 郭下。隋縣','宛丘为郭下县。'),(38,'天寶元年，改陳州為淮陽郡。乾元元年，復為陳州。','淮阳郡名的使用时期。')]),
('bozhou-qiao','亳州','谯郡','亳州市','中原与山东',
 '亳州在唐初设总管府，后改都督府，再撤府而保留州。州治谯县在贞观十七年由古谯城移入州城；这个迁治细节说明，即使同一州县名称延续，城市内部或附近的治所仍会变化。',
 '742年改谯郡，758年复亳州。亳州的“亳”与博州的“博”不同。',
 [(38,'五年，置總管府，管譙、亳、宋、北荊、潁、沈六州。七年，改為都督府。貞觀元年，罷都督府，亳州不改。','唐初总管府、都督府的变化。'),(38,'譙 郭下。貞觀十七年，自古譙城移入州城置','谯县迁治州城。')]),
('caizhou-runan','蔡州','汝南郡','Runan County','中原与山东',
 '唐代这一区域先称豫州，天宝称汝南郡，宝应元年才改称蔡州，治县为汝阳。元和年间讨吴元济的战争还改变了附近县份建置；读到“蔡州”时，要特别分清所指年代与今天的汝南地区。',
 '755年为汝南郡；758年复豫州，762年改蔡州。地图名称按代表年，条目收录整个唐代沿革。',
 [(38,'天寶元年，改為汝南郡。乾元元年，復為豫州。寶應元年，改為蔡州。','豫州、汝南郡、蔡州的年代关系。'),(38,'汝陽 隋舊縣。治郭下','州治汝阳县。'),(38,'元和十二年，討吳元濟于文城柵，置行吳房縣，權隸溵州。賊平，改為遂平縣，隸唐州。','平淮西战争中的邻县建置变化。')]),
('yuezhou-baling','岳州','巴陵郡','岳阳市','荆湖与江西',
 '唐初平定萧铣后先置巴州，随后改为岳州，治巴陵县。它与潭州、鄂州构成长江与湖南方向的城镇阅读路线。巴陵既曾是县名，也是天宝时期郡名，古今对照时需要先判断材料所说的行政层级。',
 '623年改岳州，742年改巴陵郡，758年复岳州；巴陵县是治县。',
 [(40,'武德四年，平蕭銑，置巴州，領巴陵、華容、沅江、羅、湘陰五縣。六年，改為岳州。','巴州、岳州的初唐建置。'),(40,'隋改為巴州，煬帝改為巴陵郡。武德置岳州，皆置巴陵縣。','巴陵县与州郡的关系。')]),
('jizhou-luling','吉州','庐陵郡','吉安市','荆湖与江西',
 '吉州在唐初平定林士弘后设置，以庐陵县为州治。庐陵旧治子阳城，永淳元年迁治；州治迁移是理解吉安地区城市沿革的关键。天宝时用庐陵郡名，乾元又复吉州，郡与县同名而层级不同。',
 '742年至758年称庐陵郡，庐陵县为治县；682年有迁治记录，坐标不表示迁治前后同址。',
 [(40,'武德五年，討平林士弘，置吉州，領廬陵、新淦二縣。','吉州的初唐设置。'),(40,'隋復為廬陵，州所治也。舊治子陽城，永淳元年，移於今所','庐陵州治及永淳迁治。')]),
('qianzhou-gan','虔州','南康郡','赣州市','荆湖与江西',
 '虔州在赣县设治，天宝时改称南康郡。唐代又从南康县分置大庾、信丰等县，展示了赣南地方建置的展开。南康既是郡名也有同名县，不能直接把整个南康郡定位到今天的南康城区。',
 '742年改南康郡，758年复虔州；“赣州”为后世名称，唐代条目保留虔州、南康郡关系。',
 [(40,'虔州 中，隋南康郡。武德五年，平江左，置虔州。天寶元年，改為南康郡。乾元元年，復為虔州。','虔州与南康郡更名。'),(40,'信豐 永淳元年，分南康置南安縣。天寶元年，改為信豐\n大庾 神龍元年，分南康置','信丰与大庾建置。'),(40,'隋初為虔州，煬帝為南康郡。皆治贛','赣县治所关系。')]),
('shaozhou','韶州','始兴郡','韶关市','岭南与东南',
 '韶州的治县是曲江，唐初曾称番州，贞观初改称韶州。其所领始兴县与大庾岭相联系，可与北面的虔州对照岭南内外的城镇分布。始兴郡不是始兴县城，两者同名却有不同的空间层级。',
 '742年改始兴郡，758年复韶州；州治曲江，今韶关市仅为地区参考。',
 [(41,'貞觀元年，改為韶州，仍割洭州之翁源來屬。','韶州名称和唐初辖境调整。'),(41,'曲江 漢縣，屬桂陽郡。在曲江川，州所治也','曲江县为韶州治所。'),(41,'縣界東嶠，一名大庾嶺，南越之北塞。','始兴县与大庾岭的地理关联。')]),
('qianzhou-wuling','黔州','黔中郡','Pengshui Miao and Tujia Autonomous County','西南与周边',
 '黔州以彭水地区为中心，是黔中道的重要军政据点。州府除本领县外，还联系多个羁縻州；《旧唐书》明确把这些州写作“皆羁縻，寄治山谷”。这类关系与常规州县直接管理不同，地图上的单一边界无法完整表达。',
 '742年改黔中郡，758年复黔州都督府；唐黔州在今重庆彭水地区，不能按“黔”字直接定位到贵阳。',
 [(40,'武德元年，改為黔州，領彭水、都上、石城三縣。','黔州本领县。'),(40,'皆羈縻，寄治山谷。乾元元年，復以黔中郡為黔州都督府。','羁縻关系及乾元更名。'),(38,'黔中、理黔州','黔中道治所。')],
 '本领县与所联系的羁縻州分属不同管理关系；条目和点位不代表统一、固定的直接统治范围。'),
]

# Name labels receive their own direct citation, in addition to each town's reading focus.
name_quotes = {
 'cangzhou': (39, '天寶元年，改為景城郡。乾元元年，復為滄州。'),
 'dingzhou': (39, '天寶元年，改為博陵郡。乾元元年，復為定州。'),
 'bozhou-qiao': (38, '天寶元年，改為譙郡。乾元元年，復為亳州也。'),
 'yuezhou-baling': (40, '天寶元年，改為巴陵郡。乾元元年，復為岳州。'),
 'jizhou-luling': (40, '天寶元年，改為廬陵郡。乾元元年，復為吉州。'),
 'qianzhou-wuling': (40, '天寶元年，改黔州為黔中郡，依舊都督施、夷、播、思、費、珍、溱、商九州。'),
 'shaozhou': (41, '天寶元年，改為始興郡。乾元元年，復為韶州。'),
}
for entry in entries:
    if entry[0] in name_quotes:
        volume, excerpt = name_quotes[entry[0]]
        entry[7].append((volume, excerpt, '天宝代表年使用郡名的直接依据。'))

coordinate_pages = {}
for lang, suffix in [('zh',''),('en','-en')]:
    path = BASE / 'central-links' / f'modern-coordinates{suffix}.json'
    meta = json.loads((BASE / 'central-links' / f'modern-coordinates{suffix}-source.json').read_text())
    for page in json.loads(path.read_text())['query']['pages']:
        if page.get('coordinates'):
            coordinate_pages[page['title']] = (page, meta, lang)

profiles = []
new_places = []
updates = []
for entry in entries:
    ident, name, label, modern_page, region, summary, naming, excerpts, *context = entry
    evidence = []
    for volume, excerpt, supports in excerpts:
        assert excerpt in texts[volume], (ident, volume, excerpt)
        prefix = 'tang-se-' if volume == 41 else 'tang-nw-'
        evidence.append({'sourceId':f'{prefix}jiutangshu-{volume}','quote':excerpt,'supports':supports})
    source_ids = list(dict.fromkeys(e['sourceId'] for e in evidence))
    profile = {'id':f'tang-{ident}','placeId':ident,'periodId':'tang','region':region,'summary':summary,'namingNote':naming,'sourceIds':source_ids,'evidence':evidence}
    if context: profile['politicalContext'] = context[0]
    profiles.append(profile)
    if modern_page is None:
        updates.append({'id':ident,'addPeriodIds':['tang'],'nameByPeriod':{'tang':'咸阳'},'typeByPeriod':{'tang':'city'},'addAliases':['唐咸阳县','杜邮','鲍桥'],'addSourceIds':source_ids})
        continue
    page, meta, lang = coordinate_pages[modern_page]
    coordinate = page['coordinates'][0]
    csid = f'tang-central-location-{ident}'
    modern_names = {'Dingzhou':'河北定州市','Yi County, Hebei':'河北保定易县','Hejian':'河北河间市','Runan County':'河南驻马店汝南县','Pengshui Miao and Tujia Autonomous County':'重庆彭水地区','沧州市':'河北沧州市地区','河间市':'河北河间市','朝阳市':'辽宁朝阳市','淮阳区':'河南周口淮阳区','亳州市':'安徽亳州市','岳阳市':'湖南岳阳市','吉安市':'江西吉安市','赣州市':'江西赣州市','韶关市':'广东韶关市'}
    display = modern_names[modern_page]
    sources[csid] = {**meta, 'id':csid,'title':display+' — 现代位置参考','url':f'https://{lang}.wikipedia.org/w/index.php?title={quote(page["title"])}&oldid={page["revisions"][0]["revid"]}'}
    modern_alias = display.removeprefix('河北').removeprefix('河南').removeprefix('江西').removeprefix('湖南').removeprefix('广东').removeprefix('安徽').removeprefix('辽宁')
    new_places.append({'id':ident,'name':name,'modernName':display,'coordinates':[round(coordinate['lon'],2),round(coordinate['lat'],2)],'type':'city','summary':summary,'aliases':list(dict.fromkeys([name,label,modern_alias])),'periodIds':['tang'],'sourceIds':[*source_ids,csid],'nameByPeriod':{'tang':label},'location':{'accuracy':'approximate','note':f'使用{display}的现代地区代表坐标，四舍五入至0.01度供浏览定位；未考古核定唐代城址，不能用于判定唐代街道、城垣或治所范围。'+('唐沧州清池治所在今城区东南，点位仅为地区参考。' if ident=='cangzhou' else ''),'sourceIds':[csid]}})

bundle={'version':'1.0','region':'central-links','sources':list(sources.values()),'newPlaces':new_places,'placeUpdates':updates,'profiles':profiles,'coverage':{'existingPlaceIds':['xianyang'],'newPlaceIds':[p['id'] for p in new_places],'notes':['河北东北、中原、荆湖江西及黔中连接城镇；14档案、13新增地点及咸阳唐代关系。','现代位置与唐代迁治有别；坐标来源保留修订号和实际API快照。']}}
out=ROOT/'data/tang-expansion/central-links.json'
out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps(bundle,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'profiles':len(profiles),'newPlaces':len(new_places),'sources':len(sources),'quotes':sum(len(p['evidence']) for p in profiles)},ensure_ascii=False))
