import { addDaysISO, AGING_BUCKETS } from '../utils/aging'
import { fromCentavos, sum, toCentavos } from '../utils/money'
import { getSalesSummary } from '../utils/sales'
import { marginPercent } from './format'
import { accountsOfType, cashTurns, netDebitCents } from './ledger'
import { lastMonthRanges, monthLabel, monthSpan } from './periods'
import { payableRows, receivableRows } from './signals'
import { cashAccounts, incomeStatement } from './statements'

export function expenseBreakdown({ accounts, entries, from, to }) {
  const rows = accountsOfType(accounts, 'expense')
    .map((account) => ({
      id: account.id,
      code: account.code,
      name: account.name,
      amount: fromCentavos(netDebitCents(entries, account.id, { from, to })),
    }))
    .filter((row) => toCentavos(row.amount) !== 0)
    .sort((a, b) => b.amount - a.amount || a.code.localeCompare(b.code))

  const months = []
  if (from && to && from <= to) {
    let cursor = from
    while (cursor <= to && months.length < 36) {
      const span = monthSpan(cursor)
      const monthFrom = span.from < from ? from : span.from
      const monthTo = span.to > to ? to : span.to
      months.push({
        id: span.key,
        label: monthLabel(span.from),
        amount: sum(accountsOfType(accounts, 'expense').map((account) => fromCentavos(netDebitCents(entries, account.id, { from: monthFrom, to: monthTo })))),
      })
      const next = addDaysISO(span.to, 1)
      if (next <= cursor) break
      cursor = next
    }
  }

  return { rows, total: sum(rows.map((row) => row.amount)), months }
}

export function profitability({ sales, payments, items, from, to }) {
  const summary = getSalesSummary(sales, { from, to, payments })
  return summary.byProduct.map((row) => ({
    id: row.itemId,
    name: (items || []).find((item) => item.id === row.itemId)?.name || 'Unknown item',
    units: row.units,
    revenue: row.revenue,
    cogs: row.cogs,
    grossProfit: row.grossProfit,
    margin: marginPercent(row.grossProfit, row.revenue),
  }))
}

function bucketTable(rows) {
  const table = AGING_BUCKETS.map((bucket) => {
    const matching = rows.filter((row) => row.bucket === bucket)
    return { id: bucket, bucket, count: matching.length, total: sum(matching.map((row) => row.balance)) }
  })
  return { rows: table, total: sum(table.map((row) => row.total)), count: table.reduce((count, row) => count + row.count, 0) }
}

export function receivablesAging(input) {
  return bucketTable(receivableRows(input))
}

export function payablesAging(input) {
  return bucketTable(payableRows(input))
}

export function cashPosition({ accounts, entries, from, to }) {
  const openingAsOf = from ? addDaysISO(from, -1) : ''
  const rows = cashAccounts(accounts).map((account) => {
    const opening = openingAsOf ? fromCentavos(netDebitCents(entries, account.id, { asOf: openingAsOf })) : 0
    const turns = cashTurns(entries, account.id, from, to)
    const closing = fromCentavos(toCentavos(opening) + toCentavos(turns.inflows) - toCentavos(turns.outflows))
    return { id: account.id, code: account.code, name: account.name, opening, inflows: turns.inflows, outflows: turns.outflows, closing }
  })
  return {
    rows,
    opening: sum(rows.map((row) => row.opening)),
    inflows: sum(rows.map((row) => row.inflows)),
    outflows: sum(rows.map((row) => row.outflows)),
    closing: sum(rows.map((row) => row.closing)),
  }
}

export function monthlySummary({ accounts, entries, end }) {
  return lastMonthRanges(end, 12).map((range) => {
    const statement = incomeStatement({ accounts, entries, from: range.from, to: range.to })
    return {
      id: range.key,
      label: range.key,
      from: range.from,
      to: range.to,
      netSales: statement.netSales,
      grossProfit: statement.grossProfit,
      expenses: statement.totalExpenses,
      netIncome: statement.netIncome,
    }
  })
}
