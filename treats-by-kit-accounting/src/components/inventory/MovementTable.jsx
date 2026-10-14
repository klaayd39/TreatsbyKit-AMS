import Badge from '../ui/Badge'
import DataTable from '../ui/DataTable'
import { formatDate, formatQuantity } from '../../utils/format'
import { MOVEMENT_LABELS, MOVEMENT_TONES } from './movementView'

function QuantityCell({ value }) {
  const quantity = Number(value) || 0
  return (
    <td className={`text-right tabular-nums ${quantity === 0 ? 'text-muted' : 'text-ink'}`}>
      {formatQuantity(quantity)}
    </td>
  )
}

export default function MovementTable({ rows, showItem = true, emptyMessage = 'No stock movements yet.' }) {
  const columnCount = showItem ? 8 : 7

  return (
    <DataTable>
      <thead className="bg-sand/50">
        <tr>
          <th scope="col">Date</th>
          {showItem ? <th scope="col">Item</th> : null}
          <th scope="col">Type</th>
          <th scope="col" className="text-right">In</th>
          <th scope="col" className="text-right">Out</th>
          <th scope="col" className="text-right">Balance</th>
          <th scope="col">Reference</th>
          <th scope="col">Notes</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={columnCount} className="py-10 text-center text-sm text-muted">
              {emptyMessage}
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={row.id}>
              <td className="whitespace-nowrap">{formatDate(row.date)}</td>
              {showItem ? <td className="font-medium">{row.itemName}</td> : null}
              <td>
                <Badge tone={MOVEMENT_TONES[row.type] || 'neutral'}>
                  {MOVEMENT_LABELS[row.type] || row.type}
                </Badge>
              </td>
              <QuantityCell value={row.quantityIn} />
              <QuantityCell value={row.quantityOut} />
              <td className="text-right font-medium tabular-nums">{formatQuantity(row.runningBalance)}</td>
              <td className="whitespace-nowrap">{row.referenceLabel}</td>
              <td className="max-w-xs whitespace-normal">{row.notes || '—'}</td>
            </tr>
          ))
        )}
      </tbody>
    </DataTable>
  )
}
