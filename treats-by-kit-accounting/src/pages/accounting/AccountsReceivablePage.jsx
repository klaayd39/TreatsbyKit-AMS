import { useState } from 'react'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import DataTable from '../../components/ui/DataTable'
import EmptyState from '../../components/ui/EmptyState'
import Field, { controlClass } from '../../components/ui/Field'
import Modal from '../../components/ui/Modal'
import PageHeader from '../../components/ui/PageHeader'
import { decorateSale, PAYMENT_METHODS, paymentMethodLabel, recordPayment, refundVoidedSale } from '../../data/sales'
import { COLLECTIONS } from '../../data/seed'
import { getAll } from '../../data/storage'
import { useRefresh } from '../../hooks/useRefresh'
import { daysBetween, getAgingBucket } from '../../utils/aging'
import { formatCurrency, formatDate, todayISODate } from '../../utils/format'
import { sum, toCentavos } from '../../utils/money'

export default function AccountsReceivablePage() {
  const [saving, setSaving] = useState(false)
  const [, refresh] = useRefresh()
  const [asOf] = useState(() => todayISODate())
  const [view, setView] = useState('sales')
  const [payment, setPayment] = useState(null)
  const [errors, setErrors] = useState({})
  const [notice, setNotice] = useState('')

  const payments = getAll(COLLECTIONS.PAYMENTS)
  const customers = getAll(COLLECTIONS.CUSTOMERS)
  const sales = getAll(COLLECTIONS.SALES).map((sale) => decorateSale(sale, payments))
  const customerName = (id) => customers.find((customer) => customer.id === id)?.name || 'Walk-in'

  const openSales = sales
    .filter((sale) => sale.status !== 'voided' && toCentavos(sale.balance) > 0)
    .map((sale) => {
      const days = Math.max(0, daysBetween(sale.date, asOf))
      return { ...sale, days, bucket: getAgingBucket(sale.date, asOf) }
    })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))

  const credits = sales
    .filter((sale) => sale.status === 'voided' && toCentavos(sale.amountPaid) > 0)
    .map((sale) => ({ ...sale, credit: sale.amountPaid }))

  const totalReceivable = sum(openSales.map((sale) => sale.balance))
  const overdue = sum(openSales.filter((sale) => sale.days > 30).map((sale) => sale.balance))
  const customersWithBalances = new Set(openSales.map((sale) => sale.customerId).filter(Boolean)).size

  const customerRows = customers
    .map((customer) => {
      const rows = sales.filter((sale) => sale.customerId === customer.id && sale.status !== 'voided')
      const owed = sum(rows.map((sale) => sale.balance))
      const history = payments.filter((payment) => sales.some((sale) => sale.id === payment.saleId && sale.customerId === customer.id))
      return { ...customer, owed, history }
    })
    .filter((customer) => customer.history.length > 0 || toCentavos(customer.owed) > 0)
    .sort((a, b) => b.owed - a.owed || a.name.localeCompare(b.name))

  async function submit(event) {
    setSaving(true)
    try {
    event.preventDefault()
    const result = payment.kind === 'refund'
      ? await refundVoidedSale(payment.id, payment)
      : await recordPayment(payment.id, payment)
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setPayment(null)
    setNotice(payment.kind === 'refund' ? 'Refund recorded. The credit was cleared against cash.' : 'Customer payment recorded.')
    refresh()
  
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Customer tabs"
        description="Open sales are amounts still owed. A payment on a voided sale stays as a customer credit until you refund it."
      />
      {notice ? <p className="mb-4 rounded-xl bg-sand px-4 py-3 text-sm text-ink">{notice}</p> : null}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card title="Total receivable" value={formatCurrency(totalReceivable)} />
        <Card title="Overdue" value={formatCurrency(overdue)} hint="Older than 30 days" />
        <Card title="Customers with balances" value={String(customersWithBalances)} />
      </div>
      <div className="mb-4 flex gap-2">
        <Button variant={view === 'sales' ? 'primary' : 'secondary'} onClick={() => setView('sales')}>Sales</Button>
        <Button variant={view === 'customers' ? 'primary' : 'secondary'} onClick={() => setView('customers')}>Customers</Button>
      </div>

      {view === 'sales' ? (
        <div className="space-y-8">
          {openSales.length === 0 ? (
            <EmptyState title="No open sales" description="Pay-later and partially paid sales show up here." />
          ) : (
            <DataTable>
              <thead className="bg-sand/50">
                <tr>
                  <th scope="col">Sale</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Date</th>
                  <th scope="col" className="text-right">Total</th>
                  <th scope="col" className="text-right">Paid</th>
                  <th scope="col" className="text-right">Balance</th>
                  <th scope="col" className="text-right">Days</th>
                  <th scope="col">Aging</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {openSales.map((sale) => (
                  <tr key={sale.id}>
                    <td className="font-medium whitespace-nowrap">{sale.saleNumber}</td>
                    <td>{customerName(sale.customerId)}</td>
                    <td className="whitespace-nowrap">{formatDate(sale.date)}</td>
                    <td className="text-right tabular-nums">{formatCurrency(sale.total)}</td>
                    <td className="text-right tabular-nums">{formatCurrency(sale.amountPaid)}</td>
                    <td className="text-right tabular-nums">{formatCurrency(sale.balance)}</td>
                    <td className="text-right tabular-nums">{sale.days}</td>
                    <td><Badge tone={sale.bucket === 'Current' ? 'neutral' : 'warning'}>{sale.bucket}</Badge></td>
                    <td className="text-right">
                      <Button variant="ghost" onClick={() => { setErrors({}); setPayment({ kind: 'payment', id: sale.id, title: sale.saleNumber, amount: String(sale.balance), method: 'cash', date: asOf }) }}>
                        Record payment
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}

          <section>
            <h2 className="mb-2 text-sm font-semibold text-ink">Customer credits</h2>
            <p className="mb-3 text-sm text-muted">Payments already received on a voided sale stay as a credit until refunded.</p>
            {credits.length === 0 ? (
              <EmptyState title="No customer credits" description="Voided sales with a remaining payment show up here." />
            ) : (
              <DataTable>
                <thead className="bg-sand/50">
                  <tr>
                    <th scope="col">Sale</th>
                    <th scope="col">Customer</th>
                    <th scope="col" className="text-right">Credit</th>
                    <th scope="col"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {credits.map((sale) => (
                    <tr key={sale.id}>
                      <td className="font-medium">{sale.saleNumber}</td>
                      <td>{customerName(sale.customerId)}</td>
                      <td className="text-right tabular-nums">{formatCurrency(sale.credit)}</td>
                      <td className="text-right">
                        <Button variant="ghost" onClick={() => { setErrors({}); setPayment({ kind: 'refund', id: sale.id, title: sale.saleNumber, amount: String(sale.credit), method: 'cash', date: asOf }) }}>
                          Refund
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </section>
        </div>
      ) : customerRows.length === 0 ? (
        <EmptyState title="No customer balances" description="Customers with open sales or payments are listed here." />
      ) : (
        <div className="space-y-4">
          {customerRows.map((customer) => (
            <section key={customer.id} className="rounded-2xl border border-line bg-white p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold text-ink">{customer.name}</h2>
                <p className="text-sm">Owed <span className="font-semibold tabular-nums">{formatCurrency(customer.owed)}</span></p>
              </div>
              {customer.history.length === 0 ? <p className="mt-3 text-sm text-muted">No payments yet.</p> : (
                <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
                  {customer.history.map((entry) => (
                    <li key={entry.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span>{formatDate(entry.date)} · {paymentMethodLabel(entry.method)}{entry.kind === 'refund' ? ' refund' : ''}</span>
                      <span className="tabular-nums">{formatCurrency(entry.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      {payment ? (
        <Modal title={payment.kind === 'refund' ? `Refund ${payment.title}` : `Pay ${payment.title}`} onClose={() => setPayment(null)}>
          <form className="space-y-4" onSubmit={submit} noValidate>
            {errors.form ? <p className="text-sm text-red-800">{errors.form}</p> : null}
            <Field label="Amount" htmlFor="ar-amount" error={errors.amount}>
              <input id="ar-amount" className={controlClass} inputMode="decimal" value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })} />
            </Field>
            <Field label="Method" htmlFor="ar-method" error={errors.method}>
              <select id="ar-method" className={controlClass} value={payment.method} onChange={(event) => setPayment({ ...payment, method: event.target.value })}>
                {PAYMENT_METHODS.map((method) => (
                  <option key={method.id} value={method.id}>{method.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Date" htmlFor="ar-date" error={errors.date}>
              <input id="ar-date" type="date" className={controlClass} value={payment.date} onChange={(event) => setPayment({ ...payment, date: event.target.value })} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPayment(null)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{payment.kind === 'refund' ? 'Record refund' : 'Record payment'}</Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  )
}
