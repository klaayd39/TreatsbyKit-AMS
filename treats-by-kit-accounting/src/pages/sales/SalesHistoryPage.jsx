import { Search } from 'lucide-react'
import { useState } from 'react'
import SaleDetail from '../../components/sales/SaleDetail'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import DataTable from '../../components/ui/DataTable'
import EmptyState from '../../components/ui/EmptyState'
import Field, { controlClass } from '../../components/ui/Field'
import Modal from '../../components/ui/Modal'
import PageHeader from '../../components/ui/PageHeader'
import { decorateSale, PAYMENT_METHODS, PAYMENT_STATUS_LABELS, recordPayment, voidSale } from '../../data/sales'
import { COLLECTIONS } from '../../data/seed'
import { getAll } from '../../data/storage'
import { useRefresh } from '../../hooks/useRefresh'
import { formatCurrency, formatDate, formatQuantity, todayISODate } from '../../utils/format'

function paymentTone(status) {
  if (status === 'paid') return 'success'
  if (status === 'partial') return 'warning'
  return 'neutral'
}

export default function SalesHistoryPage() {
  const [saving, setSaving] = useState(false)
  const [, refresh] = useRefresh()
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [customerFilter, setCustomerFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [detailId, setDetailId] = useState(null)
  const [paymentSale, setPaymentSale] = useState(null)
  const [paymentDraft, setPaymentDraft] = useState({ amount: '', method: 'cash', date: '' })
  const [voidTarget, setVoidTarget] = useState(null)
  const [voidReason, setVoidReason] = useState('')
  const [errors, setErrors] = useState({})
  const [notice, setNotice] = useState('')

  const sales = getAll(COLLECTIONS.SALES)
  const payments = getAll(COLLECTIONS.PAYMENTS)
  const customers = getAll(COLLECTIONS.CUSTOMERS).sort((a, b) => a.name.localeCompare(b.name))
  const items = getAll(COLLECTIONS.ITEMS)
  const customerName = (id) => customers.find((customer) => customer.id === id)?.name || 'Walk-in'
  const itemName = (id) => items.find((item) => item.id === id)?.name || 'Item'
  const rows = sales
    .map((sale) => decorateSale(sale, payments))
    .filter((sale) => {
      if (dateFrom && sale.date < dateFrom) return false
      if (dateTo && sale.date > dateTo) return false
      if (statusFilter && sale.paymentStatus !== statusFilter) return false
      if (customerFilter && sale.customerId !== customerFilter) return false
      if (sourceFilter && sale.source !== sourceFilter) return false
      const query = search.trim().toLowerCase()
      if (!query) return true
      return `${sale.saleNumber} ${customerName(sale.customerId)}`.toLowerCase().includes(query)
    })
    .sort((a, b) => String(b.soldAt).localeCompare(String(a.soldAt)))

  const detail = detailId ? rows.find((sale) => sale.id === detailId) || null : null

  function openPayment(sale) {
    setErrors({})
    setPaymentSale(sale)
    setPaymentDraft({ amount: String(sale.balance), method: 'cash', date: todayISODate() })
  }

  async function submitPayment(event) {
    setSaving(true)
    try {
    event.preventDefault()
    const result = await recordPayment(paymentSale.id, paymentDraft)
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setPaymentSale(null)
    setNotice(`Payment recorded on ${paymentSale.saleNumber}.`)
    refresh()
  
    } finally {
      setSaving(false)
    }
  }

  async function submitVoid(event) {
    setSaving(true)
    try {
    event.preventDefault()
    const result = await voidSale(voidTarget.id, voidReason)
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setVoidTarget(null)
    setDetailId(null)
    setNotice(`${result.sale.saleNumber} was voided and the stock was returned.`)
    refresh()
  
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader title="Past sales" description="Completed sales stay on the books. Voiding puts the items back." />
      {notice ? <p className="mb-4 rounded-lg bg-sand px-3 py-2 text-sm text-ink">{notice}</p> : null}
      {sales.length === 0 ? (
        <EmptyState title="No sales yet" description="Complete a sale from the register or from an order." />
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <input className={`${controlClass} pl-9`} value={search} placeholder="Search sale or customer" aria-label="Search sales" onChange={(event) => setSearch(event.target.value)} />
            </div>
            <select className={controlClass} value={statusFilter} aria-label="Filter by payment status" onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">All payment statuses</option>
              {Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <select className={controlClass} value={customerFilter} aria-label="Filter by customer" onChange={(event) => setCustomerFilter(event.target.value)}>
              <option value="">All customers</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.name}</option>
              ))}
            </select>
            <select className={controlClass} value={sourceFilter} aria-label="Filter by source" onChange={(event) => setSourceFilter(event.target.value)}>
              <option value="">All sources</option>
              <option value="pos">POS</option>
              <option value="order">Order</option>
            </select>
            <input type="date" className={controlClass} value={dateFrom} aria-label="Sale date from" onChange={(event) => setDateFrom(event.target.value)} />
            <input type="date" className={controlClass} value={dateTo} aria-label="Sale date to" onChange={(event) => setDateTo(event.target.value)} />
          </div>
          {rows.length === 0 ? (
            <EmptyState title="No sales match" description="Try another date, customer, or payment status." />
          ) : (
            <DataTable>
              <thead className="bg-sand/50">
                <tr>
                  <th scope="col">Sale</th>
                  <th scope="col">Date</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Items</th>
                  <th scope="col" className="text-right">Total</th>
                  <th scope="col">Payment</th>
                  <th scope="col">Source</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((sale) => (
                  <tr key={sale.id}>
                    <td>
                      <button type="button" className="font-medium underline-offset-2 hover:text-accent hover:underline" onClick={() => setDetailId(sale.id)}>
                        {sale.saleNumber}
                      </button>
                    </td>
                    <td>{formatDate(sale.date)}</td>
                    <td>{customerName(sale.customerId)}</td>
                    <td className="max-w-xs">{sale.lines.map((line) => `${formatQuantity(line.quantity)} ${itemName(line.itemId)}`).join(', ')}</td>
                    <td className="text-right tabular-nums">{formatCurrency(sale.total)}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={paymentTone(sale.paymentStatus)}>{PAYMENT_STATUS_LABELS[sale.paymentStatus]}</Badge>
                        {sale.status === 'voided' ? <Badge tone="danger">Voided</Badge> : null}
                      </div>
                    </td>
                    <td>{sale.source === 'order' ? 'Order' : 'POS'}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </>
      )}

      {detail ? (
        <Modal title={detail.saleNumber} onClose={() => setDetailId(null)} size="lg">
          <SaleDetail sale={detail} items={items} customer={customers.find((customer) => customer.id === detail.customerId)} payments={payments} />
          {detail.status === 'voided' ? null : (
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              {detail.balance > 0 ? <Button variant="secondary" onClick={() => openPayment(detail)}>Record payment</Button> : null}
              <Button variant="danger" onClick={() => { setVoidTarget(detail); setVoidReason(''); setErrors({}) }}>Void sale</Button>
            </div>
          )}
        </Modal>
      ) : null}

      {paymentSale ? (
        <Modal title={`Payment for ${paymentSale.saleNumber}`} onClose={() => setPaymentSale(null)}>
          <form className="space-y-4" onSubmit={submitPayment} noValidate>
            <p className="text-sm text-muted">Balance due {formatCurrency(paymentSale.balance)}.</p>
            {errors.form ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{errors.form}</p> : null}
            <Field label="Amount" htmlFor="pay-amount" error={errors.amount}>
              <input id="pay-amount" className={controlClass} inputMode="decimal" value={paymentDraft.amount} onChange={(event) => setPaymentDraft({ ...paymentDraft, amount: event.target.value })} />
            </Field>
            <Field label="Method" htmlFor="pay-method" error={errors.method}>
              <select id="pay-method" className={controlClass} value={paymentDraft.method} onChange={(event) => setPaymentDraft({ ...paymentDraft, method: event.target.value })}>
                {PAYMENT_METHODS.map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Date" htmlFor="pay-date" error={errors.date}>
              <input id="pay-date" type="date" className={controlClass} value={paymentDraft.date} onChange={(event) => setPaymentDraft({ ...paymentDraft, date: event.target.value })} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPaymentSale(null)}>Cancel</Button>
              <Button type="submit" disabled={saving}>Record payment</Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {voidTarget ? (
        <Modal title={`Void ${voidTarget.saleNumber}`} onClose={() => setVoidTarget(null)}>
          <form className="space-y-4" onSubmit={submitVoid} noValidate>
            <p className="text-sm">This returns the sold items to stock at the original cost and marks the sale voided. It stays in history and drops out of reports.</p>
            {errors.form ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{errors.form}</p> : null}
            <Field label="Reason" htmlFor="void-reason" error={errors.reason}>
              <textarea id="void-reason" className={controlClass} rows={3} value={voidReason} onChange={(event) => setVoidReason(event.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setVoidTarget(null)}>Keep sale</Button>
              <Button variant="danger" type="submit" disabled={saving}>Void sale</Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  )
}
