#!/usr/bin/env python3
"""Merge a small Yuan reading batch from already archived secondary sources.

This batch does not certify coordinates, boundaries, or a date-specific name.
Run after the base/Ming/Song builders. --check verifies sources without writing.
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
            record = {k: metadata[k] for k in (
                "id", "title", "url", "retrievedAt", "note", "snapshotPath", "snapshotSha256")}
            revision = metadata["revision"]["revid"]
            record["url"] = "https://zh.wikipedia.org/w/index.php?title=" + quote(
                metadata["title"].removesuffix(" — 维基百科")) + "&oldid=" + str(revision)
            record["note"] += f" 本次读取页面修订号：{revision}。"
            sources[source_id] = record
            texts[source_id] = snapshot.read_text()
        assert excerpt in texts[source_id], f"Missing exact source quote: {key}/{excerpt}"
        return {"sourceId": source_id, "quote": excerpt, "supports": supports}

    def profile(place_id, summary, region, naming_note, *quotes):
        assert "yuan" in places[place_id]["periodIds"]
        refs = [evidence(*item) for item in quotes]
        profiles.append({
            "id": "yuan-" + place_id, "placeId": place_id, "periodId": "yuan",
            "summary": summary, "region": region, "namingNote": naming_note,
            "politicalContext": "本档案概览元代及元末政权转移，不表示所有事实同时发生于地图当前年份。本轮复用已有百科固定修订快照，尚未完成原始史料交叉考证；文字不核定古城址、辖区或港区边界。",
            "sourceIds": list(dict.fromkeys(item["sourceId"] for item in refs)), "evidence": refs,
        })

    def node(place_id, suffix, year, title, summary, key, excerpt, date_label):
        assert "yuan" in places[place_id]["periodIds"] and 1271 <= year < 1368
        ref = evidence(key, excerpt, title + "及概述中的直接事实；年份来自原文明确纪年。")
        timelines.setdefault(place_id, []).append({
            "id": "yuan-expansion-" + suffix, "year": year, "dateLabel": date_label,
            "title": title, "summary": summary, "sourceIds": [ref["sourceId"]], "evidence": [ref],
        })

    profile("changan",
            "元代西安地区先后使用京兆府、安西府、安西路和奉元路等行政名称，城市已不再承担汉唐时期的都城职能。阅读这里可以区分地区沿革、路级政区与城址；各称谓的精确启用年份还需进一步核对。",
            "关中", "京兆、安西、奉元是先后出现的行政名称，不是元代每一年都能互换使用的城名；本点仍是现有西安地区参考入口。",
            ("changan", "元朝初沿稱京兆府，後設安西府，又改為安西路、奉元路。", "元代行政名称的先后沿革；此句没有给出各次更名年份。"),
            ("changan", "唐代以后，长安就不再是中原王朝的都城。", "唐以后长安不再承担中原王朝都城职能。"))
    profile("chengdu",
            "元朝在成都设置四川等处行中书省，成都继续承担西南区域行政中心职能。这里适合阅读城市与行省机构的联系；材料只支持机构设置，不能据此将现代四川省界当作元代辖境。",
            "四川", "成都这座城、成都路与四川行省属于不同空间层级；本轮不把行省设置叙述转换成新的行政边界。",
            ("chengdu", "元朝政府在成都设置四川等处行中书省，民间俗称“四川省”。", "元代四川行省机构设置于成都。"))
    profile("quanzhou",
            "元代泉州延续市舶管理机构。1281年的规定称，已经在泉州抽分的商舶货物到别处贸易，只输税而不再抽分；这个制度细节可用来理解泉州港的贸易职能。元初泉州行省多次改置，不能用某一次省名概括整个元代。",
            "东南沿海", "泉州城、泉州港及一度设置的泉州行省不是同一范围；本轮只补制度与沿革阅读，不绘制古港界。",
            ("quanzhou", "元代，政府仍袭用南宋之法，设泉州市舶提举司。至元十八年（1281年）还特地作出规定：“商贾市舶物货，已经泉州抽分者，诸处贸易，止令输税，不再抽分”。", "市舶机构延续及1281年商舶货物抽分规定。"),
            ("quanzhou", "元朝政府出于政治和军事上的需要，为加强泉州的地位，多次在泉州设行省或分省。", "泉州行省或分省多次设置，不是整个元代不变的建置。"))
    profile("dali",
            "1274年元朝设置云南行省，同时设大理路及太和县，材料记二者隶属云南行省。大理是元代区域行政中心，而云南行省治所在押赤城、今昆明地区；二者不能在地图上混作同一个省治。",
            "云南", "大理国都、大理路、太和县及今大理市不是同一层级；云南行省治所不在本点，现有参考坐标不新增为古代机构实测位置。",
            ("dali", "元至元十一年（1274年），元朝为便于统治，在押赤城（又名中庆路，今昆明市）设置了云南行省，同时设立大理路及太和县，隶属于云南行省。", "1274年云南行省、大理路及太和县的设置与隶属关系。"),
            ("dali", "大理国历经了316年后，在元宪宗三年（1253年），为忽必烈亲征所灭。", "元朝建立前，蒙古灭大理国的背景；不作为1274年事件。"))
    profile("nanjing",
            "元代南京地区称集庆路，材料将其记为东南纺织业中心。1356年朱元璋攻占集庆并改为应天府，城市成为其抗元基地；这是元末当地控制权的转移，不能把之后的应天仍视作元朝继续治理的城市。",
            "江南", "集庆路与应天府是不同阶段名称；1356年后的朱元璋政权尚未建立明朝，不能提前标成明朝京师。",
            ("nanjing", "元朝時，改為集慶路，是当时东南纺织业的中心。", "元代集庆路名称及纺织业角色。"),
            ("nanjing", "1356年，朱元璋攻占集庆，改为应天府，南京成為抗元基地所在地。", "1356年控制权与府名变化；此后不再视为元继续统治。"))

    node("quanzhou", "quanzhou-province-1278", 1278, "泉州行宣慰司改行中书省",
         "至元十五年，泉州行宣慰司改为泉州行中书省。元初当地省级机构多次调整，这一条只记录1278年的改置，不代表该省随后一直存在，也不核定省界。",
         "quanzhou", "十五年（1278年），改泉州行宣慰司为泉州行中书省；", "元至元十五年（1278年）")
    node("quanzhou", "quanzhou-maritime-tax-1281", 1281, "商舶货物已抽分者不再抽分",
         "至元十八年的规定称，货物已经在泉州抽分后，到其他地方贸易只输税而不再抽分。此条反映海贸税制，不将它解释为货物全面免税。",
         "quanzhou", "至元十八年（1281年）还特地作出规定：“商贾市舶物货，已经泉州抽分者，诸处贸易，止令输税，不再抽分”。", "元至元十八年（1281年）")
    node("dali", "dali-route-1274", 1274, "设置大理路及太和县",
         "材料记至元十一年设置大理路及太和县，隶属云南行省；行省治在押赤城、今昆明地区。本点用于阅读大理地区沿革，不是云南行省治所定位。",
         "dali", "元至元十一年（1274年），元朝为便于统治，在押赤城（又名中庆路，今昆明市）设置了云南行省，同时设立大理路及太和县，隶属于云南行省。", "元至元十一年（1274年）")
    node("nanjing", "nanjing-yingtian-1356", 1356, "朱元璋攻占集庆，改应天府",
         "朱元璋攻占集庆，将其改为应天府并作为抗元基地。此条记录元末的地方政权转移；明朝尚未建立，也不表示元朝继续控制此地。",
         "nanjing", "1356年，朱元璋攻占集庆，改为应天府，南京成為抗元基地所在地。", "1356年（元末）")
    node("beijing", "beijing-completion-1285", 1285, "元大都全城建设完成",
         "元大都自1267年开始营建，1274年宫城整体建设完成，至1285年全城竣工。这个节点补足已有营建开端，并区分宫城和全城的完工时间。",
         "beijing-history", "大都营建始于1267年，次年首座宫殿落成，1274年完成宫城整体建设，至1285年全城竣工。", "1285年")
    return {"sources": list(sources.values()), "profiles": profiles,
            "cityTimelines": [{"placeId": key, "entries": value} for key, value in timelines.items()]}


def merge_sources(existing, additions):
    result = {source["id"]: source for source in existing}
    for source in additions:
        if source["id"] in result:
            assert result[source["id"]]["snapshotSha256"] == source["snapshotSha256"]
        else:
            result[source["id"]] = source
    return list(result.values())


def merge_content(profile_data, context_data, pack):
    """Replace this batch's IDs only, preserving every other published record."""
    profiles, context = deepcopy(profile_data), deepcopy(context_data)
    by_profile = {profile["id"]: profile for profile in profiles["profiles"]}
    by_profile.update({profile["id"]: profile for profile in pack["profiles"]})
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
    parser.add_argument("--check", action="store_true", help="Verify source hashes and quotations without writing outputs")
    args = parser.parse_args()
    pack = build_pack()
    audit = {"periodId": "yuan", "profiles": len(pack["profiles"]),
             "profilePlaceIds": [item["placeId"] for item in pack["profiles"]],
             "datedEntries": sum(len(city["entries"]) for city in pack["cityTimelines"]),
             "sourceCount": len(pack["sources"]),
             "quotesMatched": sum(len(profile["evidence"]) for profile in pack["profiles"]) + sum(len(entry["evidence"]) for city in pack["cityTimelines"] for entry in city["entries"]),
             "limitations": "仅复用已有百科固定修订快照；不是新增原始史料交叉考证，不核定古址或辖界。所有地点沿用既有目录，不新增坐标。"}
    if not args.check:
        profile_path = ROOT / "public/data/city-period-profiles.json"
        context_path = ROOT / "public/data/historical-context.json"
        profiles, context = merge_content(read(profile_path), read(context_path), pack)
        dump(profile_path, profiles)
        dump(context_path, context)
        dump(ROOT / "data/evidence/yuan-expansion-validation.json", audit)
    print(json.dumps(audit, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
