"""Erzeugt die App-Icons in allen Varianten: python3 tools/make_icons.py

Logo: 4 x 4 Kacheln wie im Aktivitätskalender. Jede Kachel hat eine Stufe (0 = kein Training,
4 = viel) und einen eigenen schrägen Farbverlauf. Pro Variante entstehen in icons/<variante>/
icon-192.png, icon-512.png, maskable-512.png, apple-touch-icon.png (180) und favicon-32.png.

Farben: Ägyptischblau oder Hellblau (Steinblau) als Hintergrund, rote Kacheln mit Verlauf.
"""
from pathlib import Path
from PIL import Image, ImageDraw

# Stufen der 16 Kacheln (Zeile für Zeile), unten rechts = jüngste Tage, am hellsten
PATTERN = [
    [1, 0, 2, 1],
    [2, 1, 3, 0],
    [0, 3, 2, 4],
    [3, 2, 4, 4],
]

# Nur Rot: Stufe 0 = dunkles Rot, Stufe 4 = helles Rot, jede Kachel mit eigenem Verlauf
RED_CELLS = {  # Stufe: (Farbe oben links, Farbe unten rechts)
    0: ('#6a0e1e', '#841326'),
    1: ('#9c1229', '#bf1831'),
    2: ('#cc1a33', '#e5233c'),
    3: ('#e5233c', '#ff3d52'),
    4: ('#ff3348', '#ff7482'),
}

VARIANTS = {  # Hintergrund (oben, unten), Kacheln
    'blau':     (('#1a40b8', '#0c2a8a'), RED_CELLS),
    'hellblau': (('#b4c3d4', '#8ea2ba'), RED_CELLS),
}
SS = 4  # Supersampling für glatte Kanten
ROOT = Path(__file__).resolve().parent.parent / 'icons'


def hex2rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def gradient(w, h, c1, c2, diagonal=True):
    """Verlauf von c1 (oben links) nach c2 (unten rechts)."""
    a, b = hex2rgb(c1), hex2rgb(c2)
    g = Image.new('RGB', (w, h))
    px = g.load()
    for y in range(h):
        for x in range(w):
            t = ((x / max(w - 1, 1)) + (y / max(h - 1, 1))) / 2 if diagonal else y / max(h - 1, 1)
            px[x, y] = tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))
    return g


def draw(size, bg, cells, rounded=True, inset=0.0, alpha=True):
    S = size * SS
    # Hintergrund: leichter senkrechter Verlauf
    back = gradient(64, 64, bg[0], bg[1], diagonal=False).resize((S, S), Image.BILINEAR)
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    mask = Image.new('L', (S, S), 0)
    md = ImageDraw.Draw(mask)
    if rounded:
        md.rounded_rectangle((0, 0, S - 1, S - 1), radius=int(S * 0.22), fill=255)
    else:
        md.rectangle((0, 0, S, S), fill=255)
    im.paste(back, (0, 0), mask)

    # Raster: Start 82, Kachel 66, Abstand 94 (bei 512 px)
    k = S / 512 * (1 - 2 * inset)
    off = S * inset
    cs = round(66 * k)
    for r in range(4):
        for c in range(4):
            x = round(off + (82 + c * 94) * k)
            y = round(off + (82 + r * 94) * k)
            c1, c2 = cells[PATTERN[r][c]]
            tile = gradient(32, 32, c1, c2).resize((cs, cs), Image.BILINEAR)
            m = Image.new('L', (cs, cs), 0)
            ImageDraw.Draw(m).rounded_rectangle((0, 0, cs - 1, cs - 1), radius=round(14 * k), fill=255)
            im.paste(tile, (x, y), m)

    im = im.resize((size, size), Image.LANCZOS)
    return im if alpha else im.convert('RGB')


for name, (bg, cells) in VARIANTS.items():
    out = ROOT / name
    out.mkdir(parents=True, exist_ok=True)
    draw(512, bg, cells).save(out / 'icon-512.png')
    draw(192, bg, cells).save(out / 'icon-192.png')
    draw(32, bg, cells).save(out / 'favicon-32.png')
    # Maskable: Logo in der sicheren Zone
    draw(512, bg, cells, rounded=False, inset=0.12).save(out / 'maskable-512.png')
    # iOS rundet selbst ab: volle Fläche, ohne Transparenz
    draw(180, bg, cells, rounded=False, alpha=False).save(out / 'apple-touch-icon.png')
    print('ok', name)
