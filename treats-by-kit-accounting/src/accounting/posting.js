import { accountByCode } from '../data/accounts'
import { getAverageCost } from '../utils/inventory'
import { round2, sum } from '../utils/money'

const METHOD_CODES = {
  cash: '1010',
  gcash: '1020',
  bank_transfer: '1030',
  other: '1010',
}

function accountId(code) {
  const account = accountByCode(code)
  if (!account) throw new Error(`Account ${code} is missing from the chart of accounts.`)
  return account.id
}

function debit(code, amount, memo) {
  return { accountId: accountId(code), debit: round2(amount), credit: 0, memo: memo || '' }
}

function credit(code, amount, memo) {
  return { accountId: accountId(code), debit: 0, credit: round2(amount), memo: memo || '' }
}

function inventoryCode(category) {
  if (category === 'packaging') return '1210'
  if (category === 'finished_good') return '1220'
  return '1200'
}

function methodCode(method) {
  return METHOD_CODES[method] || METHOD_CODES.cash
}

function draft(fields, lines) {
  const kept = lines.filter((line) => round2(line.debit) > 0 || round2(line.credit) > 0)
  if (kept.length === 0) return null
  return { ...fields, lines: kept }
}

export function isDeposit(payment) {
  if (!payment || payment.kind === 'refund') return false
  return payment.role === 'deposit' || payment.notes === 'Down payment'
}

export function receivingDraft({ receipt, invoice, items }) {
  const amounts = new Map()
  for (const line of receipt?.lines || []) {
    const source = (invoice?.lines || []).find((entry) => entry.id === line.invoiceLineId)
    const amount = round2((Number(line.quantity) || 0) * (Number(source?.unitPrice) || 0))
    if (amount <= 0) continue
    const item = items.find((entry) => entry.id === line.itemId)
    const code = inventoryCode(item?.category)
    amounts.set(code, sum([amounts.get(code) || 0, amount]))
  }
  const lines = [...amounts.entries()].map(([code, amount]) => debit(code, amount, invoice?.invoiceNumber || 'Receipt'))
  const total = sum([...amounts.values()])
  if (total > 0) lines.push(credit('2010', total, invoice?.invoiceNumber || 'Receipt'))
  return draft(
    {
      eventKey: `receiving:${receipt.id}`,
      date: receipt.date,
      description: `Receive invoice ${invoice?.invoiceNumber || ''}`.trim(),
      sourceType: 'receiving',
      sourceId: receipt.id,
    },
    lines,
  )
}

export function supplierPaymentDraft(payment, invoice) {
  const amount = round2(payment.amount)
  if (amount <= 0) return null
  return draft(
    {
      eventKey: `supplier-payment:${payment.id}`,
      date: payment.date,
      description: `Supplier payment ${invoice?.invoiceNumber || ''}`.trim(),
      sourceType: 'supplier_payment',
      sourceId: payment.id,
    },
    [debit('2010', amount, payment.reference || ''), credit(methodCode(payment.method), amount, payment.reference || '')],
  )
}

export function productionDraft(batch, items) {
  const lines = []
  let finished = 0
  for (const line of batch.lines || []) {
    const item = items.find((entry) => entry.id === line.itemId)
    const code = inventoryCode(item?.category)
    const name = item?.name || 'Ingredient'
    const used = round2((Number(line.actualQty) || 0) * (Number(line.unitCost) || 0))
    const wasted = round2((Number(line.wasteQty) || 0) * (Number(line.unitCost) || 0))
    if (used > 0) {
      lines.push(credit(code, used, name))
      finished = sum([finished, used])
    }
    if (wasted > 0) {
      lines.push(debit('5020', wasted, name))
      lines.push(credit(code, wasted, `${name} waste`))
    }
  }
  const applied = sum([batch.laborCost, batch.overheadCost])
  if (applied > 0) {
    lines.push(credit('5040', applied, 'Labor and overhead'))
    finished = sum([finished, applied])
  }
  if (finished > 0) lines.unshift(debit('1220', finished, batch.batchNumber))
  return draft(
    {
      eventKey: `production:${batch.id}`,
      date: batch.date,
      description: `Production ${batch.batchNumber}`,
      sourceType: 'production',
      sourceId: batch.id,
    },
    lines,
  )
}

export function saleDraft(sale) {
  const lines = []
  if (round2(sale.total) > 0) lines.push(debit('1100', sale.total, sale.saleNumber))
  if (round2(sale.discountAmount) > 0) lines.push(debit('4020', sale.discountAmount, sale.saleNumber))
  if (round2(sale.subtotal) > 0) lines.push(credit('4010', sale.subtotal, sale.saleNumber))
  return draft(
    {
      eventKey: `sale:${sale.id}`,
      date: sale.date,
      description: `Sale ${sale.saleNumber}`,
      sourceType: 'sale',
      sourceId: sale.id,
    },
    lines,
  )
}

export function cogsDraft(sale) {
  const amount = round2(sale.cogsTotal)
  if (amount <= 0) return null
  return draft(
    {
      eventKey: `sale-cogs:${sale.id}`,
      date: sale.date,
      description: `Cost of goods sold ${sale.saleNumber}`,
      sourceType: 'sale_cogs',
      sourceId: sale.id,
    },
    [debit('5010', amount, sale.saleNumber), credit('1220', amount, sale.saleNumber)],
  )
}

export function customerPaymentDraft(payment, sale) {
  const amount = round2(payment.amount)
  if (amount <= 0 || isDeposit(payment) || payment.kind === 'refund') return null
  return draft(
    {
      eventKey: `sale-payment:${payment.id}`,
      date: payment.date,
      description: `Customer payment ${sale?.saleNumber || ''}`.trim(),
      sourceType: 'customer_payment',
      sourceId: payment.id,
    },
    [debit(methodCode(payment.method), amount, sale?.saleNumber || ''), credit('1100', amount, sale?.saleNumber || '')],
  )
}

export function depositDraft(payment, order) {
  const amount = round2(payment.amount)
  if (amount <= 0) return null
  return draft(
    {
      eventKey: `order-deposit:${payment.id}`,
      date: payment.date,
      description: `Down payment ${order?.orderNumber || ''}`.trim(),
      sourceType: 'customer_deposit',
      sourceId: payment.id,
    },
    [debit(methodCode(payment.method), amount, order?.orderNumber || ''), credit('2020', amount, order?.orderNumber || '')],
  )
}

export function depositApplyDraft({ order, amount, date }) {
  const value = round2(amount)
  if (value <= 0) return null
  return draft(
    {
      eventKey: `order-deposit-apply:${order.id}`,
      date,
      description: `Apply deposit ${order.orderNumber}`,
      sourceType: 'deposit_applied',
      sourceId: order.id,
    },
    [debit('2020', value, order.orderNumber), credit('1100', value, order.orderNumber)],
  )
}

export function depositRefundDraft({ order, amount, method, date }) {
  const value = round2(amount)
  if (value <= 0) return null
  return draft(
    {
      eventKey: `order-deposit-refund:${order.id}`,
      date,
      description: `Refund deposit ${order.orderNumber}`,
      sourceType: 'deposit_refund',
      sourceId: order.id,
    },
    [debit('2020', value, order.orderNumber), credit(methodCode(method), value, order.orderNumber)],
  )
}

export function depositRetainDraft({ order, amount, date }) {
  const value = round2(amount)
  if (value <= 0) return null
  return draft(
    {
      eventKey: `order-deposit-retain:${order.id}`,
      date,
      description: `Retain deposit ${order.orderNumber}`,
      sourceType: 'deposit_retained',
      sourceId: order.id,
    },
    [debit('2020', value, order.orderNumber), credit('4090', value, order.orderNumber)],
  )
}

export function customerRefundDraft(payment, sale) {
  const amount = round2(Math.abs(payment.amount))
  if (amount <= 0) return null
  return draft(
    {
      eventKey: `sale-refund:${payment.id}`,
      date: payment.date,
      description: `Refund ${sale?.saleNumber || ''}`.trim(),
      sourceType: 'customer_refund',
      sourceId: payment.id,
    },
    [debit('1100', amount, sale?.saleNumber || ''), credit(methodCode(payment.method), amount, sale?.saleNumber || '')],
  )
}

export function adjustmentDraft(movement, item) {
  const missingCost = movement.unitCost === null || movement.unitCost === undefined || movement.unitCost === ''
  const unitCost = missingCost ? getAverageCost(item?.id) ?? 0 : Number(movement.unitCost) || 0
  const quantityIn = Number(movement.quantityIn) || 0
  const quantityOut = Number(movement.quantityOut) || 0
  const amount = round2(Math.abs(quantityIn - quantityOut) * unitCost)
  if (amount <= 0) return null
  const code = inventoryCode(item?.category)
  const name = item?.name || 'Item'
  const lines =
    quantityIn > quantityOut
      ? [debit(code, amount, name), credit('5030', amount, name)]
      : [debit('5030', amount, name), credit(code, amount, name)]
  return draft(
    {
      eventKey: `adjustment:${movement.id}`,
      date: movement.date,
      description: `Stock adjustment ${name}`,
      sourceType: 'adjustment',
      sourceId: movement.id,
    },
    lines,
  )
}

export function expenseDraft(expense, eventKey) {
  if (!expense || expense.status === 'voided') return null
  const amount = round2(expense.amount)
  if (amount <= 0) return null
  const code = expense.category
  const memo = expense.payee || expense.description || 'Expense'
  const lines =
    expense.status === 'paid'
      ? [debit(code, amount, memo), credit(methodCode(expense.method), amount, memo)]
      : [debit(code, amount, memo), credit('2010', amount, memo)]
  return draft(
    {
      eventKey: eventKey || `expense:${expense.id}`,
      date: expense.date,
      description: `Expense ${memo}`,
      sourceType: 'expense',
      sourceId: expense.id,
    },
    lines,
  )
}

export function expensePaymentDraft(expense, payment) {
  const amount = round2(payment.amount)
  if (amount <= 0) return null
  return draft(
    {
      eventKey: `expense-payment:${expense.id}`,
      date: payment.date,
      description: `Pay expense ${expense.payee || ''}`.trim(),
      sourceType: 'expense_payment',
      sourceId: expense.id,
    },
    [debit('2010', amount, expense.payee || ''), credit(methodCode(payment.method), amount, expense.payee || '')],
  )
}

export function capitalContributionDraft({ date, amount, eventKey = 'demo:capital' }) {
  const value = round2(amount)
  if (value <= 0) return null
  return draft(
    {
      eventKey,
      date,
      description: "Owner's capital contribution",
      sourceType: 'manual',
      sourceId: null,
    },
    [debit('1010', value, 'Capital contribution'), credit('3010', value, 'Capital contribution')],
  )
}
