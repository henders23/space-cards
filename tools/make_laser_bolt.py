"""Generate a glowing energy-bolt sprite for the player's laser projectile.

The old player_bolt.png was a grey rocket with windows — it read as a missile,
not a beam weapon. This draws a proper laser bolt: a hot white leading head with
a cyan energy streak tapering into a tail, plus a soft outer glow. It is oriented
vertically (nose up) to match how runProjectile() rotates it into flight.
"""
from PIL import Image, ImageDraw, ImageFilter

# Work at 3x then downsample for clean anti-aliased edges.
S = 3
W, H = 48 * S, 150 * S
cx = W // 2

# Palette (cyan energy weapon), matches the "#4fd8ff" glow the renderer adds.
GLOW = (79, 216, 255)     # outer aura
EDGE = (120, 232, 255)    # capsule rim
CORE = (196, 246, 255)    # inner core
HOT  = (255, 255, 255)    # white-hot centre / head

NOSE = 14 * S             # y of the leading head
TAIL = H - 12 * S         # y where the streak fades out


def streak(draw, half_top, half_bot, y0, y1, fill):
    """A vertical streak: width `half_top*2` at the nose tapering to
    `half_bot*2` at the tail, built from stacked ellipses."""
    steps = 60
    for i in range(steps + 1):
        t = i / steps
        y = y0 + (y1 - y0) * t
        hw = half_top + (half_bot - half_top) * t
        draw.ellipse([cx - hw, y - hw, cx + hw, y + hw], fill=fill)


# --- outer glow: a fat soft streak, blurred ---
glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
streak(ImageDraw.Draw(glow), 15 * S, 6 * S, NOSE, TAIL, GLOW + (150,))
glow = glow.filter(ImageFilter.GaussianBlur(9 * S))

# --- the bolt body: nested streaks from wide/cyan to narrow/white-hot ---
body = Image.new("RGBA", (W, H), (0, 0, 0, 0))
bd = ImageDraw.Draw(body)
streak(bd, 8.5 * S, 1.5 * S, NOSE + 2 * S, TAIL - 4 * S, EDGE + (255,))
streak(bd, 5.0 * S, 0.8 * S, NOSE + 1 * S, TAIL - 22 * S, CORE + (255,))
streak(bd, 2.6 * S, 0.5 * S, NOSE,         TAIL - 46 * S, HOT + (255,))
body = body.filter(ImageFilter.GaussianBlur(1.1 * S))

# --- bright white-hot leading head ---
head = Image.new("RGBA", (W, H), (0, 0, 0, 0))
hr = 7 * S
ImageDraw.Draw(head).ellipse([cx - hr, NOSE - hr, cx + hr, NOSE + hr], fill=HOT + (255,))
head = head.filter(ImageFilter.GaussianBlur(2.0 * S))

out = Image.alpha_composite(glow, body)
out = Image.alpha_composite(out, head)

out = out.resize((48, 150), Image.LANCZOS)
out.save("assets/fx/player_bolt.png")
print("wrote assets/fx/player_bolt.png", out.size)
