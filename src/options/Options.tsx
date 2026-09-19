import { useCallback, useEffect, useRef, useState } from 'react'
import type { FallbackMethod, GroupRule, Settings } from '../shared/types'
import { DEFAULT_SETTINGS } from '../shared/types'
import { getSettings, saveSettings } from '../shared/storage'
import { newRuleId } from '../shared/rules'
import RuleEditor from './RuleEditor'
import RuleTester from './RuleTester'
import SiteCatalogPanel from './SiteCatalogPanel'
import {
  LINKS,
  emailConfigured,
  feedbackMailto,
  linksConfigured,
  supportConfigured,
} from '../shared/links'
import './options.css'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

/**
 * Starter rules for the case that motivated regex support: Jira and Confluence
 * are both Atlassian products on one host, separated only by their path.
 */
function atlassianPreset(): GroupRule[] {
  return [
    {
      id: newRuleId(),
      name: 'Jira',
      type: 'regex',
      pattern: '^https://[^/]+\\.atlassian\\.net/(jira|browse|secure)/',
      color: 'blue',
      enabled: true,
    },
    {
      id: newRuleId(),
      name: 'Confluence',
      type: 'regex',
      pattern: '^https://[^/]+\\.atlassian\\.net/wiki/',
      color: 'green',
      enabled: true,
    },
  ]
}

export default function Options() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    void getSettings().then((s) => {
      setSettings(s)
      setLoaded(true)
    })
  }, [])

  /**
   * Debounced persist. Typing a regex character by character should not write
   * to sync storage on every keystroke — Chrome rate-limits sync writes.
   */
  const update = useCallback((next: Settings) => {
    setSettings(next)
    setSaveState('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveSettings(next)
        .then(() => {
          setSaveState('saved')
          setTimeout(() => setSaveState('idle'), 1600)
        })
        .catch(() => setSaveState('error'))
    }, 400)
  }, [])

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  const addRule = () => {
    const rule: GroupRule = {
      id: newRuleId(),
      name: '',
      type: 'regex',
      pattern: '',
      color: 'blue',
      enabled: true,
    }
    update({ ...settings, rules: [...settings.rules, rule] })
  }

  const addPreset = () => {
    const existing = new Set(settings.rules.map((r) => r.name.toLowerCase()))
    const additions = atlassianPreset().filter((r) => !existing.has(r.name.toLowerCase()))
    if (additions.length === 0) return
    update({ ...settings, rules: [...additions, ...settings.rules] })
  }

  const changeRule = (index: number, rule: GroupRule) => {
    const rules = settings.rules.slice()
    rules[index] = rule
    update({ ...settings, rules })
  }

  const deleteRule = (index: number) => {
    update({ ...settings, rules: settings.rules.filter((_, i) => i !== index) })
  }

  const moveRule = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= settings.rules.length) return
    const rules = settings.rules.slice()
    const [moved] = rules.splice(index, 1)
    rules.splice(target, 0, moved)
    update({ ...settings, rules })
  }

  if (!loaded) return <div className="tg-loading">Loading…</div>

  return (
    <div className="tg-options">
      <header className="tg-opt-head">
        <div className="tg-brand tg-brand-lg">
          <img src="/icons/icon48.png" alt="" width={28} height={28} />
          <div>
            <h1>Roundup</h1>
            <p>Every tab in its place. Your rules decide which one.</p>
          </div>
        </div>
        <span className={'tg-save tg-save-' + saveState}>
          {saveState === 'saving' && 'Saving…'}
          {saveState === 'saved' && 'Saved'}
          {saveState === 'error' && 'Could not save'}
        </span>
      </header>

      <section className="tg-card">
        <div className="tg-card-head">
          <div>
            <h2 className="tg-card-title">Custom rules</h2>
            <p className="tg-card-sub">
              Checked from top to bottom — the first rule that matches wins, and it always beats the
              built-in categories. Patterns are tested against the full URL, so two products sharing
              one host can still be split apart.
            </p>
          </div>
          <div className="tg-card-actions">
            <button className="tg-btn tg-btn-ghost" onClick={addPreset}>
              Add Jira / Confluence preset
            </button>
            <button className="tg-btn tg-btn-solid" onClick={addRule}>
              New rule
            </button>
          </div>
        </div>

        {settings.rules.length === 0 ? (
          <p className="tg-empty">
            No custom rules yet. Everything falls through to the built-in categories below. Add a
            rule when you want a group named and matched on your own terms.
          </p>
        ) : (
          <ul className="tg-rule-list">
            {settings.rules.map((rule, i) => (
              <RuleEditor
                key={rule.id}
                rule={rule}
                index={i}
                total={settings.rules.length}
                onChange={(r) => changeRule(i, r)}
                onDelete={() => deleteRule(i)}
                onMove={(d) => moveRule(i, d)}
              />
            ))}
          </ul>
        )}
      </section>

      <RuleTester settings={settings} />

      <SiteCatalogPanel />

      <section className="tg-card">
        <h2 className="tg-card-title">Everything else</h2>
        <p className="tg-card-sub">What happens to tabs no custom rule claimed.</p>

        <div className="tg-field">
          <label htmlFor="fallback">Unmatched tabs</label>
          <select
            id="fallback"
            value={settings.fallback}
            onChange={(e) => update({ ...settings, fallback: e.target.value as FallbackMethod })}
          >
            <option value="category">Group by built-in category</option>
            <option value="domain">Group by domain</option>
            <option value="none">Leave them ungrouped</option>
          </select>
          <p className="tg-field-hint">
            Categories cover common sites (Code, Docs, Work, Cloud, AI, Learn, News, Media,
            Shopping, Finance, Travel…). Anything unrecognised still clusters by its site rather
            than being dumped together.
          </p>
        </div>

        <label className="tg-check">
          <input
            type="checkbox"
            checked={settings.useHeuristics}
            onChange={(e) => update({ ...settings, useHeuristics: e.target.checked })}
          />
          <span>
            <strong>Guess a category for sites I have never opened</strong>
            <em>
              Reads the address itself: a <code>.shop</code> or <code>.store</code> site is
              Shopping, <code>blog.</code>/<code>.blog</code> and tutorial addresses are Learn,
              <code> .tv</code> and watch/stream addresses are Media. Only ever used when nothing
              else matched.
            </em>
          </span>
        </label>

        <label className="tg-check">
          <input
            type="checkbox"
            checked={settings.autoLearnSites}
            disabled={!settings.useHeuristics}
            onChange={(e) => update({ ...settings, autoLearnSites: e.target.checked })}
          />
          <span>
            <strong>Write those guesses into the site catalog</strong>
            <em>
              A guessed site is recorded above, so it stays put on later runs and you can correct
              it once instead of every time.
            </em>
          </span>
        </label>

        <div className="tg-field">
          <label htmlFor="minTabs">Minimum tabs per group</label>
          <input
            id="minTabs"
            type="number"
            min={1}
            max={20}
            value={settings.minTabsPerGroup}
            onChange={(e) =>
              update({
                ...settings,
                minTabsPerGroup: Math.max(1, Math.min(20, Number(e.target.value) || 1)),
              })
            }
          />
          <p className="tg-field-hint">
            Stops a single stray tab from becoming its own group. Existing groups are always topped
            up regardless.
          </p>
        </div>

        <label className="tg-check">
          <input
            type="checkbox"
            checked={settings.respectExistingGroups}
            onChange={(e) => update({ ...settings, respectExistingGroups: e.target.checked })}
          />
          <span>
            <strong>Leave groups I made myself alone</strong>
            <em>
              Tabs already sitting in a group you named are never moved. Turn this off to let
              grouping reorganise everything.
            </em>
          </span>
        </label>

        <label className="tg-check">
          <input
            type="checkbox"
            checked={settings.collapseNewGroups}
            onChange={(e) => update({ ...settings, collapseNewGroups: e.target.checked })}
          />
          <span>
            <strong>Collapse new groups</strong>
            <em>Newly created groups start collapsed, so the tab strip stays short.</em>
          </span>
        </label>

        <label className="tg-check">
          <input
            type="checkbox"
            checked={settings.autoGroupNewTabs}
            onChange={(e) => update({ ...settings, autoGroupNewTabs: e.target.checked })}
          />
          <span>
            <strong>Group automatically as tabs load</strong>
            <em>
              Off by default — grouping normally runs only when you click Group Now or press
              Alt+Shift+G.
            </em>
          </span>
        </label>
      </section>

      <footer className="tg-opt-foot">
        <span>
          No server, no account, no analytics. Your rules and your site catalog live in your own
          browser — settings ride Chrome&rsquo;s built-in sync to your other profiles, and nothing is
          ever sent to us.
        </span>
        <span className="tg-foot-links">
          {linksConfigured() && (
            <a href={LINKS.repo + '/issues'} target="_blank" rel="noopener">
              Report a problem
            </a>
          )}
          {emailConfigured() && <a href={feedbackMailto()}>Email me</a>}
          {supportConfigured() && (
            <a className="tg-support" href={LINKS.support} target="_blank" rel="noopener">
              {LINKS.supportLabel}
            </a>
          )}
        </span>
      </footer>
    </div>
  )
}
