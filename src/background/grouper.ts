import type {
  SkipBreakdown,
  FileSiteResult,
  GroupColor,
  GroupRunResult,
  LooseTab,
  Settings,
  TabSnapshot,
  UndoSnapshot,
  WindowState,
} from '../shared/types'
import { matchUrl } from '../shared/rules'
import { getDomainFromUrl, getHostname, isGroupableUrl } from '../shared/url'
import { getSettings, getUndoSnapshot, saveUndoSnapshot, clearUndoSnapshot } from '../shared/storage'
import {
  catalogKey,
  getSiteCatalog,
  learnSites,
  setSiteCategory,
  type LearnCandidate,
  type SiteCatalog,
} from '../shared/site-catalog'
import { categoryByName } from '../shared/categories'
import {
  getGroupRegistry,
  pruneRegistry,
  saveGroupRegistry,
  type RegistryEntry,
} from '../shared/group-registry'

/** chrome.tabs.TAB_ID_NONE-style sentinel for "not in a group". */
const NO_GROUP = chrome.tabGroups.TAB_GROUP_ID_NONE

interface PlannedGroup {
  /** Stable identity — see MatchResult.key. */
  key: string
  /** The name we would give this group if we have to create it from scratch. */
  title: string
  color: GroupColor
  tabIds: number[]
}

/** Resolve a window id, defaulting to the current one. */
async function resolveWindowId(windowId?: number): Promise<number> {
  if (typeof windowId === 'number') return windowId
  const win = await chrome.windows.getCurrent()
  return win.id ?? chrome.windows.WINDOW_ID_CURRENT
}

/** Existing groups in a window, keyed by lower-cased title for reuse lookups. */
async function existingGroupsByTitle(windowId: number) {
  const groups = await chrome.tabGroups.query({ windowId })
  const byTitle = new Map<string, chrome.tabGroups.TabGroup>()
  for (const g of groups) {
    if (g.title) byTitle.set(g.title.toLowerCase(), g)
  }
  return { groups, byTitle }
}

/**
 * Capture every tab's current group membership so the run can be reversed.
 * Titles and colors are recorded alongside ids because a group ceases to exist
 * the moment its last tab leaves, taking its id with it.
 */
async function takeSnapshot(
  windowId: number,
  tabs: chrome.tabs.Tab[],
): Promise<UndoSnapshot> {
  const { groups } = await existingGroupsByTitle(windowId)
  const groupInfo = new Map(groups.map((g) => [g.id, g]))

  const snapshot: TabSnapshot[] = tabs
    .filter((t) => typeof t.id === 'number')
    .map((t) => {
      const g = t.groupId !== NO_GROUP ? groupInfo.get(t.groupId) : undefined
      return {
        tabId: t.id as number,
        groupId: t.groupId,
        groupTitle: g?.title ?? null,
        groupColor: (g?.color as GroupColor | undefined) ?? null,
      }
    })

  return { windowId, takenAt: Date.now(), tabs: snapshot }
}

type SkipReason = 'notGroupable' | 'locked' | 'inExistingGroups' | null

/**
 * Should this tab be left exactly where it is, and why?
 *
 * Three cases are protected:
 *  - pinned tabs and browser-internal pages, which Chrome will not group;
 *  - tabs in a group the user explicitly locked — a lock always wins, even
 *    when the run is forced;
 *  - tabs already in a *named* group, when "respect existing groups" is on.
 *    A group only gets a title if someone named it, so this is a reliable
 *    proxy for "this was arranged deliberately" — including by another tab
 *    extension the user had installed before.
 */
function skipReasonFor(
  tab: chrome.tabs.Tab,
  settings: Settings,
  groupTitleById: Map<number, string>,
  lockedTitles: Set<string>,
  force: boolean,
): SkipReason {
  if (tab.pinned) return 'notGroupable'
  if (!isGroupableUrl(tab.url)) return 'notGroupable'

  if (tab.groupId !== NO_GROUP) {
    const title = groupTitleById.get(tab.groupId) ?? ''
    if (title && lockedTitles.has(title.toLowerCase())) return 'locked'
    if (!force && settings.respectExistingGroups && title) return 'inExistingGroups'
  }
  return null
}

/**
 * Look up the group we previously created for a rule/category. Returns null if
 * it has since been closed, or now lives in a different window — in both cases
 * the caller falls back to matching by name.
 */
async function resolveManagedGroup(
  entry: RegistryEntry | undefined,
  windowId: number,
): Promise<chrome.tabGroups.TabGroup | null> {
  if (!entry) return null
  try {
    const group = await chrome.tabGroups.get(entry.groupId)
    if (group.windowId !== windowId) return null
    return group
  } catch {
    return null
  }
}

function emptySkips(): SkipBreakdown {
  return {
    total: 0,
    inExistingGroups: 0,
    locked: 0,
    belowMinimum: 0,
    noMatch: 0,
    notGroupable: 0,
  }
}

/**
 * Group every eligible tab in a window according to the current rules.
 *
 * Tabs already sitting in the correct group are left untouched, so re-running
 * this is cheap and does not reshuffle the tab strip.
 */
export async function groupNow(windowId?: number, force = false): Promise<GroupRunResult> {
  const winId = await resolveWindowId(windowId)
  const settings = await getSettings()
  const tabs = await chrome.tabs.query({ windowId: winId })

  const { groups, byTitle } = await existingGroupsByTitle(winId)
  const groupTitleById = new Map(groups.map((g) => [g.id, g.title ?? '']))
  const lockedTitles = new Set(settings.lockedGroups.map((t) => t.toLowerCase()))

  const registry = await getGroupRegistry()
  const catalog = await getSiteCatalog()
  const snapshot = await takeSnapshot(winId, tabs)

  const planned = new Map<string, PlannedGroup>()
  const skipped = emptySkips()
  /** Sites the hint matcher claimed this run, keyed by domain so we learn once. */
  const candidates = new Map<string, LearnCandidate>()

  for (const tab of tabs) {
    if (typeof tab.id !== 'number') continue

    const reason = skipReasonFor(tab, settings, groupTitleById, lockedTitles, force)
    if (reason) {
      skipped.total++
      skipped[reason]++
      continue
    }

    const match = matchUrl(tab.url ?? '', settings, {
      catalog,
      useHeuristics: settings.useHeuristics,
    })
    if (!match) {
      skipped.total++
      skipped.noMatch++
      continue
    }

    // A guess made from the hostname's shape is worth writing down: next run it
    // is a known site instead of a guess, and it shows up in the options page
    // where it can be corrected.
    if (match.source === 'heuristic') {
      const domain = getDomainFromUrl(tab.url)
      if (domain && !candidates.has(domain)) {
        candidates.set(domain, { domain, category: match.groupName, note: match.reason })
      }
    }

    const entry = planned.get(match.key)
    if (entry) {
      entry.tabIds.push(tab.id)
    } else {
      planned.set(match.key, {
        key: match.key,
        title: match.groupName,
        color: match.color,
        tabIds: [tab.id],
      })
    }
  }

  let groupsCreated = 0
  let groupsReused = 0
  let tabsMoved = 0

  for (const plan of planned.values()) {
    // 1. The group we already manage for this rule/category, if it still lives.
    //    Following the id is what makes a user's rename stick.
    let target = await resolveManagedGroup(registry[plan.key], winId)

    // 2. Otherwise a group that happens to carry the canonical name, so we
    //    adopt groups the user made by hand instead of duplicating them.
    if (!target) target = byTitle.get(plan.title.toLowerCase()) ?? null

    // A lone tab is not worth a group unless the group already exists.
    if (plan.tabIds.length < settings.minTabsPerGroup && !target) {
      skipped.total += plan.tabIds.length
      skipped.belowMinimum += plan.tabIds.length
      continue
    }

    try {
      if (target) {
        // Only move tabs that are not already in the destination group, and
        // never touch the group's title or color — those belong to the user now.
        const toMove = plan.tabIds.filter((id) => {
          const tab = tabs.find((t) => t.id === id)
          return tab?.groupId !== target!.id
        })
        if (toMove.length > 0) {
          await chrome.tabs.group({ groupId: target.id, tabIds: toMove })
          tabsMoved += toMove.length
        }
        groupsReused++
        registry[plan.key] = {
          groupId: target.id,
          title: target.title ?? plan.title,
          windowId: winId,
        }
      } else {
        const newGroupId = await chrome.tabs.group({
          createProperties: { windowId: winId },
          tabIds: plan.tabIds,
        })
        await chrome.tabGroups.update(newGroupId, {
          title: plan.title,
          color: plan.color,
          collapsed: settings.collapseNewGroups,
        })
        tabsMoved += plan.tabIds.length
        groupsCreated++

        const created = await chrome.tabGroups.get(newGroupId).catch(() => null)
        byTitle.set(plan.title.toLowerCase(), created ?? ({ id: newGroupId } as chrome.tabGroups.TabGroup))
        registry[plan.key] = { groupId: newGroupId, title: plan.title, windowId: winId }
      }
    } catch (err) {
      // A tab can vanish mid-run (user closes it). Skip the group, keep going.
      console.warn('[Roundup] could not build group', plan.title, err)
      skipped.total += plan.tabIds.length
      skipped.notGroupable += plan.tabIds.length
    }
  }

  if (tabsMoved > 0) {
    await saveUndoSnapshot(snapshot)
  }

  const liveIds = new Set((await chrome.tabGroups.query({})).map((g) => g.id))
  await saveGroupRegistry(pruneRegistry(registry, liveIds))

  let learned: { domain: string; category: string }[] = []
  if (settings.autoLearnSites && candidates.size > 0) {
    const added = await learnSites([...candidates.values()])
    learned = added.map((e) => ({ domain: e.domain, category: e.category }))
  }

  return {
    groupsCreated,
    groupsReused,
    tabsMoved,
    skipped,
    ...(learned.length > 0 ? { learned } : {}),
  }
}

/**
 * Reverse the most recent grouping run.
 *
 * Group ids from the snapshot are almost certainly stale by now, so restoration
 * works by title: every touched tab is ungrouped, then tabs that used to share a
 * named group are re-grouped together under that name and color.
 */
export async function undoGrouping(): Promise<boolean> {
  const snapshot = await getUndoSnapshot()
  if (!snapshot) return false

  const liveTabs = await chrome.tabs.query({ windowId: snapshot.windowId })
  const liveIds = new Set(liveTabs.map((t) => t.id))
  const entries = snapshot.tabs.filter((t) => liveIds.has(t.tabId))
  if (entries.length === 0) {
    await clearUndoSnapshot()
    return false
  }

  // Step 1: pull everything we touched back out of its group.
  try {
    await chrome.tabs.ungroup(entries.map((e) => e.tabId))
  } catch (err) {
    console.warn('[Roundup] ungroup during undo failed', err)
  }

  // Step 2: rebuild the groups that existed before, keyed by their old title.
  const rebuild = new Map<string, { title: string; color: GroupColor; tabIds: number[] }>()
  for (const entry of entries) {
    if (entry.groupId === NO_GROUP || !entry.groupTitle) continue
    const key = entry.groupTitle.toLowerCase()
    const found = rebuild.get(key)
    if (found) {
      found.tabIds.push(entry.tabId)
    } else {
      rebuild.set(key, {
        title: entry.groupTitle,
        color: entry.groupColor ?? 'grey',
        tabIds: [entry.tabId],
      })
    }
  }

  for (const group of rebuild.values()) {
    try {
      const id = await chrome.tabs.group({
        createProperties: { windowId: snapshot.windowId },
        tabIds: group.tabIds,
      })
      await chrome.tabGroups.update(id, { title: group.title, color: group.color })
    } catch (err) {
      console.warn('[Roundup] could not restore group during undo', err)
    }
  }

  await clearUndoSnapshot()
  return true
}

/** How many "doesn't fit?" rows the popup is willing to show at once. */
const MAX_LOOSE_TABS = 8

/**
 * Tabs worth offering a category picker for: the one the user is looking at,
 * plus anything still sitting outside a group. One row per site — five tabs of
 * the same shop is one decision, not five.
 */
function collectLooseTabs(
  tabs: chrome.tabs.Tab[],
  settings: Settings,
  catalog: SiteCatalog,
): LooseTab[] {
  const found: LooseTab[] = []

  for (const tab of tabs) {
    if (typeof tab.id !== 'number' || tab.pinned) continue
    if (!isGroupableUrl(tab.url)) continue

    const isActive = tab.active === true
    const isUngrouped = tab.groupId === NO_GROUP
    if (!isActive && !isUngrouped) continue

    const domain = getDomainFromUrl(tab.url)
    if (!domain) continue

    const match = matchUrl(tab.url ?? '', settings, {
      catalog,
      useHeuristics: settings.useHeuristics,
    })

    found.push({
      id: tab.id,
      title: tab.title?.trim() || domain,
      url: tab.url ?? '',
      domain,
      wouldGroup: match?.groupName ?? null,
      active: isActive,
    })
  }

  // The active tab leads; after that, one row per domain.
  found.sort((a, b) => Number(b.active) - Number(a.active))
  const seen = new Set<string>()
  return found
    .filter((t) => (seen.has(t.domain) ? false : (seen.add(t.domain), true)))
    .slice(0, MAX_LOOSE_TABS)
}

/** Does this tab live on the domain we are filing (or a sub-domain of it)? */
function tabIsOnDomain(url: string | undefined, domain: string): boolean {
  const host = getHostname(url)
  if (!host || !domain) return false
  return host === domain || host.endsWith('.' + domain)
}

/**
 * File a site under a category because the user said so, and move its tabs
 * there immediately.
 *
 * This deliberately ignores minTabsPerGroup: the rule exists to stop the
 * *guesser* creating a group for one stray tab, and it has no business
 * overriding someone who just pointed at a site and named its group. A locked
 * group is still never touched, and nor is a tab currently inside one.
 */
export async function fileSite(
  domain: string,
  category: string,
  windowId?: number,
): Promise<FileSiteResult> {
  const winId = await resolveWindowId(windowId)
  const key = catalogKey(domain)
  const known = categoryByName(category)
  const title = known?.name ?? category
  const color: GroupColor = known?.color ?? 'grey'
  const planKey = 'cat:' + title

  if (key) await setSiteCategory(key, title)

  const settings = await getSettings()
  const tabs = await chrome.tabs.query({ windowId: winId })
  const { groups, byTitle } = await existingGroupsByTitle(winId)
  const groupTitleById = new Map(groups.map((g) => [g.id, g.title ?? '']))
  const lockedTitles = new Set(settings.lockedGroups.map((t) => t.toLowerCase()))
  const registry = await getGroupRegistry()

  let target = await resolveManagedGroup(registry[planKey], winId)
  if (!target) target = byTitle.get(title.toLowerCase()) ?? null

  // Refuse to feed a group the user has locked.
  if (target && lockedTitles.has((target.title ?? '').toLowerCase())) {
    return { moved: 0, group: title, state: await getWindowState(winId) }
  }

  const movable = tabs.filter((tab) => {
    if (typeof tab.id !== 'number' || tab.pinned) return false
    if (!isGroupableUrl(tab.url)) return false
    if (!tabIsOnDomain(tab.url, key)) return false
    // Never pull a tab out of a group the user locked.
    const current = groupTitleById.get(tab.groupId) ?? ''
    if (current && lockedTitles.has(current.toLowerCase())) return false
    return tab.groupId !== target?.id
  })

  if (movable.length === 0) {
    return { moved: 0, group: title, state: await getWindowState(winId) }
  }

  const snapshot = await takeSnapshot(winId, tabs)
  const tabIds = movable.map((t) => t.id as number)

  if (target) {
    await chrome.tabs.group({ groupId: target.id, tabIds })
    registry[planKey] = { groupId: target.id, title: target.title ?? title, windowId: winId }
  } else {
    const newGroupId = await chrome.tabs.group({
      createProperties: { windowId: winId },
      tabIds,
    })
    await chrome.tabGroups.update(newGroupId, { title, color })
    registry[planKey] = { groupId: newGroupId, title, windowId: winId }
  }

  await saveUndoSnapshot(snapshot)
  const liveIds = new Set((await chrome.tabGroups.query({})).map((g) => g.id))
  await saveGroupRegistry(pruneRegistry(registry, liveIds))

  return { moved: tabIds.length, group: title, state: await getWindowState(winId) }
}

/** Snapshot of a window for the popup to render. */
export async function getWindowState(windowId?: number): Promise<WindowState> {
  const winId = await resolveWindowId(windowId)
  const [tabs, groups, settings, undo, catalog] = await Promise.all([
    chrome.tabs.query({ windowId: winId }),
    chrome.tabGroups.query({ windowId: winId }),
    getSettings(),
    getUndoSnapshot(),
    getSiteCatalog(),
  ])

  const lockedTitles = new Set(settings.lockedGroups.map((t) => t.toLowerCase()))
  const counts = new Map<number, number>()
  for (const tab of tabs) {
    if (tab.groupId !== NO_GROUP) {
      counts.set(tab.groupId, (counts.get(tab.groupId) ?? 0) + 1)
    }
  }

  return {
    windowId: winId,
    tabCount: tabs.length,
    ungroupedCount: tabs.filter((t) => t.groupId === NO_GROUP && !t.pinned).length,
    canUndo: undo !== null && undo.windowId === winId,
    loose: collectLooseTabs(tabs, settings, catalog),
    groups: groups.map((g) => ({
      id: g.id,
      title: g.title ?? 'Untitled',
      color: g.color as GroupColor,
      collapsed: g.collapsed,
      tabCount: counts.get(g.id) ?? 0,
      locked: lockedTitles.has((g.title ?? '').toLowerCase()),
    })),
  }
}
