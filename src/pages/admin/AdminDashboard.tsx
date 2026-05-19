import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, ArrowRight, TrendingUp, MessageSquare, BarChart3 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { type Organization } from '../../types'
import { TZ } from '../../lib/date'
import { planLabel, statusLabel, formatDateShort } from '../../lib/utils'
import { cn } from '../../lib/utils'

const planBadge: Record<string, string> = {
  starter: 'bg-slate-100 text-slate-600',
  pro:     'bg-blue-50 text-blue-600',
  max:     'bg-brand-50 text-brand-700',
  ultra:   'bg-purple-50 text-purple-700',
}
const statusBadge: Record<string, string> = {
  active:    'bg-emerald-50 text-emerald-700',
  trial:     'bg-amber-50 text-amber-700',
  inactive:  'bg-slate-100 text-slate-500',
  suspended: 'bg-red-50 text-red-600',
}
const PLAN_MRR: Record<string, number> = { starter: 399, pro: 749, max: 1699, ultra: 2999 }

const CARD_ACCENTS = {
  brand:   { border: '#2C82B5', iconBg: 'rgba(44,130,181,0.12)',  iconColor: '#2C82B5'  },
  violet:  { border: '#7c3aed', iconBg: 'rgba(124,58,237,0.12)',  iconColor: '#7c3aed'  },
  emerald: { border: '#059669', iconBg: 'rgba(5,150,105,0.12)',   iconColor: '#059669'  },
  slate:   { border: '#64748b', iconBg: 'rgba(100,116,139,0.10)', iconColor: '#64748b'  },
}

function MetricCard({ label, value, icon, accent, sub }: {
  label: string; value: string | number; icon: React.ReactNode; sub?: string
  accent: { border: string; iconBg: string; iconColor: string }
}) {
  return (
    <div
      className="relative bg-white rounded-2xl px-5 pt-4 pb-5 transition-all duration-200 hover:-translate-y-[2px] hover:shadow-[0_6px_20px_rgba(0,0,0,0.08)]"
      style={{ border: '1px solid #eef0f3', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
    >
      <div className="absolute top-0 left-5 right-5 h-[3px] rounded-b-full" style={{ background: accent.border }} />
      <div className="flex items-center gap-2 mt-2 mb-3">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: accent.iconBg }}>
          <div style={{ color: accent.iconColor }}>{icon}</div>
        </div>
        <p className="text-[11px] font-semibold text-slate-400 tracking-wide">{label}</p>
      </div>
      <p className="text-[2rem] font-black text-gray-900 leading-none tabular-nums">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1.5 font-medium">{sub}</p>}
    </div>
  )
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
  const maxCount     = orgs.filter(o => o.plan === 'max').length
  const ultraCount   = orgs.filter(o => o.plan === 'ultra').length

  return (
    <div className="space-y-5 pb-8">

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 leading-none">Visão Geral</h1>
          <p className="text-sm text-slate-500 mt-1 capitalize">
            {new Date().toLocaleDateString('pt-BR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

        {/* MRR — card especial */}
        <div
          className="col-span-2 lg:col-span-1 relative overflow-hidden rounded-2xl p-5"
          style={{
            background: 'linear-gradient(135deg,#164a6a 0%,#1e5f88 100%)',
            border: '1px solid #2570a0',
            boxShadow: '0 4px 16px rgba(44,130,181,0.25)',
          }}
        >
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full pointer-events-none opacity-20"
            style={{ background: 'radial-gradient(circle,#ffffff 0%,transparent 70%)' }} />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)' }}>
                <TrendingUp className="w-3 h-3 text-white" />
              </div>
              <p className="text-[11px] font-bold text-brand-200 uppercase tracking-widest">MRR Estimado</p>
            </div>
            <p className="text-[1.75rem] font-black text-white leading-none tabular-nums">
              R$ {mrr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            <div className="mt-3 pt-3 flex items-center justify-between"
              style={{ borderTop: '1px solid rgba(255,255,255,0.15)' }}>
              <span className="text-[10px] text-brand-300 font-semibold uppercase">ARR</span>
              <span className="text-sm font-bold text-white">R$ {(mrr * 12 / 1000).toFixed(1)}k</span>
            </div>
          </div>
        </div>

        <MetricCard
          label="Ativos"
          value={activeOrgs.length}
          sub={`${orgs.length} total`}
          accent={CARD_ACCENTS.emerald}
          icon={<Users className="w-3.5 h-3.5" />}
        />
        <MetricCard
          label="Conversas"
          value={totalConvs.toLocaleString('pt-BR')}
          sub="este mês"
          accent={CARD_ACCENTS.brand}
          icon={<MessageSquare className="w-3.5 h-3.5" />}
        />

        {/* Planos */}
        <div
          className="relative bg-white rounded-2xl px-5 pt-4 pb-5 transition-all duration-200 hover:-translate-y-[2px] hover:shadow-[0_6px_20px_rgba(0,0,0,0.08)]"
          style={{ border: '1px solid #eef0f3', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
        >
          <div className="absolute top-0 left-5 right-5 h-[3px] rounded-b-full" style={{ background: CARD_ACCENTS.slate.border }} />
          <div className="flex items-center gap-2 mt-2 mb-3">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: CARD_ACCENTS.slate.iconBg }}>
              <BarChart3 className="w-3.5 h-3.5" style={{ color: CARD_ACCENTS.slate.iconColor }} />
            </div>
            <p className="text-[11px] font-semibold text-slate-400 tracking-wide">Planos</p>
          </div>
          <div className="space-y-2">
            {[
              { label: 'Essencial', count: starterCount, color: '#94a3b8' },
              { label: 'Pro',      count: proCount,     color: '#3b82f6' },
              { label: 'Max',      count: maxCount,     color: '#2C82B5' },
              { label: 'Ultra',    count: ultraCount,   color: '#7c3aed' },
            ].map(({ label, count, color }) => (
              <div key={label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                  <span className="text-xs text-slate-500">{label}</span>
                </div>
                <span className="text-xs font-bold tabular-nums text-slate-700">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between border-b border-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-1.5 h-4 rounded-full" style={{ background: 'linear-gradient(180deg, #2C82B5, #1e5f88)' }} />
            <div>
              <p className="font-bold text-[13px] text-gray-900">Usuários Recentes</p>
              <p className="text-xs text-slate-400 mt-0.5">{orgs.length} cadastrados</p>
            </div>
          </div>
          <Link to="/admin/clients">
            <button className="flex items-center gap-1 text-[11px] font-bold text-brand-500 hover:text-brand-600 transition-colors">
              Ver todos <ArrowRight className="w-3 h-3" />
            </button>
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-14">
            <div className="w-5 h-5 border-[2.5px] border-brand-500 border-t-transparent rounded-full animate-spin" />
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
                <tr style={{ borderBottom: '1px solid #f8fafc' }}>
                  {['Clínica','Plano','Status','Conversas','Cadastro',''].map(h => (
                    <th key={h} className="text-left py-3 px-5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orgs.slice(0, 8).map((org, i) => (
                  <tr
                    key={org.id}
                    className={cn('transition-colors duration-100 cursor-default', i % 2 !== 0 ? 'bg-slate-50/30' : '')}
                    style={{ borderBottom: '1px solid #f8fafc' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                    onMouseLeave={e => (e.currentTarget.style.background = i % 2 !== 0 ? 'rgba(248,250,252,0.3)' : 'transparent')}
                  >
                    <td className="py-3.5 px-5">
                      <p className="text-sm font-semibold text-slate-700">{org.name}</p>
                      <p className="text-xs mt-0.5 text-slate-400">{org.evolution_instance || org.slug}</p>
                    </td>
                    <td className="py-3.5 px-5">
                      <span className={`inline-flex items-center px-2.5 py-[3px] rounded-full text-[10px] font-semibold uppercase ${planBadge[org.plan] ?? 'bg-slate-100 text-slate-500'}`}>
                        {planLabel(org.plan)}
                      </span>
                    </td>
                    <td className="py-3.5 px-5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-[3px] rounded-full text-[10px] font-semibold ${statusBadge[org.status] ?? 'bg-slate-100 text-slate-500'}`}>
                        {org.status === 'active' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />}
                        {statusLabel(org.status)}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-xs tabular-nums text-slate-500">
                      <span className={((org.conversations_used ?? 0) / (org.max_conversations_month || 1)) > 0.8 ? 'text-red-500 font-semibold' : ''}>
                        {org.conversations_used ?? 0}
                      </span>
                      <span className="text-slate-300">/{org.max_conversations_month}</span>
                    </td>
                    <td className="py-3.5 px-5 text-xs text-slate-400">{formatDateShort(org.created_at)}</td>
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
