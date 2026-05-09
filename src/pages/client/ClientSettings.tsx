import { useEffect, useState } from 'react'
import { Save, Lock, User, Bell, Eye, EyeOff, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { type Organization } from '../../types'
import { cn } from '../../lib/utils'

export default function ClientSettings() {
  const { orgId } = useAuth()
  const [org, setOrg] = useState<Partial<Organization>>({})
  const [loading, setLoading] = useState(true)

  // Perfil
  const [clinicName, setClinicName]   = useState('')
  const [phone, setPhone]             = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg]   = useState<{ ok: boolean; text: string } | null>(null)

  // Senha
  const [currentPass, setCurrentPass] = useState('')
  const [newPass, setNewPass]         = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew]         = useState(false)
  const [savingPass, setSavingPass]   = useState(false)
  const [passMsg, setPassMsg]         = useState<{ ok: boolean; text: string } | null>(null)

  // Notificações
  const [reminder24h, setReminder24h]     = useState(true)
  const [reminder2h, setReminder2h]       = useState(true)
  const [autoSendPdf, setAutoSendPdf]     = useState(true)
  const [savingNotif, setSavingNotif]     = useState(false)
  const [notifMsg, setNotifMsg]           = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (!orgId) return
    Promise.all([
      supabase.from('organizations').select('*').eq('id', orgId).single(),
      supabase.from('agent_settings').select('reminder_24h,reminder_2h,auto_send_pdf').eq('org_id', orgId).single(),
    ]).then(([{ data: orgData }, { data: notifData }]) => {
      if (orgData) {
        setOrg(orgData)
        setClinicName(orgData.name ?? '')
        setPhone((orgData as Record<string, string>).phone ?? '')
      }
      if (notifData) {
        setReminder24h(notifData.reminder_24h ?? true)
        setReminder2h(notifData.reminder_2h ?? true)
        setAutoSendPdf(notifData.auto_send_pdf ?? true)
      }
      setLoading(false)
    })
  }, [orgId])

  async function handleSaveProfile() {
    if (!orgId) return
    setSavingProfile(true)
    setProfileMsg(null)
    const { error } = await supabase
      .from('organizations')
      .update({ name: clinicName, phone } as Record<string, string>)
      .eq('id', orgId)
    setProfileMsg(error
      ? { ok: false, text: error.message }
      : { ok: true, text: 'Dados atualizados com sucesso.' }
    )
    setSavingProfile(false)
  }

  async function handleChangePassword() {
    if (newPass.length < 6) {
      setPassMsg({ ok: false, text: 'A nova senha deve ter pelo menos 6 caracteres.' })
      return
    }
    if (newPass !== confirmPass) {
      setPassMsg({ ok: false, text: 'As senhas não coincidem.' })
      return
    }
    setSavingPass(true)
    setPassMsg(null)
    const { error } = await supabase.auth.updateUser({ password: newPass })
    if (error) {
      setPassMsg({ ok: false, text: error.message })
    } else {
      setPassMsg({ ok: true, text: 'Senha alterada com sucesso.' })
      setCurrentPass(''); setNewPass(''); setConfirmPass('')
    }
    setSavingPass(false)
  }

  async function handleSaveNotif() {
    if (!orgId) return
    setSavingNotif(true)
    setNotifMsg(null)
    const { data: existing } = await supabase
      .from('agent_settings').select('id').eq('org_id', orgId).single()
    const payload = { reminder_24h: reminder24h, reminder_2h: reminder2h, auto_send_pdf: autoSendPdf }
    const { error } = existing
      ? await supabase.from('agent_settings').update(payload).eq('org_id', orgId)
      : await supabase.from('agent_settings').insert({ ...payload, org_id: orgId })
    setNotifMsg(error
      ? { ok: false, text: error.message }
      : { ok: true, text: 'Preferências salvas.' }
    )
    setSavingNotif(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-6 h-6 border-[3px] border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const cardCls = 'bg-white rounded-[2rem] border border-slate-100 shadow-[0px_4px_20px_rgba(0,0,0,0.02)] p-6 space-y-5'

  return (
    <div className="space-y-5">

      <div>
        <h1 className="text-xl font-bold text-slate-800 leading-none">Configurações</h1>
        <p className="text-sm text-slate-500 mt-1">Gerencie sua conta e preferências</p>
      </div>

      {/* ── Linha 1: Dados + Segurança ────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

        {/* Dados da Clínica */}
        <div className={cardCls}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
              <User className="w-3.5 h-3.5 text-slate-500" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Dados da Clínica</p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">Nome da Clínica</label>
            <input
              type="text"
              value={clinicName}
              onChange={e => setClinicName(e.target.value)}
              placeholder="Ex: Clínica São Lucas"
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">E-mail de acesso</label>
            <input
              type="email"
              value={(org as Record<string, string>).email ?? ''}
              disabled
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 text-slate-400 cursor-not-allowed"
            />
            <p className="text-xs text-slate-400">O e-mail não pode ser alterado aqui. Contate o suporte se necessário.</p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">Telefone / WhatsApp</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="(00) 00000-0000"
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all"
            />
          </div>

          <SaveRow saving={savingProfile} msg={profileMsg} onSave={handleSaveProfile} label="Salvar Dados" />
        </div>

        {/* Segurança */}
        <div className={cardCls}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
              <Lock className="w-3.5 h-3.5 text-slate-500" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Segurança</p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">Senha atual</label>
            <PasswordInput value={currentPass} onChange={setCurrentPass} show={showCurrent} onToggle={() => setShowCurrent(v => !v)} placeholder="Sua senha atual" />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">Nova senha</label>
            <PasswordInput value={newPass} onChange={setNewPass} show={showNew} onToggle={() => setShowNew(v => !v)} placeholder="Mínimo 6 caracteres" />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">Confirmar nova senha</label>
            <PasswordInput value={confirmPass} onChange={setConfirmPass} show={showNew} onToggle={() => setShowNew(v => !v)} placeholder="Repita a nova senha" />
          </div>

          <SaveRow
            saving={savingPass}
            msg={passMsg}
            onSave={handleChangePassword}
            label="Alterar Senha"
            disabled={!newPass || !confirmPass}
          />
        </div>
      </div>

      {/* ── Linha 2: Notificações (largura total) ─────────────── */}
      <div className={cardCls}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
            <Bell className="w-3.5 h-3.5 text-slate-500" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Notificações Automáticas</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {([
            [reminder24h,  setReminder24h,  'Lembrete 24h antes da consulta'],
            [reminder2h,   setReminder2h,   'Lembrete 2h antes da consulta'],
            [autoSendPdf,  setAutoSendPdf,  'Enviar PDF de orientações ao confirmar agendamento'],
          ] as [boolean, (v: boolean) => void, string][]).map(([val, setter, label]) => (
            <label key={label} className="flex items-center gap-3 cursor-pointer group p-4 rounded-2xl border border-slate-100 hover:bg-slate-50 transition-colors">
              <div
                onClick={() => setter(!val)}
                className={cn(
                  'w-9 h-5 rounded-full transition-colors duration-200 relative shrink-0 cursor-pointer',
                  val ? 'bg-brand-500' : 'bg-slate-200'
                )}
              >
                <div className={cn(
                  'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200',
                  val ? 'translate-x-4' : 'translate-x-0.5'
                )} />
              </div>
              <span className="text-sm text-slate-700 group-hover:text-slate-900 transition-colors leading-snug">{label}</span>
            </label>
          ))}
        </div>

        <SaveRow saving={savingNotif} msg={notifMsg} onSave={handleSaveNotif} label="Salvar Preferências" />
      </div>

    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────

function PasswordInput({ value, onChange, show, onToggle, placeholder }: {
  value: string; onChange: (v: string) => void
  show: boolean; onToggle: () => void; placeholder?: string
}) {
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all"
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}

function SaveRow({ saving, msg, onSave, label, disabled }: {
  saving: boolean; msg: { ok: boolean; text: string } | null
  onSave: () => void; label: string; disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <button
        onClick={onSave}
        disabled={saving || disabled}
        className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 transition-colors disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? 'Salvando...' : label}
      </button>
      {msg && (
        <div className={cn(
          'flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl',
          msg.ok ? 'bg-brand-50 text-brand-700' : 'bg-red-50 text-red-600'
        )}>
          {msg.ok
            ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            : <XCircle className="w-3.5 h-3.5 shrink-0" />}
          {msg.text}
        </div>
      )}
    </div>
  )
}
