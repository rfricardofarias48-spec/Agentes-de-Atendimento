import { type ReactNode, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Users, LogOut, Menu, X, Settings, DollarSign, ShoppingCart } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { cn } from '../../lib/utils'

const navItems = [
  { href: '/admin',          label: 'Visão Geral',   icon: LayoutDashboard },
  { href: '/admin/clients',  label: 'Usuários',      icon: Users },
  { href: '/admin/sales',    label: 'Vendas',        icon: ShoppingCart },
  { href: '/admin/billing',  label: 'Faturamento',   icon: DollarSign },
  { href: '/admin/settings', label: 'Configurações', icon: Settings },
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
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-50 w-[216px] flex flex-col',
        'transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full',
      )}
      style={{ background: '#ffffff', borderRight: '1px solid #e4e7ec' }}
    >
      {/* Logo */}
      <div className="px-5 py-4" style={{ borderBottom: '1px solid #e4e7ec' }}>
        <img
          src="https://ik.imagekit.io/xsbrdnr0y/Elevva_logo_white_blue_202605221006.png"
          alt="Gestor"
          className="h-9 w-auto object-contain"
        />
        <p className="text-[10px] font-medium mt-1.5 uppercase tracking-widest" style={{ color: '#2C82B5' }}>
          Admin Panel
        </p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = location.pathname === href
            || (href !== '/admin' && location.pathname.startsWith(href))
          return (
            <Link
              key={href}
              to={href}
              onClick={() => setOpen(false)}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150',
                active
                  ? 'text-brand-700 bg-brand-50'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50',
              )}
            >
              <Icon className={cn('w-4 h-4 shrink-0', active ? 'text-brand-600' : 'text-slate-400')} />
              {label}
              {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />}
            </Link>
          )
        })}
      </nav>

      {/* Logout */}
      <div className="px-3 py-4" style={{ borderTop: '1px solid #e4e7ec' }}>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-[13px] font-medium text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all duration-150"
        >
          <LogOut className="w-4 h-4 shrink-0" />
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
          className="fixed inset-0 z-40 lg:hidden bg-black/30 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header */}
        <header
          className="lg:hidden flex items-center gap-3 px-4 py-3"
          style={{ background: '#ffffff', borderBottom: '1px solid #e4e7ec' }}
        >
          <button
            onClick={() => setOpen(v => !v)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            {open ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
          <img src="https://ik.imagekit.io/xsbrdnr0y/Elevva_logo_white_blue_202605221006.png" alt="Gestor" className="h-7 w-auto object-contain" />
        </header>

        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
