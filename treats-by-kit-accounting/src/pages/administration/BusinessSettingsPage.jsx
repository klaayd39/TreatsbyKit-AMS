import { useState } from 'react'
import Button from '../../components/ui/Button'
import Field, { controlClass } from '../../components/ui/Field'
import PageHeader from '../../components/ui/PageHeader'
import { loadDemoData } from '../../data/demo'
import { reportFailure } from '../../data/errors'
import { exportAllData } from '../../data/exportData'
import { importLocalData } from '../../data/importLocal'
import { COLLECTIONS } from '../../data/seed'
import { getById, update } from '../../data/storage'
import { getSupabase } from '../../lib/supabase'
import { useRefresh } from '../../hooks/useRefresh'
import { formatDate } from '../../utils/format'

function currentSettings() {
  return getById(COLLECTIONS.SETTINGS, 'business') || {}
}

export default function BusinessSettingsPage() {
  const [, refresh] = useRefresh()
  const current = currentSettings()
  const [form, setForm] = useState(() => ({
    businessName: current.businessName || 'Treats by Kit',
    address: current.address || '',
    contact: current.contact || '',
    receiptFooter: current.receiptFooter || '',
    lowStockDefault: current.lowStockDefault ?? 0,
    varianceThreshold: current.varianceThreshold ?? 10,
    booksLockedThrough: current.booksLockedThrough || '',
  }))
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const demoEnabled = import.meta.env.VITE_ENABLE_DEMO === 'true'

  function setField(key, value) {
    setForm((currentForm) => ({ ...currentForm, [key]: value }))
  }

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await update(COLLECTIONS.SETTINGS, 'business', {
        ...form,
        lowStockDefault: Number(form.lowStockDefault) || 0,
        varianceThreshold: Number(form.varianceThreshold) || 0,
      })
      setNotice(form.booksLockedThrough ? `Books are locked through ${formatDate(form.booksLockedThrough)}.` : 'Settings saved.')
      refresh()
    } catch (saveError) {
      setError(saveError.message || 'Settings could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function onExport() {
    setSaving(true)
    setError('')
    try {
      await exportAllData()
      setNotice('Export downloaded.')
    } catch (exportError) {
      setError(reportFailure(exportError))
    } finally {
      setSaving(false)
    }
  }

  async function onDemo() {
    setSaving(true)
    setError('')
    try {
      setNotice((await loadDemoData()).message)
      refresh()
    } finally {
      setSaving(false)
    }
  }

  async function onRemoveDemo() {
    setSaving(true)
    setError('')
    try {
      const { error: removeError } = await getSupabase().rpc('remove_demo_data')
      if (removeError) throw removeError
      setNotice('Demo rows were removed. Audit history was kept.')
      refresh()
    } catch (removeError) {
      setError(reportFailure(removeError))
    } finally {
      setSaving(false)
    }
  }

  async function onImport(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setSaving(true)
    setError('')
    try {
      const data = JSON.parse(await file.text())
      setNotice((await importLocalData(data)).message)
      refresh()
    } catch (importError) {
      setError(importError.message || 'The file could not be imported.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="Entries dated on or before the lock date cannot be created. Currency is Philippine peso."
      />
      <form className="max-w-xl space-y-4 rounded-2xl border border-line bg-white p-5" onSubmit={save}>
        <Field label="Business name" htmlFor="business-name">
          <input id="business-name" className={controlClass} value={form.businessName} onChange={(event) => setField('businessName', event.target.value)} />
        </Field>
        <Field label="Address" htmlFor="business-address">
          <textarea id="business-address" className={controlClass} value={form.address} onChange={(event) => setField('address', event.target.value)} />
        </Field>
        <Field label="Contact" htmlFor="business-contact">
          <input id="business-contact" className={controlClass} value={form.contact} onChange={(event) => setField('contact', event.target.value)} />
        </Field>
        <Field label="Receipt footer" htmlFor="receipt-footer">
          <textarea id="receipt-footer" className={controlClass} value={form.receiptFooter} onChange={(event) => setField('receiptFooter', event.target.value)} />
        </Field>
        <Field label="Low-stock default" htmlFor="low-stock" hint="New items start with this reorder level.">
          <input id="low-stock" type="number" min="0" className={controlClass} value={form.lowStockDefault} onChange={(event) => setField('lowStockDefault', event.target.value)} />
        </Field>
        <Field label="Production variance threshold (%)" htmlFor="variance">
          <input id="variance" type="number" min="0" className={controlClass} value={form.varianceThreshold} onChange={(event) => setField('varianceThreshold', event.target.value)} />
        </Field>
        <Field label="Books locked through" htmlFor="lock-date" hint="Leave this blank to keep every date open.">
          <input id="lock-date" type="date" className={controlClass} value={form.booksLockedThrough} onChange={(event) => setField('booksLockedThrough', event.target.value)} />
        </Field>
        {notice ? <p className="text-sm text-ink">{notice}</p> : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>Save settings</Button>
          <Button variant="secondary" disabled={saving} onClick={onExport}>Export all data</Button>
        </div>
      </form>
      <section className="mt-6 max-w-xl space-y-3 rounded-2xl border border-line bg-white p-5">
        <h2 className="font-display text-lg font-semibold text-ink">Import browser data</h2>
        <p className="text-sm leading-6 text-muted">
          Starting fresh is safer. This import is optional. It replays documents through the same save functions and skips the stock movements those documents already create. A partial file can be rejected by the books lock, negative stock, or a duplicate number.
        </p>
        <input type="file" accept="application/json" disabled={saving} onChange={onImport} />
      </section>
      {demoEnabled ? (
        <section className="mt-6 max-w-xl space-y-3 rounded-2xl border border-line bg-white p-5">
          <h2 className="font-display text-lg font-semibold text-ink">Demo data</h2>
          <p className="text-sm leading-6 text-muted">Load refuses to run when any sale, invoice, or journal entry already exists. Remove only works while the lock date is empty.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={saving} onClick={onDemo}>Load demo data</Button>
            <Button variant="secondary" disabled={saving || Boolean(form.booksLockedThrough)} onClick={onRemoveDemo}>Remove demo data</Button>
          </div>
        </section>
      ) : null}
    </>
  )
}
