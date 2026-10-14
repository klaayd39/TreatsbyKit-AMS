import { useState } from 'react'
import Button from '../ui/Button'
import ConfirmDialog from '../ui/ConfirmDialog'
import Field, { controlClass } from '../ui/Field'
import Modal from '../ui/Modal'
import { deleteCustomer, saveCustomer } from '../../data/sales'

function blankCustomer() {
  return { name: '', phone: '', address: '', notes: '' }
}

export default function CustomerBook({ customers, onClose, onChange, onPick }) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState({})
  const [pendingDelete, setPendingDelete] = useState(null)
  const [notice, setNotice] = useState('')

  async function submit(event) {
    setSaving(true)
    try {
      event.preventDefault()
      const result = await saveCustomer(form)
      if (!result.ok) {
        setErrors(result.errors)
        return
      }
      setForm(null)
      setErrors({})
      onChange()
      if (onPick) onPick(result.customer)
      } finally {
      setSaving(false)
    }
}

  async function confirmDelete() {
    setSaving(true)
    try {
      const result = await deleteCustomer(pendingDelete.id)
      setPendingDelete(null)
      if (!result.ok) {
        setNotice(result.message)
        return
      }
      onChange()
      } finally {
      setSaving(false)
    }
}

  return (
    <Modal title="Customers" onClose={onClose} size="lg">
      {notice ? <p className="mb-3 rounded-lg bg-sand px-3 py-2 text-sm text-ink">{notice}</p> : null}
      {form ? (
        <form className="space-y-4" onSubmit={submit} noValidate>
          {errors.form ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{errors.form}</p> : null}
          <Field label="Name" htmlFor="customer-name" error={errors.name}>
            <input
              id="customer-name"
              className={controlClass}
              value={form.name}
              autoFocus
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone" htmlFor="customer-phone">
              <input
                id="customer-phone"
                className={controlClass}
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
              />
            </Field>
            <Field label="Address" htmlFor="customer-address">
              <input
                id="customer-address"
                className={controlClass}
                value={form.address}
                onChange={(event) => setForm({ ...form, address: event.target.value })}
              />
            </Field>
          </div>
          <Field label="Notes" htmlFor="customer-notes">
            <textarea
              id="customer-notes"
              className={controlClass}
              rows={2}
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setForm(null)}>
              Back
            </Button>
            <Button type="submit" disabled={saving}>Save customer</Button>
          </div>
        </form>
      ) : (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => { setForm(blankCustomer()); setErrors({}) }}>Add customer</Button>
          </div>
          {customers.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
              No customers yet. Walk-in sales do not need one.
            </p>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {customers.map((customer) => (
                <li key={customer.id} className="flex items-center justify-between gap-3 px-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{customer.name}</p>
                    <p className="truncate text-sm text-muted">{customer.phone || customer.address || 'No contact details'}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {onPick ? (
                      <Button onClick={() => onPick(customer)}>Select</Button>
                    ) : null}
                    <Button variant="ghost" onClick={() => { setForm({ ...customer }); setErrors({}) }}>
                      Edit
                    </Button>
                    <Button variant="ghost" onClick={() => setPendingDelete(customer)}>
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {pendingDelete ? (
        <ConfirmDialog
          title="Delete customer"
          message={`Delete ${pendingDelete.name}?`}
          confirmLabel="Delete customer"
          onConfirm={confirmDelete}
          onClose={() => setPendingDelete(null)}
        />
      ) : null}
    </Modal>
  )
}
