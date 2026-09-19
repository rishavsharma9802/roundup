/**
 * URL helpers.
 *
 * Two jobs live here:
 *  1. Deciding whether a tab is even groupable.
 *  2. Reducing a hostname to its "registrable domain" (eTLD+1) so unknown sites
 *     still cluster sensibly — e.g. a.example.co.uk and b.example.co.uk both
 *     collapse to example.co.uk rather than to co.uk.
 */

/**
 * Multi-label public suffixes we care about. This is a curated subset of the
 * Mozilla Public Suffix List, not the whole thing: bundling all ~9k entries
 * would bloat the extension for very little practical gain. Everything not
 * listed here falls back to the last two labels, which is correct for the
 * overwhelming majority of hostnames.
 */
const MULTI_PART_SUFFIXES = new Set([
  // generic second-level
  'co.uk', 'org.uk', 'me.uk', 'ac.uk', 'gov.uk', 'net.uk', 'sch.uk',
  'co.in', 'net.in', 'org.in', 'gen.in', 'firm.in', 'ind.in', 'ac.in', 'edu.in', 'gov.in', 'nic.in', 'res.in',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'id.au',
  'co.nz', 'net.nz', 'org.nz', 'govt.nz', 'ac.nz',
  'co.za', 'org.za', 'net.za', 'web.za',
  'com.br', 'net.br', 'org.br', 'gov.br', 'edu.br',
  'com.mx', 'org.mx', 'net.mx', 'gob.mx',
  'com.ar', 'net.ar', 'org.ar', 'gob.ar',
  'com.sg', 'net.sg', 'org.sg', 'edu.sg', 'gov.sg',
  'com.hk', 'net.hk', 'org.hk', 'edu.hk', 'gov.hk',
  'com.tw', 'net.tw', 'org.tw', 'edu.tw', 'gov.tw',
  'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp', 'lg.jp',
  'co.kr', 'ne.kr', 'or.kr', 're.kr', 'go.kr', 'ac.kr',
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn', 'ac.cn',
  'co.id', 'or.id', 'ac.id', 'go.id', 'web.id',
  'com.my', 'net.my', 'org.my', 'edu.my', 'gov.my',
  'com.ph', 'net.ph', 'org.ph',
  'com.vn', 'net.vn', 'org.vn',
  'com.tr', 'net.tr', 'org.tr', 'edu.tr', 'gov.tr',
  'com.pl', 'net.pl', 'org.pl',
  'com.ua', 'net.ua', 'org.ua',
  'com.ru', 'net.ru', 'org.ru',
  'com.es', 'org.es', 'nom.es',
  'com.pk', 'net.pk', 'org.pk', 'edu.pk', 'gov.pk',
  'com.bd', 'net.bd', 'org.bd',
  'com.sa', 'net.sa', 'org.sa',
  'com.eg', 'net.eg', 'org.eg',
  'com.ng', 'net.ng', 'org.ng',
  'com.co', 'net.co', 'org.co',
  'com.pe', 'com.ve', 'com.ec', 'com.uy', 'com.do', 'com.gt',
  // project-hosting suffixes, where the label before the suffix is the real owner
  'github.io', 'gitlab.io', 'pages.dev', 'workers.dev', 'vercel.app', 'netlify.app',
  'herokuapp.com', 'firebaseapp.com', 'web.app', 'appspot.com', 'cloudfront.net',
  'azurewebsites.net', 'blob.core.windows.net', 's3.amazonaws.com',
  'readthedocs.io', 'notion.site', 'substack.com', 'medium.com', 'wordpress.com',
  'blogspot.com', 'tumblr.com', 'myshopify.com', 'zendesk.com', 'freshdesk.com',
  'atlassian.net', 'sharepoint.com', 'salesforce.com', 'lightning.force.com',
  'r2.dev', 'ngrok.io', 'ngrok-free.app', 'trycloudflare.com', 'localhost.run',
])

/** Schemes that can never be meaningfully grouped or deduplicated. */
const UNGROUPABLE_SCHEMES = new Set([
  'chrome:', 'chrome-extension:', 'chrome-search:', 'chrome-untrusted:',
  'devtools:', 'about:', 'edge:', 'brave:', 'opera:', 'vivaldi:', 'view-source:',
])

export function parseUrl(url: string | undefined): URL | null {
  if (!url) return null
  try {
    return new URL(url)
  } catch {
    return null
  }
}

/**
 * True when a tab can participate in grouping. Browser-internal pages, the new
 * tab page and unparseable URLs are excluded — Chrome refuses to group some of
 * them and grouping the rest is just noise.
 */
export function isGroupableUrl(url: string | undefined): boolean {
  const parsed = parseUrl(url)
  if (!parsed) return false
  if (UNGROUPABLE_SCHEMES.has(parsed.protocol)) return false
  return true
}

export function getHostname(url: string | undefined): string {
  const parsed = parseUrl(url)
  if (!parsed) return ''
  return parsed.hostname.replace(/^www\./i, '').toLowerCase()
}

/**
 * Reduce a hostname to its registrable domain.
 *   mail.google.com          -> google.com
 *   foo.bar.example.co.uk    -> example.co.uk
 *   myteam.atlassian.net     -> myteam.atlassian.net  (atlassian.net is a suffix)
 *   localhost                -> localhost
 */
export function getRegistrableDomain(hostname: string): string {
  const host = hostname.replace(/^www\./i, '').toLowerCase()
  if (!host || host === 'localhost') return host
  // Bare IPv4 / IPv6 literals have no registrable domain.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) return host

  const labels = host.split('.')
  if (labels.length <= 2) return host

  // Try the longest known multi-part suffix first.
  for (let take = Math.min(3, labels.length - 1); take >= 2; take--) {
    const candidate = labels.slice(-take).join('.')
    if (MULTI_PART_SUFFIXES.has(candidate)) {
      return labels.slice(-(take + 1)).join('.')
    }
  }
  return labels.slice(-2).join('.')
}

/** Convenience: registrable domain straight from a URL string. */
export function getDomainFromUrl(url: string | undefined): string {
  return getRegistrableDomain(getHostname(url))
}

/**
 * A display label for a domain-based group: the registrable domain with its
 * public suffix stripped, title-cased. "github.com" -> "Github",
 * "myteam.atlassian.net" -> "Myteam".
 */
export function domainLabel(domain: string): string {
  if (!domain) return 'Other'
  const first = domain.split('.')[0]
  return first.charAt(0).toUpperCase() + first.slice(1)
}

/**
 * Canonical form of a URL for *exact* duplicate detection.
 *
 * Deliberately conservative: only the things that provably do not change which
 * document you are looking at are normalized (scheme/host case, default port,
 * a lone trailing slash on an empty path, and optionally the fragment). Query
 * parameters and path case are preserved, because /Docs?id=1 and /docs?id=2 are
 * genuinely different pages.
 */
export function normalizeUrl(url: string, opts: { ignoreFragment?: boolean } = {}): string {
  const { ignoreFragment = true } = opts
  const parsed = parseUrl(url)
  if (!parsed) return url

  if (ignoreFragment) parsed.hash = ''
  parsed.protocol = parsed.protocol.toLowerCase()
  parsed.hostname = parsed.hostname.toLowerCase()

  // Drop the port when it is the scheme default.
  if (
    (parsed.protocol === 'http:' && parsed.port === '80') ||
    (parsed.protocol === 'https:' && parsed.port === '443')
  ) {
    parsed.port = ''
  }

  let out = parsed.toString()
  // "https://example.com/" and "https://example.com" are the same document.
  if (parsed.pathname === '/' && !parsed.search && !parsed.hash) {
    out = out.replace(/\/$/, '')
  }
  return out
}
