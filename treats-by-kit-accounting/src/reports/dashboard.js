import { invoiceGrandTotal } from '../data/purchasing'
import { addDaysISO } from '../utils/aging'
import { fromCentavos, sum, toCentavos } from '../utils/money'
import { getSalesSummary } from '../utils/sales'
import { accountsOfType, netDebitCents } from './ledger'
import { shortDateLabel } from './periods'
import { cashAccounts, cashBalance, incomeStatement } from './statements'
import { ordersDueSoon, payableRows, receivableRows } from './signals'
import { lowStock } from './inventory'

function inRange(date, from, to) {
  const value = String(date || '')
  if (from && value < from) return false
  if (to && value > to) return false
  return true
}

export function dashboardModel(input) {
  const today = input.today
  const monthFrom = `${today.slice(0, 8)}01`
  const sales = getSalesSummary(input.sales, { from: today, to: today, payments: input.payments })
  const monthSales = getSalesSummary(input.sales, { from: monthFrom, to: today, payments: input.payments })
  const statement = incomeStatement({ accounts: input.accounts, entries: input.entries, from: monthFrom, to: today })
  const cashRows = cashAccounts(input.accounts).map((account) => ({
    id: account.id,
    name: account.name,
    balance: fromCentavos(netDebitCents(input.entries, account.id, { asOf: today })),
  }))
  const payables = payableRows({ ...input, asOf: today })
  const receivables = receivableRows({ ...input, asOf: today })
  const overduePayables = payables.filter((row) => row.days > 0)
  const overdueReceivables = receivables.filter((row) => row.days > 30)
  const dueOrders = ordersDueSoon(input.orders, today)
  const low = lowStock({ items: input.items, movements: input.movements, asOf: today })
  const checks = input.checks || []

  const trendStart = addDaysISO(today, -29)
  const trend = []
  for (let index = 0; index < 30; index += 1) {
    const date = addDaysISO(trendStart, index)
    const day = getSalesSummary(input.sales, { from: date, to: date, payments: input.payments })
    trend.push({ date, label: shortDateLabel(date), sales: day.totalSales, grossProfit: day.grossProfit })
  }

  const expenses = accountsOfType(input.accounts, 'expense')
    .map((account) => ({
      id: account.id,
      name: account.name,
      amount: fromCentavos(netDebitCents(input.entries, account.id, { from: monthFrom, to: today })),
    }))
    .filter((row) => toCentavos(row.amount) !== 0)
    .sort((a, b) => b.amount - a.amount)

  const activity = [
    ...(input.sales || []).filter((sale) => sale.status !== 'voided').map((sale) => ({
      id: `sale:${sale.id}`,
      date: sale.date,
      createdAt: sale.createdAt || sale.soldAt || '',
      title: sale.saleNumber,
      detail: 'Sale',
      href: '/sales/history',
      amount: sale.total,
    })),
    ...(input.invoices || []).map((invoice) => ({
      id: `invoice:${invoice.id}`,
      date: invoice.invoiceDate,
      createdAt: invoice.createdAt || '',
      title: invoice.invoiceNumber,
      detail: 'Purchase invoice',
      href: '/purchasing/invoices',
      amount: invoiceGrandTotal(invoice),
    })),
    ...(input.batches || []).filter((batch) => batch.status !== 'cancelled').map((batch) => ({
      id: `batch:${batch.id}`,
      date: batch.date,
      createdAt: batch.createdAt || '',
      title: batch.batchNumber,
      detail: 'Production batch',
      href: '/production/batches',
      amount: batch.totalCost,
    })),
    ...(input.expenses || []).filter((expense) => expense.status !== 'voided').map((expense) => ({
      id: `expense:${expense.id}`,
      date: expense.date,
      createdAt: expense.createdAt || '',
      title: expense.payee,
      detail: 'Expense',
      href: '/accounting/expenses',
      amount: expense.amount,
    })),
    ...(input.entries || []).filter((entry) => entry.sourceType === 'manual').map((entry) => ({
      id: `journal:${entry.id}`,
      date: entry.date,
      createdAt: entry.createdAt || '',
      title: entry.entryNumber,
      detail: entry.description || 'Manual journal entry',
      href: `/accounting/journal-entries?entry=${entry.id}`,
      amount: null,
    })),
  ]
    .filter((row) => inRange(row.date, '', today))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)) || b.id.localeCompare(a.id))
    .slice(0, 10)

  return {
    todaySales: sales.totalSales,
    todayCount: sales.saleCount,
    todayGrossProfit: sales.grossProfit,
    netIncome: statement.netIncome,
    cashTotal: cashBalance(input.accounts, input.entries, today),
    cashRows,
    receivables: sum(receivables.map((row) => row.balance)),
    payables: sum(payables.map((row) => row.balance)),
    lowStock: low,
    overduePayables,
    overdueReceivables,
    dueOrders,
    integrityPass: checks.every((check) => check.pass),
    topProducts: monthSales.topProducts.map((row) => ({
      ...row,
      name: (input.items || []).find((item) => item.id === row.itemId)?.name || 'Unknown item',
    })),
    expenses,
    trend,
    activity,
  }
}
