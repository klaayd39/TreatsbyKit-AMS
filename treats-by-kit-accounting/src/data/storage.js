/**
 * Collection cache backed by Supabase.
 * Reads stay synchronous after hydrate() so existing screens can keep calling
 * getAll during render. Writes are asynchronous.
 */
import { isDemoMode } from './demoFlag'
import { reportFailure } from './errors'
import { getSupabase } from '../lib/supabase'

export const STORAGE_PREFIX = 'tbk.'
export const PAGE_SIZE = 50
export const SETTINGS_ID = '00000000-0000-4000-8000-000000000001'

const cache = new Map()
const listeners = new Set()

const NUMERIC = new Set([
  'reorderLevel', 'sellingPrice', 'quantity', 'unitPrice', 'amount', 'quantityIn', 'quantityOut', 'unitCost',
  'yieldQuantity', 'expectedQty', 'actualQty', 'wasteQty', 'quantityProduced', 'laborCost', 'overheadCost',
  'ingredientCost', 'wasteCost', 'totalCost', 'costPerUnit', 'subtotal', 'discountValue', 'discountAmount',
  'total', 'cogsTotal', 'grossProfit', 'lineTotal', 'revenue', 'cogs', 'tendered', 'changeDue',
  'lowStockDefault', 'varianceThreshold', 'debit', 'credit', 'quantityOnHand',
])

const SIMPLE = {
  items: 'items',
  suppliers: 'suppliers',
  customers: 'customers',
  accounts: 'accounts',
}

export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emit() {
  for (const listener of listeners) listener()
}

export function getAll(collection) {
  return cache.get(collection) || []
}

export function getById(collection, id) {
  return getAll(collection).find((record) => record.id === id) ?? null
}

export function replaceCollection(collection, rows) {
  cache.set(collection, rows)
  emit()
}

export function storageKey(collection) {
  return `${STORAGE_PREFIX}${collection}`
}

function camelRow(row) {
  if (!row || typeof row !== 'object') return row
  const out = {}
  for (const [key, value] of Object.entries(row)) {
    const name = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
    if (typeof value === 'string' && NUMERIC.has(name)) out[name] = Number(value)
    else if (value === null && ['notes', 'phone', 'address', 'description', 'reference', 'paymentTerms', 'contactPerson'].includes(name)) out[name] = ''
    else out[name] = value
  }
  return out
}

function asUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '')
    ? value
    : crypto.randomUUID()
}

function groupBy(rows, key) {
  const grouped = new Map()
  for (const row of rows) {
    const id = row[key]
    if (!grouped.has(id)) grouped.set(id, [])
    grouped.get(id).push(row)
  }
  return grouped
}

async function fetchTable(table, columns = '*') {
  const supabase = getSupabase()
  const rows = []
  const size = 1000
  for (let from = 0; ; from += size) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + size - 1)
    if (error) throw error
    rows.push(...(data || []).map(camelRow))
    if (!data || data.length < size) break
  }
  return rows
}

function nest(parents, children, foreignKey, field) {
  const grouped = groupBy(children, foreignKey)
  return parents.map((parent) => ({ ...parent, [field]: grouped.get(parent.id) || [] }))
}

async function loadWorkspace(role) {
  const settingsRows = await fetchTable('business_settings')
  cache.set('settings', settingsRows.map((row) => ({
    ...row,
    id: 'business',
    dbId: row.id,
    booksLockedThrough: row.booksLockedThrough || '',
  })))
  const notifications = await fetchTable('notification_states')
  cache.set('notificationState', notifications.map((row) => ({
    id: row.notificationKey,
    dbId: row.id,
    read: row.read,
    dismissed: row.dismissed,
    active: row.active,
    detected: row.detected || '',
  })))

  if (role === 'cashier') {
    const products = await fetchTable('v_pos_items')
    cache.set('items', products.map((item) => ({ ...item, reorderLevel: 0 })))
    const quantities = await fetchTable('v_stock_quantities')
    cache.set('stockMovements', quantities.map((movement) => ({ ...movement, unitCost: 0, notes: '' })))
    cache.set('customers', await fetchTable('customers'))
    const orders = await fetchTable('orders')
    const orderLines = await fetchTable('order_lines')
    cache.set('orders', nest(orders, orderLines, 'orderId', 'lines'))
    const sales = await fetchTable('v_cashier_sales')
    const saleLines = await fetchTable('v_cashier_sale_lines')
    cache.set('sales', nest(sales, saleLines, 'saleId', 'lines'))
    cache.set('payments', await fetchTable('sale_payments'))
    for (const name of ['suppliers', 'accounts', 'purchaseInvoices', 'receivingRecords', 'supplierPayments', 'recipes', 'productionBatches', 'expenses', 'journalEntries']) {
      cache.set(name, [])
    }
    return
  }

  cache.set('items', await fetchTable('items'))
  cache.set('suppliers', await fetchTable('suppliers'))
  cache.set('customers', await fetchTable('customers'))
  cache.set('accounts', await fetchTable('accounts'))
  cache.set('stockMovements', await fetchTable('stock_movements'))
  cache.set('expenses', await fetchTable('expenses'))
  cache.set('supplierPayments', await fetchTable('supplier_payments'))
  cache.set('payments', await fetchTable('sale_payments'))
  cache.set('purchaseInvoices', nest(await fetchTable('purchase_invoices'), await fetchTable('purchase_invoice_lines'), 'invoiceId', 'lines'))
  cache.set('receivingRecords', nest(await fetchTable('receiving_records'), await fetchTable('receiving_lines'), 'receiptId', 'lines'))
  cache.set('recipes', nest(await fetchTable('recipes'), await fetchTable('recipe_lines'), 'recipeId', 'ingredients'))
  cache.set('productionBatches', nest(await fetchTable('production_batches'), await fetchTable('production_batch_lines'), 'batchId', 'lines'))
  cache.set('orders', nest(await fetchTable('orders'), await fetchTable('order_lines'), 'orderId', 'lines'))
  cache.set('sales', nest(await fetchTable('sales'), await fetchTable('sale_lines'), 'saleId', 'lines'))
  cache.set('journalEntries', nest(await fetchTable('journal_entries'), await fetchTable('journal_lines'), 'entryId', 'lines'))
}

export async function hydrate(role) {
  await loadWorkspace(role)
  emit()
}

const REFRESH = {
  items: async (role) => { cache.set('items', role === 'cashier' ? (await fetchTable('v_pos_items')).map((item) => ({ ...item, reorderLevel: 0 })) : await fetchTable('items')) },
  suppliers: async () => cache.set('suppliers', await fetchTable('suppliers')),
  customers: async () => cache.set('customers', await fetchTable('customers')),
  accounts: async () => cache.set('accounts', await fetchTable('accounts')),
  stockMovements: async (role) => cache.set('stockMovements', role === 'cashier'
    ? (await fetchTable('v_stock_quantities')).map((movement) => ({ ...movement, unitCost: 0, notes: '' }))
    : await fetchTable('stock_movements')),
  expenses: async () => cache.set('expenses', await fetchTable('expenses')),
  supplierPayments: async () => cache.set('supplierPayments', await fetchTable('supplier_payments')),
  payments: async () => cache.set('payments', await fetchTable('sale_payments')),
  purchaseInvoices: async () => cache.set('purchaseInvoices', nest(await fetchTable('purchase_invoices'), await fetchTable('purchase_invoice_lines'), 'invoiceId', 'lines')),
  receivingRecords: async () => cache.set('receivingRecords', nest(await fetchTable('receiving_records'), await fetchTable('receiving_lines'), 'receiptId', 'lines')),
  recipes: async () => cache.set('recipes', nest(await fetchTable('recipes'), await fetchTable('recipe_lines'), 'recipeId', 'ingredients')),
  productionBatches: async () => cache.set('productionBatches', nest(await fetchTable('production_batches'), await fetchTable('production_batch_lines'), 'batchId', 'lines')),
  orders: async () => cache.set('orders', nest(await fetchTable('orders'), await fetchTable('order_lines'), 'orderId', 'lines')),
  sales: async (role) => cache.set('sales', role === 'cashier'
    ? nest(await fetchTable('v_cashier_sales'), await fetchTable('v_cashier_sale_lines'), 'saleId', 'lines')
    : nest(await fetchTable('sales'), await fetchTable('sale_lines'), 'saleId', 'lines')),
  journalEntries: async (role) => cache.set('journalEntries', role === 'cashier' ? [] : nest(await fetchTable('journal_entries'), await fetchTable('journal_lines'), 'entryId', 'lines')),
  settings: async () => {
    const rows = await fetchTable('business_settings')
    cache.set('settings', rows.map((row) => ({ ...row, id: 'business', dbId: row.id, booksLockedThrough: row.booksLockedThrough || '' })))
  },
  notificationState: async () => {
    const rows = await fetchTable('notification_states')
    cache.set('notificationState', rows.map((row) => ({
      id: row.notificationKey, dbId: row.id, read: row.read, dismissed: row.dismissed, active: row.active, detected: row.detected || '',
    })))
  },
}

let activeRole = 'viewer'

export function setActiveRole(role) {
  activeRole = role || 'viewer'
}

export async function refreshCollections(names) {
  for (const name of names || []) {
    if (REFRESH[name]) await REFRESH[name](activeRole)
  }
  emit()
}

export async function callRpc(name, payload) {
  const supabase = getSupabase()
  const body = { ...(payload || {}), isDemo: Boolean(payload?.isDemo || isDemoMode()) }
  const { data, error } = await supabase.rpc(name, { payload: body })
  if (error) throw new Error(reportFailure(error))
  if (data?.refresh) await refreshCollections(data.refresh)
  return data
}

function blankToNull(value) {
  return value === '' || value === undefined ? null : value
}

function simpleRow(collection, record) {
  const demo = Boolean(record.isDemo || isDemoMode())
  if (collection === 'items') {
    return {
      id: asUuid(record.id),
      name: record.name,
      category: record.category,
      unit: record.unit,
      reorder_level: record.reorderLevel ?? 0,
      selling_price: record.sellingPrice === '' || record.sellingPrice == null ? null : record.sellingPrice,
      is_demo: demo,
    }
  }
  if (collection === 'suppliers') {
    return {
      id: asUuid(record.id),
      name: record.name,
      contact_person: record.contactPerson || '',
      phone: record.phone || '',
      address: record.address || '',
      notes: record.notes || '',
      is_demo: demo,
    }
  }
  if (collection === 'customers') {
    return {
      id: asUuid(record.id),
      name: record.name,
      phone: record.phone || '',
      address: record.address || '',
      notes: record.notes || '',
      is_demo: demo,
    }
  }
  if (collection === 'accounts') {
    return {
      id: asUuid(record.id),
      code: record.code,
      name: record.name,
      type: record.type,
      normal_balance: record.normalBalance,
      description: record.description || '',
      active: record.active !== false,
      system: Boolean(record.system),
    }
  }
  return null
}

export async function add(collection, record) {
  const supabase = getSupabase()
  if (collection === 'notificationState') {
    const { data, error } = await supabase.from('notification_states').insert({
      notification_key: record.id,
      read: Boolean(record.read),
      dismissed: Boolean(record.dismissed),
      active: record.active !== false,
      detected: record.detected || '',
    }).select('id, notification_key, read, dismissed, active, detected').single()
    if (error) throw new Error(reportFailure(error))
    const saved = { id: data.notification_key, dbId: data.id, read: data.read, dismissed: data.dismissed, active: data.active, detected: data.detected || '' }
    cache.set(collection, [...getAll(collection), saved])
    emit()
    return saved
  }
  const row = simpleRow(collection, record)
  if (!row || !SIMPLE[collection]) throw new Error(`Cannot insert ${collection} directly.`)
  const { data, error } = await supabase.from(SIMPLE[collection]).insert(row).select('*').single()
  if (error) throw new Error(reportFailure(error))
  const saved = camelRow(data)
  cache.set(collection, [...getAll(collection), saved])
  emit()
  return saved
}

export async function update(collection, id, changes) {
  const supabase = getSupabase()
  if (collection === 'settings') {
    const current = getById('settings', 'business')
    const next = { ...current, ...changes, id: 'business' }
    const { error } = await supabase.from('business_settings').update({
      business_name: next.businessName ?? current?.businessName ?? 'Treats by Kit',
      address: next.address ?? '',
      contact: next.contact ?? '',
      receipt_footer: next.receiptFooter ?? '',
      currency: 'PHP',
      low_stock_default: next.lowStockDefault ?? 0,
      variance_threshold: next.varianceThreshold ?? 10,
      books_locked_through: blankToNull(next.booksLockedThrough),
    }).eq('id', SETTINGS_ID)
    if (error) throw new Error(reportFailure(error))
    cache.set('settings', [next])
    emit()
    return next
  }
  if (collection === 'notificationState') {
    const current = getById(collection, id)
    const next = { ...current, ...changes, id }
    const { error } = await supabase.from('notification_states').update({
      read: Boolean(next.read),
      dismissed: Boolean(next.dismissed),
      active: next.active !== false,
      detected: next.detected || '',
    }).eq('notification_key', id)
    if (error) throw new Error(reportFailure(error))
    cache.set(collection, getAll(collection).map((row) => (row.id === id ? next : row)))
    emit()
    return next
  }
  if (collection === 'orders') {
    const current = getById(collection, id)
    if (!current) return null
    const next = { ...current, ...changes, id }
    const { error } = await supabase.from('orders').update({
      status: next.status,
      cancel_reason: next.cancelReason || '',
      cancelled_at: next.cancelledAt || null,
      down_payment_disposition: next.downPaymentDisposition || null,
      sale_id: next.saleId || null,
    }).eq('id', id)
    if (error) throw new Error(reportFailure(error))
    cache.set(collection, getAll(collection).map((record) => (record.id === id ? next : record)))
    emit()
    return next
  }
  const current = getById(collection, id)
  if (!current) return null
  const merged = { ...current, ...changes, id }
  const row = simpleRow(collection, merged)
  delete row.id
  const { data, error } = await supabase.from(SIMPLE[collection]).update(row).eq('id', id).select('*').single()
  if (error) throw new Error(reportFailure(error))
  const saved = camelRow(data)
  cache.set(collection, getAll(collection).map((record) => (record.id === id ? saved : record)))
  emit()
  return saved
}

export async function remove(collection, id) {
  const supabase = getSupabase()
  if (collection === 'recipes') {
    const { error: lineError } = await supabase.from('recipe_lines').delete().eq('recipe_id', id)
    if (lineError) throw new Error(reportFailure(lineError))
    const { error } = await supabase.from('recipes').delete().eq('id', id)
    if (error) throw new Error(reportFailure(error))
    const before = getAll(collection)
    cache.set(collection, before.filter((record) => record.id !== id))
    emit()
    return before.length !== getAll(collection).length
  }
  const table = SIMPLE[collection] || null
  if (!table) return false
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) throw new Error(reportFailure(error))
  const before = getAll(collection)
  cache.set(collection, before.filter((record) => record.id !== id))
  emit()
  return before.length !== getAll(collection).length
}

export async function queryPage(collection, { page = 1, filters = {} } = {}) {
  const supabase = getSupabase()
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  if (collection === 'auditLogs') {
    let query = supabase.from('audit_logs').select('*', { count: 'exact' }).order('created_at', { ascending: false })
    if (filters.from) query = query.gte('created_at', `${filters.from}T00:00:00+08:00`)
    if (filters.to) query = query.lte('created_at', `${filters.to}T23:59:59+08:00`)
    if (filters.table) query = query.eq('table_name', filters.table)
    if (filters.action) query = query.eq('action', filters.action)
    if (filters.user) query = query.ilike('user_email', `%${filters.user}%`)
    if (filters.recordId) query = query.eq('record_id', filters.recordId)
    const { data, error, count } = await query.range(from, to)
    if (error) throw new Error(reportFailure(error))
    return { rows: (data || []).map(camelRow), count: count || 0, page }
  }
  if (collection === 'stockMovements') {
    let query = supabase.from('stock_movements').select('*', { count: 'exact' }).order('date', { ascending: false }).order('created_at', { ascending: false })
    if (filters.from) query = query.gte('date', filters.from)
    if (filters.to) query = query.lte('date', filters.to)
    if (filters.itemId) query = query.eq('item_id', filters.itemId)
    if (filters.type) query = query.eq('type', filters.type)
    const { data, error, count } = await query.range(from, to)
    if (error) throw new Error(reportFailure(error))
    return { rows: (data || []).map(camelRow), count: count || 0, page }
  }
  if (collection === 'sales') {
    let query = supabase.from(activeRole === 'cashier' ? 'v_cashier_sales' : 'sales').select('*', { count: 'exact' }).order('date', { ascending: false })
    if (filters.from) query = query.gte('date', filters.from)
    if (filters.to) query = query.lte('date', filters.to)
    if (filters.status) query = query.eq('status', filters.status)
    if (filters.search) query = query.ilike('sale_number', `%${filters.search}%`)
    const { data, error, count } = await query.range(from, to)
    if (error) throw new Error(reportFailure(error))
    const sales = (data || []).map(camelRow)
    if (sales.length === 0) return { rows: [], count: count || 0, page }
    const lineTable = activeRole === 'cashier' ? 'v_cashier_sale_lines' : 'sale_lines'
    const { data: lines, error: lineError } = await supabase.from(lineTable).select('*').in('sale_id', sales.map((sale) => sale.id))
    if (lineError) throw new Error(reportFailure(lineError))
    return { rows: nest(sales, (lines || []).map(camelRow), 'saleId', 'lines'), count: count || 0, page }
  }
  if (collection === 'journalLines') {
    let query = supabase.from('journal_lines').select('*, journal_entries!inner(date, entry_number, description)', { count: 'exact' })
    if (filters.accountId) query = query.eq('account_id', filters.accountId)
    const { data, error, count } = await query.range(from, to)
    if (error) throw new Error(reportFailure(error))
    return { rows: (data || []).map(camelRow), count: count || 0, page }
  }
  return { rows: getAll(collection), count: getAll(collection).length, page: 1 }
}
