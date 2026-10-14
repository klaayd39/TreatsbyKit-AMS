export default function PrintLayout({ title, subtitle, children }) {
  return (
    <article className="print-statement">
      <header className="mb-6 text-center">
        <p className="font-display text-2xl text-ink">Treats by Kit</p>
        <h2 className="mt-1 text-lg font-semibold text-ink">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </header>
      {children}
    </article>
  )
}
