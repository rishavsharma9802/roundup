# Roundup

**Every tab in its place.**

A Chrome extension (Manifest V3) that sorts the tabs in a window into Chrome tab
groups — by rules you write, or by categories it already knows, or by working it
out from the address when it has never seen a site before.

[![CI](https://github.com/rishavsharma9802/roundup/actions/workflows/ci.yml/badge.svg)](https://github.com/rishavsharma9802/roundup/actions/workflows/ci.yml)
[![CodeQL](https://github.com/rishavsharma9802/roundup/actions/workflows/codeql.yml/badge.svg)](https://github.com/rishavsharma9802/roundup/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

No server, no account, no analytics, no remote code. The extension makes no
network requests at all — there is nowhere for your browsing to go, and you can
check that claim yourself in about a minute:

```bash
npm run build && npm run verify
```

Among other things, that fails the build if `fetch`, `XMLHttpRequest`,
`WebSocket` or `sendBeacon` ever appear in the shipped bundle.

---

## The part that is actually different

Every tab organiser can sort well-known sites. They all fall apart on the long
tail — a shop on a vanity domain, somebody's tutorial blog, a streaming service
that launched last month.

Roundup handles that in two steps.

**It guesses from the shape of the address.** A `.shop` domain, a hostname
starting `shop` or ending `kart`, a `/collections/` path (the signature every
Shopify store carries) — all of it reads as Shopping without anyone having
listed that site anywhere.

**Then it writes the guess down, and shows you.** After a run the popup says
*Worked out for you — warriorworld.in filed under Shopping*, with a dropdown on
it. A wrong guess gets caught in the moment instead of quietly hardening into a
wrong answer you never see.

And when something lands in the wrong place, the popup's **Doesn't fit?** panel
lists the tab you are on plus anything still ungrouped. Pick a group and that
site is filed permanently, every open tab on it moves immediately, and every
future tab on it lands right. One correction, once.

---

## Installing

**Not on the Chrome Web Store yet.** The listing link will live here once it is
published.

Until then — or if you would rather run your own build — see
[Building from source](#building-from-source) below.

---

## How it decides

Every tab is checked in this order. First match wins, and nothing below ever
overrules something above it.

| | Layer | What it is |
| --- | --- | --- |
| 1 | **Your rules** | Regex, wildcard or domain, matched against the *whole URL* |
| 2 | **The site catalog** | Sites you filed by hand, and sites Roundup taught itself |
| 3 | **Built-in categories** | ~530 known sites across 15 categories |
| 4 | **Hostname shape** | TLD, hostname labels, prefixes and suffixes, site name |
| 5 | **URL path** | `/collections/`, `/watch`, `/blog/` — only when the hostname says nothing |
| 6 | **The domain itself** | So an unknown site still clusters with itself rather than vanishing |

Layers 4 and 5 are guesses and can be switched off. Layers 1–3 are decisions,
and a decision always beats a guess.

### Why rules see the whole URL

Because two products often share one host. This is the case the extension was
built for:

| Group | Type | Pattern |
| --- | --- | --- |
| Jira | regex | `^https://[^/]+\.atlassian\.net/(jira\|browse\|secure)/` |
| Confluence | regex | `^https://[^/]+\.atlassian\.net/wiki/` |

One hostname, two groups. The options page ships this pair as a one-click
preset. Matching is case-insensitive throughout, because everyone expects
`/Jira` to match `/jira`.

### Rule types

- **Regex** — a full regular expression against the whole URL. Most powerful.
- **Wildcard** — `*` matches any run of characters, `?` matches one.
- **Domain** — a hostname, which also covers its subdomains, so `github.com`
  catches `gist.github.com`.

Patterns are checked before they are saved. A repeat nested inside another
repeat — `(a+)+`, `([a-z]+)*` — is refused with an explanation, because nine
characters of that can hang the service worker for ever. At run time any pattern
spending more than 25ms on a single URL is skipped for the rest of the run.

### Built-in categories

Code · Docs · Work · Comms · Cloud · AI · Drive · Learn · News · Social · Media ·
Shopping · Finance · Search · Travel

The tables in [`src/shared/categories.ts`](src/shared/categories.ts) are meant to
be edited. Adding a site is a one-line change, and both your rules and your site
catalog outrank them, so nothing there can override a decision you made.

### What it never touches

- Pinned tabs, and browser-internal pages Chrome refuses to group
- Groups you locked from the popup — a lock wins even over a forced regroup
- Groups you named yourself, while *Leave groups I made myself alone* is on
- The title or colour of any group that already exists. Rename a group and the
  name sticks: groups are tracked by a stable identity, not by what they are
  called.

---

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Alt+Shift+G` | Group tabs in the current window |
| `Alt+Shift+Z` | Undo the last grouping |

Undo restores by title rather than by group id, because a group ceases to exist
the moment its last tab leaves and takes its id with it.

---

## Privacy

The full policy is in [PRIVACY.md](PRIVACY.md). The short version:

- Tab addresses are read during a grouping run and held in memory. They are not
  written down.
- The site catalog stores **domain names only** — `example.com`, never the page
  you were on — in local browser storage. Every entry is visible and editable
  under **Options → Site catalog**.
- Your rules and settings use `chrome.storage.sync`, so Chrome copies them
  between profiles you are signed into. That is Google's sync, going to your own
  account. It is the only thing that leaves the device, and it never comes here.
- There is no telemetry, no identifiers, and nothing is sold or shared.

### Permissions

| Permission | Why |
| --- | --- |
| `tabs` | Read tab addresses and titles — how each tab's group is decided |
| `tabGroups` | Create, name, colour and reuse groups; recognise yours and leave them alone |
| `storage` | Keep your rules, settings and site catalog |
| `favicon` | Show site icons in the popup, from the icon Chrome already cached |

No host permissions and no content scripts, so the extension cannot read or
alter the pages you visit.

---

## Building from source

```bash
npm install
npm run build      # typechecks, then builds into dist/
```

Then in Chrome:

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and choose this project's `dist/` folder

After changing anything, re-run `npm run build` and press reload on the
extension card. `npm run dev` rebuilds as you edit.

## Development

```bash
npm test            # vitest — rules engine, URL handling, categories, catalog
npm run typecheck   # tsc, no emit
npm run build       # typecheck + production build into dist/
npm run verify      # check what would actually ship
npm run zip         # build, verify, then package dist/ for the Web Store
npm run smoke       # load the built extension into real Chromium and drive it
```

`npm run smoke` needs a Chromium binary; set `CHROME_BIN` if Playwright's own
download is not present.

### Layout

```
src/
├── background/     service worker
│   ├── index.ts    event wiring: messages, commands, optional auto-group
│   └── grouper.ts  grouping run, filing a site, undo, window state
├── popup/          toolbar popup, including the "Doesn't fit?" panel
├── options/        settings, rule editor, live URL tester, site catalog
├── dashboard/      full-page visual map (later phase)
└── shared/
    ├── rules.ts         the matcher — pure, dependency-free, unit tested
    ├── categories.ts    domain tables and the hint layers
    ├── site-catalog.ts  learned and hand-filed sites
    ├── group-registry.ts  stable identity -> Chrome group id
    └── links.ts         the only strings that point at the maintainer
```

`src/shared/rules.ts` touches no Chrome APIs, which is why it can be tested
directly and reused unchanged by the live tester in the options page.

### Continuous integration

**`ci.yml`** — on every push and pull request, Node 20 and 22. Installs with
`npm ci`, so a lockfile that disagrees with `package.json` fails the run. Tests,
builds (typechecking first), then verifies the package. On Node 22 it zips the
result and attaches it to the run, so the artifact uploaded to the store is
built from a clean checkout and cannot carry anything from a developer machine.

**`codeql.yml`** — GitHub's static analysis with the `security-extended` suite,
plus a weekly scheduled run. Extended rather than default because it includes
the regular-expression complexity queries, and this codebase compiles regular
expressions that users type.

**`dependabot.yml`** — weekly updates. Build tooling is grouped into one PR;
anything that ships to users stays on its own so it gets read properly.

The audit job splits the two cases: anything in production dependencies fails
the run, because React and React DOM are the only things that reach users.
Vite and Vitest are reported but never fatal — they never leave the build
machine.

### What `npm run verify` checks

Each check maps to a way an extension has genuinely been rejected or embarrassed
itself:

- `manifest.json` sits at the root of the package, not nested in a folder
- no source maps, TypeScript, `.env`, `.DS_Store` or design sources ship
- the bundle contains no `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`,
  `EventSource` or `importScripts` — the no-network claim is about the built
  artifact, so it is checked there
- no `eval` or `new Function`, which Manifest V3 forbids
- every declared permission is matched by an API call that justifies it; an
  unused permission is a reviewer asking "why do you need this?" with no answer
- no host permissions, no content scripts
- every icon the manifest promises is present

It runs in CI and inside `npm run zip`, so a package that fails it cannot be
produced by accident.

---

## Contributing

**The most useful thing you can send is a site.** The category tables will
always lag the web — that is the nature of them — and a one-line addition to
[`src/shared/categories.ts`](src/shared/categories.ts) helps everyone.

If a site lands in the wrong group, the flag icon next to it in the popup opens
a pre-filled issue. Only the domain travels in that link, never the full
address, and you see the issue before anything is submitted.

For code changes: `npm test` and `npm run verify` both have to pass, and new
matching behaviour wants a test in `src/shared/categories.test.ts` or
`rules.test.ts`. Some tests exist specifically to pin behaviour that is easy to
break by accident — the one asserting the Jira preset is still a valid pattern,
and the one keeping `photoshop.com` out of Shopping, are both load-bearing.

## Licence

MIT — see [LICENSE](LICENSE).
