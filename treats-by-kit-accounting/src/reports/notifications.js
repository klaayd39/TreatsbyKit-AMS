import { daysBetween } from '../utils/aging'
import { formatCurrency, formatDate, formatQuantity } from '../utils/format'
import { stockAlerts, ordersDueSoon, ordersOverdue, payableRows, receivableRows } from './signals'

const SEVERITY_RANK = { Critical: 0, Warning: 1, Info: 2 }

export const NOTIFICATION_TYPES = [
  { id: 'low-stock', label: 'Low Stock' },
  { id: 'payable-due', label: 'Payable Due Soon' },
  { id: 'payable-overdue', label: 'Payable Overdue' },
  { id: 'receivable-overdue', label: 'Receivable Overdue' },
  { id: 'order-due', label: 'Order Due Soon' },
  { id: 'order-overdue', label: 'Order Overdue' },
  { id: 'integrity', label: 'Integrity Check Failed' },
  { id: 'books-lock', label: 'Books Lock Reminder' },
]

function note(fields) {
  return { detected: fields.today, read: false, ...fields }
}

export function buildNotifications(input) {
  const today = input.today
  const notes = []

  for (const item of stockAlerts(input.items, input.movements, today)) {
    notes.push(note({
      today,
      key: `low-stock:${item.id}`,
      type: 'low-stock',
      severity: 'Warning',
      message: `${item.name} is at or below its reorder level. On hand ${formatQuantity(item.onHand)} ${item.unit}, reorder ${formatQuantity(item.reorderLevel)}.`,
      href: item.category === 'finished_good' ? '/inventory/finished-goods' : item.category === 'packaging' ? '/inventory/packaging' : '/inventory/raw-materials',
    }))
  }

  const payables = payableRows({ ...input, asOf: today })
  const receivables = receivableRows({ ...input, asOf: today })

  for (const row of payables.filter((entry) => entry.days > 0)) {
    notes.push(note({
      today,
      key: `payable-overdue:${row.kind}:${row.id}`,
      type: 'payable-overdue',
      severity: 'Critical',
      message: row.kind === 'invoice'
        ? `Invoice ${row.label} from ${row.party} is ${row.days} days overdue (${formatCurrency(row.balance)}).`
        : `${row.label} is an unpaid expense ${row.days} days overdue (${formatCurrency(row.balance)}).`,
      href: row.href,
    }))
  }

  for (const row of payables.filter((entry) => entry.days <= 0 && entry.days >= -7)) {
    notes.push(note({
      today,
      key: `payable-due:${row.kind}:${row.id}`,
      type: 'payable-due',
      severity: 'Info',
      message: row.kind === 'invoice'
        ? `Invoice ${row.label} from ${row.party} is due ${formatDate(row.due)} (${formatCurrency(row.balance)}).`
        : `${row.label} is an unpaid expense due ${formatDate(row.due)} (${formatCurrency(row.balance)}).`,
      href: row.href,
    }))
  }

  for (const row of receivables.filter((entry) => entry.days > 30)) {
    notes.push(note({
      today,
      key: `receivable-overdue:${row.id}`,
      type: 'receivable-overdue',
      severity: 'Critical',
      message: `Sale ${row.label} for ${row.party} is ${row.days} days outstanding (${formatCurrency(row.balance)}).`,
      href: row.href,
    }))
  }

  for (const order of ordersDueSoon(input.orders, today)) {
    const days = daysBetween(today, order.fulfillmentDate)
    notes.push(note({
      today,
      key: `order-due:${order.id}`,
      type: 'order-due',
      severity: 'Info',
      message: days === 0 ? `Order ${order.orderNumber} is due today.` : `Order ${order.orderNumber} is due ${formatDate(order.fulfillmentDate)}.`,
      href: '/sales/orders',
    }))
  }

  for (const order of ordersOverdue(input.orders, today)) {
    notes.push(note({
      today,
      key: `order-overdue:${order.id}`,
      type: 'order-overdue',
      severity: 'Warning',
      message: `Order ${order.orderNumber} was due ${formatDate(order.fulfillmentDate)}.`,
      href: '/sales/orders',
    }))
  }

  for (const check of input.checks || []) {
    if (check.pass) continue
    notes.push(note({
      today,
      key: `integrity:${check.id}`,
      type: 'integrity',
      severity: 'Critical',
      message: `${check.label} failed. ${check.detail}`,
      href: '/accounting/general-ledger',
    }))
  }

  if (input.lockDate && daysBetween(input.lockDate, today) > 45) {
    notes.push(note({
      today,
      key: 'books-lock',
      type: 'books-lock',
      severity: 'Warning',
      message: `Books are locked through ${formatDate(input.lockDate)}, which is more than 45 days ago.`,
      href: '/admin/settings',
    }))
  }

  return notes.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.message.localeCompare(b.message))
}

export function presentNotifications(notes, stored) {
  return (notes || []).flatMap((note) => {
    const state = (stored || []).find((entry) => entry.id === note.key)
    if (state?.dismissed && state.active) return []
    return [{
      ...note,
      read: Boolean(state?.active && state.read),
      detected: state?.detected || note.detected,
    }]
  })
}

export function latestNotifications(notes, count = 5) {
  return [...(notes || [])]
    .sort((a, b) => String(b.detected).localeCompare(String(a.detected)) || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .slice(0, count)
}
