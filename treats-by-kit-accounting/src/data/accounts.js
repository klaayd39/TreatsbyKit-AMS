import { COLLECTIONS } from './seed'
import { add, getAll, getById, remove, update } from './storage'

export const ACCOUNT_TYPES = [
  { id: 'asset', label: 'Asset', group: 'Assets', normal: 'debit' },
  { id: 'liability', label: 'Liability', group: 'Liabilities', normal: 'credit' },
  { id: 'equity', label: 'Equity', group: 'Equity', normal: 'credit' },
  { id: 'revenue', label: 'Revenue', group: 'Revenue', normal: 'credit' },
  { id: 'contra_revenue', label: 'Contra revenue', group: 'Revenue', normal: 'debit' },
  { id: 'cogs', label: 'Cost of sales', group: 'Cost of sales', normal: 'debit' },
  { id: 'contra_cogs', label: 'Cost of sales (credit)', group: 'Cost of sales', normal: 'credit' },
  { id: 'expense', label: 'Operating expense', group: 'Operating expenses', normal: 'debit' },
]

export const ACCOUNT_GROUPS = ['Assets', 'Liabilities', 'Equity', 'Revenue', 'Cost of sales', 'Operating expenses']

export function normalBalanceFor(type) {
  return ACCOUNT_TYPES.find((entry) => entry.id === type)?.normal || 'debit'
}

export function accountTypeLabel(type) {
  return ACCOUNT_TYPES.find((entry) => entry.id === type)?.label || type
}

export function accountGroup(type) {
  return ACCOUNT_TYPES.find((entry) => entry.id === type)?.group || 'Other'
}

export function accountByCode(code) {
  return getAll(COLLECTIONS.ACCOUNTS).find((account) => account.code === code) ?? null
}

export async function ensureChartOfAccounts() {
  return getAll(COLLECTIONS.ACCOUNTS)
}

function accountUsed(accountId) {
  return getAll(COLLECTIONS.JOURNAL_ENTRIES).some((entry) =>
    (entry.lines || []).some((line) => line.accountId === accountId),
  )
}

export async function saveAccount(draft) {
  const errors = {}
  const code = (draft.code || '').trim()
  const name = (draft.name || '').trim()
  if (!code) errors.code = 'Enter an account code.'
  if (!name) errors.name = 'Enter an account name.'
  if (!ACCOUNT_TYPES.some((type) => type.id === draft.type)) errors.type = 'Choose an account type.'
  const accounts = getAll(COLLECTIONS.ACCOUNTS)
  if (code && accounts.some((account) => account.id !== draft.id && account.code.toLowerCase() === code.toLowerCase())) {
    errors.code = 'That code is already used.'
  }
  const current = draft.id ? accounts.find((account) => account.id === draft.id) : null
  if (current?.system && draft.type !== current.type) errors.type = 'The type of a system account is locked.'
  if (current?.system && code !== current.code) errors.code = 'The code of a system account is locked.'
  if (Object.keys(errors).length) return { ok: false, errors }

  const payload = {
    code,
    name,
    type: current?.system ? current.type : draft.type,
    normalBalance: normalBalanceFor(current?.system ? current.type : draft.type),
    description: (draft.description || '').trim(),
    active: draft.active !== false,
    system: current?.system || false,
  }
  if (current) {
    const account = await update(COLLECTIONS.ACCOUNTS, current.id, payload)
    if (!account) return { ok: false, errors: { form: 'This account no longer exists.' } }
    return { ok: true, account }
  }
  return {
    ok: true,
    account: await add(COLLECTIONS.ACCOUNTS, { ...payload, id: crypto.randomUUID(), createdAt: new Date().toISOString() }),
  }
}

export async function deleteAccount(id) {
  const account = getById(COLLECTIONS.ACCOUNTS, id)
  if (!account) return { ok: false, message: 'This account no longer exists.' }
  if (account.system) return { ok: false, message: 'System accounts are locked and cannot be deleted. Deactivate the account instead.' }
  if (accountUsed(id)) return { ok: false, message: 'This account has journal lines. Deactivate it instead of deleting it.' }
  if (!(await remove(COLLECTIONS.ACCOUNTS, id))) return { ok: false, message: 'This account no longer exists.' }
  return { ok: true }
}
