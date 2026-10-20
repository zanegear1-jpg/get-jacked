#!/usr/bin/env python3
"""Make a friend's home-screen icons from their car artwork (friends-src/<slug>-car.jpg).

Writes <slug>/icons/: icon-192/512.png (purpose "any": the rounded-square artwork, transparent corners),
icon-maskable-192/512.png (full-bleed: artwork shrunk so the whole car sits inside the 80 % safe circle that
Android's circle/squircle masks keep, feathered onto a matching yellow-orange burst so nothing looks cut off),
apple-touch-icon-180.png (full-bleed, iOS has no transparency), favicon-32/48.png and badge-96.png.
Run: python3 scripts/friend-icons.py ben laychan   (needs Pillow)
"""
import sys, os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def rounded_mask(size, radius, feather=0):
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([feather, feather, size - 1 - feather, size - 1 - feather], radius, fill=255)
    return m.filter(ImageFilter.GaussianBlur(feather / 2)) if feather else m

def burst(size):
    """Radial yellow -> orange -> red gradient, the same palette as the artwork's comic burst."""
    import math
    stops = [(0.0, (255, 236, 90)), (0.45, (255, 196, 40)), (0.75, (250, 128, 22)), (1.0, (214, 64, 18))]
    im = Image.new("RGB", (size, size)); px = im.load(); c = size / 2; rmax = c * math.sqrt(2)
    for y in range(size):
        for x in range(size):
            t = min(1.0, math.hypot(x - c, y - c) / rmax * 1.25)
            for (t0, a), (t1, b) in zip(stops, stops[1:]):
                if t <= t1:
                    f = (t - t0) / (t1 - t0); px[x, y] = tuple(round(a[i] + (b[i] - a[i]) * f) for i in range(3)); break
    return im

def save(im, path):
    # 256-colour palette keeps the 512 px icons small (they are precached for offline use)
    q = im.quantize(256, method=Image.Quantize.FASTOCTREE) if im.mode == "RGBA" else im.quantize(256)
    q.save(path, optimize=True)

def make(slug):
    src = Image.open(os.path.join(ROOT, "friends-src", f"{slug}-car.jpg")).convert("RGB")
    S = src.width  # square artwork with a black rounded frame on white
    out = os.path.join(ROOT, slug, "icons"); os.makedirs(out, exist_ok=True)
    # "any": the artwork as drawn, white outside the frame made transparent
    anyi = src.convert("RGBA"); anyi.putalpha(rounded_mask(S, int(S * 0.14)))
    for px in (192, 512):
        save(anyi.resize((px, px), Image.LANCZOS), os.path.join(out, f"icon-{px}.png"))
    for px in (32, 48):
        anyi.resize((px, px), Image.LANCZOS).save(os.path.join(out, f"favicon-{px}.png"), optimize=True)
    # maskable / full-bleed: inner artwork (inside the frame) at 68 %, feathered onto a matching yellow-orange burst
    inset = int(S * 0.045); inner = src.crop((inset, inset, S - inset, S - inset))
    full = 1024
    bg = burst(full)
    fg_px = int(full * 0.68); fg = inner.resize((fg_px, fg_px), Image.LANCZOS).convert("RGBA")
    fg.putalpha(rounded_mask(fg_px, int(fg_px * 0.16), feather=int(fg_px * 0.05)))
    bleed = bg.convert("RGBA"); o = (full - fg_px) // 2; bleed.alpha_composite(fg, (o, o)); bleed = bleed.convert("RGB")
    for px in (192, 512):
        save(bleed.resize((px, px), Image.LANCZOS), os.path.join(out, f"icon-maskable-{px}.png"))
    bleed.resize((180, 180), Image.LANCZOS).save(os.path.join(out, "apple-touch-icon-180.png"), optimize=True)
    # monochrome notification badge: reuse the app's own (white dumbbell on transparent)
    Image.open(os.path.join(ROOT, "icons", "badge-96.png")).save(os.path.join(out, "badge-96.png"), optimize=True)
    print(slug, "->", out)

if __name__ == "__main__":
    for s in sys.argv[1:] or ["ben", "laychan"]: make(s)
