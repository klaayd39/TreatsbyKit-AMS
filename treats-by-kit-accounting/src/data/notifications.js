import { COLLECTIONS } from './seed'
import { add, getAll, getById, update } from './storage'

export async function reconcileNotificationState(notes) {
  const stored = getAll(COLLECTIONS.NOTIFICATION_STATE)
  const ids = new Set((notes || []).map((note) => note.key))
  let changed = false
  for (const note of notes || []) {
    const row = stored.find((entry) => entry.id === note.key)
    if (!row) {
      await add(COLLECTIONS.NOTIFICATION_STATE, {
        id: note.key,
        read: false,
        dismissed: false,
        active: true,
        detected: note.detected,
      })
      changed = true
    } else if (!row.active) {
      await update(COLLECTIONS.NOTIFICATION_STATE, row.id, {
        active: true,
        read: false,
        dismissed: false,
        detected: note.detected,
      })
      changed = true
    }
  }
  for (const row of getAll(COLLECTIONS.NOTIFICATION_STATE)) {
    if (!ids.has(row.id) && row.active) {
      await update(COLLECTIONS.NOTIFICATION_STATE, row.id, { active: false })
      changed = true
    }
  }
  return changed
}

export async function setNotificationRead(key) {
  const row = getById(COLLECTIONS.NOTIFICATION_STATE, key)
  if (!row) {
    await add(COLLECTIONS.NOTIFICATION_STATE, { id: key, read: true, dismissed: false, active: true, detected: '' })
    return
  }
  await update(COLLECTIONS.NOTIFICATION_STATE, key, { read: true })
}

export async function markNotificationsRead(keys) {
  for (const key of keys || []) await setNotificationRead(key)
}

export async function dismissNotification(key) {
  const row = getById(COLLECTIONS.NOTIFICATION_STATE, key)
  if (!row) {
    await add(COLLECTIONS.NOTIFICATION_STATE, { id: key, read: true, dismissed: true, active: true, detected: '' })
    return
  }
  await update(COLLECTIONS.NOTIFICATION_STATE, key, { read: true, dismissed: true, active: true })
}
