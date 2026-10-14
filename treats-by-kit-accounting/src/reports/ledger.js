import { fromCentavos, toCentavos } from '../utils/money'

export const PNL_TYPES = new Set(['revenue', 'contra_revenue', 'cogs', 'contra_cogs', 'expense'])
export const CASH_CODES = ['1010', '1020', '1030']

export function entryDate(entry) {
  return String(entry.date || '')
}

function dated(entries, range = {}) {
  return (entries || []).filter((entry) => {
    const date = entryDate(entry)
    if (range.asOf && date > range.asOf) return false
    if (range.from && date < range.from) return false
    if (range.to && date > range.to) return false
    return true
  })
}

export function netDebitCents(entries, accountId, range) {
  let cents = 0
  for (const entry of dated(entries, range)) {
    for (const line of entry.lines || []) {
      if (line.accountId !== accountId) continue
      cents += toCentavos(line.debit) - toCentavos(line.credit)
    }
  }
  return cents
}

export function netDebit(entries, accountId, range) {
  return fromCentavos(netDebitCents(entries, accountId, range))
}

export function cashTurns(entries, accountId, from, to) {
  let debit = 0
  let credit = 0
  for (const entry of dated(entries, { from, to })) {
    for (const line of entry.lines || []) {
      if (line.accountId !== accountId) continue
      debit += toCentavos(line.debit)
      credit += toCentavos(line.credit)
    }
  }
  return { inflows: fromCentavos(debit), outflows: fromCentavos(credit) }
}

export function byCode(accounts) {
  return [...(accounts || [])].sort((a, b) => String(a.code).localeCompare(String(b.code)))
}

export function accountsOfType(accounts, type) {
  return byCode(accounts).filter((account) => account.type === type)
}
