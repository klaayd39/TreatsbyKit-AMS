const tones = {
  neutral: 'bg-sand text-ink',
  accent: 'bg-accent-soft text-accent',
  warning: 'bg-amber-100 text-amber-950',
  success: 'bg-emerald-100 text-emerald-950',
  danger: 'bg-red-100 text-red-900',
}

export default function Badge({ tone = 'neutral', children }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${tones[tone]}`}>
      {children}
    </span>
  )
}
