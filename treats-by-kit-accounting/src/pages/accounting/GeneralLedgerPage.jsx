import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import DataTable from '../../components/ui/DataTable'
import EmptyState from '../../components/ui/EmptyState'
import { controlClass } from '../../components/ui/Field'
import PageHeader from '../../components/ui/PageHeader'
import { getIntegrityReport, getLedger, getTrialBalance } from '../../accounting/accounts'
import { COLLECTIONS } from '../../data/seed'
import { getAll } from '../../data/storage'
import { formatCurrency, formatDate, todayISODate } from '../../utils/format'
import { toCentavos } from '../../utils/money'

function balanceLabel(netDebit) {
  const cents = toCentavos(netDebit)
  if (cents === 0) return formatCurrency(0)
  return `${formatCurrency(Math.abs(Number(netDebit) || 0))} ${cents > 0 ? 'Dr' : 'Cr'}`
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export default function GeneralLedgerPage() {
  const [params] = useSearchParams()
  const [tab, setTab] = useState('ledger')
  const [accountId, setAccountId] = useState(() => params.get('account') || '')
  const [from, setFrom] = useState(() => params.get('from') || '')
  const [to, setTo] = useState(() => params.get('to') || todayISODate())
  const [asOf, setAsOf] = useState(() => params.get('to') || todayISODate())
  const accounts = getAll(COLLECTIONS.ACCOUNTS).sort((a, b) => a.code.localeCompare(b.code))
  const checks = getIntegrityReport()
  const ledger = accountId ? getLedger(accountId, { from, to }) : null
  const trial = getTrialBalance(asOf)

  function exportTrial() {
    downloadCsv(`trial-balance-${asOf}.csv`, [
      ['Code', 'Account', 'Debit', 'Credit'],
      ...trial.rows.map((row) => [row.code, row.name, row.endingDebit || '', row.endingCredit || '']),
      ['', 'Total', trial.debit, trial.credit],
    ])
  }

  return (
    <>
      <PageHeader
        title="General Ledger"
        description="Balances come from posted journal lines. Reversed entries stay in the ledger together with the reversing entry."
      />
      <Card title="Accounting checks" className="mb-6">
        <ul className="space-y-3">
          {checks.map((check) => (
            <li key={check.id} className="rounded-xl border border-line px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-ink">{check.label}</p>
                <Badge tone={check.pass ? 'success' : 'danger'}>{check.pass ? 'Pass' : 'Fail'}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted">{check.detail}</p>
              {!check.pass && check.id !== 'inventory' ? (
                <p className="mt-1 text-sm text-ink">Difference {formatCurrency(Math.abs(Number(check.difference) || 0))}.</p>
              ) : null}
              {!check.pass && check.entries.length ? (
                <ul className="mt-2 space-y-1 text-sm">
                  {check.entries.map((entry) => (
                    <li key={entry.id}>
                      <Link className="font-medium text-accent hover:underline" to={`/accounting/journal-entries?entry=${entry.id}`}>
                        {entry.entryNumber}
                      </Link>
                      <span className="text-muted"> · {formatDate(entry.date)} · {entry.description}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      <div className="mb-4 flex gap-2">
        <Button variant={tab === 'ledger' ? 'primary' : 'secondary'} onClick={() => setTab('ledger')}>Ledger</Button>
        <Button variant={tab === 'trial' ? 'primary' : 'secondary'} onClick={() => setTab('trial')}>Trial Balance</Button>
      </div>

      {tab === 'ledger' ? (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <select className={controlClass} value={accountId} aria-label="Account" onChange={(event) => setAccountId(event.target.value)}>
              <option value="">Choose an account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.code} {account.name}</option>
              ))}
            </select>
            <input type="date" className={controlClass} value={from} aria-label="Ledger from" onChange={(event) => setFrom(event.target.value)} />
            <input type="date" className={controlClass} value={to} aria-label="Ledger to" onChange={(event) => setTo(event.target.value)} />
          </div>
          {!ledger ? (
            <EmptyState title="Choose an account" description="The ledger shows the opening balance, each line, and the closing balance." />
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Card title="Opening balance" value={balanceLabel(ledger.opening)} />
                <Card title="Closing balance" value={balanceLabel(ledger.closing)} />
              </div>
              {ledger.lines.length === 0 ? (
                <EmptyState title="No lines in this range" description="The opening balance is everything posted before the start date." />
              ) : (
                <DataTable>
                  <thead className="bg-sand/50">
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Entry</th>
                      <th scope="col">Description</th>
                      <th scope="col" className="text-right">Debit</th>
                      <th scope="col" className="text-right">Credit</th>
                      <th scope="col" className="text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.lines.map((line) => (
                      <tr key={line.id}>
                        <td className="whitespace-nowrap">{formatDate(line.date)}</td>
                        <td>
                          <Link className="font-medium text-accent hover:underline" to={`/accounting/journal-entries?entry=${line.entryId}`}>{line.entryNumber}</Link>
                        </td>
                        <td>{line.description}{line.memo ? <span className="text-muted"> · {line.memo}</span> : null}</td>
                        <td className="text-right tabular-nums">{toCentavos(line.debit) ? formatCurrency(line.debit) : '—'}</td>
                        <td className="text-right tabular-nums">{toCentavos(line.credit) ? formatCurrency(line.credit) : '—'}</td>
                        <td className="text-right tabular-nums whitespace-nowrap">{balanceLabel(line.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <input type="date" className={controlClass} value={asOf} aria-label="Trial balance as of" onChange={(event) => setAsOf(event.target.value)} />
            <Badge tone={trial.balanced ? 'success' : 'danger'}>{trial.balanced ? 'Balanced' : 'Out of balance'}</Badge>
            <Button variant="secondary" onClick={exportTrial}>Export CSV</Button>
          </div>
          <DataTable>
            <thead className="bg-sand/50">
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Account</th>
                <th scope="col" className="text-right">Debit</th>
                <th scope="col" className="text-right">Credit</th>
                <th scope="col" className="text-right">Ending balance</th>
              </tr>
            </thead>
            <tbody>
              {trial.rows.map((row) => (
                <tr key={row.id}>
                  <td className="font-medium">{row.code}</td>
                  <td>{row.name}</td>
                  <td className="text-right tabular-nums">{toCentavos(row.endingDebit) ? formatCurrency(row.endingDebit) : '—'}</td>
                  <td className="text-right tabular-nums">{toCentavos(row.endingCredit) ? formatCurrency(row.endingCredit) : '—'}</td>
                  <td className="text-right tabular-nums whitespace-nowrap">{balanceLabel((toCentavos(row.endingDebit) - toCentavos(row.endingCredit)) / 100)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={2}>Total</th>
                <td className="text-right font-semibold tabular-nums">{formatCurrency(trial.debit)}</td>
                <td className="text-right font-semibold tabular-nums">{formatCurrency(trial.credit)}</td>
                <td />
              </tr>
            </tfoot>
          </DataTable>
        </>
      )}
    </>
  )
}
