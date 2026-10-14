import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import DataTable from '../../components/ui/DataTable'
import EmptyState from '../../components/ui/EmptyState'
import DateRangePicker from '../../components/reports/DateRangePicker'
import PageHeader from '../../components/ui/PageHeader'
import { paymentMethodLabel } from '../../data/sales'
import { COLLECTIONS } from '../../data/seed'
import { getAll } from '../../data/storage'
import { useReportRange } from '../../hooks/useReportRange'
import { downloadCsv } from '../../reports/csv'
import { formatCurrency, formatDate, formatQuantity } from '../../utils/format'
import { getSalesSummary } from '../../utils/sales'

export default function SalesReportsPage() {
  const range = useReportRange()

  const sales = getAll(COLLECTIONS.SALES)
  const payments = getAll(COLLECTIONS.PAYMENTS)
  const items = getAll(COLLECTIONS.ITEMS)
  const itemName = (id) => items.find((item) => item.id === id)?.name || 'Unknown item'
  const summary = getSalesSummary(sales, { from: range.from, to: range.to, payments })
  const chartRows = summary.byDay.map((day) => ({ label: formatDate(day.date), total: day.total }))
  const hasSales = sales.some((sale) => sale.status !== 'voided')

  function exportProducts() {
    downloadCsv('sales-by-product.csv', [
      ['Product', 'Units sold', 'Revenue', 'COGS', 'Gross profit'],
      ...summary.byProduct.map((row) => [itemName(row.itemId), row.units, row.revenue, row.cogs, row.grossProfit]),
    ])
  }

  function exportDays() {
    downloadCsv('sales-by-day.csv', [
      ['Date', 'Sales', 'Total'],
      ...summary.byDay.map((row) => [row.date, row.count, row.total]),
    ])
  }

  return (
    <>
      <PageHeader
        title="Sales Reports"
        description="Voided sales are left out. Units sold answers how many of each product, including Buko Pie, moved in this period."
      />
      <DateRangePicker preset={range.preset} from={range.from} to={range.to} today={range.today} onChange={range.onChange} />

      {!hasSales ? (
        <EmptyState title="No sales yet" description="Reports fill in after a POS sale or a completed order." />
      ) : summary.saleCount === 0 ? (
        <EmptyState title="No sales in this period" description="Try another date range." />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Card title="Total sales" value={formatCurrency(summary.totalSales)} hint={`${summary.saleCount} sales`} />
            <Card title="Discounts" value={formatCurrency(summary.totalDiscounts)} />
            <Card title="COGS" value={formatCurrency(summary.cogs)} />
            <Card title="Gross profit" value={formatCurrency(summary.grossProfit)} />
            <Card title="Unpaid balance" value={formatCurrency(summary.unpaidBalance)} />
            <Card title="Number of sales" value={summary.saleCount} />
          </div>

          <section className="rounded-2xl border border-line bg-white p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium text-muted">Units sold by product</h2>
              <Button variant="secondary" onClick={exportProducts}>Export CSV</Button>
            </div>
            <DataTable>
              <thead className="bg-sand/50">
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col" className="text-right">Units sold</th>
                  <th scope="col" className="text-right">Revenue</th>
                  <th scope="col" className="text-right">COGS</th>
                  <th scope="col" className="text-right">Gross profit</th>
                </tr>
              </thead>
              <tbody>
                {summary.byProduct.map((row) => (
                  <tr key={row.itemId}>
                    <td className="font-medium">{itemName(row.itemId)}</td>
                    <td className="text-right tabular-nums">{formatQuantity(row.units)}</td>
                    <td className="text-right tabular-nums">{formatCurrency(row.revenue)}</td>
                    <td className="text-right tabular-nums">{formatCurrency(row.cogs)}</td>
                    <td className="text-right tabular-nums">{formatCurrency(row.grossProfit)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </section>

          <section className="rounded-2xl border border-line bg-white p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium text-muted">Sales by day</h2>
              <Button variant="secondary" onClick={exportDays}>Export CSV</Button>
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartRows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="#e5dcd1" />
                  <XAxis dataKey="label" tick={{ fill: '#5e5348', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#5e5348', fontSize: 12 }} tickFormatter={(value) => formatCurrency(value)} width={88} />
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Bar dataKey="total" name="Sales" fill="#8f4332" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-line bg-white p-5">
              <h2 className="mb-4 text-sm font-medium text-muted">Sales by payment method</h2>
              {summary.byMethod.length === 0 ? (
                <p className="text-sm text-muted">No payments in this period.</p>
              ) : (
                <DataTable>
                  <thead className="bg-sand/50">
                    <tr>
                      <th scope="col">Method</th>
                      <th scope="col" className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.byMethod.map((row) => (
                      <tr key={row.method}>
                        <td>{paymentMethodLabel(row.method)}</td>
                        <td className="text-right tabular-nums">{formatCurrency(row.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              )}
            </section>
            <section className="rounded-2xl border border-line bg-white p-5">
              <h2 className="mb-4 text-sm font-medium text-muted">Top products</h2>
              <ol className="space-y-2">
                {summary.topProducts.map((row, index) => (
                  <li key={row.itemId} className="flex items-center justify-between gap-3 text-sm">
                    <span>{index + 1}. {itemName(row.itemId)}</span>
                    <span className="tabular-nums">{formatQuantity(row.units)} sold</span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </div>
      )}
    </>
  )
}
