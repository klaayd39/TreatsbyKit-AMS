export default function DataTable({ children }) {
  return (
    <div className="overflow-x-auto rounded-[1.75rem] border border-line bg-sidebar">
      <table className="min-w-full [&_td]:align-middle [&_th]:align-middle">{children}</table>
    </div>
  )
}
