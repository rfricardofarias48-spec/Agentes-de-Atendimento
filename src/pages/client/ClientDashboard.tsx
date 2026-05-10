import { type ReactNode, useEffect, useState, useMemo } from 'react'
import { MessageSquare, Calendar, CheckCircle, XCircle, TrendingUp, ArrowRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { type Appointment, type Conversation, type Organization } from '../../types'
import { formatDate, statusLabel } from '../../lib/utils'
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
  const now = new Date()
  if (period === 'day') return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (period === 'week') {
    const d = new Date(now); d.setDate(d.getDate() - 6); d.setHours(0, 0, 0, 0); return d
  }
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

const CARD_ACCENTS = {
  brand:   { border: '#2C82B5', iconBg: 'rgba(44,130,181,0.10)',  iconColor: '#2C82B5'  },
  violet:  { border: '#7c3aed', iconBg: 'rgba(124,58,237,0.10)',  iconColor: '#7c3aed'  },
  emerald: { border: '#10b981', iconBg: 'rgba(16,185,129,0.10)',  iconColor: '#10b981'  },
  rose:    { border: '#f43f5e', iconBg: 'rgba(244,63,94,0.10)',   iconColor: '#f43f5e'  },
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

  // Weekly chart data (Mon→Sun current week)
  const weeklyData = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const monday = new Date(today)
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
    const LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(monday); day.setDate(monday.getDate() + i)
      const next = new Date(day); next.setDate(day.getDate() + 1)
      const count = appointments.filter(a => {
        const d = new Date(a.scheduled_at); return d >= day && d < next
      }).length
      return { label: LABELS[i], count, isToday: day.getTime() === today.getTime(), isPast: day < today, isFuture: day > today }
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
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400 mb-1">
            Bem-vindo de volta
          </p>
          <h1 className="text-[1.75rem] font-black text-gray-900 leading-none">
            Olá, {firstName}
          </h1>
          <p className="text-[13px] text-slate-400 mt-1.5">Veja suas atividades no painel</p>
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
          icon={<MessageSquare className="w-4 h-4" style={{ color: CARD_ACCENTS.brand.iconColor }} />} />
        <MetricCard label="Agendamentos"  value={filtered.appointments}  accent={CARD_ACCENTS.violet}
          icon={<Calendar className="w-4 h-4" style={{ color: CARD_ACCENTS.violet.iconColor }} />} />
        <MetricCard label="Realizadas"    value={filtered.completed}     accent={CARD_ACCENTS.emerald}
          icon={<CheckCircle className="w-4 h-4" style={{ color: CARD_ACCENTS.emerald.iconColor }} />} />
        <MetricCard label="Cancelamentos" value={filtered.cancelled}     accent={CARD_ACCENTS.rose}
          icon={<XCircle className="w-4 h-4" style={{ color: CARD_ACCENTS.rose.iconColor }} />} />
      </div>

      {/* ── Weekly Chart ─────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden rounded-2xl shadow-[0_4px_32px_rgba(0,0,0,0.22)] border border-white/[0.05]"
        style={{ background: 'linear-gradient(160deg, #18181b 0%, #0f0f11 100%)' }}
      >
        <style>{`
          @keyframes todayGlow {
            0%,100% { box-shadow: 0 0 18px rgba(44,130,181,0.50), 0 0 40px rgba(44,130,181,0.20); }
            50%      { box-shadow: 0 0 32px rgba(44,130,181,0.80), 0 0 64px rgba(44,130,181,0.35); }
          }
          @keyframes shimmerPass {
            0%   { left: -18%; opacity: 0; }
            8%   { opacity: 1; }
            92%  { opacity: 1; }
            100% { left: 112%; opacity: 0; }
          }
          @keyframes floatIn {
            from { opacity: 0; transform: translateY(6px) translateX(-50%); }
            to   { opacity: 1; transform: translateY(0)  translateX(-50%); }
          }
        `}</style>

        {/* Grid texture */}
        <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.025, backgroundImage: 'repeating-linear-gradient(0deg,#fff 0,#fff 1px,transparent 1px,transparent 28px),repeating-linear-gradient(90deg,#fff 0,#fff 1px,transparent 1px,transparent 28px)' }} />
        {/* Ambient glow */}
        <div className="absolute bottom-0 left-0 right-0 h-48 pointer-events-none" style={{ background: 'radial-gradient(ellipse 90% 100% at 50% 100%, rgba(44,130,181,0.14), transparent)' }} />
        {/* Shimmer */}
        {chartReady && (
          <div className="absolute top-0 bottom-0 w-20 pointer-events-none z-20"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.055), transparent)', animation: 'shimmerPass 1.1s ease-in-out 0.85s both' }} />
        )}

        <div className="relative z-10 px-6 pt-6 pb-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-7">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-xl bg-white/[0.07] border border-white/[0.08] flex items-center justify-center">
                <TrendingUp className="w-3.5 h-3.5 text-brand-400" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 leading-none mb-0.5">Esta semana</p>
                <p className="text-sm font-bold text-slate-200 leading-none">Agendamentos por dia</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-3xl font-black text-white leading-none tabular-nums">
                <AnimatedNumber value={weeklyData.reduce((s, d) => s + d.count, 0)} ready={chartReady} delay={650} />
              </p>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600 mt-1">agendamentos</p>
            </div>
          </div>

          {/* Chart bars */}
          <div className="relative" style={{ height: '148px' }}>
            {[0.75, 0.5, 0.25].map(pct => (
              <div key={pct} className="absolute left-0 right-0 pointer-events-none"
                style={{ bottom: `${pct * 148}px`, borderTop: '1px dashed rgba(255,255,255,0.05)' }} />
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
          <div className="mt-4 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
          <div className="flex gap-2.5 mt-3">
            {weeklyData.map((day, i) => (
              <div key={i} className="flex-1 text-center">
                <span className={cn('text-[10px] font-bold uppercase tracking-[0.1em] transition-opacity duration-300', day.isToday ? 'text-brand-400' : 'text-slate-600')}
                  style={{ opacity: chartReady ? 1 : 0, transitionDelay: `${i * 55 + 300}ms` }}>
                  {day.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Appointments list ────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-1.5 h-4 rounded-full" style={{ background: 'linear-gradient(180deg, #2C82B5, #1e5f88)' }} />
            <h3 className="text-[13px] font-bold text-gray-900">Agendamentos Recentes</h3>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{periodLabel}</span>
            <a href="/dashboard/appointments"
              className="flex items-center gap-1 text-[11px] font-bold text-brand-500 hover:text-brand-600 transition-colors">
              Ver todos <ArrowRight className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_1fr_auto_auto] px-6 py-2.5 border-b border-slate-50">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Paciente · Especialidade</p>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 hidden sm:block">Médico</p>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 text-right">Data</p>
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
                  'grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_1fr_auto_auto] items-center px-6 py-3.5 gap-4 transition-colors hover:bg-slate-50/70 group',
                  i % 2 !== 0 ? 'bg-slate-50/30' : '',
                )}
              >
                {/* Patient + specialty */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={cn('w-1.5 h-1.5 rounded-full shrink-0 transition-transform group-hover:scale-125', {
                    'bg-slate-300':   appt.status === 'scheduled',
                    'bg-emerald-400': appt.status === 'confirmed',
                    'bg-rose-400':    appt.status === 'cancelled',
                    'bg-brand-400':   appt.status === 'completed',
                  })} />
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-gray-900 truncate leading-none">{appt.patient_name}</p>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">{appt.specialty}</p>
                  </div>
                </div>
                {/* Doctor */}
                <p className="text-[12px] text-slate-400 truncate hidden sm:block">{appt.doctor_name ?? '—'}</p>
                {/* Date */}
                <p className="text-[12px] font-medium text-slate-500 tabular-nums text-right">{formatDate(appt.scheduled_at)}</p>
                {/* Badge */}
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
      className="bg-white rounded-2xl p-5 border border-slate-100 border-l-[3px] shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.07)] hover:-translate-y-[1px] transition-all duration-200 cursor-default"
      style={{ borderLeftColor: accent.border }}
    >
      <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-4" style={{ background: accent.iconBg }}>
        {icon}
      </div>
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-1.5">{label}</p>
      <p className="text-3xl font-black text-gray-900 leading-none tabular-nums">{value}</p>
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

  const CHART_H = 148
  const heightPx = count > 0 ? Math.max((count / maxCount) * CHART_H * 0.88, 18) : (isToday || isPast) ? 3 : 0

  const barBg = isToday
    ? 'linear-gradient(180deg, #93d5f0 0%, #5fb3d8 25%, #2C82B5 65%, #1a4f7a 100%)'
    : isPast && count > 0 ? 'linear-gradient(180deg, rgba(93,172,215,0.55) 0%, rgba(44,130,181,0.32) 100%)'
    : isPast  ? 'rgba(255,255,255,0.07)'
    : isFuture && count > 0 ? 'linear-gradient(180deg, rgba(93,172,215,0.25) 0%, rgba(44,130,181,0.14) 100%)'
    : 'rgba(255,255,255,0.03)'

  return (
    <div className="flex-1 relative flex flex-col justify-end" style={{ height: `${CHART_H}px` }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>

      {/* Tooltip */}
      {hovered && count > 0 && (
        <div className="absolute left-1/2 z-30 pointer-events-none"
          style={{ bottom: `${heightPx + 10}px`, animation: 'floatIn 0.18s ease-out both' }}>
          <div className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-white whitespace-nowrap border border-white/15"
            style={{ background: 'rgba(20,20,25,0.92)', backdropFilter: 'blur(8px)', transform: 'translateX(-50%)', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}>
            {displayCount} {displayCount === 1 ? 'consulta' : 'consultas'}
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0"
            style={{ borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid rgba(20,20,25,0.92)' }} />
        </div>
      )}

      {/* Count */}
      <div className="text-center mb-1.5 transition-all duration-200"
        style={{ opacity: ready && count > 0 ? 1 : 0, transitionDelay: `${index * 55 + 450}ms`, transform: hovered ? 'scale(1.2)' : 'scale(1)' }}>
        <span className="text-[11px] font-bold tabular-nums" style={{ color: isToday ? '#7ec8e3' : 'rgba(148,163,184,0.65)' }}>
          {displayCount}
        </span>
      </div>

      {/* Bar */}
      <div className="w-full relative overflow-hidden"
        style={{
          height: ready ? `${heightPx}px` : '0px',
          background: barBg,
          borderRadius: count === 0 ? '2px' : '10px 10px 3px 3px',
          transition: `height 0.68s cubic-bezier(0.34,1.56,0.64,1) ${index * 55}ms, filter 0.15s ease, transform 0.15s ease`,
          animation: isToday && ready ? 'todayGlow 2.8s ease-in-out infinite' : 'none',
          filter: hovered && count > 0 ? 'brightness(1.35) saturate(1.2)' : 'brightness(1)',
          transform: hovered && count > 0 ? 'scaleX(1.07)' : 'scaleX(1)',
          transformOrigin: 'bottom center',
        }}>
        {isToday && count > 0 && (
          <div className="absolute top-0 bottom-0 pointer-events-none"
            style={{ left: '18%', width: '20%', background: 'linear-gradient(180deg, rgba(255,255,255,0.38), rgba(255,255,255,0.04))', borderRadius: '0 0 4px 4px' }} />
        )}
        {count > 0 && (
          <div className="absolute top-0 left-[10%] right-[10%] h-px rounded-full"
            style={{ background: isToday ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.18)' }} />
        )}
      </div>
    </div>
  )
}
