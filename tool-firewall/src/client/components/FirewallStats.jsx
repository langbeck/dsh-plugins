import { useSnapshot } from '../lib/hooks.js'
import { statsCardStyle, statsLabelStyle, statsRowStyle, statsValueStyle } from '../lib/styles.js'

/**
 * Sidebar stats card. The whole card is one button that opens the settings
 * dialog. `stats` accepts either raw string pairs `{ label, value }` or
 * localized keys `{ labelKey, valueKey }`.
 */
export default function FirewallStats(props) {
  const { wide = true, t, statsStore, open } = props
  const stats = useSnapshot(statsStore)
  if (!wide) {
    return (
      <button
        type="button"
        data-tool-firewall-pill=""
        aria-label={t('stats.aria')}
        title={t('stats.aria')}
        onClick={open}
        style={statsCardStyle(false)}
      >
        {t('stats.short')}
      </button>
    )
  }
  return (
    <button
      type="button"
      data-tool-firewall-pill=""
      aria-label={t('stats.aria')}
      title={t('stats.aria')}
      onClick={open}
      style={statsCardStyle(true)}
    >
      {stats.map((stat, index) => (
        <span key={String(stat.label ?? stat.labelKey ?? index)} style={statsRowStyle}>
          <span style={statsLabelStyle}>{typeof stat.label === 'string' ? stat.label : t(stat.labelKey)}</span>
          {(() => {
            const value = typeof stat.value === 'string' ? stat.value : t(stat.valueKey)
            const off = stat.tone === 'off'
              || stat.valueKey === 'stats.off'
              || stat.valueKey === 'stats.error'
              || value === t('stats.off')
              || value === t('stats.error')
            return <span style={statsValueStyle(off)}>{value}</span>
          })()}
        </span>
      ))}
    </button>
  )
}
