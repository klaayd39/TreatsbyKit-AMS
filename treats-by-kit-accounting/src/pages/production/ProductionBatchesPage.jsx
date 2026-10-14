import { Search } from 'lucide-react'
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import BatchDetail from '../../components/production/BatchDetail'
import BatchForm from '../../components/production/BatchForm'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import DataTable from '../../components/ui/DataTable'
import EmptyState from '../../components/ui/EmptyState'
import Field, { controlClass } from '../../components/ui/Field'
import Modal from '../../components/ui/Modal'
import LastChanged from '../../components/LastChanged'
import PageHeader from '../../components/ui/PageHeader'
import { cancelBatch, nextBatchNumber } from '../../data/production'
import { COLLECTIONS } from '../../data/seed'
import { getAll } from '../../data/storage'
import { useRefresh } from '../../hooks/useRefresh'
import { formatCurrency, formatDate, formatQuantity, todayISODate } from '../../utils/format'

function statusLabel(status) {
  return status === 'cancelled' ? 'Cancelled' : 'Completed'
}

export default function ProductionBatchesPage() {
  const [saving, setSaving] = useState(false)
  const location = useLocation()
  const [, refresh] = useRefresh()
  const [screen, setScreen] = useState(() => {
    if (!location.state?.recipeId) return { name: 'list' }
    return { name: 'edit', plan: location.state }
  })
  const [search, setSearch] = useState('')
  const [recipeFilter, setRecipeFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [detailId, setDetailId] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelError, setCancelError] = useState({})
  const [notice, setNotice] = useState('')

  const batches = getAll(COLLECTIONS.PRODUCTION_BATCHES)
  const recipes = getAll(COLLECTIONS.RECIPES).sort((a, b) => a.name.localeCompare(b.name))
  const items = getAll(COLLECTIONS.ITEMS)
  const recipeName = (recipeId) => recipes.find((recipe) => recipe.id === recipeId)?.name || 'Unknown recipe'
  const productName = (itemId) => items.find((item) => item.id === itemId)?.name || 'Unknown product'

  const filtered = batches
    .filter((batch) => {
      if (recipeFilter && batch.recipeId !== recipeFilter) return false
      if (dateFrom && batch.date < dateFrom) return false
      if (dateTo && batch.date > dateTo) return false
      const query = search.trim().toLowerCase()
      if (!query) return true
      return [batch.batchNumber, recipeName(batch.recipeId), productName(batch.finishedItemId)]
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
    .sort(
      (a, b) =>
        String(b.date).localeCompare(String(a.date)) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
    )

  const detail = detailId ? batches.find((batch) => batch.id === detailId) : null

  function openCreate() {
    setNotice('')
    setScreen({
      name: 'edit',
      plan: { batchNumber: nextBatchNumber(), date: todayISODate() },
    })
  }

  function onSaved(batch) {
    setScreen({ name: 'list' })
    setNotice(`${batch.batchNumber} posted. Cost per unit is ${formatCurrency(batch.costPerUnit)}.`)
    refresh()
  }

  function openCancel(batch) {
    setDetailId(null)
    setCancelTarget(batch)
    setCancelReason('')
    setCancelError({})
  }

  async function confirmCancel(event) {
    setSaving(true)
    try {
    event.preventDefault()
    const result = await cancelBatch(cancelTarget.id, cancelReason)
    if (!result.ok) {
      setCancelError(result.errors)
      return
    }
    setCancelTarget(null)
    setNotice(`${result.batch.batchNumber} was cancelled and its stock movements were reversed.`)
    refresh()
  
    } finally {
      setSaving(false)
    }
  }

  if (screen.name === 'edit') {
    return (
      <>
        <PageHeader
          title="New batch"
          description="Saving posts ingredient usage, waste, and finished-goods output in one step, and stores the cost."
        />
        <BatchForm
          plan={{ batchNumber: nextBatchNumber(), ...screen.plan }}
          recipes={recipes}
          onCancel={() => setScreen({ name: 'list' })}
          onSaved={onSaved}
        />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Production Batches"
        description="Completed batches stay on the ledger. Cancelling posts reversing movements."
        actions={<Button onClick={openCreate}>New batch</Button>}
      />
      {notice ? <p className="mb-4 rounded-lg bg-sand px-3 py-2 text-sm text-ink">{notice}</p> : null}

      {batches.length === 0 ? (
        <EmptyState
          title="No production batches yet"
          description="Create a batch to use ingredients and add finished goods to stock."
          action={<Button onClick={openCreate}>New batch</Button>}
        />
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <input
                className={`${controlClass} pl-9`}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search batches"
                aria-label="Search batches"
              />
            </div>
            <select
              className={controlClass}
              value={recipeFilter}
              aria-label="Filter by recipe"
              onChange={(event) => setRecipeFilter(event.target.value)}
            >
              <option value="">All recipes</option>
              {recipes.map((recipe) => (
                <option key={recipe.id} value={recipe.id}>
                  {recipe.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              className={controlClass}
              value={dateFrom}
              aria-label="Batch date from"
              onChange={(event) => setDateFrom(event.target.value)}
            />
            <input
              type="date"
              className={controlClass}
              value={dateTo}
              aria-label="Batch date to"
              onChange={(event) => setDateTo(event.target.value)}
            />
          </div>
          {filtered.length === 0 ? (
            <EmptyState title="No batches match" description="Try another recipe, date, or batch number." />
          ) : (
            <DataTable>
              <thead className="bg-sand/50">
                <tr>
                  <th scope="col">Batch</th>
                  <th scope="col">Date</th>
                  <th scope="col">Recipe</th>
                  <th scope="col">Product</th>
                  <th scope="col" className="text-right">Quantity</th>
                  <th scope="col" className="text-right">Cost / unit</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((batch) => (
                  <tr key={batch.id}>
                    <td>
                      <button
                        type="button"
                        className="font-medium text-ink underline-offset-2 hover:text-accent hover:underline"
                        onClick={() => setDetailId(batch.id)}
                      >
                        {batch.batchNumber}
                      </button>
                    </td>
                    <td>{formatDate(batch.date)}</td>
                    <td>{recipeName(batch.recipeId)}</td>
                    <td>{productName(batch.finishedItemId)}</td>
                    <td className="text-right tabular-nums">{formatQuantity(batch.quantityProduced)}</td>
                    <td className="text-right tabular-nums">{formatCurrency(batch.costPerUnit)}</td>
                    <td>
                      <Badge tone={batch.status === 'cancelled' ? 'danger' : 'success'}>{statusLabel(batch.status)}</Badge>
                    </td>
                    <td className="text-right">
                      {batch.status === 'cancelled' ? null : (
                        <Button variant="ghost" onClick={() => openCancel(batch)}>
                          Cancel batch
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </>
      )}

      {detail ? (
        <Modal title={detail.batchNumber} onClose={() => setDetailId(null)} size="lg">
          <LastChanged table="productionBatches" id={detail.id} />
          <BatchDetail batch={detail} items={items} recipes={recipes} />
          {detail.status === 'cancelled' ? null : (
            <div className="mt-5 flex justify-end">
              <Button variant="danger" onClick={() => openCancel(detail)}>
                Cancel batch
              </Button>
            </div>
          )}
        </Modal>
      ) : null}

      {cancelTarget ? (
        <Modal title={`Cancel ${cancelTarget.batchNumber}`} onClose={() => setCancelTarget(null)}>
          <form className="space-y-4" onSubmit={confirmCancel} noValidate>
            <p className="text-sm text-ink">
              This posts reversing movements for every ingredient used, every waste line, and the finished goods
              produced. The original movements stay on the ledger.
            </p>
            {cancelError.form ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{cancelError.form}</p> : null}
            <Field label="Reason" htmlFor="cancel-reason" error={cancelError.reason}>
              <textarea
                id="cancel-reason"
                className={controlClass}
                rows={3}
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                autoFocus
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setCancelTarget(null)}>
                Keep batch
              </Button>
              <Button variant="danger" type="submit" disabled={saving}>
                Cancel batch
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  )
}
