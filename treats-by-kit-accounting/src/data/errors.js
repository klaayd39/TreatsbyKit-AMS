export function explainError(error) {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase()
  if (message.includes('negative stock')) return 'That would make the stock on hand negative.'
  if (message.includes('books are locked')) return 'The books are locked for that date. Choose a later date or ask an owner to change the lock.'
  if (message.includes('unbalanced')) return 'That journal entry does not balance, so it was not saved.'
  if (message.includes('overpayment')) return 'That payment is more than the balance still owed.'
  if (message.includes('purchase_invoices_supplier') || message.includes('duplicate invoice') || message.includes('invoice_number')) {
    return 'That invoice number is already used for this supplier.'
  }
  if (message.includes('sale_number')) return 'That sale number is already used.'
  if (message.includes('batch_number')) return 'That batch number is already used.'
  if (message.includes('order_number')) return 'That order number is already used.'
  if (message.includes('event_key') || message.includes('duplicate key')) return 'This was already posted.'
  if (message.includes('not allowed')) return 'You do not have permission to do that.'
  if (message.includes('journal entries cannot')) return 'Posted journal entries cannot be edited or deleted.'
  if (message.includes('stock movements cannot')) return 'Stock movements cannot be edited or deleted.'
  if (message.includes('system accounts cannot')) return 'That account is used by the system and cannot be changed that way.'
  if (message.includes('receive quantity')) return 'That receive quantity is more than the invoice still allows.'
  if (message.includes('one active owner')) return 'The business needs one active owner.'
  if (message.includes('your own access')) return 'You cannot change your own access.'
  if (message.includes('demo data cannot be removed')) return 'Clear the books lock date before removing demo data.'
  if (message.includes('jwt') || message.includes('not authenticated')) return 'Your session expired. Sign in again.'
  const plain = error?.message || 'Something went wrong. Nothing was saved.'
  return plain.replace(/^.*ERROR:\s*/i, '')
}

export function reportFailure(error) {
  const message = explainError(error)
  window.dispatchEvent(new CustomEvent('tbk-error', { detail: message }))
  return message
}
