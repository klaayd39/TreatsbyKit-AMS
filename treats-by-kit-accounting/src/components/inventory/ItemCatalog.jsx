import { useState } from 'react'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import DataTable from '../ui/DataTable'
import EmptyState from '../ui/EmptyState'
import Field, { controlClass } from '../ui/Field'
import Modal from '../ui/Modal'
import PageHeader from '../ui/PageHeader'
import { COLLECTIONS, ITEM_UNITS } from '../../data/seed'
import { add, getAll, getById, update } from '../../data/storage'
import { useRefresh } from '../../hooks/useRefresh'
import { formatCurrency, formatQuantity } from '../../utils/format'
import { generateId } from '../../utils/id'
import { getAverageCost, getStockOnHand } from '../../utils/inventory'
import MovementTable from './MovementTable'
import { decorateMovements } from './movementView'

const CATEGORY_OPTIONS = [
  { value: 'raw_material', label: 'Raw material' },
  { value: 'packaging', label: 'Packaging' },
]

function blankItem(category) {
  const fallback = getById(COLLECTIONS.SETTINGS, 'business')?.lowStockDefault
  return {
    name: '',
    category,
    unit: 'pc',
    reorderLevel: fallback == null || fallback === '' ? '0' : String(fallback),
    sellingPrice: '',
  }
}

function itemToForm(item) {
  return {
    name: item.name,
    category: item.category,
    unit: item.unit,
    reorderLevel: String(item.reorderLevel ?? 0),
    sellingPrice: item.sellingPrice == null || item.sellingPrice === '' ? '' : String(item.sellingPrice),
  }
}

function validateItem(form, categoryOptions, showSellingPrice) {
  const errors = {}
  if (!form.name.trim()) errors.name = 'Enter a name.'
  if (!categoryOptions.some((option) => option.value === form.category)) {
    errors.category = 'Choose a category.'
  }
  if (!ITEM_UNITS.includes(form.unit)) errors.unit = 'Choose a unit.'
  if (form.reorderLevel === '' || !Number.isFinite(Number(form.reorderLevel)) || Number(form.reorderLevel) < 0) {
    errors.reorderLevel = 'Reorder level must be 0 or more.'
  }
  if (showSellingPrice && form.sellingPrice !== '') {
    const price = Number(form.sellingPrice)
    if (!Number.isFinite(price) || price < 0) errors.sellingPrice = 'Selling price must be 0 or more.'
  }
  return errors
}

export default function ItemCatalog({
  category,
  title,
  description,
  emptyTitle,
  emptyDescription,
  categoryOptions = CATEGORY_OPTIONS,
  showSellingPrice = false,
}) {
  const [saving, setSaving] = useState(false)
  const [, refresh] = useRefresh()
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState({})
  const [historyItem, setHistoryItem] = useState(null)

  const items = getAll(COLLECTIONS.ITEMS)
  const movements = getAll(COLLECTIONS.STOCK_MOVEMENTS)
  const receipts = getAll(COLLECTIONS.RECEIVING_RECORDS)
  const invoices = getAll(COLLECTIONS.PURCHASE_INVOICES)

  const rows = items
    .filter((item) => item.category === category)
    .map((item) => ({
      ...item,
      onHand: getStockOnHand(item.id, movements),
      averageCost: getAverageCost(item.id, movements),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const historyRows = historyItem
    ? decorateMovements(movements, { items, receipts, invoices })
        .filter((movement) => movement.itemId === historyItem.id)
        .sort(
          (a, b) =>
            String(b.date).localeCompare(String(a.date)) ||
            String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
        )
    : []

  function openCreate() {
    setEditing(null)
    setForm(blankItem(category))
    setErrors({})
  }

  function openEdit(item) {
    setEditing(item)
    setForm(itemToForm(item))
    setErrors({})
  }

  function closeForm() {
    setEditing(null)
    setForm(null)
    setErrors({})
  }

  async function saveItem(event) {
    setSaving(true)
    try {
      event.preventDefault()
      const nextErrors = validateItem(form, categoryOptions, showSellingPrice)
      setErrors(nextErrors)
      if (Object.keys(nextErrors).length) return

      const payload = {
        name: form.name.trim(),
        category: form.category,
        unit: form.unit,
        reorderLevel: Number(form.reorderLevel),
      }
      if (showSellingPrice) payload.sellingPrice = form.sellingPrice === '' ? null : Number(form.sellingPrice)

      if (editing) {
        await update(COLLECTIONS.ITEMS, editing.id, payload)
      } else {
        await add(COLLECTIONS.ITEMS, {
          ...payload,
          id: generateId('item'),
          createdAt: new Date().toISOString(),
        })
      }

      closeForm()
      refresh()
      } finally {
      setSaving(false)
    }
}

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={<Button onClick={openCreate}>Add item</Button>}
      />

      {rows.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} action={<Button onClick={openCreate}>Add item</Button>} />
      ) : (
        <DataTable>
          <thead className="bg-sand/50">
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Unit</th>
              <th scope="col" className="text-right">Warn at</th>
              <th scope="col" className="text-right">In stock</th>
              <th scope="col" className="text-right">Average cost</th>
              {showSellingPrice ? <th scope="col" className="text-right">Selling price</th> : null}
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const reorderLevel = Number(item.reorderLevel ?? 0)
              const stockNote = item.onHand <= 0 ? 'None in stock' : reorderLevel > 0 && item.onHand <= reorderLevel ? 'Running low' : ''
              return (
                <tr key={item.id}>
                  <td>
                    <button
                      type="button"
                      className="font-medium text-ink underline-offset-2 hover:text-accent hover:underline"
                      onClick={() => setHistoryItem(item)}
                    >
                      {item.name}
                    </button>
                  </td>
                  <td>{item.unit}</td>
                  <td className="text-right tabular-nums">{formatQuantity(item.reorderLevel)}</td>
                  <td className="text-right">
                    <span className="tabular-nums">{formatQuantity(item.onHand)}</span>
                    {stockNote ? <span className="mt-1 block"><Badge tone="warning">{stockNote}</Badge></span> : null}
                  </td>
                  <td className="text-right tabular-nums">
                    {item.averageCost === null ? '—' : formatCurrency(item.averageCost)}
                  </td>
                  {showSellingPrice ? (
                    <td className="text-right tabular-nums">
                      {item.sellingPrice == null || item.sellingPrice === '' ? (
                        <span className="text-muted">Not set</span>
                      ) : (
                        formatCurrency(item.sellingPrice)
                      )}
                    </td>
                  ) : null}
                  <td className="text-right">
                    <Button variant="ghost" onClick={() => openEdit(item)}>
                      Edit
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </DataTable>
      )}

      {form ? (
        <Modal title={editing ? 'Edit item' : 'Add item'} onClose={closeForm}>
          <form className="space-y-4" onSubmit={saveItem} noValidate>
            <Field label="Name" htmlFor="item-name" error={errors.name}>
              <input
                id="item-name"
                className={controlClass}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                autoFocus
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category" htmlFor="item-category" error={errors.category}>
                <select
                  id="item-category"
                  className={controlClass}
                  value={form.category}
                  onChange={(event) => setForm({ ...form, category: event.target.value })}
                >
                  {categoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Unit" htmlFor="item-unit" error={errors.unit}>
                <select
                  id="item-unit"
                  className={controlClass}
                  value={form.unit}
                  onChange={(event) => setForm({ ...form, unit: event.target.value })}
                >
                  {ITEM_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {showSellingPrice ? (
              <Field
                label="Selling price"
                htmlFor="item-price"
                error={errors.sellingPrice}
                hint="Leave blank until the product is ready to sell."
              >
                <input
                  id="item-price"
                  className={controlClass}
                  inputMode="decimal"
                  value={form.sellingPrice}
                  onChange={(event) => setForm({ ...form, sellingPrice: event.target.value })}
                />
              </Field>
            ) : null}
            <Field label="Warn when stock falls to" htmlFor="item-reorder" error={errors.reorderLevel} hint="Use 0 if you do not want a warning.">
              <input
                id="item-reorder"
                className={controlClass}
                inputMode="decimal"
                value={form.reorderLevel}
                onChange={(event) => setForm({ ...form, reorderLevel: event.target.value })}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={closeForm}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>Save item</Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {historyItem ? (
        <Modal title={`${historyItem.name} movements`} onClose={() => setHistoryItem(null)} size="lg">
          <p className="mb-4 text-sm text-muted">
            In stock {formatQuantity(getStockOnHand(historyItem.id, movements))} {historyItem.unit}. Each line below is one change.
          </p>
          {historyRows.length === 0 ? (
            <EmptyState title="No movements yet" description="Stock changes for this item will show up here." />
          ) : (
            <MovementTable rows={historyRows} showItem={false} />
          )}
        </Modal>
      ) : null}
    </>
  )
}
