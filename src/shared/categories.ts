import type { GroupColor } from './types'
import { getRegistrableDomain } from './url'

/**
 * Hints let a category claim a site it has never seen before.
 *
 * They are only consulted when no domain in any category matched, so a hint can
 * never override a known site. Three kinds, strongest signal first:
 *
 *   tlds     - public-suffix tail, e.g. "shop" claims anything on .shop
 *   tokens   - an exact hostname label or hyphen-separated segment, so "shop"
 *              claims shop.acme.com and acme-shop.com but not photoshop.com
 *   prefixes - the site name starts with it: shopatmycart.in, streamnow.co
 *   suffixes - the site name ends with it: bookmykart.com, watchflix.com
 *   keywords - a substring of the site name, for words distinctive enough that
 *              a loose substring match is still safe ("streaming", "grocery")
 *   paths    - last resort, read from the URL path instead of the hostname
 *
 * Prefixes and suffixes must be at least MIN_AFFIX long and leave at least two
 * characters of site name behind them, which is what keeps "photoshop",
 * "workshopfinder", "descartes" and "smart…" out of Shopping.
 */
export interface CategoryHints {
  keywords?: string[]
  tokens?: string[]
  /** Site name starts with this, so "shop" claims shopatmycart.in but not photoshop.com. */
  prefixes?: string[]
  /** Site name ends with this, so "cart" claims shopatmycart.in but not descartes.com. */
  suffixes?: string[]
  tlds?: string[]
  /**
   * Substrings of the URL path that give a site away when its hostname says
   * nothing at all — "/collections/" and "/products/" are the Shopify
   * signature every small store carries, whatever it decided to call itself.
   * Only consulted after every hostname signal has failed.
   */
  paths?: string[]
}

export interface Category extends CategoryHints {
  name: string
  color: GroupColor
  /**
   * Hostnames owned by this category. A tab matches when its hostname equals an
   * entry or is a subdomain of it. When several categories match, the one with
   * the *longest* matching entry wins — that is what lets "mail.google.com"
   * land in Comms while plain "google.com" lands in Search.
   */
  domains: string[]
}

/**
 * Built-in categories.
 *
 * This table is meant to be edited: adding a site is a one-line change, and the
 * learned site catalog (site-catalog.ts) plus user rules both take priority
 * over it, so nothing here can override a decision the user made.
 */
export const CATEGORIES: Category[] = [
  {
    name: 'Code',
    color: 'blue',
    domains: [
      'github.com', 'gitlab.com', 'bitbucket.org', 'sourceforge.net', 'codeberg.org',
      'gitea.io', 'gitee.com', 'git-scm.com',
      'stackoverflow.com', 'stackexchange.com', 'serverfault.com', 'superuser.com',
      'askubuntu.com',
      'npmjs.com', 'pypi.org', 'crates.io', 'pkg.go.dev', 'maven.org',
      'mvnrepository.com', 'rubygems.org', 'packagist.org', 'nuget.org', 'cocoapods.org',
      'codepen.io', 'jsfiddle.net', 'codesandbox.io', 'replit.com', 'stackblitz.com',
      'godbolt.org', 'regex101.com', 'regexr.com', 'jsonformatter.org', 'jsoncrack.com',
      'pastebin.com', 'jetbrains.com', 'visualstudio.com', 'code.visualstudio.com',
      'sonarqube.org', 'sonarcloud.io',
    ],
    tokens: ['git', 'code', 'repo', 'repos'],
  },
  {
    name: 'Docs',
    color: 'cyan',
    domains: [
      'developer.mozilla.org', 'devdocs.io', 'readthedocs.io', 'readthedocs.org',
      'w3schools.com', 'w3.org', 'whatwg.org',
      'docs.python.org', 'docs.oracle.com', 'docs.microsoft.com', 'learn.microsoft.com',
      'developer.apple.com', 'developer.android.com', 'developer.chrome.com',
      'wikipedia.org', 'wikimedia.org', 'wiktionary.org', 'notion.so', 'notion.site',
      'gitbook.io', 'gitbook.com', 'docusaurus.io', 'swagger.io', 'postman.com',
      'confluence.atlassian.com', 'openapis.org', 'json-schema.org', 'rfc-editor.org',
      'man7.org', 'linux.die.net', 'ss64.com', 'explainshell.com', 'devhints.io',
    ],
    keywords: ['documentation'],
    tokens: ['docs', 'documentation', 'developer', 'developers', 'apidocs'],
  },
  {
    name: 'Work',
    color: 'orange',
    domains: [
      'atlassian.net', 'atlassian.com', 'jira.com', 'asana.com', 'linear.app',
      'trello.com', 'monday.com', 'clickup.com', 'shortcut.com', 'basecamp.com',
      'servicenow.com', 'workday.com', 'smartsheet.com', 'airtable.com',
      'wrike.com', 'teamwork.com', 'height.app', 'productboard.com', 'miro.com',
      'figma.com', 'canva.com', 'lucidchart.com', 'whimsical.com', 'excalidraw.com',
      'greenhouse.io', 'lever.co', 'bamboohr.com', 'successfactors.com',
      'darwinbox.in', 'keka.com',
    ],
  },
  {
    name: 'Comms',
    color: 'green',
    domains: [
      'mail.google.com', 'outlook.com', 'outlook.office.com', 'outlook.office365.com',
      'outlook.live.com', 'mail.yahoo.com', 'proton.me', 'protonmail.com', 'zoho.com',
      'zohomail.com', 'fastmail.com', 'hey.com', 'superhuman.com',
      'slack.com', 'teams.microsoft.com', 'teams.live.com', 'discord.com',
      'telegram.org', 'web.telegram.org', 'web.whatsapp.com', 'signal.org',
      'zoom.us', 'meet.google.com', 'webex.com', 'gotomeeting.com', 'whereby.com',
      'calendly.com', 'calendar.google.com', 'cal.com', 'doodle.com',
    ],
    keywords: ['webmail'],
    tokens: ['mail', 'webmail', 'chat', 'meet', 'calendar', 'inbox'],
  },
  {
    name: 'Cloud',
    color: 'purple',
    domains: [
      'console.aws.amazon.com', 'aws.amazon.com', 'portal.azure.com', 'azure.com',
      'azure.microsoft.com', 'console.cloud.google.com', 'cloud.google.com',
      'cloudflare.com', 'vercel.com', 'netlify.com', 'digitalocean.com', 'heroku.com',
      'render.com', 'fly.io', 'railway.app', 'supabase.com', 'firebase.google.com',
      'planetscale.com', 'neon.tech', 'mongodb.com', 'redis.io', 'elastic.co',
      'datadoghq.com', 'grafana.com', 'grafana.net', 'newrelic.com', 'sentry.io',
      'pagerduty.com', 'opsgenie.com', 'splunk.com', 'sumologic.com', 'prometheus.io',
      'docker.com', 'hub.docker.com', 'kubernetes.io', 'k8s.io', 'helm.sh',
      'terraform.io', 'hashicorp.com', 'ansible.com', 'jenkins.io', 'circleci.com',
      'travis-ci.com', 'buildkite.com', 'openshift.com', 'rancher.com', 'nginx.com',
      'apache.org', 'linode.com', 'vultr.com',
    ],
    keywords: ['kubernetes', 'jenkins', 'grafana', 'openshift', 'terraform'],
    tokens: ['console', 'cloud', 'k8s', 'monitoring', 'observability'],
  },
  {
    name: 'AI',
    color: 'pink',
    domains: [
      'chatgpt.com', 'openai.com', 'claude.ai', 'anthropic.com', 'gemini.google.com',
      'aistudio.google.com', 'perplexity.ai', 'poe.com', 'copilot.microsoft.com',
      'huggingface.co', 'replicate.com', 'together.ai',
      'midjourney.com', 'runwayml.com', 'elevenlabs.io', 'suno.com', 'udio.com',
      'cursor.com', 'v0.dev', 'bolt.new', 'lovable.dev', 'windsurf.com',
      'ollama.com', 'lmstudio.ai', 'groq.com', 'mistral.ai', 'deepseek.com',
      'x.ai', 'grok.com', 'notebooklm.google.com', 'gamma.app',
    ],
    keywords: ['chatbot'],
    tlds: ['ai'],
  },
  {
    name: 'Drive',
    color: 'yellow',
    domains: [
      'docs.google.com', 'drive.google.com', 'sheets.google.com', 'slides.google.com',
      'forms.google.com', 'keep.google.com', 'photos.google.com',
      'dropbox.com', 'box.com', 'onedrive.live.com', 'sharepoint.com', 'icloud.com',
      'mega.nz', 'pcloud.com', 'wetransfer.com', 'sync.com',
    ],
  },
  {
    name: 'Learn',
    color: 'cyan',
    domains: [
      // courses and practice
      'coursera.org', 'udemy.com', 'edx.org', 'pluralsight.com', 'khanacademy.org',
      'udacity.com', 'skillshare.com', 'futurelearn.com', 'brilliant.org',
      'codecademy.com', 'datacamp.com', 'educative.io', 'scaler.com', 'upgrad.com',
      'simplilearn.com', 'edureka.co', 'mygreatlearning.com', 'unacademy.com',
      'byjus.com', 'vedantu.com', 'testbook.com', 'nptel.ac.in', 'swayam.gov.in',
      'leetcode.com', 'hackerrank.com', 'hackerearth.com', 'codewars.com',
      'codeforces.com', 'codechef.com', 'topcoder.com', 'atcoder.jp', 'exercism.org',
      'interviewbit.com', 'takeuforward.org', 'neetcode.io', 'geeksforgeeks.org',
      'kaggle.com', 'roadmap.sh', 'projecteuler.net', 'cses.fi',
      // technical blogs, tutorials, reference reading
      'medium.com', 'dev.to', 'hashnode.com', 'hashnode.dev', 'substack.com',
      'freecodecamp.org', 'towardsdatascience.com', 'betterprogramming.pub',
      'gitconnected.com', 'devopscube.com', 'devopsschool.com', 'spacelift.io',
      'kodekloud.com', 'linuxhandbook.com', 'itsfoss.com', 'linuxize.com',
      'tecmint.com', 'baeldung.com', 'javatpoint.com', 'tutorialspoint.com',
      'w3resource.com', 'programiz.com', 'realpython.com', 'pythontutorial.net',
      'css-tricks.com', 'smashingmagazine.com', 'web.dev', 'logrocket.com',
      'martinfowler.com', 'refactoring.guru', 'sourcemaking.com', 'patterns.dev',
      'stackabuse.com', 'sanfoundry.com', 'guru99.com', 'highscalability.com',
      'bytebytego.com', 'systemdesign.one',
      'blogspot.com', 'wordpress.com', 'ghost.io', 'bearblog.dev',
      // machine learning and data
      'deeplearning.ai', 'fast.ai', 'paperswithcode.com', 'machinelearningmastery.com',
      'analyticsvidhya.com', 'distill.pub', 'pytorch.org', 'tensorflow.org',
      'scikit-learn.org', 'numpy.org', 'pandas.pydata.org',
      // research and publishing
      'arxiv.org', 'researchgate.net', 'semanticscholar.org', 'scholar.google.com',
      'jstor.org', 'sciencedirect.com', 'springer.com', 'nature.com', 'science.org',
      'ieee.org', 'ieeexplore.ieee.org', 'acm.org', 'dl.acm.org', 'biorxiv.org',
      'ssrn.com', 'ncbi.nlm.nih.gov', 'plos.org',
      'oreilly.com', 'manning.com', 'packtpub.com', 'goodreads.com',
    ],
    keywords: ['tutorial', 'learning', 'academy', 'courses', 'devops', 'engineering',
      'research', 'university', 'handbook', 'cheatsheet', 'programming'],
    tokens: ['blog', 'blogs', 'learn', 'study', 'course', 'tutorials', 'notes',
      'guide', 'guides', 'howto', 'edu', 'papers', 'journal', 'exam', 'college',
      'institute', 'training', 'coaching', 'classes', 'school'],
    tlds: ['blog', 'pub', 'edu', 'academy', 'courses', 'education', 'training',
      'school', 'university', 'ac.in', 'ac.uk', 'edu.in', 'edu.au', 'ac.jp',
      'ac.kr', 'edu.cn', 'edu.pk'],
    prefixes: ['blog', 'learn', 'study', 'tutorial', 'devops', 'coding'],
    suffixes: ['blog', 'notes', 'tutorials', 'guide', 'academy', 'learning'],
    paths: ['/blog/', '/tutorial', '/tutorials/', '/course/', '/courses/',
      '/lesson', '/article/', '/how-to-'],
  },
  {
    name: 'News',
    color: 'orange',
    domains: [
      // world
      'bbc.com', 'bbc.co.uk', 'cnn.com', 'nytimes.com', 'washingtonpost.com',
      'theguardian.com', 'reuters.com', 'apnews.com', 'bloomberg.com', 'wsj.com',
      'ft.com', 'economist.com', 'aljazeera.com', 'npr.org', 'dw.com',
      'forbes.com', 'businessinsider.com', 'cnbc.com', 'time.com', 'axios.com',
      // india
      'indiatimes.com', 'ndtv.com', 'hindustantimes.com', 'thehindu.com',
      'indianexpress.com', 'livemint.com', 'news18.com', 'indiatoday.in',
      'firstpost.com', 'scroll.in', 'thewire.in', 'theprint.in', 'deccanherald.com',
      'telegraphindia.com', 'business-standard.com', 'financialexpress.com',
      // tech press
      'techcrunch.com', 'theverge.com', 'arstechnica.com', 'wired.com',
      'engadget.com', 'gizmodo.com', 'zdnet.com', 'venturebeat.com',
      'thenextweb.com', 'mashable.com', 'techradar.com', 'tomshardware.com',
      'androidauthority.com', '9to5mac.com', '9to5google.com', 'xda-developers.com',
      'theregister.com', 'infoq.com', 'thehackernews.com', 'bleepingcomputer.com',
      'krebsonsecurity.com', 'slashdot.org', 'lobste.rs', 'phoronix.com',
      'feedly.com', 'inoreader.com', 'flipboard.com', 'news.google.com',
    ],
    keywords: ['newspaper', 'headlines'],
    tokens: ['news', 'times', 'herald', 'tribune', 'gazette', 'chronicle', 'bulletin'],
    prefixes: ['news'],
    suffixes: ['news'],
  },
  {
    name: 'Social',
    color: 'red',
    domains: [
      'twitter.com', 'x.com', 'reddit.com', 'linkedin.com', 'facebook.com',
      'instagram.com', 'threads.net', 'threads.com', 'bsky.app', 'mastodon.social',
      'quora.com', 'pinterest.com', 'tiktok.com', 'snapchat.com', 'tumblr.com',
      'news.ycombinator.com', 'discourse.org', 'nextdoor.com',
    ],
    keywords: ['community'],
    tokens: ['forum', 'forums', 'community', 'social'],
  },
  {
    name: 'Media',
    color: 'red',
    domains: [
      // video and OTT
      'youtube.com', 'youtu.be', 'netflix.com', 'primevideo.com', 'hotstar.com',
      'jiohotstar.com', 'disneyplus.com', 'hulu.com', 'max.com', 'hbomax.com',
      'peacocktv.com', 'paramountplus.com', 'tv.apple.com', 'appletv.com',
      'sonyliv.com', 'zee5.com', 'jiocinema.com', 'mxplayer.in', 'aha.video',
      'sunnxt.com', 'erosnow.com', 'altbalaji.com', 'voot.com', 'lionsgateplay.com',
      'discoveryplus.com', 'discoveryplus.in', 'crunchyroll.com', 'funimation.com', 'myanimelist.net',
      'anilist.co', 'dailymotion.com', 'rumble.com', 'kick.com', 'bilibili.com',
      'vimeo.com', 'twitch.tv', 'tubitv.com', 'plex.tv', 'stremio.com',
      'jellyfin.org', 'ted.com',
      // music and audio
      'spotify.com', 'soundcloud.com', 'music.apple.com', 'gaana.com',
      'jiosaavn.com', 'saavn.com', 'wynk.in', 'hungama.com', 'deezer.com',
      'tidal.com', 'bandcamp.com', 'audiomack.com', 'last.fm', 'mixcloud.com',
      'shazam.com', 'audible.com', 'audible.in', 'pocketcasts.com', 'overcast.fm',
      'podbean.com',
      // film and tv reference
      'imdb.com', 'rottentomatoes.com', 'letterboxd.com', 'metacritic.com',
      'themoviedb.org', 'justwatch.com', 'tvtime.com',
      // games
      'steampowered.com', 'steamcommunity.com', 'epicgames.com', 'gog.com',
      'itch.io', 'roblox.com', 'minecraft.net', 'ign.com', 'gamespot.com',
      'polygon.com', 'playstation.com', 'xbox.com', 'nintendo.com', 'ea.com',
      'ubisoft.com', 'chess.com', 'lichess.org', 'kongregate.com', 'miniclip.com',
      'poki.com', 'crazygames.com', 'speedrun.com', 'opencritic.com',
      // sport
      'espn.com', 'espncricinfo.com', 'cricbuzz.com', 'sportskeeda.com',
      'nba.com', 'fifa.com', 'olympics.com', 'formula1.com', 'iplt20.com',
      'skysports.com', 'goal.com',
      // light entertainment
      '9gag.com', 'imgur.com', 'giphy.com', 'tenor.com', 'boredpanda.com',
    ],
    keywords: ['streaming', 'cinema', 'movies', 'anime', 'podcast', 'entertainment',
      'gaming', 'cricket', 'football', 'esports', 'screener', 'screening'],
    tokens: ['tv', 'video', 'videos', 'watch', 'stream', 'movie', 'music', 'radio',
      'game', 'games', 'ott', 'sports', 'episodes', 'series', 'flix'],
    tlds: ['tv', 'fm', 'movie', 'video', 'games', 'game', 'stream', 'music', 'film'],
    prefixes: ['watch', 'stream', 'movie', 'music', 'anime', 'gaming'],
    suffixes: ['flix', 'stream', 'movies', 'games', 'gaming'],
    paths: ['/watch', '/episode', '/episodes/', '/season-', '/seasons/', '/movies/',
      '/series/', '/titles/', '/title/', '/videos/', '/video/', '/album/',
      '/playlist', '/live-tv', '/stream/'],
  },
  {
    name: 'Shopping',
    color: 'green',
    domains: [
      // global marketplaces
      'amazon.com', 'amazon.in', 'amazon.co.uk', 'amazon.de', 'amazon.ca',
      'amazon.com.au', 'amazon.co.jp', 'ebay.com', 'ebay.co.uk', 'etsy.com',
      'aliexpress.com', 'alibaba.com', 'temu.com', 'shein.com', 'wish.com',
      'rakuten.com', 'mercadolibre.com', 'noon.com', 'jumia.com', 'namshi.com',
      'shopify.com', 'myshopify.com', 'newegg.com', 'bhphotovideo.com',
      // india
      'flipkart.com', 'myntra.com', 'ajio.com', 'meesho.com', 'nykaa.com', 'nykaa.in',
      'nykaafashion.com', 'tatacliq.com', 'jiomart.com', 'bigbasket.com',
      'dmart.in', 'snapdeal.com', 'shopsy.in', 'firstcry.com', 'pepperfry.com',
      'urbanladder.com', 'wakefit.co', 'croma.com', 'reliancedigital.in',
      'vijaysales.com', 'lenskart.com', 'titan.co.in', 'tanishq.co.in',
      'caratlane.com', 'bluestone.com', 'purplle.com', 'mamaearth.in',
      'boat-lifestyle.com', 'bewakoof.com', 'thesouledstore.com', 'limeroad.com',
      'indiamart.com', 'olx.in', 'quikr.com', 'cars24.com', 'cardekho.com',
      'spinny.com', 'blinkit.com', 'zepto.com', 'zeptonow.com',
      // groceries, pharmacy, food
      'swiggy.com', 'zomato.com', 'eatsure.com', 'dominos.co.in', 'ubereats.com',
      'doordash.com', 'grubhub.com', 'instacart.com', 'licious.in',
      'freshtohome.com', 'countrydelight.in', '1mg.com', 'pharmeasy.in',
      'netmeds.com', 'apollopharmacy.in',
      // western retail and fashion
      'bestbuy.com', 'walmart.com', 'target.com', 'costco.com', 'homedepot.com',
      'lowes.com', 'wayfair.com', 'chewy.com', 'ikea.com', 'argos.co.uk',
      'sephora.com', 'ulta.com', 'asos.com', 'zara.com', 'hm.com', 'uniqlo.com',
      'nike.com', 'adidas.com', 'puma.com', 'decathlon.in', 'decathlon.com',
      'gap.com', 'macys.com', 'nordstrom.com', 'farfetch.com', 'boohoo.com',
    ],
    keywords: ['shopping', 'bazaar', 'grocery', 'ecommerce', 'fashion', 'coupon',
      'discount', 'wholesale'],
    tokens: ['shop', 'shops', 'store', 'stores', 'cart', 'mart', 'mall', 'buy',
      'deals', 'coupons', 'offers', 'outlet', 'bazar', 'market'],
    tlds: ['shop', 'store', 'shopping', 'deals', 'boutique', 'sale', 'fashion',
      'clothing', 'market'],
    prefixes: ['shop', 'store', 'grocer'],
    suffixes: ['cart', 'kart', 'store', 'mart', 'bazaar', 'mall'],
    // The Shopify / WooCommerce / Magento shape. A store called anything at all
    // still puts its wares under one of these.
    paths: ['/collections/', '/products/', '/product/', '/cart', '/checkout',
      '/add-to-cart', '/shop/', '/store/', '/catalog/', '/basket'],
  },
  {
    name: 'Finance',
    color: 'grey',
    domains: [
      'zerodha.com', 'kite.zerodha.com', 'groww.in', 'upstox.com', 'angelone.in',
      'dhan.co', 'fyers.in', 'indmoney.com', 'smallcase.com', 'kuvera.in',
      'paytm.com', 'phonepe.com', 'razorpay.com', 'stripe.com', 'cred.club',
      'hdfcbank.com', 'icicibank.com', 'sbi.co.in', 'onlinesbi.sbi', 'axisbank.com',
      'kotak.com', 'yesbank.in', 'idfcfirstbank.com', 'bankofbaroda.in',
      'chase.com', 'wellsfargo.com', 'bankofamerica.com', 'citibank.com',
      'paypal.com', 'wise.com', 'revolut.com',
      'tradingview.com', 'coinbase.com', 'binance.com', 'kraken.com',
      'coinmarketcap.com', 'coingecko.com', 'wazirx.com', 'coindcx.com',
      'moneycontrol.com', 'nseindia.com', 'bseindia.com', 'screener.in',
      'tickertape.in', 'trendlyne.com', 'valueresearchonline.com',
      'incometax.gov.in', 'cleartax.in', 'quicko.com', 'policybazaar.com',
    ],
    keywords: ['banking', 'finance', 'payments', 'insurance', 'trading', 'crypto',
      'wallet', 'invest'],
    tokens: ['bank', 'pay', 'payments', 'stocks', 'loans', 'tax', 'billing'],
  },
  {
    name: 'Search',
    color: 'grey',
    domains: [
      'google.com', 'google.co.in', 'bing.com', 'duckduckgo.com', 'search.brave.com',
      'ecosia.org', 'startpage.com', 'yandex.com', 'baidu.com', 'kagi.com',
    ],
  },
  {
    name: 'Travel',
    color: 'blue',
    domains: [
      'booking.com', 'airbnb.com', 'expedia.com', 'agoda.com', 'trivago.com',
      'makemytrip.com', 'goibibo.com', 'yatra.com', 'cleartrip.com', 'ixigo.com',
      'irctc.co.in', 'indianrail.gov.in', 'redbus.in', 'abhibus.com',
      'skyscanner.com', 'kayak.com', 'tripadvisor.com', 'oyorooms.com',
      'uber.com', 'olacabs.com', 'rapido.bike', 'lyft.com', 'maps.google.com',
      'indigo.in', 'airindia.com', 'spicejet.com', 'emirates.com', 'lufthansa.com',
      'britishairways.com', 'qatarairways.com',
    ],
    keywords: ['travel', 'flights', 'hotels', 'airlines', 'tourism', 'holiday'],
    tokens: ['travel', 'flight', 'flights', 'hotel', 'hotels', 'trip', 'tours',
      'railway', 'metro', 'airport'],
    tlds: ['travel', 'flights', 'holiday', 'tours'],
    prefixes: ['travel'],
    suffixes: ['travel', 'tours', 'trips'],
  },
]

/** How a category came to claim a hostname. */
export type CategoryVia =
  | 'domain'
  | 'tld'
  | 'token'
  | 'prefix'
  | 'suffix'
  | 'keyword'
  | 'path'

export interface CategoryMatch {
  category: Category
  /** The domain entry, TLD, token or keyword that matched. */
  matchedOn: string
  via: CategoryVia
}

function normalizeHost(hostname: string): string {
  return hostname.replace(/^www\./i, '').toLowerCase()
}

/**
 * Find the best category for a hostname using the domain tables only. Longest
 * matching domain entry wins, so more specific entries (mail.google.com) beat
 * broader ones (google.com).
 */
export function matchCategory(hostname: string): CategoryMatch | null {
  const host = normalizeHost(hostname)
  if (!host) return null

  let best: CategoryMatch | null = null
  for (const category of CATEGORIES) {
    for (const domain of category.domains) {
      const bare = domain.toLowerCase()
      if (host === bare || host.endsWith('.' + bare)) {
        if (!best || bare.length > best.matchedOn.length) {
          best = { category, matchedOn: bare, via: 'domain' }
        }
      }
    }
  }
  return best
}

/** Shortest prefix/suffix worth trusting, and the site name it needs left over. */
const MIN_AFFIX = 4
const MIN_REMAINDER = 3

/**
 * Guard against an affix swallowing most of the name: "mart" must not claim
 * "smart", and a three-letter affix is never distinctive enough to trust.
 */
function affixFits(site: string, affix: string): boolean {
  return affix.length >= MIN_AFFIX && site.length - affix.length >= MIN_REMAINDER
}

/**
 * Every hostname label plus every hyphen-separated piece of each label.
 * "boat-lifestyle.co.in" -> boat-lifestyle, boat, lifestyle, co, in
 */
function hostTokens(host: string): Set<string> {
  const out = new Set<string>()
  for (const label of host.split('.')) {
    if (!label) continue
    out.add(label)
    if (label.includes('-')) {
      for (const piece of label.split('-')) if (piece) out.add(piece)
    }
  }
  return out
}

/**
 * Guess a category for a hostname no domain table knows, from the shape of the
 * hostname itself: its public suffix, its labels, and its site name.
 *
 * This is what stops every brand-new shopping or streaming site from becoming
 * its own one-tab group. It is only reached after matchCategory has failed, so
 * it can never overrule a site the tables already know.
 */
export function matchCategoryByHint(hostname: string, path?: string): CategoryMatch | null {
  const host = normalizeHost(hostname)
  if (!host || host === 'localhost') return null
  // Bare IP literals have no meaningful shape to read.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) return null

  const site = getRegistrableDomain(host).split('.')[0]
  const tokens = hostTokens(host)

  let best: CategoryMatch | null = null
  let bestScore = 0

  const consider = (category: Category, matchedOn: string, via: CategoryVia, score: number) => {
    if (score > bestScore) {
      bestScore = score
      best = { category, matchedOn, via }
    }
  }

  for (const category of CATEGORIES) {
    // A dedicated public suffix is the strongest signal available.
    for (const tld of category.tlds ?? []) {
      if (host.endsWith('.' + tld)) consider(category, tld, 'tld', tld.length + 8)
    }
    // A whole label or hyphen segment: "shop.acme.com", "acme-store.com".
    for (const token of category.tokens ?? []) {
      if (tokens.has(token)) consider(category, token, 'token', token.length + 4)
    }
    // The site name opens or closes with the word: "shopatmycart", "bookmykart".
    for (const affix of category.prefixes ?? []) {
      if (affixFits(site, affix) && site.startsWith(affix)) {
        consider(category, affix, 'prefix', affix.length + 2)
      }
    }
    for (const affix of category.suffixes ?? []) {
      if (affixFits(site, affix) && site.endsWith(affix)) {
        consider(category, affix, 'suffix', affix.length + 2)
      }
    }
    // A distinctive word inside the site name: "bestshopping", "mytutorials".
    for (const keyword of category.keywords ?? []) {
      if (site.includes(keyword)) consider(category, keyword, 'keyword', keyword.length)
    }
  }

  // Only when the hostname gave up entirely: read the path. A small shop on its
  // own vanity domain looks like nothing at all until you see /collections/.
  if (!best && path) return matchPathHint(path)

  return best
}

/** Last-resort read of the URL path. Longest matching fragment wins. */
function matchPathHint(path: string): CategoryMatch | null {
  const p = path.toLowerCase()
  let best: CategoryMatch | null = null
  for (const category of CATEGORIES) {
    for (const fragment of category.paths ?? []) {
      if (p.includes(fragment) && fragment.length > (best?.matchedOn.length ?? 0)) {
        best = { category, matchedOn: fragment, via: 'path' }
      }
    }
  }
  return best
}

/** Category names in table order — used by the options-page pickers. */
export function categoryNames(): string[] {
  return CATEGORIES.map((c) => c.name)
}

/** Look a category up by name, case-insensitively. */
export function categoryByName(name: string): Category | null {
  const wanted = name.trim().toLowerCase()
  return CATEGORIES.find((c) => c.name.toLowerCase() === wanted) ?? null
}
