import { getStockOnHand } from '../utils/inventory'
import { COLLECTIONS } from './seed'
import { getAll } from './storage'

export { getStockOnHand }

export function getLowStockItems() {
  const items = getAll(COLLECTIONS.ITEMS)
  const movements = getAll(COLLECTIONS.STOCK_MOVEMENTS)
  return items
    .map((item) => ({
      ...item,
      onHand: getStockOnHand(item.id, movements),
    }))
    .filter((item) => item.onHand <= Number(item.reorderLevel ?? 0))
}
