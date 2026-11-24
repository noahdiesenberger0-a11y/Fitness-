"""Erzeugt manifest-<farbe>.json aus manifest.json: python3 tools/make_manifests.py"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
base = json.loads((ROOT / 'manifest.json').read_text())

for color in ['galaxy', 'stahl', 'aegypten', 'weiss']:
    m = json.loads(json.dumps(base))
    for icon in m['icons']:
        icon['src'] = icon['src'].replace('icons/', f'icons/{color}/')
    for sc in m.get('shortcuts', []):
        for icon in sc.get('icons', []):
            icon['src'] = icon['src'].replace('icons/', f'icons/{color}/')
    (ROOT / f'manifest-{color}.json').write_text(json.dumps(m, ensure_ascii=False, indent=2) + '\n')
    print('ok', color)
