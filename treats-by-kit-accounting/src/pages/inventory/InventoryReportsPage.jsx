import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import MovementTable from '../../components/inventory/MovementTable'
import { decorateMovements, MOVEMENT_LABELS } from '../../components/inventory/movementView'
import DateRangePicker from '../../components/reports/DateRangePicker'
import ReportTable from '../../components/reports/ReportTable'
import ReportTabs from '../../components/reports/ReportTabs'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import { controlClass } from '../../components/ui/Field'
import PageHeader from '../../components/ui/PageHeader'
import { useReportRange } from '../../hooks/useReportRange'
import { downloadCsv } from '../../reports/csv'
import { lowStock, slowMoving, stockSummary, stockValuation } from '../../reports/inventory'
import { COLLECTIONS, MOVEMENT_TYPES } from '../../data/seed'
import { getAll } from '../../data/storage'
import { formatCurrency, formatDate, formatQuantity, formatSignedMoney } from '../../utils/format'

const TABS = [
  { id: 'summary', label: 'Stock Summary' },
  { id: 'valuation', label: 'Stock Valuation' },
  { id: 'low', label: 'Low Stock' },
  { id: 'movements', label: 'Movement History' },
  { id: 'slow', label: 'Slow-moving' },
]

function qtyColumn(key, label) {
  return {
    key,
    label,
    align: 'right',
    render: (row) => formatQuantity(row[key]),
    export: (row) => row[key],
  }
}

export default function InventoryReportsPage() {
  const [params] = useSearchParams()
  const range = useReportRange()
  const [tab, setTab] = useState(params.get('tab') || 'summary')
  const [itemFilter, setItemFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [days, setDays] = useState('30')
  const items = getAll(COLLECTIONS.ITEMS)
  const movements = getAll(COLLECTIONS.STOCK_MOVEMENTS)
  const accounts = getAll(COLLECTIONS.ACCOUNTS)
  const entries = getAll(COLLECTIONS.JOURNAL_ENTRIES)
  const summary = stockSummary({ items, movements, from: range.from, to: range.to })
  const valuation = stockValuation({ items, movements, accounts, entries, asOf: range.to })
  const low = lowStock({ items, movements, asOf: range.to })
  const slow = slowMoving({ items, movements, asOf: range.to, days })
  const history = decorateMovements(movements, {
    items,
    receipts: getAll(COLLECTIONS.RECEIVING_RECORDS),
    invoices: getAll(COLLECTIONS.PURCHASE_INVOICES),
  })
    .filter((movement) => {
      if (itemFilter && movement.itemId !== itemFilter) return false
      if (typeFilter && movement.type !== typeFilter) return false
      if (range.from && movement.date < range.from) return false
      if (range.to && movement.date > range.to) return false
      return true
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')))

  function exportHistory() {
    downloadCsv('movement-history.csv', [
      ['Date', 'Item', 'Type', 'In', 'Out', 'Balance', 'Reference', 'Notes'],
      ...history.map((row) => [row.date, row.itemName, MOVEMENT_LABELS[row.type] || row.type, row.quantityIn, row.quantityOut, row.runningBalance, row.referenceLabel, row.notes || '']),
    ])
  }

  return (
    <>
      <PageHeader title="Inventory Reports" description="Quantities come from the stock movement ledger. Valuation uses each movement's unit cost, which is what the inventory accounts use." />
      <DateRangePicker preset={range.preset} from={range.from} to={range.to} today={range.today} onChange={range.onChange} />
      <ReportTabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === 'summary' ? (
        <ReportTable
          title="Stock summary"
          filename="stock-summary.csv"
          rows={summary}
          columns={[
            { key: 'name', label: 'Item', export: (row) => row.name },
            { key: 'categoryLabel', label: 'Category', export: (row) => row.categoryLabel },
            { key: 'unit', label: 'Unit', export: (row) => row.unit },
            qtyColumn('beginning', 'Beginning'),
            qtyColumn('purchased', 'Purchased'),
            qtyColumn('used', 'Used in production'),
            qtyColumn('produced', 'Produced'),
            qtyColumn('sold', 'Sold'),
            qtyColumn('waste', 'Waste'),
            qtyColumn('adjustments', 'Adjustments'),
            qtyColumn('ending', 'Ending'),
          ]}
        />
      ) : null}

      {tab === 'valuation' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={valuation.pass ? 'success' : 'danger'}>{valuation.pass ? 'Pass' : 'Fail'}</Badge>
            <p className="text-sm text-muted">As of {formatDate(range.to)}. Category totals should equal accounts 1200, 1210, and 1220.</p>
          </div>
          <ul className="space-y-2">
            {valuation.categories.map((category) => (
              <li key={category.id} className="rounded-xl border border-line bg-white px-4 py-3 text-sm">
                <span className="font-medium">{category.label}</span>
                <span className="text-muted"> · stock {formatSignedMoney(category.value)} · ledger {formatSignedMoney(category.ledger)}</span>
                {category.pass ? null : <span className="text-ink"> · difference {formatSignedMoney(category.difference)}</span>}
              </li>
            ))}
          </ul>
          <ReportTable
            title="Stock valuation"
            filename="stock-valuation.csv"
            rows={valuation.rows}
            columns={[
              { key: 'name', label: 'Item', export: (row) => row.name },
              { key: 'categoryLabel', label: 'Category', export: (row) => row.categoryLabel },
              qtyColumn('quantity', 'Quantity'),
              { key: 'averageCost', label: 'Average cost', align: 'right', render: (row) => row.averageCost === null ? '—' : formatCurrency(row.averageCost), export: (row) => row.averageCost ?? '' },
              { key: 'value', label: 'Total value', align: 'right', render: (row) => formatSignedMoney(row.value), export: (row) => row.value },
            ]}
          />
        </div>
      ) : null}

      {tab === 'low' ? (
        <ReportTable
          title="Low stock"
          filename="low-stock.csv"
          emptyTitle="No low stock"
          emptyDescription="Every item is above its reorder level as of this date."
          rows={low}
          columns={[
            { key: 'name', label: 'Item', export: (row) => row.name },
            { key: 'categoryLabel', label: 'Category', export: (row) => row.categoryLabel },
            qtyColumn('onHand', 'On hand'),
            qtyColumn('reorderLevel', 'Reorder'),
            qtyColumn('shortage', 'Shortage'),
            { key: 'lastPurchaseDate', label: 'Last purchase', render: (row) => formatDate(row.lastPurchaseDate), export: (row) => row.lastPurchaseDate },
          ]}
        />
      ) : null}

      {tab === 'movements' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="grid flex-1 gap-3 sm:grid-cols-2">
              <select className={controlClass} aria-label="Item" value={itemFilter} onChange={(event) => setItemFilter(event.target.value)}>
                <option value="">All items</option>
                {items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <select className={controlClass} aria-label="Movement type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                <option value="">All types</option>
                {MOVEMENT_TYPES.map((type) => <option key={type} value={type}>{MOVEMENT_LABELS[type] || type}</option>)}
              </select>
            </div>
            <Button variant="secondary" onClick={exportHistory} disabled={history.length === 0}>Export CSV</Button>
          </div>
          <MovementTable rows={history} emptyMessage="No movements in this period." />
        </div>
      ) : null}

      {tab === 'slow' ? (
        <div className="space-y-4">
          <label className="block max-w-xs text-sm text-ink">
            Days without an outgoing movement
            <input className={`${controlClass} mt-1`} type="number" min="1" value={days} aria-label="Slow-moving days" onChange={(event) => setDays(event.target.value)} />
          </label>
          <ReportTable
            title="Slow-moving items"
            filename="slow-moving.csv"
            emptyTitle="No slow-moving items"
            emptyDescription="Every item had an outgoing movement in this window."
            rows={slow}
            columns={[
              { key: 'name', label: 'Item', export: (row) => row.name },
              { key: 'categoryLabel', label: 'Category', export: (row) => row.categoryLabel },
              qtyColumn('onHand', 'On hand'),
            ]}
          />
        </div>
      ) : null}
    </>
  )
}
