"""Erzeugt die App-Icons: python3 tools/make_icons.py

Logo „Herzschlag“: 4 x 4 Kacheln wie im Aktivitätskalender. Die Kacheln entlang
einer Pulskurve (Zeilen 2, 0, 3, 2 je Spalte) leuchten in einem durchgehenden
Verlauf von links Weiß nach rechts Rot; die übrigen Kacheln sind zurückgenommen.
Pro Variante entstehen in icons/<variante>/ icon-192.png, icon-512.png,
maskable-512.png, apple-touch-icon.png (180) und favicon-32.png.
"""
from pathlib import Path
from PIL import Image, ImageDraw

VARIANTS = {  # Hintergrund oben, unten, Verlauf links, rechts
    'blau':     ('#1034a6', '#0a2272', '#ffffff', '#e8263d'),
    'hellblau': ('#8aa0b9', '#62788f', '#ffffff', '#e8263d'),
    'rot':      ('#d0142f', '#8e0c22', '#ffffff', '#1a40b8'),
}
PULSE = [2, 0, 3, 2]          # leuchtende Zeile je Spalte
DIM = {1: 0.30, 2: 0.12}      # Deckkraft nach Abstand zur Kurve (3+ wie 2)
T, G = 82, 19                 # Kachel und Abstand bei 512 px
PAD = (512 - (4 * T + 3 * G)) / 2
SS = 4
ROOT = Path(__file__).resolve().parent.parent / 'icons'


def rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def vgrad(size, top, bottom):
    a, b = rgb(top), rgb(bottom)
    col = Image.new('RGB', (1, size))
    for y in range(size):
        t = y / max(1, size - 1)
        col.putpixel((0, y), tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3)))
    return col.resize((size, size))


def hgrad(size, x0, x1, left, right):
    a, b = rgb(left), rgb(right)
    row = Image.new('RGB', (size, 1))
    for x in range(size):
        t = min(1, max(0, (x - x0) / (x1 - x0)))
        row.putpixel((x, 0), tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3)))
    return row.resize((size, size))


def draw(size, v, rounded=True, inset=0.0, alpha=True):
    top, bottom, left, right = VARIANTS[v]
    S = size * SS
    k = S / 512 * (1 - 2 * inset)
    off = S * inset
    im = vgrad(S, top, bottom).convert('RGBA')
    lit = hgrad(S, off + PAD * k, off + (512 - PAD) * k, left, right).convert('RGBA')
    white = Image.new('RGBA', (S, S), (255, 255, 255, 255))
    for r in range(4):
        for c in range(4):
            x = off + (PAD + c * (T + G)) * k
            y = off + (PAD + r * (T + G)) * k
            m = Image.new('L', (S, S), 0)
            d = abs(r - PULSE[c])
            ImageDraw.Draw(m).rounded_rectangle((x, y, x + T * k, y + T * k), radius=T * 0.24 * k,
                                                fill=255 if d == 0 else round(255 * DIM.get(min(d, 2))))
            im = Image.composite(lit if d == 0 else white, im, m)
    if rounded:
        mask = Image.new('L', (S, S), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, S - 1, S - 1), radius=int(S * 0.22), fill=255)
        out = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        out.paste(im, (0, 0), mask)
        im = out
    im = im.resize((size, size), Image.LANCZOS)
    return im if alpha else im.convert('RGB')


for name in VARIANTS:
    out = ROOT / name
    out.mkdir(parents=True, exist_ok=True)
    draw(512, name).save(out / 'icon-512.png')
    draw(192, name).save(out / 'icon-192.png')
    draw(32, name).save(out / 'favicon-32.png')
    draw(512, name, rounded=False, inset=0.12).save(out / 'maskable-512.png')
    draw(180, name, rounded=False, alpha=False).save(out / 'apple-touch-icon.png')
    print('ok', name)
