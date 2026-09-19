/** Chrome tab-group colors, re-exported so UI code never touches the chrome namespace directly. */
export const GROUP_COLORS = [
  'grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange',
] as const

export type GroupColor = (typeof GROUP_COLORS)[number]

export type RuleType = 'regex' | 'glob' | 'domain'

/**
 * A user-defined grouping rule. Rules are evaluated in array order (first match
 * wins), so array index *is* the priority.
 */
export interface GroupRule {
  id: string
  /** Title given to the resulting tab group. */
  name: string
  type: RuleType
  /** Regex source / glob / domain, depending on `type`. Matched against the full URL. */
  pattern: string
  color: GroupColor
  enabled: boolean
}

/** What to do with tabs that no custom rule matched. */
export type FallbackMethod = 'category' | 'domain' | 'none'

export interface Settings {
  /** Schema version, for future migrations. */
  version: number
  rules: GroupRule[]
  fallback: FallbackMethod
  /** Groups smaller than this are not created (tabs stay ungrouped). */
  minTabsPerGroup: number
  /** Collapse groups right after creating them. */
  collapseNewGroups: boolean
  /** Never move a tab that is already in a group the user named themselves. */
  respectExistingGroups: boolean
  /** Group titles that Roundup must never touch. */
  lockedGroups: string[]
  /** Re-run grouping automatically whenever a tab finishes loading. Off by default. */
  autoGroupNewTabs: boolean
  /**
   * Let unknown sites be categorised from the shape of their hostname
   * (.shop -> Shopping, blog.* -> Learn, and so on) instead of falling straight
   * through to a one-site group.
   */
  useHeuristics: boolean
  /**
   * Remember every site the heuristics claimed in the site catalog, so the
   * verdict is stable and visible rather than re-guessed on every run.
   */
  autoLearnSites: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  rules: [],
  fallback: 'category',
  minTabsPerGroup: 2,
  collapseNewGroups: false,
  respectExistingGroups: true,
  lockedGroups: [],
  autoGroupNewTabs: false,
  useHeuristics: true,
  autoLearnSites: true,
}

/**
 * Where a group assignment came from — surfaced in the options-page tester.
 *
 *   rule      a custom rule the user wrote
 *   catalog   the learned site catalog (auto-learned or set by hand)
 *   category  a built-in category domain table
 *   heuristic the hostname's shape (TLD / label / site name)
 *   domain    nothing claimed it, so it was grouped by its own site
 */
export type MatchSource = 'rule' | 'catalog' | 'category' | 'heuristic' | 'domain'

export interface MatchResult {
  groupName: string
  color: GroupColor
  source: MatchSource
  /**
   * Stable identity for the group this match belongs to, independent of what
   * the group is currently *called*. This is what lets a user rename a group
   * and keep the rename: we follow the identity, not the title.
   *
   *   rule:r_a1b2c3   a specific user rule
   *   cat:Code        a built-in category (however it was reached)
   *   domain:acme.com the domain fallback
   */
  key: string
  /** Set when `source === 'rule'`. */
  ruleId?: string
  /** Human-readable explanation, shown in the live tester. */
  reason: string
}

/** One tab's group membership before a grouping run, used to undo it. */
export interface TabSnapshot {
  tabId: number
  groupId: number
  groupTitle: string | null
  groupColor: GroupColor | null
}

export interface UndoSnapshot {
  windowId: number
  takenAt: number
  tabs: TabSnapshot[]
}

/**
 * Why a tab was left alone during a grouping run. Tracked per-reason so the
 * popup can explain an empty result instead of just saying "nothing happened".
 */
export interface SkipBreakdown {
  total: number
  /** Already in a group the user named, and "respect existing groups" is on. */
  inExistingGroups: number
  /** In a group the user explicitly locked. */
  locked: number
  /** Matched a group, but too few tabs to justify creating it. */
  belowMinimum: number
  /** No rule and no fallback claimed it. */
  noMatch: number
  /** Pinned, or a browser-internal page Chrome will not group. */
  notGroupable: number
}

/** Result of a grouping run, reported back to the popup. */
export interface FileSiteResult {
  moved: number
  group: string
  state: WindowState
}

export interface GroupRunResult {
  groupsCreated: number
  groupsReused: number
  tabsMoved: number
  skipped: SkipBreakdown
  /** Sites this run added to the learned catalog. Absent when none were. */
  learned?: { domain: string; category: string }[]
}

/* ---- messaging ---------------------------------------------------------- */

export type Message =
  | {
      type: 'GROUP_NOW'
      windowId?: number
      /**
       * Ignore "respect existing groups" for this run only, so tabs sitting in
       * groups made by the user (or by another extension) get reorganised.
       * Locked groups are still never touched.
       */
      force?: boolean
    }
  | { type: 'UNDO_GROUPING'; windowId?: number }
  | { type: 'GET_WINDOW_STATE'; windowId?: number }
  | {
      /**
       * "This site belongs in that group." Files the domain in the site catalog
       * as a deliberate user choice and moves every tab on that domain into the
       * category's group straight away — the minimum-tabs rule does not apply
       * to a group the user asked for by name.
       */
      type: 'FILE_SITE'
      domain: string
      category: string
      windowId?: number
    }

/** A tab the popup can offer to file, with just enough to identify it. */
export interface LooseTab {
  id: number
  title: string
  url: string
  /** Registrable domain — what actually gets filed. */
  domain: string
  /** Where it would land right now, or null if nothing claims it. */
  wouldGroup: string | null
  /** True for the tab the user is looking at. */
  active: boolean
}

export interface WindowState {
  windowId: number
  tabCount: number
  ungroupedCount: number
  canUndo: boolean
  /**
   * The active tab plus any tabs sitting outside a group — the candidates for
   * "this is in the wrong place". Capped, because the popup is small.
   */
  loose: LooseTab[]
  groups: {
    id: number
    title: string
    color: GroupColor
    collapsed: boolean
    tabCount: number
    locked: boolean
  }[]
}
