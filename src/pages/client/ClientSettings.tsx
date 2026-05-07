import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { type AgentSettings } from '../../types'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'

export default function ClientSettings() {
  const { orgId } = useAuth()
  const [settings, setSettings] = useState<Partial<AgentSettings>>({
    agent_name: 'Assistente', greeting_message: '', tone: 'friendly',
    specialties: [], reminder_24h: true, reminder_2h: true, auto_send_pdf: true,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newSpecialty, setNewSpecialty] = useState('')

  useEffect(() => {
    if (!orgId) return
    supabase.from('agent_settings').select('*').eq('org_id', orgId).single()
      .then(({ data }) => { if (data) setSettings(data); setLoading(false) })
  }, [orgId])

  async function handleSave() {
    if (!orgId) return
    setSaving(true)
    const { data: existing } = await supabase.from('agent_settings').select('id').eq('org_id', orgId).single()

    if (existing) {
      await supabase.from('agent_settings').update({ ...settings, updated_at: new Date().toISOString() }).eq('org_id', orgId)
    } else {
      await supabase.from('agent_settings').insert({ ...settings, org_id: orgId })
    }
    setSaving(false)
  }

  function addSpecialty() {
    if (!newSpecialty.trim()) return
    setSettings(s => ({ ...s, specialties: [...(s.specialties ?? []), newSpecialty.trim()] }))
    setNewSpecialty('')
  }

  function removeSpecialty(i: number) {
    setSettings(s => ({ ...s, specialties: (s.specialties ?? []).filter((_, idx) => idx !== i) }))
  }

  if (loading) return <div className="flex justify-center py-20"><div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configurações do Agente</h1>
        <p className="text-sm text-gray-500">Personalize o comportamento do agente</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Identidade</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome do Agente</label>
            <Input value={settings.agent_name ?? ''} onChange={e => setSettings(s => ({ ...s, agent_name: e.target.value }))} placeholder="Ex: Ana, Carlos, Assistente..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Mensagem de Boas-vindas</label>
            <textarea
              className="w-full border border-input rounded-md px-3 py-2 text-sm min-h-[80px] resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Olá! Sou a assistente da Clínica X. Como posso ajudar?"
              value={settings.greeting_message ?? ''}
              onChange={e => setSettings(s => ({ ...s, greeting_message: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Tom de Atendimento</label>
            <div className="flex gap-2">
              {(['formal', 'friendly'] as const).map(t => (
                <button key={t} onClick={() => setSettings(s => ({ ...s, tone: t }))}
                  className={`px-3 py-1.5 rounded text-sm font-medium border transition-colors ${settings.tone === t ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-600'}`}>
                  {t === 'formal' ? 'Formal' : 'Amigável'}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Especialidades</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder="Ex: Cardiologia" value={newSpecialty} onChange={e => setNewSpecialty(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addSpecialty()} />
            <Button variant="outline" onClick={addSpecialty}>Adicionar</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(settings.specialties ?? []).map((s, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm">
                {s}
                <button onClick={() => removeSpecialty(i)} className="text-blue-400 hover:text-blue-700">×</button>
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Automações</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {([
            ['reminder_24h', 'Lembrete 24h antes da consulta'],
            ['reminder_2h', 'Lembrete 2h antes da consulta'],
            ['auto_send_pdf', 'Enviar PDF de orientações automaticamente'],
          ] as [keyof AgentSettings, string][]).map(([key, label]) => (
            <label key={key} className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 rounded"
                checked={!!settings[key]}
                onChange={e => setSettings(s => ({ ...s, [key]: e.target.checked }))} />
              <span className="text-sm text-gray-700">{label}</span>
            </label>
          ))}
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="gap-2">
        <Save className="w-4 h-4" />
        {saving ? 'Salvando...' : 'Salvar Configurações'}
      </Button>
    </div>
  )
}
