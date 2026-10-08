#!/usr/bin/env python3
"""Rebuild all city reading content from archived sources, then audit the result.

The base builders predate the Song/Ming supplements and overwrite their output.
Keep all merge steps here so rebuilding does not silently drop a later period.
No network requests or historical geometry generation are performed.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "data/evidence/historical-context"
BUILDERS = (
    "build-city-profiles.py",
    "build-historical-context.py",
    "build-ming-content.py",
    "build-song-content.py",
    "build-yuan-content.py",
    "build-qing-content.py",
)


def read(relative):
    return json.loads((ROOT / relative).read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def check_sources(data):
    records = data["sources"]
    sources = {source["id"]: source for source in records}
    assert len(sources) == len(records), "Duplicate source IDs"
    snapshots = {}
    for sid, source in sources.items():
        path = (ROOT / source["snapshotPath"]).resolve()
        assert path.is_relative_to(ROOT / "data/evidence"), sid
        assert sha(path) == source["snapshotSha256"], sid
        snapshots[sid] = path.read_text()
    return snapshots


def check_evidence(entry, snapshots):
    assert entry["sourceIds"] and entry["evidence"], entry["id"]
    assert len(set(entry["sourceIds"])) == len(entry["sourceIds"]), entry["id"]
    assert set(entry["sourceIds"]) == {item["sourceId"] for item in entry["evidence"]}, entry["id"]
    for item in entry["evidence"]:
        assert item["quote"] in snapshots[item["sourceId"]], entry["id"]


def audit():
    catalog = read("data/catalog.json")
    places = {place["id"]: place for place in catalog["places"]}
    periods = {period["id"] for period in catalog["periods"]}
    profiles = read("public/data/city-period-profiles.json")
    snapshots = check_sources(profiles)
    assert len({entry["id"] for entry in profiles["profiles"]}) == len(profiles["profiles"])
    assert len({(entry["placeId"], entry["periodId"]) for entry in profiles["profiles"]}) == len(profiles["profiles"])
    for entry in profiles["profiles"]:
        assert entry["periodId"] in periods and entry["periodId"] in places[entry["placeId"]]["periodIds"], entry["id"]
        check_evidence(entry, snapshots)
    profile_report = {
        "scope": "all-published-periods-after-all-merges",
        "profiles": len(profiles["profiles"]),
        "periodCoverage": {period["id"]: sum(entry["periodId"] == period["id"] for entry in profiles["profiles"]) for period in catalog["periods"]},
        "distinctPlaceEntriesInProfiles": len({entry["placeId"] for entry in profiles["profiles"]}),
        "sources": len(profiles["sources"]),
        "quotesMatched": sum(len(entry["evidence"]) for entry in profiles["profiles"]),
        "outputSha256": sha(ROOT / "public/data/city-period-profiles.json"),
        "note": "统计全部时期合并后的发布内容；按阅读入口计数，不等于互不重合的古城遗址。逐字核对摘录不等于已核定所有历史事实或古址。",
    }
    write(EVIDENCE / "city-profile-validation.json", profile_report)

    context = read("public/data/historical-context.json")
    snapshots = check_sources(context)
    assert len({timeline["placeId"] for timeline in context["cityTimelines"]}) == len(context["cityTimelines"])
    ids = set()
    for timeline in context["cityTimelines"]:
        assert timeline["placeId"] in places
        years = [entry["year"] for entry in timeline["entries"]]
        assert years == sorted(years)
        for entry in timeline["entries"]:
            assert entry["id"] not in ids and isinstance(entry["year"], int) and entry["year"] != 0
            ids.add(entry["id"])
            check_evidence(entry, snapshots)
    for entry in context["geographyEntries"]:
        check_evidence(entry, snapshots)
        assert entry["referenceCoordinates"] == places[entry["referencePlaceId"]]["coordinates"]
    context_report = {
        "scope": "all-published-periods-after-all-merges",
        "createdAt": context["generatedAt"],
        "sources": len(context["sources"]),
        "geographyEntries": len(context["geographyEntries"]),
        "cityTimelines": len(context["cityTimelines"]),
        "cityEntries": len(ids),
        "quotesMatched": sum(len(entry["evidence"]) for entry in context["geographyEntries"]) + sum(len(entry["evidence"]) for timeline in context["cityTimelines"] for entry in timeline["entries"]),
        "cities": [{"placeId": timeline["placeId"], "name": places[timeline["placeId"]]["name"], "entries": len(timeline["entries"])} for timeline in context["cityTimelines"]],
        "referenceCoordinates": "Existing catalog region reference points, not verified historical site coordinates.",
        "outputSha256": sha(ROOT / "public/data/historical-context.json"),
    }
    write(EVIDENCE / "validation.json", context_report)
    print(json.dumps({"profileCount": profile_report["profiles"], "periodCoverage": profile_report["periodCoverage"], "timelineEntryCount": context_report["cityEntries"]}, ensure_ascii=False))


def main():
    if "--audit-only" not in sys.argv:
        # Fail before any base builder overwrites output if a merge is absent.
        for builder in BUILDERS:
            assert (ROOT / "scripts" / builder).is_file(), builder
        for builder in BUILDERS:
            result = subprocess.run([sys.executable, str(ROOT / "scripts" / builder)], cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
            if result.returncode:
                print(result.stdout)
                raise SystemExit(f"Content build failed: {builder}")
            print(f"Built {builder}")
    audit()


if __name__ == "__main__":
    main()
