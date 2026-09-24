#!/usr/bin/env python3
"""Import unmodified atlas scans from a pinned, independently hosted repository.

Uses only the Python standard library. Image blobs are verified against the
repository tree, then recorded with both Git SHA-1 and SHA-256 checksums.
This imports paper-map images, not official vector boundaries or georeferenced
rasters. Run from any directory: python3 scripts/import-atlas-references.py
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import struct
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public/data/atlas"
EVIDENCE = ROOT / "data/evidence/atlas-reference"
REPOSITORY = "imbian/chinese_historical_map"
COMMIT = "7aa0c7b4f627e3becd444b37d03b00d3173cf420"
TREE_URL = f"https://api.github.com/repos/{REPOSITORY}/git/trees/{COMMIT}?recursive=1"
RAW_ROOT = f"https://raw.githubusercontent.com/{REPOSITORY}/{COMMIT}/"
BLOB_ROOT = f"https://github.com/{REPOSITORY}/blob/{COMMIT}/"

# Dates are transcribed only after visually reading the original scan. Unknown
# dates stay null; catalog snapshot years are never substituted for map dates.
SELECTION = [
    ("qin-full", "qin", "秦/秦时期全图.jpg"),
    ("han-western-full", "han", "西汉/西汉时期全图.jpg"),
    ("sanguo-full", "sanguo", "三国/三国时期全图.jpg"),
    ("jin-western-full", "jin", "西晋/西晋时期全图.jpg"),
    ("nanbei-qi-wei-full", "nanbei", "南北朝/齐、魏时期全图.jpg"),
    ("sui-full", "sui", "隋/隋时期全图.jpg"),
    ("tang-full-1", "tang", "唐/唐时期全图（一）.jpg"),
    ("tang-full-2", "tang", "唐/唐时期全图（二）.jpg"),
    ("tang-full-3", "tang", "唐/唐时期全图（三）.jpg"),
    ("song-liao-northern-full", "song", "辽 北宋/辽，北宋时期全图.jpg"),
    ("song-jin-southern-full-1", "song", "金 南宋/金，南宋时期全图（一）.jpg"),
    ("song-jin-southern-full-2", "song", "金 南宋/金，南宋时期全图（二）.jpg"),
    ("yuan-full-1", "yuan", "元/元时期全图（一）.jpg"),
    ("yuan-full-2", "yuan", "元/元时期全图（二）.jpg"),
    ("ming-full-1", "ming", "明/明时期全图（一）.jpg"),
    ("ming-full-2", "ming", "明/明时期全图（二）.jpg"),
    ("qing-full-1", "qing", "清/清时期全图（一）.jpg"),
    ("qing-full-2", "qing", "清/清时期全图（二）.jpg"),
]

VISUALLY_READ_DATES = {
    "sanguo-full": {"label": "魏景元三年、蜀汉景耀五年、吴永安五年（262年）", "year": 262},
    "jin-western-full": {"label": "太康二年（281年）", "year": 281},
    "nanbei-qi-wei-full": {"label": "齐建武四年、魏太和二十一年（497年）", "year": 497},
    "sui-full": {"label": "大业八年（612年）", "year": 612},
    "tang-full-1": {"label": "总章二年（669年）", "year": 669},
    "tang-full-2": {"label": "开元二十九年（741年）", "year": 741},
    "tang-full-3": {"label": "元和十五年（820年）", "year": 820},
    "song-liao-northern-full": {"label": "辽天庆元年、北宋政和元年（1111年）", "year": 1111},
    "song-jin-southern-full-1": {"label": "金皇统二年、南宋绍兴十二年（1142年）", "year": 1142},
    "song-jin-southern-full-2": {"label": "金泰和八年、南宋嘉定元年（1208年）", "year": 1208},
    "yuan-full-1": {"label": "至元十七年（1280年）", "year": 1280},
    "yuan-full-2": {"label": "至顺元年（1330年）", "year": 1330},
    "ming-full-1": {"label": "宣德八年（1433年）", "year": 1433},
    "ming-full-2": {"label": "万历十年（1582年）", "year": 1582},
    "qing-full-1": {"label": "嘉庆二十五年（1820年）", "year": 1820},
    "qing-full-2": {"label": "光绪三十四年（1908年）", "year": 1908},
}


def get(url):
    request = Request(url, headers={"User-Agent": "ShanHeJi-atlas-reference-import/1.0"})
    with urlopen(request, timeout=60) as response:
        return response.read()


def git_blob_sha(data):
    return hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest()


def jpeg_dimensions(data):
    if data[:2] != b"\xff\xd8":
        raise ValueError("Expected an original JPEG")
    offset = 2
    while offset < len(data):
        if data[offset] != 0xFF:
            offset += 1
            continue
        while data[offset] == 0xFF:
            offset += 1
        marker = data[offset]
        offset += 1
        if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
            continue
        length = struct.unpack_from(">H", data, offset)[0]
        if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
            height, width = struct.unpack_from(">HH", data, offset + 3)
            return width, height
        offset += length
    raise ValueError("JPEG dimensions not found")


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    tree_data = get(TREE_URL)
    tree = json.loads(tree_data)
    if tree.get("truncated"):
        raise ValueError("Repository tree is incomplete")
    entries = {entry["path"]: entry for entry in tree["tree"]}
    readme = get(RAW_ROOT + "README.md")
    if git_blob_sha(readme) != entries["README.md"]["sha"]:
        raise ValueError("README checksum mismatch")
    (EVIDENCE / "repository-tree.json").write_bytes(tree_data)
    (EVIDENCE / "repository-README.md").write_bytes(readme)

    def import_image(specification):
        image_id, period_id, source_path = specification
        expected = entries[source_path]
        destination = OUTPUT / f"{image_id}.jpg"
        raw_url = RAW_ROOT + quote(source_path)
        data = destination.read_bytes() if destination.exists() else get(raw_url)
        actual_sha = git_blob_sha(data)
        if actual_sha != expected["sha"]:
            raise ValueError(f"Original-blob checksum mismatch: {source_path}")
        if not destination.exists():
            temporary = destination.with_suffix(".jpg.part")
            temporary.write_bytes(data)
            temporary.replace(destination)
        width, height = jpeg_dimensions(data)
        date = VISUALLY_READ_DATES.get(image_id)
        return {
            "id": image_id,
            "periodId": period_id,
            "title": Path(source_path).stem.replace("，", "、"),
            "imageUrl": f"/data/atlas/{image_id}.jpg",
            "width": width,
            "height": height,
            "bytes": len(data),
            "sourcePath": source_path,
            "sourceUrl": BLOB_ROOT + quote(source_path),
            "rawSourceUrl": raw_url,
            "sourceCommit": COMMIT,
            "gitBlobSha": actual_sha,
            "sha256": hashlib.sha256(data).hexdigest(),
            "imageDate": ({**date, "verification": "visually-read-from-scan"} if date else None),
        }

    with ThreadPoolExecutor(max_workers=4) as executor:
        images = list(executor.map(import_image, SELECTION))
    manifest = {
        "version": "1.0",
        "importedAt": datetime.now(timezone.utc).date().isoformat(),
        "title": "《中国历史地图集》纸图影像参考",
        "sourceName": "《中国历史地图集》（谭其骧主编）扫描图 · imbian/chinese_historical_map",
        "sourceKind": "third-party-paper-atlas-scans",
        "sourceNote": "仓库 README 将这些影像标注为谭其骧主编《中国历史地图集》的纸图扫描版。此处接入的是第三方保存的纸图影像，不是编制机构的官方数字发布。",
        "dateNote": "原图年代独立于当前截面，见原图图例。仅目视读出的年代另行标注，未换用当前截面的年份。",
        "rightsNote": "原图及图集权利归原权利人；该仓库未提供明确的影像再分发许可证。",
        "repository": f"https://github.com/{REPOSITORY}",
        "sourceCommit": COMMIT,
        "readmeUrl": BLOB_ROOT + "README.md",
        "readmeGitBlobSha": entries["README.md"]["sha"],
        "treeUrl": TREE_URL,
        "totalBytes": sum(image["bytes"] for image in images),
        "images": images,
    }
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Verified {len(images)} original scans, {manifest['totalBytes'] / 1_000_000:.2f} MB")


if __name__ == "__main__":
    main()
