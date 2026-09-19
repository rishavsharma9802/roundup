import { GROUP_COLORS, type GroupColor, type GroupRule, type RuleType } from '../shared/types'
import { validatePattern } from '../shared/rules'

const TYPE_HINTS: Record<RuleType, string> = {
  regex: 'Regular expression, tested against the whole URL. Example: ^https://acme\\.atlassian\\.net/wiki/',
  glob: 'Wildcard pattern for the whole URL. * matches any run of characters, ? matches one.',
  domain: 'A hostname. Matches that host and every subdomain of it. Example: atlassian.net',
}

const TYPE_PLACEHOLDER: Record<RuleType, string> = {
  regex: '^https://acme\\.atlassian\\.net/jira/',
  glob: 'https://*.atlassian.net/jira/*',
  domain: 'github.com',
}

interface Props {
  rule: GroupRule
  index: number
  total: number
  onChange: (rule: GroupRule) => void
  onDelete: () => void
  onMove: (direction: -1 | 1) => void
}

export default function RuleEditor({ rule, index, total, onChange, onDelete, onMove }: Props) {
  const validation = validatePattern(rule.type, rule.pattern)
  const patternInvalid = rule.pattern.trim().length > 0 && !validation.valid

  return (
    <li className={'tg-rule' + (rule.enabled ? '' : ' tg-rule-off')}>
      <div className="tg-rule-rank">
        <button
          className="tg-icon-btn tg-tiny"
          onClick={() => onMove(-1)}
          disabled={index === 0}
          title="Higher priority"
          aria-label="Move rule up"
        >
          &#9650;
        </button>
        <span className="tg-rank-num" title="Priority (lower runs first)">
          {index + 1}
        </span>
        <button
          className="tg-icon-btn tg-tiny"
          onClick={() => onMove(1)}
          disabled={index === total - 1}
          title="Lower priority"
          aria-label="Move rule down"
        >
          &#9660;
        </button>
      </div>

      <div className="tg-rule-body">
        <div className="tg-rule-line">
          <input
            className="tg-rule-name"
            value={rule.name}
            placeholder="Group name"
            aria-label="Group name"
            onChange={(e) => onChange({ ...rule, name: e.target.value })}
          />

          <select
            className="tg-rule-type"
            value={rule.type}
            aria-label="Match type"
            onChange={(e) => onChange({ ...rule, type: e.target.value as RuleType })}
          >
            <option value="regex">Regex</option>
            <option value="glob">Wildcard</option>
            <option value="domain">Domain</option>
          </select>

          <label className="tg-color-pick" title="Group colour">
            <span className="tg-dot" data-color={rule.color} />
            <select
              value={rule.color}
              aria-label="Group colour"
              onChange={(e) => onChange({ ...rule, color: e.target.value as GroupColor })}
            >
              {GROUP_COLORS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className="tg-switch" title={rule.enabled ? 'Rule is on' : 'Rule is off'}>
            <input
              type="checkbox"
              checked={rule.enabled}
              onChange={(e) => onChange({ ...rule, enabled: e.target.checked })}
            />
            <span />
          </label>

          <button
            className="tg-icon-btn tg-delete"
            onClick={onDelete}
            title="Delete rule"
            aria-label="Delete rule"
          >
            &#10005;
          </button>
        </div>

        <input
          className={'tg-rule-pattern tg-mono' + (patternInvalid ? ' tg-invalid' : '')}
          value={rule.pattern}
          placeholder={TYPE_PLACEHOLDER[rule.type]}
          aria-label="Pattern"
          spellCheck={false}
          onChange={(e) => onChange({ ...rule, pattern: e.target.value })}
        />

        <p className={'tg-rule-hint' + (patternInvalid ? ' tg-hint-error' : '')}>
          {patternInvalid ? validation.error : TYPE_HINTS[rule.type]}
        </p>
      </div>
    </li>
  )
}
