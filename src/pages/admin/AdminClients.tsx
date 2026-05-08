import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { type Organization } from '../../types'
import { planLabel, statusLabel, formatDateShort } from '../../lib/utils'

const planBadge: Record<string, string> = {
  starter: 'bg-slate-100 text-slate-600',
  pro:     'bg-blue-50 text-blue-600',
  clinic:  'bg-emerald-50 text-emerald-700',
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
  todos: 'Todos', starter: 'Starter', pro: 'Pro', clinic: 'Clinic',
}

const CARD: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e4e7ec',
  borderRadius: '1.125rem',
  boxShadow: '0 1px 3px rgba(16,24,40,0.06)',
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
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#101828' }}>
            Usuários
          </h1>
          <p className="text-sm mt-1" style={{ color: '#98a2b3' }}>
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
        <div
          className="flex items-center gap-1 p-1 rounded-xl"
          style={{ background: '#f0f2f5', border: '1px solid #e4e7ec' }}
        >
          {planFilter.map(p => (
            <button
              key={p}
              onClick={() => setPlanTab(p)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150"
              style={planTab === p ? {
                background: '#ffffff',
                color: '#344054',
                boxShadow: '0 1px 3px rgba(16,24,40,0.08)',
                border: '1px solid #e4e7ec',
              } : {
                color: '#98a2b3',
                border: '1px solid transparent',
              }}
            >
              {PLAN_LABELS[p]}
              <span
                className="inline-flex items-center justify-center w-4 h-4 rounded-md text-[10px] font-bold tabular-nums"
                style={planTab === p
                  ? { background: '#f0f2f5', color: '#344054' }
                  : { background: 'rgba(0,0,0,0.04)', color: '#98a2b3' }
                }
              >
                {counts[p]}
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative sm:ml-auto">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
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
      <div className="rounded-[1.125rem] overflow-hidden" style={CARD}>
        {loading ? (
          <div className="flex justify-center py-14">
            <div className="w-5 h-5 border-2 border-slate-200 border-t-emerald-500 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Users className="w-9 h-9 mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-medium text-slate-400">Nenhum usuário encontrado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid #f2f4f7' }}>
                  {['Clínica','Plano','Status','WhatsApp','Conversas','Cadastro','Ações'].map(h => (
                    <th key={h} className="text-left py-3 px-5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#98a2b3' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(org => (
                  <tr
                    key={org.id}
                    className="transition-colors duration-100"
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
                        {org.status === 'active' && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                        )}
                        {statusLabel(org.status)}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-xs">
                      {org.evolution_instance ? (
                        <span className="flex items-center gap-1.5" style={{ color: '#667085' }}>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                          {org.evolution_instance}
                        </span>
                      ) : (
                        <span style={{ color: '#d0d5dd' }}>—</span>
                      )}
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
                        <button
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150"
                          style={{ border: '1px solid #e4e7ec', color: '#98a2b3' }}
                          onMouseEnter={e => {
                            (e.currentTarget as HTMLElement).style.background = '#f0fdf4'
                            ;(e.currentTarget as HTMLElement).style.borderColor = '#a7f3d0'
                            ;(e.currentTarget as HTMLElement).style.color = '#059669'
                          }}
                          onMouseLeave={e => {
                            (e.currentTarget as HTMLElement).style.background = 'transparent'
                            ;(e.currentTarget as HTMLElement).style.borderColor = '#e4e7ec'
                            ;(e.currentTarget as HTMLElement).style.color = '#98a2b3'
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
