import { describe, expect, it } from 'vitest'
import { CATEGORIES, matchCategory, matchCategoryByHint } from './categories'
import { matchUrl } from './rules'
import { catalogKey, lookupCatalog, prune, type SiteCatalog } from './site-catalog'
import { DEFAULT_SETTINGS } from './types'

const base = { rules: [], fallback: 'category' as const }

const nameFor = (host: string) => matchCategory(host)?.category.name ?? null
const hintFor = (host: string) => matchCategoryByHint(host)?.category.name ?? null

describe('built-in category tables', () => {
  it('files study and research reading under Learn', () => {
    expect(nameFor('medium.com')).toBe('Learn')
    expect(nameFor('devopscube.com')).toBe('Learn')
    expect(nameFor('towardsdatascience.com')).toBe('Learn')
    expect(nameFor('baeldung.com')).toBe('Learn')
    expect(nameFor('arxiv.org')).toBe('Learn')
    expect(nameFor('kodekloud.com')).toBe('Learn')
  })

  it('follows sub-domains of a listed site', () => {
    expect(nameFor('blog.devopscube.com')).toBe('Learn')
    expect(nameFor('www.medium.com')).toBe('Learn')
    expect(nameFor('some-writer.medium.com')).toBe('Learn')
  })

  it('recognises entertainment beyond the obvious three', () => {
    expect(nameFor('jiohotstar.com')).toBe('Media')
    expect(nameFor('crunchyroll.com')).toBe('Media')
    expect(nameFor('store.steampowered.com')).toBe('Media')
    expect(nameFor('jiosaavn.com')).toBe('Media')
    expect(nameFor('letterboxd.com')).toBe('Media')
    expect(nameFor('espncricinfo.com')).toBe('Media')
  })

  it('recognises newer shopping sites', () => {
    expect(nameFor('tatacliq.com')).toBe('Shopping')
    expect(nameFor('temu.com')).toBe('Shopping')
    expect(nameFor('bigbasket.com')).toBe('Shopping')
    expect(nameFor('jiomart.com')).toBe('Shopping')
    expect(nameFor('lenskart.com')).toBe('Shopping')
    expect(nameFor('pharmeasy.in')).toBe('Shopping')
  })

  it('separates news from social and search', () => {
    expect(nameFor('techcrunch.com')).toBe('News')
    expect(nameFor('thehindu.com')).toBe('News')
    expect(nameFor('reddit.com')).toBe('Social')
    expect(nameFor('google.com')).toBe('Search')
  })

  it('still lets the longest domain entry win', () => {
    expect(nameFor('mail.google.com')).toBe('Comms')
    expect(nameFor('scholar.google.com')).toBe('Learn')
    expect(nameFor('maps.google.com')).toBe('Travel')
  })

  it('has no duplicate domain across categories', () => {
    const seen = new Map<string, string>()
    const clashes: string[] = []
    for (const category of CATEGORIES) {
      for (const domain of category.domains) {
        const owner = seen.get(domain)
        if (owner && owner !== category.name) clashes.push(`${domain}: ${owner} vs ${category.name}`)
        seen.set(domain, category.name)
      }
    }
    expect(clashes).toEqual([])
  })
})

describe('hostname hints', () => {
  it('claims shopping addresses', () => {
    expect(hintFor('freshveggies.shop')).toBe('Shopping')
    expect(hintFor('trendy-store.com')).toBe('Shopping')
    expect(hintFor('shop.newbrand.io')).toBe('Shopping')
    expect(hintFor('bestshopping.co.in')).toBe('Shopping')
  })

  it('claims entertainment addresses', () => {
    expect(hintFor('someshow.tv')).toBe('Media')
    expect(hintFor('watch.newservice.com')).toBe('Media')
    expect(hintFor('bigstreaming.co')).toBe('Media')
  })

  it('claims study and blog addresses', () => {
    expect(hintFor('blog.randomcorp.com')).toBe('Learn')
    expect(hintFor('someone.blog')).toBe('Learn')
    expect(hintFor('mytutorials.net')).toBe('Learn')
    expect(hintFor('iitb.ac.in')).toBe('Learn')
  })

  it('reads a few other shapes', () => {
    expect(hintFor('newthing.ai')).toBe('AI')
    expect(hintFor('docs.someproject.org')).toBe('Docs')
    expect(hintFor('cheapflights.travel')).toBe('Travel')
  })

  it('does not fire on shapeless or unparseable hosts', () => {
    expect(hintFor('example.com')).toBeNull()
    expect(hintFor('localhost')).toBeNull()
    expect(hintFor('192.168.0.1')).toBeNull()
  })

  it('claims names that open or close with a category word', () => {
    expect(hintFor('shopatmycart.in')).toBe('Shopping')
    expect(hintFor('bookmykart.com')).toBe('Shopping')
    expect(hintFor('streamnow.co')).toBe('Media')
    expect(hintFor('blogger.dev')).toBe('Learn')
  })

  it('refuses an affix that swallows the site name', () => {
    // The reason "shop"/"mart"/"store" are prefixes and suffixes rather than
    // plain substrings: these must all stay out of Shopping.
    expect(hintFor('photoshop.com')).toBeNull()
    expect(hintFor('workshopfinder.com')).toBeNull()
    expect(hintFor('descartes.com')).toBeNull()
    expect(hintFor('smart.com')).toBeNull()
    expect(hintFor('restore.com')).toBeNull()
  })

  it('prefers a public suffix over a looser word match', () => {
    const hit = matchCategoryByHint('animeworld.shop')
    expect(hit?.category.name).toBe('Shopping')
    expect(hit?.via).toBe('tld')
  })
})

describe('matchUrl precedence', () => {
  it('lets a known domain beat a hint', () => {
    // "blog." would say Learn; github.com is a known Code site and wins.
    const match = matchUrl('https://blog.github.com/changelog', base)
    expect(match?.groupName).toBe('Code')
    expect(match?.source).toBe('category')
  })

  it('groups a hinted site under the real category, not its own domain', () => {
    const match = matchUrl('https://freshveggies.shop/cart', base)
    expect(match?.groupName).toBe('Shopping')
    expect(match?.source).toBe('heuristic')
    expect(match?.key).toBe('cat:Shopping')
    expect(match?.color).toBe('green')
  })

  it('falls back to the domain when hints are switched off', () => {
    const match = matchUrl('https://freshveggies.shop/cart', base, { useHeuristics: false })
    expect(match?.source).toBe('domain')
    expect(match?.groupName).toBe('Freshveggies')
  })

  it('reads the URL path when the hostname says nothing at all', () => {
    // A small Shopify store on a vanity domain — the case that started this.
    const shop = matchUrl('https://warriorworld.in/collections/cargo-pants?utm_source=x', base)
    expect(shop?.groupName).toBe('Shopping')
    expect(shop?.source).toBe('heuristic')

    expect(matchUrl('https://someindie.in/products/tee', base)?.groupName).toBe('Shopping')
    expect(matchUrl('https://randomsite.io/watch/ep-4', base)?.groupName).toBe('Media')
    expect(matchUrl('https://acmecorp.com/blog/how-we-scaled', base)?.groupName).toBe('Learn')
  })

  it('reads a video address even behind a login redirect', () => {
    // A screener site: nothing in "wbdscreeners" is a known word, and the page
    // itself is /login — the giveaway is /videos/ sitting in the query string.
    const m = matchUrl(
      'https://www.wbdscreeners.com/login?next=/titles/1856656/videos/2772379',
      base,
    )
    expect(m?.groupName).toBe('Media')
  })

  it('never lets a path fragment override the hostname', () => {
    // /products/ would read as Shopping; github.com is a known Code site.
    expect(matchUrl('https://github.com/acme/products', base)?.groupName).toBe('Code')
    // and a hostname hint still beats a path hint
    expect(matchUrl('https://someone.blog/products/x', base)?.groupName).toBe('Learn')
  })

  it('lets the site catalog override a built-in category', () => {
    const catalog: SiteCatalog = {
      'medium.com': { domain: 'medium.com', category: 'Docs', source: 'user', addedAt: 1 },
    }
    const match = matchUrl('https://medium.com/@someone/post', base, { catalog })
    expect(match?.groupName).toBe('Docs')
    expect(match?.source).toBe('catalog')
    expect(match?.key).toBe('cat:Docs')
  })

  it('still puts custom rules first', () => {
    const settings = {
      fallback: 'category' as const,
      rules: [
        {
          id: 'r1',
          name: 'Reading list',
          type: 'domain' as const,
          pattern: 'medium.com',
          color: 'purple' as const,
          enabled: true,
        },
      ],
    }
    const catalog: SiteCatalog = {
      'medium.com': { domain: 'medium.com', category: 'Docs', source: 'user', addedAt: 1 },
    }
    const match = matchUrl('https://medium.com/@someone/post', settings, { catalog })
    expect(match?.groupName).toBe('Reading list')
    expect(match?.source).toBe('rule')
  })

  it('ships with hints and learning on', () => {
    expect(DEFAULT_SETTINGS.useHeuristics).toBe(true)
    expect(DEFAULT_SETTINGS.autoLearnSites).toBe(true)
  })
})

describe('site catalog helpers', () => {
  it('reduces anything typed into a registrable domain', () => {
    expect(catalogKey('https://www.Foo.co.uk/bar?x=1')).toBe('foo.co.uk')
    expect(catalogKey('  SHOP.Acme.com ')).toBe('acme.com')
    expect(catalogKey('acme.com')).toBe('acme.com')
    expect(catalogKey('')).toBe('')
  })

  it('lets a parent domain cover its sub-domains', () => {
    const catalog: SiteCatalog = {
      'acme.com': { domain: 'acme.com', category: 'Work', source: 'user', addedAt: 1 },
    }
    expect(lookupCatalog(catalog, 'shop.acme.com')?.category).toBe('Work')
    expect(lookupCatalog(catalog, 'www.acme.com')?.category).toBe('Work')
    expect(lookupCatalog(catalog, 'acme.org')).toBeNull()
  })

  it('evicts old learned entries before anything the user set', () => {
    const catalog: SiteCatalog = {}
    for (let i = 0; i < 700; i++) {
      catalog[`auto${i}.com`] = {
        domain: `auto${i}.com`,
        category: 'Media',
        source: 'auto',
        addedAt: i,
      }
    }
    catalog['mine.com'] = { domain: 'mine.com', category: 'Work', source: 'user', addedAt: 0 }

    const pruned = prune(catalog)
    expect(Object.keys(pruned).length).toBe(600)
    expect(pruned['mine.com']).toBeDefined()
    expect(pruned['auto0.com']).toBeUndefined()
    expect(pruned['auto699.com']).toBeDefined()
  })
})
