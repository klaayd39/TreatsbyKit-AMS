import { Trash } from 'lucide-react'
import { useState } from 'react'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Field, { controlClass } from '../ui/Field'
import {
  invoiceGrandTotal,
  invoiceHasReceipts,
  invoiceSubtotal,
  PAYMENT_STATUS_LABELS,
  paymentStatus,
  saveInvoice,
} from '../../data/purchasing'
import { formatCurrency } from '../../utils/format'
import { generateId } from '../../utils/id'

function emptyLine() {
  return { id: generateId('line'), itemId: '', quantity: '', unitPrice: '' }
}

function toDraft(invoice) {
  return {
    id: invoice.id,
    supplierId: invoice.supplierId,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate || '',
    paymentTerms: invoice.paymentTerms || '',
    notes: invoice.notes || '',
    lines: invoice.lines.map((line) => ({
      id: line.id,
      itemId: line.itemId,
      quantity: String(line.quantity),
      unitPrice: String(line.unitPrice),
    })),
  }
}

function blankDraft(defaultDate) {
  return {
    supplierId: '',
    invoiceNumber: '',
    invoiceDate: defaultDate,
    dueDate: '',
    paymentTerms: '',
    notes: '',
    lines: [emptyLine()],
  }
}

function paymentTone(status) {
  if (status === 'paid') return 'success'
  if (status === 'partial') return 'warning'
  return 'neutral'
}

export default function InvoiceForm({ invoice, suppliers, items, receipts, defaultDate, onCancel, onSaved }) {
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState(() => (invoice ? toDraft(invoice) : blankDraft(defaultDate)))
  const [errors, setErrors] = useState({})
  const locked = invoice ? invoiceHasReceipts(invoice.id, receipts) : false
  const purchaseItems = items
    .filter((item) => item.category === 'raw_material' || item.category === 'packaging')
    .sort((a, b) => a.name.localeCompare(b.name))
  const subtotal = invoiceSubtotal(draft)
  const grandTotal = invoiceGrandTotal(draft)
  const status = paymentStatus(draft)

  function updateLine(lineId, changes) {
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line) => (line.id === lineId ? { ...line, ...changes } : line)),
    }))
  }

  async function submit(event) {
    setSaving(true)
    try {
      event.preventDefault()
      const result = await saveInvoice(draft)
      if (!result.ok) {
        setErrors(result.errors)
        return
      }
      onSaved(result.invoice)
      } finally {
      setSaving(false)
    }
}

  return (
    <form className="space-y-6" onSubmit={submit} noValidate>
      {errors.form ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{errors.form}</p> : null}
      {locked ? (
        <p className="rounded-lg bg-sand px-3 py-2 text-sm text-ink">
          Line items are locked because items from this invoice have been received. You can still update payment and notes.
        </p>
      ) : null}
      {suppliers.length === 0 ? (
        <p className="rounded-lg bg-sand px-3 py-2 text-sm text-ink">Add a supplier before saving an invoice.</p>
      ) : null}
      {purchaseItems.length === 0 ? (
        <p className="rounded-lg bg-sand px-3 py-2 text-sm text-ink">
          Add a raw material or packaging item before adding lines.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Supplier" htmlFor="invoice-supplier" error={errors.supplierId}>
          <select
            id="invoice-supplier"
            className={controlClass}
            value={draft.supplierId}
            disabled={locked}
            onChange={(event) => setDraft({ ...draft, supplierId: event.target.value })}
          >
            <option value="">Select a supplier</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Invoice number" htmlFor="invoice-number" error={errors.invoiceNumber}>
          <input
            id="invoice-number"
            className={controlClass}
            value={draft.invoiceNumber}
            disabled={locked}
            onChange={(event) => setDraft({ ...draft, invoiceNumber: event.target.value })}
          />
        </Field>
        <Field label="Invoice date" htmlFor="invoice-date" error={errors.invoiceDate}>
          <input
            id="invoice-date"
            type="date"
            className={controlClass}
            value={draft.invoiceDate}
            onChange={(event) => setDraft({ ...draft, invoiceDate: event.target.value })}
          />
        </Field>
        <Field label="Due date" htmlFor="invoice-due">
          <input
            id="invoice-due"
            type="date"
            className={controlClass}
            value={draft.dueDate}
            onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })}
          />
        </Field>
        <Field label="Payment terms" htmlFor="invoice-terms">
          <input
            id="invoice-terms"
            className={controlClass}
            value={draft.paymentTerms}
            onChange={(event) => setDraft({ ...draft, paymentTerms: event.target.value })}
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-medium text-ink">Payment status</p>
        <Badge tone={paymentTone(status)}>{PAYMENT_STATUS_LABELS[status]}</Badge>
      </div>

      <Field label="Notes" htmlFor="invoice-notes">
        <textarea
          id="invoice-notes"
          rows={3}
          className={controlClass}
          value={draft.notes}
          onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
        />
      </Field>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">Line items</h2>
          {locked ? null : (
            <Button variant="secondary" onClick={() => setDraft({ ...draft, lines: [...draft.lines, emptyLine()] })}>
              Add line
            </Button>
          )}
        </div>
        {errors.lines ? <p className="mb-2 text-sm text-red-800">{errors.lines}</p> : null}
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="min-w-[720px] [&_td]:align-top">
            <thead className="bg-sand/50">
              <tr>
                <th scope="col">Item</th>
                <th scope="col" className="text-right">Quantity</th>
                <th scope="col" className="text-right">Unit price</th>
                <th scope="col" className="text-right">Line total</th>
                <th scope="col">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {draft.lines.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-muted">
                    Add a line to this invoice.
                  </td>
                </tr>
              ) : (
                draft.lines.map((line, index) => {
                  const lineErrors = errors.lineErrors?.[index] || {}
                  const quantity = Number(line.quantity)
                  const unitPrice = Number(line.unitPrice)
                  const total =
                    Number.isFinite(quantity) && Number.isFinite(unitPrice) ? quantity * unitPrice : null
                  return (
                    <tr key={line.id}>
                      <td className="min-w-52">
                        <select
                          className={controlClass}
                          value={line.itemId}
                          disabled={locked}
                          aria-label="Item"
                          onChange={(event) => updateLine(line.id, { itemId: event.target.value })}
                        >
                          <option value="">Select an item</option>
                          {purchaseItems.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name} ({item.unit})
                            </option>
                          ))}
                        </select>
                        {lineErrors.itemId ? <p className="mt-1 text-sm text-red-800">{lineErrors.itemId}</p> : null}
                      </td>
                      <td className="w-32">
                        <input
                          className={`${controlClass} text-right`}
                          inputMode="decimal"
                          aria-label="Quantity"
                          value={line.quantity}
                          disabled={locked}
                          onChange={(event) => updateLine(line.id, { quantity: event.target.value })}
                        />
                        {lineErrors.quantity ? <p className="mt-1 text-sm text-red-800">{lineErrors.quantity}</p> : null}
                      </td>
                      <td className="w-36">
                        <input
                          className={`${controlClass} text-right`}
                          inputMode="decimal"
                          aria-label="Unit price"
                          value={line.unitPrice}
                          disabled={locked}
                          onChange={(event) => updateLine(line.id, { unitPrice: event.target.value })}
                        />
                        {lineErrors.unitPrice ? (
                          <p className="mt-1 text-sm text-red-800">{lineErrors.unitPrice}</p>
                        ) : null}
                      </td>
                      <td className="text-right tabular-nums">{total === null ? '—' : formatCurrency(total)}</td>
                      <td className="w-12 text-right">
                        {locked ? null : (
                          <button
                            type="button"
                            className="inline-flex size-8 items-center justify-center rounded-lg text-ink hover:bg-sand"
                            aria-label="Remove line"
                            onClick={() =>
                              setDraft({ ...draft, lines: draft.lines.filter((entry) => entry.id !== line.id) })
                            }
                          >
                            <Trash className="size-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-4 space-y-1 text-right text-sm">
          <p>
            <span className="text-muted">Subtotal</span>{' '}
            <span className="ml-4 inline-block min-w-28 font-medium tabular-nums">{formatCurrency(subtotal)}</span>
          </p>
          <p>
            <span className="text-muted">Grand total</span>{' '}
            <span className="ml-4 inline-block min-w-28 text-base font-semibold tabular-nums">
              {formatCurrency(grandTotal)}
            </span>
          </p>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>{invoice ? 'Save changes' : 'Save invoice'}</Button>
      </div>
    </form>
  )
}
