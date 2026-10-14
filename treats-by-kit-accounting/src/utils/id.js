const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i

export function generateId() {
  return crypto.randomUUID()
}

export function toUuid(value) {
  const match = String(value || '').match(UUID_PATTERN)
  return match ? match[0] : crypto.randomUUID()
}
