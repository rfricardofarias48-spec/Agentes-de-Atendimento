import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Save, Trash2, Wifi, WifiOff, RefreshCw,
  CheckCircle2, XCircle, Loader2, Zap, KeyRound,
  Bot, Settings2, Upload, Plus, X, FileText, ChevronDown,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { type Organization, type OrgPlan, type OrgStatus } from '../../types'
import { planLabel, statusLabel, formatDate } from '../../lib/utils'
import { TZ } from '../../lib/date'

interface SetupStep { id: string; label: string; ok: boolean; detail: string }
type SkillPhase = 'infra' | 'qr' | 'finalize' | 'done'
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
  border: '1px solid #f1f5f9',
  borderRadius: '1rem',
  boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-1.5">{label}</label>
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
      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all bg-white placeholder:text-slate-300"
    />
  )
}

function Card({ title, children, extra }: { title: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div style={CARD_STYLE} className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-1.5 h-4 rounded-full" style={{ background: 'linear-gradient(180deg, #2C82B5, #1e5f88)' }} />
          <p className="font-bold text-[13px] text-gray-900">{title}</p>
        </div>
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

  const [activeTab, setActiveTab] = useState<'geral' | 'agente'>('geral')

  // Org state
  const [org, setOrg] = useState<Partial<Organization>>({
    name: '', plan: 'starter', status: 'active',
    whatsapp_numbers: [], agent_tone: 'friendly',
    max_conversations_month: 600, conversations_used: 0,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Email do usuário vinculado
  const [linkedEmail, setLinkedEmail] = useState<string | null>(null)

  // Evolution connection
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'open' | 'connecting' | 'close'>('unknown')
  const [checkingConn, setCheckingConn] = useState(false)

  // Skill — Setup Completo (3 fases sequenciais)
  const [showSkill, setShowSkill] = useState(false)
  const [skillPhase, setSkillPhase] = useState<SkillPhase>('infra')
  const [infraSteps, setInfraSteps] = useState<SetupStep[]>([])
  const [infraRunning, setInfraRunning] = useState(false)
  const infraDoneRef = useRef(false)
  const [skillQR, setSkillQR] = useState<string | null>(null)
  const [skillQRVisible, setSkillQRVisible] = useState(false)
  const [skillConnected, setSkillConnected] = useState(false)
  const [finalSteps, setFinalSteps] = useState<SetupStep[]>([])
  const [finalRunning, setFinalRunning] = useState(false)
  const finalizeDoneRef = useRef(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const qrTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // QR modal standalone
  const [showQRModal, setShowQRModal]   = useState(false)
  const [qrModalCode, setQrModalCode]   = useState<string | null>(null)
  const [qrModalConn, setQrModalConn]   = useState(false)
  const qrModalPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function stopQRModalPoll() {
    if (qrModalPollRef.current) { clearInterval(qrModalPollRef.current); qrModalPollRef.current = null }
  }

  async function openQRModal() {
    setQrModalCode(null)
    setQrModalConn(false)
    setShowQRModal(true)
    // busca imediata
    try {
      const r = await fetch(`/api/admin/qr-status?orgId=${id}`)
      const d = await r.json() as { connected: boolean; qrCode: string | null }
      if (d.connected) { setQrModalConn(true); return }
      setQrModalCode(d.qrCode)
    } catch { /* ignore */ }
    // polling
    qrModalPollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/admin/qr-status?orgId=${id}`)
        const d = await r.json() as { connected: boolean; qrCode: string | null }
        if (d.connected) { setQrModalConn(true); stopQRModalPoll() }
        else if (d.qrCode) setQrModalCode(d.qrCode)
      } catch { /* ignore */ }
    }, 4000)
  }

  function closeQRModal() {
    stopQRModalPoll()
    setShowQRModal(false)
  }

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
    if (!id) return
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
  }, [id])

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

  // ─── Skill: Setup Completo ──────────────────────────────────────────────
  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  useEffect(() => () => {
    stopPoll()
    if (qrTimerRef.current) clearTimeout(qrTimerRef.current)
  }, [stopPoll])

  const startQRPoll = useCallback(() => {
    stopPoll()
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/admin/qr-status?orgId=${id}`)
        const d = await r.json() as { connected: boolean; qrCode: string | null }
        if (d.connected) {
          setSkillConnected(true)
          stopPoll()
          setTimeout(() => setSkillPhase('finalize'), 1200)
        } else if (d.qrCode) {
          setSkillQR(d.qrCode)
        }
      } catch { /* ignore */ }
    }, 4000)
  }, [id, stopPoll])

  async function refreshSkillQR() {
    try {
      const r = await fetch(`/api/admin/qr-status?orgId=${id}`)
      const d = await r.json() as { qrCode: string | null }
      if (d.qrCode) setSkillQR(d.qrCode)
    } catch { /* ignore */ }
  }

  async function runInfra() {
    if (infraDoneRef.current) return
    infraDoneRef.current = true
    setInfraRunning(true)
    setInfraSteps([])
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/admin/auto-setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ orgId: id }),
      })
      const d = await r.json() as { steps: SetupStep[]; qrCode: string | null }
      setInfraSteps(d.steps)
      if (d.qrCode) {
        setSkillQR(d.qrCode)
        qrTimerRef.current = setTimeout(() => {
          setSkillQRVisible(true)
          setSkillPhase('qr')
          startQRPoll()
        }, d.steps.length * 100 + 700)
      }
      const { data: fresh } = await supabase.from('organizations').select('*').eq('id', id!).single()
      if (fresh) setOrg(fresh)
    } catch (e) {
      setInfraSteps([{ id: 'err', label: 'Erro inesperado', ok: false, detail: String(e) }])
    } finally {
      setInfraRunning(false)
    }
  }

  async function runFinalizeSkill() {
    if (finalizeDoneRef.current) return
    finalizeDoneRef.current = true
    setFinalRunning(true)
    setFinalSteps([])
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/admin/finalize-setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ orgId: id }),
      })
      const d = await r.json() as { steps: SetupStep[] }
      setFinalSteps(d.steps)
      if (d.steps.every(s => s.ok)) setTimeout(() => setSkillPhase('done'), 900)
    } catch (e) {
      setFinalSteps([{ id: 'err', label: 'Erro inesperado', ok: false, detail: String(e) }])
    } finally {
      setFinalRunning(false)
    }
  }

  function openSkill() {
    infraDoneRef.current = false
    finalizeDoneRef.current = false
    setShowSkill(true)
    setSkillPhase('infra')
    setInfraSteps([])
    setSkillQR(null)
    setSkillQRVisible(false)
    setSkillConnected(false)
    setFinalSteps([])
    stopPoll()
    if (qrTimerRef.current) clearTimeout(qrTimerRef.current)
    runInfra()
  }

  function retryInfra() {
    infraDoneRef.current = false
    finalizeDoneRef.current = false
    setSkillPhase('infra')
    setInfraSteps([])
    setSkillQR(null)
    setSkillQRVisible(false)
    setSkillConnected(false)
    setFinalSteps([])
    stopPoll()
    if (qrTimerRef.current) clearTimeout(qrTimerRef.current)
    runInfra()
  }

  function closeSkill() {
    stopPoll()
    if (qrTimerRef.current) clearTimeout(qrTimerRef.current)
    setShowSkill(false)
  }

  useEffect(() => {
    if (skillPhase === 'finalize') runFinalizeSkill()
  }, [skillPhase]) // eslint-disable-line react-hooks/exhaustive-deps

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

  async function handleSave() {
    setSaving(true)

    // Normaliza o telefone: garante prefixo 55 se preenchido
    const rawPhone = (org.phone ?? '').replace(/\D/g, '')
    const normalizedPhone = rawPhone ? (rawPhone.startsWith('55') ? rawPhone : `55${rawPhone}`) : null

    const payload = {
      name: org.name,
      plan: org.plan,
      status: org.status,
      phone: normalizedPhone,
      whatsapp_numbers: org.whatsapp_numbers ?? [],
      agent_tone: agentTone,
      max_conversations_month: org.max_conversations_month,
      conversations_used: org.conversations_used,
      evolution_instance: org.evolution_instance ?? null,
      evolution_token: org.evolution_token ?? null,
      chatwoot_account_id: org.chatwoot_account_id ?? null,
      chatwoot_token: org.chatwoot_token ?? null,
      chatwoot_inbox_id: org.chatwoot_inbox_id ?? null,
    }

    const { error } = await supabase.from('organizations').update(payload).eq('id', id!)
    setSaving(false)
    if (error) { alert('Erro ao salvar: ' + error.message); return }

    // Sincroniza notification_phone no agent_settings para o Bento
    if (normalizedPhone !== undefined) {
      await supabase.from('agent_settings')
        .update({ notification_phone: normalizedPhone })
        .eq('org_id', id!)
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
      <div className="w-5 h-5 border-[2.5px] border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const connIcon = connectionStatus === 'open'
    ? <Wifi className="w-4 h-4 text-brand-500" />
    : connectionStatus === 'connecting'
      ? <Wifi className="w-4 h-4 text-amber-500" />
      : <WifiOff className="w-4 h-4 text-slate-400" />

  return (
    <div className="space-y-5 pb-8">
      <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handlePdfFileChange} />

      {/* ── Skill: Setup Completo ────────────────────────────────────────── */}
      {showSkill && (
        <>
          <style>{`
            @keyframes skillStepIn {
              from { opacity: 0; transform: translateY(5px); }
              to   { opacity: 1; transform: translateY(0); }
            }
            .skill-step { animation: skillStepIn 0.25s ease both; }
          `}</style>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(6px)' }}
            onClick={e => { if (e.target === e.currentTarget && !infraRunning && !finalRunning) closeSkill() }}
          >
          <div
            className="w-full max-w-md rounded-2xl overflow-hidden flex flex-col"
            style={{ background: '#fff', boxShadow: '0 32px 96px rgba(0,0,0,0.22)', maxHeight: '90vh' }}
          >
            {/* Cabeçalho com progresso */}
            <div className="px-6 py-4 shrink-0" style={{ borderBottom: '1px solid #f1f5f9' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'linear-gradient(135deg, #2C82B5, #1e5f88)' }}>
                    {skillPhase === 'done'
                      ? <CheckCircle2 className="w-4 h-4 text-white" />
                      : infraRunning || finalRunning
                        ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                        : <Zap className="w-4 h-4 text-white" />}
                  </div>
                  <div>
                    <p className="font-bold text-[13px] text-slate-800">
                      {skillPhase === 'done' ? 'Setup Concluído!' : 'Skill — Setup Completo'}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {skillPhase === 'infra' ? 'Etapa 1 de 3 — Infraestrutura' :
                       skillPhase === 'qr'    ? 'Etapa 2 de 3 — Conectar WhatsApp' :
                       skillPhase === 'finalize' ? 'Etapa 3 de 3 — Finalização' :
                       'Todas as etapas concluídas'}
                    </p>
                  </div>
                </div>
                {skillPhase !== 'infra' && !(infraRunning || finalRunning) && (
                  <button onClick={closeSkill} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-400">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              {/* Barra de progresso */}
              <div className="flex gap-1.5">
                {(['infra','qr','finalize'] as SkillPhase[]).map((p, i) => {
                  const done = skillPhase === 'done' || (['infra','qr','finalize'] as SkillPhase[]).indexOf(skillPhase) > i
                  const active = skillPhase === p
                  return (
                    <div key={p} className="flex-1 h-1 rounded-full transition-all duration-500"
                      style={{ background: done ? '#16a34a' : active ? '#2C82B5' : '#e2e8f0' }} />
                  )
                })}
              </div>
            </div>

            {/* Corpo */}
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">

              {/* Etapa 1 — Infraestrutura */}
              {infraSteps.length === 0 && infraRunning && (
                <div className="flex items-center gap-3 py-5 justify-center">
                  <Loader2 className="w-5 h-5 text-brand-400 animate-spin" />
                  <p className="text-sm text-slate-400">Criando infraestrutura...</p>
                </div>
              )}
              {infraSteps.map((s, i) => (
                <div key={s.id} className="skill-step flex items-start gap-3 px-3 py-2.5 rounded-xl"
                  style={{ animationDelay: `${i * 100}ms`, background: s.ok ? '#f0fdf4' : '#fef2f2', border: `1px solid ${s.ok ? '#bbf7d0' : '#fecaca'}` }}>
                  {s.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold" style={{ color: s.ok ? '#166534' : '#991b1b' }}>{s.label}</p>
                    <p className="text-[11px] mt-0.5 text-slate-400 leading-tight">{s.detail}</p>
                  </div>
                </div>
              ))}

              {/* Etapa 2 — QR Code */}
              {skillQRVisible && !skillConnected && (
                <>
                  <div className="flex items-center gap-2 my-1">
                    <div className="flex-1 h-px bg-slate-100" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-300">Conectar WhatsApp</span>
                    <div className="flex-1 h-px bg-slate-100" />
                  </div>
                  {skillQR ? (
                    <>
                      <p className="text-center text-[12px] text-slate-500">
                        WhatsApp → ⋮ → <b>Aparelhos conectados</b> → Conectar um aparelho
                      </p>
                      <div className="flex justify-center">
                        <div className="p-3 rounded-2xl" style={{ border: '2px solid #e2e8f0' }}>
                          <img src={skillQR.startsWith('data:') ? skillQR : `data:image/png;base64,${skillQR}`}
                            alt="QR Code" width={210} height={210} style={{ display: 'block', imageRendering: 'pixelated' }} />
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                          <p className="text-[11px] text-slate-400">Verificando a cada 4 s...</p>
                        </div>
                        <button onClick={refreshSkillQR}
                          className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-brand-600 transition-colors">
                          <RefreshCw className="w-3 h-3" /> Atualizar QR
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: '#f0f9ff', border: '1px solid #bae6fd' }}>
                      <Loader2 className="w-3.5 h-3.5 text-sky-500 animate-spin shrink-0" />
                      <p className="text-[11px] text-sky-700">Aguardando QR code...</p>
                      <button onClick={refreshSkillQR} className="ml-auto text-[11px] font-bold text-sky-600 shrink-0">Tentar agora</button>
                    </div>
                  )}
                </>
              )}

              {/* Etapa 2 — Conectado */}
              {skillConnected && (
                <div className="flex items-center gap-3 px-3 py-3 rounded-xl" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <p className="text-[12px] font-semibold text-emerald-700">WhatsApp conectado — finalizando setup...</p>
                </div>
              )}

              {/* Etapa 3 — Finalização */}
              {(finalSteps.length > 0 || finalRunning) && (
                <>
                  <div className="flex items-center gap-2 my-1">
                    <div className="flex-1 h-px bg-slate-100" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-300">Finalização</span>
                    <div className="flex-1 h-px bg-slate-100" />
                  </div>
                  {finalRunning && finalSteps.length === 0 && (
                    <div className="flex items-center gap-3 py-3 justify-center">
                      <Loader2 className="w-4 h-4 text-brand-400 animate-spin" />
                      <p className="text-sm text-slate-400">Enviando boas-vindas...</p>
                    </div>
                  )}
                  {finalSteps.map((s, i) => (
                    <div key={s.id} className="skill-step flex items-start gap-3 px-3 py-2.5 rounded-xl"
                      style={{ animationDelay: `${i * 100}ms`, background: s.ok ? '#f0fdf4' : '#fef2f2', border: `1px solid ${s.ok ? '#bbf7d0' : '#fecaca'}` }}>
                      {s.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-[12px] font-semibold" style={{ color: s.ok ? '#166534' : '#991b1b' }}>{s.label}</p>
                        <p className="text-[11px] mt-0.5 text-slate-400 leading-tight">{s.detail}</p>
                      </div>
                    </div>
                  ))}
                  {!finalRunning && finalSteps.some(s => !s.ok) && (
                    <button onClick={() => { finalizeDoneRef.current = false; runFinalizeSkill() }}
                      className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 hover:text-slate-700 transition-colors mt-1">
                      <RefreshCw className="w-3 h-3" /> Tentar finalização novamente
                    </button>
                  )}
                </>
              )}

              {/* Concluído */}
              {skillPhase === 'done' && (
                <div className="flex items-center gap-3 p-4 rounded-2xl" style={{ background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', border: '1px solid #bbf7d0' }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#16a34a' }}>
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-emerald-800 text-sm">Tudo pronto!</p>
                    <p className="text-[12px] text-emerald-600 mt-0.5">WhatsApp ativo · Setup concluído</p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 shrink-0 flex items-center justify-between gap-3" style={{ borderTop: '1px solid #f1f5f9' }}>
              {/* Botão Tentar novamente — aparece quando infra tem falhas, em qualquer fase */}
              {!infraRunning && !finalRunning && skillPhase !== 'done' && infraSteps.some(s => !s.ok) ? (
                <button
                  onClick={retryInfra}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
                  style={{ background: 'linear-gradient(135deg, #2C82B5, #2570a0)' }}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Tentar novamente
                </button>
              ) : <div />}

              {skillPhase === 'done' ? (
                <button onClick={closeSkill} className="btn-primary px-5 py-2.5 text-sm">Concluído</button>
              ) : (
                <button onClick={closeSkill} disabled={infraRunning || finalRunning}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 transition-colors"
                  style={{ border: '1px solid #e2e8f0', color: '#64748b' }}>
                  {infraRunning || finalRunning ? 'Aguarde...' : 'Fechar'}
                </button>
              )}
            </div>
          </div>
          </div>
        </>
      )}

      {/* ── Modal QR standalone ─────────────────────────────────────────── */}
      {showQRModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(6px)' }}
          onClick={e => { if (e.target === e.currentTarget) closeQRModal() }}>
          <div className="w-full max-w-sm rounded-2xl overflow-hidden"
            style={{ background: '#fff', boxShadow: '0 32px 96px rgba(0,0,0,0.22)' }}>
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #f1f5f9' }}>
              <p className="font-bold text-[13px] text-slate-800">Conectar WhatsApp</p>
              <button onClick={closeQRModal} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {qrModalConn ? (
                <div className="flex items-center gap-3 px-3 py-3 rounded-xl" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <p className="text-[12px] font-semibold text-emerald-700">WhatsApp conectado com sucesso!</p>
                </div>
              ) : qrModalCode ? (
                <>
                  <p className="text-center text-[12px] text-slate-500">
                    WhatsApp → ⋮ → <b>Aparelhos conectados</b> → Conectar um aparelho
                  </p>
                  <div className="flex justify-center">
                    <div className="p-3 rounded-2xl" style={{ border: '2px solid #e2e8f0' }}>
                      <img
                        src={qrModalCode.startsWith('data:') ? qrModalCode : `data:image/png;base64,${qrModalCode}`}
                        alt="QR Code" width={210} height={210}
                        style={{ display: 'block', imageRendering: 'pixelated' }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                      <p className="text-[11px] text-slate-400">Verificando a cada 4 s...</p>
                    </div>
                    <button onClick={openQRModal}
                      className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-brand-600 transition-colors">
                      <RefreshCw className="w-3 h-3" /> Atualizar QR
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-3 py-6 justify-center">
                  <Loader2 className="w-5 h-5 text-brand-400 animate-spin" />
                  <p className="text-sm text-slate-400">Obtendo QR code...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/admin/clients')}
          className="p-2 rounded-xl transition-colors hover:bg-slate-100 text-slate-400"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-800 leading-none">{org.name}</h1>
          {org.created_at && (
            <p className="text-xs text-slate-400 mt-1">Criado em {formatDate(org.created_at)}</p>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-xs font-medium text-slate-400">
          {connIcon}
          <span className="capitalize">{connectionStatus === 'unknown' ? 'Não verificado' : connectionStatus}</span>
        </div>
      </div>

      {/* Sub-abas */}
      <div className="flex items-center bg-white border border-slate-200 rounded-2xl p-1 w-fit shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
        {([
          { key: 'geral', label: 'Geral', icon: Settings2 },
          { key: 'agente', label: 'Agente', icon: Bot },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="flex items-center gap-2 px-4 py-1.5 rounded-xl text-[13px] font-semibold transition-all duration-200"
            style={activeTab === tab.key
              ? { background: 'linear-gradient(135deg, #2C82B5, #2570a0)', color: '#fff', boxShadow: '0 2px 8px rgba(37,112,160,0.28)' }
              : { color: '#94a3b8' }
            }
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ══ ABA GERAL ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'geral' && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">

            {/* Coluna esquerda */}
            <div className="space-y-6">

              <Card title="Dados da Clínica">
                <Field label="E-mail de acesso">
                  <div
                    className="flex items-center gap-2 px-3.5 py-2.5 rounded-[0.625rem] text-sm"
                    style={{ background: '#f9fafb', border: '1px solid #e4e7ec', color: linkedEmail ? '#344054' : '#98a2b3' }}
                  >
                    {linkedEmail ?? 'Nenhum usuário vinculado'}
                  </div>
                </Field>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Nome da Clínica">
                    <TextInput value={org.name ?? ''} onChange={v => setOrg(o => ({ ...o, name: v }))} placeholder="Clínica São Lucas" />
                  </Field>
                  <Field label="Telefone / WhatsApp">
                    <TextInput
                      value={org.phone ?? ''}
                      onChange={v => setOrg(o => ({ ...o, phone: v }))}
                      placeholder="5551999990000"
                      type="tel"
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

              {/* Redefinir senha */}
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
            </div>

            {/* Coluna direita */}
            <div className="space-y-6">
              <Card
                title="Evolution API"
                extra={
                  org.evolution_instance && org.chatwoot_account_id ? (
                    // Setup completo — apenas verificar conexão
                    <button onClick={checkEvolutionConnection} disabled={checkingConn}
                      className="flex items-center gap-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                      style={{ color: '#98a2b3' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#344054')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#98a2b3')}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${checkingConn ? 'animate-spin' : ''}`} />
                      Verificar
                    </button>
                  ) : org.evolution_instance && !org.chatwoot_account_id ? (
                    // Evolution criado mas Chatwoot pendente — re-rodar setup para configurar e exibir QR
                    <div className="flex items-center gap-2">
                      <button
                        onClick={openSkill}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white transition-all"
                        style={{ background: 'linear-gradient(135deg, #2C82B5, #2570a0)', boxShadow: '0 2px 8px rgba(44,130,181,0.3)' }}
                      >
                        <Zap className="w-3.5 h-3.5" />
                        Configurar + QR
                      </button>
                      <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
                        style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#c2410c' }}>
                        Chatwoot pendente ↓
                      </span>
                    </div>
                  ) : (
                    // Sem instância — iniciar setup do zero
                    <button
                      onClick={openSkill}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white transition-all"
                      style={{ background: 'linear-gradient(135deg, #2C82B5, #2570a0)', boxShadow: '0 2px 8px rgba(44,130,181,0.3)' }}
                    >
                      <Zap className="w-3.5 h-3.5" />
                      Configurar
                    </button>
                  )
                }
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

              {/* Asaas — preenchido automaticamente pelo webhook */}
              <Card title="Asaas">
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
                        ? new Date(org.subscription_period_end).toLocaleDateString('pt-BR', { timeZone: TZ })
                        : '—'}
                    </div>
                  </Field>
                </div>
                <p className="text-[10px]" style={{ color: '#98a2b3' }}>
                  Preenchido automaticamente via webhook após pagamento.
                </p>
              </Card>

              {/* Chatwoot */}
              <Card title="Chatwoot">
                {org.chatwoot_account_id ? (
                  /* ── Configurado ── */
                  <>
                    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
                      style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <p className="text-[11px] font-semibold text-emerald-700">
                        Conta configurada automaticamente · Account #{org.chatwoot_account_id}
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <Field label="Account ID">
                        <div className="flex items-center px-3 py-2.5 rounded-[0.625rem] text-sm font-mono"
                          style={{ background: '#f9fafb', border: '1px solid #e4e7ec', color: '#344054' }}>
                          {org.chatwoot_account_id}
                        </div>
                      </Field>
                      <Field label="Inbox ID">
                        <div className="flex items-center px-3 py-2.5 rounded-[0.625rem] text-sm font-mono"
                          style={{ background: '#f9fafb', border: '1px solid #e4e7ec', color: org.chatwoot_inbox_id ? '#344054' : '#d0d5dd' }}>
                          {org.chatwoot_inbox_id ?? '—'}
                        </div>
                      </Field>
                      <Field label="Token">
                        <div className="flex items-center px-3 py-2.5 rounded-[0.625rem] text-sm font-mono truncate"
                          style={{ background: '#f9fafb', border: '1px solid #e4e7ec', color: '#344054' }}>
                          {org.chatwoot_token ? '••••••••' : '—'}
                        </div>
                      </Field>
                    </div>
                    <p className="text-[10px]" style={{ color: '#98a2b3' }}>
                      Criado automaticamente pelo setup · Para reconfigurar, edite os campos abaixo e salve.
                    </p>
                    {/* Override manual (colapsado por padrão) */}
                    <details className="group">
                      <summary className="cursor-pointer text-[11px] font-semibold select-none list-none flex items-center gap-1.5"
                        style={{ color: '#98a2b3' }}>
                        <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" />
                        Editar credenciais manualmente
                      </summary>
                      <div className="mt-3 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
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
                        <Field label="Access Token">
                          <TextInput value={org.chatwoot_token ?? ''} onChange={v => setOrg(o => ({ ...o, chatwoot_token: v }))} placeholder="Token de acesso da conta" type="password" />
                        </Field>
                      </div>
                    </details>
                  </>
                ) : (
                  /* ── Não configurado ── */
                  <>
                    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
                      style={{ background: '#f0f9ff', border: '1px solid #bae6fd' }}>
                      <Zap className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                      <p className="text-[11px] text-sky-700 leading-relaxed">
                        <span className="font-semibold">Criado automaticamente pelo setup.</span>
                        {' '}Clique em <b>Configurar</b> no card Evolution para criar a conta e vincular tudo de uma vez.
                      </p>
                    </div>
                    {/* Override manual caso necessário */}
                    <details className="group">
                      <summary className="cursor-pointer text-[11px] font-semibold select-none list-none flex items-center gap-1.5"
                        style={{ color: '#98a2b3' }}>
                        <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" />
                        Preencher credenciais manualmente
                      </summary>
                      <div className="mt-3 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
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
                        <Field label="Access Token">
                          <TextInput value={org.chatwoot_token ?? ''} onChange={v => setOrg(o => ({ ...o, chatwoot_token: v }))} placeholder="Token de acesso da conta" type="password" />
                        </Field>
                      </div>
                    </details>
                  </>
                )}
              </Card>
            </div>
          </div>

          {/* Ações */}
          <div className="flex items-center gap-3">
            <button onClick={handleSave} disabled={saving}
              className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm disabled:opacity-60">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Salvando...' : 'Salvar'}
            </button>

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
          </div>
        </>
      )}

      {/* ══ ABA AGENTE ═════════════════════════════════════════════════════════ */}
      {activeTab === 'agente' && (
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
