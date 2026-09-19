import { useEffect, useMemo, useState } from 'react'
import { CATEGORIES, categoryNames } from '../shared/categories'
import {
  catalogKey,
  clearLearned,
  getSiteCatalog,
  onCatalogChanged,
  removeSite,
  setSiteCategory,
  sortedEntries,
  type SiteCatalog,
} from '../shared/site-catalog'

const NAMES = categoryNames()

/**
 * The site catalog panel.
 *
 * Two audiences in one list: sites the extension taught itself while grouping,
 * and sites the user filed by hand. Both are editable here, because the whole
 * point of writing a guess down is that a wrong guess becomes fixable.
 */
export default function SiteCatalogPanel() {
  const [catalog, setCatalog] = useState<SiteCatalog>({})
  const [draftDomain, setDraftDomain] = useState('')
  const [draftCategory, setDraftCategory] = useState(NAMES[0])
  const [filter, setFilter] = useState('')

  useEffect(() => {
    void getSiteCatalog().then(setCatalog)
    return onCatalogChanged(setCatalog)
  }, [])

  const entries = useMemo(() => {
    const all = sortedEntries(catalog)
    const needle = filter.trim().toLowerCase()
    if (!needle) return all
    return all.filter(
      (e) => e.domain.includes(needle) || e.category.toLowerCase().includes(needle),
    )
  }, [catalog, filter])

  const learnedCount = useMemo(
    () => Object.values(catalog).filter((e) => e.source === 'auto').length,
    [catalog],
  )

  const builtInCount = useMemo(
    () => CATEGORIES.reduce((sum, c) => sum + c.domains.length, 0),
    [],
  )

  const addSite = async () => {
    const key = catalogKey(draftDomain)
    if (!key) return
    setCatalog(await setSiteCategory(key, draftCategory))
    setDraftDomain('')
  }

  const changeCategory = async (domain: string, category: string) => {
    setCatalog(await setSiteCategory(domain, category))
  }

  const forget = async (domain: string) => {
    setCatalog(await removeSite(domain))
  }

  const forgetLearned = async () => {
    setCatalog(await clearLearned())
  }

  return (
    <section className="tg-card">
      <div className="tg-card-head">
        <div>
          <h2 className="tg-card-title">Site catalog</h2>
          <p className="tg-card-sub">
            {builtInCount} sites are recognised out of the box. Anything else is worked out from
            the shape of its address and written down here, so the next visit is a known site
            rather than a fresh guess — and so a wrong guess is one dropdown away from being
            fixed. Entries here beat the built-in categories.
          </p>
        </div>
        {learnedCount > 0 && (
          <div className="tg-card-actions">
            <button className="tg-btn tg-btn-ghost" onClick={forgetLearned}>
              Forget {learnedCount} learned {learnedCount === 1 ? 'site' : 'sites'}
            </button>
          </div>
        )}
      </div>

      <div className="tg-cat-add">
        <input
          className="tg-mono"
          value={draftDomain}
          spellCheck={false}
          placeholder="devopscube.com"
          aria-label="Site to file"
          onChange={(e) => setDraftDomain(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void addSite()
          }}
        />
        <select
          value={draftCategory}
          aria-label="Category for this site"
          onChange={(e) => setDraftCategory(e.target.value)}
        >
          {NAMES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <button className="tg-btn tg-btn-solid" onClick={addSite} disabled={!draftDomain.trim()}>
          File this site
        </button>
      </div>
      <p className="tg-field-hint">
        A whole URL works too — it is reduced to its domain. Sub-domains follow their parent, so
        filing <code>acme.com</code> also covers <code>shop.acme.com</code>.
      </p>

      {Object.keys(catalog).length === 0 ? (
        <p className="tg-empty">
          Nothing filed yet. Run a grouping pass and any unrecognised site that looks like a
          shop, a stream or a tutorial will appear here.
        </p>
      ) : (
        <>
          {Object.keys(catalog).length > 8 && (
            <input
              className="tg-cat-filter"
              value={filter}
              placeholder="Filter by site or category…"
              aria-label="Filter the catalog"
              onChange={(e) => setFilter(e.target.value)}
            />
          )}
          <ul className="tg-cat-list">
            {entries.map((entry) => (
              <li className="tg-cat-row" key={entry.domain}>
                <span className="tg-mono tg-cat-domain" title={entry.note ?? ''}>
                  {entry.domain}
                </span>
                <span className={'tg-badge tg-badge-' + entry.source}>
                  {entry.source === 'user' ? 'you' : 'learned'}
                </span>
                <select
                  value={entry.category}
                  aria-label={'Category for ' + entry.domain}
                  onChange={(e) => void changeCategory(entry.domain, e.target.value)}
                >
                  {NAMES.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                  {!NAMES.includes(entry.category) && (
                    <option value={entry.category}>{entry.category}</option>
                  )}
                </select>
                <button
                  className="tg-icon-btn tg-delete"
                  title={'Forget ' + entry.domain}
                  aria-label={'Forget ' + entry.domain}
                  onClick={() => void forget(entry.domain)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          {entries.length === 0 && <p className="tg-empty">No catalog entry matches that.</p>}
        </>
      )}
    </section>
  )
}
