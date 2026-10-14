import { addDaysISO } from '../utils/aging'
import { formatCurrency, formatQuantity, nowLocalISO, todayISODate } from '../utils/format'
import { generateId } from '../utils/id'
import { getStockOnHand, roundQuantity } from '../utils/inventory'
import { round2 } from '../utils/money'
import { roundMoney } from '../utils/sales'
import { ensureChartOfAccounts } from './accounts'
import { saveExpense } from './expenses'
import { postCapitalContribution, postMissingEntries } from './journal'
import { prepareBatchLines, saveBatch, saveRecipe } from './production'
import { postAdjustment } from './movements'
import { createReceiving, invoiceAmountPaid, receivedValue, recordSupplierPayment, saveInvoice } from './purchasing'
import { completeOrder, completeSale, createOrder, recordPayment, saveCustomer } from './sales'
import { setDemoMode } from './demoFlag'
import { COLLECTIONS } from './seed'
import { add, getAll, update } from './storage'

const DEMO_SUPPLIER = 'Sample Egg Supplier'
const DEMO_BATCH = 'DEMO-BUKO-10'
const DEMO_CUSTOMER = 'Sample Customer'
const DEMO_POS = 'DEMO-POS-3'
const DEMO_ORDER = 'DEMO-ORD-2'
const DEMO_ORDER_SALE = 'DEMO-ORDER-2'
const DEMO_LATER = 'DEMO-LATER-1'
const EGG_COST = 8
const FLOUR_COST = 40
const PIE_PRICE = 250

async function ensureSupplier() {
  const suppliers = getAll(COLLECTIONS.SUPPLIERS)
  const existing = suppliers.find((supplier) => supplier.name.trim().toLowerCase() === DEMO_SUPPLIER.toLowerCase())
  if (existing) return { supplier: existing, added: false }
  const supplier = await add(COLLECTIONS.SUPPLIERS, {
    id: generateId('supplier'),
    name: DEMO_SUPPLIER,
    contactPerson: '',
    phone: '',
    address: '',
    notes: '',
    createdAt: new Date().toISOString(),
  })
  return { supplier, added: true }
}

async function ensureItem({ id, name, category, unit, reorderLevel }) {
  const items = getAll(COLLECTIONS.ITEMS)
  const existing =
    items.find((item) => item.id === id) ||
    items.find((item) => item.category === category && item.name.trim().toLowerCase() === name.toLowerCase())
  if (existing) return existing
  return await add(COLLECTIONS.ITEMS, {
    id,
    name,
    category,
    unit,
    reorderLevel,
    createdAt: new Date().toISOString(),
  })
}

function demoPurchaseMovement(itemId) {
  return getAll(COLLECTIONS.STOCK_MOVEMENTS).find(
    (movement) => movement.itemId === itemId && movement.type === 'purchase' && movement.notes === 'Demo receipt for the Buko Pie batch',
  )
}

function purchaseQuantity(item, needed, emptyPurchase) {
  const movement = demoPurchaseMovement(item.id)
  if (movement) return roundQuantity(movement.quantityIn)
  const onHand = getStockOnHand(item.id)
  if (onHand >= needed) return 0
  return roundQuantity(onHand === 0 ? emptyPurchase : needed - onHand)
}

async function ensurePurchase({ invoiceNumber, supplier, item, quantity, unitCost, dueDate }) {
  if (quantity <= 0) return { ok: true, invoice: null, receivedNow: false }
  let invoice = getAll(COLLECTIONS.PURCHASE_INVOICES).find((entry) => entry.invoiceNumber === invoiceNumber)
  if (!invoice) {
    const saved = await saveInvoice({
      supplierId: supplier.id,
      invoiceNumber,
      invoiceDate: todayISODate(),
      dueDate,
      lines: [{ itemId: item.id, quantity, unitPrice: unitCost }],
    })
    if (!saved.ok) return { ok: false, error: saved.errors.form || saved.errors.invoiceNumber || 'The invoice was not saved.' }
    invoice = saved.invoice
  }
  if (getAll(COLLECTIONS.RECEIVING_RECORDS).some((receipt) => receipt.invoiceId === invoice.id)) {
    return { ok: true, invoice, receivedNow: false }
  }
  if (demoPurchaseMovement(item.id)) {
    return { ok: true, invoice, receivedNow: false }
  }
  const received = await createReceiving({
    invoiceId: invoice.id,
    date: todayISODate(),
    quantitiesByLineId: { [invoice.lines[0].id]: invoice.lines[0].quantity },
  })
  if (!received.ok) return { ok: false, error: received.errors.form || 'The receipt was not saved.' }
  return { ok: true, invoice, receivedNow: true, quantity: invoice.lines[0].quantity }
}

async function ensureProduction() {
  const { supplier, added: supplierAdded } = await ensureSupplier()
  const eggs = await ensureItem({ id: 'item-eggs', name: 'Eggs', category: 'raw_material', unit: 'pc', reorderLevel: 24 })
  const flour = await ensureItem({ id: 'item-flour', name: 'Flour', category: 'raw_material', unit: 'kg', reorderLevel: 5 })
  const pie = await ensureItem({ id: 'item-buko-pie', name: 'Buko Pie', category: 'finished_good', unit: 'pc', reorderLevel: 4 })
  let recipe =
    getAll(COLLECTIONS.RECIPES).find((entry) => entry.id === 'recipe-buko-pie') ||
    getAll(COLLECTIONS.RECIPES).find((entry) => entry.name.trim().toLowerCase() === 'buko pie')
  if (!recipe) {
    const savedRecipe = await saveRecipe({
      name: 'Buko Pie',
      finishedItemId: pie.id,
      yieldQuantity: 1,
      notes: '',
      ingredients: [
        { itemId: eggs.id, quantity: 2 },
        { itemId: flour.id, quantity: 3 },
      ],
    })
    if (!savedRecipe.ok) return { ok: false, pie, message: savedRecipe.errors?.form || 'The Buko Pie recipe was not saved.' }
    recipe = savedRecipe.recipe
  }
  if (getStockOnHand(flour.id) <= 0) {
    const opening = await postAdjustment({
      itemId: flour.id,
      date: '2026-10-01',
      quantityChange: 20,
      reason: 'Opening balance',
    })
    if (!opening.ok) return { ok: false, pie, message: opening.errors?.form || 'The flour opening balance was not saved.' }
  }

  const supplierSentence = supplierAdded ? 'Sample Egg Supplier was added.' : 'Sample Egg Supplier is ready.'
  const dueDate = addDaysISO(todayISODate(), 7)
  const eggPurchase = await ensurePurchase({
    invoiceNumber: 'DEMO-EGGS',
    supplier,
    item: eggs,
    quantity: purchaseQuantity(eggs, 20, 100),
    unitCost: EGG_COST,
    dueDate,
  })
  if (!eggPurchase.ok) return { ok: false, pie, message: `${supplierSentence} ${eggPurchase.error}` }
  const flourPurchase = await ensurePurchase({
    invoiceNumber: 'DEMO-FLOUR',
    supplier,
    item: flour,
    quantity: purchaseQuantity(flour, 30, 30),
    unitCost: FLOUR_COST,
    dueDate,
  })
  if (!flourPurchase.ok) return { ok: false, pie, message: `${supplierSentence} ${flourPurchase.error}` }
  const receipts = []
  if (eggPurchase.receivedNow) receipts.push(`${formatQuantity(eggPurchase.quantity)} eggs at ${formatCurrency(EGG_COST)} each`)
  if (flourPurchase.receivedNow) receipts.push(`${formatQuantity(flourPurchase.quantity)} ${flour.unit} flour at ${formatCurrency(FLOUR_COST)} per ${flour.unit}`)
  const purchaseSentence = receipts.length ? `Received ${receipts.join(' and ')}.` : 'Eggs and flour already had enough stock.'
  const existing = getAll(COLLECTIONS.PRODUCTION_BATCHES).find((batch) => batch.batchNumber === DEMO_BATCH)
  if (existing) {
    return {
      ok: true,
      pie,
      message: `${supplierSentence} ${purchaseSentence} Demo batch ${DEMO_BATCH} is already ${existing.status === 'cancelled' ? 'cancelled' : 'posted'}.`,
    }
  }

  const result = await saveBatch({
    batchNumber: DEMO_BATCH,
    date: todayISODate(),
    recipeId: recipe.id,
    quantityProduced: 10,
    notes: 'Demo batch of 10 Buko Pies',
    laborCost: 0,
    overheadCost: 0,
    lines: prepareBatchLines(recipe, 10),
  })
  if (!result.ok) {
    return { ok: false, pie, message: `${supplierSentence} ${purchaseSentence} The 10-pie batch was not posted: ${result.errors.form || 'check the recipe and stock.'}` }
  }
  return {
    ok: true,
    pie,
    message: `${supplierSentence} ${purchaseSentence} Posted ${DEMO_BATCH}: 10 Buko Pies. Cost per pie is ${formatCurrency(result.batch.costPerUnit)}.`,
  }
}

async function ensurePrice(pie) {
  if (pie.sellingPrice != null && pie.sellingPrice !== '') return { price: Number(pie.sellingPrice), note: '' }
  await update(COLLECTIONS.ITEMS, pie.id, { sellingPrice: PIE_PRICE })
  return { price: PIE_PRICE, note: `Selling price set to ${formatCurrency(PIE_PRICE)}.` }
}

async function ensureCustomer() {
  const existing = getAll(COLLECTIONS.CUSTOMERS).find((customer) => customer.name.trim().toLowerCase() === DEMO_CUSTOMER.toLowerCase())
  if (existing) return existing
  return (await saveCustomer({
    name: DEMO_CUSTOMER,
    phone: '0917 000 0000',
    address: 'Santa Rosa, Laguna',
    notes: 'Demo customer',
  })).customer
}

async function ensureSales(pie) {
  const { price, note: priceNote } = await ensurePrice(pie)
  const customer = await ensureCustomer()
  const today = todayISODate()
  const soldAt = nowLocalISO()
  const notes = []
  if (priceNote) notes.push(priceNote)

  const sales = () => getAll(COLLECTIONS.SALES)
  const orders = () => getAll(COLLECTIONS.ORDERS)
  const payments = () => getAll(COLLECTIONS.PAYMENTS)
  const pos = sales().find((sale) => sale.saleNumber === DEMO_POS)
  const order = orders().find((entry) => entry.orderNumber === DEMO_ORDER)
  const later = sales().find((sale) => sale.saleNumber === DEMO_LATER)
  const laterPaid = later && payments().some((payment) => payment.saleId === later.id && payment.amount > 0)
  if (pos && order?.status === 'completed' && laterPaid) {
    return `${priceNote} Demo sales are already posted: 3 cash, an order of 2, and a pay-later sale with a partial payment. Buko Pie on hand is ${formatQuantity(getStockOnHand(pie.id))}. Loading the demo again does not sell more.`
  }

  if (!pos) {
    const result = await completeSale({
      saleNumber: DEMO_POS,
      date: today,
      soldAt,
      customerId: null,
      source: 'pos',
      lines: [{ itemId: pie.id, quantity: 3, unitPrice: price }],
      discount: { type: 'amount', value: 0 },
      payLater: false,
      payment: { method: 'cash', amountReceived: roundMoney(price * 3), date: today },
    })
    if (!result.ok) return `${notes.join(' ')} Cash sale of 3 was not posted: ${result.errors.form || 'check stock.'}`.trim()
    notes.push(`Cash sale ${DEMO_POS} for 3 pies is paid.`)
  }

  let openOrder = orders().find((entry) => entry.orderNumber === DEMO_ORDER)
  if (!openOrder) {
    const created = await createOrder({
      orderNumber: DEMO_ORDER,
      customerId: customer.id,
      orderDate: today,
      fulfillmentDate: today,
      fulfillmentType: 'pickup',
      notes: 'Demo order for 2 Buko Pies',
      lines: [{ itemId: pie.id, quantity: 2, unitPrice: price }],
      discount: { type: 'amount', value: 0 },
      downPayment: { amount: roundMoney(price), method: 'cash', date: today },
    })
    if (!created.ok) return `${notes.join(' ')} The order was not created: ${created.errors.form || 'check the order.'}`.trim()
    openOrder = created.order
  }
  if (openOrder.status !== 'completed' && openOrder.status !== 'cancelled') {
    const paid = roundMoney(
      payments()
        .filter((payment) => payment.orderId === openOrder.id)
        .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0),
    )
    const balance = roundMoney(Math.max(0, openOrder.total - paid))
    const completed = await completeOrder(openOrder.id, {
      saleNumber: DEMO_ORDER_SALE,
      amount: Math.max(0, balance),
      method: 'cash',
      date: today,
      soldAt,
    })
    if (!completed.ok) return `${notes.join(' ')} The order could not be completed: ${completed.errors.form || 'check stock.'}`.trim()
    notes.push(`Order ${DEMO_ORDER} for 2 pies was completed as ${completed.sale.saleNumber} with a down payment.`)
  }

  let laterSale = sales().find((sale) => sale.saleNumber === DEMO_LATER)
  if (!laterSale) {
    const result = await completeSale({
      saleNumber: DEMO_LATER,
      date: today,
      soldAt,
      customerId: customer.id,
      source: 'pos',
      lines: [{ itemId: pie.id, quantity: 1, unitPrice: price }],
      discount: { type: 'amount', value: 0 },
      payLater: true,
    })
    if (!result.ok) return `${notes.join(' ')} Pay later sale was not posted: ${result.errors.form || 'check stock.'}`.trim()
    laterSale = result.sale
  }
  if (laterSale.total > 0 && !payments().some((payment) => payment.saleId === laterSale.id && payment.amount > 0)) {
    const partial = await recordPayment(laterSale.id, {
      amount: roundMoney(laterSale.total / 2),
      method: 'gcash',
      date: today,
    })
    if (!partial.ok) return `${notes.join(' ')} Partial payment was not recorded: ${partial.errors.form || partial.errors.amount || 'check the balance.'}`.trim()
    notes.push(`Pay later sale ${DEMO_LATER} for 1 pie has a partial GCash payment.`)
  }

  notes.push(`Buko Pie on hand is ${formatQuantity(getStockOnHand(pie.id))}.`)
  return notes.join(' ')
}

async function ensureExpense(draft, label) {
  if (getAll(COLLECTIONS.EXPENSES).some((expense) => expense.reference === draft.reference)) return ''
  const saved = await saveExpense(draft)
  if (!saved.ok) return `${label} was not saved: ${saved.errors.form || saved.errors.amount || 'check the expense.'}`
  return `${label} was added.`
}

async function ensureBooks() {
  await ensureChartOfAccounts()
  const today = todayISODate()
  const notes = []
  const capital = await postCapitalContribution(today, 10000)
  if (!capital.ok) return capital.error
  if (!capital.skipped) notes.push("Owner's capital of ₱10,000.00 was posted to cash.")
  const missing = await postMissingEntries()
  if (missing.posted) notes.push(`Posted ${missing.posted} missing journal ${missing.posted === 1 ? 'entry' : 'entries'}.`)
  if (missing.errors.length) notes.push(missing.errors[0])

  const invoice = getAll(COLLECTIONS.PURCHASE_INVOICES).find((entry) => entry.invoiceNumber === 'DEMO-EGGS')
  const alreadyPaid = getAll(COLLECTIONS.SUPPLIER_PAYMENTS).some((payment) => payment.reference === 'DEMO-EGG-PAY')
  if (invoice && !alreadyPaid) {
    const amount = round2(round2(receivedValue(invoice) / 2) - invoiceAmountPaid(invoice.id))
    if (amount > 0) {
      const paid = await recordSupplierPayment(invoice.id, { amount, method: 'cash', date: today, reference: 'DEMO-EGG-PAY' })
      if (!paid.ok) notes.push(paid.errors.form || paid.errors.amount || 'The egg payment was not recorded.')
      else notes.push(`Paid ${formatCurrency(amount)} of invoice DEMO-EGGS. The rest stays in accounts payable.`)
    }
  }

  notes.push(
    await ensureExpense(
      {
        date: today,
        payee: 'Meralco',
        category: '6020',
        description: 'Demo electricity bill',
        amount: 1500,
        method: 'cash',
        status: 'paid',
        reference: 'DEMO-UTILITIES',
        notes: '',
      },
      'Paid utilities',
    ),
  )
  notes.push(
    await ensureExpense(
      {
        date: today,
        payee: 'Landlord',
        category: '6010',
        description: 'Demo shop rent',
        amount: 8000,
        method: 'cash',
        status: 'unpaid',
        reference: 'DEMO-RENT',
        notes: '',
        dueDate: addDaysISO(today, -14),
      },
      'Unpaid rent',
    ),
  )
  const text = notes.filter(Boolean).join(' ')
  return text || 'Accounting entries are already posted.'
}

async function ensurePastDueRent() {
  const expense = getAll(COLLECTIONS.EXPENSES).find((entry) => entry.reference === 'DEMO-RENT')
  if (!expense?.dueDate) return ''
  return 'Unpaid rent is 14 days past due.'
}

async function ensurePieBox() {
  const items = getAll(COLLECTIONS.ITEMS)
  if (items.some((item) => item.id === 'item-pie-box' || item.name.trim().toLowerCase() === 'pie box')) return ''
  await ensureItem({ id: 'item-pie-box', name: 'Pie Box', category: 'packaging', unit: 'pc', reorderLevel: 12 })
  return 'Pie Box was added below its reorder level.'
}

async function ensureOpenOrder({ orderNumber, customerId, pie, fulfillmentDate, notes }) {
  if (getAll(COLLECTIONS.ORDERS).some((order) => order.orderNumber === orderNumber)) return ''
  const created = await createOrder({
    orderNumber,
    customerId,
    orderDate: todayISODate(),
    fulfillmentDate,
    fulfillmentType: 'pickup',
    notes,
    lines: [{ itemId: pie.id, quantity: 1, unitPrice: PIE_PRICE }],
    discount: { type: 'amount', value: 0 },
    downPayment: { amount: 0 },
  })
  if (!created.ok) return `${orderNumber} was not created.`
  return `Open order ${orderNumber} was added.`
}

async function ensureSignals(pie) {
  const notes = [await ensurePieBox(), await ensurePastDueRent()]
  const customer = getAll(COLLECTIONS.CUSTOMERS).find((entry) => entry.name.trim().toLowerCase() === DEMO_CUSTOMER.toLowerCase())
  if (customer && pie) {
    notes.push(await ensureOpenOrder({
      orderNumber: 'DEMO-SOON',
      customerId: customer.id,
      pie,
      fulfillmentDate: addDaysISO(todayISODate(), 2),
      notes: 'Demo order due in two days',
    }))
    notes.push(await ensureOpenOrder({
      orderNumber: 'DEMO-LATE',
      customerId: customer.id,
      pie,
      fulfillmentDate: addDaysISO(todayISODate(), -1),
      notes: 'Demo order past its pickup date',
    }))
  }
  return notes.filter(Boolean).join(' ')
}

export async function loadDemoData() {
  if (getAll(COLLECTIONS.SALES).length || getAll(COLLECTIONS.PURCHASE_INVOICES).length || getAll(COLLECTIONS.JOURNAL_ENTRIES).length) {
    return { message: 'Demo data was not loaded because this database already has a sale, invoice, or journal entry.' }
  }
  setDemoMode(true)
  try {
    await ensureChartOfAccounts()
    const production = await ensureProduction()
    if (!production.ok) return { message: production.message }
    return { message: `${production.message} ${await ensureSales(production.pie)} ${await ensureBooks()} ${await ensureSignals(production.pie)}`.replace(/\s+/g, ' ').trim() }
  } finally {
    setDemoMode(false)
  }
}
