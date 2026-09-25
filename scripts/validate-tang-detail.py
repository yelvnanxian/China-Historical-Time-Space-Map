#!/usr/bin/env python3
"""Independently compare each published modern coordinate/edge to original OSM.

Requires shapely. This validation does not infer historic geography from OSM.
"""
from collections import Counter
from pathlib import Path
import gzip
import hashlib
import json
from shapely.geometry import shape

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data/evidence/tang-detail'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def coordinates(element):
    return [(item['lon'], item['lat']) for item in element.get('geometry', [])]


def edges(line):
    # An undirected edge permits a ring to be reoriented without changing it.
    return {tuple(sorted((tuple(a), tuple(b)))) for a, b in zip(line, line[1:])}


def read_published(path):
    data = path.read_bytes()
    return json.loads(gzip.decompress(data) if path.suffix == '.gz' else data)


def validate():
    manifest = json.loads((ROOT / 'public/data/tang-detail/manifest.json').read_text())
    total, count = Counter(), 0
    seen = set()
    reports = []
    for source in manifest['sources']:
        if not source['id'].startswith('osm-'):
            continue
        snapshot = ROOT / source['snapshotPath']
        compressed = snapshot.read_bytes()
        assert digest(compressed) == source['snapshotSha256']
        raw = json.loads(gzip.decompress(compressed))
        assert not raw.get('remark')
        by_id = {(record['type'], record['id']): record for record in raw['elements']}
        source_counts = Counter()
        for pack in manifest['modernRegions']:
            if pack['sourceId'] != source['id']:
                continue
            path = ROOT / ('public' + pack['url'])
            data = read_published(path)
            for feature in data['features']:
                p = feature['properties']
                ident = (p['osmType'], p['osmId'])
                assert ident not in seen, ('duplicate', ident)
                seen.add(ident)
                record = by_id[ident]
                assert record.get('tags', {}) == p['tags'], ident
                g = feature['geometry']
                geometry = shape(g)
                assert geometry.is_valid and not geometry.is_empty, ident
                if p['kind'] in ('peak', 'saddle'):
                    assert g['type'] == 'Point'
                    assert tuple(g['coordinates']) == (record['lon'], record['lat']), ident
                elif p['kind'] in ('river', 'stream', 'canal'):
                    assert g['type'] == 'LineString'
                    assert [tuple(pair) for pair in g['coordinates']] == coordinates(record), ident
                elif p['kind'] == 'water':
                    if record['type'] == 'way':
                        original_edges = edges(coordinates(record))
                    else:
                        original_edges = set()
                        for member in record['members']:
                            if member['type'] == 'way' and member.get('role', '') in ('', 'outer', 'inner'):
                                original_edges.update(edges(coordinates(member)))
                    polygons = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
                    published_edges = set()
                    for polygon in polygons:
                        for ring in polygon:
                            assert ring[0] == ring[-1], ident
                            published_edges.update(edges(ring))
                    # Exact source edge set equality catches guessed ring closure,
                    # smoothing, dropped islands/holes and omitted member ways.
                    assert published_edges == original_edges, (ident, 'water edges changed', len(published_edges), len(original_edges))
                else:
                    raise AssertionError(p['kind'])
                source_counts[p['kind']] += 1
        count += sum(source_counts.values())
        total.update(source_counts)
        reports.append({'sourceId': source['id'], 'checkedFeatures': sum(source_counts.values()), 'countsByKind': dict(source_counts)})
        print(source['id'], sum(source_counts.values()), 'source coordinates/edges match', flush=True)
    assert count == sum(pack['featureCount'] for pack in manifest['modernRegions'])
    report = {'checkedFeatures': count, 'countsByKind': dict(total), 'perSource': reports,
              'assertions': ['All published OSM IDs globally unique', 'All tags match the selected raw OSM element',
                             'All point coordinates and line coordinate sequences equal the raw source',
                             'All water polygon edge sets equal the complete raw way/member edge sets',
                             'All published geometries valid and nonempty', 'All source compressed SHA256 values match'],
              'limitation': 'Checks source fidelity and geometry validity; does not verify OSM survey accuracy or reconstruct Tang geography.'}
    (OUT / 'modern-geometry-validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'checkedFeatures': count, 'countsByKind': dict(total)}, ensure_ascii=False))


if __name__ == '__main__':
    validate()
