export default function DataTable({ children }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white">
      <table className="min-w-full [&_td]:align-middle [&_th]:align-middle">{children}</table>
    </div>
  )
}
