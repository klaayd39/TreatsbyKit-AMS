import { useState } from 'react'
import DateRangePicker from '../../components/reports/DateRangePicker'
import ReportTable from '../../components/reports/ReportTable'
import ReportTabs from '../../components/reports/ReportTabs'
import { controlClass } from '../../components/ui/Field'
import PageHeader from '../../components/ui/PageHeader'
import { useReportRange } from '../../hooks/useReportRange'
import { formatPercent } from '../../reports/format'
import { productionReports } from '../../reports/production'
import { COLLECTIONS } from '../../data/seed'
import { getAll, getById } from '../../data/storage'
import { formatCurrency, formatDate, formatQuantity, formatSignedMoney } from '../../utils/format'
import { sum } from '../../utils/money'

const TABS = [
  { id: 'summary', label: 'Production Summary' },
  { id: 'usage', label: 'Ingredient Usage' },
  { id: 'waste', label: 'Waste Report' },
  { id: 'variance', label: 'Variance' },
]

function money(key, label) {
  return { key, label, align: 'right', render: (row) => formatSignedMoney(row[key]), export: (row) => row[key] }
}

function qty(key, label) {
  return { key, label, align: 'right', render: (row) => formatQuantity(row[key]), export: (row) => row[key] }
}

export default function ReportProductionPage() {
  const range = useReportRange()
  const [tab, setTab] = useState('summary')
  const [threshold, setThreshold] = useState(() => {
    const value = getById(COLLECTIONS.SETTINGS, 'business')?.varianceThreshold
    return value == null || value === '' ? '10' : String(value)
  })
  const report = productionReports({
    batches: getAll(COLLECTIONS.PRODUCTION_BATCHES),
    items: getAll(COLLECTIONS.ITEMS),
    from: range.from,
    to: range.to,
    threshold,
  })
  const summaryTotals = {
    name: 'Total',
    batches: report.summary.reduce((count, row) => count + row.batches, 0),
    units: '',
    ingredientCost: sum(report.summary.map((row) => row.ingredientCost)),
    wasteCost: sum(report.summary.map((row) => row.wasteCost)),
    laborCost: sum(report.summary.map((row) => row.laborCost)),
    overheadCost: sum(report.summary.map((row) => row.overheadCost)),
    totalCost: sum(report.summary.map((row) => row.totalCost)),
    averageCost: '',
  }

  return (
    <>
      <PageHeader title="Kitchen report" description="Finished bakes only. Cancelled batches are listed apart from the totals." />
      <DateRangePicker preset={range.preset} from={range.from} to={range.to} today={range.today} onChange={range.onChange} />
      <ReportTabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === 'summary' ? (
        <div className="space-y-8">
          <ReportTable
            title="By product"
            filename="production-summary.csv"
            rows={report.summary}
            totals={report.summary.length ? summaryTotals : null}
            columns={[
              { key: 'name', label: 'Product', export: (row) => row.name, total: (totals) => totals.name },
              { key: 'batches', label: 'Batches', align: 'right', export: (row) => row.batches, total: (totals) => totals.batches },
              qty('units', 'Units produced'),
              money('ingredientCost', 'Ingredient cost'),
              money('wasteCost', 'Waste cost'),
              money('laborCost', 'Labor'),
              money('overheadCost', 'Overhead'),
              money('totalCost', 'Total cost'),
              { key: 'averageCost', label: 'Average cost', align: 'right', render: (row) => formatCurrency(row.averageCost), export: (row) => row.averageCost, total: () => '' },
            ]}
          />
          <ReportTable
            title="Cancelled batches"
            filename="cancelled-batches.csv"
            emptyTitle="No cancelled batches"
            emptyDescription="Cancelled batches in this period show up here and stay out of the totals."
            rows={report.cancelled}
            columns={[
              { key: 'batchNumber', label: 'Batch', export: (row) => row.batchNumber },
              { key: 'date', label: 'Date', render: (row) => formatDate(row.date), export: (row) => row.date },
              { key: 'product', label: 'Product', export: (row) => row.product },
              qty('units', 'Units'),
              { key: 'reason', label: 'Reason', export: (row) => row.reason },
            ]}
          />
        </div>
      ) : null}

      {tab === 'usage' ? (
        <ReportTable
          title="Ingredient usage"
          filename="ingredient-usage.csv"
          rows={report.usage}
          columns={[
            { key: 'name', label: 'Ingredient', export: (row) => row.name },
            { key: 'unit', label: 'Unit', export: (row) => row.unit },
            qty('used', 'Used'),
            qty('wasted', 'Wasted'),
            { key: 'wastePercent', label: 'Waste %', align: 'right', render: (row) => formatPercent(row.wastePercent), export: (row) => row.wastePercent },
            money('cost', 'Cost'),
          ]}
        />
      ) : null}

      {tab === 'waste' ? (
        <div className="space-y-8">
          <p className="text-sm text-ink">Total waste cost {formatSignedMoney(report.wasteTotal)}.</p>
          <ReportTable
            title="By ingredient"
            filename="waste-by-ingredient.csv"
            emptyTitle="No waste"
            emptyDescription="Completed batches in this period have no recorded waste."
            rows={report.wasteByIngredient}
            columns={[
              { key: 'name', label: 'Ingredient', export: (row) => row.name },
              qty('quantity', 'Quantity'),
              money('cost', 'Cost'),
            ]}
          />
          <ReportTable
            title="By batch"
            filename="waste-by-batch.csv"
            emptyTitle="No waste"
            emptyDescription="Completed batches in this period have no recorded waste."
            rows={report.wasteByBatch}
            columns={[
              { key: 'batchNumber', label: 'Batch', export: (row) => row.batchNumber },
              { key: 'date', label: 'Date', render: (row) => formatDate(row.date), export: (row) => row.date },
              { key: 'product', label: 'Product', export: (row) => row.product },
              money('cost', 'Cost'),
            ]}
          />
        </div>
      ) : null}

      {tab === 'variance' ? (
        <div className="space-y-4">
          <label className="block max-w-xs text-sm text-ink">
            Highlight when variance is over
            <span className="mt-1 flex items-center gap-2">
              <input className={controlClass} type="number" min="0" value={threshold} aria-label="Variance threshold percent" onChange={(event) => setThreshold(event.target.value)} />
              <span>%</span>
            </span>
          </label>
          <ReportTable
            title="Expected versus actual"
            filename="production-variance.csv"
            rows={report.variance}
            rowClassName={(row) => (row.over ? 'bg-amber-50' : '')}
            columns={[
              { key: 'batchNumber', label: 'Batch', export: (row) => row.batchNumber },
              { key: 'date', label: 'Date', render: (row) => formatDate(row.date), export: (row) => row.date },
              { key: 'product', label: 'Product', export: (row) => row.product },
              { key: 'ingredient', label: 'Ingredient', export: (row) => row.ingredient },
              qty('expected', 'Expected'),
              qty('actual', 'Actual'),
              qty('variance', 'Variance'),
              { key: 'variancePercent', label: 'Variance %', align: 'right', render: (row) => formatPercent(row.variancePercent), export: (row) => row.variancePercent ?? '' },
            ]}
          />
        </div>
      ) : null}
    </>
  )
}
