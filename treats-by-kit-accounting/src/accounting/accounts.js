import { invoiceAmountPaid, receivedValue } from '../data/purchasing'
import { COLLECTIONS } from '../data/seed'
import { getAll } from '../data/storage'
import { fromCentavos, sum, toCentavos } from '../utils/money'

function entryDate(entry) {
  return String(entry.date || '')
}

function sortedEntries(entries) {
  return [...entries].sort(
    (a, b) => entryDate(a).localeCompare(entryDate(b)) || String(a.entryNumber).localeCompare(String(b.entryNumber)) || String(a.id).localeCompare(String(b.id)),
  )
}

export function getAccountBalance(accountId, asOf) {
  let debit = 0
  let credit = 0
  for (const entry of getAll(COLLECTIONS.JOURNAL_ENTRIES)) {
    if (asOf && entryDate(entry) > asOf) continue
    for (const line of entry.lines || []) {
      if (line.accountId !== accountId) continue
      debit += toCentavos(line.debit)
      credit += toCentavos(line.credit)
    }
  }
  return { debit: fromCentavos(debit), credit: fromCentavos(credit), netDebit: fromCentavos(debit - credit) }
}

export function getTrialBalance(asOf) {
  const accounts = getAll(COLLECTIONS.ACCOUNTS).sort((a, b) => a.code.localeCompare(b.code))
  const rows = accounts.map((account) => {
    const balance = getAccountBalance(account.id, asOf)
    const net = toCentavos(balance.netDebit)
    return {
      ...account,
      debitTotal: balance.debit,
      creditTotal: balance.credit,
      endingDebit: net > 0 ? fromCentavos(net) : 0,
      endingCredit: net < 0 ? fromCentavos(-net) : 0,
    }
  })
  const debit = sum(rows.map((row) => row.endingDebit))
  const credit = sum(rows.map((row) => row.endingCredit))
  return { rows, debit, credit, balanced: toCentavos(debit) === toCentavos(credit) }
}

export function getLedger(accountId, range = {}) {
  const account = getAll(COLLECTIONS.ACCOUNTS).find((entry) => entry.id === accountId) ?? null
  const entries = sortedEntries(getAll(COLLECTIONS.JOURNAL_ENTRIES))
  let running = 0
  const lines = []
  for (const entry of entries) {
    const dated = entryDate(entry)
    if (range.to && dated > range.to) continue
    for (const line of entry.lines || []) {
      if (line.accountId !== accountId) continue
      const debit = toCentavos(line.debit)
      const credit = toCentavos(line.credit)
      const beforeRange = range.from && dated < range.from
      running += debit - credit
      if (beforeRange) continue
      lines.push({
        id: line.id,
        entryId: entry.id,
        entryNumber: entry.entryNumber,
        date: entry.date,
        description: entry.description,
        memo: line.memo,
        debit: fromCentavos(debit),
        credit: fromCentavos(credit),
        balance: fromCentavos(running),
      })
    }
  }
  const opening = lines.length ? toCentavos(lines[0].balance) - toCentavos(lines[0].debit) + toCentavos(lines[0].credit) : running
  const closing = lines.length ? toCentavos(lines[lines.length - 1].balance) : running
  return {
    account,
    opening: fromCentavos(opening),
    closing: fromCentavos(closing),
    lines,
  }
}

function movementValueCents(category) {
  const ids = new Set(getAll(COLLECTIONS.ITEMS).filter((item) => item.category === category).map((item) => item.id))
  let cents = 0
  for (const movement of getAll(COLLECTIONS.STOCK_MOVEMENTS)) {
    if (!ids.has(movement.itemId)) continue
    const unit = Number(movement.unitCost) || 0
    cents += toCentavos((Number(movement.quantityIn) || 0) * unit)
    cents -= toCentavos((Number(movement.quantityOut) || 0) * unit)
  }
  return cents
}

function recentEntries(accountIds, limit = 5) {
  const ids = new Set(accountIds.filter(Boolean))
  return sortedEntries(getAll(COLLECTIONS.JOURNAL_ENTRIES))
    .filter((entry) => (entry.lines || []).some((line) => ids.has(line.accountId)))
    .slice(-limit)
    .reverse()
    .map((entry) => ({ id: entry.id, entryNumber: entry.entryNumber, date: entry.date, description: entry.description }))
}

function accountId(code) {
  return getAll(COLLECTIONS.ACCOUNTS).find((account) => account.code === code)?.id || null
}

export function getIntegrityReport() {
  const trial = getTrialBalance()
  const checks = []

  checks.push({
    id: 'trial-balance',
    label: 'Trial balance debits equal credits',
    pass: trial.balanced,
    difference: fromCentavos(toCentavos(trial.debit) - toCentavos(trial.credit)),
    detail: `Debits ${fromCentavos(toCentavos(trial.debit)).toFixed(2)} and credits ${fromCentavos(toCentavos(trial.credit)).toFixed(2)}.`,
    entries: trial.balanced ? [] : recentEntries(getAll(COLLECTIONS.ACCOUNTS).map((account) => account.id)),
  })

  const inventoryCodes = [
    ['1200', 'raw_material', 'Raw materials'],
    ['1210', 'packaging', 'Packaging'],
    ['1220', 'finished_good', 'Finished goods'],
  ]
  const inventoryGaps = []
  const inventoryIds = []
  for (const [code, category, label] of inventoryCodes) {
    const id = accountId(code)
    inventoryIds.push(id)
    const ledger = id ? toCentavos(getAccountBalance(id).netDebit) : 0
    const stock = movementValueCents(category)
    if (ledger !== stock) inventoryGaps.push(`${label} differs by ${fromCentavos(ledger - stock).toFixed(2)}`)
  }
  checks.push({
    id: 'inventory',
    label: 'Inventory accounts equal the stock ledger',
    pass: inventoryGaps.length === 0,
    difference: inventoryGaps.length,
    detail: inventoryGaps.length ? inventoryGaps.join('. ') + '.' : 'Raw materials, packaging, and finished goods match stock movement value.',
    entries: inventoryGaps.length ? recentEntries(inventoryIds) : [],
  })

  let expectedAr = 0
  const payments = getAll(COLLECTIONS.PAYMENTS)
  for (const sale of getAll(COLLECTIONS.SALES)) {
    const paid = payments.filter((payment) => payment.saleId === sale.id).reduce((total, payment) => total + toCentavos(payment.amount), 0)
    if (sale.status === 'voided') expectedAr -= paid
    else expectedAr += toCentavos(sale.total) - paid
  }
  const arId = accountId('1100')
  const arLedger = arId ? toCentavos(getAccountBalance(arId).netDebit) : 0
  checks.push({
    id: 'receivable',
    label: 'Accounts receivable equals open sales, adjusted for credits',
    pass: arLedger === expectedAr,
    difference: fromCentavos(arLedger - expectedAr),
    detail: `Ledger ${fromCentavos(arLedger).toFixed(2)} and open sales ${fromCentavos(expectedAr).toFixed(2)}.`,
    entries: arLedger === expectedAr ? [] : recentEntries([arId]),
  })

  let expectedAp = 0
  const supplierPayments = getAll(COLLECTIONS.SUPPLIER_PAYMENTS)
  const receipts = getAll(COLLECTIONS.RECEIVING_RECORDS)
  for (const invoice of getAll(COLLECTIONS.PURCHASE_INVOICES)) {
    expectedAp += toCentavos(receivedValue(invoice, receipts)) - toCentavos(invoiceAmountPaid(invoice.id, supplierPayments))
  }
  for (const expense of getAll(COLLECTIONS.EXPENSES)) {
    if (expense.status === 'unpaid') expectedAp += toCentavos(expense.amount)
  }
  const apId = accountId('2010')
  const apLedger = apId ? -toCentavos(getAccountBalance(apId).netDebit) : 0
  checks.push({
    id: 'payable',
    label: 'Accounts payable equals open supplier balances plus unpaid expenses',
    pass: apLedger === expectedAp,
    difference: fromCentavos(apLedger - expectedAp),
    detail: `Ledger ${fromCentavos(apLedger).toFixed(2)} and open payables ${fromCentavos(expectedAp).toFixed(2)}.`,
    entries: apLedger === expectedAp ? [] : recentEntries([apId]),
  })

  return checks
}
