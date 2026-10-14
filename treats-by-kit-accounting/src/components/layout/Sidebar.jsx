import { ChevronDown, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { navigation } from '../../config/navigation'
import { canSeePath } from '../../auth/permissions'
import { useAuth } from '../../auth/useAuth'

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 1024px)').matches)

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)')
    const onChange = () => setIsDesktop(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  return isDesktop
}

export default function Sidebar({ mobileOpen, onClose }) {
  const isDesktop = useIsDesktop()
  const { profile } = useAuth()
  const visible = navigation
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canSeePath(profile?.role, item.path)),
    }))
    .filter((group) => group.items.length > 0)
  const [openGroups, setOpenGroups] = useState(() =>
    Object.fromEntries(visible.map((group) => [group.id, true])),
  )

  function toggleGroup(groupId) {
    setOpenGroups((current) => ({ ...current, [groupId]: !current[groupId] }))
  }

  return (
    <>
      {mobileOpen ? (
        <div className="fixed inset-0 z-30 bg-ink/40 lg:hidden" onClick={onClose} aria-hidden="true" />
      ) : null}
      <aside
        id="app-sidebar"
        inert={!isDesktop && !mobileOpen}
        aria-label="Primary"
        className={`fixed inset-y-0 left-0 z-40 flex h-dvh w-72 flex-col border-r border-line bg-sidebar shadow-xl transition-transform duration-200 ease-out print:hidden lg:shadow-none ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-line px-4">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="" className="size-10 rounded-xl object-cover ring-1 ring-line" />
            <span className="font-display text-[15px] leading-tight font-semibold text-ink">
              Treats by Kit
            </span>
          </div>
          <button
            type="button"
            className="inline-flex size-9 items-center justify-center rounded-lg text-ink hover:bg-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:hidden"
            aria-label="Close menu"
            onClick={onClose}
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto overscroll-contain px-3 py-4" aria-label="Modules">
          <div className="space-y-4">
            {visible.map((group) => {
              const open = openGroups[group.id]
              return (
                <div key={group.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[11px] font-semibold tracking-[0.16em] text-muted uppercase hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    aria-expanded={open}
                    aria-controls={`nav-group-${group.id}`}
                    onClick={() => toggleGroup(group.id)}
                  >
                    <span>{group.label}</span>
                    <ChevronDown
                      className={`size-3.5 transition-transform ${open ? 'rotate-0' : '-rotate-90'}`}
                      aria-hidden="true"
                    />
                  </button>
                  <ul id={`nav-group-${group.id}`} hidden={!open} className="mt-1 space-y-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon
                      return (
                        <li key={item.id}>
                          <NavLink
                            to={item.path}
                            end
                            onClick={onClose}
                            className={({ isActive }) =>
                              [
                                'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                                isActive
                                  ? 'bg-accent-soft font-medium text-accent'
                                  : 'text-ink hover:bg-sand',
                              ].join(' ')
                            }
                          >
                            <Icon className="size-4 shrink-0" aria-hidden="true" />
                            <span>{item.label}</span>
                          </NavLink>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            })}
          </div>
        </nav>
      </aside>
    </>
  )
}
