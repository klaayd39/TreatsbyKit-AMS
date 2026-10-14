import Button from '../ui/Button'
import { paymentMethodLabel } from '../../data/sales'
import { formatCurrency, formatDateTime, formatQuantity } from '../../utils/format'

function receiptHtml({ sale, items, customer, payments }) {
  const name = (itemId) => items.find((item) => item.id === itemId)?.name || 'Item'
  const rows = (sale.lines || [])
    .map(
      (line) =>
        `<tr><td>${name(line.itemId)}<br><span style="color:#5e5348">${formatQuantity(line.quantity)} × ${formatCurrency(line.unitPrice)}</span></td><td style="text-align:right">${formatCurrency(line.lineTotal)}</td></tr>`,
    )
    .join('')
  const paymentRows = payments
    .map(
      (payment) =>
        `<tr><td>${paymentMethodLabel(payment.method)}${payment.changeDue ? ` (tendered ${formatCurrency(payment.tendered)})` : ''}</td><td style="text-align:right">${formatCurrency(payment.amount)}</td></tr>`,
    )
    .join('')
  const change = payments.reduce((sum, payment) => sum + (Number(payment.changeDue) || 0), 0)
  return `<!DOCTYPE html><html><head><title>${sale.saleNumber}</title><style>
    body { font-family: "Avenir Next", "Segoe UI", sans-serif; color: #243044; margin: 0; }
    .receipt { width: 72mm; margin: 0 auto; padding: 8px; }
    h1 { font-size: 18px; text-align: center; margin: 0; }
    p { margin: 4px 0; font-size: 12px; text-align: center; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
    td { padding: 4px 0; vertical-align: top; }
  </style></head><body><div class="receipt">
    <h1>Treats by Kit</h1>
    <p>${sale.saleNumber}</p>
    <p>${formatDateTime(sale.soldAt)}</p>
    <p>${customer?.name || 'Walk-in'}</p>
    <table>${rows}</table>
    <table>
      <tr><td>Subtotal</td><td style="text-align:right">${formatCurrency(sale.subtotal)}</td></tr>
      <tr><td>Discount</td><td style="text-align:right">${formatCurrency(sale.discountAmount)}</td></tr>
      <tr><td><strong>Total</strong></td><td style="text-align:right"><strong>${formatCurrency(sale.total)}</strong></td></tr>
      ${paymentRows}
      ${change ? `<tr><td>Change</td><td style="text-align:right">${formatCurrency(change)}</td></tr>` : ''}
    </table>
    <p>Thank you.</p>
  </div></body></html>`
}

function printReceipt(details) {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.position = 'fixed'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  doc.open()
  doc.write(receiptHtml(details))
  doc.close()
  frame.contentWindow.focus()
  frame.contentWindow.print()
  window.setTimeout(() => frame.remove(), 1000)
}

export default function Receipt({ sale, items, customer, payments, onClose }) {
  const itemName = (itemId) => items.find((item) => item.id === itemId)?.name || 'Item'
  const change = payments.reduce((sum, payment) => sum + (Number(payment.changeDue) || 0), 0)

  return (
    <div className="mx-auto max-w-sm rounded-2xl border border-line bg-white p-5 text-sm shadow-sm">
      <p className="text-center font-display text-2xl text-ink">Treats by Kit</p>
      <p className="mt-1 text-center font-medium">{sale.saleNumber}</p>
      <p className="text-center text-muted">{formatDateTime(sale.soldAt)}</p>
      <p className="mb-4 text-center text-muted">{customer?.name || 'Walk-in'}</p>
      <ul className="space-y-2 border-t border-dashed border-line pt-3">
        {(sale.lines || []).map((line) => (
          <li key={line.id || line.itemId} className="flex justify-between gap-3">
            <span>
              {itemName(line.itemId)}
              <span className="block text-muted">
                {formatQuantity(line.quantity)} × {formatCurrency(line.unitPrice)}
              </span>
            </span>
            <span className="tabular-nums">{formatCurrency(line.lineTotal)}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-3 space-y-1 border-t border-dashed border-line pt-3">
        <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums">{formatCurrency(sale.subtotal)}</dd></div>
        <div className="flex justify-between"><dt className="text-muted">Discount</dt><dd className="tabular-nums">{formatCurrency(sale.discountAmount)}</dd></div>
        <div className="flex justify-between text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatCurrency(sale.total)}</dd></div>
        {payments.map((payment) => (
          <div key={payment.id} className="flex justify-between">
            <dt className="text-muted">{paymentMethodLabel(payment.method)}</dt>
            <dd className="tabular-nums">{formatCurrency(payment.amount)}</dd>
          </div>
        ))}
        {change > 0 ? (
          <div className="flex justify-between"><dt className="text-muted">Change</dt><dd className="tabular-nums">{formatCurrency(change)}</dd></div>
        ) : null}
        {sale.balance > 0 ? (
          <div className="flex justify-between"><dt className="text-muted">Balance due</dt><dd className="tabular-nums">{formatCurrency(sale.balance)}</dd></div>
        ) : null}
      </dl>
      <p className="mt-4 text-center text-muted">Thank you.</p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Done</Button>
        <Button onClick={() => printReceipt({ sale, items, customer, payments })}>Print</Button>
      </div>
    </div>
  )
}
