#!/usr/bin/env python3
"""Build reviewed non-city reading locations from preserved Wikipedia API replies.
Coordinates are copied from site pages, never from catalogue city centres.
Period IDs are reading contexts, not occupancy date ranges or jurisdiction claims.
"""
import hashlib
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / 'data/evidence/historical-sites'
SOURCES = {}
SITES = []

def add(id, name, typ, filename, title, periods, summary, quote, note, unresolved=None, zoom=6.5):
    path = DIR / filename
    archive = json.loads(path.read_text())
    page = next(p for p in archive['query']['pages'].values() if p['title'] == title)
    assert quote in page['extract'], (id, 'unmatched quote')
    coord = page['coordinates'][0]
    assert coord.get('globe') == 'earth'
    sourceid = f'site-{id}-reference'
    revision = page['revisions'][0]['revid']
    SOURCES[sourceid] = {'id':sourceid, 'title':f'维基百科固定版本 · {title}', 'url':page['fullurl'].split('/wiki/')[0] + '/w/index.php?oldid=' + str(revision), 'revisionId':revision, 'retrievedAt':'2026-10-08', 'snapshotPath':str(path.relative_to(ROOT)), 'snapshotSha256':hashlib.sha256(path.read_bytes()).hexdigest(), 'pageId':page['pageid']}
    SITES.append({'id':id, 'name':name, 'type':typ, 'coordinates':[coord['lon'],coord['lat']], 'periodIds':periods,
                  'summary':summary, 'evidence':[{'quote':quote,'sourceId':sourceid}], 'sourceIds':[sourceid], 'coordinateSourceId':sourceid,
                  'accuracy':'disputed-location' if id == 'red-cliffs' else 'modern-site-reference', 'locationNote':note,
                  'unresolved':unresolved or ['当前点为现代遗址或纪念地参考位置，不代表古代建筑、港区或遗址的精确范围。'], 'minZoom':zoom})

add('qin-mausoleum','秦始皇陵','tomb','en-introductions.json','Mausoleum of Qin Shi Huang',['qin'],
    '秦始皇陵墓建筑群。地图采用今陕西临潼的陵区参考点；陵园范围与地下设施未在本层复原。',
    'The Mausoleum of Qin Shi Huang (Chinese: 秦始皇陵; pinyin: Qínshǐhuáng Líng) is a tomb complex constructed for Qin Shi Huang, the first emperor of the Chinese Qin dynasty.',
    '坐标逐值复制陵墓条目的现代陵区参考点，不是陵园边界。',zoom=5.8)
add('maoling','茂陵','tomb','en-introductions.json','Maoling',['han'],
    '汉武帝陵墓，位于今陕西兴平。此处为陵墓阅读入口，不把陪葬墓或陵邑一并画成未经核定的范围。',
    'The Maoling (Chinese: 茂陵; pinyin: Mào Líng) or Mao Mausoleum is the mausoleum of Emperor Wu of Han (157–87 BC) located in Xingping, Shaanxi, China, about 40 km to the west of the provincial capital of Xi\'an.',
    '采用茂陵条目的现代遗址点；不代表汉代茂陵邑的治所或辖区。',zoom=5.8)
add('white-horse-temple','白马寺','temple','en-introductions.json','White Horse Temple',['han'],
    '洛阳白马寺。二手文献按传统叙述其始建于东汉明帝时的68年；本层保留该说法的传统性质，不把当代寺院形制外推至汉代。',
    'White Horse Temple (Chinese: 白馬寺) is a Buddhist temple in Luoyang, Henan that, according to tradition, is the first Buddhist temple in China, having been first established in 68 AD under the patronage of Emperor Ming in the Eastern Han dynasty.',
    '坐标为现白马寺位置。与汉代寺院具体建筑范围的关系仍需考古资料核对。', ['68年始建属于所引条目标明的传统叙述；未独立核定最初建筑遗址。'],zoom=6.2)
add('xiangji-temple','香积寺','temple','en-introductions.json','Xiangji Temple (Shaanxi)',['tang'],
    '长安区香积寺。寺名亦见本项目已核对的757年长安战事原文；寺院参考点与香积寺北战场不是同一个精确位置。',
    'Xiangji Temple (simplified Chinese: 香积寺; traditional Chinese: 香積寺; pinyin: Xiāngjī Sì, The Temple of Accumulated Fragrances) is a Buddhist temple located in Chang\'an District of Xi\'an, Shaanxi.',
    '坐标仅标现代香积寺。未将其作为757年战场坐标。')
add('daming-palace','大明宫遗址','site','en-introductions.json','Daming Palace',['tang'],
    '唐长安东北部的重要宫殿建筑群。地图采用现代遗址参考点，具体殿址和宫墙范围待接入考古资料。',
    'The Daming Palace was the imperial palace complex of the Tang dynasty, located in its capital Chang\'an.',
    '现代大明宫遗址参考点；不是含元殿、宣政殿等单体建筑的精确点。')
add('huaqing-palace','华清宫','site','en-introductions.json','Huaqing Pool',['tang'],
    '骊山北麓的温泉宫苑地区，与唐代宫廷活动关系密切。现有建筑与古代宫苑并非同一完整形制。',
    'The Huaqing Pool (华清池), also known as the Huaqing Palace (华清宫), is a complex of imperial gardens known for its hot springs at the northern foot of Mount Li, Qinling, approximately 25 kilometers (16 mi) east of Xi\'an, Shaanxi, China.',
    '现代华清宫景区参考点；唐代宫苑的考古范围未收入本层。')
add('yumen-pass','汉玉门关遗址','pass','zh-introductions.json','玉门关',['han'],
    '汉代通往西域的重要关隘。此处指小方盘城一带遗址；六朝和唐代关址发生变化，不把该点沿用为唐玉门关。',
    '六朝时自今安西通哈密一道日益重要，关址东移至安西双塔堡附近；唐朝再次建立，現在的玉門關是汉代玉門關的遺址',
    '采用汉玉门关小方盘城现代遗址点；后世同名关址另待核定。',zoom=5.5)
add('mogao-caves','莫高窟','temple','zh-introductions.json','莫高窟',['jin','nanbei','sui','tang','song','yuan'],
    '敦煌东南的佛教石窟群，始建于十六国，历北朝、隋、唐等时期营建。晋及宋视图属于同时期阅读关联，不表示其由晋或宋政权直接管辖。',
    '它始建于十六国的前秦时期，历经十六国、北朝、隋、唐、五代、西夏、元等历代的兴建。',
    '现代莫高窟遗址群参考点；每窟营建年代和范围需逐窟考证。',zoom=5.5)
add('yungang-grottoes','云冈石窟','temple','zh-introductions.json','雲岡石窟',['nanbei'],
    '北魏时期开凿的大型石窟群，位于大同武州山南麓。点位为窟群参考，不代表任一单窟。',
    '云冈石窟位于中国山西省大同市雲岡區雲岡鎮雲岡村武州山南麓，主要建于北魏兴安二年（453年）到太和十九年（495年）间',
    '现代云冈窟群参考点；不从概述推算单窟始建年。',zoom=5.8)
add('zhaozhou-bridge','赵州桥','site','en-second.json','Anji Bridge',['sui','tang','song','yuan','ming','qing'],
    '又名安济桥，位于今河北赵县。所引资料将建造时间放在隋代；历代修缮和现代大修意味着现状不能等同初建状态。',
    'Credited to the design of a craftsman named Li Chun, the bridge was constructed in the years 595–605 during the Sui dynasty (581–618).',
    '采用现安济桥参考坐标。中文二手条目的年号与公元换算存在冲突，本层不采用其精确建成年。', ['建造年代采用二手资料的隋代范围；精确竣工年及原始桥体范围未核定。'],zoom=6.2)
add('jiming-post','鸡鸣驿','post','jiming-full.json','鸡鸣驿',['ming','qing'],
    '河北怀来保存的驿站遗存。始建年代有明初及辽金元等不同说法；本层只作为明清驿站阅读入口，不裁定争议。',
    '鸡鸣驿，又名鸡鸣山驿，是位于河北省张家口市怀来县鸡鸣驿乡的一个驿站，始建于明朝初期（一说始建于辽金而成于元代）',
    '现代鸡鸣驿遗存参考点；驿城范围未配准。', ['始建年代有不同说法，未据二手概述作唯一结论。'],zoom=6)
add('huangpu-port','黄埔古港','port','huangpu-full.json','黄埔古港',['song','ming','qing'],
    '广州对外贸易港口遗存。所引资料记南宋时已为海舶聚集之地，明清发展为外港。今天景区含现代重建的码头与建筑。',
    '自宋代起，黄埔村长期在海外贸易中扮演重要角色。至南宋时该处已是“海舶所集之地”。明清以后，黄埔村逐步发展成为广州对外贸易的外港。',
    '采用现代黄埔古港景区参考点。岸线、锚地和码头因淤积及重建而变化，不作为宋明清港区边界。',zoom=6)
add('red-cliffs','赤壁之战地望（存疑）','battlefield','en-full.json','Battle of Red Cliffs',['han','sanguo'],
    '208—209年之交的战争发生于汉末，是三国格局形成的重要背景。具体战场地望存在学术争议，地图只给所引条目的候选参考位置。',
    'The location of the battlefield itself remains a subject of debate: most scholars consider either a location southwest of present-day Wuhan, or a location northeast of Baqiu in present-day Yueyang, Hunan as plausible candidate sites for the battle.',
    '所引条目的候选地望参考点；不是考古核定战场，不绘制战场范围。', ['不同战场候选地点尚未逐一采集；不能凭这个点排除其他地望。','在三国视图出现是历史背景阅读关联，战事纪年仍为汉末208—209年。'],zoom=5.8)
# Dated entries are hidden before the earliest recorded construction/battle
# threshold. Undated records remain explicitly labelled dynasty reading references.
def add_date(id, year, note, quote, filename=None, title=None):
    site = next(site for site in SITES if site['id'] == id)
    sourceid = site['coordinateSourceId']
    if filename:
        path = DIR / filename
        page = next(p for p in json.loads(path.read_text())['query']['pages'].values() if p['title'] == title)
        sourceid = f'site-{id}-dating-reference'
        revision = page['revisions'][0]['revid']
        SOURCES[sourceid] = {'id':sourceid, 'title':f'维基百科固定版本 · {title}', 'url':page['fullurl'].split('/wiki/')[0] + '/w/index.php?oldid=' + str(revision), 'revisionId':revision, 'retrievedAt':'2026-10-08', 'snapshotPath':str(path.relative_to(ROOT)), 'snapshotSha256':hashlib.sha256(path.read_bytes()).hexdigest(), 'pageId':page['pageid']}
        site['sourceIds'].append(sourceid)
    else:
        source = SOURCES[sourceid]
        page = next(p for p in json.loads((ROOT/source['snapshotPath']).read_text())['query']['pages'].values() if p.get('pageid') == source['pageId'])
    assert quote in page['extract'], (id, 'unmatched dating quote')
    site.update({'beginYear':year,'beginYearNote':note})
    site['evidence'].append({'quote':quote,'sourceId':sourceid})

add_date('qin-mausoleum',-246,'按所引二手资料的开工年（前246）开始显示，不表示当时已经竣工。','It was constructed over 38 years from 246 to 208 BC')
add_date('maoling',-139,'按所引二手资料的开工年（前139）开始显示，不表示当时已经竣工。',"Construction of the tomb began in 139 BC, the second year in the reign of Emperor Wu",'maoling-full.json','Maoling')
add_date('white-horse-temple',68,'按传统始建年68年开始显示；不把这一传统叙述表述为独立考古核定。','having been first established in 68 AD')
add_date('xiangji-temple',681,'按所引二手资料的681年营建叙述开始显示。','In 681, during the reign of Emperor Gaozong of Tang dynasty (618–907), master Shandao, the founder of Pure Land Buddhism, died.','xiangji-temple-shaanxi-full.json','Xiangji Temple (Shaanxi)')
add_date('daming-palace',634,'按所引二手资料的634年开工叙述开始显示；662年另有扩建/设置叙述，不把不同阶段合成单一竣工年。','In 634, Emperor Taizong launched the construction of the Daming Palace at Longshou Plateau.','daming-palace-full.json','Daming Palace')
add_date('mogao-caves',366,'始建有353年与366年异说，暂以较晚的366年作显示门槛；不据此否定更早活动。','The first caves were dug out in 366 CE','mogao-caves-full.json','Mogao Caves')
next(site for site in SITES if site['id']=='mogao-caves')['unresolved'].append('所引全文亦记353年这一更早说法，始建精确年仍待核；点位不代表366年单窟位置。')
add_date('yungang-grottoes',453,'按所引二手资料的主要营建区间起年453年开始显示。','主要建于北魏兴安二年（453年）到太和十九年（495年）间')
add_date('zhaozhou-bridge',595,'按所引资料595—605年建造区间的起年显示，不把595年称为竣工年。','the bridge was constructed in the years 595–605 during the Sui dynasty (581–618).')
add_date('red-cliffs',208,'按208—209年之交战事显示；三国视图仅作汉末背景关联。','took place during the winter of 208–209 AD.')

result = {'version':'1.0','note':'地点类型为史迹阅读入口。朝代关联表示相关时代的阅读背景，并非连续存续年表；坐标均来自具体遗址条目，为现代位置参照或明确标识的存疑地望。未以城市中心代替古址。', 'sites':SITES,'sources':list(SOURCES.values()), 'gaps':[{'type':'ferry','note':'已读取西津渡文字资料，尚未取得并核对遗址坐标，暂不在地图落点。'}]}
output = ROOT / 'public/data/historical-sites.json'
output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'sites':len(SITES),'types':sorted({x['type'] for x in SITES}),'sourceCount':len(SOURCES)},ensure_ascii=False))
