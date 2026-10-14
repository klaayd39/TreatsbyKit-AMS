import { useState } from 'react'
import MovementTable from '../../components/inventory/MovementTable'
import { decorateMovements, MOVEMENT_LABELS } from '../../components/inventory/movementView'
import Button from '../../components/ui/Button'
import EmptyState from '../../components/ui/EmptyState'
import Field, { controlClass } from '../../components/ui/Field'
import Modal from '../../components/ui/Modal'
import PageHeader from '../../components/ui/PageHeader'
import { postAdjustment } from '../../data/movements'
import { COLLECTIONS, MOVEMENT_TYPES } from '../../data/seed'
import { getAll } from '../../data/storage'
import { useRefresh } from '../../hooks/useRefresh'
import { todayISODate } from '../../utils/format'

function newestFirst(a, b) {
  const byDate = String(b.date).localeCompare(String(a.date))
  if (byDate !== 0) return byDate
  return String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
}

export default function StockMovementsPage() {
  const [saving, setSaving] = useState(false)
  const [, refresh] = useRefresh()
  const [itemFilter, setItemFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [adjustment, setAdjustment] = useState(null)
  const [errors, setErrors] = useState({})

  const movements = getAll(COLLECTIONS.STOCK_MOVEMENTS)
  const items = getAll(COLLECTIONS.ITEMS).sort((a, b) => a.name.localeCompare(b.name))
  const receipts = getAll(COLLECTIONS.RECEIVING_RECORDS)
  const invoices = getAll(COLLECTIONS.PURCHASE_INVOICES)

  const rows = decorateMovements(movements, { items, receipts, invoices })
    .filter((movement) => {
      if (itemFilter && movement.itemId !== itemFilter) return false
      if (typeFilter && movement.type !== typeFilter) return false
      if (dateFrom && movement.date < dateFrom) return false
      if (dateTo && movement.date > dateTo) return false
      return true
    })
    .sort(newestFirst)

  function openAdjustment() {
    setErrors({})
    setAdjustment({
      itemId: '',
      date: todayISODate(),
      quantityChange: '',
      reason: '',
    })
  }

  async function saveAdjustment(event) {
    setSaving(true)
    try {
    event.preventDefault()
    const nextErrors = {}
    if (!adjustment.itemId) nextErrors.itemId = 'Choose an item.'
    if (!adjustment.date) nextErrors.date = 'Enter a date.'
    const change = Number(adjustment.quantityChange)
    if (!Number.isFinite(change) || change === 0) {
      nextErrors.quantityChange = 'Enter a quantity other than 0. Use a negative number to reduce stock.'
    }
    if (!adjustment.reason.trim()) nextErrors.reason = 'Enter a reason.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    const result = await postAdjustment({
      itemId: adjustment.itemId,
      date: adjustment.date,
      quantityChange: change,
      reason: adjustment.reason,
    })
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setAdjustment(null)
    refresh()
  
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Stock history"
        description="Every change to in stock. A count correction is a new adjustment, and old lines stay."
        actions={<Button onClick={openAdjustment}>Stock adjustment</Button>}
      />

      {movements.length === 0 ? (
        <EmptyState
          title="No stock movements yet"
          description="Receive a purchase invoice, or post an adjustment for a count correction."
          action={<Button onClick={openAdjustment}>Stock adjustment</Button>}
        />
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <select
              className={controlClass}
              value={itemFilter}
              aria-label="Filter by item"
              onChange={(event) => setItemFilter(event.target.value)}
            >
              <option value="">All items</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <select
              className={controlClass}
              value={typeFilter}
              aria-label="Filter by type"
              onChange={(event) => setTypeFilter(event.target.value)}
            >
              <option value="">All types</option>
              {MOVEMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {MOVEMENT_LABELS[type]}
                </option>
              ))}
            </select>
            <input
              type="date"
              className={controlClass}
              value={dateFrom}
              aria-label="Movement date from"
              onChange={(event) => setDateFrom(event.target.value)}
            />
            <input
              type="date"
              className={controlClass}
              value={dateTo}
              aria-label="Movement date to"
              onChange={(event) => setDateTo(event.target.value)}
            />
          </div>
          <MovementTable rows={rows} emptyMessage="No movements match these filters." />
        </>
      )}

      {adjustment ? (
        <Modal title="Stock adjustment" onClose={() => setAdjustment(null)}>
          <form className="space-y-4" onSubmit={saveAdjustment} noValidate>
            {errors.form ? <p className="text-sm text-red-800">{errors.form}</p> : null}
            <Field label="Item" htmlFor="adjustment-item" error={errors.itemId}>
              <select
                id="adjustment-item"
                className={controlClass}
                value={adjustment.itemId}
                onChange={(event) => setAdjustment({ ...adjustment, itemId: event.target.value })}
                autoFocus
              >
                <option value="">Select an item</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date" htmlFor="adjustment-date" error={errors.date}>
              <input
                id="adjustment-date"
                type="date"
                className={controlClass}
                value={adjustment.date}
                onChange={(event) => setAdjustment({ ...adjustment, date: event.target.value })}
              />
            </Field>
            <Field
              label="Quantity change"
              htmlFor="adjustment-qty"
              error={errors.quantityChange}
              hint="Positive adds stock. Negative removes it, for example -35."
            >
              <input
                id="adjustment-qty"
                className={controlClass}
                inputMode="decimal"
                value={adjustment.quantityChange}
                onChange={(event) => setAdjustment({ ...adjustment, quantityChange: event.target.value })}
              />
            </Field>
            <Field label="Reason" htmlFor="adjustment-reason" error={errors.reason}>
              <textarea
                id="adjustment-reason"
                rows={3}
                className={controlClass}
                value={adjustment.reason}
                onChange={(event) => setAdjustment({ ...adjustment, reason: event.target.value })}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setAdjustment(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>Post adjustment</Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  )
}
