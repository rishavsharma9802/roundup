/**
 * Group identity registry.
 *
 * Roundup used to find "its" groups by title, which quietly punished anyone
 * who renamed one: rename "Code" to "Client work" and the next run could no
 * longer find it, so it built a fresh "Code" and dragged the tabs back out.
 *
 * Instead we remember, per rule/category, which actual Chrome group we created
 * for it. Chrome group ids survive for as long as the group does, so following
 * the id means the title is yours to change. The stored title is only a
 * fallback used when the id has gone stale (browser restart, group closed).
 */

export interface RegistryEntry {
  groupId: number
  /** The title as we last observed it — i.e. whatever the user renamed it to. */
  title: string
  windowId: number
}

/** Canonical key (see MatchResult.key) -> the group we manage for it. */
export type GroupRegistry = Record<string, RegistryEntry>

const KEY = 'groupRegistry'

/**
 * Kept in local storage rather than sync: group ids are meaningless on another
 * machine, so syncing them would actively cause mismatches.
 */
export async function getGroupRegistry(): Promise<GroupRegistry> {
  try {
    const stored = await chrome.storage.local.get(KEY)
    return (stored[KEY] as GroupRegistry | undefined) ?? {}
  } catch {
    return {}
  }
}

export async function saveGroupRegistry(registry: GroupRegistry): Promise<void> {
  try {
    await chrome.storage.local.set({ [KEY]: registry })
  } catch {
    /* a failed write only costs us rename-stickiness, never correctness */
  }
}

/**
 * Drop entries whose group no longer exists, so the registry cannot grow
 * without bound as groups come and go.
 */
export function pruneRegistry(registry: GroupRegistry, liveGroupIds: Set<number>): GroupRegistry {
  const next: GroupRegistry = {}
  for (const [key, entry] of Object.entries(registry)) {
    if (liveGroupIds.has(entry.groupId)) next[key] = entry
  }
  return next
}
