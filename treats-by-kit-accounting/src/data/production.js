import { productionDraft } from '../accounting/posting'
import { generateId } from '../utils/id'
import { getAverageCost, getStockOnHand, roundQuantity } from '../utils/inventory'
import {
  calculateBatchCost,
  checkStockAvailability,
  scaleRecipe,
} from '../utils/production'
import { buildReversalDraft, findByEventKey } from './journal'
import { COLLECTIONS } from './seed'
import { callRpc, getAll, remove } from './storage'

export function nextBatchNumber(batches = getAll(COLLECTIONS.PRODUCTION_BATCHES)) {
  const max = batches.reduce((highest, batch) => {
    const match = /^B-(\d+)$/.exec(batch.batchNumber || '')
    return match ? Math.max(highest, Number(match[1])) : highest
  }, 0)
  return `B-${String(max + 1).padStart(3, '0')}`
}

export function recipeHasBatches(recipeId) {
  return getAll(COLLECTIONS.PRODUCTION_BATCHES).some((batch) => batch.recipeId === recipeId)
}

function nonNegative(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0
  if (typeof value === 'string' && value.trim() !== '') {
    const number = Number(value)
    return Number.isFinite(number) && number >= 0
  }
  return false
}

export async function saveRecipe(draft) {
  const errors = {}
  const name = draft.name?.trim() ?? ''
  const items = getAll(COLLECTIONS.ITEMS)
  const finished = items.find((item) => item.id === draft.finishedItemId)
  if (!finished || finished.category !== 'finished_good') errors.finishedItemId = 'Choose a finished good.'
  if (!name) errors.name = 'Enter a recipe name.'
  const yieldQuantity = Number(draft.yieldQuantity)
  if (!Number.isFinite(yieldQuantity) || yieldQuantity <= 0) {
    errors.yieldQuantity = 'Yield quantity must be greater than 0.'
  }

  const ingredients = draft.ingredients || []
  if (ingredients.length === 0) errors.lines = 'Add at least one ingredient.'
  const seen = new Set()
  const lineErrors = ingredients.map((line) => {
    const lineError = {}
    const item = items.find((entry) => entry.id === line.itemId)
    if (!item || (item.category !== 'raw_material' && item.category !== 'packaging')) {
      lineError.itemId = 'Choose a raw material or packaging item.'
    } else if (seen.has(line.itemId)) {
      lineError.itemId = 'This ingredient is already on the recipe.'
    } else {
      seen.add(line.itemId)
    }
    const quantity = Number(line.quantity)
    if (line.quantity === '' || !Number.isFinite(quantity) || quantity <= 0) {
      lineError.quantity = 'Quantity must be greater than 0.'
    }
    return lineError
  })
  if (lineErrors.some((error) => Object.keys(error).length)) errors.lineErrors = lineErrors
  if (Object.keys(errors).length) return { ok: false, errors }

  const payload = {
    name,
    finishedItemId: draft.finishedItemId,
    yieldQuantity: roundQuantity(yieldQuantity),
    notes: draft.notes?.trim() ?? '',
    ingredients: ingredients.map((line) => ({
      id: line.id || generateId('ingredient'),
      itemId: line.itemId,
      quantity: roundQuantity(line.quantity),
    })),
  }

  try {
    const result = await callRpc('save_recipe', {
      recipe: { ...payload, id: draft.id || crypto.randomUUID() },
    })
    const recipe = getAll(COLLECTIONS.RECIPES).find((entry) => entry.id === result.id)
    if (!recipe) return { ok: false, errors: { form: 'This recipe no longer exists.' } }
    return { ok: true, recipe }
  } catch (error) {
    return { ok: false, errors: { form: error.message || 'The recipe could not be saved.' } }
  }
}

export async function deleteRecipe(id) {
  if (recipeHasBatches(id)) {
    return { ok: false, message: 'This recipe has production batches and cannot be deleted.' }
  }
  if (!(await remove(COLLECTIONS.RECIPES, id))) return { ok: false, message: 'This recipe no longer exists.' }
  return { ok: true }
}

export function prepareBatchLines(recipe, quantity, movements = getAll(COLLECTIONS.STOCK_MOVEMENTS)) {
  const items = getAll(COLLECTIONS.ITEMS)
  return scaleRecipe(recipe, quantity).map((line) => {
    const item = items.find((entry) => entry.id === line.itemId)
    return {
      id: generateId('line'),
      itemId: line.itemId,
      name: item?.name || 'Unknown item',
      unit: item?.unit || '',
      expectedQty: line.expectedQty,
      actualQty: line.expectedQty,
      wasteQty: 0,
      unitCost: getAverageCost(line.itemId, movements) ?? 0,
      onHand: getStockOnHand(line.itemId, movements),
    }
  })
}

export async function saveBatch(draft) {
  const errors = {}
  const batchNumber = draft.batchNumber?.trim() ?? ''
  if (!batchNumber) errors.batchNumber = 'Enter a batch number.'
  if (!draft.date) errors.date = 'Choose a date.'
  const recipe = getAll(COLLECTIONS.RECIPES).find((entry) => entry.id === draft.recipeId)
  if (!recipe) errors.recipeId = 'Choose a recipe.'
  const quantityProduced = Number(draft.quantityProduced)
  if (draft.quantityProduced === '' || !Number.isFinite(quantityProduced) || quantityProduced <= 0) {
    errors.quantityProduced = 'Quantity produced must be greater than 0.'
  }
  if (!nonNegative(draft.laborCost)) errors.laborCost = 'Labor cost must be 0 or more.'
  if (!nonNegative(draft.overheadCost)) errors.overheadCost = 'Overhead cost must be 0 or more.'

  const batches = getAll(COLLECTIONS.PRODUCTION_BATCHES)
  if (batchNumber && batches.some((batch) => batch.batchNumber.trim().toLowerCase() === batchNumber.toLowerCase())) {
    errors.batchNumber = 'This batch number is already used.'
  }

  const sourceLines = draft.lines || []
  if (recipe && sourceLines.length === 0) errors.form = 'Add a quantity so the recipe can be scaled.'
  const lineErrors = sourceLines.map((line) => {
    const lineError = {}
    if (!nonNegative(line.actualQty)) lineError.actualQty = 'Actual used must be 0 or more.'
    if (!nonNegative(line.wasteQty)) lineError.wasteQty = 'Waste must be 0 or more.'
    return lineError
  })
  if (lineErrors.some((error) => Object.keys(error).length)) errors.lineErrors = lineErrors
  if (Object.keys(errors).length) return { ok: false, errors }

  const movements = getAll(COLLECTIONS.STOCK_MOVEMENTS)
  const items = getAll(COLLECTIONS.ITEMS)
  const lines = sourceLines.map((line) => {
    const item = items.find((entry) => entry.id === line.itemId)
    return {
      id: line.id || generateId('line'),
      itemId: line.itemId,
      expectedQty: roundQuantity(line.expectedQty),
      actualQty: roundQuantity(line.actualQty),
      wasteQty: roundQuantity(line.wasteQty),
      unitCost: getAverageCost(line.itemId, movements) ?? 0,
      name: item?.name || line.name || 'Unknown item',
      unit: item?.unit || line.unit || '',
      onHand: getStockOnHand(line.itemId, movements),
    }
  })

  const shortages = checkStockAvailability(lines)
  if (shortages.length) {
    const detail = shortages
      .map((line) => `${line.name} (short ${line.shortfall} ${line.unit})`.trim())
      .join(', ')
    return { ok: false, errors: { form: `Not enough stock: ${detail}.` }, shortages }
  }

  const costs = calculateBatchCost(lines, draft.laborCost, draft.overheadCost, quantityProduced)
  const record = {
    id: crypto.randomUUID(),
    batchNumber,
    date: draft.date,
    recipeId: recipe.id,
    finishedItemId: recipe.finishedItemId,
    quantityProduced: roundQuantity(quantityProduced),
    notes: draft.notes?.trim() ?? '',
    status: 'completed',
    lines: lines.map((line) => ({
      id: line.id,
      itemId: line.itemId,
      expectedQty: line.expectedQty,
      actualQty: line.actualQty,
      wasteQty: line.wasteQty,
      unitCost: line.unitCost,
    })),
    laborCost: costs.laborCost,
    overheadCost: costs.overheadCost,
    ingredientCost: costs.ingredientCost,
    wasteCost: costs.wasteCost,
    totalCost: costs.totalCost,
    costPerUnit: costs.costPerUnit,
    cancelReason: '',
    cancelledAt: null,
    createdAt: new Date().toISOString(),
  }

  try {
    await callRpc('complete_production_batch', {
      batch: record,
      journal: productionDraft(record, getAll(COLLECTIONS.ITEMS)),
    })
    return { ok: true, batch: getAll(COLLECTIONS.PRODUCTION_BATCHES).find((entry) => entry.id === record.id) || record }
  } catch (error) {
    return { ok: false, errors: { form: error.message || 'The batch could not be saved.' } }
  }
}

export async function cancelBatch(id, reason) {
  const trimmed = reason?.trim() ?? ''
  if (!trimmed) return { ok: false, errors: { reason: 'Enter a reason for cancelling this batch.' } }
  const batch = getAll(COLLECTIONS.PRODUCTION_BATCHES).find((entry) => entry.id === id)
  if (!batch) return { ok: false, errors: { form: 'This batch no longer exists.' } }
  if (batch.status === 'cancelled') return { ok: false, errors: { form: 'This batch is already cancelled.' } }

  const finished = getAll(COLLECTIONS.ITEMS).find((item) => item.id === batch.finishedItemId)
  const onHand = getStockOnHand(batch.finishedItemId)
  if (onHand < roundQuantity(batch.quantityProduced)) {
    const name = finished?.name || 'this finished good'
    const unit = finished?.unit ? ` ${finished.unit}` : ''
    return {
      ok: false,
      errors: {
        form: `Only ${onHand}${unit} of ${name} are on hand, so this batch of ${batch.quantityProduced} cannot be reversed.`,
      },
    }
  }

  const cancelledAt = new Date().toISOString()
  const entry = findByEventKey(`production:${batch.id}`)
  const journals = entry && entry.status !== 'reversed'
    ? [buildReversalDraft(entry, {
      date: cancelledAt.slice(0, 10),
      reason: trimmed,
      sourceType: 'production_reversal',
      sourceId: batch.id,
    })]
    : []
  try {
    await callRpc('cancel_production_batch', { batchId: id, reason: trimmed, date: cancelledAt.slice(0, 10), journals })
    return { ok: true, batch: getAll(COLLECTIONS.PRODUCTION_BATCHES).find((row) => row.id === id) }
  } catch (error) {
    return { ok: false, errors: { form: error.message || 'The batch could not be cancelled.' } }
  }
}
