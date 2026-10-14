import { COLLECTIONS } from './seed'
import { add, getAll } from './storage'
import { saveRecipe } from './production'
import { createReceiving, saveInvoice, recordSupplierPayment } from './purchasing'
import { completeSale, createOrder, saveCustomer } from './sales'
import { saveExpense } from './expenses'
import { postAdjustment } from './movements'
import { saveManualEntry } from './journal'

const idMap = new Map()

function mapId(value) {
  if (!value) return null
  if (!idMap.has(value)) idMap.set(value, crypto.randomUUID())
  return idMap.get(value)
}

function rows(data, name) {
  return Array.isArray(data?.[name]) ? data[name] : []
}

/**
 * Optional. Replaying old browser data through the accounting functions is
 * riskier than starting fresh: a partial file, or movements that are also
 * implied by invoices and sales, can double stock or reject a locked date.
 * Purchase, sale, and production movements are skipped because the document
 * functions create them.
 */
export async function importLocalData(data) {
  const notes = []
  idMap.clear()

  for (const item of rows(data, COLLECTIONS.ITEMS)) {
    const saved = await add(COLLECTIONS.ITEMS, { ...item, id: mapId(item.id) })
    idMap.set(item.id, saved.id)
  }
  for (const supplier of rows(data, COLLECTIONS.SUPPLIERS)) {
    const saved = await add(COLLECTIONS.SUPPLIERS, { ...supplier, id: mapId(supplier.id) })
    idMap.set(supplier.id, saved.id)
  }
  for (const customer of rows(data, COLLECTIONS.CUSTOMERS)) {
    const saved = await saveCustomer({ ...customer, id: undefined, name: customer.name, phone: customer.phone, address: customer.address, notes: customer.notes })
    if (saved.ok) idMap.set(customer.id, saved.customer.id)
    else notes.push(saved.errors?.form || saved.message || `Customer ${customer.name} was skipped.`)
  }

  for (const recipe of rows(data, COLLECTIONS.RECIPES)) {
    const saved = await saveRecipe({
      name: recipe.name,
      finishedItemId: mapId(recipe.finishedItemId),
      yieldQuantity: recipe.yieldQuantity,
      notes: recipe.notes,
      ingredients: (recipe.ingredients || []).map((line) => ({ itemId: mapId(line.itemId), quantity: line.quantity })),
    })
    if (saved.ok) idMap.set(recipe.id, saved.recipe.id)
    else notes.push(saved.errors?.form || `Recipe ${recipe.name} was skipped.`)
  }

  for (const invoice of rows(data, COLLECTIONS.PURCHASE_INVOICES)) {
    const saved = await saveInvoice({
      supplierId: mapId(invoice.supplierId),
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      paymentTerms: invoice.paymentTerms,
      notes: invoice.notes,
      lines: (invoice.lines || []).map((line) => ({
        itemId: mapId(line.itemId),
        quantity: line.quantity,
        unitPrice: line.unitPrice,
      })),
    })
    if (!saved.ok) {
      notes.push(saved.errors?.form || `Invoice ${invoice.invoiceNumber} was skipped.`)
      continue
    }
    idMap.set(invoice.id, saved.invoice.id)
    for (const line of invoice.lines || []) {
      const match = (saved.invoice.lines || []).find((entry) => entry.itemId === mapId(line.itemId))
      if (match) idMap.set(line.id, match.id)
    }
  }

  for (const receipt of rows(data, COLLECTIONS.RECEIVING_RECORDS)) {
    const quantitiesByLineId = {}
    for (const line of receipt.lines || []) quantitiesByLineId[mapId(line.invoiceLineId)] = line.quantity
    const saved = await createReceiving({ invoiceId: mapId(receipt.invoiceId), date: receipt.date, quantitiesByLineId })
    if (!saved.ok) notes.push(saved.errors?.form || 'A receipt was skipped.')
  }

  for (const payment of rows(data, COLLECTIONS.SUPPLIER_PAYMENTS)) {
    const saved = await recordSupplierPayment(mapId(payment.invoiceId), payment)
    if (!saved.ok) notes.push(saved.errors?.form || 'A supplier payment was skipped.')
  }

  for (const batch of rows(data, COLLECTIONS.PRODUCTION_BATCHES).filter((entry) => entry.status !== 'cancelled')) {
    const saved = await saveBatch({
      ...batch,
      recipeId: mapId(batch.recipeId),
      lines: (batch.lines || []).map((line) => ({ ...line, itemId: mapId(line.itemId) })),
    })
    if (!saved.ok) notes.push(saved.errors?.form || `Batch ${batch.batchNumber} was skipped.`)
  }

  for (const sale of rows(data, COLLECTIONS.SALES).filter((entry) => entry.status !== 'voided' && entry.source !== 'order')) {
    const saved = await completeSale({
      ...sale,
      customerId: mapId(sale.customerId),
      lines: (sale.lines || []).map((line) => ({ itemId: mapId(line.itemId), quantity: line.quantity, unitPrice: line.unitPrice })),
      discount: { type: sale.discountType, value: sale.discountValue },
      payLater: true,
    })
    if (!saved.ok) notes.push(saved.errors?.form || `Sale ${sale.saleNumber} was skipped.`)
  }

  for (const order of rows(data, COLLECTIONS.ORDERS).filter((entry) => entry.status !== 'cancelled' && entry.status !== 'completed')) {
    const saved = await createOrder({
      ...order,
      customerId: mapId(order.customerId),
      lines: (order.lines || []).map((line) => ({ itemId: mapId(line.itemId), quantity: line.quantity, unitPrice: line.unitPrice })),
      discount: { type: order.discountType, value: order.discountValue },
      downPayment: { amount: 0 },
    })
    if (!saved.ok) notes.push(saved.errors?.form || `Order ${order.orderNumber} was skipped.`)
  }

  for (const expense of rows(data, COLLECTIONS.EXPENSES).filter((entry) => entry.status !== 'voided')) {
    const saved = await saveExpense(expense)
    if (!saved.ok) notes.push(saved.errors?.form || `Expense ${expense.reference || expense.payee} was skipped.`)
  }

  for (const movement of rows(data, COLLECTIONS.STOCK_MOVEMENTS).filter((entry) => entry.type === 'adjustment')) {
    const change = (Number(movement.quantityIn) || 0) - (Number(movement.quantityOut) || 0)
    if (!change) continue
    const saved = await postAdjustment({
      itemId: mapId(movement.itemId),
      date: movement.date,
      quantityChange: change,
      reason: movement.notes || 'Imported adjustment',
    })
    if (!saved.ok) notes.push(saved.errors?.form || 'An adjustment was skipped.')
  }

  for (const entry of rows(data, COLLECTIONS.JOURNAL_ENTRIES).filter((row) => row.sourceType === 'manual' && !row.reversalOfId)) {
    const saved = await saveManualEntry({
      date: entry.date,
      description: entry.description,
      lines: (entry.lines || []).map((line) => ({
        accountId: getAll(COLLECTIONS.ACCOUNTS).find((account) => account.id === line.accountId)?.id || '',
        debit: line.debit,
        credit: line.credit,
        memo: line.memo,
      })),
    })
    if (!saved.ok) notes.push(saved.errors?.form || `Journal ${entry.entryNumber} was skipped.`)
  }

  return {
    message: notes.length
      ? `Import finished with skips. ${notes[0]}`
      : 'Import finished. Review the trial balance before you lock the books.',
  }
}
