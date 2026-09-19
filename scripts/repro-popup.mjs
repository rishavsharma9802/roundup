/**
 * Reproduces exactly what the popup does: send GROUP_NOW with NO windowId,
 * from a popup page rendered the way Chrome renders it.
 */
import { chromium } from 'playwright'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const EXT = resolve('dist')
const profile = mkdtempSync(join(tmpdir(), 'tg-repro-'))

const context = await chromium.launchPersistentContext(profile, {
  headless: false,
  executablePath: process.env.CHROME_BIN,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox', '--no-first-run'],
})

const logs = []
context.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`))

try {
  let [worker] = context.serviceWorkers()
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 })
  const id = new URL(worker.url()).host

  await context.route('**/*', (r) => (r.request().url().startsWith('chrome-extension://') ? r.continue() : r.fulfill({ status: 200, body: '<title>t</title>' })))

  // A realistic mix: some categories with 2+ tabs, some with only 1.
  const urls = [
    'https://github.com/a',
    'https://github.com/b',
    'https://www.youtube.com/watch?v=1',
    'https://www.youtube.com/watch?v=2',
    'https://news.ycombinator.com/',
    'https://www.amazon.in/dp/X',
  ]
  for (const u of urls) {
    const p = await context.newPage()
    await p.goto(u).catch(() => {})
  }

  // What does the worker think "the current window" is, with no windowId given?
  const winInfo = await worker.evaluate(async () => {
    const all = await chrome.windows.getAll({})
    let current = null
    let err = null
    try {
      const c = await chrome.windows.getCurrent()
      current = c.id
    } catch (e) {
      err = String(e)
    }
    const tabs = await chrome.tabs.query({})
    return {
      windowIds: all.map((w) => w.id),
      currentFromWorker: current,
      currentError: err,
      tabsPerWindow: all.map((w) => ({
        id: w.id,
        n: tabs.filter((t) => t.windowId === w.id).length,
      })),
    }
  })
  console.log('WINDOW RESOLUTION FROM WORKER:', JSON.stringify(winInfo, null, 2))

  // Now do exactly what the popup does: open popup.html, click Group Now.
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${id}/popup.html`)
  await popup.waitForSelector('.tg-popup')

  const before = await popup.evaluate(async () => {
    const w = await chrome.windows.getCurrent()
    const g = await chrome.tabGroups.query({ windowId: w.id })
    return { popupWindowId: w.id, groups: g.length }
  })
  console.log('BEFORE CLICK:', JSON.stringify(before))

  await popup.click('.tg-primary')
  await popup.waitForTimeout(2500)

  const status = await popup.textContent('.tg-status').catch(() => '(no status element)')
  console.log('STATUS TEXT SHOWN TO USER:', JSON.stringify(status))

  const after = await popup.evaluate(async () => {
    const w = await chrome.windows.getCurrent()
    const groups = await chrome.tabGroups.query({})
    return {
      popupWindowId: w.id,
      allGroups: groups.map((g) => ({ title: g.title, windowId: g.windowId })),
    }
  })
  console.log('AFTER CLICK:', JSON.stringify(after, null, 2))

  console.log('\nCONSOLE OUTPUT:')
  console.log(logs.filter((l) => !/preload|Failed to load/i.test(l)).join('\n') || '(none)')
} catch (err) {
  console.log('THREW:', err?.message ?? err)
} finally {
  await context.close()
  rmSync(profile, { recursive: true, force: true })
}
