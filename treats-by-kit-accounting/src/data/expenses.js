import { expenseDraft, expensePaymentDraft } from '../accounting/posting'
import { accountByCode } from './accounts'
import { buildReversalDraft, findByEventKey } from './journal'
import { PAYMENT_METHODS } from './sales'
import { COLLECTIONS } from './seed'
import { callRpc, getAll, getById } from './storage'
import { round2, toCentavos } from '../utils/money'

export const EXPENSE_CATEGORIES = [
  { code: '6010', label: 'Rent' },
  { code: '6020', label: 'Utilities' },
  { code: '6030', label: 'Salaries and Wages' },
  { code: '6040', label: 'Delivery and Transport' },
  { code: '6050', label: 'Marketing' },
  { code: '6060', label: 'Supplies' },
  { code: '6070', label: 'Repairs and Maintenance' },
  { code: '6080', label: 'Miscellaneous' },
]

export function expenseCategoryLabel(code) {
  return EXPENSE_CATEGORIES.find((category) => category.code === code)?.label || 'Expense'
}

function validate(draft, { requireMethod }) {
  const errors = {}
  if (!draft.date) errors.date = 'Choose a date.'
  if (!draft.payee?.trim()) errors.payee = 'Enter a payee.'
  if (!EXPENSE_CATEGORIES.some((category) => category.code === draft.category)) errors.category = 'Choose a category.'
  const amount = Number(draft.amount)
  if (draft.amount === '' || !Number.isFinite(amount) || amount <= 0) errors.amount = 'Enter an amount greater than 0.'
  if (draft.status !== 'paid' && draft.status !== 'unpaid') errors.status = 'Choose paid or unpaid.'
  if (requireMethod && draft.status === 'paid' && !PAYMENT_METHODS.some((method) => method.id === draft.method)) {
    errors.method = 'Choose a payment method.'
  }
  return errors
}

function journalsFor(expenseId) {
  return getAll(COLLECTIONS.JOURNAL_ENTRIES).filter((entry) => entry.sourceId === expenseId && entry.status !== 'reversed' && !entry.reversalOfId)
}

export async function saveExpense(draft) {
  const current = draft.id ? getById(COLLECTIONS.EXPENSES, draft.id) : null
  if (draft.id && !current) return { ok: false, errors: { form: 'This expense no longer exists.' } }
  if (current?.status === 'voided') return { ok: false, errors: { form: 'A voided expense cannot be edited.' } }
  const errors = validate(draft, { requireMethod: true })
  if (Object.keys(errors).length) return { ok: false, errors }

  const payload = {
    date: draft.date,
    payee: draft.payee.trim(),
    category: draft.category,
    description: (draft.description || '').trim(),
    amount: round2(draft.amount),
    method: draft.status === 'paid' ? draft.method : draft.method || 'cash',
    status: draft.status,
    reference: (draft.reference || '').trim(),
    notes: (draft.notes || '').trim(),
    dueDate: draft.dueDate || '',
  }

  if (!current) {
    const expense = { ...payload, id: crypto.randomUUID(), voidReason: '', voidedAt: null, postingRevision: 1 }
    try {
      await callRpc('record_expense', { expense, journal: expenseDraft(expense, `expense:${expense.id}`) })
      return { ok: true, expense: getById(COLLECTIONS.EXPENSES, expense.id) || expense }
    } catch (error) {
      return { ok: false, errors: { form: error.message || 'The expense could not be saved.' } }
    }
  }

  const financialChanged =
    current.date !== payload.date ||
    current.category !== payload.category ||
    toCentavos(current.amount) !== toCentavos(payload.amount) ||
    current.status !== payload.status ||
    (payload.status === 'paid' && current.method !== payload.method)

  if (!financialChanged) {
    try {
      const result = await callRpc('record_expense', { expense: { ...current, ...payload, id: current.id } })
      return { ok: true, expense: getById(COLLECTIONS.EXPENSES, result.id) || { ...current, ...payload } }
    } catch (error) {
      return { ok: false, errors: { form: error.message } }
    }
  }

  if (findByEventKey(`expense-payment:${current.id}`)) {
    return { ok: false, errors: { form: 'This expense has a payment. Void it and enter a new one to change the amount.' } }
  }

  const revision = (current.postingRevision || 1) + 1
  const next = { ...current, ...payload, postingRevision: revision }
  const reversals = journalsFor(current.id)
    .filter((entry) => entry.status !== 'reversed')
    .map((entry) => buildReversalDraft(entry, {
      date: payload.date,
      reason: 'Expense edited',
      sourceType: 'expense_reversal',
      sourceId: current.id,
    }))
  try {
    await callRpc('record_expense', {
      expense: next,
      reversals,
      journal: expenseDraft(next, `expense:${current.id}:${revision}`),
    })
    return { ok: true, expense: getById(COLLECTIONS.EXPENSES, current.id) || next }
  } catch (error) {
    return { ok: false, errors: { form: error.message || 'The expense could not be saved.' } }
  }
}

export async function voidExpense(id, reason) {
  const trimmed = reason?.trim() ?? ''
  if (!trimmed) return { ok: false, errors: { reason: 'Enter a reason for voiding this expense.' } }
  const expense = getById(COLLECTIONS.EXPENSES, id)
  if (!expense) return { ok: false, errors: { form: 'This expense no longer exists.' } }
  if (expense.status === 'voided') return { ok: false, errors: { form: 'This expense is already voided.' } }
  const journals = getAll(COLLECTIONS.JOURNAL_ENTRIES)
    .filter((journal) => journal.sourceId === id && journal.status !== 'reversed' && !journal.reversalOfId)
    .map((entry) => buildReversalDraft(entry, { date: expense.date, reason: trimmed, sourceType: 'expense_reversal', sourceId: id }))
  try {
    await callRpc('void_expense', { expenseId: id, reason: trimmed, journals })
    return { ok: true, expense: getById(COLLECTIONS.EXPENSES, id) }
  } catch (error) {
    return { ok: false, errors: { form: error.message || 'The expense could not be voided.' } }
  }
}

export async function payExpense(id, draft) {
  const expense = getById(COLLECTIONS.EXPENSES, id)
  if (!expense) return { ok: false, errors: { form: 'This expense no longer exists.' } }
  if (expense.status === 'voided') return { ok: false, errors: { form: 'A voided expense cannot be paid.' } }
  if (expense.status === 'paid') return { ok: false, errors: { form: 'This expense is already paid.' } }
  const errors = {}
  if (!draft.date) errors.date = 'Choose a date.'
  if (!PAYMENT_METHODS.some((method) => method.id === draft.method)) errors.method = 'Choose a payment method.'
  const amount = round2(draft.amount === undefined || draft.amount === '' ? expense.amount : draft.amount)
  if (toCentavos(amount) !== toCentavos(expense.amount)) errors.amount = 'Pay the full unpaid amount.'
  if (Object.keys(errors).length) return { ok: false, errors }
  const payable = accountByCode('2010')
  const accrual = getAll(COLLECTIONS.JOURNAL_ENTRIES).find((entry) => entry.sourceId === id && entry.sourceType === 'expense' && entry.status !== 'reversed')
  const creditsPayable = accrual && payable && (accrual.lines || []).some((line) => line.accountId === payable.id && toCentavos(line.credit) > 0)
  if (!creditsPayable) return { ok: false, errors: { form: 'This expense is not sitting in accounts payable.' } }
  try {
    await callRpc('pay_expense', {
      expenseId: id,
      amount,
      method: draft.method,
      date: draft.date,
      journal: expensePaymentDraft(expense, { amount, method: draft.method, date: draft.date }),
    })
    return { ok: true, expense: getById(COLLECTIONS.EXPENSES, id) }
  } catch (error) {
    return { ok: false, errors: { form: error.message || 'The payment could not be saved.' } }
  }
}
