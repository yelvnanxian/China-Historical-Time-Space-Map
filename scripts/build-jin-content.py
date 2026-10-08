#!/usr/bin/env python3
"""Merge sourced Jin-period reading content; --check never publishes outputs.

County lists support names and listed parent units, never seat coordinates,
precise borders, or unchanged sovereignty throughout 266–420.
"""
import argparse
from copy import deepcopy
import hashlib
import json
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "data/evidence/historical-context"


def read(path):
    return json.loads(path.read_text())


def dump(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def build_pack():
    places = {item["id"]: item for item in read(ROOT / "data/catalog.json")["places"]}
    sources, texts, profiles, timelines = {}, {}, [], {}

    def evidence(key, excerpt, supports):
        source_id = "context-" + key
        if source_id not in sources:
            metadata = read(EVIDENCE / (key + ".json"))
            assert metadata["id"] == source_id
            snapshot = ROOT / metadata["snapshotPath"]
            assert snapshot.resolve().is_relative_to(EVIDENCE.resolve())
            assert hashlib.sha256(snapshot.read_bytes()).hexdigest() == metadata["snapshotSha256"]
            record = {k: metadata[k] for k in (
                "id", "title", "url", "retrievedAt", "note", "snapshotPath", "snapshotSha256")}
            revision = metadata["revision"]["revid"]
            assert isinstance(revision, int) and revision > 0
            if "oldid=" not in record["url"]:
                record["url"] = "https://zh.wikipedia.org/w/index.php?title=" + quote(
                    metadata["title"].removesuffix(" — 维基百科")) + "&oldid=" + str(revision)
                record["note"] += f" 本次读取页面修订号：{revision}。"
            sources[source_id] = record
            texts[source_id] = snapshot.read_text()
        assert excerpt in texts[source_id], f"Missing exact quote: {key}/{excerpt}"
        return {"sourceId": source_id, "quote": excerpt, "supports": supports}

    def geography(volume, district, county):
        key = 'jin-geography-' + volume
        text = (EVIDENCE / (key + '.txt')).read_text()
        start = text.index('\n' + district + '（') + 1
        county_start = text.index('\n:', start)
        end = text.index('\n\n', county_start + 1)
        excerpt = text[start:end]
        assert county in excerpt
        return (key, excerpt, '《晋书·地理志》本郡国县目列有该县；只采用名称及所列隶属，不据列序推治所、不将郡国户口当作城内人口。条目内沿革及校勘异文不合并为单年状态。')

    def profile(place_id, summary, region, naming_note, *quotes):
        assert 'jin' in places[place_id]['periodIds']
        refs = [evidence(*item) for item in quotes]
        profiles.append({
            'id': 'jin-' + place_id, 'placeId': place_id, 'periodId': 'jin',
            'summary': summary, 'region': region, 'namingNote': naming_note,
            'politicalContext': '本档案涵盖两晋及同时期其他政权，不表示全部事实发生于默认280年，也不表示本点在266—420年始终由晋直接管辖。地理志县目含不同时期的沿革，不能套成全部年份的行政截面。古籍电子转录未与点校本校勘，百科快照未完成原始史料交叉考证；目录坐标仍为现代地区参考，不核定古城址、关址或辖界。',
            'sourceIds': list(dict.fromkeys(item['sourceId'] for item in refs)), 'evidence': refs,
        })

    def node(place_id, suffix, year, title, summary, date_label, *quotes, related_event=None):
        assert 'jin' in places[place_id]['periodIds'] and 266 <= year < 420
        refs = [evidence(*item) for item in quotes]
        record = {'id': 'jin-timeline-' + suffix, 'year': year, 'dateLabel': date_label,
                  'title': title, 'summary': summary,
                  'sourceIds': list(dict.fromkeys(item['sourceId'] for item in refs)), 'evidence': refs}
        if related_event:
            record['relatedEventId'] = related_event
        timelines.setdefault(place_id, []).append(record)

    min_accession = '永嘉七年（313年）晉懷帝於平陽遇害，四月消息传到长安，司馬鄴为怀帝举哀，於長安即帝位，改元建興，是为晉愍帝'
    min_surrender = '建兴四年十一月十一日（316年12月11日），愍帝乘羊车以肉袒衔璧抬棺之礼出东门投降'
    luoyang_fall = '永嘉之亂，又稱永嘉之禍，是發生在西晉永嘉五年（311年）的戰亂，當時中國北方的遊牧民族匈奴擊敗西晉京師洛陽的守軍，大肆搶掠殺戮，更俘擄晉懷帝等王公大臣，及後西晉於316年滅亡。'
    yuan_accession = '建武元年（317年），在上一年漢趙俘擄晉愍帝的消息隨平東將軍宋哲傳到建康後，宋哲宣稱有愍帝詔命以司馬睿總攝萬機，西陽王司馬羕為首的眾官員則請司馬睿登帝位，在司馬睿拒絕之下依魏晉兩朝先例改稱晉王，並於建康備百官，立社稷，並改元「建武」。同年晉愍帝被殺，消息在翌年（318年）傳到建康，百官勸進，司馬睿遂即帝位，改元「太興」。'
    nanjing_rename = '西晋灭吴后，282年（太康三年）改建业为建邺，313年（建兴元年）又改建康。'
    pass_campaign = '二月，冠軍將軍檀道濟等次潼關。三月庚辰，大軍入河。索虜步騎十萬，營據河津。公命諸軍濟河擊破之。公至洛陽。七月，至陝城。龍驤將軍王鎮惡伐木為舟，自河浮渭。八月，扶風太守沈田子大破姚泓於藍田。王鎮惡剋長安，生擒泓。九月，公至長安。'
    # The heading is retained as independent exact evidence for the same section.
    campaign_year = ('jin-songshu-wudi', '==義熙十三年==', '下引潼关、长安战事所在的纪年标题。')
    yixi_anchor = ('jin-yixi', '元興四年（405年）正月十六日，改元為義熙元年。', '义熙元年对应405年；按连续纪年换算十三年为405+12，即417年，不换算具体月日。')
    campaign = ('jin-songshu-wudi', pass_campaign, '义熙十三年条记檀道济等至潼关、王镇恶攻克长安及刘裕后至长安；不据文字绘制路线。')

    profile('changan', '《晋书·地理志》在京兆郡下列长安县。西晋后期，司马邺于313年在长安即位，316年在围困后出降；到东晋末年，将领又在义熙十三年攻克后秦都城长安。这些阶段的都城身份和控制权不同，不能沿用280年的政治格局解释全部两晋史。',
            '关中', '长安县、京兆郡与帝都长安分属不同阅读层次；本点不代表汉晋城与隋唐城拥有相同城址和范围。',
            geography('014', '京兆郡', '長安'), ('jin-min-emperor', min_accession, '313年长安即位。'), ('jin-min-emperor', min_surrender, '316年晋愍帝在长安出降。'), campaign_year, campaign, yixi_anchor)
    profile('luoyang', '《晋书·地理志》记晋继续居于魏都，并在河南郡洛阳县条描述宫城城门和司隶校尉、河南尹等官署在城内。311年永嘉之乱中洛阳陷落、晋怀帝被俘，是西晋都城史的断裂点；这不等于西晋已在311年结束。',
            '河洛', '这里阅读汉魏洛阳故城的晋代阶段，不能直接把史籍城门描述套到隋唐洛阳城或现代城区。',
            geography('014', '河南郡', '洛陽'), ('jin-geography-014', '晉仍居魏都，乃以三輔還屬雍州，分河南立滎陽，分雍州之京兆立上洛，廢東郡立頓丘，遂定名司州，以司隸校尉統之。', '晋沿用魏都及司州分合，不把全段当作一项单年改制。'), ('jin-yongjia', luoyang_fall, '311年洛阳失守、怀帝被俘与316年西晋灭亡须分开。'))
    profile('beijing', '《晋书·地理志》幽州燕国的县目列有蓟、广阳等县，范阳国县目另列涿县。蓟县、燕国和幽州分别属于县、郡国与州的层次，不能把古燕国边界等同于现代北京，也不能因为县目中蓟排列在前就判定全部晋代都在此设州治。',
            '幽燕', '蓟与涿是不同县名；本轮不采百科关于西晋蓟城降为县治、州治迁涿的概括，尚需另核具体时期。',
            geography('014', '燕國', '薊'), geography('014', '范陽國', '涿'))
    profile('kaifeng', '《晋书·地理志》在兖州陈留国下列浚仪县，并提及与浚仪相关的鸿沟。这里补的是浚仪的县目入口；陈留国不等于浚仪县，也不能把西汉开封县、魏晋浚仪县和后世开封府都解释为同一套辖界。',
            '中原', '原文写洪沟，正文按常见名称说明为鸿沟；县目未证明当时河道的精确走向，本轮不补绘。',
            geography('014', '陳留國', '浚儀'))
    profile('hangzhou', '《晋书·地理志》将钱唐列在吴郡，将临安、余杭列在吴兴郡，并在钱唐条提到武林山、武林水。这与汉代钱唐列属会稽郡的县目不同，也说明现代杭州地区不能只用一个后世杭州府名来概括。',
            '浙江', '钱唐沿用古名唐字；钱唐与余杭分别列县，武林山水的文字记录不等于已核定古代山界、水道。',
            geography('015', '吳郡', '錢唐'), geography('015', '吳興郡', '余杭'), ('han-geography', '會稽郡，戶二十二萬三千三十八，口百三萬二千六百四。縣二十六：吳，曲阿，烏傷，毗陵，餘暨，陽羨，諸暨，無錫，山陰，丹徒，餘姚，婁，上虞，海鹽，剡，由拳，大末，烏程，句章，餘杭，鄞，錢唐，鄮，富春，冶，回浦。', '只用于对照汉代会稽郡的阶段，不把两部地志视为同一截面。'))
    profile('guangzhou', '《晋书·地理志》广州部分在南海郡下列番禺、四会、增城等县；现有城市史材料也概述晋及南北朝以番禺为南海郡治。阅读时应区分广州这个州域、南海郡与番禺县，本轮补充建置层次，不把后世广东省界当作晋广州边界。',
            '岭南', '广州、南海郡、番禺是不同层级；县目和城市史只能支持所述阶段，不能用来确认每一年州治的位置。',
            geography('015', '南海郡', '番禺'), ('guangzhou', '晋、南北朝沿用南海郡，番禺为郡治。', '百科概述番禺的南海郡治角色，未扩展到精确坐标。'))
    profile('yangzhou', '《晋书·地理志》广陵郡县目分别列广陵、江都等县。东晋的流民与侨置州郡改变了江淮行政格局，地志又记郗鉴曾镇广陵、苏峻平后还镇京口；广陵与京口、侨置辖属与原有郡县需要分开理解。',
            '江淮', '古扬州是大区名称，广陵是此处城市阅读入口；广陵县和江都县并非同一个县的别名，京口也不是广陵。',
            geography('015', '廣陵郡', '廣陵'), ('jin-geography-015', '郗鑒都督青兗二州諸軍事、兗州刺史，加領徐州刺史，鎮廣陵。蘇峻平後，自廣陵還鎮京口。', '郗鉴在广陵和京口的前后驻地，不据此自行补确切年份。'))
    profile('xiangyang', '《晋书·地理志》襄阳郡下列襄阳县，县与郡须分层理解。西晋羊祜镇守襄阳的阶段已有节点；到东晋太元三年即378年，前秦出兵围攻，次年襄阳失守、朱序被俘，不能把这座城在两晋期间都画作稳定的晋辖城市。',
            '荆楚', '襄阳城与襄阳郡不是同一范围，襄阳与隔汉水的樊城也不是同一个城址。',
            geography('015', '襄陽郡', '襄陽'), ('xiangyang', '东晋太元三年（378年）二月，前秦王苻坚派遣征南大将军苻丕、武卫将军苟苌、尚书慕容目韦率步骑7万寇襄阳。第二年春，攻克襄阳，俘朱序，送往长安。', '仅取378年出兵与次年襄阳失守，不采用引文人名异写或兵数作为新增事实。'))
    profile('jinyang', '《晋书·地理志》并州太原国县目列晋阳、阳曲、榆次等县。晋阳是县名，太原国则是包含多县的行政单元；不能因为现代太原常与晋阳并称，就将地志中的整个太原国缩成一个城市点或套用现代市界。',
            '河东', '晋阳与太原国分层记录，本轮不从县名排列推定都城、州治，也不将春秋晋国的晋字与两晋王朝混淆。',
            geography('014', '太原國', '晉陽'))
    profile('datong', '《晋书·地理志》的雁门郡县目列有平城，但同名县目本身不足以把当时县治准确定位到现今大同。398年北魏迁都平城则是东晋同时期另一政权的历史，已有大事记入口；这不能作为平城当时属于东晋的依据。',
            '塞北', '区分西晋县目中的平城和398年的北魏都城阶段；郡县可能迁置，本轮不确认两者古址完全相同。',
            geography('014', '雁門郡', '平城'), ('datong', '北魏天兴元年（398）七月迁都于平城（今大同市内），又称“代京”。', '398年为北魏迁都，不是东晋设都或晋辖建置。'))
    profile('linzi', '《晋书·地理志》青州齐国县目列临淄。该段转录所附校勘说明齐国、北海、济南有关文字存在脱漏、错接问题，因此本轮只采用临淄列入齐国县目的信息，不把存疑段落继续拼成精确郡国沿革或辖境。',
            '齐鲁', '临淄、青州与齐国分属城市、州、郡国层次；后世益都和现代青州市也不能凭名称直接替代临淄古城。',
            geography('015', '齊國', '臨淄'))
    profile('handan', '《晋书·地理志》把邯郸列在广平郡县目，把邺列在魏郡县目，两者是不同的郡县关系。阅读西晋及十六国时期河北城市史时，不能因为邺城遗址位于今天的邯郸市域，就把后赵、冉魏、前燕等建都邺城的故事都定位在邯郸县点上。',
            '河北', '邯郸县、广平郡与魏郡邺县分别理解；本轮不把现代行政区覆盖范围视为古代同城的证明。',
            geography('014', '廣平郡', '邯鄲'), geography('014', '魏郡', '鄴'))
    profile('tongguan', '《宋书·武帝纪》在义熙十三年条记檀道济等到潼关，随后记王镇恶由黄河入渭、攻克长安。义熙元年为405年，十三年换算为417年；这是刘裕在东晋时北伐后秦的阶段，书名宋书不表示事件已经属于刘宋。',
            '关中', '潼关是关隘入口；本轮只补行军经过的文献，不把今天的关城遗存或旅游复建区当作417年关址，也不据行军文字画精确路线。',
            campaign_year, campaign, yixi_anchor)
    profile('dunhuang', '《晋书·地理志》凉州敦煌郡县目列敦煌、龙勒、阳关等县，后文又追述河西各政权分据以及西凉在敦煌建号。已有400年李暠建西凉节点可以继续阅读，但敦煌列在两晋页面并不表示整个时期都由晋廷直接控制。',
            '河西', '敦煌县、敦煌郡与西凉都城是不同层次；本轮不采用前秦二年即366年开凿莫高窟的混乱纪年，也不据古籍县目补造西域边界。',
            geography('014', '敦煌郡', '敦煌'), ('jin-geography-014', '武昭王爲西涼，建號於敦煌。禿髮烏孤爲南涼，建號於樂都。沮渠蒙遜爲北涼，建號於張掖。而分據河西五郡。', '河西不同政权分据及西凉在敦煌建号，不据此给各政权套同一年。'))

    node('luoyang', 'luoyang-fall-311', 311, '永嘉之乱，洛阳失守', '洛阳陷落，晋怀帝被俘。此后晋愍帝在长安即位，西晋延续至316年；本节点不把311年直接称为西晋灭亡年，也不据概述材料补绘战线或统计伤亡。', '西晋311年（永嘉五年）', ('jin-yongjia', luoyang_fall, '311年的洛阳陷落与怀帝被俘。'))
    node('changan', 'changan-min-accession-313', 313, '晋愍帝在长安即位', '洛阳失守后，晋怀帝遇害的消息于313年传到长安，司马邺即帝位、改元建兴。这里呈现的是西晋后期在长安的短暂朝廷，不能倒推成280年已经在长安建都。', '西晋313年（建兴元年）', ('jin-min-emperor', min_accession, '313年长安即位。'))
    node('changan', 'changan-surrender-316', 316, '长安失守，晋愍帝出降', '长安遭围困后，晋愍帝于316年出降，西晋结束。地图仍定位到长安地区参考点，不将出降的东门或史料中的围城营地画成已确认遗址。', '西晋316年（建兴四年）', ('jin-min-emperor', min_surrender, '316年愍帝在长安出降。'), ('jin-min-emperor', '316年劉曜陷長安，西晉滅亡，漢趙昭武帝劉聰降封懷安侯，後被殺。', '长安失守与西晋结束；被杀发生在其后，不混为316年。'))
    node('nanjing', 'nanjing-jianye-282', 282, '建业改名建邺', '所引城市史将改名系于太康三年即282年。因此默认280年仍显示建业，不能把后来建邺或建康的名称提前到灭吴当年；本条不据改名推断城址另迁。', '西晋282年（太康三年）', ('nanjing', nanjing_rename, '282年改建邺、313年改建康的先后。'))
    node('nanjing', 'nanjing-jiankang-313', 313, '建邺改名建康', '313年建邺改名建康，先于司马睿317年称晋王与318年称帝。城市改名和东晋朝廷建立分开呈现，不把它们合成同一年的事件。', '西晋313年（建兴元年）', ('nanjing', nanjing_rename, '313年建康改名。'))
    node('nanjing', 'nanjing-jin-king-317', 317, '司马睿在建康称晋王', '司马睿在建康称晋王、备百官、立社稷，改元建武，是通常所说东晋建立的317年节点。此时尚未称帝；318年晋愍帝死讯传到建康后，司马睿才即皇帝位。', '东晋317年（建武元年）', ('jin-yuan-emperor', yuan_accession, '317称晋王与318称帝分开；只取死讯传到建康的年份，不把原句同年遇害换成公历317。'), related_event='eastern-jin')
    node('nanjing', 'nanjing-emperor-318', 318, '司马睿在建康称帝', '晋愍帝死讯传到建康后，司马睿即皇帝位、改元太兴。此条与317年称晋王并列，让东晋建立和皇帝即位的两个纪年可以分别阅读。', '东晋318年（太兴元年）', ('jin-yuan-emperor', yuan_accession, '318年在建康即帝位。'))
    node('chengdu', 'chengdu-li-xiong-306', 306, '李雄在成都称帝，国号大成', '李雄在成都称帝，国号大成。这是与西晋同时存在的政权，不能因节点归在两晋时间段就说成都在306年仍由晋直接管辖；本条也不把后来成汉的汉号提前使用。', '两晋同期306年（西晋光熙元年）', ('chengdu', '光熙元年（306年），李雄在成都自立为帝，国号大成。', '306年李雄称帝及当时国号。'))
    node('chengdu', 'chengdu-huan-wen-347', 347, '桓温灭成汉，成都归东晋', '桓温攻灭成汉，成都重新归于东晋所领益州。此节点只对应347年的政权转换，不将其后前秦、谯蜀等阶段都写作东晋稳定直辖。', '东晋347年（永和三年）', ('chengdu', '永和三年（347年），成汉为东晋桓温所攻灭，成都重新成为东晋所领的益州。', '347年成汉灭亡与成都控制权变化。'))
    attack = '东晋太元三年（378年）二月，前秦王苻坚派遣征南大将军苻丕、武卫将军苟苌、尚书慕容目韦率步骑7万寇襄阳。第二年春，攻克襄阳，俘朱序，送往长安。'
    node('xiangyang', 'xiangyang-attack-378', 378, '前秦出兵围攻襄阳', '前秦出兵围攻襄阳，围城延续到次年。将出兵与城破分为两个节点，避免把378年的攻势提前写成襄阳已经陷落。', '东晋378年（太元三年）', ('xiangyang', attack, '378年出兵与次年城破的先后。'))
    node('xiangyang', 'xiangyang-fall-379', 379, '襄阳失守，朱序被俘', '据所引材料，378年出兵后的第二年春，前秦攻克襄阳，朱序被俘并送往长安。379年由原文的次年关系换算，不把这个节点当成整个襄阳郡边界已能复原。', '东晋379年（太元四年）', ('xiangyang', attack, '378年的第二年即379年，支持城破与朱序被俘。'))
    node('tongguan', 'tongguan-tan-daoji-417', 417, '檀道济等军到潼关', '《宋书·武帝纪》义熙十三年二月记檀道济等到潼关。这里的次是驻至之意，不等同于当天攻陷关城；按义熙元年405年换算为417年，也不将旧历二月直接换为公历二月。', '东晋417年（义熙十三年二月）', campaign_year, campaign, yixi_anchor)
    node('changan', 'changan-wang-zhen-e-417', 417, '王镇恶攻克长安，后秦覆亡', '义熙十三年，王镇恶攻克长安、生擒姚泓，随后刘裕抵达长安。此时仍属东晋时期；纪传收在宋书中，不表示刘宋已经建立。节点采用417年，不据这一胜利推定关中此后一直由东晋稳定控制。', '东晋417年（义熙十三年）', campaign_year, campaign, yixi_anchor, ('jin-yixi', '义熙十三年——刘裕北伐，占领长安，后秦亡。', '后秦覆亡的阶段。'))

    excluded = [
        {'placeId': 'beijing', 'candidate': '西晋蓟降县治、幽州迁涿及前燕迁都年份', 'reason': '城市百科叙述与常见年表有冲突，先采郡县分层，不生成迁治节点。'},
        {'placeId': 'chengdu', 'candidate': '304年李雄首次攻陷成都', 'reason': '夺城、称成都王的303/304年阶段不能混写，本轮仅补306称帝、347灭成汉。'},
        {'placeId': 'dunhuang', 'candidate': '前秦二年（366年）开凿莫高窟', 'reason': '年号不完整且建窟传说需另核，不生成确定创凿节点。'},
        {'placeId': 'linzi', 'candidate': '齐国、北海、济南的完整郡界与改名年表', 'reason': '地理志校勘记提示脱漏错接，未据此重建辖境或新增改名纪年。'},
        {'placeId': 'datong', 'candidate': '398年平城为东晋都城', 'reason': '398年属北魏迁都，保留已有节点而不重复、不改称东晋建置。'},
        {'placeId': 'nanjing', 'candidate': '317年司马睿已经称帝', 'reason': '细分317称晋王与318即帝位；愍帝遇害旧历年与公历年不强行合并。'},
    ]
    return {'sources': list(sources.values()), 'profiles': profiles,
            'cityTimelines': [{'placeId': key, 'entries': value} for key, value in timelines.items()],
            'excludedCandidates': excluded}

def merge_sources(existing, additions):
    result = {item["id"]: item for item in existing}
    for item in additions:
        if item["id"] in result:
            assert result[item["id"]]["snapshotSha256"] == item["snapshotSha256"]
        else:
            result[item["id"]] = item
    return list(result.values())


def merge_content(profile_data, context_data, pack):
    profiles, context = deepcopy(profile_data), deepcopy(context_data)
    by_profile = {item["id"]: item for item in profiles["profiles"]}
    by_profile.update({item["id"]: item for item in pack["profiles"]})
    profiles["profiles"] = list(by_profile.values())
    profiles["sources"] = merge_sources(profiles["sources"], pack["sources"])
    by_city = {item["placeId"]: item for item in context["cityTimelines"]}
    for addition in pack["cityTimelines"]:
        current = by_city.setdefault(addition["placeId"], {"placeId": addition["placeId"], "entries": []})
        entries = {item["id"]: item for item in current["entries"]}
        entries.update({item["id"]: item for item in addition["entries"]})
        current["entries"] = sorted(entries.values(), key=lambda item: (item["year"], item["id"]))
    context["cityTimelines"] = list(by_city.values())
    context["sources"] = merge_sources(context["sources"], pack["sources"])
    return profiles, context


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--output-root", type=Path, default=ROOT)
    args = parser.parse_args()
    pack = build_pack()
    audit = {"periodId": "jin", "profiles": len(pack["profiles"]),
             "profilePlaceIds": [item["placeId"] for item in pack["profiles"]],
             "datedEntries": sum(len(city["entries"]) for city in pack["cityTimelines"]),
             "sourceCount": len(pack["sources"]),
             "quotesMatched": sum(len(item["evidence"]) for item in pack["profiles"]) + sum(len(item["evidence"]) for city in pack["cityTimelines"] for item in city["entries"]),
             "excludedCandidates": pack["excludedCandidates"],
             "limitations": "《晋书》《宋书》电子转录未与刻本或点校本校勘；百科为固定修订概述材料，不以文本核定古址辖界，不将两晋同时期政权一概视为晋辖。"}
    if not args.check:
        profiles, context = merge_content(read(ROOT / "public/data/city-period-profiles.json"), read(ROOT / "public/data/historical-context.json"), pack)
        dump(args.output_root / "public/data/city-period-profiles.json", profiles)
        dump(args.output_root / "public/data/historical-context.json", context)
        dump(args.output_root / "data/evidence/jin-expansion-validation.json", audit)
    print(json.dumps(audit, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
