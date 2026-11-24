"""Erzeugt die App-Icons: python3 tools/make_icons.py

Logo: 4 x 4 Kacheln wie im Aktivitätskalender, flach und schlicht, Farben 60:30:10.
60 % Grundfläche, 30 % helle Kacheln, 10 % Akzent: vier Kacheln steigen
diagonal von unten links nach oben rechts an (Fortschritt).
Pro Variante entstehen in icons/<variante>/ icon-192.png, icon-512.png,
maskable-512.png, apple-touch-icon.png (180) und favicon-32.png.
"""
from pathlib import Path
from PIL import Image, ImageDraw

BLUE = '#1034a6'    # Ägyptischblau
STONE = '#7d93ad'   # Steinblau
RED = '#c8102e'     # Scharlachrot
WHITE = '#ffffff'

VARIANTS = {  # Grund (60 %), Kachel (30 %), Akzent-Diagonale (10 %)
    'blau':     (BLUE, WHITE, RED),
    'hellblau': (STONE, WHITE, RED),
    'rot':      (RED, WHITE, BLUE),
}
DIAG = {(3, 0), (2, 1), (1, 2), (0, 3)}
# Raster bei 512 px: Kachel T, Abstand G, zentriert. 16 Kacheln ≈ 40 % der Fläche.
T, G, R = 82, 19, 16
START = (512 - (4 * T + 3 * G)) / 2
SS = 4  # Supersampling für glatte Kanten
ROOT = Path(__file__).resolve().parent.parent / 'icons'


def draw(size, bg, tile, today, rounded=True, inset=0.0, alpha=True):
    S = size * SS
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if rounded:
        d.rounded_rectangle((0, 0, S - 1, S - 1), radius=int(S * 0.22), fill=bg)
    else:
        d.rectangle((0, 0, S, S), fill=bg)
    k = S / 512 * (1 - 2 * inset)
    off = S * inset
    for r in range(4):
        for c in range(4):
            x = off + (START + c * (T + G)) * k
            y = off + (START + r * (T + G)) * k
            fill = today if (r, c) in DIAG else tile
            d.rounded_rectangle((x, y, x + T * k, y + T * k), radius=R * k, fill=fill)
    im = im.resize((size, size), Image.LANCZOS)
    return im if alpha else im.convert('RGB')


for name, (bg, tile, today) in VARIANTS.items():
    out = ROOT / name
    out.mkdir(parents=True, exist_ok=True)
    draw(512, bg, tile, today).save(out / 'icon-512.png')
    draw(192, bg, tile, today).save(out / 'icon-192.png')
    draw(32, bg, tile, today).save(out / 'favicon-32.png')
    draw(512, bg, tile, today, rounded=False, inset=0.12).save(out / 'maskable-512.png')
    draw(180, bg, tile, today, rounded=False, alpha=False).save(out / 'apple-touch-icon.png')
    print('ok', name)
