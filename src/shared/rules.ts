import type { GroupRule, MatchResult, Settings } from './types'
import { categoryByName, matchCategory, matchCategoryByHint } from './categories'
import { lookupCatalog, type SiteCatalog } from './site-catalog'
import { domainLabel, getDomainFromUrl, getHostname, isGroupableUrl, parseUrl } from './url'

/** Patterns longer than this are rejected at save time as a ReDoS guard. */
export const MAX_PATTERN_LENGTH = 500

/**
 * A repeat nested inside another repeat — (a+)+, (.*)*, ([a-z]+)* and friends.
 *
 * These are the classic catastrophic-backtracking shapes: nine characters is
 * enough to make the regex engine try exponentially many ways to match, which
 * in a service worker means the whole extension stops responding with no
 * explanation. A length cap does not help, so the shape is rejected instead.
 */
const NESTED_QUANTIFIER = /\([^()]*[+*][^()]*\)\s*(?:[+*]|\{\d+,\})/

/**
 * How long one pattern may spend on a single URL before we stop trusting it.
 * JavaScript cannot interrupt a regex mid-match, so this cannot prevent the
 * first slow match — it stops the same pattern from doing it again for every
 * remaining tab in the window.
 */
const SLOW_PATTERN_MS = 25

/** Patterns disabled this session for running too slowly. Cleared with the cache. */
const quarantined = new Set<string>()

/**
 * Report a structural hazard in a pattern, or null when it looks safe.
 * Deliberately shape-based: actually timing a pattern would mean running the
 * dangerous thing to find out that it is dangerous.
 */
export function findPatternHazard(type: GroupRule['type'], pattern: string): string | null {
  if (type === 'domain') return null
  if (NESTED_QUANTIFIER.test(pattern)) {
    return 'This repeats a group that already repeats — like (a+)+ — which can hang the browser on some addresses. Rewrite it without the inner + or *.'
  }
  return null
}

/**
 * Rules are matched case-insensitively. Hostnames are case-insensitive by spec
 * and users overwhelmingly expect /Jira to match /jira, so the ergonomic choice
 * beats the pedantic one here. This is stated in the options UI.
 */
const REGEX_FLAGS = 'i'

const regexCache = new Map<string, RegExp | null>()

/** Compile (and cache) a rule pattern. Returns null for invalid patterns. */
export function compilePattern(type: GroupRule['type'], pattern: string): RegExp | null {
  const key = `${type} ${pattern}`
  const cached = regexCache.get(key)
  if (cached !== undefined) return cached

  let compiled: RegExp | null = null
  try {
    if (pattern.length > MAX_PATTERN_LENGTH) throw new Error('pattern too long')
    if (type === 'regex') {
      compiled = new RegExp(pattern, REGEX_FLAGS)
    } else if (type === 'glob') {
      compiled = new RegExp('^' + globToRegexSource(pattern) + '$', REGEX_FLAGS)
    }
    // 'domain' needs no regex - handled structurally in matchesRule.
  } catch {
    compiled = null
  }
  regexCache.set(key, compiled)
  return compiled
}

/** Clear the compiled-pattern cache. Call after rules change. */
export function clearPatternCache(): void {
  regexCache.clear()
  quarantined.clear()
}

/** Translate a glob (`*` = any run, `?` = one char) into regex source. */
function globToRegexSource(glob: string): string {
  let out = ''
  for (const ch of glob) {
    if (ch === '*') out += '.*'
    else if (ch === '?') out += '.'
    else out += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return out
}

/**
 * Does a hostname belong to a domain pattern? Accepts a bare domain
 * ("atlassian.net"), a leading-dot form (".atlassian.net") or a wildcard
 * ("*.atlassian.net"). All three match the domain itself and any subdomain.
 */
export function matchesDomainPattern(hostname: string, pattern: string): boolean {
  const host = hostname.replace(/^www\./i, '').toLowerCase()
  const base = pattern.trim().toLowerCase().replace(/^\*\./, '').replace(/^\./, '')
  if (!host || !base) return false
  return host === base || host.endsWith('.' + base)
}

/** Test a single rule against a URL. Disabled rules never match. */
export function matchesRule(rule: GroupRule, url: string): boolean {
  if (!rule.enabled) return false

  if (rule.type === 'domain') {
    return matchesDomainPattern(getHostname(url), rule.pattern)
  }

  const key = rule.type + ' ' + rule.pattern
  if (quarantined.has(key)) return false

  const re = compilePattern(rule.type, rule.pattern)
  if (!re) return false
  // Reset lastIndex defensively in case a user supplies a /g pattern source.
  re.lastIndex = 0

  const started = performance.now()
  const hit = re.test(url)
  const spent = performance.now() - started

  if (spent > SLOW_PATTERN_MS) {
    quarantined.add(key)
    console.warn(
      '[Roundup] rule "' + rule.name + '" took ' + Math.round(spent) + 'ms on one URL and has ' +
        'been skipped for the rest of this run. Its pattern is probably backtracking: ' +
        rule.pattern,
    )
  }

  return hit
}

/** Report whether a pattern is usable, with a message for the options UI. */
export function validatePattern(
  type: GroupRule['type'],
  pattern: string,
): { valid: boolean; error?: string } {
  const trimmed = pattern.trim()
  if (!trimmed) return { valid: false, error: 'Pattern cannot be empty' }
  if (trimmed.length > MAX_PATTERN_LENGTH) {
    return { valid: false, error: 'Pattern must be under ' + MAX_PATTERN_LENGTH + ' characters' }
  }
  if (type === 'domain') {
    if (/\s/.test(trimmed)) return { valid: false, error: 'A domain cannot contain spaces' }
    return { valid: true }
  }
  const hazard = findPatternHazard(type, trimmed)
  if (hazard) return { valid: false, error: hazard }
  try {
    if (type === 'regex') new RegExp(trimmed, REGEX_FLAGS)
    else new RegExp('^' + globToRegexSource(trimmed) + '$', REGEX_FLAGS)
    return { valid: true }
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : 'Invalid pattern' }
  }
}

/**
 * Everything matching needs that does not live in Settings. Both fields are
 * optional so a caller that only cares about rules (the tests, the rule editor)
 * can keep calling matchUrl with two arguments.
 */
export interface MatchContext {
  /** Learned + hand-set site categories. Consulted before the built-in tables. */
  catalog?: SiteCatalog
  /** Defaults to true; pass Settings.useHeuristics to honour the setting. */
  useHeuristics?: boolean
}

/** A category name resolved to the colour its built-in category uses. */
function categoryResult(
  name: string,
  source: MatchResult['source'],
  reason: string,
): MatchResult {
  const category = categoryByName(name)
  return {
    groupName: category?.name ?? name,
    color: category?.color ?? 'grey',
    source,
    key: 'cat:' + (category?.name ?? name),
    reason,
  }
}

/**
 * Decide which group a URL belongs to.
 *
 * Order of precedence:
 *   1. User rules, in array order — first match wins.
 *   2. The site catalog: sites you taught it, and sites it taught itself.
 *   3. A built-in category domain table.
 *   4. The hostname's shape (.shop, blog.*, watch-…) when heuristics are on.
 *   5. The registrable domain, so an unknown site still clusters with itself.
 *
 * Because rules are tested against the *full* URL, two products on one host can
 * be split - the Jira / Confluence case:
 *   ^https://acme\.atlassian\.net/jira/  -> "Jira"
 *   ^https://acme\.atlassian\.net/wiki/  -> "Confluence"
 */
export function matchUrl(
  url: string,
  settings: Pick<Settings, 'rules' | 'fallback'>,
  context: MatchContext = {},
): MatchResult | null {
  if (!isGroupableUrl(url)) return null

  for (const rule of settings.rules) {
    if (matchesRule(rule, url)) {
      return {
        groupName: rule.name,
        color: rule.color,
        source: 'rule',
        key: 'rule:' + rule.id,
        ruleId: rule.id,
        reason: 'Rule "' + rule.name + '" (' + rule.type + ': ' + rule.pattern + ')',
      }
    }
  }

  if (settings.fallback === 'category') {
    const hostname = getHostname(url)

    // 2. Anything the catalog knows — a correction you made, or a site a
    //    previous run learned. Both outrank the built-in guesses.
    const known = context.catalog ? lookupCatalog(context.catalog, hostname) : null
    if (known) {
      return categoryResult(
        known.category,
        'catalog',
        known.source === 'user'
          ? 'Site catalog: you filed ' + known.domain + ' under "' + known.category + '"'
          : 'Site catalog: ' + known.domain + ' was learned as "' + known.category + '"',
      )
    }

    // 3. The built-in domain tables.
    const hit = matchCategory(hostname)
    if (hit) {
      return categoryResult(
        hit.category.name,
        'category',
        'Built-in category "' + hit.category.name + '" (matched ' + hit.matchedOn + ')',
      )
    }

    // 4. Read the shape of the hostname itself.
    if (context.useHeuristics !== false) {
      const parsed = parseUrl(url)
      const guess = matchCategoryByHint(hostname, parsed ? parsed.pathname + parsed.search : undefined)
      if (guess) {
        const how =
          guess.via === 'tld'
            ? 'the .' + guess.matchedOn + ' domain'
            : guess.via === 'path'
              ? '"' + guess.matchedOn + '" in the page address'
              : guess.via === 'token'
                ? 'the "' + guess.matchedOn + '" in its address'
                : '"' + guess.matchedOn + '" in the site name'
        return categoryResult(
          guess.category.name,
          'heuristic',
          'Looks like "' + guess.category.name + '" — matched on ' + how,
        )
      }
    }

    // 5. Unknown site: still cluster it by site rather than dropping it.
    const domain = getDomainFromUrl(url)
    if (!domain) return null
    return {
      groupName: domainLabel(domain),
      color: 'grey',
      source: 'domain',
      key: 'domain:' + domain,
      reason: 'No category matched; grouped by domain ' + domain,
    }
  }

  if (settings.fallback === 'domain') {
    const domain = getDomainFromUrl(url)
    if (!domain) return null
    return {
      groupName: domainLabel(domain),
      color: 'grey',
      source: 'domain',
      key: 'domain:' + domain,
      reason: 'Grouped by domain ' + domain,
    }
  }

  return null
}

/** Stable id generator for new rules. */
export function newRuleId(): string {
  return 'r_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}
