#!/usr/bin/env python3
"""Download official CHGIS point archives and codebook for local noncommercial work.

The original license texts and metadata are preserved. Run the builder offline
after acquisition; no full-dataset republication is performed by this script.
"""
from pathlib import Path
import hashlib
import json
import subprocess

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data/evidence/tang-detail/chgis'
API = 'https://dataverse.harvard.edu/api'
DATASETS = [('county', 'Q9VOF5'), ('prefecture', 'WW1PD6'), ('dictionary', 'SNCEAU')]
DOWNLOADS = [('county-wgs84.zip', 3048165, '976b2a07e8ca09b0c402f828d090a6c3'),
             ('prefecture-wgs84.zip', 2970286, 'f77d218bba35428dc4ca9ebf176e961f'),
             ('CHGIS_V6_README.txt', 3048161, 'd1b932c97d268f5254baf4f66d7b02b7'),
             ('data-dictionary.zip', 2966673, None)]


def fetch(url, path):
    if path.exists():
        return
    temporary = path.with_suffix(path.suffix + '.part')
    subprocess.run(['curl', '-L', '--fail', '--max-time', '90', '--retry', '2', '-sS', url, '-o', str(temporary)], check=True)
    temporary.replace(path)


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    for name, doi in DATASETS:
        fetch(f'{API}/datasets/:persistentId/?persistentId=doi:10.7910/DVN/{doi}', OUT / f'{name}-metadata.json')
    for filename, ident, expected_md5 in DOWNLOADS:
        target = OUT / filename
        fetch(f'{API}/access/datafile/{ident}', target)
        if expected_md5:
            assert hashlib.md5(target.read_bytes()).hexdigest() == expected_md5, filename
        print(json.dumps({'file': filename, 'bytes': target.stat().st_size, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest()}))
