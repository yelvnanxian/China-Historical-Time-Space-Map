#!/usr/bin/env python3
"""Build source-backed historical geography notes and cross-period city timelines.

All excerpts must occur literally in previously acquired local source snapshots.
This script does not change the catalog or create historical river geometries.
"""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "data/evidence/historical-context"
catalog = json.loads((ROOT / "data/catalog.json").read_text())
places = {place["id"]: place for place in catalog["places"]}
events = {event["id"]: event for event in catalog["events"]}
sources = {}
texts = {}


def source(key):
    source_id = "context-" + key
    if source_id not in sources:
        metadata = json.loads((EVIDENCE / (key + ".json")).read_text())
        snapshot = ROOT / metadata["snapshotPath"]
        text = snapshot.read_text()
        assert hashlib.sha256(snapshot.read_bytes()).hexdigest() == metadata["snapshotSha256"]
        record = {name: metadata[name] for name in ("id", "title", "url", "retrievedAt", "note", "snapshotPath", "snapshotSha256")}
        revision = metadata.get("revision", {}).get("revid")
        if revision:
            page_title = metadata["title"].removesuffix(" — 维基百科")
            record["url"] = "https://zh.wikipedia.org/w/index.php?title=" + quote(page_title) + "&oldid=" + str(revision)
            record["note"] += f" 本次读取页面修订号：{revision}。"
        sources[source_id] = record
        texts[source_id] = text
    return source_id


def evidence(key, excerpt, supports):
    source_id = source(key)
    assert excerpt in texts[source_id], f"Quote missing in {key}: {excerpt}"
    return {"sourceId": source_id, "quote": excerpt, "supports": supports}


def existing_event(event_id):
    event = events[event_id]
    checked = [item for item in event.get("evidence", []) if item.get("status") == "checked"]
    assert checked, event_id
    quotes = []
    for item in checked:
        source_id = item["sourceId"]
        metadata = json.loads((ROOT / "data/evidence" / (source_id + ".json")).read_text())
        path = ROOT / metadata["snapshotPath"]
        text = path.read_text()
        assert item["quote"] in text
        original = next(record for record in catalog["sources"] if record["id"] == source_id)
        sources[source_id] = {"id": source_id, "title": original["title"], "url": metadata["url"], "retrievedAt": metadata["retrievedAt"], "note": "复用本项目已取得的古籍原文快照。年号、月、干支日保留原文，排序年份不是逐日公历换算。", "snapshotPath": metadata["snapshotPath"], "snapshotSha256": hashlib.sha256(path.read_bytes()).hexdigest()}
        texts[source_id] = text
        quotes.append({"sourceId": source_id, "quote": item["quote"], "supports": item["supports"]})
    return {"id": "chronicle-" + event_id, "year": event["year"], "dateLabel": event["dateLabel"], "title": event["title"], "summary": event["summary"], "sourceIds": list(dict.fromkeys(item["sourceId"] for item in quotes)), "relatedEventId": event_id, "evidence": quotes}


def node(entry_id, year, title, summary, key, excerpt, date_label=None, related=None):
    result = {"id": entry_id, "year": year, "dateLabel": date_label or (f"公元前{abs(year)}年" if year < 0 else f"{year}年"), "title": title, "summary": summary, "sourceIds": [source(key)], "evidence": [evidence(key, excerpt, title + "及概述中的直接事实。") ]}
    if related:
        assert related in events
        result["relatedEventId"] = related
    return result


geography = []


def geography_entry(entry_id, year, title, summary, impact, kind, place_id, affected, key, excerpt, date_label=None, location_role="regional-reference", coordinate_note=None):
    result = node(entry_id, year, title, summary, key, excerpt, date_label)
    result.update({"impact": impact, "kind": kind, "affectedPlaceIds": affected, "referenceCoordinates": places[place_id]["coordinates"], "referencePlaceId": place_id, "locationRole": location_role, "coordinateNote": coordinate_note or f"采用已有{places[place_id]['name']}地区参考点，表示阅读入口；不是工程遗址或古河道的精确位置。"})
    geography.append(result)


geography_entry("geo-hangou-486", -486, "邗沟开凿，连接江淮", "吴王夫差在今扬州附近筑邗城，并开凿连接长江、淮河的水道，服务北上运输。", "江淮之间形成有明确纪年的人工水运联系；后来运河体系利用并改造了这一交通基础。", "canal", "yangzhou", ["yangzhou"], "grand-canal", "春秋末年，位于太湖流域的吴王夫差为了与中原的晋国争霸，于前486年修筑邗城（今扬州附近），作为北上据点，并在城下开凿运河到末口（今江苏淮安市淮安区城北北辰坊），沟通长江與淮河，以运输军队和辎重。", coordinate_note="扬州地区参考点；邗沟为区域性水道工程，此点不表示渠首或整条古河道。")
geography_entry("geo-dujiangyan-256", -256, "都江堰建设与成都平原水利", "传统记载把李冰主持都江堰建设放在战国后期，常用年代约为前256年至前251年。工程经过历代整修，长期承担分水、灌溉等功能。", "成都平原的农业与聚落发展和岷江水利体系紧密相关；这里只标示受益地区，不复原战国河渠形状。", "water-management", "chengdu", ["chengdu"], "dujiangyan", "據《史記·河渠書》、《漢書·溝洫志》記載，都江堰是由战国时期秦国蜀郡郡守李冰及其子于约前256年至前251年主持始建，另有一說法是古蜀國開明王朝期間所建。经过历代整修，两千多年来都发挥巨大的作用。", date_label="约公元前256—前251年（传统年代）", location_role="affected-area", coordinate_note="成都地区参考点表示受益地区；都江堰工程位于今都江堰市，并不位于此坐标。")
geography[-1]["evidence"].append(evidence("dujiangyan", "都江堰工程以引水灌溉为主，兼有防洪排沙、水运、城市供水等综合效用。它所灌溉的成都平原是闻名中国的“天府之国”。", "工程水利功能及成都平原受益关系；不是工程精确坐标证据。"))
geography_entry("geo-tongji-605", 605, "通济渠开凿，连接洛阳与黄淮水运", "隋大业元年开通济渠，西段利用洛水等水系连接洛阳与黄河，东段经汴水通向淮河。", "洛阳、开封等地被纳入新的漕运联系；渠道由旧河道和人工工程共同组成，不能直接等同今天的河流线。", "canal", "luoyang", ["luoyang", "kaifeng"], "sui-canal", "隋炀帝大业元年605年，开通济渠，工程西段自今洛阳西郊引谷、洛二水入黄河，东段自荥阳汜水镇东北引黄河水，循汴水（原淮河支流），经商丘、宿县、泗县入淮通济渠，又名汴渠，是漕运的干道。", date_label="隋大业元年（605年）", location_role="event-area", coordinate_note="洛阳地区作为工程西段的区域参考；不表示已测定的隋代渠首坐标。")
geography[-1]["evidence"].append(evidence("grand-canal", "東段西起滎陽西北黃河邊上的板渚（zhǔ），引黃河水進入淮河的支流汴水，經今開封市及杞縣、睢縣、寧陵、商丘、夏邑、永城等縣", "通济渠东段经过今开封地区，支持关联开封入口。"))
geography[-1]["sourceIds"].append(source("grand-canal"))
geography_entry("geo-jiangnan-canal-610", 610, "江南运河连接镇江与杭州", "隋代继续开凿、整治江南运河，由今镇江引江水，经常州、无锡、苏州、嘉兴至杭州，联系钱塘江水系。", "杭州成为南北水运网络的重要节点。这里记录的是工程及交通关系，不把现代运河全部认定为610年的原线位。", "canal", "hangzhou", ["hangzhou"], "sui-canal", "公元610年继开江南运河，由今镇江引江水经常州、无锡、苏州、嘉兴至杭州通钱塘江。", coordinate_note="杭州地区参考点表示江南运河的南端联系区域，非610年终点遗址定位。")
geography_entry("geo-yellow-river-1128", 1128, "杜充决河与黄河南徙", "南宋建炎二年，东京守将杜充为阻挡金兵，在滑州决开黄河堤防。下游水流转向东南，开启此后长期以南向摆动为主的阶段。", "黄河与泗、淮水系的关系发生重大变化。条目概述下游格局转换，不把1128年的一次决口画成固定、持续七百余年的单一路线。", "river-change", "huazhou-hua", ["huazhou-hua"], "yellow-river", "南宋建炎二年（1128年），为防御金兵南下，东京守将杜充在滑州人为决开黄河堤防，造成黄河改道，向东南分由泗水和济水入海。黄河至此由北入渤海改而南入黄海。直到1855年，黄河主要是在南面摆动，虽然时有北冲，但均被人力强行逼堵南流。", date_label="南宋建炎二年（1128年）", location_role="event-area", coordinate_note="使用已有滑州入口对应的今滑县道口地区点；这是发生地区参考，不是1128年决口遗址坐标。")
geography_entry("geo-yellow-river-1855", 1855, "铜瓦厢决口，黄河改向渤海", "清咸丰五年，黄河在今河南兰考一带的铜瓦厢决口，改向东北，在山东借大清河入渤海。", "下游入海方向改变，山东运河逐渐淤废，漕运更加依赖海路。", "river-change", "kaifeng", ["kaifeng"], "yellow-river", "最近的一次黃河大改道是在清咸丰年间。咸丰五年六月十九日（1855年8月1日），黄河在河南兰考北岸的铜瓦厢决口，改東北走向，在山東境內借济水（又名大清河）入渤海。", date_label="清咸丰五年（1855年）", coordinate_note="开封市区为邻近区域参考入口；决口位于兰考铜瓦厢一带，此点不代表决口位置或受淹范围。")
geography[-1]["evidence"].append(evidence("grand-canal", "1855年黄河改道后，运河山东段逐渐淤废。从此漕运主要改经海路。", "1855年改道后山东运河与漕运受到影响。"))
geography[-1]["sourceIds"].append(source("grand-canal"))
geography_entry("geo-huayuankou-1938", 1938, "花园口决堤，黄河再度南泛", "1938年6月9日，国民政府军队为阻挡日军进攻，在郑州附近花园口破坏黄河南岸堤防。黄河水转向南流，形成广泛黄泛区。", "水流经贾鲁河、颍河、涡河等进入淮河，给沿线居民和农业带来严重灾害。不同资料的伤亡统计口径不一，本条不采用未经交叉核定的总人数。", "flood", "zhengzhou", ["zhengzhou", "kaifeng"], "yellow-river", "1938年6月9日，国军为阻挡日军，破壞郑州黄河南岸花园口大堤，全河又向南流，沿贾鲁河、颍河、涡河入淮河。直到1947年堵复花园口后，黄河才回归北道。", date_label="1938年6月9日", location_role="event-area", coordinate_note="郑州市区参考点；花园口在城市北部黄河沿岸，本点不是决堤现场定位。")
geography[-1]["evidence"].append(evidence("huayuankou", "尉氏七万口，通许2.5万口，开封西南突出部分有五千口", "所读灾情材料明确涉及开封西南地区；本条不采用其中人口数作为核定统计。"))
geography[-1]["sourceIds"].append(source("huayuankou"))
geography_entry("geo-huayuankou-1947", 1947, "花园口堵口，黄河归故道", "1947年花园口堤防修复，黄河结束自1938年以来的主要南泛状态，回到北向入海的河道。", "堵口与下游复堤相互关联；河水回归旧道也涉及沿线已经形成的耕地、村庄与居民迁移问题，不能只理解为河线上移。", "water-management", "zhengzhou", ["zhengzhou"], "huayuankou", "1947年3月15日，國民政府進行的花園口堤防修復工程完工，並於5月4日在花園口舉行典禮慶祝黃河大堤合龍。", date_label="1947年（堵口归故）", location_role="event-area", coordinate_note="郑州市区参考点；工程发生在花园口，此点不表示堵口工程的具体坐标。")
geography[-1]["evidence"].append(evidence("yellow-river", "直到1947年堵复花园口后，黄河才回归北道。", "黄河在1947年堵复花园口后回归北道。"))
geography[-1]["evidence"].append(evidence("huayuankou", "沿岸40万军民，在黄河滩上开辟了田地，建筑了村庄。", "恢复旧道涉及已经形成的农田与村庄；概述不采用原文人口数。"))
geography[-1]["sourceIds"].append(source("yellow-river"))


timelines = []


def city(place_id, entries):
    assert place_id in places
    timelines.append({"placeId": place_id, "entries": sorted(entries, key=lambda entry: entry["year"])})


city("changan", [
    node("changan-han-palace-200", -200, "汉代未央宫营建", "汉高祖七年营建未央宫，是汉长安城建设的重要节点。汉长安城与后来的隋唐长安城位置、城垣范围不同。", "changan", "太祖七年（前200年）建造了未央宫，同一年由栎阳城迁都至此，因地处长安乡，故命名为长安城。"),
    node("changan-daxing-582", 582, "隋营建大兴城", "隋朝在汉长安城东南另建新都，由宇文恺主持规划营建；次年迁入，称大兴城。", "changan", "开皇二年（582年）起，在宇文恺的主持下，仅用9个月左右的时间就建成了宫城和皇城。开皇三年（583年），隋王朝迁至新都", date_label="隋开皇二年（582年）"),
    node("changan-tang-618", 618, "唐建国，改大兴为长安", "李渊建立唐朝，沿用隋大兴城为都并恢复长安之名，随后继续扩建宫城和城市设施。", "changan", "618年，李淵建立唐朝，定都大興，并更名为長安，此后进一步修建和完善。"),
    node("changan-move-904", 904, "唐昭宗被迫迁都洛阳", "朱全忠迫使唐昭宗迁往洛阳，并拆运长安宫室、迁走居民。此后长安失去长期承担的帝国都城地位。", "changan", "（904年）朱全忠逼迫唐昭宗迁都洛阳，不仅将所有宫殿房屋拆毁迁移，亦将人口悉数迁移。长安被毁，帝气殆尽，后虽重建，但不再被作为首都。"),
])
city("luoyang", [
    node("luoyang-zhou-770", -770, "周平王东迁洛邑", "周平王迁都洛邑，洛阳地区进入东周都城时期。历代洛阳都城并非全部位于同一城址。", "luoyang", "公元前770年，平王迁都洛邑，人口渐增。"),
    node("luoyang-sui-605", 605, "隋营建新的洛阳城", "隋大业元年，在汉魏洛阳城西南营建新都，形成后来隋唐洛阳城的基本结构。", "luoyang-palace", "隋煬帝大业元年（605年），为促进经济发展和加强中央集权。故于汉魏洛阳城西南方向设计兴建新都洛阳城", related="sui-canal"),
    existing_event("anshi-757-luoyang"),
    node("luoyang-wartime-1932", 1932, "国民政府一度迁洛办公", "日军进攻上海后，国民政府将洛阳定为行都，并一度在此办公。", "luoyang", "1932年，日军进攻上海，国民政府定洛阳为行都，并一度迁洛办公。"),
])
city("kaifeng", [
    node("kaifeng-song-960", 960, "北宋建立，以开封为都", "赵匡胤在开封以北发动陈桥兵变，建立北宋；开封成为北宋的政治与城市经济中心。", "kaifeng", "960年，后周殿前都点检赵匡胤在开封城北40里的陈桥驿（现属新乡市封丘县）发动陈桥兵变，建立北宋"),
    node("kaifeng-jingkang-1127", 1127, "靖康之变，东京失陷", "金军占领北宋东京，宋徽宗、宋钦宗及大批宗室被俘；城市随后改称汴京。", "kaifeng", "靖康二年（1127年），靖康之難，金軍佔領東京，徽欽二帝與大量宋朝皇室被俘，东京改称汴京。", related="jingkang"),
    node("kaifeng-jin-1214", 1214, "金宣宗迁都南京开封府", "为避蒙古军队进攻，金宣宗把都城迁往当时称南京开封府的开封。这里的“南京”是金代陪都、都城名称。", "kaifeng", "貞祐二年（1214年），金宣宗为避蒙古军锋，迁都“南京開封府”。"),
    node("kaifeng-flood-1642", 1642, "围城战中的黄河洪灾", "李自成围攻开封期间，黄河决水淹城，城市受到严重破坏。", "kaifeng", "崇祯十五年（1642年）李自成的叛军三次攻打开封", date_label="明崇祯十五年（1642年）"),
])
timelines[-1]["entries"][-1]["evidence"].append(evidence("kaifeng", "顿时开封变成一片汪洋，城里水深数丈，整座开封城，淤于水下", "围城期间开封遭遇严重洪水；不采用单一条目的责任与人数结论。"))
city("nanjing", [
    node("nanjing-wu-229", 229, "孙吴迁都建业", "孙权将都城由武昌迁至建业，南京地区开始其重要的六朝都城阶段。", "nanjing", "229年，孙权称帝建立东吴，将都城从武昌迁至有“钟山龙盘，石头虎踞”之称的建业，开启了南京的都城史。", related="wu-capital"),
    node("nanjing-ming-1368", 1368, "明朝建立，以应天为京师", "朱元璋建立明朝，将应天府作为京师；南京城墙、宫城等重要城市遗存与明初建设密切相关。", "nanjing", "1368年，朱元璋建立明朝，以应天为京师", date_label="明洪武元年（1368年）"),
    node("nanjing-secondary-1421", 1421, "迁都北京后成为南京", "明成祖迁都北京，应天府成为南京陪都，保留南京六部等机构。", "nanjing", "1421年，迁都顺天府，将应天府改为南京陪都，设南京六部等机构。", related="ming-beijing"),
    node("nanjing-republic-1912", 1912, "中华民国临时政府成立", "1912年1月1日，中华民国临时政府在南京成立，孙中山就任临时大总统。", "nanjing", "1912年1月1日，中华民国临时政府在南京成立，孫中山就任临时大总统", date_label="1912年1月1日"),
])
city("beijing", [
    node("beijing-jin-1153", 1153, "金迁都燕京，称中都", "金海陵王完颜亮迁都燕京，称为中都，北京地区由区域中心转为王朝都城。", "beijing-history", "1153年（贞元元年），金朝皇帝海陵王完颜亮正式建都于燕京，称为中都。"),
    node("beijing-yuan-1267", 1267, "元大都开始营建", "元大都的营建始于1267年，宫城与全城建设分阶段展开，直到1285年全城竣工。", "beijing-history", "大都营建始于1267年，次年首座宫殿落成，1274年完成宫城整体建设，至1285年全城竣工。"),
    node("beijing-ming-1421", 1421, "明朝正式迁都北京", "朱棣迁都北京，以顺天府北京为京师，应天府改为南京。明代都城建设奠定此后北京的重要城市格局。", "beijing-history", "1421年正月，朱棣迁都北京，以顺天府北京为“京师”，而原本的京师“应天府”改为“南京”。", date_label="明永乐十九年正月（1421年）", related="ming-beijing"),
])
city("hangzhou", [
    node("hangzhou-name-589", 589, "隋代首称杭州并筑城", "隋灭陈后改称杭州并开建城垣；杭州这一行政地名由此沿用。", "hangzhou", "隋文帝开皇九年（589年），隋灭南陈，首度改称杭州，开建城垣，是为杭州得名之始。"),
    node("hangzhou-southern-song-1138", 1138, "临安成为南宋行在", "绍兴八年起，临安长期承担南宋实际都城职能，成为政治、经济与文化中心。", "hangzhou", "紹興八年（1138年）起，杭州成為宋朝實際意義上的首都。杭州是南宋的政治、经济、文化中心。", related="linan-capital"),
    node("hangzhou-yuan-1276", 1276, "元军占领临安", "元军占领杭州后，临安府改为杭州路，成为江浙行省治所；城市角色由王朝行在转向区域行政中心。", "hangzhou", "1276年，蒙元占领杭州后，杭州基本保持原貌，但是南宋皇城於第二年被民間火災殃及而被焚毀。临安府改名杭州路，是江浙等处行中书省的治所", related="yuan-linan"),
])
city("chengdu", [
    node("chengdu-qin-311", -311, "秦代修筑成都城墙", "秦经营蜀地时期修筑成都城墙，形成相并的大城与少城。", "chengdu", "前311年，秦国张仪按首都咸阳建制修筑成都城墙，筑有相并的大城和少城"),
    node("chengdu-shuhan-221", 221, "刘备称帝，成都成为蜀汉都城", "刘备在成都称帝，沿用汉国号，史称蜀汉；成都成为蜀汉政权中心。", "chengdu", "蜀汉章武元年（221年），汉中王刘备在诸葛亮等人的辅佐下称帝，继承汉统，沿定国号为汉（史称蜀汉，亦简称蜀）"),
    existing_event("anshi-756-chengdu"),
    node("chengdu-former-shu-907", 907, "王建建立前蜀", "唐亡后王建称帝，定都成都，国号蜀，后世称前蜀。", "chengdu", "后梁开平元年（907年），蜀王王建自立为帝，定都成都，国号蜀，史称前蜀。"),
])
city("jingzhou", [
    node("jingzhou-qin-278", -278, "秦军拔郢，设置江陵", "白起攻占楚都郢，秦设置江陵。此处联系荆州地区历史，楚纪南城与后世江陵城不能视作同一城址。", "jingzhou", "公元前278年秦将白起拔郢置江陵。"),
    node("jingzhou-liang-552", 552, "梁元帝建都江陵", "南朝梁元帝一度在江陵建都，江陵成为梁末重要政治中心。", "jingzhou", "552年梁元帝一度在江陵建都。"),
    node("jingzhou-song-963", 963, "荆南纳地，江陵归宋", "宋军在荆湖之战中进入江陵，高继冲纳地归降，荆南政权结束。", "jingnan", "直到第五主高继冲，于宋太祖建隆四年荆湖之战（963年）时被宋军夺占江陵城，被迫纳地归降。"),
])
city("guangzhou", [
    node("guangzhou-panyu-214", -214, "秦代番禺筑城", "秦统一岭南后在番山一带修筑番禺城，是广州早期行政建制和城市建设的重要节点。", "guangzhou", "公元前214年，秦攻佔岭南，选址白云山和珠江之间南越人聚居的高地（番山）修築番禺城（史称任嚣城），为廣州设立行政区和建城的开始。"),
    node("guangzhou-southern-han-917", 917, "南汉定都兴王府", "刘龑建立南汉，以兴王府即广州为都；对外贸易是当时广州财政的重要来源。", "guangzhou", "917年，刘龑建立南汉国，定都兴王府（广州）。这是广州在历史上第二次建都。此时广州的财政收入主要仍靠对外贸易。"),
    node("guangzhou-treaty-port-1842", 1842, "《南京条约》下的五口通商", "《南京条约》将广州等五处列为通商口岸，广州此前在对西方贸易中的独口格局发生变化。", "guangzhou", "1842年，清政府战败，签订《南京条约》开通广州等五处为通商口岸。"),
])
city("yangzhou", [
    node("yangzhou-hancheng-486", -486, "邗城与邗沟兴建", "吴国在今扬州地区筑邗城、开邗沟，把长江与淮河水运联系起来。", "yangzhou", "前486年，吴国灭邗，筑邗城，开邗沟，连接长江，淮河。邗城是今扬州属地上最早的城市。"),
    node("yangzhou-jiangdu-607", 607, "隋改置江都郡", "隋大业三年改扬州为江都郡，治所在江阳县。江都、广陵和扬州等名称应结合各自历史时期理解。", "yangzhou", "隋炀帝大业三年(607年)，改扬州为江都郡，治江阳县"),
    node("yangzhou-siege-1645", 1645, "扬州陷落与屠城", "清军攻破史可法守卫的扬州后，对城中居民实施屠杀，后世称“扬州十日”。遇害人数在史料与研究中存在争议，本条不列定数。", "yangzhou-massacre", "扬州十日是公元1645年5月20日，即明弘光元年、清順治二年四月二十五日，清军攻破扬州城后对城中平民进行大屠杀的事件。", date_label="1645年（明弘光元年、清顺治二年）"),
])

geography.sort(key=lambda item: item["year"])
for item in geography:
    assert set(item["affectedPlaceIds"]) <= places.keys()
    assert item["referenceCoordinates"] == places[item["referencePlaceId"]]["coordinates"]
    assert set(item["sourceIds"]) == {e["sourceId"] for e in item["evidence"]}
for timeline in timelines:
    assert len(timeline["entries"]) >= 3
    for item in timeline["entries"]:
        assert set(item["sourceIds"]) == {e["sourceId"] for e in item["evidence"]}

result = {"version": "1.0", "generatedAt": datetime.now(timezone.utc).isoformat(), "notes": ["历史地理条目只提供地区参考点；没有可靠古河道几何时不绘制复原线路。", "城市大事记跨时期展示，不随当前朝代筛除；同名城市的古今城址可能不同。", "引文已与实际取得的文本快照逐字比对；百科概述不等于原始史料或逐段考古核定。", "年份用于排序；约年保留在日期标签中，古籍年号、月份和干支日不作未经核对的逐日公历换算。"], "sources": list(sources.values()), "geographyEntries": geography, "cityTimelines": timelines}
output = ROOT / "public/data/historical-context.json"
output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
validation = {"createdAt": result["generatedAt"], "sources": len(sources), "geographyEntries": len(geography), "cityTimelines": len(timelines), "cityEntries": sum(len(t["entries"]) for t in timelines), "quotesMatched": sum(len(item["evidence"]) for item in geography) + sum(len(item["evidence"]) for timeline in timelines for item in timeline["entries"]), "cities": [{"placeId": item["placeId"], "name": places[item["placeId"]]["name"], "entries": len(item["entries"])} for item in timelines], "referenceCoordinates": "All copied exactly from existing catalog places; location roles and caveats explicit.", "outputSha256": hashlib.sha256(output.read_bytes()).hexdigest()}
(EVIDENCE / "validation.json").write_text(json.dumps(validation, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(validation, ensure_ascii=False, indent=2))
