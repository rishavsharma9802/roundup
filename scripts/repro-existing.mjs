/**
 * Hypothesis: the user's tabs are already in named groups (left over from
 * ATO / Marble). With `respectExistingGroups: true` every tab is skipped, so
 * Group Now correctly does nothing -- but says so far too quietly.
 */
import { chromium } from 'playwright'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const EXT = resolve('dist')
const profile = mkdtempSync(join(tmpdir(), 'tg-exist-'))

const context = await chromium.launchPersistentContext(profile, {
  headless: false,
  executablePath: process.env.CHROME_BIN,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox', '--no-first-run'],
})

try {
  let [worker] = context.serviceWorkers()
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 })
  const id = new URL(worker.url()).host

  await context.route('**/*', (r) =>
    r.request().url().startsWith('chrome-extension://')
      ? r.continue()
      : r.fulfill({ status: 200, body: '<title>t</title>' }),
  )

  for (const u of [
    'https://github.com/a',
    'https://github.com/b',
    'https://www.youtube.com/watch?v=1',
    'https://www.youtube.com/watch?v=2',
  ]) {
    const p = await context.newPage()
    await p.goto(u).catch(() => {})
  }

  // Simulate what another tab organiser leaves behind: named groups.
  await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({})
    const real = tabs.filter((t) => t.url?.startsWith('https://')).map((t) => t.id)
    const gid = await chrome.tabs.group({ tabIds: real })
    await chrome.tabGroups.update(gid, { title: 'ATO: Dev', color: 'purple' })
  })

  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${id}/popup.html`)
  await popup.waitForSelector('.tg-popup')
  await popup.click('.tg-primary')
  await popup.waitForTimeout(2000)

  const notice = await popup.textContent('.tg-notice').catch(() => '(NO NOTICE SHOWN)')
  console.log('--- SCENARIO: tabs already in a named group ---')
  console.log('NOTICE SHOWN:', JSON.stringify(notice))
  await popup.screenshot({ path: 'screenshots/popup-nothing.png' })

  const hasForceBtn = await popup.locator('.tg-notice-btn').count()
  console.log('escape-hatch button present:', hasForceBtn === 1)

  // Click it and confirm the tabs actually get reorganised.
  await popup.click('.tg-notice-btn')
  await popup.waitForTimeout(2500)
  const after = await popup.evaluate(async () => {
    const g = await chrome.tabGroups.query({})
    return g.map((x) => x.title)
  })
  const finalStatus = await popup.textContent('.tg-status').catch(() => '(none)')
  console.log('groups after forcing :', JSON.stringify(after))
  console.log('status after forcing :', JSON.stringify(finalStatus))
  await popup.screenshot({ path: 'screenshots/popup-forced.png' })
} catch (err) {
  console.log('THREW:', err?.message ?? err)
} finally {
  await context.close()
  rmSync(profile, { recursive: true, force: true })
}
