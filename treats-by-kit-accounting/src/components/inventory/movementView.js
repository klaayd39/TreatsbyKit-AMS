import { movementReference } from '../../data/purchasing'
import { getRunningBalances } from '../../utils/inventory'

export const MOVEMENT_LABELS = {
  purchase: 'Purchase',
  production_use: 'Production use',
  production_output: 'Production output',
  sale: 'Sale',
  waste: 'Waste',
  adjustment: 'Adjustment',
}

export const MOVEMENT_TONES = {
  purchase: 'accent',
  production_use: 'neutral',
  production_output: 'success',
  sale: 'success',
  waste: 'danger',
  adjustment: 'warning',
}

export function decorateMovements(movements, { items, receipts, invoices }) {
  return getRunningBalances(movements).map((movement) => ({
    ...movement,
    itemName: items.find((item) => item.id === movement.itemId)?.name ?? 'Unknown item',
    referenceLabel: movementReference(movement, receipts, invoices),
  }))
}
