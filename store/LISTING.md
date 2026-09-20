# Chrome Web Store listing

Everything the Developer Dashboard asks for, ready to paste. Keep this in sync
with `public/manifest.json` and `PRIVACY.md`.

---

## Store listing tab

**Name** (45 char limit — currently 39)

```
Roundup — Automatically Group Your Tabs
```

**Short description** (132 char limit — currently 113; this is the manifest
`description` field and must match it exactly)

```
Every tab in its place. Group tabs by your own rules or built-in categories — no server, no account, no analytics.
```

**Category:** Workflow & Planning
**Language:** English (United Kingdom)

**Detailed description**

```
Roundup sorts the tabs in a window into Chrome tab groups — in one click, or with a keyboard shortcut.

WHAT MAKES IT DIFFERENT

Most tab organisers handle well-known sites and fall apart on everything else: a shop on a vanity domain, someone's tutorial blog, a streaming service that launched last month. Roundup works those out from the shape of the address, remembers what it decided, and lets you correct it in one dropdown when it guesses wrong.

YOUR RULES COME FIRST

Write rules as a regular expression, a wildcard pattern, or a plain domain. They are matched against the whole address, not just the hostname — so two products sharing one host end up in different groups. Jira and Confluence both live on your-team.atlassian.net, and Roundup can still split them:

  Jira        ^https://[^/]+\.atlassian\.net/(jira|browse|secure)/
  Confluence  ^https://[^/]+\.atlassian\.net/wiki/

A live tester shows you exactly which rule claims a URL and where it would land, before anything touches your tabs.

THE NAME YOU GIVE A GROUP IS THE NAME IT KEEPS

Rename a group and Roundup follows that group by identity, not by title. Re-run it as often as you like — your names survive, and new matching tabs join the group you renamed instead of spawning a duplicate.

IT TELLS YOU WHY IT DID NOTHING

If a run moves no tabs, Roundup says which rule held them back — tabs already in groups you named, a group you locked, too few tabs to bother — and offers the one control that unblocks it. No silent no-ops.

ALSO

• Undo the last grouping (Alt+Shift+Z)
• Lock a group so Roundup never touches it
• Collapse new groups to keep the tab strip short
• Choose what happens to unmatched tabs: category, domain, or leave them alone
• Works entirely offline

PRIVACY

No server. No account. No analytics. No remote code. No host permissions and no content scripts — Roundup never runs code on the pages you visit, and it makes no network requests at all. Your rules sync through your own Google account via Chrome's built-in storage sync, and nothing else leaves the device.

The source is public and the build refuses to ship if fetch, XMLHttpRequest, WebSocket or sendBeacon ever appear in the bundle:
https://github.com/rishavsharma9802/roundup
```

---

## Privacy practices tab

**Single purpose**

```
Roundup organises the user's open browser tabs into Chrome tab groups.
```

**Permission justifications**

| Permission | Justification to paste |
| --- | --- |
| `tabs` | Roundup reads the address and title of the tabs in the current window to decide which group each tab belongs in, and moves tabs between groups. This is the core function of the extension. Addresses are used during the grouping run only and are never transmitted anywhere. |
| `tabGroups` | Roundup creates Chrome tab groups and sets their title, colour and collapsed state. This is how the extension delivers its single purpose. |
| `storage` | Roundup saves the user's own grouping rules and preferences, plus a local catalog of domain names it has already categorised, so the same decision is not recomputed on every run. All of it stays in Chrome's extension storage on the user's own device. |
| `favicon` | Roundup shows site icons next to entries in its own popup and options page so users can recognise sites at a glance. |

**Host permissions:** none requested.

**Remote code** — answer "No, I am not using remote code", then paste:

```
All code executed by Roundup ships inside the extension package. There are no script tags referencing remote sources, no eval or new Function, and no dynamically imported modules. The extension makes no network requests at all, and a continuous integration check fails the build if fetch, XMLHttpRequest, WebSocket or sendBeacon appear anywhere in the shipped bundle.
```

**Data usage — check these boxes**

Roundup collects none of the listed categories. Certify all three:

- [x] I do not sell or transfer user data to third parties, outside of approved use cases
- [x] I do not use or transfer user data for purposes unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**

```
https://github.com/rishavsharma9802/roundup/blob/main/PRIVACY.md
```

---

## Graphic assets

| Slot | File | Size | Required |
| --- | --- | --- | --- |
| Store icon | `public/icons/icon128.png` | 128×128 | Yes |
| Screenshots | `store/screenshots/01-popup.png` … `05-privacy.png` | 1280×800 | At least 1, max 5 |
| Small promo tile | `store/promo-440x280.png` | 440×280 | Optional but recommended |
| Marquee promo tile | — | 1400×560 | Optional |

Screenshots are genuine captures of the extension running, produced by:

```bash
npm run build
CHROME_BIN=<chrome> xvfb-run -a node scripts/capture-store-shots.mjs
python3 scripts/compose-store-shots.py
```


### Image format rules the dashboard enforces

Screenshots and both promo tiles must be **JPEG or 24-bit PNG with no alpha
channel** — an RGBA PNG is rejected at upload. The store icon is the exception:
it may keep transparency, and should, because the store expects padding around
the mark.

`scripts/compose-store-shots.py` already writes RGB. The promo tile comes from
cairosvg, which emits RGBA, so flatten it after regenerating:

```bash
python3 -c "
from PIL import Image
im = Image.open('store/promo-440x280.png')
im.convert('RGB').save('store/promo-440x280.png')
"
```

---

## Before you hit Submit

0. **Settings page** (once per account): set a publisher contact email and
   verify it. Nothing can be submitted until that address is verified.
1. `npm run zip` — builds, verifies, and writes `roundup.zip`
2. Upload `roundup.zip` under **Package**
3. Confirm the short description in the dashboard matches `manifest.description`
4. Make sure `PRIVACY.md` is reachable at the URL above (the repo must be public)
5. Set distribution: **Public**, and pick the regions you want

Review usually takes a few days. A listing that requests `tabs` gets read more
carefully than most, which is exactly why the justifications above are specific
about what is read and what is never sent.
