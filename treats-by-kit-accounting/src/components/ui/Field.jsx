export const controlClass =
  'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:bg-sand disabled:text-muted'

export default function Field({ label, htmlFor, error, hint, children }) {
  return (
    <div>
      {label ? (
        <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-ink">
          {label}
        </label>
      ) : null}
      {children}
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
      {error ? <p className="mt-1 text-sm text-red-800">{error}</p> : null}
    </div>
  )
}
