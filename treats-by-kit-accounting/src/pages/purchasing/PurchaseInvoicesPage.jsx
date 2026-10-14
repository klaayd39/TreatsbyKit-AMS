import { Search } from 'lucide-react'
import { useState } from 'react'
import InvoiceForm from '../../components/purchasing/InvoiceForm'
import ReceiveItemsForm from '../../components/purchasing/ReceiveItemsForm'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import DataTable from '../../components/ui/DataTable'
import EmptyState from '../../components/ui/EmptyState'
import { controlClass } from '../../components/ui/Field'
import LastChanged from '../../components/LastChanged'
import PageHeader from '../../components/ui/PageHeader'
import JournalLinks from '../../components/accounting/JournalLinks'
import {
  invoiceAmountPaid,
  invoiceGrandTotal,
  PAYMENT_STATUS_LABELS,
  paymentStatus,
  RECEIVING_STATUS_LABELS,
  receivingStatus,
} from '../../data/purchasing'
import { COLLECTIONS } from '../../data/seed'
import { getAll } from '../../data/storage'
import { useRefresh } from '../../hooks/useRefresh'
import { formatCurrency, formatDate, todayISODate } from '../../utils/format'

function paymentTone(status) {
  if (status === 'paid') return 'success'
  if (status === 'partial') return 'warning'
  return 'neutral'
}

function receivingTone(status) {
  if (status === 'full') return 'success'
  if (status === 'partial') return 'warning'
  return 'neutral'
}

function Detail({ label, children }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-ink">{children}</dd>
    </div>
  )
}

export default function PurchaseInvoicesPage() {
  const [, refresh] = useRefresh()
  const [screen, setScreen] = useState({ name: 'list' })
  const [search, setSearch] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const invoices = getAll(COLLECTIONS.PURCHASE_INVOICES)
  const suppliers = getAll(COLLECTIONS.SUPPLIERS).sort((a, b) => a.name.localeCompare(b.name))
  const items = getAll(COLLECTIONS.ITEMS)
  const receipts = getAll(COLLECTIONS.RECEIVING_RECORDS)

  const supplierName = (supplierId) => suppliers.find((supplier) => supplier.id === supplierId)?.name ?? 'Unknown supplier'
  const itemName = (itemId) => items.find((item) => item.id === itemId)?.name ?? 'Unknown item'

  const filtered = invoices
    .filter((invoice) => {
      if (supplierFilter && invoice.supplierId !== supplierFilter) return false
      if (dateFrom && invoice.invoiceDate < dateFrom) return false
      if (dateTo && invoice.invoiceDate > dateTo) return false
      const query = search.trim().toLowerCase()
      if (!query) return true
      return (
        invoice.invoiceNumber.toLowerCase().includes(query) ||
        supplierName(invoice.supplierId).toLowerCase().includes(query)
      )
    })
    .sort((a, b) => String(b.invoiceDate).localeCompare(String(a.invoiceDate)) || b.invoiceNumber.localeCompare(a.invoiceNumber))

  const activeInvoice =
    screen.invoiceId ? invoices.find((invoice) => invoice.id === screen.invoiceId) ?? null : null

  function openCreate() {
    setScreen({ name: 'edit', invoiceId: null, defaultDate: todayISODate() })
  }

  function openReceive(invoiceId) {
    setScreen({ name: 'receive', invoiceId, defaultDate: todayISODate() })
  }

  if (screen.name === 'edit') {
    return (
      <>
        <PageHeader
          title={activeInvoice ? `Edit ${activeInvoice.invoiceNumber}` : 'New purchase invoice'}
          description="Saving an invoice records the bill. Stock changes only when you receive the items."
          actions={
            <Button variant="secondary" onClick={() => setScreen(activeInvoice ? { name: 'detail', invoiceId: activeInvoice.id } : { name: 'list' })}>
              Back
            </Button>
          }
        />
        <div className="rounded-2xl border border-line bg-white p-5">
          <InvoiceForm
            key={activeInvoice?.id || 'new'}
            invoice={activeInvoice}
            suppliers={suppliers}
            items={items}
            receipts={receipts}
            defaultDate={screen.defaultDate}
            onCancel={() => setScreen(activeInvoice ? { name: 'detail', invoiceId: activeInvoice.id } : { name: 'list' })}
            onSaved={(invoice) => {
              refresh()
              setScreen({ name: 'detail', invoiceId: invoice.id })
            }}
          />
        </div>
      </>
    )
  }

  if (screen.name === 'receive' && activeInvoice) {
    return (
      <>
        <PageHeader
          title={`Receive ${activeInvoice.invoiceNumber}`}
          description={`${supplierName(activeInvoice.supplierId)}. Enter how much of each line arrived. You can receive part of the order.`}
          actions={
            <Button variant="secondary" onClick={() => setScreen({ name: 'detail', invoiceId: activeInvoice.id })}>
              Back
            </Button>
          }
        />
        <div className="rounded-2xl border border-line bg-white p-5">
          <ReceiveItemsForm
            key={activeInvoice.id}
            invoice={activeInvoice}
            items={items}
            receipts={receipts}
            defaultDate={screen.defaultDate}
            onCancel={() => setScreen({ name: 'detail', invoiceId: activeInvoice.id })}
            onSaved={() => {
              refresh()
              setScreen({ name: 'detail', invoiceId: activeInvoice.id })
            }}
          />
        </div>
      </>
    )
  }

  if (screen.name === 'detail' && activeInvoice) {
    const paid = paymentStatus(activeInvoice)
    const received = receivingStatus(activeInvoice, receipts)
    return (
      <>
        <PageHeader
          title={activeInvoice.invoiceNumber}
          description={supplierName(activeInvoice.supplierId)}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setScreen({ name: 'list' })}>
                Back
              </Button>
              <Button variant="secondary" onClick={() => setScreen({ name: 'edit', invoiceId: activeInvoice.id, defaultDate: activeInvoice.invoiceDate })}>
                Edit
              </Button>
              {received === 'full' ? null : (
                <Button onClick={() => openReceive(activeInvoice.id)}>Receive items</Button>
              )}
            </div>
          }
        />
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge tone={paymentTone(paid)}>{PAYMENT_STATUS_LABELS[paid]}</Badge>
            <Badge tone={receivingTone(received)}>{RECEIVING_STATUS_LABELS[received]}</Badge>
          </div>
          <LastChanged table="purchaseInvoices" id={activeInvoice.id} />
          <div className="rounded-2xl border border-line bg-white p-5">
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Detail label="Invoice date">{formatDate(activeInvoice.invoiceDate)}</Detail>
              <Detail label="Due date">{activeInvoice.dueDate ? formatDate(activeInvoice.dueDate) : '—'}</Detail>
              <Detail label="Payment terms">{activeInvoice.paymentTerms || '—'}</Detail>
              <Detail label="Amount paid">{formatCurrency(invoiceAmountPaid(activeInvoice.id))}</Detail>
              <Detail label="Journal">
                <JournalLinks
                  sourceIds={[
                    activeInvoice.id,
                    ...receipts.filter((receipt) => receipt.invoiceId === activeInvoice.id).map((receipt) => receipt.id),
                    ...getAll(COLLECTIONS.SUPPLIER_PAYMENTS)
                      .filter((payment) => payment.invoiceId === activeInvoice.id)
                      .map((payment) => payment.id),
                  ]}
                />
              </Detail>
              <Detail label="Grand total">{formatCurrency(invoiceGrandTotal(activeInvoice))}</Detail>
              <Detail label="Notes">{activeInvoice.notes || '—'}</Detail>
            </dl>
          </div>
          <DataTable>
            <thead className="bg-sand/50">
              <tr>
                <th scope="col">Item</th>
                <th scope="col" className="text-right">Quantity</th>
                <th scope="col" className="text-right">Unit price</th>
                <th scope="col" className="text-right">Line total</th>
              </tr>
            </thead>
            <tbody>
              {activeInvoice.lines.map((line) => (
                <tr key={line.id}>
                  <td className="font-medium">{itemName(line.itemId)}</td>
                  <td className="text-right tabular-nums">{line.quantity}</td>
                  <td className="text-right tabular-nums">{formatCurrency(line.unitPrice)}</td>
                  <td className="text-right tabular-nums">{formatCurrency(line.quantity * line.unitPrice)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          <div className="text-right text-sm">
            <p>
              <span className="text-muted">Subtotal</span>{' '}
              <span className="ml-4 inline-block min-w-28 font-medium tabular-nums">
                {formatCurrency(invoiceGrandTotal(activeInvoice))}
              </span>
            </p>
            <p className="mt-1">
              <span className="text-muted">Grand total</span>{' '}
              <span className="ml-4 inline-block min-w-28 text-base font-semibold tabular-nums">
                {formatCurrency(invoiceGrandTotal(activeInvoice))}
              </span>
            </p>
          </div>
        </div>
      </>
    )
  }

  if ((screen.name === 'detail' || screen.name === 'receive') && !activeInvoice) {
    return (
      <>
        <PageHeader title="Purchase invoice" />
        <EmptyState
          title="Invoice not found"
          description="It may have been removed from this browser's saved data."
          action={<Button onClick={() => setScreen({ name: 'list' })}>Back to invoices</Button>}
        />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Supplier bills"
        description="The bill does not add stock. Receive the items on the bill to add them."
        actions={<Button onClick={openCreate}>New invoice</Button>}
      />

      {invoices.length === 0 ? (
        <EmptyState
          title="No purchase invoices yet"
          description="Create an invoice, then receive the items to add them to stock."
          action={<Button onClick={openCreate}>New invoice</Button>}
        />
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative sm:col-span-2 lg:col-span-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <input
                className={`${controlClass} pl-9`}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search invoices"
                aria-label="Search invoices"
              />
            </div>
            <select
              className={controlClass}
              value={supplierFilter}
              aria-label="Filter by supplier"
              onChange={(event) => setSupplierFilter(event.target.value)}
            >
              <option value="">All suppliers</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              className={controlClass}
              value={dateFrom}
              aria-label="Invoice date from"
              onChange={(event) => setDateFrom(event.target.value)}
            />
            <input
              type="date"
              className={controlClass}
              value={dateTo}
              aria-label="Invoice date to"
              onChange={(event) => setDateTo(event.target.value)}
            />
          </div>
          {filtered.length === 0 ? (
            <EmptyState title="No invoices match" description="Try another supplier, date, or invoice number." />
          ) : (
            <DataTable>
              <thead className="bg-sand/50">
                <tr>
                  <th scope="col">Invoice</th>
                  <th scope="col">Supplier</th>
                  <th scope="col">Date</th>
                  <th scope="col" className="text-right">Total</th>
                  <th scope="col">Payment</th>
                  <th scope="col">Receiving</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((invoice) => {
                  const paid = paymentStatus(invoice)
                  const received = receivingStatus(invoice, receipts)
                  return (
                    <tr key={invoice.id}>
                      <td className="font-medium whitespace-nowrap">{invoice.invoiceNumber}</td>
                      <td>{supplierName(invoice.supplierId)}</td>
                      <td className="whitespace-nowrap">{formatDate(invoice.invoiceDate)}</td>
                      <td className="text-right tabular-nums">{formatCurrency(invoiceGrandTotal(invoice))}</td>
                      <td>
                        <Badge tone={paymentTone(paid)}>{PAYMENT_STATUS_LABELS[paid]}</Badge>
                      </td>
                      <td>
                        <Badge tone={receivingTone(received)}>{RECEIVING_STATUS_LABELS[received]}</Badge>
                      </td>
                      <td className="whitespace-nowrap text-right">
                        <Button variant="ghost" onClick={() => setScreen({ name: 'detail', invoiceId: invoice.id })}>
                          View
                        </Button>
                        {received === 'full' ? null : (
                          <Button variant="ghost" onClick={() => openReceive(invoice.id)}>
                            Receive
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </DataTable>
          )}
        </>
      )}
    </>
  )
}
