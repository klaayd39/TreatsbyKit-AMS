import { useCallback, useState } from 'react'

export function useRefresh() {
  const [version, setVersion] = useState(0)
  const refresh = useCallback(() => setVersion((current) => current + 1), [])
  return [version, refresh]
}
