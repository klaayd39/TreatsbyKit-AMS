export default function ChartCard({ title, action, children }) {
  return (
    <section className="rounded-[1.75rem] border border-line bg-sidebar p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {title ? <h2 className="font-display text-2xl font-medium text-accent">{title}</h2> : <span />}
        {action}
      </div>
      <div className="h-72 w-full min-w-0">{children}</div>
    </section>
  )
}
