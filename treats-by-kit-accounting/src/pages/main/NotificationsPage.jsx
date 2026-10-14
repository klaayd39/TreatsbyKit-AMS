import { useState } from 'react'
import { Link } from 'react-router-dom'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import { controlClass } from '../../components/ui/Field'
import EmptyState from '../../components/ui/EmptyState'
import PageHeader from '../../components/ui/PageHeader'
import { useNotifications } from '../../hooks/useNotifications'
import { NOTIFICATION_TYPES } from '../../reports/notifications'
import { formatDate } from '../../utils/format'

const TONES = { Info: 'accent', Warning: 'warning', Critical: 'danger' }

export default function NotificationsPage() {
  const { notifications, markRead, markAllRead, dismiss } = useNotifications()
  const [type, setType] = useState('')
  const [severity, setSeverity] = useState('')
  const [read, setRead] = useState('')
  const rows = notifications.filter((note) => {
    if (type && note.type !== type) return false
    if (severity && note.severity !== severity) return false
    if (read === 'unread' && note.read) return false
    if (read === 'read' && !note.read) return false
    return true
  })

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Raised from current stock, balances, orders, and the books. Dismissed items stay hidden until the condition clears and comes back."
        actions={<Button variant="secondary" onClick={markAllRead}>Mark all as read</Button>}
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <select className={controlClass} aria-label="Type" value={type} onChange={(event) => setType(event.target.value)}>
          <option value="">All types</option>
          {NOTIFICATION_TYPES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
        </select>
        <select className={controlClass} aria-label="Severity" value={severity} onChange={(event) => setSeverity(event.target.value)}>
          <option value="">All severities</option>
          <option value="Info">Info</option>
          <option value="Warning">Warning</option>
          <option value="Critical">Critical</option>
        </select>
        <select className={controlClass} aria-label="Read status" value={read} onChange={(event) => setRead(event.target.value)}>
          <option value="">All</option>
          <option value="unread">Unread</option>
          <option value="read">Read</option>
        </select>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No notifications" description="Nothing matches these filters." />
      ) : (
        <ul className="space-y-3">
          {rows.map((note) => (
            <li key={note.key} className={`rounded-2xl border border-line bg-white px-4 py-3 ${note.read ? '' : 'border-accent/40 bg-accent-soft/40'}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={TONES[note.severity] || 'neutral'}>{note.severity}</Badge>
                <span className="text-xs text-muted">{NOTIFICATION_TYPES.find((entry) => entry.id === note.type)?.label}</span>
                <span className="text-xs text-muted">{formatDate(note.detected)}</span>
              </div>
              <p className="mt-2 text-sm text-ink">{note.message}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link className="text-sm font-medium text-accent hover:underline" to={note.href} onClick={() => markRead(note.key)}>Open</Link>
                {note.read ? null : <Button variant="ghost" onClick={() => markRead(note.key)}>Mark read</Button>}
                <Button variant="ghost" onClick={() => dismiss(note.key)}>Dismiss</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
