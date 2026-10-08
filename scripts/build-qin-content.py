#!/usr/bin/env python3
"""Merge a sourced Qin reading batch without changing historical geometry.

Run through build-reading-content.py; --check verifies sources without writing.
Qin state background is kept in profiles, never assigned an imperial Qin year.
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


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def build_pack():
    catalog = read(ROOT / "data/catalog.json")
    places = {place["id"]: place for place in catalog["places"]}
    sources, texts, profiles, timelines = {}, {}, [], {}

    def evidence(key, excerpt, supports):
        source_id = "context-" + key
        if source_id not in sources:
            metadata = read(EVIDENCE / (key + ".json"))
            snapshot = ROOT / metadata["snapshotPath"]
            assert snapshot.resolve().is_relative_to(EVIDENCE.resolve())
            assert hashlib.sha256(snapshot.read_bytes()).hexdigest() == metadata["snapshotSha256"]
            assert metadata["id"] == source_id
            revision = metadata["revision"]["revid"]
            assert isinstance(revision, int) and revision > 0
            record = {k: metadata[k] for k in (
                "id", "title", "url", "retrievedAt", "note", "snapshotPath", "snapshotSha256")}
            record["url"] = "https://zh.wikipedia.org/w/index.php?title=" + quote(
                metadata["title"].removesuffix(" — 维基百科")) + "&oldid=" + str(revision)
            record["note"] += f" 本次读取页面修订号：{revision}。"
            sources[source_id] = record
            texts[source_id] = snapshot.read_text()
        assert excerpt in texts[source_id], f"Missing exact source quote: {key}/{excerpt}"
        return {"sourceId": source_id, "quote": excerpt, "supports": supports}

    def profile(place_id, summary, region, naming_note, *quotes):
        assert "qin" in places[place_id]["periodIds"]
        refs = [evidence(*item) for item in quotes]
        profiles.append({
            "id": "qin-" + place_id, "placeId": place_id, "periodId": "qin",
            "summary": summary, "region": region, "namingNote": naming_note,
            "politicalContext": "本档案概览秦国经营背景与统一后的秦朝，不表示所有事实发生于地图当前年份。前221年以前的内容明确属于秦国时期。本轮使用百科固定修订快照，尚未完成原始史料交叉考证；目录坐标只是今地参考，不核定秦代城址、郡县治所位置或辖区边界。",
            "sourceIds": list(dict.fromkeys(item["sourceId"] for item in refs)), "evidence": refs,
        })

    def node(place_id, suffix, year, title, summary, date_label, *quotes):
        assert "qin" in places[place_id]["periodIds"] and -221 <= year <= -207
        refs = [evidence(*item) for item in quotes]
        timelines.setdefault(place_id, []).append({
            "id": "qin-expansion-" + suffix, "year": year, "dateLabel": date_label,
            "title": title, "summary": summary,
            "sourceIds": list(dict.fromkeys(item["sourceId"] for item in refs)), "evidence": refs,
        })

    profile("luoyang",
            "秦在统一前已设置三川郡，洛阳列入其可考领县。三川郡的郡治位置存在洛阳与荥阳两说，本档案保留这一分歧，不将其中一说作为确定定位。洛阳城与三川郡不是同一空间层级，也不能把东汉首都地位提前放到秦朝。",
            "河洛", "本点用于阅读洛阳地区的秦代沿革。三川郡是郡级政区，洛阳是城邑及县名；郡治洛阳、荥阳两说待进一步核验，现有坐标不证明其中任何一说。",
            ("qin-sanchuan", "秦莊襄王元年（前249年），秦攻韓，韓獻成皋、鞏，秦國疆界至大梁，置三川郡，郡治洛陽（今河南洛陽市東北），一說治滎陽（今滎陽市東北），轄域和韓國的三川郡相當。可考領縣有洛陽、河南、滎陽、京、索、陽武、緱氏、卷、鞏、新城、啟封、成皋、宛陵、新安、宜陽、澠池、陝、梁、平陰。", "秦国设置三川郡的背景、洛阳列入领县，以及洛阳与荥阳两种郡治说法；不据此绘制边界。"))
    profile("chengdu",
            "秦国在统一六国之前已经营蜀地，材料记蜀郡郡治设在成都县，城中有相并的大城和少城。李冰主持的都江堰工程也是统一前的建设背景，有助于理解成都平原进入秦朝时的农业条件。这里区分成都城、成都县与蜀郡，不把城池或郡域混作同一个范围。",
            "四川", "材料所记前316年入蜀、前311年筑城和李冰治水均属于统一前的秦国时期；这些背景不新增为前221年才发生的事件。现有成都参考点不核定秦代大城、少城城墙位置。",
            ("chengdu", "公元前316年，秦惠文王借巴国、蜀国互攻之机，派司马错率军沿石牛道入蜀，数月之间便攻占蜀地。此后，秦王三立三废蜀侯，终置蜀郡，郡治成都县即设于原蜀都成都。前311年，秦国张仪按首都咸阳建制修筑成都城墙，筑有相并的大城和少城；", "前316年秦国入蜀、蜀郡与成都县关系、前311年大城和少城的记载；不推算郡界与城墙位置。"),
            ("chengdu", "前256年，秦昭王任命李冰为蜀郡郡守，任内他主持修建了举世闻名的都江堰水利工程。", "材料将李冰治水置于统一前的秦国背景；不将任命年份等同工程开工或竣工年份。"))
    profile("jingzhou",
            "地图上的江陵入口连接今天的荆州地区与秦经营楚地的历史。材料记前278年白起攻占郢、秦设置江陵，南郡也在这一背景下建立。这些是秦国统一前的沿革；本轮没有足够材料核定统一后每年的郡治变化，也不把楚郢都与后世江陵城视作同一城址。",
            "荆楚", "江陵是城邑及县名，南郡是郡级政区，荆州在本点首先是今地参考名称。楚纪南城与后世江陵城需要分别考察；本轮不把荆州刺史部的汉代制度套入秦朝。",
            ("jingzhou", "公元前278年秦将白起拔郢置江陵。", "秦国攻郢、设置江陵的概述性记载；不据此认定郢都与江陵城为同址。"),
            ("qin-nan", "秦昭襄王二十九年（前278年），大良造白起攻佔楚都郢，設置南郡。", "南郡建立的秦国背景；此句未核定秦统一后各年的治所位置与领县范围。"),
            ("jingzhou", "句亶国即后来的郢都一带（今荆州城北五千米外纪南城）。", "材料将郢都一带联系到今荆州城北的纪南城，用于提示古今城址不能混同。"))
    profile("jinyang",
            "秦朝的晋阳与太原郡应分层阅读：晋阳是城邑及县名，材料将晋阳城记为太原郡和晋阳县的治所，太原郡则是秦始皇时期的郡级政区。所用条目对太原郡初置年份前后表述不一致，本轮只采用郡县层级关系，不给出确定的初置年。",
            "河东", "太原郡不等于晋阳城，也不等于后世太原府。来源开头写前246年始置，正文写前248年之后次年置郡，存在内部纪年冲突，待原始史料核验；本轮不新增这一建郡年份节点。",
            ("qin-taiyuan", "晋阳城为太原郡、晋阳县治所。秦始皇时为全国三十六郡之一。", "晋阳城与太原郡、晋阳县的层级关系；三十六郡指郡级政区，不指晋阳城。"),
            ("qin-taiyuan", "太原郡，也稱太原國，是前246年，秦国始置至隋朝時期的郡", "该条目开头的前246年始置说，用于公开标出与正文纪年的冲突。"),
            ("qin-taiyuan", "秦庄襄王二年（前248年），蒙骜攻赵国，定太原。次年置太原郡。", "同一条目正文以前年之后次年记置郡，与开头前246年说不一致；不据此自动确定年份。"))
    profile("handan",
            "秦统一后，材料记在邯郸设置邯郸郡，原赵都仍承担郡治职能，城中的富户被迁往咸阳。秦末前209年武臣到邯郸自称赵王，反映当地控制权已经发生变化；不能把秦末复赵之后的城市继续笼统视为秦朝稳定控制的郡治。",
            "河北", "赵国都城邯郸、邯郸郡与邯郸城属于不同概念；城市成为郡治，不是城市本身变成一片郡域。前209年节点沿用已有大事记，不重复添加。",
            ("handan", "秦一统海内，在邯郸设置邯郸郡，原赵都邯郸仍为邯郸郡首府，并且把邯郸城内的全部富户迁入秦都咸阳。", "材料记秦统一后邯郸的郡治角色及迁户措施；不据此核定郡域。"),
            ("handan", "公元前209年，陈胜，吴广起兵反秦，武臣来邯郸自称赵王。", "前209年秦末邯郸政权变化；已有节点保留，不重复计数。"))

    node("xianyang", "xianyang-roads-220", -220, "以咸阳为中心修筑驰道",
         "材料记秦始皇二十七年开始大规模修筑驰道，以京师咸阳为中心连接秦故地和原六国道路。这一条补充首都的交通组织职能；本轮未取得可核定的秦驰道路线，不把现代道路当作古道。",
         "秦始皇二十七年（前220年）",
         ("qin-shihuang", "秦始皇從公元前220年（秦始皇27年）開始，大幅修築以京師咸陽為中心，向四面八方延伸出去的馳道，类似现代的高速公路，將秦故地和原六国境内的旧道连接起来，并加以扩建。", "前220年以咸阳为中心修筑驰道的记载；仅支持交通史背景，不提供路线几何。"))
    node("xianyang", "xianyang-lanchi-216", -216, "秦始皇在兰池宫附近遇袭",
         "材料记秦始皇三十一年在咸阳一带微服出行，于兰池宫附近遇袭，随后在关中搜查二十天。这里将事件关联到咸阳地区；现有城市参考点不代表兰池宫遗址，也不表示已经核定遇袭位置。",
         "秦始皇三十一年（前216年）",
         ("qin-shihuang", "公元前216年（秦始皇31年）一個晚上，秦始皇與四名武士一起，在咸阳一帶微服出行，但在兰池宮附近遇上一眾强盗襲擊，情势危急，幸而最終擊斃企圖襲擊秦始皇的強盜。由於懷疑事件另有主謀，故在关中地區大索二十天。", "前216年、咸阳一带兰池宫附近遇袭及关中搜查的概述性记载；不是宫址坐标核定。"))
    node("xianyang", "xianyang-succession-210", -210, "秦始皇丧车归咸阳，胡亥袭位",
         "秦始皇在前210年巡游途中去世，材料记当年秋丧车经直道到咸阳后发丧，胡亥袭位为二世皇帝。这个节点记录咸阳的权力交接，不把秦始皇去世的沙丘或安葬的骊山放在咸阳城中。",
         "秦始皇三十七年（前210年）",
         ("qin-shihuang", "始皇三十七年（前210年），秦始皇開始最后一次巡游，返至平原津得病。行至沙丘平台，秦始皇驾崩。", "秦始皇去世所处的前210年及地点沙丘，与后文该年秋返回咸阳的记载衔接。"),
         ("qin-shihuang", "該年秋季，从直道至咸阳，发丧。太子胡亥袭位，为二世皇帝，天下始知秦始皇驾崩。九月，葬始皇帝於酈山。", "当年秋返回咸阳发丧和胡亥袭位；明确区分咸阳、沙丘与骊山。"))

    return {
        "sources": list(sources.values()), "profiles": profiles,
        "cityTimelines": [{"placeId": key, "entries": value} for key, value in timelines.items()],
        "excludedCandidates": [
            {"placeId": "chengdu", "topic": "前316年入蜀、前311年筑城、前256年李冰任职", "reason": "属于统一前秦国背景；前311年已有节点。任职年份不能直接当作都江堰开工或竣工年。"},
            {"placeId": "jingzhou", "topic": "前278年拔郢置江陵、统一后郡治位置", "reason": "前278年已有节点且在帝国秦朝范围之前；现有摘录不能核定统一后各年的郡治与城址。"},
            {"placeId": "luoyang", "topic": "三川郡郡治与前249年建郡", "reason": "来源保留洛阳与荥阳两说；前249年在本朝年份范围之前，不创建确定郡治或帝国时期新事件。"},
            {"placeId": "jinyang", "topic": "太原郡初置年份", "reason": "同一来源开头前246年与正文前248年次年置郡冲突；暂不采用精确置郡年。"},
            {"placeId": "handan", "topic": "前209年武臣称赵王", "reason": "已存在 handan-context-2-209，保留原节点，不重复新增。"},
            {"placeId": "xianyang", "topic": "阿房宫始建年份", "reason": "来源同时列前219年与前212年两种记载，本轮不新增单一年份或宫址定位。"},
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
    parser.add_argument("--check", action="store_true", help="Verify sources without writing")
    args = parser.parse_args()
    pack = build_pack()
    audit = {
        "periodId": "qin", "profiles": len(pack["profiles"]),
        "profilePlaceIds": [item["placeId"] for item in pack["profiles"]],
        "datedEntries": sum(len(city["entries"]) for city in pack["cityTimelines"]),
        "sourceCount": len(pack["sources"]),
        "quotesMatched": sum(len(item["evidence"]) for item in pack["profiles"]) + sum(len(entry["evidence"]) for city in pack["cityTimelines"] for entry in city["entries"]),
        "excludedCandidates": pack["excludedCandidates"],
        "limitations": "仅补目录中已有城市的秦代阅读；百科固定修订快照未完成原始史料交叉考证。未新增坐标、郡县边界或道路几何，未将秦国时期事件移入统一后的秦朝。",
    }
    if not args.check:
        profile_path = ROOT / "public/data/city-period-profiles.json"
        context_path = ROOT / "public/data/historical-context.json"
        profiles, context = merge_content(read(profile_path), read(context_path), pack)
        dump(profile_path, profiles)
        dump(context_path, context)
        dump(ROOT / "data/evidence/qin-expansion-validation.json", audit)
    print(json.dumps(audit, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
