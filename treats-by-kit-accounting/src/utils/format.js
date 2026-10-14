import { fromCentavos, toCentavos } from './money'

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
})

const quantityFormat = new Intl.NumberFormat('en-PH', {
  maximumFractionDigits: 3,
})

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatCurrency(value) {
  const amount = Number(value)
  return peso.format(Number.isFinite(amount) ? amount : 0)
}

export function formatSignedMoney(value) {
  const cents = toCentavos(value)
  if (cents < 0) return `(${formatCurrency(fromCentavos(-cents))})`
  return formatCurrency(fromCentavos(cents))
}

export function formatQuantity(value) {
  const amount = Number(value)
  return quantityFormat.format(Number.isFinite(amount) ? amount : 0)
}

export function formatDate(value) {
  if (!value) return '—'
  const [year, month, day] = String(value).slice(0, 10).split('-')
  const monthIndex = Number(month) - 1
  if (!year || !day || monthIndex < 0 || monthIndex > 11) return '—'
  return `${MONTHS[monthIndex]} ${Number(day)}, ${year}`
}

export function todayISODate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function nowLocalISO() {
  return new Date().toISOString()
}

export function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function startOfWeekISO(isoDate) {
  const [year, month, day] = String(isoDate).slice(0, 10).split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const weekday = date.getDay()
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday
  date.setDate(date.getDate() + mondayOffset)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function startOfMonthISO(isoDate) {
  return `${String(isoDate).slice(0, 8)}01`
}
