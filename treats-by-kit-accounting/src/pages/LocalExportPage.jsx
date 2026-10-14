import { COLLECTIONS } from '../data/seed'
import { STORAGE_PREFIX } from '../data/storage'
import Button from '../components/ui/Button'

const NAMES = Object.values(COLLECTIONS)

export default function LocalExportPage() {
  function download() {
    const data = {}
    for (const name of NAMES) {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${name}`)
      data[name] = raw ? JSON.parse(raw) : []
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'treats-by-kit-local-data.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6">
      <h1 className="font-display text-3xl font-semibold text-ink">Export local data</h1>
      <p className="mt-3 text-sm leading-6 text-muted">
        This downloads the collections still stored in this browser. It does not upload them. Keep the file if you entered real records before the database move.
      </p>
      <Button className="mt-6 w-fit" onClick={download}>Download JSON</Button>
    </main>
  )
}
