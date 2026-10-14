import { describe, expect, it } from 'vitest'
import { calculateBatchCost, checkStockAvailability, scaleRecipe } from './production'

describe('production', () => {
  it('scales a recipe to the batch quantity', () => {
    const lines = scaleRecipe({ yieldQuantity: 1, ingredients: [{ itemId: 'eggs', quantity: 2 }] }, 10)
    expect(lines).toEqual([{ itemId: 'eggs', expectedQty: 20 }])
  })

  it('costs ingredients, waste, labor, and overhead', () => {
    const cost = calculateBatchCost(
      [{ actualQty: 2, wasteQty: 1, unitCost: 10 }],
      5,
      5,
      2,
    )
    expect(cost.totalCost).toBe(40)
    expect(cost.costPerUnit).toBe(20)
  })

  it('detects a shortage', () => {
    const [line] = checkStockAvailability([{ itemId: 'eggs', name: 'Eggs', unit: 'pc', actualQty: 4, wasteQty: 0, onHand: 1 }])
    expect(line.shortfall).toBe(3)
  })
})
