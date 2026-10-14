const variants = {
  primary: 'bg-accent text-white hover:brightness-110',
  secondary: 'border border-line bg-white text-ink hover:bg-sand',
  danger: 'bg-red-800 text-white hover:brightness-110',
  ghost: 'text-ink hover:bg-sand',
}

export function buttonClass(variant = 'primary', className = '') {
  return `inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`
}
