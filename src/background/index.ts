import type { Message } from '../shared/types'
import { getSettings } from '../shared/storage'
import { groupNow, undoGrouping, getWindowState, fileSite } from './grouper'

/**
 * Service worker entry point.
 *
 * MV3 workers are torn down after roughly 30 seconds of inactivity, so nothing
 * here may rely on module-level state surviving between events. Every handler
 * re-reads what it needs from storage or the tabs API.
 */

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage().catch(() => {
      /* opening options is a nicety, never fatal */
    })
  }
})

/** Popup and options page talk to the worker through these messages. */
chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  // Each branch returns true so Chrome keeps the message channel open for the
  // async reply.
  switch (message.type) {
    case 'GROUP_NOW':
      groupNow(message.windowId, message.force)
        .then((result) => sendResponse({ ok: true, result }))
        .catch((err: unknown) => {
          console.error('[Roundup] grouping failed', err)
          sendResponse({ ok: false, error: String(err) })
        })
      return true

    case 'UNDO_GROUPING':
      undoGrouping()
        .then((didUndo) => sendResponse({ ok: true, result: didUndo }))
        .catch((err: unknown) => {
          console.error('[Roundup] undo failed', err)
          sendResponse({ ok: false, error: String(err) })
        })
      return true

    case 'GET_WINDOW_STATE':
      getWindowState(message.windowId)
        .then((state) => sendResponse({ ok: true, result: state }))
        .catch((err: unknown) => {
          console.error('[Roundup] window state failed', err)
          sendResponse({ ok: false, error: String(err) })
        })
      return true

    case 'FILE_SITE':
      fileSite(message.domain, message.category, message.windowId)
        .then((result) => sendResponse({ ok: true, result }))
        .catch((err: unknown) => {
          console.error('[Roundup] filing a site failed', err)
          sendResponse({ ok: false, error: String(err) })
        })
      return true

    default:
      return false
  }
})

/** Keyboard shortcuts declared in the manifest. */
chrome.commands.onCommand.addListener((command) => {
  if (command === 'group-now') {
    void groupNow()
  } else if (command === 'undo-grouping') {
    void undoGrouping()
  }
})

/**
 * Optional auto-grouping. Off by default: the plan is that grouping happens
 * when the user asks for it, so this only fires if they opt in.
 *
 * Debounced through a short timer because a burst of tabs opening at once (a
 * restored session, a folder of bookmarks) would otherwise trigger one grouping
 * run per tab.
 */
let autoGroupTimer: ReturnType<typeof setTimeout> | undefined

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return

  void getSettings().then((settings) => {
    if (!settings.autoGroupNewTabs) return
    if (autoGroupTimer) clearTimeout(autoGroupTimer)
    autoGroupTimer = setTimeout(() => {
      void groupNow(tab.windowId)
    }, 1500)
  })
})
