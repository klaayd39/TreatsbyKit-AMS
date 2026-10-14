import { describe, expect, it } from 'vitest'
import { calculateCart, getSalePaymentStatus } from './sales'

describe('sales', () => {
  it('applies a percent discount without going past the subtotal', () => {
    const cart = calculateCart([{ quantity: 2, unitPrice: 250 }], { type: 'percent', value: 10 })
    expect(cart.subtotal).toBe(500)
    expect(cart.discountAmount).toBe(50)
    expect(cart.total).toBe(450)
  })

  it('reports payment status from the amount paid', () => {
    expect(getSalePaymentStatus({ total: 100, amountPaid: 0 })).toBe('unpaid')
    expect(getSalePaymentStatus({ total: 100, amountPaid: 40 })).toBe('partial')
    expect(getSalePaymentStatus({ total: 100, amountPaid: 100 })).toBe('paid')
  })
})
