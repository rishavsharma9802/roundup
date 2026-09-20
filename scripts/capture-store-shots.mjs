/**
 * Capture the real UI for the Chrome Web Store listing.
 *
 * These are genuine screenshots of the extension doing its job — the popup
 * after a grouping run, and the options page with rules and the live tester.
 * Nothing is mocked up; what the store shows is what the user gets.
 *
 *   CHROME_BIN=/path/to/chrome xvfb-run -a node scripts/capture-store-shots.mjs
 */
import { chromium } from 'playwright'
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const EXT = resolve('dist')
const OUT = resolve('store/raw')
mkdirSync(OUT, { recursive: true })
const profile = mkdtempSync(join(tmpdir(), 'roundup-shots-'))

const context = await chromium.launchPersistentContext(profile, {
  headless: false,
  executablePath: process.env.CHROME_BIN,
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
  args: [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    '--no-sandbox',
    '--no-first-run',
  ],
})

try {
  let [worker] = context.serviceWorkers()
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 })
  const id = new URL(worker.url()).host
  console.log('extension id:', id)

  // Serve stand-in pages so nothing leaves the machine, but keep the
  // extension's own assets real.
  await context.route('**/*', (r) =>
    r.request().url().startsWith('chrome-extension://')
      ? r.continue()
      : r.fulfill({ status: 200, contentType: 'text/html', body: '<title>page</title>' }),
  )

  // A believable working session: a few clusters plus some long-tail sites.
  const urls = [
    'https://github.com/rishavsharma9802/roundup',
    'https://github.com/anthropics/claude-code',
    'https://stackoverflow.com/questions/12345',
    'https://developer.mozilla.org/en-US/docs/Web/API/fetch',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=abc123',
    'https://mail.google.com/mail/u/0/',
    'https://calendar.google.com/calendar/u/0/r',
    'https://www.amazon.in/dp/B08N5WRWNW',
    'https://www.flipkart.com/search?q=keyboard',
  ]
  for (const u of urls) {
    const p = await context.newPage()
    await p.goto(u).catch(() => {})
  }

  // Run a grouping pass so the popup has something real to show.
  const popup = await context.newPage()
  await popup.setViewportSize({ width: 380, height: 560 })
  await popup.goto(`chrome-extension://${id}/popup.html`)
  await popup.waitForSelector('.tg-popup', { timeout: 10000 })
  await popup.click('.tg-primary')
  await popup.waitForTimeout(2500)
  await popup.reload()
  await popup.waitForSelector('.tg-group-list', { timeout: 10000 })
  await popup.waitForTimeout(600)

  // Tight crop of the popup itself, at 2x for a crisp store image.
  const box = await popup.locator('.tg-popup').boundingBox()
  await popup.screenshot({
    path: join(OUT, 'popup.png'),
    clip: { x: 0, y: 0, width: Math.ceil(box.width), height: Math.ceil(box.height) },
  })
  console.log('popup captured', Math.ceil(box.width), 'x', Math.ceil(box.height))

  // Options page: rules, the live tester, and settings.
  const options = await context.newPage()
  await options.setViewportSize({ width: 1000, height: 900 })
  await options.goto(`chrome-extension://${id}/options.html`)
  await options.waitForSelector('.tg-options', { timeout: 10000 })

  const preset = options.locator('text=Add Jira / Confluence preset')
  if (await preset.count()) {
    await preset.click()
    await options.waitForTimeout(800)
  }
  const tester = options.locator('.tg-tester-input')
  if (await tester.count()) {
    await tester.fill('https://acme.atlassian.net/wiki/spaces/ENG/overview')
    await options.waitForTimeout(900)
  }
  await options.screenshot({ path: join(OUT, 'options-full.png'), fullPage: true })
  await options.screenshot({ path: join(OUT, 'options.png') })

  // A narrower pass: the store scales these down hard, so capture the options
  // page in a single compact column where the text survives the shrink.
  await options.setViewportSize({ width: 720, height: 1000 })
  await options.waitForTimeout(500)
  await options.screenshot({ path: join(OUT, 'options-narrow.png'), fullPage: true })

  // Individual cards, so the compositor never has to guess at crop offsets.
  const cards = [
    ['Custom rules', 'card-rules.png'],
    ['Test a URL', 'card-tester.png'],
    ['Site catalog', 'card-catalog.png'],
  ]
  for (const [heading, file] of cards) {
    const card = options.locator('.tg-card', { hasText: heading }).first()
    if (await card.count()) {
      await card.screenshot({ path: join(OUT, file) })
      console.log('card captured:', file)
    } else {
      console.log('card NOT FOUND:', heading)
    }
  }
  console.log('options captured (wide + narrow + cards)')

  // The grouped tab strip is the payoff — capture the whole window.
  const first = context.pages()[1]
  await first.bringToFront()
  await first.waitForTimeout(500)
  await first.screenshot({ path: join(OUT, 'window.png') })
  console.log('window captured')
} catch (err) {
  console.log('THREW:', err?.message ?? err)
  process.exitCode = 1
} finally {
  await context.close()
  rmSync(profile, { recursive: true, force: true })
}
