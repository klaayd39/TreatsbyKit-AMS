import { Search, Trash } from 'lucide-react'
import { useState } from 'react'
import JournalLinks from '../../components/accounting/JournalLinks'
import CustomerBook from '../../components/sales/CustomerBook'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import DataTable from '../../components/ui/DataTable'
import EmptyState from '../../components/ui/EmptyState'
import Field, { controlClass } from '../../components/ui/Field'
import Modal from '../../components/ui/Modal'
import PageHeader from '../../components/ui/PageHeader'
import {
  advanceOrder,
  cancelOrder,
  completeOrder,
  createOrder,
  ORDER_STATUS_LABELS,
  orderBalanceDue,
  PAYMENT_METHODS,
} from '../../data/sales'
import { COLLECTIONS } from '../../data/seed'
import { getAll } from '../../data/storage'
import { useRefresh } from '../../hooks/useRefresh'
import { formatCurrency, formatDate, formatQuantity, nowLocalISO, todayISODate } from '../../utils/format'
import { generateId } from '../../utils/id'
import { calculateCart } from '../../utils/sales'

function statusTone(status) {
  if (status === 'completed' || status === 'ready') return 'success'
  if (status === 'confirmed') return 'accent'
  if (status === 'cancelled') return 'danger'
  return 'warning'
}

function blankLine() {
  return { id: generateId('line'), itemId: '', quantity: '', unitPrice: '' }
}

function blankOrder(date) {
  return {
    customerId: '',
    orderDate: date,
    fulfillmentDate: '',
    fulfillmentType: 'pickup',
    notes: '',
    discountType: 'amount',
    discountValue: '',
    downAmount: '',
    downMethod: 'cash',
    lines: [blankLine()],
  }
}

export default function OrdersPage() {
  const [saving, setSaving] = useState(false)
  const [, refresh] = useRefresh()
  const [screen, setScreen] = useState({ name: 'list' })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState({})
  const [customersOpen, setCustomersOpen] = useState(false)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [disposition, setDisposition] = useState('refund')
  const [completeAmount, setCompleteAmount] = useState('')
  const [completeMethod, setCompleteMethod] = useState('cash')
  const [notice, setNotice] = useState('')

  const orders = getAll(COLLECTIONS.ORDERS)
  const customers = getAll(COLLECTIONS.CUSTOMERS).sort((a, b) => a.name.localeCompare(b.name))
  const items = getAll(COLLECTIONS.ITEMS)
  const payments = getAll(COLLECTIONS.PAYMENTS)
  const sales = getAll(COLLECTIONS.SALES)
  const products = items.filter((item) => item.category === 'finished_good').sort((a, b) => a.name.localeCompare(b.name))
  const customerName = (id) => customers.find((customer) => customer.id === id)?.name || 'Unknown customer'
  const itemName = (id) => items.find((item) => item.id === id)?.name || 'Unknown item'

  const filtered = orders
    .filter((order) => {
      if (statusFilter && order.status !== statusFilter) return false
      if (dateFrom && order.orderDate < dateFrom) return false
      if (dateTo && order.orderDate > dateTo) return false
      const query = search.trim().toLowerCase()
      if (!query) return true
      return `${order.orderNumber} ${customerName(order.customerId)}`.toLowerCase().includes(query)
    })
    .sort((a, b) => String(b.orderDate).localeCompare(String(a.orderDate)) || String(b.createdAt).localeCompare(String(a.createdAt)))

  const active = screen.orderId ? orders.find((order) => order.id === screen.orderId) : null

  function openCreate() {
    setNotice('')
    setErrors({})
    setForm(blankOrder(todayISODate()))
    setScreen({ name: 'create' })
  }

  function chooseItem(lineId, itemId) {
    const item = products.find((entry) => entry.id === itemId)
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line) =>
        line.id === lineId
          ? { ...line, itemId, unitPrice: item && item.sellingPrice != null ? String(item.sellingPrice) : line.unitPrice }
          : line,
      ),
    }))
  }

  async function submitOrder(event) {
    setSaving(true)
    try {
    event.preventDefault()
    const result = await createOrder({
      ...form,
      discount: { type: form.discountType, value: form.discountValue },
      downPayment: { amount: form.downAmount, method: form.downMethod, date: form.orderDate },
    })
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setForm(null)
    setScreen({ name: 'detail', orderId: result.order.id })
    setNotice(`${result.order.orderNumber} was saved. Stock is unchanged until the order is completed.`)
    refresh()
  
    } finally {
      setSaving(false)
    }
  }

  async function runAdvance(order, status) {
    setSaving(true)
    try {
    const result = await advanceOrder(order.id, status)
    if (!result.ok) {
      setNotice(result.errors.form)
      return
    }
    refresh()
  
    } finally {
      setSaving(false)
    }
  }

  function openComplete(order) {
    const balance = orderBalanceDue(order, payments, sales)
    setCompleteAmount(String(balance))
    setCompleteMethod('cash')
    setErrors({})
    setScreen({ name: 'detail', orderId: order.id, completing: true })
  }

  async function submitComplete(event) {
    setSaving(true)
    try {
    event.preventDefault()
    const result = await completeOrder(active.id, {
      amount: completeAmount,
      method: completeMethod,
      date: todayISODate(),
      soldAt: nowLocalISO(),
    })
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setNotice(`${result.order.orderNumber} was completed as ${result.sale.saleNumber}.`)
    setScreen({ name: 'detail', orderId: active.id })
    refresh()
  
    } finally {
      setSaving(false)
    }
  }

  async function submitCancel(event) {
    setSaving(true)
    try {
    event.preventDefault()
    const result = await cancelOrder(cancelTarget.id, {
      reason: cancelReason,
      disposition,
      date: todayISODate(),
    })
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setCancelTarget(null)
    setNotice(`${result.order.orderNumber} was cancelled.`)
    refresh()
  
    } finally {
      setSaving(false)
    }
  }

  if (screen.name === 'create' && form) {
    const preview = calculateCart(form.lines, { type: form.discountType, value: form.discountValue })
    return (
      <>
        <PageHeader title="New order" description="Pick the customer, then the pies. Stock changes only when you complete the order." />
        <form className="space-y-6" onSubmit={submitOrder} noValidate>
          {errors.form ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{errors.form}</p> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Customer" htmlFor="order-customer" error={errors.customerId} hint={customers.length === 0 ? 'Add the person this order is for.' : 'Choose their name. The blank row is not a customer.'}>
              <div className="flex gap-2">
                <select id="order-customer" className={`${controlClass} min-w-0 flex-1`} value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value })}>
                  <option value="">Choose a customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>{customer.name}</option>
                  ))}
                </select>
                <Button variant="secondary" className="shrink-0" onClick={() => setCustomersOpen(true)}>Add</Button>
              </div>
            </Field>
            <Field label="Pickup or delivery" htmlFor="order-type" error={errors.fulfillmentType}>
              <select id="order-type" className={controlClass} value={form.fulfillmentType} onChange={(event) => setForm({ ...form, fulfillmentType: event.target.value })}>
                <option value="pickup">Pickup</option>
                <option value="delivery">Delivery</option>
              </select>
            </Field>
            <Field label="Order date" htmlFor="order-date" error={errors.orderDate}>
              <input id="order-date" type="date" className={controlClass} value={form.orderDate} onChange={(event) => setForm({ ...form, orderDate: event.target.value })} />
            </Field>
            <Field label="Pickup / delivery date" htmlFor="order-fulfill" error={errors.fulfillmentDate}>
              <input id="order-fulfill" type="date" className={controlClass} value={form.fulfillmentDate} onChange={(event) => setForm({ ...form, fulfillmentDate: event.target.value })} />
            </Field>
          </div>
          <Field label="Notes" htmlFor="order-notes">
            <textarea id="order-notes" className={controlClass} rows={2} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </Field>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Line items</h2>
              <Button variant="secondary" onClick={() => setForm({ ...form, lines: [...form.lines, blankLine()] })}>Add line</Button>
            </div>
            {errors.lines ? <p className="mb-2 text-sm text-red-800">{errors.lines}</p> : null}
            <div className="overflow-x-auto rounded-2xl border border-line">
              <table className="min-w-[720px] [&_td]:align-top">
                <thead className="bg-sand/50">
                  <tr>
                    <th scope="col">Item</th>
                    <th scope="col" className="text-right">Quantity</th>
                    <th scope="col" className="text-right">Price</th>
                    <th scope="col" className="text-right">Line total</th>
                    <th scope="col"><span className="sr-only">Remove</span></th>
                  </tr>
                </thead>
                <tbody>
                  {form.lines.map((line, index) => {
                    const lineErrors = errors.lineErrors?.[index] || {}
                    const lineTotal = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0)
                    return (
                      <tr key={line.id}>
                        <td className="min-w-52">
                          <select className={controlClass} value={line.itemId} aria-label="Item" onChange={(event) => chooseItem(line.id, event.target.value)}>
                            <option value="">Select a finished good</option>
                            {products.map((item) => (
                              <option key={item.id} value={item.id}>{item.name}</option>
                            ))}
                          </select>
                          {lineErrors.itemId ? <p className="mt-1 text-sm text-red-800">{lineErrors.itemId}</p> : null}
                        </td>
                        <td className="w-28">
                          <input className={`${controlClass} text-right`} inputMode="decimal" aria-label="Quantity" value={line.quantity} onChange={(event) => setForm({ ...form, lines: form.lines.map((entry) => entry.id === line.id ? { ...entry, quantity: event.target.value } : entry) })} />
                          {lineErrors.quantity ? <p className="mt-1 text-sm text-red-800">{lineErrors.quantity}</p> : null}
                        </td>
                        <td className="w-32">
                          <input className={`${controlClass} text-right`} inputMode="decimal" aria-label="Price" value={line.unitPrice} onChange={(event) => setForm({ ...form, lines: form.lines.map((entry) => entry.id === line.id ? { ...entry, unitPrice: event.target.value } : entry) })} />
                          {lineErrors.unitPrice ? <p className="mt-1 text-sm text-red-800">{lineErrors.unitPrice}</p> : null}
                        </td>
                        <td className="text-right tabular-nums">{formatCurrency(lineTotal)}</td>
                        <td className="w-12 text-right">
                          <button type="button" className="inline-flex size-8 items-center justify-center rounded-lg hover:bg-sand" aria-label="Remove line" onClick={() => setForm({ ...form, lines: form.lines.filter((entry) => entry.id !== line.id) })}>
                            <Trash className="size-4" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Discount type" htmlFor="order-discount-type">
              <select id="order-discount-type" className={controlClass} value={form.discountType} onChange={(event) => setForm({ ...form, discountType: event.target.value })}>
                <option value="amount">Amount</option>
                <option value="percent">Percent</option>
              </select>
            </Field>
            <Field label="Discount" htmlFor="order-discount" error={errors.discount}>
              <input id="order-discount" className={controlClass} inputMode="decimal" value={form.discountValue} onChange={(event) => setForm({ ...form, discountValue: event.target.value })} />
            </Field>
            <Field label="Down payment" htmlFor="order-down" error={errors.downPayment}>
              <input id="order-down" className={controlClass} inputMode="decimal" value={form.downAmount} onChange={(event) => setForm({ ...form, downAmount: event.target.value })} />
            </Field>
            <Field label="Down payment method" htmlFor="order-down-method" error={errors.downMethod}>
              <select id="order-down-method" className={controlClass} value={form.downMethod} onChange={(event) => setForm({ ...form, downMethod: event.target.value })}>
                {PAYMENT_METHODS.map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.label}</option>
                ))}
              </select>
            </Field>
          </div>
          <p className="text-right text-sm">Total <span className="ml-3 text-base font-semibold tabular-nums">{formatCurrency(preview.total)}</span></p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setScreen({ name: 'list' })}>Cancel</Button>
            <Button type="submit" disabled={saving}>Save order</Button>
          </div>
        </form>
        {customersOpen ? (
          <CustomerBook
            customers={customers}
            onClose={() => setCustomersOpen(false)}
            onChange={refresh}
            onPick={(customer) => {
              setForm((current) => ({ ...current, customerId: customer.id }))
              setCustomersOpen(false)
              refresh()
            }}
          />
        ) : null}
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Orders"
        description="Orders for later. Stock changes only when you complete one."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setCustomersOpen(true)}>Customers</Button>
            <Button onClick={openCreate}>New order</Button>
          </div>
        }
      />
      {notice ? <p className="mb-4 rounded-lg bg-sand px-3 py-2 text-sm text-ink">{notice}</p> : null}
      {orders.length === 0 ? (
        <EmptyState title="No orders yet" description="Create an order for pickup or delivery." action={<Button onClick={openCreate}>New order</Button>} />
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <input className={`${controlClass} pl-9`} value={search} placeholder="Search orders" aria-label="Search orders" onChange={(event) => setSearch(event.target.value)} />
            </div>
            <select className={controlClass} value={statusFilter} aria-label="Filter by status" onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">All statuses</option>
              {Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <input type="date" className={controlClass} value={dateFrom} aria-label="Order date from" onChange={(event) => setDateFrom(event.target.value)} />
            <input type="date" className={controlClass} value={dateTo} aria-label="Order date to" onChange={(event) => setDateTo(event.target.value)} />
          </div>
          {filtered.length === 0 ? (
            <EmptyState title="No orders match" description="Try another status, date, or customer." />
          ) : (
            <DataTable>
              <thead className="bg-sand/50">
                <tr>
                  <th scope="col">Order</th>
                  <th scope="col">Date</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Fulfillment</th>
                  <th scope="col" className="text-right">Total</th>
                  <th scope="col" className="text-right">Balance due</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <button type="button" className="font-medium underline-offset-2 hover:text-accent hover:underline" onClick={() => { setErrors({}); setScreen({ name: 'detail', orderId: order.id }) }}>
                        {order.orderNumber}
                      </button>
                    </td>
                    <td>{formatDate(order.orderDate)}</td>
                    <td>{customerName(order.customerId)}</td>
                    <td className="capitalize">{order.fulfillmentType} · {formatDate(order.fulfillmentDate)}</td>
                    <td className="text-right tabular-nums">{formatCurrency(order.total)}</td>
                    <td className="text-right tabular-nums">{formatCurrency(orderBalanceDue(order, payments, sales))}</td>
                    <td><Badge tone={statusTone(order.status)}>{ORDER_STATUS_LABELS[order.status]}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </>
      )}

      {active ? (
        <Modal title={active.orderNumber} onClose={() => setScreen({ name: 'list' })} size="lg">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={statusTone(active.status)}>{ORDER_STATUS_LABELS[active.status]}</Badge>
              <span className="text-sm text-muted">{customerName(active.customerId)}</span>
            </div>
            <p className="text-sm text-muted capitalize">{active.fulfillmentType} on {formatDate(active.fulfillmentDate)}. Balance due {formatCurrency(orderBalanceDue(active, payments, sales))}.</p>
            <p className="text-sm text-muted">Journal <JournalLinks sourceIds={[active.id, active.saleId, ...payments.filter((payment) => payment.orderId === active.id).map((payment) => payment.id)]} /></p>
            {active.notes ? <p className="text-sm">{active.notes}</p> : null}
            {active.status === 'cancelled' && active.cancelReason ? (
              <p className="rounded-lg bg-sand px-3 py-2 text-sm">Cancelled: {active.cancelReason}{active.downPaymentDisposition === 'retain' ? ' Down payment kept.' : ''}{active.downPaymentDisposition === 'refund' ? ' Down payment refunded.' : ''}</p>
            ) : null}
            <DataTable>
              <thead className="bg-sand/50">
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col" className="text-right">Qty</th>
                  <th scope="col" className="text-right">Price</th>
                  <th scope="col" className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {active.lines.map((line) => (
                  <tr key={line.id}>
                    <td>{itemName(line.itemId)}</td>
                    <td className="text-right tabular-nums">{formatQuantity(line.quantity)}</td>
                    <td className="text-right tabular-nums">{formatCurrency(line.unitPrice)}</td>
                    <td className="text-right tabular-nums">{formatCurrency(line.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
            <p className="text-right text-sm">Total <span className="ml-3 font-semibold tabular-nums">{formatCurrency(active.total)}</span></p>
            {screen.completing ? (
              <form className="space-y-3 rounded-xl border border-line p-4" onSubmit={submitComplete} noValidate>
                {errors.form ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{errors.form}</p> : null}
                <p className="text-sm text-muted">Collect any remaining balance. Stock is reduced when you complete the order.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Amount collected" htmlFor="complete-amount" error={errors.amount}>
                    <input id="complete-amount" className={controlClass} inputMode="decimal" value={completeAmount} onChange={(event) => setCompleteAmount(event.target.value)} />
                  </Field>
                  <Field label="Method" htmlFor="complete-method" error={errors.method}>
                    <select id="complete-method" className={controlClass} value={completeMethod} onChange={(event) => setCompleteMethod(event.target.value)}>
                      {PAYMENT_METHODS.map((entry) => (
                        <option key={entry.id} value={entry.id}>{entry.label}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setScreen({ name: 'detail', orderId: active.id })}>Back</Button>
                  <Button type="submit" disabled={saving}>Complete order</Button>
                </div>
              </form>
            ) : active.status === 'completed' || active.status === 'cancelled' ? null : (
              <div className="flex flex-wrap justify-end gap-2">
                {active.status === 'pending' ? <Button variant="secondary" onClick={() => runAdvance(active, 'confirmed')}>Confirm</Button> : null}
                {active.status === 'confirmed' ? <Button variant="secondary" onClick={() => runAdvance(active, 'ready')}>Mark ready</Button> : null}
                <Button variant="danger" onClick={() => { setCancelTarget(active); setCancelReason(''); setDisposition('refund'); setErrors({}) }}>Cancel order</Button>
                <Button onClick={() => openComplete(active)}>Complete order</Button>
              </div>
            )}
          </div>
        </Modal>
      ) : null}

      {cancelTarget ? (
        <Modal title={`Cancel ${cancelTarget.orderNumber}`} onClose={() => setCancelTarget(null)}>
          <form className="space-y-4" onSubmit={submitCancel} noValidate>
            <p className="text-sm">Cancelling does not change stock. {orderBalanceDue(cancelTarget, payments, sales) >= 0 && payments.some((payment) => payment.orderId === cancelTarget.id && payment.amount > 0) ? 'This order has a down payment.' : ''}</p>
            {errors.form ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{errors.form}</p> : null}
            <Field label="Reason" htmlFor="cancel-order-reason" error={errors.reason}>
              <textarea id="cancel-order-reason" className={controlClass} rows={3} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} />
            </Field>
            {payments.some((payment) => payment.orderId === cancelTarget.id) && payments.filter((payment) => payment.orderId === cancelTarget.id).reduce((sum, payment) => sum + payment.amount, 0) > 0 ? (
              <Field label="Down payment" htmlFor="cancel-disposition" error={errors.disposition}>
                <select id="cancel-disposition" className={controlClass} value={disposition} onChange={(event) => setDisposition(event.target.value)}>
                  <option value="refund">Refund the down payment</option>
                  <option value="retain">Keep the down payment</option>
                </select>
              </Field>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setCancelTarget(null)}>Keep order</Button>
              <Button variant="danger" type="submit" disabled={saving}>Cancel order</Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {customersOpen && screen.name !== 'create' ? (
        <CustomerBook customers={customers} onClose={() => setCustomersOpen(false)} onChange={refresh} />
      ) : null}
    </>
  )
}
