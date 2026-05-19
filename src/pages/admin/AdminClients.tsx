import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Users, CheckCircle2, Zap, Plus, X, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { type Organization, type OrgPlan } from '../../types'
import { planLabel, statusLabel, formatDateShort, cn } from '../../lib/utils'

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

const planFilter = ['todos', 'starter', 'pro', 'max', 'ultra'] as const
type PlanFilter = typeof planFilter[number]

const PLAN_LABELS: Record<PlanFilter, string> = {
  todos: 'Todos', starter: 'Essencial', pro: 'Pro', max: 'Max', ultra: 'Ultra',
}

const MAX_CONV: Record<OrgPlan, number> = { starter: 3, pro: 10, max: 25, ultra: 50 }

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 24)
    + '-' + Math.random().toString(36).slice(2, 7)
}

// ── Modal: Novo Cliente ──────────────────────────────────────────────────────
interface NewClientForm {
  name: string
  email: string
  password: string
  phone: string
  plan: OrgPlan
}

function NewClientModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState<NewClientForm>({
    name: '', email: '', password: '', phone: '', plan: 'starter',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (k: keyof NewClientForm) => (v: string) =>
    setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.email.trim() || form.password.length < 6) return
    setLoading(true)
    setError(null)

    try {
      // 1. Criar organização
      const rawPhone = form.phone.replace(/\D/g, '')
      const normalizedPhone = rawPhone ? (rawPhone.startsWith('55') ? rawPhone : `55${rawPhone}`) : null

      const { data: org, error: orgErr } = await supabase
        .from('organizations')
        .insert({
          name: form.name.trim(),
          slug: slugify(form.name.trim()),
          plan: form.plan,
          status: 'trial',
          phone: normalizedPhone,
          max_conversations_month: MAX_CONV[form.plan],
          conversations_used: 0,
          agent_tone: 'friendly',
          whatsapp_numbers: [],
        })
        .select('id')
        .single()

      if (orgErr || !org) {
        setError('Erro ao criar organização: ' + (orgErr?.message ?? 'desconhecido'))
        return
      }

      // 2. Criar usuário e vincular à org
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ orgId: org.id, email: form.email.trim(), password: form.password }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }

      if (!data.ok) {
        // Rollback: remover org criada
        await supabase.from('organizations').delete().eq('id', org.id)
        setError(data.error ?? 'Erro ao criar usuário')
        return
      }

      // 3. Criar agent_settings padrão
      await supabase.from('agent_settings').insert({
        org_id: org.id,
        agent_name: 'Assistente',
        greeting_message: '',
        tone: 'friendly',
        specialties: [],
        services: [],
        notification_phone: normalizedPhone,
      })

      onCreated()
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const plans: OrgPlan[] = ['starter', 'pro', 'max', 'ultra']

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget && !loading) onClose() }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: '#fff', boxShadow: '0 32px 80px rgba(0,0,0,0.18)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #f1f5f9' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #2C82B5, #1e5f88)' }}>
              <Plus className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-bold text-[13px] text-slate-800">Novo Cliente</p>
              <p className="text-[11px] text-slate-400">Cria organização + acesso ao app</p>
            </div>
          </div>
          {!loading && (
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-1.5">
              Nome da Clínica *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={e => set('name')(e.target.value)}
              placeholder="Clínica São Lucas"
              required
              autoFocus
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-1.5">
                E-mail *
              </label>
              <input
                type="email"
                value={form.email}
                onChange={e => set('email')(e.target.value)}
                placeholder="clinica@email.com"
                required
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-1.5">
                Senha * <span className="normal-case font-normal text-slate-300">(mín. 6)</span>
              </label>
              <input
                type="password"
                value={form.password}
                onChange={e => set('password')(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-1.5">
              Telefone / WhatsApp
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={e => set('phone')(e.target.value)}
              placeholder="5551999990000"
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-2">
              Plano
            </label>
            <div className="flex gap-2">
              {plans.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => set('plan')(p)}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold border-2 transition-all"
                  style={form.plan === p ? {
                    borderColor: '#4d9aca', color: '#2570a0',
                    background: '#fff', boxShadow: '0 1px 3px rgba(16,24,40,0.08)',
                  } : { borderColor: '#e4e7ec', color: '#98a2b3' }}
                >
                  {planLabel(p)}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs text-red-600"
              style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
              <X className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={loading || !form.name.trim() || !form.email.trim() || form.password.length < 6}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #2C82B5, #2570a0)' }}
            >
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Criando...</>
                : <><Plus className="w-4 h-4" /> Criar Cliente</>
              }
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-400 border border-slate-200 hover:bg-slate-50 transition-all disabled:opacity-40"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Página principal ─────────────────────────────────────────────────────────
export default function AdminClients() {
  const [orgs, setOrgs]         = useState<Organization[]>([])
  const [search, setSearch]     = useState('')
  const [planTab, setPlanTab]   = useState<PlanFilter>('todos')
  const [loading, setLoading]   = useState(true)
  const [showNew, setShowNew]   = useState(false)

  function loadOrgs() {
    supabase.from('organizations').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setOrgs(data ?? []); setLoading(false) })
  }

  useEffect(() => { loadOrgs() }, [])

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
    max:     orgs.filter(o => o.plan === 'max').length,
    ultra:   orgs.filter(o => o.plan === 'ultra').length,
  }

  return (
    <div className="space-y-5 pb-8">

      {showNew && (
        <NewClientModal
          onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); loadOrgs() }}
        />
      )}

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 leading-none">Usuários</h1>
          <p className="text-sm text-slate-500 mt-1">Gerencie os clientes da plataforma</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:shadow-[0_4px_14px_rgba(44,130,181,0.4)] hover:-translate-y-[1px]"
          style={{ background: 'linear-gradient(135deg, #2C82B5, #2570a0)' }}
        >
          <Plus className="w-4 h-4" />
          Novo Cliente
        </button>
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
            {search === '' && planTab === 'todos' && (
              <button onClick={() => setShowNew(true)}
                className="mt-3 text-xs font-semibold text-brand-500 hover:text-brand-700 transition-colors">
                + Criar primeiro cliente
              </button>
            )}
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
