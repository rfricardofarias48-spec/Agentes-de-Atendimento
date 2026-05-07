import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { type Organization } from '../../types'
import { planLabel, statusLabel, formatDateShort } from '../../lib/utils'

const planColors: Record<string, string> = {
  starter: 'bg-zinc-100 text-zinc-600',
  pro: 'bg-blue-100 text-blue-700',
  clinic: 'bg-green-100 text-green-700',
}

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  trial: 'bg-yellow-100 text-yellow-700',
  inactive: 'bg-zinc-100 text-zinc-500',
  suspended: 'bg-red-100 text-red-600',
}

const planFilter = ['todos', 'starter', 'pro', 'clinic'] as const
type PlanFilter = typeof planFilter[number]

export default function AdminClients() {
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [search, setSearch] = useState('')
  const [planTab, setPlanTab] = useState<PlanFilter>('todos')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('organizations').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setOrgs(data ?? []); setLoading(false) })
  }, [])

  const filtered = orgs.filter(o => {
    const q = search.toLowerCase()
    const matchSearch = o.name.toLowerCase().includes(q) || (o.evolution_instance || '').toLowerCase().includes(q) || o.slug.toLowerCase().includes(q)
    const matchPlan = planTab === 'todos' || o.plan === planTab
    return matchSearch && matchPlan
  })

  const counts: Record<PlanFilter, number> = {
    todos: orgs.length,
    starter: orgs.filter(o => o.plan === 'starter').length,
    pro: orgs.filter(o => o.plan === 'pro').length,
    clinic: orgs.filter(o => o.plan === 'clinic').length,
  }

  return (
    <div className="space-y-6 animate-fade-in pb-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-black text-zinc-900 tracking-tight">Clientes</h1>
          <p className="text-zinc-400 text-sm font-medium mt-0.5">Gerencie os usuários da plataforma.</p>
        </div>
        <Link to="/admin/clients/new">
          <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-bold hover:bg-zinc-800 transition-colors">
            <Plus className="w-4 h-4" />
            Novo Usuário
          </button>
        </Link>
      </div>

      {/* Filtros de plano + busca */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        {/* Plan tabs */}
        <div className="flex items-center gap-2">
          {planFilter.map(p => (
            <button
              key={p}
              onClick={() => setPlanTab(p)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-black uppercase transition-all ${
                planTab === p
                  ? 'bg-zinc-900 text-white shadow-sm'
                  : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
              }`}
            >
              {p === 'todos' ? 'Todos' : planLabel(p)}
              <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-black ${
                planTab === p ? 'bg-white/20 text-white' : 'bg-zinc-200 text-zinc-600'
              }`}>
                {counts[p]}
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative sm:ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar clínica ou instância..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 rounded-xl border border-zinc-200 text-sm bg-white text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 w-64"
          />
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-[1.75rem] border border-zinc-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-zinc-300 border-t-zinc-900 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-14 text-zinc-400">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="font-semibold">Nenhum usuário encontrado.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100">
                  <th className="text-left py-3.5 px-6 text-[11px] font-black text-zinc-400 uppercase tracking-wider">Clínica</th>
                  <th className="text-left py-3.5 px-4 text-[11px] font-black text-zinc-400 uppercase tracking-wider">Plano</th>
                  <th className="text-left py-3.5 px-4 text-[11px] font-black text-zinc-400 uppercase tracking-wider">Status</th>
                  <th className="text-left py-3.5 px-4 text-[11px] font-black text-zinc-400 uppercase tracking-wider">WhatsApp</th>
                  <th className="text-left py-3.5 px-4 text-[11px] font-black text-zinc-400 uppercase tracking-wider">Conversas</th>
                  <th className="text-left py-3.5 px-4 text-[11px] font-black text-zinc-400 uppercase tracking-wider">Cadastro</th>
                  <th className="py-3.5 px-4 text-[11px] font-black text-zinc-400 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(org => (
                  <tr key={org.id} className="border-b border-zinc-50 hover:bg-zinc-50/70 transition-colors">
                    <td className="py-3.5 px-6">
                      <p className="font-bold text-zinc-900">{org.name}</p>
                      <p className="text-xs text-zinc-400 mt-0.5">{org.evolution_instance || org.slug}</p>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase ${planColors[org.plan] ?? 'bg-zinc-100 text-zinc-500'}`}>
                        {planLabel(org.plan)}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-black ${statusColors[org.status] ?? 'bg-zinc-100 text-zinc-500'}`}>
                        {statusLabel(org.status)}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-zinc-600 font-medium">
                      {org.evolution_instance ? (
                        <span className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                          {org.evolution_instance}
                        </span>
                      ) : (
                        <span className="text-zinc-300">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-zinc-600 font-medium">
                      <span className={`font-bold ${((org.conversations_used ?? 0) / (org.max_conversations_month || 1)) > 0.8 ? 'text-red-500' : 'text-zinc-700'}`}>
                        {org.conversations_used ?? 0}
                      </span>
                      <span className="text-zinc-400">/{org.max_conversations_month}</span>
                    </td>
                    <td className="py-3.5 px-4 text-zinc-400 font-medium">{formatDateShort(org.created_at)}</td>
                    <td className="py-3.5 px-4">
                      <Link to={`/admin/clients/${org.id}`}>
                        <button className="px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-bold text-zinc-600 hover:bg-zinc-900 hover:text-white hover:border-zinc-900 transition-all">
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
