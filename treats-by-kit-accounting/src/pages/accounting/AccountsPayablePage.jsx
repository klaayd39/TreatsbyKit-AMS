import { useState } from 'react'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import DataTable from '../../components/ui/DataTable'
import EmptyState from '../../components/ui/EmptyState'
import Field, { controlClass } from '../../components/ui/Field'
import Modal from '../../components/ui/Modal'
import PageHeader from '../../components/ui/PageHeader'
import { expenseCategoryLabel, payExpense } from '../../data/expenses'
import { invoiceAmountPaid, invoiceGrandTotal, receivedValue, recordSupplierPayment, supplierBalance } from '../../data/purchasing'
import { PAYMENT_METHODS, paymentMethodLabel } from '../../data/sales'
import { COLLECTIONS } from '../../data/seed'
import { getAll } from '../../data/storage'
import { useRefresh } from '../../hooks/useRefresh'
import { addDaysISO, daysBetween, getAgingBucket } from '../../utils/aging'
import { formatCurrency, formatDate, todayISODate } from '../../utils/format'
import { sum, toCentavos } from '../../utils/money'

export default function AccountsPayablePage() {
  const [saving, setSaving] = useState(false)
  const [, refresh] = useRefresh()
  const [asOf] = useState(() => todayISODate())
  const [view, setView] = useState('invoices')
  const [payment, setPayment] = useState(null)
  const [errors, setErrors] = useState({})
  const [notice, setNotice] = useState('')

  const invoices = getAll(COLLECTIONS.PURCHASE_INVOICES)
  const receipts = getAll(COLLECTIONS.RECEIVING_RECORDS)
  const payments = getAll(COLLECTIONS.SUPPLIER_PAYMENTS)
  const suppliers = getAll(COLLECTIONS.SUPPLIERS)
  const expenses = getAll(COLLECTIONS.EXPENSES).filter((expense) => expense.status === 'unpaid')
  const supplierName = (id) => suppliers.find((supplier) => supplier.id === id)?.name || 'Unknown supplier'

  const openInvoices = invoices
    .map((invoice) => {
      const received = receivedValue(invoice, receipts)
      const paid = invoiceAmountPaid(invoice.id, payments)
      const balance = supplierBalance(invoice, receipts, payments)
      const due = invoice.dueDate || invoice.invoiceDate
      const overdueDays = Math.max(0, daysBetween(due, asOf))
      return { ...invoice, received, paid, balance, due, overdueDays, bucket: getAgingBucket(due, asOf) }
    })
    .filter((invoice) => toCentavos(invoice.balance) > 0)
    .sort((a, b) => String(a.due).localeCompare(String(b.due)))

  const soon = addDaysISO(asOf, 7)
  const totalPayable = sum([...openInvoices.map((invoice) => invoice.balance), ...expenses.map((expense) => expense.amount)])
  const overdue = sum(openInvoices.filter((invoice) => invoice.overdueDays > 0).map((invoice) => invoice.balance))
  const dueSoon = sum(openInvoices.filter((invoice) => invoice.due >= asOf && invoice.due <= soon).map((invoice) => invoice.balance))

  const supplierRows = suppliers
    .map((supplier) => {
      const rows = invoices.filter((invoice) => invoice.supplierId === supplier.id)
      const owed = sum(rows.map((invoice) => Math.max(0, supplierBalance(invoice, receipts, payments))))
      const history = payments.filter((entry) => rows.some((invoice) => invoice.id === entry.invoiceId))
      return { ...supplier, owed, history, invoices: rows.length }
    })
    .filter((supplier) => supplier.invoices > 0)
    .sort((a, b) => b.owed - a.owed || a.name.localeCompare(b.name))

  function openInvoicePayment(invoice) {
    setErrors({})
    setPayment({ kind: 'invoice', id: invoice.id, title: invoice.invoiceNumber, amount: String(invoice.balance), method: 'cash', date: asOf, reference: '' })
  }

  function openExpensePayment(expense) {
    setErrors({})
    setPayment({ kind: 'expense', id: expense.id, title: expense.payee, amount: String(expense.amount), method: 'cash', date: asOf, reference: '' })
  }

  async function submitPayment(event) {
    setSaving(true)
    try {
    event.preventDefault()
    const result = payment.kind === 'invoice'
      ? await recordSupplierPayment(payment.id, payment)
      : await payExpense(payment.id, payment)
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setPayment(null)
    setNotice(payment.kind === 'invoice' ? 'Supplier payment recorded.' : 'Expense payment recorded.')
    refresh()
  
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Bills to pay"
        description="Payables come from received purchase invoices and unpaid expenses. Record a payment to reduce the balance."
      />
      {notice ? <p className="mb-4 rounded-xl bg-sand px-4 py-3 text-sm text-ink">{notice}</p> : null}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card title="Total payable" value={formatCurrency(totalPayable)} />
        <Card title="Overdue" value={formatCurrency(overdue)} hint="Past the due date" />
        <Card title="Due in the next 7 days" value={formatCurrency(dueSoon)} />
      </div>
      <div className="mb-4 flex gap-2">
        <Button variant={view === 'invoices' ? 'primary' : 'secondary'} onClick={() => setView('invoices')}>Invoices</Button>
        <Button variant={view === 'suppliers' ? 'primary' : 'secondary'} onClick={() => setView('suppliers')}>Suppliers</Button>
      </div>

      {view === 'invoices' ? (
        <div className="space-y-8">
          {openInvoices.length === 0 ? (
            <EmptyState title="No open invoices" description="Receive a purchase invoice to create a payable." />
          ) : (
            <DataTable>
              <thead className="bg-sand/50">
                <tr>
                  <th scope="col">Invoice</th>
                  <th scope="col">Supplier</th>
                  <th scope="col" className="text-right">Received</th>
                  <th scope="col" className="text-right">Paid</th>
                  <th scope="col" className="text-right">Balance</th>
                  <th scope="col">Due</th>
                  <th scope="col" className="text-right">Days overdue</th>
                  <th scope="col">Aging</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {openInvoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="font-medium whitespace-nowrap">{invoice.invoiceNumber}</td>
                    <td>{supplierName(invoice.supplierId)}</td>
                    <td className="text-right tabular-nums">{formatCurrency(invoice.received)}</td>
                    <td className="text-right tabular-nums">{formatCurrency(invoice.paid)}</td>
                    <td className="text-right tabular-nums">{formatCurrency(invoice.balance)}</td>
                    <td className="whitespace-nowrap">{formatDate(invoice.due)}</td>
                    <td className="text-right tabular-nums">{invoice.overdueDays}</td>
                    <td><Badge tone={invoice.bucket === 'Current' ? 'neutral' : 'warning'}>{invoice.bucket}</Badge></td>
                    <td className="text-right"><Button variant="ghost" onClick={() => openInvoicePayment(invoice)}>Record payment</Button></td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}

          <section>
            <h2 className="mb-2 text-sm font-semibold text-ink">Other payables</h2>
            {expenses.length === 0 ? (
              <EmptyState title="No unpaid expenses" description="Unpaid expenses from the Expenses page show up here." />
            ) : (
              <DataTable>
                <thead className="bg-sand/50">
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Payee</th>
                    <th scope="col">Category</th>
                    <th scope="col" className="text-right">Amount</th>
                    <th scope="col"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((expense) => (
                    <tr key={expense.id}>
                      <td className="whitespace-nowrap">{formatDate(expense.date)}</td>
                      <td className="font-medium">{expense.payee}</td>
                      <td>{expenseCategoryLabel(expense.category)}</td>
                      <td className="text-right tabular-nums">{formatCurrency(expense.amount)}</td>
                      <td className="text-right"><Button variant="ghost" onClick={() => openExpensePayment(expense)}>Record payment</Button></td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </section>
        </div>
      ) : supplierRows.length === 0 ? (
        <EmptyState title="No supplier balances" description="Purchase invoices will be grouped here by supplier." />
      ) : (
        <div className="space-y-4">
          {supplierRows.map((supplier) => (
            <section key={supplier.id} className="rounded-2xl border border-line bg-white p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold text-ink">{supplier.name}</h2>
                <p className="text-sm text-ink">Owed <span className="font-semibold tabular-nums">{formatCurrency(supplier.owed)}</span></p>
              </div>
              <p className="mt-1 text-sm text-muted">Invoice total {formatCurrency(sum(invoices.filter((invoice) => invoice.supplierId === supplier.id).map((invoice) => invoiceGrandTotal(invoice))))}</p>
              {supplier.history.length === 0 ? (
                <p className="mt-3 text-sm text-muted">No payments yet.</p>
              ) : (
                <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
                  {supplier.history.map((entry) => (
                    <li key={entry.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span>{formatDate(entry.date)} · {paymentMethodLabel(entry.method)}{entry.reference ? ` · ${entry.reference}` : ''}</span>
                      <span className="tabular-nums">{formatCurrency(entry.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      {payment ? (
        <Modal title={`Pay ${payment.title}`} onClose={() => setPayment(null)}>
          <form className="space-y-4" onSubmit={submitPayment} noValidate>
            {errors.form ? <p className="text-sm text-red-800">{errors.form}</p> : null}
            <Field label="Amount" htmlFor="pay-amount" error={errors.amount}>
              <input id="pay-amount" className={controlClass} inputMode="decimal" value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })} />
            </Field>
            <Field label="Method" htmlFor="pay-method" error={errors.method}>
              <select id="pay-method" className={controlClass} value={payment.method} onChange={(event) => setPayment({ ...payment, method: event.target.value })}>
                {PAYMENT_METHODS.map((method) => (
                  <option key={method.id} value={method.id}>{method.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Date" htmlFor="pay-date" error={errors.date}>
              <input id="pay-date" type="date" className={controlClass} value={payment.date} onChange={(event) => setPayment({ ...payment, date: event.target.value })} />
            </Field>
            {payment.kind === 'invoice' ? (
              <Field label="Reference" htmlFor="pay-reference">
                <input id="pay-reference" className={controlClass} value={payment.reference} onChange={(event) => setPayment({ ...payment, reference: event.target.value })} />
              </Field>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPayment(null)}>Cancel</Button>
              <Button type="submit" disabled={saving}>Record payment</Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  )
}
