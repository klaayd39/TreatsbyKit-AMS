import { Search } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import DataTable from '../../components/ui/DataTable'
import EmptyState from '../../components/ui/EmptyState'
import Field, { controlClass } from '../../components/ui/Field'
import Modal from '../../components/ui/Modal'
import LastChanged from '../../components/LastChanged'
import PageHeader from '../../components/ui/PageHeader'
import { postMissingEntries, reverseManualEntry, saveManualEntry, SOURCE_LABELS, sourcePath } from '../../data/journal'
import { COLLECTIONS } from '../../data/seed'
import { getAll } from '../../data/storage'
import { useRefresh } from '../../hooks/useRefresh'
import { formatCurrency, formatDate, todayISODate } from '../../utils/format'
import { lineTotals, toCentavos } from '../../utils/money'

function blankLine() {
  return { accountId: '', debit: '', credit: '', memo: '' }
}

function accountName(accounts, accountId) {
  const account = accounts.find((entry) => entry.id === accountId)
  return account ? `${account.code} ${account.name}` : 'Unknown account'
}

export default function JournalEntriesPage() {
  const [saving, setSaving] = useState(false)
  const [, refresh] = useRefresh()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [sourceType, setSourceType] = useState('')
  const [accountId, setAccountId] = useState('')
  const [status, setStatus] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [manual, setManual] = useState(null)
  const [reverseId, setReverseId] = useState(null)
  const [reason, setReason] = useState('')
  const [reverseDate, setReverseDate] = useState('')
  const [errors, setErrors] = useState({})
  const [notice, setNotice] = useState('')

  const accounts = getAll(COLLECTIONS.ACCOUNTS).sort((a, b) => a.code.localeCompare(b.code))
  const activeAccounts = accounts.filter((account) => account.active !== false)
  const entries = getAll(COLLECTIONS.JOURNAL_ENTRIES)
  const selected = entries.find((entry) => entry.id === params.get('entry')) || null
  const query = search.trim().toLowerCase()
  const filtered = entries
    .filter((entry) => {
      if (dateFrom && entry.date < dateFrom) return false
      if (dateTo && entry.date > dateTo) return false
      if (sourceType && entry.sourceType !== sourceType) return false
      if (status && entry.status !== status) return false
      if (accountId && !(entry.lines || []).some((line) => line.accountId === accountId)) return false
      if (!query) return true
      return entry.entryNumber.toLowerCase().includes(query) || entry.description.toLowerCase().includes(query)
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.entryNumber).localeCompare(String(a.entryNumber)))

  function openManual() {
    setErrors({})
    setManual({ date: todayISODate(), description: '', lines: [blankLine(), blankLine()] })
  }

  function updateLine(index, changes) {
    setManual((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) => (lineIndex === index ? { ...line, ...changes } : line)),
    }))
  }

  async function submitManual(event) {
    setSaving(true)
    try {
    event.preventDefault()
    const result = await saveManualEntry({
      ...manual,
      lines: manual.lines.map((line) => ({
        accountId: line.accountId,
        debit: line.debit === '' ? 0 : Number(line.debit),
        credit: line.credit === '' ? 0 : Number(line.credit),
        memo: line.memo,
      })),
    })
    if (!result.ok) {
      setErrors({ form: result.error })
      return
    }
    setManual(null)
    setNotice(`${result.entry.entryNumber} posted.`)
    refresh()
  
    } finally {
      setSaving(false)
    }
  }

  async function submitReverse(event) {
    setSaving(true)
    try {
    event.preventDefault()
    const result = await reverseManualEntry(reverseId, { date: reverseDate, reason })
    if (!result.ok) {
      setErrors({ form: result.error })
      return
    }
    setReverseId(null)
    setNotice(result.skipped ? 'That entry was already reversed.' : `${result.entry.entryNumber} reverses the original entry.`)
    refresh()
  
    } finally {
      setSaving(false)
    }
  }

  function postMissing() {
    const result = postMissingEntries()
    const posted = result.posted ? `Posted ${result.posted} missing ${result.posted === 1 ? 'entry' : 'entries'}.` : 'No missing entries.'
    setNotice(result.errors.length ? `${posted} ${result.errors[0]}` : posted)
    refresh()
  }

  const totals = manual ? lineTotals(manual.lines.map((line) => ({ debit: line.debit || 0, credit: line.credit || 0 }))) : null
  const manualReady =
    manual &&
    manual.date &&
    manual.description.trim() &&
    manual.lines.length >= 2 &&
    manual.lines.every((line) => line.accountId && ((toCentavos(line.debit) > 0 && toCentavos(line.credit) === 0) || (toCentavos(line.credit) > 0 && toCentavos(line.debit) === 0))) &&
    totals.balanced

  return (
    <>
      <PageHeader
        title="Journal"
        description="Posted entries stay on the books. A reversal swaps the debits and credits and links back to the original."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={postMissing}>Post missing entries</Button>
            <Button onClick={openManual}>Manual entry</Button>
          </div>
        }
      />
      {notice ? <p className="mb-4 rounded-xl bg-sand px-4 py-3 text-sm text-ink">{notice}</p> : null}
      {entries.length === 0 ? (
        <EmptyState
          title="No journal entries yet"
          description="Post missing entries to bring existing purchases, production, and sales into the books, or add a manual entry."
          action={<Button onClick={postMissing}>Post missing entries</Button>}
        />
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <input className={`${controlClass} pl-9`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search description or entry no." aria-label="Search journal entries" />
            </div>
            <select className={controlClass} value={sourceType} aria-label="Filter by source type" onChange={(event) => setSourceType(event.target.value)}>
              <option value="">All sources</option>
              {Object.entries(SOURCE_LABELS).map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
            <select className={controlClass} value={accountId} aria-label="Filter by account" onChange={(event) => setAccountId(event.target.value)}>
              <option value="">All accounts</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.code} {account.name}</option>
              ))}
            </select>
            <select className={controlClass} value={status} aria-label="Filter by status" onChange={(event) => setStatus(event.target.value)}>
              <option value="">All statuses</option>
              <option value="posted">Posted</option>
              <option value="reversed">Reversed</option>
            </select>
            <input type="date" className={controlClass} value={dateFrom} aria-label="Journal date from" onChange={(event) => setDateFrom(event.target.value)} />
            <input type="date" className={controlClass} value={dateTo} aria-label="Journal date to" onChange={(event) => setDateTo(event.target.value)} />
          </div>
          {filtered.length === 0 ? (
            <EmptyState title="No entries match" description="Try another date, source, or account." />
          ) : (
            <DataTable>
              <thead className="bg-sand/50">
                <tr>
                  <th scope="col">Entry</th>
                  <th scope="col">Date</th>
                  <th scope="col">Description</th>
                  <th scope="col">Source</th>
                  <th scope="col" className="text-right">Amount</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => {
                  const path = sourcePath(entry.sourceType)
                  const amount = (entry.lines || []).reduce((total, line) => total + (Number(line.debit) || 0), 0)
                  return (
                    <tr key={entry.id}>
                      <td>
                        <button type="button" className="font-medium text-accent hover:underline" onClick={() => setParams({ entry: entry.id })}>
                          {entry.entryNumber}
                        </button>
                      </td>
                      <td className="whitespace-nowrap">{formatDate(entry.date)}</td>
                      <td>{entry.description}</td>
                      <td>
                        {path ? <Link className="text-accent hover:underline" to={path}>{SOURCE_LABELS[entry.sourceType] || entry.sourceType}</Link> : SOURCE_LABELS[entry.sourceType] || entry.sourceType}
                      </td>
                      <td className="text-right tabular-nums whitespace-nowrap">{formatCurrency(amount)}</td>
                      <td>
                        <Badge tone={entry.status === 'reversed' ? 'warning' : 'success'}>{entry.status === 'reversed' ? 'Reversed' : 'Posted'}</Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </DataTable>
          )}
        </>
      )}

      {selected ? (
        <Modal title={selected.entryNumber} size="lg" onClose={() => setParams({})}>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={selected.status === 'reversed' ? 'warning' : 'success'}>{selected.status === 'reversed' ? 'Reversed' : 'Posted'}</Badge>
              <span className="text-sm text-muted">{formatDate(selected.date)}</span>
            </div>
            <p className="text-sm text-ink">{selected.description}</p>
            <LastChanged table="journalEntries" id={selected.id} />
            {sourcePath(selected.sourceType) ? (
              <Link className="text-sm font-medium text-accent hover:underline" to={sourcePath(selected.sourceType)}>
                Open {SOURCE_LABELS[selected.sourceType] || 'source'}
              </Link>
            ) : null}
            {selected.reversalOfId ? (
              <button type="button" className="block text-sm font-medium text-accent hover:underline" onClick={() => setParams({ entry: selected.reversalOfId })}>
                Original entry
              </button>
            ) : null}
            {selected.reversedById ? (
              <button type="button" className="block text-sm font-medium text-accent hover:underline" onClick={() => setParams({ entry: selected.reversedById })}>
                Reversing entry
              </button>
            ) : null}
            <DataTable>
              <thead className="bg-sand/50">
                <tr>
                  <th scope="col">Account</th>
                  <th scope="col">Memo</th>
                  <th scope="col" className="text-right">Debit</th>
                  <th scope="col" className="text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                {(selected.lines || []).map((line) => (
                  <tr key={line.id}>
                    <td>{accountName(accounts, line.accountId)}</td>
                    <td>{line.memo || '—'}</td>
                    <td className="text-right tabular-nums">{toCentavos(line.debit) ? formatCurrency(line.debit) : '—'}</td>
                    <td className="text-right tabular-nums">{toCentavos(line.credit) ? formatCurrency(line.credit) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
            {selected.status === 'posted' && !selected.reversalOfId ? (
              <div className="flex justify-end">
                <Button
                  variant="danger"
                  onClick={() => {
                    setErrors({})
                    setReason('')
                    setReverseDate(todayISODate())
                    setReverseId(selected.id)
                  }}
                >
                  Reverse entry
                </Button>
              </div>
            ) : null}
          </div>
        </Modal>
      ) : null}

      {manual ? (
        <Modal title="Manual entry" size="lg" onClose={() => setManual(null)}>
          <form className="space-y-4" onSubmit={submitManual} noValidate>
            {errors.form ? <p className="text-sm text-red-800">{errors.form}</p> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Date" htmlFor="je-date">
                <input id="je-date" type="date" className={controlClass} value={manual.date} onChange={(event) => setManual({ ...manual, date: event.target.value })} />
              </Field>
              <Field label="Description" htmlFor="je-description">
                <input id="je-description" className={controlClass} value={manual.description} onChange={(event) => setManual({ ...manual, description: event.target.value })} />
              </Field>
            </div>
            <div className="space-y-3">
              {manual.lines.map((line, index) => (
                <div key={index} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-4">
                  <select className={controlClass} aria-label={`Line ${index + 1} account`} value={line.accountId} onChange={(event) => updateLine(index, { accountId: event.target.value })}>
                    <option value="">Account</option>
                    {activeAccounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.code} {account.name}</option>
                    ))}
                  </select>
                  <input className={`${controlClass} text-right`} inputMode="decimal" aria-label={`Line ${index + 1} debit`} placeholder="Debit" value={line.debit} onChange={(event) => updateLine(index, { debit: event.target.value, credit: event.target.value ? '' : line.credit })} />
                  <input className={`${controlClass} text-right`} inputMode="decimal" aria-label={`Line ${index + 1} credit`} placeholder="Credit" value={line.credit} onChange={(event) => updateLine(index, { credit: event.target.value, debit: event.target.value ? '' : line.debit })} />
                  <input className={controlClass} aria-label={`Line ${index + 1} memo`} placeholder="Memo" value={line.memo} onChange={(event) => updateLine(index, { memo: event.target.value })} />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <Button variant="secondary" onClick={() => setManual({ ...manual, lines: [...manual.lines, blankLine()] })}>Add line</Button>
              <div className="flex items-center gap-3">
                <span className="tabular-nums">Debits {formatCurrency(totals.debit)}</span>
                <span className="tabular-nums">Credits {formatCurrency(totals.credit)}</span>
                <Badge tone={totals.balanced ? 'success' : 'danger'}>{totals.balanced ? 'Balanced' : 'Out of balance'}</Badge>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setManual(null)}>Cancel</Button>
              <Button type="submit" disabled={saving || !manualReady}>Save entry</Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {reverseId ? (
        <Modal title="Reverse entry" onClose={() => setReverseId(null)}>
          <form className="space-y-4" onSubmit={submitReverse} noValidate>
            {errors.form ? <p className="text-sm text-red-800">{errors.form}</p> : null}
            <Field label="Date" htmlFor="reverse-date">
              <input id="reverse-date" type="date" className={controlClass} value={reverseDate} onChange={(event) => setReverseDate(event.target.value)} />
            </Field>
            <Field label="Reason" htmlFor="reverse-reason">
              <textarea id="reverse-reason" rows={3} className={controlClass} value={reason} onChange={(event) => setReason(event.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setReverseId(null)}>Cancel</Button>
              <Button type="submit" disabled={saving} variant="danger">Reverse entry</Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  )
}
