import { Link } from 'react-router-dom'
import { entriesForSources } from '../../data/journal'

export default function JournalLinks({ sourceIds }) {
  const entries = entriesForSources(sourceIds)
  if (entries.length === 0) return <span className="text-muted">Not posted yet</span>
  return (
    <span className="inline-flex flex-wrap gap-x-2">
      {entries.map((entry) => (
        <Link key={entry.id} className="font-medium text-accent hover:underline" to={`/accounting/journal-entries?entry=${entry.id}`}>
          {entry.entryNumber}
        </Link>
      ))}
    </span>
  )
}
