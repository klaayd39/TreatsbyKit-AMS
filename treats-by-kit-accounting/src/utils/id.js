export function generateId(prefix = 'id') {
  return `${prefix}-${crypto.randomUUID()}`
}
