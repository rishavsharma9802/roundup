"""
Compose Chrome Web Store screenshots (1280x800) from real UI captures.

The captures themselves are untouched screenshots of the extension running.
This script only places them on a branded backdrop with a short caption, which
is what the store's 1280x800 slot expects. Nothing is mocked or embellished.

Run after scripts/capture-store-shots.mjs:
    python3 scripts/compose-store-shots.py
"""
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from pathlib import Path

RAW = Path("store/raw")
OUT = Path("store/screenshots")
OUT.mkdir(parents=True, exist_ok=True)

W, H = 1280, 800

# Brand tokens, lifted from src/shared/theme.css so the store matches the UI.
BG_TOP = (244, 248, 250)
BG_BOT = (223, 238, 240)
INK = (15, 26, 36)
MUTED = (88, 105, 123)
ACCENT = (13, 148, 136)

FONTS = "/usr/share/fonts/truetype/liberation/"


def font(name, size):
    try:
        return ImageFont.truetype(FONTS + name, size)
    except OSError:
        return ImageFont.load_default()


F_TITLE = font("LiberationSans-Bold.ttf", 44)
F_TITLE_SM = font("LiberationSans-Bold.ttf", 38)
F_SUB = font("LiberationSans-Regular.ttf", 22)
F_MONO = font("LiberationMono-Regular.ttf", 19)


def backdrop():
    """Soft vertical wash so the capture has something to sit on."""
    img = Image.new("RGB", (W, H), BG_TOP)
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / (H - 1)
        d.line([(0, y), (W, y)],
               fill=tuple(int(BG_TOP[i] + (BG_BOT[i] - BG_TOP[i]) * t) for i in range(3)))
    return img


def rounded(im, radius=14):
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, im.size[0] - 1, im.size[1] - 1], radius=radius, fill=255)
    out = im.convert("RGBA")
    out.putalpha(mask)
    return out


def paste_with_shadow(canvas, shot, xy, radius=14):
    card = rounded(shot, radius)
    x, y = xy
    pad = 46
    shadow = Image.new("RGBA", (card.width + pad * 2, card.height + pad * 2), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        [pad, pad + 6, pad + card.width, pad + 6 + card.height],
        radius=radius, fill=(15, 26, 36, 58))
    shadow = shadow.filter(ImageFilter.GaussianBlur(20))
    canvas.paste(shadow, (x - pad, y - pad), shadow)
    canvas.paste(card, (x, y), card)


def fit(path, max_w=None, max_h=None):
    im = Image.open(path).convert("RGB")
    scale = 1.0
    if max_w:
        scale = min(scale, max_w / im.width)
    if max_h:
        scale = min(scale, max_h / im.height)
    im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))),
                   Image.LANCZOS)
    return im


def caption(d, title, sub, x, y, title_font=F_TITLE):
    """Accent rule, headline, then the supporting lines."""
    d.rounded_rectangle([x, y - 24, x + 54, y - 19], radius=3, fill=ACCENT)
    d.text((x, y), title, font=title_font, fill=INK)
    yy = y + (62 if title_font is F_TITLE else 54)
    for line in sub.split("\n"):
        d.text((x, yy), line, font=F_SUB, fill=MUTED)
        yy += 32


def tile_popup():
    """Portrait capture suits a caption beside it."""
    c = backdrop()
    d = ImageDraw.Draw(c)
    im = fit(RAW / "popup.png", max_h=700)
    paste_with_shadow(c, im, (W - im.width - 95, (H - im.height) // 2))
    caption(d, "Every tab in its place",
            "One click sorts the window into Chrome tab\n"
            "groups. Rename any group and the name is\n"
            "yours for good.", 80, 270)
    c.save(OUT / "01-popup.png")


def tile_rules():
    """Landscape card sits better under the caption."""
    c = backdrop()
    d = ImageDraw.Draw(c)
    caption(d, "Your rules decide",
            "Regex, wildcard or domain — matched against the whole address, so Jira and\n"
            "Confluence land in different groups even though they share one host.",
            80, 76)
    im = fit(RAW / "card-rules.png", max_w=1080, max_h=540)
    paste_with_shadow(c, im, ((W - im.width) // 2, H - im.height - 60))
    c.save(OUT / "02-rules.png")


def tile_tester():
    c = backdrop()
    d = ImageDraw.Draw(c)
    caption(d, "Check before you commit",
            "Paste a URL, or pick one of your open tabs, and see exactly which rule\n"
            "claims it and where it would land — before it touches your tabs.",
            80, 76)
    im = fit(RAW / "card-tester.png", max_w=1080, max_h=430)
    paste_with_shadow(c, im, ((W - im.width) // 2, 300))
    c.save(OUT / "03-tester.png")


def tile_catalog():
    c = backdrop()
    d = ImageDraw.Draw(c)
    caption(d, "Learns the long tail",
            "Hundreds of sites known out of the box. Anything else is worked out from its\n"
            "address and remembered — so a wrong guess is one dropdown away from fixed.",
            80, 76)
    im = fit(RAW / "card-catalog.png", max_w=1080, max_h=520)
    paste_with_shadow(c, im, ((W - im.width) // 2, H - im.height - 70))
    c.save(OUT / "04-catalog.png")


def tile_privacy():
    """No UI to show here — the claim itself is the feature."""
    c = backdrop()
    d = ImageDraw.Draw(c)

    icon = Image.open("public/icons/icon128.png").convert("RGBA")
    icon = icon.resize((104, 104), Image.LANCZOS)
    c.paste(icon, ((W - 104) // 2, 150), icon)

    title = "Nothing leaves your browser"
    tw = d.textlength(title, font=F_TITLE)
    d.text(((W - tw) / 2, 300), title, font=F_TITLE, fill=INK)

    for i, line in enumerate([
        "No server. No account. No analytics. No remote code.",
        "Roundup makes no network requests at all.",
    ]):
        lw = d.textlength(line, font=F_SUB)
        d.text(((W - lw) / 2, 372 + i * 32), line, font=F_SUB, fill=MUTED)

    # The verifiable part, in a code-ish plate — the claim is checkable.
    plate_w, plate_h = 740, 128
    px, py = (W - plate_w) // 2, 500
    d.rounded_rectangle([px, py, px + plate_w, py + plate_h], radius=12,
                        fill=(255, 255, 255), outline=(214, 226, 232), width=1)
    note = "The build fails if any of these reach the shipped bundle:"
    nw = d.textlength(note, font=F_SUB)
    d.text(((W - nw) / 2, py + 24), note, font=F_SUB, fill=MUTED)
    code = "fetch   XMLHttpRequest   WebSocket   sendBeacon"
    cw = d.textlength(code, font=F_MONO)
    d.text(((W - cw) / 2, py + 72), code, font=F_MONO, fill=ACCENT)

    c.save(OUT / "05-privacy.png")


for fn in (tile_popup, tile_rules, tile_tester, tile_catalog, tile_privacy):
    fn()

for p in sorted(OUT.glob("*.png")):
    im = Image.open(p)
    print(f"{p.name}: {im.width}x{im.height}")
