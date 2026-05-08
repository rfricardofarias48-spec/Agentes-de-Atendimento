import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Save, Trash2, Wifi, WifiOff, RefreshCw,
  CheckCircle2, XCircle, Loader2, Zap, KeyRound,
  Bot, Settings2, Upload, Plus, X, FileText, ChevronDown,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { type Organization, type OrgPlan, type OrgStatus } from '../../types'
import { planLabel, statusLabel, formatDate } from '../../lib/utils'

interface SetupStep { id: string; label: string; ok: boolean; detail: string }
interface SetupResult { steps: SetupStep[]; webhookUrl?: string }
interface Service {
  id: string
  name: string
  description: string
  price: string
  pdf_url: string | null
  pdf_name: string | null
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

function Card({ title, children, extra }: { title: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-[1.75rem] border border-zinc-100 shadow-sm p-6 space-y-5">
      <div className="flex items-center justify-between">
        <p className="font-black text-zinc-900 text-sm uppercase tracking-wider">{title}</p>
        {extra}
      </div>
      {children}
    </div>
  )
}

export default function AdminClientDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isNew = id === 'new'

  // ── Aba ───────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'geral' | 'agente'>('geral')

  // ── Org ───────────────────────────────────────────────────────
  const [org, setOrg] = useState<Partial<Organization>>({
    name: '', slug: '', plan: 'starter', status: 'trial',
    whatsapp_numbers: [], agent_tone: 'friendly',
    max_conversations_month: 600, conversations_used: 0,
  })
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)

  // ── Criar usuário (novo) ──────────────────────────────────────
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')

  // ── Conexão Evolution ─────────────────────────────────────────
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'open' | 'connecting' | 'close'>('unknown')
  const [checkingConn, setCheckingConn] = useState(false)

  // ── Setup automático ──────────────────────────────────────────
  const [setupResult, setSetupResult] = useState<SetupResult | null>(null)
  const [settingUp, setSettingUp] = useState(false)

  // ── Reset senha ───────────────────────────────────────────────
  const [newPass, setNewPass] = useState('')
  const [resetEmail, setResetEmail] = useState('')
  const [resetMsg, setResetMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [resetting, setResetting] = useState(false)

  // ── Agent settings ────────────────────────────────────────────
  const [agentId, setAgentId] = useState<string | null>(null)
  const [agentName, setAgentName] = useState('Assistente')
  const [agentGreeting, setAgentGreeting] = useState('')
  const [agentTone, setAgentTone] = useState<'friendly' | 'formal'>('friendly')
  const [agentInstructions, setAgentInstructions] = useState('')
  const [services, setServices] = useState<Service[]>([])
  const [showAddService, setShowAddService] = useState(false)
  const [newService, setNewService] = useState({ name: '', description: '', price: '' })
  const [expandedService, setExpandedService] = useState<string | null>(null)
  const [savingAgent, setSavingAgent] = useState(false)
  const [agentMsg, setAgentMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [uploadingPdf, setUploadingPdf] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadTarget, setUploadTarget] = useState<string | null>(null)

  // ── Load ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isNew && id) {
      Promise.all([
        supabase.from('organizations').select('*').eq('id', id).single(),
        supabase.from('agent_settings').select('*').eq('org_id', id).single(),
      ]).then(([{ data: orgData }, { data: settings }]) => {
        if (orgData) setOrg(orgData)
        if (settings) {
          setAgentId(settings.id)
          setAgentName(settings.agent_name || 'Assistente')
          setAgentGreeting(settings.greeting_message || '')
          setAgentTone(settings.tone === 'formal' ? 'formal' : 'friendly')
          setAgentInstructions(settings.custom_instructions || '')
          setServices(settings.services || [])
        }
        setLoading(false)
      })
    }
  }, [id, isNew])

  // ── Handlers org ──────────────────────────────────────────────
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
        body: JSON.stringify({ orgId: id, newPassword: newPass, email: resetEmail || undefined }),
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
    }

    if (isNew) {
      const { data: newOrg, error } = await supabase
        .from('organizations').insert(payload).select().single()
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
      if (error) { alert('Erro ao salvar: ' + error.message); return }
      if (org.evolution_instance && org.evolution_token) await runSetup(id!)
    }
  }

  // ── Handlers agente ───────────────────────────────────────────
  async function handleSaveAgent() {
    setSavingAgent(true)
    setAgentMsg(null)
    const payload = {
      org_id: id,
      agent_name: agentName,
      greeting_message: agentGreeting,
      tone: agentTone,
      specialties: services.map(s => s.name),
      custom_instructions: agentInstructions,
      services,
    }
    const { error } = agentId
      ? await supabase.from('agent_settings').update(payload).eq('id', agentId)
      : await supabase.from('agent_settings').insert(payload)

    if (error) setAgentMsg({ ok: false, text: error.message })
    else {
      setAgentMsg({ ok: true, text: 'Configurações do agente salvas.' })
      if (!agentId) {
        const { data } = await supabase.from('agent_settings').select('id').eq('org_id', id!).single()
        if (data) setAgentId(data.id)
      }
    }
    setSavingAgent(false)
  }

  function addService() {
    if (!newService.name.trim()) return
    setServices(prev => [...prev, {
      id: crypto.randomUUID(),
      name: newService.name.trim(),
      description: newService.description.trim(),
      price: newService.price.trim(),
      pdf_url: null,
      pdf_name: null,
    }])
    setNewService({ name: '', description: '', price: '' })
    setShowAddService(false)
  }

  function removeService(serviceId: string) {
    setServices(prev => prev.filter(s => s.id !== serviceId))
  }

  function triggerPdfUpload(serviceId: string) {
    setUploadTarget(serviceId)
    fileInputRef.current?.click()
  }

  async function handlePdfFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !uploadTarget) return
    e.target.value = ''

    setUploadingPdf(uploadTarget)
    try {
      const slug = uploadTarget
      const path = `${id}/${slug}.pdf`
      const { error: upErr } = await supabase.storage
        .from('specialty-pdfs')
        .upload(path, file, { upsert: true, contentType: 'application/pdf' })

      if (upErr) { alert('Erro no upload: ' + upErr.message); return }

      const { data: { publicUrl } } = supabase.storage.from('specialty-pdfs').getPublicUrl(path)

      setServices(prev => prev.map(s =>
        s.id === uploadTarget ? { ...s, pdf_url: publicUrl, pdf_name: file.name } : s
      ))
    } finally {
      setUploadingPdf(null)
      setUploadTarget(null)
    }
  }

  function removePdf(serviceId: string) {
    setServices(prev => prev.map(s => s.id === serviceId ? { ...s, pdf_url: null, pdf_name: null } : s))
  }

  // ── Render helpers ────────────────────────────────────────────
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
      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handlePdfFileChange} />

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/admin/clients')} className="p-2 rounded-xl text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors">
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

      {/* Sub-abas (só em edição) */}
      {!isNew && (
        <div className="flex gap-1 p-1 bg-zinc-100 rounded-2xl w-fit">
          {([
            { key: 'geral', label: 'Geral', icon: Settings2 },
            { key: 'agente', label: 'Agente', icon: Bot },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                activeTab === tab.key
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* ══ ABA GERAL ══════════════════════════════════════════════ */}
      {(isNew || activeTab === 'geral') && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">

            {/* Coluna esquerda */}
            <div className="space-y-6">
              <Card title="Dados da Clínica">
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
                      <button key={p} onClick={() => handlePlanChange(p)}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-black border-2 transition-all ${
                          org.plan === p ? `${planColors[p]} bg-white shadow-sm` : 'border-zinc-200 text-zinc-400 hover:border-zinc-300'
                        }`}
                      >
                        {planLabel(p)}<span className="ml-1.5 text-[10px] text-zinc-400">R${PLAN_PRICES[p]}</span>
                      </button>
                    ))}
                  </div>
                </Field>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Status">
                    <div className="flex gap-2 flex-wrap">
                      {statuses.map(s => (
                        <button key={s} onClick={() => setOrg(o => ({ ...o, status: s }))}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-black border-2 transition-all ${
                            org.status === s ? `${statusColors[s]} bg-white shadow-sm` : 'border-zinc-200 text-zinc-400 hover:border-zinc-300'
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
                        <button key={t} onClick={() => setOrg(o => ({ ...o, agent_tone: t }))}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-black border-2 transition-all ${
                            org.agent_tone === t ? 'border-zinc-900 text-zinc-900 bg-white shadow-sm' : 'border-zinc-200 text-zinc-400 hover:border-zinc-300'
                          }`}
                        >
                          {t === 'formal' ? 'Formal' : 'Amigável'}
                        </button>
                      ))}
                    </div>
                  </Field>
                </div>
              </Card>

              {/* Criar usuário (novo) */}
              {isNew && (
                <Card title="Acesso ao Dashboard">
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="E-mail do cliente">
                      <TextInput type="email" value={newEmail} onChange={setNewEmail} placeholder="dono@clinica.com" />
                    </Field>
                    <Field label="Senha inicial">
                      <TextInput type="password" value={newPassword} onChange={setNewPassword} placeholder="Senha provisória" />
                    </Field>
                  </div>
                  <p className="text-xs text-zinc-400">O usuário pode alterar a senha após o primeiro acesso.</p>
                </Card>
              )}

              {/* Redefinir senha (edição) */}
              {!isNew && (
                <div className="bg-white rounded-[1.75rem] border border-zinc-100 shadow-sm p-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-zinc-400" />
                    <p className="font-black text-zinc-900 text-sm uppercase tracking-wider">Redefinir Senha</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="email"
                      value={resetEmail}
                      onChange={e => { setResetEmail(e.target.value); setResetMsg(null) }}
                      placeholder="E-mail do usuário (se não vinculado)"
                      className="px-3.5 py-2.5 rounded-xl border border-zinc-200 text-sm bg-white text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                    />
                    <input
                      type="password"
                      value={newPass}
                      onChange={e => { setNewPass(e.target.value); setResetMsg(null) }}
                      placeholder="Nova senha (mín. 6 caracteres)"
                      className="px-3.5 py-2.5 rounded-xl border border-zinc-200 text-sm bg-white text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                    />
                  </div>
                  <button
                    onClick={handleResetPassword}
                    disabled={resetting || newPass.length < 6}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-bold hover:bg-zinc-800 disabled:opacity-50 transition-colors"
                  >
                    {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                    {resetting ? 'Salvando...' : 'Redefinir Senha'}
                  </button>
                  {resetMsg && (
                    <div className={`flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-lg ${resetMsg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                      {resetMsg.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}
                      {resetMsg.text}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Coluna direita */}
            <div className="space-y-6">
              <Card
                title="Evolution API"
                extra={org.evolution_instance ? (
                  <button onClick={checkEvolutionConnection} disabled={checkingConn}
                    className="flex items-center gap-1.5 text-xs font-bold text-zinc-500 hover:text-zinc-800 transition-colors disabled:opacity-50">
                    <RefreshCw className={`w-3.5 h-3.5 ${checkingConn ? 'animate-spin' : ''}`} />
                    Verificar conexão
                  </button>
                ) : undefined}
              >
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Nome da Instância">
                    <TextInput value={org.evolution_instance ?? ''} onChange={v => setOrg(o => ({ ...o, evolution_instance: v }))} placeholder="AgenteClin-Demo" />
                  </Field>
                  <Field label="Token da Instância">
                    <TextInput value={org.evolution_token ?? ''} onChange={v => setOrg(o => ({ ...o, evolution_token: v }))} placeholder="415C2136-..." type="password" />
                  </Field>
                </div>
              </Card>

              <Card title="Chatwoot">
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
                  <TextInput value={org.chatwoot_token ?? ''} onChange={v => setOrg(o => ({ ...o, chatwoot_token: v }))} placeholder="token do inbox" type="password" />
                </Field>
              </Card>
            </div>
          </div>

          {/* Setup result */}
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
                        : <XCircle className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />}
                      <div className="min-w-0">
                        <p className={`text-xs font-black ${step.ok ? 'text-zinc-800' : 'text-zinc-500'}`}>{step.label}</p>
                        <p className="text-[11px] text-zinc-400 mt-0.5">{step.detail}</p>
                      </div>
                    </div>
                  ))}
                  {setupResult.webhookUrl && (
                    <p className="text-[11px] text-zinc-400 pt-1 font-mono break-all">Webhook: {setupResult.webhookUrl}</p>
                  )}
                  {!isNew && org.evolution_instance && (
                    <button onClick={() => runSetup(id!)} disabled={settingUp}
                      className="flex items-center gap-1.5 text-xs font-bold text-zinc-500 hover:text-zinc-800 mt-2 transition-colors disabled:opacity-50">
                      <RefreshCw className="w-3.5 h-3.5" />
                      Rodar novamente
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Ações Geral */}
          <div className="flex items-center gap-3">
            <button onClick={handleSave} disabled={saving || settingUp}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-bold hover:bg-zinc-800 disabled:opacity-60 transition-colors">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Salvando...' : settingUp ? 'Configurando...' : 'Salvar'}
            </button>

            {!isNew && org.evolution_instance && !setupResult && (
              <button onClick={() => runSetup(id!)} disabled={settingUp}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 text-zinc-600 text-sm font-bold hover:bg-zinc-50 disabled:opacity-50 transition-colors">
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
        </>
      )}

      {/* ══ ABA AGENTE ═════════════════════════════════════════════ */}
      {!isNew && activeTab === 'agente' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">

            {/* Coluna esquerda */}
            <div className="space-y-6">
              <Card title="Perfil do Agente">
                <Field label="Nome do Agente">
                  <TextInput value={agentName} onChange={setAgentName} placeholder="Assistente" />
                </Field>
                <Field label="Tom de Voz">
                  <div className="flex gap-2">
                    {(['friendly', 'formal'] as const).map(t => (
                      <button key={t} onClick={() => setAgentTone(t)}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-black border-2 transition-all ${
                          agentTone === t ? 'border-zinc-900 text-zinc-900 bg-white shadow-sm' : 'border-zinc-200 text-zinc-400 hover:border-zinc-300'
                        }`}
                      >
                        {t === 'friendly' ? 'Amigável' : 'Formal'}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Mensagem de Saudação">
                  <textarea
                    value={agentGreeting}
                    onChange={e => setAgentGreeting(e.target.value)}
                    placeholder="Olá! Sou a assistente da Clínica X. Como posso ajudar?"
                    rows={3}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 text-sm bg-white text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 resize-none"
                  />
                </Field>
              </Card>

              <Card title="Instruções Personalizadas">
                <p className="text-xs text-zinc-400 -mt-2">
                  Adicione conhecimento específico da clínica: convênios aceitos, horários, procedimentos, regras de atendimento, etc.
                </p>
                <textarea
                  value={agentInstructions}
                  onChange={e => setAgentInstructions(e.target.value)}
                  placeholder={`Ex: Aceitamos os convênios Unimed, Bradesco e Amil.\nFuncionamos de segunda a sexta das 8h às 18h.\nRetornos devem ser agendados em até 30 dias.`}
                  rows={8}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 text-sm bg-white text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 resize-none font-mono"
                />
              </Card>
            </div>

            {/* Coluna direita */}
            <div className="space-y-6">
              {/* Serviços */}
              <div className="bg-white rounded-[1.75rem] border border-zinc-100 shadow-sm overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-6 pb-4">
                  <div>
                    <p className="font-black text-zinc-900 text-sm uppercase tracking-wider">Serviços</p>
                    <p className="text-xs text-zinc-400 mt-0.5">PDF enviado automaticamente ao confirmar agendamento</p>
                  </div>
                  <button
                    onClick={() => { setShowAddService(v => !v); setNewService({ name: '', description: '', price: '' }) }}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800 transition-colors shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Novo Serviço
                  </button>
                </div>

                {/* Formulário inline */}
                {showAddService && (
                  <div className="mx-6 mb-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1.5">Nome *</label>
                        <input
                          type="text"
                          value={newService.name}
                          onChange={e => setNewService(s => ({ ...s, name: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && addService()}
                          placeholder="Consulta Cardiologia"
                          className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm bg-white text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                          autoFocus
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1.5">Preço</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 font-bold pointer-events-none">R$</span>
                          <input
                            type="text"
                            value={newService.price}
                            onChange={e => setNewService(s => ({ ...s, price: e.target.value }))}
                            placeholder="150,00"
                            className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-zinc-200 text-sm bg-white text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                          />
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1.5">Descrição</label>
                      <input
                        type="text"
                        value={newService.description}
                        onChange={e => setNewService(s => ({ ...s, description: e.target.value }))}
                        placeholder="Detalhes do serviço para o agente informar ao paciente"
                        className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm bg-white text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={addService}
                        disabled={!newService.name.trim()}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-900 text-white text-sm font-bold hover:bg-zinc-800 disabled:opacity-40 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Adicionar
                      </button>
                      <button
                        onClick={() => setShowAddService(false)}
                        className="px-4 py-2 rounded-xl text-sm font-bold text-zinc-400 hover:text-zinc-600 transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {/* Lista */}
                {services.length > 0 ? (
                  <div className="divide-y divide-zinc-50">
                    {services.map(svc => {
                      const isOpen = expandedService === svc.id
                      const isUploading = uploadingPdf === svc.id
                      return (
                        <div key={svc.id}>
                          {/* Linha colapsada */}
                          <button
                            onClick={() => setExpandedService(isOpen ? null : svc.id)}
                            className="w-full flex items-center gap-4 px-6 py-4 hover:bg-zinc-50/80 transition-colors text-left"
                          >
                            <div className="flex-1 min-w-0 flex items-center gap-3">
                              <span className="text-sm font-bold text-zinc-900 truncate">{svc.name}</span>
                              {svc.price && (
                                <span className="text-xs font-black text-emerald-600 shrink-0">R$ {svc.price}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              {/* Indicador PDF */}
                              <div className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full ${
                                svc.pdf_url
                                  ? 'bg-emerald-50 text-emerald-600'
                                  : 'bg-zinc-100 text-zinc-400'
                              }`}>
                                <FileText className="w-3 h-3" />
                                {svc.pdf_url ? 'PDF' : 'Sem PDF'}
                              </div>
                              <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                            </div>
                          </button>

                          {/* Painel expandido */}
                          {isOpen && (
                            <div className="px-6 pb-5 pt-1 bg-zinc-50/60 border-t border-zinc-100">
                              {svc.description && (
                                <p className="text-xs text-zinc-500 mb-4">{svc.description}</p>
                              )}
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => triggerPdfUpload(svc.id)}
                                  disabled={isUploading}
                                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-200 bg-white text-xs font-bold text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 transition-colors disabled:opacity-50"
                                >
                                  {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                                  {isUploading ? 'Enviando...' : svc.pdf_url ? 'Trocar PDF' : 'Anexar PDF'}
                                </button>
                                {svc.pdf_url && (
                                  <>
                                    <span className="text-xs text-zinc-400 truncate max-w-[160px]">{svc.pdf_name}</span>
                                    <button onClick={() => removePdf(svc.id)} className="p-1.5 rounded-lg text-zinc-300 hover:text-red-400 transition-colors">
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                                <button
                                  onClick={() => removeService(svc.id)}
                                  className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-red-400 hover:bg-red-50 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Remover
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : !showAddService && (
                  <div className="text-center py-10 px-6 mb-2">
                    <div className="w-12 h-12 rounded-2xl bg-zinc-100 flex items-center justify-center mx-auto mb-3">
                      <FileText className="w-5 h-5 text-zinc-400" />
                    </div>
                    <p className="text-sm font-bold text-zinc-500">Nenhum serviço cadastrado</p>
                    <p className="text-xs text-zinc-400 mt-1">Adicione os serviços oferecidos pela clínica</p>
                  </div>
                )}

                {services.length > 0 && <div className="h-2" />}
              </div>
            </div>
          </div>

          {/* Ações Agente */}
          <div className="flex items-center gap-3">
            <button onClick={handleSaveAgent} disabled={savingAgent}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-bold hover:bg-zinc-800 disabled:opacity-60 transition-colors">
              {savingAgent ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {savingAgent ? 'Salvando...' : 'Salvar Configurações do Agente'}
            </button>
            {agentMsg && (
              <div className={`flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-lg ${agentMsg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                {agentMsg.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}
                {agentMsg.text}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
