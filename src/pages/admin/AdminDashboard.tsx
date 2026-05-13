import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, ArrowRight, Plus, TrendingUp, MessageSquare, BarChart3 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { type Organization } from '../../types'
import { TZ } from '../../lib/date'
import { planLabel, statusLabel, formatDateShort } from '../../lib/utils'

const planBadge: Record<string, string> = {
  starter: 'bg-slate-100 text-slate-600',
  pro:     'bg-blue-50 text-blue-600',
  clinic:  'bg-brand-50 text-brand-700',
}
const statusBadge: Record<string, string> = {
  active:    'bg-brand-50 text-brand-700',
  trial:     'bg-amber-50 text-amber-700',
  inactive:  'bg-slate-100 text-slate-500',
  suspended: 'bg-red-50 text-red-600',
}
const PLAN_MRR: Record<string, number> = { starter: 299.90, pro: 449.90, clinic: 849.90 }

const CARD: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e4e7ec',
  borderRadius: '1rem',
  boxShadow: '0 1px 3px rgba(16,24,40,0.06)',
}

export default function AdminDashboard() {
  const [orgs, setOrgs]       = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('organizations').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setOrgs(data ?? []); setLoading(false) })
  }, [])

  const activeOrgs   = orgs.filter(o => o.status === 'active')
  const mrr          = activeOrgs.reduce((s, o) => s + (PLAN_MRR[o.plan] ?? 0), 0)
  const totalConvs   = orgs.reduce((s, o) => s + (o.conversations_used ?? 0), 0)
  const starterCount = orgs.filter(o => o.plan === 'starter').length
  const proCount     = orgs.filter(o => o.plan === 'pro').length
  const clinicCount  = orgs.filter(o => o.plan === 'clinic').length

  return (
    <div className="space-y-6 animate-fade-up pb-8">

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#101828' }}>
            Visão Geral
          </h1>
          <p className="text-sm mt-1 capitalize" style={{ color: '#98a2b3' }}>
            {new Date().toLocaleDateString('pt-BR', { timeZone: TZ, weekday:'long', day:'numeric', month:'long', year:'numeric' })}
          </p>
        </div>
        <Link to="/admin/clients/new">
          <button className="btn-primary flex items-center gap-2 px-4 py-2.5 text-sm">
            <Plus className="w-4 h-4" />
            Novo Usuário
          </button>
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger">

        {/* MRR */}
        <div
          className="col-span-2 lg:col-span-1 relative overflow-hidden rounded-2xl p-6 animate-fade-up"
          style={{
            background: 'linear-gradient(135deg,#164a6a 0%,#1e5f88 100%)',
            border: '1px solid #2570a0',
            boxShadow: '0 4px 16px rgba(44,130,181,0.25)',
          }}
        >
          <div className="absolute -top-6 -right-6 w-28 h-28 rounded-full pointer-events-none opacity-20"
            style={{ background: 'radial-gradient(circle,#ffffff 0%,transparent 70%)' }} />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-3.5 h-3.5 text-brand-200" />
              <p className="text-[10px] font-bold text-brand-200 uppercase tracking-widest">MRR Estimado</p>
            </div>
            <p className="text-[1.75rem] font-bold text-white leading-none">
              R$ {mrr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            <div className="mt-3 pt-3 flex items-center justify-between"
              style={{ borderTop: '1px solid rgba(255,255,255,0.15)' }}>
              <span className="text-[10px] text-brand-300 font-semibold uppercase">ARR</span>
              <span className="text-sm font-bold text-white">R$ {(mrr * 12 / 1000).toFixed(1)}k</span>
            </div>
          </div>
        </div>

        {/* Ativos */}
        <div className="rounded-2xl p-6 flex flex-col justify-between animate-fade-up" style={CARD}>
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#98a2b3' }}>Ativos</p>
            <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center">
              <Users className="w-3.5 h-3.5 text-slate-400" />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-[2.1rem] font-bold leading-none" style={{ color: '#101828' }}>{activeOrgs.length}</p>
            <p className="text-xs mt-1.5 font-medium" style={{ color: '#98a2b3' }}>{orgs.length} total</p>
          </div>
        </div>

        {/* Conversas */}
        <div className="rounded-2xl p-6 flex flex-col justify-between animate-fade-up" style={CARD}>
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#98a2b3' }}>Conversas</p>
            <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center">
              <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-[2.1rem] font-bold leading-none" style={{ color: '#101828' }}>{totalConvs.toLocaleString('pt-BR')}</p>
            <p className="text-xs mt-1.5 font-medium" style={{ color: '#98a2b3' }}>este mês</p>
          </div>
        </div>

        {/* Planos */}
        <div className="rounded-2xl p-6 flex flex-col justify-between animate-fade-up" style={CARD}>
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#98a2b3' }}>Planos</p>
            <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center">
              <BarChart3 className="w-3.5 h-3.5 text-slate-400" />
            </div>
          </div>
          <div className="mt-4 space-y-2.5">
            {[
              { label: 'Essencial', count: starterCount, color: '#94a3b8' },
              { label: 'Pro',     count: proCount,     color: '#3b82f6' },
              { label: 'Max',     count: clinicCount,  color: '#2C82B5' },
            ].map(({ label, count, color }) => (
              <div key={label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                  <span className="text-xs" style={{ color: '#667085' }}>{label}</span>
                </div>
                <span className="text-xs font-semibold tabular-nums" style={{ color: '#344054' }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-2xl overflow-hidden animate-fade-up" style={CARD}>
        <div
          className="px-6 py-5 flex items-center justify-between"
          style={{ borderBottom: '1px solid #f2f4f7' }}
        >
          <div>
            <p className="font-semibold text-[15px]" style={{ color: '#101828' }}>Usuários Recentes</p>
            <p className="text-xs mt-0.5" style={{ color: '#98a2b3' }}>{orgs.length} cadastrados</p>
          </div>
          <Link to="/admin/clients">
            <button className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors">
              Ver todos <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-14">
            <div className="w-5 h-5 border-2 border-slate-200 border-t-brand-500 rounded-full animate-spin" />
          </div>
        ) : orgs.length === 0 ? (
          <div className="text-center py-14">
            <Users className="w-9 h-9 mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-medium text-slate-400">Nenhum usuário ainda</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid #f2f4f7' }}>
                  {['Clínica','Plano','Status','Conversas','Cadastro',''].map(h => (
                    <th key={h} className="text-left py-3 px-5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#98a2b3' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orgs.slice(0, 8).map(org => (
                  <tr
                    key={org.id}
                    className="transition-colors duration-100 cursor-default"
                    style={{ borderBottom: '1px solid #f9fafb' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td className="py-3.5 px-5">
                      <p className="text-sm font-semibold" style={{ color: '#344054' }}>{org.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: '#98a2b3' }}>{org.evolution_instance || org.slug}</p>
                    </td>
                    <td className="py-3.5 px-5">
                      <span className={`inline-flex items-center px-2.5 py-[3px] rounded-full text-[10px] font-semibold uppercase ${planBadge[org.plan] ?? 'bg-slate-100 text-slate-500'}`}>
                        {planLabel(org.plan)}
                      </span>
                    </td>
                    <td className="py-3.5 px-5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-[3px] rounded-full text-[10px] font-semibold ${statusBadge[org.status] ?? 'bg-slate-100 text-slate-500'}`}>
                        {org.status === 'active' && <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />}
                        {statusLabel(org.status)}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-xs tabular-nums" style={{ color: '#667085' }}>
                      <span className={((org.conversations_used ?? 0) / (org.max_conversations_month || 1)) > 0.8 ? 'text-red-500 font-semibold' : ''}>
                        {org.conversations_used ?? 0}
                      </span>
                      <span style={{ color: '#d0d5dd' }}>/{org.max_conversations_month}</span>
                    </td>
                    <td className="py-3.5 px-5 text-xs" style={{ color: '#98a2b3' }}>{formatDateShort(org.created_at)}</td>
                    <td className="py-3.5 px-5">
                      <Link to={`/admin/clients/${org.id}`}>
                        <button className="text-xs font-semibold text-slate-400 hover:text-brand-600 transition-colors">
                          Detalhes →
                        </button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
