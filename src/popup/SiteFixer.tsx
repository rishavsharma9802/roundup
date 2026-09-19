import { categoryNames } from '../shared/categories'
import { LINKS, linksConfigured, reportSiteIssueUrl } from '../shared/links'
import type { LooseTab } from '../shared/types'

const NAMES = categoryNames()

/**
 * The site icon, served by Chrome from the browser's own favicon cache. This is
 * the whole reason the extension asks for the "favicon" permission — no network
 * request is made, and the page itself is never contacted.
 */
function faviconUrl(pageUrl: string): string {
  const url = new URL(chrome.runtime.getURL('/_favicon/'))
  url.searchParams.set('pageUrl', pageUrl)
  url.searchParams.set('size', '32')
  return url.toString()
}

interface RowProps {
  domain: string
  /** A page on this domain, used only to fetch the cached site icon. */
  pageUrl?: string
  /** Where it sits now — a category name, or null when nothing claims it. */
  current: string | null
  /** Label under the domain. */
  note: string
  busy: boolean
  onPick: (category: string) => void
}

function SiteRow({ domain, pageUrl, current, note, busy, onPick }: RowProps) {
  return (
    <li className="tg-fix-row">
      {pageUrl ? (
        <img className="tg-fix-icon" src={faviconUrl(pageUrl)} alt="" width={16} height={16} />
      ) : (
        <span className="tg-fix-icon tg-fix-icon-blank" aria-hidden="true" />
      )}

      <span className="tg-fix-text">
        <span className="tg-fix-domain" title={domain}>
          {domain}
        </span>
        <span className="tg-fix-note">{note}</span>
      </span>

      <select
        className="tg-fix-pick"
        value={current && NAMES.includes(current) ? current : ''}
        disabled={busy}
        aria-label={'Category for ' + domain}
        onChange={(e) => e.target.value && onPick(e.target.value)}
      >
        <option value="">Move to…</option>
        {NAMES.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>

      {linksConfigured() && (
        <a
          className="tg-icon-btn tg-fix-flag"
          href={reportSiteIssueUrl({ domain, landedIn: current ?? 'nothing' })}
          target="_blank"
          rel="noopener"
          title={'Report ' + domain + ' as mis-categorised'}
          aria-label={'Report ' + domain}
        >
          <FlagIcon />
        </a>
      )}
    </li>
  )
}

interface FixerProps {
  loose: LooseTab[]
  busy: boolean
  onFile: (domain: string, category: string) => void
}

/**
 * "Doesn't fit?" — the shortest path from noticing a tab is in the wrong place
 * to it being in the right one. Picking a category files the site permanently
 * and moves every tab on it right now.
 */
export default function SiteFixer({ loose, busy, onFile }: FixerProps) {
  if (loose.length === 0) return null

  return (
    <section className="tg-fixer">
      <h2 className="tg-section-title">
        Doesn&rsquo;t fit?
        <span className="tg-count">{loose.length}</span>
      </h2>
      <p className="tg-fix-lede">
        The tab you&rsquo;re on, plus anything still ungrouped. Pick a group and it stays there for
        good.
      </p>
      <ul className="tg-fix-list">
        {loose.map((tab) => (
          <SiteRow
            key={tab.domain}
            domain={tab.domain}
            pageUrl={tab.url}
            current={tab.wouldGroup}
            note={
              tab.active
                ? tab.wouldGroup
                  ? 'this tab · goes to ' + tab.wouldGroup
                  : 'this tab · nothing claims it'
                : tab.wouldGroup
                  ? 'goes to ' + tab.wouldGroup
                  : 'nothing claims it'
            }
            busy={busy}
            onPick={(category) => onFile(tab.domain, category)}
          />
        ))}
      </ul>
    </section>
  )
}

interface LearnedProps {
  learned: { domain: string; category: string }[]
  busy: boolean
  onFile: (domain: string, category: string) => void
}

/**
 * Sites the last run worked out for itself.
 *
 * Surfacing these is the difference between a guess you can catch and a guess
 * that quietly hardens into a wrong answer you never see.
 */
export function LearnedSites({ learned, busy, onFile }: LearnedProps) {
  if (learned.length === 0) return null

  return (
    <section className="tg-fixer tg-learned">
      <h2 className="tg-section-title">
        Worked out for you
        <span className="tg-count">{learned.length}</span>
      </h2>
      <p className="tg-fix-lede">
        New to me, so I read the address and filed {learned.length === 1 ? 'it' : 'them'}. Change
        anything I got wrong.
      </p>
      <ul className="tg-fix-list">
        {learned.map((site) => (
          <SiteRow
            key={site.domain}
            domain={site.domain}
            current={site.category}
            note={'filed under ' + site.category}
            busy={busy}
            onPick={(category) => onFile(site.domain, category)}
          />
        ))}
      </ul>
    </section>
  )
}

/** Small link out to the issue tracker, shown once at the foot of the popup. */
export function FeedbackLink() {
  if (!linksConfigured()) return null
  return (
    <a className="tg-link" href={LINKS.repo + '/issues'} target="_blank" rel="noopener">
      Feedback
    </a>
  )
}

function FlagIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 14V2.5" />
      <path d="M3.5 3h8l-1.6 2.6L11.5 8.5h-8" />
    </svg>
  )
}
