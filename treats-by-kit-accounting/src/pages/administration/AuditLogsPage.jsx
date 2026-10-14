import { useEffect, useState } from 'react'
import Button from '../../components/ui/Button'
import EmptyState from '../../components/ui/EmptyState'
import Field, { controlClass } from '../../components/ui/Field'
import Modal from '../../components/ui/Modal'
import PageHeader from '../../components/ui/PageHeader'
import { reportFailure } from '../../data/errors'
import { PAGE_SIZE, queryPage } from '../../data/storage'
import { formatDateTime } from '../../utils/format'

const ACTIONS = ['insert', 'update', 'delete']

function changedFields(before, after) {
  const left = before || {}
  const right = after || {}
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()
  return keys
    .filter((key) => JSON.stringify(left[key] ?? null) !== JSON.stringify(right[key] ?? null))
    .map((key) => ({ key, before: left[key], after: right[key] }))
}

export default function AuditLogsPage() {
  const [filters, setFilters] = useState({ from: '', to: '', table: '', action: '', user: '', recordId: '' })
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState([])
  const [count, setCount] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    queryPage('auditLogs', { page, filters })
      .then((result) => {
        if (cancelled) return
        setRows(result.rows)
        setCount(result.count)
        setError('')
      })
      .catch((loadError) => {
        if (!cancelled) setError(reportFailure(loadError))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [page, filters])

  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE))
  const diff = selected ? changedFields(selected.oldRow, selected.newRow) : []

  return (
    <>
      <PageHeader title="Activity" description="Who changed a record, and when." />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Field label="From" htmlFor="audit-from">
          <input id="audit-from" type="date" className={controlClass} value={filters.from} onChange={(event) => { setPage(1); setFilters({ ...filters, from: event.target.value }) }} />
        </Field>
        <Field label="To" htmlFor="audit-to">
          <input id="audit-to" type="date" className={controlClass} value={filters.to} onChange={(event) => { setPage(1); setFilters({ ...filters, to: event.target.value }) }} />
        </Field>
        <Field label="Table" htmlFor="audit-table">
          <input id="audit-table" className={controlClass} value={filters.table} onChange={(event) => { setPage(1); setFilters({ ...filters, table: event.target.value }) }} />
        </Field>
        <Field label="Action" htmlFor="audit-action">
          <select id="audit-action" className={controlClass} value={filters.action} onChange={(event) => { setPage(1); setFilters({ ...filters, action: event.target.value }) }}>
            <option value="">Any</option>
            {ACTIONS.map((action) => <option key={action} value={action}>{action}</option>)}
          </select>
        </Field>
        <Field label="User email" htmlFor="audit-user">
          <input id="audit-user" className={controlClass} value={filters.user} onChange={(event) => { setPage(1); setFilters({ ...filters, user: event.target.value }) }} />
        </Field>
        <Field label="Record id" htmlFor="audit-record">
          <input id="audit-record" className={controlClass} value={filters.recordId} onChange={(event) => { setPage(1); setFilters({ ...filters, recordId: event.target.value }) }} />
        </Field>
      </div>
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      {loading ? <p className="text-sm text-muted">Loading audit logs…</p> : null}
      {!loading && rows.length === 0 ? <EmptyState title="No audit rows" description="Changes will appear here after records are saved." /> : null}
      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Table</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Record</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="cursor-pointer border-b border-line last:border-0 hover:bg-sand" onClick={() => setSelected(row)}>
                  <td className="px-4 py-3">{formatDateTime(row.createdAt)}</td>
                  <td className="px-4 py-3">{row.tableName}</td>
                  <td className="px-4 py-3">{row.action}</td>
                  <td className="px-4 py-3">{row.userEmail || '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.recordId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="mt-4 flex items-center gap-2">
        <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
        <span className="text-sm text-muted">Page {page} of {pages}</span>
        <Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
      </div>
      {selected ? (
        <Modal title={`${selected.action} ${selected.tableName}`} onClose={() => setSelected(null)} size="lg">
          {diff.length === 0 ? <p className="text-sm text-muted">No field changed.</p> : (
            <ul className="space-y-3 text-sm">
              {diff.map((field) => (
                <li key={field.key}>
                  <p className="font-medium text-ink">{field.key}</p>
                  <p className="text-muted">Before: {field.before == null ? '—' : JSON.stringify(field.before)}</p>
                  <p className="text-ink">After: {field.after == null ? '—' : JSON.stringify(field.after)}</p>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      ) : null}
    </>
  )
}
