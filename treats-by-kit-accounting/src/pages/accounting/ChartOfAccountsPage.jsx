import { Lock, Search } from 'lucide-react'
import { useState } from 'react'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import DataTable from '../../components/ui/DataTable'
import EmptyState from '../../components/ui/EmptyState'
import Field, { controlClass } from '../../components/ui/Field'
import Modal from '../../components/ui/Modal'
import PageHeader from '../../components/ui/PageHeader'
import { getAccountBalance } from '../../accounting/accounts'
import {
  ACCOUNT_GROUPS,
  ACCOUNT_TYPES,
  accountGroup,
  accountTypeLabel,
  deleteAccount,
  normalBalanceFor,
  saveAccount,
} from '../../data/accounts'
import { COLLECTIONS } from '../../data/seed'
import { getAll } from '../../data/storage'
import { useRefresh } from '../../hooks/useRefresh'
import { formatCurrency } from '../../utils/format'
import { toCentavos } from '../../utils/money'

function balanceLabel(netDebit) {
  const cents = toCentavos(netDebit)
  if (cents === 0) return formatCurrency(0)
  return `${formatCurrency(Math.abs(netDebit))} ${cents > 0 ? 'Dr' : 'Cr'}`
}

function blankDraft() {
  return { code: '', name: '', type: 'expense', description: '', active: true }
}

export default function ChartOfAccountsPage() {
  const [saving, setSaving] = useState(false)
  const [, refresh] = useRefresh()
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState(null)
  const [errors, setErrors] = useState({})
  const [removeId, setRemoveId] = useState(null)
  const [notice, setNotice] = useState('')
  const accounts = getAll(COLLECTIONS.ACCOUNTS).sort((a, b) => a.code.localeCompare(b.code))
  const query = search.trim().toLowerCase()
  const visible = accounts.filter((account) => {
    if (!query) return true
    return account.code.toLowerCase().includes(query) || account.name.toLowerCase().includes(query)
  })

  function openCreate() {
    setErrors({})
    setDraft(blankDraft())
  }

  function openEdit(account) {
    setErrors({})
    setDraft({
      id: account.id,
      code: account.code,
      name: account.name,
      type: account.type,
      description: account.description || '',
      active: account.active !== false,
      system: account.system,
    })
  }

  async function submit(event) {
    setSaving(true)
    try {
    event.preventDefault()
    const result = await saveAccount(draft)
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setDraft(null)
    setNotice(`${result.account.code} saved.`)
    refresh()
  
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    setSaving(true)
    try {
    const result = await deleteAccount(removeId)
    setNotice(result.ok ? 'Account deleted.' : result.message)
    setRemoveId(null)
    refresh()
  
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Chart of Accounts"
        description="System accounts used by automatic posting stay locked. Deactivate an account that already has journal lines."
        actions={<Button onClick={openCreate}>Add account</Button>}
      />
      {notice ? <p className="mb-4 rounded-xl bg-sand px-4 py-3 text-sm text-ink">{notice}</p> : null}
      {accounts.length === 0 ? (
        <EmptyState title="No accounts yet" description="The default chart is added when the app loads." action={<Button onClick={openCreate}>Add account</Button>} />
      ) : (
        <>
          <div className="relative mb-4 max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input className={`${controlClass} pl-9`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search accounts" aria-label="Search accounts" />
          </div>
          {visible.length === 0 ? <EmptyState title="No accounts match" description="Try another code or name." /> : null}
          {ACCOUNT_GROUPS.map((group) => {
            const rows = visible.filter((account) => accountGroup(account.type) === group)
            if (rows.length === 0) return null
            return (
              <section key={group} className="mb-6">
                <h2 className="mb-2 text-sm font-semibold text-ink">{group}</h2>
                <DataTable>
                  <thead className="bg-sand/50">
                    <tr>
                      <th scope="col">Code</th>
                      <th scope="col">Name</th>
                      <th scope="col">Type</th>
                      <th scope="col">Normal balance</th>
                      <th scope="col">Status</th>
                      <th scope="col" className="text-right">Balance</th>
                      <th scope="col"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((account) => {
                      const balance = getAccountBalance(account.id)
                      return (
                        <tr key={account.id}>
                          <td className="font-medium whitespace-nowrap">
                            <span className="inline-flex items-center gap-1">
                              {account.system ? <Lock className="size-3.5 text-muted" aria-label="Locked system account" /> : null}
                              {account.code}
                            </span>
                          </td>
                          <td>{account.name}</td>
                          <td>{accountTypeLabel(account.type)}</td>
                          <td className="capitalize">{account.normalBalance}</td>
                          <td>{account.active === false ? <Badge tone="warning">Inactive</Badge> : <Badge tone="success">Active</Badge>}</td>
                          <td className="text-right tabular-nums whitespace-nowrap">{balanceLabel(balance.netDebit)}</td>
                          <td className="whitespace-nowrap text-right">
                            <Button variant="ghost" onClick={() => openEdit(account)}>Edit</Button>
                            {account.system ? null : (
                              <Button variant="ghost" onClick={() => setRemoveId(account.id)}>Delete</Button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </DataTable>
              </section>
            )
          })}
        </>
      )}

      {draft ? (
        <Modal title={draft.id ? 'Edit account' : 'Add account'} onClose={() => setDraft(null)}>
          <form className="space-y-4" onSubmit={submit} noValidate>
            {errors.form ? <p className="text-sm text-red-800">{errors.form}</p> : null}
            <Field label="Code" htmlFor="account-code" error={errors.code}>
              <input id="account-code" className={controlClass} value={draft.code} disabled={draft.system} onChange={(event) => setDraft({ ...draft, code: event.target.value })} />
            </Field>
            <Field label="Name" htmlFor="account-name" error={errors.name}>
              <input id="account-name" className={controlClass} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </Field>
            <Field label="Type" htmlFor="account-type" error={errors.type} hint={`Normal balance: ${normalBalanceFor(draft.type)}.`}>
              <select id="account-type" className={controlClass} value={draft.type} disabled={draft.system} onChange={(event) => setDraft({ ...draft, type: event.target.value })}>
                {ACCOUNT_TYPES.map((type) => (
                  <option key={type.id} value={type.id}>{type.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Description" htmlFor="account-description">
              <textarea id="account-description" rows={3} className={controlClass} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
            </Field>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} />
              Active
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDraft(null)}>Cancel</Button>
              <Button type="submit" disabled={saving}>Save account</Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {removeId ? (
        <ConfirmDialog
          title="Delete account"
          message="This cannot be undone. Accounts with journal lines should be deactivated instead."
          confirmLabel="Delete account"
          onConfirm={confirmDelete}
          onClose={() => setRemoveId(null)}
        />
      ) : null}
    </>
  )
}
