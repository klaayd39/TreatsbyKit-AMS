import { addDaysISO } from '../utils/aging'
import { roundQuantity } from '../utils/inventory'
import { fromCentavos, sum, toCentavos } from '../utils/money'
import { netDebitCents } from './ledger'

export const CATEGORY_ORDER = ['raw_material', 'packaging', 'finished_good']

export const CATEGORY_LABELS = {
  raw_material: 'Raw materials',
  packaging: 'Packaging',
  finished_good: 'Finished goods',
}

const INVENTORY_ACCOUNTS = [
  ['raw_material', '1200'],
  ['packaging', '1210'],
  ['finished_good', '1220'],
]

function addQty(left, right) {
  return roundQuantity((Number(left) || 0) + (Number(right) || 0))
}

function movementQty(movement, field) {
  return Number(movement[field]) || 0
}

export function quantityOnHand(itemId, movements, asOf) {
  let total = 0
  for (const movement of movements || []) {
    if (movement.itemId !== itemId) continue
    if (asOf && String(movement.date) > asOf) continue
    total = addQty(total, movementQty(movement, 'quantityIn') - movementQty(movement, 'quantityOut'))
  }
  return total
}

function movementValueCents(itemId, movements, asOf) {
  let cents = 0
  for (const movement of movements || []) {
    if (movement.itemId !== itemId) continue
    if (asOf && String(movement.date) > asOf) continue
    const unit = Number(movement.unitCost) || 0
    cents += toCentavos(movementQty(movement, 'quantityIn') * unit)
    cents -= toCentavos(movementQty(movement, 'quantityOut') * unit)
  }
  return cents
}

function averageCost(item, movements, asOf) {
  const types = item.category === 'finished_good' ? ['production_output'] : ['purchase']
  let quantity = 0
  let value = 0
  for (const movement of movements || []) {
    if (movement.itemId !== item.id || !types.includes(movement.type)) continue
    if (asOf && String(movement.date) > asOf) continue
    const quantityIn = movementQty(movement, 'quantityIn')
    const quantityOut = movementQty(movement, 'quantityOut')
    const unit = Number(movement.unitCost) || 0
    quantity += quantityIn - quantityOut
    value += quantityIn * unit - quantityOut * unit
  }
  quantity = roundQuantity(quantity)
  if (quantity <= 0) return null
  return value / quantity
}

function inPeriod(date, from, to) {
  const value = String(date || '')
  if (from && value < from) return false
  if (to && value > to) return false
  return true
}

function columnFor(type) {
  if (type === 'purchase') return 'purchased'
  if (type === 'production_use') return 'used'
  if (type === 'production_output') return 'produced'
  if (type === 'sale') return 'sold'
  if (type === 'waste') return 'waste'
  return 'adjustments'
}

export function stockSummary({ items, movements, from, to }) {
  return [...(items || [])]
    .map((item) => {
      const row = { purchased: 0, used: 0, produced: 0, sold: 0, waste: 0, adjustments: 0 }
      let beginning = 0
      for (const movement of movements || []) {
        if (movement.itemId !== item.id) continue
        const delta = movementQty(movement, 'quantityIn') - movementQty(movement, 'quantityOut')
        if (from && String(movement.date) < from) {
          beginning = addQty(beginning, delta)
          continue
        }
        if (!inPeriod(movement.date, from, to)) continue
        const column = columnFor(movement.type)
        if (column === 'adjustments') row.adjustments = addQty(row.adjustments, delta)
        else if (column === 'sold' || column === 'used' || column === 'waste') {
          row[column] = addQty(row[column], movementQty(movement, 'quantityOut') - movementQty(movement, 'quantityIn'))
        } else row[column] = addQty(row[column], movementQty(movement, 'quantityIn') - movementQty(movement, 'quantityOut'))
      }
      const ending = addQty(addQty(addQty(beginning, row.purchased), row.produced), addQty(row.adjustments, -row.used - row.sold - row.waste))
      return {
        id: item.id,
        name: item.name,
        unit: item.unit,
        category: item.category,
        categoryLabel: CATEGORY_LABELS[item.category] || item.category,
        beginning,
        ...row,
        ending,
      }
    })
    .sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.name.localeCompare(b.name))
}

export function stockValuation({ items, movements, accounts, entries, asOf }) {
  const rows = [...(items || [])]
    .map((item) => ({
      id: item.id,
      name: item.name,
      unit: item.unit,
      category: item.category,
      categoryLabel: CATEGORY_LABELS[item.category] || item.category,
      quantity: quantityOnHand(item.id, movements, asOf),
      averageCost: averageCost(item, movements, asOf),
      value: fromCentavos(movementValueCents(item.id, movements, asOf)),
    }))
    .sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.name.localeCompare(b.name))

  const categories = INVENTORY_ACCOUNTS.map(([category, code]) => {
    const account = (accounts || []).find((entry) => entry.code === code)
    const value = sum(rows.filter((row) => row.category === category).map((row) => row.value))
    const ledger = account ? fromCentavos(netDebitCents(entries, account.id, { asOf })) : 0
    return {
      id: category,
      code,
      label: CATEGORY_LABELS[category],
      accountId: account?.id || null,
      value,
      ledger,
      difference: fromCentavos(toCentavos(value) - toCentavos(ledger)),
      pass: toCentavos(value) === toCentavos(ledger),
    }
  })

  return { rows, categories, pass: categories.every((category) => category.pass) }
}

export function lowStock({ items, movements, asOf }) {
  return [...(items || [])]
    .map((item) => {
      const onHand = quantityOnHand(item.id, movements, asOf)
      const reorderLevel = Number(item.reorderLevel) || 0
      const purchases = (movements || [])
        .filter((movement) => movement.itemId === item.id && movement.type === 'purchase' && (!asOf || String(movement.date) <= asOf))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      return {
        id: item.id,
        name: item.name,
        unit: item.unit,
        category: item.category,
        categoryLabel: CATEGORY_LABELS[item.category] || item.category,
        onHand,
        reorderLevel,
        shortage: roundQuantity(Math.max(0, reorderLevel - onHand)),
        lastPurchaseDate: purchases[0]?.date || '',
      }
    })
    .filter((item) => item.onHand <= item.reorderLevel)
    .sort((a, b) => b.shortage - a.shortage || a.name.localeCompare(b.name))
}

export function slowMoving({ items, movements, asOf, days }) {
  const windowDays = Number(days) > 0 ? Number(days) : 30
  const start = addDaysISO(asOf, -(windowDays - 1))
  return [...(items || [])]
    .filter((item) => {
      return !(movements || []).some((movement) => {
        if (movement.itemId !== item.id) return false
        if (movementQty(movement, 'quantityOut') <= 0) return false
        const date = String(movement.date || '')
        return date >= start && (!asOf || date <= asOf)
      })
    })
    .map((item) => ({
      id: item.id,
      name: item.name,
      unit: item.unit,
      category: item.category,
      categoryLabel: CATEGORY_LABELS[item.category] || item.category,
      onHand: quantityOnHand(item.id, movements, asOf),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
