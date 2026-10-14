import { adjustmentDraft } from '../accounting/posting'
import { roundQuantity } from '../utils/inventory'
import { lockError } from './journal'
import { COLLECTIONS } from './seed'
import { callRpc, getById } from './storage'

export async function postAdjustment({ itemId, date, quantityChange, reason }) {
  const closed = lockError(date)
  if (closed) return { ok: false, errors: { form: closed } }
  const change = roundQuantity(quantityChange)
  const movement = {
    id: crypto.randomUUID(),
    date,
    itemId,
    type: 'adjustment',
    quantityIn: change > 0 ? change : 0,
    quantityOut: change < 0 ? Math.abs(change) : 0,
    unitCost: 0,
    referenceType: 'adjustment',
    referenceId: null,
    notes: reason,
  }
  const item = getById(COLLECTIONS.ITEMS, itemId)
  try {
    await callRpc('create_stock_adjustment', { movement, journal: adjustmentDraft(movement, item) })
    return { ok: true, movement }
  } catch (error) {
    return { ok: false, errors: { form: error.message || 'The adjustment could not be saved.' } }
  }
}
