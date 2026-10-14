let role = 'viewer'

export function setSessionRole(value) {
  role = value || 'viewer'
}

export function sessionRole() {
  return role
}
