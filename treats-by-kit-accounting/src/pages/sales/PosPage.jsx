import { Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import CustomerBook from '../../components/sales/CustomerBook'
import Receipt from '../../components/sales/Receipt'
import Button from '../../components/ui/Button'
import { buttonClass } from '../../components/ui/buttonStyles'
import EmptyState from '../../components/ui/EmptyState'
import Field, { controlClass } from '../../components/ui/Field'
import Modal from '../../components/ui/Modal'
import PageHeader from '../../components/ui/PageHeader'
import { completeSale, decorateSale, PAYMENT_METHODS } from '../../data/sales'
import { COLLECTIONS } from '../../data/seed'
import { getAll } from '../../data/storage'
import { useRefresh } from '../../hooks/useRefresh'
import { formatCurrency, formatQuantity, nowLocalISO, todayISODate } from '../../utils/format'
import { generateId } from '../../utils/id'
import { getStockOnHand } from '../../utils/inventory'
import { calculateCart } from '../../utils/sales'

function priceSet(item) {
  return item.sellingPrice != null && item.sellingPrice !== '' && Number.isFinite(Number(item.sellingPrice))
}

export default function PosPage() {
  const [saving, setSaving] = useState(false)
  const [, refresh] = useRefresh()
  const [query, setQuery] = useState('')
  const [lines, setLines] = useState([])
  const [discountType, setDiscountType] = useState('amount')
  const [discountValue, setDiscountValue] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [payLater, setPayLater] = useState(false)
  const [method, setMethod] = useState('cash')
  const [amountReceived, setAmountReceived] = useState('')
  const [errors, setErrors] = useState({})
  const [cartOpen, setCartOpen] = useState(false)
  const [customersOpen, setCustomersOpen] = useState(false)
  const [receipt, setReceipt] = useState(null)

  const items = getAll(COLLECTIONS.ITEMS)
  const movements = getAll(COLLECTIONS.STOCK_MOVEMENTS)
  const customers = getAll(COLLECTIONS.CUSTOMERS).sort((a, b) => a.name.localeCompare(b.name))
  const products = items
    .filter((item) => item.category === 'finished_good')
    .map((item) => ({ ...item, onHand: getStockOnHand(item.id, movements) }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const visible = products.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase()))
  const onHandFor = (itemId) => products.find((item) => item.id === itemId)?.onHand ?? 0
  const cart = calculateCart(lines, { type: discountType, value: discountValue })
  const count = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0)
  const received = Number(amountReceived)
  const change = method === 'cash' && Number.isFinite(received) && received > cart.total ? received - cart.total : 0

  function addProduct(item) {
    if (!priceSet(item) || item.onHand <= 0) return
    setLines((current) => {
      const existing = current.find((line) => line.itemId === item.id)
      if (existing) {
        if ((Number(existing.quantity) || 0) + 1 > item.onHand) return current
        return current.map((line) =>
          line.itemId === item.id ? { ...line, quantity: String((Number(line.quantity) || 0) + 1) } : line,
        )
      }
      return [
        ...current,
        { id: generateId('line'), itemId: item.id, name: item.name, unit: item.unit, quantity: '1', unitPrice: item.sellingPrice },
      ]
    })
    setErrors({})
  }

  function setQuantity(lineId, quantity) {
    setLines((current) => current.map((line) => (line.id === lineId ? { ...line, quantity } : line)))
  }

  function finish(sale, payment) {
    const payments = payment ? [payment] : []
    const decorated = decorateSale(sale, payments)
    setReceipt({ sale: decorated, payments })
    setLines([])
    setDiscountValue('')
    setAmountReceived('')
    setPayLater(false)
    setErrors({})
    setCartOpen(false)
    refresh()
  }

  async function submit(event) {
    setSaving(true)
    try {
    event.preventDefault()
    const result = await completeSale({
      date: todayISODate(),
      soldAt: nowLocalISO(),
      customerId,
      source: 'pos',
      lines,
      discount: { type: discountType, value: discountValue },
      payLater,
      payment: payLater ? null : { method, amountReceived, date: todayISODate() },
    })
    if (!result.ok) {
      setErrors(result.errors)
      setCartOpen(true)
      return
    }
    finish(result.sale, result.payment)
  
    } finally {
      setSaving(false)
    }
  }

  const cartForm = (
    <form className="flex h-full flex-col" onSubmit={submit} noValidate>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="text-lg font-semibold text-ink">Cart</h2>
        <button type="button" className="text-sm text-muted lg:hidden" onClick={() => setCartOpen(false)}>
          Close
        </button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {errors.form ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{errors.form}</p> : null}
        {lines.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">Tap a product to add it.</p>
        ) : (
          <ul className="space-y-3">
            {lines.map((line, index) => {
              const onHand = onHandFor(line.itemId)
              const over = (Number(line.quantity) || 0) > onHand
              const lineError = errors.lineErrors?.[index] || {}
              return (
                <li key={line.id} className="rounded-xl border border-line p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{line.name}</p>
                      <p className="text-sm text-muted">{formatCurrency(line.unitPrice)} · {formatQuantity(onHand)} on hand</p>
                    </div>
                    <button type="button" className="text-sm text-accent" onClick={() => setLines(lines.filter((entry) => entry.id !== line.id))}>
                      Remove
                    </button>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="inline-flex size-11 items-center justify-center rounded-lg border border-line text-lg"
                        aria-label={`Decrease ${line.name}`}
                        onClick={() => setQuantity(line.id, String(Math.max(1, (Number(line.quantity) || 1) - 1)))}
                      >
                        −
                      </button>
                      <input
                        className={`${controlClass} w-16 text-center`}
                        inputMode="decimal"
                        aria-label={`${line.name} quantity`}
                        value={line.quantity}
                        onChange={(event) => setQuantity(line.id, event.target.value)}
                      />
                      <button
                        type="button"
                        className="inline-flex size-11 items-center justify-center rounded-lg border border-line text-lg disabled:opacity-40"
                        aria-label={`Increase ${line.name}`}
                        disabled={(Number(line.quantity) || 0) >= onHand}
                        onClick={() => setQuantity(line.id, String((Number(line.quantity) || 0) + 1))}
                      >
                        +
                      </button>
                    </div>
                    <p className="font-medium tabular-nums">{formatCurrency((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0))}</p>
                  </div>
                  {over ? <p className="mt-2 text-sm text-red-800">Only {formatQuantity(onHand)} {line.unit} on hand.</p> : null}
                  {lineError.quantity ? <p className="mt-2 text-sm text-red-800">{lineError.quantity}</p> : null}
                </li>
              )
            })}
          </ul>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Discount" htmlFor="pos-discount-type">
            <select id="pos-discount-type" className={controlClass} value={discountType} onChange={(event) => setDiscountType(event.target.value)}>
              <option value="amount">Amount</option>
              <option value="percent">Percent</option>
            </select>
          </Field>
          <Field label={discountType === 'percent' ? 'Percent' : 'Amount'} htmlFor="pos-discount" error={errors.discount}>
            <input
              id="pos-discount"
              className={controlClass}
              inputMode="decimal"
              value={discountValue}
              onChange={(event) => setDiscountValue(event.target.value)}
            />
          </Field>
        </div>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums">{formatCurrency(cart.subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Discount</dt><dd className="tabular-nums">{formatCurrency(cart.discountAmount)}</dd></div>
          <div className="flex justify-between text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatCurrency(cart.total)}</dd></div>
        </dl>

        <Field label="Customer" htmlFor="pos-customer" error={errors.customerId} hint="Optional, except for pay later or a partial payment.">
          <div className="flex gap-2">
            <select id="pos-customer" className={controlClass} value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
              <option value="">Walk-in</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.name}</option>
              ))}
            </select>
            <Button variant="secondary" className="shrink-0" onClick={() => setCustomersOpen(true)}>Add</Button>
          </div>
        </Field>

        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={payLater} onChange={(event) => setPayLater(event.target.checked)} />
          Pay later
        </label>
        {payLater ? null : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Method" htmlFor="pos-method" error={errors.method}>
              <select id="pos-method" className={controlClass} value={method} onChange={(event) => setMethod(event.target.value)}>
                {PAYMENT_METHODS.map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Amount received" htmlFor="pos-received" error={errors.amountReceived}>
              <input
                id="pos-received"
                className={controlClass}
                inputMode="decimal"
                value={amountReceived}
                onChange={(event) => setAmountReceived(event.target.value)}
              />
            </Field>
          </div>
        )}
        {method === 'cash' && !payLater ? (
          <p className="text-sm text-muted">Change due {formatCurrency(change)}</p>
        ) : null}
      </div>
      <div className="border-t border-line p-4">
        <Button type="submit" className="min-h-12 w-full" disabled={saving || lines.length === 0}>Complete Sale</Button>
      </div>
    </form>
  )

  return (
    <div className="pb-24 lg:pb-0">
      <PageHeader title="Point of Sale" description="Sell finished goods. Stock is reduced when the sale is completed." />
      {products.length === 0 ? (
        <EmptyState
          title="No finished goods yet"
          description="Add a product and a selling price before using the register."
          action={<Link to="/inventory/finished-goods" className={buttonClass()}>Finished goods</Link>}
        />
      ) : (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-6">
          <section>
            <div className="relative mb-4">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <input
                className={`${controlClass} pl-9`}
                value={query}
                placeholder="Search products"
                aria-label="Search products"
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            {visible.length === 0 ? (
              <EmptyState title="No products match" description="Try another name." />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {visible.map((item) => {
                  const ready = priceSet(item)
                  const disabled = !ready || item.onHand <= 0
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => addProduct(item)}
                      className="flex min-h-28 flex-col items-start justify-between rounded-2xl border border-line bg-white p-4 text-left shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="font-medium">{item.name}</span>
                      <span className="text-sm text-muted">
                        {ready ? formatCurrency(item.sellingPrice) : 'Not set'}
                        <span className="block">{item.onHand <= 0 ? 'Out of stock' : `${formatQuantity(item.onHand)} ${item.unit}`}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </section>
          <aside
            className={`${cartOpen ? 'max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40 max-lg:h-[85vh] max-lg:rounded-t-2xl' : 'max-lg:hidden'} overflow-hidden border border-line bg-white lg:sticky lg:top-20 lg:z-auto lg:block lg:max-h-[calc(100vh-6rem)] lg:rounded-2xl`}
          >
            {cartForm}
          </aside>
        </div>
      )}

      {products.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white p-3 lg:hidden">
          <button type="button" className="flex min-h-12 w-full items-center justify-between rounded-xl bg-accent px-4 text-white" onClick={() => setCartOpen(true)}>
            <span>Cart ({formatQuantity(count)})</span>
            <span className="tabular-nums">{formatCurrency(cart.total)}</span>
          </button>
        </div>
      ) : null}

      {cartOpen ? (
        <button type="button" className="fixed inset-0 z-30 bg-ink/40 lg:hidden" aria-label="Close cart" onClick={() => setCartOpen(false)} />
      ) : null}

      {customersOpen ? (
        <CustomerBook
          customers={customers}
          onClose={() => setCustomersOpen(false)}
          onChange={refresh}
          onPick={(customer) => {
            setCustomerId(customer.id)
            setCustomersOpen(false)
            refresh()
          }}
        />
      ) : null}

      {receipt ? (
        <Modal title="Receipt" onClose={() => setReceipt(null)}>
          <Receipt
            sale={receipt.sale}
            items={items}
            customer={customers.find((customer) => customer.id === receipt.sale.customerId)}
            payments={receipt.payments}
            onClose={() => setReceipt(null)}
          />
        </Modal>
      ) : null}
    </div>
  )
}
