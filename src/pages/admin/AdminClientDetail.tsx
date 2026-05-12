import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Save, Trash2, Wifi, WifiOff, RefreshCw,
  CheckCircle2, XCircle, Loader2, Zap, KeyRound,
  Bot, Settings2, Upload, Plus, X, FileText, ChevronDown, ArrowRight,
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
const PLAN_PRICES: Record<OrgPlan, number> = { starter: 299.90, pro: 449.90, clinic: 849.90 }

const CARD_STYLE: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e4e7ec',
  borderRadius: '1.125rem',
  boxShadow: '0 1px 3px rgba(16,24,40,0.06)',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: '#98a2b3' }}>{label}</label>
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
      className="input-dark w-full px-3.5 py-2.5 text-sm"
    />
  )
}

function Card({ title, children, extra }: { title: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div style={CARD_STYLE} className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-[13px] uppercase tracking-wider" style={{ color: '#344054' }}>{title}</p>
        {extra}
      </div>
      {children}
    </div>
  )
}

function ToggleGroup({ options, value, onChange }: {
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className="px-3.5 py-1.5 rounded-xl text-xs font-semibold border-2 transition-all"
          style={value === o.value ? {
            borderColor: '#4d9aca', color: '#2570a0',
            background: '#ffffff', boxShadow: '0 1px 3px rgba(16,24,40,0.08)',
          } : {
            borderColor: '#e4e7ec', color: '#98a2b3',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export default function AdminClientDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isNew = id === 'new'

  const [activeTab, setActiveTab] = useState<'geral' | 'agente'>('geral')

  // Org state
  const [org, setOrg] = useState<Partial<Organization>>({
    name: '', slug: '', plan: 'starter', status: 'active',
    whatsapp_numbers: [], agent_tone: 'friendly',
    max_conversations_month: 600, conversations_used: 0,
  })
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)

  // New user credentials
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')

  // Email do usuário vinculado (edição)
  const [linkedEmail, setLinkedEmail] = useState<string | null>(null)

  // Evolution connection
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'open' | 'connecting' | 'close'>('unknown')
  const [checkingConn, setCheckingConn] = useState(false)

  // Setup
  const [setupResult, setSetupResult] = useState<SetupResult | null>(null)
  const [settingUp, setSettingUp] = useState(false)
  const [createdOrgId, setCreatedOrgId] = useState<string | null>(null)

  // Password reset
  const [newPass, setNewPass] = useState('')
  const [resetEmail, setResetEmail] = useState('')
  const [resetMsg, setResetMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [resetting, setResetting] = useState(false)

  // Agent settings
  const [agentId, setAgentId] = useState<string | null>(null)
  const [agentName, setAgentName] = useState('Assistente')
  const [agentGreeting, setAgentGreeting] = useState('')
  const [agentTone, setAgentTone] = useState<'friendly' | 'formal'>('friendly')
  const [agentInstructions, setAgentInstructions] = useState('')
  const [services, setServices] = useState<Service[]>([])
  const [showAddService, setShowAddService] = useState(false)
  const [newService, setNewService] = useState({ name: '', description: '', price: '' })
  const [newServicePdf, setNewServicePdf] = useState<File | null>(null)
  const newServicePdfRef = useRef<HTMLInputElement>(null)
  const [expandedService, setExpandedService] = useState<string | null>(null)
  const [savingAgent, setSavingAgent] = useState(false)
  const [agentMsg, setAgentMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [uploadingPdf, setUploadingPdf] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadTarget, setUploadTarget] = useState<string | null>(null)

  useEffect(() => {
    if (!isNew && id) {
      Promise.all([
        supabase.from('organizations').select('*').eq('id', id).single(),
        supabase.from('agent_settings').select('*').eq('org_id', id).single(),
        fetch(`/api/admin/get-org-user?orgId=${id}`).then(r => r.json()),
      ]).then(([{ data: orgData }, { data: settings }, userInfo]) => {
        if (orgData) setOrg(orgData)
        if (settings) {
          setAgentId(settings.id)
          setAgentName(settings.agent_name || 'Assistente')
          setAgentGreeting(settings.greeting_message || '')
          setAgentTone(settings.tone === 'formal' ? 'formal' : 'friendly')
          setAgentInstructions(settings.custom_instructions || '')
          setServices(settings.services || [])
        }
        setLinkedEmail((userInfo as { email?: string }).email ?? null)
        setLoading(false)
      })
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
      agent_tone: agentTone,
      max_conversations_month: org.max_conversations_month,
      conversations_used: isNew ? 0 : org.conversations_used,
      evolution_instance: org.evolution_instance ?? null,
      evolution_token: org.evolution_token ?? null,
      chatwoot_account_id: org.chatwoot_account_id ?? null,
      chatwoot_token: org.chatwoot_token ?? null,
      chatwoot_inbox_id: org.chatwoot_inbox_id ?? null,
    }

    if (isNew) {
      // 1. Criar organização
      const { data: newOrg, error } = await supabase
        .from('organizations').insert(payload).select().single()
      if (error) { alert('Erro ao criar usuário: ' + error.message); setSaving(false); return }

      // 2. Criar usuário no Auth (server-side — requer service role)
      if (newEmail && newPassword && newOrg) {
        const { data: { session } } = await supabase.auth.getSession()
        const userRes = await fetch('/api/admin/create-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({ orgId: newOrg.id, email: newEmail, password: newPassword }),
        })
        const userData = await userRes.json() as { ok?: boolean; error?: string }
        if (!userData.ok) {
          alert('Aviso: Organização criada, mas erro ao criar acesso: ' + (userData.error ?? 'desconhecido'))
        }
      }

      // 3. Criar agent_settings com dados do formulário
      await supabase.from('agent_settings').insert({
        org_id: newOrg.id,
        agent_name: agentName || 'Assistente',
        greeting_message: agentGreeting || `Olá! Sou o assistente da ${newOrg.name}. Como posso ajudar?`,
        tone: agentTone,
        specialties: [],
        services: [],
        custom_instructions: '',
      })

      setSaving(false)
      setCreatedOrgId(newOrg.id)

      // 4. Rodar setup se Evolution configurada
      if (newOrg.evolution_instance && newOrg.evolution_token) {
        await runSetup(newOrg.id)
      }

    } else {
      // Atualizar org existente
      const { error } = await supabase.from('organizations').update(payload).eq('id', id!)
      setSaving(false)
      if (error) { alert('Erro ao salvar: ' + error.message); return }
      // Rodar setup se Evolution configurada
      if (org.evolution_instance && org.evolution_token) await runSetup(id!)
    }
  }

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

  async function addService() {
    if (!newService.name.trim()) return
    const serviceId = crypto.randomUUID()
    let pdf_url: string | null = null
    let pdf_name: string | null = null

    if (newServicePdf && id) {
      setUploadingPdf(serviceId)
      const path = `${id}/${serviceId}.pdf`
      const { error } = await supabase.storage
        .from('specialty-pdfs')
        .upload(path, newServicePdf, { upsert: true, contentType: 'application/pdf' })
      if (!error) {
        const { data: { publicUrl } } = supabase.storage.from('specialty-pdfs').getPublicUrl(path)
        pdf_url = publicUrl
        pdf_name = newServicePdf.name
      }
      setUploadingPdf(null)
    }

    setServices(prev => [...prev, {
      id: serviceId,
      name: newService.name.trim(),
      description: newService.description.trim(),
      price: newService.price.trim(),
      pdf_url,
      pdf_name,
    }])
    setNewService({ name: '', description: '', price: '' })
    setNewServicePdf(null)
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
      const path = `${id}/${uploadTarget}.pdf`
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

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-6 h-6 border-2 border-slate-200 border-t-brand-500 rounded-full animate-spin" />
    </div>
  )

  const connIcon = connectionStatus === 'open'
    ? <Wifi className="w-4 h-4 text-brand-500" />
    : connectionStatus === 'connecting'
      ? <Wifi className="w-4 h-4 text-amber-500" />
      : <WifiOff className="w-4 h-4 text-slate-400" />

  // ── Resultado de criação bem-sucedida ──────────────────────────────────────
  if (isNew && createdOrgId && !saving) {
    return (
      <div className="max-w-xl mx-auto space-y-6 py-12 animate-fade-up">
        <div style={CARD_STYLE} className="p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto"
            style={{ background: '#f0fdf4', border: '1px solid #b3d4ec' }}>
            <CheckCircle2 className="w-7 h-7 text-brand-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold" style={{ color: '#101828' }}>Usuário criado com sucesso!</h2>
            <p className="text-sm mt-1" style={{ color: '#98a2b3' }}>
              {newEmail ? `Login: ${newEmail}` : 'O usuário foi criado na plataforma.'}
            </p>
          </div>

          {/* Setup result */}
          {(settingUp || setupResult) && (
            <div className="text-left rounded-xl p-4 space-y-2" style={{ background: '#f9fafb', border: '1px solid #f2f4f7' }}>
              <div className="flex items-center gap-2 mb-3">
                <Zap className={`w-4 h-4 ${settingUp ? 'text-amber-500 animate-pulse' : 'text-brand-500'}`} />
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#344054' }}>
                  {settingUp ? 'Configurando automaticamente...' : 'Setup concluído'}
                </p>
              </div>
              {settingUp && (
                <div className="flex items-center gap-2 text-sm" style={{ color: '#98a2b3' }}>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Criando conta Chatwoot, configurando webhook e agente...
                </div>
              )}
              {setupResult?.steps.map(step => (
                <div key={step.id} className="flex items-start gap-2.5">
                  {step.ok
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-brand-500 mt-0.5 shrink-0" />
                    : <XCircle className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />}
                  <div>
                    <p className="text-xs font-semibold" style={{ color: step.ok ? '#344054' : '#98a2b3' }}>{step.label}</p>
                    <p className="text-[11px]" style={{ color: '#98a2b3' }}>{step.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => navigate(`/admin/clients/${createdOrgId}`)}
              className="btn-primary flex-1 flex items-center justify-center gap-2 py-2.5 text-sm"
            >
              Gerenciar cliente <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate('/admin/clients/new')}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors"
              style={{ border: '1px solid #e4e7ec', color: '#667085' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f9fafb' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <Plus className="w-4 h-4" /> Novo usuário
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-8 animate-fade-in">
      <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handlePdfFileChange} />

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/admin/clients')}
          className="p-2 rounded-xl transition-colors hover:bg-slate-100"
          style={{ color: '#98a2b3' }}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#101828' }}>
            {isNew ? 'Novo Usuário' : org.name}
          </h1>
          {!isNew && org.created_at && (
            <p className="text-xs font-medium mt-0.5" style={{ color: '#98a2b3' }}>Criado em {formatDate(org.created_at)}</p>
          )}
        </div>
        {!isNew && (
          <div className="ml-auto flex items-center gap-1.5 text-xs font-medium" style={{ color: '#98a2b3' }}>
            {connIcon}
            <span className="capitalize">{connectionStatus === 'unknown' ? 'Não verificado' : connectionStatus}</span>
          </div>
        )}
      </div>

      {/* Sub-abas (só edição) */}
      {!isNew && (
        <div
          className="flex gap-1 p-1 rounded-2xl w-fit"
          style={{ background: '#f0f2f5', border: '1px solid #e4e7ec' }}
        >
          {([
            { key: 'geral', label: 'Geral', icon: Settings2 },
            { key: 'agente', label: 'Agente', icon: Bot },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
              style={activeTab === tab.key ? {
                background: '#ffffff', color: '#344054',
                boxShadow: '0 1px 3px rgba(16,24,40,0.08)',
              } : { color: '#98a2b3' }}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* ══ NOVO USUÁRIO / ABA GERAL ══════════════════════════════════════════ */}
      {(isNew || activeTab === 'geral') && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">

            {/* Coluna esquerda */}
            <div className="space-y-6">

              <Card title="Dados da Clínica">
                {!isNew && (
                  <Field label="E-mail de acesso">
                    <div
                      className="flex items-center gap-2 px-3.5 py-2.5 rounded-[0.625rem] text-sm"
                      style={{ background: '#f9fafb', border: '1px solid #e4e7ec', color: linkedEmail ? '#344054' : '#98a2b3' }}
                    >
                      {linkedEmail ?? 'Nenhum usuário vinculado'}
                    </div>
                  </Field>
                )}
                {isNew && (
                  <>
                    <Field label="E-mail de acesso">
                      <TextInput type="email" value={newEmail} onChange={setNewEmail} placeholder="dono@clinica.com" />
                    </Field>
                    <Field label="Senha inicial">
                      <TextInput type="password" value={newPassword} onChange={setNewPassword} placeholder="Mínimo 6 caracteres" />
                    </Field>
                  </>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Nome da Clínica">
                    <TextInput value={org.name ?? ''} onChange={v => setOrg(o => ({ ...o, name: v }))} placeholder="Clínica São Lucas" />
                  </Field>
                  <Field label="Slug (URL)">
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
                        className="px-3.5 py-1.5 rounded-xl text-xs font-semibold border-2 transition-all"
                        style={org.plan === p ? {
                          borderColor: p === 'starter' ? '#94a3b8' : p === 'pro' ? '#60a5fa' : '#4d9aca',
                          color: p === 'starter' ? '#475467' : p === 'pro' ? '#2563eb' : '#2570a0',
                          background: '#ffffff', boxShadow: '0 1px 3px rgba(16,24,40,0.08)',
                        } : { borderColor: '#e4e7ec', color: '#98a2b3' }}
                      >
                        {planLabel(p)}<span className="ml-1.5 text-[10px]" style={{ color: '#d0d5dd' }}>R${PLAN_PRICES[p]}</span>
                      </button>
                    ))}
                  </div>
                </Field>

                <Field label="Status">
                  <div className="flex gap-2 flex-wrap">
                    {statuses.map(s => (
                      <button key={s} onClick={() => setOrg(o => ({ ...o, status: s }))}
                        className="px-3.5 py-1.5 rounded-xl text-xs font-semibold border-2 transition-all"
                        style={org.status === s ? {
                          borderColor: s === 'active' ? '#4d9aca' : s === 'trial' ? '#fbbf24' : s === 'inactive' ? '#94a3b8' : '#f87171',
                          color: s === 'active' ? '#2570a0' : s === 'trial' ? '#d97706' : s === 'inactive' ? '#475467' : '#dc2626',
                          background: '#ffffff', boxShadow: '0 1px 3px rgba(16,24,40,0.08)',
                        } : { borderColor: '#e4e7ec', color: '#98a2b3' }}
                      >
                        {statusLabel(s)}
                      </button>
                    ))}
                  </div>
                </Field>
              </Card>


              {/* Redefinir senha (edição) */}
              {!isNew && (
                <div style={CARD_STYLE} className="p-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4" style={{ color: '#98a2b3' }} />
                    <p className="font-semibold text-sm uppercase tracking-wider" style={{ color: '#344054' }}>Redefinir Senha</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="email" value={resetEmail}
                      onChange={e => { setResetEmail(e.target.value); setResetMsg(null) }}
                      placeholder="E-mail do usuário (se não vinculado)"
                      className="input-dark px-3.5 py-2.5 text-sm w-full"
                    />
                    <input type="password" value={newPass}
                      onChange={e => { setNewPass(e.target.value); setResetMsg(null) }}
                      placeholder="Nova senha (mín. 6 caracteres)"
                      className="input-dark px-3.5 py-2.5 text-sm w-full"
                    />
                  </div>
                  <button onClick={handleResetPassword} disabled={resetting || newPass.length < 6}
                    className="btn-primary flex items-center gap-2 px-4 py-2.5 text-sm disabled:opacity-60">
                    {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                    {resetting ? 'Salvando...' : 'Redefinir Senha'}
                  </button>
                  {resetMsg && (
                    <div className={`flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg ${resetMsg.ok ? 'bg-brand-50 text-brand-700' : 'bg-red-50 text-red-600'}`}>
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
                extra={!isNew && org.evolution_instance ? (
                  <button onClick={checkEvolutionConnection} disabled={checkingConn}
                    className="flex items-center gap-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                    style={{ color: '#98a2b3' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#344054')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#98a2b3')}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${checkingConn ? 'animate-spin' : ''}`} />
                    Verificar
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
                {isNew && (
                  <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: '#f0fdf4', border: '1px solid #b3d4ec' }}>
                    <CheckCircle2 className="w-3.5 h-3.5 text-brand-500 mt-0.5 shrink-0" />
                    <p className="text-xs" style={{ color: '#164a6a' }}>
                      Ao preencher e salvar, o sistema configura o webhook e cria a conta Chatwoot automaticamente.
                    </p>
                  </div>
                )}
              </Card>

              {/* Asaas — preenchido automaticamente pelo webhook */}
              {!isNew && (
                <Card title="Asaas">
                  <Field label="Token da API (Asaas)">
                    <TextInput
                      type="password"
                      value={org.asaas_key ?? ''}
                      onChange={v => setOrg(o => ({ ...o, asaas_key: v }))}
                      placeholder="$aact_..."
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Customer ID">
                      <div className="flex items-center px-3.5 py-2.5 rounded-[0.625rem] text-sm font-mono truncate"
                        style={{ background: '#f9fafb', border: '1px solid #e4e7ec', color: org.asaas_customer_id ? '#344054' : '#d0d5dd' }}>
                        {org.asaas_customer_id || 'Aguardando pagamento'}
                      </div>
                    </Field>
                    <Field label="Status">
                      <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-[0.625rem] text-sm"
                        style={{
                          background: '#f9fafb', border: '1px solid #e4e7ec',
                          color: org.asaas_status === 'active' ? '#16a34a' : org.asaas_status === 'overdue' ? '#dc2626' : '#d0d5dd',
                        }}>
                        {org.asaas_status === 'active' ? '● Ativo' : org.asaas_status === 'overdue' ? '● Inadimplente' : (org.asaas_status || '—')}
                      </div>
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Período">
                      <div className="flex items-center px-3.5 py-2.5 rounded-[0.625rem] text-sm"
                        style={{ background: '#f9fafb', border: '1px solid #e4e7ec', color: org.billing ? '#344054' : '#d0d5dd' }}>
                        {org.billing === 'anual' ? 'Anual' : org.billing === 'mensal' ? 'Mensal' : '—'}
                      </div>
                    </Field>
                    <Field label="Próximo Vencimento">
                      <div className="flex items-center px-3.5 py-2.5 rounded-[0.625rem] text-sm"
                        style={{ background: '#f9fafb', border: '1px solid #e4e7ec', color: org.subscription_period_end ? '#344054' : '#d0d5dd' }}>
                        {org.subscription_period_end
                          ? new Date(org.subscription_period_end).toLocaleDateString('pt-BR')
                          : '—'}
                      </div>
                    </Field>
                  </div>
                  <p className="text-[10px]" style={{ color: '#98a2b3' }}>
                    Preenchido automaticamente via webhook após pagamento.
                  </p>
                </Card>
              )}

              {/* Chatwoot */}
              {(
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
              )}
            </div>
          </div>

          {/* Setup result (edição) */}
          {!isNew && (settingUp || setupResult) && (
            <div style={CARD_STYLE} className="p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Zap className={`w-4 h-4 ${settingUp ? 'text-amber-500 animate-pulse' : 'text-brand-500'}`} />
                <p className="font-semibold text-sm uppercase tracking-wider" style={{ color: '#344054' }}>
                  {settingUp ? 'Configurando automaticamente...' : 'Resultado do Setup'}
                </p>
              </div>
              {settingUp && (
                <div className="flex items-center gap-3 text-sm" style={{ color: '#98a2b3' }}>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Criando conta Chatwoot, webhook e agente...
                </div>
              )}
              {setupResult && (
                <div className="space-y-2">
                  {setupResult.steps.map(step => (
                    <div key={step.id} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: '#f9fafb', border: '1px solid #f2f4f7' }}>
                      {step.ok
                        ? <CheckCircle2 className="w-4 h-4 text-brand-500 mt-0.5 shrink-0" />
                        : <XCircle className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-xs font-semibold" style={{ color: step.ok ? '#344054' : '#98a2b3' }}>{step.label}</p>
                        <p className="text-[11px] mt-0.5" style={{ color: '#98a2b3' }}>{step.detail}</p>
                      </div>
                    </div>
                  ))}
                  {setupResult.webhookUrl && (
                    <p className="text-[11px] pt-1 font-mono break-all" style={{ color: '#98a2b3' }}>Webhook: {setupResult.webhookUrl}</p>
                  )}
                  <button onClick={() => runSetup(id!)} disabled={settingUp}
                    className="flex items-center gap-1.5 text-xs font-medium mt-2 transition-colors disabled:opacity-50"
                    style={{ color: '#98a2b3' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#344054')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#98a2b3')}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Rodar novamente
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Ações */}
          <div className="flex items-center gap-3">
            <button onClick={handleSave} disabled={saving || settingUp}
              className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm disabled:opacity-60">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Criando...' : settingUp ? 'Configurando...' : isNew ? 'Criar Usuário' : 'Salvar'}
            </button>

            {!isNew && org.evolution_instance && !setupResult && (
              <button onClick={() => runSetup(id!)} disabled={settingUp}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
                style={{ border: '1px solid #e4e7ec', color: '#667085' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f9fafb' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <Zap className="w-4 h-4 text-amber-500" />
                Setup automático
              </button>
            )}

            {!isNew && (
              <button
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ml-auto"
                style={{ border: '1px solid #fecaca', color: '#dc2626' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#fef2f2' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                onClick={async () => {
                  if (!confirm(`Remover "${org.name}"?\n\nTodos os dados serão deletados permanentemente: conversas, agendamentos, arquivos e o acesso do usuário. Esta ação é irreversível.`)) return
                  const { data: { session } } = await supabase.auth.getSession()
                  const res = await fetch('/api/admin/delete-org', {
                    method: 'DELETE',
                    headers: {
                      'Content-Type': 'application/json',
                      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
                    },
                    body: JSON.stringify({ orgId: id }),
                  })
                  const result = await res.json() as { ok?: boolean; errors?: string[] }
                  if (!result.ok) { alert('Erro ao remover: ' + (result.errors?.join(', ') ?? 'desconhecido')); return }
                  navigate('/admin/clients')
                }}
              >
                <Trash2 className="w-4 h-4" />
                Remover
              </button>
            )}
          </div>
        </>
      )}

      {/* ══ ABA AGENTE ═════════════════════════════════════════════════════════ */}
      {!isNew && activeTab === 'agente' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">

            <div className="space-y-6">
              <Card title="Perfil do Agente">
                <Field label="Nome do Agente">
                  <TextInput value={agentName} onChange={setAgentName} placeholder="Assistente" />
                </Field>
                <Field label="Tom de Voz">
                  <ToggleGroup
                    options={[{ value: 'friendly', label: 'Amigável' }, { value: 'formal', label: 'Formal' }]}
                    value={agentTone}
                    onChange={v => setAgentTone(v as 'friendly' | 'formal')}
                  />
                </Field>
                <Field label="Mensagem de Saudação">
                  <textarea
                    value={agentGreeting}
                    onChange={e => setAgentGreeting(e.target.value)}
                    placeholder="Olá! Sou a assistente da Clínica X. Como posso ajudar?"
                    rows={3}
                    className="input-dark w-full px-3.5 py-2.5 text-sm resize-none"
                  />
                </Field>
              </Card>

              <Card title="Instruções Personalizadas">
                <p className="text-xs -mt-2" style={{ color: '#98a2b3' }}>
                  Convênios aceitos, horários, procedimentos, regras de atendimento, etc.
                </p>
                <textarea
                  value={agentInstructions}
                  onChange={e => setAgentInstructions(e.target.value)}
                  placeholder={`Ex: Aceitamos os convênios Unimed, Bradesco e Amil.\nFuncionamos de segunda a sexta das 8h às 18h.\nRetornos devem ser agendados em até 30 dias.`}
                  rows={8}
                  className="input-dark w-full px-3.5 py-2.5 text-sm resize-none font-mono"
                />
              </Card>
            </div>

            <div className="space-y-6">
              {/* Serviços */}
              <div style={{ ...CARD_STYLE, padding: 0 }} className="overflow-hidden">
                <div className="flex items-center justify-between px-6 pt-6 pb-4"
                  style={{ borderBottom: services.length > 0 || showAddService ? '1px solid #f2f4f7' : 'none' }}>
                  <div>
                    <p className="font-semibold text-sm uppercase tracking-wider" style={{ color: '#344054' }}>Serviços</p>
                    <p className="text-xs mt-0.5" style={{ color: '#98a2b3' }}>PDF enviado automaticamente ao confirmar agendamento</p>
                  </div>
                  <button
                    onClick={() => { setShowAddService(v => !v); setNewService({ name: '', description: '', price: '' }) }}
                    className="btn-primary flex items-center gap-1.5 px-3.5 py-2 text-xs shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Novo Serviço
                  </button>
                </div>

                {showAddService && (
                  <div className="mx-6 my-4 rounded-2xl p-4 space-y-3" style={{ background: '#f9fafb', border: '1px solid #f2f4f7' }}>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#98a2b3' }}>Nome *</label>
                        <input type="text" value={newService.name}
                          onChange={e => setNewService(s => ({ ...s, name: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && addService()}
                          placeholder="Consulta Cardiologia"
                          className="input-dark w-full px-3 py-2.5 text-sm" autoFocus
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#98a2b3' }}>Preço</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium pointer-events-none" style={{ color: '#98a2b3' }}>R$</span>
                          <input type="text" value={newService.price}
                            onChange={e => setNewService(s => ({ ...s, price: e.target.value }))}
                            placeholder="150,00" className="input-dark w-full pl-8 pr-3 py-2.5 text-sm"
                          />
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#98a2b3' }}>Descrição</label>
                      <input type="text" value={newService.description}
                        onChange={e => setNewService(s => ({ ...s, description: e.target.value }))}
                        placeholder="Detalhes para o agente informar ao paciente"
                        className="input-dark w-full px-3 py-2.5 text-sm"
                      />
                    </div>
                    {/* PDF field */}
                    <div>
                      <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#98a2b3' }}>PDF (enviado ao paciente)</label>
                      <input ref={newServicePdfRef} type="file" accept=".pdf" className="hidden"
                        onChange={e => { setNewServicePdf(e.target.files?.[0] ?? null); e.target.value = '' }} />
                      {newServicePdf ? (
                        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white border border-slate-200">
                          <FileText className="w-4 h-4 shrink-0" style={{ color: '#2C82B5' }} />
                          <span className="text-sm truncate flex-1" style={{ color: '#344054' }}>{newServicePdf.name}</span>
                          <button type="button" onClick={() => setNewServicePdf(null)} className="text-slate-400 hover:text-rose-500 transition-colors">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => newServicePdfRef.current?.click()}
                          className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-sm transition-all"
                          style={{ border: '1.5px dashed #d0d5dd', color: '#98a2b3', background: 'white' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#2C82B5'; (e.currentTarget as HTMLButtonElement).style.color = '#2C82B5' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#d0d5dd'; (e.currentTarget as HTMLButtonElement).style.color = '#98a2b3' }}>
                          <Upload className="w-4 h-4" /> Anexar PDF
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={addService} disabled={!newService.name.trim() || !!uploadingPdf}
                        className="btn-primary flex items-center gap-1.5 px-4 py-2 text-sm disabled:opacity-40">
                        {uploadingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        {uploadingPdf ? 'Enviando…' : 'Adicionar'}
                      </button>
                      <button onClick={() => { setShowAddService(false); setNewServicePdf(null) }}
                        className="px-4 py-2 rounded-xl text-sm font-medium transition-colors" style={{ color: '#98a2b3' }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {services.length > 0 ? (
                  <div>
                    {services.map(svc => {
                      const isOpen = expandedService === svc.id
                      const isUploading = uploadingPdf === svc.id
                      return (
                        <div key={svc.id} style={{ borderBottom: '1px solid #f2f4f7' }}>
                          <button
                            onClick={() => setExpandedService(isOpen ? null : svc.id)}
                            className="w-full flex items-center gap-4 px-6 py-4 transition-colors text-left"
                            onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <div className="flex-1 min-w-0 flex items-center gap-3">
                              <span className="text-sm font-semibold truncate" style={{ color: '#344054' }}>{svc.name}</span>
                              {svc.price && <span className="text-xs font-semibold shrink-0 text-brand-600">R$ {svc.price}</span>}
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <div className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${svc.pdf_url ? 'bg-brand-50 text-brand-600' : 'bg-slate-100 text-slate-500'}`}>
                                <FileText className="w-3 h-3" />
                                {svc.pdf_url ? 'PDF' : 'Sem PDF'}
                              </div>
                              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} style={{ color: '#d0d5dd' }} />
                            </div>
                          </button>
                          {isOpen && (
                            <div className="px-6 pb-5 pt-3" style={{ background: '#f9fafb', borderTop: '1px solid #f2f4f7' }}>
                              {svc.description && <p className="text-xs mb-4" style={{ color: '#667085' }}>{svc.description}</p>}
                              <div className="flex items-center gap-2">
                                <button onClick={() => triggerPdfUpload(svc.id)} disabled={isUploading}
                                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                                  style={{ border: '1px solid #e4e7ec', color: '#667085', background: '#ffffff' }}
                                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#b3d4ec'; (e.currentTarget as HTMLElement).style.color = '#2570a0' }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#e4e7ec'; (e.currentTarget as HTMLElement).style.color = '#667085' }}
                                >
                                  {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                                  {isUploading ? 'Enviando...' : svc.pdf_url ? 'Trocar PDF' : 'Anexar PDF'}
                                </button>
                                {svc.pdf_url && (
                                  <>
                                    <span className="text-xs truncate max-w-[160px]" style={{ color: '#98a2b3' }}>{svc.pdf_name}</span>
                                    <button onClick={() => removePdf(svc.id)} className="p-1.5 rounded-lg transition-colors text-slate-400 hover:text-red-500">
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                                <button onClick={() => removeService(svc.id)}
                                  className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-500 transition-colors hover:bg-red-50">
                                  <Trash2 className="w-3.5 h-3.5" /> Remover
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    <div className="h-2" />
                  </div>
                ) : !showAddService && (
                  <div className="text-center py-10 px-6">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: '#f9fafb', border: '1px solid #f2f4f7' }}>
                      <FileText className="w-5 h-5 text-slate-400" />
                    </div>
                    <p className="text-sm font-medium text-slate-500">Nenhum serviço cadastrado</p>
                    <p className="text-xs mt-1 text-slate-400">Adicione os serviços oferecidos pela clínica</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={handleSaveAgent} disabled={savingAgent}
              className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm disabled:opacity-60">
              {savingAgent ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {savingAgent ? 'Salvando...' : 'Salvar Configurações do Agente'}
            </button>
            {agentMsg && (
              <div className={`flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg ${agentMsg.ok ? 'bg-brand-50 text-brand-700' : 'bg-red-50 text-red-600'}`}>
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
