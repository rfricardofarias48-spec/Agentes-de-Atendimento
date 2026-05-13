import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Users, CheckCircle2, XCircle, Loader2, Zap, X } from 'lucide-react'
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

interface SetupStep {
  id: string
  label: string
  ok: boolean
  detail: string
}

interface SetupModalProps {
  org: Organization
  onClose: () => void
}

function SetupModal({ org, onClose }: SetupModalProps) {
  const [running, setRunning] = useState(false)
  const [steps, setSteps] = useState<SetupStep[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function runSetup() {
    setRunning(true)
    setSteps(null)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/finalize-setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ orgId: org.id }),
      })
      const data = await res.json() as { steps?: SetupStep[]; error?: string }
      if (!res.ok || !data.steps) throw new Error(data.error || 'Erro ao executar setup')
      setSteps(data.steps)
    } catch (e) {
      setError(String(e))
    } finally {
      setRunning(false)
    }
  }

  const allOk = steps ? steps.every(s => s.ok) : false
  const hasErrors = steps ? steps.some(s => !s.ok) : false

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }}>
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl animate-fade-up"
        style={{ background: '#ffffff', border: '1px solid #e4e7ec' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #f2f4f7' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, #2C82B5, #2570a0)' }}>
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-bold text-sm text-gray-900">Finalizar Setup</p>
              <p className="text-xs text-slate-400">{org.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {!steps && !running && !error && (
            <div className="text-center py-4 space-y-3">
              <p className="text-sm text-slate-600">
                Este processo vai verificar a conexão com Evolution e Chatwoot, e enviar uma mensagem de boas-vindas ao cliente via WhatsApp com o link de acesso.
              </p>
              <div className="p-3 rounded-xl text-left space-y-1.5" style={{ background: '#f9fafb', border: '1px solid #f2f4f7' }}>
                {[
                  'Verificar dados da Evolution API',
                  'Confirmar WhatsApp conectado',
                  'Testar acesso ao Chatwoot',
                  'Gerar link de acesso do cliente',
                  'Enviar mensagem de boas-vindas',
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                      style={{ background: '#e4e7ec', color: '#667085' }}>
                      {i + 1}
                    </span>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          )}

          {running && (
            <div className="flex flex-col items-center py-6 gap-3">
              <div className="w-10 h-10 border-[3px] border-brand-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium text-slate-500">Executando verificações...</p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-3 p-4 rounded-xl" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
              <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {steps && (
            <div className="space-y-2">
              {/* Resultado geral */}
              <div className="flex items-center gap-2 p-3 rounded-xl mb-3"
                style={{
                  background: allOk ? '#f0fdf4' : '#fffbeb',
                  border: `1px solid ${allOk ? '#bbf7d0' : '#fde68a'}`,
                }}>
                {allOk
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  : <Zap className="w-4 h-4 text-amber-500 shrink-0" />}
                <p className="text-xs font-semibold" style={{ color: allOk ? '#15803d' : '#92400e' }}>
                  {allOk
                    ? 'Setup finalizado! Mensagem enviada com sucesso.'
                    : 'Alguns itens precisam de atenção. Corrija os problemas abaixo e tente novamente.'}
                </p>
              </div>

              {steps.map(step => (
                <div
                  key={step.id}
                  className="flex items-start gap-3 p-3.5 rounded-xl"
                  style={{
                    background: step.ok ? '#f9fafb' : '#fef9f9',
                    border: `1px solid ${step.ok ? '#f2f4f7' : '#fde8e8'}`,
                  }}
                >
                  {step.ok
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                    : <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold" style={{ color: step.ok ? '#344054' : '#b91c1c' }}>
                      {step.label}
                    </p>
                    <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: step.ok ? '#667085' : '#dc2626' }}>
                      {step.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4" style={{ borderTop: '1px solid #f2f4f7' }}>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{ color: '#667085', border: '1px solid #e4e7ec' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f9fafb' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            Fechar
          </button>
          <button
            onClick={runSetup}
            disabled={running}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #2C82B5, #2570a0)' }}
          >
            {running
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Verificando...</>
              : hasErrors
                ? <><Zap className="w-4 h-4" /> Tentar Novamente</>
                : steps
                  ? <><CheckCircle2 className="w-4 h-4" /> Concluído</>
                  : <><Zap className="w-4 h-4" /> Executar Setup</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminClients() {
  const [orgs, setOrgs]       = useState<Organization[]>([])
  const [search, setSearch]   = useState('')
  const [planTab, setPlanTab] = useState<PlanFilter>('todos')
  const [loading, setLoading] = useState(true)
  const [setupOrg, setSetupOrg] = useState<Organization | null>(null)

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

      {/* Modal */}
      {setupOrg && <SetupModal org={setupOrg} onClose={() => setSetupOrg(null)} />}

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
                {filtered.map((org, i) => (
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
                        {(() => {
                          const done = !!(org.evolution_instance && org.evolution_token && org.chatwoot_account_id && org.chatwoot_token)
                          return done ? (
                            <button
                              onClick={() => setSetupOrg(org)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:-translate-y-[1px]"
                              style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d' }}
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              Setup OK
                            </button>
                          ) : (
                            <button
                              onClick={() => setSetupOrg(org)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white transition-all hover:shadow-[0_3px_10px_rgba(44,130,181,0.4)] hover:-translate-y-[1px]"
                              style={{ background: 'linear-gradient(135deg, #2C82B5, #2570a0)' }}
                            >
                              <Zap className="w-3 h-3" />
                              Finalizar SETUP
                            </button>
                          )
                        })()}
                        <Link to={`/admin/clients/${org.id}`}>
                          <button className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 border border-slate-200 hover:text-brand-600 hover:border-brand-200 hover:bg-brand-50 transition-all">
                            Gerenciar
                          </button>
                        </Link>
                      </div>
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
