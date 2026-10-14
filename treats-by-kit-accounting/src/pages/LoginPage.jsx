import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { homeForRole } from '../auth/permissions'
import Button from '../components/ui/Button'
import Field, { controlClass } from '../components/ui/Field'

export default function LoginPage() {
  const { configured, session, profile, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  if (!configured) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6">
        <h1 className="font-display text-3xl font-semibold text-ink">Connect Supabase</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Copy <code>.env.example</code> to <code>.env.local</code> and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
          The service role key must not be added to this app.
        </p>
      </main>
    )
  }

  if (session && profile?.active) {
    return <Navigate to={location.state?.from || homeForRole(profile.role)} replace />
  }

  async function submit(event) {
    event.preventDefault()
    setPending(true)
    setError('')
    try {
      await signIn(email.trim(), password)
      navigate(location.state?.from || '/', { replace: true })
    } catch (signInError) {
      setError(signInError.message || 'Those details were not accepted.')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <p className="font-display text-sm font-semibold text-accent">Treats by Kit</p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-ink">Sign in</h1>
      <p className="mt-2 text-sm text-muted">Accounts are created by an owner in the Supabase dashboard. There is no public sign-up.</p>
      <form className="mt-6 space-y-4" onSubmit={submit}>
        <Field label="Email" htmlFor="email">
          <input id="email" type="email" autoComplete="username" className={controlClass} value={email} onChange={(event) => setEmail(event.target.value)} required />
        </Field>
        <Field label="Password" htmlFor="password">
          <input id="password" type="password" autoComplete="current-password" className={controlClass} value={password} onChange={(event) => setPassword(event.target.value)} required />
        </Field>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</Button>
      </form>
      <Link className="mt-6 text-sm text-accent" to="/local-export">Export data saved in this browser</Link>
    </main>
  )
}
