import { COLLECTIONS } from '../data/seed'
import { getAll } from '../data/storage'

export function roundQuantity(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000
}

function movementDelta(movement) {
  return roundQuantity(movement.quantityIn) - roundQuantity(movement.quantityOut)
}

function compareMovements(a, b) {
  const byDate = String(a.date).localeCompare(String(b.date))
  if (byDate !== 0) return byDate
  const byCreated = String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
  if (byCreated !== 0) return byCreated
  return String(a.id).localeCompare(String(b.id))
}

export function getStockOnHand(itemId, movements = getAll(COLLECTIONS.STOCK_MOVEMENTS)) {
  return roundQuantity(
    movements.reduce((total, movement) => {
      if (movement.itemId !== itemId) return total
      return total + movementDelta(movement)
    }, 0),
  )
}

export function getAverageCost(itemId, movements = getAll(COLLECTIONS.STOCK_MOVEMENTS)) {
  const item = getAll(COLLECTIONS.ITEMS).find((entry) => entry.id === itemId)
  const types = item?.category === 'finished_good' ? ['production_output'] : ['purchase']
  const relevant = movements.filter((movement) => movement.itemId === itemId && types.includes(movement.type))
  let quantity = 0
  let value = 0
  for (const movement of relevant) {
    const quantityIn = roundQuantity(movement.quantityIn)
    const quantityOut = roundQuantity(movement.quantityOut)
    const unitCost = Number(movement.unitCost) || 0
    quantity += quantityIn - quantityOut
    value += quantityIn * unitCost - quantityOut * unitCost
  }
  quantity = roundQuantity(quantity)
  if (quantity <= 0) return null
  return value / quantity
}

export function getRunningBalances(movements = getAll(COLLECTIONS.STOCK_MOVEMENTS)) {
  const balances = new Map()
  return [...movements].sort(compareMovements).map((movement) => {
    const next = roundQuantity((balances.get(movement.itemId) || 0) + movementDelta(movement))
    balances.set(movement.itemId, next)
    return { ...movement, runningBalance: next }
  })
}
