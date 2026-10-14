import JournalLinks from '../accounting/JournalLinks'
import Badge from '../ui/Badge'
import DataTable from '../ui/DataTable'
import { formatCurrency, formatDate, formatQuantity } from '../../utils/format'

function Detail({ label, children }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-ink">{children}</dd>
    </div>
  )
}

export default function BatchDetail({ batch, items, recipes }) {
  const product = items.find((item) => item.id === batch.finishedItemId)
  const recipe = recipes.find((entry) => entry.id === batch.recipeId)
  const itemName = (itemId) => items.find((item) => item.id === itemId)?.name || 'Unknown item'
  const itemUnit = (itemId) => items.find((item) => item.id === itemId)?.unit || ''

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={batch.status === 'cancelled' ? 'danger' : 'success'}>
          {batch.status === 'cancelled' ? 'Cancelled' : 'Completed'}
        </Badge>
        <span className="text-sm text-muted">{formatDate(batch.date)}</span>
      </div>
      <dl className="grid gap-4 sm:grid-cols-2">
        <Detail label="Recipe">{recipe?.name || 'Unknown recipe'}</Detail>
        <Detail label="Product">{product?.name || 'Unknown product'}</Detail>
        <Detail label="Quantity produced">
          {formatQuantity(batch.quantityProduced)} {product?.unit || ''}
        </Detail>
        <Detail label="Cost per unit">{formatCurrency(batch.costPerUnit)}</Detail>
        <Detail label="Journal"><JournalLinks sourceIds={[batch.id]} /></Detail>
      </dl>
      {batch.notes ? <p className="text-sm text-ink">{batch.notes}</p> : null}
      {batch.status === 'cancelled' ? (
        <p className="rounded-lg bg-sand px-3 py-2 text-sm text-ink">
          Cancelled{batch.cancelReason ? `: ${batch.cancelReason}` : '.'}
        </p>
      ) : null}

      <DataTable>
        <thead className="bg-sand/50">
          <tr>
            <th scope="col">Ingredient</th>
            <th scope="col" className="text-right">Expected</th>
            <th scope="col" className="text-right">Actual used</th>
            <th scope="col" className="text-right">Waste</th>
            <th scope="col" className="text-right">Unit cost</th>
            <th scope="col" className="text-right">Ingredient cost</th>
            <th scope="col" className="text-right">Waste cost</th>
          </tr>
        </thead>
        <tbody>
          {(batch.lines || []).map((line) => (
            <tr key={line.id || line.itemId}>
              <td>
                {itemName(line.itemId)}
                <span className="text-muted"> {itemUnit(line.itemId)}</span>
              </td>
              <td className="text-right tabular-nums">{formatQuantity(line.expectedQty)}</td>
              <td className="text-right tabular-nums">{formatQuantity(line.actualQty)}</td>
              <td className="text-right tabular-nums">{formatQuantity(line.wasteQty)}</td>
              <td className="text-right tabular-nums">{formatCurrency(line.unitCost)}</td>
              <td className="text-right tabular-nums">{formatCurrency(line.actualQty * line.unitCost)}</td>
              <td className="text-right tabular-nums">{formatCurrency(line.wasteQty * line.unitCost)}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Ingredient cost</dt>
          <dd className="font-medium tabular-nums">{formatCurrency(batch.ingredientCost)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Waste cost</dt>
          <dd className="font-medium tabular-nums">{formatCurrency(batch.wasteCost)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Labor</dt>
          <dd className="font-medium tabular-nums">{formatCurrency(batch.laborCost)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Overhead</dt>
          <dd className="font-medium tabular-nums">{formatCurrency(batch.overheadCost)}</dd>
        </div>
        <div className="flex justify-between gap-3 sm:col-span-2">
          <dt className="font-medium text-ink">Total batch cost</dt>
          <dd className="text-base font-semibold tabular-nums">{formatCurrency(batch.totalCost)}</dd>
        </div>
      </dl>
    </div>
  )
}
