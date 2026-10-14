import { Bell, LogOut, Menu } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { useNotifications } from '../../hooks/useNotifications'
import { latestNotifications } from '../../reports/notifications'
import Badge from '../ui/Badge'

const today = new Date()
const TONES = { Info: 'accent', Warning: 'warning', Critical: 'danger' }

export default function Topbar({ mobileOpen, onMenu }) {
  const { profile, signOut } = useAuth()
  const { notifications, unread, markRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const panel = useRef(null)
  const latest = latestNotifications(notifications, 5)
  const iso = today.toISOString().slice(0, 10)
  const fullDate = today.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  const shortDate = today.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  useEffect(() => {
    if (!open) return undefined
    function onPointer(event) {
      if (panel.current && !panel.current.contains(event.target)) setOpen(false)
    }
    function onKey(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-line bg-canvas px-4 sm:px-6 print:hidden">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          className="inline-flex size-9 items-center justify-center rounded-lg text-ink hover:bg-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:hidden"
          aria-label="Open menu"
          aria-expanded={mobileOpen}
          aria-controls="app-sidebar"
          onClick={onMenu}
        >
          <Menu className="size-5" />
        </button>
        <p className="truncate text-sm text-muted">
          <span className="inline-flex items-center gap-2 font-display text-base font-semibold text-ink lg:hidden">
            <img src="/logo.png" alt="" className="size-7 rounded-lg object-cover ring-1 ring-line" />
            Treats by Kit
          </span>
          <span className="hidden lg:inline">Accounting, inventory, and production</span>
        </p>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2">
          {profile?.role === 'cashier' ? null : (
          <div className="relative" ref={panel}>
          <button
            type="button"
            className="relative inline-flex size-9 items-center justify-center rounded-lg text-ink hover:bg-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            <Bell className="size-5" />
            {unread > 0 ? (
              <span className="absolute -top-1 -right-1 inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white">
                {unread > 99 ? '99+' : unread}
              </span>
            ) : null}
          </button>
          {open ? (
            <div className="absolute right-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-white p-3 shadow-lg">
              <p className="px-1 text-sm font-medium text-ink">Notifications</p>
              {latest.length === 0 ? <p className="px-1 py-3 text-sm text-muted">You're caught up.</p> : (
                <ul className="mt-2 space-y-2">
                  {latest.map((note) => (
                    <li key={note.key}>
                      <Link
                        to={note.href}
                        className="block rounded-xl px-2 py-2 hover:bg-sand"
                        onClick={() => {
                          markRead(note.key)
                          setOpen(false)
                        }}
                      >
                        <Badge tone={TONES[note.severity] || 'neutral'}>{note.severity}</Badge>
                        <p className="mt-1 text-sm text-ink">{note.message}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <Link to="/notifications" className="mt-2 block px-2 text-sm font-medium text-accent hover:underline" onClick={() => setOpen(false)}>
                View all
              </Link>
            </div>
          ) : null}
        </div>
          )}
          <button type="button" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-muted hover:bg-sand hover:text-ink" onClick={() => signOut()}>
            <LogOut className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
        <time dateTime={iso} className="shrink-0 text-sm text-muted">
          <span className="sm:hidden">{shortDate}</span>
          <span className="hidden sm:inline">{fullDate}</span>
        </time>
      </div>
    </header>
  )
}
