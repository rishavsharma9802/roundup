import { useCallback, useEffect, useState } from 'react'
import type { GroupRunResult, WindowState } from '../shared/types'
import {
  requestFileSite,
  requestGroupNow,
  requestUndo,
  requestWindowState,
} from '../shared/messaging'
import { getSettings, saveSettings } from '../shared/storage'
import SiteFixer, { FeedbackLink, LearnedSites } from './SiteFixer'
import './popup.css'

type Status =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'done'; result: GroupRunResult }
  | { kind: 'undone' }
  | { kind: 'filed'; domain: string; group: string; moved: number }
  | { kind: 'error'; message: string }

function summarize(result: GroupRunResult): string {
  const parts: string[] = []
  parts.push(`${result.tabsMoved} tab${result.tabsMoved === 1 ? '' : 's'} moved`)
  if (result.groupsCreated > 0) {
    parts.push(`${result.groupsCreated} new group${result.groupsCreated === 1 ? '' : 's'}`)
  }
  if (result.groupsReused > 0) parts.push(`${result.groupsReused} reused`)
  if (result.learned && result.learned.length > 0) {
    const n = result.learned.length
    parts.push(`${n} new site${n === 1 ? '' : 's'} learned`)
  }
  return parts.join(' · ')
}

interface Explanation {
  text: string
  /** Offered when the blocker is something the user can override right now. */
  action?: 'force' | 'options'
}

/**
 * Turn an empty result into something actionable.
 *
 * A run that moves nothing is usually correct behaviour, not a failure — but
 * "nothing happened" is indistinguishable from a broken button, so always say
 * which rule held the tabs back and what to do about it.
 */
function explainEmptyRun(result: GroupRunResult): Explanation {
  const s = result.skipped

  if (s.inExistingGroups > 0) {
    return {
      text:
        `${s.inExistingGroups} tab${s.inExistingGroups === 1 ? ' is' : 's are'} already in groups ` +
        `you (or another extension) named, so they were left alone.`,
      action: 'force',
    }
  }
  if (s.locked > 0 && s.locked === s.total) {
    return {
      text: `Every tab is in a locked group. Unlock one below to let it be regrouped.`,
    }
  }
  if (s.belowMinimum > 0) {
    return {
      text:
        `${s.belowMinimum} tab${s.belowMinimum === 1 ? '' : 's'} matched a group but there ` +
        `weren't enough of them to create it. Lower "minimum tabs per group" to 1 in settings.`,
      action: 'options',
    }
  }
  if (s.noMatch > 0) {
    return {
      text: `${s.noMatch} tab${s.noMatch === 1 ? '' : 's'} didn't match any rule or category.`,
      action: 'options',
    }
  }
  if (s.notGroupable > 0 && s.notGroupable === s.total) {
    return { text: `Only pinned or browser pages are open — Chrome can't group those.` }
  }
  return { text: 'Everything is already in the right group.' }
}

export default function Popup() {
  const [state, setState] = useState<WindowState | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  /** Group id currently being renamed inline, if any. */
  const [editing, setEditing] = useState<number | null>(null)
  /** Sites the last run filed on its own, offered back for correction. */
  const [learned, setLearned] = useState<{ domain: string; category: string }[]>([])

  const refresh = useCallback(async () => {
    try {
      setState(await requestWindowState())
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const onGroup = async (force = false) => {
    setStatus({ kind: 'working' })
    try {
      const result = await requestGroupNow(undefined, force)
      setStatus({ kind: 'done', result })
      setLearned(result.learned ?? [])
      await refresh()
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  const onUndo = async () => {
    setStatus({ kind: 'working' })
    try {
      const didUndo = await requestUndo()
      setStatus(didUndo ? { kind: 'undone' } : { kind: 'error', message: 'Nothing left to undo' })
      await refresh()
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  /**
   * File a site under a category on the user's say-so. The background moves the
   * tabs immediately, so the popup's job is just to reflect the outcome — and
   * to stop offering a correction the user has already made.
   */
  const onFile = async (domain: string, category: string) => {
    setStatus({ kind: 'working' })
    try {
      const result = await requestFileSite(domain, category)
      setLearned((prev) => prev.filter((s) => s.domain !== domain))
      setState(result.state)
      setStatus({ kind: 'filed', domain, group: result.group, moved: result.moved })
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  /** Toggle a group's collapsed state directly from the list. */
  const toggleCollapse = async (groupId: number, collapsed: boolean) => {
    await chrome.tabGroups.update(groupId, { collapsed: !collapsed })
    await refresh()
  }

  /**
   * Rename a group. Nothing else needs updating: grouping tracks its groups by
   * id, so whatever you call a group is what it stays called.
   */
  const commitRename = async (groupId: number, rawTitle: string) => {
    const title = rawTitle.trim()
    setEditing(null)
    const previous = state?.groups.find((g) => g.id === groupId)
    if (!previous || title === previous.title) return
    try {
      await chrome.tabGroups.update(groupId, { title })
      // A locked group is remembered by name, so carry the lock across a rename.
      if (previous.locked) {
        const settings = await getSettings()
        const lockedGroups = settings.lockedGroups
          .filter((t) => t.toLowerCase() !== previous.title.toLowerCase())
          .concat(title)
        await saveSettings({ ...settings, lockedGroups })
      }
      await refresh()
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  /** Lock/unlock is stored by group title, so it survives group ids changing. */
  const toggleLock = async (title: string, locked: boolean) => {
    const settings = await getSettings()
    const next = locked
      ? settings.lockedGroups.filter((t) => t.toLowerCase() !== title.toLowerCase())
      : [...settings.lockedGroups, title]
    await saveSettings({ ...settings, lockedGroups: next })
    await refresh()
  }

  const busy = status.kind === 'working'

  return (
    <div className="tg-popup">
      <header className="tg-head">
        <div className="tg-brand">
          <img src="/icons/icon32.png" alt="" width={20} height={20} />
          <span>Roundup</span>
        </div>
        <div className="tg-head-meta">
          {state && (
            <span className="tg-chip" title="Tabs in this window">
              {state.tabCount} tabs
            </span>
          )}
          <button
            className="tg-icon-btn"
            title="Rules and settings"
            onClick={() => chrome.runtime.openOptionsPage()}
          >
            <GearIcon />
          </button>
        </div>
      </header>

      <div className="tg-actions">
        <button className="tg-primary" onClick={() => void onGroup(false)} disabled={busy}>
          <StackIcon />
          {busy ? 'Grouping…' : 'Group Now'}
        </button>
        <button
          className="tg-secondary"
          onClick={onUndo}
          disabled={busy || !state?.canUndo}
          title={state?.canUndo ? 'Undo the last grouping' : 'Nothing to undo yet'}
        >
          <UndoIcon />
        </button>
      </div>

      {status.kind === 'done' && status.result.tabsMoved > 0 && (
        <p className="tg-status tg-status-good">{summarize(status.result)}</p>
      )}

      {/* A run that moved nothing needs a reason, not silence. */}
      {status.kind === 'done' && status.result.tabsMoved === 0 && (
        <NothingHappened result={status.result} onForce={() => void onGroup(true)} busy={busy} />
      )}

      {status.kind === 'filed' && (
        <p className={'tg-status' + (status.moved > 0 ? ' tg-status-good' : '')}>
          {status.moved > 0
            ? `${status.domain} filed under ${status.group} — ${status.moved} tab${status.moved === 1 ? '' : 's'} moved`
            : `${status.domain} filed under ${status.group}. Nothing to move right now.`}
        </p>
      )}

      {status.kind === 'undone' && <p className="tg-status">Last grouping undone</p>}
      {status.kind === 'error' && <p className="tg-status tg-status-error">{status.message}</p>}
      {status.kind === 'idle' && state && state.ungroupedCount > 0 && (
        <p className="tg-status">
          {state.ungroupedCount} ungrouped tab{state.ungroupedCount === 1 ? '' : 's'}
        </p>
      )}

      <LearnedSites learned={learned} busy={busy} onFile={(d, c) => void onFile(d, c)} />

      <SiteFixer loose={state?.loose ?? []} busy={busy} onFile={(d, c) => void onFile(d, c)} />

      <section className="tg-groups">
        <h2 className="tg-section-title">
          Groups in this window
          {state && <span className="tg-count">{state.groups.length}</span>}
        </h2>

        {state && state.groups.length === 0 && (
          <p className="tg-empty">
            No groups yet. Hit <strong>Group Now</strong> to sort this window, or set up your own
            rules in settings.
          </p>
        )}

        <ul className="tg-group-list">
          {state?.groups.map((group) =>
            editing === group.id ? (
              <li key={group.id} className="tg-group-row tg-group-editing">
                <span className="tg-dot" data-color={group.color} />
                <input
                  className="tg-rename-input"
                  autoFocus
                  defaultValue={group.title}
                  aria-label="Group name"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void commitRename(group.id, e.currentTarget.value)
                    if (e.key === 'Escape') setEditing(null)
                  }}
                  onBlur={(e) => void commitRename(group.id, e.currentTarget.value)}
                />
              </li>
            ) : (
              <li key={group.id} className="tg-group-row">
                <span className="tg-dot" data-color={group.color} />
                <button
                  className="tg-group-name"
                  title={group.collapsed ? 'Expand group' : 'Collapse group'}
                  onDoubleClick={() => setEditing(group.id)}
                  onClick={() => void toggleCollapse(group.id, group.collapsed)}
                >
                  {group.title || 'Untitled'}
                </button>
                <span className="tg-group-count">{group.tabCount}</span>
                <button
                  className="tg-icon-btn"
                  title="Rename this group"
                  aria-label="Rename group"
                  onClick={() => setEditing(group.id)}
                >
                  <PencilIcon />
                </button>
                <button
                  className={'tg-icon-btn' + (group.locked ? ' tg-locked' : '')}
                  title={
                    group.locked
                      ? 'Locked — Roundup will not touch this group'
                      : 'Lock this group so grouping leaves it alone'
                  }
                  onClick={() => void toggleLock(group.title, group.locked)}
                >
                  {group.locked ? <LockIcon /> : <UnlockIcon />}
                </button>
              </li>
            ),
          )}
        </ul>
      </section>

      <footer className="tg-foot">
        <button className="tg-link" onClick={() => chrome.runtime.openOptionsPage()}>
          Manage rules
        </button>
        <FeedbackLink />
        <span className="tg-kbd-hint">
          <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd>
        </span>
      </footer>
    </div>
  )
}

/**
 * Shown when a grouping run moved nothing. Explains the blocker and, where the
 * user can act on it, offers the one control that resolves it.
 */
function NothingHappened({
  result,
  onForce,
  busy,
}: {
  result: GroupRunResult
  onForce: () => void
  busy: boolean
}) {
  const { text, action } = explainEmptyRun(result)

  return (
    <div className="tg-notice">
      <div className="tg-notice-head">
        <InfoIcon />
        <strong>Nothing to move</strong>
      </div>
      <p>{text}</p>
      {action === 'force' && (
        <button className="tg-notice-btn" onClick={onForce} disabled={busy}>
          Regroup everything anyway
        </button>
      )}
      {action === 'options' && (
        <button className="tg-notice-btn" onClick={() => chrome.runtime.openOptionsPage()}>
          Open settings
        </button>
      )}
      {action === 'force' && (
        <p className="tg-notice-foot">Locked groups stay untouched. Undo is one click away.</p>
      )}
    </div>
  )
}

/* ---- inline icons (no icon font, keeps the bundle self-contained) -------- */

function InfoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 7.2v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="8" cy="4.9" r="0.9" fill="currentColor" />
    </svg>
  )
}

function StackIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="2.5" width="12" height="3" rx="1.5" fill="currentColor" />
      <rect x="2" y="6.75" width="9" height="3" rx="1.5" fill="currentColor" opacity="0.75" />
      <rect x="2" y="11" width="6" height="3" rx="1.5" fill="currentColor" opacity="0.5" />
    </svg>
  )
}

function UndoIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 8a5 5 0 1 1 1.6 3.7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="M3 4.5V8h3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="2.3" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 1.5v1.8M8 12.7v1.8M14.5 8h-1.8M3.3 8H1.5M12.6 3.4l-1.3 1.3M4.7 11.3l-1.3 1.3M12.6 12.6l-1.3-1.3M4.7 4.7L3.4 3.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M11.1 2.4a1.5 1.5 0 0 1 2.1 2.1l-7 7-2.8.7.7-2.8 7-7z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.75 7V5a2.25 2.25 0 0 1 4.5 0v2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function UnlockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.75 7V5a2.25 2.25 0 0 1 4.3-0.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
