import { useEffect, useRef, useState } from 'react'
import {
  Save, Plus, Trash2, FileText, ChevronDown, Upload, X, Loader2, CheckCircle2, XCircle,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { cn } from '../../lib/utils'

interface Service {
  id: string
  name: string
  description: string
  price: string
  pdf_url: string | null
  pdf_name: string | null
}

export default function ClientBento() {
  const { orgId } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [agentId, setAgentId]               = useState<string | null>(null)
  const [agentName, setAgentName]           = useState('Assistente')
  const [agentGreeting, setAgentGreeting]   = useState('')
  const [agentTone, setAgentTone]           = useState<'friendly' | 'formal'>('friendly')
  const [agentInstructions, setAgentInstructions] = useState('')
  const [services, setServices]             = useState<Service[]>([])

  const [loading, setLoading]               = useState(true)
  const [saving, setSaving]                 = useState(false)
  const [msg, setMsg]                       = useState<{ ok: boolean; text: string } | null>(null)

  const [showAddService, setShowAddService] = useState(false)
  const [newService, setNewService]         = useState({ name: '', description: '', price: '' })
  const [newServicePdf, setNewServicePdf]   = useState<File | null>(null)
  const newServicePdfRef = useRef<HTMLInputElement>(null)
  const [expandedService, setExpandedService] = useState<string | null>(null)
  const [uploadingPdf, setUploadingPdf]     = useState<string | null>(null)
  const [uploadTarget, setUploadTarget]     = useState<string | null>(null)

  useEffect(() => {
    if (!orgId) return
    supabase.from('agent_settings').select('*').eq('org_id', orgId).single()
      .then(({ data }) => {
        if (data) {
          setAgentId(data.id)
          setAgentName(data.agent_name || 'Assistente')
          setAgentGreeting(data.greeting_message || '')
          setAgentTone(data.tone === 'formal' ? 'formal' : 'friendly')
          setAgentInstructions(data.custom_instructions || '')
          setServices(data.services || [])
        }
        setLoading(false)
      })
  }, [orgId])

  async function handleSave() {
    if (!orgId) return
    setSaving(true)
    setMsg(null)
    const payload = {
      org_id: orgId,
      agent_name: agentName,
      greeting_message: agentGreeting,
      tone: agentTone,
      custom_instructions: agentInstructions,
      specialties: services.map(s => s.name),
      services,
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
              <label className="block text-sm font-medium text-slate-700">Nome do Agente</label>
              <input
                type="text"
                value={agentName}
                onChange={e => setAgentName(e.target.value)}
                placeholder="Assistente"
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">Tom de Voz</label>
              <div className="flex gap-2">
                {([
                  { value: 'friendly', label: 'Amigável' },
                  { value: 'formal',   label: 'Formal' },
                ] as const).map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAgentTone(opt.value)}
                    className={cn(
                      'px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all',
                      agentTone === opt.value
                        ? 'border-brand-400 text-brand-700 bg-white shadow-sm'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">Mensagem de Saudação</label>
              <textarea
                value={agentGreeting}
                onChange={e => setAgentGreeting(e.target.value)}
                placeholder="Olá! Sou o assistente da clínica. Como posso ajudar?"
                rows={3}
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all"
              />
            </div>
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

        {/* Coluna direita — Serviços */}
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
              onClick={() => { setShowAddService(v => !v); setNewService({ name: '', description: '', price: '' }) }}
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
