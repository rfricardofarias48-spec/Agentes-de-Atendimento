import { type ReactNode, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'

interface ProtectedRouteProps {
  children: ReactNode
  requiredRole?: 'admin' | 'client'
  /** Permite acesso mesmo com a assinatura da org suspensa (ex.: tela de pagamento). */
  allowWhenSuspended?: boolean
}

export default function ProtectedRoute({ children, requiredRole, allowWhenSuspended }: ProtectedRouteProps) {
  const { session, role, orgId, loading } = useAuth()
  const [orgStatus, setOrgStatus] = useState<string | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)

  useEffect(() => {
    if (role !== 'client' || !orgId) { setStatusLoading(false); return }
    let active = true
    supabase.from('organizations').select('status').eq('id', orgId).single().then(({ data }) => {
      if (active) { setOrgStatus(data?.status ?? null); setStatusLoading(false) }
    })
    return () => { active = false }
  }, [role, orgId])

  if (loading || (role === 'client' && statusLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--c-bg)' }}>
        <div className="w-6 h-6 border-2 border-slate-200 border-t-brand-500 rounded-full animate-spin" />
      </div>
    )
  }

  // Sem sessão → login
  if (!session) return <Navigate to="/login" replace />

  // Sessão existe mas sem perfil vinculado → volta ao login com aviso
  if (!role) return <Navigate to="/login" replace />

  // Role errada → redireciona para a área correta
  if (requiredRole && role !== requiredRole) {
    return <Navigate to={role === 'admin' ? '/admin' : '/dashboard'} replace />
  }

  // Assinatura suspensa (pagamento em atraso) → só a tela de pagamento fica acessível
  if (role === 'client' && orgStatus === 'suspended' && !allowWhenSuspended) {
    return <Navigate to="/dashboard/payments" replace />
  }

  return <>{children}</>
}
