import { describe, expect, it } from 'vitest'
import {
  adjustmentDraft,
  capitalContributionDraft,
  cogsDraft,
  customerPaymentDraft,
  depositApplyDraft,
  depositDraft,
  depositRefundDraft,
  depositRetainDraft,
  expenseDraft,
  expensePaymentDraft,
  productionDraft,
  receivingDraft,
  saleDraft,
  supplierPaymentDraft,
} from './posting'
import { buildReversalDraft } from '../data/journal'
import { COLLECTIONS } from '../data/seed'
import { replaceCollection } from '../data/storage'
import { lineTotals } from '../utils/money'

const ACCOUNTS = [
  ['1010', 'asset'], ['1020', 'asset'], ['1030', 'asset'], ['1100', 'asset'],
  ['1200', 'asset'], ['1210', 'asset'], ['1220', 'asset'],
  ['2010', 'liability'], ['2020', 'liability'],
  ['3010', 'equity'], ['3020', 'equity'],
  ['4010', 'revenue'], ['4020', 'contra_revenue'], ['4090', 'revenue'],
  ['5010', 'cogs'], ['5020', 'cogs'], ['5030', 'cogs'], ['5040', 'contra_cogs'],
  ['6010', 'expense'],
].map(([code, type]) => ({ id: code, code, name: code, type, active: true, system: true }))

replaceCollection(COLLECTIONS.ACCOUNTS, ACCOUNTS)
replaceCollection(COLLECTIONS.ITEMS, [])
replaceCollection(COLLECTIONS.STOCK_MOVEMENTS, [])

function expectBalanced(entry) {
  expect(entry).toBeTruthy()
  expect(lineTotals(entry.lines).balanced).toBe(true)
}

describe('posting', () => {
  const events = [
    receivingDraft({
      receipt: { id: 'r1', date: '2026-10-02', lines: [{ invoiceLineId: 'l1', itemId: 'flour', quantity: 2 }] },
      invoice: { invoiceNumber: 'INV-1', lines: [{ id: 'l1', unitPrice: 40 }] },
      items: [{ id: 'flour', category: 'raw_material' }],
    }),
    supplierPaymentDraft({ id: 'p1', date: '2026-10-03', amount: 80, method: 'cash', reference: 'OR' }, { invoiceNumber: 'INV-1' }),
    productionDraft({
      id: 'b1', batchNumber: 'B-001', date: '2026-10-04', laborCost: 10, overheadCost: 0,
      lines: [{ itemId: 'flour', actualQty: 2, wasteQty: 0, unitCost: 40 }],
    }, [{ id: 'flour', category: 'raw_material', name: 'Flour' }]),
    saleDraft({ id: 's1', saleNumber: 'SL-0001', date: '2026-10-05', subtotal: 250, discountAmount: 0, total: 250 }),
    cogsDraft({ id: 's1', saleNumber: 'SL-0001', date: '2026-10-05', cogsTotal: 90 }),
    customerPaymentDraft({ id: 'pay1', date: '2026-10-05', amount: 250, method: 'gcash', kind: 'payment' }, { saleNumber: 'SL-0001' }),
    depositDraft({ id: 'dep1', date: '2026-10-05', amount: 100, method: 'cash' }, { id: 'o1', orderNumber: 'OR-0001' }),
    depositApplyDraft({ order: { id: 'o1', orderNumber: 'OR-0001' }, amount: 100, date: '2026-10-06' }),
    depositRefundDraft({ order: { id: 'o1', orderNumber: 'OR-0001' }, amount: 100, method: 'cash', date: '2026-10-06' }),
    depositRetainDraft({ order: { id: 'o1', orderNumber: 'OR-0001' }, amount: 100, date: '2026-10-06' }),
    adjustmentDraft({ id: 'm1', date: '2026-10-07', quantityIn: 1, quantityOut: 0, unitCost: 40 }, { id: 'flour', category: 'raw_material', name: 'Flour' }),
    expenseDraft({ id: 'e1', date: '2026-10-08', payee: 'Landlord', category: '6010', amount: 8000, status: 'unpaid', method: 'cash' }),
    expensePaymentDraft({ id: 'e1', payee: 'Landlord' }, { id: 'ep1', amount: 8000, method: 'cash', date: '2026-10-09' }),
    capitalContributionDraft({ date: '2026-10-01', amount: 10000 }),
  ]

  it('balances every posted event', () => {
    for (const entry of events) expectBalanced(entry)
  })

  it('mirrors a reversal', () => {
    const original = events[0]
    const reversal = buildReversalDraft({ ...original, id: 'je1', entryNumber: 'JE-0001', sourceType: 'receiving', sourceId: 'r1' }, {
      date: '2026-10-10',
      reason: 'Correction',
    })
    expectBalanced(reversal)
    expect(reversal.lines.map((line) => line.debit)).toEqual(original.lines.map((line) => line.credit))
    expect(reversal.lines.map((line) => line.credit)).toEqual(original.lines.map((line) => line.debit))
  })
})
