import { receivingDraft, supplierPaymentDraft } from '../accounting/posting'
import { postDraft } from './journal'
import { PAYMENT_METHODS } from './sales'
import { generateId } from '../utils/id'
import { roundQuantity } from '../utils/inventory'
import { round2, sum, toCentavos } from '../utils/money'
import { COLLECTIONS } from './seed'
import { callRpc, getAll, getById } from './storage'

export const PAYMENT_STATUS_LABELS = {
  unpaid: 'Unpaid',
  partial: 'Partially Paid',
  paid: 'Paid',
}

export const RECEIVING_STATUS_LABELS = {
  not_received: 'Not Received',
  partial: 'Partially Received',
  full: 'Fully Received',
}

function cents(value) {
  return toCentavos(value)
}

export function invoiceAmountPaid(invoiceId, payments = getAll(COLLECTIONS.SUPPLIER_PAYMENTS)) {
  return sum(payments.filter((payment) => payment.invoiceId === invoiceId).map((payment) => payment.amount))
}

export function receivedValue(invoice, receipts = getAll(COLLECTIONS.RECEIVING_RECORDS)) {
  return sum(
    receipts
      .filter((receipt) => receipt.invoiceId === invoice.id)
      .flatMap((receipt) => receipt.lines || [])
      .map((line) => {
        const source = (invoice.lines || []).find((entry) => entry.id === line.invoiceLineId)
        return round2((Number(line.quantity) || 0) * (Number(source?.unitPrice) || 0))
      }),
  )
}

export function supplierBalance(invoice, receipts = getAll(COLLECTIONS.RECEIVING_RECORDS), payments = getAll(COLLECTIONS.SUPPLIER_PAYMENTS)) {
  return round2(receivedValue(invoice, receipts) - invoiceAmountPaid(invoice.id, payments))
}

export function lineTotal(line) {
  return ((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0))
}

export function invoiceSubtotal(invoice) {
  return (invoice.lines || []).reduce((total, line) => total + lineTotal(line), 0)
}

export function invoiceGrandTotal(invoice) {
  return invoiceSubtotal(invoice)
}

export function paymentStatus(invoice, payments = getAll(COLLECTIONS.SUPPLIER_PAYMENTS)) {
  const total = cents(invoiceGrandTotal(invoice))
  const paid = invoice?.id ? cents(invoiceAmountPaid(invoice.id, payments)) : 0
  if (paid <= 0 && total > 0) return 'unpaid'
  if (paid < total) return 'partial'
  return 'paid'
}

export function receivedQtyForLine(receipts, invoiceId, lineId) {
  const total = receipts
    .filter((receipt) => receipt.invoiceId === invoiceId)
    .flatMap((receipt) => receipt.lines || [])
    .filter((line) => line.invoiceLineId === lineId)
    .reduce((sum, line) => sum + (Number(line.quantity) || 0), 0)
  return roundQuantity(total)
}

export function receivingStatus(invoice, receipts) {
  const lines = invoice.lines || []
  if (lines.length === 0) return 'not_received'
  const received = lines.map((line) => receivedQtyForLine(receipts, invoice.id, line.id))
  if (received.every((quantity) => quantity <= 0)) return 'not_received'
  const fullyReceived = lines.every(
    (line, index) => received[index] >= roundQuantity(line.quantity),
  )
  return fullyReceived ? 'full' : 'partial'
}

export function invoiceHasReceipts(invoiceId, receipts = getAll(COLLECTIONS.RECEIVING_RECORDS)) {
  return receipts.some((receipt) => receipt.invoiceId === invoiceId)
}

export function supplierHasInvoices(supplierId) {
  return getAll(COLLECTIONS.PURCHASE_INVOICES).some((invoice) => invoice.supplierId === supplierId)
}

function invoiceNumberTaken(invoices, supplierId, invoiceNumber, excludeId) {
  const normalized = invoiceNumber.trim().toLowerCase()
  return invoices.some(
    (invoice) =>
      invoice.id !== excludeId &&
      invoice.supplierId === supplierId &&
      invoice.invoiceNumber.trim().toLowerCase() === normalized,
  )
}

function lineErrorCount(lineErrors) {
  if (!lineErrors) return 0
  if (Array.isArray(lineErrors)) {
    return lineErrors.filter((error) => error && Object.keys(error).length > 0).length
  }
  return Object.keys(lineErrors).length
}

export function hasErrors(errors) {
  if (!errors) return false
  const { lineErrors, ...rest } = errors
  if (Object.values(rest).some(Boolean)) return true
  return lineErrorCount(lineErrors) > 0
}

export function validateInvoice(draft, invoices = getAll(COLLECTIONS.PURCHASE_INVOICES)) {
  const errors = {}
  if (!draft.supplierId) errors.supplierId = 'Choose a supplier.'

  const invoiceNumber = (draft.invoiceNumber || '').trim()
  if (!invoiceNumber) errors.invoiceNumber = 'Enter an invoice number.'
  else if (
    draft.supplierId &&
    invoiceNumberTaken(invoices, draft.supplierId, invoiceNumber, draft.id)
  ) {
    errors.invoiceNumber = 'This supplier already has an invoice with that number.'
  }

  if (!draft.invoiceDate) errors.invoiceDate = 'Enter an invoice date.'

  if (!draft.lines?.length) {
    errors.lines = 'Add at least one line.'
    return errors
  }

  const lineErrors = draft.lines.map((line) => {
    const lineError = {}
    if (!line.itemId) lineError.itemId = 'Choose an item.'
    const quantity = Number(line.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) lineError.quantity = 'Quantity must be greater than 0.'
    const unitPrice = Number(line.unitPrice)
    if (!Number.isFinite(unitPrice) || unitPrice < 0) lineError.unitPrice = 'Unit price must be 0 or more.'
    return lineError
  })

  if (lineErrorCount(lineErrors)) errors.lineErrors = lineErrors
  return errors
}

function normalizeInvoice(draft) {
  return {
    supplierId: draft.supplierId,
    invoiceNumber: draft.invoiceNumber.trim(),
    invoiceDate: draft.invoiceDate,
    dueDate: draft.dueDate || '',
    paymentTerms: (draft.paymentTerms || '').trim(),
    notes: (draft.notes || '').trim(),
    amountPaid: 0,
    lines: draft.lines.map((line) => ({
      id: line.id || generateId('line'),
      itemId: line.itemId,
      quantity: roundQuantity(line.quantity),
      unitPrice: cents(line.unitPrice) / 100,
    })),
  }
}

function sameLines(left = [], right = []) {
  if (left.length !== right.length) return false
  return left.every((line, index) => {
    const other = right[index]
    return (
      line.id === other.id &&
      line.itemId === other.itemId &&
      roundQuantity(line.quantity) === roundQuantity(other.quantity) &&
      cents(line.unitPrice) === cents(other.unitPrice)
    )
  })
}

export async function saveInvoice(draft) {
  const invoices = getAll(COLLECTIONS.PURCHASE_INVOICES)
  const errors = validateInvoice(draft, invoices)
  if (hasErrors(errors)) return { ok: false, errors }

  const payload = normalizeInvoice(draft)
  if (draft.id && invoiceHasReceipts(draft.id)) {
    const existing = invoices.find((invoice) => invoice.id === draft.id)
    const linesChanged = !existing || !sameLines(existing.lines, payload.lines)
    const identityChanged =
      !existing ||
      existing.supplierId !== payload.supplierId ||
      existing.invoiceNumber !== payload.invoiceNumber
    if (linesChanged || identityChanged) {
      return {
        ok: false,
        errors: { form: 'Line items are locked because items have already been received.' },
      }
    }
  }

  try {
    const result = await callRpc('save_purchase_invoice', {
      invoice: { ...payload, id: draft.id || crypto.randomUUID() },
    })
    const invoice = getById(COLLECTIONS.PURCHASE_INVOICES, result.id)
    if (!invoice) return { ok: false, errors: { form: 'Invoice not found.' } }
    return { ok: true, invoice }
  } catch (error) {
    return { ok: false, errors: { form: error.message || 'The invoice could not be saved.' } }
  }
}

export function validateReceiving({ invoice, receipts, date, quantitiesByLineId }) {
  const errors = {}
  if (!date) errors.date = 'Enter a receipt date.'

  const lineErrors = {}
  let anyQuantity = false
  for (const line of invoice.lines || []) {
    const raw = quantitiesByLineId[line.id]
    if (raw === '' || raw === null || raw === undefined) {
      lineErrors[line.id] = 'Enter a quantity. Use 0 to skip this line.'
      continue
    }
    const quantity = Number(raw)
    if (!Number.isFinite(quantity) || quantity < 0) {
      lineErrors[line.id] = 'Receive quantity must be 0 or more.'
      continue
    }
    const receive = roundQuantity(quantity)
    const remaining = roundQuantity(line.quantity - receivedQtyForLine(receipts, invoice.id, line.id))
    if (receive > remaining) {
      lineErrors[line.id] = `You can receive up to ${remaining}.`
      continue
    }
    if (receive > 0) anyQuantity = true
  }

  if (!anyQuantity && Object.keys(lineErrors).length === 0) {
    errors.form = 'Enter a receive quantity for at least one line.'
  }
  if (Object.keys(lineErrors).length) errors.lineErrors = lineErrors
  return errors
}

export async function createReceiving({ invoiceId, date, quantitiesByLineId }) {
  const invoice = getById(COLLECTIONS.PURCHASE_INVOICES, invoiceId)
  if (!invoice) return { ok: false, errors: { form: 'Invoice not found.' } }

  const receipts = getAll(COLLECTIONS.RECEIVING_RECORDS).filter((receipt) => receipt.invoiceId === invoiceId)
  const errors = validateReceiving({ invoice, receipts, date, quantitiesByLineId })
  if (hasErrors(errors)) return { ok: false, errors }

  const lines = (invoice.lines || [])
    .map((line) => ({
      invoiceLineId: line.id,
      itemId: line.itemId,
      quantity: roundQuantity(quantitiesByLineId[line.id]),
      unitPrice: Number(line.unitPrice) || 0,
    }))
    .filter((line) => line.quantity > 0)

  const receipt = {
    id: crypto.randomUUID(),
    invoiceId,
    date,
    lines: lines.map((line) => ({
      id: crypto.randomUUID(),
      invoiceLineId: line.invoiceLineId,
      itemId: line.itemId,
      quantity: line.quantity,
    })),
  }
  try {
    const journal = receivingDraft({ receipt, invoice, items: getAll(COLLECTIONS.ITEMS) })
    await callRpc('receive_items', { receipt, journal })
    return { ok: true, receipt: getById(COLLECTIONS.RECEIVING_RECORDS, receipt.id) || receipt }
  } catch (error) {
    return { ok: false, errors: { form: error.message || 'The receipt could not be saved.' } }
  }
}

export function postReceiptJournal(receipt, journalIds) {
  const invoice = getById(COLLECTIONS.PURCHASE_INVOICES, receipt.invoiceId)
  const items = getAll(COLLECTIONS.ITEMS)
  return postDraft(receivingDraft({ receipt, invoice, items }), journalIds)
}

export async function recordSupplierPayment(invoiceId, draft) {
  const errors = {}
  const invoice = getById(COLLECTIONS.PURCHASE_INVOICES, invoiceId)
  if (!invoice) return { ok: false, errors: { form: 'Invoice not found.' } }
  const balance = supplierBalance(invoice)
  if (toCentavos(balance) <= 0) return { ok: false, errors: { form: 'This invoice has no balance left to pay.' } }
  if (!draft.date) errors.date = 'Choose a date.'
  if (!PAYMENT_METHODS.some((method) => method.id === draft.method)) errors.method = 'Choose a payment method.'
  const amount = Number(draft.amount)
  if (draft.amount === '' || !Number.isFinite(amount) || amount <= 0) errors.amount = 'Enter an amount greater than 0.'
  else if (toCentavos(amount) > toCentavos(balance)) errors.amount = `Amount cannot be more than the balance of ${round2(balance)}.`
  if (Object.keys(errors).length) return { ok: false, errors }

  const payment = {
    id: crypto.randomUUID(),
    invoiceId,
    date: draft.date,
    method: draft.method,
    amount: round2(amount),
    reference: (draft.reference || '').trim(),
  }
  try {
    await callRpc('record_supplier_payment', { payment, journal: supplierPaymentDraft(payment, invoice) })
    return { ok: true, payment }
  } catch (error) {
    return { ok: false, errors: { form: error.message || 'The payment could not be saved.' } }
  }
}

export function migrateSupplierPayments() {
  return Promise.resolve()
}

export function movementReference(movement, receipts, invoices) {
  if (movement.referenceType === 'receiving') {
    const receipt = receipts.find((entry) => entry.id === movement.referenceId)
    const invoice = receipt && invoices.find((entry) => entry.id === receipt.invoiceId)
    return invoice ? `Invoice ${invoice.invoiceNumber}` : 'Receipt'
  }
  if (movement.referenceType === 'production_batch' || movement.referenceType === 'production_reversal') {
    const batch = getAll(COLLECTIONS.PRODUCTION_BATCHES).find((entry) => entry.id === movement.referenceId)
    const number = batch?.batchNumber || 'Batch'
    return movement.referenceType === 'production_reversal' ? `Reversal ${number}` : number
  }
  if (movement.referenceType === 'sale' || movement.referenceType === 'sale_reversal') {
    const sale = getAll(COLLECTIONS.SALES).find((entry) => entry.id === movement.referenceId)
    const number = sale?.saleNumber || 'Sale'
    return movement.referenceType === 'sale_reversal' ? `Reversal ${number}` : number
  }
  if (movement.referenceType === 'adjustment') return 'Adjustment'
  if (movement.reference) return String(movement.reference)
  return '—'
}
