import { roundQuantity } from './inventory'

export function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

export function calculateCart(lines, discount = {}) {
  const priced = (lines || []).map((line) => ({
    ...line,
    lineTotal: roundMoney((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0)),
  }))
  const subtotal = roundMoney(priced.reduce((sum, line) => sum + line.lineTotal, 0))
  const type = discount.type === 'percent' ? 'percent' : 'amount'
  const value = Number(discount.value) || 0
  let discountAmount = type === 'percent' ? roundMoney(subtotal * (value / 100)) : roundMoney(value)
  if (discountAmount < 0) discountAmount = 0
  if (discountAmount > subtotal) discountAmount = subtotal
  const total = roundMoney(subtotal - discountAmount)
  return { lines: priced, subtotal, discountType: type, discountValue: value, discountAmount, total }
}

function allocateDiscount(lines, discountAmount) {
  const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.lineTotal, 0))
  let allocated = 0
  return lines.map((line, index) => {
    const share =
      index === lines.length - 1
        ? roundMoney(discountAmount - allocated)
        : subtotal > 0
          ? roundMoney((discountAmount * line.lineTotal) / subtotal)
          : 0
    if (index !== lines.length - 1) allocated = roundMoney(allocated + share)
    const revenue = roundMoney(line.lineTotal - share)
    const cogs = roundMoney((Number(line.quantity) || 0) * (Number(line.unitCost) || 0))
    return { ...line, revenue, cogs, grossProfit: roundMoney(revenue - cogs) }
  })
}

export function priceSaleLines(lines, discount) {
  const cart = calculateCart(lines, discount)
  const priced = allocateDiscount(cart.lines, cart.discountAmount)
  const cogsTotal = roundMoney(priced.reduce((sum, line) => sum + line.cogs, 0))
  const grossProfit = roundMoney(cart.total - cogsTotal)
  return { ...cart, lines: priced, cogsTotal, grossProfit }
}

export function buildSaleMovements(sale) {
  return (sale.lines || [])
    .filter((line) => roundQuantity(line.quantity) > 0)
    .map((line) => ({
      date: sale.date,
      itemId: line.itemId,
      type: 'sale',
      quantityIn: 0,
      quantityOut: roundQuantity(line.quantity),
      unitCost: Number(line.unitCost) || 0,
      referenceType: 'sale',
      referenceId: sale.id,
      notes: '',
    }))
}

export function getSalePaymentStatus(sale) {
  const paid = roundMoney(
    sale.amountPaid ?? (sale.payments || []).reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0),
  )
  const total = roundMoney(sale.total)
  if (paid <= 0 && total > 0) return 'unpaid'
  if (paid + 0.009 < total) return 'partial'
  return 'paid'
}

export function getSalesSummary(sales, range = {}) {
  const payments = range.payments || []
  const included = (sales || []).filter((sale) => {
    if (sale.status === 'voided') return false
    if (range.from && sale.date < range.from) return false
    if (range.to && sale.date > range.to) return false
    return true
  })
  const includedIds = new Set(included.map((sale) => sale.id))
  const paidFor = (sale) =>
    roundMoney(payments.filter((payment) => payment.saleId === sale.id).reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0))

  const totalSales = roundMoney(included.reduce((sum, sale) => sum + (Number(sale.total) || 0), 0))
  const totalDiscounts = roundMoney(included.reduce((sum, sale) => sum + (Number(sale.discountAmount) || 0), 0))
  const cogs = roundMoney(included.reduce((sum, sale) => sum + (Number(sale.cogsTotal) || 0), 0))
  const grossProfit = roundMoney(included.reduce((sum, sale) => sum + (Number(sale.grossProfit) || 0), 0))
  const unpaidBalance = roundMoney(
    included.reduce((sum, sale) => sum + Math.max(0, roundMoney((Number(sale.total) || 0) - paidFor(sale))), 0),
  )

  const products = new Map()
  for (const sale of included) {
    for (const line of sale.lines || []) {
      const current = products.get(line.itemId) || { itemId: line.itemId, units: 0, revenue: 0, cogs: 0, grossProfit: 0 }
      current.units = roundQuantity(current.units + (Number(line.quantity) || 0))
      current.revenue = roundMoney(current.revenue + (Number(line.revenue) || 0))
      current.cogs = roundMoney(current.cogs + (Number(line.cogs) || 0))
      current.grossProfit = roundMoney(current.grossProfit + (Number(line.grossProfit) || 0))
      products.set(line.itemId, current)
    }
  }
  const byProduct = [...products.values()].sort((a, b) => b.units - a.units || String(a.itemId).localeCompare(String(b.itemId)))

  const days = new Map()
  for (const sale of included) {
    const current = days.get(sale.date) || { date: sale.date, total: 0, count: 0 }
    current.total = roundMoney(current.total + (Number(sale.total) || 0))
    current.count += 1
    days.set(sale.date, current)
  }
  const byDay = [...days.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)))

  const methods = new Map()
  for (const payment of payments) {
    if (!includedIds.has(payment.saleId)) continue
    const key = payment.method || 'other'
    methods.set(key, roundMoney((methods.get(key) || 0) + (Number(payment.amount) || 0)))
  }
  const byMethod = [...methods.entries()]
    .map(([method, amount]) => ({ method, amount }))
    .filter((entry) => entry.amount !== 0)
    .sort((a, b) => b.amount - a.amount)

  return {
    totalSales,
    saleCount: included.length,
    totalDiscounts,
    cogs,
    grossProfit,
    unpaidBalance,
    byProduct,
    byDay,
    byMethod,
    topProducts: byProduct.slice(0, 5),
  }
}
