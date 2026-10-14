import { describe, expect, it } from 'vitest'
import { lineTotals, round2, sum, toCentavos } from './money'

describe('money', () => {
  it('rounds to the nearest centavo', () => {
    expect(toCentavos(10.5)).toBe(1050)
    expect(round2(10.015)).toBe(10.02)
    expect(round2(10.014)).toBe(10.01)
  })

  it('sums in centavos', () => {
    expect(sum([0.1, 0.2])).toBe(0.3)
    expect(lineTotals([{ debit: 10.1, credit: 0 }, { debit: 0, credit: 10.1 }]).balanced).toBe(true)
  })
})
