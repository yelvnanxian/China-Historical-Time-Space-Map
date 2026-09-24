"""Optional QA contact sheet. Requires Pillow; does not modify map assets."""
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
source = json.loads((ROOT / 'public/data/physical-regions.geojson').read_text())
directions = json.loads((ROOT / 'public/data/mountain-directions.geojson').read_text())
mountains = [f for f in source['features'] if f['properties']['kind'] == 'mountain']
by_id = {f['properties']['groupId']: f for f in directions['features']}
columns, width, height, top = 6, 360, 235, 84
image = Image.new('RGB', (columns * width, math.ceil(len(mountains) / columns) * height + top), '#fafaf7')
draw = ImageDraw.Draw(image)
title_font = ImageFont.load_default(size=23)
font = ImageFont.load_default(size=16)
small = ImageFont.load_default(size=13)
draw.text((20, 12), 'Mountain direction sketches: source polygons / derived lines / label points', fill='#25353c', font=title_font)
draw.text((20, 46), 'QA only. Orange lines are NOT surveyed ridges. Polygons are reference evidence, never the UI overlay.', fill='#5c6465', font=font)
for i, feature in enumerate(mountains):
    props = feature['properties']
    left, upper = (i % columns) * width, top + (i // columns) * height
    draw.rectangle((left, upper, left + width - 1, upper + height - 1), outline='#d7dcce')
    direction = by_id.get(props['groupId'])
    draw.text((left + 12, upper + 10), props['nameEn'][:39], fill='#25353c', font=font)
    if not direction:
        draw.text((left + 12, upper + 32), 'LABEL ONLY: no clear principal direction', fill='#9c3a21', font=small)
    west, south, east, north = props['bounds']
    cosine = math.cos(math.radians((south + north) / 2))
    x_span, y_span = (east - west) * cosine, north - south
    scale = min((width - 36) / x_span, (height - 70) / y_span)
    x_margin = (width - x_span * scale) / 2
    y_margin = 50 + (height - 64 - y_span * scale) / 2

    def point(coordinate):
        return (left + x_margin + (coordinate[0] - west) * cosine * scale,
                upper + y_margin + (north - coordinate[1]) * scale)

    geometry = feature['geometry']
    polygons = [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates']
    for polygon in polygons:
        draw.polygon([point(p) for p in polygon[0]], fill='#e2e8d7', outline='#8b987e')
        for hole in polygon[1:]:
            draw.polygon([point(p) for p in hole], fill='#fafaf7', outline='#8b987e')
    if direction:
        line = direction['geometry']
        parts = [line['coordinates']] if line['type'] == 'LineString' else line['coordinates']
        for part in parts:
            draw.line([point(p) for p in part], fill='#b94927', width=3)
        x, y = point(direction['properties']['labelCoordinates'])
        draw.ellipse((x - 3, y - 3, x + 3, y + 3), fill='#234561')
output = ROOT / 'data/evidence/physical-geography/mountain-directions-overview.png'
image.save(output)
print(output)
