import { useEffect, useState } from 'react'
import { getSupabase } from '../lib/supabase'
import { formatDateTime } from '../utils/format'

const TABLES = {
  sales: 'sales',
  purchaseInvoices: 'purchase_invoices',
  productionBatches: 'production_batches',
  journalEntries: 'journal_entries',
}

export default function LastChanged({ table, id }) {
  const [label, setLabel] = useState('')

  useEffect(() => {
    const name = TABLES[table]
    if (!name || !id) return undefined
    let cancelled = false
    getSupabase().rpc('last_change', { p_table: name, p_id: id }).then(({ data }) => {
      const row = Array.isArray(data) ? data[0] : data
      if (!cancelled && row?.changed_at) {
        setLabel(`Last changed by ${row.user_email || 'someone'} on ${formatDateTime(row.changed_at)}`)
      }
    })
    return () => {
      cancelled = true
    }
  }, [table, id])

  if (!label) return null
  return <p className="text-sm text-muted">{label}</p>
}
