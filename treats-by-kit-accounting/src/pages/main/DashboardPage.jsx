import { Banknote, Factory, Receipt, ShoppingCart, TriangleAlert, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Link } from 'react-router-dom'
import ChartCard from '../../components/reports/ChartCard'
import { buttonClass } from '../../components/ui/buttonStyles'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import PageHeader from '../../components/ui/PageHeader'
import Badge from '../../components/ui/Badge'
import { useAuth } from '../../auth/useAuth'
import { getIntegrityReport } from '../../accounting/accounts'
import { loadDemoData } from '../../data/demo'
import { COLLECTIONS } from '../../data/seed'
import { getAll } from '../../data/storage'
import { useRefresh } from '../../hooks/useRefresh'
import { dashboardModel } from '../../reports/dashboard'
import { formatCurrency, formatDate, formatQuantity, formatSignedMoney, todayISODate } from '../../utils/format'
import { sum } from '../../utils/money'

function LinkedCard({ to, children }) {
  return (
    <Link to={to} className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
      <Card className="h-full transition hover:border-accent">{children}</Card>
    </Link>
  )
}

export default function DashboardPage() {
  const { profile } = useAuth()
  const [saving, setSaving] = useState(false)
  const [, refresh] = useRefresh()
  const [notice, setNotice] = useState('')
  const [today] = useState(() => todayISODate())
  const model = dashboardModel({
    today,
    items: getAll(COLLECTIONS.ITEMS),
    movements: getAll(COLLECTIONS.STOCK_MOVEMENTS),
    sales: getAll(COLLECTIONS.SALES),
    payments: getAll(COLLECTIONS.PAYMENTS),
    invoices: getAll(COLLECTIONS.PURCHASE_INVOICES),
    receipts: getAll(COLLECTIONS.RECEIVING_RECORDS),
    supplierPayments: getAll(COLLECTIONS.SUPPLIER_PAYMENTS),
    expenses: getAll(COLLECTIONS.EXPENSES),
    suppliers: getAll(COLLECTIONS.SUPPLIERS),
    customers: getAll(COLLECTIONS.CUSTOMERS),
    orders: getAll(COLLECTIONS.ORDERS),
    batches: getAll(COLLECTIONS.PRODUCTION_BATCHES),
    accounts: getAll(COLLECTIONS.ACCOUNTS),
    entries: getAll(COLLECTIONS.JOURNAL_ENTRIES),
    checks: getIntegrityReport(),
  })

  async function onLoadDemo() {
    setSaving(true)
    try {
      setNotice((await loadDemoData()).message)
      refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Today's trade, this month's result, and anything that needs attention."
        actions={profile?.role === 'owner' && import.meta.env.VITE_ENABLE_DEMO === 'true' ? (
          <Button variant="secondary" disabled={saving} onClick={onLoadDemo}>Load demo data</Button>
        ) : null}
      />
      {notice ? <p className="mb-4 rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink">{notice}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <LinkedCard to="/sales/reports">
          <p className="text-sm font-medium text-muted">Today's Sales</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{formatCurrency(model.todaySales)}</p>
          <p className="mt-1 text-sm text-muted">{model.todayCount ? `${model.todayCount} sales today` : 'No sales yet today'}</p>
        </LinkedCard>
        <LinkedCard to="/sales/reports">
          <p className="text-sm font-medium text-muted">Today's Gross Profit</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{formatSignedMoney(model.todayGrossProfit)}</p>
          <p className="mt-1 text-sm text-muted">After cost of goods sold</p>
        </LinkedCard>
        <LinkedCard to="/accounting/financial-statements?tab=income">
          <p className="text-sm font-medium text-muted">This Month's Net Income</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{formatSignedMoney(model.netIncome)}</p>
          <p className="mt-1 text-sm text-muted">From posted journals</p>
        </LinkedCard>
        <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <Link to="/accounting/financial-statements?tab=cash" className="text-sm font-medium text-muted hover:text-accent">Cash Balance</Link>
            <span className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent"><Wallet className="size-4" aria-hidden="true" /></span>
          </div>
          <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{formatSignedMoney(model.cashTotal)}</p>
          <details className="mt-1">
            <summary className="cursor-pointer text-sm text-muted">By account</summary>
            <ul className="mt-2 space-y-1 text-sm">
              {model.cashRows.map((row) => (
                <li key={row.id} className="flex justify-between gap-3">
                  <span>{row.name}</span>
                  <span className="tabular-nums">{formatSignedMoney(row.balance)}</span>
                </li>
              ))}
            </ul>
          </details>
        </section>
        <LinkedCard to="/accounting/accounts-receivable">
          <p className="text-sm font-medium text-muted">Receivables</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{formatCurrency(model.receivables)}</p>
          <p className="mt-1 text-sm text-muted">Open sales</p>
        </LinkedCard>
        <LinkedCard to="/accounting/accounts-payable">
          <p className="text-sm font-medium text-muted">Payables</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{formatCurrency(model.payables)}</p>
          <p className="mt-1 text-sm text-muted">Open invoices and unpaid expenses</p>
        </LinkedCard>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Link to="/inventory/reports?tab=low" className="rounded-2xl border border-line bg-white px-4 py-3 text-sm hover:border-accent">
          <span className="flex items-center gap-2 font-medium"><TriangleAlert className="size-4 text-accent" aria-hidden="true" /> Low stock</span>
          <span className="mt-1 block text-muted">{model.lowStock.length} {model.lowStock.length === 1 ? 'item' : 'items'}</span>
        </Link>
        <Link to="/accounting/accounts-payable" className="rounded-2xl border border-line bg-white px-4 py-3 text-sm hover:border-accent">
          <span className="font-medium">Overdue payables</span>
          <span className="mt-1 block tabular-nums text-muted">{formatCurrency(sum(model.overduePayables.map((row) => row.balance)))}</span>
        </Link>
        <Link to="/accounting/accounts-receivable" className="rounded-2xl border border-line bg-white px-4 py-3 text-sm hover:border-accent">
          <span className="font-medium">Overdue receivables</span>
          <span className="mt-1 block tabular-nums text-muted">{formatCurrency(sum(model.overdueReceivables.map((row) => row.balance)))}</span>
        </Link>
        <Link to="/sales/orders" className="rounded-2xl border border-line bg-white px-4 py-3 text-sm hover:border-accent">
          <span className="font-medium">Orders due in 3 days</span>
          <span className="mt-1 block text-muted">{model.dueOrders.length}</span>
        </Link>
        <Link to="/accounting/general-ledger" className="rounded-2xl border border-line bg-white px-4 py-3 text-sm hover:border-accent">
          <span className="font-medium">Integrity checks</span>
          <span className="mt-1 block"><Badge tone={model.integrityPass ? 'success' : 'danger'}>{model.integrityPass ? 'Pass' : 'Fail'}</Badge></span>
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link className={buttonClass('primary')} to="/sales/pos"><ShoppingCart className="size-4" aria-hidden="true" /> New Sale</Link>
        <Link className={buttonClass('secondary')} to="/purchasing/invoices"><Receipt className="size-4" aria-hidden="true" /> New Purchase Invoice</Link>
        <Link className={buttonClass('secondary')} to="/production/batches"><Factory className="size-4" aria-hidden="true" /> New Production Batch</Link>
        <Link className={buttonClass('secondary')} to="/accounting/expenses"><Banknote className="size-4" aria-hidden="true" /> New Expense</Link>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <ChartCard title="Sales and gross profit, last 30 days">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={model.trend} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid stroke="#e5dcd1" />
              <XAxis dataKey="label" tick={{ fill: '#5e5348', fontSize: 11 }} interval={4} />
              <YAxis tick={{ fill: '#5e5348', fontSize: 12 }} tickFormatter={(value) => formatCurrency(value)} width={88} />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Bar dataKey="sales" name="Sales" fill="#3d6e90" radius={[4, 4, 0, 0]} />
              <Bar dataKey="grossProfit" name="Gross profit" fill="#c47a4a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Top products this month">
          {model.topProducts.length === 0 ? <p className="text-sm text-muted">No sales this month.</p> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={model.topProducts} layout="vertical" margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid stroke="#e5dcd1" />
                <XAxis type="number" tick={{ fill: '#5e5348', fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fill: '#5e5348', fontSize: 12 }} />
                <Tooltip formatter={(value) => formatQuantity(value)} />
                <Bar dataKey="units" name="Units" fill="#3d6e90" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
      <div className="mt-6">
        <ChartCard title="Expenses this month">
          {model.expenses.length === 0 ? <p className="text-sm text-muted">No expenses posted this month.</p> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={model.expenses} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid stroke="#e5dcd1" />
                <XAxis dataKey="name" tick={{ fill: '#5e5348', fontSize: 11 }} interval={0} angle={-20} height={70} textAnchor="end" />
                <YAxis tick={{ fill: '#5e5348', fontSize: 12 }} tickFormatter={(value) => formatCurrency(value)} width={88} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Bar dataKey="amount" name="Amount" fill="#3d6e90" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <section className="mt-6 rounded-2xl border border-line bg-white p-5">
        <h2 className="text-sm font-medium text-muted">Recent activity</h2>
        {model.activity.length === 0 ? <p className="mt-3 text-sm text-muted">Sales, purchases, production, expenses, and manual journal entries will show here.</p> : (
          <ul className="mt-3 divide-y divide-line">
            {model.activity.map((row) => (
              <li key={row.id}>
                <Link to={row.href} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm hover:text-accent">
                  <span>
                    <span className="font-medium text-ink">{row.title}</span>
                    <span className="text-muted"> · {row.detail}</span>
                  </span>
                  <span className="text-muted">{formatDate(row.date)}{row.amount === null || row.amount === undefined ? '' : ` · ${formatSignedMoney(row.amount)}`}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
