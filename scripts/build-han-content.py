#!/usr/bin/env python3
"""Merge a bounded Han reading batch; --check validates without publishing.

The fixed Book of Han transcription supports county names and their listed
commandery/kingdom, never seat positions, polygons, or every year of the Han.
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

    def geography(district, county):
        # Keep the district heading with its complete list: the county alone
        # cannot support a historical parent relationship.
        text = (EVIDENCE / "han-geography.txt").read_text()
        lines = [line for line in text.splitlines() if line.startswith(district + "，") and county in line and "縣" in line]
        assert len(lines) == 1, (district, county)
        return ("han-geography", lines[0], f"《汉书·地理志》该郡国条目列有本县；只支持所记名称及隶属，不按县序推定治所，也不使用户口数推定城内人口。")

    def profile(place_id, summary, region, naming_note, *quotes):
        assert "han" in places[place_id]["periodIds"]
        refs = [evidence(*item) for item in quotes]
        profiles.append({
            "id": "han-" + place_id, "placeId": place_id, "periodId": "han",
            "summary": summary, "region": region, "namingNote": naming_note,
            "politicalContext": "本档案是西汉、东汉分期概览，不表示全部事实发生于默认公元2年。《汉书·地理志》还含沿革叙述，不能把全篇套作某一年不变的辖属。本轮引用固定修订的古籍电子转录及百科快照；转录未与点校本校勘，百科尚未完成原始史料交叉考证。目录坐标仍为现代地区参考点，不核定古城址或辖界。",
            "sourceIds": list(dict.fromkeys(item["sourceId"] for item in refs)), "evidence": refs,
        })

    def node(place_id, suffix, year, title, summary, key, excerpt, date_label):
        assert "han" in places[place_id]["periodIds"] and -202 <= year < 220 and year != 0
        ref = evidence(key, excerpt, title + "及概述中的直接事实；年份来自引文明确纪年。")
        timelines.setdefault(place_id, []).append({
            "id": "han-expansion-" + suffix, "year": year, "dateLabel": date_label,
            "title": title, "summary": summary, "sourceIds": [ref["sourceId"]], "evidence": [ref],
        })

    palace = "宫城建筑最初只有南宫，汉明帝永平三年至八年（60年—65年）于南宫以北新筑北宫，从而形成了南北二宫城相互对应居于城中的格局。"
    fire = "汉献帝初平元年（190年），雒阳城为董卓焚毁破坏。"
    nanjing = "东汉末年，割据江东的孙权于211年将治所移到秣陵，在金陵邑旧地筑石头城要塞，次年改秣陵为建业。"
    panyu = "汉武帝元鼎六年（前111年），汉朝征服南越国，设立九郡，其中南海郡治仍设在番禺。"
    ji = "汉和帝永元八年（公元96年）"
    ji_note = "永（平）〔元〕八年復　錢大昕考異謂據和帝紀，永元八年九月復，此「永平」當為「永元」之訛。殿本考證齊召南說同。今據改。"
    jinyang = "公元前201年春，刘邦认为韩王信封地乃兵家必争的战略重地，担心韩王信日后会构成威胁，便以防御匈奴为名，将韩王信封地迁至太原郡，以晋阳（今山西省太原市）为都。韩王信以“国被边，匈奴数入，晋阳去塞远”为由，上书请求把都城迁至马邑（今山西省朔州市朔城区），得到刘邦批准。"
    baideng = "白登之围是公元前200年（汉高祖七年）汉高祖刘邦被匈奴围困于白登山（今中国山西省大同市东北马铺山）的事件。"

    profile("luoyang", "西汉雒阳列在《汉书·地理志》的河南郡县目中。到东汉，洛阳地区的都城形成南、北宫并立的格局：北宫营建于60—65年，190年都城又遭董卓焚毁。西汉县目与东汉都城建筑属于不同阶段，不能把后来的宫城状态回填到公元2年。",
            "河洛", "雒阳是史籍中的用字；汉魏洛阳故城与隋唐洛阳城位置不同，本点只是现代洛阳地区的阅读入口。",
            geography("河南郡", "雒陽"), ("han-luoyang-site", palace, "东汉60—65年的北宫营建。"), ("han-luoyang-site", fire, "190年董卓焚毁雒阳。"),
            ("han-luoyang-site", "因隋炀帝在汉魏洛阳城西重新建隋唐洛阳城，因此又被称为汉魏洛阳故城。", "汉魏城与隋唐城位置不能混同。"))
    profile("beijing", "《汉书·地理志》的广阳国条目列蓟、方城、广阳、阴乡四县，蓟县是北京地区汉代沿革的重要入口。《后汉书》电子转录所附校勘记将广阳郡恢复建置的永平八年改为永元八年，即96年，依据为《和帝纪》；此事不应倒推为西汉广阳国全部时期的状态。",
            "幽燕", "蓟县、广阳国及东汉广阳郡是不同层级与时期的名称，不能当成北京整座现代城市的三个同义词。",
            geography("廣陽國", "薊"), ("beijing-history", ji, "永元八年与公元96年的对应，不引用同句关于驻所的判断。"),
            ("han-guangyang-textual-note", ji_note, "校勘记以《和帝纪》为据，将恢复广阳郡的永平八年改为永元八年；不据复郡推定郡治位置。"))
    profile("kaifeng", "西汉浚仪与开封是两个县名：《汉书·地理志》将浚仪列在陈留郡，将开封列在河南郡。阅读今开封地区的沿革时，应把两条县的记录分开；地图目录显示浚仪，不代表可以把两县的建置、故事或辖境合并成同一个汉代地点。",
            "中原", "浚仪县与开封县不等同；本点沿用现代开封地区参考坐标，未据本轮文字定位两处古县城。",
            geography("陳留郡", "浚儀"), geography("河南郡", "開封"))
    profile("nanjing", "《汉书·地理志》在丹扬郡下列秣陵县。东汉末孙权于211年迁治秣陵，次年改名建业，这是汉末地方政权的变化；不能把后来东吴都城的地位套到西汉，也不能把建业名称提前用在默认公元2年的地图上。",
            "江南", "秣陵与建业有先后阶段；211年迁治、212年改名分开记录，本轮不替材料中的石头城营建另定年份。",
            geography("丹揚郡", "秣陵"), ("nanjing", nanjing, "211年迁治秣陵及次年改建业，不据本句单独认定石头城筑城年。"))
    profile("hangzhou", "《汉书·地理志》会稽郡县目同时列有钱唐和余杭。今杭州地区在汉代需要通过这些县名分别理解，不能沿用后世杭州府或南宋临安都城的范围来解释。这里补充的是西汉县名与所属郡的文献入口，尚未核定古县城位置。",
            "浙江", "汉代钱唐的唐字沿用原名；钱唐、余杭是分别列出的县，不能把现代杭州市辖境当作钱唐县辖境。",
            geography("會稽郡", "錢唐"))
    profile("guangzhou", "番禺曾处于南越国统治下，直到前111年汉朝征服南越后，材料才记其继续作为汉南海郡治。《汉书·地理志》南海郡县目也列有番禺。汉代跨度很长，不能因目录将此地列入汉朝，就把前111年以前的番禺画成汉直接管辖的城市。",
            "岭南", "番禺县、南海郡治与现代广州市不是同一范围；本档案不把后世广州州名提前到西汉。",
            geography("南海郡", "番禺"), ("guangzhou", panyu, "前111年南越被汉征服及南海郡治仍在番禺。"))
    profile("yangzhou", "《汉书·地理志》广陵国条目分别列广陵、江都、高邮、平安四县，说明广陵与江都在这份县目中并非同一个县的两种写法。今扬州地区的历史阅读涉及这些名称，但目录中的江都参考点不足以确定两县治所或王国的空间范围。",
            "江淮", "目录沿用江都作为汉朝入口；不能据此把广陵县、江都县与广陵国合并，更不能把汉代扬州刺史部等同于今扬州市。",
            geography("廣陵國", "江都"))
    profile("xiangyang", "《汉书·地理志》将襄阳列在南郡县目中。东汉末刘表徙治襄阳，城市的行政角色随之变化；这两层记载分别帮助理解西汉县级建置与汉末的政治中心，不能据刘表时期的州治身份倒推公元2年的地图层级。",
            "荆楚", "襄阳县与汉末荆州治所属于不同层级，襄阳、樊城也不是可随意合并的一座古城。",
            geography("南郡", "襄陽"), ("xiangyang", "从荆州牧刘表徙治襄阳始，襄阳历来为府、道、州、路、县治所。", "刘表徙治襄阳；不把此后所有层级同时归给西汉。"),
            ("xiangyang", "襄阳自古分為汉水（沔水）南北两岸的襄城及樊城二城，隔汉江相望", "襄阳与樊城分处汉水两岸，不能混作同一城。"))
    profile("jingzhou", "《汉书·地理志》将江陵列在南郡县目中，并描述江陵西通巫、巴，东近云梦，是一处都会。这里的江陵县、南郡与后世常说的荆州需要分层阅读；文献中的交通联系有助于理解城市角色，却不能据此绘制南郡辖界。",
            "荆楚", "江陵是县名，南郡是所属郡；古代荆州的大区概念与现代荆州市边界不同，本轮不将其互相替换。",
            geography("南郡", "江陵"), ("han-geography", "江陵，故郢都，西通巫、巴，東有雲夢之饒，亦一都會也。", "仅取江陵交通联系与都会称述，不据故郢都字样认定楚都遗址或城址连续性。"))
    profile("jinyang", "《汉书·地理志》在太原郡下列晋阳县。汉初前201年，韩王信的封地迁至太原郡，以晋阳为都，随后又获准移都马邑；这一短期王国安排与西汉县目属于不同观察角度，不能把晋阳概括为汉代始终不变的代国都城或并州州府。",
            "河东", "此处韩王信是韩王，不能与淮阴侯韩信混淆；晋阳、太原郡与现代太原也不是同一空间层级。",
            geography("太原郡", "晉陽"), ("han-baideng", jinyang, "前201年韩王信迁封太原郡及先都晋阳、后请迁马邑。"))
    profile("datong", "《汉书·地理志》雁门郡县目中列有平城。前200年的白登之围则发生在平城附近的白登山，是汉初北部军事形势的重要事件；阅读时应区分县城与城外战场，不能将现代大同参考点直接当成围困地点。",
            "塞北", "平城县属于县级名称，白登山是战事地点；本轮补文献与纪年，不定位古战场范围。",
            geography("鴈門郡", "平城"), ("han-baideng", baideng, "前200年白登之围及其在今大同地区的概略对应。"))
    profile("linzi", "《汉书·地理志》齐郡县目列有临淄，现有城市史资料也保留秦汉时期临菑的异体写法。临淄的历史包含齐国旧都与汉代郡县两个层面；本轮先补可靠县目，不把封王先后不清的百科段落当作确定的建置年表。",
            "齐鲁", "目录用简体临淄；临菑是所引材料记载的秦汉写法，不因此改写当年地图名称或推定古城边界。",
            geography("齊郡", "臨淄"), ("linzi", "临淄，古称营丘，秦汉时作临菑。", "临淄与临菑的字形沿革；不涉及封王时间。"))
    profile("handan", "《汉书·地理志》在赵国县目下列邯郸，又称其北通燕、涿，南接郑、卫，是漳、河之间的都会。这提供了西汉邯郸的行政归属与交通阅读线索；县目中的邯郸、赵国和后来的邺城应分别理解，不能因都在今邯郸市域就合并为一座古城。",
            "河北", "邯郸县与赵国分属不同层级，邺城也不能用本点代替；本轮不采用百科所写首次降为县治的绝对断语。",
            geography("趙國", "邯鄲"), ("han-geography", "邯鄲北通燕、涿，南有鄭、衛，漳、河之間一都會也。", "邯郸的区域交通联系及都会称述。"))

    node("jinyang", "jinyang-hanwangxin-201", -201, "韩王信迁封太原，先都晋阳", "刘邦将韩王信封地迁至太原郡，以晋阳为都；韩王信认为晋阳距边塞较远，又获准迁都马邑。这里的韩王信不是淮阴侯韩信，本条不表示晋阳在整个西汉一直为其都城。", "han-baideng", jinyang, "西汉前201年")
    node("datong", "datong-baideng-200", -200, "白登之围", "汉高祖刘邦在平城附近的白登山遭匈奴围困。地图定位到现有大同地区参考点，用来阅读事件，不将该点认作白登山战场的实测坐标，也不补绘推测的包围路线。", "han-baideng", baideng, "西汉前200年（汉高祖七年）")
    node("guangzhou", "guangzhou-nanyue-111", -111, "汉征服南越，番禺仍为南海郡治", "汉武帝元鼎六年征服南越，所设九郡中南海郡治仍在番禺。这一节点区分南越时期与汉直接治理阶段，不把前111年以前的番禺一概归为汉郡治。", "guangzhou", panyu, "西汉前111年（元鼎六年）")
    node("luoyang", "luoyang-north-palace-60", 60, "雒阳北宫开始营建", "材料记北宫营建自60年至65年，位于南宫以北，形成南北二宫对应的格局。本节点取营建起始年60年，不能据此断言北宫当年已经全部落成。", "han-luoyang-site", palace, "东汉60年起（永平三年至八年）")
    node("beijing", "beijing-guangyang-96", 96, "广阳郡恢复建置", "《后汉书》电子转录所附校勘记据《和帝纪》，将底本永平八年校为永元八年，即96年。本条采用校勘后的纪年；蓟县通过既有地区入口关联此事，不据复郡记载推定郡治位置，也不回填为公元2年的状态。", "beijing-history", ji, "东汉96年（永元八年）")
    timelines["beijing"][-1]["evidence"][0]["supports"] = "仅支持永元八年与公元96年的对应；恢复广阳郡依据见另一条校勘引文。"
    timelines["beijing"][-1]["evidence"].append(evidence("han-guangyang-textual-note", ji_note, "校勘记以《和帝纪》纠正永平/永元异文，直接支持恢复广阳郡的纪年，不支持郡治定位。"))
    timelines["beijing"][-1]["sourceIds"].append("context-han-guangyang-textual-note")
    node("luoyang", "luoyang-fire-190", 190, "董卓焚毁雒阳", "汉献帝初平元年，雒阳城遭董卓焚毁破坏。本条补充东汉末都城遭破坏的纪年，不把现存汉魏故城各时期遗迹都解释为190年仍在使用的建筑。", "han-luoyang-site", fire, "东汉190年（初平元年）")
    node("nanjing", "nanjing-moling-211", 211, "孙权迁治秣陵", "东汉末孙权将治所迁到秣陵。此时尚未到229年称帝建立东吴的阶段，本条只记录迁治，不据同一句叙述给石头城营建强行系于211年。", "nanjing", nanjing, "东汉211年")
    node("nanjing", "nanjing-jianye-212", 212, "秣陵改名建业", "孙权迁治秣陵后的次年，即212年，秣陵改名建业。这是东汉末江东政权的地名变化，不能将建业一名提前到西汉，也不表示东吴已经在这一年称帝建国。", "nanjing", nanjing, "东汉212年")

    excluded = [
        {"placeId": "luoyang", "candidate": "汉魏故城百科将东汉迁都系于26年", "reason": "与通常采用的建武元年25年说有冲突，未完成原始纪年复核，本轮不建立迁都节点。"},
        {"placeId": "linzi", "candidate": "韩信死后刘肥才受封齐国", "reason": "百科叙述次序存在问题，不据此生成封国事件或先后年表。"},
        {"placeId": "jinyang", "candidate": "汉景帝曾受封代国、自此一直为并州州府", "reason": "概括含明显时序与身份问题，本轮改取县目和韩王信的具体阶段。"},
        {"placeId": "kaifeng", "candidate": "刘武先都开封、梁园位置及前168年纪年", "reason": "与商丘地区梁国史易混，尚未核查清楚，不生成节点。"},
        {"placeId": "yangzhou", "candidate": "广陵和江都为同一古县、前105年刘细君和亲", "reason": "县目明确分别列名；和亲年份尚需原始纪年核对，本轮不采为节点。"},
        {"placeId": "handan", "candidate": "刘秀使邯郸第一次由王都降为县治", "reason": "县与国可分层并存，首次一词及相关年表证据不足。"},
        {"placeId": "guangzhou", "candidate": "217年迁治被百科称作三国吴事件", "reason": "217年仍属东汉末，且郡治与州治迁移需分开复核，本轮不新增该节点。"},
    ]
    return {"sources": list(sources.values()), "profiles": profiles,
            "cityTimelines": [{"placeId": key, "entries": value} for key, value in timelines.items()],
            "excludedCandidates": excluded}


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
    audit = {"periodId": "han", "profiles": len(pack["profiles"]),
             "profilePlaceIds": [item["placeId"] for item in pack["profiles"]],
             "datedEntries": sum(len(city["entries"]) for city in pack["cityTimelines"]),
             "sourceCount": len(pack["sources"]),
             "quotesMatched": sum(len(item["evidence"]) for item in pack["profiles"]) + sum(len(item["evidence"]) for city in pack["cityTimelines"] for item in city["entries"]),
             "excludedCandidates": pack["excludedCandidates"],
             "limitations": "《汉书》电子转录未与刻本或点校本校勘，百科为固定修订概述材料；不核定古址、疆界，不以县序推定治所、不以郡国户口推定城内人口。"}
    if not args.check:
        profiles, context = merge_content(read(ROOT / "public/data/city-period-profiles.json"), read(ROOT / "public/data/historical-context.json"), pack)
        dump(args.output_root / "public/data/city-period-profiles.json", profiles)
        dump(args.output_root / "public/data/historical-context.json", context)
        dump(args.output_root / "data/evidence/han-expansion-validation.json", audit)
    print(json.dumps(audit, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
