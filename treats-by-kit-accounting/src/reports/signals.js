import { addDaysISO, daysBetween, getAgingBucket } from '../utils/aging'
import { supplierBalance } from '../data/purchasing'
import { fromCentavos, sum, toCentavos } from '../utils/money'
import { lowStock } from './inventory'

const OPEN_ORDER = new Set(['pending', 'confirmed', 'ready'])

export function saleBalance(sale, payments) {
  const paid = sum((payments || []).filter((payment) => payment.saleId === sale.id).map((payment) => payment.amount))
  return fromCentavos(toCentavos(sale.total) - toCentavos(paid))
}

export function payableRows({ invoices, receipts, supplierPayments, expenses, suppliers, asOf }) {
  const invoiceRows = (invoices || [])
    .map((invoice) => {
      const balance = supplierBalance(invoice, receipts, supplierPayments)
      const due = invoice.dueDate || invoice.invoiceDate
      return {
        id: invoice.id,
        kind: 'invoice',
        label: invoice.invoiceNumber,
        party: (suppliers || []).find((supplier) => supplier.id === invoice.supplierId)?.name || 'Unknown supplier',
        due,
        balance,
        days: daysBetween(due, asOf),
        bucket: getAgingBucket(due, asOf),
        href: '/purchasing/invoices',
      }
    })
    .filter((row) => toCentavos(row.balance) > 0)

  const expenseRows = (expenses || [])
    .filter((expense) => expense.status === 'unpaid')
    .map((expense) => {
      const due = expense.dueDate || expense.date
      return {
        id: expense.id,
        kind: 'expense',
        label: expense.payee,
        party: expense.description || 'Unpaid expense',
        due,
        balance: Number(expense.amount) || 0,
        days: daysBetween(due, asOf),
        bucket: getAgingBucket(due, asOf),
        href: '/accounting/expenses',
      }
    })

  return [...invoiceRows, ...expenseRows].sort((a, b) => String(a.due).localeCompare(String(b.due)))
}

export function receivableRows({ sales, payments, customers, asOf }) {
  return (sales || [])
    .filter((sale) => sale.status !== 'voided')
    .map((sale) => {
      const balance = saleBalance(sale, payments)
      return {
        id: sale.id,
        label: sale.saleNumber,
        party: (customers || []).find((customer) => customer.id === sale.customerId)?.name || 'Walk-in',
        due: sale.date,
        balance,
        days: daysBetween(sale.date, asOf),
        bucket: getAgingBucket(sale.date, asOf),
        href: '/accounting/accounts-receivable',
      }
    })
    .filter((row) => toCentavos(row.balance) > 0)
    .sort((a, b) => String(a.due).localeCompare(String(b.due)))
}

export function openOrders(orders) {
  return (orders || []).filter((order) => OPEN_ORDER.has(order.status))
}

export function ordersDueSoon(orders, asOf) {
  const end = addDaysISO(asOf, 3)
  return openOrders(orders)
    .filter((order) => order.fulfillmentDate >= asOf && order.fulfillmentDate <= end)
    .sort((a, b) => String(a.fulfillmentDate).localeCompare(String(b.fulfillmentDate)))
}

export function ordersOverdue(orders, asOf) {
  return openOrders(orders)
    .filter((order) => order.fulfillmentDate && order.fulfillmentDate < asOf)
    .sort((a, b) => String(a.fulfillmentDate).localeCompare(String(b.fulfillmentDate)))
}

export function stockAlerts(items, movements, asOf) {
  return lowStock({ items, movements, asOf })
}
