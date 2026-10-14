import { useEffect, useState } from 'react'

export default function ErrorToast() {
  const [message, setMessage] = useState('')

  useEffect(() => {
    function onError(event) {
      setMessage(event.detail || 'Something went wrong.')
    }
    window.addEventListener('tbk-error', onError)
    return () => window.removeEventListener('tbk-error', onError)
  }, [])

  useEffect(() => {
    if (!message) return undefined
    const timer = window.setTimeout(() => setMessage(''), 6000)
    return () => window.clearTimeout(timer)
  }, [message])

  if (!message) return null
  return (
    <div className="fixed right-4 bottom-4 z-50 max-w-sm rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink shadow-lg" role="status">
      {message}
    </div>
  )
}
