import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, ArrowRight, Plus, TrendingUp, MessageSquare, BarChart3 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { type Organization } from '../../types'
import { planLabel, statusLabel, formatDateShort } from '../../lib/utils'

const planBadge: Record<string, string> = {
  starter: 'bg-slate-800 text-slate-400',
  pro:     'bg-blue-500/[0.12] text-blue-400',
  clinic:  'bg-emerald-500/[0.12] text-emerald-400',
}
const statusBadge: Record<string, string> = {
  active:    'bg-emerald-500/[0.12] text-emerald-400',
  trial:     'bg-amber-500/[0.12] text-amber-400',
  inactive:  'bg-slate-800 text-slate-500',
  suspended: 'bg-red-500/[0.12] text-red-400',
}
const PLAN_MRR: Record<string, number> = { starter: 397, pro: 797, clinic: 1497 }

const S = {
  card: {
    background: '#0c0e1a',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '1.125rem',
  } as React.CSSProperties,
  row: {
    borderBottom: '1px solid rgba(255,255,255,0.03)',
  } as React.CSSProperties,
  th: 'text-left py-3 px-5 text-[10px] font-bold text-slate-600 uppercase tracking-widest font-body',
}

export default function AdminDashboard() {
  const [orgs, setOrgs]       = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('organizations').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setOrgs(data ?? []); setLoading(false) })
  }, [])

  const activeOrgs  = orgs.filter(o => o.status === 'active')
  const mrr         = activeOrgs.reduce((s, o) => s + (PLAN_MRR[o.plan] ?? 0), 0)
  const totalConvs  = orgs.reduce((s, o) => s + (o.conversations_used ?? 0), 0)
  const starterCount = orgs.filter(o => o.plan === 'starter').length
  const proCount    = orgs.filter(o => o.plan === 'pro').length
  const clinicCount = orgs.filter(o => o.plan === 'clinic').length

  return (
    <div className="space-y-7 animate-fade-up pb-8">

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-[2rem] font-bold text-white tracking-tight leading-none">
            Visão Geral
          </h1>
          <p className="text-slate-500 text-sm font-body mt-2 capitalize">
            {new Date().toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
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
          className="col-span-2 lg:col-span-1 relative overflow-hidden rounded-[1.125rem] p-6 animate-fade-up"
          style={{
            background: 'linear-gradient(135deg,#091f18 0%,#061610 100%)',
            border: '1px solid rgba(16,185,129,0.15)',
            boxShadow: '0 0 36px rgba(16,185,129,0.07)',
          }}
        >
          <div className="absolute -top-6 -right-6 w-28 h-28 rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.18) 0%, transparent 70%)' }} />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest font-body">MRR Estimado</p>
            </div>
            <p className="font-display text-[1.85rem] font-bold text-white leading-none">
              R$ {mrr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            <div className="mt-3 pt-3 flex items-center justify-between"
              style={{ borderTop: '1px solid rgba(16,185,129,0.1)' }}>
              <span className="text-[10px] text-emerald-800 font-bold uppercase font-body">ARR</span>
              <span className="text-sm font-bold text-emerald-400 font-body">
                R$ {(mrr * 12 / 1000).toFixed(1)}k
              </span>
            </div>
          </div>
        </div>

        {/* Ativos */}
        <div className="rounded-[1.125rem] p-6 flex flex-col justify-between animate-fade-up" style={S.card}>
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest font-body">Ativos</p>
            <Users className="w-3.5 h-3.5 text-slate-700" />
          </div>
          <div className="mt-4">
            <p className="font-display text-[2.2rem] font-bold text-white leading-none">{activeOrgs.length}</p>
            <p className="text-[11px] text-slate-600 font-body mt-1.5">{orgs.length} total</p>
          </div>
        </div>

        {/* Conversas */}
        <div className="rounded-[1.125rem] p-6 flex flex-col justify-between animate-fade-up" style={S.card}>
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest font-body">Conversas</p>
            <MessageSquare className="w-3.5 h-3.5 text-slate-700" />
          </div>
          <div className="mt-4">
            <p className="font-display text-[2.2rem] font-bold text-white leading-none">
              {totalConvs.toLocaleString('pt-BR')}
            </p>
            <p className="text-[11px] text-slate-600 font-body mt-1.5">este mês</p>
          </div>
        </div>

        {/* Planos */}
        <div className="rounded-[1.125rem] p-6 flex flex-col justify-between animate-fade-up" style={S.card}>
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest font-body">Planos</p>
            <BarChart3 className="w-3.5 h-3.5 text-slate-700" />
          </div>
          <div className="mt-4 space-y-2.5">
            {[
              { label: 'Starter', count: starterCount, color: '#64748b' },
              { label: 'Pro',     count: proCount,     color: '#3b82f6' },
              { label: 'Clinic',  count: clinicCount,  color: '#10b981' },
            ].map(({ label, count, color }) => (
              <div key={label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                  <span className="text-xs text-slate-500 font-body">{label}</span>
                </div>
                <span className="text-xs font-bold text-slate-300 font-body tabular-nums">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-[1.125rem] overflow-hidden animate-fade-up" style={S.card}>
        <div className="px-6 py-5 flex items-center justify-between"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div>
            <p className="font-display font-bold text-white text-[15px]">Usuários Recentes</p>
            <p className="text-xs text-slate-600 font-body mt-0.5">{orgs.length} cadastrados</p>
          </div>
          <Link to="/admin/clients">
            <button className="flex items-center gap-1.5 text-xs font-semibold text-emerald-500 hover:text-emerald-400 transition-colors font-body">
              Ver todos <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-14">
            <div className="w-5 h-5 border-2 rounded-full animate-spin"
              style={{ borderColor: 'rgba(255,255,255,0.08)', borderTopColor: '#10b981' }} />
          </div>
        ) : orgs.length === 0 ? (
          <div className="text-center py-14">
            <Users className="w-9 h-9 mx-auto mb-3 text-slate-800" />
            <p className="font-body text-slate-500 text-sm font-medium">Nenhum usuário ainda</p>
            <Link to="/admin/clients/new">
              <button className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm mt-4">
                <Plus className="w-3.5 h-3.5" />
                Adicionar
              </button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <th className={S.th}>Clínica</th>
                  <th className={S.th}>Plano</th>
                  <th className={S.th}>Status</th>
                  <th className={S.th}>Conversas</th>
                  <th className={S.th}>Cadastro</th>
                  <th className="py-3 px-5" />
                </tr>
              </thead>
              <tbody>
                {orgs.slice(0, 8).map(org => (
                  <tr
                    key={org.id}
                    className="transition-colors duration-100 cursor-default"
                    style={S.row}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.018)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td className="py-3.5 px-5">
                      <p className="text-sm font-semibold text-slate-200 font-body">{org.name}</p>
                      <p className="text-xs text-slate-600 font-body mt-0.5">{org.evolution_instance || org.slug}</p>
                    </td>
                    <td className="py-3.5 px-5">
                      <span className={`inline-flex items-center px-2.5 py-[3px] rounded-full text-[10px] font-bold uppercase font-body ${planBadge[org.plan] ?? 'bg-slate-800 text-slate-500'}`}>
                        {planLabel(org.plan)}
                      </span>
                    </td>
                    <td className="py-3.5 px-5">
                      <span className={`inline-flex items-center px-2.5 py-[3px] rounded-full text-[10px] font-bold font-body ${statusBadge[org.status] ?? 'bg-slate-800 text-slate-500'}`}>
                        {statusLabel(org.status)}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-xs text-slate-500 font-body tabular-nums">
                      <span className={((org.conversations_used ?? 0) / (org.max_conversations_month || 1)) > 0.8 ? 'text-red-400 font-bold' : 'text-slate-400'}>
                        {org.conversations_used ?? 0}
                      </span>
                      <span className="text-slate-700">/{org.max_conversations_month}</span>
                    </td>
                    <td className="py-3.5 px-5 text-xs text-slate-600 font-body">{formatDateShort(org.created_at)}</td>
                    <td className="py-3.5 px-5">
                      <Link to={`/admin/clients/${org.id}`}>
                        <button className="text-xs font-semibold text-slate-600 hover:text-emerald-400 transition-colors font-body">
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
