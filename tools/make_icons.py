"""Erzeugt die App-Icons in allen Farben: python3 tools/make_icons.py

Logo: 4 x 4 Kacheln (der Aktivitätskalender). Pro Farbe entstehen in icons/<farbe>/
icon-192.png, icon-512.png, maskable-512.png, apple-touch-icon.png (180) und favicon-32.png.
"""
from pathlib import Path
from PIL import Image, ImageDraw

COLORS = {  # Hintergrund, Kacheln
    'volt':    ('#16181b', '#c8f03c'),
    'koralle': ('#e8364f', '#ffffff'),
    'ozean':   ('#2a5ae8', '#ffffff'),
    'violett': ('#6d3fe6', '#ffffff'),
}
SS = 4  # Supersampling für glatte Kanten
ROOT = Path(__file__).resolve().parent.parent / 'icons'


def draw(size, bg, fg, rounded=True, inset=0.0, alpha=True):
    S = size * SS
    im = Image.new('RGBA' if alpha else 'RGB', (S, S), (0, 0, 0, 0) if alpha else bg)
    d = ImageDraw.Draw(im)
    if rounded:
        d.rounded_rectangle((0, 0, S - 1, S - 1), radius=int(S * 0.22), fill=bg)
    else:
        d.rectangle((0, 0, S, S), fill=bg)
    # Raster aus dem Original: Start 82, Kachel 66, Abstand 94 (bei 512 px)
    scale = (1 - 2 * inset)
    off = S * inset
    k = S / 512 * scale
    for r in range(4):
        for c in range(4):
            x = off + (82 + c * 94) * k
            y = off + (82 + r * 94) * k
            d.rounded_rectangle((x, y, x + 66 * k, y + 66 * k), radius=14 * k, fill=fg)
    return im.resize((size, size), Image.LANCZOS)


for name, (bg, fg) in COLORS.items():
    out = ROOT / name
    out.mkdir(parents=True, exist_ok=True)
    draw(512, bg, fg).save(out / 'icon-512.png')
    draw(192, bg, fg).save(out / 'icon-192.png')
    draw(32, bg, fg).save(out / 'favicon-32.png')
    # Maskable: Logo in der sicheren Zone (innere 80 %)
    draw(512, bg, fg, rounded=False, inset=0.12).save(out / 'maskable-512.png')
    # iOS rundet selbst ab: volle Fläche, ohne Transparenz
    draw(180, bg, fg, rounded=False, alpha=False).save(out / 'apple-touch-icon.png')
    print('ok', name)
