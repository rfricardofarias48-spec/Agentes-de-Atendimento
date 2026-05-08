import { type ReactNode, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Users, LogOut, Menu, X, Bot, Settings, DollarSign } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { cn } from '../../lib/utils'

const navItems = [
  { href: '/admin',          label: 'Visão Geral',    icon: LayoutDashboard },
  { href: '/admin/clients',  label: 'Usuários',       icon: Users },
  { href: '/admin/billing',  label: 'Faturamento',    icon: DollarSign },
  { href: '/admin/settings', label: 'Configurações',  icon: Settings },
]

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { signOut } = useAuth()
  const location   = useLocation()
  const navigate   = useNavigate()
  const [open, setOpen] = useState(false)

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const Sidebar = () => (
    <aside className={cn(
      'fixed inset-y-0 left-0 z-50 w-[218px] flex flex-col',
      'transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0',
      open ? 'translate-x-0' : '-translate-x-full',
    )} style={{ background: '#05060b', borderRight: '1px solid rgba(255,255,255,0.05)' }}>

      {/* Logo */}
      <div className="px-5 py-6" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: 'linear-gradient(135deg,#10b981 0%,#059669 100%)',
              boxShadow: '0 0 14px rgba(16,185,129,0.4)',
            }}>
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-display font-bold text-white text-[13.5px] tracking-tight leading-none">
              AgenteClin
            </p>
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] mt-[5px]"
              style={{ color: '#10b981' }}>
              Admin Panel
            </p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 pt-4 pb-2 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = location.pathname === href
            || (href !== '/admin' && location.pathname.startsWith(href))
          return (
            <Link
              key={href}
              to={href}
              onClick={() => setOpen(false)}
              className={cn(
                'group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-150 font-body',
                active
                  ? 'text-emerald-300'
                  : 'text-slate-500 hover:text-slate-200',
              )}
              style={active ? {
                background: 'rgba(16,185,129,0.09)',
                border: '1px solid rgba(16,185,129,0.12)',
              } : {
                border: '1px solid transparent',
              }}
            >
              <Icon className={cn(
                'w-4 h-4 shrink-0 transition-colors',
                active ? 'text-emerald-400' : 'text-slate-600 group-hover:text-slate-300',
              )} />
              {label}
              {active && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400"
                  style={{ boxShadow: '0 0 7px rgba(52,211,153,0.9)' }} />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Divider + Logout */}
      <div className="px-3 pb-5 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <button
          onClick={handleSignOut}
          className="group flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-[13px] font-medium font-body text-slate-600 hover:text-red-400 transition-all duration-150"
          style={{ border: '1px solid transparent' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.06)'; (e.currentTarget as HTMLElement).style.border = '1px solid rgba(239,68,68,0.1)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.border = '1px solid transparent' }}
        >
          <LogOut className="w-4 h-4 shrink-0 transition-colors group-hover:text-red-400" />
          Sair
        </button>
      </div>
    </aside>
  )

  return (
    <div className="flex h-screen" style={{ background: 'var(--c-bg)' }}>
      <Sidebar />

      {open && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
          onClick={() => setOpen(false)}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3"
          style={{ background: '#05060b', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <button
            onClick={() => setOpen(v => !v)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-white transition-colors"
            style={{ border: '1px solid rgba(255,255,255,0.07)' }}
          >
            {open ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
          <span className="font-display font-bold text-white text-sm">AgenteClin</span>
        </header>

        <main className="flex-1 overflow-y-auto p-6 lg:p-8 dot-grid">
          {children}
        </main>
      </div>
    </div>
  )
}
