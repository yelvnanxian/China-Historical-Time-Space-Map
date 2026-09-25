#!/usr/bin/env python3
"""Build reviewed county identity evidence from archived sources (no geometry edits).

The API JSON is the retrieved primary-page snapshot; .txt is its visible text.
All displayed quotations must occur exactly in the referenced text snapshot.
"""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'data/evidence/tang-county-research'
SNAP = BASE / 'identity-sources'
P = 'chgis-county-'
B = 'hartwell-741-county-v5_0741_chin_chn_0741_c-'

def read(p): return json.loads(p.read_text())
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def dump(p, value): p.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

sources = []
texts = {}
for n in ['037','038','039','040','041','043上','043下']:
    ident = 'identity-xintangshu-' + n
    path = SNAP / f'xintangshu-{n}.txt'
    meta = read(SNAP / f'xintangshu-{n}.meta.json')
    texts[ident] = path.read_text()
    sources.append({'id': ident, 'title': f'《新唐书》卷{n}地理志（维基文库原文）',
                    'url': meta['pageUrl'], 'kind': 'historical-text',
                    'snapshotPath': str(path.relative_to(ROOT)), 'snapshotSha256': sha(path),
                    'retrievedAt': meta['retrievedAt'],
                    'rawSnapshotPath': str((SNAP / f'xintangshu-{n}.api.json').relative_to(ROOT)),
                    'rawSnapshotSha256': sha(SNAP / f'xintangshu-{n}.api.json')})
for n in ['03']:
    ident = 'identity-yuanhe-' + n
    path = SNAP / f'yuanhe-{n}.txt'; meta = read(SNAP / f'yuanhe-{n}.meta.json')
    texts[ident] = path.read_text()
    sources.append({'id': ident, 'title': f'《元和郡县图志》卷{n}关内道（维基文库原文）',
                    'url': meta['pageUrl'], 'kind': 'historical-text',
                    'snapshotPath': str(path.relative_to(ROOT)), 'snapshotSha256': sha(path),
                    'retrievedAt': meta['retrievedAt'],
                    'rawSnapshotPath': str((SNAP / f'yuanhe-{n}.api.json').relative_to(ROOT)),
                    'rawSnapshotSha256': sha(SNAP / f'yuanhe-{n}.api.json')})
for n in ['38','39']:
    path = ROOT / f'data/evidence/tang-expansion/north-west/jiutangshu-{n}.txt'
    api = ROOT / f'data/evidence/tang-expansion/north-west/jiutangshu-{n}.api.json'
    ident = 'identity-jiutangshu-' + n; texts[ident] = path.read_text()
    rev = read(api)['parse']['revid']
    sources.append({'id': ident, 'title': f'《旧唐书》卷{n}地理志（既存归档复核）',
                    'url': f'https://zh.wikisource.org/w/index.php?oldid={rev}', 'kind': 'historical-text',
                    'snapshotPath': str(path.relative_to(ROOT)), 'snapshotSha256': sha(path),
                    'retrievedAt': '2026-09-25', 'rawSnapshotPath': str(api.relative_to(ROOT)), 'rawSnapshotSha256': sha(api)})

models = {f['properties']['id']: f['properties'] for f in read(ROOT / 'public/data/boundaries/hartwell-741-county.geojson')['features']}
points = {f['properties']['id']: f['properties'] for f in read(ROOT / 'public/data/tang-detail/settlements-755.geojson')['features']}
records = {}
entries = []
exclusions = []
links = []

def quote(source, quote, locator):
    ident = source if source.startswith('identity-') else 'identity-xintangshu-' + source
    assert quote in texts[ident], (ident, quote)
    return {'sourceId': ident, 'quote': quote, 'locator': locator}

def finding(topic, statement, *evidence):
    return {'topic': topic, 'statement': statement, 'evidence': list(evidence)}

def raw_evidence(ident):
    if ident.startswith(P):
        p = points[ident]
        record = {'id': ident, **{k:p[k] for k in ['name','beginYear','endYear','presentLocation']}, 'sourceRecord': p['sourceRecord']}
        statement = f"CHGIS原始记录为{p['name']}，现地标注“{p['presentLocation']}”，记录起讫{p['beginYear']}—{p['endYear']}年；这些是数据源字段，并非本项目独立考证的坐标。"
    else:
        p = models[ident]
        record = {'id': ident, **{k:p[k] for k in ['sourceCode','sourceName','sourceAdminType','sourceHierarchy']}}
        statement = f"Hartwell原始模型 {p['recordId']} 的名称为“{p['sourceName']}”，原始上级字段为“{p['sourceHierarchy']['prefecture']}”，行政类型为“{p['sourceAdminType']}”。"
    encoded = json.dumps(record, ensure_ascii=False, separators=(',', ':'))
    records[ident] = encoded
    return finding('identity', statement, {'sourceId':'identity-source-records', 'quote':encoded, 'locator':ident})

def entry(ident, s, b, title, summary, findings, unresolved, correspondence='different-unit'):
    item = {'id':ident,'settlementIds':[P+str(x) for x in s], 'boundaryIds':[B+str(x) for x in b],
            'title':title,'summary':summary,'findings':findings + [raw_evidence(P+str(x)) for x in s] + [raw_evidence(B+str(x)) for x in b],
            'unresolved':unresolved,'correspondence':correspondence}
    entries.append(item);return ident

def exclude(s,b,e,reason): exclusions.append({'settlementId':P+str(s),'boundaryId':B+str(b),'researchEntryId':e,'reason':reason})
def link(s,b,e,reason): links.append({'settlementId':P+str(s),'boundaryId':B+str(b),'researchEntryId':e,'reason':reason})

id = entry('identity-yan-jincheng', [95088,70721], [29,90], '延州金城与其他同名县',
 '延州的金城县在天宝元年（742）改名敷政；不能将755年山西或兴平的金城同名点拿来判断延州县界。两个延州模型具有相同源代码，暂不合并。', [
 finding('chronology','《新唐书》记延州敷政由金城改名；《旧唐书》给出相同沿革。',
 quote('037','敷政，〈中下。本因城，武德二年徙治金城鎮，更名金城；又東境置永州，幷置洛盤、新昌、土塠三縣。貞觀四年徙州治洛源。及州廢，省洛盤、新昌、土塠入金城。天寶元年曰敷政。〉','延州·敷政'),
 quote('identity-jiutangshu-38','敷政 隋因城縣。武德二年，移治于金城鎮，改為金城縣。又於界內置永州，領金城、洛盤、新昌、土塠四縣。貞觀四年，移永州於洛源縣。八年，廢洛盤等三縣，併入金城，屬延州。天寶元年，改金城為敷政','延州·敷政')),
 finding('identity','兴平的金城县由始平改名，至德二年改兴平，与延州金城—敷政属于不同沿革链。',quote('identity-jiutangshu-38','興平 隋始平縣。天授二年，隸稷州。大足元年，還雍州。景龍四年，中宗送金城公主入蕃，別於此，因改金城縣。至德二年十月，改興平縣','京兆府·兴平'))],
 ['当前755年县点中未找到可核对的敷政记录；不能因此补造县治点或县界。','源模型29与90同代码同上级而几何不同，其关系尚待原作者资料核定。'])
for s in [95088,70721]:
 for b in [29,90]: exclude(s,b,id,'模型原隶属延州，文献明确其金城于742年改敷政；山西和兴平同名源点不是该改名链的证据。')

id = entry('identity-dan-xianning', [70657], [99], '丹州咸宁与京兆咸宁',
 '丹州本有咸宁县；京兆万年到天宝七载（748）才暂改咸宁。741年丹州模型与755年京兆同名点是不同单位。',[
 finding('administration','《新唐书》将咸宁列于丹州所属县，并交代丹州从延安郡析置的来源。',quote('037','丹州，咸寧郡，上。本丹陽郡，義寧元年析延安郡之義川、汾川、咸寧縣置，天寶元年更名。','丹州')),
 finding('chronology','京兆咸宁是万年的阶段性名称，始于748年。',quote('037','萬年，〈赤。本大興，武德元年更名。二年析置芷陽縣，七年省。總章元年析置明堂縣，長安二年省。天寶七載曰咸寧，至德三載復故名。','京兆府·万年'))],['丹州咸宁治所和模型边界仍需另找点位依据。'])
exclude(70657,99,id,'丹州咸宁与京兆万年于748年改称的咸宁，所属州与改名年代不同。')

id = entry('identity-jing-yinpan', [70735,70736], [114], '泾州阴盘—潘原与临潼坐标疑点',
 '泾州阴盘在742年改名潘原。《元和郡县图志》把它放在泾州以西的里程系统中；CHGIS阴盘和潘原两条记录却同标临潼古阴盘城，来源身份和位置仍有冲突。',[
 finding('chronology','《新唐书》明确泾州潘原本名阴盘，天宝元年改名。',quote('037','潘原。〈中。本陰盤，天寶元年更名，後省為彰信堡，貞元十一年復置。〉','泾州·潘原')),
 finding('seat','《元和郡县图志》记潘原东至泾州一百里，并追溯邠州宜禄西的阴盘故城；不能据此把临潼原始坐标当作已核定的唐代县治。',quote('identity-yuanhe-03','潘原縣，〈中。　東至州一百里。〉本漢陰盤縣，屬安定郡，在今邠州宜祿縣西二十三里陰盤故城是也。地有陰槃驛。','泾州·潘原县'))],
 ['阴盘、潘原两点在原始CHGIS中坐标完全相同，但文献地理脉络不相容；未取得可靠新坐标前保留原始点并提示待核。','本条不排除模型对应，也不新增点面链接；名称沿革可证，当前原始点是否误定位仍待查。'], 'unresolved')

id = entry('identity-yanzhou-pinglu-zhongdu', [95282,45247], [159], '兖州平陆改中都，与陕州平陆有别',
 '兖州平陆在天宝元年（742）改名中都，与山东汶上中都源点的名称链一致；山西平陆则本名河北，不能混配。',[
 finding('chronology','兖州平陆于742年改名中都，后来在贞元十四年转隶郓州。',quote('038','中都。〈上。本平陸，隸兗州。天寶元年更名。貞元十四年來屬。〉','郓州·中都'),quote('identity-jiutangshu-38','中都 漢平陸縣，本治殷密城，在今治西三十九里。天寶元年，改為中都，移於今治。','郓州·中都')),
 finding('identity','陕州平陆原名河北，与兖州的平陆—中都属于不同沿革链。两唐书对陕州改名年份记载不同，不能强行统一。',quote('038','平陸。望。本河北，隸蒲州，貞觀元年來屬。天寶元年，太守李齊物開三門以利漕運，得古刃，有篆文曰「平陸」，因更名。','陕州·平陆'),quote('identity-jiutangshu-38','平陸 隋河北縣。義甯元年，置安邑郡，縣屬焉。天寶三載，太守李齊物開三門，石下得戟，大刃，有「平陸」篆字，因改為平陸縣','陕州·平陆'))],
 ['742年中都改名时同时有迁治记载，因此755年点与741年模型只能用作跨年诊断候选，不能证明县界。','陕州河北改平陆，《新唐书》记天宝元年、《旧唐书》记天宝三载，保留史料分歧。'], 'same-unit')
exclude(95282,159,id,'山西平陆本河北，模型159的原上级为兖州，其平陆于742年改中都。')
link(45247,159,id,'新旧唐书共同支持兖州平陆—742年中都改名链；755年山东汶上中都点可参与741模型的跨年诊断，但迁治和县界未核定。')

id = entry('identity-henan-guizhou-xinan', [99101], [178], '河南新安与贵州新安',
 '河南府新安是隋代旧县，唐初经历谷州与洛州隶属变化；现有同名点却记录为629年新建、位于贵州龙里。不可用贵州点推断河南县界冲突。',[
 finding('administration','河南新安沿革为隋旧县、唐初谷州治，贞观元年移入废州城并隶洛州。',quote('identity-jiutangshu-38','新安 隋縣。義寧二年，置新安郡。武德元年，改為穀州，領新安、澠池、東垣三縣。四年，省東垣入新安。貞觀元年，移穀州治澠池，新安移入廢州城，改屬洛州。','河南府·新安')),
 finding('identity','《新唐书》另列贵州方向庄州所属新安，证明“新安”并非河南唯一县名；尚不单凭此名把CHGIS龙里点确认为该庄州县。',quote('043下','莊州〈本南壽州，貞觀三年以南謝蠻首領謝彊地置，四年更名，十一年為都督府，景龍二年罷都督。故隋牂柯郡地。南百里有桂嶺關。縣七：石牛，南陽，輕水，多樂，樂安，石城，新安。','江南道诸蛮·庄州'))],
 ['贵州龙里原始点的确切州属、治所坐标仍待地方志或考古资料复核；本轮只排除它与河南府模型的误配。','河南新安县治点在当前755年资料中缺失，未据模型中心补造。'])
exclude(99101,178,id,'河南新安为隋旧县、627年已转属洛州；CHGIS该条为贵州龙里629年新建县，与模型河南府身份不合。')

id = entry('identity-wenquan-units', [95178,43983], [424,446], '隰州温泉、蒲州温泉与岭南温泉州',
 '隰州温泉县、蒲州早期温泉县和岭南温泉州是三套身份。蒲州温泉据两唐书在武德九年（626）已省，741年模型还以温泉命名属于时相疑点。',[
 finding('administration','隰州温泉县在北温州撤废后仍属隰州。',quote('identity-jiutangshu-39','溫泉 隋新城縣。武德二年，分置溫泉縣，仍置北溫州，領溫泉、新城、高堂三縣，屬隰州總管府。貞觀元年，省北溫州及新城、高堂二縣，以溫泉來屬。','隰州·温泉')),
 finding('chronology','蒲州温泉县由桑泉分置，626年省入桑泉；741年模型不能直接作为当年独立温泉县已获证实的范围。',quote('identity-jiutangshu-39','臨晉 隋分猗氏置桑泉縣。武德三年，分置溫泉縣。九年，省溫泉併入桑泉。天寶十三年，改為臨晉縣','河中府·临晋'),quote('039','臨晉，〈次畿。本桑泉，武德三年析置溫泉縣，九年省。天寶十三載更名。〉','河中府·临晋')),
 finding('identity','岭南温泉是辖县的州，与隰州、蒲州的县不是同级同一单位。',quote('043下','溫泉州溫泉郡〈土貢：金。縣二：溫泉，洛富。〉','岭南道诸蛮·温泉州'))],
 ['蒲州模型的历史时相及用名依据尚待Hartwell原作者资料复核，保留原面而不冒称741年真实县界。','隰州温泉点即使与正确模型接近，原县界仍未独立核定。'])
for s,b in [(43983,424),(43983,446),(95178,446)]:exclude(s,b,id,'古籍区分隰州温泉县、626年已省的蒲州温泉县与岭南温泉州，不能去掉州县通名后合并。')

id = entry('identity-deng-xincheng-lintuan', [40121,82715], [688], '邓州新城改临湍，与杭州新城有别',
 '邓州新城县在天宝元年（742）改称临湍；浙江新城属杭州，与该模型不是同一县。现以临湍源点作为有文献依据的跨年候选。',[
 finding('chronology','两唐书都记邓州新城于742年改临湍；旧唐书还记贞观三年迁故临湍聚。',quote('040','臨湍，〈上。本新城。武德二年以縣置酈州，八年州廢，來屬。貞觀元年省冠軍縣入焉。天寶元年更名。','邓州·临湍'),quote('identity-jiutangshu-39','臨湍 後魏割冠軍縣北境置新城縣。武德二年，移治虎遙城，屬酈州。八年，廢酈州，縣屬鄧州。貞觀三年，移治故臨湍聚。天寶元年，改為臨湍縣','邓州·临湍')),
 finding('identity','杭州新城有省入富阳及永淳元年复置的独立沿革。',quote('041','新城，〈上。武德七年省入富陽，永淳元年復置。北五里有官塘，堰水溉田，有九澳，永淳元年開。〉','杭州·新城'))],['临湍点和新城模型的实际相容性由几何诊断单独报告；古籍改名不等于古县界已获证实。'], 'same-unit')
exclude(40121,688,id,'浙江杭州新城与邓州新城—临湍州属、沿革不同。')
link(82715,688,id,'两唐书记邓州新城742年改临湍，源点现地标注河南邓州，支持跨年名称身份候选，不认定边界精确。')

id = entry('identity-zengkou-units', [44629,42457], [748,1414], '巴州曾口与琼州曾口',
 '四川巴州曾口与海南琼州曾口分别属于不同州郡；以同名相互配对造成的千公里冲突可以排除，正确同名候选的点面偏差仍需保留。',[
 finding('administration','巴州领曾口，且旧唐书记其梁置、神龙元年迁治曾溪。',quote('040','曾口，〈中。〉','巴州清化郡·曾口'),quote('identity-jiutangshu-39','曾口 梁置。隋縣治戴公山。神龍元年，移治曾溪','巴州·曾口')),
 finding('establishment','琼州曾口系贞观十三年（639）从琼山县析置。',quote('043上','瓊山，〈下。貞觀十三年析置曾口、顏羅、容瓊三縣。貞元七年省容瓊。有鹽。〉','琼州·琼山'))],['海南琼州乾封后至贞元五年有失陷记载，755年图示还存在实际控制时相限制。','两县正确身份不等于各自县界准确。'])
exclude(42457,748,id,'639年析琼山的海南曾口不是梁代始置、隶巴州的曾口。')
exclude(44629,1414,id,'巴州梁置曾口不是琼州639年析琼山的曾口。')

id = entry('identity-binhua-units', [44698,99096], [1038], '涪州宾化与牂州宾化',
 '涪州宾化原名隆化，先天元年（712）改名；《新唐书》另有牂州宾化。贵州同名点不能作为涪州模型的县治候选。',[
 finding('chronology','涪州宾化的改名链为隆化—712年宾化。',quote('040','賓化，〈下。本隆化，貞觀十一年置，先天元年更名。〉','涪州·宾化')),
 finding('administration','《新唐书》另外将宾化列在牂州三县中，与涪州记录分列。',quote('043下','牂州〈武德三年以牂柯首領謝龍羽地置，四年更名柯州，後復故名。初，牂、琰、莊、充、應、矩六州皆為下州，開元中降牂、琰、莊為羈縻，天寶三載又降充、應、矩為羈縻。縣三：建安，賓化，新興。','江南道诸蛮·牂州'))],['贵州福泉点的精确治所和牂州归属仍需更多地方志核对；排除它与涪州637年始置、712年改名县的误配，不据距离选县。'])
exclude(99096,1038,id,'模型原上级涪州，史载宾化637年置为隆化、712年改名；贵州581年开始的宾化记录不属该沿革链。')

id = entry('identity-annan-types', [42639], [1288], '安南都护府与泷州安南县',
 '模型1288的原行政类型是都护府，CHGIS42639是泷州方向的安南县。两者都简称“安南”并不表示同一单位，不能互作县界验证。',[
 finding('identity','安南都护府由交州改名，治交趾；它是统辖诸县的都护府。',quote('043上','安南中都護府，本交趾郡，武德五年曰交州，治交趾。調露元年曰安南都護府，至德二載曰鎮南都護府，大曆三年復為安南。寶曆元年徙治宋平。','安南中都护府')),
 finding('chronology','泷州安南县622年析泷水而置，至德二年改镇南；沿革与都护府不同。',quote('043上','鎮南，下。〈本安南，武德四年置南建州，以永熙郡之安遂、永熙、永業三縣隸之。五年析瀧水置安南縣。貞觀八年更南建州曰藥州。十八年州廢，省安遂、永業，以永寧、安南來屬。至德二載更名。〉','泷州·镇南'))],['Hartwell将都护府图形放在county容器内并不使其成为县；当前模型几何和都护府真实辖境仍未核实。'])
exclude(42639,1288,id,'原始Duhufu都护府与泷州Xian县层级及所属区域不同；安南简称相同不构成对应。')

id = entry('identity-puning-types', [99012,44178], [1383], '容州普宁县与羁縻普宁州',
 '容州普宁县与贵州方向的普宁州在史书中分属县和羁縻州；应保留行政通名的区别，不能只凭“普宁”匹配。',[
 finding('administration','《新唐书》列容州普宁县，并记元和中容州徙治普宁。',quote('043上','容州普寧郡，下都督府。本銅州，武德四年以合浦郡之北流、普寧置。貞觀八年更名。元和中徙治普寧。','容州'),quote('043上','普寧，下。北流，','容州·普宁')),
 finding('identity','《新唐书》羁縻州列表中另列普宁州。',quote('043下','候州　晃州　樊州　稜州　添州　普寧州　功州','江南道诸蛮·黔州都督府所领'))],['羁縻普宁州的治所及疆域未在本轮核定；容州普宁县现有点面偏差也未据文字消除。'])
exclude(99012,1383,id,'CHGIS原始类型是普宁州，模型原属容州且类型为县；史书同时分列，不能剥去通名混配。')

id = entry('identity-sien-types', [43995,44047], [1397], '环州思恩县与羁縻思恩州',
 '环州思恩县与羁縻思恩州分别见于《新唐书》；同名不同级，广西平果的州记录不能拿来判断环州县模型。',[
 finding('administration','环州八县名单明确包含思恩县。',quote('043上','環州整平郡，下。貞觀十二年，李弘節開拓生蠻置。縣八。正平，〈下。〉福零，〈下。〉龍源，〈下。〉饒勉，〈下。〉思恩，〈下。〉','环州')),
 finding('identity','岭南羁縻州名单另列思恩州。',quote('043下','倫州　石西州　思恩州　思同州　思明州','岭南道诸蛮·邕州都督府所领'))],['古籍名单可以区分单位，不提供可直接绘制的精确县界或州界。'])
exclude(44047,1397,id,'环州思恩县与史书另列的羁縻思恩州行政身份不同；保留县、州通名才能避免误配。')

# A correspondence badge describes one conclusion, never a mixture of positive
# and excluded pairs. Keep rename-chain entries separate from homonym exclusions.
from copy import deepcopy
for original_id, right_point, wrong_point, same_title, same_summary, other_title in [
    ('identity-yanzhou-pinglu-zhongdu',45247,95282,'兖州平陆—中都改名链',
     '兖州平陆于天宝元年（742）改名中都，755年山东汶上中都源点可作为741年平陆模型的跨年诊断候选；史书同时记迁治，不能据改名链认定古县界。',
     '排除山西平陆点与兖州平陆模型的混配'),
    ('identity-deng-xincheng-lintuan',82715,40121,'邓州新城—临湍改名链',
     '邓州新城县在天宝元年（742）改称临湍，755年河南邓州临湍源点可参与741年新城模型的跨年诊断；改名证据不核定县界。',
     '排除杭州新城点与邓州新城模型的混配')]:
    original = next(item for item in entries if item['id']==original_id)
    other = deepcopy(original)
    other['id'] += '-homonym'
    other['title'] = other_title
    other['correspondence'] = 'different-unit'
    other['settlementIds'] = [P+str(wrong_point)]
    other['findings'] = [f for f in other['findings'] if not any(q.get('locator')==P+str(right_point) for q in f['evidence'])]
    original['settlementIds'] = [P+str(right_point)]
    original['title'] = same_title
    original['summary'] = same_summary
    original['findings'] = [f for f in original['findings'] if not any(q.get('locator')==P+str(wrong_point) for q in f['evidence'])]
    entries.append(other)
    for exclusion in exclusions:
        if exclusion['researchEntryId']==original_id:
            exclusion['researchEntryId']=other['id']

specific_summaries = {
 'identity-zengkou-units':'本次排除“海南曾口点→巴州曾口模型”和“四川曾口点→琼州曾口模型”两组误配。巴州与琼州各自的同州候选仍保留，其点面偏差尚未解决。',
 'identity-binhua-units':'本次排除“贵州宾化点→涪州宾化模型”的误配。涪州宾化原名隆化，712年改名；南川宾化源点的正确同州候选仍保留，县界尚待核实。',
 'identity-puning-types':'本次排除“贵州普宁州点→容州普宁县模型”的误配。容州普宁县与羁縻普宁州在史书中是不同单位，广西普宁县点仍参与自身模型诊断。',
 'identity-sien-types':'本次排除“平果思恩州点→环州思恩县模型”的误配。环州思恩县与羁縻思恩州分列于《新唐书》，环江思恩县点仍参与自身模型诊断。',
 'identity-wenquan-units':'本次排除岭南温泉州点与两处山西县模型、以及隰州温泉县点与蒲州模型的混配。隰州自身候选仍保留；蒲州温泉据两唐书在626年已省，741年模型用名仍有时相疑点。'
}
for item in entries:
    if item['id'] in specific_summaries:item['summary']=specific_summaries[item['id']]


# Conservative review pass: an exclusion must be supported by a documented
# historical hierarchy, never by present-day location or start/end years alone.
# Remove the three unsupported exclusion families and leave them unresolved.
for unresolved_id in ['identity-yan-jincheng','identity-dan-xianning','identity-henan-guizhou-xinan','identity-binhua-units']:
    for item in entries:
        if item['id'] == unresolved_id:
            item['correspondence'] = 'unresolved'
            item['unresolved'].append('本轮未取得足以证明原始点所属唐代州县的独立历史父属记录；不做异地同名排除。')
    exclusions[:] = [x for x in exclusions if x['researchEntryId'] != unresolved_id]

# Do not phrase unresolved cases as proved exclusions.
for item in entries:
    if item['id'] == 'identity-yan-jincheng':
        item['summary'] = '延州金城、山西金城和兴平金城的文献链尚未完成父属核对；虽然各自可见改名线索，本轮不把同名点排除出延州模型，也不确认任何对应。'
    elif item['id'] == 'identity-dan-xianning':
        item['summary'] = '丹州咸宁与京兆万年改称咸宁的文献链已核对；CHGIS点的唐代父属未在原始字段中直接记载，本轮仅作高概率身份提示，不做异地同名排除。'
    elif item['id'] == 'identity-henan-guizhou-xinan':
        item['summary'] = '河南府新安的隋—唐州属链已核对；CHGIS贵州新安点的唐代父属和确切单位尚未取得独立原始证据，本轮保持存疑，不做异地同名排除。'
    elif item['id'] == 'identity-binhua-units':
        item['summary'] = '涪州宾化的隆化—宾化改名链已核对；贵州宾化点的唐代父属尚未取得独立原始证据，本轮保持存疑，不做异地同名排除。'

# Keep the positive rename-chain evidence separate from the pair-focused
# exclusions; normal same-name source points must not receive an exclusion badge.
def pair_entry(source_id, boundary_id, base_entry, title, summary):
    item = deepcopy(base_entry)
    item['id'] = base_id + '-' + source_id.rsplit('-', 1)[-1] + '-' + boundary_id.rsplit('-', 1)[-1]
    item['title'] = title
    item['summary'] = summary
    item['settlementIds'] = [source_id]
    item['boundaryIds'] = [boundary_id]
    item['correspondence'] = 'different-unit'
    item['unresolved'] = ['该pair仅记录文献支持的身份排除，不判断源点或模型几何本身是否正确。']
    # Remove raw property excerpts for every unpaired normal candidate while
    # retaining shared historical quotations that explain why the pair differs.
    allowed = {source_id, boundary_id}
    kept_findings = []
    for finding_item in item['findings']:
        finding_item['evidence'] = [q for q in finding_item['evidence']
                                    if q.get('locator') not in records or q.get('locator') in allowed]
        if finding_item['evidence']:
            kept_findings.append(finding_item)
    item['findings'] = kept_findings
    return item

# Replace mixed entries by exactly the pairs named in exclusions.
pair_specs = {
 'identity-zengkou-units': [
  ('chgis-county-42457','hartwell-741-county-v5_0741_chin_chn_0741_c-748','海南曾口点与巴州曾口模型','史料将海南琼州曾口与四川巴州曾口分列；本条只排除海南点→巴州模型。'),
  ('chgis-county-44629','hartwell-741-county-v5_0741_chin_chn_0741_c-1414','巴州曾口点与琼州曾口模型','史料将四川巴州曾口与海南琼州曾口分列；本条只排除巴州点→琼州模型。')],
 'identity-wenquan-units': [
  ('chgis-county-43983','hartwell-741-county-v5_0741_chin_chn_0741_c-424','温泉州点与隰州温泉县模型','史料区分岭南温泉州与隰州温泉县；本条只排除温泉州点→隰州模型。'),
  ('chgis-county-43983','hartwell-741-county-v5_0741_chin_chn_0741_c-446','温泉州点与蒲州温泉县模型','史料区分岭南温泉州与蒲州早期温泉县；本条只排除温泉州点→蒲州模型。'),
  ('chgis-county-95178','hartwell-741-county-v5_0741_chin_chn_0741_c-446','隰州温泉县点与蒲州温泉县模型','两唐书区分隰州温泉县与626年已省的蒲州温泉县；本条只排除隰州点→蒲州模型。')],
 'identity-puning-types': [
  ('chgis-county-99012','hartwell-741-county-v5_0741_chin_chn_0741_c-1383','羁縻普宁州点与容州普宁县模型','史书同时列容州普宁县和羁縻普宁州；本条只排除普宁州点→容州普宁县模型。')],
 'identity-sien-types': [
  ('chgis-county-44047','hartwell-741-county-v5_0741_chin_chn_0741_c-1397','羁縻思恩州点与环州思恩县模型','史书同时列环州思恩县和羁縻思恩州；本条只排除思恩州点→环州县模型。')]
}
for base_id, specs in pair_specs.items():
    original = next(x for x in entries if x['id'] == base_id)
    entries.remove(original)
    for source_id, boundary_id, title, summary in specs:
        item = pair_entry(source_id, boundary_id, original, title, summary)
        entries.append(item)
        for exclusion in exclusions:
            if exclusion['researchEntryId'] == base_id and exclusion['settlementId'] == source_id and exclusion['boundaryId'] == boundary_id:
                exclusion['researchEntryId'] = item['id']
# The positive entries should contain only the positive side's evidence.
for item_id, remove_phrases in {
 'identity-yanzhou-pinglu-zhongdu':['陕州平陆原名河北'],
 'identity-deng-xincheng-lintuan':['杭州新城有省入富阳']
}.items():
    item = next(x for x in entries if x['id'] == item_id)
    item['findings'] = [f for f in item['findings'] if not any(p in f.get('statement','') for p in remove_phrases)]

record_path = SNAP / 'source-records.jsonl'
record_path.write_text('\n'.join(records[k] for k in sorted(records))+'\n')
texts['identity-source-records'] = record_path.read_text()
sources.append({'id':'identity-source-records','title':'CHGIS与Hartwell原始属性摘录（保留源名称、类型、年代和上级）','url':'https://doi.org/10.7910/DVN/29302','kind':'historical-gis',
                'snapshotPath':str(record_path.relative_to(ROOT)), 'snapshotSha256':sha(record_path), 'retrievedAt':'2026-09-25',
                'provenance':[{'path':'public/data/tang-detail/settlements-755.geojson','sha256':sha(ROOT/'public/data/tang-detail/settlements-755.geojson'),'url':'https://doi.org/10.7910/DVN/Q9VOF5'},
                              {'path':'public/data/boundaries/hartwell-741-county.geojson','sha256':sha(ROOT/'public/data/boundaries/hartwell-741-county.geojson'),'url':'https://doi.org/10.7910/DVN/29302'}],
                'extraction':'只抽取已有源属性；不改几何、坐标、地名或年代。记录ID为项目保留的源标识。'})
for item in entries:
    for f in item['findings']:
        for evidence in f['evidence']:
            assert evidence['quote'] in texts[evidence['sourceId']], (item['id'], evidence)
for item in exclusions+links:
    e = next(e for e in entries if e['id']==item['researchEntryId'])
    assert item['settlementId'] in e['settlementIds'] and item['boundaryId'] in e['boundaryIds']
result = {'id':'tang-county-reviewed-identities-2026-09-25','sources':sources,'entries':entries,'exclusions':exclusions,'links':links,
          'scope':'只补充可核对史实、排除证据充分的异地同名/不同级单位，并给有改名链的跨年诊断候选；不修改任何原始点面几何。排除不等于确认余下县界。'}
dump(BASE/'identities.json',result)
print(json.dumps({'entries':len(entries),'sources':len(sources),'settlements':len({s for e in entries for s in e['settlementIds']}),'boundaries':len({b for e in entries for b in e['boundaryIds']}),'exclusions':len(exclusions),'links':len(links)},ensure_ascii=False))
