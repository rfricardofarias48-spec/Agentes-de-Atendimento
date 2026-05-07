import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { type Organization, type OrgPlan, type OrgStatus } from '../../types'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'

import { planLabel, statusLabel, formatDate } from '../../lib/utils'

const plans: OrgPlan[] = ['starter', 'pro', 'clinic']
const statuses: OrgStatus[] = ['active', 'trial', 'inactive', 'suspended']

const maxConvByPlan: Record<OrgPlan, number> = { starter: 600, pro: 2000, clinic: 999999 }

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

  useEffect(() => {
    if (!isNew && id) {
      supabase.from('organizations').select('*').eq('id', id).single()
        .then(({ data }) => { if (data) setOrg(data); setLoading(false) })
    }
  }, [id, isNew])

  function handlePlanChange(plan: OrgPlan) {
    setOrg(o => ({ ...o, plan, max_conversations_month: maxConvByPlan[plan] }))
  }

  async function handleSave() {
    setSaving(true)
    if (isNew) {
      // Cria organização
      const { data: newOrg, error } = await supabase.from('organizations').insert({
        name: org.name, slug: org.slug, plan: org.plan, status: org.status,
        whatsapp_numbers: org.whatsapp_numbers ?? [],
        agent_tone: org.agent_tone ?? 'friendly',
        max_conversations_month: org.max_conversations_month,
        conversations_used: 0,
        chatwoot_url: org.chatwoot_url ?? null,
        chatwoot_token: org.chatwoot_token ?? null,
        asaas_key: org.asaas_key ?? null,
        google_calendar_id: org.google_calendar_id ?? null,
      }).select().single()

      if (error) { alert('Erro ao criar cliente: ' + error.message); setSaving(false); return }

      // Cria usuário se email/senha preenchidos
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

      navigate(`/admin/clients/${newOrg?.id}`)
    } else {
      const { error } = await supabase.from('organizations').update({
        name: org.name, slug: org.slug, plan: org.plan, status: org.status,
        whatsapp_numbers: org.whatsapp_numbers,
        agent_tone: org.agent_tone,
        max_conversations_month: org.max_conversations_month,
        chatwoot_url: org.chatwoot_url,
        chatwoot_token: org.chatwoot_token,
        asaas_key: org.asaas_key,
        google_calendar_id: org.google_calendar_id,
      }).eq('id', id!)
      if (error) { alert('Erro ao salvar: ' + error.message) }
    }
    setSaving(false)
  }

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/clients')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isNew ? 'Novo Cliente' : org.name}
          </h1>
          {!isNew && org.created_at && (
            <p className="text-sm text-gray-500">Criado em {formatDate(org.created_at)}</p>
          )}
        </div>
      </div>

      {/* Dados básicos */}
      <Card>
        <CardHeader><CardTitle>Dados da Clínica</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome</label>
              <Input value={org.name ?? ''} onChange={e => setOrg(o => ({ ...o, name: e.target.value }))} placeholder="Clínica São Lucas" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Slug</label>
              <Input value={org.slug ?? ''} onChange={e => setOrg(o => ({ ...o, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') }))} placeholder="clinica-sao-lucas" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Plano</label>
              <div className="flex gap-2">
                {plans.map(p => (
                  <button
                    key={p}
                    onClick={() => handlePlanChange(p)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${org.plan === p ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-600 hover:border-primary/50'}`}
                  >
                    {planLabel(p)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
              <div className="flex gap-2 flex-wrap">
                {statuses.map(s => (
                  <button
                    key={s}
                    onClick={() => setOrg(o => ({ ...o, status: s }))}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${org.status === s ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-600 hover:border-primary/50'}`}
                  >
                    {statusLabel(s)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Tom do Agente</label>
            <div className="flex gap-2">
              {(['formal', 'friendly'] as const).map(t => (
                <button key={t} onClick={() => setOrg(o => ({ ...o, agent_tone: t }))}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${org.agent_tone === t ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-600'}`}>
                  {t === 'formal' ? 'Formal' : 'Amigável'}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Integrações */}
      <Card>
        <CardHeader><CardTitle>Integrações</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Chatwoot URL</label>
            <Input value={org.chatwoot_url ?? ''} onChange={e => setOrg(o => ({ ...o, chatwoot_url: e.target.value }))} placeholder="https://chatwoot.seudominio.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Chatwoot Token</label>
            <Input value={org.chatwoot_token ?? ''} onChange={e => setOrg(o => ({ ...o, chatwoot_token: e.target.value }))} placeholder="token do inbox" type="password" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Google Calendar ID</label>
            <Input value={org.google_calendar_id ?? ''} onChange={e => setOrg(o => ({ ...o, google_calendar_id: e.target.value }))} placeholder="email@gmail.com ou calendar_id" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Asaas API Key</label>
            <Input value={org.asaas_key ?? ''} onChange={e => setOrg(o => ({ ...o, asaas_key: e.target.value }))} placeholder="$aas_..." type="password" />
          </div>
        </CardContent>
      </Card>

      {/* Criar usuário (apenas novo) */}
      {isNew && (
        <Card>
          <CardHeader><CardTitle>Acesso ao Dashboard</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">E-mail do cliente</label>
              <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="dono@clinica.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Senha inicial</label>
              <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Senha provisória" />
            </div>
            <p className="text-xs text-gray-400">O cliente pode alterar a senha após o primeiro login.</p>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="w-4 h-4" />
          {saving ? 'Salvando...' : 'Salvar'}
        </Button>
        {!isNew && (
          <Button variant="destructive" size="sm" className="gap-2 ml-auto"
            onClick={async () => {
              if (!confirm('Remover este cliente? Ação irreversível.')) return
              await supabase.from('organizations').delete().eq('id', id!)
              navigate('/admin/clients')
            }}>
            <Trash2 className="w-4 h-4" /> Remover Cliente
          </Button>
        )}
      </div>
    </div>
  )
}
