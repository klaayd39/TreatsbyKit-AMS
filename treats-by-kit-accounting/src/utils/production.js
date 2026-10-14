import { roundQuantity } from './inventory'

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

export function scaleRecipe(recipe, quantity) {
  const yieldQuantity = Number(recipe?.yieldQuantity) || 0
  const target = Number(quantity) || 0
  if (yieldQuantity <= 0 || target <= 0) return []
  const factor = target / yieldQuantity
  return (recipe.ingredients || []).map((ingredient) => ({
    itemId: ingredient.itemId,
    expectedQty: roundQuantity((Number(ingredient.quantity) || 0) * factor),
  }))
}

export function checkStockAvailability(lines) {
  const grouped = new Map()
  for (const line of lines) {
    const current = grouped.get(line.itemId) || {
      itemId: line.itemId,
      name: line.name || '',
      unit: line.unit || '',
      required: 0,
      onHand: roundQuantity(line.onHand),
    }
    current.required = roundQuantity(
      current.required + (Number(line.actualQty) || 0) + (Number(line.wasteQty) || 0),
    )
    if (line.name) current.name = line.name
    if (line.unit) current.unit = line.unit
    grouped.set(line.itemId, current)
  }

  return [...grouped.values()]
    .map((line) => ({
      ...line,
      shortfall: roundQuantity(Math.max(0, line.required - line.onHand)),
    }))
    .filter((line) => line.shortfall > 0)
}

export function calculateBatchCost(lines, labor, overhead, quantity) {
  const ingredientCost = roundMoney(
    lines.reduce((sum, line) => sum + (Number(line.actualQty) || 0) * (Number(line.unitCost) || 0), 0),
  )
  const wasteCost = roundMoney(
    lines.reduce((sum, line) => sum + (Number(line.wasteQty) || 0) * (Number(line.unitCost) || 0), 0),
  )
  const laborCost = roundMoney(labor)
  const overheadCost = roundMoney(overhead)
  const totalCost = roundMoney(ingredientCost + wasteCost + laborCost + overheadCost)
  const produced = Number(quantity) || 0
  const costPerUnit = produced > 0 ? roundMoney(totalCost / produced) : 0
  return { ingredientCost, wasteCost, laborCost, overheadCost, totalCost, costPerUnit }
}

export function buildBatchMovements(batch) {
  const movements = []
  for (const line of batch.lines || []) {
    const actual = roundQuantity(line.actualQty)
    const waste = roundQuantity(line.wasteQty)
    const unitCost = Number(line.unitCost) || 0
    if (actual > 0) {
      movements.push({
        date: batch.date,
        itemId: line.itemId,
        type: 'production_use',
        quantityIn: 0,
        quantityOut: actual,
        unitCost,
        referenceType: 'production_batch',
        referenceId: batch.id,
        notes: '',
      })
    }
    if (waste > 0) {
      movements.push({
        date: batch.date,
        itemId: line.itemId,
        type: 'waste',
        quantityIn: 0,
        quantityOut: waste,
        unitCost,
        referenceType: 'production_batch',
        referenceId: batch.id,
        notes: '',
      })
    }
  }

  const produced = roundQuantity(batch.quantityProduced)
  if (produced > 0 && batch.finishedItemId) {
    movements.push({
      date: batch.date,
      itemId: batch.finishedItemId,
      type: 'production_output',
      quantityIn: produced,
      quantityOut: 0,
      unitCost: Number(batch.costPerUnit) || 0,
      referenceType: 'production_batch',
      referenceId: batch.id,
      notes: '',
    })
  }

  return movements
}
