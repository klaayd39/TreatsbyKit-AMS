import { useEffect, useState } from 'react'
import { getIntegrityReport } from '../accounting/accounts'
import { dismissNotification, markNotificationsRead, reconcileNotificationState, setNotificationRead } from '../data/notifications'
import { getLockDate } from '../data/journal'
import { COLLECTIONS } from '../data/seed'
import { getAll, subscribe } from '../data/storage'
import { buildNotifications, presentNotifications } from '../reports/notifications'
import { todayISODate } from '../utils/format'
import { useRefresh } from './useRefresh'

function snapshot(today) {
  return {
    today,
    items: getAll(COLLECTIONS.ITEMS),
    movements: getAll(COLLECTIONS.STOCK_MOVEMENTS),
    invoices: getAll(COLLECTIONS.PURCHASE_INVOICES),
    receipts: getAll(COLLECTIONS.RECEIVING_RECORDS),
    supplierPayments: getAll(COLLECTIONS.SUPPLIER_PAYMENTS),
    expenses: getAll(COLLECTIONS.EXPENSES),
    sales: getAll(COLLECTIONS.SALES),
    payments: getAll(COLLECTIONS.PAYMENTS),
    customers: getAll(COLLECTIONS.CUSTOMERS),
    suppliers: getAll(COLLECTIONS.SUPPLIERS),
    orders: getAll(COLLECTIONS.ORDERS),
    checks: getIntegrityReport(),
    lockDate: getLockDate(),
  }
}

export function useNotifications() {
  const [, refresh] = useRefresh()
  const [today] = useState(() => todayISODate())
  const built = buildNotifications(snapshot(today))
  const notifications = presentNotifications(built, getAll(COLLECTIONS.NOTIFICATION_STATE))
  const signature = built.map((note) => note.key).sort().join('|')

  useEffect(() => subscribe(refresh), [refresh])

  useEffect(() => {
    let cancelled = false
    reconcileNotificationState(built).then((changed) => {
      if (!cancelled && changed) refresh()
    })
    return () => {
      cancelled = true
    }
  }, [built, signature, refresh])

  return {
    notifications,
    unread: notifications.filter((note) => !note.read).length,
    markRead(key) {
      setNotificationRead(key).then(refresh)
    },
    markAllRead() {
      markNotificationsRead(notifications.filter((note) => !note.read).map((note) => note.key)).then(refresh)
    },
    dismiss(key) {
      dismissNotification(key).then(refresh)
    },
  }
}
