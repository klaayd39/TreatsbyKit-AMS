export default function Card({ title, value, hint, icon: Icon, children, className = '' }) {
  const hasValue = value !== undefined && value !== null

  return (
    <section className={`rounded-[1.75rem] border border-line bg-sidebar p-5 ${className}`}>
      {title || Icon ? (
        <div className="flex items-start justify-between gap-3">
          {title ? <p className="text-sm font-medium text-muted">{title}</p> : <span />}
          {Icon ? (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Icon className="size-4" aria-hidden="true" />
            </span>
          ) : null}
        </div>
      ) : null}
      {hasValue ? (
        <p className="mt-3 text-3xl font-semibold tracking-tight text-ink tabular-nums">{value}</p>
      ) : null}
      {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
      {children ? <div className={title || hasValue ? 'mt-4' : ''}>{children}</div> : null}
    </section>
  )
}
