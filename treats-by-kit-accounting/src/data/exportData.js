import JSZip from 'jszip'
import { getTrialBalance } from '../accounting/accounts'
import { getSupabase } from '../lib/supabase'
import { todayISODate } from '../utils/format'

const TABLES = [
  'profiles',
  'business_settings',
  'items',
  'suppliers',
  'customers',
  'purchase_invoices',
  'purchase_invoice_lines',
  'receiving_records',
  'receiving_lines',
  'supplier_payments',
  'recipes',
  'recipe_lines',
  'production_batches',
  'production_batch_lines',
  'sales',
  'sale_lines',
  'sale_payments',
  'orders',
  'order_lines',
  'expenses',
  'stock_movements',
  'accounts',
  'journal_entries',
  'journal_lines',
  'notification_states',
]

function cell(value) {
  if (value == null) return ''
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

function toCsv(rows) {
  if (!rows?.length) return ''
  const keys = Object.keys(rows[0])
  return [keys.join(','), ...rows.map((row) => keys.map((key) => cell(row[key])).join(','))].join('\n')
}

export async function exportAllData() {
  const supabase = getSupabase()
  const zip = new JSZip()
  for (const table of TABLES) {
    const { data, error } = await supabase.from(table).select('*').limit(10000)
    if (error) throw error
    zip.file(`${table}.csv`, toCsv(data || []))
  }
  const trial = getTrialBalance(todayISODate())
  zip.file('trial-balance.csv', toCsv(trial.rows.map((row) => ({
    code: row.code,
    name: row.name,
    debit: row.endingDebit,
    credit: row.endingCredit,
  }))))
  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `treats-by-kit-${todayISODate()}.zip`
  link.click()
  URL.revokeObjectURL(url)
}
