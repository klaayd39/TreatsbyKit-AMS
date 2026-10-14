export default function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-8 text-center sm:mb-12">
      <h1 className="font-display text-[clamp(2.5rem,6vw,4rem)] font-medium leading-none text-accent">{title}</h1>
      {description ? <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted sm:text-base">{description}</p> : null}
      {actions ? <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{actions}</div> : null}
    </div>
  )
}
