import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import ChartCard from '../../components/reports/ChartCard'
import DateRangePicker from '../../components/reports/DateRangePicker'
import ReportTable from '../../components/reports/ReportTable'
import ReportTabs from '../../components/reports/ReportTabs'
import PageHeader from '../../components/ui/PageHeader'
import { useReportRange } from '../../hooks/useReportRange'
import { cashPosition, expenseBreakdown, monthlySummary, payablesAging, profitability, receivablesAging } from '../../reports/financial'
import { formatPercent } from '../../reports/format'
import { monthLabel } from '../../reports/periods'
import { COLLECTIONS } from '../../data/seed'
import { getAll } from '../../data/storage'
import { formatQuantity, formatSignedMoney } from '../../utils/format'

const TABS = [
  { id: 'expenses', label: 'Expense Breakdown' },
  { id: 'products', label: 'Profitability' },
  { id: 'aging', label: 'Aging' },
  { id: 'cash', label: 'Cash Position' },
  { id: 'monthly', label: 'Monthly Summary' },
]

function money(key, label) {
  return {
    key,
    label,
    align: 'right',
    render: (row) => formatSignedMoney(row[key]),
    export: (row) => row[key],
    total: (totals) => formatSignedMoney(totals[key]),
    exportTotal: (totals) => totals[key],
  }
}

export default function ReportFinancialPage() {
  const range = useReportRange()
  const [tab, setTab] = useState('expenses')
  const accounts = getAll(COLLECTIONS.ACCOUNTS)
  const entries = getAll(COLLECTIONS.JOURNAL_ENTRIES)
  const sales = getAll(COLLECTIONS.SALES)
  const payments = getAll(COLLECTIONS.PAYMENTS)
  const items = getAll(COLLECTIONS.ITEMS)
  const shared = { accounts, entries, from: range.from, to: range.to }
  const expenses = expenseBreakdown(shared)
  const products = profitability({ sales, payments, items, from: range.from, to: range.to })
  const agingInput = {
    invoices: getAll(COLLECTIONS.PURCHASE_INVOICES),
    receipts: getAll(COLLECTIONS.RECEIVING_RECORDS),
    supplierPayments: getAll(COLLECTIONS.SUPPLIER_PAYMENTS),
    expenses: getAll(COLLECTIONS.EXPENSES),
    suppliers: getAll(COLLECTIONS.SUPPLIERS),
    sales,
    payments,
    customers: getAll(COLLECTIONS.CUSTOMERS),
    asOf: range.to,
  }
  const receivables = receivablesAging(agingInput)
  const payables = payablesAging(agingInput)
  const cash = cashPosition(shared)
  const months = monthlySummary({ accounts, entries, end: range.to }).map((row) => ({ ...row, label: monthLabel(row.from) }))

  return (
    <>
      <PageHeader title="Financial Reports" description="Expenses, margins, aging, and cash are read from posted journals and open balances." />
      <DateRangePicker preset={range.preset} from={range.from} to={range.to} today={range.today} onChange={range.onChange} />
      <ReportTabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === 'expenses' ? (
        <div className="space-y-6">
          <ReportTable
            title="By category"
            filename="expense-breakdown.csv"
            rows={expenses.rows}
            totals={expenses.rows.length ? { name: 'Total', amount: expenses.total } : null}
            columns={[
              { key: 'code', label: 'Code', export: (row) => row.code, total: () => '' },
              { key: 'name', label: 'Category', export: (row) => row.name, total: (totals) => totals.name },
              money('amount', 'Amount'),
            ]}
          />
          <div className="grid gap-6 xl:grid-cols-2">
            <ChartCard title="This period">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={expenses.rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="#e5dcd1" />
                  <XAxis dataKey="name" tick={{ fill: '#5e5348', fontSize: 11 }} interval={0} angle={-20} height={70} textAnchor="end" />
                  <YAxis tick={{ fill: '#5e5348', fontSize: 12 }} tickFormatter={(value) => formatSignedMoney(value)} width={88} />
                  <Tooltip formatter={(value) => formatSignedMoney(value)} />
                  <Bar dataKey="amount" name="Amount" fill="#8f4332" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Monthly trend">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={expenses.months} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="#e5dcd1" />
                  <XAxis dataKey="label" tick={{ fill: '#5e5348', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#5e5348', fontSize: 12 }} tickFormatter={(value) => formatSignedMoney(value)} width={88} />
                  <Tooltip formatter={(value) => formatSignedMoney(value)} />
                  <Bar dataKey="amount" name="Expenses" fill="#c47a4a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </div>
      ) : null}

      {tab === 'products' ? (
        <ReportTable
          title="Profitability by product"
          filename="profitability-by-product.csv"
          emptyTitle="No sales in this period"
          emptyDescription="Voided sales are left out."
          rows={products}
          columns={[
            { key: 'name', label: 'Product', export: (row) => row.name },
            { key: 'units', label: 'Units sold', align: 'right', render: (row) => formatQuantity(row.units), export: (row) => row.units },
            money('revenue', 'Revenue'),
            money('cogs', 'COGS'),
            money('grossProfit', 'Gross profit'),
            { key: 'margin', label: 'Gross margin', align: 'right', render: (row) => formatPercent(row.margin), export: (row) => row.margin ?? '' },
          ]}
        />
      ) : null}

      {tab === 'aging' ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <ReportTable
            title="Receivables"
            filename="receivables-aging.csv"
            rows={receivables.rows}
            totals={{ bucket: 'Total', count: receivables.count, total: receivables.total }}
            columns={[
              { key: 'bucket', label: 'Bucket', export: (row) => row.bucket, total: (totals) => totals.bucket },
              { key: 'count', label: 'Count', align: 'right', export: (row) => row.count, total: (totals) => totals.count },
              money('total', 'Total'),
            ]}
          />
          <ReportTable
            title="Payables"
            filename="payables-aging.csv"
            rows={payables.rows}
            totals={{ bucket: 'Total', count: payables.count, total: payables.total }}
            columns={[
              { key: 'bucket', label: 'Bucket', export: (row) => row.bucket, total: (totals) => totals.bucket },
              { key: 'count', label: 'Count', align: 'right', export: (row) => row.count, total: (totals) => totals.count },
              money('total', 'Total'),
            ]}
          />
        </div>
      ) : null}

      {tab === 'cash' ? (
        <ReportTable
          title="Cash on Hand, GCash, and Bank"
          filename="cash-position.csv"
          rows={cash.rows}
          totals={{ name: 'Total', opening: cash.opening, inflows: cash.inflows, outflows: cash.outflows, closing: cash.closing }}
          columns={[
            { key: 'code', label: 'Code', export: (row) => row.code, total: () => '' },
            { key: 'name', label: 'Account', export: (row) => row.name, total: (totals) => totals.name },
            money('opening', 'Opening'),
            money('inflows', 'Inflows'),
            money('outflows', 'Outflows'),
            money('closing', 'Closing'),
          ]}
        />
      ) : null}

      {tab === 'monthly' ? (
        <div className="space-y-6">
          <ReportTable
            title="Last 12 months"
            filename="monthly-summary.csv"
            rows={months}
            columns={[
              { key: 'label', label: 'Month', export: (row) => row.label },
              money('netSales', 'Net sales'),
              money('grossProfit', 'Gross profit'),
              money('expenses', 'Expenses'),
              money('netIncome', 'Net income'),
            ]}
          />
          <ChartCard title="Net sales and net income">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={months} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid stroke="#e5dcd1" />
                <XAxis dataKey="label" tick={{ fill: '#5e5348', fontSize: 11 }} interval={0} angle={-30} height={70} textAnchor="end" />
                <YAxis tick={{ fill: '#5e5348', fontSize: 12 }} tickFormatter={(value) => formatSignedMoney(value)} width={88} />
                <Tooltip formatter={(value) => formatSignedMoney(value)} />
                <Line type="monotone" dataKey="netSales" name="Net sales" stroke="#8f4332" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="netIncome" name="Net income" stroke="#5e5348" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      ) : null}
    </>
  )
}
