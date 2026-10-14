import { Search } from 'lucide-react'
import { useState } from 'react'
import Button from '../../components/ui/Button'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import DataTable from '../../components/ui/DataTable'
import EmptyState from '../../components/ui/EmptyState'
import Field, { controlClass } from '../../components/ui/Field'
import Modal from '../../components/ui/Modal'
import PageHeader from '../../components/ui/PageHeader'
import { supplierHasInvoices } from '../../data/purchasing'
import { COLLECTIONS } from '../../data/seed'
import { add, getAll, remove, update } from '../../data/storage'
import { useRefresh } from '../../hooks/useRefresh'
import { generateId } from '../../utils/id'

const blankSupplier = {
  name: '',
  contactPerson: '',
  phone: '',
  address: '',
  notes: '',
}

function toForm(supplier) {
  return {
    name: supplier.name || '',
    contactPerson: supplier.contactPerson || '',
    phone: supplier.phone || '',
    address: supplier.address || '',
    notes: supplier.notes || '',
  }
}

export default function SuppliersPage() {
  const [saving, setSaving] = useState(false)
  const [, refresh] = useRefresh()
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [errors, setErrors] = useState({})
  const [pendingDelete, setPendingDelete] = useState(null)
  const [banner, setBanner] = useState('')

  const suppliers = getAll(COLLECTIONS.SUPPLIERS)
  const query = search.trim().toLowerCase()
  const filtered = suppliers
    .filter((supplier) => {
      if (!query) return true
      return [supplier.name, supplier.contactPerson, supplier.phone, supplier.address, supplier.notes]
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  function openCreate() {
    setEditingId(null)
    setForm({ ...blankSupplier })
    setErrors({})
  }

  function openEdit(supplier) {
    setEditingId(supplier.id)
    setForm(toForm(supplier))
    setErrors({})
  }

  function closeForm() {
    setForm(null)
    setEditingId(null)
    setErrors({})
  }

  async function saveSupplier(event) {
    setSaving(true)
    try {
    event.preventDefault()
    if (!form.name.trim()) {
      setErrors({ name: 'Enter a supplier name.' })
      return
    }
    const payload = {
      name: form.name.trim(),
      contactPerson: form.contactPerson.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      notes: form.notes.trim(),
    }
    if (editingId) {
      await update(COLLECTIONS.SUPPLIERS, editingId, payload)
    } else {
      await add(COLLECTIONS.SUPPLIERS, {
        ...payload,
        id: generateId('supplier'),
        createdAt: new Date().toISOString(),
      })
    }
    closeForm()
    refresh()
  
    } finally {
      setSaving(false)
    }
  }

  function requestDelete(supplier) {
    if (supplierHasInvoices(supplier.id)) {
      setBanner(`${supplier.name} has purchase invoices and can't be deleted.`)
      return
    }
    setBanner('')
    setPendingDelete(supplier)
  }

  async function confirmDelete() {
    setSaving(true)
    try {
    if (!pendingDelete) return
    if (supplierHasInvoices(pendingDelete.id)) {
      setBanner(`${pendingDelete.name} has purchase invoices and can't be deleted.`)
      setPendingDelete(null)
      return
    }
    await remove(COLLECTIONS.SUPPLIERS, pendingDelete.id)
    setPendingDelete(null)
    refresh()
  
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Vendors you buy ingredients and packaging from."
        actions={<Button onClick={openCreate}>Add supplier</Button>}
      />

      {banner ? <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{banner}</p> : null}

      {suppliers.length === 0 ? (
        <EmptyState
          title="No suppliers yet"
          description="Add a supplier before you record purchase invoices."
          action={<Button onClick={openCreate}>Add supplier</Button>}
        />
      ) : (
        <>
          <div className="relative mb-4 max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input
              className={`${controlClass} pl-9`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search suppliers"
              aria-label="Search suppliers"
            />
          </div>
          {filtered.length === 0 ? (
            <EmptyState title="No suppliers match" description="Try a different name, phone, or address." />
          ) : (
            <DataTable>
              <thead className="bg-sand/50">
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Contact person</th>
                  <th scope="col">Phone</th>
                  <th scope="col">Address</th>
                  <th scope="col">Notes</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((supplier) => (
                  <tr key={supplier.id}>
                    <td className="font-medium">{supplier.name}</td>
                    <td>{supplier.contactPerson || '—'}</td>
                    <td className="whitespace-nowrap">{supplier.phone || '—'}</td>
                    <td>{supplier.address || '—'}</td>
                    <td className="max-w-xs whitespace-normal">{supplier.notes || '—'}</td>
                    <td className="whitespace-nowrap text-right">
                      <Button variant="ghost" onClick={() => openEdit(supplier)}>
                        Edit
                      </Button>
                      <Button variant="ghost" onClick={() => requestDelete(supplier)}>
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </>
      )}

      {form ? (
        <Modal title={editingId ? 'Edit supplier' : 'Add supplier'} onClose={closeForm}>
          <form className="space-y-4" onSubmit={saveSupplier} noValidate>
            <Field label="Name" htmlFor="supplier-name" error={errors.name}>
              <input
                id="supplier-name"
                className={controlClass}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                autoFocus
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Contact person" htmlFor="supplier-contact">
                <input
                  id="supplier-contact"
                  className={controlClass}
                  value={form.contactPerson}
                  onChange={(event) => setForm({ ...form, contactPerson: event.target.value })}
                />
              </Field>
              <Field label="Phone" htmlFor="supplier-phone">
                <input
                  id="supplier-phone"
                  className={controlClass}
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                />
              </Field>
            </div>
            <Field label="Address" htmlFor="supplier-address">
              <input
                id="supplier-address"
                className={controlClass}
                value={form.address}
                onChange={(event) => setForm({ ...form, address: event.target.value })}
              />
            </Field>
            <Field label="Notes" htmlFor="supplier-notes">
              <textarea
                id="supplier-notes"
                rows={3}
                className={controlClass}
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={closeForm}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>Save supplier</Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title="Delete supplier"
          message={`Delete ${pendingDelete.name}? This can't be undone.`}
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onClose={() => setPendingDelete(null)}
        />
      ) : null}
    </>
  )
}
