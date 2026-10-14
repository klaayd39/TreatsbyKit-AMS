export const PAGE_SIZE = 50

export function canSeePath(role, path) {
  if (role === 'owner') return true
  if (role === 'cashier') return ['/sales/pos', '/sales/orders', '/sales/history'].includes(path)
  if (role === 'bookkeeper') {
    return !['/admin/employees', '/admin/settings', '/admin/audit-logs'].includes(path)
  }
  if (role === 'viewer') {
    return !['/admin/employees', '/admin/settings', '/admin/audit-logs', '/sales/pos'].includes(path)
  }
  return false
}

export function homeForRole(role) {
  if (role === 'cashier') return '/sales/pos'
  return '/'
}
