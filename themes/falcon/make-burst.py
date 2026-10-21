# Sunburst glow behind Laychan's car on Today (themes/falcon/burst.webp): spiky yellow/orange rays + hot centre,
# fading to transparent so it melts into the brush-stroke background. Run: python3 themes/falcon/make-burst.py
import os, math, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
random.seed(7)
W, H, S = 1000, 640, 2                      # draw at 2x then downsample for smooth edges
cx, cy = W * 0.54 * S, H * 0.50 * S
img = Image.new("RGBA", (W * S, H * S), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
d.ellipse((cx - W * S * .62, cy - H * S * .62, cx + W * S * .62, cy + H * S * .62), fill=(255, 112, 0, 255))  # orange base between the rays
R = max(W, H) * S * 0.75
n, a = 34, 0.0
for i in range(n):
    w = 2 * math.pi / n * random.uniform(0.35, 0.75)
    L = R * random.uniform(0.55, 1.0)
    ang = a + random.uniform(-0.04, 0.04); a += 2 * math.pi / n
    pts = [(cx, cy), (cx + L * math.cos(ang - w / 2), cy + L * math.sin(ang - w / 2)), (cx + L * 1.08 * math.cos(ang), cy + L * 1.08 * math.sin(ang)), (cx + L * math.cos(ang + w / 2), cy + L * math.sin(ang + w / 2))]
    col = random.choice([(255, 226, 20), (255, 204, 0), (255, 180, 0), (255, 240, 90)])
    d.polygon(pts, fill=col + (255,))
img = img.resize((W, H), Image.LANCZOS)
glow = Image.new("RGBA", (W, H), (0, 0, 0, 0)); g = ImageDraw.Draw(glow)
for r, c in [(330, (255, 150, 0, 90)), (240, (255, 200, 0, 150)), (150, (255, 240, 120, 230)), (90, (255, 252, 220, 255))]:
    g.ellipse((W * .54 - r * 1.4, H * .5 - r, W * .54 + r * 1.4, H * .5 + r), fill=c)
glow = glow.filter(ImageFilter.GaussianBlur(60))
img = Image.alpha_composite(img, glow)
# radial alpha fade to 0 at the edges
yy, xx = np.mgrid[0:H, 0:W]
dist = np.sqrt(((xx - W * .54) / (W * .5)) ** 2 + ((yy - H * .5) / (H * .5)) ** 2)
fade = np.clip((1.0 - dist) / 0.5, 0, 1) ** 1.4  # fully transparent before the image edge
arr = np.array(img).astype(float); arr[..., 3] *= fade
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "burst.webp")
Image.fromarray(arr.astype(np.uint8), "RGBA").save(out, "WEBP", quality=80, method=6)
print("wrote", out)
