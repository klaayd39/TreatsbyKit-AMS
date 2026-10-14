const variants = {
  primary: 'bg-accent text-white hover:brightness-110',
  secondary: 'bg-accent-soft text-accent hover:brightness-95',
  danger: 'bg-red-800 text-white hover:brightness-110',
  ghost: 'text-accent hover:bg-accent-soft',
}

export function buttonClass(variant = 'primary', className = '') {
  return `inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`
}
