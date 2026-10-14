import { useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import BatchDetail from '../../components/production/BatchDetail'
import DataTable from '../../components/ui/DataTable'
import EmptyState from '../../components/ui/EmptyState'
import { controlClass } from '../../components/ui/Field'
import Modal from '../../components/ui/Modal'
import PageHeader from '../../components/ui/PageHeader'
import { COLLECTIONS } from '../../data/seed'
import { getAll } from '../../data/storage'
import { formatCurrency, formatDate, formatQuantity } from '../../utils/format'

const LINE_COLORS = ['#8f4332', '#2c241c', '#8a6a4f', '#c47a5a']

export default function ProductionCostingPage() {
  const [productId, setProductId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [detailId, setDetailId] = useState(null)

  const batches = getAll(COLLECTIONS.PRODUCTION_BATCHES)
  const items = getAll(COLLECTIONS.ITEMS)
  const recipes = getAll(COLLECTIONS.RECIPES)
  const completed = batches.filter((batch) => batch.status !== 'cancelled')
  const products = items
    .filter((item) => completed.some((batch) => batch.finishedItemId === item.id))
    .sort((a, b) => a.name.localeCompare(b.name))
  const productName = (itemId) => items.find((item) => item.id === itemId)?.name || 'Unknown product'

  const filtered = completed
    .filter((batch) => {
      if (productId && batch.finishedItemId !== productId) return false
      if (dateFrom && batch.date < dateFrom) return false
      if (dateTo && batch.date > dateTo) return false
      return true
    })
    .sort(
      (a, b) =>
        String(b.date).localeCompare(String(a.date)) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
    )

  const productIds = [...new Set(filtered.map((batch) => batch.finishedItemId))]
  const summaries = productIds.map((id) => {
    const rows = filtered
      .filter((batch) => batch.finishedItemId === id)
      .sort(
        (a, b) =>
          String(a.date).localeCompare(String(b.date)) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')),
      )
    const quantity = rows.reduce((sum, batch) => sum + Number(batch.quantityProduced || 0), 0)
    const total = rows.reduce((sum, batch) => sum + Number(batch.totalCost || 0), 0)
    return {
      id,
      name: productName(id),
      average: quantity > 0 ? total / quantity : 0,
      latest: rows[rows.length - 1]?.costPerUnit ?? 0,
    }
  })

  const chartRows = [...filtered]
    .sort(
      (a, b) =>
        String(a.date).localeCompare(String(b.date)) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')),
    )
    .map((batch) => {
      const row = { label: formatDate(batch.date), batch: batch.batchNumber }
      for (const summary of summaries) row[summary.id] = null
      row[batch.finishedItemId] = batch.costPerUnit
      return row
    })

  const detail = detailId ? completed.find((batch) => batch.id === detailId) : null

  return (
    <>
      <PageHeader
        title="Production Costing"
        description="Costs are the snapshot stored on each completed batch."
      />

      {completed.length === 0 ? (
        <EmptyState
          title="No completed batches yet"
          description="Post a production batch to see cost per unit."
        />
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <select
              className={controlClass}
              value={productId}
              aria-label="Filter by product"
              onChange={(event) => setProductId(event.target.value)}
            >
              <option value="">All products</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
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
            <EmptyState title="No batches match" description="Try another product or date range." />
          ) : (
            <div className="space-y-6">
              <DataTable>
                <thead className="bg-sand/50">
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col" className="text-right">Average cost / unit</th>
                    <th scope="col" className="text-right">Latest cost / unit</th>
                  </tr>
                </thead>
                <tbody>
                  {summaries.map((summary) => (
                    <tr key={summary.id}>
                      <td className="font-medium">{summary.name}</td>
                      <td className="text-right tabular-nums">{formatCurrency(summary.average)}</td>
                      <td className="text-right tabular-nums">{formatCurrency(summary.latest)}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>

              <section className="rounded-2xl border border-line bg-white p-5">
                <h2 className="mb-4 text-sm font-medium text-muted">Cost per unit by batch date</h2>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartRows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                      <CartesianGrid stroke="#e5dcd1" />
                      <XAxis dataKey="label" tick={{ fill: '#5e5348', fontSize: 12 }} />
                      <YAxis
                        tick={{ fill: '#5e5348', fontSize: 12 }}
                        tickFormatter={(value) => formatCurrency(value)}
                        width={88}
                      />
                      <Tooltip
                        formatter={(value, name) => [
                          value == null ? '—' : formatCurrency(value),
                          productName(name),
                        ]}
                        labelFormatter={(label, payload) => payload?.[0]?.payload?.batch || label}
                      />
                      <Legend formatter={(value) => productName(value)} />
                      {summaries.map((summary, index) => (
                        <Line
                          key={summary.id}
                          type="monotone"
                          dataKey={summary.id}
                          name={summary.id}
                          stroke={LINE_COLORS[index % LINE_COLORS.length]}
                          strokeWidth={2}
                          connectNulls
                          dot
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <DataTable>
                <thead className="bg-sand/50">
                  <tr>
                    <th scope="col">Batch</th>
                    <th scope="col">Date</th>
                    <th scope="col">Product</th>
                    <th scope="col" className="text-right">Quantity</th>
                    <th scope="col" className="text-right">Total cost</th>
                    <th scope="col" className="text-right">Cost / unit</th>
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
                      <td>{productName(batch.finishedItemId)}</td>
                      <td className="text-right tabular-nums">{formatQuantity(batch.quantityProduced)}</td>
                      <td className="text-right tabular-nums">{formatCurrency(batch.totalCost)}</td>
                      <td className="text-right tabular-nums">{formatCurrency(batch.costPerUnit)}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </div>
          )}
        </>
      )}

      {detail ? (
        <Modal title={detail.batchNumber} onClose={() => setDetailId(null)} size="lg">
          <BatchDetail batch={detail} items={items} recipes={recipes} />
        </Modal>
      ) : null}
    </>
  )
}
