import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import Button from '../../components/ui/Button'
import EmptyState from '../../components/ui/EmptyState'
import Field, { controlClass } from '../../components/ui/Field'
import PageHeader from '../../components/ui/PageHeader'
import { reportFailure } from '../../data/errors'
import { getSupabase } from '../../lib/supabase'
import { formatDateTime } from '../../utils/format'

const ROLES = ['owner', 'bookkeeper', 'cashier', 'viewer']

export default function EmployeesPage() {
  const { profile } = useAuth()
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const [pendingId, setPendingId] = useState('')

  async function load() {
    const { data, error: loadError } = await getSupabase().rpc('list_employees')
    if (loadError) {
      setError(reportFailure(loadError))
      setRows([])
      return
    }
    setError('')
    setRows(data || [])
  }

  useEffect(() => {
    let cancelled = false
    load().then(() => {
      if (cancelled) return undefined
      return undefined
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function save(row, changes) {
    setPendingId(row.id)
    const { error: saveError } = await getSupabase().rpc('set_user_access', {
      p_user_id: row.id,
      p_role: changes.role,
      p_active: changes.active,
    })
    setPendingId('')
    if (saveError) {
      setError(reportFailure(saveError))
      return
    }
    await load()
  }

  return (
    <>
      <PageHeader
        title="Staff"
        description="Create the person in Supabase under Authentication, then Users. They appear here as inactive viewers until you activate them."
      />
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      {rows.length === 0 ? <EmptyState title="No employees yet" description="Add a user in the Supabase dashboard, then refresh this page." /> : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Active</th>
                <th className="px-4 py-3 font-medium">Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">{row.full_name || '—'}</td>
                  <td className="px-4 py-3">{row.email}</td>
                  <td className="px-4 py-3">
                    <Field label="Role" htmlFor={`role-${row.id}`} className="sr-only">
                      <span />
                    </Field>
                    <select
                      id={`role-${row.id}`}
                      className={controlClass}
                      value={row.role}
                      disabled={pendingId === row.id || row.id === profile?.id}
                      onChange={(event) => save(row, { role: event.target.value, active: row.active })}
                    >
                      {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      variant="secondary"
                      disabled={pendingId === row.id || row.id === profile?.id}
                      onClick={() => save(row, { role: row.role, active: !row.active })}
                    >
                      {row.active ? 'Deactivate' : 'Activate'}
                    </Button>
                  </td>
                  <td className="px-4 py-3">{row.last_sign_in_at ? formatDateTime(row.last_sign_in_at) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
