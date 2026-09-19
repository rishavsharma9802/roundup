import { DEFAULT_SETTINGS, type Settings, type UndoSnapshot } from './types'
import { clearPatternCache } from './rules'

const SETTINGS_KEY = 'settings'
const UNDO_KEY = 'undo'

/**
 * Settings live in storage.sync so rules follow the user across their Chrome
 * profiles. sync has a hard 8 KB per-item limit; if a user builds a rule set
 * large enough to blow that, we transparently fall back to local storage rather
 * than losing the save.
 */
export async function getSettings(): Promise<Settings> {
  const [sync, local] = await Promise.all([
    chrome.storage.sync.get(SETTINGS_KEY).catch(() => ({}) as Record<string, unknown>),
    chrome.storage.local.get(SETTINGS_KEY).catch(() => ({}) as Record<string, unknown>),
  ])
  const stored = (sync as Record<string, unknown>)[SETTINGS_KEY] ?? (local as Record<string, unknown>)[SETTINGS_KEY]
  if (!stored) return { ...DEFAULT_SETTINGS }
  // Merge so settings added in later versions get their defaults.
  return { ...DEFAULT_SETTINGS, ...(stored as Partial<Settings>) }
}

export async function saveSettings(settings: Settings): Promise<void> {
  clearPatternCache()
  try {
    await chrome.storage.sync.set({ [SETTINGS_KEY]: settings })
    // Keep a local mirror so a later sync failure cannot strand the user.
    await chrome.storage.local.set({ [SETTINGS_KEY]: settings })
  } catch {
    await chrome.storage.local.set({ [SETTINGS_KEY]: settings })
  }
}

/**
 * The undo snapshot is deliberately session-scoped: undoing a grouping run from
 * a previous browser session would target tab ids that no longer exist.
 */
export async function saveUndoSnapshot(snapshot: UndoSnapshot): Promise<void> {
  await chrome.storage.session.set({ [UNDO_KEY]: snapshot })
}

export async function getUndoSnapshot(): Promise<UndoSnapshot | null> {
  const stored = await chrome.storage.session.get(UNDO_KEY)
  return (stored[UNDO_KEY] as UndoSnapshot | undefined) ?? null
}

export async function clearUndoSnapshot(): Promise<void> {
  await chrome.storage.session.remove(UNDO_KEY)
}

/** Subscribe to settings changes from any extension surface. */
export function onSettingsChanged(cb: (settings: Settings) => void): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if ((area === 'sync' || area === 'local') && changes[SETTINGS_KEY]) {
      clearPatternCache()
      const next = changes[SETTINGS_KEY].newValue as Partial<Settings> | undefined
      if (next) cb({ ...DEFAULT_SETTINGS, ...next })
    }
  }
  chrome.storage.onChanged.addListener(listener)
  return () => chrome.storage.onChanged.removeListener(listener)
}
