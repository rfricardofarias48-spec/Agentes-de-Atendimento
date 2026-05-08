import { useEffect, useState, useMemo } from 'react'
import { MessageSquare, Calendar, CheckCircle, XCircle, Bot, ExternalLink, TrendingUp } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { type Appointment, type Conversation, type Organization } from '../../types'
import { formatDate, statusLabel } from '../../lib/utils'
import { Badge } from '../../components/ui/badge'
import { cn } from '../../lib/utils'

type Period = 'day' | 'week' | 'month'

const PERIODS: { key: Period; label: string }[] = [
  { key: 'day', label: 'Hoje' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mês' },
]

const statusColors: Record<string, 'success' | 'secondary' | 'warning' | 'destructive' | 'outline'> = {
  scheduled: 'secondary', confirmed: 'success', cancelled: 'destructive', completed: 'outline',
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

// ── SVG Area Chart ────────────────────────────────────────────────────────────
function ActivityChart({ bins, labels }: { bins: number[]; labels: string[] }) {
  const max = Math.max(...bins, 1)
  const W = 500, H = 120, PAD = 8

  const pts = bins.map((v, i) => ({
    x: bins.length < 2 ? W / 2 : PAD + (i / (bins.length - 1)) * (W - PAD * 2),
    y: PAD + (1 - v / max) * (H - PAD * 2),
  }))

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L${pts[pts.length - 1].x.toFixed(1)},${H} L${pts[0].x.toFixed(1)},${H} Z`

  // Show only ~6 labels evenly spaced
  const stride = Math.max(1, Math.ceil(labels.length / 6))
  const visibleLabels = labels.map((l, i) => ({ l, i, show: i % stride === 0 || i === labels.length - 1 }))

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-28" preserveAspectRatio="none">
        <defs>
          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#chartFill)" />
        <path d={linePath} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill="white" stroke="#10b981" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="flex justify-between mt-1 px-1">
        {visibleLabels.filter(v => v.show).map(({ l, i }) => (
          <span key={i} className="text-[10px] text-gray-400">{l}</span>
        ))}
      </div>
    </div>
  )
}

// ── SVG Donut Chart ───────────────────────────────────────────────────────────
function DonutChart({ slices }: { slices: { value: number; color: string }[] }) {
  const total = slices.reduce((s, d) => s + d.value, 0) || 1
  const R = 38, CX = 50, CY = 50, C = 2 * Math.PI * R
  let offset = 0
  return (
    <svg viewBox="0 0 100 100" className="w-28 h-28 -rotate-90">
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="#f3f4f6" strokeWidth="14" />
      {slices.map(({ value, color }, i) => {
        const dash = (value / total) * C
        const el = (
          <circle key={i} cx={CX} cy={CY} r={R} fill="none"
            stroke={color} strokeWidth="14"
            strokeDasharray={`${dash} ${C - dash}`}
            strokeDashoffset={-offset}
            strokeLinecap="butt"
          />
        )
        offset += dash
        return el
      })}
    </svg>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
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
    const convs = conversations.filter(c => new Date(c.started_at) >= start)
    return {
      conversations: convs.length,
      appointments: appts.length,
      completed: appts.filter(a => a.status === 'completed').length,
      cancelled: appts.filter(a => a.status === 'cancelled').length,
      scheduled: appts.filter(a => a.status === 'scheduled' || a.status === 'confirmed').length,
      recentAppts: appts.slice(0, 6),
      convsList: convs,
    }
  }, [appointments, conversations, period])

  // Build daily bins for the activity chart
  const chartData = useMemo(() => {
    const start = getPeriodStart(period)
    const days = period === 'day' ? 1 : period === 'week' ? 7 : 30
    const bins: number[] = []
    const labels: string[] = []
    for (let i = 0; i < days; i++) {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      const next = new Date(d)
      next.setDate(next.getDate() + 1)
      bins.push(filtered.convsList.filter(c => {
        const t = new Date(c.started_at)
        return t >= d && t < next
      }).length)
      labels.push(String(d.getDate()))
    }
    return { bins, labels }
  }, [filtered.convsList, period])

  const usagePct = org ? Math.min(100, (org.conversations_used / org.max_conversations_month) * 100) : 0
  const periodLabel = period === 'day' ? 'hoje' : period === 'week' ? 'últimos 7 dias' : 'este mês'

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-6 h-6 border-[3px] border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-5">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Olá, {org?.name ?? '—'}</h1>
          <p className="text-sm text-gray-400 mt-0.5">Veja o que está acontecendo na sua clínica</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Period toggle */}
          <div className="flex items-center bg-white border border-gray-200 rounded-lg p-0.5 shadow-sm">
            {PERIODS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPeriod(key)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-150',
                  period === key
                    ? 'bg-gray-900 text-white shadow-sm'
                    : 'text-gray-400 hover:text-gray-700'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {org?.chatwoot_url && (
            <a
              href={org.chatwoot_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 text-white text-xs font-bold shadow-sm hover:bg-emerald-600 transition-colors"
            >
              <Bot className="w-3.5 h-3.5" />
              Ver Agente em Ação
              <ExternalLink className="w-3 h-3 opacity-70" />
            </a>
          )}
        </div>
      </div>

      {/* ── Metric Cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {([
          { label: 'Conversas',          value: filtered.conversations, icon: MessageSquare, iconBg: 'bg-blue-50',    iconColor: 'text-blue-500',    badge: null },
          { label: 'Agendamentos',        value: filtered.appointments,  icon: Calendar,      iconBg: 'bg-violet-50', iconColor: 'text-violet-500',  badge: null },
          { label: 'Consultas Realizadas',value: filtered.completed,     icon: CheckCircle,   iconBg: 'bg-emerald-50',iconColor: 'text-emerald-500', badge: filtered.completed > 0 ? '+' + filtered.completed : null },
          { label: 'Cancelamentos',       value: filtered.cancelled,     icon: XCircle,       iconBg: 'bg-rose-50',   iconColor: 'text-rose-400',    badge: null },
        ] as const).map(({ label, value, icon: Icon, iconBg, iconColor, badge }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
            <div className="flex items-start justify-between mb-4">
              <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', iconBg)}>
                <Icon className={cn('w-4.5 h-4.5', iconColor)} style={{ width: 18, height: 18 }} />
              </div>
              {badge && (
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                  <TrendingUp style={{ width: 10, height: 10 }} />
                  {badge}
                </span>
              )}
            </div>
            <p className="text-3xl font-bold text-gray-900 tabular-nums leading-none">{value}</p>
            <p className="text-xs text-gray-400 mt-1.5 leading-tight">{label}</p>
          </div>
        ))}
      </div>

      {/* ── Activity Chart + Status ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

        {/* Activity area chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-start justify-between mb-1">
            <div>
              <p className="text-sm font-semibold text-gray-700">Atividade de Conversas</p>
              <p className="text-3xl font-bold text-gray-900 mt-0.5 tabular-nums">{filtered.conversations}</p>
            </div>
            <span className="text-xs text-gray-400 bg-gray-50 px-2.5 py-1 rounded-lg">{periodLabel}</span>
          </div>
          <div className="mt-5">
            <ActivityChart bins={chartData.bins} labels={chartData.labels} />
          </div>
        </div>

        {/* Status breakdown */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm flex flex-col">
          <p className="text-sm font-semibold text-gray-700 mb-4">Status dos Agendamentos</p>

          <div className="flex flex-col items-center gap-5 flex-1 justify-center">
            <div className="relative">
              <DonutChart slices={[
                { value: filtered.completed, color: '#10b981' },
                { value: filtered.cancelled, color: '#fb7185' },
                { value: filtered.scheduled, color: '#818cf8' },
              ]} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold text-gray-900 tabular-nums">{filtered.appointments}</span>
                <span className="text-[9px] text-gray-400 font-medium uppercase tracking-wide">total</span>
              </div>
            </div>

            <div className="w-full space-y-2.5">
              {[
                { label: 'Realizadas', value: filtered.completed,  color: 'bg-emerald-500' },
                { label: 'Cancelados', value: filtered.cancelled,  color: 'bg-rose-400' },
                { label: 'Agendados',  value: filtered.scheduled,  color: 'bg-indigo-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={cn('w-2 h-2 rounded-full', color)} />
                    <span className="text-xs text-gray-500">{label}</span>
                  </div>
                  <span className="text-xs font-bold text-gray-800 tabular-nums">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Appointments Table + Plan ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

        {/* Table */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <p className="text-sm font-semibold text-gray-700">Agendamentos Recentes</p>
            <span className="text-xs text-gray-400">{periodLabel}</span>
          </div>

          {filtered.recentAppts.length === 0 ? (
            <div className="py-14 flex flex-col items-center gap-2 text-center">
              <Calendar className="w-7 h-7 text-gray-200" />
              <p className="text-sm text-gray-400">Nenhum agendamento {periodLabel}</p>
            </div>
          ) : (
            <>
              {/* Header row */}
              <div className="grid grid-cols-[1fr_120px_90px] gap-3 px-5 py-2.5 bg-gray-50/70 border-b border-gray-100">
                {['Paciente / Especialidade', 'Data', 'Status'].map(h => (
                  <span key={h} className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{h}</span>
                ))}
              </div>
              <div className="divide-y divide-gray-50">
                {filtered.recentAppts.map(appt => (
                  <div key={appt.id} className="grid grid-cols-[1fr_120px_90px] gap-3 items-center px-5 py-3 hover:bg-gray-50/60 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{appt.patient_name}</p>
                      <p className="text-xs text-gray-400 truncate mt-0.5">
                        {appt.specialty}{appt.doctor_name ? ` · ${appt.doctor_name}` : ''}
                      </p>
                    </div>
                    <p className="text-xs text-gray-500 whitespace-nowrap">{formatDate(appt.scheduled_at)}</p>
                    <Badge variant={statusColors[appt.status] ?? 'outline'} className="text-[10px] whitespace-nowrap w-fit">
                      {statusLabel(appt.status)}
                    </Badge>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Plan Progress */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm flex flex-col gap-5">
          <div>
            <p className="text-sm font-semibold text-gray-700">Plano de Conversas</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {org?.conversations_used ?? 0} de {org?.max_conversations_month ?? 0} utilizadas
            </p>
          </div>

          {/* Usage arc feel — thick bar */}
          <div>
            <div className="flex justify-between text-xs mb-2">
              <span className="text-gray-400">Uso do plano</span>
              <span className={cn(
                'font-bold',
                usagePct > 80 ? 'text-rose-500' : usagePct > 60 ? 'text-amber-500' : 'text-emerald-600'
              )}>
                {usagePct.toFixed(0)}%
              </span>
            </div>
            <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${usagePct}%`,
                  background: usagePct > 80 ? '#f43f5e' : usagePct > 60 ? '#f59e0b' : '#10b981',
                }}
              />
            </div>
          </div>

          <div className="space-y-3 pt-1">
            {[
              { label: 'Total do plano',  value: org?.max_conversations_month ?? 0, dot: 'bg-gray-300' },
              { label: 'Utilizadas',      value: org?.conversations_used ?? 0,      dot: 'bg-emerald-500' },
              { label: 'Restantes',       value: Math.max(0, (org?.max_conversations_month ?? 0) - (org?.conversations_used ?? 0)), dot: 'bg-blue-300' },
            ].map(({ label, value, dot }) => (
              <div key={label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={cn('w-2 h-2 rounded-full', dot)} />
                  <span className="text-xs text-gray-500">{label}</span>
                </div>
                <span className="text-xs font-bold text-gray-800 tabular-nums">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  )
}
