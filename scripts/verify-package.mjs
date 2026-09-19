#!/usr/bin/env node
/**
 * Verify what would actually ship.
 *
 * Every check here corresponds to a way a Chrome extension has genuinely been
 * rejected or embarrassed itself: shipping source maps, shipping a .env,
 * declaring a permission nothing uses, or quietly acquiring a network call that
 * contradicts the privacy claim in the listing.
 *
 * Runs against dist/ after a build. Exits non-zero on the first real problem,
 * so CI fails loudly rather than producing a package nobody inspected.
 *
 *   node scripts/verify-package.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, extname } from 'node:path'

const DIST = 'dist'
const problems = []
const notes = []

/** Every file under dist/, relative to it. */
function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, acc)
    else acc.push(relative(DIST, full))
  }
  return acc
}

let files
try {
  files = walk(DIST)
} catch {
  console.error(`✗ no ${DIST}/ directory — run "npm run build" first`)
  process.exit(1)
}

/* ---- 1. the manifest must sit at the root of the package ---------------- */

if (!files.includes('manifest.json')) {
  problems.push('manifest.json is not at the root of dist/ — the Web Store will reject the zip')
}

const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8'))
notes.push(`${manifest.name} v${manifest.version}`)

/* ---- 2. nothing that should never be published -------------------------- */

const FORBIDDEN = [
  { test: (f) => f.endsWith('.map'), why: 'source map' },
  { test: (f) => ['.ts', '.tsx'].includes(extname(f)), why: 'TypeScript source' },
  { test: (f) => f.includes('.env'), why: 'env file' },
  { test: (f) => f.includes('node_modules'), why: 'dependency tree' },
  { test: (f) => f.endsWith('.DS_Store'), why: 'macOS metadata' },
  { test: (f) => f.endsWith('.svg'), why: 'design source' },
]

for (const file of files) {
  for (const rule of FORBIDDEN) {
    if (rule.test(file)) problems.push(`${file} would ship (${rule.why})`)
  }
}

/* ---- 3. the privacy claim has to survive contact with the bundle --------- */

/**
 * Roundup's listing says it makes no network requests. That is a claim about
 * the built artifact, not about the source, so check the artifact.
 */
const NETWORK_APIS = [
  'fetch(',
  'XMLHttpRequest',
  'WebSocket',
  'sendBeacon',
  'EventSource',
  'importScripts',
]
const EVAL_APIS = ['eval(', 'new Function']

const scripts = files.filter((f) => f.endsWith('.js'))
for (const file of scripts) {
  const code = readFileSync(join(DIST, file), 'utf8')
  for (const api of NETWORK_APIS) {
    if (code.includes(api)) {
      problems.push(`${file} contains "${api}" — the listing claims no network requests`)
    }
  }
  for (const api of EVAL_APIS) {
    // React's production build does not use these; anything that does is ours.
    if (code.includes(api)) {
      problems.push(`${file} contains "${api}" — MV3 forbids dynamically evaluated code`)
    }
  }
}

/* ---- 4. every declared permission must actually be used ----------------- */

/**
 * An unused permission is a reviewer asking "why do you need this?" with no
 * good answer. Each entry names the API that justifies the permission.
 */
const PERMISSION_EVIDENCE = {
  tabs: ['chrome.tabs', '.tabs.'],
  tabGroups: ['chrome.tabGroups', '.tabGroups.'],
  storage: ['chrome.storage', '.storage.'],
  favicon: ['_favicon'],
}

const allCode = scripts.map((f) => readFileSync(join(DIST, f), 'utf8')).join('\n')
for (const permission of manifest.permissions ?? []) {
  const evidence = PERMISSION_EVIDENCE[permission]
  if (!evidence) {
    notes.push(`permission "${permission}" has no declared evidence in this script — add one`)
    continue
  }
  if (!evidence.some((marker) => allCode.includes(marker))) {
    problems.push(`permission "${permission}" is declared but nothing in the bundle uses it`)
  }
}

/* ---- 5. host permissions would change the review entirely --------------- */

if (manifest.host_permissions?.length) {
  problems.push(
    `host_permissions is set (${manifest.host_permissions.join(', ')}) — ` +
      'Roundup is meant to need none, and they slow review considerably',
  )
}
if (manifest.content_scripts?.length) {
  problems.push('content_scripts is set — Roundup is meant to inject nothing into pages')
}

/* ---- 6. the icons the manifest promises must exist ---------------------- */

for (const [size, path] of Object.entries(manifest.icons ?? {})) {
  if (!files.includes(path)) problems.push(`icons["${size}"] points at ${path}, which is not in dist/`)
}

/* ---- report ------------------------------------------------------------- */

const totalBytes = files.reduce((sum, f) => sum + statSync(join(DIST, f)).size, 0)

console.log(`package: ${files.length} files, ${(totalBytes / 1024).toFixed(0)} KB`)
for (const note of notes) console.log(`  · ${note}`)

if (problems.length === 0) {
  console.log('✓ package looks clean')
  process.exit(0)
}

console.error(`\n✗ ${problems.length} problem${problems.length === 1 ? '' : 's'}:`)
for (const problem of problems) console.error(`  - ${problem}`)
process.exit(1)
