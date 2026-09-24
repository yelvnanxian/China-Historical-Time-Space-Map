"""Shared offline validation for the three reviewed Tang content bundles."""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
BUNDLE_NAMES = ('north-west', 'south-east', 'central-links')
SOURCE_KEYS = ('id', 'title', 'url', 'retrievedAt', 'note', 'snapshotPath', 'snapshotSha256')

def load_bundles():
    bundles = [json.loads((ROOT / 'data/tang-expansion' / (name + '.json')).read_text()) for name in BUNDLE_NAMES]
    sources, texts, profiles, new_places = {}, {}, {}, {}
    for bundle in bundles:
        for source in bundle['sources']:
            sid = source['id']
            record = {key: source[key] for key in SOURCE_KEYS}
            if sid in sources:
                assert sources[sid] == record, f'Conflicting source: {sid}'
            snapshot = ROOT / source['snapshotPath']
            assert snapshot.resolve().is_relative_to((ROOT/'data/evidence').resolve())
            assert hashlib.sha256(snapshot.read_bytes()).hexdigest() == source['snapshotSha256'], f'Snapshot hash: {sid}'
            sources[sid] = record
            texts[sid] = snapshot.read_text()
        for place in bundle['newPlaces']:
            assert place['id'] not in new_places, f'Duplicate new place: {place["id"]}'
            new_places[place['id']] = place
        for profile in bundle['profiles']:
            assert profile['periodId'] == 'tang'
            assert profile['placeId'] not in profiles, f'Duplicate profile: {profile["placeId"]}'
            assert profile.get('region') and profile.get('namingNote'), f'Missing region or naming context: {profile["placeId"]}'
            assert len(profile['evidence']) >= 2, f'Too few source excerpts: {profile["placeId"]}'
            assert len(set(e['quote'] for e in profile['evidence'])) == len(profile['evidence'])
            assert set(profile['sourceIds']) == {e['sourceId'] for e in profile['evidence']}
            profiles[profile['placeId']] = profile
    for profile in profiles.values():
        for evidence in profile['evidence']:
            assert evidence['quote'] in texts[evidence['sourceId']], f'Missing original excerpt: {profile["id"]}'
    targets = json.loads((ROOT/'data/tang-expansion/completion-targets.json').read_text())
    expected = {p['placeId'] for p in targets['towns']}
    assert len(expected) == len(targets['towns']) == 104
    assert expected == set(profiles), f'Tang targets mismatch; missing={expected-set(profiles)}, extra={set(profiles)-expected}'
    assert len(new_places) == 66
    return bundles, sources, list(profiles.values()), list(new_places.values())
