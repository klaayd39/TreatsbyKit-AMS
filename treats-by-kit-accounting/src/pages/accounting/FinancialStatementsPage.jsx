import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import DateRangePicker from '../../components/reports/DateRangePicker'
import PrintLayout from '../../components/reports/PrintLayout'
import ReportTabs from '../../components/reports/ReportTabs'
import StatementSection from '../../components/reports/StatementSection'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import PageHeader from '../../components/ui/PageHeader'
import { useReportRange } from '../../hooks/useReportRange'
import { previousRange } from '../../reports/periods'
import { balanceSheet, cashFlow, incomeStatement } from '../../reports/statements'
import { COLLECTIONS } from '../../data/seed'
import { getAll } from '../../data/storage'
import { formatDate, formatSignedMoney } from '../../utils/format'
import { controlClass } from '../../components/ui/Field'

const TABS = [
  { id: 'income', label: 'Income Statement' },
  { id: 'balance', label: 'Balance Sheet' },
  { id: 'cash', label: 'Cash Flow' },
]

export default function FinancialStatementsPage() {
  const [params] = useSearchParams()
  const range = useReportRange()
  const [tab, setTab] = useState(params.get('tab') || 'income')
  const [compare, setCompare] = useState(false)
  const [compareAsOf, setCompareAsOf] = useState('')
  const accounts = getAll(COLLECTIONS.ACCOUNTS)
  const entries = getAll(COLLECTIONS.JOURNAL_ENTRIES)
  const previous = previousRange(range.from, range.to)
  const comparing = compare && tab !== 'cash'
  const income = incomeStatement({
    accounts,
    entries,
    from: range.from,
    to: range.to,
    compareFrom: comparing ? previous.from : '',
    compareTo: comparing ? previous.to : '',
  })
  const asOfCompare = comparing ? (compareAsOf || previous.to) : ''
  const sheet = balanceSheet({ accounts, entries, asOf: range.to, compareAsOf: tab === 'balance' ? asOfCompare : '' })
  const flow = cashFlow({ accounts, entries, from: range.from, to: range.to })

  function toggleCompare(event) {
    const next = event.target.checked
    setCompare(next)
    if (next && !compareAsOf) setCompareAsOf(previous.to)
  }

  return (
    <>
      <PageHeader
        title="Financial Statements"
        description="Built from posted journal entries. Reversals stay in the totals, so a voided sale nets to zero."
        actions={<Button className="no-print" variant="secondary" onClick={() => window.print()}>Print</Button>}
      />
      <DateRangePicker preset={range.preset} from={range.from} to={range.to} today={range.today} onChange={range.onChange} />
      <ReportTabs tabs={TABS} value={tab} onChange={setTab} />
      {tab !== 'cash' ? (
        <label className="no-print mb-4 flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={compare} onChange={toggleCompare} />
          {tab === 'income' ? 'Compare with the previous period of equal length' : 'Compare with another date'}
        </label>
      ) : null}
      {tab === 'balance' && compare ? (
        <div className="no-print mb-4 max-w-xs">
          <input type="date" className={controlClass} aria-label="Compare as of" value={compareAsOf || previous.to} onChange={(event) => setCompareAsOf(event.target.value)} />
        </div>
      ) : null}

      {tab === 'income' ? (
        <PrintLayout title="Income Statement" subtitle={`${formatDate(range.from)} – ${formatDate(range.to)}`}>
          <StatementSection lines={income.lines} compare={comparing} from={range.from} to={range.to} filename="income-statement.csv" />
        </PrintLayout>
      ) : null}

      {tab === 'balance' ? (
        <PrintLayout title="Balance Sheet" subtitle={`As of ${formatDate(range.to)}`}>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Badge tone={sheet.balanced ? 'success' : 'danger'}>{sheet.balanced ? 'Balanced' : 'Out of balance'}</Badge>
            {sheet.balanced ? null : <p className="text-sm text-ink">Difference {formatSignedMoney(sheet.difference)}. Assets should equal liabilities plus equity.</p>}
          </div>
          <StatementSection lines={sheet.lines} compare={comparing} from="" to={range.to} filename="balance-sheet.csv" />
        </PrintLayout>
      ) : null}

      {tab === 'cash' ? (
        <PrintLayout title="Cash Flow Statement" subtitle={`${formatDate(range.from)} – ${formatDate(range.to)}`}>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Badge tone={flow.pass ? 'success' : 'danger'}>{flow.pass ? 'Pass' : 'Fail'}</Badge>
            <p className="text-sm text-muted">
              Closing cash {formatSignedMoney(flow.closing)} {flow.pass ? 'matches' : 'does not match'} the cash accounts {formatSignedMoney(flow.ledgerClosing)}.
            </p>
          </div>
          <StatementSection lines={flow.lines} compare={false} from={range.from} to={range.to} filename="cash-flow.csv" />
        </PrintLayout>
      ) : null}
    </>
  )
}
