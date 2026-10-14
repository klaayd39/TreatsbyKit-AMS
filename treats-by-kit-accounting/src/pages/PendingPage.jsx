import { useAuth } from '../auth/useAuth'
import Button from '../components/ui/Button'

export default function PendingPage() {
  const { profile, signOut } = useAuth()
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6">
      <h1 className="font-display text-3xl font-semibold text-ink">Account pending approval</h1>
      <p className="mt-3 text-sm leading-6 text-muted">
        {profile?.email || 'This account'} can sign in, but an owner has to activate it and choose a role before the books will open.
      </p>
      <Button className="mt-6 w-fit" variant="secondary" onClick={() => signOut()}>Sign out</Button>
    </main>
  )
}
