import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Users } from 'lucide-react'
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

const planFilter = ['todos', 'starter', 'pro', 'clinic'] as const
type PlanFilter = typeof planFilter[number]

const PLAN_LABELS: Record<PlanFilter, string> = {
  todos: 'Todos', starter: 'Starter', pro: 'Pro', clinic: 'Clinic',
}

const S = {
  card: {
    background: '#0c0e1a',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '1.125rem',
  } as React.CSSProperties,
  th: 'text-left py-3 px-5 text-[10px] font-bold text-slate-600 uppercase tracking-widest font-body',
  row: { borderBottom: '1px solid rgba(255,255,255,0.03)' } as React.CSSProperties,
}

export default function AdminClients() {
  const [orgs, setOrgs]       = useState<Organization[]>([])
  const [search, setSearch]   = useState('')
  const [planTab, setPlanTab] = useState<PlanFilter>('todos')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('organizations').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setOrgs(data ?? []); setLoading(false) })
  }, [])

  const filtered = orgs.filter(o => {
    const q = search.toLowerCase()
    const matchSearch = o.name.toLowerCase().includes(q)
      || (o.evolution_instance || '').toLowerCase().includes(q)
      || o.slug.toLowerCase().includes(q)
    const matchPlan = planTab === 'todos' || o.plan === planTab
    return matchSearch && matchPlan
  })

  const counts: Record<PlanFilter, number> = {
    todos:   orgs.length,
    starter: orgs.filter(o => o.plan === 'starter').length,
    pro:     orgs.filter(o => o.plan === 'pro').length,
    clinic:  orgs.filter(o => o.plan === 'clinic').length,
  }

  return (
    <div className="space-y-6 animate-fade-up pb-8">

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-[2rem] font-bold text-white tracking-tight leading-none">
            Usuários
          </h1>
          <p className="text-slate-500 text-sm font-body mt-2">
            Gerencie os clientes da plataforma
          </p>
        </div>
        <Link to="/admin/clients/new">
          <button className="btn-primary flex items-center gap-2 px-4 py-2.5 text-sm">
            <Plus className="w-4 h-4" />
            Novo Usuário
          </button>
        </Link>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        {/* Plan tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl"
          style={{ background: '#0c0e1a', border: '1px solid rgba(255,255,255,0.06)' }}>
          {planFilter.map(p => (
            <button
              key={p}
              onClick={() => setPlanTab(p)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold font-body transition-all duration-150"
              style={planTab === p ? {
                background: 'rgba(16,185,129,0.1)',
                color: '#34d399',
                border: '1px solid rgba(16,185,129,0.15)',
              } : {
                color: '#475569',
                border: '1px solid transparent',
              }}
            >
              {PLAN_LABELS[p]}
              <span
                className="inline-flex items-center justify-center w-4 h-4 rounded-md text-[10px] font-bold font-body tabular-nums"
                style={planTab === p
                  ? { background: 'rgba(16,185,129,0.15)', color: '#34d399' }
                  : { background: 'rgba(255,255,255,0.06)', color: '#475569' }
                }
              >
                {counts[p]}
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative sm:ml-auto">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
          <input
            type="text"
            placeholder="Buscar clínica ou instância..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-dark pl-9 pr-4 py-2 text-sm w-64"
          />
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-[1.125rem] overflow-hidden" style={S.card}>
        {loading ? (
          <div className="flex justify-center py-14">
            <div className="w-5 h-5 border-2 rounded-full animate-spin"
              style={{ borderColor: 'rgba(255,255,255,0.08)', borderTopColor: '#10b981' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Users className="w-9 h-9 mx-auto mb-3 text-slate-800" />
            <p className="text-slate-500 font-body font-medium text-sm">Nenhum usuário encontrado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <th className={S.th}>Clínica</th>
                  <th className={S.th}>Plano</th>
                  <th className={S.th}>Status</th>
                  <th className={S.th}>WhatsApp</th>
                  <th className={S.th}>Conversas</th>
                  <th className={S.th}>Cadastro</th>
                  <th className="py-3 px-5 text-[10px] font-bold text-slate-600 uppercase tracking-widest font-body">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(org => (
                  <tr
                    key={org.id}
                    className="transition-colors duration-100"
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
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-[3px] rounded-full text-[10px] font-bold font-body ${statusBadge[org.status] ?? 'bg-slate-800 text-slate-500'}`}>
                        {org.status === 'active' && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"
                            style={{ boxShadow: '0 0 5px rgba(52,211,153,0.8)' }} />
                        )}
                        {statusLabel(org.status)}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-xs font-body">
                      {org.evolution_instance ? (
                        <span className="flex items-center gap-1.5 text-slate-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                          {org.evolution_instance}
                        </span>
                      ) : (
                        <span className="text-slate-700">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-5 text-xs font-body tabular-nums">
                      <span className={((org.conversations_used ?? 0) / (org.max_conversations_month || 1)) > 0.8 ? 'text-red-400 font-bold' : 'text-slate-400'}>
                        {org.conversations_used ?? 0}
                      </span>
                      <span className="text-slate-700">/{org.max_conversations_month}</span>
                    </td>
                    <td className="py-3.5 px-5 text-xs text-slate-600 font-body">{formatDateShort(org.created_at)}</td>
                    <td className="py-3.5 px-5">
                      <Link to={`/admin/clients/${org.id}`}>
                        <button
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold font-body text-slate-500 transition-all duration-150 hover:text-emerald-300"
                          style={{ border: '1px solid rgba(255,255,255,0.07)' }}
                          onMouseEnter={e => {
                            (e.currentTarget as HTMLElement).style.background = 'rgba(16,185,129,0.07)'
                            ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(16,185,129,0.15)'
                          }}
                          onMouseLeave={e => {
                            (e.currentTarget as HTMLElement).style.background = 'transparent'
                            ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)'
                          }}
                        >
                          Gerenciar
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
