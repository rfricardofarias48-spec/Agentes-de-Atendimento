import { type ReactNode, useEffect, useState, useMemo } from 'react'
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
  starter: 'Essencial',
  pro:     'Pro',
  clinic:  'Max',
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

// ── Metric card left-border accent colors (inline style for custom brand color)
const CARD_ACCENTS = {
  brand:   { border: '#2C82B5', iconBg: 'bg-brand-50',   iconColor: 'text-brand-500'   },
  violet:  { border: '#7c3aed', iconBg: 'bg-violet-50',  iconColor: 'text-violet-500'  },
  emerald: { border: '#10b981', iconBg: 'bg-emerald-50', iconColor: 'text-emerald-500' },
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
  const periodLabel = period === 'day' ? 'hoje' : period === 'week' ? 'esta semana' : 'este mês'

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-5 h-5 border-[2.5px] border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-5">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">

        <div className="flex items-center gap-3.5">
          {/* Avatar with online dot */}
          <div className="relative shrink-0">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-white text-sm font-bold shadow-[0_4px_14px_rgba(44,130,181,0.32)]"
              style={{ background: 'linear-gradient(135deg, #2C82B5 0%, #1e5f88 100%)' }}
            >
              {avatarLetter}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-white" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 leading-none mb-1">
              Bem-vindo de volta
            </p>
            <h1 className="text-xl font-bold text-gray-900 leading-none">{firstName}</h1>
          </div>
        </div>

        {/* Period switcher */}
        <div className="flex items-center bg-white border border-slate-200 rounded-2xl p-1 shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
          {PERIODS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={cn(
                'px-4 py-1.5 rounded-xl text-[13px] font-semibold transition-all duration-200',
                period === key
                  ? 'text-white shadow-[0_2px_8px_rgba(37,112,160,0.28)]'
                  : 'text-slate-400 hover:text-slate-600'
              )}
              style={period === key ? { background: 'linear-gradient(135deg, #2C82B5, #2570a0)' } : {}}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 4 Metric Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

        <MetricCard
          label="Conversas"
          value={filtered.conversations}
          accent={CARD_ACCENTS.brand}
          icon={<MessageSquare className="w-[17px] h-[17px] text-brand-500" />}
        />
        <MetricCard
          label="Agendamentos"
          value={filtered.appointments}
          accent={CARD_ACCENTS.violet}
          icon={<Calendar className="w-[17px] h-[17px] text-violet-500" />}
        />
        <MetricCard
          label="Realizadas"
          value={filtered.completed}
          accent={CARD_ACCENTS.emerald}
          icon={<CheckCircle className="w-[17px] h-[17px] text-emerald-500" />}
        />

        {/* Cancelamentos — dark card */}
        <div
          className="relative overflow-hidden rounded-2xl p-5 shadow-[0_2px_16px_rgba(0,0,0,0.14)] hover:shadow-[0_6px_24px_rgba(0,0,0,0.22)] transition-all duration-300 cursor-default"
          style={{ background: 'linear-gradient(145deg, #18181b 0%, #111113 100%)' }}
        >
          {/* Glow top-right */}
          <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full blur-2xl pointer-events-none" style={{ background: 'rgba(244,63,94,0.12)' }} />
          {/* Subtle grid texture */}
          <div
            className="absolute inset-0 opacity-[0.04] pointer-events-none"
            style={{
              backgroundImage: 'repeating-linear-gradient(0deg,rgba(255,255,255,.8) 0,rgba(255,255,255,.8) 1px,transparent 1px,transparent 20px),repeating-linear-gradient(90deg,rgba(255,255,255,.8) 0,rgba(255,255,255,.8) 1px,transparent 1px,transparent 20px)',
            }}
          />
          <div className="relative z-10 flex flex-col h-full">
            <div className="w-8 h-8 rounded-xl bg-white/[0.08] flex items-center justify-center mb-4 border border-white/10">
              <XCircle className="w-[17px] h-[17px] text-rose-400" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 mb-2">Cancelamentos</p>
            <p className="text-4xl font-black text-white leading-none">{filtered.cancelled}</p>
          </div>
        </div>
      </div>

      {/* ── Bottom Section ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Agendamentos Recentes — 2 cols wide */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] overflow-hidden">

          {/* Table header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50">
            <div className="flex items-center gap-2.5">
              <div className="w-1.5 h-4 rounded-full" style={{ background: 'linear-gradient(180deg, #2C82B5, #1e5f88)' }} />
              <h3 className="text-[13px] font-bold text-gray-900 tracking-tight">Agendamentos Recentes</h3>
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{periodLabel}</span>
          </div>

          {filtered.recentAppts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14">
              <div className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center mb-3 border border-slate-100">
                <Calendar className="w-5 h-5 text-slate-300" />
              </div>
              <p className="text-[13px] font-semibold text-slate-400">Nenhum agendamento {periodLabel}.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50/80">
              {filtered.recentAppts.map((appt, i) => (
                <div
                  key={appt.id}
                  className={cn(
                    'flex items-center justify-between px-6 py-3.5 transition-colors duration-150 hover:bg-slate-50/70 group',
                    i % 2 === 0 ? '' : 'bg-slate-50/30',
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Status dot */}
                    <div className={cn('w-2 h-2 rounded-full shrink-0 transition-transform duration-200 group-hover:scale-125', {
                      'bg-slate-300':   appt.status === 'scheduled',
                      'bg-emerald-400': appt.status === 'confirmed',
                      'bg-rose-400':    appt.status === 'cancelled',
                      'bg-brand-400':   appt.status === 'completed',
                    })} />
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-[13px] font-semibold text-gray-900 truncate">{appt.patient_name}</p>
                      <span className="text-slate-300 text-[11px] shrink-0 font-light">·</span>
                      <p className="text-[12px] text-slate-500 truncate">
                        {appt.specialty}{appt.doctor_name ? ` · ${appt.doctor_name}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    <p className="text-[12px] font-medium text-slate-400 hidden sm:block tabular-nums">
                      {formatDate(appt.scheduled_at)}
                    </p>
                    <Badge variant={statusColors[appt.status] ?? 'outline'} className="text-[10px] font-semibold">
                      {statusLabel(appt.status)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Meu Plano — dark card */}
        <div
          className="lg:col-span-1 relative overflow-hidden rounded-2xl p-6 flex flex-col justify-between shadow-[0_4px_24px_rgba(0,0,0,0.16)]"
          style={{ background: 'linear-gradient(160deg, #18181b 0%, #0f0f11 100%)' }}
        >
          {/* Background glow blobs */}
          <div className="absolute -bottom-16 -right-16 w-52 h-52 rounded-full blur-3xl pointer-events-none" style={{ background: 'rgba(44,130,181,0.18)' }} />
          <div className="absolute top-0 left-0 w-36 h-36 rounded-full blur-3xl pointer-events-none" style={{ background: 'rgba(30,95,136,0.25)' }} />

          {/* Subtle grid */}
          <div
            className="absolute inset-0 opacity-[0.03] pointer-events-none"
            style={{
              backgroundImage: 'repeating-linear-gradient(0deg,rgba(255,255,255,1) 0,rgba(255,255,255,1) 1px,transparent 1px,transparent 24px),repeating-linear-gradient(90deg,rgba(255,255,255,1) 0,rgba(255,255,255,1) 1px,transparent 1px,transparent 24px)',
            }}
          />

          <div className="relative z-10">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 mb-4">Plano Atual</p>
            <h3 className="text-[2.5rem] font-black text-white leading-none mb-2">{planName}</h3>
            <p className="text-[13px] font-medium" style={{ color: 'rgba(148,163,184,0.7)' }}>
              <span className="text-slate-300 font-bold">{org?.conversations_used ?? 0}</span>
              <span className="mx-1 text-slate-600">/</span>
              {org?.max_conversations_month ?? 0} conversas
            </p>
          </div>

          {/* Segmented progress bar — the signature detail */}
          <div className="relative z-10 mt-8">
            <SegmentedProgress pct={usagePct} />
            <div className="flex items-center justify-between mt-3">
              <p className="text-[11px] font-semibold text-slate-600">Uso do período</p>
              <p
                className="text-[12px] font-bold tabular-nums"
                style={{ color: usagePct > 80 ? '#f87171' : '#4d9aca' }}
              >
                {usagePct.toFixed(0)}%
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

// ── Metric Card ──────────────────────────────────────────────────

interface MetricCardProps {
  label: string
  value: number
  icon: ReactNode
  accent: { border: string; iconBg: string; iconColor: string }
}

function MetricCard({ label, value, icon, accent }: MetricCardProps) {
  return (
    <div
      className="bg-white rounded-2xl p-5 border border-slate-100 border-l-[3px] shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.07)] hover:-translate-y-[1px] transition-all duration-250 cursor-default"
      style={{ borderLeftColor: accent.border }}
    >
      <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center mb-5', accent.iconBg)}>
        {icon}
      </div>
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-2">{label}</p>
      <p className="text-4xl font-black text-gray-900 leading-none tabular-nums">{value}</p>
    </div>
  )
}

// ── Segmented Progress ───────────────────────────────────────────

function SegmentedProgress({ pct }: { pct: number }) {
  const total = 20
  const filled = Math.round((pct / 100) * total)
  const isHigh = pct > 80

  return (
    <div className="flex gap-[3px]">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="flex-1 h-1.5 rounded-full transition-all duration-500"
          style={{
            transitionDelay: `${i * 20}ms`,
            background: i < filled
              ? isHigh
                ? `rgba(248,113,113,${0.6 + (i / total) * 0.4})`
                : `rgba(44,130,181,${0.45 + (i / total) * 0.55})`
              : 'rgba(255,255,255,0.08)',
          }}
        />
      ))}
    </div>
  )
}
