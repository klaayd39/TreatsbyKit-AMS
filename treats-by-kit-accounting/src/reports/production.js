import { roundQuantity } from '../utils/inventory'
import { round2, sum, toCentavos } from '../utils/money'

function inRange(date, from, to) {
  const value = String(date || '')
  if (from && value < from) return false
  if (to && value > to) return false
  return true
}

function itemName(items, id) {
  return (items || []).find((item) => item.id === id)?.name || 'Unknown item'
}

export function productionReports({ batches, items, from, to, threshold }) {
  const limit = Number(threshold)
  const cutoff = Number.isFinite(limit) && limit >= 0 ? limit : 10
  const period = (batches || []).filter((batch) => inRange(batch.date, from, to))
  const active = period.filter((batch) => batch.status !== 'cancelled')
  const cancelled = period.filter((batch) => batch.status === 'cancelled')

  const products = new Map()
  for (const batch of active) {
    const current = products.get(batch.finishedItemId) || {
      id: batch.finishedItemId,
      name: itemName(items, batch.finishedItemId),
      batches: 0,
      units: 0,
      ingredientCost: 0,
      wasteCost: 0,
      laborCost: 0,
      overheadCost: 0,
      totalCost: 0,
    }
    current.batches += 1
    current.units = roundQuantity(current.units + (Number(batch.quantityProduced) || 0))
    current.ingredientCost = sum([current.ingredientCost, batch.ingredientCost])
    current.wasteCost = sum([current.wasteCost, batch.wasteCost])
    current.laborCost = sum([current.laborCost, batch.laborCost])
    current.overheadCost = sum([current.overheadCost, batch.overheadCost])
    current.totalCost = sum([current.totalCost, batch.totalCost])
    products.set(batch.finishedItemId, current)
  }
  const summary = [...products.values()]
    .map((row) => ({
      ...row,
      averageCost: row.units > 0 ? round2(row.totalCost / row.units) : 0,
    }))
    .sort((a, b) => b.units - a.units || a.name.localeCompare(b.name))

  const ingredients = new Map()
  for (const batch of active) {
    for (const line of batch.lines || []) {
      const current = ingredients.get(line.itemId) || {
        id: line.itemId,
        name: line.name || itemName(items, line.itemId),
        unit: line.unit || '',
        used: 0,
        wasted: 0,
        cost: 0,
      }
      current.used = roundQuantity(current.used + (Number(line.actualQty) || 0))
      current.wasted = roundQuantity(current.wasted + (Number(line.wasteQty) || 0))
      current.cost = sum([
        current.cost,
        round2((Number(line.actualQty) || 0) * (Number(line.unitCost) || 0)),
        round2((Number(line.wasteQty) || 0) * (Number(line.unitCost) || 0)),
      ])
      ingredients.set(line.itemId, current)
    }
  }
  const usage = [...ingredients.values()]
    .map((row) => {
      const base = row.used + row.wasted
      return { ...row, wastePercent: base > 0 ? (row.wasted / base) * 100 : 0 }
    })
    .filter((row) => row.used > 0 || row.wasted > 0)
    .sort((a, b) => b.cost - a.cost || a.name.localeCompare(b.name))

  const wasteByIngredient = [...ingredients.values()]
    .map((row) => ({
      id: row.id,
      name: row.name,
      unit: row.unit,
      quantity: row.wasted,
      cost: [...active].reduce((total, batch) => sum([
        total,
        ...(batch.lines || [])
          .filter((line) => line.itemId === row.id)
          .map((line) => round2((Number(line.wasteQty) || 0) * (Number(line.unitCost) || 0))),
      ]), 0),
    }))
    .filter((row) => row.quantity > 0)
    .sort((a, b) => b.cost - a.cost || a.name.localeCompare(b.name))

  const wasteByBatch = active
    .map((batch) => ({
      id: batch.id,
      batchNumber: batch.batchNumber,
      date: batch.date,
      product: itemName(items, batch.finishedItemId),
      cost: Number(batch.wasteCost) || 0,
    }))
    .filter((row) => toCentavos(row.cost) > 0)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.batchNumber).localeCompare(String(a.batchNumber)))

  const variance = active.flatMap((batch) => (batch.lines || []).map((line) => {
    const expected = Number(line.expectedQty) || 0
    const actual = Number(line.actualQty) || 0
    const varianceQty = roundQuantity(actual - expected)
    const variancePercent = expected > 0 ? (varianceQty / expected) * 100 : null
    const over = expected === 0 ? actual !== 0 : Math.abs(variancePercent) > cutoff
    return {
      id: `${batch.id}:${line.id || line.itemId}`,
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      date: batch.date,
      product: itemName(items, batch.finishedItemId),
      ingredient: line.name || itemName(items, line.itemId),
      unit: line.unit || '',
      expected,
      actual,
      variance: varianceQty,
      variancePercent,
      over,
    }
  })).sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.batchNumber.localeCompare(b.batchNumber))

  return {
    summary,
    usage,
    wasteByIngredient,
    wasteByBatch,
    wasteTotal: sum(wasteByBatch.map((row) => row.cost)),
    variance,
    cancelled: cancelled
      .map((batch) => ({
        id: batch.id,
        batchNumber: batch.batchNumber,
        date: batch.date,
        product: itemName(items, batch.finishedItemId),
        units: Number(batch.quantityProduced) || 0,
        reason: batch.cancelReason || '',
      }))
      .sort((a, b) => String(b.date).localeCompare(String(a.date))),
  }
}
