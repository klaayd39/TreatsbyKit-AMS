import { useState } from 'react'
import { rangeForPreset } from '../reports/periods'
import { todayISODate } from '../utils/format'

export function useReportRange(defaultPreset = 'month') {
  const [state, setState] = useState(() => {
    const today = todayISODate()
    const range = rangeForPreset(defaultPreset, today)
    return { today, preset: defaultPreset, from: range.from, to: range.to }
  })

  function onChange(next) {
    setState((current) => ({ ...current, ...next }))
  }

  return { ...state, onChange }
}
