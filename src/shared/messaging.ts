import type { FileSiteResult, GroupRunResult, Message, WindowState } from './types'

interface Envelope<T> {
  ok: boolean
  result?: T
  error?: string
}

/**
 * Typed wrapper around chrome.runtime.sendMessage.
 *
 * The service worker may be asleep when a surface first talks to it; Chrome
 * wakes it automatically, but a failed wake surfaces as a rejected promise, so
 * every caller gets a real Error rather than an undefined response.
 */
async function send<T>(message: Message): Promise<T> {
  const response = (await chrome.runtime.sendMessage(message)) as Envelope<T> | undefined
  if (!response) throw new Error('No response from the Roundup background worker')
  if (!response.ok) throw new Error(response.error ?? 'Unknown background error')
  return response.result as T
}

/**
 * Run a grouping pass. Pass `force` to reorganise tabs that are already in
 * groups the user (or another extension) named. Locked groups are still safe.
 */
export function requestGroupNow(windowId?: number, force = false): Promise<GroupRunResult> {
  return send<GroupRunResult>({ type: 'GROUP_NOW', windowId, force })
}

export function requestUndo(windowId?: number): Promise<boolean> {
  return send<boolean>({ type: 'UNDO_GROUPING', windowId })
}

export function requestWindowState(windowId?: number): Promise<WindowState> {
  return send<WindowState>({ type: 'GET_WINDOW_STATE', windowId })
}

/**
 * File a site under a category and move its tabs there now. Used by the popup's
 * "doesn't fit?" control, which is the fastest way to correct a bad guess.
 */
export function requestFileSite(
  domain: string,
  category: string,
  windowId?: number,
): Promise<FileSiteResult> {
  return send<FileSiteResult>({ type: 'FILE_SITE', domain, category, windowId })
}
