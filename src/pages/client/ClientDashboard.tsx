import { useEffect, useState, useMemo } from 'react'
import { MessageSquare, Calendar, CheckCircle, XCircle } from 'lucide-react'
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

        <div className="flex items-center gap-3">
          {/* Avatar com offset sombra (Elevva style) */}
          <div className="relative shrink-0 group cursor-default">
            <div className="absolute inset-0 bg-emerald-400 rounded-lg translate-x-1 translate-y-1 transition-transform duration-300 group-hover:translate-x-1.5 group-hover:translate-y-1.5" />
            <div className="w-9 h-9 bg-slate-600 rounded-lg relative flex items-center justify-center text-white text-sm font-bold border-2 border-slate-600 z-10 shadow-sm">
              {avatarLetter}
            </div>
          </div>
          <h1 className="text-xl text-slate-800 leading-none">
            Olá, <span className="font-bold">{firstName}</span>
          </h1>
        </div>

        {/* Period filter — Elevva pill style */}
        <div className="flex items-center bg-white border border-slate-200 rounded-2xl p-1 shadow-[0px_4px_20px_rgba(0,0,0,0.04)]">
          {PERIODS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={cn(
                'px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-150',
                period === key
                  ? 'bg-slate-600 text-white shadow-sm'
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
            <p className="text-xs font-medium text-slate-500">Conversas</p>
            <MessageSquare className="w-5 h-5 text-slate-300" />
          </div>
          <span className="text-4xl font-bold text-gray-900 leading-none">{filtered.conversations}</span>
        </div>

        {/* Agendamentos — white */}
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-[0px_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0px_4px_25px_rgba(0,0,0,0.05)] transition-all">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-medium text-slate-500">Agendamentos</p>
            <Calendar className="w-5 h-5 text-slate-300" />
          </div>
          <span className="text-4xl font-bold text-gray-900 leading-none">{filtered.appointments}</span>
        </div>

        {/* Consultas Realizadas — white */}
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-[0px_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0px_4px_25px_rgba(0,0,0,0.05)] transition-all">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-medium text-slate-500">Consultas Realizadas</p>
            <CheckCircle className="w-5 h-5 text-slate-300" />
          </div>
          <span className="text-4xl font-bold text-gray-900 leading-none">{filtered.completed}</span>
        </div>

        {/* Cancelamentos — gray card */}
        <div className="bg-slate-600 p-6 rounded-[2rem] border border-slate-500 shadow-[0px_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0px_4px_25px_rgba(0,0,0,0.05)] transition-all">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-medium text-slate-300">Cancelamentos</p>
            <XCircle className="w-5 h-5 text-slate-300" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-bold text-white leading-none">{filtered.cancelled}</span>
          </div>
        </div>
      </div>

      {/* ── Bottom Section ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Agendamentos Recentes — 2 colunas */}
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-[0px_4px_20px_rgba(0,0,0,0.02)] lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-emerald-500" />
              Agendamentos Recentes
            </h3>
            <span className="text-xs font-medium text-slate-400">
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
                    <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-semibold text-sm shrink-0">
                      {appt.patient_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{appt.patient_name}</p>
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

        {/* Meu Plano — gray card */}
        <div className="bg-slate-700 p-6 rounded-[2rem] relative overflow-hidden flex flex-col justify-between shadow-[0px_4px_20px_rgba(0,0,0,0.08)] lg:col-span-1">
          <div className="relative z-10">
            <p className="text-xs font-medium text-slate-400 mb-3">Plano atual</p>
            <h3 className="text-3xl font-bold text-white mb-2">{planName}</h3>
            <p className="text-slate-300 text-sm font-medium">
              {org?.conversations_used ?? 0} de {org?.max_conversations_month ?? 0} conversas utilizadas
            </p>
          </div>

          {/* Barra de uso */}
          <div className="relative z-10 mt-5">
            <div className="w-full h-1.5 bg-slate-500 rounded-full overflow-hidden mb-4">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${usagePct}%`,
                  background: usagePct > 80 ? '#f43f5e' : '#10b981',
                }}
              />
            </div>
            <p className="text-xs font-medium text-zinc-400 text-right">{usagePct.toFixed(0)}% usado</p>
          </div>

          {/* Glow decorativo */}
          <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-zinc-800 rounded-full blur-[50px] opacity-50 pointer-events-none" />
        </div>

      </div>
    </div>
  )
}
