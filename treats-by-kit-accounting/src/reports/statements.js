import { addDaysISO } from '../utils/aging'
import { fromCentavos, sum, toCentavos } from '../utils/money'
import { formatPercent, marginPercent } from './format'
import { accountsOfType, CASH_CODES, entryDate, netDebitCents, PNL_TYPES } from './ledger'

function minus(left, right) {
  return fromCentavos(toCentavos(left) - toCentavos(right))
}

function statementAmount(account, cents) {
  if (account.type === 'revenue' || account.type === 'contra_revenue') return fromCentavos(-cents)
  return fromCentavos(cents)
}

function activity(entries, account, range) {
  return statementAmount(account, netDebitCents(entries, account.id, range))
}

function moneyLine(key, label, amount, compare, extra = {}) {
  return {
    key,
    label,
    amount,
    compare,
    depth: extra.depth || 0,
    strong: Boolean(extra.strong),
    accountId: extra.accountId || null,
    header: false,
    text: null,
    compareText: null,
  }
}

function textLine(key, label, text, compareText) {
  return {
    key,
    label,
    amount: null,
    compare: null,
    depth: 0,
    strong: false,
    accountId: null,
    header: false,
    text,
    compareText,
  }
}

function headerLine(key, label) {
  return { key, label, amount: null, compare: null, depth: 0, strong: true, accountId: null, header: true, text: null, compareText: null }
}

function accountLines(accounts, entries, range, compareRange, prefix = '') {
  return accounts.map((account) => moneyLine(
    account.id,
    `${prefix}${account.name}`,
    activity(entries, account, range),
    compareRange ? activity(entries, account, compareRange) : null,
    { depth: 1, accountId: account.id },
  ))
}

function totalLine(key, label, lines, depth = 0) {
  return moneyLine(
    key,
    label,
    sum(lines.map((line) => line.amount)),
    lines.some((line) => line.compare !== null) ? sum(lines.map((line) => line.compare)) : null,
    { depth, strong: true },
  )
}

export function netIncomeThrough(accounts, entries, asOf) {
  let cents = 0
  for (const account of accounts || []) {
    if (!PNL_TYPES.has(account.type)) continue
    cents -= netDebitCents(entries, account.id, { asOf })
  }
  return fromCentavos(cents)
}

export function incomeStatement({ accounts, entries, from, to, compareFrom, compareTo }) {
  const range = { from, to }
  const compareRange = compareFrom && compareTo ? { from: compareFrom, to: compareTo } : null
  const revenue = accountsOfType(accounts, 'revenue').filter((account) => account.code !== '4090')
  const otherIncome = accountsOfType(accounts, 'revenue').filter((account) => account.code === '4090')
  const discounts = accountsOfType(accounts, 'contra_revenue')
  const costs = accountsOfType(accounts, 'cogs')
  const applied = accountsOfType(accounts, 'contra_cogs')
  const expenses = accountsOfType(accounts, 'expense')

  const revenueLines = accountLines(revenue, entries, range, compareRange)
  const discountLines = accountLines(discounts, entries, range, compareRange, 'Less: ')
  const netSales = totalLine('net-sales', 'Net sales', [...revenueLines, ...discountLines])
  const otherLines = accountLines(otherIncome, entries, range, compareRange)
  const totalRevenue = totalLine('total-revenue', 'Total revenue', [netSales, ...otherLines])
  const costLines = [
    ...accountLines(costs, entries, range, compareRange),
    ...accountLines(applied, entries, range, compareRange, 'Less: '),
  ]
  const totalCost = totalLine('total-cost', 'Total cost of sales', costLines)
  const grossProfit = moneyLine('gross-profit', 'Gross profit', minus(totalRevenue.amount, totalCost.amount), compareRange ? minus(totalRevenue.compare, totalCost.compare) : null, { strong: true })
  const expenseLines = accountLines(expenses, entries, range, compareRange)
  const totalExpenses = totalLine('total-expenses', 'Total operating expenses', expenseLines)
  const netIncome = moneyLine('net-income', 'Net income', minus(grossProfit.amount, totalExpenses.amount), compareRange ? minus(grossProfit.compare, totalExpenses.compare) : null, { strong: true })
  const grossMargin = marginPercent(grossProfit.amount, totalRevenue.amount)
  const netMargin = marginPercent(netIncome.amount, totalRevenue.amount)
  const compareGross = compareRange ? marginPercent(grossProfit.compare, totalRevenue.compare) : null
  const compareNet = compareRange ? marginPercent(netIncome.compare, totalRevenue.compare) : null

  return {
    netSales: netSales.amount,
    totalRevenue: totalRevenue.amount,
    grossProfit: grossProfit.amount,
    grossMargin,
    totalExpenses: totalExpenses.amount,
    netIncome: netIncome.amount,
    netMargin,
    lines: [
      headerLine('revenue-head', 'Revenue'),
      ...revenueLines,
      ...discountLines,
      netSales,
      ...otherLines,
      totalRevenue,
      headerLine('cost-head', 'Cost of sales'),
      ...costLines,
      totalCost,
      grossProfit,
      textLine('gross-margin', 'Gross margin', formatPercent(grossMargin), compareRange ? formatPercent(compareGross) : null),
      headerLine('expense-head', 'Operating expenses'),
      ...expenseLines,
      totalExpenses,
      netIncome,
      textLine('net-margin', 'Net margin', formatPercent(netMargin), compareRange ? formatPercent(compareNet) : null),
    ],
  }
}

function positionAmount(account, entries, asOf) {
  const cents = netDebitCents(entries, account.id, { asOf })
  if (account.type === 'asset') return fromCentavos(cents)
  return fromCentavos(-cents)
}

function positionLines(accounts, entries, asOf, compareAsOf) {
  return accounts.map((account) => moneyLine(
    account.id,
    account.name,
    positionAmount(account, entries, asOf),
    compareAsOf ? positionAmount(account, entries, compareAsOf) : null,
    { depth: 1, accountId: account.id },
  ))
}

export function balanceSheet({ accounts, entries, asOf, compareAsOf }) {
  const assets = positionLines(accountsOfType(accounts, 'asset'), entries, asOf, compareAsOf)
  const liabilities = positionLines(accountsOfType(accounts, 'liability'), entries, asOf, compareAsOf)
  const equityAccounts = positionLines(accountsOfType(accounts, 'equity'), entries, asOf, compareAsOf)
  const income = moneyLine(
    'current-income',
    'Current period net income',
    netIncomeThrough(accounts, entries, asOf),
    compareAsOf ? netIncomeThrough(accounts, entries, compareAsOf) : null,
    { depth: 1 },
  )
  const equity = [...equityAccounts, income]
  const totalAssets = totalLine('total-assets', 'Total assets', assets)
  const totalLiabilities = totalLine('total-liabilities', 'Total liabilities', liabilities)
  const totalEquity = totalLine('total-equity', 'Total equity', equity)
  const right = sum([totalLiabilities.amount, totalEquity.amount])
  const compareRight = compareAsOf ? sum([totalLiabilities.compare, totalEquity.compare]) : null
  return {
    totalAssets: totalAssets.amount,
    totalLiabilities: totalLiabilities.amount,
    totalEquity: totalEquity.amount,
    netIncome: income.amount,
    balanced: toCentavos(totalAssets.amount) === toCentavos(right),
    difference: minus(totalAssets.amount, right),
    lines: [
      headerLine('assets-head', 'Assets'),
      ...assets,
      totalAssets,
      headerLine('liabilities-head', 'Liabilities'),
      ...liabilities,
      totalLiabilities,
      headerLine('equity-head', 'Equity'),
      ...equity,
      totalEquity,
      moneyLine('liabilities-equity', 'Total liabilities and equity', right, compareRight, { strong: true }),
    ],
  }
}

function classifyCash(entry, codeById) {
  const source = entry.sourceType
  if (source === 'customer_payment' || source === 'customer_deposit' || source === 'customer_refund') return 'customers'
  if (source === 'supplier_payment') return 'suppliers'
  if (source === 'expense' || source === 'expense_payment' || source === 'expense_reversal') return 'expenses'
  if (source === 'deposit_refund') return 'depositRefunds'
  const codes = (entry.lines || []).map((line) => codeById.get(line.accountId))
  if (codes.includes('3010')) return 'capital'
  if (codes.includes('3020')) return 'drawings'
  return 'other'
}

export function cashAccounts(accounts) {
  return CASH_CODES.map((code) => (accounts || []).find((account) => account.code === code)).filter(Boolean)
}

export function cashBalance(accounts, entries, asOf) {
  return sum(cashAccounts(accounts).map((account) => fromCentavos(netDebitCents(entries, account.id, { asOf }))))
}

export function cashFlow({ accounts, entries, from, to }) {
  const cash = cashAccounts(accounts)
  const cashIds = new Set(cash.map((account) => account.id))
  const codeById = new Map((accounts || []).map((account) => [account.id, account.code]))
  const groups = { customers: 0, suppliers: 0, expenses: 0, depositRefunds: 0, capital: 0, drawings: 0, other: 0 }
  let otherCount = 0
  for (const entry of entries || []) {
    const date = entryDate(entry)
    if (from && date < from) continue
    if (to && date > to) continue
    let cents = 0
    for (const line of entry.lines || []) {
      if (!cashIds.has(line.accountId)) continue
      cents += toCentavos(line.debit) - toCentavos(line.credit)
    }
    if (cents === 0) continue
    const bucket = classifyCash(entry, codeById)
    groups[bucket] += cents
    if (bucket === 'other') otherCount += 1
  }
  const signed = Object.fromEntries(Object.entries(groups).map(([key, cents]) => [key, fromCentavos(cents)]))
  const opening = from ? cashBalance(accounts, entries, addDaysISO(from, -1)) : 0
  const operatingLines = [
    moneyLine('customers', 'Cash from customers', signed.customers, null, { depth: 1 }),
    moneyLine('suppliers', 'Cash paid to suppliers', signed.suppliers, null, { depth: 1 }),
    moneyLine('expenses', 'Cash paid for expenses', signed.expenses, null, { depth: 1 }),
    moneyLine('deposit-refunds', 'Deposit refunds', signed.depositRefunds, null, { depth: 1 }),
    moneyLine('other', `Other operating (${otherCount} ${otherCount === 1 ? 'entry' : 'entries'})`, signed.other, null, { depth: 1 }),
  ]
  const financingLines = [
    moneyLine('capital', "Owner's capital contributions", signed.capital, null, { depth: 1 }),
    moneyLine('drawings', "Owner's drawings", signed.drawings, null, { depth: 1 }),
  ]
  const netOperating = totalLine('net-operating', 'Net cash from operating', operatingLines)
  const netFinancing = totalLine('net-financing', 'Net cash from financing', financingLines)
  const netChange = totalLine('net-change', 'Net change in cash', [netOperating, netFinancing])
  const closing = sum([opening, netChange.amount])
  const ledgerClosing = cashBalance(accounts, entries, to)
  return {
    opening,
    closing,
    ledgerClosing,
    otherCount,
    pass: toCentavos(closing) === toCentavos(ledgerClosing),
    difference: minus(closing, ledgerClosing),
    lines: [
      headerLine('operating-head', 'Operating'),
      ...operatingLines,
      netOperating,
      headerLine('financing-head', 'Financing'),
      ...financingLines,
      netFinancing,
      netChange,
      moneyLine('opening', 'Opening cash', opening, null, { strong: true }),
      moneyLine('closing', 'Closing cash', closing, null, { strong: true }),
    ],
  }
}
