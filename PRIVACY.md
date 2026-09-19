# Privacy Policy for Roundup

**Last updated: 24 August 2026**

Roundup is a Chrome extension that sorts your open tabs into Chrome tab groups.
It has no server, no account and no analytics. Nothing it reads or stores is
ever sent to the developer or to anyone else, because there is nowhere for it to
be sent — the extension makes no network requests of any kind.

## What Roundup reads

During a grouping run, Roundup reads the **address and title of the tabs in the
current window**. It needs the address to decide which group a tab belongs to.
These are held in memory for the length of the run and are not written down.

## What Roundup stores, and where

All of it lives in your own browser, through Chrome's extension storage.

| What | Where | Notes |
| --- | --- | --- |
| Your rules and preferences | `chrome.storage.sync` | Chrome copies these between Chrome profiles you are signed into, using Google's own sync. This is the one thing that leaves the device, and it goes to your Google account — never to us. |
| The site catalog | `chrome.storage.local` | **Domain names only** (`example.com`), never full page addresses, never page content. Capped at 600 entries. |
| Which tab group belongs to which category | `chrome.storage.local` | Chrome group IDs and titles, so a group you renamed keeps its name. |
| The undo snapshot | `chrome.storage.session` | Discarded when you close the browser. |

### About the site catalog

When Roundup meets a site it does not recognise, it works out a category from
the shape of the address and writes that verdict down, so the site is filed
consistently instead of being re-guessed every time. Only the domain name is
recorded — `example.com`, not the page you were on.

Every entry is visible in **Options → Site catalog**, where you can change its
category, delete it individually, or clear everything Roundup has learned. You
can also switch the whole behaviour off with **"Guess a category for sites I
have never opened"**.

## What Roundup never does

- No data is transmitted anywhere. The extension makes no network requests.
- No analytics, telemetry, crash reporting or usage tracking.
- No accounts, no sign-in, no identifiers of any kind.
- Nothing is sold, rented or shared with third parties.
- No advertising, and no use of your data to target advertising.
- Your data is never used to assess creditworthiness or for lending purposes.

## Permissions, and why each one is needed

- **`tabs`** — to read the address and title of your tabs, which is how Roundup
  decides where each one belongs.
- **`tabGroups`** — to create, name, colour and reuse Chrome tab groups, and to
  recognise groups you made yourself so it leaves them alone.
- **`storage`** — to keep your rules, preferences and site catalog.
- **`favicon`** — to show each site's icon in the popup, using the icon Chrome
  has already cached. No request is made to the site.

Roundup asks for no host permissions and runs no content scripts, so it cannot
read, alter or inject anything into the pages you visit.

## Removing your data

Uninstalling Roundup removes everything it has stored. Short of that, **Options
→ Site catalog** lets you delete entries one at a time or forget every learned
site at once.

## Changes to this policy

If this policy changes, the date at the top changes with it, and the current
version always lives at this address.

## Contact

Questions about privacy, or anything else: **kungfupanda792@gmail.com**
