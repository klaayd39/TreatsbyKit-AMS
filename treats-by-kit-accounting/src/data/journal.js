import { capitalContributionDraft } from '../accounting/posting'
import { formatDate } from '../utils/format'
import { lineTotals, round2, toCentavos } from '../utils/money'
import { COLLECTIONS } from './seed'
import { callRpc, getAll, getById, update } from './storage'

export const SOURCE_LABELS = {
  manual: 'Manual',
  receiving: 'Receiving',
  supplier_payment: 'Supplier payment',
  production: 'Production',
  production_reversal: 'Production reversal',
  sale: 'Sale',
  sale_cogs: 'Cost of goods sold',
  sale_reversal: 'Sale reversal',
  sale_cogs_reversal: 'COGS reversal',
  customer_payment: 'Customer payment',
  customer_deposit: 'Customer deposit',
  deposit_applied: 'Deposit applied',
  deposit_refund: 'Deposit refunded',
  deposit_retained: 'Deposit retained',
  customer_refund: 'Customer refund',
  adjustment: 'Stock adjustment',
  expense: 'Expense',
  expense_payment: 'Expense payment',
  expense_reversal: 'Expense reversal',
}

export function sourcePath(sourceType) {
  if (sourceType === 'receiving' || sourceType === 'supplier_payment') return '/purchasing/invoices'
  if (sourceType === 'production' || sourceType === 'production_reversal') return '/production/batches'
  if (
    sourceType === 'sale' ||
    sourceType === 'sale_cogs' ||
    sourceType === 'sale_reversal' ||
    sourceType === 'sale_cogs_reversal' ||
    sourceType === 'customer_payment'
  ) {
    return '/sales/history'
  }
  if (sourceType === 'customer_deposit' || sourceType === 'deposit_applied' || sourceType === 'deposit_refund' || sourceType === 'deposit_retained') {
    return '/sales/orders'
  }
  if (sourceType === 'customer_refund') return '/accounting/accounts-receivable'
  if (sourceType === 'adjustment') return '/inventory/movements'
  if (sourceType === 'expense' || sourceType === 'expense_payment' || sourceType === 'expense_reversal') return '/accounting/expenses'
  return null
}

export function getLockDate() {
  return getById(COLLECTIONS.SETTINGS, 'business')?.booksLockedThrough || ''
}

export async function saveLockDate(booksLockedThrough) {
  const value = booksLockedThrough || ''
  return await update(COLLECTIONS.SETTINGS, 'business', { booksLockedThrough: value })
}

export function lockError(date) {
  const lock = getLockDate()
  if (lock && date && date <= lock) return `Books are locked through ${formatDate(lock)}.`
  return ''
}

export function findByEventKey(eventKey) {
  if (!eventKey) return null
  return getAll(COLLECTIONS.JOURNAL_ENTRIES).find((entry) => entry.eventKey === eventKey) ?? null
}

export function entriesForSources(sourceIds) {
  const ids = new Set((sourceIds || []).filter(Boolean))
  if (ids.size === 0) return []
  return getAll(COLLECTIONS.JOURNAL_ENTRIES)
    .filter((entry) => ids.has(entry.sourceId))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.entryNumber).localeCompare(String(b.entryNumber)))
}

export function buildReversalDraft(entry, { date, reason, sourceType, sourceId }) {
  return {
    id: crypto.randomUUID(),
    eventKey: `reversal:${entry.id}`,
    date,
    description: `Reversal of ${entry.entryNumber}: ${reason}`,
    sourceType: sourceType || `${entry.sourceType}_reversal`,
    sourceId: sourceId || entry.sourceId,
    reversalOfId: entry.id,
    lines: (entry.lines || []).map((line) => ({
      accountId: line.accountId,
      debit: line.credit,
      credit: line.debit,
      memo: line.memo,
    })),
  }
}

export async function commitDraft(draft) {
  if (!draft) return { ok: true, skipped: true, entry: null }
  if (draft.eventKey) {
    const existing = findByEventKey(draft.eventKey)
    if (existing) return { ok: true, skipped: true, entry: existing }
  }
  const closed = lockError(draft.date)
  if (closed) return { ok: false, error: closed }
  if (!draft.date) return { ok: false, error: 'Choose a date.' }
  if (!draft.description?.trim()) return { ok: false, error: 'Enter a description.' }
  const lines = (draft.lines || []).filter((line) => toCentavos(line.debit) > 0 || toCentavos(line.credit) > 0)
  if (lines.length < 2) return { ok: false, error: 'A journal entry needs at least two lines.' }
  for (const line of lines) {
    const debit = toCentavos(line.debit)
    const credit = toCentavos(line.credit)
    if (!((debit > 0 && credit === 0) || (credit > 0 && debit === 0))) {
      return { ok: false, error: 'Each line must be a debit or a credit, not both.' }
    }
    if (!getById(COLLECTIONS.ACCOUNTS, line.accountId)) return { ok: false, error: 'Choose an account on every line.' }
  }
  const totals = lineTotals(lines)
  if (!totals.balanced) return { ok: false, error: 'Debits and credits must balance.' }

  try {
    const result = await callRpc('post_manual_journal', {
      journal: {
        id: crypto.randomUUID(),
        entryNumber: draft.entryNumber || null,
        date: draft.date,
        description: draft.description.trim(),
        sourceType: draft.sourceType || 'manual',
        sourceId: draft.sourceId || null,
        eventKey: draft.eventKey || null,
        reversalOfId: draft.reversalOfId || null,
        lines: lines.map((line) => ({
          accountId: line.accountId,
          debit: round2(line.debit),
          credit: round2(line.credit),
          memo: line.memo || '',
        })),
      },
    })
    const entry = getById(COLLECTIONS.JOURNAL_ENTRIES, result.id)
    return { ok: true, entry }
  } catch (error) {
    return { ok: false, error: error.message || 'The journal entry could not be posted.' }
  }
}

export async function postDraft(draft, createdIds) {
  try {
    const result = await commitDraft(draft)
    if (result.ok && result.entry && !result.skipped && createdIds) createdIds.push(result.entry.id)
    return result
  } catch (error) {
    return { ok: false, error: error.message || 'The journal entry could not be posted.' }
  }
}

export function rollbackEntries() {}

export async function reversePosted(entry, options) {
  if (!entry) return { ok: false, error: 'Journal entry not found.' }
  if (entry.status === 'reversed') return { ok: true, skipped: true, entry }
  const journal = buildReversalDraft(entry, options)
  try {
    const result = await callRpc('reverse_journal_entry', { entryId: entry.id, journal })
    return { ok: true, entry: getById(COLLECTIONS.JOURNAL_ENTRIES, result.id) }
  } catch (error) {
    return { ok: false, error: error.message }
  }
}

export async function reverseManualEntry(id, { date, reason }) {
  const trimmed = reason?.trim() ?? ''
  if (!trimmed) return { ok: false, error: 'Enter a reason.' }
  if (!date) return { ok: false, error: 'Choose a date.' }
  const entry = getById(COLLECTIONS.JOURNAL_ENTRIES, id)
  if (!entry) return { ok: false, error: 'Journal entry not found.' }
  if (entry.sourceType !== 'manual') {
    return { ok: false, error: 'This entry was posted from a source record. Void or cancel that record to reverse it.' }
  }
  if (entry.status === 'reversed') return { ok: false, error: 'This entry has already been reversed.' }
  return reversePosted(entry, { date, reason: trimmed, sourceType: 'manual', sourceId: entry.sourceId })
}

export async function saveManualEntry(draft) {
  const lines = draft.lines || []
  if (lines.length < 2) return { ok: false, error: 'Add at least two lines.' }
  return commitDraft({
    date: draft.date,
    description: draft.description,
    sourceType: 'manual',
    sourceId: null,
    lines,
  })
}

export async function postMissingEntries() {
  return { posted: 0, errors: [] }
}

export async function postCapitalContribution(date, amount) {
  return postDraft(capitalContributionDraft({ date, amount }))
}
