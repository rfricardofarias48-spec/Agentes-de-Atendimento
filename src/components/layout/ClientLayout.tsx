import { type ReactNode, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Calendar, CreditCard, Settings, LogOut, Menu, X, Bot
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { cn } from '../../lib/utils'

const navItems = [
  { href: '/dashboard',              label: 'Visão Geral',   icon: LayoutDashboard },
  { href: '/dashboard/appointments', label: 'Agendamentos',  icon: Calendar },
  { href: '/dashboard/training',     label: 'Bento',         icon: Bot },
  { href: '/dashboard/payments',     label: 'Minha Assinatura', icon: CreditCard },
  { href: '/dashboard/settings',     label: 'Configurações', icon: Settings },
]

interface ClientLayoutProps {
  children: ReactNode
  orgName?: string
  chatwootUrl?: string | null
}

export default function ClientLayout({ children, orgName }: ClientLayoutProps) {
  const { signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const Sidebar = () => (
    <aside className="flex flex-col h-full w-52 bg-white border-r border-slate-100">

      {/* Logo / brand */}
      <div className="flex items-center gap-3 px-5 py-7 border-b border-slate-100">
        <div className="w-8 h-8 bg-gray-900 rounded-xl flex items-center justify-center shadow-sm">
          <Bot className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">AgenteClin</p>
          <p className="text-sm font-black text-slate-900 truncate mt-0.5">{orgName ?? 'Minha Clínica'}</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 pt-7 pb-4 space-y-2">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = location.pathname === href
          return (
            <Link
              key={href}
              to={href}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-[0.875rem] font-bold transition-all duration-150',
                active
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              )}
            >
              <Icon className={cn('w-4 h-4 shrink-0', active ? 'text-emerald-400' : 'text-slate-400')} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Sign out */}
      <div className="p-3 border-t border-slate-100">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-all duration-150"
        >
          <LogOut className="w-4 h-4 text-slate-400 shrink-0" />
          Sair
        </button>
      </div>
    </aside>
  )

  return (
    <div className="flex h-screen bg-[#f8f9fb]">

      {/* Desktop sidebar */}
      <div className="hidden lg:flex shrink-0 shadow-[2px_0_12px_rgba(0,0,0,0.04)]">
        <Sidebar />
      </div>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />
          <div className="fixed inset-y-0 left-0 z-50 lg:hidden shadow-xl">
            <Sidebar />
          </div>
        </>
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header */}
        <header className="bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3 lg:hidden shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <button
            onClick={() => setSidebarOpen(v => !v)}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors"
          >
            {sidebarOpen ? <X className="w-4 h-4 text-slate-600" /> : <Menu className="w-4 h-4 text-slate-600" />}
          </button>
          <span className="font-black text-slate-900 tracking-tighter">{orgName ?? 'AgenteClin'}</span>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
