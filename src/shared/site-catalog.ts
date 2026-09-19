import { getRegistrableDomain } from './url'

/**
 * The learned site catalog.
 *
 * The built-in category tables can never keep up with the web: a new shopping
 * site, a new streaming service or somebody's tutorial blog will always be
 * missing. So the extension keeps its own growing list of "this domain belongs
 * to that category", written two ways:
 *
 *   auto - a grouping run matched a site by hint (see matchCategoryByHint) and
 *          recorded the verdict, so the site is now a known site rather than a
 *          guess that could drift if the hint rules ever change.
 *   user - you said so, from the options page. A user entry always wins and is
 *          never overwritten by the auto-learner.
 *
 * Catalog entries are consulted *before* the built-in tables, so correcting a
 * mistake is as simple as pointing the domain at a different category.
 */

export type CatalogSource = 'auto' | 'user'

export interface CatalogEntry {
  /** Registrable domain, lower-cased, no leading "www.". */
  domain: string
  /** Name of a built-in category (see categories.ts). */
  category: string
  source: CatalogSource
  addedAt: number
  /** How the auto-learner reached this verdict — shown in the options list. */
  note?: string
}

export type SiteCatalog = Record<string, CatalogEntry>

const CATALOG_KEY = 'siteCatalog'

/**
 * Upper bound on stored entries. Auto entries are evicted oldest-first when the
 * catalog grows past this; user entries are never evicted.
 */
export const MAX_CATALOG_ENTRIES = 600

/** Normalise anything the user might type into a catalog key. */
export function catalogKey(input: string): string {
  let value = input.trim().toLowerCase()
  if (!value) return ''
  // Accept a pasted URL as readily as a bare domain.
  if (value.includes('://')) {
    try {
      value = new URL(value).hostname
    } catch {
      /* fall through and treat it as text */
    }
  }
  value = value.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '')
  value = value.split('@').pop() ?? value
  value = value.split(':')[0]
  if (!value || !value.includes('.')) return value
  return getRegistrableDomain(value)
}

export async function getSiteCatalog(): Promise<SiteCatalog> {
  try {
    const stored = await chrome.storage.local.get(CATALOG_KEY)
    const value = stored[CATALOG_KEY] as SiteCatalog | undefined
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

export async function saveSiteCatalog(catalog: SiteCatalog): Promise<void> {
  await chrome.storage.local.set({ [CATALOG_KEY]: prune(catalog) })
}

/**
 * Drop the oldest auto-learned entries once the catalog outgrows its cap. User
 * entries are kept whatever happens — they are decisions, not guesses.
 */
export function prune(catalog: SiteCatalog): SiteCatalog {
  const keys = Object.keys(catalog)
  if (keys.length <= MAX_CATALOG_ENTRIES) return catalog

  const auto = keys
    .filter((k) => catalog[k]?.source === 'auto')
    .sort((a, b) => (catalog[a].addedAt ?? 0) - (catalog[b].addedAt ?? 0))

  const next = { ...catalog }
  let over = keys.length - MAX_CATALOG_ENTRIES
  for (const key of auto) {
    if (over <= 0) break
    delete next[key]
    over--
  }
  return next
}

/**
 * Find the catalog entry covering a hostname. Sub-domains inherit their parent
 * domain's entry, so teaching it "acme.com" also covers "shop.acme.com".
 */
export function lookupCatalog(catalog: SiteCatalog, hostname: string): CatalogEntry | null {
  let host = hostname.replace(/^www\./i, '').toLowerCase()
  if (!host) return null
  while (host.includes('.')) {
    const hit = catalog[host]
    if (hit) return hit
    host = host.slice(host.indexOf('.') + 1)
  }
  return catalog[host] ?? null
}

export interface LearnCandidate {
  domain: string
  category: string
  note?: string
}

/**
 * Record sites the hint matcher claimed. Anything already in the catalog is
 * left exactly as it is — an auto guess must never overwrite a user's decision,
 * nor churn an earlier auto verdict.
 *
 * Returns the entries actually added.
 */
export async function learnSites(candidates: LearnCandidate[]): Promise<CatalogEntry[]> {
  if (candidates.length === 0) return []
  const catalog = await getSiteCatalog()
  const added: CatalogEntry[] = []

  for (const candidate of candidates) {
    const key = catalogKey(candidate.domain)
    if (!key || catalog[key]) continue
    const entry: CatalogEntry = {
      domain: key,
      category: candidate.category,
      source: 'auto',
      addedAt: Date.now(),
      note: candidate.note,
    }
    catalog[key] = entry
    added.push(entry)
  }

  if (added.length > 0) await saveSiteCatalog(catalog)
  return added
}

/** Add or change an entry deliberately. Always stored as a user entry. */
export async function setSiteCategory(domain: string, category: string): Promise<SiteCatalog> {
  const key = catalogKey(domain)
  if (!key) return getSiteCatalog()
  const catalog = await getSiteCatalog()
  catalog[key] = {
    domain: key,
    category,
    source: 'user',
    addedAt: Date.now(),
  }
  await saveSiteCatalog(catalog)
  return catalog
}

export async function removeSite(domain: string): Promise<SiteCatalog> {
  const key = catalogKey(domain)
  const catalog = await getSiteCatalog()
  delete catalog[key]
  await saveSiteCatalog(catalog)
  return catalog
}

/** Forget every auto-learned entry, keeping the ones the user set by hand. */
export async function clearLearned(): Promise<SiteCatalog> {
  const catalog = await getSiteCatalog()
  for (const key of Object.keys(catalog)) {
    if (catalog[key].source === 'auto') delete catalog[key]
  }
  await saveSiteCatalog(catalog)
  return catalog
}

/** Entries sorted for display: user entries first, then newest learned first. */
export function sortedEntries(catalog: SiteCatalog): CatalogEntry[] {
  return Object.values(catalog).sort((a, b) => {
    if (a.source !== b.source) return a.source === 'user' ? -1 : 1
    return (b.addedAt ?? 0) - (a.addedAt ?? 0)
  })
}

/** Subscribe to catalog changes from any extension surface. */
export function onCatalogChanged(cb: (catalog: SiteCatalog) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[CATALOG_KEY]) {
      cb((changes[CATALOG_KEY].newValue as SiteCatalog | undefined) ?? {})
    }
  }
  chrome.storage.onChanged.addListener(listener)
  return () => chrome.storage.onChanged.removeListener(listener)
}
