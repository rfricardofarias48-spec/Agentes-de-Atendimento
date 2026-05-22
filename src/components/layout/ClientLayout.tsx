import { type ReactNode, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Calendar, CreditCard, Settings, LogOut,
  Briefcase, Menu, X,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { cn } from '../../lib/utils'

const SIDEBAR_BG = '#0f172a'

const navItems = [
  { href: '/dashboard',               label: 'Visão Geral',      icon: LayoutDashboard },
  { href: '/dashboard/vagas',         label: 'Minhas Vagas',     icon: Briefcase },
  { href: '/dashboard/appointments',  label: 'Agenda',           icon: Calendar },
  { href: '/dashboard/payments',      label: 'Minha Assinatura', icon: CreditCard },
  { href: '/dashboard/settings',      label: 'Configurações',    icon: Settings },
]

interface ClientLayoutProps { children: ReactNode }

export default function ClientLayout({ children }: ClientLayoutProps) {
  const { signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleSignOut() { await signOut(); navigate('/login') }


  const SidebarContent = ({ onNavClick }: { onNavClick?: () => void }) => (
    <>
      {/* Logo */}
      <div className="flex justify-center px-4 pt-2 pb-1 shrink-0">
        <img
          src="https://ik.imagekit.io/xsbrdnr0y/Elevva_logo_white_blue_202605221006.png"
          alt="Gestor"
          className="h-24 w-auto object-contain"
        />
      </div>

      {/* Divider */}
      <div className="mx-5 h-px mb-2 shrink-0" style={{ background: 'rgba(255,255,255,0.07)' }} />

      {/* Nav label */}
      <p className="px-5 mb-2 text-[9px] font-black uppercase tracking-[0.18em] shrink-0" style={{ color: 'rgba(148,163,184,0.4)' }}>
        Menu
      </p>

      {/* Nav items */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-hidden">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = location.pathname === href
          return (
            <Link
              key={href}
              to={href}
              onClick={onNavClick}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] font-semibold transition-all duration-150',
                active
                  ? 'text-white shadow-[0_4px_14px_rgba(44,130,181,0.35)]'
                  : 'hover:bg-white/[0.06]',
              )}
              style={
                active
                  ? { background: 'linear-gradient(135deg, #2C82B5, #2570a0)', color: 'white' }
                  : { color: 'rgba(148,163,184,0.75)' }
              }
            >
              <Icon className="w-4 h-4 shrink-0" style={{ opacity: active ? 1 : 0.6 }} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Sign out */}
      <div className="p-3 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-[15px] font-semibold transition-all duration-150 hover:bg-white/[0.06]"
          style={{ color: 'rgba(148,163,184,0.55)' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(148,163,184,0.55)')}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Sair
        </button>
      </div>

    </>
  )

  return (
    <div className="flex h-screen" style={{ background: '#f0f4f8' }}>

      {/* ── Desktop sidebar ──────────────────────────────────────────── */}
      <aside
        className="hidden lg:flex flex-col w-44 shrink-0"
        style={{ background: SIDEBAR_BG }}
      >
        <SidebarContent />
      </aside>

      {/* ── Mobile sidebar overlay ───────────────────────────────────── */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setMobileOpen(false)} />
          <aside
            className="fixed inset-y-0 left-0 z-40 lg:hidden w-44 flex flex-col shadow-2xl"
            style={{ background: SIDEBAR_BG }}
          >
            <SidebarContent onNavClick={() => setMobileOpen(false)} />
          </aside>
        </>
      )}

      {/* ── Main area ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0">

        {/* Mobile top bar */}
        <div
          className="lg:hidden shrink-0 flex items-center justify-between px-4 h-12 z-20"
          style={{ background: SIDEBAR_BG }}
        >
          <button
            onClick={() => setMobileOpen(v => !v)}
            className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors"
            style={{ background: 'rgba(255,255,255,0.08)' }}
          >
            {mobileOpen ? <X className="w-4 h-4 text-white" /> : <Menu className="w-4 h-4 text-white" />}
          </button>
          <img
            src="https://ik.imagekit.io/xsbrdnr0y/Elevva_logo_white_blue_202605221006.png"
            alt="Gestor"
            className="h-7 w-auto object-contain"
          />
        </div>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6 min-w-0">
          {children}
        </main>
      </div>
    </div>
  )
}
