# Brand assets

The mark is a bracket — a nod to the regex rules that drive the product —
holding two tabs gathered inside it.

`icon-store.svg` is the master. Its rim is drawn *inside* the artwork box so the
outer edge lands exactly on 16px, preserving the transparent padding the Chrome
Web Store requires on a 128×128 store icon. It renders `icon128.png`.

`icon-toolbar.svg` is the same mark for small sizes: almost no padding, heavier
strokes, and the inner lines shortened and pushed apart so they still read at 16
physical pixels. It renders `icon16/32/48.png`.

## Why the badge has a teal rim

The badge is flat `#0f1a24`. Chrome's dark toolbar is `#202124` — close enough
that a bare badge loses its silhouette entirely and the icon dissolves into the
strip. The `#2dd4bf` rim gives it an edge to hold on dark, and costs nothing on
light. Do not remove it without checking the result against a dark toolbar at 16
physical pixels; it looks like a decorative flourish at 128 and is doing real
work at 16.

Accents are `--tg-accent` (`#2dd4bf`) and `--tg-sky` (`#38bdf8`) from
`src/shared/theme.css`; nothing here introduces a colour the UI does not already
use.

`promo-440x280.svg` is the small promotional tile for the store listing. No text,
because the store shrinks it by half.

Regenerate the PNGs after editing any of these:

```bash
pip install cairosvg
python3 -c "
import cairosvg, pathlib
small = pathlib.Path('design/icon-toolbar.svg').read_bytes()
master = pathlib.Path('design/icon-store.svg').read_bytes()
for s in (16, 32, 48):
    cairosvg.svg2png(bytestring=small, write_to=f'public/icons/icon{s}.png', output_width=s, output_height=s)
cairosvg.svg2png(bytestring=master, write_to='public/icons/icon128.png', output_width=128, output_height=128)
cairosvg.svg2png(bytestring=pathlib.Path('design/promo-440x280.svg').read_bytes(), write_to='store/promo-440x280.png', output_width=440, output_height=280)
"
```
