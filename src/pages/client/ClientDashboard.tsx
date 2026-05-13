import { type ReactNode, useEffect, useState, useMemo } from 'react'
import { CalendarDays, BadgeCheck, CircleX, TrendingUp, ArrowRight, Zap, ExternalLink, AlertTriangle, Inbox, Calendar } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { type Appointment, type Conversation, type Organization } from '../../types'
import { statusLabel } from '../../lib/utils'
import { toBRT } from '../../lib/date'

function formatApptDate(iso: string): string {
  const d = toBRT(new Date(iso))
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const h = d.getHours()
  const m = d.getMinutes()
  return m === 0 ? `${day}/${month} · ${h}h` : `${day}/${month} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
import { Badge } from '../../components/ui/badge'
import { cn } from '../../lib/utils'

type Period = 'day' | 'week' | 'month'

const PERIODS: { key: Period; label: string }[] = [
  { key: 'day',   label: 'Hoje'   },
  { key: 'week',  label: 'Semana' },
  { key: 'month', label: 'Mês'    },
]

const statusColors: Record<string, 'success' | 'secondary' | 'warning' | 'destructive' | 'outline'> = {
  scheduled: 'secondary', confirmed: 'success', cancelled: 'destructive', completed: 'outline',
}


function getPeriodStart(period: Period): Date {
  const brt = toBRT(new Date())
  if (period === 'day') return new Date(brt.getFullYear(), brt.getMonth(), brt.getDate())
  if (period === 'week') {
    const d = new Date(brt); d.setDate(brt.getDate() - 6); d.setHours(0, 0, 0, 0); return d
  }
  return new Date(brt.getFullYear(), brt.getMonth(), 1)
}

const CARD_ACCENTS = {
  brand:   { border: '#2C82B5', iconBg: 'rgba(44,130,181,0.15)',  iconColor: '#2C82B5'  },
  violet:  { border: '#7c3aed', iconBg: 'rgba(124,58,237,0.15)',  iconColor: '#7c3aed'  },
  emerald: { border: '#059669', iconBg: 'rgba(5,150,105,0.15)',   iconColor: '#059669'  },
  rose:    { border: '#e11d48', iconBg: 'rgba(225,29,72,0.12)',   iconColor: '#e11d48'  },
}

export default function ClientDashboard() {
  const { orgId } = useAuth()
  const [org, setOrg] = useState<Organization | null>(null)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [period, setPeriod] = useState<Period>('month')
  const [loading, setLoading] = useState(true)
  const [chartReady, setChartReady] = useState(false)

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
      recentAppts:   appts.slice(0, 5),
    }
  }, [appointments, conversations, period])

  // Weekly chart data (Mon→Sun current week) — all comparisons in BRT
  const weeklyData = useMemo(() => {
    const brt = toBRT(new Date()); brt.setHours(0, 0, 0, 0)
    const monday = new Date(brt)
    monday.setDate(brt.getDate() - ((brt.getDay() + 6) % 7))
    const LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(monday); day.setDate(monday.getDate() + i)
      const next = new Date(day); next.setDate(day.getDate() + 1)
      const count = appointments.filter(a => {
        const d = toBRT(new Date(a.scheduled_at)); return d >= day && d < next
      }).length
      return { label: LABELS[i], count, isToday: day.getTime() === brt.getTime(), isPast: day < brt, isFuture: day > brt }
    })
  }, [appointments])

  useEffect(() => {
    if (!loading) { const t = setTimeout(() => setChartReady(true), 120); return () => clearTimeout(t) }
  }, [loading])

  const firstName = org?.name?.split(' ')[0] ?? '—'
  const periodLabel = period === 'day' ? 'hoje' : period === 'week' ? 'esta semana' : 'este mês'

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-5 h-5 border-[2.5px] border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-5 w-full">

      {/* ── Greeting + period ───────────────────────────────────── */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[1.75rem] font-semibold text-gray-900 leading-none">
            Olá, {firstName}
          </h1>
        </div>

        {/* Period switcher */}
        <div className="flex items-center bg-white border border-slate-200 rounded-2xl p-1 shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
          {PERIODS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={cn(
                'px-4 py-1.5 rounded-xl text-[13px] font-semibold transition-all duration-200',
                period === key ? 'text-white shadow-[0_2px_8px_rgba(37,112,160,0.28)]' : 'text-slate-400 hover:text-slate-600',
              )}
              style={period === key ? { background: 'linear-gradient(135deg, #2C82B5, #2570a0)' } : {}}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 4 Metric Cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Conversas"     value={filtered.conversations} accent={CARD_ACCENTS.brand}
          icon={<Inbox className="w-5 h-5" style={{ color: CARD_ACCENTS.brand.iconColor }} />} />
        <MetricCard label="Agendamentos"  value={filtered.appointments}  accent={CARD_ACCENTS.violet}
          icon={<CalendarDays className="w-5 h-5" style={{ color: CARD_ACCENTS.violet.iconColor }} />} />
        <MetricCard label="Realizadas"    value={filtered.completed}     accent={CARD_ACCENTS.emerald}
          icon={<BadgeCheck className="w-5 h-5" style={{ color: CARD_ACCENTS.emerald.iconColor }} />} />
        <MetricCard label="Cancelamentos" value={filtered.cancelled}     accent={CARD_ACCENTS.rose}
          icon={<CircleX className="w-5 h-5" style={{ color: CARD_ACCENTS.rose.iconColor }} />} />
      </div>

      {/* ── Weekly Chart ─────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] overflow-hidden">
        <style>{`
          @keyframes floatIn {
            from { opacity: 0; transform: translateY(5px) translateX(-50%); }
            to   { opacity: 1; transform: translateY(0)   translateX(-50%); }
          }
        `}</style>

        <div className="px-6 pt-5 pb-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ background: 'rgba(44,130,181,0.1)' }}>
                <TrendingUp className="w-3.5 h-3.5" style={{ color: '#2C82B5' }} />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 leading-none mb-0.5">Esta semana</p>
                <p className="text-sm font-bold text-gray-900 leading-none">Agendamentos por dia</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-3xl font-black text-gray-900 leading-none tabular-nums">
                <AnimatedNumber value={weeklyData.reduce((s, d) => s + d.count, 0)} ready={chartReady} delay={650} />
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 mt-1">agendamentos</p>
            </div>
          </div>

          {/* Chart bars */}
          <div className="relative" style={{ height: '140px' }}>
            {[0.75, 0.5, 0.25].map(pct => (
              <div key={pct} className="absolute left-0 right-0 pointer-events-none"
                style={{ bottom: `${pct * 140}px`, borderTop: '1px dashed #f1f5f9' }} />
            ))}
            <div className="absolute inset-0 flex items-end gap-2.5">
              {weeklyData.map((day, i) => {
                const maxCount = Math.max(...weeklyData.map(d => d.count), 1)
                return <ChartBar key={i} label={day.label} count={day.count} isToday={day.isToday}
                  isPast={day.isPast} isFuture={day.isFuture} index={i} maxCount={maxCount} ready={chartReady} />
              })}
            </div>
          </div>

          {/* Baseline + labels */}
          <div className="mt-3 h-px bg-slate-100" />
          <div className="flex gap-2.5 mt-2.5">
            {weeklyData.map((day, i) => (
              <div key={i} className="flex-1 text-center">
                <span
                  className={cn('text-[10px] font-bold uppercase tracking-[0.1em] transition-opacity duration-300', day.isToday ? 'text-brand-600' : 'text-slate-400')}
                  style={{ opacity: chartReady ? 1 : 0, transitionDelay: `${i * 55 + 300}ms` }}
                >
                  {day.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Bottom row: Appointments + Agent card ───────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">

        {/* Appointments list — 3 cols */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50">
            <div className="flex items-center gap-2.5">
              <div className="w-1.5 h-4 rounded-full" style={{ background: 'linear-gradient(180deg, #2C82B5, #1e5f88)' }} />
              <h3 className="text-[13px] font-bold text-gray-900">Próximos Agendamentos</h3>
            </div>
            <div className="flex items-center gap-3">
              <a href="/dashboard/appointments"
                className="flex items-center gap-1 text-[11px] font-bold text-brand-500 hover:text-brand-600 transition-colors">
                Ver todos <ArrowRight className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr] px-6 py-2.5 border-b border-slate-50 gap-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Paciente</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Profissional</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Data</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 text-right">Status</p>
          </div>

          {filtered.recentAppts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center mb-3 border border-slate-100">
                <Calendar className="w-5 h-5 text-slate-300" />
              </div>
              <p className="text-[13px] font-semibold text-slate-400">Nenhum agendamento {periodLabel}.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50/80">
              {filtered.recentAppts.map((appt, i) => (
                <div key={appt.id}
                  className={cn(
                    'grid grid-cols-[2fr_1.5fr_1fr_1fr] items-center px-6 py-3.5 gap-4 transition-colors hover:bg-slate-50/70 group',
                    i % 2 !== 0 ? 'bg-slate-50/30' : '',
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={cn('w-1.5 h-1.5 rounded-full shrink-0 transition-transform group-hover:scale-125', {
                      'bg-slate-300':   appt.status === 'scheduled',
                      'bg-emerald-400': appt.status === 'confirmed',
                      'bg-rose-400':    appt.status === 'cancelled',
                      'bg-brand-400':   appt.status === 'completed',
                    })} />
                    <p className="text-[13px] font-semibold text-gray-900 truncate leading-none">
                      {appt.patient_name}
                      {appt.specialty && (
                        <span className="font-normal text-slate-400"> ({appt.specialty.charAt(0).toUpperCase() + appt.specialty.slice(1).toLowerCase()})</span>
                      )}
                    </p>
                  </div>
                  <p className="text-[12px] text-slate-500 truncate">{appt.doctor_name ?? '—'}</p>
                  <p className="text-[12px] font-medium text-slate-500 tabular-nums">{formatApptDate(appt.scheduled_at)}</p>
                  <div className="flex justify-end">
                    <Badge variant={statusColors[appt.status] ?? 'outline'} className="text-[10px] font-semibold">
                      {statusLabel(appt.status)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Agent card — 2 cols */}
        <AgentCard org={org} conversations={conversations} />

      </div>

    </div>
  )
}

// ── Agent Card ───────────────────────────────────────────────────

function AgentCard({ org, conversations }: { org: Organization | null; conversations: Conversation[] }) {
  const used   = org?.conversations_used ?? 0
  const limit  = org?.max_conversations_month ?? 1
  const pct    = Math.min((used / limit) * 100, 100)
  const remaining = Math.max(limit - used, 0)

  const barGradient = pct > 85
    ? 'linear-gradient(90deg, #f43f5e, #fb7185)'
    : pct > 65
    ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
    : 'linear-gradient(90deg, #2C82B5, #5bafd4)'

  // Escalated this month
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const escalated = conversations.filter(c => c.escalated_to_human && new Date(c.started_at) >= monthStart).length

  const [progressWidth, setProgressWidth] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setProgressWidth(pct), 300)
    return () => clearTimeout(t)
  }, [pct])

  return (
    <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] overflow-hidden flex flex-col">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50">
        <div className="flex items-center gap-2.5">
          <div className="w-1.5 h-4 rounded-full" style={{ background: 'linear-gradient(180deg, #2C82B5, #1e5f88)' }} />
          <h3 className="text-[13px] font-bold text-gray-900">Agente Bento</h3>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.18)' }}>
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] font-bold text-emerald-600">Online</span>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-4 flex flex-col gap-4">

        {/* Conversations usage */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Conversas este mês</span>
            <span className="text-[12px] font-black text-gray-900 tabular-nums">{used} / {limit}</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.05)' }}>
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{ width: `${progressWidth}%`, background: barGradient }}
            />
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[10px] text-slate-400">{remaining} restantes</span>
            {pct > 85 && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-rose-500">
                <AlertTriangle className="w-3 h-3" /> Limite próximo
              </span>
            )}
            {pct > 65 && pct <= 85 && (
              <span className="text-[10px] font-semibold text-amber-500">{Math.round(pct)}% usado</span>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-xl px-3.5 py-3 flex items-center gap-2.5" style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}>
            <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400 leading-none">Resposta</p>
              <p className="text-[12px] font-black text-gray-900 mt-0.5 leading-none">Instantânea</p>
            </div>
          </div>
          <div className="rounded-xl px-3.5 py-3 flex items-center gap-2.5" style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}>
            <Inbox className="w-3.5 h-3.5 text-brand-400 shrink-0" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400 leading-none">Escaladas</p>
              <p className="text-[12px] font-black text-gray-900 mt-0.5 leading-none tabular-nums">{escalated} conversas</p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={() => org?.chatwoot_url && window.open(org.chatwoot_url, '_blank')}
          disabled={!org?.chatwoot_url}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-bold text-white transition-all duration-200 hover:shadow-[0_6px_20px_rgba(44,130,181,0.38)] hover:-translate-y-[1px] active:translate-y-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:translate-y-0"
          style={{ background: 'linear-gradient(135deg, #2C82B5, #2570a0)' }}
        >
          <ExternalLink className="w-4 h-4" />
          Ver Agente em Ação
        </button>

      </div>
    </div>
  )
}

// ── Metric Card ──────────────────────────────────────────────────

interface MetricCardProps {
  label: string; value: number; icon: ReactNode
  accent: { border: string; iconBg: string; iconColor: string }
}

function MetricCard({ label, value, icon, accent }: MetricCardProps) {
  return (
    <div
      className="relative bg-white rounded-2xl px-5 pt-4 pb-5 cursor-default transition-all duration-200 hover:-translate-y-[2px] hover:shadow-[0_6px_20px_rgba(0,0,0,0.08)]"
      style={{ border: '1px solid #eef0f3', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
    >
      {/* Colored top bar */}
      <div className="absolute top-0 left-5 right-5 h-[3px] rounded-b-full"
        style={{ background: accent.border }} />

      {/* Icon + label row */}
      <div className="flex items-center gap-2 mt-2 mb-4">
        <div style={{ color: accent.border }}>{icon}</div>
        <p className="text-[11px] font-semibold text-slate-400 tracking-wide">{label}</p>
      </div>

      {/* Number */}
      <p className="text-[2.4rem] font-black leading-none tabular-nums text-gray-900">{value}</p>
    </div>
  )
}

// ── Animated Number ───────────────────────────────────────────────

function AnimatedNumber({ value, ready, delay = 0 }: { value: number; ready: boolean; delay?: number }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    if (!ready || value === 0) { setDisplay(value); return }
    setDisplay(0)
    let startTs: number | null = null; let raf: number
    const timer = setTimeout(() => {
      const animate = (ts: number) => {
        if (startTs === null) startTs = ts
        const p = Math.min((ts - startTs) / 900, 1)
        setDisplay(Math.round((1 - Math.pow(1 - p, 3)) * value))
        if (p < 1) raf = requestAnimationFrame(animate)
      }
      raf = requestAnimationFrame(animate)
    }, delay)
    return () => { clearTimeout(timer); cancelAnimationFrame(raf) }
  }, [value, ready, delay])
  return <>{display}</>
}

// ── Chart Bar ────────────────────────────────────────────────────

function ChartBar({
  count, isToday, isPast, isFuture, index, maxCount, ready,
}: {
  count: number; isToday: boolean; isPast: boolean; isFuture: boolean
  index: number; maxCount: number; ready: boolean; label: string
}) {
  const [displayCount, setDisplayCount] = useState(0)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    if (!ready || count === 0) { setDisplayCount(count); return }
    setDisplayCount(0)
    let startTs: number | null = null; let raf: number
    const timer = setTimeout(() => {
      const animate = (ts: number) => {
        if (startTs === null) startTs = ts
        const p = Math.min((ts - startTs) / 700, 1)
        setDisplayCount(Math.round((1 - Math.pow(1 - p, 3)) * count))
        if (p < 1) raf = requestAnimationFrame(animate)
      }
      raf = requestAnimationFrame(animate)
    }, index * 55 + 180)
    return () => { clearTimeout(timer); cancelAnimationFrame(raf) }
  }, [ready, count, index])

  const CHART_H = 140
  const heightPx = count > 0 ? Math.max((count / maxCount) * CHART_H * 0.88, 16) : (isToday || isPast) ? 3 : 0

  const barBg = isToday
    ? 'linear-gradient(180deg, #5bafd4 0%, #2C82B5 100%)'
    : isPast && count > 0 ? 'linear-gradient(180deg, #93c5e8 0%, #6aadd9 100%)'
    : isPast  ? '#f1f5f9'
    : isFuture && count > 0 ? 'linear-gradient(180deg, #bfdbee 0%, #a8cfe6 100%)'
    : '#f8fafc'

  return (
    <div className="flex-1 relative flex flex-col justify-end" style={{ height: `${CHART_H}px` }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>

      {/* Tooltip */}
      {hovered && count > 0 && (
        <div className="absolute left-1/2 z-30 pointer-events-none"
          style={{ bottom: `${heightPx + 10}px`, animation: 'floatIn 0.18s ease-out both' }}>
          <div className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap"
            style={{ background: '#fff', color: '#1e3a5f', transform: 'translateX(-50%)', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', border: '1px solid #e2eaf3' }}>
            {displayCount} {displayCount === 1 ? 'consulta' : 'consultas'}
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0"
            style={{ borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid #fff' }} />
        </div>
      )}

      {/* Count */}
      <div className="text-center mb-1.5 transition-all duration-200"
        style={{ opacity: ready && count > 0 ? 1 : 0, transitionDelay: `${index * 55 + 450}ms`, transform: hovered ? 'scale(1.2)' : 'scale(1)' }}>
        <span className="text-[11px] font-bold tabular-nums" style={{ color: isToday ? '#2C82B5' : '#94a3b8' }}>
          {displayCount}
        </span>
      </div>

      {/* Bar */}
      <div className="w-full relative overflow-hidden"
        style={{
          height: ready ? `${heightPx}px` : '0px',
          background: barBg,
          borderRadius: count === 0 ? '3px' : '8px 8px 3px 3px',
          transition: `height 0.65s cubic-bezier(0.34,1.56,0.64,1) ${index * 55}ms, filter 0.15s ease, transform 0.15s ease`,
          filter: hovered && count > 0 ? 'brightness(0.92) saturate(1.1)' : 'brightness(1)',
          transform: hovered && count > 0 ? 'scaleX(1.06)' : 'scaleX(1)',
          transformOrigin: 'bottom center',
        }}
      />
    </div>
  )
}
