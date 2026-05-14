import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Users, CheckCircle2, Zap } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { type Organization } from '../../types'
import { planLabel, statusLabel, formatDateShort, cn } from '../../lib/utils'

const planBadge: Record<string, string> = {
  starter: 'bg-slate-100 text-slate-600',
  pro:     'bg-blue-50 text-blue-600',
  clinic:  'bg-brand-50 text-brand-700',
}
const statusBadge: Record<string, string> = {
  active:    'bg-emerald-50 text-emerald-700',
  trial:     'bg-amber-50 text-amber-700',
  inactive:  'bg-slate-100 text-slate-500',
  suspended: 'bg-red-50 text-red-600',
}

const planFilter = ['todos', 'starter', 'pro', 'clinic'] as const
type PlanFilter = typeof planFilter[number]

const PLAN_LABELS: Record<PlanFilter, string> = {
  todos: 'Todos', starter: 'Essencial', pro: 'Pro', clinic: 'Max',
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
      || (o.slug || '').toLowerCase().includes(q)
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
    <div className="space-y-5 pb-8">

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 leading-none">Usuários</h1>
          <p className="text-sm text-slate-500 mt-1">Gerencie os clientes da plataforma</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-center bg-white border border-slate-200 rounded-2xl p-1 shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
          {planFilter.map(p => (
            <button
              key={p}
              onClick={() => setPlanTab(p)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200',
                planTab === p ? 'text-white shadow-[0_2px_8px_rgba(37,112,160,0.28)]' : 'text-slate-400 hover:text-slate-600',
              )}
              style={planTab === p ? { background: 'linear-gradient(135deg, #2C82B5, #2570a0)' } : {}}
            >
              {PLAN_LABELS[p]}
              <span className={cn(
                'inline-flex items-center justify-center w-4 h-4 rounded-md text-[10px] font-bold tabular-nums',
                planTab === p ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400',
              )}>
                {counts[p]}
              </span>
            </button>
          ))}
        </div>

        <div className="relative sm:ml-auto">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar clínica ou instância..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2.5 text-sm w-64 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all bg-white"
          />
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-14">
            <div className="w-5 h-5 border-[2.5px] border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-3 border border-slate-100">
              <Users className="w-5 h-5 text-slate-300" />
            </div>
            <p className="text-sm font-medium text-slate-400">Nenhum usuário encontrado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid #f8fafc' }}>
                  {['Clínica','Plano','Status','WhatsApp','Conversas','Cadastro','Ações'].map(h => (
                    <th key={h} className="text-left py-3 px-5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((org, i) => {
                  const setupDone = !!(org.evolution_instance && org.evolution_token && org.chatwoot_account_id && org.chatwoot_token)
                  return (
                    <tr
                      key={org.id}
                      className={cn('transition-colors duration-100', i % 2 !== 0 ? 'bg-slate-50/30' : '')}
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
                      <td className="py-3.5 px-5 text-xs">
                        {org.evolution_instance ? (
                          <span className="flex items-center gap-1.5 text-slate-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                            {org.evolution_instance}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-xs tabular-nums text-slate-500">
                        <span className={((org.conversations_used ?? 0) / (org.max_conversations_month || 1)) > 0.8 ? 'text-red-500 font-semibold' : ''}>
                          {org.conversations_used ?? 0}
                        </span>
                        <span className="text-slate-300">/{org.max_conversations_month}</span>
                      </td>
                      <td className="py-3.5 px-5 text-xs text-slate-400">{formatDateShort(org.created_at)}</td>
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-2">
                          {setupDone ? (
                            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
                              style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d' }}>
                              <CheckCircle2 className="w-3 h-3" />
                              Setup OK
                            </span>
                          ) : (
                            <Link
                              to={`/admin/clients/${org.id}`}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white transition-all hover:shadow-[0_3px_10px_rgba(44,130,181,0.4)] hover:-translate-y-[1px]"
                              style={{ background: 'linear-gradient(135deg, #2C82B5, #2570a0)' }}
                            >
                              <Zap className="w-3 h-3" />
                              Configurar
                            </Link>
                          )}
                          <Link to={`/admin/clients/${org.id}`}>
                            <button className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 border border-slate-200 hover:text-brand-600 hover:border-brand-200 hover:bg-brand-50 transition-all">
                              Gerenciar
                            </button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
