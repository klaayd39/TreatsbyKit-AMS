import { useEffect, useMemo, useState } from 'react'
import { setSessionRole } from './session'
import { AuthContext } from './useAuth'
import { hydrate, setActiveRole } from '../data/storage'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase'

export default function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) {
      setReady(true)
      return undefined
    }
    let ignore = false
    supabase.auth.getSession().then(({ data }) => {
      if (!ignore) setSession(data.session)
    })
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => {
      ignore = true
      subscription.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) return undefined
    if (!session) {
      setProfile(null)
      setActiveRole('viewer')
      setSessionRole('viewer')
      setReady(true)
      return undefined
    }
    let ignore = false
    setReady(false)
    supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle().then(async ({ data, error: profileError }) => {
      if (ignore) return
      if (profileError) {
        setError(profileError.message)
        setReady(true)
        return
      }
      const next = data
        ? {
            id: data.id,
            fullName: data.full_name,
            email: data.email,
            role: data.role,
            active: data.active,
          }
        : null
      setProfile(next)
      const role = next?.active ? next.role : 'viewer'
      setActiveRole(role)
      setSessionRole(role)
      if (next?.active) {
        try {
          await hydrate(next.role)
          setError('')
        } catch (loadError) {
          setError(loadError.message || 'The books could not be loaded.')
        }
      }
      setReady(true)
    })
    return () => {
      ignore = true
    }
  }, [session])

  const value = useMemo(() => ({
    configured: isSupabaseConfigured(),
    session,
    profile,
    ready,
    error,
    async signIn(email, password) {
      const supabase = getSupabase()
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) throw signInError
    },
    async signOut() {
      await getSupabase().auth.signOut()
    },
  }), [session, profile, ready, error])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
