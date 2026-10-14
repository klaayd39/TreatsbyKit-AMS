import { addDaysISO, daysBetween } from '../utils/aging'
import { startOfMonthISO, startOfWeekISO } from '../utils/format'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const RANGE_PRESETS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'lastMonth', label: 'Last Month' },
  { id: 'year', label: 'This Year' },
  { id: 'custom', label: 'Custom' },
]

export function rangeForPreset(preset, today, customFrom = '', customTo = '') {
  if (preset === 'today') return { from: today, to: today }
  if (preset === 'week') return { from: startOfWeekISO(today), to: today }
  if (preset === 'month') return { from: startOfMonthISO(today), to: today }
  if (preset === 'lastMonth') {
    const end = addDaysISO(startOfMonthISO(today), -1)
    return { from: startOfMonthISO(end), to: end }
  }
  if (preset === 'year') return { from: `${String(today).slice(0, 4)}-01-01`, to: today }
  return { from: customFrom, to: customTo }
}

export function previousRange(from, to) {
  if (!from || !to || from > to) return { from: '', to: '' }
  const length = daysBetween(from, to) + 1
  const end = addDaysISO(from, -1)
  return { from: addDaysISO(end, -(length - 1)), to: end }
}

export function monthLabel(iso) {
  const [year, month] = String(iso).slice(0, 7).split('-')
  const name = MONTHS[Number(month) - 1]
  return name && year ? `${name} ${year}` : '—'
}

export function shortDateLabel(iso) {
  const [, month, day] = String(iso).slice(0, 10).split('-')
  if (!month || !day) return '—'
  return `${Number(month)}/${Number(day)}`
}

export function monthSpan(iso) {
  const start = startOfMonthISO(iso)
  const [year, month] = start.split('-').map(Number)
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`
  return { from: start, to: addDaysISO(next, -1), key: start.slice(0, 7) }
}

export function lastMonthRanges(endIso, count) {
  const ranges = []
  let cursor = endIso
  for (let index = 0; index < count; index += 1) {
    const span = monthSpan(cursor)
    ranges.unshift({ ...span, to: index === 0 && endIso < span.to ? endIso : span.to })
    cursor = addDaysISO(span.from, -1)
  }
  return ranges
}
