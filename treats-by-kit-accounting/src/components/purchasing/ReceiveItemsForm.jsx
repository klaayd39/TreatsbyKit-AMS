import { useState } from 'react'
import Button from '../ui/Button'
import Field, { controlClass } from '../ui/Field'
import { createReceiving, receivedQtyForLine } from '../../data/purchasing'
import { formatQuantity } from '../../utils/format'
import { roundQuantity } from '../../utils/inventory'

function startingQuantities(invoice, receipts) {
  return Object.fromEntries(
    (invoice.lines || []).map((line) => {
      const remaining = roundQuantity(line.quantity - receivedQtyForLine(receipts, invoice.id, line.id))
      return [line.id, String(remaining)]
    }),
  )
}

export default function ReceiveItemsForm({ invoice, items, receipts, defaultDate, onCancel, onSaved }) {
  const [saving, setSaving] = useState(false)
  const [date, setDate] = useState(defaultDate)
  const [quantities, setQuantities] = useState(() => startingQuantities(invoice, receipts))
  const [errors, setErrors] = useState({})

  async function submit(event) {
    setSaving(true)
    try {
      event.preventDefault()
      const result = await createReceiving({
        invoiceId: invoice.id,
        date,
        quantitiesByLineId: quantities,
      })
      if (!result.ok) {
        setErrors(result.errors)
        return
      }
      onSaved(result.receipt)
      } finally {
      setSaving(false)
    }
}

  return (
    <form className="space-y-5" onSubmit={submit} noValidate>
      {errors.form ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{errors.form}</p> : null}
      <Field label="Receipt date" htmlFor="receipt-date" error={errors.date}>
        <input
          id="receipt-date"
          type="date"
          className={`${controlClass} max-w-xs`}
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </Field>
      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="min-w-[720px]">
          <thead className="bg-sand/50">
            <tr>
              <th scope="col">Item</th>
              <th scope="col" className="text-right">Ordered</th>
              <th scope="col" className="text-right">Previously received</th>
              <th scope="col" className="text-right">Receive now</th>
            </tr>
          </thead>
          <tbody>
            {(invoice.lines || []).map((line) => {
              const item = items.find((entry) => entry.id === line.itemId)
              const received = receivedQtyForLine(receipts, invoice.id, line.id)
              const lineError = errors.lineErrors?.[line.id]
              return (
                <tr key={line.id}>
                  <td className="font-medium">{item?.name ?? 'Unknown item'}</td>
                  <td className="text-right tabular-nums">
                    {formatQuantity(line.quantity)} {item?.unit}
                  </td>
                  <td className="text-right tabular-nums">{formatQuantity(received)}</td>
                  <td className="w-40">
                    <input
                      className={`${controlClass} text-right`}
                      inputMode="decimal"
                      aria-label={`Receive now for ${item?.name ?? 'item'}`}
                      value={quantities[line.id] ?? ''}
                      onChange={(event) =>
                        setQuantities((current) => ({ ...current, [line.id]: event.target.value }))
                      }
                    />
                    {lineError ? <p className="mt-1 text-sm text-red-800">{lineError}</p> : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>Save receipt</Button>
      </div>
    </form>
  )
}
