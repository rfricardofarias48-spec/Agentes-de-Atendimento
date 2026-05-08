import { useEffect, useState, useMemo } from 'react'
import { MessageSquare, Calendar, CheckCircle, XCircle, Bot, ExternalLink } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { type Appointment, type Conversation, type Organization } from '../../types'
import { formatDate, statusLabel } from '../../lib/utils'
import { Badge } from '../../components/ui/badge'
import { cn } from '../../lib/utils'

type Period = 'day' | 'week' | 'month'

const PERIODS: { key: Period; label: string }[] = [
  { key: 'day',   label: 'Hoje' },
  { key: 'week',  label: 'Semana' },
  { key: 'month', label: 'Mês' },
]

const statusColors: Record<string, 'success' | 'secondary' | 'warning' | 'destructive' | 'outline'> = {
  scheduled: 'secondary', confirmed: 'success', cancelled: 'destructive', completed: 'outline',
}

const PLAN_LABEL: Record<string, string> = {
  starter: 'Starter',
  pro:     'Pro',
  clinic:  'Clinic',
}

function getPeriodStart(period: Period): Date {
  const now = new Date()
  if (period === 'day') return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (period === 'week') {
    const d = new Date(now)
    d.setDate(d.getDate() - 6)
    d.setHours(0, 0, 0, 0)
    return d
  }
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

export default function ClientDashboard() {
  const { orgId } = useAuth()
  const [org, setOrg] = useState<Organization | null>(null)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [period, setPeriod] = useState<Period>('month')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orgId) return
    async function load() {
      const monthAgo = new Date()
      monthAgo.setDate(monthAgo.getDate() - 30)
      const [{ data: orgData }, { data: apptData }, { data: convData }] = await Promise.all([
        supabase.from('organizations').select('*').eq('id', orgId!).single(),
        supabase.from('appointments').select('*').eq('org_id', orgId!).gte('scheduled_at', monthAgo.toISOString()).order('scheduled_at', { ascending: false }),
        supabase.from('conversations').select('*').eq('org_id', orgId!).gte('started_at', monthAgo.toISOString()),
      ])
      if (orgData) setOrg(orgData)
      if (apptData) setAppointments(apptData)
      if (convData) setConversations(convData)
      setLoading(false)
    }
    load()
  }, [orgId])

  const filtered = useMemo(() => {
    const start = getPeriodStart(period)
    const appts = appointments.filter(a => new Date(a.scheduled_at) >= start)
    const convs  = conversations.filter(c => new Date(c.started_at) >= start)
    return {
      conversations: convs.length,
      appointments:  appts.length,
      completed:     appts.filter(a => a.status === 'completed').length,
      cancelled:     appts.filter(a => a.status === 'cancelled').length,
      recentAppts:   appts.slice(0, 6),
    }
  }, [appointments, conversations, period])

  const usagePct = org ? Math.min(100, (org.conversations_used / org.max_conversations_month) * 100) : 0
  const planName = org?.plan ? (PLAN_LABEL[org.plan] ?? org.plan) : '—'
  const firstName = org?.name?.split(' ')[0] ?? '—'
  const avatarLetter = org?.name?.charAt(0).toUpperCase() ?? '?'

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-6 h-6 border-[3px] border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-5">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">

        <div className="flex items-center gap-4">
          {/* Avatar com offset sombra (Elevva style) */}
          <div className="relative shrink-0 group cursor-default">
            <div className="absolute inset-0 bg-emerald-500 rounded-xl translate-x-1 translate-y-1 transition-transform duration-300 group-hover:translate-x-1.5 group-hover:translate-y-1.5" />
            <div className="w-12 h-12 bg-black rounded-xl relative flex items-center justify-center text-white text-lg font-black border-2 border-black z-10 shadow-sm">
              {avatarLetter}
            </div>
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tighter leading-none">
              Olá, {firstName} ✦
            </h1>
            <p className="text-sm text-slate-400 font-medium mt-0.5">Veja o resumo da sua clínica</p>
          </div>
        </div>

        {/* Period filter — Elevva pill style */}
        <div className="flex items-center bg-white border border-slate-200 rounded-2xl p-1 shadow-[0px_4px_20px_rgba(0,0,0,0.04)]">
          {PERIODS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={cn(
                'px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-150',
                period === key
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-700'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 4 Metric Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

        {/* Conversas — white */}
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-[0px_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0px_4px_25px_rgba(0,0,0,0.05)] transition-all">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Conversas</p>
            <MessageSquare className="w-5 h-5 text-slate-300" />
          </div>
          <span className="text-5xl font-black text-[#0f172a] tracking-tighter leading-none">{filtered.conversations}</span>
        </div>

        {/* Agendamentos — white */}
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-[0px_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0px_4px_25px_rgba(0,0,0,0.05)] transition-all">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Agendamentos</p>
            <Calendar className="w-5 h-5 text-slate-300" />
          </div>
          <span className="text-5xl font-black text-[#0f172a] tracking-tighter leading-none">{filtered.appointments}</span>
        </div>

        {/* Consultas Realizadas — white */}
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-[0px_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0px_4px_25px_rgba(0,0,0,0.05)] transition-all">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Consultas Realizadas</p>
            <CheckCircle className="w-5 h-5 text-slate-300" />
          </div>
          <span className="text-5xl font-black text-[#0f172a] tracking-tighter leading-none">{filtered.completed}</span>
        </div>

        {/* Cancelamentos — dark card (Elevva "Horas Salvas" style) */}
        <div className="bg-zinc-900 p-6 rounded-[2rem] border border-zinc-800 shadow-[0px_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0px_4px_25px_rgba(0,0,0,0.05)] transition-all">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[11px] font-black text-zinc-400 uppercase tracking-widest">Cancelamentos</p>
            <XCircle className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-5xl font-black text-white tracking-tighter leading-none">{filtered.cancelled}</span>
          </div>
        </div>
      </div>

      {/* ── Bottom Section ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">

        {/* Agendamentos Recentes — 2 colunas */}
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-[0px_4px_20px_rgba(0,0,0,0.02)] lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-black text-slate-900 tracking-tighter flex items-center gap-2">
              <Calendar className="w-5 h-5 text-emerald-500" />
              Agendamentos Recentes
            </h3>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {period === 'day' ? 'hoje' : period === 'week' ? 'esta semana' : 'este mês'}
            </span>
          </div>

          {filtered.recentAppts.length === 0 ? (
            <div className="text-center py-10">
              <Calendar className="w-8 h-8 text-slate-200 mx-auto mb-2" />
              <p className="text-slate-400 font-medium text-sm">Nenhum agendamento neste período.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.recentAppts.map(appt => (
                <div key={appt.id} className="flex items-center justify-between p-4 rounded-2xl border border-slate-100 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-black text-sm shrink-0">
                      {appt.patient_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-black text-slate-900 text-sm truncate">{appt.patient_name}</p>
                      <p className="text-xs text-slate-500 font-medium truncate">
                        {appt.specialty}{appt.doctor_name ? ` · ${appt.doctor_name}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    <div className="text-right hidden sm:block">
                      <p className="font-bold text-slate-900 text-sm">{formatDate(appt.scheduled_at)}</p>
                    </div>
                    <Badge variant={statusColors[appt.status] ?? 'outline'} className="text-[10px] whitespace-nowrap">
                      {statusLabel(appt.status)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Agente em Ação — 1 coluna */}
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-[0px_4px_20px_rgba(0,0,0,0.02)] flex flex-col justify-between relative overflow-hidden lg:col-span-1">
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
              <div className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
              </div>
              <span className="text-xs font-black text-emerald-600 uppercase tracking-widest">Online</span>
            </div>
            <h3 className="text-2xl font-black text-slate-900 tracking-tighter mb-2">Agente em Ação</h3>
            <p className="text-slate-500 font-medium text-xs">
              Seu agente está atendendo pacientes no WhatsApp.
            </p>
          </div>

          <div className="relative z-10 mt-6">
            {org?.chatwoot_url ? (
              <a
                href={org.chatwoot_url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-3 rounded-xl font-black text-sm transition-all shadow-[0_4px_14px_0_rgba(16,185,129,0.4)] hover:shadow-[0_6px_20px_rgba(16,185,129,0.5)] hover:-translate-y-0.5 active:translate-y-0"
              >
                <Bot className="w-4 h-4" /> Acompanhar
                <ExternalLink className="w-3.5 h-3.5 opacity-70" />
              </a>
            ) : (
              <p className="text-xs text-slate-400 text-center font-medium">
                Configure o Chatwoot nas configurações para acompanhar conversas.
              </p>
            )}
          </div>

          {/* Glow decorativo */}
          <div className="absolute right-0 bottom-0 w-48 h-48 bg-emerald-50 rounded-full blur-[60px] opacity-60 -mr-10 -mb-10 pointer-events-none" />
        </div>

        {/* Meu Plano — dark card (Elevva "Plano Atual" style) */}
        <div className="bg-[#0a0a0a] p-6 rounded-[2rem] relative overflow-hidden flex flex-col justify-between shadow-xl lg:col-span-1">
          <div className="relative z-10">
            <p className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-3">PLANO ATUAL</p>
            <h3 className="text-4xl font-black text-white mb-2 tracking-tighter">{planName}</h3>
            <p className="text-zinc-400 text-sm font-medium">
              {org?.conversations_used ?? 0} de {org?.max_conversations_month ?? 0} conversas utilizadas
            </p>
          </div>

          {/* Barra de uso */}
          <div className="relative z-10 mt-5">
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-4">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${usagePct}%`,
                  background: usagePct > 80 ? '#f43f5e' : '#10b981',
                }}
              />
            </div>
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest text-right">{usagePct.toFixed(0)}% usado</p>
          </div>

          {/* Glow decorativo */}
          <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-zinc-800 rounded-full blur-[50px] opacity-50 pointer-events-none" />
        </div>

      </div>
    </div>
  )
}
