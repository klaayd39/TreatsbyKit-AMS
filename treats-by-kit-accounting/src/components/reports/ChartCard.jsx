export default function ChartCard({ title, action, children }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {title ? <h2 className="text-sm font-medium text-muted">{title}</h2> : <span />}
        {action}
      </div>
      <div className="h-72 w-full min-w-0">{children}</div>
    </section>
  )
}
