import { useEffect, useRef, useState } from 'react'
import {
  Save, Plus, Trash2, FileText, ChevronDown, Upload, X, Loader2, CheckCircle2, XCircle,
  Clock, Users, UserRound,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { cn } from '../../lib/utils'
import WeeklyHoursEditor, {
  type WeeklyHours, DEFAULT_WEEKLY_HOURS, normalizeWeeklyHours,
} from '../../components/agent/WeeklyHoursEditor'

const DURATION_OPTIONS = [
  { value: 30,  label: '30 min' },
  { value: 45,  label: '45 min' },
  { value: 60,  label: '1 hora' },
  { value: 90,  label: '1h30' },
  { value: 120, label: '2 horas' },
]

interface Service {
  id: string
  name: string
  description: string
  price: string
  pdf_url: string | null
  pdf_name: string | null
  duration_minutes?: number | null
}

interface Professional {
  id: string
  name: string
  active: boolean
  useCustomHours: boolean
  workingHours: WeeklyHours
  saving?: boolean
}

export default function ClientBento() {
  const { orgId } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [agentId, setAgentId]               = useState<string | null>(null)
  const [agentInstructions, setAgentInstructions] = useState('')
  const [appointmentDuration, setAppointmentDuration] = useState(60)
  const [services, setServices]             = useState<Service[]>([])
  const [workingHours, setWorkingHours]     = useState<WeeklyHours>(DEFAULT_WEEKLY_HOURS)

  const [loading, setLoading]               = useState(true)
  const [saving, setSaving]                 = useState(false)
  const [msg, setMsg]                       = useState<{ ok: boolean; text: string } | null>(null)

  const [showAddService, setShowAddService] = useState(false)
  const [newService, setNewService]         = useState({ name: '', description: '', price: '', duration_minutes: null as number | null })
  const [newServicePdf, setNewServicePdf]   = useState<File | null>(null)
  const newServicePdfRef = useRef<HTMLInputElement>(null)
  const [expandedService, setExpandedService] = useState<string | null>(null)
  const [uploadingPdf, setUploadingPdf]     = useState<string | null>(null)
  const [uploadTarget, setUploadTarget]     = useState<string | null>(null)

  // Profissionais
  const [professionals, setProfessionals]         = useState<Professional[]>([])
  const [showAddProfessional, setShowAddProfessional] = useState(false)
  const [newProfessionalName, setNewProfessionalName] = useState('')
  const [addingProfessional, setAddingProfessional]   = useState(false)
  const [expandedProfessional, setExpandedProfessional] = useState<string | null>(null)

  useEffect(() => {
    if (!orgId) return
    supabase.from('agent_settings').select('*').eq('org_id', orgId).single()
      .then(({ data }) => {
        if (data) {
          setAgentId(data.id)
          setAgentInstructions(data.custom_instructions || '')
          setAppointmentDuration(data.appointment_duration ?? 60)
          setServices(data.services || [])
          setWorkingHours(normalizeWeeklyHours(data.working_hours))
        }
        setLoading(false)
      })
    supabase.from('professionals').select('*').eq('org_id', orgId).order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data) {
          setProfessionals(data.map(p => ({
            id: p.id,
            name: p.name,
            active: p.active,
            useCustomHours: p.working_hours != null,
            workingHours: normalizeWeeklyHours(p.working_hours),
          })))
        }
      })
  }, [orgId])

  async function handleSave() {
    if (!orgId) return
    setSaving(true)
    setMsg(null)
    const payload = {
      org_id: orgId,
      agent_name: 'Bento',
      tone: 'friendly',
      custom_instructions: agentInstructions,
      appointment_duration: appointmentDuration,
      specialties: services.map(s => s.name),
      services,
      working_hours: workingHours,
    }
    const { error } = agentId
      ? await supabase.from('agent_settings').update(payload).eq('id', agentId)
      : await supabase.from('agent_settings').insert(payload)

    if (error) {
      setMsg({ ok: false, text: error.message })
    } else {
      setMsg({ ok: true, text: 'Configurações salvas com sucesso.' })
      if (!agentId) {
        const { data } = await supabase.from('agent_settings').select('id').eq('org_id', orgId).single()
        if (data) setAgentId(data.id)
      }
    }
    setSaving(false)
  }

  // ── Profissionais ────────────────────────────────────────────
  async function addProfessional() {
    if (!newProfessionalName.trim() || !orgId) return
    setAddingProfessional(true)
    const { data, error } = await supabase
      .from('professionals')
      .insert({ org_id: orgId, name: newProfessionalName.trim(), active: true })
      .select('*')
      .single()
    setAddingProfessional(false)
    if (error || !data) { alert('Erro ao adicionar profissional: ' + (error?.message ?? '')); return }
    setProfessionals(prev => [...prev, {
      id: data.id, name: data.name, active: data.active,
      useCustomHours: false, workingHours: DEFAULT_WEEKLY_HOURS,
    }])
    setNewProfessionalName('')
    setShowAddProfessional(false)
  }

  async function toggleProfessionalActive(prof: Professional) {
    const nextActive = !prof.active
    setProfessionals(prev => prev.map(p => p.id === prof.id ? { ...p, active: nextActive } : p))
    await supabase.from('professionals').update({ active: nextActive }).eq('id', prof.id)
  }

  function toggleCustomHours(profId: string) {
    setProfessionals(prev => prev.map(p => p.id === profId ? { ...p, useCustomHours: !p.useCustomHours } : p))
  }

  function updateProfessionalHours(profId: string, hours: WeeklyHours) {
    setProfessionals(prev => prev.map(p => p.id === profId ? { ...p, workingHours: hours } : p))
  }

  async function saveProfessionalHours(prof: Professional) {
    setProfessionals(prev => prev.map(p => p.id === prof.id ? { ...p, saving: true } : p))
    const { error } = await supabase
      .from('professionals')
      .update({ working_hours: prof.useCustomHours ? prof.workingHours : null })
      .eq('id', prof.id)
    setProfessionals(prev => prev.map(p => p.id === prof.id ? { ...p, saving: false } : p))
    if (error) alert('Erro ao salvar horário: ' + error.message)
  }

  async function removeProfessional(profId: string) {
    if (!window.confirm('Remover este profissional? Agendamentos já feitos não serão afetados.')) return
    setProfessionals(prev => prev.filter(p => p.id !== profId))
    await supabase.from('professionals').delete().eq('id', profId)
  }

  async function addService() {
    if (!newService.name.trim()) return
    const id = crypto.randomUUID()
    let pdf_url: string | null = null
    let pdf_name: string | null = null

    if (newServicePdf && orgId) {
      setUploadingPdf(id)
      const path = `${orgId}/${id}.pdf`
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
      id,
      name: newService.name.trim(),
      description: newService.description.trim(),
      price: newService.price.trim(),
      pdf_url,
      pdf_name,
      duration_minutes: newService.duration_minutes,
    }])
    setNewService({ name: '', description: '', price: '', duration_minutes: null })
    setNewServicePdf(null)
    setShowAddService(false)
  }

  function removeService(serviceId: string) {
    setServices(prev => prev.filter(s => s.id !== serviceId))
  }

  function setServiceDuration(serviceId: string, duration: number | null) {
    setServices(prev => prev.map(s => s.id === serviceId ? { ...s, duration_minutes: duration } : s))
  }

  function triggerPdfUpload(serviceId: string) {
    setUploadTarget(serviceId)
    fileInputRef.current?.click()
  }

  async function handlePdfFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !uploadTarget || !orgId) return
    e.target.value = ''

    setUploadingPdf(uploadTarget)
    try {
      const path = `${orgId}/${uploadTarget}.pdf`
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
    <div className="flex items-center justify-center py-24">
      <div className="w-6 h-6 border-[3px] border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-5">
      <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handlePdfFileChange} />
      <input ref={newServicePdfRef} type="file" accept=".pdf" className="hidden" onChange={e => { setNewServicePdf(e.target.files?.[0] ?? null); e.target.value = '' }} />

      {/* Header */}
      <div>
        <h1 className="text-xl text-slate-800 leading-none font-bold">Bento</h1>
        <p className="text-sm text-slate-500 mt-1">Configure o perfil e comportamento do seu agente</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

        {/* Coluna esquerda */}
        <div className="space-y-5">

          {/* Perfil do Agente */}
          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-[0px_4px_20px_rgba(0,0,0,0.02)] p-6 space-y-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Perfil do Agente</p>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">Duração do Atendimento</label>
              <p className="text-xs text-slate-400">Tempo padrão de cada consulta/serviço. Aplicado apenas em novos agendamentos.</p>
              <div className="flex flex-wrap gap-2">
                {DURATION_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAppointmentDuration(opt.value)}
                    className={cn(
                      'px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all',
                      appointmentDuration === opt.value
                        ? 'border-brand-400 text-brand-700 bg-white shadow-sm'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

          </div>

          {/* Horário de Funcionamento */}
          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-[0px_4px_20px_rgba(0,0,0,0.02)] p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Horário de Funcionamento</p>
                <p className="text-xs text-slate-400 mt-0.5">O agente só oferece horários dentro desses dias/horas.</p>
              </div>
            </div>
            <WeeklyHoursEditor value={workingHours} onChange={setWorkingHours} />
          </div>

          {/* Instruções Personalizadas */}
          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-[0px_4px_20px_rgba(0,0,0,0.02)] p-6 space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Instruções Personalizadas</p>
              <p className="text-xs text-slate-400 mt-1">Convênios aceitos, horários, procedimentos, regras de atendimento, etc.</p>
            </div>
            <textarea
              value={agentInstructions}
              onChange={e => setAgentInstructions(e.target.value)}
              placeholder={`Ex: Aceitamos os convênios Unimed, Bradesco e Amil.\nFuncionamos de segunda a sexta das 8h às 18h.\nRetornos devem ser agendados em até 30 dias.`}
              rows={8}
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm resize-none font-mono focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all"
            />
          </div>

        </div>

        {/* Coluna direita */}
        <div className="space-y-5">

        {/* Serviços */}
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-[0px_4px_20px_rgba(0,0,0,0.02)] overflow-hidden">
          <div className={cn(
            'flex items-center justify-between px-6 pt-6 pb-4',
            (services.length > 0 || showAddService) && 'border-b border-slate-100'
          )}>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Serviços</p>
              <p className="text-xs text-slate-400 mt-0.5">PDF enviado automaticamente ao confirmar agendamento</p>
            </div>
            <button
              onClick={() => { setShowAddService(v => !v); setNewService({ name: '', description: '', price: '', duration_minutes: null }) }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-brand-500 hover:bg-brand-600 transition-colors shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Novo Serviço
            </button>
          </div>

          {showAddService && (
            <div className="mx-5 my-4 rounded-2xl p-4 space-y-3 bg-slate-50 border border-slate-100">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Nome *</label>
                  <input
                    type="text"
                    value={newService.name}
                    onChange={e => setNewService(s => ({ ...s, name: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && addService()}
                    placeholder="Consulta Cardiologia"
                    autoFocus
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Preço</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400 pointer-events-none">R$</span>
                    <input
                      type="text"
                      value={newService.price}
                      onChange={e => setNewService(s => ({ ...s, price: e.target.value }))}
                      placeholder="150,00"
                      className="w-full border border-slate-200 rounded-xl pl-8 pr-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Descrição</label>
                <input
                  type="text"
                  value={newService.description}
                  onChange={e => setNewService(s => ({ ...s, description: e.target.value }))}
                  placeholder="Detalhes para o agente informar ao paciente"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Duração</label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setNewService(s => ({ ...s, duration_minutes: null }))}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                      newService.duration_minutes === null
                        ? 'border-brand-400 text-brand-700 bg-white shadow-sm'
                        : 'border-slate-200 text-slate-500 bg-white hover:border-slate-300'
                    )}
                  >
                    Padrão da clínica
                  </button>
                  {DURATION_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setNewService(s => ({ ...s, duration_minutes: opt.value }))}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                        newService.duration_minutes === opt.value
                          ? 'border-brand-400 text-brand-700 bg-white shadow-sm'
                          : 'border-slate-200 text-slate-500 bg-white hover:border-slate-300'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* PDF field */}
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">PDF (enviado ao paciente)</label>
                {newServicePdf ? (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white border border-slate-200">
                    <FileText className="w-4 h-4 text-brand-500 shrink-0" />
                    <span className="text-sm text-slate-700 truncate flex-1">{newServicePdf.name}</span>
                    <button type="button" onClick={() => setNewServicePdf(null)} className="text-slate-400 hover:text-rose-500 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => newServicePdfRef.current?.click()}
                    className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl border border-dashed border-slate-300 bg-white text-sm text-slate-400 hover:border-brand-400 hover:text-brand-500 transition-all">
                    <Upload className="w-4 h-4" /> Anexar PDF
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={addService}
                  disabled={!newService.name.trim() || !!uploadingPdf}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 transition-colors disabled:opacity-40"
                >
                  {uploadingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  {uploadingPdf ? 'Enviando…' : 'Adicionar'}
                </button>
                <button
                  onClick={() => { setShowAddService(false); setNewServicePdf(null) }}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
                >
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
                  <div key={svc.id} className="border-b border-slate-100 last:border-b-0">
                    <button
                      onClick={() => setExpandedService(isOpen ? null : svc.id)}
                      className="w-full flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors text-left"
                    >
                      <div className="flex-1 min-w-0 flex items-center gap-3">
                        <span className="text-sm font-semibold text-slate-700 truncate">{svc.name}</span>
                        {svc.price && (
                          <span className="text-xs font-semibold text-brand-600 shrink-0">R$ {svc.price}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {svc.duration_minutes && (
                          <span className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-500">
                            <Clock className="w-3 h-3" />
                            {DURATION_OPTIONS.find(o => o.value === svc.duration_minutes)?.label ?? `${svc.duration_minutes} min`}
                          </span>
                        )}
                        <span className={cn(
                          'flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full',
                          svc.pdf_url ? 'bg-brand-50 text-brand-600' : 'bg-slate-100 text-slate-500'
                        )}>
                          <FileText className="w-3 h-3" />
                          {svc.pdf_url ? 'PDF' : 'Sem PDF'}
                        </span>
                        <ChevronDown className={cn('w-4 h-4 text-slate-300 transition-transform duration-200', isOpen && 'rotate-180')} />
                      </div>
                    </button>

                    {isOpen && (
                      <div className="px-6 pb-5 pt-3 bg-slate-50 border-t border-slate-100">
                        {svc.description && (
                          <p className="text-xs text-slate-500 mb-4">{svc.description}</p>
                        )}
                        <div className="mb-4">
                          <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Duração</label>
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              onClick={() => setServiceDuration(svc.id, null)}
                              className={cn(
                                'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                                !svc.duration_minutes
                                  ? 'border-brand-400 text-brand-700 bg-white shadow-sm'
                                  : 'border-slate-200 text-slate-500 bg-white hover:border-slate-300'
                              )}
                            >
                              Padrão da clínica
                            </button>
                            {DURATION_OPTIONS.map(opt => (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => setServiceDuration(svc.id, opt.value)}
                                className={cn(
                                  'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                                  svc.duration_minutes === opt.value
                                    ? 'border-brand-400 text-brand-700 bg-white shadow-sm'
                                    : 'border-slate-200 text-slate-500 bg-white hover:border-slate-300'
                                )}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => triggerPdfUpload(svc.id)}
                            disabled={isUploading}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 text-slate-600 bg-white hover:border-brand-300 hover:text-brand-600 transition-colors disabled:opacity-50"
                          >
                            {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                            {isUploading ? 'Enviando...' : svc.pdf_url ? 'Trocar PDF' : 'Anexar PDF'}
                          </button>
                          {svc.pdf_url && (
                            <>
                              <span className="text-xs text-slate-400 truncate max-w-[140px]">{svc.pdf_name}</span>
                              <button
                                onClick={() => removePdf(svc.id)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => removeService(svc.id)}
                            className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Remover
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : !showAddService && (
            <div className="text-center py-12 px-6">
              <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-3">
                <FileText className="w-5 h-5 text-slate-300" />
              </div>
              <p className="text-sm font-medium text-slate-400">Nenhum serviço cadastrado</p>
              <p className="text-xs text-slate-300 mt-1">Adicione os serviços oferecidos pela clínica</p>
            </div>
          )}
        </div>

        {/* Profissionais */}
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-[0px_4px_20px_rgba(0,0,0,0.02)] overflow-hidden">
          <div className={cn(
            'flex items-center justify-between px-6 pt-6 pb-4',
            (professionals.length > 0 || showAddProfessional) && 'border-b border-slate-100'
          )}>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-400" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Profissionais</p>
                <p className="text-xs text-slate-400 mt-0.5">Deixe vazio se só há 1 agenda. Cada um pode ter horário próprio.</p>
              </div>
            </div>
            <button
              onClick={() => { setShowAddProfessional(v => !v); setNewProfessionalName('') }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-brand-500 hover:bg-brand-600 transition-colors shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Adicionar
            </button>
          </div>

          {showAddProfessional && (
            <div className="mx-5 my-4 rounded-2xl p-4 space-y-3 bg-slate-50 border border-slate-100">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Nome *</label>
                <input
                  type="text"
                  value={newProfessionalName}
                  onChange={e => setNewProfessionalName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addProfessional()}
                  placeholder="Dra. Fulana de Tal"
                  autoFocus
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={addProfessional}
                  disabled={!newProfessionalName.trim() || addingProfessional}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 transition-colors disabled:opacity-40"
                >
                  {addingProfessional ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  {addingProfessional ? 'Adicionando…' : 'Adicionar'}
                </button>
                <button
                  onClick={() => setShowAddProfessional(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {professionals.length > 0 ? (
            <div>
              {professionals.map(prof => {
                const isOpen = expandedProfessional === prof.id
                return (
                  <div key={prof.id} className="border-b border-slate-100 last:border-b-0">
                    <button
                      onClick={() => setExpandedProfessional(isOpen ? null : prof.id)}
                      className="w-full flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors text-left"
                    >
                      <div className="flex-1 min-w-0 flex items-center gap-3">
                        <UserRound className="w-4 h-4 text-slate-300 shrink-0" />
                        <span className={cn('text-sm font-semibold truncate', prof.active ? 'text-slate-700' : 'text-slate-400')}>
                          {prof.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={cn(
                          'text-[11px] font-semibold px-2.5 py-1 rounded-full',
                          prof.active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                        )}>
                          {prof.active ? 'Ativo' : 'Inativo'}
                        </span>
                        <ChevronDown className={cn('w-4 h-4 text-slate-300 transition-transform duration-200', isOpen && 'rotate-180')} />
                      </div>
                    </button>

                    {isOpen && (
                      <div className="px-6 pb-5 pt-3 bg-slate-50 border-t border-slate-100 space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-slate-600">Profissional ativo (aparece pro agente)</span>
                          <button
                            type="button"
                            onClick={() => toggleProfessionalActive(prof)}
                            className={cn('w-9 h-5 rounded-full transition-all duration-200 relative shrink-0', prof.active ? 'bg-brand-500' : 'bg-slate-200')}
                          >
                            <span className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200', prof.active ? 'left-4' : 'left-0.5')} />
                          </button>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-slate-600">Usar horário próprio (senão usa o horário padrão da clínica)</span>
                          <button
                            type="button"
                            onClick={() => toggleCustomHours(prof.id)}
                            className={cn('w-9 h-5 rounded-full transition-all duration-200 relative shrink-0', prof.useCustomHours ? 'bg-brand-500' : 'bg-slate-200')}
                          >
                            <span className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200', prof.useCustomHours ? 'left-4' : 'left-0.5')} />
                          </button>
                        </div>

                        {prof.useCustomHours && (
                          <WeeklyHoursEditor
                            value={prof.workingHours}
                            onChange={hours => updateProfessionalHours(prof.id, hours)}
                          />
                        )}

                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={() => saveProfessionalHours(prof)}
                            disabled={prof.saving}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-gray-900 hover:bg-gray-800 transition-colors disabled:opacity-50"
                          >
                            {prof.saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            {prof.saving ? 'Salvando…' : 'Salvar horário'}
                          </button>
                          <button
                            onClick={() => removeProfessional(prof.id)}
                            className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Remover
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : !showAddProfessional && (
            <div className="text-center py-12 px-6">
              <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-3">
                <Users className="w-5 h-5 text-slate-300" />
              </div>
              <p className="text-sm font-medium text-slate-400">Agenda única (sem profissionais cadastrados)</p>
              <p className="text-xs text-slate-300 mt-1">Só adicione se a clínica tiver mais de 1 profissional</p>
            </div>
          )}
        </div>

        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 transition-colors disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Salvando...' : 'Salvar Configurações do Agente'}
        </button>
        {msg && (
          <div className={cn(
            'flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-xl',
            msg.ok ? 'bg-brand-50 text-brand-700' : 'bg-red-50 text-red-600'
          )}>
            {msg.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}
            {msg.text}
          </div>
        )}
      </div>
    </div>
  )
}
