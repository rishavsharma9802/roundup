import { describe, expect, it } from 'vitest'
import type { GroupRule, Settings } from './types'
import { matchUrl, matchesRule, matchesDomainPattern, validatePattern } from './rules'
import { getRegistrableDomain, isGroupableUrl, normalizeUrl } from './url'
import { matchCategory } from './categories'

function rule(partial: Partial<GroupRule> & Pick<GroupRule, 'name' | 'type' | 'pattern'>): GroupRule {
  return { id: partial.name, color: 'blue', enabled: true, ...partial }
}

const base: Pick<Settings, 'rules' | 'fallback'> = { rules: [], fallback: 'category' }

describe('normalizeUrl — exact-URL duplicate detection', () => {
  it('treats a bare host and a trailing slash as the same page', () => {
    expect(normalizeUrl('https://example.com/')).toBe(normalizeUrl('https://example.com'))
  })

  it('ignores the fragment by default', () => {
    expect(normalizeUrl('https://a.com/docs#intro')).toBe(normalizeUrl('https://a.com/docs'))
  })

  it('keeps the fragment when asked to', () => {
    const withHash = normalizeUrl('https://a.com/docs#intro', { ignoreFragment: false })
    expect(withHash).not.toBe(normalizeUrl('https://a.com/docs', { ignoreFragment: false }))
  })

  it('does NOT collapse different query strings', () => {
    expect(normalizeUrl('https://a.com/s?q=1')).not.toBe(normalizeUrl('https://a.com/s?q=2'))
  })

  it('does NOT collapse different paths on the same domain', () => {
    expect(normalizeUrl('https://a.com/one')).not.toBe(normalizeUrl('https://a.com/two'))
  })

  it('drops default ports but keeps custom ones', () => {
    expect(normalizeUrl('https://a.com:443/x')).toBe(normalizeUrl('https://a.com/x'))
    expect(normalizeUrl('https://a.com:8443/x')).not.toBe(normalizeUrl('https://a.com/x'))
  })

  it('preserves path case, since paths are case-sensitive', () => {
    expect(normalizeUrl('https://a.com/Docs')).not.toBe(normalizeUrl('https://a.com/docs'))
  })
})

describe('getRegistrableDomain', () => {
  it('reduces subdomains to eTLD+1', () => {
    expect(getRegistrableDomain('mail.google.com')).toBe('google.com')
    expect(getRegistrableDomain('a.b.c.example.com')).toBe('example.com')
  })

  it('handles multi-part public suffixes', () => {
    expect(getRegistrableDomain('shop.example.co.uk')).toBe('example.co.uk')
    expect(getRegistrableDomain('foo.example.co.in')).toBe('example.co.in')
  })

  it('treats project-hosting suffixes as public', () => {
    expect(getRegistrableDomain('myteam.atlassian.net')).toBe('myteam.atlassian.net')
    expect(getRegistrableDomain('someone.github.io')).toBe('someone.github.io')
  })

  it('leaves IPs and localhost alone', () => {
    expect(getRegistrableDomain('127.0.0.1')).toBe('127.0.0.1')
    expect(getRegistrableDomain('localhost')).toBe('localhost')
  })
})

describe('isGroupableUrl', () => {
  it('accepts normal web pages', () => {
    expect(isGroupableUrl('https://github.com')).toBe(true)
    expect(isGroupableUrl('http://localhost:3000/app')).toBe(true)
  })

  it('rejects browser-internal pages and junk', () => {
    expect(isGroupableUrl('chrome://extensions')).toBe(false)
    expect(isGroupableUrl('chrome-extension://abc/page.html')).toBe(false)
    expect(isGroupableUrl('about:blank')).toBe(false)
    expect(isGroupableUrl('not a url')).toBe(false)
    expect(isGroupableUrl(undefined)).toBe(false)
  })
})

describe('domain rules', () => {
  it('matches the domain and its subdomains', () => {
    expect(matchesDomainPattern('github.com', 'github.com')).toBe(true)
    expect(matchesDomainPattern('gist.github.com', 'github.com')).toBe(true)
    expect(matchesDomainPattern('www.github.com', 'github.com')).toBe(true)
  })

  it('accepts wildcard and leading-dot forms', () => {
    expect(matchesDomainPattern('gist.github.com', '*.github.com')).toBe(true)
    expect(matchesDomainPattern('gist.github.com', '.github.com')).toBe(true)
  })

  it('does not match a lookalike suffix', () => {
    expect(matchesDomainPattern('notgithub.com', 'github.com')).toBe(false)
    expect(matchesDomainPattern('github.com.evil.net', 'github.com')).toBe(false)
  })
})

describe('the Jira / Confluence split — same host, different products', () => {
  const rules = [
    rule({
      name: 'Jira',
      type: 'regex',
      pattern: '^https://[^/]+\\.atlassian\\.net/(jira|browse|secure)/',
      color: 'blue',
    }),
    rule({
      name: 'Confluence',
      type: 'regex',
      pattern: '^https://[^/]+\\.atlassian\\.net/wiki/',
      color: 'green',
    }),
  ]
  const settings = { rules, fallback: 'category' as const }

  it('routes Jira issue URLs to Jira', () => {
    expect(matchUrl('https://acme.atlassian.net/jira/software/projects/ENG', settings)?.groupName).toBe('Jira')
    expect(matchUrl('https://acme.atlassian.net/browse/ENG-1234', settings)?.groupName).toBe('Jira')
  })

  it('routes Confluence pages to Confluence', () => {
    expect(matchUrl('https://acme.atlassian.net/wiki/spaces/ENG/overview', settings)?.groupName).toBe('Confluence')
  })

  it('reports the rule as the source', () => {
    expect(matchUrl('https://acme.atlassian.net/wiki/x', settings)?.source).toBe('rule')
  })

  it('falls through to the category table for other Atlassian pages', () => {
    const result = matchUrl('https://acme.atlassian.net/people', settings)
    expect(result?.groupName).toBe('Work')
    expect(result?.source).toBe('category')
  })
})

describe('rule precedence', () => {
  it('gives the first matching rule the win', () => {
    const settings = {
      rules: [
        rule({ name: 'First', type: 'domain', pattern: 'github.com' }),
        rule({ name: 'Second', type: 'domain', pattern: 'github.com' }),
      ],
      fallback: 'category' as const,
    }
    expect(matchUrl('https://github.com/anthropics', settings)?.groupName).toBe('First')
  })

  it('lets any rule beat a built-in category', () => {
    const settings = {
      rules: [rule({ name: 'My Repos', type: 'domain', pattern: 'github.com' })],
      fallback: 'category' as const,
    }
    expect(matchUrl('https://github.com/x', settings)?.groupName).toBe('My Repos')
    // …and without the rule the category takes over.
    expect(matchUrl('https://github.com/x', base)?.groupName).toBe('Code')
  })

  it('skips disabled rules', () => {
    const disabled = rule({ name: 'Off', type: 'domain', pattern: 'github.com', enabled: false })
    expect(matchesRule(disabled, 'https://github.com')).toBe(false)
  })
})

describe('glob rules', () => {
  it('matches wildcards across the whole URL', () => {
    const r = rule({ name: 'Jira', type: 'glob', pattern: 'https://*.atlassian.net/jira/*' })
    expect(matchesRule(r, 'https://acme.atlassian.net/jira/board/1')).toBe(true)
    expect(matchesRule(r, 'https://acme.atlassian.net/wiki/page')).toBe(false)
  })
})

describe('pattern validation', () => {
  it('rejects a malformed regex instead of throwing', () => {
    expect(validatePattern('regex', '([unclosed').valid).toBe(false)
    expect(matchesRule(rule({ name: 'Bad', type: 'regex', pattern: '([' }), 'https://a.com')).toBe(false)
  })

  it('rejects empty and over-long patterns', () => {
    expect(validatePattern('regex', '   ').valid).toBe(false)
    expect(validatePattern('regex', 'a'.repeat(501)).valid).toBe(false)
  })

  it('accepts good patterns of every type', () => {
    expect(validatePattern('regex', '^https://x\\.com/').valid).toBe(true)
    expect(validatePattern('glob', 'https://*.x.com/*').valid).toBe(true)
    expect(validatePattern('domain', 'x.com').valid).toBe(true)
  })
})

describe('catastrophic backtracking guard', () => {
  it('rejects a repeat nested inside a repeat', () => {
    // Nine characters, and enough to freeze a service worker.
    expect(validatePattern('regex', '(a+)+$').valid).toBe(false)
    expect(validatePattern('regex', '(.*)*x').valid).toBe(false)
    expect(validatePattern('regex', '([a-z]+)*').valid).toBe(false)
    expect(validatePattern('regex', '(\\d+){2,}').valid).toBe(false)
  })

  it('explains itself instead of just saying no', () => {
    const verdict = validatePattern('regex', '(a+)+$')
    expect(verdict.error).toContain('repeats')
  })

  it('leaves ordinary patterns alone', () => {
    // The Jira/Confluence preset must keep working — a false positive here
    // would break the one rule this extension ships with.
    expect(validatePattern('regex', '^https://[^/]+\\.atlassian\\.net/(jira|browse|secure)/').valid).toBe(true)
    expect(validatePattern('regex', '^https://(www\\.)?example\\.com/.*').valid).toBe(true)
    expect(validatePattern('glob', 'https://*.x.com/*').valid).toBe(true)
    expect(validatePattern('domain', 'example.com').valid).toBe(true)
  })
})

describe('built-in categories', () => {
  it('prefers the most specific domain entry', () => {
    // mail.google.com must beat the broader google.com Search entry.
    expect(matchCategory('mail.google.com')?.category.name).toBe('Comms')
    expect(matchCategory('google.com')?.category.name).toBe('Search')
    expect(matchCategory('docs.google.com')?.category.name).toBe('Drive')
  })

  it('matches subdomains of a category entry', () => {
    expect(matchCategory('gist.github.com')?.category.name).toBe('Code')
  })

  it('returns null for unknown hosts', () => {
    expect(matchCategory('some-random-blog.xyz')).toBeNull()
  })
})

describe('fallback behaviour', () => {
  it('clusters unknown sites by domain rather than dropping them', () => {
    const result = matchUrl('https://unknown-site.xyz/post/1', base)
    expect(result?.source).toBe('domain')
    expect(result?.groupName).toBe('Unknown-site')
  })

  it('groups purely by domain when told to', () => {
    const settings = { rules: [], fallback: 'domain' as const }
    // github.com would be "Code" under the category fallback.
    expect(matchUrl('https://github.com/x', settings)?.groupName).toBe('Github')
  })

  it('leaves everything alone when the fallback is off', () => {
    const settings = { rules: [], fallback: 'none' as const }
    expect(matchUrl('https://github.com/x', settings)).toBeNull()
  })

  it('never groups browser-internal pages, whatever the fallback', () => {
    expect(matchUrl('chrome://extensions', base)).toBeNull()
    expect(matchUrl('chrome://extensions', { rules: [], fallback: 'domain' })).toBeNull()
  })
})
