/**
 * The reported bug: rename an auto-created group, click Group Now, and the
 * custom name gets reverted to the built-in category name.
 *
 * Covers three ways a rename must survive:
 *   1. a plain re-run
 *   2. a forced re-run
 *   3. a re-run after a brand-new matching tab appears
 */
import { chromium } from 'playwright'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const EXT = resolve('dist')
const profile = mkdtempSync(join(tmpdir(), 'tg-rename-'))
const fails = []
const ok = []
const check = (label, pass, detail = '') =>
  pass ? ok.push(`PASS  ${label}`) : fails.push(`FAIL  ${label}${detail ? ' -- ' + detail : ''}`)

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

  const open = async (u) => {
    const p = await context.newPage()
    await p.goto(u).catch(() => {})
  }
  await open('https://github.com/a')
  await open('https://github.com/b')
  await open('https://www.youtube.com/watch?v=1')
  await open('https://www.youtube.com/watch?v=2')

  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${id}/popup.html`)
  await popup.waitForSelector('.tg-popup')

  const titles = async () =>
    popup.evaluate(async () => (await chrome.tabGroups.query({})).map((g) => g.title).sort())

  // --- first run creates the built-in groups -----------------------------
  await popup.click('.tg-primary')
  await popup.waitForTimeout(2000)
  check('first run creates Code + Media', JSON.stringify(await titles()) === '["Code","Media"]', JSON.stringify(await titles()))

  // --- rename "Code" -> "Client work", via the popup's own rename UI -----
  await popup.reload()
  await popup.waitForSelector('.tg-group-list')
  const codeRow = popup.locator('.tg-group-row', { hasText: 'Code' }).first()
  await codeRow.locator('button[aria-label="Rename group"]').click()
  await popup.fill('.tg-rename-input', 'Client work')
  await popup.press('.tg-rename-input', 'Enter')
  await popup.waitForTimeout(1200)
  check('popup rename applies', (await titles()).includes('Client work'), JSON.stringify(await titles()))

  // --- 1. plain re-run must not revert it --------------------------------
  await popup.click('.tg-primary')
  await popup.waitForTimeout(2000)
  let t = await titles()
  check('survives a plain re-run', t.includes('Client work') && !t.includes('Code'), JSON.stringify(t))

  // --- 2. forced re-run must not revert it either ------------------------
  const forceBtn = popup.locator('.tg-notice-btn')
  if (await forceBtn.count()) {
    await forceBtn.click()
  } else {
    await popup.evaluate(async () => {
      const w = await chrome.windows.getCurrent()
      await chrome.runtime.sendMessage({ type: 'GROUP_NOW', windowId: w.id, force: true })
    })
  }
  await popup.waitForTimeout(2500)
  t = await titles()
  check('survives a FORCED re-run', t.includes('Client work') && !t.includes('Code'), JSON.stringify(t))

  // --- 3. a new matching tab joins the renamed group, not a new "Code" ---
  await open('https://github.com/c')
  await popup.click('.tg-primary')
  await popup.waitForTimeout(2000)
  t = await titles()
  check('new tab joins the renamed group', t.includes('Client work') && !t.includes('Code'), JSON.stringify(t))

  const counts = await popup.evaluate(async () => {
    const groups = await chrome.tabGroups.query({})
    const tabs = await chrome.tabs.query({})
    return groups.map((g) => ({ title: g.title, n: tabs.filter((x) => x.groupId === g.id).length }))
  })
  const client = counts.find((c) => c.title === 'Client work')
  check('the new tab actually landed in it', client?.n === 3, JSON.stringify(counts))

  await popup.reload()
  await popup.waitForSelector('.tg-group-list')
  await popup.screenshot({ path: 'screenshots/popup-renamed.png' })
} catch (err) {
  fails.push(`FAIL  threw -- ${err?.message ?? err}`)
} finally {
  await context.close()
  rmSync(profile, { recursive: true, force: true })
}

console.log(ok.join('\n'))
if (fails.length) {
  console.log('\n' + fails.join('\n'))
  process.exit(1)
}
console.log('\nRename survives every path')
