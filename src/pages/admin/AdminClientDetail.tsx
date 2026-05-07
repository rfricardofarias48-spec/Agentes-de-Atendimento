import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Trash2, Wifi, WifiOff, RefreshCw, CheckCircle2, XCircle, Loader2, Zap, KeyRound } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { type Organization, type OrgPlan, type OrgStatus } from '../../types'
import { planLabel, statusLabel, formatDate } from '../../lib/utils'

interface SetupStep {
  id: string
  label: string
  ok: boolean
  detail: string
}

interface SetupResult {
  steps: SetupStep[]
  webhookUrl?: string
}

const plans: OrgPlan[] = ['starter', 'pro', 'clinic']
const statuses: OrgStatus[] = ['active', 'trial', 'inactive', 'suspended']

const maxConvByPlan: Record<OrgPlan, number> = { starter: 600, pro: 2000, clinic: 999999 }

const PLAN_PRICES: Record<OrgPlan, number> = { starter: 397, pro: 797, clinic: 1497 }

const planColors: Record<string, string> = {
  starter: 'border-zinc-300 text-zinc-600',
  pro: 'border-blue-400 text-blue-700',
  clinic: 'border-green-400 text-green-700',
}

const statusColors: Record<string, string> = {
  active: 'border-green-400 text-green-700',
  trial: 'border-yellow-400 text-yellow-700',
  inactive: 'border-zinc-300 text-zinc-500',
  suspended: 'border-red-400 text-red-600',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-black text-zinc-500 uppercase tracking-wider mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function TextInput({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 text-sm bg-white text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
    />
  )
}

export default function AdminClientDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isNew = id === 'new'

  const [org, setOrg] = useState<Partial<Organization>>({
    name: '', slug: '', plan: 'starter', status: 'trial',
    whatsapp_numbers: [], agent_tone: 'friendly',
    max_conversations_month: 600, conversations_used: 0,
  })
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'open' | 'connecting' | 'close'>('unknown')
  const [checkingConn, setCheckingConn] = useState(false)
  const [setupResult, setSetupResult] = useState<SetupResult | null>(null)
  const [settingUp, setSettingUp] = useState(false)
  const [newPass, setNewPass] = useState('')
  const [resetMsg, setResetMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    if (!isNew && id) {
      supabase.from('organizations').select('*').eq('id', id).single()
        .then(({ data }) => { if (data) setOrg(data); setLoading(false) })
    }
  }, [id, isNew])

  function handlePlanChange(plan: OrgPlan) {
    setOrg(o => ({ ...o, plan, max_conversations_month: maxConvByPlan[plan] }))
  }

  async function checkEvolutionConnection() {
    if (!org.evolution_instance) return
    setCheckingConn(true)
    try {
      const res = await fetch(`/api/evolution/status/${org.evolution_instance}`)
      const data = await res.json()
      setConnectionStatus(data.state || 'unknown')
    } catch {
      setConnectionStatus('close')
    } finally {
      setCheckingConn(false)
    }
  }

  async function handleResetPassword() {
    if (!newPass) return
    setResetting(true)
    setResetMsg(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ orgId: id, newPassword: newPass }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (data.ok) {
        setResetMsg({ ok: true, text: 'Senha redefinida com sucesso.' })
        setNewPass('')
      } else {
        setResetMsg({ ok: false, text: data.error || 'Erro ao redefinir senha.' })
      }
    } catch (e) {
      setResetMsg({ ok: false, text: String(e) })
    } finally {
      setResetting(false)
    }
  }

  async function runSetup(orgId: string) {
    setSettingUp(true)
    setSetupResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/setup-org', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ orgId }),
      })
      const data = await res.json() as SetupResult
      setSetupResult(data)
    } catch (e) {
      setSetupResult({ steps: [{ id: 'error', label: 'Erro', ok: false, detail: String(e) }] })
    } finally {
      setSettingUp(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setSetupResult(null)
    const payload = {
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      status: org.status,
      whatsapp_numbers: org.whatsapp_numbers ?? [],
      agent_tone: org.agent_tone ?? 'friendly',
      max_conversations_month: org.max_conversations_month,
      conversations_used: isNew ? 0 : org.conversations_used,
      evolution_instance: org.evolution_instance ?? null,
      evolution_token: org.evolution_token ?? null,
      chatwoot_account_id: org.chatwoot_account_id ?? null,
      chatwoot_token: org.chatwoot_token ?? null,
      chatwoot_inbox_id: org.chatwoot_inbox_id ?? null,
      google_calendar_id: org.google_calendar_id ?? null,
      asaas_key: org.asaas_key ?? null,
    }

    if (isNew) {
      const { data: newOrg, error } = await supabase
        .from('organizations')
        .insert(payload)
        .select()
        .single()

      if (error) { alert('Erro ao criar usuário: ' + error.message); setSaving(false); return }

      if (newEmail && newPassword && newOrg) {
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email: newEmail, password: newPassword, email_confirm: true,
        })
        if (!authError && authData.user) {
          await supabase.from('user_profiles').insert({
            user_id: authData.user.id, org_id: newOrg.id, role: 'client',
          })
        }
      }

      setSaving(false)
      navigate(`/admin/clients/${newOrg?.id}`)
    } else {
      const { error } = await supabase.from('organizations').update(payload).eq('id', id!)
      setSaving(false)
      if (error) {
        alert('Erro ao salvar: ' + error.message)
        return
      }
      // Se tem instância Evolution preenchida, roda o setup automático
      if (org.evolution_instance && org.evolution_token) {
        await runSetup(id!)
      }
    }
  }

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-6 h-6 border-2 border-zinc-300 border-t-zinc-900 rounded-full animate-spin" />
    </div>
  )

  const connIcon = connectionStatus === 'open'
    ? <Wifi className="w-4 h-4 text-green-500" />
    : connectionStatus === 'connecting'
      ? <Wifi className="w-4 h-4 text-yellow-500" />
      : <WifiOff className="w-4 h-4 text-zinc-400" />

  return (
    <div className="space-y-6 pb-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/admin/clients')}
          className="p-2 rounded-xl text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-2xl font-black text-zinc-900 tracking-tight">
            {isNew ? 'Novo Usuário' : org.name}
          </h1>
          {!isNew && org.created_at && (
            <p className="text-xs text-zinc-400 font-medium mt-0.5">Criado em {formatDate(org.created_at)}</p>
          )}
        </div>
        {!isNew && (
          <div className="ml-auto flex items-center gap-1.5 text-xs font-bold text-zinc-500">
            {connIcon}
            <span className="capitalize">{connectionStatus === 'unknown' ? 'Não verificado' : connectionStatus}</span>
          </div>
        )}
      </div>

      {/* Layout em duas colunas */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">

        {/* Coluna esquerda */}
        <div className="space-y-6">

          {/* Dados básicos */}
          <div className="bg-white rounded-[1.75rem] border border-zinc-100 shadow-sm p-6 space-y-5">
            <p className="font-black text-zinc-900 text-sm uppercase tracking-wider">Dados da Clínica</p>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Nome">
                <TextInput value={org.name ?? ''} onChange={v => setOrg(o => ({ ...o, name: v }))} placeholder="Clínica São Lucas" />
              </Field>
              <Field label="Slug">
                <TextInput
                  value={org.slug ?? ''}
                  onChange={v => setOrg(o => ({ ...o, slug: v.toLowerCase().replace(/\s+/g, '-') }))}
                  placeholder="clinica-sao-lucas"
                />
              </Field>
            </div>

            <Field label="Plano">
              <div className="flex gap-2 flex-wrap">
                {plans.map(p => (
                  <button
                    key={p}
                    onClick={() => handlePlanChange(p)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-black border-2 transition-all ${
                      org.plan === p
                        ? `${planColors[p]} bg-white shadow-sm`
                        : 'border-zinc-200 text-zinc-400 hover:border-zinc-300'
                    }`}
                  >
                    {planLabel(p)}
                    <span className="ml-1.5 text-[10px] text-zinc-400">R${PLAN_PRICES[p]}</span>
                  </button>
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Status">
                <div className="flex gap-2 flex-wrap">
                  {statuses.map(s => (
                    <button
                      key={s}
                      onClick={() => setOrg(o => ({ ...o, status: s }))}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-black border-2 transition-all ${
                        org.status === s
                          ? `${statusColors[s]} bg-white shadow-sm`
                          : 'border-zinc-200 text-zinc-400 hover:border-zinc-300'
                      }`}
                    >
                      {statusLabel(s)}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Tom do Agente">
                <div className="flex gap-2">
                  {(['formal', 'friendly'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setOrg(o => ({ ...o, agent_tone: t }))}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-black border-2 transition-all ${
                        org.agent_tone === t
                          ? 'border-zinc-900 text-zinc-900 bg-white shadow-sm'
                          : 'border-zinc-200 text-zinc-400 hover:border-zinc-300'
                      }`}
                    >
                      {t === 'formal' ? 'Formal' : 'Amigável'}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          </div>

          {/* Outras integrações */}
          <div className="bg-white rounded-[1.75rem] border border-zinc-100 shadow-sm p-6 space-y-5">
            <p className="font-black text-zinc-900 text-sm uppercase tracking-wider">Outras Integrações</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Google Calendar ID">
                <TextInput
                  value={org.google_calendar_id ?? ''}
                  onChange={v => setOrg(o => ({ ...o, google_calendar_id: v }))}
                  placeholder="email@gmail.com"
                />
              </Field>
              <Field label="Asaas API Key">
                <TextInput
                  value={org.asaas_key ?? ''}
                  onChange={v => setOrg(o => ({ ...o, asaas_key: v }))}
                  placeholder="$aas_..."
                  type="password"
                />
              </Field>
            </div>
          </div>

          {/* Criar usuário (apenas novo) */}
          {isNew && (
            <div className="bg-white rounded-[1.75rem] border border-zinc-100 shadow-sm p-6 space-y-5">
              <p className="font-black text-zinc-900 text-sm uppercase tracking-wider">Acesso ao Dashboard</p>
              <div className="grid grid-cols-2 gap-4">
                <Field label="E-mail do cliente">
                  <TextInput type="email" value={newEmail} onChange={setNewEmail} placeholder="dono@clinica.com" />
                </Field>
                <Field label="Senha inicial">
                  <TextInput type="password" value={newPassword} onChange={setNewPassword} placeholder="Senha provisória" />
                </Field>
              </div>
              <p className="text-xs text-zinc-400">O usuário pode alterar a senha após o primeiro acesso.</p>
            </div>
          )}

          {/* Redefinir senha (apenas edição) */}
          {!isNew && (
            <div className="bg-white rounded-[1.75rem] border border-zinc-100 shadow-sm p-6 space-y-4">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-zinc-400" />
                <p className="font-black text-zinc-900 text-sm uppercase tracking-wider">Redefinir Senha</p>
              </div>

              <div className="flex gap-3">
                <input
                  type="password"
                  value={newPass}
                  onChange={e => { setNewPass(e.target.value); setResetMsg(null) }}
                  placeholder="Nova senha (mín. 6 caracteres)"
                  className="flex-1 px-3.5 py-2.5 rounded-xl border border-zinc-200 text-sm bg-white text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                />
                <button
                  onClick={handleResetPassword}
                  disabled={resetting || newPass.length < 6}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-bold hover:bg-zinc-800 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {resetting
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <KeyRound className="w-4 h-4" />
                  }
                  {resetting ? 'Salvando...' : 'Redefinir'}
                </button>
              </div>

              {resetMsg && (
                <div className={`flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-lg ${
                  resetMsg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                }`}>
                  {resetMsg.ok
                    ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    : <XCircle className="w-3.5 h-3.5 shrink-0" />
                  }
                  {resetMsg.text}
                </div>
              )}
            </div>
          )}

        </div>{/* /coluna esquerda */}

        {/* Coluna direita */}
        <div className="space-y-6">

          {/* Evolution API */}
          <div className="bg-white rounded-[1.75rem] border border-zinc-100 shadow-sm p-6 space-y-5">
            <div className="flex items-center justify-between">
              <p className="font-black text-zinc-900 text-sm uppercase tracking-wider">Evolution API</p>
              {org.evolution_instance && (
                <button
                  onClick={checkEvolutionConnection}
                  disabled={checkingConn}
                  className="flex items-center gap-1.5 text-xs font-bold text-zinc-500 hover:text-zinc-800 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checkingConn ? 'animate-spin' : ''}`} />
                  Verificar conexão
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Nome da Instância">
                <TextInput
                  value={org.evolution_instance ?? ''}
                  onChange={v => setOrg(o => ({ ...o, evolution_instance: v }))}
                  placeholder="AgenteClin-Demo"
                />
              </Field>
              <Field label="Token da Instância">
                <TextInput
                  value={org.evolution_token ?? ''}
                  onChange={v => setOrg(o => ({ ...o, evolution_token: v }))}
                  placeholder="415C2136-..."
                  type="password"
                />
              </Field>
            </div>
          </div>

          {/* Chatwoot */}
          <div className="bg-white rounded-[1.75rem] border border-zinc-100 shadow-sm p-6 space-y-5">
            <p className="font-black text-zinc-900 text-sm uppercase tracking-wider">Chatwoot</p>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Account ID">
                <TextInput
                  value={org.chatwoot_account_id != null ? String(org.chatwoot_account_id) : ''}
                  onChange={v => setOrg(o => ({ ...o, chatwoot_account_id: v ? Number(v) : undefined }))}
                  placeholder="1"
                />
              </Field>
              <Field label="Inbox ID">
                <TextInput
                  value={org.chatwoot_inbox_id != null ? String(org.chatwoot_inbox_id) : ''}
                  onChange={v => setOrg(o => ({ ...o, chatwoot_inbox_id: v ? Number(v) : undefined }))}
                  placeholder="3"
                />
              </Field>
            </div>
            <Field label="Token do Agente">
              <TextInput
                value={org.chatwoot_token ?? ''}
                onChange={v => setOrg(o => ({ ...o, chatwoot_token: v }))}
                placeholder="token do inbox"
                type="password"
              />
            </Field>
          </div>

        </div>{/* /coluna direita */}
      </div>{/* /grid duas colunas */}

      {/* Painel de setup automático */}
      {(settingUp || setupResult) && (
        <div className="bg-white rounded-[1.75rem] border border-zinc-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Zap className={`w-4 h-4 ${settingUp ? 'text-yellow-500 animate-pulse' : 'text-green-500'}`} />
            <p className="font-black text-zinc-900 text-sm uppercase tracking-wider">
              {settingUp ? 'Configurando automaticamente...' : 'Resultado do Setup'}
            </p>
          </div>

          {settingUp && (
            <div className="flex items-center gap-3 text-zinc-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Configurando webhook, Chatwoot e agente...
            </div>
          )}

          {setupResult && (
            <div className="space-y-2">
              {setupResult.steps.map(step => (
                <div key={step.id} className="flex items-start gap-3 p-3 rounded-xl bg-zinc-50">
                  {step.ok
                    ? <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    : <XCircle className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />
                  }
                  <div className="min-w-0">
                    <p className={`text-xs font-black ${step.ok ? 'text-zinc-800' : 'text-zinc-500'}`}>
                      {step.label}
                    </p>
                    <p className="text-[11px] text-zinc-400 mt-0.5">{step.detail}</p>
                  </div>
                </div>
              ))}

              {setupResult.webhookUrl && (
                <p className="text-[11px] text-zinc-400 pt-1 font-mono break-all">
                  Webhook: {setupResult.webhookUrl}
                </p>
              )}

              {!isNew && org.evolution_instance && (
                <button
                  onClick={() => runSetup(id!)}
                  disabled={settingUp}
                  className="flex items-center gap-1.5 text-xs font-bold text-zinc-500 hover:text-zinc-800 mt-2 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Rodar novamente
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Ações */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || settingUp}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-bold hover:bg-zinc-800 disabled:opacity-60 transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Salvando...' : settingUp ? 'Configurando...' : 'Salvar'}
        </button>

        {!isNew && org.evolution_instance && !setupResult && (
          <button
            onClick={() => runSetup(id!)}
            disabled={settingUp}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 text-zinc-600 text-sm font-bold hover:bg-zinc-50 disabled:opacity-50 transition-colors"
          >
            <Zap className="w-4 h-4 text-yellow-500" />
            Setup automático
          </button>
        )}

        {!isNew && (
          <button
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 text-red-500 text-sm font-bold hover:bg-red-50 transition-colors ml-auto"
            onClick={async () => {
              if (!confirm(`Remover "${org.name}"? Ação irreversível.`)) return
              await supabase.from('organizations').delete().eq('id', id!)
              navigate('/admin/clients')
            }}
          >
            <Trash2 className="w-4 h-4" />
            Remover Usuário
          </button>
        )}
      </div>
    </div>
  )
}
