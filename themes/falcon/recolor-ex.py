# Laychan's "falcon" theme: orange copies of the exercise illustrations (img/ex/*.webp -> img/ex-orange/*.webp).
# The originals are untouched. Recipe: HSV (PIL 0-255 scale), pixels with hue 120-180 and saturation > 60
# (the blue muscle highlight) get hue 18 (orange). Run: python3 themes/falcon/recolor-ex.py
import os, glob
import numpy as np
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
src, dst = os.path.join(ROOT, "img/ex"), os.path.join(ROOT, "img/ex-orange")
os.makedirs(dst, exist_ok=True)
for f in sorted(glob.glob(os.path.join(src, "*.webp"))):
    hsv = np.array(Image.open(f).convert("RGB").convert("HSV"))
    h, s = hsv[..., 0], hsv[..., 1]
    m = (h >= 120) & (h <= 180) & (s > 60)
    hsv[..., 0][m] = 18
    Image.fromarray(hsv, "HSV").convert("RGB").save(os.path.join(dst, os.path.basename(f)), "WEBP", quality=82, method=6)
print("recoloured", len(glob.glob(os.path.join(dst, "*.webp"))), "images into img/ex-orange/")
