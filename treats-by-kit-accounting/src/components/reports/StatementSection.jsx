import { Link } from 'react-router-dom'
import { downloadCsv } from '../../reports/csv'
import { percentChange, formatPercent } from '../../reports/format'
import { formatSignedMoney } from '../../utils/format'
import { fromCentavos, toCentavos } from '../../utils/money'
import Button from '../ui/Button'

function amountText(line) {
  if (line.header) return ''
  if (line.text !== null && line.text !== undefined) return line.text
  return formatSignedMoney(line.amount)
}

function compareText(line) {
  if (line.header) return ''
  if (line.compareText !== null && line.compareText !== undefined) return line.compareText
  if (line.compare === null || line.compare === undefined) return ''
  return formatSignedMoney(line.compare)
}

function changeText(line) {
  if (line.header || line.text) return ''
  if (line.compare === null || line.compare === undefined) return ''
  return formatSignedMoney(fromCentavos(toCentavos(line.amount) - toCentavos(line.compare)))
}

export default function StatementSection({ lines, compare, from, to, filename }) {
  function exportCsv() {
    const header = compare ? ['Line', 'Amount', 'Previous', 'Change', 'Change %'] : ['Line', 'Amount']
    const body = lines.filter((line) => !line.header).map((line) => {
      const amount = line.text ?? line.amount
      if (!compare) return [line.label, amount]
      const change = line.text ? '' : fromCentavos(toCentavos(line.amount) - toCentavos(line.compare))
      const ratio = line.text ? '' : formatPercent(percentChange(line.amount, line.compare))
      return [line.label, amount, line.compareText ?? line.compare ?? '', change, ratio]
    })
    downloadCsv(filename, [header, ...body])
  }

  return (
    <section>
      <div className="no-print mb-3 flex justify-end">
        <Button variant="secondary" onClick={exportCsv}>Export CSV</Button>
      </div>
      <div className="overflow-x-auto">
        <table>
          <thead className="bg-sand/50">
            <tr>
              <th scope="col">Line</th>
              <th scope="col" className="text-right">Amount</th>
              {compare ? (
                <>
                  <th scope="col" className="text-right">Previous</th>
                  <th scope="col" className="text-right">Change</th>
                  <th scope="col" className="text-right">Change %</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const params = new URLSearchParams()
              if (line.accountId) {
                params.set('account', line.accountId)
                if (from) params.set('from', from)
                if (to) params.set('to', to)
              }
              const href = line.accountId ? `/accounting/general-ledger?${params}` : ''
              return (
                <tr key={line.key} className={line.strong ? 'border-t border-line' : undefined}>
                  <th scope="row" className={`normal-case tracking-normal ${line.strong ? 'font-semibold text-ink' : 'font-normal text-ink'}`} style={{ paddingLeft: `${1 + line.depth * 1.25}rem` }}>
                    {href ? <Link className="text-accent hover:underline" to={href}>{line.label}</Link> : line.label}
                  </th>
                  <td className={`text-right tabular-nums whitespace-nowrap ${line.strong ? 'font-semibold' : ''}`}>{amountText(line)}</td>
                  {compare ? (
                    <>
                      <td className="text-right tabular-nums whitespace-nowrap">{compareText(line)}</td>
                      <td className="text-right tabular-nums whitespace-nowrap">{changeText(line)}</td>
                      <td className="text-right tabular-nums whitespace-nowrap">{line.text || line.header || line.compare === null || line.compare === undefined ? '' : formatPercent(percentChange(line.amount, line.compare))}</td>
                    </>
                  ) : null}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
