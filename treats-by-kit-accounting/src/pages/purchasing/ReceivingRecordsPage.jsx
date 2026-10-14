import { Link } from 'react-router-dom'
import { buttonClass } from '../../components/ui/buttonStyles'
import DataTable from '../../components/ui/DataTable'
import EmptyState from '../../components/ui/EmptyState'
import PageHeader from '../../components/ui/PageHeader'
import { COLLECTIONS } from '../../data/seed'
import { getAll } from '../../data/storage'
import { formatDate, formatQuantity } from '../../utils/format'

export default function ReceivingRecordsPage() {
  const receipts = getAll(COLLECTIONS.RECEIVING_RECORDS)
  const invoices = getAll(COLLECTIONS.PURCHASE_INVOICES)
  const suppliers = getAll(COLLECTIONS.SUPPLIERS)
  const items = getAll(COLLECTIONS.ITEMS)

  const rows = receipts
    .map((receipt) => {
      const invoice = invoices.find((entry) => entry.id === receipt.invoiceId)
      const supplier = suppliers.find((entry) => entry.id === invoice?.supplierId)
      const itemSummary = (receipt.lines || [])
        .map((line) => {
          const item = items.find((entry) => entry.id === line.itemId)
          const name = item?.name ?? 'Unknown item'
          const unit = item?.unit ? ` ${item.unit}` : ''
          return `${name} × ${formatQuantity(line.quantity)}${unit}`
        })
        .join(', ')
      return {
        ...receipt,
        supplierName: supplier?.name ?? 'Unknown supplier',
        invoiceNumber: invoice?.invoiceNumber ?? 'Unknown invoice',
        itemSummary: itemSummary || '—',
      }
    })
    .sort(
      (a, b) =>
        String(b.date).localeCompare(String(a.date)) ||
        String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
    )

  return (
    <>
      <PageHeader
        title="Goods received"
        description="Deliveries you have checked in. Each one adds to In stock."
      />
      {rows.length === 0 ? (
        <EmptyState
          title="No receipts yet"
          description="Open a purchase invoice and receive items to record stock coming in."
          action={
            <Link to="/purchasing/invoices" className={buttonClass('primary')}>
              Go to purchase invoices
            </Link>
          }
        />
      ) : (
        <DataTable>
          <thead className="bg-sand/50">
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Supplier</th>
              <th scope="col">Invoice</th>
              <th scope="col">Items</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((receipt) => (
              <tr key={receipt.id}>
                <td className="whitespace-nowrap">{formatDate(receipt.date)}</td>
                <td>{receipt.supplierName}</td>
                <td className="whitespace-nowrap">{receipt.invoiceNumber}</td>
                <td className="max-w-md whitespace-normal">{receipt.itemSummary}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </>
  )
}
