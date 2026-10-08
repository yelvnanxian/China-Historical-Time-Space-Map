#!/usr/bin/env python3
"""Merge sourced Three Kingdoms reading; --check validates without publishing.

No county seats, geometries, or definite years are inferred from later gazetteers.
"""
import argparse
from copy import deepcopy
import hashlib
import json
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'data/evidence/historical-context'


def read(path):
    return json.loads(path.read_text())


def dump(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


def build_pack():
    places = {item['id']: item for item in read(ROOT / 'data/catalog.json')['places']}
    sources, texts, profiles, timelines = {}, {}, [], {}

    def evidence(key, excerpt, supports):
        source_id = 'context-' + key
        if source_id not in sources:
            metadata = read(EVIDENCE / (key + '.json'))
            assert metadata['id'] == source_id
            snapshot = ROOT / metadata['snapshotPath']
            assert snapshot.resolve().is_relative_to(EVIDENCE.resolve())
            assert hashlib.sha256(snapshot.read_bytes()).hexdigest() == metadata['snapshotSha256']
            revision = metadata['revision']['revid']
            assert isinstance(revision, int) and revision > 0
            record = {k: metadata[k] for k in ('id', 'title', 'url', 'retrievedAt', 'note', 'snapshotPath', 'snapshotSha256')}
            if 'oldid=' not in record['url']:
                record['url'] = 'https://zh.wikipedia.org/w/index.php?title=' + quote(metadata['title'].removesuffix(' — 维基百科')) + '&oldid=' + str(revision)
                record['note'] += f' 本次读取页面修订号：{revision}。'
            sources[source_id] = record
            texts[source_id] = snapshot.read_text()
        assert excerpt in texts[source_id], f'Missing exact quote: {key}/{excerpt}'
        return {'sourceId': source_id, 'quote': excerpt, 'supports': supports}

    def profile(place_id, summary, region, naming_note, *quotes):
        assert 'sanguo' in places[place_id]['periodIds']
        refs = [evidence(*item) for item in quotes]
        profiles.append({
            'id': 'sanguo-' + place_id, 'placeId': place_id, 'periodId': 'sanguo',
            'summary': summary, 'region': region, 'namingNote': naming_note,
            'politicalContext': '本档案按汉末、曹魏、蜀汉、孙吴分期阅读，不把全部事实套到默认230年。220年以前属于汉末背景，266年起北方已进入西晋时期。本轮使用固定修订的古籍电子转录与百科快照；转录未与点校本校勘，百科不等于逐条原始史料考证。目录坐标仍为今地参考，不核定古城、官署位置或辖界。',
            'sourceIds': list(dict.fromkeys(item['sourceId'] for item in refs)), 'evidence': refs,
        })

    def node(place_id, suffix, year, title, summary, date_label, *quotes):
        assert 'sanguo' in places[place_id]['periodIds'] and 220 <= year <= 280
        refs = [evidence(*item) for item in quotes]
        timelines.setdefault(place_id, []).append({
            'id': 'sanguo-timeline-' + suffix, 'year': year, 'dateLabel': date_label,
            'title': title, 'summary': summary,
            'sourceIds': list(dict.fromkeys(item['sourceId'] for item in refs)), 'evidence': refs,
        })

    five_capitals = '改長安、譙、許昌、鄴、洛陽爲五都；'
    luoyang_palace = '十二月，初營洛陽宮，戊午幸洛陽。'
    changan_visit = '丁未，行幸長安。'
    ji_canal = '又脩廣戾陵渠大堨，水溉灌薊南北；三更種稻，邊民利之。'
    panyu = '三国时，吴国迁郡治回番禺，后又设为交州治所。交广分治后为广州治所。'
    guangzhou_first = '是歳，分交州置廣州。俄復舊。'
    guangzhou_again = '復分交州置廣州。'
    guangling_224 = '九月，遂至廣陵，赦青、徐二州，改易諸將守。'
    guangling_225 = '冬十月，行幸廣陵故城，臨江觀兵，戎卒十餘萬，旌旗數百里。'
    guangling_ice = '是歲大寒，水道冰，舟不得入江，乃引還。'
    jiangling_siege = '中軍、征南攻圍江陵，左將軍張郃等舳艫直渡，擊其南渚，賊赴水溺死者數千人，又爲地道攻城，城中外雀鼠不得出入，此几上肉耳！'
    jiangling_withdraw = '今開江陵之圍，以緩成死之禽。且休力役，罷省繇戍，畜養士民，咸使安息。'
    liang_xi = '文帝践阼，復置并州，復爲刺史，進封申門亭侯，邑百户；政治常爲天下最。'
    jinyang_seat = '晋阳县县城即晋阳城，秦至汉为太原郡治，东汉后又为并州治。'
    qiantang_title = '己丑，封孫皓爲烏程侯，皓弟德錢唐侯，謙永安侯。'
    linzi_title = '十九年，徙封臨菑侯。'
    linzi_change = '其年改封鄄城侯。三年，立為鄄城王，邑二千五百戶。'
    cangci_admin = '太和中，迁敦煌太守。郡在西陲，以丧乱隔绝，旷无太守二十岁，大姓雄张，遂以为俗。前太守尹奉等，循故而已，无所匡革。慈到，抑挫权右，抚恤贫羸，甚得其理。'
    cangci_trade = '欲诣洛者，为封过所，欲从郡还者，官为平取，辄以府见物与共交市，使吏民护送道路，由是民夷翕然称其德惠。'

    profile('changan', '曹魏时期，长安列入《三国志》裴注引《魏略》所记的五都，与洛阳、谯、许昌、邺并列；这并不表示五城同时承担相同的首都职能。太和二年（228年）魏明帝到长安，背景是诸葛亮出兵与关陇军事行动。仓慈在黄初末曾任长安令，也留下了城市治理的记载。',
            '关中', '长安、京兆与三辅属于不同尺度的称谓。本轮采用五都、帝王行幸与县令记录，不据它们重建228年的军队路线或城墙。',
            ('sanguo-weizhi2', five_capitals, '黄初二年条裴注引《魏略》的五都名单；不等同五座同时首都。'),
            ('sanguo-weizhi3', changan_visit, '太和二年条记魏明帝到长安，与附近三郡及街亭战事的叙述分开。'),
            ('sanguo-zhenghun', '黄初末，为长安令，清约有方，吏民畏而爱之。', '仓慈黄初末任长安令；黄初末不强配某个精确年份。'))
    profile('luoyang', '曹魏在黄初元年（220年）开始营建洛阳宫，曹丕随后到洛阳。《魏略》五都名单也列洛阳。这些记录展示了洛阳作为新政权政治中心的重建过程；地图上的现代洛阳参考点不能代替汉魏洛阳故城，更不能与隋唐洛阳城混同。',
            '河洛', '汉代雒阳与曹魏洛阳的用字变化见于裴注引《魏略》，改字不是城市迁到另一处；城市名称、宫城与都城辖区需要分别理解。',
            ('sanguo-weizhi2', luoyang_palace, '黄初元年十二月营建洛阳宫及曹丕到洛阳。'),
            ('sanguo-weizhi2', five_capitals, '洛阳列入五都的记载。'),
            ('sanguo-weizhi2', '故除「隹」加「水」，變「雒」爲「洛」。', '裴注引《魏略》解释雒、洛用字变化，不提供迁城证据。'),
            ('han-luoyang-site', '因隋炀帝在汉魏洛阳城西重新建隋唐洛阳城，因此又被称为汉魏洛阳故城。', '汉魏故城与后来的隋唐城不能混同。'))
    profile('beijing', '曹魏沿用幽州建制，百科材料将蓟城记为州治。《三国志·刘靖传》还记刘靖修筑戾陵渠堨，引水灌溉蓟城南北，并称边民受益。州治与灌溉工程提供了政治、农业两种阅读角度；原文未给工程确年，本轮不把它直接标成230年发生。',
            '幽燕', '蓟城、幽州与现代北京市不是同一辖区。所引“蓟南北”是灌溉联系，不足以描绘古渠完整路线；“三更种稻”保留原文，不直接解释为现代复种制度。',
            ('beijing-history', '曹魏政权继承东汉幽州建制，以蓟城为州治。', '百科关于曹魏幽州与蓟城的概述；未据此核定官署位置。'),
            ('sanguo-liangxi', ji_canal, '刘靖修渠和灌溉蓟城南北的记载；没有精确开工、完工年。'))
    profile('hangzhou', '孙吴永安元年（258年），孙休即位后的封爵记录中有孙德为钱唐侯。它为钱唐这一县名在孙吴时期的使用提供了文献线索，也提示今杭州地区应通过钱唐等古县名阅读。封侯记载不等于孙德亲自到钱唐任官，不能据此推定县城、封国辖境或人口。',
            '浙江', '钱唐是本期原名，不能提前写成后世杭州州名。258年封爵不是钱唐县的初置年，也不证明默认230年的县治位置。',
            ('sanguo-wusansi', qiantang_title, '《三嗣主传》孙休永安元年条所记孙德封钱唐侯；只支持名称与封爵。'),
            ('sanguo-wusansi', '永安元年（258年）', '电子转录所示永安元年与258年的对应。'))
    profile('guangzhou', '孙吴番禺的阅读需要区分城市与州名：黄武五年（226年）曾分交州置广州，史文紧接“俄复旧”；永安七年（264年）又复分交州置广州。因此不能把264年后的广州州治身份直接套到默认230年。番禺则是这一地区的城市名称与南海郡治沿革入口。',
            '岭南', '地图默认230年宜以番禺作为城市阅读名；广州作为现代地区参考名，与226年短置、264年复置的州级名称分别理解。本轮不据“复旧”臆定具体撤州月日。',
            ('guangzhou', panyu, '番禺与交州、广州治所的分期概述；不据三国统称确定230的每一项驻所。'),
            ('sanguo-wuzhu', guangzhou_first, '《吴主传》黄武五年条：分置广州之后旋即恢复旧制。'),
            ('sanguo-wusansi', guangzhou_again, '《三嗣主传》孙休永安七年条：再次分置广州。'))
    profile('yangzhou', '曹魏黄初五年（224年），曹丕出巡到广陵；次年又到广陵故城临江观兵，史文记大寒、水道结冰，船不能入江而撤还。广陵因此可以从魏、吴对峙时期的军事交通来理解。本轮只呈现史书记载，不把古代江岸、水道或故城位置直接套成现代扬州的轮廓。',
            '江淮', '广陵城不等于古代扬州州域，也不等于今天扬州市。原文“临江”未提供古江岸线，224年与225年两次行动分别记录。',
            ('sanguo-weizhi2', guangling_224, '黄初五年九月曹丕到广陵。'),
            ('sanguo-weizhi2', guangling_225, '黄初六年十月在广陵故城临江观兵；不核定故城遗址。'),
            ('sanguo-weizhi2', guangling_ice, '同年大寒、结冰及撤军记载，不据此绘制古河道。'))
    profile('jingzhou', '魏、吴交战时，江陵是需要具体辨认的一座城。《文帝纪》所引黄初四年（223年）诏书记魏军围攻江陵，并说明解除围城、让军民休息。这一记录关注城池攻守及战争负担，不把赤壁、樊城等其他战场都放进江陵城内。',
            '荆楚', '江陵城、南郡与荆州地域不同。223年围城材料来自魏方诏书，其夸饰性的战果和判断属于当事方说辞，本轮不当作双方一致核定的战损。',
            ('sanguo-weizhi2', jiangling_siege, '《文帝纪》黄初四年条裴注引《魏书》诏书所记江陵围城；保留魏方视角。'),
            ('sanguo-weizhi2', jiangling_withdraw, '魏方解除江陵之围的记载，不采用夸饰性胜败断语。'))
    profile('jinyang', '晋阳的三国阅读与并州治理相联系。《三国志·梁习传》记曹丕即位后恢复并州，梁习再任刺史，直到太和二年（228年）征为大司农。县名条目另记晋阳东汉后为并州治；两种材料分别说明地区治理和城市角色，不把梁习任职自动当作230年官署位置的证明。',
            '河东', '晋阳县、晋阳城、太原郡与并州不是同一层级。后世晋阳城扩建和唐代北京地位不提前到曹魏；228年之后的刺史变化仍待逐年补证。',
            ('sanguo-liangxi', liang_xi, '曹丕即位、复置并州、梁习复任刺史的记载。'),
            ('sanguo-liangxi', '太和二年（228年）', '转录所列太和二年对应228年。'),
            ('sanguo-liangxi', '徵拜大司农。習在州二十餘年，而居處贫窮，無方面珍物，明帝異之，礼赐甚厚。', '梁习征为大司农及任内形象，不能倒推州治空间。'),
            ('sanguo-jinyang', jinyang_seat, '县名条目的郡、州治概述；精确年份与官署位置仍未核定。'))
    profile('datong', '三国时期的今大同地区，百科材料记有乌桓、鲜卑等部族占据。这个塞北入口有助于避免把北方所有地点都按曹魏常规郡县来阅读，但该概述没有给出逐年部族分布或平城县继续建置的证据，因此230年的具体控制权仍待核实。',
            '塞北', '这里的平城是目录的历史名称入口，“今大同地区”的部族活动不能自动等同平城县城中的政权更替。北魏398年迁都平城属于更晚时期，不提前为三国都城。',
            ('datong', '三国时期大同为乌桓、鲜卑等部族占据。', '仅支持今大同地区的部族活动概述，不证明某部族在230年占有平城县城。'),
            ('datong', '北魏天兴元年（398）七月迁都于平城（今大同市内），又称“代京”。', '用于区分三国地区背景与398年以后的北魏都城身份。'))
    profile('linzi', '临淄与曹植的封爵沿革相联系：《三国志》记建安十九年（214年）曹植徙封临菑侯，黄初二年（221年）受贬后改封鄄城侯。这一跨期记录说明临菑侯称号属于汉末到曹魏初的一段经历，不能把曹植终身都写成临淄之主，更不能将战国齐国都城身份沿用到230年。',
            '山东', '史籍“临菑”与今天常用的临淄字形不同，引文保留菑字。侯爵封号不等同实际长期居住或县令任职；本轮不绘制封邑边界。',
            ('sanguo-caozhi', linzi_title, '建安十九年条所记曹植徙封临菑侯，属于汉末背景。'),
            ('sanguo-caozhi', '黃初二年，監國謁者灌均希指，奏『植醉酒悖慢，劫脅使者』。有司請治罪，帝以太后故，貶爵安鄉侯。', '后段改封的年号上下文，黄初二年为221年。'),
            ('sanguo-caozhi', linzi_change, '受贬后的当年改封鄄城，次年立为王；不把临菑侯称号无限延长。'))
    profile('dunhuang', '曹魏太和年间，仓慈出任敦煌太守。《三国志》记他处理豪强占田与贫民缺地、亲自审理诉讼，还为前往洛阳的西域商旅开具通行文书，为返程者组织交易和护送。这里展示的是敦煌郡的地方治理与交通联系，不把郡域事务全部缩成敦煌城内发生。',
            '河西', '太和中是时段，不能替仓慈任职、土地措施或护送道路补造某个具体年份。敦煌郡、郡治与现代敦煌市范围不等同，本轮不定位古驿路。',
            ('sanguo-zhenghun', cangci_admin, '仓慈任敦煌太守及治理背景；未给出精确任职年份。'),
            ('sanguo-zhenghun', '旧大族田地有餘，而小民无立锥之土；慈皆随口割赋，稍稍使毕其本直。', '郡域土地治理记录，不直接转换为现代土地制度或城内人口。'),
            ('sanguo-zhenghun', cangci_trade, '商旅通行、交市与护送的具体记载；不提供可绘制的道路几何。'))

    node('luoyang', 'luoyang-palace-220', 220, '曹魏开始营建洛阳宫', '《文帝纪》黄初元年十二月记开始营建洛阳宫，曹丕随后到洛阳。按黄初元年归入220年，不换算旧历月日；这是宫城营建和行幸记录，不把曹魏受禅地点认作洛阳。', '魏黄初元年（220年）',
         ('sanguo-weizhi2', '其以延康元年爲黃初元年，議改正朔，易服色，殊徽號，同律度量，承土行，大赦天下；', '本段黄初元年纪年，换算为220年。'), ('sanguo-weizhi2', luoyang_palace, '该年十二月营宫、行幸洛阳。'))
    node('changan', 'changan-five-capitals-221', 221, '长安列入曹魏五都', '《文帝纪》黄初二年条裴注引《魏略》，列长安、谯、许昌、邺、洛阳为五都。本条记录名号与政治地位，不把五都解释成五座职能相同的首都。', '魏黄初二年（221年）',
         ('sanguo-weizhi2', '二年春正月，郊祀天地、明堂。', '黄初纪年连续条目中的二年。'), ('sanguo-weizhi2', five_capitals, '该条裴注引《魏略》五都名单。'))
    node('changan', 'changan-imperial-visit-228', 228, '魏明帝到长安', '《明帝纪》太和二年记诸葛亮出兵、曹魏调兵及街亭战事，并记魏明帝到长安。本节点仅定位长安阅读入口，不把街亭战场放在长安城中。', '魏太和二年（228年）',
         ('sanguo-weizhi3', '二年春正月，宣王攻破新城，斬達，傳其首。', '太和纪年连续条目中的二年。'), ('sanguo-weizhi3', changan_visit, '同年魏明帝行幸长安。'))
    node('yangzhou', 'guangling-visit-224', 224, '曹丕出巡到广陵', '《文帝纪》记黄初五年曹丕经淮水、寿春，九月到广陵。本条保留原文记载的交通联系，不据现代河道重建船队路线。', '魏黄初五年（224年）',
         ('sanguo-weizhi2', '五年春正月，初令謀反大逆乃得相告，其餘皆勿聽治；', '黄初五年条纪年。'), ('sanguo-weizhi2', guangling_224, '该年九月到广陵。'))
    node('yangzhou', 'guangling-ice-225', 225, '广陵临江观兵，遇冰撤还', '《文帝纪》黄初六年记曹丕在广陵故城临江观兵，并因大寒、水道结冰、船不能入江而撤还。本条不把原文兵数作为现代统计，也不核定当时江岸位置。', '魏黄初六年（225年）',
         ('sanguo-weizhi2', '六年春二月，遣使者循行許昌以東盡沛郡，問民所疾苦，貧者振貸之。', '黄初六年条纪年。'), ('sanguo-weizhi2', guangling_225, '同年在广陵故城观兵。'), ('sanguo-weizhi2', guangling_ice, '同年因水道冰而撤还。'))
    node('jingzhou', 'jiangling-siege-223', 223, '魏军解除江陵之围', '《文帝纪》黄初四年条引魏方诏书，记录围攻江陵后解除围城，并提出休息军民。本轮只采用攻守变化，不将魏方夸张战果当作已经交叉核验的结论。', '魏黄初四年（223年）',
         ('sanguo-weizhi2', '四年春正月，詔曰：', '黄初四年条的纪年。'), ('sanguo-weizhi2', jiangling_withdraw, '该条诏书明言解除江陵之围。'))
    node('guangzhou', 'guangzhou-short-establishment-226', 226, '孙吴分置广州，旋即复旧', '《吴主传》黄武五年条记分交州置广州，紧接着记“俄复旧”。本条保留设而复旧的完整过程，不把广州州级建置从226年起画作连续存在。', '吴黄武五年（226年）',
         ('sanguo-wuzhu', '五年春，令曰：', '黄武五年条的纪年，换算为226年。'), ('sanguo-wuzhu', guangzhou_first, '当年置广州与旋即复旧的完整记载。'))
    node('guangzhou', 'guangzhou-restored-264', 264, '孙吴再次分交州置广州', '《三嗣主传》孙休永安七年记复分交州置广州。这个晚期建置变化晚于默认230年，不能用来提前认定230年的州名、州治或边界。', '吴永安七年（264年）',
         ('sanguo-wusansi', '七年春正月，大赦。', '孙休永安七年条的纪年。'), ('sanguo-wusansi', guangzhou_again, '该年再次分置广州。'))
    node('hangzhou', 'qiantang-marquis-258', 258, '孙德获封钱唐侯', '《三嗣主传》永安元年记孙皓之弟孙德封钱唐侯。本条是封爵与地名沿革线索，不表示孙德到任治理钱唐，也不是钱唐县在这一年初置。', '吴永安元年（258年）',
         ('sanguo-wusansi', '永安元年（258年）', '永安元年与258年的对应。'), ('sanguo-wusansi', qiantang_title, '孙德封钱唐侯。'))

    return {
        'sources': list(sources.values()), 'profiles': profiles,
        'cityTimelines': [{'placeId': key, 'entries': value} for key, value in timelines.items()],
        'excludedCandidates': [
            {'placeId': 'kaifeng', 'topic': '浚仪在曹魏的确切县属与治所', 'reason': '现有材料详述202年汉末水运背景，未取得足够本期城市事实；不从西晋太康县目倒推230年。'},
            {'placeId': 'handan', 'topic': '邯郸与邺城的三国沿革', 'reason': '现有百科混写现代邯郸市域与邺城，并把曹操据邺统称三国；不能把邺城建都、宫台放在邯郸城。'},
            {'placeId': 'tongguan', 'topic': '潼关三国档案', 'reason': '现有入口只足以支持196年始建这一汉末记录，不新增缺乏本期史实的占位档案。'},
            {'placeId': 'guangzhou', 'topic': '217年“吴建安”与230年广州州治', 'reason': '217年仍属汉末，226年置广州后俄复旧，264年才复置；不将三国统称和后期州治身份提前。'},
            {'placeId': 'datong', 'topic': '230年平城县属国与精确控制权', 'reason': '百科只支持今大同地区有乌桓、鲜卑活动，未支持230年平城县持续建置或某部族精确占城。'},
            {'placeId': 'dunhuang', 'topic': '仓慈任职年与道路几何', 'reason': '原文仅称太和中，不能挑选某一年做节点；商旅护送也不提供可绘制的古道。'},
            {'placeId': 'beijing', 'topic': '刘靖修戾陵渠确年', 'reason': '原文无精确工程年，人物254年去世不能当作修渠年。'},
            {'placeId': 'nanjing', 'topic': '孙吴229年迁都建业', 'reason': '已有nanjing-wu-229，保留旧节点，不重复创建。'},
            {'placeId': 'chengdu', 'topic': '刘备221年称帝', 'reason': '已有chengdu-shuhan-221，保留旧节点，不重复创建。'},
        ],
    }

def merge_sources(existing, additions):
    result = {source["id"]: source for source in existing}
    for source in additions:
        if source["id"] in result:
            assert result[source["id"]]["snapshotSha256"] == source["snapshotSha256"]
        else:
            result[source["id"]] = source
    return list(result.values())


def merge_content(profile_data, context_data, pack):
    """Replace only this batch's owned IDs, preserving earlier published records."""
    profiles, context = deepcopy(profile_data), deepcopy(context_data)
    by_profile = {item["id"]: item for item in profiles["profiles"]}
    by_profile.update({item["id"]: item for item in pack["profiles"]})
    profiles["profiles"] = list(by_profile.values())
    profiles["sources"] = merge_sources(profiles["sources"], pack["sources"])
    by_city = {item["placeId"]: item for item in context["cityTimelines"]}
    for addition in pack["cityTimelines"]:
        current = by_city.setdefault(addition["placeId"], {"placeId": addition["placeId"], "entries": []})
        entries = {entry["id"]: entry for entry in current["entries"]}
        entries.update({entry["id"]: entry for entry in addition["entries"]})
        current["entries"] = sorted(entries.values(), key=lambda entry: (entry["year"], entry["id"]))
    context["cityTimelines"] = list(by_city.values())
    context["sources"] = merge_sources(context["sources"], pack["sources"])
    return profiles, context



def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Verify sources without writing')
    args = parser.parse_args()
    pack = build_pack()
    catalog_places = [item['id'] for item in read(ROOT / 'data/catalog.json')['places'] if 'sanguo' in item['periodIds']]
    original = read(ROOT / 'public/data/city-period-profiles.json')
    covered = {item['placeId'] for item in original['profiles'] if item['periodId'] == 'sanguo'} | {item['placeId'] for item in pack['profiles']}
    audit = {
        'periodId': 'sanguo', 'profiles': len(pack['profiles']), 'profilePlaceIds': [item['placeId'] for item in pack['profiles']],
        'datedEntries': sum(len(city['entries']) for city in pack['cityTimelines']), 'sourceCount': len(pack['sources']),
        'quotesMatched': sum(len(item['evidence']) for item in pack['profiles']) + sum(len(item['evidence']) for city in pack['cityTimelines'] for item in city['entries']),
        'missingProfilePlaceIds': [item for item in catalog_places if item not in covered],
        'excludedCandidates': pack['excludedCandidates'],
        'limitations': '本轮补充文献阅读，不改变治所或边界；古籍电子转录未与点校本校勘。薄资料的平城、钱唐明确区分区域背景与确定县治，未把太康县目回填到230年。',
    }
    if not args.check:
        profile_path, context_path = ROOT / 'public/data/city-period-profiles.json', ROOT / 'public/data/historical-context.json'
        profiles, context = merge_content(read(profile_path), read(context_path), pack)
        dump(profile_path, profiles)
        dump(context_path, context)
        dump(ROOT / 'data/evidence/sanguo-expansion-validation.json', audit)
    print(json.dumps(audit, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
