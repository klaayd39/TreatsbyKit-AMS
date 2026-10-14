import { describe, expect, it } from 'vitest'
import { balanceSheet, cashFlow, incomeStatement } from './statements'
import { stockValuation } from './inventory'

const accounts = [
  { id: '1010', code: '1010', name: 'Cash', type: 'asset' },
  { id: '1200', code: '1200', name: 'Raw Materials', type: 'asset' },
  { id: '1210', code: '1210', name: 'Packaging', type: 'asset' },
  { id: '1220', code: '1220', name: 'Finished Goods', type: 'asset' },
  { id: '2010', code: '2010', name: 'Accounts Payable', type: 'liability' },
  { id: '3010', code: '3010', name: 'Capital', type: 'equity' },
  { id: '3020', code: '3020', name: 'Drawings', type: 'equity' },
  { id: '4010', code: '4010', name: 'Sales', type: 'revenue' },
  { id: '4020', code: '4020', name: 'Discounts', type: 'contra_revenue' },
  { id: '5010', code: '5010', name: 'COGS', type: 'cogs' },
  { id: '5040', code: '5040', name: 'Applied', type: 'contra_cogs' },
  { id: '6010', code: '6010', name: 'Rent', type: 'expense' },
]

const entries = [
  {
    id: 'j1', date: '2026-10-02', sourceType: 'receiving',
    lines: [{ accountId: '1200', debit: 80, credit: 0 }, { accountId: '1010', debit: 0, credit: 80 }],
  },
  {
    id: 'j2', date: '2026-10-03', sourceType: 'sale',
    lines: [{ accountId: '1010', debit: 250, credit: 0 }, { accountId: '4010', debit: 0, credit: 250 }],
  },
]

const items = [{ id: 'flour', name: 'Flour', unit: 'kg', category: 'raw_material' }]
const movements = [
  { id: 'm1', itemId: 'flour', date: '2026-10-02', type: 'purchase', quantityIn: 2, quantityOut: 0, unitCost: 40 },
]

describe('reports', () => {
  it('states income from the fixture', () => {
    const statement = incomeStatement({ accounts, entries, from: '2026-10-01', to: '2026-10-31' })
    expect(statement.netIncome).toBe(250)
  })

  it('balances the balance sheet', () => {
    const sheet = balanceSheet({ accounts, entries, asOf: '2026-10-31' })
    expect(sheet.balanced).toBe(true)
    expect(sheet.totalAssets).toBe(250)
  })

  it('matches closing cash to the cash accounts', () => {
    const flow = cashFlow({ accounts, entries, from: '2026-10-01', to: '2026-10-31' })
    expect(flow.pass).toBe(true)
    expect(flow.closing).toBe(flow.ledgerClosing)
  })

  it('matches inventory valuation to the inventory accounts', () => {
    const valuation = stockValuation({ items, movements, accounts, entries, asOf: '2026-10-31' })
    expect(valuation.pass).toBe(true)
  })
})
