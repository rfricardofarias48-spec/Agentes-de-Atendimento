import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Users, CheckCircle2, Zap, Plus, X, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { type Organization } from '../../types'
import { statusLabel, formatDateShort, cn } from '../../lib/utils'

const statusBadge: Record<string, string> = {
  active:    'bg-emerald-50 text-emerald-700',
  trial:     'bg-amber-50 text-amber-700',
  inactive:  'bg-slate-100 text-slate-500',
  suspended: 'bg-red-50 text-red-600',
}

const DEFAULT_MAX_CONVERSATIONS = 300

function fmtCurrency(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

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
  setupFee: string
  monthlyFee: string
  maxConversations: string
}

function NewClientModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState<NewClientForm>({
    name: '', email: '', password: '', phone: '', setupFee: '', monthlyFee: '', maxConversations: '',
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
      const setupFee = Math.max(0, parseFloat(form.setupFee) || 0)
      const monthlyFee = Math.max(0, parseFloat(form.monthlyFee) || 0)
      const maxConversations = parseInt(form.maxConversations, 10) || DEFAULT_MAX_CONVERSATIONS

      const { data: org, error: orgErr } = await supabase
        .from('organizations')
        .insert({
          name: form.name.trim(),
          slug: slugify(form.name.trim()),
          status: 'trial',
          phone: normalizedPhone,
          max_conversations_month: maxConversations,
          conversations_used: 0,
          agent_tone: 'friendly',
          whatsapp_numbers: [],
          setup_fee: setupFee,
          monthly_fee: monthlyFee,
          setup_fee_status: setupFee > 0 ? 'pending' : 'none',
        })
        .select('id')
        .single()

      if (orgErr || !org) {
        setError('Erro ao criar organização: ' + (orgErr?.message ?? 'desconhecido'))
        return
      }

      // 2. Criar usuário e vincular à org
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/users', {
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-1.5">
                Setup (único)
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">R$</span>
                <input
                  type="number" min="0" step="0.01"
                  value={form.setupFee}
                  onChange={e => set('setupFee')(e.target.value)}
                  placeholder="0,00"
                  className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-1.5">
                Mensalidade
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">R$</span>
                <input
                  type="number" min="0" step="0.01"
                  value={form.monthlyFee}
                  onChange={e => set('monthlyFee')(e.target.value)}
                  placeholder="299,90"
                  className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-1.5">
              Limite de conversas/mês
            </label>
            <input
              type="number" min="0"
              value={form.maxConversations}
              onChange={e => set('maxConversations')(e.target.value)}
              placeholder={String(DEFAULT_MAX_CONVERSATIONS)}
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all"
            />
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
  const [loading, setLoading]   = useState(true)
  const [showNew, setShowNew]   = useState(false)

  function loadOrgs() {
    supabase.from('organizations').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setOrgs(data ?? []); setLoading(false) })
  }

  useEffect(() => { loadOrgs() }, [])

  const filtered = orgs.filter(o => {
    const q = search.toLowerCase()
    return o.name.toLowerCase().includes(q)
      || (o.evolution_instance || '').toLowerCase().includes(q)
      || (o.slug || '').toLowerCase().includes(q)
  })

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

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar clínica ou instância..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 pr-4 py-2.5 text-sm w-64 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all bg-white"
        />
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
            {search === '' && (
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
                  {['Clínica','Mensalidade','Status','WhatsApp','Conversas','Cadastro','Ações'].map(h => (
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
                        <span className="text-sm font-semibold text-slate-700 tabular-nums">
                          {fmtCurrency(org.monthly_fee)}
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
