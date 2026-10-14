let demo = false

export function setDemoMode(value) {
  demo = Boolean(value)
}

export function isDemoMode() {
  return demo
}
