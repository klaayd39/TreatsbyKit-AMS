import {
  customerPaymentDraft,
  customerRefundDraft,
  depositApplyDraft,
  depositDraft,
  depositRefundDraft,
  depositRetainDraft,
  isDeposit,
  saleDraft,
} from '../accounting/posting'
import { toUuid } from '../utils/id'
import { getAverageCost, getStockOnHand, roundQuantity } from '../utils/inventory'
import { sum } from '../utils/money'
import {
  calculateCart,
  getSalePaymentStatus,
  priceSaleLines,
  roundMoney,
} from '../utils/sales'
import { sessionRole } from '../auth/session'
import { buildReversalDraft, findByEventKey } from './journal'
import { COLLECTIONS } from './seed'
import { add, callRpc, getAll, remove, update } from './storage'

export const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash' },
  { id: 'gcash', label: 'GCash' },
  { id: 'bank_transfer', label: 'Bank Transfer' },
  { id: 'other', label: 'Other' },
]

export const PAYMENT_STATUS_LABELS = {
  paid: 'Paid',
  partial: 'Partially Paid',
  unpaid: 'Unpaid',
}

export const ORDER_STATUS_LABELS = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export function paymentMethodLabel(method) {
  return PAYMENT_METHODS.find((entry) => entry.id === method)?.label || 'Other'
}

export function nextNumber(records, prefix, field, width) {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`)
  const max = records.reduce((highest, record) => {
    const match = pattern.exec(record[field] || '')
    return match ? Math.max(highest, Number(match[1])) : highest
  }, 0)
  return `${prefix}-${String(max + 1).padStart(width, '0')}`
}

export function nextSaleNumber(sales = getAll(COLLECTIONS.SALES)) {
  return nextNumber(sales, 'SL', 'saleNumber', 4)
}

export function nextOrderNumber(orders = getAll(COLLECTIONS.ORDERS)) {
  return nextNumber(orders, 'OR', 'orderNumber', 4)
}

export function amountPaidFor(id, payments, field) {
  return roundMoney(
    payments.filter((payment) => payment[field] === id).reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0),
  )
}

export function decorateSale(sale, payments) {
  const amountPaid = amountPaidFor(sale.id, payments, 'saleId')
  const balance = roundMoney(Math.max(0, (Number(sale.total) || 0) - amountPaid))
  return { ...sale, amountPaid, balance, paymentStatus: getSalePaymentStatus({ ...sale, amountPaid }) }
}

export function orderBalanceDue(order, payments, sales = []) {
  if (order.status === 'cancelled') return 0
  if (order.status === 'completed' && order.saleId) {
    const sale = sales.find((entry) => entry.id === order.saleId)
    if (!sale || sale.status === 'voided') return 0
    return decorateSale(sale, payments).balance
  }
  return roundMoney(Math.max(0, (Number(order.total) || 0) - amountPaidFor(order.id, payments, 'orderId')))
}

function discountErrors(discount, subtotal) {
  const type = discount?.type === 'percent' ? 'percent' : 'amount'
  const raw = discount?.value
  if (raw === '' || raw === undefined || raw === null) return null
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) return 'Discount must be 0 or more.'
  if (type === 'percent' && value > 100) return 'Discount percent cannot be more than 100.'
  if (type === 'amount' && roundMoney(value) > roundMoney(subtotal)) return 'Discount cannot be more than the subtotal.'
  return null
}

function groupShortages(lines, movements) {
  const items = getAll(COLLECTIONS.ITEMS)
  const grouped = new Map()
  for (const line of lines) {
    const current = grouped.get(line.itemId) || {
      itemId: line.itemId,
      name: items.find((item) => item.id === line.itemId)?.name || 'Item',
      unit: items.find((item) => item.id === line.itemId)?.unit || '',
      required: 0,
      onHand: getStockOnHand(line.itemId, movements),
    }
    current.required = roundQuantity(current.required + (Number(line.quantity) || 0))
    grouped.set(line.itemId, current)
  }
  return [...grouped.values()]
    .map((line) => ({ ...line, shortfall: roundQuantity(Math.max(0, line.required - line.onHand)) }))
    .filter((line) => line.shortfall > 0)
}

function shortageMessage(shortages) {
  return `Not enough stock: ${shortages
    .map((line) => `${line.name} (short ${line.shortfall} ${line.unit})`.trim())
    .join(', ')}.`
}

export async function saveCustomer(draft) {
  const name = draft.name?.trim() ?? ''
  if (!name) return { ok: false, errors: { name: 'Enter a name.' } }
  const payload = {
    name,
    phone: draft.phone?.trim() ?? '',
    address: draft.address?.trim() ?? '',
    notes: draft.notes?.trim() ?? '',
  }
  if (draft.id) {
    const updated = await update(COLLECTIONS.CUSTOMERS, draft.id, payload)
    if (!updated) return { ok: false, errors: { form: 'This customer no longer exists.' } }
    return { ok: true, customer: updated }
  }
  return {
    ok: true,
    customer: await add(COLLECTIONS.CUSTOMERS, { ...payload, id: crypto.randomUUID(), createdAt: new Date().toISOString() }),
  }
}

export async function deleteCustomer(id) {
  const used =
    getAll(COLLECTIONS.ORDERS).some((order) => order.customerId === id) ||
    getAll(COLLECTIONS.SALES).some((sale) => sale.customerId === id)
  if (used) return { ok: false, message: 'This customer has orders or sales and cannot be deleted.' }
  if (!(await remove(COLLECTIONS.CUSTOMERS, id))) return { ok: false, message: 'This customer no longer exists.' }
  return { ok: true }
}

function buildLines(rawLines, discount) {
  const items = getAll(COLLECTIONS.ITEMS)
  const movements = getAll(COLLECTIONS.STOCK_MOVEMENTS)
  const errors = {}
  const lineErrors = (rawLines || []).map((line) => {
    const lineError = {}
    const item = items.find((entry) => entry.id === line.itemId)
    if (!item || item.category !== 'finished_good') lineError.itemId = 'Choose a finished good.'
    const quantity = Number(line.quantity)
    if (line.quantity === '' || !Number.isFinite(quantity) || quantity <= 0) lineError.quantity = 'Quantity must be greater than 0.'
    const unitPrice = Number(line.unitPrice)
    if (line.unitPrice === '' || !Number.isFinite(unitPrice) || unitPrice < 0) lineError.unitPrice = 'Price must be 0 or more.'
    return lineError
  })
  if (!rawLines?.length) errors.lines = 'Add at least one item.'
  if (lineErrors.some((error) => Object.keys(error).length)) errors.lineErrors = lineErrors
  const seen = new Set()
  for (const line of rawLines || []) {
    if (!line.itemId) continue
    if (seen.has(line.itemId)) {
      errors.form = 'Each finished good can only appear once.'
      break
    }
    seen.add(line.itemId)
  }
  const preview = calculateCart(rawLines || [], discount)
  const discountError = discountErrors(discount, preview.subtotal)
  if (discountError) errors.discount = discountError
  if (Object.keys(errors).length) return { errors }

  const snapshot = (rawLines || []).map((line) => ({
    id: toUuid(line.id),
    itemId: line.itemId,
    quantity: roundQuantity(line.quantity),
    unitPrice: roundMoney(line.unitPrice),
    unitCost: getAverageCost(line.itemId, movements) ?? 0,
  }))
  return { lines: priceSaleLines(snapshot, discount).lines, priced: priceSaleLines(snapshot, discount) }
}

export async function completeSale(draft, options = {}) {
  const errors = {}
  const saleNumber = draft.saleNumber?.trim() || nextSaleNumber()
  if (getAll(COLLECTIONS.SALES).some((sale) => sale.saleNumber.trim().toLowerCase() === saleNumber.toLowerCase())) {
    errors.saleNumber = 'This sale number is already used.'
  }
  if (!draft.date) errors.date = 'Choose a date.'
  const customerId = draft.customerId || null
  if (customerId && !getAll(COLLECTIONS.CUSTOMERS).some((customer) => customer.id === customerId)) {
    errors.customerId = 'Choose a customer.'
  }
  const built = buildLines(draft.lines, draft.discount)
  if (built.errors) Object.assign(errors, built.errors)
  if (Object.keys(errors).length) return { ok: false, errors }

  const priced = built.priced
  const shortages = groupShortages(priced.lines, getAll(COLLECTIONS.STOCK_MOVEMENTS))
  if (shortages.length) return { ok: false, errors: { form: shortageMessage(shortages) }, shortages }

  let payment = null
  if (draft.payLater) {
    if (!customerId) errors.customerId = 'Pay later needs a customer.'
  } else {
    const method = draft.payment?.method
    if (!PAYMENT_METHODS.some((entry) => entry.id === method)) errors.method = 'Choose a payment method.'
    const received = Number(draft.payment?.amountReceived)
    if (draft.payment?.amountReceived === '' || !Number.isFinite(received) || received < 0) {
      errors.amountReceived = 'Enter the amount received.'
    } else if (received === 0 && priced.total > 0) {
      errors.amountReceived = 'Enter an amount, or choose Pay later.'
    } else if (errors.method) {
      // wait for method
    } else {
      const receivedMoney = roundMoney(received)
      let applied = receivedMoney
      let changeDue = 0
      if (method === 'cash') {
        applied = roundMoney(Math.min(receivedMoney, priced.total))
        changeDue = roundMoney(Math.max(0, receivedMoney - priced.total))
      } else if (receivedMoney > priced.total) {
        errors.amountReceived = 'Amount received cannot be more than the total.'
      }
      if (!errors.amountReceived && applied + 0.009 < priced.total && !customerId) {
        errors.customerId = 'Choose a customer when the sale is not paid in full.'
      }
      if (!errors.amountReceived && !errors.customerId && !errors.method) {
        payment = {
          method,
          amount: applied,
          tendered: receivedMoney,
          changeDue,
          date: draft.payment?.date || draft.date,
        }
      }
    }
  }
  if (Object.keys(errors).length) return { ok: false, errors }

  const sale = {
    id: crypto.randomUUID(),
    saleNumber,
    date: draft.date,
    soldAt: draft.soldAt || `${draft.date}T00:00:00`,
    customerId,
    source: draft.source === 'order' ? 'order' : 'pos',
    orderId: draft.orderId || null,
    lines: priced.lines,
    subtotal: priced.subtotal,
    discountType: priced.discountType,
    discountValue: roundMoney(priced.discountValue),
    discountAmount: priced.discountAmount,
    total: priced.total,
    cogsTotal: priced.cogsTotal,
    grossProfit: priced.grossProfit,
    status: 'completed',
    voidReason: '',
    voidedAt: null,
    notes: draft.notes?.trim() ?? '',
    createdAt: new Date().toISOString(),
  }

  const createdJournals = []
  try {
    let paymentRecord = null
    if (payment && payment.amount > 0) {
      paymentRecord = {
        id: crypto.randomUUID(),
        saleId: sale.id,
        orderId: draft.orderId || null,
        date: payment.date,
        method: payment.method,
        amount: payment.amount,
        tendered: payment.tendered,
        changeDue: payment.changeDue,
        kind: 'payment',
        role: 'sale',
        notes: '',
      }
    }
  const journals = sessionRole() === 'cashier'
      ? null
      : [saleDraft(sale), paymentRecord ? customerPaymentDraft(paymentRecord, sale) : null].filter(Boolean)
    if (options.prepareOnly) return { ok: true, sale, payment: paymentRecord, journals }
    await callRpc('complete_sale', { sale, payment: paymentRecord, journals })
    return { ok: true, sale: getAll(COLLECTIONS.SALES).find((entry) => entry.id === sale.id) || sale, payment: paymentRecord, journalIds: createdJournals }
  } catch (error) {
    return { ok: false, errors: { form: error.message || 'The sale could not be saved.' } }
  }
}

export async function recordPayment(saleId, draft) {
  const errors = {}
  const sale = getAll(COLLECTIONS.SALES).find((entry) => entry.id === saleId)
  if (!sale) return { ok: false, errors: { form: 'This sale no longer exists.' } }
  if (sale.status === 'voided') return { ok: false, errors: { form: 'A voided sale cannot take a payment.' } }
  const payments = getAll(COLLECTIONS.PAYMENTS)
  const balance = decorateSale(sale, payments).balance
  if (balance <= 0) return { ok: false, errors: { form: 'This sale is already paid.' } }
  if (!PAYMENT_METHODS.some((entry) => entry.id === draft.method)) errors.method = 'Choose a payment method.'
  if (!draft.date) errors.date = 'Choose a date.'
  const amount = Number(draft.amount)
  if (draft.amount === '' || !Number.isFinite(amount) || amount <= 0) errors.amount = 'Enter an amount greater than 0.'
  else if (roundMoney(amount) > balance) errors.amount = `Amount cannot be more than the balance of ${balance}.`
  if (Object.keys(errors).length) return { ok: false, errors }

  const payment = {
    id: crypto.randomUUID(),
    saleId: sale.id,
    orderId: sale.orderId || null,
    date: draft.date,
    method: draft.method,
    amount: roundMoney(amount),
    tendered: roundMoney(amount),
    changeDue: 0,
    kind: 'payment',
    role: 'sale',
    notes: '',
  }
  try {
    const journal = sessionRole() === 'cashier' ? null : customerPaymentDraft(payment, sale)
    await callRpc('record_sale_payment', { payment, journal })
    return { ok: true, payment, sale: decorateSale(sale, getAll(COLLECTIONS.PAYMENTS)) }
  } catch (error) {
    return { ok: false, errors: { form: error.message || 'The payment could not be saved.' } }
  }
}

export async function refundVoidedSale(saleId, draft) {
  const errors = {}
  const sale = getAll(COLLECTIONS.SALES).find((entry) => entry.id === saleId)
  if (!sale) return { ok: false, errors: { form: 'This sale no longer exists.' } }
  if (sale.status !== 'voided') return { ok: false, errors: { form: 'Only a voided sale can be refunded here.' } }
  const credit = amountPaidFor(sale.id, getAll(COLLECTIONS.PAYMENTS), 'saleId')
  if (credit <= 0) return { ok: false, errors: { form: 'This sale has no credit balance.' } }
  if (!PAYMENT_METHODS.some((entry) => entry.id === draft.method)) errors.method = 'Choose a payment method.'
  if (!draft.date) errors.date = 'Choose a date.'
  const amount = Number(draft.amount)
  if (draft.amount === '' || !Number.isFinite(amount) || amount <= 0) errors.amount = 'Enter an amount greater than 0.'
  else if (roundMoney(amount) > credit) errors.amount = `Amount cannot be more than the credit of ${credit}.`
  if (Object.keys(errors).length) return { ok: false, errors }

  const payment = {
    id: crypto.randomUUID(),
    saleId: sale.id,
    orderId: sale.orderId || null,
    date: draft.date,
    method: draft.method,
    amount: roundMoney(-amount),
    tendered: roundMoney(amount),
    changeDue: 0,
    kind: 'refund',
    role: 'refund',
    notes: 'Refund of a voided sale',
  }
  try {
    const journal = sessionRole() === 'cashier' ? null : customerRefundDraft(payment, sale)
    await callRpc('record_sale_payment', { payment, journal })
    return { ok: true, payment, sale: decorateSale(sale, getAll(COLLECTIONS.PAYMENTS)) }
  } catch (error) {
    return { ok: false, errors: { form: error.message || 'The refund could not be saved.' } }
  }
}

export async function voidSale(saleId, reason) {
  const trimmed = reason?.trim() ?? ''
  if (!trimmed) return { ok: false, errors: { reason: 'Enter a reason for voiding this sale.' } }
  const sale = getAll(COLLECTIONS.SALES).find((entry) => entry.id === saleId)
  if (!sale) return { ok: false, errors: { form: 'This sale no longer exists.' } }
  if (sale.status === 'voided') return { ok: false, errors: { form: 'This sale is already voided.' } }

  const voidedAt = new Date().toISOString()
  const journals = [`sale:${sale.id}`, `sale-cogs:${sale.id}`]
    .map((key) => findByEventKey(key))
    .filter((entry) => entry && entry.status !== 'reversed')
    .map((entry) => buildReversalDraft(entry, {
      date: voidedAt.slice(0, 10),
      reason: trimmed,
      sourceType: `${entry.sourceType}_reversal`,
      sourceId: sale.id,
    }))
  try {
    await callRpc('void_sale', { saleId: sale.id, reason: trimmed, date: voidedAt.slice(0, 10), journals })
    return { ok: true, sale: getAll(COLLECTIONS.SALES).find((entry) => entry.id === sale.id) }
  } catch (error) {
    return { ok: false, errors: { form: error.message || 'The sale could not be voided.' } }
  }
}

export async function createOrder(draft) {
  const errors = {}
  const orderNumber = draft.orderNumber?.trim() || nextOrderNumber()
  if (getAll(COLLECTIONS.ORDERS).some((order) => order.orderNumber.trim().toLowerCase() === orderNumber.toLowerCase())) {
    errors.orderNumber = 'This order number is already used.'
  }
  if (!draft.customerId) errors.customerId = 'Choose a customer.'
  else if (!getAll(COLLECTIONS.CUSTOMERS).some((customer) => customer.id === draft.customerId)) {
    errors.customerId = 'Choose a customer.'
  }
  if (!draft.orderDate) errors.orderDate = 'Choose an order date.'
  if (!draft.fulfillmentDate) errors.fulfillmentDate = 'Choose a pickup or delivery date.'
  if (draft.fulfillmentType !== 'pickup' && draft.fulfillmentType !== 'delivery') {
    errors.fulfillmentType = 'Choose pickup or delivery.'
  }
  const built = buildLines(draft.lines, draft.discount)
  if (built.errors) Object.assign(errors, built.errors)
  if (Object.keys(errors).length) return { ok: false, errors }

  const priced = built.priced
  const downRaw = draft.downPayment?.amount
  const downAmount = downRaw === '' || downRaw === undefined || downRaw === null ? 0 : Number(downRaw)
  if (!Number.isFinite(downAmount) || downAmount < 0) errors.downPayment = 'Down payment must be 0 or more.'
  else if (roundMoney(downAmount) > priced.total) errors.downPayment = 'Down payment cannot be more than the total.'
  else if (downAmount > 0 && !PAYMENT_METHODS.some((entry) => entry.id === draft.downPayment?.method)) {
    errors.downMethod = 'Choose a payment method for the down payment.'
  }
  if (Object.keys(errors).length) return { ok: false, errors }

  const order = {
    id: crypto.randomUUID(),
    orderNumber,
    customerId: draft.customerId,
    orderDate: draft.orderDate,
    fulfillmentDate: draft.fulfillmentDate,
    fulfillmentType: draft.fulfillmentType,
    notes: draft.notes?.trim() ?? '',
    status: 'pending',
    lines: priced.lines.map((line) => ({
      id: line.id,
      itemId: line.itemId,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
    })),
    subtotal: priced.subtotal,
    discountType: priced.discountType,
    discountValue: roundMoney(priced.discountValue),
    discountAmount: priced.discountAmount,
    total: priced.total,
    cancelReason: '',
    cancelledAt: null,
    downPaymentDisposition: null,
    saleId: null,
    createdAt: new Date().toISOString(),
  }

  try {
    let paymentRecord = null
    if (roundMoney(downAmount) > 0) {
      paymentRecord = {
        id: crypto.randomUUID(),
        date: draft.downPayment?.date || draft.orderDate,
        method: draft.downPayment.method,
        amount: roundMoney(downAmount),
      }
    }
    const journal = paymentRecord && sessionRole() !== 'cashier' ? depositDraft({ ...paymentRecord, role: 'deposit', notes: 'Down payment' }, order) : null
    await callRpc('create_order', { order, payment: paymentRecord, journal })
    return { ok: true, order: getAll(COLLECTIONS.ORDERS).find((entry) => entry.id === order.id) || order }
  } catch (error) {
    return { ok: false, errors: { form: error.message || 'The order could not be saved.' } }
  }
}

export async function advanceOrder(id, status) {
  const order = getAll(COLLECTIONS.ORDERS).find((entry) => entry.id === id)
  if (!order) return { ok: false, errors: { form: 'This order no longer exists.' } }
  const allowed = { pending: ['confirmed'], confirmed: ['ready'] }
  if (!allowed[order.status]?.includes(status)) {
    return { ok: false, errors: { form: 'This order cannot move to that status.' } }
  }
  try {
    const updated = await update(COLLECTIONS.ORDERS, id, { status })
    return { ok: true, order: updated }
  } catch (error) {
    return { ok: false, errors: { form: error.message } }
  }
}

export async function cancelOrder(id, draft) {
  const reason = draft.reason?.trim() ?? ''
  if (!reason) return { ok: false, errors: { reason: 'Enter a reason for cancelling this order.' } }
  const order = getAll(COLLECTIONS.ORDERS).find((entry) => entry.id === id)
  if (!order) return { ok: false, errors: { form: 'This order no longer exists.' } }
  if (order.status === 'completed') return { ok: false, errors: { form: 'A completed order cannot be cancelled.' } }
  if (order.status === 'cancelled') return { ok: false, errors: { form: 'This order is already cancelled.' } }

  const payments = getAll(COLLECTIONS.PAYMENTS).filter((payment) => payment.orderId === id)
  const paid = roundMoney(payments.reduce((total, payment) => total + (Number(payment.amount) || 0), 0))
  let disposition = null
  if (paid > 0) {
    if (draft.disposition !== 'refund' && draft.disposition !== 'retain') {
      return { ok: false, errors: { disposition: 'Choose whether to refund the down payment or keep it.' } }
    }
    disposition = draft.disposition
  }
  const method = payments[payments.length - 1]?.method || 'cash'
  const journal = sessionRole() === 'cashier' || !disposition
    ? null
    : disposition === 'refund'
      ? depositRefundDraft({ order, amount: paid, method, date: draft.date })
      : depositRetainDraft({ order, amount: paid, date: draft.date })
  try {
    await callRpc('cancel_order', { orderId: id, reason, date: draft.date, disposition, journal })
    return { ok: true, order: getAll(COLLECTIONS.ORDERS).find((entry) => entry.id === id) }
  } catch (error) {
    return { ok: false, errors: { form: error.message || 'The order could not be cancelled.' } }
  }
}

export async function completeOrder(id, draft) {
  const order = getAll(COLLECTIONS.ORDERS).find((entry) => entry.id === id)
  if (!order) return { ok: false, errors: { form: 'This order no longer exists.' } }
  if (order.status === 'cancelled') return { ok: false, errors: { form: 'A cancelled order cannot be completed.' } }
  if (order.status === 'completed') return { ok: false, errors: { form: 'This order is already completed.' } }

  const payments = getAll(COLLECTIONS.PAYMENTS)
  const paid = amountPaidFor(order.id, payments, 'orderId')
  const balance = roundMoney(Math.max(0, order.total - paid))
  const amountRaw = draft.amount
  const amount = amountRaw === '' || amountRaw === undefined || amountRaw === null ? 0 : Number(amountRaw)
  const errors = {}
  if (!Number.isFinite(amount) || amount < 0) errors.amount = 'Amount must be 0 or more.'
  else if (roundMoney(amount) > balance) errors.amount = 'Amount cannot be more than the balance due.'
  else if (amount > 0 && !PAYMENT_METHODS.some((entry) => entry.id === draft.method)) errors.method = 'Choose a payment method.'
  if (!draft.date) errors.date = 'Choose a date.'
  if (Object.keys(errors).length) return { ok: false, errors }

  const prepared = await completeSale({
    saleNumber: draft.saleNumber,
    date: draft.date,
    soldAt: draft.soldAt,
    customerId: order.customerId,
    source: 'order',
    orderId: order.id,
    lines: order.lines,
    discount: { type: order.discountType, value: order.discountValue },
    payLater: !(amount > 0),
    payment: amount > 0 ? { method: draft.method, amountReceived: amount, date: draft.date } : null,
    notes: order.notes,
  }, { prepareOnly: true })
  if (!prepared.ok) return prepared
  const deposits = sum(payments.filter((payment) => payment.orderId === order.id && isDeposit(payment)).map((payment) => payment.amount))
  const depositJournal = sessionRole() === 'cashier' ? null : depositApplyDraft({ order, amount: deposits, date: draft.date })
  try {
    const result = await callRpc('complete_order', {
      orderId: order.id,
      date: draft.date,
      salePayload: { sale: prepared.sale, payment: prepared.payment, journals: prepared.journals },
      depositJournal,
    })
    return {
      ok: true,
      order: getAll(COLLECTIONS.ORDERS).find((entry) => entry.id === order.id),
      sale: getAll(COLLECTIONS.SALES).find((entry) => entry.id === result.saleId),
    }
  } catch (error) {
    return { ok: false, errors: { form: error.message || 'The order could not be completed.' } }
  }
}
