export const AGING_BUCKETS = ['Current', '1-30', '31-60', '61-90', '90+']

export function daysBetween(fromDate, toDate) {
  if (!fromDate || !toDate) return 0
  const [fromYear, fromMonth, fromDay] = String(fromDate).slice(0, 10).split('-').map(Number)
  const [toYear, toMonth, toDay] = String(toDate).slice(0, 10).split('-').map(Number)
  if (!fromYear || !toYear) return 0
  const from = Date.UTC(fromYear, fromMonth - 1, fromDay)
  const to = Date.UTC(toYear, toMonth - 1, toDay)
  return Math.round((to - from) / 86400000)
}

export function addDaysISO(isoDate, days) {
  const [year, month, day] = String(isoDate).slice(0, 10).split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function getAgingBucket(dueOrInvoiceDate, asOf) {
  const days = daysBetween(dueOrInvoiceDate, asOf)
  if (days <= 0) return 'Current'
  if (days <= 30) return '1-30'
  if (days <= 60) return '31-60'
  if (days <= 90) return '61-90'
  return '90+'
}
