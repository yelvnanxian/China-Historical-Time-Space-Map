"""Validate archived county research and prepare public, traceable citations.

Research changes identity candidates only through explicit reviewed exclusions or
name-change links. It never moves a source point or changes a model polygon.
"""
from collections import defaultdict
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / 'data/evidence/tang-county-research'
BUNDLES = ('focus', 'bulk', 'identities')
TOPICS = {'identity', 'administration', 'establishment', 'seat', 'chronology'}


def load_research(settlements, models):
    by_point = defaultdict(list)
    by_model = defaultdict(list)
    source_by_id = {}
    entry_by_id = {}
    exclusions = {}
    links = {}
    paths = []
    all_decisions = []
    for name in BUNDLES:
        path = DIRECTORY / f'{name}.json'
        bundle = json.loads(path.read_text())
        paths.append(str(path.relative_to(ROOT)))
        sources = {source['id']: source for source in bundle['sources']}
        assert len(sources) == len(bundle['sources']), f'Duplicate sources: {name}'
        for ident, source in sources.items():
            assert source['url'].startswith('https://'), ident
            snapshot = (ROOT / source['snapshotPath']).resolve()
            assert snapshot.is_relative_to(ROOT / 'data/evidence'), ident
            assert hashlib.sha256(snapshot.read_bytes()).hexdigest() == source['snapshotSha256'], ident
            if ident in source_by_id:
                assert all(source_by_id[ident][key] == source[key] for key in ('url', 'snapshotPath', 'snapshotSha256')), ident
            else:
                source_by_id[ident] = source
        for entry in bundle['entries']:
            ident = entry['id']
            assert ident not in entry_by_id, ident
            assert entry['correspondence'] in {'same-unit', 'different-unit', 'unresolved'}, ident
            assert entry['summary'] and entry['findings'] and entry['unresolved'], ident
            assert entry['settlementIds'] or entry['boundaryIds'], ident
            assert all(point in settlements for point in entry['settlementIds']), ident
            assert all(model in models for model in entry['boundaryIds']), ident
            findings = []
            for finding in entry['findings']:
                assert finding['topic'] in TOPICS and finding['statement'] and finding['evidence'], ident
                evidence = []
                for citation in finding['evidence']:
                    source = sources[citation['sourceId']]
                    assert citation['quote'] and citation['locator'], ident
                    assert citation['quote'] in (ROOT / source['snapshotPath']).read_text(), (ident, citation['sourceId'], citation['quote'])
                    evidence.append({'sourceId': source['id'], 'sourceTitle': source['title'], 'sourceUrl': source['url'],
                                     'sourceKind': source['kind'], 'quote': citation['quote'], 'locator': citation['locator']})
                findings.append({'topic': finding['topic'], 'statement': finding['statement'], 'evidence': evidence})
            published = {key: entry[key] for key in ('id', 'title', 'summary', 'correspondence', 'unresolved')}
            published['findings'] = findings
            entry_by_id[ident] = entry
            for point in entry['settlementIds']:
                by_point[point].append(published)
            for model in entry['boundaryIds']:
                by_model[model].append(published)
        all_decisions.extend(('exclude', decision) for decision in bundle.get('exclusions', []))
        all_decisions.extend(('link', decision) for decision in bundle.get('links', []))
    for action, decision in all_decisions:
        entry = entry_by_id[decision['researchEntryId']]
        point = decision['settlementId']
        model = decision['boundaryId']
        assert point in entry['settlementIds'] and model in entry['boundaryIds'], decision
        assert entry['correspondence'] == ('different-unit' if action == 'exclude' else 'same-unit'), decision
        assert decision['reason'], decision
        # Do not silently invalidate a verified, spatially compatible crosswalk.
        target = exclusions if action == 'exclude' else links
        assert (point, model) not in target, decision
        target[(point, model)] = decision
    assert not set(exclusions).intersection(links), 'Contradictory identity decisions'
    coverage = {'entries': len(entry_by_id), 'sources': len(source_by_id),
                'settlements': len(by_point), 'boundaries': len(by_model),
                'excludedPairs': len(exclusions), 'documentedLinks': len(links)}
    return {'bySettlement': by_point, 'byBoundary': by_model, 'exclusions': exclusions, 'links': links,
            'paths': paths, 'sources': source_by_id, 'coverage': coverage, 'entries': entry_by_id}
