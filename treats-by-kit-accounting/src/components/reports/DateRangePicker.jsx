import Button from '../ui/Button'
import { controlClass } from '../ui/Field'
import { RANGE_PRESETS, rangeForPreset } from '../../reports/periods'
import { formatDate } from '../../utils/format'

export default function DateRangePicker({ preset, from, to, today, onChange }) {
  function select(id) {
    if (id === 'custom') {
      const fallback = rangeForPreset('month', today)
      onChange({ preset: 'custom', from: from || fallback.from, to: to || today })
      return
    }
    const range = rangeForPreset(id, today)
    onChange({ preset: id, from: range.from, to: range.to })
  }

  return (
    <div className="no-print mb-4 space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {RANGE_PRESETS.map((entry) => (
          <Button key={entry.id} variant={preset === entry.id ? 'primary' : 'secondary'} onClick={() => select(entry.id)}>
            {entry.label}
          </Button>
        ))}
      </div>
      {preset === 'custom' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <input type="date" className={controlClass} value={from} aria-label="From" onChange={(event) => onChange({ preset, from: event.target.value, to })} />
          <input type="date" className={controlClass} value={to} aria-label="To" onChange={(event) => onChange({ preset, from, to: event.target.value })} />
        </div>
      ) : (
        <p className="text-sm text-muted">{formatDate(from)} – {formatDate(to)}</p>
      )}
    </div>
  )
}
