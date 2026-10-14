import { toCentavos } from '../utils/money'

export function formatPercent(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—'
  const number = Number(value)
  const body = `${Math.abs(number).toFixed(1)}%`
  return number < 0 ? `(${body})` : body
}

export function percentChange(current, previous) {
  const previousCents = toCentavos(previous)
  if (previousCents === 0) return null
  return ((toCentavos(current) - previousCents) / Math.abs(previousCents)) * 100
}

export function marginPercent(part, whole) {
  const base = toCentavos(whole)
  if (base === 0) return null
  return (toCentavos(part) / base) * 100
}
