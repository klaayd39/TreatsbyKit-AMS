import { describe, expect, it } from 'vitest'
import { getAverageCost, getStockOnHand } from './inventory'

const flour = [
  { id: '1', itemId: 'flour', date: '2026-10-01', type: 'adjustment', quantityIn: 20, quantityOut: 0, unitCost: 0, createdAt: '2026-10-01T00:00:00Z' },
  { id: '2', itemId: 'flour', date: '2026-10-02', type: 'purchase', quantityIn: 10, quantityOut: 0, unitCost: 40, createdAt: '2026-10-02T00:00:00Z' },
  { id: '3', itemId: 'flour', date: '2026-10-03', type: 'production_use', quantityIn: 0, quantityOut: 5, unitCost: 40, createdAt: '2026-10-03T00:00:00Z' },
]

describe('inventory', () => {
  it('sums stock on hand from movements', () => {
    expect(getStockOnHand('flour', flour)).toBe(25)
  })

  it('averages purchase cost and ignores adjustments', () => {
    expect(getAverageCost('flour', flour)).toBe(40)
  })
})
