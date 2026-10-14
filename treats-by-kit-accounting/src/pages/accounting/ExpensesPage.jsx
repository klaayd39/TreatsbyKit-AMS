import { Search } from 'lucide-react'
import { useState } from 'react'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import DataTable from '../../components/ui/DataTable'
import EmptyState from '../../components/ui/EmptyState'
import Field, { controlClass } from '../../components/ui/Field'
import Modal from '../../components/ui/Modal'
import PageHeader from '../../components/ui/PageHeader'
import JournalLinks from '../../components/accounting/JournalLinks'
import { EXPENSE_CATEGORIES, expenseCategoryLabel, saveExpense, voidExpense } from '../../data/expenses'
import { PAYMENT_METHODS } from '../../data/sales'
import { COLLECTIONS } from '../../data/seed'
import { getAll } from '../../data/storage'
import { useRefresh } from '../../hooks/useRefresh'
import { formatCurrency, formatDate, todayISODate } from '../../utils/format'
import { sum } from '../../utils/money'

function blankDraft(date) {
  return { date, payee: '', category: '6080', description: '', amount: '', method: 'cash', status: 'paid', reference: '', notes: '' }
}

function statusTone(status) {
  if (status === 'paid') return 'success'
  if (status === 'voided') return 'danger'
  return 'warning'
}

export default function ExpensesPage() {
  const [saving, setSaving] = useState(false)
  const [, refresh] = useRefresh()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [draft, setDraft] = useState(null)
  const [voidId, setVoidId] = useState(null)
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState({})
  const [notice, setNotice] = useState('')

  const expenses = getAll(COLLECTIONS.EXPENSES)
  const query = search.trim().toLowerCase()
  const filtered = expenses
    .filter((expense) => {
      if (category && expense.category !== category) return false
      if (status && expense.status !== status) return false
      if (dateFrom && expense.date < dateFrom) return false
      if (dateTo && expense.date > dateTo) return false
      if (!query) return true
      return [expense.payee, expense.description, expense.reference].join(' ').toLowerCase().includes(query)
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
  const active = filtered.filter((expense) => expense.status !== 'voided')

  function openCreate() {
    setErrors({})
    setDraft(blankDraft(todayISODate()))
  }

  function openEdit(expense) {
    setErrors({})
    setDraft({ ...expense, amount: String(expense.amount) })
  }

  async function submit(event) {
    setSaving(true)
    try {
    event.preventDefault()
    const result = await saveExpense(draft)
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setDraft(null)
    setNotice(`${result.expense.payee} saved.`)
    refresh()
  
    } finally {
      setSaving(false)
    }
  }

  async function submitVoid(event) {
    setSaving(true)
    try {
    event.preventDefault()
    const result = await voidExpense(voidId, reason)
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setVoidId(null)
    setNotice('Expense voided. A reversing entry was posted.')
    refresh()
  
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Expenses"
        description="A paid expense credits cash. An unpaid expense credits accounts payable until you record the payment."
        actions={<Button onClick={openCreate}>Add expense</Button>}
      />
      {notice ? <p className="mb-4 rounded-xl bg-sand px-4 py-3 text-sm text-ink">{notice}</p> : null}
      {expenses.length === 0 ? (
        <EmptyState title="No expenses yet" description="Add rent, utilities, and other operating costs." action={<Button onClick={openCreate}>Add expense</Button>} />
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <input className={`${controlClass} pl-9`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search expenses" aria-label="Search expenses" />
            </div>
            <select className={controlClass} value={category} aria-label="Filter by category" onChange={(event) => setCategory(event.target.value)}>
              <option value="">All categories</option>
              {EXPENSE_CATEGORIES.map((item) => (
                <option key={item.code} value={item.code}>{item.label}</option>
              ))}
            </select>
            <select className={controlClass} value={status} aria-label="Filter by payment status" onChange={(event) => setStatus(event.target.value)}>
              <option value="">All statuses</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
              <option value="voided">Voided</option>
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" className={controlClass} value={dateFrom} aria-label="Expense date from" onChange={(event) => setDateFrom(event.target.value)} />
              <input type="date" className={controlClass} value={dateTo} aria-label="Expense date to" onChange={(event) => setDateTo(event.target.value)} />
            </div>
          </div>
          <p className="mb-3 text-sm text-muted">
            {active.length} expenses · {formatCurrency(sum(active.map((expense) => expense.amount)))} excluding voided
          </p>
          {filtered.length === 0 ? (
            <EmptyState title="No expenses match" description="Try another category, status, or date." />
          ) : (
            <DataTable>
              <thead className="bg-sand/50">
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Payee</th>
                  <th scope="col">Category</th>
                  <th scope="col">Description</th>
                  <th scope="col" className="text-right">Amount</th>
                  <th scope="col">Status</th>
                  <th scope="col">Journal</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((expense) => (
                  <tr key={expense.id}>
                    <td className="whitespace-nowrap">{formatDate(expense.date)}</td>
                    <td className="font-medium">{expense.payee}</td>
                    <td>{expenseCategoryLabel(expense.category)}</td>
                    <td>{expense.description || '—'}</td>
                    <td className="text-right tabular-nums">{formatCurrency(expense.amount)}</td>
                    <td><Badge tone={statusTone(expense.status)}>{expense.status === 'paid' ? 'Paid' : expense.status === 'voided' ? 'Voided' : 'Unpaid'}</Badge></td>
                    <td><JournalLinks sourceIds={[expense.id]} /></td>
                    <td className="whitespace-nowrap text-right">
                      {expense.status === 'voided' ? null : (
                        <>
                          <Button variant="ghost" onClick={() => openEdit(expense)}>Edit</Button>
                          <Button variant="ghost" onClick={() => { setErrors({}); setReason(''); setVoidId(expense.id) }}>Void</Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </>
      )}

      {draft ? (
        <Modal title={draft.id ? 'Edit expense' : 'Add expense'} onClose={() => setDraft(null)}>
          <form className="space-y-4" onSubmit={submit} noValidate>
            {errors.form ? <p className="text-sm text-red-800">{errors.form}</p> : null}
            <Field label="Date" htmlFor="expense-date" error={errors.date}>
              <input id="expense-date" type="date" className={controlClass} value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} />
            </Field>
            <Field label="Payee" htmlFor="expense-payee" error={errors.payee}>
              <input id="expense-payee" className={controlClass} value={draft.payee} onChange={(event) => setDraft({ ...draft, payee: event.target.value })} />
            </Field>
            <Field label="Category" htmlFor="expense-category" error={errors.category}>
              <select id="expense-category" className={controlClass} value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>
                {EXPENSE_CATEGORIES.map((item) => (
                  <option key={item.code} value={item.code}>{item.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Description" htmlFor="expense-description">
              <input id="expense-description" className={controlClass} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
            </Field>
            <Field label="Amount" htmlFor="expense-amount" error={errors.amount}>
              <input id="expense-amount" className={controlClass} inputMode="decimal" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} />
            </Field>
            <Field label="Status" htmlFor="expense-status" error={errors.status}>
              <select id="expense-status" className={controlClass} value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>
                <option value="paid">Paid</option>
                <option value="unpaid">Unpaid</option>
              </select>
            </Field>
            {draft.status === 'paid' ? (
              <Field label="Payment method" htmlFor="expense-method" error={errors.method}>
                <select id="expense-method" className={controlClass} value={draft.method} onChange={(event) => setDraft({ ...draft, method: event.target.value })}>
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method.id} value={method.id}>{method.label}</option>
                  ))}
                </select>
              </Field>
            ) : null}
            <Field label="Reference or receipt number" htmlFor="expense-reference">
              <input id="expense-reference" className={controlClass} value={draft.reference} onChange={(event) => setDraft({ ...draft, reference: event.target.value })} />
            </Field>
            <Field label="Notes" htmlFor="expense-notes">
              <textarea id="expense-notes" rows={3} className={controlClass} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDraft(null)}>Cancel</Button>
              <Button type="submit" disabled={saving}>Save expense</Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {voidId ? (
        <Modal title="Void expense" onClose={() => setVoidId(null)}>
          <form className="space-y-4" onSubmit={submitVoid} noValidate>
            {errors.form ? <p className="text-sm text-red-800">{errors.form}</p> : null}
            <Field label="Reason" htmlFor="void-reason" error={errors.reason}>
              <textarea id="void-reason" rows={3} className={controlClass} value={reason} onChange={(event) => setReason(event.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setVoidId(null)}>Cancel</Button>
              <Button type="submit" disabled={saving} variant="danger">Void expense</Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  )
}
