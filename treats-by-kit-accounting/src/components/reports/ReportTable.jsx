import Button from '../ui/Button'
import DataTable from '../ui/DataTable'
import EmptyState from '../ui/EmptyState'
import { downloadCsv } from '../../reports/csv'

export default function ReportTable({ title, columns, rows, totals, filename, emptyTitle = 'Nothing in this period', emptyDescription = 'Try another date range.', rowClassName }) {
  function exportCsv() {
    const header = columns.map((column) => column.label)
    const body = rows.map((row) => columns.map((column) => (column.export ? column.export(row) : row[column.key])))
    const footer = totals ? columns.map((column) => (column.exportTotal ? column.exportTotal(totals) : totals[column.key] ?? '')) : null
    downloadCsv(filename, footer ? [header, ...body, footer] : [header, ...body])
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        {title ? <h2 className="text-sm font-medium text-muted">{title}</h2> : <span />}
        <Button variant="secondary" onClick={exportCsv} disabled={rows.length === 0}>Export CSV</Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <DataTable>
          <thead className="bg-sand/50">
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col" className={column.align === 'right' ? 'text-right' : ''}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={rowClassName ? rowClassName(row) : undefined}>
                {columns.map((column) => (
                  <td key={column.key} className={column.align === 'right' ? 'text-right tabular-nums whitespace-nowrap' : ''}>
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {totals ? (
            <tfoot>
              <tr>
                {columns.map((column) => (
                  <td key={column.key} className={`font-semibold ${column.align === 'right' ? 'text-right tabular-nums' : ''}`}>
                    {column.total ? column.total(totals) : totals[column.key] ?? ''}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </DataTable>
      )}
    </section>
  )
}
