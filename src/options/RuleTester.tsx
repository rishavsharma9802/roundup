import { useEffect, useMemo, useState } from 'react'
import type { Settings } from '../shared/types'
import { matchUrl } from '../shared/rules'
import { isGroupableUrl } from '../shared/url'
import { getSiteCatalog, onCatalogChanged, type SiteCatalog } from '../shared/site-catalog'

interface OpenTab {
  title: string
  url: string
}

interface Props {
  settings: Settings
}

const SOURCE_LABEL: Record<string, string> = {
  rule: 'your rule',
  catalog: 'site catalog',
  category: 'built-in',
  heuristic: 'guessed',
  domain: 'by site',
}

/**
 * Live rule tester.
 *
 * The whole point is to make a regex mistake visible *before* it reshuffles a
 * window full of tabs: type or pick a URL and see exactly which rule claims it
 * and what group it would land in.
 */
export default function RuleTester({ settings }: Props) {
  const [url, setUrl] = useState('')
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([])
  const [catalog, setCatalog] = useState<SiteCatalog>({})

  useEffect(() => {
    let cancelled = false
    void chrome.tabs.query({}).then((tabs) => {
      if (cancelled) return
      const usable = tabs
        .filter((t) => t.url && isGroupableUrl(t.url))
        .map((t) => ({ title: t.title ?? t.url ?? '', url: t.url as string }))
      // De-duplicate by URL so the picker is not full of repeats.
      const seen = new Set<string>()
      setOpenTabs(usable.filter((t) => (seen.has(t.url) ? false : (seen.add(t.url), true))))
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    void getSiteCatalog().then(setCatalog)
    return onCatalogChanged(setCatalog)
  }, [])

  const result = useMemo(() => {
    const trimmed = url.trim()
    if (!trimmed) return null
    if (!isGroupableUrl(trimmed)) {
      return { kind: 'invalid' as const }
    }
    const match = matchUrl(trimmed, settings, {
      catalog,
      useHeuristics: settings.useHeuristics,
    })
    return match ? { kind: 'match' as const, match } : { kind: 'none' as const }
  }, [url, settings, catalog])

  return (
    <section className="tg-card">
      <h2 className="tg-card-title">Test a URL</h2>
      <p className="tg-card-sub">
        Check where a page would land before you commit to a rule. Matching is case-insensitive.
      </p>

      <div className="tg-tester-row">
        <input
          className="tg-mono tg-tester-input"
          value={url}
          spellCheck={false}
          placeholder="https://acme.atlassian.net/wiki/spaces/ENG/overview"
          aria-label="URL to test"
          onChange={(e) => setUrl(e.target.value)}
        />
        <select
          className="tg-tester-pick"
          value=""
          aria-label="Pick one of your open tabs"
          onChange={(e) => e.target.value && setUrl(e.target.value)}
        >
          <option value="">Pick an open tab…</option>
          {openTabs.map((tab) => (
            <option key={tab.url} value={tab.url}>
              {tab.title.slice(0, 70)}
            </option>
          ))}
        </select>
      </div>

      {result?.kind === 'invalid' && (
        <p className="tg-verdict tg-verdict-none">
          That is not a groupable URL. Browser-internal pages are always left alone.
        </p>
      )}

      {result?.kind === 'none' && (
        <p className="tg-verdict tg-verdict-none">
          No rule matched, and the fallback is set to leave unmatched tabs alone — this tab would
          stay ungrouped.
        </p>
      )}

      {result?.kind === 'match' && (
        <div className="tg-verdict tg-verdict-hit">
          <div className="tg-verdict-head">
            <span className="tg-dot" data-color={result.match.color} />
            <strong>{result.match.groupName}</strong>
            <span className={'tg-badge tg-badge-' + result.match.source}>
              {SOURCE_LABEL[result.match.source] ?? result.match.source}
            </span>
          </div>
          <p className="tg-verdict-why">{result.match.reason}</p>
        </div>
      )}
    </section>
  )
}
