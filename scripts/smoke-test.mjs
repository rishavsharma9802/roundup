/**
 * Loads the built extension into a real Chromium profile and checks that the
 * pieces Chrome cares about actually work: the manifest parses, the service
 * worker registers and stays error-free, the popup and options pages render,
 * and the grouping engine really regroups tabs.
 *
 * Run with:  xvfb-run -a node scripts/smoke-test.mjs
 */
import { chromium } from 'playwright'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const EXT = resolve('dist')
const profile = mkdtempSync(join(tmpdir(), 'tg-profile-'))
const failures = []
const notes = []

function check(label, ok, detail = '') {
  if (ok) notes.push(`PASS  ${label}`)
  else failures.push(`FAIL  ${label}${detail ? ' -- ' + detail : ''}`)
}

const context = await chromium.launchPersistentContext(profile, {
  headless: false,
  executablePath: process.env.CHROME_BIN,
  args: [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    '--no-sandbox',
    '--no-first-run',
  ],
})

// Collect anything the extension logs as an error anywhere.
const consoleErrors = []
context.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text())
})
context.on('weberror', (e) => consoleErrors.push(String(e.error())))

try {
  // --- service worker registers ------------------------------------------
  let [worker] = context.serviceWorkers()
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 })
  check('service worker registered', Boolean(worker))

  const extensionId = new URL(worker.url()).host
  notes.push(`      extension id: ${extensionId}`)

  // --- the pages render ---------------------------------------------------
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  await popup.waitForSelector('.tg-popup', { timeout: 10000 })
  const groupBtn = await popup.textContent('.tg-primary')
  check('popup renders with a Group Now button', /Group Now/i.test(groupBtn ?? ''), groupBtn ?? '')
  await popup.screenshot({ path: 'screenshots/popup.png' })

  const options = await context.newPage()
  await options.goto(`chrome-extension://${extensionId}/options.html`)
  await options.waitForSelector('.tg-options', { timeout: 10000 })
  check('options page renders', true)

  // --- the live tester works end to end ----------------------------------
  await options.click('text=Add Jira / Confluence preset')
  await options.waitForSelector('.tg-rule', { timeout: 5000 })
  const ruleCount = await options.locator('.tg-rule').count()
  check('preset adds two rules', ruleCount === 2, `got ${ruleCount}`)

  await options.fill('.tg-tester-input', 'https://acme.atlassian.net/wiki/spaces/ENG/overview')
  await options.waitForSelector('.tg-verdict-hit', { timeout: 5000 })
  const verdict = await options.textContent('.tg-verdict-head')
  check('tester routes a Confluence URL to Confluence', /Confluence/.test(verdict ?? ''), verdict ?? '')

  await options.fill('.tg-tester-input', 'https://acme.atlassian.net/browse/ENG-1234')
  await options.waitForFunction(
    () => document.querySelector('.tg-verdict-head')?.textContent?.includes('Jira'),
    undefined,
    { timeout: 5000 },
  )
  check('tester routes a Jira URL to Jira', true)
  await options.screenshot({ path: 'screenshots/options.png', fullPage: true })

  // --- real grouping against real tabs ------------------------------------
  // Data URLs cannot be grouped, so use about:blank-free real-ish origins.
  const urls = [
    'https://github.com/one',
    'https://github.com/two',
    'https://stackoverflow.com/q/1',
    'https://www.youtube.com/watch?v=a',
    'https://www.youtube.com/watch?v=b',
  ]
  // Block the network so the pages resolve instantly without leaving the box.
  await context.route('**/*', (route) => route.fulfill({ status: 200, body: '<title>t</title>' }))
  for (const url of urls) {
    const page = await context.newPage()
    await page.goto(url).catch(() => {})
  }

  // Messages must come from an extension *page*: a service worker does not
  // receive its own runtime.sendMessage calls.
  const result = await options.evaluate(async () => {
    const win = await chrome.windows.getCurrent()
    const before = await chrome.tabs.query({ windowId: win.id })
    const response = await chrome.runtime.sendMessage({ type: 'GROUP_NOW', windowId: win.id })
    const groups = await chrome.tabGroups.query({ windowId: win.id })
    return {
      response,
      tabsBefore: before.length,
      groups: groups.map((g) => ({ title: g.title, color: g.color })),
    }
  })

  check('GROUP_NOW returns ok', result.response?.ok === true, JSON.stringify(result.response))
  const titles = result.groups.map((g) => g.title)
  check('a Code group was created', titles.includes('Code'), titles.join(', '))
  check('a Media group was created', titles.includes('Media'), titles.join(', '))

  // --- undo restores the previous arrangement -----------------------------
  const undone = await options.evaluate(async () => {
    const win = await chrome.windows.getCurrent()
    const response = await chrome.runtime.sendMessage({ type: 'UNDO_GROUPING', windowId: win.id })
    const groups = await chrome.tabGroups.query({ windowId: win.id })
    return { response, remaining: groups.length }
  })
  check('UNDO_GROUPING returns ok', undone.response?.ok === true, JSON.stringify(undone.response))
  check('undo removed the groups it created', undone.remaining === 0, `${undone.remaining} left`)

  // --- nothing logged an error -------------------------------------------
  const realErrors = consoleErrors.filter(
    (e) => !/favicon|net::ERR|Failed to load resource/i.test(e),
  )
  check('no console errors', realErrors.length === 0, realErrors.slice(0, 3).join(' | '))
} catch (err) {
  failures.push(`FAIL  smoke test threw -- ${err?.message ?? err}`)
} finally {
  await context.close()
  rmSync(profile, { recursive: true, force: true })
}

console.log(notes.join('\n'))
if (failures.length) {
  console.log('\n' + failures.join('\n'))
  console.log(`\n${failures.length} check(s) failed`)
  process.exit(1)
}
console.log('\nAll smoke checks passed')
