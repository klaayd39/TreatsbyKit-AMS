import JournalLinks from '../accounting/JournalLinks'
import LastChanged from '../LastChanged'
import Badge from '../ui/Badge'
import DataTable from '../ui/DataTable'
import { paymentMethodLabel, PAYMENT_STATUS_LABELS } from '../../data/sales'
import { formatCurrency, formatDate, formatDateTime, formatQuantity } from '../../utils/format'

function paymentTone(status) {
  if (status === 'paid') return 'success'
  if (status === 'partial') return 'warning'
  return 'neutral'
}

export default function SaleDetail({ sale, items, customer, payments }) {
  const itemName = (itemId) => items.find((item) => item.id === itemId)?.name || 'Unknown item'
  const salePayments = payments.filter((payment) => payment.saleId === sale.id)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={paymentTone(sale.paymentStatus)}>{PAYMENT_STATUS_LABELS[sale.paymentStatus]}</Badge>
        {sale.status === 'voided' ? <Badge tone="danger">Voided</Badge> : null}
        <Badge>{sale.source === 'order' ? 'Order' : 'POS'}</Badge>
        <span className="text-sm text-muted">{formatDateTime(sale.soldAt)}</span>
      </div>
      <p className="text-sm text-ink">{customer?.name || 'Walk-in'}</p>
      <LastChanged table="sales" id={sale.id} />
      {sale.status === 'voided' && sale.voidReason ? (
        <p className="rounded-lg bg-sand px-3 py-2 text-sm text-ink">Voided: {sale.voidReason}</p>
      ) : null}
      <DataTable>
        <thead className="bg-sand/50">
          <tr>
            <th scope="col">Item</th>
            <th scope="col" className="text-right">Qty</th>
            <th scope="col" className="text-right">Price</th>
            <th scope="col" className="text-right">Line total</th>
            <th scope="col" className="text-right">Unit cost</th>
            <th scope="col" className="text-right">COGS</th>
          </tr>
        </thead>
        <tbody>
          {(sale.lines || []).map((line) => (
            <tr key={line.id || line.itemId}>
              <td>{itemName(line.itemId)}</td>
              <td className="text-right tabular-nums">{formatQuantity(line.quantity)}</td>
              <td className="text-right tabular-nums">{formatCurrency(line.unitPrice)}</td>
              <td className="text-right tabular-nums">{formatCurrency(line.lineTotal)}</td>
              <td className="text-right tabular-nums">{formatCurrency(line.unitCost)}</td>
              <td className="text-right tabular-nums">{formatCurrency(line.cogs)}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-3"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums">{formatCurrency(sale.subtotal)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">Discount</dt><dd className="tabular-nums">{formatCurrency(sale.discountAmount)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">Total</dt><dd className="font-semibold tabular-nums">{formatCurrency(sale.total)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">Amount paid</dt><dd className="tabular-nums">{formatCurrency(sale.amountPaid)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">Balance</dt><dd className="tabular-nums">{formatCurrency(sale.balance)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">COGS</dt><dd className="tabular-nums">{formatCurrency(sale.cogsTotal)}</dd></div>
        <div className="flex justify-between gap-3 sm:col-span-2"><dt className="font-medium text-ink">Gross profit</dt><dd className="font-semibold tabular-nums">{formatCurrency(sale.grossProfit)}</dd></div>
        <div className="flex justify-between gap-3 sm:col-span-2"><dt className="text-muted">Journal</dt><dd><JournalLinks sourceIds={[sale.id, ...salePayments.map((payment) => payment.id)]} /></dd></div>
      </dl>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink">Payments</h3>
        {salePayments.length === 0 ? (
          <p className="text-sm text-muted">No payments recorded.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {salePayments.map((payment) => (
              <li key={payment.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span>{formatDate(payment.date)} · {paymentMethodLabel(payment.method)}{payment.kind === 'refund' ? ' refund' : ''}</span>
                <span className="tabular-nums">{formatCurrency(payment.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
