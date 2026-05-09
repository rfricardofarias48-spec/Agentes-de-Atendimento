import { type ReactNode, useState, useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Calendar, CreditCard, Settings, LogOut,
  Bot, ChevronRight, Menu, X, UserCircle2,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { planLabel } from '../../lib/utils'
import { cn } from '../../lib/utils'

const navItems = [
  { href: '/dashboard',              label: 'Visão Geral',      icon: LayoutDashboard },
  { href: '/dashboard/appointments', label: 'Agenda',           icon: Calendar },
  { href: '/dashboard/training',     label: 'Bento',            icon: Bot },
  { href: '/dashboard/payments',     label: 'Minha Assinatura', icon: CreditCard },
  { href: '/dashboard/settings',     label: 'Configurações',    icon: Settings },
]

interface ClientLayoutProps {
  children: ReactNode
  orgName?: string
  chatwootUrl?: string | null
}

export default function ClientLayout({ children }: ClientLayoutProps) {
  const { signOut, orgId } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)

  const [orgName, setOrgName] = useState<string>('')
  const [orgPlan, setOrgPlan] = useState<string>('')

  useEffect(() => {
    if (!orgId) return
    supabase.from('organizations').select('name,plan').eq('id', orgId).single()
      .then(({ data }) => {
        if (data) { setOrgName(data.name); setOrgPlan(data.plan) }
      })
  }, [orgId])

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const orgInitial = orgName.charAt(0).toUpperCase() || 'C'

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="flex flex-col h-screen bg-[#f8f9fb]">

      {/* ── Top bar ──────────────────────────────────────────────── */}
      <header
        className="shrink-0 flex items-center justify-between px-4 h-14 z-40 shadow-[0_2px_12px_rgba(5,150,105,0.18)]"
        style={{ background: 'linear-gradient(90deg, #059669 0%, #047857 100%)' }}
      >
        {/* Left: hamburger (mobile) + logo only */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileOpen(v => !v)}
            className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
          >
            {mobileOpen ? <X className="w-4 h-4 text-white" /> : <Menu className="w-4 h-4 text-white" />}
          </button>
          <div className="w-8 h-8 bg-white/15 rounded-xl flex items-center justify-center border border-white/20">
            <Bot className="w-4 h-4 text-white" />
          </div>
        </div>

        {/* Right: profile dropdown */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setProfileOpen(v => !v)}
            className="w-8 h-8 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center text-white text-xs font-black hover:bg-white/30 transition-colors"
          >
            {orgInitial || <UserCircle2 className="w-4 h-4" />}
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-10 w-52 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-50 animate-fade-up">
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-sm font-bold text-slate-800 truncate">{orgName || 'Minha Clínica'}</p>
                <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">
                  {planLabel(orgPlan) || 'Essencial'}
                </span>
              </div>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2 w-full px-4 py-3 text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-red-500 transition-colors"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                Sair
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── Body (sidebar + content) ──────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* ── Desktop collapsible sidebar ──────────────────────────── */}
        <aside
          className={cn(
            'hidden lg:flex flex-col shrink-0 bg-white border-r border-slate-100 transition-all duration-300 ease-in-out',
            'shadow-[2px_0_12px_rgba(0,0,0,0.04)]',
            expanded ? 'w-52' : 'w-[68px]',
          )}
        >
          {/* Toggle button */}
          <button
            onClick={() => setExpanded(v => !v)}
            className={cn(
              'flex items-center h-12 px-4 border-b border-slate-100 text-slate-400',
              'hover:text-emerald-600 transition-colors duration-150',
              expanded ? 'justify-end' : 'justify-center',
            )}
          >
            <ChevronRight className={cn(
              'w-4 h-4 transition-transform duration-300',
              expanded && 'rotate-180',
            )} />
          </button>

          {/* Nav items */}
          <nav className="flex-1 py-4 space-y-1 px-2 overflow-hidden">
            {navItems.map(({ href, label, icon: Icon }) => {
              const active = location.pathname === href
              return (
                <Link
                  key={href}
                  to={href}
                  title={!expanded ? label : undefined}
                  className={cn(
                    'flex items-center rounded-xl transition-all duration-150 overflow-hidden',
                    expanded ? 'gap-3 px-3 py-2.5' : 'justify-center p-3',
                    active
                      ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-200'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900',
                  )}
                >
                  <Icon className={cn(
                    'shrink-0 transition-colors',
                    expanded ? 'w-4 h-4' : 'w-5 h-5',
                    active ? 'text-emerald-100' : 'text-slate-400',
                  )} />
                  {expanded && (
                    <span className="text-[0.875rem] font-bold whitespace-nowrap">{label}</span>
                  )}
                </Link>
              )
            })}
          </nav>

          {/* Sign out */}
          <div className="py-3 px-2 border-t border-slate-100">
            <button
              onClick={handleSignOut}
              title={!expanded ? 'Sair' : undefined}
              className={cn(
                'flex items-center w-full rounded-xl text-slate-400 hover:bg-slate-50 hover:text-red-500 transition-all duration-150',
                expanded ? 'gap-3 px-3 py-2.5' : 'justify-center p-3',
              )}
            >
              <LogOut className={cn('shrink-0', expanded ? 'w-4 h-4' : 'w-5 h-5')} />
              {expanded && <span className="text-[0.875rem] font-bold whitespace-nowrap">Sair</span>}
            </button>
          </div>
        </aside>

        {/* ── Mobile sidebar overlay ───────────────────────────────── */}
        {mobileOpen && (
          <>
            <div
              className="fixed inset-0 z-30 bg-black/40 lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="fixed inset-y-0 left-0 z-40 lg:hidden w-52 flex flex-col bg-white shadow-2xl">
              <div
                className="flex items-center gap-2.5 px-4 h-14 shrink-0"
                style={{ background: 'linear-gradient(90deg, #059669 0%, #047857 100%)' }}
              >
                <div className="w-8 h-8 bg-white/15 rounded-xl flex items-center justify-center border border-white/20">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-emerald-200 uppercase tracking-widest leading-none">AgenteClin</p>
                  <p className="text-sm font-black text-white truncate max-w-[140px] mt-0.5">{orgName ?? 'Minha Clínica'}</p>
                </div>
              </div>
              <nav className="flex-1 py-4 space-y-1 px-2">
                {navItems.map(({ href, label, icon: Icon }) => {
                  const active = location.pathname === href
                  return (
                    <Link
                      key={href}
                      to={href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-xl text-[0.875rem] font-bold transition-all duration-150',
                        active
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900',
                      )}
                    >
                      <Icon className={cn('w-4 h-4 shrink-0', active ? 'text-emerald-100' : 'text-slate-400')} />
                      {label}
                    </Link>
                  )
                })}
              </nav>
              <div className="py-3 px-2 border-t border-slate-100">
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-bold text-slate-400 hover:bg-slate-50 hover:text-red-500 transition-all duration-150"
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                  Sair
                </button>
              </div>
            </aside>
          </>
        )}

        {/* ── Main content ─────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto p-6 min-w-0">
          {children}
        </main>
      </div>
    </div>
  )
}
