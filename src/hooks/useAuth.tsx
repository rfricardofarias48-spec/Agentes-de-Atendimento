import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { type Session, type User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthContextType {
  session: Session | null
  user: User | null
  role: 'admin' | 'client' | null
  orgId: string | null
  loading: boolean
  noProfile: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<'admin' | 'client' | null>(null)
  const [orgId, setOrgId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [noProfile, setNoProfile] = useState(false)

  async function loadUserProfile(userId: string) {
    const { data } = await supabase
      .from('user_profiles')
      .select('role, org_id')
      .eq('user_id', userId)
      .single()

    if (data) {
      setRole(data.role)
      setOrgId(data.org_id)
      setNoProfile(false)
    } else {
      setRole(null)
      setOrgId(null)
      setNoProfile(true)
    }
  }

  useEffect(() => {
    let initialDone = false

    // Registrar listener ANTES do getSession para não perder eventos PKCE
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session?.user) {
        loadUserProfile(session.user.id).finally(() => {
          if (!initialDone) { initialDone = true; setLoading(false) }
        })
      } else {
        setRole(null); setOrgId(null); setNoProfile(false)
        if (!initialDone) { initialDone = true; setLoading(false) }
      }
    })

    // Fallback: caso onAuthStateChange não dispare (sessão já existente no storage)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!initialDone && !session) {
        initialDone = true
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setRole(null)
    setOrgId(null)
  }

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      role,
      orgId,
      loading,
      noProfile,
      signIn,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
